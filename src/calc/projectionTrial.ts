import { knownTierUpgrades } from "./knownTierUpgrades";
import { projectionRuleFailure, plainHookArray } from "./projectionRules";
import { captureProductionEffects, captureProductionSnapshot, captureProductionMultiplierSnapshot, captureBuildingPriceSnapshot } from "./productionSnapshot";
import { createProductionProjection } from "./productionProjection";
import { productionMultipliers } from "./productionMultipliers";
import { buildingPrice } from "./buildingPriceModel";
import { simulateBuildingTrial } from "./buildingTrial";
import { knownUpgradePrice, knownUpgradePriceRelay } from "./knownCpsRules";

const data = (object: any, key: string) => {
  if (typeof key !== "string" && (typeof key !== "number" || !Number.isFinite(key))) throw Error("Unsupported projection key");
  let owner = object;
  while (owner) {
    const d = Object.getOwnPropertyDescriptor(owner, key);
    if (d) { if (!("value" in d)) throw Error("Unsupported tier accessor"); return d.value; }
    owner = Object.getPrototypeOf(owner);
  }
  return undefined;
};
const sourceIs = (fn: any, source: string) => typeof fn === "function"
  && Function.prototype.toString.call(fn).replace(/\r\n/g, "\n").trim() === source.replace(/\r\n/g, "\n").trim();

function tierPrice(game: any, upgrade: any, effects: Record<string, number>) {
  if (!sourceIs(data(upgrade, "getPrice"), knownUpgradePrice) || data(upgrade, "priceFunc")
    || data(upgrade, "pool") === "prestige" || data(upgrade, "pool") === "cookie" || data(upgrade, "kitten")) throw Error("Unsupported tier price");
  const hooks = data(data(game, "customUpgrades"), data(upgrade, "name"));
  const all = data(data(game, "customUpgradesAll"), "getPrice"), prices = data(hooks, "getPrice");
  if (!plainHookArray(all, 0) || !plainHookArray(prices, 1)
    || prices?.length === 1 && !sourceIs(data(prices, "0"), knownUpgradePriceRelay)) throw Error("Unsupported tier price hooks");
  let price = data(upgrade, "basePrice");
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) throw Error("Invalid tier price");
  if (price === 0) return 0;
  if (game.Has("Toy workshop")) price *= .95;
  if (game.Has("Five-finger discount")) price *= Math.pow(.99, data(data(data(game, "Objects"), "Cursor"), "amount") / 100);
  if (game.Has("Santa's dominion")) price *= .98;
  for (const name of ["Faberge egg", "Divine sales", "Fortune #100"]) if (game.Has(name)) price *= .99;
  if (game.hasBuff("Haggler's luck")) price *= .98;
  if (game.hasBuff("Haggler's misery")) price *= 1.02;
  price *= 1 - game.auraMult("Master of the Armory") * .02;
  price *= effects.upgradeCost ?? 1;
  return Math.ceil(price);
}


/** Caller completes the source/hook gate before this private data capture. */
function captureProjectionBase(game: any, reject: (reason: string) => undefined) {
  // ponytail: ages/Century egg retain native calculation; remaining checkpoints have no clock input.
  const buffs = data(game, "buffs");
  for (const key in buffs) if (!Object.prototype.hasOwnProperty.call(buffs, key)) return reject("buff");
  for (const key of Object.getOwnPropertyNames(buffs)) {
    const buff = data(buffs, key);
    let timed = false;
    for (const field of ["multCpS", "multCps", "multClick", "multClicks", "multMouse"]) {
      const value = data(buff, field);
      if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value <= 0)) return reject("buff");
      if (value !== undefined && value !== 1) timed = true;
    }
    if (timed) {
      const time = data(buff, "time"), name = data(buff, "name") || data(buff, "dname") || data(buff, "type") || "buff";
      if (typeof time !== "number" || !Number.isFinite(time) || time < 0 || typeof name !== "string") return reject("buff");
    }
  }
  const effects = captureProductionEffects(game);
  // The native first purchase reads existing effs before CalculateGains refreshes them.
  if ((data(data(game, "effs"), "buildingCost") ?? 1) !== (effects.buildingCost ?? 1)) return reject("base-price-effect");
  const snapshot = captureProductionSnapshot(game, effects);
  const multipliers = captureProductionMultiplierSnapshot(game, effects);
  if (multipliers.gods.ages > 0 || multipliers.owned.includes("Century egg")) return reject("time");
  const model = createProductionProjection(snapshot, true);
  const checkpoints = productionMultipliers(multipliers, 0);
  return {effects, model, checkpoints};
}

/** Experimental adapter. Returns no result for unsupported rules; never mutates Game. */
export function projectBuildingTrial(game: any, item: any, buyCount: number, bankSeconds: number,
  wait: (price: number, cookies: number, cps: number, elapsed: number, bank: number) => number,
  fallback: (reason: string) => void) {
  const reject = (reason: string) => { fallback(reason); return undefined; };
  try {
    const id = Object.getOwnPropertyDescriptor(item, "id");
    let owner = item, type: PropertyDescriptor | undefined;
    while (owner && !type) {
      type = Object.getOwnPropertyDescriptor(owner, "type");
      owner = Object.getPrototypeOf(owner);
    }
    if (!id || !("value" in id) || type && !("value" in type)) return reject("item-descriptor");
    if (type?.value === "upgrade" || !Number.isInteger(id.value) || id.value < 0) return reject("item");
    // Native Game.Object has no type property; upgrades explicitly carry "upgrade".
    if (type && type.value !== "building") return reject("item");
    const failure = projectionRuleFailure(game);
    if (failure) return reject(failure);
    const tiers = data(game, "Tiers"), upgrades = data(item, "tieredUpgrades") || {};
    const locked = Object.keys(upgrades).map(key => data(upgrades, key)).filter(u => {
      const unlock = data(data(tiers, data(u, "tier")), "unlock");
      const tie = data(u, "buildingTie"), bought = data(tie, "bought");
      if (tie !== item || typeof unlock !== "number" || !Number.isFinite(unlock)
        || typeof bought !== "number" || !Number.isFinite(bought)) throw Error("Invalid tier threshold");
      return unlock !== -1 && bought < unlock;
    });
    const unlock = locked.length ? data(data(tiers, data(locked[0], "tier")), "unlock") : -1;
    const tier = locked.length && unlock <= data(item, "bought") + 15 ? locked[0] : undefined;
    const captured = captureProjectionBase(game, reject);
    if (!captured) return undefined;
    const {effects, model, checkpoints} = captured;
    const price = captureBuildingPriceSnapshot(game, item, effects);
    const base = model.fork([], checkpoints);
    if (base.cookiesPsRaw !== data(game, "cookiesPsRaw") || base.unbuffedCps !== data(game, "unbuffedCps")) return reject("base-production");
    let tierModel: ReturnType<typeof createProductionProjection> | undefined, tierCost = 0;
    if (tier) {
      // ponytail: ordinary non-special tier only; cookie, fortune and custom tiers retain native simulation.
      if (knownTierUpgrades[data(item, "name")]?.[data(tier, "tier")] !== data(tier, "name")
        || data(data(game, "Upgrades"), data(tier, "name")) !== tier
        || data(tier, "buildingTie") !== item || data(data(game.Tiers, data(tier, "tier")), "special")
        || !Number.isInteger(data(tier, "tier")) || ![0, 1, false, true].includes(data(tier, "bought"))) return reject("tier");
      tierCost = tierPrice(game, tier, effects);
      tierModel = createProductionProjection(captureProductionSnapshot(game, effects, [data(tier, "name")]), true);
    }
    return simulateBuildingTrial({amount: item.amount, buyCount, cookies: game.cookies, oldCps: game.unbuffedCps,
      rawCps: game.cookiesPsRaw, bankSeconds, wait, monotoneProduction: true,
      tier: tier ? {unlock, price: () => tierCost} : undefined,
      price: amount => buildingPrice({...price, amount}),
      production: (amount, tierOwned) => (tierOwned ? tierModel! : model).fork([[item.id, amount]], checkpoints)});
  } catch { return reject("snapshot-or-projection"); }
}

/** Caller supplies its private native price ledger; fixed ownership and nonnegative rules bound every intermediate reserve. */
export function projectLateBatchBank(game: any, item: any, units: number, seconds: number, prices: number[]): number | undefined {
  try {
    if ("toJSON" in Object.prototype || "toJSON" in Array.prototype) return undefined;
    if (!Number.isSafeInteger(units) || units < 32 || units > 100 || !Number.isFinite(seconds) || seconds < 0 || prices.length !== units) return undefined;
    const id = data(item, "id"), amount = data(item, "amount"), bought = data(item, "bought");
    if (!Number.isSafeInteger(id) || id < 0 || !Number.isSafeInteger(amount) || amount < 0 || !Number.isSafeInteger(bought) || bought < 0
      || !Number.isSafeInteger(amount + units) || !Number.isSafeInteger(bought + units)) return undefined;
    if (projectionRuleFailure(game)) return undefined;
    const captured = captureProjectionBase(game, () => undefined);
    if (!captured || data(data(game, "ObjectsById"), String(id)) !== item) return undefined;
    const base = captured.model.fork([], captured.checkpoints);
    if (base.cookiesPsRaw !== data(game, "cookiesPsRaw") || base.unbuffedCps !== data(game, "unbuffedCps")) return undefined;
    const price = captureBuildingPriceSnapshot(game, item, captured.effects);
    for (let unit = 0; unit < units; unit++) if (buildingPrice({...price, amount: amount + unit}) !== prices[unit]) return undefined;
    const end = captured.model.fork([[id, amount + units]], captured.checkpoints), bank = seconds * end.cookiesPsRaw;
    // ponytail: fixed-tier pure formulas only; unknown rules retain each native gains refresh.
    return Number.isFinite(bank) && bank >= 0 && end.cookiesPsRaw >= data(game, "cookiesPsRaw") ? bank : undefined;
  } catch { return undefined; }
}
