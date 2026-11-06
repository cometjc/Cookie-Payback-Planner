/** Diagnostic only: callbacks may have arbitrary side effects. Run in a disposable game. */
export function summarizeUnlockGates(report) {
  return report.rows.filter(row => row.context === 'peers-and-ownership').flatMap(row => {
    const interventions = report.rows.filter(other => other.building === row.building && other.context.startsWith('without:'));
    return row.transitions.flatMap(event => event.added.map(upgrade => ({
      building: row.building, amount: event.amount, upgrade,
      necessaryInSample: interventions.filter(other => !other.transitions.some(t => t.amount === event.amount && t.added.includes(upgrade)))
        .map(other => other.context.slice(8)),
      status: 'observed-only',
    })));
  });
}

export function probeUnlocks(game, ceiling = 1000) {
  if (!Number.isInteger(ceiling) || ceiling < 1 || ceiling > 5000) throw Error('Invalid probe ceiling');
  const buildings = game.ObjectsById;
  const amounts = buildings.map(b => b.amount);
  const originals = {Unlock: game.Unlock, Win: game.Win, Has: game.Has};
  const rows = [];
  const contexts = ['snapshot', 'peers-at-ceiling', 'peers-and-ownership'];
  let unlocks, achievements, reads;
  const collect = (set, value) => {
    for (const name of Array.isArray(value) ? value : [value]) set.add(String(name));
  };
  try {
    game.Unlock = value => collect(unlocks, value);
    game.Win = value => collect(achievements, value);
    for (const context of contexts) {
      game.Has = function(name) {
        reads.add(String(name));
        if (context.startsWith('without:')) return String(name) === context.slice(8) ? 0 : 1;
        return context === 'peers-and-ownership' ? 1 : originals.Has.call(this, name);
      };
      for (const building of buildings) {
        buildings.forEach((b, i) => { b.amount = context === 'snapshot' ? amounts[i] : ceiling; });
        let previousUnlocks = new Set(), previousAchievements = new Set();
        reads = new Set();
        const transitions = [];
        for (let amount = 0; amount <= ceiling; amount++) {
          building.amount = amount;
          unlocks = new Set(); achievements = new Set();
          building.buyFunction?.call(building);
          const difference = (a, b) => [...a].filter(name => !b.has(name)).sort();
          const added = difference(unlocks, previousUnlocks), removed = difference(previousUnlocks, unlocks);
          const wins = difference(achievements, previousAchievements), lost = difference(previousAchievements, achievements);
          if (added.length || removed.length || wins.length || lost.length) transitions.push({amount, added, removed, wins, lost});
          previousUnlocks = unlocks; previousAchievements = achievements;
        }
        rows.push({context, building: building.name, ownershipReads: [...reads].sort(), transitions});
      }
      // ponytail: one-factor ablation exposes necessary gates, not arbitrary Boolean rules; add pair interventions when evidence requires them.
      if (context === 'peers-and-ownership') {
        const names = new Set(rows.flatMap(row => row.ownershipReads));
        contexts.push(...[...names].sort().map(name => `without:${name}`));
      }
    }
    return {ceiling, calls: buildings.length * contexts.length * (ceiling + 1), rows,
      limits: 'Building buy callbacks only; sampled integer range. Ownership=1 is counterfactual, not a reachable save. No global Logic, timers, upgrade purchases or gain model inferred.'};
  } finally {
    buildings.forEach((building, i) => { building.amount = amounts[i]; });
    Object.assign(game, originals);
  }
}
