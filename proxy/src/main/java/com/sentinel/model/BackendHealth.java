package com.sentinel.model;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class BackendHealth {

    private final String backendId;
    private final double speedScore;
    private final double stabilityScore;
    private final double saturationScore;
    private final double reliabilityScore;
    private final double overallScore;
    private final BackendState state;
    private final boolean latencyIncreasing;
    private final boolean errorsIncreasing;
    private final boolean saturationIncreasing;

    public static double calculateOverallScore(double speed, double stability,
                                               double saturation, double reliability) {
        return (speed * 0.4) + (stability * 0.1) + (saturation * 0.2) + (reliability * 0.3);
    }

    public boolean isDegrading() {
        return latencyIncreasing || errorsIncreasing || saturationIncreasing;
    }
}
