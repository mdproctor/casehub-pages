package io.casehub.pages.scenario;

import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class ScenarioParser {

    private static final Set<String> KNOWN_ACTIONS =
        Set.of("navigate", "click", "fill", "select", "expand", "collapse", "assert", "wait", "spotlight");

    private static final JsonFactory YAML_FACTORY = new YAMLFactory();

    private ScenarioParser() {}

    public static Scenario parse(String yaml) {
        try (JsonParser p = YAML_FACTORY.createParser(yaml)) {
            return parseRoot(p);
        } catch (IOException e) {
            throw new IllegalArgumentException("Failed to parse scenario YAML: " + e.getMessage(), e);
        }
    }

    private static Scenario parseRoot(JsonParser p) throws IOException {
        expect(p, JsonToken.START_OBJECT);
        String name = null;
        List<ScenarioStep> steps = null;

        while (p.nextToken() != JsonToken.END_OBJECT) {
            String field = p.currentName();
            p.nextToken();
            switch (field) {
                case "scenario" -> name = p.getText();
                case "steps" -> steps = parseSteps(p);
                default -> p.skipChildren();
            }
        }

        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("Missing or empty 'scenario' name");
        }
        if (steps == null) {
            throw new IllegalArgumentException("Missing 'steps' array");
        }
        return new Scenario(name, steps);
    }

    private static List<ScenarioStep> parseSteps(JsonParser p) throws IOException {
        if (p.currentToken() != JsonToken.START_ARRAY) {
            throw new IllegalArgumentException("'steps' must be an array");
        }
        List<ScenarioStep> steps = new ArrayList<>();
        while (p.nextToken() != JsonToken.END_ARRAY) {
            steps.add(parseStep(p));
        }
        return steps;
    }

    private static ScenarioStep parseStep(JsonParser p) throws IOException {
        if (p.currentToken() != JsonToken.START_OBJECT) {
            throw new IllegalArgumentException("Each step must be an object");
        }

        p.nextToken();
        String firstField = p.currentName();
        p.nextToken();

        if (KNOWN_ACTIONS.contains(firstField)) {
            return parseAriaShorthand(firstField, p);
        }

        Map<String, Object> fields = new HashMap<>();
        fields.put(firstField, readValue(p));
        while (p.nextToken() != JsonToken.END_OBJECT) {
            String key = p.currentName();
            p.nextToken();
            fields.put(key, readValue(p));
        }

        String delivery = (String) fields.get("delivery");
        if (delivery == null) delivery = (String) fields.get("target");
        if (delivery == null) {
            throw new IllegalArgumentException(
                    "Unknown step format — must be an ARIA shorthand or have a 'delivery' field. Found keys: " + fields.keySet());
        }

        return switch (delivery) {
            case "graphql" -> buildGraphQLStep(fields);
            case "simulated" -> buildSimulatedStep(fields);
            case "rest" -> buildRestStep(fields);
            default -> throw new IllegalArgumentException("Unknown delivery type: " + delivery);
        };
    }

    private static ScenarioStep.AriaStep parseAriaShorthand(String action, JsonParser p) throws IOException {
        if ("navigate".equals(action)) {
            String path = p.getText();
            while (p.nextToken() != JsonToken.END_OBJECT) {
                p.skipChildren();
            }
            return new ScenarioStep.AriaStep("navigate-" + path, action, null, path, null, null);
        }

        ScenarioStep.AriaStep step = parseTargetedStep(action, p);
        while (p.nextToken() != JsonToken.END_OBJECT) {
            p.skipChildren();
        }
        return step;
    }

    private static ScenarioStep.AriaStep parseTargetedStep(String action, JsonParser p) throws IOException {
        if (p.currentToken() != JsonToken.START_OBJECT) {
            throw new IllegalArgumentException(action + " step must have an object body");
        }

        String role = null;
        String name = null;
        AriaTarget within = null;
        String value = null;
        Map<String, Object> state = null;
        Integer timeout = null;

        while (p.nextToken() != JsonToken.END_OBJECT) {
            String field = p.currentName();
            p.nextToken();
            switch (field) {
                case "role" -> role = p.getText();
                case "name" -> name = p.getText();
                case "within" -> within = parseAriaTarget(p);
                case "value" -> value = p.getText();
                case "content" -> value = p.getText();
                case "state" -> state = parseState(p);
                case "timeout" -> timeout = p.getIntValue();
                case "position" -> { if (state == null) state = new HashMap<>(); state.put("position", p.getText()); }
                case "duration" -> { if (state == null) state = new HashMap<>(); state.put("duration", p.getIntValue()); }
                default -> p.skipChildren();
            }
        }

        AriaTarget target = (role != null && name != null) ? new AriaTarget(role, name, within) : null;
        String autoName = action + "-" + (role != null ? role : "unknown") + "-" + (name != null ? name : "unknown");
        return new ScenarioStep.AriaStep(autoName, action, target, value, state, timeout);
    }

    @SuppressWarnings("unchecked")
    private static ScenarioStep.GraphQLStep buildGraphQLStep(Map<String, Object> fields) {
        String name = (String) fields.get("name");
        String domain = (String) fields.get("domain");
        String operation = (String) fields.get("operation");
        Map<String, Object> params = fields.containsKey("params")
                ? (Map<String, Object>) fields.get("params") : Map.of();
        AwaitCondition await = null;
        if (fields.containsKey("await")) {
            Map<String, Object> awaitMap = (Map<String, Object>) fields.get("await");
            Map<String, Object> match = (Map<String, Object>) awaitMap.get("match");
            Integer timeout = awaitMap.containsKey("timeout") ? ((Number) awaitMap.get("timeout")).intValue() : null;
            Integer interval = awaitMap.containsKey("interval") ? ((Number) awaitMap.get("interval")).intValue() : null;
            await = new AwaitCondition(match, timeout, interval);
        }
        return new ScenarioStep.GraphQLStep(name, domain, operation, params, await);
    }

    @SuppressWarnings("unchecked")
    private static ScenarioStep.SimulatedStep buildSimulatedStep(Map<String, Object> fields) {
        String name = (String) fields.get("name");
        String dataset = (String) fields.get("dataset");
        Map<String, Object> data = fields.containsKey("data")
                ? (Map<String, Object>) fields.get("data") : Map.of();
        return new ScenarioStep.SimulatedStep(name, dataset, data);
    }

    @SuppressWarnings("unchecked")
    private static ScenarioStep.RestStep buildRestStep(Map<String, Object> fields) {
        String name = (String) fields.get("name");
        String method = (String) fields.getOrDefault("method", "POST");
        String url = (String) fields.get("url");
        Map<String, Object> body = fields.containsKey("body")
                ? (Map<String, Object>) fields.get("body") : Map.of();
        Map<String, String> headers = Map.of();
        if (fields.containsKey("headers")) {
            Map<String, Object> rawHeaders = (Map<String, Object>) fields.get("headers");
            headers = new HashMap<>();
            for (var entry : rawHeaders.entrySet()) {
                headers.put(entry.getKey(), String.valueOf(entry.getValue()));
            }
        }
        Integer expectedStatus = null;
        AwaitCondition await = null;
        if (fields.containsKey("await")) {
            Map<String, Object> awaitMap = (Map<String, Object>) fields.get("await");
            if (awaitMap.containsKey("status")) {
                expectedStatus = ((Number) awaitMap.get("status")).intValue();
            }
            if (awaitMap.containsKey("match")) {
                Map<String, Object> match = (Map<String, Object>) awaitMap.get("match");
                Integer timeout = awaitMap.containsKey("timeout") ? ((Number) awaitMap.get("timeout")).intValue() : null;
                Integer interval = awaitMap.containsKey("interval") ? ((Number) awaitMap.get("interval")).intValue() : null;
                await = new AwaitCondition(match, timeout, interval);
            }
        }
        return new ScenarioStep.RestStep(name, method, url, body, headers, expectedStatus, await);
    }

    @SuppressWarnings("unchecked")
    private static Object readValue(JsonParser p) throws IOException {
        return switch (p.currentToken()) {
            case VALUE_STRING -> p.getText();
            case VALUE_NUMBER_INT -> p.getIntValue();
            case VALUE_NUMBER_FLOAT -> p.getDoubleValue();
            case VALUE_TRUE -> true;
            case VALUE_FALSE -> false;
            case VALUE_NULL -> null;
            case START_OBJECT -> {
                Map<String, Object> map = new HashMap<>();
                while (p.nextToken() != JsonToken.END_OBJECT) {
                    String key = p.currentName();
                    p.nextToken();
                    map.put(key, readValue(p));
                }
                yield map;
            }
            case START_ARRAY -> {
                List<Object> list = new ArrayList<>();
                while (p.nextToken() != JsonToken.END_ARRAY) {
                    list.add(readValue(p));
                }
                yield list;
            }
            default -> throw new IllegalArgumentException("Unexpected token: " + p.currentToken());
        };
    }

    private static AriaTarget parseAriaTarget(JsonParser p) throws IOException {
        if (p.currentToken() != JsonToken.START_OBJECT) {
            throw new IllegalArgumentException("AriaTarget must be an object");
        }
        String role = null;
        String name = null;
        AriaTarget within = null;

        while (p.nextToken() != JsonToken.END_OBJECT) {
            String field = p.currentName();
            p.nextToken();
            switch (field) {
                case "role" -> role = p.getText();
                case "name" -> name = p.getText();
                case "within" -> within = parseAriaTarget(p);
                default -> p.skipChildren();
            }
        }

        if (role == null || name == null) {
            throw new IllegalArgumentException("AriaTarget requires 'role' and 'name'");
        }
        return new AriaTarget(role, name, within);
    }

    private static Map<String, Object> parseState(JsonParser p) throws IOException {
        if (p.currentToken() != JsonToken.START_OBJECT) {
            throw new IllegalArgumentException("'state' must be an object");
        }
        Map<String, Object> state = new HashMap<>();
        while (p.nextToken() != JsonToken.END_OBJECT) {
            String key = p.currentName();
            p.nextToken();
            state.put(key, readScalar(p));
        }
        return state;
    }

    private static Object readScalar(JsonParser p) throws IOException {
        return switch (p.currentToken()) {
            case VALUE_STRING -> p.getText();
            case VALUE_NUMBER_INT -> p.getIntValue();
            case VALUE_NUMBER_FLOAT -> p.getDoubleValue();
            case VALUE_TRUE -> true;
            case VALUE_FALSE -> false;
            case VALUE_NULL -> null;
            default -> throw new IllegalArgumentException("State values must be scalars, got: " + p.currentToken());
        };
    }

    private static void expect(JsonParser p, JsonToken expected) throws IOException {
        JsonToken token = p.nextToken();
        if (token != expected) {
            throw new IllegalArgumentException("Expected " + expected + " but got " + token);
        }
    }
}
