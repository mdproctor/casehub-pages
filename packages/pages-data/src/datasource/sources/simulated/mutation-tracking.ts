/**
 * Internal tracking state for mutations.
 *
 * - TransitionTracking: per-row state for `transition()` — records when a row
 *   entered the "from" state and its randomised delay.
 * - MutationTiming: per-mutation cadence for `increment()` / `decrement()` —
 *   tracks the last scenario-time the mutation fired.
 */

/** Per-row tracking entry for transition mutations. */
export interface TransitionEntry {
  readonly enteredAt: number;
  readonly delay: number;
}

/**
 * Per-row state tracking for a single transition mutation.
 * Keys are stringified row identities (the key column value).
 */
export interface TransitionTracking {
  readonly entries: Map<string, TransitionEntry>;
}

export function createTransitionTracking(): TransitionTracking {
  return { entries: new Map() };
}

/**
 * Record that a row just entered the "from" state.
 * Picks a random delay in [minMs, maxMs].
 */
export function trackRowEntry(
  tracking: TransitionTracking,
  rowKey: string,
  enteredAt: number,
  minMs: number,
  maxMs: number,
): void {
  if (!tracking.entries.has(rowKey)) {
    const delay = minMs + Math.random() * (maxMs - minMs);
    tracking.entries.set(rowKey, { enteredAt, delay });
  }
}

/** Remove tracking for a row that left the "from" state. */
export function untrackRow(tracking: TransitionTracking, rowKey: string): void {
  tracking.entries.delete(rowKey);
}

/** Check whether a row's delay has elapsed at the given scenario time. */
export function isDelayElapsed(
  tracking: TransitionTracking,
  rowKey: string,
  currentElapsed: number,
): boolean {
  const entry = tracking.entries.get(rowKey);
  if (!entry) return false;
  return currentElapsed - entry.enteredAt >= entry.delay;
}

// ---------------------------------------------------------------------------
// Per-mutation timing for increment / decrement
// ---------------------------------------------------------------------------

/** Tracks the last scenario-time a mutation fired (global, not per-row). */
export interface MutationTiming {
  lastFiredAt: number;
}

export function createMutationTiming(startAt: number = 0): MutationTiming {
  return { lastFiredAt: startAt };
}

/**
 * Check whether the mutation's `every` interval has elapsed since its last
 * firing, and if so, reset the timer and return true.
 */
export function shouldFire(
  timing: MutationTiming,
  every: number,
  currentElapsed: number,
): boolean {
  if (currentElapsed - timing.lastFiredAt >= every) {
    timing.lastFiredAt = currentElapsed;
    return true;
  }
  return false;
}
