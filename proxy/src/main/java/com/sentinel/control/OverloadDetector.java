package com.sentinel.control;

import com.sentinel.metrics.BackendMetrics;
import com.sentinel.metrics.MetricsRegistry;
import com.sentinel.model.Backend;
import com.sentinel.model.BackendHealth;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
public class OverloadDetector {

    private final Map<String, Long> previousRps = new ConcurrentHashMap<>();
    private long systemPreviousRps = 0;

    public OverloadType detectOverloadType(List<Backend> backends, 
                                          Map<String, BackendHealth> healthAssessments,
                                          MetricsRegistry registry) {
        
        long currentSystemRps = calculateSystemRps(backends, registry);
        double rpsGrowthPercent = calculateRpsGrowth(currentSystemRps);
        
        double avgHealthScore = healthAssessments.values().stream()
                .mapToDouble(h -> h.getOverallScore())
                .average()
                .orElse(100.0);
        
        long degradedCount = healthAssessments.values().stream()
                .filter(h -> h.getOverallScore() < 70.0)
                .count();
        
        double degradedPercent = healthAssessments.isEmpty() ? 0.0 
                : (double) degradedCount / healthAssessments.size() * 100;

        systemPreviousRps = currentSystemRps;

        if (rpsGrowthPercent > 50 && avgHealthScore > 60) {
            log.info("Detected TRAFFIC_SPIKE: RPS growth {}%, avg health {}", 
                    String.format("%.1f", rpsGrowthPercent), 
                    String.format("%.1f", avgHealthScore));
            return OverloadType.TRAFFIC_SPIKE;
        }

        if (degradedPercent > 30 && rpsGrowthPercent < 30) {
            log.info("Detected BACKEND_DEGRADATION: {}% backends degraded, RPS growth {}%",
                    String.format("%.1f", degradedPercent),
                    String.format("%.1f", rpsGrowthPercent));
            return OverloadType.BACKEND_DEGRADATION;
        }

        if (rpsGrowthPercent > 50 && degradedPercent > 30) {
            log.warn("Detected COMBINED_OVERLOAD: RPS growth {}%, {}% backends degraded",
                    String.format("%.1f", rpsGrowthPercent),
                    String.format("%.1f", degradedPercent));
            return OverloadType.COMBINED_OVERLOAD;
        }

        return OverloadType.NONE;
    }

    private long calculateSystemRps(List<Backend> backends, MetricsRegistry registry) {
        return backends.stream()
                .mapToLong(b -> registry.get(b.getId())
                        .map(BackendMetrics::getRequestsPerSecond)
                        .orElse(0L))
                .sum();
    }

    private double calculateRpsGrowth(long currentRps) {
        if (systemPreviousRps == 0) {
            return 0.0;
        }
        return ((double) (currentRps - systemPreviousRps) / systemPreviousRps) * 100;
    }

    @Getter
    public enum OverloadType {
        NONE("No overload detected"),
        TRAFFIC_SPIKE("Traffic spike - backends healthy but high load"),
        BACKEND_DEGRADATION("Backend degradation - backends failing"),
        COMBINED_OVERLOAD("Combined - high traffic and backend issues");

        private final String description;

        OverloadType(String description) {
            this.description = description;
        }
    }
}
