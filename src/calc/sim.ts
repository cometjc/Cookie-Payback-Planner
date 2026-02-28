import chroma from "chroma-js";
import type { Building, SimulateStatus, Upgrade } from "../types/game";
import type { CookiePaybackPlanner } from "../core/predictor";
import { Game } from "../core/globals";

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
    sim.waitTime += (price + bank - sim.currentCookies) / oldCps;
    sim.paidCookies += sim.currentCookies - bank;
    sim.currentCookies = bank;
  } else {
    sim.waitTime += (price + bank - sim.currentCookies) / oldCps;
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
  me.BestCpsAcceleration = 0;
  me.BestBuyToAmount = 0;
  me.BestWaitTime = Infinity;

  if (this.isIgnored(me) || Game.cookies === 0) return;

  const oldCps = Game.unbuffedCps;
  const sim = this.initSimData();
  const save = this.enterSandBox(me);

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
    let nextTierUpgrade = null as Upgrade | null;
    let amountToUnlockTier = 0;
    const lockedTiers = Object.values(building.tieredUpgrades || {}).filter(
      (e) => Game.Tiers[e.tier].unlock !== -1 && e.buildingTie.bought < Game.Tiers[e.tier].unlock
    );
    if (lockedTiers.length) {
      amountToUnlockTier = Game.Tiers[lockedTiers[0].tier].unlock;
      if (amountToUnlockTier <= me.bought + 15) {
        nextTierUpgrade = lockedTiers[0];
      }
    }

    for (let buy = 0; buy < 50; buy++) {
      this.calcCookieTimesCost(building.getPrice(), Game.unbuffedCps, sim);
      building.amount++;
      building.bought++;
      Game.CalculateGains();
      if (nextTierUpgrade && building.amount == amountToUnlockTier) {
        this.calcCookieTimesCost(nextTierUpgrade.getPrice(), Game.unbuffedCps, sim);
        nextTierUpgrade.bought = 1;
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
    if (nextTierUpgrade) nextTierUpgrade.bought = 0;
  }
  this.leaveSandBox(save);
}

export function updateHelperOrder(this: CookiePaybackPlanner, all: Array<Building | Upgrade>) {
  all.forEach((e) => (e.BestHelperOrder = 0));
  all = all.filter((e) => !this.isIgnored(e));

  let helperOrder = 0;
  let target = all[0];

  while (target.getPrice() > Game.cookies) {
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

      const sim = this.initSimData();

      me.timeToTargetCookie = Infinity;
      for (let buy = 1; buy < Infinity; buy++) {
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

      this.leaveSandBox(save);
    }

    helpers.sort((a, b) => a.timeToTargetCookie - b.timeToTargetCookie);
    if (helpers[0].timeToTargetCookie >= target.timeToTargetCookie) return;
    helperOrder++;
    helpers[0].BestHelperOrder = helperOrder;
    target = helpers[0];
  }
}

export function updateColorRender(this: CookiePaybackPlanner, all: Array<Building | Upgrade>) {
  const cpsAccList = [...new Set(all.map((e) => e.BestCpsAcceleration))].sort((a, b) => b - a);
  const colorGroups = [
    [this.config.colorLast, cpsAccList[cpsAccList.length - 1]],
    [this.config.color15, cpsAccList[15]],
    [this.config.color7, cpsAccList[7]],
    [this.config.color1, cpsAccList[1]],
    [this.config.color0, cpsAccList[0]],
  ].filter((e) => e[1] !== undefined);
  this.colorRender = chroma
    .scale(colorGroups.map((e) => e[0] as string))
    .mode("lab")
    .domain(colorGroups.map((e) => e[1] as number)) as (value: number) => string;
}

export function calcWaitingTime(this: CookiePaybackPlanner, me: Building | Upgrade) {
  const bank = this.getBankCookies();
  let waitCookie = me.getPrice() + bank - Game.cookies;
  if (waitCookie < 0) return "";

  const seconds = waitCookie / Game.cookiesPs;
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
