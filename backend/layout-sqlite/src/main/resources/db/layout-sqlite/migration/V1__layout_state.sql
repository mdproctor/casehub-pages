CREATE TABLE IF NOT EXISTS layout_state (
    key        TEXT NOT NULL,
    tenant_id  TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    payload    TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (key, tenant_id, user_id)
);
