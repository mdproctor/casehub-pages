import { describe, it, expect, vi } from 'vitest';
import { emitPagesEvent, onPagesEvent, PagesEventDetail } from './events.js';

describe('emitPagesEvent', () => {
  it('dispatches pages-event CustomEvent with topic and payload', () => {
    const target = new EventTarget();
    const handler = vi.fn();
    target.addEventListener('pages-event', handler);

    emitPagesEvent(target, 'test-topic', { value: 42 });

    expect(handler).toHaveBeenCalledOnce();
    const event = handler.mock.calls[0][0] as CustomEvent<PagesEventDetail>;
    expect(event.detail.topic).toBe('test-topic');
    expect(event.detail.payload).toEqual({ value: 42 });
    expect(event.bubbles).toBe(true);
    expect(event.composed).toBe(true);
  });
});

describe('onPagesEvent', () => {
  it('filters by exact topic', () => {
    const target = new EventTarget();
    const handler = vi.fn();
    onPagesEvent(target, 'my-topic', handler);

    emitPagesEvent(target, 'my-topic', 'hello');
    emitPagesEvent(target, 'other-topic', 'ignored');

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith('hello');
  });

  it('supports wildcard pattern matching', () => {
    const target = new EventTarget();
    const handler = vi.fn();
    onPagesEvent(target, 'debate:**', handler);

    emitPagesEvent(target, 'debate:abc', 'a');
    emitPagesEvent(target, 'debate:abc:def', 'b');
    emitPagesEvent(target, 'other:topic', 'ignored');

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith('a');
    expect(handler).toHaveBeenCalledWith('b');
  });

  it('returns unsubscribe function', () => {
    const target = new EventTarget();
    const handler = vi.fn();
    const unsub = onPagesEvent(target, 'topic', handler);

    emitPagesEvent(target, 'topic', 'first');
    unsub();
    emitPagesEvent(target, 'topic', 'second');

    expect(handler).toHaveBeenCalledOnce();
  });
});
