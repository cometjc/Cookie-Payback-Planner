export type BuildingPriceInput = {
  basePrice: number; priceIncrease: number; amount: number; free: number;
  // Season savings, Santa's dominion, Faberge egg, Divine discount, Fortune #100.
  discounts: boolean[]; fierceHoarder: number; everythingMustGo: boolean; craftyPixies: boolean;
  nastyGoblins: boolean; fortune: boolean; buildingCost: number; creation: number;
};
const numeric = ["basePrice", "priceIncrease", "amount", "free", "fierceHoarder", "buildingCost"] as const;
const flags = ["everythingMustGo", "craftyPixies", "nastyGoblins", "fortune"] as const;
// ponytail: pinned 2.053 price with empty customModifyBuildingPrice; future adapter must guard rules/hooks.
export function buildingPrice(s: BuildingPriceInput) {
  if (!s || numeric.some(k => typeof s[k] !== "number" || !Number.isFinite(s[k]) || s[k] < 0)
    || s.priceIncrease === 0 || flags.some(k => typeof s[k] !== "boolean")
    || ![-1, 0, 1, 2, 3].includes(s.creation) || !Array.isArray(s.discounts) || s.discounts.length !== 5
    || [...s.discounts].some(v => typeof v !== "boolean")) throw Error("Invalid building price inputs");
  let price = s.basePrice * Math.pow(s.priceIncrease, Math.max(0, s.amount - s.free));
  for (const owned of s.discounts) if (owned) price *= .99;
  price *= 1 - s.fierceHoarder * .02;
  if (s.everythingMustGo) price *= .95;
  if (s.craftyPixies) price *= .98;
  if (s.nastyGoblins) price *= 1.02;
  if (s.fortune) price *= .93;
  price *= s.buildingCost;
  if (s.creation === 1) price *= .93; else if (s.creation === 2) price *= .95; else if (s.creation === 3) price *= .98;
  return Math.ceil(price);
}
