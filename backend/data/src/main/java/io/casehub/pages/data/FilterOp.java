package io.casehub.pages.data;

import java.util.List;

public record FilterOp(List<FilterExpression> expressions) implements DataSetOp {}
