package io.casehub.pages.scenario.runtime;

import io.casehub.pages.scenario.AwaitCondition;
import io.casehub.pages.scenario.CompactStep;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class ScenarioExecutor {

    private static final Set<String> NON_BATCHABLE_ACTIONS =
            Set.of("navigate", "wait", "assert");
    private static final Set<String> GRAPHQL_ACTIONS = Set.of("graphql");
    private static final Set<String> REST_ACTIONS = Set.of("rest");
    private static final Set<String> SIMULATED_ACTIONS = Set.of("simulate");

    private final GraphQLDispatcher graphQLDispatcher;
    private final AriaDispatcher ariaDispatcher;
    private final RestDispatcher restDispatcher;

    public ScenarioExecutor(GraphQLDispatcher graphQLDispatcher,
                            AriaDispatcher ariaDispatcher,
                            RestDispatcher restDispatcher) {
        this.graphQLDispatcher = graphQLDispatcher;
        this.ariaDispatcher = ariaDispatcher;
        this.restDispatcher = restDispatcher;
    }

    public ScenarioExecutor(GraphQLDispatcher graphQLDispatcher,
                            AriaDispatcher ariaDispatcher) {
        this(graphQLDispatcher, ariaDispatcher, null);
    }

    public ScenarioExecutor(GraphQLDispatcher graphQLDispatcher) {
        this(graphQLDispatcher, null, null);
    }

    public List<ExecutionResult> execute(List<CompactStep> steps, ScenarioConfig config) {
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

    private ExecutionResult executeStep(CompactStep step, ScenarioConfig config,
                                        VariableContext context) {
        String action = step.action();
        if (GRAPHQL_ACTIONS.contains(action)) return executeGraphQL(step, config, context);
        if (REST_ACTIONS.contains(action)) return executeRest(step, config, context);
        if (SIMULATED_ACTIONS.contains(action)) return ExecutionResult.ok(step.decorator("step"), Map.of());
        return executeAria(step, context);
    }

    private ExecutionResult executeAria(CompactStep step, VariableContext context) {
        if (ariaDispatcher == null) {
            return ExecutionResult.ok(step.decorator("step"), Map.of());
        }
        try {
            var result = ariaDispatcher.send(step);
            var resultMap = result.result() != null ? result.result() : Map.<String, Object>of();
            return ExecutionResult.ok(step.decorator("step"), resultMap);
        } catch (AriaCommandException e) {
            return ExecutionResult.fail(step.decorator("step"), e.getMessage());
        }
    }

    private ExecutionResult executeBatch(List<CompactStep> batch) {
        if (ariaDispatcher == null) {
            return ExecutionResult.ok(null, Map.of());
        }
        try {
            var result = ariaDispatcher.sendBatch(batch);
            return ExecutionResult.ok(null, result.result() != null
                    ? result.result() : Map.of());
        } catch (AriaCommandException e) {
            return ExecutionResult.fail(null, e.getMessage());
        }
    }

    private ExecutionResult executeGraphQL(CompactStep step, ScenarioConfig config,
                                           VariableContext context) {
        try {
            String domain = (String) step.params().get("domain");
            String endpoint = config.graphQLEndpoint(domain);
            Object awaitRaw = step.decorator("await");
            AwaitCondition await = awaitRaw instanceof AwaitCondition ac ? ac : null;
            Map<String, Object> result;
            if (await != null) {
                var awaitEngine = new AwaitEngine(() ->
                        graphQLDispatcher.dispatch(step, endpoint, context));
                result = awaitEngine.poll(await);
            } else {
                result = graphQLDispatcher.dispatch(step, endpoint, context);
            }
            return ExecutionResult.ok(step.decorator("step"), result);
        } catch (Exception e) {
            return ExecutionResult.fail(step.decorator("step"), e.getMessage());
        }
    }

    private ExecutionResult executeRest(CompactStep step, ScenarioConfig config,
                                         VariableContext context) {
        if (restDispatcher == null) {
            return ExecutionResult.ok(step.decorator("step"), Map.of());
        }
        try {
            String baseUrl = config.restBaseUrl();
            Object awaitRaw = step.decorator("await");
            AwaitCondition await = awaitRaw instanceof AwaitCondition ac ? ac : null;
            Map<String, Object> result;
            if (await != null) {
                var awaitEngine = new AwaitEngine(() ->
                        restDispatcher.dispatch(step, baseUrl, context));
                result = awaitEngine.poll(await);
            } else {
                result = restDispatcher.dispatch(step, baseUrl, context);
            }
            return ExecutionResult.ok(step.decorator("step"), result);
        } catch (Exception e) {
            return ExecutionResult.fail(step.decorator("step"), e.getMessage());
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
