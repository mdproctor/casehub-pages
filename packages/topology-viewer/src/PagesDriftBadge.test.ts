import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DriftStatus } from './types.js';
import { PagesDriftBadge } from './PagesDriftBadge.js';

describe('PagesDriftBadge', () => {
  let element: PagesDriftBadge;

  beforeEach(() => {
    vi.useFakeTimers();
    element = document.createElement('pages-drift-badge') as unknown as PagesDriftBadge;
    document.body.appendChild(element);
  });

  afterEach(() => {
    element.remove();
    vi.useRealTimers();
  });

  it('renders nothing for NORMAL drift status', async () => {
    element.driftStatus = DriftStatus.NORMAL;
    await element.updateComplete;

    const badge = element.shadowRoot!.querySelector('.drift-badge');
    expect(badge).toBeNull();
  });

  it('renders amber badge for PERMITTED_DRIFT', async () => {
    element.driftStatus = DriftStatus.PERMITTED_DRIFT;
    element.triggerSource = 'MOTION';
    element.exemptUntil = new Date(Date.now() + 24 * 60_000).toISOString();
    await element.updateComplete;

    const badge = element.shadowRoot!.querySelector('.drift-badge');
    expect(badge).not.toBeNull();
    expect(badge!.classList.contains('permitted')).toBe(true);
    expect(badge!.textContent).toContain('MOTION');
    expect(badge!.textContent).toContain('24m');
  });

  it('renders red badge for UNEXPECTED_DRIFT', async () => {
    element.driftStatus = DriftStatus.UNEXPECTED_DRIFT;
    await element.updateComplete;

    const badge = element.shadowRoot!.querySelector('.drift-badge');
    expect(badge).not.toBeNull();
    expect(badge!.classList.contains('unexpected')).toBe(true);
    expect(badge!.textContent).toContain('DRIFT');
  });

  it('shows pulsing indicator for unexpected drift', async () => {
    element.driftStatus = DriftStatus.UNEXPECTED_DRIFT;
    await element.updateComplete;

    const indicator = element.shadowRoot!.querySelector('.unexpected .drift-indicator');
    expect(indicator).not.toBeNull();
  });

  it('shows countdown with hours and minutes', async () => {
    element.driftStatus = DriftStatus.PERMITTED_DRIFT;
    element.triggerSource = 'MOTION';
    element.exemptUntil = new Date(Date.now() + 90 * 60_000).toISOString();
    await element.updateComplete;

    const badge = element.shadowRoot!.querySelector('.drift-badge');
    expect(badge!.textContent).toContain('1h 30m');
  });

  it('shows expired when deadline passed', async () => {
    element.driftStatus = DriftStatus.PERMITTED_DRIFT;
    element.triggerSource = 'MOTION';
    element.exemptUntil = new Date(Date.now() - 1000).toISOString();
    await element.updateComplete;

    const badge = element.shadowRoot!.querySelector('.drift-badge');
    expect(badge!.textContent).toContain('expired');
  });

  it('updates countdown on timer tick', async () => {
    element.driftStatus = DriftStatus.PERMITTED_DRIFT;
    element.triggerSource = 'MOTION';
    element.exemptUntil = new Date(Date.now() + 5 * 60_000).toISOString();
    await element.updateComplete;

    const badgeBefore = element.shadowRoot!.querySelector('.drift-badge');
    expect(badgeBefore!.textContent).toContain('5m');

    vi.advanceTimersByTime(60_000);
    await element.updateComplete;

    const badgeAfter = element.shadowRoot!.querySelector('.drift-badge');
    expect(badgeAfter!.textContent).toContain('4m');
  });

  it('has role=status for ARIA', async () => {
    element.driftStatus = DriftStatus.UNEXPECTED_DRIFT;
    await element.updateComplete;

    const badge = element.shadowRoot!.querySelector('.drift-badge');
    expect(badge!.getAttribute('role')).toBe('status');
  });

  it('has descriptive aria-label for permitted drift', async () => {
    element.driftStatus = DriftStatus.PERMITTED_DRIFT;
    element.triggerSource = 'MOTION';
    element.exemptUntil = new Date(Date.now() + 10 * 60_000).toISOString();
    await element.updateComplete;

    const badge = element.shadowRoot!.querySelector('.drift-badge');
    const label = badge!.getAttribute('aria-label')!;
    expect(label).toContain('Permitted drift');
    expect(label).toContain('MOTION');
  });

  it('falls back to TRIGGER when triggerSource not set', async () => {
    element.driftStatus = DriftStatus.PERMITTED_DRIFT;
    element.exemptUntil = new Date(Date.now() + 10 * 60_000).toISOString();
    await element.updateComplete;

    const badge = element.shadowRoot!.querySelector('.drift-badge');
    expect(badge!.textContent).toContain('TRIGGER');
  });

  it('transitions from PERMITTED_DRIFT to NORMAL when status changes', async () => {
    element.driftStatus = DriftStatus.PERMITTED_DRIFT;
    element.triggerSource = 'MOTION';
    element.exemptUntil = new Date(Date.now() + 10 * 60_000).toISOString();
    await element.updateComplete;

    expect(element.shadowRoot!.querySelector('.drift-badge')).not.toBeNull();

    element.driftStatus = DriftStatus.NORMAL;
    await element.updateComplete;

    expect(element.shadowRoot!.querySelector('.drift-badge')).toBeNull();
  });
});
