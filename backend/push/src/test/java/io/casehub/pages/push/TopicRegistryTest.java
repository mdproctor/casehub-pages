package io.casehub.pages.push;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

class TopicRegistryTest {

    @Test
    void listen_registers_connection_for_topic() {
        TopicRegistry reg = new TopicRegistry();
        reg.listen("conn-1", List.of("debate:abc"));
        assertEquals(Set.of("conn-1"), reg.connections("debate:abc"));
    }

    @Test
    void listen_multiple_topics() {
        TopicRegistry reg = new TopicRegistry();
        reg.listen("conn-1", List.of("debate:abc", "file:/x"));
        assertEquals(Set.of("conn-1"), reg.connections("debate:abc"));
        assertEquals(Set.of("conn-1"), reg.connections("file:/x"));
    }

    @Test
    void multiple_connections_same_topic() {
        TopicRegistry reg = new TopicRegistry();
        reg.listen("conn-1", List.of("debate:abc"));
        reg.listen("conn-2", List.of("debate:abc"));
        assertEquals(Set.of("conn-1", "conn-2"), reg.connections("debate:abc"));
    }

    @Test
    void unlisten_removes_connection_from_topic() {
        TopicRegistry reg = new TopicRegistry();
        reg.listen("conn-1", List.of("debate:abc", "file:/x"));
        reg.unlisten("conn-1", List.of("debate:abc"));
        assertTrue(reg.connections("debate:abc").isEmpty());
        assertEquals(Set.of("conn-1"), reg.connections("file:/x"));
    }

    @Test
    void removeConnection_cleans_up_all_topics() {
        TopicRegistry reg = new TopicRegistry();
        reg.listen("conn-1", List.of("debate:abc", "file:/x", "chat:lobby"));
        reg.removeConnection("conn-1");
        assertTrue(reg.connections("debate:abc").isEmpty());
        assertTrue(reg.connections("file:/x").isEmpty());
        assertTrue(reg.connections("chat:lobby").isEmpty());
    }

    @Test
    void connections_returns_unmodifiable_snapshot() {
        TopicRegistry reg = new TopicRegistry();
        reg.listen("conn-1", List.of("topic"));
        Set<String> snapshot = reg.connections("topic");
        reg.listen("conn-2", List.of("topic"));
        assertEquals(1, snapshot.size());
        assertEquals(2, reg.connections("topic").size());
    }

    @Test
    void connections_unknown_topic_returns_empty() {
        TopicRegistry reg = new TopicRegistry();
        assertTrue(reg.connections("nonexistent").isEmpty());
    }

    @Test
    void concurrent_listen_unlisten_does_not_corrupt() throws Exception {
        TopicRegistry reg = new TopicRegistry();
        int threads = 8;
        int opsPerThread = 1000;
        CountDownLatch latch = new CountDownLatch(threads);
        ExecutorService executor = Executors.newFixedThreadPool(threads);

        for (int t = 0; t < threads; t++) {
            final String connId = "conn-" + t;
            executor.submit(() -> {
                try {
                    for (int i = 0; i < opsPerThread; i++) {
                        reg.listen(connId, List.of("shared-topic", "topic-" + connId));
                        reg.connections("shared-topic");
                        reg.unlisten(connId, List.of("topic-" + connId));
                    }
                } finally {
                    latch.countDown();
                }
            });
        }

        assertTrue(latch.await(10, TimeUnit.SECONDS));
        executor.shutdown();
        assertEquals(threads, reg.connections("shared-topic").size());
    }

    @Test
    void unlisten_all_topics_cleans_up_connection_entry() {
        TopicRegistry reg = new TopicRegistry();
        reg.listen("conn-1", List.of("topic-a", "topic-b"));
        reg.unlisten("conn-1", List.of("topic-a", "topic-b"));
        // After unlisten all, connection should be fully cleaned up
        // Re-listen to verify no stale state
        reg.listen("conn-1", List.of("topic-c"));
        assertEquals(Set.of("conn-1"), reg.connections("topic-c"));
        assertTrue(reg.connections("topic-a").isEmpty());
    }
}
