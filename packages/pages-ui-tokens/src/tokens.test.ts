import {describe, expect, it} from 'vitest';
import {SPACING_SCALE} from './tokens.js';
import {DEFAULT_THEME, generateThemeCSS} from './themes.js';

describe('SPACING_SCALE', () => {
  it('uses hyphenated keys for fractional values', () => {
    expect(SPACING_SCALE['0-5']).toBe('2px');
    expect(SPACING_SCALE['1-5']).toBe('6px');
    expect(SPACING_SCALE['0.5']).toBeUndefined();
    expect(SPACING_SCALE['1.5']).toBeUndefined();
  });
});

describe('generateThemeCSS spacing tokens', () => {
  it('generates hyphenated CSS custom properties', () => {
    const css = generateThemeCSS(DEFAULT_THEME);
    expect(css).toContain('--pages-space-0-5: 2px');
    expect(css).toContain('--pages-space-1-5: 6px');
    expect(css).not.toContain('--pages-space-0.5');
    expect(css).not.toContain('--pages-space-1.5');
  });

  it('generated spacing values match SPACING_SCALE source values', () => {
    const css = generateThemeCSS(DEFAULT_THEME);
    for (const [key, value] of Object.entries(SPACING_SCALE)) {
      // Escape regex special characters in the value
      const escapedValue = value.replace(/[()]/g, '\\$&');
      const pattern = new RegExp(`--pages-space-${key}:\\s*${escapedValue}`);
      expect(css, `--pages-space-${key} should have value ${value}`).toMatch(pattern);
    }
  });
});

describe('blocks-ui coverage', () => {
  const BLOCKS_VARS = [
    'accent-1','accent-3','accent-6','accent-9','accent-10','accent-11',
    'danger-2','danger-3','danger-4','danger-6','danger-8','danger-9','danger-10','danger-11',
    'neutral-1','neutral-2','neutral-3','neutral-4','neutral-5','neutral-6','neutral-7','neutral-8','neutral-9','neutral-10','neutral-11','neutral-12',
    'success-9','warning-9',
    'space-0-5','space-1','space-1-5','space-2','space-3','space-4','space-8','space-10',
    'font-family','font-size-xs','font-size-sm','font-size-base','font-size-lg','font-size-xl',
    'font-weight-medium','font-weight-semibold',
    'duration-fast','ease-out',
    'radius-sm','radius-md',
    'shadow-1','surface-1',
  ];

  it('pages-ui-tokens generates every CSS var blocks-ui consumes', () => {
    const css = generateThemeCSS(DEFAULT_THEME);
    for (const suffix of BLOCKS_VARS) {
      expect(css, `missing --pages-${suffix}`).toContain(`--pages-${suffix}`);
    }
  });
});
