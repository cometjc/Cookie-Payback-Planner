import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
const directory=await mkdtemp(path.join(tmpdir(),'cpp-flame-'));
try {
  const input=path.join(directory,'cpu.cpuprofile'),output=path.join(directory,'flamegraph.html');
  const frame=name=>({functionName:name,url:'',lineNumber:0});
  await writeFile(input,JSON.stringify({nodes:[{id:1,callFrame:frame('(root)'),children:[2]},
    {id:2,callFrame:frame('updateUI'),children:[3]},{id:3,callFrame:frame('</script><x>')}],samples:[2,3],timeDeltas:[1000,2000]}));
  const result=execFileSync(process.execPath,['scripts/perf/flamegraph.mjs',input,output],{encoding:'utf8'});
  assert.equal(JSON.parse(result.split('\n')[0]).updateMs,3);
  const html=await readFile(output,'utf8');
  assert(!html.includes('</script><x>'));
  assert(html.includes(String.fromCharCode(92)+'u003c/script>'));
  const embedded=html.match(/<script>const nodes=(.*?),map=new Map/)[1];
  assert.equal(vm.runInNewContext(embedded)[2].name,'</script><x>');
  console.log('flamegraph: sampled self/inclusive totals and embedded data escaping pass');
} finally {await rm(directory,{recursive:true,force:true});}
