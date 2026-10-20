import { describe, it, expect } from 'vitest';
import { PLAYBOOK_ACTIONS } from '@casehubio/pages-primitives';
import { PagesDocumentDiff } from './pages-document-diff.js';

describe('PagesDocumentDiff PLAYBOOK_ACTIONS', () => {
  it('declares playbook-callable methods', () => {
    const cap = (PagesDocumentDiff as any)[PLAYBOOK_ACTIONS];
    expect(cap).toBeDefined();
    expect(Object.keys(cap)).toContain('loadContent');
    expect(Object.keys(cap)).toContain('nextDiff');
    expect(Object.keys(cap)).toContain('prevDiff');
    expect(Object.keys(cap)).toContain('setViewMode');
    expect(Object.keys(cap)).toContain('toggleSync');
  });

  it('loadContent declares panel and content as required', () => {
    const cap = (PagesDocumentDiff as any)[PLAYBOOK_ACTIONS];
    const lc = cap.loadContent;
    expect(lc.params.panel).toEqual({ type: 'string', required: true });
    expect(lc.params.content).toEqual({ type: 'string', required: true });
  });

  it('does not expose private or DOM methods', () => {
    const cap = (PagesDocumentDiff as any)[PLAYBOOK_ACTIONS];
    expect(cap.remove).toBeUndefined();
    expect(cap.setAttribute).toBeUndefined();
    expect(cap.connectedCallback).toBeUndefined();
  });
});
