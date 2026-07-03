package io.casehub.pages.data.sql;

import org.junit.jupiter.api.Test;

import java.sql.Types;

import static org.assertj.core.api.Assertions.assertThat;

class ResultSetMapperTest {

    // ── Integer types → NUMBER ───────────────────────────────────────

    @Test
    void mapsIntegerToNumber() {
        assertThat(ResultSetMapper.mapSqlType(Types.INTEGER)).isEqualTo("NUMBER");
    }

    @Test
    void mapsBigintToNumber() {
        assertThat(ResultSetMapper.mapSqlType(Types.BIGINT)).isEqualTo("NUMBER");
    }

    @Test
    void mapsSmallintToNumber() {
        assertThat(ResultSetMapper.mapSqlType(Types.SMALLINT)).isEqualTo("NUMBER");
    }

    @Test
    void mapsTinyintToNumber() {
        assertThat(ResultSetMapper.mapSqlType(Types.TINYINT)).isEqualTo("NUMBER");
    }

    // ── Floating-point types → NUMBER ────────────────────────────────

    @Test
    void mapsDoubleToNumber() {
        assertThat(ResultSetMapper.mapSqlType(Types.DOUBLE)).isEqualTo("NUMBER");
    }

    @Test
    void mapsFloatToNumber() {
        assertThat(ResultSetMapper.mapSqlType(Types.FLOAT)).isEqualTo("NUMBER");
    }

    @Test
    void mapsDecimalToNumber() {
        assertThat(ResultSetMapper.mapSqlType(Types.DECIMAL)).isEqualTo("NUMBER");
    }

    @Test
    void mapsNumericToNumber() {
        assertThat(ResultSetMapper.mapSqlType(Types.NUMERIC)).isEqualTo("NUMBER");
    }

    @Test
    void mapsRealToNumber() {
        assertThat(ResultSetMapper.mapSqlType(Types.REAL)).isEqualTo("NUMBER");
    }

    // ── Date/time types → DATE ───────────────────────────────────────

    @Test
    void mapsDateToDate() {
        assertThat(ResultSetMapper.mapSqlType(Types.DATE)).isEqualTo("DATE");
    }

    @Test
    void mapsTimestampToDate() {
        assertThat(ResultSetMapper.mapSqlType(Types.TIMESTAMP)).isEqualTo("DATE");
    }

    @Test
    void mapsTimestampWithTimezoneToDate() {
        assertThat(ResultSetMapper.mapSqlType(Types.TIMESTAMP_WITH_TIMEZONE)).isEqualTo("DATE");
    }

    @Test
    void mapsTimeToDate() {
        assertThat(ResultSetMapper.mapSqlType(Types.TIME)).isEqualTo("DATE");
    }

    // ── Large text types → TEXT ──────────────────────────────────────

    @Test
    void mapsClobToText() {
        assertThat(ResultSetMapper.mapSqlType(Types.CLOB)).isEqualTo("TEXT");
    }

    @Test
    void mapsLongVarcharToText() {
        assertThat(ResultSetMapper.mapSqlType(Types.LONGVARCHAR)).isEqualTo("TEXT");
    }

    @Test
    void mapsNclobToText() {
        assertThat(ResultSetMapper.mapSqlType(Types.NCLOB)).isEqualTo("TEXT");
    }

    // ── Default → LABEL ──────────────────────────────────────────────

    @Test
    void mapsVarcharToLabel() {
        assertThat(ResultSetMapper.mapSqlType(Types.VARCHAR)).isEqualTo("LABEL");
    }

    @Test
    void mapsCharToLabel() {
        assertThat(ResultSetMapper.mapSqlType(Types.CHAR)).isEqualTo("LABEL");
    }

    @Test
    void mapsBooleanToLabel() {
        assertThat(ResultSetMapper.mapSqlType(Types.BOOLEAN)).isEqualTo("LABEL");
    }
}
