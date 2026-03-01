# API_CONTRACTS.md — Nexus Aviation Suite

> Reference document for Claude Code. Defines all REST and WebSocket API interfaces exposed by the API Gateway.

---

## Base URL

```
Development:  http://localhost:4000/api/v1
Production:   https://nexus.airport.internal/api/v1
```

All REST endpoints require `Authorization: Bearer {JWT}` header unless marked `[PUBLIC]`.

---

## Authentication

### POST `/auth/login` [PUBLIC]

```typescript
// Request
{
  email: string;
  password: string;
}

// Response 200
{
  accessToken: string;   // JWT, expires 8h
  user: {
    id: string;
    email: string;
    role: 'ADMIN' | 'OPERATIONS' | 'SECURITY' | 'TERMINAL' | 'AIRLINE';
    terminalId: string | null;
  }
}
```

---

## Flow & Occupancy Endpoints

### GET `/flow/live`

Returns current occupancy snapshot for all zones (from Redis).

```typescript
// Query params
?terminalId=T1             // optional filter
?zoneType=SECURITY_LANE    // optional filter

// Response 200
{
  snapshot: Array<{
    zoneId: string;
    terminalId: string;
    zoneType: string;
    occupancyAbsolute: number;
    capacityMax: number;
    occupancyPct: number;     // 0–100
    status: 'NORMAL' | 'WARNING' | 'CRITICAL';
    updatedAt: string;        // ISO timestamp
  }>;
  generatedAt: string;
}
```

### GET `/flow/history`

Returns historical flow data from TimescaleDB for chart rendering.

```typescript
// Query params (all required)
?zoneId=T1_SECURITY_LANE_1
?from=2025-01-15T06:00:00Z
?to=2025-01-15T12:00:00Z
?bucket=15min              // '1min' | '5min' | '15min' | '1hour'

// Response 200
{
  zoneId: string;
  buckets: Array<{
    time: string;
    avgOccupancy: number;
    maxOccupancy: number;
    totalFlow: number;
  }>
}
```

### GET `/flow/heatmap`

Returns a flat list of zone occupancy pct values suitable for heatmap rendering on the airport map.

```typescript
// Query params
?terminalId=T1

// Response 200
{
  zones: Array<{
    zoneId: string;
    x: number;         // map coordinate from Neo4j
    y: number;
    occupancyPct: number;
    zoneType: string;
  }>
}
```

---

## Forecast Endpoints

### GET `/flow/forecast`

Returns latest Prophet Agent queue forecasts (from Redis).

```typescript
// Query params
?zoneId=T1_SECURITY_LANE_1    // single zone, or omit for all
?terminalId=T1                // filter by terminal

// Response 200
{
  forecasts: Array<{
    zoneId: string;
    generatedAt: string;
    horizons: {
      t30: { predictedWaitMinutes: number; confidence: number };
      t60: { predictedWaitMinutes: number; confidence: number };
      t90: { predictedWaitMinutes: number; confidence: number };
    };
    flightCorrelations: string[];
  }>
}
```

---

## Alerts Endpoints

### GET `/alerts/active`

Returns currently active anomaly alerts (from Redis list).

```typescript
// Response 200
{
  alerts: Array<{
    anomalyId: string;
    zoneId: string;
    terminalId: string;
    anomalyType: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    detectedAt: string;
    description: string;
    recommendedAction?: string;
  }>;
  count: number;
}
```

### PATCH `/alerts/:anomalyId/resolve`

Marks an alert as resolved (writes to PostgreSQL `alerts` table).

```typescript
// Request body
{
  resolvedBy: string;   // userId
  notes?: string;
}

// Response 200
{
  anomalyId: string;
  resolvedAt: string;
}
```

---

## Recommendations Endpoint

### GET `/recommendations/latest`

Returns latest Dispatcher Agent scenario recommendations.

```typescript
// Query params
?terminalId=T1

// Response 200
{
  recommendation: {
    recommendationId: string;
    triggerEventId: string;
    generatedAt: string;
    urgencyLevel: 'ADVISORY' | 'ACTION_REQUIRED' | 'URGENT';
    affectedZones: string[];
    scenarios: Array<{
      rank: number;
      label: string;
      actions: string[];
      predictedWaitReduction: number;
      resourceCost: string;
      confidence: number;
    }>;
  } | null;   // null if no active recommendations
}
```

---

## Airport Graph Endpoint

### GET `/graph/topology`

Returns the airport zone graph from Neo4j for map rendering.

```typescript
// Query params
?terminalId=T1

// Response 200
{
  nodes: Array<{
    id: string;
    name: string;
    type: string;
    x: number;
    y: number;
    terminalId: string;
    capacityMax: number;
  }>;
  edges: Array<{
    from: string;
    to: string;
    walkTimeSeconds: number;
    isActive: boolean;
  }>
}
```

---

## LLM Natural Language Query

### POST `/llm/query`

```typescript
// Request
{
  query: string;          // e.g. "What is the impact of SQ12 delay on Security T1?"
  context?: {
    terminalId?: string;
    zoneId?: string;
  }
}

// Response 200
{
  answer: string;         // LLM-generated natural language response
  dataReferences: Array<{
    type: 'forecast' | 'alert' | 'flight' | 'occupancy';
    id: string;
    summary: string;
  }>;
  generatedAt: string;
}
```

---

## WebSocket Events (Socket.io)

### Connection

```typescript
// Client connects with JWT
const socket = io('http://localhost:4000', {
  auth: { token: 'Bearer {JWT}' }
});
```

### Server → Client Events

| Event Name | Payload | When emitted |
|---|---|---|
| `flow:update` | `FlowUpdatePayload` | Every 5s — live zone occupancy snapshot |
| `forecast:update` | `ForecastUpdatePayload` | Every 60s — updated Prophet forecasts |
| `alert:new` | `AnomalyEvent` | Immediately when Sentinel detects anomaly |
| `alert:resolved` | `{anomalyId, resolvedAt}` | When alert PATCH resolves it |
| `recommendation:new` | `ScenarioRecommendation` | Immediately when Dispatcher produces scenarios |
| `threshold:breach` | `ThresholdBreachPayload` | When Prophet exceeds configured threshold |

### FlowUpdatePayload
```typescript
{
  zones: Array<{
    zoneId: string;
    occupancyPct: number;
    status: 'NORMAL' | 'WARNING' | 'CRITICAL';
  }>;
  timestamp: string;
}
```

### Client → Server Events

| Event Name | Payload | Purpose |
|---|---|---|
| `subscribe:terminal` | `{terminalId: string}` | Filter events to specific terminal |
| `subscribe:zone` | `{zoneId: string}` | Subscribe to single zone updates |
| `unsubscribe:all` | `{}` | Remove all subscriptions |

---

## Error Response Format

All REST errors follow:

```typescript
{
  statusCode: number;
  error: string;
  message: string;
  timestamp: string;
  path: string;
}
```

---

## Rate Limits

| Endpoint group | Limit |
|---|---|
| `/auth/*` | 10 req/min per IP |
| `/flow/*` | 120 req/min per user |
| `/llm/query` | 20 req/min per user |
| All other `/api/v1/*` | 300 req/min per user |
