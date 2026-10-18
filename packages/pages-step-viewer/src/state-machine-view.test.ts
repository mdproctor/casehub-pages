import { describe, it, expect } from 'vitest';
import type { PluginStep } from '@casehubio/yaml-core/step';
import './state-machine-view.js';

function smStep(params: Record<string, unknown>): PluginStep {
  return {
    kind: 'plugin',
    name: null,
    entry: {
      qualifiedName: 'sm-create',
      definition: { name: 'sm-create', inputs: {}, outputs: {} },
      action: { execute: async () => ({ kind: 'success', output: {}, executionMetadata: {} }) },
    },
    params,
    decorators: {},
  };
}

describe('state-machine-view', () => {
  it('renders state nodes for each state', async () => {
    const el = document.createElement('state-machine-view') as HTMLElement & { step: PluginStep };
    el.step = smStep({ name: 'order', states: ['draft', 'submitted', 'approved'], initial: 'draft' });
    document.body.appendChild(el);
    await (el as any).updateComplete;

    const nodes = el.shadowRoot!.querySelectorAll('.state-node');
    expect(nodes.length).toBe(3);
    expect(nodes[0]!.textContent!.trim()).toBe('draft');
    expect(nodes[1]!.textContent!.trim()).toBe('submitted');
    expect(nodes[2]!.textContent!.trim()).toBe('approved');
    el.remove();
  });

  it('marks the initial state', async () => {
    const el = document.createElement('state-machine-view') as HTMLElement & { step: PluginStep };
    el.step = smStep({ name: 'order', states: ['draft', 'submitted'], initial: 'draft' });
    document.body.appendChild(el);
    await (el as any).updateComplete;

    const nodes = el.shadowRoot!.querySelectorAll('.state-node');
    expect(nodes[0]!.classList.contains('initial')).toBe(true);
    expect(nodes[1]!.classList.contains('initial')).toBe(false);
    el.remove();
  });

  it('renders arrows between states', async () => {
    const el = document.createElement('state-machine-view') as HTMLElement & { step: PluginStep };
    el.step = smStep({ name: 'order', states: ['a', 'b', 'c'], initial: 'a' });
    document.body.appendChild(el);
    await (el as any).updateComplete;

    const arrows = el.shadowRoot!.querySelectorAll('.arrow');
    expect(arrows.length).toBe(2);
    el.remove();
  });

  it('renders header with machine name', async () => {
    const el = document.createElement('state-machine-view') as HTMLElement & { step: PluginStep };
    el.step = smStep({ name: 'order', states: ['draft'], initial: 'draft' });
    document.body.appendChild(el);
    await (el as any).updateComplete;

    const header = el.shadowRoot!.querySelector('.header')!;
    expect(header.textContent).toContain('order');
    el.remove();
  });

  it('renders nothing for missing params', async () => {
    const el = document.createElement('state-machine-view') as HTMLElement & { step: PluginStep };
    el.step = smStep({});
    document.body.appendChild(el);
    await (el as any).updateComplete;

    const nodes = el.shadowRoot!.querySelectorAll('.state-node');
    expect(nodes.length).toBe(0);
    el.remove();
  });
});
