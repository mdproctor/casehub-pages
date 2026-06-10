# Filter Model Design — CoreFunctionType + FilterExpression

**Date:** 2026-06-10
**Scope:** Filter type definitions, filter evaluation engine, TimeFrame parser, null CellValue support
**Location:** `packages/core/src/dataset/`
**Parent spec:** `gwt-to-typescript-migration/01-core-engine.md` §3.1

---

## 1. Null CellValue Variant

### Change to `types.ts`

Add a null variant to the existing `CellValue` discriminated union:

```typescript
export type CellValue =
  | { readonly type: ColumnType.TEXT; readonly value: string }
  | { readonly type: ColumnType.NUMBER; readonly value: number }
  | { readonly type: ColumnType.DATE; readonly value: Date }
  | { readonly type: ColumnType.LABEL; readonly value: string }
  | { readonly type: "NULL" };
```

`"NULL"` is a string literal, not a `ColumnType` member. Null is the absence of a typed value, not a column type. `ColumnType` remains a declaration of valid schema types.

The `TypedRow` accessor methods (`number()`, `text()`, `date()`) throw on null cells — the caller must check `cell().type !== "NULL"` first or use `cell()` and pattern-match.

### Change to `DataSet` wire format in `types.ts`

Make the wire format nullable to support clean round-tripping of null cells:

```typescript
export interface DataSet {
  readonly columns: readonly Column[];
  readonly data: readonly (readonly (string | null)[])[];
}
```

This is a breaking change to the `DataSet` interface. All consumers of `DataSet.data` must handle `null` entries.

### Change to `conversion.ts`

**`toTypedDataSet`:** When a raw value is `undefined` or `null`, produce `{ type: "NULL" }` instead of falling through to `parseCell`. Explicit empty string `""` remains a valid value for TEXT/LABEL columns and throws for NUMBER/DATE — this preserves the distinction between "empty string" and "absent value".

```typescript
// Before:
const rawValue = rawRow[colIdx] ?? "";
cells.push(parseCell(rawValue, column, rowIdx));

// After:
const rawValue = rawRow[colIdx];
if (rawValue === undefined || rawValue === null) {
  cells.push({ type: "NULL" as const });
} else {
  cells.push(parseCell(rawValue, column, rowIdx));
}
```

**`toWireDataSet` / `cellToString`:** Null cells serialize as `null`:

```typescript
function cellToString(cell: CellValue): string | null {
  switch (cell.type) {
    case ColumnType.TEXT:
    case ColumnType.LABEL:
      return cell.value;
    case ColumnType.NUMBER:
      return String(cell.value);
    case ColumnType.DATE:
      return cell.value.toISOString();
    case "NULL":
      return null;
  }
}
```

Round-trip: `null` → `{ type: "NULL" }` → `null`. No lossy conversion.

---

## 2. Filter Types (`filter.ts`)

### CoreFunctionType

String union type covering all 13 Java enum values:

```typescript
export type CoreFunctionType =
  | "IS_NULL" | "NOT_NULL"
  | "EQUALS_TO" | "NOT_EQUALS_TO"
  | "LIKE_TO"
  | "GREATER_THAN" | "GREATER_OR_EQUALS_TO"
  | "LOWER_THAN" | "LOWER_OR_EQUALS_TO"
  | "BETWEEN"
  | "TIME_FRAME"
  | "IN" | "NOT_IN";
```

String union rather than `enum` — no runtime object, idiomatic TypeScript discriminants.

### Type-Specific Filter Variants

Each column-type union defines its own filter variants with correctly typed values. No shared `EqualityFilter` — equality is typed per column type to enforce compile-time correctness.

```typescript
// --- Null filters (column-type-independent) ---

type NullFilter =
  | { readonly fn: "IS_NULL" }
  | { readonly fn: "NOT_NULL" };

// --- Numeric filters ---

export type NumericFilter =
  | NullFilter
  | { readonly fn: "EQUALS_TO"; readonly value: number }
  | { readonly fn: "NOT_EQUALS_TO"; readonly value: number }
  | { readonly fn: "GREATER_THAN"; readonly value: number }
  | { readonly fn: "GREATER_OR_EQUALS_TO"; readonly value: number }
  | { readonly fn: "LOWER_THAN"; readonly value: number }
  | { readonly fn: "LOWER_OR_EQUALS_TO"; readonly value: number }
  | { readonly fn: "BETWEEN"; readonly low: number; readonly high: number }
  | { readonly fn: "IN"; readonly values: readonly number[] }
  | { readonly fn: "NOT_IN"; readonly values: readonly number[] };

// --- String filters (used for both TEXT and LABEL columns) ---

export type StringFilter =
  | NullFilter
  | { readonly fn: "EQUALS_TO"; readonly value: string }
  | { readonly fn: "NOT_EQUALS_TO"; readonly value: string }
  | { readonly fn: "GREATER_THAN"; readonly value: string }
  | { readonly fn: "GREATER_OR_EQUALS_TO"; readonly value: string }
  | { readonly fn: "LOWER_THAN"; readonly value: string }
  | { readonly fn: "LOWER_OR_EQUALS_TO"; readonly value: string }
  | { readonly fn: "BETWEEN"; readonly low: string; readonly high: string }
  | { readonly fn: "LIKE_TO"; readonly pattern: string; readonly caseSensitive: boolean }
  | { readonly fn: "IN"; readonly values: readonly string[] }
  | { readonly fn: "NOT_IN"; readonly values: readonly string[] };

// --- Date filters ---

export type DateFilter =
  | NullFilter
  | { readonly fn: "EQUALS_TO"; readonly value: Date }
  | { readonly fn: "NOT_EQUALS_TO"; readonly value: Date }
  | { readonly fn: "GREATER_THAN"; readonly value: Date }
  | { readonly fn: "GREATER_OR_EQUALS_TO"; readonly value: Date }
  | { readonly fn: "LOWER_THAN"; readonly value: Date }
  | { readonly fn: "LOWER_OR_EQUALS_TO"; readonly value: Date }
  | { readonly fn: "BETWEEN"; readonly low: Date; readonly high: Date }
  | { readonly fn: "TIME_FRAME"; readonly timeFrame: TimeFrame };
```

**Design notes:**

- `NullFilter` is shared because `IS_NULL`/`NOT_NULL` carry no value — there is nothing to mis-type.
- `BETWEEN` uses `low`/`high` consistently across all three types. No `start`/`end` for dates — the semantics are identical (value >= lower bound && value <= upper bound) regardless of the value type.
- `StringFilter` serves both TEXT and LABEL columns. The TEXT/LABEL distinction (groupability) belongs on `ColumnType`, not on the filter type. A single `StringFilter` avoids a structurally identical duplicate type that would provide no enforcement.

### FilterExpression (Discriminated by Column Type)

Level 2 discriminated union — the leaf variant carries the column type as its discriminant, pairing it with the correct filter type:

```typescript
export type FilterExpression =
  | { readonly type: "numeric"; readonly columnId: ColumnId; readonly filter: NumericFilter }
  | { readonly type: "string"; readonly columnId: ColumnId; readonly filter: StringFilter }
  | { readonly type: "date"; readonly columnId: ColumnId; readonly filter: DateFilter }
  | { readonly type: "and"; readonly children: readonly FilterExpression[] }
  | { readonly type: "or"; readonly children: readonly FilterExpression[] }
  | { readonly type: "not"; readonly child: FilterExpression };
```

The tree is type-correct by construction: a `NumericFilter` cannot be placed on a string column without a type error. The YAML parser maps column types to leaf discriminants:

- `ColumnType.NUMBER` → `"numeric"` leaf
- `ColumnType.TEXT` → `"string"` leaf
- `ColumnType.LABEL` → `"string"` leaf
- `ColumnType.DATE` → `"date"` leaf

The evaluator switches on `expr.type` and gets narrowed filter types inside each arm — no unsafe casts.

The Java pattern where child filters inherit `columnId` from their parent (`LogicalExprFilter.setColumnId()`) is resolved at parse time — by the time a `FilterExpression` tree is constructed, every leaf has an explicit `columnId` and column type.

### FilterOp

```typescript
export interface FilterOp {
  readonly type: "filter";
  readonly expressions: readonly FilterExpression[];
}
```

Top-level `expressions` are implicitly ANDed — matching `DataSetFilter.columnFilterList` semantics.

---

## 3. TimeFrame Types and Parser (`timeframe.ts`)

### Types

```typescript
export type DateIntervalType =
  | "MILLISECOND" | "HUNDRETH" | "TENTH"
  | "SECOND" | "MINUTE" | "HOUR"
  | "DAY" | "DAY_OF_WEEK" | "WEEK"
  | "MONTH" | "QUARTER" | "YEAR"
  | "DECADE" | "CENTURY" | "MILLENIUM";

// Subset of DateIntervalType valid for TimeInstant begin/end truncation.
// Excludes DAY_OF_WEEK (grouping-only — "beginning of this day of the week"
// is meaningless) and sub-second units (MILLISECOND, HUNDRETH, TENTH) which
// the Java calculateStartTime() does not handle.
// WEEK and SECOND are excluded from truncation but valid as offset units
// (TimeAmount.adjustDate handles them).
export type TruncationUnit =
  | "MINUTE" | "HOUR" | "DAY"
  | "MONTH" | "QUARTER" | "YEAR"
  | "DECADE" | "CENTURY" | "MILLENIUM";

// Subset valid for TimeAmount offsets (adjustDate).
// Everything except DAY_OF_WEEK and sub-second units.
export type OffsetUnit =
  | "SECOND" | "MINUTE" | "HOUR"
  | "DAY" | "WEEK"
  | "MONTH" | "QUARTER" | "YEAR"
  | "DECADE" | "CENTURY" | "MILLENIUM";

export type Month =
  | "JANUARY" | "FEBRUARY" | "MARCH" | "APRIL"
  | "MAY" | "JUNE" | "JULY" | "AUGUST"
  | "SEPTEMBER" | "OCTOBER" | "NOVEMBER" | "DECEMBER";

export interface TimeFrame {
  readonly from: TimeInstant;
  readonly to: TimeInstant;
}

export type TimeInstant =
  | { readonly mode: "now"; readonly offset?: TimeOffset }
  | { readonly mode: "begin"; readonly unit: TruncationUnit; readonly firstMonthOfYear?: Month; readonly offset?: TimeOffset }
  | { readonly mode: "end"; readonly unit: TruncationUnit; readonly firstMonthOfYear?: Month; readonly offset?: TimeOffset }
  | { readonly mode: "relative"; readonly offset: TimeOffset };

export interface TimeOffset {
  readonly amount: number;
  readonly unit: OffsetUnit;
}
```

**Design notes:**

- `TimeInstant` is now a discriminated union on `mode` rather than a flat interface. Each mode carries only the fields it needs: `"now"` has no unit, `"begin"`/`"end"` require a `TruncationUnit`, `"relative"` requires a `TimeOffset`.
- `TruncationUnit` restricts begin/end modes to units that `calculateStartTime()` actually handles. This makes invalid combinations like `begin[day_of_week]` a type error.
- `OffsetUnit` is broader — `TimeAmount.adjustDate()` handles WEEK and SECOND in addition to the truncation units.
- `TimeOffset` replaces the flat `offset` field, matching the Java `TimeAmount` concept (quantity + unit).

### Parser

```typescript
export function parseTimeFrame(expr: string): TimeFrame
```

Algorithm (ported from `org.melviz.dataset.date.TimeFrame.parse()`):

1. If no `"till"` separator — parse as single instant, pair with `{ mode: "now" }`. No ordering — `parseTimeFrame` is a pure string-to-AST function with no date computation. Ordering happens in `resolveTimeFrame` after resolution.
2. If `"till"` present — parse each side as a `TimeInstant`
3. If `to` has no mode keyword (`now`/`begin`/`end`), it's a `"relative"` instant

The Java parser resolves eagerly during parsing (calling `getTimeInstant()` which uses `new Date()` internally) and throws `IllegalArgumentException` when both instants resolve to the same time. The TypeScript design separates parsing from resolution for testability. The equal-instants exception is dropped — a zero-width range that matches nothing is a valid result, not an error. Pure functions should not throw for legal inputs that produce empty results.

### TimeFrame Resolution

```typescript
export function resolveTimeFrame(tf: TimeFrame, referenceDate: Date): { from: Date; to: Date }
```

Two-pass resolution with ordering (ported from Java `TimeFrame.parse()` post-processing):

```typescript
export function resolveTimeFrame(
  tf: TimeFrame, referenceDate: Date
): { from: Date; to: Date } {
  let from = resolveInstant(tf.from, referenceDate);
  let to = tf.to.mode === "relative"
    ? resolveInstant(tf.to, from)
    : resolveInstant(tf.to, referenceDate);

  if (from > to) [from, to] = [to, from];
  return { from, to };
}
```

1. Resolve `tf.from` with `referenceDate`
2. If `tf.to.mode === "relative"` → resolve `tf.to` using the resolved `from` date as its start time (not `referenceDate`)
3. Otherwise → resolve `tf.to` with `referenceDate`
4. If `from > to` → swap. This handles both the single-instant case (where the parsed instant may be before or after `now`) and the two-instant case (where `"end[year] till begin[year]"` produces `from > to`). Ordering belongs here — not in `parseTimeFrame` — because only `resolveTimeFrame` has the resolved dates to compare.

### TimeInstant Resolution

```typescript
export function resolveInstant(instant: TimeInstant, referenceDate: Date): Date
```

`referenceDate` is passed in, never obtained from `Date.now()` — testability constraint.

- `"now"` → return `referenceDate`, then apply offset if present
- `"begin"` → truncate to start of `unit` (e.g., `begin[year]` → Jan 1 00:00:00.000 UTC), apply offset
- `"end"` → advance to end of `unit` (e.g., `end[month]` → first ms of next month), apply offset
- `"relative"` → add `offset.amount * offset.unit` to `referenceDate`
- `firstMonthOfYear` shifts the fiscal year anchor for YEAR/QUARTER/DECADE/CENTURY/MILLENIUM

All date arithmetic uses UTC — `getUTCMonth()`, `setUTCFullYear()`, etc. No locale-dependent `Date.prototype` methods.

---

## 4. Filter Evaluation (`filter-eval.ts`)

### Public API

```typescript
export function applyFilter(
  ds: TypedDataSet,
  op: FilterOp,
  referenceDate?: Date,
): TypedDataSet
```

Returns a new `TypedDataSet` with only rows matching all expressions. `referenceDate` defaults to `new Date()` and is used only for `TIME_FRAME` filter resolution. Exposed for testability — tests pass a fixed date to get deterministic results.

### Internal Structure

```typescript
function evaluateExpression(
  row: TypedRow,
  expr: FilterExpression,
  resolvedTimeFrames: ResolvedTimeFrames,
): boolean
```

No `columns` parameter — with Level 2 FilterExpression, the leaf discriminant (`"numeric"` / `"string"` / `"date"`) tells the evaluator which type-specific function to call. The cell is retrieved via `row.cell(expr.columnId)`, which handles column index lookup internally via its closure-captured index.

Dispatches on `expr.type`:
- `"numeric"` / `"string"` / `"date"` → look up cell by `columnId`, call type-specific evaluator with narrowed filter type
- `"and"` → all children pass (short-circuit)
- `"or"` → any child passes (short-circuit)
- `"not"` → invert child

```typescript
function evaluateNumericFilter(cell: CellValue, filter: NumericFilter): boolean
function evaluateStringFilter(cell: CellValue, filter: StringFilter): boolean
function evaluateDateFilter(cell: CellValue, filter: DateFilter, resolvedTimeFrames: ResolvedTimeFrames): boolean
```

Each evaluator dispatches on `filter.fn`:

| Function | Null cell | Non-null logic |
|----------|-----------|----------------|
| `IS_NULL` | `true` | `false` |
| `NOT_NULL` | `false` | `true` |
| `EQUALS_TO` | `false` | numbers: `===`; strings: `===`; dates: `getTime() ===` |
| `NOT_EQUALS_TO` | `false` | `!EQUALS_TO` logic |
| `LIKE_TO` | `false` | compile pattern to regex, test string value |
| `GREATER_THAN` | `false` | type-dispatch `>` |
| `GREATER_OR_EQUALS_TO` | `false` | `>=` |
| `LOWER_THAN` | `false` | `<` |
| `LOWER_OR_EQUALS_TO` | `false` | `<=` |
| `BETWEEN` | `false` | `value >= low && value <= high` (inclusive both ends) |
| `TIME_FRAME` | `false` | resolve TimeFrame to `[from, to]`, check `from <= value <= to` |
| `IN` | `false` | any value in set matches (EQUALS_TO per element) |
| `NOT_IN` | `false` | no value in set matches |

### Null Semantics (SQL NULL — fixes Java bugs)

All comparison operations return `false` for null cells. Only `IS_NULL` returns `true`. This adopts SQL NULL semantics: any comparison with NULL is unknown, treated as non-matching.

This deliberately fixes inconsistent null handling in the Java code:

| Function | Java (null) | TypeScript (null) | Change |
|----------|-------------|-------------------|--------|
| `NOT_EQUALS_TO` | `true` (via `!isEqualsTo(null)` = `!false`) | `false` | Bug fix |
| `LOWER_THAN` | `true` (via `!isGreaterThanOrEqualsTo(null)` = `!false`) | `false` | Bug fix |
| `LOWER_OR_EQUALS_TO` | `true` (via `!isGreaterThan(null)` = `!false`) | `false` | Bug fix |
| `BETWEEN` | `low == null` (passes if low bound is null) | `false` | Bug fix |
| `NOT_IN` | `true` (via `!isEqualsTo(null)` = `!false`) | `false` | Bug fix |

The Java bugs arise from negation (`!`) of methods that return `false` for null without special-casing it. The result is logically wrong: a null value should not match "not equals to 5" or "lower than 10".

### LIKE_TO Regex Compilation

Bracket-aware replacement that does not corrupt `[charlist]` and `[^charlist]` expressions:

1. Parse the pattern character by character, tracking whether we are inside a bracket expression (`[...]`)
2. Outside brackets: escape `.` → `\\.`, replace `%` → `.*`, replace `_` → `.`
3. Inside brackets: pass characters through unchanged to the JS regex engine
4. Anchor the compiled pattern with `^` and `$`: `new RegExp("^" + compiledPattern + "$")`

Anchoring is required because Java's `String.matches()` implicitly requires the entire string to match (it anchors), while JavaScript's `RegExp.test()` matches anywhere in the string. Without `^...$`, LIKE pattern `foo` would incorrectly match `"foobar"`.

This fixes a bug inherited from the Java code, where global `%`/`_` replacement would corrupt bracket expressions (e.g., the LIKE pattern `[%_]` meaning "match literal % or _" would become `[.*.] ` — a broken regex character class).

Case sensitivity controlled by `filter.caseSensitive` — when false, both pattern and value are lowercased before matching.

### TimeFrame Pre-Resolution

`TIME_FRAME` filters require resolved `[from, to]` date pairs. These are computed once before the row loop, not per-row.

`applyFilter` pre-walks the expression tree before entering the row loop, finds all `TIME_FRAME` filters, resolves each via `resolveTimeFrame`, and stores results in a `Map`:

```typescript
type ResolvedTimeFrames = Map<TimeFrame, { from: Date; to: Date }>;

function preResolveTimeFrames(
  expressions: readonly FilterExpression[],
  referenceDate: Date,
): ResolvedTimeFrames {
  const resolved = new Map<TimeFrame, { from: Date; to: Date }>();
  // Walk expression tree recursively. For each DateFilter leaf
  // with fn === "TIME_FRAME", resolve and store.
  return resolved;
}
```

The map key is the `TimeFrame` object reference — the expression tree is immutable and each `TimeFrame` instance is unique. The map is passed into `evaluateExpression` and through to `evaluateDateFilter`, which looks up pre-resolved dates instead of resolving per-row.

### Comparison Operators (fixes Java compareTo bug)

The Java `CoreFunction.isGreaterThan()` uses `value.compareTo(ref) == 1` and `isGreaterThanOrEqualsTo()` uses `value.compareTo(ref) != -1`. This is wrong — `Comparable.compareTo()` returns any positive or negative integer, not specifically 1 or -1. For `String.compareTo()`, the return value is the difference of character values: `"z".compareTo("a")` returns 25, not 1. This means `isGreaterThan("z", "a")` incorrectly returns `false` in Java.

The TypeScript implementation uses direct `>`, `>=`, `<`, `<=` operators:
- Numbers: native numeric comparison
- Strings: Unicode code point order (locale-independent, matching the spec's constraint)
- Dates: `getTime()` comparison

### Return Value

`applyFilter` builds a new `TypedDataSet` by selecting matching rows from `ds.rows`. Columns are reused unchanged. No re-parsing — filtered rows are already `TypedRow` instances.

---

## 5. File Layout

| File | Contents | LOC estimate |
|------|----------|-------------|
| `types.ts` | Add `"NULL"` variant to `CellValue`, change `DataSet.data` to `(string \| null)[][]` | +4 lines |
| `conversion.ts` | Handle null raw values, serialize null cells | +8 lines |
| `filter.ts` | All filter type definitions, FilterExpression, FilterOp | ~90 |
| `timeframe.ts` | TimeFrame/TimeInstant types, parser, resolution | ~200 |
| `filter-eval.ts` | `applyFilter`, expression evaluators, LIKE_TO regex | ~220 |

---

## 6. Design Decisions

1. **`"NULL"` as string literal, not `ColumnType` member** — null is absence of value, not a schema type
2. **String unions over enums** — idiomatic TS, no runtime objects, better tree-shaking
3. **Type-specific filter variants with no shared EqualityFilter** — each column-type union defines its own equality variants with correctly typed values. `{ fn: "EQUALS_TO", value: "hello" }` is a type error when assigned to `NumericFilter`. The type system enforces column-type compatibility at compile time.
4. **Level 2 discriminated FilterExpression** — leaf nodes carry the column type as their discriminant (`"numeric"` / `"string"` / `"date"`), pairing with the correct filter type. The tree is type-correct by construction — mismatching a filter to a column type is a compile error.
5. **Single `StringFilter` for TEXT and LABEL** — the groupability distinction belongs on `ColumnType`, not on the filter type. A duplicate `LabelFilter` structurally identical to `StringFilter` adds a type name without adding a constraint.
6. **`referenceDate` parameter** — TimeFrame resolution is deterministic and testable
7. **UTC-only date arithmetic** — no locale-dependent methods, identical results across environments
8. **Pure functions, no caching** — `applyFilter` is stateless; TimeFrame resolved once before row loop
9. **SQL NULL semantics** — null cells return `false` for all non-null comparison operations. This fixes Java bugs where `NOT_EQUALS_TO`, `LOWER_THAN`, `LOWER_OR_EQUALS_TO`, `BETWEEN` (when low is null), and `NOT_IN` incorrectly returned `true` for null values. The bugs arose from negation of methods that return `false` for null without special-casing: `!isEqualsTo(null)` = `!false` = `true`.
10. **Java `compareTo` bug fix** — the Java code uses `compareTo() == 1` and `!= -1`, which is incorrect. `Comparable.compareTo()` can return any positive/negative integer. `String.compareTo("a", "z")` returns -25, not -1. The TypeScript implementation uses direct `>`, `>=`, `<`, `<=` operators.
11. **Bracket-aware LIKE_TO** — the LIKE_TO regex compiler tracks bracket depth and only replaces `%`/`_` outside `[...]` expressions. The Java code replaces globally, which corrupts bracket expressions.
12. **`TruncationUnit` and `OffsetUnit` subsets** — `TimeInstant` restricts begin/end modes to `TruncationUnit` (units that `calculateStartTime()` handles) and offsets to `OffsetUnit` (units that `adjustDate()` handles). `DAY_OF_WEEK` is excluded from both — it is meaningful only for grouping contexts. Invalid combinations like `begin[day_of_week]` are type errors.
13. **`DataSet.data` allows null** — wire format changed from `string[][]` to `(string | null)[][]` for clean round-tripping of null cells. Breaking change — all consumers must handle null entries.
14. **`resolveTimeFrame` function** — explicit two-pass resolution: resolve `from` first, then if `to.mode === "relative"`, resolve it using `from`'s resolved date as start time (not the reference date). Matches Java `TimeFrame.parse()` post-processing contract.
15. **`undefined` → null, `""` → valid** — preserves empty string vs absent value distinction in wire format. `null` in the data array also produces null cells.
16. **`parseTimeFrame` is pure AST, no resolution** — parsing and resolution are separated. `parseTimeFrame` returns a `TimeFrame` AST with no date computation. Ordering (`from < to`) happens in `resolveTimeFrame` after instants are resolved to actual dates. The Java `IllegalArgumentException` for equal instants is dropped — a zero-width range is a valid empty result, not an error.
17. **TimeFrame pre-resolution via `ResolvedTimeFrames` map** — `applyFilter` pre-walks the expression tree before the row loop, resolves all `TIME_FRAME` filters once, and passes the results map through to evaluators. Avoids per-row resolution without introducing mutable caching into the evaluator.
