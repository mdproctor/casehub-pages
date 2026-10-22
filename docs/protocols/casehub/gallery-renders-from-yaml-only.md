---
id: PP-20261018-2420ea
title: "Gallery viewer data must come exclusively from real YAML — no mocks, no invented fields"
type: rule
scope: repo
applies_to: "pages-step-viewer gallery, blocks-ui pattern/eidos gallery — any Rendered/YAML tab section"
cross_repo_consumers: ["casehubio/agency-ui"]
severity: important
refs: []
violation_hint: "Gallery callback transforms parsed YAML with hardcoded values (confidence: 0.9, score: 0.8, rounds: [...]) instead of passing parsed data directly"
created: 2026-10-18
---

Gallery components must render exclusively from real YAML. The Rendered
tab must show exactly what the YAML tab contains — nothing more. If the
YAML does not have data for a field, the component either omits that
visual element or renders an empty state. It does not invent values.

When a mockup design shows a feature that the YAML does not support,
file an issue in the repo that owns the YAML (eidos for descriptors,
blocks for patterns) to enrich the YAML surface. Do not fake the data
in the gallery to make the component look richer than the YAML allows.
