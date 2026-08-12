// WEGWERP (spike/) — READ-ONLY. Reproduceer het PROJECTIE-pad (newOpenings): parseIfc-skelet +
// applyProjectedOpenings. Krijgen de 300mm banden (201756/469897) dan de spurieuze venster-opening?
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
const {applyProjectedOpenings}=await import('../../src/lib/openingDerivation.js');
const buf=readFileSync(join(ROOT,'public','BIL-MOO-A-ZZ-PBP.ifc'));
const fileObj={name:'b.ifc',size:buf.length,arrayBuffer:async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength)};
const o=console.log;console.log=()=>{};
let walls=await parseIfc(fileObj,null,null,{forceOrientation:'AUTO'});
// alleen de 5 G10-wanden, scheelt tijd
const ids=[566837,206651,474792,201756,469897];
walls=walls.filter(w=>ids.includes(w.expressID));
try{ await applyProjectedOpenings(fileObj, walls, ()=>{}); }catch(e){ console.log=o; console.log('applyProjectedOpenings FOUT:', e.message); process.exit(1);}
console.log=o;
console.log('# NA applyProjectedOpenings:');
for(const id of ids){
  const w=walls.find(x=>x.expressID===id); const wo=w.wallOrigin;
  console.log(`#${id} ${w.name.split(':').pop()} H${wo?.heightStart} wandH${w.height} | openingen=${(w.openings||[]).length}: `+
    (w.openings||[]).map(op=>`${op.type} y${op.y} ${op.breedte}x${op.hoogte} poly${op.polyPts?.length??0} top${(op.y??0)+(op.hoogte??0)}`).join(' ; '));
}
process.exit(0);
