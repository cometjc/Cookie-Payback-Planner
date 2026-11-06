import type { CookiePaybackPlanner } from "../core/predictor";
import type { Game, Building, Upgrade, SimulateStatus } from "../types/game";
/** Experimental only: endpoint sampling cannot certify unknown hooks or interior conditions. */
export function installBatchCandidate(game: Game, planner: CookiePaybackPlanner, affordableOnly = false) {
  const original = planner.updateBestCpsAcceleration;
  let enabled = false, supported = 0, fallbacks = 0, skipped = 0;
  const wrapper = function(this: CookiePaybackPlanner, item: Building | Upgrade) {
    const bulk = planner.getCurrentBuyCount();
    if (!enabled || item.type === 'upgrade' || bulk !== 100
      || !Number.isSafeInteger(item.amount) || item.amount < 0) return original.call(this, item);
    const count = bulk - item.amount % bulk;
    if (count <= 5) return original.call(this, item);
    const amount = item.amount, bought = item.bought;
    const base = {cps: game.unbuffedCps, raw: game.cookiesPsRaw};
    const tiers = Object.values(item.tieredUpgrades || {}), ownership = tiers.map(u => u.bought);
    const gains = game.CalculateGains;
    const cost = planner.calcCookieTimesCost;
    let endpoint: typeof base | undefined, used = false, disabled = false, canSkip = false, dirty = false;
    const affordable = (price: number, sim: SimulateStatus) => {
      const required = price + planner.getBankCookies();
      return sim.currentCookies - required > 1e-10 * Math.max(1, Math.abs(sim.currentCookies), Math.abs(required));
    };
    const guardedCost = function(this: CookiePaybackPlanner, price: number, cps: number, sim: SimulateStatus) {
      if (dirty && !affordable(price, sim)) {
        gains.call(game); dirty = false;
        cps = game.unbuffedCps;
        // The next cost may belong to a tier upgrade; preserve the caller's price.
      }
      canSkip = affordable(price, sim);
      return cost.call(this, price, cps, sim);
    };
    if (affordableOnly) planner.calcCookieTimesCost = guardedCost;
    const batchGains = function(this: Game, ...args: any[]) {
      const n = item.amount - amount;
      if (n === count || affordableOnly && !canSkip) {
        dirty = false;
        return gains.apply(this, args);
      }
      // A tier purchase changes the model; its original CalculateGains remains mandatory.
      if (disabled || tiers.some((u, i) => u.bought !== ownership[i]) || !Number.isInteger(n)
        || n < 1 || n > count || item.bought !== bought + n) return gains.apply(this, args);
      if (!endpoint) {
        item.amount = amount + count; item.bought = bought + count;
        try {
          gains.apply(this, args);
          endpoint = {cps: game.unbuffedCps, raw: game.cookiesPsRaw};
          // ponytail: sampled detection only; unseen interior changes still require a native oracle.
          for (const sample of new Set([Math.max(1, Math.floor(count / 2)), 1])) {
            item.amount = amount + sample; item.bought = bought + sample;
            gains.apply(this, args);
            for (const [field, key] of [['cps', 'unbuffedCps'], ['raw', 'cookiesPsRaw']] as const) {
              const predicted = base[field] + (endpoint[field] - base[field]) * sample / count;
              const actual = game[key];
              if (!Number.isFinite(predicted) || !Number.isFinite(actual)
                || Math.abs(actual - predicted) > 1e-10 * Math.max(1, Math.abs(actual), Math.abs(predicted))) disabled = true;
            }
          }
        } finally {item.amount = amount + n; item.bought = bought + n;}
        // Sampling also changes mouse, price effects and other native outputs.
        // Restore the current point before substituting only the two modeled fields.
        gains.apply(this, args);
        if (disabled) {fallbacks++; return gains.apply(this, args);}
      }
      game.unbuffedCps = n === count ? endpoint.cps : base.cps + (endpoint.cps - base.cps) * n / count;
      game.cookiesPsRaw = n === count ? endpoint.raw : base.raw + (endpoint.raw - base.raw) * n / count;
      used = true; dirty = true; skipped++;
    };
    game.CalculateGains = batchGains;
    try {return original.call(this, item);}
    finally {
      if (game.CalculateGains === batchGains) game.CalculateGains = gains;
      if (affordableOnly && planner.calcCookieTimesCost === guardedCost) planner.calcCookieTimesCost = cost;
      if (used) supported++;
    }
  };
  planner.updateBestCpsAcceleration = wrapper;
  return {setEnabled(value: boolean) {enabled = !!value;}, get supported() {return supported;}, get fallbacks() {return fallbacks;}, get skipped() {return skipped;},
    restore() {enabled = false; if (planner.updateBestCpsAcceleration === wrapper) planner.updateBestCpsAcceleration = original;}};
}
