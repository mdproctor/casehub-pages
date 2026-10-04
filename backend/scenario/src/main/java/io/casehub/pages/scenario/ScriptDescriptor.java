package io.casehub.pages.scenario;

import java.util.List;
import java.util.Map;

public record ScriptDescriptor(String name, String description,
                                List<String> labels, List<String> tags,
                                List<ParamDescriptor> params, List<String> calls,
                                ScriptProvenance provenance,
                                ScriptLifecycleState state,
                                List<Map<String, String>> firstStepTargets) {
    public ScriptDescriptor {
        if (labels == null) labels = List.of();
        if (tags == null) tags = List.of();
        if (params == null) params = List.of();
        if (calls == null) calls = List.of();
        if (firstStepTargets == null) firstStepTargets = List.of();
        if (state == null) state = ScriptLifecycleState.ACTIVE;
    }

    public ScriptDescriptor(String name, String description,
                            List<String> labels, List<String> tags,
                            List<ParamDescriptor> params, List<String> calls,
                            ScriptProvenance provenance,
                            List<Map<String, String>> firstStepTargets) {
        this(name, description, labels, tags, params, calls, provenance, null, firstStepTargets);
    }
}
