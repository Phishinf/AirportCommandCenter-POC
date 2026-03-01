# Nexus Aviation Suite — Unified Passenger Flow Orchestration Platform (UPFOP)

> **Status:** Prototype (POC Phase 1 — Frontend scaffolded via Google AI Studio)**  
> **Stack:** TypeScript · Next.js · NestJS · Kafka · PostgreSQL · TimescaleDB · Neo4j · Redis  
> **Architecture:** Cloud-Native Hybrid · Multi-Agent AI · Microservices Monorepo (Nx)

---

## Overview

**Nexus** is an enterprise-grade, AI-driven platform that delivers a real-time, unified operational view of passenger movement across the entire airport ecosystem — from curbside arrival to boarding gate and from landing to landside exit.

It replaces fragmented, siloed data streams (Wi-Fi logs, XOVIS sensors, Ipsotek camera analytics, AODB) with a single, authoritative operational intelligence layer — enabling predictive congestion management, automated alerting, and AI-assisted decision support for airport operations teams.

---

## Core Capabilities

| Capability | Description |
|---|---|
| **Unified Dashboard** | Real-time heatmaps, Sankey diagrams, and command-center views of passenger density |
| **Predictive Queue Management** | Queue time forecasting at T‑30/60/90 min for security, immigration, gates, and baggage |
| **AI Anomaly Detection** | Automatic detection of crowd build-ups, flow disruptions, and security events |
| **Scenario Simulation** | "What-if" decision support (e.g. impact of a 40-min flight delay on Security T1) |
| **Role-Based Views** | Tailored dashboards for Operations, Security, Terminal Management, and Airline Coordination |
| **Automated Alerts** | Threshold-triggered notifications via dashboard, SMS, email, and radio integration |

---

## Multi-Agent AI Architecture

Nexus is powered by four specialised AI agents:

- **Ingestor Agent** — normalises heterogeneous source data into a unified schema  
- **Prophet Agent** — LSTM-based forecasting of queue build-ups and dwell times  
- **Sentinel Agent** — anomaly detection via computer vision and flow deviance models  
- **Dispatcher Agent** — scenario simulation and resource reallocation recommendations  

See [`/reference/AI_AGENTS.md`](./reference/AI_AGENTS.md) for full contracts.

---

## Integrated Systems

- Airport Operational Database (AODB)
- XOVIS passenger flow sensors
- Ipsotek AI-powered security camera analytics
- Wi-Fi access point logs
- Flight Information Display Systems (FIDS)
- Baggage Handling Systems (where access is permitted)
- Security and Immigration Systems (subject to policy)

---

## Repository Structure

```
nexus-platform/
├── apps/
│   ├── web/                    # Next.js frontend (AI Studio POC base)
│   ├── api-gateway/            # NestJS — unified entry point for frontend
│   ├── ingestor-service/       # Kafka consumers + source connectors
│   ├── analytics-engine/       # AI agents + ML model runners
│   └── notification-service/   # Alert dispatch (WebSocket, SMS, email)
├── libs/
│   ├── common/                 # Shared TypeScript interfaces and DTOs
│   ├── database/               # Prisma/TypeORM schemas
│   └── ai-models/              # TensorFlow.js / Python FastAPI bridge
├── tools/
│   └── simulators/             # Passenger flow stress-test and seed scripts
├── reference/                  # Architecture docs for development guidance
├── docker-compose.yaml
├── nx.json
└── README.md
```

See [`/reference/FILE_STRUCTURE.md`](./reference/FILE_STRUCTURE.md) for the full annotated layout.

---

## Getting Started (Local Development)

### Prerequisites

- Node.js ≥ 20
- Docker & Docker Compose
- `nx` CLI: `npm install -g nx`

### Setup

```bash
# 1. Clone and install dependencies
npm install

# 2. Copy environment config
cp .env.example .env.local
# Set GEMINI_API_KEY, DATABASE_URL, KAFKA_BROKER, REDIS_URL

# 3. Start infrastructure services
docker-compose up -d

# 4. Run all services (dev mode)
nx run-many --target=serve --all

# 5. Open the dashboard
open http://localhost:3000
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key (AI Studio POC) |
| `DATABASE_URL` | PostgreSQL connection string |
| `TIMESCALE_URL` | TimescaleDB connection string |
| `NEO4J_URI` | Neo4j Bolt URI |
| `REDIS_URL` | Redis connection string |
| `KAFKA_BROKER` | Kafka broker address |
| `NEXTAUTH_SECRET` | Auth session secret |

---

## Reference Documentation

| File | Purpose |
|---|---|
| [`/reference/ARCHITECTURE.md`](./reference/ARCHITECTURE.md) | Full system architecture, stack decisions, deployment topology |
| [`/reference/AI_AGENTS.md`](./reference/AI_AGENTS.md) | Agent contracts, inputs, outputs, trigger conditions |
| [`/reference/DATA_FLOW.md`](./reference/DATA_FLOW.md) | End-to-end data pipeline from ingestion to decision |
| [`/reference/DATABASE_SCHEMA.md`](./reference/DATABASE_SCHEMA.md) | Polyglot persistence schemas (PostgreSQL, TimescaleDB, Neo4j, Redis) |
| [`/reference/API_CONTRACTS.md`](./reference/API_CONTRACTS.md) | REST and WebSocket API interface definitions |
| [`/reference/FILE_STRUCTURE.md`](./reference/FILE_STRUCTURE.md) | Monorepo layout and file naming conventions |

---

## Compliance & Privacy

- All passenger tracking is **anonymised at ingestion** — no PII is stored or transmitted.
- **Differential Privacy** techniques applied to aggregate flow models.
- System operates within airport IT governance, cybersecurity, and data protection frameworks.
- GDPR and local data protection regulations are respected by design.

---

## License

Proprietary — Internal use only. Not for public distribution.
