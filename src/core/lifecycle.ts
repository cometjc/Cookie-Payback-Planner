import type { Upgrade } from "../types/game";
import type { CookiePaybackPlanner } from "./predictor";
import { Game, ensureCCSE } from "./globals";
import { consumeReloadTickDelay } from "./selfReload";

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
    this.originalRebuildUpgrades?.();
    this.uiDirty = true;
    this.pendingSimRecalc = true;
    for (const upgrade of Game.UpgradesInStore) {
      this.highPriorityIds.add(`${upgrade.type}:${upgrade.id}`);
    }
    this.checkUpdateUI();
  };

  this.originalRefreshStore = Game.RefreshStore;
  Game.RefreshStore = () => {
    this.originalRefreshStore?.();
    this.uiDirty = true;
    this.pendingSimRecalc = true;
    for (const building of Game.ObjectsById) {
      if (!building.l.classList.contains("toggledOff")) {
        this.highPriorityIds.add(`${building.type}:${building.id}`);
      }
    }
    for (const upgrade of Game.UpgradesInStore) {
      this.highPriorityIds.add(`${upgrade.type}:${upgrade.id}`);
    }
    this.checkUpdateUI();
  };

  this.originalClickProduct = Game.ClickProduct;
  Game.ClickProduct = (what: number) => {
    if (!Game.ObjectsById[what].waitingTime || Game.buyMode == -1) {
      Game.ObjectsById[what].buy();
      this.uiDirty = true;
      this.pendingSimRecalc = true;
      const item = Game.ObjectsById[what];
      this.highPriorityIds.add(`${item.type}:${item.id}`);
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
    const result = upgrade.click2(e);
    planner.uiDirty = true;
    planner.pendingSimRecalc = true;
    planner.highPriorityIds.add(`${upgrade.type}:${upgrade.id}`);
    return result;
  };
  this.hooksInstalled = true;

  this.config = { ...this.default_config };
  this.last_config = { ...this.default_config };
  this.simCache.clear();
  this.notationCache.clear();
  this.lastComputedAtByItem.clear();
  this.highPriorityIds.clear();
  this.isLoaded = true;
  this.isReloading = false;
  this.uiDirty = true;
  this.pendingSimRecalc = true;
  this.lastUiRefreshAt = 0;

  const resumeDelay = consumeReloadTickDelay();
  this.startSelfReloadWatcher();
  this.scheduleNextTick(resumeDelay ?? this.config.updateMS / 10);
}

export function load(this: CookiePaybackPlanner, str: string) {
  const config = JSON.parse(str);
  for (const c in config) {
    if (Object.prototype.hasOwnProperty.call(this.config, c)) {
      (this.config as any)[c] = config[c];
    }
  }
  this.updateUI();
}

export function save(this: CookiePaybackPlanner) {
  return JSON.stringify(this.config);
}

export function checkUpdateUI(this: CookiePaybackPlanner) {
  if (this.last_cps !== Game.cookiesPs) {
    this.last_cps = Game.cookiesPs;
    this.uiDirty = true;
    this.pendingSimRecalc = true;
  } else if (JSON.stringify(this.config) !== JSON.stringify(this.last_config)) {
    this.last_config = { ...this.config };
    this.uiDirty = true;
    this.pendingSimRecalc = true;
  } else if (!document.querySelector("#productAcc0") || (document.getElementById("upgrade0") && !document.getElementById("upgradeAcc0"))) {
    this.uiDirty = true;
    this.pendingSimRecalc = true;
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
  this.minUiRefreshMs = intervalTarget;
  if (this.uiDirty && now - this.lastUiRefreshAt >= this.minUiRefreshMs) {
    this.updateUI();
    this.uiDirty = false;
    this.lastUiRefreshAt = now;
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
  this.isDisposed = true;
  this.isLoaded = false;
  this.simCache.clear();
  this.notationCache.clear();
  this.lastComputedAtByItem.clear();
  this.highPriorityIds.clear();

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
