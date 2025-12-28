package com.sentinel.metrics;

import java.time.Instant;
import java.util.concurrent.atomic.AtomicLongArray;
import java.util.concurrent.locks.ReadWriteLock;
import java.util.concurrent.locks.ReentrantReadWriteLock;

public class RollingWindow {

    private final int numBuckets;
    private final int bucketDurationMs;
    private final AtomicLongArray buckets;
    private final ReadWriteLock lock = new ReentrantReadWriteLock();
    private volatile long lastRotation;

    public RollingWindow(int windowDurationSeconds, int numBuckets) {
        this.numBuckets = numBuckets;
        this.bucketDurationMs = (windowDurationSeconds * 1000) / numBuckets;
        this.buckets = new AtomicLongArray(numBuckets);
        this.lastRotation = Instant.now().toEpochMilli();
    }

    public void increment(long value) {
        rotateBucketsIfNeeded();
        int currentBucket = getCurrentBucketIndex();
        buckets.addAndGet(currentBucket, value);
    }

    public long sum() {
        rotateBucketsIfNeeded();
        long total = 0;
        for (int i = 0; i < numBuckets; i++) {
            total += buckets.get(i);
        }
        return total;
    }

    public double average() {
        long total = sum();
        return total > 0 ? (double) total / numBuckets : 0.0;
    }

    public void reset() {
        for (int i = 0; i < numBuckets; i++) {
            buckets.set(i, 0);
        }
        lastRotation = Instant.now().toEpochMilli();
    }

    private void rotateBucketsIfNeeded() {
        long now = Instant.now().toEpochMilli();
        long elapsed = now - lastRotation;

        if (elapsed >= bucketDurationMs) {
            lock.writeLock().lock();
            try {
                int bucketsToRotate = (int) (elapsed / bucketDurationMs);
                bucketsToRotate = Math.min(bucketsToRotate, numBuckets);

                for (int i = 0; i < bucketsToRotate; i++) {
                    int indexToReset = (getCurrentBucketIndex() + 1 + i) % numBuckets;
                    buckets.set(indexToReset, 0);
                }

                lastRotation = now;
            } finally {
                lock.writeLock().unlock();
            }
        }
    }

    private int getCurrentBucketIndex() {
        long now = Instant.now().toEpochMilli();
        return (int) ((now / bucketDurationMs) % numBuckets);
    }
}
