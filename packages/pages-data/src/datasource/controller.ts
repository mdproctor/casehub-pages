import type { DataSetId } from "../dataset/types.js";
import type { DataSetEvent } from "../dataset/events.js";
import type { Disposable } from "./types.js";

export interface ScenarioAnnotation {
  readonly text: string;
  readonly target?: string;
  readonly style: AnnotationStyle;
  readonly duration?: number;
}

export type AnnotationStyle =
  | { type: "label"; position?: AnchorPosition }
  | { type: "arrow" }
  | { type: "circle" }
  | { type: "highlight-box" }
  | { type: "highlight-line" };

export type AnchorPosition = "above" | "below" | "left" | "right";

export interface EventLogEntry {
  readonly timestamp: number;
  readonly wallTime: number;
  readonly dataSetId: DataSetId;
  readonly event: DataSetEvent;
  readonly source: string;
}

export interface ScenarioController {
  readonly speed: number;
  setSpeed(multiplier: number): void;
  play(): void;
  pause(): void;
  readonly playing: boolean;
  step(): void;
  readonly pending: number;
  schedule(delayMs: number, callback: () => void): Disposable;
  readonly elapsed: number;
  readonly activeAnnotations: readonly ScenarioAnnotation[];
  onAnnotation(listener: (annotations: readonly ScenarioAnnotation[]) => void): Disposable;
  onEvent(listener: (entry: EventLogEntry) => void): Disposable;
  logEvent(entry: EventLogEntry): void;
}

export interface ScenarioControllerOptions {
  readonly speed?: number;
  readonly playing?: boolean;
}

interface ScheduledEntry {
  readonly fireAt: number;
  readonly callback: () => void;
  cancelled: boolean;
}

export function createScenarioController(
  options?: ScenarioControllerOptions,
): ScenarioController {
  let speed = options?.speed ?? 1;
  let playing = options?.playing ?? true;
  let elapsed = 0;
  let lastRealTime = performance.now();

  const queue: ScheduledEntry[] = [];
  let activeTimeout: ReturnType<typeof setTimeout> | null = null;

  const eventListeners = new Set<(entry: EventLogEntry) => void>();
  const annotationListeners = new Set<(annotations: readonly ScenarioAnnotation[]) => void>();
  const annotations: ScenarioAnnotation[] = [];

  function reschedule(): void {
    if (activeTimeout !== null) {
      clearTimeout(activeTimeout);
      activeTimeout = null;
    }
    if (!playing) return;

    // Remove cancelled entries from front
    while (queue.length > 0 && queue[0]!.cancelled) {
      queue.shift();
    }
    if (queue.length === 0) return;

    const next = queue[0]!;
    const scenarioRemaining = next.fireAt - elapsed;
    const realDelay = Math.max(0, scenarioRemaining / speed);

    activeTimeout = setTimeout(() => {
      activeTimeout = null;
      elapsed = next.fireAt;
      lastRealTime = performance.now();
      queue.shift();
      next.callback();
      reschedule();
    }, realDelay);
  }

  return {
    get speed() { return speed; },
    setSpeed(multiplier: number) {
      // Update elapsed based on real time passed since last checkpoint
      if (playing && activeTimeout !== null) {
        const now = performance.now();
        const realElapsed = now - lastRealTime;
        elapsed += realElapsed * speed;
        lastRealTime = now;
      }
      speed = multiplier;
      reschedule();
    },

    play() {
      if (playing) return;
      playing = true;
      lastRealTime = performance.now();
      reschedule();
    },

    pause() {
      if (!playing) return;
      if (activeTimeout !== null) {
        const now = performance.now();
        const realElapsed = now - lastRealTime;
        elapsed += realElapsed * speed;
        clearTimeout(activeTimeout);
        activeTimeout = null;
      }
      playing = false;
      lastRealTime = performance.now();
    },

    get playing() { return playing; },

    step() {
      // Remove cancelled entries
      while (queue.length > 0 && queue[0]!.cancelled) {
        queue.shift();
      }
      if (queue.length === 0) return;

      const next = queue.shift()!;
      elapsed = next.fireAt;
      lastRealTime = performance.now();
      next.callback();
      playing = false;
      if (activeTimeout !== null) {
        clearTimeout(activeTimeout);
        activeTimeout = null;
      }
    },

    get pending() {
      return queue.filter(e => !e.cancelled).length;
    },

    schedule(delayMs: number, callback: () => void): Disposable {
      const entry: ScheduledEntry = {
        fireAt: elapsed + delayMs,
        callback,
        cancelled: false,
      };

      // Insert sorted by fireAt
      let i = 0;
      while (i < queue.length && queue[i]!.fireAt <= entry.fireAt) i++;
      queue.splice(i, 0, entry);

      // If this is now the earliest, reschedule
      if (i === 0 && playing) {
        reschedule();
      }

      return {
        dispose() {
          const wasFirst = queue[0] === entry;
          entry.cancelled = true;
          // If we cancelled the first entry, reschedule to skip it
          if (wasFirst && playing) {
            reschedule();
          }
        },
      };
    },

    get elapsed() { return elapsed; },

    get activeAnnotations() { return annotations as readonly ScenarioAnnotation[]; },

    onAnnotation(listener: (annotations: readonly ScenarioAnnotation[]) => void): Disposable {
      annotationListeners.add(listener);
      return { dispose() { annotationListeners.delete(listener); } };
    },

    onEvent(listener: (entry: EventLogEntry) => void): Disposable {
      eventListeners.add(listener);
      return { dispose() { eventListeners.delete(listener); } };
    },

    logEvent(entry: EventLogEntry): void {
      for (const listener of eventListeners) {
        listener(entry);
      }
    },
  };
}
