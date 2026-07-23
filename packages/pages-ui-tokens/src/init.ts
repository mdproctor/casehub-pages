import { registerTheme } from './runtime.js';
import { initPresets } from './transforms/index.js';
import { runPipeline } from './pipeline.js';
import { generateCSS, generateDensityCSS } from './output.js';
import { getBuiltinPreset, listBuiltinPresets } from './preset-loader.js';

initPresets();

const densityCSS = generateDensityCSS();

for (const name of listBuiltinPresets()) {
  const preset = getBuiltinPreset(name)!;
  const tokens = runPipeline(preset);
  const css = generateCSS(tokens, name) + '\n\n' + densityCSS;
  registerTheme(name, css);
}
