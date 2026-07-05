import { generateScale } from './colours.js';
import {
  SPACING_SCALE, TYPOGRAPHY, ELEVATION_LIGHT, ELEVATION_DARK,
  MOTION, RADIUS, DENSITY_COMPACT_OVERRIDES,
} from './tokens.js';

export interface ThemeConfig {
  readonly baseHue: number;
  readonly accentHue: number;
  readonly chroma: number;
  readonly contrast: number;
}

export const DEFAULT_THEME: ThemeConfig = {
  baseHue: 220,
  accentHue: 245,
  chroma: 0.12,
  contrast: 0.5,
};

const SEMANTIC_HUES: Record<string, (config: ThemeConfig) => number> = {
  accent: (c) => c.accentHue,
  neutral: (c) => c.baseHue,
  success: () => 145,
  warning: () => 55,
  danger: () => 25,
  info: () => 210,
};

function generateColourTokens(config: ThemeConfig, isDark: boolean): string {
  const lines: string[] = [];
  for (const [name, hueFn] of Object.entries(SEMANTIC_HUES)) {
    const hue = hueFn(config);
    const chromaVal = name === 'neutral' ? config.chroma * 0.15 : config.chroma;
    const scale = generateScale(hue, chromaVal, config.contrast, isDark);
    for (const [step, value] of Object.entries(scale)) {
      lines.push(`  --pages-${name}-${step}: ${value};`);
    }
  }
  return lines.join('\n');
}

function generateSharedTokens(): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(SPACING_SCALE)) {
    lines.push(`  --pages-space-${key}: ${value};`);
  }

  lines.push(`  --pages-font-family: ${TYPOGRAPHY.family};`);
  for (const [key, value] of Object.entries(TYPOGRAPHY.sizes)) {
    lines.push(`  --pages-font-size-${key}: ${value};`);
  }
  for (const [key, value] of Object.entries(TYPOGRAPHY.lineHeights)) {
    lines.push(`  --pages-line-height-${key}: ${value};`);
  }
  for (const [key, value] of Object.entries(TYPOGRAPHY.weights)) {
    lines.push(`  --pages-font-weight-${key}: ${value};`);
  }

  for (const [key, value] of Object.entries(MOTION.duration)) {
    lines.push(`  --pages-duration-${key}: ${value};`);
  }
  for (const [key, value] of Object.entries(MOTION.easing)) {
    lines.push(`  --pages-ease-${key}: ${value};`);
  }

  for (const [key, value] of Object.entries(RADIUS)) {
    lines.push(`  --pages-radius-${key}: ${value};`);
  }

  return lines.join('\n');
}

function generateElevationTokens(isDark: boolean): string {
  const shadows = isDark ? ELEVATION_DARK.shadow : ELEVATION_LIGHT.shadow;
  const lines: string[] = [];

  for (const [key, value] of Object.entries(shadows)) {
    lines.push(`  --pages-shadow-${key}: ${value};`);
  }

  // Add surface tokens
  for (let i = 1; i <= 4; i++) {
    const opacity = isDark ? 0.05 + (i * 0.03) : 0.02 + (i * 0.02);
    lines.push(`  --pages-surface-${i}: oklch(${isDark ? '100%' : '0%'} 0 0 / ${opacity.toFixed(2)});`);
  }

  return lines.join('\n');
}

export function generateThemeCSS(config: ThemeConfig): string {
  const shared = generateSharedTokens();

  const lightColours = generateColourTokens(config, false);
  const darkColours = generateColourTokens(config, true);

  const lightElevation = generateElevationTokens(false);
  const darkElevation = generateElevationTokens(true);

  const densityOverrides = Object.entries(DENSITY_COMPACT_OVERRIDES)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n');

  return [
    `.pages-theme-light {\n${shared}\n${lightColours}\n${lightElevation}\n}`,
    `.pages-theme-dark {\n${shared}\n${darkColours}\n${darkElevation}\n}`,
    `.pages-density-compact {\n${densityOverrides}\n}`,
  ].join('\n\n');
}

export function injectTheme(config: ThemeConfig, target: HTMLElement = document.documentElement): void {
  const existing = target.querySelector('style[data-pages-theme]');
  if (existing) existing.remove();

  const style = document.createElement('style');
  style.setAttribute('data-pages-theme', '');
  style.textContent = generateThemeCSS(config);
  target.prepend(style);
}

export function applyThemeMode(element: HTMLElement, mode: 'light' | 'dark'): void {
  if (mode === 'light') {
    element.classList.add('pages-theme-light');
    element.classList.remove('pages-theme-dark');
  } else {
    element.classList.add('pages-theme-dark');
    element.classList.remove('pages-theme-light');
  }
}
