import { afterEach, expect, it } from "vitest";
import { cursorCps, grandmaCps, createCursorCps, createGrandmaCps } from "./specialBuildingCps";
import { knownSpecialBuildingCps, knownCpsFunctions, knownCpsHelpers } from "./knownCpsRules";
const fingers = ["Thousand", "Million", "Billion", "Trillion", "Quadrillion", "Quintillion", "Sextillion", "Septillion", "Octillion", "Nonillion", "Decillion", "Undecillion"].map(n => n + " fingers").concat("Unshackled cursors");
const basic = ["Reinforced index finger", "Carpal tunnel prevention cream", "Ambidextrous"];
const grandmaUpgrades = ["Bingo center/Research facility", "Ritual rolling pins", "Naughty list", "Elderwort biscuits", "Cat ladies", "One mind", "Communal brainsweep", "Elder Pact"];
afterEach(() => { delete globalThis.Game; });
it("matches pinned Cursor/Grandma and tier helpers over 2000 seeded snapshots", () => {
  let seed = 17;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const evaluate = source => (0, eval)(`(${source})`);
  for (let trial = 0; trial < 2000; trial++) {
    const owned = new Set([...fingers, ...basic, ...grandmaUpgrades, "synergy", "kitten0", "kitten1", "grandmaSynergy", "tier", "unshackle", "unshackleTier", "fortune"].filter(() => random() > .5));
    const amounts = Array.from({ length: 4 }, () => trial % 5 ? Math.floor(random() * 1e6) : 0);
    const names = ["Cursor", "Grandma", "Portal", "Farm"];
    const buildings = names.map((name, id) => ({ name, id, amount: amounts[id], baseCps: 1, tieredUpgrades: { a: { name: "tier", tier: 1 } }, unshackleUpgrade: "unshackle", synergies: [], fortune: { name: "fortune" } }));
    buildings[1].synergies = [{ name: "synergy", buildingTie1: buildings[1], buildingTie2: buildings[2] }];
    const eff = random() * 3, aura = random() * 2;
    const game = globalThis.Game = { Objects: Object.fromEntries(buildings.map(b => [b.name, b])), Has: n => Number(owned.has(n)), ascensionMode: trial % 2, Tiers: { 1: { special: false, unshackleUpgrade: "unshackleTier" } }, customGetTieredCpsMult: [], customBuildings: Object.fromEntries(names.map(n => [n, { cpsAdd: [], cpsMult: [] }])), GrandmaSynergies: ["grandmaSynergy"], UpgradesByPool: { kitten: [{ name: "kitten0" }, { name: "kitten1" }] }, eff: () => eff, auraMult: () => aura };
    for (const name of ["ComputeCps", "GetTieredCpsMult", "magicCpS"]) game[name] = evaluate(knownCpsFunctions[name] || knownCpsHelpers[name]);
    const cursor = { amounts, fingers: fingers.map(n => owned.has(n)), basic: basic.map(n => owned.has(n)), tierMultiplier: game.GetTieredCpsMult(buildings[0]), effect: eff };
    const grandma = { amounts, portalIndex: 2, baseCps: 1, upgrades: grandmaUpgrades.map(n => owned.has(n)), synergyOwned: [owned.has("grandmaSynergy")], kittensOwned: [owned.has("kitten0"), owned.has("kitten1")], tierMultiplier: game.GetTieredCpsMult(buildings[1]), effect: eff, elderBattalion: aura };
    expect(Object.is(createCursorCps(cursor)(amounts, cursor.tierMultiplier), cursorCps(cursor))).toBe(true);
    expect(Object.is(createGrandmaCps(grandma)(amounts, grandma.tierMultiplier), grandmaCps(grandma))).toBe(true);
    expect(Object.is(cursorCps(cursor), evaluate(knownSpecialBuildingCps.Cursor).call(buildings[0], buildings[0]))).toBe(true);
    expect(Object.is(grandmaCps(grandma), evaluate(knownSpecialBuildingCps.Grandma).call(buildings[1], buildings[1]))).toBe(true);
  }
});
it("rejects invalid primitive inputs without consulting Game", () => {
  const input = { amounts: [0, 0, 0], fingers: Array(13).fill(false), basic: Array(3).fill(false), tierMultiplier: 1, effect: 1 };
  Object.defineProperty(globalThis, "Game", { configurable: true, get() { throw Error("Game read"); } });
  expect(cursorCps(input)).toBe(.1);
  for (const patch of [{ amounts: [0, NaN] }, { amounts: Object.assign(Array(3), { 0: 0, 2: 1 }) }, { fingers: [] }, { basic: [1, 0, 0] }, { tierMultiplier: Infinity }, { effect: -1 }]) expect(() => cursorCps({ ...input, ...patch })).toThrow();
  const grandma = { amounts: [0, 1, 2], portalIndex: 2, baseCps: 1, upgrades: Array(8).fill(false), synergyOwned: [], kittensOwned: [], tierMultiplier: 1, effect: 1, elderBattalion: 0 };
  expect(grandmaCps(grandma)).toBe(1);
  for (const patch of [{ portalIndex: 1 }, { portalIndex: 3 }, { baseCps: NaN }, { upgrades: [] }, { synergyOwned: [1] }, { elderBattalion: -1 }]) expect(() => grandmaCps({ ...grandma, ...patch })).toThrow();
});

it('compiled rules own their static values and validate each dynamic input', () => {
  const cursor = {fingers: Array(13).fill(false), basic: Array(3).fill(false), effect: 1};
  const grandma = {portalIndex: 2, baseCps: 1, upgrades: Array(8).fill(false), synergyOwned: [true], kittensOwned: [true], effect: 1, elderBattalion: 0};
  grandma.upgrades[4] = true;
  const c = createCursorCps(cursor), g = createGrandmaCps(grandma);
  cursor.effect = 99; cursor.basic[0] = true; cursor.fingers[0] = true;
  grandma.upgrades.fill(true); grandma.synergyOwned[0] = false; grandma.kittensOwned[0] = false; grandma.baseCps = 99; grandma.portalIndex = 9; grandma.effect = 99;
  expect(c([0,1,2], 1)).toBe(.1); expect(g([0,1,2], 1)).toBe(2.58);
  for (const amounts of [[0,NaN,2], Array(3), [0,-1,2]]) {
    expect(() => c(amounts,1)).toThrow(); expect(() => g(amounts,1)).toThrow();
  }
  expect(() => g([0,1],1)).toThrow();
  for (const tier of [Infinity, -1, '1']) {
    expect(() => c([0,1,2],tier)).toThrow(); expect(() => g([0,1,2],tier)).toThrow();
  }
});
