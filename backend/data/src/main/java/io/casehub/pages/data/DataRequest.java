package io.casehub.pages.data;

import java.util.Map;

public record DataRequest(
    String url,
    String method,
    Map<String, String> headers,
    Map<String, String> query,
    Map<String, String> form,
    String body
) {}
