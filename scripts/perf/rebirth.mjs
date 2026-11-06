import {loadComparisonProfile} from './compare.mjs';
import {verifyIsolation} from './isolation.mjs';
import {gameProcesses,inspectInstance} from './process.mjs';
import {connect} from './cdp.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/** Reincarnate and save only an already running, verified benchmark copy. */
export async function rebirth(filename, deps={loadComparisonProfile,verifyIsolation,gameProcesses,inspectInstance,connect,mkdir,writeFile,sleep:ms=>new Promise(r=>setTimeout(r,ms))}) {
  const p=await deps.loadComparisonProfile(filename),iso=await deps.verifyIsolation(p.isolationRoot);
  if((await deps.gameProcesses(path.join(iso.sourceRoot,'Cookie Clicker.exe'))).length)throw Error('Production must be stopped');
  p.executable=iso.gameExe;
  const session=await deps.inspectInstance(p),c=await deps.connect(session.target);
  const deadline=Date.now()+90000;
  const wait=async expression=>{while(Date.now()<deadline){if(await c.evaluate(expression))return;await deps.sleep(100);}throw Error('Rebirth readiness timeout');};
  try {
    if(!await c.evaluate(`!!Game.ready && document.visibilityState==='visible' && !Game.OnAscend && !Game.AscendTimer && !Game.ReincarnateTimer && Object.values(Game.mods).some(m=>m.modId==='BestDealHelper'&&m.config.autoBuy)`))throw Error('Visible ready auto-buy game required');
    await c.evaluate('Game.ClosePrompt();Game.Ascend(1);true');
    await wait('!!Game.OnAscend && Game.AscendTimer===0');
    await deps.sleep(3000);
    const current=await deps.inspectInstance(p);
    if(current.target.id!==session.target.id||current.processes[0].ProcessId!==session.processes[0].ProcessId||current.processes[0].CreationDate!==session.processes[0].CreationDate)throw Error('Instance changed');
    const saved=await c.evaluate(`(()=>{if(!Game.OnAscend||Game.AscendTimer)throw Error('Ascension state changed');Game.ClosePrompt();Game.Reincarnate(1);Game.WriteSave();return {resets:Game.resets,amounts:Game.ObjectsById.map(b=>b.amount),autoBuy:Object.values(Game.mods).find(m=>m.modId==='BestDealHelper').config.autoBuy}})()`);
    await wait('!Game.isSaving');
    await deps.mkdir(p.output,{recursive:true});
    await deps.writeFile(path.join(p.output,'rebirth-save.json'),JSON.stringify({saved,process:session.processes[0],at:new Date().toISOString(),scope:'Saved isolated game only; controller must preserve a separate benchmark snapshot.'},null,2));
    return saved;
  } finally {c.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))rebirth(process.argv[2]).then(console.log).catch(e=>{console.error(e);process.exitCode=1;});
