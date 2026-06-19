import type { SaveConfig } from "@casehub/ui";

export type SaveConfigRegistry = Map<string, SaveConfig>;

export function createSaveConfigRegistry(): SaveConfigRegistry {
  return new Map();
}

export function getSaveConfig(registry: SaveConfigRegistry, pagePath: string): SaveConfig | undefined {
  return registry.get(pagePath);
}
