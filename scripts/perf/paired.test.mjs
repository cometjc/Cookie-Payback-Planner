import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pairedRound, assessPairedRound, runPaired, loadPairedProfile } from './paired.mjs';

test('relative executable and isolation paths resolve from the profile directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cpp-paired-path-'));
  try {
    const file = path.join(root, 'profile.json');
    await writeFile(file, JSON.stringify({ isolationRoot: 'game', executable: 'game/Cookie Clicker.exe' }));
    const profile = await loadPairedProfile(file);
    assert.equal(profile.executable, path.join(root, 'game', 'Cookie Clicker.exe'));
    assert.equal(profile.isolationRoot, path.join(root, 'game'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

function fixture({ throws = false, mutation = false, expired = false } = {}) {
  const calls = [];
  const api = { variant: 'indexed', metadata: { indexHits: 3, compiledHits: 2 },
    setVariant(id) { this.variant = id; p.smoothedClickCps = 0; },
    withRefresh(run) { return run(); },
    restore() { this.variant = 'baseline'; p.smoothedClickCps = 0; } };
  const p = { modId: 'BestDealHelper', isLoaded: true, performanceExperiment: api, smoothedClickCps: 7,
    estimateWaitSeconds(price, cookies, cps, offset) {
      calls.push({ id: api.variant, price, cookies, cps, offset, click: this.smoothedClickCps });
      if (throws && api.variant === 'compiled') throw new Error('estimator failure');
      if (mutation) game.cookies++;
      return price === Infinity ? Infinity : (price - cookies) / (cps + this.smoothedClickCps) + offset;
    } };
  const game = { ready: true, mods: { p }, cookies: 10, cookiesEarned: 12, cookiesPs: 2, cookiesPsRaw: 2, unbuffedCps: 2, cookieClicks: 0,
    ObjectsById: [{ id: 1, type: 'building', amount: 1, bought: 1, level: 0, getPrice: () => 100 }],
    UpgradesInStore: [{ id: 1, type: 'upgrade', bought: 0, getPrice: () => Infinity }], Upgrades: {}, buffs: {}, effs: {}, resets: 0 };
  let ticks = 0;
  const context = { Game: game, document: { visibilityState: 'visible' }, performance: { now: () => ++ticks * (expired ? 500 : 0.01) } };
  const originalNow = runInNewContext('Date.now', context);
  const originalGame = JSON.stringify(game);
  const run = () => runInNewContext(`Object.hasOwn=undefined; Array.prototype.at=undefined; (${pairedRound.toString()})({order:['compiled','baseline','indexed'],queries:12,offsets:[0,5],maxRoundMs:1800})`, context);
  return { run, calls, context, p, api, game, originalNow, originalGame };
}

test('all variants receive exactly the same live inputs and click CPS; game state and clock are restored', () => {
  const f = fixture();
  const result = f.run();
  assert.equal(result.stateStable, true);
  assert.equal(result.runs.length, 3);
  const inputs = id => f.calls.filter(call => call.id === id).map(({ id: _id, ...input }) => input);
  assert.deepEqual(inputs('baseline'), inputs('compiled'));
  assert.deepEqual(inputs('baseline'), inputs('indexed'));
  assert.ok(f.calls.every(call => call.click === 7));
  assert.equal(f.api.variant, 'indexed');
  assert.equal(f.p.smoothedClickCps, 7);
  assert.equal(runInNewContext('Date.now', f.context), f.originalNow);
  assert.equal(JSON.stringify(f.game), f.originalGame);
  assert.equal(assessPairedRound(result).valid, true);
});

test('estimator failure cannot leave the fixed clock, click CPS, or variant installed', () => {
  const f = fixture({ throws: true });
  const result = f.run();
  assert.match(result.error, /estimator failure/);
  assert.equal(f.api.variant, 'indexed');
  assert.equal(f.p.smoothedClickCps, 7);
  assert.equal(runInNewContext('Date.now', f.context), f.originalNow);
  assert.equal(assessPairedRound(result).valid, false);
});

test('gameplay mutation and time budget overruns invalidate the paired round', () => {
  const changed = fixture({ mutation: true }).run();
  assert.match(changed.error, /Gameplay state changed/);
  assert.equal(assessPairedRound(changed).valid, false);
  const expired = fixture({ expired: true });
  assert.match(expired.run().error, /bounded time budget/);
  assert.equal(runInNewContext('Date.now', expired.context), expired.originalNow);
});

test('non-finite outputs are losslessly encoded and compared against the same-input oracle', () => {
  const result = fixture().run();
  assert.ok(result.runs.every(run => run.outputs.includes('Infinity')));
  const assessed = assessPairedRound(result);
  assert.equal(assessed.valid, true);
  assert.ok(assessed.checks.every(check => check.nonFiniteCount > 0));
  const compiled = result.runs.find(run => run.id === 'compiled');
  compiled.outputs[0] = 'NaN';
  const rejected = assessPairedRound(result);
  assert.equal(rejected.valid, false);
  assert.ok(rejected.checks.find(check => check.id === 'compiled').differences.includes('query:0'));
  for (const run of result.runs) run.outputs[0] = 'NaN';
  assert.equal(assessPairedRound(result).valid, false);
});

test('numerical tolerance never hides a material estimator difference', () => {
  const result = fixture().run();
  const compiled = result.runs.find(run => run.id === 'compiled');
  compiled.outputs[0] += 1e-12;
  assert.equal(assessPairedRound(result).valid, true);
  compiled.outputs[0] += 0.1;
  assert.equal(assessPairedRound(result).valid, false);
});

test('runner attaches only to verified isolation and closes CDP after failure without launching games', async t => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'cpp-paired-test-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  const profile = { isolationRoot: path.join(output, 'copy'), output, rounds: 1, queriesPerRound: 1000, seed: 1, offsets: [0] };
  const isolation = { sourceRoot: path.join(output, 'original'), gameExe: path.join(output, 'copy/Cookie Clicker.exe') };
  let closed = false;
  const session = { target: { id: 'page' }, processes: [{ ProcessId: 12 }] };
  await assert.rejects(runPaired(profile, {
    verifyIsolation: async () => isolation,
    gameProcesses: async () => [],
    inspectInstance: async attached => { assert.equal(attached.executable, isolation.gameExe); return session; },
    connect: async () => ({ evaluateJson: async () => { throw new Error('renderer failed'); }, close: () => { closed = true; } }),
  }), /renderer failed/);
  assert.equal(closed, true);
});

test('runner refuses a running original game before connecting', async () => {
  await assert.rejects(runPaired({ isolationRoot: 'unused' }, {
    verifyIsolation: async () => ({ sourceRoot: 'original', gameExe: 'copy/Cookie Clicker.exe' }),
    gameProcesses: async () => [{ ProcessId: 1 }],
    connect: async () => assert.fail('must not connect'),
  }), /Original game must be stopped/);
});
