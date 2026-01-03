package com.sentinel.model;

import lombok.Data;
import java.time.Instant;

@Data
public class Backend {

    private final String id;
    private final String url;
    private volatile int weight;
    private volatile BackendState state;
    private volatile CircuitState circuitState;
    private volatile Instant lastStateChange;
    private volatile Instant rampUpStartTime;
    private volatile int rampUpPercentage;

    public Backend(String id, String url, int initialWeight) {
        this.id = id;
        this.url = url;
        this.weight = initialWeight;
        this.state = BackendState.HEALTHY;
        this.circuitState = CircuitState.CLOSED;
        this.lastStateChange = Instant.now();
        this.rampUpStartTime = null;
        this.rampUpPercentage = 100;
    }

    public boolean isAvailable() {
        return circuitState == CircuitState.CLOSED || circuitState == CircuitState.HALF_OPEN;
    }

    public void updateWeight(int newWeight) {
        this.weight = Math.max(0, Math.min(100, newWeight));
    }

    public void transitionState(BackendState newState) {
        if (this.state != newState) {
            this.state = newState;
            this.lastStateChange = Instant.now();
        }
    }

    public void transitionCircuit(CircuitState newState) {
        if (this.circuitState != newState) {
            this.circuitState = newState;
            this.lastStateChange = Instant.now();
        }
    }

    public int getEffectiveWeight() {
        if (circuitState == CircuitState.OPEN) {
            return 0;
        }
        if (circuitState == CircuitState.HALF_OPEN) {
            return (int) Math.ceil(weight * 0.05);
        }
        return (int) Math.ceil(weight * (rampUpPercentage / 100.0));
    }

    public boolean isRampingUp() {
        return rampUpStartTime != null && rampUpPercentage < 100;
    }

    public void startRampUp() {
        this.rampUpStartTime = Instant.now();
        this.rampUpPercentage = 5;
    }

    public void advanceRampUp(int newPercentage) {
        this.rampUpPercentage = Math.min(100, newPercentage);
        if (this.rampUpPercentage >= 100) {
            this.rampUpStartTime = null;
        }
    }

    public void cancelRampUp() {
        this.rampUpStartTime = null;
        this.rampUpPercentage = 100;
    }

    public long getRampUpElapsedSeconds() {
        if (rampUpStartTime == null) {
            return 0;
        }
        return Instant.now().getEpochSecond() - rampUpStartTime.getEpochSecond();
    }
}
