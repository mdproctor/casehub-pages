# Design: pages-property-palette — Schema-Driven Property Panel

**Issue:** casehubio/casehub-pages#373
**Branch:** `issue-373-property-palette`
**Date:** 2026-08-26

## Overview

A new `@casehubio/pages-property-palette` package providing `<pages-property-palette>` — a single Lit web component that renders a JSON Schema as an editable property inspector panel. Consumers drive it via a `PropertyPaletteSource` SPI that decouples the palette from what selects items (diagram nodes, tree items, YAML cursor position).

The palette composes `pages-ui-components` form controls for all field rendering. This spec adds six new controls to `pages-ui-components` alongside the existing four (PagesInput, PagesSelect, PagesCheckbox, PagesTextarea): `pages-number-input`, `pages-color-swatch`, `pages-slider`, `pages-tag-editor`, `pages-date-input`, and `pages-datetime-input`. It also consolidates `FieldSchema` as a canonical type in `pages-ui-components/types` and extracts `validateField()` into `pages-ui-components/validation`.

The palette supports JSON Schema extensions for grouping, ordering, and advanced-visibility toggling.

## Architecture

### Package Placement

New package: `packages/pages-property-palette/`

Dependencies:
- `@casehubio/pages-ui-components` — form primitives (input, select, checkbox, textarea, number-input, color-swatch, slider, tag-editor, date-input, datetime-input), shared validation, and canonical FieldSchema type
- `@casehubio/pages-ui-tokens` — design tokens (dev dependency for CSS custom properties)
- `lit` — web component framework

Does NOT depend on:
- `pages-viz` — no data pipeline coupling
- `pages-data` — no TypedDataSet dependency
- `pages-runtime` — no site orchestration dependency

### New Form Controls in pages-ui-components

Six new standalone Lit controls are added to `@casehubio/pages-ui-components`, following the existing sub-path export pattern (`./number-input`, `./color-swatch`, `./slider`, `./tag-editor`, `./date-input`, `./datetime-input`). These are general-purpose form primitives with the same shape as existing controls (value, label, disabled, error, change event) and belong alongside their peers per ARC42STORIES §5 and the web-component-strategy protocol (PP-20260705-c7687d): Lit UI primitives live at the leaf level.

### Canonical FieldSchema

A canonical `FieldSchema` type is defined in `@casehubio/pages-ui-components/types`, consolidating the three existing variants (pages-viz/schema-types.ts, blocks-ui/validation.ts, and this spec's needs):

```typescript
interface FieldSchema {
  readonly type?: string | readonly string[];
  readonly format?: string;
  readonly title?: string;
  readonly description?: string;
  readonly enum?: readonly string[];
  readonly pattern?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly exclusiveMinimum?: number;
  readonly exclusiveMaximum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly uniqueItems?: boolean;
  readonly multipleOf?: number;
  readonly readOnly?: boolean;
  readonly properties?: Readonly<Record<string, FieldSchema>>;
  readonly required?: readonly string[];
  readonly items?: FieldSchema;
  readonly oneOf?: readonly FieldSchema[];
  readonly [key: `x-${string}`]: unknown;
}
```

Key design decisions:
- `type` accepts `string | readonly string[]` to handle nullable schemas (`["string", "null"]`)
- `readOnly` is a standard JSON Schema annotation keyword (per issue #373 per-field readonly requirement)
- `items` and `oneOf` support array and union schemas
- The `x-${string}` template literal index signature allows arbitrary x-* extension properties while keeping explicit properties type-safe
- `multipleOf` is the standard JSON Schema keyword for step constraints — the resolver maps it to `step` on number-input and slider controls
- `placeholder` is not included as a direct property — use `x-placeholder` (the x-* prefix convention for non-standard schema properties)

The existing `FieldSchema` in `pages-viz/schema-types.ts` becomes a re-export from `@casehubio/pages-ui-components/types`. The direct `placeholder` property on the existing type is deprecated in favor of `x-placeholder`.

### Component Model

Single `<pages-property-palette>` Lit element with internal render methods. One shadow boundary total. No intermediate custom elements.

```
<pages-property-palette>
  #shadow-root
    <div class="palette">
      <div class="advanced-toggle">...</div>     <!-- when x-visibility: "advanced" fields exist -->
      <details class="group" open>                <!-- one per x-group -->
        <summary>Group Name</summary>
        <div class="group-fields">
          <pages-input label="Name" .../>          <!-- direct editor elements -->
          <pages-select label="Type" .../>
          <pages-color-swatch label="Color" .../>
        </div>
      </details>
      <div class="ungrouped-fields">              <!-- fields without x-group -->
        <pages-checkbox label="Enabled" .../>
      </div>
    </div>
```

#### Empty State and Transitions

- `source` is `undefined` → render empty `<div class="palette"></div>` (no content, no placeholder message). The palette is invisible when nothing is selected — consumers control any "no selection" messaging in their own UI.
- `source.schema.properties` is empty or undefined → render empty palette (valid state, nothing to display).
- `source` transitions between schemas → group collapse states are preserved by group name when `paletteId` is set (via localStorage). When `paletteId` is unset, all groups default to open on every source change.
- `source.data` is missing keys defined in `schema.properties` → render the field with `undefined` value (empty text, unchecked checkbox, default slider position, etc.).

Internal render methods keep the code modular:
- `renderPalette()` — top-level layout, advanced toggle, empty state
- `renderGroup(groupName, fields)` — collapsible `<details>` section
- `renderField(key, schema, value, path: string[])` — resolves editor, sets props, wires events. The `path` parameter accumulates the nesting context: at the top level, `path = []`; inside a nested `address` object, `path = ['address']`. When a field changes, `source.onChange([...path, key], value)` delivers the full property path.

#### Recursive Nested Objects

When the resolver encounters `type: "object"` with `properties`, it renders a collapsible `<details>` section and recursively calls `renderField` for each nested property with the updated path.

- **Extension scoping**: `x-group`, `x-order`, and `x-visibility` on nested properties scope to their nesting level. If `address.city` has `x-group: "Location"`, this creates a group WITHIN the `address` nested group, not at the palette's top level. Each nesting level manages its own grouping independently.
- **Maximum depth**: Recursion is capped at 5 levels. Beyond this depth, the fallback JSON display (`<pre>`) renders the nested value. This prevents infinite recursion from circular schemas (which should be broken by consumers before passing to the palette, but the cap is a safety measure).

### Selection SPI

```typescript
interface PropertyPaletteSource {
  readonly schema: FieldSchema;
  readonly data: Record<string, unknown>;
  readonly readonly?: boolean;
  onChange(field: (string | number)[], value: unknown): void;
}
```

The palette receives a `source` property:

```typescript
@property({ attribute: false }) source: PropertyPaletteSource | undefined;
```

When `source` changes (new selection), the palette re-renders with the new schema and data. The `onChange` callback takes a field path array to support nested objects: `['address', 'city']` for `data.address.city`.

#### Per-field Readonly

A field is readonly if either:
- `source.readonly === true` (palette-level), OR
- The field's schema has `readOnly: true` (per-field, standard JSON Schema keyword)

These are OR-combined: `FieldRenderContext.readonly = source.readonly || schema.readOnly === true`.

**Control mapping**: The palette sets the `readonly` property on the resolved control. All form controls in `pages-ui-components` support `readonly` as a first-class property. Existing controls that currently lack `readonly` (`pages-select`, `pages-checkbox`) are updated as part of this work to add it. Each control is responsible for implementing readonly semantics correctly for its input type:

| Control | Readonly implementation |
|---|---|
| `pages-input`, `pages-textarea`, `pages-number-input`, `pages-date-input`, `pages-datetime-input` | Native HTML `readonly` attribute — field is focusable but not editable |
| `pages-select` | Selected value rendered as static text; `<select>` element hidden. Focusable via tabindex. |
| `pages-checkbox` | Checkbox rendered with `pointer-events: none` and readonly styling (no opacity reduction). Focusable. |
| `pages-color-swatch` | Swatch and hex value displayed; color picker and hex input non-interactive. Focusable. |
| `pages-slider` | Range and number display shown; both inputs non-interactive. Focusable. |
| `pages-tag-editor` | Tags displayed; text input and remove buttons hidden. Tag list focusable. |

The key distinction from `disabled`: readonly fields remain focusable and tabbable (preserving keyboard navigation flow), with a lighter visual treatment (no opacity reduction). Disabled fields are removed from the tab order with heavier visual dimming.

### Editor Resolution

A static resolver function maps JSON Schema definitions to editor descriptors:

```typescript
type EditorDescriptor =
  | { kind: 'tag'; tag: string; config?: Record<string, unknown> }
  | { kind: 'render'; render: (ctx: FieldRenderContext) => TemplateResult };

interface FieldRenderContext {
  key: string;
  schema: FieldSchema;
  value: unknown;
  required: boolean;
  readonly: boolean;
  error: string | undefined;
  onChange: (value: unknown) => void;
}

type EditorResolver = (schema: FieldSchema) => EditorDescriptor | undefined;

function resolveEditor(schema: FieldSchema): EditorDescriptor;
```

Default resolver mapping:

| Schema type | format / x-display-hint | Editor |
|---|---|---|
| `string` | (default) | `pages-input` |
| `string` | `enum` present | `pages-select` |
| `string` | `format: "color"` | `pages-color-swatch` |
| `string` | `format: "date"` | `pages-date-input` |
| `string` | `format: "date-time"` | `pages-datetime-input` |
| `string` | `format: "uri"` | `pages-input type="url"` |
| `string` | `x-display-hint: "textarea"` | `pages-textarea` |
| `number` / `integer` | (default) | `pages-number-input` |
| `number` / `integer` | `x-display-hint: "slider"` | `pages-slider` |
| `boolean` | — | `pages-checkbox` |
| `array` | `items.type: "string"` | `pages-tag-editor` |
| `array` | `items.enum` present | multi-select checkbox group (inline render) |
| `object` | `properties` present | recursive nested group (`<details>` with indentation) |
| `object` | no `properties` | JSON display (`<pre>`) |

#### Nullable Type Handling

When `type` is an array (e.g., `["string", "null"]`), the resolver filters out `"null"` and resolves the remaining type. If multiple non-null types remain, the fallback applies.

#### Fallback for Unknown Types

For any schema shape the resolver doesn't recognize — missing `type`, `type: "null"`, unhandled combinators (`allOf`, `anyOf`), or unresolved `$ref` — the resolver returns a read-only JSON display (`<pre>` with `JSON.stringify(value, null, 2)`) and logs a console warning: `[pages-property-palette] No editor for schema: ${JSON.stringify(schema)}`. The custom resolver mechanism allows consumers to handle domain-specific cases.

Note: the palette does not resolve `$ref` — consumers must dereference schemas before passing them to the palette source.

#### Custom Resolver

The palette's `resolver` property is a first-chance override. If the custom resolver returns an `EditorDescriptor`, the palette uses it. If it returns `undefined`, the palette falls through to its built-in default resolver (`resolveEditor`). The default resolver is internal and not exported — custom resolvers never need to reference it.

```typescript
palette.resolver = (schema) => {
  if (schema.oneOf) return { kind: 'render', render: renderTriggerEditor };
  return undefined; // fall through to built-in default
};
```

To completely replace the default resolver for a schema (preventing fallback), return an explicit descriptor rather than `undefined`.

### Schema Extensions

Extensions beyond standard JSON Schema, read from schema property definitions:

| Extension | Type | Purpose |
|---|---|---|
| `x-group` | `string` | Group properties under a collapsible header |
| `x-order` | `number` | Explicit ordering within a group (default: schema property order) |
| `x-visibility` | `"advanced"` | Hidden unless "Show advanced" is toggled on |
| `x-display-hint` | `string` | Override default editor (e.g., `"slider"` for number, `"textarea"` for string) |
| `x-placeholder` | `string` | Placeholder text for text inputs |
| `x-help` | `string` | Tooltip text shown via help icon |

`x-placeholder` is the canonical convention for placeholder text in JSON Schema extensions. The existing `placeholder` property on the pages-viz FieldSchema is deprecated in favor of `x-placeholder` — migration of existing consumers is tracked as part of the PagesSchemaForm consolidation (see §PagesSchemaForm Relationship).

### Grouping and Ordering

1. Properties are grouped by `x-group` value
2. Ungrouped properties render at the top, before any groups
3. Groups are ordered by first field appearance: the first property encountered (in schema property order, respecting `x-order`) with a given `x-group` value determines that group's position relative to other groups
4. Within each group, properties are ordered by `x-order` (ascending), then by schema property order
5. Groups render as collapsible `<details>` elements
6. "Show advanced" toggle controls visibility of `x-visibility: "advanced"` properties

### Group Collapse Persistence

The palette has a `paletteId` property:

```typescript
@property() paletteId: string | undefined;
```

When set, group collapsed/expanded state is persisted to localStorage:
- Key: `pages-palette-${paletteId}-${groupName}`
- Value: `"open"` or `"closed"`
- Default (no persistence): all groups open

### Validation

Shared `validateField()` function, extracted from `pages-viz/schema-types.ts` into `@casehubio/pages-ui-components/validation`:

```typescript
function validateField(schema: FieldSchema, value: unknown, required: boolean): string | null;
```

Covers: `required`, `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`, `minLength`, `maxLength`, `pattern`, `enum` membership, `minItems`, `maxItems`.

Validation runs on blur. Error state is set on the editor component. `source.onChange` fires regardless — validation is display-only, not a gate.

PagesSchemaForm in `pages-viz` migrates to import from the same shared utility.

## New Form Controls (pages-ui-components)

All new form controls are added to `@casehubio/pages-ui-components` as standalone Lit elements with sub-path exports. Each follows the existing form control contract: value, label, disabled, error properties, and `change` event.

### `<pages-number-input>`

Number input with min/max/step constraints. Uses native `<input type="number">` for numeric keyboard and constraint support.

```typescript
@property({ type: Number }) value: number | null = null;
@property({ type: Number }) min: number | undefined;
@property({ type: Number }) max: number | undefined;
@property({ type: Number }) step: number | undefined;
@property() label: string | undefined;
@property() placeholder: string | undefined;
@property({ type: Boolean }) required = false;
@property({ type: Boolean }) readonly = false;
@property({ type: Boolean }) disabled = false;
@property() error: string | undefined;
```

**a11y:** Native `<input type="number">` provides implicit ARIA semantics. Explicit `aria-label`, `aria-required`, `aria-invalid` attributes set from component properties.

### `<pages-date-input>`

Date picker using native `<input type="date">`. Value is an ISO 8601 date string (YYYY-MM-DD).

```typescript
@property() value: string = '';
@property() min: string | undefined;
@property() max: string | undefined;
@property() label: string | undefined;
@property({ type: Boolean }) required = false;
@property({ type: Boolean }) readonly = false;
@property({ type: Boolean }) disabled = false;
@property() error: string | undefined;
```

**a11y:** Native `<input type="date">` is accessible with built-in date picker UI. Explicit `aria-label`, `aria-required`, `aria-invalid` attributes.

### `<pages-datetime-input>`

Date-time picker using native `<input type="datetime-local">`. Value is an ISO 8601 date-time string.

```typescript
@property() value: string = '';
@property() min: string | undefined;
@property() max: string | undefined;
@property() label: string | undefined;
@property({ type: Boolean }) required = false;
@property({ type: Boolean }) readonly = false;
@property({ type: Boolean }) disabled = false;
@property() error: string | undefined;
```

**a11y:** Native `<input type="datetime-local">` is accessible with built-in picker UI. Explicit `aria-label`, `aria-required`, `aria-invalid` attributes.

### `<pages-color-swatch>`

Color picker: clickable swatch showing the current color, hex input for direct editing, native `<input type="color">` popup on swatch click. Fires `change` event with hex string value.

```typescript
@property() value: string = '#000000';
@property() label: string | undefined;
@property({ type: Boolean }) readonly = false;
@property({ type: Boolean }) disabled = false;
@property() error: string | undefined;
```

**a11y:** The native `<input type="color">` handles the popup accessibly. The hex text input has `aria-label="${label} hex value"`. Both inputs are keyboard-navigable. Focus order: hex input → swatch button.

### `<pages-slider>`

Range slider with paired numeric display: `<input type="range">` for visual adjustment, a plain `<input type="number">` for precise value entry. The number input is internal — not a `<pages-number-input>` custom element — to avoid transitive side-effect registration (importing `./slider` should not register `pages-number-input`). Respects `min`, `max`, `step` from schema (`step` is sourced from `schema.multipleOf`). Fires `change` event with numeric value.

```typescript
@property({ type: Number }) value: number = 0;
@property({ type: Number }) min: number = 0;
@property({ type: Number }) max: number = 100;
@property({ type: Number }) step: number = 1;
@property() label: string | undefined;
@property({ type: Boolean }) readonly = false;
@property({ type: Boolean }) disabled = false;
@property() error: string | undefined;
```

**a11y:** Native `<input type="range">` provides `aria-valuemin`, `aria-valuemax`, `aria-valuenow` implicitly. The paired number input is linked via shared `aria-label`. Changing either input updates both — the range input's ARIA state stays synchronized with the number input's value.

### `<pages-tag-editor>`

Tag/chip input for string arrays: text input with Enter to add, chip display with remove button. Supports `minItems`, `maxItems`, `uniqueItems` from schema. Fires `change` event with string array value.

```typescript
@property({ attribute: false }) value: string[] = [];
@property() label: string | undefined;
@property() placeholder: string | undefined;
@property({ type: Number }) maxItems: number | undefined;
@property({ type: Boolean }) uniqueItems = false;
@property({ type: Boolean }) readonly = false;
@property({ type: Boolean }) disabled = false;
@property() error: string | undefined;
```

**a11y:** Uses `LiveRegion` mixin from `@casehubio/pages-primitives` to announce tag additions and removals (e.g., "Added tag 'foo'", "Removed tag 'bar'"). Each chip's remove button has `aria-label="Remove '${tagValue}'"`. The text input has `aria-label="${label}"` and instructions for screen readers: "Press Enter to add a tag". Tag list uses `role="list"` with individual tags as `role="listitem"`.

## Public API

### Element: `<pages-property-palette>`

```typescript
class PagesPropertyPalette extends LitElement {
  @property({ attribute: false }) source: PropertyPaletteSource | undefined;
  @property({ attribute: false }) resolver: EditorResolver | undefined;
  @property() paletteId: string | undefined;
}
```

### Change Notification

The palette calls `source.onChange(field, value)` as the sole notification mechanism. No `property-change` event is emitted — the SPI callback is the contract between the palette and its consumer.

Consumers who need event-based wiring dispatch their own events from within their source's `onChange` callback:

```typescript
const source: PropertyPaletteSource = {
  schema, data,
  onChange: (field, value) => {
    updateData(field, value);
    element.dispatchEvent(new CustomEvent('my-property-change', {
      bubbles: true, composed: true,
      detail: { field, value },
    }));
  },
};
```

### Exports

```json
{
  ".": { "default": "./dist/index.js" },
  "./palette": { "default": "./dist/palette/index.js" },
  "./types": { "default": "./dist/types.js" }
}
```

- Root export: registers `<pages-property-palette>` (side effect)
- `./palette`: palette class only (for subclassing, no side effect)
- `./types`: TypeScript interfaces (PropertyPaletteSource, EditorDescriptor, FieldRenderContext, EditorResolver)

Note: `FieldSchema` is imported from `@casehubio/pages-ui-components/types`, not re-exported from this package.

## Validation Consolidation

Extract `validateField()` from `pages-viz/src/form-inputs/schema-types.ts` into `@casehubio/pages-ui-components/validation`:

1. New file: `packages/pages-ui-components/src/validation/validate-field.ts`
2. New sub-path export: `@casehubio/pages-ui-components/validation`
3. Extended coverage: add `exclusiveMinimum`, `exclusiveMaximum`, `minItems`, `maxItems`, `enum` membership
4. Canonical FieldSchema: defined in `@casehubio/pages-ui-components/types` (see §Canonical FieldSchema)
5. `pages-viz/schema-types.ts` — `FieldSchema` becomes a re-export from `@casehubio/pages-ui-components/types`; `validateField` becomes a re-export from `@casehubio/pages-ui-components/validation`
6. `blocks-ui/diagram-core/form/validation.ts` — updated during migration

## PagesSchemaForm Relationship

`PagesSchemaForm` in `pages-viz` serves a different context than the palette: it is coupled to the pages data pipeline (TypedDataSet, DataSetLookup, PagesElement lifecycle) and derives schemas from datasets. The palette is explicitly decoupled from the data pipeline.

Both share the same foundation:
- Form controls from `pages-ui-components`
- `validateField()` from `pages-ui-components/validation`
- Canonical `FieldSchema` from `pages-ui-components/types`

Current state: PagesSchemaForm uses `mapFieldToComponentType()` as its resolver; the palette uses `resolveEditor()`. These resolvers overlap but will diverge as the palette gains richer resolution (x-display-hint, format-based routing). The palette's resolver is the superset.

**Migration path:** PagesSchemaForm migrates to embed `<pages-property-palette>` internally, constructing a `PropertyPaletteSource` from its TypedDataSet. This eliminates resolver divergence and consolidates rendering logic. The `mapFieldToComponentType()` function in `schema-types.ts` becomes dead code and is removed. Tracked as casehubio/casehub-pages#375 — not gated by this spec.

## Deferred: Duration Editor

Issue #373 lists `string (format: "duration")` → ISO 8601 duration editor. This requires a complex multi-field UI (years, months, days, hours, minutes, seconds) that warrants its own design. Tracked as casehubio/casehub-pages#374. The custom resolver mechanism allows consumers to provide a domain-specific duration editor in the interim.

## blocks-ui Migration

`diagram-properties.ts` becomes a thin wrapper:

```typescript
import '@casehubio/pages-property-palette';
import type { PropertyPaletteSource, EditorResolver } from '@casehubio/pages-property-palette/types';
import type { FieldSchema } from '@casehubio/pages-ui-components/types';
import { LitElement, html, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('diagram-properties')
export class DiagramProperties extends LitElement {
  @property({ attribute: false }) schema: Record<string, unknown> = {};
  @property({ attribute: false }) data: Record<string, unknown> = {};
  @property({ type: Boolean }) readonly = false;

  private _resolver: EditorResolver = (schema) =>
    schema.oneOf ? { kind: 'render', render: renderTriggerEditor } : undefined;

  @state() private _source: PropertyPaletteSource | undefined;

  override willUpdate(changed: PropertyValues): void {
    if (changed.has('schema') || changed.has('data') || changed.has('readonly')) {
      this._source = {
        schema: this.schema as FieldSchema,
        data: this.data,
        readonly: this.readonly,
        onChange: (field, value) => {
          this.dispatchEvent(new CustomEvent('property-change', {
            bubbles: true, composed: true,
            detail: { field, value },
          }));
        },
      };
    }
  }

  override render() {
    return html`
      <pages-property-palette
        .source=${this._source}
        .resolver=${this._resolver}
      ></pages-property-palette>
    `;
  }
}
```

The `renderTriggerEditor` function stays in blocks-ui as domain-specific logic. The form directory (`field-renderer.ts`, `validation.ts`, `nested-group.ts`) is removed — its logic is replaced by the palette's built-in resolver and the shared validator.

## File Structure

```
packages/pages-ui-components/
  src/
    types.ts                        # canonical FieldSchema, SelectOption
    validation/
      index.ts
      validate-field.ts             # shared validateField()
    number-input/
      index.ts
      pages-number-input.ts
    color-swatch/
      index.ts
      pages-color-swatch.ts
    slider/
      index.ts
      pages-slider.ts
    tag-editor/
      index.ts
      pages-tag-editor.ts
    date-input/
      index.ts
      pages-date-input.ts
    datetime-input/
      index.ts
      pages-datetime-input.ts
    __tests__/
      pages-number-input.test.ts
      pages-color-swatch.test.ts
      pages-slider.test.ts
      pages-tag-editor.test.ts
      pages-date-input.test.ts
      pages-datetime-input.test.ts
      validate-field.test.ts

packages/pages-property-palette/
  package.json
  tsconfig.json
  tsconfig.build.json
  vitest.config.ts
  src/
    index.ts                        # barrel + element registration
    types.ts                        # PropertyPaletteSource, EditorDescriptor, EditorResolver
    resolver.ts                     # resolveEditor() default resolver
    palette/
      index.ts
      pages-property-palette.ts     # main component
    __tests__/
      resolver.test.ts
      pages-property-palette.test.ts
```

## Testing Strategy

- **Unit tests (pages-ui-components):** each new form control renders correctly, handles user interaction, fires change events, a11y attributes present
- **Unit tests (pages-property-palette):** resolver logic, schema extension parsing, nullable type handling, fallback behavior
- **Component tests (jsdom + @open-wc/testing):** palette renders correct fields from schema, group collapsibility, advanced toggle, readonly mode (palette-level and per-field), error display on blur, empty state, source transitions
- **Validation tests:** validateField coverage via shared utility (pages-ui-components/validation)
- **Integration test:** palette with blocks-ui's actual diagram schemas — validates the migration works

## References

- `packages/pages-ui-components/src/input/pages-input.ts` — existing PagesInput component
- `packages/pages-ui-components/src/select/pages-select.ts` — existing PagesSelect component
- `packages/pages-ui-components/src/checkbox/pages-checkbox.ts` — existing PagesCheckbox component
- `packages/pages-ui-components/src/textarea/pages-textarea.ts` — existing PagesTextarea component
- `packages/pages-viz/src/form-inputs/PagesSchemaForm.ts` — existing data-bound schema form (migration target)
- `packages/pages-viz/src/form-inputs/schema-types.ts` — existing validateField and mapFieldToComponentType
- `packages/pages-viz/src/form-inputs/PagesNumberInput.ts` — existing data-pipeline-coupled number input (reference for standalone version)
- `packages/pages-viz/src/form-inputs/PagesDatePicker.ts` — existing data-pipeline-coupled date picker (reference for standalone version)
- `packages/pages-primitives/src/a11y/live-region.ts` — LiveRegion mixin for tag-editor announcements
- `blocks-ui/packages/diagram-core/src/form/property-form.ts` — migration source
- `blocks-ui/packages/diagram-core/src/form/field-renderer.ts` — migration source (fieldTypeFor)
- `blocks-ui/packages/diagram-core/src/form/validation.ts` — migration source (validateField)
- `docs/protocols/casehub/web-component-strategy.md` — PP-20260705-c7687d (Lit conventions)
- `docs/protocols/casehub/css-design-tokens.md` — PP-20260705-2ae91d (token naming)
- casehubio/casehub-pages#373 — issue specification
- casehubio/agency-ui#136 — companion issue (domain-specific schemas)
