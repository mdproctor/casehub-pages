import { describe, it, expect } from 'vitest';
import { PLAYBOOK_ACTIONS } from './playbook-actions.js';
import type { PlaybookCapability, PlaybookMethodDescriptor } from './playbook-actions.js';

describe('PLAYBOOK_ACTIONS SPI', () => {
  it('PLAYBOOK_ACTIONS is a symbol with well-known key', () => {
    expect(typeof PLAYBOOK_ACTIONS).toBe('symbol');
    expect(PLAYBOOK_ACTIONS).toBe(Symbol.for('playbook-actions'));
  });

  it('PlaybookCapability type accepts method descriptors', () => {
    const cap: PlaybookCapability = {
      loadContent: {
        params: { panel: { type: 'string', required: true }, content: 'string' },
        description: 'Load content',
      },
      nextDiff: {},
    };
    expect(Object.keys(cap)).toEqual(['loadContent', 'nextDiff']);
  });

  it('PlaybookMethodDescriptor accepts shorthand and detailed params', () => {
    const shorthand: PlaybookMethodDescriptor = { params: { name: 'string' } };
    const detailed: PlaybookMethodDescriptor = {
      params: { name: { type: 'string', required: true } },
      returns: 'object',
      portability: 'ts',
    };
    expect(shorthand.params).toBeDefined();
    expect(detailed.portability).toBe('ts');
  });
});
