package io.casehub.pages.push;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class PushRequestTest {

    @Test
    void parse_subscribe_with_since() {
        PushRequest req = PushRequest.parse("{\"op\":\"subscribe\",\"id\":\"r0\",\"dataset\":\"sessions\",\"since\":\"seq-5\"}");
        assertInstanceOf(PushRequest.Subscribe.class, req);
        PushRequest.Subscribe s = (PushRequest.Subscribe) req;
        assertEquals("sessions", s.dataset());
        assertEquals("seq-5", s.since());
    }

    @Test
    void parse_subscribe_without_since() {
        PushRequest req = PushRequest.parse("{\"op\":\"subscribe\",\"id\":\"r0\",\"dataset\":\"sessions\"}");
        assertInstanceOf(PushRequest.Subscribe.class, req);
        assertNull(((PushRequest.Subscribe) req).since());
    }

    @Test
    void parse_subscribe_without_dataset_throws() {
        assertThrows(NullPointerException.class,
                () -> PushRequest.parse("{\"op\":\"subscribe\",\"id\":\"r0\"}"));
    }

    @Test
    void parse_unsubscribe() {
        PushRequest req = PushRequest.parse("{\"op\":\"unsubscribe\",\"id\":\"r0\",\"dataset\":\"sessions\"}");
        assertInstanceOf(PushRequest.Unsubscribe.class, req);
        assertEquals("sessions", ((PushRequest.Unsubscribe) req).dataset());
    }

    @Test
    void parse_unsubscribe_without_dataset_throws() {
        assertThrows(NullPointerException.class,
                () -> PushRequest.parse("{\"op\":\"unsubscribe\",\"id\":\"r0\"}"));
    }

    @Test
    void parse_listen() {
        PushRequest req = PushRequest.parse("{\"op\":\"listen\",\"id\":\"r0\",\"topics\":[\"debate:abc\",\"file:/x\"]}");
        assertInstanceOf(PushRequest.Listen.class, req);
        assertEquals(List.of("debate:abc", "file:/x"), ((PushRequest.Listen) req).topics());
    }

    @Test
    void parse_unlisten() {
        PushRequest req = PushRequest.parse("{\"op\":\"unlisten\",\"id\":\"r0\",\"topics\":[\"debate:abc\"]}");
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

    @Test
    void parse_listen_with_null_topic_throws() {
        assertThrows(IllegalArgumentException.class,
                () -> PushRequest.parse("{\"op\":\"listen\",\"id\":\"r0\",\"topics\":[null,\"valid\"]}"));
    }

    // Task 3: Wire protocol correlation layer tests

    @Test
    void parse_subscribe_with_id_extracts_id() {
        PushRequest req = PushRequest.parse("{\"op\":\"subscribe\",\"id\":\"r1\",\"dataset\":\"sessions\"}");
        assertInstanceOf(PushRequest.Subscribe.class, req);
        assertEquals("r1", req.id());
    }

    @Test
    void parse_unsubscribe_with_id_extracts_id() {
        PushRequest req = PushRequest.parse("{\"op\":\"unsubscribe\",\"id\":\"r2\",\"dataset\":\"sessions\"}");
        assertInstanceOf(PushRequest.Unsubscribe.class, req);
        assertEquals("r2", req.id());
    }

    @Test
    void parse_listen_with_id_extracts_id() {
        PushRequest req = PushRequest.parse("{\"op\":\"listen\",\"id\":\"r3\",\"topics\":[\"debate:abc\"]}");
        assertInstanceOf(PushRequest.Listen.class, req);
        assertEquals("r3", req.id());
    }

    @Test
    void parse_unlisten_with_id_extracts_id() {
        PushRequest req = PushRequest.parse("{\"op\":\"unlisten\",\"id\":\"r4\",\"topics\":[\"debate:abc\"]}");
        assertInstanceOf(PushRequest.Unlisten.class, req);
        assertEquals("r4", req.id());
    }

    @Test
    void parse_missing_id_throws() {
        assertThrows(IllegalArgumentException.class,
                () -> PushRequest.parse("{\"op\":\"subscribe\",\"dataset\":\"sessions\"}"));
    }

    @Test
    void parse_listen_with_since_map() {
        PushRequest req = PushRequest.parse("{\"op\":\"listen\",\"id\":\"r5\",\"topics\":[\"debate:abc\"],\"since\":{\"debate:abc\":42,\"debate:xyz\":100}}");
        assertInstanceOf(PushRequest.Listen.class, req);
        PushRequest.Listen listen = (PushRequest.Listen) req;
        assertEquals("r5", listen.id());
        assertEquals(java.util.Map.of("debate:abc", 42L, "debate:xyz", 100L), listen.since());
    }

    @Test
    void parse_listen_without_since_returns_empty_map() {
        PushRequest req = PushRequest.parse("{\"op\":\"listen\",\"id\":\"r6\",\"topics\":[\"debate:abc\"]}");
        assertInstanceOf(PushRequest.Listen.class, req);
        PushRequest.Listen listen = (PushRequest.Listen) req;
        assertEquals(java.util.Map.of(), listen.since());
    }

    @Test
    void parse_subscribe_with_string_since_still_works() {
        PushRequest req = PushRequest.parse("{\"op\":\"subscribe\",\"id\":\"r7\",\"dataset\":\"sessions\",\"since\":\"cursor-abc\"}");
        assertInstanceOf(PushRequest.Subscribe.class, req);
        PushRequest.Subscribe s = (PushRequest.Subscribe) req;
        assertEquals("r7", s.id());
        assertEquals("cursor-abc", s.since());
    }

    @Test
    void parse_with_since_before_op_field_order_independence() {
        PushRequest req = PushRequest.parse("{\"since\":{\"debate:abc\":50},\"op\":\"listen\",\"id\":\"r8\",\"topics\":[\"debate:abc\"]}");
        assertInstanceOf(PushRequest.Listen.class, req);
        PushRequest.Listen listen = (PushRequest.Listen) req;
        assertEquals("r8", listen.id());
        assertEquals(java.util.Map.of("debate:abc", 50L), listen.since());
    }
}
