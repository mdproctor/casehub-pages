---
title: "The tutorial that found a language"
date: 2026-09-14
author: mdp
entry_type: note
subtype: diary
series: issue-435-yaml-tutorial
projects:
  - casehubio/casehub-pages
tags: [yaml-core, lsp, schema-composition, design]
---

I started the day planning a tutorial — fifteen steps teaching users how CaseHub Playbook YAML works. I ended it designing a universal composition language.

The issue (#435) was straightforward: build an interactive tutorial using the existing builder workbench, with CodeMirror and the LSP providing completions as users learn constructors, variables, forEach, and modules. The infrastructure was ready — `pages-tutorial-host`, `pages-tutorial-catalog`, the builder shell from #428 with its tree view and synced editor. Wire it together, author the content, ship it.

Then I asked the wrong question: what domain should the tutorial examples use?

The issue suggested a store domain — product-catalog, shopping-cart, payment. Illustrative constructors for teaching. But yaml-core's composition features (variables, modules, forEach, conditionals) live in platform's Java library. They've never been available in the browser. The tutorial would teach syntax the platform understands but pages doesn't.

Claude asked whether yaml-core could become the composition layer for pages itself. Not a separate dialect. Not a store domain pretending to be pages. The actual pages YAML format, extended with yaml-core's full composition capabilities — modules that generate dashboard sections, forEach that stamps metric cards from data, conditionals that hide sections based on feature flags.

That changed everything. If pages YAML adopts yaml-core, then:
- Every yaml-core concept the tutorial teaches applies directly to real work
- The builder workbench shows expanded results live — type a forEach, see three metric cards appear
- The LSP provides completions for modules, imports, variables alongside the existing component schema
- Every other YAML format the platform supports (case, swf, htn, org) gets the same capabilities through one-line schema composition

## The schema composition discovery

The hardest design question was how the LSP handles yaml-core. I initially framed it as two options: extend the page format schema, or create a new format registration. Both had real downsides — schema bloat for one, format fragmentation for the other.

Claude worked through this from first principles and landed on something better: yaml-core isn't a format. It's a language layer. The two options were a false dichotomy — both treated yaml-core as a format concern when it's orthogonal to format.

The fix: define yaml-core as a Zod schema that composes with any format schema via `z.intersection()`. One yaml-core schema, composed with pages, case, swf, htn, org — five one-line changes. The schema-navigation engine already handles `ZodIntersection`, so completions, diagnostics, and hover work automatically.

A detail that only surfaced during spec review: `.merge()` (the obvious Zod API) doesn't work here. Format schemas are exported as widened `z.ZodType` for the schema registry interface, and `.merge()` requires `ZodObject`. `z.intersection()` accepts any `ZodType`. The kind of thing you'd spend an hour discovering during implementation — the review caught it on paper.

## The J2CL question

Platform's yaml-core was designed J2CL-compatible from day one (#247) — zero dependencies, no reflection, no CDI. Pages #344 already has a J2CL transpilation strategy for the broader scenario engine. The natural choice was J2CL: compile Java to JS, single source of truth, no divergence.

But yaml-core is forty files of pure algorithmic code. Regex-based string interpolation, map iteration, parameter type checking. Setting up a JVM compilation step in a Yarn workspace for a library this small felt like infrastructure for infrastructure's sake. The J2CL pipeline doesn't exist yet (#344 is deferred), so we'd be building it just for yaml-core.

I went with a TypeScript port. The JSON Schema fragments yaml-core already ships serve as the behavioral contract. The Java test suite translates mechanically to vitest conformance tests. When #344 eventually builds the J2CL pipeline for the bigger modules (orchestrator, protocol, executor), yaml-core can migrate then — or the TypeScript port coexists. It's small enough either way.

## What's next

The implementation plan has four batches. Batch 1 is the TypeScript port — VariableResolver, ForEachExpander, ModuleExpander, the `expand()` API, and Zod schemas generated from the existing JSON Schema fragments via `json-schema-to-zod`. Batch 2 wires it into the pages parser and LSP. Batch 3 extends the builder tree to show modules, imports, and variables. Batch 4 is the tutorial itself — fifteen steps, from basic YAML structure to a multi-page application with modules, forEach, and conditionals composing a full dashboard.

The part I didn't expect: the tutorial wasn't the hard problem. Getting the architecture right — yaml-core as a language layer, schema composition, the right runtime strategy — was the design. The tutorial is now the demonstration that the architecture works.
