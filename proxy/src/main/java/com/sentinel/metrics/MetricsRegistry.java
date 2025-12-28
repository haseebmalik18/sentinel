package com.sentinel.metrics;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
public class MetricsRegistry {

    private final Map<String, BackendMetrics> metricsMap = new ConcurrentHashMap<>();
    private final int windowDuration;
    private final int numBuckets;
    private final double ewmaAlpha;

    public MetricsRegistry(@Value("${sentinel.metrics.windowDuration:30}") int windowDuration,
                          @Value("${sentinel.metrics.windowBuckets:30}") int numBuckets,
                          @Value("${sentinel.metrics.ewmaAlpha:0.3}") double ewmaAlpha) {
        this.windowDuration = windowDuration;
        this.numBuckets = numBuckets;
        this.ewmaAlpha = ewmaAlpha;
    }

    public BackendMetrics getOrCreate(String backendId) {
        return metricsMap.computeIfAbsent(backendId, id -> {
            log.info("Creating metrics for backend: {}", id);
            return new BackendMetrics(id, windowDuration, numBuckets, ewmaAlpha);
        });
    }

    public Optional<BackendMetrics> get(String backendId) {
        return Optional.ofNullable(metricsMap.get(backendId));
    }

    public Map<String, BackendMetrics> getAll() {
        return Map.copyOf(metricsMap);
    }

    public void remove(String backendId) {
        metricsMap.remove(backendId);
        log.info("Removed metrics for backend: {}", backendId);
    }
}
