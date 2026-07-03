package io.casehub.pages.data;

import java.util.List;

public record DataSetResult(List<ColumnDef> columns, List<List<String>> rows) {}
