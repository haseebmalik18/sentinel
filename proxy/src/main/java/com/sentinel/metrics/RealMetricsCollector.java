package com.sentinel.metrics;

import com.sentinel.model.RequestOutcome;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "sentinel.metrics.enabled", havingValue = "true", matchIfMissing = true)
public class RealMetricsCollector implements MetricsCollector {

    private final MetricsRegistry metricsRegistry;

    @Override
    public void record(RequestOutcome outcome) {
        BackendMetrics metrics = metricsRegistry.getOrCreate(outcome.getBackendId());
        metrics.record(outcome);

        if (log.isDebugEnabled()) {
            log.debug("Recorded: backend={}, latency={}ms, status={}, p95={}, errorRate={}%",
                    outcome.getBackendId(),
                    outcome.getLatencyMs(),
                    outcome.getStatusCode(),
                    metrics.getP95Latency(),
                    String.format("%.2f", metrics.getErrorRate()));
        }
    }
}
