import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { TypedDataSet, ColumnId } from '@casehubio/pages-data';
import { ColumnType } from '@casehubio/pages-data';
import { fromRows } from '@casehubio/pages-data';
import { buildTreeIndex, computeDefaultExpandState, paginateTreeByRoots } from './tree-builder.js';

type TableEl = HTMLElement & {
  dataSet?: TypedDataSet;
  props: Record<string, unknown>;
  totalRows?: number;
  pageSize: number;
  mode: string;
  filterText: string;
  updateComplete: Promise<boolean>;
};

const idCol = 'id' as ColumnId;
const parentIdCol = 'parentId' as ColumnId;
const nameCol = 'name' as ColumnId;
const levelCol = 'level' as ColumnId;

function makeOrgDataSet() {
  return fromRows(
    [
      { id: '1', parentId: '', name: 'Acme Corp', level: 'Company' },
      { id: '2', parentId: '1', name: 'Engineering', level: 'Division' },
      { id: '3', parentId: '1', name: 'Product', level: 'Division' },
      { id: '4', parentId: '2', name: 'Platform', level: 'Team' },
      { id: '5', parentId: '2', name: 'Frontend', level: 'Team' },
      { id: '6', parentId: '3', name: 'Design', level: 'Team' },
    ],
    [
      { id: idCol, name: 'ID', type: ColumnType.TEXT, getValue: (r: { id: string; parentId: string; name: string; level: string }) => r.id },
      { id: parentIdCol, name: 'Parent', type: ColumnType.TEXT, getValue: (r: { id: string; parentId: string; name: string; level: string }) => r.parentId },
      { id: nameCol, name: 'Name', type: ColumnType.TEXT, getValue: (r: { id: string; parentId: string; name: string; level: string }) => r.name },
      { id: levelCol, name: 'Level', type: ColumnType.LABEL, getValue: (r: { id: string; parentId: string; name: string; level: string }) => r.level },
    ],
  );
}

function makeMultiRootDataSet() {
  return fromRows(
    [
      { id: 'A', parentId: '', name: 'Root A', level: 'Root' },
      { id: 'A1', parentId: 'A', name: 'Child A1', level: 'Child' },
      { id: 'A2', parentId: 'A', name: 'Child A2', level: 'Child' },
      { id: 'B', parentId: '', name: 'Root B', level: 'Root' },
      { id: 'B1', parentId: 'B', name: 'Child B1', level: 'Child' },
      { id: 'C', parentId: '', name: 'Root C', level: 'Root' },
      { id: 'C1', parentId: 'C', name: 'Child C1', level: 'Child' },
      { id: 'C2', parentId: 'C', name: 'Child C2', level: 'Child' },
      { id: 'C3', parentId: 'C', name: 'Child C3', level: 'Child' },
    ],
    [
      { id: idCol, name: 'ID', type: ColumnType.TEXT, getValue: (r: { id: string; parentId: string; name: string; level: string }) => r.id },
      { id: parentIdCol, name: 'Parent', type: ColumnType.TEXT, getValue: (r: { id: string; parentId: string; name: string; level: string }) => r.parentId },
      { id: nameCol, name: 'Name', type: ColumnType.TEXT, getValue: (r: { id: string; parentId: string; name: string; level: string }) => r.name },
      { id: levelCol, name: 'Level', type: ColumnType.LABEL, getValue: (r: { id: string; parentId: string; name: string; level: string }) => r.level },
    ],
  );
}

describe('paginateTreeByRoots', () => {
  it('slices by root count, including all expanded children', () => {
    const ds = makeMultiRootDataSet();
    const config = { idColumn: idCol, parentColumn: parentIdCol };
    const { roots } = buildTreeIndex(ds, config);
    const expandState = computeDefaultExpandState(roots, true);

    const page0 = paginateTreeByRoots(roots, expandState, 0, 2);
    expect(page0.rootCount).toBe(3);
    const page0Names = page0.pageNodes.map(n => n.row.text(nameCol));
    expect(page0Names).toEqual(['Root A', 'Child A1', 'Child A2', 'Root B', 'Child B1']);

    const page1 = paginateTreeByRoots(roots, expandState, 1, 2);
    const page1Names = page1.pageNodes.map(n => n.row.text(nameCol));
    expect(page1Names).toEqual(['Root C', 'Child C1', 'Child C2', 'Child C3']);
  });

  it('returns correct rootCount for page calculation', () => {
    const ds = makeMultiRootDataSet();
    const config = { idColumn: idCol, parentColumn: parentIdCol };
    const { roots } = buildTreeIndex(ds, config);
    const expandState = computeDefaultExpandState(roots, false);

    const result = paginateTreeByRoots(roots, expandState, 0, 2);
    expect(result.rootCount).toBe(3);
    expect(result.pageNodes).toHaveLength(2);
  });
});

describe('tree table (expandable)', () => {
  let el: TableEl;

  beforeEach(async () => {
    await import('./pages-data-table');
    el = document.createElement('pages-data-table') as TableEl;
    document.body.appendChild(el);
  });

  afterEach(() => { el.remove(); });

  it('shows only root rows when defaultExpanded is not set', async () => {
    el.props = {
      lookup: { dataSetId: 'test', operations: [] },
      expandable: { idColumn: idCol, parentColumn: parentIdCol },
    };
    el.dataSet = makeOrgDataSet();
    await el.updateComplete;

    const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
    expect(rows.length).toBe(1);
  });

  it('treats empty string parentId as root', async () => {
    el.props = {
      lookup: { dataSetId: 'test', operations: [] },
      expandable: { idColumn: idCol, parentColumn: parentIdCol },
    };
    el.dataSet = makeOrgDataSet();
    await el.updateComplete;

    const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
    const rowText = rows[0]!.textContent!;
    expect(rowText).toContain('Acme Corp');
  });

  it('expand toggle click shows children', async () => {
    el.props = {
      lookup: { dataSetId: 'test', operations: [] },
      expandable: { idColumn: idCol, parentColumn: parentIdCol },
    };
    el.dataSet = makeOrgDataSet();
    await el.updateComplete;

    const toggle = el.shadowRoot!.querySelector('.tree-toggle') as HTMLElement;
    expect(toggle).not.toBeNull();
    toggle.click();
    await el.updateComplete;

    const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
    expect(rows.length).toBe(3);
  });

  it('collapse hides children recursively', async () => {
    el.props = {
      lookup: { dataSetId: 'test', operations: [] },
      expandable: { idColumn: idCol, parentColumn: parentIdCol, defaultExpanded: true },
    };
    el.dataSet = makeOrgDataSet();
    await el.updateComplete;

    let rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
    expect(rows.length).toBe(6);

    const toggle = el.shadowRoot!.querySelector('.tree-toggle') as HTMLElement;
    toggle.click();
    await el.updateComplete;

    rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
    expect(rows.length).toBe(1);
  });

  it('leaf rows have no toggle button', async () => {
    el.props = {
      lookup: { dataSetId: 'test', operations: [] },
      expandable: { idColumn: idCol, parentColumn: parentIdCol, defaultExpanded: true },
    };
    el.dataSet = makeOrgDataSet();
    await el.updateComplete;

    const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
    const leafRow = rows[3]!;
    expect(leafRow.querySelector('.tree-toggle')).toBeNull();
    expect(leafRow.querySelector('.tree-spacer')).not.toBeNull();
  });

  it('defaultExpanded: 1 expands first level', async () => {
    el.props = {
      lookup: { dataSetId: 'test', operations: [] },
      expandable: { idColumn: idCol, parentColumn: parentIdCol, defaultExpanded: 1 },
    };
    el.dataSet = makeOrgDataSet();
    await el.updateComplete;

    const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
    expect(rows.length).toBe(3);
  });

  it('defaultExpanded: true expands all levels', async () => {
    el.props = {
      lookup: { dataSetId: 'test', operations: [] },
      expandable: { idColumn: idCol, parentColumn: parentIdCol, defaultExpanded: true },
    };
    el.dataSet = makeOrgDataSet();
    await el.updateComplete;

    const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
    expect(rows.length).toBe(6);
  });

  it('defaultExpanded: 2 expands two levels deep', async () => {
    el.props = {
      lookup: { dataSetId: 'test', operations: [] },
      expandable: { idColumn: idCol, parentColumn: parentIdCol, defaultExpanded: 2 },
    };
    el.dataSet = makeOrgDataSet();
    await el.updateComplete;

    const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
    expect(rows.length).toBe(6);
  });

  it('sets aria-level on all rows', async () => {
    el.props = {
      lookup: { dataSetId: 'test', operations: [] },
      expandable: { idColumn: idCol, parentColumn: parentIdCol, defaultExpanded: true },
    };
    el.dataSet = makeOrgDataSet();
    await el.updateComplete;

    const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
    expect(rows[0]!.getAttribute('aria-level')).toBe('1');
    expect(rows[1]!.getAttribute('aria-level')).toBe('2');
    expect(rows[3]!.getAttribute('aria-level')).toBe('3');
  });

  it('sets aria-setsize and aria-posinset on rows', async () => {
    el.props = {
      lookup: { dataSetId: 'test', operations: [] },
      expandable: { idColumn: idCol, parentColumn: parentIdCol, defaultExpanded: true },
    };
    el.dataSet = makeOrgDataSet();
    await el.updateComplete;

    const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
    expect(rows[0]!.getAttribute('aria-setsize')).toBe('1');
    expect(rows[0]!.getAttribute('aria-posinset')).toBe('1');
    expect(rows[1]!.getAttribute('aria-setsize')).toBe('2');
    expect(rows[1]!.getAttribute('aria-posinset')).toBe('1');
    const productRow = rows[4]!;
    expect(productRow.getAttribute('aria-setsize')).toBe('2');
    expect(productRow.getAttribute('aria-posinset')).toBe('2');
  });

  it('sets aria-expanded on expandable rows', async () => {
    el.props = {
      lookup: { dataSetId: 'test', operations: [] },
      expandable: { idColumn: idCol, parentColumn: parentIdCol, defaultExpanded: 1 },
    };
    el.dataSet = makeOrgDataSet();
    await el.updateComplete;

    const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
    expect(rows[0]!.getAttribute('aria-expanded')).toBe('true');
    expect(rows[1]!.getAttribute('aria-expanded')).toBe('false');
  });

  it('leaf rows do not have aria-expanded', async () => {
    el.props = {
      lookup: { dataSetId: 'test', operations: [] },
      expandable: { idColumn: idCol, parentColumn: parentIdCol, defaultExpanded: true },
    };
    el.dataSet = makeOrgDataSet();
    await el.updateComplete;

    const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
    const leafRow = rows[3]!;
    expect(leafRow.hasAttribute('aria-expanded')).toBe(false);
  });

  it('child rows are indented with padding-left scaling by depth', async () => {
    el.props = {
      lookup: { dataSetId: 'test', operations: [] },
      expandable: { idColumn: idCol, parentColumn: parentIdCol, defaultExpanded: true },
    };
    el.dataSet = makeOrgDataSet();
    await el.updateComplete;

    const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
    const rootCell = rows[0]!.querySelector('.tree-cell') as HTMLElement;
    const childCell = rows[1]!.querySelector('.tree-cell') as HTMLElement;
    expect(rootCell.style.paddingLeft).toContain('0px');
    expect(childCell.style.paddingLeft).toContain('20px');
  });

  it('expand state persists across data re-pushes', async () => {
    el.props = {
      lookup: { dataSetId: 'test', operations: [] },
      expandable: { idColumn: idCol, parentColumn: parentIdCol },
    };
    el.dataSet = makeOrgDataSet();
    await el.updateComplete;

    const toggle = el.shadowRoot!.querySelector('.tree-toggle') as HTMLElement;
    toggle.click();
    await el.updateComplete;

    let rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
    expect(rows.length).toBe(3);

    el.dataSet = makeOrgDataSet();
    await el.updateComplete;

    rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
    expect(rows.length).toBe(3);
  });

  it('toggle button shows correct icon: collapsed vs expanded', async () => {
    el.props = {
      lookup: { dataSetId: 'test', operations: [] },
      expandable: { idColumn: idCol, parentColumn: parentIdCol },
    };
    el.dataSet = makeOrgDataSet();
    await el.updateComplete;

    let toggle = el.shadowRoot!.querySelector('.tree-toggle') as HTMLElement;
    expect(toggle.textContent).toContain('▶');

    toggle.click();
    await el.updateComplete;

    toggle = el.shadowRoot!.querySelector('.tree-toggle') as HTMLElement;
    expect(toggle.textContent).toContain('▼');
  });

  it('client filter preserves ancestor rows for matching descendants', async () => {
    el.props = {
      lookup: { dataSetId: 'test', operations: [] },
      expandable: { idColumn: idCol, parentColumn: parentIdCol, defaultExpanded: true },
    };
    el.dataSet = makeOrgDataSet();
    (el as any).clientFilter = true;
    (el as any).filterText = 'Platform';
    await el.updateComplete;

    const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
    expect(rows.length).toBe(3);
    expect(rows[0]!.textContent).toContain('Acme Corp');
    expect(rows[1]!.textContent).toContain('Engineering');
    expect(rows[2]!.textContent).toContain('Platform');
  });

  it('ancestor context rows have filter-context class', async () => {
    el.props = {
      lookup: { dataSetId: 'test', operations: [] },
      expandable: { idColumn: idCol, parentColumn: parentIdCol, defaultExpanded: true },
    };
    el.dataSet = makeOrgDataSet();
    (el as any).clientFilter = true;
    (el as any).filterText = 'Platform';
    await el.updateComplete;

    const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
    const acmeCell = rows[0]!.querySelector('.cell');
    const engCell = rows[1]!.querySelector('.cell');
    const platformCell = rows[2]!.querySelector('.cell');
    expect(acmeCell!.classList.contains('filter-context')).toBe(true);
    expect(engCell!.classList.contains('filter-context')).toBe(true);
    expect(platformCell!.classList.contains('filter-context')).toBe(false);
  });

  it('filter auto-expands collapsed ancestors to show matches', async () => {
    el.props = {
      lookup: { dataSetId: 'test', operations: [] },
      expandable: { idColumn: idCol, parentColumn: parentIdCol },
    };
    el.dataSet = makeOrgDataSet();
    (el as any).clientFilter = true;
    (el as any).filterText = 'Design';
    await el.updateComplete;

    const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
    expect(rows.length).toBe(3);
    expect(rows[0]!.textContent).toContain('Acme Corp');
    expect(rows[1]!.textContent).toContain('Product');
    expect(rows[2]!.textContent).toContain('Design');
  });

  it('empty filter shows all rows per expand state', async () => {
    el.props = {
      lookup: { dataSetId: 'test', operations: [] },
      expandable: { idColumn: idCol, parentColumn: parentIdCol, defaultExpanded: true },
    };
    el.dataSet = makeOrgDataSet();
    (el as any).clientFilter = true;
    (el as any).filterText = '';
    await el.updateComplete;

    const rows = el.shadowRoot!.querySelectorAll('.row[role="row"]:not(.header)');
    expect(rows.length).toBe(6);
  });
});
