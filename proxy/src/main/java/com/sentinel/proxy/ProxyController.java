package com.sentinel.proxy;

import com.sentinel.metrics.MetricsCollector;
import com.sentinel.model.Backend;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Optional;

@Slf4j
@RestController
@RequiredArgsConstructor
public class ProxyController {

    private final RequestRouter router;
    private final HttpProxyClient proxyClient;
    private final MetricsCollector metricsCollector;

    @RequestMapping(value = "/**", method = {RequestMethod.GET, RequestMethod.POST,
                                             RequestMethod.PUT, RequestMethod.DELETE})
    public ResponseEntity<String> proxy(@RequestBody(required = false) String body,
                                       @RequestParam(required = false) String path,
                                       jakarta.servlet.http.HttpServletRequest request) {

        String requestPath = request.getRequestURI();
        String method = request.getMethod();

        Optional<Backend> backend = router.selectBackend();

        if (backend.isEmpty()) {
            log.error("No backend available for request: {} {}", method, requestPath);
            return ResponseEntity.status(503).body("Service Unavailable - No backends available");
        }

        Backend selected = backend.get();
        log.debug("Routing {} {} to backend {}", method, requestPath, selected.getId());

        HttpProxyClient.ProxyResult result = proxyClient.forwardRequest(
                selected, requestPath, method, body);

        metricsCollector.record(result.outcome());

        return ResponseEntity.status(result.statusCode()).body(result.body());
    }

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("OK");
    }
}
