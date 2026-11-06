import type { ProductionSnapshot } from "./productionProjection";
import type { ProductionMultiplierSnapshot } from "./productionMultipliers";
import type { BuildingPriceInput } from "./buildingPriceModel";
import { knownCookiePowers, knownCpsFunctions } from "./knownCpsRules";

// ponytail: literal Has names in pinned CalculateGains; new dynamic rules need explicit capture like cookie powers below.
const multiplierUpgradeNames = [...new Set([...knownCpsFunctions.CalculateGains.matchAll(/Game\.Has\('((?:\\.|[^'])*)'\)/g)].map(m => m[1].replace(/\\'/g, "'")))];

const fingers = ["Thousand", "Million", "Billion", "Trillion", "Quadrillion", "Quintillion", "Sextillion", "Septillion", "Octillion", "Nonillion", "Decillion", "Undecillion"];
const read = (object: any, key: string, optional = false) => {
  if (typeof key !== "string" && (typeof key !== "number" || !Number.isFinite(key))) throw Error("Unsupported production key");
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor && optional && !(key in object)) return undefined;
  if (!descriptor || !("value" in descriptor)) throw Error(`Unsupported production field: ${key}`);
  return descriptor.value;
};
const number = (object: any, key: string) => {
  const value = read(object, key);
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw Error(`Invalid production field: ${key}`);
  return value;
};
const values = (object: any) => {
  // Native formulas use for-in; inherited enumerable entries cannot be silently omitted.
  for (const key in object) if (!Object.prototype.hasOwnProperty.call(object, key)) throw Error("Inherited production field");
  if (Array.isArray(object) && Object.keys(object).length !== object.length) throw Error("Sparse production array");
  return Object.keys(object).map(key => read(object, key));
};

export function captureProductionEffects(game: any): Record<string, number> {
  const effects: Record<string, number> = Object.create(null);
  for (const b of values(read(game, "Objects"))) {
    if (!read(b, "minigameLoaded", true)) continue;
    const minigame = read(b, "minigame");
    if (minigame === game) throw Error("Unsupported minigame effect owner");
    const source = read(minigame, "effs", true);
    if (!source) continue;
    values(source);
    for (const key of Object.keys(source)) {
      const value = number(source, key);
      effects[key] = effects[key] ? effects[key] * value : value;
      if (!Number.isFinite(effects[key])) throw Error("Invalid combined production effect");
    }
  }
  return effects;
}

/** Data capture only. Caller must validate version, helper sources, hooks and minigame rules before calling. */
export function captureProductionSnapshot(game: any, effects = captureProductionEffects(game), ownedOverrides: string[] = []): ProductionSnapshot {
  const buildings = read(game, "ObjectsById"), objects = read(game, "Objects");
  if (!Array.isArray(buildings) || buildings.length < 3 || values(objects).length !== buildings.length
    || values(objects).some((b, i) => b !== buildings[i])
    || buildings.some((b, i) => read(b, "id") !== i || read(objects, read(b, "name")) !== b)
    || read(buildings[0], "name") !== "Cursor" || read(buildings[1], "name") !== "Grandma") throw Error("Unsupported building order");
  const ascensionMode = number(game, "ascensionMode");
  if (![0, 1].includes(ascensionMode)) throw Error("Unsupported ascension mode");
  const has = (name: string) => {
    if (name !== undefined && typeof name !== "string") throw Error("Invalid upgrade name");
    if (ownedOverrides.includes(name)) return true;
    const value = game.Has(name);
    if (![0, 1, false, true].includes(value)) throw Error("Invalid upgrade ownership");
    return !!value;
  };
  const effect = (name: string) => {
    const value = effects[name] ?? 1;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw Error("Invalid production effect");
    return value;
  };
  const rules = buildings.map(b => {
    const id = number(b, "id"), tierMultipliers: number[] = [];
    for (const u of values(read(b, "tieredUpgrades")) as any[]) {
      const tier = read(read(game, "Tiers"), read(u, "tier"));
      if (!read(tier, "special", true) && has(read(u, "name"))) {
        let multiplier = 2;
        if (ascensionMode !== 1 && has(read(b, "unshackleUpgrade")) && has(read(tier, "unshackleUpgrade"))) multiplier += id === 1 ? .5 : (20 - id) * .1;
        tierMultipliers.push(multiplier);
      }
    }
    const synergies = (values(read(b, "synergies")) as any[]).map(u => {
      const a = read(u, "buildingTie1"), c = read(u, "buildingTie2");
      if (!buildings.includes(a) || !buildings.includes(c)) throw Error("Unknown synergy building");
      return {tie1: number(a, "id"), tie2: number(c, "id"), enabled: has(read(u, "name"))};
    });
    const fortune = read(b, "fortune"), grandma = read(b, "grandma", true);
    return {id, tierMultipliers, synergies, fortune: !!fortune && has(read(fortune, "name")), grandma: !!grandma && has(read(grandma, "name"))};
  });
  const portalIndex = buildings.indexOf(read(objects, "Portal"));
  const elderBattalion = game.auraMult("Elder Battalion");
  if (!Number.isFinite(elderBattalion) || elderBattalion < 0 || portalIndex < 2) throw Error("Invalid special building inputs");
  return {
    amounts: buildings.map(b => number(b, "amount")), levels: buildings.map(b => number(b, "level")),
    ordinary: buildings.slice(2).map((b, i) => ({...rules[i + 2], baseCps: number(b, "baseCps")})),
    specialTiers: [rules[0], rules[1]], ascensionMode,
    egg: has('"egg"'), milkTablets: has("Milkhelp&reg; lactose intolerance relief tablets"),
    cursor: {fingers: [...fingers.map(name => has(name + " fingers")), has("Unshackled cursors")],
      basic: ["Reinforced index finger", "Carpal tunnel prevention cream", "Ambidextrous"].map(has), effect: effect("cursorCps")},
    grandma: {portalIndex, baseCps: number(buildings[1], "baseCps"),
      upgrades: ["Bingo center/Research facility", "Ritual rolling pins", "Naughty list", "Elderwort biscuits", "Cat ladies", "One mind", "Communal brainsweep", "Elder Pact"].map(has),
      synergyOwned: values(read(game, "GrandmaSynergies")).map(name => has(name as string)),
      kittensOwned: values(read(read(game, "UpgradesByPool"), "kitten")).map(u => has(read(u, "name"))),
      effect: effect("grandmaCps"), elderBattalion},
  };
}

/** Captures multiplier inputs after source/hook validation; never calls cookie power callbacks. */
export function captureProductionMultiplierSnapshot(game: any, effects = captureProductionEffects(game)): ProductionMultiplierSnapshot {
  const has = (name: string) => {
    if (name !== undefined && typeof name !== "string") throw Error("Invalid upgrade name");
    const result = game.Has(name);
    if (![0, 1, false, true].includes(result)) throw Error("Invalid upgrade ownership");
    return !!result;
  };
  const god = (name: string) => {
    const value = game.hasGod ? game.hasGod(name) : 0;
    if (![false, -1, 0, 1, 2, 3].includes(value)) throw Error("Invalid god slot");
    return Number(value);
  };
  const cookiePowers: number[] = [];
  for (const u of values(read(game, "cookieUpgrades"))) {
    if (!has(read(u, "name"))) continue;
    let power = read(u, "power");
    if (typeof power === "function") {
      const source = Function.prototype.toString.call(power).replace(/\r\n/g, "\n").trim();
      const kind = knownCookiePowers.findIndex(s => s.replace(/\r\n/g, "\n").trim() === source);
      if (kind === 0) {
        power = has("Starlove") ? 3 : 2;
        const slot = god("seasons");
        if (slot === 1) power *= 1.3; else if (slot === 2) power *= 1.2; else if (slot === 3) power *= 1.1;
      } else if (kind === 1) power = 5 + values(read(game, "Objects")).filter(b => number(b, "level") >= 10).length;
      else throw Error("Unknown cookie power");
    }
    if (typeof power !== "number" || !Number.isFinite(power) || power < 0) throw Error("Invalid cookie power");
    cookiePowers.push(power);
  }
  const upgrades = read(game, "Upgrades");
  const owned = multiplierUpgradeNames.filter(name => {
    const upgrade = read(upgrades, name, true);
    if (!upgrade) return false;
    if (read(upgrade, "name") !== name) throw Error("Invalid multiplier upgrade identity");
    return has(name);
  });
  return {
    owned, cookiePowers,
    goldenUpgrades: values(read(game, "goldenCookieUpgrades")).map(has),
    ascensionMode: number(game, "ascensionMode"), prestige: number(game, "prestige"), heavenlyPower: number(game, "heavenlyPower"),
    heavenlyMultiplier: game.GetHeavenlyMultiplier(), cpsEffect: effects.cps ?? 1, milkEffect: effects.milk ?? 1,
    heralds: number(game, "heralds"), santaLevel: number(game, "santaLevel"), achievements: number(game, "AchievementsOwned"),
    breathOfMilk: game.auraMult("Breath of Milk"), radiantAppetite: game.auraMult("Radiant Appetite"), dragonFortune: game.auraMult("Dragon's Fortune"),
    gods: {asceticism: god("asceticism"), ages: god("ages"), decadence: god("decadence"), industry: god("industry"), labor: god("labor"), mother: god("mother")},
    startDate: number(game, "startDate"), lumps: number(game, "lumps"), goldenCount: number(read(read(game, "shimmerTypes"), "golden"), "n"),
    bakeryName: read(game, "bakeryName"), veilBoost: game.getVeilBoost(),
  };
}

/** Price helpers/hooks require the same external source validation as production helpers. */
export function captureBuildingPriceSnapshot(game: any, building: any, effects = captureProductionEffects(game)): BuildingPriceInput {
  if (!read(game, "ObjectsById").includes(building)) throw Error("Unknown price building");
  const has = (name: string) => {
    if (name !== undefined && typeof name !== "string") throw Error("Invalid upgrade name");
    const value = game.Has(name);
    if (![0, 1, false, true].includes(value)) throw Error("Invalid upgrade ownership");
    return !!value;
  };
  const fortune = read(building, "fortune");
  const creation = game.hasGod ? game.hasGod("creation") : 0;
  if (![false, -1, 0, 1, 2, 3].includes(creation)) throw Error("Invalid creation slot");
  return {
    basePrice: number(building, "basePrice"), amount: number(building, "amount"), free: number(building, "free"),
    priceIncrease: number(game, "priceIncrease"),
    discounts: ["Season savings", "Santa's dominion", "Faberge egg", "Divine discount", "Fortune #100"].map(has),
    fierceHoarder: game.auraMult("Fierce Hoarder"), everythingMustGo: !!game.hasBuff("Everything must go"),
    craftyPixies: !!game.hasBuff("Crafty pixies"), nastyGoblins: !!game.hasBuff("Nasty goblins"),
    fortune: !!fortune && has(read(fortune, "name")), buildingCost: effects.buildingCost ?? 1, creation: Number(creation),
  };
}
