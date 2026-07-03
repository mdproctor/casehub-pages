package io.casehub.pages.data;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "mode")
@JsonSubTypes({
    @JsonSubTypes.Type(value = GroupStrategy.Distinct.class, name = "distinct"),
    @JsonSubTypes.Type(value = GroupStrategy.FixedCalendar.class, name = "fixedCalendar"),
    @JsonSubTypes.Type(value = GroupStrategy.DynamicRange.class, name = "dynamicRange"),
    @JsonSubTypes.Type(value = GroupStrategy.Dynamic.class, name = "dynamic"),
})
public sealed interface GroupStrategy {
    record Distinct() implements GroupStrategy {}
    record FixedCalendar(String unit) implements GroupStrategy {}
    record DynamicRange(String preferredUnit) implements GroupStrategy {}
    record Dynamic(String preferredUnit) implements GroupStrategy {}
}
