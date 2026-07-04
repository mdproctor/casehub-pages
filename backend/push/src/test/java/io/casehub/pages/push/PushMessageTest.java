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
                    case START_OBJECT -> {
                        // For embedded JSON objects like payload
                        StringBuilder sb = new StringBuilder();
                        int depth = 1;
                        sb.append("{");
                        while (depth > 0) {
                            JsonToken t = p.nextToken();
                            if (t == JsonToken.START_OBJECT) {
                                depth++;
                                sb.append("{");
                            } else if (t == JsonToken.END_OBJECT) {
                                depth--;
                                if (depth > 0) sb.append("}");
                            } else if (t == JsonToken.FIELD_NAME) {
                                if (sb.length() > 1) sb.append(",");
                                sb.append("\"").append(p.getCurrentName()).append("\":");
                            } else if (t == JsonToken.VALUE_STRING) {
                                sb.append("\"").append(p.getText()).append("\"");
                            }
                        }
                        sb.append("}");
                        result.put(field, sb.toString());
                    }
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

    @Test
    void replace_null_columns_throws() {
        assertThrows(NullPointerException.class,
                () -> PushMessage.replace("ds", null, "k", List.of("v")));
    }
}
