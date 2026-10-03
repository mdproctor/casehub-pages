package io.casehub.pages.scenario;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import io.casehub.yaml.core.foreach.ForEachDirective;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class ScenarioEnvelopeParser {

    private static final ObjectMapper YAML = new ObjectMapper(new YAMLFactory());

    private static final Set<String> KNOWN_KEYS = Set.of(
            "label", "step", "target", "actor", "delay", "when",
            "forEach", "content", "trigger", "speed", "await", "mode",
            "temporal"
    );

    private ScenarioEnvelopeParser() {}

    public static ScenarioEnvelope parse(String yaml) {
        try {
            JsonNode root = YAML.readTree(yaml);

            String scenario = root.path("scenario").asText(null);
            if (scenario == null || scenario.isBlank()) {
                throw new IllegalArgumentException("Missing or empty 'scenario' name");
            }

            String description = root.path("description").asText(null);
            double speed = root.has("speed") ? root.path("speed").asDouble(1.0) : -1.0;
            String actor = root.path("actor").asText(null);
            String onError = root.path("on-error").asText(null);

            Map<String, Object> data = root.has("data") ? toMap(root.get("data")) : null;
            List<ParamDescriptor> params = root.has("params") ? parseParams(root.get("params")) : null;
            ScriptMeta meta = root.has("meta") ? parseMeta(root.get("meta")) : null;
            Map<String, Object> iterations = root.has("iterations") ? toMap(root.get("iterations")) : null;

            String slides = root.has("content") && root.get("content").has("slides")
                    ? root.get("content").get("slides").asText() : null;
            SimulationSpec simulation = root.has("simulation")
                    ? parseSimulation(root.get("simulation")) : null;

            boolean hasChapters = root.has("chapters");
            boolean hasSections = root.has("sections");
            boolean hasSteps = root.has("steps");

            if ((hasChapters && hasSections) || (hasChapters && hasSteps) || (hasSections && hasSteps)) {
                throw new IllegalArgumentException(
                        "chapters, sections, and steps are mutually exclusive at top level");
            }

            List<ScenarioEnvelope.Chapter> chapters = hasChapters
                    ? parseChapters(root.get("chapters"), actor) : null;
            List<ScenarioEnvelope.Section> sections = hasSections
                    ? parseSections(root.get("sections"), actor) : null;
            List<CompactStep> steps = hasSteps
                    ? parseSteps(root.get("steps"), actor) : null;

            var envelope = new ScenarioEnvelope(scenario, description, speed, actor, onError,
                    params, meta, data, iterations, slides, simulation, chapters, sections, steps);

            validateStepNameUniqueness(envelope.allSteps());
            return envelope;

        } catch (IOException e) {
            throw new IllegalArgumentException("Failed to parse scenario YAML", e);
        }
    }

    public static String deriveStepName(CompactStep step, int index) {
        String explicit = step.decorator("step");
        if (explicit != null) return explicit;
        String label = step.decorator("label");
        if (label != null) return slugify(label);
        return step.action() + "-" + index;
    }

    public static String slugify(String label) {
        return label.toLowerCase()
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-|-$", "");
    }

    private static void validateStepNameUniqueness(List<CompactStep> steps) {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < steps.size(); i++) {
            String name = deriveStepName(steps.get(i), i);
            if (!seen.add(name)) {
                throw new IllegalArgumentException(
                        "Duplicate step name: '" + name + "'. Step names must be unique.");
            }
        }
    }

    private static List<ScenarioEnvelope.Chapter> parseChapters(JsonNode node, String defaultActor) {
        List<ScenarioEnvelope.Chapter> chapters = new ArrayList<>();
        for (JsonNode ch : node) {
            String label = ch.path("label").asText();
            String content = ch.path("content").asText(null);
            List<ScenarioEnvelope.Section> sections = parseSections(ch.get("sections"), defaultActor);
            chapters.add(new ScenarioEnvelope.Chapter(label, content, sections));
        }
        return chapters;
    }

    private static List<ScenarioEnvelope.Section> parseSections(JsonNode node, String defaultActor) {
        if (node == null) return List.of();
        List<ScenarioEnvelope.Section> sections = new ArrayList<>();
        for (JsonNode sec : node) {
            String label = sec.path("label").asText();
            String content = sec.path("content").asText(null);
            List<CompactStep> steps = parseSteps(sec.get("steps"), defaultActor);
            sections.add(new ScenarioEnvelope.Section(label, content, steps));
        }
        return sections;
    }

    private static List<CompactStep> parseSteps(JsonNode node, String defaultActor) {
        if (node == null) return List.of();
        List<CompactStep> steps = new ArrayList<>();
        for (JsonNode s : node) {
            steps.add(parseStep(s, defaultActor));
        }
        return steps;
    }

    @SuppressWarnings("unchecked")
    private static CompactStep parseStep(JsonNode node, String defaultActor) {
        String actionKey = null;
        Map<String, Object> params = new LinkedHashMap<>();
        Map<String, Object> decorators = new LinkedHashMap<>();
        ForEachDirective forEach = null;
        Trigger trigger = null;
        TemporalSpec temporal = null;

        var fields = node.fields();
        while (fields.hasNext()) {
            var field = fields.next();
            String key = field.getKey();
            JsonNode value = field.getValue();

            if (KNOWN_KEYS.contains(key)) {
                switch (key) {
                    case "forEach" -> forEach = parseForEach(value);
                    case "trigger" -> trigger = parseTrigger(value);
                    case "temporal" -> temporal = parseTemporal(value);
                    default -> decorators.put(key, nodeToValue(value));
                }
            } else {
                if (actionKey != null) {
                    throw new IllegalArgumentException(
                            "Step has multiple action keys: '" + actionKey + "' and '" + key + "'");
                }
                actionKey = key;
                if (value.isObject()) {
                    params = toMap(value);
                } else {
                    params = new LinkedHashMap<>();
                    params.put("value", nodeToValue(value));
                }
            }
        }

        if (temporal != null) {
            // temporal steps have action "temporal" and no target requirement
        } else {
            if (actionKey == null) {
                throw new IllegalArgumentException("Step has no action key");
            }
            if (!decorators.containsKey("target")) {
                decorators.put("target", "browser");
            }
        }

        if (defaultActor != null && !decorators.containsKey("actor")) {
            decorators.put("actor", defaultActor);
        }

        String action = temporal != null && actionKey == null ? "temporal" : actionKey;

        return new CompactStep(action, params, forEach, trigger, temporal, decorators);
    }

    private static Object nodeToValue(JsonNode node) {
        if (node.isTextual()) return node.asText();
        if (node.isInt()) return node.asInt();
        if (node.isLong()) return node.asLong();
        if (node.isDouble() || node.isFloat()) return node.asDouble();
        if (node.isBoolean()) return node.booleanValue();
        if (node.isNull()) return null;
        if (node.isObject() || node.isArray()) return toMapOrList(node);
        return node.asText();
    }

    @SuppressWarnings("unchecked")
    private static Object toMapOrList(JsonNode node) {
        if (node.isArray()) return YAML.convertValue(node, List.class);
        return YAML.convertValue(node, Map.class);
    }

    @SuppressWarnings("unchecked")
    private static ForEachDirective parseForEach(JsonNode node) {
        if (node.isTextual()) return ForEachDirective.parse(node.asText());
        if (node.isObject()) return ForEachDirective.parse(YAML.convertValue(node, Map.class));
        throw new IllegalArgumentException("forEach must be a string or object, got: " + node.getNodeType());
    }

    private static Trigger parseTrigger(JsonNode node) {
        if (node.has("after")) {
            String step = node.get("after").asText();
            long delay = node.path("delay").asLong(0);
            return new Trigger.AfterTrigger(step, delay);
        }
        if (node.has("at")) {
            return new Trigger.TimeTrigger(node.get("at").asLong());
        }
        if (node.has("when")) {
            JsonNode when = node.get("when");
            String endpoint = when.path("endpoint").asText(null);
            @SuppressWarnings("unchecked")
            Map<String, Object> match = when.has("match")
                    ? YAML.convertValue(when.get("match"), Map.class) : Map.of();
            long poll = when.path("poll").asLong(500);
            return new Trigger.DataTrigger(endpoint, match, poll);
        }
        throw new IllegalArgumentException("Unknown trigger format: " + node);
    }

    @SuppressWarnings("unchecked")
    private static TemporalSpec parseTemporal(JsonNode node) {
        TemporalSpec.Action action = TemporalSpec.Action.valueOf(
                node.path("action").asText().toUpperCase().replace("-", "_"));
        String name = node.path("name").asText(null);
        String profile = node.path("profile").asText(null);
        String qualifiedName = node.has("qualified-name")
                ? node.get("qualified-name").asText() : null;
        String tenancyId = node.has("tenancy-id")
                ? node.get("tenancy-id").asText() : null;
        Boolean loop = node.has("loop") ? node.get("loop").asBoolean() : null;
        Double speed = node.has("speed") ? node.get("speed").asDouble() : null;

        List<TemporalSpec.Event> events = null;
        if (node.has("events")) {
            events = new ArrayList<>();
            for (JsonNode e : node.get("events")) {
                String delay = e.has("delay") ? e.get("delay").asText() : "0";
                String label = e.path("label").asText(null);
                Map<String, Object> payload = e.has("payload")
                        ? YAML.convertValue(e.get("payload"), Map.class) : Map.of();
                events.add(new TemporalSpec.Event(delay, label, payload));
            }
        }
        return new TemporalSpec(action, name, profile, qualifiedName, tenancyId, events, loop, speed);
    }

    @SuppressWarnings("unchecked")
    private static SimulationSpec parseSimulation(JsonNode node) {
        Map<String, String> strategies = node.has("strategies")
                ? YAML.convertValue(node.get("strategies"), Map.class) : Map.of();
        List<String> corpus = node.has("corpus")
                ? YAML.convertValue(node.get("corpus"), List.class) : List.of();
        List<String> capture = node.has("capture")
                ? YAML.convertValue(node.get("capture"), List.class) : List.of();
        return new SimulationSpec(strategies, corpus, capture);
    }

    private static List<ParamDescriptor> parseParams(JsonNode paramsNode) {
        List<ParamDescriptor> params = new ArrayList<>();
        for (JsonNode p : paramsNode) {
            String name = p.path("name").asText();
            String type = p.path("type").asText("string");
            boolean required = p.path("required").asBoolean(false);
            Object defaultValue = p.has("default") ? nodeToValue(p.get("default")) : null;
            List<Object> enumValues = List.of();
            if (p.has("enum")) {
                List<Object> evs = new ArrayList<>();
                for (JsonNode e : p.get("enum")) evs.add(nodeToValue(e));
                enumValues = List.copyOf(evs);
            }
            params.add(new ParamDescriptor(name, type, required, defaultValue, enumValues));
        }
        return List.copyOf(params);
    }

    private static ScriptMeta parseMeta(JsonNode metaNode) {
        String description = metaNode.path("description").asText(null);
        List<String> labels = extractStringList(metaNode, "labels");
        List<String> tags = extractStringList(metaNode, "tags");
        return new ScriptMeta(description, labels, tags);
    }

    private static List<String> extractStringList(JsonNode parent, String field) {
        if (!parent.has(field)) return List.of();
        List<String> result = new ArrayList<>();
        for (JsonNode item : parent.get(field)) result.add(item.asText());
        return List.copyOf(result);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> toMap(JsonNode node) {
        return YAML.convertValue(node, Map.class);
    }
}
