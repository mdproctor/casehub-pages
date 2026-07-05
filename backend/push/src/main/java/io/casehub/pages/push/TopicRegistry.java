package io.casehub.pages.push;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;

public final class TopicRegistry {

    private final ConcurrentHashMap<String, CopyOnWriteArraySet<String>> exactTopics = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, CopyOnWriteArraySet<String>> wildcardPatterns = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Set<String>> connectionToTopics = new ConcurrentHashMap<>();

    /**
     * Validates a topic name or pattern.
     * Valid patterns: exact topics (no wildcard) or trailing wildcard only.
     * Invalid: null, empty, mid-wildcard (e.g., "debate:*:sub").
     */
    public static boolean isValidTopicOrPattern(String topic) {
        if (topic == null || topic.isEmpty()) {
            return false;
        }
        int starIdx = topic.indexOf('*');
        return starIdx == -1 || starIdx == topic.length() - 1;
    }

    public void listen(String connectionId, List<String> topics) {
        Set<String> connTopics = connectionToTopics.computeIfAbsent(connectionId,
                k -> ConcurrentHashMap.newKeySet());
        for (String topic : topics) {
            if (topic.endsWith("*")) {
                wildcardPatterns.computeIfAbsent(topic, k -> new CopyOnWriteArraySet<>()).add(connectionId);
            } else {
                exactTopics.computeIfAbsent(topic, k -> new CopyOnWriteArraySet<>()).add(connectionId);
            }
            connTopics.add(topic);
        }
    }

    public void unlisten(String connectionId, List<String> topics) {
        for (String topic : topics) {
            CopyOnWriteArraySet<String> conns = topic.endsWith("*")
                    ? wildcardPatterns.get(topic)
                    : exactTopics.get(topic);
            if (conns != null) {
                conns.remove(connectionId);
            }
        }
        Set<String> connTopics = connectionToTopics.get(connectionId);
        if (connTopics != null) {
            connTopics.removeAll(topics);
            if (connTopics.isEmpty()) {
                connectionToTopics.remove(connectionId);
            }
        }
    }

    public void removeConnection(String connectionId) {
        Set<String> topics = connectionToTopics.remove(connectionId);
        if (topics != null) {
            for (String topic : topics) {
                CopyOnWriteArraySet<String> conns = topic.endsWith("*")
                        ? wildcardPatterns.get(topic)
                        : exactTopics.get(topic);
                if (conns != null) {
                    conns.remove(connectionId);
                }
            }
        }
    }

    /**
     * Returns all connection IDs listening to a concrete topic.
     * Checks both exact matches and wildcard patterns.
     */
    public Set<String> connections(String topic) {
        Set<String> result = new HashSet<>();

        // Exact match
        CopyOnWriteArraySet<String> exactConns = exactTopics.get(topic);
        if (exactConns != null) {
            result.addAll(exactConns);
        }

        // Wildcard prefix match
        for (var entry : wildcardPatterns.entrySet()) {
            String pattern = entry.getKey();
            String prefix = pattern.substring(0, pattern.length() - 1); // Remove trailing *
            if (topic.startsWith(prefix)) {
                result.addAll(entry.getValue());
            }
        }

        return Set.copyOf(result);
    }

    /**
     * Returns all concrete topics (from exactTopics) that match the given pattern.
     * Useful for introspection — what topics would a wildcard pattern match?
     */
    public Set<String> matchedTopics(String pattern) {
        if (!pattern.endsWith("*")) {
            // Exact pattern — return it if it exists
            return exactTopics.containsKey(pattern) ? Set.of(pattern) : Set.of();
        }

        String prefix = pattern.substring(0, pattern.length() - 1); // Remove trailing *
        Set<String> matched = new HashSet<>();
        for (String topic : exactTopics.keySet()) {
            if (topic.startsWith(prefix)) {
                matched.add(topic);
            }
        }
        return Set.copyOf(matched);
    }
}
