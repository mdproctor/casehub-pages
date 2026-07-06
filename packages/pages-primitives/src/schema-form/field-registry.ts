export interface FieldRendererElement extends HTMLElement {
  value: unknown;
  schema: object;
  mode: 'display' | 'edit';
}

type FieldRendererConstructor = new () => FieldRendererElement;

const registry = new Map<string, FieldRendererConstructor>();

export function registerFieldRenderer(format: string, component: FieldRendererConstructor): void {
  registry.set(format, component);
}

export function getFieldRenderer(format: string): FieldRendererConstructor | undefined {
  return registry.get(format);
}

export function hasFieldRenderer(format: string): boolean {
  return registry.has(format);
}
