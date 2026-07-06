# CaseHub Protocols — casehub-pages

| File | Rule Summary | Applies To |
|------|-------------|------------|
| [version-alignment-with-parent.md](version-alignment-with-parent.md) | All module versions must align with casehub-parent | All package.json and pom.xml version declarations |
| [css-design-tokens.md](css-design-tokens.md) | CSS tokens use `--pages-` prefix, OKLCH 12-step scales, eleven categories | All CSS custom property declarations |
| [pages-event-contract.md](pages-event-contract.md) | Application events use single `pages-event` CustomEvent with topic/payload | Inter-component event communication |
| [web-component-strategy.md](web-component-strategy.md) | Lit for interactive UI, vanilla for simple display | All Web Component authoring |
| [dataset-contract.md](dataset-contract.md) | Named datasets expose `DatasetContract` with name, description, shape | All dataset definitions |
| [iframe-message-format.md](iframe-message-format.md) | Iframe messages use ComponentMessage envelope with plain-object properties over postMessage | Iframe components via postMessage |
| [iframe-component-lifecycle.md](iframe-component-lifecycle.md) | Iframe components follow INIT → DATASET lifecycle with configuration error signalling | Iframe components via postMessage |
