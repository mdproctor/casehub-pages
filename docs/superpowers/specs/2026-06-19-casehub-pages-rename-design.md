# casehub-pages Rename and Ecosystem Integration

**Date:** 2026-06-19
**Status:** Approved
**Tracks:** #24

## Overview

Rename melviz to casehub-pages and integrate as a foundational module in the CaseHub ecosystem. This completes the journey from dashbuilder (full GWT) → melviz (modernisation fork) → casehub-pages (100% TypeScript, near dashbuilder feature parity).

## Identity

- **Artifact name:** casehub-pages
- **GitHub blessed:** casehubio/casehub-pages
- **GitHub fork:** mdproctor/casehub-pages
- **Layer:** Foundation
- **Consumers:** claudony, drafthouse, devtown, life, aml (current targets)

## Package Rename

Every `melviz` and `dashbuilder` reference in active code is purged.

| Current Package | Current Folder | New Package | New Folder |
|----------------|----------------|-------------|------------|
| `@casehub/component` | `packages/casehub-component` | `@casehub/pages-component` | `packages/pages-component` |
| `@casehub/data` | `packages/core` | `@casehub/pages-data` | `packages/pages-data` |
| `@casehub/ui` | `packages/casehub-ui` | `@casehub/pages-ui` | `packages/pages-ui` |
| `@casehub/viz` | `packages/casehub-viz` | `@casehub/pages-viz` | `packages/pages-viz` |
| `@casehub/runtime` | `packages/casehub-runtime` | `@casehub/pages-runtime` | `packages/pages-runtime` |
| `@melviz/component-api` | `packages/melviz-component-api` | `@casehub/pages-api` | `packages/pages-api` |
| `@melviz/component-dev` | `packages/melviz-component-dev` | `@casehub/pages-dev` | `packages/pages-dev` |
| `webpack-base` | `packages/webpack-base` | `@casehub/pages-webpack-base` | `packages/pages-webpack-base` |
| `@melviz/tsconfig` | `packages/tsconfig` | `@casehub/pages-tsconfig` | `packages/pages-tsconfig` |
| `@melviz/component-echarts-base` | `components/melviz-component-echarts-base` | `@casehub/pages-echarts-base` | `packages/pages-echarts-base` |
| `@melviz/component-echarts` | `components/melviz-component-echarts` | `@casehub/pages-echarts` | `components/pages-echarts` |
| `@melviz/component-llm-prompter` | `components/melviz-component-llm-prompter` | `@casehub/pages-llm-prompter` | `components/pages-llm-prompter` |
| `@melviz/component-svg-heatmap` | `components/melviz-component-svg-heatmap` | `@casehub/pages-svg-heatmap` | `components/pages-svg-heatmap` |
| `@melviz/webapp` | `webapp/` | `@casehub/pages-webapp` | `webapp/` |
| `@melviz/examples` | `examples/` | `@casehub/pages-examples` | `examples/` |
| Root: `melviz` | — | `casehub-pages` | — |

**Note on `@melviz/component-echarts-base`:** Despite living in `components/`, this package is built by `build:packages` and excluded from `build:components` — it's a shared library, not a standalone component. The rename moves it to `packages/pages-echarts-base/` to match its actual role.

### Folder naming convention deviation

The `pages-` prefix on all package folders (e.g. `pages-data/`, `pages-ui/`) diverges from the maven-submodule-folder-naming protocol which says "short, no repo prefix" (e.g. `api/` not `casehub-work-api/`). This is a deliberate deviation: Maven repos have each module in its own repo directory where `api/` is unambiguous. A Yarn monorepo puts all packages under `packages/`, where `data/` or `ui/` alone is meaningless. The `pages-` prefix serves the same disambiguation function as the parent directory path does in Maven repos.

## GWT Core Removal from Build

The Java/GWT core (`core/`) is no longer a build participant. The TypeScript runtime (`@casehub/pages-runtime` via `loadSite()`) has fully replaced the GWT entry point.

**Changes:**
- Remove `"core/"` from root `package.json` workspaces array
- Remove the GWT copy from `webapp/webpack.config.js` (the `from: ../core/melviz-webapp-parent/...` block)
- Remove `build:core` and `build:core:prod` scripts from root `package.json`
- Remove `build:core` from the `build:prod` script chain
- Move `core/` to `_legacy/` — files stay on disk as reference, audit and delete via follow-up issue

The `setup.js` global namespace `melviz = { ... }` was read by the GWT RuntimeEntryPoint. Since GWT is removed from the build, this becomes `casehubPages = { ... }`. The TS runtime's `loadSite()` already takes options as a function argument; the global is only used by the examples gallery setup.

## Wire Protocol Rename

No external consumers exist — breaking changes cost nothing (per platform policy). The wire protocol identifiers are renamed as part of this work, not deferred.

**PostMessage type:**
- `MelvizDataMessage` → `PagesDataMessage`
- `type: "melviz-dataset"` → `type: "casehub-pages-dataset"` (in `types.ts` and `post-message.ts`)

**iframe component path:**
- `/melviz/component/${componentId}/index.html` → `/pages/component/${componentId}/index.html`
- In `CasehubIframePlugin.ts` (lines 29, 62) and `webapp/webpack.config.js` (line 19)
- Tests in `CasehubIframePlugin.test.ts` (6 assertions) updated to match

**Propagation check:** Before landing the rename, grep all casehub repos for `/melviz/component/` and `melviz-dataset` to confirm no consumer has started using these wire-protocol strings.

## Root package.json Script Updates

Every script in root `package.json` is updated. Old → new:

| Script | Change |
|--------|--------|
| `build:packages` | Replace all 7 workspace names: `@melviz/component-api` → `@casehub/pages-api`, `@melviz/component-echarts-base` → `@casehub/pages-echarts-base`, `@melviz/component-dev` → `@casehub/pages-dev`, `@casehub/component` → `@casehub/pages-component`, `@casehub/data` → `@casehub/pages-data`, `@casehub/ui` → `@casehub/pages-ui`, `@casehub/viz` → `@casehub/pages-viz`. **Also add** `@casehub/pages-runtime` after the four packages it depends on (pages-component, pages-data, pages-ui, pages-viz). |
| `build:core` | Remove entirely (GWT removed from build) |
| `build:core:prod` | Remove entirely |
| `build:prod` | Remove `yarn build:core:prod &&` from chain |
| `build:components` | Change `--include '@melviz/component-*'` → `--include '@casehub/pages-*'`, update three `--exclude` flags to new names |
| `build:webapp` | `@melviz/webapp` → `@casehub/pages-webapp` |
| `build:examples` | `@melviz/examples` → `@casehub/pages-examples` |
| `clean` | Remove `&& cd core && mvn clean || true` |

## Directory Moves

**Project repo:**
`/Users/mdproctor/claude/melviz/` → `/Users/mdproctor/claude/casehub/pages/`

**Workspace repo:**
`/Users/mdproctor/claude/public/melviz/` → `/Users/mdproctor/claude/public/casehub/pages/`

**Git remotes after move:**
- `origin` → `casehubio/casehub-pages`
- `fork` → `mdproctor/casehub-pages`

**Build graph position:**
```
pages (no casehub deps — independent foundation)
  ↓ consumed by (runtime: iframe embedding, YAML loading — not build-time deps)
  ├── claudony
  ├── drafthouse
  ├── devtown
  ├── life
  └── aml
```

## GitHub Repo Creation (History Preserved)

1. Create empty `casehubio/casehub-pages` on GitHub (no README, no template, rebase-merge-only)
2. Add as remote on existing local repo: `git remote add casehub <url>`
3. Push full history: `git push casehub main --tags` — all commits preserved
4. Do the rename work as new commits on top of the existing history
5. Fork from `casehubio/casehub-pages` to `mdproctor/casehub-pages`
6. Old repos (`melviz-org/melviz`, `mdproctor/melviz`) left as-is

## Ecosystem Integration (casehub-parent)

### Applies — needs pages entries

| File | What to add |
|------|-------------|
| `build-all.sh` | `REPO_DIR[pages]="../pages"`, `REPO_GH[pages]="casehub-pages"`, build via `yarn build`, no upstream DEPS |
| `full-stack-build.yml` | Clone step, `yarn install && yarn build` step, build timing, module list entry, outcome tracking |
| `incremental-full-stack-build.yml` | Clone, SHA calc, cache key, yarn build, dependency chaining to claudony/drafthouse |
| `dashboard.yml` | Add `casehubio/casehub-pages` to REPOS list |
| `pr-dashboard.yml` | Add `casehubio/casehub-pages` to REPOS list |
| `docs/index.html` | Add `'casehub-pages'` to PLATFORM_REPOS array |
| `README.md` | Badge row, module table entry, dependency matrix (note: runtime consumption, not build-time) |
| `docs/PLATFORM.md` | Foundation tier entry, capability ownership, note that this is the first non-Maven foundation module (yarn build, independent of Maven reactor). Document runtime consumption pattern (iframe embedding, YAML loading) so impact analysis covers it. |
| `CLAUDE.md` | Add `pages` to core repos list |
| `aggregator.xml` | One-line comment: `<!-- pages: yarn-only, not a Maven module -->` |

### Skipped — not applicable

| File | Why |
|------|-----|
| `pom.xml` (BOM) | No Maven artifacts |
| `publish.yml` dispatch loop | No casehub upstream deps |
| Flyway version range | No database |
| `.claude/settings.local.json` sed hooks | No legacy rename fixups |

### casehub-all

- `.gitmodules`: `[submodule "pages"]` → `https://github.com/casehubio/casehub-pages.git`
- `CLAUDE.md` table: `| pages/ | casehubio/casehub-pages | YAML dashboard rendering, component API, forms |`
- `update-pointers.yml`: Add `SHA_PAGES` env var and `'pages': 'SHA_PAGES'` entry in POINTERS dict

## Claude Memory and IntelliJ

**Claude project directories (rename):**
- `~/.claude/projects/-Users-mdproctor-claude-melviz/` → `-Users-mdproctor-claude-casehub-pages/`
- `~/.claude/projects/-Users-mdproctor-claude-public-melviz/` → `-Users-mdproctor-claude-public-casehub-pages/`

**CLAUDE.md files to rewrite:**
- Project CLAUDE.md — new paths, package names, build commands
- Workspace CLAUDE.md — update all path references

**IntelliJ recent projects:**
- `~/Library/Application Support/JetBrains/IntelliJIdea*/options/recentProjects.xml` — update path entry
- Or: open from new location, let IntelliJ add it; old entry goes stale

**Cross-project memory scan:**
- Check memory files in both project dirs for hardcoded melviz paths
- Check other workspace memories that might reference melviz

## README Lineage

> **History:** casehub-pages descends from [dashbuilder](https://github.com/kiegroup/kie-tools), a full GWT dashboard authoring platform. The melviz fork modernised the frontend, progressively replacing GWT with TypeScript Web Components. casehub-pages completes that journey — 100% TypeScript, near feature parity with dashbuilder, and designed as a foundational building block for the CaseHub platform.

## Issue Migration

- #24 on `mdproctor/melviz` tracks this work
- After move, new issues go to `mdproctor/casehub-pages`
- Existing open issues on `mdproctor/melviz` — close with pointer to new repo, or leave as historical

## Follow-up Issues (filed before leaving brainstorming)

1. **GWT core removal audit** — track deleting `_legacy/` (formerly `core/`) once TypeScript runtime feature parity is confirmed complete. The files stay on disk as reference until then.
2. **PLATFORM.md TypeScript module conventions** — create a protocol for Yarn/npm workspace conventions (folder naming, scope patterns, build ordering) so future TypeScript foundation modules have guidance. The `pages-` prefix deviation documented above is the first instance.
