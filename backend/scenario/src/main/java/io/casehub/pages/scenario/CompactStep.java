package io.casehub.pages.scenario;

import io.casehub.yaml.core.foreach.ForEachDirective;

import java.util.Map;

public record CompactStep(
        String action,
        Map<String, Object> params,
        ForEachDirective forEach,
        Trigger trigger,
        TemporalSpec temporal,
        Map<String, Object> decorators
) {
    public CompactStep {
        params = params != null ? Map.copyOf(params) : Map.of();
        decorators = decorators != null ? Map.copyOf(decorators) : Map.of();
    }

    @SuppressWarnings("unchecked")
    public <T> T decorator(String key) {
        return (T) decorators.get(key);
    }
}
