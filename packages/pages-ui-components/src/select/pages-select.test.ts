import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import './index.js';

describe('PagesSelect', () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = document.createElement('pages-select');
    document.body.appendChild(el);
  });

  afterEach(() => {
    el.remove();
  });

  it('registers as a custom element', () => {
    expect(customElements.get('pages-select')).toBeDefined();
  });

  it('renders a select element in shadow DOM', async () => {
    await (el as any).updateComplete;
    const select = el.shadowRoot!.querySelector('select');
    expect(select).not.toBeNull();
  });

  it('renders options from property', async () => {
    (el as any).options = [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
    ];
    await (el as any).updateComplete;
    const options = el.shadowRoot!.querySelectorAll('option');
    expect(options.length).toBe(2);
    expect(options[0]!.value).toBe('a');
    expect(options[0]!.textContent!.trim()).toBe('Alpha');
    expect(options[1]!.value).toBe('b');
  });

  it('selects option matching value property', async () => {
    (el as any).options = [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
    ];
    (el as any).value = 'b';
    await (el as any).updateComplete;
    const select = el.shadowRoot!.querySelector('select')!;
    expect(select.value).toBe('b');
  });

  it('renders label when provided', async () => {
    (el as any).label = 'Country';
    await (el as any).updateComplete;
    const label = el.shadowRoot!.querySelector('label');
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe('Country');
  });

  it('does not render label when undefined', async () => {
    await (el as any).updateComplete;
    expect(el.shadowRoot!.querySelector('label')).toBeNull();
  });

  it('sets disabled on select', async () => {
    (el as any).disabled = true;
    await (el as any).updateComplete;
    const select = el.shadowRoot!.querySelector('select')!;
    expect(select.disabled).toBe(true);
  });

  it('renders error message', async () => {
    (el as any).error = 'Pick one';
    await (el as any).updateComplete;
    const errorEl = el.shadowRoot!.querySelector('[role="alert"]');
    expect(errorEl).not.toBeNull();
    expect(errorEl!.textContent).toBe('Pick one');
  });

  it('sets aria-invalid when error present', async () => {
    (el as any).error = 'Required';
    await (el as any).updateComplete;
    expect(el.shadowRoot!.querySelector('select')!.getAttribute('aria-invalid')).toBe('true');
  });

  it('fires change event on selection', async () => {
    (el as any).options = [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
    ];
    await (el as any).updateComplete;
    const select = el.shadowRoot!.querySelector('select')!;
    let fired = false;
    el.addEventListener('change', () => { fired = true; });
    select.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    expect(fired).toBe(true);
  });

  it('renders empty when no options', async () => {
    await (el as any).updateComplete;
    const options = el.shadowRoot!.querySelectorAll('option');
    expect(options.length).toBe(0);
  });

  it('sets required on select', async () => {
    (el as any).required = true;
    await (el as any).updateComplete;
    expect(el.shadowRoot!.querySelector('select')!.required).toBe(true);
  });

  it('defaults to empty value', () => {
    expect((el as any).value).toBe('');
  });
});
