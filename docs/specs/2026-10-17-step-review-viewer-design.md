# Step Review Viewer — Design Specification

**Date:** 2026-10-17
**Status:** Draft
**Mockup:** `docs/mockups/step-review-viewer.html`

## Problem

CaseHub applications are defined in YAML across multiple semantic layers (case definitions, agentic patterns, eidos descriptors, runtime steps, work templates, summarisation pipelines). Today the only review surface is a text editor with syntax highlighting. When an LLM generates or modifies this YAML, the human reviewer must mentally parse indentation, match signal names across branches, trace data dependencies through expressions, and reconstruct concurrent execution topology from text. This is the same limitation that makes Java concurrent code hard to review — except CaseHub's YAML encodes structure explicitly, which means we can do better.

## Solution

A read-only semantic viewer panel synced to the text editor. The viewer renders parsed YAML using purpose-built visual treatments per semantic category. The LLM writes, the human reviews. The viewer makes correctness visually obvious and errors visually jarring.

## Design Decisions

### D1: Priority Domain

**Choice:** Concurrency + Coordination first
**Alternatives:**
- All domains shallow first — spreads effort too thin, weaker demo impact
- Sequential + control flow first — most common but least differentiated vs text
- Data-driven + forEach — practical but not visually distinctive
**Rationale:** Strongest "Java can't do this" showcase. Swim lanes, signal arrows, barrier bars are impossible to derive from general-purpose code review.
**Trade-offs:** Common sequential steps get basic rendering first, not optimised.

### D2: Rendering Approach

**Choice:** HTML Grid + SVG arrows
**Alternatives:**
- Compact structured text — simpler but loses spatial relationships
- Full SVG diagram — most polished but hardest to diff, accessibility concerns
**Rationale:** HTML for content (selectable text, accessible), SVG overlay for connections (signal arrows, barrier bars). Best balance of visual clarity and implementation effort.
**Trade-offs:** More complex than pure text rendering, simpler than full SVG.

### D3: Diff Style

**Choice:** Unified diagram
**Alternatives:**
- Side-by-side diagrams — 2x horizontal space, harder to spot inline changes
- Toggle (before/after) — compact but requires interaction to compare
**Rationale:** Changes visible in spatial context. Green = added, red = removed, amber = modified. The reviewer sees what changed without reconstructing the full picture.
**Trade-offs:** Can get cluttered with many simultaneous changes.

### D4: Agent Coordination View

**Choice:** Auto-switch between swim lanes and graph based on pattern topology
**Alternatives:**
- Swim lanes only — loses non-linear topologies (fan-out/fan-in, supervisor hub-and-spoke)
- Graph only — loses temporal ordering that swim lanes naturally show
**Rationale:** Different topologies deserve different visualizations. `concurrent:` → swim lanes. Supervisor → hub-and-spoke. Fan-out/fan-in → DAG. Pattern type drives the choice.
**Trade-offs:** More complex rendering logic, but produces the right visualization for each case.

### D5: Graph Rendering Infrastructure

**Choice:** Reuse existing `graph-core` + `graph-renderer` packages
**Alternatives:**
- Build custom SVG graph renderer — duplicates existing capability
- Use external library — adds dependency, doesn't integrate with stencil registry
**Rationale:** `graph-core` already has `GraphModel` (nodes, edges, decorations), `graph-renderer` has `<pages-graph-canvas>` with ELK layout, stencil registry, and drill-down navigation. The agent coordination graph view is a mapping problem, not a rendering problem.
**Trade-offs:** Dependency on React Flow (via graph-renderer), but already in the project.

### D6: Agent Drill-Down Tabs

**Choice:** Eidos / Pattern / Steps (aligned with CaseHub concepts)
**Alternatives:**
- Manifest / Edison / Runtime — original mockup naming, not aligned with platform terminology
**Rationale:** "Eidos" IS the agent identity spec in CaseHub. "Pattern" is the blocks agentic pattern. "Steps" is the runtime playbook. Using platform-native terms avoids confusion.
**Trade-offs:** None — pure naming alignment.

### D7: Architecture

**Choice:** Read-only companion panel synced to text editor
**Alternatives:**
- Integrated editor with graphical editing — too complex for v1
- Standalone viewer — loses the edit/review workflow
**Rationale:** LLM generates YAML in the text editor, human reviews in the semantic viewer. Changes in the editor trigger re-parse and re-render in the viewer. Edit in one, review in the other.
**Trade-offs:** No graphical editing (deferred to future version).

### D8: Editor Sync Protocol

**Choice:** Parse-on-debounce with last-valid-state freeze
- Re-parse on 300ms debounce after last editor change
- On successful parse: update viewer immediately
- On parse error: freeze at last valid render, show error indicator bar at top ("line 23: unexpected key 'concurent'")
- Cursor position in editor highlights corresponding step in viewer (bidirectional: clicking a step in the viewer scrolls the editor to that line)
**Rationale:** Mid-edit YAML is almost always unparseable. Blanking the viewer on every keystroke is useless. Freezing at last-valid with an error bar gives the reviewer context while the LLM (or human) is still typing.

### D9: Invalid/Error State Rendering

**Choice:** Degraded-mode rendering with inline error markers
- When YAML has syntax errors: show a "parse error" banner with line/column, viewer shows last valid state
- When YAML is syntactically valid but semantically wrong (unknown step type, mismatched signal names, circular dependencies): render what we can, mark errors inline with red badges on the affected steps/signals
- Unresolved signal names: red dashed arrow with "unresolved" label
- Unknown step type: step card with red icon and "unknown: xyz" label
- Circular dependency: red highlight on the cycle path
**Rationale:** LLM-generated YAML will have errors. The viewer's job is to make those errors visible, not hide behind a blank screen. Degraded-mode rendering is a v1 requirement.

### Design Scope vs Implementation Scope

The mockup (27 sections, 5 parts) is the **design horizon**, not the v1 implementation scope. The holistic design ensures leaf components (step cards, expression pills, decorator badges) compose correctly when higher layers arrive (patterns, aggregate views, focus modes). Building without the full picture produces components that work in isolation but need refactoring at integration time. The v1/v2/v3 phasing controls *implementation* scope; the 27-section mockup controls *design coherence*.

### D10: v1 Scope — Single File

**Choice:** v1 operates on a single playbook YAML file at a time
- No cross-file analysis
- No project aggregate view
- No focus modes (these require cross-file data)
- The viewer receives one `ResolvedStep[]` tree and renders it
- Cross-file features (aggregate dashboard, focus modes, multi-file diff) are v3
**Rationale:** A single-file viewer demonstrates the core value proposition (semantic rendering beats text review) without requiring a project model, file discovery, or multi-repo aggregation. Ship the step viewer first, add the project shell later.

### D11: Project Model — Open Problem

**Status:** Unresolved — blocks v3 (aggregate view, focus modes, multi-file diff)

The project aggregate view requires knowing which files constitute a CaseHub application. Today, a project is "random files over a number of folders" — eidos YAML in one place, case definitions in another, step playbooks in a third, desired state topologies elsewhere. There is no project manifest or convention that lets a viewer discover and aggregate them.

This is not a viewer problem — it's a platform problem. The viewer cannot solve it alone. Possible future approaches:
- A `casehub-project.yaml` manifest listing all constituent files
- Convention-based discovery (`META-INF/eidos/`, `META-INF/desiredstate/`, etc.)
- IDE workspace integration (the viewer reads the IDE's project model)
- Build-time assembly (Maven/Gradle collects the files into a known structure)

Until this is resolved, v3 features (aggregate dashboard, focus modes, cross-file diff) remain aspirational. The mockup shows what they WOULD look like, not how they source their data. This is explicitly a gap to be filled as the YAML surfaces and project conventions mature.

## Visual Vocabulary

These foundation components are reused across all semantic layers:

### Step Cards

Compact single-line rendering with action icon, action name, target, value. Decorators as badges on the right edge.

```
┌──────────────────────────────────────────────────┐
│ [icon] action  target  "value"    [retry: 3]     │
└──────────────────────────────────────────────────┘
```

### Decorator Badges

Small colored chips attached to step cards:
- `↻ retry: 3` (peach)
- `⏱ 5000ms` (amber)
- `↻ continuous` (teal)
- `? ${condition}` (purple)
- `🔒 mutex-name` (red)
- `∀ item in collection` (blue)

### Expression Pills

Inline colored spans by scope:
- `${params.*}` — blue (parameter)
- `${each.*}` — green (iteration variable)
- `${from.*}` — peach (channel/source data)
- `${module.*}` — purple (module output)

### Invoke Cards

Structured call cards showing method/protocol badge, endpoint, step name, and request body:

```
┌─────────────────────────────────────────────┐
│ [POST]  /api/cases           step: create   │
├─────────────────────────────────────────────┤
│ customer: "Alice Chen"                      │
│ channel: "web"                              │
└─────────────────────────────────────────────┘
```

### Swim Lanes

CSS Grid columns for concurrent branches. Steps flow top-to-bottom within each lane. SVG overlay for signal arrows between lanes.

### Barrier Bars

Horizontal bars spanning all lanes with name and count badge. Visually separates "before sync" from "after sync" steps.

### Signal Arrows

SVG arrows connecting signal-emit steps to signal-await steps across lanes. Arrow label shows signal name.

### Graph Nodes

`graph-core` `GraphNode` with `NodeDecoration` (badges, pills, borders) for agent/worker/pattern nodes. ELK layout via `graph-renderer`.

### Diff Markers

- Added: green background, green border, `+ NEW` badge
- Removed: red background, strikethrough, `- REMOVED` badge
- Modified: amber background, amber border, `MODIFIED` badge, inline `old → new` for changed values

## Semantic Layer Rendering

### Layer: Steps (v1 — build now)

The runtime playbook steps. This is the universal component — every agent has steps.

| Step Type | Visual Treatment |
|-----------|-----------------|
| UI actions (click, fill, navigate, assert) | Compact step card with action icon |
| Control flow (if/else) | Side-by-side branch panels with colored gutters |
| Control flow (match/cases) | Pattern table: pattern → step card |
| Control flow (try/catch/finally) | Stacked colored regions (green/red/teal) |
| Concurrent branches | Swim lanes with signal arrows and barrier bars |
| Parallel (unnamed) | Swim lanes without headers |
| Race | Swim lanes with "first wins" indicator |
| Quorum | Barrier bar with "N of M required" |
| Select | Signal multiplexing (first-to-fire indicator) |
| Delay | Dashed-line gap with time label |
| Agent-delegate | Agent card with model badge, descriptor, structured output flag |
| REST/GraphQL/MCP calls | Invoke cards with method badge and body |
| Script execution | Code block with runtime badge |
| ForEach over data | Data table with typed columns + iteration binding |
| State machine | Node diagram with transitions |
| Channel pub/sub | Publish/subscribe badges on step cards |
| Mutex | Lock icon badge, same-mutex steps visually linked |
| Work items | Distinct card style (human icon, SLA indicator, lifecycle state) |

### Layer: Agentic Patterns (v2 — build when blocks YAML matures)

v2 targets 3 pattern topologies that have mockups and infrastructure:

| Pattern | Visual Treatment | Status |
|---------|-----------------|--------|
| `parallel` | Swim lanes | Mocked (reuses step viewer swim lanes) |
| `voting` | Convergence: all agents → aggregation node → result | Mocked (section 19) |
| `debate` | Turn-based rounds (vertical flow, judge at bottom) | Mocked (section 20) |

Remaining 5 patterns deferred — design when real blocks YAML exercises them:

| Pattern | Likely Treatment | Deferred Because |
|---------|-----------------|-----------------|
| `sequence` | Linear step list | Trivial — just step cards in order |
| `supervisor` | Hub-and-spoke graph | Needs real supervisor YAML to understand dynamic routing visuals |
| `loop` | Linear with back-edge | Needs real loop examples to understand exit condition rendering |
| `conditional` | Branch diagram | Reuses control flow blocks — may not need separate work |
| `HTN` | Hierarchical tree | Needs real HTN decomposition YAML; ELK mrtree is hand-waving without it |

Each agent in a pattern is a clickable node that drills into the agent view.

### Layer: Eidos (v2 — build with agentic patterns)

Agent identity rendering:

| Eidos Aspect | Visual Treatment |
|-------------|-----------------|
| Identity (slot, archetype, model) | Header card with badges |
| Capabilities | List with confidence scores and health indicators |
| Disposition (5 axes) | Radar/polar chart or labeled bar indicators |
| Goals | Priority-tagged list (PRIMARY/SECONDARY) |
| Constraints | Severity-tagged list (HARD/SOFT) |
| Briefing | Collapsible prose block |

### Layer: Case Definition (v3 — build when navigation hierarchy is clear)

| Case Aspect | Visual Treatment |
|-------------|-----------------|
| Choreography (reactive) | Blackboard diagram: context center, bindings as trigger edges, workers as peripheral nodes |
| Orchestration (sequential) | Linear/planned execution flow |
| Bindings | Trigger rules: JQ condition → worker dispatch |
| Goals/Milestones | Progress indicators |
| Workers | Cards with type badge (Function/Workflow/Agent/SubCase/HumanTask) |

### Layer: Summarisation Pipelines (v3)

| Pipeline Aspect | Visual Treatment |
|----------------|-----------------|
| Levels | Vertical funnel: events → grouping → classification → phase detection |
| Grouping | Badge showing strategy (windowed/keyed) |
| Summarisers | Type-specific rendering (threshold rules, state machine, field extraction) |

### Layer: Desired State Topology (v3)

| Desired State Aspect | Visual Treatment |
|---------------------|-----------------|
| Nodes + dependencies | DAG graph via `graph-core` + `graph-renderer` |
| forEach expansion | Template/Expanded toggle — 1 template node vs N stamped instances (teal-colored) |
| `when:` conditionals | Dashed border node (may or may not exist) |
| Rules (auto-wiring) | Rule-generated edges shown in different style from declared edges |
| Invariants | Validation badges on nodes/edges |
| Lifecycle phases | Progressive vertical layers with completion gates and progress bars |
| Modules | Imported subgraphs with alias prefix, collapsible |

### Layer: Saga Compensation (v3)

| Saga Aspect | Visual Treatment |
|-------------|-----------------|
| Forward + compensation dual path | Side-by-side or stacked: forward bindings left, compensation chain right, pairing arrows between |
| Compensation gaps | Red warning on bindings without `compensatedBy` — immediate visual bug signal for FSI review |
| Compensation-only bindings | Dimmed in forward view, highlighted in compensation view (`compensation: true`) |
| Compensation order | Explicit `compensationOrder` shown; inferred reverse topological order shown with "computed" badge |
| Runtime timeline | Forward steps → compensation trigger (who, why) → compensation steps → final status |
| WorkItem compensation | Original linked to compensating WorkItem, `CompensationStatus` badge |

### Layer: Deployment Topology (v3 — ops)

| Deployment Aspect | Visual Treatment |
|-------------------|-----------------|
| CaseHub application nodes | Service cards with type badge, image, replicas |
| Phased rollout | Progressive layers: Foundation → Services → Agent Fleet |
| Phase completion | Progress bars with status (complete/provisioning/pending) |
| forEach fleet expansion | Agent fleet cards with model badges, generated from inline data |
| Adaptive topology | Trigger → action cards (situation-confidence → scale/update mutations) |

## Component Architecture

```
<pages-step-viewer>           ← v1: renders parsed steps
  ├── <step-card>             ← compact action rendering
  ├── <swim-lane-view>        ← concurrent branches
  ├── <control-flow-block>    ← if/else, match, try/catch
  ├── <invoke-card>           ← REST/GQL/MCP calls
  ├── <data-table-view>       ← inline CSV rendering
  └── <diff-overlay>          ← unified diff markers

<pages-pattern-viewer>        ← v2: renders blocks patterns
  ├── <pages-graph-canvas>    ← reused from graph-renderer
  ├── <swim-lane-view>        ← reused from step-viewer
  └── <agent-card>            ← agent node with eidos summary

<pages-agent-viewer>          ← v2: agent drill-down
  ├── <eidos-view>            ← identity, capabilities, disposition
  ├── <pages-pattern-viewer>  ← if agent participates in a pattern
  └── <pages-step-viewer>     ← runtime steps

<pages-application-viewer>    ← v3: full case navigation
  ├── <case-overview>         ← choreography/orchestration view
  ├── <pages-pattern-viewer>  ← per-capability patterns
  └── <pages-agent-viewer>    ← per-agent drill-down
```

Each level reuses components from the level below. The step viewer is the leaf component that everything builds on.

## Maturation Order

The phases follow a natural maturation order — render first, navigate second, aggregate third, diff last. Each phase can ship independently. Don't gate earlier phases on later ones.

| Order | Phase | Question it answers | Notes |
|-------|-------|-------------------|-------|
| 1 | **Render** | "Can I see what the YAML does?" | Step cards, swim lanes, control flow, invoke cards. Single file, no navigation. Ship this first. |
| 2 | **Navigate** | "Can I move between levels?" | Drill-down, breadcrumbs, Eidos/Pattern/Steps tabs. |
| 3 | **Aggregate** | "Can I see the whole project?" | Project dashboard, focus modes. Start with pragmatic file-location assumptions — the UI leads, infrastructure follows. Don't wait for a formal project model. |
| 4 | **Diff** | "What changed?" | Semantic diff is a maturation feature. Rendering must be stable before diffs are meaningful. Real usage reveals what diffs look like — designing the algorithm in advance is premature. |

Diff depends on stable rendering. Aggregation depends on navigation. Navigation depends on rendering. Each layer is built on the previous.

## Diff Architecture

### Step-level diff (v1)

Compare two parsed `ResolvedStep[]` trees. Matching strategy (deliberately simple — refine over time):

1. **Named steps** (`step: X`): match by name — exact, reliable
2. **Unnamed steps**: match by position within their parent block — good enough for sequential steps
3. **Renames**: show as remove + add (honest — the reviewer sees both). No heuristic rename detection in v1.
4. **Reorders**: position-based matching means a reorder shows as multiple changes. Acceptable for v1 since LLMs tend to regenerate sections rather than surgically reorder.

The matching algorithm is an internal implementation detail — the visual rendering (unified diagram with green/amber/red markers) is the stable API. The algorithm can be improved without changing the UX. Collect real diff examples that render badly, then refine for those specific cases.

### Application-level diff (v3)

Multi-file diff summary at the top:
```
Diff — KYC Application
  + 1 agent added (pep-screener)
  ~ quorum 2/3 → 3/4
  ~ risk-assessor params updated
  + new eidos descriptor
  + new runtime steps
```

Drill into each file's semantic diff using the same unified diagram approach.

---

## User Journey: Day 0 to Deployed Project

The viewer must serve the user at every stage of building a distributed agent application — not just when the project is complete. At each stage, it shows what exists, what's incomplete, and lets the user focus on the area they're working on.

### Stage 1: Project Manifest

The user starts with a project definition — a manifest declaring what this application is.

```yaml
namespace: io.casehub.fsi
name: trade-surveillance
version: "1.0"
title: "Trade Surveillance System"
```

**Viewer shows:** Project identity card. Everything else is empty — but the viewer shows placeholder sections for what comes next (agents, case, infrastructure), each marked "not yet defined." This is the skeleton the user will fill in.

### Stage 2: Agent Design (Eidos)

The user defines who the agents are — their identities, capabilities, disposition, goals, constraints. At this point there are no steps, no case definition, no infrastructure. Just agents.

**Viewer shows:** Agent gallery — a grid of eidos cards, each showing slot, archetype, model badge, capability list with confidence scores, disposition bars. The user can see at a glance: "I have 4 agents defined, the compliance-analyst has high rule-following but the risk-scorer has low risk-appetite." No drill-down yet — there's nothing inside to drill into.

**Completeness signal:** Each agent card shows what's defined (identity, capabilities, disposition) and what's not (no steps, no pattern assignment).

### Stage 3: Case Architecture

The user defines the coordination structure — capabilities the system needs, bindings that trigger on context changes, workers that execute capabilities, goals that define done.

**Viewer shows:** Case overview — the choreography/blackboard view (section 17) or a sequential orchestration flow. Workers now link to the eidos agents defined in stage 2. The viewer shows which workers have agents assigned and which don't.

**Completeness signal:** Workers without implementations (no steps, no pattern) are marked "stub." Bindings without target workers are flagged. Goals without reachable paths are warned.

### Stage 4: Agent Implementation (Steps)

The user (or LLM) writes the runtime steps for each agent — REST calls, MCP tools, control flow, concurrency, data processing. This is where the core step viewer comes in.

**Viewer shows:** Full step rendering — step cards, swim lanes, signal arrows, barrier bars, expression pills, invoke cards. The user can now drill from the case view into any worker and see its steps.

**Focus mode: "LLM Logic"** — filters to show only agent-delegate steps, the expressions they consume, and the structured outputs they produce. Hides infrastructure steps (REST, GraphQL) to focus on what the LLMs are actually deciding.

### Stage 5: Orchestration Patterns

The user defines how agents collaborate — voting, debate, supervisor routing, parallel extraction. These are blocks agentic patterns that sit between the case and the individual agents.

**Viewer shows:** Pattern topology views (section 19-20) — voting convergence, debate rounds, supervisor hub-and-spoke. Each agent in the pattern links to its eidos card and drill-down to its steps.

### Stage 6: Safety — Sagas, Work Items, Compliance

The user adds compensation paths (saga reversal chains), human-in-the-loop checkpoints (work items with SLA), and compliance controls.

**Viewer shows:** Saga dual path (forward + compensation), compensation gap detection (red warnings on bindings without compensatedBy), work item cards with SLA indicators and lifecycle states.

**Completeness signal:** Forward steps without compensation paths are visually flagged. This is critical for FSI — every consequential action needs an undo path.

### Stage 7: Infrastructure (Desired State)

The user defines the deployment topology — what services should exist, their dependencies, forEach fleet expansion, lifecycle phases.

**Viewer shows:** Desired state graph with dependsOn backward resolution, forEach forward expansion, lifecycle phase progress bars, module imports. Unresolved dependencies shown as broken red arrows.

### Stage 8: Deploy

The user deploys via ops topology YAML — progressive phased rollout (foundation → services → fleet), adaptive topology mutations.

**Viewer shows:** Deployment topology with phase progress, adaptive trigger→action cards, fleet status.

### Project Aggregate View

At any stage, the user can zoom out to see the project as a whole. The aggregate view is a dashboard with panels:

| Panel | What it shows |
|-------|--------------|
| **Agents** | Grid of eidos cards (stage 2+) — slot, model, key capabilities |
| **Case** | Choreography/orchestration miniature (stage 3+) — bindings, workers, goals |
| **Steps** | Expandable per-agent step summaries (stage 4+) — step count, types, complexity |
| **Patterns** | Pattern topology thumbnails (stage 5+) — voting, debate, supervisor |
| **Safety** | Compensation coverage bar + work item count (stage 6+) |
| **Infrastructure** | Desired state topology miniature (stage 7+) — node count, dependency count |
| **Deploy** | Phase progress (stage 8) |

### Focus Filters

The aggregate view supports focus modes that filter to a specific concern:

| Focus | What it shows | Why |
|-------|--------------|-----|
| **LLM Logic** | Agent-delegate steps only, model choices, structured output schemas, prompt descriptors | "What are the LLMs actually deciding?" |
| **Data Flow** | Expressions across all steps showing how data moves between agents and services | "Where does the trade data go?" |
| **Concurrency** | All concurrent/parallel/race blocks, signals, barriers, channels | "What runs in parallel and how does it sync?" |
| **Safety** | Saga compensation chains, gap detection, work items, constraints | "Is every action reversible? Where are the human checkpoints?" |
| **Infrastructure** | Desired state topology, deployment phases, adaptive mutations | "What gets deployed and in what order?" |
| **Diff** | Semantic changes across all layers since last version | "What did the LLM change?" |

These focus modes answer the questions a reviewer asks at each stage. "LLM Logic" is the most important during stage 4 — the reviewer wants to see what the LLMs are doing without wading through REST plumbing.

---

## FSI Use Cases

These use cases show what a reviewer would see in the viewer when reviewing LLM-generated YAML for distributed agent coordination in financial services.

### Use Case 1: Trade Surveillance — Suspicious Activity Detection

A trade surveillance system where multiple LLM agents monitor trading activity, detect anomalies, and coordinate on investigation.

#### Case Definition (engine)

```yaml
dsl: "1.0.0"
namespace: io.casehub.fsi
name: trade-surveillance
version: "1.0"
title: "Trade Surveillance — Suspicious Activity Detection"

spec:
  planningStrategy: choreography

  capabilities:
    - name: monitorTrades
      description: "Monitor real-time trade feed for anomalous patterns"
      inputProjection: "{ feed: .tradeFeed, thresholds: .config.thresholds }"
      outputProjection: "{ anomalies: .detected }"

    - name: correlateActivity
      description: "Cross-reference flagged trades with account history and market data"
      inputProjection: "{ anomalies: .anomalies, accounts: .accounts }"
      outputProjection: "{ correlations: .findings }"

    - name: assessRisk
      description: "Score correlation findings for SAR filing threshold"
      inputProjection: "{ correlations: .correlations, policy: .config.riskPolicy }"
      outputProjection: "{ riskScore: .score, recommendation: .action }"

    - name: humanReview
      description: "Compliance officer reviews AI findings before SAR filing"
      inputProjection: "{ findings: .correlations, risk: .riskScore, recommendation: .recommendation }"
      outputProjection: "{ decision: .decision, notes: .reviewNotes }"

  workers:
    - name: trade-monitor
      capabilities: [monitorTrades]
      type: agent

    - name: correlation-engine
      capabilities: [correlateActivity]
      type: agent

    - name: risk-scorer
      capabilities: [assessRisk]
      type: agent

    - name: compliance-reviewer
      capabilities: [humanReview]
      type: human
      executionPolicy:
        maxConcurrent: 1

  bindings:
    - name: on-trade-feed
      capability: monitorTrades
      on:
        contextChange:
          keys: ["tradeFeed"]
          filter: '.tradeFeed != null'

    - name: on-anomalies-detected
      capability: correlateActivity
      on:
        contextChange:
          keys: ["anomalies"]
          filter: '.anomalies != null and (.anomalies | length) > 0'

    - name: on-correlations-complete
      capability: assessRisk
      on:
        contextChange:
          keys: ["correlations"]
          filter: '.correlations != null'

    - name: on-high-risk
      capability: humanReview
      on:
        contextChange:
          keys: ["riskScore"]
          filter: '.riskScore >= 0.7'

  milestones:
    - name: anomalies-detected
      condition: '.anomalies != null and (.anomalies | length) > 0'

    - name: risk-assessed
      condition: '.riskScore != null'

    - name: reviewed
      condition: '.decision != null'

  goals:
    - name: sar-filed
      condition: '.decision == "file-sar" and .sarReference != null'
      kind: success

    - name: cleared
      condition: '.decision == "no-action" and .reviewNotes != null'
      kind: success

    - name: escalated
      condition: '.decision == "escalate"'
      kind: success
```

**Viewer rendering:** Blackboard diagram with `tradeFeed` context at center. Four binding edges radiating out: `on-trade-feed` → `trade-monitor`, `on-anomalies-detected` → `correlation-engine`, `on-correlations-complete` → `risk-scorer`, `on-high-risk` → `compliance-reviewer`. Each binding edge labeled with its JQ filter condition. Milestones as progress markers. Goals as terminal indicators.

#### Agentic Pattern — Correlation (blocks)

```yaml
type: parallel
agents:
  - type: worker
    name: market-data-analyst
  - type: worker
    name: account-history-analyst
  - type: worker
    name: counterparty-analyst
aggregation:
  type: collect-all
```

**Viewer rendering:** Three swim lanes (market-data-analyst, account-history-analyst, counterparty-analyst) running in parallel, converging at a `collect-all` aggregation point.

#### Eidos — Trade Monitor Agent (eidos)

```yaml
descriptors:
  - agentId: trade-monitor-v1
    name: Trade Monitor
    slot: surveillance-analyst
    tenancyId: fsi-trading
    archetype: detective

    disposition:
      socialOrient: analytical
      ruleFollowing: strict
      riskAppetite: conservative
      autonomy: moderate
      conflictMode: competing
      delegation: true

    capabilities:
      - name: pattern-detection
        tags: [temporal, statistical, cross-asset]
        epistemic:
          domain: market-microstructure
          confidence: 0.85
      - name: anomaly-classification
        tags: [wash-trading, spoofing, layering, front-running]
        epistemic:
          domain: market-abuse-regulation
          confidence: 0.78

    goals:
      - name: detect-anomalies
        description: "Identify trading patterns that deviate from normal behaviour"
        priority: PRIMARY
        visibility: PUBLIC
      - name: minimize-false-positives
        description: "Maintain precision above 85% to avoid alert fatigue"
        priority: SECONDARY
        visibility: PUBLIC

    constraints:
      - name: no-trading-decisions
        description: "Never recommend or execute trades. Observation and flagging only."
        severity: HARD
        visibility: PUBLIC
      - name: data-retention
        description: "All flagged patterns must be retained for 7 years per MAR"
        severity: HARD
        visibility: PUBLIC

    briefing: >-
      You are a Trade Monitor agent specialising in market abuse detection.
      You analyse real-time trade feeds for patterns indicative of wash trading,
      spoofing, layering, and front-running. You operate under strict regulatory
      constraints — you observe and flag, never act. False positives waste
      compliance resources; false negatives risk regulatory action.
```

**Viewer rendering (Eidos tab):** Identity card showing slot "surveillance-analyst", archetype "detective", model badge. Disposition rendered as 5 labeled bars (analytical, strict, conservative, moderate, competing). Capabilities with confidence scores (0.85, 0.78) and domain tags. Goals with PRIMARY/SECONDARY priority. Constraints with HARD severity and red indicators.

#### Runtime Steps — Trade Monitor (platform/pages)

```yaml
playbook: "1.0"
schema: server
---
playbook: trade-monitor-runtime
params:
  - name: feed
    type: object
    required: true
  - name: thresholds
    type: object
    required: true

steps:
  - rest-request:
      name: fetch-baseline
      method: GET
      url: /api/market-data/baseline
      params:
        instrument: "${params.feed.instrument}"
        window: "30d"
    timeout: 10s

  - agent-delegate:
      descriptor: pattern-detector
      model: claude-sonnet-5
      structuredOutput: true
      params:
        trades: "${params.feed.trades}"
        baseline: "${fetch-baseline.result}"
        thresholds: "${params.thresholds}"

  - if: "${ pattern-detector.result.anomalies | length > 0 }"
    then:
      - parallel:
        - mcp-call:
            name: enrich-market-context
            tool: market-context-lookup
            params:
              instrument: "${params.feed.instrument}"
              timestamp: "${pattern-detector.result.firstAnomaly.timestamp}"
        - graphql-exec:
            name: fetch-account-positions
            domain: trading
            operation: accountPositions
            params:
              accountIds: "${pattern-detector.result.involvedAccounts}"
      - agent-delegate:
          name: classify-anomalies
          descriptor: anomaly-classifier
          model: claude-opus-5
          structuredOutput: true
          params:
            anomalies: "${pattern-detector.result.anomalies}"
            marketContext: "${enrich-market-context.result}"
            positions: "${fetch-account-positions.result}"
          retry: 2
          timeout: 30s
    else:
      - log: { message: "No anomalies detected for ${params.feed.instrument}" }
```

**Viewer rendering (Steps tab):** Sequential steps: REST call card (GET baseline), agent-delegate card (pattern-detector, sonnet-5). Then an if/else block — condition `anomalies.length > 0`. The "then" branch has two parallel swim lanes (MCP call + GraphQL call) converging, then another agent-delegate (classify-anomalies, opus-5, with retry:2 and timeout:30s badges). The "else" branch has a single log step.

#### Work Template — Compliance Review (work)

```yaml
templates:
  - name: sar-review
    description: "Compliance officer review of AI-flagged suspicious activity"
    candidateGroups: [compliance-officers, senior-compliance]
    priority: HIGH
    expiryHours: 4
    claimHours: 1
    requiredCapabilities:
      - regulatory-review
      - sar-filing
    permittedOutcomes: '["file-sar", "no-action", "escalate", "request-more-info"]'
    labels:
      instrument: "${context.feed.instrument}"
      riskScore: "${context.riskScore}"
      anomalyType: "${context.correlations[0].type}"
    assignmentStrategy: LEAST_LOADED
```

**Viewer rendering:** Work item card (distinct from agent cards) with human icon, "HIGH" priority badge, "4h SLA" countdown indicator, candidate groups chip, required capabilities list, and four permitted outcomes as labeled buttons.

#### Summarisation Pipeline — Trade Event Stream (blocks)

```yaml
pipeline:
  name: trade-signal-aggregation
  source:
    cloud-event-type: io.casehub.fsi.trade.v1
  tick-interval: 5000
  levels:
    - name: per-instrument
      grouping:
        type: keyed
        key: instrumentId
      summariser:
        type: pass-through
      emit:
        cloud-event-type: io.casehub.fsi.trade.instrument.v1

    - name: anomaly-window
      grouping:
        type: windowed
        count: 50
        max-age: 60000
      summariser:
        type: threshold-classify
        rules:
          - name: volume-spike
            when: "volumeRatio > 3.0"
            category: VOLUME_ANOMALY
            severity: MEDIUM
          - name: price-deviation
            when: "Math.abs(priceDeviation) > 0.05"
            category: PRICE_ANOMALY
            severity: HIGH
          - name: wash-pattern
            when: "selfTradeRatio > 0.3"
            category: WASH_TRADING
            severity: CRITICAL
      emit:
        cloud-event-type: io.casehub.fsi.trade.anomaly.v1

    - name: alert-phase
      summariser:
        type: phase-detect
        initial: NORMAL
        states: [NORMAL, ELEVATED, CRITICAL]
        transitions:
          - from: NORMAL
            to: ELEVATED
            count-field: severity
            count-value: MEDIUM
            op: ">="
            threshold: 3
          - from: ELEVATED
            to: CRITICAL
            count-field: severity
            count-value: CRITICAL
            op: ">="
            threshold: 1
          - from: ELEVATED
            to: NORMAL
            count-field: severity
            count-value: LOW
            op: "<="
            threshold: 0
      emit:
        cloud-event-type: io.casehub.fsi.trade.alert.v1
```

**Viewer rendering:** Vertical funnel with three levels. Level 1: "per-instrument" with keyed grouping badge (instrumentId). Level 2: "anomaly-window" with windowed grouping (50 events / 60s), three threshold rules shown as a table (condition → category → severity, color-coded). Level 3: "alert-phase" as a state machine diagram (NORMAL → ELEVATED → CRITICAL with transition conditions on the arrows).

---

### Use Case 2: KYC Verification Pipeline

Multi-agent document verification with parallel extraction, quorum-based decisions, and human escalation. (See mockup sections 13-16 for visual reference — the FSI use case that drove the original swim lane + graph design.)

#### Case Definition

```yaml
dsl: "1.0.0"
namespace: io.casehub.fsi
name: kyc-verification
version: "1.0"

spec:
  planningStrategy: sequential

  capabilities:
    - name: classifyDocuments
      inputProjection: "{ docs: .applicationDocs }"
      outputProjection: "{ classified: .documentTypes }"

    - name: extractIdentity
      inputProjection: "{ docs: .classified.identity }"
      outputProjection: "{ identity: .extracted }"

    - name: extractFinancials
      inputProjection: "{ docs: .classified.financial }"
      outputProjection: "{ financials: .extracted }"

    - name: verifyAddress
      inputProjection: "{ docs: .classified.address }"
      outputProjection: "{ address: .verified }"

    - name: screenSanctions
      inputProjection: "{ name: .identity.fullName, dob: .identity.dateOfBirth }"
      outputProjection: "{ sanctionsResult: .screening }"

    - name: assessRisk
      inputProjection: >-
        { identity: .identity, financials: .financials,
          address: .address, sanctions: .sanctionsResult,
          riskTier: .config.riskTier }
      outputProjection: "{ decision: .riskDecision }"

    - name: seniorReview
      inputProjection: "{ findings: .correlations, risk: .decision }"
      outputProjection: "{ finalDecision: .reviewed }"

  workers:
    - name: doc-classifier
      capabilities: [classifyDocuments]
      type: agent

    - name: identity-extractor
      capabilities: [extractIdentity]
      type: agent

    - name: financial-extractor
      capabilities: [extractFinancials]
      type: agent

    - name: address-verifier
      capabilities: [verifyAddress]
      type: agent

    - name: sanctions-screener
      capabilities: [screenSanctions]
      type: agent

    - name: risk-assessor
      capabilities: [assessRisk]
      type: agent

    - name: senior-compliance
      capabilities: [seniorReview]
      type: human
      executionPolicy:
        maxConcurrent: 1

  bindings:
    - name: on-application
      capability: classifyDocuments
      on:
        contextChange:
          keys: ["applicationDocs"]

    - name: on-classified
      capability: extractIdentity
      on:
        contextChange:
          keys: ["classified"]
          filter: '.classified.identity != null'

    - name: on-classified-financial
      capability: extractFinancials
      on:
        contextChange:
          keys: ["classified"]
          filter: '.classified.financial != null'

    - name: on-classified-address
      capability: verifyAddress
      on:
        contextChange:
          keys: ["classified"]
          filter: '.classified.address != null'

    - name: on-identity-extracted
      capability: screenSanctions
      on:
        contextChange:
          keys: ["identity"]
          filter: '.identity.fullName != null'

    - name: on-extraction-complete
      capability: assessRisk
      on:
        contextChange:
          keys: ["identity", "financials", "address", "sanctionsResult"]
          filter: >-
            [.identity, .financials, .sanctionsResult]
            | map(. != null) | [., true, true] | .[0:3]
            | map(select(. == true)) | length >= 2

    - name: on-escalation
      capability: seniorReview
      on:
        contextChange:
          keys: ["decision"]
          filter: '.decision.action == "escalate"'

  milestones:
    - name: documents-classified
      condition: '.classified != null'
    - name: extraction-complete
      condition: '[.identity, .financials, .address] | map(select(. != null)) | length >= 2'
    - name: risk-assessed
      condition: '.decision != null'

  goals:
    - name: approved
      condition: '.decision.action == "approve" or .finalDecision.action == "approve"'
      kind: success
    - name: rejected
      condition: '.decision.action == "reject" or .finalDecision.action == "reject"'
      kind: success
```

**Viewer rendering:** The choreography bindings create a natural DAG: `on-application` fans out (after classification) to three parallel extraction bindings, which converge at `on-extraction-complete` (with a 2-of-3 quorum condition), then flow to risk assessment, with an optional escalation binding to human review. The graph view renders this topology directly from the binding structure — no explicit `concurrent:` needed because the choreography bindings encode the parallelism implicitly.

#### Agentic Pattern — Risk Assessment Decision (blocks)

```yaml
type: voting
agents:
  - type: worker
    name: quantitative-scorer
  - type: worker
    name: qualitative-reviewer
  - type: worker
    name: regulatory-checker
  - type: human
    name: senior-analyst
aggregation:
  type: majority-vote
judgment:
  trigger:
    type: contested
  caller:
    type: escalation-chain
    chain: [senior-analyst]
  agreement:
    type: majority
    threshold: 0.6
termination:
  - type: all-agreed
  - type: max-iterations
    iterations: 3
```

**Viewer rendering:** Convergence diagram. Three agent nodes (quantitative-scorer, qualitative-reviewer, regulatory-checker) plus one human node (senior-analyst) all contribute votes. Aggregation node shows "majority-vote". Judgment section shows "contested → escalation to senior-analyst". A reviewer instantly sees: 4 participants, majority wins, max 3 rounds, human escalation if contested.

---

## References

- `packages/yaml-core/src/step/walker.ts` — ResolvedStep discriminated union (TypeScript)
- `packages/pages-aria/src/controller/playbook-yaml-viewer.ts` — existing YAML viewer (line-by-line highlighting)
- `packages/pages-aria/src/controller/yaml-highlighter.ts` — current tokenizer
- `packages/graph-core/src/model.ts` — GraphModel, GraphNode, GraphEdge, NodeDecoration
- `packages/graph-renderer/src/bridge/PagesGraphCanvas.ts` — `<pages-graph-canvas>` web component
- `packages/graph-renderer/src/registry/stencil-registry.ts` — custom node type registration
- `packages/graph-renderer/src/layout/elk-layout.ts` — ELK layout algorithms
- `docs/mockups/step-review-viewer.html` — visual mockup (HTML/CSS)
- casehub-platform `yaml-step-runtime` — Java ResolvedStep sealed interface (server-side execution)
- casehub-eidos `AgentDescriptor.java` — full agent identity specification
- casehub-engine `CaseDefinition.yaml` schema — case definition structure
- casehub-blocks `agentic-yaml` — 8 pattern topologies (PatternSpec, PatternCompiler)
- casehub-work `WorkItem.java` — 11-state work item lifecycle
