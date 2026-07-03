package io.casehub.pages.data.sql;

import io.casehub.pages.data.Aggregation;
import io.casehub.pages.data.DataSetOp;
import io.casehub.pages.data.FilterExpression;
import io.casehub.pages.data.FilterOp;
import io.casehub.pages.data.GroupOp;
import io.casehub.pages.data.ResultColumn;
import io.casehub.pages.data.SortColumn;
import io.casehub.pages.data.SortOp;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

public final class SqlQueryBuilder {

    private SqlQueryBuilder() {}

    public static PreparedQuery build(String baseQuery, List<DataSetOp> operations, Set<String> allowedColumns) {
        StringBuilder sql = new StringBuilder();
        List<Object> params = new ArrayList<>();

        List<FilterOp> filters = operations.stream()
            .filter(op -> op instanceof FilterOp).map(op -> (FilterOp) op).toList();
        List<GroupOp> groups = operations.stream()
            .filter(op -> op instanceof GroupOp).map(op -> (GroupOp) op).toList();
        List<SortOp> sorts = operations.stream()
            .filter(op -> op instanceof SortOp).map(op -> (SortOp) op).toList();

        // SELECT clause
        if (groups.isEmpty()) {
            sql.append("SELECT * FROM (").append(baseQuery).append(") AS _ds");
        } else {
            sql.append("SELECT ");
            appendGroupSelect(sql, groups, allowedColumns);
            sql.append(" FROM (").append(baseQuery).append(") AS _ds");
        }

        // WHERE clause
        if (!filters.isEmpty()) {
            sql.append(" WHERE ");
            boolean first = true;
            for (FilterOp filter : filters) {
                for (FilterExpression expr : filter.expressions()) {
                    if (!first) sql.append(" AND ");
                    appendFilterExpression(sql, params, expr, allowedColumns);
                    first = false;
                }
            }
        }

        // GROUP BY clause
        if (!groups.isEmpty()) {
            sql.append(" GROUP BY ");
            List<String> groupCols = new ArrayList<>();
            for (GroupOp group : groups) {
                if (group.groupingKey() != null) {
                    validateColumn(group.groupingKey().sourceId(), allowedColumns);
                    groupCols.add(quoteId(group.groupingKey().sourceId()));
                }
            }
            sql.append(String.join(", ", groupCols));
        }

        // ORDER BY clause
        if (!sorts.isEmpty()) {
            sql.append(" ORDER BY ");
            List<String> sortClauses = new ArrayList<>();
            for (SortOp sort : sorts) {
                for (SortColumn col : sort.columns()) {
                    validateColumn(col.columnId(), allowedColumns);
                    sortClauses.add(quoteId(col.columnId()) + (col.ascending() ? " ASC" : " DESC"));
                }
            }
            sql.append(String.join(", ", sortClauses));
        }

        return new PreparedQuery(sql.toString(), params);
    }

    private static void appendGroupSelect(StringBuilder sql, List<GroupOp> groups, Set<String> allowedColumns) {
        List<String> selectClauses = new ArrayList<>();
        for (GroupOp group : groups) {
            if (group.groupingKey() != null) {
                validateColumn(group.groupingKey().sourceId(), allowedColumns);
                String alias = group.groupingKey().columnId() != null ? group.groupingKey().columnId() : group.groupingKey().sourceId();
                selectClauses.add(quoteId(group.groupingKey().sourceId()) + " AS " + quoteId(alias));
            }
            for (ResultColumn col : group.columns()) {
                validateColumn(col.sourceId(), allowedColumns);
                switch (col) {
                    case ResultColumn.Key k -> selectClauses.add(quoteId(k.sourceId()) + " AS " + quoteId(k.columnId()));
                    case ResultColumn.Select s -> selectClauses.add(quoteId(s.sourceId()) + " AS " + quoteId(s.columnId()));
                    case ResultColumn.Aggregate a -> selectClauses.add(aggregationSql(a.fn(), a.sourceId()) + " AS " + quoteId(a.columnId()));
                }
            }
        }
        sql.append(String.join(", ", selectClauses));
    }

    private static String aggregationSql(Aggregation agg, String sourceId) {
        String quoted = quoteId(sourceId);
        return switch (agg.fn()) {
            case "COUNT" -> "COUNT(" + quoted + ")";
            case "DISTINCT" -> "COUNT(DISTINCT " + quoted + ")";
            case "SUM" -> "SUM(" + quoted + ")";
            case "AVERAGE" -> "AVG(" + quoted + ")";
            case "MIN" -> "MIN(" + quoted + ")";
            case "MAX" -> "MAX(" + quoted + ")";
            case "JOIN" -> "STRING_AGG(" + quoted + ", '" + escapeSqlString(agg.separator() != null ? agg.separator() : ", ") + "')";
            case "DISTINCTJOIN" -> "STRING_AGG(DISTINCT " + quoted + ", '" + escapeSqlString(agg.separator() != null ? agg.separator() : ", ") + "')";
            default -> throw new IllegalArgumentException("Unsupported aggregation: " + agg.fn());
        };
    }

    private static void appendFilterExpression(StringBuilder sql, List<Object> params, FilterExpression expr, Set<String> allowedColumns) {
        switch (expr) {
            case FilterExpression.And and -> {
                sql.append("(");
                for (int i = 0; i < and.children().size(); i++) {
                    if (i > 0) sql.append(" AND ");
                    appendFilterExpression(sql, params, and.children().get(i), allowedColumns);
                }
                sql.append(")");
            }
            case FilterExpression.Or or -> {
                sql.append("(");
                for (int i = 0; i < or.children().size(); i++) {
                    if (i > 0) sql.append(" OR ");
                    appendFilterExpression(sql, params, or.children().get(i), allowedColumns);
                }
                sql.append(")");
            }
            case FilterExpression.Not not -> {
                sql.append("NOT (");
                appendFilterExpression(sql, params, not.child(), allowedColumns);
                sql.append(")");
            }
            case FilterExpression.Unresolved u -> {
                validateColumn(u.columnId(), allowedColumns);
                appendLeafFilter(sql, params, u.columnId(), u.fn(), u.args());
            }
            case FilterExpression.Numeric n -> {
                validateColumn(n.columnId(), allowedColumns);
                appendTypedFilter(sql, params, n.columnId(), n.filter());
            }
            case FilterExpression.StringLeaf s -> {
                validateColumn(s.columnId(), allowedColumns);
                appendTypedFilter(sql, params, s.columnId(), s.filter());
            }
            case FilterExpression.DateLeaf d -> {
                validateColumn(d.columnId(), allowedColumns);
                appendTypedFilter(sql, params, d.columnId(), d.filter());
            }
        }
    }

    private static void appendLeafFilter(StringBuilder sql, List<Object> params, String columnId, String fn, List<String> args) {
        String col = quoteId(columnId);
        switch (fn) {
            case "IS_NULL" -> sql.append(col).append(" IS NULL");
            case "NOT_NULL" -> sql.append(col).append(" IS NOT NULL");
            case "EQUALS_TO" -> { sql.append(col).append(" = ?"); params.add(args.get(0)); }
            case "NOT_EQUALS_TO" -> { sql.append(col).append(" <> ?"); params.add(args.get(0)); }
            case "LIKE_TO" -> { sql.append(col).append(" LIKE ?"); params.add(args.get(0)); }
            case "GREATER_THAN" -> { sql.append(col).append(" > ?"); params.add(args.get(0)); }
            case "GREATER_OR_EQUALS_TO" -> { sql.append(col).append(" >= ?"); params.add(args.get(0)); }
            case "LOWER_THAN" -> { sql.append(col).append(" < ?"); params.add(args.get(0)); }
            case "LOWER_OR_EQUALS_TO" -> { sql.append(col).append(" <= ?"); params.add(args.get(0)); }
            case "BETWEEN" -> { sql.append(col).append(" BETWEEN ? AND ?"); params.add(args.get(0)); params.add(args.get(1)); }
            case "IN" -> {
                sql.append(col).append(" IN (");
                sql.append(args.stream().map(a -> "?").collect(Collectors.joining(", ")));
                sql.append(")");
                params.addAll(args);
            }
            case "NOT_IN" -> {
                sql.append(col).append(" NOT IN (");
                sql.append(args.stream().map(a -> "?").collect(Collectors.joining(", ")));
                sql.append(")");
                params.addAll(args);
            }
            default -> throw new IllegalArgumentException("Unsupported filter function: " + fn);
        }
    }

    @SuppressWarnings("unchecked")
    private static void appendTypedFilter(StringBuilder sql, List<Object> params, String columnId, Map<String, Object> filter) {
        String fn = (String) filter.get("fn");
        String col = quoteId(columnId);
        switch (fn) {
            case "IS_NULL" -> sql.append(col).append(" IS NULL");
            case "NOT_NULL" -> sql.append(col).append(" IS NOT NULL");
            case "EQUALS_TO" -> { sql.append(col).append(" = ?"); params.add(filter.get("value")); }
            case "NOT_EQUALS_TO" -> { sql.append(col).append(" <> ?"); params.add(filter.get("value")); }
            case "LIKE_TO" -> {
                boolean caseSensitive = Boolean.TRUE.equals(filter.get("caseSensitive"));
                if (caseSensitive) {
                    sql.append(col).append(" LIKE ?");
                } else {
                    sql.append("LOWER(").append(col).append(") LIKE LOWER(?)");
                }
                params.add(filter.get("pattern"));
            }
            case "GREATER_THAN" -> { sql.append(col).append(" > ?"); params.add(filter.get("value")); }
            case "GREATER_OR_EQUALS_TO" -> { sql.append(col).append(" >= ?"); params.add(filter.get("value")); }
            case "LOWER_THAN" -> { sql.append(col).append(" < ?"); params.add(filter.get("value")); }
            case "LOWER_OR_EQUALS_TO" -> { sql.append(col).append(" <= ?"); params.add(filter.get("value")); }
            case "BETWEEN" -> {
                sql.append(col).append(" BETWEEN ? AND ?");
                params.add(filter.get("low"));
                params.add(filter.get("high"));
            }
            case "IN" -> {
                List<Object> values = (List<Object>) filter.get("values");
                sql.append(col).append(" IN (");
                sql.append(values.stream().map(v -> "?").collect(Collectors.joining(", ")));
                sql.append(")");
                params.addAll(values);
            }
            case "NOT_IN" -> {
                List<Object> values = (List<Object>) filter.get("values");
                sql.append(col).append(" NOT IN (");
                sql.append(values.stream().map(v -> "?").collect(Collectors.joining(", ")));
                sql.append(")");
                params.addAll(values);
            }
            default -> throw new IllegalArgumentException("Unsupported filter function: " + fn);
        }
    }

    static String quoteId(String identifier) {
        return "\"" + identifier.replace("\"", "\"\"") + "\"";
    }

    private static String escapeSqlString(String s) {
        return s.replace("'", "''");
    }

    private static void validateColumn(String columnId, Set<String> allowedColumns) {
        if (!allowedColumns.contains(columnId)) {
            throw new IllegalArgumentException("Column not in allowlist: " + columnId);
        }
    }
}
