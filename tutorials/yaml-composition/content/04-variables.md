# Variables

When the same value appears in multiple places, changing it means editing every occurrence. Variables let you define a value once and reference it everywhere.

```yaml
variables:
  app:
    name: Sales Dashboard
pages:
  - name: ${app.name}
    components:
      - type: title
        properties:
          text: ${app.name}
```

**How variables work:**
- The `variables` section defines named groups of values
- Reference them with `${prefix.key}` — the prefix is the group name, the key is the value name
- Variables are resolved before the page renders — `${app.name}` becomes `Sales Dashboard`

The variable system is part of yaml-core, a composition layer that works across all CaseHub Playbook YAML formats. Page-level `${name}` (no dot) is a different, older system — yaml-core uses `${prefix.key}` (with a dot) to avoid collisions.

**Watch:** A `variables` section centralizes shared values, and `${app.name}` references replace the hardcoded strings.
