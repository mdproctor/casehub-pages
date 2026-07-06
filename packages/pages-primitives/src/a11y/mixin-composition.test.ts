import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { FocusTrapMixin } from './focus-trap.js';
import { RovingTabindexMixin } from './roving-tabindex.js';
import type { RovingDirection } from './roving-tabindex.js';

@customElement('test-composed-mixin')
class TestComposedElement extends FocusTrapMixin(RovingTabindexMixin(LitElement)) {
  @property() rovingSelector = '.item';
  @property() rovingDirection: RovingDirection = 'vertical';

  override render() {
    return html`
      <div class="item" tabindex="-1">A</div>
      <div class="item" tabindex="-1">B</div>
      <div class="item" tabindex="-1">C</div>
    `;
  }
}

describe('Mixin composition — FocusTrapMixin + RovingTabindexMixin', () => {
  let el: TestComposedElement;

  beforeEach(async () => {
    el = document.createElement('test-composed-mixin') as TestComposedElement;
    document.body.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => {
    el.releaseFocus();
    el.remove();
  });

  it('element has both mixin APIs', () => {
    expect(typeof el.trapFocus).toBe('function');
    expect(typeof el.releaseFocus).toBe('function');
    expect(typeof el.navigateRoving).toBe('function');
    expect(el.rovingIndex).toBe(-1);
  });

  it('roving tabindex works on the composed element', () => {
    el.navigateRoving('first');
    expect(el.rovingIndex).toBe(0);

    el.navigateRoving('next');
    expect(el.rovingIndex).toBe(1);
  });

  it('focus trap works on the composed element', () => {
    const container = document.createElement('div');
    const btn1 = document.createElement('button');
    const btn2 = document.createElement('button');
    container.appendChild(btn1);
    container.appendChild(btn2);
    document.body.appendChild(container);

    el.trapFocus(container);
    expect(document.activeElement).toBe(btn1);

    el.releaseFocus();
    container.remove();
  });

  it('connectedCallback and disconnectedCallback chain correctly', () => {
    const el2 = document.createElement('test-composed-mixin') as TestComposedElement;
    document.body.appendChild(el2);
    expect(() => el2.remove()).not.toThrow();
  });
});
