import type { SimulateStatus } from "../types/game";

/** Numeric building trial; caller validates the optional tier's price and production rules. */
export function simulateBuildingTrial(input: {
  amount: number; buyCount: number; cookies: number; oldCps: number; rawCps: number; bankSeconds: number;
  price: (amount: number) => number;
  production: (amount: number, tierOwned?: boolean) => {cookiesPsRaw: number; unbuffedCps: number};
  tier?: {unlock: number; price: (amount: number) => number};
  /** Caller proves pure prices and nondecreasing raw production for fixed tier ownership. */
  monotoneProduction?: true;
  wait: (price: number, cookies: number, cps: number, elapsed: number, bank: number) => number;
}) {
  if (![input.amount, input.cookies, input.oldCps, input.rawCps, input.bankSeconds].every(n => Number.isFinite(n) && n >= 0)
    || !Number.isSafeInteger(input.amount) || ![1,10,100].includes(input.buyCount)
    || input.monotoneProduction !== undefined && input.monotoneProduction !== true
    || input.tier && (!Number.isSafeInteger(input.tier.unlock) || input.tier.unlock < 0)) throw Error("Invalid building trial inputs");
  const sim: SimulateStatus = {originalCookies: input.cookies, currentCookies: input.cookies, paidCookies: 0, waitTime: 0};
  let amount = input.amount, raw = input.rawCps, cps = input.oldCps;
  let tierOwned = false;
  const wait = (price: number, bank: number) => {
    const seconds = input.wait(price, sim.currentCookies, cps, sim.waitTime, bank);
    if (Number.isNaN(seconds) || seconds < 0) throw Error("Invalid projected wait");
    return seconds;
  };
  let bestCpsAcceleration = 0, bestBuyToAmount = 0, bestWaitTime = Infinity;
  const pay = (price: number) => {
    const bank = input.bankSeconds * raw;
    if (Number.isNaN(price) || price < 0 || Number.isNaN(bank) || bank < 0) throw Error("Invalid projected cost");
    if (sim.currentCookies >= price + bank) {
      sim.paidCookies += price; sim.currentCookies -= price;
    } else if (sim.currentCookies < price + bank && sim.currentCookies >= bank) {
      sim.waitTime += wait(price, bank);
      sim.paidCookies += sim.currentCookies - bank; sim.currentCookies = bank;
    } else {
      sim.waitTime += wait(price, bank); sim.currentCookies = bank;
    }
  };
  const refresh = () => {
    const next = input.production(amount, tierOwned);
    raw = next.cookiesPsRaw; cps = next.unbuffedCps;
    if (![raw,cps].every(n => Number.isFinite(n) && n >= 0)) throw Error("Invalid projected production");
  };
  const maxSteps = Math.max(1, Math.ceil(50 / input.buyCount));
  for (let step = 0; step < maxSteps; step++) {
    const units = input.buyCount - amount % input.buyCount;
    let skipped = false;
    if (input.monotoneProduction && units > 1 && Number.isSafeInteger(amount + units)
      && sim.currentCookies > input.bankSeconds * raw) {
      const end = input.production(amount + units, tierOwned);
      let cookies = sim.currentCookies, paid = sim.paidCookies;
      for (let i = 0; i < units; i++) {
        const price = input.price(amount + i);
        if (!Number.isFinite(price) || price < 0) { cookies = -Infinity; break; }
        cookies -= price; paid += price;
      }
      const bank = input.bankSeconds * end.cookiesPsRaw;
      // Strict > avoids equality rounding differences between c-price and price+bank.
      // ponytail: pure monotone model only; unknown native callbacks retain every refresh.
      if ([end.cookiesPsRaw, end.unbuffedCps, bank].every(n => Number.isFinite(n) && n >= 0)
        && end.cookiesPsRaw >= raw && cookies > bank) {
        sim.currentCookies = cookies; sim.paidCookies = paid;
        amount += units; raw = end.cookiesPsRaw; cps = end.unbuffedCps; skipped = true;
      }
    }
    if (!skipped) for (let i = 0; i < units; i++) {
      pay(input.price(amount)); amount++; refresh();
    }
    // Native simulation buys the selected tier only after the complete bulk batch.
    if (input.tier && !tierOwned && amount >= input.tier.unlock) {
      pay(input.tier.price(amount)); tierOwned = true; refresh();
    }
    const waitTime = sim.waitTime + sim.paidCookies / cps;
    const acceleration = (cps - input.oldCps) / waitTime;
    if (acceleration > bestCpsAcceleration) {
      bestCpsAcceleration = acceleration; bestBuyToAmount = amount; bestWaitTime = waitTime;
    } else if (!input.tier || amount > input.tier.unlock) break;
  }
  return {bestCpsAcceleration, bestBuyToAmount, bestWaitTime, sim};
}
