import type { MatchPattern } from '../match.js';
import type { CloudEventSpec } from './types.js';

export interface CatalogEntry {
  qualifiedName: string;
  definition: import('./types').Definition;
  action: Action;
}

export interface Action {
  execute(params: Record<string, unknown>, services: ServiceRegistry): Promise<Result>;
}

export type Result =
  | { kind: 'success'; output: Record<string, unknown>; executionMetadata: Record<string, unknown> }
  | { kind: 'failure'; message: string; failureCategory?: string };

export function stepSuccess(output: Record<string, unknown>, metadata?: Record<string, unknown>): Result {
  return { kind: 'success', output, executionMetadata: metadata ?? {} };
}

export function stepFailureWithCategory(message: string, category: string): Result {
  return { kind: 'failure', message, failureCategory: category };
}

export function stepFailure(message: string): Result {
  return { kind: 'failure', message };
}

export interface ServiceRegistry {
  lookup<T>(type: { new(...args: unknown[]): T } | { readonly name: string }): T;
}

export class MapServiceRegistry implements ServiceRegistry {
  private readonly services = new Map<string, unknown>();

  register<T>(type: { readonly name: string }, instance: T): this {
    this.services.set(type.name, instance);
    return this;
  }

  lookup<T>(type: { readonly name: string }): T {
    const svc = this.services.get(type.name);
    if (svc === undefined) throw new Error(`Service '${type.name}' not found in registry`);
    return svc as T;
  }
}

export interface Catalog {
  resolve(actionName: string): CatalogEntry | undefined;
  resolveInferred?(actionName: string): CatalogEntry | undefined;
  availableActions(): Set<string>;
}

export interface SelectBranch {
  type: 'subscribe' | 'wait';
  name: string;
  steps: ResolvedStep[];
}

export interface ResolvedMatchCase {
  pattern: MatchPattern;
  guard: string | null;
  steps: ResolvedStep[];
}

export type ResolvedStep =
  | PluginStep
  | InvokeStep
  | BlockStep
  | IfElseStep
  | MatchStep
  | ParallelStep
  | TryCatchFinallyStep
  | SelectStep
  | BarrierStep
  | QuorumStep
  | DelayStep
  | RaceStep
  | EmitEventStep;

export interface PluginStep {
  kind: 'plugin';
  name: string | null;
  entry: CatalogEntry;
  params: Record<string, unknown>;
  decorators: Record<string, unknown>;
}

export interface InvokeStep {
  kind: 'invoke';
  name: string | null;
  invokeSpec: Record<string, unknown>;
  decorators: Record<string, unknown>;
}

export interface BlockStep {
  kind: 'block';
  name: string | null;
  steps: ResolvedStep[];
  decorators: Record<string, unknown>;
}

export interface IfElseStep {
  kind: 'if-else';
  name: string | null;
  condition: string;
  thenSteps: ResolvedStep[];
  elseSteps: ResolvedStep[];
  decorators: Record<string, unknown>;
}

export interface MatchStep {
  kind: 'match';
  name: string | null;
  scrutinee: string;
  cases: ResolvedMatchCase[];
  decorators: Record<string, unknown>;
}

export interface NamedBranch {
  name: string;
  steps: ResolvedStep[];
}

export interface ParallelStep {
  kind: 'parallel';
  name: string | null;
  steps: ResolvedStep[];
  branches?: NamedBranch[];
  advanceAfter?: number;
  cancelRemaining?: boolean;
  collectionTimeout?: number;
  decorators: Record<string, unknown>;
}

export interface TryCatchFinallyStep {
  kind: 'try-catch-finally';
  name: string | null;
  trySteps: ResolvedStep[];
  catchSteps: ResolvedStep[];
  finallySteps: ResolvedStep[];
  decorators: Record<string, unknown>;
}

export interface SelectStep {
  kind: 'select';
  name: string | null;
  branches: SelectBranch[];
  decorators: Record<string, unknown>;
}

export interface BarrierStep {
  kind: 'barrier';
  name: string | null;
  awaitSteps: string[];
  timeout?: number;
  decorators: Record<string, unknown>;
}

export interface QuorumStep {
  kind: 'quorum';
  name: string | null;
  required: number;
  ofSteps: string[];
  timeout?: number;
  decorators: Record<string, unknown>;
}

export interface DelayStep {
  kind: 'delay';
  name: string | null;
  duration: number;
  decorators: Record<string, unknown>;
}

export interface RaceStep {
  kind: 'race';
  name: string | null;
  steps: ResolvedStep[];
  decorators: Record<string, unknown>;
}

export interface EmitEventStep {
  kind: 'emit-event';
  name: string | null;
  events: CloudEventSpec[];
  emitTo: 'scope' | 'pages-event' | 'both';
  decorators: Record<string, unknown>;
}

const RESERVED_KEYS = new Set([
  'step', 'invoke', 'if', 'then', 'else', 'match', 'cases', 'block',
  'try', 'catch', 'finally', 'select',
  'on-success', 'on-failure', 'forEach', 'loop',
  'retry', 'timeout', 'delay', 'on-error', 'trigger',
  'transform', 'signal', 'publish', 'transition',
  'parallel', 'semaphore', 'barrier', 'quorum', 'race',
  'label', 'target', 'actor', 'when', 'speed', 'content', 'await', 'mode', 'mutex', 'wait',
  'from', 'cancel', 'background',
  'advance-after', 'cancel-remaining', 'collection-timeout',
  'emit-event', 'emit-to',
  'simulation',
]);

const DECORATOR_KEYS = new Set([
  'if', 'on-success', 'on-failure', 'forEach', 'loop',
  'retry', 'timeout', 'delay', 'on-error', 'trigger',
  'transform', 'signal', 'publish', 'transition',
  'semaphore', 'barrier', 'quorum',
  'label', 'target', 'actor', 'when', 'speed', 'content', 'await', 'mode', 'mutex', 'wait',
  'from', 'cancel', 'background',
  'simulation',
]);

const PROMOTABLE_DECORATORS = new Set(['forEach', 'retry', 'timeout', 'when', 'mutex', 'loop']);

const STRUCTURAL_COMPANIONS = new Set(['then', 'else', 'cases', 'catch', 'finally']);

const REMOVED_KEYS = new Set(['steps', 'do']);

const COMBINED_KEY_PREFIXES = new Set([
  ...PROMOTABLE_DECORATORS,
  'block', 'parallel', 'try', 'select', 'race', 'if', 'match',
]);

function matchCombinedKey(key: string): string | null {
  const spaceIdx = key.indexOf(' ');
  if (spaceIdx < 0) return null;
  const prefix = key.substring(0, spaceIdx);
  return COMBINED_KEY_PREFIXES.has(prefix) ? prefix : null;
}

const MAX_DEPTH = 32;

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Walker {
  static resolve(steps: Record<string, unknown>[], catalog: Catalog): ResolvedStep[] {
    const seenNames = new Set<string>();
    const resolved = Walker.resolveAtDepth(steps, catalog, 0, 'root', seenNames);
    Walker.validateRefs(resolved, seenNames);
    return resolved;
  }

  private static resolveAtDepth(
    steps: Record<string, unknown>[], catalog: Catalog, depth: number,
    path: string, seenNames: Set<string>,
  ): ResolvedStep[] {
    if (depth > MAX_DEPTH) throw new Error(`${path}: step nesting exceeds maximum depth of ${MAX_DEPTH}`);
    return steps.map((step, i) => Walker.resolveOne(step, catalog, depth, `${path} → Step ${i}`, seenNames));
  }

  private static resolveOne(
    step: Record<string, unknown>, catalog: Catalog, depth: number,
    stepPath: string, seenNames: Set<string>,
  ): ResolvedStep {
    let stepName: string | null = null;
    let structuralType: string | null = null;
    let structuralValue: unknown = undefined;
    let actionKey: string | null = null;
    let actionValue: unknown = undefined;
    let actionEntry: CatalogEntry | undefined = undefined;
    let invokeSpec: Record<string, unknown> | null = null;
    const decorators: Record<string, unknown> = {};
    const companions: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(step)) {
      if (REMOVED_KEYS.has(key)) {
        throw new Error(`${stepPath}: '${key}' is no longer valid — use inline sibling keys, or 'block' for multiple actions`);
      }
      if (key === 'step') {
        stepName = value as string;
        if (stepName !== null && seenNames.has(stepName)) {
          throw new Error(`${stepPath}: duplicate step name '${stepName}'`);
        }
        if (stepName !== null) seenNames.add(stepName);
      } else if (key === 'invoke') {
        invokeSpec = value as Record<string, unknown>;
      } else if (key === 'block' || key === 'parallel' || key === 'try' || key === 'select' || key === 'race') {
        structuralType = key;
        structuralValue = value;
      } else if (key === 'if' && step['then'] !== undefined) {
        structuralType = 'if';
        structuralValue = value;
      } else if (key === 'match' && step['cases'] !== undefined) {
        structuralType = 'match';
        structuralValue = value;
      } else if (STRUCTURAL_COMPANIONS.has(key)) {
        companions[key] = value;
      } else if (key === 'barrier' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
        structuralType = 'barrier';
        structuralValue = value;
      } else if (key === 'quorum' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
        structuralType = 'quorum';
        structuralValue = value;
      } else if (key === 'emit-event') {
        structuralType = 'emit-event';
        structuralValue = value;
      } else if (key === 'emit-to') {
        // consumed after the key loop when structuralType === 'emit-event'
      } else if (PROMOTABLE_DECORATORS.has(key) && (Array.isArray(value) || (typeof value === 'object' && value !== null && Object.keys(value as Record<string, unknown>).length === 1 && Array.isArray(Object.values(value as Record<string, unknown>)[0])))) {
        if (structuralType) {
          throw new Error(`${stepPath}: step has both structural type '${structuralType}' and structural decorator '${key}'`);
        }
        structuralType = key;
        structuralValue = value;
      } else if (DECORATOR_KEYS.has(key) && !(key === 'if' && step['then'] !== undefined)) {
        decorators[key] = value;
      } else if (matchCombinedKey(key) && Array.isArray(value)) {
        if (structuralType) {
          throw new Error(`${stepPath}: step has both structural type '${structuralType}' and structural decorator '${key}'`);
        }
        const spaceIdx = key.indexOf(' ');
        const prefix = key.substring(0, spaceIdx);
        const param = key.substring(spaceIdx + 1);
        if (PROMOTABLE_DECORATORS.has(prefix)) {
          structuralType = prefix;
          structuralValue = { [param]: value };
        } else {
          stepName = stepName ?? param;
          structuralType = prefix;
          structuralValue = value;
        }
      } else if (!RESERVED_KEYS.has(key)) {
        const resolved = catalog.resolve(key) ?? catalog.resolveInferred?.(key);
        if (resolved) {
          actionKey = key;
          actionValue = value;
          actionEntry = resolved;
        } else {
          throw new Error(`${stepPath}: unknown step key '${key}' — not a reserved keyword and not found in catalog`);
        }
      }
    }

    if (decorators['loop'] === 'continuous'
        && !decorators['cancel'] && !decorators['timeout']
        && !decorators['background']) {
      throw new Error(`${stepPath}: loop: continuous requires cancel:, timeout:, or background:`);
    }

    if (step['emit-to'] !== undefined && structuralType !== 'emit-event') {
      throw new Error(`${stepPath}: 'emit-to' requires 'emit-event' in the same step`);
    }

    if (structuralType && actionKey) {
      throw new Error(`${stepPath}: step has both structural type '${structuralType}' and action key '${actionKey}'`);
    }
    if (structuralType && invokeSpec) {
      throw new Error(`${stepPath}: step has both structural type '${structuralType}' and invoke`);
    }

    if (structuralType === 'emit-event') {
      const emitTo = (step['emit-to'] as string | undefined) ?? 'both';
      if (emitTo !== 'scope' && emitTo !== 'pages-event' && emitTo !== 'both') {
        throw new Error(`${stepPath}: invalid emit-to value '${emitTo}' — must be 'scope', 'pages-event', or 'both'`);
      }
      const rawEvents = Array.isArray(structuralValue)
        ? structuralValue as Record<string, unknown>[]
        : [structuralValue as Record<string, unknown>];
      const events: CloudEventSpec[] = rawEvents.map((raw, i) => {
        const evtPath = `${stepPath} → event ${i}`;
        if (!raw['type']) throw new Error(`${evtPath}: 'type' is required in emit-event`);
        if (!('data' in raw)) throw new Error(`${evtPath}: 'data' is required in emit-event`);
        const spec: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(raw)) {
          spec[k] = v;
        }
        return spec as unknown as CloudEventSpec;
      });
      return { kind: 'emit-event', name: stepName, events, emitTo: emitTo as 'scope' | 'pages-event' | 'both', decorators };
    }

    if (structuralType === 'block') {
      const substeps = Walker.resolveAtDepth(structuralValue as Record<string, unknown>[], catalog, depth + 1, `${stepPath} → block`, seenNames);
      return { kind: 'block', name: stepName, steps: substeps, decorators };
    }

    if (structuralType === 'parallel') {
      let steps: ResolvedStep[];
      let branches: NamedBranch[] | undefined;
      if (Array.isArray(structuralValue)) {
        steps = Walker.resolveAtDepth(structuralValue as Record<string, unknown>[], catalog, depth + 1, `${stepPath} → parallel`, seenNames);
      } else if (typeof structuralValue === 'object' && structuralValue !== null) {
        const namedBranches = Object.entries(structuralValue as Record<string, unknown>).map(([bName, bSteps]) => ({
          name: bName,
          steps: Walker.resolveAtDepth(bSteps as Record<string, unknown>[], catalog, depth + 1, `${stepPath} → parallel:${bName}`, seenNames),
        }));
        branches = namedBranches;
        steps = namedBranches.flatMap(b => b.steps);
      } else {
        throw new Error(`${stepPath}: parallel: must be an array or object`);
      }
      const advanceAfter = step['advance-after'] as number | undefined;
      const cancelRemaining = step['cancel-remaining'] as boolean | undefined;
      const collectionTimeoutRaw = step['collection-timeout'] as string | undefined;
      const collectionTimeout = collectionTimeoutRaw ? parseDurationMs(collectionTimeoutRaw) : undefined;
      return {
        kind: 'parallel', name: stepName, steps,
        ...(branches ? { branches } : {}),
        ...(advanceAfter !== undefined ? { advanceAfter } : {}),
        ...(cancelRemaining !== undefined ? { cancelRemaining } : {}),
        ...(collectionTimeout !== undefined ? { collectionTimeout } : {}),
        decorators,
      };
    }

    if (structuralType === 'if') {
      const thenRaw = (companions['then'] as Record<string, unknown>[] | undefined) ?? [];
      const elseRaw = (companions['else'] as Record<string, unknown>[] | undefined) ?? [];
      const thenSteps = Walker.resolveAtDepth(thenRaw, catalog, depth + 1, `${stepPath} → then`, seenNames);
      const elseSteps = Walker.resolveAtDepth(elseRaw, catalog, depth + 1, `${stepPath} → else`, seenNames);
      return { kind: 'if-else', name: stepName, condition: structuralValue as string, thenSteps, elseSteps, decorators };
    }

    if (structuralType === 'match') {
      const casesRaw = companions['cases'] as Record<string, unknown>[];
      if (!casesRaw) throw new Error(`${stepPath}: match requires cases`);
      const cases: ResolvedMatchCase[] = casesRaw.map((c, i) => {
        let pattern: MatchPattern;
        let caseSteps: ResolvedStep[];
        const isDefault = 'default' in c;
        const hasPattern = 'pattern' in c || 'when' in c;
        if (isDefault && hasPattern) {
          throw new Error(`${stepPath} → case ${i}: pattern and default are mutually exclusive`);
        }
        if (!isDefault && !hasPattern) {
          throw new Error(`${stepPath} → case ${i}: case must have 'pattern', 'when', or 'default'`);
        }
        const casePath = isDefault ? `${stepPath} → default` : `${stepPath} → case ${i}`;
        if (isDefault) {
          pattern = { type: 'default' };
          caseSteps = Walker.resolveAtDepth(
            (c['default'] as Record<string, unknown>[] | undefined) ?? [], catalog, depth + 1, casePath, seenNames);
        } else {
          pattern = Walker.parsePattern(c['pattern'] ?? c['when']);
          const rest = Walker.stripKeys(c, ['pattern', 'when', 'guard']);
          caseSteps = Object.keys(rest).length > 0
            ? [Walker.resolveOne(rest, catalog, depth + 1, casePath, seenNames)]
            : [];
        }
        const guard = (c['guard'] as string) ?? null;
        if (pattern.type === 'default' && i !== casesRaw.length - 1) {
          throw new Error(`${stepPath}: default case must be last in match`);
        }
        return { pattern, guard, steps: caseSteps };
      });
      return { kind: 'match', name: stepName, scrutinee: structuralValue as string, cases, decorators };
    }

    if (structuralType === 'try') {
      const trySteps = Walker.resolveAtDepth(structuralValue as Record<string, unknown>[], catalog, depth + 1, `${stepPath} → try`, seenNames);
      const catchRaw = (companions['catch'] as Record<string, unknown>[] | undefined) ?? [];
      const finallyRaw = (companions['finally'] as Record<string, unknown>[] | undefined) ?? [];
      const catchSteps = Walker.resolveAtDepth(catchRaw, catalog, depth + 1, `${stepPath} → catch`, seenNames);
      const finallySteps = Walker.resolveAtDepth(finallyRaw, catalog, depth + 1, `${stepPath} → finally`, seenNames);
      return { kind: 'try-catch-finally', name: stepName, trySteps, catchSteps, finallySteps, decorators };
    }

    if (structuralType === 'select') {
      const branchesRaw = structuralValue as Record<string, unknown>[];
      const branches: SelectBranch[] = branchesRaw.map((b, i) => {
        const branchPath = `${stepPath} → select branch ${i}`;
        if (b['subscribe']) {
          const sub = b['subscribe'] as Record<string, unknown> | string;
          const channelName = typeof sub === 'string' ? sub : (sub['channel'] as string);
          const rest = Walker.stripKeys(b, ['subscribe']);
          const branchStep = Object.keys(rest).length > 0
            ? [Walker.resolveOne(rest, catalog, depth + 1, branchPath, seenNames)]
            : [];
          return { type: 'subscribe' as const, name: channelName, steps: branchStep };
        }
        if (b['wait']) {
          const rest = Walker.stripKeys(b, ['wait']);
          const branchStep = Object.keys(rest).length > 0
            ? [Walker.resolveOne(rest, catalog, depth + 1, branchPath, seenNames)]
            : [];
          return { type: 'wait' as const, name: b['wait'] as string, steps: branchStep };
        }
        throw new Error(`${branchPath}: select branch must have subscribe or wait`);
      });
      return { kind: 'select', name: stepName, branches, decorators };
    }

    if (structuralType === 'race') {
      const substeps = Walker.resolveAtDepth(structuralValue as Record<string, unknown>[], catalog, depth + 1, `${stepPath} → race`, seenNames);
      return { kind: 'race', name: stepName, steps: substeps, decorators };
    }

    if (structuralType === 'barrier') {
      const barrierVal = structuralValue as Record<string, unknown>;
      const awaitSteps = barrierVal['await'] as string[];
      const timeoutRaw = barrierVal['timeout'] as string | undefined;
      const timeout = timeoutRaw ? parseDurationMs(timeoutRaw) : undefined;
      return { kind: 'barrier', name: stepName, awaitSteps, ...(timeout !== undefined ? { timeout } : {}), decorators };
    }

    if (structuralType === 'quorum') {
      const quorumVal = structuralValue as Record<string, unknown>;
      const required = quorumVal['required'] as number;
      const ofSteps = quorumVal['of'] as string[];
      const timeoutRaw = quorumVal['timeout'] as string | undefined;
      const timeout = timeoutRaw ? parseDurationMs(timeoutRaw) : undefined;
      return { kind: 'quorum', name: stepName, required, ofSteps, ...(timeout !== undefined ? { timeout } : {}), decorators };
    }

    if (structuralType && PROMOTABLE_DECORATORS.has(structuralType)) {
      let substeps: ResolvedStep[];
      if (Array.isArray(structuralValue)) {
        substeps = Walker.resolveAtDepth(structuralValue as Record<string, unknown>[], catalog, depth + 1, `${stepPath} → ${structuralType}`, seenNames);
        decorators[structuralType] = true;
      } else {
        const entries = Object.entries(structuralValue as Record<string, unknown>);
        if (entries.length !== 1) {
          throw new Error(`${stepPath}: structural '${structuralType}' must have exactly one key (the parameter), got ${entries.length}`);
        }
        const [param, stepsRaw] = entries[0]!;
        if (!Array.isArray(stepsRaw)) {
          throw new Error(`${stepPath}: structural '${structuralType}' parameter '${param}' must map to a steps array`);
        }
        substeps = Walker.resolveAtDepth(stepsRaw as Record<string, unknown>[], catalog, depth + 1, `${stepPath} → ${structuralType}`, seenNames);
        decorators[structuralType] = param;
      }
      return { kind: 'block', name: stepName, steps: substeps, decorators };
    }

    if (!structuralType && !actionKey && !invokeSpec && decorators['delay'] !== undefined) {
      const duration = parseDurationMs(decorators['delay'] as string);
      const { delay: _, ...rest } = decorators;
      return { kind: 'delay', name: stepName, duration, decorators: rest };
    }

    if (invokeSpec) {
      return { kind: 'invoke', name: stepName, invokeSpec, decorators };
    }

    if (actionKey) {
      const entry = actionEntry ?? catalog.resolve(actionKey)!;
      const params = (typeof actionValue === 'object' && actionValue !== null && !Array.isArray(actionValue))
        ? actionValue as Record<string, unknown>
        : { value: actionValue };
      return { kind: 'plugin', name: stepName, entry, params, decorators };
    }

    throw new Error(`${stepPath}: no step type identified. Keys: ${Object.keys(step).join(', ')}`);
  }

  private static validateRefs(steps: ResolvedStep[], knownNames: Set<string>): void {
    for (const step of steps) {
      if (step.kind === 'barrier') {
        for (const ref of step.awaitSteps) {
          if (!knownNames.has(ref)) {
            throw new Error(`barrier '${step.name ?? '(unnamed)'}' awaits unknown step '${ref}'`);
          }
        }
      } else if (step.kind === 'quorum') {
        for (const ref of step.ofSteps) {
          if (!knownNames.has(ref)) {
            throw new Error(`quorum '${step.name ?? '(unnamed)'}' references unknown step '${ref}'`);
          }
        }
      }
      if ('steps' in step && Array.isArray(step.steps)) {
        Walker.validateRefs(step.steps, knownNames);
      }
      if (step.kind === 'if-else') {
        Walker.validateRefs(step.thenSteps, knownNames);
        Walker.validateRefs(step.elseSteps, knownNames);
      }
      if (step.kind === 'try-catch-finally') {
        Walker.validateRefs(step.trySteps, knownNames);
        Walker.validateRefs(step.catchSteps, knownNames);
        Walker.validateRefs(step.finallySteps, knownNames);
      }
      if (step.kind === 'match') {
        for (const c of step.cases) Walker.validateRefs(c.steps, knownNames);
      }
      if (step.kind === 'select') {
        for (const b of step.branches) Walker.validateRefs(b.steps, knownNames);
      }
    }
  }

  private static stripKeys(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const exclude = new Set(keys);
    for (const [k, v] of Object.entries(obj)) {
      if (!exclude.has(k)) result[k] = v;
    }
    return result;
  }

  private static parsePattern(raw: unknown): MatchPattern {
    if (raw === undefined || raw === null) {
      return { type: 'default' };
    }
    if (Array.isArray(raw)) {
      return { type: 'any-of', values: [...raw] };
    }
    if (typeof raw === 'object') {
      return { type: 'structural', fields: { ...raw as Record<string, unknown> } };
    }
    return { type: 'value', value: raw };
  }
}

function parseDurationMs(duration: string): number {
  const match = duration.match(/^(\d+)(ms|s|m|h)$/);
  if (!match) return parseInt(duration, 10);
  const [, numStr, unit] = match;
  const num = parseInt(numStr!, 10);
  switch (unit) {
    case 'ms': return num;
    case 's': return num * 1000;
    case 'm': return num * 60_000;
    case 'h': return num * 3_600_000;
    default: return num;
  }
}
