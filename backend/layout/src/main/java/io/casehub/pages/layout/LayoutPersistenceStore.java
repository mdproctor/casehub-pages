package io.casehub.pages.layout;

import java.util.Optional;

/**
 * SPI for layout persistence backends.
 * <p>
 * Implementations provide tenant-scoped, user-scoped storage for dashboard layouts.
 * The default implementation is {@link NoOpLayoutPersistenceStore} which returns
 * empty on load and no-ops on save/delete.
 */
public interface LayoutPersistenceStore {

    /**
     * Load a layout by key for a specific tenant and user.
     *
     * @param key      the layout key
     * @param tenantId the tenant identifier
     * @param userId   the user identifier
     * @return the layout payload as JSON string, or {@link Optional#empty()} if not found
     */
    Optional<String> load(String key, String tenantId, String userId);

    /**
     * Save a layout by key for a specific tenant and user.
     *
     * @param key      the layout key
     * @param tenantId the tenant identifier
     * @param userId   the user identifier
     * @param payload  the layout payload as JSON string
     */
    void save(String key, String tenantId, String userId, String payload);

    /**
     * Delete a layout by key for a specific tenant and user.
     *
     * @param key      the layout key
     * @param tenantId the tenant identifier
     * @param userId   the user identifier
     */
    void delete(String key, String tenantId, String userId);
}
