package io.casehub.pages.scenario;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.TextNode;
import io.casehub.yaml.core.condition.Truthiness;
import io.casehub.yaml.plugin.api.ParameterType;
import io.casehub.yaml.core.module.ParameterValidator;
import io.casehub.yaml.core.module.YamlModuleParameter;
import io.casehub.yaml.core.resolver.VariableResolver;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public final class IncludeExpander {

    @FunctionalInterface
    public interface TemplateLoader {
        JsonNode load(String path) throws IOException;
    }

    private final TemplateLoader loader;

    public IncludeExpander(TemplateLoader loader) {
        this.loader = Objects.requireNonNull(loader);
    }

    public JsonNode expand(JsonNode root) {
        return expand(root, new LinkedHashSet<>());
    }

    public JsonNode expand(JsonNode root, Set<String> ancestors) {
        ObjectNode result = root.deepCopy();

        if (result.has("includes") && result.get("includes").isArray()) {
            List<JsonNode> expandedSteps = expandIncludes(
                    result.get("includes"), ancestors);
            ArrayNode mergedSteps = JsonNodeFactory.instance.arrayNode();
            expandedSteps.forEach(mergedSteps::add);
            if (result.has("steps") && result.get("steps").isArray()) {
                result.get("steps").forEach(mergedSteps::add);
            }
            result.set("steps", mergedSteps);
            result.remove("includes");
        }

        if (result.has("sections") && result.get("sections").isArray()) {
            ArrayNode sections = JsonNodeFactory.instance.arrayNode();
            for (JsonNode sec : result.get("sections")) {
                if (sec.has("includes") && sec.get("includes").isArray()) {
                    ObjectNode sectionCopy = sec.deepCopy();
                    List<JsonNode> expandedSteps = expandIncludes(
                            sectionCopy.get("includes"), ancestors);
                    ArrayNode mergedSteps = JsonNodeFactory.instance.arrayNode();
                    expandedSteps.forEach(mergedSteps::add);
                    if (sectionCopy.has("steps")
                            && sectionCopy.get("steps").isArray()) {
                        sectionCopy.get("steps").forEach(mergedSteps::add);
                    }
                    sectionCopy.set("steps", mergedSteps);
                    sectionCopy.remove("includes");
                    sections.add(sectionCopy);
                } else {
                    sections.add(sec);
                }
            }
            result.set("sections", sections);
        }

        return result;
    }

    private List<JsonNode> expandIncludes(JsonNode includes, Set<String> ancestors) {
        List<JsonNode> allSteps = new ArrayList<>();

        for (JsonNode include : includes) {
            String file = include.get("file").asText();

            if (ancestors.contains(file)) {
                List<String> cycle = new ArrayList<>(ancestors);
                cycle.add(file);
                throw new IllegalArgumentException(
                        "Circular include detected: "
                        + String.join(" → ", cycle));
            }

            JsonNode template;
            try {
                template = loader.load(file);
            } catch (IOException e) {
                throw new IllegalArgumentException(
                        "Include failed: template '" + file + "' not found", e);
            }

            Map<String, YamlModuleParameter> declared = parseTemplateParams(template);
            Map<String, String> provided = extractCallerParams(include);

            // For optional params with no default that aren't provided,
            // set empty string so ${params.x} resolves to "" (falsy for when:)
            Map<String, YamlModuleParameter> effectiveDeclared = new LinkedHashMap<>(declared);
            for (var entry : effectiveDeclared.entrySet()) {
                YamlModuleParameter param = entry.getValue();
                if (!param.required() && param.defaultValue() == null
                        && !provided.containsKey(entry.getKey())) {
                    entry.setValue(YamlModuleParameter.builder()
                            .type(param.type())
                            .required(false)
                            .defaultValue("")
                            .allowedValues(param.allowedValues() != null
                                    ? param.allowedValues() : List.of())
                            .build());
                }
            }

            var violations = ParameterValidator.validate(effectiveDeclared, provided);
            var errors = violations.stream()
                    .filter(v -> !"unknown".equals(v.constraint()))
                    .toList();
            if (!errors.isEmpty()) {
                String msgs = errors.stream()
                        .map(io.casehub.yaml.core.module.ParameterViolation::message)
                        .reduce((a, b) -> a + "; " + b).orElse("");
                throw new IllegalArgumentException(
                        "Include '" + file + "': " + msgs);
            }

            VariableResolver resolver = VariableResolver.forParams(
                    effectiveDeclared, provided, Set.of());

            List<JsonNode> stepsToAdd = new ArrayList<>();
            if (template.has("steps") && template.get("steps").isArray()) {
                for (JsonNode step : template.get("steps")) {
                    JsonNode resolved = resolveNode(step, resolver);
                    if (shouldInclude(resolved)) {
                        stepsToAdd.add(resolved);
                    }
                }
            }

            if (template.has("includes") && template.get("includes").isArray()) {
                // Resolve params in nested include directives
                ArrayNode resolvedIncludes = JsonNodeFactory.instance.arrayNode();
                for (JsonNode nested : template.get("includes")) {
                    if (nested.has("params") && nested.get("params").isObject()) {
                        ObjectNode nestedCopy = nested.deepCopy();
                        ObjectNode resolvedParams = JsonNodeFactory.instance.objectNode();
                        Iterator<Map.Entry<String, JsonNode>> fields = nestedCopy.get("params").fields();
                        while (fields.hasNext()) {
                            Map.Entry<String, JsonNode> entry = fields.next();
                            if (entry.getValue().isTextual()
                                    && entry.getValue().asText().contains("${")) {
                                String resolved = resolver.resolveString(
                                        entry.getValue().asText(), "include-params");
                                resolvedParams.put(entry.getKey(), resolved);
                            } else {
                                resolvedParams.set(entry.getKey(), entry.getValue());
                            }
                        }
                        nestedCopy.set("params", resolvedParams);
                        resolvedIncludes.add(nestedCopy);
                    } else {
                        resolvedIncludes.add(nested);
                    }
                }

                Set<String> nestedAncestors = new LinkedHashSet<>(ancestors);
                nestedAncestors.add(file);
                ObjectNode nestedTemplate = template.deepCopy();
                ArrayNode nestedSteps = JsonNodeFactory.instance.arrayNode();
                stepsToAdd.forEach(nestedSteps::add);
                nestedTemplate.set("steps", nestedSteps);
                nestedTemplate.set("includes", resolvedIncludes);
                JsonNode expanded = expand(nestedTemplate, nestedAncestors);
                stepsToAdd.clear();
                if (expanded.has("steps")) {
                    expanded.get("steps").forEach(stepsToAdd::add);
                }
            }

            allSteps.addAll(stepsToAdd);
        }

        return allSteps;
    }

    private Map<String, YamlModuleParameter> parseTemplateParams(JsonNode template) {
        if (!template.has("params") || !template.get("params").isArray()) {
            return Map.of();
        }
        Map<String, YamlModuleParameter> result = new LinkedHashMap<>();
        for (JsonNode p : template.get("params")) {
            String name = p.path("name").asText();
            String typeStr = p.path("type").asText("string");
            ParameterType type = ParameterType.fromString(typeStr);
            boolean required = p.path("required").asBoolean(false);
            String defaultValue = p.has("default") ? p.get("default").asText() : null;
            List<String> allowed = new ArrayList<>();
            if (p.has("enum")) {
                for (JsonNode e : p.get("enum")) {
                    allowed.add(e.asText());
                }
            }
            result.put(name, YamlModuleParameter.builder()
                    .type(type).required(required)
                    .defaultValue(defaultValue)
                    .allowedValues(allowed).build());
        }
        return result;
    }

    private Map<String, String> extractCallerParams(JsonNode include) {
        if (!include.has("params") || !include.get("params").isObject()) {
            return Map.of();
        }
        Map<String, String> result = new LinkedHashMap<>();
        Iterator<Map.Entry<String, JsonNode>> fields = include.get("params").fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> entry = fields.next();
            result.put(entry.getKey(), entry.getValue().asText());
        }
        return result;
    }

    private JsonNode resolveNode(JsonNode node, VariableResolver resolver) {
        if (node.isTextual()) {
            String text = node.asText();
            if (text.contains("${")) {
                return new TextNode(resolver.resolveString(text, "include"));
            }
            return node;
        }
        if (node.isObject()) {
            ObjectNode result = node.deepCopy();
            List<Map.Entry<String, JsonNode>> entries = new ArrayList<>();
            result.fields().forEachRemaining(entries::add);
            for (var entry : entries) {
                result.set(entry.getKey(), resolveNode(entry.getValue(), resolver));
            }
            return result;
        }
        if (node.isArray()) {
            ArrayNode result = JsonNodeFactory.instance.arrayNode();
            for (JsonNode element : node) {
                result.add(resolveNode(element, resolver));
            }
            return result;
        }
        return node;
    }

    private boolean shouldInclude(JsonNode step) {
        if (!step.has("when")) return true;
        String when = step.get("when").asText();
        if (when.isEmpty()) return false;
        try {
            return Truthiness.isTruthy(when);
        } catch (Exception e) {
            return true;
        }
    }
}
