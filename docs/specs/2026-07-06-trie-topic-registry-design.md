# Trie-Based TopicRegistry — Design Spec

**Issue:** #119
**Date:** 2026-07-06
**Status:** Draft

## Context

`TopicRegistry` in `casehub-pages-push` uses two flat maps (`exactTopics`,
`wildcardPatterns`) to store subscriptions. `connections(topic)` linearly
scans all entries in `wildcardPatterns`, calling `matches()` on each.
`matchedTopics(pattern)` does the same over `exactTopics`. Both are O(n)
where n is the number of registered patterns/topics.

Topics are colon-delimited hierarchical strings (e.g. `debate:abc:summary`).
A trie is the natural data structure for this domain — it mirrors the
segment hierarchy directly, unifies the two disjoint maps into one
structure, and replaces O(n) linear scans with O(d) trie walks (where
d is segment depth). The refactor improves algorithmic design regardless
of current load.

## Scope

**In scope:**
- Replace the two `ConcurrentHashMap` fields (`exactTopics`, `wildcardPatterns`)
  with a single trie
- Trie-based lookup replacing O(n) linear scans (see Design for
  per-operation complexity)
- Preserve all existing public API and thread-safety guarantees
- Preserve existing test suite (all tests pass without modification)

**Out of scope:**
- Changing the public API of `TopicRegistry`
- Changing `isValidTopicOrPattern()` or `matches()` static methods
- Exposing the trie as a public class

## Design

### Approach

The trie is a private inner class of `TopicRegistry`. It replaces both
`exactTopics` and `wildcardPatterns` maps. The `connectionToTopics` reverse
index stays — it's needed for `removeConnection()` cleanup.

### Trie node structure

```java
private static final class TrieNode {
    final ConcurrentHashMap<String, TrieNode> children = new ConcurrentHashMap<>();
    final CopyOnWriteArraySet<String> connections = new CopyOnWriteArraySet<>();
    final CopyOnWriteArraySet<String> doubleStarConnections = new CopyOnWriteArraySet<>();
}
```

- `children` — maps segment strings to child nodes. The key `"*"` is a
  valid child representing single-segment wildcard patterns.
- `connections` — connection IDs whose pattern terminates at this node.
- `doubleStarConnections` — connection IDs registered with `**` at this
  position. Stored separately because `**` matches zero or more remaining
  segments — it's a greedy match collected at every level during a walk.

### Insert (`listen`)

Split pattern on `:`. Walk/create nodes for each segment:
- If segment is `**` (always last, enforced by validation): add connection
  ID to `doubleStarConnections` on the current node.
- If segment is `*`: walk to child keyed `"*"` (creating if absent).
- Otherwise: walk to child keyed by the literal segment.
- At the final non-`**` segment: add connection ID to `connections`.

### Remove (`unlisten`)

Split pattern on `:`. Walk the trie segment by segment:
- If segment is `**` (always last): remove the connection ID from
  `doubleStarConnections` on the **current** node — the walk does not
  create a child keyed `**`.
- Otherwise: descend to the child keyed by the segment (literal or `*`).
- At the final non-`**` segment: remove the connection ID from
  `connections`.

The `**` case is asymmetric: the terminal node for a `**` pattern is
the parent of where `**` would be, not a child. This mirrors insert,
which stores the connection in `doubleStarConnections` on the current
node when it encounters `**`.

`removeConnection()` iterates patterns from `connectionToTopics` and
applies this walk to each. The pattern string determines whether to
remove from `connections` (non-`**` terminal) or `doubleStarConnections`
(`**` terminal).

Empty nodes are not pruned — they are reused if a future subscription
walks the same path. See "Memory trade-offs" below for when this may
warrant revisiting.

### Query: `connections(topic)`

Recursive walk collecting connection IDs from all matching patterns:

```
walk(node, segments, depth, result):
    result.addAll(node.doubleStarConnections)

    if depth == segments.length:
        result.addAll(node.connections)
        return

    segment = segments[depth]

    exactChild = node.children.get(segment)
    if exactChild != null:
        walk(exactChild, segments, depth + 1, result)

    starChild = node.children.get("*")
    if starChild != null:
        walk(starChild, segments, depth + 1, result)
```

At each level: collect `**` connections (match everything from here),
then branch into both exact and `*` children if they exist. At the
terminal depth, collect `connections` (exact pattern match).

Complexity: worst case O(2^d) where d = segment depth — at each level
the walk can fork into both exact and `*` children, doubling the branches.
In practice, wildcard patterns are sparse so most levels have only an
exact child, yielding effectively O(d). For typical depths (d = 2–5),
worst case is 4–32 node visits — still dramatically better than O(n)
linear scan over all registered patterns.

### Query: `matchedTopics(pattern)`

Reverse direction — walk the trie with pattern segments, collecting
concrete topic strings from nodes where `connections` is non-empty:

```
walkPattern(node, segments, depth, path, result):
    if depth == segments.length:
        if node.connections is non-empty:
            result.add(join(path, ":"))
        return

    segment = segments[depth]

    if segment == "**":
        collectAllDescendantTopics(node, path, result)
        return

    if segment == "*":
        for each (key, child) in node.children:
            if key != "*":  // only concrete segments
                walkPattern(child, segments, depth + 1, path + key, result)
        return

    exactChild = node.children.get(segment)
    if exactChild != null:
        walkPattern(exactChild, segments, depth + 1, path + segment, result)
```

For `*` segments: visit all concrete children (not the `*` child itself —
we're looking for real topics, not other patterns). For `**`: collect
all topics at and below the current node:

```
collectAllDescendantTopics(node, path, result):
    if node.connections is non-empty:
        result.add(join(path, ":"))
    for each (key, child) in node.children:
        if key != "*":
            collectAllDescendantTopics(child, path + [key], result)
```

Two correctness constraints:
1. The starting node's own `connections` must be checked — `**` matches
   zero or more trailing segments, so the prefix itself is a valid match.
2. Children keyed `"*"` must be skipped — they represent wildcard pattern
   segments, not concrete topics. Including them would report wildcard
   patterns as matched topics.

Complexity differs from `connections()`: the branching factor at `*`
segments is the number of concrete children at that node (not bounded
by 2). For exact segments, only one branch is followed — O(d). For
localized wildcard patterns (e.g. `debate:*`), the walk is bounded by
the matching subtree — better than the current O(n) scan over all
topics. For maximally broad patterns (`**` or `*:*:*`), the walk visits
every matching topic — O(m) where m = matching topics, same as the
current implementation since enumeration is inherent.

### Semantic equivalence invariant

The trie walk must be semantically equivalent to the existing `matches()`
function:
- `connections(topic)` must return exactly the set of connection IDs whose
  registered pattern p satisfies `matches(p, topic) == true`.
- `matchedTopics(pattern)` must return exactly the set of concrete topics t
  satisfying `matches(pattern, t) == true`.

The `matches()` static method is unchanged by this refactor and remains
the canonical definition of matching semantics. The TypeScript
`matchesTopic()` function maintains parity with `matches()` independently
— this invariant is unaffected by the trie refactor since `matches()` is
not modified.

### Thread safety

Same concurrency primitives as the current implementation:
- `ConcurrentHashMap` for children (lock-free reads, segment-level locking on write)
- `CopyOnWriteArraySet` for connection sets (snapshot reads, copy-on-write for adds/removes)

No additional synchronisation needed. The trie is append-mostly — nodes
are created but never removed. Connection sets within nodes are the
mutation surface, and `CopyOnWriteArraySet` handles that safely.

### What stays unchanged

- `isValidTopicOrPattern(String)` — static utility, no trie involvement
- `matches(String pattern, String topic)` — static utility, no trie involvement
- `connectionToTopics` — reverse index for `removeConnection()` cleanup
- All public API signatures and return types
- All existing tests pass without modification

### Memory trade-offs

The trie creates O(d) nodes per registered topic (one per segment) vs
O(1) entries in the current flat maps. After unlisten, empty trie nodes
remain in the tree. If topic paths include dynamic identifiers (e.g.
`debate:abc123:summary` where `abc123` is a session ID), those paths
are unlikely to be reused and accumulate dead nodes.

This is acceptable for the initial implementation:
- Empty nodes are small (~300 bytes: empty ConcurrentHashMap ~64–80
  bytes, 2 empty CopyOnWriteArraySets ~96 bytes each wrapping
  CopyOnWriteArrayList with ReentrantLock, plus object headers)
- The current map-based approach also retains stale empty sets after
  all connections unlisten
- Pruning adds complexity to the concurrent structure (parent pointers
  or recursive emptiness checks) for a benefit that is speculative
  without production load data

If production use reveals high topic churn with dynamic segments,
pruning can be added as a follow-up — check emptiness bottom-up after
removal and CAS-remove empty children.

### Fields after refactor

```java
public final class TopicRegistry {
    private final TrieNode root = new TrieNode();
    private final ConcurrentHashMap<String, Set<String>> connectionToTopics = new ConcurrentHashMap<>();

    // isValidTopicOrPattern() — unchanged
    // matches() — unchanged
    // listen() — inserts into trie instead of exactTopics/wildcardPatterns
    // unlisten() — removes from trie
    // removeConnection() — uses connectionToTopics to find patterns, removes from trie
    // connections() — trie walk instead of linear scan
    // matchedTopics() — trie walk instead of linear scan
}
```

## Testing

All existing tests in `TopicRegistryTest` must pass unchanged — the
refactor is purely internal. The existing suite covers:

- Exact match, single-star, mid-position star, multi-star, double-star
- Zero-segment `**` match (via `matches()` static method)
- Wildcard + exact union
- Listen/unlisten/removeConnection lifecycle
- Concurrent listen/unlisten stress test
- `matchedTopics()` for all pattern types
- Unmodifiable snapshot guarantee

One new test is required — the existing suite does not exercise
`matchedTopics()` with zero-trailing-segment `**`:

```java
@Test
void matchedTopics_double_star_zero_match() {
    var registry = new TopicRegistry();
    registry.listen("c1", List.of("debate"));
    registry.listen("c2", List.of("debate:abc"));
    assertThat(registry.matchedTopics("debate:**"))
        .containsExactlyInAnyOrder("debate", "debate:abc");
}
```

The static `matches("debate:**", "debate")` test covers the matching
logic, but `matchedTopics()` exercises the trie's
`collectAllDescendantTopics` path — a correct-looking implementation
that only visits children (not the starting node) would pass all
existing tests while silently breaking this case.

## Implementation

Single task: rewrite `TopicRegistry` internals from dual-map to trie.
All existing tests serve as the verification suite.
