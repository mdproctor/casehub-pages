package io.casehub.pages.scenario;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ScriptDescriptorExtractorTest {

    @Test
    void extract_minimalScript() {
        var desc = ScriptDescriptorExtractor.extract("""
                scenario: simple-test
                steps:
                  - label: "Click button"
                    target: browser
                    commands:
                      - action: click
                        target: {role: button, name: Submit}
                """, ScriptProvenance.BUNDLED);

        assertThat(desc.name()).isEqualTo("simple-test");
        assertThat(desc.provenance()).isEqualTo(ScriptProvenance.BUNDLED);
        assertThat(desc.description()).isNull();
        assertThat(desc.labels()).isEmpty();
        assertThat(desc.tags()).isEmpty();
        assertThat(desc.params()).isEmpty();
        assertThat(desc.calls()).isEmpty();
    }

    @Test
    void extract_withMeta() {
        var desc = ScriptDescriptorExtractor.extract("""
                scenario: onboard-team
                meta:
                  description: "Onboard team members"
                  labels:
                    - domain:hr
                    - capability:onboarding
                  tags:
                    - getting-started
                steps:
                  - label: "Step 1"
                    target: browser
                    commands:
                      - action: navigate
                        value: "#home"
                """, ScriptProvenance.UPLOADED);

        assertThat(desc.description()).isEqualTo("Onboard team members");
        assertThat(desc.labels()).containsExactly("domain:hr", "capability:onboarding");
        assertThat(desc.tags()).containsExactly("getting-started");
    }

    @Test
    void extract_withParams() {
        var desc = ScriptDescriptorExtractor.extract("""
                scenario: create-project
                params:
                  - name: projectName
                    type: string
                    required: true
                  - name: template
                    type: string
                    default: "blank"
                    enum: [blank, starter, enterprise]
                steps:
                  - label: "Fill name"
                    target: browser
                    commands:
                      - action: fill
                        target: {role: textbox, name: "Project Name"}
                        value: "${params.projectName}"
                """, ScriptProvenance.BUNDLED);

        assertThat(desc.params()).hasSize(2);
        assertThat(desc.params().get(0).name()).isEqualTo("projectName");
        assertThat(desc.params().get(0).required()).isTrue();
        assertThat(desc.params().get(1).defaultValue()).isEqualTo("blank");
        assertThat(desc.params().get(1).enumValues()).containsExactly("blank", "starter", "enterprise");
    }

    @Test
    void extract_detectsCalls() {
        var desc = ScriptDescriptorExtractor.extract("""
                scenario: caller
                steps:
                  - label: "Call create-user"
                    target: browser
                    commands:
                      - action: call
                        script: create-user
                        params:
                          name: "Alice"
                  - label: "Call assign-role"
                    target: browser
                    commands:
                      - action: call
                        script: assign-role
                """, ScriptProvenance.UPLOADED);

        assertThat(desc.calls()).containsExactly("create-user", "assign-role");
    }

    @Test
    void extract_firstStepTargets() {
        var desc = ScriptDescriptorExtractor.extract("""
                scenario: test
                steps:
                  - label: "First step"
                    target: browser
                    commands:
                      - action: fill
                        target: {role: textbox, name: "Name"}
                        value: "Alice"
                      - action: click
                        target: {role: button, name: "Submit"}
                  - label: "Second step"
                    target: browser
                    commands:
                      - action: click
                        target: {role: button, name: "Confirm"}
                """, ScriptProvenance.BUNDLED);

        assertThat(desc.firstStepTargets()).hasSize(2);
        assertThat(desc.firstStepTargets().get(0)).isEqualTo(Map.of("role", "textbox", "name", "Name"));
        assertThat(desc.firstStepTargets().get(1)).isEqualTo(Map.of("role", "button", "name", "Submit"));
    }

    @Test
    void extract_noScenarioName_throws() {
        assertThatThrownBy(() -> ScriptDescriptorExtractor.extract("""
                steps:
                  - label: "Step"
                    target: browser
                    commands:
                      - action: click
                        target: {role: button, name: Go}
                """, ScriptProvenance.BUNDLED))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("scenario");
    }
}
