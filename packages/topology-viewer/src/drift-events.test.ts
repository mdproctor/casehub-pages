import { describe, it, expect, vi } from 'vitest';
import { DriftStatus } from './types.js';
import { subscribeDriftEvents } from './drift-events.js';

function emitPagesEvent<T>(target: EventTarget, topic: string, payload: T): void {
  target.dispatchEvent(new CustomEvent('pages-event', {
    bubbles: true,
    composed: true,
    detail: { topic, payload },
  }));
}

describe('subscribeDriftEvents', () => {
  it('calls onNodeUpdate with PERMITTED_DRIFT on granted event', () => {
    const target = new EventTarget();
    const onNodeUpdate = vi.fn();

    subscribeDriftEvents(target, { onNodeUpdate });

    emitPagesEvent(target, 'drift:exemption:granted', {
      deviceId: 'device-42',
      triggerSource: 'MOTION',
      exemptUntil: '2026-10-10T12:00:00Z',
    });

    expect(onNodeUpdate).toHaveBeenCalledWith('device-42', {
      driftStatus: DriftStatus.PERMITTED_DRIFT,
      triggerSource: 'MOTION',
      exemptUntil: '2026-10-10T12:00:00Z',
    });
  });

  it('calls onNodeUpdate with NORMAL on revoked event', () => {
    const target = new EventTarget();
    const onNodeUpdate = vi.fn();

    subscribeDriftEvents(target, { onNodeUpdate });

    emitPagesEvent(target, 'drift:exemption:revoked', {
      deviceId: 'device-42',
    });

    expect(onNodeUpdate).toHaveBeenCalledWith('device-42', {
      driftStatus: DriftStatus.NORMAL,
    });
  });

  it('unsubscribe stops both listeners', () => {
    const target = new EventTarget();
    const onNodeUpdate = vi.fn();

    const unsub = subscribeDriftEvents(target, { onNodeUpdate });
    unsub();

    emitPagesEvent(target, 'drift:exemption:granted', {
      deviceId: 'device-42',
      triggerSource: 'MOTION',
      exemptUntil: '2026-10-10T12:00:00Z',
    });

    emitPagesEvent(target, 'drift:exemption:revoked', {
      deviceId: 'device-42',
    });

    expect(onNodeUpdate).not.toHaveBeenCalled();
  });

  it('ignores unrelated pages-event topics', () => {
    const target = new EventTarget();
    const onNodeUpdate = vi.fn();

    subscribeDriftEvents(target, { onNodeUpdate });

    emitPagesEvent(target, 'filter:status', { value: 'active' });
    emitPagesEvent(target, 'drift:something:else', { deviceId: 'x' });

    expect(onNodeUpdate).not.toHaveBeenCalled();
  });
});
