import type { DataSource, DataSink } from "../types.js";
import type { DataSetEvent } from "../../dataset/events.js";
import type { RecordedEvent } from "./replay-source.js";

export interface RecordingCapture {
  getRecording(): readonly RecordedEvent[];
  clear(): void;
}

export function recording(innerSource: DataSource): DataSource & RecordingCapture {
  const events: RecordedEvent[] = [];
  let startTime: number | null = null;

  return {
    connect(sink: DataSink): void {
      // Capture the start time on first event
      const recordingSink: DataSink = {
        apply(event: DataSetEvent): void {
          const now = performance.now();

          if (startTime === null) {
            startTime = now;
          }

          const offsetMs = now - startTime;
          events.push({ offsetMs, event });

          // Delegate to actual sink
          sink.apply(event);
        },

        error(err): void {
          sink.error(err);
        },
      };

      innerSource.connect(recordingSink);
    },

    disconnect(): void {
      innerSource.disconnect();
    },

    getRecording(): readonly RecordedEvent[] {
      return events;
    },

    clear(): void {
      events.length = 0;
      startTime = null;
    },
  };
}
