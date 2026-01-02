package com.sentinel.proxy;

import com.sentinel.metrics.MetricsCollector;
import com.sentinel.model.Backend;
import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.Optional;

@Slf4j
@Component
@Order(Ordered.LOWEST_PRECEDENCE)
@RequiredArgsConstructor
public class ProxyFilter implements Filter {

    private final RequestRouter router;
    private final HttpProxyClient proxyClient;
    private final MetricsCollector metricsCollector;

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        if (!(request instanceof HttpServletRequest httpRequest) ||
            !(response instanceof HttpServletResponse httpResponse)) {
            chain.doFilter(request, response);
            return;
        }

        String requestPath = httpRequest.getRequestURI();
        String method = httpRequest.getMethod();

        String upgrade = httpRequest.getHeader("Upgrade");
        if ("websocket".equalsIgnoreCase(upgrade)) {
            log.debug("Passing through WebSocket upgrade request for {}", requestPath);
            chain.doFilter(request, response);
            return;
        }

        if (requestPath.startsWith("/api/") ||
            requestPath.startsWith("/actuator/") ||
            requestPath.equals("/health")) {
            chain.doFilter(request, response);
            return;
        }

        Optional<Backend> backend = router.selectBackend();

        if (backend.isEmpty()) {
            log.error("No backend available for request: {} {}", method, requestPath);
            httpResponse.setStatus(503);
            httpResponse.setContentType("text/plain");
            httpResponse.getWriter().write("Service Unavailable - No backends available");
            return;
        }

        Backend selected = backend.get();
        log.debug("Routing {} {} to backend {}", method, requestPath, selected.getId());

        String body = null;
        if (httpRequest.getContentLength() > 0) {
            body = new String(httpRequest.getInputStream().readAllBytes());
        }

        HttpProxyClient.ProxyResult result = proxyClient.forwardRequest(
                selected, requestPath, method, body);

        metricsCollector.record(result.outcome());

        httpResponse.setStatus(result.statusCode());
        httpResponse.setContentType("text/plain");
        if (result.body() != null) {
            httpResponse.getWriter().write(result.body());
        }
    }
}
