import { describe, it, expect, vi } from 'vitest';

describe('ToolbarButton', () => {
  it('should export ToolbarButton class', async () => {
    const { ToolbarButton } = await import('./toolbar-button.js');
    expect(ToolbarButton).toBeDefined();
    expect(typeof ToolbarButton).toBe('function');
  });

  it('should have correct default property values', async () => {
    const { ToolbarButton } = await import('./toolbar-button.js');
    const el = new ToolbarButton();
    expect(el.icon).toBe('');
    expect(el.tooltip).toBe('');
    expect(el.shortcut).toBe('');
    expect(el.active).toBe(false);
  });

  it('should register as custom element', async () => {
    await import('./toolbar-button.js');
    expect(customElements.get('toolbar-button')).toBeDefined();
  });
});
