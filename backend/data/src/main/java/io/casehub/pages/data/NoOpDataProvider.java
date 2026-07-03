package io.casehub.pages.data;

import io.quarkus.arc.DefaultBean;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;

@DefaultBean
@ApplicationScoped
public class NoOpDataProvider implements DataProvider {
    @Override
    public String type() {
        return "noop";
    }

    @Override
    public boolean canHandle(String dataSetId) {
        return false;
    }

    @Override
    public DataSetResult query(DataSetLookup lookup) {
        return new DataSetResult(List.of(), List.of());
    }
}
