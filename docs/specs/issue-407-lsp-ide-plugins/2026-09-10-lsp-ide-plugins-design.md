# LSP Server + IDE Plugins for CaseHub Playbook YAML

**Issue:** casehubio/casehub-pages#407
**Date:** 2026-09-10
**Stage:** pre-release

## Overview

A TypeScript Language Server Protocol (LSP) server providing schema-driven intelligence for all five CaseHub Playbook YAML formats — Page, CaseDefinition, Serverless Workflow (SWF), HTN, and Org Structure. The same LSP core powers three consumer surfaces: browser-based CodeMirror editors (via web worker), VS Code extension, and IntelliJ plugin. IDE plugins add native UI wrappers (refactoring preview, usage trees) as progressive enhancements over the base LSP experience. A visual diagram editor ("Open With") is sequenced as a later batch with its own design pass.

## Architecture

### Layered Design

```
┌─────────────────────────────────────────────────────┐
│  Layer 3: IDE Plugins (blocks-ui)                   │
│  ┌──────────────┐  ┌──────────────┐                 │
│  │ VS Code ext  │  │ IntelliJ ext │                 │
│  │ - LSP client │  │ - LSP client │                 │
│  │ - Native UI  │  │ - Native UI  │                 │
│  └──────┬───────┘  └──────┬───────┘                 │
│         │                 │                          │
│  Domain schema registrations (case/swf/htn/org)     │
├─────────┼─────────────────┼──────────────────────────┤
│  Layer 2: LSP Server (pages)                        │
│  ┌──────┴─────────────────┴──────────────────┐      │
│  │  pages-lsp                                │      │
│  │  - Schema registry (pluggable)            │      │
│  │  - YAML type detection                    │      │
│  │  - Completion provider (Zod schema walk)  │      │
│  │  - Diagnostics provider                   │      │
│  │  - Refactoring engine (code actions)      │      │
│  │  - jq expression intelligence             │      │
│  │  - Node.js + Web Worker transports        │      │
│  └──────┬────────────────────────────────────┘      │
│         │                                            │
│  Layer 1: Existing Foundation (pages)                │
│  ┌──────┴────────────────────────────────────┐      │
│  │  pages-schema (Zod schemas, registry)     │      │
│  │  pages-diagram-core (CST yaml primitives) │      │
│  └───────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────┘
```

**Layer 1 — Existing Foundation (pages):** Zod schemas auto-generated from TypeScript interfaces (`pages-schema`, 55+ component types), CST-preserving YAML editing primitives (`yamlSetField`/`yamlDeleteField` in `pages-diagram-core`).

**Layer 2 — LSP Server (pages, new `pages-lsp` package):** The shared intelligence core. Schema registry accepts pluggable format registrations. YAML type detection routes files to the correct schema. Completion, diagnostics, hover, and refactoring are protocol-standard LSP methods. Transport adapters support Node.js stdio (IDE plugins) and web worker `postMessage` (browser editors).

**Layer 3 — IDE Plugins (blocks-ui):** Thin LSP clients that register domain schemas (case/swf/htn/org) and progressively add native UI wrappers. VS Code uses `vscode-languageclient`. IntelliJ uses LSP4IJ. Native wrappers intercept LSP responses (e.g., workspace edits from rename) and present them through richer IDE-native UI (refactoring preview dialog, usage search tree) without duplicating intelligence.

### Why a Custom LSP Server (Not Extending yaml-language-server)

CaseHub Playbook YAML is discriminated-union-dominant. The `componentSchemaRegistry` has 55+ types dispatched by a `type` discriminator. The binding-schema has three discriminated unions (targetType, on, triggerType). yaml-language-server's JSON Schema `oneOf` handling produces flat completion — all branches' properties listed simultaneously, not narrowed by discriminator value. This is worse than no completion for CaseHub's format.

The existing `navigateSchema()` walker (375 lines in `schema-completion.ts`) already handles discriminated unions correctly with sibling-aware branch resolution — this IS the intelligence engine. Building a custom LSP around it is shorter and more capable than fighting yaml-language-server's schema resolution.

Trade-off: must implement YAML parsing, error recovery, document symbols, folding, and formatting. Mitigated: the `yaml` npm library (`parseDocument`/CST) handles parsing and error recovery; document symbols and folding are straightforward from the parsed tree.

## YAML Type Detection

### Convention Extensions (Primary)

| Extension | Format |
|-----------|--------|
| `.page.yaml` | Page |
| `.dash.yaml` | Page (transition — recognised until migration complete) |
| `.case.yaml` | CaseDefinition |
| `.swf.yaml` | SWF |
| `.htn.yaml` | HTN |
| `.org.yaml` | Org Structure |

Extension matching is O(1). Both `.dash.yaml` and `.page.yaml` map to Page format during the transition period.

These are **new conventions** established by this spec. Only `.dash.yaml` files exist in the codebase today (in `pages/examples/samples/`). Domain YAML files currently use plain `.yaml` — adoption of convention extensions requires documentation and will roll out alongside the IDE plugins. A protocol (like `PP-20260907-951cbe` for generated schemas) will be created to formalize the convention. During early development, the content-based fallback is the primary detection path; extension-based detection becomes primary as files are migrated.

### Content-Based Fallback

For plain `.yaml` files, the LSP inspects structure on `textDocument/didOpen`. Detection uses a single `parseDocument()` call, inspecting keys at increasing depth:

| Step | Discriminator | Format |
|------|--------------|--------|
| 1 | `organization:` at root | Org Structure |
| 2 | `do:` at root (sequence of named task maps) | SWF |
| 3 | `pages:` and/or `datasets:` at root | Page |
| 4 | `dsl:` + `spec:` at root → inspect `spec` children: | |
| 4a | `spec.bindings` or `spec.workers` or `spec.capabilities` | CaseDefinition |
| 4b | `spec.decomposition` | HTN |

Step 4 exists because CaseDefinition and HTN share the same root-level structure (`dsl`, `namespace`, `name`, `spec`) and must be distinguished by `spec` children. The chain is ordered by discrimination cost — `organization:` and `do:` are single-key O(1) checks; step 4 requires inspecting nested keys.

Detection is a chain — extension match first, then content inspection. If neither matches, the file is treated as generic YAML. The detection result is cached per file URI and invalidated on `didChange` if the top-level structure changes.

### IDE Integration

- **IntelliJ:** `FileTypeIdentifiableByVirtualFile` implementation that checks extensions first, then reads content for plain `.yaml` files. Returns a custom `CaseHubYamlFileType` that the LSP client activates on.
- **VS Code:** `documentSelector` in the LSP client configuration matches convention extensions. For content-based detection, a `workspace.onDidOpenTextDocument` handler checks plain `.yaml` files and dynamically adds them to the LSP scope.

## Schema Registry

### Registration API

```typescript
interface DocumentInspector {
  hasKey(path: string[]): boolean;       // e.g. hasKey(['spec', 'bindings'])
  getKeys(path?: string[]): string[];    // root keys if no path, nested keys otherwise
}

interface VariantDispatch {
  strategy: 'discriminator-field' | 'key-presence';
  // 'discriminator-field': reads a sibling field value (e.g. type: 'bar-chart')
  // 'key-presence': determines variant by which optional key is present
  field?: string;                        // for discriminator-field: the field name
  variants: Map<string, z.ZodType>;      // variant key/value → schema
}

interface FormatRegistration {
  formatId: string;                          // e.g. 'page', 'case-definition'
  extensions: string[];                      // e.g. ['.page.yaml', '.dash.yaml']
  contentDetector?: (inspector: DocumentInspector) => boolean;
  documentSchema: z.ZodType;                 // full document schema
  variantDispatchers?: Map<string, VariantDispatch>; // path → dispatch config
  refactoringCapabilities?: RefactoringCaps;  // what refactoring this format supports
}

interface SchemaRegistry {
  register(format: FormatRegistration): void;
  detect(uri: string, content: string): FormatRegistration | undefined;
  getSchema(formatId: string): z.ZodType;
  getVariantSchema(formatId: string, path: string, variantKey: string): z.ZodType | undefined;
}
```

**`DocumentInspector`** (R2-02): Content detection needs nested key inspection — CaseDefinition vs HTN share root-level `dsl`/`spec` and must be distinguished by `spec` children. The flat `rootKeys: string[]` API is replaced by an inspector that can probe at any depth. Built from a single `parseDocument()` call — no full validation, just key existence checks.

**`VariantDispatch`** (R2-06): Pages uses discriminated unions keyed by a `type` field. Domain formats use a different pattern — **key-presence discrimination** — where mutually exclusive optional keys indicate the variant (e.g., a binding target has exactly one of `capability`, `subCase`, or `humanTask` present). The `variantDispatchers` map lets each format declare its discrimination strategy per schema path. `navigateSchema()` consults this map instead of assuming `ZodDiscriminatedUnion` — enabling correct narrowed completion for both patterns.

### Schema Format

**Zod is the canonical internal representation.** The existing `navigateSchema()` walker handles `ZodObject`, `ZodArray`, `ZodOptional`, `ZodDiscriminatedUnion`, `ZodUnion`, `ZodIntersection`, `ZodLazy`. The walker must be extended to handle `ZodRecord` — domain schemas use `z.record()` for map-like structures (e.g., `do:` task maps in SWF). All schemas fed to the LSP must be Zod.

**Pages:** Page schemas are already Zod, auto-generated from TypeScript interfaces via ts-morph (`pages-schema` package, per protocol PP-20260907-951cbe). Self-registered at LSP startup.

**Domain formats (case/swf/htn/org):** Zod document schemas for domain YAML formats do not yet exist. `blocks-ui-schema` generates Zod schemas for web component props (`SlaIndicatorProps`, `ExecutionMonitorProps`, etc.), not YAML document structure. The `graph-stencil-*/src/schemas/` directories contain JSON Schema objects for the diagram editor's property palette — a different consumer. Creating document-level Zod schemas is new work, with a different generation strategy per format:

| Format | Schema source | Generation strategy |
|--------|--------------|-------------------|
| **CaseDefinition** | Generated TypeScript types in `graph-stencil-case/src/types/generated/case-definition.ts` (827 lines, generated from `CaseDefinition.yaml` in the engine repo) | ts-morph: TypeScript interfaces → Zod (same pattern as `pages-schema`). Staleness test compares committed Zod against fresh generation, per PP-20260907-951cbe. Cross-repo dependency on engine's `CaseDefinition.yaml` — staleness detected by comparing the generated TS types hash against a recorded baseline. |
| **SWF** | `@openworkflowspec/sdk` (`Specification.Workflow` types, derived from CNCF Serverless Workflow JSON Schema) | ts-morph: SDK TypeScript types → Zod. Upstream schema updates propagated by SDK version bumps — the Zod generation runs against the installed SDK types. CaseHub-specific extensions (if any) layered via `z.intersection()`. |
| **HTN** | Hand-written TypeScript interfaces in `graph-stencil-htn/src/adapter/htn-yaml-adapter.ts` (`HtnTask`, `HtnMethod`) | ts-morph: existing interfaces → Zod. These interfaces are small and stable — generation is straightforward. |
| **Org Structure** | Hand-written TypeScript interfaces in `graph-stencil-org/src/types.ts` (`OrgStructureYaml`, `OrgUnit`, `Membership`, `AgentRelationship`) | ts-morph: existing interfaces → Zod. Well-defined type hierarchy, clean conversion. |

All four converge on ts-morph generation to maintain a single schema creation pattern across the platform. The generated Zod schemas live in a new `lsp-schemas` package in blocks-ui, with per-format staleness tests. Domain schemas are registered by the IDE plugin's activation sequence.

### Domain Schema Generation Constraints

Two properties of domain TypeScript types require special handling during ts-morph Zod generation:

**Index signature stripping (R2-03):** Domain types pervasively use `[k: string]: unknown` index signatures for TypeScript flexibility. A naive ts-morph conversion produces `z.record(z.unknown())` which accepts any key — making "unknown property" diagnostics impossible. The generator must strip index signatures from the Zod output. The source types keep their index signatures (needed for TypeScript consumers); the Zod schemas are strict (needed for LSP diagnostics). This is a generator option, not a source type change.

**Key-presence union recovery (R2-04):** Domain types encode discriminated unions as mutually exclusive optional keys rather than an explicit discriminator field. For example, a binding target is `{ capability?: string; subCase?: SubCaseRef; humanTask?: HumanTaskRef }` — exactly one key is present at runtime. ts-morph generates a flat `z.object()` with all keys optional, which defeats narrowed completion. The generator reads a companion **discriminator manifest** (`discriminators.json` per format) that maps type paths to their discrimination strategy:

```json
{
  "BindingTarget": {
    "strategy": "key-presence",
    "variants": ["capability", "subCase", "humanTask"]
  },
  "WorkerFunction": {
    "strategy": "discriminator-field",
    "field": "type",
    "variants": ["agent", "flow", "a2a", "mcp", "sequence"]
  }
}
```

The generator uses this manifest to produce appropriate Zod union types, and the manifest is also used to populate the `variantDispatchers` map in the `FormatRegistration` (see §Registration API). This keeps the domain-specific discrimination knowledge declarative and co-located with the schema source, not embedded in the LSP core.

**Web worker mode:** The host application provides schemas via a `configure({ schemas: [...] })` call before the worker starts serving.

## LSP Capabilities

### Completion (`textDocument/completion`)

Extracts and reuses the schema navigation core from `schema-completion.ts`. That file has two distinct layers:

1. **Schema navigation (framework-agnostic):** `buildYamlContext(doc, pos)`, `navigateSchema(schema, path, siblings)`, `schemaToCompletions(schema)`, `isArrayField()` — these take plain strings, positions, and Zod schemas. No CodeMirror dependency. These move to `pages-lsp`.
2. **CodeMirror integration:** `schemaCompletionSource()` and `createSchemaCompletion()` — these take `CompletionContext` and return CodeMirror `Extension`. These stay in `pages-code-editor` as the LSP client adapter.

`buildYamlContext(doc, pos)` already takes a string and position (not a CodeMirror context), making the extraction boundary clean. The LSP completion provider calls the same functions:

1. `buildYamlContext(doc, pos)` determines the ancestor path and sibling key-values
2. `navigateSchema(schema, path, siblings)` walks the Zod schema tree, using siblings for discriminated union dispatch (e.g., reads `type: bar-chart` to select `BarChartProps` branch)
3. `schemaToCompletions(schema)` produces LSP `CompletionItem` entries (property names from objects, enum values, boolean values)

After extraction, `pages-code-editor` replaces its direct `createSchemaCompletion()` usage with a thin LSP client adapter that sends `textDocument/completion` requests to the web worker.

### Diagnostics (`textDocument/publishDiagnostics`)

Two levels:
1. **YAML syntax errors** — from `yaml` library's `parseDocument()` (not `parse()`) which returns all errors in `doc.errors[]` rather than throwing on the first one. The existing `yaml-lint.ts` uses `parse()` with `strict: true` which stops at the first error — the LSP needs to report all diagnostics.
2. **Schema validation** — Zod `.safeParse()` on the parsed document, mapping Zod error paths to YAML source positions via the CST's `range` property.

**Error recovery:** `parseDocument()` produces a best-effort AST even when the YAML has syntax errors — nodes before and after the error are still available. Schema validation runs against the successfully parsed portions, providing schema diagnostics for valid regions while syntax errors are reported for invalid ones. This matches standard LSP behavior: partial documents always get the best available intelligence.

### Hover (`textDocument/hover`)

Schema-driven hover showing property description, type, and allowed values. Uses the same schema navigation as completion to resolve the schema node at the cursor position.

### Refactoring (Code Actions + Rename)

#### Rename (`textDocument/rename` + `textDocument/prepareRename`)

Rename a named entity and update all references. Requires a **symbol table** — a per-document index of declared names and their reference sites.

| Operation | Symbol type | Reference sites | Notes |
|-----------|------------|-----------------|-------|
| Rename capability | `spec.capabilities[].name` | `binding.capability`, `worker.capabilities[]`, HTN leaf `capability` | Cross-format: HTN leaf tasks reference case capabilities |
| Rename worker | `spec.workers[].name` | Sequence step references | |
| Rename binding | `spec.bindings[].name` | Direct references | |
| Rename task | `do:` task map key | `then:` flow directives (`then: <step-name>`) | SWF tasks are keyed in a `do:` sequence; `then:` references are flow control directives, not always present |
| Rename dataset | `datasets[].uuid` | `lookup.uuid` across components | **Depends on jq intelligence:** dataset UUIDs also appear in jq pipeline expressions — renaming requires jq expression parsing, not just structural YAML rename |
| Rename org unit | `units[].unitId` | `parentUnitId` refs within same file | |
| Rename variable | `set:` variable name | `${ .varName }` expression refs | Text-based search within string values — different reliability characteristics than structural rename |

**Single-document rename** works in both IDE and web worker modes. **Workspace-wide rename** (across files) requires IDE mode with filesystem access — the LSP builds a workspace symbol index from `workspace/didOpen` notifications and file watchers.

#### Extract (Code Actions)

| Operation | Input | Output |
|-----------|-------|--------|
| Extract sub-case | Selected bindings/workers/capabilities | New `.case.yaml` file + subCase reference |
| Extract sub-workflow | Selected task sequence | New `.swf.yaml` file + call task reference |
| Extract page | Selected page entry | New `.page.yaml` file + `lazy-page` reference |
| Extract org subtree | Selected unit subtree | New `.org.yaml` file |

Extract operations produce `WorkspaceEdit` with `CreateFile` + `TextEdit` entries. IDE plugins may present these as a diff preview before applying.

#### Move (Code Actions)

| Operation | What it does |
|-----------|-------------|
| Move binding between files | Relocates a binding, updates cross-refs |
| Move component between pages | Relocates within or across files |

#### Inline (Code Actions)

| Operation | What it does |
|-----------|-------------|
| Inline sub-case | Replaces subCase reference with referenced file contents |
| Inline sub-workflow | Replaces call task with called workflow contents |

All refactoring operations use CST-preserving edits so formatting, comments, and whitespace are preserved.

#### CST Edit Primitives

The existing `yamlSetField`/`yamlDeleteField` in `pages-diagram-core` are minimal (21 lines, single-path set/delete wrappers around `parseDocument().setIn()/deleteIn().toString()`). The blocks-ui yaml-editors already implement richer patterns by working directly with `parseDocument` and `YAMLMap`/`YAMLSeq` objects — multi-key atomic switches (`switchBindingTarget`, `switchFunctionType`), array append with unique-name generation (`addElement`, `addSwfTask`, `addOrgUnit`), and discriminated-variant switching (`switchTriggerType`, `switchMcpTransport`).

The refactoring engine needs an enriched primitive API in `pages-lsp`:

| Primitive | What it does | Derived from |
|-----------|-------------|-------------|
| `yamlSetField` / `yamlDeleteField` | Single-path set/delete (existing) | `pages-diagram-core` |
| `yamlSwitchVariant` | Atomic delete-N-keys + set-M-keys for discriminated union switching | `switchBindingTarget`, `switchFunctionType`, `switchTriggerType` |
| `yamlAppendWithUniqueName` | Append to array with auto-generated unique name/id | `addElement`, `addSwfTask`, `addOrgUnit` |
| `yamlMoveItem` | Move item between arrays (delete + insert) | Cross-file extract/move operations |
| `yamlBatchEdit` | Apply multiple set/delete operations in a single parse-modify-serialize pass | Compound refactoring operations |

The challenge pass migrates these structural patterns from blocks-ui's yaml-editors to `pages-lsp`. Domain-specific logic (what constitutes a "binding" vs a "task", which keys define each variant) stays in blocks-ui as configuration passed to the generic primitives.

## jq Expression Intelligence

jq expressions appear across all five CaseHub Playbook YAML formats, not just pages:

| Format | Where jq expressions appear | Schema annotation |
|--------|---------------------------|-------------------|
| **Page** | Dataset pipeline `expression:` fields, component property expressions | `x-expression: jq` on expression fields |
| **CaseDefinition** | `milestones[].condition`, binding guard expressions | `x-expression: jq` on condition/guard fields |
| **SWF** | Switch conditions, runtime expressions | `x-expression: jq` on `when:` fields |
| **HTN** | Method `guard:` expressions (e.g., `.severity == 'high'`) | `x-expression: jq` on guard fields |
| **Org Structure** | None currently | — |

The LSP provides:

- **Syntax validation** — parse jq expressions, report syntax errors as diagnostics
- **Completion** — within a jq expression context, suggest `.fieldName` paths based on the available data context (dataset columns for pages, case context for case definitions)
- **Hover** — show the inferred type/description of a jq path

### Expression Boundary Detection

The schema registry annotates which fields contain jq expressions using an `x-expression: 'jq'` metadata marker on the Zod schema (via `.describe()` or a custom refinement). The LSP checks this annotation when the cursor is inside a string value to determine whether to activate jq intelligence. This keeps expression-awareness declarative rather than hard-coded per format.

### Parser Requirements and Selection

The jq parser must satisfy: (1) parse the jq subset used across CaseHub formats (path expressions, comparison operators, pipe chains, `select()`, `map()`, string interpolation), (2) produce an AST suitable for completion and validation, (3) bundle size under 100KB gzipped for web worker mode. Parser evaluation (`jq-web`, `jqts`, custom PEG grammar) is a time-boxed spike (2 days) in Batch 1, with a fallback to regex-based path extraction if no parser meets all three requirements.

## Transport

### Node.js (IDE Plugins)

Standard LSP over stdio. The IDE plugin spawns `pages-lsp` as a subprocess. Both `vscode-languageclient` and LSP4IJ handle this natively.

### Web Worker (Browser Editors)

LSP JSON-RPC over `postMessage` using `vscode-languageserver`'s `BrowserMessageReader`/`BrowserMessageWriter`. The existing CodeMirror editor in `pages-code-editor` replaces direct `navigateSchema()` calls with a thin LSP client adapter that:
- Sends `textDocument/completion` requests
- Receives `textDocument/publishDiagnostics`
- Requests code actions for refactoring operations

**Capability boundary:** Web worker mode is single-document. Cross-file capabilities (workspace rename, cross-file go-to-definition) require IDE mode with filesystem access. This is intentional — the browser editor edits one file at a time.

### Isomorphic Core

`pages-lsp` has no Node.js-specific dependencies (`fs`, `path`, `child_process`). File access is abstracted behind a `WorkspaceProvider` interface:
- Node.js: reads from disk, watches for changes
- Web worker: receives document content via `textDocument/didOpen`/`didChange`

## Package Structure

### In pages (new package)

**`packages/pages-lsp/`**
- `src/server.ts` — LSP server entry point, capability registration
- `src/schema-registry.ts` — pluggable format registration
- `src/detection.ts` — YAML type detection (extension + content-based)
- `src/completion.ts` — completion provider (adapted from `schema-completion.ts`)
- `src/diagnostics.ts` — YAML syntax + schema validation
- `src/hover.ts` — schema-driven hover
- `src/refactoring/` — symbol table, reference graph, code actions
- `src/jq/` — jq expression parsing, completion, validation
- `src/transport/` — Node.js stdio + web worker postMessage adapters
- `src/workspace.ts` — `WorkspaceProvider` interface

Page format self-registers at startup using schemas from `pages-schema`.

### In blocks-ui (new packages)

**`packages/lsp-schemas/`** — generates and registers case/swf/htn/org Zod document schemas with the pages-lsp schema registry. Schemas are generated from TypeScript interfaces via ts-morph (case from generated types, SWF from SDK types, HTN/org from hand-written interfaces). Includes per-format staleness tests.

**`plugins/vscode-casehub/`** — VS Code extension: LSP client via `vscode-languageclient`, domain schema registration, native UI wrappers.

**`plugins/intellij-casehub/`** — IntelliJ plugin (Kotlin): LSP client via LSP4IJ, `FileTypeIdentifiableByVirtualFile` for detection, JCEF webview (Batch 4), native UI wrappers.

### Challenge Pass

During implementation, structural CST patterns in blocks-ui's yaml-editors are candidates for extraction into `pages-lsp` as the enriched primitive API (see §CST Edit Primitives). Specifically: `applyPropertyEdit`/`applyOrgPropertyEdit`/`applySwfPropertyEdit` unify into a generic set/delete-at-path; `addElement`/`addSwfTask`/`addOrgUnit` unify into `yamlAppendWithUniqueName`; the `switch*` functions (`switchBindingTarget`, `switchFunctionType`, `switchTriggerType`, `switchMcpTransport`, `switchModelProvider`) unify into `yamlSwitchVariant`. The domain-specific knowledge (which keys define each variant, what defaults to apply) stays in blocks-ui as configuration passed to the generic primitives.

## Cross-File Reference Resolution

Progressive resolution based on environment:

**IDE mode:** The LSP uses `workspace/didOpen` notifications and file watchers to build and maintain a workspace-wide symbol index. Enables:
- Workspace-wide rename (rename capability → update all files)
- Go-to-definition (click capability reference → jump to definition)
- Cross-file diagnostics ("unknown capability 'foo' — did you mean 'bar'?")
- Find-references (all call sites of a named entity)

**Web worker mode:** Single-document resolution only. Schema-based completion (valid enum values) but no cross-file navigation or rename. Aligned with the browser editing model — one file at a time.

### Cross-Format References

Beyond same-format cross-file references, some symbols are referenced across formats:

| Reference | Source format | Target format |
|-----------|-------------|--------------|
| `lazy-page` component `page` attribute | Page | Page |
| `subCase` binding (`namespace` + `name`) | CaseDefinition | CaseDefinition |
| HTN leaf task `capability` | HTN | CaseDefinition (capability name) |
| `definitionRef` in HTN tasks | HTN | CaseDefinition |

The workspace symbol index is new infrastructure. Phased delivery:
1. Completion + diagnostics + hover (schema-only, no index needed)
2. Per-document symbol table + single-document rename
3. Per-format workspace symbol index + cross-file rename/go-to-definition
4. Cross-format symbol resolution (index stores format-tagged symbols, lookup queries across formats by symbol kind)

## Delivery Batches

Four batches within two work slots, each with a review gate before the next starts.

### Slot 1 — pages

**Batch 1: LSP Core**
- `pages-lsp` package: schema registry, YAML detection, completion, diagnostics, hover
- Web worker transport adapter (`BrowserMessageReader`/`BrowserMessageWriter`)
- Page format self-registration from `pages-schema`
- CodeMirror LSP client adapter (replaces direct `schema-completion.ts` usage)
- jq expression intelligence (parser evaluation + integration)
- Integration tests against existing `.page.yaml` examples

**Batch 2: Refactoring Engine**
- Per-document symbol table (declared names, reference sites)
- Single-document rename (all seven rename operations)
- Workspace symbol index (IDE mode only)
- Cross-file rename, go-to-definition, find-references
- Extract, move, inline code actions
- CST-preserving edit primitives migration from blocks-ui

### Slot 2 — blocks-ui

**Batch 3: IDE Plugins**
- `lsp-schemas` package: domain Zod schema registration
- VS Code extension: LSP client, document selector, native UI wrappers
- IntelliJ plugin: LSP client (LSP4IJ), `FileTypeIdentifiableByVirtualFile`, native UI wrappers
- End-to-end tests across all five formats
- Challenge pass: migrate generic logic from blocks-ui to pages-lsp

**Batch 4: Diagram Webview**
- Separate design pass covering: bidirectional sync model, webview lifecycle, theme sync, component bundling, VS Code `WebviewPanel` vs IntelliJ `JBCefBrowser` tradeoffs
- Scope boundary: "Open With" diagram editing inside IDE, using the existing Lit-based diagram components from blocks-ui
- Design decisions (sync model, hosting API, bundle strategy) come FROM the exploration, not before it

## Tracking

Issue #407 currently has no labels, milestone, or epic. Given the scope (new package, two IDE plugins, four format schema generators, refactoring engine), a tracking epic will be created with sub-issues per batch:

- **Epic:** "LSP Server + IDE Plugins for CaseHub Playbook YAML" (parent of #407)
- **Sub-issues:** one per batch (LSP Core, Refactoring Engine, IDE Plugins, Diagram Webview), plus one for domain schema generation (cross-cutting)
- **Labels:** `lsp`, `ide-plugin` on all related issues

## References

- casehubio/casehub-pages#407 — original LSP server issue
- casehubio/casehub-pages#408 — schema-driven YAML completion design
- casehubio/casehub-pages#411 — auto-generate Zod schemas from TypeScript interfaces
- `pages-schema/src/schema-registry.ts` — existing componentSchemaRegistry pattern
- `pages-code-editor/src/schema-completion.ts` — navigateSchema() Zod walker (375 lines)
- `pages-diagram-core/src/yaml-primitives.ts` — CST-preserving yamlSetField/yamlDeleteField
- `blocks-ui-schema/src/component-schemas.generated.ts` — auto-generated Zod schemas for blocks-ui web component props (NOT domain document schemas)
- `graph-stencil-case/src/adapter/yaml-editor.ts` — CST-preserving case definition editor (182 lines)
- `graph-stencil-swf/src/adapter/swf-yaml-editor.ts` — CST-preserving SWF editor
- `graph-stencil-org/src/adapter/yaml-editor.ts` — CST-preserving org editor
- `vscode-languageserver` BrowserMessageReader/BrowserMessageWriter — web worker LSP transport
- IntelliJ LSP4IJ — JetBrains LSP client support
- IntelliJ `FileTypeIdentifiableByVirtualFile` — content-based file type detection
- [yaml-schema-router](https://github.com/traiproject/yaml-schema-router) — content-based schema routing pattern (prior art)
- [Red Hat yaml-language-server](https://github.com/redhat-developer/yaml-language-server) — YAML LSP reference (not extended, custom built instead)
- [IntelliJ file type detection](https://www.plugin-dev.com/intellij/custom-language/file-type-detection/) — FileTypeDetector and FileTypeIdentifiableByVirtualFile patterns
- [VS Code Custom Editor API](https://code.visualstudio.com/api/extension-guides/custom-editors) — CustomEditorProvider for Batch 4 diagram webview
