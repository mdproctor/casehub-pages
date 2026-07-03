package io.casehub.pages.data;

public record GroupingKey(
    String sourceId,
    String columnId,
    GroupStrategy strategy,
    int maxIntervals,
    boolean emptyIntervals,
    boolean ascendingOrder,
    String firstMonthOfYear,
    String firstDayOfWeek
) {}
