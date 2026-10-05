# yaml-core Integration and Interactive Tutorial — Design Spec

**Issue:** casehubio/casehub-pages#435
**Branch:** issue-435-yaml-tutorial
**Date:** 2026-09-14
**Scope:** yaml-core as universal YAML composition layer + interactive tutorial

---

## 1. Vision

CaseHub's YAML formats (pages, case, swf, htn, org) each define domain-specific structure but lack composition capabilities — no variables, no reusable modules, no iteration, no conditionals. Platform's `yaml-core` library provides all of these as a format-agnostic preprocessing layer, but it's Java-only.

This design brings yaml-core to the browser as a TypeScript port and integrates it into the pages pipeline, LSP, and builder. Every YAML format the LSP supports gains composition capabilities via schema composition. An interactive tutorial teaches the unified language through building progressively complex pages.

### What makes this novel

No existing tool combines YAML composition (parameterized modules, forEach iteration, cross-module references, conditionals) with a visual page builder and LSP intelligence. Drupal's SDC has YAML component schemas; Pulumi YAML has variable interpolation; CI/CD tools have template composition — but none combine all three with live visual feedback.

---

## 2. Architecture

### 2.1 yaml-core as a language layer

yaml-core is NOT a format — it's a preprocessing layer that sits below all formats:

```
YAML text
  → js-yaml parse → raw map
  → yaml-core preprocess (variables, modules, forEach, when) → expanded raw map
  → format-specific parse (page, case, swf) → domain model
```

yaml-core operates on raw maps. It doesn't know or care what format the content describes. This means any YAML format gains composition for free.

### 2.2 TypeScript port of yaml-core

Port platform's `yaml-core` Java library (~40 files, ~1500-2000 LOC) to TypeScript as a new package `@casehubio/yaml-core`.

**Source:** `platform/yaml-core/src/main/java/io/casehub/yaml/core/`

| Java module | TypeScript equivalent | Complexity |
|---|---|---|
| `resolver/VariableResolver` | Regex-based `${prefix.name}` interpolation on maps | Low |
| `resolver/VariableSource` | Interface: `(key: string) => string \| undefined` | Trivial |
| `foreach/ForEachExpander` | Map iteration with stamped IDs, group references | Medium |
| `foreach/ForEachDirective` | Union: group reference (string) or inline `{as, in}` | Low |
| `foreach/ForEachAdapter<E>` | Generic interface: extract forEach from elements | Low |
| `module/ModuleExpander` | Parameter resolution, section merging, output wiring | Medium |
| `module/YamlModule` | Interface: parameters, outputs, sections | Low |
| `module/ParameterValidator` | Type checking: STRING, INTEGER, BOOLEAN, NUMBER, LIST | Low |
| `condition/Truthiness` | Boolean evaluation: true/false/yes/no/on/off/1/0 | Trivial |
| `data/CsvParser` | CSV parsing for iteration data | Low |

**Supporting types not listed above:** The port table enumerates the primary modules. Each module has associated supporting types (interfaces, enums, error types) that are discovered and ported alongside the module: `DeferredPrefixHandler` (critical for the deferred prefix mechanism in VariableResolver), `UnresolvedVariableException`, `YamlImport` (import declaration), `IterationGroup`, `CsvDataSource`, `CsvColumn`/`CsvColumnType`. These are small — typically interfaces or union types — and are included in `types.ts`.

**Behavioral contract:** yaml-core's JSON Schema fragments (`src/main/resources/schema/*.schema.json`) define the formal interface. Conformance tests derived from the Java test suite (VariableResolverTest, ForEachExpanderTest, ModuleExpanderTest, etc.) verify behavioral parity.

**Package location:** `packages/yaml-core/` in the pages monorepo. Consumed by pages-runtime, pages-lsp, and pages-builder.

**J2CL migration path:** When pages#344 builds the J2CL infrastructure for the broader scenario engine, yaml-core's expansion logic can migrate from the TS port to J2CL. The migration boundary:

- **J2CL-replaceable:** Expansion logic (`expand()`, `VariableResolver`, `ForEachExpander`, `ModuleExpander`, `Truthiness`, `CsvParser`, `ParameterValidator`) — pure algorithmic code with Java equivalents.
- **TypeScript-only:** Zod schemas (`schema.generated.ts`, `yamlCoreDocumentSchema`, `yamlCoreElementMixin`) — J2CL produces plain JavaScript, not Zod types. The schema layer must remain as TypeScript regardless of the migration.

This is handled within a single package by structuring exports into separate module entry points (`@casehubio/yaml-core/expand` vs `@casehubio/yaml-core/schema`). No package split is required — the J2CL migration replaces the expansion entry point while the schema entry point stays TypeScript. The TS port is small enough that coexistence is also viable.

### 2.3 Schema composition

yaml-core Zod schemas are generated from the existing JSON Schema fragments at build time using `json-schema-to-zod`:

**Source:** `platform/yaml-core/src/main/resources/schema/`
- `module.schema.json` — modules, parameters (5 types + constraints), outputs, imports
- `foreach.schema.json` — group reference or inline `{as, in}`
- `variable.schema.json` — variable source scoping
- `when.schema.json` — conditional evaluation
- `data.schema.json` — CSV data sources
- `iterations.schema.json` — named iteration groups

**Generated output:** `packages/yaml-core/src/schema.generated.ts` — Zod types for all yaml-core constructs.

**Schema structure note:** The JSON Schema fragments describe the module FILE format (`module.schema.json` has `module: {name, parameters, outputs}` as a top-level object). For inline module definitions in a consuming document, modules are keyed by name under a `modules:` record. The `json-schema-to-zod` conversion produces the file-format schemas; the document-level composition schema adapts these for inline use.

**`json-schema-to-zod` vetting:** This is a new build dependency with zero existing usage in the project. Before committing, Issue 2 (json-schema-to-zod build step) must verify:
1. Coverage of JSON Schema 2020-12 features used in the fragments (`oneOf`, `$ref`, `enum`, `pattern`, `additionalProperties`)
2. Generated Zod types are compatible with the schema-navigation engine's `walk()` function
3. Build step integrates with the existing Vite/Vitest toolchain (generate at build time, not runtime)

**Fallback:** If `json-schema-to-zod` proves inadequate, the 6 schemas are small enough to hand-write. Hand-writing trades automatic parity for full control — if chosen, conformance tests must validate the hand-written schemas against the JSON Schema fragments.

**Composition with format schemas:**

```typescript
// packages/yaml-core/src/schema.ts

// moduleDefinitionSchema adapts the file-format schema for inline use:
// file format: {module: {name: "x", parameters: ...}, sections: ...}
// inline format: modules: {"x": {parameters: ..., sections: ...}}
export const moduleDefinitionSchema = z.object({
  parameters: z.record(parameterSchema).optional(),
  outputs: z.record(outputSchema).optional(),
  sections: z.record(z.record(z.unknown())).optional(),
  extends: z.string().optional(),
});

export const yamlCoreDocumentSchema = z.object({
  variables: variablesSchema.optional(),
  modules: z.record(moduleDefinitionSchema).optional(),
  imports: z.array(importSchema).optional(),
  iterations: z.record(iterationGroupSchema).optional(),
  data: z.record(dataSourceSchema).optional(),
});

export const yamlCoreElementMixin = {
  forEach: forEachSchema.optional(),
  when: z.string().optional(),
};
```

Each format composes via `z.intersection()` — one line per format:

```typescript
// pages-lsp: formats/page.ts
documentSchema: z.intersection(yamlCoreDocumentSchema, dashboardSchema),

// blocks-ui/lsp-schemas: formats/case.ts
documentSchema: z.intersection(yamlCoreDocumentSchema, caseSchema),

// ... same for swf, htn, org
```

**Why `z.intersection()` over `.merge()`:** Format schemas like `dashboardSchema` are exported as `z.ZodType` (the widened type needed for `FormatRegistration.documentSchema`). `ZodObject.merge()` requires a `ZodObject` argument and would fail at compile time against a widened `z.ZodType`. `z.intersection()` works with any `ZodType`, and the schema-navigation engine already handles `ZodIntersection` natively.

Element-level yaml-core keys (`forEach`, `when`) added to each format's element base schema:

```typescript
// pages-schema: document-schema.ts
const componentBase = z.object({
  id: z.string().optional(),
  style: z.record(z.string()).optional(),
  visibleWhen: z.string().optional(),  // runtime: CSS visibility toggle (component stays in DOM)
  forEach: forEachSchema.optional(),
  when: z.string().optional(),         // build-time: yaml-core removes element entirely if falsy
});
```

**`visibleWhen` vs `when`:** These serve different purposes and use different expression languages:

| Attribute | Phase | Expression language | Example |
|---|---|---|---|
| `visibleWhen` | Runtime | EL-style: `#{filter.ward}`, `${userRole = 'admin'}` — evaluated by the runtime context manager against live data | `visibleWhen: "#{filter.active}"` |
| `when` | Build-time | yaml-core Truthiness: simple boolean strings (`true/false/yes/no/on/off/1/0`) — evaluated after variable resolution | `when: "${var.showMetrics}"` |

`visibleWhen` is a runtime conditional — the component stays in the DOM but toggles CSS visibility based on a live expression. `when` is a build-time conditional — yaml-core removes the element entirely from the expanded map before the page parser sees it. Both can coexist: `when` controls whether a component exists at all, `visibleWhen` controls whether an existing component is visible.

The expression language difference is by design — `when` operates on static variable values after yaml-core expansion, while `visibleWhen` operates on dynamic runtime state. The tutorial should teach this distinction explicitly (step 12: Conditionals).

**`when:` expressiveness constraint:** The `when:` condition must resolve to a boolean string after variable substitution. It does NOT support comparison expressions, arithmetic, or arbitrary logic. The data source must provide pre-computed boolean flags:

```yaml
# Valid — variable resolves to "true" or "false"
when: "${var.showMetrics}"
when: "${each.enabled}"

# Invalid — resolves to "us != 'ap'" which is not a boolean string
when: "${each.region} != 'ap'"
```

To conditionally exclude by non-boolean values, the data source (CSV, iteration group, or variable definition) must include a boolean flag column that the authoring tool or data pipeline pre-computes. This is a deliberate design constraint — yaml-core's `Truthiness` evaluator is intentionally simple to avoid embedding an expression language in the build-time preprocessor.

**Note:** Import-level `when:` (on `YamlImport`) has different semantics — `ModuleExpander` stores the condition as metadata without evaluating it via Truthiness. The consumer evaluates import conditions separately.

**Collision detection:** The merge step should validate that no key names collide between yaml-core and format schemas. yaml-core uses distinctive keys (`modules`, `imports`, `forEach`, `when`, `variables`, `iterations`, `data`) that don't conflict with current format schemas.

### 2.4 Pages runtime integration

yaml-core preprocessing step in the pages parser pipeline:

```
YAML text
  → js-yaml parse → raw map
  → yaml-core.expand(map) → ExpandResult {map, diagnostics}     ← NEW
  → page-parser.ts → component tree
  → loadSite() → LiveSite
```

The `expand()` function runs the full yaml-core pipeline. The pipeline order mirrors the Java consumer (`CaseDefinitionYamlMapper.load()`):

1. Resolve CSV data sources → populate iteration groups
2. Expand modules → merge sections, resolve parameters, wire outputs
3. Resolve variables → substitute `${prefix.name}` patterns (with `each` as a deferred prefix — `${each.*}` passes through unresolved)
4. Expand forEach → stamp copies, evaluate `when:` per element

**`when:` evaluation is NOT a separate step.** The `ForEachExpander` handles `when:` conditions internally during forEach processing:

- **Non-forEach elements:** `when:` is evaluated against the base variable resolver. If falsy, the element is excluded.
- **forEach elements:** `when:` is evaluated PER-ITERATION with the scoped `eachResolver` (which has `${each.*}` variables bound for that iteration value). This means `when: "${each.enabled}"` can selectively exclude individual stamped copies where `enabled` resolves to `"false"` or `"no"`.
- **Cross-references:** After stamping, reference rewriting validates that required references don't point to excluded elements.

This means the pipeline is not a clean linear chain — `when:` evaluation is interleaved with forEach expansion, and the scoping of `when:` depends on whether it appears inside or outside a forEach template. The conformance tests must cover:

- `when:` on a non-forEach element (evaluated with base resolver)
- `when:` inside a forEach template (evaluated per-iteration with `${each.*}` in scope)
- `when:` excluding some but not all iterations
- Cross-references from non-excluded to excluded elements (should error)

The expanded map is a standard page document — the existing page parser handles it without changes.

**Error handling modes:** The Java `VariableResolver` throws on unresolved variables — correct for batch processing but unusable in the builder's live-editing context where YAML is transiently invalid on every keystroke. The TypeScript port exposes two modes via the `expand()` return type:

```typescript
interface ExpansionDiagnostic {
  severity: 'error' | 'warning';
  message: string;
  path: string[];          // location in the source map (e.g., ['pages', 0, 'components', 1])
  category: 'unresolved-variable' | 'invalid-parameter' | 'circular-module' | 'unknown-prefix' | 'expansion-error';
}

interface ExpandResult {
  map: Record<string, unknown>;     // expanded map (partial — unresolved refs left as literal strings)
  diagnostics: ExpansionDiagnostic[];
}

// Public API
function expand(map: Record<string, unknown>, options?: { strict?: boolean }): ExpandResult;
```

| Mode | Behavior | Use case |
|---|---|---|
| Lenient (`strict: false`, default) | Unresolved variables left as `${prefix.name}` literals; invalid parameters skipped; diagnostics collected | Builder preview, tutorial validation |
| Strict (`strict: true`) | Throws on first error (Java parity) | Batch processing, conformance tests |

The builder's visual preview (§3.3) uses lenient mode: render what expands successfully, show diagnostics as editor squigglies via the LSP diagnostic channel. The tutorial runner uses lenient mode for validation step 4 — a non-empty diagnostics array means "not yet correct."

**Module-forEach composition constraints:**

The pipeline order (modules → variables → forEach) defines which compositions are valid:

| Composition | Supported? | Why |
|---|---|---|
| Module section contains forEach | Yes | Modules expand first → forEach sees the expanded section content |
| forEach iterates over variable | Yes | Variables resolve before forEach → `forEach: {as: x, in: "${var.items}"}` works |
| forEach iterates over module output | Yes | Module outputs are wired as variables → resolved in step 3, available to forEach in step 4 |
| Module parameterized with `${each.*}` | No | Modules expand (step 2) before forEach (step 4) — `${each.*}` is not yet in scope |
| forEach inside a module parameter | No | Same ordering constraint — modules are resolved before iteration begins |

These constraints should be documented in the tutorial (step 13: Composition) and enforced by validation diagnostics in the LSP.

**Integration point:** `pages-ui/src/parser/page-parser.ts` — add a yaml-core preprocessing call before the existing parsing logic. The preprocessing is optional — documents without yaml-core constructs pass through unchanged.

**Relationship with page-level `properties:` substitution:**

The existing page parser has a `substituteProperties()` step that resolves `${name}` patterns from a `properties:` section. yaml-core introduces a separate `variables:` system that resolves `${prefix.name}` patterns. These coexist without collision:

| System | Syntax | Scope | Pipeline stage |
|---|---|---|---|
| yaml-core `variables:` | `${prefix.name}` (dot-separated) | Format-agnostic, all YAML formats | Pre-expansion (step 4 above) |
| Page `properties:` | `${name}` (no dot) | Page-specific, DashBuilder compat | Post-expansion (page-parser.ts) |

The regex patterns don't overlap — `${theme}` is a page property, `${var.theme}` is a yaml-core variable. Pipeline order: yaml-core expansion runs first, then the page parser's `substituteProperties()` runs on the expanded result. Documents can use both systems: yaml-core variables for composition-level parameterization, page properties for page-level string replacement.

No unification is needed because they serve different purposes: yaml-core variables are a composition-layer feature (format-agnostic, participate in module parameterization and forEach scoping), while page properties are a page-format-specific convenience for simple string replacement. yaml-core `variables:` is the recommended approach for new documents.

### 2.5 LSP integration

**Structural completions (free with schema composition):**
The existing `schema-navigation.ts` engine walks Zod types generically. Schema composition via `z.intersection()` produces a combined type that the engine handles transparently (it already supports `ZodIntersection`). Every format gets yaml-core key completions, diagnostics, and hover for free.

**Semantic completions (follow-up issues):**
These require document-aware intelligence beyond the schema walker:

| Completion type | What it does | Tracked as |
|---|---|---|
| Variable references | `${` → show variables from document's `variables:` section | Follow-up issue |
| Module names | `module:` in imports → show modules defined in `modules:` section | Follow-up issue |
| Cross-module outputs | `${module.alias.` → show imported aliases and their outputs | Follow-up issue |
| forEach variable | `${each.` → show iteration variable name from enclosing forEach | Follow-up issue |

These will be filed as GitHub issues during planning to ensure they're tracked.

---

## 3. Builder integration

### 3.1 Builder workbench for the tutorial

The existing `pages-builder-shell` provides a full IDE workbench:
- Left panel: tree view (`pages-builder-tree`)
- Center: CodeMirror editor (`pages-code-editor`) with Source/Split/Visual modes
- Right dock: property palette, component palette
- Cross-panel sync: tree click → editor scroll, editor cursor → tree select
- Undo/redo via string snapshots

The tutorial embeds this workbench for each step. The user edits YAML in the editor, sees the tree update, and sees the visual preview render the page.

### 3.2 Tree view for yaml-core constructs

`builder-tree` currently shows page-specific nodes (pages, rows, columns, components, datasets). For yaml-core-enhanced pages, it needs additional node types:

| Node type | Icon | Shows |
|---|---|---|
| Modules section | `library_books` | Top-level `modules:` group |
| Module definition | `extension` | Individual module with parameter count |
| Imports section | `input` | Top-level `imports:` group |
| Import entry | `link` | Module alias + target module name |
| Variables section | `data_object` | Top-level `variables:` group |
| forEach indicator | `repeat` | Badge on elements with `forEach:` |

Adding these requires changes across two layers:

**1. PageDocument accessors (packages/pages-document):** Add read-only accessor methods for yaml-core sections. These return raw map data — they do NOT need full typed node classes (like `ModuleNode`) because the initial integration is read-only tree display, not CRUD operations through the document model.

```typescript
// New methods on PageDocument
getModules(): Record<string, Record<string, unknown>> | undefined;
getImports(): Record<string, unknown>[] | undefined;
getVariables(): Record<string, unknown> | undefined;
```

**2. Tree model builder (packages/pages-builder):** New `buildModuleNode()`, `buildImportNode()`, `buildVariableNode()` functions that produce `TreeNodeInfo` from the raw maps. The `TreeNodeType` union extends from `'page' | 'row' | ... | 'section'` to include `'module' | 'import' | 'variable'`.

**3. buildTreeModel():** Updated to call the new PageDocument accessors and build yaml-core tree nodes before the existing page nodes.

Note: Full typed node classes (`ModuleNode` with parameter editing, `ImportNode` with alias management) are deferred — they're needed when the builder supports editing yaml-core constructs through the property palette, which is beyond the initial tutorial scope.

### 3.3 Visual preview with yaml-core expansion

The builder's visual preview pane needs to show the EXPANDED result — the page as it would render after yaml-core processing:

1. User edits yaml-core YAML in the editor
2. `yaml-core.expand()` preprocesses the map (debounced, ~1ms for tutorial-sized YAML)
3. Expanded map is parsed by the page parser
4. `renderPreview` callback renders the page in the visual pane

The editor shows the pre-expansion YAML (what the user is authoring). The visual preview shows the post-expansion result (what the runtime would render). The tree view shows the pre-expansion structure (including module/import/variable nodes).

**forEach preview click behavior:** After forEach expansion, multiple visual components map to a single forEach template in the CST. The existing `_wirePreviewClicks()` uses `_findFirstComponentPathByType` which walks the document model — this 1:1 mapping breaks for expanded elements. Initial behavior: clicking any forEach-expanded component in the visual preview selects the forEach template in the editor and tree. This is implemented by adding a `data-template-id` attribute to expanded elements during preview rendering, which maps back to the template's CST path. Full per-iteration source mapping (tracking `{templateId, iterationValue}` provenance) is designed in §5 and tracked as a follow-up issue.

---

## 4. Tutorial design

### 4.1 Learning path

15 steps teaching yaml-core through building progressively complex pages. Each step uses the builder workbench with editable CodeMirror + tree view + visual preview.

**Dependency:** The tutorial requires yaml-core runtime integration in pages (§2.4) and builder integration (§3) to function. It cannot be built or shipped independently — see §7 issue decomposition for the ordering.

| Step | Concept | What the user builds |
|---|---|---|
| 1 | YAML basics | Minimal page: title component, inline data |
| 2 | Structure | Multi-component page: title + chart + table |
| 3 | Datasets | External data binding, dataset references |
| 4 | Variables | `${var.theme}`, `${var.dataset}` — parameterize properties |
| 5 | Variable scoping | Prefixed sources, defaults `${var.x:-fallback}` |
| 6 | ForEach basics | Generate 3 metric cards from `forEach: {as: field, in: [...]}` |
| 7 | ForEach with data | CSV data source driving card generation |
| 8 | Modules intro | Extract a "metric row" into a reusable module |
| 9 | Module parameters | Typed params: STRING, INTEGER, LIST with validation |
| 10 | Module imports | Import the metric module 3× for different datasets |
| 11 | Module outputs | `${module.sales.dataset-id}` — cross-module wiring |
| 12 | Conditionals | `when:` guards — show/hide sections based on data |
| 13 | Composition | Multiple modules composing a full dashboard |
| 14 | Iteration groups | Named groups for coordinated forEach expansion |
| 15 | Full application | All features: multi-page, modules, forEach, conditions, data |

### 4.2 Tutorial step format

yaml-editor tutorials use a SEPARATE type hierarchy from existing scenario-based tutorials. The existing `TutorialSection` requires `steps: ScenarioStep[]` (aria/graphql/simulated commands) — yaml-editor sections have a fundamentally different interaction model (user edits YAML, system validates, tutorial advances on success). Forcing yaml-editor sections into `TutorialSection` would require carrying empty `steps: []` arrays and would not model the validation-based progression.

```typescript
// packages/pages-aria/src/tutorial/types.ts — NEW types

interface YamlEditorSection {
  title: string;
  content?: SectionContent;     // reuses existing SectionContent type
  initialYaml: string;          // starting YAML for the editor
  expectedKeys?: string[];      // keys that must be present in the pre-expansion YAML
  expectedStructure?: Record<string, unknown>;  // structural pattern the EXPANDED map must match (deep subset assertion)
  hint?: string;                // shown if user is stuck
  solutionYaml?: string;        // correct answer (shown on request)
  buildOnPrevious?: boolean;    // if true, carry forward the user's YAML from the previous step
}

interface YamlEditorScenario extends ScenarioBase {
  sections: YamlEditorSection[];
}
```

**Validation:** "Did the user get it right?" is checked in order:
1. YAML parses without errors (syntax valid)
2. LSP diagnostics are zero (schema valid against the format schema — validates pre-expansion document)
3. `expectedKeys` present in the pre-expansion parsed map (e.g., `["variables", "modules"]` for step 8)
4. yaml-core `expand()` in lenient mode returns zero diagnostics (no unresolved variables, valid parameters)
5. `expectedStructure` deep-subset matches the EXPANDED map — validates the post-expansion result has the expected shape

`expectedStructure` is a JSON object pattern. The runner performs a recursive subset assertion: every key-value in `expectedStructure` must exist in the expanded map with a matching value. Array values use **multiset matching**: each pattern element must match a distinct element in the expanded array. Once a result element is matched by a pattern, it is consumed and not available for subsequent pattern matches. This ensures duplicate patterns (e.g., three `{type: "metric"}` entries) require three distinct matching elements, not just one. Example:

```yaml
# Step 6: verify forEach produced 3 metric cards
expectedStructure:
  pages:
    - components:
        - type: "metric"
        - type: "metric"
        - type: "metric"
```

This validates the expansion result without requiring the user's YAML to match character-for-character — it checks structure, not syntax.

**Runner:** A new `runYamlEditorScenario()` function handles yaml-editor tutorials separately from `runSectionedScenario()`. Key differences:

| Concern | SectionedScenario runner | YamlEditorScenario runner |
|---|---|---|
| Progression | Automatic — steps execute in sequence | User-driven — advances when validation passes |
| Interaction | Aria commands fill/click/select | User edits YAML in CodeMirror editor |
| State events | `scenario:state` with step info | `scenario:state` with validation status |
| Section transition | Automatic after last step | User clicks "Next" after validation passes, or "Show Solution" |
| Content display | Narrative markdown panel | Narrative markdown panel + builder workbench |

The tutorial host dispatches to the appropriate runner based on `contentType`:

```typescript
// tutorial-host.ts — contentType dispatch
if (descriptor.contentType === 'yaml-editor') {
  this._runner = runYamlEditorScenario(parsed as YamlEditorScenario, {
    eventTarget: this._eventTarget,
    contentBase: tutorialDir,
    renderPreview: (yaml) => { /* render expanded page */ },
  });
} else {
  this._runner = runSectionedScenario(parsed as SectionedScenario, { ... });
}
```

**Builder workbench:** Embedded ONCE for the entire yaml-editor tutorial, not per-section. Each step loads its `initialYaml` (or carries forward the user's YAML if `buildOnPrevious: true`). The workbench persists across step transitions — tree view, editor, and visual preview all update when the step changes.

**Dependency integration:** `pages-aria` does NOT add a dependency on `pages-builder`. The tutorial host renders `<pages-builder-shell>` as an untyped custom element tag — standard LitElement cross-package composition. Custom elements are globally registered; the host doesn't need to import the class, only emit the tag.

Integration contract:
- The consuming application (e.g., webapp or host page) must import both `@casehubio/pages-aria/tutorial` (registers `<pages-tutorial-host>`) and `@casehubio/pages-builder` (registers `<pages-builder-shell>`) before rendering a yaml-editor tutorial.
- Property binding uses LitElement's untyped dot-syntax: `.yaml=${...}`, `.renderPreview=${...}`. At runtime these are direct property assignments on the DOM element — no TypeScript import required.
- Event binding uses `@change=${...}` for validation callbacks.
- If `<pages-builder-shell>` is not registered when the tutorial host renders a yaml-editor section, the host displays a fallback message: "Builder workbench not available — import @casehubio/pages-builder."

This is the idiomatic pattern for LitElement projects — `pages-aria`'s `standalone.ts` bundle already uses this approach (importing only its own components). The consuming application is the composition root that wires packages together.

### 4.3 Tutorial infrastructure integration

The tutorial uses the existing `pages-tutorial-host` and `pages-tutorial-catalog` infrastructure:

- `TutorialDescriptor` registers the learning path in the catalog
- `LearningPath` groups the 15 steps
- `SectionedPlaybook` format wraps each step's content + validation
- The builder workbench replaces the narrative+controller UI for this tutorial type

A new `contentType: 'yaml-editor'` distinguishes this from existing `'slides-only'` and `'hands-on'` tutorials. This requires:

1. **Type update:** `TutorialDescriptor.contentType` extends from `'slides-only' | 'hands-on'` to `'slides-only' | 'hands-on' | 'yaml-editor'`
2. **Build script update:** `build-tutorial-registry.mjs` currently auto-detects contentType by checking for `steps` in sections. yaml-editor sections have `initialYaml` instead of `steps`. Detection logic: if any section has `initialYaml`, contentType is `'yaml-editor'`; else if any section has non-empty `steps`, it's `'hands-on'`; else `'slides-only'`.
3. **Tutorial host dispatch:** `pages-tutorial-host` dispatches to `runYamlEditorScenario()` for `yaml-editor` content type, rendering the builder workbench instead of scenario narrative + controller (see §4.2 for runner design).
4. **Catalog card:** The existing catalog card already renders contentType as a chip — adding `'yaml-editor'` just requires a new chip color/label mapping.

### 4.4 Build and registry

The existing `scripts/build-tutorial-registry.mjs` scans `tutorials/` and produces `dist/tutorial-registry.json`. The new tutorial lives at:

```
tutorials/
  yaml-composition/
    tutorial.yaml          # descriptor + learning path
    steps/
      01-yaml-basics.yaml  # initial YAML + validation + content
      02-structure.yaml
      ...
      15-full-application.yaml
    content/
      01-intro.md          # narrative markdown per step
      ...
```

---

## 5. Diagram support for yaml-core documents

For SWF and Case documents that use yaml-core constructs, the diagram tool shows a **read-only expanded view**:

1. User edits yaml-core-enhanced SWF/Case YAML in the format-specific editor
2. `yaml-core.expand()` produces the expanded document
3. The format's diagram renderer (React Flow + ELK) renders the expanded result
4. Click-to-source navigates from an expanded node back to the template in the editor

**Source mapping:** The expansion result needs to retain provenance — which forEach template + iteration value produced each expanded element. This requires extending `ForEachExpander` to record source mappings in a `Map<expandedId, {templateId, iterationValue}>`.

**Scope:** This is a follow-up concern. The initial integration focuses on pages. SWF/Case diagram support comes after yaml-core expansion is proven.

---

## 6. Package and dependency structure

```
@casehubio/yaml-core (NEW)
  ├── src/
  │   ├── variable-resolver.ts
  │   ├── foreach-expander.ts
  │   ├── module-expander.ts
  │   ├── truthiness.ts
  │   ├── csv-parser.ts
  │   ├── parameter-validator.ts
  │   ├── expand.ts              ← public API: expand(map, options?) → ExpandResult {map, diagnostics}
  │   ├── types.ts               ← ForEachDirective, YamlModule, etc.
  │   └── schema.generated.ts    ← Zod from JSON Schema fragments
  ├── package.json
  └── vitest.config.ts

Dependencies:
  @casehubio/yaml-core → zod (for generated Zod schemas from JSON Schema fragments)
  @casehubio/pages-schema → @casehubio/yaml-core (for yamlCoreElementMixin)
  @casehubio/pages-ui → @casehubio/yaml-core (for expand() in parser pipeline)
  @casehubio/pages-lsp → @casehubio/yaml-core (for schema composition)
  @casehubio/pages-builder → @casehubio/yaml-core (for expansion in visual preview)
```

---

## 7. Issue decomposition

This design decomposes into ordered implementation issues:

| Order | Issue | Depends on | Scale |
|---|---|---|---|
| 1 | TypeScript port of yaml-core (VariableResolver, ForEachExpander, ModuleExpander, Truthiness, CsvParser, ParameterValidator) + conformance tests | — | L |
| 2 | json-schema-to-zod build step: generate yaml-core Zod schemas from JSON Schema fragments | Issue 1 | S |
| 3 | Schema composition: z.intersection() in pages-lsp page format + componentBase element mixin | Issue 2 | S |
| 4 | Pages runtime integration: yaml-core.expand() preprocessing in page-parser pipeline | Issue 1 | M |
| 5 | Builder tree: yaml-core node types — PageDocument accessors + tree model builder + TreeNodeType extension | Issue 4 | L |
| 6 | Builder visual preview: expansion + re-render on edit | Issues 4, 5 | M |
| 7 | Tutorial infrastructure: `yaml-editor` content type, YamlEditorSection/YamlEditorScenario types, runYamlEditorScenario runner, tutorial-host dispatch, build-tutorial-registry update | Issues 4, 5, 6 | M |
| 8 | Tutorial content: 15-step learning path with YAML examples + validation + narrative | Issue 7 | L |
| 9 | Schema composition for blocks-ui formats (case, swf, htn, org) | Issue 3 | S |
| 10 | Follow-up: LSP semantic completions (variable refs, module names, cross-module outputs) | Issues 3, 4 | M |
| 11 | Follow-up: read-only expanded diagram for SWF/Case | Issues 4, 9 | L |
| 12 | Follow-up: J2CL evaluation for yaml-core migration (pages#344 context) | Issue 1 | S |

---

## 8. Follow-up issues (must be tracked)

These items are explicitly deferred but must be filed as GitHub issues:

1. **LSP variable reference completions** — `${` → show available variables
2. **LSP module name completions** — `module:` in imports → show defined modules
3. **LSP cross-module output completions** — `${module.alias.` → show outputs
4. **LSP forEach variable completions** — `${each.` → show iteration variable
5. **Read-only expanded diagram for SWF/Case** with click-to-source navigation
6. **ForEach source mapping** — provenance tracking in expansion results
7. **J2CL evaluation** — assess migration when pages#344 builds the pipeline
8. **LSP expansion diagnostics** — run yaml-core `expand()` in lenient mode and report `ExpansionDiagnostic[]` as workspace diagnostics (unresolved variables, invalid parameters, circular modules, unknown prefixes)

---

## References

- `platform/yaml-core/src/main/java/io/casehub/yaml/core/` — Java source (VariableResolver, ForEachExpander, ModuleExpander)
- `platform/yaml-core/src/main/resources/schema/*.schema.json` — JSON Schema fragments (6 files)
- `casehubio/platform#247` — shared yaml-core extraction (closed, established J2CL-compatible constraint)
- `casehubio/casehub-pages#344` — J2CL transpilation strategy (open, XL/High, deferred)
- `casehubio/casehub-pages#428` — visual YAML builder (completed, builder-shell infrastructure)
- `packages/pages-lsp/src/schema-navigation.ts` — LSP completion engine (handles ZodObject, ZodIntersection, ZodDiscriminatedUnion)
- `packages/pages-lsp/src/schema-registry.ts` — format registration system
- `packages/pages-lsp/src/formats/page.ts` — page format registration
- `packages/pages-builder/src/shell/builder-shell.ts` — builder workbench (tree + editor + visual preview)
- `packages/pages-builder/src/shell/yaml-sync.ts` — bidirectional editor ↔ document sync
- `packages/pages-document/src/page-document.ts` — CST-backed page document model
- `packages/pages-aria/src/tutorial/tutorial-host.ts` — tutorial runner infrastructure
- `packages/pages-aria/src/tutorial/types.ts` — TutorialDescriptor, LearningPath types
- `packages/pages-code-editor/src/pages-code-editor.ts` — CodeMirror 6 editor component
- GE-20260912-3804f6 — CST-backed typed facade pattern
- GE-20260905-5986c1 — CodeMirror 6 Compartment pattern for LitElement
- GE-20260905-3e4256 — drawSelection() required in shadow DOM
- GE-20260907-6fdc04 — tooltip override cascade in shadow DOM
