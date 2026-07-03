package io.casehub.pages.data.sql;

import io.casehub.pages.data.ColumnDef;
import io.casehub.pages.data.DataSetResult;

import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Types;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

public final class ResultSetMapper {

    private ResultSetMapper() {}

    public static DataSetResult toDataSetResult(ResultSet rs) throws SQLException {
        ResultSetMetaData meta = rs.getMetaData();
        int columnCount = meta.getColumnCount();

        List<ColumnDef> columns = new ArrayList<>();
        for (int i = 1; i <= columnCount; i++) {
            String id = meta.getColumnLabel(i);
            String name = meta.getColumnLabel(i);
            String type = mapSqlType(meta.getColumnType(i));
            columns.add(new ColumnDef(id, name, type));
        }

        List<List<String>> rows = new ArrayList<>();
        while (rs.next()) {
            List<String> row = new ArrayList<>();
            for (int i = 1; i <= columnCount; i++) {
                Object val = rs.getObject(i);
                row.add(val == null ? null : val.toString());
            }
            rows.add(row);
        }

        return new DataSetResult(columns, rows);
    }

    public static Set<String> extractColumnNames(ResultSet rs) throws SQLException {
        ResultSetMetaData meta = rs.getMetaData();
        Set<String> names = new LinkedHashSet<>();
        for (int i = 1; i <= meta.getColumnCount(); i++) {
            names.add(meta.getColumnLabel(i));
        }
        return names;
    }

    static String mapSqlType(int sqlType) {
        return switch (sqlType) {
            case Types.INTEGER, Types.BIGINT, Types.SMALLINT, Types.TINYINT,
                 Types.FLOAT, Types.DOUBLE, Types.DECIMAL, Types.NUMERIC,
                 Types.REAL -> "NUMBER";
            case Types.DATE, Types.TIMESTAMP, Types.TIMESTAMP_WITH_TIMEZONE,
                 Types.TIME, Types.TIME_WITH_TIMEZONE -> "DATE";
            case Types.CLOB, Types.LONGVARCHAR, Types.NCLOB -> "TEXT";
            default -> "LABEL";
        };
    }
}
