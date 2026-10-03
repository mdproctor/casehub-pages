package io.casehub.pages.scenario.runtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.casehub.pages.push.EventBroadcaster;
import io.casehub.pages.push.InMemoryEventStore;
import io.casehub.pages.push.PushRequest;
import io.casehub.pages.push.TopicRegistry;
import io.casehub.pages.scenario.OutlineNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.*;

class ScenarioOrchestratorBroadcastTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private static final String SIMPLE_YAML = """
            scenario: test-demo
            steps:
              - click:
                  role: button
                  name: Go
                label: "Step 1"
              - click:
                  role: button
                  name: Next
                label: "Step 2"
            """;

    private static final String CHAPTERS_YAML = """
            scenario: chapter-demo
            chapters:
              - label: "Chapter 1"
                sections:
                  - label: "Section 1A"
                    steps:
                      - click:
                          role: button
                          name: Go
                        label: "Step 1"
                  - label: "Section 1B"
                    steps:
                      - click:
                          role: button
                          name: Next
                        label: "Step 2"
              - label: "Chapter 2"
                sections:
                  - label: "Section 2A"
                    steps:
                      - click:
                          role: button
                          name: Done
                        label: "Step 3"
            """;

    private final List<Object> broadcastedStates = new ArrayList<>();
    private final List<String> sentMessages = new ArrayList<>();
    private ScenarioOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        broadcastedStates.clear();
        sentMessages.clear();

        var broadcaster = new EventBroadcaster(
                new InMemoryEventStore(100), new TopicRegistry(),
                (id, msg) -> sentMessages.add(msg),
                obj -> JSON.writeValueAsString(obj)) {
            @Override
            public <T> long broadcast(String topic, T event) {
                if ("scenario:state".equals(topic)) broadcastedStates.add(event);
                return super.broadcast(topic, event);
            }
        };

        orchestrator = new ScenarioOrchestrator(
                (id, msg) -> sentMessages.add(msg), broadcaster);

        // Register a browser executor so start() doesn't fail validation
        orchestrator.onExecutorRegister("conn-1",
                new PushRequest.ExecutorRegister("e1", "browser",
                        List.of("click")));
    }

    @Test
    void startBroadcastsState() {
        orchestrator.start(SIMPLE_YAML);

        assertThat(broadcastedStates).isNotEmpty();
        var state = (ScenarioState) broadcastedStates.getLast();
        assertThat(state.scenario()).isEqualTo("test-demo");
        assertThat(state.paused()).isFalse();
    }

    @Test
    void pauseBroadcastsState() {
        orchestrator.start(SIMPLE_YAML);
        broadcastedStates.clear();

        orchestrator.pause();

        assertThat(broadcastedStates).hasSize(1);
        var state = (ScenarioState) broadcastedStates.getLast();
        assertThat(state.paused()).isTrue();
    }

    @Test
    void resumeBroadcastsState() {
        orchestrator.start(SIMPLE_YAML);
        orchestrator.pause();
        broadcastedStates.clear();

        orchestrator.resume();

        assertThat(broadcastedStates).hasSize(1);
        var state = (ScenarioState) broadcastedStates.getLast();
        assertThat(state.paused()).isFalse();
    }

    @Test
    void speedBroadcastsState() {
        orchestrator.start(SIMPLE_YAML);
        broadcastedStates.clear();

        orchestrator.speed(2.5);

        assertThat(broadcastedStates).hasSize(1);
        var state = (ScenarioState) broadcastedStates.getLast();
        assertThat(state.speed()).isEqualTo(2.5);
    }

    @Test
    void onStepResultBroadcastsState() {
        orchestrator.start(SIMPLE_YAML);
        broadcastedStates.clear();

        orchestrator.onStepResult(new PushRequest.StepResult(
                "r1", orchestrator.sessionId(), "Step 1", true, null, null));

        assertThat(broadcastedStates).hasSize(1);
        var state = (ScenarioState) broadcastedStates.getLast();
        assertThat(state.progress()).isGreaterThan(0.0);
    }

    @Test
    void stopClearsSessionAndBroadcastsIdle() {
        orchestrator.start(SIMPLE_YAML);
        broadcastedStates.clear();

        orchestrator.stop();

        assertThat(broadcastedStates).isNotEmpty();
        var state = (ScenarioState) broadcastedStates.getLast();
        assertThat(state.scenario()).isNull();
        assertThat(state.progress()).isEqualTo(0.0);
    }

    @Test
    void outlineReturnsHierarchicalTree() {
        orchestrator.start(CHAPTERS_YAML);

        var outline = orchestrator.outline();

        assertThat(outline).hasSize(2);
        assertThat(outline.get(0).label()).isEqualTo("Chapter 1");
        assertThat(outline.get(0).target()).isNull();
        assertThat(outline.get(0).children()).hasSize(2);
        var step = outline.get(0).children().get(0).children().get(0);
        assertThat(step.label()).isEqualTo("Step 1");
        assertThat(step.target()).isEqualTo("browser");
        assertThat(step.children()).isEmpty();
    }

    @Test
    void outlineReturnsEmptyWhenNoScenario() {
        assertThat(orchestrator.outline()).isEmpty();
    }

    @Test
    void runToSetsTargetAndPausesWhenReached() {
        orchestrator.start(SIMPLE_YAML);
        orchestrator.pause();
        broadcastedStates.clear();

        var result = orchestrator.runTo("Step 2");
        assertThat(result).isEqualTo(RunToResult.OK);

        // Simulate step 1 completing
        orchestrator.onStepResult(new PushRequest.StepResult(
                "r1", orchestrator.sessionId(), "Step 1", true, null, null));

        // Simulate step 2 completing — this is the target
        orchestrator.onStepResult(new PushRequest.StepResult(
                "r2", orchestrator.sessionId(), "Step 2", true, null, null));

        // After target reached, should be paused
        var lastState = (ScenarioState) broadcastedStates.getLast();
        assertThat(lastState.paused()).isTrue();
    }
}
