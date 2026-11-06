/** Isolation diagnostic: records native buys without changing their result or eligibility. */
export function observePurchases(game, planner, limit = 1000) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100000) throw Error('Invalid purchase limit');
  const rows = [], cleanup = [];
  let truncated = false;
  const items = [...game.ObjectsById, ...Object.values(game.Upgrades)];
  for (const item of new Set(items)) {
    const original = item.buy;
    if (typeof original !== 'function') continue;
    const wrapped = function(...args) {
      const upgrade = item.type === 'upgrade';
      const before = {cookies: game.cookies, bank: planner.getBankCookies(), owned: upgrade ? item.bought : item.amount,
        bulk: game.buyBulk, price: item.getPrice(), mode: game.buyMode};
      try {return original.apply(this, args);}
      finally {
        const after = {cookies: game.cookies, bank: planner.getBankCookies(), owned: upgrade ? item.bought : item.amount};
        const row = {token: `${upgrade ? 'upgrade' : 'building'}:${item.id}`, before, after,
          units: after.owned - before.owned, spent: before.cookies - after.cookies};
        if (!upgrade && before.mode === 1 && [10, 100].includes(before.bulk) && row.units > 0
          && after.owned % before.bulk !== 0) {
          row.bulkViolation = {requestedUnits: typeof args[0] === 'number' && Number.isFinite(args[0]) ? args[0] : null,
            expectedUnits: before.bulk - before.owned % before.bulk,
            stack: new Error('Building purchase ended off selected multiple').stack};
        }
        if (row.units > 0 && after.cookies < before.bank) row.reserveViolationStack = new Error('Reserve crossed during native buy').stack;
        if (rows.length < limit) rows.push(row); else truncated = true;
      }
    };
    item.buy = wrapped;
    cleanup.push(() => {if (item.buy === wrapped) item.buy = original;});
  }
  return {rows, get truncated() {return truncated;}, restore() {for (const restore of cleanup.reverse()) restore();}};
}

/** Observed reserve checks only; no claim about unobserved buys or recommendation quality. */
export function summarizePurchases(observation) {
  if (!Array.isArray(observation?.rows) || typeof observation.truncated !== 'boolean') throw Error('Invalid purchase observation');
  let successful = 0, units = 0, violations = 0, invalid = 0, paymentAnomalies = 0;
  for (const row of observation.rows) {
    if (!row || !Number.isFinite(row.units) || row.units < 0
      || ![row.before?.cookies, row.before?.bank, row.after?.cookies, row.after?.bank]
        .every(value => Number.isFinite(value) && value >= 0)) {invalid++; continue;}
    if (!Number.isFinite(row.spent) || row.spent < 0 || row.spent !== row.before.cookies - row.after.cookies) paymentAnomalies++;
    if (row.units <= 0) continue;
    successful++; units += row.units;
    if (row.after.cookies < row.before.bank || row.after.cookies < row.after.bank) violations++;
  }
  return {calls: observation.rows.length, successful, units, violations, invalid, paymentAnomalies, truncated: observation.truncated,
    observedReservePass: successful > 0 && !observation.truncated && invalid === 0 && violations === 0};
}
