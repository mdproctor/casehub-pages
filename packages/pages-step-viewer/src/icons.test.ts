import { describe, it, expect } from 'vitest';
import { getActionIcon } from './icons.js';

describe('getActionIcon', () => {
  it('returns icon for known action', () => {
    expect(getActionIcon('click')).toEqual({ symbol: '⊡', colorClass: 'click' });
  });

  it('returns fill icon for fill action', () => {
    expect(getActionIcon('fill')).toEqual({ symbol: '✎', colorClass: 'fill' });
  });

  it('maps select to fill color class', () => {
    expect(getActionIcon('select').colorClass).toBe('fill');
  });

  it('returns default icon for unknown action', () => {
    const icon = getActionIcon('unknown-action');
    expect(icon.symbol).toBe('▸');
    expect(icon.colorClass).toBe('default');
  });

  it('returns navigate icon', () => {
    expect(getActionIcon('navigate')).toEqual({ symbol: '⤳', colorClass: 'nav' });
  });

  it('returns assert icon', () => {
    expect(getActionIcon('assert')).toEqual({ symbol: '✓', colorClass: 'assert' });
  });

  it('returns signal icon', () => {
    expect(getActionIcon('signal')).toEqual({ symbol: '◇', colorClass: 'signal' });
  });

  it('returns await icon', () => {
    expect(getActionIcon('await')).toEqual({ symbol: '◈', colorClass: 'await' });
  });
});
