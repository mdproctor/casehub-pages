import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { TutorialDescriptor } from './types.js';
import './tutorial-host.js';
import type { PagesTutorialHost } from './tutorial-host.js';

const DESCRIPTORS: TutorialDescriptor[] = [
  {
    scenario: 'arch-concepts', title: 'Architecture', description: 'Overview',
    area: 'scenario-automation', labels: ['difficulty:beginner'], tags: [],
    estimated: '15 min', prerequisites: [], path: 'tutorials/arch/tutorial.yaml',
    contentType: 'slides-only',
    hero: { title: 'Architecture', subtitle: 'Learn basics', icon: '◎' },
  },
  {
    scenario: 'form-auto', title: 'Form Automation', description: 'Hands-on',
    area: 'scenario-automation', labels: ['difficulty:beginner'], tags: [],
    estimated: '10 min', prerequisites: [], path: 'tutorials/form/tutorial.yaml',
    contentType: 'hands-on',
  },
];

const SLIDES_YAML = `
scenario: arch-concepts
meta:
  title: Architecture
  description: Overview
  area: scenario-automation
sections:
  - title: Intro
    content:
      type: inline
      markdown: "# Welcome"
    steps: []
  - title: Section Two
    content:
      type: inline
      markdown: "# Part Two"
    steps: []
`;

describe('pages-tutorial-host', () => {
  let el: PagesTutorialHost;

  beforeEach(async () => {
    el = document.createElement('pages-tutorial-host') as PagesTutorialHost;
    el.registry = DESCRIPTORS;
    document.body.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => {
    document.body.removeChild(el);
  });

  it('shows catalog initially', () => {
    const catalog = el.shadowRoot?.querySelector('pages-tutorial-catalog');
    expect(catalog).not.toBeNull();
  });

  it('does not show controller initially', () => {
    const controller = el.shadowRoot?.querySelector('pages-scenario-controller');
    expect(controller).toBeNull();
  });

  it('does not show back button initially', () => {
    const back = el.shadowRoot?.querySelector('.back-btn');
    expect(back).toBeNull();
  });

  it('transitions to tutorial view on selection', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(SLIDES_YAML),
    });

    const catalog = el.shadowRoot?.querySelector('pages-tutorial-catalog');
    catalog?.dispatchEvent(new CustomEvent('tutorial-select', {
      detail: { scenario: 'arch-concepts' },
      bubbles: true, composed: true,
    }));

    await el.updateComplete;
    await new Promise(r => setTimeout(r, 100));
    await el.updateComplete;

    const controller = el.shadowRoot?.querySelector('pages-scenario-controller');
    expect(controller).not.toBeNull();

    const narrative = el.shadowRoot?.querySelector('pages-scenario-narrative');
    expect(narrative).not.toBeNull();

    const back = el.shadowRoot?.querySelector('.back-btn');
    expect(back).not.toBeNull();

    const catalogAfter = el.shadowRoot?.querySelector('pages-tutorial-catalog');
    expect(catalogAfter).toBeNull();
  });

  it('returns to catalog on back button click', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(SLIDES_YAML),
    });

    const catalog = el.shadowRoot?.querySelector('pages-tutorial-catalog');
    catalog?.dispatchEvent(new CustomEvent('tutorial-select', {
      detail: { scenario: 'arch-concepts' },
      bubbles: true, composed: true,
    }));

    await el.updateComplete;
    await new Promise(r => setTimeout(r, 100));
    await el.updateComplete;

    const back = el.shadowRoot?.querySelector('.back-btn') as HTMLElement;
    expect(back).not.toBeNull();
    back.click();

    await el.updateComplete;

    const catalogBack = el.shadowRoot?.querySelector('pages-tutorial-catalog');
    expect(catalogBack).not.toBeNull();

    const controllerGone = el.shadowRoot?.querySelector('pages-scenario-controller');
    expect(controllerGone).toBeNull();
  });

  it('sets htmlMode sanitized on narrative component', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(SLIDES_YAML),
    });

    const catalog = el.shadowRoot?.querySelector('pages-tutorial-catalog');
    catalog?.dispatchEvent(new CustomEvent('tutorial-select', {
      detail: { scenario: 'arch-concepts' },
      bubbles: true, composed: true,
    }));

    await el.updateComplete;
    await new Promise(r => setTimeout(r, 100));
    await el.updateComplete;

    const narrative = el.shadowRoot?.querySelector('pages-scenario-narrative');
    expect(narrative?.htmlMode).toBe('sanitized');
  });

  it('renders scenario-ref panel when section has scenarioRef', async () => {
    const SCENARIO_REF_YAML = `
scenario: ref-tutorial
meta:
  title: With Ref
  description: Test
  area: test
sections:
  - title: Intro
    content:
      type: inline
      markdown: "# Welcome"
    steps: []
  - title: Demo
    scenario-ref: flow-control/sequential.scenario.yaml
    content:
      type: inline
      markdown: "# Watch this"
    steps: []
`;
    const SCENARIO_YAML = `scenario: sequential-demo
meta:
  title: Sequential
steps:
  - click: { role: button, name: "A" }
`;

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('sequential.scenario.yaml')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(SCENARIO_YAML) });
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve(SCENARIO_REF_YAML) });
    });

    el.registry = [{
      scenario: 'ref-tutorial', title: 'With Ref', description: 'Test',
      area: 'test', labels: [], tags: [], estimated: '5 min',
      prerequisites: [], path: 'tutorials/ref/tutorial.yaml',
      contentType: 'slides-only',
    }];
    await el.updateComplete;

    const catalog = el.shadowRoot?.querySelector('pages-tutorial-catalog');
    catalog?.dispatchEvent(new CustomEvent('tutorial-select', {
      detail: { scenario: 'ref-tutorial' },
      bubbles: true, composed: true,
    }));

    await el.updateComplete;
    await new Promise(r => setTimeout(r, 200));
    await el.updateComplete;

    // Initially on section 0 (Intro) — no scenario-ref panel
    const panelBefore = el.shadowRoot?.querySelector('.scenario-ref-panel');
    expect(panelBefore).toBeNull();
  });
});
