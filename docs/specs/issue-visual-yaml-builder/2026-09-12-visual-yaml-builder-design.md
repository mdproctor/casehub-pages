# Visual YAML Builder — Design Specification

**Date:** 2026-09-12
**Status:** Draft
**Scope:** Phase 1 (page builder) detailed; Phase 2+ (project graph, agentic AI layers) architecture
**Supersedes:** #93 (Layout editor — drag-and-drop dashboard authoring UI)
**Epic:** Filed as new epic — scope spans all CaseHub layers, not just pages

## Problem

CaseHub adopts a YAML-first authoring model across pages, case definitions, agentic
patterns, cognitive profiles, org structures, and work orchestration. The CodeMirror
editor with schema-driven autocomplete addresses syntax, but does not address the
harder problems: discoverability (what components/capabilities exist?), structural
composition (how do I nest rows, columns, and components?), cross-document wiring
(does this reference actually resolve?), and the cold-start problem (where do I begin?).

Users need a visual builder that:

1. Makes the full component/capability catalogue discoverable without memorising type names
2. Guides structural composition through drag-and-drop and contextual palettes
3. Validates cross-document references at authoring time
4. Works as a complete authoring environment — users who never open the YAML pane are not second-class
5. Creates a natural gradient from fully visual to fully textual, so users learn YAML without being forced into it

## Architecture

### Canonical Model: CST-Backed Typed Facade

The YAML Concrete Syntax Tree (CST) is the single source of truth. A typed facade
wraps a live `Document` object (from the `yaml` library), providing structural
operations that perform format-preserving mutations directly on the held document.
The visual builder interacts with the facade, never touching the CST directly.

**Why CST, not a semantic model:**
- Format-preserving — comments, whitespace, and author formatting survive edits
- Single truth — no model/YAML divergence risk
- Bidirectional sync is natural — both visual and text views operate on the same CST
- Existing infrastructure — schema-navigation, completion, and diagnostics in `pages-lsp` already traverse Zod schemas against YAML documents

**Relationship to existing `yaml-edits.ts` primitives:**

The existing `yamlSetOrDelete`, `yamlSwitchVariant`, and `yamlAppendWithUniqueName`
in `pages-lsp/src/refactoring/yaml-edits.ts` operate as `(yaml: string, ...) → string` —
each call re-parses and re-serializes. These remain unchanged for the LSP's string-based
callers (diagnostics, completions, rename refactoring).

The facade does NOT delegate to these string-based functions. Instead, it holds a single
`Document` object across its lifetime and performs mutations directly on it via the
`yaml` library's `Document.setIn()`, `Document.deleteIn()`, `Document.addIn()`, and
`Document.createNode()` methods. This eliminates the parse/serialize overhead on every
mutation and enables the "node objects hold CST paths" design.

When the text editor changes, the facade re-parses into a new `Document`. When the
visual builder mutates, the facade calls `Document.toString()` to push the updated
text to the editor. The `Document` object is the single shared state.

```
Visual Builder UI (Lit web components)
  │
  ▼
Document Facade (typed API per document type)
  │
  ▼
Live YAML Document object (parseDocument from 'yaml' library)
  │
  ▼
Code Editor (pages-code-editor, CodeMirror 6)
```

### Type-Safe Cross-Document References

Reference fields are typed, not strings. A binding's capability field is a
`CapabilityRef` that resolves against declared capabilities. A worker's agentId
is an `AgentRef` that resolves against Eidos agent profiles. The project graph
validates all references and supports rename-refactoring across files.

This is a core CaseHub differentiator: multi-document projects get the same
type safety that single-file languages take for granted.

---

## Phase 1: Page Builder

### Document Facade — `PageDocument`

Lives in the new `pages-document` package (shared between `pages-lsp` and
`pages-builder`). Wraps a live YAML `Document` object and exposes typed
operations for page composition.

```typescript
class PageDocument {
  static parse(yaml: string): PageDocument
  static empty(): PageDocument

  toString(): string

  // Diagnostics — parse errors and schema violations
  readonly diagnostics: readonly Diagnostic[]

  // Structure
  getPages(): PageNode[]
  getDatasets(): DatasetNode[]
  getNavTree(): NavTreeNode | undefined
  getProperties(): Record<string, string>

  // Mutations
  addPage(name: string): PageNode
  removePage(index: number): void
  addDataset(uuid: string, defaults?: Partial<DatasetDef>): DatasetNode
  removeDataset(index: number): void
  setProperty(key: string, value: string): void

  // Navigation tree mutations
  addNavItem(parentPath: number[], item: { type?: 'GROUP' | 'ITEM'; id?: string; page?: string }): void
  removeNavItem(path: number[]): void
  moveNavItem(fromPath: number[], toPath: number[]): void

  // Undo/redo
  undo(): boolean
  redo(): boolean
  canUndo(): boolean
  canRedo(): boolean

  // Change notification
  onChange(listener: (yaml: string) => void): Unsubscribe
}

interface Diagnostic {
  readonly severity: 'error' | 'warning' | 'info'
  readonly message: string
  readonly range: { start: Position; end: Position }
}

interface NavTreeNode {
  readonly type?: 'GROUP' | 'ITEM'
  readonly id?: string
  readonly page?: string
  readonly children: NavTreeNode[]

  // Mutations
  setPage(page: string): void
  setId(id: string): void
  addChild(item: { type?: 'GROUP' | 'ITEM'; id?: string; page?: string }): NavTreeNode
  removeChild(index: number): void
}
```

**Parse semantics:** `PageDocument.parse()` always returns a `PageDocument`, even
for invalid YAML. When the input is syntactically invalid or doesn't conform to the
dashboard schema, the document holds whatever structure could be extracted, and
`diagnostics` contains the errors. The facade is always in a usable state — the
tree shows partial structure, and the property panel still works for valid nodes.
This is critical for bidirectional sync: a user typing mid-expression produces
temporarily invalid YAML that must not blow up the visual side.

**Undo/redo strategy:** String snapshots with mode-aware dispatch.

*Snapshot mechanism:* Each visual mutation pushes the pre-mutation `toString()`
result onto the facade's undo stack. Undo replaces the held `Document` by
re-parsing the snapshot string. For typical page YAML (5-50KB), `parseDocument()`
completes in <1ms. Stack limit: 50 entries. This is the simplest correct approach —
operational transform patches add implementation complexity without meaningful
performance benefit at page-document scale.

*Mode-aware undo:* Two independent undo stacks operate on the same document:

1. **Facade stack** — string snapshots pushed on each visual mutation (tree,
   palette, property panel). Operation-level granularity: "add component",
   "set property", "move node".
2. **CodeMirror history** — built-in `history()` extension recording text edits.
   Character-level granularity with automatic grouping by typing session.

`Ctrl+Z` / `Ctrl+Shift+Z` dispatch to whichever stack owns the focused panel:
- YAML pane focused → CodeMirror handles undo/redo (character-level text undo)
- Tree, palette, or property panel focused → facade handles undo/redo (operation-level)

*Cross-mode synchronization:* When focus moves from the YAML pane to a visual panel
(tree, palette, property panel), the facade captures the current document state as
a synchronization snapshot. This ensures the facade stack stays coherent with any
text changes the user made — visual undo starts from the current document, not from
a stale pre-text-edit state. Conversely, when the facade pushes updated text to
CodeMirror (after a visual mutation), CodeMirror records it in its own history.

*Cross-mode limitation:* Visual undo cannot undo text edits, and text undo cannot
undo visual mutations. This matches how multi-panel editors (VS Code, IntelliJ)
handle undo across independent editing surfaces. The user's mental model is
"undo my last action in this panel." The spec intentionally does not attempt a
unified undo stack — the granularity mismatch (operation-level vs character-level)
makes unification both complex and confusing to the user.

```typescript
type LayoutMode = 'rows' | 'columns' | 'flat'

interface PageNode {
  readonly path: readonly (string | number)[]
  name: string

  // Layout mode
  getLayoutMode(): LayoutMode
  setLayoutMode(mode: LayoutMode): void

  // Structure — all three layout models
  getRows(): RowNode[]
  getColumns(): ColumnNode[]
  getComponents(): ComponentNode[]

  // Mutations
  addRow(): RowNode
  addColumn(span?: number): ColumnNode
  addComponent(type: string, props?: Record<string, unknown>): ComponentNode
  removeChild(index: number): void

  // Page-level configuration
  getSettings(): PageSettings
  setSettings(settings: Partial<PageSettings>): void
  getDataScope(): DataScope | undefined
  setDataScope(scope: DataScope | undefined): void
  getSaveConfig(): SaveConfig | undefined
  setSaveConfig(config: SaveConfig | undefined): void
}

interface RowNode {
  readonly path: readonly (string | number)[]
  getColumns(): ColumnNode[]
  addColumn(span?: number): ColumnNode
  removeColumn(index: number): void
  getProperties(): Record<string, unknown>
  setProperty(key: string, value: unknown): void
}

interface ColumnNode {
  readonly path: readonly (string | number)[]
  span: number
  getComponents(): ComponentNode[]
  addComponent(type: string, props?: Record<string, unknown>): ComponentNode
  removeComponent(index: number): void
  getProperties(): Record<string, unknown>
  setProperty(key: string, value: unknown): void
}

interface DatasetNode {
  readonly path: readonly (string | number)[]
  uuid: string
  name: string | undefined

  // Source — exactly one of url, content, join, serverQuery
  getSource(): 'url' | 'content' | 'join' | 'serverQuery'
  url: string | undefined
  content: string | undefined

  // HTTP configuration (when source is url)
  method: string | undefined
  headers: Record<string, string> | undefined

  // Columns
  getColumns(): { id: string; name?: string; type: string }[]
  addColumn(id: string, type: string, name?: string): void
  removeColumn(index: number): void

  // Caching and refresh
  cacheEnabled: boolean | undefined
  refreshTime: string | undefined
  keyColumn: string | undefined

  // Generic property access
  getProperties(): Record<string, unknown>
  setProperty(key: string, value: unknown): void
}
```

**Layout mode semantics:** A page uses exactly one layout model at a time:
- `rows` — `rows[]` contains `columns[]` contains components (default for new pages)
- `columns` — `columns[]` contains components directly (no row grouping)
- `flat` — `components[]` at page level (simple layout, no grid)

`getLayoutMode()` inspects which top-level key is present. `setLayoutMode()`
migrates the structure: e.g., switching from `flat` to `rows` wraps existing
components in a single row with one column. `addRow()` on a `flat` page
automatically converts to `rows` mode.

**RowNode / ColumnNode:** Mirror the document schema's `rowSchema` and
`columnSchema`. `RowNode` has columns; `ColumnNode` has components and a `span`
(default 12 for full-width). Both have a generic `properties` bag for CSS
pass-through. These nodes are critical for the outline tree — the
Row → Column → Component hierarchy is the primary layout model for multi-column
dashboards.

**DatasetNode:** Mirrors `externalDataSetDefSchema` from `@casehubio/pages-data`.
Exposes typed access to the dataset's source (`url`, `content`, `join`,
`serverQuery`), HTTP configuration, column definitions, caching, and refresh
settings. Selecting a dataset in the outline tree populates the property panel
with dataset configuration.

```typescript
interface ComponentNode {
  readonly path: readonly (string | number)[]
  type: string

  // Properties — includes both base (id, style, visibleWhen) and type-specific
  getProperties(): Record<string, unknown>
  setProperty(key: string, value: unknown): void
  removeProperty(key: string): void

  // Schema — returns FieldSchema (JSON Schema subset) for property panel integration
  getSchema(): FieldSchema

  // Container children — type-specific YAML structure, abstracted by descriptors
  isContainer(): boolean
  getChildren(): ContainerChildren
  addChild(slotName: string, type: string, props?: Record<string, unknown>): ComponentNode
  removeChild(slotName: string, index: number): void

  // Tree operations
  moveToIndex(parent: { path: readonly (string | number)[]; slot?: string }, index: number): void
  duplicate(): ComponentNode
}
```

### Container Child Model

Container components (tabs, sidebar, accordion, split, form-scope) hold children
in type-specific YAML keys that differ per container type. The Zod schemas for
these types are intentionally empty — they model only `properties`, not the
structural keys that hold children. The children are parsed by
`component-desugar.ts` into the runtime `Component.slots` record.

The facade bridges this gap with a **container child descriptor registry** — a
static mapping table that tells the facade how each container type structures its
children in YAML:

```typescript
interface ContainerChildDescriptor {
  type: string
  slots: SlotDescriptor[]
}

type SlotDescriptor =
  | { kind: 'named-record'; yamlKey: string; childKey: 'components' }
  | { kind: 'array'; yamlKey: string }
  | { kind: 'nested-array'; yamlKey: string; childKey: string }

// Registry — derived from component-desugar.ts parsing logic
const CONTAINER_DESCRIPTORS: ContainerChildDescriptor[] = [
  // tabs/pills/accordion — named entries with components
  // YAML: tabs: { "Tab 1": { components: [...] } }
  { type: 'tabs', slots: [{ kind: 'named-record', yamlKey: 'tabs', childKey: 'components' }] },
  { type: 'pills', slots: [{ kind: 'named-record', yamlKey: 'tabs', childKey: 'components' }] },
  { type: 'accordion', slots: [{ kind: 'named-record', yamlKey: 'tabs', childKey: 'components' }] },

  // sidebar — two array slots (nav + main)
  // YAML: sidebar: [...nav...], content: [...main...]
  { type: 'sidebar', slots: [
    { kind: 'array', yamlKey: 'sidebar' },
    { kind: 'array', yamlKey: 'content' },
  ]},

  // split — children nested under the split config key
  // YAML: split: { direction: ..., children: [...] }
  { type: 'split', slots: [{ kind: 'nested-array', yamlKey: 'split', childKey: 'children' }] },

  // form-scope — children nested under the form-scope config key
  // YAML: form-scope: { dataset: ..., components: [...] }
  { type: 'form-scope', slots: [{ kind: 'nested-array', yamlKey: 'form-scope', childKey: 'components' }] },

  // carousel/stack/menu/tree — same named-record pattern
  { type: 'carousel', slots: [{ kind: 'named-record', yamlKey: 'sections', childKey: 'components' }] },
  { type: 'stack', slots: [{ kind: 'named-record', yamlKey: 'sections', childKey: 'components' }] },
  { type: 'menu', slots: [{ kind: 'named-record', yamlKey: 'sections', childKey: 'components' }] },
  { type: 'tree', slots: [{ kind: 'named-record', yamlKey: 'sections', childKey: 'components' }] },
]
```

**Why descriptors instead of extending the schemas:**

The Zod schemas model `properties` — the configuration surface of each component.
Container children are structural keys at the component level in YAML, not
properties. They belong to a different concern: layout structure, not component
configuration. Mixing them into the property schemas would conflate validation
(which operates on the `properties` key) with structural composition (which
operates on sibling keys like `tabs:`, `sidebar:`, `content:`).

The descriptor registry is a static, declarative mapping derived from the existing
`component-desugar.ts` parsing logic. It lives in `pages-document` alongside the
facade and provides exactly the knowledge the facade needs: given a component type,
what YAML keys hold its children, and how are they structured.

**`ContainerChildren` return type:**

```typescript
interface ContainerChildren {
  // For named-record slots (tabs/pills/accordion): name → children
  // For array slots (sidebar, split, form-scope): slotKey → children
  slots: Record<string, ComponentNode[]>
  descriptor: ContainerChildDescriptor
}
```

`addChild(slotName, type, props)` uses the descriptor to determine the correct
YAML mutation: for `tabs`, it adds a named entry under the `tabs:` key; for
`split`, it appends to the `children:` array inside the `split:` key; for
`sidebar`, it appends to either `sidebar:` or `content:` depending on the slot
name. The facade handles the YAML structure — callers work with logical slot names.

### Component YAML Format

The YAML parser (`component-desugar.ts`) accepts multiple component representations:
canonical (`{type, properties}`), shorthand (`{html: "..."}`, `{title: "..."}`),
and legacy displayer format (`{displayer: {type: BARCHART}}`).

The facade always emits the **canonical format** when creating new components:

```yaml
- type: bar-chart
  properties:
    subtype: column
    lookup: { uuid: sales_tx }
```

This format aligns with the `componentSchema` discriminated union in
`document-schema.ts`, which models `type` + `properties`. Existing
shorthand-format documents parse correctly (the parser handles all variants),
but visual builder mutations produce the canonical form. This ensures:
1. New components are always schema-valid
2. Consistent YAML representation for builder-created content
3. No implicit knowledge of shorthand formats in the facade

### Move Operations

`ComponentNode.moveToIndex()` replaces the generic `moveTo()` with explicit
parent+index semantics:

```typescript
moveToIndex(
  parent: { path: readonly (string | number)[]; slot?: string },
  index: number,
): void
```

**Semantics:**

1. **Within-container reorder:** Same parent path, different index. The facade
   removes the component from its current position and inserts it at the target
   index within the same array/record.

2. **Cross-container move:** Different parent path. The facade removes from source
   and inserts at target. For named-record containers (tabs), `slot` names the
   target entry.

3. **Cross-page move:** The parent path can reference a different page. The facade
   validates that the target path exists and accepts components.

4. **Atomicity:** Move is a single undo step. Internally it's remove + insert on
   the live Document, but only one string snapshot is pushed to the undo stack
   (the pre-move state).

5. **Validation:** The facade validates that the target accepts components (it's a
   column, slot, or flat-component array — not a row or dataset). Invalid moves
   throw.

The outline tree's drag-and-drop maps directly: drag source is the component's
current path, drop target provides parent path + index. The tree calculates the
index from the drop position relative to sibling nodes.

**Schema bridge:** `ComponentNode.getSchema()` returns `FieldSchema` (the JSON
Schema subset from `@casehubio/pages-component`), not `z.ZodType`. The facade
converts from the Zod schemas in `componentSchemaRegistry` to `FieldSchema` at
construction time, merging the type-specific schema with `componentBase` fields
(`id`, `style`, `visibleWhen`). This conversion is cached per component type.

The `PagesPropertyPalette` component (which consumes `PropertyPaletteSource` with
`schema: FieldSchema`) receives the output directly — no additional bridge needed
between the facade and the property panel.

**Schema registries clarified:**

The codebase has two schema registries serving different purposes:

1. **`componentSchemaRegistry`** (in `pages-schema/src/schema-registry.ts`) — maps
   component type name → Zod properties schema. The facade uses this to populate
   `getSchema()` (after converting to `FieldSchema`), and the component palette
   uses it to enumerate available component types.

2. **`SchemaRegistry`** (in `pages-lsp/src/schema-registry.ts`) — maps format ID →
   document-level schema with variant dispatching. The YAML pane's completions and
   diagnostics use this. The facade does not interact with this registry.

When the property panel changes a component's `type` via the type switcher dropdown,
the facade calls its own `switchType()` internal method which removes old type-specific
properties and applies defaults from the new type's schema — similar to what
`yamlSwitchVariant` does, but operating on the live Document.

### Builder Shell — `pages-builder-shell`

The orchestrating Lit component that composes tree, property panel, palette,
and YAML pane into the edit-mode experience.

```
┌─────────────────────────────────────────────────────────┐
│  Toolbar: [+ Page] [+ Dataset] [Undo] [Redo] [Preview] │
├──────────────┬──────────────────────────────────────────┤
│  Outline     │  Property Panel                          │
│  Tree        │  (pages-property-palette)                │
│              │                                          │
│  ▼ Datasets  │  Type: [bar-chart ▼]                     │
│    sales_tx  │  Dataset: [sales_transactions ▼]         │
│  ▼ Pages     │  Subtype: [column-stacked ▼]             │
│    ▼ Overview│  ▼ Filter                                │
│      ▼ Row 1 │    Listening: [✓]                        │
│        metric│  ▼ Lookup                                │
│        ...   │    Column: [region ▼]                    │
│              │                                          │
│              │  ┌ Component Palette ──────────────────┐ │
│  [+ Add]     │  │ Layout  Charts  Tables  Forms  ... │ │
│              │  └────────────────────────────────────┘ │
├──────────────┴──────────────────────────────────────────┤
│  ▸ YAML                                           [▾]  │
└─────────────────────────────────────────────────────────┘
```

### Hosting Integration — Edit Mode

The builder integrates into the existing `pages-runtime` hosting model:

**Activation:** `loadSite(container, yaml, { editMode: true })` activates the
builder shell instead of the standard rendering. A toolbar button in the host
application toggles between view mode and edit mode.

**YAML source:** The builder receives YAML from the same source as the renderer —
the host application passes it via `loadSite()`. In DraftHouse/Claudony, this
comes from the file system (via REST API). In standalone mode, from a text area
or file upload.

**Saving:** The builder uses the existing `SaveConfig` adapter infrastructure.
When the user makes changes, the facade emits the updated YAML via `onChange`.
The host application decides persistence: REST PUT for server-backed dashboards,
`localStorage` for development, or file download for standalone.

**Live preview:** The builder shell includes a Preview button that opens a
split view rendering the current YAML in the standard runtime. Changes in the
builder reflect in the preview after a 300ms debounce.

### Outline Tree — `pages-builder-tree`

Renders the page document structure as an interactive tree.

**Node display:**
- Datasets section at top, pages below, navigation at bottom
- Each node shows: component type icon, human-readable label (derived from title/name/lookup.uuid), column span in brackets
- Colour coding by category (charts blue, layout grey, forms green, etc.)
- Container components show nested children (slot contents) as sub-nodes

**Interactions:**
- Click → select node, populate property panel
- Drag → reorder within container or move between containers
- Right-click → context menu (Add child, Duplicate, Delete, Wrap in row/column)
- `+` button on containers → opens component palette

**Label derivation:**
- `title` components → `properties.text`
- Data components → `properties.title` or `properties.lookup.uuid`
- Pages → `name`
- Fallback → component `type`

**Accessibility:** The outline tree implements the ARIA tree pattern using
`RovingTabindexMixin` and `KeyboardShortcutMixin` from `@casehubio/pages-primitives`.
Drag-and-drop operations announce via `LiveRegionMixin`. Keyboard shortcuts: `Enter`
to select, `Delete` to remove, `Ctrl+D` to duplicate, arrow keys to navigate.

### Component Palette — `pages-builder-palette`

A new component (not extending `PagesDiagramPalette`). The diagram palette is
designed for stencil-based diagram editors with flat `PaletteItem[]`. The builder
palette needs category hierarchy, context filtering, prerequisite hints, and
search — fundamentally different from the flat stencil model.

**Categories:** Layout, Charts, Tables & Data, Metrics, Forms, Content, Workbench

**Each entry:**
```typescript
interface ComponentCatalogEntry {
  type: string;
  label: string;
  category: string;
  icon: string;
  description: string;
  defaultProps: Record<string, unknown>;
  contextRelevance(ctx: PaletteContext): 'promoted' | 'normal' | 'hidden' | 'needs-prereq';
  prereqHint?: string;
}
```

**Component source:** The catalog is populated from the `componentSchema`
discriminated union in `document-schema.ts` — not from `componentSchemaRegistry`.
This ensures only components valid in the document schema appear in the palette.
(`graph-canvas` is in `componentSchemaRegistry` but not in `componentSchema` and
must not appear until that discrepancy is resolved — tracked as a separate issue.)

**Contextual filtering:**
- Hard filter: hide entries invalid at the insertion point
- Soft promotion: surface relevant entries first (form components inside form-scope, metrics inside metric-grid)
- Prerequisite hints: data components show "Add a dataset first" when none exist

**Palette context:**
```typescript
interface PaletteContext {
  parentType: string | undefined;
  acceptsComponents: boolean;
  availableDatasets: string[];
  siblingTypes: string[];
}
```

**Accessibility:** The palette uses `RovingTabindexMixin` for keyboard navigation
and `FocusTrapMixin` when opened as a modal overlay.

### Property Panel

Reuses `pages-property-palette` with enhancements:

1. **Type switcher** — dropdown at top showing current component type. Changing it
   calls the facade's internal `switchType()` on the live Document.
2. **Dataset picker** — `lookup.uuid` renders as a dropdown populated from `document.getDatasets()`.
3. **Column mapper** — once a dataset is selected, column-reference fields render as dropdowns populated from that dataset's column definitions.
4. **Filter builder** — structured form: pick column (dropdown), pick function (dropdown from enum), enter args. Not free-text YAML.
5. **Expression helper** — `${expression}` fields show available page properties and a link to define new ones.

**Integration:** The builder constructs a `PropertyPaletteSource` for the selected
node by reading `ComponentNode.getSchema()` (returns `FieldSchema`) and
`ComponentNode.getProperties()` (returns current values). The `onChange` callback
delegates to `ComponentNode.setProperty()`.

### YAML Pane — Progressive Disclosure

Uses `pages-code-editor` (CodeMirror 6) with bidirectional CST sync.

**Collapsed state (default):**
- Thin bar at bottom with "YAML" label and expand chevron
- Subtle highlight on change — invites curiosity

**Expanded state:**
- Resizable splitter, full syntax highlighting, autocomplete, linting
- **Node highlighting** — selecting a tree node highlights and scrolls to the corresponding YAML range
- **Reverse selection** — clicking a YAML key selects the corresponding tree node

**Bidirectional sync:**
```
Visual edit → facade mutation → Document.toString() → onChange fires
  → code editor receives new text (diff-applied, preserves cursor/scroll)

Text edit → code editor 'input' event → debounced (150ms) → facade re-parses Document
  → tree re-renders (diffed — only changed nodes update)
  → property panel updates
  → parse failure: show lint errors via diagnostics, keep last valid tree state
```

**Debounce and incremental updates:**
- Text→visual sync debounces at 150ms — fast enough to feel responsive, slow
  enough to avoid re-parsing mid-keystroke
- Lint markers update immediately on each keystroke (CodeMirror's built-in linter)
- Tree and property panel update only after the debounce settles
- Tree rendering is diffed: only nodes whose CST paths changed are re-rendered

**Teaching gradient:**
1. Build visually, never open pane
2. Open pane, see highlighting as you click — passive learning
3. Make small text edits, see tree update — active learning
4. Copy-paste in YAML for speed — proficiency
5. Work primarily in YAML — mastery

### Package Structure

```
packages/
  pages-document/               # NEW package — shared facade layer
    src/
      page-document.ts          # PageDocument facade
      types.ts                  # Shared node interfaces, Diagnostic
      container-descriptors.ts  # Container child YAML structure registry
      zod-to-fieldschema.ts     # Zod → FieldSchema conversion
    package.json                # depends on: pages-schema, pages-data, yaml

  pages-builder/                # NEW package — visual builder UI
    src/
      shell/
        builder-shell.ts        # Orchestrating shell
        yaml-sync.ts            # Bidirectional sync coordinator
      tree/
        builder-tree.ts         # Outline tree component
      palette/
        builder-palette.ts      # Component palette
        component-catalog.ts    # Category/icon/description/defaults
        palette-context.ts      # Contextual filtering
      data/
        builder-data-panel.ts   # Dataset configuration
      index.ts
    package.json                # depends on: pages-document, pages-property-palette,
                                #   pages-code-editor, pages-primitives

  pages-lsp/src/                # Existing — imports from pages-document
    refactoring/
      yaml-edits.ts             # Existing string-based primitives (unchanged)

  pages-code-editor/            # Existing — YAML pane
  pages-property-palette/       # Existing — property editing
  pages-diagram-palette/        # Existing — stencil palette (NOT used by builder)
  pages-primitives/             # Existing — a11y mixins (RovingTabindex, FocusTrap,
                                #   LiveRegion, KeyboardShortcut)
```

### Testing Strategy

**Facade tests** (`pages-document`):
- CST manipulation: round-trip fidelity (comments, whitespace preserved)
- Structural mutations: add/remove pages, rows, columns, components, datasets
- Row/column grid: add column to row, set span, add component to column
- Dataset configuration: source types (url/content/join/serverQuery), columns, caching
- Undo/redo: snapshot correctness, stack limits
- Layout mode transitions: flat→rows, rows→columns, columns→flat
- Container children: add/remove children per container type (tabs, sidebar, split, form-scope)
- Container descriptors: correct YAML key generation for each container type
- Navigation tree mutations
- Move operations: within-container reorder, cross-column, cross-page, atomicity
- Error handling: invalid YAML, partial documents, schema violations
- Zod→FieldSchema conversion: all component types, base properties merged
- Component creation: canonical format output for all component types

**Sync tests** (`pages-builder`):
- Visual→text: mutation produces expected YAML diff
- Text→visual: YAML edit produces expected tree update
- Race conditions: rapid alternating edits from both sides
- Debounce: updates batch correctly, no intermediate renders

**Component tests** (`pages-builder`):
- Tree rendering: correct nesting, labels, icons
- Tree drag-and-drop: reorder within and across containers
- Palette: category filtering, search, context filtering, prerequisite hints
- Property panel integration: schema flows to palette, changes flow back

**Integration tests** (Playwright):
- End-to-end: build a page visually, verify YAML output
- Bidirectional: edit YAML, verify tree updates
- Undo/redo: visual and keyboard workflows

### Accessibility

The builder leverages the existing `@casehubio/pages-primitives` a11y mixins
(aligned with backlog item #15):

| Component | ARIA Pattern | Primitives Used |
|-----------|-------------|-----------------|
| Outline tree | `tree` / `treeitem` with `aria-expanded` | `RovingTabindexMixin`, `KeyboardShortcutMixin` |
| Component palette | `listbox` with `option` groups | `RovingTabindexMixin`, `FocusTrapMixin` |
| Builder shell | `application` landmark | `KeyboardShortcutMixin` |
| Drag-and-drop | Live announcements | `LiveRegionMixin` |

**Keyboard shortcuts:**
- `Ctrl+Z` / `Ctrl+Shift+Z` — undo / redo
- `Delete` — remove selected node
- `Ctrl+D` — duplicate selected node
- `Ctrl+P` — open component palette
- `Arrow keys` — navigate tree
- `Enter` — select / expand tree node

---

## Phase 2: Project-Level Builder

### Project Graph

A connected view of an entire multi-module CaseHub application. Each file in the
project is parsed into its document facade, and the project graph holds all facades
with cross-reference validation.

```typescript
interface ProjectGraph {
  // Document collections
  orgs: OrgDocument[];
  agents: AgentDocument[];
  cases: CaseDocument[];
  patterns: PatternDocument[];
  cognition: CognitionDocument[];
  worlds: WorldDocument[];
  work: WorkDocument[];
  pages: PageDocument[];

  // Cross-reference resolution
  resolveAgentRef(agentId: string): AgentNode | undefined;
  resolveCapabilityRef(caseName: string, capName: string): CapabilityNode | undefined;
  resolvePatternRef(name: string): PatternNode | undefined;
  resolveDatasetRef(uuid: string): DatasetNode | undefined;

  // Validation
  validateReferences(): TypedValidationError[];

  // Refactoring
  renameSymbol(symbol: TypedSymbol, newName: string): FileEdit[];

  // Navigation
  getReferencesTo(nodeId: string): CrossReference[];
  getReferencesFrom(nodeId: string): CrossReference[];
}
```

### Symbol Infrastructure — Phase 2 Scope

The existing `WorkspaceSymbolIndex` (in `pages-lsp/src/refactoring/workspace-index.ts`)
supports two symbol kinds: `dataset` and `page`, extracted via `pageSymbolExtractor`
from page-format YAML. This is sufficient for Phase 1 (page-only).

Phase 2 cross-document references span Engine, Eidos, and Blocks documents that
live in separate Java repos with their own YAML schemas. Extending to these
requires:

- New `SymbolExtractor` implementations per document type (engine case YAML, eidos agent YAML, blocks pattern YAML)
- A cross-repo index that aggregates symbols from multiple project roots
- Resolution semantics that understand the CaseHub project structure (which repos contribute which symbol kinds)

The CST-backed facade pattern (one `Document` object, typed node API, format-preserving
mutations) applies identically to all YAML document types. The challenge is not the
facade architecture — it's the index infrastructure for cross-repo symbol resolution,
which is Phase 2 design scope.

### Authoring Flow

The project graph surfaces the natural authoring flow for agentic AI applications:

```
1. EIDOS — Define org and agents
   │  Organization YAML: units, relationships, archetypes
   │  Agent profiles: identity, capabilities, disposition
   │
   ▼
2. ENGINE — Define the case
   │  Capabilities, workers, bindings, milestones, goals
   │  Worker types: do | agent | a2a | mcp | react | sequence | forEach
   │
   ▼
3. BLOCKS — Define agent coordination
   │  Pattern YAML: supervisor | parallel | loop | voting | debate | htn
   │  Cognition YAML: drive, mood, personality, memory
   │  World YAML: actions, entities, affordances
   │  Pipeline YAML: event processing, summarisation
   │
   ▼
4. WORK — Define human participation
   │  Templates, progress definitions, SLA escalation
   │
   ▼
5. NEOCORTEX — Wire cognitive capabilities
   │  Cognitive profiles, CBR memory, RAG configuration
   │
   ▼
6. PAGES — Build the UI
      Layouts, components, data pipelines, navigation
```

### Cross-Document Reference Types

| Reference | From | To | Validation |
|-----------|------|----|------------|
| `CapabilityRef` | Engine binding | Engine capability | Name must exist in same case |
| `WorkerRef` | Engine binding | Engine worker | Worker must claim the capability |
| `AgentRef` | Engine worker | Eidos agent | AgentId must resolve to a profile |
| `PatternRef` | Engine worker (composed) | Blocks pattern | Pattern must exist |
| `DispositionRef` | Neocortex cognitive profile | Eidos disposition | Derivation chain |
| `DatasetRef` | Pages component | Pages/Engine dataset | UUID must resolve |
| `ActionRef` | Blocks world action | Engine capability | Name alignment |
| `TemplateRef` | Engine humanTask | Work template | Candidate group wiring |

### Document Facades Per Layer

Each layer gets its own facade class following the same CST-backed pattern:

| Layer | Facade | Key Operations |
|-------|--------|----------------|
| Eidos | `OrgDocument` | Add/remove units, wire relationships, apply archetype |
| Eidos | `AgentDocument` | Set capabilities, disposition sliders, Jungian profile |
| Engine | `CaseDocument` | Capability/worker/binding triad, milestone/goal, planning strategy |
| Blocks | `PatternDocument` | Recursive agent composition, routing, termination |
| Blocks | `CognitionDocument` | Drive/mood/personality tuning |
| Blocks | `WorldDocument` | Actions, entities, affordances |
| Blocks | `PipelineDocument` | Source, levels, summarisers |
| Work | `WorkDocument` | Templates, progress stages, SLA |
| Neocortex | `CognitiveProfileDocument` | Personality, mood, curiosity, vocabulary |
| Pages | `PageDocument` | Components, layout, data pipelines |

### Archetype Scaffolding

Archetypes generate connected multi-file projects with cross-references pre-wired:

**Existing archetypes to leverage:**
- Eidos: 9 org archetypes (pipeline, federation, market, matrix, divisional-holarchy, etc.)
- Blocks: 5 full examples (incident-response, fleet-logistics, research-team, contract-review, historical-encounter)
- Engine: 8 examples (choreography, sequential, GOAP, LLM, A2A, MCP, humanTask, subcase)

**Archetype structure:**
```
archetype/
  eidos/
    org.yaml              # Pre-configured org structure
    agents/*.yaml         # Agent profiles for each role
  engine/
    case.yaml             # Case definition with capabilities and workers
  blocks/
    pattern.yaml          # Agent coordination pattern
    cognition.yaml        # Cognitive configuration
    world.yaml            # Environment and actions
  work/
    templates.yaml        # Human task templates
  pages/
    dashboard.page.yaml   # Monitoring/control UI
```

### Complexity Areas Requiring Special Builder Support

1. **Capability → Worker → Binding triad** (Engine) — the builder must validate that every capability is claimed by a worker and wired by a binding. Missing any one silently breaks the chain.

2. **Recursive pattern composition** (Blocks) — composed agents contain nested patterns. The tree must show unlimited nesting depth with clear visual hierarchy.

3. **Disposition configuration** (Eidos) — weighted term vectors across 5 axes plus Jungian profiles. Needs slider-based UI with sensible defaults, not raw number entry.

4. **JQ/JSONata expressions** (Engine) — input/output projections and guard conditions. Needs syntax highlighting, validation, and autocomplete against the data model.

5. **Cross-file reference consistency** — agent names, capability names, event types must match across files. The project graph validates these and the palette populates from the typed graph.

6. **Model provider configuration** (Engine workers) — discriminated union across 5 LLM providers (Anthropic, OpenAI, Ollama, Mistral, Google), each with different parameters. The property panel must switch schemas when the provider changes.

---

## Design Principles

1. **YAML is always truth** — the CST is canonical, the visual builder is a view
2. **Type-safe by default** — references are typed, validation is immediate, refactoring propagates
3. **Contextual, not exhaustive** — show what's relevant here, not everything that exists
4. **Progressive disclosure** — full visual for beginners, natural slide to YAML, no dead ends
5. **Archetype-driven cold start** — begin from a working application, not a blank page
6. **One facade pattern** — every document type gets the same CST-backed typed facade, the same tree+property+palette UI pattern, and the same progressive YAML disclosure

## References

- `packages/pages-lsp/src/refactoring/yaml-edits.ts` — existing CST mutation primitives (string-based, not used by facade)
- `packages/pages-schema/src/document-schema.ts` — page document Zod schema (`componentSchema` discriminated union, `dashboardSchema`)
- `packages/pages-schema/src/schema-registry.ts` — `componentSchemaRegistry`: component type → Zod schema mapping
- `packages/pages-lsp/src/schema-registry.ts` — `SchemaRegistry`: format detection and variant dispatch (used by LSP, not facade)
- `packages/pages-property-palette/` — existing schema-driven property editor (consumes `FieldSchema`)
- `packages/pages-diagram-palette/` — existing stencil palette (NOT used by builder — different model)
- `packages/pages-code-editor/` — existing CodeMirror 6 editor
- `packages/pages-lsp/src/schema-navigation.ts` — schema traversal and completion
- `packages/pages-primitives/` — a11y mixins: `RovingTabindexMixin`, `FocusTrapMixin`, `LiveRegionMixin`, `KeyboardShortcutMixin`
- `packages/pages-component/src/model/page-props.ts` — runtime page types (`PageSettings`, `DataScope`, `SaveConfig`)
- `packages/pages-component/src/model/types.ts` — runtime `Component` interface with `slots`
- `packages/pages-lsp/src/refactoring/workspace-index.ts` — existing `WorkspaceSymbolIndex` (dataset + page symbols)
- Backstage Template Builder — visual YAML authoring without hiding YAML
- Google Blockly — block-based visual programming library
- `engine/schema/src/main/resources/schema/CaseDefinition.yaml` — engine case schema
- `blocks/agentic-yaml/src/main/java/io/casehub/agency/agentic/yaml/spec/` — blocks pattern specs
- `eidos/org-api/src/main/java/io/casehub/eidos/org/api/` — org structure types
- `eidos/api/src/main/java/io/casehub/eidos/api/` — agent descriptor types
- `eidos/examples/org-scenarios/src/test/resources/archetypes/` — org archetype templates
- `blocks/agentic-yaml/src/test/resources/examples/` — full agentic application examples

## Known Issues

- `graph-canvas` is in `componentSchemaRegistry` but not in the `componentSchema` discriminated union in `document-schema.ts`. Until resolved, `graph-canvas` must not appear in the builder palette. (Filed as separate issue.)
- `pagePropsSchema` does not include `dataScope` or `save` fields that the runtime `PageProps` type supports. The document schema should be updated to match. (Filed as separate issue.)
