package com.sentinel.metrics;

import java.time.Instant;
import java.util.concurrent.locks.ReadWriteLock;
import java.util.concurrent.locks.ReentrantReadWriteLock;

public class RollingHistogram {

    private final long[] latencyBuckets;
    private final int windowDuration;
    private final int numBuckets;
    private final LatencyHistogram[] histograms;
    private final ReadWriteLock lock = new ReentrantReadWriteLock();

    private int currentBucketIndex = 0;
    private long lastRotation;

    public RollingHistogram(int windowDuration, int numBuckets, long[] latencyBuckets) {
        this.windowDuration = windowDuration;
        this.numBuckets = numBuckets;
        this.latencyBuckets = latencyBuckets;
        this.histograms = new LatencyHistogram[numBuckets];

        for (int i = 0; i < numBuckets; i++) {
            histograms[i] = new LatencyHistogram(latencyBuckets);
        }

        this.lastRotation = Instant.now().toEpochMilli();
    }

    public void record(long latencyMs) {
        lock.readLock().lock();
        try {
            rotate();
            histograms[currentBucketIndex].record(latencyMs);
        } finally {
            lock.readLock().unlock();
        }
    }

    public long getP50() {
        return getPercentile(50.0);
    }

    public long getP95() {
        return getPercentile(95.0);
    }

    public long getP99() {
        return getPercentile(99.0);
    }

    private long getPercentile(double percentile) {
        lock.readLock().lock();
        try {
            rotate();

            long[] aggregatedCounts = new long[latencyBuckets.length + 1];
            long totalCount = 0;

            for (LatencyHistogram histogram : histograms) {
                long[] counts = histogram.getCounts();
                for (int i = 0; i < counts.length; i++) {
                    aggregatedCounts[i] += counts[i];
                    totalCount += counts[i];
                }
            }

            if (totalCount == 0) {
                return 0;
            }

            long targetCount = (long) (totalCount * percentile / 100.0);
            long cumulative = 0;

            for (int i = 0; i < aggregatedCounts.length; i++) {
                cumulative += aggregatedCounts[i];
                if (cumulative >= targetCount) {
                    if (i == 0) {
                        return latencyBuckets[0];
                    } else if (i >= latencyBuckets.length) {
                        return latencyBuckets[latencyBuckets.length - 1];
                    } else {
                        return latencyBuckets[i];
                    }
                }
            }

            return latencyBuckets[latencyBuckets.length - 1];
        } finally {
            lock.readLock().unlock();
        }
    }

    private void rotate() {
        long now = Instant.now().toEpochMilli();
        long elapsed = now - lastRotation;
        long bucketDuration = (windowDuration * 1000L) / numBuckets;

        if (elapsed >= bucketDuration) {
            lock.readLock().unlock();
            lock.writeLock().lock();
            try {
                elapsed = now - lastRotation;
                if (elapsed >= bucketDuration) {
                    int bucketsToRotate = (int) Math.min(elapsed / bucketDuration, numBuckets);

                    for (int i = 0; i < bucketsToRotate; i++) {
                        currentBucketIndex = (currentBucketIndex + 1) % numBuckets;
                        histograms[currentBucketIndex].reset();
                    }

                    lastRotation = now;
                }
            } finally {
                lock.readLock().lock();
                lock.writeLock().unlock();
            }
        }
    }

    public void reset() {
        lock.writeLock().lock();
        try {
            for (LatencyHistogram histogram : histograms) {
                histogram.reset();
            }
            currentBucketIndex = 0;
            lastRotation = Instant.now().toEpochMilli();
        } finally {
            lock.writeLock().unlock();
        }
    }
}
