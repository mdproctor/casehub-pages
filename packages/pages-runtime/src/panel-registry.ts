const registry = new Map<string, string>();

export function registerPanel(typeName: string, tagName: string): void {
  registry.set(typeName, tagName);
}

export function lookupPanel(typeName: string): string | undefined {
  return registry.get(typeName);
}

export function clearPanelRegistry(): void {
  registry.clear();
}
