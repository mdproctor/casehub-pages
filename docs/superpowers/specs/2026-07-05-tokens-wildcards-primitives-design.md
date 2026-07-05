# Design: Token Normalisation, Wildcard Patterns, and Primitive Push-Down

**Date:** 2026-07-05
**Branch:** `issue-112-tokens-wildcards-primitives`
**Closes:** #114, #116
**Deferred:** #112 (blocks-ui token migration), #118 (TS protocols), #119 (trie-based TopicRegistry), blocks-ui#21 (migration), parent#349 (PLATFORM.md)

---

## 1. Token Normalisation (#112 prep)

### 1.1 Spacing token rename

`--pages-space-0.5` → `--pages-space-0-5`, `--pages-space-1.5` → `--pages-space-1-5`. Dots are valid CSS but non-idiomatic. Hyphens match the rest of the token vocabulary and what blocks-ui already uses.

**Changes:**
- `SPACING_SCALE` keys in `tokens.ts`: `'0.5'` → `'0-5'`, `'1.5'` → `'1-5'`
- `DENSITY_COMPACT_OVERRIDES` in `tokens.ts`: update any affected keys
- `pages-runtime`: update any references to the dot-keyed names

### 1.2 Value comparison test

Generate full CSS from pages-ui-tokens and blocks-ui-core with the same `DEFAULT_THEME` config. Strip `--pages-`/`--blocks-` prefixes and `.pages-theme-`/`.blocks-theme-` class names. Normalise spacing key format (`.` → `-`) to account for the §1.1 rename (`space-0.5` → `space-0-5`). Parse both outputs into property→value maps and assert identical values for every key.

This proves the mathematical colour/spacing/typography values are identical across systems — the migration is a prefix swap plus a key format normalisation, not a value change. The two spacing keys that change format (`0.5`/`0-5`, `1.5`/`1-5`) produce identical CSS values (`2px`, `6px`).

### 1.3 Coverage test

Hardcode all 47 unique `--blocks-*` CSS custom properties that blocks-ui components reference (extracted from `blocks-ui/app/src/`, `blocks-ui/components/`, `blocks-ui-core/src/`). Assert pages-ui-tokens generates a `--pages-*` equivalent for each.

### 1.4 BlocksTheme

Dropped. `BlocksTheme` is a legacy semantic palette (5 hardcoded hex colours) that predates the OKLCH 12-step system. blocks-ui components switch from `BlocksTheme.colors.primary` to `var(--pages-accent-9)` directly. No pages-side work needed — this is a blocks-ui migration concern (blocks-ui#21).

---

## 2. Wildcard Pattern Matching (#114)

### 2.1 Breaking change to wildcard semantics

Current `*` (trailing, any-depth prefix match) splits into two distinct wildcards:

| Wildcard | Meaning | Constraint |
|---|---|---|
| `*` | Matches exactly one segment | Can appear in any position, multiple times |
| `**` | Matches zero or more segments | Must be the last segment |

**Migration:** current `debate:*` (any depth) becomes `debate:**`. Current `*` (match all) becomes `**`.

### 2.2 Pattern examples

| Pattern | Topic | Match? | Reason |
|---|---|---|---|
| `debate:*` | `debate:abc` | ✅ | One segment after `debate:` |
| `debate:*` | `debate:abc:def` | ✗ | Two segments — `*` matches one only |
| `debate:**` | `debate:abc` | ✅ | Any depth under `debate:` |
| `debate:**` | `debate:abc:def:ghi` | ✅ | Any depth |
| `debate:**` | `debate` | ✅ | Zero extra segments — `**` matches zero or more |
| `a:b:**` | `a` | ✗ | Fewer segments than prefix requires |
| `debate:*:summary` | `debate:abc:summary` | ✅ | Segment-level match |
| `debate:*:summary` | `debate:abc:def:summary` | ✗ | Two segments where `*` expects one |
| `a:*:b:*:c` | `a:x:b:y:c` | ✅ | Multiple single-segment wildcards |
| `*` | `hello` | ✅ | One segment |
| `*` | `hello:world` | ✗ | Two segments |
| `**` | anything | ✅ | Matches all |

### 2.3 Validation rules and algorithm

- `*` can appear in any segment position, multiple times: `a:*:b:*` valid
- `**` must be the last segment: `a:**` valid, `a:**:b` invalid
- Wildcards must be complete segments: `de*bate` invalid
- Null, empty → invalid (unchanged)

**Validation algorithm** — replaces the existing `isValidTopicOrPattern`:

```
function isValidTopicOrPattern(input: String) -> boolean:
  if input is null or empty: return false
  segments = input.split(":")
  for each segment s at index i:
    if s is empty: return false          // consecutive colons or leading/trailing colon
    if s == "**":
      return i == segments.length - 1    // ** must be the last segment
    if s contains "*" and s != "*":
      return false                       // partial wildcard like "de*bate" invalid
  return true
```

### 2.4 Matching algorithm — `TopicRegistry.matches()`

Public static utility on `TopicRegistry`. Used by `connections()`, `matchedTopics()`, and consumer integration code (§2.8).

```
function matches(pattern: String, topic: String) -> boolean:
  patternSegments = pattern.split(":")
  topicSegments = topic.split(":")

  if last segment of patternSegments is "**":
    // Multi-level: prefix segments must match, topic must have ≥ prefix segment count
    // (zero extra segments is valid — ** matches zero or more)
    if topicSegments.length < patternSegments.length - 1:
      return false
    for i in 0..patternSegments.length - 2:
      if patternSegments[i] != "*" and patternSegments[i] != topicSegments[i]:
        return false
    return true

  else:
    // Segment-level: segment counts must be equal
    if patternSegments.length != topicSegments.length:
      return false
    for each segment i:
      if patternSegments[i] == "*": continue
      if patternSegments[i] != topicSegments[i]: return false
    return true
```

### 2.5 Data structures and routing

Unchanged: `exactTopics` (ConcurrentHashMap) for patterns with no wildcards, `wildcardPatterns` for any pattern containing `*` or `**`. The routing test is `pattern.contains("*")` — any pattern containing a wildcard character goes to `wildcardPatterns`.

**Routing changes in `listen()`, `unlisten()`, `removeConnection()`:** `topic.endsWith("*")` becomes `topic.contains("*")`. Mechanical substitution — data structures unchanged, only the routing predicate changes.

**`connections(String topic)` — given a concrete topic being broadcast:**
1. Exact lookup in `exactTopics.get(topic)` (unchanged)
2. For each wildcard pattern, call `matches(pattern, topic)` — replaces the old `topic.startsWith(prefix)` check
3. Union both sets, return `Set.copyOf()`

**`matchedTopics(String pattern)` — given a pattern, find matching exact topics:**
- If pattern contains no wildcards: exact lookup (unchanged)
- Otherwise: iterate `exactTopics.keySet()`, call `matches(pattern, topic)` for each

Matching remains O(n) over wildcard patterns. No trie (deferred to #119 if needed).

### 2.6 Thread safety

Unchanged: `ConcurrentHashMap<String, CopyOnWriteArraySet<String>>`. Data structures don't change, only matching logic.

### 2.7 Client-side alignment

`matchesTopic()` mirrors the server-side `TopicRegistry.matches()`:

```typescript
export function matchesTopic(pattern: string, topic: string): boolean {
  const ps = pattern.split(':');
  const ts = topic.split(':');
  if (ps[ps.length - 1] === '**') {
    if (ts.length < ps.length - 1) return false;
    for (let i = 0; i < ps.length - 1; i++) {
      if (ps[i] !== '*' && ps[i] !== ts[i]) return false;
    }
    return true;
  }
  if (ps.length !== ts.length) return false;
  for (let i = 0; i < ps.length; i++) {
    if (ps[i] === '*') continue;
    if (ps[i] !== ts[i]) return false;
  }
  return true;
}
```

`matchesTopic` is re-exported from pages-data's public API so that pages-component can import it for `onPagesEvent` filtering (§3.1).

`isMatchedByRegistrations()` uses `matchesTopic()`:

```typescript
export function isMatchedByRegistrations(topic: string, registrations: Set<string>): boolean {
  for (const reg of registrations) {
    if (matchesTopic(reg, topic)) return true;
  }
  return false;
}
```

The reconnect logic in `onopen` also updates: `!reg.endsWith("*")` becomes `!reg.includes("*")` for Phase 1 seeding.

### 2.8 Server-side integration pattern update

The prior spec's §3.5 integration pattern uses `endsWith("*")` and `startsWith(prefix)` for wildcard replay expansion. With the new segment-level semantics, consumers update to use `TopicRegistry.matches()`:

```java
for (String topicOrPattern : l.topics()) {
    if (topicOrPattern.contains("*")) {
        for (String stored : eventStore.topics()) {
            if (TopicRegistry.matches(topicOrPattern, stored)) {
                replayTargets.putIfAbsent(stored, 0L);
            }
        }
    }
}
```

This replaces the manual `endsWith("*")` + `startsWith(prefix)` logic. The change is documented in §11 (Breaking Changes).

---

## 3. Pages Event Helpers → `pages-component` (#116 item 2)

### 3.1 API

```typescript
// packages/pages-component/src/events.ts

interface PagesEventDetail<T = unknown> {
  readonly topic: string;
  readonly payload: T;
}

function emitPagesEvent<T>(target: EventTarget, topic: string, payload: T): void
// Dispatches CustomEvent('pages-event') with { bubbles: true, composed: true }

function onPagesEvent<T>(target: EventTarget, topicOrPattern: string, handler: (payload: T) => void): () => void
// Registers filtered listener, returns unsubscribe function
// Supports wildcard patterns via matchesTopic() (imported from pages-data):
//   onPagesEvent(el, "debate:**", handler) — matches concrete topics like "debate:abc"
//   onPagesEvent(el, "debate:abc", handler) — exact match (common case)
```

### 3.2 No circular dependency

`pages-data/push-wire.ts` keeps its own `dispatchWireEvent` (3-line function, internal plumbing). The helpers in `pages-component` are the component-author API. No `pages-data` → `pages-component` dependency introduced.

Both functions create the same `CustomEvent('pages-event', { bubbles: true, composed: true, detail: { topic, payload } })` shape. Unifying them would require `pages-data` → `pages-component`, reversing the dependency direction. The 3-line duplication is the correct cost of maintaining proper dependency flow.

---

## 4. A11y Mixins → `pages-primitives` (#116 item 3)

### 4.1 New package: `pages-primitives`

A standalone Lit web component library for the pages ecosystem. Contains a11y mixins, form components (§5), and UI primitives (§7). Its sole runtime dependency is `lit@^3.3.3` — no pages packages required. Components use `--pages-*` CSS custom properties by convention.

This separation keeps `pages-component` framework-agnostic (vanilla TypeScript: layout rendering, type model, context system, event helpers) while giving Lit-dependent primitives their own clean dependency tree. Consumers who need only layout/model import `pages-component`; consumers who need Lit primitives import `pages-primitives`.

### 4.2 Four mixins

| Mixin | Purpose | Lit features used |
|---|---|---|
| `RovingTabindexMixin` | Arrow key navigation in focusable containers | `@state` for reactive index |
| `FocusTrapMixin` | Tab/Shift+Tab trapping in modals | Lifecycle hooks only |
| `KeyboardShortcutMixin` | Register keyboard shortcuts with descriptions | Lifecycle hooks only |
| `LiveRegionMixin` | Manage `aria-live` regions for screen readers | Lifecycle hooks only |

`RovingTabindexMixin` requires two abstract properties:

```typescript
abstract rovingSelector: string;
abstract rovingDirection: 'horizontal' | 'vertical' | 'both';
```

Key mapping per direction (following WAI-ARIA Authoring Practices):
- `horizontal`: ArrowLeft → prev, ArrowRight → next, Home, End
- `vertical`: ArrowUp → prev, ArrowDown → next, Home, End
- `both`: all four arrow keys + Home, End

Pattern: `class MyComponent extends FocusTrapMixin(RovingTabindexMixin(LitElement)) { ... }`

### 4.3 File structure

```
packages/pages-primitives/src/a11y/
  index.ts
  roving-tabindex.ts
  focus-trap.ts
  keyboard-shortcut.ts
  live-region.ts
```

### 4.4 Test dependencies

Add `@open-wc/testing` as dev dependency.

---

## 5. SchemaForm → `pages-primitives` (#116 item 5)

### 5.1 Components

- `PagesSchemaForm` (`<pages-schema-form>`) — Lit custom element rendering forms from JSON Schema
- `field-registry.ts` — `registerFieldRenderer(format, component)` extensibility point
- `field-renderers.ts` — built-in renderers (string, number, boolean, enum, array)

### 5.2 Events

- `pages-schema-form-change`: `{ key, value, data }`
- `pages-schema-form-submit`: `{ data }`

### 5.3 File structure

```
packages/pages-primitives/src/schema-form/
  index.ts
  schema-form.ts
  field-registry.ts
  field-renderers.ts
```

---

## 6. DatasetContract → `pages-data` (#116 item 6)

```typescript
// packages/pages-data/src/dataset/contract.ts
export interface DatasetContract<T = unknown> {
  readonly name: string;
  readonly description: string;
  readonly shape: T;
}
```

Re-exported from the `types.ts` barrel. `pages-data` is the correct home as the lowest common dependency accessible to both component authors (who declare contracts via `static contract: DatasetContract<T>`) and the runtime (which matches contracts to available datasets). The type describes dataset shape expectations — semantically part of the dataset vocabulary.

---

## 7. New UI Primitives (#116 item 7)

### 7.1 Filter Chip Bar (`<pages-filter-chips>`)

Horizontal bar of toggle chips. Multi-select. Each chip renders its label and count: `Label (N)`. Chips with `count === 0` are visually disabled (greyed, not clickable).

```typescript
interface ChipItem {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}

@customElement('pages-filter-chips')
class PagesFilterChips extends LitElement {
  @property({ type: Array }) items: ChipItem[]
  @property({ type: Array }) selected: string[]
  @property({ type: Boolean }) disabled: boolean
  // Emits 'pages-filter-chips-change' with { selected: string[] }
}
```

Composes with `RovingTabindexMixin` (direction: `horizontal`) for keyboard navigation. Uses `--pages-*` tokens.

### 7.2 Scope Selector (`<pages-scope-selector>`)

Horizontal bar of single-select radio pills with optional badge.

```typescript
interface ScopeItem {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly badge?: string;
}

@customElement('pages-scope-selector')
class PagesScopeSelector extends LitElement {
  @property({ type: Array }) items: ScopeItem[]
  @property({ type: String }) selected: string | null
  @property({ type: Boolean }) allowDeselect: boolean
  // Emits 'pages-scope-change' with { selected: string | null }
}
```

Composes with `RovingTabindexMixin` (direction: `horizontal`). Uses `--pages-*` tokens.

### 7.3 File structure

```
packages/pages-primitives/src/primitives/
  index.ts
  filter-chips.ts
  scope-selector.ts
```

### 7.4 Own events, not `pages-event`

These components emit typed component-level events (`pages-filter-chips-change`, `pages-scope-change`), not generic `pages-event`. `pages-event` is for inter-panel communication; these are form input events.

---

## 8. EventConnection Enhancements

### 8.1 Status enum

```typescript
type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

interface EventConnection {
  // existing API unchanged
  readonly connected: boolean;
  // new
  readonly status: ConnectionStatus;
}
```

Transitions: `disconnected` → `connected` (onopen), `connected` → `reconnecting` (onclose non-permanent), `reconnecting` → `connected` (reconnect success), `* → disconnected` (close() or code ≥ 4000).

### 8.2 EventConnectionOptions

```typescript
interface EventConnectionOptions {
  readonly config?: PushSourceConfig;
  readonly batchEvents?: boolean;  // default false
  readonly onStatusChange?: (status: ConnectionStatus) => void;
}
```

`onStatusChange` is a constructor option — guaranteed to be present before the first connection attempt. This eliminates the race between `createEventConnection()` and setting a callback, where status transitions could be missed.

When `batchEvents` is `true`, `pages-event` dispatches are queued and flushed once per `requestAnimationFrame`. Opt-in performance optimisation for high-frequency streams.

### 8.3 SSEManager

Dropped. Not migrated. Connection sharing, exponential backoff, and status tracking are all covered by `EventConnection` and `PushPool`.

---

## 9. Package Structure Summary

| Package | Gains | New dependency |
|---|---|---|
| `pages-ui-tokens` | Spacing rename, comparison + coverage tests | — |
| `pages-data` | `DatasetContract`, `ConnectionStatus`, rAF batching | — |
| `pages-component` | Event helpers | — |
| `pages-primitives` | A11y mixins, SchemaForm, filter chips, scope selector | `lit@^3.3.3` |
| `backend/push` | Segment-level + multi-level wildcard matching | — |

New package: `pages-primitives` — standalone Lit web component library. Depends only on Lit; uses `--pages-*` CSS custom properties by convention. Keeps `pages-component` framework-agnostic.

All new code follows version alignment protocol (PP-20260705-8fcb31): packages stay at 0.2.0, Maven modules at 0.2-SNAPSHOT.

---

## 10. Deferred Items (captured as issues)

| Issue | Description |
|---|---|
| casehubio/casehub-pages#112 | blocks-ui migration from `--blocks-*` to `--pages-*` tokens |
| casehubio/casehub-pages#118 | Establish TypeScript/pages protocols in garden |
| casehubio/casehub-pages#119 | Trie-based TopicRegistry optimisation |
| casehubio/blocks-ui#21 | blocks-ui migration to pages-* packages |
| casehubio/parent#349 | PLATFORM.md capability entry update |

---

## 11. Breaking Changes

| Change | Previous | New | Affected code |
|---|---|---|---|
| Wildcard semantics | Trailing `*` = any-depth prefix match | `*` = single segment, `**` = zero or more segments | All `listen()` calls using `*` patterns |
| `isValidTopicOrPattern` | Rejects mid-position wildcards | Accepts `*` in any position, `**` as last segment | Validation callers |
| `isMatchedByRegistrations` | Prefix matching (`endsWith("*")` + `startsWith`) | Segment-level matching via `matchesTopic()` | Reconnect replay logic |
| Reconnect wildcard detection | `!reg.endsWith("*")` | `!reg.includes("*")` | EventConnection `onopen` handler |
| `EventConnection` interface | `onStatusChange?` as mutable property | Removed — moved to `EventConnectionOptions` | Status change listeners |
| `createEventConnection` | `(url, config?)` | `(url, options?: EventConnectionOptions)` | All `createEventConnection()` call sites |
| Wildcard migration | `debate:*` = any depth | `debate:**` = any depth, `debate:*` = one segment | All existing wildcard patterns |
| Server-side integration | `endsWith("*")` + `startsWith(prefix)` | `TopicRegistry.matches(pattern, topic)` | Consumer WebSocket endpoints with replay |

All changes are in-place — no compatibility aliases, no shims, no gradual migration path.

---

## 12. Files

### §1 Token Normalisation

| File | Change |
|---|---|
| `packages/pages-ui-tokens/src/tokens.ts` | Rename `'0.5'`→`'0-5'`, `'1.5'`→`'1-5'` in SPACING_SCALE and DENSITY_COMPACT_OVERRIDES |
| `packages/pages-ui-tokens/src/tokens.test.ts` | New — value comparison test and coverage test |

### §2 Wildcard Pattern Matching

| File | Change |
|---|---|
| `backend/push/src/main/java/io/casehub/pages/push/TopicRegistry.java` | New `matches()` static, updated `isValidTopicOrPattern()`, routing, `connections()`, `matchedTopics()` |
| `backend/push/src/test/java/io/casehub/pages/push/TopicRegistryTest.java` | Segment-level and multi-level wildcard tests |
| `packages/pages-data/src/dataset/external/sources/event-connection.ts` | New `matchesTopic()`, updated `isMatchedByRegistrations()`, reconnect `onopen` |
| `packages/pages-data/src/dataset/external/sources/event-connection.test.ts` | Wildcard matching tests |
| `packages/pages-data/src/dataset/external/index.ts` | Re-export `matchesTopic` for pages-component import |

### §3 Event Helpers

| File | Change |
|---|---|
| `packages/pages-component/src/events.ts` | New — `emitPagesEvent`, `onPagesEvent`, `PagesEventDetail` |
| `packages/pages-component/src/events.test.ts` | New — event dispatch and wildcard filtering tests |
| `packages/pages-component/src/index.ts` | Add events re-export |

### §4–§5–§7 pages-primitives (new package)

| File | Change |
|---|---|
| `packages/pages-primitives/package.json` | New — `lit@^3.3.3` dependency, `@open-wc/testing` devDependency |
| `packages/pages-primitives/tsconfig.json` | New |
| `packages/pages-primitives/tsconfig.build.json` | New |
| `packages/pages-primitives/src/index.ts` | New — barrel re-exports |
| `packages/pages-primitives/src/a11y/index.ts` | New |
| `packages/pages-primitives/src/a11y/roving-tabindex.ts` | New — with `rovingDirection` property |
| `packages/pages-primitives/src/a11y/roving-tabindex.test.ts` | New |
| `packages/pages-primitives/src/a11y/focus-trap.ts` | New |
| `packages/pages-primitives/src/a11y/keyboard-shortcut.ts` | New |
| `packages/pages-primitives/src/a11y/live-region.ts` | New |
| `packages/pages-primitives/src/schema-form/index.ts` | New |
| `packages/pages-primitives/src/schema-form/schema-form.ts` | New — `<pages-schema-form>` |
| `packages/pages-primitives/src/schema-form/field-registry.ts` | New |
| `packages/pages-primitives/src/schema-form/field-renderers.ts` | New |
| `packages/pages-primitives/src/schema-form/schema-form.test.ts` | New |
| `packages/pages-primitives/src/primitives/index.ts` | New |
| `packages/pages-primitives/src/primitives/filter-chips.ts` | New — `<pages-filter-chips>` |
| `packages/pages-primitives/src/primitives/filter-chips.test.ts` | New |
| `packages/pages-primitives/src/primitives/scope-selector.ts` | New — `<pages-scope-selector>` |
| `packages/pages-primitives/src/primitives/scope-selector.test.ts` | New |
| `package.json` (root) | Add `pages-primitives` to workspaces |

### §6 DatasetContract

| File | Change |
|---|---|
| `packages/pages-data/src/dataset/contract.ts` | New — `DatasetContract<T>` interface |
| `packages/pages-data/src/dataset/types.ts` | Add re-export |

### §8 EventConnection Enhancements

| File | Change |
|---|---|
| `packages/pages-data/src/dataset/external/sources/event-connection.ts` | `ConnectionStatus` type, `EventConnectionOptions`, status tracking, rAF batching |
| `packages/pages-data/src/dataset/external/sources/event-connection.test.ts` | Status transition and batching tests |
