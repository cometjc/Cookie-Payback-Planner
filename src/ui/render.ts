import type { Building, Upgrade } from "../types/game";
import type { CookiePaybackPlanner } from "../core/predictor";
import { l, PlaySound } from "../core/globals";
import { Game } from "../core/globals";
import {
  getDisplayScoreByToken as getDisplayScoreByTokenFromSelector,
  getItemToken as getItemTokenFromSelector,
  getPriorityScore as getPriorityScoreFromSelector,
  isElementLikelyVisible as isElementLikelyVisibleFromSelector,
} from "../strategy/selectors";
import { maybeLogMetrics as maybeLogMetricsFromModule } from "../strategy/metrics";
import { refreshStrategyScores as refreshStrategyScoresFromEngine } from "../strategy/engine";

export function insertAfter(this: CookiePaybackPlanner, newNode: Node, referenceNode: Node) {
  referenceNode.parentNode?.insertBefore(newNode, referenceNode.nextSibling);
}

export function colorSpanInRainbow(this: CookiePaybackPlanner, span: HTMLSpanElement) {
  const text = span.innerText;
  span.innerHTML = "";
  for (let i = 0; i < text.length; i++) {
    const charElem = document.createElement("span");
    charElem.style.color = "hsl(" + (360 * i) / text.length + ",90%,80%)";
    charElem.innerHTML = text[i];
    span.appendChild(charElem);
  }
}

export function colorSpanByValue(this: CookiePaybackPlanner, span: HTMLSpanElement, value: number) {
  try {
    span.style.color = this.colorRender(value);
  } catch {
    // ignore invalid colors
  }
}

type RatioMetric = {
  score: number;
  rankPercentile: number;
  rankOrder: number;
  normalizedPercent: number;
};

function ratingEmoji(rankPercentile: number, normalizedPercent: number) {
  if (rankPercentile >= 99) return "🏆";
  if (normalizedPercent >= 90) return "🐰";
  if (normalizedPercent <= 30) return "🐢";
  if (normalizedPercent >= 70) return "🚀";
  return "✨";
}

function formatOrdinalRank(value: number) {
  const rounded = Math.max(1, Math.round(value));
  const mod100 = rounded % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${rounded}th`;
  }
  const mod10 = rounded % 10;
  if (mod10 === 1) return `${rounded}st`;
  if (mod10 === 2) return `${rounded}nd`;
  if (mod10 === 3) return `${rounded}rd`;
  return `${rounded}th`;
}

function getItemToken(me: Building | Upgrade) {
  return getItemTokenFromSelector(me);
}

function getDisplayScoreByToken(this: CookiePaybackPlanner, all: Array<Building | Upgrade>) {
  return getDisplayScoreByTokenFromSelector(this, all);
}

function isElementLikelyVisible(el: HTMLElement | null) {
  return isElementLikelyVisibleFromSelector(el);
}

function getPriorityScore(this: CookiePaybackPlanner, me: Building | Upgrade, now: number, visibleTokens: Set<string>) {
  return getPriorityScoreFromSelector(this, me, now, visibleTokens);
}

function refreshStrategyScores(this: CookiePaybackPlanner, all: Array<Building | Upgrade>, now: number) {
  refreshStrategyScoresFromEngine(this, all, now);
}

function maybeLogMetrics(this: CookiePaybackPlanner) {
  maybeLogMetricsFromModule(this);
}

function ensureStoreQuickAutoBuyControls(this: CookiePaybackPlanner) {
  const storeTitle = document.getElementById("storeTitle");
  if (!storeTitle || !storeTitle.parentElement) {
    return;
  }
  let root = document.getElementById("cppStoreQuickAutoBuy");
  if (!root) {
    root = document.createElement("div");
    root.id = "cppStoreQuickAutoBuy";
    root.style.display = "inline-flex";
    root.style.alignItems = "center";
    root.style.gap = "6px";
    root.style.marginLeft = "8px";
    this.insertAfter(root, storeTitle);

    const quickButton = document.createElement("a");
    quickButton.id = "cppStoreQuickAutoBuyButton";
    quickButton.classList.add("smallFancyButton", "prefButton", "option");
    quickButton.addEventListener("click", () => {
      this.config.autoBuy = !this.config.autoBuy;
      this.markConfigDirty();
      PlaySound("snd/tick.mp3");
      ensureStoreQuickAutoBuyControls.call(this);
    });
    root.appendChild(quickButton);

    const speedLabel = document.createElement("span");
    speedLabel.id = "cppStoreQuickAutoBuySpeed";
    speedLabel.style.opacity = "0.9";
    speedLabel.style.fontSize = "12px";
    root.appendChild(speedLabel);
  }

  const button = document.getElementById("cppStoreQuickAutoBuyButton") as HTMLAnchorElement | null;
  const speed = document.getElementById("cppStoreQuickAutoBuySpeed") as HTMLSpanElement | null;
  if (button) {
    button.classList.toggle("off", !this.config.autoBuy);
    button.textContent = `Auto buy: ${this.config.autoBuy ? "On" : "Off"}`;
  }
  if (speed) {
    const unitsPerSec = this.getRecentPurchaseUnitsPerSec();
    speed.textContent = `${unitsPerSec.toFixed(2)} buy/s`;
  }
}

export function updateNotation(this: CookiePaybackPlanner, me: Building | Upgrade, metric?: RatioMetric) {
  me.waitingTime = this.calcWaitingTime(me);
  const cacheId = getItemToken(me);
  const nextOpacity = me.waitingTime && Game.cookies >= me.getPrice() ? "0.6" : "";
  if (me.type == "upgrade") {
    const inStoreId = Game.UpgradesInStore.indexOf(me as Upgrade);
    me.l = l("upgrade" + inStoreId);
    if (me.l && me.l.dataset.cppHoverTracked !== "1") {
      me.l.dataset.cppHoverTracked = "1";
      me.l.addEventListener("mouseenter", () => {
        this.highPriorityIds.add(cacheId);
        this.uiDirty = true;
      });
    }
    let span = document.querySelector("#upgradeAcc" + me.id) as HTMLSpanElement | null;
    if (!span) {
      span = document.createElement("span");
      span.id = "upgradeAcc" + me.id;
      span.style.fontWeight = "bolder";
      span.style.position = "absolute";
      span.style.bottom = "0px";
      span.style.textShadow = "0px 2px 6px #000, 0px 1px 1px #000";
      span.style.fontSize = "0.7em";
      span.style.transform = "scale(1, 1.4) translate(3%, -13%)";
      span.style.display = "block";
      span.style.zIndex = "20";
      me.l.appendChild(span);
    }

    let nextText = "";
    let nextColorMode: "rainbow" | "solid" = "solid";
    let nextColorValue = "";
    if (metric && metric.score !== 0) {
      const labelParts: string[] = [];
      labelParts.push(`${ratingEmoji(metric.rankPercentile, metric.normalizedPercent)} ${formatOrdinalRank(metric.rankOrder)}`);
      labelParts.push(`${metric.normalizedPercent.toFixed(0)}%`);
      const label = labelParts.join(" ");
      nextText = me.waitingTime ? `${me.waitingTime}<br>${label}` : label;
      try {
        nextColorValue = this.colorRender(metric.score);
      } catch {
        nextColorValue = "";
      }
    }
    const prev = this.notationCache.get(cacheId);
    const isSame =
      prev &&
      prev.text === nextText &&
      prev.colorMode === nextColorMode &&
      prev.colorValue === nextColorValue &&
      prev.opacity === nextOpacity;
    if (!isSame) {
      span.innerHTML = nextText;
      if (nextOpacity) {
        me.l.style.opacity = nextOpacity;
      } else {
        me.l.style.removeProperty("opacity");
      }
      if (nextText) {
        this.colorSpanByValue(span, metric?.score ?? 0);
      }
      this.notationCache.set(cacheId, {
        text: nextText,
        colorMode: nextColorMode,
        colorValue: nextColorValue,
        opacity: nextOpacity,
      });
    }
  } else {
    if (me.l && me.l.dataset.cppHoverTracked !== "1") {
      me.l.dataset.cppHoverTracked = "1";
      me.l.addEventListener("mouseenter", () => {
        this.highPriorityIds.add(cacheId);
        this.uiDirty = true;
      });
    }
    let span = document.querySelector("#productAcc" + me.id) as HTMLSpanElement | null;
    if (!span) {
      span = document.createElement("span");
      span.id = "productAcc" + me.id;
      span.style.fontWeight = "bolder";
      span.style.display = "block";
      span.style.filter = "contrast(1.5)";
      this.insertAfter(span, l("productPrice" + me.id));
    }

    let nextText = "";
    let nextColorMode: "rainbow" | "solid" = "solid";
    let nextColorValue = "";
    if (metric && metric.score !== 0) {
      const labelParts: string[] = [];
      labelParts.push(`${ratingEmoji(metric.rankPercentile, metric.normalizedPercent)} ${formatOrdinalRank(metric.rankOrder)}`);
      labelParts.push(`${metric.normalizedPercent.toFixed(0)}%`);
      nextText = labelParts.join(" · ");
      if (me.BestHelperOrder && me.BestHelperAmount > me.amount + 1) {
        nextText += " (to " + me.BestHelperAmount + ")";
      } else if (me.BestBuyToAmount > me.amount + 1) {
        nextText += " (to " + me.BestBuyToAmount + ")";
      }
      if (me.waitingTime) {
        nextText += " ⏳" + me.waitingTime;
      }
      try {
        nextColorValue = this.colorRender(metric.score);
      } catch {
        nextColorValue = "";
      }
    }
    const prev = this.notationCache.get(cacheId);
    const isSame =
      prev &&
      prev.text === nextText &&
      prev.colorMode === nextColorMode &&
      prev.colorValue === nextColorValue &&
      prev.opacity === nextOpacity;
    if (!isSame) {
      span.textContent = nextText;
      if (nextOpacity) {
        me.l.style.opacity = nextOpacity;
      } else {
        me.l.style.removeProperty("opacity");
      }
      if (nextText) {
        this.colorSpanByValue(span, metric?.score ?? 0);
      }
      this.notationCache.set(cacheId, {
        text: nextText,
        colorMode: nextColorMode,
        colorValue: nextColorValue,
        opacity: nextOpacity,
      });
    }
  }
}

export function arrayCommonInTheSameOrder(this: CookiePaybackPlanner, a: unknown[], b: unknown[]) {
  const bSet = new Set(b);
  const aSet = new Set(a);
  const filteredA = a.filter((e) => bSet.has(e));
  const filteredB = b.filter((e) => aSet.has(e));
  return filteredA.every((value, index) => value === filteredB[index]);
}

export function reorderUpgrades(this: CookiePaybackPlanner, upgrades: Upgrade[]) {
  const filtered = upgrades.filter(
    (e) =>
      !(e.isVaulted && e.isVaulted()) &&
      e.pool !== "toggle" &&
      !!e.l &&
      typeof (e.l as HTMLElement).id === "string" &&
      (e.l as HTMLElement).id.length > 0
  );
  if (!filtered.length) {
    return;
  }
  const upgrades_order = filtered.map((e) => e.l.id);
  const upgrades_order_on_page = [...document.querySelectorAll(".upgrade")]
    .map((e) => e.id)
    .filter((e) => e !== "storeBuyAll");

  if (this.arrayCommonInTheSameOrder(upgrades_order, upgrades_order_on_page)) return;

  const divTechUpgrades = document.querySelector("#techUpgrades") as HTMLElement | null;
  const divUpgrades = document.querySelector("#upgrades") as HTMLElement | null;
  filtered.reverse().forEach((upgrade) => {
    if (upgrade.pool === "tech") {
      divTechUpgrades?.prepend(upgrade.l);
    } else {
      divUpgrades?.prepend(upgrade.l);
    }
  });
  const buyAllBar = l("storeBuyAll");
  if (buyAllBar && divUpgrades) divUpgrades.prepend(buyAllBar);
}

export function reorderBuildings(this: CookiePaybackPlanner, buildings: Building[]) {
  const buildings_order = buildings.map((e) => e.l.id);
  const building_order_on_page = [...document.querySelectorAll(".product:not(.toggledOff)")]
    .map((e) => e.id)
    .filter((e) => e !== "storeBulk");

  if (this.arrayCommonInTheSameOrder(buildings_order, building_order_on_page)) return;

  const product = document.querySelector("#products") as HTMLElement | null;
  buildings
    .slice()
    .reverse()
    .forEach((building) => {
      product?.prepend(building.l);
    });
  const bulkBar = l("storeBulk");
  if (bulkBar && product) product.prepend(bulkBar);
}

export function reapplyLastKnownStoreOrder(this: CookiePaybackPlanner) {
  if (!this.config.enableSort) {
    return;
  }

  const visibleBuildings: Building[] = [];
  for (const building of Game.ObjectsById) {
    if (!building.l.classList.contains("toggledOff")) {
      visibleBuildings.push(building);
    }
  }
  const orderedBuildings: Building[] = [];
  const buildingByToken = new Map(visibleBuildings.map((building) => [getItemToken(building), building] as const));
  for (const token of this.lastSortedBuildingTokens) {
    const building = buildingByToken.get(token);
    if (building) {
      orderedBuildings.push(building);
      buildingByToken.delete(token);
    }
  }
  orderedBuildings.push(...buildingByToken.values());
  this.reorderBuildings(orderedBuildings);

  const storeUpgrades = [...Game.UpgradesInStore]
    .map((upgrade, inStoreIndex) => {
      const currentEl = l("upgrade" + inStoreIndex) as HTMLElement | null;
      if (currentEl) {
        upgrade.l = currentEl;
      }
      return upgrade;
    })
    .filter((upgrade) => !(upgrade.isVaulted && upgrade.isVaulted()) && upgrade.pool !== "toggle");
  const orderedUpgrades: Upgrade[] = [];
  const upgradeByToken = new Map(storeUpgrades.map((upgrade) => [getItemToken(upgrade), upgrade] as const));
  for (const token of this.lastSortedUpgradeTokens) {
    const upgrade = upgradeByToken.get(token);
    if (upgrade) {
      orderedUpgrades.push(upgrade);
      upgradeByToken.delete(token);
    }
  }
  orderedUpgrades.push(...upgradeByToken.values());
  this.reorderUpgrades(orderedUpgrades);
}

export function reapplyLastKnownNotationFromCache(this: CookiePaybackPlanner) {
  for (const building of Game.ObjectsById) {
    if (building.l.classList.contains("toggledOff")) {
      continue;
    }
    const token = getItemToken(building);
    const cached = this.notationCache.get(token);
    if (!cached) {
      continue;
    }
    let span = document.querySelector("#productAcc" + building.id) as HTMLSpanElement | null;
    if (!span) {
      span = document.createElement("span");
      span.id = "productAcc" + building.id;
      span.style.fontWeight = "bolder";
      span.style.display = "block";
      span.style.filter = "contrast(1.5)";
      this.insertAfter(span, l("productPrice" + building.id));
    }
    span.textContent = cached.text;
    if (cached.opacity) {
      building.l.style.opacity = cached.opacity;
    } else {
      building.l.style.removeProperty("opacity");
    }
    if (cached.colorValue) {
      span.style.color = cached.colorValue;
    } else {
      span.style.removeProperty("color");
    }
  }

  for (const upgrade of Game.UpgradesInStore) {
    const token = getItemToken(upgrade);
    const cached = this.notationCache.get(token);
    if (!cached) {
      continue;
    }
    const inStoreId = Game.UpgradesInStore.indexOf(upgrade as Upgrade);
    const upgradeElement = l("upgrade" + inStoreId) as HTMLElement | null;
    if (!upgradeElement) {
      continue;
    }
    let span = document.querySelector("#upgradeAcc" + upgrade.id) as HTMLSpanElement | null;
    if (!span) {
      span = document.createElement("span");
      span.id = "upgradeAcc" + upgrade.id;
      span.style.fontWeight = "bolder";
      span.style.position = "absolute";
      span.style.bottom = "0px";
      span.style.textShadow = "0px 2px 6px #000, 0px 1px 1px #000";
      span.style.fontSize = "0.7em";
      span.style.transform = "scale(1, 1.4) translate(3%, -13%)";
      span.style.display = "block";
      span.style.zIndex = "20";
      upgradeElement.appendChild(span);
    }
    span.innerHTML = cached.text;
    if (cached.opacity) {
      upgradeElement.style.opacity = cached.opacity;
    } else {
      upgradeElement.style.removeProperty("opacity");
    }
    if (cached.colorValue) {
      span.style.color = cached.colorValue;
    } else {
      span.style.removeProperty("color");
    }
  }
}

export function updateUI(this: CookiePaybackPlanner) {
  this.tickCount = 0;
  this.sampleSmoothedClickCps();
  const adaptiveBudget = this.tuneAdaptiveBudget();
  this.pendingSimRecalc = false;
  const buildings: Building[] = [];
  const upgrades = [...Game.UpgradesInStore];
  for (const building of Game.ObjectsById) {
    if (!building.l.classList.contains("toggledOff")) {
      buildings.push(building);
    }
  }
  const all: Array<Building | Upgrade> = [...buildings, ...upgrades];
  ensureStoreQuickAutoBuyControls.call(this);
  const now = Date.now();
  const visibleTokens = new Set<string>();
  for (const me of all) {
    const token = getItemToken(me);
    if (isElementLikelyVisible(me.l || null)) {
      visibleTokens.add(token);
    }
  }
  const staleCount = all.filter((me) => {
    const token = getItemToken(me);
    const lastComputedAt = this.lastComputedAtByItem.get(token) ?? 0;
    return now - lastComputedAt >= this.maxStalenessMs;
  }).length;
  this.simBudgetPerRefresh = Math.max(this.minBudget, Math.min(this.maxBudget, adaptiveBudget));
  this.simBudgetRemaining = Math.max(this.simBudgetPerRefresh, staleCount);
  const candidates = [...all].sort(
    (a, b) => getPriorityScore.call(this, b, now, visibleTokens) - getPriorityScore.call(this, a, now, visibleTokens)
  );
  candidates.forEach((me) => this.updateBestCpsAcceleration(me));
  if (this.pendingSimRecalc) {
    this.uiDirty = true;
  }

  all.sort((a, b) => {
    if (a.BestCpsAcceleration === b.BestCpsAcceleration) {
      return 0;
    }
    return b.BestCpsAcceleration - a.BestCpsAcceleration;
  });

  this.updateHelperOrder(all);
  refreshStrategyScores.call(this, all, now);

  const displayScoreByToken = getDisplayScoreByToken.call(this, all);
  this.updateColorRender(all, displayScoreByToken);

  const displayScores = all.map((e) => displayScoreByToken.get(getItemToken(e)) ?? 0).filter((e) => e !== 0);
  if (displayScores.length === 0) {
    return;
  }
  const scoreEntries = all.map((me) => ({
    me,
    score: displayScoreByToken.get(getItemToken(me)) ?? 0,
  }));
  const scoreValues = scoreEntries.map((entry) => entry.score);
  const maxScore = scoreValues.length ? Math.max(...scoreValues) : 0;
  const minScore = scoreValues.length ? Math.min(...scoreValues) : 0;
  const range = maxScore - minScore;
  const sortedEntries = [...scoreEntries].sort((a, b) => b.score - a.score);
  const ratioMetrics = new Map<Building | Upgrade, RatioMetric>();
  sortedEntries.forEach((entry, index) => {
    const rankOrder = index + 1;
    const rankPercentile =
      sortedEntries.length === 1 ? 100 : ((sortedEntries.length - index) / sortedEntries.length) * 100;
    ratioMetrics.set(entry.me, {
      score: entry.score,
      rankPercentile,
      rankOrder,
      normalizedPercent: range > 0 ? ((entry.score - minScore) / range) * 100 : 100,
    });
  });

  all.forEach((me) => this.updateNotation(me, ratioMetrics.get(me)));

  if (!document.getElementById("upgradeAcc0") && document.getElementById("upgrade0")) {
    const spanElement = document.createElement("span");
    spanElement.id = "upgradeAcc0";
    document.getElementById("upgrade0")?.appendChild(spanElement);
  }

  if (this.config.enableSort) {
    const sortFunction = (a: Building | Upgrade, b: Building | Upgrade) =>
      Number(!this.isIgnored(b)) - Number(!this.isIgnored(a)) ||
      (displayScoreByToken.get(getItemToken(b)) ?? 0) - (displayScoreByToken.get(getItemToken(a)) ?? 0) ||
      b.BestHelperOrder - a.BestHelperOrder;
    all.sort(sortFunction);
    upgrades.sort(sortFunction);
    buildings.sort(sortFunction);
    this.lastSortedUpgradeTokens = upgrades.map((upgrade) => getItemToken(upgrade));
    this.lastSortedBuildingTokens = buildings.map((building) => getItemToken(building));
  } else {
    this.lastSortedUpgradeTokens = [];
    this.lastSortedBuildingTokens = [];
  }

  this.reorderUpgrades(upgrades);
  this.reorderBuildings(buildings);

  const bestCandidate = all[0] ?? null;
  this.autoBuyBestCandidate = bestCandidate;
  this.autoBuyBestCandidateToken = bestCandidate ? getItemToken(bestCandidate) : "";
  this.autoBuyBestCandidateAt = Date.now();
  this.autoBuyTopCandidates = all.slice(0, 5).map((item) => {
    const token = getItemToken(item);
    const score = displayScoreByToken.get(token) ?? 0;
    const waitSec = this.estimateWaitSeconds(item.getPrice(), Game.cookies, Game.unbuffedCps);
    return { item, token, score, waitSec };
  });
  if (typeof Game.registerHook !== "function" && this.config.autoBuy && bestCandidate && bestCandidate.waitingTime === "" && Game.buyMode == 1) {
    bestCandidate.buy();
  }
  if (bestCandidate && !this.pendingSimRecalc) {
    this.autoBuyAwaitingFreshBestDeal = false;
  }
  maybeLogMetrics.call(this);
}

