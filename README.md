# Sentinel: Adaptive Traffic Control for Degradation Protection

## Overview

Sentinel is an adaptive load balancer designed to protect backend services from cascading failures during degradation and overload. The core challenge it addresses: distinguishing between traffic spikes (which require more capacity) and backend degradation (which requires reducing traffic to failing backends).

Unlike simple load balancers that use round-robin or react to individual failures, Sentinel observes sustained behavioral patterns over time and adjusts traffic distribution gradually using multiple health signals and safety constraints.

## Key Features

### Multi-Signal Health Evaluation
Backend health is assessed using four weighted signals rather than simple error counting:

- **Speed (40%)**: Latency percentiles compared to baseline
  - Degraded: p95 > 1.5x baseline
  - Unhealthy: p95 > 2.5x baseline
- **Reliability (30%)**: Error and timeout rates
  - Warning: error rate > 5%
  - Critical: error rate > 15%
- **Saturation (20%)**: Resource utilization and queue depth
  - Warning: 70% capacity
  - Critical: 90% capacity
- **Stability (10%)**: Latency variance as early warning signal
  - Unstable: (p99 - p50) / p50 > 2.0

This multi-signal approach prevents false positives from brief spikes while detecting genuine degradation early enough to take action.

### Sustained Degradation Detection
Weight reduction requires observing degradation for 3 consecutive control cycles (15 seconds total). This filters out transient issues like garbage collection pauses while still reacting quickly to real problems.

Single-cycle anomalies are logged but don't trigger traffic changes, preventing oscillation from temporary fluctuations.

### Circuit Breaker with Safe Recovery
When backends fail severely (5 failures in 20 seconds or 20% timeout rate), the circuit breaker activates:

1. **CLOSED** - Normal operation, all traffic routed normally
2. **OPEN** - Backend excluded from routing, zero production traffic
3. **HALF_OPEN** - After 10 seconds, test recovery with 5% probe traffic
4. **Recovery** - If probes succeed, close circuit and start gradual ramp-up
5. **Retry** - If probes fail, reopen circuit and wait another 10 seconds

The probe traffic allows safe recovery testing without risking full production load on a potentially unhealthy backend.

### Gradual Ramp-Up Recovery
When a circuit closes after successful recovery testing, traffic doesn't immediately return to 100%. Instead, it increases gradually:

```
0s:  5% of configured weight
10s: 20% of configured weight
20s: 40% of configured weight
30s: 60% of configured weight
40s: 80% of configured weight
50s: 100% (ramp-up complete)
```

Benefits:
- Prevents thundering herd on recovered backend
- Allows backend to warm up caches gradually
- Gives time to detect if recovery is sustainable
- Automatically cancels if backend degrades during ramp-up

This is a critical safety mechanism that many simple load balancers lack.

### Weight Adjustment Safety Constraints
All weight changes are bounded by multiple safety mechanisms:

- **Maximum change rate**: ±10% per 5-second control cycle
- **Minimum observation**: 15 seconds before first action on new backend
- **Cooldown period**: 20 seconds after major state transitions
- **Asymmetric recovery**: 5% increase when improving (slower than degradation)

These constraints prevent oscillation, ensure smooth transitions, and prioritize stability over optimization.

## Architecture

### Three-Layer Design

**Data Plane** - Fast request routing
- Weighted random selection for smooth weight transitions
- Uses effective weight (base weight × ramp-up percentage)
- Excludes circuit-broken backends automatically
- Continues operating if control plane fails
- Built on Java 21 async HttpClient

**Metrics Layer** - Lock-free observation windows
- 20-second rolling windows with 1-second bucket granularity
- AtomicLongArray for concurrent metric updates without locks
- Fixed latency buckets for deterministic percentile calculation
- EWMA (Exponentially Weighted Moving Average) for trend detection
- Tracks: p50/p95/p99 latency, error rate, timeout rate, RPS, in-flight requests

**Control Plane** - 5-second decision loop
1. **Observe**: Collect metrics from rolling windows
2. **Assess**: Calculate multi-signal health scores
3. **Predict**: Detect trends using EWMA and variance
4. **Decide**: Determine weight adjustments within safety bounds
5. **Act**: Apply changes and log reasoning

### Design Principles

1. **Never react to single requests** - All decisions require sustained observation
2. **Prefer gradual change** - Incremental adjustments prevent oscillation
3. **Safety first** - Protect system stability before optimizing performance
4. **Explainability** - All control decisions are logged with reasoning
5. **Clean separation** - Data plane, metrics, and control operate independently

## Performance

### Capacity Estimates

**Current deployment (Docker on laptop):**
- Estimated sustained: 5,000-10,000 RPS
- Routing overhead: <1ms per request

**Production hardware (4-core, 8GB):**
- Estimated sustained: 25,000-30,000 RPS
- Architecture limit: 50,000+ RPS

The architecture uses lock-free data structures and async I/O, so the proxy itself is not the bottleneck. Backend capacity determines system throughput.

## Technology Stack

- **Runtime**: Java 21 (virtual threads, pattern matching, records)
- **Framework**: Spring Boot 3.2
- **HTTP Client**: Java HttpClient (async, HTTP/2)
- **Metrics**: Custom lock-free rolling windows + Micrometer
- **Concurrency**: ScheduledExecutorService, AtomicLongArray
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Visualization**: Recharts for metrics, Canvas API for particles
- **Real-time updates**: Spring WebSockets

## Configuration

Key parameters in `application.yml`:

```yaml
sentinel:
  proxy:
    requestTimeout: 5000              # Request timeout in milliseconds
    maxConnections: 200               # Max concurrent connections per backend

  metrics:
    windowDuration: 20                # Rolling window size in seconds
    windowBuckets: 20                 # Number of buckets (1s granularity)
    ewmaAlpha: 0.3                    # EWMA smoothing factor

  control:
    loopInterval: 5                   # Control loop runs every 5 seconds
    maxWeightChangePercent: 10        # Max ±10% weight change per cycle
    minObservationPeriod: 15          # 15s observation before action
    cooldownPeriod: 20                # 20s cooldown after state changes
    sustainedDegradationCycles: 3     # 3 cycles = sustained degradation
    rampUpStepSeconds: 10             # 10s per ramp-up stage

    health:
      latencyDegradedMultiplier: 1.5  # p95 > 1.5x baseline = degraded
      latencyUnhealthyMultiplier: 2.5 # p95 > 2.5x baseline = unhealthy
      errorRateWarning: 5.0           # 5% error rate = warning
      errorRateCritical: 15.0         # 15% error rate = critical
      saturationWarning: 70.0         # 70% capacity = warning
      saturationCritical: 90.0        # 90% capacity = critical

    circuitBreaker:
      failureThreshold: 5             # 5 failures trigger circuit
      failureWindow: 20               # Within 20 second window
      timeoutRateThreshold: 20.0      # Or 20% timeout rate triggers
      retryDelay: 10                  # Retry after 10 seconds in OPEN
      probeRate: 5.0                  # 5% probe traffic in HALF_OPEN
```

## Setup and Usage

### Local Development

```bash
# Start all services with Docker Compose
docker-compose -f docker-compose.local.yml up --build

# Access dashboard at http://localhost:3000
# Sentinel API at http://localhost:8080
```

### Dashboard Features

The real-time dashboard provides complete observability:

- **Animated traffic flow**: Particles show weighted distribution to backends
- **Backend metrics**: Latency (p50/p95/p99), error rate, RPS, health score
- **Circuit states**: Visual indicators (CLOSED/green, OPEN/red, HALF_OPEN/yellow)
- **Ramp-up progress**: Shows current percentage during gradual recovery
- **System mode**: STABLE, DEGRADING, OVERLOADED, RECOVERING
- **Activity log**: Chronological events with explanations

### Failure Injection Controls

The dashboard includes controls for testing system behavior:

**Inject Latency**: Simulate slow backend responses (100ms - 5000ms)
**Inject Errors**: Simulate service degradation (0% - 100% error rate)
**Crash Backend**: Simulate complete backend failure (100% error rate)
**Traffic Spike**: Multiply current traffic (2x, 5x, 10x)
**Reset**: Return all backends to baseline health

## Testing Scenarios

### Scenario 1: Backend Slowdown
1. Set traffic to 1000 RPS using the slider
2. Click "Inject Latency" on backend-1, set to 500ms
3. Observe:
   - Health score decreases (Speed signal at 40% weight)
   - After 15 seconds (3 cycles), weight reduces by 10%
   - Traffic shifts proportionally to healthy backends
   - System mode changes from STABLE to DEGRADING
   - Activity log explains each decision

### Scenario 2: Circuit Breaker Activation
1. Click "Inject Errors" on backend-2, set to 90%
2. Observe:
   - Error rate jumps above 15% critical threshold
   - After 5 failures in 20 seconds, circuit opens
   - Backend-2 receives zero production traffic
   - System mode indicates DEGRADING
   - After 10 seconds, circuit enters HALF_OPEN
   - Only 5% probe traffic sent to test recovery

### Scenario 3: Gradual Recovery
1. Click "Reset" on the previously degraded backend
2. Observe:
   - Error rate drops to 0%
   - Probe traffic succeeds
   - Circuit closes
   - Ramp-up begins at 5% effective weight
   - Every 10 seconds: 5% → 20% → 40% → 60% → 80% → 100%
   - Particle count increases gradually
   - If backend degrades during ramp-up, process cancels

### Scenario 4: Traffic Spike vs Degradation
1. Start with 1000 RPS, all backends healthy
2. Click "2x Traffic Spike"
3. Observe:
   - All backends see increased latency proportionally
   - System detects spike (not degradation)
   - No weight changes occur
   - System mode may show OVERLOADED
4. Reduce traffic back to normal
5. Now inject latency to just backend-1
6. Observe:
   - Only backend-1 shows degradation
   - System correctly identifies this as backend issue
   - Weight reduces for backend-1 only

## Implementation Details

### Why Weighted Random Selection?
Weighted random provides smoother traffic distribution during weight transitions compared to round-robin. When changing from 50-50 to 60-40, weighted random converges gradually instead of causing abrupt pattern changes that can destabilize backends.

### Why Fixed Latency Buckets?
Fixed buckets ensure consistent percentile calculation regardless of load. The buckets [10, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000, 2500, 5000]ms provide good resolution across expected latency ranges while remaining deterministic.

### Why EWMA for Trends?
Simple moving averages weight all observations equally, causing delayed reaction to trends. EWMA with alpha=0.3 gives 30% weight to new values and 70% to historical average, detecting trends faster while filtering noise.

### Why Sustained Detection?
Single-cycle anomalies often represent transient issues (GC pauses, network blips). Requiring 3 consecutive degraded cycles (15 seconds) filters false positives while still catching real degradation quickly enough to prevent cascading failures.

### Why Separate Effective Weight?
Keeping base weight separate from effective weight allows clean separation of concerns:
- Base weight represents long-term traffic distribution decided by control plane
- Effective weight represents actual routing weight including ramp-up state
- Router only cares about effective weight
- Control plane only adjusts base weight
- Ramp-up logic manages the transition between them

## Monitoring

Sentinel exposes Prometheus-compatible metrics at `/actuator/prometheus`:

```
# Request metrics per backend
sentinel_requests_total{backend="backend-1",status="200"}
sentinel_request_duration_seconds{backend="backend-1",quantile="0.95"}

# Control plane decisions
sentinel_weight_adjustments_total{backend="backend-1",direction="decrease"}
sentinel_circuit_state_changes_total{backend="backend-1",state="open"}

# System health
sentinel_system_mode{mode="STABLE"}
sentinel_backends_total{state="HEALTHY"}
```

## Project Structure

```
sentinel/
├── proxy/                          # Java backend (Spring Boot)
│   ├── src/main/java/com/sentinel/
│   │   ├── model/                  # Domain models (Backend, BackendState, etc.)
│   │   ├── proxy/                  # Data plane (routing, HTTP client)
│   │   ├── metrics/                # Metrics layer (rolling windows, percentiles)
│   │   ├── control/                # Control plane (health, weights, circuit breaker)
│   │   ├── websocket/              # WebSocket broadcasting
│   │   └── api/                    # REST API controllers
│   └── src/main/resources/
│       └── application.yml         # Configuration
├── dashboard/                      # Next.js frontend
│   ├── app/                        # App router pages
│   ├── components/                 # React components
│   │   ├── RequestFlow.tsx         # Animated traffic visualization
│   │   └── Commentary.tsx          # Activity log
│   └── public/                     # Static assets
├── simulator/                      # Test backend services
│   └── src/main/java/              # Failure injection endpoints
└── docker-compose.local.yml        # Local development setup
```

## License

MIT License
