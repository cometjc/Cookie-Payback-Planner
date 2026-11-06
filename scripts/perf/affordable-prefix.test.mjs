import assert from 'node:assert/strict';
import {affordablePrefix} from './affordable-prefix.mjs';
// Starting reserve=10 permits the first purchase; reserve=100 prevents the second.
assert.deepEqual(affordablePrefix([20, 20], n => n ? 10 : 1, 100, 10), {count: 1, remaining: 80});
assert.deepEqual(affordablePrefix([20, 20], () => 10, 100, 0), {count: 2, remaining: 60});
assert.deepEqual(affordablePrefix([20], () => 8, 100, 10), {count: 1, remaining: 80});
assert.throws(() => affordablePrefix([NaN], () => 1, 100, 0), /Invalid/);
assert.throws(() => affordablePrefix([1], () => Number.MAX_VALUE, 100, 2), /overflow/);
console.log('affordable prefix: dynamic reserve, equality boundary, validation pass');
