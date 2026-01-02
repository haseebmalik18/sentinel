package com.sentinel.metrics;

import com.sentinel.model.RequestOutcome;
import lombok.Getter;

import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;

@Getter
public class BackendMetrics {

    private final String backendId;
    private final RollingWindow requestCount;
    private final RollingWindow errorCount;
    private final RollingWindow timeoutCount;
    private final RollingHistogram latencyHistogram;
    private final EWMACalculator latencyEWMA;
    private final EWMACalculator errorRateEWMA;
    private final AtomicLong inflightRequests = new AtomicLong(0);
    private volatile Instant lastUpdate;

    private final long[] latencyBuckets = {
        5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100,
        120, 140, 160, 180, 200, 225, 250, 300,
        400, 500, 600, 700, 800, 900, 1000, 1200, 1500, 2000, 3000, 5000, 10000
    };

    public BackendMetrics(String backendId, int windowDuration, int numBuckets, double ewmaAlpha) {
        this.backendId = backendId;
        this.requestCount = new RollingWindow(windowDuration, numBuckets);
        this.errorCount = new RollingWindow(windowDuration, numBuckets);
        this.timeoutCount = new RollingWindow(windowDuration, numBuckets);
        this.latencyHistogram = new RollingHistogram(windowDuration, numBuckets, latencyBuckets);
        this.latencyEWMA = new EWMACalculator(ewmaAlpha);
        this.errorRateEWMA = new EWMACalculator(ewmaAlpha);
        this.lastUpdate = Instant.now();
    }

    public void record(RequestOutcome outcome) {
        requestCount.increment(1);
        latencyHistogram.record(outcome.getLatencyMs());
        latencyEWMA.update(outcome.getLatencyMs());

        if (outcome.isError() || outcome.isServerError()) {
            errorCount.increment(1);
        }

        if (outcome.isTimeout()) {
            timeoutCount.increment(1);
        }

        double currentErrorRate = getErrorRate();
        errorRateEWMA.update(currentErrorRate);

        lastUpdate = Instant.now();
    }

    public void incrementInflight() {
        inflightRequests.incrementAndGet();
    }

    public void decrementInflight() {
        inflightRequests.decrementAndGet();
    }

    public long getRequestsPerSecond() {
        return requestCount.sum() / 30;
    }

    public double getErrorRate() {
        long total = requestCount.sum();
        if (total == 0) {
            return 0.0;
        }
        return (errorCount.sum() * 100.0) / total;
    }

    public double getTimeoutRate() {
        long total = requestCount.sum();
        if (total == 0) {
            return 0.0;
        }
        return (timeoutCount.sum() * 100.0) / total;
    }

    public long getP50Latency() {
        return latencyHistogram.getP50();
    }

    public long getP95Latency() {
        return latencyHistogram.getP95();
    }

    public long getP99Latency() {
        return latencyHistogram.getP99();
    }

    public double getLatencyTrend() {
        return latencyEWMA.getValue();
    }

    public double getErrorRateTrend() {
        return errorRateEWMA.getValue();
    }

    public long getInflightCount() {
        return inflightRequests.get();
    }

    public double getLatencyVariance() {
        long p50 = getP50Latency();
        long p99 = getP99Latency();

        if (p50 == 0) {
            return 0.0;
        }

        return (double) (p99 - p50) / p50;
    }
}
