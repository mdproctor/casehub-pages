# casehub-pages

## Project Type

type: custom
**Stage:** pre-release

## Work Tracking

Issue tracking: enabled
GitHub repo: casehubio/casehub-pages

## Repository Role

Web application framework for the CaseHub platform — TypeScript runtime for composing applications from layouts, data pipelines, visualization, forms, hosted components, and inter-component communication.

**Tier:** Integration (UI layer consumed by application-tier repos)

## IntelliJ Plugin

`plugins/intellij/` — Kotlin/Gradle project (not managed by Yarn). Requires JDK 21 and LSP4IJ plugin dependency.

```bash
# Build (requires pages-lsp bundle to exist first)
JAVA_HOME=/path/to/jdk21 plugins/intellij/gradlew -p plugins/intellij buildPlugin

# Verify compatibility
JAVA_HOME=/path/to/jdk21 plugins/intellij/gradlew -p plugins/intellij verifyPlugin
```

## Documentation

This repo owns its own documentation, synced to parent via subtree:
- `docs/guides/consumer-guide.md` — for app builders: web components, data pipelines, layout, push protocol
- `docs/guides/contributor-guide.md` — for contributors: package architecture, build system, extension points

Update the relevant guide in the same session when implementation changes components, APIs, or protocols. Do not defer — drift compounds. Parent (`casehubio/parent`) aggregates these at `docs/repos/casehub-pages/` for RAG retrieval.

## Editor Packages

Three packages provide the editor infrastructure:
- `packages/pages-editor-core/` — `EditableText` interface, `EditableTextBridge` base, MCP tool adapter, edit sessions
- `packages/pages-markdown-editor/` — Milkdown/ProseMirror LIT component with dual-mode (WYSIWYG/source/split), toolbar, annotations
- `packages/pages-document-diff/` — generic LCS diff, word highlights, canvas minimap, scroll sync (extracted from blocks-ui)

`pages-code-editor` extends `EditableTextBridge` from editor-core. `pages-aria` re-exports types from editor-core (deprecated `ScenarioEditableText` alias remains for backward compat).
