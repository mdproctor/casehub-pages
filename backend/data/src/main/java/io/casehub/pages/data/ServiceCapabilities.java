package io.casehub.pages.data;

import java.util.List;

public record ServiceCapabilities(
        boolean serverSideQuery,
        List<String> dataProviders,
        boolean dataProxy,
        boolean serverSideCache) {}
