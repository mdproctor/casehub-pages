import type { Action, Result, ServiceRegistry } from './walker.js';
import { stepSuccess, stepFailure } from './walker.js';
import type { ScenarioScope } from '../orchestration/types.js';
import { parseLoopDirective, parseRetryDirective } from '../orchestration/directives.js';
import { parseDuration } from '../orchestration/duration-parser.js';
import { isTruthy } from '../truthiness.js';
import { VariableResolver } from '../variable-resolver.js';
import type { ObjectVariableSource } from '../types.js';

export interface Context {
  readonly params: Record<string, unknown>;
  readonly services: ServiceRegistry;
  readonly scope: ScenarioScope;
  readonly stepName: string;
  readonly resolver: VariableResolver;
}

export function withResolver(ctx: Context, resolver: VariableResolver): Context {
  return { ...ctx, resolver };
}

export interface DecoratedExecution {
  execute(context: Context): Promise<Result>;
}

class CoreExecution implements DecoratedExecution {
  constructor(private readonly action: Action) {}
  async execute(context: Context): Promise<Result> {
    return this.action.execute(context.params, context.services);
  }
}

class WhenDecorator implements DecoratedExecution {
  constructor(
    private readonly next: DecoratedExecution,
    private readonly condition: string,
  ) {}
  async execute(context: Context): Promise<Result> {
    const resolved = context.resolver.resolveString(this.condition, 'when-guard');
    if (!isTruthy(resolved)) {
      return stepSuccess({});
    }
    return this.next.execute(context);
  }
}

class ForEachDecorator implements DecoratedExecution {
  constructor(
    private readonly next: DecoratedExecution,
    private readonly raw: unknown,
  ) {}
  async execute(context: Context): Promise<Result> {
    if (typeof this.raw !== 'object' || this.raw === null) {
      return stepFailure("forEach must be a map with 'in' and 'as' keys");
    }
    const spec = this.raw as Record<string, unknown>;
    const inVal = spec['in'];
    const as = (spec['as'] as string) ?? 'item';
    const parallel = spec['parallel'] === true;

    let items: unknown[];
    if (Array.isArray(inVal)) {
      items = inVal;
    } else {
      const resolved = context.resolver.resolve(String(inVal ?? ''));
      if (!Array.isArray(resolved)) {
        return stepFailure("forEach 'in' did not resolve to a list");
      }
      items = resolved;
    }
    if (items.length === 0) return stepSuccess({});

    if (parallel) {
      return this.executeParallel(items, as, context);
    }
    return this.executeSequential(items, as, context);
  }

  private async executeSequential(items: unknown[], as: string, ctx: Context): Promise<Result> {
    let last: Result = stepSuccess({});
    for (let i = 0; i < items.length; i++) {
      const scoped = pushEachContext(ctx.resolver, as, items[i], i);
      last = await this.next.execute(withResolver(ctx, scoped));
      if (last.kind === 'failure') return last;
    }
    return last;
  }

  private async executeParallel(items: unknown[], as: string, ctx: Context): Promise<Result> {
    const promises = items.map((item, i) => {
      const scoped = pushEachContext(ctx.resolver, as, item, i);
      return this.next.execute(withResolver(ctx, scoped));
    });
    const results = await Promise.all(promises);
    for (const r of results) {
      if (r.kind === 'failure') return r;
    }
    return results[results.length - 1]!;
  }
}

function pushEachContext(resolver: VariableResolver, as: string, item: unknown, index: number): VariableResolver {
  const eachSource: ObjectVariableSource = {
    resolve(name: string): unknown {
      if (name === 'index') return index;
      if (name === as) return item;
      if (typeof item === 'object' && item !== null) {
        const prefix = as + '.';
        if (name.startsWith(prefix)) return (item as Record<string, unknown>)[name.substring(prefix.length)];
      }
      return undefined;
    },
    allowContainerReturn() { return true; },
  };
  return resolver.withObjectScope('each', eachSource);
}

class LoopDecorator implements DecoratedExecution {
  constructor(
    private readonly next: DecoratedExecution,
    private readonly raw: unknown,
  ) {}
  async execute(context: Context): Promise<Result> {
    const directive = parseLoopDirective(this.raw);
    const maxIterations = 'count' in directive ? directive.count : 1000;
    const untilCondition = 'until' in directive ? directive.until : null;

    let lastResult: Result = stepSuccess({});
    for (let i = 0; i < maxIterations; i++) {
      lastResult = await this.next.execute(context);
      if (lastResult.kind === 'failure') return lastResult;

      if (untilCondition != null) {
        const resolved = context.resolver.resolveString(untilCondition, 'loop-until');
        if (isTruthy(resolved)) return lastResult;
      }
    }
    return lastResult;
  }
}

class RetryDecorator implements DecoratedExecution {
  constructor(
    private readonly next: DecoratedExecution,
    private readonly raw: unknown,
  ) {}
  async execute(context: Context): Promise<Result> {
    const directive = parseRetryDirective(this.raw);
    const speed = context.scope.speedMultiplier().currentSpeed();
    let lastResult: Result = stepFailure('no attempts');
    for (let attempt = 0; attempt < directive.max; attempt++) {
      if (attempt > 0 && directive.type === 'full' && directive.delayMs > 0) {
        const delayMs = computeDelay(directive.delayMs, directive.backoff, attempt - 1);
        const adjustedMs = Math.max(1, Math.round(delayMs / speed));
        await sleep(adjustedMs);
      }
      lastResult = await this.next.execute(context);
      if (lastResult.kind === 'success') return lastResult;
    }
    return lastResult;
  }
}

function computeDelay(baseMs: number, backoff: string, attempt: number): number {
  switch (backoff) {
    case 'exponential':
      return baseMs * (1 << attempt);
    case 'exponential-with-jitter': {
      const exp = baseMs * (1 << attempt);
      return exp + Math.random() * exp;
    }
    default:
      return baseMs;
  }
}

class TimeoutDecorator implements DecoratedExecution {
  constructor(
    private readonly next: DecoratedExecution,
    private readonly raw: unknown,
  ) {}
  async execute(context: Context): Promise<Result> {
    const ms = typeof this.raw === 'number' ? this.raw : parseDuration(String(this.raw));
    const speed = context.scope.speedMultiplier().currentSpeed();
    const adjustedMs = Math.max(1, Math.round(ms / speed));
    const deadlineScope = context.scope.withDeadline(adjustedMs);
    const deadlineCtx: Context = { ...context, scope: deadlineScope };
    const timeoutPromise = new Promise<Result>((resolve) =>
      setTimeout(() => resolve(stepFailure(`Step '${context.stepName}' exceeded timeout of ${ms}ms`)), adjustedMs),
    );
    return Promise.race([this.next.execute(deadlineCtx), timeoutPromise]);
  }
}

class WaitDecorator implements DecoratedExecution {
  constructor(
    private readonly next: DecoratedExecution,
    private readonly signalName: string,
  ) {}
  async execute(context: Context): Promise<Result> {
    const signal = context.scope.signal(this.signalName);
    const remaining = context.scope.remainingTime();
    if (remaining != null) {
      const acquired = await signal.await(remaining);
      if (!acquired) {
        return stepFailure(`Wait for signal '${this.signalName}' exceeded deadline`);
      }
    } else {
      await signal.await();
    }
    const payload = signal.payload();
    if (payload != null && typeof payload === 'object') {
      const scoped = context.resolver.withScope('signal', (key) => {
        const val = (payload as Record<string, unknown>)[key];
        return val !== undefined ? String(val) : undefined;
      });
      return this.next.execute(withResolver(context, scoped));
    }
    return this.next.execute(context);
  }
}

class OnErrorDecorator implements DecoratedExecution {
  constructor(
    private readonly next: DecoratedExecution,
    private readonly fallbackStep: string,
  ) {}
  async execute(context: Context): Promise<Result> {
    let result: Result;
    try {
      result = await this.next.execute(context);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return stepSuccess({
        'on-error.caught': message,
        'on-error.fallback': this.fallbackStep,
      });
    }
    if (result.kind === 'failure') {
      return stepSuccess({
        'on-error.caught': result.message,
        'on-error.fallback': this.fallbackStep,
      });
    }
    return result;
  }
}

class DelayDecorator implements DecoratedExecution {
  constructor(
    private readonly next: DecoratedExecution,
    private readonly raw: unknown,
  ) {}
  async execute(context: Context): Promise<Result> {
    const ms = typeof this.raw === 'number' ? this.raw : parseDuration(String(this.raw));
    const speed = context.scope.speedMultiplier().currentSpeed();
    const adjustedMs = Math.max(1, Math.round(ms / speed));
    await sleep(adjustedMs);
    return this.next.execute(context);
  }
}

class SemaphoreDecorator implements DecoratedExecution {
  constructor(
    private readonly next: DecoratedExecution,
    private readonly name: string,
    private readonly permits: number,
  ) {}
  async execute(context: Context): Promise<Result> {
    const sem = context.scope.semaphore(this.name, this.permits);
    const remaining = context.scope.remainingTime();
    if (remaining != null) {
      const acquired = await sem.tryAcquire(remaining);
      if (!acquired) {
        return stepFailure(`Semaphore '${this.name}' acquire exceeded deadline`);
      }
    } else {
      await sem.acquire();
    }
    try {
      return await this.next.execute(context);
    } catch (e) {
      return stepFailure(e instanceof Error ? e.message : String(e));
    } finally {
      sem.release();
    }
  }
}

class PostSignalDecorator implements DecoratedExecution {
  constructor(
    private readonly next: DecoratedExecution,
    private readonly signalName: string | null,
    private readonly publishSpec: Record<string, unknown> | null,
  ) {}
  async execute(context: Context): Promise<Result> {
    const result = await this.next.execute(context);
    if (result.kind !== 'success') return result;

    if (this.signalName != null) {
      context.scope.signal(this.signalName).signal(result.output);
    }
    if (this.publishSpec != null) {
      const channelName = String(this.publishSpec['channel']);
      const channel = context.scope.channel<unknown>(channelName);
      const data = this.publishSpec['data'] != null
        ? context.resolver.resolve(this.publishSpec['data'])
        : result.output;
      await channel.send(data);
    }
    return result;
  }
}

class TransitionDecorator implements DecoratedExecution {
  constructor(
    private readonly next: DecoratedExecution,
    private readonly raw: unknown,
  ) {}
  async execute(context: Context): Promise<Result> {
    const result = await this.next.execute(context);
    if (result.kind !== 'success') return result;
    if (typeof this.raw !== 'object' || this.raw === null) {
      return stepFailure("'transition' must be a map with 'machine' and 'event' or 'from'/'to' keys");
    }
    const spec = this.raw as Record<string, unknown>;
    const machineName = spec['machine'] as string | undefined;
    const from = spec['from'] as string | undefined;
    const to = spec['to'] as string | undefined;

    if (!machineName) return stepFailure("'transition' requires 'machine'");

    if (from && to) {
      const sm = context.scope.stateMachine(machineName, [from, to], from);
      sm.transition(from, to);
    }
    return result;
  }
}

class TransformDecorator implements DecoratedExecution {
  constructor(
    private readonly next: DecoratedExecution,
    private readonly raw: unknown,
  ) {}
  async execute(context: Context): Promise<Result> {
    const result = await this.next.execute(context);
    if (result.kind === 'success' && typeof this.raw === 'object' && this.raw !== null) {
      const additions = this.raw as Record<string, unknown>;
      return stepSuccess({ ...result.output, ...additions });
    }
    return result;
  }
}

class OnSuccessDecorator implements DecoratedExecution {
  constructor(
    private readonly next: DecoratedExecution,
    private readonly handler: string,
  ) {}
  async execute(context: Context): Promise<Result> {
    const result = await this.next.execute(context);
    if (result.kind === 'success') {
      return {
        ...result,
        executionMetadata: { ...result.executionMetadata, 'on-success': this.handler },
      };
    }
    return result;
  }
}

class OnFailureDecorator implements DecoratedExecution {
  constructor(
    private readonly next: DecoratedExecution,
    private readonly handler: string,
  ) {}
  async execute(context: Context): Promise<Result> {
    const result = await this.next.execute(context);
    if (result.kind === 'failure') {
      return stepSuccess({
        '__failure': result.message,
        '__on-failure': this.handler,
      });
    }
    return result;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseSemaphoreSpec(raw: unknown): { name: string; permits: number } {
  if (typeof raw === 'string') return { name: raw, permits: 1 };
  if (typeof raw === 'object' && raw !== null) {
    const map = raw as Record<string, unknown>;
    return {
      name: String(map['name']),
      permits: typeof map['permits'] === 'number' ? map['permits'] : 1,
    };
  }
  return { name: String(raw), permits: 1 };
}

export class DecoratorChain {
  static build(
    decorators: Record<string, unknown>,
    action: Action,
  ): DecoratedExecution {
    let execution: DecoratedExecution = new CoreExecution(action);

    if (decorators['on-success'] != null) {
      execution = new OnSuccessDecorator(execution, String(decorators['on-success']));
    }
    if (decorators['on-failure'] != null) {
      execution = new OnFailureDecorator(execution, String(decorators['on-failure']));
    }
    if (decorators['transform'] != null) {
      execution = new TransformDecorator(execution, decorators['transform']);
    }
    if (decorators['transition'] != null) {
      execution = new TransitionDecorator(execution, decorators['transition']);
    }
    const signalName = decorators['signal'] != null ? String(decorators['signal']) : null;
    const publishSpec = decorators['publish'] != null && typeof decorators['publish'] === 'object'
      ? decorators['publish'] as Record<string, unknown>
      : null;
    if (signalName != null || publishSpec != null) {
      execution = new PostSignalDecorator(execution, signalName, publishSpec);
    }
    if (decorators['delay'] != null) {
      execution = new DelayDecorator(execution, decorators['delay']);
    }
    const semRaw = decorators['semaphore'];
    const mutexRaw = decorators['mutex'];
    if (semRaw != null || mutexRaw != null) {
      if (mutexRaw != null) {
        execution = new SemaphoreDecorator(execution, String(mutexRaw), 1);
      } else {
        const spec = parseSemaphoreSpec(semRaw);
        execution = new SemaphoreDecorator(execution, spec.name, spec.permits);
      }
    }
    if (decorators['retry'] != null) {
      execution = new RetryDecorator(execution, decorators['retry']);
    }
    if (decorators['wait'] != null) {
      execution = new WaitDecorator(execution, String(decorators['wait']));
    }
    if (decorators['timeout'] != null) {
      execution = new TimeoutDecorator(execution, decorators['timeout']);
    }
    if (decorators['on-error'] != null) {
      execution = new OnErrorDecorator(execution, String(decorators['on-error']));
    }
    if (decorators['loop'] != null) {
      execution = new LoopDecorator(execution, decorators['loop']);
    }
    if (decorators['forEach'] != null) {
      execution = new ForEachDecorator(execution, decorators['forEach']);
    }
    if (decorators['if'] != null) {
      execution = new WhenDecorator(execution, String(decorators['if']));
    }

    return execution;
  }
}
