package io.casehub.pages.playbook.runtime;

import io.casehub.pages.playbook.AwaitCondition;
import io.casehub.pages.playbook.CompactStep;
import io.casehub.pages.playbook.DeliveryContext;
import io.casehub.pages.playbook.DeliveryHandler;
import io.casehub.pages.playbook.StepOutcome;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Any;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@ApplicationScoped
public class PlaybookExecutor {

    private static final Set<String> NON_BATCHABLE_ACTIONS =
            Set.of("navigate", "wait", "assert");
    private static final Set<String> GRAPHQL_ACTIONS = Set.of("graphql");
    private static final Set<String> REST_ACTIONS = Set.of("rest");
    private static final Set<String> SIMULATED_ACTIONS = Set.of("simulate");

    private final Map<String, DeliveryHandler> handlers;
    private final AriaDeliveryHandler          ariaHandler;


    @Inject
    public PlaybookExecutor(@Any Instance<DeliveryHandler> handlerInstances) {
        this(handlerInstances.stream().toList());
    }

    public PlaybookExecutor(List<DeliveryHandler> handlerList) {
        this.handlers = new HashMap<>();
        AriaDeliveryHandler foundAria = null;
        for (DeliveryHandler h : handlerList) {
            handlers.put(h.name(), h);
            if (h instanceof AriaDeliveryHandler a) {foundAria = a;}
        }
        this.ariaHandler = foundAria;
    }

    public List<ExecutionResult> execute(List<CompactStep> steps, PlaybookConfig config) {
        var context = new VariableContext();
        var results = new ArrayList<ExecutionResult>();


        int i = 0;
        while (i < steps.size()) {
            CompactStep step = steps.get(i);

            if (isAriaAction(step) && isBatchable(step)) {
                var batch = collectBatch(steps, i);
                ExecutionResult result = executeBatch(batch);
                results.add(result);
                if (!result.success()) {
                    throw new RuntimeException("Batch failed: " + result.error());
                }
                i += batch.size();
            } else {
                String stepName = step.decorator("step");
                ExecutionResult result = executeStep(step, config, context);
                results.add(result);
                if (!result.success()) {
                    throw new RuntimeException("Step '" + stepName
                                               + "' failed: " + result.error());
                }
                if (result.result() != null && !result.result().isEmpty()
                        && stepName != null) {
                    context.put(stepName, result.result());
                }
                i++;
            }
        }

        return results;
    }

    private boolean isAriaAction(CompactStep step) {
        String action = step.action();
        return !GRAPHQL_ACTIONS.contains(action)
                && !REST_ACTIONS.contains(action)
                && !SIMULATED_ACTIONS.contains(action);
    }

    private ExecutionResult executeStep(CompactStep step, PlaybookConfig config,
                                        VariableContext context) {
        String delivery = isAriaAction(step) ? "aria" : step.action();
        String stepName = step.decorator("step");
        Map<String, Object> data = new HashMap<>(step.params());
        data.put("action", step.action());
        if (step.decorators() != null) {
            data.putAll(step.decorators());
        }

        DeliveryHandler handler = handlers.get(delivery);
        if (handler == null) {
            return ExecutionResult.fail(stepName,
                                        "No DeliveryHandler registered for delivery type: " + delivery);
        }

        String executionId = java.util.UUID.randomUUID().toString();
        DeliveryContext ctx   = new RuntimeDeliveryContext(config, context, executionId);
        AwaitCondition  await = extractAwait(data);

        try {
            StepOutcome outcome;
            if (await != null) {
                var                 engine = new AwaitEngine(() -> handler.execute(stepName, data, ctx).result());
                Map<String, Object> result = engine.poll(await);
                outcome = StepOutcome.ok(stepName, result);
            } else {
                outcome = handler.execute(stepName, data, ctx);
            }
            return new ExecutionResult(outcome.stepName(), outcome.success(),
                                       outcome.result(), outcome.error());
        } catch (Exception e) {
            return ExecutionResult.fail(stepName, e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private AwaitCondition extractAwait(Map<String, Object> data) {
        Object awaitObj = data.get("await");
        if (awaitObj instanceof Map<?, ?> awaitMap) {
            Map<String, Object> match = (Map<String, Object>) awaitMap.get("match");
            if (match == null) {return null;}
            Integer timeout = awaitMap.containsKey("timeout")
                              ? ((Number) awaitMap.get("timeout")).intValue() : null;
            Integer interval = awaitMap.containsKey("interval")
                               ? ((Number) awaitMap.get("interval")).intValue() : null;
            return new AwaitCondition(match, timeout, interval);
        }
        return null;
    }

    private ExecutionResult executeBatch(List<CompactStep> batch) {
        if (ariaHandler == null) {
            return ExecutionResult.ok(null, Map.of());
        }
        try {
            var result = ariaHandler.sendBatch(batch);
            return ExecutionResult.ok(null, result.result() != null
                                            ? result.result() : Map.of());
        } catch (AriaCommandException e) {
            return ExecutionResult.fail(null, e.getMessage());
        }
    }

    private boolean isBatchable(CompactStep step) {
        return step.decorator("step") == null
                && !NON_BATCHABLE_ACTIONS.contains(step.action());
    }

    private List<CompactStep> collectBatch(List<CompactStep> steps, int start) {
        var batch = new ArrayList<CompactStep>();
        for (int j = start; j < steps.size(); j++) {
            CompactStep s = steps.get(j);
            if (isAriaAction(s) && isBatchable(s)) {
                batch.add(s);
            } else {
                break;
            }
        }
        return batch;
    }
}
