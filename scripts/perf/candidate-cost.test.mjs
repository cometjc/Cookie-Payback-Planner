import assert from 'node:assert/strict';
import {observeCandidateCosts, observeUpdateCosts} from './candidate-cost.mjs';

const original = function(item) { assert.equal(this, planner); if (item.fail) throw Error('native failure'); return 42; };
const planner = {updateBestCpsAcceleration: original};
const pending = observeCandidateCosts(planner, 1);
assert.equal(planner.updateBestCpsAcceleration({id: 2, name: 'Farm', type: 'building'}), 42);
assert.throws(() => planner.updateBestCpsAcceleration({id: 3, name: 'Upgrade', buildingTie: {}, fail: true}), /native failure/);
const result = await pending;
assert.equal(result.rows.length, 2);
assert(result.rows.some(row => row.token === 'upgrade:3' && row.count === 1));
assert.equal(planner.updateBestCpsAcceleration, original);
const next = observeCandidateCosts(planner, 1);
const replacement = () => 7;
planner.updateBestCpsAcceleration = replacement;
await next;
assert.equal(planner.updateBestCpsAcceleration, replacement);
await assert.rejects(observeCandidateCosts(planner, 0), /Invalid/);
console.log('candidate costs: native results, errors, type normalization, restoration pass');

const game = {CalculateGains() {assert.equal(this, game); return 5;}};
const nativeGains = game.CalculateGains;
const updatePlanner = {
  updateBestCpsAcceleration(item) {assert.equal(this, updatePlanner); game.CalculateGains(); if (item.fail) throw Error('trial failure'); return 7;},
  updateUI(item) {assert.equal(this, updatePlanner); return this.updateBestCpsAcceleration(item);},
};
const nativeUpdate = updatePlanner.updateUI, nativeCandidate = updatePlanner.updateBestCpsAcceleration;
const updatePending = observeUpdateCosts(game, updatePlanner, 1);
assert.equal(updatePlanner.updateUI({id: 2, type: 'building'}), 7);
assert.throws(() => updatePlanner.updateUI({id: 3, type: 'upgrade', fail: true}), /trial failure/);
const updateResult = await updatePending;
assert.equal(updateResult.updates, 2);
assert.equal(updateResult.truncated, false);
assert(updateResult.rows.every(row => row.gains === 1 && row.candidates === 1 && row.slowest.gains === 1));
assert.equal(game.CalculateGains, nativeGains);
assert.equal(updatePlanner.updateUI, nativeUpdate);
assert.equal(updatePlanner.updateBestCpsAcceleration, nativeCandidate);
const replacementPending = observeUpdateCosts(game, updatePlanner, 1);
const otherUpdate = () => 9;
updatePlanner.updateUI = otherUpdate;
await replacementPending;
assert.equal(updatePlanner.updateUI, otherUpdate);
await assert.rejects(observeUpdateCosts(game, updatePlanner, 60001), /Invalid/);
console.log('update costs: native result, exception, attribution and restoration pass');
