/** Diagnostic only. Object.values changes getter timing and excludes inherited entries. */
export function createTierValuesCandidate(game) {
  const original = game.GetTieredCpsMult;
  if (typeof original !== 'function') throw Error('Tier function required');
  const source = Function.prototype.toString.call(original);
  const edits = [
    ['for (var i in me.tieredUpgrades)', 'for (var upgrade of Object.values(me.tieredUpgrades))'],
    ['me.tieredUpgrades[i]', 'upgrade'],
    ['for (var i in me.synergies)', 'for (var syn of Object.values(me.synergies))'],
    ['var syn=me.synergies[i];', ''],
  ];
  let candidate = source;
  for (const [before, after] of edits) {
    if (!candidate.includes(before)) throw Error('Unexpected tier source');
    candidate = candidate.replaceAll(before, after);
  }
  // ponytail: isolated diagnostics only; source rewriting does not certify closure or data safety.
  return new Function('Game', `return (${candidate});`)(game);
}

/** Diagnostic only: preserves value reads, still changes enumeration semantics. */
export function createTierKeysCandidate(game) {
  const source = Function.prototype.toString.call(game.GetTieredCpsMult);
  let candidate = source;
  for (const field of ['tieredUpgrades', 'synergies']) {
    const loop = `for (var i in me.${field})`;
    if (!candidate.includes(loop)) throw Error('Unexpected tier source');
    candidate = candidate.replace(loop, `for (var i of Object.keys(me.${field}))`);
  }
  return new Function('Game', `return (${candidate});`)(game);
}
