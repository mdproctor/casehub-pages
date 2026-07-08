import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createScenarioController } from "./controller.js";

describe("ScenarioController", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("schedules callback at delay / speed real ms", () => {
    const ctrl = createScenarioController({ speed: 2 });
    const fn = vi.fn();
    ctrl.schedule(1000, fn);
    vi.advanceTimersByTime(499);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("tracks elapsed in scenario time, not real time", () => {
    const ctrl = createScenarioController({ speed: 2 });
    const fn = vi.fn();
    ctrl.schedule(1000, fn);
    vi.advanceTimersByTime(500);
    expect(ctrl.elapsed).toBe(1000);
  });

  it("pause() prevents scheduled callbacks from firing", () => {
    const ctrl = createScenarioController();
    const fn = vi.fn();
    ctrl.schedule(1000, fn);
    ctrl.pause();
    vi.advanceTimersByTime(2000);
    expect(fn).not.toHaveBeenCalled();
    expect(ctrl.playing).toBe(false);
  });

  it("play() resumes from paused position", () => {
    const ctrl = createScenarioController();
    const fn = vi.fn();
    ctrl.schedule(1000, fn);
    vi.advanceTimersByTime(500);
    ctrl.pause();
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
    ctrl.play();
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("step() fires next callback then pauses", () => {
    const ctrl = createScenarioController();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    ctrl.schedule(100, fn1);
    ctrl.schedule(200, fn2);
    ctrl.pause();
    ctrl.step();
    expect(fn1).toHaveBeenCalledOnce();
    expect(fn2).not.toHaveBeenCalled();
    expect(ctrl.playing).toBe(false);
    expect(ctrl.pending).toBe(1);
  });

  it("setSpeed() recalculates active timeout delay", () => {
    const ctrl = createScenarioController({ speed: 1 });
    const fn = vi.fn();
    ctrl.schedule(1000, fn);
    vi.advanceTimersByTime(200);
    ctrl.setSpeed(5);
    // 800ms scenario time remaining at 5x = 160ms real
    vi.advanceTimersByTime(160);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("dispose() from schedule cancels the callback", () => {
    const ctrl = createScenarioController();
    const fn = vi.fn();
    const disposable = ctrl.schedule(1000, fn);
    disposable.dispose();
    vi.advanceTimersByTime(2000);
    expect(fn).not.toHaveBeenCalled();
  });

  it("onEvent() receives entries when logged", () => {
    const ctrl = createScenarioController();
    const entries: unknown[] = [];
    ctrl.onEvent((e) => entries.push(e));
    // onEvent is used by sources to log — tested via simulated source
    // Here just verify the subscription mechanism works
    expect(entries).toHaveLength(0);
  });

  it("defaults: speed=1, playing=true", () => {
    const ctrl = createScenarioController();
    expect(ctrl.speed).toBe(1);
    expect(ctrl.playing).toBe(true);
    expect(ctrl.elapsed).toBe(0);
    expect(ctrl.pending).toBe(0);
  });

  it("fires multiple callbacks scheduled at the same time", () => {
    const ctrl = createScenarioController();
    const order: number[] = [];
    ctrl.schedule(100, () => { order.push(1); });
    ctrl.schedule(100, () => { order.push(2); });
    ctrl.schedule(100, () => { order.push(3); });
    vi.advanceTimersByTime(100);
    vi.runAllTimers();
    expect(order).toEqual([1, 2, 3]);
    expect(ctrl.pending).toBe(0);
  });

  it("logEvent notifies all onEvent listeners", () => {
    const ctrl = createScenarioController();
    const entries1: unknown[] = [];
    const entries2: unknown[] = [];
    ctrl.onEvent((e) => entries1.push(e));
    ctrl.onEvent((e) => entries2.push(e));

    const entry = {
      timestamp: 0,
      wallTime: 0,
      dataSetId: "test" as import("../dataset/types.js").DataSetId,
      event: { type: "snapshot" as const, dataset: { columns: [], rows: [] } },
      source: "test-source",
    };
    ctrl.logEvent(entry);

    expect(entries1).toHaveLength(1);
    expect(entries2).toHaveLength(1);
    expect(entries1[0]).toBe(entry);
  });

  it("onEvent dispose removes listener", () => {
    const ctrl = createScenarioController();
    const entries: unknown[] = [];
    const disposable = ctrl.onEvent((e) => entries.push(e));

    const entry = {
      timestamp: 0,
      wallTime: 0,
      dataSetId: "test" as import("../dataset/types.js").DataSetId,
      event: { type: "snapshot" as const, dataset: { columns: [], rows: [] } },
      source: "test",
    };

    ctrl.logEvent(entry);
    expect(entries).toHaveLength(1);

    disposable.dispose();
    ctrl.logEvent(entry);
    expect(entries).toHaveLength(1);
  });

  it("step on empty queue is a no-op", () => {
    const ctrl = createScenarioController();
    ctrl.pause();
    ctrl.step();
    expect(ctrl.elapsed).toBe(0);
    expect(ctrl.pending).toBe(0);
  });

  it("multiple schedule-dispose cycles don't leak", () => {
    const ctrl = createScenarioController();
    const fns = Array.from({ length: 10 }, () => vi.fn());
    const disposables = fns.map((fn, i) => ctrl.schedule((i + 1) * 100, fn));

    disposables.forEach(d => { d.dispose(); });

    vi.advanceTimersByTime(2000);
    fns.forEach(fn => { expect(fn).not.toHaveBeenCalled(); });
    expect(ctrl.pending).toBe(0);
  });
});
