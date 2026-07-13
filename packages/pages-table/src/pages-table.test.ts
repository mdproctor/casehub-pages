import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { html } from 'lit';
import type { TypedDataSet, TypedRow, ColumnId } from '@casehubio/pages-data/dist/dataset/types.js';
import { ColumnType } from '@casehubio/pages-data/dist/dataset/types.js';
import { fromRows } from '@casehubio/pages-data/dist/dataset/conversion.js';
import type { TableColumnConfig, ColumnRenderer } from './types.js';

type TableEl = HTMLElement & {
  dataSet?: TypedDataSet;
  columnConfig?: readonly TableColumnConfig[];
  columnRenderers?: ReadonlyMap<ColumnId, ColumnRenderer>;
  mode: string;
  selection: string;
  loading: boolean;
  emptyMessage: string;
  getRowKey?: (row: TypedRow) => string;
  getRowClass?: (row: TypedRow) => string;
  getChildren?: (row: TypedRow) => readonly TypedRow[];
  getRowDetail?: (row: TypedRow) => unknown;
  detailMode?: string;
  expandedDetailKeys?: readonly string[];
  selectedKeys?: readonly string[];
  clientSort: boolean;
  clientFilter: boolean;
  filterText: string;
  pageSize: number;
  currentPage: number;
  totalRows?: number;
  hasMore: boolean;
  rowHeight: number;
  bufferSize: number;
  updateComplete: Promise<boolean>;
};

interface TestItem { id: string; name: string; age: number; created: Date; }

const idCol = 'id' as ColumnId;
const nameCol = 'name' as ColumnId;
const ageCol = 'age' as ColumnId;
const createdCol = 'created' as ColumnId;

function makeItem(i: number): TestItem {
  return { id: String(i), name: `Person ${i}`, age: 20 + i, created: new Date('2024-01-01') };
}

const testColumnDefs = [
  { id: nameCol, name: 'Name', type: ColumnType.TEXT, getValue: (r: TestItem) => r.name },
  { id: ageCol, name: 'Age', type: ColumnType.NUMBER, getValue: (r: TestItem) => r.age },
] as const;

const testConfig: TableColumnConfig[] = [
  { id: nameCol, width: '1fr' },
  { id: ageCol, width: '80px' },
];

function makeDataSet(items: TestItem[]): TypedDataSet {
  return fromRows(items, testColumnDefs);
}

function makeLargeDataSet(count: number): TypedDataSet {
  return fromRows(Array.from({ length: count }, (_, i) => makeItem(i)), testColumnDefs);
}

const testItems: TestItem[] = [
  { id: '1', name: 'Alice', age: 30, created: new Date('2024-01-01') },
  { id: '2', name: 'Bob', age: 25, created: new Date('2024-06-15') },
  { id: '3', name: 'Carol', age: 35, created: new Date('2024-03-10') },
];
const testDataSet = makeDataSet(testItems);

describe('pages-table', () => {
  let el: TableEl;

  beforeEach(async () => {
    await import('./pages-table.js');
    el = document.createElement('pages-table') as TableEl;
    document.body.appendChild(el);
  });

  afterEach(() => { el.remove(); });

  describe('core rendering', () => {
    it('renders column headers', async () => {
      el.dataSet = testDataSet;
      el.columnConfig = testConfig;
      await el.updateComplete;
      const headers = el.shadowRoot!.querySelectorAll('[role="columnheader"]');
      expect(headers.length).toBe(2);
      expect(headers[0]!.textContent).toContain('Name');
      expect(headers[1]!.textContent).toContain('Age');
    });

    it('renders cells from TypedDataSet', async () => {
      el.dataSet = testDataSet;
      el.columnConfig = testConfig;
      await el.updateComplete;
      const cells = el.shadowRoot!.querySelectorAll('[role="gridcell"]');
      expect(cells.length).toBe(6);
      expect(cells[0]!.textContent).toContain('Alice');
      expect(cells[1]!.textContent).toContain('30');
    });

    it('uses columnRenderers when provided', async () => {
      el.dataSet = testDataSet;
      el.columnRenderers = new Map([[nameCol, (cell) => `<${cell.type === 'NULL' ? '' : cell.value}>`]]);
      await el.updateComplete;
      const cell = el.shadowRoot!.querySelector('[role="gridcell"]')!;
      expect(cell.textContent).toContain('<Alice>');
    });

    it('formats dates by ColumnType', async () => {
      const ds = fromRows([testItems[0]!], [
        { id: createdCol, name: 'Created', type: ColumnType.DATE, getValue: (r: TestItem) => r.created },
      ]);
      el.dataSet = ds;
      await el.updateComplete;
      const cell = el.shadowRoot!.querySelector('[role="gridcell"]')!;
      expect(cell.textContent).not.toContain('2024-01-01T');
    });

    it('renders empty state', async () => {
      el.dataSet = makeDataSet([]);
      await el.updateComplete;
      expect(el.shadowRoot!.textContent).toContain('No data');
    });

    it('renders custom empty message', async () => {
      el.dataSet = makeDataSet([]);
      el.emptyMessage = 'Nothing here';
      await el.updateComplete;
      expect(el.shadowRoot!.textContent).toContain('Nothing here');
    });

    it('renders loading state', async () => {
      el.loading = true;
      await el.updateComplete;
      const busy = el.shadowRoot!.querySelector('[aria-busy="true"]');
      expect(busy).not.toBeNull();
    });

    it('sets role="grid" on container', async () => {
      el.dataSet = testDataSet;
      await el.updateComplete;
      expect(el.shadowRoot!.querySelector('[role="grid"]')).not.toBeNull();
    });

    it('sets aria-rowcount', async () => {
      el.dataSet = testDataSet;
      await el.updateComplete;
      const grid = el.shadowRoot!.querySelector('[role="grid"]')!;
      expect(grid.getAttribute('aria-rowcount')).toBe('4');
    });

    it('applies getRowClass as part attribute', async () => {
      el.dataSet = testDataSet;
      el.getRowClass = (r: TypedRow) => `priority-${r.text(nameCol).toLowerCase()}`;
      await el.updateComplete;
      const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
      expect(rows[0]!.getAttribute('part')).toContain('priority-alice');
    });

    it('alternating rows have even/odd classes for zebra striping', async () => {
      el.dataSet = testDataSet;
      await el.updateComplete;
      const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
      expect(rows[0]!.classList.contains('row-even')).toBe(true);
      expect(rows[1]!.classList.contains('row-odd')).toBe(true);
      expect(rows[2]!.classList.contains('row-even')).toBe(true);
    });
  });

  describe('auto mode', () => {
    it('renders all rows for small datasets', async () => {
      el.dataSet = testDataSet;
      await el.updateComplete;
      const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
      expect(rows.length).toBe(3);
    });

    it('activates virtual scroll for >50 rows', async () => {
      el.dataSet = makeLargeDataSet(100);
      await el.updateComplete;
      const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
      expect(rows.length).toBeLessThan(100);
    });
  });

  describe('paginated mode', () => {
    it('renders only pageSize rows', async () => {
      el.dataSet = makeLargeDataSet(30);
      el.mode = 'paginated';
      el.pageSize = 10;
      await el.updateComplete;
      const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
      expect(rows.length).toBe(10);
    });

    it('renders page controls', async () => {
      el.dataSet = makeLargeDataSet(30);
      el.mode = 'paginated';
      el.pageSize = 10;
      await el.updateComplete;
      const nav = el.shadowRoot!.querySelector('[role="navigation"]');
      expect(nav).not.toBeNull();
      expect(nav!.textContent).toContain('3');
    });

    it('emits page-change on next click', async () => {
      el.dataSet = makeLargeDataSet(30);
      el.mode = 'paginated';
      el.pageSize = 10;
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener('page-change', (e) => events.push(e as CustomEvent));

      const next = el.shadowRoot!.querySelector('[aria-label="Next page"]') as HTMLButtonElement;
      next.click();
      await el.updateComplete;

      expect(events.length).toBe(1);
      expect(events[0]!.detail.page).toBe(1);
    });

    it('shows second page content after navigation', async () => {
      el.dataSet = makeLargeDataSet(30);
      el.mode = 'paginated';
      el.pageSize = 10;
      await el.updateComplete;

      const next = el.shadowRoot!.querySelector('[aria-label="Next page"]') as HTMLButtonElement;
      next.click();
      await el.updateComplete;

      const firstCell = el.shadowRoot!.querySelector('[role="gridcell"]')!;
      expect(firstCell.textContent).toContain('Person 10');
    });

    it('uses totalRows for server-side pagination', async () => {
      el.dataSet = testDataSet;
      el.mode = 'paginated';
      el.pageSize = 3;
      el.totalRows = 30;
      await el.updateComplete;

      const nav = el.shadowRoot!.querySelector('[role="navigation"]')!;
      expect(nav.textContent).toContain('10');
    });

    it('disables prev/first on first page', async () => {
      el.dataSet = makeLargeDataSet(30);
      el.mode = 'paginated';
      el.pageSize = 10;
      await el.updateComplete;
      const prev = el.shadowRoot!.querySelector('[aria-label="Previous page"]') as HTMLButtonElement;
      expect(prev.disabled).toBe(true);
    });

    it('disables next/last on last page', async () => {
      el.dataSet = makeLargeDataSet(30);
      el.mode = 'paginated';
      el.pageSize = 10;
      el.currentPage = 2;
      await el.updateComplete;
      const next = el.shadowRoot!.querySelector('[aria-label="Next page"]') as HTMLButtonElement;
      expect(next.disabled).toBe(true);
    });
  });

  describe('scroll mode', () => {
    it('renders virtual window of rows', async () => {
      el.dataSet = makeLargeDataSet(200);
      el.mode = 'scroll';
      el.rowHeight = 48;
      el.bufferSize = 5;
      await el.updateComplete;
      const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
      expect(rows.length).toBeLessThan(200);
      expect(rows.length).toBeGreaterThan(0);
    });

    it('sets spacer height for scrollbar', async () => {
      el.dataSet = makeLargeDataSet(100);
      el.mode = 'scroll';
      el.rowHeight = 48;
      await el.updateComplete;
      const spacer = el.shadowRoot!.querySelector('.body-content') as HTMLElement;
      expect(spacer.style.height).toBe('4800px');
    });

    it('sets aria-rowindex on virtual rows', async () => {
      el.dataSet = makeLargeDataSet(100);
      el.mode = 'scroll';
      await el.updateComplete;
      const firstRow = el.shadowRoot!.querySelector('.row[role="row"]:not(.header)')!;
      const idx = parseInt(firstRow.getAttribute('aria-rowindex')!, 10);
      expect(idx).toBeGreaterThanOrEqual(2);
    });
  });

  describe('selection', () => {
    it('throws when selection enabled without getRowKey', async () => {
      el.dataSet = testDataSet;
      el.selection = 'single';
      let error: Error | null = null;
      try { await el.updateComplete; } catch (e) { error = e as Error; }
      expect(error).not.toBeNull();
    });

    it('single: click selects row and emits events', async () => {
      el.dataSet = testDataSet;
      el.selection = 'single';
      el.getRowKey = (r: TypedRow) => r.text(nameCol);
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener('selection-change', e => events.push(e as CustomEvent));
      el.addEventListener('row-activate', e => events.push(e as CustomEvent));

      const row = el.shadowRoot!.querySelector('.row[role="row"]:not(.header)') as HTMLElement;
      row.click();
      await el.updateComplete;

      expect(events.length).toBe(2);
      expect(events[0]!.type).toBe('selection-change');
      expect(events[1]!.type).toBe('row-activate');
      expect(events[0]!.detail.selectedKeys).toEqual(['Alice']);
    });

    it('single: click different row deselects previous', async () => {
      el.dataSet = testDataSet;
      el.selection = 'single';
      el.getRowKey = (r: TypedRow) => r.text(nameCol);
      await el.updateComplete;

      const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
      (rows[0] as HTMLElement).click();
      await el.updateComplete;
      (rows[1] as HTMLElement).click();
      await el.updateComplete;

      const selected = el.shadowRoot!.querySelectorAll('[aria-selected="true"]');
      expect(selected.length).toBe(1);
    });

    it('multi: renders checkbox column', async () => {
      el.dataSet = testDataSet;
      el.selection = 'multi';
      el.getRowKey = (r: TypedRow) => r.text(nameCol);
      await el.updateComplete;

      const checkboxes = el.shadowRoot!.querySelectorAll('[role="checkbox"]');
      expect(checkboxes.length).toBeGreaterThan(0);
    });

    it('multi: checkbox click toggles selection', async () => {
      el.dataSet = testDataSet;
      el.selection = 'multi';
      el.getRowKey = (r: TypedRow) => r.text(nameCol);
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener('selection-change', e => events.push(e as CustomEvent));

      const checkbox = el.shadowRoot!.querySelector('.row:not(.header) [role="checkbox"]') as HTMLElement;
      checkbox.click();
      await el.updateComplete;

      expect(events.length).toBe(1);
      expect(events[0]!.detail.selectedKeys).toContain('Alice');
    });

    it('multi: row click emits row-activate (not selection change)', async () => {
      el.dataSet = testDataSet;
      el.selection = 'multi';
      el.getRowKey = (r: TypedRow) => r.text(nameCol);
      await el.updateComplete;

      const activateEvents: CustomEvent[] = [];
      const selectionEvents: CustomEvent[] = [];
      el.addEventListener('row-activate', e => activateEvents.push(e as CustomEvent));
      el.addEventListener('selection-change', e => selectionEvents.push(e as CustomEvent));

      const row = el.shadowRoot!.querySelector('.row[role="row"]:not(.header)') as HTMLElement;
      row.click();
      await el.updateComplete;

      expect(activateEvents.length).toBe(1);
      expect(selectionEvents.length).toBe(0);
    });

    it('multi: header checkbox selects all', async () => {
      el.dataSet = testDataSet;
      el.selection = 'multi';
      el.getRowKey = (r: TypedRow) => r.text(nameCol);
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener('selection-change', e => events.push(e as CustomEvent));

      const headerCheckbox = el.shadowRoot!.querySelector('.header [role="checkbox"]') as HTMLElement;
      headerCheckbox.click();
      await el.updateComplete;

      expect(events[0]!.detail.selectedKeys.length).toBe(3);
    });

    it('multi: header checkbox deselects all when all selected', async () => {
      el.dataSet = testDataSet;
      el.selection = 'multi';
      el.getRowKey = (r: TypedRow) => r.text(nameCol);
      await el.updateComplete;

      const headerCheckbox = el.shadowRoot!.querySelector('.header [role="checkbox"]') as HTMLElement;
      headerCheckbox.click();
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener('selection-change', e => events.push(e as CustomEvent));
      headerCheckbox.click();
      await el.updateComplete;

      expect(events[0]!.detail.selectedKeys.length).toBe(0);
    });

    it('multi: header checkbox shows mixed state', async () => {
      el.dataSet = testDataSet;
      el.selection = 'multi';
      el.getRowKey = (r: TypedRow) => r.text(nameCol);
      await el.updateComplete;

      const checkbox = el.shadowRoot!.querySelector('.row:not(.header) [role="checkbox"]') as HTMLElement;
      checkbox.click();
      await el.updateComplete;

      const headerCheckbox = el.shadowRoot!.querySelector('.header [role="checkbox"]')!;
      expect(headerCheckbox.getAttribute('aria-checked')).toBe('mixed');
    });

    it('controlled: selectedKeys drives selection state', async () => {
      el.dataSet = testDataSet;
      el.selection = 'multi';
      el.getRowKey = (r: TypedRow) => r.text(nameCol);
      el.selectedKeys = ['Alice', 'Carol'];
      await el.updateComplete;

      const selected = el.shadowRoot!.querySelectorAll('[aria-selected="true"]');
      expect(selected.length).toBe(2);
    });

    it('paginated server-side: selection-change includes scope=page', async () => {
      el.dataSet = testDataSet;
      el.mode = 'paginated';
      el.totalRows = 30;
      el.selection = 'multi';
      el.getRowKey = (r: TypedRow) => r.text(nameCol);
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener('selection-change', e => events.push(e as CustomEvent));

      const checkbox = el.shadowRoot!.querySelector('.row:not(.header) [role="checkbox"]') as HTMLElement;
      checkbox.click();
      await el.updateComplete;

      expect(events[0]!.detail.scope).toBe('page');
    });
  });

  describe('sorting', () => {
    it('renders sort indicator on sortable columns', async () => {
      el.dataSet = testDataSet;
      el.columnConfig = [{ id: nameCol, sortable: true }, { id: ageCol }];
      await el.updateComplete;

      const headers = el.shadowRoot!.querySelectorAll('[role="columnheader"]');
      expect(headers[0]!.getAttribute('aria-sort')).toBe('none');
      expect(headers[1]!.hasAttribute('aria-sort')).toBe(false);
    });

    it('cycles sort direction on header click', async () => {
      el.dataSet = testDataSet;
      el.columnConfig = [{ id: nameCol, sortable: true }];
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener('sort-change', e => events.push(e as CustomEvent));

      const header = el.shadowRoot!.querySelector('[role="columnheader"]') as HTMLElement;

      header.click(); await el.updateComplete;
      expect(events[0]!.detail.direction).toBe('asc');

      header.click(); await el.updateComplete;
      expect(events[1]!.detail.direction).toBe('desc');

      header.click(); await el.updateComplete;
      expect(events[2]!.detail.direction).toBe('none');
    });

    it('clientSort=true reorders rows', async () => {
      el.dataSet = testDataSet;
      el.columnConfig = [{ id: nameCol, sortable: true }, { id: ageCol }];
      el.clientSort = true;
      await el.updateComplete;

      const header = el.shadowRoot!.querySelector('[role="columnheader"]') as HTMLElement;
      header.click(); await el.updateComplete;

      const cells = el.shadowRoot!.querySelectorAll('[role="gridcell"]');
      expect(cells[0]!.textContent).toContain('Alice');
      expect(cells[2]!.textContent).toContain('Bob');
      expect(cells[4]!.textContent).toContain('Carol');
    });
  });

  describe('column visibility', () => {
    it('hides columns with visible=false in config', async () => {
      el.dataSet = testDataSet;
      el.columnConfig = [{ id: nameCol }, { id: ageCol, visible: false }];
      await el.updateComplete;
      const headers = el.shadowRoot!.querySelectorAll('[role="columnheader"]');
      expect(headers.length).toBe(1);
      expect(headers[0]!.textContent).toContain('Name');
    });

    it('emits column-change when visibility toggled', async () => {
      el.dataSet = testDataSet;
      el.columnConfig = testConfig;
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener('column-change', e => events.push(e as CustomEvent));

      const picker = el.shadowRoot!.querySelector('.column-picker-trigger') as HTMLElement;
      if (picker) {
        picker.click();
        await el.updateComplete;
        const checkboxes = el.shadowRoot!.querySelectorAll('.column-picker-item input');
        if (checkboxes.length > 0) {
          (checkboxes[1] as HTMLInputElement).click();
          await el.updateComplete;
          expect(events.length).toBe(1);
        }
      }
    });

    it('grid template excludes hidden columns', async () => {
      el.dataSet = fromRows(testItems, [
        ...testColumnDefs,
        { id: createdCol, name: 'Created', type: ColumnType.DATE, getValue: (r: TestItem) => r.created },
      ]);
      el.columnConfig = [
        { id: nameCol, width: '1fr' },
        { id: ageCol, width: '80px', visible: false },
        { id: createdCol, width: '120px' },
      ];
      await el.updateComplete;
      const header = el.shadowRoot!.querySelector('.header') as HTMLElement;
      const template = header.style.gridTemplateColumns;
      expect(template).not.toContain('80px');
      expect(template).toContain('1fr');
      expect(template).toContain('120px');
    });
  });

  describe('keyboard navigation', () => {
    it('ArrowDown moves focus to next row', async () => {
      el.dataSet = testDataSet;
      await el.updateComplete;

      let rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
      (rows[0] as HTMLElement).focus();
      (rows[0] as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await el.updateComplete;
      await el.updateComplete;

      rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
      const focusedRow = Array.from(rows).find(r => r.getAttribute('tabindex') === '0');
      expect(focusedRow).toBe(rows[1]);
    });

    it('Enter activates focused row', async () => {
      el.dataSet = testDataSet;
      el.getRowKey = (r: TypedRow) => r.text(nameCol);
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener('row-activate', e => events.push(e as CustomEvent));

      const row = el.shadowRoot!.querySelector('.row[role="row"]:not(.header)') as HTMLElement;
      row.focus();
      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await el.updateComplete;

      expect(events.length).toBe(1);
    });

    it('Escape clears selection', async () => {
      el.dataSet = testDataSet;
      el.selection = 'multi';
      el.getRowKey = (r: TypedRow) => r.text(nameCol);
      await el.updateComplete;

      const checkbox = el.shadowRoot!.querySelector('.row:not(.header) [role="checkbox"]') as HTMLElement;
      checkbox.click();
      await el.updateComplete;

      const grid = el.shadowRoot!.querySelector('[role="grid"]') as HTMLElement;
      grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await el.updateComplete;

      const selected = el.shadowRoot!.querySelectorAll('[aria-selected="true"]');
      expect(selected.length).toBe(0);
    });

    it('Space toggles selection in multi mode', async () => {
      el.dataSet = testDataSet;
      el.selection = 'multi';
      el.getRowKey = (r: TypedRow) => r.text(nameCol);
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener('selection-change', e => events.push(e as CustomEvent));

      const row = el.shadowRoot!.querySelector('.row[role="row"]:not(.header)') as HTMLElement;
      row.focus();
      row.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      await el.updateComplete;

      expect(events.length).toBe(1);
      expect(events[0]!.detail.selectedKeys).toContain('Alice');
    });
  });

  describe('ARIA completeness', () => {
    it('sets aria-colcount', async () => {
      el.dataSet = testDataSet;
      await el.updateComplete;
      const grid = el.shadowRoot!.querySelector('[role="grid"]')!;
      expect(grid.getAttribute('aria-colcount')).toBe('2');
    });
  });

  describe('visual rendering', () => {
    it('column picker trigger is not inside the header row', async () => {
      el.dataSet = testDataSet;
      await el.updateComplete;
      const headerRow = el.shadowRoot!.querySelector('[role="row"].header, .header[role="row"]');
      const pickerInHeader = headerRow?.querySelector('.column-picker-trigger');
      expect(pickerInHeader).toBeNull();
    });

    it('sorted column header shows a visual direction indicator', async () => {
      el.dataSet = testDataSet;
      el.columnConfig = [{ id: nameCol, sortable: true }];
      el.clientSort = true;
      await el.updateComplete;

      const header = el.shadowRoot!.querySelector('[role="columnheader"]') as HTMLElement;
      header.click();
      await el.updateComplete;

      const hasArrow = header.textContent!.includes('▲') || header.textContent!.includes('▼');
      expect(hasArrow).toBe(true);
    });

    it('host element style sets height on :host', async () => {
      el.dataSet = testDataSet;
      await el.updateComplete;

      const styles = (el.constructor as any).styles;
      const cssText = Array.isArray(styles)
        ? styles.map((s: any) => s.cssText ?? String(s)).join(' ')
        : styles.cssText ?? String(styles);
      const hostMatch = cssText.match(/:host\s*\{[^}]*\}/);
      expect(hostMatch).not.toBeNull();
      expect(hostMatch![0]).toContain('height');
    });
  });

  describe('client filter', () => {
    it('filters rows by text match across columns', async () => {
      const ds = fromRows(
        [{ name: 'Alice', role: 'Engineer' }, { name: 'Bob', role: 'Designer' }, { name: 'Charlie', role: 'Engineer' }],
        [
          { id: nameCol, name: 'Name', type: ColumnType.TEXT, getValue: (r: { name: string; role: string }) => r.name },
          { id: 'role' as ColumnId, name: 'Role', type: ColumnType.TEXT, getValue: (r: { name: string; role: string }) => r.role },
        ],
      );
      el.dataSet = ds;
      el.clientFilter = true;
      el.filterText = 'engineer';
      await el.updateComplete;

      const dataRows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
      expect(dataRows.length).toBe(2);
    });

    it('respects filterable: false in columnConfig', async () => {
      const codeCol = 'code' as ColumnId;
      const ds = fromRows(
        [{ name: 'Alice', code: '123' }, { name: 'Bob', code: '456' }],
        [
          { id: nameCol, name: 'Name', type: ColumnType.TEXT, getValue: (r: { name: string; code: string }) => r.name },
          { id: codeCol, name: 'Code', type: ColumnType.TEXT, getValue: (r: { name: string; code: string }) => r.code },
        ],
      );
      el.dataSet = ds;
      el.columnConfig = [{ id: nameCol }, { id: codeCol, filterable: false }];
      el.clientFilter = true;
      el.filterText = '123';
      await el.updateComplete;

      const dataRows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
      expect(dataRows.length).toBe(0);
    });

    it('resets currentPage to 0 when filter changes', async () => {
      el.dataSet = makeLargeDataSet(100);
      el.mode = 'paginated';
      el.pageSize = 10;
      el.currentPage = 5;
      el.clientFilter = true;
      await el.updateComplete;

      el.filterText = 'Person 1';
      await el.updateComplete;
      expect(el.currentPage).toBe(0);
    });

    it('is ignored when totalRows is set (server pagination)', async () => {
      el.dataSet = testDataSet;
      el.clientFilter = true;
      el.filterText = 'alice';
      el.totalRows = 100;
      await el.updateComplete;

      const dataRows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
      expect(dataRows.length).toBe(3);
    });

    it('renders filter input when clientFilter is true', async () => {
      el.dataSet = testDataSet;
      el.clientFilter = true;
      await el.updateComplete;

      const input = el.shadowRoot!.querySelector('.filter-input');
      expect(input).not.toBeNull();
    });
  });

  describe('row detail expansion', () => {
    describe('validation', () => {
      it('throws when getRowDetail set without getRowKey', async () => {
        el.dataSet = testDataSet;
        el.columnConfig = testConfig;
        el.getRowDetail = () => html`<div>detail</div>`;
        await expect(el.updateComplete).rejects.toThrow('getRowKey is required');
      });

      it('throws when getRowDetail set with mode=scroll', async () => {
        el.dataSet = testDataSet;
        el.columnConfig = testConfig;
        el.getRowKey = (row: TypedRow) => row.text(nameCol);
        el.getRowDetail = () => html`<div>detail</div>`;
        el.mode = 'scroll';
        await expect(el.updateComplete).rejects.toThrow("mode='scroll'");
      });

      it('throws Error for getRowKey validation consistent with selection', async () => {
        el.dataSet = testDataSet;
        el.columnConfig = testConfig;
        el.getRowDetail = () => html`<div>detail</div>`;
        await expect(el.updateComplete).rejects.toThrow('getRowKey is required');
      });
    });

    describe('single mode (default)', () => {
      beforeEach(async () => {
        el.dataSet = testDataSet;
        el.columnConfig = testConfig;
        el.getRowKey = (row: TypedRow) => row.text(nameCol);
        el.getRowDetail = () => html`<div>Detail</div>`;
        await el.updateComplete;
      });

      it('emits detail-change on toggle', async () => {
        const events: Array<{key: string; expanded: boolean}> = [];
        el.addEventListener('detail-change', ((e: CustomEvent) => {
          events.push(e.detail);
        }) as EventListener);

        const btn = el.shadowRoot!.querySelector('.expand-toggle') as HTMLElement;
        btn.click();
        await el.updateComplete;

        expect(events).toHaveLength(1);
        expect(events[0]!.key).toBe('Alice');
        expect(events[0]!.expanded).toBe(true);
      });

      it('collapses previous when expanding another in single mode', async () => {
        const events: Array<{key: string; expanded: boolean}> = [];
        el.addEventListener('detail-change', ((e: CustomEvent) => {
          events.push(e.detail);
        }) as EventListener);

        const btns = el.shadowRoot!.querySelectorAll('.expand-toggle');
        (btns[0] as HTMLElement).click();
        await el.updateComplete;

        (btns[1] as HTMLElement).click();
        await el.updateComplete;

        expect(events).toHaveLength(3);
        expect(events[1]!.key).toBe('Alice');
        expect(events[1]!.expanded).toBe(false);
        expect(events[2]!.key).toBe('Bob');
        expect(events[2]!.expanded).toBe(true);
      });
    });

    describe('multi mode', () => {
      beforeEach(async () => {
        el.dataSet = testDataSet;
        el.columnConfig = testConfig;
        el.getRowKey = (row: TypedRow) => row.text(nameCol);
        el.getRowDetail = () => html`<div>Detail</div>`;
        el.detailMode = 'multi';
        await el.updateComplete;
      });

      it('allows multiple panels open simultaneously', async () => {
        const btns = el.shadowRoot!.querySelectorAll('.expand-toggle');
        (btns[0] as HTMLElement).click();
        await el.updateComplete;
        (btns[1] as HTMLElement).click();
        await el.updateComplete;

        const panels = el.shadowRoot!.querySelectorAll('.detail-panel:not([hidden])');
        expect(panels.length).toBe(2);
      });
    });

    describe('controlled mode', () => {
      it('does not manage internal state when expandedDetailKeys is set', async () => {
        el.dataSet = testDataSet;
        el.columnConfig = testConfig;
        el.getRowKey = (row: TypedRow) => row.text(nameCol);
        el.getRowDetail = () => html`<div>Detail</div>`;
        el.expandedDetailKeys = ['Alice'];
        await el.updateComplete;

        const panels = el.shadowRoot!.querySelectorAll('.detail-panel:not([hidden])');
        expect(panels.length).toBe(1);

        const events: unknown[] = [];
        el.addEventListener('detail-change', ((e: CustomEvent) => {
          events.push(e.detail);
        }) as EventListener);

        const btn = el.shadowRoot!.querySelector('.expand-toggle') as HTMLElement;
        btn.click();
        await el.updateComplete;

        expect(events).toHaveLength(1);
        const panelsAfter = el.shadowRoot!.querySelectorAll('.detail-panel:not([hidden])');
        expect(panelsAfter.length).toBe(1);
      });
    });

    describe('rendering', () => {
      beforeEach(async () => {
        el.dataSet = testDataSet;
        el.columnConfig = testConfig;
        el.getRowKey = (row: TypedRow) => row.text(nameCol);
        el.getRowDetail = (row: TypedRow) => {
          const name = row.text(nameCol);
          return name === 'Bob' ? undefined : html`<div class="test-detail">Detail for ${name}</div>`;
        };
        await el.updateComplete;
      });

      it('renders expand column when getRowDetail is set', async () => {
        const expandCells = el.shadowRoot!.querySelectorAll('.expand-cell');
        expect(expandCells.length).toBe(3);
      });

      it('renders expand button only for rows with detail content', async () => {
        const toggles = el.shadowRoot!.querySelectorAll('.expand-toggle');
        expect(toggles.length).toBe(2);
      });

      it('renders detail panel with correct ARIA when expanded', async () => {
        const btn = el.shadowRoot!.querySelector('.expand-toggle') as HTMLElement;
        btn.click();
        await el.updateComplete;

        const panel = el.shadowRoot!.querySelector('.detail-panel:not([hidden])');
        expect(panel).toBeTruthy();
        expect(panel!.getAttribute('role')).toBe('region');

        const btnAriaControls = btn.getAttribute('aria-controls');
        expect(btnAriaControls).toBe(panel!.id);
        expect(btn.getAttribute('aria-expanded')).toBe('true');
      });

      it('does not include detail panels in aria-rowcount', async () => {
        const btn = el.shadowRoot!.querySelector('.expand-toggle') as HTMLElement;
        btn.click();
        await el.updateComplete;

        const grid = el.shadowRoot!.querySelector('[role="grid"]');
        const rowCount = parseInt(grid!.getAttribute('aria-rowcount')!, 10);
        expect(rowCount).toBe(4);
      });

      it('expand button click does not fire row-activate', async () => {
        const activates: unknown[] = [];
        el.addEventListener('row-activate', () => activates.push(true));

        const btn = el.shadowRoot!.querySelector('.expand-toggle') as HTMLElement;
        btn.click();
        await el.updateComplete;

        expect(activates).toHaveLength(0);
      });
    });

    describe('expand all (multi mode)', () => {
      beforeEach(async () => {
        el.dataSet = testDataSet;
        el.columnConfig = testConfig;
        el.getRowKey = (row: TypedRow) => row.text(nameCol);
        el.getRowDetail = (row: TypedRow) => {
          const name = row.text(nameCol);
          return name === 'Bob' ? undefined : html`<div>Detail</div>`;
        };
        el.detailMode = 'multi';
        await el.updateComplete;
      });

      it('expands all rows with detail content', async () => {
        const expandAll = el.shadowRoot!.querySelector('.expand-all-toggle') as HTMLElement;
        expandAll.click();
        await el.updateComplete;

        const panels = el.shadowRoot!.querySelectorAll('.detail-panel:not([hidden])');
        expect(panels.length).toBe(2);
      });

      it('collapses all when any are expanded', async () => {
        const btns = el.shadowRoot!.querySelectorAll('.expand-toggle');
        (btns[0] as HTMLElement).click();
        await el.updateComplete;

        const expandAll = el.shadowRoot!.querySelector('.expand-all-toggle') as HTMLElement;
        expandAll.click();
        await el.updateComplete;

        const panels = el.shadowRoot!.querySelectorAll('.detail-panel:not([hidden])');
        expect(panels.length).toBe(0);
      });
    });

    describe('CSS classes', () => {
      beforeEach(async () => {
        el.dataSet = testDataSet;
        el.columnConfig = testConfig;
        el.getRowKey = (row: TypedRow) => row.text(nameCol);
        el.getRowDetail = () => html`<div>Detail</div>`;
        await el.updateComplete;
      });

      it('expanded row has detail-expanded class', async () => {
        const btn = el.shadowRoot!.querySelector('.expand-toggle') as HTMLElement;
        btn.click();
        await el.updateComplete;

        const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]');
        expect(rows[0]!.classList.contains('detail-expanded')).toBe(true);
      });

      it('detail panel has hidden attribute when collapsed', async () => {
        const panels = el.shadowRoot!.querySelectorAll('.detail-panel');
        for (const panel of panels) {
          expect(panel.hasAttribute('hidden')).toBe(true);
        }
      });

      it('expanded panel has expanded class and no hidden attribute', async () => {
        const btn = el.shadowRoot!.querySelector('.expand-toggle') as HTMLElement;
        btn.click();
        await el.updateComplete;

        const expandedPanel = el.shadowRoot!.querySelector('.detail-panel.expanded');
        expect(expandedPanel).toBeTruthy();
        expect(expandedPanel!.hasAttribute('hidden')).toBe(false);
      });
    });

    describe('keyboard navigation', () => {
      beforeEach(async () => {
        el.dataSet = testDataSet;
        el.columnConfig = testConfig;
        el.getRowKey = (row: TypedRow) => row.text(nameCol);
        el.getRowDetail = () => html`<div><button class="inner-btn">Action</button></div>`;
        await el.updateComplete;
      });

      it('arrow keys skip detail panels', async () => {
        const btn = el.shadowRoot!.querySelector('.expand-toggle') as HTMLElement;
        btn.click();
        await el.updateComplete;

        const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]');
        (rows[0] as HTMLElement).focus();
        const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true });
        rows[0]!.dispatchEvent(event);
        await el.updateComplete;

        const activeEl = el.shadowRoot!.activeElement;
        expect(activeEl?.getAttribute('role')).toBe('row');
      });
    });

    describe('virtual scroll interaction', () => {
      it('disables virtual scroll when getRowDetail is set in auto mode', async () => {
        el.dataSet = makeLargeDataSet(100);
        el.columnConfig = testConfig;
        el.getRowKey = (row: TypedRow) => row.text(nameCol);
        el.getRowDetail = () => html`<div>Detail</div>`;
        el.mode = 'auto';
        await el.updateComplete;

        const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]');
        expect(rows.length).toBe(100);
      });
    });

    describe('pagination interaction', () => {
      it('expand state persists across page changes', async () => {
        const ds = makeLargeDataSet(10);
        el.dataSet = ds;
        el.columnConfig = testConfig;
        el.mode = 'paginated';
        el.pageSize = 3;
        el.getRowKey = (row: TypedRow) => row.text(nameCol);
        el.getRowDetail = () => html`<div>Detail</div>`;
        await el.updateComplete;

        const btn = el.shadowRoot!.querySelector('.expand-toggle') as HTMLElement;
        btn.click();
        await el.updateComplete;

        el.currentPage = 1;
        await el.updateComplete;
        el.currentPage = 0;
        await el.updateComplete;

        const panel = el.shadowRoot!.querySelector('.detail-panel:not([hidden])');
        expect(panel).toBeTruthy();
      });
    });
  });
});
