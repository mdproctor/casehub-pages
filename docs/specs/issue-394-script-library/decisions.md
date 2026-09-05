## D1: Fix yaml-core gaps upstream before revising scenario engine

**Choice:** Upstream-first — fix ForEachExpander CSV support and parameter validation bridge in platform yaml-core, then simplify the scenario engine downstream.
**Alternatives:**
- Work around gaps in the scenario engine only — keeps yaml-core unchanged but duplicates logic
- Replace ParamDescriptor with YamlModuleParameter directly — tight coupling to yaml-core internals
**Rationale:** The gaps exist because yaml-core has the primitives (CsvDataSource, withEachRowContext, ParameterValidator) but doesn't compose them. Fixing upstream benefits all consumers, not just the scenario engine. The slot already includes both repos.
**Trade-offs:** Requires cross-repo coordination — platform changes must land before pages changes.
**Sources:** ForEachExpander.java (yaml-core), ScenarioCompiler.java (pages), VariableResolver.java (yaml-core), ParameterValidator.java (yaml-core)
**Exploration:** quick
**Status:** implemented

## D2: Module system is NOT appropriate for script composability

**Choice:** Keep the current `inlineCalls()` approach for the `call` command. Do not use `ModuleExpander`.
**Alternatives:**
- Wrap scenario steps into YamlModule sections and use ModuleExpander — structural mismatch (ordered steps vs unordered sections) makes this more complex than direct inlining
**Rationale:** ModuleExpander operates on `Map<String, Map<String, Object>>` — unordered section maps. Scenarios are ordered step lists. Forcing scenarios into the module model would require an ordering bridge that's more complex than the existing `inlineCalls()` which is straightforward and correct.
**Trade-offs:** The scenario `call` implementation stays separate from the module system — two composability mechanisms in the platform. Acceptable because they serve different structural models (ordered vs unordered).
**Sources:** ModuleExpander.java (yaml-core), ScenarioCompiler.inlineCalls() (pages)
**Exploration:** quick
**Status:** captured

## D3: Unify variable resolution — each as regular prefix

**Choice:** Remove `each` special-casing from VariableResolver. Make it a regular prefix resolved via `VariableSource.forEachContext()`.
**Alternatives:**
- Keep `resolveEach()` + `drillField()` as internal special case — works but duplicates drilling logic with `VariableSource.nested()`
**Rationale:** The `each` prefix had its own fields (`eachContext`, `eachRowContext`), methods (`withEachContext`, `withEachRowContext`, `resolveEach`), and drilling logic (`drillField`) — a parallel resolution path that didn't compose with the source-based architecture. Unifying makes VariableResolver a pure prefix→source dispatcher.
**Trade-offs:** `forEachContext(simple, rows)` is a more specialized source factory than `nested()` — it encodes the dot-aware priority (dotted refs drill rows, bare refs use simple values). Justified because this IS the forEach iteration pattern.
**Sources:** VariableResolver.java (resolveEach, drillField), VariableSource.java (nested, forEachContext), ForEachExpander.java
**Exploration:** deep-analysis
**Status:** implemented

## D4: No wrapper abstractions — callers use expand() directly

**Choice:** Remove `ForEachExpander.expandList()`. Callers inline the 3-line list→map→list conversion and use `expand()` directly.
**Alternatives:**
- Keep expandList convenience wrapper — saves 2 lines per call site
**Rationale:** expandList hid `ExpansionResult` (losing `excludedIds`), added an `idExtractor` parameter duplicating caller knowledge, and added API surface without adding clarity. Three lines at the call site is better than a wrapper that obscures what's happening.
**Trade-offs:** Caller writes 3 extra lines. Worth it for transparency and access to the full result.
**Sources:** ForEachExpander.java, ScenarioCompiler.java
**Exploration:** quick
**Status:** implemented
