// Development smoke check only: no saves, mods, rendering or performance claims.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {observeCreatorLaunch} from './creator-observer.mjs';

const [path, version, pantheonPath, surveyPath] = process.argv.slice(2);
assert(path && Number.isFinite(Number(version)), 'Usage: node scripts/perf/core-smoke.mjs <main.js> <version> [minigamePantheon.js] [survey.json]');
const source = await readFile(path, 'utf8');
class Element {}
class CanvasRenderingContext2D {}
const node = () => Object.assign(new Element(), {
  getContext: () => new CanvasRenderingContext2D(), childNodes: [{}],
  parentNode: {removeChild() {}}, style: {removeProperty() {}, setProperty() {}},
  classList: {add() {}, remove() {}}, appendChild() {}, setAttribute() {}, addEventListener() {},
});
const document = {cookie: '', head: node(), body: node(), documentElement: node(),
  getElementById: node, createElementNS: node, createElement: node, hasFocus: () => true};
const stop = new Error('Scheduling disabled in core smoke check');
let scheduled = 0;
const context = vm.createContext({Element, CanvasRenderingContext2D, document, URL,
  console, loc: text => text, addEventListener() {}, innerWidth: 1280, innerHeight: 720,
  navigator: {userAgent: ''}, VERSION: Number(version), BETA: 0, App: 0,
  location: {href: 'http://localhost/', hostname: 'localhost', protocol: 'http:', host: 'localhost', pathname: '/'},
  setTimeout() {scheduled++; throw stop;}, setInterval() {throw stop;},
});
vm.runInContext('window=globalThis;self=globalThis;', context);
vm.runInContext(source, context, {timeout: 5000});
vm.runInContext('Game.Launch();', context, {timeout: 5000});
context.Game.Loader = {waitForLoad() {}, assetsLoaded: [], assetsLoading: [], Load() {}, blank: {}};
// ponytail: stop before the game loop; use the isolated Electron runner for saves/mods/UI.
assert.throws(() => vm.runInContext('Game.Init();', context, {timeout: 5000}), error => error === stop);
assert.equal(scheduled, 1);
vm.runInContext(`
  Game.CalculateGains();
  if (Game.unbuffedCps !== 0) throw Error('Expected empty production');
  Game.Objects.Cursor.amount = 100;
  Game.CalculateGains();
`, context, {timeout: 5000});
const base = context.Game.unbuffedCps;
assert(base > 0 && Number.isFinite(base));
vm.runInContext(`
  Game.Upgrades['Reinforced index finger'].bought = 1;
  Game.CalculateGains();
`, context, {timeout: 5000});
assert.equal(context.Game.unbuffedCps, base * 2);
let pantheon;
if (pantheonPath) {
  const pantheonSource = await readFile(pantheonPath, 'utf8');
  vm.runInContext(pantheonSource, context, {timeout: 5000});
  const launchSource = context.Game.Objects.Temple.minigame.launch.toString();
  const launchSha256 = createHash('sha256').update(launchSource).digest('hex');
  vm.runInContext("Game.Objects.Temple.minigame.launch();", context, {timeout: 5000});
  const first = context.Game.Objects.Temple.minigame;
  const originalHelper = context.Game.hasGod;
  assert.equal(originalHelper('industry'), false);
  first.slot[0] = first.gods.industry.id;
  assert.equal(originalHelper('industry'), 1);
  vm.runInContext('Game.CalculateGains();', context, {timeout: 5000});
  assert(Math.abs(context.Game.unbuffedCps / (base * 2) - 1.1) < 1e-12);
  // Reload creates its own closure; the retained helper must keep its original M.
  vm.runInContext(pantheonSource, context, {timeout: 5000});
  vm.runInContext("Game.Objects.Temple.minigame.launch();", context, {timeout: 5000});
  const second = context.Game.Objects.Temple.minigame;
  assert.notEqual(second, first);
  assert.equal(context.Game.hasGod('industry'), false);
  assert.equal(originalHelper('industry'), 1);
  first.slot[0] = -1;
  second.slot[1] = second.gods.industry.id;
  assert.equal(originalHelper('industry'), false);
  assert.equal(context.Game.hasGod('industry'), 2);
  vm.runInContext('Game.CalculateGains();', context, {timeout: 5000});
  assert(Math.abs(context.Game.unbuffedCps / (base * 2) - 1.06) < 1e-12);
  // Development provenance prototype: authenticate the entire creator, never a helper alone.
  const bindings = new WeakMap();
  const observedLaunch = (owner, launch) => {
    if (createHash('sha256').update(launch.toString()).digest('hex') !== launchSha256) throw Error('Unknown creator');
    const previous = context.Game.hasGod;
    launch.call(owner);
    assert.notEqual(context.Game.hasGod, previous);
    bindings.set(context.Game.hasGod, owner);
  };
  assert.equal(bindings.get(context.Game.hasGod), undefined, 'Existing helpers cannot acquire retrospective provenance');
  vm.runInContext(pantheonSource, context, {timeout: 5000});
  const third = context.Game.Objects.Temple.minigame;
  observedLaunch(third, third.launch);
  const certified = context.Game.hasGod;
  assert.equal(bindings.get(certified), third);
  third.slot[0] = third.gods.industry.id;
  assert.equal(certified('industry'), 1);
  const impostor = function() { context.Game.hasGod = originalHelper; };
  assert.throws(() => observedLaunch(third, impostor), /Unknown creator/);
  context.Game.hasGod = originalHelper;
  assert.equal(bindings.get(context.Game.hasGod), undefined, 'A later helper replacement loses provenance');
  context.Game.hasGod = certified;
  // Observe the actual two-stage launch -> init -> helper path, without helper probes.
  vm.runInContext(pantheonSource, context, {timeout: 5000});
  const fourth = context.Game.Objects.Temple.minigame;
  const observed = observeCreatorLaunch(context.Game, fourth, launchSource, () => fourth.launch());
  const observedHelper = context.Game.hasGod;
  assert.equal(observed.ownerOf(observedHelper) === fourth, true);
  fourth.slot[0] = fourth.gods.industry.id;
  assert.equal(observedHelper('industry'), 1);
  context.Game.hasGod = originalHelper;
  assert.equal(observed.ownerOf(context.Game.hasGod), undefined);
  context.Game.hasGod = observedHelper;
  assert.equal(Object.getOwnPropertyDescriptor(context.Game, 'hasGod').value === observedHelper, true);
  pantheon = {sha256: createHash('sha256').update(pantheonSource).digest('hex'),
    launchSha256, closureIsolation: true, creatorProvenance: true, creatorCallerObservation: true};
}
let survey;
if (surveyPath) {
  // Black-box effects at one synthetic state; not unlock rules or a dependency proof.
  const originalHas = context.Game.Has;
  const json = vm.runInContext(`(() => {
    const now = Date.now(); Date.now = () => now;
    Game.Win = () => {};
    for (const u of Object.values(Game.Upgrades)) u.bought = 0;
    for (const b of Game.ObjectsById) b.amount = b.bought = 100;
    const gainUpgradeReads = new Map();
    const capture = () => {
      const nativeHas = Game.Has;
      Game.Has = function(name) {
        if (name !== undefined && typeof name !== 'string') throw Error('Unexpected upgrade read key');
        gainUpgradeReads.set(typeof name + ':' + String(name), {type: typeof name, name: name ?? null});
        return nativeHas.call(this, name);
      };
      try { Game.CalculateGains(); } finally { Game.Has = nativeHas; }
      return {raw: Game.cookiesPsRaw, cps: Game.unbuffedCps,
        upgradePrice: Game.Upgrades['Reinforced index finger'].getPrice(),
        buildings: Game.ObjectsById.map(b => ({id:b.id,cps:b.storedCps,price:b.getPrice()}))};
    };
    const baseline = capture(), changes = [];
    for (const u of Object.values(Game.Upgrades)) {
      let trial;
      try { u.bought = 1; trial = capture(); }
      finally { u.bought = 0; }
      const restored = capture();
      if (JSON.stringify(restored) !== JSON.stringify(baseline)) throw Error('State drift: ' + u.name);
      const buildings = trial.buildings.filter((b,i) => JSON.stringify(b) !== JSON.stringify(baseline.buildings[i]));
      changes.push({id:u.id,name:u.name,pool:u.pool,raw:trial.raw,cps:trial.cps,upgradePrice:trial.upgradePrice,buildings});
    }
    const finger = Game.Upgrades['Thousand fingers'], million = Game.Upgrades['Million fingers'];
    const cursorCps = () => { capture(); return Game.Objects.Cursor.storedCps; };
    const withoutPrerequisite = cursorCps();
    million.bought = 1;
    const isolatedMillion = cursorCps();
    million.bought = 0; finger.bought = 1;
    const withPrerequisite = cursorCps();
    million.bought = 1;
    const combined = cursorCps();
    million.bought = finger.bought = 0;
    for (const b of Game.ObjectsById) if (b.id !== 0) b.amount = b.bought = 0;
    const noOtherBuildings = cursorCps();
    finger.bought = 1;
    const inactiveFinger = cursorCps();
    finger.bought = 0;
    for (const b of Game.ObjectsById) b.amount = b.bought = 100;
    if (JSON.stringify(capture()) !== JSON.stringify(baseline)) throw Error('Interaction state drift');
    return JSON.stringify({baseline,changes,gainUpgradeReads:[...gainUpgradeReads.values()],interactions:{withoutPrerequisite,isolatedMillion,
      withPrerequisite,combined,noOtherBuildings,inactiveFinger}});
  })()`, context, {timeout: 30000});
  assert.equal(context.Game.Has, originalHas);
  const result = JSON.parse(json);
  assert.equal(result.changes.length, Object.keys(context.Game.Upgrades).length);
  assert(result.changes.every(u => Number.isFinite(u.raw) && Number.isFinite(u.cps)
    && Number.isFinite(u.upgradePrice) && u.buildings.every(b => Number.isFinite(b.cps) && Number.isFinite(b.price))));
  const interaction = result.interactions;
  assert.equal(interaction.withoutPrerequisite, interaction.isolatedMillion);
  assert(interaction.combined > interaction.withPrerequisite && interaction.withPrerequisite > interaction.withoutPrerequisite);
  assert.equal(interaction.noOtherBuildings, interaction.inactiveFinger);
  survey = {tested: result.changes.length, observedGainUpgradeReadKeys: result.gainUpgradeReads.length, observedEffects: result.changes.filter(u => u.buildings.length
    || u.raw !== result.baseline.raw || u.cps !== result.baseline.cps || u.upgradePrice !== result.baseline.upgradePrice).length};
  await writeFile(surveyPath, JSON.stringify({sourceSha256: createHash('sha256').update(source).digest('hex'),
    pantheon, scope: 'Single synthetic state; no buyFunction or unlock checks; absence of effect proves nothing', ...result}, null, 2));
}
// Native refresh is observable beyond CPS; scalar snapshots cannot replace it.
const refreshBoundary = JSON.parse(vm.runInContext(`(() => {
  Game.CalculateGains();
  const effects = Game.effs, production = Game.cookiesPsByType, multipliers = Game.cookiesMultByType;
  const mouse = Game.mouseCps, lumps = Game.computeLumpTimes;
  let mouseCalls = 0, lumpCalls = 0;
  Game.mouseCps = function(...args) { mouseCalls++; return mouse.apply(this, args); };
  Game.computeLumpTimes = function(...args) { lumpCalls++; return lumps.apply(this, args); };
  try {
    Game.CalculateGains();
    return JSON.stringify({newEffects: Game.effs !== effects,
      sameProduction: Game.cookiesPsByType === production,
      sameMultipliers: Game.cookiesMultByType === multipliers, mouseCalls, lumpCalls});
  } finally { Game.mouseCps = mouse; Game.computeLumpTimes = lumps; }
})()`, context, {timeout: 5000}));
assert.deepEqual(refreshBoundary, {newEffects: true, sameProduction: true, sameMultipliers: true, mouseCalls: 1, lumpCalls: 1});
console.log(JSON.stringify({sha256: createHash('sha256').update(source).digest('hex'),
  version: context.Game.version, buildings: context.Game.ObjectsById.length,
  upgrades: Object.keys(context.Game.Upgrades).length, baseCps: base,
  upgradedCps: base * 2, pantheon, survey, refreshBoundary, scope: 'Partial initialization; native gains and upgrade smoke only'}));
