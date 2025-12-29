package com.sentinel.control;

import com.sentinel.metrics.MetricsRegistry;
import com.sentinel.proxy.BackendPool;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;

@Slf4j
@Component
@RequiredArgsConstructor
public class ControlLoop {

    private final BackendPool backendPool;
    private final MetricsRegistry metricsRegistry;
    private final HealthScorer healthScorer;
    private final RiskPredictor riskPredictor;
    private final ModeStateMachine modeStateMachine;
    private final WeightAdjuster weightAdjuster;
    private final CircuitBreaker circuitBreaker;
    private final OverloadDetector overloadDetector;

    private volatile Instant lastExecution;

    @Scheduled(fixedDelayString = "${sentinel.control.loopInterval:5}000")
    public void execute() {
        try {
            lastExecution = Instant.now();

            var backends = backendPool.getAllBackends();
            if (backends.isEmpty()) {
                log.warn("No backends available for control loop");
                return;
            }

            var healthAssessments = healthScorer.scoreAllBackends(backends, metricsRegistry);

            if (healthAssessments.isEmpty()) {
                log.debug("No health assessments available yet");
                return;
            }

            var riskLevel = riskPredictor.predictRisk(healthAssessments, metricsRegistry);

            var overloadType = overloadDetector.detectOverloadType(backends, healthAssessments, metricsRegistry);

            var systemMode = modeStateMachine.determineMode(healthAssessments, riskLevel);

            backends.forEach(backend -> {
                metricsRegistry.get(backend.getId()).ifPresent(metrics -> {
                    circuitBreaker.evaluateAndUpdate(backend, metrics);
                });
            });

            weightAdjuster.adjustWeights(backends, healthAssessments, systemMode, backendPool, overloadType);

            log.debug("Control loop executed: mode={}, risk={}, overload={}, backends={}, assessed={}",
                    systemMode, riskLevel, overloadType, backends.size(), healthAssessments.size());

        } catch (Exception e) {
            log.error("Control loop execution failed", e);
        }
    }

    public Instant getLastExecution() {
        return lastExecution;
    }
}
