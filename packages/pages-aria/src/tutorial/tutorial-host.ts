import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { TutorialDescriptor, LearningPath, YamlEditorSection } from './types.js';
import { isSectioned } from '../scenario/types.js';
import { parseScenario as parse } from '../scenario/parser.js';
import { createScheduler, type ScenarioRunner } from '../scenario/scheduler.js';
import { validateYamlStep } from './yaml-editor-runner.js';
import './tutorial-catalog.js';
import '../controller/scenario-controller.js';
import '../controller/scenario-narrative.js';

export class PagesTutorialHost extends LitElement {
  static override styles = css`
    :host { display: block; font-family: var(--pages-font-family, system-ui, sans-serif); }
    .back-btn {
      background: none; border: 1px solid var(--pages-neutral-5, #d4d4d4);
      border-radius: var(--pages-radius-sm, 4px); padding: 6px 14px;
      cursor: pointer; color: var(--pages-neutral-9, #737373); font-size: 13px;
      margin-bottom: 16px;
    }
    .back-btn:hover { background: var(--pages-neutral-3, #f5f5f5); }
    .tutorial-layout {
      display: flex; gap: 20px;
    }
    .tutorial-main { flex: 1; min-width: 0; }
    .tutorial-sidebar { width: 280px; flex-shrink: 0; }
    .tutorial-target { flex: 3; min-width: 0; min-height: 500px; }
    .tutorial-layout--with-target .tutorial-main { flex: 2; }
    .tutorial-header {
      margin-bottom: 16px;
    }
    .tutorial-header h2 { margin: 0 0 4px; font-size: 20px; font-weight: 600; color: var(--pages-neutral-12, #1a1a1a); }
    .tutorial-header p { margin: 0; font-size: 13px; color: var(--pages-neutral-8, #999); }
    .error {
      padding: var(--pages-space-4, 16px);
      color: var(--pages-danger-9, #dc2626);
      background: rgba(239, 68, 68, 0.1);
      border-radius: var(--pages-radius-sm, 4px);
    }
    .slide-nav {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 0; margin-top: 16px;
      border-top: 1px solid var(--pages-neutral-4, #e5e5e5);
    }
    .slide-nav button {
      background: none; border: 1px solid var(--pages-neutral-5, #d4d4d4);
      border-radius: var(--pages-radius-sm, 4px); padding: 8px 20px;
      cursor: pointer; color: var(--pages-neutral-12, #ededed); font-size: 13px;
      transition: background 0.15s;
    }
    .slide-nav button:hover:not(:disabled) { background: var(--pages-neutral-3, #f5f5f5); }
    .slide-nav button:disabled { opacity: 0.3; cursor: not-allowed; }
    .slide-counter {
      font-size: 12px; color: var(--pages-neutral-8, #999);
    }
    .scenario-ref-panel {
      margin-bottom: 16px; border: 1px solid var(--pages-neutral-4, #e5e5e5);
      border-radius: var(--pages-radius-sm, 4px); overflow: hidden;
    }
    .scenario-ref-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 12px; background: var(--pages-neutral-2, #fafafa);
      border-bottom: 1px solid var(--pages-neutral-4, #e5e5e5);
      font-size: 12px; color: var(--pages-neutral-9, #737373);
    }
    .scenario-ref-run {
      padding: 4px 12px; font-size: 11px; font-weight: 600;
      background: var(--pages-accent-3); color: var(--pages-accent-9);
      border: 1px solid var(--pages-accent-6); border-radius: 3px;
      cursor: pointer;
    }
    .scenario-ref-run:hover { background: var(--pages-accent-4); }
    .scenario-ref-yaml {
      padding: 12px; font-family: monospace; font-size: 12px;
      white-space: pre; overflow-x: auto; line-height: 1.5;
      color: var(--pages-neutral-12, #1a1a1a);
      background: var(--pages-neutral-1, #fff);
      max-height: 300px; overflow-y: auto;
    }
  `;

  @property({ attribute: false }) registry: TutorialDescriptor[] = [];
  @property({ attribute: false }) paths: LearningPath[] = [];
  @property() contentBase?: string;

  @state() private _view: 'catalog' | 'tutorial' = 'catalog';
  @state() private _activeTutorial: TutorialDescriptor | null = null;
  @state() private _error: string | null = null;
  @state() private _currentSection = 0;
  @state() private _totalSections = 0;
  @state() private _yamlEditorSections: YamlEditorSection[] = [];
  @state() private _yamlEditorValid = false;

  private _runner: ScenarioRunner | null = null;
  private _eventTarget: EventTarget | null = null;
  private _sectionTitles: string[] = [];
  private _scenarioRefCache: Map<string, string> = new Map();
  @state() private _scenarioRefYaml: string | null = null;
  private _parsedSections: import('../scenario/types.js').TutorialSection[] = [];

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._disposeRunner();
  }

  private _disposeRunner(): void {
    if (this._runner) {
      this._runner.dispose();
      this._runner = null;
    }
    this._eventTarget = null;
    this._sectionTitles = [];
    this._parsedSections = [];
    this._currentSection = 0;
    this._totalSections = 0;
    this._scenarioRefYaml = null;
  }

  private _trackState(): void {
    if (!this._eventTarget) return;
    this._eventTarget.addEventListener('pages-event', (e: Event) => {
      const detail = (e as CustomEvent).detail as { topic?: string; payload?: Record<string, unknown> };
      if (detail?.topic !== 'scenario:state') return;
      const section = detail.payload?.section as string | null;
      if (section && this._sectionTitles.length > 0) {
        const idx = this._sectionTitles.indexOf(section);
        if (idx >= 0) {
          this._currentSection = idx;
          void this._loadCurrentSectionScenarioRef();
        }
      }
    });
  }

  private _onPrev(): void {
    if (this._currentSection > 0 && this._runner) {
      this._runner.runTo(this._sectionTitles[this._currentSection - 1]);
    }
  }

  private _onNext(): void {
    if (this._runner) {
      if (this._currentSection < this._totalSections - 1) {
        this._runner.runTo(this._sectionTitles[this._currentSection + 1]);
      } else {
        this._runner.step();
      }
    }
  }

  private async _onTutorialSelect(e: CustomEvent): Promise<void> {
    const scenario = e.detail.scenario as string;
    const desc = this.registry.find(r => r.scenario === scenario);
    if (!desc) return;

    this._activeTutorial = desc;
    this._error = null;

    try {
      const basePath = this.contentBase
        ? `${this.contentBase}/${desc.path}`
        : desc.path;
      const yamlUrl = basePath;
      const resp = await fetch(yamlUrl);
      if (!resp.ok) throw new Error(`Failed to load tutorial: ${resp.status}`);

      const yamlText = await resp.text();
      const parsed = parse(yamlText);

      if (desc.contentType === 'yaml-editor') {
        const yamlParsed = (await import('yaml')).parse(yamlText);
        const yamlSections = (yamlParsed.sections ?? []) as YamlEditorSection[];
        this._yamlEditorSections = yamlSections;
        this._sectionTitles = yamlSections.map(s => s.title);
        this._totalSections = yamlSections.length;
        this._currentSection = 0;
        this._yamlEditorValid = false;
        this._view = 'tutorial';
        return;
      }

      if (!isSectioned(parsed)) {
        throw new Error('Tutorial must use sectioned format');
      }

      this._disposeRunner();
      this._eventTarget = new EventTarget();
      this._parsedSections = parsed.sections;
      this._sectionTitles = parsed.sections.map(s => s.title);
      this._totalSections = parsed.sections.length;
      this._currentSection = 0;
      this._scenarioRefYaml = null;
      this._view = 'tutorial';

      await this.updateComplete;
      await new Promise(r => setTimeout(r, 50));
      this._trackState();
      void this._loadCurrentSectionScenarioRef();

      const tutorialDir = basePath.replace(/\/[^/]+$/, '');
      this._runner = createScheduler(parsed, {
        eventTarget: this._eventTarget,
        contentBase: tutorialDir,
        startPaused: true,

        onComplete: (name) => {
          try { localStorage.setItem(`tutorial:completed:${name}`, 'true'); }
          catch { /* graceful degradation */ }
        },
      });
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
      this._view = 'tutorial';
    }
  }

  private async _loadCurrentSectionScenarioRef(): Promise<void> {
    const section = this._parsedSections[this._currentSection];
    if (section?.scenarioRef) {
      this._scenarioRefYaml = await this._loadScenarioRef(section.scenarioRef);
    } else {
      this._scenarioRefYaml = null;
    }
  }

  private async _loadScenarioRef(ref: string): Promise<string | null> {
    if (this._scenarioRefCache.has(ref)) return this._scenarioRefCache.get(ref)!;
    try {
      const base = this.contentBase ? `${this.contentBase}/../../scenarios/` : 'scenarios/';
      const resp = await fetch(`${base}${ref}`);
      if (!resp.ok) return null;
      const text = await resp.text();
      this._scenarioRefCache.set(ref, text);
      return text;
    } catch {
      return null;
    }
  }

  private _runScenarioRef(yamlText: string): void {
    const cp = (window as unknown as Record<string, unknown>)['casehubPages'] as
      Record<string, Function> | undefined;
    if (!cp?.parseScenario || !cp?.createScheduler || !cp?.createScenarioCatalog) return;
    const catalog = (cp.createScenarioCatalog as Function)();
    const scenario = (cp.parseScenario as Function)(yamlText, catalog);
    const et = new EventTarget();
    const runner = (cp.createScheduler as Function)(scenario, { eventTarget: et, speed: 1, startPaused: false });
    runner.play();
  }

  private _onBack(): void {
    this._disposeRunner();
    this._activeTutorial = null;
    this._error = null;
    this._view = 'catalog';
  }

  override render(): TemplateResult {
    if (this._view === 'catalog') {
      return this._renderCatalog();
    }
    return this._renderTutorial();
  }

  private _renderCatalog(): TemplateResult {
    return html`
      <pages-tutorial-catalog
        .registry=${this.registry}
        .paths=${this.paths}
        @tutorial-select=${(e: CustomEvent) => void this._onTutorialSelect(e)}
      ></pages-tutorial-catalog>
    `;
  }

  private _renderTutorial(): TemplateResult {
    if (this._error) {
      return html`
        <button class="back-btn" @click=${() => { this._onBack(); }}>← Back to Tutorials</button>
        <div class="error">${this._error}</div>
      `;
    }

    const desc = this._activeTutorial;
    if (desc?.contentType === 'yaml-editor') {
      return this._renderYamlEditorTutorial(desc);
    }

    const hasTarget = desc?.target === 'builder-shell';

    return html`
      <button class="back-btn" @click=${() => { this._onBack(); }}>← Back to Tutorials</button>
      ${desc ? html`
        <div class="tutorial-header">
          <h2>${desc.hero?.icon ?? ''} ${desc.title}</h2>
          <p>${desc.description}</p>
        </div>
      ` : nothing}
      <div class="tutorial-layout ${hasTarget ? 'tutorial-layout--with-target' : ''}">
        ${hasTarget ? html`
          <div class="tutorial-target">
            <pages-builder-shell></pages-builder-shell>
          </div>
        ` : nothing}
        <div class="tutorial-main">
          ${this._scenarioRefYaml ? html`
            <div class="scenario-ref-panel">
              <div class="scenario-ref-header">
                <span>Scenario YAML</span>
                <button class="scenario-ref-run"
                  @click=${() => { this._runScenarioRef(this._scenarioRefYaml!); }}>▶ Run</button>
              </div>
              <div class="scenario-ref-yaml">${this._scenarioRefYaml}</div>
            </div>
          ` : nothing}
          <pages-scenario-narrative
            .eventTarget=${this._eventTarget}
            htmlMode="sanitized"
          ></pages-scenario-narrative>
          <div class="slide-nav">
            <button ?disabled=${this._currentSection <= 0}
                    @click=${() => { this._onPrev(); }}>← Previous</button>
            <span class="slide-counter">${this._currentSection + 1} / ${this._totalSections}</span>
            <button ?disabled=${this._currentSection >= this._totalSections - 1}
                    @click=${() => { this._onNext(); }}>Next →</button>
          </div>
          ${hasTarget ? html`
            <pages-scenario-controller
              .eventTarget=${this._eventTarget}
            ></pages-scenario-controller>
          ` : nothing}
        </div>
        ${hasTarget ? nothing : html`
          <div class="tutorial-sidebar">
            <pages-scenario-controller
              .eventTarget=${this._eventTarget}
            ></pages-scenario-controller>
          </div>
        `}
      </div>
    `;
  }

  private _renderYamlEditorTutorial(desc: TutorialDescriptor): TemplateResult {
    const section = this._yamlEditorSections[this._currentSection];
    const initialYaml = section?.initialYaml ?? '';
    return html`
      <button class="back-btn" @click=${() => { this._onBack(); }}>← Back to Tutorials</button>
      <div class="tutorial-header">
        <h2>${desc.hero?.icon ?? ''} ${desc.title}</h2>
        <p>${section?.title ?? desc.description}</p>
      </div>
      <div class="tutorial-layout">
        <div class="tutorial-main">
          <pages-builder-shell
            .yaml=${initialYaml}
            @builder-change=${(e: CustomEvent) => { this._onYamlEditorChange(e); }}
          ></pages-builder-shell>
        </div>
      </div>
      <div class="slide-nav">
        <button ?disabled=${this._currentSection <= 0}
                @click=${() => { this._onYamlEditorPrev(); }}>← Previous</button>
        <span class="slide-counter">${this._currentSection + 1} / ${this._totalSections}</span>
        <button ?disabled=${!this._yamlEditorValid || this._currentSection >= this._totalSections - 1}
                @click=${() => { this._onYamlEditorNext(); }}>Next →</button>
      </div>
      ${section?.hint ? html`<div class="hint">${section.hint}</div>` : nothing}
    `;
  }

  private _onYamlEditorChange(e: CustomEvent): void {
    const yaml = e.detail?.yaml as string;
    const section = this._yamlEditorSections[this._currentSection];
    if (!section || !yaml) return;
    const result = validateYamlStep(yaml, {
      expectedKeys: section.expectedKeys,
      expectedStructure: section.expectedStructure,
    });
    this._yamlEditorValid = result.valid;
  }

  private _onYamlEditorPrev(): void {
    if (this._currentSection > 0) {
      this._currentSection--;
      this._yamlEditorValid = false;
    }
  }

  private _onYamlEditorNext(): void {
    if (this._yamlEditorValid && this._currentSection < this._totalSections - 1) {
      this._currentSection++;
      this._yamlEditorValid = false;
    }
  }
}

if (!customElements.get('pages-tutorial-host')) {
  customElements.define('pages-tutorial-host', PagesTutorialHost);
}
