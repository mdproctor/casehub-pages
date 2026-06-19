# Native Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native form input components, data-bound pages with save system, hierarchical filter propagation for master-detail, and separate-file page desugaring.

**Architecture:** Form inputs are Web Components extending `CasehubElement`, participating in the standard `casehub-data-request` / `pushData` data pipeline with implicit lookups derived from page-level `dataScope`. Save is a page-level concern managed by `EditState` in the runtime with pluggable adapters resolved by name. Hierarchical filter propagation lets child dataScope pages inherit ancestor filters (same-dataset) or use `$ref` bindings (cross-dataset joins).

**Tech Stack:** TypeScript 4.6, Vitest 3.0 (jsdom), Web Components (Shadow DOM), `@casehub/ui` model + `@casehub/viz` rendering + `@casehub/runtime` orchestration.

**Spec:** `docs/superpowers/specs/2026-06-18-native-forms-design.md`

## Global Constraints

- All new types use `readonly` properties and `Object.freeze()` for immutability
- Branded types: `DataSetId`, `ColumnId` — never raw `string`
- Test framework: Vitest with `describe/it/expect`, jsdom environment
- Package test commands: `yarn workspace @casehub/ui run test`, `yarn workspace @casehub/runtime run test`, `yarn workspace @casehub/viz run test`
- No `cd` before commands — use `yarn workspace <name> run <script>` or absolute paths
- Every commit references `Refs #34`

---

### Task 1: Model Types — DataScope, SaveConfig, Form Input Props

**Files:**
- Create: `packages/casehub-ui/src/model/form-input-types.ts`
- Modify: `packages/casehub-ui/src/model/page-types.ts`
- Modify: `packages/casehub-ui/src/model/type-guards.ts`
- Create: `packages/casehub-ui/src/model/form-input-types.test.ts`
- Test: `packages/casehub-ui/src/model/type-guards.test.ts` (new)

**Interfaces:**
- Consumes: `DataSetId` from `@casehub/data`, `Component` from `@casehub/component`
- Produces: `DataScope`, `DataScopeRef`, `SaveConfig`, `FormInputCommon`, `TextInputProps`, `NumberInputProps`, `DropdownProps`, `FixedOptions`, `DataSetOptions`, `CheckboxProps`, `DatePickerProps`, `TextareaProps`, `isTextInput()`, `isNumberInput()`, `isDropdown()`, `isCheckbox()`, `isDatePicker()`, `isTextarea()`, `isFormInput()`

- [ ] **Step 1: Write form-input-types.ts**

```typescript
// packages/casehub-ui/src/model/form-input-types.ts
import type { DataSetId } from "@casehub/data/dist/dataset/types.js";

export interface FormInputCommon {
  readonly field: string;
  readonly label?: string;
  readonly required?: boolean;
  readonly readonly?: boolean;
}

export interface TextInputProps extends FormInputCommon {
  readonly placeholder?: string;
  readonly maxLength?: number;
}

export interface NumberInputProps extends FormInputCommon {
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

export interface FixedOptions {
  readonly values: readonly string[];
}

export interface DataSetOptions {
  readonly dataset: DataSetId;
  readonly labelColumn: string;
  readonly valueColumn: string;
}

export interface DropdownProps extends FormInputCommon {
  readonly options: FixedOptions | DataSetOptions;
}

export interface CheckboxProps extends FormInputCommon {}

export interface DatePickerProps extends FormInputCommon {
  readonly min?: string;
  readonly max?: string;
}

export interface TextareaProps extends FormInputCommon {
  readonly rows?: number;
  readonly maxLength?: number;
}

export function isFixedOptions(opts: FixedOptions | DataSetOptions): opts is FixedOptions {
  return "values" in opts;
}
```

- [ ] **Step 2: Add DataScope and SaveConfig to page-types.ts**

Add to `packages/casehub-ui/src/model/page-types.ts`:

```typescript
import type { DataSetId } from "@casehub/data/dist/dataset/types.js";

export interface DataScopeRef {
  readonly $ref: string;
}

export interface DataScope {
  readonly dataset: DataSetId;
  readonly idColumn: string;
  readonly filter?: Readonly<Record<string, string | DataScopeRef>>;
}

export interface SaveConfig {
  readonly trigger?: "auto" | "field" | "button" | "manual";
  readonly delay?: number;
  readonly adapter: string;
  readonly adapterConfig?: Readonly<Record<string, unknown>>;
}
```

And extend `PageProps`:

```typescript
export interface PageProps {
  readonly name?: string;
  readonly datasets?: readonly ExternalDataSetDef[];
  readonly settings?: PageSettings;
  readonly properties?: Readonly<Record<string, string>>;
  readonly dataScope?: DataScope;
  readonly save?: SaveConfig;
}
```

- [ ] **Step 3: Add form input types to ComponentTypeRegistry in type-guards.ts**

Extend the registry in `packages/casehub-ui/src/model/type-guards.ts`:

```typescript
import type {
  TextInputProps, NumberInputProps, DropdownProps,
  CheckboxProps, DatePickerProps, TextareaProps,
} from "./form-input-types.js";

export interface ComponentTypeRegistry extends BaseRegistry {
  // ... existing entries ...
  "text-input": TextInputProps;
  "number-input": NumberInputProps;
  dropdown: DropdownProps;
  checkbox: CheckboxProps;
  "date-picker": DatePickerProps;
  textarea: TextareaProps;
}
```

Add type guard functions following the existing pattern:

```typescript
export function isTextInput(c: Component): c is Component & { props: TextInputProps } {
  return c.type === "text-input";
}
export function isNumberInput(c: Component): c is Component & { props: NumberInputProps } {
  return c.type === "number-input";
}
export function isDropdown(c: Component): c is Component & { props: DropdownProps } {
  return c.type === "dropdown";
}
export function isCheckbox(c: Component): c is Component & { props: CheckboxProps } {
  return c.type === "checkbox";
}
export function isDatePicker(c: Component): c is Component & { props: DatePickerProps } {
  return c.type === "date-picker";
}
export function isTextarea(c: Component): c is Component & { props: TextareaProps } {
  return c.type === "textarea";
}

const FORM_INPUT_TYPES = new Set(["text-input", "number-input", "dropdown", "checkbox", "date-picker", "textarea"]);

export function isFormInput(c: Component): boolean {
  return FORM_INPUT_TYPES.has(c.type);
}
```

- [ ] **Step 4: Write tests for type guards**

```typescript
// packages/casehub-ui/src/model/type-guards.test.ts
import { describe, it, expect } from "vitest";
import { isTextInput, isNumberInput, isDropdown, isCheckbox, isDatePicker, isTextarea, isFormInput } from "./type-guards.js";
import type { Component } from "@casehub/component";

describe("form input type guards", () => {
  it("isTextInput matches text-input type", () => {
    const c: Component = { type: "text-input", props: { field: "name" } };
    expect(isTextInput(c)).toBe(true);
    expect(isFormInput(c)).toBe(true);
  });

  it("isNumberInput matches number-input type", () => {
    const c: Component = { type: "number-input", props: { field: "age" } };
    expect(isNumberInput(c)).toBe(true);
  });

  it("isDropdown matches dropdown type", () => {
    const c: Component = { type: "dropdown", props: { field: "dept", options: { values: ["A"] } } };
    expect(isDropdown(c)).toBe(true);
  });

  it("isCheckbox matches checkbox type", () => {
    const c: Component = { type: "checkbox", props: { field: "active" } };
    expect(isCheckbox(c)).toBe(true);
  });

  it("isDatePicker matches date-picker type", () => {
    const c: Component = { type: "date-picker", props: { field: "start" } };
    expect(isDatePicker(c)).toBe(true);
  });

  it("isTextarea matches textarea type", () => {
    const c: Component = { type: "textarea", props: { field: "notes" } };
    expect(isTextarea(c)).toBe(true);
  });

  it("isFormInput rejects non-form types", () => {
    const c: Component = { type: "bar-chart", props: { lookup: { dataSetId: "x" as any, operations: [] } } };
    expect(isFormInput(c)).toBe(false);
  });
});
```

- [ ] **Step 5: Run tests**

Run: `yarn workspace @casehub/ui run test`
Expected: All new type guard tests pass.

- [ ] **Step 6: Export new types from package index**

Update `packages/casehub-ui/src/index.ts` to export:
- All types from `form-input-types.ts`
- `DataScope`, `DataScopeRef`, `SaveConfig` from `page-types.ts`
- New type guards from `type-guards.ts`

- [ ] **Step 7: Commit**

```
git add packages/casehub-ui/src/model/form-input-types.ts \
       packages/casehub-ui/src/model/page-types.ts \
       packages/casehub-ui/src/model/type-guards.ts \
       packages/casehub-ui/src/model/type-guards.test.ts \
       packages/casehub-ui/src/index.ts
git commit -m "feat: add form input model types, DataScope, SaveConfig, type guards  Refs #34"
```

---

### Task 2: DSL Builders — Form Input Builders and PageOptions

**Files:**
- Modify: `packages/casehub-ui/src/dsl/builders.ts`
- Modify: `packages/casehub-ui/src/dsl/builders.test.ts`

**Interfaces:**
- Consumes: `TextInputProps`, `NumberInputProps`, `DropdownProps`, `CheckboxProps`, `DatePickerProps`, `TextareaProps`, `DataScope`, `SaveConfig` from Task 1
- Produces: `textInput()`, `numberInput()`, `dropdown()`, `checkbox()`, `datePicker()`, `textarea()` builder functions; updated `PageOptions` with `dataScope` and `save`

- [ ] **Step 1: Write failing tests for form input builders**

Add to `packages/casehub-ui/src/dsl/builders.test.ts`:

```typescript
import { textInput, numberInput, dropdown, checkbox, datePicker, textarea, page } from "./builders.js";
import type { DataSetId } from "@casehub/data/dist/dataset/types.js";

describe("form input builders", () => {
  it("textInput creates text-input component", () => {
    const c = textInput({ field: "name", label: "Name" });
    expect(c.type).toBe("text-input");
    expect(c.props).toEqual({ field: "name", label: "Name" });
    expect(Object.isFrozen(c)).toBe(true);
  });

  it("numberInput creates number-input component", () => {
    const c = numberInput({ field: "age", min: 0, max: 120 });
    expect(c.type).toBe("number-input");
    expect(c.props).toEqual({ field: "age", min: 0, max: 120 });
  });

  it("dropdown creates dropdown component with fixed options", () => {
    const c = dropdown({ field: "dept", options: { values: ["A", "B"] } });
    expect(c.type).toBe("dropdown");
    expect(c.props).toEqual({ field: "dept", options: { values: ["A", "B"] } });
  });

  it("checkbox creates checkbox component", () => {
    const c = checkbox({ field: "active" });
    expect(c.type).toBe("checkbox");
  });

  it("datePicker creates date-picker component", () => {
    const c = datePicker({ field: "start", min: "2024-01-01" });
    expect(c.type).toBe("date-picker");
  });

  it("textarea creates textarea component", () => {
    const c = textarea({ field: "notes", rows: 5 });
    expect(c.type).toBe("textarea");
  });
});

describe("page() with dataScope and save", () => {
  it("accepts dataScope and save in PageOptions", () => {
    const ds = "employees" as DataSetId;
    const p = page("Form",
      textInput({ field: "name" }),
      {
        dataScope: { dataset: ds, idColumn: "id" },
        save: { trigger: "auto", delay: 2000, adapter: "local" },
      },
    );
    expect(p.type).toBe("page");
    expect((p.props as any).dataScope.dataset).toBe(ds);
    expect((p.props as any).save.trigger).toBe("auto");
    expect(p.slots!.content).toHaveLength(1);
  });

  it("detects PageOptions with only dataScope (no datasets/settings/properties)", () => {
    const ds = "emps" as DataSetId;
    const p = page("Form",
      textInput({ field: "name" }),
      { dataScope: { dataset: ds, idColumn: "id" }, save: { adapter: "local" } },
    );
    expect((p.props as any).dataScope).toBeDefined();
    expect(p.slots!.content).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace @casehub/ui run test`
Expected: FAIL — `textInput`, `numberInput`, etc. not exported; `dataScope` not recognized by `isPageOptions`.

- [ ] **Step 3: Implement builders and update PageOptions**

In `packages/casehub-ui/src/dsl/builders.ts`:

Add imports:
```typescript
import type {
  TextInputProps, NumberInputProps, DropdownProps,
  CheckboxProps, DatePickerProps, TextareaProps,
} from "../model/form-input-types.js";
import type { DataScope, SaveConfig } from "../model/page-types.js";
```

Extend `PageOptions`:
```typescript
export interface PageOptions {
  readonly datasets?: readonly ExternalDataSetDef[];
  readonly settings?: PageSettings;
  readonly properties?: Record<string, string>;
  readonly dataScope?: DataScope;
  readonly save?: SaveConfig;
}
```

Update `isPageOptions()`:
```typescript
function isPageOptions(arg: unknown): arg is PageOptions {
  if (typeof arg !== "object" || arg === null) return false;
  const obj = arg as Record<string, unknown>;
  if ("type" in obj) return false;
  return "datasets" in obj || "settings" in obj || "properties" in obj
      || "dataScope" in obj || "save" in obj;
}
```

Update PageProps extraction in `page()` function body (around line 95):
```typescript
const props: PageProps = {
  name,
  ...(options?.datasets && { datasets: options.datasets }),
  ...(options?.settings && { settings: options.settings }),
  ...(options?.properties && { properties: options.properties }),
  ...(options?.dataScope && { dataScope: options.dataScope }),
  ...(options?.save && { save: options.save }),
};
```

Add builder functions after existing builders:
```typescript
export function textInput(props: TextInputProps): Component {
  return freeze({ type: "text-input" as const, props: freeze({ ...props }) });
}

export function numberInput(props: NumberInputProps): Component {
  return freeze({ type: "number-input" as const, props: freeze({ ...props }) });
}

export function dropdown(props: DropdownProps): Component {
  return freeze({ type: "dropdown" as const, props: freeze({ ...props }) });
}

export function checkbox(props: CheckboxProps): Component {
  return freeze({ type: "checkbox" as const, props: freeze({ ...props }) });
}

export function datePicker(props: DatePickerProps): Component {
  return freeze({ type: "date-picker" as const, props: freeze({ ...props }) });
}

export function textarea(props: TextareaProps): Component {
  return freeze({ type: "textarea" as const, props: freeze({ ...props }) });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn workspace @casehub/ui run test`
Expected: All tests pass, including new builder and PageOptions tests.

- [ ] **Step 5: Commit**

```
git add packages/casehub-ui/src/dsl/builders.ts packages/casehub-ui/src/dsl/builders.test.ts
git commit -m "feat: add form input DSL builders and extend PageOptions  Refs #34"
```

---

### Task 3: YAML Parser — Form Input and Page Src Desugaring

**Files:**
- Modify: `packages/casehub-ui/src/parser/component-desugar.ts`
- Modify: `packages/casehub-ui/src/parser/page-parser.ts` (dataScope/save extraction)
- Modify: `packages/casehub-ui/src/parser/component-desugar.test.ts`
- Create: `packages/casehub-ui/src/parser/form-desugar.test.ts`

**Interfaces:**
- Consumes: `TextInputProps`, `DropdownProps`, etc. from Task 1; `DataScope`, `SaveConfig` from Task 1
- Produces: YAML `text-input:`, `number-input:`, etc. shorthands → Component; `page: X, src: Y` → `lazy-page`; `dataScope:` and `save:` on page YAML → `PageProps.dataScope` and `PageProps.save`

- [ ] **Step 1: Write failing tests for form input desugaring**

```typescript
// packages/casehub-ui/src/parser/form-desugar.test.ts
import { describe, it, expect } from "vitest";
import { parsePage } from "./page-parser.js";

describe("form input desugaring", () => {
  it("desugars text-input shorthand", () => {
    const root = parsePage({
      pages: [{ components: [{ "text-input": { field: "name", label: "Name" } }] }],
    });
    const content = root.slots!.content!;
    const grid = content[0]!;
    const item = grid.items![0]!;
    expect(item.component.type).toBe("text-input");
    expect(item.component.props).toEqual({ field: "name", label: "Name" });
  });

  it("desugars number-input shorthand", () => {
    const root = parsePage({
      pages: [{ components: [{ "number-input": { field: "age", min: 0 } }] }],
    });
    const item = root.slots!.content![0]!.items![0]!;
    expect(item.component.type).toBe("number-input");
    expect(item.component.props).toEqual({ field: "age", min: 0 });
  });

  it("desugars dropdown with fixed options", () => {
    const root = parsePage({
      pages: [{ components: [{ dropdown: { field: "dept", options: { values: ["A", "B"] } } }] }],
    });
    const item = root.slots!.content![0]!.items![0]!;
    expect(item.component.type).toBe("dropdown");
  });

  it("desugars checkbox shorthand", () => {
    const root = parsePage({
      pages: [{ components: [{ checkbox: { field: "active" } }] }],
    });
    const item = root.slots!.content![0]!.items![0]!;
    expect(item.component.type).toBe("checkbox");
  });

  it("desugars date-picker shorthand", () => {
    const root = parsePage({
      pages: [{ components: [{ "date-picker": { field: "start" } }] }],
    });
    const item = root.slots!.content![0]!.items![0]!;
    expect(item.component.type).toBe("date-picker");
  });

  it("desugars textarea shorthand", () => {
    const root = parsePage({
      pages: [{ components: [{ textarea: { field: "notes", rows: 5 } }] }],
    });
    const item = root.slots!.content![0]!.items![0]!;
    expect(item.component.type).toBe("textarea");
  });
});

describe("page src desugaring", () => {
  it("desugars page with src to lazy-page", () => {
    const root = parsePage({
      pages: [{
        components: [
          { page: "Employee Form", src: "./form.yaml" },
        ],
      }],
    });
    const item = root.slots!.content![0]!.items![0]!;
    expect(item.component.type).toBe("lazy-page");
    expect(item.component.props).toEqual({ name: "Employee Form", href: "./form.yaml" });
  });

  it("desugars page without src to page-ref (existing)", () => {
    const root = parsePage({
      pages: [{
        components: [{ screen: "Layout" }],
      }],
    });
    const item = root.slots!.content![0]!.items![0]!;
    expect(item.component.type).toBe("page-ref");
  });
});

describe("dataScope and save parsing", () => {
  it("parses dataScope on page", () => {
    const root = parsePage({
      pages: [{
        name: "Form",
        dataScope: { dataset: "emps", idColumn: "id" },
        save: { trigger: "auto", delay: 2000, adapter: "local" },
        components: [{ "text-input": { field: "name" } }],
      }],
    });
    const page = root.slots!.content![0]!;
    expect((page.props as any).dataScope).toEqual({ dataset: "emps", idColumn: "id" });
    expect((page.props as any).save).toEqual({ trigger: "auto", delay: 2000, adapter: "local" });
  });

  it("parses save with adapterConfig from adapter-named key", () => {
    const root = parsePage({
      pages: [{
        name: "Form",
        dataScope: { dataset: "emps", idColumn: "id" },
        save: { trigger: "auto", adapter: "rest", rest: { method: "PATCH" } },
        components: [{ "text-input": { field: "name" } }],
      }],
    });
    const page = root.slots!.content![0]!;
    expect((page.props as any).save.adapterConfig).toEqual({ method: "PATCH" });
  });

  it("parses dataScope with $ref filter", () => {
    const root = parsePage({
      pages: [{
        name: "Projects",
        dataScope: {
          dataset: "projects",
          idColumn: "id",
          filter: { employee_id: { $ref: "employees.id" } },
        },
        components: [{ "text-input": { field: "name" } }],
      }],
    });
    const page = root.slots!.content![0]!;
    const ds = (page.props as any).dataScope;
    expect(ds.filter.employee_id.$ref).toBe("employees.id");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace @casehub/ui run test`
Expected: FAIL — form input shorthands not recognized, page src not handled, dataScope/save not parsed.

- [ ] **Step 3: Implement form input desugaring in component-desugar.ts**

Add to `desugarComponent()` function, after the existing content shorthand checks (html, markdown, title):

```typescript
const FORM_INPUT_TYPES = ["text-input", "number-input", "dropdown", "checkbox", "date-picker", "textarea"] as const;

for (const formType of FORM_INPUT_TYPES) {
  if (formType in raw) {
    const props = raw[formType] as Record<string, unknown>;
    const style = extractStyle(raw);
    return { type: formType, props, ...(style && { style }) };
  }
}
```

Add page-with-src handling in the `screen:` / `page:` section:

```typescript
if ("page" in raw && "src" in raw) {
  const style = extractStyle(raw);
  return {
    type: "lazy-page",
    props: { name: raw.page as string, href: raw.src as string },
    ...(style && { style }),
  };
}
```

- [ ] **Step 4: Implement dataScope/save parsing in page-parser.ts**

In the page parsing function where PageProps is constructed from YAML, add extraction of `dataScope` and `save`:

```typescript
const dataScope = rawPage.dataScope as DataScope | undefined;

let save: SaveConfig | undefined;
if (rawPage.save) {
  const rawSave = rawPage.save as Record<string, unknown>;
  const adapter = rawSave.adapter as string;
  const adapterConfig = adapter && adapter in rawSave
    ? rawSave[adapter] as Record<string, unknown>
    : undefined;
  save = {
    ...(rawSave.trigger && { trigger: rawSave.trigger as SaveConfig["trigger"] }),
    ...(rawSave.delay !== undefined && { delay: rawSave.delay as number }),
    adapter,
    ...(adapterConfig && { adapterConfig }),
  };
}
```

Include `dataScope` and `save` in the constructed `PageProps`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `yarn workspace @casehub/ui run test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```
git add packages/casehub-ui/src/parser/component-desugar.ts \
       packages/casehub-ui/src/parser/page-parser.ts \
       packages/casehub-ui/src/parser/form-desugar.test.ts
git commit -m "feat: YAML parser desugar for form inputs, page src, dataScope/save  Refs #34"
```

---

### Task 4: Hierarchical Filter Propagation

**Files:**
- Modify: `packages/casehub-runtime/src/cross-filter.ts`
- Create: `packages/casehub-runtime/src/data-scope-registry.ts`
- Modify: `packages/casehub-runtime/src/cross-filter.test.ts` (new or extend)
- Create: `packages/casehub-runtime/src/data-scope-registry.test.ts`

**Interfaces:**
- Consumes: `FilterState`, `getActiveFilterOps`, `DataSetOp` from existing cross-filter; `DataScope` from Task 1
- Produces: `collectAncestorFilterOps(filterState, pagePath, group): DataSetOp[]`; `DataScopeRegistry` type; `createDataScopeRegistry(): DataScopeRegistry`; `hasDataScope(registry, pagePath): boolean`; `getDataScope(registry, pagePath): DataScope | undefined`

- [ ] **Step 1: Write failing test for collectAncestorFilterOps**

```typescript
// packages/casehub-runtime/src/cross-filter.test.ts (new or extend existing)
import { describe, it, expect } from "vitest";
import { createFilterState, updateFilter, getActiveFilterOps, collectAncestorFilterOps } from "./cross-filter.js";

describe("collectAncestorFilterOps", () => {
  it("collects filters from ancestor pages", () => {
    const fs = createFilterState();
    updateFilter(fs, "Employee List", undefined, "id", ["42"], false);
    const ops = collectAncestorFilterOps(fs, "Employee List/Employee Form", undefined);
    expect(ops).toHaveLength(1);
    expect(ops[0]!.type).toBe("filter");
  });

  it("collects filters from own page AND ancestors", () => {
    const fs = createFilterState();
    updateFilter(fs, "Root", undefined, "region", ["North"], false);
    updateFilter(fs, "Root/Child", undefined, "dept", ["Eng"], false);
    const ops = collectAncestorFilterOps(fs, "Root/Child", undefined);
    expect(ops).toHaveLength(2);
  });

  it("collects from deeply nested paths", () => {
    const fs = createFilterState();
    updateFilter(fs, "A", undefined, "x", ["1"], false);
    updateFilter(fs, "A/B", undefined, "y", ["2"], false);
    const ops = collectAncestorFilterOps(fs, "A/B/C", undefined);
    expect(ops).toHaveLength(2);
  });

  it("returns empty for pages with no ancestor filters", () => {
    const fs = createFilterState();
    const ops = collectAncestorFilterOps(fs, "Orphan/Child", undefined);
    expect(ops).toHaveLength(0);
  });

  it("respects filter groups when walking ancestors", () => {
    const fs = createFilterState();
    updateFilter(fs, "Root", "g1", "col", ["val"], false);
    const withGroup = collectAncestorFilterOps(fs, "Root/Child", "g1");
    expect(withGroup).toHaveLength(1);
    const wrongGroup = collectAncestorFilterOps(fs, "Root/Child", "g2");
    expect(wrongGroup).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace @casehub/runtime run test`
Expected: FAIL — `collectAncestorFilterOps` not found.

- [ ] **Step 3: Implement collectAncestorFilterOps**

Add to `packages/casehub-runtime/src/cross-filter.ts`:

```typescript
export function collectAncestorFilterOps(
  filterState: FilterState,
  pagePath: string,
  group: string | undefined,
): DataSetOp[] {
  const ops: DataSetOp[] = [];
  let path: string | undefined = pagePath;
  while (path !== undefined) {
    ops.push(...getActiveFilterOps(filterState, path, group));
    const lastSlash = path.lastIndexOf("/");
    path = lastSlash > 0 ? path.substring(0, lastSlash) : (path === "" ? undefined : "");
  }
  return ops;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn workspace @casehub/runtime run test`
Expected: All tests pass.

- [ ] **Step 5: Write DataScopeRegistry**

```typescript
// packages/casehub-runtime/src/data-scope-registry.ts
import type { DataScope } from "@casehub/ui";

export type DataScopeRegistry = Map<string, DataScope>;

export function createDataScopeRegistry(): DataScopeRegistry {
  return new Map();
}

export function hasDataScope(registry: DataScopeRegistry, pagePath: string): boolean {
  return registry.has(pagePath);
}

export function getDataScope(registry: DataScopeRegistry, pagePath: string): DataScope | undefined {
  return registry.get(pagePath);
}
```

- [ ] **Step 6: Write DataScopeRegistry tests**

```typescript
// packages/casehub-runtime/src/data-scope-registry.test.ts
import { describe, it, expect } from "vitest";
import { createDataScopeRegistry, hasDataScope, getDataScope } from "./data-scope-registry.js";
import type { DataSetId } from "@casehub/data/dist/dataset/types.js";

describe("DataScopeRegistry", () => {
  it("registers and retrieves DataScope", () => {
    const reg = createDataScopeRegistry();
    const ds = { dataset: "emps" as DataSetId, idColumn: "id" };
    reg.set("Root/Form", ds);
    expect(hasDataScope(reg, "Root/Form")).toBe(true);
    expect(getDataScope(reg, "Root/Form")).toEqual(ds);
  });

  it("returns false for unregistered paths", () => {
    const reg = createDataScopeRegistry();
    expect(hasDataScope(reg, "Missing")).toBe(false);
    expect(getDataScope(reg, "Missing")).toBeUndefined();
  });
});
```

- [ ] **Step 7: Run all tests**

Run: `yarn workspace @casehub/runtime run test`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```
git add packages/casehub-runtime/src/cross-filter.ts \
       packages/casehub-runtime/src/cross-filter.test.ts \
       packages/casehub-runtime/src/data-scope-registry.ts \
       packages/casehub-runtime/src/data-scope-registry.test.ts
git commit -m "feat: hierarchical filter collection and DataScopeRegistry  Refs #34"
```

---

### Task 5: $ref Binding Resolution

**Files:**
- Create: `packages/casehub-runtime/src/ref-resolution.ts`
- Create: `packages/casehub-runtime/src/ref-resolution.test.ts`

**Interfaces:**
- Consumes: `DataScope`, `DataScopeRef` from Task 1; `DataScopeRegistry` from Task 4; `DataSetManager`, `DataSetLookup` from `@casehub/data`; `collectAncestorFilterOps` from Task 4; `FilterState` from existing
- Produces: `resolveRefBindings(dataScope, dataScopeRegistry, filterState, manager, pagePath, visited?): DataSetOp[]`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/casehub-runtime/src/ref-resolution.test.ts
import { describe, it, expect } from "vitest";
import { resolveRefBindings } from "./ref-resolution.js";
import { createFilterState, updateFilter } from "./cross-filter.js";
import { createDataScopeRegistry } from "./data-scope-registry.js";
import type { DataSetId, ColumnId } from "@casehub/data/dist/dataset/types.js";
import type { DataSetManager } from "@casehub/data/dist/dataset/manager.js";
import { ColumnType } from "@casehub/data/dist/dataset/types.js";

function mockManager(rows: Record<string, string>[]): DataSetManager {
  return {
    has: () => true,
    lookup: () => ({
      dataset: {
        columns: Object.keys(rows[0] ?? {}).map(id => ({
          id: id as ColumnId,
          name: id,
          type: ColumnType.TEXT,
        })),
        rows: rows.map(r => ({
          cells: Object.values(r).map(v => ({ type: ColumnType.TEXT as const, value: v })),
          cell: (colId: ColumnId) => {
            const val = r[colId as string];
            return val !== undefined
              ? { type: ColumnType.TEXT as const, value: val }
              : { type: "NULL" as const };
          },
          number: () => 0,
          text: (colId: ColumnId) => r[colId as string] ?? "",
          date: () => new Date(),
        })),
      },
      totalRows: rows.length,
    }),
  } as unknown as DataSetManager;
}

describe("resolveRefBindings", () => {
  it("resolves static filter values to FilterOps", () => {
    const ds = {
      dataset: "projects" as DataSetId,
      idColumn: "id",
      filter: { status: "active" },
    };
    const reg = createDataScopeRegistry();
    const fs = createFilterState();
    const mgr = mockManager([]);

    const ops = resolveRefBindings(ds, reg, fs, mgr, "Root/Form");
    expect(ops).toHaveLength(1);
    expect(ops[0]!.type).toBe("filter");
  });

  it("resolves $ref to parent record value", () => {
    const parentDs = { dataset: "emps" as DataSetId, idColumn: "id" };
    const childDs = {
      dataset: "projects" as DataSetId,
      idColumn: "id",
      filter: { employee_id: { $ref: "emps.id" } },
    };

    const reg = createDataScopeRegistry();
    reg.set("Root", parentDs);

    const fs = createFilterState();
    updateFilter(fs, "Root", undefined, "id", ["42"], false);

    const mgr = mockManager([{ id: "42", name: "Alice" }]);

    const ops = resolveRefBindings(childDs, reg, fs, mgr, "Root/Projects");
    expect(ops).toHaveLength(1);
  });

  it("returns empty ops when parent record is unavailable", () => {
    const childDs = {
      dataset: "projects" as DataSetId,
      idColumn: "id",
      filter: { employee_id: { $ref: "emps.id" } },
    };
    const reg = createDataScopeRegistry();
    const fs = createFilterState();
    const mgr = { has: () => false } as unknown as DataSetManager;

    const ops = resolveRefBindings(childDs, reg, fs, mgr, "Root/Projects");
    expect(ops).toHaveLength(0);
  });

  it("detects circular $ref chains", () => {
    const dsA = {
      dataset: "a" as DataSetId, idColumn: "id",
      filter: { col: { $ref: "b.id" } },
    };
    const dsB = {
      dataset: "b" as DataSetId, idColumn: "id",
      filter: { col: { $ref: "a.id" } },
    };
    const reg = createDataScopeRegistry();
    reg.set("Root", dsA);
    reg.set("Root/Child", dsB);

    const fs = createFilterState();
    const mgr = mockManager([]);

    const visited = new Set(["Root/Child"]);
    const ops = resolveRefBindings(dsA, reg, fs, mgr, "Root", visited);
    expect(ops).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace @casehub/runtime run test`
Expected: FAIL — `resolveRefBindings` not found.

- [ ] **Step 3: Implement resolveRefBindings**

```typescript
// packages/casehub-runtime/src/ref-resolution.ts
import type { DataSetOp } from "@casehub/data/dist/dataset/ops.js";
import type { DataSetLookup } from "@casehub/data/dist/dataset/lookup.js";
import type { DataSetManager } from "@casehub/data/dist/dataset/manager.js";
import type { DataSetId, ColumnId } from "@casehub/data/dist/dataset/types.js";
import type { DataScope, DataScopeRef } from "@casehub/ui";
import type { FilterState } from "./cross-filter.js";
import { collectAncestorFilterOps } from "./cross-filter.js";
import type { DataScopeRegistry } from "./data-scope-registry.js";

function isRef(v: string | DataScopeRef): v is DataScopeRef {
  return typeof v === "object" && "$ref" in v;
}

export function resolveRefBindings(
  dataScope: DataScope,
  dataScopeRegistry: DataScopeRegistry,
  filterState: FilterState,
  manager: DataSetManager,
  pagePath: string,
  visited?: Set<string>,
): DataSetOp[] {
  if (!dataScope.filter) return [];

  const ops: DataSetOp[] = [];
  const _visited = visited ?? new Set<string>();

  for (const [childCol, binding] of Object.entries(dataScope.filter)) {
    if (!isRef(binding)) {
      ops.push({
        type: "filter" as const,
        expressions: [{
          type: "unresolved" as const,
          columnId: childCol as ColumnId,
          fn: "EQUALS_TO" as const,
          args: [binding],
        }],
      });
      continue;
    }

    const [refDatasetId, refColumnId] = binding.$ref.split(".");
    if (!refDatasetId || !refColumnId) continue;

    const parentPath = findParentWithDataset(dataScopeRegistry, pagePath, refDatasetId as DataSetId);
    if (!parentPath || _visited.has(parentPath)) continue;

    _visited.add(parentPath);

    const parentScope = dataScopeRegistry.get(parentPath)!;
    const parentFilterOps = collectAncestorFilterOps(filterState, parentPath, undefined);
    const parentLookup: DataSetLookup = {
      dataSetId: parentScope.dataset,
      operations: parentFilterOps,
    };

    if (!manager.has(parentScope.dataset)) continue;

    try {
      const result = manager.lookup(parentLookup);
      const firstRow = result.dataset.rows[0];
      if (!firstRow) continue;

      const cell = firstRow.cell(refColumnId as ColumnId);
      const value = cell.type === "NULL" ? "" : String(
        cell.type === "NUMBER" ? cell.value :
        cell.type === "DATE" ? cell.value.toISOString() :
        cell.value
      );

      ops.push({
        type: "filter" as const,
        expressions: [{
          type: "unresolved" as const,
          columnId: childCol as ColumnId,
          fn: "EQUALS_TO" as const,
          args: [value],
        }],
      });
    } catch {
      // Parent lookup failed — skip this binding
    }
  }

  return ops;
}

function findParentWithDataset(
  registry: DataScopeRegistry,
  pagePath: string,
  datasetId: DataSetId,
): string | undefined {
  let path = pagePath;
  while (path.includes("/")) {
    path = path.substring(0, path.lastIndexOf("/"));
    const scope = registry.get(path);
    if (scope && scope.dataset === datasetId) return path;
  }
  if (path !== pagePath) {
    const scope = registry.get(path);
    if (scope && scope.dataset === datasetId) return path;
  }
  return undefined;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn workspace @casehub/runtime run test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```
git add packages/casehub-runtime/src/ref-resolution.ts packages/casehub-runtime/src/ref-resolution.test.ts
git commit -m "feat: \$ref binding resolution for cross-dataset foreign-key joins  Refs #34"
```

---

### Task 6: Form Input Web Components

**Files:**
- Create: `packages/casehub-viz/src/form-inputs/CasehubFormInput.ts` (abstract base)
- Create: `packages/casehub-viz/src/form-inputs/CasehubTextInput.ts`
- Create: `packages/casehub-viz/src/form-inputs/CasehubNumberInput.ts`
- Create: `packages/casehub-viz/src/form-inputs/CasehubCheckbox.ts`
- Create: `packages/casehub-viz/src/form-inputs/CasehubTextarea.ts`
- Create: `packages/casehub-viz/src/form-inputs/CasehubDatePicker.ts`
- Create: `packages/casehub-viz/src/form-inputs/CasehubDropdown.ts`
- Create: `packages/casehub-viz/src/form-inputs/form-inputs.test.ts`

**Interfaces:**
- Consumes: `CasehubElement` base class from `@casehub/viz`; `TextInputProps`, `NumberInputProps`, etc. from Task 1; `CasehubFieldChangeDetail` event detail
- Produces: `<casehub-text-input>`, `<casehub-number-input>`, `<casehub-dropdown>`, `<casehub-checkbox>`, `<casehub-date-picker>`, `<casehub-textarea>` custom elements

- [ ] **Step 1: Write the abstract CasehubFormInput base**

```typescript
// packages/casehub-viz/src/form-inputs/CasehubFormInput.ts
import { CasehubElement } from "../base/CasehubElement.js";
import type { FormInputCommon } from "@casehub/ui";
import type { TypedDataSet, ColumnId } from "@casehub/data/dist/dataset/types.js";

export interface CasehubFieldChangeDetail {
  readonly field: string;
  readonly value: unknown;
  readonly committed: boolean;
}

export abstract class CasehubFormInput<P extends FormInputCommon> extends CasehubElement<P & { lookup?: any }> {
  protected _editable = false;

  set editable(value: boolean) {
    this._editable = value;
  }

  protected extractFieldValue(dataset: TypedDataSet): unknown {
    const field = this.props?.field;
    if (!field || !dataset.rows.length) return undefined;
    const row = dataset.rows[0]!;
    try {
      const cell = row.cell(field as ColumnId);
      if (cell.type === "NULL") return undefined;
      return cell.value;
    } catch {
      return undefined;
    }
  }

  protected emitFieldChange(value: unknown, committed: boolean): void {
    if (!this._editable) return;
    const field = this.props?.field;
    if (!field) return;
    this.dispatchEvent(
      new CustomEvent<CasehubFieldChangeDetail>("casehub-field-change", {
        bubbles: true,
        composed: true,
        detail: { field, value, committed },
      }),
    );
  }
}
```

- [ ] **Step 2: Write CasehubTextInput**

```typescript
// packages/casehub-viz/src/form-inputs/CasehubTextInput.ts
import { CasehubFormInput } from "./CasehubFormInput.js";
import type { TextInputProps } from "@casehub/ui";

export class CasehubTextInput extends CasehubFormInput<TextInputProps> {
  render(container: HTMLElement, props: TextInputProps & { lookup?: any }, dataset: any): void {
    container.innerHTML = "";
    const wrapper = document.createElement("div");
    wrapper.className = "casehub-form-field";

    if (props.label) {
      const label = document.createElement("label");
      label.textContent = props.label;
      wrapper.appendChild(label);
    }

    const input = document.createElement("input");
    input.type = "text";
    const value = this.extractFieldValue(dataset);
    if (value !== undefined) input.value = String(value);
    if (props.placeholder) input.placeholder = props.placeholder;
    if (props.maxLength) input.maxLength = props.maxLength;
    if (props.required) input.required = true;
    if (props.readonly || !this._editable) input.readOnly = true;

    input.addEventListener("input", () => {
      this.emitFieldChange(input.value, false);
    });
    input.addEventListener("blur", () => {
      this.emitFieldChange(input.value, true);
    });

    wrapper.appendChild(input);
    container.appendChild(wrapper);
  }
}

customElements.define("casehub-text-input", CasehubTextInput);
```

- [ ] **Step 3: Write remaining five Web Components**

Implement `CasehubNumberInput`, `CasehubCheckbox`, `CasehubTextarea`, `CasehubDatePicker`, and `CasehubDropdown` following the same pattern as `CasehubTextInput`. Key differences:

- **CasehubNumberInput:** `input.type = "number"`, coerce via `parseFloat`, set `min`/`max`/`step` attributes
- **CasehubCheckbox:** `input.type = "checkbox"`, read coercion: `"true"` (case-insensitive) → checked, write: `"true"` / `"false"`
- **CasehubTextarea:** Use `<textarea>` element, set `rows` attribute
- **CasehubDatePicker:** `input.type = "date"`, ISO 8601 coercion
- **CasehubDropdown:** `<select>` element with `<option>` entries from `props.options.values` (fixed) or stored resolved options (dataset); dual data dependency handled by `optionsData` property set at activation time

Each file ends with `customElements.define("casehub-<type>", CasehubXyz)`.

- [ ] **Step 4: Write tests**

```typescript
// packages/casehub-viz/src/form-inputs/form-inputs.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import "./CasehubTextInput.js";
import "./CasehubNumberInput.js";
import "./CasehubCheckbox.js";
import "./CasehubTextarea.js";
import "./CasehubDatePicker.js";
import "./CasehubDropdown.js";
import type { CasehubFieldChangeDetail } from "./CasehubFormInput.js";

describe("CasehubTextInput", () => {
  it("renders input with field value from dataset", () => {
    const el = document.createElement("casehub-text-input") as any;
    el.props = { field: "name", label: "Name" };
    el.editable = true;
    document.body.appendChild(el);

    el.dataSet = {
      columns: [{ id: "name", name: "name", type: "TEXT" }],
      rows: [{
        cells: [{ type: "TEXT", value: "Alice" }],
        cell: () => ({ type: "TEXT" as const, value: "Alice" }),
        number: () => 0, text: () => "Alice", date: () => new Date(),
      }],
    };

    const input = el.shadowRoot!.querySelector("input")!;
    expect(input.value).toBe("Alice");
    document.body.removeChild(el);
  });

  it("emits casehub-field-change on input when editable", () => {
    const el = document.createElement("casehub-text-input") as any;
    el.props = { field: "name" };
    el.editable = true;
    document.body.appendChild(el);

    el.dataSet = {
      columns: [{ id: "name", name: "name", type: "TEXT" }],
      rows: [{
        cells: [{ type: "TEXT", value: "" }],
        cell: () => ({ type: "TEXT" as const, value: "" }),
        number: () => 0, text: () => "", date: () => new Date(),
      }],
    };

    const events: CasehubFieldChangeDetail[] = [];
    el.addEventListener("casehub-field-change", (e: CustomEvent) => events.push(e.detail));

    const input = el.shadowRoot!.querySelector("input")!;
    input.value = "Bob";
    input.dispatchEvent(new Event("input"));
    expect(events).toHaveLength(1);
    expect(events[0]!.field).toBe("name");
    expect(events[0]!.value).toBe("Bob");
    expect(events[0]!.committed).toBe(false);

    input.dispatchEvent(new Event("blur"));
    expect(events).toHaveLength(2);
    expect(events[1]!.committed).toBe(true);

    document.body.removeChild(el);
  });

  it("does not emit events when not editable", () => {
    const el = document.createElement("casehub-text-input") as any;
    el.props = { field: "name" };
    el.editable = false;
    document.body.appendChild(el);

    el.dataSet = {
      columns: [{ id: "name", name: "name", type: "TEXT" }],
      rows: [{
        cells: [{ type: "TEXT", value: "" }],
        cell: () => ({ type: "TEXT" as const, value: "" }),
        number: () => 0, text: () => "", date: () => new Date(),
      }],
    };

    const events: any[] = [];
    el.addEventListener("casehub-field-change", (e: any) => events.push(e));

    const input = el.shadowRoot!.querySelector("input")!;
    input.value = "test";
    input.dispatchEvent(new Event("input"));
    expect(events).toHaveLength(0);

    document.body.removeChild(el);
  });
});

describe("CasehubCheckbox", () => {
  it("coerces 'true' LABEL to checked", () => {
    const el = document.createElement("casehub-checkbox") as any;
    el.props = { field: "active" };
    el.editable = true;
    document.body.appendChild(el);

    el.dataSet = {
      columns: [{ id: "active", name: "active", type: "LABEL" }],
      rows: [{
        cells: [{ type: "LABEL", value: "true" }],
        cell: () => ({ type: "LABEL" as const, value: "true" }),
        number: () => 0, text: () => "true", date: () => new Date(),
      }],
    };

    const input = el.shadowRoot!.querySelector("input")!;
    expect(input.checked).toBe(true);
    document.body.removeChild(el);
  });
});
```

- [ ] **Step 5: Run tests**

Run: `yarn workspace @casehub/viz run test`
Expected: All form input tests pass.

- [ ] **Step 6: Commit**

```
git add packages/casehub-viz/src/form-inputs/
git commit -m "feat: six form input Web Components extending CasehubElement  Refs #34"
```

---

### Task 7: Form Input Activation and Data Pipeline Integration

**Files:**
- Modify: `packages/casehub-runtime/src/activation.ts`
- Modify: `packages/casehub-runtime/src/data-pipeline.ts`
- Modify: `packages/casehub-runtime/src/site.ts`
- Modify: `packages/casehub-runtime/src/activation.test.ts`
- Create: `packages/casehub-runtime/src/form-activation.test.ts`

**Interfaces:**
- Consumes: `DataScopeRegistry` from Task 4; `collectAncestorFilterOps` from Task 4; `resolveRefBindings` from Task 5; form input Web Components from Task 6; `DataScope`, `SaveConfig` from Task 1
- Produces: Form inputs registered in `ComponentRegistry` with implicit lookup; `pushData` uses ancestor filters for dataScope pages; filter handler re-pushes child dataScope pages

- [ ] **Step 1: Write failing test for form input activation**

```typescript
// packages/casehub-runtime/src/form-activation.test.ts
import { describe, it, expect } from "vitest";
import "../../../casehub-viz/src/form-inputs/CasehubTextInput.js";
import { loadSite } from "./site.js";
import { page, textInput } from "@casehub/ui";
import { inlineDataset } from "@casehub/ui";
import type { DataSetId } from "@casehub/data/dist/dataset/types.js";

describe("form input activation", () => {
  it("activates text-input as a data component with implicit lookup", async () => {
    const target = document.createElement("div");
    const ds = "emps" as DataSetId;

    const root = page("Root",
      page("Form",
        textInput({ field: "name", label: "Name" }),
        {
          dataScope: { dataset: ds, idColumn: "id" },
          save: { adapter: "local" },
          datasets: [inlineDataset(ds as string, '[["1", "Alice"]]', {
            columns: [
              { id: "id", type: "NUMBER" },
              { id: "name", type: "TEXT" },
            ],
          })],
        },
      ),
    );

    const site = await loadSite(target, root);
    const formInput = target.querySelector("casehub-text-input");
    expect(formInput).not.toBeNull();
    site.dispose();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @casehub/runtime run test`
Expected: FAIL — text-input not recognized as a data component.

- [ ] **Step 3: Update DATA_COMPONENT_TYPES in activation.ts**

Add the six form input types:

```typescript
const DATA_COMPONENT_TYPES = new Set([
  "bar-chart", "line-chart", "area-chart", "pie-chart",
  "scatter-chart", "bubble-chart", "timeseries", "table",
  "metric", "meter", "selector", "map", "iframe-plugin",
  "text-input", "number-input", "dropdown", "checkbox",
  "date-picker", "textarea",
]);
```

Add implicit lookup injection for form inputs. In the activation callback, after creating the viz element and before appending to DOM:

```typescript
if (FORM_INPUT_TYPES.has(component.type)) {
  const pageDataScope = getDataScope(dataScopeRegistry, pagePath);
  if (pageDataScope) {
    const implicitLookup = { dataSetId: pageDataScope.dataset, operations: [] };
    (vizEl as any).lookup = implicitLookup;
    // Set editable based on page having save config
    const pageProps = /* walk pagePathMap to find page component's props */;
    (vizEl as any).editable = !!pageProps?.save;
  } else {
    (vizEl as any).error = "Form input requires page dataScope";
  }
}
```

- [ ] **Step 4: Update pushData in data-pipeline.ts for hierarchical filters**

Modify `pushData` to use `collectAncestorFilterOps` when the component is on a dataScope page:

```typescript
function pushData(
  target: VizTarget,
  lookup: DataSetLookup,
  pagePath: string,
  filterGroup: string | undefined,
  options?: LookupOptions,
): void {
  try {
    const scope = getDataScope(dataScopeRegistry, pagePath);
    let filterOps: DataSetOp[];

    if (scope?.filter) {
      // $ref mode: use resolved bindings only, no ancestor collection
      filterOps = resolveRefBindings(scope, dataScopeRegistry, filterState, manager, pagePath);
      // Also add own-page interactive filters
      filterOps.push(...getActiveFilterOps(filterState, pagePath, filterGroup));
    } else if (scope) {
      // Same-dataset mode: walk up ancestors
      filterOps = collectAncestorFilterOps(filterState, pagePath, filterGroup);
    } else {
      // No dataScope: existing same-page behavior
      filterOps = getActiveFilterOps(filterState, pagePath, filterGroup);
    }

    const effectiveOps = [...filterOps, ...lookup.operations];
    const effectiveLookup: DataSetLookup = { ...lookup, operations: effectiveOps };
    const result = manager.lookup(effectiveLookup, options);
    target.dataSet = result.dataset;
    target.totalRows = result.totalRows;
  } catch (err) {
    target.error = err instanceof Error ? err.message : String(err);
  }
}
```

- [ ] **Step 5: Update filter handler in site.ts for child page re-push**

After the existing same-page re-push loop, add:

```typescript
// Re-push child dataScope pages
for (const [id, candidate] of registry) {
  if (!candidate.pagePath.startsWith(entry.pagePath + "/")) continue;
  if (!hasDataScope(dataScopeRegistry, candidate.pagePath)) continue;
  if (candidate.vizElement && candidate.originalLookup) {
    pipeline.handleDataRequest(candidate.vizElement as unknown as VizTarget, candidate.originalLookup, id);
  }
}
```

- [ ] **Step 6: Wire DataScopeRegistry into loadSite**

In `loadSite()`, create `DataScopeRegistry` alongside existing state. Populate it in the activation callback when a page component has `dataScope` in its props. Pass it to `createDataPipeline`.

- [ ] **Step 7: Run tests**

Run: `yarn workspace @casehub/runtime run test`
Expected: All tests pass, including the new form activation test.

- [ ] **Step 8: Commit**

```
git add packages/casehub-runtime/src/activation.ts \
       packages/casehub-runtime/src/data-pipeline.ts \
       packages/casehub-runtime/src/site.ts \
       packages/casehub-runtime/src/form-activation.test.ts
git commit -m "feat: form input activation with implicit lookup and hierarchical filters  Refs #34"
```

---

### Task 8: EditState, Save Triggers, and Record Change Invalidation

**Files:**
- Create: `packages/casehub-runtime/src/edit-state.ts`
- Create: `packages/casehub-runtime/src/edit-state.test.ts`
- Modify: `packages/casehub-runtime/src/site.ts` (casehub-field-change handler, save triggers)

**Interfaces:**
- Consumes: `CasehubFieldChangeDetail` from Task 6; `SaveConfig` from Task 1; `DataScopeRegistry` from Task 4; `ComponentRegistry` from existing
- Produces: `EditState` type; `createEditState()`, `updateEditState()`, `clearEditState()`, `getEditState()`; `SaveTriggerController` managing timers and flush logic

- [ ] **Step 1: Write EditState module with tests**

```typescript
// packages/casehub-runtime/src/edit-state.ts
export type EditState = Map<string, Map<string, unknown>>;

export function createEditState(): EditState {
  return new Map();
}

export function updateEditState(
  state: EditState,
  pagePath: string,
  field: string,
  value: unknown,
): void {
  let pageState = state.get(pagePath);
  if (!pageState) {
    pageState = new Map();
    state.set(pagePath, pageState);
  }
  pageState.set(field, value);
}

export function clearEditState(state: EditState, pagePath: string): void {
  state.delete(pagePath);
}

export function getEditState(state: EditState, pagePath: string): ReadonlyMap<string, unknown> | undefined {
  return state.get(pagePath);
}

export function isDirty(state: EditState, pagePath: string): boolean {
  const ps = state.get(pagePath);
  return ps !== undefined && ps.size > 0;
}
```

```typescript
// packages/casehub-runtime/src/edit-state.test.ts
import { describe, it, expect } from "vitest";
import { createEditState, updateEditState, clearEditState, getEditState, isDirty } from "./edit-state.js";

describe("EditState", () => {
  it("tracks dirty fields per page", () => {
    const es = createEditState();
    updateEditState(es, "Form", "name", "Bob");
    expect(isDirty(es, "Form")).toBe(true);
    expect(getEditState(es, "Form")!.get("name")).toBe("Bob");
  });

  it("clears state for a page", () => {
    const es = createEditState();
    updateEditState(es, "Form", "name", "Bob");
    clearEditState(es, "Form");
    expect(isDirty(es, "Form")).toBe(false);
  });

  it("tracks multiple fields independently", () => {
    const es = createEditState();
    updateEditState(es, "Form", "name", "Bob");
    updateEditState(es, "Form", "age", 30);
    expect(getEditState(es, "Form")!.size).toBe(2);
  });

  it("isolates pages", () => {
    const es = createEditState();
    updateEditState(es, "Page1", "x", 1);
    updateEditState(es, "Page2", "y", 2);
    clearEditState(es, "Page1");
    expect(isDirty(es, "Page1")).toBe(false);
    expect(isDirty(es, "Page2")).toBe(true);
  });
});
```

- [ ] **Step 2: Wire casehub-field-change handler into site.ts**

Add event listener in `loadSite()`:

```typescript
target.addEventListener("casehub-field-change", ((e: Event) => {
  const detail = (e as CustomEvent).detail;
  if (!detail) return;
  const componentId = findComponentId(e);
  if (!componentId) return;
  const entry = registry.get(componentId);
  if (!entry) return;

  updateEditState(editState, entry.pagePath, detail.field, detail.value);

  const scope = getDataScope(dataScopeRegistry, entry.pagePath);
  if (!scope) return;
  const saveConfig = /* retrieve SaveConfig for this pagePath from stored page props */;
  if (!saveConfig) return;

  if (saveConfig.trigger === "auto" || saveConfig.trigger === undefined) {
    resetAutoSaveTimer(entry.pagePath, saveConfig.delay ?? 2000);
  } else if (saveConfig.trigger === "field" && detail.committed) {
    flushSave(entry.pagePath);
  }
}) as EventListener, { signal: abortController.signal });
```

- [ ] **Step 3: Implement record change invalidation**

In the child-page re-push section of the filter handler, before re-pushing, compare record identity:

```typescript
const scope = getDataScope(dataScopeRegistry, candidate.pagePath);
if (scope && isDirty(editState, candidate.pagePath)) {
  cancelAutoSaveTimer(candidate.pagePath);
  clearEditState(editState, candidate.pagePath);
}
```

- [ ] **Step 4: Run tests**

Run: `yarn workspace @casehub/runtime run test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```
git add packages/casehub-runtime/src/edit-state.ts \
       packages/casehub-runtime/src/edit-state.test.ts \
       packages/casehub-runtime/src/site.ts
git commit -m "feat: EditState, casehub-field-change handler, save triggers, record invalidation  Refs #34"
```

---

### Task 9: Save Adapters and Post-Save Synchronization

**Files:**
- Create: `packages/casehub-runtime/src/save-adapter.ts`
- Create: `packages/casehub-runtime/src/adapters/local-adapter.ts`
- Create: `packages/casehub-runtime/src/adapters/rest-adapter.ts`
- Create: `packages/casehub-runtime/src/adapters/local-adapter.test.ts`
- Create: `packages/casehub-runtime/src/adapters/rest-adapter.test.ts`
- Modify: `packages/casehub-runtime/src/site.ts` (SiteOptions.adapters, flushSave, post-save sync)

**Interfaces:**
- Consumes: `DataSetId`, `ColumnId` from `@casehub/data`; `DataSetManager` from `@casehub/data`; `EditState` from Task 8; `ComponentRegistry` from existing
- Produces: `SaveAdapter` interface; `SaveResult` interface; `createLocalAdapter(manager): SaveAdapter`; `createRestAdapter(config, datasetUrl): SaveAdapter`; `SiteOptions.adapters`

- [ ] **Step 1: Write SaveAdapter interface**

```typescript
// packages/casehub-runtime/src/save-adapter.ts
import type { DataSetId } from "@casehub/data/dist/dataset/types.js";

export interface SaveAdapter {
  save(
    dataSetId: DataSetId,
    record: Readonly<Record<string, unknown>>,
    changedFields: readonly string[],
    idColumn: string,
    idValue: unknown,
  ): Promise<SaveResult>;

  delete?(
    dataSetId: DataSetId,
    idColumn: string,
    idValue: unknown,
  ): Promise<SaveResult>;
}

export interface SaveResult {
  readonly success: boolean;
  readonly error?: string;
  readonly updatedRecord?: Readonly<Record<string, unknown>>;
}
```

- [ ] **Step 2: Implement local adapter with tests**

```typescript
// packages/casehub-runtime/src/adapters/local-adapter.ts
import type { SaveAdapter, SaveResult } from "../save-adapter.js";
import type { DataSetId, ColumnId, TypedDataSet } from "@casehub/data/dist/dataset/types.js";
import type { DataSetManager } from "@casehub/data/dist/dataset/manager.js";
import { createTypedRow } from "@casehub/data/dist/dataset/conversion.js";

export function createLocalAdapter(manager: DataSetManager): SaveAdapter {
  return {
    async save(dataSetId, record, changedFields, idColumn, idValue): Promise<SaveResult> {
      const existing = manager.get(dataSetId);
      if (!existing) return { success: false, error: `Dataset "${String(dataSetId)}" not found` };

      const rowIndex = existing.rows.findIndex(row => {
        const cell = row.cell(idColumn as ColumnId);
        return cell.type !== "NULL" && String(cell.value) === String(idValue);
      });

      if (rowIndex === -1) return { success: false, error: `Record with ${idColumn}=${String(idValue)} not found` };

      const oldRow = existing.rows[rowIndex]!;
      const newCells = oldRow.cells.map((cell, i) => {
        const col = existing.columns[i]!;
        if (changedFields.includes(col.id as string)) {
          const newValue = record[col.id as string];
          return newValue === null || newValue === undefined
            ? { type: "NULL" as const }
            : { ...cell, value: newValue as any };
        }
        return cell;
      });

      const newRow = createTypedRow(newCells, existing.columns);
      const newRows = [...existing.rows];
      newRows[rowIndex] = newRow;
      const newDataset: TypedDataSet = { columns: existing.columns, rows: newRows };
      manager.register(dataSetId, newDataset);

      return { success: true };
    },
  };
}
```

- [ ] **Step 3: Implement rest adapter with tests**

```typescript
// packages/casehub-runtime/src/adapters/rest-adapter.ts
import type { SaveAdapter, SaveResult } from "../save-adapter.js";
import type { DataSetId } from "@casehub/data/dist/dataset/types.js";

export interface RestAdapterConfig {
  readonly method?: "PUT" | "PATCH" | "POST";
  readonly headers?: Readonly<Record<string, string>>;
}

export function createRestAdapter(
  config: RestAdapterConfig | undefined,
  datasetUrl: string,
  fetchFn: typeof globalThis.fetch,
): SaveAdapter {
  const method = config?.method ?? "PATCH";

  return {
    async save(dataSetId, record, changedFields, idColumn, idValue): Promise<SaveResult> {
      const url = `${datasetUrl}/${String(idValue)}`;
      const body: Record<string, unknown> = {};
      for (const field of changedFields) {
        body[field] = record[field];
      }

      try {
        const response = await fetchFn(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...config?.headers,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
        }

        const contentType = response.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          const updatedRecord = await response.json();
          return { success: true, updatedRecord };
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
```

- [ ] **Step 4: Write tests for both adapters**

Test local adapter with a mock DataSetManager. Test rest adapter with a mock fetch that captures the request and returns configured responses.

- [ ] **Step 5: Update SiteOptions and wire post-save sync in site.ts**

Add `adapters` to `SiteOptions`:

```typescript
export interface SiteOptions {
  readonly permissions?: PermissionContext;
  readonly fetch?: typeof globalThis.fetch;
  readonly baseUrl?: string;
  readonly providerConfig?: DataProviderConfig;
  readonly adapters?: Readonly<Record<string, SaveAdapter>>;
}
```

Implement `flushSave()` in `loadSite()`:

```typescript
async function flushSave(pagePath: string): Promise<void> {
  const scope = getDataScope(dataScopeRegistry, pagePath);
  if (!scope) return;
  const pageState = getEditState(editState, pagePath);
  if (!pageState || pageState.size === 0) return;

  const saveConfig = /* retrieve from stored page props */;
  const adapter = resolveAdapter(saveConfig.adapter);
  if (!adapter) return;

  const changedFields = [...pageState.keys()];
  const record = Object.fromEntries(pageState);
  // Get current record's id from the filtered dataset
  const idValue = getCurrentIdValue(scope, pagePath);
  if (idValue === undefined) return;

  const result = await adapter.save(scope.dataset, record, changedFields, scope.idColumn, idValue);

  if (result.success) {
    clearEditState(editState, pagePath);
    // Post-save sync: re-push all components referencing this dataset
    for (const [id, entry] of registry) {
      if (entry.originalLookup?.dataSetId === scope.dataset && entry.vizElement) {
        pipeline.handleDataRequest(entry.vizElement as unknown as VizTarget, entry.originalLookup, id);
      }
    }
  }
}
```

- [ ] **Step 6: Run all tests**

Run: `yarn workspace @casehub/runtime run test`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```
git add packages/casehub-runtime/src/save-adapter.ts \
       packages/casehub-runtime/src/adapters/ \
       packages/casehub-runtime/src/site.ts
git commit -m "feat: save adapters (local + rest), SiteOptions.adapters, post-save sync  Refs #34"
```

---

### Task 10: Gallery Example — Contact Manager

**Files:**
- Create: `examples/dashboards/Basic Usage/Contact Manager.dash.yaml`
- Modify: `examples/dashboards/Basic Usage/Kitchensink.dash.yml` (replace broken Forms page)

**Interfaces:**
- Consumes: All prior tasks — form inputs, dataScope, save, master-detail
- Produces: Working gallery example demonstrating all six form input types in a master-detail layout

- [ ] **Step 1: Create Contact Manager dashboard**

Create `examples/dashboards/Basic Usage/Contact Manager.dash.yaml` with the YAML from the spec's Gallery Example section (datasets with contacts, Contact List page with table, Contact Form page with all six input types).

- [ ] **Step 2: Update Kitchensink Forms page**

Replace the broken `uniforms` EXTERNAL component on the Forms page with a native form example using `text-input` and `dropdown` components with inline data.

- [ ] **Step 3: Build and verify**

Run: `yarn build && yarn workspace @melviz/examples run serve`

Open browser, navigate to Contact Manager example. Verify:
- Table renders contacts
- Clicking a row populates the form
- All six input types render correctly
- Editing a field triggers auto-save (local adapter — changes reflected in table)
- Navigating to a different record clears edits

- [ ] **Step 4: Commit**

```
git add examples/dashboards/
git commit -m "feat: Contact Manager gallery example with native forms  Refs #34"
```

---

## Dependency Graph

```
Task 1 (model types)
├── Task 2 (DSL builders)
├── Task 3 (YAML parser)
├── Task 4 (hierarchical filters)
│   └── Task 5 ($ref resolution)
└── Task 6 (Web Components)
    └── Task 7 (activation + pipeline integration)
        ├── depends on Task 4, Task 5
        └── Task 8 (EditState + save triggers)
            └── Task 9 (save adapters + post-save sync)
                └── Task 10 (gallery example)
```

Tasks 2, 3, 4, 6 can execute in parallel after Task 1. Tasks 5, 7 require their predecessors. Tasks 8, 9, 10 are sequential.
