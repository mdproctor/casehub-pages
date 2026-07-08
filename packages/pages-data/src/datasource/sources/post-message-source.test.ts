import { describe, it, expect, vi, afterEach } from "vitest";
import { postMessageSource } from "./post-message-source.js";
import type { DataSink, SourceError } from "../types.js";
import type { DataSetEvent } from "../../dataset/events.js";
import type { PresetRegistry } from "../../dataset/external/types.js";
import { dataSetId } from "./test-helpers.js";

const noopRegistry: PresetRegistry = {
  get() { return undefined; },
  has() { return false; },
};

/** Simulates window.dispatchEvent(new MessageEvent("message", ...)) */
function dispatchMessage(target: EventTarget, data: unknown): void {
  target.dispatchEvent(new MessageEvent("message", { data }));
}

describe("postMessageSource", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits snapshot when matching postMessage arrives", async () => {
    const target = new EventTarget();
    const id = dataSetId("pm-ds");
    const source = postMessageSource(id, noopRegistry, { eventTarget: target });

    const events: DataSetEvent[] = [];
    const sink: DataSink = {
      apply(event) { events.push(event); },
      error() {},
    };

    source.connect(sink);

    dispatchMessage(target, {
      type: "casehub-pages-dataset",
      dataSetId: "pm-ds",
      data: [["alice"], ["bob"]],
    });

    await vi.waitFor(() => {
      expect(events.length).toBeGreaterThan(0);
    });

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("snapshot");

    source.disconnect();
  });

  it("ignores messages for different dataset IDs", async () => {
    const target = new EventTarget();
    const id = dataSetId("pm-ds");
    const source = postMessageSource(id, noopRegistry, { eventTarget: target });

    const events: DataSetEvent[] = [];
    const sink: DataSink = {
      apply(event) { events.push(event); },
      error() {},
    };

    source.connect(sink);

    // Wrong ID
    dispatchMessage(target, {
      type: "casehub-pages-dataset",
      dataSetId: "other-ds",
      data: [["data"]],
    });

    // Non-pages message
    dispatchMessage(target, { type: "something-else" });

    // Give it a moment
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(events).toHaveLength(0);

    source.disconnect();
  });

  it("errors on timeout", async () => {
    vi.useFakeTimers();

    const target = new EventTarget();
    const id = dataSetId("pm-ds");
    const source = postMessageSource(id, noopRegistry, {
      timeoutMs: 100,
      eventTarget: target,
    });

    const errors: SourceError[] = [];
    const sink: DataSink = {
      apply() {},
      error(err) { errors.push(err); },
    };

    source.connect(sink);

    vi.advanceTimersByTime(100);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("timeout");
    expect(errors[0]!.permanent).toBe(true);
  });

  it("stops listening after disconnect", () => {
    const target = new EventTarget();
    const id = dataSetId("pm-ds");
    const source = postMessageSource(id, noopRegistry, { eventTarget: target });

    const events: DataSetEvent[] = [];
    const sink: DataSink = {
      apply(event) { events.push(event); },
      error() {},
    };

    source.connect(sink);
    source.disconnect();

    // Message after disconnect — should not be received
    dispatchMessage(target, {
      type: "casehub-pages-dataset",
      dataSetId: "pm-ds",
      data: [["late"]],
    });

    expect(events).toHaveLength(0);
  });
});
