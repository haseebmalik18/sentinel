package com.sentinel.websocket;

import com.sentinel.model.BackendState;
import com.sentinel.model.CircuitState;
import com.sentinel.model.SystemMode;
import com.sentinel.control.RiskLevel;
import com.sentinel.control.OverloadDetector.OverloadType;
import lombok.Builder;
import lombok.Value;

import java.util.List;

@Value
@Builder
public class MetricsSnapshot {
    long timestamp;
    SystemMode systemMode;
    RiskLevel riskLevel;
    OverloadType overloadType;
    List<BackendSnapshot> backends;
    SystemStats systemStats;

    @Value
    @Builder
    public static class BackendSnapshot {
        String id;
        String url;
        int weight;
        BackendState state;
        CircuitState circuitState;
        MetricsData metrics;
        double healthScore;
        int rampUpPercentage;
    }

    @Value
    @Builder
    public static class MetricsData {
        double p50Latency;
        double p95Latency;
        double p99Latency;
        double errorRate;
        double timeoutRate;
        int inflightRequests;
        double requestRate;
    }

    @Value
    @Builder
    public static class SystemStats {
        int totalBackends;
        int healthyBackends;
        int degradedBackends;
        int unhealthyBackends;
        double totalRps;
        double avgLatency;
    }
}
