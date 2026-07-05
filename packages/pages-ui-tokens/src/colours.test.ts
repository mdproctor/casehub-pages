import { describe, it, expect } from 'vitest';
import { generateScale } from './colours.js';

describe('generateScale', () => {
  it('returns 12 steps keyed 1-12', () => {
    const scale = generateScale(210, 0.15, 0.5, false);
    const keys = Object.keys(scale).sort((a, b) => Number(a) - Number(b));
    expect(keys).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']);
  });

  it('produces valid oklch format strings', () => {
    const scale = generateScale(210, 0.15, 0.5, false);
    for (const value of Object.values(scale)) {
      expect(value).toMatch(/^oklch\(\d+\.\d+% 0\.\d{3} \d+\)$/);
    }
  });

  it('light mode: step 1 has highest lightness (near 98.5%)', () => {
    const scale = generateScale(210, 0.15, 0.5, false);
    const step1 = scale['1']!;
    const lightness = parseFloat(step1.match(/oklch\((\d+\.\d+)%/)![1]!);
    expect(lightness).toBeGreaterThan(97);
    expect(lightness).toBeLessThan(100);
  });

  it('light mode: step 12 has lowest lightness (near 18%)', () => {
    const scale = generateScale(210, 0.15, 0.5, false);
    const step12 = scale['12']!;
    const lightness = parseFloat(step12.match(/oklch\((\d+\.\d+)%/)![1]!);
    expect(lightness).toBeGreaterThan(16);
    expect(lightness).toBeLessThan(20);
  });

  it('dark mode: step 1 has lowest lightness (near 8%)', () => {
    const scale = generateScale(210, 0.15, 0.5, true);
    const step1 = scale['1']!;
    const lightness = parseFloat(step1.match(/oklch\((\d+\.\d+)%/)![1]!);
    expect(lightness).toBeGreaterThan(6);
    expect(lightness).toBeLessThan(10);
  });

  it('dark mode: step 12 has highest lightness (near 93%)', () => {
    const scale = generateScale(210, 0.15, 0.5, true);
    const step12 = scale['12']!;
    const lightness = parseFloat(step12.match(/oklch\((\d+\.\d+)%/)![1]!);
    expect(lightness).toBeGreaterThan(91);
    expect(lightness).toBeLessThan(95);
  });

  it('chroma reduced at extremes (step 1 and 12)', () => {
    const scale = generateScale(210, 0.15, 0.5, false);
    const extractChroma = (step: string) => parseFloat(step.match(/oklch\(\d+\.\d+% (0\.\d{3})/)![1]!);

    const chroma1 = extractChroma(scale['1']!);
    const chroma6 = extractChroma(scale['6']!);
    const chroma12 = extractChroma(scale['12']!);

    expect(chroma1).toBeLessThan(chroma6);
    expect(chroma12).toBeLessThan(chroma6);
  });

  it('contrast modifier shifts lightness', () => {
    const lowContrast = generateScale(210, 0.15, 0.3, false);
    const highContrast = generateScale(210, 0.15, 0.7, false);

    const extractLightness = (step: string) => parseFloat(step.match(/oklch\((\d+\.\d+)%/)![1]!);

    const lowStep6 = extractLightness(lowContrast['6']!);
    const highStep6 = extractLightness(highContrast['6']!);

    // High contrast should shift lightness away from 0.5 baseline
    expect(Math.abs(lowStep6 - highStep6)).toBeGreaterThan(1);
  });

  it('preserves hue across all steps', () => {
    const scale = generateScale(145, 0.15, 0.5, false);
    for (const value of Object.values(scale)) {
      expect(value).toMatch(/oklch\(\d+\.\d+% 0\.\d{3} 145\)$/);
    }
  });
});
