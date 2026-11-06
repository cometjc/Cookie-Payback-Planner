import { afterEach, expect, it } from "vitest";
import { createProductionProjection } from "./productionProjection";
import { captureProductionSnapshot } from "./productionSnapshot";
import { knownCpsFunctions, knownCpsHelpers, knownBuildingCps, knownSpecialBuildingCps } from "./knownCpsRules";
afterEach(() => { delete globalThis.Game; });
const evaluate = source => (0, eval)(`(${source})`);
function fixture(trial) {
  const names = ["Cursor", "Grandma", "Portal", "Farm"], owned = new Set(["Thousand fingers", "Million fingers", "One mind", "Elder Pact", "Milkhelp&reg; lactose intolerance relief tablets", ...(trial % 2 ? ['"egg"'] : [])]);
  const b = names.map((name, id) => ({ id, name, amount: trial % 7 ? trial * (id + 1) : 0, level: id, baseCps: id + 1, tieredUpgrades: {}, synergies: [] }));
  b[2].cps = evaluate(knownBuildingCps.Farm); b[3].cps = evaluate(knownBuildingCps.Farm);
  b[0].cps = evaluate(knownSpecialBuildingCps.Cursor); b[1].cps = evaluate(knownSpecialBuildingCps.Grandma);
  const syn = { name: "synergy", buildingTie1: b[1], buildingTie2: b[2] }; owned.add("synergy"); b[1].synergies = [syn]; b[2].synergies = [syn];
  const game = globalThis.Game = { Objects: Object.fromEntries(b.map(x => [x.name, x])), ascensionMode: trial % 2, Tiers: {}, customGetTieredCpsMult: [], customBuildings: Object.fromEntries(names.map(n => [n, { cpsAdd: [], cpsMult: [] }])), GrandmaSynergies: [], UpgradesByPool: { kitten: [] }, Has: n => Number(owned.has(n)), eff: () => 1, auraMult: () => .2, prestige: 0, heavenlyPower: 0, cookieUpgrades: [], AchievementsOwned: 10, cookiesMultByType: {}, cookiesPsByType: {}, CpsAchievements: [], cookiesPsRawHighest: 0, shimmerTypes: { golden: { n: 0 } }, bakeryName: "", wrinklers: [], buffs: {}, runModHookOnValue: (_n, v) => v, mouseCps: () => 0, computeLumpTimes() {}, GetHeavenlyMultiplier: () => 1 };
  for (const name of ["ComputeCps", "GetTieredCpsMult", "magicCpS"]) game[name] = evaluate(knownCpsFunctions[name] || knownCpsHelpers[name]);
  const rules = id => ({ id, tierMultipliers: [], synergies: id === 1 || id === 2 ? [{ tie1: 1, tie2: 2, enabled: true }] : [], fortune: false, grandma: false });
  const snapshot = { amounts: b.map(x => x.amount), levels: b.map(x => x.level), ordinary: b.slice(2).map(x => ({ ...rules(x.id), baseCps: x.baseCps })), specialTiers: [rules(0), rules(1)], cursor: { fingers: [true, true, ...Array(11).fill(false)], basic: [false, false, false], effect: 1 }, grandma: { portalIndex: 2, baseCps: 2, upgrades: [false, false, false, false, false, true, false, true], synergyOwned: [], kittensOwned: [], effect: 1, elderBattalion: .2 }, ascensionMode: game.ascensionMode, egg: owned.has('"egg"'), milkTablets: true };
  const source = knownCpsFunctions.CalculateGains.replace("var rawCookiesPs=Game.cookiesPs*mult;", "var rawCookiesPs=Game.cookiesPs*mult; Game.checkpoints={buildMult,milkProgress:Game.milkProgress,milkMult,catMult,rawMult:mult};").replace("Game.unbuffedCps=Game.cookiesPs*mult;", "Game.unbuffedCps=Game.cookiesPs*mult; Game.checkpoints.unbuffedMult=mult;");
  const gains = () => new Function("Game", "name", `return (${source})();`)(game, "");
  return { game, b, snapshot, gains };
}
it("matches original CalculateGains with isolated amount overlays", () => {
  for (let trial = 0; trial < 100; trial++) {
    const { game, b, snapshot, gains } = fixture(trial), model = createProductionProjection(snapshot);
    const transferred = createProductionProjection(JSON.parse(JSON.stringify(snapshot)), true);
    for (const bulk of [1, 10, 100]) for (const id of [0, 1, 2, 3]) {
      const amount = snapshot.amounts[id] + bulk; b[id].amount = amount; gains();
      const actual = model.fork([[id, amount]], game.checkpoints);
      expect(transferred.fork([[id, amount]], game.checkpoints)).toEqual(actual);
      expect(actual).toEqual({ buildings: b.map(x => ({ id: x.id, storedCps: x.storedCps, storedTotalCps: x.storedTotalCps })), buildingCps: game.buildingCps, cookiesPsRaw: game.cookiesPsRaw, unbuffedCps: game.unbuffedCps });
      b[id].amount = snapshot.amounts[id];
    }
    gains(); expect(model.fork([], game.checkpoints).buildingCps).toBe(game.buildingCps);
  }
});
it("rejects invalid inputs and snapshots are immutable", () => {
  expect(() => createProductionProjection({})).toThrow();
  const { snapshot, gains, game } = fixture(1);
  const clone = globalThis.structuredClone;
  let model;
  try { globalThis.structuredClone = undefined; model = createProductionProjection(snapshot); } finally { globalThis.structuredClone = clone; }
  expect(() => createProductionProjection({ ...snapshot, amounts: [0, NaN, 0, 0] })).toThrow();
  expect(() => createProductionProjection({ ...snapshot, levels: Array(4) })).toThrow();
  gains();
  const checkpoints = game.checkpoints; delete globalThis.Game; Object.defineProperty(globalThis, "Game", { configurable: true, get() { throw Error("Game read"); } });
  const before = model.fork([], checkpoints); snapshot.amounts[0] = 999;
  expect(model.fork([], checkpoints)).toEqual(before);
  for (const patch of [[[99, 1]], [[2, NaN]], [[2, 1], [2, 2]]]) expect(() => model.fork(patch, checkpoints)).toThrow();
  expect(() => model.fork([], { ...checkpoints, rawMult: Infinity })).toThrow();
});

it("captures actual building inputs before isolated amount projections", () => {
  for (let trial = 0; trial < 20; trial++) {
    const {game, b, snapshot, gains} = fixture(trial);
    game.ObjectsById = b;
    for (const building of b) building.fortune = 0;
    const captured = captureProductionSnapshot(game);
    expect(captured).toEqual(snapshot);
    const model = createProductionProjection(captured);
    for (const id of [0,1,2,3]) for (const count of [1,10,100]) {
      b[id].amount += count; gains();
      expect(model.fork([[id,b[id].amount]],game.checkpoints)).toEqual({buildings:b.map(x=>({id:x.id,storedCps:x.storedCps,storedTotalCps:x.storedTotalCps})),buildingCps:game.buildingCps,cookiesPsRaw:game.cookiesPsRaw,unbuffedCps:game.unbuffedCps});
      b[id].amount -= count;
    }
  }
});

it("rejects unsupported input descriptors and building order", () => {
  const {game,b}=fixture(1); game.ObjectsById=b; for (const item of b) item.fortune=0;
  Object.defineProperty(b[2],'amount',{get(){throw Error('getter invoked');},configurable:true});
  expect(()=>captureProductionSnapshot(game)).toThrow('Unsupported production field: amount');
  Object.defineProperty(b[2],'amount',{value:NaN,configurable:true});
  expect(()=>captureProductionSnapshot(game)).toThrow('Invalid production field: amount');
  game.ObjectsById=[b[1],b[0],...b.slice(2)];
  expect(()=>captureProductionSnapshot(game)).toThrow('Unsupported building order');
});
it('rejects coercive unshackle names and tier keys before native ownership lookup',()=>{
  for(const field of ['unshackleUpgrade','tier']){
    const {game,b}=fixture(1);game.ObjectsById=b;game.ascensionMode=0;
    for(const building of b)building.fortune=0;
    const oldHas=game.Has;game.Has=name=>name==='tier'?1:oldHas(name);
    game.Tiers={1:{unshackleUpgrade:'missing'}};
    const upgrade={name:'tier',tier:1};b[2].tieredUpgrades={1:upgrade};
    let calls=0;const key={toString(){calls++;return '1';}};
    if(field==='tier')upgrade.tier=key;else b[2].unshackleUpgrade=key;
    expect(()=>captureProductionSnapshot(game)).toThrow(field==='tier'?'Unsupported production key':'Invalid upgrade name');
    expect(calls).toBe(0);
  }
});

it("captures tier, unshackle, fortune and Grandma dependencies in original order", () => {
  const {game,b,gains}=fixture(1), oldHas=game.Has;
  game.ascensionMode=0;
  game.ObjectsById=b;
  game.Has=name=>['tier','unshackle','unshackleTier','fortune','grandma'].includes(name)?1:oldHas(name);
  game.Tiers={1:{unshackleUpgrade:'unshackleTier'}};
  for (const item of b) {item.fortune=0;item.unshackleUpgrade='unshackle';}
  b[3].tieredUpgrades={1:{name:'tier',tier:1}};
  b[1].tieredUpgrades={1:{name:'tier',tier:1}};
  b[3].fortune={name:'fortune'};b[3].grandma={name:'grandma'};
  const captured=captureProductionSnapshot(game);
  expect(captured.ordinary[1]).toMatchObject({tierMultipliers:[3.7],fortune:true,grandma:true});
  expect(captured.specialTiers[1].tierMultipliers).toEqual([2.5]);
  const model=createProductionProjection(captured);
  for (const count of [1,10,100]) {
    b[1].amount+=count;gains();
    expect(model.fork([[1,b[1].amount]],game.checkpoints).buildings).toEqual(b.map(x=>({id:x.id,storedCps:x.storedCps,storedTotalCps:x.storedTotalCps})));
    b[1].amount-=count;
  }
});
it.each([Object.prototype, Array.prototype])('keeps JSON copy semantics when a capture inherits a serialization hook', prototype => {
  const {snapshot,gains,game}=fixture(1);gains();
  const descriptor=Object.getOwnPropertyDescriptor(prototype,'toJSON');
  let calls=0,model;
  try {
    Object.defineProperty(prototype,'toJSON',{configurable:true,value(){calls++;return this;}});
    model=createProductionProjection(snapshot,true);
  } finally {
    if(descriptor)Object.defineProperty(prototype,'toJSON',descriptor);else delete prototype.toJSON;
  }
  expect(calls).toBeGreaterThan(0);
  const before=model.fork([],game.checkpoints);
  snapshot.amounts[0]++;
  expect(model.fork([],game.checkpoints)).toEqual(before);
});
