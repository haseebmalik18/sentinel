package com.sentinel.proxy;

import com.sentinel.model.Backend;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Slf4j
@Component
public class BackendPool {

    private final Map<String, Backend> backends = new ConcurrentHashMap<>();
    private final AtomicInteger totalWeight = new AtomicInteger(0);

    public void registerBackend(String id, String url, int initialWeight) {
        Backend backend = new Backend(id, url, initialWeight);
        backends.put(id, backend);
        recalculateTotalWeight();
        log.info("Registered backend: {} at {} with weight {}", id, url, initialWeight);
    }

    public void addBackend(Backend backend) {
        backends.put(backend.getId(), backend);
        recalculateTotalWeight();
        log.info("Added backend: {} at {} with weight {}", backend.getId(), backend.getUrl(), backend.getWeight());
    }

    public boolean removeBackend(String id) {
        Backend removed = backends.remove(id);
        if (removed != null) {
            recalculateTotalWeight();
            log.info("Removed backend: {}", id);
            return true;
        }
        return false;
    }

    public Optional<Backend> getBackend(String id) {
        return Optional.ofNullable(backends.get(id));
    }

    public List<Backend> getAllBackends() {
        return new ArrayList<>(backends.values());
    }

    public List<Backend> getAvailableBackends() {
        return backends.values().stream()
                .filter(Backend::isAvailable)
                .toList();
    }

    public void updateWeight(String backendId, int newWeight) {
        getBackend(backendId).ifPresent(backend -> {
            int oldWeight = backend.getWeight();
            backend.updateWeight(newWeight);
            recalculateTotalWeight();
            log.debug("Updated weight for {}: {} -> {}", backendId, oldWeight, newWeight);
        });
    }

    public int getTotalWeight() {
        return totalWeight.get();
    }

    private void recalculateTotalWeight() {
        int total = backends.values().stream()
                .filter(Backend::isAvailable)
                .mapToInt(Backend::getWeight)
                .sum();
        totalWeight.set(total);
    }

    public int size() {
        return backends.size();
    }

    public boolean isEmpty() {
        return backends.isEmpty();
    }
}
