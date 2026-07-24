import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import './index.js';

describe('PagesTextarea', () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = document.createElement('pages-textarea');
    document.body.appendChild(el);
  });

  afterEach(() => {
    el.remove();
  });

  it('registers as a custom element', () => {
    expect(customElements.get('pages-textarea')).toBeDefined();
  });

  it('renders a textarea element', async () => {
    await (el as any).updateComplete;
    const textarea = el.shadowRoot!.querySelector('textarea');
    expect(textarea).not.toBeNull();
  });

  it('reflects value property', async () => {
    (el as any).value = 'multi\nline';
    await (el as any).updateComplete;
    const textarea = el.shadowRoot!.querySelector('textarea')!;
    expect(textarea.value).toBe('multi\nline');
  });

  it('sets rows attribute', async () => {
    (el as any).rows = 5;
    await (el as any).updateComplete;
    const textarea = el.shadowRoot!.querySelector('textarea')!;
    expect(textarea.rows).toBe(5);
  });

  it('renders label', async () => {
    (el as any).label = 'Notes';
    await (el as any).updateComplete;
    expect(el.shadowRoot!.querySelector('label')!.textContent).toBe('Notes');
  });

  it('does not render label when undefined', async () => {
    await (el as any).updateComplete;
    expect(el.shadowRoot!.querySelector('label')).toBeNull();
  });

  it('sets readonly', async () => {
    (el as any).readonly = true;
    await (el as any).updateComplete;
    expect(el.shadowRoot!.querySelector('textarea')!.readOnly).toBe(true);
  });

  it('sets disabled', async () => {
    (el as any).disabled = true;
    await (el as any).updateComplete;
    expect(el.shadowRoot!.querySelector('textarea')!.disabled).toBe(true);
  });

  it('renders error with aria-invalid', async () => {
    (el as any).error = 'Too long';
    await (el as any).updateComplete;
    expect(el.shadowRoot!.querySelector('[role="alert"]')!.textContent).toBe('Too long');
    expect(el.shadowRoot!.querySelector('textarea')!.getAttribute('aria-invalid')).toBe('true');
  });

  it('does not render error when undefined', async () => {
    await (el as any).updateComplete;
    expect(el.shadowRoot!.querySelector('[role="alert"]')).toBeNull();
  });

  it('fires input event', async () => {
    await (el as any).updateComplete;
    let fired = false;
    el.addEventListener('input', () => { fired = true; });
    el.shadowRoot!.querySelector('textarea')!.dispatchEvent(
      new Event('input', { bubbles: true, composed: true }),
    );
    expect(fired).toBe(true);
  });

  it('fires change event', async () => {
    await (el as any).updateComplete;
    let fired = false;
    el.addEventListener('change', () => { fired = true; });
    el.shadowRoot!.querySelector('textarea')!.dispatchEvent(
      new Event('change', { bubbles: true, composed: true }),
    );
    expect(fired).toBe(true);
  });

  it('sets placeholder', async () => {
    (el as any).placeholder = 'Type here';
    await (el as any).updateComplete;
    expect(el.shadowRoot!.querySelector('textarea')!.placeholder).toBe('Type here');
  });

  it('sets maxlength', async () => {
    (el as any).maxlength = 200;
    await (el as any).updateComplete;
    expect(el.shadowRoot!.querySelector('textarea')!.maxLength).toBe(200);
  });

  it('sets required with aria', async () => {
    (el as any).required = true;
    await (el as any).updateComplete;
    const textarea = el.shadowRoot!.querySelector('textarea')!;
    expect(textarea.required).toBe(true);
    expect(textarea.getAttribute('aria-required')).toBe('true');
  });

  it('defaults to empty value', () => {
    expect((el as any).value).toBe('');
  });
});
