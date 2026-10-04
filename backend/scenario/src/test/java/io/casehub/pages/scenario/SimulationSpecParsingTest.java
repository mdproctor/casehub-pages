package io.casehub.pages.scenario;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SimulationSpecParsingTest {

    @Test
    void parsesSimulationBlock() {
        String yaml = """
                scenario: Test with simulation
                simulation:
                  strategies:
                    agent-provider.invoke: sequential
                    case-memory-store.query: key-lookup
                  corpus:
                    - fixtures/agent-responses.yaml
                  capture:
                    - preference-provider.get
                steps:
                  - label: step1
                    target: browser
                    navigate: /home
                """;
        var envelope = ScenarioEnvelopeParser.parse(yaml);
        assertThat(envelope.simulation()).isNotNull();
        assertThat(envelope.simulation().strategies())
                .containsEntry("agent-provider.invoke", "sequential")
                .containsEntry("case-memory-store.query", "key-lookup");
        assertThat(envelope.simulation().corpus()).containsExactly("fixtures/agent-responses.yaml");
        assertThat(envelope.simulation().capture()).containsExactly("preference-provider.get");
    }

    @Test
    void parsesScenarioWithoutSimulationBlock() {
        String yaml = """
                scenario: Plain scenario
                steps:
                  - label: step1
                    target: browser
                    navigate: /home
                """;
        var envelope = ScenarioEnvelopeParser.parse(yaml);
        assertThat(envelope.simulation()).isNull();
    }

    @Test
    void parsesSimulationWithStrategiesOnly() {
        String yaml = """
                scenario: Strategies only
                simulation:
                  strategies:
                    agent-provider.invoke: random
                steps:
                  - label: step1
                    target: browser
                    navigate: /home
                """;
        var envelope = ScenarioEnvelopeParser.parse(yaml);
        assertThat(envelope.simulation()).isNotNull();
        assertThat(envelope.simulation().strategies()).containsEntry("agent-provider.invoke", "random");
        assertThat(envelope.simulation().corpus()).isEmpty();
        assertThat(envelope.simulation().capture()).isEmpty();
    }
}
