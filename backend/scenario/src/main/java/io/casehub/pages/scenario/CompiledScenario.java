package io.casehub.pages.scenario;

import java.util.List;

public record CompiledScenario(List<CompactStep> steps) {
    public CompiledScenario {
        steps = List.copyOf(steps);
    }
}
