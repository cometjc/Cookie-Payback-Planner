import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const {ids}=vi.hoisted(()=>({ids:new Map()}));
vi.mock('../core/globals',()=>({Game:{},l:id=>ids.get(id)||null,PlaySound:()=>{}}));
import {arrayCommonInTheSameOrder,reorderBuildings,reorderUpgrades} from './render';

const ownerDocument={};
class Element {
  constructor(id,kind='upgrade'){this.id=id;this.kind=kind;this.parentNode=null;this.ownerDocument=ownerDocument;this.isConnected=true;ids.set(id,this);}
  get nextSibling(){const siblings=this.parentNode?.childNodes||[];return siblings[siblings.indexOf(this)+1]||null;}
}
class Parent extends Element {
  constructor(id){super(id,'container');this.childNodes=[];this.moves=0;this.atomicMoves=0;}
  get firstChild(){return this.childNodes[0]||null;}
  insertBefore(node,before){
    if(node===before)return node;
    if(node.parentNode){const old=node.parentNode.childNodes;old.splice(old.indexOf(node),1);}
    const index=before===null?this.childNodes.length:this.childNodes.indexOf(before);
    if(index<0)throw Error('Reference is not a child');
    this.childNodes.splice(index,0,node);node.parentNode=this;this.moves++;return node;
  }
  fill(...nodes){for(const node of nodes)this.insertBefore(node,null);this.moves=0;}
}
let regular,tech,products;
const planner={arrayCommonInTheSameOrder};
const item=(id,pool='')=>({l:new Element(id),pool});
const order=parent=>parent.childNodes.map(node=>node.id);
beforeEach(()=>{
  ids.clear();regular=new Parent('upgrades');tech=new Parent('techUpgrades');products=new Parent('products');
  vi.stubGlobal('document',{
    querySelector:selector=>ids.get(selector.slice(1))||null,
    querySelectorAll:selector=>selector==='.upgrade'?[...regular.childNodes,...tech.childNodes].filter(n=>n.kind==='upgrade')
      :products.childNodes.filter(n=>n.kind==='product'&&!n.hidden),
  });
});
afterEach(()=>vi.unstubAllGlobals());

it('does not move already ordered groups when the requested global order interleaves them',()=>{
  const a=item('a'),b=item('b','tech'),c=item('c'),bar=new Element('storeBuyAll','bar');
  regular.fill(bar,a.l,c.l);tech.fill(b.l);
  reorderUpgrades.call(planner,[a,b,c]);
  expect(order(regular)).toEqual(['storeBuyAll','a','c']);expect(order(tech)).toEqual(['b']);
  expect(regular.moves+tech.moves).toBe(0);
});
it.each([false,true])('moves only an out-of-order node with atomic API %s',atomic=>{
  const rows=['a','b','c','d'].map(id=>item(id)),bar=new Element('storeBuyAll','bar');
  regular.fill(bar,rows[0].l,rows[2].l,rows[1].l,rows[3].l);
  if(atomic)regular.moveBefore=function(...args){this.atomicMoves++;return this.insertBefore(...args);};
  const references=rows.map(row=>row.l);
  reorderUpgrades.call(planner,rows);
  expect(order(regular)).toEqual(['storeBuyAll','a','b','c','d']);expect(regular.moves).toBe(1);
  expect(regular.atomicMoves).toBe(atomic?1:0);expect(rows.map(row=>row.l)).toEqual(references);
});
it('uses insertBefore for disconnected trees even if atomic moves are available',()=>{
  const rows=['a','b','c'].map(id=>item(id));regular.fill(rows[0].l,rows[2].l,rows[1].l);
  regular.isConnected=false;for(const row of rows)row.l.isConnected=false;
  regular.moveBefore=()=>{throw Error('Atomic move requires the same composed root');};
  reorderUpgrades.call(planner,rows);
  expect(order(regular)).toEqual(['a','b','c']);expect(regular.moves).toBe(1);
});
it('keeps the bulk bar first and hidden or unrelated nodes after sorted buildings',()=>{
  const a={l:new Element('a','product')},b={l:new Element('b','product')},c={l:new Element('c','product')};
  const bar=new Element('storeBulk','bar'),hidden=new Element('hidden','product');hidden.hidden=true;
  products.fill(bar,a.l,hidden,c.l,b.l);
  reorderBuildings.call(planner,[a,b,c]);
  expect(order(products)).toEqual(['storeBulk','a','b','c','hidden']);
  expect([a,b,c].map(row=>row.l.id)).toEqual(['a','b','c']);
});
it('matches the previous prepend result over shuffled groups, bars and unrelated children',()=>{
  let seed=53;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  const shuffle=values=>{const a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
  for(let trial=0;trial<200;trial++){
    ids.clear();regular=new Parent('upgrades');tech=new Parent('techUpgrades');
    const rows=Array.from({length:6},(_,i)=>item(String(i),random()<.4?'tech':''));
    const bar=new Element('storeBuyAll','bar'),extra=new Element('extra','other');
    regular.fill(...shuffle([bar,extra,...rows.filter(r=>r.pool!=='tech').map(r=>r.l)]));
    tech.fill(...shuffle(rows.filter(r=>r.pool==='tech').map(r=>r.l)));
    const desired=shuffle(rows),onPage=[...regular.childNodes,...tech.childNodes].filter(n=>n.kind==='upgrade').map(n=>n.id);
    let expectedRegular=order(regular),expectedTech=order(tech);
    if(!arrayCommonInTheSameOrder(desired.map(r=>r.l.id),onPage)){
      for(const row of [...desired].reverse()){
        const target=row.pool==='tech'?expectedTech:expectedRegular;
        target.splice(target.indexOf(row.l.id),1);target.unshift(row.l.id);
      }
      expectedRegular.splice(expectedRegular.indexOf(bar.id),1);expectedRegular.unshift(bar.id);
    }
    reorderUpgrades.call(planner,desired);
    expect(order(regular)).toEqual(expectedRegular);expect(order(tech)).toEqual(expectedTech);
  }
});
