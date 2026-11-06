import { createBuildingCpsModel, type BuildingCpsNode } from "./buildingCpsModel";
import type { CookiePaybackPlanner } from "../core/predictor";

export type PerformanceVariant = "baseline" | "indexed" | "compiled" | "search";
export type TimedWindow = { remainingSec: number; passiveMult: number; clickMult: number; endAtMs?: number };
type BuffEntry = { slot: string; ref: any; values: unknown[]; key: string; time: number; passive: number; click: number };
type Segment = { index: number; passive: number; click: number };
const fields = ["name", "dname", "type", "time", "multCpS", "multCps", "multClick", "multClicks", "multMouse"];
const multiply = (values: unknown[]) => values.reduce<number>((product, raw) => {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? product * value : product;
}, 1);

/** A cache belongs to one synchronous refresh, including nested refresh isolation. */
export class PerformanceExperiment {
  buildingCpsCacheEnabled = false;
  buildingCpsModelEnabled = false;
  productionProjectionEnabled = true;
  projectionSupportedCandidates = 0;
  projectionFallbackReasons: Record<string, number> = {};
  private counters = { indexBuilds: 0, indexHits: 0, compilations: 0, compiledHits: 0, indexedQueries: 0, compiledQueries: 0 };
  private current: PerformanceVariant = "baseline";
  private originalAlgorithm: "beam" | "astar" | null = null;
  private context: { entries: BuffEntry[] | null; fps: number; signature: string; segments: Segment[] } | null = null;
  private buildingModelContext: { model?: ReturnType<typeof createBuildingCpsModel> } | null = null;
  acquireBuildingCpsModel(nodes: BuildingCpsNode[], amounts: number[]) {
    const context = this.buildingModelContext;
    if (!context) return createBuildingCpsModel(nodes, amounts);
    if (context.model) context.model.rebase(nodes, amounts);
    else context.model = createBuildingCpsModel(nodes, amounts);
    return context.model;
  }
  constructor(private planner: CookiePaybackPlanner) {}
  get variant() { return this.current; }
  get metadata() { return { variant: this.current, scoped: this.context !== null, modelVersion: 1, productionDefault: "guarded-projection", ...this.counters }; }
  get optimized() { return this.context !== null && (this.current === "indexed" || this.current === "compiled"); }
  withRefresh<T>(run: () => T): T {
    const previous = this.context;
    const previousModel = this.buildingModelContext;
    this.buildingModelContext = {};
    this.context = this.current === "indexed" || this.current === "compiled"
      ? { entries: null, fps: 0, signature: "", segments: [] } : null;
    try { return run(); } finally { this.context = previous; this.buildingModelContext = previousModel; }
  }
  setVariant(variant: PerformanceVariant) {
    if (!["baseline", "indexed", "compiled", "search"].includes(variant)) throw new Error("Unknown performance variant");
    if (this.originalAlgorithm === null) this.originalAlgorithm = this.planner.config.strategyAlgorithm;
    this.current = variant;
    this.context = null;
    this.buildingModelContext = null;
    this.planner.config.strategyAlgorithm = variant === "search" ? "astar" : this.originalAlgorithm;
    this.reset();
  }
  restore() {
    this.current = "baseline";
    this.context = null;
    this.buildingModelContext = null;
    if (this.originalAlgorithm !== null) this.planner.config.strategyAlgorithm = this.originalAlgorithm;
    this.originalAlgorithm = null;
    this.reset();
  }
  private reset() {
    this.counters = { indexBuilds: 0, indexHits: 0, compilations: 0, compiledHits: 0, indexedQueries: 0, compiledQueries: 0 };
    const p = this.planner;
    p.simCache.clear(); p.lastComputedAtByItem.clear(); p.highPriorityIds.clear(); p.notationCache.clear();
    p.observedTimedBuffEndAt.clear();
    const state = p.strategyState;
    state.scoreByItem.clear(); state.frontier = []; state.stateSignature = "";
    state.lastRefreshAt = 0; state.lastFullRefreshAt = 0; state.incrementalStreak = 0;
    state.refreshDurationsMs = []; state.runs = 0; state.fullRuns = 0; state.incrementalRuns = 0;
    state.expandedNodes = 0; state.openPeak = 0; state.timeoutCount = 0; state.budgetHitCount = 0;
    state.astarBudgetHitCount = 0; state.fallbackCount = 0; state.astarFallbackCount = 0;
    p.strategyScoreByItem = state.scoreByItem; p.lastStrategyFrontier = []; p.lastBeamFrontier = [];
    p.lastStrategyRefreshAt = 0; p.lastFullStrategyRefreshAt = 0; p.lastStrategyStateSignature = "";
    p.profilerDurationsMs = []; p.profilerCallCount = 0; p.profilerComputeCount = 0;
    p.profilerWindowStartedAt = 0; p.profilerLastAvgMs = 0; p.profilerLastP95Ms = 0;
    p.refreshDurationsMs = []; p.strategyRefreshDurationsMs = [];
    p.refreshAttemptCount = 0; p.refreshSuccessCount = 0; p.refreshSkipCount = 0;
    p.adaptiveBudget = 12; p.tickCount = 0; p.lastUiRefreshAt = 0;
    p.purchaseRateWindow.reset(); p.autoBuyRateWindow.reset(); p.manualClickRateWindow.reset();
    p.smoothedClickCps = 0; p.lastClickCpsRaw = 0; p.lastClickSampleAt = 0;
    p.strategyClickBucket = 0; p.strategyClickBucketLastUpdatedAt = 0;
    p.autoBuyBestCandidate = null; p.autoBuyBestCandidateToken = ""; p.autoBuyBestCandidateAt = 0; p.autoBuyTopCandidates = [];
    p.uiDirty = true; p.pendingSimRecalc = true;
  }
  private entries(buffs: Record<string, any>, fps: number) {
    const context = this.context!;
    const raw = Object.entries(buffs).filter(([, buff]) => buff && typeof buff === "object")
      .map(([slot, ref]) => ({ slot, ref, values: fields.map(field => ref[field]) }));
    if (context.entries && context.fps === fps && raw.length === context.entries.length && raw.every((entry, i) => {
      const old = context.entries![i];
      return entry.slot === old.slot && entry.ref === old.ref && entry.values.every((value, j) =>
        (value === null || typeof value !== "object" && typeof value !== "function") && Object.is(value, old.values[j]));
    })) { this.counters.indexHits++; return context.entries; }
    this.counters.indexBuilds++;
    context.fps = fps;
    context.entries = raw.map(entry => {
      const passive = multiply(entry.values.slice(4, 6));
      const click = multiply(entry.values.slice(6, 9));
      const name = String(entry.values[0] || entry.values[1] || entry.values[2] || "buff");
      return { ...entry, key: `${entry.slot}:${name}:${passive.toFixed(6)}x${click.toFixed(6)}`, time: Number(entry.values[3]), passive, click };
    });
    context.signature = "";
    context.segments = [];
    return context.entries;
  }
  collect(buffs: Record<string, any>, fps: number, now: number, offset = 0) {
    this.counters.indexedQueries++;
    const windows: TimedWindow[] = [];
    const active = new Set<string>();
    const ends = this.planner.observedTimedBuffEndAt;
    for (const entry of this.entries(buffs, fps)) {
      if (entry.passive === 1 && entry.click === 1) continue;
      const seconds = entry.time / fps;
      if (!Number.isFinite(entry.time) || entry.time <= 0 || !Number.isFinite(seconds) || seconds <= 0) continue;
      active.add(entry.key);
      let end = ends.get(entry.key);
      if (typeof end !== "number" || !Number.isFinite(end) || seconds > Math.max(0, (end - now) / 1000) + 0.75) {
        end = now + seconds * 1000; ends.set(entry.key, end);
      }
      const remainingSec = (end - now) / 1000 - Math.max(0, offset);
      if (Number.isFinite(remainingSec) && remainingSec > 0) windows.push({ remainingSec, passiveMult: entry.passive, clickMult: entry.click, endAtMs: end });
    }
    for (const [key, end] of ends) if (!active.has(key) && (!Number.isFinite(end) || end <= now + 1000)) ends.delete(key);
    return windows;
  }
  summary(buffs: Record<string, any>, fps: number, now: number) {
    this.collect(buffs, fps, now);
    const ends = this.planner.observedTimedBuffEndAt;
    return this.entries(buffs, fps).filter(entry => Number.isFinite(entry.time) && entry.time > 0 && (entry.passive !== 1 || entry.click !== 1))
      .map(entry => `${entry.key}@${Number.isFinite(ends.get(entry.key)) ? Math.floor(ends.get(entry.key)! / 1000) : 0}`).sort().join(",") || "0";
  }
  estimate(remaining: number, passiveCps: number, clickCps: number, windows: TimedWindow[]) {
    this.counters.compiledQueries++;
    if (!Number.isFinite(remaining) || remaining <= 0) return 0;
    const context = this.context!;
    // Absolute ends permit reuse while query-relative durations continue to read time.
    const signature = windows.map(w => `${w.endAtMs ?? w.remainingSec}:${w.passiveMult}:${w.clickMult}`).join("|");
    if (signature !== context.signature || !context.segments.length && windows.length) {
      this.counters.compilations++;
      const indices = [...new Set(windows.map(w => w.remainingSec).filter(sec => sec > 0))].sort((a, b) => a - b)
        .map(sec => windows.findIndex(w => w.remainingSec === sec));
      let elapsed = 0;
      context.segments = indices.map(index => {
        let passive = 1, click = 1;
        for (const w of windows) if (w.remainingSec > elapsed) { passive *= w.passiveMult; click *= w.clickMult; }
        elapsed = windows[index].remainingSec;
        return { index, passive, click };
      });
      context.signature = signature;
    } else this.counters.compiledHits++;
    let elapsed = 0;
    passiveCps = Math.max(0, passiveCps); clickCps = Math.max(0, clickCps);
    for (const segment of context.segments) {
      const breakpoint = windows[segment.index].remainingSec;
      const duration = Math.max(0, breakpoint - elapsed);
      const cps = passiveCps * segment.passive + clickCps * segment.passive * segment.click;
      if (cps > 0 && duration > 0) {
        const produced = cps * duration;
        if (produced >= remaining) return elapsed + remaining / cps;
        remaining -= produced;
      }
      elapsed = breakpoint;
    }
    const steady = passiveCps + clickCps;
    return steady <= 0 ? Infinity : elapsed + remaining / steady;
  }
}
