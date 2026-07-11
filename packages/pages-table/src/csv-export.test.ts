import { describe, it, expect } from 'vitest';
import { tableToCsv } from './csv-export.js';
import type { ColumnId } from '@casehubio/pages-data/dist/dataset/types.js';
import { ColumnType } from '@casehubio/pages-data/dist/dataset/types.js';
import { fromRows } from '@casehubio/pages-data/dist/dataset/conversion.js';

const nameCol = 'name' as ColumnId;
const ageCol = 'age' as ColumnId;
const roleCol = 'role' as ColumnId;

interface Person { name: string; age: number; role: string; }

const cols = [
  { id: nameCol, name: 'Name', type: ColumnType.TEXT, getValue: (r: Person) => r.name },
  { id: ageCol, name: 'Age', type: ColumnType.NUMBER, getValue: (r: Person) => r.age },
  { id: roleCol, name: 'Role', type: ColumnType.TEXT, getValue: (r: Person) => r.role },
] as const;

const dataSet = fromRows(
  [
    { name: 'Alice', age: 30, role: 'Engineer' },
    { name: 'Bob', age: 25, role: 'Designer' },
  ],
  cols,
);

describe('csv-export', () => {
  describe('tableToCsv', () => {
    it('generates CSV with header and data rows', () => {
      const csv = tableToCsv(dataSet);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe('Name,Age,Role');
      expect(lines[1]).toBe('Alice,30,Engineer');
      expect(lines[2]).toBe('Bob,25,Designer');
    });

    it('escapes fields containing commas', () => {
      const ds = fromRows([{ name: 'Smith, John', age: 40, role: 'Lead' }], cols);
      const csv = tableToCsv(ds);
      expect(csv).toContain('"Smith, John"');
    });

    it('escapes fields containing double quotes', () => {
      const ds = fromRows([{ name: 'The "Boss"', age: 50, role: 'CEO' }], cols);
      const csv = tableToCsv(ds);
      expect(csv).toContain('"The ""Boss"""');
    });

    it('escapes fields containing newlines', () => {
      const ds = fromRows([{ name: 'Line1\nLine2', age: 35, role: 'Writer' }], cols);
      const csv = tableToCsv(ds);
      expect(csv).toContain('"Line1\nLine2"');
    });

    it('handles null values', () => {
      const ds = fromRows([{ val: null as string | null }], [
        { id: 'val' as ColumnId, name: 'Value', type: ColumnType.TEXT, getValue: (r: { val: string | null }) => r.val },
      ]);
      const csv = tableToCsv(ds);
      expect(csv).toBe('Value\n');
    });

    it('uses label override from columnConfig', () => {
      const csv = tableToCsv(dataSet, [{ id: nameCol, label: 'Full Name' }]);
      expect(csv.split('\n')[0]).toContain('Full Name');
    });

    it('excludes hidden columns via config', () => {
      const csv = tableToCsv(dataSet, [{ id: ageCol, visible: false }]);
      const header = csv.split('\n')[0]!;
      expect(header).not.toContain('Age');
      expect(header).toContain('Name');
    });

    it('handles empty rows', () => {
      const ds = fromRows([] as Person[], cols);
      const csv = tableToCsv(ds);
      expect(csv).toBe('Name,Age,Role');
    });

    it('handles Date values', () => {
      const ds = fromRows([{ d: new Date('2026-01-15T00:00:00.000Z') }], [
        { id: 'date' as ColumnId, name: 'Date', type: ColumnType.DATE, getValue: (r: { d: Date }) => r.d },
      ]);
      const csv = tableToCsv(ds);
      expect(csv).toContain('2026-01-15');
    });
  });
});
