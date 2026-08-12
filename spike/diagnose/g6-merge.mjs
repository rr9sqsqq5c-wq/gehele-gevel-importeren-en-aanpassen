// WEGWERP (spike/) — READ-ONLY. Test G6 (de live halfsteens-groep): doen de band-openingen
// (175487/457888) een MERGE met de vensteropeningen → rechthoekige polyPts → hoek weg boven bgg?
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
globalThis.localStorage={getItem:(k)=>k==='reprojectOpeningPolygon'?'1':null,setItem(){},removeItem(){}};
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
const G6=[555265,180382,462783,175487,457888];
const ws=G6.map(id=>walls.find(x=>x.expressID===id));

console.log('# G6-wanden (verse parse):');
for(const w of ws){const wo=w.wallOrigin;
  for(const op of (w.openings??[])) console.log(`  #${w.expressID} H${wo.heightStart} len${w.length}: opening ${op.type} y${op.y} ${op.breedte}x${op.hoogte} poly=${op.polyPts?.length??0}`);
  if(!(w.openings??[]).length) console.log(`  #${w.expressID} H${wo.heightStart} len${w.length}: GEEN opening`);
}

const q=console.log;console.log=()=>{};
const fd=buildBestFitFacadePattern(ws,mat,'halfsteens',null,null,null,null);
console.log=q;
const isRect=(pts)=>{const xs=[...new Set(pts.map(p=>Math.round(p.l)))],ys=[...new Set(pts.map(p=>Math.round(p.h)))];return xs.length===2&&ys.length===2;};
console.log('\n# groupOpenings NA merge (best-fit, vlag aan):');
for(const op of fd.groupOpenings){console.log(`  y${Math.round(op.y)} ${Math.round(op.width)}x${Math.round(op.height)} polyPts=${op.polyPts?.length??'GEEN'} ${op.polyPts?(isRect(op.polyPts)?'→ RECHTHOEK (L verloren!)':'→ L behouden'):''}`);}

const cover=(rows,X,Y)=>{for(const r of rows){if(Y<r.y-1||Y>r.y+mat.steenH+1)continue;if(r.pieces.some(p=>X>=p.start-1&&X<=p.start+p.length+1))return true;}return false;};
const gMinH=Math.min(...ws.map(w=>w.wallOrigin.heightStart));
console.log('\n# massieve hoek per verdieping (G6, halfsteens):');
for(const [naam,id] of [['bgg',555265],['1e verd',180382],['2e verd',462783]]){
  const off=ws.find(x=>x.expressID===id).wallOrigin.heightStart-gMinH;
  console.log(`  ${naam} (off=${off}): ${cover(fd.rows,1100,off+400)?'🟢 bekleed':'🔴 NIET bekleed'}`);
}
process.exit(0);
