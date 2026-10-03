package io.casehub.pages.scenario;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Stream;

public record ScenarioEnvelope(
        String scenario,
        String description,
        double speed,
        String actor,
        String onError,
        List<ParamDescriptor> params,
        ScriptMeta meta,
        Map<String, Object> data,
        Map<String, Object> iterations,
        String slides,
        SimulationSpec simulation,
        List<Chapter> chapters,
        List<Section> sections,
        List<CompactStep> steps
) {
    public ScenarioEnvelope {
        Objects.requireNonNull(scenario, "scenario");
        params = params != null ? List.copyOf(params) : List.of();
        data = data != null ? Map.copyOf(data) : Map.of();
        iterations = iterations != null ? Map.copyOf(iterations) : Map.of();
        chapters = chapters != null ? List.copyOf(chapters) : List.of();
        sections = sections != null ? List.copyOf(sections) : List.of();
        steps = steps != null ? List.copyOf(steps) : List.of();
    }

    public List<CompactStep> allSteps() {
        if (!steps.isEmpty()) return steps;
        if (!chapters.isEmpty()) {
            return chapters.stream()
                    .flatMap(c -> c.sections().stream())
                    .flatMap(s -> s.steps().stream())
                    .toList();
        }
        if (!sections.isEmpty()) {
            return sections.stream()
                    .flatMap(s -> s.steps().stream())
                    .toList();
        }
        return List.of();
    }

    public record Section(String label, String content, List<CompactStep> steps) {
        public Section {
            Objects.requireNonNull(label, "label");
            steps = steps != null ? List.copyOf(steps) : List.of();
        }
    }

    public record Chapter(String label, String content, List<Section> sections) {
        public Chapter {
            Objects.requireNonNull(label, "label");
            sections = sections != null ? List.copyOf(sections) : List.of();
        }
    }
}
