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

    public static String event(String topic, String payloadJson, Long seq) {
        Objects.requireNonNull(topic, "topic");
        Objects.requireNonNull(payloadJson, "payloadJson");
        return generate(g -> {
            g.writeStringField("op", "event");
            g.writeStringField("topic", topic);
            g.writeFieldName("payload");
            g.writeRawValue(payloadJson);
            if (seq != null) g.writeNumberField("seq", seq);
        });
    }

    public static String ack(String id) {
        Objects.requireNonNull(id, "id");
        return generate(g -> {
            g.writeStringField("op", "ack");
            g.writeStringField("id", id);
        });
    }

    public static String ack(String id, List<String> topics) {
        Objects.requireNonNull(id, "id");
        return generate(g -> {
            g.writeStringField("op", "ack");
            g.writeStringField("id", id);
            if (topics != null && !topics.isEmpty()) {
                g.writeFieldName("topics");
                g.writeStartArray();
                for (String topic : topics) {
                    g.writeString(topic);
                }
                g.writeEndArray();
            }
        });
    }

    public static String ack(String id, List<String> topics, List<String> gaps) {
        Objects.requireNonNull(id, "id");
        return generate(g -> {
            g.writeStringField("op", "ack");
            g.writeStringField("id", id);
            if (topics != null && !topics.isEmpty()) {
                g.writeFieldName("topics");
                g.writeStartArray();
                for (String topic : topics) {
                    g.writeString(topic);
                }
                g.writeEndArray();
            }
            if (gaps != null && !gaps.isEmpty()) {
                g.writeFieldName("gaps");
                g.writeStartArray();
                for (String gap : gaps) {
                    g.writeString(gap);
                }
                g.writeEndArray();
            }
        });
    }

    public static String error(String id, String message) {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(message, "message");
        return generate(g -> {
            g.writeStringField("op", "error");
            g.writeStringField("id", id);
            g.writeStringField("message", message);
        });
    }

    public static String snapshot(String dataset, List<PushColumn> columns, List<List<String>> rows) {
        return snapshot(dataset, columns, rows, null);
    }

    public static String snapshot(String dataset, List<PushColumn> columns, List<List<String>> rows, Long seq) {
        return datasetOp("snapshot", dataset, columns, rows, seq);
    }

    public static String append(String dataset, List<PushColumn> columns, List<List<String>> rows) {
        return append(dataset, columns, rows, null);
    }

    public static String append(String dataset, List<PushColumn> columns, List<List<String>> rows, Long seq) {
        return datasetOp("append", dataset, columns, rows, seq);
    }

    public static String replace(String dataset, List<PushColumn> columns, String key, List<String> row) {
        return replace(dataset, columns, key, row, null);
    }

    public static String replace(String dataset, List<PushColumn> columns, String key, List<String> row, Long seq) {
        Objects.requireNonNull(dataset, "dataset");
        Objects.requireNonNull(columns, "columns");
        Objects.requireNonNull(key, "key");
        Objects.requireNonNull(row, "row");
        return generate(g -> {
            g.writeStringField("op", "replace");
            g.writeStringField("dataset", dataset);
            writeColumns(g, columns);
            g.writeStringField("key", key);
            g.writeFieldName("row");
            writeRow(g, row);
            if (seq != null) g.writeNumberField("seq", seq);
        });
    }

    public static String remove(String dataset, String key) {
        return remove(dataset, key, null);
    }

    public static String remove(String dataset, String key, Long seq) {
        Objects.requireNonNull(dataset, "dataset");
        Objects.requireNonNull(key, "key");
        return generate(g -> {
            g.writeStringField("op", "remove");
            g.writeStringField("dataset", dataset);
            g.writeStringField("key", key);
            if (seq != null) g.writeNumberField("seq", seq);
        });
    }

    private static String datasetOp(String op, String dataset, List<PushColumn> columns,
                                     List<List<String>> rows, Long seq) {
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
            if (seq != null) g.writeNumberField("seq", seq);
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
