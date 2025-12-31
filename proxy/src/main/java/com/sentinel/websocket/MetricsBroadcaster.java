package com.sentinel.websocket;

import com.sentinel.control.HealthScorer;
import com.sentinel.control.OverloadDetector.OverloadType;
import com.sentinel.control.RiskLevel;
import com.sentinel.metrics.MetricsRegistry;
import com.sentinel.model.Backend;
import com.sentinel.model.BackendHealth;
import com.sentinel.model.BackendState;
import com.sentinel.model.SystemMode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class MetricsBroadcaster {

    private final MetricsWebSocketHandler webSocketHandler;
    private final MetricsRegistry metricsRegistry;

    public void broadcastMetrics(
            List<Backend> backends,
            Map<String, BackendHealth> healthAssessments,
            SystemMode systemMode,
            RiskLevel riskLevel,
            OverloadType overloadType
    ) {
        try {
            var backendSnapshots = backends.stream()
                    .map(backend -> {
                        var health = healthAssessments.get(backend.getId());
                        var metricsOpt = metricsRegistry.get(backend.getId());

                        var metricsData = metricsOpt.map(metrics ->
                                MetricsSnapshot.MetricsData.builder()
                                        .p50Latency(metrics.getP50Latency())
                                        .p95Latency(metrics.getP95Latency())
                                        .p99Latency(metrics.getP99Latency())
                                        .errorRate(metrics.getErrorRate())
                                        .timeoutRate(metrics.getTimeoutRate())
                                        .inflightRequests((int) metrics.getInflightCount())
                                        .requestRate(metrics.getRequestsPerSecond())
                                        .build()
                        ).orElse(MetricsSnapshot.MetricsData.builder()
                                .p50Latency(0)
                                .p95Latency(0)
                                .p99Latency(0)
                                .errorRate(0)
                                .timeoutRate(0)
                                .inflightRequests(0)
                                .requestRate(0)
                                .build());

                        return MetricsSnapshot.BackendSnapshot.builder()
                                .id(backend.getId())
                                .url(backend.getUrl())
                                .weight(backend.getWeight())
                                .state(backend.getState())
                                .circuitState(backend.getCircuitState())
                                .metrics(metricsData)
                                .healthScore(health != null ? health.getOverallScore() : 0.0)
                                .build();
                    })
                    .toList();

            var systemStats = calculateSystemStats(backends, backendSnapshots);

            var snapshot = MetricsSnapshot.builder()
                    .timestamp(System.currentTimeMillis())
                    .systemMode(systemMode)
                    .riskLevel(riskLevel)
                    .overloadType(overloadType)
                    .backends(backendSnapshots)
                    .systemStats(systemStats)
                    .build();

            webSocketHandler.broadcast(snapshot);

        } catch (Exception e) {
            log.error("Failed to broadcast metrics", e);
        }
    }

    private MetricsSnapshot.SystemStats calculateSystemStats(
            List<Backend> backends,
            List<MetricsSnapshot.BackendSnapshot> snapshots
    ) {
        int totalBackends = backends.size();
        int healthyBackends = (int) backends.stream()
                .filter(b -> b.getState() == BackendState.HEALTHY)
                .count();
        int degradedBackends = (int) backends.stream()
                .filter(b -> b.getState() == BackendState.DEGRADED)
                .count();
        int unhealthyBackends = (int) backends.stream()
                .filter(b -> b.getState() == BackendState.UNHEALTHY)
                .count();

        double totalRps = snapshots.stream()
                .mapToDouble(s -> s.getMetrics().getRequestRate())
                .sum();

        double avgLatency = snapshots.stream()
                .mapToDouble(s -> s.getMetrics().getP50Latency())
                .average()
                .orElse(0.0);

        return MetricsSnapshot.SystemStats.builder()
                .totalBackends(totalBackends)
                .healthyBackends(healthyBackends)
                .degradedBackends(degradedBackends)
                .unhealthyBackends(unhealthyBackends)
                .totalRps(totalRps)
                .avgLatency(avgLatency)
                .build();
    }
}
