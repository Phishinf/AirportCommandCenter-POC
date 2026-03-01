# Nexus Aviation Suite

> **Unified Passenger Flow Orchestration Platform (UPFOP)**
> Real-time AI-driven airport operations intelligence — from curbside to gate.

---

## What Is Nexus?

Nexus is an enterprise-grade platform that gives airport operations teams a single, authoritative view of passenger movement across the entire terminal ecosystem. It replaces fragmented, siloed data streams — Wi-Fi logs, XOVIS sensors, camera analytics, flight databases — with a unified intelligence layer that enables:

- **Predictive congestion management** before queues form
- **Automated anomaly alerts** within seconds of an event onset
- **AI-assisted scenario simulation** for resource reallocation decisions
- **Natural language querying** of live airport state via Gemini LLM

The platform is built as a cloud-native microservices monorepo targeting enterprise airport deployments, with a full mock-data mode for local development and demonstration.

---

## Features

| Feature | Description |
|---|---|
| **Live Zone Heatmap** | Real-time occupancy per zone rendered as a colour-coded airport map |
| **Passenger Flow Dashboard** | Sankey-style flow visualisation showing movement between terminals, gates, and checkpoints |
| **Queue Forecasting** | T-30 / T-60 predictions per security lane, immigration, and boarding gate |
| **Anomaly Detection (Sentinel)** | Z-score–based detection of crowd build-ups and flow disruptions; alert fired in ≤10 s |
| **Scenario Simulation (Dispatcher)** | Monte Carlo "what-if" scenarios — e.g. impact of a 40-min flight delay on Security T1 |
| **Role-Based Access** | Tailored dashboards for Operations, Security, Terminal Management, and Airline Coordination |
| **Alert Feed** | Severity-graded anomaly cards with recommended actions and one-click resolution |
| **Natural Language Query** | LLM chat panel backed by live Redis metrics — ask plain-English questions about airport state |
| **WebSocket Push** | All live data streams pushed to connected clients via Socket.io; no polling required |
| **Mock Sensor Mode** | `CONNECTOR_MODE=mock` generates synthetic Wi-Fi, XOVIS, and AODB events for offline demos |

---

## Architecture

Nexus is structured as a **three-tier, event-driven microservices monorepo**.

```
┌─────────────────────────────────────────────────────────────────┐
│  EDGE TIER  (Airport Sensor Network)                            │
│  Wi-Fi APs · XOVIS Sensors · Ipsotek Cameras · AODB · FIDS      │
└───────────────────────────┬─────────────────────────────────────┘
                            │  Kafka topics: raw.*
┌───────────────────────────▼─────────────────────────────────────┐
│  PROCESSING TIER  (Docker / On-Prem)                            │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐                     │
│  │ Ingestor Service │  │ Analytics Engine  │                    │
│  │ (port 4001)      │  │ (port 4002)       │                    │
│  │                  │  │                  │                     │
│  │ • Kafka consumer │  │ • Sentinel Agent  │                    │
│  │ • Data normalise │  │ • Prophet Agent   │                    │
│  │ • TimescaleDB wr │  │ • Dispatcher Agent│                    │
│  └──────────────────┘  └──────────────────┘                     │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────────────────────────┐ │
│  │ Notification Svc │  │  Infrastructure                      │ │
│  │ (port 4003)      │  │  TimescaleDB :5433 (sensor data)     │ │
│  │                  │  │  Neo4j       :7474 (zone topology)   │ │
│  │ • Kafka consumer │  │  Redis       :6379 (live cache)      │ │
│  │ • WebSocket push │  │  Kafka       :9092 (event bus)       │ │
│  └──────────────────┘  └──────────────────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────────┘
                            │  REST + WebSocket
┌───────────────────────────▼─────────────────────────────────────┐
│  PRESENTATION TIER                                              │
│                                                                 │
│  API Gateway (NestJS :4000)   ←→   Frontend POC (Vite :3000)    │
│  JWT auth · RBAC · Socket.io                                    │
│  Supabase (PostgreSQL) — users, zones, alerts, audit logs       │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
Sensor / Mock Adapter
  └─► Kafka (raw.wifi / raw.xovis / raw.aodb)
        └─► Ingestor Agent — normalise → FlowEvent
              ├─► TimescaleDB  (flow_metrics hypertable)
              ├─► Redis        (nexus:occupancy:{zoneId})
              └─► Kafka (events.flow)
                    ├─► Sentinel Agent — anomaly detection
                    │     └─► Kafka (events.anomaly) → Notification Service → WebSocket
                    └─► Prophet Agent — queue forecasting
                          └─► Redis (nexus:forecast:{zoneId})
```

### Services & Ports

| Service | Port | Role |
|---|---|---|
| Frontend POC | 3000 | Vite + React dashboard (Phase 0) |
| API Gateway | 4000 | REST API + Socket.io WebSocket hub |
| Ingestor Service | 4001 | Kafka consumer → TimescaleDB + Redis |
| Analytics Engine | 4002 | Sentinel + Prophet + Dispatcher agents |
| Notification Service | 4003 | Kafka consumer → WebSocket alert push |
| TimescaleDB | 5433 | Time-series sensor and flow data |
| Neo4j | 7474 / 7687 | Airport zone topology graph |
| Redis | 6379 | Live occupancy cache and forecasts |
| Kafka | 9092 | Async event bus between services |
| Supabase (PostgreSQL) | cloud | Users, terminals, zones, alerts, audit logs |

### Databases

| Store | What lives there |
|---|---|
| **Supabase (PostgreSQL)** | `users`, `terminals`, `zones`, `zone_configs`, `zone_mappings`, `alerts`, `audit_logs` — managed via Prisma |
| **TimescaleDB** | `flow_metrics` and `wifi_events` hypertables — raw time-series sensor readings |
| **Neo4j** | Airport zone graph: 2 terminals, 25 zones, `CONNECTS_TO` relationships for path queries |
| **Redis** | `nexus:occupancy:{zoneId}`, `nexus:forecast:{zoneId}`, `nexus:alerts:active` — sub-millisecond reads for dashboard |

---

## Repository Structure

```
AirportCommandCenter/
│
├── apps/
│   ├── api-gateway/          # NestJS — REST + WebSocket entry point (port 4000)
│   ├── ingestor-service/     # NestJS — Kafka consumers + mock sensor adapters (port 4001)
│   ├── analytics-engine/     # NestJS — AI agents: Sentinel, Prophet, Dispatcher (port 4002)
│   └── notification-service/ # NestJS — alert dispatch to WebSocket clients (port 4003)
│
├── libs/
│   ├── common/src/           # Shared TypeScript interfaces, DTOs, enums
│   └── database/src/
│       ├── prisma/           # Prisma schema + seed.ts (Supabase/PostgreSQL)
│       └── timescale/        # TimescaleDB hypertable migration SQL
│
├── tools/
│   └── simulators/           # Flow event generator, Neo4j seed Cypher
│
├── src/                      # Phase 0 — Vite + React frontend POC
├── reference/                # Architecture docs (ARCHITECTURE.md, API_CONTRACTS.md, …)
├── docker-compose.yaml       # TimescaleDB, Neo4j, Redis, Kafka, Zookeeper
├── start.sh                  # One-command local dev launcher
├── .env.example              # Environment variable template
└── README.md
```

---

## Running Locally

### Prerequisites

- **Node.js** ≥ 20
- **Docker** + Docker Compose (for TimescaleDB, Neo4j, Redis, Kafka)
- A **Supabase** project (free tier works) — replaces the local PostgreSQL

### 1. Clone and configure environment

```bash
git clone https://github.com/Phishinf/AirportCommandCenter.git
cd AirportCommandCenter
cp .env.example .env.local
```

Open `.env.local` and fill in your Supabase connection strings (from **Supabase Dashboard → Settings → Database → Connection string**):

```env
# Transaction pooler — used by the app at runtime
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-1-[region].pooler.supabase.com:6543/postgres?pgbouncer=true

# Session pooler — used by Prisma migrations only
DIRECT_URL=postgresql://postgres.[project-ref]:[password]@aws-1-[region].pooler.supabase.com:5432/postgres
```

> **Note:** If your password contains special characters (e.g. `@`), percent-encode them — `@` becomes `%40`.

All other values (`TIMESCALE_URL`, `REDIS_URL`, `NEO4J_*`, `KAFKA_BROKER`) are pre-filled with Docker defaults and work out of the box.

### 2. Run the automated setup script

```bash
chmod +x start.sh
./start.sh
```

The script will:

1. Check prerequisites (Docker, Node.js)
2. Start Docker infrastructure (TimescaleDB, Neo4j, Redis, Kafka)
3. Wait for each service to become healthy
4. Install Node.js dependencies for each NestJS service
5. Push the Prisma schema to Supabase and run database seed
6. Seed the Neo4j airport zone graph
7. Launch API Gateway and Ingestor Service (in tmux if available, otherwise print manual commands)

### 3. Start the frontend POC

In a separate terminal:

```bash
npm install       # root — installs Vite/React frontend deps
npm run dev       # starts Vite dev server on http://localhost:3000
```

### Manual Service Startup (without tmux)

If you prefer to start services individually:

```bash
# Terminal 1 — API Gateway
cd apps/api-gateway && npm install && npm run start:dev

# Terminal 2 — Ingestor Service
cd apps/ingestor-service && npm install && npm run start:dev

# Terminal 3 — Analytics Engine (optional)
cd apps/analytics-engine && npm install && npm run start:dev

# Terminal 4 — Frontend POC
npm run dev
```

### Verify

| URL | What you'll see |
|---|---|
| `http://localhost:3000` | React frontend dashboard |
| `http://localhost:4000/api/v1/health` | API Gateway health check |
| `http://localhost:7474` | Neo4j Browser (user: `neo4j`, password: `nexus_graph`) |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase transaction pooler URL (port 6543, `?pgbouncer=true`) |
| `DIRECT_URL` | Yes | Supabase session pooler URL (port 5432) — Prisma migrations only |
| `TIMESCALE_URL` | Yes | TimescaleDB connection string (Docker default: `localhost:5433`) |
| `NEO4J_URI` | Yes | Neo4j Bolt URI (Docker default: `bolt://localhost:7687`) |
| `NEO4J_USER` / `NEO4J_PASSWORD` | Yes | Neo4j credentials |
| `REDIS_URL` | Yes | Redis connection string (Docker default: `localhost:6379`) |
| `KAFKA_BROKER` | Yes | Kafka broker address (Docker default: `localhost:9092`) |
| `JWT_SECRET` | Yes | Secret for signing JWT tokens |
| `GEMINI_API_KEY` | Optional | Google Gemini API key — enables the LLM natural language query panel |
| `CONNECTOR_MODE` | Optional | `mock` (default) for synthetic sensor data; `live` for real hardware |

---

## Seed Users

The database seed creates the following test accounts (password: `nexus2024!`):

| Email | Role | Access |
|---|---|---|
| `admin@nexus.airport` | ADMIN | Full platform access |
| `ops@nexus.airport` | OPERATIONS | All dashboards + scenario simulation |
| `security@nexus.airport` | SECURITY | Security lanes + anomaly alerts (T1) |
| `terminal@nexus.airport` | TERMINAL | Terminal management view (T1) |
| `airline@nexus.airport` | AIRLINE | Flight-specific passenger flow |

---

## AI Agents

| Agent | Technology | Function |
|---|---|---|
| **Ingestor Agent** | TypeScript / NestJS | Normalises raw sensor events into a unified `FlowEvent` schema; writes to TimescaleDB + Redis |
| **Sentinel Agent** | Z-score algorithm | Detects crowd build-ups and flow disruptions against a rolling baseline; fires `AnomalyEvent` to Kafka |
| **Prophet Agent** | LSTM / Python FastAPI | Forecasts queue build-up at T-30 / T-60 per zone; stores predictions in Redis |
| **Dispatcher Agent** | Monte Carlo simulation | Generates 3-scenario resource reallocation recommendations when an anomaly is detected |

---

## Key API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/login` | Authenticate and receive JWT |
| `GET` | `/api/v1/flow/live` | Live zone occupancy from Redis |
| `GET` | `/api/v1/flow/history` | Historical flow data from TimescaleDB |
| `GET` | `/api/v1/flow/heatmap` | Zone occupancy for heatmap rendering |
| `GET` | `/api/v1/flow/forecast` | Prophet queue forecasts from Redis |
| `GET` | `/api/v1/alerts/active` | Active anomaly alerts |
| `PATCH` | `/api/v1/alerts/:id/resolve` | Resolve an alert |
| `GET` | `/api/v1/recommendations/latest` | Latest Dispatcher scenario cards |
| `GET` | `/api/v1/graph/topology` | Neo4j airport zone graph |
| `POST` | `/api/v1/llm/query` | Natural language query via Gemini |

**WebSocket events** (Socket.io): `flow:update`, `alert:new`, `forecast:update`, `recommendation:new`

---

## Reference Documentation

| Document | Purpose |
|---|---|
| [`reference/ARCHITECTURE.md`](./reference/ARCHITECTURE.md) | Full system architecture, stack decisions, deployment topology |
| [`reference/AI_AGENTS.md`](./reference/AI_AGENTS.md) | Agent contracts, inputs, outputs, trigger conditions |
| [`reference/DATA_FLOW.md`](./reference/DATA_FLOW.md) | End-to-end data pipeline from ingestion to decision |
| [`reference/DATABASE_SCHEMA.md`](./reference/DATABASE_SCHEMA.md) | Polyglot persistence schemas (Supabase, TimescaleDB, Neo4j, Redis) |
| [`reference/API_CONTRACTS.md`](./reference/API_CONTRACTS.md) | REST and WebSocket API interface definitions |
| [`reference/DevelopRoadMap.md`](./reference/DevelopRoadMap.md) | Phased build plan from POC to production |

---

## Development Phases

| Phase | Status | Scope |
|---|---|---|
| **Phase 0** | ✅ Complete | React/Vite frontend POC shell |
| **Phase 1** | ✅ Complete | NestJS microservices, Kafka pipeline, Supabase + TimescaleDB + Neo4j + Redis data layer |
| **Phase 2** | In progress | Python LSTM forecasting, Sentinel Kafka wiring, Dispatcher Monte Carlo |
| **Phase 3** | Planned | Full role-based dashboards, live heatmap, LLM query panel |
| **Phase 4** | Planned | Production hardening, Kubernetes manifests, performance testing |

---

## Privacy & Compliance

- Passenger tracking is **anonymised at ingestion** — MAC addresses are SHA-256 hashed with a daily rotating salt; no PII is stored.
- Differential privacy noise is applied to aggregate flow counts exposed via the API.
- RBAC enforced at the API Gateway — no cross-role data leakage.
- Designed to operate within airport IT governance, GDPR, and local data protection frameworks.

---

## License

Proprietary — Internal use only. Not for public distribution.
