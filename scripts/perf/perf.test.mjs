import test from 'node:test';
import assert from 'node:assert/strict';
import { matchingMainProcesses, assertProcessState, acquireGameLaunchLock, withGameLaunchGuard } from './process.mjs';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { statistics, schedule, compareIdentity, validateSample, markdown, hash, summarize } from './report.mjs';
import vm from 'node:vm';
import { snapshot, beginObservation, endObservation } from './browser.mjs';
import { attachSummary, assignBaselineIdentities } from './run.mjs';

test('simulation samples retain candidate identity and native exceptions', () => {
  const planner = {modId: 'BestDealHelper', updateBestCpsAcceleration() {throw Error('trial failure');}};
  const original = planner.updateBestCpsAcceleration;
  const context = vm.createContext({Game: {mods: {planner}}, performance: {now: () => 0}, requestAnimationFrame: () => 1, cancelAnimationFrame() {}});
  vm.runInContext(`(${beginObservation})(false)`, context);
  assert.throws(() => planner.updateBestCpsAcceleration({type: 'upgrade', id: 239}), /trial failure/);
  const raw = vm.runInContext(`(${endObservation})()`, context);
  assert.equal(raw.timings.simulation[0].token, 'upgrade:239');
  assert.equal(planner.updateBestCpsAcceleration, original);
});

test('observation rejects a hidden interval even after returning visible and removes the listener',()=>{
  const listeners=new Map(),document={visibilityState:'visible',addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key)};
  const planner={modId:'BestDealHelper',updateUI(){}},context=vm.createContext({document,Game:{mods:{planner}},performance:{now:()=>0},requestAnimationFrame:()=>1,cancelAnimationFrame(){}});
  vm.runInContext(`(${beginObservation})(false)`,context);
  document.visibilityState='hidden';listeners.get('visibilitychange')();document.visibilityState='visible';
  const raw=vm.runInContext(`(${endObservation})()`,context),summary=summarize(raw);
  assert.equal(summary.hidden,true);assert.equal(listeners.size,0);
  assert.ok(validateSample({visibility:'visible'},{visibility:'visible'},summary).reasons.includes('量測期間頁面曾切到背景'));
});

test('randomized runs use the actual baseline, including when it arrives later', () => {
  const before = { state: { cookies: 1 }, config: {}, mods: [], scriptHashes: [] };
  const runs = [{ id: 'indexed', before }];
  assignBaselineIdentities(runs);
  assert.deepEqual(runs[0].identity, { comparable: false, differences: ['baseline missing'] });
  runs.push({ id: 'baseline', before: { ...before, state: { cookies: 2 } } });
  assignBaselineIdentities(runs);
  assert.deepEqual(runs[0].identity, { comparable: false, differences: ['state'] });
  assert.equal(runs[1].identity.comparable, true);
});

test('Windows 主程序辨識排除 GPU / renderer，保留正確目錄', () => {
  const executable = 'D:/games/Cookie Clicker.exe';
  const rows = [
    { ExecutablePath: executable, CommandLine: '"D:/games/Cookie Clicker.exe" --remote-debugging-port=9222' },
    { ExecutablePath: executable, CommandLine: '"D:/games/Cookie Clicker.exe" --type=renderer' },
    { ExecutablePath: 'D:/other/Cookie Clicker.exe', CommandLine: '' },
  ];
  assert.deepEqual(matchingMainProcesses(rows, executable), [rows[0]]);
});
test('連線失敗但既有程序仍在時，禁止重開；多個實例禁止量測', () => {
  assert.throws(() => assertProcessState([{}], false, 'start'), /拒絕重複啟動/);
  assert.throws(() => assertProcessState([{}, {}], true), /多個/);
  assert.throws(() => assertProcessState([], true, 'start'), /未對應/);
  assert.doesNotThrow(() => assertProcessState([], false, 'start'));
  assert.doesNotThrow(() => assertProcessState([{}], true));
});
test('種子排程可重現且每輪保留每個方案各一次', () => {
  const ids = ['baseline', 'indexed', 'compiled', 'search'];
  const first = schedule(ids, 3, 42);
  assert.deepEqual(first, schedule(ids, 3, 42));
  assert.equal(first.length, 12);
  for (const repeat of [1, 2, 3]) assert.deepEqual(first.filter(item => item.repeat === repeat).map(item => item.id).sort(), [...ids].sort());
});
test('尾端分位數保留尖峰、空樣本不偽造零耗時', () => {
  assert.deepEqual(statistics([]), { count: 0, mean: null, p50: null, p95: null, p99: null, max: null });
  const result = statistics([...Array(99).fill(1), 100]);
  assert.equal(result.p95, 1); assert.equal(result.p99, 1); assert.equal(result.max, 100);
});
test('狀態、設定或模組指紋不同不得宣稱可比較', () => {
  const baseline = { state: { cookies: 1 }, config: {}, mods: ['a'], scriptHashes: ['same'] };
  assert.equal(compareIdentity(baseline, baseline).comparable, true);
  const changed = compareIdentity({ ...baseline, state: { cookies: 2 }, mods: ['a', 'b'] }, baseline);
  assert.deepEqual(changed, { comparable: false, differences: ['state', 'mods'] });
});
test('檔案 hash 使用實際 bytes', () => {
  assert.equal(hash(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
test('attach 摘要排除方法原始碼與大型狀態', () => {
  const data = { version: '2.053', mods: [{ id: 'a' }], planner: { version: '1', experimentAvailable: true }, methodHashes: { updateUI: 'abc' }, methodShape: { updateUI: 'large source' }, state: { large: 'payload' }, scriptHashes: [{ url: 'file:///BestDealHelper/main.js', sha256: 'def' }, { url: 'file:///base.js', sha256: 'ghi' }] };
  const result = attachSummary(data, { processes: [{ ProcessId: 42 }], target: { id: 'target' } }, 'attach.json');
  assert.equal(result.loadedModCount, 1);
  assert.equal(result.processId, 42);
  assert.equal(result.plannerScripts.length, 1);
  assert.equal(result.metadataFile, 'attach.json');
  assert.equal(JSON.stringify(result).includes('large source'), false);
  assert.equal('state' in result, false);
});
test('觀察器保存例外與時間並還原自身包裝，保留後來第三方改寫', () => {
  let time = 0;
  const original = function () { time += 7; throw new Error('expected'); };
  const planner = { name: 'Best Deal Helper', updateUI: original };
  const game = { mods: { planner }, CalculateGains() { time += 2; return 42; } };
  const originalGains = game.CalculateGains;
  const context = vm.createContext({ Game: game, performance: { now: () => time }, requestAnimationFrame: () => 1, cancelAnimationFrame: () => {} });
  vm.runInContext(`(${beginObservation.toString()})()`, context);
  assert.throws(() => planner.updateUI(), /expected/);
  assert.equal(game.CalculateGains(), 42);
  const thirdParty = () => 9;
  planner.updateUI = thirdParty;
  const observation = vm.runInContext(`(${endObservation.toString()})()`, context);
  assert.equal(observation.timings.updateUI[0].ms, 7);
  assert.equal(observation.timings.CalculateGains[0].ms, 2);
  assert.equal(planner.updateUI, thirdParty);
  assert.equal(game.CalculateGains, originalGains);
  assert.equal(vm.runInContext('globalThis.__cppPerfObservation', context), undefined);
});
test('low-overhead observation preserves candidate identity and does not truncate on unrecorded calls', () => {
  const original = () => 42, planner = {modId: 'BestDealHelper', updateUI() {}, updateBestCpsAcceleration: original};
  const context = vm.createContext({Game: {mods: {planner}}, performance: {now: () => 0}, requestAnimationFrame: () => 1, cancelAnimationFrame() {}});
  vm.runInContext(`(${beginObservation})(false, false)`, context);
  assert.equal(planner.updateBestCpsAcceleration, original);
  for (let i = 0; i < 100001; i++) assert.equal(planner.updateBestCpsAcceleration(), 42);
  planner.updateUI();
  const result = vm.runInContext(`(${endObservation})()`, context);
  assert.equal(result.truncated, false);
  assert.equal(result.timings.updateUI.length, 1);
  assert.equal('simulation' in result.timings, false);
  assert.equal(planner.updateBestCpsAcceleration, original);
});

test('high-load observation can preserve CalculateGains identity without recording each call', () => {
  const original = () => 42, planner = {modId: 'BestDealHelper', updateUI() {}};
  const game = {mods: {planner}, CalculateGains: original};
  const context = vm.createContext({Game: game, performance: {now: () => 0}, requestAnimationFrame: () => 1, cancelAnimationFrame() {}});
  vm.runInContext(`(${beginObservation.toString()})(false)`, context);
  for (let i = 0; i < 100001; i++) assert.equal(game.CalculateGains(), 42);
  assert.equal(game.CalculateGains, original);
  planner.updateUI();
  const result = vm.runInContext(`(${endObservation.toString()})()`, context);
  assert.equal(result.truncated, false);
  assert.equal(result.timings.updateUI.length, 1);
  assert.equal('CalculateGains' in result.timings, false);
});

test('不同 output 的相同執行檔共用鎖，並發最多啟動一次', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cpp-mutex-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const executable = path.join(dir, 'Cookie Clicker.exe');
  await writeFile(executable, 'fixture, never executed');
  let started, unblock;
  const entered = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { unblock = resolve; });
  let calls = 0;
  const options = { lockRoot: path.join(dir, 'locks'), inspect: async () => ({ processes: [] }), inventory: async () => [{ ProcessId: 42 }] };
  const first = withGameLaunchGuard({ executable, output: path.join(dir, 'first') }, async () => { calls++; started(); await gate; return { expectedPid: 42 }; }, options);
  await entered;
  try {
    await assert.rejects(withGameLaunchGuard({ executable: path.join(dir, '.', 'Cookie Clicker.exe'), output: path.join(dir, 'second') }, async () => { calls++; }, options), /啟動鎖已存在/);
  } finally { unblock(); }
  const result = await first;
  assert.equal(result.process.ProcessId, 42);
  assert.equal(calls, 1);
  const lock = await acquireGameLaunchLock(executable, { lockRoot: options.lockRoot });
  await lock.release();
});
test('崩潰鎖不自動搶佔，ownership 變更後不刪他人的鎖', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cpp-lock-owner-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const executable = path.join(dir, 'Cookie Clicker.exe');
  await writeFile(executable, 'fixture');
  const options = { lockRoot: path.join(dir, 'locks') };
  const lock = await acquireGameLaunchLock(executable, options);
  await assert.rejects(acquireGameLaunchLock(executable, options), /啟動鎖已存在/);
  const original = JSON.parse(await readFile(lock.filename, 'utf8'));
  await writeFile(lock.filename, JSON.stringify({ ...original, token: 'another-owner' }));
  await assert.rejects(lock.release(), /ownership 不符/);
  await access(lock.filename);
});
test('鎖內重查 process 與 endpoint，既有實例失聯不呼叫 launch', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cpp-lock-preflight-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const executable = path.join(dir, 'Cookie Clicker.exe');
  await writeFile(executable, 'fixture');
  const options = { lockRoot: path.join(dir, 'locks'), inspect: async () => {
    await assert.rejects(acquireGameLaunchLock(executable, { lockRoot: options.lockRoot }), /啟動鎖已存在/);
    assertProcessState([{}], false, 'start');
  } };
  let launched = false;
  await assert.rejects(withGameLaunchGuard({ executable }, async () => { launched = true; }, options), /拒絕重複啟動/);
  assert.equal(launched, false);
  const lock = await acquireGameLaunchLock(executable, { lockRoot: options.lockRoot });
  await lock.release();
});
test('啟動後盤點暫時失敗只重查同一PID，不再啟動；持續失敗保留鎖與原因', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cpp-observation-retry-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const executable = path.join(dir, 'Cookie Clicker.exe');
  await writeFile(executable, 'fixture, never executed');
  let launches = 0, polls = 0;
  const failure = new Error('Incomplete CIM data');
  const options = { lockRoot: path.join(dir, 'locks'), waitMs: 1000, pollMs: 1,
    inspect: async () => ({ processes: [] }), inventory: async () => {
      if (++polls === 1) throw failure;
      return [{ ProcessId: 42 }];
    } };
  const launch = async () => { launches++; return { expectedPid: 42 }; };
  const result = await withGameLaunchGuard({ executable }, launch, options);
  assert.equal(result.process.ProcessId, 42);
  assert.equal(launches, 1);
  assert.equal(polls, 2);
  await assert.rejects(withGameLaunchGuard({ executable }, launch, {
    ...options, waitMs: 0, inventory: async () => { throw failure; },
  }), error => /保留啟動鎖/.test(error.message) && error.cause === failure);
  await assert.rejects(acquireGameLaunchLock(executable, { lockRoot: options.lockRoot }), /啟動鎖已存在/);
  assert.equal(launches, 2);
});
test('背景且零更新或畫格樣本，即使狀態自比相同亦不可視為有效量測', () => {
  const summary = { timings: { updateUI: statistics([]) }, frames: statistics([]), framesOver50ms: 0, truncated: false };
  const state = { visibility: 'hidden', state: {}, config: {}, mods: [], scriptHashes: [] };
  const identity = compareIdentity(state, state);
  assert.equal(identity.comparable, true);
  const sampleValidity = validateSample(state, state, summary);
  assert.equal(sampleValidity.valid, false);
  assert.equal(sampleValidity.reasons.length, 4);
  const report = markdown({ seed: 1, warmupMs: 0, sampleMs: 10, runs: [{ id: 'baseline', repeat: 1, identity, summary, sampleValidity }] });
  assert.match(report, /無效：量測開始時頁面不在前景/);
  assert.match(report, /否：量測無效/);
});
test('前景且有更新、畫格樣本可通過有效性檢查', () => {
  const result = validateSample({ visibility: 'visible' }, { visibility: 'visible' }, { timings: { updateUI: { count: 1 } }, frames: { count: 1 }, truncated: false });
  assert.deepEqual(result, { valid: true, reasons: [] });
});
test('模組版本以 runtime 優先，缺值時依 App id、名稱、info.ID 補 manifest 版本', () => {
  const counters = { indexBuilds: 2, indexHits: 8, compiledHits: 3 };
  const planner = { name: 'Best Deal Helper', modId: 'BestDealHelper', version: 'runtime-plan', config: {}, performanceExperiment: { setVariant() {}, variant: 'indexed', metadata: counters } };
  const game = { version: '2.053', ready: true, ObjectsById: [], UpgradesInStore: [], Upgrades: {}, buffs: {},
    mods: { 'Best Deal Helper': planner, 'runtime-id': { name: 'Different' }, 'Human label': { name: 'Friendly Name' }, 'by-info-id': { name: 'Other' }, ambiguous: { name: 'Shared Name' }, zero: { version: 0 } } };
  const app = { mods: {
    opaque: { info: { ID: 'BestDealHelper', Name: 'Cookie Payback Planner', ModVersion: 2053.2, privateField: 'not copied' }, privateField: 'not copied' },
    'runtime-id': { info: { ModVersion: 42 } },
    'other-name-key': { info: { Name: 'Friendly Name', ModVersion: 43 } },
    'other-id-key': { info: { ID: 'by-info-id', ModVersion: 44 } },
    first: { info: { Name: 'Shared Name', ModVersion: 1 } },
    second: { info: { Name: 'Shared Name', ModVersion: 2 } },
    zero: { info: { ModVersion: 999 } },
  } };
  const context = vm.createContext({ Game: game, App: app, document: { visibilityState: 'visible', scripts: [] } });
  const result = vm.runInContext(`(${snapshot.toString()})()`, context);
  const version = id => result.mods.find(mod => mod.id === id);
  assert.equal(result.planner.version, 'runtime-plan');
  assert.equal(result.planner.manifestVersion, 2053.2);
  assert.equal(result.planner.experimentMetadata.indexHits, 8);
  counters.indexHits = 99;
  assert.equal(result.planner.experimentMetadata.indexHits, 8);
  assert.equal(version('runtime-id').version, 42);
  assert.equal(version('Human label').version, 43);
  assert.equal(version('by-info-id').version, 44);
  assert.equal(version('ambiguous').version, undefined);
  assert.equal(version('ambiguous').versionSource, 'unavailable');
  assert.equal(version('zero').version, 0);
  assert.equal(result.appMods.find(mod => mod.id === 'opaque').info.ModVersion, 2053.2);
  assert.equal(JSON.stringify(result.appMods).includes('not copied'), false);
});

test('candidate ages include current store items only and preserve missing timestamps', () => {
  const planner = {modId: 'BestDealHelper', config: {}, lastComputedAtByItem: new Map([
    ['building:0', 900], ['upgrade:4', 800], ['upgrade:99', 1],
  ])};
  const building = {id: 0, type: 'building', amount: 1};
  const upgrade = {id: 4, buildingTie: {}};
  const game = {mods: {planner}, ObjectsById: [building], UpgradesInStore: [upgrade, {id: 5, type: 'upgrade'}],
    Upgrades: {}, buffs: {}};
  const context = vm.createContext({Game: game, Date: {now: () => 1000}, document: {visibilityState: 'visible', scripts: []}});
  const result = vm.runInContext(`(${snapshot.toString()})()`, context);
  assert.deepEqual(JSON.parse(JSON.stringify(result.metrics.candidateAgesMs)), [
    {token: 'building:0', ageMs: 100}, {token: 'upgrade:4', ageMs: 200}, {token: 'upgrade:5', ageMs: null},
  ]);
});
