# AI_AGENTS.md — Nexus Multi-Agent System

> Reference document for Claude Code. Defines each agent's contract, inputs, outputs, trigger conditions, and implementation location.

---

## Agent Overview

Nexus uses a **Multi-Agent System (MAS)** where each agent is a specialised service module rather than a monolithic AI. Agents communicate via Kafka topics and an internal NestJS EventEmitter2 bus.

```
┌─────────────┐    events.flow    ┌──────────────┐
│  INGESTOR   │ ─────────────────►│   PROPHET    │
│   AGENT     │                   │   AGENT      │
└─────────────┘                   └──────┬───────┘
      │                                   │ threshold breach
      │ events.flow              events.threshold
      ▼                                   │
┌─────────────┐    events.anomaly  ┌───────▼──────┐
│  SENTINEL   │ ─────────────────► │  DISPATCHER  │
│   AGENT     │                    │   AGENT      │
└─────────────┘                    └──────┬───────┘
                                          │ events.recommendation
                                          ▼
                                   API Gateway → Dashboard
```

---

## Agent 1: Ingestor Agent

**File location:** `apps/ingestor-service/src/agents/ingestor.agent.ts`

### Responsibility
Consume raw events from all source Kafka topics. Normalise, validate, anonymise, and re-emit as a unified `FlowEvent` schema.

### Input Topics
- `raw.wifi` — Wi-Fi association/disassociation events
- `raw.xovis` — XOVIS sensor zone crossing events
- `raw.aodb` — Flight schedule and gate change events
- `raw.fids` — Display system updates

### Output
- Kafka topic: `events.flow`
- TimescaleDB write: `flow_metrics` hypertable

### FlowEvent Schema (TypeScript)
```typescript
export interface FlowEvent {
  eventId: string;           // UUID
  timestamp: Date;
  sourceSystem: 'WIFI' | 'XOVIS' | 'AODB' | 'FIDS';
  zoneId: string;            // e.g. "T1_SECURITY_LANE_3"
  terminalId: string;        // e.g. "T1"
  passengerCountDelta: number; // +/- change in zone occupancy
  occupancyAbsolute: number;   // current occupancy snapshot (if available)
  anonymisedDeviceId?: string; // SHA-256 hashed + salted MAC
  flightRef?: string;          // IATA flight number if correlated
  metadata?: Record<string, unknown>;
}
```

### Anonymisation Rules
- MAC addresses: `SHA-256(MAC + daily_rotating_salt)` — never store raw MAC
- No name, passport, or biometric data at any point in the pipeline
- Camera analytics from Ipsotek consume aggregate counts only — no individual tracking

---

## Agent 2: Prophet Agent

**File location:** `apps/analytics-engine/src/agents/prophet.agent.ts`  
**ML Service:** `apps/analytics-engine/prophet/main.py` (Python FastAPI)

### Responsibility
Forecast queue wait times and congestion levels at key checkpoints for T‑30, T‑60, and T‑90 minute horizons using LSTM models trained on historical flow data.

### Input
- Kafka topic: `events.flow` (real-time occupancy feed)
- TimescaleDB query: last 7-day flow history per zone (training window)
- AODB flight schedule (inbound/outbound pax counts, gate assignments)

### Output
- Kafka topic: `events.threshold` (when forecast exceeds threshold)
- Redis cache: `forecast:{zoneId}` → `QueueForecast` object (TTL: 60s)

### QueueForecast Schema (TypeScript)
```typescript
export interface QueueForecast {
  zoneId: string;
  generatedAt: Date;
  forecasts: Array<{
    horizon: 30 | 60 | 90;       // minutes from now
    predictedWaitMinutes: number;
    confidence: number;           // 0–1
    predictedOccupancy: number;
  }>;
  flightCorrelations: string[];   // flight refs influencing this forecast
}
```

### ML Model Details
- Architecture: LSTM (2 layers, 128 units) via TensorFlow/PyTorch
- Features: time-of-day, day-of-week, zone occupancy history, flight schedule load
- Retraining: scheduled weekly via `tools/simulators/retrain.sh`
- Python FastAPI endpoint: `POST /predict/queue` → `QueueForecast`

### Trigger for Threshold Alert
Emit `events.threshold` when `predictedWaitMinutes` at T‑30 exceeds zone-specific threshold (configurable per zone in PostgreSQL `zone_config` table).

---

## Agent 3: Sentinel Agent

**File location:** `apps/analytics-engine/src/agents/sentinel.agent.ts`

### Responsibility
Detect anomalous passenger flow conditions in real time using statistical deviance and (optionally) computer vision signals from Ipsotek.

### Input
- Kafka topic: `events.flow`
- Kafka topic: `raw.ipsotek` (camera analytics — aggregate counts and behavioural flags)
- Redis: 7-day rolling baseline per zone (pre-computed by analytics scheduler)

### Output
- Kafka topic: `events.anomaly`

### AnomalyEvent Schema (TypeScript)
```typescript
export interface AnomalyEvent {
  anomalyId: string;         // UUID
  detectedAt: Date;
  zoneId: string;
  terminalId: string;
  anomalyType: 
    | 'CROWD_BUILDUP'
    | 'FLOW_DISRUPTION'
    | 'ABANDONED_BAGGAGE'     // requires Ipsotek CV
    | 'UNUSUAL_DWELL'
    | 'SECURITY_INCIDENT';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  currentOccupancy: number;
  baselineOccupancy: number;
  devianceScore: number;     // Z-score vs rolling baseline
  description: string;       // Human-readable summary
  recommendedAction?: string;
}
```

### Detection Algorithms
- **Flow deviance:** Z-score `(current - baseline_mean) / baseline_std` — alert when Z > 2.5
- **Dwell anomaly:** Occupancy increase without corresponding exit events over rolling 5-min window
- **CV integration:** Ipsotek camera flags (e.g. `abandoned_object`) passed directly as `ABANDONED_BAGGAGE` events

---

## Agent 4: Dispatcher Agent

**File location:** `apps/analytics-engine/src/agents/dispatcher.agent.ts`

### Responsibility
On receipt of an `AnomalyEvent` or critical `ThresholdBreachEvent`, run Monte Carlo scenario simulations and produce three ranked resource reallocation recommendations for the Terminal Manager dashboard.

### Input
- Kafka topic: `events.anomaly`
- Kafka topic: `events.threshold`
- Redis: current zone occupancies and staffing levels
- Neo4j: airport topology graph (for routing simulation)
- AODB: active flight schedule

### Output
- Kafka topic: `events.recommendation`
- WebSocket push via API Gateway to `OPERATIONS` and `TERMINAL` role dashboards

### ScenarioRecommendation Schema (TypeScript)
```typescript
export interface ScenarioRecommendation {
  recommendationId: string;    // UUID
  triggerEventId: string;      // anomalyId or thresholdId
  generatedAt: Date;
  scenarios: Array<{
    rank: 1 | 2 | 3;
    label: string;             // e.g. "Open Security Lane 4"
    actions: string[];         // Actionable steps
    predictedWaitReduction: number;  // minutes
    resourceCost: string;      // e.g. "2 additional staff for 30 mins"
    confidence: number;        // 0–1
  }>;
  affectedZones: string[];
  urgencyLevel: 'ADVISORY' | 'ACTION_REQUIRED' | 'URGENT';
}
```

### Simulation Logic
1. Load current airport state from Redis + Neo4j
2. Run 1,000 Monte Carlo iterations per scenario option
3. Score each scenario by: predicted wait reduction × confidence / resource cost
4. Return top 3 ranked scenarios

---

## Agent Communication Summary

| From | To | Channel | Condition |
|---|---|---|---|
| Ingestor Agent | Prophet Agent | Kafka `events.flow` | Every normalised event |
| Ingestor Agent | Sentinel Agent | Kafka `events.flow` | Every normalised event |
| Ipsotek Connector | Sentinel Agent | Kafka `raw.ipsotek` | Camera analytics events |
| Prophet Agent | Dispatcher Agent | Kafka `events.threshold` | Forecast exceeds threshold |
| Sentinel Agent | Dispatcher Agent | Kafka `events.anomaly` | Anomaly detected |
| Dispatcher Agent | API Gateway | Kafka `events.recommendation` | Scenarios ready |
| API Gateway | Frontend | WebSocket | Pushed to subscribed role dashboards |

---

## LLM Natural Language Interface

**File location:** `apps/api-gateway/src/modules/llm-query/llm-query.service.ts`

This is not a core agent but an operator-facing capability. The Terminal Manager can type natural language queries such as:

> *"What is the predicted impact on Security T1 if Flight SQ12 is delayed by 40 minutes?"*

### Implementation
- Frontend chat panel sends query to `POST /api/v1/llm/query`
- API Gateway fetches live context from Redis (current forecasts, active anomalies, flight schedule)
- Builds a structured system prompt injecting live airport state
- Calls Gemini or Azure OpenAI GPT-4 completion
- Returns synthesised natural language answer with supporting data references

### System Prompt Template
```
You are the Nexus Airport Operations AI. You have access to the following live airport state:
- Current zone occupancies: {occupancies}
- Active forecasts: {forecasts}
- Active anomalies: {anomalies}
- Flight schedule (next 3 hours): {flightSchedule}

Answer operator queries accurately and concisely. Always cite the data source for your answer.
```
