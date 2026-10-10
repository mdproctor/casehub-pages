import { findAllByRole, getAriaState } from '../walker/index.js';
import type { AriaTarget, AriaState } from '@casehubio/pages-primitives';
import { findEditableText } from './editable-text.js';
import type { Position } from './editable-text.js';
import { progressiveInsert } from '@casehubio/pages-editor-core';
import { showSpotlight } from './spotlight.js';
import type { SpotlightConfig } from './spotlight.js';

export function resolveTarget(target: AriaTarget): Element {
  let scope: Element | undefined;

  if (target.within) {
    scope = resolveTarget(target.within);
  }

  const all = findAllByRole(target.role, target.name, scope);

  if (target.index != null) {
    const idx = typeof target.index === 'string' ? parseInt(target.index, 10) : target.index;
    if (idx < 0 || idx >= all.length) {
      const scopeDesc = target.within ? ` within ${target.within.role}` : '';
      throw new Error(`No element found: ${target.role} index ${idx}${scopeDesc} (found ${all.length})`);
    }
    return all[idx]!;
  }

  if (all.length === 0) {
    const scopeDesc = target.within ? ` within ${target.within.role} "${target.within.name ?? ''}"` : '';
    throw new Error(`No element found: ${target.role} "${target.name ?? ''}"${scopeDesc}`);
  }

  return all[0]!;
}

export function click(target: AriaTarget): void {
  const el = resolveTarget(target);
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

export function fill(target: AriaTarget, value: string): void {
  const el = resolveTarget(target) as HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export function select(target: AriaTarget, option: string): void {
  const el = resolveTarget(target) as HTMLSelectElement;
  el.value = option;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export function expand(target: AriaTarget): void {
  const el = resolveTarget(target);
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

export function collapse(target: AriaTarget): void {
  const el = resolveTarget(target);
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

export function assertState(target: AriaTarget, expected: Partial<AriaState>): void {
  const el = resolveTarget(target);
  const actual = getAriaState(el);

  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actual[key as keyof AriaState];
    if (actualValue !== expectedValue) {
      throw new Error(
        `State mismatch for ${target.role} "${target.name}": ${key} expected ${String(expectedValue)}, got ${String(actualValue)}`
      );
    }
  }
}

export async function executeStep(
  step: { delivery?: string; action?: string; target?: AriaTarget; [key: string]: unknown },
  _eventTarget?: EventTarget,
  _speed = 1.0,
): Promise<void> {
  if (step.delivery && step.delivery !== 'aria') return;
  if (!step.action) return;

  switch (step.action) {
    case 'click': { click(step.target!); return; }
    case 'fill': { fill(step.target!, step['value'] as string); return; }
    case 'select': { select(step.target!, step['value'] as string); return; }
    case 'expand': { expand(step.target!); return; }
    case 'collapse': { collapse(step.target!); return; }
    case 'assert': { assertState(step.target!, step['state'] as Partial<AriaState>); return; }
    case 'wait': return waitFor(step.target!, step['state'] as Partial<AriaState>, (step['timeout'] as number) ?? 5000);
    case 'navigate': window.location.href = step['value'] as string; return;
    case 'spotlight': return spotlightStep(step, _speed);
    case 'scroll-to-row': return scrollToRowStep(step);
    case 'show-markdown': { showMarkdownStep(step, _eventTarget); return; }
    case 'editor-insert': return editorInsert(step.target!, step['value'] as string, step['typing'] as string ?? 'progressive', _speed, step['line'] as number, step['col'] as number);
    case 'editor-set-content': return editorSetContent(step.target!, step['value'] as string, step['typing'] as string ?? 'progressive', _speed);
    case 'editor-replace': return editorReplace(step.target!, step['from'] as Position, step['to'] as Position, step['value'] as string, step['typing'] as string ?? 'progressive', _speed);
    case 'editor-delete': { editorDelete(step.target!, step['from'] as Position, step['to'] as Position); return; }
    case 'editor-cursor': { editorCursor(step.target!, step['line'] as number, step['col'] as number); return; }
    case 'editor-highlight': { editorHighlight(step.target!, step['from'] as Position, step['to'] as Position, step['style'] as string); return; }
    case 'editor-completion': return editorCompletion(step.target!, step['label'] as string);
    default: return invokeMethod(step);
  }
}

function extractArgs(step: Record<string, unknown>): unknown[] {
  const skip = new Set(['action', 'delivery', 'target', 'role', 'name', 'index', 'within']);
  const args: unknown[] = [];
  for (const [k, v] of Object.entries(step)) {
    if (!skip.has(k) && v !== undefined) args.push(v);
  }
  return args;
}

async function invokeMethod(step: { action?: string; target?: AriaTarget; [key: string]: unknown }): Promise<void> {
  if (!step.target) throw new Error(`Method invocation '${step.action}' requires a target`);
  const el = resolveTarget(step.target);
  const method = (el as any)[step.action!];
  if (typeof method !== 'function') {
    throw new Error(`Target ${step.target.role} "${step.target.name}" has no method '${step.action}'`);
  }
  const result = method.call(el, ...extractArgs(step));
  if (result instanceof Promise) await result;
}

function resolveEditor(target: AriaTarget) {
  const el = resolveTarget(target);
  const editor = findEditableText(el);
  if (!editor) throw new Error(`Target ${target.role} "${target.name}" is not an editable text element`);
  return editor;
}

async function editorInsert(target: AriaTarget, value: string, typing: string, speed: number, line?: number, col?: number): Promise<void> {
  const editor = resolveEditor(target);
  if (line !== undefined && col !== undefined) {
    editor.setCursor(line, col);
  }
  if (typing === 'instant') {
    editor.insertText(value);
  } else {
    await progressiveInsert(editor, value, { speed });
  }
}

async function editorSetContent(target: AriaTarget, value: string, typing: string, speed: number): Promise<void> {
  const editor = resolveEditor(target);
  if (typing === 'instant') {
    editor.setContent(value);
  } else {
    editor.setContent('');
    await progressiveInsert(editor, value, { speed });
  }
}

async function editorReplace(target: AriaTarget, from: Position, to: Position, value: string, typing: string, speed: number): Promise<void> {
  const editor = resolveEditor(target);
  editor.deleteRange(from, to);
  if (typing === 'instant') {
    editor.insertText(value);
  } else {
    await progressiveInsert(editor, value, { speed });
  }
}

function editorDelete(target: AriaTarget, from: Position, to: Position): void {
  resolveEditor(target).deleteRange(from, to);
}

function editorCursor(target: AriaTarget, line: number, col: number): void {
  resolveEditor(target).setCursor(line, col);
}

function editorHighlight(target: AriaTarget, from: Position, to: Position, style?: string): void {
  resolveEditor(target).highlight(from, to, style as 'pulse' | 'underline' | 'glow');
}

async function editorCompletion(target: AriaTarget, label?: string): Promise<void> {
  const editor = resolveEditor(target);
  if (!editor.triggerCompletion) return;
  editor.triggerCompletion();
  if (label && editor.selectCompletion) {
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      if (editor.selectCompletion(label)) return;
      await new Promise(r => setTimeout(r, 50));
    }
  }
}

async function spotlightStep(step: Record<string, unknown>, speed: number): Promise<void> {
  const target = step.target as AriaTarget | undefined;
  if (!target) return;
  const content = step['content'] as string ?? '';
  const wordCount = content.split(/\s+/).length;
  const duration = step['duration'] as number ?? Math.max(2000, wordCount * 250 / speed);
  const config: SpotlightConfig = {
    target,
    content,
    position: step['position'] as any,
    duration,
    also: step['also'] as any,
  };
  await showSpotlight(config);
}

async function scrollToRowStep(step: Record<string, unknown>): Promise<void> {
  const target = step.target as AriaTarget | undefined;
  if (!target) throw new Error('scroll-to-row requires a target');

  const el = resolveTarget(target) as any;
  if (typeof el.scrollToRow !== 'function') {
    throw new Error(`Target ${target.role} "${target.name}" does not support scrollToRow`);
  }

  let predicate: (row: any) => boolean;
  const key = step['key'] as string | undefined;
  const column = step['column'] as string | undefined;
  const value = step['value'] as string | undefined;
  const idx = step['index'] as number | undefined;

  /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
  if (key != null) {
    predicate = (row: any) => {
      if (typeof el.getRowKey === 'function') return el.getRowKey(row) === key;
      return false;
    };
  } else if (column != null && value != null) {
    predicate = (row: any) => {
      const cell = row.cell(column);
      return cell && cell.type !== 'NULL' && String(cell.value) === value;
    };
  } else if (idx != null) {
    let current = 0;
    predicate = () => current++ === idx;
  } else {
    throw new Error('scroll-to-row requires key, column+value, or index');
  }

  const found = await el.scrollToRow(predicate);
  /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
  if (!found) {
    throw new Error(`No matching row found in ${target.role} "${target.name}"`);
  }
}

function showMarkdownStep(step: Record<string, unknown>, eventTarget?: EventTarget): void {
  if (!eventTarget) return;
  eventTarget.dispatchEvent(new CustomEvent('scenario-narrative', {
    detail: { markdown: step['value'] ?? (step['state'] as any)?.content },
  }));
}

export async function waitFor(
  target: AriaTarget,
  expected: Partial<AriaState>,
  timeout: number,
): Promise<void> {
  const deadline = Date.now() + timeout;
  const interval = 100;

  while (Date.now() < deadline) {
    try {
      assertState(target, expected);
      return;
    } catch {
      await new Promise(r => setTimeout(r, interval));
    }
  }

  assertState(target, expected);
}
