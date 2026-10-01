import { describe, it, expect } from 'vitest';
import { DefaultScenarioScope } from './scenario-scope.js';
import { DefaultSpeedMultiplier, FixedSpeedMultiplier } from './speed-multiplier.js';

describe('DefaultScenarioScope', () => {
  it('creates semaphore by name', () => {
    const scope = new DefaultScenarioScope();
    const sem = scope.semaphore('db', 3);
    expect(sem.availablePermits()).toBe(3);
  });

  it('get-or-create — same name returns same instance', () => {
    const scope = new DefaultScenarioScope();
    const s1 = scope.signal('go');
    const s2 = scope.signal('go');
    expect(s1).toBe(s2);
  });

  it('creates latch by name', () => {
    const scope = new DefaultScenarioScope();
    const latch = scope.latch('barrier', 2);
    expect(latch.getCount()).toBe(2);
  });

  it('creates channel by name', () => {
    const scope = new DefaultScenarioScope();
    const ch = scope.channel<number>('trades');
    expect(ch.isEmpty()).toBe(true);
  });

  it('creates bounded channel', async () => {
    const scope = new DefaultScenarioScope();
    const ch = scope.channel<number>('bounded', 1);
    await ch.send(1);
    expect(ch.isEmpty()).toBe(false);
  });

  it('creates state machine by name', () => {
    const scope = new DefaultScenarioScope();
    const sm = scope.stateMachine('wf', ['idle', 'active', 'done'] as const, 'idle');
    expect(sm.currentState()).toBe('idle');
  });

  it('resultStore returns singleton', () => {
    const scope = new DefaultScenarioScope();
    expect(scope.resultStore()).toBe(scope.resultStore());
  });

  it('close cascades — channels closed, signals fired', async () => {
    const scope = new DefaultScenarioScope();
    const ch = scope.channel<number>('test');
    const sig = scope.signal('gate');
    scope.close();
    await expect(ch.receive()).rejects.toThrow();
    expect(sig.isSignalled()).toBe(true);
  });

  it('speedMultiplier defaults to 1x', () => {
    const scope = new DefaultScenarioScope();
    expect(scope.speedMultiplier().currentSpeed()).toBe(1);
    scope.close();
  });

  it('speedMultiplier accepts custom multiplier', () => {
    const sm = new FixedSpeedMultiplier(5);
    const scope = new DefaultScenarioScope(undefined, sm);
    expect(scope.speedMultiplier().currentSpeed()).toBe(5);
    scope.close();
  });

  it('childScope inherits speedMultiplier', () => {
    const sm = new FixedSpeedMultiplier(3);
    const parent = new DefaultScenarioScope(undefined, sm);
    const child = parent.childScope('inner') as DefaultScenarioScope;
    expect(child.speedMultiplier().currentSpeed()).toBe(3);
    parent.close();
  });

  it('withDeadline propagates speedMultiplier', () => {
    const sm = new FixedSpeedMultiplier(10);
    const scope = new DefaultScenarioScope(undefined, sm);
    const deadline = scope.withDeadline(1000) as DefaultScenarioScope;
    expect(deadline.speedMultiplier().currentSpeed()).toBe(10);
    scope.close();
    deadline.close();
  });
});
