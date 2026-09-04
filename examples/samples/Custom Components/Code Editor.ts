var SAMPLE_DASHBOARD = (document.getElementById('sample-yaml-data') || {}).textContent || '';
var SAMPLE_JSON = (document.getElementById('sample-json-data') || {}).textContent || '';
var SAMPLE_YAML_READONLY = (document.getElementById('sample-yaml-readonly-data') || {}).textContent || '';

var editor = document.getElementById('live-editor');
var readonlyEditor = document.getElementById('readonly-editor');
var yamlReadonly = document.getElementById('yaml-readonly');
var previewTarget = document.getElementById('preview-target');
var previewStatus = document.getElementById('preview-status');

if (editor) {
  (editor as any).value = SAMPLE_DASHBOARD;
}
if (readonlyEditor) {
  (readonlyEditor as any).value = SAMPLE_JSON;
}
if (yamlReadonly) {
  (yamlReadonly as any).value = SAMPLE_YAML_READONLY;
}

var debounceTimer = null;

function renderPreview(yamlText) {
  previewTarget.innerHTML = '';
  (window as any).casehubPages.loadSite(previewTarget, yamlText, {}).then(function(site) {
    previewStatus.textContent = '✓ Valid';
    previewStatus.style.color = 'var(--pages-success-11, #18794e)';
    var theme = (window as any).casehubPages.getTheme() || 'casehub-dark';
    site.setTheme(theme.endsWith('-dark') ? 'dark' : 'light');
    (window as any).casehubPages.applyTheme(theme, previewTarget);
  }).catch(function(e) {
    previewStatus.textContent = '✗ ' + (e.message || 'Parse error');
    previewStatus.style.color = 'var(--pages-danger-11, #cd2b31)';
  });
}

if (editor && previewTarget) {
  renderPreview(SAMPLE_DASHBOARD);

  editor.addEventListener('input', function() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function() {
      renderPreview((editor as any).value);
    }, 500);
  });
}
