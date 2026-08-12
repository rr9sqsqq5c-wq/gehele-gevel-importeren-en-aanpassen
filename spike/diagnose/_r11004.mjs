import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let FLAG='0';
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
const w=walls.find(x=>x.expressID===11004);
console.log('opening(s) van #11004:');
for(const op of (w.openings??[])) console.log(`  type=${op.type} x=${op.x} y=${op.y} ${op.breedte??op.width}x${op.hoogte??op.height} polyPts=${JSON.stringify(op.polyPts)}`);
const mat={steenL:210,steenH:50,lint:12,stoot:10};
const rows=(f)=>{FLAG=f;const q=console.log;console.log=()=>{};const fd=buildBestFitFacadePattern([w],mat,'halfsteens',null,null,null,null);console.log=q;return fd?.rows??[];};
const off=rows('0'),on=rows('1');
console.log(`\nrows UIT=${off.length} AAN=${on.length}`);
for(let i=0;i<Math.max(off.length,on.length);i++){
  const a1=JSON.stringify(off[i]?.pieces),b1=JSON.stringify(on[i]?.pieces);
  if(a1!==b1){console.log(`  eerste verschil rij ${i} (y=${off[i]?.y}):`);console.log(`    UIT ${a1}`);console.log(`    AAN ${b1}`);break;}
}
process.exit(0);
