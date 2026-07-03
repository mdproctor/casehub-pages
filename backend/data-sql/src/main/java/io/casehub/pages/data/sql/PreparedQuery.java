package io.casehub.pages.data.sql;

import java.util.List;

public record PreparedQuery(String sql, List<Object> params) {}
