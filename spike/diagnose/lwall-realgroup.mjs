// WEGWERP (spike/) — READ-ONLY. Realistische coplanaire gevel-groep rond #60148: welke L-wanden
// (6-punts opening) krijgen hun massieve hoek wél/niet bekleed in de echte multi-wand best-fit?
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
const ref=walls.find(x=>x.expressID===60148).wallOrigin;
console.log(`# ref #60148 thicknessAxis=${ref.thicknessAxis} thicknessStart=${ref.thicknessStart}`);

// coplanaire gevel: zelfde assen, zelfde dikte-vlak (±400), contigue x rond #60148, alle storeys
const group=walls.filter(w=>{const wo=w.wallOrigin; return wo && wo.lengthAxis===ref.lengthAxis && wo.heightAxis===ref.heightAxis && wo.thicknessAxis===ref.thicknessAxis && Math.abs(wo.thicknessStart-ref.thicknessStart)<400 && wo.lengthStart>=8000 && wo.lengthEnd<=39500;});
console.log(`# coplanaire groep: ${group.length} wanden, x ${Math.min(...group.map(w=>w.wallOrigin.lengthStart))}..${Math.max(...group.map(w=>w.wallOrigin.lengthEnd))}, y ${Math.min(...group.map(w=>w.wallOrigin.heightStart))}..${Math.max(...group.map(w=>w.wallOrigin.heightEnd))}`);

// L-wanden in de groep = met >=1 opening met polyPts.length>4
const Lwalls=group.filter(w=>(w.openings??[]).some(op=>(op.polyPts?.length??0)>4));
console.log(`# L-wanden in groep: ${Lwalls.map(w=>w.expressID).join(', ')}`);

const q=console.log;console.log=()=>{};
const fd=buildBestFitFacadePattern(group,mat,'halfsteens',null,null,null,null);
console.log=q;
if(!fd){console.log('geen facadeData');process.exit(0);}
const cover=(gx,gy)=>{for(const r of fd.rows){if(gy<r.y-1||gy>r.y+50+1)continue;if(r.pieces.some(p=>gx>=p.start-1&&gx<=p.start+p.length+1))return true;}return false;};
console.log(`# groupMinX=${fd.groupMinX} groupMinH=${fd.groupMinH} rows=${fd.rows.length}  warnings=${JSON.stringify(fd._bestFit?.warnings??[])}`);
console.log('\n# L-hoek bekleed per L-wand (testpunt = massieve hoek):');
let fails=0;
for(const w of Lwalls){const wo=w.wallOrigin;
  const op=(w.openings??[]).find(o=>(o.polyPts?.length??0)>4);
  // bepaal de massieve hoek: het punt binnen de bbox maar buiten de poly (onderaan). Sampel y=400 wand-lokaal.
  const ls=op.polyPts.map(p=>p.l), minL=Math.min(...ls),maxL=Math.max(...ls);
  // test enkele x in de onderband, vind er een die buiten de poly valt (massief)
  const {default:_}=await import('../../src/lib/geometry.js').then(m=>({default:m})).catch(()=>({default:null}));
  let solidX=null;
  for(let lx=minL+50;lx<maxL;lx+=100){ // buiten poly op y=400?
    // simpele point-in-poly (ray) op (lx,400)
    let inside=false;const P=op.polyPts;for(let i=0,j=P.length-1;i<P.length;j=i++){const xi=P[i].l,yi=P[i].h,xj=P[j].l,yj=P[j].h;if(((yi>400)!=(yj>400))&&(lx<(xj-xi)*(400-yi)/(yj-yi)+xi))inside=!inside;}
    if(!inside){solidX=lx;break;}
  }
  if(solidX==null){console.log(`   #${w.expressID}: geen massieve onderhoek gevonden (skip)`);continue;}
  const gx=(wo.lengthStart-fd.groupMinX)+solidX, gy=(wo.heightStart-fd.groupMinH)+400;
  const ok=cover(gx,gy);
  if(!ok)fails++;
  console.log(`   #${w.expressID} (y${wo.heightStart}): massief-x=${solidX} groep(${Math.round(gx)},${Math.round(gy)}) bekleed=${ok?'🟢 ja':'🔴 NEE'}`);
}
console.log(`\n=> ${fails} van ${Lwalls.length} L-wanden hebben hun massieve hoek NIET bekleed in de groep.`);
process.exit(0);
