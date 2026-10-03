const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const scenariosDir = path.join(__dirname, '../scenarios');
const outputFile = path.join(scenariosDir, 'manifest.json');

const CATEGORY_DISPLAY = {
  'flow-control': 'Flow Control',
  'coordination': 'Coordination',
  'coordination-primitives': 'Coordination Primitives',
  'concurrency-patterns': 'Concurrency Patterns',
  'composition': 'Composition',
  'data-delivery': 'Data Delivery',
  'invoke-bindings': 'Invoke Bindings',
  'step-workflows': 'Step Workflows',
};

const CATEGORY_ORDER = [
  'flow-control',
  'coordination',
  'coordination-primitives',
  'concurrency-patterns',
  'composition',
  'data-delivery',
  'invoke-bindings',
  'step-workflows',
];

const categories = [];

for (const dir of CATEGORY_ORDER) {
  const dirPath = path.join(scenariosDir, dir);
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) continue;

  const scenarios = [];
  for (const file of fs.readdirSync(dirPath).sort()) {
    if (!file.endsWith('.scenario.yaml')) continue;
    const content = fs.readFileSync(path.join(dirPath, file), 'utf8');

    // Handle files with --- separator (non-scenario YAML)
    const parts = content.split(/^---$/m);
    const headerYaml = parts[0];
    const parsed = yaml.load(headerYaml);
    const meta = parsed.meta || {};

    scenarios.push({
      file: `${dir}/${file}`,
      title: meta.title || file.replace('.scenario.yaml', ''),
      description: meta.description || '',
      tags: meta.tags || [],
      runnable: !!parsed.scenario,
    });
  }

  if (scenarios.length > 0) {
    categories.push({
      name: CATEGORY_DISPLAY[dir] || dir,
      key: dir,
      scenarios,
    });
  }
}

const manifest = {
  version: '1.0.0',
  categories,
};

fs.writeFileSync(outputFile, JSON.stringify(manifest, null, 2));
const total = categories.reduce((n, c) => n + c.scenarios.length, 0);
console.log(`Generated manifest with ${total} scenarios in ${categories.length} categories`);
