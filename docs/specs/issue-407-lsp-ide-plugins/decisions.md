# Decisions — Issue #407: LSP Server + IDE Plugins

## D1: YAML Format Scope

**Choice:** All five formats — Page, CaseDefinition, SWF, HTN, Org Structure
**Alternatives:**
- blocks-ui four only (case/swf/htn/org) — would exclude the most widely used format
- Page + Case only — phased approach, but the schema infrastructure exists for all five
**Rationale:** The schema infrastructure exists for all five formats. Page schemas are Zod (`pages-schema`, 55+ component types). Domain schemas (Case, SWF, HTN, Org) are being generated as Zod from TypeScript interfaces by `blocks-ui-schema` (auto-generated via ts-morph, issue #411). The existing JSON Schema files in `graph-stencil-*/schemas/` (with x-group, x-order, x-discriminator extensions) serve the diagram editor's property palette — they are NOT the LSP's schema source. The LSP consumes Zod schemas exclusively. Two formats for two consumers — correct layering.
**Trade-offs:** Broader scope means more integration testing across formats. Domain schema availability depends on blocks-ui-schema generation pipeline.
**Sources:** pages-schema package, blocks-ui-schema package, blocks-ui graph-stencil-* packages, issue #411 auto-generate Zod schemas spec
**Exploration:** quick
**Status:** revised (R1-09: clarified schema format path — Zod from TypeScript interfaces, not JSON Schema conversion)

## D2: Relationship to Issue #407

**Choice:** This initiative IS issue #407 — delivers what it envisioned
**Alternatives:**
- Separate effort superseding #407 — unnecessary fragmentation
- Builds on #407 as a subset — #407 already scoped LSP + IDE plugins
**Rationale:** #407 already describes "LSP server for CaseHub Playbook YAML" with VS Code and IntelliJ plugins as consumers. This work delivers that vision with expanded refactoring scope.
**Trade-offs:** None — clean alignment
**Sources:** GitHub issue casehubio/casehub-pages#407
**Exploration:** quick
**Status:** captured

## D3: Refactoring Scope

**Choice:** Full suite as target scope, phased delivery — completion + diagnostics + hover first, then rename, then extract/move/inline
**Alternatives:**
- Full suite from day one — conflates CST mutation primitives with semantic refactoring infrastructure
- Rename + references only — lower risk but artificially limits the target
- Completion + diagnostics only, refactoring deferred indefinitely — misses the value proposition
**Rationale:** The CST-preserving YAML editing infrastructure (yaml-editor.ts: 182 lines with discriminated union switching, collision-free naming, graph edge operations; swf-yaml-editor.ts: task type manipulation; yaml-primitives.ts: setIn/deleteIn) provides the mutation primitives for refactoring. What's missing is the semantic model — a symbol table and reference graph needed for rename (finding all references to a named entity), extract (identifying extractable units), move (cross-file reference updating), and inline (definition resolution). The mutation primitives are necessary but not sufficient. Phased delivery: (1) completion + diagnostics + hover — achievable with existing schema infrastructure alone, (2) rename — simplest refactoring, requires per-document symbol index only, (3) extract/move/inline — require workspace-wide reference graph and semantic model.
**Trade-offs:** Phased delivery means refactoring arrives later. The semantic model (symbol table, reference graph) is new infrastructure not present in the current codebase.
**Sources:** yaml-editor.ts in graph-stencil-case (182 lines — property edits, discriminated union switching, element add/remove, graph edge ops), swf-yaml-editor.ts (task type manipulation), yaml-primitives.ts (CST-preserving setIn/deleteIn)
**Exploration:** quick
**Status:** revised (R1-04: distinguished CST mutation primitives from semantic refactoring infrastructure, adopted phased delivery)

## D4: Repository Split

**Choice:** pages = LSP core + Page schema + generic infrastructure; blocks-ui = domain schemas + final distributable plugins
**Alternatives:**
- New dedicated repo (casehub-lsp) — clean separation but yet another repo to manage
- Plugins in pages, blocks-ui contributes schemas only — mixes IDE tooling with runtime UI framework
**Rationale:** Matches existing tier boundary. Pages is foundation, blocks-ui is integration. Challenge any blocks-ui code to see if it could live in pages — push generic logic down, keep only domain-specific code in blocks-ui.
**Trade-offs:** Cross-repo dependency for plugin builds. Schema changes in pages require blocks-ui rebuild.
**Sources:** Existing pages/blocks-ui architecture boundary
**Exploration:** quick
**Status:** captured

## D5: YAML File Type Detection

**Choice:** Convention file extensions as primary (.page.yaml, .case.yaml, .swf.yaml, .htn.yaml, .org.yaml), content-based inspection as fallback
**Alternatives:**
- Content-based primary — works with any .yaml but requires parsing every opened file
- Modeline-driven (# casehub: <type>) — most explicit but most friction for users
**Rationale:** Convention extensions are O(1) detection, unambiguous, and self-documenting. Content-based fallback handles legacy plain .yaml files. This mirrors how Kubernetes ecosystem works (apiVersion/kind for content, no special extension). During the D9 transition period, the LSP activates for BOTH `.dash.yaml` and `.page.yaml` — both map to Page format in the detection table. Users with existing `.dash.yaml` files get LSP intelligence immediately at launch. The O(1) claim holds regardless of how many extensions map to the same format.
**Trade-offs:** Requires users to adopt new extensions for best experience. Detection table has two entries for Page format during transition.
**Sources:** IntelliJ FileTypeIdentifiableByVirtualFile, VS Code customEditors filenamePattern, yaml-schema-router project
**Exploration:** deep-analysis
**Status:** revised (R1-11: clarified transition period — LSP activates for both .dash.yaml and .page.yaml)

## D6: Full #407 Scope

**Choice:** All of #407 — LSP + IDE plugins + jq expression intelligence + web worker mode
**Alternatives:**
- IDE plugins only, defer jq and web worker — smaller scope
- Include jq, defer web worker — partial delivery
**Rationale:** The web worker mode is critical — it makes the browser-based editors first-class consumers of the same intelligence. Every CaseHub user benefits, not just IDE users. jq expressions are part of the YAML editing experience in Page datasets. Transport: `vscode-languageserver` provides `BrowserMessageReader`/`BrowserMessageWriter` for LSP JSON-RPC over `postMessage` — this is a supported transport, not a custom layer. The CodeMirror integration bridges CodeMirror extensions to the LSP client protocol over the same postMessage channel.
**Trade-offs:** Web worker isomorphism constrains the LSP core (no Node.js-specific APIs — no `fs`, no `child_process`). Web worker mode is single-document only — cross-file capabilities (workspace rename, cross-file go-to-definition) require IDE mode with filesystem access. jq expression intelligence requires a JavaScript jq parser (`jq-web`, `jqts`) — quality and bundle size evaluation needed as a sub-scope.
**Sources:** Issue #407 body, schema-completion.ts, pages-code-editor, vscode-languageserver BrowserMessageReader/Writer
**Exploration:** quick
**Status:** revised (R1-05: clarified transport mechanism, acknowledged web worker capability boundary, noted jq parser evaluation needed)

## D7: Editor Modes

**Choice:** Text editor (LSP-powered) as primary. Visual diagram editor via webview as "Open With" — sequenced as Batch 4 with its own design pass and review gate before implementation.
**Alternatives:**
- Text + visual bundled in same batch — doubles scope without design attention on the webview sync challenges
- Visual deferred to separate initiative — risks it never getting done
**Rationale:** Text editing is the IDE-native experience and the focus of the LSP initiative. The visual diagram editor is architecturally orthogonal to the LSP — it shares only the file format, with no dependency on language intelligence. Including it in the LSP scope doubles IDE plugin work (custom panel registration, webview lifecycle management, bidirectional message passing, theme synchronisation, JCEF brittleness in IntelliJ). Users who want visual editing use the browser, where the diagram editors already work. The diagram webview deserves its own dedicated design exploration with adversarial review, not a quick-pick decision bundled with the LSP.
**Trade-offs:** IDE users wanting visual editing must use the browser. Diagram webview becomes a separate initiative.
**Sources:** blocks-ui diagram components (casehub-diagram, swf-diagram, org-diagram)
**Exploration:** quick
**Status:** revised (R1-07: removed visual diagram editor from LSP scope — orthogonal feature, deferred to separate initiative)

## D8: Architecture — LSP with Progressive Native Wrappers

**Choice:** LSP-centric core as shared intelligence layer, with progressive native UI wrappers in each IDE plugin
**Alternatives:**
- Pure LSP only — simpler but loses native refactoring preview, usage trees
- Shared library + custom JSON-RPC — more flexible API but custom protocol, two integration paths
- Hybrid LSP + native from day one — right direction but over-engineers initial delivery
**Rationale:** Ship with pure LSP first (works in both IDEs out of the box). Add native UI wrappers (refactoring preview dialog, usage search tree, custom inspections) as progressive enhancements. Intelligence stays shared, presentation adapts per IDE.
**Trade-offs:** Pure LSP refactoring UI is basic initially. Native wrappers are additional per-IDE code.
**Depends on:** D4 (repo split — native wrappers live in blocks-ui plugins)
**Sources:** Red Hat YAML extension pattern, Kotlin plugin architecture, LSP4IJ capabilities
**Exploration:** deep-analysis
**Status:** captured

## D9: File Extension Migration

**Choice:** Rename .dash.yaml to .page.yaml. LSP supports both during transition.
**Alternatives:**
- Keep .dash.yaml — avoids churn but perpetuates wrong terminology
- .pages.yaml (plural) — distinguishes from single page but inconsistent with other extensions
**Rationale:** Pre-release stage — now is the time to fix naming. "Page" is the correct term; "dashboard" undersells the format. The ~100 example files can be migrated as a separate task.
**Trade-offs:** Migration churn on existing files. Must support both extensions during transition.
**Depends on:** D5 (detection strategy supports the extension)
**Sources:** Terminology decision: "a Page can be a dashboard, but a dashboard can never be a Page"
**Exploration:** quick
**Status:** captured

## D10: Schema Unification

**Choice:** Zod as the internal canonical representation. Domain schemas (currently JSON Schema with x-* extensions) converted to Zod at registration time.
**Alternatives:**
- JSON Schema canonical — LSP standard but loses the existing Zod schema walker
- Dual format with adapter layer — avoids conversion but duplicates walking logic
**Rationale:** The schema-completion engine (navigateSchema) already walks Zod types — ZodObject, ZodArray, ZodDiscriminatedUnion, etc. Reusing this is the shortest path. JSON Schema x-* metadata preserved as Zod annotations or parallel metadata registry.
**Trade-offs:** JSON Schema → Zod conversion adds a build step. x-* extension metadata needs careful mapping.
**Depends on:** D4 (blocks-ui registers converted schemas with pages-lsp)
**Sources:** schema-completion.ts navigateSchema(), pages-schema Zod generation, graph-stencil JSON Schemas
**Exploration:** quick
**Status:** captured

## D11: Web as First-Class Consumer

**Choice:** The browser-based editors are first-class LSP consumers with full single-document capabilities — completion, diagnostics, hover, and single-file refactoring. Cross-file capabilities (workspace rename, cross-file go-to-definition, multi-file diagnostics) require IDE mode with filesystem access.
**Alternatives:**
- Browser gets completion + diagnostics only, refactoring is IDE-exclusive — simpler but limits web users
- Full parity including cross-file — impossible without a virtual filesystem in the worker
**Rationale:** Most CaseHub users interact through the browser, not an IDE. The LSP running in a web worker provides single-document intelligence to CodeMirror: completion, validation, hover, and single-file rename. The host application provides document content via `textDocument/didOpen`. Cross-file refactoring (rename across files, move definitions) requires filesystem access available only in IDE mode. This is an intentional capability boundary — the browser editor edits one file at a time, and single-document intelligence covers that use case completely.
**Trade-offs:** CodeMirror needs UI for presenting code actions and workspace edit previews. Web users cannot do workspace-wide rename — they use the IDE for that.
**Depends on:** D6 (web worker mode in scope), D8 (LSP is the shared core)
**Sources:** User direction: "if web front end is integrated into the LSP, and it supports refactoring — then our web based editors can expose that"
**Exploration:** quick
**Status:** revised (R1-05: qualified "full capabilities" — full single-document capabilities in web worker, cross-file capabilities in IDE mode only)

## D12: Project Decomposition

**Choice:** Four batches within two work slots, each with a review gate before the next starts.
- Slot 1 (pages): Batch 1 — LSP core (completion, diagnostics, hover, detection, schema registry, web worker). Batch 2 — Refactoring engine (symbol table, reference graph, rename, extract/move/inline).
- Slot 2 (blocks-ui): Batch 3 — IDE plugins (VS Code + IntelliJ LSP clients, native UI wrappers, domain schema registration). Batch 4 — Diagram webview ("Open With" in both IDEs, bidirectional sync — gets its own design exploration).
**Alternatives:**
- Single slot — too large, crosses repo boundaries
- Two batches only — bundles LSP intelligence with refactoring infrastructure, bundles IDE shells with diagram webview
**Rationale:** Each batch has clear boundaries and deliverables. Batch 1 delivers browser value independently. Batch 2 adds refactoring (requires new symbol table infrastructure). Batch 3 delivers IDE plugins. Batch 4 adds visual editing with dedicated design attention for sync challenges.
**Trade-offs:** Four review gates adds process overhead. Each batch depends on the previous — no parallelism.
**Depends on:** D4 (repo split defines slot boundaries), D7 (diagram webview sequenced as Batch 4)
**Sources:** Existing pages/blocks-ui development workflow
**Exploration:** quick
**Status:** revised (updated from 2 slots to 4 batches within 2 slots, D7 diagram webview as Batch 4)

## D13: Custom LSP Server vs Extending yaml-language-server

**Choice:** Custom TypeScript LSP server — not extending yaml-language-server
**Alternatives:**
- Extend yaml-language-server via schema contributions — reuse YAML parsing, completion, diagnostics, hover, formatting; add CaseHub schemas via JSON Schema contribution API
- Hybrid: yaml-language-server for base YAML intelligence + custom LSP for CaseHub-specific features (refactoring, discriminated union completion, jq)
**Rationale:** CaseHub Playbook YAML is discriminated-union-dominant. The componentSchemaRegistry has 55+ types dispatched by a `type` discriminator. The binding-schema has three discriminated unions (targetType, on, triggerType). yaml-language-server's JSON Schema `oneOf` handling produces flat completion — all branches' properties listed simultaneously, not narrowed by discriminator value. This is worse than no completion for CaseHub's format. The hybrid approach creates conflicting LSP registrations — two servers competing for the same file types with duplicate diagnostics and completions. Web worker mode eliminates yaml-language-server entirely (it's a Node.js application). The existing `navigateSchema()` walker (schema-completion.ts, 375 lines) already handles discriminated unions correctly with sibling-aware branch resolution — this IS the intelligence engine.
**Trade-offs:** Must implement YAML parsing, error recovery, document symbols, folding, and formatting — features yaml-language-server provides. Mitigated: the `yaml` npm library (parseDocument/CST) handles parsing and error recovery; document symbols and folding are straightforward from the parsed tree; formatting uses the same library's `toString()`.
**Sources:** schema-completion.ts navigateSchema(), pages-schema componentSchemaRegistry (55+ types), graph-stencil-case binding-schema.ts (3 discriminated unions), issue #407 body, issue #408 ("schemas become the LSP's source of truth")
**Exploration:** implicit — surfaced by R1-03, now explicitly captured
**Status:** captured

## D14: Schema Registration API

**Choice:** Runtime registration via `SchemaRegistry.register(formatId, schema)` — the LSP core defines the interface, consumers register schemas at activation time
**Alternatives:**
- Build-time bundling — all schemas compiled into the LSP distributable. Simpler but couples the LSP build to all schema sources.
- Convention-based discovery — LSP scans for schema modules by naming convention. Implicit, fragile.
**Rationale:** Runtime registration decouples the LSP core from schema sources. pages-schema registers Page format schemas at LSP startup. Domain schemas from blocks-ui register via the IDE plugin's activation sequence (the plugin knows which schemas to load). For web worker mode, the host application provides schemas via a `configure({ schemas: [...] })` call before the worker starts serving. This enables third-party schema contributions without modifying the LSP core.
**Trade-offs:** Schema changes require re-registration (IDE plugin restart or web worker reconfiguration). The registry API shape is load-bearing — it must stabilise before Slot 2 can register domain schemas.
**Depends on:** D4 (repo split — pages-schema in pages, domain schemas in blocks-ui), D10 (Zod as canonical format)
**Sources:** pages-schema/src/schema-registry.ts (existing componentSchemaRegistry pattern), blocks-ui-schema (generated Zod schemas)
**Exploration:** surfaced by R1-08, now explicitly captured
**Status:** captured

## D15: Cross-File Reference Resolution

**Choice:** Progressive resolution with environment-aware capability — IDE mode provides workspace-wide symbol index; web worker mode provides single-document resolution only
**Alternatives:**
- IDE-only cross-file resolution, web worker has no reference awareness — simpler but web users get no reference intelligence at all
- Virtual filesystem in web worker — host provides all files to the worker for full parity. Architecturally possible but complex (file watching, incremental updates, memory pressure) and unnecessary for the single-document editing use case.
**Rationale:** CaseHub Playbook YAML files reference entities across files: dataset names, capability names, page names, worker names. Cross-file resolution enables: (1) workspace-wide rename — rename a capability → update all files that reference it, (2) go-to-definition — click a capability reference → jump to its definition, (3) diagnostics — "unknown capability 'foo' — did you mean 'bar'?", (4) find-references — all call sites of a named entity. In IDE mode, the LSP uses `workspace/didOpen` notifications and file watchers to build and maintain a workspace-wide symbol index. In web worker mode, references get schema-based completion (valid enum values from the schema) but no cross-file navigation or rename. This aligns with the browser editing model — one file at a time.
**Trade-offs:** The workspace symbol index is new infrastructure — not present in the current codebase. Phased delivery: completion + diagnostics + hover first (schema-only, no symbol index needed), then rename (requires per-document symbol index), then cross-file features (requires workspace symbol index).
**Depends on:** D3 (phased refactoring delivery), D6 (web worker capability boundary), D13 (custom LSP)
**Sources:** LSP protocol: workspace/symbol, textDocument/definition, textDocument/references
**Exploration:** surfaced by R1-10, now explicitly captured
**Status:** captured
