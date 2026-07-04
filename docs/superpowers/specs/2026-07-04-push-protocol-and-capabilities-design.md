# Push Protocol Types, Event Infrastructure & Capability Discovery — Design Spec

**Date:** 2026-07-04
**Branch:** issue-89-small-issues-batch
**Covers:** #89, #98, #99, #100

## Problem

Four issues share a common theme: the push protocol infrastructure is underspecified and fragmented.

1. **#100 — No typed wire protocol SDK.** Java backends that speak the pages push protocol use untyped structures and manual JSON formatting. DraftHouse constructs event messages via string concatenation (`WebSocketEventBus.formatEvent`, `DebateWebSocket.sendEvent`). The connectors chat-demo builds dataset ops (`snapshot`, `append`, `replace`, `remove`) via Jackson `ObjectMapper` serialization of `Map` structures — no event ops, but the same untyped pattern. Both are error-prone and subject to format drift.

2. **#98 — No event topic subscriptions.** The `event` op broadcasts to all connections. Clients cannot tell the server which event topics they care about. DraftHouse works around this by misusing dataset `subscribe` as a signaling mechanism.

3. **#99 — No event-only connection API.** `PushSource.subscribe()` requires a `DataSetId`, `ExternalDataSetDef`, and `DataSetEventListener`. Consumers that just want WebSocket events (no tabular datasets) must subscribe to a dataset they never use.

4. **#89 — No capability discovery.** The data pipeline has no way to ask the backend what it can do. Components cannot adapt their UI (e.g., hide SQL config when no SQL provider exists). Three of four original scope items were completed in earlier branches; the remaining item is capability introspection.

## Design

### §1 Java Push Protocol Types (#100)

New Maven module: `backend/push/`

**Coordinates:** `io.casehub:casehub-pages-push:0.1-SNAPSHOT`
**Package:** `io.casehub.pages.push`
**Dependencies:** `jackson-core` only (streaming parser). No Quarkus, no Jakarta, no `jackson-databind`.

#### §1.1 PushColumn

```java
public record PushColumn(String id, String name, String type) {

    public PushColumn {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(name, "name");
        Objects.requireNonNull(type, "type");
    }
}
```

Matches the frontend `Column` type's wire representation. `type` is one of `"NUMBER"`, `"DATE"`, `"LABEL"`, `"TEXT"`.

#### §1.2 PushMessage (builders — server → client)

Static factory methods returning `String` (JSON). Each method produces a complete wire message ready to send on a WebSocket.

```java
public final class PushMessage {

    // Event ops
    public static String event(String topic, String payloadJson) { ... }
    public static String event(String topic, String payloadJson, String seq) { ... }

    // Dataset ops
    public static String snapshot(String dataset, List<PushColumn> columns,
                                  List<List<String>> rows) { ... }
    public static String snapshot(String dataset, List<PushColumn> columns,
                                  List<List<String>> rows, String seq) { ... }

    public static String append(String dataset, List<PushColumn> columns,
                                List<List<String>> rows) { ... }
    public static String append(String dataset, List<PushColumn> columns,
                                List<List<String>> rows, String seq) { ... }

    public static String replace(String dataset, List<PushColumn> columns,
                                 String key, List<String> row) { ... }
    public static String replace(String dataset, List<PushColumn> columns,
                                 String key, List<String> row, String seq) { ... }

    public static String remove(String dataset, String key) { ... }
    public static String remove(String dataset, String key, String seq) { ... }

    private PushMessage() {}
}
```

Implementation uses `jackson-core` `JsonGenerator` writing to `StringWriter`. No reflection, no databind. The `payloadJson` parameter in `event()` is a pre-serialized JSON string — the caller owns serialization of domain objects. This avoids forcing an `ObjectMapper` dependency on consumers.

#### §1.3 PushRequest (parsers — client → server)

Sealed interface with four record implementations. Parsed from incoming WebSocket text frames.

```java
public sealed interface PushRequest {

    String op();

    record Subscribe(String dataset, String since) implements PushRequest {
        public String op() { return "subscribe"; }
    }

    record Unsubscribe(String dataset) implements PushRequest {
        public String op() { return "unsubscribe"; }
    }

    record Listen(List<String> topics) implements PushRequest {
        public String op() { return "listen"; }
    }

    record Unlisten(List<String> topics) implements PushRequest {
        public String op() { return "unlisten"; }
    }

    static PushRequest parse(String json) { ... }
}
```

`parse()` uses `jackson-core` `JsonParser` (streaming). Throws `IllegalArgumentException` on unknown op or malformed JSON.

#### §1.4 TopicRegistry (connection tracking utility)

Thread-safe in-memory tracker for which connections are listening to which topics.

```java
public final class TopicRegistry {

    public void listen(String connectionId, List<String> topics) { ... }

    public void unlisten(String connectionId, List<String> topics) { ... }

    public void removeConnection(String connectionId) { ... }

    public Set<String> connections(String topic) { ... }
}
```

- `connections(topic)` returns an unmodifiable snapshot (`Set.copyOf()`) of connection IDs currently listening to that topic. Safe for iteration during broadcast without `ConcurrentModificationException`.
- `removeConnection` cleans up all topic registrations for a disconnected client.
- Thread safety: topic → connections uses `ConcurrentHashMap<String, CopyOnWriteArraySet<String>>`. A reverse `ConcurrentHashMap<String, Set<String>>` (connection → topics) enables O(1) cleanup in `removeConnection`. `listen()` adding to multiple topics is not cross-topic atomic — a concurrent `connections()` call may see partially-registered state. This is acceptable: the only consequence is a brief window where a message is delivered to an incomplete listener set.
- Wildcard matching (e.g., `debate:*`) is not in v1 (#105).

Each consuming app's WebSocket endpoint creates one `TopicRegistry` instance. The push module provides the data structure; the app owns the WebSocket lifecycle.

#### §1.5 Module structure

```
backend/push/
├── pom.xml
└── src/
    ├── main/java/io/casehub/pages/push/
    │   ├── PushMessage.java
    │   ├── PushColumn.java
    │   ├── PushRequest.java
    │   └── TopicRegistry.java
    └── test/java/io/casehub/pages/push/
        ├── PushMessageTest.java
        ├── PushRequestTest.java
        └── TopicRegistryTest.java
```

**pom.xml dependencies:**

```xml
<dependencies>
    <dependency>
        <groupId>com.fasterxml.jackson.core</groupId>
        <artifactId>jackson-core</artifactId>
    </dependency>
    <dependency>
        <groupId>org.junit.jupiter</groupId>
        <artifactId>junit-jupiter</artifactId>
        <scope>test</scope>
    </dependency>
</dependencies>
```

No Quarkus test infrastructure needed — plain JUnit 5.

#### §1.6 Tests

| Test | Verifies |
|------|----------|
| `PushMessage.event()` round-trip | JSON output matches wire format, topic and payload preserved |
| `PushMessage.event()` with seq | `seq` field present when provided |
| `PushMessage.snapshot()` with columns and rows | Correct column array, row array, dataset field |
| `PushMessage.append()` | Same structure as snapshot with `op: "append"` |
| `PushMessage.replace()` with key and row | `key` field, single `row` (not `rows`) |
| `PushMessage.remove()` with key | Only `op`, `dataset`, `key` fields |
| `PushRequest.parse()` subscribe | Extracts dataset and optional since |
| `PushRequest.parse()` unsubscribe | Extracts dataset |
| `PushRequest.parse()` listen | Extracts topics list |
| `PushRequest.parse()` unlisten | Extracts topics list |
| `PushRequest.parse()` unknown op | Throws `IllegalArgumentException` |
| `PushRequest.parse()` malformed JSON | Throws `IllegalArgumentException` |
| `TopicRegistry` listen/connections | Connection appears in topic's connection set |
| `TopicRegistry` unlisten | Connection removed from topic set |
| `TopicRegistry` removeConnection | All topic registrations cleaned up |
| `TopicRegistry` thread safety | Concurrent listen/unlisten/connections don't corrupt state |
| `TopicRegistry` connections snapshot | Returned set is unmodifiable; mutations to registry don't affect it |

---

### §2 listen/unlisten Wire Protocol (#98)

#### §2.1 Wire format

**Client → Server:**

```json
{ "op": "listen", "topics": ["debate:abc123", "file:/path/to/doc.md"] }
{ "op": "unlisten", "topics": ["debate:abc123"] }
```

**Server → Client (existing, unchanged):**

```json
{ "op": "event", "topic": "debate:abc123", "payload": { ... }, "seq": "seq-43" }
```

The `seq` field on event messages is optional server-provided metadata for ordering. Server-side event replay (using `seq` for resumption) is deferred until event persistence is designed — see #106.

#### §2.2 Server-side integration pattern

Each consuming app's WebSocket endpoint integrates `TopicRegistry` from §1.4:

```java
// In DraftHouse DebateWebSocket (illustrative, not prescriptive)
private final TopicRegistry topicRegistry = new TopicRegistry();

@OnMessage
void onMessage(Session session, String message) {
    PushRequest req = PushRequest.parse(message);
    switch (req) {
        case PushRequest.Listen l ->
            topicRegistry.listen(session.getId(), l.topics());
        case PushRequest.Unlisten u ->
            topicRegistry.unlisten(session.getId(), u.topics());
        case PushRequest.Subscribe s -> // existing dataset handling
            ...
        case PushRequest.Unsubscribe u -> // existing dataset handling
            ...
    }
}

@OnClose
void onClose(Session session) {
    topicRegistry.removeConnection(session.getId());
}

// When pushing an event:
void pushEvent(String topic, String payloadJson) {
    String message = PushMessage.event(topic, payloadJson);
    for (String connId : topicRegistry.connections(topic)) {
        Session session = sessions.get(connId);
        if (session != null && session.isOpen()) {
            session.getAsyncRemote().sendText(message);
        }
    }
}
```

Consuming apps choose when to adopt. The push module provides types and tracking; migration is incremental.

#### §2.3 Client-side — shared wire utilities

New file: `packages/pages-data/src/dataset/external/sources/push-wire.ts`

Wire format serialization and event dispatch logic shared by both `push-source.ts` and `event-connection.ts`:

```typescript
export function buildConnectionUrl(
    baseUrl: string,
    config?: { relay?: { endpoint: string }; auth?: { type: "query-param"; paramName?: string; token: string } },
): string {
    let url = new URL(baseUrl);
    if (config?.relay) {
        url = new URL(config.relay.endpoint);
        url.searchParams.set("target", baseUrl);
    }
    if (config?.auth?.type === "query-param") {
        url.searchParams.set(config.auth.paramName ?? "token", config.auth.token);
    }
    return url.toString();
}

export function sendListen(ws: WebSocket, topics: string[]): void {
    ws.send(JSON.stringify({ op: "listen", topics }));
}

export function sendUnlisten(ws: WebSocket, topics: string[]): void {
    ws.send(JSON.stringify({ op: "unlisten", topics }));
}

export function dispatchWireEvent(
    msg: { topic?: string; payload?: unknown },
    eventTarget: EventTarget,
): void {
    if (msg.topic) {
        eventTarget.dispatchEvent(new CustomEvent("pages-event", {
            bubbles: true,
            composed: true,
            detail: { topic: msg.topic, payload: msg.payload },
        }));
    }
}
```

`buildConnectionUrl` applies relay URL rewriting and query-param auth — extracted from `websocket-source.ts`'s closure-scoped version. Both `createWebSocketSource` and `createEventConnection` call it to ensure consistent URL construction.

`processWireMessage` in `push-source.ts` is updated to call `dispatchWireEvent()` for its event branch (lines 54–62), replacing the inline `CustomEvent` dispatch. The dataset branches are unchanged.

`sendListen` and `sendUnlisten` are used only by `EventConnection` (§3) — they are not exposed on the `PushSource` interface.

#### §2.4 push-wire.ts tests

| Test | Verifies |
|------|----------|
| `buildConnectionUrl` plain URL | Returns URL unchanged |
| `buildConnectionUrl` with relay | URL rewritten through relay endpoint with `target` param |
| `buildConnectionUrl` with query-param auth | Token appended as query parameter |
| `buildConnectionUrl` with relay + auth | Both applied |
| `dispatchWireEvent` with topic and payload | `pages-event` CustomEvent fired on eventTarget with correct detail |
| `dispatchWireEvent` without topic | No event dispatched |
| `sendListen` serialization | JSON `{ op: "listen", topics: [...] }` sent on WebSocket |
| `sendUnlisten` serialization | JSON `{ op: "unlisten", topics: [...] }` sent on WebSocket |

---

### §3 createEventConnection API (#99)

File: `packages/pages-data/src/dataset/external/sources/event-connection.ts`

#### §3.1 Interface

```typescript
export interface EventConnection {
    send(message: object): void;
    listen(topics: string[]): void;
    unlisten(topics: string[]): void;
    close(): void;
    readonly connected: boolean;
}

export function createEventConnection(
    url: string,
    config?: PushSourceConfig,
): EventConnection;
```

#### §3.2 Implementation

`createEventConnection` creates a dedicated WebSocket connection (not pooled — event connections have independent lifecycles from dataset connections).

```typescript
export function createEventConnection(
    url: string,
    config?: PushSourceConfig,
): EventConnection {
    let ws: WebSocket | null = null;
    let reconnectAttempt = 0;
    let closed = false;
    const listenRegistrations = new Set<string>();

    const connectionUrl = buildConnectionUrl(url, config);

    function connect(): void { ... }
    // Opens WebSocket to connectionUrl (relay/auth already applied)
    // Reconnection with exponential backoff (1s → 30s)
    // On open: re-send all active listen registrations
    // On message: unwrap arrays, dispatch events via dispatchWireEvent()
    // On close: reconnect if not permanently closed

    connect();

    return {
        get connected() { return ws?.readyState === WebSocket.OPEN; },

        send(message: object): void {
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(message));
            }
        },

        listen(topics: string[]): void {
            for (const t of topics) {
                listenRegistrations.add(t);
            }
            if (ws?.readyState === WebSocket.OPEN) {
                sendListen(ws, topics);
            }
            // If not connected, will be sent on reconnect
        },

        unlisten(topics: string[]): void {
            for (const t of topics) {
                listenRegistrations.delete(t);
            }
            if (ws?.readyState === WebSocket.OPEN) {
                sendUnlisten(ws, topics);
            }
        },

        close(): void {
            closed = true;
            listenRegistrations.clear();
            ws?.close(1000, "client closed");
            ws = null;
        },
    };
}
```

#### §3.3 Event dispatching

Incoming messages on the event connection use the shared `dispatchWireEvent()` from `push-wire.ts`, the same function used by `processWireMessage`'s event branch:

```typescript
function handleMessage(data: string): void {
    let parsed: unknown;
    try {
        parsed = JSON.parse(data);
    } catch {
        console.warn("[EventConnection] Failed to parse message:", data);
        return;
    }
    const messages = Array.isArray(parsed) ? parsed : [parsed];
    for (const msg of messages) {
        if (typeof msg === "object" && msg !== null
            && (msg as Record<string, unknown>).op === "event"
            && config?.eventTarget) {
            dispatchWireEvent(msg as { topic?: string; payload?: unknown }, config.eventTarget);
        }
    }
}
```

Array unwrapping matches `websocket-source.ts`'s existing pattern — servers may batch multiple events into a single WebSocket frame (as `ChatWebSocketBroadcaster.buildSnapshot()` does for dataset ops). Only `event` ops are processed; other op types are silently ignored. Wire format changes propagate via the shared `dispatchWireEvent()` function.

#### §3.4 Relationship to existing infrastructure

| Concern | PushSource (datasets) | EventConnection (events) |
|---------|----------------------|--------------------------|
| Purpose | Tabular data subscriptions | Topic-based event delivery |
| Subscribe mechanism | `subscribe(dataSetId, def, listener, onError)` | `listen(topics)` |
| Data target | `DataSetManager.apply()` | `pages-event` CustomEvent |
| Connection pooling | Yes (PushPool by base URL) | No (independent lifecycle) |
| Wire ops handled | snapshot, append, replace, remove, event | event only |
| Reconnection | Re-subscribes all datasets | Re-sends all listen registrations |

They share the same WebSocket transport layer but are conceptually parallel: one for structured data, one for events.

#### §3.5 Tests

| Test | Verifies |
|------|----------|
| `createEventConnection` establishes WebSocket | Connection opens, `connected` returns true |
| `listen` sends wire op | JSON `{ op: "listen", topics: [...] }` sent |
| `listen` with multiple topics | All topics included in wire message |
| `unlisten` sends wire op | JSON `{ op: "unlisten", topics: [...] }` sent |
| `send` forwards arbitrary JSON | Message serialized and sent on WebSocket |
| Incoming event dispatches CustomEvent | `pages-event` fired on eventTarget with topic/payload |
| Reconnection re-sends listen registrations | All active topics re-sent on reconnect |
| `close()` tears down cleanly | WebSocket closed, no reconnection attempted |
| Batch (array-wrapped) events dispatched | `[{op:"event",...},{op:"event",...}]` dispatches both events |
| Relay config applied to connection URL | WebSocket connects through relay endpoint |
| Auth config applied to connection URL | Query-param token appended to connection URL |
| Non-event ops ignored | snapshot/append messages don't crash or dispatch |
| Connection not open — listen queued | listen called before connect, sent on open |

---

### §4 Capability Discovery (#89)

#### §4.1 Backend — ServiceCapabilities record

File: `backend/data/src/main/java/io/casehub/pages/data/ServiceCapabilities.java`

```java
public record ServiceCapabilities(
    boolean serverSideQuery,
    List<String> dataProviders,
    boolean dataProxy,
    boolean serverSideCache
) {}
```

#### §4.2 Backend — capabilities endpoint

Added to existing `DataResource.java`:

```java
@GET
@Path("/capabilities")
@PermitAll
public ServiceCapabilities capabilities() {
    List<String> providerTypes = new ArrayList<>();
    for (DataProvider p : providers) {
        providerTypes.add(p.type());
    }
    return new ServiceCapabilities(
        !providerTypes.isEmpty(),
        List.copyOf(providerTypes),
        true,
        true
    );
}
```

Path is `/api/dataset/capabilities` (scoped under the existing `/api/dataset` prefix) rather than a top-level `/api/capabilities`. If dashboard CRUD or other capabilities are added later, they add their own `/api/<domain>/capabilities` endpoint — no need for a god-object capabilities response.

`@PermitAll` — capabilities are metadata, not user data.

`serverSideQuery` is true when at least one `DataProvider` is on classpath (i.e., `data-sql` module is present). `dataProxy` and `serverSideCache` are always true for the current backend.

#### §4.3 Frontend — ServiceCapabilities type

File: `packages/pages-data/src/dataset/external/types.ts`

```typescript
export interface ServiceCapabilities {
    readonly serverSideQuery: boolean;
    readonly dataProviders: readonly string[];
    readonly dataProxy: boolean;
    readonly serverSideCache: boolean;
}

export const LOCAL_CAPABILITIES: ServiceCapabilities = {
    serverSideQuery: false,
    dataProviders: [],
    dataProxy: false,
    serverSideCache: false,
};
```

`LOCAL_CAPABILITIES` is the default when no backend is configured or the capabilities endpoint is unreachable.

#### §4.4 Frontend — DataProviderConfig extension

```typescript
export interface DataProviderConfig {
    // ... existing fields ...
    readonly capabilities?: {
        readonly endpoint: string;
    };
}
```

#### §4.5 Frontend — Pipeline wiring

In `loadSite()` (`site.ts`), before `pipeline.setResolverCtx()`:

```typescript
function isServiceCapabilities(obj: unknown): obj is ServiceCapabilities {
    if (typeof obj !== "object" || obj === null) return false;
    const o = obj as Record<string, unknown>;
    return typeof o.serverSideQuery === "boolean"
        && Array.isArray(o.dataProviders) && o.dataProviders.every(v => typeof v === "string")
        && typeof o.dataProxy === "boolean"
        && typeof o.serverSideCache === "boolean";
}

let capabilities: ServiceCapabilities = LOCAL_CAPABILITIES;
if (options.providerConfig?.capabilities && options.baseUrl) {
    try {
        const url = `${options.baseUrl}${options.providerConfig.capabilities.endpoint}`;
        const resp = await fetch(url);
        if (resp.ok) {
            const json: unknown = await resp.json();
            capabilities = isServiceCapabilities(json) ? json : LOCAL_CAPABILITIES;
        }
    } catch {
        // Backend unreachable — local-only mode
    }
}
```

`capabilities` is passed to `pipeline.setResolverCtx()` alongside the existing fields:

```typescript
pipeline.setResolverCtx({
    manager,
    providerFactory: ...,
    providerConfig: ...,
    presetRegistry: ...,
    capabilities,
});
```

`capabilities` is then accessible to any component via the pipeline context.

#### §4.6 ResolverContext extension

File: `packages/pages-data/src/dataset/external/resolver.ts`

```typescript
export interface ResolverContext {
    // ... existing fields ...
    readonly capabilities: ServiceCapabilities;
}
```

#### §4.7 Tests

| Test | Verifies |
|------|----------|
| `ServiceCapabilities` record serialization | Jackson round-trip: record → JSON → record |
| Capabilities endpoint — SQL provider present | `serverSideQuery: true`, `dataProviders: ["sql"]` |
| Capabilities endpoint — no providers | `serverSideQuery: false`, `dataProviders: []` |
| Capabilities endpoint — `@PermitAll` | No auth header required |
| Frontend — fetch capabilities on init | `ResolverContext.capabilities` populated from endpoint |
| Frontend — backend unreachable | Falls back to `LOCAL_CAPABILITIES` |
| Frontend — malformed capabilities response | Falls back to `LOCAL_CAPABILITIES` (runtime validation rejects) |
| Frontend — no capabilities config | Uses `LOCAL_CAPABILITIES`, no fetch attempted |

---

## Implementation Order

1. **§1 Java push types** — foundation, no dependencies
2. **§4 Capability discovery** — independent of §1, can be parallel
3. **§2 listen/unlisten protocol** — depends on §1 for `PushRequest` parsers
4. **§3 createEventConnection** — depends on §2 for listen/unlisten client ops

§1 and §4 can be implemented in parallel. §2 and §3 are sequential.

## Breaking Changes

- `ResolverContext` gains a required `capabilities` field — all call sites must provide it.
- `DataProviderConfig` gains an optional `capabilities` block — non-breaking.
- `backend/push/` is a new module — added to `backend/pom.xml` modules list.
- No changes to existing `PushSource` interface.
- `processWireMessage` event branch refactored to call shared `dispatchWireEvent()` — same behavior, no API change.
- No changes to existing WebSocket connection management.

## Files

### New files

| File | Purpose |
|------|---------|
| `backend/push/pom.xml` | Maven module descriptor |
| `backend/push/src/main/java/io/casehub/pages/push/PushMessage.java` | Wire message builders |
| `backend/push/src/main/java/io/casehub/pages/push/PushColumn.java` | Column record |
| `backend/push/src/main/java/io/casehub/pages/push/PushRequest.java` | Sealed request parser |
| `backend/push/src/main/java/io/casehub/pages/push/TopicRegistry.java` | Connection topic tracker |
| `backend/push/src/test/java/io/casehub/pages/push/PushMessageTest.java` | Builder tests |
| `backend/push/src/test/java/io/casehub/pages/push/PushRequestTest.java` | Parser tests |
| `backend/push/src/test/java/io/casehub/pages/push/TopicRegistryTest.java` | Registry tests |
| `backend/data/src/main/java/io/casehub/pages/data/ServiceCapabilities.java` | Capabilities record |
| `packages/pages-data/src/dataset/external/sources/push-wire.ts` | Shared wire utilities (buildConnectionUrl, sendListen, sendUnlisten, dispatchWireEvent) |
| `packages/pages-data/src/dataset/external/sources/push-wire.test.ts` | Wire utility tests |
| `packages/pages-data/src/dataset/external/sources/event-connection.ts` | EventConnection API |
| `packages/pages-data/src/dataset/external/sources/event-connection.test.ts` | EventConnection tests |

### Modified files

| File | Change |
|------|--------|
| `backend/pom.xml` | Add `push` to modules list |
| `backend/data/src/main/java/io/casehub/pages/data/DataResource.java` | Add capabilities endpoint |
| `backend/data/src/test/java/io/casehub/pages/data/DataResourceTest.java` | Add capabilities tests |
| `packages/pages-data/src/dataset/external/types.ts` | Add `ServiceCapabilities`, `LOCAL_CAPABILITIES`, extend `DataProviderConfig` |
| `packages/pages-data/src/dataset/external/resolver.ts` | Add `capabilities` field to `ResolverContext` |
| `packages/pages-data/src/dataset/external/sources/push-source.ts` | Update event branch to use `dispatchWireEvent()` |
| `packages/pages-data/src/dataset/external/sources/websocket-source.ts` | Replace inline `buildConnectionUrl()` with import from `push-wire.ts` |
| `packages/pages-data/src/dataset/external/sources/websocket-source.test.ts` | Add event dispatch via `dispatchWireEvent` tests |
| `packages/pages-data/src/dataset/external/index.ts` | Export `EventConnection`, `createEventConnection`, `ServiceCapabilities`, `LOCAL_CAPABILITIES` |
| `packages/pages-runtime/src/site.ts` | Fetch capabilities at init, pass to ResolverContext |
| `packages/pages-runtime/src/site.test.ts` | Add capabilities init tests |

## DraftHouse Adoption Note

DraftHouse currently misuses dataset `subscribe` for topic routing: clients send `{ "op": "subscribe", "dataset": "debate:<uuid>" }` and `DebateWebSocket.handleSubscribe()` parses the prefixed dataset name, triggers side effects (catch-up messages via `sendCatchUp`, file watcher setup via `startFileWatch`), and registers the connection in `WebSocketEventBus`.

Migration to the new protocol is more than a rename. The new `listen` op routes through `TopicRegistry`, which is a pure data structure with no application-level hooks. DraftHouse's `@OnTextMessage` handler must:

1. Handle `PushRequest.Listen` alongside existing `Subscribe`
2. Call `topicRegistry.listen()` for topic tracking
3. Trigger application-level side effects (catch-up, file watches) based on topic prefixes
4. Both protocols coexist during migration — clients can send either `subscribe` or `listen`

DraftHouse can adopt incrementally: add `listen`/`unlisten` handling to `DebateWebSocket`, keep `subscribe`/`unsubscribe` for backward compatibility, and migrate the frontend at its own pace.

## Not in scope

- Wildcard topic matching (`debate:*`) — #105
- Server-side `since`-based event replay — requires event persistence design; when designed, `listen` gains an optional `since` parameter and the client tracks `seq` values for resumption (#106)
- Error/acknowledgment ops for `listen`/`unlisten` — unknown topics are silently ignored (matching current DraftHouse behavior). A future protocol extension can add `ack`/`error` ops without breaking existing clients (#107)
- Hybrid fallback (try remote, fall back to local) — silent fallback masks problems
- Dashboard CRUD, IndexedDB, plugin registry — §05 migration spec items that don't fit the current library architecture
- Design token adoption (#101) — deferred until blocks-ui stabilises its token system
