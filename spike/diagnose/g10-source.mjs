// WEGWERP (spike/) — READ-ONLY. Reproduceren in Node: krijgen JOUW G10-banden (201756/469897,
// :26025174, 300mm) bij een verse parse óók de spurieuze venster-opening? Zo ja → bron in parseIfc.
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
console.log('totaal wanden:', walls.length);
for(const id of [566837,206651,474792,201756,469897]){
  const w=walls.find(x=>x.expressID===id);
  if(!w){console.log(`#${id}: NIET in parse`);continue;}
  const wo=w.wallOrigin;
  console.log(`#${id} ${w.name.split(':').pop()} H${wo?.heightStart} wandH${w.height} | openingen=${(w.openings||[]).length}: `+
    (w.openings||[]).map(op=>`${op.type} y${op.y} ${op.breedte}x${op.hoogte} poly${op.polyPts?.length??0} top${(op.y??0)+(op.hoogte??0)}`).join(' ; '));
}
process.exit(0);
