import type { Config } from "../data/config";
import type { AnyFunction, Building, Upgrade } from "../types/game";
import { defaultConfig } from "../data/config";
import type { SearchPath } from "../search/algorithms";
import {
  register,
  init,
  load,
  save,
  checkUpdateUI,
  tick,
  dispose,
  scheduleNextTick,
  markConfigDirty,
  getRecentPurchaseUnitsPerSec,
  recordPurchaseUnits,
  getCurrentBuyCount,
} from "./lifecycle";
import {
  calcCookieTimesCost,
  calcWaitingTime,
  enterSandBox,
  getBankCookies,
  initSimData,
  isIgnored,
  leaveSandBox,
  tuneAdaptiveBudget,
  updateBestCpsAcceleration,
  updateColorRender,
  updateHelperOrder,
  estimateWaitSeconds,
  sampleSmoothedClickCps,
} from "../calc/sim";
import {
  arrayCommonInTheSameOrder,
  colorSpanByValue,
  colorSpanInRainbow,
  insertAfter,
  reapplyLastKnownNotationFromCache,
  reapplyLastKnownStoreOrder,
  reorderBuildings,
  reorderUpgrades,
  updateNotation,
  updateUI,
} from "../ui/render";
import { getStableStrategyScore } from "../strategy/engine";
import {
  addOptionsMenu,
  autoBuyDiv,
  bankingDiv,
  colorPickerDiv,
  getButtonID,
  intervalBoxDiv,
  sortingDiv,
  toggleButton,
  updateButtonState,
} from "../ui/options";
import {
  checkForDeployUpdate,
  startSelfReloadWatcher,
  stopSelfReloadWatcher,
  triggerSelfReload,
} from "./selfReload";
import { RATE_SMOOTHING_WINDOW_MS, SlidingRateWindow } from "./rateWindow";

export class CookiePaybackPlanner {
  strategyState: {
    scoreByItem: Map<string, number>;
    lastRefreshAt: number;
    lastFullRefreshAt: number;
    stateSignature: string;
    frontier: SearchPath[];
    currentHorizonShortSec: number;
    currentHorizonLongSec: number;
    expandedNodes: number;
    openPeak: number;
    timeoutCount: number;
    budgetHitCount: number;
    astarBudgetHitCount: number;
    fallbackCount: number;
    astarFallbackCount: number;
    refreshDurationsMs: number[];
    runs: number;
    fullRuns: number;
    incrementalRuns: number;
    incrementalStreak: number;
  } = {
    scoreByItem: new Map<string, number>(),
    lastRefreshAt: 0,
    lastFullRefreshAt: 0,
    stateSignature: "",
    frontier: [],
    currentHorizonShortSec: 60,
    currentHorizonLongSec: 120,
    expandedNodes: 0,
    openPeak: 0,
    timeoutCount: 0,
    budgetHitCount: 0,
    astarBudgetHitCount: 0,
    fallbackCount: 0,
    astarFallbackCount: 0,
    refreshDurationsMs: [],
    runs: 0,
    fullRuns: 0,
    incrementalRuns: 0,
    incrementalStreak: 0,
  };

  displayname = "Cookie Payback Planner";
  name = "Best Deal Helper";
  modId = "BestDealHelper";
  version = "2048.14";
  isLoaded = false;
  isDisposed = false;
  isReloading = false;
  load_chroma = false;
  tickCount = 0;
  tickTimerId: ReturnType<typeof setTimeout> | null = null;
  selfReloadTimerId: ReturnType<typeof setTimeout> | null = null;
  nextTickAt = 0;
  selfReloadIntervalMs = 2500;
  lastDeploySignature = "";
  resolvedManifestUrl = "";
  resolvedMainScriptUrl = "";
  statsMenuHook: (() => void) | null = null;
  optionsMenuHook: (() => void) | null = null;
  styleElement: HTMLStyleElement | null = null;
  hooksInstalled = false;
  originalRebuildUpgrades: AnyFunction | null = null;
  originalRefreshStore: AnyFunction | null = null;
  originalClickProduct: AnyFunction | null = null;
  originalUpgradeClick: AnyFunction | null = null;
  originalUpgradeClick2: AnyFunction | null = null;
  last_cps = 0;
  Upgrades = new Map<string, Upgrade>();
  default_config: Config = { ...defaultConfig };
  config: Config = { ...defaultConfig };
  last_config: Config = { ...defaultConfig };
  configRevision = 0;
  lastHandledConfigRevision = 0;
  colorRender: (value: number) => string = () => this.config.color0;
  uiDirty = true;
  lastUiRefreshAt = 0;
  minUiRefreshMs = 300;
  pendingSimRecalc = false;
  simBudgetPerRefresh = 12;
  simBudgetRemaining = 0;
  adaptiveBudget = 12;
  minBudget = 3;
  maxBudget = 60;
  budgetBackoffStep = 2;
  targetComputeMsPerRefresh = 6;
  maxStalenessMs = 1000;
  highPriorityIds = new Set<string>();
  lastComputedAtByItem = new Map<string, number>();
  simCache = new Map<string, { key: string; bestCpsAcceleration: number; bestBuyToAmount: number; bestWaitTime: number }>();
  notationCache = new Map<string, { text: string; colorMode: "rainbow" | "solid"; colorValue: string; opacity: string }>();
  profilerWindowStartedAt = 0;
  profilerCallCount = 0;
  profilerComputeCount = 0;
  profilerDurationsMs: number[] = [];
  profilerLastAvgMs = 0;
  profilerLastP95Ms = 0;
  metricsWindowStartedAt = 0;
  refreshAttemptCount = 0;
  refreshSuccessCount = 0;
  refreshDurationsMs: number[] = [];
  refreshSkipCount = 0;
  helperExpandedNodes = 0;
  helperAbortedByBudget = 0;
  strategyExpandedNodes = 0;
  strategyOpenPeak = 0;
  strategyTimeoutCount = 0;
  strategyBudgetHitCount = 0;
  strategyAStarBudgetHitCount = 0;
  strategyFallbackCount = 0;
  strategyAStarFallbackCount = 0;
  strategyRefreshDurationsMs: number[] = [];
  strategyRuns = 0;
  strategyFullRuns = 0;
  strategyIncrementalRuns = 0;
  strategyIncrementalStreak = 0;
  lastMetricsLogAt = 0;
  strategyScoreByItem = new Map<string, number>();
  lastStrategyRefreshAt = 0;
  lastFullStrategyRefreshAt = 0;
  lastStrategyStateSignature = "";
  lastStrategyFrontier: SearchPath[] = [];
  lastBeamFrontier: SearchPath[] = [];
  strategyCurrentHorizonShortSec = 60;
  strategyCurrentHorizonLongSec = 120;
  lastObservedBuyBulk = 1;
  lastObservedBuffSignature = "";
  lastObservedAscendCount = 0;
  lastObservedBoughtUpgradeCount = 0;
  lastObservedBuildingAmount = 0;
  autoBuyLogicHook: (() => void) | null = null;
  autoBuyLogicTickCounter = 0;
  autoBuyTicksPerAttempt = 10;
  autoBuyCandidateMaxAgeMs = 700;
  autoBuyFastTrackUiMs = 600;
  autoBuyFastTrackUntil = 0;
  autoBuyAwaitingFreshBestDeal = false;
  autoBuyBestCandidate: Building | Upgrade | null = null;
  autoBuyBestCandidateToken = "";
  autoBuyBestCandidateAt = 0;
  autoBuyTopCandidates: Array<{ item: Building | Upgrade; token: string; score: number; waitSec: number }> = [];
  autoBuyMetricsWindowStartedAt = 0;
  autoBuyAttemptCount = 0;
  autoBuyBuyCount = 0;
  autoBuySkipNotReadyCount = 0;
  autoBuySkipUnavailableCount = 0;
  autoBuySkipStaleCandidateCount = 0;
  autoBuySkipModeCount = 0;
  autoBuyLastBoughtAt = 0;
  autoBuyTotalIntervalMs = 0;
  rateSmoothingWindowMs = RATE_SMOOTHING_WINDOW_MS;
  clickRateSmoothingWindowMs = 30000;
  purchaseRateWindow = new SlidingRateWindow(this.rateSmoothingWindowMs);
  autoBuyRateWindow = new SlidingRateWindow(this.rateSmoothingWindowMs);
  manualClickRateWindow = new SlidingRateWindow(this.clickRateSmoothingWindowMs);
  smoothedClickCps = 0;
  lastClickCpsRaw = 0;
  lastClickSampleAt = 0;
  lastCookieClicks = 0;
  observedTimedBuffEndAt = new Map<string, number>();
  strategyClickBucket = 0;
  strategyClickBucketLastUpdatedAt = 0;
  lastSortedUpgradeTokens: string[] = [];
  lastSortedBuildingTokens: string[] = [];

  register = register;
  init = init;
  load = load;
  save = save;
  checkUpdateUI = checkUpdateUI;
  tick = tick;
  scheduleNextTick = scheduleNextTick;
  markConfigDirty = markConfigDirty;
  getRecentPurchaseUnitsPerSec = getRecentPurchaseUnitsPerSec;
  recordPurchaseUnits = recordPurchaseUnits;
  getCurrentBuyCount = getCurrentBuyCount;
  dispose = dispose;

  insertAfter = insertAfter;
  getBankCookies = getBankCookies;
  calcCookieTimesCost = calcCookieTimesCost;
  isIgnored = isIgnored;
  enterSandBox = enterSandBox;
  leaveSandBox = leaveSandBox;
  initSimData = initSimData;
  updateBestCpsAcceleration = updateBestCpsAcceleration;
  tuneAdaptiveBudget = tuneAdaptiveBudget;
  updateHelperOrder = updateHelperOrder;
  colorSpanInRainbow = colorSpanInRainbow;
  colorSpanByValue = colorSpanByValue;
  updateColorRender = updateColorRender;
  calcWaitingTime = calcWaitingTime;
  estimateWaitSeconds = estimateWaitSeconds;
  sampleSmoothedClickCps = sampleSmoothedClickCps;
  updateNotation = updateNotation;
  getStableStrategyScore = getStableStrategyScore;
  arrayCommonInTheSameOrder = arrayCommonInTheSameOrder;
  reapplyLastKnownStoreOrder = reapplyLastKnownStoreOrder;
  reapplyLastKnownNotationFromCache = reapplyLastKnownNotationFromCache;
  reorderUpgrades = reorderUpgrades;
  reorderBuildings = reorderBuildings;
  updateUI = updateUI;
  getButtonID = getButtonID;
  toggleButton = toggleButton;
  updateButtonState = updateButtonState;
  sortingDiv = sortingDiv;
  autoBuyDiv = autoBuyDiv;
  bankingDiv = bankingDiv;
  intervalBoxDiv = intervalBoxDiv;
  colorPickerDiv = colorPickerDiv;
  addOptionsMenu = addOptionsMenu;
  startSelfReloadWatcher = startSelfReloadWatcher;
  stopSelfReloadWatcher = stopSelfReloadWatcher;
  checkForDeployUpdate = checkForDeployUpdate;
  triggerSelfReload = triggerSelfReload;
}
