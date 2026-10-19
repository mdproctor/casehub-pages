import type { ResolvedStep, PluginStep, InvokeStep, BlockStep, IfElseStep,
  MatchStep, ParallelStep, TryCatchFinallyStep, SelectStep,
  BarrierStep, QuorumStep, DelayStep, RaceStep, NamedBranch, SelectBranch } from './walker.js';

export type DiffState = 'added' | 'removed' | 'modified' | 'unchanged';
export type DiffStatState = Exclude<DiffState, 'unchanged'>;

export interface FieldChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface DiffNode {
  state: DiffState;
  step: ResolvedStep;
  oldStep?: ResolvedStep;
  fieldChanges: FieldChange[];
  children?: DiffNode[];
  scopes?: Record<string, DiffNode[]>;
}

export interface DiffStat {
  state: DiffStatState;
  count: number;
  label: string;
}

export interface DiffResult {
  root: DiffNode[];
  summary: DiffStat[];
}

interface MatchPair {
  oldStep: ResolvedStep;
  newStep: ResolvedStep;
  oldIndex: number;
  newIndex: number;
}

function diffScope(oldSteps: ResolvedStep[], newSteps: ResolvedStep[]): DiffNode[] {
  const oldMatched = new Set<number>();
  const newMatched = new Set<number>();
  const pairs: MatchPair[] = [];

  // Pass 1: match named steps by name
  const oldByName = new Map<string, { step: ResolvedStep; index: number }>();
  for (let i = 0; i < oldSteps.length; i++) {
    const name = oldSteps[i].name;
    if (name !== null) oldByName.set(name, { step: oldSteps[i], index: i });
  }
  for (let i = 0; i < newSteps.length; i++) {
    const name = newSteps[i].name;
    if (name !== null && oldByName.has(name)) {
      const old = oldByName.get(name)!;
      pairs.push({ oldStep: old.step, newStep: newSteps[i], oldIndex: old.index, newIndex: i });
      oldMatched.add(old.index);
      newMatched.add(i);
      oldByName.delete(name);
    }
  }

  // Pass 2: match remaining unnamed by position in unmatched slots
  const unmatchedOld: { step: ResolvedStep; index: number }[] = [];
  const unmatchedNew: { step: ResolvedStep; index: number }[] = [];
  for (let i = 0; i < oldSteps.length; i++) {
    if (!oldMatched.has(i)) unmatchedOld.push({ step: oldSteps[i], index: i });
  }
  for (let i = 0; i < newSteps.length; i++) {
    if (!newMatched.has(i)) unmatchedNew.push({ step: newSteps[i], index: i });
  }
  const positionPairs = Math.min(unmatchedOld.length, unmatchedNew.length);
  for (let i = 0; i < positionPairs; i++) {
    pairs.push({
      oldStep: unmatchedOld[i].step, newStep: unmatchedNew[i].step,
      oldIndex: unmatchedOld[i].index, newIndex: unmatchedNew[i].index,
    });
    oldMatched.add(unmatchedOld[i].index);
    newMatched.add(unmatchedNew[i].index);
  }

  // Build merged sequence in new-tree order with removed interleaved
  const result: DiffNode[] = [];
  const removedByOldIndex = new Map<number, DiffNode>();

  // Unmatched old → removed
  for (let i = 0; i < oldSteps.length; i++) {
    if (!oldMatched.has(i)) {
      removedByOldIndex.set(i, {
        state: 'removed', step: oldSteps[i], fieldChanges: [],
      });
    }
  }

  // Process pairs → unchanged/modified/remove+add
  const pairByNewIndex = new Map<number, DiffNode[]>();
  for (const pair of pairs) {
    const nodes = diffPair(pair.oldStep, pair.newStep);
    pairByNewIndex.set(pair.newIndex, nodes);
  }

  // Unmatched new → added
  for (let i = positionPairs; i < unmatchedNew.length; i++) {
    pairByNewIndex.set(unmatchedNew[i].index, [{
      state: 'added', step: unmatchedNew[i].step, fieldChanges: [],
    }]);
  }

  // Build merged: new-tree order, removed nodes interleaved
  // For each removed old node, find where it should be inserted
  const oldIndexToInsertAfterNewIndex = new Map<number, number>();
  for (const [oldIdx] of removedByOldIndex) {
    let insertAfter = -1;
    for (const pair of pairs) {
      if (pair.oldIndex < oldIdx && pair.newIndex > insertAfter) {
        insertAfter = pair.newIndex;
      }
    }
    oldIndexToInsertAfterNewIndex.set(oldIdx, insertAfter);
  }

  // Group removed by insert-after position
  const removedAfter = new Map<number, DiffNode[]>();
  for (const [oldIdx, node] of removedByOldIndex) {
    const after = oldIndexToInsertAfterNewIndex.get(oldIdx)!;
    if (!removedAfter.has(after)) removedAfter.set(after, []);
    removedAfter.get(after)!.push(node);
  }

  // Emit removed at beginning (insertAfter = -1)
  if (removedAfter.has(-1)) result.push(...removedAfter.get(-1)!);

  // Emit new-tree nodes with removed interleaved
  for (let i = 0; i < newSteps.length; i++) {
    const nodes = pairByNewIndex.get(i);
    if (nodes) result.push(...nodes);
    if (removedAfter.has(i)) result.push(...removedAfter.get(i)!);
  }

  return result;
}

function diffPair(oldStep: ResolvedStep, newStep: ResolvedStep): DiffNode[] {
  if (oldStep.kind !== newStep.kind) {
    return [
      { state: 'removed', step: oldStep, fieldChanges: [] },
      { state: 'added', step: newStep, fieldChanges: [] },
    ];
  }

  const fieldChanges = computeFieldChanges(oldStep, newStep);
  const childResult = diffChildren(oldStep, newStep);

  const hasFieldChanges = fieldChanges.length > 0;
  const hasChildChanges = childResult.changed;

  if (!hasFieldChanges && !hasChildChanges) {
    return [{ state: 'unchanged', step: newStep, fieldChanges: [] }];
  }

  const node: DiffNode = {
    state: 'modified', step: newStep, oldStep: oldStep, fieldChanges,
  };
  if (childResult.children) node.children = childResult.children;
  if (childResult.scopes) node.scopes = childResult.scopes;
  return [node];
}

function computeFieldChanges(oldStep: ResolvedStep, newStep: ResolvedStep): FieldChange[] {
  const changes: FieldChange[] = [];

  // Name
  if (oldStep.name !== newStep.name) {
    changes.push({ field: 'name', oldValue: oldStep.name, newValue: newStep.name });
  }

  // entry.qualifiedName (PluginStep)
  if (oldStep.kind === 'plugin' && newStep.kind === 'plugin') {
    if (oldStep.entry.qualifiedName !== newStep.entry.qualifiedName) {
      changes.push({ field: 'entry.qualifiedName', oldValue: oldStep.entry.qualifiedName, newValue: newStep.entry.qualifiedName });
    }
    // params
    const allParamKeys = new Set([...Object.keys(oldStep.params), ...Object.keys(newStep.params)]);
    for (const key of allParamKeys) {
      const ov = oldStep.params[key];
      const nv = newStep.params[key];
      if (ov !== nv) changes.push({ field: `params.${key}`, oldValue: ov, newValue: nv });
    }
  }

  // invokeSpec shallow (InvokeStep)
  if (oldStep.kind === 'invoke' && newStep.kind === 'invoke') {
    const allKeys = new Set([...Object.keys(oldStep.invokeSpec), ...Object.keys(newStep.invokeSpec)]);
    for (const key of allKeys) {
      const ov = oldStep.invokeSpec[key];
      const nv = newStep.invokeSpec[key];
      if (ov !== nv) changes.push({ field: `invokeSpec.${key}`, oldValue: ov, newValue: nv });
    }
  }

  // Container structural fields
  if (oldStep.kind === 'if-else' && newStep.kind === 'if-else') {
    if (oldStep.condition !== newStep.condition) changes.push({ field: 'condition', oldValue: oldStep.condition, newValue: newStep.condition });
  }
  if (oldStep.kind === 'match' && newStep.kind === 'match') {
    if (oldStep.scrutinee !== newStep.scrutinee) changes.push({ field: 'scrutinee', oldValue: oldStep.scrutinee, newValue: newStep.scrutinee });
  }
  if (oldStep.kind === 'parallel' && newStep.kind === 'parallel') {
    if (oldStep.advanceAfter !== newStep.advanceAfter) changes.push({ field: 'advanceAfter', oldValue: oldStep.advanceAfter, newValue: newStep.advanceAfter });
    if (oldStep.cancelRemaining !== newStep.cancelRemaining) changes.push({ field: 'cancelRemaining', oldValue: oldStep.cancelRemaining, newValue: newStep.cancelRemaining });
    if (oldStep.collectionTimeout !== newStep.collectionTimeout) changes.push({ field: 'collectionTimeout', oldValue: oldStep.collectionTimeout, newValue: newStep.collectionTimeout });
  }
  if (oldStep.kind === 'delay' && newStep.kind === 'delay') {
    if (oldStep.duration !== newStep.duration) changes.push({ field: 'duration', oldValue: oldStep.duration, newValue: newStep.duration });
  }
  if ((oldStep.kind === 'barrier' || oldStep.kind === 'quorum') && oldStep.kind === newStep.kind) {
    const os = oldStep as BarrierStep | QuorumStep;
    const ns = newStep as BarrierStep | QuorumStep;
    if (os.timeout !== ns.timeout) changes.push({ field: 'timeout', oldValue: os.timeout, newValue: ns.timeout });
  }
  if (oldStep.kind === 'barrier' && newStep.kind === 'barrier') {
    if (oldStep.awaitSteps.length !== newStep.awaitSteps.length) {
      changes.push({ field: 'awaitSteps.length', oldValue: oldStep.awaitSteps.length, newValue: newStep.awaitSteps.length });
    }
  }
  if (oldStep.kind === 'quorum' && newStep.kind === 'quorum') {
    if (oldStep.required !== newStep.required) changes.push({ field: 'required', oldValue: oldStep.required, newValue: newStep.required });
    if (oldStep.ofSteps.length !== newStep.ofSteps.length) {
      changes.push({ field: 'ofSteps.length', oldValue: oldStep.ofSteps.length, newValue: newStep.ofSteps.length });
    }
  }

  // Decorators
  const allDecKeys = new Set([...Object.keys(oldStep.decorators), ...Object.keys(newStep.decorators)]);
  for (const key of allDecKeys) {
    const ov = oldStep.decorators[key];
    const nv = newStep.decorators[key];
    if (ov !== nv) changes.push({ field: `decorators.${key}`, oldValue: ov, newValue: nv });
  }

  // Derived array-length for containers with child step arrays
  if (oldStep.kind === 'block' && newStep.kind === 'block') {
    if (oldStep.steps.length !== newStep.steps.length) changes.push({ field: 'steps.length', oldValue: oldStep.steps.length, newValue: newStep.steps.length });
  }
  if (oldStep.kind === 'race' && newStep.kind === 'race') {
    if (oldStep.steps.length !== newStep.steps.length) changes.push({ field: 'steps.length', oldValue: oldStep.steps.length, newValue: newStep.steps.length });
  }

  return changes;
}

interface ChildDiffResult {
  changed: boolean;
  children?: DiffNode[];
  scopes?: Record<string, DiffNode[]>;
}

function diffChildren(oldStep: ResolvedStep, newStep: ResolvedStep): ChildDiffResult {
  if (oldStep.kind !== newStep.kind) return { changed: false };

  switch (oldStep.kind) {
    case 'block': {
      const ns = newStep as BlockStep;
      const children = diffScope(oldStep.steps, ns.steps);
      return { changed: hasChanges(children), children };
    }
    case 'race': {
      const ns = newStep as RaceStep;
      const children = diffScope(oldStep.steps, ns.steps);
      return { changed: hasChanges(children), children };
    }
    case 'parallel': {
      const ns = newStep as ParallelStep;
      if (oldStep.branches && ns.branches) {
        const scopes = diffNamedBranches(oldStep.branches, ns.branches);
        return { changed: scopesChanged(scopes), scopes };
      }
      const children = diffScope(oldStep.steps, ns.steps);
      return { changed: hasChanges(children), children };
    }
    case 'if-else': {
      const ns = newStep as IfElseStep;
      const scopes: Record<string, DiffNode[]> = {
        then: diffScope(oldStep.thenSteps, ns.thenSteps),
        else: diffScope(oldStep.elseSteps, ns.elseSteps),
      };
      return { changed: scopesChanged(scopes), scopes };
    }
    case 'try-catch-finally': {
      const ns = newStep as TryCatchFinallyStep;
      const scopes: Record<string, DiffNode[]> = {
        try: diffScope(oldStep.trySteps, ns.trySteps),
        catch: diffScope(oldStep.catchSteps, ns.catchSteps),
        finally: diffScope(oldStep.finallySteps, ns.finallySteps),
      };
      return { changed: scopesChanged(scopes), scopes };
    }
    case 'match': {
      const ns = newStep as MatchStep;
      const scopes: Record<string, DiffNode[]> = {};
      const maxCases = Math.max(oldStep.cases.length, ns.cases.length);
      for (let i = 0; i < maxCases; i++) {
        const oldCase = oldStep.cases[i];
        const newCase = ns.cases[i];
        if (oldCase && newCase) {
          scopes[`case-${i}`] = diffScope(oldCase.steps, newCase.steps);
        } else if (newCase) {
          scopes[`case-${i}`] = newCase.steps.map(s => ({ state: 'added' as const, step: s, fieldChanges: [] }));
        } else if (oldCase) {
          scopes[`case-${i}`] = oldCase.steps.map(s => ({ state: 'removed' as const, step: s, fieldChanges: [] }));
        }
      }
      return { changed: scopesChanged(scopes), scopes };
    }
    case 'select': {
      const ns = newStep as SelectStep;
      const scopes = diffSelectBranches(oldStep.branches, ns.branches);
      return { changed: scopesChanged(scopes), scopes };
    }
    default:
      return { changed: false };
  }
}

function diffNamedBranches(oldBranches: NamedBranch[], newBranches: NamedBranch[]): Record<string, DiffNode[]> {
  const scopes: Record<string, DiffNode[]> = {};
  const oldByName = new Map(oldBranches.map(b => [b.name, b]));
  const matched = new Set<string>();

  for (const nb of newBranches) {
    const ob = oldByName.get(nb.name);
    if (ob) {
      scopes[nb.name] = diffScope(ob.steps, nb.steps);
      matched.add(nb.name);
    } else {
      scopes[nb.name] = nb.steps.map(s => ({ state: 'added' as const, step: s, fieldChanges: [] }));
    }
  }
  for (const ob of oldBranches) {
    if (!matched.has(ob.name)) {
      scopes[ob.name] = ob.steps.map(s => ({ state: 'removed' as const, step: s, fieldChanges: [] }));
    }
  }
  return scopes;
}

function diffSelectBranches(oldBranches: SelectBranch[], newBranches: SelectBranch[]): Record<string, DiffNode[]> {
  const scopes: Record<string, DiffNode[]> = {};
  const oldByName = new Map(oldBranches.map(b => [b.name, b]));
  const matched = new Set<string>();

  for (const nb of newBranches) {
    const ob = oldByName.get(nb.name);
    if (ob) {
      scopes[nb.name] = diffScope(ob.steps, nb.steps);
      matched.add(nb.name);
    } else {
      scopes[nb.name] = nb.steps.map(s => ({ state: 'added' as const, step: s, fieldChanges: [] }));
    }
  }
  for (const ob of oldBranches) {
    if (!matched.has(ob.name)) {
      scopes[ob.name] = ob.steps.map(s => ({ state: 'removed' as const, step: s, fieldChanges: [] }));
    }
  }
  return scopes;
}

function hasChanges(nodes: DiffNode[]): boolean {
  return nodes.some(n => n.state !== 'unchanged');
}

function scopesChanged(scopes: Record<string, DiffNode[]>): boolean {
  return Object.values(scopes).some(nodes => hasChanges(nodes));
}

function buildSummary(root: DiffNode[], context = 'step'): DiffStat[] {
  const counts = new Map<string, number>();

  function walk(nodes: DiffNode[], ctx: string): void {
    for (const node of nodes) {
      if (node.state === 'added' || node.state === 'removed') {
        const key = `${ctx}:${node.state}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      } else if (node.state === 'modified') {
        const key = `${ctx}:modified`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      if (node.children) walk(node.children, childContext(node));
      if (node.scopes) {
        for (const [scopeKey, scopeNodes] of Object.entries(node.scopes)) {
          walk(scopeNodes, childContext(node));
        }
      }
    }
  }

  function childContext(node: DiffNode): string {
    if (node.step.kind === 'parallel') return 'branch';
    if (node.step.kind === 'select') return 'subscription';
    return 'step';
  }

  walk(root, context);

  const stats: DiffStat[] = [];
  for (const [key, count] of counts) {
    const [ctx, state] = key.split(':');
    const plural = count === 1 ? '' : 's';
    stats.push({ state: state as DiffStatState, count, label: `${ctx}${plural} ${state}` });
  }
  return stats;
}

export function diffSteps(oldSteps: ResolvedStep[], newSteps: ResolvedStep[]): DiffResult {
  const root = diffScope(oldSteps, newSteps);
  const summary = buildSummary(root);
  return { root, summary };
}
