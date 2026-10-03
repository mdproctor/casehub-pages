const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const scenariosDir = path.join(__dirname, '../scenarios');
let passed = 0;
let failed = 0;

for (const dir of fs.readdirSync(scenariosDir)) {
  const dirPath = path.join(scenariosDir, dir);
  if (!fs.statSync(dirPath).isDirectory()) continue;
  for (const file of fs.readdirSync(dirPath)) {
    if (!file.endsWith('.scenario.yaml')) continue;
    try {
      const content = fs.readFileSync(path.join(dirPath, file), 'utf8');
      // Handle files with --- separator (non-scenario YAML)
      const parts = content.split(/^---$/m);
      const headerYaml = parts[0];
      const parsed = yaml.load(headerYaml);
      if (!parsed.meta) throw new Error('Missing meta block');
      if (!parsed.meta.title) throw new Error('Missing meta.title');
      if (!parsed.meta.tags || parsed.meta.tags.length === 0) throw new Error('Missing meta.tags');
      passed++;
    } catch (e) {
      console.error(`FAIL: ${dir}/${file} — ${e.message}`);
      failed++;
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
