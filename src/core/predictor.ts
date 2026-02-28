import type { Config } from "../data/config";
import type { AnyFunction, Upgrade } from "../types/game";
import { defaultConfig } from "../data/config";
import { register, init, load, save, checkUpdateUI, tick, dispose, scheduleNextTick } from "./lifecycle";
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
} from "../calc/sim";
import {
  arrayCommonInTheSameOrder,
  colorSpanByValue,
  colorSpanInRainbow,
  insertAfter,
  reorderBuildings,
  reorderUpgrades,
  updateNotation,
  updateUI,
} from "../ui/render";
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

export class CookiePaybackPlanner {
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

  register = register;
  init = init;
  load = load;
  save = save;
  checkUpdateUI = checkUpdateUI;
  tick = tick;
  scheduleNextTick = scheduleNextTick;
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
  updateNotation = updateNotation;
  arrayCommonInTheSameOrder = arrayCommonInTheSameOrder;
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
