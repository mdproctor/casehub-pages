---
title: "From demos to tutorials"
date: 2026-08-31
author: Mark Proctor
issue: 395
tags: [scenario-engine, tutorials, components, architecture]
---

# From demos to tutorials

We had six working scenario demos — form filling, parameterised scripts, table
population, composable workflows, a script library browser, and a scenario
controller showcase. Each one proved a feature worked. None of them taught
anyone how to use it.

Issue #395 asked for a tutorial series that teaches the automation platform
progressively. The first instinct was to slot tutorials into the existing
examples gallery. That was wrong — tutorials are a peer to the gallery, not
entries within it. They need their own navigation, their own catalog, their
own identity.

## The type system shift

The scenario engine had a flat `Playbook` type: a name and a steps array. Tutorials
need sections — narrative content interleaved with executable steps. Rather than
bolting optional fields onto the existing type, we split it into a discriminated
union: `FlatScenario | SectionedScenario`. The parser detects which format the
YAML uses and returns the right variant. Existing scenarios work unchanged; the
runner narrows with `isSectioned()` before accessing steps.

This is the kind of change that's easy on a pre-release codebase and painful on
a released one. Every call site that accessed `scenario.steps` had to narrow
first. The payoff: the type system now prevents someone from accidentally treating
a sectioned tutorial as a flat scenario.

## Browser-only was the hard part

The scenario controller was built for server mode — REST endpoints for outline
data, push wire for state events, fetch for content resolution. Tutorials run
browser-only. No server. No WebSocket. No REST.

Three controller modifications made it work:

1. `hostConnected()` registers the `pages-event` listener even without a
   connection — previously gated on `conn && target`
2. `sendCommand()` detects browser-only mode and dispatches `scenario-command`
   events instead of hitting REST endpoints — one fix covers all transport buttons,
   keyboard shortcuts, and outline clicks
3. The outline arrives in the initial state event payload rather than via
   `GET /scenario/outline` — the controller checks for `state.outline` before
   falling back to the REST call

The sectioned runner fires the same `pages-event` with `scenario:state` topic
that the server handler does. The controller and narrative component don't know
the difference.

## SVG in markdown

Tutorial slides need architecture diagrams. Inline SVG in markdown is the
right approach — CSS custom properties (`var(--pages-neutral-12)`) adapt to
light and dark themes automatically. But the narrative renderer's markdown
processor escaped all HTML, turning SVG into visible angle brackets.

The fix has two layers. An HTML sanitizer with an SVG-aware allowlist
passes through safe SVG elements while stripping `<script>`, event handlers,
and dangerous style values. The markdown processor extracts SVG blocks before
processing, replaces them with placeholders, runs the regex-based markdown
conversion, then re-inserts the SVGs. Same approach for fenced code blocks —
extract, placeholder, process, re-insert.

YAML code blocks get syntax highlighting via the existing `yaml-highlighter.ts`
tokeniser. Keys render in light blue, strings in green, literals in amber.

## The completion marker bug

The outline shows ✓ for completed sections. This sounds simple until you have
a mixed outline — some sections are slides-only (leaf nodes, no children),
others have executable steps (group nodes with children). The highlighting logic
had three bugs:

- Group headings (sections with steps) never showed ✓ — the CSS classes were
  only applied to leaf nodes
- When `state.step` is null (current section is slides-only), child steps of
  completed sections lost their ✓ — the completion check couldn't find their
  label in the section-level comparison
- Slides-only leaf sections never showed ● (current) — the leaf check only
  matched against `state.step`, which is null for slides-only sections

Each bug got a test first, then the minimal fix. The pattern: `_isBeforeCurrent`
needs to know whether a label is a section title or a step name, and whether to
compare at the section level or the step level. A `_findParentSection` helper
resolves child steps to their parent section for section-level comparison.

## What shipped

The tutorial catalog component (`<pages-tutorial-catalog>`) shows areas at root
level, drills into tutorial cards with hero icons, difficulty chips, and concept
labels. Two display modes — tiled cards and a filterable list. A
`<pages-tutorial-host>` component wires catalog selection to the sectioned
runner, mounting the controller and narrative components with prev/next slide
navigation.

Tutorial 0 (Architecture & Concepts) is seven slides-only sections with four
inline SVG diagrams covering the orchestrator topology, ARIA targeting, the
compilation pipeline, and the script registry. Tutorial 1 (Form Automation
Basics) is seven sections mixing narrative with executable `fill`, `select`,
and `click` steps.

A build script scans `tutorials/`, validates metadata and template file
references, and emits `tutorial-registry.json`. The aggregation contract lets
`casehub/examples` merge registries from multiple sources — tutorials are
portable across repos.
