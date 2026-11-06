import { describe, expect, it, vi } from "vitest";
import { tick } from "./lifecycle";

describe("incremental refresh scheduling", () => {
  it("retains only the latest 120 refresh durations during long sessions", () => {
    const history = Array.from({ length: 120 }, (_, i) => i);
    const planner = {
      isDisposed: false, tickCount: 0, uiDirty: true,
      config: { updateMS: 1000 }, autoBuyFastTrackUntil: 0, lastUiRefreshAt: 0,
      refreshAttemptCount: 0, refreshSuccessCount: 0, refreshDurationsMs: history,
      checkUpdateUI() {}, updateUI() { this.pendingSimRecalc = false; }, scheduleNextTick() {},
    };
    tick.call(planner);
    expect(planner.refreshDurationsMs).toBe(history);
    expect(history).toHaveLength(120);
    expect(history.slice(0, 119)).toEqual(Array.from({ length: 119 }, (_, i) => i + 1));
    expect(history[119]).toBeGreaterThanOrEqual(0);
    expect(planner.refreshSuccessCount).toBe(1);
  });
  it.each([true, false])("retains pending work=%s after a refresh", (pending) => {
    const planner = {
      isDisposed: false, tickCount: 0, uiDirty: true,
      config: { updateMS: 1000 }, autoBuyFastTrackUntil: 0, lastUiRefreshAt: 0,
      refreshAttemptCount: 0, refreshSuccessCount: 0, refreshDurationsMs: [],
      checkUpdateUI() {},
      updateUI() { this.pendingSimRecalc = pending; this.uiDirty = pending; },
      scheduleNextTick() {},
    };
    tick.call(planner);
    expect(planner.uiDirty).toBe(pending);
    expect(planner.refreshSuccessCount).toBe(1);
  });
  it("continues deferred candidates on the next eligible tick", () => {
    const clock = vi.spyOn(Date, "now");
    const planner = {
      isDisposed: false, tickCount: 0, uiDirty: true,
      config: { updateMS: 1000 }, autoBuyFastTrackUntil: 0, lastUiRefreshAt: 0,
      refreshAttemptCount: 0, refreshSuccessCount: 0, refreshDurationsMs: [],
      checkUpdateUI() {},
      updateUI() { this.tickCount = 0; this.pendingSimRecalc = this.refreshSuccessCount === 0; },
      scheduleNextTick() {},
    };
    try {
      clock.mockReturnValue(1000); tick.call(planner);
      clock.mockReturnValue(1100); tick.call(planner);
      expect(planner.refreshSuccessCount).toBe(1);
      clock.mockReturnValue(1400); tick.call(planner);
      expect(planner.refreshSuccessCount).toBe(2);
      expect(planner.uiDirty).toBe(false);
    } finally { clock.mockRestore(); }
  });
});
