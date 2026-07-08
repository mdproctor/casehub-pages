import type { DataSource, DataSink, Disposable } from "../types.js";
import type { DataSetEvent } from "../../dataset/events.js";
import type { ScenarioController } from "../controller.js";

export interface RecordedEvent {
  readonly offsetMs: number;
  readonly event: DataSetEvent;
}

export interface ReplayOptions {
  readonly loop?: boolean;
}

export function replay(
  events: readonly RecordedEvent[],
  controller: ScenarioController,
  options?: ReplayOptions,
): DataSource {
  const disposables: Disposable[] = [];
  let sink: DataSink | null = null;

  function scheduleAll(): void {
    if (!sink) return;

    for (const recorded of events) {
      const currentSink = sink; // Capture for closure
      const disposable = controller.schedule(recorded.offsetMs, () => {
        currentSink.apply(recorded.event);
      });
      disposables.push(disposable);
    }

    // If loop enabled, schedule next cycle immediately after last event
    // Use lastOffset to ensure loop happens after all events at that offset
    if (options?.loop && events.length > 0) {
      const lastOffset = events[events.length - 1]!.offsetMs;
      const disposable = controller.schedule(lastOffset, () => {
        // Re-schedule all events from current elapsed time
        scheduleAll();
      });
      disposables.push(disposable);
    }
  }

  return {
    connect(dataSink: DataSink): void {
      sink = dataSink;
      scheduleAll();
    },

    disconnect(): void {
      // Cancel all scheduled events
      for (const disposable of disposables) {
        disposable.dispose();
      }
      disposables.length = 0;
      sink = null;
    },
  };
}
