---
id: PP-20260705-2ae91d
title: "CSS design tokens use --pages- prefix, OKLCH 12-step colour scales, and eleven token categories"
type: rule
scope: repo
applies_to: "all CSS custom property declarations and token definitions in casehub-pages"
cross_repo_consumers: ["casehubio/blocks-ui"]
severity: important
refs: []
violation_hint: "CSS custom property does not use --pages- prefix or uses non-standard category/key naming"
created: 2026-07-05
---

## Rule 1 — Token naming prefix

All CSS custom properties use `--pages-` prefix, lowercase, hyphen-separated.
No camelCase, no dots. Fractional spacing keys use hyphens:
`--pages-space-0-5`, not `--pages-space-0.5`. Category is the first segment
after prefix: `--pages-{category}-{key}`.

## Rule 2 — OKLCH 12-step colour scales

Semantic colour scales use 12 perceptual steps (1–12). Step 1 is
near-background (lightest in light mode, darkest in dark mode). Step 12 is
near-foreground. Each step has a base lightness target (e.g., 98.5% for
light-mode step 1, 18% for step 12); a contrast slider shifts all targets
uniformly. Chroma is dynamically reduced based on the **clamped lightness
value** (not step index):

| Clamped lightness | Chroma multiplier |
|-------------------|-------------------|
| > 90% or < 15% | 0.3× |
| 81%–90% or 15%–24% | 0.6× |
| 25%–80% | 1.0× |

This means the same step number can produce different chroma multipliers
depending on contrast settings and light/dark mode — the lightness value
after clamping is what matters.

Hues are semantic: `accent` (configurable), `neutral` (configurable, reduced
to 15% of base chroma), `success` (145), `warning` (55), `danger` (25),
`info` (210). Format: `oklch({L}% {C} {H})`.

## Rule 3 — Token vocabulary

Eleven categories:

| Category | Pattern | Keys |
|----------|---------|------|
| Colour | `--pages-{semantic}-{1-12}` | accent, neutral, success, warning, danger, info |
| Spacing | `--pages-space-{key}` | 0-5, 1, 1-5, 2, 3, 4, 5, 6, 8, 10, 12, 16 |
| Typography size | `--pages-font-size-{size}` | xs, sm, base, lg, xl, 2xl |
| Typography weight | `--pages-font-weight-{weight}` | normal, medium, semibold |
| Line height | `--pages-line-height-{size}` | xs, sm, base, lg, xl, 2xl |
| Motion duration | `--pages-duration-{speed}` | fast, normal, slow |
| Motion easing | `--pages-ease-{type}` | out, inOut |
| Elevation | `--pages-shadow-{1-4}` | 1–4 (light/dark variants) |
| Radius | `--pages-radius-{size}` | sm, md, lg |
| Surface | `--pages-surface-{1-4}` | 1–4 (layered translucent overlays for cards, panels, modals) |
| Font family | `--pages-font-family` | Inter/system-ui stack |

## Density variants

The `.pages-density-compact` CSS class overrides a subset of spacing and
typography tokens with tighter values (e.g., `--pages-space-4` drops from
16px to 12px, `--pages-font-size-base` from 14px to 13px). These overrides
are generated alongside the theme and applied via class toggle — components
do not need to be aware of the density mode.
