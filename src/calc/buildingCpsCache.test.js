import { afterEach, describe, expect, it } from "vitest";
import { withBuildingCpsCache } from "./buildingCpsCache";
import { knownBuildingCps, knownBuildingRelay, knownCpsFunctions, knownCpsHelpers, knownHasAura, knownSpecialBuildingCps } from "./knownCpsRules";
import { knownBuildingPrice, knownUpgradePrice, knownModifyBuildingPrice } from "./knownCpsRules";
function fixture() {
  const game = { version: 2.053, ascensionMode: 0, ObjectsById: [], Objects: {}, Upgrades: {}, Tiers: {}, cookieUpgrades: [], customBuildingsAll: { cpsMult: [] }, customBuildings: {}, modHooks: { cps: [], cookiesPerClick: [] } };
  globalThis.Game = game;
  for (const [key, value] of Object.entries(knownCpsFunctions)) game[key] = (0, eval)(`(${value})`);
  game.Objects.Grandma = { id: 1, name: "Grandma", amount: 10 };
  game.Objects.Cursor = { id: 0, name: "Cursor", cps: (0, eval)(`(${knownSpecialBuildingCps.Cursor})`) };
  game.Objects.Grandma.cps = (0, eval)(`(${knownSpecialBuildingCps.Grandma})`);
  game.ObjectsById.push(game.Objects.Cursor, game.Objects.Grandma);
  for (const name of ["Cursor", "Grandma"]) game.customBuildings[name] = { cpsAdd: [], cpsMult: [] };
  const me = { id: 2, name: "Farm", type: "building", baseCps: 10, amount: 1, bought: 1, tieredUpgrades: {}, synergies: {}, cps: (0, eval)(`(${knownBuildingCps.Farm})`) };
  game.ObjectsById.push(me); game.Objects.Farm = me;
  game.customBuildings.Farm = { cpsAdd: [], cpsMult: [(0, eval)(`(${knownBuildingRelay})`)] };
  me.getPrice = (0, eval)(`(${knownBuildingPrice})`);
  game.modifyBuildingPrice = (0, eval)(`(${knownModifyBuildingPrice})`);
  return { game, me };
}
afterEach(() => { delete globalThis.Game; });
describe("sandbox building CPS experiment", () => {
  it("pure overlay matches native CPS without changing the sandbox base", () => {
    const { game, me } = fixture(), original = me.cps;
    game.Objects.Cursor.amount = 0;
    me.grandma = { name: "Grandma boost" };
    game.Upgrades["Grandma boost"] = { bought: 1 };
    withBuildingCpsCache(game, sandbox => sandbox(me, () => {
      expect(me.cps).toBe(original);
      expect(me.cps(me)).toBe(original.call(me, me));
      for (let i = 0; i < 4; i++) expect(() => game.CalculateGains()).toThrow();
      expect(me.cps(me)).toBe(original.call(me, me));
      me.amount = 4;
      expect(() => game.CalculateGains()).toThrow();
      expect(me.cps(me)).toBe(original.call(me, me));
    }), true);
    expect(me.cps).toBe(original);
  });
  it("pure overlay falls back permanently after a tier changes", () => {
    const { game, me } = fixture(), original = me.cps;
    game.Objects.Cursor.amount = 0;
    const tier = { bought: 0, tier: 1, name: "test tier", getPrice: (0, eval)(`(${knownUpgradePrice})`) };
    game.Tiers[1] = { special: false }; game.Upgrades[tier.name] = tier; me.tieredUpgrades = { 1: tier };
    withBuildingCpsCache(game, sandbox => sandbox(me, () => {
      expect(me.cps).toBe(original); expect(me.cps(me)).toBe(10);
      for (let i = 0; i < 4; i++) expect(() => game.CalculateGains()).toThrow();
      expect(me.cps).not.toBe(original);
      expect(me.cps(me)).toBe(10);
      tier.bought = 1;
      expect(() => game.CalculateGains()).toThrow();
      expect(me.cps(me)).toBe(20);
      tier.bought = 0;
      expect(me.cps(me)).toBe(10);
    }), true);
  });
  it("short pure trials neither install CPS wrappers nor inspect rule sources", () => {
    const { game, me } = fixture(), original = me.cps, gains = game.CalculateGains;
    Object.defineProperty(game, "version", { get() { throw Error("guard inspected"); } });
    withBuildingCpsCache(game, sandbox => sandbox(me, () => {
      for (let i = 0; i < 3; i++) { expect(me.cps).toBe(original); expect(() => game.CalculateGains()).toThrow(); }
    }), true);
    expect(me.cps).toBe(original); expect(game.CalculateGains).toBe(gains);
  });
  it("delayed installation rejects unknown hooks and nested changes, restores on throws", () => {
    for (const nested of [false, true]) {
      const { game, me } = fixture(), original = me.cps, gains = game.CalculateGains;
      game.Objects.Cursor.amount = 0;
      expect(() => withBuildingCpsCache(game, sandbox => sandbox(me, () => {
        for (let i = 0; i < 3; i++) expect(() => game.CalculateGains()).toThrow();
        if (nested) withBuildingCpsCache(game, inner => inner(me, () => { me.baseCps = 20; }), true);
        else game.customBuildingsAll.cpsMult.push(() => 1);
        expect(() => game.CalculateGains()).toThrow();
        expect(me.cps).toBe(original); expect(me.cps(me)).toBe(nested ? 20 : 10);
        throw Error("stop");
      }), true)).toThrow("stop");
      expect(me.cps).toBe(original); expect(game.CalculateGains).toBe(gains);
    }
    const { game, me } = fixture(), original = me.cps, gains = game.CalculateGains;
    game.Objects.Cursor.amount = 0;
    expect(() => withBuildingCpsCache(game, sandbox => sandbox(me, () => {
      for (let i = 0; i < 4; i++) expect(() => game.CalculateGains()).toThrow();
      expect(me.cps).not.toBe(original); throw Error("activated");
    }), true)).toThrow("activated");
    expect(me.cps).toBe(original); expect(game.CalculateGains).toBe(gains);
  });
  it("preserves values, invalidates baseCps and restores on throws", () => {
    const { game, me } = fixture(), original = me.cps;
    expect(() => withBuildingCpsCache(game, sandbox => sandbox(me, () => {
      expect(me.cps).not.toBe(original); expect(me.cps(me)).toBe(10); expect(me.cps(me)).toBe(10);
      me.baseCps = 20; expect(me.cps(me)).toBe(20); throw Error("stop");
    }))).toThrow("stop");
    expect(me.cps).toBe(original);
  });
  it("rejects unknown sources, hooks, upgrades and opaque callbacks", () => {
    for (const change of [g => { g.Has = () => 0; }, g => { g.customBuildingsAll.cpsMult.push(() => 1); }, g => { g.hasGod = () => 0; }, g => { g.cookieUpgrades.push({ power: () => 1 }); }]) {
      const { game, me } = fixture(); change(game); const original = me.cps;
      withBuildingCpsCache(game, sandbox => sandbox(me, () => expect(me.cps).toBe(original)));
    }
    const { game, me } = fixture(), original = me.cps;
    withBuildingCpsCache(game, sandbox => sandbox({ type: "upgrade" }, () => expect(me.cps).toBe(original)));
  });
  it("nested scopes fallback and third party replacement survives cleanup", () => {
    const { game, me } = fixture(), replacement = () => 7;
    withBuildingCpsCache(game, sandbox => sandbox(me, () => {
      const outer = me.cps;
      withBuildingCpsCache(game, nested => nested(me, () => expect(me.cps).toBe(outer)));
      me.cps = replacement;
    }));
    expect(me.cps).toBe(replacement);
  });
  it("accepts the game's untyped buildings and falls back when a tier changes", () => {
    const { game, me } = fixture(), original = me.cps;
    delete me.type;
    const tier = { bought: 0, tier: 1, name: "test tier", getPrice: (0, eval)(`(${knownUpgradePrice})`) };
    game.Tiers[1] = { special: false };
    game.Upgrades["test tier"] = tier;
    me.tieredUpgrades = { 1: tier };
    withBuildingCpsCache(game, sandbox => sandbox(me, () => {
      expect(me.cps).not.toBe(original);
      expect(me.cps(me)).toBe(10);
      tier.bought = 1;
      // The real CalculateGains is not needed to verify the invalidation boundary.
      expect(() => game.CalculateGains()).toThrow();
      expect(me.cps(me)).toBe(20);
    }));
    expect(me.cps).toBe(original);
  });
  it("rejects side effects from special building hooks and invalidates nested scopes", () => {
    const { game, me } = fixture(), original = me.cps;
    game.customBuildings.Cursor.cpsAdd.push(() => 1);
    withBuildingCpsCache(game, sandbox => sandbox(me, () => expect(me.cps).toBe(original)));
    game.customBuildings.Cursor.cpsAdd.length = 0;
    game.Upgrades.Fortune = { bought: 0 };
    me.fortune = { name: "Fortune" };
    withBuildingCpsCache(game, sandbox => sandbox(me, () => {
      expect(me.cps(me)).toBe(10);
      withBuildingCpsCache(game, nested => nested({ type: "upgrade" }, () => {
        game.Upgrades.Fortune.bought = 1;
        expect(me.cps(me)).toBe(10.700000000000001);
      }));
      expect(me.cps(me)).toBe(10.700000000000001);
    }));
    expect(me.cps).toBe(original);
  });
  it("rejects unknown prices and downstream shared price hooks", () => {
    for (const change of [
      (g, me) => { me.getPrice = () => 1; },
      g => { g.customModifyBuildingPrice = [() => 1]; },
      g => { g.customUpgradesAll = { getPrice: [() => 1] }; },
    ]) {
      const { game, me } = fixture(), original = me.cps;
      change(game, me);
      withBuildingCpsCache(game, sandbox => sandbox(me, () => expect(me.cps).toBe(original)));
    }
  });
});

it.each([false, true])("rejects opaque Pantheon closure effects (pure model: %s)", pure => {
  const { game, me } = fixture(), original = me.cps;
  game.hasAura = (0, eval)(`(${knownHasAura})`);
  game.Upgrades.Fortune = { bought: 0 };
  me.fortune = { name: "Fortune" };
  let reads = 0;
  const M = { gods: { creation: { id: 1 } }, slot: [-1, -1, -1] };
  Object.defineProperty(M.slot, "0", { get() {
    reads++;
    game.Upgrades.Fortune.bought = 1;
    return -1;
  } });
  game.hasGod = new Function("Game", "M", `return (${knownCpsHelpers.hasGod});`)(game, M);
  withBuildingCpsCache(game, sandbox => sandbox(me, () => {
    if (pure) for (let i = 0; i < 4; i++) expect(() => game.CalculateGains()).toThrow();
    expect(me.cps).toBe(original);
    expect(reads).toBe(0);
    expect(me.cps(me)).toBe(10);
    game.hasGod("creation");
    expect(me.cps(me)).toBe(10.700000000000001);
  }), pure);
});

it("invalidates an active cache when a Pantheon helper appears without probing it", () => {
  const { game, me } = fixture();
  game.Upgrades.Fortune = { bought: 0 };
  me.fortune = { name: "Fortune" };
  let reads = 0;
  withBuildingCpsCache(game, sandbox => sandbox(me, () => {
    expect(me.cps(me)).toBe(10);
    Object.defineProperty(game, "hasGod", { get() { reads++; return () => false; } });
    game.Upgrades.Fortune.bought = 1;
    expect(me.cps(me)).toBe(10.700000000000001);
    expect(reads).toBe(0);
  }));
});

it("revalidates each sandbox before acquiring a shared model", async () => {
  const { createBuildingCpsModel } = await import("./buildingCpsModel");
  const { game, me } = fixture();
  game.Objects.Cursor.amount = 0;
  let model, acquisitions = 0;
  const acquire = (nodes, amounts) => {
    acquisitions++;
    if (model) model.rebase(nodes, amounts);
    else model = createBuildingCpsModel(nodes, amounts);
    return model;
  };
  const run = expected => withBuildingCpsCache(game, sandbox => sandbox(me, () => {
    for (let i = 0; i < 4; i++) expect(() => game.CalculateGains()).toThrow();
    expect(me.cps(me)).toBe(expected);
  }), true, acquire);
  run(10);
  const previous = model.fork();
  me.baseCps = 20;
  run(20);
  expect(previous.cps(2)).toBe(10);
  expect(acquisitions).toBe(2);
  me.cps = () => 123;
  run(123);
  expect(acquisitions).toBe(2);
});
