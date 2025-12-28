package com.sentinel.metrics;

import com.sentinel.model.RequestOutcome;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@ConditionalOnProperty(name = "sentinel.metrics.enabled", havingValue = "false")
public class NoOpMetricsCollector implements MetricsCollector {

    @Override
    public void record(RequestOutcome outcome) {
        log.debug("Recorded outcome: backend={}, latency={}ms, status={}, success={}",
                outcome.getBackendId(), outcome.getLatencyMs(), outcome.getStatusCode(), outcome.isSuccess());
    }
}
