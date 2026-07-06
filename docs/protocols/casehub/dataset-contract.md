---
id: PP-20260705-7a5da4
title: "Every named dataset exposes a DatasetContract with name, description, and shape"
type: rule
scope: repo
applies_to: "all dataset definitions in casehub-pages"
cross_repo_consumers: []
severity: important
refs: []
violation_hint: "Dataset is used in YAML or event topics without a corresponding DatasetContract export"
created: 2026-07-05
---

Every named dataset exposes a `DatasetContract<T>` declaring name, description,
and shape:

```typescript
interface DatasetContract<T = unknown> {
  readonly name: string;
  readonly description: string;
  readonly shape: T;
}
```

`name` is the dataset identifier used in YAML bindings and event topics.
`description` is human-readable documentation. `shape` is a concrete example
value — not a schema, not a type — that shows the structure with default/empty
values (empty strings, zeros, empty arrays).

## Why shape, not schema

`shape` serves as a compile-time documentation and type-safety convention:
TypeScript generics propagate the shape type through dataset references, giving
IDE auto-completion and type errors for mismatched field access. There is no
runtime introspection of the shape — no code walks it to derive columns or
validate data.
