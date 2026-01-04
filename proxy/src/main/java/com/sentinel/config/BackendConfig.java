package com.sentinel.config;

import com.sentinel.proxy.BackendPool;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Slf4j
@Configuration
public class BackendConfig {

    @Bean
    @ConfigurationProperties(prefix = "sentinel.proxy")
    public ProxyProperties proxyProperties() {
        return new ProxyProperties();
    }

    @Bean
    public BackendPool backendPool(ProxyProperties properties) {
        BackendPool pool = new BackendPool();

        if (properties.getBackends() != null) {
            for (BackendDefinition def : properties.getBackends()) {
                pool.registerBackend(def.getId(), def.getUrl(), def.getInitialWeight());
            }
        }

        log.info("Initialized backend pool with {} backends", pool.size());
        return pool;
    }

    @Data
    public static class ProxyProperties {
        private List<BackendDefinition> backends;
        private long requestTimeout = 5000;
        private int maxConnections = 2000;
    }

    @Data
    public static class BackendDefinition {
        private String id;
        private String url;
        private int initialWeight = 100;
    }
}
