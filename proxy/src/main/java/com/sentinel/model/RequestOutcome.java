package com.sentinel.model;

import lombok.Builder;
import lombok.Data;
import java.time.Instant;

@Data
@Builder
public class RequestOutcome {

    private final String backendId;
    private final Instant timestamp;
    private final long latencyMs;
    private final int statusCode;
    private final boolean timeout;
    private final boolean error;
    private final String errorType;

    public boolean isSuccess() {
        return !timeout && !error && statusCode >= 200 && statusCode < 300;
    }

    public boolean isServerError() {
        return statusCode >= 500 && statusCode < 600;
    }

    public boolean isClientError() {
        return statusCode >= 400 && statusCode < 500;
    }
}
