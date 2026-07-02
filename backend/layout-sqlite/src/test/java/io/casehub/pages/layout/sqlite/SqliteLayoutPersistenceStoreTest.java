package io.casehub.pages.layout.sqlite;

import io.casehub.pages.layout.LayoutPersistenceStore;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

@QuarkusTest
class SqliteLayoutPersistenceStoreTest {

    @Inject
    LayoutPersistenceStore store;

    @Test
    void roundTrip() {
        String key = "dashboard-1";
        String tenantId = "tenant-1";
        String userId = "user-1";
        String payload = "{\"layout\":[{\"id\":\"chart1\"}]}";

        store.save(key, tenantId, userId, payload);
        Optional<String> loaded = store.load(key, tenantId, userId);

        assertTrue(loaded.isPresent());
        assertEquals(payload, loaded.get());
    }

    @Test
    void loadMissingKeyReturnsEmpty() {
        Optional<String> loaded = store.load("missing-key", "tenant-1", "user-1");
        assertFalse(loaded.isPresent());
    }

    @Test
    void deleteRemovesLayout() {
        String key = "dashboard-delete";
        String tenantId = "tenant-1";
        String userId = "user-1";
        String payload = "{\"layout\":[]}";

        store.save(key, tenantId, userId, payload);
        store.delete(key, tenantId, userId);
        Optional<String> loaded = store.load(key, tenantId, userId);

        assertFalse(loaded.isPresent());
    }

    @Test
    void saveOverwritesExistingValue() {
        String key = "dashboard-upsert";
        String tenantId = "tenant-1";
        String userId = "user-1";
        String payload1 = "{\"layout\":[{\"id\":\"chart1\"}]}";
        String payload2 = "{\"layout\":[{\"id\":\"chart2\"}]}";

        store.save(key, tenantId, userId, payload1);
        store.save(key, tenantId, userId, payload2);
        Optional<String> loaded = store.load(key, tenantId, userId);

        assertTrue(loaded.isPresent());
        assertEquals(payload2, loaded.get());
    }

    @Test
    void tenantIsolation() {
        String key = "dashboard-tenant-test";
        String tenant1 = "tenant-1";
        String tenant2 = "tenant-2";
        String userId = "user-1";
        String payload1 = "{\"tenant\":\"1\"}";
        String payload2 = "{\"tenant\":\"2\"}";

        store.save(key, tenant1, userId, payload1);
        store.save(key, tenant2, userId, payload2);

        Optional<String> loaded1 = store.load(key, tenant1, userId);
        Optional<String> loaded2 = store.load(key, tenant2, userId);

        assertTrue(loaded1.isPresent());
        assertTrue(loaded2.isPresent());
        assertEquals(payload1, loaded1.get());
        assertEquals(payload2, loaded2.get());
    }

    @Test
    void userIsolation() {
        String key = "dashboard-user-test";
        String tenantId = "tenant-1";
        String user1 = "user-1";
        String user2 = "user-2";
        String payload1 = "{\"user\":\"1\"}";
        String payload2 = "{\"user\":\"2\"}";

        store.save(key, tenantId, user1, payload1);
        store.save(key, tenantId, user2, payload2);

        Optional<String> loaded1 = store.load(key, tenantId, user1);
        Optional<String> loaded2 = store.load(key, tenantId, user2);

        assertTrue(loaded1.isPresent());
        assertTrue(loaded2.isPresent());
        assertEquals(payload1, loaded1.get());
        assertEquals(payload2, loaded2.get());
    }
}
