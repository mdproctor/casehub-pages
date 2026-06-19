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
