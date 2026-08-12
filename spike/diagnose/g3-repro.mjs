// WEGWERP (spike/) — READ-ONLY. Reproduceer de ECHTE groep G3 = [60148,127375,438296,122591,433512]
// en test of de massieve hoek van 60148 (binnen bbox, buiten L-polygoon) bekleed wordt (vlag AAN).
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
const G3=[60148,127375,438296,122591,433512];
const ws=G3.map(id=>walls.find(x=>x.expressID===id));

console.log('# G3-wanden:');
for(const w of ws){const wo=w.wallOrigin;const op=(w.openings??[])[0];
  console.log(`  #${w.expressID} L${wo.lengthStart}..${wo.lengthEnd} H${wo.heightStart}..${wo.heightEnd} thk(${wo.thicknessAxis})${wo.thicknessStart} | opening ${op?.breedte??op?.width}x${op?.hoogte??op?.height} poly=${op?.polyPts?.length}pt`);
}
const q=console.log;console.log=()=>{};
const fd=buildBestFitFacadePattern(ws,mat,'halfsteens',null,null,null,null);
console.log=q;
if(!fd){console.log('geen fd');process.exit(0);}
console.log(`\n# best-fit: tAxis=${fd._bestFit?.uAxis? '': ''}uAxis=${fd._bestFit?.uAxis} tAxis=${fd._bestFit?.tAxis} nAxis=${fd._bestFit?.nAxis} groupMinX=${fd.groupMinX} groupMinH=${fd.groupMinH} rows=${fd.rows.length}`);
console.log(`  warnings=${JSON.stringify(fd._bestFit?.warnings??[])}`);

const cover=(gx,gy)=>{for(const r of fd.rows){if(gy<r.y-1||gy>r.y+50+1)continue;if(r.pieces.some(p=>gx>=p.start-1&&gx<=p.start+p.length+1))return true;}return false;};
// punt-in-poly
const pip=(pts,x,y)=>{let c=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const xi=pts[i].l,yi=pts[i].h,xj=pts[j].l,yj=pts[j].h;if(((yi>y)!=(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))c=!c;}return c;};
console.log('\n# massieve hoek bekleed per L-wand in G3:');
let fails=0;
for(const w of ws){const wo=w.wallOrigin;const op=(w.openings??[]).find(o=>(o.polyPts?.length??0)>4);
  if(!op){console.log(`  #${w.expressID}: geen L-opening (rechthoek) — skip`);continue;}
  const ls=op.polyPts.map(p=>p.l);let solidX=null;
  for(let lx=Math.min(...ls)+50;lx<Math.max(...ls);lx+=80){ if(!pip(op.polyPts,lx,400)){solidX=lx;break;} }
  if(solidX==null){console.log(`  #${w.expressID}: geen massieve onderhoek`);continue;}
  const gx=(wo.lengthStart-fd.groupMinX)+solidX, gy=(wo.heightStart-fd.groupMinH)+400;
  const ok=cover(gx,gy); if(!ok)fails++;
  console.log(`  #${w.expressID} (H${wo.heightStart}): massief-x=${solidX} groep(${Math.round(gx)},${Math.round(gy)}) bekleed=${ok?'🟢 ja':'🔴 NEE'}`);
}
console.log(`\n=> ${fails} L-wanden met onbeklede massieve hoek in G3.`);
process.exit(0);
