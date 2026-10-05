# Decisions — Step Catalog Browser (#501)

## D1: Java StepCatalog (renamed to Catalog) service structure

**Choice:** Single-class resolver with inline scanning
**Alternatives:**
- CDI-based multi-source architecture — mirrors TS extensibility but Java side is read-only, adds complexity without payoff
- Delegate to TS runtime — avoids duplication but adds runtime dependency on TS dev server for browsing
**Rationale:** Java side only reads step definitions (no execution). Catalog is static at startup. Matches existing ScenarioResolver pattern.
**Trade-offs:** Less extensible than CDI multi-source, but extensibility isn't needed for read-only catalog serving
**Sources:** backend/mcp/src/main/java/io/casehub/pages/mcp/ScenarioResolver.java, packages/yaml-core/src/step/step-catalog.ts
**Exploration:** quick
**Status:** captured

## D1a: Scope — confirmed from clarifying questions

**Choice:** YAML + MCP + Script catalog sources; live execution via TS runtime REST; CustomEvent + clipboard for editor integration; TS plugins deferred
**Alternatives:**
- YAML only — too narrow, misses MCP tools and scripts
- All four sources — needs TS→Java bridge for plugin registrations
- Defer Try it / editor integration — user chose full scope
**Rationale:** Covers the three sources Java can natively read. Execution stays in TS where invoke handlers exist. Editor integration via event decouples from editor implementation.
**Trade-offs:** Two API surfaces (Java for catalog, TS for execution) instead of one
**Sources:** packages/yaml-core/src/step/sources/ (yaml-source.ts, mcp-source.ts, script-source.ts)
**Exploration:** quick
**Status:** captured

## D1b: Placement — confirmed from clarifying questions

**Choice:** Embed in scenario controller as a view (not standalone)
**Alternatives:**
- Standalone component — more reusable but needs own hosting context
- Both with shared core — maximum flexibility, more surface area
**Rationale:** Matches established library view pattern. Puts catalog where YAML authoring happens.
**Trade-offs:** Less reusable outside scenario controller, but "both" can be done later by extracting the component
**Sources:** packages/pages-aria/src/controller/scenario-controller.ts
**Exploration:** quick
**Status:** captured

## D2: UI component structure within scenario controller

**Choice:** New view mode in scenario controller — add `'catalog'` alongside `'outline'` and `'library'`, rendering a self-contained `<pages-step-catalog>` Lit component
**Alternatives:**
- Tab inside library view — mixes script-level and action-level concerns in one component
- Floating panel — adds drag/dock complexity, diverges from library view pattern
**Rationale:** Follows the exact pattern established by `_toggleLibrary` → `<pages-library-view>`. Clean separation, component is self-contained and reusable.
**Trade-offs:** One more view mode to toggle between, but the header already handles this
**Sources:** packages/pages-aria/src/controller/scenario-controller.ts (lines 330-354), packages/pages-aria/src/controller/library-view.ts
**Exploration:** quick
**Depends on:** D1 (Java resolver structure)
**Status:** captured

## D3: Catalog REST/MCP API shape

**Choice:** Two queries — `catalogActions()` (summary list) and `catalogAction(name)` (full detail with parameter schemas)
**Alternatives:**
- Single query returning everything — response could be large, list view doesn't need full schemas
- Three queries with server-side search — unnecessary, catalog is small enough for client-side filtering
**Rationale:** Lightweight list for browsing, full schema loaded on demand when user selects an action. Clean separation.
**Trade-offs:** Two round trips for list→detail, but detail is only loaded on selection
**Sources:** backend/mcp/src/main/java/io/casehub/pages/mcp/ScenarioResolver.java, packages/yaml-core/src/step/step-types.ts
**Exploration:** quick
**Status:** captured

## D4: Try-it execution endpoint

**Choice:** REST endpoint `POST /scenario/catalog/execute` on pages-aria TS server — takes `{ actionName, params }`, resolves via StepWalker (renamed to Walker), runs through StructuralStepEvaluator (renamed to StructuralEvaluator), returns StepResult (renamed to Result)
**Alternatives:**
- WebSocket command via scenario-handler — adds protocol complexity for a synchronous request/response pattern
- New MCP tool on TS side — no TS MCP server exists today
**Rationale:** Synchronous execute-and-return is a natural REST pattern. Follows existing `/scenario/library` endpoint conventions.
**Trade-offs:** Separate endpoint from the Java @McpDomain catalog — two surfaces, but execution belongs in TS where invoke handlers live
**Depends on:** D1a (execution stays in TS runtime)
**Sources:** packages/pages-aria/src/server/scenario-handler.ts, packages/yaml-core/src/step/structural-evaluator.ts
**Exploration:** quick
**Status:** captured
