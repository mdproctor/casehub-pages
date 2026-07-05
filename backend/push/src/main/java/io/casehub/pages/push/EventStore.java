package io.casehub.pages.push;

import java.util.List;
import java.util.Set;

/**
 * SPI for storing and replaying events with per-topic sequence numbers.
 * <p>
 * Events are identified by monotonically increasing seq numbers scoped to topics.
 * Applications provide their own durable implementations (JDBC, Redis, etc.) or
 * use the default {@link InMemoryEventStore} bounded ring buffer.
 * <p>
 * Per §3.1 of 2026-07-05 tokens-and-push-protocol-maturation-design spec.
 */
public interface EventStore {
    /**
     * Append an event to the store, assigning the next monotonic sequence number.
     *
     * @param topic topic name (not null)
     * @param payloadJson JSON payload string (not null)
     * @return assigned sequence number (1, 2, 3...) for this topic
     */
    long append(String topic, String payloadJson);

    /**
     * Replay events with sequence numbers greater than {@code sinceSeq}.
     *
     * @param topic topic name (not null)
     * @param sinceSeq last known sequence; returns events with seq &gt; sinceSeq
     * @return stored events ordered by seq ascending (empty if no events match)
     */
    List<StoredEvent> replay(String topic, long sinceSeq);

    /**
     * Return all topic names that have at least one stored event.
     * <p>
     * Used by wildcard+replay integration (§3.5) to discover topics that
     * received events during a client's disconnection.
     *
     * @return topic names (empty if no events stored)
     */
    Set<String> topics();
}
