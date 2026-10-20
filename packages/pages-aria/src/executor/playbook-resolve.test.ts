/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { resolvePlaybookCapability, mapParams, kebabToCamel, validateDescriptor } from './playbook-resolve.js';
import { PLAYBOOK_ACTIONS } from '@casehubio/pages-primitives';

describe('kebabToCamel', () => {
  it('converts kebab-case to camelCase', () => {
    expect(kebabToCamel('load-content')).toBe('loadContent');
    expect(kebabToCamel('next-diff')).toBe('nextDiff');
    expect(kebabToCamel('set-view-mode')).toBe('setViewMode');
  });

  it('leaves camelCase unchanged', () => {
    expect(kebabToCamel('toggleSync')).toBe('toggleSync');
  });

  it('handles single word', () => {
    expect(kebabToCamel('reset')).toBe('reset');
  });
});

describe('resolvePlaybookCapability', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('returns null when element has no PLAYBOOK_ACTIONS', () => {
    const el = document.createElement('div');
    expect(resolvePlaybookCapability(el)).toBeNull();
  });

  it('reads static PLAYBOOK_ACTIONS from constructor', () => {
    class TestEl extends HTMLElement {
      static get [PLAYBOOK_ACTIONS]() {
        return { doThing: { params: { x: 'string' } } };
      }
    }
    customElements.define('test-playbook-resolve-el', TestEl);
    const el = document.createElement('test-playbook-resolve-el');
    const cap = resolvePlaybookCapability(el);
    expect(cap).toEqual({ doThing: { params: { x: 'string' } } });
  });
});

describe('mapParams', () => {
  it('maps named params to positional args via descriptor key order', () => {
    const step = { panel: 'a', content: '# Hello', label: 'v1' };
    const desc = {
      params: {
        panel: { type: 'string', required: true },
        content: { type: 'string', required: true },
        label: 'string',
      },
    };
    expect(mapParams(step, desc)).toEqual(['a', '# Hello', 'v1']);
  });

  it('throws when required param is missing', () => {
    const step = { content: '# Hello' };
    const desc = {
      params: { panel: { type: 'string', required: true }, content: 'string' },
    };
    expect(() => mapParams(step, desc)).toThrow("Required parameter 'panel' is missing");
  });

  it('returns empty array when no params declared', () => {
    expect(mapParams({}, {})).toEqual([]);
    expect(mapParams({}, { params: undefined })).toEqual([]);
  });

  it('passes undefined for optional missing params', () => {
    const step = { panel: 'a' };
    const desc = { params: { panel: 'string', label: 'string' } };
    expect(mapParams(step, desc)).toEqual(['a', undefined]);
  });

  it('treats string? suffix as optional', () => {
    const step = {};
    const desc = { params: { label: 'string?' } };
    expect(mapParams(step, desc)).toEqual([undefined]);
  });
});

describe('validateDescriptor', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('warns when descriptor param count mismatches method length', () => {
    const warnings: string[] = [];
    class BadEl extends HTMLElement {
      static get [PLAYBOOK_ACTIONS]() {
        return { doThing: { params: { a: 'string', b: 'string' } } };
      }
      doThing(_a: string) {}
    }
    customElements.define('test-bad-descriptor-el', BadEl);
    const el = document.createElement('test-bad-descriptor-el');
    document.body.appendChild(el);
    validateDescriptor(el, (msg) => warnings.push(msg));
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('doThing');
  });

  it('warns when declared method does not exist', () => {
    const warnings: string[] = [];
    class MissingEl extends HTMLElement {
      static get [PLAYBOOK_ACTIONS]() {
        return { nonExistent: {} };
      }
    }
    customElements.define('test-missing-method-el', MissingEl);
    const el = document.createElement('test-missing-method-el');
    document.body.appendChild(el);
    validateDescriptor(el, (msg) => warnings.push(msg));
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('nonExistent');
  });
});
