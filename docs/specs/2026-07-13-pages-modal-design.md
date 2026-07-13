# pages-modal — Accessible Modal Dialog Component

**Issue:** casehubio/casehub-pages#139
**Date:** 2026-07-13
**Package:** `@casehubio/pages-primitives`
**Status:** Approved

## Overview

`<pages-modal>` is an accessible modal dialog component built on the native
`<dialog>` element with `showModal()`. It composes `FocusTrapMixin` from
`pages-primitives` to supplement native focus management where the platform
falls short (focus-escaping-to-browser-chrome via Tab).

Native `<dialog>` with `showModal()` and `aria-labelledby` already announces
the dialog title to screen readers (NVDA, JAWS, VoiceOver) — no
`LiveRegionMixin` is needed. Using `LiveRegionMixin` would place the live
region on `document.body`, which is inert while a modal dialog is open via
`showModal()`, causing announcements to be silently swallowed.

Supports two variants: `dialog` (standard, with close button and backdrop
dismiss) and `alertdialog` (confirmation, no close button, no backdrop
dismiss). Both use the same component — the variant attribute controls
behaviour defaults.

### Consumers

- blocks-ui `<blocks-confirm-dialog>` — refactor to compose `<pages-modal variant="alertdialog">`
- openclaw `<gate-approval-modal>` — refactor to compose `<pages-modal>` with domain content in slots
- `PagesDevAuth` — refactor to compose `<pages-modal>` for its login overlay
- Any future domain component needing an overlay

## Architecture Decisions

### Native `<dialog>` with `showModal()`

The native `<dialog>` element opened via `showModal()` provides:

- **Top-layer rendering** — no z-index management needed
- **`::backdrop` pseudo-element** — browser-managed backdrop
- **`inert` on background content** — removed from a11y tree, blocks clicks/keyboard
- **Escape-to-close** via native `cancel` event
- **Implicit `role="dialog"` + `aria-modal="true"`**
- **Focus moves into dialog on open, returns to opener on close**

Gaps supplemented by our component:

- **Focus trapping** — native `<dialog>` allows focus to escape to browser chrome. `FocusTrapMixin` wraps Tab/Shift+Tab within the modal, collecting focusable elements from both shadow DOM and slotted light DOM content via `slot.assignedElements({flatten: true})`. (See: [Nolan Lawson — Dialogs and shadow DOM](https://nolanlawson.com/2022/06/14/dialogs-and-shadow-dom-can-we-make-it-accessible/))
- **Scroll locking** — native `<dialog>` does not prevent body scroll. Manual `overflow: hidden` with scroll position save/restore
- **Backdrop click-to-close** — not built-in. Detected by comparing click target to `<dialog>` element
- **Close button** — built-in for `dialog` variant, suppressed for `alertdialog`; overridable via `no-close-button` attribute
- **`requestClose()` over `close()`** — fires `cancel` event first for unsaved-changes guards (Baseline 2025)

### Lit Component in `pages-primitives`

Per the web-component-strategy protocol: interactive UI with reactive state,
user input, and a11y composition → Lit. The modal is a UI primitive alongside
the a11y mixins it composes.

## Component API

### Properties / Attributes

| Property | Attribute | Type | Default | Description |
|----------|-----------|------|---------|-------------|
| `open` | `open` | `boolean` | `false` | Opens/closes the modal. `true` → `showModal()`. `false` → immediate close: calls `dialog.close()` directly, restores focus/scroll, no cancel event, no animation. This is the imperative close path — it always succeeds. For polite close with cancel guard and animation, use `requestClose()` |
| `variant` | `variant` | `'dialog' \| 'alertdialog'` | `'dialog'` | Sets ARIA role; controls close button and backdrop click defaults |
| `size` | `size` | `'sm' \| 'md' \| 'lg' \| 'full'` | `'md'` | Max-width: sm=400px, md=600px, lg=800px, full=viewport |
| `noCloseButton` | `no-close-button` | `boolean` | `false` | Override close button visibility (overrides variant default) |
| `closeOnBackdrop` | `close-on-backdrop` | `boolean` | `true` (dialog) / `false` (alertdialog) | Whether backdrop clicks close the modal |
| `returnValue` | — | `string` | `''` | Proxies native `<dialog>.returnValue` for `method="dialog"` forms |
| `ariaLabel` | `aria-label` | `string \| null` | `null` | Fallback accessible name when header slot is empty. If header slot has assigned content, `aria-labelledby` is used. If header slot is empty and `ariaLabel` is set, `aria-label` is used. If both are empty, a dev-mode console warning is emitted |

### Slots

| Slot | Purpose |
|------|---------|
| `header` | Dialog title — auto-wired to `aria-labelledby` |
| *(default)* | Body content |
| `actions` | Footer buttons / action area |

### Events

| Event | Detail | When |
|-------|--------|------|
| `pages-modal-close` | `{ returnValue: string }` | After the modal closes |
| `pages-modal-cancel` | — | When close is requested, before it happens (cancelable — `preventDefault()` blocks close) |

**Protocol obligation:** Both events use the `pages-*` prefix reserved for
framework-internal events. Update `pages-event-contract.md` reserved names
table with `pages-modal-close` and `pages-modal-cancel` in the
implementation commit to prevent namespace collisions.

### Methods

| Method | Description |
|--------|-------------|
| `requestClose(returnValue?)` | Preferred close path — fires cancel event first, then closes if not prevented |

## Internal Structure

### Composition

```typescript
class PagesModal extends FocusTrapMixin(LitElement)
```

### Shadow DOM Template

```html
<dialog
  role="${this.variant}"
  aria-labelledby="${this._hasHeaderContent ? 'modal-header' : nothing}"
  aria-label="${!this._hasHeaderContent && this.ariaLabel ? this.ariaLabel : nothing}"
  aria-modal="true"
  @cancel="${this._handleCancel}"
  @close="${this._handleNativeClose}"
  @click="${this._handleBackdropClick}"
>
  <div class="modal-surface">
    <header class="modal-header">
      <div id="modal-header">
        <slot name="header" @slotchange="${this._onHeaderSlotChange}"></slot>
      </div>
      ${showCloseButton ? closeButton : nothing}
    </header>
    <div class="modal-body"><slot></slot></div>
    <footer class="modal-actions"><slot name="actions"></slot></footer>
  </div>
</dialog>
```

`_onHeaderSlotChange` sets `_hasHeaderContent` by checking
`slot.assignedNodes().length > 0`. When the header slot is empty and
`ariaLabel` is also null, emit a dev-mode console warning: "pages-modal
opened without an accessible name — provide header slot content or set
aria-label."

### Open/Close Lifecycle

**Opening (`open` transitions `false → true`):**
1. If `_isAnimating` → abort (guard against rapid toggle)
2. Save `window.scrollY`
3. Set `document.body.style.overflow = 'hidden'`
4. Call `dialog.showModal()` — native dialog + `aria-labelledby`/`aria-label` announces title to screen readers
5. Call `trapFocus(modalSurface)` — collects focusable elements from shadow DOM and slotted content

**Closing via `requestClose()` (polite close):**
1. If `_isAnimating` → abort
2. Fire `pages-modal-cancel` CustomEvent (cancelable)
3. If prevented → abort
4. Set `_isAnimating = true`
5. If `prefers-reduced-motion: reduce` matches → skip to step 7
6. Add `.closing` class (triggers exit animation) → on `animationend` → continue
7. Call `dialog.close(returnValue)` — cleanup via `_handleNativeClose` (see below)

**Closing via `open = false` (imperative close):**
1. Cancel any pending animation (remove `.closing`, clear listener)
2. Call `dialog.close()` directly — no cancel event, no animation
3. Cleanup via `_handleNativeClose` (see below)

**Closing via `method="dialog"` form submission (browser-initiated):**
1. Browser calls `dialog.close(submitButtonValue)` directly
2. Cleanup via `_handleNativeClose` (see below)

The imperative close always succeeds — consumers use `open = false` for
programmatic control (e.g., navigation, parent re-render). `requestClose()` is
for user-initiated actions (Escape, backdrop click, close button) where
unsaved-changes guards may prevent closure.

**`_handleNativeClose` — single cleanup point:**

All close paths converge on the native `close` event, which fires whenever
`dialog.close()` is called regardless of the caller (component code, form
submission, or browser). The handler is idempotent:

1. If already closed (guard) → return
2. Set `_isAnimating = false`
3. Call `releaseFocus()` (restores focus to opener)
4. Restore `document.body.style.overflow`
5. Restore scroll position with `window.scrollTo()`
6. Set `this.open = false` (sync property with DOM state)
7. Fire `pages-modal-close` with `{ returnValue: dialog.returnValue }`

This consolidation ensures that `method="dialog"` form submissions,
imperative `open = false`, and polite `requestClose()` all perform
identical cleanup. No close path can silently corrupt component state.

### Modal Stacking

Modal stacking is supported via native top-layer stacking. Each
`showModal()` call pushes a new dialog onto the top layer; only the
topmost dialog is interactive (lower dialogs are made inert by the
browser). Each modal independently manages its own scroll lock and
focus trap.

Modals must close in LIFO order. Programmatic out-of-order close (e.g.,
closing a parent modal before its child) is not supported — the child
modal must be closed first.

### Disconnection Cleanup

If the component is removed from the DOM while the modal is open (e.g.,
parent component re-renders), `disconnectedCallback` performs cleanup:

1. Release focus trap (inherited from `FocusTrapMixin.disconnectedCallback`)
2. Restore `document.body.style.overflow`
3. Restore scroll position
4. Cancel any pending animation

### Escape Handling

Native `<dialog>` fires `cancel` event on Escape. We intercept it:
`preventDefault()` the native event, then route through our `requestClose()`
flow so the `pages-modal-cancel` event fires and consumers can block it.

### Backdrop Click Detection

Click handler on `<dialog>`: `e.target === dialog` means the click landed on
the backdrop (not the `.modal-surface`). If `closeOnBackdrop` is true, call
`requestClose()`.

## Styling

### Token Usage

```css
/* Surface */
background: var(--pages-neutral-1);
border-radius: var(--pages-radius-lg);
box-shadow: var(--pages-shadow-4);

/* Backdrop — customisable via CSS custom property */
dialog::backdrop {
  background: var(--pages-modal-backdrop, oklch(0% 0 0 / 0.5));
}

/* Typography */
font-family: var(--pages-font-family);
color: var(--pages-neutral-12);

/* Spacing */
padding: var(--pages-space-6);
section gap: var(--pages-space-4);
```

### Size Variants

| Size | max-width | Use case |
|------|-----------|----------|
| `sm` | `400px` | Confirmations, simple alerts |
| `md` | `600px` | Forms, standard content |
| `lg` | `800px` | Tables, rich content |
| `full` | `calc(100vw - var(--pages-space-8))` | Full-screen takeover |

All sizes capped at `min(size, 90vw)`. Height is content-driven with
`max-height: calc(100vh - var(--pages-space-8))` and `overflow-y: auto`
on the body section.

### Animation

```css
dialog[open] {
  animation: modal-enter var(--pages-duration-fast) var(--pages-ease-out);
}
dialog[open]::backdrop {
  animation: backdrop-enter var(--pages-duration-fast) var(--pages-ease-out);
}

@keyframes modal-enter {
  from { opacity: 0; transform: translateY(8px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes backdrop-enter {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* Exit — applied via .closing class before close() */
@keyframes modal-exit {
  to { opacity: 0; transform: translateY(8px) scale(0.97); }
}
@keyframes backdrop-exit {
  to { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  dialog[open], dialog[open]::backdrop,
  dialog.closing, dialog.closing::backdrop { animation: none; }
}
```

Exit flow: add `.closing` class → listen for `animationend` → call
`dialog.close()` → remove class. Under `prefers-reduced-motion: reduce`,
skip the animation step entirely (check
`window.matchMedia('(prefers-reduced-motion: reduce)').matches` and call
`dialog.close()` directly).

### Close Button

Borderless, transparent background. Icon color `--pages-neutral-9`, hover
`--pages-neutral-11`. Touch target `var(--pages-space-8)`. Visually
positioned top-right; DOM order after heading for screen reader flow.

## File Layout

```
packages/pages-primitives/src/
  a11y/
    focus-trap.ts
    keyboard-shortcut.ts
    live-region.ts
    roving-tabindex.ts
    index.ts
  modal/
    pages-modal.ts
    pages-modal.test.ts
    index.ts
  index.ts          ← adds: export * from './modal/index.js';
```

## Test Plan

| Category | Cases |
|----------|-------|
| **Open/close** | `open=true` calls `showModal()`, `open=false` calls `close()`, re-open after close |
| **ARIA** | `role="dialog"` default, `role="alertdialog"` when variant set, `aria-labelledby` wired to header, `aria-modal="true"` |
| **Focus** | Focus moves into modal on open, returns to opener on close, Tab/Shift+Tab wrap within modal |
| **Escape** | Fires `pages-modal-cancel`, closes if not prevented, `preventDefault()` blocks close |
| **Backdrop click** | Closes dialog variant, does not close alertdialog, `close-on-backdrop=false` disables |
| **Close button** | Rendered for dialog, hidden for alertdialog, `no-close-button` overrides both directions |
| **Size variants** | sm/md/lg/full set correct max-width |
| **Scroll lock** | Body `overflow: hidden` when open, restored on close, scroll position preserved |
| **returnValue** | `requestClose('confirm')` sets returnValue, `pages-modal-close` carries it |
| **Form close** | `method="dialog"` form submit calls `dialog.close()`, cleanup runs via native `close` event, `pages-modal-close` fires with form's returnValue, focus/scroll restored |
| **Cancel guard** | `pages-modal-cancel` is cancelable, preventing it keeps modal open |
| **Accessible name** | `aria-labelledby` used when header slot has content, `aria-label` used when header slot empty and `ariaLabel` property set, dev-mode warning when neither present |
| **Animation** | `.closing` class applied during exit, `animationend` triggers close |
| **Slots** | Header, default, and actions slots render content |
| **Cleanup** | Disconnecting while open releases focus trap, restores scroll |

**jsdom note:** `showModal()` and `close()` are not implemented in jsdom.
Tests stub `HTMLDialogElement.prototype.showModal` and `.close()`.

### Playwright Tests (browser-based)

The modal's core behaviour depends on native browser APIs that jsdom cannot
simulate. Playwright tests cover:

| Category | Cases |
|----------|-------|
| **showModal()** | Open renders in top layer, backdrop visible, background content is inert |
| **Focus trap** | Tab/Shift+Tab wrap within modal, focus doesn't escape to browser chrome |
| **Escape** | Fires cancel, closes if not prevented, `preventDefault()` blocks close |
| **Backdrop click** | Click outside modal surface closes dialog variant, not alertdialog |
| **Animation** | Exit animation plays, `prefers-reduced-motion` disables animation and modal still closes |
| **Stacking** | Opening second modal makes first inert, closing restores interaction |
| **Form close** | `method="dialog"` form submit closes modal, fires `pages-modal-close`, restores focus/scroll |
| **Scroll lock** | Body scroll disabled while open, restored on close with position preserved |

These tests run against the existing Playwright infrastructure in
`examples/playwright.config.ts`.

## References

- [Nolan Lawson — Dialogs and shadow DOM](https://nolanlawson.com/2022/06/14/dialogs-and-shadow-dom-can-we-make-it-accessible/)
- [Jared Cunha — HTML dialog: Getting accessibility and UX right](https://jaredcunha.com/blog/html-dialog-getting-accessibility-and-ux-right)
- [W3C WAI — Modal Dialog Example](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/dialog/)
- [GE-20260617-cc0834 — Shadow DOM keyboard event retargeting](garden entry)
- [css-design-tokens protocol](docs/protocols/casehub/css-design-tokens.md)
- [web-component-strategy protocol](docs/protocols/casehub/web-component-strategy.md)
