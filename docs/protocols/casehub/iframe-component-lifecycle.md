---
id: PP-20260706-93dd4b
title: "Iframe components follow INIT → DATASET lifecycle with configuration error signalling"
type: rule
scope: repo
applies_to: "third-party and internal iframe components communicating with the casehub-pages host via postMessage"
cross_repo_consumers: []
severity: important
refs: []
violation_hint: "Iframe component sends messages before receiving INIT, sends FILTER without component_id, or fails to signal FIX_CONFIGURATION on invalid input"
created: 2026-07-06
---

Iframe components follow a host-driven lifecycle. The host initiates
communication; the component responds. The rendering library inside the
iframe is the third party's choice — this protocol covers only the
sequence and state rules for messages crossing the `postMessage` boundary.

## Lifecycle sequence

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

## Ordering guarantees

- INIT always precedes the first DATASET
- DATASET may arrive multiple times (after filters, polling, user actions)
- Each DATASET re-delivers the INIT params alongside the data
- FUNCTION_RESPONSE correlates to a prior FUNCTION_CALL by `functionName`

## Configuration error flow

1. Component validates params (on INIT) or dataset shape (on DATASET)
2. Invalid → send `FIX_CONFIGURATION` with a human-readable message
3. User corrects configuration in the dashboard editor
4. Host re-sends INIT or DATASET with corrected values
5. Component validates again → if valid, send `CONFIGURATION_OK`
6. `CONFIGURATION_OK` clears any error indicator in the host UI

Components should provide actionable error messages — e.g.,
"Heatmap expects 2 columns: Node ID (TEXT or LABEL) and value (NUMBER)",
not "Invalid configuration".

## Function call correlation

- Component sends `FUNCTION_CALL` with `functionName` and `parameters`
- Host executes server-side and returns `FUNCTION_RESPONSE`
- `resultType` is `SUCCESS`, `ERROR`, or `NOT_FOUND`
- Correlation is by `functionName` — only one in-flight call per
  function name is supported

## READY (reserved, not yet implemented)

`MessageType.READY` exists in the enum but is not implemented. The host
currently treats all components as immediately ready after INIT.

Future use: signal readiness after async setup (loading external
resources, establishing connections).

## Dev mode testing

`@casehubio/pages-iframe-dev` provides a local test harness simulating
the host side. This is an internal testing tool, not a contractual
interface.

- `manifest.dev.json` defines INIT params, dataset, and function responses
- Dev harness sends INIT then DATASET on 100ms delay, simulating the
  production sequence
- Separate entry point (e.g., `index-dev.tsx`) adds the dev harness
  alongside the component

## Relationship to other protocols

- **iframe-message-format** — defines the wire shape of the messages
  whose sequence this protocol governs.
- **pages-event-contract** — covers host-DOM `CustomEvent` communication.
  Iframe components are isolated from this event system.
