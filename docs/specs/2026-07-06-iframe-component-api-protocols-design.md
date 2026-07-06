# Iframe Component API Protocols — Design Spec

**Issue:** #122
**Date:** 2026-07-06
**Status:** Draft

## Context

The iframe component API (`@casehubio/pages-iframe-api`) is the third-party
extension point for casehub-pages. Components run inside iframes — fully
isolated from the host page. The host communicates with them via `postMessage`.

The rendering library inside the iframe is the third party's choice. The
existing reference implementations use React, but that is a legacy
implementation detail, not a contract. The protocol covers only the wire
format and lifecycle sequence that cross the `postMessage` boundary.

Two existing protocols are adjacent but distinct:
- **pages-event-contract** — covers `CustomEvent`-based inter-component
  events within the host DOM. Iframe components are isolated from this.
- **web-component-strategy** — covers Lit vs vanilla HTMLElement for
  host-page components. Does not apply inside iframes.

## Scope

**In scope:**
- Message envelope shape and serialisation constraints
- Message types, directions, and property contracts
- Lifecycle sequence (ordering guarantees)
- Configuration error signalling flow
- Function call/response correlation
- Dev harness testing guidance (informational, not contractual)

**Out of scope:**
- Rendering library choice inside the iframe
- Internal component state management
- DOM structure inside the iframe
- Host-side iframe embedding mechanics

## Design

### Protocol 1: Iframe Message Format (`iframe-message-format.md`)

Covers the wire shape of messages crossing the `postMessage` boundary.

#### Message envelope

```typescript
interface ComponentMessage {
  type: MessageType;
  properties: Record<string, unknown>;
}
```

`properties` is a plain object, not a `Map`. All values must be
structured-clone-safe: no `Map`, no class instances, no functions.

> **Note:** The current implementation uses `Map<MessageProperty | string, unknown>`
> for `properties`. This does not survive `postMessage` structured clone
> across iframe boundaries. See #130 for the fix. This protocol documents
> the correct target format.

#### Message types — host → component

| Type | Key properties | Purpose |
|------|---------------|---------|
| `INIT` | `component_id`, plus arbitrary params | Initialise with configuration |
| `DATASET` | `component_id`, `dataSet`, plus params from INIT | Deliver/update dataset |
| `FUNCTION_RESPONSE` | `functionResponse` | Return function call result |

#### Message types — component → host

| Type | Key properties | Purpose |
|------|---------------|---------|
| `FILTER` | `component_id`, `filter` | Request cross-filter |
| `FUNCTION_CALL` | `component_id`, `functionCallRequest` | Request server-side function |
| `FIX_CONFIGURATION` | `component_id`, `configurationIssue` | Signal invalid config |
| `CONFIGURATION_OK` | `component_id` | Signal config resolved |
| `READY` | `component_id` | Signal readiness (reserved) |

#### Property keys

String constants from the `MessageProperty` enum, used as plain string keys:

| Key | Value | Used in |
|-----|-------|---------|
| `component_id` | `"component_id"` | All messages |
| `dataSet` | `"dataSet"` | DATASET |
| `configurationIssue` | `"configurationIssue"` | FIX_CONFIGURATION |
| `filter` | `"filter"` | FILTER |
| `functionCallRequest` | `"functionCallRequest"` | FUNCTION_CALL |
| `functionResponse` | `"functionResponse"` | FUNCTION_RESPONSE |
| `mode` | `"mode"` | INIT (optional) |

Components must use string values as keys, not enum references — the host
and component may not share the same module.

#### Data types

All types used in message properties are plain objects:

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
  // Current code uses Map<string, unknown> — same #130 fix applies
}

interface FunctionResponse {
  message: string;
  request: FunctionCallRequest;
  resultType: FunctionResultType;  // "SUCCESS" | "ERROR" | "NOT_FOUND"
  result: unknown;
}
```

#### `component_id`

Set by the host on INIT. The component must echo it on every message sent
back to the host. The host uses it to route messages when multiple iframe
components coexist in a dashboard.

### Protocol 2: Iframe Component Lifecycle (`iframe-component-lifecycle.md`)

Covers the sequence contract and state signalling rules.

#### Lifecycle sequence

```
Host                          Component
  │                               │
  ├── INIT (params + id) ────────►│
  │                               │  validate params
  │                               │  MAY send FIX_CONFIGURATION
  │                               │
  ├── DATASET (data + params) ───►│
  │                               │  validate dataset
  │                               │  MAY send FIX_CONFIGURATION
  │                               │
  │◄── FILTER ────────────────────┤
  │                               │
  │◄── FUNCTION_CALL ─────────────┤
  ├── FUNCTION_RESPONSE ─────────►│
  │                               │
  ├── DATASET (updated) ─────────►│  after filter or poll
```

#### Ordering guarantees

- INIT always precedes the first DATASET
- DATASET may arrive multiple times (after filters, polling, user actions)
- Each DATASET re-delivers the INIT params alongside the data
- FUNCTION_RESPONSE correlates to a prior FUNCTION_CALL by `functionName`

#### Configuration error flow

1. Component validates params (on INIT) or dataset shape (on DATASET)
2. Invalid → send `FIX_CONFIGURATION` with a human-readable message
3. User corrects configuration in the dashboard editor
4. Host re-sends INIT or DATASET with corrected values
5. Component validates again → if valid, send `CONFIGURATION_OK`
6. `CONFIGURATION_OK` clears any error indicator in the host UI

Components should provide actionable error messages — e.g.,
"Heatmap expects 2 columns: Node ID (TEXT or LABEL) and value (NUMBER)",
not "Invalid configuration".

#### Function call correlation

- Component sends `FUNCTION_CALL` with `functionName` and `parameters`
- Host executes server-side and returns `FUNCTION_RESPONSE`
- `resultType` is `SUCCESS`, `ERROR`, or `NOT_FOUND`
- Correlation is by `functionName` — only one in-flight call per
  function name is supported

#### READY (reserved, not yet implemented)

`MessageType.READY` exists but is not implemented. The host currently
treats all components as immediately ready after INIT. Future use: signal
readiness after async setup (loading external resources, establishing
connections).

#### Dev mode testing

`@casehubio/pages-iframe-dev` provides a local test harness simulating
the host side. Not a contractual interface — an internal testing tool.

- `manifest.dev.json` — defines INIT params, dataset, and function responses
- Dev harness sends INIT then DATASET on 100ms delay, simulating
  production sequence
- Separate entry point (`index-dev.tsx` or equivalent) adds dev harness
  alongside the component

## Protocol metadata

Both protocols use:
- `type: rule`
- `scope: repo`
- `severity: important`
- `applies_to: "third-party and internal iframe components communicating with the casehub-pages host via postMessage"`

## Implementation

Writing the two protocol files to `docs/protocols/casehub/`:
1. `iframe-message-format.md`
2. `iframe-component-lifecycle.md`

Update `docs/protocols/casehub/INDEX.md` and
`docs/protocols/INDEX.md` with the new entries.
