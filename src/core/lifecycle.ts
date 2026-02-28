import type { Upgrade } from "../types/game";
import type { CookiePaybackPlanner } from "./predictor";
import { Game, ensureCCSE } from "./globals";
import { consumeReloadTickDelay } from "./selfReload";
import { getItemToken, normalizeItemType } from "../strategy/selectors";

function getAutoBuyTickInterval(this: CookiePaybackPlanner) {
  const fps = Number.isFinite(Game.fps) && (Game.fps as number) > 0 ? (Game.fps as number) : 30;
  return Math.max(1, Math.floor(fps / this.autoBuyTicksPerAttempt));
}

function resetStrategyStateForInit(this: CookiePaybackPlanner) {
  this.strategyState.scoreByItem = new Map<string, number>();
  this.strategyState.lastRefreshAt = 0;
  this.strategyState.lastFullRefreshAt = 0;
  this.strategyState.stateSignature = "";
  this.strategyState.frontier = [];
  this.strategyState.currentHorizonShortSec = 60;
  this.strategyState.currentHorizonLongSec = 120;
  this.strategyState.expandedNodes = 0;
  this.strategyState.openPeak = 0;
  this.strategyState.timeoutCount = 0;
  this.strategyState.budgetHitCount = 0;
  this.strategyState.astarBudgetHitCount = 0;
  this.strategyState.fallbackCount = 0;
  this.strategyState.astarFallbackCount = 0;
  this.strategyState.refreshDurationsMs = [];
  this.strategyState.runs = 0;
  this.strategyState.fullRuns = 0;
  this.strategyState.incrementalRuns = 0;
  this.strategyState.incrementalStreak = 0;

  this.strategyScoreByItem = this.strategyState.scoreByItem;
  this.lastStrategyRefreshAt = this.strategyState.lastRefreshAt;
  this.lastFullStrategyRefreshAt = this.strategyState.lastFullRefreshAt;
  this.lastStrategyStateSignature = this.strategyState.stateSignature;
  this.lastStrategyFrontier = this.strategyState.frontier;
  this.strategyCurrentHorizonShortSec = this.strategyState.currentHorizonShortSec;
  this.strategyCurrentHorizonLongSec = this.strategyState.currentHorizonLongSec;
  this.strategyExpandedNodes = this.strategyState.expandedNodes;
  this.strategyOpenPeak = this.strategyState.openPeak;
  this.strategyTimeoutCount = this.strategyState.timeoutCount;
  this.strategyBudgetHitCount = this.strategyState.budgetHitCount;
  this.strategyAStarBudgetHitCount = this.strategyState.astarBudgetHitCount;
  this.strategyFallbackCount = this.strategyState.fallbackCount;
  this.strategyAStarFallbackCount = this.strategyState.astarFallbackCount;
  this.strategyRefreshDurationsMs = this.strategyState.refreshDurationsMs;
  this.strategyRuns = this.strategyState.runs;
  this.strategyFullRuns = this.strategyState.fullRuns;
  this.strategyIncrementalRuns = this.strategyState.incrementalRuns;
  this.strategyIncrementalStreak = this.strategyState.incrementalStreak;
}

function resetStrategyStateForDispose(this: CookiePaybackPlanner) {
  this.strategyState.scoreByItem.clear();
  this.strategyState.frontier = [];
  this.strategyState.stateSignature = "";
  this.strategyState.incrementalStreak = 0;
  this.strategyState.refreshDurationsMs = [];

  this.strategyScoreByItem = this.strategyState.scoreByItem;
  this.lastStrategyFrontier = this.strategyState.frontier;
  this.lastStrategyStateSignature = this.strategyState.stateSignature;
  this.strategyIncrementalStreak = this.strategyState.incrementalStreak;
  this.strategyRefreshDurationsMs = this.strategyState.refreshDurationsMs;
}

function withStorePanelsHidden<T>(run: () => T) {
  const panels = ["products", "upgrades", "techUpgrades"]
    .map((id) => document.getElementById(id) as HTMLElement | null)
    .filter((panel): panel is HTMLElement => panel !== null);
  const previousVisibility = panels.map((panel) => panel.style.visibility);
  panels.forEach((panel) => {
    panel.style.visibility = "hidden";
  });
  try {
    return run();
  } finally {
    panels.forEach((panel, index) => {
      const previous = previousVisibility[index];
      if (previous) {
        panel.style.visibility = previous;
      } else {
        panel.style.removeProperty("visibility");
      }
    });
  }
}

function getItemOwnedCount(item: { type: string; amount?: number; bought?: number }) {
  if (item.type === "upgrade") {
    return Number(item.bought || 0);
  }
  return Number(item.amount || 0);
}

function getCurrentAscendCount() {
  const raw = Number(Game.resets);
  if (!Number.isFinite(raw) || raw < 0) {
    return 0;
  }
  return Math.floor(raw);
}

function getCollectionValues(collection: any): any[] {
  if (!collection) {
    return [];
  }
  if (Array.isArray(collection)) {
    return collection;
  }
  if (typeof collection.length === "number") {
    const values: any[] = [];
    for (let i = 0; i < collection.length; i++) {
      const value = collection[i];
      if (value !== undefined) {
        values.push(value);
      }
    }
    return values;
  }
  return Object.values(collection);
}

function getCurrentBoughtUpgradeCount() {
  const upgrades = getCollectionValues(Game.UpgradesById);
  return upgrades.reduce((total, upgrade) => total + Math.max(0, Number(upgrade?.bought || 0)), 0);
}

function getCurrentBuildingAmount() {
  const buildings = getCollectionValues(Game.ObjectsById);
  return buildings.reduce((total, building) => total + Math.max(0, Number(building?.amount || 0)), 0);
}

function resetPlannerStateForAscension(this: CookiePaybackPlanner) {
  this.simCache.clear();
  this.notationCache.clear();
  this.lastComputedAtByItem.clear();
  this.highPriorityIds.clear();
  resetStrategyStateForInit.call(this);
  this.lastBeamFrontier = [];
  this.lastSortedUpgradeTokens = [];
  this.lastSortedBuildingTokens = [];
  this.autoBuyAwaitingFreshBestDeal = false;
  this.autoBuyBestCandidate = null;
  this.autoBuyBestCandidateToken = "";
  this.autoBuyBestCandidateAt = 0;
  this.autoBuyTopCandidates = [];
  this.autoBuyFastTrackUntil = 0;
  this.purchaseRateWindow.reset();
  this.autoBuyRateWindow.reset();
  this.manualClickRateWindow.reset();
  this.smoothedClickCps = 0;
  this.lastClickCpsRaw = 0;
  this.lastClickSampleAt = 0;
  this.lastCookieClicks = Number((Game as any).cookieClicks || 0);
  this.observedTimedBuffEndAt.clear();
  this.strategyClickBucket = 0;
  this.strategyClickBucketLastUpdatedAt = 0;
  this.uiDirty = true;
  this.pendingSimRecalc = true;
}

function maybeHandleAscensionReset(this: CookiePaybackPlanner) {
  const currentAscendCount = getCurrentAscendCount();
  const currentBoughtUpgradeCount = getCurrentBoughtUpgradeCount();
  const currentBuildingAmount = getCurrentBuildingAmount();
  const ascendCounterIncreased = currentAscendCount > this.lastObservedAscendCount;
  const progressRegressedWithoutSellMode =
    Game.buyMode !== -1 &&
    currentAscendCount === this.lastObservedAscendCount &&
    (currentBoughtUpgradeCount < this.lastObservedBoughtUpgradeCount ||
      currentBuildingAmount < this.lastObservedBuildingAmount) &&
    (this.lastObservedBoughtUpgradeCount > 0 || this.lastObservedBuildingAmount > 0);
  if (ascendCounterIncreased || progressRegressedWithoutSellMode) {
    resetPlannerStateForAscension.call(this);
  }
  this.lastObservedAscendCount = currentAscendCount;
  this.lastObservedBoughtUpgradeCount = currentBoughtUpgradeCount;
  this.lastObservedBuildingAmount = currentBuildingAmount;
}

export function recordPurchaseUnits(this: CookiePaybackPlanner, units: number) {
  if (!Number.isFinite(units) || units <= 0) {
    return;
  }
  this.purchaseRateWindow.add(units);
}

export function getRecentPurchaseUnitsPerSec(this: CookiePaybackPlanner) {
  return this.purchaseRateWindow.ratePerSec();
}

export function getCurrentBuyCount(this: CookiePaybackPlanner) {
  const numericRaw = Number((Game as any).buyBulk);
  if (Number.isFinite(numericRaw) && numericRaw > 0) {
    if (numericRaw >= 100) return 100;
    if (numericRaw >= 10) return 10;
    return 1;
  }
  const bulkText = document.getElementById("storeBulk")?.textContent || "";
  if (bulkText.includes("100")) return 100;
  if (bulkText.includes("10")) return 10;
  return 1;
}

function isCandidateStillValid(this: CookiePaybackPlanner, candidate: any, now: number) {
  if (!candidate || typeof candidate.getPrice !== "function") {
    return false;
  }
  const candidateType = normalizeItemType(candidate);
  if (candidateType === "upgrade" && !Game.UpgradesInStore.includes(candidate)) {
    return false;
  }
  if (candidateType === "building" && candidate.l?.classList?.contains("toggledOff")) {
    return false;
  }
  if (this.estimateWaitSeconds(candidate.getPrice(), Game.cookies, Game.unbuffedCps) !== 0) {
    return false;
  }
  if (this.autoBuyBestCandidateAt <= 0) {
    return false;
  }
  const candidateAgeMs = now - this.autoBuyBestCandidateAt;
  if (candidateAgeMs > this.autoBuyCandidateMaxAgeMs) {
    this.autoBuySkipStaleCandidateCount++;
    return false;
  }
  return true;
}

function tryAutoBuyFromMainLoop(this: CookiePaybackPlanner) {
  if (!this.config.autoBuy) {
    return;
  }
  this.autoBuyAttemptCount++;
  if (Game.buyMode !== 1) {
    this.autoBuySkipModeCount++;
    return;
  }
  const now = Date.now();
  const top1 = this.autoBuyBestCandidate;
  let candidate = top1;
  if (!candidate || !isCandidateStillValid.call(this, candidate, now)) {
    this.autoBuySkipUnavailableCount++;
    this.uiDirty = true;
    this.pendingSimRecalc = true;
    return;
  }
  const targetOwned =
    normalizeItemType(candidate) === "building" && Number.isFinite((candidate as any).BestBuyToAmount)
      ? Math.max(0, Math.floor((candidate as any).BestBuyToAmount))
      : 0;
  const initialOwned = getItemOwnedCount(candidate);
  const enforceTargetOwned = targetOwned > initialOwned;
  const maxChainBuys = 50;
  let totalBoughtUnits = 0;
  let chainBuys = 0;
  while (chainBuys < maxChainBuys) {
    const beforeOwned = getItemOwnedCount(candidate);
    if (enforceTargetOwned && beforeOwned >= targetOwned) {
      break;
    }
    candidate.buy();
    const afterOwned = getItemOwnedCount(candidate);
    const boughtUnits = Math.max(0, afterOwned - beforeOwned);
    if (boughtUnits <= 0) {
      break;
    }
    totalBoughtUnits += boughtUnits;
    chainBuys++;
    const boughtAt = Date.now();
    if (this.autoBuyLastBoughtAt > 0) {
      this.autoBuyTotalIntervalMs += boughtAt - this.autoBuyLastBoughtAt;
    }
    this.autoBuyRateWindow.add(1, boughtAt);
    this.autoBuyLastBoughtAt = boughtAt;
    this.autoBuyBuyCount++;
    if (enforceTargetOwned && afterOwned >= targetOwned) {
      break;
    }
  }
  recordPurchaseUnits.call(this, totalBoughtUnits);
  this.highPriorityIds.add(getItemToken(candidate));
  this.uiDirty = true;
  this.pendingSimRecalc = true;
  this.autoBuyFastTrackUntil = Date.now() + this.autoBuyFastTrackUiMs;
}

function logAutoBuyFrequency(this: CookiePaybackPlanner) {
  const now = Date.now();
  if (!this.autoBuyMetricsWindowStartedAt) {
    this.autoBuyMetricsWindowStartedAt = now;
    return;
  }
  const elapsedMs = now - this.autoBuyMetricsWindowStartedAt;
  if (elapsedMs < 10000) {
    return;
  }
  const buys = this.autoBuyBuyCount;
  const attempts = this.autoBuyAttemptCount;
  const buysPerSec = this.autoBuyRateWindow.ratePerSec(now);
  const unitsPerSec = getRecentPurchaseUnitsPerSec.call(this);
  const avgBuyIntervalMs = buys > 1 ? this.autoBuyTotalIntervalMs / (buys - 1) : 0;
  console.log(
    `[CPP autoBuy] attempts=${attempts} buys=${buys} buysPerSec=${buysPerSec.toFixed(2)} unitsPerSec=${unitsPerSec.toFixed(2)} avgIntervalMs=${avgBuyIntervalMs.toFixed(1)} skipNotReady=${this.autoBuySkipNotReadyCount} skipUnavailable=${this.autoBuySkipUnavailableCount} skipStale=${this.autoBuySkipStaleCandidateCount} skipMode=${this.autoBuySkipModeCount}`,
  );
  this.autoBuyMetricsWindowStartedAt = now;
  this.autoBuyAttemptCount = 0;
  this.autoBuyBuyCount = 0;
  this.autoBuySkipNotReadyCount = 0;
  this.autoBuySkipUnavailableCount = 0;
  this.autoBuySkipStaleCandidateCount = 0;
  this.autoBuySkipModeCount = 0;
  this.autoBuyTotalIntervalMs = 0;
}

function installAutoBuyLogicHook(this: CookiePaybackPlanner) {
  if (this.autoBuyLogicHook || typeof Game.registerHook !== "function") {
    return;
  }
  this.autoBuyLogicHook = () => {
    this.autoBuyLogicTickCounter++;
    const tickInterval = getAutoBuyTickInterval.call(this);
    if (this.autoBuyLogicTickCounter < tickInterval) {
      return;
    }
    this.autoBuyLogicTickCounter = 0;
    tryAutoBuyFromMainLoop.call(this);
    logAutoBuyFrequency.call(this);
  };
  Game.registerHook("logic", this.autoBuyLogicHook);
}

function removeAutoBuyLogicHook(this: CookiePaybackPlanner) {
  if (!this.autoBuyLogicHook) {
    return;
  }
  if (typeof Game.removeHook === "function") {
    Game.removeHook("logic", this.autoBuyLogicHook);
  }
  this.autoBuyLogicHook = null;
}

export function register(this: CookiePaybackPlanner) {
  Game.registerMod(this.name, this);
}

export function init(this: CookiePaybackPlanner) {
  this.dispose({ keepReloadState: false });
  this.isDisposed = false;

  const buildMap = (obj: Upgrade[]) =>
    Object.keys(obj).reduce((map, key) => map.set(key, obj[Number(key)]), new Map<string, Upgrade>());
  this.Upgrades = buildMap(Game.UpgradesById);

  const ccse = ensureCCSE();

  this.statsMenuHook = () => {
    ccse.AppendStatsVersionNumber(this.displayname, this.version);
  };
  Game.customStatsMenu.push(this.statsMenuHook);

  this.optionsMenuHook = this.addOptionsMenu.bind(this);
  Game.customOptionsMenu.push(this.optionsMenuHook);

  this.styleElement = document.createElement("style");
  this.styleElement.innerHTML = `
    .product .content {
      padding-top: 0px;
    }
    .price::before {
      top: 0px;
    }
  `;
  document.head.appendChild(this.styleElement);

  this.originalRebuildUpgrades = Game.RebuildUpgrades;
  Game.RebuildUpgrades = () => {
    withStorePanelsHidden(() => {
      this.originalRebuildUpgrades?.();
      this.reapplyLastKnownStoreOrder();
      this.reapplyLastKnownNotationFromCache();
    });
    this.uiDirty = true;
    this.pendingSimRecalc = true;
    for (const upgrade of Game.UpgradesInStore) {
      this.highPriorityIds.add(getItemToken(upgrade));
    }
    this.checkUpdateUI();
  };

  this.originalRefreshStore = Game.RefreshStore;
  Game.RefreshStore = () => {
    withStorePanelsHidden(() => {
      this.originalRefreshStore?.();
      this.reapplyLastKnownStoreOrder();
      this.reapplyLastKnownNotationFromCache();
    });
    this.uiDirty = true;
    this.pendingSimRecalc = true;
    for (const building of Game.ObjectsById) {
      if (!building.l.classList.contains("toggledOff")) {
        this.highPriorityIds.add(getItemToken(building));
      }
    }
    for (const upgrade of Game.UpgradesInStore) {
      this.highPriorityIds.add(getItemToken(upgrade));
    }
    this.checkUpdateUI();
  };

  this.originalClickProduct = Game.ClickProduct;
  Game.ClickProduct = (what: number) => {
    if (!Game.ObjectsById[what].waitingTime || Game.buyMode == -1) {
      const item = Game.ObjectsById[what];
      const beforeOwned = getItemOwnedCount(item);
      item.buy();
      const boughtUnits = Math.max(0, getItemOwnedCount(item) - beforeOwned);
      recordPurchaseUnits.call(this, boughtUnits);
      this.uiDirty = true;
      this.pendingSimRecalc = true;
      this.highPriorityIds.add(getItemToken(item));
    }
  };

  this.originalUpgradeClick = Game.Upgrade.prototype.click;
  this.originalUpgradeClick2 = Game.Upgrade.prototype.click2 ?? null;
  Game.Upgrade.prototype.click2 = this.originalUpgradeClick;
  const planner = this;
  Game.Upgrade.prototype.click = function (e: any) {
    const upgrade = this as any;
    if (upgrade.waitingTime && upgrade.BestCpsAcceleration) {
      return;
    }
    const beforeOwned = getItemOwnedCount(upgrade);
    const result = upgrade.click2(e);
    const boughtUnits = Math.max(0, getItemOwnedCount(upgrade) - beforeOwned);
    recordPurchaseUnits.call(planner, boughtUnits);
    planner.uiDirty = true;
    planner.pendingSimRecalc = true;
    planner.highPriorityIds.add(getItemToken(upgrade));
    return result;
  };
  this.hooksInstalled = true;

  this.config = { ...this.default_config };
  this.last_config = { ...this.default_config };
  this.configRevision = 0;
  this.lastHandledConfigRevision = 0;
  this.simCache.clear();
  this.notationCache.clear();
  this.lastComputedAtByItem.clear();
  this.highPriorityIds.clear();
  resetStrategyStateForInit.call(this);
  this.metricsWindowStartedAt = 0;
  this.refreshAttemptCount = 0;
  this.refreshSuccessCount = 0;
  this.refreshDurationsMs = [];
  this.refreshSkipCount = 0;
  this.helperExpandedNodes = 0;
  this.helperAbortedByBudget = 0;
  this.lastBeamFrontier = [];
  this.lastObservedBuyBulk = Number((Game as any).buyBulk || 1);
  this.lastObservedBuffSignature = `${Math.floor(Game.unbuffedCps)}:${Math.floor(Game.cookiesPsRaw)}:${Math.floor(
    Game.globalCpsMult * 1000
  )}`;
  this.lastObservedAscendCount = getCurrentAscendCount();
  this.lastObservedBoughtUpgradeCount = getCurrentBoughtUpgradeCount();
  this.lastObservedBuildingAmount = getCurrentBuildingAmount();
  this.lastMetricsLogAt = 0;
  this.autoBuyLogicTickCounter = 0;
  this.autoBuyAwaitingFreshBestDeal = false;
  this.autoBuyBestCandidate = null;
  this.autoBuyBestCandidateToken = "";
  this.autoBuyBestCandidateAt = 0;
  this.autoBuyTopCandidates = [];
  this.autoBuyMetricsWindowStartedAt = 0;
  this.autoBuyAttemptCount = 0;
  this.autoBuyBuyCount = 0;
  this.autoBuySkipNotReadyCount = 0;
  this.autoBuySkipUnavailableCount = 0;
  this.autoBuySkipStaleCandidateCount = 0;
  this.autoBuySkipModeCount = 0;
  this.autoBuyLastBoughtAt = 0;
  this.autoBuyTotalIntervalMs = 0;
  this.purchaseRateWindow.reset();
  this.autoBuyRateWindow.reset();
  this.manualClickRateWindow.reset();
  this.smoothedClickCps = 0;
  this.lastClickCpsRaw = 0;
  this.lastClickSampleAt = 0;
  this.lastCookieClicks = Number((Game as any).cookieClicks || 0);
  this.observedTimedBuffEndAt.clear();
  this.strategyClickBucket = 0;
  this.strategyClickBucketLastUpdatedAt = 0;
  this.autoBuyFastTrackUntil = 0;
  this.isLoaded = true;
  this.isReloading = false;
  this.uiDirty = true;
  this.pendingSimRecalc = true;
  this.lastUiRefreshAt = 0;

  const resumeDelay = consumeReloadTickDelay();
  this.startSelfReloadWatcher();
  installAutoBuyLogicHook.call(this);
  this.scheduleNextTick(resumeDelay ?? this.config.updateMS / 10);
}

export function load(this: CookiePaybackPlanner, str: string) {
  const config = JSON.parse(str);
  for (const c in config) {
    if (Object.prototype.hasOwnProperty.call(this.config, c)) {
      (this.config as any)[c] = config[c];
    }
  }
  this.markConfigDirty();
  this.updateUI();
}

export function save(this: CookiePaybackPlanner) {
  return JSON.stringify(this.config);
}

export function checkUpdateUI(this: CookiePaybackPlanner) {
  maybeHandleAscensionReset.call(this);

  if (this.optionsMenuHook && !Game.customOptionsMenu.includes(this.optionsMenuHook)) {
    Game.customOptionsMenu.push(this.optionsMenuHook);
  }
  if (this.statsMenuHook && !Game.customStatsMenu.includes(this.statsMenuHook)) {
    Game.customStatsMenu.push(this.statsMenuHook);
  }

  if (this.last_cps !== Game.cookiesPs) {
    this.last_cps = Game.cookiesPs;
    this.uiDirty = true;
    this.pendingSimRecalc = true;
  } else if (this.configRevision !== this.lastHandledConfigRevision) {
    this.lastHandledConfigRevision = this.configRevision;
    this.last_config = { ...this.config };
    this.uiDirty = true;
    this.pendingSimRecalc = true;
  } else if (!document.querySelector("#productAcc0") || (document.getElementById("upgrade0") && !document.getElementById("upgradeAcc0"))) {
    this.uiDirty = true;
    this.pendingSimRecalc = true;
  } else if ((Game as any).onMenu === "prefs" && !document.getElementById("CookieProfitPredictor_UpdateMSSlider")) {
    try {
      this.addOptionsMenu();
    } catch {
      // ignore; will retry on next tick
    }
  }
}

export function tick(this: CookiePaybackPlanner) {
  if (this.isDisposed) {
    return;
  }
  this.tickCount++;
  if (this.tickCount >= 10) {
    this.uiDirty = true;
    this.pendingSimRecalc = true;
  }
  this.checkUpdateUI();
  const now = Date.now();
  const intervalTarget = Math.min(500, Math.max(250, Math.floor(this.config.updateMS / 3)));
  this.minUiRefreshMs = now < this.autoBuyFastTrackUntil ? Math.min(intervalTarget, 100) : intervalTarget;
  if (this.uiDirty) {
    this.refreshAttemptCount++;
  }
  if (this.uiDirty && now - this.lastUiRefreshAt >= this.minUiRefreshMs) {
    const startedAt = performance.now();
    this.updateUI();
    const durationMs = performance.now() - startedAt;
    this.refreshDurationsMs.push(durationMs);
    this.refreshSuccessCount++;
    this.uiDirty = false;
    this.lastUiRefreshAt = now;
  } else if (this.uiDirty) {
    this.refreshSkipCount++;
  }
  this.scheduleNextTick(this.config.updateMS / 10);
}

export function scheduleNextTick(this: CookiePaybackPlanner, delayMs: number) {
  if (this.isDisposed) {
    return;
  }
  const safeDelay = Math.max(0, Number.isFinite(delayMs) ? delayMs : this.config.updateMS / 10);
  if (this.tickTimerId) {
    clearTimeout(this.tickTimerId);
  }
  this.nextTickAt = Date.now() + safeDelay;
  this.tickTimerId = setTimeout(() => this.tick(), safeDelay);
}

function removeMenuHook<T>(hooks: T[], target: T | null) {
  if (!target) {
    return;
  }
  const index = hooks.indexOf(target);
  if (index >= 0) {
    hooks.splice(index, 1);
  }
}

export function dispose(this: CookiePaybackPlanner, options?: { keepReloadState?: boolean }) {
  if (this.tickTimerId) {
    clearTimeout(this.tickTimerId);
    this.tickTimerId = null;
  }

  this.stopSelfReloadWatcher();
  removeAutoBuyLogicHook.call(this);
  this.isDisposed = true;
  this.isLoaded = false;
  this.simCache.clear();
  this.notationCache.clear();
  this.lastComputedAtByItem.clear();
  this.observedTimedBuffEndAt.clear();
  this.highPriorityIds.clear();
  resetStrategyStateForDispose.call(this);
  this.lastStrategyFrontier = this.strategyState.frontier;
  this.lastBeamFrontier = [];
  this.autoBuyTopCandidates = [];

  removeMenuHook(Game.customStatsMenu, this.statsMenuHook);
  removeMenuHook(Game.customOptionsMenu, this.optionsMenuHook);
  this.statsMenuHook = null;
  this.optionsMenuHook = null;

  if (this.styleElement?.parentNode) {
    this.styleElement.parentNode.removeChild(this.styleElement);
  }
  this.styleElement = null;

  if (this.hooksInstalled) {
    if (this.originalRebuildUpgrades) {
      Game.RebuildUpgrades = this.originalRebuildUpgrades;
    }
    if (this.originalRefreshStore) {
      Game.RefreshStore = this.originalRefreshStore;
    }
    if (this.originalClickProduct) {
      Game.ClickProduct = this.originalClickProduct as (what: number) => void;
    }
    if (this.originalUpgradeClick) {
      Game.Upgrade.prototype.click = this.originalUpgradeClick;
    }
    if (this.originalUpgradeClick2) {
      Game.Upgrade.prototype.click2 = this.originalUpgradeClick2;
    } else {
      delete Game.Upgrade.prototype.click2;
    }
  }

  this.hooksInstalled = false;
  this.originalRebuildUpgrades = null;
  this.originalRefreshStore = null;
  this.originalClickProduct = null;
  this.originalUpgradeClick = null;
  this.originalUpgradeClick2 = null;

  if (!options?.keepReloadState) {
    this.nextTickAt = 0;
  }
}

export function markConfigDirty(this: CookiePaybackPlanner) {
  this.configRevision++;
  this.uiDirty = true;
  this.pendingSimRecalc = true;
}
