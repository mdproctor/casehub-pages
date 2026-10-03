import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createScenarioHandler } from './scenario-handler.js';
import type { EventConnection } from '@casehubio/pages-data';

function mockConnection(): EventConnection & { sent: object[]; commandResults: object[] } {
  const sent: object[] = [];
  return {
    sent,
    get commandResults() {
      return sent.filter((m) => (m as Record<string, unknown>).op === 'command-result');
    },
    send(msg: object) { sent.push(msg); },
    listen: vi.fn().mockResolvedValue({ topics: ['scenario:exec'] }),
    unlisten: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
    get connected() { return true; },
    get status() { return 'connected' as const; },
  };
}

function fireCommand(target: EventTarget, data: Record<string, unknown>): void {
  target.dispatchEvent(new CustomEvent('pages-event', {
    detail: { topic: 'scenario:exec', payload: data },
  }));
}

describe('ScenarioHandler', () => {
  let eventTarget: EventTarget;

  beforeEach(() => {
    eventTarget = new EventTarget();
  });

  it('subscribes to scenario:exec on creation', async () => {
    const conn = mockConnection();
    const handler = createScenarioHandler(conn, eventTarget);
    expect(conn.listen).toHaveBeenCalledWith(['scenario:exec']);
    handler.dispose();
  });

  it('executes click command and sends ok result', async () => {
    vi.useFakeTimers();
    const conn = mockConnection();
    const handler = createScenarioHandler(conn, eventTarget);

    const button = document.createElement('button');
    button.setAttribute('role', 'button');
    button.setAttribute('aria-label', 'Submit');
    document.body.appendChild(button);

    const clicked = vi.fn();
    button.addEventListener('click', clicked);

    fireCommand(eventTarget, {
      id: 'cmd-1',
      action: 'click',
      target: { role: 'button', name: 'Submit' },
    });

    await vi.advanceTimersByTimeAsync(1000);

    expect(clicked).toHaveBeenCalled();
    expect(conn.commandResults).toHaveLength(1);
    expect(conn.commandResults[0]).toEqual({
      op: 'command-result',
      id: 'cmd-1',
      ok: true,
      error: null,
    });

    document.body.removeChild(button);
    handler.dispose();
    vi.useRealTimers();
  });

  it('executes fill command', async () => {
    const conn = mockConnection();
    const handler = createScenarioHandler(conn, eventTarget);

    const input = document.createElement('input');
    input.setAttribute('role', 'textbox');
    input.setAttribute('aria-label', 'Name');
    document.body.appendChild(input);

    fireCommand(eventTarget, {
      id: 'cmd-2',
      action: 'fill',
      target: { role: 'textbox', name: 'Name' },
      value: 'Alice',
    });

    await vi.waitFor(() => {
      expect(input.value).toBe('Alice');
    });

    await vi.waitFor(() => {
      expect(conn.commandResults).toHaveLength(1);
    });
    expect(conn.commandResults[0]).toEqual({
      op: 'command-result',
      id: 'cmd-2',
      ok: true,
      error: null,
    });

    document.body.removeChild(input);
    handler.dispose();
  });

  it('sends error result when target not found', () => {
    const conn = mockConnection();
    const handler = createScenarioHandler(conn, eventTarget);

    fireCommand(eventTarget, {
      id: 'cmd-3',
      action: 'click',
      target: { role: 'button', name: 'Nonexistent' },
    });

    expect(conn.commandResults).toHaveLength(1);
    expect(conn.commandResults[0]).toMatchObject({
      op: 'command-result',
      id: 'cmd-3',
      ok: false,
    });
    expect((conn.commandResults[0] as Record<string, unknown>).error).toContain('Nonexistent');

    handler.dispose();
  });

  it('sends error for unknown action', () => {
    const conn = mockConnection();
    const handler = createScenarioHandler(conn, eventTarget);

    fireCommand(eventTarget, {
      id: 'cmd-4',
      action: 'hover',
      target: { role: 'button', name: 'X' },
    });

    expect(conn.commandResults[0]).toMatchObject({
      op: 'command-result',
      id: 'cmd-4',
      ok: false,
    });
    expect((conn.commandResults[0] as Record<string, unknown>).error).toContain('hover');

    handler.dispose();
  });

  it('executes ready action — no-op that confirms handler is active', () => {
    const conn = mockConnection();
    const handler = createScenarioHandler(conn, eventTarget);

    fireCommand(eventTarget, {
      id: 'cmd-ready',
      action: 'ready',
    });

    expect(conn.commandResults).toHaveLength(1);
    expect(conn.commandResults[0]).toEqual({
      op: 'command-result',
      id: 'cmd-ready',
      ok: true,
      error: null,
    });

    handler.dispose();
  });

  it('ignores non-scenario:exec topics', () => {
    const conn = mockConnection();
    const handler = createScenarioHandler(conn, eventTarget);

    eventTarget.dispatchEvent(new CustomEvent('pages-event', {
      detail: { topic: 'data/update', payload: { id: 'x' } },
    }));

    eventTarget.dispatchEvent(new CustomEvent('pages-event', {
      detail: { topic: 'scenario/old-format', payload: { id: 'y', action: 'click' } },
    }));

    expect(conn.commandResults).toHaveLength(0);
    handler.dispose();
  });

  it('unlistens on dispose', () => {
    const conn = mockConnection();
    const handler = createScenarioHandler(conn, eventTarget);
    handler.dispose();
    expect(conn.unlisten).toHaveBeenCalledWith(['scenario:exec']);
  });
});

describe('ScenarioHandler sequence protocol', () => {
  let eventTarget: EventTarget;

  beforeEach(() => {
    eventTarget = new EventTarget();
  });

  it('sends executor-register on creation', () => {
    const conn = mockConnection();
    createScenarioHandler(conn, eventTarget);
    const reg = conn.sent.find(
      (m) => (m as Record<string, unknown>).op === 'executor-register');
    expect(reg).toBeDefined();
    expect((reg as Record<string, unknown>).name).toBe('browser');
  });

  it('executes dispatch-sequence steps and sends step-result', async () => {
    const conn = mockConnection();
    createScenarioHandler(conn, eventTarget);

    eventTarget.dispatchEvent(new CustomEvent('scenario-dispatch', {
      detail: {
        op: 'dispatch-sequence',
        sessionId: 's-001',
        steps: [{
          name: 'ready-step',
          label: 'Ready check',
          action: 'ready',
          params: {},
        }],
        speed: 1.0,
        paused: false,
      },
    }));

    await vi.waitFor(() => {
      const results = conn.sent.filter(
        (m) => (m as Record<string, unknown>).op === 'step-result');
      expect(results).toHaveLength(1);
    });

    const result = conn.sent.find(
      (m) => (m as Record<string, unknown>).op === 'step-result') as Record<string, unknown>;
    expect(result.stepName).toBe('ready-step');
    expect(result.sessionId).toBe('s-001');
    expect(result.ok).toBe(true);
  });

  it('executes multiple steps in sequence', async () => {
    const conn = mockConnection();
    createScenarioHandler(conn, eventTarget);

    eventTarget.dispatchEvent(new CustomEvent('scenario-dispatch', {
      detail: {
        op: 'dispatch-sequence',
        sessionId: 's-001',
        steps: [
          { name: 'step-1', label: 'First', action: 'ready', params: {} },
          { name: 'step-2', label: 'Second', action: 'ready', params: {} },
        ],
        speed: 1000,
        paused: false,
      },
    }));

    await vi.waitFor(() => {
      const results = conn.sent.filter(
        (m) => (m as Record<string, unknown>).op === 'step-result');
      expect(results).toHaveLength(2);
    });

    const results = conn.sent
      .filter((m) => (m as Record<string, unknown>).op === 'step-result')
      .map((m) => (m as Record<string, unknown>).stepName);
    expect(results).toEqual(['step-1', 'step-2']);
  });

  it('pauses on executor-control pause', async () => {
    const conn = mockConnection();
    const handler = createScenarioHandler(conn, eventTarget);

    eventTarget.dispatchEvent(new CustomEvent('scenario-dispatch', {
      detail: {
        op: 'dispatch-sequence',
        sessionId: 's-001',
        steps: [
          { name: 'step-1', label: 'First', action: 'ready', params: {} },
          { name: 'step-2', label: 'Second', action: 'ready', params: {} },
        ],
        speed: 1000,
        paused: true,
      },
    }));

    // Paused — no step results should be sent yet (beyond what might execute before pause takes effect)
    await new Promise((r) => setTimeout(r, 50));
    const results = conn.sent.filter(
      (m) => (m as Record<string, unknown>).op === 'step-result');
    expect(results.length).toBeLessThanOrEqual(0);

    handler.dispose();
  });

  it('fill command in dispatch-sequence actually changes DOM value', async () => {
    const conn = mockConnection();
    createScenarioHandler(conn, eventTarget);

    const input = document.createElement('input');
    input.setAttribute('role', 'textbox');
    input.setAttribute('aria-label', 'Your name');
    document.body.appendChild(input);

    eventTarget.dispatchEvent(new CustomEvent('scenario-dispatch', {
      detail: {
        op: 'dispatch-sequence',
        sessionId: 's-fill',
        steps: [{
          name: 'fill-name',
          label: 'Fill name',
          action: 'fill',
          params: { role: 'textbox', name: 'Your name', value: 'Alice' },
        }],
        speed: 1000,
        paused: false,
      },
    }));

    await vi.waitFor(() => {
      const results = conn.sent.filter(
        (m) => (m as Record<string, unknown>).op === 'step-result');
      expect(results).toHaveLength(1);
    });

    expect(input.value).toBe('Alice');

    const result = conn.sent.find(
      (m) => (m as Record<string, unknown>).op === 'step-result') as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(result.stepName).toBe('fill-name');

    document.body.removeChild(input);
  });

  it('paused dispatch does not execute until step command', async () => {
    const conn = mockConnection();
    createScenarioHandler(conn, eventTarget);

    const input = document.createElement('input');
    input.setAttribute('role', 'textbox');
    input.setAttribute('aria-label', 'Test field');
    document.body.appendChild(input);

    eventTarget.dispatchEvent(new CustomEvent('scenario-dispatch', {
      detail: {
        op: 'dispatch-sequence',
        sessionId: 's-paused',
        steps: [{
          name: 'fill-paused',
          label: 'Fill paused',
          action: 'fill',
          params: { role: 'textbox', name: 'Test field', value: 'Stepped' },
        }],
        speed: 1000,
        paused: true,
      },
    }));

    await new Promise((r) => setTimeout(r, 100));
    expect(input.value).toBe('');

    eventTarget.dispatchEvent(new CustomEvent('scenario-control', {
      detail: {
        op: 'executor-control',
        sessionId: 's-paused',
        command: 'step',
      },
    }));

    await vi.waitFor(() => {
      expect(input.value).toBe('Stepped');
    });

    const result = conn.sent.find(
      (m) => (m as Record<string, unknown>).op === 'step-result') as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(result.stepName).toBe('fill-paused');

    document.body.removeChild(input);
  });

  it('reports error for failing command in step', async () => {
    const conn = mockConnection();
    createScenarioHandler(conn, eventTarget);

    eventTarget.dispatchEvent(new CustomEvent('scenario-dispatch', {
      detail: {
        op: 'dispatch-sequence',
        sessionId: 's-001',
        steps: [{
          name: 'fail-step',
          label: 'Will fail',
          action: 'click',
          params: { role: 'button', name: 'Nonexistent-Seq-Test' },
        }],
        speed: 1000,
        paused: false,
      },
    }));

    await vi.waitFor(() => {
      const results = conn.sent.filter(
        (m) => (m as Record<string, unknown>).op === 'step-result');
      expect(results).toHaveLength(1);
    });

    const result = conn.sent.find(
      (m) => (m as Record<string, unknown>).op === 'step-result') as Record<string, unknown>;
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('step command dismisses active spotlight and advances', async () => {
    vi.useFakeTimers();
    const conn = mockConnection();
    createScenarioHandler(conn, eventTarget);

    const target = document.createElement('div');
    target.setAttribute('role', 'region');
    target.setAttribute('aria-label', 'Spotlight target');
    document.body.appendChild(target);

    eventTarget.dispatchEvent(new CustomEvent('scenario-dispatch', {
      detail: {
        op: 'dispatch-sequence',
        sessionId: 's-spot',
        steps: [{
          name: 'spot-step',
          label: 'Show spotlight',
          action: 'spotlight',
          params: { role: 'region', name: 'Spotlight target', content: 'Test callout', position: 'right', duration: 0 },
        }],
        speed: 1,
        paused: false,
      },
    }));

    await vi.advanceTimersByTimeAsync(100);
    expect(document.querySelectorAll('.scenario-spotlight-backdrop').length).toBe(1);

    eventTarget.dispatchEvent(new CustomEvent('scenario-control', {
      detail: { op: 'executor-control', sessionId: 's-spot', command: 'step' },
    }));

    await vi.advanceTimersByTimeAsync(100);
    expect(document.querySelectorAll('.scenario-spotlight-backdrop').length).toBe(0);

    await vi.waitFor(() => {
      const results = conn.sent.filter(
        (m) => (m as Record<string, unknown>).op === 'step-result');
      expect(results).toHaveLength(1);
    });

    const result = conn.sent.find(
      (m) => (m as Record<string, unknown>).op === 'step-result') as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(result.stepName).toBe('spot-step');

    document.body.removeChild(target);
    vi.useRealTimers();
  });

  it('step command completes active typing instantly', async () => {
    vi.useFakeTimers();
    const conn = mockConnection();
    createScenarioHandler(conn, eventTarget);

    const input = document.createElement('input');
    input.setAttribute('role', 'textbox');
    input.setAttribute('aria-label', 'Long text');
    document.body.appendChild(input);

    eventTarget.dispatchEvent(new CustomEvent('scenario-dispatch', {
      detail: {
        op: 'dispatch-sequence',
        sessionId: 's-type',
        steps: [{
          name: 'type-step',
          label: 'Type text',
          action: 'fill',
          params: { role: 'textbox', name: 'Long text', value: 'abcdefghij' },
        }],
        speed: 1,
        paused: false,
      },
    }));

    await vi.advanceTimersByTimeAsync(120);
    expect(input.value.length).toBeGreaterThan(0);
    expect(input.value.length).toBeLessThan(10);

    eventTarget.dispatchEvent(new CustomEvent('scenario-control', {
      detail: { op: 'executor-control', sessionId: 's-type', command: 'step' },
    }));

    await vi.advanceTimersByTimeAsync(100);
    expect(input.value).toBe('abcdefghij');

    document.body.removeChild(input);
    vi.useRealTimers();
  });

  it('spotlight shows after speed resets from runTo (1000 → 1)', async () => {
    vi.useFakeTimers();
    const conn = mockConnection();
    createScenarioHandler(conn, eventTarget);

    const target = document.createElement('div');
    target.setAttribute('role', 'region');
    target.setAttribute('aria-label', 'RunTo target');
    document.body.appendChild(target);

    eventTarget.dispatchEvent(new CustomEvent('scenario-control', {
      detail: { op: 'executor-control', sessionId: 's-runto', command: 'speed', speed: 1000 },
    }));

    eventTarget.dispatchEvent(new CustomEvent('scenario-control', {
      detail: { op: 'executor-control', sessionId: 's-runto', command: 'speed', speed: 1 },
    }));

    eventTarget.dispatchEvent(new CustomEvent('scenario-dispatch', {
      detail: {
        op: 'dispatch-sequence',
        sessionId: 's-runto',
        steps: [{
          name: 'after-runto',
          label: 'After runTo',
          action: 'spotlight',
          params: { role: 'region', name: 'RunTo target', content: 'Should be visible', duration: 0 },
        }],
        speed: 1,
        paused: false,
      },
    }));

    await vi.advanceTimersByTimeAsync(100);
    expect(document.querySelectorAll('.scenario-spotlight-backdrop').length).toBe(1);

    document.body.removeChild(target);
    vi.useRealTimers();
  });

  it('typing is incremental after speed resets from runTo (1000 → 1)', async () => {
    vi.useFakeTimers();
    const conn = mockConnection();
    createScenarioHandler(conn, eventTarget);

    const input = document.createElement('input');
    input.setAttribute('role', 'textbox');
    input.setAttribute('aria-label', 'RunTo input');
    document.body.appendChild(input);

    eventTarget.dispatchEvent(new CustomEvent('scenario-control', {
      detail: { op: 'executor-control', sessionId: 's-runto2', command: 'speed', speed: 1000 },
    }));

    eventTarget.dispatchEvent(new CustomEvent('scenario-control', {
      detail: { op: 'executor-control', sessionId: 's-runto2', command: 'speed', speed: 1 },
    }));

    eventTarget.dispatchEvent(new CustomEvent('scenario-dispatch', {
      detail: {
        op: 'dispatch-sequence',
        sessionId: 's-runto2',
        steps: [{
          name: 'type-after-runto',
          label: 'Type after runTo',
          action: 'fill',
          params: { role: 'textbox', name: 'RunTo input', value: 'abcdefghij' },
        }],
        speed: 1,
        paused: false,
      },
    }));

    await vi.advanceTimersByTimeAsync(160);
    expect(input.value.length).toBeGreaterThan(0);
    expect(input.value.length).toBeLessThan(10);

    document.body.removeChild(input);
    vi.useRealTimers();
  });

  it('show-markdown with display: modal creates full-screen overlay', async () => {
    const conn = mockConnection();
    createScenarioHandler(conn, eventTarget);

    eventTarget.dispatchEvent(new CustomEvent('scenario-dispatch', {
      detail: {
        op: 'dispatch-sequence',
        sessionId: 'test-modal',
        speed: 1, paused: false,
        steps: [{
          name: 'slide-1', label: 'Slide 1',
          action: 'show-markdown', params: { display: 'modal', value: '## Slide 1' },
        }],
      },
    }));

    await vi.waitFor(() => {
      const overlay = document.querySelector('.scenario-modal-overlay');
      expect(overlay).not.toBeNull();
      expect(overlay!.querySelector('h2')!.textContent).toBe('Slide 1');
    });

    document.querySelector('.scenario-modal-overlay')?.remove();
  });

  it('collects consecutive modal steps into a deck', async () => {
    const conn = mockConnection();
    createScenarioHandler(conn, eventTarget);

    eventTarget.dispatchEvent(new CustomEvent('scenario-dispatch', {
      detail: {
        op: 'dispatch-sequence',
        sessionId: 'test-deck',
        speed: 1, paused: false,
        steps: [
          { name: 's1', label: 'Intro', action: 'show-markdown', params: { display: 'modal', value: '## Slide 1' } },
          { name: 's2', label: 'Details', action: 'show-markdown', params: { display: 'modal', value: '## Slide 2' } },
        ],
      },
    }));

    await vi.waitFor(() => {
      const overlay = document.querySelector('.scenario-modal-overlay');
      expect(overlay).not.toBeNull();
      const dots = overlay!.querySelectorAll('.scenario-modal-dot');
      expect(dots.length).toBe(2);
      const pos = overlay!.querySelector('.scenario-modal-position');
      expect(pos!.textContent).toBe('Slide 1 of 2');
    });

    document.querySelector('.scenario-modal-overlay')?.remove();
  });

  it('Escape key dismisses modal overlay', async () => {
    const conn = mockConnection();
    createScenarioHandler(conn, eventTarget);

    eventTarget.dispatchEvent(new CustomEvent('scenario-dispatch', {
      detail: {
        op: 'dispatch-sequence',
        sessionId: 'test-esc',
        speed: 1, paused: false,
        steps: [{ name: 's1', label: 'Slide', action: 'show-markdown', params: { display: 'modal', value: '## Test' } }],
      },
    }));

    await vi.waitFor(() => { expect(document.querySelector('.scenario-modal-overlay')).not.toBeNull(); });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.scenario-modal-overlay')).toBeNull();
  });

  it('single-slide modal has no dot navigation', async () => {
    const conn = mockConnection();
    createScenarioHandler(conn, eventTarget);

    eventTarget.dispatchEvent(new CustomEvent('scenario-dispatch', {
      detail: {
        op: 'dispatch-sequence',
        sessionId: 'test-single',
        speed: 1, paused: false,
        steps: [{ name: 's1', label: 'Solo', action: 'show-markdown', params: { display: 'modal', value: '## Solo' } }],
      },
    }));

    await vi.waitFor(() => {
      const overlay = document.querySelector('.scenario-modal-overlay');
      expect(overlay).not.toBeNull();
      expect(overlay!.querySelector('.scenario-modal-dots')).toBeNull();
      expect(overlay!.querySelector('.scenario-modal-position')).toBeNull();
    });

    document.querySelector('.scenario-modal-overlay')?.remove();
  });

  it('stop control clears queue and sends failure results', async () => {
    const conn = mockConnection();
    createScenarioHandler(conn, eventTarget);

    eventTarget.dispatchEvent(new CustomEvent('scenario-dispatch', {
      detail: {
        op: 'dispatch-sequence',
        sessionId: 's-stop',
        steps: [
          { name: 'step-1', label: 'First', action: 'ready', params: {} },
          { name: 'step-2', label: 'Second', action: 'ready', params: {} },
          { name: 'step-3', label: 'Third', action: 'ready', params: {} },
        ],
        speed: 1000,
        paused: true,
      },
    }));

    await new Promise((r) => setTimeout(r, 50));

    eventTarget.dispatchEvent(new CustomEvent('scenario-control', {
      detail: { op: 'executor-control', sessionId: 's-stop', command: 'stop' },
    }));

    await new Promise((r) => setTimeout(r, 50));
    const results = conn.sent.filter(
      (m) => (m as Record<string, unknown>).op === 'step-result');
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect((r as Record<string, unknown>).ok).toBe(false);
      expect((r as Record<string, unknown>).error).toBe('stopped');
    }
  });

  it('speed <= 0 skips inter-step delay', async () => {
    const conn = mockConnection();
    createScenarioHandler(conn, eventTarget);

    const start = performance.now();
    eventTarget.dispatchEvent(new CustomEvent('scenario-dispatch', {
      detail: {
        op: 'dispatch-sequence',
        sessionId: 's-nodelay',
        steps: [
          { name: 'step-1', label: 'First', action: 'ready', params: {} },
          { name: 'step-2', label: 'Second', action: 'ready', params: {} },
        ],
        speed: -1,
        paused: false,
      },
    }));

    await vi.waitFor(() => {
      const results = conn.sent.filter(
        (m) => (m as Record<string, unknown>).op === 'step-result');
      expect(results).toHaveLength(2);
    });

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });
});
