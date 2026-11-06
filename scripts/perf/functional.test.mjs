import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {runFunctional} from './functional.mjs';
import {hash} from './report.mjs';

test('running game refuses reset or launch', async () => {
  let touched = false;
  await assert.rejects(runFunctional({isolationRoot: 'unused'}, {
    verifyIsolation: async () => ({sourceRoot: 'source', gameExe: 'copy'}),
    gameProcesses: async () => [{}], resetIsolationSave: async () => {touched = true;},
  }), /must be stopped/);
  assert.equal(touched, false);
});

test('hidden quality failure closes only the owned game and CDP', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'cpp-functional-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const bundle = path.join(root, 'resources/app/mods/workshop/BestDealHelper');
  await mkdir(bundle, {recursive: true}); await writeFile(path.join(bundle, 'main.js'), 'bundle');
  const identity = {target: {id: 'page'}, processes: [{ProcessId: 42, CreationDate: 'owned'}]};
  const events = [];
  const variant = id => ({id, stateUnchanged: true, items: [{token: 'building:0', score: 1, wait: 1, amount: 10}],
    ranking: [{token: 'building:0', score: 1}], buildingOrder: ['building:0'], upgradeOrder: [], autoBuyBestCandidateToken: 'building:0'});
  const checkpoint = {stateStable: true, variants: ['baseline', 'indexed', 'compiled', 'search'].map(variant)};
  checkpoint.variants[1].items[0].score = 2;
  await assert.rejects(runFunctional({isolationRoot: root, output: root, expectedPlannerSha256: hash('bundle')}, {
    verifyIsolation: async () => ({targetRoot: root, sourceRoot: 'source', gameExe: 'copy', requiredLaunchArgs: []}),
    gameProcesses: async () => [], resetIsolationSave: async () => events.push('reset'),
    startOwned: async (_p, owner) => {await writeFile(owner, JSON.stringify(identity.processes[0])); events.push('start');},
    waitReady: async () => events.push('ready'), inspectInstance: async () => identity,
    exec: async (_exe, args) => {assert.match(args.at(-1), /42/); events.push('minimize');},
    connect: async () => ({evaluate: async () => 'hidden', evaluateJson: async () => checkpoint, close: () => events.push('close')}),
    stopOwned: async () => events.push('stop'),
  }), /quality mismatch/);
  assert.deepEqual(events, ['reset', 'start', 'ready', 'minimize', 'close', 'stop']);
});
