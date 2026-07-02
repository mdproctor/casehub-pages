# casehub-pages Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename melviz to casehub-pages, remove GWT from the build, move into the casehub ecosystem, and integrate as a foundation module.

**Architecture:** This is a mechanical rename + ecosystem integration, not a feature build. Each task transforms a slice of the codebase, verified by `yarn build && yarn test` at each stage. The work proceeds inside-out: remove dead code first, rename packages, update source, fix build configs, rewrite docs, move directories, integrate into parent/all, update tooling.

**Tech Stack:** TypeScript 5, Yarn 4.10 workspaces, Webpack 5, Vitest, Jest, GitHub CLI

## Global Constraints

- Every `melviz` and `dashbuilder` string in active code must be purged
- Legacy Java core (`core/`) moves to `_legacy/` — no rename, no build
- No backward compatibility shims — breaking changes cost nothing
- All commits reference issue #24: `Refs #24`
- `yarn build && yarn test` must pass after every task
- Never use `cd <path> && <command>` — use absolute paths or `-C` flags

---

### Task 1: GWT Core Removal and Cleanup

Remove dead GWT code from the build before renaming anything. This reduces the surface area for the rename and eliminates the broken `cd core && mvn` pattern.

**Files:**
- Modify: `package.json` (root)
- Modify: `webapp/webpack.config.js`
- Modify: `.gitignore`
- Move: `core/` → `_legacy/`
- Delete: `examples/package-lock.json`
- Delete: `.github/workflows/ci-java.yml`

- [ ] **Step 1: Remove `core/` from root workspaces and scripts**

In `package.json`, remove `"core/"` from the `workspaces` array. Remove the redundant `"packages/casehub-ui"` entry (already covered by `"packages/*"` glob). Remove `build:core`, `build:core:prod` scripts entirely. Update `build:prod` to remove `yarn build:core:prod &&`. Update `clean` to remove `&& cd core && mvn clean || true`. The workspaces array becomes:

```json
"workspaces": [
  "packages/*",
  "components/*",
  "webapp/",
  "examples/"
],
```

The `build:prod` script becomes:

```
"build:prod": "yarn build:packages && yarn build:components && yarn build:webapp && yarn build:examples"
```

- [ ] **Step 2: Remove GWT copy from webapp webpack**

In `webapp/webpack.config.js`, remove the GWT core copy block (lines 9–13):

```javascript
// Remove this entire block:
copyResources.push({
  from: `../core/melviz-webapp-parent/melviz-webapp/target/melviz-webapp`,
  to: `./`,
});
```

Also remove the `// Melviz Core` comment above it.

- [ ] **Step 3: Move core/ to _legacy/**

```bash
git -C /Users/mdproctor/claude/melviz mv core _legacy
```

- [ ] **Step 4: Clean up .gitignore**

Remove lines 141–177 (the 13 `core/packages/melviz/...` patterns). Remove the `**/.melviz/` pattern. Add `_legacy/` as an ignore entry. These are all dead GWT paths.

- [ ] **Step 5: Delete stale files**

```bash
git -C /Users/mdproctor/claude/melviz rm examples/package-lock.json
git -C /Users/mdproctor/claude/melviz rm .github/workflows/ci-java.yml
```

Add `package-lock.json` to `.gitignore`.

- [ ] **Step 6: Remove @melviz/core-gwt dependency from webapp**

In `webapp/package.json`, remove the `"@melviz/core-gwt": "0.0.0"` devDependency line.

- [ ] **Step 7: Verify build**

```bash
yarn install && yarn build
```

Expected: build completes successfully without GWT. Tests pass.

- [ ] **Step 8: Commit**

```bash
git -C /Users/mdproctor/claude/melviz add -A
git -C /Users/mdproctor/claude/melviz commit -m "refactor: remove GWT core from build, move to _legacy/  Refs #24"
```

---

### Task 2: Rename Shared Library Packages (packages/)

Rename all 10 shared library packages — folder names, `package.json` names, and cross-package `workspace:*` dependencies. This is the largest mechanical task.

**Files (10 folder renames + 10 package.json updates):**
- Rename: `packages/casehub-component` → `packages/pages-component`
- Rename: `packages/core` → `packages/pages-data`
- Rename: `packages/casehub-ui` → `packages/pages-ui`
- Rename: `packages/casehub-viz` → `packages/pages-viz`
- Rename: `packages/casehub-runtime` → `packages/pages-runtime`
- Rename: `packages/melviz-component-api` → `packages/pages-iframe-api`
- Rename: `packages/melviz-component-dev` → `packages/pages-iframe-dev`
- Rename: `packages/webpack-base` → `packages/pages-webpack-base`
- Rename: `packages/tsconfig` → `packages/pages-tsconfig`
- Move: `components/melviz-component-echarts-base` → `packages/pages-echarts-base`

- [ ] **Step 1: Rename all package folders**

Execute each `git mv` command:

```bash
git -C /Users/mdproctor/claude/melviz mv packages/casehub-component packages/pages-component
git -C /Users/mdproctor/claude/melviz mv packages/core packages/pages-data
git -C /Users/mdproctor/claude/melviz mv packages/casehub-ui packages/pages-ui
git -C /Users/mdproctor/claude/melviz mv packages/casehub-viz packages/pages-viz
git -C /Users/mdproctor/claude/melviz mv packages/casehub-runtime packages/pages-runtime
git -C /Users/mdproctor/claude/melviz mv packages/melviz-component-api packages/pages-iframe-api
git -C /Users/mdproctor/claude/melviz mv packages/melviz-component-dev packages/pages-iframe-dev
git -C /Users/mdproctor/claude/melviz mv packages/webpack-base packages/pages-webpack-base
git -C /Users/mdproctor/claude/melviz mv packages/tsconfig packages/pages-tsconfig
git -C /Users/mdproctor/claude/melviz mv components/melviz-component-echarts-base packages/pages-echarts-base
```

- [ ] **Step 2: Update each package.json name field**

For each package, update the `"name"` field:

| File | Old name | New name |
|------|----------|----------|
| `packages/pages-component/package.json` | `@casehubio/component` | `@casehubio/pages-component` |
| `packages/pages-data/package.json` | `@casehubio/data` | `@casehubio/pages-data` |
| `packages/pages-ui/package.json` | `@casehubio/ui` | `@casehubio/pages-ui` |
| `packages/pages-viz/package.json` | `@casehubio/viz` | `@casehubio/pages-viz` |
| `packages/pages-runtime/package.json` | `@casehubio/runtime` | `@casehubio/pages-runtime` |
| `packages/pages-iframe-api/package.json` | `@melviz/component-api` | `@casehubio/pages-iframe-api` |
| `packages/pages-iframe-dev/package.json` | `@melviz/component-dev` | `@casehubio/pages-iframe-dev` |
| `packages/pages-webpack-base/package.json` | `webpack-base` | `@casehubio/pages-webpack-base` |
| `packages/pages-tsconfig/package.json` | `@melviz/tsconfig` | `@casehubio/pages-tsconfig` |
| `packages/pages-echarts-base/package.json` | `@melviz/component-echarts-base` | `@casehubio/pages-echarts-base` |

Also update `description` fields that reference "Melviz" → "CaseHub Pages".

- [ ] **Step 3: Update workspace:* dependency references in all package.json files**

Every `package.json` that declares `workspace:*` dependencies on the old names needs updating. The mappings are:

- `@casehubio/component` → `@casehubio/pages-component`
- `@casehubio/data` → `@casehubio/pages-data`
- `@casehubio/ui` → `@casehubio/pages-ui`
- `@casehubio/viz` → `@casehubio/pages-viz`
- `@casehubio/runtime` → `@casehubio/pages-runtime`
- `@melviz/component-api` → `@casehubio/pages-iframe-api`
- `@melviz/component-dev` → `@casehubio/pages-iframe-dev`
- `@melviz/tsconfig` → `@casehubio/pages-tsconfig`
- `webpack-base` → `@casehubio/pages-webpack-base`
- `@melviz/component-echarts-base` → `@casehubio/pages-echarts-base`

Files to check: every `package.json` in the repo. Key ones:
- `packages/pages-ui/package.json`: `@casehubio/component`, `@casehubio/data` → `@casehubio/pages-component`, `@casehubio/pages-data`
- `packages/pages-viz/package.json`: `@casehubio/data`, `@casehubio/ui` → `@casehubio/pages-data`, `@casehubio/pages-ui`
- `packages/pages-runtime/package.json`: all four `@casehubio/*` deps
- `packages/pages-echarts-base/package.json`: `@melviz/tsconfig` → `@casehubio/pages-tsconfig`
- All component `package.json` files: `@melviz/component-api`, `@melviz/component-dev`, `@melviz/tsconfig`, `webpack-base`

- [ ] **Step 4: Update repository/bugs/homepage URLs**

In every `package.json` that has `repository`, `bugs`, or `homepage` fields pointing to `melviz-org/melviz`, change to `casehubio/casehub-pages`. At least 8 packages have these.

- [ ] **Step 5: Update keywords**

In `examples/package.json`, change keyword `"melviz"` → `"casehub-pages"`.

- [ ] **Step 6: Update tsconfig extends references**

In every `tsconfig.json` that has `"extends": "@melviz/tsconfig/tsconfig.json"`, change to `"@casehubio/pages-tsconfig/tsconfig.json"`. Files:
- `packages/pages-iframe-api/tsconfig.json`
- `packages/pages-iframe-dev/tsconfig.json`  (check — may not exist)
- `packages/pages-echarts-base/tsconfig.json`
- `components/melviz-component-echarts/tsconfig.json` (will be renamed in Task 3)
- `components/melviz-component-llm-prompter/tsconfig.json`
- `components/melviz-component-svg-heatmap/tsconfig.json`

- [ ] **Step 7: Commit**

```bash
git -C /Users/mdproctor/claude/melviz add -A
git -C /Users/mdproctor/claude/melviz commit -m "refactor: rename shared library packages to @casehubio/pages-*  Refs #24"
```

---

### Task 3: Rename Standalone Component Packages (components/)

Rename the three iframe-isolated microfrontend component packages.

**Files (3 folder renames + 3 package.json updates):**
- Rename: `components/melviz-component-echarts` → `components/pages-component-echarts`
- Rename: `components/melviz-component-llm-prompter` → `components/pages-component-llm-prompter`
- Rename: `components/melviz-component-svg-heatmap` → `components/pages-component-svg-heatmap`

- [ ] **Step 1: Rename component folders**

```bash
git -C /Users/mdproctor/claude/melviz mv components/melviz-component-echarts components/pages-component-echarts
git -C /Users/mdproctor/claude/melviz mv components/melviz-component-llm-prompter components/pages-component-llm-prompter
git -C /Users/mdproctor/claude/melviz mv components/melviz-component-svg-heatmap components/pages-component-svg-heatmap
```

- [ ] **Step 2: Update package.json name fields**

| File | Old name | New name |
|------|----------|----------|
| `components/pages-component-echarts/package.json` | `@melviz/component-echarts` | `@casehubio/pages-component-echarts` |
| `components/pages-component-llm-prompter/package.json` | `@melviz/component-llm-prompter` | `@casehubio/pages-component-llm-prompter` |
| `components/pages-component-svg-heatmap/package.json` | `@melviz/component-svg-heatmap` | `@casehubio/pages-component-svg-heatmap` |

Update dependency references to `@casehubio/pages-iframe-api`, `@casehubio/pages-iframe-dev`, `@casehubio/pages-tsconfig`, `@casehubio/pages-webpack-base` in each. Update repository/bugs/homepage URLs to `casehubio/casehub-pages`.

- [ ] **Step 3: Update webapp/package.json dependencies**

Update the three devDependency references:

```
"@melviz/component-echarts": "0.0.0" → "@casehubio/pages-component-echarts": "0.0.0"
"@melviz/component-llm-prompter": "0.0.0" → "@casehubio/pages-component-llm-prompter": "0.0.0"
"@melviz/component-svg-heatmap": "0.0.0" → "@casehubio/pages-component-svg-heatmap": "0.0.0"
```

- [ ] **Step 4: Update webapp and examples package names**

In `webapp/package.json`: `"name": "@melviz/webapp"` → `"@casehubio/pages-webapp"`. Update repository/bugs URLs.

In `examples/package.json`: `"name": "@melviz/examples"` → `"@casehubio/pages-examples"`. Update dependency `"@casehubio/runtime": "workspace:*"` → `"@casehubio/pages-runtime": "workspace:*"`.

- [ ] **Step 5: Update root package.json**

Change `"name": "melviz"` → `"casehub-pages"`. Update `"description"` and `"repository"` URL.

- [ ] **Step 6: Commit**

```bash
git -C /Users/mdproctor/claude/melviz add -A
git -C /Users/mdproctor/claude/melviz commit -m "refactor: rename component packages to @casehubio/pages-component-*  Refs #24"
```

---

### Task 4: Source Code Renames (Classes, Wire Protocol, Imports)

Rename TypeScript class names, wire protocol strings, iframe paths, and import references.

**Files:**
- Modify: `packages/pages-iframe-api/src/controller/MelvizComponentController.ts` (rename file + class)
- Modify: `packages/pages-iframe-api/src/controller/MelvizComponentDispatcher.ts` (rename file + class)
- Modify: `packages/pages-iframe-api/src/ComponentApi.ts` (update imports + references)
- Modify: `packages/pages-iframe-api/src/controller/index.ts` (update exports)
- Modify: `packages/pages-data/src/dataset/external/types.ts` (wire protocol)
- Modify: `packages/pages-data/src/dataset/external/providers/post-message.ts` (wire protocol)
- Modify: `packages/pages-viz/src/components/PagesIframePlugin.ts` (iframe path)
- Modify: `packages/pages-viz/src/components/PagesIframePlugin.test.ts` (test assertions)
- Modify: `packages/pages-iframe-api/src/controller/ComponentController.ts` (JSDoc)
- Modify: `packages/pages-iframe-api/src/controller/InternalComponentListener.ts` (JSDoc)

- [ ] **Step 1: Rename MelvizComponentController class and file**

Rename the file:
```bash
git -C /Users/mdproctor/claude/melviz mv packages/pages-iframe-api/src/controller/MelvizComponentController.ts packages/pages-iframe-api/src/controller/PagesComponentController.ts
```

In the renamed file, change `class MelvizComponentController` → `class PagesComponentController`. Update all internal references.

- [ ] **Step 2: Rename MelvizComponentDispatcher class and file**

```bash
git -C /Users/mdproctor/claude/melviz mv packages/pages-iframe-api/src/controller/MelvizComponentDispatcher.ts packages/pages-iframe-api/src/controller/PagesComponentDispatcher.ts
```

Change `class MelvizComponentDispatcher` → `class PagesComponentDispatcher`.

- [ ] **Step 3: Update ComponentApi.ts imports**

Change imports and references in `packages/pages-iframe-api/src/ComponentApi.ts`:

```typescript
import { PagesComponentController } from "./controller/PagesComponentController";
import { PagesComponentDispatcher } from "./controller/PagesComponentDispatcher";
```

Update the constructor to use the new class names:
```typescript
this.controller = new PagesComponentController(this.bus);
this.listener = new PagesComponentDispatcher(this.bus, this.controller);
```

- [ ] **Step 4: Update controller/index.ts exports**

Update the export to reference the new file names.

- [ ] **Step 5: Rename wire protocol type**

In `packages/pages-data/src/dataset/external/types.ts`:
- `MelvizDataMessage` → `PagesDataMessage`
- `type: "melviz-dataset"` → `type: "casehub-pages-dataset"`

In `packages/pages-data/src/dataset/external/providers/post-message.ts`:
- Update the import: `MelvizDataMessage` → `PagesDataMessage`
- `msg.type === "melviz-dataset"` → `msg.type === "casehub-pages-dataset"`
- `const msg = event.data as MelvizDataMessage` → `const msg = event.data as PagesDataMessage`

- [ ] **Step 6: Rename iframe component path**

In `packages/pages-viz/src/components/PagesIframePlugin.ts`:
- Line 29: `` `/melviz/component/${props.componentId}/index.html` `` → `` `/pages/component/${props.componentId}/index.html` ``
- Line 62: same change

- [ ] **Step 7: Update test assertions**

In `packages/pages-viz/src/components/PagesIframePlugin.test.ts`:
- All 6 assertions containing `/melviz/component/` → `/pages/component/`

- [ ] **Step 8: Update JSDoc comments**

In `packages/pages-iframe-api/src/controller/ComponentController.ts` and `InternalComponentListener.ts`, replace any `melviz` references in JSDoc strings with `casehub-pages`.

- [ ] **Step 9: Verify build and tests**

```bash
yarn install && yarn build && yarn test
```

Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git -C /Users/mdproctor/claude/melviz add -A
git -C /Users/mdproctor/claude/melviz commit -m "refactor: rename classes, wire protocol, and iframe paths  Refs #24"
```

---

### Task 5: Build Config and Script Updates

Update root build scripts, webpack configs, examples gallery, and CI workflows.

**Files:**
- Modify: `package.json` (root — scripts)
- Modify: `webapp/webpack.config.js` (component paths)
- Modify: `examples/webpack.config.js` (resolve aliases, UMD name)
- Rename: `examples/scripts/copy-melviz.js` → `examples/scripts/copy-pages.js`
- Modify: `examples/src/setup.js` (global namespace)
- Modify: `examples/src/casehub-entry.ts` (import paths)
- Modify: `examples/package.json` (script references)
- Modify: `.github/workflows/build-publish-webapp.yml` (remove Java, rename artifacts)

- [ ] **Step 1: Update root build scripts**

In root `package.json`, update all scripts:

`build:packages`: Replace all 7+1 workspace names with new names. Add `@casehubio/pages-runtime` after the four packages it depends on:

```
"build:packages": "yarn workspace @casehubio/pages-iframe-api run build && yarn workspace @casehubio/pages-echarts-base run build && yarn workspace @casehubio/pages-iframe-dev run build && yarn workspace @casehubio/pages-component run build && yarn workspace @casehubio/pages-data run build && yarn workspace @casehubio/pages-ui run build && yarn workspace @casehubio/pages-viz run build && yarn workspace @casehubio/pages-runtime run build"
```

`build:components`:
```
"build:components": "yarn workspaces foreach -Apt --include '@casehubio/pages-component-*' run build"
```

Zero excludes — the `pages-component-*` glob matches only the three standalone components.

`build:webapp`: `"yarn workspace @casehubio/pages-webapp run build"`
`build:examples`: `"yarn workspace @casehubio/pages-examples run build"`

- [ ] **Step 2: Update webapp/webpack.config.js component paths**

The `components` array and `copyResources` loop need updating:

```javascript
const components = ["echarts", "llm-prompter", "svg-heatmap"];
const copyResources = [];

components.forEach((component) => {
  copyResources.push({
    from: `../components/pages-component-${component}/dist/`,
    to: `./pages/component/${component}/`,
  });
});
```

Note the output path changes from `./melviz/component/` to `./pages/component/`.

- [ ] **Step 3: Update examples/webpack.config.js**

Update the 5 resolve aliases:
```javascript
alias: {
  "@casehubio/pages-runtime": path.resolve(__dirname, "../packages/pages-runtime"),
  "@casehubio/pages-viz": path.resolve(__dirname, "../packages/pages-viz"),
  "@casehubio/pages-ui": path.resolve(__dirname, "../packages/pages-ui"),
  "@casehubio/pages-component": path.resolve(__dirname, "../packages/pages-component"),
  "@casehubio/pages-data": path.resolve(__dirname, "../packages/pages-data"),
},
```

Update the UMD library name:
```javascript
library: {
  name: "casehubPages",
  type: "umd",
},
```

Update the entry point name if desired: `"casehub-bundle"` can stay (it's already casehub-branded).

- [ ] **Step 4: Rename copy-melviz.js to copy-pages.js**

```bash
git -C /Users/mdproctor/claude/melviz mv examples/scripts/copy-melviz.js examples/scripts/copy-pages.js
```

In `examples/scripts/copy-pages.js`, update all 7 references:
- `targetDir`: `'../dist/melviz-webapp'` → `'../dist/pages-webapp'`
- Console messages: `'melviz-webapp'` → `'pages-webapp'`
- Final message: `'Melviz webapp copied...'` → `'Pages webapp copied...'`

In `examples/package.json`, update any script that references `copy-melviz.js` → `copy-pages.js`.

- [ ] **Step 5: Update examples/src/setup.js**

```javascript
casehubPages = { allowExternal: true, mode: "CLIENT" };
```

- [ ] **Step 6: Update examples/src/casehub-entry.ts**

```typescript
import "@casehubio/pages-viz";
import { loadSite } from "@casehubio/pages-runtime";
import type { LiveSite, SiteOptions } from "@casehubio/pages-runtime";

export { loadSite };
export type { LiveSite, SiteOptions };
```

- [ ] **Step 7: Rewrite build-publish-webapp.yml**

Remove the JDK setup step (lines 35–40) and the Java build step (lines 51–58). Rename artifact references:
- `melviz-webapp.zip` → `pages-webapp.zip`
- `melviz-webapp.zip.sha256` → `pages-webapp.zip.sha256`
- artifact name `melviz-webapp` → `pages-webapp`

- [ ] **Step 8: Verify build**

```bash
yarn install && yarn build && yarn test
```

- [ ] **Step 9: Commit**

```bash
git -C /Users/mdproctor/claude/melviz add -A
git -C /Users/mdproctor/claude/melviz commit -m "refactor: update build scripts, webpack configs, CI workflows  Refs #24"
```

---

### Task 6: Documentation Rewrite

Rewrite README, update ARC42STORIES, update both CLAUDE.md files.

**Files:**
- Rewrite: `README.md`
- Modify: `ARC42STORIES.MD`
- Rewrite: `CLAUDE.md` (project)

- [ ] **Step 1: Rewrite README.md**

Full rewrite reflecting the TypeScript-only architecture. Must cover:
- Project name and description (casehub-pages, web application framework)
- Lineage paragraph (dashbuilder → melviz → casehub-pages)
- Prerequisites: Node 18+, Yarn 4.10 (no Java, no Maven)
- Build commands: `yarn install && yarn build`, `yarn build:prod`
- Architecture: TypeScript-only monorepo — `packages/`, `components/`, `webapp/`, `examples/`
- Data flow: YAML → `@casehubio/pages-ui` (parse) → `@casehubio/pages-data` (resolve) → `@casehubio/pages-component` (layout) → `@casehubio/pages-viz` (render)
- Package list with new names and descriptions
- Standalone iframe components via `@casehubio/pages-iframe-api` postMessage bridge
- `loadSite()` entry point from `@casehubio/pages-runtime`
- How to add a new component (using `pages-component-` naming)
- Key technologies: TypeScript 5, React 17, Webpack 5, ECharts, JSONata, Vitest/Jest
- License

- [ ] **Step 2: Update ARC42STORIES.MD**

Every section (§1–§13):
- Title: `melviz` → `casehub-pages`
- All package names: `@casehubio/data` → `@casehubio/pages-data`, etc.
- `@melviz/examples` → `@casehubio/pages-examples`
- §2: remove GWT mention from `build:prod`
- §3 context diagram: update package names
- Descriptions and terminology: `melviz` → `casehub-pages`

- [ ] **Step 3: Rewrite project CLAUDE.md**

Full rewrite with:
- New project name (`casehub-pages`)
- Correct build commands (no Java/Maven)
- New package names throughout
- New workspace names for per-component builds
- Remove Java Core section
- Update architecture overview
- Update `GitHub repo: mdproctor/casehub-pages` (after move)
- Remove all `melviz-org/melviz` references

- [ ] **Step 4: Commit**

```bash
git -C /Users/mdproctor/claude/melviz add -A
git -C /Users/mdproctor/claude/melviz commit -m "docs: rewrite README, update ARC42STORIES, rewrite CLAUDE.md  Refs #24"
```

---

### Task 7: GitHub Repo Creation and Directory Move

Create the GitHub repos, push history, move local directories, and set up remotes.

**Files:**
- Move: `/Users/mdproctor/claude/melviz/` → `/Users/mdproctor/claude/casehub/pages/`
- Move: `/Users/mdproctor/claude/public/melviz/` → `/Users/mdproctor/claude/public/casehub/pages/`

**Interfaces:**
- Consumes: all code changes from Tasks 1–6 committed
- Produces: repos at new locations with correct remotes

- [ ] **Step 1: Create blessed GitHub repo**

```bash
gh repo create casehubio/casehub-pages --public --description "CaseHub Pages — web application framework"
```

Configure rebase-merge-only via GitHub settings (manual or API).

- [ ] **Step 2: Push full history to blessed**

```bash
git -C /Users/mdproctor/claude/melviz remote add casehub https://github.com/casehubio/casehub-pages.git
git -C /Users/mdproctor/claude/melviz push casehub main --tags
```

- [ ] **Step 3: Fork to mdproctor**

```bash
gh repo fork casehubio/casehub-pages --clone=false
```

- [ ] **Step 4: Move project repo directory**

```bash
mv /Users/mdproctor/claude/melviz /Users/mdproctor/claude/casehub/pages
```

- [ ] **Step 5: Update git remotes**

```bash
git -C /Users/mdproctor/claude/casehub/pages remote remove origin
git -C /Users/mdproctor/claude/casehub/pages remote remove fork
git -C /Users/mdproctor/claude/casehub/pages remote remove casehub
git -C /Users/mdproctor/claude/casehub/pages remote add origin https://github.com/casehubio/casehub-pages.git
git -C /Users/mdproctor/claude/casehub/pages remote add fork https://github.com/mdproctor/casehub-pages.git
git -C /Users/mdproctor/claude/casehub/pages push fork main
```

- [ ] **Step 6: Move workspace repo directory**

```bash
mv /Users/mdproctor/claude/public/melviz /Users/mdproctor/claude/public/casehub/pages
```

- [ ] **Step 7: Update workspace CLAUDE.md**

Rewrite `/Users/mdproctor/claude/public/casehub/pages/CLAUDE.md` with:
- Name: `casehub-pages`
- Project repo: `/Users/mdproctor/claude/casehub/pages`
- Remotes: `origin` = `casehubio/casehub-pages`, `fork` = `mdproctor/casehub-pages`
- All path references updated from `melviz` to `casehub/pages`
- Session Start: `add-dir /Users/mdproctor/claude/casehub/pages` and `add-dir /Users/mdproctor/claude/public/casehub/pages`
- Build commands: new names, no GWT

- [ ] **Step 8: Commit workspace changes**

```bash
git -C /Users/mdproctor/claude/public/casehub/pages add -A
git -C /Users/mdproctor/claude/public/casehub/pages commit -m "chore: rename workspace from melviz to casehub-pages  Refs #24"
```

---

### Task 8: Ecosystem Integration (casehub-parent + casehub-all)

Register casehub-pages in the CaseHub ecosystem CI, documentation, and dashboards.

**Files (in casehub-parent):**
- Modify: `build-all.sh`
- Modify: `.github/workflows/full-stack-build.yml`
- Modify: `.github/workflows/incremental-full-stack-build.yml`
- Modify: `.github/workflows/dashboard.yml`
- Modify: `.github/workflows/pr-dashboard.yml`
- Modify: `docs/index.html`
- Modify: `README.md`
- Modify: `docs/PLATFORM.md`
- Modify: `CLAUDE.md`
- Modify: `aggregator.xml`

**Files (in casehub-all):**
- Modify: `.gitmodules`
- Modify: `CLAUDE.md`
- Modify: `.github/workflows/update-pointers.yml`

- [ ] **Step 1: Update build-all.sh**

Add pages entries:

```bash
REPO_DIR[pages]="../pages"
REPO_GH[pages]="casehub-pages"
```

Add to REPOS array (at the end of foundation tier, before engine). Build command: `yarn install && yarn build` (not mvn). No DEPS (independent foundation).

- [ ] **Step 2: Update full-stack-build.yml**

Add clone step, yarn build step, build timing, module list entry, outcome tracking. Pattern follows ledger but with `yarn` instead of `mvn`.

- [ ] **Step 3: Update incremental-full-stack-build.yml**

Add clone, SHA calc, cache key, yarn build step, dependency chaining (claudony, drafthouse consume pages at runtime).

- [ ] **Step 4: Update dashboard and PR dashboard**

Add `casehubio/casehub-pages` to REPOS lists in both `dashboard.yml` and `pr-dashboard.yml`.

- [ ] **Step 5: Update docs/index.html**

Add `'casehub-pages'` to the `PLATFORM_REPOS` JavaScript array.

- [ ] **Step 6: Update parent README.md**

Add badge row, module table entry, dependency matrix entry (annotated as runtime consumption).

- [ ] **Step 7: Update PLATFORM.md**

Add foundation tier entry for casehub-pages. Document capabilities (web application framework — layouts, data pipelines, component hosting, forms, event bus). Document `casehub-pages-dataset` as a wire contract. Note this is the first non-Maven foundation module. Add runtime consumption pattern to Cross-Repo Dependency Map.

- [ ] **Step 8: Update parent CLAUDE.md**

Add `pages` to core repos list.

- [ ] **Step 9: Update aggregator.xml**

Add comment: `<!-- pages: yarn-only, not a Maven module -->`

- [ ] **Step 10: Update casehub-all .gitmodules**

Add:
```
[submodule "pages"]
    path = pages
    url = https://github.com/casehubio/casehub-pages.git
```

- [ ] **Step 11: Update casehub-all CLAUDE.md**

Add table row: `| pages/ | casehubio/casehub-pages | web application framework, component API, forms |`

- [ ] **Step 12: Update casehub-all update-pointers.yml**

Add `SHA_PAGES` env var and `'pages': 'SHA_PAGES'` entry in POINTERS dict.

- [ ] **Step 13: Commit parent changes**

```bash
git -C /Users/mdproctor/claude/casehub/parent add -A
git -C /Users/mdproctor/claude/casehub/parent commit -m "feat: register casehub-pages as foundation module  Refs casehubio/casehub-pages#24"
```

- [ ] **Step 14: Commit casehub-all changes**

```bash
git -C /Users/mdproctor/claude/casehub/all add -A
git -C /Users/mdproctor/claude/casehub/all commit -m "feat: add casehub-pages submodule  Refs casehubio/casehub-pages#24"
```

---

### Task 9: Claude Memory and IntelliJ Updates

Update Claude project directories and IntelliJ configuration so the tools continue to work from the new path.

**Files:**
- Rename: `~/.claude/projects/-Users-mdproctor-claude-melviz/` → `-Users-mdproctor-claude-casehub-pages/`
- Rename: `~/.claude/projects/-Users-mdproctor-claude-public-melviz/` → `-Users-mdproctor-claude-public-casehub-pages/`
- Modify: memory files in both directories (scan for hardcoded melviz paths)
- Modify: `~/Library/Application Support/JetBrains/IntelliJIdea*/options/recentProjects.xml`

- [ ] **Step 1: Rename Claude project directories**

```bash
mv ~/.claude/projects/-Users-mdproctor-claude-melviz ~/.claude/projects/-Users-mdproctor-claude-casehub-pages
mv ~/.claude/projects/-Users-mdproctor-claude-public-melviz ~/.claude/projects/-Users-mdproctor-claude-public-casehub-pages
```

- [ ] **Step 2: Scan memory files for hardcoded paths**

Check all `.md` files in `~/.claude/projects/-Users-mdproctor-claude-casehub-pages/memory/` for references to `/Users/mdproctor/claude/melviz` and update to `/Users/mdproctor/claude/casehub/pages`. Same for the workspace memory directory.

Also check other workspace memories (e.g. casehub-parent workspace) for melviz references.

- [ ] **Step 3: Update IntelliJ recent projects**

Find the `recentProjects.xml` file:
```bash
find ~/Library/Application\ Support/JetBrains -name "recentProjects.xml" -path "*/IntelliJIdea*"
```

Replace any path containing `/claude/melviz` with `/claude/casehub/pages`.

Alternatively: open the project from the new location in IntelliJ and let it add the entry naturally.

- [ ] **Step 4: Verify**

Open a new Claude Code session from `/Users/mdproctor/claude/casehub/pages` and verify CLAUDE.md loads correctly with the new paths.
