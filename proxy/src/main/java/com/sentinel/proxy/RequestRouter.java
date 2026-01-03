package com.sentinel.proxy;

import com.sentinel.model.Backend;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.ThreadLocalRandom;

@Slf4j
@Component
@RequiredArgsConstructor
public class RequestRouter {

    private final BackendPool backendPool;

    public Optional<Backend> selectBackend() {
        List<Backend> available = backendPool.getAvailableBackends();

        if (available.isEmpty()) {
            log.warn("No available backends for routing");
            return Optional.empty();
        }

        if (available.size() == 1) {
            return Optional.of(available.get(0));
        }

        return weightedRandomSelection(available);
    }

    private Optional<Backend> weightedRandomSelection(List<Backend> backends) {
        int totalWeight = backends.stream()
                .mapToInt(Backend::getEffectiveWeight)
                .sum();

        if (totalWeight == 0) {
            return Optional.of(backends.get(ThreadLocalRandom.current().nextInt(backends.size())));
        }

        int random = ThreadLocalRandom.current().nextInt(totalWeight);
        int currentSum = 0;

        for (Backend backend : backends) {
            currentSum += backend.getEffectiveWeight();
            if (random < currentSum) {
                return Optional.of(backend);
            }
        }

        return Optional.of(backends.get(backends.size() - 1));
    }
}
