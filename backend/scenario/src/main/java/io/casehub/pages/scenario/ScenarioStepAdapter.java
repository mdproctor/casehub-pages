package io.casehub.pages.scenario;

import io.casehub.yaml.core.data.CsvDataSource;
import io.casehub.yaml.core.foreach.ForEachAdapter;
import io.casehub.yaml.core.foreach.IterationGroup;
import io.casehub.yaml.core.resolver.VariableResolver;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public final class ScenarioStepAdapter implements ForEachAdapter<HierarchicalStep> {

    @Override
    public HierarchicalStep stamp(HierarchicalStep template, String stampedId,
                                  VariableResolver scopedResolver) {
        List<ScenarioCommand> resolvedCommands = resolveCommands(template.commands(), scopedResolver, stampedId);
        return new HierarchicalStep(template.name(), template.label(), template.target(),
                                    template.actor(), template.trigger(), null, null,
                                    template.content(), resolvedCommands);
    }

    @Override
    public io.casehub.yaml.core.foreach.ForEachDirective getForEach(HierarchicalStep element) {
        return element.forEach();
    }

    @Override
    public String getWhen(HierarchicalStep element) {
        return element.when();
    }

    private List<ScenarioCommand> resolveCommands(List<ScenarioCommand> commands,
                                                  VariableResolver resolver,
                                                  String context) {
        List<ScenarioCommand> resolved = new ArrayList<>();
        for (ScenarioCommand cmd : commands) {
            String value = cmd.value();
            if (value != null && value.contains("${")) {
                value = resolver.resolveString(value, context);
            }
            AriaTarget          ariaTarget = resolveAriaTarget(cmd.target(), resolver, context);
            Map<String, Object> callParams = resolveCallParams(cmd.callParams(), resolver, context);
            resolved.add(new ScenarioCommand(cmd.action(), ariaTarget, value,
                                             cmd.data(), cmd.domain(), cmd.await(), cmd.timeout(),
                                             cmd.mode(), cmd.source(), cmd.interval(),
                                             cmd.script(), callParams));
        }
        return resolved;
    }

    private static AriaTarget resolveAriaTarget(AriaTarget target,
                                                VariableResolver resolver,
                                                String context) {
        if (target == null) {return null;}
        String name = target.name();
        if (name != null && name.contains("${")) {
            name = resolver.resolveString(name, context);
        }
        String index = target.index();
        if (index != null && index.contains("${")) {
            index = resolver.resolveString(index, context);
        }
        AriaTarget within = resolveAriaTarget(target.within(), resolver, context);
        if (name == target.name() && index == target.index() && within == target.within()) {
            return target;
        }
        return new AriaTarget(target.role(), name, index, within);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> resolveCallParams(Map<String, Object> params,
                                                         VariableResolver resolver,
                                                         String context) {
        if (params == null) {return null;}
        Map<String, Object> resolved = new java.util.LinkedHashMap<>();
        boolean             changed  = false;
        for (Map.Entry<String, Object> entry : params.entrySet()) {
            Object val = entry.getValue();
            if (val instanceof String s && s.contains("${")) {
                resolved.put(entry.getKey(), resolver.resolveString(s, context));
                changed = true;
            } else {
                resolved.put(entry.getKey(), val);
            }
        }
        return changed ? Map.copyOf(resolved) : params;
    }

    static String slugify(String label) {
        return label.toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
    }
}
