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
    void parse_subscribe_without_dataset_throws() {
        assertThrows(NullPointerException.class,
                () -> PushRequest.parse("{\"op\":\"subscribe\"}"));
    }

    @Test
    void parse_unsubscribe() {
        PushRequest req = PushRequest.parse("{\"op\":\"unsubscribe\",\"dataset\":\"sessions\"}");
        assertInstanceOf(PushRequest.Unsubscribe.class, req);
        assertEquals("sessions", ((PushRequest.Unsubscribe) req).dataset());
    }

    @Test
    void parse_unsubscribe_without_dataset_throws() {
        assertThrows(NullPointerException.class,
                () -> PushRequest.parse("{\"op\":\"unsubscribe\"}"));
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

    @Test
    void parse_listen_with_null_topic_throws() {
        assertThrows(IllegalArgumentException.class,
                () -> PushRequest.parse("{\"op\":\"listen\",\"topics\":[null,\"valid\"]}"));
    }
}
