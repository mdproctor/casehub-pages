package io.casehub.pages.push;

import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;

public final class TopicRegistry {

    private final ConcurrentHashMap<String, CopyOnWriteArraySet<String>> topicToConnections = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Set<String>> connectionToTopics = new ConcurrentHashMap<>();

    public void listen(String connectionId, List<String> topics) {
        Set<String> connTopics = connectionToTopics.computeIfAbsent(connectionId,
                k -> ConcurrentHashMap.newKeySet());
        for (String topic : topics) {
            topicToConnections.computeIfAbsent(topic, k -> new CopyOnWriteArraySet<>()).add(connectionId);
            connTopics.add(topic);
        }
    }

    public void unlisten(String connectionId, List<String> topics) {
        for (String topic : topics) {
            CopyOnWriteArraySet<String> conns = topicToConnections.get(topic);
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
                CopyOnWriteArraySet<String> conns = topicToConnections.get(topic);
                if (conns != null) {
                    conns.remove(connectionId);
                }
            }
        }
    }

    public Set<String> connections(String topic) {
        CopyOnWriteArraySet<String> conns = topicToConnections.get(topic);
        return conns != null ? Set.copyOf(conns) : Set.of();
    }
}
