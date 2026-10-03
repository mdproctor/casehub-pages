var COMP_EXAMPLES = {};
var COMP_KEYS = [];

function compDetectTriggers(yamlText) {
  var triggers = [];
  var re = /- trigger:\s*\n\s+type:\s*(\w+)\s*\n\s+(?:channel:\s*(\w+)|delay:\s*(\S+))/g;
  var m;
  while ((m = re.exec(yamlText)) !== null) {
    var t = { type: m[1] };
    if (m[2]) { t.name = m[2]; }
    else { t.name = 'timer'; if (m[3]) t.delay = m[3]; }
    triggers.push(t);
  }
  return triggers;
}

function compFormatTime(ms) {
  var s = Math.floor(ms / 1000);
  var m = ms % 1000;
  return '[' + String(s).padStart(2, '0') + ':' + String(m).padStart(3, '0') + ']';
}

function compLog(msg, queue, virtualTime) {
  var log = document.getElementById('comp-event-log');
  if (!log) return;
  var line = document.createElement('div');
  var timeStr = compFormatTime(virtualTime || 0);
  var queueStr = (queue || '').padEnd(12);
  line.textContent = timeStr + '  ' + queueStr + msg;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

function compUpdateState(state) {
  var el = document.getElementById('comp-state');
  if (!el) return;
  el.textContent = state;
  el.style.color = state === 'done' ? '#3b82f6' : state === 'playing' ? '#4ade80' : '#f59e0b';
}

function compUpdateTime(ms) {
  var el = document.getElementById('comp-time');
  if (el) el.textContent = ms + 'ms';
}

function compUpdateProgress(progress) {
  var el = document.getElementById('comp-progress');
  if (el) el.textContent = Math.round(progress * 100) + '%';
}

function compRenderTriggers(triggers) {
  var container = document.getElementById('trigger-states');
  var list = document.getElementById('trigger-list');
  if (!container || !list) return;
  list.innerHTML = '';
  if (triggers.length === 0) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';
  var countEl = document.getElementById('comp-trigger-count');
  if (countEl) countEl.textContent = String(triggers.length);
  triggers.forEach(function(t) {
    var row = document.createElement('div');
    row.id = 'trigger-' + t.name;
    row.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: var(--pages-neutral-3); border-radius: 4px;';
    row.innerHTML = '<span style="width: 8px; height: 8px; border-radius: 50%; background: #6b7280;" id="trigger-dot-' + t.name + '"></span>'
      + '<span style="font-size: 12px; color: var(--pages-neutral-12);">' + t.name + ' (' + t.type + ')</span>'
      + '<span style="font-size: 10px; color: var(--pages-neutral-8); margin-left: auto;" id="trigger-status-' + t.name + '">suspended</span>'
      + '<button id="trigger-fire-' + t.name + '" style="padding: 2px 10px; font-size: 11px; border: 1px solid var(--pages-accent-6); border-radius: 4px; background: var(--pages-accent-3); color: var(--pages-accent-9); cursor: pointer; margin-left: 4px;">Send</button>';
    list.appendChild(row);
    var fireBtn = document.getElementById('trigger-fire-' + t.name);
    if (fireBtn) {
      fireBtn.addEventListener('click', function() {
        if (compCurrentRunner && compCurrentRunner.injectData) {
          compCurrentRunner.injectData(t.name, { ts: +new Date() });
          compLog('data → ' + t.name, 'user', 0);
        }
      });
    }
  });
}

function compSetTriggerStatus(name, status) {
  var dot = document.getElementById('trigger-dot-' + name);
  var label = document.getElementById('trigger-status-' + name);
  if (dot) {
    dot.style.background = status === 'suspended' ? '#6b7280' : status === 'active' ? '#4ade80' : '#3b82f6';
  }
  if (label) label.textContent = status;
}

var compDescEl = document.getElementById('comp-description');

function compShowYaml(key) {
  var example = COMP_EXAMPLES[key];
  var pre = document.getElementById('comp-yaml-source');
  if (pre && example) pre.value = example.yaml;
  if (compDescEl && example) {
    compDescEl.innerHTML = '';
    if (example.tags && example.tags.length > 0) {
      var tagSpan = document.createElement('span');
      tagSpan.style.cssText = 'display: inline-flex; gap: 4px; margin-right: 6px; vertical-align: middle; flex-wrap: wrap;';
      example.tags.forEach(function(t) {
        var chip = document.createElement('span');
        chip.textContent = t;
        chip.style.cssText = 'padding: 1px 6px; border-radius: 3px; background: var(--pages-accent-3); color: var(--pages-accent-9); font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px;';
        tagSpan.appendChild(chip);
      });
      compDescEl.appendChild(tagSpan);
    }
    compDescEl.appendChild(document.createTextNode(example.description));
  }
  var interactive = document.getElementById('comp-interactive');
  var runBtn = document.getElementById('comp-run-btn');
  var speedRow = document.getElementById('comp-speed-slider');
  var isYamlOnly = example && !example.runnable;
  if (interactive) interactive.style.display = isYamlOnly ? 'none' : '';
  if (runBtn) runBtn.style.display = isYamlOnly ? 'none' : '';
  if (speedRow) speedRow.parentElement.style.display = isYamlOnly ? 'none' : '';
}

function compResetUI() {
  var log = document.getElementById('comp-event-log');
  if (log) log.innerHTML = '';
  compUpdateState('Ready');
  compUpdateTime(0);
  compUpdateProgress(0);
  var list = document.getElementById('trigger-list');
  if (list) list.innerHTML = '';
  var container = document.getElementById('trigger-states');
  if (container) container.style.display = 'none';
  var countEl = document.getElementById('comp-trigger-count');
  if (countEl) countEl.textContent = '0';
}

function compFindByAriaLabel(name) {
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

var compStepDelay = 500;

function compFlashButton(name) {
  var btn = compFindByAriaLabel(name);
  if (!btn) return;
  btn.style.background = '#22c55e';
  btn.style.borderColor = '#22c55e';
  btn.style.color = '#000';
  setTimeout(function() {
    btn.style.background = 'var(--pages-accent-3)';
    btn.style.borderColor = 'var(--pages-accent-6)';
    btn.style.color = 'var(--pages-accent-11)';
  }, Math.max(compStepDelay - 150, 50));
}

var compCurrentRunner = null;

function compRunExample(key) {
  if (compCurrentRunner) {
    compCurrentRunner.dispose();
    compCurrentRunner = null;
  }
  compResetUI();

  var example = COMP_EXAMPLES[key];
  if (!example) return;

  compRenderTriggers(example.triggers);

  var et = new EventTarget();
  var startTime = Date.now();

  et.addEventListener('pages-event', function(e) {
    var detail = e.detail;
    if (detail.topic === 'scenario:state') {
      var payload = detail.payload;
      compUpdateState(payload.paused ? 'paused' : (payload.progress >= 1 ? 'done' : 'playing'));
      compUpdateProgress(payload.progress);
      if (payload.virtualTime !== undefined) compUpdateTime(payload.virtualTime);
    }
    if (detail.topic === 'scenario:step') {
      var p = detail.payload;
      var step = p.step;
      var action = step.entry ? step.entry.qualifiedName : (step.kind || '?');
      var target = step.params ? (step.params.name || '') : (step.name || step.duration || '');
      var label = action + (target ? ' ' + target : '');
      compLog(label.padEnd(20) + '✓', p.queue, p.virtualTime);
      compUpdateTime(p.virtualTime);
    }
    if (detail.topic === 'scenario:queue') {
      var q = detail.payload;
      if (q.state === 'done') {
        compLog('← done', q.queueId, 0);
      }
      if (q.reason === 'delay') {
        compLog('← blocked (delay)', q.queueId, 0);
      }
      // Update trigger visualization
      example.triggers.forEach(function(t) {
        if (q.queueId.indexOf('trigger') === 0) {
          if (q.state === 'ready' || q.state === 'done') {
            compSetTriggerStatus(t.name, q.state === 'ready' ? 'active' : 'fired');
          }
        }
      });
    }
  });

  compLog('Starting: ' + key, 'system', 0);

  try {
    var catalog = casehubPages.createScenarioCatalog();
    var scenario = casehubPages.parseScenario(example.yaml, catalog);
    var runner = casehubPages.createScheduler(scenario, {
      eventTarget: et,
      speed: 1,
      startPaused: true,
    });
    compCurrentRunner = runner;
    runner.play();
  } catch (err) {
    compLog('Error: ' + err.message, 'system', 0);
  }
}

// Wire up speed slider
var compSpeedSlider = document.getElementById('comp-speed-slider');
var compSpeedLabel = document.getElementById('comp-speed-label');
if (compSpeedSlider) {
  compSpeedSlider.addEventListener('input', function() {
    compStepDelay = parseInt(compSpeedSlider.value, 10);
    if (compSpeedLabel) compSpeedLabel.textContent = compStepDelay + 'ms';
  });
}

// Load scenarios from shared files
fetch('../../scenarios/manifest.json')
  .then(function(r) { return r.json(); })
  .then(function(manifest) {
    var cat = null;
    for (var i = 0; i < manifest.categories.length; i++) {
      if (manifest.categories[i].key === 'composition') { cat = manifest.categories[i]; break; }
    }
    if (!cat) return;
    var fetches = cat.scenarios.map(function(entry) {
      return fetch('../../scenarios/' + entry.file)
        .then(function(r) { return r.text(); })
        .then(function(yamlText) {
          var slug = entry.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          return {
            key: slug, title: entry.title, tags: entry.tags,
            description: entry.description, yaml: yamlText,
            runnable: entry.runnable, triggers: compDetectTriggers(yamlText),
          };
        });
    });
    return Promise.all(fetches);
  })
  .then(function(loaded) {
    if (!loaded) return;
    loaded.forEach(function(ex) {
      COMP_EXAMPLES[ex.key] = ex;
      COMP_KEYS.push(ex.key);
    });
    var compPicker = document.getElementById('comp-example-picker');
    if (compPicker) {
      compPicker.innerHTML = '';
      COMP_KEYS.forEach(function(key) {
        var opt = document.createElement('option');
        opt.value = key;
        opt.textContent = COMP_EXAMPLES[key].title;
        compPicker.appendChild(opt);
      });
      compShowYaml(compPicker.value);
      compPicker.addEventListener('change', function() {
        if (compCurrentRunner) { compCurrentRunner.dispose(); compCurrentRunner = null; }
        compResetUI();
        compShowYaml(compPicker.value);
      });
    }
    var compRunBtn = document.getElementById('comp-run-btn');
    if (compRunBtn) {
      compRunBtn.addEventListener('click', function() {
        var picker = document.getElementById('comp-example-picker');
        if (picker) compRunExample(picker.value);
      });
    }
  });
