import assert from 'node:assert/strict';
import {probeUnlocks, summarizeUnlockGates} from './unlock-probe.mjs';

const game = {ObjectsById: [], Unlock() {}, Win() {}, Has: () => 0};
const a = {name: 'A', amount: 2, buyFunction() {
  if (this.amount >= 3) game.Unlock('tier');
  if (this.amount === 4) game.Unlock('exact');
  if (this.amount >= 2 && game.ObjectsById[1].amount >= 3 && game.Has('gate')) game.Unlock('synergy');
  if (this.amount >= 4) game.Win('achievement');
}};
game.ObjectsById = [a, {name: 'B', amount: 0}];
const original = game.Unlock;
const result = probeUnlocks(game, 5);
assert.deepEqual(result.rows[0].transitions.map(t => [t.amount, t.added, t.removed]), [
  [3, ['tier'], []], [4, ['exact'], []], [5, [], ['exact']],
]);
assert(result.rows.find(r => r.context === 'peers-and-ownership' && r.building === 'A').transitions
  .some(t => t.amount === 2 && t.added.includes('synergy')));
assert(!result.rows.find(r => r.context === 'without:gate' && r.building === 'A').transitions
  .some(t => t.added.includes('synergy')));
assert.equal(result.calls, 48);
assert.deepEqual(summarizeUnlockGates(result).find(row => row.upgrade === 'synergy').necessaryInSample, ['gate']);
assert.deepEqual(summarizeUnlockGates(result).find(row => row.upgrade === 'tier').necessaryInSample, []);
assert.deepEqual(game.ObjectsById.map(b => b.amount), [2, 0]);
assert.equal(game.Unlock, original);
a.buyFunction = () => { throw Error('callback failed'); };
assert.throws(() => probeUnlocks(game, 5), /callback failed/);
assert.equal(game.Unlock, original);
assert.deepEqual(game.ObjectsById.map(b => b.amount), [2, 0]);
console.log('unlock probe: thresholds, interactions, nonmonotonic events, restoration pass');
