package io.casehub.pages.scenario;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class CompactStepTest {

    @Test
    void decoratorReturnsValue() {
        var step = new CompactStep("fill", Map.of("role", "textbox"),
                null, null, null, Map.of("label", "Fill name", "target", "browser"));
        assertEquals("Fill name", step.decorator("label"));
        assertEquals("browser", step.decorator("target"));
        assertNull(step.decorator("nonexistent"));
    }

    @Test
    void actionAndParamsAreAccessible() {
        var step = new CompactStep("click", Map.of("name", "Submit"),
                null, null, null, Map.of());
        assertEquals("click", step.action());
        assertEquals("Submit", step.params().get("name"));
    }

    @Test
    void paramsAndDecoratorsAreDefensivelyCopied() {
        var params = new java.util.HashMap<String, Object>();
        params.put("role", "textbox");
        var decorators = new java.util.HashMap<String, Object>();
        decorators.put("label", "test");
        var step = new CompactStep("fill", params, null, null, null, decorators);

        assertThrows(UnsupportedOperationException.class,
                () -> step.params().put("x", "y"));
        assertThrows(UnsupportedOperationException.class,
                () -> step.decorators().put("x", "y"));
    }

    @Test
    void nullParamsAndDecoratorsDefaultToEmptyMaps() {
        var step = new CompactStep("click", null, null, null, null, null);
        assertNotNull(step.params());
        assertNotNull(step.decorators());
        assertTrue(step.params().isEmpty());
        assertTrue(step.decorators().isEmpty());
    }

    @Test
    void envelopeAllStepsFromFlatList() {
        var steps = List.of(
                new CompactStep("navigate", Map.of("value", "/home"), null, null, null, Map.of()),
                new CompactStep("click", Map.of("name", "Submit"), null, null, null, Map.of()));
        var envelope = new ScenarioEnvelope("demo", null, -1, null, null,
                null, null, null, null, null, null, null, null, steps);
        assertEquals(2, envelope.allSteps().size());
        assertEquals("navigate", envelope.allSteps().get(0).action());
    }

    @Test
    void envelopeAllStepsFromSections() {
        var steps = List.of(
                new CompactStep("fill", Map.of("role", "textbox"), null, null, null, Map.of()));
        var section = new ScenarioEnvelope.Section("Section 1", "content", steps);
        var envelope = new ScenarioEnvelope("demo", null, -1, null, null,
                null, null, null, null, null, null, null, List.of(section), null);
        assertEquals(1, envelope.allSteps().size());
        assertEquals("fill", envelope.allSteps().get(0).action());
    }

    @Test
    void envelopeAllStepsFromChapters() {
        var steps = List.of(
                new CompactStep("click", Map.of("name", "OK"), null, null, null, Map.of()));
        var section = new ScenarioEnvelope.Section("Sec 1", null, steps);
        var chapter = new ScenarioEnvelope.Chapter("Ch 1", null, List.of(section));
        var envelope = new ScenarioEnvelope("demo", null, -1, null, null,
                null, null, null, null, null, null, List.of(chapter), null, null);
        assertEquals(1, envelope.allSteps().size());
        assertEquals("click", envelope.allSteps().get(0).action());
    }

    @Test
    void envelopeFlatStepsTakePrecedenceOverSections() {
        var flatSteps = List.of(
                new CompactStep("navigate", Map.of(), null, null, null, Map.of()));
        var sectionSteps = List.of(
                new CompactStep("fill", Map.of(), null, null, null, Map.of()));
        var section = new ScenarioEnvelope.Section("Sec", null, sectionSteps);
        var envelope = new ScenarioEnvelope("demo", null, -1, null, null,
                null, null, null, null, null, null, null, List.of(section), flatSteps);
        assertEquals(1, envelope.allSteps().size());
        assertEquals("navigate", envelope.allSteps().get(0).action());
    }
}
