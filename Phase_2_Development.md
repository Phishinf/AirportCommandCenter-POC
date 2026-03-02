# Phase 2 Development — Nexus Aviation Suite

## Introduction

Phase 2 of the Nexus Aviation Suite moves the platform from a functional proof-of-concept into a production-grade, event-driven intelligence layer. Where Phase 1 established the data infrastructure and API contracts, Phase 2 wires the AI agents into the live Kafka pipeline, completes the anomaly-to-recommendation feedback loop, and prepares the entire system for cloud deployment. This document covers the architectural review of Phase 1, the specific problems Phase 2 addresses, the rationale for each decision made, and the full production deployment plan targeting Railway, Vercel, Upstash, Timescale Cloud, and Neo4j AuraDB.

---

## Phase 1 Review

### Architecture

Phase 1 delivered a multi-service NestJS monorepo under `apps/`, backed by four distinct data stores and connected through a Kafka message bus. The system was designed around a clean separation of concerns: data ingestion, analytics, notifications, and API access are each handled by dedicated services that communicate exclusively through Kafka topics and a shared Redis cache.

```
┌─────────────────────────────────────────────────────────────┐
│                    Nexus Aviation Suite                     │
│                                                             │
│  ┌──────────────┐    Kafka: events.flow                     │
│  │  Ingestor    │ ──────────────────────────────────────┐   │
│  │  Service     │                                       │   │
│  │  (port 4001) │ ──► TimescaleDB  ──► Redis cache      │   │
│  └──────────────┘                                       ▼   │
│                                                             │
│  ┌──────────────┐    Kafka: events.anomaly            ┌────┐| 
│  │  Analytics   │ ──────────────────────────────────► │    ││
│  │  Engine      │    Kafka: events.threshold          │ N  |│
│  │  (port 4002) │ ──────────────────────────────────► │ o  ││
│  └──────────────┘                                     │ t  ││
│                                                       │ i  ││
│  ┌──────────────┐    REST / WebSocket                 │ f  ││
│  │  API Gateway │ ◄── Redis reads ◄────────────────── │ y  ││
│  │  (port 4000) │     PostgreSQL                      │    ││
│  └──────────────┘     Neo4j                           │ S  ││
│         ▲                                             │ v  ││
│         │             HTTP POST                       │ c  ││
│  ┌──────┴───────┐ ◄─────────────────────────────────-─┤    ││
│  │   Frontend   │                                     └────┘│
│  │   (Vercel)   │                               (port 4003) │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
```

The shared type library (`libs/common`) defines the canonical interfaces (`FlowEvent`, `AnomalyEvent`, `QueueForecast`, `ScenarioRecommendation`) used across all services, ensuring a single source of truth for the data contracts that flow through Kafka.

### Features Delivered in Phase 1

**Ingestor Service** receives raw sensor events (WiFi, XOVIS, AODB) from mock connectors, normalises them into `FlowEvent` objects, writes time-series data to TimescaleDB (`flow_metrics` hypertable), updates the Redis occupancy cache (`nexus:occupancy:{zoneId}`), and publishes to `events.flow`. In mock mode, the service simulates realistic passenger flow across 25 airport zones with configurable peak/off-peak patterns.

**Analytics Engine** was built with three agents as injectable NestJS services:
- **Sentinel** — Z-score anomaly detection comparing live occupancy against a 7-day rolling baseline stored in Redis.
- **Prophet** — T-30/60/90 queue wait-time forecasting, with a fallback linear extrapolation for POC mode and an HTTP bridge for a future Python LSTM service.
- **Dispatcher** — Monte Carlo scenario simulation generating three ranked resource-reallocation options in response to anomaly events.

All three agents were fully implemented with correct business logic. However, they were not connected to the Kafka bus — they existed as isolated services with no trigger mechanism.

**API Gateway** exposes the full REST API (`/api/v1/...`) and a WebSocket gateway via Socket.io. It reads from Redis for live occupancy (`/flow/live`), forecasts (`/flow/forecast`), and active alerts (`/alerts/active`). It reads from TimescaleDB for historical data (`/flow/history`), from Neo4j for the airport topology graph (`/graph/topology`), and from Supabase PostgreSQL for user auth and alert persistence. A Gemini-powered natural language endpoint (`/llm/query`) allows operators to query the system in plain English.

**Notification Service** was the one fully-wired component from Phase 1. It consumes `events.anomaly` and `events.threshold` from Kafka and forwards them via HTTP POST to the API Gateway's internal notify endpoint, which then broadcasts via WebSocket.

**Databases**:
- PostgreSQL (Supabase): users, terminals, zones, alerts, audit logs, zone configuration
- TimescaleDB: `flow_metrics` and `wifi_events` hypertables for time-series sensor data
- Neo4j: airport zone graph (2 terminals, 25 zones, `CONNECTS_TO` relationships with walk times)
- Redis: live occupancy cache, forecast cache, active alerts list, recommendations cache

**Seed data and tooling**: A Prisma seed populates users, zones, and terminal configuration. A TimescaleDB SQL migration creates the hypertables. A Neo4j Cypher seed builds the full airport topology. A flow event generator produces 7 days of synthetic historical data for Prophet training.

---

## Problems Identified at the End of Phase 1

Despite solid individual implementations, the analytics pipeline had a critical structural gap: **the three analytics agents had no way to be triggered**. The data bus was active — the ingestor was publishing to `events.flow`, the notification service was consuming downstream topics — but the analytics engine had no Kafka consumers. Events flowed past it without being processed.

The secondary issues were:

- The `dispatcher.agent.ts` file contained a broken relative import (`../../../../../../libs/common/src/...`) — six directory levels up, which resolves to the filesystem root and would cause a compile error.
- The analytics-engine `tsconfig.json` had no path aliases for `@nexus/common`, unlike the api-gateway which already had them correctly configured.
- The `DispatcherAgent` had no Kafka producer — its recommendations were written to Redis only, with no downstream broadcast to `events.recommendation`.
- No Dockerfile in the monorepo correctly handled the `libs/` shared code — the api-gateway Dockerfile attempted a `COPY ../../libs/` which Docker rejects, and all others simply omitted it.
- No production deployment configuration existed for any cloud platform.

---

## Phase 2 — Issues Addressed

### Step 1 — Kafka Consumer Wiring (Completed)

The core problem was that the analytics agents existed as a set of pure functions with no entry points. The solution was a new `KafkaConsumerService` injected with all three agents, subscribing to three topics and routing each message to the correct handler.

**Design decisions:**

**Parallel execution for `events.flow`**: When a flow event arrives, Sentinel and Prophet are called with `Promise.all()`. The two operations are entirely independent — Sentinel reads a baseline from Redis and optionally emits to `events.anomaly`, while Prophet generates a forecast and optionally emits to `events.threshold`. There is no reason to serialise them, and doing so would add unnecessary latency to every sensor event.

**Threshold-to-anomaly bridge for Dispatcher**: The Dispatcher accepts `AnomalyEvent` objects, but `events.threshold` carries a `ThresholdBreachEvent` which has a different shape (no `anomalyId`, no `severity`). Rather than modify the Dispatcher's interface (which would break the notification service's downstream handling), a private `bridgeThresholdToAnomaly()` method adapts the breach into an `AnomalyEvent` with `anomalyType: 'THRESHOLD_BREACH'` and a severity derived from how far the predicted wait time exceeds the threshold. This keeps the Dispatcher clean and single-purpose.

**Module hierarchy**: The `KafkaConsumerModule` imports all three agent modules (`SentinelAgentModule`, `ProphetAgentModule`, `DispatcherAgentModule`) and provides `KafkaConsumerService`. The root `AppModule` now imports only `KafkaConsumerModule`, removing the direct agent module imports. This gives the consumer service natural access to all agents via NestJS dependency injection without any circular dependencies.

**Graceful startup**: Kafka startup failure is caught and logged as a warning rather than crashing the service. This matches the pattern in the notification service and is important in production where Kafka and the analytics engine may start in any order.

**Fixing the tsconfig**: The analytics-engine tsconfig was updated with `@nexus/common` and `@nexus/database` path aliases matching the api-gateway pattern. The `rootDir: "./src"` constraint was removed because the `@nexus/common` alias resolves to files in `libs/` — outside `src/` — which TypeScript's rootDir check would reject. With rootDir removed, TypeScript infers the root from the common ancestor of all compiled files, which shifts the output to `dist/apps/analytics-engine/src/main.js`. This path change must be reflected in the start script and Dockerfile CMD.

**Fixing the broken import**: `dispatcher.agent.ts` was changed from the broken six-level relative path to `@nexus/common`, which is now resolvable via the tsconfig path alias. The import is type-only (both `AnomalyEvent` and `ScenarioRecommendation` are interfaces), so TypeScript's import elision removes the require from compiled output — no runtime resolution of `@nexus/common` is needed.

---

## Step 2 (Planned) — Dispatcher Kafka Producer

The Dispatcher currently writes recommendations only to Redis (`nexus:recommendations:latest`). It should also publish to `events.recommendation` so the notification service can broadcast new scenarios to connected clients in real time, rather than having the frontend poll `/api/v1/recommendations/latest`. This requires adding a Kafka producer to `DispatcherAgentModule` and a send call in `generateScenarios()`.

---

## Step 3 (Planned) — Baseline Compute Scheduler

Sentinel's Z-score algorithm requires `nexus:baseline:{zoneId}` to exist in Redis. Without it, `analyseFlowEvent()` returns immediately without processing. The baseline (mean and standard deviation of occupancy over the last 7 days) must be computed from TimescaleDB and written to Redis on a scheduled basis. This is implemented as a daily `@Cron()` job in a new `BaselineComputeModule`, which queries TimescaleDB using a window aggregate and writes the results to Redis with a 25-hour TTL.

---

## Step 4 (Planned) — Python LSTM FastAPI Service

Prophet's HTTP bridge (`callPythonBridge()`) is already implemented — it sends a POST to `PROPHET_URL/predict/queue` and falls back to linear extrapolation if no URL is configured or if the call fails. Step 4 creates the Python service at `apps/analytics-engine/prophet/` as a FastAPI application with a two-layer LSTM model trained on the last 7 days of `flow_metrics` from TimescaleDB. The model outputs T-30, T-60, and T-90 predicted wait times with calibrated confidence intervals. Training runs on startup and on a nightly schedule.

---

## Full Production Deployment Plan

### Rationale for Platform Choices

**Railway over Render for NestJS services**: Railway supports setting the Docker build context to the repository root independently of the Dockerfile path. This is essential for this monorepo because every service needs access to `libs/` during compilation, but Docker does not permit `COPY ../../libs/` when the build context is the service directory. Railway's "Root Directory = `/`" with "Dockerfile Path = `apps/[service]/Dockerfile`" solves this cleanly. Render supports a similar configuration but its free tier spins down services after inactivity, which terminates Kafka consumers and breaks the event pipeline.

**Upstash for Kafka and Redis**: Upstash provides serverless Kafka and Redis on the same platform, with a generous free tier for both. The key constraint is that Upstash Kafka requires SASL/SCRAM-SHA-256 authentication — all five Kafka clients (three producers in sentinel-agent.module, prophet-agent.module, kafka.module; two consumers in analytics-engine and notification-service) need SSL and SASL config added. The implementation guards SASL config behind the presence of `KAFKA_SASL_USERNAME`, so local development without credentials continues to work.

**Timescale Cloud for TimescaleDB**: TimescaleDB's hypertable partitioning is not available on plain PostgreSQL hosts. Supabase uses standard PostgreSQL and cannot host hypertables. Timescale Cloud is the managed equivalent of the local Docker container and accepts the same SQL migration script.

**Neo4j AuraDB**: The airport zone graph (25 zones, ~40 relationships) fits comfortably within AuraDB's free tier (200,000 nodes). The existing `neo4j-seed.cypher` file runs unchanged against AuraDB after replacing the connection details.

**Vercel for the frontend**: The Vite + React SPA at the project root builds to a static `dist/` directory. Vercel's framework preset for Vite handles the build automatically. The `server.ts` Express file is local-only development scaffolding and is not deployed. The SPA must reference the Railway API Gateway URL via `VITE_API_URL` and `VITE_WS_URL` environment variables rather than hardcoded localhost addresses.

---

### Technical Stack Summary

| Layer | Technology | Host | Purpose |
|-------|-----------|------|---------|
| Frontend | Vite + React 19, Socket.io client, Recharts, Three.js | Vercel | Operator dashboard, heatmap, real-time alerts |
| API Gateway | NestJS 10, JWT, Socket.io, Prisma, ioredis, neo4j-driver | Railway | REST API + WebSocket hub |
| Ingestor | NestJS 10, KafkaJS, ioredis, pg | Railway | Sensor ingestion → TimescaleDB + Redis + Kafka |
| Analytics Engine | NestJS 10, KafkaJS, ioredis | Railway | Sentinel + Prophet + Dispatcher agents |
| Notification Service | NestJS 10, KafkaJS | Railway | Kafka consumer → WebSocket push |
| Message Bus | Kafka (KafkaJS 2.2) | Upstash | `events.flow`, `events.anomaly`, `events.threshold`, `events.recommendation` |
| Live Cache | Redis 7 (ioredis 5) | Upstash | Zone occupancy, forecasts, alerts, recommendations |
| Relational DB | PostgreSQL 15 (Prisma) | Supabase | Users, terminals, zones, alerts, audit logs |
| Time-Series DB | TimescaleDB (hypertables) | Timescale Cloud | `flow_metrics`, `wifi_events` |
| Graph DB | Neo4j 5 (Cypher) | Neo4j AuraDB | Airport zone topology, routing, walk-time graph |
| LLM | Gemini 2.0 Flash | Google AI | Natural language operational queries |
| Auth | JWT (HS256), bcrypt | API Gateway | Role-based access (ADMIN, OPERATIONS, SECURITY, TERMINAL, AIRLINE) |

---

### Docker Build Strategy

All Dockerfiles follow the same multi-stage pattern with the **repository root as build context**:

```
Stage 1 (builder):
  WORKDIR /app
  COPY libs/                   ← shared type library (required for @nexus/* path aliases)
  COPY apps/[service]/...      ← service-specific source
  WORKDIR /app/apps/[service]
  RUN npm install && npm run build

Stage 2 (production):
  COPY dist/, node_modules/, package.json from builder
  ENV NODE_ENV=production
  EXPOSE [port]
  CMD ["node", "dist/main.js"]
```

Exception: analytics-engine CMD is `dist/apps/analytics-engine/src/main.js` because its tsconfig infers a broader rootDir (repo root) due to the `@nexus/common` path alias resolving into `libs/`.

---

### Railway Service Configuration

Each service in Railway is configured with:
- **Root Directory**: `/` (repo root — enables root build context for Docker)
- **Dockerfile Path**: `apps/[service-name]/Dockerfile`
- **Watch Paths**: `apps/[service-name]/**`, `libs/**`
- Environment variables injected via Railway dashboard (no `.env` files in production)

The `.env.local` loading in `main.ts` uses dotenv which silently returns `{ error }` when the file is absent — no change needed for production containers.

---

### Kafka SASL Configuration (Upstash)

All five Kafka client initialisations must conditionally add SASL config:

```typescript
const kafka = new Kafka({
  clientId: '...',
  brokers: [process.env.KAFKA_BROKER ?? 'localhost:9092'],
  retry: { retries: 5 },
  ...(process.env.KAFKA_SASL_USERNAME && {
    ssl: true,
    sasl: {
      mechanism: 'scram-sha-256',
      username: process.env.KAFKA_SASL_USERNAME,
      password: process.env.KAFKA_SASL_PASSWORD!,
    },
  }),
});
```

Required new env vars (all services): `KAFKA_SASL_USERNAME`, `KAFKA_SASL_PASSWORD`

---

### Environment Variables Reference

**All services share:**
```
NODE_ENV=production
KAFKA_BROKER=<upstash bootstrap server>
KAFKA_SASL_USERNAME=<upstash sasl username>
KAFKA_SASL_PASSWORD=<upstash sasl password>
```

**API Gateway additionally:**
```
DATABASE_URL=<supabase pooler url>
DIRECT_URL=<supabase direct url>
TIMESCALE_URL=<timescale cloud url>?sslmode=require
REDIS_URL=rediss://<upstash redis url>
NEO4J_URI=neo4j+s://<auradb bolt host>
NEO4J_USER=neo4j
NEO4J_PASSWORD=<auradb password>
JWT_SECRET=<256-bit random string>
JWT_EXPIRES_IN=8h
CORS_ORIGIN=https://<your-app>.vercel.app
GEMINI_API_KEY=<key>
```

**Ingestor additionally:**
```
TIMESCALE_URL=<timescale cloud url>?sslmode=require
REDIS_URL=rediss://<upstash redis url>
CONNECTOR_MODE=mock
KAFKA_GROUP_ID_INGESTOR=nexus-ingestor-group
```

**Analytics Engine additionally:**
```
REDIS_URL=rediss://<upstash redis url>
KAFKA_GROUP_ID_ANALYTICS=nexus-analytics-group
```

**Notification Service additionally:**
```
API_GATEWAY_URL=https://<api-gateway-railway-url>
KAFKA_GROUP_ID_NOTIFICATION=nexus-notification-group
```

**Vercel (frontend):**
```
VITE_API_URL=https://<api-gateway-railway-url>
VITE_WS_URL=https://<api-gateway-railway-url>
GEMINI_API_KEY=<key>
```

---

### Post-Deploy Checklist

1. Run Prisma seed against Supabase: `npx ts-node libs/database/src/prisma/seed.ts`
2. Run TimescaleDB migration: `psql $TIMESCALE_URL -f libs/database/src/timescale/migrations/001_init_hypertables.sql`
3. Run Neo4j seed: `npx cypher-shell -a $NEO4J_URI -u neo4j -p $NEO4J_PASSWORD -f tools/simulators/neo4j-seed.cypher`
4. Create Kafka topics in Upstash dashboard: `events.flow`, `events.anomaly`, `events.threshold`, `events.recommendation`
5. Verify Railway logs: each service logs `Running on http://0.0.0.0:[PORT]` within 60s of deploy
6. Smoke test: `GET https://<api-gateway>/api/v1/flow/live` → 200 with zone snapshot
7. Auth test: `POST /api/v1/auth/login` with `ops@nexus.airport` / `nexus2024!` → JWT returned
8. WebSocket test: connect to API Gateway URL with Socket.io client → `flow:update` events arrive every 5s

---

*Document generated: 2026-03-02 | Nexus Aviation Suite v2.0*
