package io.casehub.pages.scenario;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public final class HierarchicalParser {

    private static final ObjectMapper YAML = new ObjectMapper(new YAMLFactory());

    private HierarchicalParser() {}

    public static HierarchicalScenario parse(String yaml) {
        try {
            JsonNode root = YAML.readTree(yaml);

            String scenario    = root.path("scenario").asText(null);
            String description = root.path("description").asText(null);
            double speed       = root.path("speed").asDouble(1.0);
            String onError     = root.path("on-error").asText(null);
            Map<String, Object> data = root.has("data")
                                       ? toMap(root.get("data")) : null;

            List<ParamDescriptor> params = root.has("params")
                                           ? parseParams(root.get("params")) : null;
            ScriptMeta meta = root.has("meta")
                              ? parseMeta(root.get("meta")) : null;
            Map<String, Object> iterations = root.has("iterations")
                                             ? toMap(root.get("iterations")) : null;

            boolean hasChapters = root.has("chapters");
            boolean hasSections = root.has("sections") && !root.has("chapters");
            boolean hasSteps    = root.has("steps") && !root.has("chapters") && !root.has("sections");

            if (root.has("chapters") && root.has("steps")) {
                throw new IllegalArgumentException(
                        "chapters, sections, and steps are mutually exclusive at top level");
            }
            if (root.has("chapters") && root.has("sections")) {
                throw new IllegalArgumentException(
                        "chapters, sections, and steps are mutually exclusive at top level");
            }
            if (root.has("sections") && root.has("steps")) {
                throw new IllegalArgumentException(
                        "chapters, sections, and steps are mutually exclusive at top level");
            }

            List<ScenarioChapter> chapters = hasChapters
                                             ? parseChapters(root.get("chapters")) : null;
            List<ScenarioSection> sections = hasSections
                                             ? parseSections(root.get("sections")) : null;
            List<HierarchicalStep> steps = hasSteps
                                           ? parseSteps(root.get("steps")) : null;

            if (scenario == null || scenario.isBlank()) {
                throw new IllegalArgumentException("Missing or empty 'scenario' name");
            }

            String slides = root.has("content") && root.get("content").has("slides")
                            ? root.get("content").get("slides").asText() : null;

            return new HierarchicalScenario(scenario, description, speed,
                                            onError, params, meta, data, iterations, slides,
                                            chapters, sections, steps);
        } catch (IOException e) {
            throw new IllegalArgumentException("Failed to parse scenario YAML", e);
        }}

    private static List<ScenarioChapter> parseChapters(JsonNode node) {
        List<ScenarioChapter> chapters = new ArrayList<>();
        for (JsonNode ch : node) {
            String label = ch.path("label").asText();
            NarrativeContent content = ch.has("content")
                ? parseContent(ch.get("content")) : null;
            List<ScenarioSection> sections = parseSections(ch.get("sections"));
            chapters.add(new ScenarioChapter(label, content, sections));
        }
        return chapters;
    }

    private static List<ScenarioSection> parseSections(JsonNode node) {
        if (node == null) return List.of();
        List<ScenarioSection> sections = new ArrayList<>();
        for (JsonNode sec : node) {
            String label = sec.path("label").asText();
            NarrativeContent content = sec.has("content")
                ? parseContent(sec.get("content")) : null;
            List<HierarchicalStep> steps = parseSteps(sec.get("steps"));
            sections.add(new ScenarioSection(label, content, steps));
        }
        return sections;
    }

    private static List<HierarchicalStep> parseSteps(JsonNode node) {
        if (node == null) return List.of();
        List<HierarchicalStep> steps = new ArrayList<>();
        for (JsonNode s : node) {
            steps.add(parseStep(s));
        }
        return steps;
    }

    private static HierarchicalStep parseStep(JsonNode node) {
        String name   = node.path("name").asText(null);
        String label  = node.path("label").asText();
        String target = node.path("target").asText();
        String actor  = node.path("actor").asText(null);
        Trigger trigger = node.has("trigger")
                          ? parseTrigger(node.get("trigger")) : null;
        io.casehub.yaml.core.foreach.ForEachDirective forEach = node.has("forEach")
                                                                ? parseForEach(node.get("forEach")) : null;
        String when = node.path("when").asText(null);
        NarrativeContent content = node.has("content")
                                   ? parseContent(node.get("content")) : null;
        List<ScenarioCommand> commands = parseCommands(node.get("commands"));
        return new HierarchicalStep(name, label, target, actor, trigger,
                                    forEach, when, content, commands);
    }

    @SuppressWarnings("unchecked")
    private static io.casehub.yaml.core.foreach.ForEachDirective parseForEach(JsonNode node) {
        if (node.isTextual()) {return io.casehub.yaml.core.foreach.ForEachDirective.parse(node.asText());}
        if (node.isObject()) {
            return io.casehub.yaml.core.foreach.ForEachDirective.parse(YAML.convertValue(node, Map.class));
        }
        throw new IllegalArgumentException("forEach must be a string or object, got: " + node.getNodeType());
    }

    private static List<ParamDescriptor> parseParams(JsonNode paramsNode) {
        List<ParamDescriptor> params = new ArrayList<>();
        for (JsonNode p : paramsNode) {
            String       pName        = p.path("name").asText();
            String       type         = p.path("type").asText("string");
            boolean      required     = p.path("required").asBoolean(false);
            Object       defaultValue = p.has("default") ? nodeToObject(p.get("default")) : null;
            List<Object> enumValues   = List.of();
            if (p.has("enum")) {
                List<Object> evs = new ArrayList<>();
                for (JsonNode e : p.get("enum")) {evs.add(nodeToObject(e));}
                enumValues = List.copyOf(evs);
            }
            params.add(new ParamDescriptor(pName, type, required, defaultValue, enumValues));
        }
        return List.copyOf(params);
    }

    private static ScriptMeta parseMeta(JsonNode metaNode) {
        String       description = metaNode.path("description").asText(null);
        List<String> labels      = extractStringList(metaNode, "labels");
        List<String> tags        = extractStringList(metaNode, "tags");
        return new ScriptMeta(description, labels, tags);
    }

    private static List<String> extractStringList(JsonNode parent, String field) {
        if (!parent.has(field)) {return List.of();}
        List<String> result = new ArrayList<>();
        for (JsonNode item : parent.get(field)) {result.add(item.asText());}
        return List.copyOf(result);
    }

    private static Object nodeToObject(JsonNode node) {
        if (node.isTextual()) {return node.asText();}
        if (node.isInt()) {return node.asInt();}
        if (node.isBoolean()) {return node.booleanValue();}
        if (node.isDouble()) {return node.asDouble();}
        return node.asText();
    }


    private static List<ScenarioCommand> parseCommands(JsonNode node) {
        if (node == null) return List.of();
        List<ScenarioCommand> commands = new ArrayList<>();
        for (JsonNode c : node) {
            commands.add(parseCommand(c));
        }
        return commands;
    }

    private static ScenarioCommand parseCommand(JsonNode node) {
        String action = node.path("action").asText();
        AriaTarget ariaTarget = node.has("target")
            ? parseAriaTarget(node.get("target")) : null;
        String value = node.path("value").asText(null);
        Map<String, Object> data = node.has("data")
            ? toMap(node.get("data")) : null;
        String domain = node.path("domain").asText(null);
        AwaitCondition await = node.has("await")
            ? parseAwait(node.get("await")) : null;
        Integer timeout = node.has("timeout")
            ? node.get("timeout").asInt() : null;
        ScenarioCommand.DataMode mode = node.has("mode")
            ? ScenarioCommand.DataMode.valueOf(node.get("mode").asText().toUpperCase())
            : null;
        String source = node.path("source").asText(null);
        Integer interval = node.has("interval")
            ? node.get("interval").asInt() : null;
        String script = node.path("script").asText(null);
        Map<String, Object> callParams = node.has("params")
            ? toMap(node.get("params")) : null;
        return new ScenarioCommand(action, ariaTarget, value, data,
            domain, await, timeout, mode, source, interval, script, callParams);
    }

    private static AriaTarget parseAriaTarget(JsonNode node) {
        if (node.isTextual()) {return null;}
        String role  = node.path("role").asText(null);
        String name  = node.path("name").asText(null);
        String index = node.has("index") ? node.get("index").asText() : null;
        if (role == null) {return null;}
        if (name == null && index == null) {return null;}
        AriaTarget within = node.has("within")
                            ? parseAriaTarget(node.get("within")) : null;
        return new AriaTarget(role, name, index, within);}



    private static AwaitCondition parseAwait(JsonNode node) {
        Map<String, Object> match = node.has("match")
            ? toMap(node.get("match")) : Map.of();
        Integer timeout = node.has("timeout")
            ? node.get("timeout").asInt() : null;
        Integer interval = node.has("interval")
            ? node.get("interval").asInt() : null;
        return new AwaitCondition(match, timeout, interval);
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
            Map<String, Object> match = when.has("match")
                ? toMap(when.get("match")) : Map.of();
            long poll = when.path("poll").asLong(500);
            return new Trigger.DataTrigger(endpoint, match, poll);
        }
        throw new IllegalArgumentException("Unknown trigger format: " + node);
    }

    private static NarrativeContent parseContent(JsonNode node) {
        if (node.isTextual()) {
            return new NarrativeContent.Inline(node.asText());
        }
        if (node.isObject()) {
            if (node.has("template")) {
                String path = node.get("template").asText();
                String section = node.path("section").asText(null);
                Map<String, Object> params = node.has("params")
                    ? toMap(node.get("params")) : Map.of();
                return new NarrativeContent.Template(path, section, params);
            }
            if (node.has("slide")) {
                JsonNode slideNode = node.get("slide");
                Object ref = slideNode.isInt() ? slideNode.asInt() : slideNode.asText();
                return new NarrativeContent.Slide(ref);
            }
        }
        return new NarrativeContent.Inline(node.asText());
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> toMap(JsonNode node) {
        return YAML.convertValue(node, Map.class);
    }
}
