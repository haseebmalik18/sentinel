package com.sentinel.metrics;

import com.sentinel.model.RequestOutcome;

public interface MetricsCollector {
    void record(RequestOutcome outcome);
}
