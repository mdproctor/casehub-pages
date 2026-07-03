package io.casehub.pages.data;

import java.util.List;

public record SortOp(List<SortColumn> columns) implements DataSetOp {}
