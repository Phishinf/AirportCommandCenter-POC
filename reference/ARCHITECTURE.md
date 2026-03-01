# ARCHITECTURE.md — Nexus Aviation Suite

> Reference document for Claude Code. Describes the full system architecture, deployment topology, and stack rationale.

---

## System Overview

Nexus is a **Cloud-Native Hybrid** platform using a **Microservices Monorepo** pattern managed by Nx.  
The system is split into three logical tiers:

```
┌─────────────────────────────────────────────────────────────┐
│  EDGE TIER (Airport Network)                                 │
│  XOVIS Sensors · Ipsotek Cameras · Wi-Fi APs · AODB · FIDS  │
└───────────────────────────┬─────────────────────────────────┘
                            │ Kafka Ingestion
┌───────────────────────────▼─────────────────────────────────┐
│  PROCESSING TIER (On-Prem or Private Cloud)                  │
│  Ingestor Service · Analytics Engine · Notification Service  │
│  TimescaleDB · Neo4j · PostgreSQL · Redis                    │
└───────────────────────────┬─────────────────────────────────┘
                            │ REST / WebSocket
┌───────────────────────────▼─────────────────────────────────┐
│  PRESENTATION TIER (Public Cloud / CDN)                      │
│  Next.js Frontend · API Gateway · Auth                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Full Technology Stack

### Frontend
| Component | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 14.x |
| Language | TypeScript | 5.x |
| Styling | TailwindCSS | 3.x |
| Real-time | Socket.io-client | 4.x |
| Map/Heatmap | deck.gl or react-leaflet | latest |
| Flow Diagrams | D3.js | 7.x |
| State Management | Zustand | 4.x |
| Auth | NextAuth.js | 5.x |

### Backend Services
| Service | Technology | Port |
|---|---|---|
| API Gateway | NestJS (TypeScript) | 4000 |
| Ingestor Service | NestJS + KafkaJS | 4001 |
| Analytics Engine | NestJS + Python FastAPI bridge | 4002 / 8000 |
| Notification Service | NestJS | 4003 |

### Infrastructure
| Component | Technology | Port |
|---|---|---|
| Message Broker | Apache Kafka + Zookeeper | 9092 |
| Time-Series DB | TimescaleDB (PostgreSQL ext.) | 5433 |
| Relational DB | PostgreSQL | 5432 |
| Graph DB | Neo4j | 7474 / 7687 |
| Cache | Redis | 6379 |
| Container Orchestration | Docker / Kubernetes | — |

### AI & ML
| Component | Technology |
|---|---|
| Forecasting models | TensorFlow.js / PyTorch (Python) |
| Model serving | Python FastAPI microservice |
| Computer Vision | YOLOv8 (Ultralytics) |
| LLM interface | Google Gemini / Azure OpenAI GPT-4 |

---

## Service Communication

```
Frontend (Next.js)
    │
    │  HTTPS REST + WebSocket (Socket.io)
    ▼
API Gateway (NestJS :4000)
    │
    ├── REST HTTP ──► Ingestor Service (:4001)
    ├── REST HTTP ──► Analytics Engine (:4002)
    └── REST HTTP ──► Notification Service (:4003)

Ingestor Service ──► Kafka (produces raw.* topics)
Analytics Engine ──► Kafka (consumes raw.*, produces events.*)
Notification Service ──► Kafka (consumes events.anomaly, events.threshold)

Analytics Engine ──► Python FastAPI Bridge (:8000)  [HTTP]
All Services ──► Redis  [cache reads/writes]
Ingestor Service ──► TimescaleDB  [sensor/flow writes]
API Gateway ──► TimescaleDB + PostgreSQL + Neo4j  [reads]
```

---

## Kafka Topics

| Topic | Producer | Consumer | Payload |
|---|---|---|---|
| `raw.wifi` | Ingestor (Wi-Fi connector) | Ingestor Agent | Raw Wi-Fi association event |
| `raw.xovis` | Ingestor (XOVIS connector) | Ingestor Agent | XOVIS zone crossing event |
| `raw.ipsotek` | Ingestor (Ipsotek connector) | Sentinel Agent | Camera analytics event |
| `raw.aodb` | Ingestor (AODB connector) | Prophet Agent | Flight schedule update |
| `raw.fids` | Ingestor (FIDS connector) | Dashboard cache | Display board update |
| `events.flow` | Ingestor Agent | Analytics Engine | Normalised FlowEvent |
| `events.anomaly` | Sentinel Agent | Notification + Dispatcher | AnomalyEvent |
| `events.threshold` | Prophet Agent | Notification Service | ThresholdBreachEvent |
| `events.recommendation` | Dispatcher Agent | API Gateway (WebSocket) | ScenarioRecommendation[] |

---

## Deployment Topology

### Local Development (docker-compose)
All services run in Docker containers on a single machine. Suitable for prototype and demo.

### Production (Kubernetes)
- **Edge nodes:** Ingestor service deployed close to airport network for low-latency ingestion.
- **Cloud cluster:** Analytics Engine, API Gateway, and databases on managed Kubernetes (GKE / AKS).
- **CDN:** Next.js frontend served from edge CDN (Vercel / Cloudflare).
- **High Availability:** All stateful services deployed with replicas; Kafka with 3-broker cluster.

---

## Security Architecture

- All inter-service communication over TLS in production.
- JWT tokens issued by API Gateway; verified by all downstream services.
- RBAC enforced at API Gateway level; roles: `OPERATIONS`, `SECURITY`, `TERMINAL`, `AIRLINE`, `ADMIN`.
- No PII stored — MAC addresses hashed with SHA-256 + daily rotating salt at ingestion.
- Differential privacy noise applied to aggregate flow counts exposed via API.
- Secrets managed via environment variables (dev) / Kubernetes Secrets / Vault (prod).

---

## Scalability Considerations

- Kafka consumer groups allow horizontal scaling of ingestor and analytics services independently.
- TimescaleDB continuous aggregates pre-compute hourly/daily rollups to avoid expensive full scans at dashboard query time.
- Redis caches live dashboard state (TTL 60s) to prevent direct DB hammering from concurrent dashboard sessions.
- Nx affected builds ensure only changed services are rebuilt and redeployed in CI/CD.
