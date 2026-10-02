import { describe, it, expect } from 'vitest';
import { ScenarioParser } from './parser.js';
import { ScenarioValidator } from './validator.js';
import { ScenarioCompiler } from './compiler.js';

describe('ScenarioParser', () => {
  it('parses a linear completion-driven scenario', () => {
    const def = ScenarioParser.parse('incident', {
      states: {
        DETECTED: [
          { 'on-failure': 'ESCALATED' },
          { 'notify.triage': { channel: 'ops' } },
        ],
        TRIAGING: [
          { 'classify.severity': { input: '${result.DETECTED.output}' } },
        ],
        RESOLVED: 'terminal',
        ESCALATED: 'terminal',
      },
    });

    expect(def.name).toBe('incident');
    expect(def.initialState).toBe('DETECTED');
    expect(def.states.size).toBe(4);

    const detected = def.states.get('DETECTED')!;
    expect(detected.onFailure).toBe('ESCALATED');
    expect(detected.steps).toHaveLength(1);
    expect(detected.steps[0]!['notify.triage']).toEqual({ channel: 'ops' });

    const resolved = def.states.get('RESOLVED')!;
    expect(resolved.isTerminal).toBe(true);
  });

  it('parses event-driven states', () => {
    const def = ScenarioParser.parse('review', {
      states: {
        PENDING: [
          { on: { approve: 'APPROVED', reject: 'REJECTED' } },
        ],
        APPROVED: 'terminal',
        REJECTED: 'terminal',
      },
    });

    const pending = def.states.get('PENDING')!;
    expect(Object.keys(pending.events)).toEqual(['approve', 'reject']);
    expect(pending.events['approve']).toEqual({ type: 'simple', target: 'APPROVED' });
  });

  it('parses guarded event transitions', () => {
    const def = ScenarioParser.parse('shipping', {
      states: {
        READY: [
          { on: { ship: { to: 'SHIPPED', when: '${inventory.available}' } } },
        ],
        SHIPPED: 'terminal',
      },
    });

    const ready = def.states.get('READY')!;
    expect(ready.events['ship']).toEqual({
      type: 'guarded',
      target: 'SHIPPED',
      when: '${inventory.available}',
    });
  });

  it('parses match-based event transitions', () => {
    const def = ScenarioParser.parse('assessment', {
      states: {
        ASSESSING: [
          {
            on: {
              assess: [
                { match: { severity: 'critical' }, to: 'IMMEDIATE' },
                { to: 'STANDARD' },
              ],
            },
          },
        ],
        IMMEDIATE: 'terminal',
        STANDARD: 'terminal',
      },
    });

    const assessing = def.states.get('ASSESSING')!;
    const event = assessing.events['assess']!;
    expect(event.type).toBe('match-based');
    if (event.type === 'match-based') {
      expect(event.cases).toHaveLength(2);
      expect(event.cases[0]!.match).toEqual({ severity: 'critical' });
      expect(event.cases[0]!.target).toBe('IMMEDIATE');
      expect(event.cases[1]!.match).toBeNull();
      expect(event.cases[1]!.target).toBe('STANDARD');
    }
  });

  it('parses deadline with target', () => {
    const def = ScenarioParser.parse('sla', {
      states: {
        ACTIVE: [
          { deadline: '120s -> BREACHED' },
          { 'execute.task': {} },
        ],
        DONE: 'terminal',
        BREACHED: 'terminal',
      },
    });

    const active = def.states.get('ACTIVE')!;
    expect(active.deadline).toBe('120s -> BREACHED');
  });

  it('parses terminal states with steps', () => {
    const def = ScenarioParser.parse('notify', {
      states: {
        ACTIVE: [{ 'do.work': {} }],
        DONE: [
          { terminal: true },
          { 'notify.complete': { msg: 'done' } },
        ],
      },
    });

    const done = def.states.get('DONE')!;
    expect(done.isTerminal).toBe(true);
    expect(done.steps).toHaveLength(1);
    expect(done.steps[0]!['notify.complete']).toEqual({ msg: 'done' });
  });

  it('throws on blank name', () => {
    expect(() => ScenarioParser.parse('', { states: { A: 'terminal' } })).toThrow('blank');
  });

  it('throws on missing states', () => {
    expect(() => ScenarioParser.parse('test', {})).toThrow('states block');
  });

  it('splits mixed metadata and step entries', () => {
    const def = ScenarioParser.parse('mixed', {
      states: {
        START: [
          { 'on-failure': 'FAILED', 'do.step': { x: 1 } },
        ],
        DONE: 'terminal',
        FAILED: 'terminal',
      },
    });

    const start = def.states.get('START')!;
    expect(start.onFailure).toBe('FAILED');
    expect(start.steps).toHaveLength(1);
    expect(start.steps[0]!['do.step']).toEqual({ x: 1 });
  });
});

describe('ScenarioValidator', () => {
  it('validates a correct linear scenario', () => {
    const def = ScenarioParser.parse('valid', {
      states: {
        A: [{ next: 'B' }],
        B: [{ next: 'C' }],
        C: 'terminal',
      },
    });
    const errors = ScenarioValidator.validate(def);
    expect(errors).toEqual([]);
  });

  it('flags initial state as terminal', () => {
    const def = ScenarioParser.parse('bad', {
      states: {
        DONE: 'terminal',
      },
    });
    const errors = ScenarioValidator.validate(def);
    expect(errors.some(e => e.rule === 'initial-not-terminal')).toBe(true);
  });

  it('flags missing terminal state', () => {
    const def = ScenarioParser.parse('no-end', {
      states: {
        A: [{ next: 'B' }],
        B: [{ next: 'A' }],
      },
    });
    const errors = ScenarioValidator.validate(def);
    expect(errors.some(e => e.rule === 'has-terminal')).toBe(true);
  });

  it('flags references to unknown states', () => {
    const def = ScenarioParser.parse('bad-ref', {
      states: {
        A: [{ next: 'NONEXISTENT' }],
        B: 'terminal',
      },
    });
    const errors = ScenarioValidator.validate(def);
    expect(errors.some(e => e.rule === 'valid-ref' && e.message.includes('NONEXISTENT'))).toBe(true);
  });

  it('flags on-failure referencing unknown state', () => {
    const def = ScenarioParser.parse('bad-failure', {
      states: {
        A: [{ 'on-failure': 'GHOST', next: 'B' }],
        B: 'terminal',
      },
    });
    const errors = ScenarioValidator.validate(def);
    expect(errors.some(e => e.rule === 'valid-ref' && e.message.includes('GHOST'))).toBe(true);
  });

  it('flags dead-end states', () => {
    const def = ScenarioParser.parse('dead-end', {
      states: {
        A: [{ next: 'B' }],
        B: [{ 'do.something': {} }],
        C: 'terminal',
      },
    });
    const errors = ScenarioValidator.validate(def);
    expect(errors.some(e => e.rule === 'no-dead-end' && e.message.includes("'B'"))).toBe(true);
  });

  it('flags unreachable states', () => {
    const def = ScenarioParser.parse('orphan', {
      states: {
        A: [{ next: 'B' }],
        B: 'terminal',
        C: [{ next: 'B' }],
      },
    });
    const errors = ScenarioValidator.validate(def);
    expect(errors.some(e => e.rule === 'reachable' && e.message.includes("'C'"))).toBe(true);
  });

  it('flags deadline referencing unknown state', () => {
    const def = ScenarioParser.parse('bad-deadline', {
      states: {
        A: [{ deadline: '30s -> NOWHERE', next: 'B' }],
        B: 'terminal',
      },
    });
    const errors = ScenarioValidator.validate(def);
    expect(errors.some(e => e.rule === 'valid-ref' && e.message.includes('NOWHERE'))).toBe(true);
  });

  it('flags event referencing unknown state', () => {
    const def = ScenarioParser.parse('bad-event', {
      states: {
        A: [{ on: { go: 'PHANTOM' } }],
        B: 'terminal',
      },
    });
    const errors = ScenarioValidator.validate(def);
    expect(errors.some(e => e.rule === 'valid-ref' && e.message.includes('PHANTOM'))).toBe(true);
  });

  it('validates a correct event-driven scenario', () => {
    const def = ScenarioParser.parse('events', {
      states: {
        WAITING: [{ on: { approve: 'DONE', reject: 'FAILED' } }],
        DONE: 'terminal',
        FAILED: 'terminal',
      },
    });
    const errors = ScenarioValidator.validate(def);
    expect(errors).toEqual([]);
  });
});

describe('ScenarioCompiler', () => {
  it('compiles a linear scenario into a state machine', () => {
    const def = ScenarioParser.parse('linear', {
      states: {
        A: [{ next: 'B' }, { 'step.one': {} }],
        B: [{ next: 'C' }, { 'step.two': {} }],
        C: 'terminal',
      },
    });

    const compiled = ScenarioCompiler.compile(def);
    expect(compiled.stateMachine.currentState()).toBe('A');
    expect(compiled.stateSteps.get('A')).toHaveLength(1);
    expect(compiled.stateSteps.get('C')).toEqual([]);
  });

  it('allows transitions matching the definition', () => {
    const def = ScenarioParser.parse('transitions', {
      states: {
        A: [{ next: 'B' }],
        B: [{ next: 'C' }],
        C: 'terminal',
      },
    });

    const compiled = ScenarioCompiler.compile(def);
    const sm = compiled.stateMachine;
    expect(sm.transition('A', 'B')).toBe(true);
    expect(sm.currentState()).toBe('B');
    expect(sm.transition('B', 'C')).toBe(true);
    expect(sm.currentState()).toBe('C');
  });

  it('registers on-failure transitions', () => {
    const def = ScenarioParser.parse('with-failure', {
      states: {
        A: [{ 'on-failure': 'FAILED', next: 'B' }],
        B: 'terminal',
        FAILED: 'terminal',
      },
    });

    const compiled = ScenarioCompiler.compile(def);
    expect(compiled.stateMachine.transition('A', 'FAILED')).toBe(true);
  });

  it('registers event transitions', () => {
    const def = ScenarioParser.parse('events', {
      states: {
        WAITING: [{ on: { approve: 'DONE' } }],
        DONE: 'terminal',
      },
    });

    const compiled = ScenarioCompiler.compile(def);
    expect(compiled.stateMachine.transition('WAITING', 'DONE')).toBe(true);
  });

  it('throws on invalid definition', () => {
    const def = ScenarioParser.parse('bad', {
      states: {
        ONLY: 'terminal',
      },
    });
    expect(() => ScenarioCompiler.compile(def)).toThrow('validation failed');
  });

  it('marks terminal states correctly', () => {
    const def = ScenarioParser.parse('terminals', {
      states: {
        A: [{ next: 'B' }],
        B: 'terminal',
      },
    });

    const compiled = ScenarioCompiler.compile(def);
    compiled.stateMachine.transition('A', 'B');
    expect(() => compiled.stateMachine.transition('B', 'A')).toThrow();
  });
});
