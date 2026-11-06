import { knownBuildingCps, knownBuildingRelay, knownCpsFunctions, knownCpsHelpers, knownCookiePowers, knownSpecialBuildingCps } from "./knownCpsRules";
import { knownBuildingPrice, knownUpgradePrice, knownModifyBuildingPrice, knownUpgradePriceRelay } from "./knownCpsRules";
import { createBuildingCpsModel } from "./buildingCpsModel";

const sources = new WeakMap<Function, string>();
const expectedSources = new Map<string, string>();
const normalize = (value: string) => value.replace(/\r\n/g, "\n").trim();
const sameSource = (fn: unknown, expected: string) => {
  if (typeof fn !== "function") return false;
  let actual = sources.get(fn);
  if (actual === undefined) { actual = normalize(Function.prototype.toString.call(fn)); sources.set(fn, actual); }
  let known = expectedSources.get(expected);
  if (known === undefined) { known = normalize(expected); expectedSources.set(expected, known); }
  return actual === known;
};
const empty = (value: any) => value == null || Array.isArray(value) && Reflect.ownKeys(value).every(key => key === "length");
const data = (object: any, key: string) => Object.getOwnPropertyDescriptor(object, key)?.value;
const activeScopes = new WeakMap<object, () => void>();

function supported(game: any) {
  if (game.version !== 2.053 || !Array.isArray(game.ObjectsById)) return false;
  // Source equality cannot authenticate Pantheon's captured owner or its side effects.
  if ("hasGod" in game) return false;
  if (!Object.entries(knownCpsFunctions).every(([key, expected]) => sameSource(game[key], expected))) return false;
  if (Object.entries(knownCpsHelpers).some(([key, expected]) => game[key] && !sameSource(game[key], expected))) return false;
  if (game.cookieUpgrades?.some((u: any) => typeof u.power === "function" && !knownCookiePowers.some(expected => sameSource(u.power, expected)))) return false;
  // ponytail: synchronous vanilla/CCSE data model only; opaque accessors require a separate model.
  if (game.ObjectsById.some((me: any) => me.minigameLoaded && me.minigame?.effs &&
    Reflect.ownKeys(me.minigame.effs).some(key => typeof data(me.minigame.effs, key as string) !== "number"))) return false;
  if (!["customGetTieredCpsMult", "customAuraMult", "customHasAura", "customGetVeilBoost", "customComputeLumpTimes", "customHeavenlyMultiplier"].every(key => empty(game[key]))) return false;
  if (!["cps", "cookiesPerClick"].every(key => empty(game.modHooks?.[key])) || !empty(game.customBuildingsAll?.cpsMult)) return false;
  return game.ObjectsById.every((me: any) => {
    const hooks = game.customBuildings?.[me.name];
    const mult = hooks?.cpsMult;
    return me === game.Objects?.[me.name] && sameSource(data(me, "cps"), (me.id < 2 ? knownSpecialBuildingCps : knownBuildingCps)[me.name] || "")
      && empty(hooks?.cpsAdd) && (empty(mult) || Array.isArray(mult) && mult.length === 1 && sameSource(mult[0], knownBuildingRelay));
  });
}

/** Experimental, synchronous sandbox cache. Unknown rules run the original implementation. */
export function withBuildingCpsCache<T>(game: any, run: (sandbox: <R>(item: any, body: () => R) => R) => T, pureModel = false, acquireModel: typeof createBuildingCpsModel = createBuildingCpsModel): T {
  const sandbox = <R>(item: any, body: () => R): R => {
    const disableOuter = activeScopes.get(game);
    if (disableOuter) { disableOuter(); return body(); }
    const install = () => {
      if (!game.ObjectsById.includes(item) || !supported(game)) return undefined;
      if (!sameSource(item.getPrice, knownBuildingPrice) || !sameSource(game.modifyBuildingPrice, knownModifyBuildingPrice)
        || !empty(game.customModifyBuildingPrice) || !empty(game.customUpgradesAll?.getPrice)
        || Object.values(item.tieredUpgrades || {}).some((u: any) => {
          const hooks = game.customUpgrades?.[u.name]?.getPrice;
          return !sameSource(u.getPrice, knownUpgradePrice) || u.priceFunc ||
            !(empty(hooks) || Array.isArray(hooks) && hooks.length === 1 && sameSource(hooks[0], knownUpgradePriceRelay));
        })) return undefined;
      const originals = new Map<any, any>();
      const wrappers = new Map<any, any>();
      const upgrades = Object.values(item.tieredUpgrades || {}) as any[];
      const upgradeState = upgrades.map(u => u.bought);
      const buildings = [...game.ObjectsById];
      const baseCps = buildings.map(me => me.baseCps), ascensionMode = game.ascensionMode;
      let model: ReturnType<typeof createBuildingCpsModel> | undefined;
      const createModel = () => acquireModel(buildings.filter(me => me.id >= 2).map(me => ({
            id: me.id, baseCps: me.baseCps,
            tierMultipliers: Object.values(me.tieredUpgrades || {}).filter((u: any) => !game.Tiers[u.tier].special && game.Has(u.name)).map((u: any) => {
              let mult = 2;
              if (game.ascensionMode !== 1 && game.Has(me.unshackleUpgrade) && game.Has(game.Tiers[u.tier].unshackleUpgrade)) mult += (20 - me.id) * .1;
              return mult;
            }),
            synergies: Object.values(me.synergies || {}).map((u: any) => ({ tie1: u.buildingTie1.id, tie2: u.buildingTie2.id, enabled: !!game.Has(u.name) })),
            fortune: !!(me.fortune && game.Has(me.fortune.name)), grandma: !!(me.grandma && game.Has(me.grandma.name)),
          })), buildings.map(me => me.amount));
      let branch: ReturnType<ReturnType<typeof createBuildingCpsModel>["fork"]> | undefined, branchAmount = item.amount, gainsCalls = 3;
      const functions = Object.fromEntries(Object.keys(knownCpsFunctions).map(key => [key, game[key]]));
      const functionEntries = Object.entries(functions);
      let disabled = false;
      const originalGains = game.CalculateGains;
      const guardedGains = function(this: any, ...args: any[]) {
        const changed = "hasGod" in game || functionEntries.some(([key, value]) => (key === "CalculateGains" ? game[key] !== guardedGains : game[key] !== value))
          || upgrades.some((u, i) => u.bought !== upgradeState[i])
          || game.ObjectsById.length !== buildings.length || buildings.some((b, i) => game.ObjectsById[i] !== b)
          || !empty(game.customGetTieredCpsMult) || !empty(game.customBuildingsAll?.cpsMult)
          || !empty(game.modHooks?.cps) || !empty(game.modHooks?.cookiesPerClick);
        if (changed) disabled = true;
        // ponytail: avoid building a model for short trials; longer paths amortize it after three native steps.
        if (pureModel && !disabled && ++gainsCalls === 4) {
          try { model = createModel(); branch = model.fork(); branchAmount = item.amount; }
          catch { disabled = true; }
        }
        if (model && (game.ascensionMode !== ascensionMode || buildings.some((b, i) => !Object.is(b.baseCps, baseCps[i])))) disabled = true;
        if (model && !disabled && !Object.is(branchAmount, item.amount)) {
          branch = model.fork([[item.id, item.amount]]); branchAmount = item.amount;
        }

        return originalGains.apply(this, args);
      };
      activeScopes.set(game, () => { disabled = true; });
      game.CalculateGains = guardedGains;
      try {
        for (const me of buildings) {
          if (me.id < 2) continue;
          const original = me.cps;
          originals.set(me, original);
          let previous: unknown[] | undefined, result: number;
          const wrapper = function(this: any, ...args: any[]) {
            if ("hasGod" in game) disabled = true;
            if (disabled || this !== me || args.length !== 1 || args[0] !== me) return original.apply(this, args);
            if (branch) return branch.cps(me.id);
            if (pureModel) return original.apply(this, args);
            const values: unknown[] = [game.ascensionMode, me.baseCps, game.Objects.Grandma.amount];
            for (const syn of Object.values(me.synergies || {}) as any[]) values.push(syn, syn.buildingTie1.amount, syn.buildingTie2.amount);
            if (previous && values.length === previous.length && values.every((value, i) => Object.is(value, previous![i]))) return result;
            result = original.apply(this, args); previous = values;
            return result;
          };
          wrappers.set(me, wrapper); me.cps = wrapper;
        }
        return () => {
        for (const [me, original] of originals) if (me.cps === wrappers.get(me)) me.cps = original;
        if (game.CalculateGains === guardedGains) game.CalculateGains = originalGains;
        activeScopes.delete(game);
        };
      } catch (error) {
        for (const [me, original] of originals) if (me.cps === wrappers.get(me)) me.cps = original;
        if (game.CalculateGains === guardedGains) game.CalculateGains = originalGains;
        activeScopes.delete(game);
        throw error;
      }
    };
    if (!pureModel) {
      const cleanup = install();
      try { return body(); } finally { cleanup?.(); }
    }
    const originalGains = game.CalculateGains;
    let calls = 0, disabled = false, cleanup: (() => void) | undefined;
    const tiers = Object.values(item.tieredUpgrades || {}) as any[];
    const tierState = tiers.map(u => u.bought);
    const delayedGains = function(this: any, ...args: any[]) {
      if (tiers.some((u, i) => u.bought !== tierState[i])) disabled = true;
      if (!disabled && ++calls === 4) {
        game.CalculateGains = originalGains;
        activeScopes.delete(game);
        try { cleanup = install(); }
        finally { if (!cleanup) { disabled = true; activeScopes.set(game, () => { disabled = true; }); } }
        return game.CalculateGains.apply(this, args);
      }
      return originalGains.apply(this, args);
    };
    activeScopes.set(game, () => { disabled = true; });
    game.CalculateGains = delayedGains;
    try { return body(); } finally {
      cleanup?.();
      if (game.CalculateGains === delayedGains) game.CalculateGains = originalGains;
      activeScopes.delete(game);
    }
  };
  return run(sandbox);
}
