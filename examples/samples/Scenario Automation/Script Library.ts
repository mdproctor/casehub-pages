// Uses the real <pages-library-view> component from @casehubio/pages-aria.
// The component renders search, label filters, readiness probes, and Run buttons.
// Scripts are passed via the scripts property — no server needed.

function ariaFill(name, value) {
  var el = document.querySelector('[aria-label="' + name + '"]');
  if (!el) return;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
function ariaSelect(name, value) {
  var el = document.querySelector('select[aria-label="' + name + '"]');
  if (!el) return;
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
function ariaClick(name) {
  var el = document.querySelector('[aria-label="' + name + '"]');
  if (el) el.click();
}

var SCRIPTS = [
  {
    name: 'file-access-ticket',
    description: 'File an access request ticket for a new team member',
    labels: ['domain:helpdesk', 'capability:access'],
    tags: ['onboarding'],
    provenance: 'BUNDLED',
    params: [], calls: [],
    firstStepTargets: [{ role: 'textbox', name: 'Subject' }],
    _steps: [
      { action: 'fill', target: 'Subject', value: 'New hire access request — Dev environment' },
      { action: 'select', target: 'Priority', value: 'medium' },
      { action: 'fill', target: 'Description', value: 'Please grant Dev environment access for the new team member.' },
      { action: 'select', target: 'Category', value: 'access' },
      { action: 'click', target: 'Create Ticket' },
    ],
  },
  {
    name: 'report-hardware-issue',
    description: 'Log a hardware malfunction ticket with high priority',
    labels: ['domain:helpdesk', 'capability:hardware'],
    tags: ['incident'],
    provenance: 'BUNDLED',
    params: [], calls: [],
    firstStepTargets: [{ role: 'textbox', name: 'Subject' }],
    _steps: [
      { action: 'fill', target: 'Subject', value: 'Monitor flickering — Desk 4B' },
      { action: 'select', target: 'Priority', value: 'high' },
      { action: 'fill', target: 'Description', value: 'External monitor flickering intermittently. Display cable and power already checked.' },
      { action: 'select', target: 'Category', value: 'hardware' },
      { action: 'click', target: 'Create Ticket' },
    ],
  },
  {
    name: 'software-install-request',
    description: 'Request a licensed software installation',
    labels: ['domain:helpdesk', 'capability:software'],
    tags: ['request'],
    provenance: 'UPLOADED',
    params: [], calls: [],
    firstStepTargets: [{ role: 'textbox', name: 'Subject' }],
    _steps: [
      { action: 'fill', target: 'Subject', value: 'Install IntelliJ IDEA Ultimate — Engineering' },
      { action: 'select', target: 'Priority', value: 'low' },
      { action: 'fill', target: 'Description', value: 'Need IntelliJ IDEA Ultimate license on workstation ENG-042.' },
      { action: 'select', target: 'Category', value: 'software' },
      { action: 'click', target: 'Create Ticket' },
    ],
  },
  {
    name: 'critical-outage',
    description: 'File a critical P0 network outage ticket',
    labels: ['domain:helpdesk', 'capability:network'],
    tags: ['incident', 'critical'],
    provenance: 'BUNDLED',
    params: [], calls: [],
    firstStepTargets: [{ role: 'textbox', name: 'Subject' }],
    _steps: [
      { action: 'fill', target: 'Subject', value: 'OUTAGE: Building 3 network down' },
      { action: 'select', target: 'Priority', value: 'critical' },
      { action: 'fill', target: 'Description', value: 'Complete network outage in Building 3. ~200 users impacted.' },
      { action: 'select', target: 'Category', value: 'network' },
      { action: 'click', target: 'Create Ticket' },
    ],
  },
  {
    name: 'new-account-setup',
    description: 'Set up accounts for a new employee across all systems',
    labels: ['domain:helpdesk', 'capability:access'],
    tags: ['onboarding', 'getting-started'],
    provenance: 'BUNDLED',
    params: [], calls: [],
    firstStepTargets: [{ role: 'textbox', name: 'Subject' }],
    _steps: [
      { action: 'fill', target: 'Subject', value: 'New employee account setup — Morgan Taylor' },
      { action: 'select', target: 'Priority', value: 'medium' },
      { action: 'fill', target: 'Description', value: 'New engineer starting Monday. Need email, Slack, GitHub, JIRA, VPN, badge.' },
      { action: 'select', target: 'Category', value: 'account' },
      { action: 'click', target: 'Create Ticket' },
    ],
  },
];

var stepsByName = {};
SCRIPTS.forEach(function(s) { stepsByName[s.name] = s._steps; });

function clearForm() {
  var form = document.getElementById('ticket-form');
  if (form) {
    form.querySelectorAll('input, textarea').forEach(function(el) { el.value = ''; });
    form.querySelectorAll('select').forEach(function(el) { el.value = ''; });
  }
  var badge = document.getElementById('ticket-badge');
  if (badge) badge.style.display = 'none';
}

function showTicketCreated() {
  var badge = document.getElementById('ticket-badge');
  if (badge) {
    badge.style.display = 'inline';
    badge.textContent = 'Created';
    badge.style.background = 'rgba(22, 163, 74, 0.2)';
    badge.style.color = '#4ade80';
  }
  var open = document.getElementById('metric-open');
  if (open) open.textContent = '' + (parseInt(open.textContent || '12') + 1);
}

async function runSteps(steps, delayMs) {
  var badge = document.getElementById('ticket-badge');
  if (badge) { badge.style.display = 'inline'; badge.textContent = 'Running...'; badge.style.background = 'rgba(59, 130, 246, 0.2)'; badge.style.color = '#93c5fd'; }
  for (var j = 0; j < steps.length; j++) {
    await new Promise(function(r) { setTimeout(r, delayMs); });
    var step = steps[j];
    if (step.action === 'fill') ariaFill(step.target, step.value || '');
    else if (step.action === 'select') ariaSelect(step.target, step.value || '');
    else if (step.action === 'click') ariaClick(step.target);
  }
  showTicketCreated();
}

// Mock fetch for standalone demo — intercepts upload/meta calls
var _origFetch = window.fetch;
window.fetch = function(url, opts) {
  var urlStr = typeof url === 'string' ? url : url.toString();
  if (opts && opts.method === 'POST' && urlStr.includes('/scenario/library')) {
    var yaml = opts.body || '';
    var nameMatch = yaml.match(/scenario:\s*(.+)/);
    var descMatch = yaml.match(/description:\s*"?([^"\n]+)"?/);
    var labelsMatch = yaml.match(/labels:\s*\n((?:\s+-\s+.+\n?)*)/);
    var tagsMatch = yaml.match(/tags:\s*\n((?:\s+-\s+.+\n?)*)/);
    var newScript = {
      name: nameMatch ? nameMatch[1].trim() : 'uploaded-' + Date.now(),
      description: descMatch ? descMatch[1].trim() : undefined,
      labels: labelsMatch ? labelsMatch[1].match(/- (.+)/g).map(function(m) { return m.replace(/^- /, '').trim(); }) : [],
      tags: tagsMatch ? tagsMatch[1].match(/- (.+)/g).map(function(m) { return m.replace(/^- /, '').trim(); }) : [],
      params: [], calls: [], provenance: 'UPLOADED', firstStepTargets: [],
    };
    SCRIPTS.push(newScript);
    if (libraryView) libraryView.scripts = SCRIPTS.slice();
    return Promise.resolve({ ok: true, json: function() { return Promise.resolve(newScript); } });
  }
  if (opts && opts.method === 'PUT' && urlStr.includes('/meta')) {
    var parts = urlStr.split('/');
    var scriptName = parts[parts.length - 2];
    var meta = JSON.parse(opts.body || '{}');
    var target = SCRIPTS.find(function(s) { return s.name === scriptName; });
    if (target) {
      if (meta.description !== undefined) target.description = meta.description;
      if (meta.labels) target.labels = meta.labels;
      if (meta.tags) target.tags = meta.tags;
      if (libraryView) libraryView.scripts = SCRIPTS.slice();
    }
    return Promise.resolve({ ok: true, json: function() { return Promise.resolve(target || {}); } });
  }
  return _origFetch.apply(window, arguments);
};

// Wire up the real <pages-library-view> component
var libraryView = document.getElementById('library-view');
if (libraryView) {
  libraryView.scripts = SCRIPTS;
  libraryView.addEventListener('script-selected', async function(e) {
    var name = e.detail.name;
    var steps = stepsByName[name];
    if (!steps) return;
    clearForm();
    await runSteps(steps, 350);
  });
}

var createBtn = document.querySelector('[aria-label="Create Ticket"]');
if (createBtn) createBtn.addEventListener('click', showTicketCreated);
var clearFormBtn = document.querySelector('[aria-label="Clear"]');
if (clearFormBtn) clearFormBtn.addEventListener('click', clearForm);
