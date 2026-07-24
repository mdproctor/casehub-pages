import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import './index.js';

describe('PagesCheckbox', () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = document.createElement('pages-checkbox');
    document.body.appendChild(el);
  });

  afterEach(() => {
    el.remove();
  });

  it('registers as a custom element', () => {
    expect(customElements.get('pages-checkbox')).toBeDefined();
  });

  it('renders a checkbox input', async () => {
    await (el as any).updateComplete;
    const input = el.shadowRoot!.querySelector('input[type="checkbox"]');
    expect(input).not.toBeNull();
  });

  it('reflects checked property', async () => {
    (el as any).checked = true;
    await (el as any).updateComplete;
    const input = el.shadowRoot!.querySelector('input')! as HTMLInputElement;
    expect(input.checked).toBe(true);
  });

  it('defaults to unchecked', async () => {
    await (el as any).updateComplete;
    expect((el.shadowRoot!.querySelector('input')! as HTMLInputElement).checked).toBe(false);
  });

  it('renders label', async () => {
    (el as any).label = 'Accept terms';
    await (el as any).updateComplete;
    const label = el.shadowRoot!.querySelector('label');
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe('Accept terms');
  });

  it('does not render label when undefined', async () => {
    await (el as any).updateComplete;
    expect(el.shadowRoot!.querySelector('label')).toBeNull();
  });

  it('sets disabled', async () => {
    (el as any).disabled = true;
    await (el as any).updateComplete;
    expect(el.shadowRoot!.querySelector('input')!.disabled).toBe(true);
  });

  it('renders error', async () => {
    (el as any).error = 'Must accept';
    await (el as any).updateComplete;
    expect(el.shadowRoot!.querySelector('[role="alert"]')!.textContent).toBe('Must accept');
  });

  it('sets aria-invalid when error present', async () => {
    (el as any).error = 'Required';
    await (el as any).updateComplete;
    expect(el.shadowRoot!.querySelector('input')!.getAttribute('aria-invalid')).toBe('true');
  });

  it('does not render error when undefined', async () => {
    await (el as any).updateComplete;
    expect(el.shadowRoot!.querySelector('[role="alert"]')).toBeNull();
  });

  it('fires change event on toggle', async () => {
    await (el as any).updateComplete;
    let fired = false;
    el.addEventListener('change', () => { fired = true; });
    el.shadowRoot!.querySelector('input')!.dispatchEvent(
      new Event('change', { bubbles: true, composed: true }),
    );
    expect(fired).toBe(true);
  });

  it('sets required with aria', async () => {
    (el as any).required = true;
    await (el as any).updateComplete;
    const input = el.shadowRoot!.querySelector('input')!;
    expect(input.required).toBe(true);
    expect(input.getAttribute('aria-required')).toBe('true');
  });
});
