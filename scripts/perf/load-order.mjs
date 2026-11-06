import {readFile,writeFile,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {verifyIsolation} from './isolation.mjs';
import {gameProcesses} from './process.mjs';
import {hash} from './report.mjs';
import {fileURLToPath} from 'node:url';

const seam="var js=document.createElement('script');";
const replacement=seam+"\n\tjs.async=false;/* CPP_BENCHMARK_ORDERED_SCRIPTS */";

export function orderedScriptSource(source) {
  if(source.includes(replacement)) return source;
  if(source.split(seam).length!==2 || !source.includes('var LoadScript=function(url,callback,error)')) throw Error('Unknown script loader');
  return source.replace(seam,replacement);
}

/** Changes only the verified stopped benchmark copy, never the original game. */
export async function orderIsolatedScripts(root, deps={verifyIsolation,gameProcesses,readFile,writeFile,lstat,realpath}) {
  const iso=await deps.verifyIsolation(root);
  for(const exe of [iso.gameExe,path.join(iso.sourceRoot,'Cookie Clicker.exe')]) {
    if((await deps.gameProcesses(exe)).length) throw Error('Both games must be stopped before changing the isolated loader');
  }
  const file=path.join(iso.targetRoot,'resources/app/src/main.js');
  const stat=await deps.lstat(file),resolved=await deps.realpath(file);
  if(!stat.isFile() || stat.nlink!==1 || path.resolve(resolved).toLowerCase()!==path.resolve(file).toLowerCase()) throw Error('Isolated source must be an independent regular file');
  const original=await deps.readFile(path.join(iso.sourceRoot,'resources/app/src/main.js'),'utf8');
  const current=await deps.readFile(file,'utf8'),updated=orderedScriptSource(original);
  if(current!==original && current!==updated) throw Error('Unexpected isolated game source');
  if(current!==updated) await deps.writeFile(file,updated);
  const receipt={sourceSha256:hash(original),orderedSha256:hash(updated),file,
    scope:'Ordered dynamic scripts in benchmark copy only; asynchronous mod-internal work may still reorder registration.'};
  await deps.writeFile(path.join(iso.targetRoot,'.cpp-benchmark/ordered-scripts.json'),JSON.stringify(receipt,null,2));
  return receipt;
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(!process.argv[2]) throw Error('Usage: node scripts/perf/load-order.mjs <verified isolation root>');
  orderIsolatedScripts(process.argv[2]).then(console.log).catch(error=>{console.error(error);process.exitCode=1;});
}
