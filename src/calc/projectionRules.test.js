import {expect,it,vi} from "vitest";
import {projectionRuleFailure} from "./projectionRules";
import {pantheonBindingFailure} from "./pantheonBinding";
import {knownCpsFunctions,knownCpsHelpers,knownSpecialBuildingCps,knownBuildingCps,knownBuildingPrice,knownModifyBuildingPrice,knownBuildingRelay,knownHasAura,knownCcseHasAura,knownNativeWin} from "./knownCpsRules";
vi.mock("./pantheonBinding", () => ({pantheonBindingFailure: vi.fn(() => "pantheon-closure")}));
const fn=source=>(0,eval)(`(${source})`);
function fixture() {
  const game={version:2.053,Objects:{},ObjectsById:[],customBuildings:{}};
  for(const [key,source] of Object.entries(knownCpsFunctions)) game[key]=fn(source);
  game.GetHeavenlyMultiplier=fn(knownCpsHelpers.GetHeavenlyMultiplier);
  game.modifyBuildingPrice=fn(knownModifyBuildingPrice);
  for(const [id,name] of ['Cursor','Grandma','Farm'].entries()) {
    const b={id,name,amount:1,bought:1,cps:fn((id<2?knownSpecialBuildingCps:knownBuildingCps)[name]),getPrice:fn(knownBuildingPrice)};
    game.Objects[name]=b;game.ObjectsById.push(b);game.customBuildings[name]={cpsAdd:[],cpsMult:[fn(knownBuildingRelay)]};
  }
  return game;
}
it('accepts known sources and empty CCSE relay downstream without executing functions',()=>{
  expect(projectionRuleFailure(fixture())).toBeUndefined();
});
it('rejects unmodeled native nested reads and coercion callbacks without executing them',()=>{
  let calls=0;
  const callback=()=>{calls++;throw Error('must not execute');};
  const buff=fixture();buff.buffs={'Cursed finger':Object.defineProperty({},'power',{get:callback})};
  expect(projectionRuleFailure(buff)).toBe('buff:Cursed finger');
  const wrinkler=fixture();wrinkler.wrinklers=[Object.defineProperty({},'phase',{get:callback})];
  expect(projectionRuleFailure(wrinkler)).toBe('accessor');
  wrinkler.wrinklers=[{phase:{valueOf:callback}}];
  expect(projectionRuleFailure(wrinkler)).toBe('wrinklerData');
  for(const field of ['cookiesPsRaw','cookiesPsRawHighest','BuildingsOwned']){
    const g=fixture();g[field]={valueOf:callback};
    expect(projectionRuleFailure(g)).toBe(`scalar:${field}`);
  }
  for(const field of ['pool','tier']){
    const g=fixture();g.Upgrades={cookie:{name:'cookie',bought:1,[field]:{valueOf:callback}}};
    expect(projectionRuleFailure(g)).toBe('upgradeData');
  }
  const valid=fixture();valid.wrinklers=[{phase:2}];valid.cookiesPsRawHighest=1;
  valid.Upgrades={cookie:{name:'cookie',bought:1,pool:'prestige',tier:1}};
  expect(projectionRuleFailure(valid)).toBeUndefined();expect(calls).toBe(0);
  valid.Objects.Farm.bought={valueOf:callback};
  expect(projectionRuleFailure(valid)).toBe('buildingData');expect(calls).toBe(0);
});
it('rejects inherited named buff getters before native price helpers can execute them',()=>{
  let calls=0;
  for(const name of ['Everything must go','Crafty pixies','Nasty goblins',"Haggler's luck","Haggler's misery"]){
    const g=fixture();g.buffs=Object.create(Object.defineProperty({},name,{get(){calls++;return {};}}));
    expect(projectionRuleFailure(g)).toBe('buffData');
    g.buffs=Object.create(null);expect(projectionRuleFailure(g)).toBeUndefined();
  }
  expect(calls).toBe(0);
});
it('rejects Pantheon helpers whose hidden minigame binding cannot be verified',()=>{
  const g=fixture();
  g.hasGod=fn(knownCpsHelpers.hasGod);
  g.hasAura=fn(knownHasAura);
  g.Objects.Temple={minigame:{gods:{industry:{id:1}},slot:[-1,-1,-1]}};
  expect(projectionRuleFailure(g)).toBe('pantheon-closure');
});
it('rechecks changed helpers, source wrappers and populated downstream hooks',()=>{
  const g=fixture();g.Has=()=>1;expect(projectionRuleFailure(g)).toBe('function:Has');
  const a=fixture();a.customBuildingsAll={cpsMult:[()=>2]};expect(projectionRuleFailure(a)).toBe('hook:allBuildingCps');
  const b=fixture();b.customBuildings.Farm.cpsAdd=[()=>1];expect(projectionRuleFailure(b)).toBe('hook:cpsAdd:Farm');
  const c=fixture();expect(projectionRuleFailure(c)).toBeUndefined();c.Objects.Farm.cps=()=>1;expect(projectionRuleFailure(c)).toBe('cps:Farm');
});
it('rejects getters before invoking them and sparse hook arrays',()=>{
  const g=fixture();Object.defineProperty(g,'Has',{get(){throw Error('must not execute');}});expect(projectionRuleFailure(g)).toBe('accessor');
  const h=fixture();h.customBuildings.Farm.cpsMult=Array(1);expect(projectionRuleFailure(h)).toBe('hook:cpsMult:Farm');
});
it('rejects inherited enumerable hooks on empty and relay arrays without calling them',()=>{
  for(const relay of [false,true]) {
    const g=fixture(),hooks=relay?g.customBuildings.Farm.cpsMult:[];
    const prototype=Object.create(Array.prototype);
    Object.defineProperty(prototype,'extra',{enumerable:true,get(){throw Error('must not execute');}});
    Object.setPrototypeOf(hooks,prototype);
    if(!relay)g.customAuraMult=hooks;
    expect(projectionRuleFailure(g)).toBe(relay?'hook:cpsMult:Farm':'hook:customAuraMult');
  }
});
it('rejects helper data accessors without executing them',()=>{
  const g=fixture();g.Upgrades={cookie:{name:'cookie',bought:1}};
  Object.defineProperty(g.Upgrades.cookie,'pool',{get(){throw Error('must not execute');}});
  expect(projectionRuleFailure(g)).toBe('accessor');
  const a=fixture();a.dragonAuras=[{name:'none',id:0}];
  Object.defineProperty(a.dragonAuras[0],'name',{get(){throw Error('must not execute');}});
  expect(projectionRuleFailure(a)).toBe('accessor');
  const b=fixture();b.Upgrades={cookie:{name:'other',bought:1}};
  expect(projectionRuleFailure(b)).toBe('upgradeData');
});

it('rejects inherited upgrade entries before helpers can read them',()=>{
  const g=fixture(),getter=()=>{throw Error('must not execute');};
  g.Upgrades=Object.create(Object.defineProperty({},'Thousand fingers',{get:getter}));
  expect(projectionRuleFailure(g)).toBe('upgradeData');
});

it('rejects non-enumerable own upgrade getters before helper execution',()=>{
  const g=fixture();let reads=0;
  g.Upgrades={};Object.defineProperty(g.Upgrades,'Thousand fingers',{get(){reads++;return {bought:1};}});
  expect(projectionRuleFailure(g)).toBe('accessor');expect(reads).toBe(0);
});
it('validates hasAura before using an otherwise authenticated Pantheon helper',()=>{
  for(const source of [knownHasAura,knownCcseHasAura]){
    const g=fixture();g.hasGod=fn(knownCpsHelpers.hasGod);g.hasAura=fn(source);
    vi.mocked(pantheonBindingFailure).mockReturnValueOnce(undefined);
    expect(projectionRuleFailure(g)).toBeUndefined();
  }
  const g=fixture();g.hasGod=fn(knownCpsHelpers.hasGod);let calls=0;
  g.hasAura=()=>{calls++;return false;};
  vi.mocked(pantheonBindingFailure).mockReturnValueOnce(undefined);
  expect(projectionRuleFailure(g)).toBe('helper:hasAura');expect(calls).toBe(0);
  Object.defineProperty(g,'hasAura',{get(){calls++;return fn(knownHasAura);}});
  vi.mocked(pantheonBindingFailure).mockReturnValueOnce(undefined);
  expect(projectionRuleFailure(g)).toBe('accessor');expect(calls).toBe(0);
});
it('rejects aura selection and non-enumerable aura accessors before helper execution',()=>{
  const g=fixture();let reads=0;
  Object.defineProperty(g,'dragonAura',{get(){reads++;return 0;}});
  expect(projectionRuleFailure(g)).toBe('accessor');expect(reads).toBe(0);
  const a=fixture();a.dragonAuras=[];
  Object.defineProperty(a.dragonAuras,'0',{get(){reads++;return {name:'none',id:0};}});
  expect(projectionRuleFailure(a)).toBe('accessor');expect(reads).toBe(0);
});
it('rejects aura label and ID coercion objects before native helper comparisons',()=>{
  let calls=0;
  for(const table of ['dragonAuras','dragonAurasBN'])for(const field of ['name','id']){
    const g=fixture(),aura={name:'none',id:0,[field]:{valueOf(){calls++;return 0;},toString(){calls++;return 'none';}}};
    g[table]=table==='dragonAuras'?[aura]:{none:aura};
    expect(projectionRuleFailure(g)).toBe('auraData');
  }
  expect(calls).toBe(0);
});
it('rejects overridden building array methods without invoking them',()=>{
  let calls=0;
  for(const method of ['map','some','includes']){
    const g=fixture();g.cookiesPsByType={};g.ObjectsById[method]=()=>{calls++;return [];};
    expect(projectionRuleFailure(g)).toBe('buildings');
  }
  const g=fixture();Object.setPrototypeOf(g.ObjectsById,Object.create(Array.prototype,{map:{get(){calls++;return ()=>[];}}}));
  expect(projectionRuleFailure(g)).toBe('buildings');expect(calls).toBe(0);
});
it('rejects output setters and readonly simulation fields without invoking callbacks',()=>{
  const g=fixture();let calls=0;
  Object.defineProperty(g.Objects.Farm,'storedCps',{set(){calls++;}});
  expect(projectionRuleFailure(g)).toBe('output:Farm.storedCps');expect(calls).toBe(0);
  const a=fixture();Object.defineProperty(a,'cookiesPs',{set(){calls++;}});
  expect(projectionRuleFailure(a)).toBe('output:cookiesPs');expect(calls).toBe(0);
  const b=fixture();Object.defineProperty(b.Objects.Farm,'amount',{value:1,writable:false});
  expect(projectionRuleFailure(b)).toBe('output:Farm.amount');
});
it('validates achievement reads, Win callbacks and pending awards before projection',()=>{
  const g=fixture();g.cookiesPsRaw=10;g.CpsAchievements=[{threshold:1,name:'CPS'}];
  g.Win=fn(knownNativeWin);g.Achievements={CPS:{won:0}};
  expect(projectionRuleFailure(g)).toBe('achievement-pending');
  g.Achievements.CPS.won=1;
  expect(projectionRuleFailure(g)).toBeUndefined();
  let calls=0;g.customWin=[()=>{calls++;}];
  expect(projectionRuleFailure(g)).toBe('hook:customWin');expect(calls).toBe(0);
  g.customWin=[];Object.defineProperty(g.CpsAchievements[0],'threshold',{get(){calls++;return 1;}});
  expect(projectionRuleFailure(g)).toBe('accessor');expect(calls).toBe(0);
});
it('rejects non-enumerable upgrade prototype entries without reading them',()=>{
  const game=fixture();game.Upgrades={};let reads=0,result;
  expect(projectionRuleFailure(game)).toBeUndefined();
  try {
    Object.defineProperty(Object.prototype,'Stevia Caelestis',{configurable:true,get(){reads++;return {name:'Stevia Caelestis',bought:1};}});
    result=projectionRuleFailure(game);
  } finally {delete Object.prototype['Stevia Caelestis'];}
  expect(result).toBe('upgradePrototype');expect(reads).toBe(0);
  expect(projectionRuleFailure(game)).toBeUndefined();
});
it('rejects a standard prototype function replaced by an accessor without invoking it',()=>{
  const game=fixture();game.Upgrades={};let reads=0,result;
  const original=Object.getOwnPropertyDescriptor(Object.prototype,'constructor');
  try {
    Object.defineProperty(Object.prototype,'constructor',{configurable:true,get(){reads++;return Object;}});
    result=projectionRuleFailure(game);
  } finally {Object.defineProperty(Object.prototype,'constructor',original);}
  expect(result).toBe('upgradePrototype');expect(reads).toBe(0);
});

it('accepts standard numeric output records and rejects unknown keys or shared records', () => {
  const game=fixture();game.cookiesPsByType={Cursor:1,Grandma:0,Farm:2,'"egg"':9};
  game.cookiesMultByType={kittens:1,eggs:1};
  expect(projectionRuleFailure(game)).toBeUndefined();
  for(const value of [{},undefined,NaN,Infinity,-1]) {
    game.cookiesPsByType.Cursor=value;
    expect(projectionRuleFailure(game)).toBe('output:cookiesPsByType');
  }
  game.cookiesPsByType={unknown:1};expect(projectionRuleFailure(game)).toBe('output:cookiesPsByType');
  let calls=0;game.cookiesPsByType=Object.defineProperty({},'unknown',{get(){calls++;return 1;}});
  expect(projectionRuleFailure(game)).toBe('output:cookiesPsByType');expect(calls).toBe(0);
  game.cookiesPsByType={[Symbol('unknown')]:1};expect(projectionRuleFailure(game)).toBe('output:cookiesPsByType');
  game.cookiesPsByType=game.cookiesMultByType={};expect(projectionRuleFailure(game)).toBe('output:alias');
});
it('rejects an upgrade table aliased as a numeric output record before native writes can change ownership', () => {
  const game=fixture();game.Upgrades={'"egg"':{name:'"egg"',bought:1}};
  expect(projectionRuleFailure(game)).toBeUndefined();
  game.cookiesPsByType=game.Upgrades;
  expect(projectionRuleFailure(game)).toBe('output:cookiesPsByType');
});
