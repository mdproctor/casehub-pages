import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import './index.js';

describe('PagesInput', () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = document.createElement('pages-input');
    document.body.appendChild(el);
  });

  afterEach(() => {
    el.remove();
  });

  it('registers as a custom element', () => {
    expect(customElements.get('pages-input')).toBeDefined();
  });

  it('renders an input element in shadow DOM', async () => {
    await (el as any).updateComplete;
    const input = el.shadowRoot!.querySelector('input');
    expect(input).not.toBeNull();
    expect(input!.type).toBe('text');
  });

  it('renders label when provided', async () => {
    (el as any).label = 'Name';
    await (el as any).updateComplete;
    const label = el.shadowRoot!.querySelector('label');
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe('Name');
  });

  it('does not render label when undefined', async () => {
    await (el as any).updateComplete;
    const label = el.shadowRoot!.querySelector('label');
    expect(label).toBeNull();
  });

  it('sets placeholder on input', async () => {
    (el as any).placeholder = 'Enter name';
    await (el as any).updateComplete;
    const input = el.shadowRoot!.querySelector('input')!;
    expect(input.placeholder).toBe('Enter name');
  });

  it('sets maxlength on input', async () => {
    (el as any).maxlength = 50;
    await (el as any).updateComplete;
    const input = el.shadowRoot!.querySelector('input')!;
    expect(input.maxLength).toBe(50);
  });

  it('reflects value property', async () => {
    (el as any).value = 'hello';
    await (el as any).updateComplete;
    const input = el.shadowRoot!.querySelector('input')!;
    expect(input.value).toBe('hello');
  });

  it('supports type variants', async () => {
    (el as any).type = 'email';
    await (el as any).updateComplete;
    const input = el.shadowRoot!.querySelector('input')!;
    expect(input.type).toBe('email');
  });

  it('sets aria-required when required', async () => {
    (el as any).required = true;
    await (el as any).updateComplete;
    const input = el.shadowRoot!.querySelector('input')!;
    expect(input.getAttribute('aria-required')).toBe('true');
    expect(input.required).toBe(true);
  });

  it('sets readonly attribute', async () => {
    (el as any).readonly = true;
    await (el as any).updateComplete;
    const input = el.shadowRoot!.querySelector('input')!;
    expect(input.readOnly).toBe(true);
  });

  it('sets disabled attribute', async () => {
    (el as any).disabled = true;
    await (el as any).updateComplete;
    const input = el.shadowRoot!.querySelector('input')!;
    expect(input.disabled).toBe(true);
  });

  it('renders error message with role=alert', async () => {
    (el as any).error = 'Required field';
    await (el as any).updateComplete;
    const errorEl = el.shadowRoot!.querySelector('[role="alert"]');
    expect(errorEl).not.toBeNull();
    expect(errorEl!.textContent).toBe('Required field');
  });

  it('sets aria-invalid when error is present', async () => {
    (el as any).error = 'Invalid';
    await (el as any).updateComplete;
    const input = el.shadowRoot!.querySelector('input')!;
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('does not render error when undefined', async () => {
    await (el as any).updateComplete;
    const errorEl = el.shadowRoot!.querySelector('[role="alert"]');
    expect(errorEl).toBeNull();
  });

  it('fires input event on keystroke', async () => {
    await (el as any).updateComplete;
    const input = el.shadowRoot!.querySelector('input')!;
    let fired = false;
    el.addEventListener('input', () => { fired = true; });
    input.value = 'a';
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    expect(fired).toBe(true);
  });

  it('fires change event on blur', async () => {
    await (el as any).updateComplete;
    const input = el.shadowRoot!.querySelector('input')!;
    let fired = false;
    el.addEventListener('change', () => { fired = true; });
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    expect(fired).toBe(true);
  });

  it('defaults to empty value', async () => {
    await (el as any).updateComplete;
    expect((el as any).value).toBe('');
  });

  it('defaults to text type', async () => {
    expect((el as any).type).toBe('text');
  });

  it('supports password type', async () => {
    (el as any).type = 'password';
    await (el as any).updateComplete;
    expect(el.shadowRoot!.querySelector('input')!.type).toBe('password');
  });
});
