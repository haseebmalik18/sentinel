package com.sentinel.metrics;

public class EWMACalculator {

    private final double alpha;
    private volatile double currentValue;
    private volatile boolean initialized;

    public EWMACalculator(double alpha) {
        this.alpha = Math.max(0.0, Math.min(1.0, alpha));
        this.currentValue = 0.0;
        this.initialized = false;
    }

    public synchronized void update(double newValue) {
        if (!initialized) {
            currentValue = newValue;
            initialized = true;
        } else {
            currentValue = (alpha * newValue) + ((1 - alpha) * currentValue);
        }
    }

    public double getValue() {
        return currentValue;
    }

    public void reset() {
        currentValue = 0.0;
        initialized = false;
    }
}
