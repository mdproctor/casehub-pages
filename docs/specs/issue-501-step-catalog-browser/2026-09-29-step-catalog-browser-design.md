# Step Catalog Browser — Design Spec

**Issue:** casehubio/casehub-pages#501
**Date:** 2026-09-29

## Summary

A browsable catalog of all registered step actions (YAML definitions, MCP tools, scripts) with input/output schemas, live execution ("Try it"), and YAML template generation for scenario authoring. Embedded as a view in the scenario controller alongside the existing library view.

## Architecture

### Two-surface split

- **Java `@McpDomain("step-catalog")` resolver** — serves catalog data (browse, search, detail). Reads YAML step definition files, enumerates registered MCP tools, discovers script files. Static at startup.
- **TS pages-aria REST endpoint** — `POST /scenario/catalog/execute` handles live step execution via the existing `StructuralStepEvaluator` (renamed to StructuralEvaluator) and invoke handlers.

This split exists because the Java backend can read all definition sources natively, while step execution depends on the TS invoke handler pipeline which already works.

### Data flow

```
┌─────────────────────────────┐
│  Java Backend               │
│  StepCatalogResolver (→ CatalogResolver) │
│  @McpDomain("step-catalog") │
│                             │
│  Sources:                   │
│  ├─ YAML step def files     │
│  ├─ MCP tool registry       │
│  └─ Script file scanner     │
│                             │
│  Queries:                   │
│  ├─ catalogActions()        │
│  └─ catalogAction(name)     │
└──────────┬──────────────────┘
           │ REST/GraphQL
           ▼
┌──────────────────────────────┐
│  Browser                     │
│  <pages-step-catalog>        │
│  ├─ List view (search/filter)│
│  ├─ Detail view (schemas)    │
│  ├─ Try it (→ TS endpoint)   │
│  └─ Template (→ CustomEvent) │
└──────────┬───────────────────┘
           │ POST /scenario/catalog/execute
           ▼
┌──────────────────────────────┐
│  TS pages-aria server        │
│  Walker → Evaluator           │
│  Returns Result               │
└──────────────────────────────┘
```

## Java Backend — StepCatalogResolver

### Class: `StepCatalogResolver` (renamed to CatalogResolver)

Location: `backend/mcp/src/main/java/io/casehub/pages/mcp/StepCatalogResolver.java`

```java
@McpDomain("step-catalog")
@GraphQLApi
@ApplicationScoped
public class StepCatalogResolver {

    @Inject StepCatalogService catalog;

    @Query("catalogActions")
    public List<CatalogActionSummary> actions() { ... }

    @Query("catalogAction")
    public CatalogActionDetail action(String name) { ... }
}
```

### Class: `StepCatalogService` (renamed to CatalogService)

Location: `backend/scenario-runtime/src/main/java/io/casehub/pages/scenario/runtime/StepCatalogService.java`

Scans and caches catalog entries at startup from three sources:

1. **YAML step definition files** — reads `*.yaml` files from a configurable classpath/filesystem path (e.g. `casehub.step-catalog.definitions-path`). Parses the `DefinitionFile` format using the same schema as the TS `StepDefinitionParser` (renamed to DeclarationParser): namespace, actions map (each with name, description, inputs, outputs, invoke binding). The Java parser mirrors the TS parser's field mapping (including `default`/`defaultValue` and `enum`/`allowedValues` aliases).

2. **MCP tools** — enumerates tools from the platform's MCP domain registry (CDI-discovered `@McpDomain` beans). Each `@Query`/`@Mutation` has a name, parameter types, and return type that map to the catalog schema.

3. **Script files** — scans a configurable scripts directory for executable files with a companion `<name>.schema.yaml` that declares inputs, outputs, and runtime.

### Data types

```java
public record CatalogActionSummary(
    String name,
    String description,
    String invokeKind,   // "mcp" | "rest" | "script" | "graphql" | "agent" | "process" | null
    String source,       // "yaml" | "mcp" | "script"
    int inputCount,
    int outputCount
) {}

public record CatalogActionDetail(
    String name,
    String description,
    String invokeKind,
    String source,
    Map<String, StepParameterDto> inputs,
    Map<String, StepParameterDto> outputs,
    InvokeBindingSummary invoke   // kind + non-sensitive metadata (no credentials)
) {}

public record StepParameterDto(
    String type,
    boolean required,
    String defaultValue,
    List<String> allowedValues,
    String format,
    String description
) {}

public record InvokeBindingSummary(
    String kind,
    Map<String, String> metadata  // e.g. tool name, URL pattern, runtime
) {}
```

## TS Execution Endpoint

### Endpoint: `POST /scenario/catalog/execute`

Location: new handler in `packages/pages-aria/src/server/` or extension of existing scenario resource.

**Request:**
```json
{
  "actionName": "check-compliance",
  "params": {
    "documentId": "doc-123",
    "standard": "ISO-27001"
  }
}
```

**Response:**
```json
{
  "kind": "success",
  "output": { "compliant": true, "findings": [] },
  "executionMetadata": { "durationMs": 234 }
}
```

Or on failure:
```json
{
  "kind": "failure",
  "message": "REST endpoint returned 404"
}
```

**Implementation:** Build a `CompositeStepCatalog` (renamed to CompositeCatalog) from available sources (same sources the scenario runtime uses). Construct a single plugin step from the action name and provided params. Run through `StructuralStepEvaluator` (renamed to StructuralEvaluator) with a `MapServiceRegistry`. Return the `StepResult` (renamed to Result) as JSON.

## UI Component — `<pages-step-catalog>`

### Location

`packages/pages-aria/src/controller/step-catalog.ts`

Registered as `pages-step-catalog` custom element.

### Integration with scenario controller

`PagesScenarioController` gains:
- New view mode `'catalog'` alongside `'outline'` and `'library'`
- `_toggleCatalog()` method (same pattern as `_toggleLibrary()`)
- Header button to switch to catalog view
- Renders `<pages-step-catalog>` when `_view === 'catalog'`

### Component structure

The component has two internal states: **list** and **detail**.

**List state:**
- Search input (filters by name and description, client-side)
- Source filter chips: YAML / MCP / Script (toggle to filter by source)
- Invoke kind filter chips: REST / MCP / Script / GraphQL / Agent / Process
- Scrollable list of `CatalogActionSummary` items, each showing:
  - Action name (bold)
  - Description (truncated)
  - Source badge (yaml/mcp/script)
  - Invoke kind badge
  - Input/output count

**Detail state** (shown when user clicks an action):
- Back button to return to list
- Action name and description
- Invoke kind and source badges
- **Inputs table:** name, type, required, default, allowed values, description
- **Outputs table:** name, type, description
- **Invoke binding summary:** kind + non-sensitive metadata
- **Try it panel:** Form generated from input schema — text inputs for each parameter, respecting type/required/defaultValue/allowedValues. Execute button → `POST /scenario/catalog/execute` → result display (success output as formatted JSON, or failure message)
- **Use template button:** Generates YAML snippet, copies to clipboard, emits `step-template-selected` CustomEvent

### Properties

```typescript
@property() baseUrl = '';      // Java backend base URL — catalog queries (catalogActions, catalogAction)
@property() execBaseUrl = '';  // TS pages-aria server base URL — step execution (/scenario/catalog/execute)
```

In the gallery dev server, both URLs point to the same host (proxied). In production, the Java backend serves GraphQL/MCP and the TS server handles execution — the scenario controller passes both URLs down.

### Events emitted

```typescript
// When user clicks "Use template" on an action
new CustomEvent('step-template-selected', {
  detail: {
    actionName: string,
    yaml: string,  // Generated YAML template
  },
  bubbles: true,
  composed: true,
})
```

### YAML template generation

Given a `CatalogActionDetail`, generate a YAML step snippet:

```yaml
- check-compliance:
    documentId: ""        # string, required
    standard: "ISO-27001" # string, default: ISO-27001
```

Rules:
- Action name as the key
- Each required input as a sub-key with empty string or default value
- Optional inputs included with default value or commented placeholder
- Type and required/optional noted as inline YAML comments

### Styling

Uses `--pages-*` design tokens throughout, matching `PagesLibraryView` conventions:
- `--pages-font-family`, `--pages-font-size-sm`, `--pages-font-size-base`
- `--pages-neutral-*` for text, borders, backgrounds
- `--pages-accent-*` for interactive elements and active states
- `--pages-radius-sm`, `--pages-radius-lg` for border radius
- `--pages-space-*` for padding/margins
- `--pages-success-*`, `--pages-danger-*` for try-it result states

### Accessibility

Per `aria-interaction-contract.md`:
- Search input: `aria-label="Search step actions"`
- Filter chips: `role="checkbox"` with `aria-checked`
- Action list items: `role="listitem"` within `role="list"`
- Detail tables: proper `<table>` with `<th>` headers
- Try-it execute button: `aria-label="Execute {actionName}"`
- Back button: `aria-label="Back to catalog list"`

## Scope boundaries

**In scope:**
- Java `StepCatalogResolver` with `@McpDomain("step-catalog")`
- `StepCatalogService` scanning YAML, MCP, script sources
- TS `POST /scenario/catalog/execute` endpoint
- `<pages-step-catalog>` Lit component with list/detail/try-it/template
- Integration into `PagesScenarioController` as a view mode
- CustomEvent + clipboard for YAML template

**Out of scope (deferred):**
- TS runtime plugin source (needs TS→Java bridge)
- Editor cursor insertion (future editor can consume the CustomEvent)
- Step execution streaming/progress (synchronous result is sufficient)
- Catalog change notifications (catalog is static at startup)

## References

- `../../../packages/yaml-core/src/step/walker.ts` — Catalog interface (renamed from StepCatalog), CatalogEntry
- `../../../packages/yaml-core/src/step/types.ts` — StepDefinition, StepParameter, InvokeBinding types
- `../../../packages/yaml-core/src/step/catalog.ts` — CompositeCatalog (renamed from CompositeStepCatalog), CatalogSource
- `packages/yaml-core/src/step/sources/yaml-source.ts` — YamlDefinitionSource (renamed from YamlStepDefinitionSource)
- `packages/yaml-core/src/step/sources/mcp-source.ts` — McpToolSource
- `packages/yaml-core/src/step/sources/script-source.ts` — ScriptSource
- `packages/yaml-core/src/step/structural-evaluator.ts` — StructuralEvaluator (renamed from StructuralStepEvaluator)
- `packages/pages-aria/src/controller/library-view.ts` — PagesLibraryView (UI pattern reference)
- `packages/pages-aria/src/controller/scenario-controller.ts` — PagesScenarioController (integration point)
- `backend/mcp/src/main/java/io/casehub/pages/mcp/ScenarioResolver.java` — @McpDomain pattern
- `docs/protocols/casehub/aria-interaction-contract.md` — ARIA requirements
- `docs/protocols/casehub/css-design-tokens.md` — --pages-* token convention
- `docs/protocols/casehub/web-component-strategy.md` — Lit for interactive components
- casehubio/casehub-pages#502 — parent epic
