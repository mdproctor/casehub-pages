package io.casehub.pages.scenario.runtime;

import com.sun.net.httpserver.HttpServer;
import io.casehub.pages.push.EventBroadcaster;
import io.casehub.pages.push.InMemoryEventStore;
import io.casehub.pages.push.PushRequest;
import io.casehub.pages.push.TopicRegistry;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ScenarioOrchestratorTest {

    record SentMessage(String connectionId, String message) {}

    private List<SentMessage> createCapture() {
        return new ArrayList<>();
    }

    private static EventBroadcaster noopBroadcaster() {
        return new EventBroadcaster(
            new InMemoryEventStore(10), new TopicRegistry(),
            (id, msg) -> {}, obj -> "{}");
    }

    @Test
    void startDispatchesSequenceToRegisteredExecutor() {
        var sent = createCapture();
        var orchestrator = new ScenarioOrchestrator(
            (connId, msg) -> sent.add(new SentMessage(connId, msg)), noopBroadcaster());

        orchestrator.onExecutorRegister("conn-1",
            new PushRequest.ExecutorRegister("1", "browser",
                List.of("click", "fill", "navigate")));

        var yaml = """
            scenario: test
            steps:
              - label: "Click"
                target: browser
                commands:
                  - action: click
            """;
        orchestrator.start(yaml);

        assertThat(sent).isNotEmpty();
        assertThat(sent.getFirst().connectionId()).isEqualTo("conn-1");
        assertThat(sent.getFirst().message()).contains("dispatch-sequence");
    }

    @Test
    void startRequiresRegisteredExecutor() {
        var orchestrator = new ScenarioOrchestrator((c, m) -> {}, noopBroadcaster());

        var yaml = """
            scenario: test
            steps:
              - label: "Click"
                target: browser
                commands:
                  - action: click
            """;
        assertThatThrownBy(() -> orchestrator.start(yaml))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("browser");
    }

    @Test
    void stateReflectsScenarioProgress() {
        var orchestrator = new ScenarioOrchestrator((c, m) -> {}, noopBroadcaster());

        assertThat(orchestrator.state().scenario()).isNull();

        orchestrator.onExecutorRegister("conn-1",
            new PushRequest.ExecutorRegister("1", "helpdesk",
                List.of("create-ticket")));

        var yaml = """
            scenario: progress-test
            steps:
              - label: "Create"
                target: helpdesk
                commands:
                  - action: create-ticket
              - label: "Verify"
                target: helpdesk
                commands:
                  - action: verify-ticket
            """;
        orchestrator.start(yaml);

        var state = orchestrator.state();
        assertThat(state.scenario()).isEqualTo("progress-test");
        assertThat(state.progress()).isEqualTo(0.0);
        assertThat(state.paused()).isFalse();
    }

    @Test
    void stepResultAdvancesProgress() {
        var orchestrator = new ScenarioOrchestrator((c, m) -> {}, noopBroadcaster());

        orchestrator.onExecutorRegister("conn-1",
            new PushRequest.ExecutorRegister("1", "helpdesk",
                List.of("create-ticket", "verify-ticket")));

        var yaml = """
            scenario: progress-test
            steps:
              - label: "Create"
                target: helpdesk
                commands:
                  - action: create-ticket
              - label: "Verify"
                target: helpdesk
                commands:
                  - action: verify-ticket
            """;
        orchestrator.start(yaml);
        String sessionId = orchestrator.state().scenario() != null
            ? orchestrator.sessionId() : null;
        assertThat(sessionId).isNotNull();

        orchestrator.onStepResult(new PushRequest.StepResult(
            "r1", sessionId, "Create", true, null, Map.of()));

        assertThat(orchestrator.state().progress()).isEqualTo(0.5);

        orchestrator.onStepResult(new PushRequest.StepResult(
            "r2", sessionId, "Verify", true, null, Map.of()));

        assertThat(orchestrator.state().progress()).isEqualTo(1.0);
    }

    @Test
    void pauseSendsControlToAllExecutors() {
        var sent = createCapture();
        var orchestrator = new ScenarioOrchestrator(
            (connId, msg) -> sent.add(new SentMessage(connId, msg)), noopBroadcaster());

        orchestrator.onExecutorRegister("conn-1",
            new PushRequest.ExecutorRegister("1", "browser", List.of("click")));
        orchestrator.onExecutorRegister("conn-2",
            new PushRequest.ExecutorRegister("2", "helpdesk",
                List.of("create-ticket")));

        var yaml = """
            scenario: control-test
            steps:
              - label: "Click"
                target: browser
                commands:
                  - action: click
              - label: "Create"
                target: helpdesk
                commands:
                  - action: create-ticket
            """;
        orchestrator.start(yaml);
        sent.clear();

        orchestrator.pause();

        assertThat(sent).hasSize(2);
        assertThat(sent).allSatisfy(s ->
            assertThat(s.message()).contains("executor-control")
                .contains("pause"));
        assertThat(orchestrator.state().paused()).isTrue();
    }

    @Test
    void resumeAfterPause() {
        var sent = createCapture();
        var orchestrator = new ScenarioOrchestrator(
            (connId, msg) -> sent.add(new SentMessage(connId, msg)), noopBroadcaster());

        orchestrator.onExecutorRegister("conn-1",
            new PushRequest.ExecutorRegister("1", "browser", List.of("click")));

        orchestrator.start("""
            scenario: resume-test
            steps:
              - label: "Click"
                target: browser
                commands:
                  - action: click
            """);

        orchestrator.pause();
        assertThat(orchestrator.state().paused()).isTrue();

        sent.clear();
        orchestrator.resume();

        assertThat(orchestrator.state().paused()).isFalse();
        assertThat(sent).anyMatch(s -> s.message().contains("resume"));
    }

    @Test
    void speedChangesSendsControl() {
        var sent = createCapture();
        var orchestrator = new ScenarioOrchestrator(
            (connId, msg) -> sent.add(new SentMessage(connId, msg)), noopBroadcaster());

        orchestrator.onExecutorRegister("conn-1",
            new PushRequest.ExecutorRegister("1", "browser", List.of("click")));

        orchestrator.start("""
            scenario: speed-test
            steps:
              - label: "Click"
                target: browser
                commands:
                  - action: click
            """);
        sent.clear();

        orchestrator.speed(2.0);

        assertThat(orchestrator.state().speed()).isEqualTo(2.0);
        assertThat(sent).anyMatch(s -> s.message().contains("speed")
            && s.message().contains("2.0"));
    }

    @Test
    void multipleExecutorsReceiveCorrectSequences() {
        var sent = createCapture();
        var orchestrator = new ScenarioOrchestrator(
            (connId, msg) -> sent.add(new SentMessage(connId, msg)), noopBroadcaster());

        orchestrator.onExecutorRegister("conn-browser",
            new PushRequest.ExecutorRegister("1", "browser",
                List.of("click", "fill")));
        orchestrator.onExecutorRegister("conn-helpdesk",
            new PushRequest.ExecutorRegister("2", "helpdesk",
                List.of("create-ticket")));

        var yaml = """
            scenario: multi-test
            steps:
              - label: "Click"
                target: browser
                commands:
                  - action: click
              - label: "Create"
                target: helpdesk
                commands:
                  - action: create-ticket
            """;
        orchestrator.start(yaml);

        var browserMessages = sent.stream()
            .filter(s -> "conn-browser".equals(s.connectionId()))
            .filter(s -> s.message().contains("dispatch-sequence"))
            .toList();
        var helpdeskMessages = sent.stream()
            .filter(s -> "conn-helpdesk".equals(s.connectionId()))
            .filter(s -> s.message().contains("dispatch-sequence"))
            .toList();

        assertThat(browserMessages).hasSize(1);
        assertThat(helpdeskMessages).hasSize(1);
        assertThat(browserMessages.getFirst().message()).contains("click");
        assertThat(helpdeskMessages.getFirst().message()).contains("create-ticket");
    }

    @Test
    void stepCommandDispatchesStepControl() {
        var sent = createCapture();
        var orchestrator = new ScenarioOrchestrator(
            (connId, msg) -> sent.add(new SentMessage(connId, msg)), noopBroadcaster());

        orchestrator.onExecutorRegister("conn-1",
            new PushRequest.ExecutorRegister("1", "browser", List.of("click")));

        orchestrator.start("""
            scenario: step-test
            steps:
              - label: "A"
                target: browser
                commands:
                  - action: click
              - label: "B"
                target: browser
                commands:
                  - action: click
            """);
        orchestrator.pause();
        sent.clear();

        orchestrator.step();

        assertThat(sent).anyMatch(s -> s.message().contains("step"));
    }

    @Test
    void sectionBasedScenarioDispatches() {
        var sent = createCapture();
        var orchestrator = new ScenarioOrchestrator(
            (connId, msg) -> sent.add(new SentMessage(connId, msg)), noopBroadcaster());

        orchestrator.onExecutorRegister("conn-1",
            new PushRequest.ExecutorRegister("1", "browser", List.of("click")));
        orchestrator.onExecutorRegister("conn-2",
            new PushRequest.ExecutorRegister("2", "helpdesk",
                List.of("create-ticket")));

        var yaml = """
            scenario: section-test
            sections:
              - label: "Submit"
                steps:
                  - label: "Click button"
                    target: browser
                    commands:
                      - action: click
              - label: "Process"
                steps:
                  - label: "Create ticket"
                    target: helpdesk
                    commands:
                      - action: create-ticket
            """;
        orchestrator.start(yaml);

        assertThat(orchestrator.state().scenario()).isEqualTo("section-test");
        var dispatches = sent.stream()
            .filter(s -> s.message().contains("dispatch-sequence"))
            .toList();
        assertThat(dispatches).hasSizeGreaterThanOrEqualTo(1);
    }

    @Test
    void reRegisteringExecutorRedispatchesPendingStep() {
        var sent = createCapture();
        var orchestrator = new ScenarioOrchestrator(
            (connId, msg) -> sent.add(new SentMessage(connId, msg)), noopBroadcaster());

        orchestrator.onExecutorRegister("conn-1",
            new PushRequest.ExecutorRegister("1", "browser",
                List.of("click", "fill")));

        var yaml = """
            scenario: re-register-test
            steps:
              - label: "Click"
                target: browser
                commands:
                  - action: click
            """;
        orchestrator.start(yaml);
        assertThat(orchestrator.state().scenario()).isEqualTo("re-register-test");

        var dispatchesBefore = sent.stream()
            .filter(s -> s.message().contains("dispatch-sequence"))
            .toList();
        assertThat(dispatchesBefore).isNotEmpty();
        assertThat(dispatchesBefore.getFirst().connectionId()).isEqualTo("conn-1");

        sent.clear();
        orchestrator.onExecutorRegister("conn-2",
            new PushRequest.ExecutorRegister("2", "browser",
                List.of("click", "fill")));

        assertThat(orchestrator.state().scenario()).isEqualTo("re-register-test");
        var redispatched = sent.stream()
            .filter(s -> s.message().contains("dispatch-sequence"))
            .toList();
        assertThat(redispatched).isNotEmpty();
        assertThat(redispatched.getFirst().connectionId()).isEqualTo("conn-2");
    }

    @Test
    void reRegisteringExecutorWithoutActiveScenarioIsHarmless() {
        var sent = createCapture();
        var orchestrator = new ScenarioOrchestrator(
            (connId, msg) -> sent.add(new SentMessage(connId, msg)), noopBroadcaster());

        orchestrator.onExecutorRegister("conn-1",
            new PushRequest.ExecutorRegister("1", "browser",
                List.of("click")));

        orchestrator.onExecutorRegister("conn-2",
            new PushRequest.ExecutorRegister("2", "browser",
                List.of("click")));

        assertThat(orchestrator.state().scenario()).isNull();
        assertThat(orchestrator.sessionId()).isNull();
    }

    @Test
    void runToPausesAtTargetLabelWhenStepHasSeparateName() {
        var sent = createCapture();
        var orchestrator = new ScenarioOrchestrator(
            (connId, msg) -> sent.add(new SentMessage(connId, msg)), noopBroadcaster());

        orchestrator.onExecutorRegister("conn-1",
            new PushRequest.ExecutorRegister("1", "browser",
                List.of("click", "fill")));

        var yaml = """
            scenario: run-to-test
            speed: 1.0
            steps:
              - click: {}
                step: step-a
                label: "First step"
              - fill: {}
                step: step-b
                label: "Second step"
              - click: {}
                step: step-c
                label: "Third step"
            """;
        orchestrator.start(yaml, true);
        String sessionId = orchestrator.sessionId();

        var result = orchestrator.runTo("Second step");
        assertThat(result).isEqualTo(RunToResult.OK);
        assertThat(orchestrator.state().paused()).isFalse();
        assertThat(orchestrator.state().speed()).isEqualTo(10.0);

        orchestrator.onStepResult(new PushRequest.StepResult(
            "r1", sessionId, "step-a", true, null, Map.of()));

        assertThat(orchestrator.state().paused()).isFalse();

        orchestrator.onStepResult(new PushRequest.StepResult(
            "r2", sessionId, "step-b", true, null, Map.of()));

        assertThat(orchestrator.state().paused()).isTrue();
        assertThat(orchestrator.state().speed()).isEqualTo(1.0);
    }

    @Test
    void runToDispatchesTriggeredStepsAfterTarget() {
        var sent = createCapture();
        var orchestrator = new ScenarioOrchestrator(
            (connId, msg) -> sent.add(new SentMessage(connId, msg)), noopBroadcaster());

        orchestrator.onExecutorRegister("conn-1",
            new PushRequest.ExecutorRegister("1", "browser",
                List.of("click", "fill", "spotlight")));

        var yaml = """
            scenario: run-to-trigger-test
            sections:
              - label: "Section A"
                steps:
                  - click: {}
                    step: step-1
                    label: "Step one"
                  - spotlight: {}
                    step: step-2
                    label: "Step two"
                    trigger: { after: step-1 }
                  - fill: {}
                    step: step-3
                    label: "Step three"
                    trigger: { after: step-2 }
            """;
        orchestrator.start(yaml, true);
        String sessionId = orchestrator.sessionId();

        orchestrator.runTo("Step two");
        sent.clear();

        orchestrator.onStepResult(new PushRequest.StepResult(
            "r1", sessionId, "step-1", true, null, Map.of()));

        orchestrator.onStepResult(new PushRequest.StepResult(
            "r2", sessionId, "step-2", true, null, Map.of()));

        assertThat(orchestrator.state().paused()).isTrue();

        var dispatches = sent.stream()
            .filter(s -> s.message().contains("dispatch-sequence"))
            .filter(s -> s.message().contains("fill"))
            .toList();
        assertThat(dispatches).as("step-3 should be dispatched after runTo target completes")
            .hasSize(1);
    }

    @Test
    void callbackFiresOnCompletion() throws Exception {
        var sent = createCapture();
        var orchestrator = new ScenarioOrchestrator(
                (connId, msg) -> sent.add(new SentMessage(connId, msg)), noopBroadcaster());

        orchestrator.onExecutorRegister("conn-1",
                                        new PushRequest.ExecutorRegister("1", "helpdesk",
                                                                         List.of("create-ticket", "verify-ticket")));

        var yaml = """
                   scenario: callback-test
                   steps:
                     - label: "Create"
                       target: helpdesk
                       commands:
                         - action: create-ticket
                     - label: "Verify"
                       target: helpdesk
                       commands:
                         - action: verify-ticket
                   """;

        var server           = HttpServer.create(new InetSocketAddress(0), 0);
        var receivedPayloads = new ArrayList<String>();
        var receivedHeaders  = new ArrayList<String>();
        server.createContext("/workers/complete/", exchange -> {
            receivedPayloads.add(new String(exchange.getRequestBody().readAllBytes()));
            receivedHeaders.add(exchange.getRequestHeaders().getFirst("X-Casehub-Callback-Token"));
            exchange.sendResponseHeaders(200, 0);
            exchange.close();
        });
        server.start();
        int port = server.getAddress().getPort();

        try {
            orchestrator.start(yaml, false,
                               "http://localhost:" + port + "/workers/complete", "dispatch-123", "tok-abc");

            String sessionId = orchestrator.sessionId();
            orchestrator.onStepResult(new PushRequest.StepResult(
                    "r1", sessionId, "Create", true, null, Map.of("ticketId", "T-001")));
            orchestrator.onStepResult(new PushRequest.StepResult(
                    "r2", sessionId, "Verify", true, null, Map.of("status", "TRIAGED")));

            Thread.sleep(500);

            assertThat(receivedPayloads).hasSize(1);
            assertThat(receivedPayloads.getFirst()).contains("\"faulted\":false");
            assertThat(receivedPayloads.getFirst()).contains("Create");
            assertThat(receivedPayloads.getFirst()).contains("Verify");
            assertThat(receivedHeaders.getFirst()).isEqualTo("tok-abc");
        } finally {
            server.stop(0);
        }
    }

    @Test
    void noCallbackWhenUrlIsNull() {
        var orchestrator = new ScenarioOrchestrator((c, m) -> {}, noopBroadcaster());

        orchestrator.onExecutorRegister("conn-1",
                                        new PushRequest.ExecutorRegister("1", "helpdesk",
                                                                         List.of("create-ticket")));

        var yaml = """
                   scenario: no-callback-test
                   steps:
                     - label: "Create"
                       target: helpdesk
                       commands:
                         - action: create-ticket
                   """;
        orchestrator.start(yaml);

        String sessionId = orchestrator.sessionId();
        orchestrator.onStepResult(new PushRequest.StepResult(
                "r1", sessionId, "Create", true, null, Map.of()));

        assertThat(orchestrator.state().progress()).isEqualTo(1.0);
    }

    @Test
    void callbackFiresWithFaultedOnErrorStop() throws Exception {
        var sent = createCapture();
        var orchestrator = new ScenarioOrchestrator(
                (connId, msg) -> sent.add(new SentMessage(connId, msg)), noopBroadcaster());

        orchestrator.onExecutorRegister("conn-1",
                                        new PushRequest.ExecutorRegister("1", "helpdesk",
                                                                         List.of("create-ticket", "verify-ticket")));

        var yaml = """
                   scenario: fault-test
                   on-error: stop
                   steps:
                     - label: "Create"
                       target: helpdesk
                       commands:
                         - action: create-ticket
                     - label: "Verify"
                       target: helpdesk
                       commands:
                         - action: verify-ticket
                   """;

        var server           = HttpServer.create(new InetSocketAddress(0), 0);
        var receivedPayloads = new ArrayList<String>();
        server.createContext("/workers/complete/", exchange -> {
            receivedPayloads.add(new String(exchange.getRequestBody().readAllBytes()));
            exchange.sendResponseHeaders(200, 0);
            exchange.close();
        });
        server.start();
        int port = server.getAddress().getPort();

        try {
            orchestrator.start(yaml, false,
                               "http://localhost:" + port + "/workers/complete", "dispatch-456", "tok-xyz");

            String sessionId = orchestrator.sessionId();
            orchestrator.onStepResult(new PushRequest.StepResult(
                    "r1", sessionId, "Create", false, "ticket creation failed", Map.of()));

            Thread.sleep(500);

            assertThat(receivedPayloads).hasSize(1);
            assertThat(receivedPayloads.getFirst()).contains("\"faulted\":true");
            assertThat(receivedPayloads.getFirst()).contains("ticket creation failed");

            assertThat(sent.stream().anyMatch(s -> s.message().contains("\"command\":\"stop\""))).isTrue();
        } finally {
            server.stop(0);
        }
    }

    @Test
    void naturalCompletionWithFailedStepSetsFaulted() throws Exception {
        var orchestrator = new ScenarioOrchestrator((c, m) -> {}, noopBroadcaster());

        orchestrator.onExecutorRegister("conn-1",
                                        new PushRequest.ExecutorRegister("1", "helpdesk",
                                                                         List.of("create-ticket", "verify-ticket")));

        var yaml = """
                   scenario: mixed-result-test
                   steps:
                     - label: "Create"
                       target: helpdesk
                       commands:
                         - action: create-ticket
                     - label: "Verify"
                       target: helpdesk
                       commands:
                         - action: verify-ticket
                   """;

        var server           = HttpServer.create(new InetSocketAddress(0), 0);
        var receivedPayloads = new ArrayList<String>();
        server.createContext("/workers/complete/", exchange -> {
            receivedPayloads.add(new String(exchange.getRequestBody().readAllBytes()));
            exchange.sendResponseHeaders(200, 0);
            exchange.close();
        });
        server.start();
        int port = server.getAddress().getPort();

        try {
            orchestrator.start(yaml, false,
                               "http://localhost:" + port + "/workers/complete", "d-789", "tok");

            String sessionId = orchestrator.sessionId();
            orchestrator.onStepResult(new PushRequest.StepResult(
                    "r1", sessionId, "Create", false, "failed", Map.of()));
            orchestrator.onStepResult(new PushRequest.StepResult(
                    "r2", sessionId, "Verify", true, null, Map.of()));

            Thread.sleep(500);

            assertThat(receivedPayloads).hasSize(1);
            assertThat(receivedPayloads.getFirst()).contains("\"faulted\":true");
        } finally {
            server.stop(0);
        }
    }


}
