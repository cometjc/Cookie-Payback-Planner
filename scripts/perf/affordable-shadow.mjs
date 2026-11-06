import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {affordablePrefix} from './affordable-prefix.mjs';

/** Offline boundary stress test. Cookies are synthetic, never a captured player balance. */
export function compareAffordablePrefixes(series) {
  const result = {rows: 0, cases: 0, mismatches: 0, mismatchesByFactor: {}, maximumCountDifference: 0, examples: []};
  for (const state of series) for (const row of state.rows) {
    const points = row.points, first = points[0], last = points.at(-1);
    if (points.length < 2 || points.some((p, i) => p.n !== i)) throw Error('Expected consecutive native samples');
    const prices = points.slice(0, -1).map(p => p.price);
    const predictedRaw = n => first.raw + (last.raw - first.raw) * n / last.n;
    result.rows++;
    for (const seconds of [0, 1, 10, 60, 1200]) {
      let spent = 0;
      for (let n = 0; n < prices.length; n++) {
        const boundary = spent + prices[n] + seconds * points[n].raw;
        for (const factor of [1 - 1e-10, 1, 1 + 1e-10]) {
          const cookies = boundary * factor;
          const native = affordablePrefix(prices, i => points[i].raw, cookies, seconds);
          const predicted = affordablePrefix(prices, predictedRaw, cookies, seconds);
          result.cases++;
          if (native.count !== predicted.count) {
            result.mismatches++;
            result.mismatchesByFactor[factor] = (result.mismatchesByFactor[factor] || 0) + 1;
            result.maximumCountDifference = Math.max(result.maximumCountDifference, Math.abs(native.count - predicted.count));
            if (result.examples.length < 5) result.examples.push({state: state.index, building: row.building,
              seconds, boundaryStep: n, factor, native: native.count, predicted: predicted.count});
          }
        }
        spent += prices[n];
      }
    }
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(compareAffordablePrefixes(JSON.parse(readFileSync(process.argv[2], 'utf8'))), null, 2));
}
