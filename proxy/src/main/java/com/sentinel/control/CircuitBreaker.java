package com.sentinel.control;

import com.sentinel.metrics.BackendMetrics;
import com.sentinel.model.Backend;
import com.sentinel.model.CircuitState;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
public class CircuitBreaker {

    private final int failureThreshold;
    private final double timeoutRateThreshold;
    private final int retryDelay;

    private final Map<String, CircuitData> circuitData = new ConcurrentHashMap<>();

    public CircuitBreaker(
            @Value("${sentinel.control.circuitBreaker.failureThreshold:5}") int failureThreshold,
            @Value("${sentinel.control.circuitBreaker.timeoutRateThreshold:20.0}") double timeoutRateThreshold,
            @Value("${sentinel.control.circuitBreaker.retryDelay:10}") int retryDelay) {
        this.failureThreshold = failureThreshold;
        this.timeoutRateThreshold = timeoutRateThreshold;
        this.retryDelay = retryDelay;
    }

    public void evaluateAndUpdate(Backend backend, BackendMetrics metrics) {
        CircuitData data = circuitData.computeIfAbsent(
                backend.getId(),
                id -> new CircuitData()
        );

        CircuitState currentState = backend.getCircuitState();
        CircuitState newState = determineState(currentState, data, metrics);

        if (newState != currentState) {
            backend.transitionCircuit(newState);
            data.lastTransition = Instant.now();
            log.info("Circuit breaker transition: backend={}, {} -> {}",
                    backend.getId(), currentState, newState);
        }
    }

    private CircuitState determineState(CircuitState currentState, CircuitData data, BackendMetrics metrics) {
        Instant now = Instant.now();

        switch (currentState) {
            case CLOSED:
                return evaluateClosed(data, metrics);

            case OPEN:
                return evaluateOpen(data, now);

            case HALF_OPEN:
                return evaluateHalfOpen(data, metrics);

            default:
                return CircuitState.CLOSED;
        }
    }

    private CircuitState evaluateClosed(CircuitData data, BackendMetrics metrics) {
        double errorRate = metrics.getErrorRate();
        double timeoutRate = metrics.getTimeoutRate();
        long errorCount = metrics.getErrorCount().sum();

        if (timeoutRate >= timeoutRateThreshold && errorCount >= failureThreshold) {
            return CircuitState.OPEN;
        }

        if (errorRate >= 50.0 && errorCount >= failureThreshold) {
            return CircuitState.OPEN;
        }

        return CircuitState.CLOSED;
    }

    private CircuitState evaluateOpen(CircuitData data, Instant now) {
        long secondsSinceTransition = now.getEpochSecond() - data.lastTransition.getEpochSecond();

        if (secondsSinceTransition >= retryDelay) {
            data.probeAttempts = 0;
            return CircuitState.HALF_OPEN;
        }

        return CircuitState.OPEN;
    }

    private CircuitState evaluateHalfOpen(CircuitData data, BackendMetrics metrics) {
        double errorRate = metrics.getErrorRate();
        long requestCount = metrics.getRequestCount().sum();

        data.probeAttempts++;

        if (errorRate <= 5.0 && requestCount >= 5) {
            return CircuitState.CLOSED;
        }

        if (errorRate >= 25.0 || data.probeAttempts >= 3) {
            return CircuitState.OPEN;
        }

        return CircuitState.HALF_OPEN;
    }

    private static class CircuitData {
        int probeAttempts = 0;
        Instant lastTransition = Instant.now();
    }
}
