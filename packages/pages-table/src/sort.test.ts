import { describe, it, expect } from 'vitest';
import { createComparator, createMultiComparator } from './sort.js';
import type { ColumnId } from '@casehubio/pages-data/dist/dataset/types.js';
import { ColumnType } from '@casehubio/pages-data/dist/dataset/types.js';
import { fromRows } from '@casehubio/pages-data/dist/dataset/conversion.js';

const nameCol = 'name' as ColumnId;
const ageCol = 'age' as ColumnId;
const dateCol = 'date' as ColumnId;

const ds = fromRows(
  [
    { name: 'banana', age: 10, date: new Date('2024-06-01') },
    { name: 'apple', age: 1, date: new Date('2024-01-01') },
    { name: 'cherry', age: 5, date: null as Date | null },
  ],
  [
    { id: nameCol, name: 'Name', type: ColumnType.TEXT, getValue: (r: { name: string; age: number; date: Date | null }) => r.name },
    { id: ageCol, name: 'Age', type: ColumnType.NUMBER, getValue: (r: { name: string; age: number; date: Date | null }) => r.age },
    { id: dateCol, name: 'Date', type: ColumnType.DATE, getValue: (r: { name: string; age: number; date: Date | null }) => r.date },
  ],
);

const [banana, apple, cherry] = ds.rows;

describe('createComparator', () => {
  it('returns identity for direction=none', () => {
    const cmp = createComparator(nameCol, 'none');
    expect(cmp(banana!, apple!)).toBe(0);
  });

  it('sorts text ascending with localeCompare', () => {
    const cmp = createComparator(nameCol, 'asc');
    expect(cmp(apple!, banana!)).toBeLessThan(0);
    expect(cmp(banana!, apple!)).toBeGreaterThan(0);
  });

  it('sorts text descending', () => {
    const cmp = createComparator(nameCol, 'desc');
    expect(cmp(apple!, banana!)).toBeGreaterThan(0);
  });

  it('sorts numbers', () => {
    const cmp = createComparator(ageCol, 'asc');
    expect(cmp(apple!, banana!)).toBeLessThan(0);
    expect(cmp(banana!, apple!)).toBeGreaterThan(0);
  });

  it('sorts dates', () => {
    const cmp = createComparator(dateCol, 'asc');
    expect(cmp(apple!, banana!)).toBeLessThan(0);
    expect(cmp(banana!, apple!)).toBeGreaterThan(0);
  });

  it('sorts nulls last in ascending', () => {
    const cmp = createComparator(dateCol, 'asc');
    expect(cmp(cherry!, apple!)).toBeGreaterThan(0);
    expect(cmp(apple!, cherry!)).toBeLessThan(0);
  });

  it('sorts nulls last in descending', () => {
    const cmp = createComparator(dateCol, 'desc');
    expect(cmp(cherry!, apple!)).toBeGreaterThan(0);
    expect(cmp(apple!, cherry!)).toBeLessThan(0);
  });

  it('uses custom comparator from config', () => {
    const cmp = createComparator(ageCol, 'asc', {
      id: ageCol,
      compare: (a, b) => {
        if (a.type === 'NUMBER' && b.type === 'NUMBER') return b.value - a.value;
        return 0;
      },
    });
    expect(cmp(apple!, banana!)).toBeGreaterThan(0);
  });
});

describe('createMultiComparator', () => {
  it('sorts by multiple columns', () => {
    const sameName = fromRows(
      [
        { name: 'Alice', age: 30 },
        { name: 'Alice', age: 20 },
        { name: 'Bob', age: 25 },
      ],
      [
        { id: nameCol, name: 'Name', type: ColumnType.TEXT, getValue: (r: { name: string; age: number }) => r.name },
        { id: ageCol, name: 'Age', type: ColumnType.NUMBER, getValue: (r: { name: string; age: number }) => r.age },
      ],
    );

    const cmp = createMultiComparator(
      [{ columnId: String(nameCol), direction: 'asc' }, { columnId: String(ageCol), direction: 'asc' }],
      [{ id: nameCol }, { id: ageCol }],
    );

    const sorted = [...sameName.rows].sort(cmp);
    expect(sorted[0]!.number(ageCol)).toBe(20);
    expect(sorted[1]!.number(ageCol)).toBe(30);
    expect(sorted[2]!.text(nameCol)).toBe('Bob');
  });
});
