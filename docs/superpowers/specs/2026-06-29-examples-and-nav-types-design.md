# Examples and Navigation Types — Design Spec

**Date:** 2026-06-29
**Issues:** #33 (navigation type examples), #34 (withAccess, dataset join, YAML includes examples), #59 (toLowerCase crash fix — complete)
**Branch:** issue-36-accumulate-websocket-datasets

## Context

This spec covers the S/XS portion of the branch. The reactive dataset events spec (`2026-06-29-reactive-dataset-events-design.md`) covers #36, #52, #53 separately.

#59 (guard toLowerCase crash on non-string ColumnId) is already implemented and committed — included here for completeness.

## 1. YAML NAV_TYPE_MAP Gap (#33 prerequisite)

### Problem

`accordion` and `appGrid` navigation types exist in the TS builder (`builders.ts`) and renderer (`layout.ts`) but are missing from the YAML `NAV_TYPE_MAP` in `component-desugar.ts`. YAML dashboards cannot use them.

### Fix

Add two entries to `NAV_TYPE_MAP` in `packages/pages-ui/src/parser/component-desugar.ts`:

```
ACCORDION → accordion
APP_GRID  → app-grid
```

Follow the existing convention: YAML key is SCREAMING_SNAKE, value is the kebab-case type used by the renderer.

### Tests

Add test cases in `component-desugar.test.ts` verifying `navType: ACCORDION` and `navType: APP_GRID` desugar correctly.

## 2. Navigation Gallery Example (#33)

### Approach

Extend the existing `Navigation Rebinding.dash.yml` to include all 9 navigation types. The current example shows 6 (tree, tabs, menu, sidebar, tiles, carousel). Add accordion and appGrid views.

### Structure

Same pattern as existing: a selector switches between nav modes. Each mode renders the same 3-4 child pages (metrics + table + chart) using a different navigation container.

Add two new views to the existing file:
- **Accordion View** — collapsible section panels
- **App Grid View** — tile-based grid of page links

Update the `.ts` companion to include `accordion()` and `appGrid()` builder calls.

### File changes

| File | Change |
|------|--------|
| `examples/dashboards/Basic Usage/Navigation Rebinding.dash.yml` | Add ACCORDION and APP_GRID views |
| `examples/dashboards/Basic Usage/Navigation Rebinding.ts` | Add `accordion()` and `appGrid()` builder calls |

## 3. Advanced Features Example (#34)

### Approach

One new dashboard — "Team Management" — demonstrating withAccess, dataset join, and YAML includes in a coherent scenario.

### Scenario

A team management dashboard with three pages:
- **Overview** — team summary table using JOIN to show member names per team
- **Team Detail** — detailed member list (included via YAML `src:`)
- **Admin Settings** — gated by `withAccess({ roles: ["admin"] })`

### Dataset

Single inline dataset with columns: `team`, `member`, `role`, `email`, `department`.

### Feature demonstrations

**withAccess (role-based visibility):**
- Overview page: visible to all roles
- Team Detail page: visible to `manager` and `admin`
- Admin Settings page: visible to `admin` only
- A metric component within Overview: gated by `analyst` role

**Dataset join:**
- Overview page groups by `team` with:
  - `JOIN` on `member` column (separator: ", ") — shows "Alice, Bob, Charlie" per team
  - `COUNT` on `member` — shows headcount
  - `JOIN` on `role` column (separator: ", ") — shows unique roles

**YAML includes:**
- Main file: `Team Management.dash.yaml`
- Included files in `includes/` subdirectory:
  - `includes/team-detail.dash.yml` — Team Detail page definition
  - `includes/admin-settings.dash.yml` — Admin Settings page definition
- Overview page stays inline in the main file (demonstrates the mix)

### File map

| File | Purpose |
|------|--------|
| `examples/dashboards/Basic Usage/Team Management.dash.yaml` | Main dashboard with withAccess, join, includes |
| `examples/dashboards/Basic Usage/includes/team-detail.dash.yml` | Included page: team member detail |
| `examples/dashboards/Basic Usage/includes/admin-settings.dash.yml` | Included page: admin settings |
| `examples/dashboards/Basic Usage/Team Management.ts` | TS companion with `withAccess()`, `join()` builders |

## 4. #59 — toLowerCase Crash Fix (Complete)

Already committed (`af38f84`). See casehubio/casehub-pages#59 for details.

### Summary

- Boundary validation in `columnId()`/`dataSetId()` constructors
- Input validation in `groupBy()` DSL
- `typeof` guards on 4 `toLowerCase` callsites
- 6 regression tests across 4 files
- `INVALID_ARGUMENT` added to `DataSetErrorCode`

## 5. Unchanged

- All packages outside pages-ui and examples
- The reactive dataset events implementation (separate spec)
- Component layer (pages-viz, pages-component)
- Data pipeline (pages-runtime)
