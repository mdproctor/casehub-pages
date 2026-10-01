import { describe, it, expect } from 'vitest';
import type { Catalog, CatalogEntry, Action, Result } from './walker.js';
import { Walker, stepSuccess } from './walker.js';

const noopAction: Action = {
  execute: () => Promise.resolve(stepSuccess({})),
};

function makeCatalog(actions: Record<string, CatalogEntry> = {}): Catalog {
  return {
    resolve: (name) => actions[name],
    availableActions: () => new Set(Object.keys(actions)),
  };
}

function makeEntry(name: string): CatalogEntry {
  return {
    qualifiedName: name,
    definition: { name, inputs: {}, outputs: {} },
    action: noopAction,
  };
}

describe('Walker', () => {
  describe('name uniqueness', () => {
    it('allows unique names', () => {
      const catalog = makeCatalog({ doA: makeEntry('doA'), doB: makeEntry('doB') });
      const steps = [
        { step: 'first', doA: {} },
        { step: 'second', doB: {} },
      ];
      expect(() => Walker.resolve(steps, catalog)).not.toThrow();
    });

    it('throws on duplicate step names', () => {
      const catalog = makeCatalog({ doA: makeEntry('doA') });
      const steps = [
        { step: 'same-name', doA: {} },
        { step: 'same-name', doA: {} },
      ];
      expect(() => Walker.resolve(steps, catalog)).toThrow(/duplicate.*same-name/i);
    });

    it('allows null names (unnamed steps)', () => {
      const catalog = makeCatalog({ doA: makeEntry('doA') });
      const steps = [
        { doA: {} },
        { doA: {} },
      ];
      expect(() => Walker.resolve(steps, catalog)).not.toThrow();
    });

    it('detects duplicates in nested blocks', () => {
      const catalog = makeCatalog({ doA: makeEntry('doA') });
      const steps = [
        { step: 'outer', doA: {} },
        {
          block: [
            { step: 'outer', doA: {} },
          ],
        },
      ];
      expect(() => Walker.resolve(steps, catalog)).toThrow(/duplicate.*outer/i);
    });
  });

  describe('barrier/quorum ref validation', () => {
    it('accepts barrier referencing known step names', () => {
      const catalog = makeCatalog({ doA: makeEntry('doA') });
      const steps = [
        { step: 'step-a', doA: {} },
        { step: 'step-b', doA: {} },
        { barrier: { await: ['step-a', 'step-b'] } },
      ];
      expect(() => Walker.resolve(steps, catalog)).not.toThrow();
    });

    it('throws when barrier references unknown step name', () => {
      const catalog = makeCatalog({ doA: makeEntry('doA') });
      const steps = [
        { step: 'step-a', doA: {} },
        { barrier: { await: ['step-a', 'nonexistent'] } },
      ];
      expect(() => Walker.resolve(steps, catalog)).toThrow(/nonexistent/);
    });

    it('throws when quorum references unknown step name', () => {
      const catalog = makeCatalog({ doA: makeEntry('doA') });
      const steps = [
        { step: 'step-a', doA: {} },
        { quorum: { required: 1, of: ['step-a', 'ghost'] } },
      ];
      expect(() => Walker.resolve(steps, catalog)).toThrow(/ghost/);
    });
  });

  describe('match case body resolution', () => {
    it('handles "default" key holding actions directly', () => {
      const catalog = makeCatalog({ doA: makeEntry('doA') });
      const steps = [
        {
          match: 'value',
          cases: [
            { pattern: 'x', doA: {} },
            { default: [{ step: 'fallback', doA: {} }] },
          ],
        },
      ];
      const resolved = Walker.resolve(steps, catalog);
      expect(resolved[0]!.kind).toBe('match');
      if (resolved[0]!.kind === 'match') {
        expect(resolved[0]!.cases[0]!.steps).toHaveLength(1);
        expect(resolved[0]!.cases[1]!.pattern.type).toBe('default');
        expect(resolved[0]!.cases[1]!.steps).toHaveLength(1);
      }
    });

    it('resolves inline action as case body', () => {
      const catalog = makeCatalog({ doA: makeEntry('doA'), doB: makeEntry('doB') });
      const steps = [
        {
          match: 'v',
          cases: [
            { when: 'hello', doA: {} },
            { pattern: 'world', doB: {} },
            { default: [] },
          ],
        },
      ];
      const resolved = Walker.resolve(steps, catalog);
      if (resolved[0]!.kind === 'match') {
        expect(resolved[0]!.cases[0]!.pattern).toEqual({ type: 'value', value: 'hello' });
        expect(resolved[0]!.cases[0]!.steps).toHaveLength(1);
        expect(resolved[0]!.cases[0]!.steps[0]!.kind).toBe('plugin');
        expect(resolved[0]!.cases[1]!.pattern).toEqual({ type: 'value', value: 'world' });
        expect(resolved[0]!.cases[2]!.pattern.type).toBe('default');
      }
    });

    it('resolves block as case body for multiple actions', () => {
      const catalog = makeCatalog({ doA: makeEntry('doA'), doB: makeEntry('doB') });
      const steps = [
        {
          match: 'v',
          cases: [
            { when: 'x', block: [{ doA: {} }, { doB: {} }] },
            { default: [] },
          ],
        },
      ];
      const resolved = Walker.resolve(steps, catalog);
      if (resolved[0]!.kind === 'match') {
        expect(resolved[0]!.cases[0]!.steps).toHaveLength(1);
        expect(resolved[0]!.cases[0]!.steps[0]!.kind).toBe('block');
        if (resolved[0]!.cases[0]!.steps[0]!.kind === 'block') {
          expect(resolved[0]!.cases[0]!.steps[0]!.steps).toHaveLength(2);
        }
      }
    });
  });

  describe('select branch body resolution', () => {
    it('resolves inline action as wait body', () => {
      const catalog = makeCatalog({ doA: makeEntry('doA') });
      const steps = [
        {
          select: [
            { wait: 'sig-a', doA: {} },
          ],
        },
      ];
      const resolved = Walker.resolve(steps, catalog);
      if (resolved[0]!.kind === 'select') {
        expect(resolved[0]!.branches[0]!.name).toBe('sig-a');
        expect(resolved[0]!.branches[0]!.steps).toHaveLength(1);
        expect(resolved[0]!.branches[0]!.steps[0]!.kind).toBe('plugin');
      }
    });

    it('resolves block as wait body for multiple actions', () => {
      const catalog = makeCatalog({ doA: makeEntry('doA'), doB: makeEntry('doB') });
      const steps = [
        {
          select: [
            { wait: 'sig-a', block: [{ doA: {} }, { doB: {} }] },
          ],
        },
      ];
      const resolved = Walker.resolve(steps, catalog);
      if (resolved[0]!.kind === 'select') {
        expect(resolved[0]!.branches[0]!.steps).toHaveLength(1);
        expect(resolved[0]!.branches[0]!.steps[0]!.kind).toBe('block');
      }
    });

    it('handles empty wait branch', () => {
      const catalog = makeCatalog();
      const steps = [
        { select: [{ wait: 'sig-a' }] },
      ];
      const resolved = Walker.resolve(steps, catalog);
      if (resolved[0]!.kind === 'select') {
        expect(resolved[0]!.branches[0]!.steps).toHaveLength(0);
      }
    });
  });

  describe('DelayStep resolution', () => {
    it('resolves standalone delay as DelayStep', () => {
      const steps = [{ delay: '500ms' }];
      const resolved = Walker.resolve(steps, makeCatalog());
      expect(resolved).toHaveLength(1);
      expect(resolved[0]!.kind).toBe('delay');
      expect((resolved[0] as any).duration).toBe(500);
    });

    it('resolves delay with step name', () => {
      const steps = [{ step: 'pause', delay: '2s' }];
      const resolved = Walker.resolve(steps, makeCatalog());
      expect(resolved[0]!.kind).toBe('delay');
      expect(resolved[0]!.name).toBe('pause');
      expect((resolved[0] as any).duration).toBe(2000);
    });

    it('treats delay alongside action key as decorator', () => {
      const catalog = makeCatalog({ click: makeEntry('click') });
      const steps = [{ click: { role: 'button', name: 'A' }, delay: '1s' }];
      const resolved = Walker.resolve(steps, catalog);
      expect(resolved[0]!.kind).toBe('plugin');
      expect(resolved[0]!.decorators['delay']).toBe('1s');
    });
  });

  describe('non-object action value wrapping', () => {
    it('wraps string action value as { value: string }', () => {
      const catalog = makeCatalog({ navigate: makeEntry('navigate') });
      const steps = [{ navigate: '/dashboard' }];
      const resolved = Walker.resolve(steps, catalog);
      expect(resolved[0]!.kind).toBe('plugin');
      expect((resolved[0] as any).params).toEqual({ value: '/dashboard' });
    });

    it('wraps number action value as { value: number }', () => {
      const catalog = makeCatalog({ wait: makeEntry('wait') });
      const steps = [{ wait: 500 }];
      const resolved = Walker.resolve(steps, catalog);
      expect(resolved[0]!.kind).toBe('plugin');
      expect((resolved[0] as any).params).toEqual({ value: 500 });
    });

    it('passes object action values unchanged', () => {
      const catalog = makeCatalog({ click: makeEntry('click') });
      const steps = [{ click: { role: 'button', name: 'A' } }];
      const resolved = Walker.resolve(steps, catalog);
      expect((resolved[0] as any).params).toEqual({ role: 'button', name: 'A' });
    });
  });

  describe('match case validation', () => {
    it('throws when case has neither pattern nor default', () => {
      const catalog = makeCatalog({ doA: makeEntry('doA') });
      const steps = [
        { match: 'v', cases: [{ doA: {} }] },
      ];
      expect(() => Walker.resolve(steps, catalog)).toThrow(/must have.*pattern.*when.*default/i);
    });

    it('throws when case has both pattern and default', () => {
      const catalog = makeCatalog({ doA: makeEntry('doA') });
      const steps = [
        { match: 'v', cases: [{ pattern: 'x', default: [{ doA: {} }] }] },
      ];
      expect(() => Walker.resolve(steps, catalog)).toThrow(/mutually exclusive/i);
    });

    it('treats string "default" and "_" as literal values, not default markers', () => {
      const catalog = makeCatalog({ doA: makeEntry('doA') });
      const steps = [
        {
          match: 'v',
          cases: [
            { pattern: 'default', doA: {} },
            { pattern: '_', doA: {} },
            { default: [] },
          ],
        },
      ];
      const resolved = Walker.resolve(steps, catalog);
      if (resolved[0]!.kind === 'match') {
        expect(resolved[0]!.cases[0]!.pattern).toEqual({ type: 'value', value: 'default' });
        expect(resolved[0]!.cases[1]!.pattern).toEqual({ type: 'value', value: '_' });
        expect(resolved[0]!.cases[2]!.pattern.type).toBe('default');
      }
    });
  });

  describe('removed keys', () => {
    it('rejects steps key with clear error', () => {
      const catalog = makeCatalog({ doA: makeEntry('doA') });
      expect(() => Walker.resolve([{ steps: [{ doA: {} }] }], catalog))
        .toThrow("'steps' is no longer valid — use inline sibling keys");
    });

    it('rejects do key with clear error', () => {
      const catalog = makeCatalog({ doA: makeEntry('doA') });
      expect(() => Walker.resolve([{ do: [{ doA: {} }] }], catalog))
        .toThrow("'do' is no longer valid — use inline sibling keys");
    });

    it('rejects steps key in nested context', () => {
      const catalog = makeCatalog({ doA: makeEntry('doA') });
      expect(() => Walker.resolve([
        { block: [{ steps: [{ doA: {} }] }] },
      ], catalog)).toThrow("'steps' is no longer valid — use inline sibling keys");
    });
  });
});
