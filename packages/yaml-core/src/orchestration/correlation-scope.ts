import type { OrcChannel, ScenarioScope } from './types.js';
import type { SpeedMultiplier } from './speed-multiplier.js';
import { DefaultSpeedMultiplier } from './speed-multiplier.js';
import { ChannelClosedError } from './errors.js';
import { DefaultScenarioScope } from './scenario-scope.js';

export class CorrelationTimeoutError extends Error {
  readonly correlationKey: unknown;
  readonly timeoutMs: number;

  constructor(correlationKey: unknown, timeoutMs: number) {
    super(`Correlation timeout for key '${correlationKey}' after ${timeoutMs}ms`);
    this.name = 'CorrelationTimeoutError';
    this.correlationKey = correlationKey;
    this.timeoutMs = timeoutMs;
  }
}

interface PendingCorrelation<K, V> {
  key: K;
  resolve: (value: V) => void;
  reject: (error: Error) => void;
  registeredAt: number;
  timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  settled: boolean;
}

interface BufferedValue<V> {
  value: V;
  arrivedAt: number;
}

const BUFFER_GRACE_MS = 1000;

export interface CorrelationScope<K, V> {
  expectResponse(correlationKey: K, timeoutMs: number): void;
  awaitResponse(correlationKey: K): Promise<V>;
  hasPending(correlationKey: K): boolean;
  pendingCount(): number;
  oldestPendingAge(): number | undefined;
  close(): void;
}

export class DefaultCorrelationScope<K, V> implements CorrelationScope<K, V> {
  private readonly channel: OrcChannel<V>;
  private readonly keyExtractor: (value: V) => K;
  private readonly speedMultiplier: SpeedMultiplier;
  private readonly pending = new Map<K, PendingCorrelation<K, V>>();
  private readonly earlyArrivals = new Map<K, BufferedValue<V>>();
  private readonly evictionTimer: ReturnType<typeof setInterval>;
  private closed = false;
  private listenerRunning = false;

  constructor(
    channel: OrcChannel<V>,
    keyExtractor: (value: V) => K,
    speedMultiplier?: SpeedMultiplier,
  ) {
    this.channel = channel;
    this.keyExtractor = keyExtractor;
    this.speedMultiplier = speedMultiplier ?? new DefaultSpeedMultiplier();
    this.evictionTimer = setInterval(() => this.evictStaleBuffer(), BUFFER_GRACE_MS);
    this.startListenerLoop();
  }

  expectResponse(correlationKey: K, timeoutMs: number): void {
    if (this.closed) throw new Error('CorrelationScope is closed');

    const realTimeoutMs = this.speedMultiplier.adjustDelay(timeoutMs);

    const pc: PendingCorrelation<K, V> = {
      key: correlationKey,
      resolve: undefined!,
      reject: undefined!,
      registeredAt: Date.now(),
      timeoutTimer: undefined,
      settled: false,
    };

    const promise = new Promise<V>((resolve, reject) => {
      pc.resolve = resolve;
      pc.reject = reject;
    });
    promise.catch(() => {});
    (pc as PendingCorrelation<K, V> & { promise: Promise<V> }).promise = promise;

    if (this.pending.has(correlationKey)) {
      throw new Error(`Correlation key already pending: ${correlationKey}`);
    }
    this.pending.set(correlationKey, pc);

    pc.timeoutTimer = setTimeout(() => {
      const removed = this.pending.get(correlationKey);
      if (removed && !removed.settled) {
        removed.settled = true;
        this.pending.delete(correlationKey);
        removed.reject(new CorrelationTimeoutError(correlationKey, timeoutMs));
      }
    }, realTimeoutMs);

    if (this.closed) {
      const removed = this.pending.get(correlationKey);
      if (removed) {
        this.pending.delete(correlationKey);
        if (removed.timeoutTimer) clearTimeout(removed.timeoutTimer);
        removed.settled = true;
        removed.reject(new Error('CorrelationScope closed during registration'));
      }
      throw new Error('CorrelationScope closed during registration');
    }

    const buffered = this.earlyArrivals.get(correlationKey);
    if (buffered) {
      this.earlyArrivals.delete(correlationKey);
      if (pc.timeoutTimer) clearTimeout(pc.timeoutTimer);
      pc.settled = true;
      pc.resolve(buffered.value);
    }
  }

  awaitResponse(correlationKey: K): Promise<V> {
    const pc = this.pending.get(correlationKey) as
      (PendingCorrelation<K, V> & { promise: Promise<V> }) | undefined;
    if (!pc) {
      return Promise.reject(new Error(`No pending correlation for key: ${correlationKey}`));
    }
    return pc.promise.finally(() => {
      this.pending.delete(correlationKey);
    });
  }

  hasPending(correlationKey: K): boolean {
    const pc = this.pending.get(correlationKey);
    return pc != null && !pc.settled;
  }

  pendingCount(): number {
    return this.pending.size;
  }

  oldestPendingAge(): number | undefined {
    const now = Date.now();
    let oldest = Infinity;
    for (const pc of this.pending.values()) {
      if (!pc.settled) {
        oldest = Math.min(oldest, pc.registeredAt);
      }
    }
    if (oldest === Infinity) return undefined;
    return now - oldest;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;

    for (const pc of this.pending.values()) {
      if (!pc.settled) {
        pc.settled = true;
        pc.reject(new Error('CorrelationScope closed'));
      }
      if (pc.timeoutTimer) clearTimeout(pc.timeoutTimer);
    }
    this.pending.clear();
    this.earlyArrivals.clear();

    clearInterval(this.evictionTimer);
  }

  private startListenerLoop(): void {
    if (this.listenerRunning) return;
    this.listenerRunning = true;
    void this.listenerLoop();
  }

  private async listenerLoop(): Promise<void> {
    while (!this.closed) {
      let value: V;
      try {
        value = await this.channel.receive();
      } catch (e) {
        if (e instanceof ChannelClosedError) {
          const cause = (e as ChannelClosedError).cause instanceof Error
            ? (e as ChannelClosedError).cause as Error : e;
          this.failAllPending(cause);
          return;
        }
        return;
      }
      if (value === undefined || value === null) return;

      let key: K;
      try {
        key = this.keyExtractor(value);
      } catch {
        continue;
      }
      if (key === undefined || key === null) continue;

      const pc = this.pending.get(key);
      if (pc && !pc.settled) {
        if (pc.timeoutTimer) clearTimeout(pc.timeoutTimer);
        pc.settled = true;
        pc.resolve(value);
      } else {
        this.earlyArrivals.set(key, { value, arrivedAt: Date.now() });
      }
    }
  }

  private failAllPending(cause: Error): void {
    for (const pc of this.pending.values()) {
      if (!pc.settled) {
        pc.settled = true;
        pc.reject(cause);
      }
      if (pc.timeoutTimer) clearTimeout(pc.timeoutTimer);
    }
    this.pending.clear();
  }

  private evictStaleBuffer(): void {
    const now = Date.now();
    for (const [key, entry] of this.earlyArrivals) {
      if (now - entry.arrivedAt > BUFFER_GRACE_MS) {
        this.earlyArrivals.delete(key);
      }
    }
  }
}

export function correlationScopeForScope<K, V>(
  scope: ScenarioScope,
  name: string,
  keyExtractor: (value: V) => K,
): DefaultCorrelationScope<K, V> {
  const channel = scope.channel<V>(name + '.correlation');
  const sm = 'speedMultiplier' in scope && typeof scope.speedMultiplier === 'function'
    ? (scope as { speedMultiplier(): SpeedMultiplier }).speedMultiplier()
    : undefined;
  const cs = new DefaultCorrelationScope<K, V>(channel, keyExtractor, sm);
  if (scope instanceof DefaultScenarioScope) {
    scope.registerPrimitive(name, cs);
  }
  return cs;
}
