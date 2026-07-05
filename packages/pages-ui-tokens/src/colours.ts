// Lightness targets for 12 steps — derived from Radix's perceptual mapping
// Light mode: step 1 is near-white, step 12 is near-black
// Dark mode: inverted
const LIGHT_STEPS = [98.5, 96, 92, 88, 82, 72, 62, 55, 50, 43, 35, 18];
const DARK_STEPS = [8, 12, 17, 22, 28, 34, 40, 47, 55, 65, 78, 93];

export function generateScale(
  hue: number,
  chroma: number,
  contrast: number,
  isDark: boolean,
): Record<string, string> {
  const steps = isDark ? DARK_STEPS : LIGHT_STEPS;
  const scale: Record<string, string> = {};

  for (let i = 0; i < 12; i++) {
    const lightness = steps[i]! + (contrast - 0.5) * (isDark ? -4 : 4);
    const clamped = Math.max(0, Math.min(100, lightness));
    // Reduce chroma at extremes (very light/dark steps)
    const chromaScale = clamped > 90 || clamped < 15 ? 0.3 : clamped > 80 || clamped < 25 ? 0.6 : 1;
    const adjustedChroma = chroma * chromaScale;
    scale[String(i + 1)] = `oklch(${clamped.toFixed(1)}% ${adjustedChroma.toFixed(3)} ${hue})`;
  }

  return scale;
}
