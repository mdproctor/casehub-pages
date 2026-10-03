package io.casehub.pages.scenario;

import io.casehub.yaml.core.foreach.ForEachAdapter;
import io.casehub.yaml.core.foreach.ForEachDirective;
import io.casehub.yaml.core.resolver.VariableResolver;

import java.util.LinkedHashMap;
import java.util.Map;

public final class CompactStepAdapter implements ForEachAdapter<CompactStep> {

    @Override
    public CompactStep stamp(CompactStep template, String stampedId,
                             VariableResolver scopedResolver) {
        Map<String, Object> resolvedParams = resolveMap(template.params(), scopedResolver, stampedId);
        Map<String, Object> resolvedDecorators = resolveMap(template.decorators(), scopedResolver, stampedId);
        resolvedDecorators.put("step", stampedId);
        return new CompactStep(template.action(), resolvedParams,
                null, template.trigger(), template.temporal(), resolvedDecorators);
    }

    @Override
    public ForEachDirective getForEach(CompactStep element) {
        return element.forEach();
    }

    @Override
    public String getCondition(CompactStep element) {
        return element.decorator("when");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> resolveMap(Map<String, Object> map,
                                                   VariableResolver resolver,
                                                   String context) {
        Map<String, Object> resolved = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : map.entrySet()) {
            Object val = entry.getValue();
            if (val instanceof String s && s.contains("${")) {
                resolved.put(entry.getKey(), resolver.resolveString(s, context));
            } else if (val instanceof Map<?, ?> nested) {
                resolved.put(entry.getKey(), resolveMap((Map<String, Object>) nested, resolver, context));
            } else {
                resolved.put(entry.getKey(), val);
            }
        }
        return resolved;
    }
}
