import {test} from 'node:test';
import assert from 'node:assert/strict';
import {orderedScriptSource,orderIsolatedScripts} from './load-order.mjs';
const source="var LoadScript=function(url,callback,error){var js=document.createElement('script');js.src=url;document.head.appendChild(js);}";
test('orders dynamic scripts before append and is idempotent',()=>{
  const updated=orderedScriptSource(source);
  assert.ok(updated.indexOf('js.async=false')<updated.indexOf('appendChild'));
  assert.equal(orderedScriptSource(updated),updated);
  assert.throws(()=>orderedScriptSource(source+source),/Unknown/);
});
test('changes only stopped verified isolation and rejects unknown edits',async()=>{
  const writes=[],deps={verifyIsolation:async()=>({targetRoot:'copy',sourceRoot:'original',gameExe:'copy.exe'}),
    gameProcesses:async()=>[],readFile:async()=>source,writeFile:async(...a)=>writes.push(a),lstat:async()=>({isFile:()=>true,nlink:1}),realpath:async file=>file};
  await orderIsolatedScripts('copy',deps);assert.equal(writes.length,2);
  assert.ok(writes[0][0].startsWith('copy'));assert.ok(writes[0][1].includes('js.async=false'));
  writes.length=0;deps.gameProcesses=async()=>[{}];
  await assert.rejects(orderIsolatedScripts('copy',deps),/stopped/);assert.equal(writes.length,0);
  deps.gameProcesses=async()=>[];deps.readFile=async file=>file.startsWith('copy')?'unknown edit':source;
  await assert.rejects(orderIsolatedScripts('copy',deps),/Unexpected/);assert.equal(writes.length,0);
  deps.lstat=async()=>({isFile:()=>true,nlink:2});
  await assert.rejects(orderIsolatedScripts('copy',deps),/independent/);assert.equal(writes.length,0);
});
