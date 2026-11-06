import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
async function removeTemp(cwd) {
  assert.equal(path.dirname(path.resolve(cwd)),path.resolve(tmpdir()));
  assert(path.basename(cwd).startsWith('cpp-version-'));
  await rm(cwd,{recursive:true,force:true});
}
const script=fileURLToPath(new URL('./bump-mod-version.mjs',import.meta.url));
test('version increments stay numerically increasing across decimal carry and serialization',async()=>{
  const cwd=await mkdtemp(path.join(tmpdir(),'cpp-version-'));
  try {
    for(const [version,expected] of [[2053.99,2054],[2054,2054.01],[2053.09,2053.1],[2053.1,2053.11],[1000,1000.01],[0,.01]]) {
      await writeFile(path.join(cwd,'info.txt'),JSON.stringify({ModVersion:version,GameVersion:2.053}));
      const result=spawnSync(process.execPath,[script],{cwd,encoding:'utf8',windowsHide:true});
      assert.equal(result.status,0,result.stderr);
      const info=JSON.parse(await readFile(path.join(cwd,'info.txt'),'utf8'));
      assert.equal(info.ModVersion,expected);assert(info.ModVersion>version);assert.equal(info.GameVersion,2.053);
    }
  } finally {await removeTemp(cwd);}
});
test('invalid version input cannot overwrite metadata',async()=>{
  const cwd=await mkdtemp(path.join(tmpdir(),'cpp-version-'));
  try {
    for(const content of ['{"ModVersion":-1}','{"ModVersion":"1.0"}','{"ModVersion":1e100}','{"ModVersion":1,']) {
      const file=path.join(cwd,'info.txt');await writeFile(file,content);
      const result=spawnSync(process.execPath,[script],{cwd,encoding:'utf8',windowsHide:true});
      assert.notEqual(result.status,0);assert.equal(await readFile(file,'utf8'),content);
    }
  } finally {await removeTemp(cwd);}
});
