import chroma from "chroma-js";
import { withBuildingCpsCache } from "./buildingCpsCache";
import { projectBuildingTrial } from "./projectionTrial";
import { getCurrentBuyCount } from "../core/lifecycle";
import type { Building, SimulateStatus, Upgrade } from "../types/game";
import type { CookiePaybackPlanner } from "../core/predictor";
import { Game } from "../core/globals";
import { getItemToken as getNormalizedItemToken, normalizeItemType } from "../strategy/selectors";

function getItemToken(me: Building | Upgrade) {
  return getNormalizedItemToken(me);
}

function getCookieBucket() {
  const cps = Math.max(1, Math.floor(Game.cookiesPs));
  return Math.floor(Game.cookies / cps);
}

function getBuffSignature(this: CookiePaybackPlanner) {
  const buffSummary = getTimedBuffWindowsSummary.call(this);
  return `${Math.floor(Game.unbuffedCps)}:${Math.floor(Game.cookiesPsRaw)}:${Math.floor(Game.globalCpsMult * 1000)}:${buffSummary}`;
}

const PASSIVE_MULT_KEYS = ["multCpS", "multCps"] as const;
const CLICK_MULT_KEYS = ["multClick", "multClicks", "multMouse"] as const;

type TimedCpsWindow = {
  remainingSec: number;
  passiveMult: number;
  clickMult: number;
};

function getTimedBuffObservationKey(buffSlot: string, buff: any, passiveMult: number, clickMult: number) {
  const name = String(buff?.name || buff?.dname || buff?.type || "buff");
  return `${buffSlot}:${name}:${passiveMult.toFixed(6)}x${clickMult.toFixed(6)}`;
}

function latchTimedBuffEndAt(
  this: CookiePaybackPlanner,
  buffObservationKey: string,
  observedRemainingSec: number,
  nowMs: number
): number {
  const observedEndAt = nowMs + observedRemainingSec * 1000;
  const existingEndAt = this.observedTimedBuffEndAt.get(buffObservationKey);
  if (typeof existingEndAt !== "number" || !Number.isFinite(existingEndAt)) {
    this.observedTimedBuffEndAt.set(buffObservationKey, observedEndAt);
    return observedEndAt;
  }
  const trackedRemainingSec = Math.max(0, (existingEndAt - nowMs) / 1000);
  // Buff refreshed or re-triggered; reset to the newly observed end point.
  if (observedRemainingSec > trackedRemainingSec + 0.75) {
    this.observedTimedBuffEndAt.set(buffObservationKey, observedEndAt);
    return observedEndAt;
  }
  return existingEndAt;
}

function cleanupObservedTimedBuffEndAt(this: CookiePaybackPlanner, activeObservationKeys: Set<string>, nowMs: number) {
  for (const [key, endAt] of this.observedTimedBuffEndAt) {
    if (activeObservationKeys.has(key)) {
      continue;
    }
    if (!Number.isFinite(endAt) || endAt <= nowMs + 1000) {
      this.observedTimedBuffEndAt.delete(key);
    }
  }
}

function getCurrentCookiePerClick() {
  const numericMouseCps = Number((Game as any).computedMouseCps);
  if (Number.isFinite(numericMouseCps) && numericMouseCps > 0) {
    return numericMouseCps;
  }
  const clickStr = String((Game as any).clickStr || "");
  const parsed = Number(clickStr.replace(/[^0-9eE+.-]/g, ""));
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 0;
}

function collectTimedBuffWindows(this: CookiePaybackPlanner, elapsedOffsetSec = 0): TimedCpsWindow[] {
  const buffs = ((Game as any).buffs ?? {}) as Record<string, any>;
  const fps = Number.isFinite(Game.fps) && (Game.fps as number) > 0 ? (Game.fps as number) : 30;
  const nowMs = Date.now();
  if (this.performanceExperiment.optimized) {
    return this.performanceExperiment.collect(buffs, fps, nowMs, elapsedOffsetSec);
  }
  const activeObservationKeys = new Set<string>();
  const windows: TimedCpsWindow[] = [];
  for (const [buffSlot, buff] of Object.entries(buffs)) {
    if (!buff || typeof buff !== "object") continue;
    let passiveMult = 1;
    let clickMult = 1;
    for (const key of PASSIVE_MULT_KEYS) {
      const value = Number((buff as any)[key]);
      if (Number.isFinite(value) && value > 0) {
        passiveMult *= value;
      }
    }
    for (const key of CLICK_MULT_KEYS) {
      const value = Number((buff as any)[key]);
      if (Number.isFinite(value) && value > 0) {
        clickMult *= value;
      }
    }
    if (passiveMult === 1 && clickMult === 1) continue;
    const rawRemaining = Number(buff.time);
    if (!Number.isFinite(rawRemaining) || rawRemaining <= 0) continue;
    const observedRemainingSec = rawRemaining / fps;
    if (!Number.isFinite(observedRemainingSec) || observedRemainingSec <= 0) continue;
    const observationKey = getTimedBuffObservationKey(buffSlot, buff, passiveMult, clickMult);
    activeObservationKeys.add(observationKey);
    const endAtMs = latchTimedBuffEndAt.call(this, observationKey, observedRemainingSec, nowMs);
    const remainingSec = (endAtMs - nowMs) / 1000 - Math.max(0, elapsedOffsetSec);
    if (!Number.isFinite(remainingSec) || remainingSec <= 0) continue;
    windows.push({ remainingSec, passiveMult, clickMult });
  }
  cleanupObservedTimedBuffEndAt.call(this, activeObservationKeys, nowMs);
  return windows;
}

function getTimedBuffWindowsSummary(this: CookiePaybackPlanner) {
  if (this.performanceExperiment.optimized) {
    const fps = Number.isFinite(Game.fps) && (Game.fps as number) > 0 ? (Game.fps as number) : 30;
    return this.performanceExperiment.summary((Game as any).buffs ?? {}, fps, Date.now());
  }
  collectTimedBuffWindows.call(this, 0);
  const buffs = ((Game as any).buffs ?? {}) as Record<string, any>;
  const normalized = Object.entries(buffs)
    .map(([buffSlot, buff]) => {
      if (!buff || typeof buff !== "object") return "";
      const remain = Number(buff.time);
      if (!Number.isFinite(remain) || remain <= 0) return "";
      let passiveMult = 1;
      let clickMult = 1;
      for (const key of PASSIVE_MULT_KEYS) {
        const value = Number((buff as any)[key]);
        if (Number.isFinite(value) && value > 0) {
          passiveMult *= value;
        }
      }
      for (const key of CLICK_MULT_KEYS) {
        const value = Number((buff as any)[key]);
        if (Number.isFinite(value) && value > 0) {
          clickMult *= value;
        }
      }
      if (passiveMult === 1 && clickMult === 1) return "";
      const key = getTimedBuffObservationKey(buffSlot, buff, passiveMult, clickMult);
      const endAtMs = this.observedTimedBuffEndAt.get(key);
      const endAtSec = Number.isFinite(endAtMs) ? Math.floor((endAtMs as number) / 1000) : 0;
      return `${key}@${endAtSec}`;
    })
    .filter((value) => value)
    .sort();
  if (!normalized.length) return "0";
  return normalized.join(",");
}

function estimateWaitWithTimedWindows(
  remainingCookies: number,
  basePassiveCps: number,
  baseClickCps: number,
  timedWindows: TimedCpsWindow[]
) {
  if (!Number.isFinite(remainingCookies) || remainingCookies <= 0) {
    return 0;
  }
  const safeBasePassiveCps = Math.max(0, basePassiveCps);
  const safeBaseClickCps = Math.max(0, baseClickCps);
  if (!timedWindows.length) {
    const cps = safeBasePassiveCps + safeBaseClickCps;
    return cps <= 0 ? Infinity : remainingCookies / cps;
  }
  const breakpoints = [...new Set(timedWindows.map((window) => window.remainingSec).filter((sec) => sec > 0))]
    .sort((a, b) => a - b);
  let elapsed = 0;
  let remaining = remainingCookies;
  for (const breakpoint of breakpoints) {
    const duration = Math.max(0, breakpoint - elapsed);
    if (duration <= 0) {
      elapsed = breakpoint;
      continue;
    }
    let passiveMult = 1;
    let clickMult = 1;
    for (const window of timedWindows) {
      if (window.remainingSec > elapsed) {
        passiveMult *= window.passiveMult;
        clickMult *= window.clickMult;
      }
    }
    const segmentCps = safeBasePassiveCps * passiveMult + safeBaseClickCps * passiveMult * clickMult;
    if (segmentCps > 0) {
      const produced = segmentCps * duration;
      if (produced >= remaining) {
        return elapsed + remaining / segmentCps;
      }
      remaining -= produced;
    }
    elapsed = breakpoint;
  }
  const steadyCps = safeBasePassiveCps + safeBaseClickCps;
  if (steadyCps <= 0) {
    return Infinity;
  }
  return elapsed + remaining / steadyCps;
}

export function sampleSmoothedClickCps(this: CookiePaybackPlanner) {
  const now = Date.now();
  const cookieClicks = Number((Game as any).cookieClicks);
  if (!Number.isFinite(cookieClicks)) {
    return this.smoothedClickCps;
  }
  if (this.lastClickSampleAt <= 0) {
    this.lastClickSampleAt = now;
    this.lastCookieClicks = cookieClicks;
    return this.smoothedClickCps;
  }
  const clickDelta = Math.max(0, cookieClicks - this.lastCookieClicks);
  if (clickDelta > 0) {
    const cookiePerClick = getCurrentCookiePerClick();
    const clickedCookies = Math.max(0, clickDelta * cookiePerClick);
    this.manualClickRateWindow.add(clickedCookies, now);
  }
  this.smoothedClickCps = this.manualClickRateWindow.ratePerSec(now);
  this.lastClickCpsRaw = this.smoothedClickCps;
  this.lastClickSampleAt = now;
  this.lastCookieClicks = cookieClicks;
  return this.smoothedClickCps;
}

function getSimulationKey(this: CookiePaybackPlanner, me: Building | Upgrade) {
  const bank = this.getBankCookies();
  const price = Math.floor(me.getPrice());
  const itemType = normalizeItemType(me);
  const common = [
    me.id,
    itemType,
    me.amount,
    me.bought,
    Game.unbuffedCps,
    Game.cookiesPsRaw,
    price,
    Math.floor(bank),
    getCookieBucket(),
    Math.max(0, Number.isFinite(this.smoothedClickCps) ? this.smoothedClickCps : 0),
    getBuffSignature.call(this),
    this.config.sortGrandmapocalypse ? 1 : 0,
    this.config.sortWizardTower ? 1 : 0,
    this.getCurrentBuyCount(),
  ];
  if (itemType === "building") {
    const building = me as Building;
    const tierUnlock = Object.values(building.tieredUpgrades || {})
      .map((u) => `${u.id}:${u.bought}`)
      .join(",");
    common.push(tierUnlock);
  }
  return common.join("|");
}

export function estimateWaitSeconds(
  this: CookiePaybackPlanner,
  price: number,
  cookies: number,
  cps: number,
  elapsedOffsetSec = 0
) {
  return estimateWaitWithBank.call(this, price, cookies, cps, elapsedOffsetSec, this.getBankCookies());
}

function estimateWaitWithBank(
  this: CookiePaybackPlanner,
  price: number,
  cookies: number,
  cps: number,
  elapsedOffsetSec: number,
  bank: number
) {
  const remaining = price + bank - cookies;
  if (remaining <= 0) {
    return 0;
  }
  const timedWindows = collectTimedBuffWindows.call(this, elapsedOffsetSec);
  let passiveMultNow = 1;
  let clickMultNow = 1;
  for (const window of timedWindows) {
    passiveMultNow *= window.passiveMult;
    clickMultNow *= window.clickMult;
  }
  const currentClickCps = Math.max(0, Number.isFinite(this.smoothedClickCps) ? this.smoothedClickCps : 0);
  const basePassiveCps = Math.max(0, cps) / Math.max(1e-6, passiveMultNow);
  const baseClickCps = currentClickCps / Math.max(1e-6, passiveMultNow * clickMultNow);
  if (this.performanceExperiment.optimized && this.performanceExperiment.variant === "compiled") {
    return this.performanceExperiment.estimate(remaining, basePassiveCps, baseClickCps, timedWindows);
  }
  return estimateWaitWithTimedWindows(remaining, basePassiveCps, baseClickCps, timedWindows);
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[index];
}

function recordProfiler(this: CookiePaybackPlanner, durationMs: number, wasComputed: boolean, simulated = wasComputed) {
  if (simulated && Number.isFinite(durationMs) && durationMs > 0) {
    this.simulationCostMs = this.simulationCostMs > 0
      ? this.simulationCostMs * .8 + durationMs * .2 : durationMs;
  }
  if (!this.config.enablePerfProfiler) {
    return;
  }
  if (!this.profilerWindowStartedAt) {
    this.profilerWindowStartedAt = Date.now();
  }
  this.profilerCallCount++;
  if (wasComputed) {
    this.profilerComputeCount++;
  }
  this.profilerDurationsMs.push(durationMs);

  const elapsedMs = Date.now() - this.profilerWindowStartedAt;
  if (elapsedMs < 5000) {
    return;
  }
  const callsPerSec = this.profilerCallCount / Math.max(1, elapsedMs / 1000);
  const avgMs =
    this.profilerDurationsMs.reduce((acc, value) => acc + value, 0) / Math.max(1, this.profilerDurationsMs.length);
  const p95Ms = percentile(this.profilerDurationsMs, 95);
  this.profilerLastAvgMs = avgMs;
  this.profilerLastP95Ms = p95Ms;
  console.log(
    `[CPP profiler] updateBestCpsAcceleration calls/s=${callsPerSec.toFixed(2)} avg=${avgMs.toFixed(3)}ms p95=${p95Ms.toFixed(3)}ms computed=${this.profilerComputeCount}/${this.profilerCallCount}`,
  );
  this.profilerWindowStartedAt = Date.now();
  this.profilerCallCount = 0;
  this.profilerComputeCount = 0;
  this.profilerDurationsMs = [];
}

export function tuneAdaptiveBudget(this: CookiePaybackPlanner) {
  const observed = Math.max(this.simulationCostMs, this.profilerLastAvgMs, this.profilerLastP95Ms * 0.6);
  if (!Number.isFinite(observed) || observed <= 0) {
    this.adaptiveBudget = Math.max(this.minBudget, Math.min(this.maxBudget, this.simBudgetPerRefresh));
    return this.adaptiveBudget;
  }
  const rawTarget = Math.floor(this.targetComputeMsPerRefresh / observed);
  const targetBudget = Math.max(this.minBudget, Math.min(this.maxBudget, rawTarget));
  if (targetBudget < this.adaptiveBudget) {
    this.adaptiveBudget = Math.max(this.minBudget, this.adaptiveBudget - this.budgetBackoffStep);
  } else if (targetBudget > this.adaptiveBudget) {
    this.adaptiveBudget = Math.min(this.maxBudget, this.adaptiveBudget + 1);
  }
  return this.adaptiveBudget;
}

export function getBankCookies(this: CookiePaybackPlanner) {
  return Number(this.config.isBanking) * Number(this.config.bankingSeconds) * Game.cookiesPsRaw;
}

export function calcCookieTimesCost(
  this: CookiePaybackPlanner,
  price: number,
  oldCps: number,
  sim: SimulateStatus
) {
  const bank = this.getBankCookies();
  if (sim.currentCookies >= price + bank) {
    sim.paidCookies += price;
    sim.currentCookies -= price;
  } else if (sim.currentCookies < price + bank && sim.currentCookies >= bank) {
    sim.waitTime += this.estimateWaitSeconds(price, sim.currentCookies, oldCps, sim.waitTime);
    sim.paidCookies += sim.currentCookies - bank;
    sim.currentCookies = bank;
  } else {
    sim.waitTime += this.estimateWaitSeconds(price, sim.currentCookies, oldCps, sim.waitTime);
    sim.currentCookies = bank;
  }
}

export function isIgnored(this: CookiePaybackPlanner, me: Building | Upgrade) {
  return (
    (!this.config.sortGrandmapocalypse && ["One mind", "Communal brainsweep", "Elder Pact"].includes(me.name)) ||
    (!this.config.sortWizardTower && me.name == "Wizard tower") ||
    me.pool === "toggle" ||
    (me.isVaulted && me.isVaulted())
  );
}

export function enterSandBox(this: CookiePaybackPlanner, me: Building | Upgrade) {
  const save = {
    item: me,
    amount: me.amount,
    bought: me.bought,
    Logic: Game.Logic,
    Win: Game.Win,
    cookiesPsRawHighest: Game.cookiesPsRawHighest,
    CpsAchievements: Game.CpsAchievements,
  };
  Game.Logic = function () {};
  Game.Win = function () {};
  return save;
}

export function leaveSandBox(this: CookiePaybackPlanner, save: ReturnType<typeof enterSandBox>) {
  save.item.amount = save.amount;
  save.item.bought = save.bought;
  Game.CpsAchievements = save.CpsAchievements;
  Game.cookiesPsRawHighest = save.cookiesPsRawHighest;
  Game.Win = save.Win;
  Game.Logic = save.Logic;
  Game.CalculateGains();
}

export function initSimData(this: CookiePaybackPlanner) {
  const sim: SimulateStatus = {
    originalCookies: Game.cookies,
    currentCookies: Game.cookies,
    paidCookies: 0,
    waitTime: 0,
  };
  return sim;
}

export function updateBestCpsAcceleration(this: CookiePaybackPlanner, me: Building | Upgrade) {
  const startedAt = performance.now();
  const simKey = getSimulationKey.call(this, me);
  const cacheKey = getItemToken(me);
  const now = Date.now();
  const lastComputedAt = this.lastComputedAtByItem.get(cacheKey) ?? 0;
  const isStale = now - lastComputedAt >= this.maxStalenessMs;
  const cached = this.simCache.get(cacheKey);
  if (!isStale && cached && cached.key === simKey) {
    me.BestCpsAcceleration = cached.bestCpsAcceleration;
    me.BestBuyToAmount = cached.bestBuyToAmount;
    me.BestWaitTime = cached.bestWaitTime;
    recordProfiler.call(this, performance.now() - startedAt, false);
    return;
  }
  if (this.simBudgetRemaining <= 0 && cached) {
    me.BestCpsAcceleration = cached.bestCpsAcceleration;
    me.BestBuyToAmount = cached.bestBuyToAmount;
    me.BestWaitTime = cached.bestWaitTime;
    this.pendingSimRecalc = true;
    this.uiDirty = true;
    this.highPriorityIds.add(cacheKey);
    recordProfiler.call(this, performance.now() - startedAt, false);
    return;
  }
  this.simBudgetRemaining = Math.max(0, this.simBudgetRemaining - 1);

  me.BestCpsAcceleration = 0;
  me.BestBuyToAmount = 0;
  me.BestWaitTime = Infinity;

  if (this.isIgnored(me) || Game.cookies === 0) {
    this.simCache.set(cacheKey, {
      key: simKey,
      bestCpsAcceleration: me.BestCpsAcceleration,
      bestBuyToAmount: me.BestBuyToAmount,
      bestWaitTime: me.BestWaitTime,
    });
    this.lastComputedAtByItem.set(cacheKey, Date.now());
    this.highPriorityIds.delete(cacheKey);
    recordProfiler.call(this, performance.now() - startedAt, true, false);
    return;
  }

  const oldCps = Game.unbuffedCps;
  const sim = this.initSimData();
  let temporaryTier: Upgrade | null = null;
  let temporaryTierBought = 0;
  const compute = () => {
    const projected = this.performanceExperiment.productionProjectionEnabled && nativeMethods
      && this.isIgnored === isIgnored && this.initSimData === initSimData
      ? projectBuildingTrial(Game, me, this.getCurrentBuyCount(), Number(this.config.isBanking) * Number(this.config.bankingSeconds),
        (price, cookies, cps, elapsed, bank) => estimateWaitWithBank.call(this, price, cookies, cps, elapsed, bank), reason => {
          const reasons = this.performanceExperiment.projectionFallbackReasons;
          reasons[reason] = (reasons[reason] || 0) + 1;
        }) : undefined;
    if (projected) {
      // Preserve the base refresh and its achievement/mouse/lump side effects.
      Game.CalculateGains();
      me.BestCpsAcceleration = projected.bestCpsAcceleration;
      me.BestBuyToAmount = projected.bestBuyToAmount;
      me.BestWaitTime = projected.bestWaitTime;
      this.performanceExperiment.projectionSupportedCandidates++;
    } else {
      const save = this.enterSandBox(me);
      try {
        if (me.type == "upgrade") {
          this.calcCookieTimesCost(me.getPrice(), Game.unbuffedCps, sim);
          me.amount++;
          me.bought++;
          Game.CalculateGains();
          me.BestWaitTime = sim.waitTime + sim.paidCookies / Game.unbuffedCps;
          if (me.BestWaitTime === 0) me.BestWaitTime = Infinity;
          me.BestCpsAcceleration = (Game.unbuffedCps - oldCps) / me.BestWaitTime;
        } else {
          const building = me as Building;
          const buyCount = this.getCurrentBuyCount();
          let nextTierUpgrade = null as Upgrade | null;
          let amountToUnlockTier = 0;
          let nextTierUnlocked = false;
          const lockedTiers = Object.values(building.tieredUpgrades || {}).filter(
            (e) => Game.Tiers[e.tier].unlock !== -1 && e.buildingTie.bought < Game.Tiers[e.tier].unlock
          );
          if (lockedTiers.length) {
            amountToUnlockTier = Game.Tiers[lockedTiers[0].tier].unlock;
            if (amountToUnlockTier <= me.bought + 15) {
              nextTierUpgrade = lockedTiers[0];
              temporaryTier = nextTierUpgrade;
              temporaryTierBought = nextTierUpgrade.bought;
            }
          }

          const maxUnitsToExplore = 50;
          const maxSteps = Math.max(1, Math.ceil(maxUnitsToExplore / Math.max(1, buyCount)));
          for (let step = 0; step < maxSteps; step++) {
            const units = buyCount - building.amount % buyCount;
            for (let i = 0; i < units; i++) {
              this.calcCookieTimesCost(building.getPrice(), Game.unbuffedCps, sim);
              building.amount++;
              building.bought++;
              Game.CalculateGains();
            }
            if (nextTierUpgrade && !nextTierUnlocked && building.amount >= amountToUnlockTier) {
              this.calcCookieTimesCost(nextTierUpgrade.getPrice(), Game.unbuffedCps, sim);
              nextTierUpgrade.bought = 1;
              nextTierUnlocked = true;
              Game.CalculateGains();
            }
            const waitTime = sim.waitTime + sim.paidCookies / Game.unbuffedCps;
            const cpsAcceleration = (Game.unbuffedCps - oldCps) / waitTime;
            if (cpsAcceleration > me.BestCpsAcceleration) {
              me.BestCpsAcceleration = cpsAcceleration;
              me.BestBuyToAmount = building.amount;
              me.BestWaitTime = waitTime;
            } else if (nextTierUpgrade === null || building.amount > amountToUnlockTier) {
              break;
            }
          }
        }
      } finally {
        if (temporaryTier) temporaryTier.bought = temporaryTierBought;
        this.leaveSandBox(save);
      }
    }
    this.simCache.set(cacheKey, {
      key: simKey,
      bestCpsAcceleration: me.BestCpsAcceleration,
      bestBuyToAmount: me.BestBuyToAmount,
      bestWaitTime: me.BestWaitTime,
    });
    this.lastComputedAtByItem.set(cacheKey, Date.now());
    this.highPriorityIds.delete(cacheKey);
    recordProfiler.call(this, performance.now() - startedAt, true);
  };
  const nativeMethods = this.enterSandBox === enterSandBox && this.leaveSandBox === leaveSandBox
    && this.getCurrentBuyCount === getCurrentBuyCount && this.calcCookieTimesCost === calcCookieTimesCost
    && this.getBankCookies === getBankCookies && this.estimateWaitSeconds === estimateWaitSeconds
    && !this.performanceExperiment.optimized;
  return this.performanceExperiment.buildingCpsCacheEnabled && nativeMethods
    ? withBuildingCpsCache(Game, sandbox => sandbox(me, compute), this.performanceExperiment.buildingCpsModelEnabled,
      (nodes, amounts) => this.performanceExperiment.acquireBuildingCpsModel(nodes, amounts)) : compute();
}

export function updateHelperOrder(this: CookiePaybackPlanner, all: Array<Building | Upgrade>) {
  all.forEach((e) => (e.BestHelperOrder = 0));
  all = all.filter((e) => !this.isIgnored(e));
  if (!all.length) {
    return;
  }

  let helperOrder = 0;
  let target = all[0];
  const maxChains = Math.max(1, Math.floor(this.config.maxHelperChains));
  let chainCount = 0;

  while (target.getPrice() > Game.cookies && chainCount < maxChains) {
    chainCount++;
    target.timeToTargetCookie = (target.getPrice() - Game.cookies) / Game.unbuffedCps;
    const helpers: Array<Building | Upgrade> = [];
    for (const e of all) {
      if (e !== target && e.getPrice() < target.getPrice() && e.SingleCps != 0) {
        helpers.push(e);
      }
    }
    if (!helpers.length) return;
    for (const me of helpers) {
      const save = this.enterSandBox(me);
      try {
      const sim = this.initSimData();

      me.timeToTargetCookie = Infinity;
      const maxHelperBuys = Math.max(1, Math.floor(this.config.maxHelperBuysPerItem));
      for (let buy = 1; buy <= maxHelperBuys; buy++) {
        this.helperExpandedNodes++;
        this.calcCookieTimesCost(me.getPrice(), Game.unbuffedCps, sim);
        me.amount++;
        me.bought++;
        Game.CalculateGains();
        const simTarget = Object.assign({}, sim);
        this.calcCookieTimesCost(target.getPrice(), Game.unbuffedCps, simTarget);
        if (simTarget.waitTime >= target.timeToTargetCookie || simTarget.waitTime >= me.timeToTargetCookie) {
          break;
        } else {
          me.timeToTargetCookie = simTarget.waitTime;
          me.BestHelperAmount = me.amount;
        }
        if (me.type == "upgrade") break;
      }
      if (me.timeToTargetCookie === Infinity) {
        this.helperAbortedByBudget++;
      }

      } finally {
        this.leaveSandBox(save);
      }
    }

    helpers.sort((a, b) => a.timeToTargetCookie - b.timeToTargetCookie);
    if (helpers[0].timeToTargetCookie >= target.timeToTargetCookie) return;
    helperOrder++;
    helpers[0].BestHelperOrder = helperOrder;
    target = helpers[0];
  }
}

export function updateColorRender(
  this: CookiePaybackPlanner,
  all: Array<Building | Upgrade>,
  scoreByItem?: Map<string, number>
) {
  const scoreList = [
    ...new Set(all.map((e) => scoreByItem?.get(getItemToken(e)) ?? e.BestCpsAcceleration).filter((e) => Number.isFinite(e))),
  ].sort((a, b) => b - a);
  const colorGroups = [
    [this.config.colorLast, scoreList[scoreList.length - 1]],
    [this.config.color15, scoreList[15]],
    [this.config.color7, scoreList[7]],
    [this.config.color1, scoreList[1]],
    [this.config.color0, scoreList[0]],
  ].filter((e) => e[1] !== undefined);
  this.colorRender = chroma
    .scale(colorGroups.map((e) => e[0] as string))
    .mode("lab")
    .domain(colorGroups.map((e) => e[1] as number))
    .out("hex") as (value: number) => string;
}

export function calcWaitingTime(this: CookiePaybackPlanner, me: Building | Upgrade) {
  const seconds = this.estimateWaitSeconds(me.getPrice(), Game.cookies, Game.unbuffedCps);
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const a = [
    Math.floor(seconds / 60 / 60 / 24 / 30 / 12) + "y",
    Math.floor(seconds / 60 / 60 / 24 / 30 % 12) + "m",
    Math.floor(seconds / 60 / 60 / 24 % 30) + "d",
    Math.floor(seconds / 60 / 60 % 24) + "H",
    Math.floor(seconds / 60 % 60) + "M",
    Math.floor(seconds % 60) + "S",
  ];
  while (a.length && ["0y", "0m", "0d", "0H", "0M"].includes(a[0])) a.shift();
  if (Math.floor(seconds / 60 / 60 / 24 / 30 / 12) > 1000) {
    return ">1000y";
  }
  return a.slice(0, 2).join();
}
