package io.casehub.pages.data;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes({
    @JsonSubTypes.Type(value = FilterOp.class, name = "filter"),
    @JsonSubTypes.Type(value = GroupOp.class, name = "group"),
    @JsonSubTypes.Type(value = SortOp.class, name = "sort"),
})
public sealed interface DataSetOp permits FilterOp, GroupOp, SortOp {}
