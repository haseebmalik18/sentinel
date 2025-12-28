# Sentinel Architecture

## Overview

Sentinel is designed with strict separation of concerns across four independent layers. This ensures that each component has a single responsibility and can fail independently without cascading to others.

## System Layers

### 1. Data Plane (Routing)

**Responsibility:** Fast, predictable request routing

**Components:**
- `ProxyController` - Accepts incoming HTTP requests
- `BackendPool` - Manages backend instances and weights
- `RequestRouter` - Selects backend using weighted random
- `HttpProxyClient` - Forwards requests and handles responses

**Key Properties:**
- Must continue working if control plane fails
- Uses last-known-good weights
- Excludes circuit-broken backends automatically
- No decision making - only execution

**Flow:**
```
Request → ProxyController → RequestRouter → Backend Selection → HttpProxyClient → Backend
                                                                    ↓
                                                            MetricsCollector (observe)
```

---

### 2. Metrics Layer (Observation)

**Responsibility:** Collect and aggregate request observations

**Components:**
- `MetricsCollector` - Records individual request outcomes
- `RollingWindow` - Time-based bucketing for aggregation
- `LatencyHistogram` - Percentile calculation (p50/p95/p99)
- `TrendAnalyzer` - EWMA smoothing and variance tracking

**Metrics Per Backend:**
- Request rate (RPS)
- Latency distribution (p50/p95/p99)
- Error rate and types
- Timeout rate
- In-flight request count
- Latency variance (jitter)

**Design Constraints:**
- 30-second rolling windows
- Fixed latency buckets for deterministic percentiles
- No gaps in time series
- Efficient memory usage (bounded buffers)

**Data Structure:**
```
BackendMetrics
├── Rolling Windows (30s)
│   ├── Request count
│   ├── Latency samples
│   ├── Error count
│   └── Timeout count
├── Latency Histogram
│   ├── Buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000]ms
│   └── Percentiles: p50, p95, p99
├── EWMA Smoothing
│   ├── Latency trend
│   ├── RPS trend
│   └── Error trend
└── Variance Tracking
    ├── Latency jitter
    └── Stability score
```

---

### 3. Control Plane (Decision Making)

**Responsibility:** Analyze metrics and adjust routing safely

**Components:**
- `ControlLoop` - Scheduled execution (every 5 seconds)
- `HealthScorer` - Multi-signal backend evaluation
- `RiskPredictor` - Short-horizon trend forecasting
- `ModeStateMachine` - System state management
- `WeightAdjuster` - Safe routing weight updates
- `CircuitBreaker` - Hard failure protection

**Control Loop Cycle:**
```
Every 5 seconds:
  1. Read metrics from all backends
  2. Score each backend on 4 signals
  3. Predict risk over next 30 seconds
  4. Determine system mode
  5. Adjust weights with safety constraints
  6. Update circuit breakers
  7. Log decisions
```

**Multi-Signal Health Scoring:**

Each backend evaluated on:

| Signal | Measures | Healthy | Degraded | Unhealthy |
|--------|----------|---------|----------|-----------|
| **Speed** | Relative latency | < 1.5× avg | 1.5-2.5× avg | > 2.5× avg |
| **Stability** | Variance/jitter | Low variance | Medium variance | High variance |
| **Saturation** | In-flight trend | < 70% | 70-90% | > 90% |
| **Reliability** | Error/timeout rate | < 5% | 5-15% | > 15% |

**System Modes:**

```
State Machine:

   STABLE ──┐
      ↑     │ Backend degrades
      │     ↓
   RECOVERING ← DEGRADING
      ↑            │
      │            │ Traffic spike detected
      │            ↓
      └──────  OVERLOADED
```

- **STABLE:** Normal operation, gentle optimization
- **DEGRADING:** Backend health issue, shift traffic away
- **OVERLOADED:** Demand spike, protect and shed
- **RECOVERING:** Slow reintroduction after isolation

**Safety Mechanisms:**

1. **Max Weight Change:** ±10% per cycle
2. **Cooldown Windows:** 20s after major changes
3. **Min Observation:** 15s before action
4. **Gradual Ramp-up:** 5% increments after recovery
5. **Circuit Breaking:** Hard isolation for repeated failures

---

### 4. Visualizer (Explainability)

**Responsibility:** Real-time visibility and manual failure injection

**Components:**
- WebSocket server (Spring)
- Next.js dashboard (React)
- Real-time charts (Recharts)
- Event log viewer

**Displays:**
- Current system mode
- Global RPS and latency (p95/p99)
- Backend weights (live updates)
- Backend health states
- Latency/error charts
- Decision event log

**User Controls:**
- Traffic rate slider
- Inject backend latency
- Inject error rates
- Kill/revive backends

**Critical Constraint:**
- Users can change conditions, NOT decisions
- No manual weight adjustment
- No manual circuit control

---

## Data Flow

### Request Path

```
Client Request
    ↓
ProxyController (Data Plane)
    ↓
RequestRouter
    ↓
Backend Selection (weighted random, exclude broken)
    ↓
HttpProxyClient
    ↓
Backend Service
    ↓
Response
    ↓
MetricsCollector (record: latency, status)
    ↓
Client Response
```

### Control Path

```
ScheduledExecutorService (every 5s)
    ↓
ControlLoop.execute()
    ↓
HealthScorer.scoreAllBackends(metrics)
    ↓
RiskPredictor.predictRisk(trends)
    ↓
ModeStateMachine.determineMode(health, risk)
    ↓
WeightAdjuster.adjustWeights(mode, health, constraints)
    ↓
CircuitBreaker.updateStates(health, errors)
    ↓
BackendPool.updateWeights(newWeights)
    ↓
EventLog.record(decision, reason)
    ↓
WebSocket.broadcast(state)
```

---

## Failure Modes & Resilience

### Scenario 1: Control Plane Crash

**Impact:** Control loop stops running

**System Behavior:**
- Data plane continues routing with last weights
- No new weight updates
- Circuit breakers remain in last state
- System continues serving traffic

**Recovery:**
- Control plane restarts
- Reads current metrics
- Resumes normal operation

**Mitigation:** Data plane independence

---

### Scenario 2: Metrics Collector Failure

**Impact:** No new observations

**System Behavior:**
- Control plane sees stale metrics
- Minimum observation period prevents action
- System effectively frozen

**Recovery:**
- Metrics collection resumes
- Fresh data triggers normal operation

**Mitigation:** Minimum observation windows

---

### Scenario 3: Backend Hard Failure

**Impact:** Backend times out or errors consistently

**System Behavior:**
- Circuit breaker opens after threshold
- Backend excluded from routing
- Traffic shifted to healthy peers
- Periodic health probes (5% traffic)

**Recovery:**
- Backend recovers
- Health probes succeed
- Circuit closes
- Gradual ramp-up (5% per cycle)

**Mitigation:** Circuit breakers + gradual recovery

---

### Scenario 4: All Backends Degraded

**Impact:** No healthy backends available

**System Behavior:**
- System enters OVERLOADED mode
- Traffic distributed evenly (no good choice)
- p99 degrades gracefully
- No cascading circuit opens

**Recovery:**
- Backends recover
- Health scores improve
- Exit OVERLOADED mode

**Mitigation:** Graceful degradation over hard failure

---

## Configuration Philosophy

**Avoid Magic Numbers:**
- Every threshold is configurable
- Defaults are conservative
- Trade safety for optimization

**Tunable Parameters:**
- Health thresholds (latency, error, saturation)
- Control loop timing (interval, cooldown)
- Safety constraints (max change, min observation)
- Circuit breaker settings (threshold, retry delay)

**Non-Tunable:**
- Multi-signal health model (4 signals)
- System modes (state machine)
- Safety mechanisms (always enabled)

---

## Design Trade-offs

### What We Optimize For

1. **Safety** - Never make things worse
2. **Predictability** - Deterministic behavior
3. **Explainability** - Show why decisions are made
4. **Simplicity** - Avoid ML/forecasting complexity

### What We Sacrifice

1. **Optimal routing** - Conservative over aggressive
2. **Fast reaction** - Gradual change over speed
3. **Flexibility** - Opinionated design
4. **Feature completeness** - Single-tier routing only

---

## Extension Points

Future capabilities that fit the architecture:

1. **Priority-based shedding** - Tag requests, shed low-priority first
2. **Multi-tier routing** - Edge → Regional → Backend
3. **Pluggable health scorers** - Custom signals
4. **Advanced prediction** - Trend analysis improvements
5. **Rate limiting** - Per-client quotas

What does NOT fit:

- Service mesh features (mTLS, policy)
- Full observability platform (tracing)
- ML-based forecasting
- Multi-protocol support (gRPC, TCP)

---

## Technology Choices

### Why Java 21?

- Virtual threads for high concurrency
- Strong typing for safety
- Mature HTTP client
- Spring Boot ecosystem

### Why NOT Netty?

- Spring Boot sufficient for proxy use case
- Virtual threads handle concurrency
- Focus on logic, not performance optimization

### Why Custom Metrics?

- Full control over bucketing
- Deterministic percentiles
- No external dependencies
- Educational value

### Why NOT Prometheus?

- Prometheus is for storage, not computation
- We need real-time windowed aggregation
- Can expose metrics TO Prometheus later

---

## Deployment Model

**Development:**
```
docker-compose up
  ├── sentinel (proxy)
  ├── backend-1,2,3 (simulators)
  └── dashboard (Next.js)
```

**Production Considerations:**
- Run sentinel as sidecar (not standalone proxy)
- Use service discovery for backends
- External metrics storage (Prometheus)
- Distributed tracing integration

**Non-Goals:**
- Kubernetes operators
- Multi-region routing
- Edge deployment
