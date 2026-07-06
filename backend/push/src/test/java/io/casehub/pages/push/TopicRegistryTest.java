package io.casehub.pages.push;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
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

    // Wildcard pattern validation tests (§2.2)
    @Test
    void isValidTopicOrPattern_exact_topic() {
        assertTrue(TopicRegistry.isValidTopicOrPattern("debate:abc"));
    }

    @Test
    void isValidTopicOrPattern_trailing_wildcard() {
        assertTrue(TopicRegistry.isValidTopicOrPattern("debate:*"));
    }

    @Test
    void isValidTopicOrPattern_match_all() {
        assertTrue(TopicRegistry.isValidTopicOrPattern("*"));
    }

    @Test
    void isValidTopicOrPattern_mid_wildcard() {
        // BREAKING CHANGE: mid-position * is now valid (segment wildcard)
        assertTrue(TopicRegistry.isValidTopicOrPattern("debate:*:sub"));
    }

    @Test
    void isValidTopicOrPattern_null() {
        assertFalse(TopicRegistry.isValidTopicOrPattern(null));
    }

    @Test
    void isValidTopicOrPattern_empty() {
        assertFalse(TopicRegistry.isValidTopicOrPattern(""));
    }

    @Test void isValidTopicOrPattern_segment_wildcard() {
        assertTrue(TopicRegistry.isValidTopicOrPattern("debate:*:summary"));
    }

    @Test void isValidTopicOrPattern_multi_segment_wildcard() {
        assertTrue(TopicRegistry.isValidTopicOrPattern("debate:*:*:summary"));
    }

    @Test void isValidTopicOrPattern_double_star_trailing() {
        assertTrue(TopicRegistry.isValidTopicOrPattern("debate:**"));
    }

    @Test void isValidTopicOrPattern_double_star_alone() {
        assertTrue(TopicRegistry.isValidTopicOrPattern("**"));
    }

    @Test void isValidTopicOrPattern_double_star_mid_position() {
        assertFalse(TopicRegistry.isValidTopicOrPattern("debate:**:summary"));
    }

    @Test void isValidTopicOrPattern_partial_wildcard() {
        assertFalse(TopicRegistry.isValidTopicOrPattern("de*bate"));
    }

    @Test void isValidTopicOrPattern_empty_segment() {
        assertFalse(TopicRegistry.isValidTopicOrPattern("debate::summary"));
    }

    @Test void isValidTopicOrPattern_leading_colon() {
        assertFalse(TopicRegistry.isValidTopicOrPattern(":debate"));
    }

    @Test void isValidTopicOrPattern_trailing_colon() {
        assertFalse(TopicRegistry.isValidTopicOrPattern("debate:"));
    }

    // === matches() tests ===

    @Test void matches_exact() {
        assertTrue(TopicRegistry.matches("debate:abc", "debate:abc"));
        assertFalse(TopicRegistry.matches("debate:abc", "debate:xyz"));
    }

    @Test void matches_single_star_one_segment() {
        assertTrue(TopicRegistry.matches("debate:*", "debate:abc"));
        assertFalse(TopicRegistry.matches("debate:*", "debate:abc:def"));
    }

    @Test void matches_single_star_mid_position() {
        assertTrue(TopicRegistry.matches("debate:*:summary", "debate:abc:summary"));
        assertFalse(TopicRegistry.matches("debate:*:summary", "debate:abc:def:summary"));
    }

    @Test void matches_multiple_single_stars() {
        assertTrue(TopicRegistry.matches("a:*:b:*:c", "a:x:b:y:c"));
        assertFalse(TopicRegistry.matches("a:*:b:*:c", "a:x:b:y:z"));
    }

    @Test void matches_double_star_any_depth() {
        assertTrue(TopicRegistry.matches("debate:**", "debate:abc"));
        assertTrue(TopicRegistry.matches("debate:**", "debate:abc:def:ghi"));
    }

    @Test void matches_double_star_zero_segments() {
        assertTrue(TopicRegistry.matches("debate:**", "debate"));
    }

    @Test void matches_double_star_prefix_too_short() {
        assertFalse(TopicRegistry.matches("a:b:**", "a"));
    }

    @Test void matches_bare_star_one_segment() {
        assertTrue(TopicRegistry.matches("*", "hello"));
        assertFalse(TopicRegistry.matches("*", "hello:world"));
    }

    @Test void matches_bare_double_star() {
        assertTrue(TopicRegistry.matches("**", "anything"));
        assertTrue(TopicRegistry.matches("**", "a:b:c:d"));
    }

    // Wildcard matching tests (§2.3) — updated for new semantics
    @Test
    void connections_wildcard_match() {
        // BREAKING CHANGE: "debate:**" for multi-depth, "debate:*" for single segment
        TopicRegistry reg = new TopicRegistry();
        reg.listen("conn-1", List.of("debate:**"));
        assertEquals(Set.of("conn-1"), reg.connections("debate:abc"));
        assertEquals(Set.of("conn-1"), reg.connections("debate:xyz"));
        assertEquals(Set.of("conn-1"), reg.connections("debate:room:123"));
    }

    @Test
    void connections_wildcard_plus_exact_union() {
        TopicRegistry reg = new TopicRegistry();
        reg.listen("conn-1", List.of("debate:*"));
        reg.listen("conn-2", List.of("debate:abc"));
        assertEquals(Set.of("conn-1", "conn-2"), reg.connections("debate:abc"));
        assertEquals(Set.of("conn-1"), reg.connections("debate:xyz"));
    }

    @Test
    void connections_match_all_wildcard() {
        // BREAKING CHANGE: "**" for match-all across depths
        TopicRegistry reg = new TopicRegistry();
        reg.listen("conn-1", List.of("**"));
        assertEquals(Set.of("conn-1"), reg.connections("debate:abc"));
        assertEquals(Set.of("conn-1"), reg.connections("file:/x"));
        assertEquals(Set.of("conn-1"), reg.connections("anything"));
    }

    @Test
    void unlisten_wildcard() {
        TopicRegistry reg = new TopicRegistry();
        reg.listen("conn-1", List.of("debate:*"));
        assertEquals(Set.of("conn-1"), reg.connections("debate:abc"));
        reg.unlisten("conn-1", List.of("debate:*"));
        assertTrue(reg.connections("debate:abc").isEmpty());
    }

    @Test
    void removeConnection_cleans_wildcards() {
        TopicRegistry reg = new TopicRegistry();
        reg.listen("conn-1", List.of("debate:*", "file:*"));
        reg.removeConnection("conn-1");
        assertTrue(reg.connections("debate:abc").isEmpty());
        assertTrue(reg.connections("file:/x").isEmpty());
    }

    // === connections() with new wildcards ===

    @Test
    void connections_segment_wildcard() {
        var registry = new TopicRegistry();
        registry.listen("c1", List.of("debate:*:summary"));
        assertThat(registry.connections("debate:abc:summary")).containsExactly("c1");
        assertThat(registry.connections("debate:abc:details")).isEmpty();
        assertThat(registry.connections("debate:abc:def:summary")).isEmpty();
    }

    @Test
    void connections_double_star_wildcard() {
        var registry = new TopicRegistry();
        registry.listen("c1", List.of("debate:**"));
        assertThat(registry.connections("debate:abc")).containsExactly("c1");
        assertThat(registry.connections("debate:abc:def")).containsExactly("c1");
        assertThat(registry.connections("debate")).containsExactly("c1");
        assertThat(registry.connections("other:topic")).isEmpty();
    }

    @Test
    void connections_single_star_no_longer_matches_depth() {
        // BREAKING CHANGE: * now matches one segment only
        var registry = new TopicRegistry();
        registry.listen("c1", List.of("debate:*"));
        assertThat(registry.connections("debate:abc")).containsExactly("c1");
        assertThat(registry.connections("debate:abc:def")).isEmpty(); // was matching before
    }

    // matchedTopics tests (§2.4)
    @Test
    void matchedTopics_returns_matching_concrete_topics() {
        TopicRegistry reg = new TopicRegistry();
        reg.listen("conn-1", List.of("debate:abc"));
        reg.listen("conn-2", List.of("debate:xyz"));
        reg.listen("conn-3", List.of("file:/x"));

        Set<String> matched = reg.matchedTopics("debate:*");
        assertEquals(Set.of("debate:abc", "debate:xyz"), matched);
    }

    @Test
    void matchedTopics_match_all() {
        // BREAKING CHANGE: "**" for match-all across depths
        TopicRegistry reg = new TopicRegistry();
        reg.listen("conn-1", List.of("debate:abc"));
        reg.listen("conn-2", List.of("file:/x"));

        Set<String> matched = reg.matchedTopics("**");
        assertEquals(Set.of("debate:abc", "file:/x"), matched);
    }

    @Test
    void matchedTopics_exact_pattern() {
        TopicRegistry reg = new TopicRegistry();
        reg.listen("conn-1", List.of("debate:abc"));
        reg.listen("conn-2", List.of("debate:xyz"));

        Set<String> matched = reg.matchedTopics("debate:abc");
        assertEquals(Set.of("debate:abc"), matched);
    }

    @Test
    void matchedTopics_no_matches() {
        TopicRegistry reg = new TopicRegistry();
        reg.listen("conn-1", List.of("file:/x"));

        Set<String> matched = reg.matchedTopics("debate:*");
        assertTrue(matched.isEmpty());
    }

    // === matchedTopics() with new wildcards ===

    @Test
    void matchedTopics_segment_wildcard() {
        var registry = new TopicRegistry();
        registry.listen("c1", List.of("debate:abc:summary"));
        registry.listen("c2", List.of("debate:xyz:details"));
        assertThat(registry.matchedTopics("debate:*:summary"))
            .containsExactly("debate:abc:summary");
    }

    @Test
    void matchedTopics_double_star() {
        var registry = new TopicRegistry();
        registry.listen("c1", List.of("debate:abc"));
        registry.listen("c2", List.of("debate:xyz:deep"));
        registry.listen("c3", List.of("other:topic"));
        assertThat(registry.matchedTopics("debate:**"))
            .containsExactlyInAnyOrder("debate:abc", "debate:xyz:deep");
    }

    @Test
    void matchedTopics_double_star_zero_match() {
        var registry = new TopicRegistry();
        registry.listen("c1", List.of("debate"));
        registry.listen("c2", List.of("debate:abc"));
        assertThat(registry.matchedTopics("debate:**"))
            .containsExactlyInAnyOrder("debate", "debate:abc");
    }

    // Thread safety with wildcards
    @Test
    void concurrent_listen_unlisten_wildcards_does_not_corrupt() throws Exception {
        // BREAKING CHANGE: "debate:**" for multi-depth matching
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
                        reg.listen(connId, List.of("debate:**", "topic-" + connId));
                        reg.connections("debate:abc");
                        reg.connections("topic-" + connId);
                        reg.unlisten(connId, List.of("topic-" + connId));
                    }
                } finally {
                    latch.countDown();
                }
            });
        }

        assertTrue(latch.await(10, TimeUnit.SECONDS));
        executor.shutdown();
        assertEquals(threads, reg.connections("debate:anything").size());
    }
}
