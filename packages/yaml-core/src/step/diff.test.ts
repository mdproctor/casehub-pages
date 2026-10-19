import { describe, it, expect } from 'vitest';
import { diffSteps } from './diff.js';
import type { PluginStep, BlockStep, ParallelStep, BarrierStep, QuorumStep,
  IfElseStep, DelayStep, RaceStep, TryCatchFinallyStep, MatchStep,
  CatalogEntry } from './walker.js';

const entry = (name = 'click'): CatalogEntry => ({
  qualifiedName: name,
  definition: {},
  action: { execute: async () => ({ ok: true }) },
});

const plugin = (name: string | null, action = 'click', params: Record<string, unknown> = {}, decorators: Record<string, unknown> = {}): PluginStep => ({
  kind: 'plugin', name, entry: entry(action), params, decorators,
});

describe('diffSteps', () => {
  describe('empty inputs', () => {
    it('returns empty result for two empty arrays', () => {
      const result = diffSteps([], []);
      expect(result.root).toEqual([]);
      expect(result.summary).toEqual([]);
    });
  });

  describe('identical trees', () => {
    it('marks all steps unchanged', () => {
      const steps = [plugin('a'), plugin('b')];
      const result = diffSteps(steps, steps);
      expect(result.root.every(n => n.state === 'unchanged')).toBe(true);
      expect(result.summary).toEqual([]);
    });
  });

  describe('added steps', () => {
    it('marks new named step as added', () => {
      const result = diffSteps([], [plugin('a')]);
      expect(result.root).toHaveLength(1);
      expect(result.root[0].state).toBe('added');
      expect(result.root[0].step.name).toBe('a');
    });
  });

  describe('removed steps', () => {
    it('marks missing named step as removed', () => {
      const result = diffSteps([plugin('a')], []);
      expect(result.root).toHaveLength(1);
      expect(result.root[0].state).toBe('removed');
      expect(result.root[0].step.name).toBe('a');
    });
  });

  describe('modified steps', () => {
    it('detects param change on named step', () => {
      const old = plugin('a', 'click', { x: 1 });
      const neu = plugin('a', 'click', { x: 2 });
      const result = diffSteps([old], [neu]);
      expect(result.root[0].state).toBe('modified');
      expect(result.root[0].fieldChanges).toContainEqual({ field: 'params.x', oldValue: 1, newValue: 2 });
    });

    it('detects action name change', () => {
      const old = plugin('a', 'click');
      const neu = plugin('a', 'hover');
      const result = diffSteps([old], [neu]);
      expect(result.root[0].state).toBe('modified');
      expect(result.root[0].fieldChanges).toContainEqual({ field: 'entry.qualifiedName', oldValue: 'click', newValue: 'hover' });
    });
  });

  describe('two-pass matching', () => {
    it('matches named steps by name regardless of position', () => {
      const a = plugin('a');
      const b = plugin('b');
      const result = diffSteps([a, b], [b, a]);
      const aNode = result.root.find(n => n.step.name === 'a');
      const bNode = result.root.find(n => n.step.name === 'b');
      expect(aNode?.state).toBe('unchanged');
      expect(bNode?.state).toBe('unchanged');
    });

    it('matches unnamed steps by position', () => {
      const result = diffSteps(
        [plugin(null, 'click', { x: 1 })],
        [plugin(null, 'click', { x: 2 })],
      );
      expect(result.root[0].state).toBe('modified');
    });

    it('matches named first then unnamed by position in remaining slots', () => {
      const a = plugin('a');
      const x = plugin(null, 'action-x');
      const b = plugin('b');
      const y = plugin(null, 'action-y');
      const result = diffSteps([a, x, b], [b, y, a]);
      const aNode = result.root.find(n => n.step.name === 'a');
      const bNode = result.root.find(n => n.step.name === 'b');
      expect(aNode?.state).toBe('unchanged');
      expect(bNode?.state).toBe('unchanged');
    });
  });

  describe('kind change', () => {
    it('treats kind change as remove + add for named step', () => {
      const old = plugin('a');
      const neu: DelayStep = { kind: 'delay', name: 'a', duration: 1000, decorators: {} };
      const result = diffSteps([old], [neu]);
      const removed = result.root.find(n => n.state === 'removed');
      const added = result.root.find(n => n.state === 'added');
      expect(removed).toBeDefined();
      expect(added).toBeDefined();
    });
  });

  describe('decorator changes', () => {
    it('detects added decorator', () => {
      const old = plugin('a');
      const neu = plugin('a', 'click', {}, { retry: 3 });
      const result = diffSteps([old], [neu]);
      expect(result.root[0].state).toBe('modified');
      expect(result.root[0].fieldChanges).toContainEqual({ field: 'decorators.retry', oldValue: undefined, newValue: 3 });
    });

    it('detects modified decorator value', () => {
      const old = plugin('a', 'click', {}, { retry: 2 });
      const neu = plugin('a', 'click', {}, { retry: 5 });
      const result = diffSteps([old], [neu]);
      expect(result.root[0].fieldChanges).toContainEqual({ field: 'decorators.retry', oldValue: 2, newValue: 5 });
    });
  });

  describe('container structural fields', () => {
    it('detects condition change on if-else', () => {
      const old: IfElseStep = { kind: 'if-else', name: 'check', condition: 'x > 0', thenSteps: [], elseSteps: [], decorators: {} };
      const neu: IfElseStep = { kind: 'if-else', name: 'check', condition: 'x > 5', thenSteps: [], elseSteps: [], decorators: {} };
      const result = diffSteps([old], [neu]);
      expect(result.root[0].fieldChanges).toContainEqual({ field: 'condition', oldValue: 'x > 0', newValue: 'x > 5' });
    });

    it('detects duration change on delay', () => {
      const old: DelayStep = { kind: 'delay', name: 'd', duration: 1000, decorators: {} };
      const neu: DelayStep = { kind: 'delay', name: 'd', duration: 5000, decorators: {} };
      const result = diffSteps([old], [neu]);
      expect(result.root[0].fieldChanges).toContainEqual({ field: 'duration', oldValue: 1000, newValue: 5000 });
    });

    it('detects quorum required change', () => {
      const old: QuorumStep = { kind: 'quorum', name: 'q', required: 2, ofSteps: ['a', 'b', 'c'], decorators: {} };
      const neu: QuorumStep = { kind: 'quorum', name: 'q', required: 3, ofSteps: ['a', 'b', 'c', 'd'], decorators: {} };
      const result = diffSteps([old], [neu]);
      expect(result.root[0].fieldChanges).toContainEqual({ field: 'required', oldValue: 2, newValue: 3 });
    });
  });

  describe('derived array-length changes', () => {
    it('emits awaitSteps.length for barrier count change', () => {
      const old: BarrierStep = { kind: 'barrier', name: 'b', awaitSteps: ['s1', 's2'], decorators: {} };
      const neu: BarrierStep = { kind: 'barrier', name: 'b', awaitSteps: ['s1', 's2', 's3'], decorators: {} };
      const result = diffSteps([old], [neu]);
      expect(result.root[0].fieldChanges).toContainEqual({ field: 'awaitSteps.length', oldValue: 2, newValue: 3 });
    });
  });

  describe('nested containers', () => {
    it('diffs block children', () => {
      const old: BlockStep = { kind: 'block', name: 'b', steps: [plugin('s1')], decorators: {} };
      const neu: BlockStep = { kind: 'block', name: 'b', steps: [plugin('s1'), plugin('s2')], decorators: {} };
      const result = diffSteps([old], [neu]);
      expect(result.root[0].children?.find(n => n.state === 'added')).toBeDefined();
    });

    it('diffs parallel named branches', () => {
      const old: ParallelStep = {
        kind: 'parallel', name: 'p', steps: [], decorators: {},
        branches: [{ name: 'fast', steps: [plugin('s1')] }],
      };
      const neu: ParallelStep = {
        kind: 'parallel', name: 'p', steps: [], decorators: {},
        branches: [{ name: 'fast', steps: [plugin('s1')] }, { name: 'slow', steps: [plugin('s2')] }],
      };
      const result = diffSteps([old], [neu]);
      expect(result.root[0].scopes?.['slow']?.[0].state).toBe('added');
    });

    it('diffs unnamed parallel children by position', () => {
      const old: ParallelStep = { kind: 'parallel', name: 'p', steps: [plugin(null, 'a')], decorators: {} };
      const neu: ParallelStep = { kind: 'parallel', name: 'p', steps: [plugin(null, 'b')], decorators: {} };
      const result = diffSteps([old], [neu]);
      expect(result.root[0].children?.[0].state).toBe('modified');
    });

    it('diffs if-else with independent scopes', () => {
      const old: IfElseStep = {
        kind: 'if-else', name: 'check', condition: 'x > 0',
        thenSteps: [plugin('t1')], elseSteps: [plugin('e1')], decorators: {},
      };
      const neu: IfElseStep = {
        kind: 'if-else', name: 'check', condition: 'x > 5',
        thenSteps: [plugin('t1')], elseSteps: [plugin('e1'), plugin('e2')], decorators: {},
      };
      const result = diffSteps([old], [neu]);
      expect(result.root[0].scopes?.['else']?.find(n => n.state === 'added')).toBeDefined();
    });

    it('diffs race children', () => {
      const old: RaceStep = { kind: 'race', name: 'r', steps: [plugin('s1')], decorators: {} };
      const neu: RaceStep = { kind: 'race', name: 'r', steps: [plugin('s1'), plugin('s2')], decorators: {} };
      const result = diffSteps([old], [neu]);
      expect(result.root[0].children?.find(n => n.state === 'added')).toBeDefined();
    });
  });

  describe('merged sequence ordering', () => {
    it('places removed steps at correct interleaved positions', () => {
      const result = diffSteps(
        [plugin('a'), plugin('b'), plugin('c')],
        [plugin('a'), plugin('c')],
      );
      expect(result.root.map(n => ({ name: n.step.name, state: n.state }))).toEqual([
        { name: 'a', state: 'unchanged' },
        { name: 'b', state: 'removed' },
        { name: 'c', state: 'unchanged' },
      ]);
    });
  });

  describe('oldStep on modified containers', () => {
    it('carries oldStep for metadata access', () => {
      const old: IfElseStep = {
        kind: 'if-else', name: 'check', condition: 'old-cond',
        thenSteps: [], elseSteps: [], decorators: {},
      };
      const neu: IfElseStep = {
        kind: 'if-else', name: 'check', condition: 'new-cond',
        thenSteps: [], elseSteps: [], decorators: {},
      };
      const result = diffSteps([old], [neu]);
      expect(result.root[0].oldStep).toEqual(old);
    });
  });

  describe('DiffStat summary', () => {
    it('generates stats for added steps', () => {
      const result = diffSteps([], [plugin('a'), plugin('b')]);
      const addedStat = result.summary.find(s => s.state === 'added');
      expect(addedStat).toBeDefined();
      expect(addedStat!.count).toBe(2);
    });

    it('never emits unchanged stats', () => {
      const steps = [plugin('a')];
      const result = diffSteps(steps, steps);
      expect(result.summary).toEqual([]);
    });
  });
});
