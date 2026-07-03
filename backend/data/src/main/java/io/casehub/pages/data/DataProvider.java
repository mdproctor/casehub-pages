package io.casehub.pages.data;

public interface DataProvider {
    String type();
    boolean canHandle(String dataSetId);
    DataSetResult query(DataSetLookup lookup);
}
