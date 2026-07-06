# Protocols — casehub-pages

## CaseHub Platform

| File | Rule Summary | Applies To |
|------|-------------|------------|
| [casehub/version-alignment-with-parent.md](casehub/version-alignment-with-parent.md) | All module versions must align with casehub-parent | All package.json and pom.xml version declarations |
| [casehub/css-design-tokens.md](casehub/css-design-tokens.md) | CSS tokens use `--pages-` prefix, OKLCH 12-step scales, eleven categories | All CSS custom property declarations |
| [casehub/pages-event-contract.md](casehub/pages-event-contract.md) | Application events use single `pages-event` CustomEvent with topic/payload | Inter-component event communication |
| [casehub/web-component-strategy.md](casehub/web-component-strategy.md) | Lit for interactive UI, vanilla for simple display | All Web Component authoring |
| [casehub/dataset-contract.md](casehub/dataset-contract.md) | Named datasets expose `DatasetContract` with name, description, shape | All dataset definitions |

| [casehub/iframe-message-format.md](casehub/iframe-message-format.md) | Iframe messages use ComponentMessage envelope with plain-object properties | Iframe components via postMessage |
| [casehub/iframe-component-lifecycle.md](casehub/iframe-component-lifecycle.md) | Iframe components follow INIT → DATASET lifecycle with config error signalling | Iframe components via postMessage |

See [casehub/INDEX.md](casehub/INDEX.md) for the full listing.
