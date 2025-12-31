package com.sentinel.api;

import com.sentinel.model.Backend;
import com.sentinel.proxy.BackendPool;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/backends")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class BackendController {

    private static final int MAX_BACKENDS = 4;
    private final BackendPool backendPool;

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

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new BackendInfo(
                        backend.getId(),
                        backend.getUrl(),
                        backend.getWeight(),
                        backend.getState().name(),
                        backend.getCircuitState().name()
                ));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> removeBackend(@PathVariable String id) {
        boolean removed = backendPool.removeBackend(id);

        if (!removed) {
            return ResponseEntity.notFound().build();
        }

        log.info("Backend removed: id={}", id);
        return ResponseEntity.noContent().build();
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
