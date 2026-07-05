import { describe, it, expect, beforeEach } from 'vitest';
import { generateThemeCSS, injectTheme, applyThemeMode, DEFAULT_THEME } from './themes.js';

describe('generateThemeCSS', () => {
  it('contains light and dark theme classes', () => {
    const css = generateThemeCSS(DEFAULT_THEME);
    expect(css).toContain('.pages-theme-light');
    expect(css).toContain('.pages-theme-dark');
  });

  it('contains density compact class', () => {
    const css = generateThemeCSS(DEFAULT_THEME);
    expect(css).toContain('.pages-density-compact');
  });

  it('contains all 72 colour tokens (6 hues × 12 steps)', () => {
    const css = generateThemeCSS(DEFAULT_THEME);
    const hues = ['accent', 'neutral', 'success', 'warning', 'danger', 'info'];
    for (const hue of hues) {
      for (let step = 1; step <= 12; step++) {
        expect(css).toContain(`--pages-${hue}-${step}:`);
      }
    }
  });

  it('contains spacing tokens', () => {
    const css = generateThemeCSS(DEFAULT_THEME);
    expect(css).toContain('--pages-space-1:');
    expect(css).toContain('--pages-space-4:');
    expect(css).toContain('--pages-space-16:');
  });

  it('contains typography tokens', () => {
    const css = generateThemeCSS(DEFAULT_THEME);
    expect(css).toContain('--pages-font-family:');
    expect(css).toContain('--pages-font-size-base:');
    expect(css).toContain('--pages-line-height-base:');
    expect(css).toContain('--pages-font-weight-medium:');
  });

  it('contains elevation tokens', () => {
    const css = generateThemeCSS(DEFAULT_THEME);
    expect(css).toContain('--pages-shadow-1:');
    expect(css).toContain('--pages-shadow-4:');
  });

  it('light and dark elevation tokens differ', () => {
    const css = generateThemeCSS(DEFAULT_THEME);
    const lightMatch = css.match(/\.pages-theme-light[^}]*--pages-shadow-1:\s*([^;]+);/s);
    const darkMatch = css.match(/\.pages-theme-dark[^}]*--pages-shadow-1:\s*([^;]+);/s);
    expect(lightMatch).not.toBeNull();
    expect(darkMatch).not.toBeNull();
    expect(lightMatch![1]).not.toEqual(darkMatch![1]);
  });

  it('contains motion tokens', () => {
    const css = generateThemeCSS(DEFAULT_THEME);
    expect(css).toContain('--pages-duration-fast:');
    expect(css).toContain('--pages-ease-out:');
  });

  it('contains radius tokens', () => {
    const css = generateThemeCSS(DEFAULT_THEME);
    expect(css).toContain('--pages-radius-sm:');
    expect(css).toContain('--pages-radius-md:');
    expect(css).toContain('--pages-radius-lg:');
  });

  it('contains surface tokens', () => {
    const css = generateThemeCSS(DEFAULT_THEME);
    expect(css).toContain('--pages-surface-1:');
    expect(css).toContain('--pages-surface-4:');
  });

  it('DEFAULT_THEME produces no NaN or undefined', () => {
    const css = generateThemeCSS(DEFAULT_THEME);
    expect(css).not.toContain('NaN');
    expect(css).not.toContain('undefined');
  });

  it('density compact overrides shrink space tokens', () => {
    const css = generateThemeCSS(DEFAULT_THEME);
    expect(css).toMatch(/\.pages-density-compact[^}]*--pages-space-1:\s*3px/s);
  });

  it('density compact overrides shrink font tokens', () => {
    const css = generateThemeCSS(DEFAULT_THEME);
    expect(css).toMatch(/\.pages-density-compact[^}]*--pages-font-size-base:\s*13px/s);
  });
});

describe('applyThemeMode', () => {
  let element: HTMLElement;

  beforeEach(() => {
    element = document.createElement('div');
  });

  it('sets light theme class', () => {
    applyThemeMode(element, 'light');
    expect(element.classList.contains('pages-theme-light')).toBe(true);
    expect(element.classList.contains('pages-theme-dark')).toBe(false);
  });

  it('sets dark theme class', () => {
    applyThemeMode(element, 'dark');
    expect(element.classList.contains('pages-theme-dark')).toBe(true);
    expect(element.classList.contains('pages-theme-light')).toBe(false);
  });

  it('switches from light to dark', () => {
    applyThemeMode(element, 'light');
    applyThemeMode(element, 'dark');
    expect(element.classList.contains('pages-theme-dark')).toBe(true);
    expect(element.classList.contains('pages-theme-light')).toBe(false);
  });

  it('switches from dark to light', () => {
    applyThemeMode(element, 'dark');
    applyThemeMode(element, 'light');
    expect(element.classList.contains('pages-theme-light')).toBe(true);
    expect(element.classList.contains('pages-theme-dark')).toBe(false);
  });
});

describe('injectTheme', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '';
  });

  it('creates style element with data-pages-theme attribute', () => {
    injectTheme(DEFAULT_THEME);
    const style = document.querySelector('style[data-pages-theme]');
    expect(style).not.toBeNull();
  });

  it('prepends style to target element', () => {
    const target = document.createElement('div');
    target.innerHTML = '<div>existing</div>';
    injectTheme(DEFAULT_THEME, target);
    expect(target.firstElementChild?.tagName).toBe('STYLE');
  });

  it('replaces existing theme style', () => {
    injectTheme(DEFAULT_THEME);
    injectTheme(DEFAULT_THEME);
    const styles = document.querySelectorAll('style[data-pages-theme]');
    expect(styles.length).toBe(1);
  });

  it('injects complete theme CSS', () => {
    injectTheme(DEFAULT_THEME);
    const style = document.querySelector('style[data-pages-theme]');
    expect(style?.textContent).toContain('.pages-theme-light');
    expect(style?.textContent).toContain('.pages-theme-dark');
    expect(style?.textContent).toContain('--pages-accent-1:');
  });
});
