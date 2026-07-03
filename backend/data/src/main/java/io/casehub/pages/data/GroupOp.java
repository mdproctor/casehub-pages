package io.casehub.pages.data;

import java.util.List;

public record GroupOp(
    GroupingKey groupingKey,
    List<ResultColumn> columns,
    List<String> selectedIntervals,
    Boolean join
) implements DataSetOp {}
