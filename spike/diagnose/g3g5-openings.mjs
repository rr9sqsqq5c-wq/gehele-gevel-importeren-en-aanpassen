// WEGWERP (spike/) — READ-ONLY. Dump per wand in G3 en G5 de opening: type/x/y/breedte/hoogte,
// polyPts-aantal en classificatie rechthoek vs L (concave). Toont of polyPts consistent is.
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

const isRectPoly=(pts)=>{ if(!pts||pts.length!==4)return pts&&pts.length<4; const xs=[...new Set(pts.map(p=>Math.round(p.l??p.x)))], ys=[...new Set(pts.map(p=>Math.round(p.h??p.y)))]; return xs.length===2&&ys.length===2; };

const groups={ G3:[60148,127375,438296,122591,433512], G5:[543693,154113,450774,149218,445879] };
for(const [gid,ids] of Object.entries(groups)){
  console.log(`\n## ${gid}`);
  for(const id of ids){
    const w=walls.find(x=>x.expressID===id);
    if(!w){console.log(`  #${id}: NIET gevonden`);continue;}
    const wo=w.wallOrigin;
    const ops=w.openings??[];
    if(!ops.length){console.log(`  #${id} H${wo?.heightStart}: geen openingen`);continue;}
    for(const op of ops){
      const pp=op.polyPts;
      const n=pp?.length??0;
      const klass = n===0 ? 'GEEN polyPts (alleen bbox)' : isRectPoly(pp) ? `rechthoek (${n}pt)` : `L/concave (${n}pt)`;
      console.log(`  #${id} H${wo?.heightStart}: type=${op.type} x${op.x} y${op.y} ${op.breedte??op.width}x${op.hoogte??op.height} → ${klass}`);
    }
  }
}
process.exit(0);
