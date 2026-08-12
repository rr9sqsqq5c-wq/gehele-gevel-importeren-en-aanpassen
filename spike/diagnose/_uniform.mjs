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
const {buildFullGroupFacadePattern}=await import('../../src/lib/pattern.js');
const buf=readFileSync(join(ROOT,'public','BIL-MOO-A-ZZ-PBP.ifc'));
const o=console.log;console.log=()=>{};
const walls=await parseIfc({name:'b.ifc',size:buf.length,arrayBuffer:async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength)},null,null,{forceOrientation:'AUTO'});
console.log=o;
const mat={steenL:210,steenH:50,lint:12,stoot:10};
const q=(f)=>{const z=console.log;console.log=()=>{};const r=f();console.log=z;return r;};
for(const id of [60148,86484,127375]){
  const w=walls.find(x=>x.expressID===id);
  FLAG='1'; const on=q(()=>buildBestFitFacadePattern([w],mat,'halfsteens',null,null,null,null))?.rows??[];
  const dir=q(()=>buildFullGroupFacadePattern([w],mat,'halfsteens',null,null,null,null))?.rows??[];
  const eq=JSON.stringify(on)===JSON.stringify(dir);
  console.log(`#${id}: best-fit-AAN rows == direct rows? ${eq?'🟢 JA (uniform)':'🔴 nee'} (rows aan=${on.length} dir=${dir.length})`);
}
process.exit(0);
