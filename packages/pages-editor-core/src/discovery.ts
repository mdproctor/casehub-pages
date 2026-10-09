import type { EditableText } from './types.js';

export const EDITABLE_TEXT: unique symbol = Symbol.for('editable-text') as any;

export function isEditableText(
  el: Element,
): el is Element & { [EDITABLE_TEXT]: EditableText } {
  return EDITABLE_TEXT in el;
}

export function findEditableText(el: Element): EditableText | null {
  let current: Element | null = el;
  while (current) {
    if (isEditableText(current)) return current[EDITABLE_TEXT];
    const root = current.getRootNode();
    if (root instanceof ShadowRoot) {
      current = root.host;
    } else {
      current = current.parentElement;
    }
  }
  return null;
}
