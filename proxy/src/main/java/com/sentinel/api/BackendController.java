package com.sentinel.api;

import com.sentinel.control.RiskLevel;
import com.sentinel.model.Backend;
import com.sentinel.model.SystemMode;
import com.sentinel.proxy.BackendPool;
import com.sentinel.websocket.MetricsBroadcaster;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.List;
import java.util.Map;

import static com.sentinel.control.OverloadDetector.OverloadType;

@Slf4j
@RestController
@RequestMapping("/api/backends")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class BackendController {

    private static final int MAX_BACKENDS = 4;
    private final BackendPool backendPool;
    private final MetricsBroadcaster metricsBroadcaster;

    @GetMapping
    public ResponseEntity<List<BackendInfo>> getAllBackends() {
        var backends = backendPool.getAllBackends().stream()
                .map(backend -> new BackendInfo(
                        backend.getId(),
                        backend.getUrl(),
                        backend.getWeight(),
                        backend.getState().name(),
                        backend.getCircuitState().name()
                ))
                .toList();

        return ResponseEntity.ok(backends);
    }

    @PostMapping
    public ResponseEntity<?> addBackend(@RequestBody AddBackendRequest request) {
        if (backendPool.getAllBackends().size() >= MAX_BACKENDS) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "Maximum " + MAX_BACKENDS + " backends allowed"));
        }

        if (request.url() == null || request.url().isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Backend URL is required"));
        }

        String backendId = "backend-" + (backendPool.getAllBackends().size() + 1);
        Backend backend = new Backend(backendId, request.url(), 100);

        backendPool.addBackend(backend);
        log.info("Backend added: id={}, url={}", backendId, request.url());

        broadcastCurrentState();

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new BackendInfo(
                        backend.getId(),
                        backend.getUrl(),
                        backend.getWeight(),
                        backend.getState().name(),
                        backend.getCircuitState().name()
                ));
    }

    @PostMapping("/reset")
    public ResponseEntity<?> resetAllBackends() {
        var backends = backendPool.getAllBackends();
        int successCount = 0;

        for (Backend backend : backends) {
            if (resetBackend(backend)) {
                successCount++;
            }
        }

        log.info("Reset {} out of {} backends", successCount, backends.size());
        return ResponseEntity.ok(Map.of(
            "message", "Reset " + successCount + " backends",
            "total", backends.size()
        ));
    }

    @PostMapping("/{id}/reset")
    public ResponseEntity<?> resetSingleBackend(@PathVariable String id) {
        var backend = backendPool.getBackend(id);

        if (backend.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        boolean success = resetBackend(backend.get());

        if (success) {
            return ResponseEntity.ok(Map.of("message", "Backend " + id + " reset successfully"));
        } else {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", "Failed to reset backend " + id));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> removeBackend(@PathVariable String id) {
        var backend = backendPool.getAllBackends().stream()
                .filter(b -> b.getId().equals(id))
                .findFirst();

        boolean removed = backendPool.removeBackend(id);

        if (!removed) {
            return ResponseEntity.notFound().build();
        }

        backend.ifPresent(b -> {
            try {
                var resetUrl = b.getUrl() + "/_admin/reset";
                var httpClient = java.net.http.HttpClient.newHttpClient();
                var request = java.net.http.HttpRequest.newBuilder()
                        .uri(java.net.URI.create(resetUrl))
                        .POST(java.net.http.HttpRequest.BodyPublishers.noBody())
                        .timeout(java.time.Duration.ofSeconds(2))
                        .build();
                httpClient.sendAsync(request, java.net.http.HttpResponse.BodyHandlers.discarding());
                log.info("Reset backend failures: id={}", id);
            } catch (Exception e) {
                log.warn("Failed to reset backend {}: {}", id, e.getMessage());
            }
        });

        log.info("Backend removed: id={}", id);

        broadcastCurrentState();

        return ResponseEntity.noContent().build();
    }

    private boolean resetBackend(Backend backend) {
        try {
            var resetUrl = backend.getUrl() + "/_admin/reset";
            var httpClient = java.net.http.HttpClient.newHttpClient();
            var request = java.net.http.HttpRequest.newBuilder()
                    .uri(java.net.URI.create(resetUrl))
                    .POST(java.net.http.HttpRequest.BodyPublishers.noBody())
                    .timeout(java.time.Duration.ofSeconds(2))
                    .build();

            var response = httpClient.send(request, java.net.http.HttpResponse.BodyHandlers.discarding());
            log.info("Reset backend {}: status={}", backend.getId(), response.statusCode());
            return response.statusCode() == 200;
        } catch (Exception e) {
            log.warn("Failed to reset backend {}: {}", backend.getId(), e.getMessage());
            return false;
        }
    }

    private void broadcastCurrentState() {
        var backends = backendPool.getAllBackends();
        metricsBroadcaster.broadcastMetrics(
                backends,
                Collections.emptyMap(),
                SystemMode.STABLE,
                RiskLevel.LOW,
                OverloadType.NONE
        );
        log.debug("Immediate broadcast sent for {} backends", backends.size());
    }

    public record AddBackendRequest(String url) {}

    public record BackendInfo(
            String id,
            String url,
            int weight,
            String state,
            String circuitState
    ) {}
}
