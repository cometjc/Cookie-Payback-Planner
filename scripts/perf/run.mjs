import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { inspectInstance, startOwned, stopOwned } from './process.mjs';
import { connect } from './cdp.mjs';
import { snapshot, beginObservation, endObservation } from './browser.mjs';
import { hash, schedule, summarize, compareIdentity, validateSample, markdown } from './report.mjs';
import {observeUpdateCosts} from './candidate-cost.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const invoke = fn => `(${fn.toString()})()`;
const writeJson = (file, value) => writeFile(file, JSON.stringify(value, null, 2));

export async function loadProfile(file) {
  const base = path.dirname(path.resolve(file));
  const profile = JSON.parse(await readFile(file, 'utf8'));
  profile.executable = path.resolve(base, profile.executable);
  profile.output = path.resolve(base, profile.output || '../../tmp/perf');
  profile.debugOrigin ||= 'http://127.0.0.1:9222';
  profile.warmupMs ??= 15000; profile.sampleMs ??= 60000; profile.repetitions ??= 3; profile.seed ??= 20261101;
  profile.variants ??= [{ id: 'baseline' }];
  if (profile.observeGains !== undefined && typeof profile.observeGains !== 'boolean') throw Error('Invalid observeGains');
  if (profile.observeCandidates !== undefined && typeof profile.observeCandidates !== 'boolean') throw Error('Invalid observeCandidates');
  for (const key of ['warmupMs', 'sampleMs', 'repetitions', 'seed']) if (!Number.isInteger(profile[key]) || profile[key] < (key === 'warmupMs' || key === 'seed' ? 0 : 1)) throw new Error(`不合法設定：${key}`);
  const ids = profile.variants.map(variant => variant.id);
  if (ids.length !== new Set(ids).size || ids.some(id => !['baseline', 'indexed', 'compiled', 'search'].includes(id))) throw new Error('方案 ID 重複或不支援');
  for (const variant of profile.variants) {
    if (variant.id !== 'baseline' && !variant.hook && !variant.builtin) throw new Error(`${variant.id} 未提供實作 hook 或 builtin`);
    if (variant.hook) variant.hook = path.resolve(base, variant.hook);
  }
  return profile;
}

export function attachSummary(data, session, outputFile) {
  return { gameVersion: data.version, processId: session.processes[0].ProcessId,
    targetId: session.target.id, loadedModCount: data.mods.length,
    planner: data.planner, methodHashes: data.methodHashes,
    plannerScripts: data.scriptHashes.filter(item => /BestDealHelper/i.test(item.url)),
    metadataFile: outputFile };
}

export function assignBaselineIdentities(runs) {
  const baseline = runs.find(run => run.id === 'baseline');
  for (const run of runs) run.identity = baseline
    ? compareIdentity(run.before, baseline.before)
    : { comparable: false, differences: ['baseline missing'] };
}

async function metadata(cdp) {
  const result = await cdp.evaluateJson(invoke(snapshot));
  result.scriptHashes = [];
  for (const url of result.scripts) {
    if (!url.startsWith('file:')) continue;
    try {
      const parsed = new URL(url); parsed.search = ''; parsed.hash = '';
      const filename = fileURLToPath(parsed);
      result.scriptHashes.push({ url, filename, sha256: hash(await readFile(filename)) });
    } catch (error) { result.scriptHashes.push({ url, error: error.message }); }
  }
  result.methodHashes = Object.fromEntries(Object.entries(result.methodShape).map(([key, value]) => [key, hash(value)]));
  return result;
}

async function installVariant(cdp, variant) {
  if (variant.builtin) {
    return cdp.evaluate(`(()=>{
      if(globalThis.__cppPerfVariant)throw Error('variant already installed');
      const p=Object.values(Game.mods).find(m=>m?.modId==='BestDealHelper'||m?.name==='Best Deal Helper');
      const api=p?.performanceExperiment;
      if(!api||typeof api.setVariant!=='function'||typeof api.restore!=='function')throw Error('performanceExperiment API missing');
      globalThis.__cppPerfVariant={restore:()=>api.restore()};
      api.setVariant(${JSON.stringify(variant.id)});
      return {id:${JSON.stringify(variant.id)},implementation:'planner.performanceExperiment',metadata:api.metadata};
    })()`);
  }
  if (variant.id === 'baseline') return { id: 'baseline', implementation: 'attached-live-runtime' };
  const source = await readFile(variant.hook, 'utf8');
  const result = await cdp.evaluate(`(async()=>{
    if(globalThis.__cppPerfVariant)throw Error('variant already installed');
    const variant=(${source});
    if(variant.id!==${JSON.stringify(variant.id)}||!variant.implementation||typeof variant.apply!=='function'||typeof variant.restore!=='function')throw Error('Invalid variant contract');
    const planner=Object.values(Game.mods).find(m=>m?.modId==='BestDealHelper'||m?.name==='Best Deal Helper');
    globalThis.__cppPerfVariant=variant;
    return {id:variant.id,implementation:variant.implementation,metadata:await variant.apply(planner)};
  })()`);
  return { ...result, sourceSha256: hash(source), sourceFile: variant.hook };
}

async function restoreVariant(cdp) {
  return cdp.evaluate(`(async()=>{const v=globalThis.__cppPerfVariant;if(!v)return;const p=Object.values(Game.mods).find(m=>m?.modId==='BestDealHelper'||m?.name==='Best Deal Helper');await v.restore(p);delete globalThis.__cppPerfVariant;})()`);
}

export async function collect(profile) {
  const session = await inspectInstance(profile);
  const cdp = await connect(session.target);
  const output = path.join(profile.output, new Date().toISOString().replaceAll(':', '-'));
  await mkdir(output, { recursive: true });
  const report = { seed: profile.seed, warmupMs: profile.warmupMs, sampleMs: profile.sampleMs, profile, process: session.processes[0], runs: [] };
  const order = schedule(profile.variants.map(variant => variant.id), profile.repetitions, profile.seed);
  await writeJson(path.join(output, 'schedule.json'), order);
  let profiling = false, observing = false;
  try {
    const initial = await metadata(cdp);
    await writeJson(path.join(output, 'initial.json'), initial);
    for (const [index, run] of order.entries()) {
      // Recheck process count and target between runs; never launch from collect.
      const current = await inspectInstance(profile);
      if (current.processes[0].ProcessId !== session.processes[0].ProcessId || current.target.id !== session.target.id) throw new Error('量測期間遊戲實例已變更');
      console.log(`[${index + 1}/${order.length}] ${run.id} #${run.repeat} 暖機`);
      const beforeApply = await metadata(cdp);
      const variant = profile.variants.find(item => item.id === run.id);
      const implementation = await installVariant(cdp, variant);
      await sleep(profile.warmupMs);
      const before = await metadata(cdp);
      const probe = await cdp.evaluate(`(${beginObservation.toString()})(${profile.observeGains !== false},${profile.observeCandidates !== false})`); observing = true;
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
      await cdp.send('Profiler.start'); profiling = true;
      console.log(`[${index + 1}/${order.length}] ${run.id} #${run.repeat} 量測`);
      await sleep(profile.sampleMs);
      const prefix = `${String(index + 1).padStart(2, '0')}-${run.id}-${run.repeat}`;
      const { profile: cpu } = await cdp.send('Profiler.stop'); profiling = false;
      await writeJson(path.join(output, `${prefix}.cpuprofile`), cpu);
      const observation = await cdp.evaluateJson(invoke(endObservation)); observing = false;
      await writeJson(path.join(output, `${prefix}.observation.json`), observation);
      const after = await metadata(cdp);
      const summary = summarize(observation);
      const sampleValidity = validateSample(before, after, summary);
      const entry = { ...run, implementation, sampleValidity, probe, beforeApply, before, after, summary };
      report.runs.push(entry);
      assignBaselineIdentities(report.runs);
      if (!sampleValidity.valid) console.log(`量測無效，保留原始資料：${sampleValidity.reasons.join('、')}`);
      await writeJson(path.join(output, `${prefix}.json`), { ...entry, observation });
      await restoreVariant(cdp);
      await writeJson(path.join(output, 'report.json'), report);
      await writeFile(path.join(output, 'report.md'), markdown(report));
    }
    console.log(`有效量測 ${report.runs.filter(run => run.sampleValidity.valid).length}/${report.runs.length}；資料已保存：${output}`);
    return { output, report };
  } catch (error) {
    await writeJson(path.join(output, 'failure.json'), { error: error.stack, report });
    throw error;
  } finally {
    try { if (profiling) { const { profile: cpu } = await cdp.send('Profiler.stop'); await writeJson(path.join(output, 'interrupted.cpuprofile'), cpu); } } catch (error) { console.error('CPU 清理失敗：', error.message); }
    try { if (observing) await cdp.evaluate(invoke(endObservation)); } catch (error) { console.error('觀察器清理失敗：', error.message); }
    try { await restoreVariant(cdp); } catch (error) { console.error('方案還原失敗：', error.message); }
    cdp.close();
  }
}

async function main() {
  const [command, file, extra] = process.argv.slice(2);
  if (!['attach', 'start', 'stop', 'collect', 'query', 'diagnose'].includes(command) || !file) throw new Error('用法：node scripts/perf/run.mjs <attach|start|stop|collect|query|diagnose> <profile.json> [expression.js]');
  const profile = await loadProfile(file);
  if (command === 'diagnose' && profile.sampleMs > 60000) throw Error('Diagnosis sampleMs must be at most 60000');
  const owner = path.join(profile.output, 'owned-process.json');
  if (command === 'start') return console.log(JSON.stringify(await startOwned(profile, owner), null, 2));
  if (command === 'stop') return stopOwned(profile, owner);
  if (command === 'collect') return collect(profile);
  const session = await inspectInstance(profile);
  const cdp = await connect(session.target, command === 'diagnose' ? profile.sampleMs + 15000 : 15000);
  try {
    if (command === 'diagnose') {
      const before = await metadata(cdp);
      const result = await cdp.evaluateJson(`(${observeUpdateCosts.toString()})(Game,Object.values(Game.mods).find(m=>m?.modId==='BestDealHelper'),${profile.sampleMs})`);
      const after = await metadata(cdp);
      const outputFile = path.join(profile.output, `update-cost-${Date.now()}.json`);
      await mkdir(profile.output, {recursive: true});
      await writeJson(outputFile, {before, after, result});
      console.log(JSON.stringify({outputFile, updates: result.updates, truncated: result.truncated,
        worst: result.rows.reduce((worst, row) => !worst || row.ms > worst.ms ? row : worst, null)}));
      return;
    }
    // query is explicit code execution; expressions must be reviewed by the caller.
    if (command === 'query') {
      console.log(JSON.stringify(await cdp.evaluate(await readFile(path.resolve(extra || ''), 'utf8')), null, 2));
    } else {
      const result = await metadata(cdp);
      const outputFile = path.join(profile.output, 'attach.json');
      await mkdir(profile.output, { recursive: true });
      await writeJson(outputFile, result);
      console.log(JSON.stringify(attachSummary(result, session, outputFile), null, 2));
    }
  } finally { cdp.close(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
