// Offline comparison of the existing approximate model; never connects to a game.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const root=fileURLToPath(new URL('../../',import.meta.url));
const common=execFileSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim();
const require=createRequire(path.join(path.dirname(common),'package.json'));
const {build}=require('esbuild');
const bundle=await build({entryPoints:[path.join(root,'src/search/algorithms.ts')],bundle:true,write:false,format:'iife',globalName:'search',platform:'node'});
const game={cookies:0,unbuffedCps:1};
const context=vm.createContext({Game:game,performance});vm.runInContext(bundle.outputFiles[0].text,context);
const api=context.search,horizons={shortSec:30,longSec:120,longWeight:0.5};
const rows=[];
for(const bank of [0,25])for(const cookies of [0,100])for(const depth of [2,3]){
 game.cookies=cookies;
 const items=[10,35,120,400,900].map((price,id)=>({id,type:'building',getPrice:()=>price,SingleCps:[1,5,25,90,100][id],BestCpsAcceleration:0,BestWaitTime:0}));
 const planner={config:{lookaheadTopK:9,beamWidth:5,beamDepth:depth,strategyAStarMaxExpand:10000,strategyAStarOpenLimit:10000,strategyAStarHeuristicWeight:1},strategyState:{expandedNodes:0,timeoutCount:0},isIgnored:()=>false,getBankCookies:()=>bank,estimateWaitSeconds:(price,money,cps)=>Math.max(0,(price+bank-money)/cps)};
 const candidates=api.buildCandidatePool(planner,items,horizons),terminal=new Map(items.map(x=>[`building:${x.id}`,0])),prefix=new Map(terminal);
 let leaves=0;
 function visit(state){for(const c of candidates){if(state.visited.includes(c.token))continue;const e=api.evaluateCandidateUtility(planner,c.item,state.cookies,state.cps,horizons,state.elapsedSec);const next={score:state.score+e.utility*0.7**state.visited.length,cookies:state.cookies>=c.item.getPrice()+bank?state.cookies-c.item.getPrice():bank,cps:Math.max(1,state.cps+e.gain),elapsedSec:state.elapsedSec+Math.max(0,e.wait),visited:[...state.visited,c.token]};const first=next.visited[0];prefix.set(first,Math.max(prefix.get(first),next.score));if(next.visited.length===depth){leaves++;terminal.set(first,Math.max(terminal.get(first),next.score));}else visit(next);}}
 visit({score:0,cookies,cps:1,elapsedSec:0,visited:[]});
 assert.equal(leaves,depth===2?20:60);
 const run=(fn,width)=>{planner.config.beamWidth=width;planner.strategyState.expandedNodes=0;const start=performance.now();const r=fn(planner,items,performance.now()+10000,horizons);return{r,ms:performance.now()-start,nodes:planner.strategyState.expandedNodes};};
 const wide=run(api.runBeamSearch,10000),beam=run(api.runBeamSearch,5),best=run(api.runAStarSearch,5);
 const close=(a,b)=>Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(a),Math.abs(b));
 for(const [token,value] of terminal)assert.ok(close(wide.r.scores.get(token),value),'Unpruned beam must match terminal oracle');
 for(const [token,value] of prefix)assert.ok(close(best.r.scores.get(token),value),'Unpruned best-first must match prefix oracle');
 const top=m=>[...m].sort((a,b)=>b[1]-a[1])[0];const chosen=top(beam.r.scores),optimum=top(terminal);
 rows.push({bank,cookies,depth,leaves,beamTop:chosen[0],terminalTop:optimum[0],prefixTop:top(prefix)[0],beamTerminalRegret:optimum[1]-terminal.get(chosen[0]),beamReportedScoreDifferences:[...terminal].filter(([k,v])=>!close(v,beam.r.scores.get(k))).length,beamMs:beam.ms,bestFirstMs:best.ms,scope:'Synthetic fixed-price scalar model; timing excludes CalculateGains, DOM and other mods.'});
}
console.log(JSON.stringify({checks:'8 fixtures: exhaustive leaf count, unpruned beam terminal scores, unpruned best-first prefix scores',rows},null,2));
