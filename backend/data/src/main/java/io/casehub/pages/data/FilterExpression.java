package io.casehub.pages.data;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

import java.util.List;
import java.util.Map;

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes({
    @JsonSubTypes.Type(value = FilterExpression.And.class, name = "and"),
    @JsonSubTypes.Type(value = FilterExpression.Or.class, name = "or"),
    @JsonSubTypes.Type(value = FilterExpression.Not.class, name = "not"),
    @JsonSubTypes.Type(value = FilterExpression.Unresolved.class, name = "unresolved"),
    @JsonSubTypes.Type(value = FilterExpression.Numeric.class, name = "numeric"),
    @JsonSubTypes.Type(value = FilterExpression.StringLeaf.class, name = "string"),
    @JsonSubTypes.Type(value = FilterExpression.DateLeaf.class, name = "date"),
})
public sealed interface FilterExpression {
    record And(List<FilterExpression> children) implements FilterExpression {}
    record Or(List<FilterExpression> children) implements FilterExpression {}
    record Not(FilterExpression child) implements FilterExpression {}
    record Unresolved(String columnId, String fn, List<String> args) implements FilterExpression {}
    record Numeric(String columnId, Map<String, Object> filter) implements FilterExpression {}
    record StringLeaf(String columnId, Map<String, Object> filter) implements FilterExpression {}
    record DateLeaf(String columnId, Map<String, Object> filter) implements FilterExpression {}
}
