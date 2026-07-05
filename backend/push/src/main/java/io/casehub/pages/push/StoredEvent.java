package io.casehub.pages.push;

import java.util.Objects;

/**
 * Immutable event record with topic, payload, and assigned sequence number.
 * <p>
 * Per §3.1 of 2026-07-05 tokens-and-push-protocol-maturation-design spec.
 *
 * @param topic topic name (not null)
 * @param payloadJson JSON payload string (not null)
 * @param seq assigned monotonic sequence number for this topic (starts at 1)
 */
public record StoredEvent(String topic, String payloadJson, long seq) {
  public StoredEvent {
    Objects.requireNonNull(topic, "topic");
    Objects.requireNonNull(payloadJson, "payloadJson");
  }
}
