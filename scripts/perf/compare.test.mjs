import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { runComparison, assessQuality, ensureVisible, measurementValidity, readinessProbe, waitReady, loadComparisonProfile, selectBuyBulk } from './compare.mjs';
import { hash } from './report.mjs';

async function fixture(t, changes = {}) {
  const output = await mkdtemp(path.join(os.tmpdir(), 'cpp-compare-test-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  const profile = { isolationRoot: path.join(output, 'copy'), output, seed: 1, repetitions: 1, warmupMs: 0, sampleMs: 1, readyTimeoutMs: 1,
    debugOrigin: 'http://127.0.0.1:9222', variants: [{ id: 'baseline', builtin: true }, { id: 'indexed', builtin: true }], ...changes };
  const isolation = { sourceRoot: path.join(output, 'original'), targetRoot: profile.isolationRoot,
    gameExe: path.join(profile.isolationRoot, 'Cookie Clicker.exe'), userDataDir: path.join(profile.isolationRoot, '.cpp-user-data') };
  isolation.requiredLaunchArgs = [`--user-data-dir=${isolation.userDataDir}`];
  const events = [];
  const identity = n => ({ visibility: 'visible', state: { cookies: n }, config: {}, mods: [], scriptHashes: [] });
  const summary = { timings: { updateUI: { count: 3 } }, frames: { count: 5 } };
  const deps = {
    verifyIsolation: async () => isolation,
    resetIsolationSave: async (_root, options) => { assert.equal(options.stopped, true); events.push('reset'); },
    gameProcesses: async () => [],
    startOwned: async trial => { assert.ok(trial.launchArgs.includes(`--user-data-dir=${isolation.userDataDir}`)); events.push('start'); },
    stopOwned: async () => { events.push('stop'); },
    waitReady: async () => { events.push('ready'); },
    ensureVisible: async () => { events.push('visible'); return { visibility: 'visible', ready: true }; },
    runQuality: async () => { events.push('quality'); return { checkpoint: { stateStable: true }, assessment: { exactVariantsPass: true } }; },
    collect: async trial => { events.push('collect'); return { output: trial.output, report: { runs: [{ ...trial.variants[0], before: identity(1), after: identity(1), summary }] } }; },
  };
  return { profile, isolation, events, deps, output, identity, summary };
}

test('each trial resets, starts, waits for planner, collects, and stops in order', async t => {
  const f = await fixture(t);
  const result = await runComparison(f.profile, f.deps);
  assert.deepEqual(f.events, ['reset', 'start', 'ready', 'visible', 'quality', 'collect', 'stop', 'reset', 'start', 'ready', 'visible', 'quality', 'collect', 'stop']);
  assert.equal(result.report.complete, true);
  assert.equal(result.report.runs.length, 2);
  assert.equal(result.report.winner, null);
});

test('requested purchase bulk is applied before quality and collection in every trial', async t => {
  const f = await fixture(t, {buyBulk: 100});
  f.deps.applyBuyBulk = async trial => { assert.equal(trial.buyBulk, 100); f.events.push('bulk100'); return {buyMode: 1, buyBulk: 100}; };
  await runComparison(f.profile, f.deps);
  assert.deepEqual(f.events, ['reset','start','ready','visible','bulk100','quality','collect','stop','reset','start','ready','visible','bulk100','quality','collect','stop']);
});

test('unsupported purchase bulk rejects before touching game state', async t => {
  const f = await fixture(t, {buyBulk: -1});
  await assert.rejects(runComparison(f.profile, f.deps), /Invalid buyBulk/);
  assert.deepEqual(f.events, []);
});

test('bulk selection uses the game purchase controls and verifies their effect', () => {
  const calls = [], game = {ready: true, storeBulkButton(id) { calls.push(id); if(id === 0) this.buyMode = 1; else this.buyBulk = {2:1,3:10,4:100}[id]; }};
  for (const bulk of [1,10,100]) {
    const result = runInNewContext(`(${selectBuyBulk.toString()})(${bulk})`, {Game: game, document: {visibilityState: 'visible'}});
    assert.equal(result.buyBulk, bulk); assert.equal(result.buyMode, 1);
  }
  assert.deepEqual(calls, [0,2,0,3,0,4]);
  assert.throws(() => runInNewContext(`(${selectBuyBulk.toString()})(100)`, {Game: game, document: {visibilityState: 'hidden'}}), /Visible ready/);
  game.storeBulkButton = () => {}; game.buyBulk = 1;
  assert.throws(() => runInNewContext(`(${selectBuyBulk.toString()})(100)`, {Game: game, document: {visibilityState: 'visible'}}), /selection failed/);
});

test('expected planner hash rejects a stale isolated bundle before game operations', async t => {
  const f = await fixture(t, { expectedPlannerSha256: '0'.repeat(64) });
  const bundle = path.join(f.isolation.targetRoot, 'resources/app/mods/workshop/BestDealHelper/main.js');
  await mkdir(path.dirname(bundle), { recursive: true });
  await writeFile(bundle, 'stale bundle');
  await assert.rejects(runComparison(f.profile, f.deps), /bundle hash mismatch/);
  assert.deepEqual(f.events, []);
});

test('matching expected planner hash permits normal comparison', async t => {
  const f = await fixture(t, { expectedPlannerSha256: hash('current bundle') });
  const bundle = path.join(f.isolation.targetRoot, 'resources/app/mods/workshop/BestDealHelper/main.js');
  await mkdir(path.dirname(bundle), { recursive: true });
  await writeFile(bundle, 'current bundle');
  assert.equal((await runComparison(f.profile, f.deps)).report.complete, true);
});

test('readiness failure stops owned process and preserves partial report', async t => {
  const f = await fixture(t);
  f.deps.waitReady = async () => { throw new Error('not ready'); };
  await assert.rejects(runComparison(f.profile, f.deps), /not ready/);
  assert.deepEqual(f.events, ['reset', 'start', 'stop']);
  const directory = (await readdir(f.output)).find(x => x.startsWith('comparison-'));
  const report = JSON.parse(await readFile(path.join(f.output, directory, 'report.json'), 'utf8'));
  assert.equal(report.complete, false);
  assert.match(report.failure, /not ready/);
});

test('a running original game prevents all reset and launch operations', async t => {
  const f = await fixture(t);
  f.deps.gameProcesses = async executable => executable.includes('original') ? [{ ProcessId: 1 }] : [];
  await assert.rejects(runComparison(f.profile, f.deps), /must already be stopped/);
  assert.deepEqual(f.events, []);
});

test('a failed launch never claims ownership or closes an unrelated process', async t => {
  const f = await fixture(t);
  f.deps.startOwned = async () => { f.events.push('start'); throw new Error('ownership unavailable'); };
  await assert.rejects(runComparison(f.profile, f.deps), /ownership unavailable/);
  assert.deepEqual(f.events, ['reset', 'start']);
});

test('mutated quality state rejects trial and still closes owned game', async t => {
  const f = await fixture(t);
  f.deps.runQuality = async () => ({ checkpoint: { stateStable: false }, assessment: { exactVariantsPass: false } });
  await assert.rejects(runComparison(f.profile, f.deps), /changed gameplay state/);
  assert.equal(f.events.at(-1), 'stop');
  assert.ok(!f.events.includes('collect'));
});

test('cross-trial identity mismatch is observation rather than a false fair comparison', async t => {
  const f = await fixture(t);
  f.deps.collect = async trial => ({ output: trial.output, report: { runs: [{ ...trial.variants[0],
    before: f.identity(trial.variants[0].id === 'baseline' ? 1 : 2), after: f.identity(2), summary: f.summary }] } });
  const result = await runComparison(f.profile, f.deps);
  assert.equal(result.report.runs.find(x => x.id === 'indexed').identity.comparable, false);
  assert.equal(result.report.winner, null);
});

test('quality comparison rejects numerical and ranking differences', () => {
  const entry = (id, score) => ({ id, stateUnchanged: true, buildingOrder: ['building:1'], upgradeOrder: [], autoBuyBestCandidateToken: 'building:1', items: [{ token: 'building:1', score, wait: 2, amount: 1 }], ranking: [{ token: 'building:1', score }] });
  const checkpoint = { stateStable: true, variants: [entry('baseline', 1), entry('indexed', 1), entry('compiled', 1.1), entry('search', 1)] };
  const assessment = assessQuality(checkpoint);
  assert.equal(assessment.checks.find(x => x.id === 'indexed').accepted, true);
  assert.equal(assessment.checks.find(x => x.id === 'compiled').accepted, false);
  assert.equal(assessment.exactVariantsPass, false);
});

test('identical scores cannot pass with reversed store orders or a different auto-buy candidate', () => {
  const base = { id: 'baseline', stateUnchanged: true, items: [{ token: 'building:1', score: 1, wait: 2, amount: 1 }], ranking: [{ token: 'building:1', score: 1 }],
    buildingOrder: ['building:1', 'building:2'], upgradeOrder: ['upgrade:1', 'upgrade:2'], autoBuyBestCandidateToken: 'building:1' };
  for (const [key, value] of [['buildingOrder', [...base.buildingOrder].reverse()], ['upgradeOrder', [...base.upgradeOrder].reverse()], ['autoBuyBestCandidateToken', 'building:2']]) {
    const changed = { ...base, id: 'indexed', [key]: value };
    const result = assessQuality({ stateStable: true, variants: [base, changed] }).checks[0];
    assert.equal(result.numericMatches, true);
    assert.equal(result.rankingMatches, true);
    assert.equal(result.accepted, false);
    assert.ok(result.differences.includes(key));
  }
});

test('missing captured store order cannot claim complete quality proof', () => {
  const base = { id: 'baseline', stateUnchanged: true, items: [{ token: 'building:1', score: 1 }], ranking: [], buildingOrder: ['building:1'], upgradeOrder: [] };
  const changed = { ...base, id: 'compiled' };
  delete changed.buildingOrder;
  const result = assessQuality({ stateStable: true, variants: [base, changed] }).checks[0];
  assert.equal(result.accepted, false);
  assert.equal(result.buildingOrderMatches, false);
  assert.equal(result.autoBuyCandidateAvailable, false);
});

test('user data directory overrides are rejected before launching', async t => {
  const f = await fixture(t, { launchArgs: ['--user-data-dir=original'] });
  await assert.rejects(runComparison(f.profile, f.deps), /Unsafe comparison launch argument/);
  assert.deepEqual(f.events, []);
});

test('zero update/frame samples are invalid and preserve a reason before cleanup', async t => {
  const f = await fixture(t);
  f.deps.collect = async trial => ({ output: trial.output, report: { runs: [{ before: f.identity(1), after: f.identity(1),
    summary: { timings: { updateUI: { count: 0 } }, frames: { count: 0 } } }] } });
  await assert.rejects(runComparison(f.profile, f.deps), /沒有統計更新樣本, 沒有畫格樣本/);
  assert.equal(f.events.at(-1), 'stop');
  const directory = (await readdir(f.output)).find(x => x.startsWith('comparison-'));
  const report = JSON.parse(await readFile(path.join(f.output, directory, 'report.json'), 'utf8'));
  assert.equal(report.runs.length, 0);
  assert.deepEqual(report.invalidTrials[0].validity.reasons, ['沒有統計更新樣本', '沒有畫格樣本']);
  assert.equal(report.winner, null);
});

test('hidden measurement endpoints are rejected even with populated samples', () => {
  const validity = measurementValidity({ before: { visibility: 'hidden' }, after: { visibility: 'hidden' },
    summary: { timings: { updateUI: { count: 5 } }, frames: { count: 40 } } });
  assert.equal(validity.valid, false);
  assert.deepEqual(validity.reasons, ['量測開始時頁面不在前景', '量測結束時頁面不在前景']);
});

test('truncated samples are rejected even if the collector marked them valid', () => {
  const validity = measurementValidity({ before: { visibility: 'visible' }, after: { visibility: 'visible' }, sampleValidity: { valid: true, reasons: [] },
    summary: { timings: { updateUI: { count: 10 } }, frames: { count: 30 }, truncated: true } });
  assert.equal(validity.valid, false);
  assert.deepEqual(validity.reasons, ['原始樣本達上限而截斷']);
});

test('explicit collector rejection cannot become valid in the outer comparison', async t => {
  const f = await fixture(t);
  f.deps.collect = async trial => ({ output: trial.output, report: { runs: [{ before: f.identity(1), after: f.identity(1), summary: f.summary,
    sampleValidity: { valid: false, reasons: ['收集器發現不完整原始資料'] } }] } });
  await assert.rejects(runComparison(f.profile, f.deps), /收集器發現不完整原始資料/);
  assert.equal(f.events.at(-1), 'stop');
  const directory = (await readdir(f.output)).find(x => x.startsWith('comparison-'));
  const report = JSON.parse(await readFile(path.join(f.output, directory, 'report.json'), 'utf8'));
  assert.equal(report.runs.length, 0);
  assert.equal(report.invalidTrials[0].validity.valid, false);
  assert.equal(report.winner, null);
});

test('visibility failure stops owned game before quality or collection', async t => {
  const f = await fixture(t);
  f.deps.ensureVisible = async () => { throw new Error('still hidden'); };
  await assert.rejects(runComparison(f.profile, f.deps), /still hidden/);
  assert.deepEqual(f.events, ['reset', 'start', 'ready', 'stop']);
});

test('window restoration uses the owned PID, brings its CDP page forward, and verifies visibility', async t => {
  const f = await fixture(t);
  const receipt = path.join(f.output, 'owner.json');
  await writeFile(receipt, JSON.stringify({ ProcessId: 123, CreationDate: 'now', executable: f.isolation.gameExe }));
  const calls = [];
  let observations = 0;
  const result = await ensureVisible({ executable: f.isolation.gameExe }, receipt, {
    gameProcesses: async () => [{ ProcessId: 123, CreationDate: 'now' }],
    exec: async (_file, args) => { assert.match(args.at(-1), /Get-Process -Id 123 /); calls.push('window'); },
    inspectInstance: async () => ({ target: {} }),
    connect: async () => ({ send: async method => calls.push(method), evaluate: async () => ({ visibility: ++observations === 1 ? 'hidden' : 'visible', ready: true, focused: true }), close: () => calls.push('close') }),
    sleep: async () => {},
  });
  assert.equal(result.visibility, 'visible');
  assert.equal(result.processId, 123);
  assert.deepEqual(calls, ['window', 'Page.bringToFront', 'close']);
});

test('window restoration refuses stale ownership without touching any window', async t => {
  const f = await fixture(t);
  const receipt = path.join(f.output, 'owner.json');
  await writeFile(receipt, JSON.stringify({ ProcessId: 123, CreationDate: 'old', executable: f.isolation.gameExe }));
  await assert.rejects(ensureVisible({ executable: f.isolation.gameExe }, receipt, {
    gameProcesses: async () => [{ ProcessId: 123, CreationDate: 'new' }],
    exec: async () => assert.fail('must not operate a reused PID'),
  }), /identity mismatch/);
});

test('readiness probe clicks only the requested known first-launch language before Game exists', () => {
  const clicks = [];
  const context = { Langs: { 'ZH-CN': {}, EN: {} }, document: { getElementById: id => ({ classList: { contains: cls => cls === 'langSelectButton' }, click: () => clicks.push(id) }) } };
  const probe = (language, allow = true) => runInNewContext(`(${readinessProbe.toString()})(${JSON.stringify(language)},${allow})`, context);
  assert.equal(probe('ZH-CN').languageClicked, true);
  assert.deepEqual(clicks, ['langSelect-ZH-CN']);
  assert.equal(probe('EN', false).languageClicked, false);
  assert.equal(probe('NOT-A-LANGUAGE').languageClicked, false);
  context.Game = { ready: true, mods: { p: { modId: 'BestDealHelper', isLoaded: true, performanceExperiment: { setVariant() {} } } } };
  assert.equal(probe('EN').ready, true);
  assert.deepEqual(clicks, ['langSelect-ZH-CN']);
});

test('readiness probe never clicks a generic button with a matching ID', () => {
  const context = { Langs: { EN: {} }, document: { getElementById: () => ({ classList: { contains: () => false }, click: () => assert.fail('generic dialogs are not answered') }) } };
  assert.equal(runInNewContext(`(${readinessProbe.toString()})('EN')`, context).languageClicked, false);
});

test('waitReady selects bootstrap language once and keeps waiting for planner readiness', async () => {
  let now = 0, calls = 0;
  const expressions = [];
  const session = { target: {} };
  const result = await waitReady({ language: 'EN' }, 10000, {
    now: () => now,
    sleep: async ms => { now += ms; },
    inspectInstance: async () => session,
    connect: async () => ({ evaluate: async expression => { expressions.push(expression); return ++calls === 1 ? { ready: false, languageClicked: true } : { ready: true, languageClicked: false }; }, close() {} }),
  });
  assert.equal(result, session);
  assert.match(expressions[0], /\("EN",true\)$/);
  assert.match(expressions[1], /\("EN",false\)$/);
});

test('language profile defaults are explicit and unsupported languages fail before process work', async t => {
  const f = await fixture(t);
  const filename = path.join(f.output, 'profile.json');
  await writeFile(filename, JSON.stringify({ isolationRoot: './copy', output: './result' }));
  assert.equal((await loadComparisonProfile(filename)).language, 'ZH-CN');
  await assert.rejects(runComparison({ ...f.profile, language: 'ZH-TW' }, f.deps), /Unsupported comparison language/);
  assert.deepEqual(f.events, []);
});

test('serialized readiness probe supports ES2020 without Object.hasOwn', () => {
  let clicked = false;
  const context = { Langs: { 'ZH-CN': {} }, document: { getElementById: () => ({ classList: { contains: () => true }, click: () => { clicked = true; } }) } };
  const result = runInNewContext(`Object.hasOwn=undefined; (${readinessProbe.toString()})('ZH-CN')`, context);
  assert.equal(result.languageClicked, true);
  assert.equal(clicked, true);
});

test('readiness timeout retains semantic exceptions after later CDP transport failures', async () => {
  let now = 0, attempts = 0;
  await assert.rejects(waitReady({ language: 'EN' }, 2000, {
    now: () => now,
    sleep: async ms => { now += ms; },
    inspectInstance: async () => { if (++attempts > 1) throw new Error('later endpoint unavailable'); return { target: {} }; },
    connect: async () => ({ evaluate: async () => { throw new TypeError('earlier unsupported renderer API'); }, close() {} }),
  }), error => {
    assert.match(error.message, /earlier unsupported renderer API/);
    assert.match(error.message, /later endpoint unavailable/);
    assert.match(error.diagnostics.lastEvaluationError, /TypeError/);
    assert.match(error.diagnostics.lastTransportError, /endpoint unavailable/);
    assert.equal(error.cause.message, 'earlier unsupported renderer API');
    return true;
  });
});
