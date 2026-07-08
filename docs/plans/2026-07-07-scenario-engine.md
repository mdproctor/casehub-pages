# Scenario Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> subagent-driven-development (recommended) or executing-plans to
> implement this plan task-by-task. Each task follows TDD
> (test-driven-development) and uses ide-tooling for structural
> editing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Focal issue:** #142 — Scenario Engine — composition, triggers, remote control, demo UI
**Issue group:** #140 (epic), #141 (prerequisite — must be complete), #142
**Spec:** `docs/specs/2026-07-07-datasource-abstraction-design.md` — sections 3, 4, 5

**Goal:** Build a demo authoring engine where data events, UI actions, and visual annotations are scripted on a shared timeline with speed control, operable from any browser tab or machine.

**Architecture:** `Scenario` is the top-level composition — sources, steps, and controller. Steps fire on time triggers, data predicates, or after-chains. UI actions dispatch real DOM events. Annotations are positioned overlays managed by the controller. Remote control via `ScenarioHost`/`ScenarioRemote` over `ControlChannel` (BroadcastChannel or WebSocket).

**Tech Stack:** TypeScript 5, Lit (for interactive UI components per web-component-strategy protocol), Vitest.

**Prerequisite:** #141 (DataSource Core) must be complete — `DataSource`, `DataSink`, `ScenarioController`, `createScenarioController`, and all source implementations must be available.

## Global Constraints

- All scenario engine code in `packages/pages-runtime/src/scenario/`
- UI components follow `web-component-strategy` protocol: Lit for interactive (scenario-controls, dataset-explorer), vanilla for display-only (annotation overlay)
- Custom element naming: `pages-` prefix (e.g., `<pages-scenario-controls>`)
- Do not add new `pages-*` CustomEvent names without updating `pages-event-contract` protocol
- `DataTrigger` evaluates on mutation events only — not snapshots (spec §3.3)
- Annotation lifecycle: duration-based auto-remove + persistent one-at-a-time (spec §3.5)

---

## File Structure

### New Files (pages-runtime)

```
packages/pages-runtime/src/scenario/
├── scenario.ts                     # scenario(), Scenario interface, start/stop
├── scenario.test.ts
├── steps.ts                        # step execution engine
├── steps.test.ts
├── triggers/
│   ├── time-trigger.ts
│   ├── data-trigger.ts             # sink-wrapping intercept, predicate evaluation
│   ├── after-trigger.ts
│   └── triggers.test.ts
├── ui-actions.ts                   # UIAction dispatch (click, type, select, scroll, hover, navigate)
├── ui-actions.test.ts
├── annotations.ts                  # annotation lifecycle management
├── annotations.test.ts
├── remote/
│   ├── host.ts                     # ScenarioHost
│   ├── remote.ts                   # ScenarioRemote
│   ├── channel.ts                  # ControlChannel, ControlMessage types
│   ├── broadcast-channel.ts
│   ├── websocket-channel.ts
│   └── remote.test.ts
├── ui/
│   ├── scenario-controls.ts        # <pages-scenario-controls> Lit component
│   ├── dataset-explorer.ts         # <pages-dataset-explorer> Lit component
│   └── annotation-overlay.ts       # transparent overlay, vanilla HTMLElement
└── index.ts
```

---

### Task 1: Scenario Composition + Step Engine

**Implements:** spec §3.1, §3.2

- `scenario(config)` creates and wires sources to sinks
- Step execution engine: registers steps, evaluates triggers, fires actions/annotations
- Named steps for after-chaining

### Task 2: Trigger System

**Implements:** spec §3.3

- `TimeTrigger` — `controller.schedule(at, ...)`
- `DataTrigger` — wraps DataSink to intercept mutation events, evaluates `DataPredicate`, fires once
- `AfterTrigger` — chains to named step completion with optional delay
- All triggers respect controller speed/pause

### Task 3: UI Actions + Annotations

**Implements:** spec §3.4, §3.5

- `UIAction` dispatch: `document.querySelector(target)` → synthesise DOM events
- Annotation lifecycle: duration-based vs persistent, `activeAnnotations` management
- Controller integration: `onAnnotation()` notifies listeners

### Task 4: Remote Control

**Implements:** spec §4.1, §4.2, §4.3

- `ScenarioHost` — wraps controller, accepts ControlChannel connections
- `ScenarioRemote` — sends commands, receives state updates
- `ControlChannel` abstraction with `send()/onMessage()/close()`
- `broadcastChannel(name)` — BroadcastChannel API implementation
- `webSocketChannel(url)` — WebSocket implementation
- State sync: initial state on connect, incremental on change

### Task 5: Dev/Demo UI Components

**Implements:** spec §5.1, §5.2, §5.3

- `<pages-scenario-controls>` — Lit component: play/pause, step, speed, elapsed, progress bar
- `<pages-dataset-explorer>` — Lit component: dataset list, schema, rows, event log
- Annotation overlay — vanilla HTMLElement with absolute positioning, ResizeObserver
- Pop-out to separate tab via `broadcastChannel`

### Task 6: Pipeline Scenario Integration

**Implements:** spec §6.5

- `PageOptions` gains `scenario?: Scenario` field
- Pipeline detects scenario mode and wires sources via `source.connect(sink)`
- Auto-injects `<pages-scenario-controls>` and annotation overlay
- Integration tests: full scenario running through pipeline to components

### Task 7: Typecheck, Lint, Protocol Review

Verification pass across all new code. Protocol coherence review.
