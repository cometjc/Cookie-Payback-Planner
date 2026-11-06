import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { CookiePaybackPlanner } from "../core/predictor";
const game = vi.hoisted(() => ({
  buffs: {},
  fps: 30,
  cookiesPsRaw: 20,
  cookiesPs: 20,
  cookies: 100,
  unbuffedCps: 20,
  globalCpsMult: 1,
  Logic: () => {
  },
  Win: () => {
  },
  CpsAchievements: [],
  cookiesPsRawHighest: 20,
  CalculateGains: vi.fn(),
  Tiers: {}
}));
vi.mock("../core/globals", () => ({ Game: game, l: vi.fn(), PlaySound: vi.fn(), Beautify: String }));
const variants = ["baseline", "indexed", "compiled"];
function planners() {
  return variants.map((variant) => {
    const p = new CookiePaybackPlanner();
    p.config.isBanking = false;
    p.performanceExperiment.setVariant(variant);
    p.smoothedClickCps = 7;
    return p;
  });
}
function equalWait(actual, expected) {
  if (!Number.isFinite(expected)) expect(actual).toBe(expected);
  else expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1e-10 * Math.max(1, Math.abs(expected)));
}
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(1e5);
  game.buffs = {};
  game.fps = 30;
  game.cookiesPsRaw = 20;
  game.cookies = 100;
  game.CalculateGains = vi.fn();
  game.Tiers = {};
});
afterEach(() => vi.restoreAllMocks());
describe("refresh-scoped performance models", () => {
  it('defaults to guarded projection while keeping approximation disabled',()=>{
    const p=new CookiePaybackPlanner();
    expect(p.performanceExperiment.productionProjectionEnabled).toBe(true);
    expect(p.performanceExperiment.metadata.productionDefault).toBe('guarded-projection');
    expect(p.config.experimentalBatch).toBe(false);
  });
  it("re-evaluates the reserve after each native production change during affordable purchases", () => {
    const p = new CookiePaybackPlanner();
    p.config.isBanking = true; p.config.bankingSeconds = 10;
    game.cookiesPsRaw = 1;
    const sim = {currentCookies: 100, paidCookies: 0, waitTime: 0};
    p.calcCookieTimesCost(20, 1, sim);
    expect(sim.currentCookies).toBe(80);
    game.cookiesPsRaw = 10;
    p.calcCookieTimesCost(20, 10, sim);
    expect(sim.waitTime).toBe(4);
    expect(sim.currentCookies).toBe(100);
    expect(sim.paidCookies).toBe(20);
  });
  it("integrates one timed window before, at and after expiry", () => {
    game.buffs = { a: { time: 300, multCpS: 2 } };
    const p = new CookiePaybackPlanner(); p.config.isBanking = false;
    for (const [price, expected] of [[100, 5], [200, 10], [300, 20]]) {
      expect(p.estimateWaitSeconds(price, 0, 20)).toBe(expected);
    }
    expect(p.estimateWaitSeconds(100, 0, 0)).toBe(Infinity);
  });
  it("handles constant income without timed buffs, including zero and non-finite rates", () => {
    const p = new CookiePaybackPlanner(); p.config.isBanking = false;
    for (const [passive, click, expected] of [[20, 5, 4], [0, 0, Infinity], [-2, 10, 10], [Infinity, 0, 0], [NaN, 0, NaN]]) {
      p.smoothedClickCps = click;
      const actual = p.estimateWaitSeconds(100, 0, passive);
      if (Number.isNaN(expected)) expect(actual).toBeNaN();
      else expect(actual).toBe(expected);
    }
    expect(p.estimateWaitSeconds(Infinity, 0, 20)).toBe(0);
  });
  it("does not replace unchanged cached building labels", () => {
    const p = new CookiePaybackPlanner();
    let label = "same label";
    const span = { get textContent() { return label; }, set textContent(value) { label = value; }, style: { removeProperty: vi.fn() } };
    const write = vi.spyOn(span, "textContent", "set");
    vi.stubGlobal("document", { getElementById: id => { expect(id).toBe("productAcc0"); return span; } });
    game.ObjectsById = [{ id: 0, type: "building", l: { classList: { contains: () => false }, style: { removeProperty: vi.fn() } } }];
    game.UpgradesInStore = [];
    p.notationCache.set("building:0", { text: "same label", opacity: "", colorValue: "" });
    try {
      p.reapplyLastKnownNotationFromCache();
      expect(write).not.toHaveBeenCalled();
      p.notationCache.get("building:0").text = "changed label";
      p.reapplyLastKnownNotationFromCache();
      expect(span.textContent).toBe("changed label");
      expect(write).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });
  it("keeps notation unchanged after rebuilding the same chroma scale", () => {
    const p = new CookiePaybackPlanner();
    p.calcWaitingTime = () => "";
    let label = "";
    const span = { get textContent() { return label; }, set textContent(value) { label = value; }, style: {} };
    const write = vi.spyOn(span, "textContent", "set");
    const me = { id: 2, type: "building", amount: 1, getPrice: () => 0,
      l: { dataset: {}, addEventListener() {}, style: { removeProperty() {} } } };
    const metric = {score: 1, rankPercentile: 100, rankOrder: 1, normalizedPercent: 100};
    vi.stubGlobal("document", {getElementById: () => span});
    try {
      for (let i = 0; i < 2; i++) {
        p.updateColorRender([me], new Map([["building:2", 1]]));
        p.updateNotation(me, metric);
      }
      expect(typeof p.colorRender(1)).toBe("string");
      expect(write).toHaveBeenCalledTimes(1);
    } finally {vi.unstubAllGlobals();}
  });
  it("preserves simulation key summaries and reads changing sandbox CPS and bank inputs", () => {
    game.buffs = { a: { name: "frenzy", time: 300, multCpS: 2 } };
    const results = planners().map(p => p.performanceExperiment.withRefresh(() => {
      game.unbuffedCps = 20; game.cookiesPsRaw = 20; game.globalCpsMult = 1;
      const me = { id: 4, type: "upgrade", name: "ignored", amount: 1, bought: 0, getPrice: () => 3 };
      p.isIgnored = () => true; p.getCurrentBuyCount = () => 1;
      const keys = [];
      for (let i = 0; i < 3; i++) {
        game.unbuffedCps += 5; game.cookiesPsRaw += 10; game.globalCpsMult += 1;
        p.simBudgetRemaining = 1;
        p.updateBestCpsAcceleration(me);
        keys.push(p.simCache.get("upgrade:4").key);
      }
      return keys;
    }));
    expect(results[1]).toEqual(results[0]); expect(results[2]).toEqual(results[0]);
    expect(new Set(results[0]).size).toBe(3);
  });
  it("restores a temporarily unlocked tier when its gains hook fails", () => {
    const p = new CookiePaybackPlanner(); p.config.isBanking = false; p.simBudgetRemaining = 1;
    p.getCurrentBuyCount = () => 1;
    const me = { id: 3, type: "building", name: "test", amount: 1, bought: 1, getPrice: () => 2, tieredUpgrades: {} };
    const tier = { id: 1, tier: "one", bought: 0, buildingTie: me, getPrice: () => 2 };
    me.tieredUpgrades = { one: tier }; game.Tiers = { one: { unlock: 2 } };
    game.CalculateGains.mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new Error("tier failure"); });
    expect(() => p.updateBestCpsAcceleration(me)).toThrow("tier failure");
    expect(tier.bought).toBe(0); expect(me.amount).toBe(1); expect(me.bought).toBe(1);
  });
  it("matches the original evaluator across overlaps, duplicate ends, offsets and rates", () => {
    const cases = [
      {},
      { a: { time: 300, multCpS: 7 } },
      { a: { time: 300, multCpS: 7 }, b: { time: 300, multClick: 5 }, c: { time: 150, multCps: 0.5, multMouse: 2 } },
      { a: { time: Infinity, multCpS: 7 }, b: { time: 0, multCpS: 3 }, c: { time: 30, multCpS: -1, multClicks: 0 } }
    ];
    for (const buffs of cases) {
      game.buffs = buffs;
      const ps = planners();
      for (const offset of [0, 0.1, 5, 9.999, 10, 11, Infinity]) for (const price of [0, 1, 100, 1e9, Infinity]) {
        for (const cps of [0, 3, 100, Infinity]) {
          const results = ps.map((p) => p.performanceExperiment.withRefresh(() => p.estimateWaitSeconds(price, 0, cps, offset)));
          equalWait(results[1], results[0]);
          equalWait(results[2], results[0]);
        }
      }
    }
  });
  it("reuses indices and compiled segments while reading advancing time and offsets", () => {
    game.buffs = { a: { time: 300, multCpS: 2 }, b: { time: 150, multClick: 4 } };
    const ps = planners();
    const operations = ps.map((p) => p.performanceExperiment.withRefresh(() => {
      const values = [];
      for (const [now, offset] of [[1e5, 0], [100001, 0], [101e3, 2], [105e3, 0], [11e4, 0]]) {
        vi.mocked(Date.now).mockReturnValue(now);
        values.push(p.estimateWaitSeconds(1e3, 0, 20, offset));
      }
      return values;
    }));
    operations[0].forEach((value, i) => {
      equalWait(operations[1][i], value);
      equalWait(operations[2][i], value);
    });
    expect(ps[1].performanceExperiment.metadata.indexHits).toBeGreaterThan(0);
    expect(ps[2].performanceExperiment.metadata.compiledHits).toBeGreaterThan(0);
    expect(ps[1].performanceExperiment.metadata.compiledQueries).toBe(0);
  });
  it("invalidates mutated values, replaced references, slots, fps and removed buffs", () => {
    const actions = [
      () => {
        game.buffs = { a: { name: "frenzy", time: 300, multCpS: 2 } };
      },
      () => {
        game.buffs.a.multCpS = 3;
      },
      () => {
        game.buffs.a.time = 900;
      },
      () => {
        game.buffs.a.name = "new";
      },
      () => {
        game.buffs.a = { ...game.buffs.a };
      },
      () => {
        game.buffs.b = game.buffs.a;
        delete game.buffs.a;
      },
      () => {
        game.fps = 60;
      },
      () => {
        game.buffs = {};
      }
    ];
    const results = planners().map((p) => p.performanceExperiment.withRefresh(() => {
      game.fps = 30;
      return actions.map((action) => {
        action();
        return p.estimateWaitSeconds(1e3, 0, 20);
      });
    }));
    results[0].forEach((value, i) => {
      equalWait(results[1][i], value);
      equalWait(results[2][i], value);
    });
  });
  it("cleans scopes after exceptions and restores nested contexts", () => {
    const p = planners()[2];
    expect(() => p.performanceExperiment.withRefresh(() => {
      expect(p.performanceExperiment.optimized).toBe(true);
      expect(() => p.performanceExperiment.withRefresh(() => {
        throw new Error("nested");
      })).toThrow("nested");
      expect(p.performanceExperiment.optimized).toBe(true);
      throw new Error("outer");
    })).toThrow("outer");
    expect(p.performanceExperiment.metadata.scoped).toBe(false);
  });
  it("resets trial state and restores the selected algorithm", () => {
    const p = new CookiePaybackPlanner();
    p.config.strategyAlgorithm = "beam";
    p.strategyState.scoreByItem.set("old", 9);
    p.strategyState.frontier.push({ score: 1, cookies: 0, cps: 1, elapsedSec: 0, visited: [] });
    p.lastComputedAtByItem.set("old", 1);
    p.refreshDurationsMs.push(10);
    p.smoothedClickCps = 100;
    p.performanceExperiment.setVariant("search");
    expect(p.config.strategyAlgorithm).toBe("astar");
    expect(p.strategyState.scoreByItem.size).toBe(0);
    expect(p.strategyState.frontier).toEqual([]);
    expect(p.lastComputedAtByItem.size).toBe(0);
    expect(p.refreshDurationsMs).toEqual([]);
    expect(p.smoothedClickCps).toBe(0);
    p.performanceExperiment.setVariant("compiled");
    expect(p.config.strategyAlgorithm).toBe("beam");
    p.performanceExperiment.restore();
    expect(p.performanceExperiment.variant).toBe("baseline");
    expect(p.config.strategyAlgorithm).toBe("beam");
  });
  it("restores sandbox globals and item counts when gains throws", () => {
    const p = new CookiePaybackPlanner();
    p.config.isBanking = false;
    p.simBudgetRemaining = 1;
    p.getCurrentBuyCount = () => 1;
    const me = { id: 1, type: "upgrade", name: "test", amount: 1, bought: 0, getPrice: () => 2 };
    const logic = game.Logic, win = game.Win;
    game.CalculateGains.mockImplementationOnce(() => {
      throw new Error("hook failure");
    });
    expect(() => p.updateBestCpsAcceleration(me)).toThrow("hook failure");
    expect(me.amount).toBe(1);
    expect(me.bought).toBe(0);
    expect(game.Logic).toBe(logic);
    expect(game.Win).toBe(win);
  });
  it("restores helper sandbox when gains throws", () => {
    const p = new CookiePaybackPlanner();
    p.config.isBanking = false;
    const target = { id: 1, type: "building", name: "target", amount: 1, bought: 1, getPrice: () => 1e3 };
    const helper = { id: 2, type: "building", name: "helper", amount: 1, bought: 1, SingleCps: 1, getPrice: () => 2 };
    const logic = game.Logic;
    game.CalculateGains.mockImplementationOnce(() => {
      throw new Error("helper failure");
    });
    expect(() => p.updateHelperOrder([target, helper])).toThrow("helper failure");
    expect(helper.amount).toBe(1);
    expect(helper.bought).toBe(1);
    expect(game.Logic).toBe(logic);
  });
});

describe("refresh building model sharing", () => {
  const node = () => ({ id: 2, baseCps: 10, tierMultipliers: [], synergies: [], fortune: false, grandma: false });
  it("reuses memo, rebases rules and preserves old forks", () => {
    const experiment = new CookiePaybackPlanner().performanceExperiment;
    experiment.withRefresh(() => {
      const model = experiment.acquireBuildingCpsModel([node()], [0, 0, 1]);
      const old = model.fork();
      expect(old.cps(2)).toBe(10);
      expect(experiment.acquireBuildingCpsModel([node()], [0, 0, 1])).toBe(model);
      expect(model.fork().cps(2)).toBe(10);
      expect(model.computations).toBe(1);
      experiment.acquireBuildingCpsModel([{ ...node(), baseCps: 20 }], [0, 0, 2]);
      expect(model.fork().cps(2)).toBe(20);
      expect(old.cps(2)).toBe(10);
    });
  });
  it("isolates nested scopes, restores on throw and never shares outside refresh", () => {
    const experiment = new CookiePaybackPlanner().performanceExperiment;
    const acquire = () => experiment.acquireBuildingCpsModel([node()], [0, 0, 1]);
    experiment.withRefresh(() => {
      const outer = acquire();
      expect(() => experiment.withRefresh(() => { expect(acquire()).not.toBe(outer); throw Error("nested"); })).toThrow("nested");
      expect(acquire()).toBe(outer);
    });
    expect(acquire()).not.toBe(acquire());
    expect(() => experiment.withRefresh(() => { acquire(); throw Error("outer"); })).toThrow("outer");
    expect(acquire()).not.toBe(acquire());
  });
});

it("refresh rebase invalidates tier, synergy and dependent amounts", () => {
  const experiment = new CookiePaybackPlanner().performanceExperiment;
  const node = { id: 2, baseCps: 10, tierMultipliers: [], synergies: [{ tie1: 2, tie2: 1, enabled: false }], fortune: false, grandma: false };
  experiment.withRefresh(() => {
    const model = experiment.acquireBuildingCpsModel([node], [0, 10, 1]);
    expect(model.fork().cps(2)).toBe(10);
    experiment.acquireBuildingCpsModel([{ ...node, tierMultipliers: [2] }], [0, 10, 1]);
    expect(model.fork().cps(2)).toBe(20);
    const enabled = { ...node, synergies: [{ tie1: 2, tie2: 1, enabled: true }] };
    experiment.acquireBuildingCpsModel([enabled], [0, 10, 1]);
    const before = model.fork().cps(2);
    experiment.acquireBuildingCpsModel([enabled], [0, 20, 1]);
    expect(model.fork().cps(2)).toBeGreaterThan(before);
  });
});
