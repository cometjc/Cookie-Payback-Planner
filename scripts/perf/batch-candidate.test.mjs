import assert from 'node:assert/strict';
import {installBatchCandidate} from './batch-candidate.mjs';
for (const amount of [123, 150, 198, 199, 200]) {
  const b = {amount, bought: amount};
  const units = 100 - amount % 100;
  let calls = 0, maxAmount = amount;
  const g = {unbuffedCps: 10 + amount, cookiesPsRaw: 10 + amount, CalculateGains() {
    calls++; maxAmount = Math.max(maxAmount, b.amount);
    this.unbuffedCps = this.cookiesPsRaw = 10 + b.amount;
  }};
  const p = {getCurrentBuyCount: () => 100, getBankCookies: () => 0, calcCookieTimesCost() {},
    updateBestCpsAcceleration() {
      const values = [];
      try {for (let n = 0; n < units; n++) {
        this.calcCookieTimesCost(1, g.unbuffedCps, {currentCookies: 100000});
        b.amount++; b.bought++; g.CalculateGains(); values.push(g.unbuffedCps);
      }} finally {b.amount = b.bought = amount; g.CalculateGains();}
      return values;
    }};
  const expected = p.updateBestCpsAcceleration(); calls = 0;
  const candidate = installBatchCandidate(g, p, true); candidate.setEnabled(true);
  assert.deepEqual(p.updateBestCpsAcceleration(b), expected);
  assert.equal(maxAmount, amount + units, 'Samples must stay within the next multiple');
  assert.equal(b.amount, amount); assert.equal(b.bought, amount);
  assert.equal(g.unbuffedCps, 10 + amount);
  if (units > 6) assert(calls < units + 1);
  candidate.restore();
}
const item = {amount: 0, bought: 0, tieredUpgrades: {one: {bought: 0}}};
let calls = 0, fail = false;
const gains = function() {calls++; if (fail) throw Error('native failure'); game.unbuffedCps = game.cookiesPsRaw = 10 + item.amount + 1000 * item.tieredUpgrades.one.bought;};
const game = {unbuffedCps: 10, cookiesPsRaw: 10, CalculateGains: gains};
const planner = {getCurrentBuyCount: () => 100, updateBestCpsAcceleration(b) {
  const saved = {amount: b.amount, bought: b.bought, tier: b.tieredUpgrades.one.bought};
  const observed = [];
  try {
    for (let n = 1; n <= 100; n++) {b.amount++; b.bought++; game.CalculateGains(); observed.push(game.cookiesPsRaw);}
    b.tieredUpgrades.one.bought = 1; game.CalculateGains(); observed.push(game.cookiesPsRaw);
    return observed;
  } finally {b.amount = saved.amount; b.bought = saved.bought; b.tieredUpgrades.one.bought = saved.tier; if (!fail) game.CalculateGains();}
}};
const original = planner.updateBestCpsAcceleration, candidate = installBatchCandidate(game, planner);
const native = planner.updateBestCpsAcceleration(item);
assert.equal(calls, 102); calls = 0; candidate.setEnabled(true);
assert.deepEqual(planner.updateBestCpsAcceleration(item), native);
assert.equal(calls, 7); assert.equal(candidate.supported, 1);
assert.equal(game.CalculateGains, gains); assert.equal(game.cookiesPsRaw, 10);
const nonlinear = function() {game.unbuffedCps = game.cookiesPsRaw = 10 + item.amount
  + (item.amount >= 30 ? 100 : 0) + 1000 * item.tieredUpgrades.one.bought;};
game.CalculateGains = nonlinear; candidate.setEnabled(false);
const nonlinearNative = planner.updateBestCpsAcceleration(item);
candidate.setEnabled(true);
assert.deepEqual(planner.updateBestCpsAcceleration(item), nonlinearNative);
assert.equal(candidate.fallbacks, 1); assert.equal(game.CalculateGains, nonlinear);
const stale = function() {game.unbuffedCps = game.cookiesPsRaw = 20 + item.amount
  + 1000 * item.tieredUpgrades.one.bought;};
game.CalculateGains = stale; game.unbuffedCps = game.cookiesPsRaw = 10;
const staleObserved = planner.updateBestCpsAcceleration(item);
assert.equal(staleObserved[0], 21); assert.equal(staleObserved[99], 120);
assert.equal(candidate.fallbacks, 2); assert.equal(game.CalculateGains, stale);
game.CalculateGains = gains;
fail = true;
assert.throws(() => planner.updateBestCpsAcceleration(item), /native failure/);
assert.equal(item.amount, 0); assert.equal(item.bought, 0); assert.equal(game.CalculateGains, gains);
const replacement = () => {};
planner.updateBestCpsAcceleration = replacement; candidate.restore();
assert.equal(planner.updateBestCpsAcceleration, replacement);
planner.updateBestCpsAcceleration = original;
{
  let nativeCalls = 0;
  const b = {amount:0,bought:0,getPrice:()=>20};
  const g = {unbuffedCps:10,cookiesPsRaw:10,CalculateGains(){nativeCalls++;this.unbuffedCps=this.cookiesPsRaw=10+b.amount;}};
  const p = {getCurrentBuyCount:()=>100,getBankCookies:()=>g.cookiesPsRaw,
    calcCookieTimesCost(price,cps,sim){const required=price+p.getBankCookies();
      if(sim.currentCookies>=required)sim.currentCookies-=price;
      else {sim.wait+=(required-sim.currentCookies)/cps;sim.currentCookies=p.getBankCookies();}},
    updateBestCpsAcceleration(){const sim={currentCookies:200,wait:0};
      try {for(let i=0;i<100;i++){this.calcCookieTimesCost(b.getPrice(),g.unbuffedCps,sim);b.amount++;b.bought++;g.CalculateGains();}return sim;}
      finally {b.amount=b.bought=0;g.CalculateGains();}}};
  const native = p.updateBestCpsAcceleration(), cost = p.calcCookieTimesCost;
  nativeCalls=0;
  const prefix=installBatchCandidate(g,p,true);prefix.setEnabled(true);
  const observed=p.updateBestCpsAcceleration(b);
  assert.deepEqual(observed,native);
  assert.ok(nativeCalls<101 && nativeCalls>90, `Only affordable steps skipped: ${nativeCalls}`);
  assert.equal(p.calcCookieTimesCost,cost);assert.equal(g.cookiesPsRaw,10);
  assert.ok(prefix.skipped>0 && prefix.skipped<10);
  prefix.restore();
}
{
  const b={amount:0,bought:0,getPrice:()=>20};
  const g={unbuffedCps:10,cookiesPsRaw:10,CalculateGains(){this.unbuffedCps=this.cookiesPsRaw=10+b.amount;}};
  const seen=[];
  const p={getCurrentBuyCount:()=>100,getBankCookies:()=>g.cookiesPsRaw,
    calcCookieTimesCost(price,_cps,sim){seen.push(price);sim.currentCookies-=price;},
    updateBestCpsAcceleration(){const sim={currentCookies:100};
      try {this.calcCookieTimesCost(20,10,sim);b.amount++;b.bought++;g.CalculateGains();
        this.calcCookieTimesCost(500,11,sim);}
      finally {b.amount=b.bought=0;g.CalculateGains();}}};
  const candidate=installBatchCandidate(g,p,true);candidate.setEnabled(true);
  p.updateBestCpsAcceleration(b);
  assert.deepEqual(seen,[20,500], 'A following upgrade must retain its own cost');
  candidate.restore();
}
console.log('batch candidate: disabled native path, endpoint, tier, restoration, failure pass');
{
  const b = {amount: 0, bought: 0};
  const g = {unbuffedCps: 10, cookiesPsRaw: 10, marker: 0, CalculateGains() {
    this.unbuffedCps = this.cookiesPsRaw = 10 + b.amount; this.marker = b.amount;
  }};
  const p = {getCurrentBuyCount: () => 100, updateBestCpsAcceleration() {
    try {
      for (let n = 0; n < 100; n++) {b.amount++; b.bought++; g.CalculateGains();}
      return g.marker;
    } finally {b.amount = b.bought = 0; g.CalculateGains();}
  }};
  const candidate = installBatchCandidate(g, p); candidate.setEnabled(true);
  assert.equal(p.updateBestCpsAcceleration(b), 100, 'The endpoint must restore every native output');
  assert.equal(g.marker, 0); candidate.restore();
}
{
  const b={amount:0,bought:0,getPrice:()=>20};
  const g={unbuffedCps:10,cookiesPsRaw:10,marker:0,CalculateGains(){
    this.unbuffedCps=this.cookiesPsRaw=10+b.amount;this.marker=b.amount;
  }};
  const p={getCurrentBuyCount:()=>100,getBankCookies:()=>0,
    calcCookieTimesCost(){},updateBestCpsAcceleration(){const sim={currentCookies:0};
      try {
        for(let n=1;n<=3;n++){
          sim.currentCookies=n===3?100:0;
          this.calcCookieTimesCost(20,g.unbuffedCps,sim);b.amount++;b.bought++;g.CalculateGains();
        }
        return g.marker;
      }finally{b.amount=b.bought=0;g.CalculateGains();}}};
  const candidate=installBatchCandidate(g,p,true);candidate.setEnabled(true);
  assert.equal(p.updateBestCpsAcceleration(b),3,'Mid-trial sampling must restore other native outputs');
  assert.equal(g.marker,0);candidate.restore();
}

// A temporary interior effect evades the 1/50/100 samples: keep this tool isolation-only.
{
  const b = {amount: 0, bought: 0};
  const g = {unbuffedCps: 10, cookiesPsRaw: 10, CalculateGains() {
    this.unbuffedCps = this.cookiesPsRaw = 10 + b.amount + (b.amount === 25 ? 100 : 0);
  }};
  const p = {getCurrentBuyCount: () => 100, updateBestCpsAcceleration() {
    const values = [];
    try {
      for (let n = 0; n < 100; n++) {b.amount++; b.bought++; g.CalculateGains(); values.push(g.unbuffedCps);}
      return values;
    } finally {b.amount = b.bought = 0; g.CalculateGains();}
  }};
  const native = p.updateBestCpsAcceleration(b);
  const candidate = installBatchCandidate(g, p); candidate.setEnabled(true);
  const approximate = p.updateBestCpsAcceleration(b);
  assert.equal(candidate.fallbacks, 0, 'Sparse samples cannot detect an unseen interior effect');
  assert.equal(native[24], 135); assert.equal(approximate[24], 35);
  const score = values => 1 / values.reduce((wait, cps) => wait + 1 / cps, 0);
  const nativeScore = score(native), approximateScore = score(approximate);
  const competitor = (nativeScore + approximateScore) / 2;
  const rank = value => [['first', 1000], ['second', 999], ['trial', value], ['competitor', competitor]]
    .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([token]) => token);
  assert.notDeepEqual(rank(nativeScore), rank(approximateScore),
    'An unseen effect can change the top three through accumulated waiting cost');
  candidate.restore(); assert.equal(g.unbuffedCps, 10);
}
