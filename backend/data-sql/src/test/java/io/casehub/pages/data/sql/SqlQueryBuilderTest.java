package io.casehub.pages.data.sql;

import io.casehub.pages.data.Aggregation;
import io.casehub.pages.data.DataSetOp;
import io.casehub.pages.data.FilterExpression;
import io.casehub.pages.data.FilterOp;
import io.casehub.pages.data.GroupOp;
import io.casehub.pages.data.GroupStrategy;
import io.casehub.pages.data.GroupingKey;
import io.casehub.pages.data.ResultColumn;
import io.casehub.pages.data.SortColumn;
import io.casehub.pages.data.SortOp;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SqlQueryBuilderTest {

    private static final String BASE = "SELECT * FROM sales";
    private static final Set<String> ALLOWED = Set.of(
        "col1", "col2", "amount", "name", "created_at", "status", "category"
    );

    // ── Empty operations ─────────────────────────────────────────────

    @Test
    void emptyOperationsGeneratesSelectStar() {
        PreparedQuery pq = SqlQueryBuilder.build(BASE, List.of(), ALLOWED);

        assertThat(pq.sql()).isEqualTo("SELECT * FROM (" + BASE + ") AS _ds");
        assertThat(pq.params()).isEmpty();
    }

    // ── Filter: EQUALS_TO ────────────────────────────────────────────

    @Test
    void singleEqualsToFilter() {
        FilterOp filter = new FilterOp(List.of(
            new FilterExpression.Unresolved("col1", "EQUALS_TO", List.of("value1"))
        ));

        PreparedQuery pq = SqlQueryBuilder.build(BASE, List.of(filter), ALLOWED);

        assertThat(pq.sql()).isEqualTo(
            "SELECT * FROM (" + BASE + ") AS _ds WHERE \"col1\" = ?"
        );
        assertThat(pq.params()).containsExactly("value1");
    }

    // ── Filter: multiple filters joined with AND ─────────────────────

    @Test
    void multipleFiltersJoinedWithAnd() {
        FilterOp filter = new FilterOp(List.of(
            new FilterExpression.Unresolved("col1", "EQUALS_TO", List.of("a")),
            new FilterExpression.Unresolved("col2", "EQUALS_TO", List.of("b"))
        ));

        PreparedQuery pq = SqlQueryBuilder.build(BASE, List.of(filter), ALLOWED);

        assertThat(pq.sql()).contains("WHERE \"col1\" = ? AND \"col2\" = ?");
        assertThat(pq.params()).containsExactly("a", "b");
    }

    // ── Filter: BETWEEN ──────────────────────────────────────────────

    @Test
    void betweenFilterGeneratesTwoBindParams() {
        FilterOp filter = new FilterOp(List.of(
            new FilterExpression.Unresolved("amount", "BETWEEN", List.of("10", "50"))
        ));

        PreparedQuery pq = SqlQueryBuilder.build(BASE, List.of(filter), ALLOWED);

        assertThat(pq.sql()).contains("\"amount\" BETWEEN ? AND ?");
        assertThat(pq.params()).containsExactly("10", "50");
    }

    // ── Filter: IN ───────────────────────────────────────────────────

    @Test
    void inFilterGeneratesCorrectParamCount() {
        FilterOp filter = new FilterOp(List.of(
            new FilterExpression.Unresolved("status", "IN", List.of("active", "pending"))
        ));

        PreparedQuery pq = SqlQueryBuilder.build(BASE, List.of(filter), ALLOWED);

        assertThat(pq.sql()).contains("\"status\" IN (?, ?)");
        assertThat(pq.params()).containsExactly("active", "pending");
    }

    // ── Filter: IS_NULL / NOT_NULL ───────────────────────────────────

    @Test
    void isNullGeneratesNoBindParams() {
        FilterOp filter = new FilterOp(List.of(
            new FilterExpression.Unresolved("col1", "IS_NULL", List.of())
        ));

        PreparedQuery pq = SqlQueryBuilder.build(BASE, List.of(filter), ALLOWED);

        assertThat(pq.sql()).contains("\"col1\" IS NULL");
        assertThat(pq.params()).isEmpty();
    }

    @Test
    void notNullGeneratesNoBindParams() {
        FilterOp filter = new FilterOp(List.of(
            new FilterExpression.Unresolved("col1", "NOT_NULL", List.of())
        ));

        PreparedQuery pq = SqlQueryBuilder.build(BASE, List.of(filter), ALLOWED);

        assertThat(pq.sql()).contains("\"col1\" IS NOT NULL");
        assertThat(pq.params()).isEmpty();
    }

    // ── Filter: LIKE_TO ──────────────────────────────────────────────

    @Test
    void likeToGeneratesLikeWithBindParam() {
        FilterOp filter = new FilterOp(List.of(
            new FilterExpression.Unresolved("name", "LIKE_TO", List.of("%widget%"))
        ));

        PreparedQuery pq = SqlQueryBuilder.build(BASE, List.of(filter), ALLOWED);

        assertThat(pq.sql()).contains("\"name\" LIKE ?");
        assertThat(pq.params()).containsExactly("%widget%");
    }

    // ── Sort: single column ──────────────────────────────────────────

    @Test
    void sortGeneratesOrderByAsc() {
        SortOp sort = new SortOp(List.of(new SortColumn("col1", true)));

        PreparedQuery pq = SqlQueryBuilder.build(BASE, List.of(sort), ALLOWED);

        assertThat(pq.sql()).contains("ORDER BY \"col1\" ASC");
        assertThat(pq.params()).isEmpty();
    }

    @Test
    void sortGeneratesOrderByDesc() {
        SortOp sort = new SortOp(List.of(new SortColumn("amount", false)));

        PreparedQuery pq = SqlQueryBuilder.build(BASE, List.of(sort), ALLOWED);

        assertThat(pq.sql()).contains("ORDER BY \"amount\" DESC");
    }

    // ── Sort: multiple columns ───────────────────────────────────────

    @Test
    void multipleSortColumnsJoined() {
        SortOp sort = new SortOp(List.of(
            new SortColumn("col1", true),
            new SortColumn("amount", false)
        ));

        PreparedQuery pq = SqlQueryBuilder.build(BASE, List.of(sort), ALLOWED);

        assertThat(pq.sql()).contains("ORDER BY \"col1\" ASC, \"amount\" DESC");
    }

    // ── Group: COUNT ─────────────────────────────────────────────────

    @Test
    void groupWithCountAggregation() {
        GroupOp group = new GroupOp(
            new GroupingKey("category", "category", new GroupStrategy.Distinct(), 100, false, true, null, null),
            List.of(new ResultColumn.Aggregate("col1", "total", new Aggregation("COUNT", null))),
            null, null
        );

        PreparedQuery pq = SqlQueryBuilder.build(BASE, List.of(group), ALLOWED);

        assertThat(pq.sql()).startsWith("SELECT ");
        assertThat(pq.sql()).contains("\"category\" AS \"category\"");
        assertThat(pq.sql()).contains("COUNT(\"col1\") AS \"total\"");
        assertThat(pq.sql()).contains("GROUP BY \"category\"");
        assertThat(pq.params()).isEmpty();
    }

    // ── Group: SUM, AVG, MIN, MAX ────────────────────────────────────

    @Test
    void groupWithSumAggregation() {
        GroupOp group = new GroupOp(
            new GroupingKey("category", "category", new GroupStrategy.Distinct(), 100, false, true, null, null),
            List.of(new ResultColumn.Aggregate("amount", "total_amount", new Aggregation("SUM", null))),
            null, null
        );

        PreparedQuery pq = SqlQueryBuilder.build(BASE, List.of(group), ALLOWED);

        assertThat(pq.sql()).contains("SUM(\"amount\") AS \"total_amount\"");
    }

    @Test
    void groupWithAverageAggregation() {
        GroupOp group = new GroupOp(
            new GroupingKey("category", "category", new GroupStrategy.Distinct(), 100, false, true, null, null),
            List.of(new ResultColumn.Aggregate("amount", "avg_amount", new Aggregation("AVERAGE", null))),
            null, null
        );

        PreparedQuery pq = SqlQueryBuilder.build(BASE, List.of(group), ALLOWED);

        assertThat(pq.sql()).contains("AVG(\"amount\") AS \"avg_amount\"");
    }

    @Test
    void groupWithMinAggregation() {
        GroupOp group = new GroupOp(
            new GroupingKey("category", "category", new GroupStrategy.Distinct(), 100, false, true, null, null),
            List.of(new ResultColumn.Aggregate("amount", "min_amount", new Aggregation("MIN", null))),
            null, null
        );

        PreparedQuery pq = SqlQueryBuilder.build(BASE, List.of(group), ALLOWED);

        assertThat(pq.sql()).contains("MIN(\"amount\") AS \"min_amount\"");
    }

    @Test
    void groupWithMaxAggregation() {
        GroupOp group = new GroupOp(
            new GroupingKey("category", "category", new GroupStrategy.Distinct(), 100, false, true, null, null),
            List.of(new ResultColumn.Aggregate("amount", "max_amount", new Aggregation("MAX", null))),
            null, null
        );

        PreparedQuery pq = SqlQueryBuilder.build(BASE, List.of(group), ALLOWED);

        assertThat(pq.sql()).contains("MAX(\"amount\") AS \"max_amount\"");
    }

    // ── Combinator tree: AND / OR / NOT ──────────────────────────────

    @Test
    void andCombinatorGeneratesParenthesizedAnd() {
        FilterExpression and = new FilterExpression.And(List.of(
            new FilterExpression.Unresolved("col1", "EQUALS_TO", List.of("a")),
            new FilterExpression.Unresolved("col2", "EQUALS_TO", List.of("b"))
        ));
        FilterOp filter = new FilterOp(List.of(and));

        PreparedQuery pq = SqlQueryBuilder.build(BASE, List.of(filter), ALLOWED);

        assertThat(pq.sql()).contains("(\"col1\" = ? AND \"col2\" = ?)");
        assertThat(pq.params()).containsExactly("a", "b");
    }

    @Test
    void orCombinatorGeneratesParenthesizedOr() {
        FilterExpression or = new FilterExpression.Or(List.of(
            new FilterExpression.Unresolved("col1", "EQUALS_TO", List.of("a")),
            new FilterExpression.Unresolved("col2", "EQUALS_TO", List.of("b"))
        ));
        FilterOp filter = new FilterOp(List.of(or));

        PreparedQuery pq = SqlQueryBuilder.build(BASE, List.of(filter), ALLOWED);

        assertThat(pq.sql()).contains("(\"col1\" = ? OR \"col2\" = ?)");
        assertThat(pq.params()).containsExactly("a", "b");
    }

    @Test
    void notCombinatorGeneratesNotWithParentheses() {
        FilterExpression not = new FilterExpression.Not(
            new FilterExpression.Unresolved("col1", "EQUALS_TO", List.of("a"))
        );
        FilterOp filter = new FilterOp(List.of(not));

        PreparedQuery pq = SqlQueryBuilder.build(BASE, List.of(filter), ALLOWED);

        assertThat(pq.sql()).contains("NOT (\"col1\" = ?)");
        assertThat(pq.params()).containsExactly("a");
    }

    @Test
    void nestedCombinatorTree() {
        // NOT(col1 = 'a' OR col2 = 'b')
        FilterExpression tree = new FilterExpression.Not(
            new FilterExpression.Or(List.of(
                new FilterExpression.Unresolved("col1", "EQUALS_TO", List.of("a")),
                new FilterExpression.Unresolved("col2", "EQUALS_TO", List.of("b"))
            ))
        );
        FilterOp filter = new FilterOp(List.of(tree));

        PreparedQuery pq = SqlQueryBuilder.build(BASE, List.of(filter), ALLOWED);

        assertThat(pq.sql()).contains("NOT ((\"col1\" = ? OR \"col2\" = ?))");
        assertThat(pq.params()).containsExactly("a", "b");
    }

    // ── Column allowlist validation ──────────────────────────────────

    @Test
    void columnNotInAllowlistThrowsForFilter() {
        FilterOp filter = new FilterOp(List.of(
            new FilterExpression.Unresolved("evil_column", "EQUALS_TO", List.of("x"))
        ));

        assertThatThrownBy(() -> SqlQueryBuilder.build(BASE, List.of(filter), ALLOWED))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("evil_column");
    }

    @Test
    void columnNotInAllowlistThrowsForSort() {
        SortOp sort = new SortOp(List.of(new SortColumn("evil_column", true)));

        assertThatThrownBy(() -> SqlQueryBuilder.build(BASE, List.of(sort), ALLOWED))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("evil_column");
    }

    @Test
    void columnNotInAllowlistThrowsForGroup() {
        GroupOp group = new GroupOp(
            new GroupingKey("evil_column", "evil_column", new GroupStrategy.Distinct(), 100, false, true, null, null),
            List.of(),
            null, null
        );

        assertThatThrownBy(() -> SqlQueryBuilder.build(BASE, List.of(group), ALLOWED))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("evil_column");
    }

    // ── quoteId: double-quote escaping ───────────────────────────────

    @Test
    void quoteIdEscapesDoubleQuotes() {
        assertThat(SqlQueryBuilder.quoteId("simple")).isEqualTo("\"simple\"");
        assertThat(SqlQueryBuilder.quoteId("has\"quote")).isEqualTo("\"has\"\"quote\"");
    }
}
