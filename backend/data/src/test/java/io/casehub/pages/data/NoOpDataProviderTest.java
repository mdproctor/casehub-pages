package io.casehub.pages.data;

import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@QuarkusTest
class NoOpDataProviderTest {

    @Inject
    NoOpDataProvider provider;

    @Test
    void type_returns_noop() {
        assertThat(provider.type()).isEqualTo("noop");
    }

    @Test
    void canHandle_returns_false_for_any_input() {
        assertThat(provider.canHandle("anything")).isFalse();
        assertThat(provider.canHandle("test-dataset")).isFalse();
        assertThat(provider.canHandle("")).isFalse();
    }

    @Test
    void query_returns_empty_columns_and_rows() {
        DataSetLookup lookup = new DataSetLookup("any-id", List.of());
        DataSetResult result = provider.query(lookup);

        assertThat(result.columns()).isEmpty();
        assertThat(result.rows()).isEmpty();
    }
}
