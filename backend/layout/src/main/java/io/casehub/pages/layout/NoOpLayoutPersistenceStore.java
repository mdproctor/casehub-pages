package io.casehub.pages.layout;

import io.quarkus.arc.DefaultBean;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.Optional;

/**
 * Default no-op implementation of {@link LayoutPersistenceStore}.
 * <p>
 * This bean is active when no other {@link LayoutPersistenceStore} bean is provided.
 * It returns {@link Optional#empty()} on load and performs no operations on save/delete.
 */
@DefaultBean
@ApplicationScoped
public class NoOpLayoutPersistenceStore implements LayoutPersistenceStore {

    @Override
    public Optional<String> load(String key, String tenantId, String userId) {
        return Optional.empty();
    }

    @Override
    public void save(String key, String tenantId, String userId, String payload) {
        // no-op
    }

    @Override
    public void delete(String key, String tenantId, String userId) {
        // no-op
    }
}
