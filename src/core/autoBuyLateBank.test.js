import {beforeEach,expect,it,vi} from 'vitest';
const {game,bound}=vi.hoisted(()=>({game:{},bound:vi.fn()}));
vi.mock('./globals',()=>({Game:game}));
vi.mock('../calc/projectionTrial',()=>({projectLateBatchBank:bound,projectBuildingTrial:vi.fn()}));
import {tryAutoBuyFromMainLoop,getCurrentBuyCount} from './lifecycle';
import {enterSandBox,leaveSandBox,getBankCookies} from '../calc/sim';
beforeEach(()=>{vi.resetAllMocks();for(const key of Object.getOwnPropertyNames(game))delete game[key];});
function fixture(seconds=10) {
  bound.mockReturnValue(20);
  const item={type:'building',id:0,amount:200,bought:200,getPrice:()=>1,buy:vi.fn()};
  const win=()=>{},logic=()=>{},gains=vi.fn();
  Object.assign(game,{cookies:1000,cookiesPsRaw:1,unbuffedCps:1,buyMode:1,buyBulk:100,Win:win,Logic:logic,CalculateGains:gains,CpsAchievements:[],cookiesPsRawHighest:1});
  const planner={config:{autoBuy:true,isBanking:true,bankingSeconds:seconds},performanceExperiment:{productionProjectionEnabled:true},
    enterSandBox,leaveSandBox,getBankCookies,getCurrentBuyCount,estimateWaitSeconds:()=>0,
    autoBuyBestCandidate:item,autoBuyBestCandidateAt:Date.now(),autoBuyCandidateMaxAgeMs:10000,autoBuyAttemptCount:0,
    highPriorityIds:new Set(),purchaseRateWindow:{add(){}},autoBuyRateWindow:{add(){}},autoBuyFastTrackUiMs:100};
  return {item,planner,win,logic,gains};
}
it.each([10,'10',true,false])('proves the reserve after the native price ledger with seconds %s',seconds=>{
  const {item,planner,win,logic,gains}=fixture(seconds);
  tryAutoBuyFromMainLoop.call(planner);
  expect(bound).toHaveBeenCalledWith(game,item,100,Number(seconds),Array(100).fill(1));
  expect(item.buy.mock.calls).toEqual([[100]]);expect(gains).toHaveBeenCalledTimes(1);
  expect(game.cookies).toBe(1000);expect(game.Win).toBe(win);expect(game.Logic).toBe(logic);
});
it.each(['enterSandBox','leaveSandBox','getBankCookies'])('keeps replaced %s accessors on the native path',method=>{
  const {item,planner,gains}=fixture(),native=planner[method];let reads=0;
  Object.defineProperty(planner,method,{get(){reads++;return native;}});
  tryAutoBuyFromMainLoop.call(planner);
  expect(bound).not.toHaveBeenCalled();expect(reads).toBeGreaterThan(0);
  expect(item.buy.mock.calls).toEqual([[100]]);expect(gains).toHaveBeenCalledTimes(101);
});
function shiftCash(item,cash) {
  Object.defineProperty(game,'buyBulk',{configurable:true,get(){
    Object.defineProperty(game,'buyBulk',{configurable:true,writable:true,value:100});game.cookies=cash;
    Object.defineProperty(item,'amount',{configurable:true,get(){
      Object.defineProperty(item,'amount',{configurable:true,writable:true,value:200});game.cookies=1000;return 200;
    }});return 100;
  }});
}
it('rejects proof when native enter changed the cash used by the first ledger',()=>{
  const {item,planner}=fixture();shiftCash(item,0);
  tryAutoBuyFromMainLoop.call(planner);
  expect(bound).not.toHaveBeenCalled();expect(item.buy).not.toHaveBeenCalled();expect(game.cookies).toBe(0);
});
it('does not add valueOf calls when original cash is an object',()=>{
  const {item,planner}=fixture();let reads=0;const cash={valueOf(){reads++;return 0;}};shiftCash(item,cash);
  tryAutoBuyFromMainLoop.call(planner);
  expect(bound).not.toHaveBeenCalled();expect(item.buy).not.toHaveBeenCalled();expect(reads).toBe(1);expect(game.cookies).toBe(cash);
});
it('uses native equality at the reserve when the strict proof is unavailable',()=>{
  const {item,planner,gains}=fixture();game.cookies=110;
  tryAutoBuyFromMainLoop.call(planner);
  expect(bound).not.toHaveBeenCalled();expect(item.buy.mock.calls).toEqual([[100]]);expect(gains).toHaveBeenCalledTimes(101);
});
it('never captures a model when the first price ledger cannot afford the batch',()=>{
  const {item,planner}=fixture();game.cookies=10;
  tryAutoBuyFromMainLoop.call(planner);
  expect(bound).not.toHaveBeenCalled();expect(item.buy).not.toHaveBeenCalled();expect(game.cookies).toBe(10);
});
it('restores cash and native methods if the proof helper throws',()=>{
  const {item,planner,win,logic}=fixture();bound.mockImplementation(()=>{throw Error('proof failed');});
  expect(()=>tryAutoBuyFromMainLoop.call(planner)).toThrow('proof failed');
  expect(item.buy).not.toHaveBeenCalled();expect(game.cookies).toBe(1000);expect(game.Win).toBe(win);expect(game.Logic).toBe(logic);
});
