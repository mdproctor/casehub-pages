package io.casehub.pages.scenario.runtime;

import io.casehub.pages.scenario.CompactStep;

import java.util.ArrayList;
import java.util.List;

public final class SequencePartitioner {

    public record StepSequence(String target, List<CompactStep> steps) {
        public StepSequence {
            java.util.Objects.requireNonNull(target, "target");
            steps = List.copyOf(steps);
        }
    }

    private SequencePartitioner() {}

    public static List<StepSequence> partitionInitial(List<CompactStep> steps) {
        return partition(steps.stream().filter(s -> s.trigger() == null).toList());
    }

    public static List<StepSequence> partition(List<CompactStep> steps) {
        if (steps.isEmpty()) return List.of();

        var result = new ArrayList<StepSequence>();
        String currentTarget = null;
        List<CompactStep> currentGroup = null;

        for (var step : steps) {
            String stepTarget = step.decorator("target");
            if (!java.util.Objects.equals(stepTarget, currentTarget)) {
                if (currentGroup != null) {
                    result.add(new StepSequence(currentTarget, currentGroup));
                }
                currentTarget = stepTarget;
                currentGroup = new ArrayList<>();
            }
            currentGroup.add(step);
        }
        if (currentGroup != null && !currentGroup.isEmpty()) {
            result.add(new StepSequence(currentTarget, currentGroup));
        }
        return List.copyOf(result);
    }
}
