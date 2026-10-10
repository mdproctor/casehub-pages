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
  '- `highlightSentence()` / `highlightText()` for semantic targeting',
  '- `createReader()` for animated line-by-line reading',
  '- `beginEditSession()` for exclusive locks with rollback',
  '',
  '### MCP Integration',
  '',
  'The `McpToolAdapter` maps tool calls to `EditableText` methods,',
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
var activeReader = null;
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
  var readerInfo = activeReader ? 'line ' + activeReader.position().line + ', col ' + activeReader.position().col : 'none';
  var highlights = bridge ? bridge.listHighlights() : [];
  statusOutput.textContent =
    'Mode: ' + currentMode + '\n' +
    'Lines: ' + lines + '\n' +
    'Session: ' + sessionInfo + '\n' +
    'Reader: ' + readerInfo + '\n' +
    'Highlights: ' + highlights.length;
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
    casehubPages.progressiveInsert(bridge, '\n\n> **Note:** This text was inserted programmatically via the EditableText bridge.\n');
  }
});

var btnInsertLarge = document.getElementById('btn-insert-large');
if (btnInsertLarge) btnInsertLarge.addEventListener('click', function() {
  var bridge = getBridge();
  if (bridge) {
    var largeText = '\n\n## Architectural Overview\n\n'
      + 'The platform follows a layered architecture where each tier has a single responsibility '
      + 'and communicates through well-defined interfaces. The data layer handles ingestion, '
      + 'validation, and transformation of raw inputs into structured records. The processing '
      + 'layer applies business rules, enrichment, and correlation across multiple data streams. '
      + 'The presentation layer renders the final output through composable visual components.\n\n'
      + 'Each layer is independently deployable and testable. The data layer exposes a streaming '
      + 'API that the processing layer consumes through backpressure-aware channels. The processing '
      + 'layer publishes enriched events that the presentation layer subscribes to via push protocol. '
      + 'This decoupling means any layer can be replaced or scaled without affecting the others. '
      + 'Schema evolution is handled through versioned contracts at each boundary.\n\n'
      + '### Component Model\n\n'
      + 'Components are self-describing units that declare their inputs, outputs, and configuration '
      + 'schema. The runtime discovers and wires components dynamically based on page definitions. '
      + 'Each component manages its own lifecycle — initialisation, data binding, rendering, and '
      + 'teardown — without relying on a central coordinator. Inter-component communication uses '
      + 'a typed event bus that enforces payload contracts at compile time.\n\n'
      + 'The bridge pattern enables programmatic access to any component through a uniform interface. '
      + 'This is critical for scenarios where external systems — playbooks, LLM agents, or test '
      + 'harnesses — need to inspect and manipulate component state without knowledge of the '
      + 'underlying rendering engine. The same bridge that drives a Milkdown editor works equally '
      + 'well with CodeMirror, a property palette, or a graph canvas.\n';
    casehubPages.progressiveInsert(bridge, largeText);
  }
});

var activeMode = null;
var activeHlId = null;
var activeBtn = null;
var activeApplyFn = null;
var ACTIVE_STYLE = 'background: var(--pages-accent-3); border: 1px solid var(--pages-accent-6); color: var(--pages-accent-11);';
var INACTIVE_STYLE = 'background: var(--pages-neutral-2); border: 1px solid var(--pages-neutral-5); color: var(--pages-neutral-11);';

function clearActiveHighlight() {
  var bridge = getBridge();
  if (bridge && activeHlId) bridge.removeHighlight(activeHlId);
  if (activeBtn) activeBtn.style.cssText = activeBtn.style.cssText.replace(ACTIVE_STYLE, INACTIVE_STYLE);
  activeHlId = null;
  activeMode = null;
  activeBtn = null;
  activeApplyFn = null;
}

function toggleHighlight(mode, btn, applyFn) {
  var bridge = getBridge();
  if (!bridge) return;
  if (activeMode === mode) {
    clearActiveHighlight();
  } else {
    clearActiveHighlight();
    activeHlId = applyFn(bridge);
    activeMode = mode;
    activeBtn = btn;
    activeApplyFn = applyFn;
    btn.style.cssText = btn.style.cssText.replace(INACTIVE_STYLE, ACTIVE_STYLE);
  }
  updateStatus();
}

var resizeTimer = null;
window.addEventListener('resize', function() {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(function() {
    if (activeHlId && activeApplyFn) {
      var bridge = getBridge();
      if (bridge) {
        bridge.removeHighlight(activeHlId);
        activeHlId = activeApplyFn(bridge);
      }
    }
  }, 150);
});

var btnHighlightLine = document.getElementById('btn-highlight-line');
if (btnHighlightLine) btnHighlightLine.addEventListener('click', function() {
  toggleHighlight('line', btnHighlightLine, function(bridge) {
    var cursor = bridge.getCursor();
    return bridge.highlightLine(cursor.line, 1, 'pulse');
  });
});

var btnHighlightSentence = document.getElementById('btn-highlight-sentence');
if (btnHighlightSentence) btnHighlightSentence.addEventListener('click', function() {
  toggleHighlight('sentence', btnHighlightSentence, function(bridge) {
    return bridge.highlightSentence(undefined, 'underline');
  });
});

var btnHighlightBlock = document.getElementById('btn-highlight-block');
if (btnHighlightBlock) btnHighlightBlock.addEventListener('click', function() {
  toggleHighlight('block', btnHighlightBlock, function(bridge) {
    var cursor = bridge.getCursor();
    return bridge.highlightBlock(cursor, 'glow');
  });
});

var btnCustomStyle = document.getElementById('btn-custom-style');
if (btnCustomStyle) btnCustomStyle.addEventListener('click', function() {
  toggleHighlight('custom', btnCustomStyle, function(bridge) {
    var cursor = bridge.getCursor();
    return bridge.highlightLine(cursor.line, 3, {
      background: 'rgba(34, 197, 94, 0.15)',
      border: '1px dashed rgba(34, 197, 94, 0.5)',
      borderRadius: '4px',
      label: 'Suggestion: consider refactoring this section',
      group: 'suggestions',
    });
  });
});

var searchActive = false;
var btnHighlightText = document.getElementById('btn-highlight-text');
if (btnHighlightText) btnHighlightText.addEventListener('click', function() {
  var bridge = getBridge();
  var input = document.getElementById('highlight-text-input');
  if (!bridge || !input) return;
  if (searchActive) {
    bridge.clearHighlightGroup('find');
    searchActive = false;
    btnHighlightText.textContent = 'Find All';
  } else if (input.value) {
    bridge.highlightText(input.value, { background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', group: 'find' });
    searchActive = true;
    btnHighlightText.textContent = 'Clear Find';
  }
  updateStatus();
});

var btnClearHl = document.getElementById('btn-clear-hl');
if (btnClearHl) btnClearHl.addEventListener('click', function() {
  var bridge = getBridge();
  if (bridge) {
    bridge.clearHighlights();
    clearActiveHighlight();
    searchActive = false;
    if (btnHighlightText) btnHighlightText.textContent = 'Find All';
    updateStatus();
  }
});

var btnListHighlights = document.getElementById('btn-list-highlights');
if (btnListHighlights) btnListHighlights.addEventListener('click', function() {
  var bridge = getBridge();
  var output = document.getElementById('readback-output');
  if (bridge && output) {
    var list = bridge.listHighlights();
    if (list.length === 0) {
      output.textContent = '(no active highlights)';
    } else {
      output.textContent = list.map(function(h) {
        var group = h.group ? ' [' + h.group + ']' : '';
        var text = h.text.length > 40 ? h.text.substring(0, 40) + '...' : h.text;
        return h.id + group + ': "' + text + '"';
      }).join('\n');
    }
  }
});

var btnGetText = document.getElementById('btn-get-text');
if (btnGetText) btnGetText.addEventListener('click', function() {
  var bridge = getBridge();
  var output = document.getElementById('readback-output');
  if (bridge && output) {
    var list = bridge.listHighlights();
    if (list.length === 0) {
      output.textContent = '(no highlights to read)';
    } else {
      var last = list[list.length - 1];
      var text = bridge.getHighlightText(last.id);
      output.textContent = last.id + ':\n' + (text || '(empty)');
    }
  }
});

var btnReaderStart = document.getElementById('btn-reader-start');
if (btnReaderStart) btnReaderStart.addEventListener('click', function() {
  var bridge = getBridge();
  if (bridge) {
    if (activeReader) activeReader.dispose();
    activeReader = bridge.createReader({
      background: 'rgba(99, 102, 241, 0.25)',
      border: '2px solid rgba(99, 102, 241, 0.6)',
      borderRadius: '3px',
    });
    updateStatus();
  }
});

var btnReaderAdvance = document.getElementById('btn-reader-advance');
if (btnReaderAdvance) btnReaderAdvance.addEventListener('click', function() {
  if (activeReader) {
    activeReader.advance();
    updateStatus();
  }
});

var btnReaderAdvanceLine = document.getElementById('btn-reader-advance-line');
if (btnReaderAdvanceLine) btnReaderAdvanceLine.addEventListener('click', function() {
  if (activeReader) {
    activeReader.advanceLine();
    updateStatus();
  }
});

var btnReaderStop = document.getElementById('btn-reader-stop');
if (btnReaderStop) btnReaderStop.addEventListener('click', function() {
  if (activeReader) {
    activeReader.dispose();
    activeReader = null;
    updateStatus();
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
    description: 'Load, insert, highlight line and sentence',
    steps: [
      { action: 'editor-set-content', target: { role: 'textbox', name: 'Markdown editor' }, value: sampleContent, typing: 'instant' },
      { action: 'editor-cursor', target: { role: 'textbox', name: 'Markdown editor' }, line: 4, col: 0 },
      { action: 'editor-highlight', target: { role: 'textbox', name: 'Markdown editor' }, from: { line: 4, col: 0 }, to: { line: 4, col: 40 }, style: 'pulse' },
      { action: 'editor-highlight-sentence', target: { role: 'textbox', name: 'Markdown editor' } },
      { action: 'editor-insert', target: { role: 'textbox', name: 'Markdown editor' }, value: '\n\n---\n\n*Inserted by playbook*\n', typing: 'progressive' },
    ],
  },
  {
    name: 'Find & Highlight',
    description: 'Search for text, highlight all, then list',
    steps: [
      { action: 'editor-set-content', target: { role: 'textbox', name: 'Markdown editor' }, value: sampleContent, typing: 'instant' },
      { action: 'editor-highlight-text', target: { role: 'textbox', name: 'Markdown editor' }, query: 'bridge', style: { background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', group: 'find' } },
      { action: 'editor-list-highlights', target: { role: 'textbox', name: 'Markdown editor' } },
    ],
  },
  {
    name: 'Line Reader',
    description: 'Start a reader and advance through sentences',
    steps: [
      { action: 'editor-set-content', target: { role: 'textbox', name: 'Markdown editor' }, value: sampleContent, typing: 'instant' },
      { action: 'editor-reader-start', target: { role: 'textbox', name: 'Markdown editor' }, style: { background: 'rgba(99, 102, 241, 0.25)', border: '2px solid rgba(99, 102, 241, 0.6)' } },
      { action: 'editor-reader-advance', target: { role: 'textbox', name: 'Markdown editor' } },
      { action: 'editor-reader-advance', target: { role: 'textbox', name: 'Markdown editor' } },
      { action: 'editor-reader-advance', target: { role: 'textbox', name: 'Markdown editor' } },
      { action: 'editor-reader-stop', target: { role: 'textbox', name: 'Markdown editor' } },
    ],
  },
  {
    name: 'Custom Styling',
    description: 'Apply custom HighlightOptions with groups',
    steps: [
      { action: 'editor-set-content', target: { role: 'textbox', name: 'Markdown editor' }, value: sampleContent, typing: 'instant' },
      { action: 'editor-cursor', target: { role: 'textbox', name: 'Markdown editor' }, line: 4, col: 0 },
      { action: 'editor-highlight-custom', target: { role: 'textbox', name: 'Markdown editor' }, line: 4, count: 2, style: { background: 'rgba(34, 197, 94, 0.15)', border: '1px dashed rgba(34, 197, 94, 0.5)', group: 'suggestions' } },
      { action: 'editor-cursor', target: { role: 'textbox', name: 'Markdown editor' }, line: 18, col: 0 },
      { action: 'editor-highlight-custom', target: { role: 'textbox', name: 'Markdown editor' }, line: 18, count: 1, style: { background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', group: 'errors' } },
      { action: 'editor-clear-group', target: { role: 'textbox', name: 'Markdown editor' }, group: 'suggestions' },
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
      else if (a === 'editor-insert') { await casehubPages.progressiveInsert(bridge, step.value); }
      else if (a === 'editor-cursor') { bridge.setCursor(step.line, step.col); }
      else if (a === 'editor-highlight') { bridge.highlight(step.from, step.to, step.style); }
      else if (a === 'editor-highlight-sentence') { bridge.highlightSentence(undefined, 'underline'); }
      else if (a === 'editor-highlight-text') { bridge.highlightText(step.query, step.style); }
      else if (a === 'editor-highlight-custom') { bridge.highlightLine(step.line, step.count, step.style); }
      else if (a === 'editor-clear-group') { bridge.clearHighlightGroup(step.group); }
      else if (a === 'editor-list-highlights') {
        var output = document.getElementById('readback-output');
        if (output) {
          var list = bridge.listHighlights();
          output.textContent = list.map(function(h) {
            var group = h.group ? ' [' + h.group + ']' : '';
            var text = h.text.length > 40 ? h.text.substring(0, 40) + '...' : h.text;
            return h.id + group + ': "' + text + '"';
          }).join('\n');
        }
      }
      else if (a === 'editor-reader-start') {
        if (activeReader) activeReader.dispose();
        activeReader = bridge.createReader(step.style);
      }
      else if (a === 'editor-reader-advance') {
        if (activeReader) activeReader.advance();
      }
      else if (a === 'editor-reader-stop') {
        if (activeReader) { activeReader.dispose(); activeReader = null; }
      }
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