package com.sentinel.websocket;

import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

import lombok.RequiredArgsConstructor;

@Configuration
@EnableWebSocket
@Order(Ordered.HIGHEST_PRECEDENCE)
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketConfigurer {

    private final MetricsWebSocketHandler metricsHandler;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(metricsHandler, "/websocket/metrics")
                .setAllowedOrigins("*");
    }
}
