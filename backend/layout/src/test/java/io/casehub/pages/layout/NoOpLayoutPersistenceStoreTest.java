package io.casehub.pages.layout;

import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

@QuarkusTest
class NoOpLayoutPersistenceStoreTest {

    @Inject
    LayoutPersistenceStore store;

    @Test
    void load_returns_empty() {
        Optional<String> result = store.load("test-key", "tenant-1", "user-1");
        assertTrue(result.isEmpty(), "NoOp store should return Optional.empty()");
    }

    @Test
    void save_is_noop() {
        // Should not throw
        assertDoesNotThrow(() -> store.save("test-key", "tenant-1", "user-1", "{\"data\":\"test\"}"));
    }

    @Test
    void delete_is_noop() {
        // Should not throw
        assertDoesNotThrow(() -> store.delete("test-key", "tenant-1", "user-1"));
    }
}
