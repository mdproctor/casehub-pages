export const SPACING_SCALE: Record<string, string> = {
  '0-5': '2px', '1': '4px', '1-5': '6px', '2': '8px',
  '3': '12px', '4': '16px', '5': '20px', '6': '24px',
  '8': '32px', '10': '40px', '12': '48px', '16': '64px',
};

export const TYPOGRAPHY = {
  family: "'Inter', system-ui, -apple-system, sans-serif",
  sizes: { xs: '11px', sm: '12px', base: '14px', lg: '16px', xl: '20px', '2xl': '24px' },
  lineHeights: { xs: '16px', sm: '16px', base: '20px', lg: '24px', xl: '28px', '2xl': '32px' },
  weights: { normal: '400', medium: '500', semibold: '600' },
} as const;

export const ELEVATION_LIGHT = {
  shadow: {
    '1': '0 1px 2px oklch(0% 0 0 / 0.05)',
    '2': '0 2px 4px oklch(0% 0 0 / 0.08), 0 1px 2px oklch(0% 0 0 / 0.04)',
    '3': '0 4px 12px oklch(0% 0 0 / 0.10), 0 2px 4px oklch(0% 0 0 / 0.06)',
    '4': '0 8px 24px oklch(0% 0 0 / 0.12), 0 4px 8px oklch(0% 0 0 / 0.08)',
  },
} as const;

export const ELEVATION_DARK = {
  shadow: {
    '1': '0 1px 2px oklch(0% 0 0 / 0.3)',
    '2': '0 2px 4px oklch(0% 0 0 / 0.35), 0 1px 2px oklch(0% 0 0 / 0.2)',
    '3': '0 4px 12px oklch(0% 0 0 / 0.4), 0 2px 4px oklch(0% 0 0 / 0.25)',
    '4': '0 8px 24px oklch(0% 0 0 / 0.5), 0 4px 8px oklch(0% 0 0 / 0.3)',
  },
} as const;

export const MOTION = {
  duration: { fast: '120ms', normal: '200ms', slow: '350ms' },
  easing: { out: 'cubic-bezier(0.16, 1, 0.3, 1)', inOut: 'cubic-bezier(0.45, 0, 0.55, 1)' },
} as const;

export const RADIUS = { sm: '4px', md: '6px', lg: '8px' } as const;

export const DENSITY_COMPACT_OVERRIDES: Record<string, string> = {
  '--pages-space-1': '3px',
  '--pages-space-2': '6px',
  '--pages-space-3': '8px',
  '--pages-space-4': '12px',
  '--pages-font-size-base': '13px',
  '--pages-font-size-sm': '11px',
  '--pages-line-height-base': '18px',
};
