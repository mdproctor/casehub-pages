package io.casehub.pages.scenario;

import io.casehub.yaml.core.condition.Truthiness;
import io.casehub.yaml.core.data.CsvDataSource;
import io.casehub.yaml.core.data.CsvParser;
import io.casehub.yaml.core.foreach.ExpansionResult;
import io.casehub.yaml.core.foreach.ForEachExpander;
import io.casehub.yaml.core.foreach.IterationGroup;
import io.casehub.yaml.core.resolver.VariableResolver;
import io.casehub.yaml.core.resolver.VariableSource;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;

public final class ScenarioCompiler {

    private static final int MAX_EXPANSION = 1000;

    private ScenarioCompiler() {}

    public static CompiledScenario compile(String yaml, Map<String, String> callerParams) {
        return compile(yaml, callerParams, name -> Optional.empty());
    }

    public static CompiledScenario compile(String yaml, Map<String, String> callerParams,
                                           Function<String, Optional<String>> scriptResolver) {
        HierarchicalScenario scenario = HierarchicalParser.parse(yaml);

        Map<String, io.casehub.yaml.core.module.YamlModuleParameter> declaredParams = toModuleParams(scenario.params());
        io.casehub.yaml.core.module.ParameterValidator.validateOrThrow(declaredParams, callerParams);

        VariableResolver resolver = VariableResolver.forParams(declaredParams, callerParams, Set.of("step"));

        Map<String, io.casehub.yaml.core.data.CsvDataSource> csvSources      = io.casehub.yaml.core.data.CsvDataSource.fromDataBlock(scenario.data());
        Map<String, IterationGroup>                          iterationGroups = IterationGroup.fromBlock(scenario.iterations());

        List<HierarchicalStep>                  allSteps = scenario.allSteps().toList();
        LinkedHashMap<String, HierarchicalStep> stepMap  = new LinkedHashMap<>();
        for (HierarchicalStep step : allSteps) {
            stepMap.put(step.name() != null ? step.name() : ScenarioStepAdapter.slugify(step.label()), step);
        }

        ScenarioStepAdapter adapter = new ScenarioStepAdapter();
        var expanded = ForEachExpander.expand(
                stepMap, iterationGroups, csvSources, resolver, adapter, MAX_EXPANSION);
        List<HierarchicalStep> expandedSteps = new ArrayList<>(expanded.elements().values());

        List<String> callRefs = allSteps.stream()
                                        .flatMap(step -> step.commands().stream())
                                        .filter(cmd -> "call".equals(cmd.action()) && cmd.script() != null)
                                        .map(ScenarioCommand::script)
                                        .distinct()
                                        .toList();

        if (!callRefs.isEmpty() && scriptResolver != null) {
            validateCallGraph(scenario.scenario(), callRefs, scriptResolver);
            expandedSteps = inlineCalls(expandedSteps, callerParams, scriptResolver);
        }

        return new CompiledScenario(expandedSteps, callRefs);
    }

    private static Map<String, io.casehub.yaml.core.module.YamlModuleParameter> toModuleParams(
            List<ParamDescriptor> params) {
        var result = new LinkedHashMap<String, io.casehub.yaml.core.module.YamlModuleParameter>();
        for (var p : params) {
            var type = io.casehub.yaml.core.module.ParameterType.fromString(
                    p.type() != null ? p.type() : "string");
            var allowed    = p.enumValues().stream().map(String::valueOf).toList();
            var defaultVal = p.defaultValue() != null ? String.valueOf(p.defaultValue()) : null;
            result.put(p.name(), io.casehub.yaml.core.module.YamlModuleParameter.builder()
                                                                                .type(type).required(p.required()).defaultValue(defaultVal)
                                                                                .allowedValues(allowed).build());
        }
        return Map.copyOf(result);
    }

    private static void validateCallGraph(String rootName, List<String> callRefs,
                                          Function<String, Optional<String>> scriptResolver) {
        CallGraphValidator.validate(rootName, name -> {
            if (name.equals(rootName)) {
                return Optional.of(new CallGraphValidator.ScriptRef(rootName, callRefs));
            }
            return scriptResolver.apply(name).map(yaml -> {
                var desc = ScriptDescriptorExtractor.extract(yaml, ScriptProvenance.BUNDLED);
                return new CallGraphValidator.ScriptRef(desc.name(), desc.calls());
            });
        });
    }

    private static List<HierarchicalStep> inlineCalls(
            List<HierarchicalStep> steps,
            Map<String, String> parentParams,
            Function<String, Optional<String>> scriptResolver) {
        List<HierarchicalStep> result = new ArrayList<>();
        for (HierarchicalStep step : steps) {
            ScenarioCommand callCmd = step.commands().stream()
                                          .filter(c -> "call".equals(c.action()) && c.script() != null)
                                          .findFirst().orElse(null);

            if (callCmd == null) {
                result.add(step);
                continue;
            }

            String           scriptName = callCmd.script();
            Optional<String> calleeYaml = scriptResolver.apply(scriptName);
            if (calleeYaml.isEmpty()) {
                result.add(step);
                continue;
            }

            Map<String, String> mergedParams = new LinkedHashMap<>(parentParams);
            if (callCmd.callParams() != null) {
                for (Map.Entry<String, Object> e : callCmd.callParams().entrySet()) {
                    mergedParams.put(e.getKey(), String.valueOf(e.getValue()));
                }
            }

            CompiledScenario callee = compile(calleeYaml.get(), mergedParams, scriptResolver);
            for (HierarchicalStep calleeStep : callee.steps()) {
                String prefixedLabel = scriptName + "." + calleeStep.label();
                String prefixedName = calleeStep.name() != null
                                      ? scriptName + "." + calleeStep.name() : null;
                result.add(new HierarchicalStep(prefixedName, prefixedLabel,
                                                calleeStep.target(), calleeStep.actor(), calleeStep.trigger(),
                                                null, null, calleeStep.content(), calleeStep.commands()));
            }
        }
        return result;
    }
}
