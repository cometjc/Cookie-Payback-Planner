import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {connect} from './cdp.mjs';
import {gameProcesses, inspectInstance} from './process.mjs';
import {verifyIsolation} from './isolation.mjs';
import {loadComparisonProfile} from './compare.mjs';
import {hash, statistics} from './report.mjs';

// Serialized into Electron. Assign only the refresh implementation; keep caches and scheduling.
export function beginCrossover(seed, candidate = 'indexed') {
  if (!['indexed', 'building-cache', 'building-model', 'production-projection'].includes(candidate)) throw Error('Unknown crossover candidate');
  if (globalThis.__cppCrossover) throw Error('Crossover already installed');
  const p = Object.values(Game.mods).find(m => m?.modId === 'BestDealHelper');
  const api = p?.performanceExperiment, descriptor = api && Object.getOwnPropertyDescriptor(api, 'current');
  if (!Game.ready || !p?.isLoaded || p.isDisposed || document.visibilityState !== 'visible' ||
      !descriptor?.writable || descriptor.value !== 'baseline') throw Error('Visible ready baseline with supported experiment layout required');
  const originalCacheFlag = api.buildingCpsCacheEnabled;
  const originalModelFlag = api.buildingCpsModelEnabled;
  const originalProjectionFlag = api.productionProjectionEnabled;
  const projectionCandidate = candidate === 'production-projection';
  if (projectionCandidate && typeof originalProjectionFlag !== 'boolean') throw Error('Production projection API required');
  const buildingCandidate = candidate === 'building-cache' || candidate === 'building-model';
  if (buildingCandidate && typeof originalCacheFlag !== 'boolean') throw Error('Building cache API required');
  if (candidate === 'building-model' && typeof originalModelFlag !== 'boolean') throw Error('Building model API required');
  const original = p.updateUI, samples = [], frames = [], pending = [];
  let truncated = false;
  let hidden = false;
  const visibility = () => { if (document.visibilityState !== 'visible') hidden = true; };
  document.addEventListener('visibilitychange', visibility);
  let state = seed >>> 0, order = [], previous, raf;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const wrapped = function (...args) {
    if (!order.length) order = random() < .5 ? ['baseline', 'indexed'] : ['indexed', 'baseline'];
    const id = order.pop(), before = api.current, start = performance.now();
    if (buildingCandidate) {
      api.buildingCpsCacheEnabled = id === 'indexed';
      api.buildingCpsModelEnabled = candidate === 'building-model';
    }
    else if (projectionCandidate) api.productionProjectionEnabled = id === 'indexed';
    else api.current = id;
    let failed = false;
    try { return original.apply(this, args); }
    catch (error) { failed = true; throw error; }
    finally {
      api.current = before;
      if (projectionCandidate) api.productionProjectionEnabled = originalProjectionFlag;
      if (buildingCandidate) {
        api.buildingCpsCacheEnabled = originalCacheFlag;
        if (originalModelFlag === undefined) delete api.buildingCpsModelEnabled;
        else api.buildingCpsModelEnabled = originalModelFlag;
      }
      const sample = {id, at: start, ms: performance.now() - start, failed};
      if (samples.length < 100000) { samples.push(sample); pending.push(id); } else truncated = true;
    }
  };
  const frame = () => {
    const now = performance.now();
    if (previous !== undefined && frames.length < 100000) frames.push({ms: now - previous, variants: pending.splice(0)});
    else { if (previous !== undefined) truncated = true; pending.length = 0; }
    previous = now; raf = requestAnimationFrame(frame);
  };
  p.updateUI = wrapped; raf = requestAnimationFrame(frame);
  globalThis.__cppCrossover = {samples, frames, stop() {
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', visibility);
    if (p.updateUI === wrapped) p.updateUI = original;
    delete globalThis.__cppCrossover;
    return {samples, frames, candidate, truncated, hidden, visible: document.visibilityState, restored: p.updateUI === original,
      projectionSupportedCandidates: api.projectionSupportedCandidates, projectionFallbackReasons: api.projectionFallbackReasons};
  }};
  return true;
}
export function endCrossover() { return globalThis.__cppCrossover?.stop() || null; }

async function main(filename) {
  const p = await loadComparisonProfile(filename), iso = await verifyIsolation(p.isolationRoot);
  const assertOriginalStopped = async () => { if ((await gameProcesses(path.join(iso.sourceRoot, 'Cookie Clicker.exe'))).length) throw Error('Original game must be stopped'); };
  await assertOriginalStopped();
  const sha256 = hash(await readFile(path.join(iso.targetRoot, 'resources/app/mods/workshop/BestDealHelper/main.js')));
  if (!p.expectedPlannerSha256 || p.expectedPlannerSha256 !== sha256) throw Error('Explicit matching expectedPlannerSha256 required');
  p.executable = iso.gameExe;
  const session = await inspectInstance(p), c = await connect(session.target);
  const output = path.join(p.output, `crossover-${Date.now()}`), report = {sha256, process: session.processes[0], rounds: [],
    scope: 'Randomized adjacent natural updates share live state and caches; no identical-snapshot or long-term quality guarantee. Frame callback gaps include instrumentation.'};
  await mkdir(output, {recursive: true});
  try {
    report.metadata = await c.evaluate(`(()=>{const p=Object.values(Game.mods).find(m=>m?.modId==='BestDealHelper');return {version:Game.version,mods:Object.keys(Game.mods),config:p.config};})()`);
    for (let round = 0; round < p.repetitions; round++) {
      await assertOriginalStopped();
      const current = await inspectInstance(p);
      if (current.target.id !== session.target.id || current.processes[0].ProcessId !== session.processes[0].ProcessId || current.processes[0].CreationDate !== session.processes[0].CreationDate) throw Error('Instance changed');
      console.log(`Crossover ${round + 1}/${p.repetitions}: warmup`);
      await new Promise(r => setTimeout(r, p.warmupMs));
      await c.evaluate(`(${beginCrossover})(${p.seed + round},${JSON.stringify(p.crossoverCandidate || 'indexed')})`);
      console.log(`Crossover ${round + 1}/${p.repetitions}: sample`);
      await new Promise(r => setTimeout(r, p.sampleMs));
      const raw = await c.evaluate(`(${endCrossover})()`);
      await writeFile(path.join(output, `round-${round}.json`), JSON.stringify(raw, null, 2));
      if (!raw?.restored || raw.truncated || raw.hidden || raw.visible !== 'visible' || !raw.frames.length || raw.samples.some(x => x.failed) ||
          ['baseline', 'indexed'].some(id => !raw.samples.some(x => x.id === id))) throw Error('Invalid crossover observation');
      const summary = ['baseline','indexed'].map(id => ({id, updates: statistics(raw.samples.filter(x=>x.id===id).map(x=>x.ms)),
        affectedFrames: statistics(raw.frames.filter(x=>x.variants.length===1 && x.variants[0]===id).map(x=>x.ms))}));
      report.rounds.push({round, raw, summary});
      await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
      console.log(JSON.stringify(summary));
    }
    console.log(output);
  } finally { try { await c.evaluate(`(${endCrossover})()`); } finally { c.close(); } }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv[2]).catch(e=>{console.error(e);process.exitCode=1;});
