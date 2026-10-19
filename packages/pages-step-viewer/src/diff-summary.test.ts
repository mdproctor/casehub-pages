import { describe, it, expect } from 'vitest';
import './diff-summary.js';
import type { DiffStat } from '@casehubio/yaml-core/step/diff';

describe('diff-summary', () => {
  it('renders stat dots and labels', async () => {
    const el = document.createElement('diff-summary') as HTMLElement & { stats: DiffStat[] };
    el.stats = [
      { state: 'added', count: 1, label: 'branch added' },
      { state: 'modified', count: 1, label: 'barrier modified' },
    ];
    document.body.appendChild(el);
    await (el as any).updateComplete;

    const dots = el.shadowRoot!.querySelectorAll('.dot');
    expect(dots.length).toBe(2);
    expect(dots[0]!.classList.contains('added')).toBe(true);
    expect(dots[1]!.classList.contains('modified')).toBe(true);

    const stats = el.shadowRoot!.querySelectorAll('.stat');
    expect(stats[0]!.textContent).toContain('1 branch added');
    expect(stats[1]!.textContent).toContain('1 barrier modified');
    el.remove();
  });

  it('renders nothing for empty stats', async () => {
    const el = document.createElement('diff-summary') as HTMLElement & { stats: DiffStat[] };
    el.stats = [];
    document.body.appendChild(el);
    await (el as any).updateComplete;

    const dots = el.shadowRoot!.querySelectorAll('.dot');
    expect(dots.length).toBe(0);
    el.remove();
  });
});
