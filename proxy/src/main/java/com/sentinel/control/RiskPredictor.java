package com.sentinel.control;

import com.sentinel.metrics.MetricsRegistry;
import com.sentinel.model.BackendHealth;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Map;

@Slf4j
@Component
public class RiskPredictor {

    public RiskLevel predictRisk(Map<String, BackendHealth> healthAssessments, MetricsRegistry registry) {
        if (healthAssessments.isEmpty()) {
            return RiskLevel.LOW;
        }

        long degradedCount = healthAssessments.values().stream()
                .filter(h -> h.getState() == com.sentinel.model.BackendState.DEGRADED ||
                             h.getState() == com.sentinel.model.BackendState.UNHEALTHY)
                .count();

        long unhealthyCount = healthAssessments.values().stream()
                .filter(h -> h.getState() == com.sentinel.model.BackendState.UNHEALTHY)
                .count();

        long trendingWorse = healthAssessments.values().stream()
                .filter(BackendHealth::isDegrading)
                .count();

        double degradedRatio = (double) degradedCount / healthAssessments.size();
        double unhealthyRatio = (double) unhealthyCount / healthAssessments.size();
        double trendingRatio = (double) trendingWorse / healthAssessments.size();

        if (unhealthyRatio >= 0.5 || degradedRatio >= 0.75) {
            return RiskLevel.HIGH;
        }

        if (unhealthyRatio >= 0.25 || degradedRatio >= 0.5 || trendingRatio >= 0.5) {
            return RiskLevel.MEDIUM;
        }

        return RiskLevel.LOW;
    }
}
