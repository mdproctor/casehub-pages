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
        assertThat(firstStep.commands().get(0).value()).isEqualTo("Acme");
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
        assertThat(compiled.steps().get(0).label()).isEqualTo("Create project");
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
        // enableCI defaults to true, so both steps should be included
        assertThat(compiled.steps()).hasSize(2);
    }

    @Test
    void compile_forEachCsv_stampsPerRow() {
        var compiled = ScenarioCompiler.compile(
                fixture("foreach-csv-inline.yaml"), Map.of());
        // 2 rows × 2 forEach steps, minus 1 excluded by when (Bob is not admin)
        // create-member.Alice, create-member.Bob, grant-admin.Alice
        assertThat(compiled.steps()).hasSize(3);
    }

    @Test
    void compile_forEachCsv_resolvesColumnValues() {
        var compiled = ScenarioCompiler.compile(
                fixture("foreach-csv-inline.yaml"), Map.of());
        var aliceStep = compiled.steps().get(0);
        assertThat(aliceStep.commands().get(0).value()).isEqualTo("Alice");
    }

    @Test
    void compile_forEachCsv_stampedLabelsContainRowValue() {
        var compiled = ScenarioCompiler.compile(
                fixture("foreach-csv-inline.yaml"), Map.of());
        assertThat(compiled.steps()).extracting(HierarchicalStep::label)
                .containsExactly("Create member", "Create member", "Grant admin");
    }

    @Test
    void compile_extractsCallRefs() {
        var compiled = ScenarioCompiler.compile("""
                scenario: caller-test
                steps:
                  - label: "Setup"
                    target: browser
                    commands:
                      - action: call
                        script: create-user
                      - action: click
                        target: {role: button, name: Go}
                  - label: "Teardown"
                    target: browser
                    commands:
                      - action: call
                        script: cleanup
                """, Map.of());
        assertThat(compiled.callRefs()).containsExactly("create-user", "cleanup");
    }

    @Test
    void compile_noParams_noForEach_passesThrough() {
        var compiled = ScenarioCompiler.compile("""
                scenario: simple
                steps:
                  - label: "Click"
                    target: browser
                    commands:
                      - action: click
                        target: {role: button, name: Submit}
                """, Map.of());
        assertThat(compiled.steps()).hasSize(1);
        assertThat(compiled.steps().get(0).label()).isEqualTo("Click");
        assertThat(compiled.callRefs()).isEmpty();
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
                  - label: "Deploy"
                    target: browser
                    forEach: regions
                    commands:
                      - action: navigate
                        value: "#dashboard/${each.region}"
                """, Map.of());
        assertThat(compiled.steps()).hasSize(2);
        assertThat(compiled.steps().get(0).commands().get(0).value())
                .isEqualTo("#dashboard/us-east");
        assertThat(compiled.steps().get(1).commands().get(0).value())
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
                                                  - label: "Select row"
                                                    target: browser
                                                    forEach:
                                                      as: item
                                                      in: items
                                                    commands:
                                                      - action: click
                                                        target: {role: row, name: "Row ${each.index}"}
                                                """, Map.of());
        assertThat(compiled.steps()).hasSize(3);
        assertThat(compiled.steps().get(0).commands().get(0).target().name()).isEqualTo("Row 0");
        assertThat(compiled.steps().get(1).commands().get(0).target().name()).isEqualTo("Row 1");
        assertThat(compiled.steps().get(2).commands().get(0).target().name()).isEqualTo("Row 2");
    }

    @Test
    void compile_forEachCsv_resolvesVariablesInTargetName() {
        var compiled = ScenarioCompiler.compile("""
                                                scenario: target-name-test
                                                data:
                                                  members:
                                                    inline: |
                                                      name:string,role:string
                                                      Alice,Developer
                                                      Bob,Viewer
                                                steps:
                                                  - label: "Edit member"
                                                    target: browser
                                                    forEach:
                                                      as: member
                                                      in: members
                                                    commands:
                                                      - action: click
                                                        target: {role: button, name: "Edit ${each.member.name}"}
                                                """, Map.of());
        assertThat(compiled.steps()).hasSize(2);
        assertThat(compiled.steps().get(0).commands().get(0).target().name())
                .isEqualTo("Edit Alice");
        assertThat(compiled.steps().get(1).commands().get(0).target().name())
                .isEqualTo("Edit Bob");
    }

    @Test
    void compile_forEachCsv_resolvesVariablesInTargetWithin() {
        var compiled = ScenarioCompiler.compile("""
                                                scenario: within-test
                                                data:
                                                  members:
                                                    inline: |
                                                      name:string,role:string
                                                      Alice,Developer
                                                      Bob,Viewer
                                                steps:
                                                  - label: "Fill role"
                                                    target: browser
                                                    forEach:
                                                      as: member
                                                      in: members
                                                    commands:
                                                      - action: fill
                                                        target:
                                                          role: combobox
                                                          name: "Role"
                                                          within: {role: row, name: "Row ${each.index}"}
                                                        value: "${each.member.role}"
                                                """, Map.of());
        assertThat(compiled.steps()).hasSize(2);
        var aliceCmd = compiled.steps().get(0).commands().get(0);
        assertThat(aliceCmd.value()).isEqualTo("Developer");
        assertThat(aliceCmd.target().within().name()).isEqualTo("Row 0");
        var bobCmd = compiled.steps().get(1).commands().get(0);
        assertThat(bobCmd.value()).isEqualTo("Viewer");
        assertThat(bobCmd.target().within().name()).isEqualTo("Row 1");
    }

    @Test
    void compile_forEachCsv_multiStepTablePopulation() {
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
                                                  - label: "Fill name"
                                                    target: browser
                                                    forEach:
                                                      as: person
                                                      in: team
                                                    commands:
                                                      - action: fill
                                                        target:
                                                          role: textbox
                                                          name: "Name"
                                                          within: {role: row, name: "Row ${each.index}"}
                                                        value: "${each.person.name}"
                                                  - label: "Fill role"
                                                    target: browser
                                                    forEach:
                                                      as: person
                                                      in: team
                                                    commands:
                                                      - action: fill
                                                        target:
                                                          role: combobox
                                                          name: "Role"
                                                          within: {role: row, name: "Row ${each.index}"}
                                                        value: "${each.person.role}"
                                                  - label: "Toggle admin"
                                                    target: browser
                                                    forEach:
                                                      as: person
                                                      in: team
                                                    when: "${each.person.admin}"
                                                    commands:
                                                      - action: click
                                                        target:
                                                          role: checkbox
                                                          name: "Admin"
                                                          within: {role: row, name: "Row ${each.index}"}
                                                """, Map.of());
        // 3 rows × fill-name + 3 rows × fill-role + 2 admin rows × toggle
        assertThat(compiled.steps()).hasSize(8);
        // First fill-name targets Row 0
        assertThat(compiled.steps().get(0).commands().get(0).target().within().name())
                .isEqualTo("Row 0");
        assertThat(compiled.steps().get(0).commands().get(0).value()).isEqualTo("Alice");
        // Last fill-name targets Row 2
        assertThat(compiled.steps().get(2).commands().get(0).target().within().name())
                .isEqualTo("Row 2");
        // Admin toggle only fires for Alice (index 0) and Charlie (index 2)
        var adminSteps = compiled.steps().stream()
                                 .filter(s -> s.label().equals("Toggle admin")).toList();
        assertThat(adminSteps).hasSize(2);
        assertThat(adminSteps.get(0).commands().get(0).target().within().name())
                .isEqualTo("Row 0");
        assertThat(adminSteps.get(1).commands().get(0).target().within().name())
                .isEqualTo("Row 2");
    }

    @Test
    void compile_forEachCsv_indexOnlyTarget_noNameRequired() {
        var compiled = ScenarioCompiler.compile("""
                                                scenario: index-only
                                                data:
                                                  rows:
                                                    inline: |
                                                      value:string
                                                      Alpha
                                                      Bravo
                                                steps:
                                                  - label: "Select row"
                                                    target: browser
                                                    forEach:
                                                      as: row
                                                      in: rows
                                                    commands:
                                                      - action: click
                                                        target: {role: row, index: "${each.index}"}
                                                """, Map.of());
        assertThat(compiled.steps()).hasSize(2);
        assertThat(compiled.steps().get(0).commands().get(0).target().index()).isEqualTo("0");
        assertThat(compiled.steps().get(0).commands().get(0).target().name()).isNull();
        assertThat(compiled.steps().get(1).commands().get(0).target().index()).isEqualTo("1");
    }

    @Test
    void compile_forEachCsv_scopedByIndexedRow() {
        var compiled = ScenarioCompiler.compile("""
                                                scenario: scoped-index
                                                data:
                                                  items:
                                                    inline: |
                                                      name:string,qty:integer
                                                      Widget,10
                                                      Gadget,25
                                                steps:
                                                  - label: "Fill quantity"
                                                    target: browser
                                                    forEach:
                                                      as: item
                                                      in: items
                                                    commands:
                                                      - action: fill
                                                        target:
                                                          role: spinbutton
                                                          name: "Qty"
                                                          within: {role: row, index: "${each.index}"}
                                                        value: "${each.item.qty}"
                                                """, Map.of());
        assertThat(compiled.steps()).hasSize(2);
        var first = compiled.steps().get(0).commands().get(0);
        assertThat(first.target().name()).isEqualTo("Qty");
        assertThat(first.target().within().index()).isEqualTo("0");
        assertThat(first.target().within().name()).isNull();
        assertThat(first.value()).isEqualTo("10");
        var second = compiled.steps().get(1).commands().get(0);
        assertThat(second.target().within().index()).isEqualTo("1");
        assertThat(second.value()).isEqualTo("25");
    }

    @Test
    void compile_staticIndexTarget_parsesWithoutForEach() {
        var compiled = ScenarioCompiler.compile("""
                                                scenario: static-index
                                                steps:
                                                  - label: "Click third row"
                                                    target: browser
                                                    commands:
                                                      - action: click
                                                        target: {role: row, index: 2}
                                                """, Map.of());
        assertThat(compiled.steps()).hasSize(1);
        var cmd = compiled.steps().get(0).commands().get(0);
        assertThat(cmd.target().role()).isEqualTo("row");
        assertThat(cmd.target().index()).isEqualTo("2");
        assertThat(cmd.target().name()).isNull();
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
