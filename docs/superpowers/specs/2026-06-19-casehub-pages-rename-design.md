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
- **Consumers:** claudony, drafthouse, devtown, life, aml (current targets — runtime consumption via iframe embedding and YAML loading, not build-time deps)

## Package Rename

Every `melviz` and `dashbuilder` reference in active code is purged.

The package names encode an architectural distinction: **shared libraries** (in `packages/`) use flat names like `pages-data`, `pages-ui`; **standalone iframe-isolated microfrontend components** (in `components/`) use the `pages-component-` prefix. This makes the architectural role visible in the package registry and allows `build:components` to use `--include '@casehub/pages-component-*'` with zero excludes.

The iframe bridge packages (`@melviz/component-api`, `@melviz/component-dev`) are renamed to `pages-iframe-api` and `pages-iframe-dev` — not `pages-api`/`pages-dev`, which would misleadingly suggest the public API of the entire pages system. These are specifically the postMessage bridge and dev tooling for building iframe components.

| Current Package | Current Folder | New Package | New Folder |
|----------------|----------------|-------------|------------|
| `@casehub/component` | `packages/casehub-component` | `@casehub/pages-component` | `packages/pages-component` |
| `@casehub/data` | `packages/core` | `@casehub/pages-data` | `packages/pages-data` |
| `@casehub/ui` | `packages/casehub-ui` | `@casehub/pages-ui` | `packages/pages-ui` |
| `@casehub/viz` | `packages/casehub-viz` | `@casehub/pages-viz` | `packages/pages-viz` |
| `@casehub/runtime` | `packages/casehub-runtime` | `@casehub/pages-runtime` | `packages/pages-runtime` |
| `@melviz/component-api` | `packages/melviz-component-api` | `@casehub/pages-iframe-api` | `packages/pages-iframe-api` |
| `@melviz/component-dev` | `packages/melviz-component-dev` | `@casehub/pages-iframe-dev` | `packages/pages-iframe-dev` |
| `webpack-base` | `packages/webpack-base` | `@casehub/pages-webpack-base` | `packages/pages-webpack-base` |
| `@melviz/tsconfig` | `packages/tsconfig` | `@casehub/pages-tsconfig` | `packages/pages-tsconfig` |
| `@melviz/component-echarts-base` | `components/melviz-component-echarts-base` | `@casehub/pages-echarts-base` | `packages/pages-echarts-base` |
| `@melviz/component-echarts` | `components/melviz-component-echarts` | `@casehub/pages-component-echarts` | `components/pages-component-echarts` |
| `@melviz/component-llm-prompter` | `components/melviz-component-llm-prompter` | `@casehub/pages-component-llm-prompter` | `components/pages-component-llm-prompter` |
| `@melviz/component-svg-heatmap` | `components/melviz-component-svg-heatmap` | `@casehub/pages-component-svg-heatmap` | `components/pages-component-svg-heatmap` |
| `@melviz/webapp` | `webapp/` | `@casehub/pages-webapp` | `webapp/` |
| `@melviz/examples` | `examples/` | `@casehub/pages-examples` | `examples/` |
| `@melviz/core-gwt` | `core/` | *(removed from workspace — see GWT Core Removal)* | `_legacy/` |
| Root: `melviz` | — | `casehub-pages` | — |

**Note on `@melviz/component-echarts-base`:** Despite living in `components/`, this package is built by `build:packages` and excluded from `build:components` — it's a shared library, not a standalone component. The rename moves it to `packages/pages-echarts-base/` to match its actual role.

**Internal class renames** (within `@casehub/pages-iframe-api`):
- `MelvizComponentController` → `PagesComponentController`
- `MelvizComponentDispatcher` → `PagesComponentDispatcher`

### Folder naming convention deviation

The `pages-` prefix on all package folders (e.g. `pages-data/`, `pages-ui/`) diverges from the maven-submodule-folder-naming protocol which says "short, no repo prefix" (e.g. `api/` not `casehub-work-api/`). This is a deliberate deviation: Maven repos have each module in its own repo directory where `api/` is unambiguous. A Yarn monorepo puts all packages under `packages/`, where `data/` or `ui/` alone is meaningless. The `pages-` prefix serves the same disambiguation function as the parent directory path does in Maven repos.

## GWT Core Removal from Build

The Java/GWT core (`core/`) is no longer a build participant. The TypeScript runtime (`@casehub/pages-runtime` via `loadSite()`) has fully replaced the GWT entry point.

**Changes:**
- Remove `"core/"` from root `package.json` workspaces array
- Remove the GWT copy from `webapp/webpack.config.js` (the `from: ../core/melviz-webapp-parent/...` block)
- Remove `build:core` and `build:core:prod` scripts from root `package.json`
- Remove `build:core` from the `build:prod` script chain
- Move `core/` to `_legacy/` — files stay on disk as reference, audit and delete via follow-up issue (#36)

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

**Note:** The `/pages/component/` path embeds a deployment assumption (base path). This is acceptable for current deployment. A future iteration may make this configurable via `SiteOptions` — not addressed in this rename.

**Propagation check:** Before landing the rename, grep all casehub repos for `/melviz/component/` and `melviz-dataset` to confirm no consumer has started using these wire-protocol strings.

**PLATFORM.md wire contract:** The `casehub-pages-dataset` postMessage type must be documented in PLATFORM.md's capability ownership table as a wire contract, so future consumers know it exists and impact analysis of changes covers them.

## Root package.json Updates

### Workspaces array

Remove `"core/"` (GWT removed). Remove redundant explicit entry `"packages/casehub-ui"` — already covered by `"packages/*"` glob.

### Script updates

| Script | Change |
|--------|--------|
| `build:packages` | Replace all workspace names to new `@casehub/pages-*` names. Add `@casehub/pages-runtime` after pages-component, pages-data, pages-ui, pages-viz (fixing the existing gap where runtime was omitted from explicit build order). |
| `build:core` | Remove entirely (GWT removed from build) |
| `build:core:prod` | Remove entirely |
| `build:prod` | Remove `yarn build:core:prod &&` from chain |
| `build:components` | Change to `--include '@casehub/pages-component-*'` — zero excludes needed because only the three standalone iframe components match (shared libraries use different name patterns) |
| `build:webapp` | `@melviz/webapp` → `@casehub/pages-webapp` |
| `build:examples` | `@melviz/examples` → `@casehub/pages-examples` |
| `clean` | Remove `&& cd core && mvn clean || true` |

## Examples Gallery Updates

### Webpack resolve aliases (`examples/webpack.config.js`)

Five aliases need both key (package name) and value (directory path) updates:

| Current Key | Current Value | New Key | New Value |
|-------------|--------------|---------|-----------|
| `@casehub/runtime` | `../packages/casehub-runtime` | `@casehub/pages-runtime` | `../packages/pages-runtime` |
| `@casehub/viz` | `../packages/casehub-viz` | `@casehub/pages-viz` | `../packages/pages-viz` |
| `@casehub/ui` | `../packages/casehub-ui` | `@casehub/pages-ui` | `../packages/pages-ui` |
| `@casehub/component` | `../packages/casehub-component` | `@casehub/pages-component` | `../packages/pages-component` |
| `@casehub/data` | `../packages/core` | `@casehub/pages-data` | `../packages/pages-data` |

### `copy-melviz.js` → `copy-pages.js`

Rename `examples/scripts/copy-melviz.js` to `copy-pages.js`. Update all 7 internal references:
- `targetDir`: `dist/melviz-webapp` → `dist/pages-webapp`
- Console messages: `melviz-webapp` → `pages-webapp`
- Comments: `melviz` → `pages`

Update `examples/package.json` scripts that reference this filename.

## ARC42STORIES.MD Update

The project's architectural record must reflect the rename. Every section (§1–§13) is updated:
- All pre-rename package names (`@casehub/data`, `@casehub/ui`, `@casehub/viz`, `@casehub/component`, `@casehub/runtime`, `@melviz/examples`) → new `@casehub/pages-*` names
- `melviz` in title, descriptions, terminology → `casehub-pages`
- §2 build references: remove GWT mention from `build:prod`
- §3 context diagram: update package names in the loadSite flow

## Cleanup

### `.gitignore`

- Remove lines 141–177 (13 patterns referencing `core/packages/melviz/...` — dead GWT paths since `core/` moves to `_legacy/`)
- Remove `**/.melviz/` pattern (line 141)
- Add `_legacy/` to ignore the preserved reference files

### Stale `package-lock.json`

Delete `examples/package-lock.json` (npm artifact — project uses Yarn 4). Add `package-lock.json` to `.gitignore`.

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
| `build-all.sh` | `REPO_DIR[pages]="../pages"`, `REPO_GH[pages]="casehub-pages"`, build via `yarn install && yarn build`, no upstream DEPS |
| `full-stack-build.yml` | Clone step, `yarn install && yarn build` step, build timing, module list entry, outcome tracking |
| `incremental-full-stack-build.yml` | Clone, SHA calc, cache key, yarn build, dependency chaining to claudony/drafthouse |
| `dashboard.yml` | Add `casehubio/casehub-pages` to REPOS list |
| `pr-dashboard.yml` | Add `casehubio/casehub-pages` to REPOS list |
| `docs/index.html` | Add `'casehub-pages'` to PLATFORM_REPOS array |
| `README.md` | Badge row, module table entry, dependency matrix (annotated as runtime consumption, not build-time) |
| `docs/PLATFORM.md` | Foundation tier entry, capability ownership (including `casehub-pages-dataset` wire contract). Note this is the first non-Maven foundation module (yarn build, independent of Maven reactor). Add runtime consumption pattern section to Cross-Repo Dependency Map — otherwise impact analysis of a pages wire-protocol change misses all consumers. |
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

1. **GWT core removal audit** (#36) — track deleting `_legacy/` (formerly `core/`) once TypeScript runtime feature parity is confirmed complete. The files stay on disk as reference until then.
2. **PLATFORM.md TypeScript module conventions** (#37) — create a protocol for Yarn/npm workspace conventions (folder naming, scope patterns, build ordering) so future TypeScript foundation modules have guidance. The `pages-` prefix deviation documented above is the first instance.
