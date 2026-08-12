// WEGWERP (spike/) — READ-ONLY. Waarom werkt de L wel los maar niet in de echte groep?
// Dump bbox + opening-poly van de 3 L-wanden, en test de L-hoek-bekleding in een MULTI-wand best-fit.
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let FLAG='1';
globalThis.localStorage={getItem:(k)=>k==='reprojectOpeningPolygon'?FLAG:null,setItem(){},removeItem(){}};
const WebIFC=require('web-ifc'); const a=new WebIFC.IfcAPI();
try{await a.Init();}catch{a.SetWasmPath(join(ROOT,'node_modules','web-ifc')+'/',true);await a.Init();}
const ap=new Proxy(a,{get(t,p){if(p==='Init')return async()=>{};const v=t[p];return typeof v==='function'?v.bind(t):v;}});
globalThis.window={WebIFC:new Proxy(WebIFC,{get(t,p){return p==='IfcAPI'?class{constructor(){return ap;}}:t[p];}})};
const {parseIfc}=await import('../../src/lib/ifc.js');
const {buildBestFitFacadePattern}=await import('../../src/lib/facadePlane.js');
const buf=readFileSync(join(ROOT,'public','BIL-MOO-A-ZZ-PBP.ifc'));
const o=console.log;console.log=()=>{};
const walls=await parseIfc({name:'b.ifc',size:buf.length,arrayBuffer:async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength)},null,null,{forceOrientation:'AUTO'});
console.log=o;
const mat={steenL:210,steenH:50,lint:12,stoot:10};
const IDS=[60148,86484,127375];

console.log('# bbox + opening-poly van de 3 L-wanden');
for(const id of IDS){
  const w=walls.find(x=>x.expressID===id); const wo=w.wallOrigin;
  const op=(w.openings??[])[0];
  console.log(`  #${id}: lengthStart=${wo.lengthStart} heightStart=${wo.heightStart} (L ${wo.lengthStart}..${wo.lengthEnd}, H ${wo.heightStart}..${wo.heightEnd}) heightAxis=${wo.heightAxis}`);
  console.log(`         opening pts=${op?.polyPts?.length} ${op?.polyPts? '['+op.polyPts.map(p=>`${p.l},${p.h}`).join(' | ')+']':''}`);
}

const cover=(rows,gx,gy)=>{ // is (gx,gy) bedekt?
  for(const r of rows){ if(gy<r.y-1||gy>r.y+50+1) continue;
    if(r.pieces.some(p=>gx>=p.start-1&&gx<=p.start+p.length+1)) return true; }
  return false;
};

function testGroup(label, ids){
  const ws=ids.map(id=>walls.find(x=>x.expressID===id));
  const q=console.log;console.log=()=>{};
  const fd=buildBestFitFacadePattern(ws,mat,'halfsteens',null,null,null,null);
  console.log=q;
  if(!fd){console.log(`  ${label}: geen facadeData`);return;}
  const gMinX=fd.groupMinX, gMinH=fd.groupMinH;
  console.log(`  ${label}: groupMinX=${gMinX} groupMinH=${gMinH} rows=${fd.rows.length}`);
  for(const w of ws){ const wo=w.wallOrigin;
    // groene band-midden in groep-coords: wand-lokaal (l~1000, h~400) → +offset
    const gx=(wo.lengthStart-gMinX)+1000, gy=(wo.heightStart-gMinH)+400;
    console.log(`     #${w.expressID}: testpunt groep(${Math.round(gx)},${Math.round(gy)}) bekleed=${cover(fd.rows,gx,gy)?'🟢 ja':'🔴 NEE'}`);
  }
}
console.log('\n# los (elk apart) vs samen in 1 groep:');
for(const id of IDS) testGroup(`los #${id}`, [id]);
testGroup('SAMEN [60148,86484,127375]', IDS);
process.exit(0);
