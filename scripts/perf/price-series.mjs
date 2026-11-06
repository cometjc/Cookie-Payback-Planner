import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

// Compare actual game functions, without attaching to or changing a running game.
const source = await readFile(process.argv[2], 'utf8');
function extract(name, next) {
  const start = source.indexOf(`this.${name}=function(`), end = source.indexOf(`this.${next}=function(`, start);
  if (start < 0 || end < 0) throw Error(`Unsupported game source: ${name}`);
  return source.slice(start, end).replace(`this.${name}=`, '').trim();
}
const game = {priceIncrease: 1.15, modifyBuildingPrice: (_building, price) => price};
const getPrice = runInNewContext(`(${extract('getPrice', 'getSumPrice')})`, {Game: game});
const getSumPrice = runInNewContext(`(${extract('getSumPrice', 'getReverseSumPrice')})`, {Game: game});
const rows = [];
for (const basePrice of [15, 100, 1100]) for (const amount of [0, 10, 100]) {
  const building = {basePrice, amount, free: 0}, count = 100;
  let sequential = 0;
  for (let i = 0; i < count; i++) sequential += getPrice.call({...building, amount: amount + i});
  const native = getSumPrice.call(building, count);
  const geometric = Math.ceil(basePrice * Math.pow(1.15, amount) * (Math.pow(1.15, count) - 1) / (1.15 - 1));
  rows.push({basePrice, amount, sequential, native, geometric, roundingDelta: sequential - native, formulaDelta: geometric - native});
}
assert.equal(rows[0].sequential, 117431291);
assert.equal(rows[0].native, 117431246);
assert.ok(rows.some(row => row.sequential !== row.native));
assert.ok(rows.some(row => row.geometric !== row.native));
console.log(JSON.stringify({scope: 'No discounts, free buildings or hooks; formula is not an exact replacement for sequential simulation or native bulk floating-point order.', rows}, null, 2));
