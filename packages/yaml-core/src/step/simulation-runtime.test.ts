import { describe, it, expect } from 'vitest';
import { InvocationJournal, SimulationRuntime } from './simulation-runtime.js';
import type { SimulationConfig } from './simulation-runtime.js';

describe('InvocationJournal', () => {
  it('records and queries entries by qualified name', () => {
    const journal = new InvocationJournal();
    journal.record('agent-provider.invoke', 'default-tenant',
      { prompt: 'hello' }, { response: 'hi' }, 'DOMAIN_PLAUSIBLE');
    journal.record('case-memory-store.query', 'default-tenant',
      { key: 'k1' }, { value: 'v1' }, 'RECORDED_REAL');
    journal.record('agent-provider.invoke', 'default-tenant',
      { prompt: 'bye' }, { response: 'goodbye' }, 'DOMAIN_PLAUSIBLE');

    expect(journal.entries()).toHaveLength(3);
    expect(journal.entriesFor('agent-provider.invoke')).toHaveLength(2);
    expect(journal.countFor('agent-provider.invoke')).toBe(2);
    expect(journal.countFor('case-memory-store.query')).toBe(1);
    expect(journal.countFor('unknown')).toBe(0);
  });
});

describe('SimulationRuntime', () => {
  it('pushes and pops overlays', () => {
    const runtime = new SimulationRuntime();
    expect(runtime.hasActiveOverlay()).toBe(false);

    const config: SimulationConfig = { strategies: { 'agent-provider.invoke': 'sequential' }, corpus: [], capture: [] };
    const overlay = runtime.pushOverlay(config);
    expect(runtime.hasActiveOverlay()).toBe(true);

    runtime.popOverlay(overlay);
    expect(runtime.hasActiveOverlay()).toBe(false);
  });

  it('resolves strategies top-down from overlay stack', () => {
    const runtime = new SimulationRuntime();
    const config1: SimulationConfig = { strategies: { 'a': 'sequential' }, corpus: [], capture: [] };
    const config2: SimulationConfig = { strategies: { 'a': 'random', 'b': 'key-lookup' }, corpus: [], capture: [] };

    runtime.pushOverlay(config1);
    const overlay2 = runtime.pushOverlay(config2);

    expect(runtime.strategyFor('a')).toBe('random');
    expect(runtime.strategyFor('b')).toBe('key-lookup');

    runtime.popOverlay(overlay2);
    expect(runtime.strategyFor('a')).toBe('sequential');
    expect(runtime.strategyFor('b')).toBeUndefined();
  });

  it('activeJournal returns top overlay journal', () => {
    const runtime = new SimulationRuntime();
    expect(runtime.activeJournal()).toBeUndefined();

    const config: SimulationConfig = { strategies: {}, corpus: [], capture: [] };
    runtime.pushOverlay(config);
    const journal = runtime.activeJournal();
    expect(journal).toBeDefined();
  });

  it('recordJournal records to active overlay', () => {
    const runtime = new SimulationRuntime();
    const config: SimulationConfig = { strategies: {}, corpus: [], capture: [] };
    runtime.pushOverlay(config);

    runtime.recordJournal('spi.method', 'tenant1', { in: 1 }, { out: 2 }, 'RECORDED_REAL');
    expect(runtime.activeJournal()!.countFor('spi.method')).toBe(1);
  });

  it('recordJournal is no-op when no overlay active', () => {
    const runtime = new SimulationRuntime();
    expect(() => runtime.recordJournal('spi.method', 't', {}, {}, 'RECORDED_REAL')).not.toThrow();
  });

  it('popAll clears all overlays', () => {
    const runtime = new SimulationRuntime();
    const config: SimulationConfig = { strategies: {}, corpus: [], capture: [] };
    runtime.pushOverlay(config);
    runtime.pushOverlay(config);
    expect(runtime.hasActiveOverlay()).toBe(true);

    runtime.popAll();
    expect(runtime.hasActiveOverlay()).toBe(false);
  });

  it('fallthroughRealism returns configured value or default', () => {
    const runtime = new SimulationRuntime();
    const config: SimulationConfig = {
      strategies: {}, corpus: [], capture: [],
      fallthroughRealism: { 'agent-provider.invoke': 'PLACEHOLDER' },
    };
    runtime.pushOverlay(config);

    expect(runtime.fallthroughRealism('agent-provider.invoke')).toBe('PLACEHOLDER');
    expect(runtime.fallthroughRealism('unknown')).toBe('RECORDED_REAL');
  });
});
