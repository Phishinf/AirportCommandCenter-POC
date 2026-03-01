# DATA_FLOW.md — Nexus Aviation Suite

> Reference document for Claude Code. Defines the complete data pipeline from raw source ingestion through to dashboard decision output.

---

## End-to-End Pipeline Overview

```
Source Systems
     │
     │ (1) Raw Data Ingestion
     ▼
Kafka Raw Topics (raw.wifi / raw.xovis / raw.ipsotek / raw.aodb / raw.fids)
     │
     │ (2) Normalisation & Anonymisation
     ▼
Ingestor Agent → Kafka (events.flow) → TimescaleDB (flow_metrics)
     │
     ├─────────────────────┐
     │ (3a) Prediction     │ (3b) Anomaly Detection
     ▼                     ▼
Prophet Agent         Sentinel Agent
     │                     │
     │ events.threshold    │ events.anomaly
     └──────────┬──────────┘
                │
                │ (4) Decision Support
                ▼
          Dispatcher Agent
                │
                │ events.recommendation
                ▼
          API Gateway (NestJS)
                │
                │ (5) Presentation
                ├── REST API → Frontend (page load / polling)
                └── WebSocket → Frontend (real-time push)
                       │
                       ▼
              Role-Based Dashboards
```

---

## Step 1: Raw Data Ingestion

Each source system has a dedicated **connector** in `apps/ingestor-service/src/connectors/`.

| Source | Connector File | Protocol | Raw Kafka Topic |
|---|---|---|---|
| Wi-Fi Access Point logs | `wifi.connector.ts` | UDP syslog / REST poll | `raw.wifi` |
| XOVIS passenger flow sensors | `xovis.connector.ts` | XOVIS REST API / MQTT | `raw.xovis` |
| Ipsotek camera analytics | `ipsotek.connector.ts` | RTSP metadata / REST | `raw.ipsotek` |
| Airport Operational Database | `aodb.connector.ts` | REST API / SFTP poll | `raw.aodb` |
| Flight Information Display | `fids.connector.ts` | REST API | `raw.fids` |
| Baggage Handling System | `bhs.connector.ts` | REST API (where permitted) | `raw.bhs` |

> **POC Note:** All connectors have a `MockAdapter` implementation that generates synthetic events for local development. Set `CONNECTOR_MODE=mock` in `.env.local` to activate.

### Raw Wi-Fi Event Shape (example)
```json
{
  "ap_mac": "aa:bb:cc:dd:ee:ff",
  "client_mac": "11:22:33:44:55:66",
  "event_type": "ASSOCIATION",
  "rssi": -65,
  "ssid": "AIRPORT_INTERNAL",
  "timestamp": "2025-01-15T09:32:11.000Z",
  "ap_location_id": "T1_LEVEL2_GATE_A12"
}
```

### Raw XOVIS Event Shape (example)
```json
{
  "sensor_id": "XOVIS_T1_SEC_01",
  "zone_id": "T1_SECURITY_LANE_1",
  "direction": "IN",
  "count_delta": 1,
  "current_occupancy": 47,
  "timestamp": "2025-01-15T09:32:12.000Z"
}
```

---

## Step 2: Normalisation & Anonymisation

**Ingestor Agent** (`apps/ingestor-service/src/agents/ingestor.agent.ts`) performs:

1. **Schema validation** — reject malformed events with dead-letter to `raw.dlq`
2. **MAC address anonymisation** — hash with `SHA-256(mac + DAILY_SALT)` — salt rotates at 00:00 UTC
3. **Zone correlation** — map `ap_location_id` → canonical `zoneId` using lookup table in PostgreSQL `zone_mapping`
4. **Flight correlation** — correlate zone + timestamp against AODB schedule to attach `flightRef` where possible
5. **Schema normalisation** — emit unified `FlowEvent` (see AI_AGENTS.md)

**Write path:**
- `FlowEvent` → Kafka topic `events.flow`
- `FlowEvent` → TimescaleDB hypertable `flow_metrics` (async, batched every 500ms)

---

## Step 3a: Predictive Analytics Flow (Prophet Agent)

```
events.flow (Kafka)
    │
    ▼
Prophet Agent
    │
    ├── Query TimescaleDB: SELECT 7-day history for zoneId
    ├── Query Redis: current_occupancy:{zoneId}
    ├── Query AODB cache: upcoming flights for this terminal
    │
    ▼
HTTP POST → Python FastAPI (:8000) /predict/queue
    │ {zoneId, currentOccupancy, history[], flightLoad}
    ▼
LSTM Model → QueueForecast {T-30, T-60, T-90}
    │
    ▼
Prophet Agent receives forecast
    │
    ├── Write to Redis: forecast:{zoneId} (TTL 60s)
    │
    └── IF forecast.T30.predictedWaitMinutes > threshold (from zone_config):
            Produce → Kafka: events.threshold
```

---

## Step 3b: Anomaly Detection Flow (Sentinel Agent)

```
events.flow + raw.ipsotek (Kafka)
    │
    ▼
Sentinel Agent
    │
    ├── Fetch Redis: baseline:{zoneId} (7-day rolling mean + std)
    ├── Compute Z-score: (currentOccupancy - baseline_mean) / baseline_std
    │
    ├── IF Z-score > 2.5:
    │       Produce → Kafka: events.anomaly (type: CROWD_BUILDUP)
    │
    ├── IF Ipsotek event.type == 'abandoned_object':
    │       Produce → Kafka: events.anomaly (type: ABANDONED_BAGGAGE, severity: CRITICAL)
    │
    └── IF dwell_anomaly detected (occupancy up, exits flat over 5 min):
            Produce → Kafka: events.anomaly (type: UNUSUAL_DWELL)
```

---

## Step 4: Decision Support Flow (Dispatcher Agent)

```
events.anomaly OR events.threshold (Kafka)
    │
    ▼
Dispatcher Agent
    │
    ├── Fetch current airport state:
    │   ├── Redis: all zone occupancies
    │   ├── Neo4j: airport topology graph
    │   └── AODB cache: active flight schedule
    │
    ├── Generate 3 scenario options:
    │   ├── Scenario A: Open additional resource (e.g. security lane)
    │   ├── Scenario B: Divert passenger flow (e.g. open alternate corridor)
    │   └── Scenario C: Do nothing + predicted outcome
    │
    ├── Run Monte Carlo simulation (1,000 iterations per scenario)
    │
    └── Rank by: wait_reduction × confidence / resource_cost
            │
            Produce → Kafka: events.recommendation
```

---

## Step 5: Presentation Layer Flow

```
Kafka: events.recommendation / events.anomaly / events.threshold
    │
    ▼
API Gateway (NestJS)
    │
    ├── Consume Kafka events
    ├── Store in Redis: latest_alerts, latest_recommendations (per terminal)
    ├── Push via Socket.io to subscribed frontend clients (filtered by role)
    │
    └── REST Endpoints (for page load / polling):
        GET /api/v1/flow/live           → current occupancies per zone
        GET /api/v1/flow/forecast       → latest forecasts per zone
        GET /api/v1/alerts/active       → active anomaly events
        GET /api/v1/recommendations     → latest Dispatcher scenarios
        GET /api/v1/graph/topology      → airport node graph (for map rendering)
```

---

## Decision Points

| Decision Point | Where | Condition | Action |
|---|---|---|---|
| Reject malformed event | Ingestor Agent | Schema validation fails | Route to `raw.dlq`, log error |
| Trigger threshold alert | Prophet Agent | T-30 forecast > zone threshold | Emit `events.threshold` |
| Trigger anomaly | Sentinel Agent | Z-score > 2.5 | Emit `events.anomaly` |
| Escalate severity | Sentinel Agent | Z-score > 4.0 OR CRITICAL Ipsotek event | Set `severity: CRITICAL` |
| Generate scenarios | Dispatcher Agent | Any anomaly or threshold event | Run simulation, emit recommendation |
| Push to dashboard | API Gateway | events.recommendation received | WebSocket broadcast to role filter |
| LLM query response | API Gateway | Operator natural language query | Inject live context, call LLM, return answer |

---

## Data Retention Policy

| Store | Retention | Notes |
|---|---|---|
| TimescaleDB `flow_metrics` | 90 days full resolution | Continuous aggregate rollups kept 2 years |
| TimescaleDB `wifi_events` | 24 hours | Anonymised; short retention by design |
| PostgreSQL `alerts` | 1 year | Audit trail for security incidents |
| Redis forecast cache | 60 seconds TTL | Live operational state only |
| Redis baseline cache | 7 days rolling | Updated nightly by analytics scheduler |
| Kafka log retention | 24 hours | Raw topics; events.* topics 7 days |
