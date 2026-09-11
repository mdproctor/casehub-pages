# CaseHub Pages — IntelliJ Plugin

Language intelligence for CaseHub Page YAML, powered by the `pages-lsp` server.

For all five CaseHub YAML formats (Page, CaseDefinition, SWF, HTN, Org), install **CaseHub YAML** from `blocks-ui/plugins/intellij-casehub/` instead — it supersedes this plugin.

## Features

- **Completion** — schema-driven property suggestions, discriminated union narrowing
- **Diagnostics** — YAML syntax errors and schema validation
- **Hover** — property descriptions, types, and allowed values
- **Rename** — symbol rename across files (datasets, components)
- **Find references / Go to definition** — cross-file navigation
- **jq expression intelligence** — syntax validation and path completion in expression fields

## Supported formats

| Extension | Format |
|-----------|--------|
| `*.page.yaml` | Page definitions |
| `*.dash.yaml` | Page definitions (transition) |

## Requirements

- IntelliJ IDEA 2024.2+ (Community or Ultimate)
- [LSP4IJ](https://plugins.jetbrains.com/plugin/23257-lsp4ij) plugin installed
- Node.js 18+ on PATH

## Installation

1. Install the [LSP4IJ](https://plugins.jetbrains.com/plugin/23257-lsp4ij) plugin from the JetBrains Marketplace
2. Build the plugin: `./gradlew buildPlugin`
3. In IntelliJ: Settings → Plugins → gear icon → Install Plugin from Disk
4. Select `build/distributions/casehub-intellij-0.1.0.zip`
5. Restart IntelliJ

## Building

```bash
# Requires JDK 21
JAVA_HOME=/path/to/jdk21 ./gradlew build

# Build distributable ZIP
JAVA_HOME=/path/to/jdk21 ./gradlew buildPlugin

# Verify plugin compatibility
JAVA_HOME=/path/to/jdk21 ./gradlew verifyPlugin
```

The build automatically copies the LSP server bundle from `../../packages/pages-lsp/dist/server-node.bundle.cjs`. Run `yarn workspace @casehubio/pages-lsp run build && yarn workspace @casehubio/pages-lsp run build:bundle` first if the bundle doesn't exist.

## Architecture

The plugin is a thin LSP client shell. All intelligence lives in `pages-lsp`:

```
IntelliJ + LSP4IJ  ←→  stdio  ←→  node server-node.bundle.cjs
    (Kotlin)                          (TypeScript, bundled)
```

The server bundle is extracted from plugin resources to a temp directory on first launch.
