# Push Protocol Types, Event Infrastructure & Capability Discovery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use hortora:subagent-driven-development (recommended) or hortora:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement typed Java push protocol SDK, event topic subscriptions (listen/unlisten), event-only WebSocket API, and backend capability discovery.

**Architecture:** Four deliverables across Java (backend/push module, backend/data endpoint) and TypeScript (shared wire utilities in pages-data, EventConnection API). The Java push module is pure Java with jackson-core only. The TypeScript changes extract shared wire utilities from the existing WebSocket source, then build the EventConnection API on top.

**Tech Stack:** Java 21 (records, sealed interfaces, jackson-core streaming), TypeScript 5 (vitest), Maven, Yarn workspaces, Quarkus REST (backend/data only).

## Global Constraints

- Java push module: `jackson-core` only — no `jackson-databind`, no Quarkus, no Jakarta
- TypeScript: vitest for tests, strict type checking (`yarn typecheck`)
- All Java tests: plain JUnit 5 for push module; `@QuarkusTest` + REST-Assured for data module
- Build verification: `mvn -f backend/push/pom.xml test` for Java; `yarn workspace @casehub/pages-data run test` for TS
- Lint: `yarn lint` must pass
- Breaking changes: `ResolverContext` gains required `capabilities` field — all call sites must be updated
- Commits reference issues: `Refs #89`, `Refs #98`, `Refs #99`, `Refs #100`

---

### Task 1: Java Push Protocol Types Module (#100)

**Files:**
- Create: `backend/push/pom.xml`
- Create: `backend/push/src/main/java/io/casehub/pages/push/PushColumn.java`
- Create: `backend/push/src/main/java/io/casehub/pages/push/PushMessage.java`
- Create: `backend/push/src/main/java/io/casehub/pages/push/PushRequest.java`
- Create: `backend/push/src/main/java/io/casehub/pages/push/TopicRegistry.java`
- Create: `backend/push/src/test/java/io/casehub/pages/push/PushMessageTest.java`
- Create: `backend/push/src/test/java/io/casehub/pages/push/PushRequestTest.java`
- Create: `backend/push/src/test/java/io/casehub/pages/push/TopicRegistryTest.java`
- Modify: `backend/pom.xml` — add `push` to `<modules>` list (after line 24)

**Interfaces:**
- Consumes: nothing (foundation module)
- Produces:
  - `PushColumn(String id, String name, String type)` — record
  - `PushMessage.event(String topic, String payloadJson): String`
  - `PushMessage.event(String topic, String payloadJson, String seq): String`
  - `PushMessage.snapshot(String dataset, List<PushColumn> columns, List<List<String>> rows): String`
  - `PushMessage.snapshot(String dataset, List<PushColumn> columns, List<List<String>> rows, String seq): String`
  - `PushMessage.append(String dataset, List<PushColumn> columns, List<List<String>> rows): String`
  - `PushMessage.append(String dataset, List<PushColumn> columns, List<List<String>> rows, String seq): String`
  - `PushMessage.replace(String dataset, List<PushColumn> columns, String key, List<String> row): String`
  - `PushMessage.replace(String dataset, List<PushColumn> columns, String key, List<String> row, String seq): String`
  - `PushMessage.remove(String dataset, String key): String`
  - `PushMessage.remove(String dataset, String key, String seq): String`
  - `PushRequest.parse(String json): PushRequest` — sealed interface with `Subscribe`, `Unsubscribe`, `Listen`, `Unlisten`
  - `TopicRegistry.listen(String connectionId, List<String> topics): void`
  - `TopicRegistry.unlisten(String connectionId, List<String> topics): void`
  - `TopicRegistry.removeConnection(String connectionId): void`
  - `TopicRegistry.connections(String topic): Set<String>`

- [ ] **Step 1: Create Maven module scaffold**

Create `backend/push/pom.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>io.casehub</groupId>
        <artifactId>casehub-pages-backend</artifactId>
        <version>0.1-SNAPSHOT</version>
    </parent>

    <artifactId>casehub-pages-push</artifactId>
    <name>CaseHub Pages — Push Protocol Types</name>
    <description>Typed builders and parsers for the casehub-pages push wire protocol</description>

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
</project>
```

Add `<module>push</module>` to `backend/pom.xml` after `<module>data-sql</module>` (line 24).

- [ ] **Step 2: Write PushColumn record**

Create `backend/push/src/main/java/io/casehub/pages/push/PushColumn.java`:

```java
package io.casehub.pages.push;

import java.util.Objects;

public record PushColumn(String id, String name, String type) {

    public PushColumn {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(name, "name");
        Objects.requireNonNull(type, "type");
    }
}
```

- [ ] **Step 3: Write PushMessage tests**

Create `backend/push/src/test/java/io/casehub/pages/push/PushMessageTest.java`:

```java
package io.casehub.pages.push;

import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class PushMessageTest {

    private final JsonFactory factory = new JsonFactory();

    private Map<String, Object> parse(String json) throws IOException {
        Map<String, Object> result = new HashMap<>();
        try (JsonParser p = factory.createParser(json)) {
            assertEquals(JsonToken.START_OBJECT, p.nextToken());
            while (p.nextToken() != JsonToken.END_OBJECT) {
                String field = p.currentName();
                p.nextToken();
                switch (p.currentToken()) {
                    case VALUE_STRING -> result.put(field, p.getText());
                    case START_ARRAY -> {
                        List<Object> arr = new java.util.ArrayList<>();
                        while (p.nextToken() != JsonToken.END_ARRAY) {
                            if (p.currentToken() == JsonToken.START_OBJECT) {
                                Map<String, String> obj = new HashMap<>();
                                while (p.nextToken() != JsonToken.END_OBJECT) {
                                    obj.put(p.currentName(), p.nextTextValue());
                                }
                                arr.add(obj);
                            } else if (p.currentToken() == JsonToken.START_ARRAY) {
                                List<String> inner = new java.util.ArrayList<>();
                                while (p.nextToken() != JsonToken.END_ARRAY) {
                                    inner.add(p.currentToken() == JsonToken.VALUE_NULL ? null : p.getText());
                                }
                                arr.add(inner);
                            } else {
                                arr.add(p.getText());
                            }
                        }
                        result.put(field, arr);
                    }
                    default -> result.put(field, p.getText());
                }
            }
        }
        return result;
    }

    @Test
    void event_produces_valid_json_with_topic_and_payload() throws IOException {
        String json = PushMessage.event("debate:abc123", "{\"text\":\"hello\"}");
        Map<String, Object> msg = parse(json);
        assertEquals("event", msg.get("op"));
        assertEquals("debate:abc123", msg.get("topic"));
        assertEquals("{\"text\":\"hello\"}", msg.get("payload"));
        assertNull(msg.get("seq"));
    }

    @Test
    void event_with_seq_includes_seq_field() throws IOException {
        String json = PushMessage.event("debate:abc123", "{}", "seq-42");
        Map<String, Object> msg = parse(json);
        assertEquals("event", msg.get("op"));
        assertEquals("seq-42", msg.get("seq"));
    }

    @Test
    void snapshot_produces_columns_and_rows() throws IOException {
        List<PushColumn> cols = List.of(
                new PushColumn("name", "Name", "TEXT"),
                new PushColumn("value", "Value", "NUMBER"));
        List<List<String>> rows = List.of(
                List.of("alpha", "10"),
                List.of("beta", "20"));

        String json = PushMessage.snapshot("sessions", cols, rows);
        Map<String, Object> msg = parse(json);
        assertEquals("snapshot", msg.get("op"));
        assertEquals("sessions", msg.get("dataset"));

        @SuppressWarnings("unchecked")
        List<Map<String, String>> columns = (List<Map<String, String>>) msg.get("columns");
        assertEquals(2, columns.size());
        assertEquals("name", columns.get(0).get("id"));
        assertEquals("TEXT", columns.get(0).get("type"));

        @SuppressWarnings("unchecked")
        List<List<String>> parsedRows = (List<List<String>>) msg.get("rows");
        assertEquals(2, parsedRows.size());
        assertEquals(List.of("alpha", "10"), parsedRows.get(0));
    }

    @Test
    void snapshot_with_seq() throws IOException {
        String json = PushMessage.snapshot("ds", List.of(), List.of(), "seq-1");
        Map<String, Object> msg = parse(json);
        assertEquals("seq-1", msg.get("seq"));
    }

    @Test
    void append_uses_append_op() throws IOException {
        String json = PushMessage.append("ds",
                List.of(new PushColumn("id", "ID", "TEXT")),
                List.of(List.of("1")));
        Map<String, Object> msg = parse(json);
        assertEquals("append", msg.get("op"));
        assertEquals("ds", msg.get("dataset"));
    }

    @Test
    void replace_includes_key_and_single_row() throws IOException {
        String json = PushMessage.replace("ds",
                List.of(new PushColumn("id", "ID", "TEXT")),
                "user-42", List.of("42", "active"));
        Map<String, Object> msg = parse(json);
        assertEquals("replace", msg.get("op"));
        assertEquals("user-42", msg.get("key"));
        assertNotNull(msg.get("row"));
        assertNull(msg.get("rows"));
    }

    @Test
    void remove_has_only_op_dataset_key() throws IOException {
        String json = PushMessage.remove("ds", "user-42");
        Map<String, Object> msg = parse(json);
        assertEquals("remove", msg.get("op"));
        assertEquals("ds", msg.get("dataset"));
        assertEquals("user-42", msg.get("key"));
        assertNull(msg.get("columns"));
        assertNull(msg.get("rows"));
    }

    @Test
    void remove_with_seq() throws IOException {
        String json = PushMessage.remove("ds", "k", "seq-9");
        Map<String, Object> msg = parse(json);
        assertEquals("seq-9", msg.get("seq"));
    }

    @Test
    void event_null_topic_throws() {
        assertThrows(NullPointerException.class,
                () -> PushMessage.event(null, "{}"));
    }

    @Test
    void event_null_payload_throws() {
        assertThrows(NullPointerException.class,
                () -> PushMessage.event("t", null));
    }
}
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `mvn -f backend/push/pom.xml test`
Expected: Compilation failure — `PushMessage` class does not exist.

- [ ] **Step 5: Implement PushMessage**

Create `backend/push/src/main/java/io/casehub/pages/push/PushMessage.java`:

```java
package io.casehub.pages.push;

import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.JsonGenerator;

import java.io.IOException;
import java.io.StringWriter;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.Objects;

public final class PushMessage {

    private static final JsonFactory JSON_FACTORY = new JsonFactory();

    public static String event(String topic, String payloadJson) {
        return event(topic, payloadJson, null);
    }

    public static String event(String topic, String payloadJson, String seq) {
        Objects.requireNonNull(topic, "topic");
        Objects.requireNonNull(payloadJson, "payloadJson");
        return generate(g -> {
            g.writeStringField("op", "event");
            g.writeStringField("topic", topic);
            g.writeFieldName("payload");
            g.writeRawValue(payloadJson);
            if (seq != null) g.writeStringField("seq", seq);
        });
    }

    public static String snapshot(String dataset, List<PushColumn> columns, List<List<String>> rows) {
        return snapshot(dataset, columns, rows, null);
    }

    public static String snapshot(String dataset, List<PushColumn> columns, List<List<String>> rows, String seq) {
        return datasetOp("snapshot", dataset, columns, rows, seq);
    }

    public static String append(String dataset, List<PushColumn> columns, List<List<String>> rows) {
        return append(dataset, columns, rows, null);
    }

    public static String append(String dataset, List<PushColumn> columns, List<List<String>> rows, String seq) {
        return datasetOp("append", dataset, columns, rows, seq);
    }

    public static String replace(String dataset, List<PushColumn> columns, String key, List<String> row) {
        return replace(dataset, columns, key, row, null);
    }

    public static String replace(String dataset, List<PushColumn> columns, String key, List<String> row, String seq) {
        Objects.requireNonNull(dataset, "dataset");
        Objects.requireNonNull(key, "key");
        Objects.requireNonNull(row, "row");
        return generate(g -> {
            g.writeStringField("op", "replace");
            g.writeStringField("dataset", dataset);
            writeColumns(g, columns);
            g.writeStringField("key", key);
            g.writeFieldName("row");
            writeRow(g, row);
            if (seq != null) g.writeStringField("seq", seq);
        });
    }

    public static String remove(String dataset, String key) {
        return remove(dataset, key, null);
    }

    public static String remove(String dataset, String key, String seq) {
        Objects.requireNonNull(dataset, "dataset");
        Objects.requireNonNull(key, "key");
        return generate(g -> {
            g.writeStringField("op", "remove");
            g.writeStringField("dataset", dataset);
            g.writeStringField("key", key);
            if (seq != null) g.writeStringField("seq", seq);
        });
    }

    private static String datasetOp(String op, String dataset, List<PushColumn> columns,
                                     List<List<String>> rows, String seq) {
        Objects.requireNonNull(dataset, "dataset");
        Objects.requireNonNull(columns, "columns");
        Objects.requireNonNull(rows, "rows");
        return generate(g -> {
            g.writeStringField("op", op);
            g.writeStringField("dataset", dataset);
            writeColumns(g, columns);
            g.writeFieldName("rows");
            g.writeStartArray();
            for (List<String> row : rows) {
                writeRow(g, row);
            }
            g.writeEndArray();
            if (seq != null) g.writeStringField("seq", seq);
        });
    }

    private static void writeColumns(JsonGenerator g, List<PushColumn> columns) throws IOException {
        g.writeFieldName("columns");
        g.writeStartArray();
        for (PushColumn col : columns) {
            g.writeStartObject();
            g.writeStringField("id", col.id());
            g.writeStringField("name", col.name());
            g.writeStringField("type", col.type());
            g.writeEndObject();
        }
        g.writeEndArray();
    }

    private static void writeRow(JsonGenerator g, List<String> row) throws IOException {
        g.writeStartArray();
        for (String cell : row) {
            if (cell == null) {
                g.writeNull();
            } else {
                g.writeString(cell);
            }
        }
        g.writeEndArray();
    }

    private static String generate(GeneratorAction action) {
        StringWriter sw = new StringWriter();
        try (JsonGenerator g = JSON_FACTORY.createGenerator(sw)) {
            g.writeStartObject();
            action.write(g);
            g.writeEndObject();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return sw.toString();
    }

    @FunctionalInterface
    private interface GeneratorAction {
        void write(JsonGenerator g) throws IOException;
    }

    private PushMessage() {}
}
```

- [ ] **Step 6: Run PushMessage tests**

Run: `mvn -f backend/push/pom.xml test -Dtest=PushMessageTest`
Expected: All 10 tests PASS.

- [ ] **Step 7: Write PushRequest tests**

Create `backend/push/src/test/java/io/casehub/pages/push/PushRequestTest.java`:

```java
package io.casehub.pages.push;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class PushRequestTest {

    @Test
    void parse_subscribe_with_since() {
        PushRequest req = PushRequest.parse("{\"op\":\"subscribe\",\"dataset\":\"sessions\",\"since\":\"seq-5\"}");
        assertInstanceOf(PushRequest.Subscribe.class, req);
        PushRequest.Subscribe s = (PushRequest.Subscribe) req;
        assertEquals("sessions", s.dataset());
        assertEquals("seq-5", s.since());
    }

    @Test
    void parse_subscribe_without_since() {
        PushRequest req = PushRequest.parse("{\"op\":\"subscribe\",\"dataset\":\"sessions\"}");
        assertInstanceOf(PushRequest.Subscribe.class, req);
        assertNull(((PushRequest.Subscribe) req).since());
    }

    @Test
    void parse_unsubscribe() {
        PushRequest req = PushRequest.parse("{\"op\":\"unsubscribe\",\"dataset\":\"sessions\"}");
        assertInstanceOf(PushRequest.Unsubscribe.class, req);
        assertEquals("sessions", ((PushRequest.Unsubscribe) req).dataset());
    }

    @Test
    void parse_listen() {
        PushRequest req = PushRequest.parse("{\"op\":\"listen\",\"topics\":[\"debate:abc\",\"file:/x\"]}");
        assertInstanceOf(PushRequest.Listen.class, req);
        assertEquals(List.of("debate:abc", "file:/x"), ((PushRequest.Listen) req).topics());
    }

    @Test
    void parse_unlisten() {
        PushRequest req = PushRequest.parse("{\"op\":\"unlisten\",\"topics\":[\"debate:abc\"]}");
        assertInstanceOf(PushRequest.Unlisten.class, req);
        assertEquals(List.of("debate:abc"), ((PushRequest.Unlisten) req).topics());
    }

    @Test
    void parse_unknown_op_throws() {
        assertThrows(IllegalArgumentException.class,
                () -> PushRequest.parse("{\"op\":\"unknown\"}"));
    }

    @Test
    void parse_malformed_json_throws() {
        assertThrows(IllegalArgumentException.class,
                () -> PushRequest.parse("not json"));
    }

    @Test
    void parse_missing_op_throws() {
        assertThrows(IllegalArgumentException.class,
                () -> PushRequest.parse("{\"dataset\":\"x\"}"));
    }
}
```

- [ ] **Step 8: Implement PushRequest**

Create `backend/push/src/main/java/io/casehub/pages/push/PushRequest.java`:

```java
package io.casehub.pages.push;

import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

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

    JsonFactory JSON_FACTORY = new JsonFactory();

    static PushRequest parse(String json) {
        try (JsonParser p = JSON_FACTORY.createParser(json)) {
            if (p.nextToken() != JsonToken.START_OBJECT) {
                throw new IllegalArgumentException("Expected JSON object");
            }
            String op = null;
            String dataset = null;
            String since = null;
            List<String> topics = null;

            while (p.nextToken() != JsonToken.END_OBJECT) {
                String field = p.currentName();
                p.nextToken();
                switch (field) {
                    case "op" -> op = p.getText();
                    case "dataset" -> dataset = p.getText();
                    case "since" -> {
                        if (p.currentToken() == JsonToken.VALUE_STRING) {
                            since = p.getText();
                        } else {
                            p.skipChildren();
                        }
                    }
                    case "topics" -> {
                        topics = new ArrayList<>();
                        while (p.nextToken() != JsonToken.END_ARRAY) {
                            topics.add(p.getText());
                        }
                    }
                    default -> p.skipChildren();
                }
            }

            if (op == null) {
                throw new IllegalArgumentException("Missing 'op' field");
            }

            return switch (op) {
                case "subscribe" -> new Subscribe(dataset, since);
                case "unsubscribe" -> new Unsubscribe(dataset);
                case "listen" -> new Listen(topics != null ? List.copyOf(topics) : List.of());
                case "unlisten" -> new Unlisten(topics != null ? List.copyOf(topics) : List.of());
                default -> throw new IllegalArgumentException("Unknown op: " + op);
            };
        } catch (IOException e) {
            throw new IllegalArgumentException("Malformed JSON: " + e.getMessage(), e);
        }
    }
}
```

- [ ] **Step 9: Run PushRequest tests**

Run: `mvn -f backend/push/pom.xml test -Dtest=PushRequestTest`
Expected: All 8 tests PASS.

- [ ] **Step 10: Write TopicRegistry tests**

Create `backend/push/src/test/java/io/casehub/pages/push/TopicRegistryTest.java`:

```java
package io.casehub.pages.push;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

class TopicRegistryTest {

    @Test
    void listen_registers_connection_for_topic() {
        TopicRegistry reg = new TopicRegistry();
        reg.listen("conn-1", List.of("debate:abc"));
        assertEquals(Set.of("conn-1"), reg.connections("debate:abc"));
    }

    @Test
    void listen_multiple_topics() {
        TopicRegistry reg = new TopicRegistry();
        reg.listen("conn-1", List.of("debate:abc", "file:/x"));
        assertEquals(Set.of("conn-1"), reg.connections("debate:abc"));
        assertEquals(Set.of("conn-1"), reg.connections("file:/x"));
    }

    @Test
    void multiple_connections_same_topic() {
        TopicRegistry reg = new TopicRegistry();
        reg.listen("conn-1", List.of("debate:abc"));
        reg.listen("conn-2", List.of("debate:abc"));
        assertEquals(Set.of("conn-1", "conn-2"), reg.connections("debate:abc"));
    }

    @Test
    void unlisten_removes_connection_from_topic() {
        TopicRegistry reg = new TopicRegistry();
        reg.listen("conn-1", List.of("debate:abc", "file:/x"));
        reg.unlisten("conn-1", List.of("debate:abc"));
        assertTrue(reg.connections("debate:abc").isEmpty());
        assertEquals(Set.of("conn-1"), reg.connections("file:/x"));
    }

    @Test
    void removeConnection_cleans_up_all_topics() {
        TopicRegistry reg = new TopicRegistry();
        reg.listen("conn-1", List.of("debate:abc", "file:/x", "chat:lobby"));
        reg.removeConnection("conn-1");
        assertTrue(reg.connections("debate:abc").isEmpty());
        assertTrue(reg.connections("file:/x").isEmpty());
        assertTrue(reg.connections("chat:lobby").isEmpty());
    }

    @Test
    void connections_returns_unmodifiable_snapshot() {
        TopicRegistry reg = new TopicRegistry();
        reg.listen("conn-1", List.of("topic"));
        Set<String> snapshot = reg.connections("topic");
        reg.listen("conn-2", List.of("topic"));
        assertEquals(1, snapshot.size());
        assertEquals(2, reg.connections("topic").size());
    }

    @Test
    void connections_unknown_topic_returns_empty() {
        TopicRegistry reg = new TopicRegistry();
        assertTrue(reg.connections("nonexistent").isEmpty());
    }

    @Test
    void concurrent_listen_unlisten_does_not_corrupt() throws Exception {
        TopicRegistry reg = new TopicRegistry();
        int threads = 8;
        int opsPerThread = 1000;
        CountDownLatch latch = new CountDownLatch(threads);
        ExecutorService executor = Executors.newFixedThreadPool(threads);

        for (int t = 0; t < threads; t++) {
            final String connId = "conn-" + t;
            executor.submit(() -> {
                try {
                    for (int i = 0; i < opsPerThread; i++) {
                        reg.listen(connId, List.of("shared-topic", "topic-" + connId));
                        reg.connections("shared-topic");
                        reg.unlisten(connId, List.of("topic-" + connId));
                    }
                } finally {
                    latch.countDown();
                }
            });
        }

        assertTrue(latch.await(10, TimeUnit.SECONDS));
        executor.shutdown();
        assertEquals(threads, reg.connections("shared-topic").size());
    }
}
```

- [ ] **Step 11: Implement TopicRegistry**

Create `backend/push/src/main/java/io/casehub/pages/push/TopicRegistry.java`:

```java
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
```

- [ ] **Step 12: Run all push module tests**

Run: `mvn -f backend/push/pom.xml test`
Expected: All 25 tests PASS.

- [ ] **Step 13: Verify full backend build**

Run: `mvn -f backend/pom.xml test`
Expected: All backend modules compile and tests pass.

- [ ] **Step 14: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/pages add backend/push/ backend/pom.xml
git -C /Users/mdproctor/claude/casehub/pages commit -m "feat: add casehub-pages-push module — typed builders, parsers, and TopicRegistry

PushMessage: static builders for all server→client wire ops (event, snapshot, append, replace, remove).
PushRequest: sealed interface parser for client→server ops (subscribe, unsubscribe, listen, unlisten).
TopicRegistry: thread-safe per-connection topic tracker for filtered event delivery.
Pure Java + jackson-core only. No Quarkus dependency.

Refs #100"
```

---

### Task 2: Capability Discovery (#89)

**Files:**
- Create: `backend/data/src/main/java/io/casehub/pages/data/ServiceCapabilities.java`
- Modify: `backend/data/src/main/java/io/casehub/pages/data/DataResource.java` — add capabilities endpoint
- Modify: `backend/data/src/test/java/io/casehub/pages/data/DataResourceQueryTest.java` — add capabilities tests
- Modify: `packages/pages-data/src/dataset/external/types.ts` — add `ServiceCapabilities`, `LOCAL_CAPABILITIES`, extend `DataProviderConfig`
- Modify: `packages/pages-data/src/dataset/external/resolver.ts` — add `capabilities` to `ResolverContext`
- Modify: `packages/pages-data/src/dataset/external/index.ts` — export new types
- Modify: `packages/pages-runtime/src/site.ts` — fetch capabilities at init, pass to ResolverContext
- Modify: `packages/pages-runtime/src/site.test.ts` — add capabilities tests

**Interfaces:**
- Consumes: `DataProvider.type()` from existing `backend/data`
- Produces:
  - Java: `ServiceCapabilities(boolean serverSideQuery, List<String> dataProviders, boolean dataProxy, boolean serverSideCache)`
  - Java: `GET /api/dataset/capabilities` endpoint (`@PermitAll`)
  - TS: `ServiceCapabilities` interface, `LOCAL_CAPABILITIES` constant
  - TS: `isServiceCapabilities(obj: unknown): obj is ServiceCapabilities` type guard
  - TS: `DataProviderConfig.capabilities?: { endpoint: string }`
  - TS: `ResolverContext.capabilities: ServiceCapabilities`

- [ ] **Step 1: Write ServiceCapabilities record**

Create `backend/data/src/main/java/io/casehub/pages/data/ServiceCapabilities.java`:

```java
package io.casehub.pages.data;

import java.util.List;

public record ServiceCapabilities(
        boolean serverSideQuery,
        List<String> dataProviders,
        boolean dataProxy,
        boolean serverSideCache) {}
```

- [ ] **Step 2: Write capabilities endpoint test**

Add to `backend/data/src/test/java/io/casehub/pages/data/DataResourceQueryTest.java` (which already has a `TestDataProvider` `@Alternative`):

```java
@Test
void capabilities_returns_provider_info_without_auth() {
    given()
            .when()
            .get("/api/dataset/capabilities")
            .then()
            .statusCode(200)
            .body("serverSideQuery", equalTo(true))
            .body("dataProviders", hasItem("test"))
            .body("dataProxy", equalTo(true))
            .body("serverSideCache", equalTo(true));
}

@Test
void capabilities_does_not_require_jwt() {
    given()
            .when()
            .get("/api/dataset/capabilities")
            .then()
            .statusCode(200);
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `mvn -f backend/data/pom.xml test -Dtest=DataResourceQueryTest#capabilities_returns_provider_info_without_auth`
Expected: FAIL — no endpoint at `/api/dataset/capabilities`.

- [ ] **Step 4: Implement capabilities endpoint**

Add to `DataResource.java` after the existing `invalidateCache` method (after line 87):

```java
@GET
@Path("/capabilities")
@PermitAll
public ServiceCapabilities capabilities() {
    List<String> providerTypes = new java.util.ArrayList<>();
    for (DataProvider p : providers) {
        providerTypes.add(p.type());
    }
    return new ServiceCapabilities(
            !providerTypes.isEmpty(),
            List.copyOf(providerTypes),
            true,
            true);
}
```

Add import: `import jakarta.annotation.security.PermitAll;`

- [ ] **Step 5: Run backend tests**

Run: `mvn -f backend/data/pom.xml test`
Expected: All tests PASS including the two new capabilities tests.

- [ ] **Step 6: Add frontend ServiceCapabilities type**

Add to `packages/pages-data/src/dataset/external/types.ts` after `DataProviderConfig`:

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

export function isServiceCapabilities(obj: unknown): obj is ServiceCapabilities {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return typeof o.serverSideQuery === "boolean"
    && Array.isArray(o.dataProviders) && o.dataProviders.every(v => typeof v === "string")
    && typeof o.dataProxy === "boolean"
    && typeof o.serverSideCache === "boolean";
}
```

Extend `DataProviderConfig`:

```typescript
export interface DataProviderConfig {
  // ... existing fields ...
  readonly capabilities?: {
    readonly endpoint: string;
  };
}
```

- [ ] **Step 7: Add capabilities to ResolverContext**

In `packages/pages-data/src/dataset/external/resolver.ts`, add import and field:

Import: `import type { ServiceCapabilities } from "./types.js";`

Add to `ResolverContext` interface:

```typescript
export interface ResolverContext {
  readonly manager: DataSetManager;
  readonly providerFactory: { ... };
  readonly providerConfig: DataProviderConfig;
  readonly presetRegistry: PresetRegistry;
  readonly capabilities: ServiceCapabilities;
}
```

- [ ] **Step 8: Update exports**

In `packages/pages-data/src/dataset/external/index.ts`, add to the types re-export block:

```typescript
export type { ServiceCapabilities } from "./types.js";
export { LOCAL_CAPABILITIES, isServiceCapabilities } from "./types.js";
```

- [ ] **Step 9: Wire capabilities in site.ts**

In `packages/pages-runtime/src/site.ts`, add import:

```typescript
import { LOCAL_CAPABILITIES, isServiceCapabilities } from "@casehub/pages-data";
import type { ServiceCapabilities } from "@casehub/pages-data";
```

Before the `pipeline.setResolverCtx()` call (around line 156), add:

```typescript
let capabilities: ServiceCapabilities = LOCAL_CAPABILITIES;
if (options?.providerConfig?.capabilities && options?.baseUrl) {
  try {
    const capUrl = `${options.baseUrl}${options.providerConfig.capabilities.endpoint}`;
    const resp = await (options?.fetch ?? globalThis.fetch)(capUrl);
    if (resp.ok) {
      const json: unknown = await resp.json();
      capabilities = isServiceCapabilities(json) ? json : LOCAL_CAPABILITIES;
    }
  } catch {
    // Backend unreachable — local-only mode
  }
}
```

Add `capabilities` to the `pipeline.setResolverCtx()` call:

```typescript
pipeline.setResolverCtx({
  manager,
  providerFactory: ...,
  providerConfig: ...,
  presetRegistry: ...,
  capabilities,
});
```

- [ ] **Step 10: Fix any call sites that construct ResolverContext**

Search for all places `ResolverContext` is constructed (resolver tests, site tests, data-pipeline tests). Each must include `capabilities: LOCAL_CAPABILITIES`. Run `yarn typecheck` to find them — the compiler will report missing `capabilities` property.

Run: `yarn typecheck`
Fix all type errors by adding `capabilities: LOCAL_CAPABILITIES` to each call site.

- [ ] **Step 11: Run TypeScript tests**

Run: `yarn workspace @casehub/pages-data run test`
Run: `yarn workspace @casehub/pages-runtime run test`
Expected: All tests PASS.

- [ ] **Step 12: Run full type check and lint**

Run: `yarn typecheck && yarn lint`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/pages add backend/data/ packages/pages-data/ packages/pages-runtime/
git -C /Users/mdproctor/claude/casehub/pages commit -m "feat: add capability discovery — backend endpoint + frontend wiring

Backend: GET /api/dataset/capabilities returns ServiceCapabilities (serverSideQuery, dataProviders, dataProxy, serverSideCache). @PermitAll — no auth required.
Frontend: ServiceCapabilities type, isServiceCapabilities() type guard, LOCAL_CAPABILITIES default. Fetched at loadSite() init, stored on ResolverContext.

Refs #89"
```

---

### Task 3: Shared Wire Utilities & listen/unlisten Protocol (#98)

**Files:**
- Create: `packages/pages-data/src/dataset/external/sources/push-wire.ts`
- Create: `packages/pages-data/src/dataset/external/sources/push-wire.test.ts`
- Modify: `packages/pages-data/src/dataset/external/sources/push-source.ts` — use `dispatchWireEvent` in event branch
- Modify: `packages/pages-data/src/dataset/external/sources/websocket-source.ts` — import `buildConnectionUrl` from push-wire
- Modify: `packages/pages-data/src/dataset/external/index.ts` — export new utilities

**Interfaces:**
- Consumes: `PushSourceConfig` from `push-source.ts`, `WebSocket` API
- Produces:
  - `buildConnectionUrl(baseUrl: string, config?: { relay?; auth? }): string`
  - `sendListen(ws: WebSocket, topics: string[]): void`
  - `sendUnlisten(ws: WebSocket, topics: string[]): void`
  - `dispatchWireEvent(msg: { topic?; payload? }, eventTarget: EventTarget): void`

- [ ] **Step 1: Write push-wire tests**

Create `packages/pages-data/src/dataset/external/sources/push-wire.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { buildConnectionUrl, sendListen, sendUnlisten, dispatchWireEvent } from "./push-wire.js";

describe("buildConnectionUrl", () => {
  it("returns URL unchanged when no config", () => {
    expect(buildConnectionUrl("wss://example.com/ws")).toBe("wss://example.com/ws");
  });

  it("rewrites URL through relay endpoint", () => {
    const result = buildConnectionUrl("wss://example.com/ws", {
      relay: { endpoint: "wss://relay.example.com/proxy" },
    });
    const url = new URL(result);
    expect(url.origin).toBe("wss://relay.example.com");
    expect(url.pathname).toBe("/proxy");
    expect(url.searchParams.get("target")).toBe("wss://example.com/ws");
  });

  it("appends auth token as query parameter", () => {
    const result = buildConnectionUrl("wss://example.com/ws", {
      auth: { type: "query-param" as const, token: "abc123" },
    });
    const url = new URL(result);
    expect(url.searchParams.get("token")).toBe("abc123");
  });

  it("uses custom param name for auth", () => {
    const result = buildConnectionUrl("wss://example.com/ws", {
      auth: { type: "query-param" as const, paramName: "key", token: "abc123" },
    });
    const url = new URL(result);
    expect(url.searchParams.get("key")).toBe("abc123");
  });

  it("applies both relay and auth", () => {
    const result = buildConnectionUrl("wss://example.com/ws", {
      relay: { endpoint: "wss://relay.example.com/proxy" },
      auth: { type: "query-param" as const, token: "abc123" },
    });
    const url = new URL(result);
    expect(url.searchParams.get("target")).toBe("wss://example.com/ws");
    expect(url.searchParams.get("token")).toBe("abc123");
  });
});

describe("sendListen", () => {
  it("sends listen op with topics", () => {
    const send = vi.fn();
    const ws = { send, readyState: 1 } as unknown as WebSocket;
    sendListen(ws, ["debate:abc", "file:/x"]);
    expect(send).toHaveBeenCalledWith(
      JSON.stringify({ op: "listen", topics: ["debate:abc", "file:/x"] }),
    );
  });
});

describe("sendUnlisten", () => {
  it("sends unlisten op with topics", () => {
    const send = vi.fn();
    const ws = { send, readyState: 1 } as unknown as WebSocket;
    sendUnlisten(ws, ["debate:abc"]);
    expect(send).toHaveBeenCalledWith(
      JSON.stringify({ op: "unlisten", topics: ["debate:abc"] }),
    );
  });
});

describe("dispatchWireEvent", () => {
  it("dispatches pages-event CustomEvent with topic and payload", () => {
    const target = new EventTarget();
    const handler = vi.fn();
    target.addEventListener("pages-event", handler);
    dispatchWireEvent({ topic: "debate:abc", payload: { text: "hi" } }, target);
    expect(handler).toHaveBeenCalledTimes(1);
    const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.topic).toBe("debate:abc");
    expect(detail.payload).toEqual({ text: "hi" });
  });

  it("does not dispatch when topic is missing", () => {
    const target = new EventTarget();
    const handler = vi.fn();
    target.addEventListener("pages-event", handler);
    dispatchWireEvent({ payload: { text: "hi" } }, target);
    expect(handler).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace @casehub/pages-data run test -- push-wire`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement push-wire.ts**

Create `packages/pages-data/src/dataset/external/sources/push-wire.ts`:

```typescript
export function buildConnectionUrl(
  baseUrl: string,
  config?: {
    relay?: { endpoint: string };
    auth?: { type: "query-param"; paramName?: string; token: string };
  },
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

- [ ] **Step 4: Run push-wire tests**

Run: `yarn workspace @casehub/pages-data run test -- push-wire`
Expected: All 8 tests PASS.

- [ ] **Step 5: Refactor push-source.ts event dispatch**

In `packages/pages-data/src/dataset/external/sources/push-source.ts`, add import:

```typescript
import { dispatchWireEvent } from "./push-wire.js";
```

Replace the event dispatch block (lines 54-62):

```typescript
// Before:
if (msg.op === "event" && msg.topic) {
  if (config?.eventTarget) {
    config.eventTarget.dispatchEvent(new CustomEvent("pages-event", {
      bubbles: true,
      composed: true,
      detail: { topic: msg.topic, payload: msg.payload },
    }));
  }
  return;
}

// After:
if (msg.op === "event" && msg.topic) {
  if (config?.eventTarget) {
    dispatchWireEvent(msg, config.eventTarget);
  }
  return;
}
```

- [ ] **Step 6: Refactor websocket-source.ts to use shared buildConnectionUrl**

In `packages/pages-data/src/dataset/external/sources/websocket-source.ts`, add import:

```typescript
import { buildConnectionUrl } from "./push-wire.js";
```

Delete the inline `buildConnectionUrl` function (lines 21-33) and replace usages with the imported version. The imported function takes `(baseUrl, config)` as arguments instead of being a closure, so the call site changes from `buildConnectionUrl()` to `buildConnectionUrl(baseUrl, config)`.

- [ ] **Step 7: Update exports**

In `packages/pages-data/src/dataset/external/index.ts`, add:

```typescript
// Shared wire utilities
export { buildConnectionUrl, sendListen, sendUnlisten, dispatchWireEvent } from "./sources/push-wire.js";
```

- [ ] **Step 8: Run all pages-data tests**

Run: `yarn workspace @casehub/pages-data run test`
Expected: All tests PASS (existing websocket-source tests still pass with extracted function).

- [ ] **Step 9: Run type check and lint**

Run: `yarn typecheck && yarn lint`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/pages add packages/pages-data/
git -C /Users/mdproctor/claude/casehub/pages commit -m "feat: extract shared wire utilities + listen/unlisten client ops

New push-wire.ts with buildConnectionUrl, sendListen, sendUnlisten, dispatchWireEvent.
Refactors push-source.ts event dispatch and websocket-source.ts URL construction to use shared utilities.
sendListen/sendUnlisten serialize the listen/unlisten wire protocol ops for #98.

Refs #98"
```

---

### Task 4: EventConnection API (#99)

**Files:**
- Create: `packages/pages-data/src/dataset/external/sources/event-connection.ts`
- Create: `packages/pages-data/src/dataset/external/sources/event-connection.test.ts`
- Modify: `packages/pages-data/src/dataset/external/index.ts` — export EventConnection

**Interfaces:**
- Consumes: `buildConnectionUrl`, `sendListen`, `sendUnlisten`, `dispatchWireEvent` from `push-wire.ts`; `PushSourceConfig` from `push-source.ts`
- Produces:
  - `EventConnection` interface: `send(message: object)`, `listen(topics: string[])`, `unlisten(topics: string[])`, `close()`, `connected: boolean`
  - `createEventConnection(url: string, config?: PushSourceConfig): EventConnection`

- [ ] **Step 1: Write EventConnection tests**

Create `packages/pages-data/src/dataset/external/sources/event-connection.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createEventConnection } from "./event-connection.js";
import type { PushSourceConfig } from "./push-source.js";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  readyState = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(_code?: number, _reason?: string): void {
    this.readyState = 3; // CLOSED
  }

  simulateOpen(): void {
    this.readyState = 1; // OPEN
    this.onopen?.();
  }

  simulateMessage(data: string): void {
    this.onmessage?.({ data });
  }

  simulateClose(code = 1006, reason = ""): void {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

let origWS: typeof WebSocket;

beforeEach(() => {
  MockWebSocket.instances = [];
  origWS = globalThis.WebSocket;
  (globalThis as Record<string, unknown>).WebSocket = MockWebSocket as unknown as typeof WebSocket;
});

afterEach(() => {
  (globalThis as Record<string, unknown>).WebSocket = origWS;
});

function lastWs(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1];
}

describe("createEventConnection", () => {
  it("establishes WebSocket and reports connected", () => {
    const conn = createEventConnection("wss://example.com/ws");
    expect(conn.connected).toBe(false);
    lastWs().simulateOpen();
    expect(conn.connected).toBe(true);
    conn.close();
  });

  it("listen sends wire op when connected", () => {
    const conn = createEventConnection("wss://example.com/ws");
    lastWs().simulateOpen();
    conn.listen(["debate:abc", "file:/x"]);
    expect(JSON.parse(lastWs().sent[0])).toEqual({
      op: "listen",
      topics: ["debate:abc", "file:/x"],
    });
    conn.close();
  });

  it("listen queued before connect is sent on open", () => {
    const conn = createEventConnection("wss://example.com/ws");
    conn.listen(["debate:abc"]);
    expect(lastWs().sent.length).toBe(0);
    lastWs().simulateOpen();
    expect(lastWs().sent.length).toBe(1);
    expect(JSON.parse(lastWs().sent[0])).toEqual({
      op: "listen",
      topics: ["debate:abc"],
    });
    conn.close();
  });

  it("unlisten sends wire op", () => {
    const conn = createEventConnection("wss://example.com/ws");
    lastWs().simulateOpen();
    conn.listen(["debate:abc"]);
    conn.unlisten(["debate:abc"]);
    expect(JSON.parse(lastWs().sent[1])).toEqual({
      op: "unlisten",
      topics: ["debate:abc"],
    });
    conn.close();
  });

  it("send forwards arbitrary JSON", () => {
    const conn = createEventConnection("wss://example.com/ws");
    lastWs().simulateOpen();
    conn.send({ custom: "data" });
    expect(JSON.parse(lastWs().sent[0])).toEqual({ custom: "data" });
    conn.close();
  });

  it("incoming event dispatches CustomEvent on eventTarget", () => {
    const target = new EventTarget();
    const handler = vi.fn();
    target.addEventListener("pages-event", handler);
    const conn = createEventConnection("wss://example.com/ws", {
      eventTarget: target as unknown as HTMLElement,
    });
    lastWs().simulateOpen();
    lastWs().simulateMessage(JSON.stringify({
      op: "event",
      topic: "debate:abc",
      payload: { text: "hello" },
    }));
    expect(handler).toHaveBeenCalledTimes(1);
    const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.topic).toBe("debate:abc");
    expect(detail.payload).toEqual({ text: "hello" });
    conn.close();
  });

  it("batch array-wrapped events dispatch multiple events", () => {
    const target = new EventTarget();
    const handler = vi.fn();
    target.addEventListener("pages-event", handler);
    const conn = createEventConnection("wss://example.com/ws", {
      eventTarget: target as unknown as HTMLElement,
    });
    lastWs().simulateOpen();
    lastWs().simulateMessage(JSON.stringify([
      { op: "event", topic: "a", payload: 1 },
      { op: "event", topic: "b", payload: 2 },
    ]));
    expect(handler).toHaveBeenCalledTimes(2);
    conn.close();
  });

  it("non-event ops are silently ignored", () => {
    const target = new EventTarget();
    const handler = vi.fn();
    target.addEventListener("pages-event", handler);
    const conn = createEventConnection("wss://example.com/ws", {
      eventTarget: target as unknown as HTMLElement,
    });
    lastWs().simulateOpen();
    lastWs().simulateMessage(JSON.stringify({
      op: "snapshot",
      dataset: "x",
      columns: [],
      rows: [],
    }));
    expect(handler).not.toHaveBeenCalled();
    conn.close();
  });

  it("reconnection re-sends listen registrations", () => {
    vi.useFakeTimers();
    const conn = createEventConnection("wss://example.com/ws");
    lastWs().simulateOpen();
    conn.listen(["debate:abc"]);
    const firstSent = lastWs().sent.length;
    lastWs().simulateClose(1006);
    vi.advanceTimersByTime(1500);
    const reconnectedWs = lastWs();
    reconnectedWs.simulateOpen();
    const listenMsg = JSON.parse(reconnectedWs.sent[0]);
    expect(listenMsg).toEqual({ op: "listen", topics: ["debate:abc"] });
    conn.close();
    vi.useRealTimers();
  });

  it("close tears down cleanly with no reconnection", () => {
    vi.useFakeTimers();
    const conn = createEventConnection("wss://example.com/ws");
    lastWs().simulateOpen();
    conn.close();
    expect(conn.connected).toBe(false);
    const countBefore = MockWebSocket.instances.length;
    vi.advanceTimersByTime(60000);
    expect(MockWebSocket.instances.length).toBe(countBefore);
    vi.useRealTimers();
  });

  it("applies relay config to connection URL", () => {
    const conn = createEventConnection("wss://example.com/ws", {
      relay: { endpoint: "wss://relay.example.com/proxy" },
    });
    expect(lastWs().url).toContain("relay.example.com");
    expect(lastWs().url).toContain("target=");
    conn.close();
  });

  it("applies auth config to connection URL", () => {
    const conn = createEventConnection("wss://example.com/ws", {
      auth: { type: "query-param", token: "abc123" },
    });
    expect(lastWs().url).toContain("token=abc123");
    conn.close();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace @casehub/pages-data run test -- event-connection`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement EventConnection**

Create `packages/pages-data/src/dataset/external/sources/event-connection.ts`:

```typescript
import type { PushSourceConfig } from "./push-source.js";
import { buildConnectionUrl, sendListen, sendUnlisten, dispatchWireEvent } from "./push-wire.js";

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
): EventConnection {
  let ws: WebSocket | null = null;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  const listenRegistrations = new Set<string>();

  const connectionUrl = buildConnectionUrl(url, config);

  function connect(): void {
    if (closed) return;
    ws = new WebSocket(connectionUrl);

    ws.onopen = () => {
      reconnectAttempt = 0;
      if (listenRegistrations.size > 0 && ws) {
        sendListen(ws, [...listenRegistrations]);
      }
    };

    ws.onmessage = (e: MessageEvent) => {
      handleMessage(e.data as string);
    };

    ws.onclose = (e: CloseEvent) => {
      if (closed) return;
      if (e.code >= 4000) return;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempt), 30000);
      reconnectAttempt++;
      reconnectTimer = setTimeout(connect, delay);
    };

    ws.onerror = () => {};
  }

  function handleMessage(data: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      console.warn("[EventConnection] Failed to parse message:", data);
      return;
    }
    const messages = Array.isArray(parsed) ? (parsed as unknown[]) : [parsed];
    for (const msg of messages) {
      if (typeof msg === "object" && msg !== null
          && (msg as Record<string, unknown>).op === "event"
          && config?.eventTarget) {
        dispatchWireEvent(msg as { topic?: string; payload?: unknown }, config.eventTarget);
      }
    }
  }

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
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close(1000, "client closed");
      ws = null;
    },
  };
}
```

- [ ] **Step 4: Run EventConnection tests**

Run: `yarn workspace @casehub/pages-data run test -- event-connection`
Expected: All 12 tests PASS.

- [ ] **Step 5: Update exports**

In `packages/pages-data/src/dataset/external/index.ts`, add:

```typescript
// Event connection
export type { EventConnection } from "./sources/event-connection.js";
export { createEventConnection } from "./sources/event-connection.js";
```

- [ ] **Step 6: Run full test suite**

Run: `yarn workspace @casehub/pages-data run test`
Run: `yarn workspace @casehub/pages-runtime run test`
Expected: All tests PASS.

- [ ] **Step 7: Run type check and lint**

Run: `yarn typecheck && yarn lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/pages add packages/pages-data/
git -C /Users/mdproctor/claude/casehub/pages commit -m "feat: add createEventConnection API for event-only WebSocket usage

EventConnection provides listen/unlisten/send/close for consumers that need WebSocket events without dataset subscription machinery.
Dedicated connection (not pooled), exponential backoff reconnection, re-sends listen registrations on reconnect.
Array-wrapped batch messages supported. Non-event ops silently ignored.

Refs #99"
```

---

## Verification

After all four tasks are complete:

- [ ] `mvn -f backend/pom.xml test` — all backend modules pass
- [ ] `yarn workspace @casehub/pages-data run test` — all pages-data tests pass
- [ ] `yarn workspace @casehub/pages-runtime run test` — all pages-runtime tests pass
- [ ] `yarn typecheck` — full cross-package type check passes
- [ ] `yarn lint` — ESLint passes
- [ ] `yarn build` — full build succeeds
