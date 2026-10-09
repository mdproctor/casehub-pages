var sampleContent = [
  '# Project Status Report',
  '',
  '## Overview',
  '',
  'The Q3 release is on track. All **critical path** items are complete',
  'and integration testing begins next week.',
  '',
  '## Key Milestones',
  '',
  '| Milestone | Status | Date |',
  '|-----------|--------|------|',
  '| API freeze | Done | Sep 15 |',
  '| Integration tests | In progress | Oct 1 |',
  '| Performance audit | Pending | Oct 8 |',
  '| Release candidate | Planned | Oct 15 |',
  '',
  '## Architecture Changes',
  '',
  'The new component model uses a *shared bridge interface* (`EditableText`)',
  'that enables programmatic editing across different editor engines.',
  '',
  '### EditableText Bridge',
  '',
  'Each editor implements the bridge, exposing:',
  '',
  '- `getText()` / `setContent()` for full document access',
  '- `insertText()` / `replaceRange()` for surgical edits',
  '- `highlight()` / `addAnnotation()` for visual overlays',
  '- `beginEditSession()` for exclusive locks with rollback',
  '',
  '### MCP Integration',
  '',
  'The `McpToolAdapter` maps 16 tool calls to `EditableText` methods,',
  'enabling LLM-driven content editing without engine-specific code.',
  '',
  '## Next Steps',
  '',
  '1. Complete integration test suite',
  '2. Run performance benchmarks on large documents',
  '3. Document the plugin extension API',
  '4. Ship release candidate to staging',
].join('\n');

var editor = document.getElementById('md-editor') as any;
var statusOutput = document.getElementById('status-output');
var activeSession = null;
var currentMode = 'wysiwyg';

function getBridge() {
  if (!editor) return null;
  var sym = Symbol.for('editable-text');
  return (editor as any)[sym] || null;
}

function updateStatus() {
  if (!statusOutput) return;
  var bridge = getBridge();
  var lines = bridge ? bridge.getLineCount() : 0;
  var sessionInfo = activeSession ? 'active (' + activeSession.owner + ')' : 'none';
  statusOutput.textContent =
    'Mode: ' + currentMode + '\n' +
    'Lines: ' + lines + '\n' +
    'Session: ' + sessionInfo;
}

function loadInitialContent() {
  var bridge = getBridge();
  if (bridge) {
    bridge.setContent(sampleContent);
    updateStatus();
  } else {
    setTimeout(loadInitialContent, 200);
  }
}

if (editor) {
  editor.addEventListener('mode-changed', function(e) {
    currentMode = e.detail.mode;
    updateStatus();
  });
  editor.addEventListener('input', function() {
    updateStatus();
  });
  setTimeout(loadInitialContent, 500);
}

var btnWysiwyg = document.getElementById('btn-wysiwyg');
if (btnWysiwyg) btnWysiwyg.addEventListener('click', function() {
  if (editor) editor.setMode('wysiwyg');
});

var btnSource = document.getElementById('btn-source');
if (btnSource) btnSource.addEventListener('click', function() {
  if (editor) editor.setMode('source');
});

var btnSplit = document.getElementById('btn-split');
if (btnSplit) btnSplit.addEventListener('click', function() {
  if (editor) editor.setMode('split');
});

var btnInsert = document.getElementById('btn-insert');
if (btnInsert) btnInsert.addEventListener('click', function() {
  var bridge = getBridge();
  if (bridge) {
    bridge.insertText('\n\n> **Note:** This text was inserted programmatically via the EditableText bridge.\n');
    updateStatus();
  }
});

var btnHighlight = document.getElementById('btn-highlight');
if (btnHighlight) btnHighlight.addEventListener('click', function() {
  var bridge = getBridge();
  if (bridge) {
    var cursor = bridge.getCursor();
    bridge.highlightLine(cursor.line, 'pulse');
  }
});

var btnClearHl = document.getElementById('btn-clear-hl');
if (btnClearHl) btnClearHl.addEventListener('click', function() {
  var bridge = getBridge();
  if (bridge) bridge.clearHighlights();
});

var btnAnnotate = document.getElementById('btn-annotate');
if (btnAnnotate) btnAnnotate.addEventListener('click', function() {
  var bridge = getBridge();
  if (bridge) {
    var cursor = bridge.getCursor();
    bridge.highlightBlock(cursor, 'glow');
  }
});

var sessionBtn = document.getElementById('btn-session');
if (sessionBtn) sessionBtn.addEventListener('click', function() {
  var bridge = getBridge();
  if (!bridge) return;
  if (activeSession) {
    bridge.endEditSession(activeSession);
    activeSession = null;
    sessionBtn.textContent = 'Begin Edit Session';
  } else {
    try {
      activeSession = bridge.beginEditSession('showcase-user');
      sessionBtn.textContent = 'End Edit Session';
    } catch (e) {
      alert('Session error: ' + e.message);
    }
  }
  updateStatus();
});

var SCENARIOS = [
  {
    name: 'Content Authoring',
    description: 'Load content, insert text, apply highlights',
    steps: [
      { action: 'editor-set-content', target: { role: 'textbox', name: 'Markdown editor' }, value: sampleContent, typing: 'instant' },
      { action: 'editor-cursor', target: { role: 'textbox', name: 'Markdown editor' }, line: 4, col: 0 },
      { action: 'editor-highlight', target: { role: 'textbox', name: 'Markdown editor' }, from: { line: 4, col: 0 }, to: { line: 4, col: 40 }, style: 'pulse' },
      { action: 'editor-insert', target: { role: 'textbox', name: 'Markdown editor' }, value: '\n\n---\n\n*Inserted by playbook*\n', typing: 'progressive' },
    ],
  },
  {
    name: 'Mode Switching',
    description: 'Toggle between WYSIWYG, source, and split',
    steps: [
      { action: 'editor-set-content', target: { role: 'textbox', name: 'Markdown editor' }, value: sampleContent, typing: 'instant' },
      { action: 'setMode', target: { role: 'textbox', name: 'Markdown editor' }, newMode: 'source' },
      { action: 'setMode', target: { role: 'textbox', name: 'Markdown editor' }, newMode: 'split' },
      { action: 'setMode', target: { role: 'textbox', name: 'Markdown editor' }, newMode: 'wysiwyg' },
    ],
  },
  {
    name: 'Edit Session',
    description: 'Begin a session, make edits, then end it',
    steps: [
      { action: 'editor-set-content', target: { role: 'textbox', name: 'Markdown editor' }, value: sampleContent, typing: 'instant' },
      { action: 'beginEditSession', target: { role: 'textbox', name: 'Markdown editor' }, owner: 'ai-agent' },
      { action: 'editor-cursor', target: { role: 'textbox', name: 'Markdown editor' }, line: 0, col: 0 },
      { action: 'editor-insert', target: { role: 'textbox', name: 'Markdown editor' }, value: '<!-- AI editing session -->\n', typing: 'progressive' },
      { action: 'editor-highlight', target: { role: 'textbox', name: 'Markdown editor' }, from: { line: 0, col: 0 }, to: { line: 0, col: 27 }, style: 'glow' },
    ],
  },
];

async function runScenario(steps, delayMs) {
  for (var i = 0; i < steps.length; i++) {
    await new Promise(function(r) { setTimeout(r, delayMs); });
    var step = steps[i];
    var target = step.target;
    if (!target) continue;
    var el = document.querySelector('[role="' + target.role + '"][aria-label="' + target.name + '"]') as any;
    if (!el) continue;

    if (step.action.startsWith('editor-')) {
      var bridge = getBridge();
      if (!bridge) continue;
      var a = step.action;
      if (a === 'editor-set-content') { bridge.setContent(step.value); }
      else if (a === 'editor-insert') { bridge.insertText(step.value); }
      else if (a === 'editor-cursor') { bridge.setCursor(step.line, step.col); }
      else if (a === 'editor-highlight') { bridge.highlight(step.from, step.to, step.style); }
    } else if (typeof el[step.action] === 'function') {
      var args = [];
      var skip = new Set(['action', 'target']);
      for (var key in step) {
        if (!skip.has(key) && step[key] !== undefined) args.push(step[key]);
      }
      var result = el[step.action].apply(el, args);
      if (result instanceof Promise) await result;
    }

    if (step.action === 'beginEditSession') {
      activeSession = getBridge()?.beginEditSession?.(step.owner) ?? null;
      if (sessionBtn) sessionBtn.textContent = 'End Edit Session';
    }

    updateStatus();
  }
}

var picker = document.getElementById('scenario-picker');
if (picker) {
  SCENARIOS.forEach(function(entry) {
    var btn = document.createElement('button');
    btn.style.cssText = 'display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 8px 12px; background: var(--pages-accent-3); border: 1px solid var(--pages-accent-6); border-radius: 4px; cursor: pointer; color: var(--pages-accent-11); font-size: 12px; text-align: left; transition: background 0.15s; width: 100%;';
    btn.innerHTML = '<strong>' + entry.name + '</strong><span style="font-size: 10px; color: var(--pages-neutral-8);">' + entry.description + '</span>';
    btn.onclick = async function() {
      picker.querySelectorAll('button').forEach(function(b) { (b as any).disabled = true; });
      await runScenario(entry.steps, 800);
      picker.querySelectorAll('button').forEach(function(b) { (b as any).disabled = false; });
    };
    picker.appendChild(btn);
  });
}
