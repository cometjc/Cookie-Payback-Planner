import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {verifyIsolation, resetIsolationSave} from './isolation.mjs';
import {gameProcesses, inspectInstance, startOwned, stopOwned} from './process.mjs';
import {connect} from './cdp.mjs';
import {loadComparisonProfile, waitReady, qualityCheckpoint, assessQuality} from './compare.mjs';
import {hash} from './report.mjs';

/** Functionality only. A minimized renderer is never accepted as a frame benchmark. */
export async function runFunctional(profile, dependencies = {}) {
  const deps = {verifyIsolation, resetIsolationSave, gameProcesses, inspectInstance, startOwned,
    stopOwned, waitReady, connect, exec: promisify(execFile), ...dependencies};
  const iso = await deps.verifyIsolation(profile.isolationRoot);
  if ((await deps.gameProcesses(path.join(iso.sourceRoot, 'Cookie Clicker.exe'))).length
    || (await deps.gameProcesses(iso.gameExe)).length) throw Error('Games must be stopped before functional reset');
  const bundle = path.join(iso.targetRoot, 'resources/app/mods/workshop/BestDealHelper/main.js');
  const sha = hash(await readFile(bundle));
  if (!profile.expectedPlannerSha256 || profile.expectedPlannerSha256 !== sha) throw Error('Matching expectedPlannerSha256 required');
  const trial = {...profile, executable: iso.gameExe, launchArgs: [...(profile.launchArgs || []), ...iso.requiredLaunchArgs]};
  const root = path.join(profile.output, `functional-${Date.now()}`), owner = path.join(root, 'owned-process.json');
  await mkdir(root, {recursive: true});
  let owned = false, c;
  try {
    await deps.resetIsolationSave(iso.targetRoot, {stopped: true});
    await deps.startOwned(trial, owner); owned = true;
    await deps.waitReady(trial);
    const identity = await deps.inspectInstance(trial);
    const receipt = JSON.parse(await readFile(owner, 'utf8'));
    if (receipt.ProcessId !== identity.processes[0].ProcessId || receipt.CreationDate !== identity.processes[0].CreationDate) throw Error('Owned identity mismatch');
    const pid = Number(receipt.ProcessId);
    if (!Number.isSafeInteger(pid) || pid <= 0) throw Error('Invalid owned PID');
    await deps.exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class CppFunctionalWindow{[DllImport("user32.dll")]public static extern bool ShowWindowAsync(IntPtr h,int c);}';$p=Get-Process -Id ${pid} -ErrorAction Stop;if($p.MainWindowHandle -eq 0){throw 'No owned window'};[void][CppFunctionalWindow]::ShowWindowAsync($p.MainWindowHandle,6)`], {windowsHide: true, timeout: 15000});
    c = await deps.connect(identity.target);
    let visibility;
    for (let attempt = 0; attempt < 20; attempt++) {
      visibility = await c.evaluate('document.visibilityState');
      if (visibility === 'hidden') break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (visibility !== 'hidden') throw Error('Renderer did not become hidden');
    const checkpoint = await c.evaluateJson(`(()=>{const p=Object.values(Game.mods).find(m=>m?.modId==='BestDealHelper');
      const config={...p.config};
      try{p.config.autoBuy=false;p.config.experimentalBatch=false;
        // Functional equivalence must not depend on which variant reaches a wall-clock deadline first.
        p.config.strategyBudgetMs=10000;p.config.strategyIncrementalBudgetMs=10000;
        p.config.strategyAStarIncrementalBudgetMs=10000;
        return (${qualityCheckpoint.toString()})();}
      finally{Object.assign(p.config,config);}})()`);
    const assessment = assessQuality(checkpoint);
    const current = await deps.inspectInstance(trial);
    if (current.target.id !== identity.target.id || current.processes[0].ProcessId !== receipt.ProcessId
      || current.processes[0].CreationDate !== receipt.CreationDate) throw Error('Instance changed');
    const functionalPass = assessment.stateStable && ['indexed', 'compiled'].every(id => {
      const check = assessment.checks.find(check => check.id === id);
      return check?.numericCoverage > 0 && check.numericMatches && check.rankingMatches
        && check.buildingOrderMatches && check.upgradeOrderMatches && check.autoBuyCandidateMatches;
    });
    const report = {scope: 'Hidden renderer candidate values and ranking; strategy utility equality reported separately; no performance claim', functionalPass, bundleSha256: sha,
      snapshotSha256: iso.snapshotSha256, visibility, checkpoint, assessment};
    await writeFile(path.join(root, 'report.json'), JSON.stringify(report, null, 2));
    if (!functionalPass) throw Error('Hidden functional quality mismatch');
    return {root, functionalPass, assessment};
  } finally {
    c?.close();
    if (owned) await deps.stopOwned(trial, owner);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  loadComparisonProfile(process.argv[2]).then(runFunctional).then(result => console.log(JSON.stringify(result)))
    .catch(error => {console.error(error); process.exitCode = 1;});
}
