import { describe, expect, it } from "vitest";
import { productionMultipliers } from "./productionMultipliers";
import { knownCpsFunctions } from "./knownCpsRules";
const base = () => ({ owned: [], cookiePowers: [], goldenUpgrades: [], ascensionMode: 0, prestige: 0, heavenlyPower: 0, heavenlyMultiplier: 1, cpsEffect: 1, milkEffect: 1, heralds: 0, santaLevel: 0, achievements: 0, breathOfMilk: 0, radiantAppetite: 0, dragonFortune: 0, gods: { asceticism: 0, ages: 0, decadence: 0, industry: 0, labor: 0, mother: 0 }, startDate: 0, lumps: 0, goldenCount: 0, bakeryName: "", veilBoost: 0 });
function oracle(s, nowMs, centuryNowMs = nowMs) {
  const owned = new Set(s.owned), game = { Objects: {}, cookieUpgrades: s.cookiePowers.map((power, i) => ({ name: `cookie${i}`, power })), ascensionMode: s.ascensionMode, prestige: s.prestige, heavenlyPower: s.heavenlyPower, heralds: s.heralds, santaLevel: s.santaLevel, AchievementsOwned: s.achievements, startDate: s.startDate, lumps: s.lumps, cookiesMultByType: {}, cookiesPsByType: {}, CpsAchievements: [], cookiesPsRawHighest: 0, shimmerTypes: { golden: { n: s.goldenCount } }, bakeryName: s.bakeryName, wrinklers: [], goldenCookieUpgrades: s.goldenUpgrades.map((_, i) => `golden${i}`), buffs: {}, Has: name => owned.has(name) || /^cookie/.test(name) || /^golden/.test(name) && s.goldenUpgrades[Number(name.slice(6))], GetHeavenlyMultiplier: () => s.heavenlyMultiplier, eff: name => name === "cps" ? s.cpsEffect : name === "milk" ? s.milkEffect : 1, auraMult: name => ({ "Breath of Milk": s.breathOfMilk, "Radiant Appetite": s.radiantAppetite, "Dragon's Fortune": s.dragonFortune }[name] || 0), hasGod: name => s.gods[name] || 0, getVeilBoost: () => s.veilBoost, runModHookOnValue: (_name, value) => value, mouseCps: () => 0, computeLumpTimes() {} };
  const source = knownCpsFunctions.CalculateGains.replace("var rawCookiesPs=Game.cookiesPs*mult;", "var rawCookiesPs=Game.cookiesPs*mult; Game.checkpoints={buildMult,milkProgress:Game.milkProgress,milkMult,catMult,rawMult:mult};").replace("Game.unbuffedCps=Game.cookiesPs*mult;", "Game.unbuffedCps=Game.cookiesPs*mult; Game.checkpoints.unbuffedMult=mult;");
  const times = [...(s.gods.ages >= 1 ? [nowMs] : []), ...(owned.has("Century egg") ? [centuryNowMs] : [])];
  new Function("Game", "Date", "name", `return (${source})();`)(game, { now: () => { if (!times.length) throw Error("Unexpected clock read"); return times.shift(); } }, "");
  return game.checkpoints;
}
describe("pure production multiplier checkpoints", () => {
  it("matches pinned CalculateGains exactly across upgrades, gods and time boundaries", () => {
    const names = [...knownCpsFunctions.CalculateGains.matchAll(/Game\.Has\('((?:\\.|[^'])*)'\)/g)].map(m => m[1].replaceAll("\\'", "'"));
    let seed = 20261107;
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    for (let i = 0; i < 800; i++) {
      const s = { ...base(), owned: names.filter(() => rand() > .5), cookiePowers: [rand() * 10, rand() * 25], goldenUpgrades: [true, false, true], ascensionMode: i % 2, prestige: rand() * 1e8, heavenlyPower: rand(), heavenlyMultiplier: rand() * 2, cpsEffect: rand() * 2, milkEffect: rand() * 2, heralds: i % 100, santaLevel: i % 15, achievements: i, breathOfMilk: rand(), radiantAppetite: rand(), dragonFortune: rand(), gods: Object.fromEntries(Object.keys(base().gods).map(k => [k, Math.floor(rand() * 5) - 1])), lumps: i, goldenCount: i % 4, bakeryName: ["", "Orteil", "OrTiEl"][i % 3], veilBoost: rand(), startDate: i % 3 ? 0 : 1e12 };
      const now = [9999, 10000, 10001, 8640000001, 1e12][i % 5];
      expect(productionMultipliers(s, now)).toEqual(oracle(s, now));
    }
  });
  it("covers every upgrade and zero/debug/time checkpoints", () => {
    const names = [...knownCpsFunctions.CalculateGains.matchAll(/Game\.Has\('((?:\\.|[^'])*)'\)/g)].map(m => m[1].replaceAll("\\'", "'"));
    for (const owned of [[], names, names.filter(n => n !== "Occult obstruction"), ["Century egg"], ["Golden switch [off]", "Residual luck"]]) {
      for (const now of [0, 9999, 10000, 10001, 8640000000, 8640000001]) {
        const s = { ...base(), owned, goldenUpgrades: [true, true, true], goldenCount: 3, dragonFortune: .1, gods: { ...base().gods, ages: 3 }, achievements: 777 };
        expect(productionMultipliers(s, now)).toEqual(oracle(s, now));
      }
    }
  });
  it("preserves separate ages and Century egg clock reads", () => {
    for (const ages of [0, 1, 2, 3]) {
      const s = { ...base(), owned: ["Century egg"], gods: { ...base().gods, ages } };
      expect(productionMultipliers(s, 9999, 10000)).toEqual(oracle(s, 9999, 10000));
      expect(productionMultipliers(s, 10000, 9999)).toEqual(oracle(s, 10000, 9999));
    }
    for (const invalid of [NaN, Infinity, -1]) expect(() => productionMultipliers(base(), 0, invalid)).toThrow();
  });
  it("rejects invalid snapshots without reading Game", () => {
    for (const s of [{ ...base(), prestige: NaN }, { ...base(), goldenCount: -1 }, { ...base(), cookiePowers: Array(2) }, { ...base(), gods: { ...base().gods, ages: 4 } }, { ...base(), owned: [false] }]) expect(() => productionMultipliers(s, 0)).toThrow();
    expect(() => productionMultipliers(base(), Infinity)).toThrow();
    expect(productionMultipliers(base(), 0).rawMult).toBe(1);
  });
});
