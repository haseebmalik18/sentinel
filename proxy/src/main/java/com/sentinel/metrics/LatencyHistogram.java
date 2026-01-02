package com.sentinel.metrics;

import java.util.Arrays;
import java.util.concurrent.atomic.AtomicLongArray;

public class LatencyHistogram {

    private final long[] bucketBounds;
    private final AtomicLongArray counts;

    public LatencyHistogram(long[] bucketBounds) {
        this.bucketBounds = Arrays.copyOf(bucketBounds, bucketBounds.length);
        Arrays.sort(this.bucketBounds);
        this.counts = new AtomicLongArray(bucketBounds.length + 1);
    }

    public void record(long latencyMs) {
        int bucketIndex = findBucketIndex(latencyMs);
        counts.incrementAndGet(bucketIndex);
    }

    public long getPercentile(double percentile) {
        long total = getTotalCount();
        if (total == 0) {
            return 0;
        }

        long targetCount = (long) (total * percentile / 100.0);
        long cumulative = 0;

        for (int i = 0; i < counts.length(); i++) {
            cumulative += counts.get(i);
            if (cumulative >= targetCount) {
                if (i == 0) {
                    return bucketBounds[0];
                } else if (i >= bucketBounds.length) {
                    return bucketBounds[bucketBounds.length - 1];
                } else {
                    return bucketBounds[i];
                }
            }
        }

        return bucketBounds[bucketBounds.length - 1];
    }

    public long getP50() {
        return getPercentile(50);
    }

    public long getP95() {
        return getPercentile(95);
    }

    public long getP99() {
        return getPercentile(99);
    }

    public long getTotalCount() {
        long total = 0;
        for (int i = 0; i < counts.length(); i++) {
            total += counts.get(i);
        }
        return total;
    }

    public void reset() {
        for (int i = 0; i < counts.length(); i++) {
            counts.set(i, 0);
        }
    }

    public long[] getCounts() {
        long[] result = new long[counts.length()];
        for (int i = 0; i < counts.length(); i++) {
            result[i] = counts.get(i);
        }
        return result;
    }

    private int findBucketIndex(long latencyMs) {
        for (int i = 0; i < bucketBounds.length; i++) {
            if (latencyMs <= bucketBounds[i]) {
                return i;
            }
        }
        return bucketBounds.length;
    }
}
