var DOC_V1 = [
  '# Component Architecture',
  '',
  '## Overview',
  '',
  'The Pages platform uses a component-based architecture where each',
  'visual element is a self-contained web component with its own',
  'shadow DOM, styles, and lifecycle.',
  '',
  '## Data Flow',
  '',
  'Components receive data through properties and emit events for',
  'state changes. The runtime binds YAML declarations to component',
  'instances at load time.',
  '',
  '## Theming',
  '',
  'All components use CSS custom properties from the `--pages-*`',
  'token namespace. Themes are applied globally via `applyTheme()`.',
  '',
  '## Extension Points',
  '',
  'New components are registered via the component registry. Each',
  'component declares its property schema for the builder UI.',
  '',
  '## Testing',
  '',
  'Components are tested with Vitest in a jsdom environment.',
  'Integration tests use Playwright for browser verification.',
].join('\n');

var DOC_V2 = [
  '# Component Architecture',
  '',
  '## Overview',
  '',
  'The Pages platform uses a component-based architecture where each',
  'visual element is a self-contained web component with its own',
  'shadow DOM, styles, and lifecycle management.',
  '',
  'Components communicate through a typed event bus rather than',
  'direct property binding, enabling loose coupling between',
  'independently developed modules.',
  '',
  '## Data Flow',
  '',
  'Components receive data through reactive properties and emit',
  'structured events for state changes. The runtime binds YAML',
  'declarations to component instances at load time, with automatic',
  're-rendering on property updates.',
  '',
  '### Pipeline Integration',
  '',
  'Data pipelines feed components via the `lookup` property. The',
  'runtime resolves dataset references and injects rows as the',
  'pipeline produces them — components never fetch their own data.',
  '',
  '## Theming',
  '',
  'All components use CSS custom properties from the `--pages-*`',
  'token namespace. Themes are applied globally via `applyTheme()`.',
  'Dark mode is supported via the `casehub-dark` theme variant.',
  '',
  '## Extension Points',
  '',
  'New components are registered via the component registry. Each',
  'component declares its property schema for the builder UI and',
  'the LSP for YAML completions.',
  '',
  '### MCP Integration',
  '',
  'Components can expose methods as MCP tools via the',
  '`McpToolAdapter`. This enables LLM-driven interaction with',
  'any component that implements the `EditableText` interface.',
  '',
  '## Testing',
  '',
  'Components are tested with Vitest in a jsdom environment.',
  'Integration tests use Playwright for real browser verification.',
  'Visual regression tests capture screenshots for comparison.',
].join('\n');

var diff = document.getElementById('diff-viewer') as any;
var summaryOutput = document.getElementById('summary-output');

function updateSummary() {
  if (!diff || !summaryOutput) return;
  var s = diff.getDiffSummary();
  summaryOutput.textContent =
    'Modified: ' + s.modified + '\n' +
    'Deleted:  ' + s.deleted + '\n' +
    'Inserted: ' + s.inserted + '\n' +
    'Total:    ' + s.totalDiffs + '\n' +
    'Current:  ' + (s.currentIdx >= 0 ? (s.currentIdx + 1) + '/' + s.totalDiffs : '—');
}

function loadDocs() {
  if (!diff) return;
  diff.loadContent('a', DOC_V1, 'v1.0 — Original');
  diff.loadContent('b', DOC_V2, 'v2.0 — Revised');
  setTimeout(updateSummary, 100);
}

var btnLoad = document.getElementById('btn-load');
if (btnLoad) btnLoad.addEventListener('click', loadDocs);

var btnNext = document.getElementById('btn-next');
if (btnNext) btnNext.addEventListener('click', function() {
  if (diff) { diff.nextDiff(); updateSummary(); }
});

var btnPrev = document.getElementById('btn-prev');
if (btnPrev) btnPrev.addEventListener('click', function() {
  if (diff) { diff.prevDiff(); updateSummary(); }
});

var btnSwap = document.getElementById('btn-swap');
if (btnSwap) btnSwap.addEventListener('click', function() {
  if (diff) { diff.swapPanels(); updateSummary(); }
});

var btnSync = document.getElementById('btn-sync');
if (btnSync) btnSync.addEventListener('click', function() {
  if (!diff) return;
  var enabled = diff.toggleSync();
  btnSync.textContent = enabled ? 'Toggle Scroll Sync (on)' : 'Toggle Scroll Sync (off)';
});

var btnUnified = document.getElementById('btn-unified');
if (btnUnified) btnUnified.addEventListener('click', function() {
  if (diff) diff.setViewMode('unified');
});

var btnSplit = document.getElementById('btn-split');
if (btnSplit) btnSplit.addEventListener('click', function() {
  if (diff) diff.setViewMode('split');
});

if (diff) {
  diff.addEventListener('diff-updated', updateSummary);
}

var SCENARIOS = [
  {
    name: 'Diff Navigation',
    description: 'Load docs, walk through all diffs',
    steps: [
      { action: 'loadContent', target: { role: 'region', name: 'Document diff' }, panel: 'a', content: DOC_V1, label: 'v1.0 — Original' },
      { action: 'loadContent', target: { role: 'region', name: 'Document diff' }, panel: 'b', content: DOC_V2, label: 'v2.0 — Revised' },
      { action: 'nextDiff', target: { role: 'region', name: 'Document diff' } },
      { action: 'nextDiff', target: { role: 'region', name: 'Document diff' } },
      { action: 'nextDiff', target: { role: 'region', name: 'Document diff' } },
      { action: 'prevDiff', target: { role: 'region', name: 'Document diff' } },
    ],
  },
  {
    name: 'View Modes',
    description: 'Switch between split and unified views',
    steps: [
      { action: 'loadContent', target: { role: 'region', name: 'Document diff' }, panel: 'a', content: DOC_V1, label: 'v1.0' },
      { action: 'loadContent', target: { role: 'region', name: 'Document diff' }, panel: 'b', content: DOC_V2, label: 'v2.0' },
      { action: 'setViewMode', target: { role: 'region', name: 'Document diff' }, mode: 'unified' },
      { action: 'nextDiff', target: { role: 'region', name: 'Document diff' } },
      { action: 'nextDiff', target: { role: 'region', name: 'Document diff' } },
      { action: 'setViewMode', target: { role: 'region', name: 'Document diff' }, mode: 'split' },
      { action: 'scrollToLocation', target: { role: 'region', name: 'Document diff' }, location: 'Extension Points' },
    ],
  },
  {
    name: 'Section Highlight',
    description: 'Highlight and navigate to specific sections',
    steps: [
      { action: 'loadContent', target: { role: 'region', name: 'Document diff' }, panel: 'a', content: DOC_V1, label: 'v1.0' },
      { action: 'loadContent', target: { role: 'region', name: 'Document diff' }, panel: 'b', content: DOC_V2, label: 'v2.0' },
      { action: 'scrollToLocation', target: { role: 'region', name: 'Document diff' }, location: 'Data Flow' },
      { action: 'highlightSection', target: { role: 'region', name: 'Document diff' }, location: 'Data Flow' },
      { action: 'scrollToLocation', target: { role: 'region', name: 'Document diff' }, location: 'Testing' },
      { action: 'highlightSection', target: { role: 'region', name: 'Document diff' }, location: 'Testing' },
      { action: 'clearHighlight', target: { role: 'region', name: 'Document diff' } },
      { action: 'swapPanels', target: { role: 'region', name: 'Document diff' } },
    ],
  },
];

async function runScenario(steps, delayMs) {
  for (var i = 0; i < steps.length; i++) {
    await new Promise(function(r) { setTimeout(r, delayMs); });
    var step = steps[i];
    var target = step.target;
    if (target) {
      var el = document.querySelector('[role="' + target.role + '"][aria-label="' + target.name + '"]') as any;
      if (el && typeof el[step.action] === 'function') {
        var args = [];
        var skip = new Set(['action', 'target']);
        for (var key in step) {
          if (!skip.has(key) && step[key] !== undefined) args.push(step[key]);
        }
        el[step.action].apply(el, args);
      }
    }
    updateSummary();
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
      await runScenario(entry.steps, 600);
      picker.querySelectorAll('button').forEach(function(b) { (b as any).disabled = false; });
    };
    picker.appendChild(btn);
  });
}

loadDocs();
