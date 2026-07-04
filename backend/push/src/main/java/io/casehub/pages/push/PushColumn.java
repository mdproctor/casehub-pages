package io.casehub.pages.push;

import java.util.Objects;

public record PushColumn(String id, String name, String type) {

    public PushColumn {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(name, "name");
        Objects.requireNonNull(type, "type");
    }
}
