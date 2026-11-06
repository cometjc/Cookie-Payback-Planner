import assert from 'node:assert/strict';
import {compareAffordablePrefixes} from './affordable-shadow.mjs';
const fixture = raw => [{index: 0, rows: [{building: 'fixture', points: raw.map((value, n) => ({n, raw: value, price: 20}))}]}];
const linear = compareAffordablePrefixes(fixture([1, 2, 3]));
assert.equal(linear.cases, 30);
assert.equal(linear.mismatches, 0);
assert.ok(compareAffordablePrefixes(fixture([1, 10, 3])).mismatches > 0);
assert.throws(() => compareAffordablePrefixes([{rows: [{points: [{n: 1}]}]}]), /samples/);
console.log('affordable shadow: linear agreement, interior change detection, input validation pass');
