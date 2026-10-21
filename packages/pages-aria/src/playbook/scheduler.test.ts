import { describe, it, expect, vi } from 'vitest';
import { createScheduler } from './scheduler.js';
import type { SchedulerOptions } from './scheduler.js';
import type { SchedulerStep } from './types.js';
import type { PluginStep, ParallelStep, BlockStep, DelayStep } from '@casehubio/yaml-core/step';
import { stepSuccess, stepFailure } from '@casehubio/yaml-core/step';

function pluginStep(name: string, calls: unknown[], params: Record<string, unknown> = {}, decorators: Record<string, unknown> = {}): PluginStep {
  return {
    kind: 'plugin', name: null, params, decorators,
    entry: {
      qualifiedName: name,
      definition: { name, inputs: {}, outputs: {} },
      action: { async execute(p) { calls.push({ action: name, params: p }); return stepSuccess({}); } },
    },
  };
}

function failingPluginStep(name: string, message: string, decorators: Record<string, unknown> = {}): PluginStep {
  return {
    kind: 'plugin', name, params: {}, decorators,
    entry: {
      qualifiedName: name,
      definition: { name, inputs: {}, outputs: {} },
      action: { async execute() { return stepFailure(message); } },
    },
  };
}

function testOptions(): SchedulerOptions {
  return { eventTarget: new EventTarget(), speed: Infinity, startPaused: true };
}

function parallelStep(branches: Record<string, SchedulerStep[]>): ParallelStep {
  const steps: BlockStep[] = Object.entries(branches).map(([name, branchSteps]) => ({
    kind: 'block' as const, name, steps: branchSteps as any, decorators: {},
  }));
  return { kind: 'parallel', name: null, steps, decorators: {} };
}

describe('DES Scheduler', () => {
  it('executes flat sequential plugin steps in order', async () => {
    const calls: unknown[] = [];
    const scenario = {
      scenario: 'test',
      steps: [
        pluginStep('click', calls, { name: 'A' }),
        pluginStep('click', calls, { name: 'B' }),
      ],
    };
    const runner = createScheduler(scenario, testOptions());
    runner.play();
    await vi.waitFor(() => { expect(runner.state).toBe('done'); });
    expect(calls).toHaveLength(2);
    expect((calls[0] as any).params.name).toBe('A');
    expect((calls[1] as any).params.name).toBe('B');
  });

  it('starts in paused state when startPaused is true', () => {
    const calls: unknown[] = [];
    const scenario = { scenario: 'test', steps: [pluginStep('click', calls)] };
    const runner = createScheduler(scenario, testOptions());
    expect(runner.state).toBe('paused');
  });

  it('starts in idle state when startPaused is false', () => {
    const calls: unknown[] = [];
    const scenario = { scenario: 'test', steps: [pluginStep('click', calls)] };
    const runner = createScheduler(scenario, { ...testOptions(), startPaused: false });
    expect(runner.state).toBe('idle');
  });

  it('step() executes exactly one step', async () => {
    const calls: unknown[] = [];
    const scenario = {
      scenario: 'test',
      steps: [pluginStep('click', calls, { name: 'A' }), pluginStep('click', calls, { name: 'B' })],
    };
    const runner = createScheduler(scenario, testOptions());
    await runner.step();
    expect(calls).toHaveLength(1);
    expect(runner.state).toBe('paused');
  });

  it('parallel branches execute with DES interleaving', async () => {
    const calls: unknown[] = [];
    const scenario = {
      scenario: 'test',
      steps: [parallelStep({
        'a': [pluginStep('click', calls, { name: 'A1' }), pluginStep('click', calls, { name: 'A2' })],
        'b': [pluginStep('click', calls, { name: 'B1' })],
      })],
    };
    const runner = createScheduler(scenario, testOptions());
    runner.play();
    await vi.waitFor(() => { expect(runner.state).toBe('done'); });
    expect(calls).toHaveLength(3);
  });

  it('dispose stops execution and cleans up', async () => {
    const calls: unknown[] = [];
    const steps = Array.from({ length: 100 }, (_, i) => pluginStep('click', calls, { name: `btn-${i}` }));
    const runner = createScheduler({ scenario: 'test', steps }, testOptions());
    runner.play();
    await new Promise(r => setTimeout(r, 10));
    runner.dispose();
    const countAtDispose = calls.length;
    await new Promise(r => setTimeout(r, 50));
    expect(calls.length).toBe(countAtDispose);
  });

  it('emits scenario:state on play', async () => {
    const calls: unknown[] = [];
    const et = new EventTarget();
    const states: unknown[] = [];
    et.addEventListener('pages-event', (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.topic === 'scenario:state') states.push(detail.payload);
    });
    const scenario = { scenario: 'test', steps: [pluginStep('click', calls)] };
    const runner = createScheduler(scenario, { eventTarget: et, speed: Infinity, startPaused: true });
    runner.play();
    await vi.waitFor(() => { expect(runner.state).toBe('done'); });
    expect(states.length).toBeGreaterThan(0);
    expect((states[0] as any).scenario).toBe('test');
  });

  it('signal-fire unblocks await-signal', async () => {
    const calls: unknown[] = [];
    const scenario = {
      scenario: 'test',
      steps: [parallelStep({
        'sender': [
          pluginStep('click', calls, { name: 'Send' }),
          { kind: 'signal-fire', name: 'data-ready', decorators: {} },
        ],
        'receiver': [
          { kind: 'await-signal', name: 'data-ready', decorators: {} },
          pluginStep('click', calls, { name: 'Receive' }),
        ],
      })],
    };
    const runner = createScheduler(scenario, testOptions());
    runner.play();
    await vi.waitFor(() => { expect(runner.state).toBe('done'); });
    expect(calls).toHaveLength(2);
  });

  it('delay step blocks queue for virtual time', async () => {
    const calls: unknown[] = [];
    const delayStep: DelayStep = { kind: 'delay', name: null, duration: 1000, decorators: {} };
    const scenario = {
      scenario: 'test',
      steps: [
        pluginStep('click', calls, { name: 'Before' }),
        delayStep,
        pluginStep('click', calls, { name: 'After' }),
      ],
    };
    const runner = createScheduler(scenario, testOptions());
    runner.play();
    await vi.waitFor(() => { expect(runner.state).toBe('done'); });
    expect(calls).toHaveLength(2);
    expect(runner.clock.now()).toBeGreaterThanOrEqual(1000);
  });

  it('handles empty scenario', async () => {
    const scenario = { scenario: 'empty', steps: [] };
    const runner = createScheduler(scenario, testOptions());
    runner.play();
    await vi.waitFor(() => { expect(runner.state).toBe('done'); });
  });

  it('setSpeed updates clock speed', () => {
    const scenario = { scenario: 'test', steps: [] };
    const runner = createScheduler(scenario, testOptions());
    runner.setSpeed(2);
    expect(runner.clock.speed()).toBe(2);
  });

  it('failure in parallel branch resolves parent without deadlock', async () => {
    const calls: unknown[] = [];
    const et = new EventTarget();
    const errors: unknown[] = [];
    et.addEventListener('pages-event', (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.payload?.error) errors.push(detail.payload.error);
    });
    const scenario = {
      scenario: 'test',
      steps: [parallelStep({
        'success-branch': [pluginStep('click', calls, { name: 'OK' })],
        'fail-branch': [failingPluginStep('bad', 'boom')],
      })],
    };
    const runner = createScheduler(scenario, { eventTarget: et, speed: Infinity, startPaused: true });
    runner.play();
    await vi.waitFor(() => { expect(runner.state).toBe('done'); }, { timeout: 1000 });
    const deadlockErrors = errors.filter(e => (e as any).step === 'scheduler');
    expect(deadlockErrors).toHaveLength(0);
  });

  it('Result failure triggers error event', async () => {
    const et = new EventTarget();
    const errors: unknown[] = [];
    et.addEventListener('pages-event', (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.payload?.error) errors.push(detail.payload.error);
    });
    const scenario = {
      scenario: 'test',
      steps: [failingPluginStep('bad-step', 'something broke')],
    };
    const runner = createScheduler(scenario, { eventTarget: et, speed: Infinity, startPaused: true });
    runner.play();
    await vi.waitFor(() => { expect(runner.state).toBe('done'); });
    expect(errors).toHaveLength(1);
    expect((errors[0] as any).message).toBe('something broke');
  });
});
