// WEGWERP (spike/) — READ-ONLY. Tel openingen per wand met naam :26025424. Krijgt één element
// méér dan 1 (polygonale) opening? Toont per wand: expressID, hoogte, #openingen, poly-punten.
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const WebIFC=require('web-ifc'); const a=new WebIFC.IfcAPI();
try{await a.Init();}catch{a.SetWasmPath(join(ROOT,'node_modules','web-ifc')+'/',true);await a.Init();}
const ap=new Proxy(a,{get(t,p){if(p==='Init')return async()=>{};const v=t[p];return typeof v==='function'?v.bind(t):v;}});
globalThis.window={WebIFC:new Proxy(WebIFC,{get(t,p){return p==='IfcAPI'?class{constructor(){return ap;}}:t[p];}})};
const {parseIfc}=await import('../../src/lib/ifc.js');
const buf=readFileSync(join(ROOT,'public','BIL-MOO-A-ZZ-PBP.ifc'));
const o=console.log;console.log=()=>{};
const walls=await parseIfc({name:'b.ifc',size:buf.length,arrayBuffer:async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength)},null,null,{forceOrientation:'AUTO'});
console.log=o;
const ws=walls.filter(w=>(w.name??'').includes(':26025424'));
console.log(`# wanden met naam :26025424 : ${ws.length}`);
let multi=0;
for(const w of ws){
  const ops=w.openings??[];
  if(ops.length>1)multi++;
  console.log(`#${w.expressID} H${w.wallOrigin?.heightStart} wandH${w.height} | #openingen=${ops.length} : `+
    ops.map(op=>`[${op.type} ${op.breedte}x${op.hoogte} poly${op.polyPts?.length??0} id${op.id}]`).join(' '));
}
console.log(`\n=> wanden met >1 opening: ${multi} (van ${ws.length})`);
process.exit(0);
