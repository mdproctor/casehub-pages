package io.casehub.pages.scenario.runtime;

import io.casehub.pages.scenario.ScriptDescriptor;
import io.casehub.pages.scenario.ScriptMeta;
import io.casehub.pages.scenario.ScriptProvenance;
import jakarta.ws.rs.ForbiddenException;
import jakarta.ws.rs.NotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ScenarioLibraryResourceTest {

    static final String BUNDLED_YAML = """
            scenario: helpdesk-intake
            meta:
              labels: [domain:helpdesk]
            steps:
              - label: "Fill form"
                target: browser
                commands:
                  - action: fill
                    target: {role: textbox, name: Subject}
                    value: Test
            """;

    static final String UPLOAD_YAML = """
            scenario: my-automation
            meta:
              description: "Custom automation"
              labels: [domain:ops]
              tags: [custom]
            steps:
              - label: "Navigate"
                target: browser
                commands:
                  - action: navigate
                    value: "#home"
            """;

    @TempDir Path tempDir;
    ScenarioLibraryResource resource;
    ScriptRegistry registry;

    @BeforeEach
    void setUp() {
        var bundled = new ScriptRegistryTest.TestBundledSource(BUNDLED_YAML);
        var uploaded = new UploadedScriptSource(tempDir);
        registry = new ScriptRegistry(bundled, uploaded);
        resource = new ScenarioLibraryResource();
        try {
            var field = ScenarioLibraryResource.class.getDeclaredField("registry");
            field.setAccessible(true);
            field.set(resource, registry);
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    @Test
    void list_returnsAllScripts() {
        var scripts = resource.list(List.of(), List.of());
        assertThat(scripts).extracting("name").contains("helpdesk-intake");
    }

    @Test
    void list_filtersLabels() {
        registry.upload(UPLOAD_YAML);
        var filtered = resource.list(List.of("domain:ops"), List.of());
        assertThat(filtered).extracting("name").containsExactly("my-automation");
    }

    @Test
    void get_returnsDescriptor() {
        var desc = resource.get("helpdesk-intake");
        assertThat(desc.name()).isEqualTo("helpdesk-intake");
    }

    @Test
    void get_notFound_throws() {
        assertThatThrownBy(() -> resource.get("nonexistent"))
                .isInstanceOf(NotFoundException.class);
    }

    @Test
    void getYaml_returnsContent() {
        var yaml = resource.getYaml("helpdesk-intake");
        assertThat(yaml).contains("helpdesk-intake");
    }

    @Test
    void upload_returns201WithDescriptor() {
        var response = resource.upload(UPLOAD_YAML);
        assertThat(response.getStatus()).isEqualTo(201);
        var desc = (ScriptDescriptor) response.getEntity();
        assertThat(desc.name()).isEqualTo("my-automation");
        assertThat(desc.provenance()).isEqualTo(ScriptProvenance.UPLOADED);
    }

    @Test
    void updateMeta_updatesDescription() {
        registry.upload(UPLOAD_YAML);
        var updated = resource.updateMeta("my-automation",
                new ScriptMeta("New desc", List.of("domain:new"), List.of("updated")));
        assertThat(updated.description()).isEqualTo("New desc");
    }

    @Test
    void delete_uploaded_returns204() {
        registry.upload(UPLOAD_YAML);
        var response = resource.delete("my-automation");
        assertThat(response.getStatus()).isEqualTo(204);
    }

    @Test
    void delete_bundled_throws403() {
        assertThatThrownBy(() -> resource.delete("helpdesk-intake"))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void delete_notFound_throws404() {
        assertThatThrownBy(() -> resource.delete("nonexistent"))
                .isInstanceOf(NotFoundException.class);
    }

// --- GraphQL API ---

    @Test
    void graphql_scriptLibrary_delegates_to_registry() {
        var registry = new ScriptRegistry(
                new BundledScriptSource(java.util.List.of()),
                new UploadedScriptSource(java.nio.file.Path.of(System.getProperty("java.io.tmpdir"), "test-gql-" + System.nanoTime())));
        var graphql = new ScenarioLibraryGraphQL(registry);


        var result = graphql.scriptLibrary(null, null);
        assertThat(result).isNotNull();
        assertThat(result).isEmpty();
    }

    @Test
    void graphql_uploadScript_returns_descriptor() {
        var registry = new ScriptRegistry(
                new BundledScriptSource(java.util.List.of()),
                new UploadedScriptSource(java.nio.file.Path.of(System.getProperty("java.io.tmpdir"), "test-scripts-" + System.nanoTime())));
        var graphql = new ScenarioLibraryGraphQL(registry);

        String yaml = "scenario: graphql-test\nsteps:\n  - label: test\n    target: browser\n    commands:\n      - action: click\n        target: {role: button, name: Go}\n";
        var    desc = graphql.uploadScript(yaml);
        assertThat(desc.name()).isEqualTo("graphql-test");
    }

    @Test
    void graphql_deleteScript_returns_false_for_unknown() {
        var registry = new ScriptRegistry(
                new BundledScriptSource(java.util.List.of()),
                new UploadedScriptSource(java.nio.file.Path.of(System.getProperty("java.io.tmpdir"), "test-gql-" + System.nanoTime())));
        var graphql = new ScenarioLibraryGraphQL(registry);

        assertThat(graphql.deleteScript("nonexistent")).isFalse();
    }
}
