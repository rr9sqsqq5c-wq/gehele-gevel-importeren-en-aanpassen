import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const require=createRequire(import.meta.url); const ROOT=join(dirname(fileURLToPath(import.meta.url)),'..','..');
globalThis.localStorage={getItem:(k)=>k==='reprojectOpeningPolygon'?'1':null,setItem(){},removeItem(){}};
const WebIFC=require('web-ifc');const a=new WebIFC.IfcAPI();
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
function test(ids){
  const ws=ids.map(id=>walls.find(x=>x.expressID===id));
  console.log(`\n[${ids.join(',')}] heightStarts: ${ws.map(w=>w.wallOrigin.heightStart).join(', ')}`);
  const q=console.log;console.log=()=>{};const fd=buildBestFitFacadePattern(ws,mat,'halfsteens',null,null,null,null);console.log=q;
  if(!fd){console.log('  geen fd');return;}
  console.log(`  groupMinH=${fd.groupMinH} rows ${fd.rows.length} (y ${Math.min(...fd.rows.map(r=>r.y))}..${Math.max(...fd.rows.map(r=>r.y))})  warn=${JSON.stringify(fd._bestFit?.warnings??[])}`);
  for(const w of ws){const wo=w.wallOrigin;const y0=wo.heightStart-fd.groupMinH,y1=wo.heightEnd-fd.groupMinH;
    const inBand=fd.rows.filter(r=>r.y>=y0-1&&r.y<=y1+1);
    const pieces=inBand.reduce((s,r)=>s+r.pieces.length,0);
    console.log(`   #${w.expressID} y-band ${Math.round(y0)}..${Math.round(y1)}: ${inBand.length} rijen, ${pieces} strips  ${pieces>0?'🟢 bekleed':'🔴 ONBEKLEED'}`);
  }
}
test([60148]);          // los onderste
test([60148,127375]);   // 2 gestapeld (jouw geval)
process.exit(0);
