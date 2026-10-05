package io.casehub.pages.scenario;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class ScriptDescriptorExtractor {

    private static final ObjectMapper YAML = new ObjectMapper(new YAMLFactory());

    private ScriptDescriptorExtractor() {}

    public static ScriptDescriptor extract(String yaml, ScriptProvenance provenance) {
        var split = YamlMultiDocSplitter.split(yaml);
        JsonNode root = split.content();

            String name = root.path("scenario").asText(null);
            if (name == null || name.isBlank()) {
                throw new IllegalArgumentException("Missing or empty 'scenario' name");
            }

            String description = null;
            List<String> labels = List.of();
            List<String> tags = List.of();
            if (root.has("meta")) {
                JsonNode meta = root.get("meta");
                description = meta.path("description").asText(null);
                labels = extractStringList(meta, "labels");
                tags = extractStringList(meta, "tags");
            }

            List<ParamDescriptor> params = List.of();
            if (root.has("params")) {
                params = extractParams(root.get("params"));
            }

            List<String> calls = extractCalls(root);
            List<Map<String, String>> firstStepTargets = extractFirstStepTargets(root);

            ScriptLifecycleState state = provenance == ScriptProvenance.UPLOADED
                    ? ScriptLifecycleState.DRAFT : ScriptLifecycleState.ACTIVE;

        return new ScriptDescriptor(name, description, labels, tags,
                params, calls, provenance, state, firstStepTargets);
    }

    private static List<ParamDescriptor> extractParams(JsonNode paramsNode) {
        List<ParamDescriptor> params = new ArrayList<>();
        for (JsonNode p : paramsNode) {
            String pName = p.path("name").asText();
            String type = p.path("type").asText("string");
            boolean required = p.path("required").asBoolean(false);
            Object defaultValue = p.has("default") ? nodeToObject(p.get("default")) : null;
            List<Object> enumValues = List.of();
            if (p.has("enum")) {
                List<Object> evs = new ArrayList<>();
                for (JsonNode e : p.get("enum")) { evs.add(nodeToObject(e)); }
                enumValues = List.copyOf(evs);
            }
            params.add(new ParamDescriptor(pName, type, required, defaultValue, enumValues));
        }
        return List.copyOf(params);
    }

    private static List<String> extractCalls(JsonNode root) {
        List<String> calls = new ArrayList<>();
        collectCalls(root, calls);
        return List.copyOf(calls);
    }

    private static void collectCalls(JsonNode node, List<String> calls) {
        if (node.isObject()) {
            if ("call".equals(node.path("action").asText(null)) && node.has("script")) {
                String scriptName = node.get("script").asText();
                if (!calls.contains(scriptName)) calls.add(scriptName);
            }
            node.fields().forEachRemaining(e -> collectCalls(e.getValue(), calls));
        } else if (node.isArray()) {
            for (JsonNode child : node) { collectCalls(child, calls); }
        }
    }

    private static List<Map<String, String>> extractFirstStepTargets(JsonNode root) {
        JsonNode firstStep = findFirstStep(root);
        if (firstStep == null) return List.of();

        List<Map<String, String>> targets = new ArrayList<>();
        JsonNode commands = firstStep.get("commands");
        if (commands != null) {
            for (JsonNode cmd : commands) {
                if (cmd.has("target") && cmd.get("target").isObject()) {
                    Map<String, String> t = parseAriaTarget(cmd.get("target"));
                    if (t != null) targets.add(t);
                }
            }
        }
        return List.copyOf(targets);
    }

    private static JsonNode findFirstStep(JsonNode root) {
        if (root.has("steps") && root.get("steps").isArray() && !root.get("steps").isEmpty()) {
            return root.get("steps").get(0);
        }
        if (root.has("chapters")) {
            for (JsonNode ch : root.get("chapters")) {
                if (ch.has("sections")) {
                    for (JsonNode sec : ch.get("sections")) {
                        if (sec.has("steps") && !sec.get("steps").isEmpty()) {
                            return sec.get("steps").get(0);
                        }
                    }
                }
            }
        }
        if (root.has("sections")) {
            for (JsonNode sec : root.get("sections")) {
                if (sec.has("steps") && !sec.get("steps").isEmpty()) {
                    return sec.get("steps").get(0);
                }
            }
        }
        return null;
    }

    private static Map<String, String> parseAriaTarget(JsonNode node) {
        String role = node.path("role").asText(null);
        String name = node.path("name").asText(null);
        if (role == null || name == null) return null;
        var target = new LinkedHashMap<String, String>();
        target.put("role", role);
        target.put("name", name);
        return Map.copyOf(target);
    }

    private static List<String> extractStringList(JsonNode parent, String field) {
        if (!parent.has(field)) return List.of();
        List<String> result = new ArrayList<>();
        for (JsonNode item : parent.get(field)) { result.add(item.asText()); }
        return List.copyOf(result);
    }

    private static Object nodeToObject(JsonNode node) {
        if (node.isTextual()) return node.asText();
        if (node.isInt()) return node.asInt();
        if (node.isBoolean()) return node.booleanValue();
        if (node.isDouble()) return node.asDouble();
        return node.asText();
    }
}
