package io.casehub.pages.scenario.runtime;

import io.casehub.pages.scenario.ScriptDescriptor;
import io.casehub.pages.scenario.ScriptLifecycleState;
import io.casehub.pages.scenario.ScriptMeta;
import io.casehub.yaml.core.orchestration.IllegalTransitionException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ScriptLifecycleTest {

    static final String SAMPLE_YAML = """
            scenario: test-script
            meta:
              description: A test script
              labels:
                - domain:test
              tags:
                - demo
            steps:
              - action: click
                role: button
                name: Submit
            """;

    @TempDir Path tempDir;
    ScriptRegistry registry;

    @BeforeEach
    void setUp() {
        var bundled = new BundledScriptSource(List.of());
        var uploaded = new UploadedScriptSource(tempDir);
        registry = new ScriptRegistry(bundled, uploaded);
    }

    @Test
    void uploaded_startsAsDraft() {
        ScriptDescriptor desc = registry.upload(SAMPLE_YAML);
        assertThat(desc.state()).isEqualTo(ScriptLifecycleState.DRAFT);
    }

    @Test
    void activate_movesToActive() {
        registry.upload(SAMPLE_YAML);
        ScriptDescriptor activated = registry.activate("test-script");
        assertThat(activated.state()).isEqualTo(ScriptLifecycleState.ACTIVE);
    }

    @Test
    void archive_movesToArchived() {
        registry.upload(SAMPLE_YAML);
        registry.activate("test-script");
        ScriptDescriptor archived = registry.archive("test-script");
        assertThat(archived.state()).isEqualTo(ScriptLifecycleState.ARCHIVED);
    }

    @Test
    void revise_movesActiveBackToDraft() {
        registry.upload(SAMPLE_YAML);
        registry.activate("test-script");
        ScriptDescriptor revised = registry.revise("test-script");
        assertThat(revised.state()).isEqualTo(ScriptLifecycleState.DRAFT);
    }

    @Test
    void activate_fromArchived_throws() {
        registry.upload(SAMPLE_YAML);
        registry.activate("test-script");
        registry.archive("test-script");
        assertThatThrownBy(() -> registry.activate("test-script"))
                .isInstanceOf(IllegalTransitionException.class);
    }

    @Test
    void archive_fromDraft_throws() {
        registry.upload(SAMPLE_YAML);
        assertThatThrownBy(() -> registry.archive("test-script"))
                .isInstanceOf(IllegalTransitionException.class);
    }

    @Test
    void activate_nonUploaded_throws() {
        assertThatThrownBy(() -> registry.activate("nonexistent"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void listActive_excludesDraftAndArchived() {
        registry.upload(SAMPLE_YAML);
        assertThat(registry.listActive(List.of(), List.of())).isEmpty();

        registry.activate("test-script");
        assertThat(registry.listActive(List.of(), List.of())).hasSize(1);

        registry.archive("test-script");
        assertThat(registry.listActive(List.of(), List.of())).isEmpty();
    }

    @Test
    void updateMeta_onlyAllowedOnDraft() {
        registry.upload(SAMPLE_YAML);
        registry.activate("test-script");
        assertThatThrownBy(() -> registry.updateMeta("test-script",
                new ScriptMeta("new desc", List.of(), List.of())))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void get_reflectsCurrentState() {
        registry.upload(SAMPLE_YAML);
        assertThat(registry.get("test-script").orElseThrow().state())
                .isEqualTo(ScriptLifecycleState.DRAFT);

        registry.activate("test-script");
        assertThat(registry.get("test-script").orElseThrow().state())
                .isEqualTo(ScriptLifecycleState.ACTIVE);
    }
}
