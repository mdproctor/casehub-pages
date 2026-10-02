package io.casehub.pages.scenario;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class IncludeExpanderTest {

    private static final ObjectMapper YAML = new ObjectMapper(new YAMLFactory());

    private static final String SEED_TEMPLATE = """
            params:
              - name: customer
                type: string
                required: true
            steps:
              - label: "Seed customer"
                target: browser
                commands:
                  - action: fill
                    target: {role: textbox, name: "Full Name"}
                    value: "${params.customer}"
            """;

    private IncludeExpander.TemplateLoader mockLoader(Map<String, String> files) {
        return path -> {
            String content = files.get(path);
            if (content == null)
                throw new IOException("Template not found: " + path);
            return YAML.readTree(content);
        };
    }

    @Test
    void singleIncludePrependsSteps() throws Exception {
        String scenario = """
                scenario: demo
                includes:
                  - file: seeds/base.yaml
                    params:
                      customer: Alice
                steps:
                  - label: "Main step"
                    target: browser
                    commands:
                      - action: click
                        target: {role: button, name: Done}
                """;

        var expander = new IncludeExpander(
                mockLoader(Map.of("seeds/base.yaml", SEED_TEMPLATE)));
        JsonNode result = expander.expand(YAML.readTree(scenario));

        assertFalse(result.has("includes"));
        JsonNode steps = result.get("steps");
        assertEquals(2, steps.size());
        assertEquals("Alice",
                steps.get(0).get("commands").get(0).get("value").asText());
        assertEquals("Main step",
                steps.get(1).get("label").asText());
    }

    @Test
    void multipleIncludesPreserveOrder() throws Exception {
        String scenario = """
                scenario: demo
                includes:
                  - file: a.yaml
                    params:
                      customer: Alice
                  - file: b.yaml
                    params:
                      customer: Bob
                steps:
                  - label: "Main"
                    target: browser
                    commands: []
                """;

        var expander = new IncludeExpander(
                mockLoader(Map.of("a.yaml", SEED_TEMPLATE,
                                  "b.yaml", SEED_TEMPLATE)));
        JsonNode result = expander.expand(YAML.readTree(scenario));
        JsonNode steps = result.get("steps");

        assertEquals(3, steps.size());
        assertEquals("Alice",
                steps.get(0).get("commands").get(0).get("value").asText());
        assertEquals("Bob",
                steps.get(1).get("commands").get(0).get("value").asText());
    }

    @Test
    void throwsOnCircularInclude() throws Exception {
        String templateA = """
                params: []
                includes:
                  - file: b.yaml
                steps:
                  - label: "A"
                    target: browser
                    commands: []
                """;
        String templateB = """
                params: []
                includes:
                  - file: a.yaml
                steps:
                  - label: "B"
                    target: browser
                    commands: []
                """;
        String scenario = """
                scenario: demo
                includes:
                  - file: a.yaml
                steps: []
                """;

        var expander = new IncludeExpander(
                mockLoader(Map.of("a.yaml", templateA,
                                  "b.yaml", templateB)));
        assertThrows(IllegalArgumentException.class,
                () -> expander.expand(YAML.readTree(scenario)));
    }

    @Test
    void throwsOnMissingRequiredParam() throws Exception {
        String scenario = """
                scenario: demo
                includes:
                  - file: seeds/base.yaml
                    params: {}
                steps: []
                """;

        var expander = new IncludeExpander(
                mockLoader(Map.of("seeds/base.yaml", SEED_TEMPLATE)));
        assertThrows(IllegalArgumentException.class,
                () -> expander.expand(YAML.readTree(scenario)));
    }

    @Test
    void whenFilteringExcludesFalsySteps() throws Exception {
        String template = """
                params:
                  - name: priority
                    type: string
                steps:
                  - label: "Always"
                    target: browser
                    commands: []
                  - when: "${params.priority}"
                    label: "Conditional"
                    target: browser
                    commands: []
                """;
        String scenario = """
                scenario: demo
                includes:
                  - file: cond.yaml
                    params: {}
                steps: []
                """;

        var expander = new IncludeExpander(
                mockLoader(Map.of("cond.yaml", template)));
        JsonNode result = expander.expand(YAML.readTree(scenario));

        assertEquals(1, result.get("steps").size());
        assertEquals("Always",
                result.get("steps").get(0).get("label").asText());
    }

    @Test
    void defaultValuesApplied() throws Exception {
        String template = """
                params:
                  - name: role
                    type: string
                    default: Viewer
                steps:
                  - label: "Set role"
                    target: browser
                    commands:
                      - action: fill
                        value: "${params.role}"
                """;
        String scenario = """
                scenario: demo
                includes:
                  - file: def.yaml
                    params: {}
                steps: []
                """;

        var expander = new IncludeExpander(
                mockLoader(Map.of("def.yaml", template)));
        JsonNode result = expander.expand(YAML.readTree(scenario));

        assertEquals("Viewer",
                result.get("steps").get(0).get("commands")
                      .get(0).get("value").asText());
    }

    @Test
    void nestedIncludesExpandRecursively() throws Exception {
        String inner = """
                params:
                  - name: item
                    type: string
                    required: true
                steps:
                  - label: "Inner"
                    target: browser
                    commands:
                      - action: fill
                        value: "${params.item}"
                """;
        String outer = """
                params:
                  - name: customer
                    type: string
                    required: true
                includes:
                  - file: inner.yaml
                    params:
                      item: "${params.customer}"
                steps:
                  - label: "Outer"
                    target: browser
                    commands: []
                """;
        String scenario = """
                scenario: demo
                includes:
                  - file: outer.yaml
                    params:
                      customer: Alice
                steps:
                  - label: "Main"
                    target: browser
                    commands: []
                """;

        var expander = new IncludeExpander(
                mockLoader(Map.of("outer.yaml", outer,
                                  "inner.yaml", inner)));
        JsonNode result = expander.expand(YAML.readTree(scenario));

        assertEquals(3, result.get("steps").size());
        assertEquals("Alice",
                result.get("steps").get(0).get("commands")
                      .get(0).get("value").asText());
        assertEquals("Outer",
                result.get("steps").get(1).get("label").asText());
        assertEquals("Main",
                result.get("steps").get(2).get("label").asText());
    }
}
