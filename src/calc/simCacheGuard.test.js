import { beforeEach, describe, expect, it, vi } from "vitest";
import { CookiePaybackPlanner } from "../core/predictor";

const { game, cache, projection } = vi.hoisted(() => ({ game: {}, cache: vi.fn(), projection: vi.fn() }));
vi.mock("../core/globals", () => ({ Game: game, l: vi.fn(), PlaySound: vi.fn(), Beautify: String }));
vi.mock("./buildingCpsCache", () => ({ withBuildingCpsCache: cache }));
vi.mock("./projectionTrial", () => ({projectBuildingTrial: projection}));

function fixture() {
  const p = new CookiePaybackPlanner();
  p.config.isBanking = false;
  p.simBudgetRemaining = 1;
  p.performanceExperiment.buildingCpsCacheEnabled = true;
  const me = { id: 2, type: "building", name: "Farm", amount: 1, bought: 1, tieredUpgrades: {}, getPrice: () => 20 };
  game.CalculateGains = vi.fn(() => { game.unbuffedCps = me.amount * 10; });
  return { p, me };
}

beforeEach(() => {
  Object.assign(game, { buffs: {}, fps: 30, buyBulk: 1, cookies: 1, cookiesPsRaw: 10, cookiesPs: 10,
    unbuffedCps: 10, globalCpsMult: 1, Tiers: {}, Logic() {}, Win() {}, CpsAchievements: [], cookiesPsRawHighest: 10 });
  cache.mockReset().mockImplementation((_game, run) => run((_item, body) => body()));
  projection.mockReset();
});

describe("simulation cache native-method boundary", () => {
  it.each([10, 100])('simulates the next multiple for bulk %s and restores ownership', bulk => {
    const {p, me} = fixture(); me.amount = me.bought = 123;
    game.buyBulk = bulk; game.unbuffedCps = 1230; game.cookies = 1e9;
    p.performanceExperiment.buildingCpsCacheEnabled = false;
    p.performanceExperiment.productionProjectionEnabled = true;
    const amounts = [];
    game.CalculateGains.mockImplementation(() => {amounts.push(me.amount); game.unbuffedCps = me.amount * 10;});
    p.updateBestCpsAcceleration(me);
    expect(amounts).toContain(bulk === 10 ? 130 : 200);
    expect(amounts[bulk - 123 % bulk - 1]).toBe(bulk === 10 ? 130 : 200);
    expect(projection).toHaveBeenCalledWith(game, me, bulk, 0, expect.any(Function), expect.any(Function));
    expect(me.amount).toBe(123); expect(me.bought).toBe(123);
    expect(me.BestBuyToAmount % bulk).toBe(0);
  });
  it('recomputes cached waiting scores when measured click income changes',()=>{
    const {p,me}=fixture();p.performanceExperiment.buildingCpsCacheEnabled=false;
    p.updateBestCpsAcceleration(me);
    game.CalculateGains.mockClear();
    p.simBudgetRemaining=1;p.smoothedClickCps=100;
    p.updateBestCpsAcceleration(me);
    expect(game.CalculateGains).toHaveBeenCalled();
  });
  it.each(['unbuffedCps', 'cookiesPsRaw'])('invalidates a cached candidate when base %s changes', field=>{
    const {p,me}=fixture();p.config.isBanking=false;p.performanceExperiment.buildingCpsCacheEnabled=false;
    p.updateBestCpsAcceleration(me);
    game.CalculateGains.mockClear();p.simBudgetRemaining=1;game[field]+=.25;
    p.updateBestCpsAcceleration(me);
    expect(game.CalculateGains).toHaveBeenCalled();
  });
  it('adapts to actual simulation cost while diagnostic profiling is disabled',()=>{
    const {p,me}=fixture();p.config.enablePerfProfiler=false;
    p.performanceExperiment.buildingCpsCacheEnabled=false;
    const clock=vi.spyOn(performance,'now').mockReturnValueOnce(0).mockReturnValue(20);
    try {
      p.updateBestCpsAcceleration(me);
      expect(p.simulationCostMs).toBe(20);
      expect(p.tuneAdaptiveBudget()).toBeLessThan(12);
      expect(p.profilerDurationsMs).toEqual([]);
    } finally {clock.mockRestore();}
  });
  it('does not dilute simulation cost with skipped zero-cookie calculations',()=>{
    const {p,me}=fixture();p.simulationCostMs=20;game.cookies=0;
    p.updateBestCpsAcceleration(me);
    expect(p.simulationCostMs).toBe(20);
  });
  it('uses a validated projection without entering the sandbox, retaining one base gains refresh',()=>{
    const {p,me}=fixture();p.performanceExperiment.buildingCpsCacheEnabled=false;p.performanceExperiment.productionProjectionEnabled=true;
    projection.mockReturnValue({bestCpsAcceleration:3,bestBuyToAmount:101,bestWaitTime:20});
    p.updateBestCpsAcceleration(me);
    expect(game.CalculateGains).toHaveBeenCalledTimes(1);expect(me.amount).toBe(1);expect(me.bought).toBe(1);
    expect(me.BestBuyToAmount).toBe(101);expect(me.BestWaitTime).toBe(20);expect(p.performanceExperiment.projectionSupportedCandidates).toBe(1);
  });
  it('retains native computation if projection is unsupported',()=>{
    const {p,me}=fixture();p.performanceExperiment.buildingCpsCacheEnabled=false;p.performanceExperiment.productionProjectionEnabled=true;
    projection.mockReturnValue(undefined);p.updateBestCpsAcceleration(me);
    expect(game.CalculateGains.mock.calls.length).toBeGreaterThan(1);expect(me.amount).toBe(1);expect(p.performanceExperiment.projectionSupportedCandidates).toBe(0);
  });
  it.each(['baseline','indexed','compiled'])('uses native buff normalization with projected bank in %s waits',variant=>{
    const clock=vi.spyOn(Date,'now').mockReturnValue(100000);
    try {
      const {p,me}=fixture();
      p.performanceExperiment.buildingCpsCacheEnabled=false;
      p.performanceExperiment.productionProjectionEnabled=true;
      p.performanceExperiment.setVariant(variant);
      p.config.isBanking=true;p.config.bankingSeconds=2;p.smoothedClickCps=154;
      game.buffs={frenzy:{time:300,multCpS:7},click:{time:90,multClick:11}};
      let wait;
      projection.mockImplementation((_game,_item,_bulk,_bank,estimate)=>{
        wait=estimate;return {bestCpsAcceleration:3,bestBuyToAmount:2,bestWaitTime:20};
      });
      p.updateBestCpsAcceleration(me);
      // The candidate's raw production sets its bank; the live base must not supply it.
      game.cookiesPsRaw=30;
      for(const elapsed of [0,3,10,12])for(const price of [0,100,1000,10000]){
        const expected=p.estimateWaitSeconds(price,100,70,elapsed);
        game.cookiesPsRaw=10;
        expect(wait(price,100,70,elapsed,60)).toBe(expected);
        game.cookiesPsRaw=30;
      }
      expect(wait(100,0,70,0,0)).toBe(100/224);
    } finally {clock.mockRestore();}
  });
  it('does not publish projected values if the required base refresh fails',()=>{
    const {p,me}=fixture();p.performanceExperiment.buildingCpsCacheEnabled=false;p.performanceExperiment.productionProjectionEnabled=true;
    projection.mockReturnValue({bestCpsAcceleration:3,bestBuyToAmount:101,bestWaitTime:20});
    game.CalculateGains.mockImplementation(()=>{throw Error('base refresh failed');});
    expect(()=>p.updateBestCpsAcceleration(me)).toThrow('base refresh failed');
    expect(me.BestBuyToAmount).toBe(0);expect(me.amount).toBe(1);expect(p.simCache.size).toBe(0);
  });
  it.each(['initSimData','isIgnored'])('does not bypass replaced %s with projection',method=>{
    const {p,me}=fixture();p.performanceExperiment.productionProjectionEnabled=true;
    const original=p[method];p[method]=vi.fn(function(...args){return original.apply(this,args);});
    p.updateBestCpsAcceleration(me);expect(projection).not.toHaveBeenCalled();expect(p[method]).toHaveBeenCalled();
  });
  it("runs the real simulation through the cache with native methods", () => {
    const { p, me } = fixture();
    p.updateBestCpsAcceleration(me);
    expect(cache).toHaveBeenCalledTimes(1);
    expect(me.BestBuyToAmount).toBeGreaterThan(1);
    expect(me.BestWaitTime).toBeGreaterThan(0);
    expect(me.amount).toBe(1);
    expect(game.unbuffedCps).toBe(10);
  });

  it.each(["enterSandBox", "leaveSandBox", "getCurrentBuyCount", "calcCookieTimesCost", "getBankCookies", "estimateWaitSeconds"])("falls back while still invoking replaced %s", method => {
    const { p, me } = fixture(), original = p[method];
    p[method] = vi.fn(function (...args) { return original.apply(this, args); });
    p.updateBestCpsAcceleration(me);
    expect(cache).not.toHaveBeenCalled();
    expect(p[method]).toHaveBeenCalled();
    expect(me.BestBuyToAmount).toBeGreaterThan(1);
    expect(me.amount).toBe(1);
    expect(game.unbuffedCps).toBe(10);
  });

  it("preserves the changed wait result from a third-party method", () => {
    const { p, me } = fixture();
    p.estimateWaitSeconds = vi.fn(() => 10000).mockReturnValueOnce(100);
    p.updateBestCpsAcceleration(me);
    expect(cache).not.toHaveBeenCalled();
    expect(p.estimateWaitSeconds).toHaveBeenCalledWith(20, 1, 10, 0);
    expect(me.BestBuyToAmount).toBe(2);
    expect(me.BestWaitTime).toBe(100.05);
    expect(me.BestCpsAcceleration).toBe(10 / 100.05);
    expect(me.amount).toBe(1);
    expect(game.unbuffedCps).toBe(10);
  });
});
