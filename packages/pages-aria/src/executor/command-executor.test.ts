import { describe, it, expect, beforeEach, vi } from 'vitest';
import { click, fill, select, expand, collapse, assertState, resolveTarget } from './command-executor.js';

describe('ARIA command executor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('resolveTarget', () => {
    it('finds element by role + name', () => {
      document.body.innerHTML = '<button aria-label="Submit">Submit</button>';
      const el = resolveTarget({ role: 'button', name: 'Submit' });
      expect(el.tagName).toBe('BUTTON');
    });

    it('resolves with within scoping', () => {
      document.body.innerHTML = `
        <div role="row" aria-label="Row A"><button aria-label="Delete">Delete</button></div>
        <div role="row" aria-label="Row B"><button aria-label="Delete">Delete</button></div>
      `;
      const el = resolveTarget({
        role: 'button', name: 'Delete',
        within: { role: 'row', name: 'Row B' },
      });
      expect(el.closest('[aria-label="Row B"]')).not.toBeNull();
    });

    it('throws when element not found', () => {
      document.body.innerHTML = '<button aria-label="Submit">Submit</button>';
      expect(() => resolveTarget({ role: 'button', name: 'Cancel' }))
        .toThrow('No element found: button "Cancel"');
    });

    it('returns first match when multiple exist', () => {
      document.body.innerHTML = `
        <button aria-label="Delete">First</button>
        <button aria-label="Delete">Second</button>
      `;
      const el = resolveTarget({ role: 'button', name: 'Delete' });
      expect(el.textContent).toBe('First');
    });

    it('selects element by index without name', () => {
      document.body.innerHTML = `
        <div role="row">Row 0</div>
        <div role="row">Row 1</div>
        <div role="row">Row 2</div>
      `;
      const el = resolveTarget({ role: 'row', index: '1' });
      expect(el.textContent).toBe('Row 1');
    });

    it('selects element by index within scope', () => {
      document.body.innerHTML = `
        <table role="grid">
          <div role="row">
            <div role="gridcell">A1</div>
            <div role="gridcell">A2</div>
          </div>
          <div role="row">
            <div role="gridcell">B1</div>
            <div role="gridcell">B2</div>
          </div>
        </table>
      `;
      const el = resolveTarget({
        role: 'gridcell', index: '1',
        within: { role: 'row', index: '0' },
      });
      expect(el.textContent).toBe('A2');
    });

    it('selects by name within indexed scope', () => {
      document.body.innerHTML = `
        <div role="row"><input aria-label="Name" /><input aria-label="Role" /></div>
        <div role="row"><input aria-label="Name" /><input aria-label="Role" /></div>
      `;
      const el = resolveTarget({
        role: 'textbox', name: 'Role',
        within: { role: 'row', index: '1' },
      });
      expect(el.closest('[role="row"]')).toBe(document.querySelectorAll('[role="row"]')[1]);
    });

    it('throws when index is out of range', () => {
      document.body.innerHTML = '<div role="row">Only row</div>';
      expect(() => resolveTarget({ role: 'row', index: '5' }))
        .toThrow('No element found');
    });
  });

  describe('click', () => {
    it('dispatches click event', () => {
      document.body.innerHTML = '<button aria-label="Submit">Submit</button>';
      const handler = vi.fn();
      document.querySelector('button')!.addEventListener('click', handler);
      click({ role: 'button', name: 'Submit' });
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('fill', () => {
    it('sets input value and dispatches events', () => {
      document.body.innerHTML = '<input aria-label="Name" />';
      const input = document.querySelector('input')!;
      const inputHandler = vi.fn();
      const changeHandler = vi.fn();
      input.addEventListener('input', inputHandler);
      input.addEventListener('change', changeHandler);
      fill({ role: 'textbox', name: 'Name' }, 'Alice');
      expect(input.value).toBe('Alice');
      expect(inputHandler).toHaveBeenCalled();
      expect(changeHandler).toHaveBeenCalled();
    });
  });

  describe('select', () => {
    it('sets select value and dispatches change', () => {
      document.body.innerHTML = `
        <select aria-label="Priority">
          <option value="low">Low</option>
          <option value="high">High</option>
        </select>
      `;
      const selectEl = document.querySelector('select')!;
      const changeHandler = vi.fn();
      selectEl.addEventListener('change', changeHandler);
      select({ role: 'listbox', name: 'Priority' }, 'high');
      expect(selectEl.value).toBe('high');
      expect(changeHandler).toHaveBeenCalled();
    });
  });

  describe('expand / collapse', () => {
    it('expand dispatches click', () => {
      document.body.innerHTML = '<div role="treeitem" aria-label="Case" aria-expanded="false">Case</div>';
      const handler = vi.fn();
      document.querySelector('[role="treeitem"]')!.addEventListener('click', handler);
      expand({ role: 'treeitem', name: 'Case' });
      expect(handler).toHaveBeenCalledOnce();
    });

    it('collapse dispatches click', () => {
      document.body.innerHTML = '<div role="treeitem" aria-label="Case" aria-expanded="true">Case</div>';
      const handler = vi.fn();
      document.querySelector('[role="treeitem"]')!.addEventListener('click', handler);
      collapse({ role: 'treeitem', name: 'Case' });
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('assertState', () => {
    it('passes when state matches', () => {
      document.body.innerHTML = '<button aria-label="Submit" aria-busy="false">Submit</button>';
      expect(() => { assertState(
        { role: 'button', name: 'Submit' },
        { busy: false }
      ); }).not.toThrow();
    });

    it('throws when state does not match', () => {
      document.body.innerHTML = '<button aria-label="Submit" aria-busy="true">Submit</button>';
      expect(() => { assertState(
        { role: 'button', name: 'Submit' },
        { busy: false }
      ); }).toThrow('State mismatch for button "Submit": busy expected false, got true');
    });

    it('checks multiple state properties', () => {
      document.body.innerHTML = '<button aria-label="Submit" aria-busy="false" aria-disabled="true">Submit</button>';
      expect(() => { assertState(
        { role: 'button', name: 'Submit' },
        { busy: false, disabled: true }
      ); }).not.toThrow();
    });
  });

  describe('scroll-to-row', () => {
    it('calls scrollToRow on the resolved table element', async () => {
      const scrollToRow = vi.fn().mockResolvedValue(true);
      document.body.innerHTML = '<div role="grid" aria-label="Cases"></div>';
      const table = document.querySelector('[role="grid"]')! as any;
      table.scrollToRow = scrollToRow;
      table.getRowKey = (row: any) => row.key;

      const { executeStep } = await import('./command-executor.js');
      await executeStep({
        action: 'scroll-to-row',
        target: { role: 'grid', name: 'Cases' },
        key: 'Bob',
      });

      expect(scrollToRow).toHaveBeenCalledTimes(1);
    });

    it('throws when target has no scrollToRow method', async () => {
      document.body.innerHTML = '<div role="grid" aria-label="Cases"></div>';

      const { executeStep } = await import('./command-executor.js');
      await expect(executeStep({
        action: 'scroll-to-row',
        target: { role: 'grid', name: 'Cases' },
        key: 'Bob',
      })).rejects.toThrow('does not support scrollToRow');
    });

    it('throws when no matching row found', async () => {
      const scrollToRow = vi.fn().mockResolvedValue(false);
      document.body.innerHTML = '<div role="grid" aria-label="Cases"></div>';
      const table = document.querySelector('[role="grid"]')! as any;
      table.scrollToRow = scrollToRow;

      const { executeStep } = await import('./command-executor.js');
      await expect(executeStep({
        action: 'scroll-to-row',
        target: { role: 'grid', name: 'Cases' },
        key: 'Nobody',
      })).rejects.toThrow('No matching row');
    });
  });

  describe('generic method invocation', () => {
    it('calls a method on the target element by action name', async () => {
      document.body.innerHTML = '<div role="region" aria-label="Diff"></div>';
      const el = document.querySelector('[role="region"]')! as any;
      el.toggleSync = vi.fn().mockReturnValue(true);

      const { executeStep } = await import('./command-executor.js');
      await executeStep({
        action: 'toggleSync',
        target: { role: 'region', name: 'Diff' },
      });

      expect(el.toggleSync).toHaveBeenCalledOnce();
    });

    it('passes step properties as arguments', async () => {
      document.body.innerHTML = '<div role="region" aria-label="Diff"></div>';
      const el = document.querySelector('[role="region"]')! as any;
      el.loadContent = vi.fn();

      const { executeStep } = await import('./command-executor.js');
      await executeStep({
        action: 'loadContent',
        target: { role: 'region', name: 'Diff' },
        panel: 'a',
        content: '# Hello',
        label: 'v1',
      });

      expect(el.loadContent).toHaveBeenCalledWith('a', '# Hello', 'v1');
    });

    it('awaits async methods', async () => {
      document.body.innerHTML = '<div role="region" aria-label="Diff"></div>';
      const el = document.querySelector('[role="region"]')! as any;
      el.loadFile = vi.fn().mockResolvedValue(undefined);

      const { executeStep } = await import('./command-executor.js');
      await executeStep({
        action: 'loadFile',
        target: { role: 'region', name: 'Diff' },
        panel: 'a',
        path: '/docs/readme.md',
      });

      expect(el.loadFile).toHaveBeenCalledWith('a', '/docs/readme.md');
    });

    it('throws when target has no matching method', async () => {
      document.body.innerHTML = '<div role="region" aria-label="Diff"></div>';

      const { executeStep } = await import('./command-executor.js');
      await expect(executeStep({
        action: 'nonExistentMethod',
        target: { role: 'region', name: 'Diff' },
      })).rejects.toThrow("has no method 'nonExistentMethod'");
    });

    it('throws when no target provided', async () => {
      const { executeStep } = await import('./command-executor.js');
      await expect(executeStep({
        action: 'someMethod',
      })).rejects.toThrow('requires a target');
    });
  });
});
