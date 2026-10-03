package io.casehub.pages.scenario;

import io.casehub.yaml.core.data.CsvDataSource;
import io.casehub.yaml.core.foreach.ForEachExpander;
import io.casehub.yaml.core.foreach.IterationGroup;
import io.casehub.yaml.core.resolver.VariableResolver;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class ScenarioCompiler {

    private static final int MAX_EXPANSION = 1000;

    private ScenarioCompiler() {}

    public static CompiledScenario compile(String yaml, Map<String, String> callerParams) {
        return compile(yaml, callerParams, null);
    }

    public static CompiledScenario compile(String yaml, Map<String, String> callerParams,
                                           IncludeExpander.TemplateLoader templateLoader) {
        if (templateLoader != null) {
            try {
                ObjectMapper yamlMapper = new ObjectMapper(new YAMLFactory());
                JsonNode root = yamlMapper.readTree(yaml);
                if (root.has("includes")) {
                    IncludeExpander expander = new IncludeExpander(templateLoader);
                    root = expander.expand(root);
                    yaml = yamlMapper.writeValueAsString(root);
                }
            } catch (IOException e) {
                throw new IllegalArgumentException("Failed to process includes", e);
            }
        }

        ScenarioEnvelope envelope = ScenarioEnvelopeParser.parse(yaml);

        Map<String, io.casehub.yaml.core.module.YamlModuleParameter> declaredParams = toModuleParams(envelope.params());
        io.casehub.yaml.core.module.ParameterValidator.validateOrThrow(declaredParams, callerParams);

        VariableResolver resolver = VariableResolver.forParams(declaredParams, callerParams, Set.of("step"));

        Map<String, CsvDataSource> csvSources = CsvDataSource.fromDataBlock(envelope.data());
        Map<String, IterationGroup> iterationGroups = IterationGroup.fromBlock(envelope.iterations());

        List<CompactStep> allSteps = envelope.allSteps();
        LinkedHashMap<String, CompactStep> stepMap = new LinkedHashMap<>();
        for (int i = 0; i < allSteps.size(); i++) {
            stepMap.put(ScenarioEnvelopeParser.deriveStepName(allSteps.get(i), i), allSteps.get(i));
        }

        CompactStepAdapter adapter = new CompactStepAdapter();
        var expanded = ForEachExpander.expand(
                stepMap, iterationGroups, csvSources, resolver, adapter, MAX_EXPANSION);
        List<CompactStep> expandedSteps = new ArrayList<>(expanded.elements().values());

        return new CompiledScenario(expandedSteps);
    }

    private static Map<String, io.casehub.yaml.core.module.YamlModuleParameter> toModuleParams(
            List<ParamDescriptor> params) {
        var result = new LinkedHashMap<String, io.casehub.yaml.core.module.YamlModuleParameter>();
        for (var p : params) {
            var type = io.casehub.yaml.plugin.api.ParameterType.fromString(
                    p.type() != null ? p.type() : "string");
            var allowed = p.enumValues().stream().map(String::valueOf).toList();
            var defaultVal = p.defaultValue() != null ? String.valueOf(p.defaultValue()) : null;
            result.put(p.name(), io.casehub.yaml.core.module.YamlModuleParameter.builder()
                    .type(type).required(p.required()).defaultValue(defaultVal)
                    .allowedValues(allowed).build());
        }
        return Map.copyOf(result);
    }
}
