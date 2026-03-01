# FILE_STRUCTURE.md — Nexus Aviation Suite

> Reference document for Claude Code. Defines the complete monorepo layout, naming conventions, and file responsibilities.

---

## Monorepo Root

```
nexus-platform/
├── apps/                         # Deployable applications
├── libs/                         # Shared libraries
├── tools/                        # Dev tooling, simulators, scripts
├── reference/                    # Architecture documentation (this folder)
├── .env.example                  # Environment variable template
├── .env.local                    # Local dev config (gitignored)
├── docker-compose.yaml           # Full local stack
├── nx.json                       # Nx monorepo config
├── package.json                  # Root dependencies
├── tsconfig.base.json            # Shared TypeScript config
├── README.md
└── DevelopRoadMap.md
```

---

## `apps/` — Application Services

### `apps/web/` — Next.js Frontend

```
apps/web/
├── app/                          # Next.js App Router
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx
│   ├── dashboard/
│   │   ├── layout.tsx            # Shared dashboard shell (nav, socket init)
│   │   ├── operations/
│   │   │   └── page.tsx          # Full command-centre view
│   │   ├── security/
│   │   │   └── page.tsx          # Security lane + anomaly view
│   │   ├── terminal/
│   │   │   └── page.tsx          # Gate + dwell times view
│   │   └── airline/
│   │       └── page.tsx          # Flight-specific flow view
│   ├── api/                      # Next.js API routes (thin proxies only)
│   └── layout.tsx
├── components/
│   ├── airport-map/
│   │   ├── AirportMap.tsx        # Main heatmap / zone overlay component
│   │   ├── ZoneOverlay.tsx       # Individual zone colour/density overlay
│   │   └── useAirportMap.ts      # Hook: fetch topology + live occupancy
│   ├── dashboard/
│   │   ├── AlertFeed.tsx         # Live anomaly alert list
│   │   ├── ForecastPanel.tsx     # T-30/60/90 queue sparklines
│   │   ├── ScenarioCards.tsx     # Dispatcher recommendations (3-card)
│   │   ├── SankeyDiagram.tsx     # D3.js passenger flow leakage
│   │   └── OccupancyGauge.tsx    # Zone occupancy ring gauge
│   ├── llm/
│   │   └── LLMQueryPanel.tsx     # Natural language operator query chat
│   └── ui/                       # Shared UI primitives (buttons, badges, etc.)
├── hooks/
│   ├── useSocket.ts              # Socket.io connection + event subscription
│   ├── useFlowData.ts            # Live zone occupancy hook
│   ├── useForecast.ts            # Prophet forecast hook
│   └── useAlerts.ts              # Active alerts hook
├── lib/
│   ├── api-client.ts             # Typed API client (fetch wrappers)
│   ├── socket-client.ts          # Socket.io client singleton
│   └── auth.ts                   # NextAuth configuration
├── store/
│   └── nexus.store.ts            # Zustand global state
├── styles/
│   └── globals.css
├── public/
│   └── maps/                     # SVG airport floor plan assets
├── next.config.js
└── tsconfig.json
```

---

### `apps/api-gateway/` — NestJS API Gateway

```
apps/api-gateway/
├── src/
│   ├── main.ts                   # NestJS bootstrap
│   ├── app.module.ts
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   └── jwt.strategy.ts
│   │   ├── flow/
│   │   │   ├── flow.module.ts
│   │   │   ├── flow.controller.ts  # GET /flow/live, /flow/history, /flow/heatmap
│   │   │   └── flow.service.ts     # Reads from Redis + TimescaleDB
│   │   ├── forecast/
│   │   │   ├── forecast.module.ts
│   │   │   ├── forecast.controller.ts
│   │   │   └── forecast.service.ts # Reads forecasts from Redis
│   │   ├── alerts/
│   │   │   ├── alerts.module.ts
│   │   │   ├── alerts.controller.ts
│   │   │   └── alerts.service.ts
│   │   ├── recommendations/
│   │   │   ├── recommendations.module.ts
│   │   │   ├── recommendations.controller.ts
│   │   │   └── recommendations.service.ts
│   │   ├── graph/
│   │   │   ├── graph.module.ts
│   │   │   ├── graph.controller.ts
│   │   │   └── graph.service.ts    # Queries Neo4j
│   │   ├── llm-query/
│   │   │   ├── llm-query.module.ts
│   │   │   ├── llm-query.controller.ts
│   │   │   └── llm-query.service.ts  # LLM context injection + API call
│   │   └── events/
│   │       ├── events.gateway.ts   # Socket.io WebSocket gateway
│   │       └── events.module.ts
│   └── guards/
│       └── roles.guard.ts          # RBAC guard
├── test/
└── tsconfig.json
```

---

### `apps/ingestor-service/` — Data Ingestion Service

```
apps/ingestor-service/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── connectors/               # Source system adapters
│   │   ├── wifi.connector.ts
│   │   ├── xovis.connector.ts
│   │   ├── ipsotek.connector.ts
│   │   ├── aodb.connector.ts
│   │   ├── fids.connector.ts
│   │   └── mock/                 # Mock adapters for POC (CONNECTOR_MODE=mock)
│   │       ├── mock-wifi.adapter.ts
│   │       ├── mock-xovis.adapter.ts
│   │       └── mock-aodb.adapter.ts
│   ├── agents/
│   │   └── ingestor.agent.ts     # Normalisation, anonymisation, zone mapping
│   ├── kafka/
│   │   ├── kafka.module.ts
│   │   ├── kafka.producer.ts
│   │   └── consumers/
│   │       ├── raw-wifi.consumer.ts
│   │       ├── raw-xovis.consumer.ts
│   │       └── raw-ipsotek.consumer.ts
│   └── middleware/
│       └── anonymise.middleware.ts  # MAC address hashing
└── tsconfig.json
```

---

### `apps/analytics-engine/` — AI Agents & ML

```
apps/analytics-engine/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── agents/
│   │   ├── prophet.agent.ts      # Queue time forecasting
│   │   ├── sentinel.agent.ts     # Anomaly detection
│   │   └── dispatcher.agent.ts   # Scenario simulation
│   ├── kafka/
│   │   └── consumers/
│   │       ├── events-flow.consumer.ts
│   │       ├── events-anomaly.consumer.ts
│   │       └── events-threshold.consumer.ts
│   ├── scheduler/
│   │   └── baseline.scheduler.ts  # Nightly baseline stats computation
│   └── modules/
│       └── simulation/
│           └── monte-carlo.service.ts
├── prophet/                       # Python FastAPI ML service
│   ├── main.py                    # FastAPI app entry point
│   ├── models/
│   │   ├── lstm_model.py          # LSTM architecture
│   │   └── train.py               # Training script
│   ├── routes/
│   │   └── predict.py             # POST /predict/queue
│   ├── requirements.txt
│   └── Dockerfile
└── tsconfig.json
```

---

### `apps/notification-service/` — Alert Dispatch

```
apps/notification-service/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── kafka/
│   │   └── consumers/
│   │       ├── anomaly.consumer.ts
│   │       └── threshold.consumer.ts
│   ├── channels/
│   │   ├── websocket.channel.ts   # Push to API Gateway Socket.io
│   │   ├── email.channel.ts       # Nodemailer / SendGrid adapter
│   │   └── sms.channel.ts         # Twilio adapter (feature-flagged)
│   └── templates/
│       ├── anomaly-alert.html
│       └── threshold-breach.html
└── tsconfig.json
```

---

## `libs/` — Shared Libraries

```
libs/
├── common/                        # Shared TypeScript interfaces and DTOs
│   └── src/
│       ├── index.ts
│       ├── interfaces/
│       │   ├── flow-event.interface.ts
│       │   ├── anomaly-event.interface.ts
│       │   ├── queue-forecast.interface.ts
│       │   ├── scenario-recommendation.interface.ts
│       │   └── threshold-breach.interface.ts
│       └── dto/
│           ├── create-alert.dto.ts
│           └── resolve-alert.dto.ts
│
├── database/                      # Database clients and schemas
│   └── src/
│       ├── prisma/
│       │   ├── schema.prisma      # PostgreSQL schema
│       │   └── migrations/
│       ├── timescale/
│       │   └── migrations/        # Raw SQL for TimescaleDB hypertables
│       ├── neo4j/
│       │   └── neo4j.client.ts    # Neo4j driver wrapper
│       └── redis/
│           └── redis.client.ts    # Redis client wrapper (ioredis)
│
└── ai-models/                     # ML wrappers
    └── src/
        ├── prophet-client.ts      # HTTP client for Python FastAPI bridge
        └── yolo-stub.ts           # YOLOv8 integration stub (feature-flagged)
```

---

## `tools/` — Development Tools

```
tools/
└── simulators/
    ├── generate-flow-events.ts    # Seed TimescaleDB with synthetic flow data
    ├── kafka-producer.ts          # Publish synthetic events to Kafka
    ├── neo4j-seed.cypher          # Seed airport topology graph
    ├── stress-test.ts             # 10k events/min load test
    └── retrain.sh                 # Trigger Python model retraining
```

---

## Naming Conventions

| Type | Convention | Example |
|---|---|---|
| React components | PascalCase | `AlertFeed.tsx` |
| Hooks | camelCase with `use` prefix | `useFlowData.ts` |
| NestJS services | camelCase + `.service.ts` | `flow.service.ts` |
| NestJS controllers | camelCase + `.controller.ts` | `flow.controller.ts` |
| Kafka consumers | kebab-topic + `.consumer.ts` | `events-flow.consumer.ts` |
| Interfaces | PascalCase + `Interface` suffix | `FlowEventInterface` |
| DTOs | PascalCase + `Dto` suffix | `CreateAlertDto` |
| Environment variables | SCREAMING_SNAKE_CASE | `KAFKA_BROKER` |

---

## TypeScript Path Aliases

Configured in `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@nexus/common": ["libs/common/src/index.ts"],
      "@nexus/database": ["libs/database/src/index.ts"],
      "@nexus/ai-models": ["libs/ai-models/src/index.ts"]
    }
  }
}
```
