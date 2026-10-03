var DD_EXAMPLES = [];

var ddLogEl = document.getElementById('dd-event-log');
var ddStateEl = document.getElementById('dd-state');
var ddStepEl = document.getElementById('dd-step');
var ddInjectionsEl = document.getElementById('dd-injections');
var ddProgressEl = document.getElementById('dd-progress');
var ddDataView = document.getElementById('dd-data-view');
var ddYamlEl = document.getElementById('dd-yaml-source');
var ddDescEl = document.getElementById('dd-example-description');
var ddPicker = document.getElementById('dd-example-picker');
var ddRunBtn = document.getElementById('dd-run-btn');
var ddCurrentRunner = null;
var ddRunGen = 0;
var ddInjectionCount = 0;
var ddInjectedData = {};

function ddFormatTime(ms) {
  var s = Math.floor(ms / 1000);
  var sec = s % 60;
  var millis = ms % 1000;
  return '00:' + (sec < 10 ? '0' : '') + sec + '.' + (millis < 100 ? '0' : '') + (millis < 10 ? '0' : '') + millis;
}

function ddLog(time, queue, action, status) {
  if (!ddLogEl) return;
  var line = document.createElement('div');
  line.textContent = '[' + ddFormatTime(time) + ']  ' + queue.padEnd(14) + action.padEnd(24) + status;
  line.style.color = status === '✓' ? '#4ade80' : status === '⏱' ? '#f59e0b' : '#a78bfa';
  ddLogEl.appendChild(line);
  ddLogEl.scrollTop = ddLogEl.scrollHeight;
}

function ddRenderData() {
  if (!ddDataView) return;
  var html = '';
  for (var ds in ddInjectedData) {
    html += '<div style="margin-bottom: 8px;">';
    html += '<span style="color: var(--pages-accent-9); font-weight: 600;">' + ds + '</span>';
    ddInjectedData[ds].forEach(function(row) {
      html += '<div style="margin-left: 12px; color: var(--pages-neutral-10);">' + JSON.stringify(row) + '</div>';
    });
    html += '</div>';
  }
  ddDataView.innerHTML = html || '<div style="color: var(--pages-neutral-7);">No data injected yet</div>';
}

function ddResetUI() {
  if (ddLogEl) ddLogEl.innerHTML = '';
  if (ddStateEl) { ddStateEl.textContent = 'idle'; ddStateEl.style.color = '#4ade80'; }
  if (ddStepEl) ddStepEl.textContent = '—';
  if (ddProgressEl) ddProgressEl.textContent = '0%';
  ddInjectionCount = 0;
  if (ddInjectionsEl) ddInjectionsEl.textContent = '0';
  ddInjectedData = {};
  ddRenderData();
}

function ddShowExample(idx) {
  var ex = DD_EXAMPLES[idx];
  if (!ex) return;
  if (ddYamlEl) ddYamlEl.value = ex.yaml;
  if (ddDescEl) {
    ddDescEl.innerHTML = '';
    if (ex.tags && ex.tags.length > 0) {
      var tagSpan = document.createElement('span');
      tagSpan.style.cssText = 'display: inline-flex; gap: 4px; margin-right: 6px; vertical-align: middle;';
      ex.tags.forEach(function(t) {
        var chip = document.createElement('span');
        chip.textContent = t;
        chip.style.cssText = 'padding: 1px 6px; border-radius: 3px; background: var(--pages-accent-3); color: var(--pages-accent-9); font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px;';
        tagSpan.appendChild(chip);
      });
      ddDescEl.appendChild(tagSpan);
    }
    ddDescEl.appendChild(document.createTextNode(ex.description));
  }
}

function ddFindByLabel(name) {
  var el = document.querySelector('[aria-label="' + name + '"]');
  if (el) return el;
  var hosts = document.querySelectorAll('*');
  for (var i = 0; i < hosts.length; i++) {
    var root = hosts[i].shadowRoot;
    if (root) {
      el = root.querySelector('[aria-label="' + name + '"]');
      if (el) return el;
    }
  }
  return null;
}

function ddRunExample(idx) {
  if (ddCurrentRunner) {
    ddCurrentRunner.dispose();
    ddCurrentRunner = null;
  }
  ddRunGen++;
  var thisGen = ddRunGen;
  ddResetUI();

  var ex = DD_EXAMPLES[idx];
  if (!ex) return;

  var parseScenario = window.casehubPages && window.casehubPages.parseScenario;
  var createScheduler = window.casehubPages && window.casehubPages.createScheduler;
  var createScenarioCatalog = window.casehubPages && window.casehubPages.createScenarioCatalog;
  if (!parseScenario || !createScheduler || !createScenarioCatalog) return;

  var catalog = createScenarioCatalog();
  var scenario;
  try {
    scenario = parseScenario(ex.yaml, catalog);
  } catch (e) {
    ddLog(0, 'system', 'parse error', e.message || String(e));
    return;
  }

  var eventTarget = new EventTarget();

  eventTarget.addEventListener('pages-event', function(e) {
    if (thisGen !== ddRunGen) return;
    var detail = e.detail;
    if (!detail) return;

    if (detail.topic === 'scenario:state') {
      var payload = detail.payload;
      if (ddProgressEl) ddProgressEl.textContent = Math.round(payload.progress * 100) + '%';
      if (payload.progress >= 1) {
        if (ddStateEl) { ddStateEl.textContent = 'done'; ddStateEl.style.color = '#4ade80'; }
      }
    }

    if (detail.topic === 'scenario:step') {
      var sp = detail.payload;
      var step = sp.step;
      var kind = step ? step.kind : '?';
      var label = kind;
      if (kind === 'plugin' && step.entry) {
        var qn = step.entry.qualifiedName;
        if (qn === 'simulated') label = 'inject → ' + ((step.params && step.params.dataset) || '?');
        else if (qn === 'graphql') label = 'gql → ' + ((step.params && (step.params.operation || step.params.name)) || '?');
        else label = qn + ' ' + ((step.params && step.params.name) || '');
      } else if (kind === 'delay') label = 'delay ' + (step.duration || '');

      if (ddStepEl) ddStepEl.textContent = label;
      ddLog(sp.virtualTime, sp.queue || 'main', label, '✓');
    }
  });

  var runner = createScheduler(scenario, {
    eventTarget: eventTarget,
    speed: 1,
    startPaused: false,
  });

  ddCurrentRunner = runner;
  if (ddStateEl) { ddStateEl.textContent = 'playing'; ddStateEl.style.color = '#3b82f6'; }
  runner.play();
}

if (ddPicker) {
  ddPicker.addEventListener('change', function() {
    if (ddCurrentRunner) { ddCurrentRunner.dispose(); ddCurrentRunner = null; }
    ddResetUI();
    ddShowExample(parseInt(ddPicker.value, 10));
  });
}

if (ddRunBtn) {
  ddRunBtn.addEventListener('click', function() {
    ddRunExample(ddPicker ? parseInt(ddPicker.value, 10) : 0);
  });
}

// Load scenarios from shared files
fetch('../../scenarios/manifest.json')
  .then(function(r) { return r.json(); })
  .then(function(manifest) {
    var cat = null;
    for (var i = 0; i < manifest.categories.length; i++) {
      if (manifest.categories[i].key === 'data-delivery') { cat = manifest.categories[i]; break; }
    }
    if (!cat) return;
    var fetches = cat.scenarios.map(function(entry) {
      return fetch('../../scenarios/' + entry.file)
        .then(function(r) { return r.text(); })
        .then(function(yamlText) {
          return { name: entry.title, tags: entry.tags, description: entry.description, yaml: yamlText };
        });
    });
    return Promise.all(fetches);
  })
  .then(function(loaded) {
    if (!loaded) return;
    DD_EXAMPLES = loaded;
    if (ddPicker) {
      ddPicker.innerHTML = '';
      DD_EXAMPLES.forEach(function(ex, i) {
        var opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = ex.name;
        ddPicker.appendChild(opt);
      });
    }
    ddShowExample(0);
  });
