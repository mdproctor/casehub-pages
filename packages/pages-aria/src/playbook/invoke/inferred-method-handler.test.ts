import { describe, it, expect } from 'vitest';
import { InferredMethodHandler } from './inferred-method-handler.js';

describe('InferredMethodHandler', () => {
  const handler = new InferredMethodHandler();

  it('supports element-method binding', () => {
    expect(handler.supports({ kind: 'element-method', method: 'foo' })).toBe(true);
  });

  it('does not support aria binding', () => {
    expect(handler.supports({ kind: 'aria', action: 'click' })).toBe(false);
  });

  it('does not support rest binding', () => {
    expect(handler.supports({ kind: 'rest', method: 'GET', url: '/', headers: {}, body: {} })).toBe(false);
  });
});
