import { describe, it, expect } from 'vitest';
import { computeSpanMap, isSuppressed, isOrigin } from './span-map.js';
import { fromRows } from '@casehubio/pages-data';
import { ColumnType } from '@casehubio/pages-data';
import type { ColumnId } from '@casehubio/pages-data';
import type { CellSpan, SuppressedCell } from './span-map.js';
import type { TableColumnConfig } from './types.js';

const countryCol = 'country' as ColumnId;
const nameCol = 'name' as ColumnId;
const ageCol = 'age' as ColumnId;

const columns = [
  { id: countryCol, name: 'Country', type: ColumnType.TEXT, getValue: (r: any) => r.country },
  { id: nameCol, name: 'Name', type: ColumnType.TEXT, getValue: (r: any) => r.name },
  { id: ageCol, name: 'Age', type: ColumnType.NUMBER, getValue: (r: any) => r.age },
];

describe('computeSpanMap', () => {
  describe('mergeRows: true', () => {
    it('merges adjacent rows with equal values', () => {
      const data = [
        { country: 'USA', name: 'Alice', age: 30 },
        { country: 'USA', name: 'Bob', age: 25 },
        { country: 'USA', name: 'Carol', age: 35 },
        { country: 'UK', name: 'Dave', age: 28 },
      ];
      const ds = fromRows(data, columns);
      const config: TableColumnConfig[] = [
        { id: countryCol, mergeRows: true },
        { id: nameCol },
        { id: ageCol },
      ];
      const visible = new Set([String(countryCol), String(nameCol), String(ageCol)]);
      const map = computeSpanMap(ds.rows, ds.columns, config, visible);

      const r0 = map.get(0)?.get(String(countryCol));
      expect(r0).toBeTruthy();
      expect(isOrigin(r0!)).toBe(true);
      expect((r0 as CellSpan).rowSpan).toBe(3);
      expect((r0 as CellSpan).colSpan).toBe(1);

      const r1 = map.get(1)?.get(String(countryCol));
      expect(r1).toBeTruthy();
      expect(isSuppressed(r1!)).toBe(true);
      expect((r1 as SuppressedCell).originRow).toBe(0);

      const r2 = map.get(2)?.get(String(countryCol));
      expect(isSuppressed(r2!)).toBe(true);

      expect(map.get(3)?.get(String(countryCol))).toBeUndefined();
      expect(map.get(0)?.get(String(nameCol))).toBeUndefined();
    });

    it('handles all-same-value column (single large span)', () => {
      const data = Array.from({ length: 5 }, () => ({ country: 'USA', name: 'X', age: 1 }));
      const ds = fromRows(data, columns);
      const config: TableColumnConfig[] = [{ id: countryCol, mergeRows: true }, { id: nameCol }, { id: ageCol }];
      const map = computeSpanMap(ds.rows, ds.columns, config, new Set([String(countryCol), String(nameCol), String(ageCol)]));

      const origin = map.get(0)?.get(String(countryCol));
      expect(isOrigin(origin!)).toBe(true);
      expect((origin as CellSpan).rowSpan).toBe(5);

      for (let i = 1; i < 5; i++) {
        expect(isSuppressed(map.get(i)!.get(String(countryCol))!)).toBe(true);
      }
    });

    it('handles all-unique values (no spans)', () => {
      const data = [
        { country: 'A', name: 'a', age: 1 },
        { country: 'B', name: 'b', age: 2 },
        { country: 'C', name: 'c', age: 3 },
      ];
      const ds = fromRows(data, columns);
      const config: TableColumnConfig[] = [{ id: countryCol, mergeRows: true }, { id: nameCol }, { id: ageCol }];
      const map = computeSpanMap(ds.rows, ds.columns, config, new Set([String(countryCol), String(nameCol), String(ageCol)]));
      expect(map.size).toBe(0);
    });

    it('handles multiple merge groups in same column', () => {
      const data = [
        { country: 'USA', name: 'A', age: 1 },
        { country: 'USA', name: 'B', age: 2 },
        { country: 'UK', name: 'C', age: 3 },
        { country: 'UK', name: 'D', age: 4 },
        { country: 'UK', name: 'E', age: 5 },
      ];
      const ds = fromRows(data, columns);
      const config: TableColumnConfig[] = [{ id: countryCol, mergeRows: true }, { id: nameCol }, { id: ageCol }];
      const visible = new Set([String(countryCol), String(nameCol), String(ageCol)]);
      const map = computeSpanMap(ds.rows, ds.columns, config, visible);

      expect((map.get(0)?.get(String(countryCol)) as CellSpan).rowSpan).toBe(2);
      expect((map.get(2)?.get(String(countryCol)) as CellSpan).rowSpan).toBe(3);
    });

    it('merges across multiple columns independently', () => {
      const data = [
        { country: 'USA', name: 'Alice', age: 1 },
        { country: 'USA', name: 'Alice', age: 2 },
        { country: 'UK', name: 'Alice', age: 3 },
      ];
      const ds = fromRows(data, columns);
      const config: TableColumnConfig[] = [
        { id: countryCol, mergeRows: true },
        { id: nameCol, mergeRows: true },
        { id: ageCol },
      ];
      const visible = new Set([String(countryCol), String(nameCol), String(ageCol)]);
      const map = computeSpanMap(ds.rows, ds.columns, config, visible);

      expect((map.get(0)?.get(String(countryCol)) as CellSpan).rowSpan).toBe(2);
      expect((map.get(0)?.get(String(nameCol)) as CellSpan).rowSpan).toBe(3);
    });

    it('handles single row (no merge possible)', () => {
      const data = [{ country: 'USA', name: 'A', age: 1 }];
      const ds = fromRows(data, columns);
      const config: TableColumnConfig[] = [{ id: countryCol, mergeRows: true }, { id: nameCol }, { id: ageCol }];
      const map = computeSpanMap(ds.rows, ds.columns, config, new Set([String(countryCol), String(nameCol), String(ageCol)]));
      expect(map.size).toBe(0);
    });

    it('handles null values — adjacent nulls merge', () => {
      const data = [
        { country: null, name: 'A', age: 1 },
        { country: null, name: 'B', age: 2 },
        { country: 'USA', name: 'C', age: 3 },
      ];
      const ds = fromRows(data as any, columns);
      const config: TableColumnConfig[] = [{ id: countryCol, mergeRows: true }, { id: nameCol }, { id: ageCol }];
      const visible = new Set([String(countryCol), String(nameCol), String(ageCol)]);
      const map = computeSpanMap(ds.rows, ds.columns, config, visible);

      expect((map.get(0)?.get(String(countryCol)) as CellSpan).rowSpan).toBe(2);
    });
  });

  describe('mergeRows callback', () => {
    it('uses custom comparator', () => {
      const data = [
        { country: 'usa', name: 'Alice', age: 1 },
        { country: 'USA', name: 'Bob', age: 2 },
        { country: 'UK', name: 'Carol', age: 3 },
      ];
      const ds = fromRows(data, columns);
      const config: TableColumnConfig[] = [
        { id: countryCol, mergeRows: (a, b) =>
          a.type !== 'NULL' && b.type !== 'NULL' &&
          String(a.value).toLowerCase() === String(b.value).toLowerCase() },
        { id: nameCol },
        { id: ageCol },
      ];
      const visible = new Set([String(countryCol), String(nameCol), String(ageCol)]);
      const map = computeSpanMap(ds.rows, ds.columns, config, visible);

      const origin = map.get(0)?.get(String(countryCol));
      expect(isOrigin(origin!)).toBe(true);
      expect((origin as CellSpan).rowSpan).toBe(2);
    });
  });

  describe('cellSpan callback', () => {
    it('applies explicit colSpan', () => {
      const data = [
        { country: 'USA', name: 'Alice', age: 1 },
        { country: 'UK', name: 'Bob', age: 2 },
      ];
      const ds = fromRows(data, columns);
      const config: TableColumnConfig[] = [
        { id: countryCol, cellSpan: (_row, i) => i === 0 ? { colSpan: 2 } : undefined },
        { id: nameCol },
        { id: ageCol },
      ];
      const visible = new Set([String(countryCol), String(nameCol), String(ageCol)]);
      const map = computeSpanMap(ds.rows, ds.columns, config, visible);

      const origin = map.get(0)?.get(String(countryCol));
      expect(isOrigin(origin!)).toBe(true);
      expect((origin as CellSpan).colSpan).toBe(2);

      const suppressed = map.get(0)?.get(String(nameCol));
      expect(isSuppressed(suppressed!)).toBe(true);
      expect((suppressed as SuppressedCell).originCol).toBe(String(countryCol));
    });

    it('applies explicit rowSpan', () => {
      const data = [
        { country: 'USA', name: 'Alice', age: 1 },
        { country: 'UK', name: 'Bob', age: 2 },
        { country: 'FR', name: 'Carol', age: 3 },
      ];
      const ds = fromRows(data, columns);
      const config: TableColumnConfig[] = [
        { id: countryCol, cellSpan: (_row, i) => i === 0 ? { rowSpan: 2 } : undefined },
        { id: nameCol },
        { id: ageCol },
      ];
      const visible = new Set([String(countryCol), String(nameCol), String(ageCol)]);
      const map = computeSpanMap(ds.rows, ds.columns, config, visible);

      const origin = map.get(0)?.get(String(countryCol));
      expect(isOrigin(origin!)).toBe(true);
      expect((origin as CellSpan).rowSpan).toBe(2);

      const suppressed = map.get(1)?.get(String(countryCol));
      expect(isSuppressed(suppressed!)).toBe(true);
      expect((suppressed as SuppressedCell).originRow).toBe(0);
    });

    it('applies both colSpan and rowSpan', () => {
      const data = [
        { country: 'USA', name: 'Alice', age: 1 },
        { country: 'UK', name: 'Bob', age: 2 },
        { country: 'FR', name: 'Carol', age: 3 },
      ];
      const ds = fromRows(data, columns);
      const config: TableColumnConfig[] = [
        { id: countryCol, cellSpan: (_row, i) => i === 0 ? { colSpan: 2, rowSpan: 2 } : undefined },
        { id: nameCol },
        { id: ageCol },
      ];
      const visible = new Set([String(countryCol), String(nameCol), String(ageCol)]);
      const map = computeSpanMap(ds.rows, ds.columns, config, visible);

      expect((map.get(0)?.get(String(countryCol)) as CellSpan).colSpan).toBe(2);
      expect((map.get(0)?.get(String(countryCol)) as CellSpan).rowSpan).toBe(2);

      // row 0, name col: suppressed by colSpan
      expect(isSuppressed(map.get(0)!.get(String(nameCol))!)).toBe(true);
      // row 1, country col: suppressed by rowSpan
      expect(isSuppressed(map.get(1)!.get(String(countryCol))!)).toBe(true);
      // row 1, name col: suppressed by both
      expect(isSuppressed(map.get(1)!.get(String(nameCol))!)).toBe(true);

      // row 2 is unaffected
      expect(map.get(2)?.get(String(countryCol))).toBeUndefined();
    });

    it('cellSpan overrides mergeRows', () => {
      const data = [
        { country: 'USA', name: 'Alice', age: 1 },
        { country: 'USA', name: 'Bob', age: 2 },
        { country: 'USA', name: 'Carol', age: 3 },
      ];
      const ds = fromRows(data, columns);
      const config: TableColumnConfig[] = [
        { id: countryCol, mergeRows: true,
          cellSpan: (_row, i) => i === 0 ? { colSpan: 2 } : undefined },
        { id: nameCol },
        { id: ageCol },
      ];
      const visible = new Set([String(countryCol), String(nameCol), String(ageCol)]);
      const map = computeSpanMap(ds.rows, ds.columns, config, visible);

      const r0 = map.get(0)?.get(String(countryCol));
      expect(isOrigin(r0!)).toBe(true);
      expect((r0 as CellSpan).colSpan).toBe(2);
    });

    it('cellSpan returning undefined falls through to mergeRows', () => {
      const data = [
        { country: 'USA', name: 'Alice', age: 1 },
        { country: 'USA', name: 'Bob', age: 2 },
        { country: 'UK', name: 'Carol', age: 3 },
      ];
      const ds = fromRows(data, columns);
      const config: TableColumnConfig[] = [
        { id: countryCol, mergeRows: true,
          cellSpan: () => undefined },
        { id: nameCol },
        { id: ageCol },
      ];
      const visible = new Set([String(countryCol), String(nameCol), String(ageCol)]);
      const map = computeSpanMap(ds.rows, ds.columns, config, visible);

      const r0 = map.get(0)?.get(String(countryCol));
      expect(isOrigin(r0!)).toBe(true);
      expect((r0 as CellSpan).rowSpan).toBe(2);
    });

    it('clamps spans past last row', () => {
      const data = [
        { country: 'A', name: 'a', age: 1 },
        { country: 'B', name: 'b', age: 2 },
      ];
      const ds = fromRows(data, columns);
      const config: TableColumnConfig[] = [
        { id: countryCol, cellSpan: (_row, i) => i === 1 ? { rowSpan: 5 } : undefined },
        { id: nameCol },
        { id: ageCol },
      ];
      const visible = new Set([String(countryCol), String(nameCol), String(ageCol)]);
      const map = computeSpanMap(ds.rows, ds.columns, config, visible);

      const origin = map.get(1)?.get(String(countryCol));
      expect(isOrigin(origin!)).toBe(true);
      expect((origin as CellSpan).rowSpan).toBe(1);
    });

    it('clamps spans past last column', () => {
      const data = [{ country: 'A', name: 'a', age: 1 }];
      const ds = fromRows(data, columns);
      const config: TableColumnConfig[] = [
        { id: countryCol },
        { id: nameCol },
        { id: ageCol, cellSpan: () => ({ colSpan: 5 }) },
      ];
      const visible = new Set([String(countryCol), String(nameCol), String(ageCol)]);
      const map = computeSpanMap(ds.rows, ds.columns, config, visible);

      const origin = map.get(0)?.get(String(ageCol));
      expect(isOrigin(origin!)).toBe(true);
      expect((origin as CellSpan).colSpan).toBe(1);
    });

    it('first-writer-wins for overlapping spans', () => {
      const data = [
        { country: 'A', name: 'B', age: 1 },
        { country: 'C', name: 'D', age: 2 },
      ];
      const ds = fromRows(data, columns);
      const config: TableColumnConfig[] = [
        { id: countryCol, cellSpan: () => ({ colSpan: 2 }) },
        { id: nameCol, cellSpan: () => ({ colSpan: 2 }) },
        { id: ageCol },
      ];
      const visible = new Set([String(countryCol), String(nameCol), String(ageCol)]);
      const map = computeSpanMap(ds.rows, ds.columns, config, visible);

      // country span claims name col — name's own span can't claim it again
      const nameEntry = map.get(0)?.get(String(nameCol));
      expect(isSuppressed(nameEntry!)).toBe(true);
    });
  });

  describe('hidden columns', () => {
    it('skips hidden columns in span computation', () => {
      const data = [
        { country: 'USA', name: 'Alice', age: 1 },
        { country: 'USA', name: 'Bob', age: 2 },
      ];
      const ds = fromRows(data, columns);
      const config: TableColumnConfig[] = [
        { id: countryCol, mergeRows: true },
        { id: nameCol },
        { id: ageCol },
      ];
      // country is hidden — mergeRows on hidden col produces no spans
      const visible = new Set([String(nameCol), String(ageCol)]);
      const map = computeSpanMap(ds.rows, ds.columns, config, visible);
      expect(map.size).toBe(0);
    });
  });

  describe('type guards', () => {
    it('isSuppressed identifies SuppressedCell', () => {
      expect(isSuppressed({ originRow: 0, originCol: 'x' })).toBe(true);
      expect(isSuppressed({ colSpan: 2, rowSpan: 1 })).toBe(false);
    });

    it('isOrigin identifies CellSpan', () => {
      expect(isOrigin({ colSpan: 2, rowSpan: 1 })).toBe(true);
      expect(isOrigin({ originRow: 0, originCol: 'x' })).toBe(false);
    });
  });
});
