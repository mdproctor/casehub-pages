import { registerTransform } from '../registry.js';
import { registerBuiltinPreset } from '../preset-loader.js';
import type { PresetConfig } from '../types.js';
import { oklchScale } from './oklch-scale.js';
import { lightMode } from './light-mode.js';
import { darkMode } from './dark-mode.js';
import { lightnessShift } from './lightness-shift.js';
import { lightnessSteps } from './lightness-steps.js';
import { chromaCurve } from './chroma-curve.js';
import { semanticHues } from './semantic-hues.js';
import { override } from './override.js';
import { semanticMap } from './semantic-map.js';
import { contrastCheck } from './contrast-check.js';
import { gamutClamp } from './gamut-clamp.js';

const DEFAULT_HUES = {
  hues: { accent: 245, neutral: 220, success: 145, warning: 55, danger: 25, info: 210 },
  chroma: 0.12,
  contrast: 0.5,
};

const DEFAULT_LIGHT_PRESET: PresetConfig = {
  $name: 'default-light',
  $description: 'Pages generic light theme',
  pipeline: [
    { transform: 'light-mode' },
    { transform: 'oklch-scale', params: DEFAULT_HUES },
    { transform: 'semantic-map' },
    { transform: 'gamut-clamp' },
  ],
};

const DEFAULT_DARK_PRESET: PresetConfig = {
  $name: 'default-dark',
  $description: 'Pages generic dark theme',
  pipeline: [
    { transform: 'dark-mode' },
    { transform: 'oklch-scale', params: DEFAULT_HUES },
    { transform: 'semantic-map' },
    { transform: 'gamut-clamp' },
  ],
};

export function registerCoreTransforms(): void {
  registerTransform('oklch-scale', oklchScale);
  registerTransform('light-mode', lightMode);
  registerTransform('dark-mode', darkMode);
  registerTransform('lightness-shift', lightnessShift);
  registerTransform('lightness-steps', lightnessSteps);
  registerTransform('chroma-curve', chromaCurve);
  registerTransform('semantic-hues', semanticHues);
  registerTransform('override', override);
  registerTransform('semantic-map', semanticMap);
  registerTransform('contrast-check', contrastCheck);
  registerTransform('gamut-clamp', gamutClamp);
}

const CASEHUB_BRAND_HUES = { hues: { violet: 270, green: 160, magenta: 320 } };

const CASEHUB_STEPS = [16, 21, 25, 29, 35, 42, 49, 55, 68, 76, 86, 93];

const CASEHUB_DARK_PRESET: PresetConfig = {
  $name: 'casehub-dark',
  $description: 'CaseHub brand dark theme — Claudony / casehub.org look',
  $extends: 'default-dark',
  pipeline: [
    { transform: 'oklch-scale', params: { hues: { accent: 215, neutral: 240 }, chroma: 0.30, steps: CASEHUB_STEPS } },
    { transform: 'oklch-scale', params: { ...CASEHUB_BRAND_HUES, steps: CASEHUB_STEPS, chroma: 0.12 } },
    { transform: 'chroma-curve', params: { curve: 'gaussian', neutral: 1.8, accent: 0.52 } },
    { transform: 'semantic-hues', params: { success: 175, warning: 85 } },
    { transform: 'semantic-map' },
    { transform: 'gamut-clamp' },
  ],
};

const CASEHUB_LIGHT_PRESET: PresetConfig = {
  $name: 'casehub-light',
  $description: 'CaseHub brand light theme',
  $extends: 'default-light',
  pipeline: [
    { transform: 'oklch-scale', params: CASEHUB_BRAND_HUES },
    { transform: 'chroma-curve', params: { curve: 'gaussian', neutral: 0.02 } },
    { transform: 'semantic-hues', params: { success: 175, warning: 100 } },
    { transform: 'semantic-map' },
    { transform: 'gamut-clamp' },
  ],
};

export function initPresets(): void {
  registerCoreTransforms();
  registerBuiltinPreset(DEFAULT_LIGHT_PRESET);
  registerBuiltinPreset(DEFAULT_DARK_PRESET);
  registerBuiltinPreset(CASEHUB_DARK_PRESET);
  registerBuiltinPreset(CASEHUB_LIGHT_PRESET);
}

export { oklchScale } from './oklch-scale.js';
export { lightMode } from './light-mode.js';
export { darkMode } from './dark-mode.js';
export { lightnessShift } from './lightness-shift.js';
export { lightnessSteps } from './lightness-steps.js';
export { chromaCurve } from './chroma-curve.js';
export { semanticHues } from './semantic-hues.js';
export { override } from './override.js';
export { semanticMap } from './semantic-map.js';
export { contrastCheck } from './contrast-check.js';
export { gamutClamp } from './gamut-clamp.js';
