package io.casehub.pages.scenario.runtime;

import io.casehub.pages.scenario.CompactStep;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GraphQLDispatcherTest {

    private final GraphQLDispatcher dispatcher = new GraphQLDispatcher();

    @Test
    void constructsMutationQuery() {
        String query = dispatcher.buildQuery("injectChat",
                Map.of("platform", "slack", "sender", "Alice"), "mutation");
        assertThat(query).contains("mutation");
        assertThat(query).contains("injectChat");
        assertThat(query).contains("$platform");
        assertThat(query).contains("$sender");
    }

    @Test
    void constructsQueryWithoutParams() {
        String query = dispatcher.buildQuery("connectorStatus", Map.of(), "query");
        assertThat(query).contains("query");
        assertThat(query).contains("connectorStatus");
        assertThat(query).doesNotContain("$");
    }

    @Test
    void parsesGraphQLResponse() {
        String responseJson = """
                {"data":{"injectChat":{"caseId":"C-001","status":"OPEN"}}}
                """;
        Map<String, Object> result = dispatcher.parseResponse(responseJson, "injectChat");
        assertThat(result).containsEntry("caseId", "C-001");
        assertThat(result).containsEntry("status", "OPEN");
    }

    @Test
    void parsesScalarResponse() {
        String responseJson = """
                {"data":{"count":42}}
                """;
        Map<String, Object> result = dispatcher.parseResponse(responseJson, "count");
        assertThat(result).containsEntry("value", 42);
    }

    @Test
    void parsesGraphQLErrorResponse() {
        String responseJson = """
                {"errors":[{"message":"Unknown operation: badOp"}]}
                """;
        assertThatThrownBy(() -> dispatcher.parseResponse(responseJson, "badOp"))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Unknown operation");
    }

    @Test
    void parsesNullDataResponse() {
        String responseJson = """
                {"data":null}
                """;
        Map<String, Object> result = dispatcher.parseResponse(responseJson, "op");
        assertThat(result).isEmpty();
    }
}
