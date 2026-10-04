package io.casehub.pages.mcp;

import io.casehub.pages.push.EventBroadcaster;
import io.casehub.pages.push.InMemoryEventStore;
import io.casehub.pages.push.PushRequest;
import io.casehub.pages.push.TopicRegistry;
import io.casehub.platform.api.mcp.McpDomain;
import io.casehub.platform.mcp.DomainModel;
import io.casehub.platform.mcp.ModelRegistry;
import io.casehub.platform.mcp.OperationDescriptor;
import io.casehub.platform.mcp.ParameterDescriptor;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.eclipse.microprofile.graphql.GraphQLApi;
import org.eclipse.microprofile.graphql.Mutation;
import org.eclipse.microprofile.graphql.Query;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.lang.reflect.Parameter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration test proving the full MCP dispatch chain:
 *
 * casehub_model → discovers aria domain with operations
 * casehub_action → ReflectiveOperationDispatcher → AriaResolver → AriaCommandBridge → push
 *
 * Uses the real platform MCP classes (ModelRegistry, OperationDescriptor) to verify
 * that the AriaResolver is correctly wired for MCP discovery and dispatch.
 */
class AriaMcpIntegrationTest {

    @Nested
    class DomainDiscovery {

        @Test
        void ariaResolverHasMcpDomainAnnotation() {
            var annotation = AriaResolver.class.getAnnotation(McpDomain.class);
            assertThat(annotation).isNotNull();
            assertThat(annotation.value()).isEqualTo("aria");
        }

        @Test
        void ariaResolverHasGraphQLApiAnnotation() {
            assertThat(AriaResolver.class.getAnnotation(GraphQLApi.class)).isNotNull();
        }

        @Test
        void scannerWouldDiscoverAllOperations() {
            List<OperationDescriptor> ops = scanOperations(AriaResolver.class);

            assertThat(ops).hasSizeGreaterThanOrEqualTo(8);

            var opNames = ops.stream().map(OperationDescriptor::name).toList();
            assertThat(opNames).contains("findByRole", "click", "fill", "select",
                    "expand", "collapse", "assertState", "waitFor");
        }

        @Test
        void queriesAndMutationsCorrectlyTyped() {
            List<OperationDescriptor> ops = scanOperations(AriaResolver.class);

            var queries = ops.stream().filter(o -> o.type() == OperationDescriptor.OperationType.QUERY).toList();
            var mutations = ops.stream().filter(o -> o.type() == OperationDescriptor.OperationType.MUTATION).toList();

            assertThat(queries.stream().map(OperationDescriptor::name).toList())
                    .contains("findByRole", "assertState", "waitFor");

            assertThat(mutations.stream().map(OperationDescriptor::name).toList())
                    .contains("click", "fill", "select", "expand", "collapse");
        }

        @Test
        void clickOperationHasCorrectParameters() {
            List<OperationDescriptor> ops = scanOperations(AriaResolver.class);
            var click = ops.stream().filter(o -> o.name().equals("click")).findFirst().orElseThrow();

            var paramNames = click.params().stream().map(ParameterDescriptor::name).toList();
            assertThat(paramNames).contains("role", "name");
        }

        @Test
        void fillOperationHasValueParameter() {
            List<OperationDescriptor> ops = scanOperations(AriaResolver.class);
            var fill = ops.stream().filter(o -> o.name().equals("fill")).findFirst().orElseThrow();

            var paramNames = fill.params().stream().map(ParameterDescriptor::name).toList();
            assertThat(paramNames).contains("role", "name", "value");
        }

        @Test
        void modelRegistryServesAriaDomain() {
            var registry = new ModelRegistry();
            List<OperationDescriptor> ops = scanOperations(AriaResolver.class);
            var model = new DomainModel("aria",
                    "ARIA interaction model", ops, List.of(), Map.of());
            registry.register(model);

            assertThat(registry.getDomain("aria")).isPresent();
            assertThat(registry.getOperation("aria", "click")).isPresent();
            assertThat(registry.getOperation("aria", "findByRole")).isPresent();
            assertThat(registry.getOperation("aria", "fill")).isPresent();
        }
    }

    @Nested
    class DispatchChain {

        private AriaCommandBridge bridge;
        private AriaResolver resolver;
        private AtomicReference<String> lastTopic;
        private ObjectMapper mapper;

        @BeforeEach
        void setUp() {
            lastTopic = new AtomicReference<>();
            var broadcaster = new EventBroadcaster(
                    new InMemoryEventStore(100), new TopicRegistry(),
                    (connId, msg) -> {}, obj -> "{}") {
                @Override
                public <T> long broadcast(String topic, T event) {
                    lastTopic.set(topic);
                    return 1L;
                }
            };
            bridge = new AriaCommandBridge(broadcaster, 2000);
            resolver = new AriaResolver();

            // Manual injection (no CDI in unit tests)
            try {
                var field = AriaResolver.class.getDeclaredField("bridge");
                field.setAccessible(true);
                field.set(resolver, bridge);
            } catch (Exception e) {
                throw new RuntimeException(e);
            }

            mapper = new ObjectMapper();
        }

        @Test
        void reflectiveDispatchClickReacheBridge() {
            // Simulate browser responding to the command
            CompletableFuture.runAsync(() -> {
                try { Thread.sleep(50); } catch (InterruptedException ignored) {}
                String topic = lastTopic.get();
                if (topic != null) {
                    String cmdId = topic.replace("scenario/cmd-", "");
                    bridge.handleResult(new PushRequest.CommandResult(cmdId, true, null));
                }
            });

            // Simulate what ReflectiveOperationDispatcher does:
            // casehub_action(domain="aria", operation="click", params={role: "button", name: "Submit"})
            Map<String, Object> params = Map.of("role", "button", "name", "Submit");

            // Dispatch via reflection (same as ReflectiveOperationDispatcher.dispatch())
            try {
                List<OperationDescriptor> ops = scanOperations(AriaResolver.class);
                var clickOp = ops.stream().filter(o -> o.name().equals("click")).findFirst().orElseThrow();

                Method method = clickOp.method();
                Parameter[] methodParams = method.getParameters();
                Object[] args = new Object[methodParams.length];

                for (int i = 0; i < methodParams.length; i++) {
                    String paramName = methodParams[i].getName();
                    Object rawValue = params.get(paramName);
                    if (rawValue != null) {
                        args[i] = mapper.convertValue(rawValue, methodParams[i].getType());
                    }
                }

                Object result = method.invoke(resolver, args);

                assertThat(result).isInstanceOf(AriaResult.class);
                var ariaResult = (AriaResult) result;
                assertThat(ariaResult.ok()).isTrue();
                assertThat(lastTopic.get()).startsWith("scenario/cmd-");
            } catch (Exception e) {
                throw new RuntimeException("Reflective dispatch failed", e);
            }
        }

        @Test
        void reflectiveDispatchFillWithValue() {
            CompletableFuture.runAsync(() -> {
                try { Thread.sleep(50); } catch (InterruptedException ignored) {}
                String topic = lastTopic.get();
                if (topic != null) {
                    String cmdId = topic.replace("scenario/cmd-", "");
                    bridge.handleResult(new PushRequest.CommandResult(cmdId, true, null));
                }
            });

            Map<String, Object> params = Map.of(
                    "role", "textbox",
                    "name", "Email address",
                    "value", "alice@casehub.io"
            );

            try {
                List<OperationDescriptor> ops = scanOperations(AriaResolver.class);
                var fillOp = ops.stream().filter(o -> o.name().equals("fill")).findFirst().orElseThrow();

                Method method = fillOp.method();
                Parameter[] methodParams = method.getParameters();
                Object[] args = new Object[methodParams.length];

                for (int i = 0; i < methodParams.length; i++) {
                    String paramName = methodParams[i].getName();
                    Object rawValue = params.get(paramName);
                    if (rawValue != null) {
                        args[i] = mapper.convertValue(rawValue, methodParams[i].getType());
                    }
                }

                var result = (AriaResult) method.invoke(resolver, args);
                assertThat(result.ok()).isTrue();
            } catch (Exception e) {
                throw new RuntimeException("Reflective dispatch failed", e);
            }
        }

        @Test
        void reflectiveDispatchWithNestedWithinTarget() {
            CompletableFuture.runAsync(() -> {
                try { Thread.sleep(50); } catch (InterruptedException ignored) {}
                String topic = lastTopic.get();
                if (topic != null) {
                    String cmdId = topic.replace("scenario/cmd-", "");
                    bridge.handleResult(new PushRequest.CommandResult(cmdId, true, null));
                }
            });

            // Simulate: casehub_action("aria", "click", {role:"button", name:"Save", within:{role:"group", name:"Security"}})
            Map<String, Object> params = Map.of(
                    "role", "button",
                    "name", "Save",
                    "within", Map.of("role", "group", "name", "Security")
            );

            try {
                List<OperationDescriptor> ops = scanOperations(AriaResolver.class);
                var clickOp = ops.stream().filter(o -> o.name().equals("click")).findFirst().orElseThrow();

                Method method = clickOp.method();
                Parameter[] methodParams = method.getParameters();
                Object[] args = new Object[methodParams.length];

                for (int i = 0; i < methodParams.length; i++) {
                    String paramName = methodParams[i].getName();
                    Object rawValue = params.get(paramName);
                    if (rawValue != null) {
                        args[i] = mapper.convertValue(rawValue, methodParams[i].getType());
                    }
                }

                @SuppressWarnings("unchecked")
                var within = (Map<String, Object>) args[2];
                assertThat(within).containsEntry("role", "group");
                assertThat(within).containsEntry("name", "Security");

                var result = (AriaResult) method.invoke(resolver, args);
                assertThat(result.ok()).isTrue();
            } catch (Exception e) {
                throw new RuntimeException("Reflective dispatch failed", e);
            }
        }

        @Test
        void browserErrorPropagatesBackThroughMcp() {
            CompletableFuture.runAsync(() -> {
                try { Thread.sleep(50); } catch (InterruptedException ignored) {}
                String topic = lastTopic.get();
                if (topic != null) {
                    String cmdId = topic.replace("scenario/cmd-", "");
                    bridge.handleResult(new PushRequest.CommandResult(
                            cmdId, false, "No element found: button \"NonExistent\""));
                }
            });

            Map<String, Object> params = Map.of("role", "button", "name", "NonExistent");

            try {
                List<OperationDescriptor> ops = scanOperations(AriaResolver.class);
                var clickOp = ops.stream().filter(o -> o.name().equals("click")).findFirst().orElseThrow();
                Method method = clickOp.method();
                Parameter[] methodParams = method.getParameters();
                Object[] args = new Object[methodParams.length];
                for (int i = 0; i < methodParams.length; i++) {
                    String paramName = methodParams[i].getName();
                    Object rawValue = params.get(paramName);
                    if (rawValue != null) {
                        args[i] = mapper.convertValue(rawValue, methodParams[i].getType());
                    }
                }

                var result = (AriaResult) method.invoke(resolver, args);
                assertThat(result.ok()).isFalse();
                assertThat(result.error()).contains("No element found");
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        }
    }

    // --- Helpers: simulate what GraphQLModelScanner does ---

    private static List<OperationDescriptor> scanOperations(Class<?> resolverClass) {
        List<OperationDescriptor> ops = new ArrayList<>();
        for (Method method : resolverClass.getDeclaredMethods()) {
            if (java.lang.reflect.Modifier.isStatic(method.getModifiers())) continue;

            Query query = method.getAnnotation(Query.class);
            Mutation mutation = method.getAnnotation(Mutation.class);

            if (query != null || mutation != null) {
                String name = query != null
                        ? (query.value().isEmpty() ? method.getName() : query.value())
                        : (mutation.value().isEmpty() ? method.getName() : mutation.value());

                var type = query != null
                        ? OperationDescriptor.OperationType.QUERY
                        : OperationDescriptor.OperationType.MUTATION;

                List<ParameterDescriptor> params = new ArrayList<>();
                for (Parameter p : method.getParameters()) {
                    params.add(new ParameterDescriptor(p.getName(), p.getType().getSimpleName(), true));
                }

                ops.add(new OperationDescriptor(name, type, "", params,
                        method.getReturnType().getSimpleName(), method, resolverClass));
            }
        }
        return ops;
    }
}
