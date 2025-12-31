package com.sentinel.control;

import com.sentinel.metrics.BackendMetrics;
import com.sentinel.metrics.MetricsRegistry;
import com.sentinel.model.BackendHealth;
import com.sentinel.model.BackendState;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Component
public class RiskPredictor {

    private static final int MIN_REQUESTS_FOR_EVALUATION = 10;
    private static final int MIN_UNHEALTHY_COUNT = 2;
    private final double maxDegradedPercent;

    public RiskPredictor(@Value("${sentinel.control.risk.maxDegradedPercent:0.5}") double maxDegradedPercent) {
        this.maxDegradedPercent = maxDegradedPercent;
    }

    public RiskLevel predictRisk(Map<String, BackendHealth> healthAssessments, MetricsRegistry registry) {
        if (healthAssessments.isEmpty()) {
            return RiskLevel.LOW;
        }

        Map<String, BackendHealth> validBackends = healthAssessments.entrySet().stream()
                .filter(e -> hasSufficientMetrics(e.getKey(), registry))
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));

        if (validBackends.size() < 2) {
            log.debug("Insufficient backends with metrics for risk evaluation: {}/{}",
                    validBackends.size(), healthAssessments.size());
            return RiskLevel.LOW;
        }

        long degradedCount = validBackends.values().stream()
                .filter(h -> h.getState() == BackendState.DEGRADING ||
                             h.getState() == BackendState.UNHEALTHY)
                .count();

        long unhealthyCount = validBackends.values().stream()
                .filter(h -> h.getState() == BackendState.UNHEALTHY)
                .count();

        long trendingWorse = validBackends.values().stream()
                .filter(BackendHealth::isDegrading)
                .count();

        double degradedRatio = (double) degradedCount / validBackends.size();
        double unhealthyRatio = (double) unhealthyCount / validBackends.size();
        double trendingRatio = (double) trendingWorse / validBackends.size();

        if (degradedRatio > maxDegradedPercent) {
            log.warn("Too many backends degraded ({}/{}={}%), limiting risk to MEDIUM for capacity protection",
                    degradedCount, validBackends.size(), String.format("%.0f", degradedRatio * 100));
            return RiskLevel.MEDIUM;
        }

        if (unhealthyCount >= MIN_UNHEALTHY_COUNT && unhealthyRatio >= 0.5) {
            return RiskLevel.HIGH;
        }

        if (degradedCount >= MIN_UNHEALTHY_COUNT && degradedRatio >= 0.5) {
            return RiskLevel.HIGH;
        }

        if (unhealthyRatio >= 0.25 || degradedRatio >= 0.33 || trendingRatio >= 0.5) {
            return RiskLevel.MEDIUM;
        }

        return RiskLevel.LOW;
    }

    private boolean hasSufficientMetrics(String backendId, MetricsRegistry registry) {
        return registry.get(backendId)
                .map(BackendMetrics::getRequestCount)
                .map(rw -> rw.sum() >= MIN_REQUESTS_FOR_EVALUATION)
                .orElse(false);
    }
}

