import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import './index.js';

describe('PagesButton', () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = document.createElement('pages-button');
    document.body.appendChild(el);
  });

  afterEach(() => {
    el.remove();
  });

  it('registers as a custom element', () => {
    expect(customElements.get('pages-button')).toBeDefined();
  });

  it('renders a button element', async () => {
    await (el as any).updateComplete;
    const button = el.shadowRoot!.querySelector('button');
    expect(button).not.toBeNull();
  });

  it('renders label text', async () => {
    (el as any).label = 'Submit';
    await (el as any).updateComplete;
    const button = el.shadowRoot!.querySelector('button')!;
    expect(button.textContent!.trim()).toBe('Submit');
  });

  it('renders slot when no label', async () => {
    await (el as any).updateComplete;
    const slot = el.shadowRoot!.querySelector('slot');
    expect(slot).not.toBeNull();
  });

  it('applies primary variant class', async () => {
    (el as any).variant = 'primary';
    await (el as any).updateComplete;
    const button = el.shadowRoot!.querySelector('button')!;
    expect(button.classList.contains('primary')).toBe(true);
  });

  it('defaults to secondary variant', async () => {
    await (el as any).updateComplete;
    const button = el.shadowRoot!.querySelector('button')!;
    expect(button.classList.contains('secondary')).toBe(true);
  });

  it('applies danger variant', async () => {
    (el as any).variant = 'danger';
    await (el as any).updateComplete;
    const button = el.shadowRoot!.querySelector('button')!;
    expect(button.classList.contains('danger')).toBe(true);
  });

  it('applies ghost variant', async () => {
    (el as any).variant = 'ghost';
    await (el as any).updateComplete;
    const button = el.shadowRoot!.querySelector('button')!;
    expect(button.classList.contains('ghost')).toBe(true);
  });

  it('sets disabled', async () => {
    (el as any).disabled = true;
    await (el as any).updateComplete;
    expect(el.shadowRoot!.querySelector('button')!.disabled).toBe(true);
  });

  it('disables button when loading', async () => {
    (el as any).loading = true;
    await (el as any).updateComplete;
    expect(el.shadowRoot!.querySelector('button')!.disabled).toBe(true);
  });

  it('shows spinner when loading', async () => {
    (el as any).loading = true;
    await (el as any).updateComplete;
    const spinner = el.shadowRoot!.querySelector('.spinner');
    expect(spinner).not.toBeNull();
  });

  it('does not show spinner when not loading', async () => {
    await (el as any).updateComplete;
    expect(el.shadowRoot!.querySelector('.spinner')).toBeNull();
  });

  it('applies sm size class', async () => {
    (el as any).size = 'sm';
    await (el as any).updateComplete;
    const button = el.shadowRoot!.querySelector('button')!;
    expect(button.classList.contains('sm')).toBe(true);
  });

  it('applies lg size class', async () => {
    (el as any).size = 'lg';
    await (el as any).updateComplete;
    const button = el.shadowRoot!.querySelector('button')!;
    expect(button.classList.contains('lg')).toBe(true);
  });

  it('does not apply md size class (default)', async () => {
    await (el as any).updateComplete;
    const button = el.shadowRoot!.querySelector('button')!;
    expect(button.classList.contains('md')).toBe(false);
  });

  it('fires click event', async () => {
    await (el as any).updateComplete;
    let fired = false;
    el.addEventListener('click', () => { fired = true; });
    el.shadowRoot!.querySelector('button')!.click();
    expect(fired).toBe(true);
  });

  it('does not fire click when disabled', async () => {
    (el as any).disabled = true;
    await (el as any).updateComplete;
    let fired = false;
    el.addEventListener('click', () => { fired = true; });
    el.shadowRoot!.querySelector('button')!.click();
    expect(fired).toBe(false);
  });

  it('defaults to empty label', () => {
    expect((el as any).label).toBe('');
  });

  it('defaults to md size', () => {
    expect((el as any).size).toBe('md');
  });
});
