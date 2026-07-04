package io.casehub.pages.push;

import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public sealed interface PushRequest {

    String op();

    record Subscribe(String dataset, String since) implements PushRequest {
        public Subscribe {
            Objects.requireNonNull(dataset, "dataset");
        }
        public String op() { return "subscribe"; }
    }

    record Unsubscribe(String dataset) implements PushRequest {
        public Unsubscribe {
            Objects.requireNonNull(dataset, "dataset");
        }
        public String op() { return "unsubscribe"; }
    }

    record Listen(List<String> topics) implements PushRequest {
        public String op() { return "listen"; }
    }

    record Unlisten(List<String> topics) implements PushRequest {
        public String op() { return "unlisten"; }
    }

    static PushRequest parse(String json) {
        JsonFactory factory = new JsonFactory();
        try (JsonParser p = factory.createParser(json)) {
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
                            if (p.currentToken() == JsonToken.VALUE_NULL) {
                                throw new IllegalArgumentException("topic must not be null");
                            }
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
