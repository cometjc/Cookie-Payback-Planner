import assert from 'node:assert/strict';
import {test} from 'node:test';
import {observeCreatorLaunch} from './creator-observer.mjs';

const creator = strict => new Function(`${strict ? '"use strict";' : ''}return function(){var M=this;M.init=function(){M.game.hasGod=function(){return M.slot;};};M.init();return 7;};`)();
test('observes the init creator, preserves native result and restores data descriptors', () => {
  const owner = {game: {}, slot: 1, launch: creator(false)}, launch = owner.launch;
  const observed = observeCreatorLaunch(owner.game, owner, launch.toString(), () => owner.launch());
  assert.equal(observed.value, 7);
  assert.equal(observed.ownerOf(owner.game.hasGod), owner);
  assert.equal(owner.launch, launch);
  assert.equal(owner.game.hasGod(), 1);
  assert.equal(Object.getOwnPropertyDescriptor(owner.game, 'hasGod').value, owner.game.hasGod);
  owner.game.hasGod = new Function('M', `return (${owner.game.hasGod.toString()});`)({slot: 2});
  assert.equal(observed.ownerOf(owner.game.hasGod), undefined);
});
test('strict creators, unknown source and unobserved reentry do not acquire provenance', () => {
  const strict = {game: {}, slot: 1, launch: creator(true)};
  const result = observeCreatorLaunch(strict.game, strict, strict.launch.toString(), () => strict.launch());
  assert.equal(result.ownerOf(strict.game.hasGod), undefined);
  const owner = {game: {}, slot: 1, launch: creator(false)};
  const other = {game: owner.game, slot: 2};
  const observed = observeCreatorLaunch(owner.game, owner, owner.launch.toString(), () => {
    owner.launch();
    creator(false).call(other);
  });
  assert.equal(observed.ownerOf(owner.game.hasGod), undefined);
  assert.equal(owner.game.hasGod(), 2);
  assert.equal(observeCreatorLaunch(owner.game, owner, 'unknown', () => 8).value, 8);
});
test('exceptions restore owned descriptors and preserve third-party replacement', () => {
  const owner = {game: {}, slot: 1, launch: creator(false)}, launch = owner.launch;
  assert.throws(() => observeCreatorLaunch(owner.game, owner, launch.toString(), () => {
    owner.launch(); throw Error('expected');
  }), /expected/);
  assert.equal(owner.launch, launch);
  assert.equal(Object.getOwnPropertyDescriptor(owner.game, 'hasGod').value, owner.game.hasGod);
  const replacement = () => 9;
  observeCreatorLaunch(owner.game, owner, launch.toString(), () => {
    Object.defineProperty(owner.game, 'hasGod', {value: replacement, configurable: true});
  });
  assert.equal(owner.game.hasGod, replacement);
});
test('inherited fields fall back without bypassing their original setters', () => {
  let writes = 0, helper;
  const game = Object.create({set hasGod(fn) { writes++; helper = fn; }, get hasGod() { return helper; }});
  const owner = {game, slot: 1, launch: creator(false)};
  const result = observeCreatorLaunch(game, owner, owner.launch.toString(), () => owner.launch());
  assert.equal(writes, 1);
  assert.equal(Object.hasOwn(game, 'hasGod'), false);
  assert.equal(result.ownerOf(helper), undefined);
});
test('a third-party descriptor lock cannot prevent cleanup of the remaining owned fields', () => {
  const owner = {game: {}, slot: 1, launch: creator(false)};
  observeCreatorLaunch(owner.game, owner, owner.launch.toString(), () => {
    owner.launch();
    Object.defineProperty(owner, 'launch', {writable: false, configurable: false});
  });
  assert.equal(Object.getOwnPropertyDescriptor(owner.game, 'hasGod').value, owner.game.hasGod);
  assert.equal(Object.getOwnPropertyDescriptor(owner, 'init').value, owner.init);
  assert.equal(Object.getOwnPropertyDescriptor(owner, 'launch').configurable, false);
});
