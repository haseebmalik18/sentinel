package com.sentinel.control;

import com.sentinel.model.BackendHealth;
import com.sentinel.model.SystemMode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Map;

@Slf4j
@Component
public class ModeStateMachine {

    private volatile SystemMode currentMode = SystemMode.STABLE;

    public SystemMode determineMode(Map<String, BackendHealth> healthAssessments, RiskLevel riskLevel) {
        SystemMode previousMode = currentMode;

        SystemMode newMode = switch (riskLevel) {
            case LOW -> {
                if (currentMode == SystemMode.RECOVERING) {
                    yield allBackendsHealthy(healthAssessments) ? SystemMode.STABLE : SystemMode.RECOVERING;
                }
                yield SystemMode.STABLE;
            }
            case MEDIUM -> {
                if (currentMode == SystemMode.STABLE) {
                    yield SystemMode.DEGRADING;
                }
                yield currentMode;
            }
            case HIGH -> SystemMode.OVERLOADED;
        };

        if (newMode != previousMode) {
            log.info("System mode transition: {} -> {}", previousMode, newMode);
            currentMode = newMode;
        }

        return newMode;
    }

    private boolean allBackendsHealthy(Map<String, BackendHealth> healthAssessments) {
        return healthAssessments.values().stream()
                .allMatch(h -> h.getState() == com.sentinel.model.BackendState.HEALTHY);
    }

    public SystemMode getCurrentMode() {
        return currentMode;
    }
}
