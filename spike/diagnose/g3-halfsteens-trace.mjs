// WEGWERP (spike/) — READ-ONLY ANALYSE. Trace het halfsteens-proces per verdieping in G3:
// bgg-wand (60148) vs 1e-verdieping-wand (127375). Toont dat de LOGICA identiek is en isoleert
// de enige divergentie (effectiveHeight = min(groupHeight, maxHoogte)).
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
const ws=[60148,127375,438296,122591,433512].map(id=>walls.find(x=>x.expressID===id));

const lagenmaat=mat.steenH+mat.lint; // 62
const groupMinH=Math.min(...ws.map(w=>w.wallOrigin.heightStart)); // bgg
console.log(`groupMinH (onderkant laagste wand, y=0) = ${groupMinH}    lagenmaat = ${lagenmaat} mm`);
console.log(`\n# Per-wand stap-voor-stap (zelfde logica, alleen andere getallen):`);
console.log(`wand        heightStart  wallOffsetH=hStart-groupMinH   opening group-y      polyPts`);
for(const id of [60148,127375]){
  const w=ws.find(x=>x.expressID===id); const wo=w.wallOrigin; const op=w.openings[0];
  const off=wo.heightStart-groupMinH;
  const opGroupY=off+(op.y??0);
  console.log(`#${id}  ${String(wo.heightStart).padStart(6)}      ${String(off).padStart(6)}                        ${String(opGroupY).padStart(5)}..${opGroupY+(op.hoogte??op.height)}     ${op.polyPts?.length}pt L`);
}

function cornerCladInfo(fd){
  // SOLID-hoek per verdieping in GROUP-coords: poly group-frame ~ (1100, off+ y), y in 60..840
  const cover=(rows,X,Y)=>{for(const r of rows){if(Y<r.y-1||Y>r.y+mat.steenH+1)continue;if(r.pieces.some(p=>X>=p.start-1&&X<=p.start+p.length+1))return true;}return false;};
  const out={};
  for(const [naam,id] of [['bgg',60148],['1e verd',127375]]){
    const w=ws.find(x=>x.expressID===id); const off=w.wallOrigin.heightStart-groupMinH;
    out[naam]=cover(fd.rows,1100,off+400); // (1100,400)-equivalent op deze verdieping
  }
  return out;
}

const q=console.log;console.log=()=>{};
const fdOff=buildBestFitFacadePattern(ws,mat,'halfsteens',null,null,null,null);          // maxHoogte UIT
const fdMax=buildBestFitFacadePattern(ws,mat,'halfsteens',3000,null,null,null);           // maxHoogte = 3000 mm
console.log=q;

console.log(`\n# Resultaat massieve hoek bekleed:`);
console.log(`maxHoogte UIT (null):      groupHeight=${fdOff.groupHeight}  →`, cornerCladInfo(fdOff));
console.log(`maxHoogte = 3000 mm:       effectiveHeight=${fdMax.groupHeight}  →`, cornerCladInfo(fdMax));
console.log(`\n(rEnd volgt effectiveHeight = min(groupHeight, maxHoogte); pattern.js:308,316.`);
console.log(` Met maxHoogte < 1e-verdieping-hoogte stopt het rijen-genereren → die verdieping krijgt 0 rijen.)`);
process.exit(0);
