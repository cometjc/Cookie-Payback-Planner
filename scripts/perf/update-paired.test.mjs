import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {assessPurchaseDecision, assessTopThree, assessUpdatePair, updatePair} from './update-paired.mjs';
test('purchase assessment rejects bank, eligibility and target changes despite same ranking', () => {
  const purchase = ['a','b','c'].map(token => ({token,price:20,bank:80,cookies:100,affordable:true,ready:true,target:100}));
  const runs = [{id:'baseline',unchanged:true,quality:{purchase}},
    {id:'batch',unchanged:true,quality:{purchase:structuredClone(purchase)}}];
  assert.equal(assessPurchaseDecision({runs},'batch').purchaseDecisionPass,true);
  for (const [key,value] of [['bank',81],['affordable',false],['ready',false],['target',200]]) {
    runs[1].quality.purchase=structuredClone(purchase); runs[1].quality.purchase[0][key]=value;
    assert.equal(assessPurchaseDecision({runs},'batch').purchaseDecisionPass,false);
  }
  assert.equal(assessPurchaseDecision({runs:[]},'batch').purchaseDecisionPass,false);
});
test('batch pair requires explicit installer and restores it on update failure', () => {
  assert.throws(() => updatePair(['baseline','batch']), /installer/);
  const clock = () => 123, toggles = [];
  let restored = false;
  const api = {variant:'baseline', productionProjectionEnabled:true, setVariant(){}, restore(){}};
  const p = {modId:'BestDealHelper', isLoaded:true, config:{}, performanceExperiment:api,
    updateUI(){throw Error('update failed');}};
  const context = vm.createContext({Game:{ready:true,mods:{p},ObjectsById:[],Upgrades:{}},
    document:{visibilityState:'visible'},Date:{now:clock},performance,
    install(){return {setEnabled(v){toggles.push(v);}, restore(){restored=true;}};}});
  assert.throws(() => vm.runInContext(`(${updatePair})(['batch','baseline'],install)`,context), /update failed/);
  assert.deepEqual(toggles,[true]); assert.equal(restored,true);
  assert.equal(api.productionProjectionEnabled,true); assert.equal(context.Date.now,clock);
});
test('top three accepts numerical drift, rejects reordered or missing evidence', () => {
  const top = ['a','b','c'].map((token, i) => ({token, score: 3-i, waitSec: i}));
  const runs = [{id:'baseline', unchanged:true, quality:{top}},
    {id:'candidate', unchanged:true, quality:{top:top.map(x => ({...x, score:x.score*1.001}))}}];
  assert.equal(assessTopThree({runs}, 'candidate').topThreePass, true);
  assert.equal(assessTopThree({runs}, 'candidate').purchaseSafety, 'not-assessed');
  runs[1].quality.top.reverse();
  assert.equal(assessTopThree({runs}, 'candidate').topThreePass, false);
  runs[1].quality.top = top.slice(0,2);
  assert.equal(assessTopThree({runs}, 'candidate').topThreePass, false);
  runs[1].quality.top = top; runs[1].unchanged = false;
  assert.equal(assessTopThree({runs}, 'candidate').topThreePass, false);
  assert.equal(assessTopThree({runs}, 'absent').topThreePass, false);
});
test('projection pairing requires positive coverage and restores the flag on failure',()=>{
  const quality={items:[],strategy:[],buildings:[],upgrades:[],first:'a'};
  const runs=[{id:'baseline',unchanged:true,quality},{id:'production-projection',unchanged:true,quality,supported:1}];
  assert.equal(assessUpdatePair({runs}).exactPass,true);runs[1].supported=0;
  assert.equal(assessUpdatePair({runs}).exactPass,false);
  const clock=()=>123,api={variant:'baseline',productionProjectionEnabled:false,setVariant(){},restore(){}};
  const p={modId:'BestDealHelper',isLoaded:true,config:{},performanceExperiment:api,smoothedClickCps:1,updateUI(){throw Error('failure');}};
  const context=vm.createContext({Game:{ready:true,mods:{p},ObjectsById:[],Upgrades:{},buffs:{}},document:{visibilityState:'visible'},Date:{now:clock},performance});
  assert.throws(()=>vm.runInContext(`(${updatePair})(['production-projection','baseline'])`,context),/failure/);
  assert.equal(api.productionProjectionEnabled,false);assert.equal(context.Date.now,clock);
});
test('update pairing rejects state or exact quality drift, distinguishes search strategy', () => {
  const runs = ['baseline', 'indexed', 'compiled', 'search'].map(id => ({id, unchanged: true, quality: {items: [1, 'Infinity'], strategy: [], buildings: [], upgrades: [], first: 'a'}}));
  assert.equal(assessUpdatePair({runs}).exactPass, true);
  runs[3].quality = {items: [2], first: 'b'};
  assert.equal(assessUpdatePair({runs}).searchEquivalent, false);
  assert.equal(assessUpdatePair({runs}).exactPass, true);
  runs[1].unchanged = false;
  assert.equal(assessUpdatePair({runs}).exactPass, false);
  assert.equal(assessUpdatePair({runs: runs.slice(0, 3)}).exactPass, false);
  assert.equal(assessUpdatePair({runs: runs.map(x => ({...x, unchanged: true, quality: undefined}))}).exactPass, false);
});
test('failed update restores clock, variant and click income', () => {
  const clock = () => 123;
  const api = {variant: 'compiled', setVariant(id) {this.variant = id;}, restore() {this.variant = 'baseline';}};
  const p = {modId: 'BestDealHelper', isLoaded: true, config: {}, performanceExperiment: api, smoothedClickCps: 7, updateUI() {this.smoothedClickCps = 0; throw Error('failure');}};
  const game = {ready: true, mods: {p}, ObjectsById: [], Upgrades: {}, buffs: {}};
  const context = vm.createContext({Game: game, document: {visibilityState: 'visible'}, Date: {now: clock}, performance});
  assert.throws(() => vm.runInContext(`(${updatePair})(['baseline','indexed','compiled','search'])`, context), /failure/);
  assert.equal(context.Date.now, clock); assert.equal(api.variant, 'compiled'); assert.equal(p.smoothedClickCps, 7);
});
test('state mutation reports changed fields without gameplay values', () => {
  const api = {variant:'baseline',setVariant(){},restore(){}};
  const game = {ready:true,cookies:123,mods:{},ObjectsById:[],Upgrades:{},UpgradesInStore:[],buffs:{},
    recalculateGains:1,CalculateGains(){this.cookiesPs=20;this.recalculateGains=0;}};
  const p = {modId:'BestDealHelper',isLoaded:true,config:{},performanceExperiment:api,
    strategyState:{scoreByItem:new Map()},lastSortedBuildingTokens:[],lastSortedUpgradeTokens:[],
    autoBuyBestCandidateToken:'',autoBuyTopCandidates:[],updateUI(){
      assert.equal(game.recalculateGains,0); assert.equal(game.cookiesPs,20); game.cookies++;
    }};
  game.mods.p=p;
  const context=vm.createContext({Game:game,document:{visibilityState:'visible'},Date,performance});
  assert.throws(()=>vm.runInContext(`(${updatePair})(['baseline','indexed','compiled','search'])`,context),
    {message:'Update mutated gameplay state: cookies'});
});
