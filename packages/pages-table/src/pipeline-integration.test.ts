import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { TypedDataSet, ColumnId } from '@casehubio/pages-data';
import { ColumnType } from '@casehubio/pages-data';
import { fromRows } from '@casehubio/pages-data';
import type { SortColumn } from '@casehubio/pages-data';

type TableEl = HTMLElement & {
  dataSet?: TypedDataSet;
  props: Record<string, unknown>;
  error: string;
  loading: boolean;
  totalRows?: number;
  activeSort: SortColumn | undefined;
  activePage: number | undefined;
  currentPage: number;
  pageSize: number;
  mode: string;
  clientSort: boolean;
  clientFilter: boolean;
  filterText: string;
  columnConfig?: readonly { id: ColumnId; label?: string; sortable?: boolean; width?: string; align?: string; minWidth?: string; mergeRows?: boolean }[];
  updateComplete: Promise<boolean>;
};

const nameCol = 'name' as ColumnId;
const ageCol = 'age' as ColumnId;

const testDataSet = fromRows(
  [
    { name: 'Alice', age: 30 },
    { name: 'Bob', age: 25 },
    { name: 'Carol', age: 35 },
  ],
  [
    { id: nameCol, name: 'Name', type: ColumnType.TEXT, getValue: (r: { name: string; age: number }) => r.name },
    { id: ageCol, name: 'Age', type: ColumnType.NUMBER, getValue: (r: { name: string; age: number }) => r.age },
  ],
);

describe('pipeline integration', () => {
  let el: TableEl;

  beforeEach(async () => {
    await import('./pages-table.js');
    el = document.createElement('pages-table') as TableEl;
    document.body.appendChild(el);
  });

  afterEach(() => { el.remove(); });

  describe('.props setter (YAML mode)', () => {
    it('sets pageSize and mode=paginated from props', async () => {
      el.props = { pageSize: 10, lookup: { dataSetId: 'test', operations: [] } };
      await el.updateComplete;
      expect(el.pageSize).toBe(10);
      expect(el.mode).toBe('paginated');
    });

    it('sets pageSizeOptions from props', async () => {
      el.props = { pageSize: 5, pageSizeOptions: [5, 15, 30], lookup: { dataSetId: 'test', operations: [] } };
      await el.updateComplete;
      expect((el as any).pageSizeOptions).toEqual([5, 15, 30]);
    });

    it('marks all columns sortable when sortable=true', async () => {
      el.props = { sortable: true, lookup: { dataSetId: 'test', operations: [] } };
      el.dataSet = testDataSet;
      await el.updateComplete;

      const headers = el.shadowRoot!.querySelectorAll('[role="columnheader"]');
      expect(headers[0]!.getAttribute('aria-sort')).toBe('none');
      expect(headers[1]!.getAttribute('aria-sort')).toBe('none');
    });

    it('dispatches pages-data-request after connectedCallback', async () => {
      const events: CustomEvent[] = [];
      document.body.addEventListener('pages-data-request', ((e: Event) => {
        events.push(e as CustomEvent);
      }) as EventListener);

      const table = document.createElement('pages-table') as TableEl;
      table.props = { lookup: { dataSetId: 'employees', operations: [] } };
      document.body.appendChild(table);
      await table.updateComplete;

      expect(events.length).toBe(1);
      expect(events[0]!.detail.lookup.dataSetId).toBe('employees');
      expect(events[0]!.detail.element).toBe(table);

      table.remove();
    });

    it('filter is available on demand in pipeline mode', async () => {
      el.props = { lookup: { dataSetId: 'test', operations: [] } };
      el.dataSet = testDataSet;
      await el.updateComplete;

      expect(el.shadowRoot!.querySelector('.filter-input')).toBeNull();

      const kebab = el.shadowRoot!.querySelector('.column-picker-trigger') as HTMLElement;
      kebab.click();
      await el.updateComplete;
      const filterToggle = el.shadowRoot!.querySelector('.filter-toggle') as HTMLElement;
      expect(filterToggle).not.toBeNull();
      filterToggle.click();
      await el.updateComplete;

      expect(el.shadowRoot!.querySelector('.filter-input')).not.toBeNull();
    });

    it('maps columns[].name to columnConfig label', async () => {
      el.props = {
        lookup: { dataSetId: 'test', operations: [] },
        columns: [{ id: nameCol, name: 'Full Name' }],
      };
      el.dataSet = testDataSet;
      await el.updateComplete;

      const headers = el.shadowRoot!.querySelectorAll('[role="columnheader"]');
      expect(headers[0]!.textContent).toContain('Full Name');
    });
  });

  describe('VizTarget properties', () => {
    it('renders error message when error is set', async () => {
      el.error = 'Data load failed';
      await el.updateComplete;
      expect(el.shadowRoot!.textContent).toContain('Data load failed');
    });

    it('activeSort sets sort indicator', async () => {
      el.dataSet = testDataSet;
      el.columnConfig = [{ id: nameCol, sortable: true }, { id: ageCol, sortable: true }];
      el.activeSort = { columnId: nameCol, order: 'ASCENDING' };
      await el.updateComplete;

      const headers = el.shadowRoot!.querySelectorAll('[role="columnheader"]');
      expect(headers[0]!.getAttribute('aria-sort')).toBe('ascending');
    });

    it('activeSort DESCENDING maps to desc indicator', async () => {
      el.dataSet = testDataSet;
      el.columnConfig = [{ id: nameCol, sortable: true }];
      el.activeSort = { columnId: nameCol, order: 'DESCENDING' };
      await el.updateComplete;

      const header = el.shadowRoot!.querySelector('[role="columnheader"]')!;
      expect(header.getAttribute('aria-sort')).toBe('descending');
    });

    it('activeSort undefined clears sort', async () => {
      el.dataSet = testDataSet;
      el.columnConfig = [{ id: nameCol, sortable: true }];
      el.activeSort = { columnId: nameCol, order: 'ASCENDING' };
      await el.updateComplete;
      el.activeSort = undefined;
      await el.updateComplete;

      const header = el.shadowRoot!.querySelector('[role="columnheader"]')!;
      expect(header.getAttribute('aria-sort')).toBe('none');
    });

    it('activePage sets currentPage', async () => {
      el.activePage = 3;
      expect(el.currentPage).toBe(3);
    });
  });

  describe('pipeline events', () => {
    it('emits pages-sort on header click in pipeline mode', async () => {
      el.props = { sortable: true, lookup: { dataSetId: 'test', operations: [] } };
      el.dataSet = testDataSet;
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener('pages-sort', ((e: Event) => events.push(e as CustomEvent)) as EventListener);

      const header = el.shadowRoot!.querySelector('[role="columnheader"]') as HTMLElement;
      header.click();
      await el.updateComplete;

      expect(events.length).toBe(1);
      expect(events[0]!.detail.columnId).toBe(nameCol);
      expect(events[0]!.detail.order).toBe('ASCENDING');
    });

    it('emits pages-page on page button click in pipeline mode', async () => {
      el.props = { pageSize: 2, lookup: { dataSetId: 'test', operations: [] } };
      el.dataSet = testDataSet;
      el.totalRows = 10;
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener('pages-page', ((e: Event) => events.push(e as CustomEvent)) as EventListener);

      const next = el.shadowRoot!.querySelector('[aria-label="Next page"]') as HTMLButtonElement;
      next.click();
      await el.updateComplete;

      expect(events.length).toBe(1);
      expect(events[0]!.detail.offset).toBe(2);
      expect(events[0]!.detail.count).toBe(2);
    });

    it('emits pages-text-filter when filter text changes in pipeline mode', async () => {
      el.props = { lookup: { dataSetId: 'test', operations: [] } };
      el.dataSet = testDataSet;
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener('pages-text-filter', ((e: Event) => events.push(e as CustomEvent)) as EventListener);

      el.filterText = 'alice';
      await el.updateComplete;

      expect(events.length).toBe(1);
      expect(events[0]!.detail.text).toBe('alice');
    });

    it('does NOT emit pipeline events in standalone mode', async () => {
      el.dataSet = testDataSet;
      el.columnConfig = [{ id: nameCol, sortable: true }];
      await el.updateComplete;

      const pipelineEvents: Event[] = [];
      el.addEventListener('pages-sort', (e) => pipelineEvents.push(e));

      const header = el.shadowRoot!.querySelector('[role="columnheader"]') as HTMLElement;
      header.click();
      await el.updateComplete;

      expect(pipelineEvents.length).toBe(0);
    });
  });

  describe('pipeline-driven rendering (stateless)', () => {
    it('renders all received rows without slicing (pipeline controls the page)', async () => {
      el.props = { pageSize: 2, lookup: { dataSetId: 'test', operations: [] } };
      el.dataSet = testDataSet;
      el.totalRows = 10;
      await el.updateComplete;

      const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
      expect(rows.length).toBe(3);
    });

    it('renders rows in the order provided by pipeline', async () => {
      el.props = { sortable: true, lookup: { dataSetId: 'test', operations: [] } };
      const reversed = fromRows(
        [{ name: 'Carol', age: 35 }, { name: 'Bob', age: 25 }, { name: 'Alice', age: 30 }],
        [
          { id: nameCol, name: 'Name', type: ColumnType.TEXT, getValue: (r: { name: string; age: number }) => r.name },
          { id: ageCol, name: 'Age', type: ColumnType.NUMBER, getValue: (r: { name: string; age: number }) => r.age },
        ],
      );
      el.dataSet = reversed;
      await el.updateComplete;

      const cells = el.shadowRoot!.querySelectorAll('[role="gridcell"]');
      expect(cells[0]!.textContent).toContain('Carol');
      expect(cells[2]!.textContent).toContain('Bob');
    });

    it('renders new dataset rows on data re-push', async () => {
      el.props = { lookup: { dataSetId: 'test', operations: [] } };
      el.dataSet = testDataSet;
      await el.updateComplete;

      let rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
      expect(rows.length).toBe(3);

      const smaller = fromRows(
        [{ name: 'Only One', age: 1 }],
        [
          { id: nameCol, name: 'Name', type: ColumnType.TEXT, getValue: (r: { name: string; age: number }) => r.name },
          { id: ageCol, name: 'Age', type: ColumnType.NUMBER, getValue: (r: { name: string; age: number }) => r.age },
        ],
      );
      el.dataSet = smaller;
      await el.updateComplete;

      rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
      expect(rows.length).toBe(1);
    });

    it('no paging controls when pageSize is not set', async () => {
      el.props = { lookup: { dataSetId: 'test', operations: [] } };
      el.dataSet = testDataSet;
      await el.updateComplete;

      const nav = el.shadowRoot!.querySelector('[role="navigation"]');
      expect(nav).toBeNull();
    });

    it('does not emit sort event when sortable is false', async () => {
      el.props = { sortable: false, lookup: { dataSetId: 'test', operations: [] } };
      el.dataSet = testDataSet;
      await el.updateComplete;

      const events: Event[] = [];
      el.addEventListener('pages-sort', (e) => events.push(e));
      el.addEventListener('sort-change', (e) => events.push(e));

      const header = el.shadowRoot!.querySelector('[role="columnheader"]') as HTMLElement;
      header.click();
      await el.updateComplete;

      expect(events.length).toBe(0);
    });

    it('null cells render as empty string', async () => {
      const withNull = fromRows(
        [{ name: null as string | null, age: 42 }],
        [
          { id: nameCol, name: 'Name', type: ColumnType.TEXT, getValue: (r: { name: string | null; age: number }) => r.name },
          { id: ageCol, name: 'Age', type: ColumnType.NUMBER, getValue: (r: { name: string | null; age: number }) => r.age },
        ],
      );
      el.dataSet = withNull;
      await el.updateComplete;

      const cells = el.shadowRoot!.querySelectorAll('[role="gridcell"]');
      expect(cells[0]!.textContent!.trim()).toBe('');
      expect(cells[1]!.textContent).toContain('42');
    });
  });

  describe('cross-filter (click-to-filter)', () => {
    const labelCol = 'dept' as ColumnId;
    const labelDataSet = fromRows(
      [
        { name: 'Alice', dept: 'Engineering' },
        { name: 'Bob', dept: 'Marketing' },
        { name: 'Carol', dept: 'Engineering' },
      ],
      [
        { id: nameCol, name: 'Name', type: ColumnType.TEXT, getValue: (r: { name: string; dept: string }) => r.name },
        { id: labelCol, name: 'Dept', type: ColumnType.LABEL, getValue: (r: { name: string; dept: string }) => r.dept },
      ],
    );

    it('listening-only does NOT enable cell click', async () => {
      el.props = { filter: { listening: true }, lookup: { dataSetId: 'test', operations: [] } };
      el.dataSet = labelDataSet;
      await el.updateComplete;

      const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
      expect(rows[0]!.classList.contains('clickable')).toBe(false);

      const events: CustomEvent[] = [];
      el.addEventListener('pages-filter', ((e: Event) => events.push(e as CustomEvent)) as EventListener);

      const cells = el.shadowRoot!.querySelectorAll('[role="gridcell"]');
      (cells[1] as HTMLElement).click();
      await el.updateComplete;

      expect(events.length).toBe(0);
    });

    it('click cell emits pages-filter with correct detail', async () => {
      el.props = { filter: { notification: true }, lookup: { dataSetId: 'test', operations: [] } };
      el.dataSet = labelDataSet;
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener('pages-filter', ((e: Event) => events.push(e as CustomEvent)) as EventListener);

      const cells = el.shadowRoot!.querySelectorAll('[role="gridcell"]');
      (cells[1] as HTMLElement).click();
      await el.updateComplete;

      expect(events.length).toBe(1);
      expect(events[0]!.detail.columnId).toBe(String(labelCol));
      expect(events[0]!.detail.value).toBe('Engineering');
      expect(events[0]!.detail.reset).toBe(false);
    });

    it('filter event has correct columnId for non-first column', async () => {
      el.props = { filter: { notification: true }, lookup: { dataSetId: 'test', operations: [] } };
      el.dataSet = labelDataSet;
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener('pages-filter', ((e: Event) => events.push(e as CustomEvent)) as EventListener);

      const cells = el.shadowRoot!.querySelectorAll('[role="gridcell"]');
      (cells[3] as HTMLElement).click();
      await el.updateComplete;

      expect(events[0]!.detail.columnId).toBe(String(labelCol));
      expect(events[0]!.detail.value).toBe('Marketing');
    });

    it('click same cell twice toggles — second emits reset', async () => {
      el.props = { filter: { notification: true }, lookup: { dataSetId: 'test', operations: [] } };
      el.dataSet = labelDataSet;
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener('pages-filter', ((e: Event) => events.push(e as CustomEvent)) as EventListener);

      const cells = el.shadowRoot!.querySelectorAll('[role="gridcell"]');
      (cells[1] as HTMLElement).click();
      await el.updateComplete;
      (cells[1] as HTMLElement).click();
      await el.updateComplete;

      expect(events.length).toBe(2);
      expect(events[0]!.detail.reset).toBe(false);
      expect(events[1]!.detail.reset).toBe(true);
    });

    it('column switch emits reset for old column then apply for new', async () => {
      el.props = { filter: { notification: true }, lookup: { dataSetId: 'test', operations: [] } };
      el.dataSet = labelDataSet;
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener('pages-filter', ((e: Event) => events.push(e as CustomEvent)) as EventListener);

      const cells = el.shadowRoot!.querySelectorAll('[role="gridcell"]');
      (cells[1] as HTMLElement).click();
      await el.updateComplete;

      (cells[0] as HTMLElement).click();
      await el.updateComplete;

      expect(events.length).toBe(3);
      expect(events[1]!.detail.reset).toBe(true);
      expect(events[1]!.detail.columnId).toBe(String(labelCol));
      expect(events[2]!.detail.reset).toBe(false);
      expect(events[2]!.detail.columnId).toBe(String(nameCol));
    });

    it('page navigation clears selection and emits filter reset', async () => {
      el.props = { filter: { notification: true }, pageSize: 5, lookup: { dataSetId: 'test', operations: [] } };
      el.dataSet = labelDataSet;
      el.totalRows = 10;
      await el.updateComplete;

      const cells = el.shadowRoot!.querySelectorAll('[role="gridcell"]');
      (cells[1] as HTMLElement).click();
      await el.updateComplete;

      const filterEvents: CustomEvent[] = [];
      el.addEventListener('pages-filter', ((e: Event) => filterEvents.push(e as CustomEvent)) as EventListener);

      const next = el.shadowRoot!.querySelector('[aria-label="Next page"]') as HTMLButtonElement;
      next.click();
      await el.updateComplete;

      expect(filterEvents.length).toBe(1);
      expect(filterEvents[0]!.detail.reset).toBe(true);

      const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
      const hasSelected = Array.from(rows).some(r => r.classList.contains('selected'));
      expect(hasSelected).toBe(false);
    });

    it('toggle off emits pages-data-request to refresh data', async () => {
      el.props = { filter: { notification: true }, lookup: { dataSetId: 'test', operations: [] } };
      el.dataSet = labelDataSet;
      await el.updateComplete;

      const dataRequests: CustomEvent[] = [];
      el.addEventListener('pages-data-request', ((e: Event) => dataRequests.push(e as CustomEvent)) as EventListener);

      const cells = el.shadowRoot!.querySelectorAll('[role="gridcell"]');
      (cells[1] as HTMLElement).click();
      await el.updateComplete;
      (cells[1] as HTMLElement).click();
      await el.updateComplete;

      expect(dataRequests.length).toBeGreaterThan(0);
    });

    it('selected row gets .filter-selected CSS class after click', async () => {
      el.props = { filter: { notification: true }, lookup: { dataSetId: 'test', operations: [] } };
      el.dataSet = labelDataSet;
      await el.updateComplete;

      const cells = el.shadowRoot!.querySelectorAll('[role="gridcell"]');
      (cells[1] as HTMLElement).click();
      await el.updateComplete;

      const allCells = el.shadowRoot!.querySelectorAll('.cell[role="gridcell"]');
      const row0Cell = allCells[0]!;
      const row1Cell = allCells[3]!;
      expect(row0Cell.classList.contains('filter-selected')).toBe(true);
      expect(row1Cell.classList.contains('filter-selected')).toBe(false);
    });

    it('toggle off removes .selected class', async () => {
      el.props = { filter: { notification: true }, lookup: { dataSetId: 'test', operations: [] } };
      el.dataSet = labelDataSet;
      await el.updateComplete;

      const cells = el.shadowRoot!.querySelectorAll('[role="gridcell"]');
      (cells[1] as HTMLElement).click();
      await el.updateComplete;
      (cells[1] as HTMLElement).click();
      await el.updateComplete;

      const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
      expect(rows[0]!.classList.contains('selected')).toBe(false);
    });

    it('cells have clickable class when filter enabled', async () => {
      el.props = { filter: { notification: true }, lookup: { dataSetId: 'test', operations: [] } };
      el.dataSet = labelDataSet;
      await el.updateComplete;

      const cells = el.shadowRoot!.querySelectorAll('.cell[role="gridcell"]');
      expect(cells[0]!.classList.contains('clickable')).toBe(true);
    });

    it('filter group is undefined when not set in props', async () => {
      el.props = { filter: { notification: true }, lookup: { dataSetId: 'test', operations: [] } };
      el.dataSet = labelDataSet;
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener('pages-filter', ((e: Event) => events.push(e as CustomEvent)) as EventListener);

      const cells = el.shadowRoot!.querySelectorAll('[role="gridcell"]');
      (cells[1] as HTMLElement).click();
      await el.updateComplete;

      expect(events[0]!.detail.group).toBeUndefined();
    });

    it('data re-push preserves selection when value exists', async () => {
      el.props = { filter: { notification: true }, lookup: { dataSetId: 'test', operations: [] } };
      el.dataSet = labelDataSet;
      await el.updateComplete;

      const cells = el.shadowRoot!.querySelectorAll('[role="gridcell"]');
      (cells[1] as HTMLElement).click();
      await el.updateComplete;

      el.dataSet = labelDataSet;
      await el.updateComplete;

      const allCells = el.shadowRoot!.querySelectorAll('.cell[role="gridcell"]');
      expect(allCells[0]!.classList.contains('filter-selected')).toBe(true);
    });

    it('data re-push clears selection when value absent', async () => {
      el.props = { filter: { notification: true }, lookup: { dataSetId: 'test', operations: [] } };
      el.dataSet = labelDataSet;
      await el.updateComplete;

      const cells = el.shadowRoot!.querySelectorAll('[role="gridcell"]');
      (cells[1] as HTMLElement).click();
      await el.updateComplete;

      const noEngineering = fromRows(
        [{ name: 'Bob', dept: 'Marketing' }],
        [
          { id: nameCol, name: 'Name', type: ColumnType.TEXT, getValue: (r: { name: string; dept: string }) => r.name },
          { id: labelCol, name: 'Dept', type: ColumnType.LABEL, getValue: (r: { name: string; dept: string }) => r.dept },
        ],
      );
      el.dataSet = noEngineering;
      await el.updateComplete;

      const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
      expect(rows[0]!.classList.contains('selected')).toBe(false);
    });
  });

  describe('row styles', () => {
    const statusCol = 'status' as ColumnId;
    const valueCol = 'value' as ColumnId;
    const styleDataSet = fromRows(
      [
        { status: 'Critical', value: 100 },
        { status: 'Normal', value: 50 },
        { status: 'Critical', value: 75 },
      ],
      [
        { id: statusCol, name: 'Status', type: ColumnType.LABEL, getValue: (r: { status: string; value: number }) => r.status },
        { id: valueCol, name: 'Value', type: ColumnType.NUMBER, getValue: (r: { status: string; value: number }) => r.value },
      ],
    );

    it('applies pages-row-danger class when condition matches', async () => {
      el.props = {
        lookup: { dataSetId: 'test', operations: [] },
        rowStyle: [{ condition: "#{row.status} == 'Critical'", className: 'pages-row-danger' }],
      };
      el.dataSet = styleDataSet;
      await el.updateComplete;

      const cells = el.shadowRoot!.querySelectorAll('.cell[role="gridcell"]');
      expect(cells[0]!.classList.contains('pages-row-danger')).toBe(true);
      expect(cells[3]!.classList.contains('pages-row-danger')).toBe(false);
      expect(cells[4]!.classList.contains('pages-row-danger')).toBe(true);
    });

    it('first matching rule wins — subsequent rules not evaluated', async () => {
      el.props = {
        lookup: { dataSetId: 'test', operations: [] },
        rowStyle: [
          { condition: "#{row.status} == 'Critical'", className: 'pages-row-danger' },
          { condition: "#{row.value} > 50", className: 'pages-row-warning' },
        ],
      };
      el.dataSet = styleDataSet;
      await el.updateComplete;

      const cells = el.shadowRoot!.querySelectorAll('.cell[role="gridcell"]');
      expect(cells[0]!.classList.contains('pages-row-danger')).toBe(true);
      expect(cells[0]!.classList.contains('pages-row-warning')).toBe(false);
    });

    it('applies inline style when rule has style property', async () => {
      el.props = {
        lookup: { dataSetId: 'test', operations: [] },
        rowStyle: [{ condition: "#{row.status} == 'Critical'", style: { backgroundColor: '#fce4ec', color: '#b71c1c' } }],
      };
      el.dataSet = styleDataSet;
      await el.updateComplete;

      const cells = el.shadowRoot!.querySelectorAll('.cell[role="gridcell"]');
      const style = (cells[0] as HTMLElement).getAttribute('style') ?? '';
      expect(style).toContain('background-color');
      expect(style).toContain('color');
    });

    it('no class or style applied when no rule matches', async () => {
      el.props = {
        lookup: { dataSetId: 'test', operations: [] },
        rowStyle: [{ condition: "#{row.status} == 'Unknown'", className: 'pages-row-danger' }],
      };
      el.dataSet = styleDataSet;
      await el.updateComplete;

      const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
      expect(rows[0]!.classList.contains('pages-row-danger')).toBe(false);
      expect(rows[1]!.classList.contains('pages-row-danger')).toBe(false);
    });

    it('handles numeric comparisons in row conditions', async () => {
      el.props = {
        lookup: { dataSetId: 'test', operations: [] },
        rowStyle: [{ condition: '#{row.value} > 70', className: 'pages-row-warning' }],
      };
      el.dataSet = styleDataSet;
      await el.updateComplete;

      const cells = el.shadowRoot!.querySelectorAll('.cell[role="gridcell"]');
      expect(cells[0]!.classList.contains('pages-row-warning')).toBe(true);
      expect(cells[2]!.classList.contains('pages-row-warning')).toBe(false);
      expect(cells[4]!.classList.contains('pages-row-warning')).toBe(true);
    });

    it('renders normally when rowStyle is undefined', async () => {
      el.props = { lookup: { dataSetId: 'test', operations: [] } };
      el.dataSet = styleDataSet;
      await el.updateComplete;

      const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
      expect(rows.length).toBe(3);
    });

    it('renders normally when rowStyle is empty array', async () => {
      el.props = { lookup: { dataSetId: 'test', operations: [] }, rowStyle: [] };
      el.dataSet = styleDataSet;
      await el.updateComplete;

      const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
      expect(rows.length).toBe(3);
    });

    it('handles null values in row data', async () => {
      const withNull = fromRows(
        [{ status: null as string | null, value: 42 }],
        [
          { id: statusCol, name: 'Status', type: ColumnType.LABEL, getValue: (r: { status: string | null; value: number }) => r.status },
          { id: valueCol, name: 'Value', type: ColumnType.NUMBER, getValue: (r: { status: string | null; value: number }) => r.value },
        ],
      );
      el.props = {
        lookup: { dataSetId: 'test', operations: [] },
        rowStyle: [{ condition: "#{row.status} == 'Critical'", className: 'pages-row-danger' }],
      };
      el.dataSet = withNull;
      await el.updateComplete;

      const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
      expect(rows[0]!.classList.contains('pages-row-danger')).toBe(false);
    });
  });

  describe('column expressions', () => {
    it('applies column expression to cell values', async () => {
      const salaryCol = 'salary' as ColumnId;
      const ds = fromRows(
        [{ name: 'Alice', salary: 100000 }],
        [
          { id: nameCol, name: 'Name', type: ColumnType.TEXT, getValue: (r: { name: string; salary: number }) => r.name },
          { id: salaryCol, name: 'Salary', type: ColumnType.NUMBER, getValue: (r: { name: string; salary: number }) => r.salary },
        ],
      );
      el.props = {
        lookup: { dataSetId: 'test', operations: [] },
        columns: [{ id: salaryCol, expression: "'$' & value" }],
      };
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => setTimeout(r, 100));
      await el.updateComplete;

      const cells = el.shadowRoot!.querySelectorAll('[role="gridcell"]');
      expect(cells[0]!.textContent).toContain('$100000');
    });
  });

  describe('CSV export buttons', () => {
    it('shows export buttons in kebab menu when csvExport is true', async () => {
      el.props = { csvExport: true, lookup: { dataSetId: 'test', operations: [] } };
      el.dataSet = testDataSet;
      await el.updateComplete;

      const kebab = el.shadowRoot!.querySelector('.column-picker-trigger') as HTMLElement;
      kebab.click();
      await el.updateComplete;

      const downloadBtn = el.shadowRoot!.querySelector('[aria-label="Download CSV"]');
      const copyBtn = el.shadowRoot!.querySelector('[aria-label="Copy CSV"]');
      expect(downloadBtn).not.toBeNull();
      expect(copyBtn).not.toBeNull();
    });

    it('does not show export buttons in kebab menu when csvExport is not set', async () => {
      el.props = { lookup: { dataSetId: 'test', operations: [] } };
      el.dataSet = testDataSet;
      await el.updateComplete;

      const kebab = el.shadowRoot!.querySelector('.column-picker-trigger') as HTMLElement;
      kebab.click();
      await el.updateComplete;

      const downloadBtn = el.shadowRoot!.querySelector('[aria-label="Download CSV"]');
      expect(downloadBtn).toBeNull();
    });
  });

  describe('rowDetail (YAML mode)', () => {
    it('generates getRowDetail from rowDetail.columns config', async () => {
      el.props = { rowDetail: { columns: [{ id: 'age', label: 'Age' }] } };
      el.dataSet = testDataSet;
      await el.updateComplete;

      const toggles = el.shadowRoot!.querySelectorAll('.expand-toggle');
      expect(toggles.length).toBe(3);
    });

    it('renders detail panel with column values on expand', async () => {
      el.props = { rowDetail: { columns: [{ id: 'age', label: 'Years Old' }] } };
      el.dataSet = testDataSet;
      await el.updateComplete;

      const btn = el.shadowRoot!.querySelector('.expand-toggle') as HTMLElement;
      btn.click();
      await el.updateComplete;

      const panel = el.shadowRoot!.querySelector('.detail-panel:not([hidden])');
      expect(panel).toBeTruthy();
      expect(panel!.textContent).toContain('Years Old');
      expect(panel!.textContent).toContain('30');
    });

    it('sets detailMode from rowDetail.mode', async () => {
      el.props = { rowDetail: { mode: 'multi', columns: [{ id: 'age' }] } };
      el.dataSet = testDataSet;
      await el.updateComplete;

      const expandAll = el.shadowRoot!.querySelector('.expand-all-toggle');
      expect(expandAll).toBeTruthy();
    });

    it('auto-generates getRowKey from first column when not set', async () => {
      el.props = { rowDetail: { columns: [{ id: 'age' }] } };
      el.dataSet = testDataSet;
      await el.updateComplete;

      const events: Array<{ key: string }> = [];
      el.addEventListener('detail-change', ((e: CustomEvent) => {
        events.push(e.detail);
      }) as EventListener);

      const btn = el.shadowRoot!.querySelector('.expand-toggle') as HTMLElement;
      btn.click();
      await el.updateComplete;

      expect(events).toHaveLength(1);
      expect(events[0]!.key).toBe('Alice');
    });
  });

  describe('column display hints', () => {
    let el: TableEl;

    beforeEach(async () => {
      el = document.createElement('pages-table') as unknown as TableEl;
      document.body.appendChild(el);
    });

    afterEach(() => {
      document.body.removeChild(el);
    });

    it('merges width from ColumnSettings into columnConfig', async () => {
      el.props = {
        columns: [
          { id: 'name', name: 'Name', width: '3fr' },
          { id: 'age', name: 'Age', width: '120px', align: 'center' },
        ],
      };
      el.dataSet = testDataSet;
      await el.updateComplete;
      expect(el.columnConfig![0]!.width).toBe('3fr');
      expect(el.columnConfig![1]!.width).toBe('120px');
    });

    it('defaults to 1fr when no width hint', async () => {
      el.props = {
        columns: [{ id: 'name', name: 'Name' }],
      };
      el.dataSet = testDataSet;
      await el.updateComplete;
      expect(el.columnConfig![0]!.width).toBe('1fr');
    });

    it('per-column sortable overrides global sortable', async () => {
      el.props = {
        sortable: true,
        columns: [
          { id: 'name', name: 'Name', sortable: false },
          { id: 'age', name: 'Age' },
        ],
      };
      el.dataSet = testDataSet;
      await el.updateComplete;
      expect(el.columnConfig![0]!.sortable).toBe(false);
      expect(el.columnConfig![1]!.sortable).toBe(true);
    });

    it('maps mergeRows from YAML columns config', async () => {
      el.props = {
        columns: [
          { id: 'name', name: 'Name', mergeRows: true },
          { id: 'age', name: 'Age' },
        ],
      };
      el.dataSet = testDataSet;
      await el.updateComplete;
      expect(el.columnConfig![0]!.mergeRows).toBe(true);
      expect(el.columnConfig![1]!.mergeRows).toBeUndefined();
    });
  });

  describe('rowAccent', () => {
    let el: TableEl & { getRowAccent?: (row: any) => string | undefined };

    beforeEach(async () => {
      el = document.createElement('pages-table') as unknown as TableEl & { getRowAccent?: (row: any) => string | undefined };
      document.body.appendChild(el);
    });

    afterEach(() => {
      document.body.removeChild(el);
    });

    it('YAML rowAccent config converts to getRowAccent function', async () => {
      el.props = {
        rowAccent: {
          column: 'name',
          colorMap: { Alice: '#2e7d32', Bob: '#e65100' },
        },
      };
      el.dataSet = testDataSet;
      await el.updateComplete;
      expect(el.getRowAccent).toBeDefined();
      const row = el.dataSet!.rows[0]!;
      expect(el.getRowAccent!(row)).toBe('#2e7d32');
    });

    it('rowAccent default color applies for unmapped values', async () => {
      el.props = {
        rowAccent: {
          column: 'name',
          colorMap: { Alice: '#2e7d32' },
          default: '#9e9e9e',
        },
      };
      el.dataSet = testDataSet;
      await el.updateComplete;
      const bob = el.dataSet!.rows[1]!;
      expect(el.getRowAccent!(bob)).toBe('#9e9e9e');
    });

    it('rowAccent returns undefined for unmapped values without default', async () => {
      el.props = {
        rowAccent: {
          column: 'name',
          colorMap: { Alice: '#2e7d32' },
        },
      };
      el.dataSet = testDataSet;
      await el.updateComplete;
      const bob = el.dataSet!.rows[1]!;
      expect(el.getRowAccent!(bob)).toBeUndefined();
    });

    it('getRowAccent renders border-left on first cell', async () => {
      el.getRowAccent = (row: any) => {
        const val = row.text('name' as any);
        return val === 'Bob' ? '#e65100' : undefined;
      };
      el.dataSet = testDataSet;
      await el.updateComplete;

      const cells = [...el.shadowRoot!.querySelectorAll('.cell[role="gridcell"]')] as HTMLElement[];
      const bobFirstCell = cells.find(c => (c.getAttribute('style') ?? '').includes('grid-row: 2') && (c.getAttribute('style') ?? '').includes('grid-column: 1'))!;
      const bobStyle = bobFirstCell.getAttribute('style') ?? '';
      expect(bobStyle).toContain('border-left');
      expect(bobStyle).toContain('#e65100');
      const aliceFirstCell = cells.find(c => (c.getAttribute('style') ?? '').includes('grid-row: 1') && (c.getAttribute('style') ?? '').includes('grid-column: 1'))!;
      const aliceStyle = aliceFirstCell.getAttribute('style') ?? '';
      expect(aliceStyle).not.toContain('border-left');
    });
  });
});
