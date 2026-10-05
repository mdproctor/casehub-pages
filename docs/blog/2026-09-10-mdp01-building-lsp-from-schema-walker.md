---
layout: post
title: "Building an LSP Server from a Schema Walker"
date: 2026-09-10
entry_type: note
subtype: diary
projects: [casehubio/casehub-pages]
tags: [lsp, typescript, yaml, zod, code-intelligence, refactoring]
---

# Building an LSP Server from a Schema Walker

CaseHub Pages already had a schema-driven completion engine — `navigateSchema()` walks a Zod schema tree, dispatching through discriminated unions to produce context-aware completions for 55+ YAML component types. It was wired directly into CodeMirror. I turned that engine into a proper LSP server, then built a refactoring engine on top of it.

## The Schema Walker Extraction

The extraction boundary was cleaner than I expected. `buildYamlContext()` takes a plain string and a cursor offset — no CodeMirror dependency. `navigateSchema()` takes a Zod schema, a path, and sibling key-values for discriminated union dispatch. The entire schema navigation layer was already framework-agnostic; it just happened to live inside the CodeMirror package. We pulled it into a new `pages-lsp` package, replaced the CodeMirror editor's local copy with an import, and confirmed all the existing completion tests still passed through the new path.

The interesting design decision was keeping the server core isomorphic. The LSP server needs to run in two environments: Node.js via stdio for IDE plugins (VS Code, IntelliJ), and as a web worker via `postMessage` for browser-based CodeMirror editors. The solution was a plain handler layer — `createServerHandler()` returns an object with methods like `onCompletion()`, `onHover()`, `onDidOpen()` that take and return plain types. No `vscode-languageserver` types in the core. The transport-specific entry points (`server-node.ts`, `server-browser.ts`) map these plain types to proper LSP protocol types with the exact `DiagnosticSeverity`, `CompletionItemKind`, and `MarkupKind` enums the protocol requires.

This layering also means the core is testable without LSP infrastructure — tests create a schema registry, register a format, and call `handleCompletion()` directly with a URI, document string, and cursor position. No mock connections, no protocol framing.

The schema registry itself is pluggable. Each YAML format registers with an extension list and an optional content detector. CaseHub has five YAML formats — Page, CaseDefinition, Serverless Workflow, HTN, and Org Structure — each with different root-level structure. Extension-based detection (`.page.yaml`, `.case.yaml`, `.swf.yaml`) is O(1). For plain `.yaml` files, the registry falls back to structural inspection: `organization:` at root means Org, `do:` means SWF, `pages:` means Page, `dsl: + spec.bindings` means CaseDefinition. The detection chain is ordered by discrimination cost.

The jq intelligence layer is deliberately minimal. CaseHub Playbook YAML uses jq expressions in dataset pipelines and guard conditions across all five formats. Rather than pulling in a full jq parser (which would need to be under 100KB gzipped for the web worker), we went with regex-based validation — bracket matching and pipe-sequence checks. Column-aware path completion (`.` followed by field names from the dataset context) works without parsing the full expression.

## Symbol Table and Rename

With completion, diagnostics, and hover working, the next question was: what does it take to make rename work across a YAML document?

The answer is a symbol table — a list of every declared name and every reference to it, with source positions. For the Page format, the symbols are dataset UUIDs (declared in `datasets[].uuid`, referenced in `lookup.uuid` inside any component's properties) and page names (declared in `pages[].name`, referenced in `lazy-page` components and `navTree` items).

I added a `symbolExtractor` function to `FormatRegistration` — each format declares how to find its own symbols. The Page extractor walks the YAML AST using the `yaml` library's `parseDocument`, pulling source positions from each `Scalar` node's `range` property. The walker recurses into the full document tree to find references nested at arbitrary depth — a `lookup.uuid` inside a component inside a column inside a row inside a page entry.

Rename was straightforward once the symbol table existed. `prepareRename` checks whether the cursor is on a known symbol. `computeRename` finds every occurrence with the same name and kind, then produces text edits. The one subtlety is quote preservation — if the YAML value is `"my dataset"` with double quotes, the replacement needs to be `"new dataset"`, not just `new dataset`. Checking the first character of the source range handles this cleanly.

## Cross-File Intelligence

Single-document rename is useful but limited. The real value is cross-file: rename a dataset UUID in one file, and every file that references it updates too.

The `WorkspaceSymbolIndex` aggregates per-document symbol tables. The server handler updates the index on every `didOpen` and `didChange`, and queries it for go-to-definition, find-references, and rename. The cross-file rename produces a `WorkspaceEdit` with entries for every affected document — the LSP client applies them atomically.

The index is intentionally simple — a `Map` from URI to symbol list, with linear scan for queries. For typical workspace sizes (dozens of YAML files, not thousands), this is fast enough. If performance becomes a problem, the fix is a trie or inverted index, not a different architecture. The interface stays the same.

The same handler pattern that made the core testable without LSP infrastructure works here too. Integration tests open multiple documents through the handler, then assert that go-to-definition from a reference in one file jumps to the definition in another. No mock LSP connection needed.

## What This Opens Up

The IDE plugins are now a thin LSP client wrapping this server — they register domain schemas and add native UI, but all the intelligence lives here. The symbol table infrastructure is generic; when domain formats (CaseDefinition, SWF, HTN, Org) register their own `symbolExtractor`, they get rename, definition, and references for free.

The next step is those domain schemas in `blocks-ui` — generating Zod schemas from the existing TypeScript types via ts-morph, registering them with the LSP, and wiring up the VS Code and IntelliJ plugins as thin LSP clients.
