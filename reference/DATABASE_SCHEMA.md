# DATABASE_SCHEMA.md — Nexus Aviation Suite

> Reference document for Claude Code. Defines all database schemas across the polyglot persistence layer.

---

## Persistence Strategy Overview

| Database | Purpose | When to query |
|---|---|---|
| **PostgreSQL** | Users, roles, config, audit, historical reports | Low-frequency reads/writes; structured relational data |
| **TimescaleDB** | Time-series sensor readings, flow metrics, Wi-Fi events | High-frequency writes; time-range queries for charts |
| **Neo4j** | Airport topology graph | Routing, pathfinding, bottleneck analysis |
| **Redis** | Live dashboard cache, session state, forecast cache | Sub-millisecond read access; TTL-based expiry |

---

## PostgreSQL Schemas (Prisma)

### File: `libs/database/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Users & Roles ───────────────────────────────────────────────

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  role         UserRole
  terminalId   String?  // null = all terminals
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  auditLogs    AuditLog[]
}

enum UserRole {
  ADMIN
  OPERATIONS
  SECURITY
  TERMINAL
  AIRLINE
}

// ─── Airport Configuration ───────────────────────────────────────

model Terminal {
  id          String  @id  // e.g. "T1", "T2"
  name        String
  isActive    Boolean @default(true)
  zones       Zone[]
}

model Zone {
  id                String   @id  // e.g. "T1_SECURITY_LANE_1"
  terminalId        String
  terminal          Terminal @relation(fields: [terminalId], references: [id])
  name              String
  type              ZoneType
  capacityMax       Int
  alertThresholdPct Int      @default(80)  // % of capacity to trigger warning
  zoneConfig        ZoneConfig?
}

enum ZoneType {
  SECURITY_LANE
  IMMIGRATION
  BAGGAGE_RECLAIM
  BOARDING_GATE
  CORRIDOR
  CHECK_IN
  LANDSIDE
  RETAIL
}

model ZoneConfig {
  id                    String @id @default(uuid())
  zoneId                String @unique
  zone                  Zone   @relation(fields: [zoneId], references: [id])
  forecastThreshold30   Int    // minutes — trigger Prophet alert at T-30
  forecastThreshold60   Int    // minutes — trigger Prophet alert at T-60
  sentinelZScore        Float  @default(2.5)
  updatedAt             DateTime @updatedAt
}

// ─── Zone Mapping (Wi-Fi AP → Zone) ──────────────────────────────

model ZoneMapping {
  id           String @id @default(uuid())
  apLocationId String @unique  // raw AP location ID from Wi-Fi logs
  zoneId       String
  terminalId   String
}

// ─── Alerts & Audit ──────────────────────────────────────────────

model Alert {
  id           String      @id @default(uuid())
  anomalyId    String      @unique
  zoneId       String
  terminalId   String
  anomalyType  String
  severity     AlertSeverity
  detectedAt   DateTime
  resolvedAt   DateTime?
  resolvedBy   String?
  description  String
  isActive     Boolean     @default(true)
}

enum AlertSeverity {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

model AuditLog {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  action    String
  resource  String
  payload   Json?
  timestamp DateTime @default(now())
}
```

---

## TimescaleDB Schemas

TimescaleDB extends PostgreSQL. Connect on `TIMESCALE_URL`. Run migrations with raw SQL or via Prisma with `timescale` extension.

### `flow_metrics` — Core hypertable

```sql
CREATE TABLE flow_metrics (
  time                 TIMESTAMPTZ NOT NULL,
  zone_id              TEXT        NOT NULL,
  terminal_id          TEXT        NOT NULL,
  source_system        TEXT        NOT NULL,  -- 'WIFI' | 'XOVIS' | 'AODB'
  occupancy_absolute   INTEGER,
  passenger_count_delta INTEGER,
  anonymised_device_id TEXT,                  -- SHA-256 hashed MAC
  flight_ref           TEXT,
  metadata             JSONB
);

SELECT create_hypertable('flow_metrics', 'time');

-- Index for dashboard queries
CREATE INDEX ON flow_metrics (zone_id, time DESC);
CREATE INDEX ON flow_metrics (terminal_id, time DESC);
```

### `wifi_events` — Short-retention Wi-Fi events

```sql
CREATE TABLE wifi_events (
  time                 TIMESTAMPTZ NOT NULL,
  ap_location_id       TEXT        NOT NULL,
  zone_id              TEXT        NOT NULL,
  event_type           TEXT        NOT NULL,  -- 'ASSOCIATION' | 'DISASSOCIATION'
  anonymised_device_id TEXT        NOT NULL,
  rssi                 INTEGER
);

SELECT create_hypertable('wifi_events', 'time');

-- Retention policy: 24 hours
SELECT add_retention_policy('wifi_events', INTERVAL '24 hours');
```

### Continuous Aggregates (pre-compute for dashboard)

```sql
-- Hourly zone occupancy rollup
CREATE MATERIALIZED VIEW zone_hourly_avg
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time) AS bucket,
  zone_id,
  terminal_id,
  AVG(occupancy_absolute)  AS avg_occupancy,
  MAX(occupancy_absolute)  AS max_occupancy,
  SUM(passenger_count_delta) AS total_flow
FROM flow_metrics
WHERE occupancy_absolute IS NOT NULL
GROUP BY bucket, zone_id, terminal_id;

SELECT add_continuous_aggregate_policy('zone_hourly_avg',
  start_offset => INTERVAL '3 hours',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour');
```

---

## Neo4j Graph Schema

### Node Labels

```cypher
// Terminal node
(:Terminal {id: "T1", name: "Terminal 1"})

// Zone node
(:Zone {
  id: "T1_SECURITY_LANE_1",
  name: "Security Lane 1",
  type: "SECURITY_LANE",
  terminalId: "T1",
  capacityMax: 60,
  x: 320,     // map coordinate
  y: 180
})

// Checkpoint node (key decision/branching points)
(:Checkpoint {
  id: "T1_POST_SECURITY",
  name: "Post-Security T1",
  terminalId: "T1"
})
```

### Relationship Types

```cypher
// Zone to Zone connection (passenger can walk from A to B)
(:Zone)-[:CONNECTS_TO {
  walkTimeSeconds: 90,
  distanceMetres: 120,
  isActive: true
}]->(:Zone)

// Zone belongs to Terminal
(:Zone)-[:IN_TERMINAL]->(:Terminal)

// Checkpoint is part of Zone
(:Checkpoint)-[:PART_OF]->(:Zone)
```

### Seed Script Location

`tools/simulators/neo4j-seed.cypher` — seeds a sample 2-terminal airport graph for POC.

### Key Queries

```cypher
-- Find bottleneck zones (highest centrality)
CALL gds.betweenness.stream('airportGraph')
YIELD nodeId, score
RETURN gds.util.asNode(nodeId).id AS zoneId, score
ORDER BY score DESC LIMIT 10;

-- Shortest path from Check-in to Gate A12
MATCH (start:Zone {id: "T1_CHECKIN_A"}), (end:Zone {id: "T1_GATE_A12"})
CALL gds.shortestPath.dijkstra.stream('airportGraph', {
  sourceNode: start,
  targetNode: end,
  relationshipWeightProperty: 'walkTimeSeconds'
})
YIELD path RETURN path;
```

---

## Redis Key Schema

All keys follow a namespaced pattern: `nexus:{entity}:{identifier}`.

| Key Pattern | Type | TTL | Content |
|---|---|---|---|
| `nexus:occupancy:{zoneId}` | String (JSON) | 30s | `{occupancy, updatedAt}` |
| `nexus:forecast:{zoneId}` | String (JSON) | 60s | `QueueForecast` object |
| `nexus:baseline:{zoneId}` | String (JSON) | 7d | `{mean, std, windowDays}` |
| `nexus:alerts:active` | List (JSON) | No TTL | Active `AnomalyEvent[]` |
| `nexus:recommendations:latest` | String (JSON) | 5min | Latest `ScenarioRecommendation` |
| `nexus:flight-schedule:next3h` | String (JSON) | 5min | AODB flights (next 3 hours) |
| `nexus:session:{userId}` | String | 24h | JWT session data |

### Redis Write Patterns

- **Ingestor Agent:** `SET nexus:occupancy:{zoneId}` on every `FlowEvent` (upsert)
- **Prophet Agent:** `SET nexus:forecast:{zoneId}` after each prediction cycle
- **Analytics Scheduler (nightly):** `SET nexus:baseline:{zoneId}` after 7-day stats computation
- **Sentinel Agent:** `LPUSH nexus:alerts:active` on anomaly; trim list to 100 items
- **AODB Connector:** `SET nexus:flight-schedule:next3h` every 5 minutes

---

## Migration Strategy

- **PostgreSQL:** Prisma Migrate (`npx prisma migrate dev`)
- **TimescaleDB:** Raw SQL migrations in `libs/database/migrations/timescale/`
- **Neo4j:** Cypher seed scripts in `tools/simulators/`
- **Redis:** Schema is convention-based; no migration required

### Initialisation Order (docker-compose / K8s init containers)
1. PostgreSQL + Prisma migrate
2. TimescaleDB hypertable creation + retention policies
3. Neo4j seed script
4. Redis (stateless — no init required)
5. Kafka topic creation script
