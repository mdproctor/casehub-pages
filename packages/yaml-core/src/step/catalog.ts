import type { Catalog, CatalogEntry } from './walker.js';

export interface CatalogSource {
  populate(entries: Map<string, CatalogEntry>): void;
  readonly priority: number;
}

export class CompositeCatalog implements Catalog {
  private readonly entries = new Map<string, CatalogEntry>();

  constructor(sources: CatalogSource[]) {
    const sorted = [...sources].sort((a, b) => a.priority - b.priority);
    for (const source of sorted) {
      const sourceEntries = new Map<string, CatalogEntry>();
      source.populate(sourceEntries);
      for (const [name, entry] of sourceEntries) {
        if (!this.entries.has(name)) {
          this.entries.set(name, entry);
        }
      }
    }
  }

  resolve(actionName: string): CatalogEntry | undefined {
    return this.entries.get(actionName);
  }

  availableActions(): Set<string> {
    return new Set(this.entries.keys());
  }
}

export class ImportScopedCatalog implements Catalog {
  constructor(
    private readonly importedEntries: Map<string, CatalogEntry>,
    private readonly delegate: Catalog,
  ) {}

  resolve(actionName: string): CatalogEntry | undefined {
    return this.importedEntries.get(actionName) ?? this.delegate.resolve(actionName);
  }

  resolveInferred(actionName: string): CatalogEntry | undefined {
    return this.delegate.resolveInferred?.(actionName);
  }

  availableActions(): Set<string> {
    const all = new Set(this.delegate.availableActions());
    for (const name of this.importedEntries.keys()) all.add(name);
    return all;
  }
}
