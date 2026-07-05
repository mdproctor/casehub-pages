# Design Tokens & Push Protocol Maturation — Design Spec

**Date:** 2026-07-05
**Branch:** issue-101-tokens-and-push-ops
**Covers:** #101, #105, #106, #107

## Problem

Four issues mature the casehub-pages platform across two domains:

1. **#101 — Flat design token system.** pages-viz has 13 hardcoded CSS tokens (`--pages-accent`, `--pages-bg`, etc.) with no semantic scale, no perceptual colour science, and no non-colour vocabulary (spacing, elevation, motion). blocks-ui has already built a 12-step OKLCH token system — pages should adopt it as the canonical foundation token system, replacing the flat tokens entirely.

2. **#107 — No request-response feedback.** All client→server wire ops (subscribe, unsubscribe, listen, unlisten) are fire-and-forget. Unknown topics are silently ignored. Clients have no way to know if their requests succeeded. This is the foundational gap that #105 and #106 need — wildcard matching needs validation feedback, replay needs confirmation.

3. **#105 — No wildcard topic matching.** `TopicRegistry` supports exact topic matching only. Clients that want events from all topics in a namespace (e.g., all debates) must know and subscribe to each concrete topic individually.

4. **#106 — No event replay.** When a client reconnects, it re-sends `listen` registrations but receives no replay of missed events. The `seq` field on event messages exists but is unused — no persistence, no `since` parameter, no client-side seq tracking.

## Design Principles

- **No backward compatibility.** This platform has no end users. Breaking changes force every caller to be explicit. No compatibility aliases, no shims, no gradual migration.
- **Fix the design, not the callers.** When the right design conflicts with the existing API surface, change the API.
- **Design together.** #107, #105, and #106 are architecturally entangled — ack/error validates wildcards and confirms replay. They are designed as a coherent protocol evolution, not three independent patches.

---

## §1 Wire Protocol Correlation Layer (#107)

Every client→server op gains a required `id` field. The server responds with `ack` or `error` carrying the same `id`. This is a general protocol feature, not listen-specific.

### §1.1 Wire Format

**Client → Server (all ops — `id` required):**

```json
{ "op": "subscribe",   "id": "r1", "dataset": "orders" }
{ "op": "subscribe",   "id": "r2", "dataset": "orders", "since": "cursor-abc" }
{ "op": "unsubscribe", "id": "r3", "dataset": "orders" }
{ "op": "listen",      "id": "r4", "topics": ["debate:abc"] }
{ "op": "listen",      "id": "r5", "topics": ["debate:*"], "since": {"debate:abc": 42} }
{ "op": "unlisten",    "id": "r6", "topics": ["debate:abc"] }
```

**Server → Client (new ops):**

```json
{ "op": "ack",   "id": "r4" }
{ "op": "ack",   "id": "r4", "topics": ["debate:abc"] }
{ "op": "ack",   "id": "r5", "topics": ["debate:*"], "gaps": ["debate:old"] }
{ "op": "error", "id": "r4", "message": "unknown topic: xyz" }
```

`id` is a client-generated string — the client chooses the format (counter, UUID, etc.). The server echoes it back. Missing `id` in a request is a parse error.

### §1.2 Java — PushRequest

`id` added as first field to every record. `parse()` throws `IllegalArgumentException` if `id` is missing.

```java
public sealed interface PushRequest {
    String op();
    String id();

    record Subscribe(String id, String dataset, String since) implements PushRequest {
        public Subscribe { Objects.requireNonNull(id, "id"); Objects.requireNonNull(dataset, "dataset"); }
        public String op() { return "subscribe"; }
    }

    record Unsubscribe(String id, String dataset) implements PushRequest {
        public Unsubscribe { Objects.requireNonNull(id, "id"); Objects.requireNonNull(dataset, "dataset"); }
        public String op() { return "unsubscribe"; }
    }

    record Listen(String id, List<String> topics, Map<String, Long> since) implements PushRequest {
        public Listen {
            Objects.requireNonNull(id, "id");
            topics = topics != null ? List.copyOf(topics) : List.of();
            since = since != null ? Map.copyOf(since) : Map.of();
        }
        public String op() { return "listen"; }
    }

    record Unlisten(String id, List<String> topics) implements PushRequest {
        public Unlisten {
            Objects.requireNonNull(id, "id");
            topics = topics != null ? List.copyOf(topics) : List.of();
        }
        public String op() { return "unlisten"; }
    }

    static PushRequest parse(String json) { ... }
}
```

`Listen` gains `Map<String, Long> since` for §3 (event replay). The `since` field is parsed as an optional JSON object with string keys and numeric values.

**Parse strategy — `since` dual-type handling:** The parser uses eager dual-parse since `Subscribe.since` (String) and `Listen.since` (Map) are structurally distinguishable at the JSON token level. When the parser encounters `since`, it checks the current token: `VALUE_STRING` → store as `stringSince`; `START_OBJECT` → parse as `Map<String, Long>` into `mapSince`. Both are stored independently. The final `switch(op)` passes `stringSince` to `Subscribe` and `mapSince` to `Listen`. This makes field order irrelevant — `since` can appear before or after `op` in the JSON object.

### §1.3 seq type change — String → Long

The existing `PushMessage.event(topic, payload, String seq)` becomes `event(topic, payload, Long seq)`. Wire encoding changes from `writeStringField` to `writeNumberField`. String seq can't be ordered for replay. This is a breaking change to all callers passing string seq values.

### §1.4 Java — PushMessage (new builders)

```java
public static String ack(String id) { ... }
public static String ack(String id, List<String> topics) { ... }
public static String ack(String id, List<String> topics, List<String> gaps) { ... }
public static String error(String id, String message) { ... }
```

`ack(id)` — basic acknowledgment (subscribe/unsubscribe).
`ack(id, topics)` — listen acknowledgment with matched topics.
`ack(id, topics, gaps)` — listen-with-since acknowledgment when replay was incomplete for some topics.

### §1.5 TypeScript — EventConnection

`listen()` and `unlisten()` become Promise-based. The connection generates monotonic request IDs internally, tracks pending requests in a `Map<id, {resolve, reject}>`, and resolves/rejects when ack/error arrives.

```typescript
export interface EventConnection {
    send(message: object): void;
    listen(topics: string[]): Promise<ListenAck>;
    unlisten(topics: string[]): Promise<void>;
    close(): void;
    readonly connected: boolean;
}

export interface ListenAck {
    readonly topics: string[];
    readonly gaps?: string[];
}
```

Incoming `ack`/`error` messages are matched by `id` to pending requests. Unmatched ack/error are silently dropped (stale or duplicate). Pending requests that don't receive a response within a configurable timeout (default 10s) reject with a timeout error.

**Cleanup semantics:** The timeout handler must both reject the Promise and delete the entry from the pending map — otherwise late-arriving acks find a settled entry that is never cleaned up. On `close()` or connection reset (`onclose`), all pending entries are rejected with a "connection closed" error and the map is cleared. This prevents unbounded growth under unreliable connections with frequent timeouts.

### §1.6 TypeScript — push-wire.ts

New shared utilities:

```typescript
export function nextRequestId(): string;      // monotonic counter: "1", "2", "3"...
export function sendSubscribe(ws: WebSocket, id: string, dataset: string, since?: string): void;
export function sendUnsubscribe(ws: WebSocket, id: string, dataset: string): void;
```

Existing `sendListen` and `sendUnlisten` gain an `id` parameter:

```typescript
export function sendListen(ws: WebSocket, id: string, topics: string[], since?: Record<string, number>): void;
export function sendUnlisten(ws: WebSocket, id: string, topics: string[]): void;
```

### §1.7 TypeScript — websocket-source.ts

Subscribe/unsubscribe updated to send `id` and handle ack/error. The internal message handler gains ack/error routing alongside the existing dataset op handling.

### §1.8 Tests

| Test | Verifies |
|------|----------|
| `PushRequest.parse()` with `id` | All four ops extract `id` correctly |
| `PushRequest.parse()` missing `id` | Throws `IllegalArgumentException` |
| `PushMessage.ack(id)` | JSON `{ "op": "ack", "id": "r1" }` |
| `PushMessage.ack(id, topics)` | JSON includes `topics` array |
| `PushMessage.ack(id, topics, gaps)` | JSON includes `gaps` array |
| `PushMessage.error(id, message)` | JSON `{ "op": "error", "id": "r1", "message": "..." }` |
| `PushMessage.event()` seq as Long | Wire encodes seq as number, not string |
| EventConnection listen resolves on ack | Promise resolves with `ListenAck` |
| EventConnection listen rejects on error | Promise rejects with error message |
| EventConnection unlisten resolves on ack | Promise resolves void |
| EventConnection pending request timeout | Promise rejects after timeout, entry removed from map |
| EventConnection close rejects pending | All pending entries rejected with "connection closed", map cleared |
| EventConnection late ack after timeout | No-op — entry already removed by timeout handler |
| websocket-source subscribe sends id | Wire message includes `id` field |
| websocket-source handles ack/error | Ack completes subscription, error logs warning |
| nextRequestId monotonic | Sequential IDs: "1", "2", "3"... |

---

## §2 Wildcard Topic Matching (#105)

Prefix-based wildcard matching. A topic pattern ending in `*` matches any concrete topic starting with the prefix before `*`.

### §2.1 Pattern Semantics

- `debate:*` matches `debate:abc`, `debate:xyz`, `debate:room:123`
- `*` matches all topics
- `debate:abc` (no `*`) is exact match (unchanged)
- `debate:*:sub`, `de*bate` — invalid (rejected by validation)
- Only a single trailing `*` is permitted

### §2.2 Validation

```java
public static boolean isValidTopicOrPattern(String topic) {
    if (topic == null || topic.isEmpty()) return false;
    int starIdx = topic.indexOf('*');
    return starIdx == -1 || starIdx == topic.length() - 1;
}
```

Static method on `TopicRegistry`. The app calls this before `listen()` to validate client input. Invalid patterns get an error response via the §1 correlation layer. `TopicRegistry.listen()` itself does not validate — it trusts the caller.

### §2.3 TopicRegistry Changes

Two internal maps replace the single `topicToConnections`:

```java
private final ConcurrentHashMap<String, CopyOnWriteArraySet<String>> exactTopics;
private final ConcurrentHashMap<String, CopyOnWriteArraySet<String>> wildcardPatterns;
```

`listen()` routes to `exactTopics` or `wildcardPatterns` based on whether the topic ends with `*`. The reverse map (`connectionToTopics`) tracks both kinds and `removeConnection()` cleans up both.

`connections(String topic)` — given a concrete topic being broadcast:

1. Exact lookup in `exactTopics.get(topic)`
2. Scan `wildcardPatterns` — for each pattern, extract prefix (everything before `*`), check `topic.startsWith(prefix)`
3. Union both sets, return `Set.copyOf()`

The wildcard scan is O(n) over registered patterns. Acceptable for typical deployments with a handful of patterns. A trie-based prefix index is the natural optimization if thousands of concurrent patterns are needed — not in scope for v1.

### §2.4 matchedTopics

New method for application-level introspection:

```java
public Set<String> matchedTopics(String pattern) { ... }
```

Returns concrete topics currently registered (in `exactTopics`) that match the given pattern. Useful for apps that want to know what a wildcard resolved to at a point in time.

### §2.5 Client Side

No changes to `EventConnection.listen()` — it already accepts arbitrary strings. Wildcards are a server-side matching concern. The client sends `listen(["debate:*"])`, receives events with concrete topics (`"topic": "debate:abc"`), and tracks per-concrete-topic state.

### §2.6 Tests

| Test | Verifies |
|------|----------|
| `isValidTopicOrPattern` exact topic | `"debate:abc"` → true |
| `isValidTopicOrPattern` trailing wildcard | `"debate:*"` → true |
| `isValidTopicOrPattern` match-all | `"*"` → true |
| `isValidTopicOrPattern` mid-wildcard | `"debate:*:sub"` → false |
| `isValidTopicOrPattern` null/empty | false |
| `connections` exact match | Connection registered for `"debate:abc"` found by `connections("debate:abc")` |
| `connections` wildcard match | Connection registered for `"debate:*"` found by `connections("debate:abc")` |
| `connections` wildcard + exact union | Both connections returned for same topic |
| `connections` no match | Empty set for unregistered topic |
| `connections` match-all `"*"` | Returns connections for any topic |
| `unlisten` wildcard | Wildcard pattern removed, no longer matches |
| `removeConnection` cleans wildcards | Pattern removed from `wildcardPatterns` |
| `matchedTopics` returns matching concrete topics | `"debate:*"` finds `["debate:abc", "debate:xyz"]` |
| Thread safety with wildcards | Concurrent listen/connections across both maps |

---

## §3 Event Replay (#106)

Per-topic sequence numbers with an `EventStore` SPI. The store assigns seq, the server replays on reconnect, the client tracks seq automatically.

### §3.1 EventStore SPI

```java
public interface EventStore {
    long append(String topic, String payloadJson);
    List<StoredEvent> replay(String topic, long sinceSeq);
    Set<String> topics();
}

public record StoredEvent(String topic, String payloadJson, long seq) {}
```

`append` assigns the next monotonic seq for that topic, stores the event, and returns the assigned seq. The caller uses it when building the wire message:

```java
long seq = eventStore.append(topic, payloadJson);
String wire = PushMessage.event(topic, payloadJson, seq);
for (String connId : topicRegistry.connections(topic)) { ... }
```

`replay(topic, sinceSeq)` returns all stored events with `seq > sinceSeq`, ordered by seq ascending.

`topics()` returns the set of all topic names that have at least one stored event. Used by the wildcard+replay integration (§3.5) to discover topics that received events during a client's disconnection.

Events that don't need replay skip the `EventStore` entirely — call `PushMessage.event(topic, payload)` without seq. The client ignores events without seq for tracking purposes.

### §3.2 InMemoryEventStore

Default implementation. Bounded ring buffer per topic with configurable max entries.

```java
public final class InMemoryEventStore implements EventStore {
    private final int maxEventsPerTopic;

    public InMemoryEventStore(int maxEventsPerTopic) {
        this.maxEventsPerTopic = maxEventsPerTopic;
    }

    // Per-topic: ArrayDeque with AtomicLong seq counter
    // append: assign seq, add to deque, evict oldest if over max
    // replay: filter deque for seq > sinceSeq
    // Thread safety: synchronized on per-topic lock object
}
```

Apps that need durable replay provide their own `EventStore` (JDBC, Redis, etc.). The push module stays a library with no persistence dependencies.

### §3.3 Wire Format — listen with since

```json
{ "op": "listen", "id": "r5", "topics": ["debate:abc"], "since": {"debate:abc": 42} }
```

`since` is optional. When present, it is a JSON object mapping topic names to the last-seen seq number (Long). The server replays events with `seq > sinceSeq` for each listed topic.

**Wildcard + since:**

```json
{
    "op": "listen",
    "id": "r6",
    "topics": ["debate:*"],
    "since": {"debate:abc": 5, "debate:xyz": 3}
}
```

The client tracks per-concrete-topic seqs even when subscribed via wildcard. On reconnect, it sends known positions. Topics matching the wildcard but absent from `since` are replayed from the oldest available event.

### §3.4 Replay Delivery

Replayed events are sent as regular `event` messages with their original seq values, **before** the ack. The ack signals "replay complete, you are live":

```
→ { "op": "event", "topic": "debate:abc", "payload": {...}, "seq": 43 }
→ { "op": "event", "topic": "debate:abc", "payload": {...}, "seq": 44 }
→ { "op": "ack", "id": "r5", "topics": ["debate:abc"] }
```

If the requested `since` seq is older than the oldest stored event (events were pruned from the ring buffer), the ack includes a `gaps` field listing affected topics:

```json
{ "op": "ack", "id": "r5", "topics": ["debate:abc"], "gaps": ["debate:abc"] }
```

The client decides how to handle gaps — full resync, ignore, or surface to the user.

### §3.5 Server-Side Integration Pattern

The app's WebSocket endpoint integrates `EventStore` alongside `TopicRegistry`:

```java
private final TopicRegistry topicRegistry = new TopicRegistry();
private final EventStore eventStore = new InMemoryEventStore(1000);

case PushRequest.Listen l -> {
    // Validate topics (§2)
    // Register in TopicRegistry
    topicRegistry.listen(session.getId(), l.topics());

    // Build replay targets: explicit since positions + wildcard-discovered topics
    Map<String, Long> replayTargets = new LinkedHashMap<>(l.since());
    for (String topicOrPattern : l.topics()) {
        if (topicOrPattern.endsWith("*")) {
            String prefix = topicOrPattern.substring(0, topicOrPattern.length() - 1);
            for (String stored : eventStore.topics()) {
                if (stored.startsWith(prefix)) {
                    replayTargets.putIfAbsent(stored, 0L);
                }
            }
        }
    }

    // Replay with gap detection
    List<String> gaps = new ArrayList<>();
    for (Map.Entry<String, Long> entry : replayTargets.entrySet()) {
        List<StoredEvent> events = eventStore.replay(entry.getKey(), entry.getValue());
        if (events.isEmpty()) {
            if (entry.getValue() > 0) gaps.add(entry.getKey());
        } else if (events.get(0).seq() > entry.getValue() + 1) {
            gaps.add(entry.getKey());
        }
        for (StoredEvent e : events) {
            session.send(PushMessage.event(e.topic(), e.payloadJson(), e.seq()));
        }
    }

    // Ack (after replay)
    List<String> matched = l.topics();
    session.send(gaps.isEmpty()
        ? PushMessage.ack(l.id(), matched)
        : PushMessage.ack(l.id(), matched, gaps));
}
```

Wildcard expansion uses `eventStore.topics()` rather than `topicRegistry.matchedTopics()` — the TopicRegistry tracks current listener registrations, but the EventStore is the authority on which topics have replayable events. A topic created during the client's disconnection may have events in the store with no current listeners.

### §3.6 TypeScript — EventConnection seq tracking

Internal `Map<string, number>` tracks the latest seq per concrete topic. Updated on each incoming event with a numeric `seq` field. Events with `seq <= topicSeqs.get(topic)` are silently skipped — this deduplicates events that arrive both via replay and via the live broadcast (a race window exists between `eventStore.append()` and the broadcast loop where a concurrent `listen` could replay an event that is then also broadcast live). On reconnect, the `since` map is built from this tracking and included in the re-sent `listen` call automatically:

```typescript
ws.onopen = () => {
    reconnectAttempt = 0;
    if (listenRegistrations.size > 0 && ws) {
        const since: Record<string, number> = {};
        // Phase 1: seed exact topics from registrations — ensures topics that
        // never received events still get replay from 0 on reconnect
        for (const reg of listenRegistrations) {
            if (!reg.endsWith("*")) {
                since[reg] = topicSeqs.get(reg) ?? 0;
            }
        }
        // Phase 2: add/override with concrete topic positions from topicSeqs
        // that match current registrations (exact or wildcard)
        for (const [topic, seq] of topicSeqs) {
            if (isMatchedByRegistrations(topic, listenRegistrations)) {
                since[topic] = seq;
            }
        }
        const id = nextRequestId();
        sendListen(ws, id, [...listenRegistrations],
            Object.keys(since).length > 0 ? since : undefined);
        // Track pending for reconnect ack (fire-and-forget on reconnect — no Promise to resolve)
    }
};
```

The two-phase construction ensures symmetric reconnect behavior between exact and wildcard topics:
- **Phase 1** seeds exact topics with their known position or `0` (full replay). This handles the case where a topic never received events before disconnection — without it, the topic would be absent from `since` and the server would never replay it.
- **Phase 2** adds concrete topic positions from `topicSeqs` that match current registrations (including wildcard matches). The `isMatchedByRegistrations` check filters out stale entries for unlisted topics (preserving `topicSeqs` entries for potential future re-listen).

Wildcard patterns in `listenRegistrations` are not added to `since` — their expansion is handled server-side at §3.5 via `eventStore.topics()`.

On reconnect, the listen is fire-and-forget (no pending Promise) — the original `listen()` Promise was already resolved or rejected. The reconnect listen is infrastructure, not user-initiated.

### §3.7 Tests

| Test | Verifies |
|------|----------|
| `InMemoryEventStore.append` assigns monotonic seq | Seq 1, 2, 3... per topic |
| `InMemoryEventStore.append` per-topic isolation | Topic A seq independent of topic B |
| `InMemoryEventStore.replay` returns events after sinceSeq | `replay("t", 3)` returns events with seq 4, 5, 6... |
| `InMemoryEventStore.replay` empty topic | Returns empty list |
| `InMemoryEventStore` bounded eviction | Max 3 entries → oldest pruned on 4th append |
| `InMemoryEventStore` thread safety | Concurrent append/replay don't corrupt |
| `PushRequest.parse` listen with since | Extracts `Map<String, Long>` from JSON object |
| `PushRequest.parse` listen without since | `since` is empty map |
| `PushMessage.ack` with gaps | JSON includes `gaps` array |
| EventConnection tracks seq per topic | `topicSeqs` updated on incoming event with seq |
| EventConnection reconnect sends since | Re-sent listen includes accumulated seq map |
| EventConnection reconnect without seq | Re-sent listen has no since (no seq seen yet) |
| Replay events arrive before ack | Client receives events in order, then ack |
| Gap detection — full pruning | sinceSeq older than oldest stored, no events remain → topic in gaps |
| Gap detection — partial pruning | sinceSeq 5, first stored event seq 50 → topic in gaps |
| `EventStore.topics()` empty on fresh store | Returns empty set before any append |
| `EventStore.topics()` returns topic after append | Topic present in set after first append |
| `EventStore.topics()` survives eviction | Topic still present after max evictions (ring buffer retains latest) |
| Wildcard + replay discovers new topics | `debate:*` with `since: {"debate:abc": 5}` replays `debate:new` from seq 0 |
| Client-side dedup | Event with seq <= tracked seq is silently skipped |
| Reconnect since filters stale entries | After unlisten, reconnect since excludes unlisted topic's seq |
| Reconnect since includes wildcard matches | Wildcard registration includes matching concrete topic seqs |
| Reconnect since seeds exact topics at 0 | Exact topic with no prior events gets `since: 0` on reconnect |

---

## §4 Design Token System (#101)

New `pages-ui-tokens` package. Ports blocks-ui's complete OKLCH 12-step token system with `--pages-` prefix. Replaces the flat 13-token system in `pages-viz/src/base/theme.ts` entirely — no compatibility aliases.

**Departure from issue #101 acceptance criteria:** Issue #101 specifies compatibility aliases (`--pages-accent` → `--pages-accent-9`) and "zero breaking changes." This spec intentionally departs from that — the platform has no end users, the migration is mechanical (21 files with a clear mapping table at §4.8), and compatibility aliases add permanent indirection for zero architectural benefit. Issue #101's acceptance criteria will be updated to reflect the direct migration approach before implementation begins.

### §4.1 Package Structure

```
packages/pages-ui-tokens/
├── package.json          (@casehubio/pages-ui-tokens)
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts           (public exports)
    ├── colours.ts         (OKLCH 12-step generateScale)
    ├── tokens.ts          (non-colour token definitions)
    ├── themes.ts          (ThemeConfig, generateThemeCSS, injectTheme, applyThemeMode)
    ├── colours.test.ts
    └── themes.test.ts
```

### §4.2 ThemeConfig

```typescript
export interface ThemeConfig {
    readonly baseHue: number;     // 0-360° — neutral/grayscale tint
    readonly accentHue: number;   // 0-360° — primary accent
    readonly chroma: number;      // saturation (0.12 = moderate)
    readonly contrast: number;    // 0-1, 0.5 = default
}

export const DEFAULT_THEME: ThemeConfig = {
    baseHue: 220,
    accentHue: 245,
    chroma: 0.12,
    contrast: 0.5,
};
```

### §4.3 Colour Generation

Ported from blocks-ui `colours.ts`. OKLCH colour space with Radix-derived 12-step lightness scales:

- Light mode: `[98.5, 96, 92, 88, 82, 72, 62, 55, 50, 43, 35, 18]`
- Dark mode: `[8, 12, 17, 22, 28, 34, 40, 47, 55, 65, 78, 93]`

Dynamic chroma reduction at lightness extremes (>90% or <15% → 0.3× chroma; >80% or <25% → 0.6×). Produces perceptually uniform colour ramps where derived colours at different lightness steps look intentionally related.

Six semantic hues:

| Hue | Source | Chroma |
|-----|--------|--------|
| accent | `config.accentHue` | `config.chroma` |
| neutral | `config.baseHue` | `config.chroma × 0.15` |
| success | fixed 145° | `config.chroma` |
| warning | fixed 55° | `config.chroma` |
| danger | fixed 25° | `config.chroma` |
| info | fixed 210° | `config.chroma` |

72 colour tokens total: `--pages-{hue}-{1..12}`

Step semantic roles (Radix Colors):
- Steps 1-2: backgrounds (app, subtle)
- Steps 3-5: interactive component backgrounds (base, hover, active/selected)
- Steps 6-8: borders and separators (subtle, element, hovered)
- Steps 9-10: solid backgrounds (primary actions, buttons)
- Steps 11-12: text (low-contrast, high-contrast)

### §4.4 Non-Colour Tokens

Ported from blocks-ui `tokens.ts`:

**Spacing (12 steps):**

```typescript
export const SPACING_SCALE: Record<string, string> = {
    '0.5': '2px', '1': '4px', '1.5': '6px', '2': '8px',
    '3': '12px', '4': '16px', '5': '20px', '6': '24px',
    '8': '32px', '10': '40px', '12': '48px', '16': '64px',
};
```

**Typography:**

```typescript
export const TYPOGRAPHY = {
    family: "'Inter', system-ui, -apple-system, sans-serif",
    sizes: { xs: '11px', sm: '12px', base: '14px', lg: '16px', xl: '20px', '2xl': '24px' },
    lineHeights: { xs: '16px', sm: '16px', base: '20px', lg: '24px', xl: '28px', '2xl': '32px' },
    weights: { normal: '400', medium: '500', semibold: '600' },
} as const;
```

**Elevation (light/dark variants):**

```typescript
export const ELEVATION_LIGHT = {
    shadow: {
        '1': '0 1px 2px oklch(0% 0 0 / 0.05)',
        '2': '0 2px 4px oklch(0% 0 0 / 0.08), 0 1px 2px oklch(0% 0 0 / 0.04)',
        '3': '0 4px 12px oklch(0% 0 0 / 0.10), 0 2px 4px oklch(0% 0 0 / 0.06)',
        '4': '0 8px 24px oklch(0% 0 0 / 0.12), 0 4px 8px oklch(0% 0 0 / 0.08)',
    },
} as const;
```

**Motion:** `duration: { fast, normal, slow }`, `easing: { out, inOut }`

**Radius:** `{ sm: '4px', md: '6px', lg: '8px' }`

**Surface overlays:** `--pages-surface-{1..4}` — light mode uses black with opacity 0.02–0.08; dark mode uses white with opacity 0.05–0.14.

**Density compact overrides:** `.pages-density-compact` CSS class reduces spacing and font sizes.

### §4.5 Theme Application

```typescript
export function generateThemeCSS(config: ThemeConfig): string;
```

Generates complete CSS text with three class definitions:
- `.pages-theme-light { /* shared tokens + light colours + light elevation */ }`
- `.pages-theme-dark { /* shared tokens + dark colours + dark elevation */ }`
- `.pages-density-compact { /* spacing/font overrides */ }`

```typescript
export function injectTheme(config: ThemeConfig, target?: HTMLElement): void;
```

Creates `<style data-pages-theme>` element with generated CSS, prepends to target (defaults to `document.documentElement`). Removes existing theme style if present.

```typescript
export function applyThemeMode(element: HTMLElement, mode: "light" | "dark"): void;
```

Sets `pages-theme-light` or `pages-theme-dark` CSS class on element. Removes the other.

### §4.6 site.ts Changes

```typescript
// OLD
import { applyTheme, LIGHT_THEME, DARK_THEME } from "@casehubio/pages-viz/dist/base/theme.js";
import type { PagesTheme } from "@casehubio/pages-viz/dist/base/theme.js";
// ...
applyTheme(target, isDark ? DARK_THEME : LIGHT_THEME);

// NEW
import { injectTheme, applyThemeMode, DEFAULT_THEME } from "@casehubio/pages-ui-tokens";
// ...
injectTheme(options?.themeConfig ?? DEFAULT_THEME, target);
applyThemeMode(target, isDark ? "dark" : "light");
```

`SiteOptions` gains optional `themeConfig?: ThemeConfig`.

`LiveSite.setTheme()` simplified: `setTheme(mode: "light" | "dark")`. The `PagesTheme` object parameter is removed. The method continues to update ECharts theme properties on registered viz elements — ECharts cannot read CSS custom properties and requires a JavaScript API call to switch themes:

```typescript
setTheme(mode: "light" | "dark"): void {
    applyThemeMode(target, mode);
    const echartsThemeName = mode === "dark" ? "dark" : "";
    for (const [, entry] of registry) {
        const vizEl = entry.vizElement;
        if (vizEl && "buildOption" in vizEl) {
            (vizEl as { theme: string }).theme = echartsThemeName;
        }
    }
}
```

### §4.7 Deleted Exports

From `pages-viz/src/base/theme.ts` — all removed:
- `PagesTheme` interface
- `LIGHT_THEME` constant
- `DARK_THEME` constant
- `TOKEN_MAP` array
- `applyTheme()` function
- `clearTheme()` function

The file is deleted. `pages-viz` no longer owns theming.

### §4.8 Component Migration

21 files reference `--pages-*` tokens. Every `var(--pages-*)` reference updates to the 12-step system:

| Old token | New token | Semantic role |
|-----------|-----------|---------------|
| `--pages-font` | `--pages-font-family` | Font family |
| `--pages-font-size` | `--pages-font-size-base` | Base font size |
| `--pages-text` | `--pages-neutral-12` | Primary text |
| `--pages-text-muted` | `--pages-neutral-11` | Secondary text |
| `--pages-bg` | `--pages-neutral-1` | Background |
| `--pages-bg-alt` | `--pages-neutral-2` | Subtle background |
| `--pages-bg-hover` | `--pages-accent-4` | Interactive hover |
| `--pages-bg-disabled` | `--pages-neutral-3` | Disabled background |
| `--pages-bg-selected` | `--pages-accent-5` | Selected row background |
| `--pages-border` | `--pages-neutral-6` | Border |
| `--pages-radius` | `--pages-radius-sm` | Border radius |
| `--pages-accent` | `--pages-accent-9` | Primary action |
| `--pages-accent-hover` | `--pages-accent-10` | Primary hover |
| `--pages-accent-subtle` | `--pages-accent-3` | Subtle accent background |
| `--pages-alert-info-bg` | `--pages-info-3` | Info alert background |
| `--pages-alert-info-color` | `--pages-info-11` | Info alert text |
| `--pages-alert-warning-bg` | `--pages-warning-3` | Warning alert background |
| `--pages-alert-warning-color` | `--pages-warning-11` | Warning alert text |
| `--pages-alert-error-bg` | `--pages-danger-3` | Error alert background |
| `--pages-alert-error-color` | `--pages-danger-11` | Error alert text |
| `--pages-alert-success-bg` | `--pages-success-3` | Success alert background |
| `--pages-alert-success-color` | `--pages-success-11` | Success alert text |
| `--pages-row-danger-bg` | `--pages-danger-3` | Danger row background |
| `--pages-row-warning-bg` | `--pages-warning-3` | Warning row background |
| `--pages-row-success-bg` | `--pages-success-3` | Success row background |
| `--pages-row-muted-bg` | `--pages-neutral-3` | Muted row background |
| `--pages-btn-primary-bg` | `--pages-accent-9` | Primary button |
| `--pages-btn-primary-hover-bg` | `--pages-accent-10` | Primary button hover |
| `--pages-btn-danger-bg` | `--pages-danger-9` | Danger button |
| `--pages-btn-danger-hover-bg` | `--pages-danger-10` | Danger button hover |
| `--pages-btn-secondary-bg` | `--pages-neutral-8` | Secondary button |
| `--pages-btn-secondary-hover-bg` | `--pages-neutral-9` | Secondary button hover |
| `--pages-error-bg` | `--pages-danger-3` | Error status background (unify with alert-error) |
| `--pages-error-color` | `--pages-danger-11` | Error status text (unify with alert-error) |
| `--pages-error-border` | `--pages-danger-6` | Error status border |
| `--pages-success-bg` | `--pages-success-3` | Success status background (unify with alert-success) |
| `--pages-success-color` | `--pages-success-11` | Success status text (unify with alert-success) |
| `--pages-success-border` | `--pages-success-6` | Success status border |
| `--pages-border-radius` | `--pages-radius-sm` | Border radius (alias of `--pages-radius`) |
| `--pages-spacing-sm` | `--pages-space-2` | Small spacing (0.5rem → 8px) |

Component-specific tokens (`--pages-badge-gap`, `--pages-countdown-font-size`, `--pages-badge-radius`, `--pages-btn-padding`) are NOT global design tokens. They remain as component-scoped CSS custom properties.

Button text colours (`--pages-btn-primary-color`, `--pages-btn-danger-color`, `--pages-btn-secondary-color`) are hardcoded to `white` — they are contrast values for text on step-9/10 solid backgrounds, not semantic scale steps. The 12-step system does not provide "text on solid" tokens; contrast is an invariant of the step-9/10 design.

`--pages-font-size-sm` already exists in the new typography scale at 12px. PagesActionButton's current fallback (13px) aligns to 12px when the theme is injected — a 1px value change, not a token rename.

CSS `var()` calls retain fallback values for defensive rendering — a component without injected theme should still be usable:

```css
color: var(--pages-neutral-12, #333);
background: var(--pages-accent-9, #5470c6);
```

### §4.9 Tests

| Test | Verifies |
|------|----------|
| `generateScale` 12 steps produced | Returns object with keys "1" through "12" |
| `generateScale` OKLCH format | Values match `oklch(N% C H)` pattern |
| `generateScale` chroma reduction at extremes | Steps 1, 12 have reduced chroma |
| `generateScale` light vs dark inversion | Light step 1 ≈ 98.5%, dark step 1 ≈ 8% |
| `generateScale` contrast modifier | Higher contrast shifts lightness |
| `generateThemeCSS` contains all three classes | `.pages-theme-light`, `.pages-theme-dark`, `.pages-density-compact` |
| `generateThemeCSS` contains all 72 colour tokens | 6 hues × 12 steps present |
| `generateThemeCSS` contains spacing tokens | `--pages-space-*` present |
| `generateThemeCSS` contains typography tokens | `--pages-font-family`, sizes, weights |
| `generateThemeCSS` contains elevation tokens | `--pages-shadow-*`, light/dark variants differ |
| `generateThemeCSS` contains motion tokens | `--pages-duration-*`, `--pages-ease-*` |
| `generateThemeCSS` contains radius tokens | `--pages-radius-sm`, `-md`, `-lg` |
| `generateThemeCSS` contains surface tokens | `--pages-surface-*` with mode-specific opacity |
| `injectTheme` creates style element | `<style data-pages-theme>` prepended to target |
| `injectTheme` replaces existing | Second call removes first style element |
| `applyThemeMode` sets correct class | `"light"` → `.pages-theme-light`, removes `.pages-theme-dark` |
| `DEFAULT_THEME` produces valid CSS | No NaN, no undefined in generated output |
| Density compact overrides | `.pages-density-compact` shrinks space and font tokens |

---

## Implementation Order

1. **§4 Design tokens** — new package, no dependencies on push protocol work
2. **§1 Wire protocol correlation** — foundation for §2 and §3
3. **§2 Wildcard matching** — depends on §1 for error feedback on invalid patterns
4. **§3 Event replay** — depends on §1 (ack with gaps) and §2 (wildcard + since interaction)

§4 can be implemented in parallel with §1. §2 and §3 are sequential after §1.

The component migration (§4.8) can happen after §4 is complete, as a mechanical pass across 21 files.

## Breaking Changes

- `PushRequest` — all records gain required `id` parameter. `parse()` rejects missing `id`.
- `PushMessage.event()` — `seq` parameter type changes from `String` to `Long`.
- `EventConnection.listen()` — return type changes from `void` to `Promise<ListenAck>`.
- `EventConnection.unlisten()` — return type changes from `void` to `Promise<void>`.
- `sendListen`, `sendUnlisten` — gain required `id` parameter.
- `PagesTheme`, `LIGHT_THEME`, `DARK_THEME` — deleted from `pages-viz`.
- `applyTheme(element, theme)` — deleted. Replaced by `injectTheme()` + `applyThemeMode()`.
- `LiveSite.setTheme()` — no longer accepts `PagesTheme` object, only `"light" | "dark"`.
- `SiteOptions` — gains `themeConfig?: ThemeConfig`.
- All `--pages-*` CSS custom properties — renamed to 12-step equivalents. 21 files updated.
- `websocket-source.ts` — subscribe/unsubscribe wire format includes `id`.

## Files

### New files

| File | Purpose |
|------|---------|
| `packages/pages-ui-tokens/package.json` | Package descriptor |
| `packages/pages-ui-tokens/tsconfig.json` | TypeScript config |
| `packages/pages-ui-tokens/vitest.config.ts` | Test config |
| `packages/pages-ui-tokens/src/index.ts` | Public exports |
| `packages/pages-ui-tokens/src/colours.ts` | OKLCH 12-step scale generation |
| `packages/pages-ui-tokens/src/tokens.ts` | Non-colour token definitions |
| `packages/pages-ui-tokens/src/themes.ts` | ThemeConfig, CSS generation, injection |
| `packages/pages-ui-tokens/src/colours.test.ts` | Colour generation tests |
| `packages/pages-ui-tokens/src/themes.test.ts` | Theme generation and injection tests |
| `backend/push/src/main/java/io/casehub/pages/push/EventStore.java` | Event store SPI |
| `backend/push/src/main/java/io/casehub/pages/push/StoredEvent.java` | Stored event record |
| `backend/push/src/main/java/io/casehub/pages/push/InMemoryEventStore.java` | Default in-memory ring buffer |
| `backend/push/src/test/java/io/casehub/pages/push/InMemoryEventStoreTest.java` | Event store tests |

### Modified files

| File | Change |
|------|--------|
| `backend/push/src/main/java/io/casehub/pages/push/PushRequest.java` | Add `id` to all records, add `since` to Listen, parse `id` and `since` |
| `backend/push/src/main/java/io/casehub/pages/push/PushMessage.java` | Add ack/error builders, change event seq to Long |
| `backend/push/src/main/java/io/casehub/pages/push/TopicRegistry.java` | Split into exactTopics/wildcardPatterns, wildcard-aware connections(), isValidTopicOrPattern(), matchedTopics() |
| `backend/push/src/test/java/io/casehub/pages/push/PushRequestTest.java` | Update for id, add since tests |
| `backend/push/src/test/java/io/casehub/pages/push/PushMessageTest.java` | Add ack/error tests, update seq tests |
| `backend/push/src/test/java/io/casehub/pages/push/TopicRegistryTest.java` | Add wildcard, matchedTopics, validation tests |
| `packages/pages-data/src/dataset/external/sources/push-wire.ts` | Add id parameter to sendListen/sendUnlisten, add nextRequestId, sendSubscribe, sendUnsubscribe |
| `packages/pages-data/src/dataset/external/sources/push-wire.test.ts` | Update for id, add new utility tests |
| `packages/pages-data/src/dataset/external/sources/event-connection.ts` | Promise-based listen/unlisten, ack/error handling, seq tracking, since on reconnect |
| `packages/pages-data/src/dataset/external/sources/event-connection.test.ts` | Update for Promise API, add ack/error/seq/replay tests |
| `packages/pages-data/src/dataset/external/sources/websocket-source.ts` | Add id to subscribe/unsubscribe, handle ack/error |
| `packages/pages-data/src/dataset/external/sources/websocket-source.test.ts` | Update for id, add ack/error tests |
| `packages/pages-data/src/dataset/external/index.ts` | Export ListenAck |
| `packages/pages-runtime/src/site.ts` | Replace theme imports, use injectTheme/applyThemeMode, add themeConfig to SiteOptions |
| `packages/pages-runtime/src/site.test.ts` | Update theme tests for new API |
| `packages/pages-viz/src/index.ts` | Remove theme-related exports (`PagesTheme`, `LIGHT_THEME`, `DARK_THEME`, `applyTheme`, `clearTheme`) |
| `packages/pages-viz/src/base/theme.ts` | **Deleted** |
| `packages/pages-viz/src/base/theme.test.ts` | **Deleted** |
| `packages/pages-viz/src/base/PagesElement.ts` | Update token references |
| `packages/pages-viz/src/components/PagesTable.ts` | Migrate flat tokens → 12-step |
| `packages/pages-viz/src/components/PagesMetric.ts` | Migrate flat tokens → 12-step |
| `packages/pages-viz/src/components/PagesAlert.ts` | Migrate flat tokens → 12-step |
| `packages/pages-viz/src/components/PagesAlert.test.ts` | Update token assertions |
| `packages/pages-viz/src/components/PagesBadge.ts` | Migrate flat tokens → 12-step |
| `packages/pages-viz/src/components/PagesCountdown.ts` | Migrate flat tokens → 12-step |
| `packages/pages-viz/src/components/PagesActionButton.ts` | Migrate flat tokens → 12-step |
| `packages/pages-viz/src/components/PagesSelector.ts` | Migrate flat tokens → 12-step |
| `packages/pages-viz/src/components/table-row-style.test.ts` | Update token assertions |
| `packages/pages-viz/src/form-inputs/PagesTextInput.ts` | Migrate flat tokens → 12-step |
| `packages/pages-viz/src/form-inputs/PagesDatePicker.ts` | Migrate flat tokens → 12-step |
| `packages/pages-viz/src/form-inputs/PagesCheckbox.ts` | Migrate flat tokens → 12-step |
| `packages/pages-viz/src/form-inputs/PagesTextarea.ts` | Migrate flat tokens → 12-step |
| `packages/pages-viz/src/form-inputs/PagesNumberInput.ts` | Migrate flat tokens → 12-step |
| `packages/pages-viz/src/form-inputs/PagesDropdown.ts` | Migrate flat tokens → 12-step |
| `packages/pages-component/src/renderer/interactive.ts` | Migrate flat tokens → 12-step |
| `packages/pages-runtime/src/activation.ts` | Migrate flat tokens → 12-step |
| `package.json` | Add pages-ui-tokens to workspace |

## Not in Scope

- blocks-ui migration from `--blocks-*` to `--pages-*` — #112
- DraftHouse/Connectors adoption of new push protocol — #115 (also tracked in HANDOFF.md)
- Durable EventStore implementations (JDBC, Redis) — #113
- Nested wildcard patterns (`debate:room:*:summary`) — #114

**Design decision — per-topic seq only:** Global seq (cross-topic ordering) is not deferred, it is explicitly not supported. Per-topic seq is sufficient because topics are independent event streams — cross-topic ordering would require a single shared sequence generator, adding contention and coupling for no use case in the current platform. If cross-topic ordering becomes needed, it belongs in the application layer as a higher-order construct, not in the EventStore SPI.

## Note: `since` field disambiguation

Two different `since` fields exist in the protocol:
- `Subscribe.since` — `String`, opaque cursor for dataset resumption (pre-existing, unchanged)
- `Listen.since` — `Map<String, Long>`, per-topic seq positions for event replay (new in §3)

These serve different subsystems (datasets vs events) and use different types. No ambiguity in the wire format — `subscribe` carries a string `since`, `listen` carries an object `since`.
- Dashboard CRUD, IndexedDB — unrelated to these issues
