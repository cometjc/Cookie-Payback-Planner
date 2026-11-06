import {expect,it} from "vitest";
import {simulateBuildingTrial} from "./buildingTrial";

it('retains each intermediate price, production, bank and elapsed wait for buy100',()=>{
  const prices=[],production=[],waits=[];
  const result=simulateBuildingTrial({amount:0,buyCount:100,cookies:0,oldCps:1,rawCps:1,bankSeconds:10,
    price:amount=>{prices.push(amount);return 15*Math.pow(1.15,amount);},
    production:amount=>{production.push(amount);return {cookiesPsRaw:amount+1,unbuffedCps:amount+1};},
    wait:(price,cookies,cps,elapsed,bank)=>{waits.push({price,cookies,cps,elapsed,bank});return (price+bank-cookies)/cps;}});
  expect(prices).toEqual(Array.from({length:100},(_,i)=>i));
  expect(production).toEqual(Array.from({length:100},(_,i)=>i+1));
  expect(waits[1]).toMatchObject({cookies:10,cps:2,bank:20,elapsed:25});
  expect(result.bestBuyToAmount).toBe(100);expect(result.sim.currentCookies).toBe(1000);
});

it('matches a mutable non-tier oracle across buy counts, bank and cookie balances',()=>{
  for (const buyCount of [1,10,100]) for (const bankSeconds of [0,10]) for (const cookies of [0,100,1e9]) {
    const input={amount:7,buyCount,cookies,oldCps:80,rawCps:80,bankSeconds,
      price:amount=>Math.ceil(15*Math.pow(1.15,amount)),production:amount=>({cookiesPsRaw:(amount+1)*10,unbuffedCps:(amount+1)*10}),
      wait:(price,current,cps,_elapsed,bank)=>(price+bank-current)/cps};
    // Independent mutable sandbox oracle follows the original public-method order.
    let amount=7,cps=80,raw=80,current=cookies,paid=0,elapsed=0,best=0,to=0,wait=Infinity;
    for(let step=0;step<Math.max(1,Math.ceil(50/buyCount));step++) {
      const units=buyCount-amount%buyCount;
      for(let i=0;i<units;i++) {
        const price=input.price(amount),bank=bankSeconds*raw;
        if(current>=price+bank){paid+=price;current-=price;}
        else if(current<price+bank&&current>=bank){elapsed+=(price+bank-current)/cps;paid+=current-bank;current=bank;}
        else {elapsed+=(price+bank-current)/cps;current=bank;}
        amount++;cps=(amount+1)*10;raw=cps;
      }
      const time=elapsed+paid/cps,acceleration=(cps-80)/time;
      if(acceleration>best){best=acceleration;to=amount;wait=time;}else break;
    }
    expect(simulateBuildingTrial(input)).toEqual({bestCpsAcceleration:best,bestBuyToAmount:to,bestWaitTime:wait,sim:{originalCookies:cookies,currentCookies:current,paidCookies:paid,waitTime:elapsed}});
  }
});

it.each([[10,130,7],[100,200,77]])('fills the next multiple for buy%s from 123', (buyCount,target,units)=>{
  const prices=[];
  const result=simulateBuildingTrial({amount:123,buyCount,cookies:1e9,oldCps:123,rawCps:123,bankSeconds:0,
    price:amount=>{prices.push(amount);return 1;},
    production:amount=>({cookiesPsRaw:amount,unbuffedCps:amount}),wait:()=>0});
  expect(result.bestBuyToAmount%buyCount).toBe(0);
  expect(prices.slice(0,units)).toEqual(Array.from({length:units},(_,i)=>123+i));
  expect(result.bestBuyToAmount).toBeGreaterThanOrEqual(target);
});

it('rejects invalid trust-boundary inputs and leaves game state outside the trial',()=>{
  expect(()=>simulateBuildingTrial({amount:-1})).toThrow('Invalid building trial');
  const input={amount:0,buyCount:100,cookies:0,oldCps:1,rawCps:1,bankSeconds:0,price:()=>1,production:()=>({cookiesPsRaw:NaN,unbuffedCps:1}),wait:()=>1};
  expect(()=>simulateBuildingTrial(input)).toThrow('Invalid projected production');expect(input.amount).toBe(0);
  expect(()=>simulateBuildingTrial({...input,wait:()=>NaN})).toThrow('Invalid projected wait');
});

it('purchases a tier after a bulk batch and keeps exploring an unprofitable threshold',()=>{
  const trace=[];
  const run=buyCount=>simulateBuildingTrial({amount:0,buyCount,cookies:1e9,oldCps:10,rawCps:10,bankSeconds:0,
    price:()=>1,tier:{unlock:10,price:amount=>{trace.push(['tier',amount]);return 100;}},
    production:(amount,owned)=>{trace.push(['production',amount,owned]);return {cookiesPsRaw:owned?100:10,unbuffedCps:owned?100:10};},wait:()=>0});
  const small=run(1);
  expect(small.bestBuyToAmount).toBe(10);
  expect(trace.findIndex(x=>x[0]==='tier')).toBe(10);
  expect(trace[11]).toEqual(['production',10,true]);
  trace.length=0;
  expect(run(100).bestBuyToAmount).toBe(100);
  expect(trace[100]).toEqual(['tier',100]);
  expect(trace[101]).toEqual(['production',100,true]);
});
it('skips affordable monotone production while retaining exact price and payment arithmetic',()=>{
  const production=[];
  const input={amount:123,buyCount:100,cookies:1e12,oldCps:124,rawCps:124,bankSeconds:10,
    price:amount=>1+amount*.01,production:amount=>({cookiesPsRaw:amount+1,unbuffedCps:amount+1}),wait:()=>1};
  const expected=simulateBuildingTrial(input);
  const actual=simulateBuildingTrial({...input,monotoneProduction:true,production:amount=>{
    production.push(amount);return input.production(amount);
  }});
  expect(actual).toEqual(expected);expect(production).toEqual([200]);
});
it('retains intermediate waits at the endpoint bank equality boundary',()=>{
  const production=[],input={amount:0,buyCount:10,cookies:120,oldCps:1,rawCps:1,bankSeconds:10,
    price:()=>1,production:amount=>({cookiesPsRaw:amount+1,unbuffedCps:amount+1}),
    wait:(price,cookies,cps,_elapsed,bank)=>(price+bank-cookies)/cps};
  const expected=simulateBuildingTrial(input);
  expect(simulateBuildingTrial({...input,monotoneProduction:true,production:amount=>{
    production.push(amount);return input.production(amount);
  }})).toEqual(expected);
  expect(production.slice(0,11)).toEqual([10,...Array.from({length:10},(_,i)=>i+1)]);
});
it('retains sequential increments when the batch endpoint exceeds safe integers',()=>{
  const amount=Number.MAX_SAFE_INTEGER;
  const input={amount,buyCount:100,cookies:1e10,oldCps:amount,rawCps:amount,bankSeconds:0,
    price:()=>1,production:n=>({cookiesPsRaw:n,unbuffedCps:n}),wait:()=>0};
  expect(simulateBuildingTrial({...input,monotoneProduction:true})).toEqual(simulateBuildingTrial(input));
});
it('does not probe an endpoint while the current reserve already exceeds the balance',()=>{
  const production=[],input={amount:0,buyCount:100,cookies:0,oldCps:1,rawCps:1,bankSeconds:10,
    price:()=>1,production:amount=>{production.push(amount);return {cookiesPsRaw:amount+1,unbuffedCps:amount+1};},
    wait:(price,cookies,cps,_elapsed,bank)=>(price+bank-cookies)/cps};
  simulateBuildingTrial({...input,monotoneProduction:true});
  expect(production).toEqual(Array.from({length:100},(_,i)=>i+1));
});
it('matches sequential trials over seeded scales, reserves, multiples and tier boundaries',()=>{
  let seed=37;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  for(let trial=0;trial<3000;trial++){
    const scale=[1e-12,1,1e12,1e100,1e300][trial%5],amount=[0,7,123,199,200][trial%5];
    const production=(n,tier)=>({cookiesPsRaw:(n+1)*scale*(tier?2:1),unbuffedCps:(n+1)*scale*(tier?3:1)});
    const base=production(amount,false);
    const input={amount,buyCount:[10,100][trial%2],cookies:random()*1000*scale,oldCps:base.unbuffedCps,rawCps:base.cookiesPsRaw,
      bankSeconds:[0,.1,10][trial%3],price:n=>scale*(1+n*.01),production,
      tier:trial%4?undefined:{unlock:amount+5,price:()=>17*scale},
      wait:(price,cookies,cps,_elapsed,bank)=>(price+bank-cookies)/cps};
    expect(simulateBuildingTrial({...input,monotoneProduction:true})).toEqual(simulateBuildingTrial(input));
  }
});
