# Nexus Aviation Suite — Development Roadmap

> This document governs the phased build of the Nexus platform prototype through to production-ready MVP.  
> Each phase has explicit entry/exit criteria and deliverables for Claude Code to target.

---

## Phase Overview

```
Phase 0  ──────►  Phase 1  ──────►  Phase 2  ──────►  Phase 3  ──────►  Phase 4
POC Shell         Core Backend      AI Agents          Full Integration   Production
(Done)            & Data Layer      & Prediction       & Role Dashboards   Hardening
```

---

## Phase 0 — POC Frontend Shell ✅ (Complete)

**Tooling:** Google AI Studio (Gemini)  
**Output:** Next.js frontend scaffold with basic UI components and routing

### Deliverables Completed
- [x] Next.js app scaffolded with TailwindCSS
- [x] Basic dashboard layout and navigation
- [x] Gemini API key integration
- [x] Initial airport map placeholder component
- [x] Role selection UI stub

### Exit Criteria
- Running locally on `localhost:3000`
- Component structure established for extension

---

## Phase 1 — Core Backend, Infrastructure & Data Layer

**Target Duration:** 3–4 weeks  
**Language:** TypeScript (NestJS)  
**Goal:** Stand up the full infrastructure stack and real data ingestion pipeline.

### 1.1 — Monorepo & Infrastructure Setup

- [ ] Initialise Nx monorepo workspace
- [ ] Configure `apps/api-gateway`, `apps/ingestor-service` as NestJS applications
- [ ] Add `libs/common` with shared TypeScript interfaces (DTO definitions)
- [ ] `docker-compose.yaml` with all services: PostgreSQL, TimescaleDB, Neo4j, Redis, Kafka, Zookeeper
- [ ] `.env.example` with all required variables documented

### 1.2 — Database Layer

- [ ] PostgreSQL schema via Prisma: users, roles, alerts, audit log
- [ ] TimescaleDB hypertable: `sensor_readings`, `wifi_events`, `flow_metrics`
- [ ] Neo4j seed: airport node graph (terminals, gates, checkpoints, corridors)
- [ ] Redis configuration: hot-cache keys for live metrics and alert states

### 1.3 — Ingestor Service (Kafka Consumers)

- [ ] Kafka topic definitions: `raw.wifi`, `raw.xovis`, `raw.ipsotek`, `raw.aodb`, `raw.fids`
- [ ] Connector stubs for each source (mock adapters for POC)
- [ ] `IngestorAgent` — data normalisation to unified `FlowEvent` schema
- [ ] Write normalised events to TimescaleDB
- [ ] Data anonymisation middleware (strip/hash MAC addresses)

### 1.4 — API Gateway

- [ ] REST endpoints: `/api/v1/health`, `/api/v1/flow`, `/api/v1/alerts`
- [ ] WebSocket gateway (`Socket.io`) for real-time event streaming to frontend
- [ ] JWT authentication middleware
- [ ] Role-based access control (RBAC) guard

### Exit Criteria
- `docker-compose up` starts all infrastructure cleanly
- Ingestor consuming mock Kafka events and writing to TimescaleDB
- API Gateway returning live data to frontend over WebSocket

---

## Phase 2 — AI Agents & Predictive Analytics Engine

**Target Duration:** 4–5 weeks  
**Language:** TypeScript + Python (FastAPI bridge)  
**Goal:** Implement the four core AI agents with working prediction and anomaly detection.

### 2.1 — Prophet Agent (Predictive Queue Forecasting)

- [ ] Python FastAPI microservice in `apps/analytics-engine/prophet/`
- [ ] LSTM model training on synthetic historical queue data (seeded from simulators)
- [ ] REST endpoint: `POST /predict/queue` → returns T-30/60/90 forecasts
- [ ] Integration: NestJS analytics service calls Python bridge via HTTP
- [ ] TimescaleDB query for historical training window

### 2.2 — Sentinel Agent (Anomaly Detection)

- [ ] Flow deviance algorithm: Z-score comparison against rolling 7-day baseline
- [ ] Threshold breach triggers `AnomalyEvent` on Kafka topic `events.anomaly`
- [ ] Computer vision stub: RTSP stream intake from Ipsotek (mock frame input for POC)
- [ ] YOLOv8 integration wrapper (optional for POC — feature-flagged)

### 2.3 — Dispatcher Agent (Scenario Simulation)

- [ ] Monte Carlo simulation engine for 3-scenario resource reallocation
- [ ] Input: current flow state + anomaly event + flight schedule
- [ ] Output: `ScenarioRecommendation[]` with predicted wait-time impact per scenario
- [ ] WebSocket push of recommendations to Operations dashboard role

### 2.4 — Analytics Engine Service (Orchestrator)

- [ ] NestJS service consuming `events.anomaly` and scheduling Prophet calls
- [ ] Coordinator pattern: agents communicate via internal event bus (EventEmitter2)
- [ ] Caching: Redis stores latest predictions per zone (TTL: 60s)

### Exit Criteria
- Prophet producing queue forecasts from synthetic data
- Sentinel detecting seeded anomaly events from simulator
- Dispatcher returning 3 scenario cards to dashboard in real time

---

## Phase 3 — Full Data Integration, Role Dashboards & Visualisation

**Target Duration:** 4–5 weeks  
**Language:** TypeScript (Next.js)  
**Goal:** Complete the frontend with all role-based dashboards, live visualisations, and alert flows.

### 3.1 — Dashboard Components

- [ ] **Command Centre View:** Full airport heatmap using `react-leaflet` or `deck.gl`
- [ ] **Sankey Diagram:** Passenger flow leakage visualisation (`d3.js`)
- [ ] **Queue Forecast Panel:** T-30/60/90 sparklines per checkpoint
- [ ] **Alert Feed:** Live anomaly cards with severity and recommended action
- [ ] **Scenario Simulation Panel:** 3-card comparison view from Dispatcher Agent

### 3.2 — Role-Based Dashboard Routing

- [ ] `/dashboard/operations` — full command centre
- [ ] `/dashboard/security` — security lanes + anomaly alerts
- [ ] `/dashboard/terminal` — gate assignments, dwell times, gate changes
- [ ] `/dashboard/airline` — flight-specific passenger flow and boarding readiness

### 3.3 — Notification Service

- [ ] `apps/notification-service`: consumes `events.anomaly` + `events.threshold`
- [ ] WebSocket push notifications (in-app alerts)
- [ ] Email alert stub (Nodemailer / SendGrid adapter)
- [ ] SMS stub (Twilio adapter, feature-flagged)

### 3.4 — Natural Language Interface (LLM Query)

- [ ] Chat panel component on Operations dashboard
- [ ] Backend: LLM query handler calling Gemini / Azure OpenAI
- [ ] System prompt: airport context + live metrics injected from Redis cache
- [ ] Example queries seeded in UI for operator guidance

### Exit Criteria
- All four role dashboards functioning with live WebSocket data
- Heatmap rendering real-time zone densities
- LLM query panel returning contextual answers using live airport state

---

## Phase 4 — Production Hardening, Security & Performance

**Target Duration:** 3–4 weeks  
**Goal:** Prepare the platform for enterprise deployment and competition submission.

### 4.1 — Security & Compliance

- [ ] Full RBAC audit — ensure no cross-role data leakage
- [ ] Differential privacy implementation on flow aggregation queries
- [ ] API rate limiting and DDoS protection (API Gateway)
- [ ] TLS everywhere; secrets management via Vault or environment injection
- [ ] Data retention policies enforced at TimescaleDB level

### 4.2 — Performance & Resilience

- [ ] Kafka consumer group scaling tests (high-throughput simulation)
- [ ] TimescaleDB query optimisation (continuous aggregates for dashboard queries)
- [ ] Redis cache warming on service startup
- [ ] Circuit breaker pattern on Python bridge (Sentinel + Prophet)
- [ ] Kubernetes deployment manifests (Helm charts) for cloud deployment

### 4.3 — Testing & Simulation

- [ ] `tools/simulators/` — passenger flow stress-test scripts (seed 10k events/min)
- [ ] Unit tests: all NestJS services (Jest)
- [ ] Integration tests: API Gateway end-to-end (Supertest)
- [ ] Frontend: component tests (Vitest + Testing Library)

### 4.4 — Documentation & Submission Artefacts

- [ ] Executive presentation deck (Nexus Suite — RFP Response)
- [ ] System architecture diagram (draw.io / Mermaid)
- [ ] KPI baseline report template
- [ ] Demo script with seeded live data walkthrough

### Exit Criteria
- Platform sustains 10k simulated events/min without degradation
- All security review checklist items passed
- Demo environment stable and reproducible

---

## Technology Decision Log

| Decision | Choice | Rationale |
|---|---|---|
| Frontend framework | Next.js 14 (App Router) | SSR for performance; existing AI Studio scaffold |
| Backend framework | NestJS (TypeScript) | Decorator-based, opinionated structure; monorepo-friendly |
| Monorepo tooling | Nx | Multi-app orchestration; task caching |
| Message broker | Apache Kafka | High-throughput sensor stream handling |
| Time-series DB | TimescaleDB | PostgreSQL-compatible; superior for sensor/flow data |
| Graph DB | Neo4j | Airport topology modelling; shortest-path queries |
| Cache | Redis | Sub-millisecond retrieval for live dashboard metrics |
| ML inference | Python FastAPI bridge | TensorFlow/PyTorch ecosystem; LSTM forecasting |
| CV models | YOLOv8 (feature-flagged) | Proven detection accuracy; Ipsotek integration path |
| LLM interface | Gemini / Azure OpenAI | Natural language operator queries |

---

## KPIs to Demonstrate in Demo

- **Queue wait time reduction:** Target ≥15% improvement vs. baseline simulation
- **Anomaly detection latency:** Alert triggered within ≤10 seconds of event onset
- **Forecast accuracy:** Prophet Agent within ±3 minutes of actual queue time at T‑30
- **Dashboard load time:** First meaningful paint ≤2 seconds on command centre view
- **Concurrent user support:** ≥50 simultaneous dashboard sessions without degradation
