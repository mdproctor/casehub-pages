package io.casehub.pages.scenario;

import java.util.List;
import java.util.Objects;

public record HierarchicalStep(String name, String label, String target,
                               String actor, Trigger trigger,
                               io.casehub.yaml.core.foreach.ForEachDirective forEach, String when,
                               NarrativeContent content,
                               List<ScenarioCommand> commands) {
    public HierarchicalStep {
        Objects.requireNonNull(label, "label");
        Objects.requireNonNull(target, "target");
        commands = commands != null ? List.copyOf(commands) : List.of();
    }

    public HierarchicalStep(String name, String label, String target,
                            String actor, Trigger trigger,
                            NarrativeContent content,
                            List<ScenarioCommand> commands) {
        this(name, label, target, actor, trigger, null, null, content, commands);
    }

    public HierarchicalStep(String name, String label, String target,
                            String actor, Trigger trigger,
                            List<ScenarioCommand> commands) {
        this(name, label, target, actor, trigger, null, null, null, commands);
    }
}
