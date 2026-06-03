// READ-ONLY DIAGNOSE — wat is de verticale onbeklede strook (≈75 mm horizontaal gat)?
// GEEN src-wijziging. Hergebruikt productie-fitFacadePlane voor het vlak-frame.
// Vragen: (1) welke elementen flankeren het gat + breedte; (2) model-voeg of
// projectie-artefact; (3) vóór vs ná up-as-fix; (4) één oorzaak.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fitFacadePlane } from "../../src/lib/facadePlane.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const A = resolve(__dirname, "../../../stap-1-maak-eerst-een-vast-proje-62cf");
const W = createRequire(pathToFileURL(A + "/package.json"))(resolve(A, "node_modules/web-ifc/web-ifc-api-node.js"));

const api = new W.IfcAPI(); await api.Init();
const tc=(n)=>{try{return api.GetTypeCodeFromName(n);}catch{return undefined;}};
const val=(x)=>(x&&typeof x==='object'&&'value'in x)?x.value:x;
function getBBox(mid,eid){let mesh;try{mesh=api.GetFlatMesh(mid,eid);}catch{return null;}if(!mesh||!mesh.geometries.size())return null;let a={x:Infinity,y:Infinity,z:Infinity},b={x:-Infinity,y:-Infinity,z:-Infinity},ok=false;for(let gi=0;gi<mesh.geometries.size();gi++){const pl=mesh.geometries.get(gi);let g;try{g=api.GetGeometry(mid,pl.geometryExpressID);const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize());const m=pl.flatTransformation;const st=Math.max(6,Math.floor((v.length/6)/120)*6);for(let k=0;k<v.length;k+=st){const lx=v[k],ly=v[k+1],lz=v[k+2];const wx=m[0]*lx+m[4]*ly+m[8]*lz+m[12],wy=m[1]*lx+m[5]*ly+m[9]*lz+m[13],wz=m[2]*lx+m[6]*ly+m[10]*lz+m[14];if(wx<a.x)a.x=wx;if(wx>b.x)b.x=wx;if(wy<a.y)a.y=wy;if(wy>b.y)b.y=wy;if(wz<a.z)a.z=wz;if(wz>b.z)b.z=wz;ok=true;}}finally{g?.delete();}}return ok?{minX:a.x,maxX:b.x,minY:a.y,maxY:b.y,minZ:a.z,maxZ:b.z}:null;}
function deriveWallAxes(dx,dy,dz,heightAxis){if(heightAxis==='z_neg')heightAxis='z';if(heightAxis==='y'){const la=dx>=dz?'x':'z',ta=dx>=dz?'z':'x';return{heightAxis,lengthAxis:la,thicknessAxis:ta,length:Math.round(Math.max(dx,dz)*1000),height:Math.round(dy*1000)};}const la=dx>=dy?'x':'y',ta=dx>=dy?'y':'x';return{heightAxis:'z',lengthAxis:la,thicknessAxis:ta,length:Math.round(Math.max(dx,dy)*1000),height:Math.round(dz*1000)};}
function nameOf(mid,eid){try{return val(api.GetLine(mid,eid,false)?.Name)||'';}catch{return '';}}
function memberFrom(mid,eid,up,kind){const bb=getBBox(mid,eid);if(!bb)return null;const dx=bb.maxX-bb.minX,dy=bb.maxY-bb.minY,dz=bb.maxZ-bb.minZ;const ax=deriveWallAxes(dx,dy,dz,up);if(ax.length<100||ax.height<100)return null;const rng=(a)=>[Math.round(bb['min'+a.toUpperCase()]*1000),Math.round(bb['max'+a.toUpperCase()]*1000)];const[ls,le]=rng(ax.lengthAxis),[hs,he]=rng(ax.heightAxis),[ts,te]=rng(ax.thicknessAxis);return{expressID:eid,kind,name:nameOf(mid,eid),length:ax.length,height:ax.height,openings:[],wallOrigin:{lengthAxis:ax.lengthAxis,heightAxis:ax.heightAxis,thicknessAxis:ax.thicknessAxis,lengthStart:ls,lengthEnd:le,heightStart:hs,heightEnd:he,thicknessStart:ts,thicknessEnd:te},_bb:bb};}

// ── laad BIL-gevel (zelfde recept als de meet-spike) ──
const midW=api.OpenModel(new Uint8Array(readFileSync("C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/BIL-MOO-A-ZZ-PBP.ifc")),{});
const typeMap={};{const v=api.GetLineIDsWithType(midW,tc('IFCRELDEFINESBYTYPE'));for(let i=0;i<v.size();i++){try{const r=api.GetLine(midW,v.get(i),false);const tr=val(r?.RelatingType);if(!tr)continue;const tn=val(api.GetLine(midW,tr,false)?.Name);for(const ro of (r?.RelatedObjects||[])){const id=val(ro);if(id&&tn)typeMap[id]=tn;}}catch{}}}
const wIds=[];for(const t of ['IFCWALLSTANDARDCASE','IFCWALL']){const v=api.GetLineIDsWithType(midW,tc(t));for(let i=0;i<v.size();i++){const id=v.get(i);if(/(^|:)\s*21[\.\s]/.test(typeMap[id]||''))wIds.push(id);}}
const wMembers=wIds.map(id=>memberFrom(midW,id,'y','wall')).filter(Boolean).filter(m=>m.wallOrigin.thicknessAxis==='x');
const binH=new Map();for(const m of wMembers){const k=Math.round(m._bb.minX/0.05);binH.set(k,(binH.get(k)||0)+1);}
let bk=0,bn=0;for(const [k,c] of binH)if(c>bn){bn=c;bk=k;}const facadeX=bk*0.05;
const facadeWalls=wMembers.filter(m=>Math.abs(m._bb.minX-facadeX)<0.06);
api.CloseModel(midW);
const midD=api.OpenModel(new Uint8Array(readFileSync("C:/Users/MurkAnneKooistraKooi/Downloads/BIL-VIA-L-ZZ-PBP_dakranden.IFC.ifc")),{});
const pIds=[];{const v=api.GetLineIDsWithType(midD,tc('IFCPLATE'));for(let i=0;i<v.size();i++)pIds.push(v.get(i));}
const pMembers=pIds.map(id=>memberFrom(midD,id,'z','dak')).filter(Boolean);
const dakFront=pMembers.filter(m=>{const e={x:m._bb.maxX-m._bb.minX,y:m._bb.maxY-m._bb.minY,z:m._bb.maxZ-m._bb.minZ};const thin=['x','y','z'].reduce((a,b)=>e[a]<=e[b]?a:b);return thin==='x'&&Math.abs(m._bb.minX-facadeX)<0.06;});
api.CloseModel(midD);
const sel=[...facadeWalls,...dakFront].map(m=>{ if(m.wallOrigin.thicknessAxis==='x') m.wallOrigin.resolvedOutside={outsideDir:-1, outsidePos:m.wallOrigin.thicknessStart}; return m; });
console.log(`BIL: facade-vlak X≈${facadeX.toFixed(2)} m | wanden=${facadeWalls.length} | dakrand=${dakFront.length}`);

// helper: projecteer naar (tAxis,uAxis) gegeven een vlak
function aabbWorld(wo){const Ab={};const put=(ax,a,b)=>{Ab['min'+ax.toUpperCase()]=Math.min(a,b);Ab['max'+ax.toUpperCase()]=Math.max(a,b);};put(wo.lengthAxis,wo.lengthStart,wo.lengthEnd);put(wo.heightAxis,wo.heightStart,wo.heightEnd);put(wo.thicknessAxis,wo.thicknessStart,wo.thicknessEnd);return Ab;}
function projectRects(plane){const T=plane.tAxis.toUpperCase(),U=plane.uAxis.toUpperCase();return sel.map(m=>{const Ab=aabbWorld(m.wallOrigin);return{m,kind:m.kind,t0:Ab['min'+T],t1:Ab['max'+T],u0:Ab['min'+U],u1:Ab['max'+U]};});}

// ── functie: vind volle-hoogte horizontale gaten (kolom zonder enig element) ──
function findGaps(rects){
  const tMin=Math.min(...rects.map(r=>r.t0)),tMax=Math.max(...rects.map(r=>r.t1));
  const STEP=5;const cols=[];for(let t=tMin+STEP/2;t<tMax;t+=STEP)cols.push(t);
  const gaps=[];let run=null;
  for(const t of cols){const cov=rects.some(r=>r.t0<=t&&r.t1>=t);if(!cov){if(!run)run={a:t-STEP/2,b:t+STEP/2};else run.b=t+STEP/2;}else{if(run){gaps.push(run);run=null;}}}
  if(run)gaps.push(run);
  return {gaps,tMin,tMax};
}

console.log(`\n=== 3. VÓÓR vs NÁ up-as-fix (zelfde selectie) ===`);
// NÁ-fix = model-up gevoed ('y'). VÓÓR-fix = extent-heuristiek (geen up gevoed → null).
const planeNa  = fitFacadePlane(sel, 'y');
const planeVoor= fitFacadePlane(sel, null);   // null → extent-fallback = oude gedrag
console.log(`  ná-fix : uAxis=${planeNa.uAxis} tAxis=${planeNa.tAxis} nAxis=${planeNa.nAxis}`);
console.log(`  vóór-fix: uAxis=${planeVoor.uAxis} tAxis=${planeVoor.tAxis} nAxis=${planeVoor.nAxis} (extent-gok)`);
for(const [lbl,pl] of [['NÁ-fix',planeNa],['VÓÓR-fix',planeVoor]]){
  const r=projectRects(pl);const {gaps,tMin,tMax}=findGaps(r);
  const tot=gaps.reduce((s,g)=>s+(g.b-g.a),0);
  console.log(`  [${lbl}] t-as=${pl.tAxis}: ${gaps.length} gat(en), totaal ${Math.round(tot)}mm van ${Math.round(tMax-tMin)}mm; breedtes: ${gaps.map(g=>Math.round(g.b-g.a)).join(', ')||'(geen)'}`);
}

// ── 1+2. flankerende elementen + model-vs-projectie (op het NÁ-fix-vlak) ──
console.log(`\n=== 1+2. GAT-ANALYSE (NÁ-fix-vlak, t-as=${planeNa.tAxis}) ===`);
const rN=projectRects(planeNa);const {gaps}=findGaps(rN);
const Tn=planeNa.tAxis.toUpperCase();
if(!gaps.length)console.log('  (geen volle-hoogte gat gevonden)');
for(const g of gaps){
  const mid=(g.a+g.b)/2,w=Math.round(g.b-g.a);
  // flankerende elementen: dichtstbij links (t1<=g.a) en rechts (t0>=g.b)
  const left=rN.filter(r=>r.t1<=g.a+1).sort((x,y)=>y.t1-x.t1)[0];
  const right=rN.filter(r=>r.t0>=g.b-1).sort((x,y)=>x.t0-y.t0)[0];
  console.log(`  • gat @ t≈${Math.round(mid)} breedte=${w}mm`);
  if(left)console.log(`      links : ${left.kind} #${left.m.expressID} "${left.m.name}"  t1=${Math.round(left.t1)}  | model-z: ${Math.round(left.m._bb.minZ*1000)}..${Math.round(left.m._bb.maxZ*1000)}  minX=${(left.m._bb.minX).toFixed(3)}`);
  if(right)console.log(`      rechts: ${right.kind} #${right.m.expressID} "${right.m.name}"  t0=${Math.round(right.t0)}  | model-z: ${Math.round(right.m._bb.minZ*1000)}..${Math.round(right.m._bb.maxZ*1000)}  minX=${(right.m._bb.minX).toFixed(3)}`);
  if(left&&right){
    const sameEl=left.m.expressID===right.m.expressID;
    // model-voeg: echte afstand tussen de twee bbox-en langs de WERELD-as die tAxis is
    const gapModel=Math.round((right.m._bb['min'+Tn]-left.m._bb['max'+Tn])*1000);
    console.log(`      → zelfde element? ${sameEl?'JA (gesplitst/artefact)':'NEE (twee aparte elementen)'}`);
    console.log(`      → model-voeg langs ${planeNa.tAxis}: ${gapModel}mm  | geprojecteerd gat: ${w}mm  → ${Math.abs(gapModel-w)<10?'GELIJK = ECHTE MODEL-VOEG':'VERSCHILT = projectie-artefact'}`);
    // staat er soms een element van een ANDER minX-vlak dat het gat in werkelijkheid vult?
    const fillOther=wMembers.concat(pMembers).filter(m=>{const a=aabbWorld(m.wallOrigin);const t0=a['min'+Tn],t1=a['max'+Tn];return t0< g.b && t1> g.a && Math.abs(m._bb.minX-facadeX)>=0.06;});
    if(fillOther.length)console.log(`      → LET OP: ${fillOther.length} element(en) op een ANDER minX-vlak overlappen dit t-bereik (mogelijk terugliggend/vleugel): bv #${fillOther[0].expressID} minX=${fillOther[0]._bb.minX.toFixed(3)}`);
  }
}

console.log(`\n=== CONCLUSIE ===`);
console.log(`  Zie regels hierboven: gat-breedte, flankerende elementen, model-voeg vs projectie, en voor/na-fix.`);
