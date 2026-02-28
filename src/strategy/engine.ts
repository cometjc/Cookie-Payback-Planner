import type { Building, Upgrade } from "../types/game";
import type { CookiePaybackPlanner } from "../core/predictor";
import { Game } from "../core/globals";
import {
  assignBaselineStrategyScores,
  buildCandidatePool,
  deriveDynamicHorizon,
  getStrategyStateSignature,
  runAStarSearch,
  runBeamSearch,
  runIncrementalAStarSearch,
  runIncrementalBeamSearch,
} from "../search/algorithms";

function canReuseIncrementalState(planner: CookiePaybackPlanner, signature: string, now: number) {
  if (!planner.strategyState.frontier.length) return false;
  if (!planner.strategyState.stateSignature || planner.strategyState.stateSignature !== signature) return false;
  const streakLimit =
    planner.config.strategyAlgorithm === "astar"
      ? Math.max(1, planner.config.strategyAStarMaxIncrementalStreak)
      : Math.max(1, planner.config.strategyMaxIncrementalStreak);
  if (planner.strategyState.incrementalStreak >= streakLimit) return false;
  if (now - planner.strategyState.lastFullRefreshAt >= Math.max(300, planner.config.strategyFullRefreshMs)) return false;
  return true;
}

function refreshStrategyClickBucket(planner: CookiePaybackPlanner, now: number) {
  const refreshMs = 30000;
  if (planner.strategyClickBucketLastUpdatedAt <= 0 || now - planner.strategyClickBucketLastUpdatedAt >= refreshMs) {
    planner.strategyClickBucket = Math.floor(planner.smoothedClickCps || 0);
    planner.strategyClickBucketLastUpdatedAt = now;
  }
  return planner.strategyClickBucket;
}

function getBuffSignatureForInvalidation(planner: CookiePaybackPlanner, now: number) {
  const PASSIVE_MULT_KEYS = ["multCpS", "multCps"] as const;
  const CLICK_MULT_KEYS = ["multClick", "multClicks", "multMouse"] as const;
  const buffs = ((Game as any).buffs ?? {}) as Record<string, any>;
  const timedBuffs = Object.values(buffs)
    .map((buff) => {
      const remain = Number(buff?.time);
      if (!Number.isFinite(remain) || remain <= 0) return "";
      let passiveMult = 1;
      let clickMult = 1;
      for (const key of PASSIVE_MULT_KEYS) {
        const value = Number(buff?.[key]);
        if (Number.isFinite(value) && value > 0) {
          passiveMult *= value;
        }
      }
      for (const key of CLICK_MULT_KEYS) {
        const value = Number(buff?.[key]);
        if (Number.isFinite(value) && value > 0) {
          clickMult *= value;
        }
      }
      if (passiveMult === 1 && clickMult === 1) return "";
      const name = String(buff?.name || buff?.dname || buff?.type || "buff");
      return `${name}:${passiveMult.toFixed(3)}x${clickMult.toFixed(3)}`;
    })
    .filter((value) => value)
    .sort()
    .join(",");
  const clickBucket = refreshStrategyClickBucket(planner, now);
  return `${Math.floor(Game.unbuffedCps)}:${Math.floor(Game.cookiesPsRaw)}:${Math.floor(Game.globalCpsMult * 1000)}:${clickBucket}:${timedBuffs}`;
}

export function invalidateForExternalChange(planner: CookiePaybackPlanner) {
  planner.strategyState.frontier = [];
  planner.lastBeamFrontier = [];
  planner.strategyState.stateSignature = "";
  planner.strategyState.incrementalStreak = 0;
  planner.strategyState.lastFullRefreshAt = 0;
}

export function getStableStrategyScore(this: CookiePaybackPlanner, token: string, nextScore: number) {
  const previous = this.strategyState.scoreByItem.get(token);
  if (previous === undefined) {
    this.strategyState.scoreByItem.set(token, nextScore);
    this.strategyScoreByItem = this.strategyState.scoreByItem;
    return nextScore;
  }
  const alpha = Math.max(0, Math.min(0.95, this.config.strategySmoothing));
  const smoothed = previous * alpha + nextScore * (1 - alpha);
  this.strategyState.scoreByItem.set(token, smoothed);
  this.strategyScoreByItem = this.strategyState.scoreByItem;
  return smoothed;
}

export function refreshStrategyScores(planner: CookiePaybackPlanner, all: Array<Building | Upgrade>, now: number) {
  if (
    now - planner.strategyState.lastRefreshAt < Math.max(100, planner.config.strategyRecomputeMs) &&
    planner.strategyState.scoreByItem.size
  ) {
    return;
  }

  planner.strategyState.runs++;
  const strategyStartedAt = performance.now();
  const horizons = deriveDynamicHorizon(planner, all);
  planner.strategyState.currentHorizonShortSec = horizons.shortSec;
  planner.strategyState.currentHorizonLongSec = horizons.longSec;
  planner.strategyCurrentHorizonShortSec = horizons.shortSec;
  planner.strategyCurrentHorizonLongSec = horizons.longSec;

  const currentBuyBulk = Number((Game as any).buyBulk || 1);
  const currentBuffSignature = getBuffSignatureForInvalidation(planner, now);
  const buyBulkChanged = planner.lastObservedBuyBulk !== currentBuyBulk;
  const externalStateChanged = buyBulkChanged || planner.lastObservedBuffSignature !== currentBuffSignature;
  planner.lastObservedBuyBulk = currentBuyBulk;
  planner.lastObservedBuffSignature = currentBuffSignature;
  if (buyBulkChanged) {
    invalidateForExternalChange(planner);
  } else if (externalStateChanged) {
    planner.strategyState.lastRefreshAt = 0;
  }

  const candidates = buildCandidatePool(planner, all, horizons);
  const stateSignature = getStrategyStateSignature(candidates);
  const strategyAlgorithm = planner.config.strategyAlgorithm === "astar" ? "astar" : "beam";
  const useIncremental = canReuseIncrementalState(planner, stateSignature, now);
  const budgetMs =
    strategyAlgorithm === "astar"
      ? useIncremental
        ? Math.max(0.2, planner.config.strategyAStarIncrementalBudgetMs)
        : Math.max(0.5, planner.config.strategyBudgetMs)
      : useIncremental
        ? Math.max(0.3, planner.config.strategyIncrementalBudgetMs)
        : Math.max(0.5, planner.config.strategyBudgetMs);
  const deadline = performance.now() + budgetMs;
  const baseline = assignBaselineStrategyScores(all);

  let result: any = null;
  try {
    if (strategyAlgorithm === "astar") {
      result = useIncremental
        ? runIncrementalAStarSearch(planner, all, deadline, horizons, planner.strategyState.frontier)
        : runAStarSearch(planner, all, deadline, horizons);
      const shouldFallbackToBeam = !result.scores || (result.budgetHit && result.progressCount <= 0);
      if (shouldFallbackToBeam) {
        const fallbackDeadline = performance.now() + Math.max(0.4, planner.config.strategyIncrementalBudgetMs);
        const fallback = runBeamSearch(planner, all, fallbackDeadline, horizons);
        result = { ...fallback, budgetHit: true };
        planner.strategyState.fallbackCount++;
        planner.strategyState.astarFallbackCount++;
      }
    } else {
      result = useIncremental
        ? runIncrementalBeamSearch(planner, all, deadline, horizons, planner.strategyState.frontier)
        : runBeamSearch(planner, all, deadline, horizons);
    }
  } catch {
    result = null;
  }

  let nextScores: Map<string, number> | null = result?.scores ?? null;
  if (!nextScores) {
    planner.strategyState.fallbackCount++;
    nextScores = baseline;
    planner.strategyState.incrementalStreak = 0;
    planner.strategyState.frontier = [];
    planner.lastBeamFrontier = [];
    planner.strategyState.stateSignature = "";
    planner.strategyState.lastFullRefreshAt = now;
  } else if (result?.mode === "incremental") {
    planner.strategyState.incrementalRuns++;
    planner.strategyState.incrementalStreak++;
    planner.strategyState.frontier = result.frontier;
    planner.lastBeamFrontier = result.algorithm === "beam" ? result.frontier : [];
    planner.strategyState.stateSignature = stateSignature;
  } else {
    planner.strategyState.fullRuns++;
    planner.strategyState.incrementalStreak = 0;
    planner.strategyState.frontier = result?.frontier ?? [];
    planner.lastBeamFrontier = result?.algorithm === "beam" ? (result?.frontier ?? []) : [];
    planner.strategyState.stateSignature = stateSignature;
    planner.strategyState.lastFullRefreshAt = now;
  }

  planner.strategyState.openPeak = Math.max(planner.strategyState.openPeak, result?.openPeak ?? 0);
  for (const [token, score] of nextScores) {
    getStableStrategyScore.call(planner, token, score);
  }

  const strategyDuration = performance.now() - strategyStartedAt;
  planner.strategyState.refreshDurationsMs.push(strategyDuration);
  if (planner.strategyState.refreshDurationsMs.length > 120) {
    planner.strategyState.refreshDurationsMs.shift();
  }
  planner.strategyState.lastRefreshAt = now;

  planner.strategyRuns = planner.strategyState.runs;
  planner.strategyFullRuns = planner.strategyState.fullRuns;
  planner.strategyIncrementalRuns = planner.strategyState.incrementalRuns;
  planner.strategyIncrementalStreak = planner.strategyState.incrementalStreak;
  planner.strategyExpandedNodes = planner.strategyState.expandedNodes;
  planner.strategyOpenPeak = planner.strategyState.openPeak;
  planner.strategyTimeoutCount = planner.strategyState.timeoutCount;
  planner.strategyBudgetHitCount = planner.strategyState.budgetHitCount;
  planner.strategyAStarBudgetHitCount = planner.strategyState.astarBudgetHitCount;
  planner.strategyFallbackCount = planner.strategyState.fallbackCount;
  planner.strategyAStarFallbackCount = planner.strategyState.astarFallbackCount;
  planner.lastStrategyRefreshAt = planner.strategyState.lastRefreshAt;
  planner.lastStrategyStateSignature = planner.strategyState.stateSignature;
  planner.lastFullStrategyRefreshAt = planner.strategyState.lastFullRefreshAt;
}

