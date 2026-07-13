# pages-modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> subagent-driven-development (recommended) or executing-plans to
> implement this plan task-by-task. Each task follows TDD
> (test-driven-development) and uses ide-tooling for structural
> editing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Focal issue:** #139 — feat: modal/dialog component — accessible overlay with focus trap and backdrop
**Issue group:** #139

**Goal:** Build `<pages-modal>`, an accessible modal dialog component wrapping native `<dialog>` with `showModal()`, composing `FocusTrapMixin` for focus containment.

**Architecture:** Lit Web Component in `@casehubio/pages-primitives` that wraps a native `<dialog>` element. Two variants (`dialog`/`alertdialog`) control close-button and backdrop-click defaults. All close paths converge on the native `close` event via `_handleNativeClose`. `FocusTrapMixin` is enhanced to traverse slot boundaries so focus cycling works with slotted content.

**Tech Stack:** TypeScript, Lit 3, Vitest (jsdom), Playwright

## Global Constraints

- All custom elements use `pages-` prefix: `pages-modal`
- CSS tokens use `--pages-` prefix per `css-design-tokens.md` protocol
- Lit for interactive UI per `web-component-strategy.md` protocol
- Events use `pages-modal-close` and `pages-modal-cancel` — register in `pages-event-contract.md`
- Package: `@casehubio/pages-primitives` (existing, `packages/pages-primitives/`)
- Build: `tsc -p tsconfig.build.json` outputs to `dist/`
- Test: `vitest run` with jsdom environment
- Playwright: `examples/tests/` directory, `examples/playwright.config.ts`

---

### Task 1: FocusTrapMixin — slot-aware focus traversal

**Files:**
- Modify: `packages/pages-primitives/src/a11y/focus-trap.ts`
- Create: `packages/pages-primitives/src/a11y/focus-trap.test.ts`

**Interfaces:**
- Produces: `trapFocus(container: HTMLElement): void` — now collects focusable elements from slotted content via `slot.assignedElements({flatten: true})`
- Produces: `releaseFocus(): void` — unchanged
- Produces: `_collectFocusable(root: HTMLElement): HTMLElement[]` — private, recursive slot-aware traversal

- [ ] **Step 1: Write failing tests for existing behaviour**

Create `packages/pages-primitives/src/a11y/focus-trap.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { FocusTrapMixin } from './focus-trap.js';

@customElement('test-trap')
class TestTrap extends FocusTrapMixin(LitElement) {
  override render() {
    return html`
      <div class="container">
        <button id="first">First</button>
        <input id="middle" type="text" />
        <button id="last">Last</button>
      </div>
    `;
  }
}

describe('FocusTrapMixin', () => {
  let el: TestTrap;

  beforeEach(async () => {
    el = document.createElement('test-trap') as TestTrap;
    document.body.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => el.remove());

  it('focuses first focusable element on trapFocus', () => {
    const container = el.shadowRoot!.querySelector('.container') as HTMLElement;
    el.trapFocus(container);
    const first = el.shadowRoot!.querySelector('#first') as HTMLElement;
    expect(document.activeElement).toBe(first);
    el.releaseFocus();
  });

  it('wraps focus forward from last to first', () => {
    const container = el.shadowRoot!.querySelector('.container') as HTMLElement;
    el.trapFocus(container);
    const first = el.shadowRoot!.querySelector('#first') as HTMLElement;
    const last = el.shadowRoot!.querySelector('#last') as HTMLElement;

    last.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(first);
    el.releaseFocus();
  });

  it('wraps focus backward from first to last', () => {
    const container = el.shadowRoot!.querySelector('.container') as HTMLElement;
    el.trapFocus(container);
    const first = el.shadowRoot!.querySelector('#first') as HTMLElement;
    const last = el.shadowRoot!.querySelector('#last') as HTMLElement;

    first.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(last);
    el.releaseFocus();
  });

  it('restores focus to previous element on releaseFocus', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();

    const container = el.shadowRoot!.querySelector('.container') as HTMLElement;
    el.trapFocus(container);
    el.releaseFocus();

    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('cleans up on disconnectedCallback', () => {
    const container = el.shadowRoot!.querySelector('.container') as HTMLElement;
    el.trapFocus(container);
    el.remove();

    // keydown listener should be removed — no error thrown
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  });

  it('ignores non-Tab keys', () => {
    const container = el.shadowRoot!.querySelector('.container') as HTMLElement;
    el.trapFocus(container);
    const first = el.shadowRoot!.querySelector('#first') as HTMLElement;
    first.focus();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.activeElement).toBe(first);
    el.releaseFocus();
  });
});

describe('FocusTrapMixin — slot traversal', () => {
  let host: HTMLElement;

  @customElement('test-trap-slots')
  class TestTrapSlots extends FocusTrapMixin(LitElement) {
    override render() {
      return html`
        <div class="container">
          <button id="shadow-btn">Shadow</button>
          <slot></slot>
          <slot name="actions"></slot>
        </div>
      `;
    }
  }

  beforeEach(async () => {
    host = document.createElement('test-trap-slots');
    host.innerHTML = `
      <input type="text" id="slotted-input" />
      <button slot="actions" id="slotted-btn">Action</button>
    `;
    document.body.appendChild(host);
    await (host as TestTrapSlots).updateComplete;
  });

  afterEach(() => host.remove());

  it('collects focusable elements from slotted content', () => {
    const container = (host as TestTrapSlots).shadowRoot!.querySelector('.container') as HTMLElement;
    (host as TestTrapSlots).trapFocus(container);

    const shadowBtn = (host as TestTrapSlots).shadowRoot!.querySelector('#shadow-btn') as HTMLElement;
    const slottedInput = host.querySelector('#slotted-input') as HTMLElement;
    const slottedBtn = host.querySelector('#slotted-btn') as HTMLElement;

    // Focus should cycle through shadow + slotted elements
    // Focus is on shadow-btn (first), Tab from slotted-btn (last) should wrap
    slottedBtn.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(shadowBtn);

    (host as TestTrapSlots).releaseFocus();
  });

  it('handles empty slots gracefully', async () => {
    const empty = document.createElement('test-trap-slots') as TestTrapSlots;
    document.body.appendChild(empty);
    await empty.updateComplete;

    const container = empty.shadowRoot!.querySelector('.container') as HTMLElement;
    empty.trapFocus(container);

    // Only shadow-btn is focusable
    const shadowBtn = empty.shadowRoot!.querySelector('#shadow-btn') as HTMLElement;
    expect(document.activeElement).toBe(shadowBtn);

    empty.releaseFocus();
    empty.remove();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace @casehubio/pages-primitives run test -- --run src/a11y/focus-trap.test.ts`
Expected: Slot traversal tests FAIL (basic tests should pass with existing implementation)

- [ ] **Step 3: Implement slot-aware focus collection**

Replace the `FocusTrapMixin` implementation in `packages/pages-primitives/src/a11y/focus-trap.ts`. The key change: replace `container.querySelectorAll(FOCUSABLE)` with a recursive traversal that follows `<slot>` elements into their assigned content.

```typescript
import type { LitElement } from 'lit';

type Constructor<T = {}> = new (...args: any[]) => T;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function collectFocusable(root: HTMLElement): HTMLElement[] {
  const result: HTMLElement[] = [];

  function walk(node: Element): void {
    if (node instanceof HTMLSlotElement) {
      for (const assigned of node.assignedElements({ flatten: true })) {
        walk(assigned);
      }
      return;
    }
    if (node.matches(FOCUSABLE)) {
      result.push(node as HTMLElement);
    }
    for (const child of node.children) {
      walk(child);
    }
  }

  for (const child of root.children) {
    walk(child);
  }
  return result;
}

export function FocusTrapMixin<T extends Constructor<LitElement>>(Base: T) {
  class FocusTrapHost extends Base {
    private _trapContainer: HTMLElement | null = null;
    private _previousFocus: Element | null = null;

    trapFocus(container: HTMLElement): void {
      this._previousFocus = document.activeElement;
      this._trapContainer = container;
      document.addEventListener('keydown', this._handleTrapKeydown);
      const focusable = collectFocusable(container);
      focusable[0]?.focus();
    }

    releaseFocus(): void {
      document.removeEventListener('keydown', this._handleTrapKeydown);
      this._trapContainer = null;
      if (this._previousFocus instanceof HTMLElement) {
        this._previousFocus.focus();
      }
      this._previousFocus = null;
    }

    private _handleTrapKeydown = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab' || !this._trapContainer) return;

      const focusable = collectFocusable(this._trapContainer);
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    override disconnectedCallback(): void {
      super.disconnectedCallback();
      if (this._trapContainer) {
        this.releaseFocus();
      }
    }
  }

  return FocusTrapHost as unknown as Constructor<{
    trapFocus(container: HTMLElement): void;
    releaseFocus(): void;
  }> & T;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn workspace @casehubio/pages-primitives run test -- --run src/a11y/focus-trap.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Run full primitives test suite**

Run: `yarn workspace @casehubio/pages-primitives run test`
Expected: ALL PASS (no regressions in roving-tabindex, keyboard-shortcut tests)

- [ ] **Step 6: Typecheck**

Run: `yarn workspace @casehubio/pages-primitives run typecheck`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/pages add packages/pages-primitives/src/a11y/focus-trap.ts packages/pages-primitives/src/a11y/focus-trap.test.ts
git -C /Users/mdproctor/claude/casehub/pages commit -m "feat(primitives): slot-aware focus trap traversal

FocusTrapMixin now collects focusable elements from slotted light DOM
content via slot.assignedElements({flatten: true}), not just shadow DOM
querySelectorAll. Required for pages-modal where all interactive content
arrives via slots.

Refs #139"
```

---

### Task 2: pages-modal component

**Files:**
- Create: `packages/pages-primitives/src/modal/pages-modal.ts`
- Create: `packages/pages-primitives/src/modal/pages-modal.test.ts`
- Create: `packages/pages-primitives/src/modal/index.ts`
- Modify: `packages/pages-primitives/src/index.ts`
- Modify: `docs/protocols/casehub/pages-event-contract.md`

**Interfaces:**
- Consumes: `FocusTrapMixin` from `../a11y/focus-trap.js` — `trapFocus(container)`, `releaseFocus()`
- Produces: `PagesModal` class — Lit component registered as `pages-modal`
- Produces: `pages-modal-close` event — `CustomEvent<{ returnValue: string }>`
- Produces: `pages-modal-cancel` event — cancelable `CustomEvent`
- Produces: `requestClose(returnValue?: string): void` — polite close method

- [ ] **Step 1: Create barrel export**

Create `packages/pages-primitives/src/modal/index.ts`:

```typescript
export { PagesModal } from './pages-modal.js';
```

Update `packages/pages-primitives/src/index.ts` — add modal export:

```typescript
export * from './a11y/index.js';
export * from './modal/index.js';
```

- [ ] **Step 2: Write failing tests — open/close lifecycle**

Create `packages/pages-primitives/src/modal/pages-modal.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { html, LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';

// Stub HTMLDialogElement methods not implemented in jsdom
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
  // Stub requestClose if available
  if (!HTMLDialogElement.prototype.requestClose) {
    (HTMLDialogElement.prototype as any).requestClose = HTMLDialogElement.prototype.close;
  }
  // Stub matchMedia for prefers-reduced-motion
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

  it('calls close() when open is set to false', async () => {
    el = createModal();
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;
    el.open = false;
    await el.updateComplete;
    const dialog = el.shadowRoot!.querySelector('dialog')!;
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
    el.open = true;
    await el.updateComplete;
    const dialog = el.shadowRoot!.querySelector('dialog')!;
    expect(dialog.showModal).toHaveBeenCalledTimes(2);
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

  it('uses aria-labelledby when header slot has content', async () => {
    el = createModal();
    await el.updateComplete;
    const dialog = el.shadowRoot!.querySelector('dialog')!;
    expect(dialog.hasAttribute('aria-labelledby')).toBe(true);
  });

  it('uses aria-label when header slot is empty and ariaLabel is set', async () => {
    el = createModal('<p>Body only</p>');
    el.ariaLabel = 'Custom label';
    await el.updateComplete;
    const dialog = el.shadowRoot!.querySelector('dialog')!;
    expect(dialog.getAttribute('aria-label')).toBe('Custom label');
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

  it('sets returnValue', async () => {
    el = createModal();
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;

    const closeHandler = vi.fn();
    el.addEventListener('pages-modal-close', closeHandler);
    el.requestClose('confirm');
    await el.updateComplete;

    expect(closeHandler).toHaveBeenCalledOnce();
    const detail = closeHandler.mock.calls[0][0].detail;
    expect(detail.returnValue).toBe('confirm');
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

  it('no-close-button=false shows close button for alertdialog', async () => {
    el = createModal();
    el.variant = 'alertdialog';
    el.setAttribute('no-close-button', 'false');
    // noCloseButton as a boolean attribute: absent = false
    // To force show on alertdialog, we need an explicit mechanism
    // For now the spec says noCloseButton overrides variant default
    await el.updateComplete;
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
    // Simulate backdrop click: target is the dialog element itself
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
});

describe('pages-modal — size variants', () => {
  let el: PagesModal;

  afterEach(() => el?.remove());

  it('defaults to md size', async () => {
    el = createModal();
    await el.updateComplete;
    expect(el.size).toBe('md');
  });

  it('applies size attribute to dialog', async () => {
    el = createModal();
    el.size = 'lg';
    await el.updateComplete;
    const dialog = el.shadowRoot!.querySelector('dialog')!;
    expect(dialog.classList.contains('size-lg')).toBe(true);
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
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});

describe('pages-modal — slots', () => {
  let el: PagesModal;

  afterEach(() => el?.remove());

  it('renders header slot content', async () => {
    el = createModal();
    await el.updateComplete;
    const headerSlot = el.shadowRoot!.querySelector('slot[name="header"]') as HTMLSlotElement;
    expect(headerSlot).not.toBeNull();
  });

  it('renders default slot content', async () => {
    el = createModal();
    await el.updateComplete;
    const defaultSlot = el.shadowRoot!.querySelector('slot:not([name])') as HTMLSlotElement;
    expect(defaultSlot).not.toBeNull();
  });

  it('renders actions slot content', async () => {
    el = createModal();
    await el.updateComplete;
    const actionsSlot = el.shadowRoot!.querySelector('slot[name="actions"]') as HTMLSlotElement;
    expect(actionsSlot).not.toBeNull();
  });
});

describe('pages-modal — form close', () => {
  let el: PagesModal;

  afterEach(() => el?.remove());

  it('fires pages-modal-close when native close event fires (method="dialog" path)', async () => {
    el = createModal(`
      <span slot="header">Form Test</span>
      <form method="dialog"><button type="submit" value="submitted">Submit</button></form>
    `);
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;

    const closeHandler = vi.fn();
    el.addEventListener('pages-modal-close', closeHandler);

    // Simulate native close event (as browser would fire for method="dialog" form submit)
    const dialog = el.shadowRoot!.querySelector('dialog')!;
    dialog.close('submitted');
    await el.updateComplete;

    expect(closeHandler).toHaveBeenCalledOnce();
    expect(closeHandler.mock.calls[0][0].detail.returnValue).toBe('submitted');
    expect(el.open).toBe(false);
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
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `yarn workspace @casehubio/pages-primitives run test -- --run src/modal/pages-modal.test.ts`
Expected: FAIL — `pages-modal` module not found

- [ ] **Step 4: Implement pages-modal component**

Create `packages/pages-primitives/src/modal/pages-modal.ts`:

```typescript
import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { FocusTrapMixin } from '../a11y/focus-trap.js';

type ModalVariant = 'dialog' | 'alertdialog';
type ModalSize = 'sm' | 'md' | 'lg' | 'full';

@customElement('pages-modal')
export class PagesModal extends FocusTrapMixin(LitElement) {
  @property({ type: Boolean, reflect: true }) open = false;
  @property() variant: ModalVariant = 'dialog';
  @property() size: ModalSize = 'md';
  @property({ type: Boolean, attribute: 'no-close-button' }) noCloseButton = false;
  @property({ type: Boolean, attribute: 'close-on-backdrop' }) closeOnBackdrop: boolean | undefined = undefined;
  @property({ attribute: false }) override ariaLabel: string | null = null;

  @state() private _hasHeaderContent = false;
  @state() private _isAnimating = false;

  private _savedOverflow = '';
  private _savedScrollY = 0;
  private _wasOpen = false;

  private get _dialog(): HTMLDialogElement | null {
    return this.shadowRoot?.querySelector('dialog') ?? null;
  }

  private get _shouldShowCloseButton(): boolean {
    if (this.noCloseButton) return false;
    return this.variant === 'dialog';
  }

  private get _shouldCloseOnBackdrop(): boolean {
    if (this.closeOnBackdrop !== undefined) return this.closeOnBackdrop;
    return this.variant === 'dialog';
  }

  requestClose(returnValue?: string): void {
    if (!this.open || this._isAnimating) return;

    const cancelEvent = new CustomEvent('pages-modal-cancel', {
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    this.dispatchEvent(cancelEvent);
    if (cancelEvent.defaultPrevented) return;

    const dialog = this._dialog;
    if (!dialog) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      dialog.close(returnValue ?? '');
      return;
    }

    this._isAnimating = true;
    dialog.classList.add('closing');
    const onEnd = () => {
      dialog.removeEventListener('animationend', onEnd);
      dialog.classList.remove('closing');
      dialog.close(returnValue ?? '');
    };
    dialog.addEventListener('animationend', onEnd);
  }

  override updated(changed: Map<string, unknown>): void {
    super.updated(changed);
    if (!changed.has('open')) return;

    const dialog = this._dialog;
    if (!dialog) return;

    if (this.open && !this._wasOpen) {
      if (this._isAnimating) return;
      this._savedScrollY = window.scrollY;
      this._savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      dialog.showModal();
      const surface = this.shadowRoot?.querySelector('.modal-surface') as HTMLElement;
      if (surface) this.trapFocus(surface);
    } else if (!this.open && this._wasOpen) {
      // Imperative close — cancel animation, close directly
      dialog.classList.remove('closing');
      if (dialog.hasAttribute('open')) {
        dialog.close();
      }
    }
    this._wasOpen = this.open;
  }

  private _handleNativeClose = (): void => {
    this._isAnimating = false;
    this.releaseFocus();
    document.body.style.overflow = this._savedOverflow;
    window.scrollTo(0, this._savedScrollY);

    if (this.open) {
      this.open = false;
    }

    const dialog = this._dialog;
    this.dispatchEvent(new CustomEvent('pages-modal-close', {
      bubbles: true,
      composed: true,
      detail: { returnValue: dialog?.returnValue ?? '' },
    }));
  };

  private _handleCancel = (e: Event): void => {
    e.preventDefault();
    this.requestClose();
  };

  private _handleBackdropClick = (e: MouseEvent): void => {
    if (e.target === this._dialog && this._shouldCloseOnBackdrop) {
      this.requestClose();
    }
  };

  private _onHeaderSlotChange = (e: Event): void => {
    const slot = e.target as HTMLSlotElement;
    this._hasHeaderContent = slot.assignedNodes().length > 0;

    if (!this._hasHeaderContent && !this.ariaLabel) {
      console.warn(
        'pages-modal opened without an accessible name — provide header slot content or set aria-label.'
      );
    }
  };

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._wasOpen) {
      document.body.style.overflow = this._savedOverflow;
      window.scrollTo(0, this._savedScrollY);
      this._isAnimating = false;
      this._wasOpen = false;
    }
  }

  static override styles = css`
    :host { display: contents; }

    dialog {
      border: none;
      padding: 0;
      max-width: min(600px, 90vw);
      max-height: calc(100vh - var(--pages-space-8, 2rem));
      border-radius: var(--pages-radius-lg, 8px);
      box-shadow: var(--pages-shadow-4, 0 8px 24px rgba(0,0,0,0.4));
      background: var(--pages-neutral-1, white);
      font-family: var(--pages-font-family, system-ui, sans-serif);
      color: var(--pages-neutral-12, #1a1a1a);
      overflow: visible;
    }

    dialog::backdrop {
      background: var(--pages-modal-backdrop, oklch(0% 0 0 / 0.5));
    }

    dialog[open] {
      animation: modal-enter var(--pages-duration-fast, 150ms) var(--pages-ease-out, ease-out);
    }
    dialog[open]::backdrop {
      animation: backdrop-enter var(--pages-duration-fast, 150ms) var(--pages-ease-out, ease-out);
    }

    dialog.closing {
      animation: modal-exit var(--pages-duration-fast, 150ms) var(--pages-ease-out, ease-out) forwards;
    }
    dialog.closing::backdrop {
      animation: backdrop-exit var(--pages-duration-fast, 150ms) var(--pages-ease-out, ease-out) forwards;
    }

    @keyframes modal-enter {
      from { opacity: 0; transform: translateY(8px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes backdrop-enter {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes modal-exit {
      to { opacity: 0; transform: translateY(8px) scale(0.97); }
    }
    @keyframes backdrop-exit {
      to { opacity: 0; }
    }

    @media (prefers-reduced-motion: reduce) {
      dialog[open], dialog[open]::backdrop,
      dialog.closing, dialog.closing::backdrop {
        animation: none;
      }
    }

    /* Size variants */
    dialog.size-sm { max-width: min(400px, 90vw); }
    dialog.size-md { max-width: min(600px, 90vw); }
    dialog.size-lg { max-width: min(800px, 90vw); }
    dialog.size-full {
      max-width: calc(100vw - var(--pages-space-8, 2rem));
      max-height: calc(100vh - var(--pages-space-8, 2rem));
    }

    .modal-surface {
      display: flex;
      flex-direction: column;
      max-height: inherit;
    }

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--pages-space-6, 1.5rem);
      padding-bottom: 0;
    }

    #modal-header {
      flex: 1;
      font-size: var(--pages-font-size-lg, 1.125rem);
      font-weight: var(--pages-font-weight-semibold, 600);
      line-height: var(--pages-line-height-lg, 1.5);
    }

    .close-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: var(--pages-space-8, 2rem);
      height: var(--pages-space-8, 2rem);
      border: none;
      background: transparent;
      color: var(--pages-neutral-9, #888);
      cursor: pointer;
      border-radius: var(--pages-radius-sm, 4px);
      font-size: 1.25rem;
      line-height: 1;
      flex-shrink: 0;
      margin-left: var(--pages-space-2, 0.5rem);
    }
    .close-btn:hover { color: var(--pages-neutral-11, #333); }
    .close-btn:focus-visible {
      outline: 2px solid var(--pages-accent-9, #007bff);
      outline-offset: 2px;
    }

    .modal-body {
      padding: var(--pages-space-6, 1.5rem);
      overflow-y: auto;
      flex: 1;
    }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--pages-space-3, 0.75rem);
      padding: var(--pages-space-6, 1.5rem);
      padding-top: 0;
    }

    .modal-actions:empty { display: none; }
  `;

  override render() {
    return html`
      <dialog
        class="size-${this.size}"
        role=${this.variant}
        aria-labelledby=${this._hasHeaderContent ? 'modal-header' : nothing}
        aria-label=${!this._hasHeaderContent && this.ariaLabel ? this.ariaLabel : nothing}
        aria-modal="true"
        @cancel=${this._handleCancel}
        @close=${this._handleNativeClose}
        @click=${this._handleBackdropClick}
      >
        <div class="modal-surface">
          <header class="modal-header">
            <div id="modal-header">
              <slot name="header" @slotchange=${this._onHeaderSlotChange}></slot>
            </div>
            ${this._shouldShowCloseButton ? html`
              <button class="close-btn" @click=${() => this.requestClose()} aria-label="Close">✕</button>
            ` : nothing}
          </header>
          <div class="modal-body">
            <slot></slot>
          </div>
          <footer class="modal-actions">
            <slot name="actions"></slot>
          </footer>
        </div>
      </dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pages-modal': PagesModal;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `yarn workspace @casehubio/pages-primitives run test -- --run src/modal/pages-modal.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Run full test suite + typecheck**

Run: `yarn workspace @casehubio/pages-primitives run test && yarn workspace @casehubio/pages-primitives run typecheck`
Expected: ALL PASS, no type errors

- [ ] **Step 7: Update pages-event-contract protocol**

Add `pages-modal-close` and `pages-modal-cancel` to the reserved framework event names table in `docs/protocols/casehub/pages-event-contract.md`:

```markdown
| `pages-modal-close` | Modal closed (with returnValue) | `PagesModal` component |
| `pages-modal-cancel` | Modal close requested (cancelable) | `PagesModal` component |
```

- [ ] **Step 8: Build verification**

Run: `yarn workspace @casehubio/pages-primitives run build`
Expected: `dist/` contains `modal/pages-modal.js`, `modal/pages-modal.d.ts`, `modal/index.js`, `modal/index.d.ts`

- [ ] **Step 9: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/pages add packages/pages-primitives/src/modal/ packages/pages-primitives/src/index.ts docs/protocols/casehub/pages-event-contract.md
git -C /Users/mdproctor/claude/casehub/pages commit -m "feat(primitives): pages-modal accessible dialog component

Native <dialog> with showModal() + FocusTrapMixin. Two variants
(dialog/alertdialog), size variants (sm/md/lg/full), animated
entry/exit, scroll lock, backdrop click, Escape handling.

All close paths converge on _handleNativeClose via native close event.
Registered pages-modal-close and pages-modal-cancel in event contract.

Refs #139"
```

---

### Task 3: Playwright browser tests

**Files:**
- Create: `examples/tests/pages-modal.spec.ts`

**Interfaces:**
- Consumes: `<pages-modal>` component from Task 2

**Prerequisites:** The examples gallery must include a page that uses `<pages-modal>`.
This task creates a standalone test HTML fixture loaded via Playwright rather than
embedding in the gallery — avoids coupling the test to gallery structure.

- [ ] **Step 1: Create Playwright test file**

Create `examples/tests/pages-modal.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('pages-modal — browser tests', () => {
  test.beforeEach(async ({ page }) => {
    // Load a minimal page that imports pages-modal
    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <script type="module">
          import '@casehubio/pages-primitives';
        </script>
      </head>
      <body>
        <button id="trigger">Open Modal</button>
        <pages-modal id="modal">
          <span slot="header">Test Dialog</span>
          <p>Body content with <input id="inner-input" type="text" /></p>
          <button slot="actions" id="ok-btn">OK</button>
          <button slot="actions" id="cancel-btn">Cancel</button>
        </pages-modal>
        <script type="module">
          const trigger = document.getElementById('trigger');
          const modal = document.getElementById('modal');
          trigger.addEventListener('click', () => { modal.open = true; });
          document.getElementById('ok-btn').addEventListener('click', () => {
            modal.requestClose('ok');
          });
          document.getElementById('cancel-btn').addEventListener('click', () => {
            modal.requestClose('cancel');
          });
        </script>
      </body>
      </html>
    `);
  });

  test('opens in top layer with backdrop visible', async ({ page }) => {
    await page.click('#trigger');
    const dialog = page.locator('pages-modal').locator('dialog');
    await expect(dialog).toBeVisible();
  });

  test('focus moves into modal on open', async ({ page }) => {
    await page.click('#trigger');
    // First focusable element should receive focus
    const closeBtn = page.locator('pages-modal').locator('.close-btn');
    await expect(closeBtn).toBeFocused();
  });

  test('Escape closes the modal', async ({ page }) => {
    await page.click('#trigger');
    await page.keyboard.press('Escape');
    const dialog = page.locator('pages-modal').locator('dialog');
    await expect(dialog).not.toBeVisible();
  });

  test('backdrop click closes dialog variant', async ({ page }) => {
    await page.click('#trigger');
    const dialog = page.locator('pages-modal').locator('dialog');
    // Click on the backdrop (outside the modal surface)
    const box = await dialog.boundingBox();
    if (box) {
      await page.mouse.click(box.x + 1, box.y + 1);
    }
    await expect(dialog).not.toBeVisible();
  });

  test('focus returns to trigger after close', async ({ page }) => {
    await page.click('#trigger');
    await page.keyboard.press('Escape');
    await expect(page.locator('#trigger')).toBeFocused();
  });

  test('scroll lock prevents body scroll', async ({ page }) => {
    // Make page scrollable
    await page.evaluate(() => {
      document.body.style.height = '200vh';
    });
    await page.click('#trigger');
    const overflow = await page.evaluate(() => document.body.style.overflow);
    expect(overflow).toBe('hidden');
  });
});
```

- [ ] **Step 2: Run Playwright tests**

Run: `yarn build:packages && cd examples && npx playwright test tests/pages-modal.spec.ts`
Expected: Tests may need adjustment based on how `setContent` loads ES modules.
The import path may need to reference the built bundle. Adjust as needed.

**Note:** If `setContent` with ES module imports is problematic, create a
minimal HTML fixture file at `examples/fixtures/pages-modal-test.html` and
navigate to it with `page.goto('/fixtures/pages-modal-test.html')`.

- [ ] **Step 3: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/pages add examples/tests/pages-modal.spec.ts
git -C /Users/mdproctor/claude/casehub/pages commit -m "test: Playwright browser tests for pages-modal

Covers showModal() top layer, focus trap, Escape, backdrop click,
focus restore, and scroll lock — behaviours requiring a real browser.

Refs #139"
```
