# 0001 — Cross-repo frontend dependency management

Date: 2026-07-27
Status: Accepted

## Context and Problem Statement

CaseHub application repos (aml, openclaw, clinical, etc.) consume frontend packages from casehub-pages and blocks-ui. The dependency mechanism has gone through three iterations, each solving one problem while creating another. A stable, long-term approach is needed that works identically in local development, CI, and releases.

## Decision Drivers

* Must work in CI without sibling checkout hacks
* Must not require manual version bumps on every change during development
* Must support instant resolution of "latest" during active development
* Must still allow external (non-CaseHub) consumers via standard npm
* casehub-pages is a Yarn workspace monorepo — inter-package `file:` / `workspace:` references only resolve inside the workspace

## Considered Options

* **Option A** — Published npm packages with registry versions
* **Option B** — Local `file:` references to sibling repo checkouts
* **Option C** — Maven SNAPSHOT artifacts (WebJar pattern)

## Decision Outcome

Chosen option: **Option C — Maven SNAPSHOT**, because it provides "always latest" ergonomics without manual version bumps, works identically in local dev and CI, and leverages Maven's 20-year-old SNAPSHOT resolution mechanism rather than inventing something new.

Three consumption tiers:

| Boundary | Mechanism | Rationale |
|----------|-----------|-----------|
| Within monorepo (pages or blocks-ui) | Yarn `workspace:*` | Instant linking, hot reload, unchanged |
| Cross-repo (CaseHub apps ← pages/blocks-ui) | Maven SNAPSHOT | Same mechanism everywhere, no path fragility |
| External consumers (non-CaseHub) | Published npm packages | Standard npm registry, unchanged |
| Releases | Maven release artifact + published npm | Stable versions, drop `-SNAPSHOT` |

### Positive Consequences

* One mechanism for cross-repo consumption — local, CI, and staging all use Maven resolution
* No manual version increment ceremony during development
* Standard WebJar pattern — `META-INF/resources/` served automatically by Quarkus
* Maven SNAPSHOT timestamps provide natural ordering without explicit versioning
* Eliminates "works on my machine" class of bugs from path-dependent `file:` resolution

### Negative Consequences / Tradeoffs

* Adds `mvn install` step to local cross-repo development workflow (but `yarn build` was already required)
* Requires a Maven module in casehub-pages and blocks-ui to package the webapp JAR
* Two publishing pipelines to maintain (Maven for CaseHub, npm for external)

## Pros and Cons of the Options

### Option A — Published npm packages

* ✅ Standard npm ecosystem, familiar to frontend developers
* ✅ Works in CI and locally with identical mechanism
* ❌ Requires manual version bump on every change — friction kills velocity
* ❌ Publishing delay between change and availability

### Option B — Local `file:` references

* ✅ Zero-friction local development — no version bumps, no publishing
* ❌ Fundamentally broken in CI — Yarn workspace inter-package `file:` references don't resolve outside the workspace
* ❌ Path-dependent — requires specific repo layout on disk
* ❌ Different mechanism local vs CI means different bugs in each environment

### Option C — Maven SNAPSHOT artifacts

* ✅ No manual version bumps — SNAPSHOT is SNAPSHOT
* ✅ Works identically local (`~/.m2`) and CI (GitHub Maven Packages)
* ✅ Battle-tested pattern (WebJars, 2012+; Maven SNAPSHOT, 20+ years)
* ✅ Quarkus serves `META-INF/resources/` from classpath automatically
* ❌ Extra `mvn install` step for local cross-repo work
* ❌ Maven module needed in npm-centric repos to package the JAR

## Links

* [#246 — publish frontend webapp as Maven SNAPSHOT artifact](https://github.com/casehubio/casehub-pages/issues/246)
* Applies equally to casehubio/agency-ui
* Consumer repos: aml, chat-app, claudony, clinical, devtown, drafthouse, iot, life, openclaw
