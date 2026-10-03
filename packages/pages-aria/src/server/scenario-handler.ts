import { assertState, waitFor, resolveTarget } from '../executor/index.js';
import { injectStyles, highlightElement, completeTypingNow, isTypingSkipped, resetTypingSkip } from '../executor/visual-feedback.js';
import { showSpotlight, dismissAllSpotlights } from '../executor/spotlight.js';
import type { AriaTarget, AriaState } from '@casehubio/pages-primitives';
import type { EventConnection } from '@casehubio/pages-data';

const SCENARIO_TOPIC = 'scenario:exec';

interface CommandPayload {
  id: string;
  action: string;
  target?: AriaTarget;
  value?: string;
  state?: Record<string, unknown>;
  timeout?: number;
}

interface DispatchStep {
  name: string;
  label?: string;
  actor?: string;
  action: string;
  params: Record<string, unknown>;
  await?: { match?: Record<string, unknown>; timeout?: number; interval?: number; status?: number };
  mode?: string;
}

interface DispatchSequence {
  op: 'dispatch-sequence';
  sessionId: string;
  steps: DispatchStep[];
  speed: number;
  paused: boolean;
}

interface ExecutorControl {
  op: 'executor-control';
  sessionId: string;
  command: 'pause' | 'resume' | 'step' | 'speed' | 'stop';
  speed?: number;
}

export interface ScenarioHandler {
  dispose(): void;
}

function toAriaState(state: Record<string, unknown>): Partial<AriaState> {
  const result: Partial<AriaState> = {};
  if ('aria-busy' in state) result.busy = state['aria-busy'] as boolean;
  if ('aria-disabled' in state) result.disabled = state['aria-disabled'] as boolean;
  if ('aria-expanded' in state) result.expanded = state['aria-expanded'] as boolean;
  if ('aria-selected' in state) result.selected = state['aria-selected'] as boolean;
  if ('aria-hidden' in state) result.hidden = state['aria-hidden'] as boolean;
  return result;
}

function injectModalStyles(): void {
  if (document.getElementById('scenario-modal-styles')) return;
  const style = document.createElement('style');
  style.id = 'scenario-modal-styles';
  style.textContent = `
    .scenario-modal-overlay {
      position: fixed; inset: 0; z-index: 10002;
      background: rgba(15, 23, 42, 0.98);
      display: flex; flex-direction: column;
      font-family: system-ui, sans-serif;
      color: #e2e8f0;
      animation: scenario-modal-fade 0.2s ease;
    }
    @keyframes scenario-modal-fade { from { opacity: 0; } to { opacity: 1; } }
    .scenario-modal-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 24px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .scenario-modal-back {
      background: none; border: none; color: #94a3b8;
      cursor: pointer; font-size: 14px; padding: 4px 8px;
    }
    .scenario-modal-back:hover { color: #e2e8f0; }
    .scenario-modal-position { color: #64748b; font-size: 13px; }
    .scenario-modal-body {
      flex: 1; overflow-y: auto; padding: 32px;
      display: flex; justify-content: center;
    }
    .scenario-modal-content {
      max-width: 680px; width: 100%; line-height: 1.7; font-size: 16px;
    }
    .scenario-modal-content h1 { font-size: 1.6em; margin: 0.5em 0; font-weight: 600; }
    .scenario-modal-content h2 { font-size: 1.3em; margin: 0.5em 0; font-weight: 600; }
    .scenario-modal-content h3 { font-size: 1.1em; margin: 0.5em 0; font-weight: 600; }
    .scenario-modal-content p { margin: 0.6em 0; }
    .scenario-modal-content strong { font-weight: 600; }
    .scenario-modal-content em { font-style: italic; }
    .scenario-modal-content code {
      background: rgba(255,255,255,0.08); padding: 2px 5px;
      border-radius: 3px; font-family: monospace; font-size: 0.9em;
    }
    .scenario-modal-content ul { margin: 0.5em 0; padding-left: 1.5em; }
    .scenario-modal-content li { margin: 0.3em 0; }
    .scenario-modal-footer {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 24px;
      border-top: 1px solid rgba(255,255,255,0.1);
    }
    .scenario-modal-dots { display: flex; gap: 8px; align-items: center; }
    .scenario-modal-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #334155; transition: background 0.15s;
    }
    .scenario-modal-dot.active { background: #38bdf8; }
    .scenario-modal-prev {
      background: #2563eb; color: white; border: none;
      padding: 8px 20px; border-radius: 6px; font-weight: 600;
      cursor: pointer; font-size: 14px;
    }
    .scenario-modal-prev:hover { background: #1d4ed8; }
    .scenario-modal-next {
      background: #2563eb; color: white; border: none;
      padding: 8px 20px; border-radius: 6px; font-weight: 600;
      cursor: pointer; font-size: 14px;
    }
    .scenario-modal-next:hover { background: #1d4ed8; }
    .scenario-modal-nav { display: flex; gap: 8px; align-items: center; }
    .scenario-modal-body { cursor: pointer; position: relative; }
    .scenario-modal-footer { position: relative; }
    .scenario-modal-toc-bar {
      position: absolute; right: 24px; bottom: 100%;
      z-index: 1;
    }
    .scenario-modal-toc-toggle {
      background: none; border: none; color: #475569; cursor: pointer;
      font-size: 11px; padding: 2px 0;
    }
    .scenario-modal-toc-toggle:hover { color: #94a3b8; }
    .scenario-modal-toc {
      position: absolute; right: 24px; bottom: 100%; margin-bottom: 20px;
      z-index: 1;
    }
    .scenario-modal-toc-list {
      background: rgba(30, 41, 59, 0.8);
      border: 1px solid rgba(255,255,255,0.08); border-radius: 6px;
      padding: 6px 0; max-width: 260px;
    }
    .scenario-modal-toc-item {
      padding: 3px 14px; font-size: 12px; color: #64748b;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      cursor: pointer;
    }
    .scenario-modal-toc-item:hover { color: #94a3b8; }
    .scenario-modal-toc-item.active { color: #38bdf8; font-weight: 600; }
    .scenario-modal-scroll-indicator {
      position: absolute; bottom: 0; left: 0; right: 0;
      height: 48px; display: flex; align-items: center; justify-content: center;
      background: linear-gradient(transparent, rgba(15, 23, 42, 0.95));
      pointer-events: none;
      transition: opacity 0.3s;
    }
    .scenario-modal-scroll-indicator.hidden { opacity: 0; }
    .scenario-modal-scroll-arrow {
      color: #64748b; font-size: 20px;
      animation: scenario-scroll-bounce 1.5s ease-in-out infinite;
    }
    @keyframes scenario-scroll-bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(6px); }
    }
    .scenario-modal-hint {
      text-align: center; padding: 8px;
      color: #475569; font-size: 12px;
      border-top: 1px solid rgba(255,255,255,0.05);
    }
    .scenario-modal-tabs {
      display: flex; gap: 2px; margin: 16px 0 0;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .scenario-modal-tab {
      padding: 6px 16px; cursor: pointer;
      font-size: 13px; font-weight: 500;
      color: #64748b; background: none; border: none;
      border-bottom: 2px solid transparent;
      transition: color 0.15s, border-color 0.15s;
    }
    .scenario-modal-tab:hover { color: #94a3b8; }
    .scenario-modal-tab.active { color: #38bdf8; border-bottom-color: #38bdf8; }
    .scenario-modal-tab-panel { display: none; }
    .scenario-modal-tab-panel.active { display: block; }
    .hl-key { color: #7dd3fc; }
    .hl-colon { color: #64748b; }
    .hl-string { color: #86efac; }
    .hl-number { color: #fbbf24; }
    .hl-bool { color: #c084fc; }
    .hl-comment { color: #475569; font-style: italic; }
    .hl-dash { color: #f97316; }
    @media (prefers-reduced-motion: reduce) {
      .scenario-modal-overlay { animation: none; }
    }
  `;
  document.head.appendChild(style);
}

function highlightCode(code: string, lang: string): string {
  const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (lang === 'yaml' || lang === 'yml') {
    return escaped
      .replace(/(#.*)/g, '<span class="hl-comment">$1</span>')
      .replace(/^(\s*- )/gm, '<span class="hl-dash">$1</span>')
      .replace(/^(\s*[\w][\w.-]*)(:)/gm, '<span class="hl-key">$1</span><span class="hl-colon">$2</span>')
      .replace(/:\s+(&quot;.*?&quot;)/g, ': <span class="hl-string">$1</span>')
      .replace(/:\s+('.*?')/g, ': <span class="hl-string">$1</span>')
      .replace(/:\s+(true|false|null)\b/g, ': <span class="hl-bool">$1</span>')
      .replace(/:\s+(\d+\.?\d*)\s*$/gm, ': <span class="hl-number">$1</span>');
  }
  if (lang === 'json') {
    return escaped
      .replace(/(&quot;[^&]*?&quot;)\s*:/g, '<span class="hl-key">$1</span>:')
      .replace(/:\s*(&quot;[^&]*?&quot;)/g, ': <span class="hl-string">$1</span>')
      .replace(/:\s*(true|false|null)\b/g, ': <span class="hl-bool">$1</span>')
      .replace(/:\s*(\d+\.?\d*)/g, ': <span class="hl-number">$1</span>');
  }
  return escaped;
}

function renderMarkdownBlock(md: string): string {
  const placeholders = new Map<string, string>();
  let pIdx = 0;

  const withTables = md.replace(/(?:^|\n)((?:[ \t]*\|[^\n]+\|\n){2,})/g, (_match, block: string) => {
    const key = `__TABLE_${pIdx++}__`;
    const rows = block.trim().split('\n').map(r => r.trim()).filter(Boolean);
    if (rows.length < 2) { placeholders.set(key, block); return key; }
    const parseRow = (row: string): string[] =>
      row.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
    const headers = parseRow(rows[0]);
    const isSep = (r: string): boolean => /^\|[\s:|-]+\|$/.test(r.trim()) && r.includes('---');
    const startIdx = isSep(rows[1]) ? 2 : 1;
    const isHeader = isSep(rows[1]);
    let html = '<table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px;">';
    if (isHeader) {
      html += '<thead><tr>' + headers.map(h =>
        `<th style="text-align:left;padding:6px 12px;border-bottom:1px solid rgba(255,255,255,0.15);color:#94a3b8;font-size:12px;font-weight:600;">${h}</th>`
      ).join('') + '</tr></thead>';
    }
    html += '<tbody>';
    for (let i = startIdx; i < rows.length; i++) {
      const cells = parseRow(rows[i]);
      html += '<tr>' + cells.map(c =>
        `<td style="padding:6px 12px;border-bottom:1px solid rgba(255,255,255,0.06);color:#e2e8f0;">${c}</td>`
      ).join('') + '</tr>';
    }
    html += '</tbody></table>';
    placeholders.set(key, html);
    return key;
  });

  const withCodeBlocks = withTables.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang: string, code: string) => {
    const key = `__CODE_${pIdx++}__`;
    const highlighted = highlightCode(code, lang);
    placeholders.set(key, `<pre style="background:rgba(255,255,255,0.06);padding:12px 16px;border-radius:6px;overflow-x:auto;font-family:'SF Mono',monospace;font-size:12px;line-height:1.5;color:#e2e8f0;margin:12px 0;"><code${lang ? ` class="language-${lang}"` : ''}>${highlighted}</code></pre>`);
    return key;
  });

  const images = new Map<string, { alt: string; src: string }>();
  let imgIdx = 0;
  const withImages = withCodeBlocks.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt: string, src: string) => {
    const key = `__IMG_${imgIdx++}__`;
    images.set(key, { alt, src });
    return key;
  });

  const escaped = withImages
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let rendered = escaped
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hulo])(.+)$/gm, '<p>$1</p>');
  for (const [key, html] of placeholders) {
    rendered = rendered.replace(key, html);
  }
  for (const [key, { alt, src }] of images) {
    rendered = rendered.replace(key, `<img src="${src}" alt="${alt}" style="max-width:100%;border-radius:8px;margin:8px 0;">`);
  }
  return rendered;
}

function renderModalMarkdown(md: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'scenario-modal-content';

  const tabPattern = /^=== (.+)$/gm;
  if (!tabPattern.test(md)) {
    el.innerHTML = renderMarkdownBlock(md);
    return el;
  }

  const sections = md.split(/^=== (.+)$/m);
  const preamble = sections[0].trim();
  if (preamble) {
    el.innerHTML = renderMarkdownBlock(preamble);
  }

  const tabBar = document.createElement('div');
  tabBar.className = 'scenario-modal-tabs';
  const panels: HTMLElement[] = [];

  for (let i = 1; i < sections.length; i += 2) {
    const title = sections[i];
    const content = (sections[i + 1] || '').trim();
    const idx = panels.length;

    const tab = document.createElement('button');
    tab.className = `scenario-modal-tab${idx === 0 ? ' active' : ''}`;
    tab.textContent = title;
    tab.addEventListener('click', (e) => {
      e.stopPropagation();
      tabBar.querySelectorAll('.scenario-modal-tab').forEach(t => { t.classList.remove('active'); });
      tab.classList.add('active');
      panels.forEach((p, j) => p.classList.toggle('active', j === idx));
    });
    tabBar.appendChild(tab);

    const panel = document.createElement('div');
    panel.className = `scenario-modal-tab-panel${idx === 0 ? ' active' : ''}`;
    panel.innerHTML = renderMarkdownBlock(content);
    panels.push(panel);
  }

  el.appendChild(tabBar);
  for (const panel of panels) el.appendChild(panel);
  return el;
}

interface ActiveDeck {
  slides: Array<{ markdown: string; label: string }>;
  current: number;
  overlay: HTMLElement;
  dismiss: () => void;
}

let activeDeck: ActiveDeck | null = null;

function showOrExtendModalDeck(
  slide: { markdown: string; label: string },
  narrativeTarget: EventTarget,
  onDeckDismiss?: () => void,
): void {
  if (activeDeck && activeDeck.overlay.isConnected) {
    activeDeck.slides.push(slide);
    renderActiveDeck();
    return;
  }

  injectModalStyles();
  const overlay = document.createElement('div');
  overlay.className = 'scenario-modal-overlay';

  function dismiss(): void {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    const cb = onDeckDismiss;
    activeDeck = null;
    narrativeTarget.dispatchEvent(new CustomEvent('scenario-narrative-dismiss'));
    cb?.();
  }

  function advance(): void {
    if (!activeDeck) return;
    if (activeDeck.current < activeDeck.slides.length - 1) {
      activeDeck.current++;
      renderActiveDeck();
    } else {
      dismiss();
    }
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') dismiss();
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); advance(); }
    if (e.key === 'ArrowLeft' && activeDeck && activeDeck.current > 0) {
      activeDeck.current--;
      renderActiveDeck();
    }
  }

  document.addEventListener('keydown', onKey);
  activeDeck = { slides: [slide], current: 0, overlay, dismiss };
  renderActiveDeck();
  document.body.appendChild(overlay);
}

function renderActiveDeck(): void {
  if (!activeDeck) return;
  const { slides, current, overlay } = activeDeck;
  const total = slides.length;
  const slide = slides[current];
  overlay.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'scenario-modal-header';
  const close = document.createElement('button');
  close.className = 'scenario-modal-back';
  close.textContent = '✕ Close';
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    activeDeck!.dismiss();
  });
  header.appendChild(close);
  if (total > 1) {
    const pos = document.createElement('span');
    pos.className = 'scenario-modal-position';
    pos.textContent = `Slide ${current + 1} of ${total}`;
    header.appendChild(pos);
  }
  overlay.appendChild(header);

  const body = document.createElement('div');
  body.className = 'scenario-modal-body';
  body.appendChild(renderModalMarkdown(slide.markdown));
  body.addEventListener('click', () => {
    if (!activeDeck) return;
    if (activeDeck.current < activeDeck.slides.length - 1) {
      activeDeck.current++;
      renderActiveDeck();
    } else {
      activeDeck.dismiss();
    }
  });

  const scrollIndicator = document.createElement('div');
  scrollIndicator.className = 'scenario-modal-scroll-indicator';
  scrollIndicator.innerHTML = '<span class="scenario-modal-scroll-arrow">↓</span>';
  body.appendChild(scrollIndicator);

  requestAnimationFrame(() => {
    const hasOverflow = body.scrollHeight > body.clientHeight + 10;
    if (!hasOverflow) scrollIndicator.classList.add('hidden');
    body.addEventListener('scroll', () => {
      const atBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 20;
      scrollIndicator.classList.toggle('hidden', atBottom);
    });
  });

  overlay.appendChild(body);

  const footer = document.createElement('div');
  footer.className = 'scenario-modal-footer';
  if (total > 1) {
    const tocVisible = overlay.getAttribute('data-toc-open') === 'true';

    if (tocVisible) {
      const tocRow = document.createElement('div');
      tocRow.className = 'scenario-modal-toc';
      const tocList = document.createElement('div');
      tocList.className = 'scenario-modal-toc-list';
      for (let i = 0; i < total; i++) {
        const item = document.createElement('div');
        item.className = `scenario-modal-toc-item ${i === current ? 'active' : ''}`;
        item.textContent = `${i + 1}. ${slides[i].label}`;
        const idx = i;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          if (activeDeck) { activeDeck.current = idx; renderActiveDeck(); }
        });
        tocList.appendChild(item);
      }
      tocRow.appendChild(tocList);
      footer.appendChild(tocRow);
    }

    const toggleBar = document.createElement('div');
    toggleBar.className = 'scenario-modal-toc-bar';
    const toggle = document.createElement('button');
    toggle.className = 'scenario-modal-toc-toggle';
    toggle.textContent = tocVisible ? '▾ Slides' : '▸ Slides';
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      overlay.setAttribute('data-toc-open', tocVisible ? 'false' : 'true');
      renderActiveDeck();
    });
    toggleBar.appendChild(toggle);
    footer.appendChild(toggleBar);
  }
  if (total > 1) {
    const dots = document.createElement('div');
    dots.className = 'scenario-modal-dots';
    for (let i = 0; i < total; i++) {
      const dot = document.createElement('div');
      dot.className = `scenario-modal-dot ${i === current ? 'active' : ''}`;
      dots.appendChild(dot);
    }
    footer.appendChild(dots);
  } else {
    footer.appendChild(document.createElement('div'));
  }
  const nav = document.createElement('div');
  nav.className = 'scenario-modal-nav';
  if (current > 0) {
    const prev = document.createElement('button');
    prev.className = 'scenario-modal-prev';
    prev.textContent = '← Prev';
    prev.addEventListener('click', (e) => {
      e.stopPropagation();
      if (activeDeck) { activeDeck.current--; renderActiveDeck(); }
    });
    nav.appendChild(prev);
  }
  const next = document.createElement('button');
  next.className = 'scenario-modal-next';
  next.textContent = current === total - 1 ? (total > 1 ? 'Done' : 'Continue →') : 'Next →';
  next.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!activeDeck) return;
    if (activeDeck.current < activeDeck.slides.length - 1) {
      activeDeck.current++;
      renderActiveDeck();
    } else {
      activeDeck.dismiss();
    }
  });
  nav.appendChild(next);
  footer.appendChild(nav);
  overlay.appendChild(footer);

  const hint = document.createElement('div');
  hint.className = 'scenario-modal-hint';
  hint.textContent = total > 1
    ? 'Click or press → to advance'
    : 'Click anywhere or press → to continue';
  overlay.appendChild(hint);
}

function sendResult(conn: EventConnection, id: string, ok: boolean, error: string | null): void {
  conn.send({ op: 'command-result', id, ok, error });
}

function sendStepResult(
  conn: EventConnection,
  sessionId: string,
  stepName: string,
  ok: boolean,
  error: string | null,
  result?: Record<string, unknown>,
): void {
  conn.send({
    op: 'step-result',
    id: crypto.randomUUID(),
    sessionId,
    stepName,
    ok,
    error,
    ...(result ? { result } : {}),
  });
}

async function progressiveFill(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  speed: number,
): Promise<void> {
  const charDelay = Math.max(10, 40 / speed);
  const wordDelay = Math.max(20, 60 / speed);

  const PHASES: { count: number; chunk: number }[] = [
    { count: 5, chunk: 1 },
    { count: 5, chunk: 1 },
    { count: 6, chunk: 2 },
    { count: 7, chunk: 4 },
    { count: Infinity, chunk: 5 },
  ];

  el.focus();
  el.classList.add('scenario-typing');
  resetTypingSkip();

  const words = value.split(/(?<=\s)/);
  let revealed = '';
  let wordIdx = 0;

  function finish(): void {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.classList.remove('scenario-typing');
    resetTypingSkip();
  }

  // Phase 0: first phase — character by character
  const charCount = Math.min(PHASES[0].count, words.length);
  const charText = words.slice(0, charCount).join('');
  for (let i = 1; i <= charText.length; i++) {
    if (isTypingSkipped()) { finish(); return; }
    revealed = charText.slice(0, i);
    el.value = revealed;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise<void>(r => setTimeout(r, charDelay));
  }
  wordIdx = charCount;

  // Remaining phases: word chunks with increasing size
  for (let p = 1; p < PHASES.length && wordIdx < words.length; p++) {
    const { count, chunk } = PHASES[p]!;
    const phaseEnd = Math.min(wordIdx + count, words.length);
    while (wordIdx < phaseEnd) {
      if (isTypingSkipped()) { finish(); return; }
      const end = Math.min(wordIdx + chunk, phaseEnd);
      revealed += words.slice(wordIdx, end).join('');
      wordIdx = end;
      el.value = revealed;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise<void>(r => setTimeout(r, wordDelay));
    }
  }

  finish();
}

function buildAriaTarget(params: Record<string, unknown>): AriaTarget | undefined {
  if (!params.role) return undefined;
  return {
    role: params.role as string,
    name: params.name as string,
    ...(params.index !== undefined ? { index: params.index as number } : {}),
    ...(params.within !== undefined ? { within: params.within as string } : {}),
  };
}

function executeAriaAction(action: string, params: Record<string, unknown>, currentSpeed: number, isPaused: boolean, calloutMsPerChar: number, narrativeTarget: EventTarget): void | Promise<void> {
  const target = buildAriaTarget(params);
  const value = params.value as string | undefined;
  const fastMode = currentSpeed >= 100;

  injectStyles();

  switch (action) {
    case 'navigate':
      window.location.href = value!;
      return;
    case 'click': {
      const el = resolveTarget(target!);
      highlightElement(el, 'click');
      if (fastMode) {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return;
      }
      return new Promise<void>(resolve => setTimeout(() => {
        const fresh = resolveTarget(target!);
        fresh.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        resolve();
      }, 900));
    }
    case 'fill': {
      const el = resolveTarget(target!) as HTMLInputElement | HTMLTextAreaElement;
      highlightElement(el, 'fill');
      return progressiveFill(el, value!, currentSpeed);
    }
    case 'select': {
      const el = resolveTarget(target!) as HTMLSelectElement;
      highlightElement(el, 'select');
      el.value = value!;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    case 'expand': {
      const el = resolveTarget(target!);
      highlightElement(el, 'click');
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return;
    }
    case 'collapse': {
      const el = resolveTarget(target!);
      highlightElement(el, 'click');
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return;
    }
    case 'assert': {
      const stateFields = { ...params };
      delete stateFields.role; delete stateFields.name; delete stateFields.index; delete stateFields.within;
      assertState(target!, toAriaState(stateFields));
      return;
    }
    case 'wait': {
      const stateFields = { ...params };
      delete stateFields.role; delete stateFields.name; delete stateFields.index; delete stateFields.within;
      delete stateFields.timeout;
      return waitFor(target!, toAriaState(stateFields), (params.timeout as number) ?? 5000);
    }
    case 'ready':
      return;
    case 'spotlight': {
      const alsoRaw = params.also as Array<{role: string; name: string; content?: string; position?: string}> | undefined;
      if (fastMode) return;
      const reqDur = typeof params.duration === 'number' ? params.duration : 0;
      const contentText = (value ?? (params.content as string)) ?? '';
      const wordCount = contentText.split(/\s+/).filter(Boolean).length;
      const dur = reqDur === 0 && !isPaused ? Math.max(2000, wordCount * 250 / currentSpeed) : reqDur;
      return showSpotlight({
        target: target!,
        content: contentText,
        position: (params.position as 'top' | 'right' | 'bottom' | 'left' | 'auto') ?? 'auto',
        duration: dur,
        also: alsoRaw?.map(t => ({
          role: t.role, name: t.name,
          ...(t.content ? { content: t.content } : {}),
          ...(t.position ? { position: t.position as 'top' | 'right' | 'bottom' | 'left' | 'auto' } : {}),
        })),
      });
    }
    case 'show-markdown': {
      const display = (params.display as string) ?? 'panel';
      const markdown = (value ?? (params.content as string)) ?? '';
      const filePath = params.file as string | undefined;
      const section = params.section as string | undefined;

      if (display === 'modal') {
        return;
      }

      const detail = {
        type: filePath ? 'template' : 'inline',
        markdown,
        path: filePath,
        section,
      };
      (narrativeTarget as any).__lastNarrativeContent = detail;
      narrativeTarget.dispatchEvent(new CustomEvent('scenario-narrative', { detail }));
      return;
    }
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

export function createScenarioHandler(
  connection: EventConnection,
  eventTarget: EventTarget,
): ScenarioHandler {
  void connection.listen(['scenario:exec']);

  let paused = false;
  let stopped = false;
  let speed = 1.0;
  let sessionId: string | null = null;
  let stepQueue: DispatchStep[] = [];
  let executing = false;
  let resumeResolve: (() => void) | null = null;
  let calloutMsPerChar = 25;

  connection.send({
    op: 'executor-register',
    id: crypto.randomUUID(),
    name: 'browser',
    actions: ['navigate', 'click', 'fill', 'select', 'expand', 'collapse', 'assert', 'wait', 'ready', 'spotlight', 'show-markdown'],
  });

  async function executeSequence(): Promise<void> {
    if (executing) return;
    executing = true;

    try {
      while (stepQueue.length > 0) {
        if (stopped) break;
        if (paused) {
          await new Promise<void>((resolve) => { resumeResolve = resolve; });
          continue;
        }

        const step = stepQueue.shift()!;

        try {
          if (step.action === 'show-markdown') {
            if ((step.params.display as string) === 'modal') {
              showOrExtendModalDeck(
                {
                  markdown: ((step.params.value ?? step.params.content) as string) ?? '',
                  label: step.label ?? step.name,
                },
                eventTarget,
                () => {
                  if (resumeResolve) {
                    resumeResolve();
                    resumeResolve = null;
                  }
                },
              );
              sendStepResult(connection, sessionId!, step.name, true, null);
              continue;
            }
          }

          if (activeDeck) {
            if (paused) {
              stepQueue.unshift(step);
              await new Promise<void>((resolve) => { resumeResolve = resolve; });
              continue;
            }
            activeDeck.dismiss();
          }

          try {
            const result = executeAriaAction(step.action, step.params, speed, paused, calloutMsPerChar, eventTarget);
            if (result) await result;
            sendStepResult(connection, sessionId!, step.name, true, null);
          } catch (err) {
            sendStepResult(connection, sessionId!, step.name, false, (err as Error).message);
          }
        } catch {
          sendStepResult(connection, sessionId!, step.name, false, 'step execution error');
        }

        if (stepQueue.length > 0 && !paused && speed > 0 && speed < 1000) {
          const delay = Math.max(10, 1000 / speed);
          await new Promise<void>((resolve) => setTimeout(resolve, delay));
        }
      }
    } finally {
      executing = false;
    }
  }

  function onDispatch(e: Event): void {
    const detail = (e as CustomEvent).detail as DispatchSequence;
    const isNewSession = sessionId !== detail.sessionId;
    sessionId = detail.sessionId;
    if (isNewSession) {
      paused = detail.paused;
      speed = detail.speed;
      stopped = false;
    }
    stepQueue.push(...detail.steps);
    void executeSequence();
  }

  function onControl(e: Event): void {
    const detail = (e as CustomEvent).detail as ExecutorControl;
    if (sessionId && detail.sessionId !== sessionId) return;

    switch (detail.command) {
      case 'pause':
        paused = true;
        break;
      case 'resume':
        paused = false;
        dismissAllSpotlights();
        completeTypingNow();
        if (activeDeck) activeDeck.dismiss();
        eventTarget.dispatchEvent(new CustomEvent('scenario-narrative-dismiss'));
        if (resumeResolve) {
          resumeResolve();
          resumeResolve = null;
        }
        break;
      case 'step':
        paused = false;
        dismissAllSpotlights();
        completeTypingNow();
        if (activeDeck) activeDeck.dismiss();
        eventTarget.dispatchEvent(new CustomEvent('scenario-narrative-dismiss'));
        if (resumeResolve) {
          resumeResolve();
          resumeResolve = null;
        }
        queueMicrotask(() => { paused = true; });
        break;
      case 'speed':
        if (detail.speed !== undefined) speed = detail.speed;
        break;
      case 'stop':
        stopped = true;
        dismissAllSpotlights();
        completeTypingNow();
        if (activeDeck) activeDeck.dismiss();
        for (const pending of stepQueue) {
          sendStepResult(connection, sessionId!, pending.name, false, 'stopped');
        }
        stepQueue.length = 0;
        if (resumeResolve) {
          resumeResolve();
          resumeResolve = null;
        }
        break;
    }
  }

  function onLegacyEvent(e: Event): void {
    const detail = (e as CustomEvent).detail as { topic?: string; payload?: unknown };
    if (detail?.topic !== SCENARIO_TOPIC) return;

    const cmd = detail.payload as CommandPayload;
    if (!cmd?.id || !cmd?.action) return;

    const flatParams: Record<string, unknown> = {};
    if (cmd.target) {
      flatParams.role = cmd.target.role;
      flatParams.name = cmd.target.name;
    }
    if (cmd.value !== undefined) flatParams.value = cmd.value;
    if (cmd.state) Object.assign(flatParams, cmd.state);
    if (cmd.timeout !== undefined) flatParams.timeout = cmd.timeout;

    try {
      const result = executeAriaAction(cmd.action, flatParams, speed, paused, calloutMsPerChar, eventTarget);
      if (result) {
        result
          .then(() => { sendResult(connection, cmd.id, true, null); })
          .catch((err: Error) => { sendResult(connection, cmd.id, false, err.message); });
      } else {
        sendResult(connection, cmd.id, true, null);
      }
    } catch (err) {
      sendResult(connection, cmd.id, false, (err as Error).message);
    }
  }

  function onCalloutSpeed(e: Event): void {
    const detail = (e as CustomEvent).detail as { msPerChar: number };
    if (typeof detail?.msPerChar === 'number') calloutMsPerChar = detail.msPerChar;
  }

  eventTarget.addEventListener('pages-event', onLegacyEvent);
  eventTarget.addEventListener('scenario-dispatch', onDispatch);
  eventTarget.addEventListener('scenario-control', onControl);
  eventTarget.addEventListener('scenario-callout-speed', onCalloutSpeed);

  return {
    dispose() {
      eventTarget.removeEventListener('pages-event', onLegacyEvent);
      eventTarget.removeEventListener('scenario-dispatch', onDispatch);
      eventTarget.removeEventListener('scenario-control', onControl);
      eventTarget.removeEventListener('scenario-callout-speed', onCalloutSpeed);
      void connection.unlisten(['scenario:exec']);
      stepQueue = [];
      paused = false;
      stopped = false;
      if (resumeResolve) {
        resumeResolve();
        resumeResolve = null;
      }
    },
  };
}
