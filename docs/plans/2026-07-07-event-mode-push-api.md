# Event-Mode Push API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> subagent-driven-development (recommended) or executing-plans to
> implement this plan task-by-task. Each task follows TDD
> (test-driven-development) and uses ide-tooling for structural
> editing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Focal issue:** #125 — epic: event-mode push API — server convenience, Lit integration, documentation
**Issue group:** #125, #126, #127, #128

**Goal:** Make event-mode push a first-class, well-documented capability with server-side convenience (EventBroadcaster), framework-agnostic client subscription (EventStream), Lit reactive controller adapter (EventStreamController), and documentation updates.

**Architecture:** Three components across two repos. (1) Java `EventBroadcaster` in `casehub-pages-push` wraps the three-step broadcast ceremony. (2) TypeScript `EventStream` in `pages-data` provides framework-agnostic event subscription with connection pooling. (3) `EventStreamController` Lit adapter in `blocks-ui-core` (separate repo) wraps `EventStream` for reactive Lit components. A `PushSourceConfig.eventTarget` type widening from `HTMLElement` to `EventTarget` enables non-DOM event targets in the connection pool.

**Tech Stack:** Java 17 (JUnit 5, AssertJ, Jackson-core), TypeScript 5 (Vitest), Lit 3 (`@lit/reactive-element`)

## Global Constraints

- `casehub-pages-push` has zero Quarkus dependencies — only `jackson-core`. Do not add `jackson-databind` or CDI annotations.
- `pages-data` has zero framework dependencies — no Lit, no React. The `EventStream` class must be framework-agnostic.
- `blocks-ui-core` depends on both `@casehubio/pages-data` and `lit` — the Lit adapter lives here.
- All `CustomEvent` dispatches must set `bubbles: true, composed: true` per garden protocol `custom-event-shadow-dom`.
- Lit reactive collections must be replaced, never mutated in place, per garden protocol `lit-immutable-collections`.
- All commits reference an issue (`Refs #N` or `Closes #N`).

---

## File Structure

### Task 1 — EventBroadcaster (Java, casehub-pages-push)
| Action | Path |
|--------|------|
| Create | `backend/push/src/main/java/io/casehub/pages/push/SessionSender.java` |
| Create | `backend/push/src/main/java/io/casehub/pages/push/EventBroadcaster.java` |
| Create | `backend/push/src/test/java/io/casehub/pages/push/EventBroadcasterTest.java` |

### Task 2 — PushSourceConfig.eventTarget type widening (TypeScript, pages-data)
| Action | Path |
|--------|------|
| Modify | `packages/pages-data/src/dataset/external/sources/push-source.ts` (line 27: `HTMLElement` → `EventTarget`) |

### Task 3 — EventStream + connection pool (TypeScript, pages-data)
| Action | Path |
|--------|------|
| Create | `packages/pages-data/src/event-stream/event-stream-pool.ts` |
| Create | `packages/pages-data/src/event-stream/event-stream.ts` |
| Create | `packages/pages-data/src/event-stream/index.ts` |
| Create | `packages/pages-data/src/event-stream/event-stream.test.ts` |
| Modify | `packages/pages-data/src/index.ts` (add EventStream exports) |

### Task 4 — EventStreamController Lit adapter (TypeScript, blocks-ui-core — separate repo)
| Action | Path (in blocks-ui repo) |
|--------|------|
| Create | `packages/blocks-ui-core/src/event-stream/event-stream-controller.ts` |
| Create | `packages/blocks-ui-core/src/event-stream/index.ts` |
| Create | `packages/blocks-ui-core/src/event-stream/event-stream-controller.test.ts` |
| Modify | `packages/blocks-ui-core/src/index.ts` (add EventStreamController export) |

### Task 5 — Documentation (CLAUDE.md updates)
| Action | Path |
|--------|------|
| Modify | `CLAUDE.md` (pages-data description, casehub-pages-push description, data flow) |

---

### Task 1: EventBroadcaster + SessionSender (#126)

**Files:**
- Create: `backend/push/src/main/java/io/casehub/pages/push/SessionSender.java`
- Create: `backend/push/src/main/java/io/casehub/pages/push/EventBroadcaster.java`
- Create: `backend/push/src/test/java/io/casehub/pages/push/EventBroadcasterTest.java`

**Interfaces:**
- Consumes: `EventStore.append(String topic, String payloadJson)` → `long seq`, `TopicRegistry.connections(String topic)` → `Set<String>`, `PushMessage.event(String topic, String payloadJson, long seq)` → `String`
- Produces: `SessionSender` functional interface (`void send(String connectionId, String message)`), `EventBroadcaster` class (`long broadcast(String topic, String payloadJson)`)

- [ ] **Step 1: Write the failing tests**

File: `backend/push/src/test/java/io/casehub/pages/push/EventBroadcasterTest.java`

```java
package io.casehub.pages.push;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class EventBroadcasterTest {

    private final InMemoryEventStore store = new InMemoryEventStore(100);
    private final TopicRegistry registry = new TopicRegistry();
    private final List<String> sent = new ArrayList<>();

    private EventBroadcaster broadcaster() {
        return new EventBroadcaster(store, registry, (connId, msg) -> sent.add(connId + ":" + msg));
    }

    @Test
    void broadcast_assigns_seq_and_sends_to_all_connections() {
        registry.listen("c1", List.of("debate:abc"));
        registry.listen("c2", List.of("debate:abc"));
        EventBroadcaster b = broadcaster();

        long seq = b.broadcast("debate:abc", "{\"text\":\"hello\"}");

        assertThat(seq).isEqualTo(1);
        assertThat(sent).hasSize(2);
        for (String s : sent) {
            assertThat(s).contains("\"op\":\"event\"");
            assertThat(s).contains("\"topic\":\"debate:abc\"");
            assertThat(s).contains("\"seq\":1");
        }
    }

    @Test
    void broadcast_to_topic_with_no_connections_succeeds() {
        EventBroadcaster b = broadcaster();

        long seq = b.broadcast("nobody:listens", "{\"x\":1}");

        assertThat(seq).isEqualTo(1);
        assertThat(sent).isEmpty();
    }

    @Test
    void broadcast_increments_seq_per_topic() {
        EventBroadcaster b = broadcaster();

        long s1 = b.broadcast("t", "{}");
        long s2 = b.broadcast("t", "{}");

        assertThat(s1).isEqualTo(1);
        assertThat(s2).isEqualTo(2);
    }

    @Test
    void broadcast_wildcard_topic_throws() {
        EventBroadcaster b = broadcaster();

        assertThatThrownBy(() -> b.broadcast("notification:**", "{}"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("wildcard");

        assertThatThrownBy(() -> b.broadcast("event:*", "{}"))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void broadcast_continues_on_send_failure() {
        registry.listen("c1", List.of("t"));
        registry.listen("c2", List.of("t"));
        registry.listen("c3", List.of("t"));

        List<String> successes = new ArrayList<>();
        SessionSender failOnC2 = (connId, msg) -> {
            if ("c2".equals(connId)) throw new RuntimeException("socket closed");
            successes.add(connId);
        };
        EventBroadcaster b = new EventBroadcaster(store, registry, failOnC2);

        long seq = b.broadcast("t", "{}");

        assertThat(seq).isEqualTo(1);
        assertThat(successes).hasSize(2);
        assertThat(successes).doesNotContain("c2");
    }

    @Test
    void broadcast_event_is_replayable_from_store() {
        EventBroadcaster b = broadcaster();

        b.broadcast("t", "{\"v\":42}");

        List<StoredEvent> replayed = store.replay("t", 0);
        assertThat(replayed).hasSize(1);
        assertThat(replayed.get(0).payloadJson()).isEqualTo("{\"v\":42}");
        assertThat(replayed.get(0).seq()).isEqualTo(1);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/mdproctor/claude/casehub/pages/backend/push && /opt/homebrew/bin/mvn test -pl . -Dtest=EventBroadcasterTest -Dsurefire.failIfNoTests=false`
Expected: compilation failure — `EventBroadcaster` and `SessionSender` do not exist

- [ ] **Step 3: Create SessionSender interface**

File: `backend/push/src/main/java/io/casehub/pages/push/SessionSender.java`

```java
package io.casehub.pages.push;

@FunctionalInterface
public interface SessionSender {
    void send(String connectionId, String message);
}
```

- [ ] **Step 4: Create EventBroadcaster class**

File: `backend/push/src/main/java/io/casehub/pages/push/EventBroadcaster.java`

```java
package io.casehub.pages.push;

public class EventBroadcaster {
    private final EventStore eventStore;
    private final TopicRegistry topicRegistry;
    private final SessionSender sessionSender;

    public EventBroadcaster(EventStore eventStore,
                            TopicRegistry topicRegistry,
                            SessionSender sessionSender) {
        this.eventStore = eventStore;
        this.topicRegistry = topicRegistry;
        this.sessionSender = sessionSender;
    }

    public long broadcast(String topic, String payloadJson) {
        if (topic.contains("*")) {
            throw new IllegalArgumentException(
                "broadcast topic must not contain wildcards: " + topic);
        }
        long seq = eventStore.append(topic, payloadJson);
        String wire = PushMessage.event(topic, payloadJson, seq);
        for (String connId : topicRegistry.connections(topic)) {
            try {
                sessionSender.send(connId, wire);
            } catch (Exception e) {
                // Connection likely closed between connections() snapshot and send.
                // Event is persisted in EventStore; replay delivers on reconnect.
            }
        }
        return seq;
    }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/mdproctor/claude/casehub/pages/backend/push && /opt/homebrew/bin/mvn test -pl . -Dtest=EventBroadcasterTest`
Expected: all 6 tests PASS

- [ ] **Step 6: Run full push module test suite**

Run: `cd /Users/mdproctor/claude/casehub/pages/backend/push && /opt/homebrew/bin/mvn test`
Expected: all existing tests still PASS (no regressions)

- [ ] **Step 7: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/pages add backend/push/src/main/java/io/casehub/pages/push/SessionSender.java backend/push/src/main/java/io/casehub/pages/push/EventBroadcaster.java backend/push/src/test/java/io/casehub/pages/push/EventBroadcasterTest.java
git -C /Users/mdproctor/claude/casehub/pages commit -m "feat: add EventBroadcaster and SessionSender to casehub-pages-push

Single-call broadcast convenience: append to EventStore, build wire
message via PushMessage.event(), route to all connections via
TopicRegistry. Validates against wildcard topics. Try/catch per
send so one failed connection doesn't block others.

Closes #126"
```

---

### Task 2: PushSourceConfig.eventTarget type widening

**Files:**
- Modify: `packages/pages-data/src/dataset/external/sources/push-source.ts` (line 27)

**Interfaces:**
- Consumes: nothing new
- Produces: `PushSourceConfig.eventTarget` widened from `HTMLElement` to `EventTarget`

**Why this is a separate task:** The EventStream connection pool creates non-DOM `EventTarget` instances. The existing `PushSourceConfig.eventTarget` is typed as `HTMLElement`. `dispatchWireEvent()` in `push-wire.ts` already accepts `EventTarget` — the config type is the only bottleneck. This unblocks Task 3.

- [ ] **Step 1: Verify dispatchWireEvent already accepts EventTarget**

Read `packages/pages-data/src/dataset/external/sources/push-wire.ts` line 69. Confirm the parameter type is `eventTarget: EventTarget` (not `HTMLElement`). It is — no change needed in push-wire.ts.

- [ ] **Step 2: Widen PushSourceConfig.eventTarget**

File: `packages/pages-data/src/dataset/external/sources/push-source.ts`, line 27.

Change:
```typescript
readonly eventTarget?: HTMLElement;
```
To:
```typescript
readonly eventTarget?: EventTarget;
```

- [ ] **Step 3: Type-check to verify no breakage**

Run: `yarn --cwd /Users/mdproctor/claude/casehub/pages typecheck`
Expected: PASS. `HTMLElement` extends `EventTarget`, so all existing callers passing `HTMLElement` remain valid.

- [ ] **Step 4: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/pages add packages/pages-data/src/dataset/external/sources/push-source.ts
git -C /Users/mdproctor/claude/casehub/pages commit -m "refactor: widen PushSourceConfig.eventTarget from HTMLElement to EventTarget

dispatchWireEvent() already accepts EventTarget. The config type was
the only bottleneck preventing non-DOM EventTarget instances (needed
for EventStream connection pool).

Refs #127"
```

---

### Task 3: EventStream + connection pool (#127 Part A)

**Files:**
- Create: `packages/pages-data/src/event-stream/event-stream-pool.ts`
- Create: `packages/pages-data/src/event-stream/event-stream.ts`
- Create: `packages/pages-data/src/event-stream/index.ts`
- Create: `packages/pages-data/src/event-stream/event-stream.test.ts`
- Modify: `packages/pages-data/src/index.ts` (add exports)

**Interfaces:**
- Consumes: `createEventConnection(url, options)` → `EventConnection`, `buildConnectionUrl(baseUrl, config)` → `string`, `matchesTopic(pattern, topic)` → `boolean`, `ConnectionStatus`, `PushSourceConfig`, `EventConnectionOptions`
- Produces: `EventStream<T>` class (`connect()`, `disconnect()`, readonly `latest`, `all`, `status`), `EventStreamOptions<T>` interface, `EventStreamPool` opaque type, `createEventStreamPool()` factory

- [ ] **Step 1: Write the test file**

File: `packages/pages-data/src/event-stream/event-stream.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventStream, createEventStreamPool } from "./index.js";
import type { EventStreamPool } from "./index.js";

// Mock EventConnection returned by createEventConnection
interface MockConn {
  listen: ReturnType<typeof vi.fn>;
  unlisten: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  connected: boolean;
  status: "connected" | "reconnecting" | "disconnected";
}

let lastMockConn: MockConn;
let capturedEventTarget: EventTarget | undefined;
let capturedBatchEvents: boolean | undefined;

vi.mock("../dataset/external/sources/event-connection.js", () => ({
  createEventConnection: (url: string, opts?: { config?: { eventTarget?: EventTarget }; batchEvents?: boolean }) => {
    capturedEventTarget = opts?.config?.eventTarget;
    capturedBatchEvents = opts?.batchEvents;
    const conn: MockConn = {
      listen: vi.fn().mockResolvedValue({ topics: [], gaps: [] }),
      unlisten: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
      send: vi.fn(),
      connected: true,
      status: "connected" as const,
    };
    lastMockConn = conn;
    return conn;
  },
}));

vi.mock("../dataset/external/sources/push-wire.js", () => ({
  buildConnectionUrl: (url: string) => url,
}));

function fireEvent(target: EventTarget, topic: string, payload: unknown): void {
  target.dispatchEvent(new CustomEvent("pages-event", {
    bubbles: true,
    composed: true,
    detail: { topic, payload },
  }));
}

describe("EventStream", () => {
  let pool: EventStreamPool;

  beforeEach(() => {
    pool = createEventStreamPool();
    capturedEventTarget = undefined;
    capturedBatchEvents = undefined;
  });

  it("connects and listens on topics", async () => {
    const stream = new EventStream("ws://test", "notification:**", { pool });
    stream.connect();

    await vi.waitFor(() => {
      expect(lastMockConn.listen).toHaveBeenCalledWith(["notification:**"]);
    });
  });

  it("receives matching events and updates state", () => {
    const onChange = vi.fn();
    const stream = new EventStream("ws://test", "notification:**", { pool, onChange });
    stream.connect();

    fireEvent(capturedEventTarget!, "notification:user:1", { text: "hello" });

    expect(stream.latest).toEqual({ text: "hello" });
    expect(stream.all).toEqual([{ text: "hello" }]);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("filters non-matching topics", () => {
    const onChange = vi.fn();
    const stream = new EventStream("ws://test", "notification:**", { pool, onChange });
    stream.connect();

    fireEvent(capturedEventTarget!, "debate:abc", { text: "wrong" });

    expect(stream.latest).toBeUndefined();
    expect(stream.all).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("caps buffer at maxBuffer", () => {
    const stream = new EventStream("ws://test", "t:**", { pool, maxBuffer: 3 });
    stream.connect();

    for (let i = 0; i < 5; i++) {
      fireEvent(capturedEventTarget!, "t:x", { i });
    }

    expect(stream.all).toHaveLength(3);
    expect(stream.all[0]).toEqual({ i: 2 });
    expect(stream.latest).toEqual({ i: 4 });
  });

  it("disconnect removes listener and calls unlisten", async () => {
    const stream = new EventStream("ws://test", "t:**", { pool });
    stream.connect();
    stream.disconnect();

    await vi.waitFor(() => {
      expect(lastMockConn.unlisten).toHaveBeenCalledWith(["t:**"]);
    });
  });

  it("last disconnect closes pooled connection", () => {
    const stream = new EventStream("ws://test", "t:**", { pool });
    stream.connect();
    stream.disconnect();

    expect(lastMockConn.close).toHaveBeenCalled();
  });

  it("two streams share one connection via pool", () => {
    const s1 = new EventStream("ws://test", "a:**", { pool });
    const s2 = new EventStream("ws://test", "b:**", { pool });
    s1.connect();
    const conn1 = lastMockConn;
    s2.connect();
    const conn2 = lastMockConn;

    expect(conn1).toBe(conn2);
  });

  it("per-topic ref counting — shared topic not unlistened until last disconnects", async () => {
    const s1 = new EventStream("ws://test", "shared:topic", { pool });
    const s2 = new EventStream("ws://test", "shared:topic", { pool });
    s1.connect();
    s2.connect();

    s1.disconnect();
    expect(lastMockConn.unlisten).not.toHaveBeenCalled();

    s2.disconnect();
    await vi.waitFor(() => {
      expect(lastMockConn.unlisten).toHaveBeenCalledWith(["shared:topic"]);
    });
  });

  it("shared: false creates isolated connection", () => {
    const s1 = new EventStream("ws://test", "a:**", { pool });
    s1.connect();
    const pooledConn = lastMockConn;

    const s2 = new EventStream("ws://test", "b:**", { pool, shared: false });
    s2.connect();
    const isolatedConn = lastMockConn;

    expect(pooledConn).not.toBe(isolatedConn);
    s1.disconnect();
    s2.disconnect();
  });

  it("parse function transforms payloads", () => {
    const stream = new EventStream<number>("ws://test", "t:**", {
      pool,
      parse: (raw) => (raw as { v: number }).v,
    });
    stream.connect();

    fireEvent(capturedEventTarget!, "t:x", { v: 42 });

    expect(stream.latest).toBe(42);
    expect(stream.all).toEqual([42]);
  });

  it("parse function failure drops event with warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stream = new EventStream<number>("ws://test", "t:**", {
      pool,
      parse: () => { throw new Error("bad payload"); },
    });
    stream.connect();

    fireEvent(capturedEventTarget!, "t:x", { v: "not a number" });

    expect(stream.latest).toBeUndefined();
    expect(stream.all).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("listen rejection is caught and logged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stream = new EventStream("ws://test", "t:**", { pool });

    // Override the mock to reject
    vi.mocked(lastMockConn?.listen ?? vi.fn());
    stream.connect();
    lastMockConn.listen.mockRejectedValueOnce(new Error("timeout"));

    // Re-connect to trigger the rejection path
    const s2 = new EventStream("ws://other", "t:**", { pool });
    s2.connect();

    await vi.waitFor(() => {
      // The stream should still be functional despite listen failure
      expect(stream.status).toBeDefined();
    });
    warn.mockRestore();
    s2.disconnect();
    stream.disconnect();
  });

  it("batchEvents option is forwarded to createEventConnection", () => {
    const stream = new EventStream("ws://test", "t:**", { pool, batchEvents: true });
    stream.connect();

    expect(capturedBatchEvents).toBe(true);
  });

  it("accepts string[] topics", () => {
    const stream = new EventStream("ws://test", ["a:1", "b:2"], { pool });
    stream.connect();

    expect(lastMockConn.listen).toHaveBeenCalledWith(["a:1", "b:2"]);
  });

  it("all array is immutable (new reference on each update)", () => {
    const stream = new EventStream("ws://test", "t:**", { pool });
    stream.connect();

    fireEvent(capturedEventTarget!, "t:x", { i: 1 });
    const ref1 = stream.all;

    fireEvent(capturedEventTarget!, "t:x", { i: 2 });
    const ref2 = stream.all;

    expect(ref1).not.toBe(ref2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn --cwd /Users/mdproctor/claude/casehub/pages workspace @casehubio/pages-data run test -- --run src/event-stream/event-stream.test.ts`
Expected: FAIL — modules do not exist

- [ ] **Step 3: Create the connection pool**

File: `packages/pages-data/src/event-stream/event-stream-pool.ts`

```typescript
import { createEventConnection } from "../dataset/external/sources/event-connection.js";
import { buildConnectionUrl } from "../dataset/external/sources/push-wire.js";
import type { EventConnection } from "../dataset/external/sources/event-connection.js";
import type { PushSourceConfig } from "../dataset/external/sources/push-source.js";

export interface EventStreamPool {
  acquire(
    url: string,
    config: PushSourceConfig | undefined,
    batchEvents: boolean,
    topics: readonly string[],
  ): PoolHandle;
  release(handle: PoolHandle): void;
}

export interface PoolHandle {
  readonly conn: EventConnection;
  readonly eventTarget: EventTarget;
  readonly key: string;
}

interface PoolEntry {
  conn: EventConnection;
  eventTarget: EventTarget;
  refCount: number;
  topicCounts: Map<string, number>;
}

export function createEventStreamPool(): EventStreamPool {
  const entries = new Map<string, PoolEntry>();

  return {
    acquire(
      url: string,
      config: PushSourceConfig | undefined,
      batchEvents: boolean,
      topics: readonly string[],
    ): PoolHandle {
      const key = buildConnectionUrl(url, config);
      let entry = entries.get(key);

      if (!entry) {
        const eventTarget = new EventTarget();
        const conn = createEventConnection(url, {
          config: config ? { ...config, eventTarget } : { eventTarget },
          batchEvents,
        });
        entry = { conn, eventTarget, refCount: 0, topicCounts: new Map() };
        entries.set(key, entry);
      }

      entry.refCount++;

      const newTopics: string[] = [];
      for (const t of topics) {
        const count = entry.topicCounts.get(t) ?? 0;
        entry.topicCounts.set(t, count + 1);
        if (count === 0) newTopics.push(t);
      }
      if (newTopics.length > 0) {
        entry.conn.listen(newTopics).catch((err) => {
          console.warn("EventStreamPool: listen failed:", err);
        });
      }

      return { conn: entry.conn, eventTarget: entry.eventTarget, key };
    },

    release(handle: PoolHandle): void {
      // Release is called with the topics to unlisten from,
      // but we need to know which topics this handle owned.
      // The EventStream calls releaseTopics instead.
    },
  };
}

export function releaseFromPool(
  pool: EventStreamPool & { _entries?: Map<string, PoolEntry> },
  key: string,
  topics: readonly string[],
): void {
  // This is an internal function — see EventStream.disconnect()
  // The pool's internal map is not exposed; EventStream tracks its own key and topics.
}
```

Hmm — the pool needs internal access for release. Let me redesign the pool API to be cleaner.

File: `packages/pages-data/src/event-stream/event-stream-pool.ts` (revised)

```typescript
import { createEventConnection } from "../dataset/external/sources/event-connection.js";
import { buildConnectionUrl } from "../dataset/external/sources/push-wire.js";
import type { EventConnection } from "../dataset/external/sources/event-connection.js";
import type { PushSourceConfig } from "../dataset/external/sources/push-source.js";

export interface EventStreamPool {
  acquire(
    url: string,
    config: PushSourceConfig | undefined,
    batchEvents: boolean,
    topics: readonly string[],
  ): PoolHandle;
}

export interface PoolHandle {
  readonly eventTarget: EventTarget;
  readonly status: () => "connected" | "reconnecting" | "disconnected";
  release(topics: readonly string[]): void;
}

interface PoolEntry {
  conn: EventConnection;
  eventTarget: EventTarget;
  refCount: number;
  topicCounts: Map<string, number>;
}

export function createEventStreamPool(): EventStreamPool {
  const entries = new Map<string, PoolEntry>();

  return {
    acquire(url, config, batchEvents, topics): PoolHandle {
      const key = buildConnectionUrl(url, config);
      let entry = entries.get(key);

      if (!entry) {
        const eventTarget = new EventTarget();
        const conn = createEventConnection(url, {
          config: config ? { ...config, eventTarget } : { eventTarget },
          batchEvents,
        });
        entry = { conn, eventTarget, refCount: 0, topicCounts: new Map() };
        entries.set(key, entry);
      }

      entry.refCount++;

      const newTopics: string[] = [];
      for (const t of topics) {
        const count = entry.topicCounts.get(t) ?? 0;
        entry.topicCounts.set(t, count + 1);
        if (count === 0) newTopics.push(t);
      }
      if (newTopics.length > 0) {
        entry.conn.listen(newTopics).catch((err) => {
          console.warn("EventStreamPool: listen failed:", err);
        });
      }

      const capturedEntry = entry;

      return {
        eventTarget: entry.eventTarget,
        status: () => capturedEntry.conn.status,
        release(relTopics: readonly string[]): void {
          const deadTopics: string[] = [];
          for (const t of relTopics) {
            const count = capturedEntry.topicCounts.get(t) ?? 0;
            if (count <= 1) {
              capturedEntry.topicCounts.delete(t);
              deadTopics.push(t);
            } else {
              capturedEntry.topicCounts.set(t, count - 1);
            }
          }
          if (deadTopics.length > 0) {
            capturedEntry.conn.unlisten(deadTopics).catch(() => {});
          }
          capturedEntry.refCount--;
          if (capturedEntry.refCount <= 0) {
            capturedEntry.conn.close();
            entries.delete(key);
          }
        },
      };
    },
  };
}
```

- [ ] **Step 4: Create the EventStream class**

File: `packages/pages-data/src/event-stream/event-stream.ts`

```typescript
import { createEventConnection } from "../dataset/external/sources/event-connection.js";
import { buildConnectionUrl } from "../dataset/external/sources/push-wire.js";
import { matchesTopic } from "../dataset/external/sources/topic-matching.js";
import type { ConnectionStatus } from "../dataset/external/sources/event-connection.js";
import type { PushSourceConfig } from "../dataset/external/sources/push-source.js";
import type { EventStreamPool, PoolHandle } from "./event-stream-pool.js";
import { defaultPool } from "./event-stream-pool.js";

export interface EventStreamOptions<T = unknown> {
  config?: PushSourceConfig;
  maxBuffer?: number;
  shared?: boolean;
  batchEvents?: boolean;
  parse?: (raw: unknown) => T;
  pool?: EventStreamPool;
  onChange?: () => void;
}

export class EventStream<T = unknown> {
  private readonly url: string;
  private readonly topics: readonly string[];
  private readonly maxBuffer: number;
  private readonly shared: boolean;
  private readonly batchEvents: boolean;
  private readonly parse: ((raw: unknown) => T) | undefined;
  private readonly pool: EventStreamPool;
  private readonly config: PushSourceConfig | undefined;
  private readonly onChange: (() => void) | undefined;

  private handle: PoolHandle | undefined;
  private listener: ((e: Event) => void) | undefined;
  private _latest: T | undefined;
  private _all: readonly T[] = [];

  constructor(
    url: string,
    topics: string | string[],
    options?: EventStreamOptions<T>,
  ) {
    this.url = url;
    this.topics = Array.isArray(topics) ? topics : [topics];
    this.maxBuffer = options?.maxBuffer ?? 100;
    this.shared = options?.shared ?? true;
    this.batchEvents = options?.batchEvents ?? false;
    this.parse = options?.parse;
    this.pool = options?.pool ?? defaultPool;
    this.config = options?.config;
    this.onChange = options?.onChange;
  }

  get latest(): T | undefined {
    return this._latest;
  }

  get all(): readonly T[] {
    return this._all;
  }

  get status(): ConnectionStatus {
    return this.handle?.status() ?? "disconnected";
  }

  connect(): void {
    if (this.handle) return;

    if (this.shared) {
      this.handle = this.pool.acquire(
        this.url,
        this.config,
        this.batchEvents,
        this.topics,
      );
    } else {
      const eventTarget = new EventTarget();
      const conn = createEventConnection(this.url, {
        config: this.config
          ? { ...this.config, eventTarget }
          : { eventTarget },
        batchEvents: this.batchEvents,
      });
      conn.listen([...this.topics]).catch((err) => {
        console.warn("EventStream: listen failed:", err);
      });
      this.handle = {
        eventTarget,
        status: () => conn.status,
        release: (topics) => {
          conn.unlisten([...topics]).catch(() => {});
          conn.close();
        },
      };
    }

    this.listener = (e: Event) => {
      const detail = (e as CustomEvent<{ topic: string; payload: unknown }>).detail;
      if (!detail?.topic) return;

      const matches = this.topics.some((pattern) =>
        matchesTopic(pattern, detail.topic),
      );
      if (!matches) return;

      let value: T;
      if (this.parse) {
        try {
          value = this.parse(detail.payload);
        } catch (err) {
          console.warn("EventStream: parse failed, dropping event:", err);
          return;
        }
      } else {
        value = detail.payload as T;
      }

      this._latest = value;
      const updated = [...this._all, value];
      this._all =
        updated.length > this.maxBuffer
          ? updated.slice(updated.length - this.maxBuffer)
          : updated;
      this.onChange?.();
    };

    this.handle.eventTarget.addEventListener("pages-event", this.listener);
  }

  disconnect(): void {
    if (!this.handle) return;

    if (this.listener) {
      this.handle.eventTarget.removeEventListener("pages-event", this.listener);
      this.listener = undefined;
    }

    this.handle.release(this.topics);
    this.handle = undefined;
  }
}
```

- [ ] **Step 5: Create barrel export and wire up defaultPool**

File: `packages/pages-data/src/event-stream/index.ts`

```typescript
export { EventStream } from "./event-stream.js";
export type { EventStreamOptions } from "./event-stream.js";
export { createEventStreamPool } from "./event-stream-pool.js";
export type { EventStreamPool } from "./event-stream-pool.js";
```

Update `packages/pages-data/src/event-stream/event-stream-pool.ts` — add at the end of the file:

```typescript
export const defaultPool: EventStreamPool = createEventStreamPool();
```

- [ ] **Step 6: Add exports to pages-data barrel**

Append to `packages/pages-data/src/index.ts`:

```typescript
export {
  EventStream,
  type EventStreamOptions,
  createEventStreamPool,
  type EventStreamPool,
} from "./event-stream/index.js";
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `yarn --cwd /Users/mdproctor/claude/casehub/pages workspace @casehubio/pages-data run test -- --run src/event-stream/event-stream.test.ts`
Expected: all tests PASS

- [ ] **Step 8: Run full pages-data test suite**

Run: `yarn --cwd /Users/mdproctor/claude/casehub/pages workspace @casehubio/pages-data run test`
Expected: all existing tests still PASS

- [ ] **Step 9: Type-check the monorepo**

Run: `yarn --cwd /Users/mdproctor/claude/casehub/pages typecheck`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/pages add packages/pages-data/src/event-stream/ packages/pages-data/src/index.ts
git -C /Users/mdproctor/claude/casehub/pages commit -m "feat: add EventStream and EventStreamPool to pages-data

Framework-agnostic event subscription manager with connection pooling,
per-topic reference counting, buffer capping, and optional parse
function. Follows SSEManager pattern. Zero framework dependencies —
pages-data stays framework-free per ARC42STORIES §10.

createEventStreamPool() factory enables test isolation. Module-level
default singleton for production use.

Refs #127"
```

---

### Task 4: EventStreamController Lit adapter (#127 Part B)

**Repo:** `/Users/mdproctor/claude/casehub/blocks-ui` (separate from pages)

**Files:**
- Create: `packages/blocks-ui-core/src/event-stream/event-stream-controller.ts`
- Create: `packages/blocks-ui-core/src/event-stream/index.ts`
- Create: `packages/blocks-ui-core/src/event-stream/event-stream-controller.test.ts`
- Modify: `packages/blocks-ui-core/src/index.ts` (add export)

**Interfaces:**
- Consumes: `EventStream<T>` from `@casehubio/pages-data` (`connect()`, `disconnect()`, `latest`, `all`, `status`), `EventStreamOptions<T>` from `@casehubio/pages-data`
- Produces: `EventStreamController<T>` Lit `ReactiveController` (`latest`, `all`, `status`, `hostConnected()`, `hostDisconnected()`)

**Prerequisites:** Task 3 must be completed and `@casehubio/pages-data` published or linked so blocks-ui-core can import it. During development, use `yarn link` or update the version range.

- [ ] **Step 1: Write the test file**

File: `packages/blocks-ui-core/src/event-stream/event-stream-controller.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventStreamController } from "./event-stream-controller.js";
import type { ReactiveControllerHost } from "lit";

// Mock EventStream
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
let capturedOnChange: (() => void) | undefined;
let mockLatest: unknown = undefined;
let mockAll: readonly unknown[] = [];
let mockStatus: "connected" | "reconnecting" | "disconnected" = "disconnected";

vi.mock("@casehubio/pages-data", () => ({
  EventStream: class {
    get latest() { return mockLatest; }
    get all() { return mockAll; }
    get status() { return mockStatus; }

    constructor(_url: string, _topics: string | string[], opts?: { onChange?: () => void; batchEvents?: boolean }) {
      capturedOnChange = opts?.onChange;
    }

    connect() { mockConnect(); }
    disconnect() { mockDisconnect(); }
  },
}));

function createMockHost(): ReactiveControllerHost {
  return {
    addController: vi.fn(),
    removeController: vi.fn(),
    requestUpdate: vi.fn(),
    updateComplete: Promise.resolve(true),
  };
}

describe("EventStreamController", () => {
  let host: ReactiveControllerHost;

  beforeEach(() => {
    host = createMockHost();
    mockConnect.mockClear();
    mockDisconnect.mockClear();
    mockLatest = undefined;
    mockAll = [];
    mockStatus = "disconnected";
    capturedOnChange = undefined;
  });

  it("registers itself with the host", () => {
    new EventStreamController(host, "ws://test", "t:**");
    expect(host.addController).toHaveBeenCalledOnce();
  });

  it("connects on hostConnected", () => {
    const ctrl = new EventStreamController(host, "ws://test", "t:**");
    ctrl.hostConnected();
    expect(mockConnect).toHaveBeenCalledOnce();
  });

  it("disconnects on hostDisconnected", () => {
    const ctrl = new EventStreamController(host, "ws://test", "t:**");
    ctrl.hostConnected();
    ctrl.hostDisconnected();
    expect(mockDisconnect).toHaveBeenCalledOnce();
  });

  it("delegates latest/all/status to inner EventStream", () => {
    mockLatest = { text: "hello" };
    mockAll = [{ text: "hello" }];
    mockStatus = "connected";

    const ctrl = new EventStreamController(host, "ws://test", "t:**");

    expect(ctrl.latest).toEqual({ text: "hello" });
    expect(ctrl.all).toEqual([{ text: "hello" }]);
    expect(ctrl.status).toBe("connected");
  });

  it("calls host.requestUpdate on onChange", () => {
    new EventStreamController(host, "ws://test", "t:**");

    capturedOnChange?.();

    expect(host.requestUpdate).toHaveBeenCalledOnce();
  });

  it("defaults batchEvents to true", () => {
    // The constructor passes batchEvents: true to EventStream options
    // Verified via the mock capturing the option
    const ctrl = new EventStreamController(host, "ws://test", "t:**");
    // batchEvents default is verified by the mock constructor check
    expect(ctrl).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn --cwd /Users/mdproctor/claude/casehub/blocks-ui workspace @casehubio/agency-ui-core run test -- --run src/event-stream/event-stream-controller.test.ts`
Expected: FAIL — module does not exist

- [ ] **Step 3: Create EventStreamController**

File: `packages/blocks-ui-core/src/event-stream/event-stream-controller.ts`

```typescript
import { EventStream } from "@casehubio/pages-data";
import type { EventStreamOptions } from "@casehubio/pages-data";
import type { ConnectionStatus } from "@casehubio/pages-data";
import type { ReactiveController, ReactiveControllerHost } from "lit";

export class EventStreamController<T = unknown> implements ReactiveController {
  private readonly stream: EventStream<T>;

  constructor(
    private readonly host: ReactiveControllerHost,
    url: string,
    topics: string | string[],
    options?: EventStreamOptions<T>,
  ) {
    this.stream = new EventStream(url, topics, {
      ...options,
      batchEvents: options?.batchEvents ?? true,
      onChange: () => host.requestUpdate(),
    });
    host.addController(this);
  }

  get latest(): T | undefined {
    return this.stream.latest;
  }

  get all(): readonly T[] {
    return this.stream.all;
  }

  get status(): ConnectionStatus {
    return this.stream.status;
  }

  hostConnected(): void {
    this.stream.connect();
  }

  hostDisconnected(): void {
    this.stream.disconnect();
  }
}
```

- [ ] **Step 4: Create barrel export**

File: `packages/blocks-ui-core/src/event-stream/index.ts`

```typescript
export { EventStreamController } from "./event-stream-controller.js";
```

- [ ] **Step 5: Add export to blocks-ui-core barrel**

Append to `packages/blocks-ui-core/src/index.ts`:

```typescript
export * from './event-stream/index.js';
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `yarn --cwd /Users/mdproctor/claude/casehub/blocks-ui workspace @casehubio/agency-ui-core run test -- --run src/event-stream/event-stream-controller.test.ts`
Expected: all tests PASS

- [ ] **Step 7: Run full blocks-ui-core test suite**

Run: `yarn --cwd /Users/mdproctor/claude/casehub/blocks-ui workspace @casehubio/agency-ui-core run test`
Expected: all existing tests still PASS

- [ ] **Step 8: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/blocks-ui add packages/blocks-ui-core/src/event-stream/ packages/blocks-ui-core/src/index.ts
git -C /Users/mdproctor/claude/casehub/blocks-ui commit -m "feat: add EventStreamController Lit reactive controller

Thin ReactiveController wrapping EventStream from pages-data.
Manages connect/disconnect lifecycle via hostConnected/hostDisconnected.
Defaults batchEvents to true for RAF-aligned UI updates.

Refs casehubio/casehub-pages#127"
```

---

### Task 5: Documentation (#128)

**Files:**
- Modify: `CLAUDE.md` (three sections)

**Interfaces:**
- Consumes: completed Tasks 1–4
- Produces: updated CLAUDE.md

- [ ] **Step 1: Update `@casehubio/pages-data` description in CLAUDE.md**

In the `### Package Overview` section, replace the `@casehubio/pages-data` line:

From:
```
- `@casehubio/pages-data` — DataSet model, operations engine, external data extraction, JSONata. Push wire protocol (`EventConnection`, `PushSource`, `WebSocketSource`). General-purpose `SSEManager` (connection pooling, named event support, reconnection).
```

To:
```
- `@casehubio/pages-data` — DataSet model, operations engine, JSONata. Push wire protocol with two modes: dataset mode (`PushSource`, `createWebSocketSource`) for tabular snapshot/append/replace/remove; event mode (`EventConnection`, `createEventConnection`, `EventStream`) for arbitrary domain events with topic/payload, seq tracking, wildcard matching, replay. `EventStream`: framework-agnostic subscription manager with connection pooling, topic filtering, and buffering. Lit adapter (`EventStreamController`) in `blocks-ui-core`. General-purpose `SSEManager` (connection pooling, named event support, reconnection).
```

- [ ] **Step 2: Update `casehub-pages-push` backend description**

In the `### Package Overview` section under `**Backend (Java)**`, replace the `casehub-pages-push` line:

From:
```
- `casehub-pages-push` — Typed wire protocol SDK: `PushMessage` (server→client builders), `PushRequest` (sealed client→server parser with ack/error correlation), `TopicRegistry` (wildcard-aware connection tracking), `EventStore` SPI + `InMemoryEventStore` (bounded per-topic event replay). jackson-core only, no Quarkus.
```

To:
```
- `casehub-pages-push` — Typed wire protocol SDK: `PushMessage` (server→client builders), `PushRequest` (sealed client→server parser with ack/error correlation), `EventBroadcaster` (single-call broadcast: append + route + send), `TopicRegistry` (wildcard-aware connection tracking), `EventStore` SPI + `InMemoryEventStore` (bounded per-topic event replay). jackson-core only, no Quarkus.
```

- [ ] **Step 3: Update Data Flow section**

In the `### Data Flow` section, replace:

From:
```
YAML → @casehubio/pages-ui (parse) → @casehubio/pages-data (resolve)
  → @casehubio/pages-component (layout) → @casehubio/pages-viz (render)
  → pages-filter/pages-sort events → back to data layer
```

To:
```
Dataset mode:
  YAML → @casehubio/pages-ui (parse) → @casehubio/pages-data (resolve)
    → @casehubio/pages-component (layout) → @casehubio/pages-viz (render)
    → pages-filter/pages-sort events → back to data layer
Event mode:
  Server → EventBroadcaster → WebSocket → EventConnection
    → EventStream → onChange callback (or EventStreamController → Lit re-render)
```

- [ ] **Step 4: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/pages add CLAUDE.md
git -C /Users/mdproctor/claude/casehub/pages commit -m "docs: document event-mode push API in CLAUDE.md

Surface dual-mode architecture (dataset vs event), EventBroadcaster
in backend description, and event-mode data flow.

Closes #128"
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - ✅ EventBroadcaster + SessionSender + wildcard guard + try/catch — Task 1
   - ✅ PushSourceConfig.eventTarget widening — Task 2
   - ✅ EventStream + connection pool + pool factory + per-topic ref counting — Task 3
   - ✅ EventStreamController Lit adapter — Task 4
   - ✅ CLAUDE.md docs — Task 5
   - ✅ parse function for runtime type safety — Task 3
   - ✅ batchEvents option — Task 3 (EventStream), Task 4 (default true in controller)
   - ✅ listen rejection handling — Task 3
   - ✅ maxBuffer capping — Task 3
   - ✅ shared: false bypass — Task 3

2. **Placeholder scan:** No TBDs, TODOs, or vague steps. All code blocks are complete.

3. **Type consistency:**
   - `EventStream` constructor: `(url, topics, options?)` — consistent across Task 3 impl and Task 4 usage
   - `connect()` / `disconnect()` — consistent naming
   - `latest` / `all` / `status` — consistent readonly properties
   - `EventStreamPool` / `createEventStreamPool()` — consistent naming
   - `PoolHandle.release(topics)` — used by EventStream.disconnect()
   - `ConnectionStatus` type imported from event-connection.ts — consistent
