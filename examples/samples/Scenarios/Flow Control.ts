var EXAMPLES = [];

var logEl = document.getElementById('event-log');
var stateEl = document.getElementById('orch-state');
var stepEl = document.getElementById('orch-step');
var timeEl = document.getElementById('orch-time');
var progressEl = document.getElementById('orch-progress');
var yamlEl = document.getElementById('yaml-source');
var descEl = document.getElementById('example-description');
var picker = document.getElementById('example-picker');
var runBtn = document.getElementById('run-btn');
var speedSlider = document.getElementById('speed-slider');
var speedLabel = document.getElementById('speed-label');
var stepDelay = 500;
var currentRunner = null;
var runGeneration = 0;

if (speedSlider) {
  speedSlider.addEventListener('input', function() {
    stepDelay = parseInt(speedSlider.value, 10);
    if (speedLabel) speedLabel.textContent = stepDelay + 'ms';
  });
}

function formatTime(ms) {
  var s = Math.floor(ms / 1000);
  var m = Math.floor(s / 60);
  var sec = s % 60;
  var millis = ms % 1000;
  return (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec + '.' + (millis < 100 ? '0' : '') + (millis < 10 ? '0' : '') + millis;
}

function log(time, queue, action, status) {
  if (!logEl) return;
  var line = document.createElement('div');
  var timeStr = '[' + formatTime(time) + ']';
  var queueStr = queue.padEnd(12);
  var actionStr = action.padEnd(16);
  line.textContent = timeStr + '  ' + queueStr + actionStr + status;
  if (status === '✓') line.style.color = '#4ade80';
  else if (status === '⏭') line.style.color = '#f59e0b';
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function findByAriaLabel(name) {
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

function flashButton(name) {
  var btn = findByAriaLabel(name);
  if (!btn) return;
  btn.style.background = '#22c55e';
  btn.style.borderColor = '#22c55e';
  btn.style.color = '#000';
  setTimeout(function() {
    btn.style.background = 'var(--pages-neutral-2)';
    btn.style.borderColor = 'var(--pages-neutral-5)';
    btn.style.color = 'var(--pages-neutral-12)';
  }, Math.max(stepDelay - 150, 50));
}

function resetUI() {
  if (logEl) logEl.innerHTML = '';
  if (stateEl) stateEl.textContent = 'idle';
  if (stepEl) stepEl.textContent = '—';
  if (timeEl) timeEl.textContent = '0ms';
  if (progressEl) progressEl.textContent = '0%';
  var btns = document.querySelectorAll('#app-buttons button');
  btns.forEach(function(b) {
    b.style.background = 'var(--pages-neutral-2)';
    b.style.borderColor = 'var(--pages-neutral-5)';
    b.style.color = 'var(--pages-neutral-12)';
  });
}

function showExample(idx) {
  var ex = EXAMPLES[idx];
  if (!ex) return;
  if (yamlEl) yamlEl.value = ex.yaml;
  if (descEl) {
    descEl.innerHTML = '';
    if (ex.tags && ex.tags.length > 0) {
      var tagSpan = document.createElement('span');
      tagSpan.style.cssText = 'display: inline-flex; gap: 4px; margin-right: 6px; vertical-align: middle;';
      ex.tags.forEach(function(t) {
        var chip = document.createElement('span');
        chip.textContent = t;
        chip.style.cssText = 'padding: 1px 6px; border-radius: 3px; background: var(--pages-accent-3); color: var(--pages-accent-9); font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px;';
        tagSpan.appendChild(chip);
      });
      descEl.appendChild(tagSpan);
    }
    descEl.appendChild(document.createTextNode(ex.description));
  }
}

function runExample(idx) {
  if (currentRunner) {
    currentRunner.dispose();
    currentRunner = null;
  }
  runGeneration++;
  var thisGen = runGeneration;
  resetUI();

  var ex = EXAMPLES[idx];
  if (!ex) return;

  var parseScenario = window.casehubPages && window.casehubPages.parseScenario;
  var createScheduler = window.casehubPages && window.casehubPages.createScheduler;
  var createScenarioCatalog = window.casehubPages && window.casehubPages.createScenarioCatalog;

  if (!parseScenario || !createScheduler || !createScenarioCatalog) {
    log(0, 'system', 'error', 'scheduler not in bundle');
    return;
  }

  var catalog = createScenarioCatalog();
  var scenario;
  try {
    scenario = parseScenario(ex.yaml, catalog);
  } catch (e) {
    log(0, 'system', 'parse error', e.message || String(e));
    return;
  }

  var eventTarget = new EventTarget();

  eventTarget.addEventListener('pages-event', function(e) {
    if (thisGen !== runGeneration) return;
    var detail = e.detail;
    if (!detail) return;

    if (detail.topic === 'scenario:state') {
      var payload = detail.payload;
      var isDelaying = !payload.paused && payload.progress < 1 && payload.virtualTime !== undefined;
      if (stateEl) {
        if (payload.progress >= 1) { stateEl.textContent = 'done'; stateEl.style.color = '#4ade80'; }
        else if (payload.paused) { stateEl.textContent = 'paused'; stateEl.style.color = '#f59e0b'; }
        else if (isDelaying) { stateEl.textContent = 'delaying'; stateEl.style.color = '#f59e0b'; }
        else { stateEl.textContent = 'playing'; stateEl.style.color = '#3b82f6'; }
      }
      if (timeEl && payload.virtualTime !== undefined) timeEl.textContent = Math.round(payload.virtualTime) + 'ms';
      if (progressEl) progressEl.textContent = Math.round(payload.progress * 100) + '%';
      if (payload.error && payload.error.message) {
        log(0, 'system', 'error', payload.error.message);
      }
    }

    if (detail.topic === 'scenario:step') {
      var sp = detail.payload;
      var step = sp.step;
      var action = step ? (step.entry ? step.entry.qualifiedName : step.kind || '?') : '?';
      var target = step && step.params ? (step.params.name || '') : (step ? (step.name || step.duration || '') : '');
      var label = action + (target ? ' ' + target : '');

      if (stepEl) stepEl.textContent = label;
      if (timeEl) timeEl.textContent = sp.virtualTime + 'ms';

      if (step && step.kind === 'delay') {
        log(sp.virtualTime, sp.queue || 'main', 'delay ' + (step.duration || ''), '⏱');
      } else if (step && step.kind === 'plugin') {
        log(sp.virtualTime, sp.queue || 'main', label, '✓');
      } else {
        log(sp.virtualTime, sp.queue || 'main', label, '⏭');
      }
    }
  });

  var runner = createScheduler(scenario, {
    eventTarget: eventTarget,
    speed: 1,
    startPaused: false,
  });

  currentRunner = runner;
  runner.play();

  if (stateEl) {
    stateEl.textContent = 'playing';
    stateEl.style.color = '#3b82f6';
  }
}

if (picker) {
  picker.addEventListener('change', function() {
    if (currentRunner) { currentRunner.dispose(); currentRunner = null; }
    resetUI();
    showExample(parseInt(picker.value, 10));
  });
}

if (runBtn) {
  runBtn.addEventListener('click', function() {
    var idx = picker ? parseInt(picker.value, 10) : 0;
    runExample(idx);
  });
}

// Load scenarios from shared files
fetch('../../scenarios/manifest.json')
  .then(function(r) { return r.json(); })
  .then(function(manifest) {
    var cat = null;
    for (var i = 0; i < manifest.categories.length; i++) {
      if (manifest.categories[i].key === 'flow-control') { cat = manifest.categories[i]; break; }
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
    EXAMPLES = loaded;
    if (picker) {
      picker.innerHTML = '';
      EXAMPLES.forEach(function(ex, i) {
        var opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = ex.name;
        picker.appendChild(opt);
      });
    }
    showExample(0);
  });
