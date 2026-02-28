import type { Building, Upgrade } from "../types/game";
import type { CookiePaybackPlanner } from "../core/predictor";
import { Beautify, l } from "../core/globals";
import { Game } from "../core/globals";

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
  logRatio: number;
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

function calcMedian(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function getItemToken(me: Building | Upgrade) {
  return `${me.type}:${me.id}`;
}

function isElementLikelyVisible(el: HTMLElement | null) {
  if (!el || !el.isConnected) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  const rect = el.getBoundingClientRect();
  return rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
}

function getPriorityScore(this: CookiePaybackPlanner, me: Building | Upgrade) {
  const token = getItemToken(me);
  const now = Date.now();
  const lastComputedAt = this.lastComputedAtByItem.get(token) ?? 0;
  const staleMs = now - lastComputedAt;
  const isStale = staleMs >= this.maxStalenessMs;
  const isVisible = isElementLikelyVisible(me.l || null);
  const nearAffordable = me.getPrice() <= Game.cookies + Math.max(Game.cookiesPs * 2, 1);
  const isHighPriority = this.highPriorityIds.has(token);

  let score = 0;
  if (isStale) score += 1000;
  if (isHighPriority) score += 600;
  if (isVisible) score += 300;
  if (nearAffordable) score += 120;
  score += Math.min(100, staleMs / 25);
  return score;
}

export function updateNotation(this: CookiePaybackPlanner, me: Building | Upgrade, avgAcc: number, metric?: RatioMetric) {
  me.waitingTime = this.calcWaitingTime(me);
  const cacheId = `${me.type}:${me.id}`;
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
    if (me.BestCpsAcceleration !== 0) {
      const labelParts: string[] = [];
      if (metric) {
        labelParts.push(`${ratingEmoji(metric.rankPercentile, metric.normalizedPercent)} ${formatOrdinalRank(metric.rankOrder)}`);
        labelParts.push(`${metric.normalizedPercent.toFixed(0)}%`);
      }
      const label = labelParts.join(" ");
      nextText = me.waitingTime ? `${me.waitingTime}<br>${label}` : label;
      if (me.BestHelperOrder) {
        nextColorMode = "rainbow";
      } else {
        try {
          nextColorValue = this.colorRender(me.BestCpsAcceleration);
        } catch {
          nextColorValue = "";
        }
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
        if (nextColorMode === "rainbow") {
          this.colorSpanInRainbow(span);
        } else {
          this.colorSpanByValue(span, me.BestCpsAcceleration);
        }
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
    if (me.BestCpsAcceleration !== 0) {
      const labelParts: string[] = [];
      if (metric) {
        labelParts.push(`${ratingEmoji(metric.rankPercentile, metric.normalizedPercent)} ${formatOrdinalRank(metric.rankOrder)}`);
        labelParts.push(`${metric.normalizedPercent.toFixed(0)}%`);
      }
      nextText = labelParts.join(" · ");
      if (me.BestHelperOrder) {
        if (me.BestHelperAmount > me.amount + 1) {
          nextText += " (to " + me.BestHelperAmount + ")";
        }
        nextColorMode = "rainbow";
      } else if (me.BestBuyToAmount > me.amount + 1) {
        nextText += " (to " + me.BestBuyToAmount + ")";
      }
      if (me.waitingTime) {
        nextText += " ⏳" + me.waitingTime;
      }
      if (nextColorMode === "solid") {
        try {
          nextColorValue = this.colorRender(me.BestCpsAcceleration);
        } catch {
          nextColorValue = "";
        }
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
        if (nextColorMode === "rainbow") {
          this.colorSpanInRainbow(span);
        } else {
          this.colorSpanByValue(span, me.BestCpsAcceleration);
        }
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
  const filteredA = a.filter((e) => b.includes(e));
  const filteredB = b.filter((e) => a.includes(e));
  return filteredA.every((value, index) => value === filteredB[index]);
}

export function reorderUpgrades(this: CookiePaybackPlanner, upgrades: Upgrade[]) {
  const filtered = upgrades.filter((e) => !(e.isVaulted && e.isVaulted()) && e.pool !== "toggle");
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

export function updateUI(this: CookiePaybackPlanner) {
  this.tickCount = 0;
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
  const now = Date.now();
  const staleCount = all.filter((me) => {
    const token = getItemToken(me);
    const lastComputedAt = this.lastComputedAtByItem.get(token) ?? 0;
    return now - lastComputedAt >= this.maxStalenessMs;
  }).length;
  this.simBudgetPerRefresh = Math.max(this.minBudget, Math.min(this.maxBudget, adaptiveBudget));
  this.simBudgetRemaining = Math.max(this.simBudgetPerRefresh, staleCount);
  const candidates = [...all].sort((a, b) => getPriorityScore.call(this, b) - getPriorityScore.call(this, a));
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

  this.updateColorRender(all);

  const allAcc = all.map((e) => e.BestCpsAcceleration).filter((e) => e !== 0);
  if (allAcc.length === 0) {
    return;
  }
  const avg = allAcc.reduce((a, b) => a + b, 0) / allAcc.length;

  const median = calcMedian(allAcc);
  const ratioEntries = all.map((me) => {
    const acc = me.BestCpsAcceleration;
    const logRatio = acc ? Math.log(acc / median + 1) : 0;
    return { me, logRatio };
  });
  const logValues = ratioEntries.map((entry) => entry.logRatio);
  const maxLog = logValues.length ? Math.max(...logValues) : 0;
  const minLog = logValues.length ? Math.min(...logValues) : 0;
  const range = maxLog - minLog;
  const sortedEntries = [...ratioEntries].sort((a, b) => b.logRatio - a.logRatio);
  const ratioMetrics = new Map<Building | Upgrade, RatioMetric>();
  sortedEntries.forEach((entry, index) => {
    const rankOrder = index + 1;
    const rankPercentile =
      sortedEntries.length === 1 ? 100 : ((sortedEntries.length - index) / sortedEntries.length) * 100;
    ratioMetrics.set(entry.me, {
      logRatio: entry.logRatio,
      rankPercentile,
      rankOrder,
      normalizedPercent: range > 0 ? ((entry.logRatio - minLog) / range) * 100 : 100,
    });
  });

  all.forEach((me) => this.updateNotation(me, avg, ratioMetrics.get(me)));

  if (!document.getElementById("upgradeAcc0") && document.getElementById("upgrade0")) {
    const spanElement = document.createElement("span");
    spanElement.id = "upgradeAcc0";
    document.getElementById("upgrade0")?.appendChild(spanElement);
  }

  if (this.config.enableSort) {
    const sortFunction = (a: Building | Upgrade, b: Building | Upgrade) =>
      Number(!this.isIgnored(b)) - Number(!this.isIgnored(a)) ||
      b.BestHelperOrder - a.BestHelperOrder ||
      b.BestCpsAcceleration - a.BestCpsAcceleration;
    all.sort(sortFunction);
    upgrades.sort(sortFunction);
    buildings.sort(sortFunction);
  }

  this.reorderUpgrades(upgrades);
  this.reorderBuildings(buildings);

  if (this.config.autoBuy && all[0].waitingTime === "" && Game.buyMode == 1) {
    all[0].buy();
  }
}
