---
layout: post
title: "The demo that tests itself"
date: 2026-08-12
entry_type: note
subtype: diary
projects: [casehub-pages, casehub-connectors, casehub-platform]
tags: [scenario-engine, demo, verification, platform-convention, yaml]
---

Every CaseHub application has the same problem: you can't demo it without faking half the world. Clinical needs patients, adverse events, a trial protocol, and an IRB review cycle. Life needs bank transactions, WhatsApp messages, calendar events, and a plumber who confirms Thursday at 2pm. IoT needs temperature sensors streaming every ten seconds. None of these external systems exist on a developer's laptop, and none of them should be anywhere near a sales demo with real data.

The solutions so far have been local and brittle. Clinical has a `DemoDataSeeder` that hardcodes synthetic patients into the database at startup. IoT has test-only mocks. AML and life have nothing — you either connect real services or you don't demo.

The interesting realisation is that the demo problem and the verification problem are the same problem. A scripted demo walks through a workflow with synthetic data and checks that the right things happen on screen. An automated verification run walks through the same workflow with the same synthetic data and checks that the right things happen in the backend. Same inputs, same sequence, same assertions — different speed and different output format.

So the scenario format is one YAML file that serves both:

```yaml
- name: plumber-confirms
  action: whatsapp-message
  delivery: simulated
  target: chat
  data:
    from: "Bob's Plumbing"
    text: "Thursday 2pm confirmed"

- name: verify-commitment
  trigger: { after: plumber-confirms }
  await: { event: "commitment-created", timeout: 15000 }
```

In demo mode at 0.5x speed, this plays out visually — the message appears, the system creates a commitment, the audience watches the workflow resolve. In verify mode, the same file runs at 100x, the `await` becomes a JUnit assertion, and CI gets a pass/fail result. One file, two jobs.

Three delivery modes handle everything an enterprise app needs. `rest` makes invisible API calls — bulk data seeding, background state creation. `ui-form` drives the browser — navigating, filling fields, clicking submit — so the audience watches real form interaction. `simulated` fires CDI events through injection endpoints, indistinguishable from a real WhatsApp message or bank transaction arriving. Application code cannot tell the difference, which is the whole point.

Steps aren't a sequential list. They're a trigger graph — a DAG where each step declares what it waits for. Temperature sensors stream continuously from T=0 while a form-fill step waits for the seed data to land. A data trigger polls an endpoint until a condition matches, then fires the next step. The executor builds the dependency graph from the YAML and schedules everything concurrently. Sequential scenarios work fine, but the format doesn't force linearity where the domain doesn't have it.

The platform convention that makes this work across all apps is a build-profile gate. Every connector SPI ships a demo implementation annotated `@Alternative @Priority(300) @IfBuildProfile("demo")`. The `@IfBuildProfile` annotation is a compile-time gate — demo code is not present in production builds. It's not a runtime flag you can accidentally leave on. The demo impl serves bootstrapped data for pull queries and accepts injected events for push scenarios. A shared `DemoCurrentPrincipal` in `casehub-platform-api` reads an `X-Scenario-Actor` header so each step can impersonate a different user without an auth stack.

Three profiles: `demo` for scripted scenarios with all-synthetic data, `dev` for local development with real or dev-tier credentials, `prod` for production with OIDC. The scenario engine requires demo profile. Local development doesn't require the scenario engine. They serve different purposes and the build system enforces the boundary.

Clinical's `DemoDataSeeder` becomes a scenario file. IoT's test mocks become a demo SPI. Every new connector SPI ships with a demo impl from day one — it's in the checklist, not an afterthought. The same YAML file that a sales team uses for a conference demo is the same file that CI runs nightly to verify the integration still works.
