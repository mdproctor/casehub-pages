import { describe, it, expect } from 'vitest';
import { DefaultCorrelationScope, CorrelationTimeoutError, correlationScopeForScope } from './correlation-scope.js';
import { DefaultOrcChannel } from './channel.js';
import { DefaultScenarioScope } from './scenario-scope.js';
import type { SpeedMultiplier } from './speed-multiplier.js';
import { FixedSpeedMultiplier } from './speed-multiplier.js';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('CorrelationScope', () => {
  it('expect then send — awaitResponse returns value', async () => {
    const ch = new DefaultOrcChannel<string>();
    const cs = new DefaultCorrelationScope(ch, (v) => v.split(':')[0]);

    cs.expectResponse('order-1', 5000);
    void ch.send('order-1:payload');

    const result = await cs.awaitResponse('order-1');
    expect(result).toBe('order-1:payload');
    expect(cs.pendingCount()).toBe(0);

    cs.close();
  });

  it('multiple keys routed correctly', async () => {
    const ch = new DefaultOrcChannel<string>();
    const cs = new DefaultCorrelationScope(ch, (v) => v.split(':')[0]);

    cs.expectResponse('a', 5000);
    cs.expectResponse('b', 5000);

    void ch.send('b:second');
    void ch.send('a:first');

    const [a, b] = await Promise.all([
      cs.awaitResponse('a'),
      cs.awaitResponse('b'),
    ]);
    expect(a).toBe('a:first');
    expect(b).toBe('b:second');

    cs.close();
  });

  it('duplicate key throws', () => {
    const ch = new DefaultOrcChannel<string>();
    const cs = new DefaultCorrelationScope(ch, (v) => v);
    cs.expectResponse('key', 5000);

    expect(() => cs.expectResponse('key', 5000)).toThrow(/already pending/);

    cs.close();
  });

  it('timeout throws CorrelationTimeoutError', async () => {
    const ch = new DefaultOrcChannel<string>();
    const cs = new DefaultCorrelationScope(ch, (v) => v);
    cs.expectResponse('key', 50);

    await expect(cs.awaitResponse('key')).rejects.toThrow(CorrelationTimeoutError);

    cs.close();
  });

  it('close cancels all pending', async () => {
    const ch = new DefaultOrcChannel<string>();
    const cs = new DefaultCorrelationScope(ch, (v) => v);
    cs.expectResponse('key', 30_000);

    const promise = cs.awaitResponse('key');
    await delay(20);
    cs.close();

    await expect(promise).rejects.toThrow(/closed/);
  });

  it('pendingCount tracks registrations', () => {
    const ch = new DefaultOrcChannel<string>();
    const cs = new DefaultCorrelationScope(ch, (v) => v);

    expect(cs.pendingCount()).toBe(0);
    cs.expectResponse('a', 5000);
    expect(cs.pendingCount()).toBe(1);
    cs.expectResponse('b', 5000);
    expect(cs.pendingCount()).toBe(2);

    cs.close();
  });

  it('oldestPendingAge returns undefined when no pending', () => {
    const ch = new DefaultOrcChannel<string>();
    const cs = new DefaultCorrelationScope(ch, (v) => v);
    expect(cs.oldestPendingAge()).toBeUndefined();
    cs.close();
  });

  it('oldestPendingAge returns milliseconds when pending', async () => {
    const ch = new DefaultOrcChannel<string>();
    const cs = new DefaultCorrelationScope(ch, (v) => v);
    cs.expectResponse('key', 30_000);
    await delay(20);
    const age = cs.oldestPendingAge();
    expect(age).toBeDefined();
    expect(age!).toBeGreaterThanOrEqual(15);
    cs.close();
  });

  it('hasPending tracks state', async () => {
    const ch = new DefaultOrcChannel<string>();
    const cs = new DefaultCorrelationScope(ch, (v) => v);

    expect(cs.hasPending('key')).toBe(false);
    cs.expectResponse('key', 5000);
    expect(cs.hasPending('key')).toBe(true);

    void ch.send('key');
    await cs.awaitResponse('key');
    expect(cs.hasPending('key')).toBe(false);

    cs.close();
  });

  it('close is idempotent', () => {
    const ch = new DefaultOrcChannel<string>();
    const cs = new DefaultCorrelationScope(ch, (v) => v);
    cs.close();
    cs.close();
  });

  it('expectResponse on closed scope throws', () => {
    const ch = new DefaultOrcChannel<string>();
    const cs = new DefaultCorrelationScope(ch, (v) => v);
    cs.close();

    expect(() => cs.expectResponse('key', 1000)).toThrow(/closed/);
  });

  it('channel error close fails all pending with cause', async () => {
    const ch = new DefaultOrcChannel<string>();
    const cs = new DefaultCorrelationScope(ch, (v) => v);
    cs.expectResponse('key', 30_000);

    const promise = cs.awaitResponse('key');
    await delay(20);
    ch.close(new Error('upstream failure'));

    await expect(promise).rejects.toThrow(/upstream failure/);

    cs.close();
  });

  it('extractor throws — message dropped, listener continues', async () => {
    let callCount = 0;
    const ch = new DefaultOrcChannel<string>();
    const cs = new DefaultCorrelationScope(ch, (v) => {
      callCount++;
      if (callCount === 1) throw new Error('bad message');
      return v.split(':')[0];
    });

    cs.expectResponse('good', 5000);
    void ch.send('bad-message');
    void ch.send('good:payload');

    const result = await cs.awaitResponse('good');
    expect(result).toBe('good:payload');

    cs.close();
  });

  it('extractor returns undefined — message dropped, listener continues', async () => {
    const ch = new DefaultOrcChannel<string>();
    const cs = new DefaultCorrelationScope<string | undefined, string>(ch, (v) =>
      v.startsWith('null') ? undefined : v,
    );

    cs.expectResponse('valid', 5000);
    void ch.send('null-value');
    void ch.send('valid');

    const result = await cs.awaitResponse('valid');
    expect(result).toBe('valid');

    cs.close();
  });

  it('speedMultiplier affects timeout', async () => {
    const ch = new DefaultOrcChannel<string>();
    const fast: SpeedMultiplier = new FixedSpeedMultiplier(10);
    const cs = new DefaultCorrelationScope(ch, (v) => v, fast);

    const start = Date.now();
    cs.expectResponse('key', 1000);

    await expect(cs.awaitResponse('key')).rejects.toThrow(CorrelationTimeoutError);

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);

    cs.close();
  });

  it('early arrival completes immediately', async () => {
    const ch = new DefaultOrcChannel<string>();
    const cs = new DefaultCorrelationScope(ch, (v) => v.split(':')[0]);

    void ch.send('key:early-payload');
    await delay(50);

    cs.expectResponse('key', 5000);
    const result = await cs.awaitResponse('key');
    expect(result).toBe('key:early-payload');

    cs.close();
  });

  it('forScope registers as primitive', () => {
    const scope = new DefaultScenarioScope();
    const cs = correlationScopeForScope<string, string>(scope, 'test-corr', (v) => v);

    expect(scope.primitive('test-corr', DefaultCorrelationScope as never)).toBe(cs);

    cs.close();
    scope.close();
  });

  it('forScope — scope close cascades to correlation scope', async () => {
    const scope = new DefaultScenarioScope();
    const cs = correlationScopeForScope<string, string>(scope, 'test-corr', (v) => v);

    cs.expectResponse('key', 30_000);
    const promise = cs.awaitResponse('key');

    await delay(20);
    scope.close();

    await expect(promise).rejects.toThrow();
  });
});
