var EXAMPLES = {};
var EXAMPLE_KEYS = [];

var stateEl = document.getElementById('orch-state');
var queuesEl = document.getElementById('orch-queues');
var timeEl = document.getElementById('orch-time');
var progressEl = document.getElementById('orch-progress');
var queueStatesEl = document.getElementById('queue-states');
var eventLogEl = document.getElementById('event-log');
var yamlSourceEl = document.getElementById('yaml-source');
var examplePicker = document.getElementById('example-picker');
var runBtn = document.getElementById('run-btn');
var currentRunner = null;

var QUEUE_COLORS = { ready: '#4ade80', blocked: '#f59e0b', suspended: '#8b5cf6', done: '#6b7280' };

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

var coordStepDelay = 500;

function flashButton(name) {
  var btn = findByAriaLabel(name);
  if (!btn) return;
  btn.style.background = '#22c55e';
  btn.style.borderColor = '#22c55e';
  btn.style.color = '#000';
  setTimeout(function() {
    btn.style.background = 'var(--pages-accent-3)';
    btn.style.borderColor = 'var(--pages-accent-6)';
    btn.style.color = 'var(--pages-accent-11)';
  }, Math.max(coordStepDelay - 150, 50));
}

function formatTime(ms) {
  var s = Math.floor(ms / 1000);
  var m = Math.floor(s / 60);
  var sec = s % 60;
  var millis = ms % 1000;
  return (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec + '.' + (millis < 100 ? '0' : '') + (millis < 10 ? '0' : '') + millis;
}

function appendLog(time, queue, action, result) {
  var line = document.createElement('div');
  var queuePad = (queue + '          ').slice(0, 10);
  var actionPad = (action + '                    ').slice(0, 20);
  line.textContent = '[' + formatTime(time) + ']  ' + queuePad + actionPad + result;
  if (result.indexOf('blocked') >= 0 || result.indexOf('waiting') >= 0) {
    line.style.color = '#f59e0b';
  } else if (result.indexOf('unblocked') >= 0 || result.indexOf('released') >= 0) {
    line.style.color = '#a78bfa';
  } else {
    line.style.color = '#4ade80';
  }
  eventLogEl.appendChild(line);
  eventLogEl.scrollTop = eventLogEl.scrollHeight;
}

function updateQueueDot(queueId, state) {
  var dot = document.getElementById('qdot-' + queueId);
  if (!dot) {
    dot = document.createElement('span');
    dot.id = 'qdot-' + queueId;
    dot.style.cssText = 'display: inline-flex; align-items: center; gap: 4px;';
    queueStatesEl.appendChild(dot);
  }
  var color = QUEUE_COLORS[state] || '#6b7280';
  dot.innerHTML = '<span style="width: 8px; height: 8px; border-radius: 50%; background: ' + color + '; display: inline-block;"></span><span style="font-size: 11px; color: var(--pages-neutral-9);">' + queueId + '</span>';
}

function resetUI() {
  eventLogEl.innerHTML = '';
  queueStatesEl.innerHTML = '';
  stateEl.textContent = 'Running';
  stateEl.style.color = '#3b82f6';
  queuesEl.textContent = '—';
  timeEl.textContent = '0ms';
  if (progressEl) progressEl.textContent = '0%';
}

var descEl = document.getElementById('example-description');

function showYaml(key) {
  var example = EXAMPLES[key];
  if (example) {
    yamlSourceEl.value = example.yaml;
    if (descEl) {
      descEl.innerHTML = '';
      if (example.tags && example.tags.length > 0) {
        var tagSpan = document.createElement('span');
        tagSpan.style.cssText = 'display: inline-flex; gap: 4px; margin-right: 6px; vertical-align: middle; flex-wrap: wrap;';
        example.tags.forEach(function(t) {
          var chip = document.createElement('span');
          chip.textContent = t;
          chip.style.cssText = 'padding: 1px 6px; border-radius: 3px; background: var(--pages-accent-3); color: var(--pages-accent-9); font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px;';
          tagSpan.appendChild(chip);
        });
        descEl.appendChild(tagSpan);
      }
      descEl.appendChild(document.createTextNode(example.description));
    }
  }
}

function runExample(key) {
  if (currentRunner) {
    currentRunner.dispose();
    currentRunner = null;
  }

  var example = EXAMPLES[key];
  if (!example) return;

  resetUI();

  var et = new EventTarget();
  var catalog = casehubPages.createScenarioCatalog();
  var scenario = casehubPages.parseScenario(example.yaml, catalog);

  et.addEventListener('pages-event', function(e) {
    var detail = e.detail;
    if (detail.topic === 'scenario:step') {
      var p = detail.payload;
      var stepObj = p.step;
      var action = '';
      if (stepObj.kind === 'signal-fire') action = 'signal ' + stepObj.name;
      else if (stepObj.kind === 'await-signal') action = 'await ' + stepObj.name;
      else if (stepObj.kind === 'await-barrier') action = 'await ' + stepObj.name;
      else if (stepObj.kind === 'plugin') action = (stepObj.entry ? stepObj.entry.qualifiedName : '?') + ' ' + ((stepObj.params && stepObj.params.name) || '');
      else action = stepObj.kind || '?';
      appendLog(p.virtualTime, p.queue, action, '✓');
    }
    if (detail.topic === 'scenario:queue') {
      var qp = detail.payload;
      updateQueueDot(qp.queueId, qp.state);
      if (qp.state === 'blocked') {
        appendLog(0, qp.queueId, qp.reason || 'blocked', '→ waiting');
      } else if (qp.state === 'ready' && qp.reason) {
        appendLog(0, qp.queueId, qp.reason, '→ unblocked');
      }
    }
    if (detail.topic === 'scenario:state') {
      var sp = detail.payload;
      if (sp.virtualTime !== undefined && timeEl) timeEl.textContent = Math.round(sp.virtualTime) + 'ms';
      if (progressEl) progressEl.textContent = Math.round(sp.progress * 100) + '%';
      if (sp.progress >= 1) {
        if (stateEl) { stateEl.textContent = 'Done'; stateEl.style.color = '#4ade80'; }
      } else if (sp.paused) {
        if (stateEl) { stateEl.textContent = 'Paused'; stateEl.style.color = '#f59e0b'; }
      }
    }
  });

  var runner = casehubPages.createScheduler(scenario, {
    eventTarget: et,
    speed: 1,
    startPaused: true,
  });

  currentRunner = runner;

  var queueCount = 0;
  if (runner.outline) queueCount = runner.outline.length;
  queuesEl.textContent = queueCount > 0 ? queueCount + '' : '—';

  runner.play();
}

var coordSpeedSlider = document.getElementById('speed-slider');
var coordSpeedLabel = document.getElementById('speed-label');
if (coordSpeedSlider) {
  coordSpeedSlider.addEventListener('input', function() {
    coordStepDelay = parseInt(coordSpeedSlider.value, 10);
    if (coordSpeedLabel) coordSpeedLabel.textContent = coordStepDelay + 'ms';
  });
}

// Load scenarios from shared files
fetch('../../scenarios/manifest.json')
  .then(function(r) { return r.json(); })
  .then(function(manifest) {
    var cat = null;
    for (var i = 0; i < manifest.categories.length; i++) {
      if (manifest.categories[i].key === 'coordination') { cat = manifest.categories[i]; break; }
    }
    if (!cat) return;
    var fetches = cat.scenarios.map(function(entry) {
      return fetch('../../scenarios/' + entry.file)
        .then(function(r) { return r.text(); })
        .then(function(yamlText) {
          var slug = entry.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          return { key: slug, title: entry.title, tags: entry.tags, description: entry.description, yaml: yamlText };
        });
    });
    return Promise.all(fetches);
  })
  .then(function(loaded) {
    if (!loaded) return;
    loaded.forEach(function(ex) {
      EXAMPLES[ex.key] = ex;
      EXAMPLE_KEYS.push(ex.key);
    });
    if (examplePicker) {
      examplePicker.innerHTML = '';
      EXAMPLE_KEYS.forEach(function(key) {
        var opt = document.createElement('option');
        opt.value = key;
        opt.textContent = EXAMPLES[key].title;
        examplePicker.appendChild(opt);
      });
      showYaml(examplePicker.value);
      examplePicker.addEventListener('change', function() {
        if (currentRunner) { currentRunner.dispose(); currentRunner = null; }
        resetUI();
        showYaml(examplePicker.value);
      });
    }
    if (runBtn) {
      runBtn.addEventListener('click', function() {
        runExample(examplePicker.value);
      });
    }
  });
