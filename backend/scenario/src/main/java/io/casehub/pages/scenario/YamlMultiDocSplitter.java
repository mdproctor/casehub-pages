package io.casehub.pages.scenario;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import io.casehub.yaml.core.playbook.PlaybookFrontMatter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class YamlMultiDocSplitter {

    private static final ObjectMapper YAML = new ObjectMapper(new YAMLFactory());
    private static final String PLAYBOOK_KEY = "playbook";
    private static final String SCHEMA_KEY = "schema";
    private static final String NAME_KEY = "name";

    public record SplitResult(PlaybookFrontMatter frontMatter, JsonNode content) {}

    private YamlMultiDocSplitter() {}

    public static SplitResult split(String yaml) {
        if (yaml == null || yaml.isBlank()) {
            throw new IllegalArgumentException("YAML content must not be empty");
        }

        try {
            List<JsonNode> documents = new ArrayList<>();
            var parser = YAML.getFactory().createParser(yaml);
            var it = YAML.readValues(parser, JsonNode.class);
            while (it.hasNext()) {
                documents.add(it.next());
            }

            if (documents.isEmpty()) {
                throw new IllegalArgumentException("YAML content must not be empty");
            }

            JsonNode first = documents.get(0);

            if (documents.size() == 1) {
                return new SplitResult(null, first);
            }

            if (first.has(PLAYBOOK_KEY)) {
                PlaybookFrontMatter fm = extractFrontMatter(first);
                return new SplitResult(fm, documents.get(1));
            }

            return new SplitResult(null, first);

        } catch (IOException e) {
            throw new IllegalArgumentException("Failed to parse YAML", e);
        }
    }

    private static PlaybookFrontMatter extractFrontMatter(JsonNode doc) {
        String version = doc.path(PLAYBOOK_KEY).asText();
        String schema = doc.path(SCHEMA_KEY).asText(null);
        if (schema == null) {
            throw new IllegalArgumentException("Playbook front matter requires a 'schema' field");
        }
        String name = doc.path(NAME_KEY).asText(null);

        Map<String, Object> metadata = new LinkedHashMap<>();
        var fields = doc.fields();
        while (fields.hasNext()) {
            var field = fields.next();
            String key = field.getKey();
            if (!PLAYBOOK_KEY.equals(key) && !SCHEMA_KEY.equals(key) && !NAME_KEY.equals(key)) {
                metadata.put(key, nodeToValue(field.getValue()));
            }
        }

        return new PlaybookFrontMatter(version, schema, name,
                metadata.isEmpty() ? Map.of() : metadata);
    }

    private static Object nodeToValue(JsonNode node) {
        if (node.isTextual()) return node.asText();
        if (node.isInt()) return node.asInt();
        if (node.isLong()) return node.asLong();
        if (node.isDouble() || node.isFloat()) return node.asDouble();
        if (node.isBoolean()) return node.booleanValue();
        if (node.isNull()) return null;
        return node.asText();
    }
}
