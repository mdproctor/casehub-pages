package io.casehub.pages.playbook.runtime;

import io.casehub.pages.push.EventBroadcaster;
import io.casehub.pages.push.InMemoryEventStore;
import io.casehub.pages.push.PushRequest;
import io.casehub.pages.push.TopicRegistry;
import io.casehub.pages.playbook.CompactStep;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PlaybookExecutorTest {

    @Test
    void executesGraphQLStepsSequentially() {
        var dispatcher = stubGraphQLDispatcher(Map.of(
                "injectChat", Map.of("caseId", "C-001"),
                "caseContext", Map.of("category", "HARDWARE")));

        var executor = new PlaybookExecutor(List.of(
                new GraphQLDeliveryHandler(dispatcher),
                new SimulatedDeliveryHandler()));

        var steps = List.of(
                gqlStep("inject", "connectors", "injectChat", Map.of("sender", "Alice")),
                gqlStep("check", "engine", "caseContext", Map.of("caseId", "${inject.caseId}")));

        List<ExecutionResult> results = executor.execute(steps, PlaybookConfig.localhost());

        assertThat(results).hasSize(2);
        assertThat(results.get(0).success()).isTrue();
        assertThat(results.get(0).result()).containsEntry("caseId", "C-001");
        assertThat(results.get(1).result()).containsEntry("category", "HARDWARE");
    }

    @Test
    void failFastOnError() {
        var dispatcher = new GraphQLDispatcher(null, null) {
            @Override
            public Map<String, Object> dispatch(String domain, String operation,
                                                Map<String, Object> params,
                                                String endpoint, VariableContext ctx) {
                throw new RuntimeException("Connection refused");
            }
        };

        var executor = new PlaybookExecutor(List.of(
                new GraphQLDeliveryHandler(dispatcher)));
        var steps = List.of(
                gqlStep("s1", "d", "op1", Map.of()),
                gqlStep("s2", "d", "op2", Map.of()));

        assertThatThrownBy(() -> executor.execute(steps, PlaybookConfig.localhost()))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Connection refused");
    }

    @Test
    void ariaStepsReturnEmptyResult() {
        var executor = new PlaybookExecutor(List.of(
                new AriaDeliveryHandler(null)));
        var steps = List.of(ariaStep("click", Map.of(), "click-btn"));

        List<ExecutionResult> results = executor.execute(steps, PlaybookConfig.localhost());
        assertThat(results).hasSize(1);
        assertThat(results.getFirst().success()).isTrue();
    }

    @Test
    void ariaStepDelegatesToDispatcher() {
        var dispatched     = new ArrayList<CompactStep>();
        var ariaDispatcher = stubAriaDispatcher(dispatched, Map.of());
        var executor = new PlaybookExecutor(List.of(
                new AriaDeliveryHandler(ariaDispatcher)));

        var steps = List.of(
                ariaStep("click", Map.of("role", "button", "name", "Submit"), "click-btn"));

        List<ExecutionResult> results = executor.execute(steps, PlaybookConfig.localhost());

        assertThat(results).hasSize(1);
        assertThat(results.getFirst().success()).isTrue();
        assertThat(dispatched).hasSize(1);
        assertThat(dispatched.getFirst().action()).isEqualTo("click");
    }

    @Test
    void consecutiveUnnamedNonNavigateStepsBatched() {
        var batchSizes     = new ArrayList<Integer>();
        var ariaDispatcher = batchCapturingDispatcher(batchSizes);
        var executor = new PlaybookExecutor(List.of(
                new AriaDeliveryHandler(ariaDispatcher)));

        var steps = List.of(
                ariaStep("click", Map.of("role", "button", "name", "A"), null),
                ariaStep("fill", Map.of("role", "textbox", "name", "Name", "value", "Alice"), null),
                ariaStep("click", Map.of("role", "button", "name", "B"), null));

        executor.execute(steps, PlaybookConfig.localhost());

        assertThat(batchSizes).containsExactly(3);
    }

    @Test
    void namedStepBreaksBatch() {
        var batchSizes     = new ArrayList<Integer>();
        var ariaDispatcher = batchCapturingDispatcher(batchSizes);
        var executor = new PlaybookExecutor(List.of(
                new AriaDeliveryHandler(ariaDispatcher)));

        var steps = List.of(
                ariaStep("click", Map.of("role", "button", "name", "A"), null),
                ariaStep("click", Map.of("role", "button", "name", "B"), "important"),
                ariaStep("click", Map.of("role", "button", "name", "C"), null));

        executor.execute(steps, PlaybookConfig.localhost());

        assertThat(batchSizes).containsExactly(1, 1);
    }

    @Test
    void navigateStepBreaksBatch() {
        var dispatched     = new ArrayList<CompactStep>();
        var ariaDispatcher = stubAriaDispatcher(dispatched, Map.of());
        var executor = new PlaybookExecutor(List.of(
                new AriaDeliveryHandler(ariaDispatcher)));

        var steps = List.of(
                ariaStep("click", Map.of("role", "button", "name", "A"), null),
                ariaStep("navigate", Map.of("value", "/page2"), "nav"));

        executor.execute(steps, PlaybookConfig.localhost());

        assertThat(dispatched).hasSize(2);
    }

    @Test
    void unknownDeliveryTypeReturnsFailure() {
        var executor = new PlaybookExecutor(List.of(new SimulatedDeliveryHandler()));
        var steps = List.of(
                new CompactStep("desired-state", Map.of("deviceId", "dev-001"),
                        null, null, null, Map.of("step", "step1")));

        assertThatThrownBy(() -> executor.execute(steps, PlaybookConfig.localhost()))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("No DeliveryHandler registered");
    }

    @Test
    void simulatedStepReturnsOk() {
        var executor = new PlaybookExecutor(List.of(new SimulatedDeliveryHandler()));
        var steps = List.of(
                new CompactStep("simulate", Map.of("dataset", "metrics", "data", Map.of("cpu", 85)),
                        null, null, null, Map.of("step", "sim1")));

        List<ExecutionResult> results = executor.execute(steps, PlaybookConfig.localhost());
        assertThat(results).hasSize(1);
        assertThat(results.getFirst().success()).isTrue();
    }

    private static CompactStep gqlStep(String stepName, String domain, String operation,
                                        Map<String, Object> params) {
        var allParams = new java.util.LinkedHashMap<String, Object>();
        allParams.put("domain", domain);
        allParams.put("operation", operation);
        allParams.putAll(params);
        return new CompactStep("graphql", allParams, null, null, null,
                stepName != null ? Map.of("step", stepName) : Map.of());
    }

    private static CompactStep ariaStep(String action, Map<String, Object> params, String stepName) {
        Map<String, Object> decorators = stepName != null ? Map.of("step", stepName) : Map.of();
        return new CompactStep(action, params, null, null, null, decorators);
    }


    private static GraphQLDispatcher stubGraphQLDispatcher(Map<String, Map<String, Object>> responses) {
        return new GraphQLDispatcher(null, null) {
            @Override
            public Map<String, Object> dispatch(String domain, String operation,
                                                Map<String, Object> params,
                                                String endpoint, VariableContext ctx) {
                Map<String, Object> result = responses.get(operation);
                if (result == null) {
                    throw new RuntimeException("No stub for " + operation);
                }
                return result;
            }
        };
    }

    private static AriaDispatcher stubAriaDispatcher(
            List<CompactStep> captured,
            Map<String, Object> result) {
        return new AriaDispatcher(
                new EventBroadcaster(
                        new InMemoryEventStore(100), new TopicRegistry(),
                        (c, m) -> {}, o -> "{}"),
                500) {
            @Override
            public PushRequest.CommandResult send(CompactStep step) {
                captured.add(step);
                return new PushRequest.CommandResult("id", true, null, result);
            }

            @Override
            public PushRequest.CommandResult sendBatch(List<CompactStep> steps) {
                captured.addAll(steps);
                return new PushRequest.CommandResult("id", true, null, result);
            }
        };
    }

    @Test
    void executeStep_passes_executionId_to_delivery_context() {
        var capturedCtx = new java.util.concurrent.atomic.AtomicReference<io.casehub.pages.playbook.DeliveryContext>();
        var handler = new io.casehub.pages.playbook.DeliveryHandler() {
            @Override public String name() { return "rest"; }
            @Override public io.casehub.pages.playbook.StepOutcome execute(
                    String stepName, Map<String, Object> data,
                    io.casehub.pages.playbook.DeliveryContext ctx) {
                capturedCtx.set(ctx);
                return io.casehub.pages.playbook.StepOutcome.ok(stepName, Map.of());
            }
        };

        var executor = new PlaybookExecutor(List.of(handler));
        var step = new CompactStep("rest", Map.of(), null, null, null,
                Map.of("step", "s1"));
        executor.execute(List.of(step), PlaybookConfig.localhost());

        assertThat(capturedCtx.get()).isNotNull();
        assertThat(capturedCtx.get().executionId()).isNotNull();
        assertThat(capturedCtx.get().executionId()).matches("[0-9a-f-]{36}");
    }

    private static AriaDispatcher batchCapturingDispatcher(List<Integer> batchSizes) {
        return new AriaDispatcher(
                new EventBroadcaster(
                        new InMemoryEventStore(100), new TopicRegistry(),
                        (c, m) -> {}, o -> "{}"),
                500) {
            @Override
            public PushRequest.CommandResult send(CompactStep step) {
                return new PushRequest.CommandResult("id", true, null, Map.of());
            }

            @Override
            public PushRequest.CommandResult sendBatch(List<CompactStep> steps) {
                batchSizes.add(steps.size());
                return new PushRequest.CommandResult("id", true, null, Map.of());
            }
        };
    }
}
