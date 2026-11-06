import { afterEach, expect, it } from "vitest";
import { buildingPrice } from "./buildingPriceModel";
import { knownBuildingPrice, knownModifyBuildingPrice } from "./knownCpsRules";
const upgrades = ["Season savings", "Santa's dominion", "Faberge egg", "Divine discount", "Fortune #100"];
const base = () => ({ basePrice: 15, priceIncrease: 1.15, amount: 0, free: 0, discounts: Array(5).fill(false), fierceHoarder: 0, everythingMustGo: false, craftyPixies: false, nastyGoblins: false, fortune: false, buildingCost: 1, creation: 0 });
function oracle(s) {
  const game = globalThis.Game = { priceIncrease: s.priceIncrease, Has: n => n === "fortune" ? Number(s.fortune) : Number(s.discounts[upgrades.indexOf(n)] || false), auraMult: () => s.fierceHoarder, hasBuff: n => ({ "Everything must go": s.everythingMustGo, "Crafty pixies": s.craftyPixies, "Nasty goblins": s.nastyGoblins }[n]), eff: () => s.buildingCost, hasGod: () => s.creation, customModifyBuildingPrice: [] };
  game.modifyBuildingPrice = (0, eval)(`(${knownModifyBuildingPrice})`);
  return (0, eval)(`(${knownBuildingPrice})`).call({ basePrice: s.basePrice, amount: s.amount, free: s.free, fortune: { name: "fortune" } });
}
afterEach(() => { delete globalThis.Game; });
it("matches pinned prices across discounts, amounts and ceil boundaries", () => {
  let seed = 91;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let i = 0; i < 4000; i++) {
    const s = { ...base(), basePrice: Math.pow(10, random() * 200), amount: Math.floor(random() * 5000), free: Math.floor(random() * 100), discounts: Array.from({ length: 5 }, () => random() > .5), fierceHoarder: random() * 2, everythingMustGo: random() > .5, craftyPixies: random() > .5, nastyGoblins: random() > .5, fortune: random() > .5, buildingCost: random() * 2, creation: i % 5 - 1 };
    expect(Object.is(buildingPrice(s), oracle(s))).toBe(true);
  }
  for (const price of [0, .9999999999999999, 1, 1.0000000000000002, 100 / .99, Number.MAX_VALUE]) for (const amount of [0, 1, 10000]) {
    const s = { ...base(), basePrice: price, amount, discounts: [true, false, false, false, false] };
    expect(Object.is(buildingPrice(s), oracle(s))).toBe(true);
  }
});
it("rejects invalid primitives and never reads Game", () => {
  Object.defineProperty(globalThis, "Game", { configurable: true, get() { throw Error("Game read"); } });
  expect(buildingPrice(base())).toBe(15);
  for (const patch of [{ basePrice: NaN }, { amount: -1 }, { free: Infinity }, { priceIncrease: 0 }, { discounts: Array(5) }, { discounts: [] }, { creation: 4 }, { fortune: 1 }, { fierceHoarder: -1 }, { buildingCost: -1 }]) expect(() => buildingPrice({ ...base(), ...patch })).toThrow();
  expect(buildingPrice({ ...base(), basePrice: Number.MAX_VALUE, amount: 10000 })).toBe(Infinity);
});
