package io.casehub.pages.data;

import java.util.List;

public record DataSetLookup(String dataSetId, List<DataSetOp> operations) {}
