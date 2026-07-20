import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement, returnValue?: string) {
    this.removeAttribute('open');
    if (returnValue !== undefined) {
      this.returnValue = returnValue;
    }
    this.dispatchEvent(new Event('close'));
  });
  window.scrollTo = vi.fn() as any;
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

import './pages-modal.js';
import type { PagesModal } from './pages-modal.js';

function createModal(innerHtml = ''): PagesModal {
  const el = document.createElement('pages-modal') as PagesModal;
  el.innerHTML = innerHtml || `
    <span slot="header">Test Title</span>
    <p>Body content</p>
    <button slot="actions">OK</button>
  `;
  document.body.appendChild(el);
  return el;
}

describe('pages-modal — registration', () => {
  it('is registered in the custom element registry', () => {
    expect(customElements.get('pages-modal')).toBeDefined();
    expect(customElements.get('pages-modal')!.name).toBe('PagesModal');
  });
});

describe('pages-modal — open/close', () => {
  let el: PagesModal;

  afterEach(() => el?.remove());

  it('calls showModal() when open is set to true', async () => {
    el = createModal();
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;
    const dialog = el.shadowRoot!.querySelector('dialog')!;
    expect(dialog.showModal).toHaveBeenCalled();
  });

  it('calls close() when open is set to false after being open', async () => {
    el = createModal();
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;
    const dialog = el.shadowRoot!.querySelector('dialog')!;
    vi.mocked(dialog.close).mockClear();
    el.open = false;
    await el.updateComplete;
    expect(dialog.close).toHaveBeenCalled();
  });

  it('fires pages-modal-close on close', async () => {
    el = createModal();
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;

    const closeHandler = vi.fn();
    el.addEventListener('pages-modal-close', closeHandler);
    el.open = false;
    await el.updateComplete;

    expect(closeHandler).toHaveBeenCalledOnce();
  });

  it('re-opens after close', async () => {
    el = createModal();
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;
    el.open = false;
    await el.updateComplete;
    const dialog = el.shadowRoot!.querySelector('dialog')!;
    vi.mocked(dialog.showModal).mockClear();
    el.open = true;
    await el.updateComplete;
    expect(dialog.showModal).toHaveBeenCalled();
  });
});

describe('pages-modal — ARIA', () => {
  let el: PagesModal;

  afterEach(() => el?.remove());

  it('has role="dialog" by default', async () => {
    el = createModal();
    await el.updateComplete;
    const dialog = el.shadowRoot!.querySelector('dialog')!;
    expect(dialog.getAttribute('role')).toBe('dialog');
  });

  it('has role="alertdialog" when variant is alertdialog', async () => {
    el = createModal();
    el.variant = 'alertdialog';
    await el.updateComplete;
    const dialog = el.shadowRoot!.querySelector('dialog')!;
    expect(dialog.getAttribute('role')).toBe('alertdialog');
  });

  it('has aria-modal="true"', async () => {
    el = createModal();
    await el.updateComplete;
    const dialog = el.shadowRoot!.querySelector('dialog')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('has aria-labelledby when _hasHeaderContent is true', async () => {
    el = createModal();
    // jsdom doesn't distribute slots, so set _hasHeaderContent directly
    (el as any)._hasHeaderContent = true;
    await el.updateComplete;
    const dialog = el.shadowRoot!.querySelector('dialog')!;
    expect(dialog.getAttribute('aria-labelledby')).toBe('modal-header');
  });

  it('uses aria-label when header slot is empty and ariaLabel is set', async () => {
    el = createModal('<p>Body only</p>');
    el.ariaLabel = 'Custom label';
    await el.updateComplete;
    const dialog = el.shadowRoot!.querySelector('dialog')!;
    expect(dialog.getAttribute('aria-label')).toBe('Custom label');
  });

  it('warns when no accessible name is provided', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    el = createModal('<p>Body only</p>');
    await el.updateComplete;
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('pages-modal opened without an accessible name')
    );
    warnSpy.mockRestore();
  });
});

describe('pages-modal — requestClose', () => {
  let el: PagesModal;

  afterEach(() => el?.remove());

  it('fires pages-modal-cancel before closing', async () => {
    el = createModal();
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;

    const cancelHandler = vi.fn();
    el.addEventListener('pages-modal-cancel', cancelHandler);
    el.requestClose();
    expect(cancelHandler).toHaveBeenCalledOnce();
  });

  it('does not close if pages-modal-cancel is prevented', async () => {
    el = createModal();
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;

    el.addEventListener('pages-modal-cancel', (e) => e.preventDefault());
    el.requestClose();
    await el.updateComplete;
    expect(el.open).toBe(true);
  });

  it('sets returnValue in close event', async () => {
    el = createModal();
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;

    const closeHandler = vi.fn();
    el.addEventListener('pages-modal-close', closeHandler);
    el.requestClose('confirm');
    await el.updateComplete;

    expect(closeHandler).toHaveBeenCalledOnce();
    const detail = (closeHandler.mock.calls[0]![0] as CustomEvent).detail;
    expect(detail.returnValue).toBe('confirm');
  });

  it('does nothing if not open', async () => {
    el = createModal();
    await el.updateComplete;

    const cancelHandler = vi.fn();
    el.addEventListener('pages-modal-cancel', cancelHandler);
    el.requestClose();
    expect(cancelHandler).not.toHaveBeenCalled();
  });
});

describe('pages-modal — close button', () => {
  let el: PagesModal;

  afterEach(() => el?.remove());

  it('renders close button for dialog variant', async () => {
    el = createModal();
    await el.updateComplete;
    const btn = el.shadowRoot!.querySelector('.close-btn');
    expect(btn).not.toBeNull();
  });

  it('hides close button for alertdialog variant', async () => {
    el = createModal();
    el.variant = 'alertdialog';
    await el.updateComplete;
    const btn = el.shadowRoot!.querySelector('.close-btn');
    expect(btn).toBeNull();
  });

  it('no-close-button hides close button for dialog', async () => {
    el = createModal();
    el.noCloseButton = true;
    await el.updateComplete;
    const btn = el.shadowRoot!.querySelector('.close-btn');
    expect(btn).toBeNull();
  });
});

describe('pages-modal — escape handling', () => {
  let el: PagesModal;

  afterEach(() => el?.remove());

  it('routes native cancel event through requestClose', async () => {
    el = createModal();
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;

    const cancelHandler = vi.fn();
    el.addEventListener('pages-modal-cancel', cancelHandler);

    const dialog = el.shadowRoot!.querySelector('dialog')!;
    const cancelEvent = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancelEvent);

    expect(cancelHandler).toHaveBeenCalledOnce();
  });

  it('prevents native cancel default to control close lifecycle', async () => {
    el = createModal();
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;

    const dialog = el.shadowRoot!.querySelector('dialog')!;
    const cancelEvent = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancelEvent);

    expect(cancelEvent.defaultPrevented).toBe(true);
  });
});

describe('pages-modal — backdrop click', () => {
  let el: PagesModal;

  afterEach(() => el?.remove());

  it('closes on backdrop click for dialog variant', async () => {
    el = createModal();
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;

    const dialog = el.shadowRoot!.querySelector('dialog')!;
    const clickEvent = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(clickEvent, 'target', { value: dialog });
    dialog.dispatchEvent(clickEvent);

    await el.updateComplete;
    expect(el.open).toBe(false);
  });

  it('does not close on backdrop click for alertdialog', async () => {
    el = createModal();
    el.variant = 'alertdialog';
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;

    const dialog = el.shadowRoot!.querySelector('dialog')!;
    const clickEvent = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(clickEvent, 'target', { value: dialog });
    dialog.dispatchEvent(clickEvent);

    await el.updateComplete;
    expect(el.open).toBe(true);
  });

  it('close-on-backdrop=false disables backdrop close', async () => {
    el = createModal();
    el.closeOnBackdrop = false;
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;

    const dialog = el.shadowRoot!.querySelector('dialog')!;
    const clickEvent = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(clickEvent, 'target', { value: dialog });
    dialog.dispatchEvent(clickEvent);

    await el.updateComplete;
    expect(el.open).toBe(true);
  });

  it('does not close on click inside modal surface', async () => {
    el = createModal();
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;

    const surface = el.shadowRoot!.querySelector('.modal-surface')!;
    const clickEvent = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(clickEvent, 'target', { value: surface });
    el.shadowRoot!.querySelector('dialog')!.dispatchEvent(clickEvent);

    await el.updateComplete;
    expect(el.open).toBe(true);
  });
});

describe('pages-modal — size variants', () => {
  let el: PagesModal;

  afterEach(() => el?.remove());

  it('defaults to md size', async () => {
    el = createModal();
    await el.updateComplete;
    expect(el.size).toBe('md');
    const dialog = el.shadowRoot!.querySelector('dialog')!;
    expect(dialog.classList.contains('size-md')).toBe(true);
  });

  it('applies size-lg class', async () => {
    el = createModal();
    el.size = 'lg';
    await el.updateComplete;
    const dialog = el.shadowRoot!.querySelector('dialog')!;
    expect(dialog.classList.contains('size-lg')).toBe(true);
  });

  it('applies size-sm class', async () => {
    el = createModal();
    el.size = 'sm';
    await el.updateComplete;
    const dialog = el.shadowRoot!.querySelector('dialog')!;
    expect(dialog.classList.contains('size-sm')).toBe(true);
  });

  it('applies size-full class', async () => {
    el = createModal();
    el.size = 'full';
    await el.updateComplete;
    const dialog = el.shadowRoot!.querySelector('dialog')!;
    expect(dialog.classList.contains('size-full')).toBe(true);
  });
});

describe('pages-modal — scroll lock', () => {
  let el: PagesModal;

  afterEach(() => {
    el?.remove();
    document.body.style.overflow = '';
  });

  it('locks body scroll on open', async () => {
    el = createModal();
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('restores body scroll on close', async () => {
    document.body.style.overflow = 'auto';
    el = createModal();
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;
    el.open = false;
    await el.updateComplete;
    expect(document.body.style.overflow).toBe('auto');
  });
});

describe('pages-modal — form close', () => {
  let el: PagesModal;

  afterEach(() => el?.remove());

  it('fires pages-modal-close via native close event (method="dialog" path)', async () => {
    el = createModal();
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;

    const closeHandler = vi.fn();
    el.addEventListener('pages-modal-close', closeHandler);

    const dialog = el.shadowRoot!.querySelector('dialog')!;
    dialog.close('submitted');
    await el.updateComplete;

    expect(closeHandler).toHaveBeenCalledOnce();
    expect((closeHandler.mock.calls[0]![0] as CustomEvent).detail.returnValue).toBe('submitted');
    expect(el.open).toBe(false);
  });
});

describe('pages-modal — slots', () => {
  let el: PagesModal;

  afterEach(() => el?.remove());

  it('renders header slot', async () => {
    el = createModal();
    await el.updateComplete;
    const slot = el.shadowRoot!.querySelector('slot[name="header"]');
    expect(slot).not.toBeNull();
  });

  it('renders default slot', async () => {
    el = createModal();
    await el.updateComplete;
    const slot = el.shadowRoot!.querySelector('slot:not([name])');
    expect(slot).not.toBeNull();
  });

  it('renders actions slot', async () => {
    el = createModal();
    await el.updateComplete;
    const slot = el.shadowRoot!.querySelector('slot[name="actions"]');
    expect(slot).not.toBeNull();
  });
});

describe('pages-modal — cleanup', () => {
  it('restores state when disconnected while open', async () => {
    document.body.style.overflow = 'auto';
    const el = createModal();
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;
    expect(document.body.style.overflow).toBe('hidden');

    el.remove();
    expect(document.body.style.overflow).toBe('auto');
  });
});
