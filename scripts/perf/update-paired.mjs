import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {connect} from './cdp.mjs';
import {gameProcesses, inspectInstance} from './process.mjs';
import {verifyIsolation} from './isolation.mjs';
import {loadComparisonProfile} from './compare.mjs';
import {hash, schedule, statistics} from './report.mjs';
import {installBatchCandidate} from './batch-candidate.mjs';

/** One synchronous round: the game loop cannot advance between variants. */
export function updatePair(order, installCandidate) {
  const batch = Array.isArray(order) && order.length === 2 && order.includes('batch');
  const projection = Array.isArray(order) && order.length === 2 && order.includes('production-projection');
  const allowed = batch ? ['baseline', 'batch'] : projection ? ['baseline', 'production-projection'] : ['baseline', 'indexed', 'compiled', 'search'];
  if (!Array.isArray(order) || order.length !== allowed.length || new Set(order).size !== allowed.length || order.some(id => !allowed.includes(id))) throw Error('Invalid variant order');
  if (batch && typeof installCandidate !== 'function') throw Error('Explicit isolation candidate installer required');
  const p = Object.values(Game.mods).find(m => m?.modId === 'BestDealHelper');
  if (!Game.ready || !p?.isLoaded || p.isDisposed || document.visibilityState !== 'visible') throw Error('Visible ready planner required');
  const api = p.performanceExperiment, originalVariant = api.variant, originalNow = Date.now, click = p.smoothedClickCps;
  const originalProjection = api.productionProjectionEnabled;
  if (projection && typeof originalProjection !== 'boolean') throw Error('Projection API required');
  const now = originalNow(), config = JSON.parse(JSON.stringify(p.config));
  const state = () => JSON.stringify({cookies: Game.cookies, earned: Game.cookiesEarned, cps: Game.cookiesPs, raw: Game.cookiesPsRaw, unbuffed: Game.unbuffedCps,
    resets: Game.resets, bulk: Game.buyBulk, mode: Game.buyMode, clicks: Game.cookieClicks,
    buildings: Game.ObjectsById.map(x => [x.id, x.amount, x.bought, x.level]),
    upgrades: Object.values(Game.Upgrades).map(x => [x.id, x.bought, x.unlocked]),
    buffs: Object.entries(Game.buffs || {}).map(([k, x]) => [k, x.time, x.multCpS, x.multCps, x.multClick, x.multClicks, x.multMouse]),
    aura: [Game.dragonAura, Game.dragonAura2], season: Game.season});
  const encode = (_key, value) => typeof value === 'number' && !Number.isFinite(value) ? String(value) : value;
  const capture = () => JSON.parse(JSON.stringify({items: [...Game.ObjectsById, ...Game.UpgradesInStore].map(x => [x.type, x.id, x.BestCpsAcceleration, x.BestWaitTime, x.BestBuyToAmount, x.BestHelperOrder, x.BestHelperAmount]),
    strategy: [...p.strategyState.scoreByItem], buildings: p.lastSortedBuildingTokens, upgrades: p.lastSortedUpgradeTokens, first: p.autoBuyBestCandidateToken,
    top: p.autoBuyTopCandidates?.slice(0, 3).map(x => ({token: x.token, score: x.score, waitSec: x.waitSec})),
    purchase: p.autoBuyTopCandidates?.slice(0, 3).map(x => {
      const price = x.item.getPrice(), bank = p.getBankCookies();
      return {token: x.token, price, bank, cookies: Game.cookies,
        affordable: Game.cookies >= price + bank, ready: p.estimateWaitSeconds(price, Game.cookies, Game.unbuffedCps) === 0,
        target: x.item.BestBuyToAmount};
    })}, encode));
  const runs = [];
  let batchCandidate;
  try {
    if (batch) batchCandidate = installCandidate(Game, p);
    Date.now = () => now;
    if (Game.recalculateGains) Game.CalculateGains();
    const initial = state();
    for (const id of order) {
      api.setVariant(projection || batch ? 'baseline' : id); p.smoothedClickCps = click;
      if (projection) api.productionProjectionEnabled = id === 'production-projection';
      if (batch) {api.productionProjectionEnabled = false; batchCandidate.setEnabled(id === 'batch');}
      if (state() !== initial) throw Error('State changed before variant');
      const supportedBefore = batch ? batchCandidate.supported : api.projectionSupportedCandidates || 0;
      const start = performance.now(); p.updateUI(); const ms = performance.now() - start;
      const unchanged = state() === initial;
      runs.push({id, ms, unchanged, quality: capture(), supported: (batch ? batchCandidate.supported : api.projectionSupportedCandidates || 0) - supportedBefore, timeouts: p.strategyState.timeoutCount, budgetHits: p.strategyState.budgetHitCount});
      if (!unchanged) {
        const before = JSON.parse(initial), after = JSON.parse(state());
        const fields = Object.keys(before).filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
        throw Error('Update mutated gameplay state: ' + fields.join(', '));
      }
    }
    return {runs, stateShaInput: initial, mods: Object.keys(Game.mods), version: Game.version, config,
      note: 'Forced cold-cache synchronous updates; not natural frames. Unknown mod side effects are not fully fingerprinted.'};
  } finally {
    batchCandidate?.restore();
    Date.now = originalNow; api.restore(); if (originalVariant !== 'baseline') api.setVariant(originalVariant); p.smoothedClickCps = click;
    if (projection || batch) api.productionProjectionEnabled = originalProjection;
  }
}

export function assessUpdatePair(round) {
  const baseline = round.runs.find(x => x.id === 'baseline');
  const complete = q => q && ['items', 'strategy', 'buildings', 'upgrades'].every(k => Array.isArray(q[k])) && typeof q.first === 'string';
  const same = (a, b) => typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(a), Math.abs(b))
    : Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((v, i) => same(v, b[i]))
    : a && b && typeof a === 'object' && typeof b === 'object' ? Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => same(a[k], b[k])) : Object.is(a, b);
  if (round.runs.some(r => r.id === 'production-projection')) {
    const candidate = round.runs.find(r => r.id === 'production-projection');
    return {exactPass: round.runs.length === 2 && !!baseline && baseline.unchanged && candidate.unchanged
      && candidate.supported > 0 && complete(baseline.quality) && complete(candidate.quality) && same(candidate.quality, baseline.quality)};
  }
  return {exactPass: round.runs.length === 4 && new Set(round.runs.map(x => x.id)).size === 4 && !!baseline && ['baseline', 'indexed', 'compiled'].every(id => {
    const run = round.runs.find(x => x.id === id); return run?.unchanged && complete(run.quality) && same(run.quality, baseline.quality);
  }), searchEquivalent: !!baseline && round.runs.find(x => x.id === 'search')?.unchanged === true && same(round.runs.find(x => x.id === 'search')?.quality, baseline.quality)};
}

/** Ranking acceptance is separate from numerical equivalence and purchase safety. */
export function assessTopThree(round, candidateId) {
  const baseline = round.runs.find(r => r.id === 'baseline');
  const candidate = round.runs.find(r => r.id === candidateId);
  const valid = run => run?.unchanged === true && Array.isArray(run.quality?.top)
    && run.quality.top.length === 3 && new Set(run.quality.top.map(x => x.token)).size === 3
    && run.quality.top.every(x => typeof x.token === 'string' && x.token.length > 0
      && Number.isFinite(x.score) && x.score > 0
      && (Number.isFinite(x.waitSec) && x.waitSec >= 0 || x.waitSec === 'Infinity'));
  const hasEvidence = valid(baseline) && valid(candidate);
  return {topThreePass: !!hasEvidence && baseline.quality.top.every((x, i) => x.token === candidate.quality.top[i].token),
    purchaseSafety: 'not-assessed'};
}

export function assessPurchaseDecision(round, candidateId) {
  const baseline = round.runs.find(r => r.id === 'baseline');
  const candidate = round.runs.find(r => r.id === candidateId);
  const valid = run => run?.unchanged === true && Array.isArray(run.quality?.purchase)
    && run.quality.purchase.length === 3 && run.quality.purchase.every(x => typeof x.token === 'string'
      && ['price', 'bank', 'cookies', 'target'].every(k => Number.isFinite(x[k]) && x[k] >= 0)
      && typeof x.affordable === 'boolean' && typeof x.ready === 'boolean');
  return {purchaseDecisionPass: !!(valid(baseline) && valid(candidate))
    && baseline.quality.purchase.every((x, i) => {
      const other = candidate.quality.purchase[i];
      return Object.keys(x).every(k => Object.is(x[k], other[k]));
    }), scope: 'Same-input purchase inputs and eligibility only; no actual buy executed'};
}

async function main(filename) {
  const profile = await loadComparisonProfile(filename), iso = await verifyIsolation(profile.isolationRoot);
  if ((await gameProcesses(path.join(iso.sourceRoot, 'Cookie Clicker.exe'))).length) throw Error('Original game must be stopped');
  const executable = iso.gameExe, bundle = path.join(iso.targetRoot, 'resources/app/mods/workshop/BestDealHelper/main.js');
  const sha256 = hash(await readFile(bundle));
  if (!profile.expectedPlannerSha256 || profile.expectedPlannerSha256 !== sha256) throw Error('Explicit matching expectedPlannerSha256 required');
  const session = await inspectInstance({...profile, executable});
  const c = await connect(session.target), output = path.join(profile.output, `updates-${Date.now()}`);
  await mkdir(output, {recursive: true});
  const report = {sha256, process: session.processes[0], rounds: [], scope: 'Synchronous cold-cache update pairing; no natural-frame or long-term quality claim.'};
  const affordableOnly = profile.crossoverCandidate === 'affordable-only';
  const batch = affordableOnly || profile.crossoverCandidate === 'batch';
  const variants = batch ? ['baseline', 'batch'] : profile.crossoverCandidate === 'production-projection' ? ['baseline', 'production-projection'] : ['baseline', 'indexed', 'compiled', 'search'];
  if (batch) {report.candidateSha256 = hash(installBatchCandidate.toString()); report.affordableOnly = affordableOnly;}
  try {
    for (let round = 0; round < 12; round++) {
      if ((await gameProcesses(path.join(iso.sourceRoot, 'Cookie Clicker.exe'))).length) throw Error('Original game started during pairing');
      const current = await inspectInstance({...profile, executable});
      if (current.target.id !== session.target.id || current.processes[0].ProcessId !== session.processes[0].ProcessId || current.processes[0].CreationDate !== session.processes[0].CreationDate) throw Error('Instance changed');
      const order = schedule(variants, 1, profile.seed + round).map(x => x.id);
      const installer = affordableOnly ? `((game,planner)=>(${installBatchCandidate.toString()})(game,planner,true))` : `(${installBatchCandidate.toString()})`;
      const raw = await c.evaluateJson(`(${updatePair.toString()})(${JSON.stringify(order)}${batch ? `,${installer}` : ''})`);
      const assessment = batch ? {...assessTopThree(raw, 'batch'), ...assessPurchaseDecision(raw, 'batch'), supported: raw.runs.find(r => r.id === 'batch')?.supported} : assessUpdatePair(raw);
      report.rounds.push({round, ...raw, assessment});
      await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
      if (batch ? !assessment.topThreePass || !assessment.purchaseDecisionPass || !(assessment.supported > 0) : !assessment.exactPass) throw Error(batch ? 'Top-three/purchase mismatch or no batch coverage' : 'Exact-variant quality mismatch');
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    report.summary = variants.map(id => ({id, timings: statistics(report.rounds.slice(2).map(r => r.runs.find(x => x.id === id).ms))}));
    await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({output, summary: report.summary,
      ...(batch ? {topThreePass: report.rounds.every(r => r.assessment.topThreePass), purchaseDecisionPass: report.rounds.every(r => r.assessment.purchaseDecisionPass)}
        : {exactPass: report.rounds.every(r => r.assessment.exactPass), searchEquivalent: report.rounds.every(r => r.assessment.searchEquivalent)})}));
  } finally {c.close();}
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv[2]).catch(error => {console.error(error); process.exitCode = 1;});
