import type { DataSource, DataSink } from "../types.js";

/**
 * Combines an initial source (typically REST) with a live source (typically SSE
 * or WebSocket). On connect, the initial source is connected first. After it
 * emits its first `snapshot` event, the composite forwards that snapshot to the
 * outer sink, disconnects the initial source, and connects the live source.
 *
 * Non-snapshot events from the initial source are silently ignored — only the
 * first snapshot triggers the handoff. If the initial source errors, the live
 * source is never connected and the error is forwarded to the outer sink.
 */
export function composite(initial: DataSource, live: DataSource): DataSource {
  type Phase = "idle" | "initial" | "live" | "error" | "disconnected";
  let phase: Phase = "idle";
  let outerSink: DataSink | null = null;

  return {
    connect(sink: DataSink): void {
      outerSink = sink;
      phase = "initial";

      const initialSink: DataSink = {
        apply(event): void {
          if (phase !== "initial") return;

          // Only snapshot triggers the handoff
          if (event.type !== "snapshot") return;

          // Forward the snapshot to the outer sink
          outerSink?.apply(event);

          // Disconnect initial, connect live
          phase = "live";
          initial.disconnect();
          live.connect(outerSink!);
        },

        error(err): void {
          if (phase !== "initial") return;

          // Error in initial — stay in error state, do NOT connect live
          phase = "error";
          outerSink?.error(err);
        },
      };

      initial.connect(initialSink);
    },

    disconnect(): void {
      if (phase === "disconnected") return;

      const currentPhase = phase;
      phase = "disconnected";

      if (currentPhase === "initial" || currentPhase === "error") {
        initial.disconnect();
      } else if (currentPhase === "live") {
        live.disconnect();
      }

      outerSink = null;
    },
  };
}
