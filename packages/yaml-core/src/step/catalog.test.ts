import { describe, it, expect } from 'vitest';
import { CompositeCatalog, ImportScopedCatalog } from './catalog.js';
import type { CatalogSource } from './catalog.js';
import type { CatalogEntry, Action } from './walker.js';

const noop: Action = { execute: async () => ({ kind: 'success', output: {}, executionMetadata: {} }) };

function entry(name: string): CatalogEntry {
  return { qualifiedName: name, definition: { name, inputs: {}, outputs: {} }, action: noop };
}

function source(priority: number, entries: Record<string, CatalogEntry>): CatalogSource {
  return {
    priority,
    populate(map) {
      for (const [k, v] of Object.entries(entries)) map.set(k, v);
    },
  };
}

describe('CompositeCatalog', () => {
  it('resolves action from single source', () => {
    const catalog = new CompositeCatalog([source(100, { greet: entry('greet') })]);
    expect(catalog.resolve('greet')?.qualifiedName).toBe('greet');
  });

  it('higher priority source wins when names conflict', () => {
    const high = source(10, { action: entry('high') });
    const low = source(200, { action: entry('low') });
    const catalog = new CompositeCatalog([low, high]);
    expect(catalog.resolve('action')?.qualifiedName).toBe('high');
  });

  it('availableActions returns union of all sources', () => {
    const catalog = new CompositeCatalog([
      source(10, { a: entry('a') }),
      source(20, { b: entry('b') }),
    ]);
    expect(catalog.availableActions()).toEqual(new Set(['a', 'b']));
  });

  it('returns undefined for unregistered action', () => {
    const catalog = new CompositeCatalog([source(10, { a: entry('a') })]);
    expect(catalog.resolve('missing')).toBeUndefined();
  });
});

describe('ImportScopedCatalog', () => {
  const delegateEntry = entry('base');
  const importedEntry = entry('imported');
  const delegate = new CompositeCatalog([source(10, { shared: delegateEntry, base: delegateEntry })]);

  it('imported entry overrides delegate', () => {
    const imported = new Map([['shared', importedEntry]]);
    const catalog = new ImportScopedCatalog(imported, delegate);
    expect(catalog.resolve('shared')?.qualifiedName).toBe('imported');
  });

  it('falls back to delegate when not in imports', () => {
    const catalog = new ImportScopedCatalog(new Map(), delegate);
    expect(catalog.resolve('base')?.qualifiedName).toBe('base');
  });

  it('availableActions includes both imported and delegated', () => {
    const imported = new Map([['extra', importedEntry]]);
    const catalog = new ImportScopedCatalog(imported, delegate);
    expect(catalog.availableActions()).toEqual(new Set(['shared', 'base', 'extra']));
  });

  it('delegates resolveInferred to wrapped catalog', () => {
    const inferredEntry = entry('load-content');
    const inner = {
      resolve: () => undefined,
      availableActions: () => new Set<string>(),
      resolveInferred: (name: string) =>
        name === 'load-content' ? inferredEntry : undefined,
    };
    const catalog = new ImportScopedCatalog(new Map(), inner);
    expect(catalog.resolveInferred?.('load-content')?.qualifiedName).toBe('load-content');
    expect(catalog.resolveInferred?.('unknown')).toBeUndefined();
  });
});
