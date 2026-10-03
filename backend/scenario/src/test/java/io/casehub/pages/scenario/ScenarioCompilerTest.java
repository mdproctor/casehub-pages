package io.casehub.pages.scenario;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ScenarioCompilerTest {

    @Test
    void compile_resolvesParams() {
        var compiled = ScenarioCompiler.compile(
                fixture("parameterized-onboard.yaml"),
                Map.of("projectName", "Acme"));
        var firstStep = compiled.steps().get(0);
        assertThat(firstStep.params().get("value")).isEqualTo("Acme");
    }

    @Test
    void compile_missingRequiredParam_throws() {
        assertThatThrownBy(() -> ScenarioCompiler.compile(
                fixture("parameterized-onboard.yaml"), Map.of()))
                .isInstanceOf(io.casehub.yaml.core.module.ParameterValidationException.class);
    }

    @Test
    void compile_whenFalse_excludesStep() {
        var compiled = ScenarioCompiler.compile(
                fixture("parameterized-onboard.yaml"),
                Map.of("projectName", "Acme", "enableCI", "false"));
        assertThat(compiled.steps()).hasSize(1);
        assertThat((String) compiled.steps().get(0).decorator("label")).isEqualTo("Create project");
    }

    @Test
    void compile_whenTrue_includesStep() {
        var compiled = ScenarioCompiler.compile(
                fixture("parameterized-onboard.yaml"),
                Map.of("projectName", "Acme", "enableCI", "true"));
        assertThat(compiled.steps()).hasSize(2);
    }

    @Test
    void compile_whenDefault_usesParamDefault() {
        var compiled = ScenarioCompiler.compile(
                fixture("parameterized-onboard.yaml"),
                Map.of("projectName", "Acme"));
        assertThat(compiled.steps()).hasSize(2);
    }

    @Test
    void compile_forEachCsv_stampsPerRow() {
        var compiled = ScenarioCompiler.compile(
                fixture("foreach-csv-inline.yaml"), Map.of());
        assertThat(compiled.steps()).hasSize(3);
    }

    @Test
    void compile_forEachCsv_resolvesColumnValues() {
        var compiled = ScenarioCompiler.compile(
                fixture("foreach-csv-inline.yaml"), Map.of());
        var aliceStep = compiled.steps().get(0);
        assertThat(aliceStep.params().get("value")).isEqualTo("Alice");
    }

    @Test
    void compile_forEachCsv_stampedLabelsContainRowValue() {
        var compiled = ScenarioCompiler.compile(
                fixture("foreach-csv-inline.yaml"), Map.of());
        assertThat(compiled.steps()).extracting(s -> (String) s.decorator("label"))
                .containsExactly("Create member", "Create member", "Grant admin");
    }

    @Test
    void compile_noParams_noForEach_passesThrough() {
        var compiled = ScenarioCompiler.compile("""
                scenario: simple
                steps:
                  - click:
                      role: button
                      name: Submit
                    label: "Click"
                """, Map.of());
        assertThat(compiled.steps()).hasSize(1);
        assertThat((String) compiled.steps().get(0).decorator("label")).isEqualTo("Click");
    }

    @Test
    void compile_iterationGroup_expandsSimpleValues() {
        var compiled = ScenarioCompiler.compile("""
                scenario: regions-test
                iterations:
                  regions:
                    as: region
                    in: ["us-east", "eu-west"]
                steps:
                  - navigate: "#dashboard/${each.region}"
                    label: "Deploy"
                    forEach: regions
                """, Map.of());
        assertThat(compiled.steps()).hasSize(2);
        assertThat(compiled.steps().get(0).params().get("value"))
                .isEqualTo("#dashboard/us-east");
        assertThat(compiled.steps().get(1).params().get("value"))
                .isEqualTo("#dashboard/eu-west");
    }

    @Test
    void compile_forEachCsv_providesIterationIndex() {
        var compiled = ScenarioCompiler.compile("""
                scenario: index-test
                data:
                  items:
                    inline: |
                      name:string
                      Alpha
                      Bravo
                      Charlie
                steps:
                  - click:
                      role: row
                      name: "Row ${each.index}"
                    label: "Select row"
                    forEach:
                      as: item
                      in: items
                """, Map.of());
        assertThat(compiled.steps()).hasSize(3);
        assertThat(compiled.steps().get(0).params().get("name")).isEqualTo("Row 0");
        assertThat(compiled.steps().get(1).params().get("name")).isEqualTo("Row 1");
        assertThat(compiled.steps().get(2).params().get("name")).isEqualTo("Row 2");
    }

    @Test
    void compile_forEachCsv_resolvesVariablesInParams() {
        var compiled = ScenarioCompiler.compile("""
                scenario: param-resolve-test
                data:
                  members:
                    inline: |
                      name:string,role:string
                      Alice,Developer
                      Bob,Viewer
                steps:
                  - click:
                      role: button
                      name: "Edit ${each.member.name}"
                    label: "Edit member"
                    forEach:
                      as: member
                      in: members
                """, Map.of());
        assertThat(compiled.steps()).hasSize(2);
        assertThat(compiled.steps().get(0).params().get("name")).isEqualTo("Edit Alice");
        assertThat(compiled.steps().get(1).params().get("name")).isEqualTo("Edit Bob");
    }

    @Test
    void compile_forEachCsv_resolvesNestedMapParams() {
        var compiled = ScenarioCompiler.compile("""
                scenario: nested-test
                data:
                  members:
                    inline: |
                      name:string,role:string
                      Alice,Developer
                      Bob,Viewer
                steps:
                  - fill:
                      role: combobox
                      name: "Role"
                      value: "${each.member.role}"
                    label: "Fill role"
                    forEach:
                      as: member
                      in: members
                """, Map.of());
        assertThat(compiled.steps()).hasSize(2);
        assertThat(compiled.steps().get(0).params().get("value")).isEqualTo("Developer");
        assertThat(compiled.steps().get(1).params().get("value")).isEqualTo("Viewer");
    }

    @Test
    void compile_forEachCsv_multiStepWithWhenFilter() {
        var compiled = ScenarioCompiler.compile("""
                scenario: table-populate
                data:
                  team:
                    inline: |
                      name:string,role:string,admin:boolean
                      Alice,Developer,true
                      Bob,Viewer,false
                      Charlie,Admin,true
                steps:
                  - fill:
                      role: textbox
                      name: "Name"
                      value: "${each.person.name}"
                    label: "Fill name"
                    forEach:
                      as: person
                      in: team
                  - fill:
                      role: combobox
                      name: "Role"
                      value: "${each.person.role}"
                    label: "Fill role"
                    forEach:
                      as: person
                      in: team
                  - click:
                      role: checkbox
                      name: "Admin"
                    label: "Toggle admin"
                    forEach:
                      as: person
                      in: team
                    when: "${each.person.admin}"
                """, Map.of());
        assertThat(compiled.steps()).hasSize(8);
        assertThat(compiled.steps().get(0).params().get("value")).isEqualTo("Alice");
        var adminSteps = compiled.steps().stream()
                .filter(s -> "Toggle admin".equals(s.decorator("label"))).toList();
        assertThat(adminSteps).hasSize(2);
    }

    private static String fixture(String name) {
        try (InputStream is = ScenarioCompilerTest.class.getClassLoader()
                .getResourceAsStream("scenarios/" + name)) {
            if (is == null) throw new IllegalArgumentException("Missing fixture: " + name);
            return new String(is.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }
}
