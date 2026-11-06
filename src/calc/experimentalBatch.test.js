import {afterEach, expect, it, vi} from 'vitest';
import {ExperimentalBatch} from './experimentalBatch';
import {defaultConfig} from '../data/config';

afterEach(() => vi.restoreAllMocks());
function fixture(version = '2.053') {
  const b = {id: 0, type: 'building', amount: 0, bought: 0};
  const g = {version, unbuffedCps: 10, cookiesPsRaw: 10,
    CalculateGains() {this.unbuffedCps = this.cookiesPsRaw = 10 + b.amount + (b.amount === 25 ? 100 : 0);}};
  const p = {config: {...defaultConfig}, simCache: new Map(), lastComputedAtByItem: new Map(),
    strategyState: {scoreByItem: new Map([['stale', 1]]), frontier: [{}]},
    simBudgetRemaining: 0, getCurrentBuyCount: () => 100, markConfigDirty: vi.fn(),
    getBankCookies: () => 0, calcCookieTimesCost() {},
    updateBestCpsAcceleration(item) {
      let total = 0;
      try {for (let n = 0; n < 100; n++) {
        this.calcCookieTimesCost(1, g.unbuffedCps, {currentCookies: 1000});
        item.amount++; item.bought++; g.CalculateGains(); total += 1 / g.unbuffedCps;
      }}
      finally {item.amount = item.bought = 0; g.CalculateGains();}
      item.BestCpsAcceleration = 1 / total; item.BestWaitTime = total; item.BestBuyToAmount = 100;
    }};
  return {b, g, p, api: new ExperimentalBatch()};
}
it('defaults to strict and leaves native methods installed', () => {
  const {b, g, p, api} = fixture(), native = p.updateBestCpsAcceleration;
  api.run(g, p, [b]);
  expect(p.config.experimentalBatch).toBe(false); expect(api.checks).toBe(0);
  expect(p.updateBestCpsAcceleration).toBe(native);
});
it.each([false, true])('refreshes pending native gains before candidates (experimental=%s)', enabled => {
  const {b, g, p, api} = fixture();
  g.recalculateGains = 1;
  g.CalculateGains = function() {this.unbuffedCps = this.cookiesPsRaw = 20; this.recalculateGains = 0;};
  p.config.experimentalBatch = enabled;
  p.updateBestCpsAcceleration = vi.fn(item => {
    expect(g.recalculateGains).toBe(0); expect(g.unbuffedCps).toBe(20);
    item.BestCpsAcceleration = 1; item.BestWaitTime = 1; item.BestBuyToAmount = 100;
  });
  api.run(g, p, [b]);
  expect(p.updateBestCpsAcceleration).toHaveBeenCalledTimes(enabled ? 2 : 1);
});
it('unknown versions stay native', () => {
  const {b, g, p, api} = fixture('future'); p.config.experimentalBatch = true;
  api.run(g, p, [b]); expect(api.checks).toBe(0); expect(api.status).toContain('unsupported');
});
it('detects unseen interior effect, disables approximation, keeps native result', () => {
  const {b, g, p, api} = fixture(); p.updateBestCpsAcceleration(b);
  const expected = b.BestCpsAcceleration, gains = g.CalculateGains, native = p.updateBestCpsAcceleration;
  p.config.experimentalBatch = true; api.run(g, p, [b]);
  expect(api.mismatches).toBe(1); expect(p.config.experimentalBatch).toBe(false);
  expect(api.lastMismatch).toMatchObject({id: 0, field: 'BestCpsAcceleration', native: expected});
  expect(api.lastMismatch.approximate).not.toBe(expected);
  expect(b.BestCpsAcceleration).toBe(expected); expect(p.markConfigDirty).toHaveBeenCalledOnce();
  expect(p.strategyState.scoreByItem.size).toBe(0); expect(p.strategyState.frontier).toEqual([]);
  expect(g.CalculateGains).toBe(gains); expect(p.updateBestCpsAcceleration).toBe(native);
});
it('checks on activation and every ten seconds, toggling back forces native caches', () => {
  const {b, g, p, api} = fixture();
  g.CalculateGains = function() {this.unbuffedCps = this.cookiesPsRaw = 10;};
  let now = 1000; vi.spyOn(Date, 'now').mockImplementation(() => now);
  p.config.experimentalBatch = true; api.run(g, p, [b]); expect(api.checks).toBe(1);
  now += 9999; api.run(g, p, [b]); expect(api.checks).toBe(1);
  now++; api.run(g, p, [b]); expect(api.checks).toBe(2);
  p.simCache.set('stale', {}); p.config.experimentalBatch = false; api.run(g, p, [b]);
  expect(p.simCache.size).toBe(0);
});
it('restores wrappers on native exception', () => {
  const {b, g, p, api} = fixture(); const gains = g.CalculateGains;
  const native = p.updateBestCpsAcceleration = () => {throw Error('native');};
  p.config.experimentalBatch = true;
  expect(() => api.run(g, p, [b])).toThrow('native');
  expect(g.CalculateGains).toBe(gains); expect(p.updateBestCpsAcceleration).toBe(native);
});
it('keeps unaffordable steps native, including an unseen interior effect', () => {
  const {b, g, p, api} = fixture();
  p.getBankCookies = () => 1000;
  p.updateBestCpsAcceleration(b);
  const expected = [b.BestCpsAcceleration, b.BestWaitTime, b.BestBuyToAmount];
  p.config.experimentalBatch = true;
  api.run(g, p, [b]);
  expect(api.checks).toBe(1); expect(api.mismatches).toBe(0);
  expect(p.config.experimentalBatch).toBe(true);
  expect([b.BestCpsAcceleration, b.BestWaitTime, b.BestBuyToAmount]).toEqual(expected);
});
it('audits one building per refresh, keeping unchecked buildings native', () => {
  const {b, g, p, api} = fixture();
  const other = {...b, id:1};
  const calls=[];
  p.updateBestCpsAcceleration = item => {
    calls.push(item.id);
    item.BestCpsAcceleration=1;item.BestWaitTime=1;item.BestBuyToAmount=100;
  };
  p.config.experimentalBatch=true;
  api.run(g,p,[b,other]);
  expect(calls).toEqual([0,0,1]);expect(api.checks).toBe(1);
  calls.length=0;api.run(g,p,[b,other]);
  expect(calls).toEqual([0,1,1]);expect(api.checks).toBe(2);
  calls.length=0;api.run(g,p,[b,other]);
  expect(calls).toEqual([0,1]);expect(api.checks).toBe(2);
});
it('forces native cache misses for expired buildings awaiting their audit', () => {
  const {b,g,p,api}=fixture(),other={...b,id:1};
  let now=1000;vi.spyOn(Date,'now').mockImplementation(()=>now);
  p.updateBestCpsAcceleration=item=>{
    item.BestCpsAcceleration=1;item.BestWaitTime=1;item.BestBuyToAmount=100;
  };
  p.config.experimentalBatch=true;api.run(g,p,[b,other]);api.run(g,p,[b,other]);
  now+=10000;p.simCache.set('building:1',{});
  const native=p.updateBestCpsAcceleration;
  p.updateBestCpsAcceleration=item=>{
    if(item===other)expect(p.simCache.has('building:1')).toBe(false);
    return native(item);
  };
  api.run(g,p,[b,other]);expect(api.checks).toBe(3);
});
it('recomputes every candidate natively after a rotating audit mismatch', () => {
  const {b,g,p,api}=fixture(),other={...b,id:1};
  const original=p.updateBestCpsAcceleration,calls=[];
  p.updateBestCpsAcceleration=function(item){
    calls.push(item.id);
    if(item===b)return original.call(this,item);
    item.BestCpsAcceleration=2;item.BestWaitTime=3;item.BestBuyToAmount=100;
  };
  p.config.experimentalBatch=true;api.run(g,p,[b,other]);
  expect(calls).toEqual([0,0,0,1]);
  expect(other.BestCpsAcceleration).toBe(2);expect(api.mismatches).toBe(1);
  expect(p.config.experimentalBatch).toBe(false);
});
