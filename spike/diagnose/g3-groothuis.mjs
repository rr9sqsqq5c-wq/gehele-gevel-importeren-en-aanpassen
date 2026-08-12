// WEGWERP (spike/) — READ-ONLY. Bevestig: groothuis-/wildverband knippen de L-opening tot bbox.
// 1) draagt groupOpenings de polyPts mee?  2) wordt de massieve hoek geknipt (niet bekleed)?
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
globalThis.localStorage={getItem:(k)=>['reprojectOpeningPolygon','groothuisWildverband','wildverbandKoppelstrip'].includes(k)?'1':null,setItem(){},removeItem(){}};
const WebIFC=require('web-ifc'); const a=new WebIFC.IfcAPI();
try{await a.Init();}catch{a.SetWasmPath(join(ROOT,'node_modules','web-ifc')+'/',true);await a.Init();}
const ap=new Proxy(a,{get(t,p){if(p==='Init')return async()=>{};const v=t[p];return typeof v==='function'?v.bind(t):v;}});
globalThis.window={WebIFC:new Proxy(WebIFC,{get(t,p){return p==='IfcAPI'?class{constructor(){return ap;}}:t[p];}})};
const {parseIfc}=await import('../../src/lib/ifc.js');
const {buildBestFitFacadePattern}=await import('../../src/lib/facadePlane.js');
const {buildGroothuisRows}=await import('../../src/lib/groothuisWildverband.js');
const {buildTruthRows}=await import('../../src/lib/wildverbandKoppelstrip.js');
const buf=readFileSync(join(ROOT,'public','BIL-MOO-A-ZZ-PBP.ifc'));
const o=console.log;console.log=()=>{};
const walls=await parseIfc({name:'b.ifc',size:buf.length,arrayBuffer:async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength)},null,null,{forceOrientation:'AUTO'});
console.log=o;
const mat={steenL:210,steenH:50,lint:12,stoot:10};
const ws=[60148,127375,438296,122591,433512].map(id=>walls.find(x=>x.expressID===id));
const q=console.log;console.log=()=>{};
const fd=buildBestFitFacadePattern(ws,mat,'halfsteens',null,null,null,null);
console.log=q;

console.log('# groupOpenings (group-coords) — draagt het polyPts?');
for(const op of fd.groupOpenings){console.log(`  x${Math.round(op.x)} y${Math.round(op.y)} ${Math.round(op.width)}x${Math.round(op.height)} polyPts=${op.polyPts?.length??'GEEN'}`);}

// massieve hoek van de bgg-L in GROUP-coords: poly is wall-local; bgg offset = (minX, minH=0)
const bggOp=fd.groupOpenings.find(op=>(op.polyPts?.length??0)>4 && op.y<1500);
const pip=(pts,x,y)=>{let c=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const xi=pts[i].l??pts[i].x,yi=pts[i].h??pts[i].y,xj=pts[j].l??pts[j].x,yj=pts[j].h??pts[j].y;if(((yi>y)!=(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))c=!c;}return c;};
// vind een massief punt in group-coords binnen de bbox van bggOp
let gx=null,gy=null;
if(bggOp){const P=bggOp.polyPts.map(p=>({l:(p.l??p.x)+(bggOp.polyPts[0].abs?0:0),h:(p.h??p.y)}));
  // poly is opgeslagen relatief; group-positie = op.x/op.y + lokaal punt
  for(let lx=50;lx<Math.round(bggOp.width)-50;lx+=60)for(let ly=50;ly<Math.round(bggOp.height)-50;ly+=60){
    if(!pip(bggOp.polyPts,lx,ly)){gx=op0(bggOp)+lx;gy=bggOp.y+ly;break;} if(gx!=null)break;}
}
function op0(op){return op.x;}
console.log(`\n# bgg-L massief punt (group): (${gx},${gy})`);

const cover=(rows,X,Y)=>{for(const r of rows){if(Y<r.y-1||Y>r.y+mat.steenH+1)continue;if(r.pieces.some(p=>X>=p.start-1&&X<=p.start+p.length+1))return true;}return false;};
// polyPts liggen in group/abs-frame (x≈280..3080). Massieve onderhoek L = x280..1940, y60..840.
// SOLID-punt (moet bekleed): (1100,400).  GAT-controle (moet leeg blijven): (1100,1500) in topbalk.
const SOLID={x:1100,y:400}, HOLE={x:1100,y:1500};
console.log('\n# bgg-L: SOLID (1100,400) moet 🟢 ; GAT (1100,1500) moet leeg blijven');
for(const [naam,fn] of [['groothuis_wildverband',buildGroothuisRows],['wildverband',buildTruthRows]]){
  const r=fn(fd.groupWidth,fd.groupHeight,mat,fd.groupOpenings??[]);
  const s=cover(r.rows,SOLID.x,SOLID.y), h=cover(r.rows,HOLE.x,HOLE.y);
  console.log(`  ${naam}: SOLID=${s?'🟢 bekleed':'🔴 NIET bekleed (bbox over-knip)'} | GAT=${h?'⚠ ten onrechte bekleed':'✔ leeg'}`);
}
process.exit(0);
