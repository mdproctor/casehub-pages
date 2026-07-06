package io.casehub.pages.push;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;

public final class TopicRegistry {

    private static final class TrieNode {
        final ConcurrentHashMap<String, TrieNode> children = new ConcurrentHashMap<>();
        final CopyOnWriteArraySet<String> connections = new CopyOnWriteArraySet<>();
        final CopyOnWriteArraySet<String> doubleStarConnections = new CopyOnWriteArraySet<>();
    }

    private final TrieNode root = new TrieNode();
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
            insertIntoTrie(connectionId, topic);
            connTopics.add(topic);
        }
    }

    public void unlisten(String connectionId, List<String> topics) {
        for (String topic : topics) {
            removeFromTrie(connectionId, topic);
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
                removeFromTrie(connectionId, topic);
            }
        }
    }

    /**
     * Returns all connection IDs listening to a concrete topic.
     * Walks the trie, collecting connections from exact matches,
     * single-segment wildcards ({@code *}), and multi-segment
     * wildcards ({@code **}) at each level.
     */
    public Set<String> connections(String topic) {
        Set<String> result = new HashSet<>();
        String[] segments = topic.split(":", -1);
        walkConnections(root, segments, 0, result);
        return Set.copyOf(result);
    }

    /**
     * Returns all concrete topics (from the trie) that match the given pattern.
     * Useful for introspection — what topics would a wildcard pattern match?
     */
    public Set<String> matchedTopics(String pattern) {
        if (!pattern.contains("*")) {
            return hasExactTopic(pattern) ? Set.of(pattern) : Set.of();
        }

        Set<String> result = new HashSet<>();
        String[] segments = pattern.split(":", -1);
        walkMatchedTopics(root, segments, 0, new ArrayList<>(), result);
        return Set.copyOf(result);
    }

    private void insertIntoTrie(String connectionId, String pattern) {
        String[] segments = pattern.split(":", -1);
        TrieNode current = root;
        for (String segment : segments) {
            if ("**".equals(segment)) {
                current.doubleStarConnections.add(connectionId);
                return;
            }
            current = current.children.computeIfAbsent(segment, k -> new TrieNode());
        }
        current.connections.add(connectionId);
    }

    private void removeFromTrie(String connectionId, String pattern) {
        String[] segments = pattern.split(":", -1);
        TrieNode current = root;
        for (String segment : segments) {
            if ("**".equals(segment)) {
                current.doubleStarConnections.remove(connectionId);
                return;
            }
            TrieNode child = current.children.get(segment);
            if (child == null) return;
            current = child;
        }
        current.connections.remove(connectionId);
    }

    private void walkConnections(TrieNode node, String[] segments, int depth, Set<String> result) {
        result.addAll(node.doubleStarConnections);

        if (depth == segments.length) {
            result.addAll(node.connections);
            return;
        }

        String segment = segments[depth];

        TrieNode exactChild = node.children.get(segment);
        if (exactChild != null) {
            walkConnections(exactChild, segments, depth + 1, result);
        }

        TrieNode starChild = node.children.get("*");
        if (starChild != null) {
            walkConnections(starChild, segments, depth + 1, result);
        }
    }

    private boolean hasExactTopic(String topic) {
        String[] segments = topic.split(":", -1);
        TrieNode current = root;
        for (String segment : segments) {
            TrieNode child = current.children.get(segment);
            if (child == null) return false;
            current = child;
        }
        return !current.connections.isEmpty();
    }

    private void walkMatchedTopics(TrieNode node, String[] segments, int depth,
                                    List<String> path, Set<String> result) {
        if (depth == segments.length) {
            if (!node.connections.isEmpty()) {
                result.add(String.join(":", path));
            }
            return;
        }

        String segment = segments[depth];

        if ("**".equals(segment)) {
            collectAllDescendantTopics(node, path, result);
            return;
        }

        if ("*".equals(segment)) {
            for (var entry : node.children.entrySet()) {
                if (!"*".equals(entry.getKey())) {
                    List<String> childPath = new ArrayList<>(path);
                    childPath.add(entry.getKey());
                    walkMatchedTopics(entry.getValue(), segments, depth + 1, childPath, result);
                }
            }
            return;
        }

        TrieNode exactChild = node.children.get(segment);
        if (exactChild != null) {
            List<String> childPath = new ArrayList<>(path);
            childPath.add(segment);
            walkMatchedTopics(exactChild, segments, depth + 1, childPath, result);
        }
    }

    private void collectAllDescendantTopics(TrieNode node, List<String> path, Set<String> result) {
        if (!node.connections.isEmpty()) {
            result.add(String.join(":", path));
        }
        for (var entry : node.children.entrySet()) {
            if (!"*".equals(entry.getKey())) {
                List<String> childPath = new ArrayList<>(path);
                childPath.add(entry.getKey());
                collectAllDescendantTopics(entry.getValue(), childPath, result);
            }
        }
    }
}
