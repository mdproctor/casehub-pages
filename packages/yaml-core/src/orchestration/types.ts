import type { StateHandler, TransitionHandler } from './callbacks.js';
import type { StepError } from './directives.js';

export interface OrcSignal {
  signal(payload?: unknown): void;
  await(): Promise<void>;
  await(timeoutMs: number): Promise<boolean>;
  payload(): unknown;
  isSignalled(): boolean;
}

export interface OrcSemaphore {
  acquire(): Promise<void>;
  tryAcquire(timeoutMs: number): Promise<boolean>;
  release(): void;
  availablePermits(): number;
}

export interface OrcLatch {
  countDown(): void;
  await(): Promise<void>;
  await(timeoutMs: number): Promise<boolean>;
  getCount(): number;
}

export interface OrcChannel<T> {
  send(value: T): Promise<void>;
  send(value: T, timeoutMs: number): Promise<boolean>;
  receive(): Promise<T>;
  receive(timeoutMs: number): Promise<T | undefined>;
  isEmpty(): boolean;
  close(): void;
  close(cause: Error): void;
  isErrorClosed(): boolean;
  closeError(): Error | undefined;
}

export interface OrcStateMachine<S extends string> {
  currentState(): S;
  transition(from: S, to: S, payload?: unknown): boolean;
  onTransition(from: S, to: S, handler: TransitionHandler): void;
  onEnter(state: S, handler: StateHandler): void;
  onExit(state: S, handler: StateHandler): void;
}

export interface StepResultStore {
  recordSuccess(stepName: string, result: Record<string, unknown>): void;
  recordFailure(stepName: string, error: StepError): void;
  result(stepName: string): Record<string, unknown> | undefined;
  error(stepName: string): StepError | undefined;
  hasCompleted(stepName: string): boolean;
  awaitAll(names: string[]): Promise<void>;
  awaitCount(names: string[], threshold: number): Promise<void>;
}

export interface ScenarioScope {
  semaphore(name: string, permits: number): OrcSemaphore;
  latch(name: string, count: number): OrcLatch;
  signal(name: string): OrcSignal;
  channel<T>(name: string, capacity?: number): OrcChannel<T>;
  stateMachine<S extends string>(name: string, states: readonly S[], initial: S): OrcStateMachine<S>;
  primitive<T>(name: string, type: new (...args: unknown[]) => T): T;
  resultStore(): StepResultStore;
  counter(name: string): import('./counter.js').OrcCounter;
  gauge<T>(name: string, initial: T): import('./gauge.js').OrcGauge<T>;
  flag(name: string): import('./flag.js').OrcFlag;
  accumulator(name: string, op: (a: number, b: number) => number, identity: number): import('./accumulator.js').OrcAccumulator;
  map<K, V>(name: string): import('./orc-map.js').OrcMap<K, V>;
  spawn(name: string, task: () => Promise<void>): import('./spawned-task.js').SpawnedTask;
  childScope(name: string): ScenarioScope;
  withDeadline(deadlineMs: number, onDeadline?: () => void): ScenarioScope;
  isDeadlineExpired(): boolean;
  remainingTime(): number | undefined;
  speedMultiplier(): import('./speed-multiplier.js').SpeedMultiplier;
  close(): void;
}
