import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './cdp.mjs';
import { gameProcesses, inspectInstance } from './process.mjs';
import { verifyIsolation } from './isolation.mjs';
import { hash, schedule, statistics } from './report.mjs';

const variants = ['baseline', 'indexed', 'compiled'];
const json = (filename, value) => writeFile(filename, `${JSON.stringify(value, null, 2)}\n`);

/** One synchronous, paired round. Keep this function self-contained and ES2020 compatible. */
export function pairedRound(options) {
  const p = Object.values(Game.mods).find(m => m?.modId === 'BestDealHelper' || m?.name === 'Best Deal Helper');
  if (!Game.ready || !p?.performanceExperiment || typeof p.performanceExperiment.withRefresh !== 'function') throw new Error('Ready game and scoped experiment API required');
  if (document.visibilityState !== 'visible') throw new Error('Paired benchmark requires a visible isolated game');
  const order = options.order;
  if (!Array.isArray(order) || order.length !== 3 || new Set(order).size !== 3 || order.some(id => !['baseline', 'indexed', 'compiled'].includes(id))) throw new Error('Invalid paired variant order');
  const count = options.queries;
  if (!Number.isInteger(count) || count < 1 || count > 5000) throw new Error('Invalid paired query count');
  if (!Array.isArray(options.offsets) || !options.offsets.length || options.offsets.some(x => !Number.isFinite(x) || x < 0)) throw new Error('Invalid paired offsets');
  const api = p.performanceExperiment;
  const originalVariant = api.variant;
  const originalNow = Date.now;
  const originalClickCps = p.smoothedClickCps;
  const fixedNow = originalNow();
  const clock = () => performance.now();
  const started = clock();
  const deadline = started + Math.min(1800, Math.max(1, options.maxRoundMs || 1800));
  const encode = value => typeof value === 'number' && !Number.isFinite(value) ? String(value) : value;
  const stringify = value => JSON.stringify(value, (_key, item) => encode(item));
  const fingerprint = () => stringify({ cookies: Game.cookies, earned: Game.cookiesEarned, cps: Game.cookiesPs, rawCps: Game.cookiesPsRaw, unbuffed: Game.unbuffedCps,
    clicks: Game.cookieClicks, ascensions: Game.resets, bulk: Game.buyBulk, mode: Game.buyMode,
    buildings: Game.ObjectsById.map(x => [x.id, x.amount, x.bought, x.level]),
    upgrades: Object.values(Game.Upgrades).map(x => [x.id, x.bought, x.unlocked]),
    buffs: Object.entries(Game.buffs || {}).map(([key, x]) => [key, x.name, x.dname, x.type, x.time, x.multCpS, x.multCps, x.multClick, x.multClicks, x.multMouse]),
    aura: [Game.dragonAura, Game.dragonAura2], season: Game.season, effects: Game.effs });
  const result = { fixedNow, visibility: document.visibilityState, queries: count, order: [...order], runs: [], stateStable: false,
    note: 'Only estimateWaitSeconds is timed. This is not a whole-update or frame-rate benchmark.' };
  try {
    Date.now = () => fixedNow;
    const initial = fingerprint();
    const items = [...Game.ObjectsById, ...Game.UpgradesInStore];
    const cookies = Game.cookies, cps = Game.unbuffedCps;
    const inputs = [];
    for (const item of items) {
      const price = item.getPrice();
      for (const offset of options.offsets) inputs.push({ token: `${item.type}:${item.id}`, price, cookies, cps, offset });
    }
    if (!inputs.length) throw new Error('No live items to benchmark');
    if (fingerprint() !== initial) throw new Error('Reading live prices mutated gameplay state');
    result.inputs = inputs.map(input => ({ ...input, price: encode(input.price), cookies: encode(input.cookies), cps: encode(input.cps) }));
    result.clickCps = encode(originalClickCps);
    result.stateBefore = initial;
    result.mods = Object.entries(Game.mods).map(([id, mod]) => ({ id, name: mod?.name, version: mod?.version ?? globalThis.App?.mods?.[id]?.info?.ModVersion }));
    for (const id of order) {
      if (clock() >= deadline) throw new Error('Paired round exceeded its bounded time budget');
      if (fingerprint() !== initial) throw new Error(`Gameplay state changed before ${id}`);
      api.setVariant(id);
      p.smoothedClickCps = originalClickCps;
      const outputs = [];
      const runStart = clock();
      api.withRefresh(() => {
        for (let index = 0; index < count; index++) {
          if (index % 64 === 0 && clock() >= deadline) throw new Error('Paired round exceeded its bounded time budget');
          const input = inputs[index % inputs.length];
          const value = p.estimateWaitSeconds(input.price, input.cookies, input.cps, input.offset);
          if (typeof value !== 'number') throw new Error('Wait estimator returned a non-number');
          outputs.push(encode(value));
        }
      });
      const durationMs = clock() - runStart;
      const stateUnchanged = fingerprint() === initial;
      result.runs.push({ id, durationMs, perQueryMs: durationMs / count, count, outputs, stateUnchanged, metadata: api.metadata });
      if (!stateUnchanged) throw new Error(`Gameplay state changed during ${id}`);
    }
    result.stateAfter = fingerprint();
    result.stateStable = result.stateAfter === initial;
    result.durationMs = clock() - started;
    if (result.durationMs > Math.min(1800, options.maxRoundMs || 1800)) throw new Error('Paired round exceeded its bounded time budget');
    return result;
  } catch (error) {
    result.error = error.message;
    result.durationMs = clock() - started;
    result.stateAfter = fingerprint();
    return result;
  } finally {
    Date.now = originalNow;
    try { api.restore(); if (originalVariant !== 'baseline') api.setVariant(originalVariant); }
    finally { p.smoothedClickCps = originalClickCps; }
  }
}

export function assessPairedRound(round, tolerance = 1e-10) {
  const baseline = round.runs.find(run => run.id === 'baseline');
  const equal = (a, b) => Object.is(a, b) || typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)
    && Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
  const checks = variants.map(id => {
    const run = round.runs.find(item => item.id === id);
    const differences = [];
    if (!baseline || !run) differences.push('missing variant output');
    else {
      if (run.outputs.length !== baseline.outputs.length || run.outputs.length !== round.queries) differences.push('query count');
      for (let index = 0; index < Math.min(run.outputs.length, baseline.outputs.length); index++) {
        if (!equal(run.outputs[index], baseline.outputs[index])) differences.push(`query:${index}`);
        if (run.outputs[index] === 'NaN' || run.outputs[index] === null || typeof run.outputs[index] !== 'number' && !['Infinity', '-Infinity'].includes(run.outputs[index])) differences.push(`invalid-result:${index}`);
      }
    }
    return { id, valid: !round.error && round.stateStable && !!run?.stateUnchanged && differences.length === 0,
      differences, resultsSha256: run ? hash(run.outputs) : null, nonFiniteCount: run?.outputs.filter(value => typeof value !== 'number').length || 0 };
  });
  return { valid: checks.every(check => check.valid), tolerance, toleranceRule: 'abs(a-b) <= tolerance * max(1, abs(a), abs(b))', inputSha256: hash(round.inputs), checks };
}

export async function loadPairedProfile(filename) {
  const profile = JSON.parse(await readFile(filename, 'utf8'));
  const base = path.dirname(path.resolve(filename));
  if (!profile.isolationRoot) throw new Error('isolationRoot required');
  profile.isolationRoot = path.resolve(base, profile.isolationRoot);
  if (profile.executable) profile.executable = path.resolve(base, profile.executable);
  profile.output = path.resolve(base, profile.output || '../../tmp/paired');
  profile.debugOrigin ||= 'http://127.0.0.1:9222';
  profile.rounds ??= 5; profile.queriesPerRound ??= 3000; profile.seed ??= 20261101;
  profile.offsets ??= [0, 1, 5, 30, 120];
  if (!Number.isInteger(profile.rounds) || profile.rounds < 1 || profile.rounds > 20) throw new Error('Invalid round count');
  if (!Number.isInteger(profile.queriesPerRound) || profile.queriesPerRound < 1000 || profile.queriesPerRound > 5000) throw new Error('queriesPerRound must be 1000..5000');
  if (!Number.isInteger(profile.seed) || profile.seed < 0) throw new Error('Invalid seed');
  if (!Array.isArray(profile.offsets) || !profile.offsets.length || profile.offsets.length > 100 || profile.offsets.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Invalid offsets');
  return profile;
}

export async function runPaired(profile, dependencies = {}) {
  const deps = { verifyIsolation, gameProcesses, inspectInstance, connect, ...dependencies };
  const isolation = await deps.verifyIsolation(profile.isolationRoot);
  const originalExe = path.join(isolation.sourceRoot, 'Cookie Clicker.exe');
  if (profile.executable && path.resolve(profile.executable).toLowerCase() !== path.resolve(isolation.gameExe).toLowerCase()) throw new Error('Paired executable must match verified isolation');
  const attached = { ...profile, executable: isolation.gameExe };
  const assertOriginalStopped = async () => { if ((await deps.gameProcesses(originalExe)).length) throw new Error('Original game must be stopped before paired sampling'); };
  await assertOriginalStopped();
  const session = await deps.inspectInstance(attached);
  const output = path.join(profile.output, `paired-${new Date().toISOString().replaceAll(':', '-')}`);
  await mkdir(output, { recursive: true });
  const allOrder = schedule(variants, profile.rounds, profile.seed);
  const report = { format: 'cpp-paired-v1', profile, isolation, order: allOrder, rounds: [], complete: false,
    scope: 'Same-input estimateWaitSeconds microbenchmark only; it does not establish whole-update or FPS improvements.' };
  const save = async () => {
    report.summary = variants.map(id => {
      const runs = report.rounds.filter(round => round.assessment.valid).map(round => round.raw.runs.find(run => run.id === id));
      return { id, perQueryMs: statistics(runs.map(run => run.perQueryMs)), rounds: runs.length };
    });
    await json(path.join(output, 'report.json'), report);
    const lines = ['# 同輸入等待估算微量測', '', '每輪三方案共用同一次即時輸入、固定時刻與點擊收益，暖機及完整更新效能仍應另看逐試驗資料。不同輪次可自然推進，僅輪內配對。', '',
      '|方案|有效輪數|每次查詢中位數 µs|每次查詢 p95 µs|', '|---|---:|---:|---:|',
      ...report.summary.map(item => `|${item.id}|${item.rounds}|${item.perQueryMs.p50 === null ? '無資料' : item.perQueryMs.p50 * 1000}|${item.perQueryMs.p95 === null ? '無資料' : item.perQueryMs.p95 * 1000}|`)];
    if (report.failure) lines.push('', `失敗：${report.failure}`);
    lines.push('', '這是等待估算函式的微量測，不能解讀成整體統計更新或畫面流暢度的改善比例。');
    await writeFile(path.join(output, 'report.md'), lines.join('\n'));
  };
  const cdp = await deps.connect(session.target);
  try {
    await json(path.join(output, 'profile.json'), profile);
    await json(path.join(output, 'isolation.json'), isolation);
    for (let repeat = 1; repeat <= profile.rounds; repeat++) {
      await assertOriginalStopped();
      const current = await deps.inspectInstance(attached);
      if (current.target.id !== session.target.id || current.processes[0].ProcessId !== session.processes[0].ProcessId) throw new Error('Isolated game instance changed during paired sampling');
      const options = { order: allOrder.filter(entry => entry.repeat === repeat).map(entry => entry.id), queries: profile.queriesPerRound, offsets: profile.offsets, maxRoundMs: 1800 };
      const raw = await cdp.evaluateJson(`(${pairedRound.toString()})(${JSON.stringify(options)})`);
      const assessment = assessPairedRound(raw);
      const round = { repeat, raw, assessment };
      report.rounds.push(round);
      await json(path.join(output, `round-${repeat}.json`), round);
      await save();
      if (!assessment.valid) throw new Error(`Paired round ${repeat} was invalid: ${raw.error || JSON.stringify(assessment.checks)}`);
    }
    report.complete = true;
    await save();
    return { output, report };
  } catch (error) {
    report.failure = error.stack || error.message;
    await save();
    throw error;
  } finally { cdp.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, filename] = process.argv.slice(2);
  if (command !== 'paired' || !filename) { console.error('Usage: node scripts/perf/paired.mjs paired <profile.json>'); process.exitCode = 1; }
  else loadPairedProfile(filename).then(runPaired).then(result => console.log(`配對微量測已保存：${result.output}`)).catch(error => { console.error(error.stack); process.exitCode = 1; });
}
