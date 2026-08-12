// WEGWERP (spike/) — READ-ONLY. Test het DIRECTE pad (auto-groep): buildFullGroupFacadePattern
// op G3, halfsteens. Checkt de massieve hoek per verdieping + of polyPts in groupOpenings zit.
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
const {buildFullGroupFacadePattern}=await import('../../src/lib/pattern.js');
const buf=readFileSync(join(ROOT,'public','BIL-MOO-A-ZZ-PBP.ifc'));
const o=console.log;console.log=()=>{};
const walls=await parseIfc({name:'b.ifc',size:buf.length,arrayBuffer:async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength)},null,null,{forceOrientation:'AUTO'});
console.log=o;
const mat={steenL:210,steenH:50,lint:12,stoot:10};
const ws=[60148,127375,438296,122591,433512].map(id=>walls.find(x=>x.expressID===id));

const fd=buildFullGroupFacadePattern(ws,mat,'halfsteens',null,null,null);
console.log(`groupMinH=${fd.groupMinH} groupHeight=${fd.groupHeight} rows=${fd.rows.length}`);
console.log('\n# groupOpenings (direct pad):');
for(const op of fd.groupOpenings){console.log(`  x${Math.round(op.x)} y${Math.round(op.y)} ${Math.round(op.width)}x${Math.round(op.height)} polyPts=${op.polyPts?.length??'GEEN'}`);}

const cover=(rows,X,Y)=>{for(const r of rows){if(Y<r.y-1||Y>r.y+mat.steenH+1)continue;if(r.pieces.some(p=>X>=p.start-1&&X<=p.start+p.length+1))return true;}return false;};
const groupMinH=Math.min(...ws.map(w=>w.wallOrigin.heightStart));
console.log('\n# massieve hoek (1100, off+400) per verdieping — DIRECT pad:');
for(const [naam,id] of [['bgg',60148],['1e verd',127375],['2e verd',438296]]){
  const off=ws.find(x=>x.expressID===id).wallOrigin.heightStart-groupMinH;
  console.log(`  ${naam} (off=${off}): ${cover(fd.rows,1100,off+400)?'🟢 bekleed':'🔴 NIET bekleed'}`);
}
process.exit(0);
