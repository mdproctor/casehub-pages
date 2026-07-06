# CaseHub Protocols — casehub-pages

| File | Rule Summary | Applies To |
|------|-------------|------------|
| [version-alignment-with-parent.md](version-alignment-with-parent.md) | All module versions must align with casehub-parent | All package.json and pom.xml version declarations |
| [css-design-tokens.md](css-design-tokens.md) | CSS tokens use `--pages-` prefix, OKLCH 12-step scales, eleven categories | All CSS custom property declarations |
| [pages-event-contract.md](pages-event-contract.md) | Application events use single `pages-event` CustomEvent with topic/payload | Inter-component event communication |
| [web-component-strategy.md](web-component-strategy.md) | Lit for interactive UI, vanilla for simple display | All Web Component authoring |
| [dataset-contract.md](dataset-contract.md) | Named datasets expose `DatasetContract` with name, description, shape | All dataset definitions |
