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
     * <p>Valid patterns:
     * <ul>
     *   <li>Exact topics with no wildcards</li>
     *   <li>{@code *} as a whole segment — matches exactly one segment</li>
     *   <li>{@code **} as the last segment — matches zero or more segments</li>
     * </ul>
     * Invalid: null, empty, partial wildcards (e.g. "de*bate"), empty segments,
     * {@code **} in non-trailing position.
     */
    public static boolean isValidTopicOrPattern(String topic) {
        if (topic == null || topic.isEmpty()) return false;
        String[] segments = topic.split(":", -1);
        for (int i = 0; i < segments.length; i++) {
            String s = segments[i];
            if (s.isEmpty()) return false;
            if ("**".equals(s)) return i == segments.length - 1;
            if (s.contains("*") && !"*".equals(s)) return false;
        }
        return true;
    }

    /**
     * Tests whether a concrete topic matches a pattern.
     * <ul>
     *   <li>{@code *} in a pattern segment matches exactly one topic segment</li>
     *   <li>{@code **} as the last pattern segment matches zero or more trailing segments</li>
     *   <li>All other segments must match exactly</li>
     * </ul>
     */
    public static boolean matches(String pattern, String topic) {
        String[] ps = pattern.split(":", -1);
        String[] ts = topic.split(":", -1);

        if (ps[ps.length - 1].equals("**")) {
            if (ts.length < ps.length - 1) return false;
            for (int i = 0; i < ps.length - 1; i++) {
                if (!"*".equals(ps[i]) && !ps[i].equals(ts[i])) return false;
            }
            return true;
        }

        if (ps.length != ts.length) return false;
        for (int i = 0; i < ps.length; i++) {
            if ("*".equals(ps[i])) continue;
            if (!ps[i].equals(ts[i])) return false;
        }
        return true;
    }

    public void listen(String connectionId, List<String> topics) {
        Set<String> connTopics = connectionToTopics.computeIfAbsent(connectionId,
                k -> ConcurrentHashMap.newKeySet());
        for (String topic : topics) {
            if (topic.contains("*")) {
                wildcardPatterns.computeIfAbsent(topic, k -> new CopyOnWriteArraySet<>()).add(connectionId);
            } else {
                exactTopics.computeIfAbsent(topic, k -> new CopyOnWriteArraySet<>()).add(connectionId);
            }
            connTopics.add(topic);
        }
    }

    public void unlisten(String connectionId, List<String> topics) {
        for (String topic : topics) {
            CopyOnWriteArraySet<String> conns = topic.contains("*")
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
                CopyOnWriteArraySet<String> conns = topic.contains("*")
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

        // Wildcard pattern match
        for (var entry : wildcardPatterns.entrySet()) {
            if (matches(entry.getKey(), topic)) {
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
        if (!pattern.contains("*")) {
            // Exact pattern — return it if it exists
            return exactTopics.containsKey(pattern) ? Set.of(pattern) : Set.of();
        }

        Set<String> matched = new HashSet<>();
        for (String topic : exactTopics.keySet()) {
            if (matches(pattern, topic)) {
                matched.add(topic);
            }
        }
        return Set.copyOf(matched);
    }
}
