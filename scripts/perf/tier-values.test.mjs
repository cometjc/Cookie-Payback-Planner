import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTierValuesCandidate, createTierKeysCandidate} from './tier-values.mjs';

test('tier iteration probe preserves plain own data, exposes getter counterexample', () => {
  const game = {Has: () => true};
  game.GetTieredCpsMult = new Function('Game', `return function(me) {
    var mult=1;
    for (var i in me.tieredUpgrades) {
      if (Game.Has(me.tieredUpgrades[i].name)) mult*=me.tieredUpgrades[i].power;
    }
    for (var i in me.synergies) {var syn=me.synergies[i];mult*=syn.power;}
    return mult;
  };`)(game);
  const candidate = createTierValuesCandidate(game);
  const item = {tieredUpgrades: {a: {name: 'a', power: 2}}, synergies: [{power: 3}]};
  assert.equal(candidate(item), game.GetTieredCpsMult(item));
  let power = 2;
  game.Has = () => {power = 4; return true;};
  Object.defineProperty(item.tieredUpgrades, 'a', {enumerable: true, get: () => ({name: 'a', power})});
  assert.equal(game.GetTieredCpsMult(item), 12);
  power = 2;
  assert.equal(candidate(item), 6);
  power = 2;
  assert.equal(createTierKeysCandidate(game)(item), 12);
  item.tieredUpgrades = Object.create({inherited: {name: 'inherited', power: 5}});
  assert.equal(game.GetTieredCpsMult(item), 15);
  assert.equal(createTierKeysCandidate(game)(item), 3);
  assert.throws(() => createTierValuesCandidate({GetTieredCpsMult() {}}), /Unexpected tier source/);
});
