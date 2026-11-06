import {expect,it} from "vitest";
import {captureProductionEffects,captureProductionMultiplierSnapshot,captureBuildingPriceSnapshot} from "./productionSnapshot";
import {buildingPrice} from "./buildingPriceModel";
import {knownCookiePowers,knownCpsFunctions} from "./knownCpsRules";
import {productionMultipliers} from "./productionMultipliers";

function fixture() {
  const owned=new Set(['cookie','Starlove']);
  return {Objects:{Cursor:{level:10,minigameLoaded:true,minigame:{effs:{cps:0,milk:1.2}}},Grandma:{level:0,minigameLoaded:true,minigame:{effs:{cps:1.5,milk:1.1}}}},
    Upgrades:{cookie:{name:'cookie'},Starlove:{name:'Starlove'}},cookieUpgrades:[{name:'cookie',power:(0,eval)(`(${knownCookiePowers[0]})`)}],
    Has:name=>Number(owned.has(name)),hasGod:name=>name==='seasons'?2:0,auraMult:()=>0,GetHeavenlyMultiplier:()=>1,getVeilBoost:()=>0,
    goldenCookieUpgrades:[],ascensionMode:0,prestige:0,heavenlyPower:0,heralds:0,santaLevel:0,AchievementsOwned:0,startDate:0,lumps:0,shimmerTypes:{golden:{n:0}},bakeryName:''};
}
it('rebuilds effects in original order, including zero-reset semantics',()=>{
  const game=fixture(),effects=captureProductionEffects(game);
  expect(effects.cps).toBe(1.5);expect(effects.milk).toBe(1.2*1.1);
  game.Objects.Cursor.minigame.effs.cps=NaN;
  expect(()=>captureProductionEffects(game)).toThrow('Invalid production field');
});
it('resolves known cookie powers without executing callbacks or reading stale effects',()=>{
  const game=fixture();game.effs={cps:999};
  const s=captureProductionMultiplierSnapshot(game);
  expect(s.cookiePowers).toEqual([3*1.2]);expect(s.cpsEffect).toBe(1.5);
  expect(productionMultipliers(s,0).rawMult).toBe(1.5*(1+3*1.2*.01));
  game.cookieUpgrades[0].power=(0,eval)(`(${knownCookiePowers[1]})`);
  expect(captureProductionMultiplierSnapshot(game).cookiePowers).toEqual([6]);
  game.cookieUpgrades[0].power=()=>{throw Error('must not execute');};
  expect(()=>captureProductionMultiplierSnapshot(game)).toThrow('Unknown cookie power');
});
it('rejects object upgrade names before passing them to native Has',()=>{
  const game=fixture();let calls=0;
  game.goldenCookieUpgrades=[{toString(){calls++;return 'cookie';}}];
  expect(()=>captureProductionMultiplierSnapshot(game)).toThrow('Invalid upgrade name');
  expect(calls).toBe(0);
});
it('rejects effect getters before invoking them',()=>{
  const game=fixture();Object.defineProperty(game.Objects.Cursor.minigame.effs,'cps',{enumerable:true,get(){throw Error('getter executed');}});
  expect(()=>captureProductionEffects(game)).toThrow('Unsupported production field');
});
it('rejects inherited effects that native for-in would include',()=>{
  const game=fixture();Object.setPrototypeOf(game.Objects.Cursor.minigame.effs,{buildingCost:.5});
  expect(()=>captureProductionEffects(game)).toThrow('Inherited production field');
});
it('captures price inputs without calling getPrice or stale effects',()=>{
  const game=fixture(),building={basePrice:15,amount:3,free:1,fortune:0,getPrice(){throw Error('must not execute');}};
  game.ObjectsById=[building];game.priceIncrease=1.15;game.hasBuff=()=>false;
  game.Objects.Grandma.minigame.effs.buildingCost=.9;
  const s=captureBuildingPriceSnapshot(game,building);
  expect(buildingPrice(s)).toBe(Math.ceil(15*Math.pow(1.15,2)*.9));
  expect(()=>captureBuildingPriceSnapshot(game,{})).toThrow('Unknown price building');
});
it('retains every pinned multiplier dependency without querying unrelated upgrade ownership',()=>{
  const game=fixture(),names=[...new Set([...knownCpsFunctions.CalculateGains.matchAll(/Game\.Has\('((?:\\.|[^'])*)'\)/g)].map(m=>m[1].replaceAll("\\'","'")))];
  game.Upgrades=Object.fromEntries([...names,'unrelated'].map(name=>[name,{name}]));
  for(const selected of [[],...names.map(name=>[name]),names,names.filter(name=>name!=='Occult obstruction')]) {
    const owned=new Set(selected);let unrelated=0;
    game.Has=name=>{if(name==='unrelated')unrelated++;return Number(owned.has(name));};
    const snapshot=captureProductionMultiplierSnapshot(game);
    expect(productionMultipliers(snapshot,10000)).toEqual(productionMultipliers({...snapshot,owned:[...selected,'unrelated']},10000));
    expect(unrelated).toBe(0);
  }
  let reads=0;
  Object.defineProperty(game.Upgrades,'Heralds',{get(){reads++;throw Error('getter executed');}});
  expect(()=>captureProductionMultiplierSnapshot(game)).toThrow('Unsupported production field');
  expect(reads).toBe(0);
});

it('rejects a minigame receiver that follows the reassigned Game.effs output', () => {
  const game={effs:{cursorCps:2},Objects:{Farm:{minigameLoaded:true}}};
  game.Objects.Farm.minigame=game;
  expect(()=>captureProductionEffects(game)).toThrow('Unsupported minigame effect owner');
  game.Objects.Farm.minigame={effs:{cursorCps:2}};
  expect(captureProductionEffects(game)).toEqual({cursorCps:2});
  game.effs={cursorCps:4};
  expect(captureProductionEffects(game)).toEqual({cursorCps:2});
});
