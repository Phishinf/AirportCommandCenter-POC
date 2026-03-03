# Nexus Aviation Suite — Project Proposal
### Unified Passenger Flow Orchestration Platform (UPFOP)

> Sources: POC_plan · README.md · Agent.md (AI Workflow) · DelegatedAI.pdf

---

## 1. Executive Summary

Nexus is an enterprise-grade, AI-driven platform that delivers a real-time unified operational view of passenger movement across the entire airport ecosystem — from curbside arrival to boarding gate. It replaces fragmented, siloed data streams with a single authoritative intelligence layer, enabling predictive congestion management, automated alerting, and AI-assisted decision support for airport operations teams.

The platform combines three foundational concepts:
- **Nexus UPFOP** — real-time airport operational intelligence
- **AI Workflow** — structured role-based multi-agent governance
- **Intelligent AI Delegation** (Google DeepMind, 2026) — adaptive, accountable, verifiable agent orchestration

---

## 2. Core Capabilities

| Capability | Description |
|---|---|
| Unified Dashboard | Real-time heatmaps, Sankey diagrams, command-centre views of passenger density |
| Predictive Queue Management | Queue time forecasting at T-30/60/90 min for security, immigration, gates, baggage |
| AI Anomaly Detection | Automatic detection of crowd build-ups, flow disruptions, and security events |
| Scenario Simulation | What-if decision support (e.g., impact of a 40-min flight delay on Security T1) |
| Role-Based Views | Tailored dashboards for Operations, Security, Terminal Management, Airline Coordination |
| Automated Alerts | Threshold-triggered notifications via dashboard, SMS, email, and radio integration |

---

## 3. Multi-Agent Architecture

Four specialist agents operate under a Director-level orchestrator:

| Agent | Role |
|---|---|
| Ingestor | Normalises heterogeneous source data (XOVIS, Ipsotek, Wi-Fi, AODB) into unified schema |
| Prophet | LSTM-based forecasting of queue build-ups and dwell times at T-30/60/90 min |
| Sentinel | Anomaly detection via YOLOv8 computer vision and flow deviance models |
| Dispatcher | Scenario simulation and resource reallocation recommendations |

The Director orchestrator monitors all agent channels, issues corrective directives, and advances or pauses workflow steps based on output-quality scoring — drawing directly from the AI Workflow governance model.

---

## 4. Proposed Technical Approach

Nexus extends its multi-agent architecture with an intelligent delegation layer. The Director agent decomposes complex operational objectives — crowd management, queue forecasting, security event response — into verifiable sub-tasks matched to specialist agents.

Delegation follows a contract-first principle: subtasks are assigned only when outcomes can be formally verified. Trust calibration governs autonomy levels — high-criticality irreversible actions (security alerts, evacuation triggers) are gated by human-in-the-loop approval, while routine forecasting runs autonomously. Adaptive coordination handles runtime triggers (flight delays, sensor failures, agent degradation) without requiring a full workflow restart.

Role-based views map to AI Workflow's operator and specialist panel model, ensuring accountability chains are explicit and auditable across every delegated decision.

---

## 5. Technical Stack

**Frontend:** Next.js 15 · React 18 · Tailwind CSS · Zustand — unified dashboard, role-based views, real-time heatmaps and Sankey diagrams via WebSocket/SSE streaming.

**Backend:** NestJS (API gateway) · Bun/Hono (agent services) · Drizzle ORM · Prisma.

**Data Layer:** PostgreSQL + pgvector (semantic agent memory) · TimescaleDB (time-series flow) · Neo4j (zone relationship graphs) · Redis (caching, pub/sub).

**Messaging:** Apache Kafka — real-time ingestion from XOVIS, Ipsotek, Wi-Fi, AODB. Event streams support delegation monitoring (TASK_STARTED, CHECKPOINT_REACHED, RESOURCE_WARNING).

**AI/Agents:** Anthropic Claude (primary orchestration) · OpenAI GPT-4o · Google Gemini — assignable per agent channel. TensorFlow.js / Python FastAPI bridge for LSTM and YOLOv8.

**Delegation Infrastructure:** MCP for standardised tool connectivity · A2A-style task objects · SSE monitoring streams with configurable granularity.

---

## 6. Current Deployment

**Vercel** hosts the Next.js frontend on a global edge CDN and auto-deploys on GitHub pushes. Role-based dashboards and SSR run at the edge.

**Supabase** handles all data: PostgreSQL for roles and metadata, pgvector for agent memory, Realtime for live dashboard push, and Auth with row-level security enforcing RBAC.

**Render** hosts all backend services: NestJS API Gateway, Ingestor, Analytics Engine, Python FastAPI bridge, and Notification Service. Background workers run Kafka consumer groups.

---

## 7. Physical Server Dimensions

**Ingestion Server:** On-premise node running Kafka brokers, consuming real-time feeds from XOVIS, Ipsotek, Wi-Fi, and AODB. High I/O throughput required.

**Database Server:** Houses TimescaleDB, Neo4j, and PostgreSQL with pgvector. Storage-intensive with RAID and scheduled backups within airport data governance boundaries.

**Application Server:** Runs NestJS services and Python FastAPI bridge. GPU-enabled for Prophet LSTM and Sentinel computer vision workloads.

**Cache Server:** Redis for sub-second pub/sub between agents and the live dashboard.

**Operator Workstations:** Command-centre terminals displaying Next.js dashboards across Operations, Security, and Terminal Management roles.

**Network:** Dedicated VLAN isolating AI agent traffic. Firewall-gated external API calls for cloud LLM providers.

---

## 8. Problems to Address

**1. Fragmented Data Silos**
Airport systems emit heterogeneous, siloed streams. The Ingestor must normalise feeds without introducing latency that invalidates real-time decisions.

**2. Accountability Gaps in Delegation Chains**
As tasks flow, Orchestrator → Specialist → Sub-model, responsibility diffuses. Each delegation link needs explicit authority transfer, verifiable outcomes, and immutable audit trails to prevent moral crumple zones.

**3. Trust Calibration Under Dynamic Conditions**
Agents must dynamically adjust autonomy levels based on task criticality. Overconfident models making irreversible calls without human confirmation pose operational risk.

**4. Human Skill Erosion**
As AI handles routine monitoring, operations staff lose situational awareness for edge cases. Calibrated cognitive friction must preserve human engagement for novel and high-uncertainty scenarios.

**5. Security in Multi-Agent Environments**
Prompt injection, data poisoning, and unauthorised permission escalation are real risks across agent-to-agent delegation chains. Least-privilege permission handling must be enforced at every boundary.

---

## 9. How DelegatedAI Resolves Technical Agent Issues

Contract-first task decomposition ensures every sub-task is verifiable before assignment. Adaptive coordination dynamically re-delegates when agents fail or degrade. Trust-calibrated permissions enforce least-privilege access at every delegation boundary. Monitoring streams via Kafka/SSE provides real-time process visibility. Cryptographic verification confirms task completion without exposing sensitive data.

---

## 10. How the Workflow Model Addresses Evolving Airport Situations

The Director agent continuously monitors all specialist channels, firing corrective directives when outputs stall or quality drops. Workflow steps can be paused, redirected, or re-scoped mid-execution without restarting. SLA tracking flags deadline drift while autonomous re-routing reassigns tasks to available agents, matching airports' live reality of gate changes, delays, and security events.

---

## 11. Deployment Scale Issues

**Server Level**
- Render free tier causes 30-60s cold starts, disrupting time-sensitive alerts
- Supabase Realtime connection limits break under multiple concurrent dashboard users
- Kafka without a managed cluster risks a message backlog during peak flight schedules
- PostgreSQL substitutes for TimescaleDB and Neo4j degrade under heavy write loads

**System Level**
- Concurrent agent delegation chains compete for LLM API rate limits during peak schedules
- Prophet LSTM models degrade without continuous retraining on fresh sensor data
- Sentinel misses cascading anomalies as agents operate in isolated channels without shared context
- Dispatcher simulations block the analytics thread under concurrent gate reassignment requests
- No persistent agent memory across sessions means every incident starts cold, losing operational learning

---

## 12. Development Roadmap

| Phase | Focus | Key Milestone |
|---|---|---|
| 0 | POC scaffold (complete) | Static dashboard, Gemini wired |
| 1 | Infrastructure & data pipeline | Live sensor ingestion, unified schema, 500ms dashboard latency |
| 2 | Core AI agents | Prophet forecasting, Sentinel detection, Dispatcher simulation |
| 3 | Role governance & delegation | Director orchestrator, trust calibration, human-in-the-loop gates, full audit trail |
| 4 | Adaptive coordination & resilience | Self-healing re-delegation, SSE monitoring, HA Kubernetes deploy |
| 5 | Hardening & KPI validation | Security audit, GDPR compliance, 15-20% queue reduction verified |

---

## 13. Target KPIs

- Queue wait time reduction: **15–20%**
- Retail dwell time increases via optimised passenger flow routing
- Incident response time reduction via automated AI alerting
- Full audit trail coverage across all delegated agent decisions

---

## 14. Compliance & Privacy

All passenger tracking is anonymised at ingestion — no PII stored or transmitted. Differential privacy techniques applied to aggregate flow models. System operates within airport IT governance, cybersecurity, and data protection frameworks. GDPR and local data protection regulations are respected by design.

---

*Proprietary — Internal use only. Not for public distribution.*
