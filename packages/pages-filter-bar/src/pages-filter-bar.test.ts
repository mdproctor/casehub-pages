import { describe, it, expect, afterEach, vi } from 'vitest';
import { columnId, ColumnType, fromRows } from '@casehubio/pages-data';
import type { TypedDataSet } from '@casehubio/pages-data';
import type { FilterState } from './types.js';
import './index.js';
import type { PagesFilterBar } from './pages-filter-bar.js';

function createTestDataSet(): TypedDataSet {
  const typeCol = columnId('type');
  const actorCol = columnId('actor');
  return fromRows(
    [
      { type: 'COMMAND', actor: 'alice' },
      { type: 'EVENT', actor: 'bob' },
      { type: 'COMMAND', actor: 'alice' },
      { type: 'ATTESTATION', actor: 'charlie' },
    ],
    [
      { id: typeCol, type: ColumnType.TEXT, getValue: (r: any) => r.type },
      { id: actorCol, type: ColumnType.TEXT, getValue: (r: any) => r.actor },
    ],
  );
}

async function createElement(attrs: Record<string, unknown> = {}): Promise<PagesFilterBar> {
  const el = document.createElement('pages-filter-bar') as PagesFilterBar;
  Object.entries(attrs).forEach(([key, value]) => {
    (el as any)[key] = value;
  });
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('PagesFilterBar', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('registers as a custom element', () => {
    expect(customElements.get('pages-filter-bar')).toBeDefined();
  });

  describe('chip filter', () => {
    it('renders chips from chipValues', async () => {
      const el = await createElement({
        chipValues: ['COMMAND', 'EVENT', 'ATTESTATION'],
      });
      const chips = el.shadowRoot!.querySelectorAll('[role="checkbox"]');
      expect(chips.length).toBe(3);
      expect(chips[0]?.textContent?.trim()).toBe('COMMAND');
      expect(chips[1]?.textContent?.trim()).toBe('EVENT');
      expect(chips[2]?.textContent?.trim()).toBe('ATTESTATION');
    });

    it('hides chip section when chipField and chipValues are omitted', async () => {
      const el = await createElement();
      const chips = el.shadowRoot!.querySelectorAll('[role="checkbox"]');
      expect(chips.length).toBe(0);
    });

    it('extracts chip values from dataSet when chipField is set', async () => {
      const ds = createTestDataSet();
      const el = await createElement({
        dataSet: ds,
        chipField: columnId('type'),
      });
      const chips = el.shadowRoot!.querySelectorAll('[role="checkbox"]');
      expect(chips.length).toBe(3);
      const labels = Array.from(chips).map(c => c.textContent?.trim());
      expect(labels).toContain('COMMAND');
      expect(labels).toContain('EVENT');
      expect(labels).toContain('ATTESTATION');
    });

    it('emits filter-change on chip toggle', async () => {
      const el = await createElement({
        chipValues: ['COMMAND', 'EVENT'],
      });
      const handler = vi.fn();
      el.addEventListener('filter-change', handler);

      const chip = el.shadowRoot!.querySelector('[role="checkbox"]') as HTMLElement;
      chip.click();
      await el.updateComplete;

      expect(handler).toHaveBeenCalledOnce();
      const detail = handler.mock.calls[0][0].detail as FilterState;
      expect(detail.selectedChips.includes('COMMAND')).toBe(true);
    });

    it('toggles chip off on second click', async () => {
      const el = await createElement({
        chipValues: ['COMMAND', 'EVENT'],
      });
      const handler = vi.fn();
      el.addEventListener('filter-change', handler);

      const chip = el.shadowRoot!.querySelector('[role="checkbox"]') as HTMLElement;
      chip.click();
      await el.updateComplete;
      chip.click();
      await el.updateComplete;

      expect(handler).toHaveBeenCalledTimes(2);
      const detail = handler.mock.calls[1][0].detail as FilterState;
      expect(detail.selectedChips.includes('COMMAND')).toBe(false);
    });

    it('sets aria-checked on selected chips', async () => {
      const el = await createElement({
        chipValues: ['COMMAND', 'EVENT'],
      });
      const chip = el.shadowRoot!.querySelector('[role="checkbox"]') as HTMLElement;
      expect(chip.getAttribute('aria-checked')).toBe('false');

      chip.click();
      await el.updateComplete;
      expect(chip.getAttribute('aria-checked')).toBe('true');
    });
  });

  describe('entity dropdown', () => {
    it('renders entity dropdown when entityField is set', async () => {
      const ds = createTestDataSet();
      const el = await createElement({
        dataSet: ds,
        entityField: columnId('actor'),
        entityLabel: 'Actor',
      });
      const trigger = el.shadowRoot!.querySelector('[role="combobox"]');
      expect(trigger).not.toBeNull();
      expect(trigger?.textContent).toContain('All Actors');
    });

    it('hides dropdown when entityField is omitted', async () => {
      const el = await createElement({ chipValues: ['A'] });
      const trigger = el.shadowRoot!.querySelector('[role="combobox"]');
      expect(trigger).toBeNull();
    });

    it('opens dropdown on click', async () => {
      const ds = createTestDataSet();
      const el = await createElement({
        dataSet: ds,
        entityField: columnId('actor'),
        entityLabel: 'Actor',
      });
      const trigger = el.shadowRoot!.querySelector('[role="combobox"]') as HTMLElement;
      trigger.click();
      await el.updateComplete;

      const panel = el.shadowRoot!.querySelector('[role="listbox"]');
      expect(panel).not.toBeNull();
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
    });

    it('shows unique entity values as options', async () => {
      const ds = createTestDataSet();
      const el = await createElement({
        dataSet: ds,
        entityField: columnId('actor'),
        entityLabel: 'Actor',
      });
      const trigger = el.shadowRoot!.querySelector('[role="combobox"]') as HTMLElement;
      trigger.click();
      await el.updateComplete;

      const options = el.shadowRoot!.querySelectorAll('[role="option"]');
      expect(options.length).toBe(4);
    });

    it('emits filter-change on entity selection', async () => {
      const ds = createTestDataSet();
      const el = await createElement({
        dataSet: ds,
        entityField: columnId('actor'),
        entityLabel: 'Actor',
      });
      const handler = vi.fn();
      el.addEventListener('filter-change', handler);

      const trigger = el.shadowRoot!.querySelector('[role="combobox"]') as HTMLElement;
      trigger.click();
      await el.updateComplete;

      const options = el.shadowRoot!.querySelectorAll('[role="option"]');
      (options[1] as HTMLElement).click();
      await el.updateComplete;

      expect(handler).toHaveBeenCalledOnce();
      const detail = handler.mock.calls[0][0].detail as FilterState;
      expect(detail.selectedEntity).toBe('alice');
    });

    it('navigates with ArrowDown/ArrowUp keys', async () => {
      const ds = createTestDataSet();
      const el = await createElement({
        dataSet: ds,
        entityField: columnId('actor'),
        entityLabel: 'Actor',
      });
      const trigger = el.shadowRoot!.querySelector('[role="combobox"]') as HTMLElement;
      trigger.click();
      await el.updateComplete;

      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await el.updateComplete;

      const focused = el.shadowRoot!.querySelector('.dropdown-option.focused');
      expect(focused).not.toBeNull();
    });

    it('selects with Enter key', async () => {
      const ds = createTestDataSet();
      const el = await createElement({
        dataSet: ds,
        entityField: columnId('actor'),
        entityLabel: 'Actor',
      });
      const handler = vi.fn();
      el.addEventListener('filter-change', handler);

      const trigger = el.shadowRoot!.querySelector('[role="combobox"]') as HTMLElement;
      trigger.click();
      await el.updateComplete;

      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await el.updateComplete;
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await el.updateComplete;

      expect(handler).toHaveBeenCalled();
    });

    it('closes with Escape key', async () => {
      const ds = createTestDataSet();
      const el = await createElement({
        dataSet: ds,
        entityField: columnId('actor'),
        entityLabel: 'Actor',
      });
      const trigger = el.shadowRoot!.querySelector('[role="combobox"]') as HTMLElement;
      trigger.click();
      await el.updateComplete;
      expect(el.shadowRoot!.querySelector('[role="listbox"]')).not.toBeNull();

      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await el.updateComplete;
      expect(el.shadowRoot!.querySelector('[role="listbox"]')).toBeNull();
    });

    it('uses column name as label when entityLabel omitted', async () => {
      const ds = createTestDataSet();
      const el = await createElement({
        dataSet: ds,
        entityField: columnId('actor'),
      });
      const label = el.shadowRoot!.querySelector('.filter-label');
      expect(label?.textContent?.trim()).toBe('actor:');
    });

    it('has aria-activedescendant on trigger when focused', async () => {
      const ds = createTestDataSet();
      const el = await createElement({
        dataSet: ds,
        entityField: columnId('actor'),
        entityLabel: 'Actor',
      });
      const trigger = el.shadowRoot!.querySelector('[role="combobox"]') as HTMLElement;
      trigger.click();
      await el.updateComplete;

      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await el.updateComplete;

      const activedescendant = trigger.getAttribute('aria-activedescendant');
      expect(activedescendant).toMatch(/^entity-option-\d+$/);
    });
  });

  describe('date range', () => {
    it('renders date inputs when showDateRange=true', async () => {
      const el = await createElement({ showDateRange: true });
      const inputs = el.shadowRoot!.querySelectorAll('input[type="date"]');
      expect(inputs.length).toBe(2);
    });

    it('hides date inputs when showDateRange=false', async () => {
      const el = await createElement({ chipValues: ['A'] });
      const inputs = el.shadowRoot!.querySelectorAll('input[type="date"]');
      expect(inputs.length).toBe(0);
    });

    it('emits filter-change on date from change', async () => {
      const el = await createElement({ showDateRange: true });
      const handler = vi.fn();
      el.addEventListener('filter-change', handler);

      const input = el.shadowRoot!.querySelector('#filter-date-from') as HTMLInputElement;
      input.value = '2026-01-01';
      input.dispatchEvent(new Event('change'));
      await el.updateComplete;

      expect(handler).toHaveBeenCalledOnce();
      const detail = handler.mock.calls[0][0].detail as FilterState;
      expect(detail.dateFrom).toBe('2026-01-01');
    });

    it('emits filter-change on date to change', async () => {
      const el = await createElement({ showDateRange: true });
      const handler = vi.fn();
      el.addEventListener('filter-change', handler);

      const input = el.shadowRoot!.querySelector('#filter-date-to') as HTMLInputElement;
      input.value = '2026-12-31';
      input.dispatchEvent(new Event('change'));
      await el.updateComplete;

      expect(handler).toHaveBeenCalledOnce();
      const detail = handler.mock.calls[0][0].detail as FilterState;
      expect(detail.dateTo).toBe('2026-12-31');
    });

    it('uses custom date labels', async () => {
      const el = await createElement({
        showDateRange: true,
        dateFromLabel: 'Start',
        dateToLabel: 'End',
      });
      const labels = el.shadowRoot!.querySelectorAll('.filter-label');
      const texts = Array.from(labels).map(l => l.textContent?.trim());
      expect(texts).toContain('Start:');
      expect(texts).toContain('End:');
    });
  });

  describe('visibility', () => {
    it('renders nothing when no filter properties are set', async () => {
      const el = await createElement();
      const toolbar = el.shadowRoot!.querySelector('[role="toolbar"]');
      expect(toolbar).toBeNull();
    });

    it('renders toolbar when only chipValues set', async () => {
      const el = await createElement({ chipValues: ['A'] });
      const toolbar = el.shadowRoot!.querySelector('[role="toolbar"]');
      expect(toolbar).not.toBeNull();
    });

    it('renders toolbar when only showDateRange is true', async () => {
      const el = await createElement({ showDateRange: true });
      const toolbar = el.shadowRoot!.querySelector('[role="toolbar"]');
      expect(toolbar).not.toBeNull();
    });
  });

  describe('ARIA', () => {
    it('has role="toolbar" on host container', async () => {
      const el = await createElement({ chipValues: ['A'] });
      const toolbar = el.shadowRoot!.querySelector('[role="toolbar"]');
      expect(toolbar).not.toBeNull();
    });

    it('has aria-label="Filters" on toolbar', async () => {
      const el = await createElement({ chipValues: ['A'] });
      const toolbar = el.shadowRoot!.querySelector('[role="toolbar"]');
      expect(toolbar?.getAttribute('aria-label')).toBe('Filters');
    });
  });
});
