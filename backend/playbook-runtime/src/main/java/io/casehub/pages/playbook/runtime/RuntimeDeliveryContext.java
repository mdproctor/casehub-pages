package io.casehub.pages.playbook.runtime;

import io.casehub.pages.playbook.DeliveryContext;

import java.util.Map;

class RuntimeDeliveryContext implements DeliveryContext {

    private final PlaybookConfig config;
    private final VariableContext variables;
    private final String executionId;

    RuntimeDeliveryContext(PlaybookConfig config, VariableContext variables) {
        this(config, variables, null);
    }

    RuntimeDeliveryContext(PlaybookConfig config, VariableContext variables,
                           String executionId) {
        this.config = config;
        this.variables = variables;
        this.executionId = executionId;
    }

    @Override
    public String executionId() {
        return executionId;
    }

    @Override
    public String config(String key) {
        return switch (key) {
            case "rest.baseUrl" -> config.restBaseUrl();
            default -> {
                if (key.startsWith("graphql.endpoint.")) {
                    yield config.graphQLEndpoint(key.substring("graphql.endpoint.".length()));
                }
                if (key.startsWith("push.endpoint.")) {
                    yield config.pushEndpoint(key.substring("push.endpoint.".length()));
                }
                yield null;
            }
        };
    }

    @Override
    public String resolve(String template) {
        return variables.resolve(template);
    }

    @Override
    public Map<String, Object> resolveMap(Map<String, Object> data) {
        return variables.resolveMap(data);
    }
}
