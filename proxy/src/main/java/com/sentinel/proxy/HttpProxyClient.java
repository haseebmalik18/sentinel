package com.sentinel.proxy;

import com.sentinel.model.Backend;
import com.sentinel.model.RequestOutcome;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.Executors;

@Slf4j
@Component
public class HttpProxyClient {

    private final HttpClient httpClient;
    private final long requestTimeoutMs;

    public HttpProxyClient(
            @Value("${sentinel.proxy.requestTimeout:5000}") long requestTimeoutMs,
            @Value("${sentinel.proxy.maxConnections:2000}") int maxConnections) {
        this.requestTimeoutMs = requestTimeoutMs;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(requestTimeoutMs))
                .version(HttpClient.Version.HTTP_1_1)
                .executor(Executors.newFixedThreadPool(maxConnections))
                .build();

        log.info("HttpProxyClient initialized with {} max connections, {}ms timeout",
                maxConnections, requestTimeoutMs);
    }

    public ProxyResult forwardRequest(Backend backend, String path, String method, String body) {
        Instant start = Instant.now();

        try {
            String url = backend.getUrl() + path;

            HttpRequest.Builder requestBuilder = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofMillis(requestTimeoutMs));

            switch (method.toUpperCase()) {
                case "GET" -> requestBuilder.GET();
                case "POST" -> requestBuilder.POST(HttpRequest.BodyPublishers.ofString(body != null ? body : ""));
                case "PUT" -> requestBuilder.PUT(HttpRequest.BodyPublishers.ofString(body != null ? body : ""));
                case "DELETE" -> requestBuilder.DELETE();
                default -> requestBuilder.GET();
            }

            HttpRequest request = requestBuilder.build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            long latencyMs = Duration.between(start, Instant.now()).toMillis();

            RequestOutcome outcome = RequestOutcome.builder()
                    .backendId(backend.getId())
                    .timestamp(start)
                    .latencyMs(latencyMs)
                    .statusCode(response.statusCode())
                    .timeout(false)
                    .error(false)
                    .build();

            return new ProxyResult(response.statusCode(), response.body(), outcome);

        } catch (java.net.http.HttpTimeoutException e) {
            long latencyMs = Duration.between(start, Instant.now()).toMillis();
            log.warn("Request to {} timed out after {}ms", backend.getId(), latencyMs);

            RequestOutcome outcome = RequestOutcome.builder()
                    .backendId(backend.getId())
                    .timestamp(start)
                    .latencyMs(latencyMs)
                    .statusCode(504)
                    .timeout(true)
                    .error(true)
                    .errorType("TIMEOUT")
                    .build();

            return new ProxyResult(504, "Gateway Timeout", outcome);

        } catch (IOException | InterruptedException e) {
            long latencyMs = Duration.between(start, Instant.now()).toMillis();
            log.error("Request to {} failed: {}", backend.getId(), e.getMessage());

            RequestOutcome outcome = RequestOutcome.builder()
                    .backendId(backend.getId())
                    .timestamp(start)
                    .latencyMs(latencyMs)
                    .statusCode(502)
                    .timeout(false)
                    .error(true)
                    .errorType("IO_ERROR")
                    .build();

            return new ProxyResult(502, "Bad Gateway", outcome);
        }
    }

    public record ProxyResult(int statusCode, String body, RequestOutcome outcome) {}
}
