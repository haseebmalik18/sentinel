package com.sentinel.control;

import com.sentinel.model.Backend;
import com.sentinel.model.BackendHealth;
import com.sentinel.model.BackendState;
import com.sentinel.model.CircuitState;
import com.sentinel.model.SystemMode;
import com.sentinel.proxy.BackendPool;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class WeightAdjuster {

    private final int maxWeightChangePercent;
    private final int recoveryWeightChangePercent;
    private final int minObservationPeriod;
    private final int cooldownPeriod;
    private final int sustainedDegradationCycles;
    private final int rampUpStepSeconds;

    private final Map<String, Instant> lastAdjustment = new HashMap<>();
    private final Map<String, Instant> observationStart = new HashMap<>();
    private final Map<String, Integer> degradationCycleCount = new HashMap<>();
    private final Map<String, BackendState> lastState = new HashMap<>();
    private final Map<String, CircuitState> lastCircuitState = new HashMap<>();

    public WeightAdjuster(
            @Value("${sentinel.control.maxWeightChangePercent:10}") int maxWeightChangePercent,
            @Value("${sentinel.control.recoveryWeightChangePercent:5}") int recoveryWeightChangePercent,
            @Value("${sentinel.control.minObservationPeriod:15}") int minObservationPeriod,
            @Value("${sentinel.control.cooldownPeriod:20}") int cooldownPeriod,
            @Value("${sentinel.control.sustainedDegradationCycles:3}") int sustainedDegradationCycles,
            @Value("${sentinel.control.rampUpStepSeconds:10}") int rampUpStepSeconds) {
        this.maxWeightChangePercent = maxWeightChangePercent;
        this.recoveryWeightChangePercent = recoveryWeightChangePercent;
        this.minObservationPeriod = minObservationPeriod;
        this.cooldownPeriod = cooldownPeriod;
        this.sustainedDegradationCycles = sustainedDegradationCycles;
        this.rampUpStepSeconds = rampUpStepSeconds;
    }

    public void adjustWeights(List<Backend> backends, Map<String, BackendHealth> healthAssessments,
                             SystemMode systemMode, BackendPool pool) {
        adjustWeights(backends, healthAssessments, systemMode, pool, OverloadDetector.OverloadType.NONE);
    }

    public void adjustWeights(List<Backend> backends, Map<String, BackendHealth> healthAssessments,
                             SystemMode systemMode, BackendPool pool, OverloadDetector.OverloadType overloadType) {

        Instant now = Instant.now();

        for (Backend backend : backends) {
            BackendHealth health = healthAssessments.get(backend.getId());
            if (health == null) {
                observationStart.putIfAbsent(backend.getId(), now);
                log.debug("Skipping {}: no health assessment yet", backend.getId());
                continue;
            }

            handleCircuitStateTransitions(backend);
            handleRampUp(backend, health);

            if (!hasMinObservationPeriod(backend.getId(), now)) {
                log.debug("Skipping {}: min observation period not met", backend.getId());
                continue;
            }

            if (isInCooldown(backend.getId(), now)) {
                log.debug("Skipping {}: in cooldown", backend.getId());
                continue;
            }

            BackendState currentState = health.getState();
            boolean isDegraded = (currentState == BackendState.DEGRADING || currentState == BackendState.UNHEALTHY);

            if (isDegraded) {
                int count = degradationCycleCount.getOrDefault(backend.getId(), 0) + 1;
                degradationCycleCount.put(backend.getId(), count);
                log.debug("Backend {}: degradation cycle {}/{}", backend.getId(), count, sustainedDegradationCycles);
            } else if (currentState == BackendState.HEALTHY) {
                degradationCycleCount.put(backend.getId(), 0);
            }
            lastState.put(backend.getId(), currentState);

            int currentWeight = backend.getWeight();
            int newWeight = calculateNewWeight(currentWeight, health, systemMode, overloadType);

            log.debug("Backend {}: health={}, currentWeight={}, newWeight={}",
                      backend.getId(), health.getState(), currentWeight, newWeight);

            if (newWeight < currentWeight) {
                int cycleCount = degradationCycleCount.getOrDefault(backend.getId(), 0);
                if (cycleCount < sustainedDegradationCycles) {
                    log.debug("Skipping {}: degradation not sustained ({}/{} cycles)",
                              backend.getId(), cycleCount, sustainedDegradationCycles);
                    continue;
                }
            }

            if (newWeight != currentWeight) {
                pool.updateWeight(backend.getId(), newWeight);
                lastAdjustment.put(backend.getId(), now);
                log.info("Adjusted weight: backend={}, {} -> {}, health={}, mode={}",
                        backend.getId(), currentWeight, newWeight,
                        health.getState(), systemMode);
            }
        }
    }

    private int calculateNewWeight(int currentWeight, BackendHealth health, SystemMode mode,
                                   OverloadDetector.OverloadType overloadType) {
        double targetWeight = switch (health.getState()) {
            case HEALTHY -> 100.0;
            case DEGRADING -> 70.0;
            case UNHEALTHY -> 30.0;
            case RECOVERING -> 50.0;
        };

        if (mode == SystemMode.OVERLOADED && health.getState() == BackendState.UNHEALTHY) {
            targetWeight = 10.0;
        }

        if (overloadType == OverloadDetector.OverloadType.TRAFFIC_SPIKE && health.getState() == BackendState.HEALTHY) {
            targetWeight = 100.0;
        }

        if (overloadType == OverloadDetector.OverloadType.COMBINED_OVERLOAD) {
            if (health.getState() == BackendState.DEGRADING) {
                targetWeight = 50.0;
            } else if (health.getState() == BackendState.UNHEALTHY) {
                targetWeight = 5.0;
            }
        }

        int changePercent = health.getState() == BackendState.RECOVERING
                ? recoveryWeightChangePercent
                : maxWeightChangePercent;

        int maxChange = (currentWeight * changePercent) / 100;
        maxChange = Math.max(maxChange, 3);

        int delta = (int) (targetWeight - currentWeight);

        if (delta > 0) {
            delta = Math.min(delta, maxChange);
        } else if (delta < 0) {
            delta = Math.max(delta, -maxChange);
        }

        int newWeight = currentWeight + delta;
        return Math.max(10, Math.min(100, newWeight));
    }

    private boolean hasMinObservationPeriod(String backendId, Instant now) {
        Instant start = observationStart.get(backendId);
        if (start == null) {
            observationStart.put(backendId, now);
            return false;
        }

        return now.getEpochSecond() - start.getEpochSecond() >= minObservationPeriod;
    }

    private boolean isInCooldown(String backendId, Instant now) {
        Instant lastChange = lastAdjustment.get(backendId);
        if (lastChange == null) {
            return false;
        }

        return now.getEpochSecond() - lastChange.getEpochSecond() < cooldownPeriod;
    }

    private void handleCircuitStateTransitions(Backend backend) {
        CircuitState currentCircuit = backend.getCircuitState();
        CircuitState previousCircuit = lastCircuitState.get(backend.getId());

        if (previousCircuit != null && previousCircuit != currentCircuit) {
            if (previousCircuit == CircuitState.OPEN && currentCircuit == CircuitState.CLOSED) {
                backend.startRampUp();
                log.info("Backend {} recovered: starting gradual ramp-up at 5%", backend.getId());
            }
        }

        lastCircuitState.put(backend.getId(), currentCircuit);
    }

    private void handleRampUp(Backend backend, BackendHealth health) {
        if (!backend.isRampingUp()) {
            return;
        }

        boolean isDegraded = health.getState() == BackendState.DEGRADING
                          || health.getState() == BackendState.UNHEALTHY;

        if (isDegraded) {
            backend.cancelRampUp();
            log.info("Backend {} degraded during ramp-up: cancelling ramp-up", backend.getId());
            return;
        }

        long elapsedSeconds = backend.getRampUpElapsedSeconds();
        int currentPercentage = backend.getRampUpPercentage();

        int targetPercentage = calculateRampUpPercentage(elapsedSeconds);

        if (targetPercentage > currentPercentage) {
            backend.advanceRampUp(targetPercentage);
            log.info("Backend {} ramp-up: {}% -> {}% ({}s elapsed)",
                     backend.getId(), currentPercentage, targetPercentage, elapsedSeconds);
        }
    }

    private int calculateRampUpPercentage(long elapsedSeconds) {
        long step = elapsedSeconds / rampUpStepSeconds;

        return switch ((int) step) {
            case 0 -> 5;
            case 1 -> 20;
            case 2 -> 40;
            case 3 -> 60;
            case 4 -> 80;
            default -> 100;
        };
    }
}
