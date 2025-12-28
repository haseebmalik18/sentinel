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

    public Backend(String id, String url, int initialWeight) {
        this.id = id;
        this.url = url;
        this.weight = initialWeight;
        this.state = BackendState.HEALTHY;
        this.circuitState = CircuitState.CLOSED;
        this.lastStateChange = Instant.now();
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
}
