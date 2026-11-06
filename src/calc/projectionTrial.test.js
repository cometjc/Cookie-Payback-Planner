import {beforeEach,expect,it,vi} from "vitest";
import {projectBuildingTrial,projectLateBatchBank} from "./projectionTrial";
import {knownUpgradePrice} from "./knownCpsRules";
const {gate,snapshot,multipliers,price,model,effects}=vi.hoisted(()=>({gate:vi.fn(),snapshot:vi.fn(),multipliers:vi.fn(),price:vi.fn(),model:vi.fn(),effects:vi.fn()}));
vi.mock('./projectionRules',async importOriginal=>({...await importOriginal(),projectionRuleFailure:gate}));
vi.mock('./productionSnapshot',()=>({captureProductionEffects:effects,captureProductionSnapshot:snapshot,captureProductionMultiplierSnapshot:multipliers,captureBuildingPriceSnapshot:price}));
vi.mock('./productionProjection',()=>({createProductionProjection:model}));
vi.mock('./productionMultipliers',()=>({productionMultipliers:()=>({})}));
vi.mock('./buildingPriceModel',()=>({buildingPrice:()=>1}));
beforeEach(()=>{
  vi.resetAllMocks();effects.mockReturnValue({});snapshot.mockReturnValue({});multipliers.mockReturnValue({gods:{ages:0},owned:[]});
  price.mockReturnValue({});model.mockReturnValue({fork:patches=>({cookiesPsRaw:(patches[0]?.[1] ?? 0)+1,unbuffedCps:(patches[0]?.[1] ?? 0)+1})});
});
const fixture=()=>({game:{Tiers:{},buffs:{},cookies:1000,unbuffedCps:1,cookiesPsRaw:1},item:{id:2,type:'building',amount:0,bought:0,tieredUpgrades:{}},fallback:vi.fn()});
it('rejects a stale building discount before the first native price would refresh effects',()=>{
  const {game,item,fallback}=fixture();game.effs={buildingCost:.9};
  expect(projectBuildingTrial(game,item,100,0,()=>1,fallback)).toBeUndefined();
  expect(fallback).toHaveBeenLastCalledWith('base-price-effect');
});
it('rejects a stale or incompatible native base before exploring purchases',()=>{
  const {game,item,fallback}=fixture(),fork=vi.fn(()=>({cookiesPsRaw:1,unbuffedCps:1}));
  model.mockReturnValue({fork});game.cookiesPsRaw=2;
  expect(projectBuildingTrial(game,item,100,0,()=>1,fallback)).toBeUndefined();
  expect(fallback).toHaveBeenLastCalledWith('base-production');
  expect(fork.mock.calls).toEqual([[[],{}]]);
});
it('rejects item accessors without executing them and falls back on malformed input',()=>{
  const {game,item,fallback}=fixture(),getter=vi.fn(()=>{throw Error('must not execute');});
  Object.defineProperty(item,'id',{get:getter});
  expect(projectBuildingTrial(game,item,100,0,()=>1,fallback)).toBeUndefined();
  expect(getter).not.toHaveBeenCalled();expect(fallback).toHaveBeenLastCalledWith('item-descriptor');
  expect(projectBuildingTrial(game,null,100,0,()=>1,fallback)).toBeUndefined();
  expect(fallback).toHaveBeenLastCalledWith('snapshot-or-projection');
});
it('rejects tier and buff accessors without invoking them',()=>{
  const {game,item,fallback}=fixture(),getter=vi.fn(()=>{throw Error('must not execute');});
  Object.defineProperty(item,'tieredUpgrades',{get:getter,configurable:true});
  expect(projectBuildingTrial(game,item,100,0,()=>1,fallback)).toBeUndefined();
  expect(snapshot).not.toHaveBeenCalled();
  Object.defineProperty(item,'tieredUpgrades',{value:{}});
  game.buffs={frenzy:{}};Object.defineProperty(game.buffs.frenzy,'multCpS',{get:getter});
  expect(projectBuildingTrial(game,item,100,0,()=>1,fallback)).toBeUndefined();
  expect(getter).not.toHaveBeenCalled();
});
it('rejects coercive tier lookup keys before fallback can mutate the game',()=>{
  const {game,item,fallback}=fixture();let calls=0;
  game.Tiers[1]={unlock:10};item.tieredUpgrades={1:{tier:{toString(){calls++;return '1';}},buildingTie:item}};
  expect(projectBuildingTrial(game,item,100,0,()=>1,fallback)).toBeUndefined();
  expect(calls).toBe(0);expect(fallback).toHaveBeenLastCalledWith('snapshot-or-projection');
});
it('returns pure trial values without changing the supplied game or building',()=>{
  const {game,item,fallback}=fixture(),before=JSON.stringify({game,item});
  expect(projectBuildingTrial(game,item,100,0,()=>1,fallback).bestBuyToAmount).toBe(100);
  expect(JSON.stringify({game,item})).toBe(before);expect(fallback).not.toHaveBeenCalled();
  delete item.type;
  expect(projectBuildingTrial(game,item,100,0,()=>1,fallback).bestBuyToAmount).toBe(100);
  Object.setPrototypeOf(item,{type:'building'});
  expect(projectBuildingTrial(game,item,100,0,()=>1,fallback).bestBuyToAmount).toBe(100);
  Object.setPrototypeOf(item,Object.defineProperty({},'type',{get(){throw Error('must not execute');}}));
  expect(projectBuildingTrial(game,item,100,0,()=>1,fallback)).toBeUndefined();
  expect(fallback).toHaveBeenLastCalledWith('item-descriptor');
});
it.each([0,1])('uses the guarded special-building model for building %s',id=>{
  const {game,item,fallback}=fixture();item.id=id;
  const before=JSON.stringify({game,item});
  expect(projectBuildingTrial(game,item,100,0,()=>1,fallback).bestBuyToAmount).toBe(100);
  expect(JSON.stringify({game,item})).toBe(before);expect(fallback).not.toHaveBeenCalled();
});
it('rejects rule changes and time-varying production before trial execution',()=>{
  const {game,item,fallback}=fixture();gate.mockReturnValue('function:Has');
  expect(projectBuildingTrial(game,item,100,0,()=>1,fallback)).toBeUndefined();expect(snapshot).not.toHaveBeenCalled();
  gate.mockReturnValue(undefined);multipliers.mockReturnValue({gods:{ages:1},owned:[]});
  expect(projectBuildingTrial(game,item,100,0,()=>1,fallback)).toBeUndefined();expect(model).not.toHaveBeenCalled();
});
it('falls back on snapshot failure, unsupported tier and invalid production buff',()=>{
  const {game,item,fallback}=fixture();snapshot.mockImplementation(()=>{throw Error('unknown input');});
  expect(projectBuildingTrial(game,item,100,0,()=>1,fallback)).toBeUndefined();expect(fallback).toHaveBeenLastCalledWith('snapshot-or-projection');
  snapshot.mockReturnValue({});item.name='Farm';game.Tiers[1]={unlock:10,special:true};item.tieredUpgrades={1:{name:'unknown',tier:1,buildingTie:item}};
  expect(projectBuildingTrial(game,item,100,0,()=>1,fallback)).toBeUndefined();expect(fallback).toHaveBeenLastCalledWith('tier');
  item.tieredUpgrades={};game.buffs={frenzy:{multCpS:0}};
  expect(projectBuildingTrial(game,item,100,0,()=>1,fallback)).toBeUndefined();expect(fallback).toHaveBeenLastCalledWith('buff');
});
it('accepts timed multipliers while refusing opaque timer or observation name without reading getters',()=>{
  const {game,item,fallback}=fixture();let reads=0;
  game.buffs={frenzy:{multCpS:7,time:300,name:'Frenzy'},click:{multClick:777,time:90,name:'Click frenzy'}};
  expect(projectBuildingTrial(game,item,100,0,()=>1,fallback)).toBeDefined();
  expect(fallback).not.toHaveBeenCalled();
  Object.defineProperty(game.buffs.frenzy,'time',{get(){reads++;return 300;}});
  expect(projectBuildingTrial(game,item,100,0,()=>1,fallback)).toBeUndefined();expect(reads).toBe(0);
  game.buffs.frenzy={multCpS:7,time:300,name:{toString(){reads++;return 'Frenzy';}}};
  expect(projectBuildingTrial(game,item,100,0,()=>1,fallback)).toBeUndefined();expect(reads).toBe(0);
  expect(fallback).toHaveBeenLastCalledWith('buff');
});
it('projects an ordinary tier using an ownership overlay without mutating the upgrade',()=>{
  const {game,item,fallback}=fixture();item.name='Farm';
  const upgrade={name:'Cheap hoes',tier:1,buildingTie:item,bought:0,basePrice:100,pool:'',getPrice:(0,eval)(`(${knownUpgradePrice})`)};
  game.Upgrades={'Cheap hoes':upgrade};
  game.Tiers[1]={unlock:10};item.tieredUpgrades={1:upgrade};
  game.Has=()=>0;game.hasBuff=()=>0;game.auraMult=()=>0;
  const result=projectBuildingTrial(game,item,100,0,()=>1,fallback);
  expect(result.bestBuyToAmount).toBe(100);expect(upgrade.bought).toBe(0);
  expect(snapshot).toHaveBeenLastCalledWith(game,{},['Cheap hoes']);
  expect(fallback).not.toHaveBeenCalled();
  game.Upgrades['Cheap hoes']={};
  expect(projectBuildingTrial(game,item,100,0,()=>1,fallback)).toBeUndefined();
  expect(fallback).toHaveBeenLastCalledWith('tier');
});
it('rejects coercive item IDs and tier thresholds before arithmetic',()=>{
  let calls=0;const opaque={valueOf(){calls++;return 1;}};
  const a=fixture();a.item.id=opaque;
  expect(projectBuildingTrial(a.game,a.item,100,0,()=>1,a.fallback)).toBeUndefined();
  expect(a.fallback).toHaveBeenLastCalledWith('item');
  for(const field of ['unlock','bought']){
    const {game,item,fallback}=fixture();game.Tiers[1]={unlock:10};item.tieredUpgrades={1:{tier:1,buildingTie:item}};
    if(field==='unlock')game.Tiers[1].unlock=opaque;else item.bought=opaque;
    expect(projectBuildingTrial(game,item,100,0,()=>1,fallback)).toBeUndefined();
    expect(fallback).toHaveBeenLastCalledWith('snapshot-or-projection');
  }
  expect(calls).toBe(0);
});

it('rejects inherited enumerable buffs without reading their accessors',()=>{
  const {game,item,fallback}=fixture(),getter=vi.fn(()=>({multCpS:7}));
  const prototype=Object.defineProperty({},'frenzy',{enumerable:true,get:getter});
  game.buffs=Object.create(prototype);
  expect(projectBuildingTrial(game,item,100,0,()=>1,fallback)).toBeUndefined();
  expect(getter).not.toHaveBeenCalled();
  expect(fallback).toHaveBeenLastCalledWith('buff');
});

it('rejects a global multiplier upgrade repurposed as an ordinary tier',()=>{
  const {game,item,fallback}=fixture();item.name='Farm';
  game.Tiers[1]={unlock:10};item.tieredUpgrades={1:{name:"Santa's dominion",tier:1,buildingTie:item,bought:0,pool:"",basePrice:100,getPrice:(0,eval)(`(${knownUpgradePrice})`)}};game.Has=()=>0;game.hasBuff=()=>0;game.auraMult=()=>0;
  expect(projectBuildingTrial(game,item,100,0,()=>1,fallback)).toBeUndefined();
  expect(fallback).toHaveBeenLastCalledWith('tier');
});
it('requires every late bank ledger price to match, including equal-total changes',()=>{
  const {game,item}=fixture();game.ObjectsById=[null,null,item];const prices=Array(100).fill(1);
  expect(projectLateBatchBank(game,item,100,10,prices)).toBe(1010);
  prices[0]=0;prices[1]=2;
  expect(projectLateBatchBank(game,item,100,10,prices)).toBeUndefined();
});
it.each(['value','getter'])('rejects Array serialization %s hooks before any model callback',kind=>{
  const {game,item}=fixture();game.ObjectsById=[null,null,item];let reads=0,result;
  const original=Object.getOwnPropertyDescriptor(Array.prototype,'toJSON');
  try {
    Object.defineProperty(Array.prototype,'toJSON',kind==='value'
      ? {configurable:true,value(){reads++;return this;}}
      : {configurable:true,get(){reads++;return function(){return this;};}});
    result=projectLateBatchBank(game,item,100,10,Array(100).fill(1));
  } finally {if(original)Object.defineProperty(Array.prototype,'toJSON',original);else delete Array.prototype.toJSON;}
  expect(result).toBeUndefined();expect(reads).toBe(0);expect(snapshot).not.toHaveBeenCalled();
});
