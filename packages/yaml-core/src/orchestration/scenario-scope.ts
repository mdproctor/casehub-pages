import type {
  ScenarioScope, OrcSemaphore, OrcLatch, OrcSignal, OrcChannel,
  OrcStateMachine, StepResultStore,
} from './types.js';
import { DefaultOrcSemaphore } from './semaphore.js';
import { DefaultOrcLatch } from './latch.js';
import { DefaultOrcSignal } from './signal.js';
import { DefaultOrcChannel } from './channel.js';
import { StateMachineBuilder } from './state-machine.js';
import { DefaultStepResultStore } from './step-result-store.js';
import { DefaultOrcCounter } from './counter.js';
import { DefaultOrcGauge } from './gauge.js';
import { DefaultOrcFlag } from './flag.js';
import { DefaultOrcAccumulator } from './accumulator.js';
import { DefaultOrcMap } from './orc-map.js';
import { DefaultSpawnedTask } from './spawned-task.js';

export class DefaultScenarioScope implements ScenarioScope {
  private readonly _primitives = new Map<string, unknown>();
  private _resultStore?: DefaultStepResultStore;

  constructor(private readonly _parent?: DefaultScenarioScope) {}
  private _deadlineMs?: number;
  private _deadlineStart?: number;
  private _deadlineExpired = false;
  private _deadlineTimer?: ReturnType<typeof setTimeout>;

  semaphore(name: string, permits: number): OrcSemaphore {
    return this._getOrCreate(name, () => new DefaultOrcSemaphore(permits));
  }

  latch(name: string, count: number): OrcLatch {
    return this._getOrCreate(name, () => new DefaultOrcLatch(count));
  }

  signal(name: string): OrcSignal {
    return this._getOrCreate(name, () => new DefaultOrcSignal());
  }

  channel<T>(name: string, capacity?: number): OrcChannel<T> {
    return this._getOrCreate(name, () => new DefaultOrcChannel<T>(capacity));
  }

  stateMachine<S extends string>(
    name: string, states: readonly S[], initial: S,
  ): OrcStateMachine<S> {
    return this._getOrCreate(name, () => {
      const builder = new StateMachineBuilder<S>(name, initial);
      for (let i = 0; i < states.length - 1; i++) {
        for (let j = i + 1; j < states.length; j++) {
          builder.transition(states[i]!, states[j]!);
          builder.transition(states[j]!, states[i]!);
        }
      }
      return builder.build();
    });
  }

  primitive<T>(name: string, type: new (...args: unknown[]) => T): T {
    return this._getOrCreate(name, () => new type());
  }

  resultStore(): StepResultStore {
    if (!this._resultStore) this._resultStore = new DefaultStepResultStore();
    return this._resultStore;
  }

  counter(name: string): import('./counter.js').OrcCounter {
    return this._getOrCreate(name, () => new DefaultOrcCounter());
  }

  gauge<T>(name: string, initial: T): import('./gauge.js').OrcGauge<T> {
    return this._getOrCreate(name, () => new DefaultOrcGauge<T>(initial));
  }

  flag(name: string): import('./flag.js').OrcFlag {
    return this._getOrCreate(name, () => new DefaultOrcFlag());
  }

  accumulator(name: string, op: (a: number, b: number) => number, identity: number): import('./accumulator.js').OrcAccumulator {
    return this._getOrCreate(name, () => new DefaultOrcAccumulator(op, identity));
  }

  map<K, V>(name: string): import('./orc-map.js').OrcMap<K, V> {
    return this._getOrCreate(name, () => new DefaultOrcMap<K, V>());
  }

  spawn(name: string, task: () => Promise<void>): import('./spawned-task.js').SpawnedTask {
    return this._getOrCreate(name, () => new DefaultSpawnedTask(name, task));
  }

  childScope(name: string): ScenarioScope {
    return this._getOrCreate(name, () => new DefaultScenarioScope(this));
  }

  withDeadline(deadlineMs: number, onDeadline?: () => void): ScenarioScope {
    const child = new DefaultScenarioScope();
    child._deadlineMs = deadlineMs;
    child._deadlineStart = Date.now();
    if (onDeadline) {
      child._deadlineTimer = setTimeout(() => {
        child._deadlineExpired = true;
        onDeadline();
      }, deadlineMs);
    }
    return child;
  }

  isDeadlineExpired(): boolean {
    if (this._deadlineExpired) return true;
    if (this._deadlineMs === undefined || this._deadlineStart === undefined) return false;
    return Date.now() - this._deadlineStart >= this._deadlineMs;
  }

  remainingTime(): number | undefined {
    if (this._deadlineMs === undefined || this._deadlineStart === undefined) return undefined;
    const remaining = this._deadlineMs - (Date.now() - this._deadlineStart);
    return remaining > 0 ? remaining : 0;
  }

  close(): void {
    if (this._deadlineTimer) clearTimeout(this._deadlineTimer);
    const tasks: Array<{ joinWithTimeout(ms: number): Promise<boolean> }> = [];
    for (const [, prim] of this._primitives) {
      if (prim && typeof prim === 'object') {
        if (prim instanceof DefaultScenarioScope) {
          prim.close();
        } else if ('joinWithTimeout' in prim && typeof (prim as Record<string, unknown>).joinWithTimeout === 'function') {
          tasks.push(prim as { joinWithTimeout(ms: number): Promise<boolean> });
        } else if ('close' in prim && typeof (prim as Record<string, unknown>).close === 'function') {
          (prim as { close(): void }).close();
        } else if ('signal' in prim && typeof (prim as Record<string, unknown>).signal === 'function') {
          (prim as OrcSignal).signal();
        }
      }
    }
    if (tasks.length > 0) {
      void Promise.allSettled(tasks.map(t => t.joinWithTimeout(5000)));
    }
    this._primitives.clear();
  }

  registerPrimitive(name: string, instance: unknown): void {
    this._primitives.set(name, instance);
  }

  private _getOrCreate<T>(name: string, factory: () => T): T {
    let existing = this._primitives.get(name) as T | undefined;
    if (existing !== undefined) return existing;
    if (this._parent) {
      const parentVal = this._parent._primitives.get(name) as T | undefined;
      if (parentVal !== undefined) return parentVal;
    }
    existing = factory();
    this._primitives.set(name, existing);
    return existing;
  }
}
