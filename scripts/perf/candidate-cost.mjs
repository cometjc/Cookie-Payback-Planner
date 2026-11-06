/** Renderer diagnostic. Retains native calculations; adds timing overhead. */
export async function observeCandidateCosts(planner, durationMs = 15000) {
  if (!Number.isInteger(durationMs) || durationMs < 1 || durationMs > 60000
    || typeof planner?.updateBestCpsAcceleration !== 'function') throw Error('Invalid candidate observation');
  const original = planner.updateBestCpsAcceleration, rows = new Map();
  const wrapper = function(item) {
    const start = performance.now();
    try { return original.call(this, item); }
    finally {
      const type = item.type === 'upgrade' || item.type !== 'building' && typeof item.buildingTie === 'object' ? 'upgrade' : 'building';
      const token = `${type}:${item.id}`;
      const row = rows.get(token) || {token, name: item.name, count: 0, totalMs: 0, maxMs: 0, over20: 0};
      const ms = performance.now() - start;
      row.count++; row.totalMs += ms; row.maxMs = Math.max(row.maxMs, ms);
      if (ms > 20) row.over20++;
      rows.set(token, row);
    }
  };
  planner.updateBestCpsAcceleration = wrapper;
  try {
    await new Promise(resolve => setTimeout(resolve, durationMs));
    return {rows: [...rows.values()].sort((a, b) => b.totalMs - a.totalMs),
      note: 'Natural candidate timings include cache hits and observer overhead; not a comparative benchmark.'};
  } finally {
    if (planner.updateBestCpsAcceleration === wrapper) planner.updateBestCpsAcceleration = original;
  }
}

/** Bounded update diagnosis; instrumentation overhead excludes benchmark claims. */
export async function observeUpdateCosts(game, planner, durationMs = 60000) {
  if (!Number.isInteger(durationMs) || durationMs < 1 || durationMs > 60000
    || [game?.CalculateGains, planner?.updateUI, planner?.updateBestCpsAcceleration].some(fn => typeof fn !== 'function')) {
    throw Error('Invalid update observation');
  }
  const originals = [game.CalculateGains, planner.updateUI, planner.updateBestCpsAcceleration];
  const rows = [];
  let current = null, updates = 0, truncated = false;
  const gains = function(...args) {
    if (current) current.gains++;
    return originals[0].apply(this, args);
  };
  const candidate = function(item) {
    const row = current, start = performance.now(), before = row?.gains || 0;
    try { return originals[2].call(this, item); }
    finally {
      if (row) {
        row.candidates++;
        const ms = performance.now() - start;
        if (!row.slowest || ms > row.slowest.ms) row.slowest = {id: item.id,
          type: item.type === 'upgrade' || typeof item.buildingTie === 'object' ? 'upgrade' : 'building',
          ms, gains: row.gains - before};
      }
    }
  };
  const update = function(...args) {
    const parent = current, start = performance.now();
    const row = {ms: 0, gains: 0, candidates: 0, slowest: null};
    current = row;
    try { return originals[1].apply(this, args); }
    finally {
      row.ms = performance.now() - start; current = parent; updates++;
      if (rows.length < 10000) rows.push(row);
      else truncated = true;
    }
  };
  game.CalculateGains = gains; planner.updateUI = update; planner.updateBestCpsAcceleration = candidate;
  try {
    await new Promise(resolve => setTimeout(resolve, durationMs));
    return {updates, truncated, rows, note: 'Instrumented update diagnosis; not a comparative benchmark.'};
  } finally {
    if (game.CalculateGains === gains) game.CalculateGains = originals[0];
    if (planner.updateUI === update) planner.updateUI = originals[1];
    if (planner.updateBestCpsAcceleration === candidate) planner.updateBestCpsAcceleration = originals[2];
  }
}
