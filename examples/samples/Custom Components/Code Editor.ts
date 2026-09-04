const SAMPLE_DASHBOARD = `pages:
- name: index
  rows:
  - columns:
    - span: 4
      components:
      - type: metric
        properties:
          text: Revenue
          value: "\$48,200"
    - span: 4
      components:
      - type: metric
        properties:
          text: Orders
          value: "1,247"
    - span: 4
      components:
      - type: metric
        properties:
          text: Customers
          value: "892"
  - columns:
    - span: 8
      components:
      - type: bar-chart
        properties:
          chart:
            title: Monthly Sales
          lookup:
            uuid: sales
            group:
            - columnGroup:
                source: Month
              functions:
              - source: Month
              - source: Revenue
              - source: Orders
    - span: 4
      components:
      - type: pie-chart
        properties:
          chart:
            title: Sales by Region
          lookup:
            uuid: regions
            group:
            - columnGroup:
                source: Region
              functions:
              - source: Region
              - source: Revenue
datasets:
- uuid: sales
  content: >-
    [
      ["Jan", 4200, 120],
      ["Feb", 3800, 105],
      ["Mar", 5100, 145],
      ["Apr", 4700, 132],
      ["May", 5500, 158],
      ["Jun", 6200, 175]
    ]
  columns:
  - id: Month
    type: LABEL
  - id: Revenue
    type: NUMBER
  - id: Orders
    type: NUMBER
- uuid: regions
  content: >-
    [
      ["North", 15200],
      ["South", 12400],
      ["East", 10800],
      ["West", 9800]
    ]
  columns:
  - id: Region
    type: LABEL
  - id: Revenue
    type: NUMBER`;

const SAMPLE_JSON = JSON.stringify({
  component: "pages-code-editor",
  version: "0.1.0",
  features: {
    languages: ["yaml", "json"],
    modes: ["editable", "readonly"],
    theming: "pages design tokens",
    accessibility: "CodeMirror 6 built-in ARIA",
    future: "LSP integration via extensions property"
  },
  codemirror: "^6.x"
}, null, 2);

const SAMPLE_YAML_READONLY = `# Component Configuration
pages-code-editor:
  properties:
    value: string        # document content
    language: yaml|json  # syntax highlighting
    readonly: boolean    # read-only mode
    line-numbers: boolean # show line numbers
    tab-size: number     # spaces per tab
    label: string        # accessible label
    extensions: Extension[] # CodeMirror plugins
  events:
    input: "fires on every change"
    change: "fires on blur after edit"`;

const editor = document.getElementById('live-editor') as any;
const readonlyEditor = document.getElementById('readonly-editor') as any;
const yamlReadonly = document.getElementById('yaml-readonly') as any;
const previewTarget = document.getElementById('preview-target') as HTMLElement;
const previewStatus = document.getElementById('preview-status') as HTMLElement;

if (editor) {
  editor.value = SAMPLE_DASHBOARD;
}
if (readonlyEditor) {
  readonlyEditor.value = SAMPLE_JSON;
}
if (yamlReadonly) {
  yamlReadonly.value = SAMPLE_YAML_READONLY;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function renderPreview(yamlText: string) {
  try {
    previewTarget.innerHTML = '';
    (window as any).casehubPages.loadSite(previewTarget, yamlText, {});
    previewStatus.textContent = '✓ Valid';
    previewStatus.style.color = 'var(--pages-success-11, #18794e)';
  } catch (e: any) {
    previewStatus.textContent = '✗ ' + (e.message || 'Parse error');
    previewStatus.style.color = 'var(--pages-danger-11, #cd2b31)';
  }
}

if (editor && previewTarget) {
  renderPreview(SAMPLE_DASHBOARD);

  editor.addEventListener('input', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      renderPreview(editor.value);
    }, 500);
  });
}
