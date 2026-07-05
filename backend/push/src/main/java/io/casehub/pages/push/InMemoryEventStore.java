package io.casehub.pages.push;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Default EventStore implementation using bounded ring buffers per topic.
 * <p>
 * Each topic has an independent sequence counter and a bounded deque. When the
 * buffer reaches {@code maxEventsPerTopic}, the oldest event is evicted on the
 * next append. Topics remain listed by {@link #topics()} even after all events
 * are evicted.
 * <p>
 * Thread safety: Per-topic locks protect append/replay operations. Concurrent
 * operations on different topics proceed without contention.
 * <p>
 * Per §3.2 of 2026-07-05 tokens-and-push-protocol-maturation-design spec.
 */
public final class InMemoryEventStore implements EventStore {
    private final int maxEventsPerTopic;
    private final ConcurrentHashMap<String, TopicBuffer> buffers = new ConcurrentHashMap<>();

    /**
     * Create a new store with the given capacity per topic.
     *
     * @param maxEventsPerTopic maximum events retained per topic (must be positive)
     * @throws IllegalArgumentException if maxEventsPerTopic is not positive
     */
    public InMemoryEventStore(int maxEventsPerTopic) {
        if (maxEventsPerTopic <= 0) {
            throw new IllegalArgumentException("maxEventsPerTopic must be positive");
        }
        this.maxEventsPerTopic = maxEventsPerTopic;
    }

    @Override
    public long append(String topic, String payloadJson) {
        Objects.requireNonNull(topic, "topic");
        Objects.requireNonNull(payloadJson, "payloadJson");

        TopicBuffer buffer = buffers.computeIfAbsent(topic, k -> new TopicBuffer(k));
        return buffer.append(payloadJson);
    }

    @Override
    public List<StoredEvent> replay(String topic, long sinceSeq) {
        Objects.requireNonNull(topic, "topic");

        TopicBuffer buffer = buffers.get(topic);
        if (buffer == null) {
            return List.of();
        }
        return buffer.replay(sinceSeq);
    }

    @Override
    public Set<String> topics() {
        return Set.copyOf(buffers.keySet());
    }

    /**
     * Per-topic buffer with seq counter and bounded deque.
     * Synchronized methods protect concurrent access.
     */
    private final class TopicBuffer {
        private final String topic;
        private long seqCounter = 0;
        private final ArrayDeque<StoredEvent> events = new ArrayDeque<>();
        private final Object lock = new Object();

        TopicBuffer(String topic) {
            this.topic = topic;
        }

        long append(String payloadJson) {
            synchronized (lock) {
                long seq = ++seqCounter;
                StoredEvent event = new StoredEvent(topic, payloadJson, seq);
                events.addLast(event);
                if (events.size() > maxEventsPerTopic) {
                    events.removeFirst();
                }
                return seq;
            }
        }

        List<StoredEvent> replay(long sinceSeq) {
            synchronized (lock) {
                return events.stream()
                    .filter(e -> e.seq() > sinceSeq)
                    .toList();
            }
        }
    }
}
