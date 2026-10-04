package io.casehub.pages.scenario;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ScriptDescriptorTest {

    @Test
    void descriptor_exposesMeta() {
        var desc = new ScriptDescriptor("onboard", "Onboard team",
                List.of("domain:hr"), List.of("setup"),
                List.of(), List.of(), ScriptProvenance.BUNDLED, List.of());
        assertThat(desc.name()).isEqualTo("onboard");
        assertThat(desc.description()).isEqualTo("Onboard team");
        assertThat(desc.labels()).containsExactly("domain:hr");
        assertThat(desc.tags()).containsExactly("setup");
        assertThat(desc.provenance()).isEqualTo(ScriptProvenance.BUNDLED);
    }

    @Test
    void descriptor_holdsFirstStepTargets() {
        var targets = List.of(new AriaTarget("button", "Submit"));
        var desc = new ScriptDescriptor("test", null, List.of(), List.of(),
                List.of(), List.of(), ScriptProvenance.UPLOADED, targets);
        assertThat(desc.firstStepTargets()).containsExactly(new AriaTarget("button", "Submit"));
    }

    @Test
    void descriptor_hasState() {
        var desc = new ScriptDescriptor("test", "desc", List.of(), List.of(),
                                        List.of(), List.of(), ScriptProvenance.UPLOADED,
                                        ScriptLifecycleState.DRAFT, List.of());
        assertThat(desc.state()).isEqualTo(ScriptLifecycleState.DRAFT);
    }

    @Test
    void descriptor_defaultsStateToActive_whenNull() {
        var desc = new ScriptDescriptor("test", "desc", List.of(), List.of(),
                                        List.of(), List.of(), ScriptProvenance.BUNDLED,
                                        null, List.of());
        assertThat(desc.state()).isEqualTo(ScriptLifecycleState.ACTIVE);
    }

    @Test
    void descriptor_backwardCompatConstructor_defaultsToActive() {
        var desc = new ScriptDescriptor("test", "desc", List.of(), List.of(),
                                        List.of(), List.of(), ScriptProvenance.BUNDLED, List.of());
        assertThat(desc.state()).isEqualTo(ScriptLifecycleState.ACTIVE);
    }


    @Test
    void paramDescriptor_holdsSchema() {
        var param = new ParamDescriptor("name", "string", true, null, List.of());
        assertThat(param.required()).isTrue();
        assertThat(param.type()).isEqualTo("string");
        assertThat(param.defaultValue()).isNull();
    }

    @Test
    void paramDescriptor_withDefaultAndEnum() {
        var param = new ParamDescriptor("template", "string", false, "blank",
                List.of("blank", "starter", "enterprise"));
        assertThat(param.required()).isFalse();
        assertThat(param.defaultValue()).isEqualTo("blank");
        assertThat(param.enumValues()).containsExactly("blank", "starter", "enterprise");
    }

    @Test
    void scriptMeta_holdsLabelsAndTags() {
        var meta = new ScriptMeta("A description", List.of("domain:hr"), List.of("quick"));
        assertThat(meta.description()).isEqualTo("A description");
        assertThat(meta.labels()).containsExactly("domain:hr");
        assertThat(meta.tags()).containsExactly("quick");
    }
}
