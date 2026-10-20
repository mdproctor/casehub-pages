import { PLAYBOOK_ACTIONS } from '@casehubio/pages-primitives';
import type { PlaybookCapability, PlaybookMethodDescriptor } from '@casehubio/pages-primitives';

export type { PlaybookCapability, PlaybookMethodDescriptor };

export function kebabToCamel(name: string): string {
  return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function resolvePlaybookCapability(el: Element): PlaybookCapability | null {
  if (PLAYBOOK_ACTIONS in el) return (el as any)[PLAYBOOK_ACTIONS];
  const ctor = el.constructor as any;
  if (ctor && PLAYBOOK_ACTIONS in ctor) return ctor[PLAYBOOK_ACTIONS];
  return null;
}

export function mapParams(
  step: Record<string, unknown>,
  desc: PlaybookMethodDescriptor,
): unknown[] {
  if (!desc.params) return [];
  const args: unknown[] = [];
  for (const [key, spec] of Object.entries(desc.params)) {
    const value = step[key];
    const isRequired = typeof spec === 'object' ? !!spec.required : false;
    if (isRequired && value === undefined) {
      throw new Error(`Required parameter '${key}' is missing`);
    }
    args.push(value);
  }
  return args;
}

export function validateDescriptor(
  el: Element,
  warn: (msg: string) => void = console.warn,
): void {
  const cap = resolvePlaybookCapability(el);
  if (!cap) return;
  for (const [name, desc] of Object.entries(cap)) {
    const method = (el as any)[name];
    if (typeof method !== 'function') {
      warn(`[PLAYBOOK_ACTIONS] ${el.tagName}: declares '${name}' but element has no such method`);
      continue;
    }
    const paramCount = desc.params ? Object.keys(desc.params).length : 0;
    if (paramCount !== method.length) {
      warn(`[PLAYBOOK_ACTIONS] ${el.tagName}.${name}: descriptor has ${paramCount} params but method.length is ${method.length}`);
    }
  }
}
