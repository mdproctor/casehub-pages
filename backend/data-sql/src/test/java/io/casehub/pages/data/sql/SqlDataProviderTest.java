package io.casehub.pages.data.sql;

import io.casehub.pages.data.Aggregation;
import io.casehub.pages.data.DataSetLookup;
import io.casehub.pages.data.DataSetOp;
import io.casehub.pages.data.DataSetResult;
import io.casehub.pages.data.FilterExpression;
import io.casehub.pages.data.FilterOp;
import io.casehub.pages.data.GroupOp;
import io.casehub.pages.data.GroupStrategy;
import io.casehub.pages.data.GroupingKey;
import io.casehub.pages.data.ResultColumn;
import io.casehub.pages.data.SortColumn;
import io.casehub.pages.data.SortOp;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@QuarkusTest
class SqlDataProviderTest {

    @Inject
    SqlDataProvider provider;

    // ── canHandle ────────────────────────────────────────────────────

    @Test
    void canHandleConfiguredDataset() {
        assertThat(provider.canHandle("test-sales")).isTrue();
    }

    @Test
    void cannotHandleUnknownDataset() {
        assertThat(provider.canHandle("nonexistent")).isFalse();
    }

    // ── Query with no operations ─────────────────────────────────────

    @Test
    void queryWithNoOperationsReturnsAllRows() {
        DataSetLookup lookup = new DataSetLookup("test-sales", List.of(), null);

        DataSetResult result = provider.query(lookup);

        assertThat(result.rows()).hasSize(5);
        assertThat(result.columns()).isNotEmpty();

        // Verify column names exist
        List<String> colIds = result.columns().stream().map(c -> c.id()).toList();
        assertThat(colIds).contains("ID", "PRODUCT", "AMOUNT", "QUANTITY", "REGION", "SALE_DATE");
    }

    // ── Query with EQUALS_TO filter ──────────────────────────────────

    @Test
    void queryWithEqualsToFilterOnRegion() {
        FilterOp filter = new FilterOp(List.of(
            new FilterExpression.Unresolved("REGION", "EQUALS_TO", List.of("North"))
        ));
        DataSetLookup lookup = new DataSetLookup("test-sales", List.of(filter), null);

        DataSetResult result = provider.query(lookup);

        assertThat(result.rows()).hasSize(3);
        // All returned rows should have "North" in the REGION column
        int regionIdx = columnIndex(result, "REGION");
        for (List<String> row : result.rows()) {
            assertThat(row.get(regionIdx)).isEqualTo("North");
        }
    }

    // ── Query with sort ──────────────────────────────────────────────

    @Test
    void queryWithSortOnAmountAsc() {
        SortOp sort = new SortOp(List.of(new SortColumn("AMOUNT", true)));
        DataSetLookup lookup = new DataSetLookup("test-sales", List.of(sort), null);

        DataSetResult result = provider.query(lookup);

        assertThat(result.rows()).hasSize(5);
        int amountIdx = columnIndex(result, "AMOUNT");
        List<Double> amounts = result.rows().stream()
            .map(row -> Double.parseDouble(row.get(amountIdx)))
            .toList();
        assertThat(amounts).isSorted();
    }

    // ── Query with group + SUM ───────────────────────────────────────

    @Test
    void queryWithGroupOnProductAndSumAmount() {
        GroupOp group = new GroupOp(
            new GroupingKey("PRODUCT", "PRODUCT", new GroupStrategy.Distinct(), 100, false, true, null, null),
            List.of(new ResultColumn.Aggregate("AMOUNT", "TOTAL_AMOUNT", new Aggregation("SUM", null))),
            null, null
        );
        DataSetLookup lookup = new DataSetLookup("test-sales", List.of(group), null);

        DataSetResult result = provider.query(lookup);

        // 3 distinct products: Widget, Gadget, Doohickey
        assertThat(result.rows()).hasSize(3);

        // Verify the result has the expected columns
        List<String> colIds = result.columns().stream().map(c -> c.id()).toList();
        assertThat(colIds).contains("PRODUCT", "TOTAL_AMOUNT");
    }

    // ── Column not in schema throws ──────────────────────────────────

    @Test
    void columnNotInSchemaThrows() {
        FilterOp filter = new FilterOp(List.of(
            new FilterExpression.Unresolved("NONEXISTENT", "EQUALS_TO", List.of("x"))
        ));
        DataSetLookup lookup = new DataSetLookup("test-sales", List.of(filter), null);

        assertThatThrownBy(() -> provider.query(lookup))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("NONEXISTENT");
    }

    // ── Helpers ──────────────────────────────────────────────────────

    private static int columnIndex(DataSetResult result, String columnId) {
        for (int i = 0; i < result.columns().size(); i++) {
            if (result.columns().get(i).id().equals(columnId)) {
                return i;
            }
        }
        throw new AssertionError("Column not found: " + columnId);
    }
}
