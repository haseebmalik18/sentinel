package com.sentinel.control;

import com.sentinel.metrics.BackendMetrics;
import com.sentinel.metrics.MetricsRegistry;
import com.sentinel.model.Backend;
import com.sentinel.model.BackendHealth;
import com.sentinel.model.BackendState;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class HealthScorer {

    private final double latencyDegradedMultiplier;
    private final double latencyUnhealthyMultiplier;
    private final double errorRateWarning;
    private final double errorRateCritical;
    private final double varianceUnstableMultiplier;
    private final double saturationWarning;
    private final double saturationCritical;

    public HealthScorer(
            @Value("${sentinel.control.health.latencyDegradedMultiplier:1.5}") double latencyDegradedMultiplier,
            @Value("${sentinel.control.health.latencyUnhealthyMultiplier:2.5}") double latencyUnhealthyMultiplier,
            @Value("${sentinel.control.health.errorRateWarning:5.0}") double errorRateWarning,
            @Value("${sentinel.control.health.errorRateCritical:15.0}") double errorRateCritical,
            @Value("${sentinel.control.health.varianceUnstableMultiplier:2.0}") double varianceUnstableMultiplier,
            @Value("${sentinel.control.health.saturationWarning:70.0}") double saturationWarning,
            @Value("${sentinel.control.health.saturationCritical:90.0}") double saturationCritical) {
        this.latencyDegradedMultiplier = latencyDegradedMultiplier;
        this.latencyUnhealthyMultiplier = latencyUnhealthyMultiplier;
        this.errorRateWarning = errorRateWarning;
        this.errorRateCritical = errorRateCritical;
        this.varianceUnstableMultiplier = varianceUnstableMultiplier;
        this.saturationWarning = saturationWarning;
        this.saturationCritical = saturationCritical;
    }

    public Map<String, BackendHealth> scoreAllBackends(List<Backend> backends, MetricsRegistry registry) {
        Map<String, BackendHealth> healthMap = new HashMap<>();

        double avgP95 = calculateAverageP95(backends, registry);

        for (Backend backend : backends) {
            var metrics = registry.get(backend.getId());
            if (metrics.isEmpty()) {
                continue;
            }

            BackendHealth health = scoreBackend(backend, metrics.get(), avgP95);
            healthMap.put(backend.getId(), health);
        }

        return healthMap;
    }

    private BackendHealth scoreBackend(Backend backend, BackendMetrics metrics, double avgP95) {
        double speedScore = calculateSpeedScore(metrics, avgP95);
        double stabilityScore = calculateStabilityScore(metrics);
        double saturationScore = calculateSaturationScore(metrics);
        double reliabilityScore = calculateReliabilityScore(metrics);

        double overallScore = BackendHealth.calculateOverallScore(
                speedScore, stabilityScore, saturationScore, reliabilityScore);

        BackendState state = deriveStateWithRecovery(backend, overallScore, metrics);

        boolean latencyIncreasing = metrics.getLatencyTrend() > metrics.getP95Latency();
        boolean errorsIncreasing = metrics.getErrorRateTrend() > metrics.getErrorRate();
        boolean saturationIncreasing = metrics.getInflightCount() > 0;

        return BackendHealth.builder()
                .backendId(backend.getId())
                .speedScore(speedScore)
                .stabilityScore(stabilityScore)
                .saturationScore(saturationScore)
                .reliabilityScore(reliabilityScore)
                .overallScore(overallScore)
                .state(state)
                .latencyIncreasing(latencyIncreasing)
                .errorsIncreasing(errorsIncreasing)
                .saturationIncreasing(saturationIncreasing)
                .build();
    }

    private double calculateSpeedScore(BackendMetrics metrics, double avgP95) {
        long p95 = metrics.getP95Latency();
        if (avgP95 == 0 || p95 == 0) {
            return 100.0;
        }

        double ratio = p95 / avgP95;

        if (ratio <= 1.0) {
            return 100.0;
        } else if (ratio <= latencyDegradedMultiplier) {
            return 100.0 - ((ratio - 1.0) * 50.0);
        } else if (ratio <= latencyUnhealthyMultiplier) {
            return 50.0 - ((ratio - latencyDegradedMultiplier) * 40.0);
        } else {
            return Math.max(0.0, 10.0 - ((ratio - latencyUnhealthyMultiplier) * 10.0));
        }
    }

    private double calculateStabilityScore(BackendMetrics metrics) {
        double variance = metrics.getLatencyVariance();

        if (variance <= 0.5) {
            return 100.0;
        } else if (variance <= varianceUnstableMultiplier) {
            return 100.0 - ((variance - 0.5) * 40.0);
        } else {
            return Math.max(0.0, 60.0 - ((variance - varianceUnstableMultiplier) * 30.0));
        }
    }

    private double calculateSaturationScore(BackendMetrics metrics) {
        long inflight = metrics.getInflightCount();
        long rps = metrics.getRequestsPerSecond();

        if (rps == 0) {
            return 100.0;
        }

        double saturationPercent = (inflight * 100.0) / Math.max(rps, 1);

        if (saturationPercent <= saturationWarning) {
            return 100.0;
        } else if (saturationPercent <= saturationCritical) {
            return 100.0 - ((saturationPercent - saturationWarning) * 2.0);
        } else {
            return Math.max(0.0, 50.0 - ((saturationPercent - saturationCritical) * 5.0));
        }
    }

    private double calculateReliabilityScore(BackendMetrics metrics) {
        double errorRate = metrics.getErrorRate();

        if (errorRate <= errorRateWarning) {
            return 100.0;
        } else if (errorRate <= errorRateCritical) {
            return 100.0 - ((errorRate - errorRateWarning) * 5.0);
        } else {
            return Math.max(0.0, 50.0 - ((errorRate - errorRateCritical) * 2.0));
        }
    }

    private BackendState deriveState(double overallScore, BackendMetrics metrics) {
        if (overallScore >= 70.0) {
            return BackendState.HEALTHY;
        } else if (overallScore >= 40.0) {
            return BackendState.DEGRADING;
        } else {
            return BackendState.UNHEALTHY;
        }
    }

    private BackendState deriveStateWithRecovery(Backend backend, double overallScore, BackendMetrics metrics) {
        var circuitState = backend.getCircuitState();
        var lastStateChange = backend.getLastStateChange();
        var now = java.time.Instant.now();

        if (circuitState == com.sentinel.model.CircuitState.HALF_OPEN) {
            return BackendState.RECOVERING;
        }

        if (circuitState == com.sentinel.model.CircuitState.CLOSED && lastStateChange != null) {
            long secondsSinceTransition = now.getEpochSecond() - lastStateChange.getEpochSecond();
            if (secondsSinceTransition < 30) {
                return BackendState.RECOVERING;
            }
        }

        return deriveState(overallScore, metrics);
    }

    private double calculateAverageP95(List<Backend> backends, MetricsRegistry registry) {
        return backends.stream()
                .map(b -> registry.get(b.getId()))
                .filter(opt -> opt.isPresent())
                .mapToLong(opt -> opt.get().getP95Latency())
                .filter(p95 -> p95 > 0)
                .average()
                .orElse(100.0);
    }
}
