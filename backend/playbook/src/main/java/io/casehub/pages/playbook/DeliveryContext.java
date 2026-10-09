package io.casehub.pages.playbook;

import java.util.Map;

public interface DeliveryContext {
    String config(String key);
    String resolve(String template);
    Map<String, Object> resolveMap(Map<String, Object> data);

    default String executionId() {
        return null;
    }
}
