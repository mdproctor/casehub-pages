---
id: PP-20260706-52e9eb
title: "Iframe component messages use ComponentMessage envelope with plain-object properties over postMessage"
type: rule
scope: repo
applies_to: "third-party and internal iframe components communicating with the casehub-pages host via postMessage"
cross_repo_consumers: []
severity: important
refs: ["#130"]
violation_hint: "Iframe component message uses Map for properties, uses non-string property keys, or includes non-structured-clone-safe values"
created: 2026-07-06
---

Iframe components communicate with the host page via `postMessage` using
a `ComponentMessage` envelope:

```typescript
interface ComponentMessage {
  type: MessageType;
  properties: Record<string, unknown>;
}
```

`properties` is a plain object, not a `Map`. All values must be
structured-clone-safe: no `Map`, no class instances, no functions.

> **Current code divergence:** the implementation uses
> `Map<MessageProperty | string, unknown>` for `properties`, which does
> not survive `postMessage` structured clone across iframe boundaries.
> See #130. This protocol documents the correct target format.

## Message types — host → component

| Type | Key properties | Purpose |
|------|---------------|---------|
| `INIT` | `component_id`, plus arbitrary params | Initialise with configuration |
| `DATASET` | `component_id`, `dataSet`, plus params from INIT | Deliver/update dataset |
| `FUNCTION_RESPONSE` | `functionResponse` | Return function call result |

## Message types — component → host

| Type | Key properties | Purpose |
|------|---------------|---------|
| `FILTER` | `component_id`, `filter` | Request cross-filter |
| `FUNCTION_CALL` | `component_id`, `functionCallRequest` | Request server-side function |
| `FIX_CONFIGURATION` | `component_id`, `configurationIssue` | Signal invalid config |
| `CONFIGURATION_OK` | `component_id` | Signal config resolved |
| `READY` | `component_id` | Signal readiness (reserved, not yet implemented) |

## Property keys

String constants from the `MessageProperty` enum, used as plain string
keys in the `properties` object:

| Key | Value | Used in |
|-----|-------|---------|
| `component_id` | `"component_id"` | All messages |
| `dataSet` | `"dataSet"` | DATASET |
| `configurationIssue` | `"configurationIssue"` | FIX_CONFIGURATION |
| `filter` | `"filter"` | FILTER |
| `functionCallRequest` | `"functionCallRequest"` | FUNCTION_CALL |
| `functionResponse` | `"functionResponse"` | FUNCTION_RESPONSE |
| `mode` | `"mode"` | INIT (optional) |

Components must use string values as keys, not enum references — the
host and component may not share the same module.

## Data types

All types carried in message properties are plain objects with only
primitive and array fields:

```typescript
interface DataSet {
  columns: Column[];
  data: string[][];
}

interface Column {
  id: string;
  name: string;
  type: ColumnType;
  settings?: ColumnSettings;
}

interface FilterRequest {
  reset: boolean;
  row: number;
  column: number;
}

interface FunctionCallRequest {
  functionName: string;
  parameters: Record<string, unknown>;
}

interface FunctionResponse {
  message: string;
  request: FunctionCallRequest;
  resultType: FunctionResultType;  // "SUCCESS" | "ERROR" | "NOT_FOUND"
  result: unknown;
}
```

## component_id

Set by the host on INIT. The component must echo it on every message
sent back to the host. The host uses it to route messages when multiple
iframe components coexist in a dashboard.

## Relationship to other protocols

This protocol covers the **wire format** for iframe-isolated components
communicating via `postMessage`. It is distinct from:

- **pages-event-contract** — covers `CustomEvent`-based inter-component
  events within the host DOM. Iframe components are isolated from this.
- **iframe-component-lifecycle** — covers the **sequence** and
  **state signalling rules** for the same message types defined here.
