package io.casehub.pages.data;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
@JsonSubTypes({
    @JsonSubTypes.Type(value = ResultColumn.Key.class, name = "key"),
    @JsonSubTypes.Type(value = ResultColumn.Aggregate.class, name = "aggregate"),
    @JsonSubTypes.Type(value = ResultColumn.Select.class, name = "select"),
})
public sealed interface ResultColumn {
    String sourceId();
    String columnId();

    record Key(String sourceId, String columnId) implements ResultColumn {}
    record Aggregate(String sourceId, String columnId, Aggregation fn) implements ResultColumn {}
    record Select(String sourceId, String columnId) implements ResultColumn {}
}
