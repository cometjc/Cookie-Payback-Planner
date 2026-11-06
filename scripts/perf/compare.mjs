import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { verifyIsolation, resetIsolationSave } from './isolation.mjs';
import { gameProcesses, inspectInstance, startOwned, stopOwned } from './process.mjs';
import { connect } from './cdp.mjs';
import { collect } from './run.mjs';
import { schedule, compareIdentity, validateSample, hash } from './report.mjs';

const ids = ['baseline', 'indexed', 'compiled', 'search'];
const languages = ['EN', 'FR', 'DE', 'NL', 'CS', 'PL', 'IT', 'ES', 'PT-BR', 'JA', 'ZH-CN', 'KO', 'RU', 'DA', 'NO'];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const json = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
const exec = promisify(execFile);

export async function loadComparisonProfile(filename) {
  const base = path.dirname(path.resolve(filename));
  const profile = JSON.parse(await readFile(filename, 'utf8'));
  if (!profile.isolationRoot) throw new Error('isolationRoot is required');
  profile.isolationRoot = path.resolve(base, profile.isolationRoot);
  if (profile.sourceRoot) profile.sourceRoot = path.resolve(base, profile.sourceRoot);
  profile.output = path.resolve(base, profile.output || '../../tmp/perf-comparison');
  profile.debugOrigin ||= 'http://127.0.0.1:9222';
  profile.language ??= 'ZH-CN';
  if (!languages.includes(profile.language)) throw new Error('Unsupported comparison language');
  profile.warmupMs ??= 15000; profile.sampleMs ??= 60000;
  profile.repetitions ??= 3; profile.seed ??= 20261101; profile.readyTimeoutMs ??= 90000;
  profile.variants ??= ids.map(id => ({ id, builtin: true }));
  if (profile.expectedPlannerSha256 !== undefined && !/^[a-f0-9]{64}$/.test(profile.expectedPlannerSha256)) throw new Error('Invalid expectedPlannerSha256');
  if (profile.buyBulk !== undefined && ![1, 10, 100].includes(profile.buyBulk)) throw new Error('Invalid buyBulk');
  if (profile.observeGains !== undefined && typeof profile.observeGains !== 'boolean') throw Error('Invalid observeGains');
  for (const key of ['warmupMs', 'sampleMs', 'repetitions', 'seed', 'readyTimeoutMs']) {
    if (!Number.isInteger(profile[key]) || profile[key] < (['warmupMs', 'seed'].includes(key) ? 0 : 1)) throw new Error(`Invalid ${key}`);
  }
  const variants = profile.variants.map(item => item.id);
  if (!variants.length || new Set(variants).size !== variants.length || variants.some(id => !ids.includes(id))) throw new Error('Invalid comparison variants');
  if (profile.variants.some(item => item.hook || item.builtin !== true)) throw new Error('Isolated comparison requires built-in experiment variants');
  return profile;
}

/** Handle only the game's known first-launch language screen, never generic dialogs. */
export function readinessProbe(language, allowLanguageBootstrap = true) {
  const game = globalThis.Game;
  const planner = Object.values(game?.mods || {}).find(m => m?.modId === 'BestDealHelper' || m?.name === 'Best Deal Helper');
  const result = { ready: !!(game?.ready && planner?.isLoaded && typeof planner.performanceExperiment?.setVariant === 'function'), languageClicked: false, language };
  if (!game?.ready && allowLanguageBootstrap && globalThis.Langs && Object.prototype.hasOwnProperty.call(globalThis.Langs, language)) {
    const button = document.getElementById(`langSelect-${language}`);
    if (button?.classList.contains('langSelectButton') && typeof button.click === 'function') {
      button.click();
      result.languageClicked = true;
    }
  }
  return result;
}

export async function waitReady(profile, timeoutMs = 90000, dependencies = {}) {
  const deps = { inspectInstance, connect, sleep, now: Date.now, ...dependencies };
  const language = profile.language ?? 'ZH-CN';
  if (!languages.includes(language)) throw new Error('Unsupported comparison language');
  const deadline = deps.now() + timeoutMs;
  let languageSelected = false;
  let lastEvaluationError, lastTransportError, lastReadiness;
  while (deps.now() < deadline) {
    let cdp;
    let stage = 'inspect';
    try {
      const session = await deps.inspectInstance(profile);
      stage = 'connect';
      cdp = await deps.connect(session.target, Math.min(5000, Math.max(1, deadline - deps.now())));
      stage = 'evaluate';
      const readiness = await cdp.evaluate(`(${readinessProbe.toString()})(${JSON.stringify(language)},${!languageSelected})`);
      if (!readiness || typeof readiness.ready !== 'boolean') throw new Error('Invalid readiness probe response');
      lastReadiness = readiness;
      if (readiness.languageClicked) languageSelected = true;
      if (readiness.ready) return session;
    } catch (error) {
      if (stage === 'evaluate') lastEvaluationError = error;
      else lastTransportError = error;
    }
    finally { cdp?.close(); }
    await deps.sleep(Math.min(1000, Math.max(0, deadline - deps.now())));
  }
  const error = new Error(`Game and planner readiness timed out; probe: ${lastEvaluationError?.message || 'no evaluation exception'}; transport: ${lastTransportError?.message || 'no transport exception'}; state: ${JSON.stringify(lastReadiness || null)}`, { cause: lastEvaluationError || lastTransportError });
  error.diagnostics = { language, languageSelected, lastReadiness,
    lastEvaluationError: lastEvaluationError?.stack, lastTransportError: lastTransportError?.stack };
  throw error;
}

/** Restore only the process whose ownership receipt matches this trial. */
export async function ensureVisible(profile, ownerFile, dependencies = {}) {
  const deps = { gameProcesses, inspectInstance, connect, exec, sleep, ...dependencies };
  const owner = JSON.parse(await readFile(ownerFile, 'utf8'));
  const matching = (await deps.gameProcesses(profile.executable)).filter(row => row.ProcessId === owner.ProcessId && row.CreationDate === owner.CreationDate);
  if (matching.length !== 1 || path.resolve(owner.executable).toLowerCase() !== path.resolve(profile.executable).toLowerCase()) throw new Error('Visibility restore refused: owned process identity mismatch');
  const pid = Number(owner.ProcessId);
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Invalid owned PID');
  await deps.exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class CppPerfWindow { [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h,int c); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); }'; $p=Get-Process -Id ${pid} -ErrorAction Stop; $p.Refresh(); if($p.MainWindowHandle -eq 0){throw 'Owned game window not ready'}; [void][CppPerfWindow]::ShowWindowAsync($p.MainWindowHandle,9); [void][CppPerfWindow]::SetForegroundWindow($p.MainWindowHandle);`],
  { windowsHide: true, timeout: 15000 });
  const session = await deps.inspectInstance(profile);
  const cdp = await deps.connect(session.target);
  try {
    await cdp.send('Page.bringToFront');
    for (let attempt = 0; attempt < 20; attempt++) {
      const state = await cdp.evaluate(`({visibility:document.visibilityState,focused:document.hasFocus(),ready:!!globalThis.Game?.ready})`);
      if (state.visibility === 'visible' && state.ready) return { ...state, processId: pid };
      await deps.sleep(250);
    }
    throw new Error('Owned game did not become visible and ready; trial rejected');
  } finally { cdp.close(); }
}

export function measurementValidity(entry) {
  const summary = entry.summary || {};
  const checked = validateSample(entry.before || {}, entry.after || {}, { ...summary, timings: summary.timings || {}, frames: summary.frames || {} });
  const reasons = [...checked.reasons];
  if (entry.sampleValidity?.valid === false) {
    reasons.push(...(entry.sampleValidity.reasons?.length ? entry.sampleValidity.reasons : ['收集器已將此樣本標為無效']));
  }
  return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}

/** Serialized into the isolated renderer; no async gap while the clock is fixed. */
export function qualityCheckpoint() {
  const p = Object.values(Game.mods).find(m => m?.modId === 'BestDealHelper' || m?.name === 'Best Deal Helper');
  if (!p?.performanceExperiment) throw new Error('Experiment API missing');
  const api = p.performanceExperiment;
  const originalVariant = api.variant;
  const originalNow = Date.now;
  const fixedNow = originalNow();
  const encode = n => typeof n === 'number' && !Number.isFinite(n) ? String(n) : n ?? null;
  const state = () => JSON.stringify({
    cookies: Game.cookies, earned: Game.cookiesEarned, cps: Game.cookiesPs, unbuffed: Game.unbuffedCps,
    clicks: Game.cookieClicks, ascensions: Game.resets, bulk: Game.buyBulk, mode: Game.buyMode,
    buildings: Game.ObjectsById.map(x => [x.id, x.amount, x.bought, x.level]),
    upgrades: Object.values(Game.Upgrades).map(x => [x.id, x.bought, x.unlocked]),
    buffs: Object.entries(Game.buffs || {}).map(([k, x]) => [k, x.time, x.multCpS, x.multCps, x.multClick, x.multClicks, x.multMouse]),
    aura: [Game.dragonAura, Game.dragonAura2], season: Game.season,
  });
  const result = { fixedNow, tolerance: 1e-10, variants: [], stateStable: true,
    note: 'Synchronous checkpoint; it does not prove identical long-term outcomes or restore arbitrary mod hook side effects.' };
  try {
    Date.now = () => fixedNow;
    const initial = state();
    for (const id of ['baseline', 'indexed', 'compiled', 'search']) {
      const before = state();
      if (before !== initial) { result.stateStable = false; result.error = `State changed before ${id}`; break; }
      api.setVariant(id);
      p.updateUI();
      const all = [...Game.ObjectsById, ...Game.UpgradesInStore];
      result.variants.push({ id, stateUnchanged: state() === initial,
        items: all.map(x => ({ token: `${x.type}:${x.id}`, score: encode(x.BestCpsAcceleration), wait: encode(x.BestWaitTime), amount: encode(x.BestBuyToAmount) })),
        ranking: [...(p.strategyState?.scoreByItem || [])].sort((a, b) => b[1] - a[1]).map(([token, score]) => ({ token, score: encode(score) })),
        buildingOrder: [...p.lastSortedBuildingTokens], upgradeOrder: [...p.lastSortedUpgradeTokens],
        autoBuyBestCandidateToken: typeof p.autoBuyBestCandidateToken === 'string' ? p.autoBuyBestCandidateToken : null,
        budget: { timeouts: p.strategyState?.timeoutCount, hits: p.strategyState?.budgetHitCount },
        metadata: api.metadata });
      if (state() !== initial) { result.stateStable = false; result.error = `Game state changed during ${id}`; break; }
    }
  } finally {
    Date.now = originalNow;
    api.restore();
    if (originalVariant !== 'baseline') api.setVariant(originalVariant);
  }
  return result;
}

export function assessQuality(checkpoint) {
  const base = checkpoint.variants.find(item => item.id === 'baseline');
  const close = (a, b) => Object.is(a, b) || typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)
    && Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(a), Math.abs(b));
  const checks = checkpoint.variants.filter(item => item.id !== 'baseline').map(item => {
    const lookup = new Map(item.items.map(x => [x.token, x]));
    const differences = !base ? ['baseline missing'] : base.items.flatMap(x => {
      const other = lookup.get(x.token);
      return !other ? [`${x.token}:missing`] : ['score', 'wait', 'amount'].filter(key => !close(x[key], other[key])).map(key => `${x.token}:${key}`);
    });
    if (base && item.items.length !== base.items.length) differences.push('item count');
    const numericMatches = differences.length === 0;
    const rankingMatches = !!base && JSON.stringify(item.ranking.map(x => x.token)) === JSON.stringify(base.ranking.map(x => x.token));
    const utilityMatches = !!base && item.ranking.length === base.ranking.length && item.ranking.every((x, i) => x.token === base.ranking[i].token && close(x.score, base.ranking[i].score));
    const numericCoverage = base?.items.filter(x => typeof x.score === 'number' && Number.isFinite(x.score)).length || 0;
    const orderMatches = key => !!base && Array.isArray(base[key]) && Array.isArray(item[key]) && JSON.stringify(base[key]) === JSON.stringify(item[key]);
    const buildingOrderMatches = orderMatches('buildingOrder');
    const upgradeOrderMatches = orderMatches('upgradeOrder');
    const autoBuyCandidateAvailable = !!base && (Object.hasOwn(base, 'autoBuyBestCandidateToken') || Object.hasOwn(item, 'autoBuyBestCandidateToken'));
    const autoBuyCandidateMatches = !autoBuyCandidateAvailable || Object.hasOwn(base, 'autoBuyBestCandidateToken') && Object.hasOwn(item, 'autoBuyBestCandidateToken') && base.autoBuyBestCandidateToken === item.autoBuyBestCandidateToken;
    if (!buildingOrderMatches) differences.push('buildingOrder');
    if (!upgradeOrderMatches) differences.push('upgradeOrder');
    if (!autoBuyCandidateMatches) differences.push('autoBuyBestCandidateToken');
    return { id: item.id, numericMatches, rankingMatches, utilityMatches, buildingOrderMatches, upgradeOrderMatches,
      autoBuyCandidateAvailable, autoBuyCandidateMatches, differences,
      numericCoverage, totalItems: base?.items.length || 0,
      accepted: checkpoint.stateStable && item.stateUnchanged && numericCoverage > 0 && differences.length === 0 && rankingMatches && utilityMatches };
  });
  return { stateStable: checkpoint.stateStable, checks, exactVariantsPass: checkpoint.stateStable && ['indexed', 'compiled'].every(id => checks.find(x => x.id === id)?.accepted === true), searchIsObservation: true };
}

async function runQuality(profile) {
  const session = await inspectInstance(profile);
  const cdp = await connect(session.target);
  try { const checkpoint = await cdp.evaluateJson(`(${qualityCheckpoint.toString()})()`); return { checkpoint, assessment: assessQuality(checkpoint) }; }
  finally { cdp.close(); }
}

export function selectBuyBulk(bulk) {
  if (![1, 10, 100].includes(bulk)) throw Error('Invalid buyBulk');
  if (!Game.ready || document.visibilityState !== 'visible') throw Error('Visible ready game required');
  Game.storeBulkButton(0);
  Game.storeBulkButton({1: 2, 10: 3, 100: 4}[bulk]);
  if (Game.buyMode !== 1 || Game.buyBulk !== bulk) throw Error('Purchase bulk selection failed');
  return {buyMode: Game.buyMode, buyBulk: Game.buyBulk};
}

async function applyBuyBulk(profile) {
  const cdp = await connect((await inspectInstance(profile)).target);
  try { return await cdp.evaluate(`(${selectBuyBulk.toString()})(${profile.buyBulk})`); }
  finally { cdp.close(); }
}

export function comparisonMarkdown(report) {
  const lines = ['# 隔離遊戲效能比較', '', `暖機 ${report.profile.warmupMs} ms；量測 ${report.profile.sampleMs} ms；每方案 ${report.profile.repetitions} 次。`,
    '', '相同存檔雜湊不代表執行期狀態相同。下表跨所有試驗核對狀態、設定、模組與程式雜湊；不一致資料僅供觀測，未自動選定勝者。', '',
    '|方案|次數|跨試驗可比較|數值／排序品質|更新 p95 ms|更新最大 ms|畫格 p99 ms|', '|---|---:|---|---|---:|---:|---:|'];
  for (const run of report.runs) lines.push(`|${run.id}|${run.repeat}|${run.identity?.comparable ? '是' : `否：${run.identity?.differences?.join(', ') || '基準缺失'}`}|${run.quality?.assessment.exactVariantsPass ? '精確方案通過' : '未通過／無資料'}|${run.summary.timings.updateUI?.p95 ?? '無資料'}|${run.summary.timings.updateUI?.max ?? '無資料'}|${run.summary.frames.p99 ?? '無資料'}|`);
  if (report.failure) lines.push('', `執行中止：${report.failure}`);
  for (const trial of report.invalidTrials || []) lines.push('', `無效試驗 ${trial.id} #${trial.repeat}：${trial.validity.reasons.join(', ')}`);
  lines.push('', 'Steam 原生 bridge 已於隔離副本停用；正式存檔不作試驗重置。品質檢查完整資料位於各試驗 JSON。');
  return lines.join('\n');
}

export async function runComparison(profile, dependencies = {}) {
  profile = { language: 'ZH-CN', ...profile };
  if (!languages.includes(profile.language)) throw new Error('Unsupported comparison language');
  if (profile.buyBulk !== undefined && ![1, 10, 100].includes(profile.buyBulk)) throw new Error('Invalid buyBulk');
  const deps = { verifyIsolation, resetIsolationSave, gameProcesses, startOwned, stopOwned, waitReady, ensureVisible, collect, runQuality, applyBuyBulk, ...dependencies };
  const isolation = await deps.verifyIsolation(profile.isolationRoot);
  if (profile.expectedPlannerSha256) {
    const bundle = path.join(isolation.targetRoot, 'resources/app/mods/workshop/BestDealHelper/main.js');
    if (hash(await readFile(bundle)) !== profile.expectedPlannerSha256) throw new Error('Isolated planner bundle hash mismatch');
  }
  if (JSON.stringify(isolation.requiredLaunchArgs) !== JSON.stringify([`--user-data-dir=${isolation.userDataDir}`])) throw new Error('Unexpected isolation launch arguments');
  if ((profile.launchArgs || []).some(arg => typeof arg !== 'string' || !arg.startsWith('--') || /^--(?:user-data-dir|app|remote-debugging-port)(?:=|$)/.test(arg))) throw new Error('Unsafe comparison launch argument');
  if (profile.sourceRoot && path.resolve(profile.sourceRoot).toLowerCase() !== path.resolve(isolation.sourceRoot).toLowerCase()) throw new Error('sourceRoot does not match verified isolation');
  const originalExe = path.join(isolation.sourceRoot, 'Cookie Clicker.exe');
  const assertStopped = async executable => { if ((await deps.gameProcesses(executable)).length) throw new Error(`Game must already be stopped: ${executable}`); };
  await assertStopped(originalExe);
  await assertStopped(isolation.gameExe);
  const output = path.join(profile.output, `comparison-${new Date().toISOString().replaceAll(':', '-')}`);
  await mkdir(output, { recursive: true });
  const order = schedule(profile.variants.map(item => item.id), profile.repetitions, profile.seed);
  const report = { format: 'cpp-comparison-v1', profile, isolation, order, runs: [], invalidTrials: [], winner: null, complete: false };
  await json(path.join(output, 'profile.json'), profile);
  await json(path.join(output, 'isolation.json'), isolation);
  await json(path.join(output, 'schedule.json'), order);
  const saveReport = async () => {
    const baseline = report.runs.find(run => run.id === 'baseline');
    for (const run of report.runs) run.identity = baseline ? compareIdentity(run.before, baseline.before) : { comparable: false, differences: ['baseline missing'] };
    await json(path.join(output, 'report.json'), report);
    await writeFile(path.join(output, 'report.md'), comparisonMarkdown(report));
  };
  try {
    for (const [index, run] of order.entries()) {
      console.log(`隔離試驗 ${index + 1}/${order.length}：${run.id} #${run.repeat}`);
      await assertStopped(originalExe);
      await assertStopped(isolation.gameExe);
      await deps.verifyIsolation(profile.isolationRoot);
      await deps.resetIsolationSave(profile.isolationRoot, { stopped: true });
      const trialRoot = path.join(output, `${String(index + 1).padStart(2, '0')}-${run.id}-${run.repeat}`);
      await mkdir(trialRoot, { recursive: true });
      const trial = { ...profile, executable: isolation.gameExe, output: trialRoot, repetitions: 1,
        launchArgs: [...isolation.requiredLaunchArgs, ...(profile.launchArgs || [])], variants: [profile.variants.find(item => item.id === run.id)] };
      const ownerFile = path.join(trialRoot, 'owned-process.json');
      await json(path.join(trialRoot, 'profile.json'), trial);
      let owned = false, primaryError;
      try {
        await deps.startOwned(trial, ownerFile); owned = true;
        await deps.waitReady(trial, profile.readyTimeoutMs);
        const visibility = await deps.ensureVisible(trial, ownerFile);
        await json(path.join(trialRoot, 'visibility.json'), visibility);
        if (profile.buyBulk !== undefined) await json(path.join(trialRoot, 'buy-bulk.json'), await deps.applyBuyBulk(trial));
        const quality = await deps.runQuality(trial);
        await json(path.join(trialRoot, 'quality.json'), quality);
        if (!quality.checkpoint.stateStable) throw new Error('Quality checkpoint changed gameplay state; trial rejected');
        await assertStopped(originalExe);
        const result = await deps.collect(trial);
        await assertStopped(originalExe);
        if (result.report.runs.length !== 1) throw new Error('Expected exactly one collected run per isolated process');
        const entry = { ...result.report.runs[0], ...run, quality, output: result.output };
        entry.validity = measurementValidity(entry);
        if (!entry.validity.valid) {
          report.invalidTrials.push({ ...run, output: result.output, validity: entry.validity });
          await json(path.join(trialRoot, 'invalid.json'), entry);
          throw new Error(`Invalid measurement: ${entry.validity.reasons.join(', ')}`);
        }
        report.runs.push(entry);
        await json(path.join(trialRoot, 'trial.json'), entry);
      } catch (error) {
        primaryError = error;
        await json(path.join(trialRoot, 'failure.json'), { error: error.stack || error.message, diagnostics: error.diagnostics });
        throw error;
      } finally {
        if (owned) {
          try { await deps.stopOwned(trial, ownerFile); }
          catch (error) {
            await json(path.join(trialRoot, 'cleanup-failure.json'), { error: error.stack || error.message, primaryError: primaryError?.stack });
            if (primaryError) throw new AggregateError([primaryError, error], `Trial failed and owned-process cleanup failed: ${primaryError.message}; ${error.message}`);
            throw error;
          }
        }
      }
      await saveReport();
    }
    report.complete = true;
    await saveReport();
    return { output, report };
  } catch (error) {
    report.failure = error.stack || error.message;
    report.failureDiagnostics = error.diagnostics;
    await saveReport();
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, filename] = process.argv.slice(2);
  if (command !== 'compare' || !filename) { console.error('Usage: node scripts/perf/compare.mjs compare <profile.json>'); process.exitCode = 1; }
  else loadComparisonProfile(filename).then(runComparison).then(result => console.log(`比較資料已保存：${result.output}`)).catch(error => { console.error(error.stack); process.exitCode = 1; });
}
