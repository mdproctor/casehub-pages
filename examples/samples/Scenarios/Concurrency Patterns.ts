var CC_EXAMPLES = [
  {
    name: 'Semaphore',
    tags: ['semaphore', 'rate-limit', 'permits'],
    description: 'Rate-limited parallel workers — a semaphore with 2 permits gates 4 parallel tasks. Each worker acquires a permit before proceeding, blocking when none are available. Watch the trace to see only 2 workers active at a time.',
    yaml: [
      '- parallel:',
      '  - sem-worker: { name: "pool", permits: 2, worker: "A", duration: 400 }',
      '  - sem-worker: { name: "pool", permits: 2, worker: "B", duration: 300 }',
      '  - sem-worker: { name: "pool", permits: 2, worker: "C", duration: 500 }',
      '  - sem-worker: { name: "pool", permits: 2, worker: "D", duration: 200 }',
    ].join('\n'),
    steps: [
      { parallel: [
        { 'sem-worker': { name: 'pool', permits: 2, worker: 'A', duration: 400 } },
        { 'sem-worker': { name: 'pool', permits: 2, worker: 'B', duration: 300 } },
        { 'sem-worker': { name: 'pool', permits: 2, worker: 'C', duration: 500 } },
        { 'sem-worker': { name: 'pool', permits: 2, worker: 'D', duration: 200 } },
      ] },
    ],
  },
  {
    name: 'Channel',
    tags: ['channel', 'producer', 'consumer'],
    description: 'Producer-consumer pattern — a bounded channel with capacity 2 connects a producer that sends 4 items to a consumer that receives them. The producer blocks when the channel is full until the consumer drains it.',
    yaml: [
      '- parallel:',
      '  - chan-produce: { name: "work", capacity: 2, items: 4, interval: 200 }',
      '  - chan-consume: { name: "work", expect: 4, interval: 300 }',
    ].join('\n'),
    steps: [
      { parallel: [
        { 'chan-produce': { name: 'work', capacity: 2, items: 4, interval: 200 } },
        { 'chan-consume': { name: 'work', expect: 4, interval: 300 } },
      ] },
    ],
  },
  {
    name: 'Concurrent Map',
    tags: ['orc-map', 'atomic', 'concurrent'],
    description: 'Concurrent map with atomic operations — parallel workers write to a shared map using put, putIfAbsent, merge, and computeIfAbsent. Each operation is atomic, preventing data races.',
    yaml: [
      '- parallel:',
      '  - map-writer: { name: "registry", op: "put", key: "svc-a", value: "running" }',
      '  - map-writer: { name: "registry", op: "put", key: "svc-b", value: "starting" }',
      '  - map-writer: { name: "registry", op: "putIfAbsent", key: "svc-a", value: "duplicate" }',
      '  - map-writer: { name: "registry", op: "merge", key: "svc-b", value: "running" }',
      '- map-reader: { name: "registry" }',
    ].join('\n'),
    steps: [
      { parallel: [
        { 'map-writer': { name: 'registry', op: 'put', key: 'svc-a', value: 'running' } },
        { 'map-writer': { name: 'registry', op: 'put', key: 'svc-b', value: 'starting' } },
        { 'map-writer': { name: 'registry', op: 'putIfAbsent', key: 'svc-a', value: 'duplicate' } },
        { 'map-writer': { name: 'registry', op: 'merge', key: 'svc-b', value: 'running' } },
      ] },
      { 'map-reader': { name: 'registry' } },
    ],
  },
  {
    name: 'Spawned Task',
    tags: ['spawn', 'background', 'async'],
    description: 'Background task lifecycle — spawn a long-running task, do other work in the foreground, then join the background task. Shows isDone/isFailed polling and join with timeout.',
    yaml: [
      '- spawn-task: { name: "indexer", duration: 800 }',
      '- task-poll: { name: "indexer" }',
      '- log: { message: "Foreground work while indexer runs" }',
      '- task-poll: { name: "indexer" }',
      '- task-join: { name: "indexer", timeout: 2000 }',
      '- task-poll: { name: "indexer" }',
    ].join('\n'),
    steps: [
      { 'spawn-task': { name: 'indexer', duration: 800 } },
      { 'task-poll': { name: 'indexer' } },
      { log: { message: 'Foreground work while indexer runs' } },
      { 'task-poll': { name: 'indexer' } },
      { 'task-join': { name: 'indexer', timeout: 2000 } },
      { 'task-poll': { name: 'indexer' } },
    ],
  },
  {
    name: 'Correlation Scope',
    tags: ['correlation', 'request-reply', 'async'],
    description: 'Async request/response correlation — register expected responses by key on a channel, send messages to the channel, then await correlated responses. The scope routes incoming messages by extracted key.',
    yaml: [
      'steps:',
      '  - corr-expect: { id: "order-42", timeout: 1000 }',
      '  - corr-expect: { id: "order-99", timeout: 1000 }',
      '  - log: { message: "Expectations registered" }',
      '  - corr-send: { orderId: "order-99", status: "shipped" }',
      '  - corr-send: { orderId: "order-42", status: "confirmed" }',
      '  - corr-await: { id: "order-42" }',
      '  - corr-await: { id: "order-99" }',
    ].join('\n'),
    steps: [
      { 'corr-expect': { id: 'order-42', timeout: 1000 } },
      { 'corr-expect': { id: 'order-99', timeout: 1000 } },
      { log: { message: 'Expectations registered' } },
      { 'corr-send': { orderId: 'order-99', status: 'shipped' } },
      { 'corr-send': { orderId: 'order-42', status: 'confirmed' } },
      { 'corr-await': { id: 'order-42' } },
      { 'corr-await': { id: 'order-99' } },
    ],
  },
  {
    name: 'Deadline Context',
    tags: ['deadline', 'timeout', 'cancellation'],
    description: 'Scoped deadline with cancellation — create a child scope with a deadline, run steps within it, and observe deadline expiry. The deadline fires a callback and marks remaining time as expired.',
    yaml: [
      'steps:',
      '  - deadline-create: { name: "batch", deadlineMs: 600 }',
      '  - deadline-check: { name: "batch" }',
      '  - deadline-work: { name: "batch", duration: 300, label: "phase-1" }',
      '  - deadline-check: { name: "batch" }',
      '  - deadline-work: { name: "batch", duration: 400, label: "phase-2" }',
      '  - deadline-check: { name: "batch" }',
    ].join('\n'),
    steps: [
      { 'deadline-create': { name: 'batch', deadlineMs: 600 } },
      { 'deadline-check': { name: 'batch' } },
      { 'deadline-work': { name: 'batch', duration: 300, label: 'phase-1' } },
      { 'deadline-check': { name: 'batch' } },
      { 'deadline-work': { name: 'batch', duration: 400, label: 'phase-2' } },
      { 'deadline-check': { name: 'batch' } },
    ],
  },
  {
    name: 'Combined Pipeline',
    tags: ['combined', 'pipeline', 'multi-primitive'],
    description: 'Rate-limited pipeline with deadline — composes semaphore, channel, spawned task, concurrent map, and deadline into a single workflow. A producer feeds items through a bounded channel, rate-limited workers process them under a semaphore gate, results accumulate in a concurrent map, and a deadline scopes the entire pipeline.',
    yaml: [
      'steps:',
      '  - deadline-create: { name: "pipeline", deadlineMs: 3000 }',
      '  - spawn-task: { name: "monitor", duration: 2500 }',
      '  - deadline-check: { name: "pipeline" }',
      '  - parallel:',
      '    - chan-produce: { name: "jobs", capacity: 2, items: 4, interval: 150 }',
      '    - pipeline-consume:',
      '        channel: jobs',
      '        semaphore: gate',
      '        permits: 2',
      '        map: results',
      '        expect: 4',
      '        processingMs: 300',
      '  - map-reader: { name: "results" }',
      '  - deadline-check: { name: "pipeline" }',
      '  - task-join: { name: "monitor", timeout: 2000 }',
      '  - task-poll: { name: "monitor" }',
    ].join('\n'),
    steps: [
      { 'deadline-create': { name: 'pipeline', deadlineMs: 3000 } },
      { 'spawn-task': { name: 'monitor', duration: 2500 } },
      { 'deadline-check': { name: 'pipeline' } },
      { parallel: [
        { 'chan-produce': { name: 'jobs', capacity: 2, items: 4, interval: 150 } },
        { 'pipeline-consume': { channel: 'jobs', semaphore: 'gate', permits: 2, map: 'results', expect: 4, processingMs: 300 } },
      ] },
      { 'map-reader': { name: 'results' } },
      { 'deadline-check': { name: 'pipeline' } },
      { 'task-join': { name: 'monitor', timeout: 2000 } },
      { 'task-poll': { name: 'monitor' } },
    ],
  },
];

var ccTraceEl = document.getElementById('cc-trace');
var ccStateEl = document.getElementById('cc-state');
var ccResultEl = document.getElementById('cc-result');
var ccCountEl = document.getElementById('cc-count');
var ccOutputEl = document.getElementById('cc-output');
var ccYamlEl = document.getElementById('cc-yaml-source');
var ccDescEl = document.getElementById('cc-description');
var ccPicker = document.getElementById('cc-example-picker');
var ccRunBtn = document.getElementById('cc-run-btn');
var ccStepCount = 0;

function ccTrace(msg, status) {
  if (!ccTraceEl) return;
  var line = document.createElement('div');
  line.textContent = '[' + String(ccStepCount).padStart(2, '0') + ']  ' + msg.padEnd(48) + status;
  line.style.color = status === '✓' ? '#4ade80' : status === '✗' ? '#ef4444' : '#f59e0b';
  ccTraceEl.appendChild(line);
  ccTraceEl.scrollTop = ccTraceEl.scrollHeight;
}

function ccResetUI() {
  if (ccTraceEl) ccTraceEl.innerHTML = '';
  if (ccOutputEl) ccOutputEl.innerHTML = '<div style="color: var(--pages-neutral-7);">Run an example to see output</div>';
  if (ccStateEl) { ccStateEl.textContent = 'idle'; ccStateEl.style.color = '#4ade80'; }
  if (ccResultEl) { ccResultEl.textContent = '—'; ccResultEl.style.color = '#3b82f6'; }
  ccStepCount = 0;
  if (ccCountEl) ccCountEl.textContent = '0';
}

function ccShowExample(idx) {
  var ex = CC_EXAMPLES[idx];
  if (!ex) return;
  if (ccYamlEl) ccYamlEl.value = ex.yaml;
  if (ccDescEl) {
    ccDescEl.innerHTML = '';
    if (ex.tags && ex.tags.length > 0) {
      var tagSpan = document.createElement('span');
      tagSpan.style.cssText = 'display: inline-flex; gap: 4px; margin-right: 6px; vertical-align: middle;';
      ex.tags.forEach(function(t) {
        var chip = document.createElement('span');
        chip.textContent = t;
        chip.style.cssText = 'padding: 1px 6px; border-radius: 3px; background: var(--pages-accent-3); color: var(--pages-accent-9); font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px;';
        tagSpan.appendChild(chip);
      });
      ccDescEl.appendChild(tagSpan);
    }
    ccDescEl.appendChild(document.createTextNode(ex.description));
  }
}

function ccDelay(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

async function ccRunExample(idx) {
  ccResetUI();
  var ex = CC_EXAMPLES[idx];
  if (!ex) return;

  if (ccStateEl) { ccStateEl.textContent = 'running'; ccStateEl.style.color = '#3b82f6'; }

  var cp = window.casehubPages;
  if (!cp || !cp.createStepRunner) {
    ccTrace('createStepRunner not available in bundle', '✗');
    if (ccStateEl) { ccStateEl.textContent = 'error'; ccStateEl.style.color = '#ef4444'; }
    return;
  }

  var outputs = [];
  var spawnedTasks = {};
  var deadlineScopes = {};
  var corrChannel = null;
  var corrScope = null;

  var runner = cp.createStepRunner([
    {
      name: 'log',
      inputs: { message: { type: 'STRING', required: true } },
      execute: async function(params) {
        ccStepCount++;
        if (ccCountEl) ccCountEl.textContent = String(ccStepCount);
        var msg = params.message || '?';
        outputs.push(msg);
        ccTrace(msg, '✓');
        await ccDelay(200);
        return runner.stepSuccess({ logged: msg });
      }
    },
    {
      name: 'sem-worker',
      inputs: { name: { type: 'STRING', required: true }, permits: { type: 'NUMBER', required: true }, worker: { type: 'STRING', required: true }, duration: { type: 'NUMBER', required: true } },
      execute: async function(params) {
        ccStepCount++;
        if (ccCountEl) ccCountEl.textContent = String(ccStepCount);
        var sem = runner.scope.semaphore(params.name, params.permits);
        var avail = sem.availablePermits();
        ccTrace('worker-' + params.worker + ' waiting (permits=' + avail + ')', '⚠');
        await sem.acquire();
        ccTrace('worker-' + params.worker + ' acquired permit', '✓');
        outputs.push('worker-' + params.worker + ' acquired');
        await ccDelay(params.duration);
        sem.release();
        var msg = 'worker-' + params.worker + ' done (released permit)';
        outputs.push(msg);
        ccTrace(msg, '✓');
        return runner.stepSuccess({ worker: params.worker, duration: params.duration });
      }
    },
    {
      name: 'chan-produce',
      inputs: { name: { type: 'STRING', required: true }, capacity: { type: 'NUMBER', required: true }, items: { type: 'NUMBER', required: true }, interval: { type: 'NUMBER', required: true } },
      execute: async function(params) {
        ccStepCount++;
        if (ccCountEl) ccCountEl.textContent = String(ccStepCount);
        var ch = runner.scope.channel(params.name, params.capacity);
        for (var i = 0; i < params.items; i++) {
          var item = 'item-' + (i + 1);
          ccTrace('produce → ' + item, '⚠');
          await ch.send(item);
          ccTrace('produce: sent ' + item, '✓');
          outputs.push('produced: ' + item);
          await ccDelay(params.interval);
        }
        ch.close();
        ccTrace('produce: channel closed', '✓');
        outputs.push('producer done');
        return runner.stepSuccess({ produced: params.items });
      }
    },
    {
      name: 'chan-consume',
      inputs: { name: { type: 'STRING', required: true }, expect: { type: 'NUMBER', required: true }, interval: { type: 'NUMBER', required: true } },
      execute: async function(params) {
        ccStepCount++;
        if (ccCountEl) ccCountEl.textContent = String(ccStepCount);
        var ch = runner.scope.channel(params.name, 2);
        var received = [];
        for (var i = 0; i < params.expect; i++) {
          try {
            var item = await ch.receive(2000);
            if (item === undefined) break;
            received.push(item);
            ccTrace('consume ← ' + item, '✓');
            outputs.push('consumed: ' + item);
            await ccDelay(params.interval);
          } catch (e) {
            break;
          }
        }
        ccTrace('consume: received ' + received.length + ' items', '✓');
        outputs.push('consumer done: ' + received.length + ' items');
        return runner.stepSuccess({ received: received });
      }
    },
    {
      name: 'map-writer',
      inputs: { name: { type: 'STRING', required: true }, op: { type: 'STRING', required: true }, key: { type: 'STRING', required: true }, value: { type: 'STRING', required: true } },
      execute: async function(params) {
        ccStepCount++;
        if (ccCountEl) ccCountEl.textContent = String(ccStepCount);
        var m = runner.scope.map(params.name);
        var result;
        if (params.op === 'put') {
          var prev = m.put(params.key, params.value);
          result = 'put(' + params.key + ', ' + params.value + ') prev=' + (prev || 'none');
        } else if (params.op === 'putIfAbsent') {
          var existing = m.putIfAbsent(params.key, params.value);
          result = 'putIfAbsent(' + params.key + ', ' + params.value + ') → ' + (existing ? 'exists: ' + existing : 'inserted');
        } else if (params.op === 'merge') {
          m.merge(params.key, params.value, function(old, nw) { return nw; });
          result = 'merge(' + params.key + ', ' + params.value + ') → ' + params.value;
        } else {
          var val = m.computeIfAbsent(params.key, function() { return params.value; });
          result = 'computeIfAbsent(' + params.key + ') → ' + val;
        }
        outputs.push(result);
        ccTrace(result, '✓');
        await ccDelay(200);
        return runner.stepSuccess({ op: params.op, key: params.key });
      }
    },
    {
      name: 'map-reader',
      inputs: { name: { type: 'STRING', required: true } },
      execute: async function(params) {
        ccStepCount++;
        if (ccCountEl) ccCountEl.textContent = String(ccStepCount);
        var m = runner.scope.map(params.name);
        var entries = [];
        var allKeys = ['svc-a', 'svc-b', 'svc-c'];
        allKeys.forEach(function(k) {
          var v = m.get(k);
          if (v !== undefined) entries.push(k + '=' + v);
        });
        var msg = 'map(' + params.name + ') size=' + m.size() + ' {' + entries.join(', ') + '}';
        outputs.push(msg);
        ccTrace(msg, '✓');
        return runner.stepSuccess({ size: m.size() });
      }
    },
    {
      name: 'spawn-task',
      inputs: { name: { type: 'STRING', required: true }, duration: { type: 'NUMBER', required: true } },
      execute: async function(params) {
        ccStepCount++;
        if (ccCountEl) ccCountEl.textContent = String(ccStepCount);
        var task = runner.scope.spawn(params.name, async function() {
          await ccDelay(params.duration);
        });
        spawnedTasks[params.name] = task;
        var msg = 'spawned(' + params.name + ') duration=' + params.duration + 'ms';
        outputs.push(msg);
        ccTrace(msg, '✓');
        await ccDelay(100);
        return runner.stepSuccess({ spawned: params.name });
      }
    },
    {
      name: 'task-poll',
      inputs: { name: { type: 'STRING', required: true } },
      execute: async function(params) {
        ccStepCount++;
        if (ccCountEl) ccCountEl.textContent = String(ccStepCount);
        var task = spawnedTasks[params.name];
        if (!task) {
          ccTrace('task(' + params.name + ') not found', '✗');
          return runner.stepFailure('task not found');
        }
        var done = task.isDone();
        var failed = task.isFailed();
        var msg = 'task(' + params.name + ') done=' + done + ' failed=' + failed;
        outputs.push(msg);
        ccTrace(msg, done ? '✓' : '⚠');
        await ccDelay(100);
        return runner.stepSuccess({ done: done, failed: failed });
      }
    },
    {
      name: 'task-join',
      inputs: { name: { type: 'STRING', required: true }, timeout: { type: 'NUMBER', required: true } },
      execute: async function(params) {
        ccStepCount++;
        if (ccCountEl) ccCountEl.textContent = String(ccStepCount);
        var task = spawnedTasks[params.name];
        if (!task) {
          ccTrace('task(' + params.name + ') not found', '✗');
          return runner.stepFailure('task not found');
        }
        ccTrace('joining task(' + params.name + ') timeout=' + params.timeout + 'ms', '⚠');
        var completed = await task.joinWithTimeout(params.timeout);
        var msg = 'task(' + params.name + ') join → ' + (completed ? 'completed' : 'timed out');
        outputs.push(msg);
        ccTrace(msg, completed ? '✓' : '✗');
        return runner.stepSuccess({ completed: completed });
      }
    },
    {
      name: 'corr-expect',
      inputs: { id: { type: 'STRING', required: true }, timeout: { type: 'NUMBER', required: true } },
      execute: async function(params) {
        ccStepCount++;
        if (ccCountEl) ccCountEl.textContent = String(ccStepCount);
        if (!corrChannel) {
          corrChannel = new cp.DefaultOrcChannel();
          corrScope = new cp.DefaultCorrelationScope(corrChannel, function(item) { return item.orderId; });
        }
        corrScope.expectResponse(params.id, params.timeout);
        var msg = 'expect(' + params.id + ') timeout=' + params.timeout + 'ms';
        outputs.push(msg);
        ccTrace(msg, '✓');
        await ccDelay(100);
        return runner.stepSuccess({ id: params.id });
      }
    },
    {
      name: 'corr-send',
      inputs: { orderId: { type: 'STRING', required: true }, status: { type: 'STRING', required: true } },
      execute: async function(params) {
        ccStepCount++;
        if (ccCountEl) ccCountEl.textContent = String(ccStepCount);
        if (!corrChannel) {
          ccTrace('no correlation channel', '✗');
          return runner.stepFailure('no channel');
        }
        await corrChannel.send({ orderId: params.orderId, status: params.status });
        var msg = 'send(orderId=' + params.orderId + ', status=' + params.status + ')';
        outputs.push(msg);
        ccTrace(msg, '✓');
        await ccDelay(100);
        return runner.stepSuccess({ orderId: params.orderId });
      }
    },
    {
      name: 'corr-await',
      inputs: { id: { type: 'STRING', required: true } },
      execute: async function(params) {
        ccStepCount++;
        if (ccCountEl) ccCountEl.textContent = String(ccStepCount);
        if (!corrScope) {
          ccTrace('no correlation scope', '✗');
          return runner.stepFailure('no scope');
        }
        try {
          var item = await corrScope.awaitResponse(params.id);
          var msg = 'await(' + params.id + ') → orderId=' + item.orderId + ' status=' + item.status;
          outputs.push(msg);
          ccTrace(msg, '✓');
          return runner.stepSuccess({ item: item });
        } catch (e) {
          var errMsg = 'await(' + params.id + ') → ' + e.message;
          outputs.push(errMsg);
          ccTrace(errMsg, '✗');
          return runner.stepFailure(e.message);
        }
      }
    },
    {
      name: 'deadline-create',
      inputs: { name: { type: 'STRING', required: true }, deadlineMs: { type: 'NUMBER', required: true } },
      execute: async function(params) {
        ccStepCount++;
        if (ccCountEl) ccCountEl.textContent = String(ccStepCount);
        var fired = false;
        var childScope = runner.scope.withDeadline(params.deadlineMs, function() {
          fired = true;
          ccTrace('⏰ deadline(' + params.name + ') EXPIRED', '✗');
          outputs.push('deadline(' + params.name + ') expired');
        });
        deadlineScopes[params.name] = childScope;
        var msg = 'deadline(' + params.name + ') created: ' + params.deadlineMs + 'ms';
        outputs.push(msg);
        ccTrace(msg, '✓');
        await ccDelay(50);
        return runner.stepSuccess({ name: params.name, deadlineMs: params.deadlineMs });
      }
    },
    {
      name: 'deadline-check',
      inputs: { name: { type: 'STRING', required: true } },
      execute: async function(params) {
        ccStepCount++;
        if (ccCountEl) ccCountEl.textContent = String(ccStepCount);
        var scope = deadlineScopes[params.name];
        if (!scope) {
          ccTrace('deadline(' + params.name + ') not found', '✗');
          return runner.stepFailure('not found');
        }
        var expired = scope.isDeadlineExpired();
        var remaining = scope.remainingTime();
        var msg = 'deadline(' + params.name + ') expired=' + expired + ' remaining=' + (remaining !== undefined ? remaining + 'ms' : 'none');
        outputs.push(msg);
        ccTrace(msg, expired ? '✗' : '✓');
        return runner.stepSuccess({ expired: expired, remaining: remaining });
      }
    },
    {
      name: 'deadline-work',
      inputs: { name: { type: 'STRING', required: true }, duration: { type: 'NUMBER', required: true }, label: { type: 'STRING', required: true } },
      execute: async function(params) {
        ccStepCount++;
        if (ccCountEl) ccCountEl.textContent = String(ccStepCount);
        var scope = deadlineScopes[params.name];
        if (!scope) {
          ccTrace('deadline(' + params.name + ') not found', '✗');
          return runner.stepFailure('not found');
        }
        ccTrace(params.label + ': working ' + params.duration + 'ms', '⚠');
        await ccDelay(params.duration);
        var expired = scope.isDeadlineExpired();
        var msg = params.label + ' done (deadline ' + (expired ? 'EXPIRED' : 'ok') + ')';
        outputs.push(msg);
        ccTrace(msg, expired ? '⚠' : '✓');
        return runner.stepSuccess({ label: params.label, expired: expired });
      }
    },
    {
      name: 'pipeline-consume',
      inputs: { channel: { type: 'STRING', required: true }, semaphore: { type: 'STRING', required: true }, permits: { type: 'NUMBER', required: true }, map: { type: 'STRING', required: true }, expect: { type: 'NUMBER', required: true }, processingMs: { type: 'NUMBER', required: true } },
      execute: async function(params) {
        ccStepCount++;
        if (ccCountEl) ccCountEl.textContent = String(ccStepCount);
        var ch = runner.scope.channel(params.channel, 2);
        var sem = runner.scope.semaphore(params.semaphore, params.permits);
        var m = runner.scope.map(params.map);
        var processed = 0;
        for (var i = 0; i < params.expect; i++) {
          try {
            var item = await ch.receive(3000);
            if (item === undefined) break;
            ccTrace('pipeline ← ' + item, '⚠');
            var avail = sem.availablePermits();
            ccTrace('gate: waiting (permits=' + avail + ')', '⚠');
            await sem.acquire();
            ccTrace('gate: acquired → processing ' + item, '✓');
            outputs.push('processing: ' + item);
            await ccDelay(params.processingMs);
            m.put(item, 'done');
            sem.release();
            processed++;
            var msg = item + ' → done (released permit)';
            outputs.push(msg);
            ccTrace(msg, '✓');
          } catch (e) {
            ccTrace('pipeline error: ' + e.message, '✗');
            break;
          }
        }
        ccTrace('pipeline: processed ' + processed + '/' + params.expect + ' items', '✓');
        outputs.push('pipeline complete: ' + processed + ' items');
        return runner.stepSuccess({ processed: processed });
      }
    },
  ]);

  try {
    corrChannel = null;
    corrScope = null;
    var results = await runner.run(ex.steps);

    for (var i = 0; i < results.length; i++) {
      if (results[i].kind === 'failure') {
        ccTrace('Step failed: ' + results[i].message, '⚠');
      }
    }

    if (ccOutputEl) {
      ccOutputEl.innerHTML = '';
      outputs.forEach(function(o) {
        var div = document.createElement('div');
        div.textContent = '→ ' + o;
        div.style.color = 'var(--pages-neutral-10)';
        ccOutputEl.appendChild(div);
      });
    }

    if (ccStateEl) { ccStateEl.textContent = 'done'; ccStateEl.style.color = '#4ade80'; }
    if (ccResultEl) { ccResultEl.textContent = 'success'; ccResultEl.style.color = '#4ade80'; }
  } catch (err) {
    ccTrace('Error: ' + (err.message || err), '✗');
    if (ccStateEl) { ccStateEl.textContent = 'error'; ccStateEl.style.color = '#ef4444'; }
    if (ccResultEl) { ccResultEl.textContent = 'error'; ccResultEl.style.color = '#ef4444'; }
  }

  if (corrScope) {
    try { corrScope.close(); } catch (e) { /* ignore */ }
  }
  if (corrChannel) {
    try { corrChannel.close(); } catch (e) { /* ignore */ }
  }
  for (var dn in deadlineScopes) {
    try { deadlineScopes[dn].close(); } catch (e) { /* ignore */ }
  }
}

if (ccPicker) {
  ccPicker.addEventListener('change', function() {
    ccResetUI();
    ccShowExample(parseInt(ccPicker.value, 10));
  });
}

if (ccRunBtn) {
  ccRunBtn.addEventListener('click', function() {
    ccRunExample(ccPicker ? parseInt(ccPicker.value, 10) : 0);
  });
}

ccShowExample(0);
