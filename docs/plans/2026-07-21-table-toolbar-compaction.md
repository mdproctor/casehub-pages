# Table Toolbar Compaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> executing-plans to implement this plan task-by-task. Each task follows TDD
> (test-driven-development) and uses ide-tooling for structural editing.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Focal issue:** #199 — Table toolbar compaction — move kebab menu to header bar, on-demand filter
**Issue group:** #221, #201, #184, #219, #199

**Goal:** Eliminate the toolbar row from pages-table, moving all controls into a sticky
kebab menu in the header bar, with the filter input as an on-demand bar between header
and body.

**Architecture:** Single-component change in `PagesTable`. The existing `_renderToolbar()`
method is replaced by `_renderKebabZone()` (sticky absolute-positioned kebab in
`.header-container`) and `_renderFilterBar()` (conditional flex row between header and
body). New `@state() _filterBarOpen` controls filter bar visibility. No public API changes.

**Tech Stack:** Lit, TypeScript, Vitest, CSS-in-JS via Lit `css` tagged template

## Global Constraints

- All CSS tokens use `--pages-` prefix with OKLCH 12-step scales (css-design-tokens protocol)
- Guarded `customElements.define()` pattern (already applied in prior commit)
- `embedded = true` suppresses kebab button and filter bar (same as current toolbar suppression)
- No new public properties or events — `clientFilter`, `filterText`, filter events unchanged

---

### Task 1: Remove toolbar, add kebab zone in header

**Files:**
- Modify: `packages/pages-table/src/pages-table.ts` (CSS + template)
- Test: `packages/pages-table/src/pages-table.test.ts`

**Interfaces:**
- Produces: `.kebab-zone` element with `⋮` button in `.header-container`; `.toolbar` class removed

- [ ] **Step 1: Update existing toolbar tests to expect new structure**

Replace the toolbar tests to verify the new kebab zone:

```typescript
// In describe('embedded mode'):

// Update: 'suppresses toolbar when embedded is true'
// → 'suppresses kebab zone when embedded is true'
// Query for .kebab-zone instead of .toolbar

// Update: 'shows toolbar when embedded is false (default)'
// → 'shows kebab zone when embedded is false (default)'
// Query for .kebab-zone instead of .toolbar

// In describe('column picker'):

// Update: 'toolbar is above header, not beside it'
// → 'kebab zone is inside header-container'
// Verify .kebab-zone is a child of .header-container
```

```typescript
it('kebab zone is inside header-container', async () => {
  el.dataSet = testDataSet;
  el.columnConfig = testConfig;
  await el.updateComplete;
  const headerContainer = el.shadowRoot!.querySelector('.header-container');
  const kebabZone = headerContainer!.querySelector('.kebab-zone');
  expect(kebabZone).not.toBeNull();
});

it('suppresses kebab zone when embedded is true', async () => {
  el.dataSet = testDataSet;
  el.columnConfig = testConfig;
  (el as any).embedded = true;
  await el.updateComplete;
  const kebabZone = el.shadowRoot!.querySelector('.kebab-zone');
  expect(kebabZone).toBeNull();
});

it('shows kebab zone when embedded is false (default)', async () => {
  el.dataSet = testDataSet;
  el.columnConfig = testConfig;
  await el.updateComplete;
  const kebabZone = el.shadowRoot!.querySelector('.kebab-zone');
  expect(kebabZone).not.toBeNull();
});

it('header-container has padding-right for kebab zone', async () => {
  el.dataSet = testDataSet;
  el.columnConfig = testConfig;
  await el.updateComplete;
  const header = el.shadowRoot!.querySelector('.header-container') as HTMLElement;
  expect(header).not.toBeNull();
});

it('kebab zone renders in empty-state path', async () => {
  el.dataSet = makeDataSet([]);
  el.columnConfig = testConfig;
  await el.updateComplete;
  const kebabZone = el.shadowRoot!.querySelector('.kebab-zone');
  expect(kebabZone).not.toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `GH_PACKAGES_TOKEN="" yarn --cwd /Users/mdproctor/claude/casehub/worktrees/14/pages workspace @casehubio/pages-data-table run test -- --run`
Expected: FAIL — `.kebab-zone` not found, `.toolbar` still exists

- [ ] **Step 3: Remove `_renderToolbar()`, add `_renderKebabZone()`**

Replace the `_renderToolbar` method body with a new `_renderKebabZone` method.
Remove the `.toolbar` CSS block. Add `.kebab-zone` CSS.

CSS changes in `static override styles`:
- Remove: `.toolbar { ... }` block
- Remove: `.filter-input`, `.filter-input::placeholder`, `.filter-input:focus` blocks (will be re-added in Task 2 under `.filter-bar`)
- Add new CSS:

```css
.kebab-zone {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  padding-right: var(--pages-space-2, 8px);
  z-index: 2;
  background: linear-gradient(to right, transparent, var(--pages-neutral-2, #fafafa) 8px);
}
```

Update `.header-container` to add `padding-right: var(--pages-space-10, 40px)`.

Replace `_renderToolbar()` method with:

```typescript
private _renderKebabZone() {
  const showFilter = (this.clientFilter && this.totalRows === undefined) || this._pipelineMode;
  const visibleCount = this._visibleColumns.length;
  const modes: Array<{ value: DisplayMode; label: string }> = [
    { value: 'auto', label: 'Auto' },
    { value: 'paginated', label: 'Pages' },
    { value: 'scroll', label: 'Scroll' },
  ];

  return html`
    <div class="kebab-zone">
      <div
        class="column-picker-wrapper"
        @mouseleave="${this._handlePickerMouseLeave}"
        @mouseenter="${this._handlePickerMouseEnter}"
      >
        <button
          class="column-picker-trigger${this.filterText ? ' filter-active' : ''}"
          @click="${this._toggleColumnPicker}"
          aria-label="Table options"
          aria-haspopup="menu"
          aria-expanded="${this._columnPickerOpen ? 'true' : 'false'}"
        >
          ⋮
        </button>
        ${this._columnPickerOpen ? html`
          <div class="column-picker-dropdown">
            ${showFilter ? html`
              <button
                class="picker-menu-item${this._filterBarOpen ? ' active' : ''}"
                @click="${() => { this._filterBarOpen = !this._filterBarOpen; }}"
              >🔍 Filter</button>
            ` : nothing}
            <div class="picker-section-label">Columns</div>
            ${this._dataColumns.map(col => {
              const config = this._configFor(col);
              const colId = String(col.id);
              const isVisible = !this._hiddenColumnIds.has(colId) && config?.visible !== false;
              const isLastVisible = isVisible && visibleCount === 1;
              return html`
                <label class="column-picker-item">
                  <input
                    type="checkbox"
                    .checked="${isVisible}"
                    ?disabled="${isLastVisible}"
                    @change="${() => this._toggleColumnVisibility(colId)}"
                  />
                  <span>${config?.label ?? col.name}</span>
                </label>
              `;
            })}
            <div class="picker-divider"></div>
            <div class="picker-section-label">Display</div>
            <div class="mode-switcher" role="radiogroup" aria-label="Display mode">
              ${modes.map(m => html`
                <button
                  role="radio"
                  aria-pressed=${this.mode === m.value ? 'true' : 'false'}
                  ?disabled=${!!this.groupBy}
                  @click=${() => this._setMode(m.value)}
                >${m.label}</button>
              `)}
            </div>
            ${this._csvExportEnabled && this.dataSet ? html`
              <div class="picker-divider"></div>
              <button class="picker-menu-item" @click="${() => downloadCsv(tableToCsv(this.dataSet!, this.columnConfig))}">⬇ Download CSV</button>
              <button class="picker-menu-item" @click="${this._handleCopyToClipboard}">📋 Copy CSV</button>
            ` : nothing}
          </div>
        ` : nothing}
      </div>
    </div>
  `;
}
```

Update `render()` — replace `${this.embedded ? nothing : this._renderToolbar()}` with
the kebab zone inside `.header-container`:

```typescript
// Before (in both normal and empty-state render paths):
${this.embedded ? nothing : this._renderToolbar()}
<div class="header-container">

// After:
<div class="header-container">
  <div ...header grid... >
    ...column headers...
  </div>
  ${this.embedded ? nothing : this._renderKebabZone()}
```

Add new CSS for `.picker-menu-item`:

```css
.picker-menu-item {
  display: block;
  width: 100%;
  padding: var(--pages-space-2, 8px) var(--pages-space-3, 12px);
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;
  font-size: var(--pages-font-size-sm, 12px);
  color: var(--pages-neutral-11, #404040);
}
.picker-menu-item:hover {
  background: var(--pages-neutral-2, #fafafa);
}
.picker-menu-item.active {
  color: var(--pages-primary-9, #3b82f6);
  font-weight: var(--pages-font-weight-medium, 500);
}
.filter-active::after {
  content: '';
  position: absolute;
  top: 2px;
  right: 2px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--pages-primary-9, #3b82f6);
}
.column-picker-trigger {
  position: relative;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `GH_PACKAGES_TOKEN="" yarn --cwd /Users/mdproctor/claude/casehub/worktrees/14/pages workspace @casehubio/pages-data-table run test -- --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/worktrees/14/pages add packages/pages-table/src/pages-table.ts packages/pages-table/src/pages-table.test.ts
git -C /Users/mdproctor/claude/casehub/worktrees/14/pages commit -m "refactor(#199): replace toolbar row with sticky kebab zone in header"
```

---

### Task 2: Add filter bar between header and body

**Files:**
- Modify: `packages/pages-table/src/pages-table.ts` (state, CSS, template, method)
- Test: `packages/pages-table/src/pages-table.test.ts`

**Interfaces:**
- Consumes: `_renderKebabZone()` from Task 1 (kebab toggle sets `_filterBarOpen`)
- Produces: `_filterBarOpen: boolean` state, `_renderFilterBar()` method

- [ ] **Step 1: Write failing tests for filter bar**

```typescript
describe('filter bar', () => {
  it('filter bar is hidden by default', async () => {
    el.dataSet = testDataSet;
    el.columnConfig = testConfig;
    el.clientFilter = true;
    await el.updateComplete;
    const filterBar = el.shadowRoot!.querySelector('.filter-bar');
    expect(filterBar).toBeNull();
  });

  it('filter bar appears when _filterBarOpen is true', async () => {
    el.dataSet = testDataSet;
    el.columnConfig = testConfig;
    el.clientFilter = true;
    (el as any)._filterBarOpen = true;
    await el.updateComplete;
    const filterBar = el.shadowRoot!.querySelector('.filter-bar');
    expect(filterBar).not.toBeNull();
  });

  it('filter bar is between header-container and body', async () => {
    el.dataSet = testDataSet;
    el.columnConfig = testConfig;
    el.clientFilter = true;
    (el as any)._filterBarOpen = true;
    await el.updateComplete;
    const dataTable = el.shadowRoot!.querySelector('.data-table')!;
    const children = Array.from(dataTable.children);
    const headerContainer = dataTable.querySelector('.header-container');
    const filterBar = dataTable.querySelector('.filter-bar');
    const body = dataTable.querySelector('.body');
    expect(children.indexOf(filterBar!)).toBeGreaterThan(children.indexOf(headerContainer!));
    expect(children.indexOf(filterBar!)).toBeLessThan(children.indexOf(body!));
  });

  it('filter bar renders in empty-state path', async () => {
    el.dataSet = makeDataSet([]);
    el.columnConfig = testConfig;
    el.clientFilter = true;
    (el as any)._filterBarOpen = true;
    await el.updateComplete;
    const filterBar = el.shadowRoot!.querySelector('.filter-bar');
    expect(filterBar).not.toBeNull();
  });

  it('filter bar suppressed when embedded is true', async () => {
    el.dataSet = testDataSet;
    el.columnConfig = testConfig;
    el.clientFilter = true;
    (el as any).embedded = true;
    (el as any)._filterBarOpen = true;
    await el.updateComplete;
    const filterBar = el.shadowRoot!.querySelector('.filter-bar');
    expect(filterBar).toBeNull();
  });

  it('close button hides filter bar', async () => {
    el.dataSet = testDataSet;
    el.columnConfig = testConfig;
    el.clientFilter = true;
    (el as any)._filterBarOpen = true;
    await el.updateComplete;
    const closeBtn = el.shadowRoot!.querySelector('.filter-bar-close') as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();
    closeBtn.click();
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('.filter-bar')).toBeNull();
  });

  it('preserves filter text when closing filter bar', async () => {
    el.dataSet = testDataSet;
    el.columnConfig = testConfig;
    el.clientFilter = true;
    el.filterText = 'Alice';
    (el as any)._filterBarOpen = true;
    await el.updateComplete;
    const closeBtn = el.shadowRoot!.querySelector('.filter-bar-close') as HTMLButtonElement;
    closeBtn.click();
    await el.updateComplete;
    expect(el.filterText).toBe('Alice');
  });

  it('filter bar contains search input with role searchbox', async () => {
    el.dataSet = testDataSet;
    el.columnConfig = testConfig;
    el.clientFilter = true;
    (el as any)._filterBarOpen = true;
    await el.updateComplete;
    const input = el.shadowRoot!.querySelector('.filter-bar input[role="searchbox"]');
    expect(input).not.toBeNull();
  });

  it('filter bar container has role search', async () => {
    el.dataSet = testDataSet;
    el.columnConfig = testConfig;
    el.clientFilter = true;
    (el as any)._filterBarOpen = true;
    await el.updateComplete;
    const bar = el.shadowRoot!.querySelector('.filter-bar[role="search"]');
    expect(bar).not.toBeNull();
  });

  it('filter bar arrow keys do not propagate', async () => {
    el.dataSet = testDataSet;
    el.columnConfig = testConfig;
    el.clientFilter = true;
    (el as any)._filterBarOpen = true;
    await el.updateComplete;
    const input = el.shadowRoot!.querySelector('.filter-bar input') as HTMLInputElement;
    const propagated: string[] = [];
    el.addEventListener('keydown', (e: Event) => propagated.push((e as KeyboardEvent).key));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(propagated).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `GH_PACKAGES_TOKEN="" yarn --cwd /Users/mdproctor/claude/casehub/worktrees/14/pages workspace @casehubio/pages-data-table run test -- --run`
Expected: FAIL

- [ ] **Step 3: Add `_filterBarOpen` state and `_renderFilterBar()` method**

Add state property:
```typescript
@state() private _filterBarOpen = false;
```

Add filter bar CSS:
```css
.filter-bar {
  display: flex;
  align-items: center;
  gap: var(--pages-space-2, 8px);
  padding: var(--pages-space-2, 8px);
  border-bottom: 1px solid var(--pages-neutral-4, #e5e5e5);
  background: var(--pages-neutral-1, #ffffff);
  flex-shrink: 0;
}
.filter-bar-input {
  flex: 1;
  padding: var(--pages-space-1, 4px) var(--pages-space-2, 8px);
  border: 1px solid var(--pages-neutral-5, #e0e0e0);
  background: var(--pages-neutral-1, #ffffff);
  border-radius: 4px;
  font-size: 13px;
  color: var(--pages-neutral-12, #171717);
}
.filter-bar-input::placeholder {
  color: var(--pages-neutral-8, #8c8c8c);
}
.filter-bar-input:focus {
  outline: 2px solid var(--pages-primary-9, #3b82f6);
  outline-offset: 0;
  border-color: var(--pages-primary-9, #3b82f6);
}
.filter-bar-close {
  padding: var(--pages-space-1, 4px) var(--pages-space-2, 8px);
  border: none;
  background: none;
  cursor: pointer;
  font-size: 14px;
  color: var(--pages-neutral-9, #737373);
}
.filter-bar-close:hover {
  color: var(--pages-neutral-12, #171717);
}
```

Add method:
```typescript
private _onFilterBarKeydown = (e: KeyboardEvent): void => {
  if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
    e.stopPropagation();
  }
};

private _renderFilterBar() {
  if (!this._filterBarOpen) return nothing;
  return html`
    <div class="filter-bar" role="search" aria-label="Filter table" @keydown="${this._onFilterBarKeydown}">
      <input
        class="filter-bar-input"
        type="text"
        role="searchbox"
        aria-label="Filter table"
        placeholder="Filter..."
        .value="${this.filterText}"
        @input="${(e: Event) => { this.filterText = (e.target as HTMLInputElement).value; }}"
      />
      <button class="filter-bar-close" aria-label="Close filter" @click="${() => { this._filterBarOpen = false; }}">✕</button>
    </div>
  `;
}
```

Insert in `render()` — in both normal and empty-state paths, between `.header-container`
closing tag and `.body` / `.empty-state`:
```typescript
${!this.embedded ? this._renderFilterBar() : nothing}
```

Add focus scheduling in `willUpdate`:
```typescript
if (changed.has('_filterBarOpen') && this._filterBarOpen) {
  this.updateComplete.then(() => {
    const input = this.shadowRoot?.querySelector('.filter-bar-input') as HTMLInputElement | null;
    input?.focus();
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `GH_PACKAGES_TOKEN="" yarn --cwd /Users/mdproctor/claude/casehub/worktrees/14/pages workspace @casehubio/pages-data-table run test -- --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/worktrees/14/pages add packages/pages-table/src/pages-table.ts packages/pages-table/src/pages-table.test.ts
git -C /Users/mdproctor/claude/casehub/worktrees/14/pages commit -m "feat(#199): add on-demand filter bar between header and body"
```

---

### Task 3: Keyboard shortcuts and Escape priority

**Files:**
- Modify: `packages/pages-table/src/pages-table.ts` (`_handleKeyDown`)
- Test: `packages/pages-table/src/pages-table.test.ts`

**Interfaces:**
- Consumes: `_filterBarOpen` from Task 2, `_columnPickerOpen` existing
- Produces: `/` shortcut opens filter bar, `Escape` layered dismissal

- [ ] **Step 1: Write failing tests for keyboard interaction**

```typescript
describe('filter bar keyboard', () => {
  it('/ key opens filter bar when table has focus', async () => {
    el.dataSet = testDataSet;
    el.columnConfig = testConfig;
    el.clientFilter = true;
    await el.updateComplete;
    const dataTable = el.shadowRoot!.querySelector('.data-table') as HTMLElement;
    dataTable.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('.filter-bar')).not.toBeNull();
  });

  it('/ key is no-op when filter bar is already open', async () => {
    el.dataSet = testDataSet;
    el.columnConfig = testConfig;
    el.clientFilter = true;
    (el as any)._filterBarOpen = true;
    await el.updateComplete;
    const input = el.shadowRoot!.querySelector('.filter-bar-input') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('.filter-bar')).not.toBeNull();
  });

  it('/ key is no-op when embedded', async () => {
    el.dataSet = testDataSet;
    el.columnConfig = testConfig;
    el.clientFilter = true;
    (el as any).embedded = true;
    await el.updateComplete;
    const dataTable = el.shadowRoot!.querySelector('.data-table') as HTMLElement;
    dataTable.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('.filter-bar')).toBeNull();
  });

  it('/ key is no-op when filter not enabled', async () => {
    el.dataSet = testDataSet;
    el.columnConfig = testConfig;
    el.clientFilter = false;
    await el.updateComplete;
    const dataTable = el.shadowRoot!.querySelector('.data-table') as HTMLElement;
    dataTable.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('.filter-bar')).toBeNull();
  });

  it('Escape closes dropdown first when both dropdown and filter bar open', async () => {
    el.dataSet = testDataSet;
    el.columnConfig = testConfig;
    el.clientFilter = true;
    (el as any)._filterBarOpen = true;
    (el as any)._columnPickerOpen = true;
    await el.updateComplete;
    const dataTable = el.shadowRoot!.querySelector('.data-table') as HTMLElement;
    dataTable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('.column-picker-dropdown')).toBeNull();
    expect(el.shadowRoot!.querySelector('.filter-bar')).not.toBeNull();
  });

  it('Escape closes filter bar when dropdown is closed and filter input focused', async () => {
    el.dataSet = testDataSet;
    el.columnConfig = testConfig;
    el.clientFilter = true;
    (el as any)._filterBarOpen = true;
    await el.updateComplete;
    const input = el.shadowRoot!.querySelector('.filter-bar-input') as HTMLInputElement;
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('.filter-bar')).toBeNull();
  });

  it('empty-state table responds to / key', async () => {
    el.dataSet = makeDataSet([]);
    el.columnConfig = testConfig;
    el.clientFilter = true;
    await el.updateComplete;
    const dataTable = el.shadowRoot!.querySelector('.data-table') as HTMLElement;
    dataTable.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('.filter-bar')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `GH_PACKAGES_TOKEN="" yarn --cwd /Users/mdproctor/claude/casehub/worktrees/14/pages workspace @casehubio/pages-data-table run test -- --run`
Expected: FAIL

- [ ] **Step 3: Add keyboard handling to `_handleKeyDown`**

In `_handleKeyDown`, add before the `isRowTarget` guard:

```typescript
// / key — open filter bar
if (e.key === '/' && !this.embedded) {
  const tag = (e.target as HTMLElement).tagName;
  const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;
  if (!isEditable) {
    const showFilter = (this.clientFilter && this.totalRows === undefined) || this._pipelineMode;
    if (showFilter && !this._filterBarOpen) {
      e.preventDefault();
      this._filterBarOpen = true;
      return;
    }
  }
}

// Escape — layered dismissal
if (e.key === 'Escape') {
  if (this._columnPickerOpen) {
    this._columnPickerOpen = false;
    e.preventDefault();
    return;
  }
  if (this._filterBarOpen) {
    this._filterBarOpen = false;
    e.preventDefault();
    if (this.rovingIndex >= 0 && this._dataRows.length > 0) {
      this._focusRow(this.rovingIndex);
    } else {
      (this.shadowRoot?.querySelector('.data-table') as HTMLElement | null)?.focus();
    }
    return;
  }
}
```

Add `@keydown="${this._handleKeyDown}"` to the empty-state `.data-table` div (it's
missing in the current render — only the normal data path has it).

- [ ] **Step 4: Run tests to verify they pass**

Run: `GH_PACKAGES_TOKEN="" yarn --cwd /Users/mdproctor/claude/casehub/worktrees/14/pages workspace @casehubio/pages-data-table run test -- --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/worktrees/14/pages add packages/pages-table/src/pages-table.ts packages/pages-table/src/pages-table.test.ts
git -C /Users/mdproctor/claude/casehub/worktrees/14/pages commit -m "feat(#199): add / shortcut and Escape layered dismissal for filter bar"
```

---

### Task 4: Accessibility — ARIA and live region

**Files:**
- Modify: `packages/pages-table/src/pages-table.ts`
- Test: `packages/pages-table/src/pages-table.test.ts`

**Interfaces:**
- Consumes: `_filterBarOpen`, `_renderFilterBar()`, `_renderKebabZone()` from Tasks 1-3
- Produces: `aria-haspopup`, `aria-expanded` on kebab; `role="search"` on filter bar; live region for result count

- [ ] **Step 1: Write failing tests for ARIA attributes**

```typescript
describe('filter bar accessibility', () => {
  it('kebab button has aria-haspopup and aria-expanded', async () => {
    el.dataSet = testDataSet;
    el.columnConfig = testConfig;
    await el.updateComplete;
    const trigger = el.shadowRoot!.querySelector('.column-picker-trigger') as HTMLElement;
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('kebab aria-expanded reflects dropdown state', async () => {
    el.dataSet = testDataSet;
    el.columnConfig = testConfig;
    await el.updateComplete;
    const trigger = el.shadowRoot!.querySelector('.column-picker-trigger') as HTMLButtonElement;
    trigger.click();
    await el.updateComplete;
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('filter active dot appears when filterText is non-empty and bar is closed', async () => {
    el.dataSet = testDataSet;
    el.columnConfig = testConfig;
    el.clientFilter = true;
    el.filterText = 'Alice';
    (el as any)._filterBarOpen = false;
    await el.updateComplete;
    const trigger = el.shadowRoot!.querySelector('.column-picker-trigger') as HTMLElement;
    expect(trigger.classList.contains('filter-active')).toBe(true);
  });

  it('no filter dot when filterText is empty', async () => {
    el.dataSet = testDataSet;
    el.columnConfig = testConfig;
    el.clientFilter = true;
    el.filterText = '';
    await el.updateComplete;
    const trigger = el.shadowRoot!.querySelector('.column-picker-trigger') as HTMLElement;
    expect(trigger.classList.contains('filter-active')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `GH_PACKAGES_TOKEN="" yarn --cwd /Users/mdproctor/claude/casehub/worktrees/14/pages workspace @casehubio/pages-data-table run test -- --run`
Expected: FAIL (aria-haspopup/aria-expanded were added in Task 1 — some tests may pass; filter-active dot test should fail if not wired to `filterText`)

- [ ] **Step 3: Wire filter-active indicator and verify ARIA**

The `filter-active` class on the kebab trigger should be conditional on `this.filterText`
being non-empty (regardless of `_filterBarOpen`). This was partially added in Task 1.
Verify the condition is `this.filterText` not `this._filterBarOpen && this.filterText`.

If ARIA tests pass from Task 1's implementation, move to step 4.

- [ ] **Step 4: Run tests to verify they pass**

Run: `GH_PACKAGES_TOKEN="" yarn --cwd /Users/mdproctor/claude/casehub/worktrees/14/pages workspace @casehubio/pages-data-table run test -- --run`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `GH_PACKAGES_TOKEN="" yarn --cwd /Users/mdproctor/claude/casehub/worktrees/14/pages workspace @casehubio/pages-data-table run test -- --run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/worktrees/14/pages add packages/pages-table/src/pages-table.ts packages/pages-table/src/pages-table.test.ts
git -C /Users/mdproctor/claude/casehub/worktrees/14/pages commit -m "feat(#199): add ARIA attributes and filter-active indicator

Closes #199"
```
