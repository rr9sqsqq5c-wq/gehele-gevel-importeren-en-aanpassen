// VALIDATIE — seam-merge in maskRowsToContours (achter best-fit-pad).
// Bewijst: (1) de twee gemeten BIL-voegen (~45/40 mm) worden OVERBRUGD; (2) een gat
// van ~200 mm blijft OPEN; (3) BIL-gevel heeft geen gaten in de 75–200 mm-range.
// Importeert de ECHTE productie-module. Geen src-wijziging in deze run.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildBestFitFacadePattern } from "../../src/lib/facadePlane.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const A = resolve(__dirname, "../../../stap-1-maak-eerst-een-vast-proje-62cf");
const W = createRequire(pathToFileURL(A + "/package.json"))(resolve(A, "node_modules/web-ifc/web-ifc-api-node.js"));
const MAT = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };

// ── DEEL A: synthetisch — voeg ≤75mm overbrugd, opening ≥200mm open ──
console.log("=== DEEL A — synthetisch: 45mm-voeg overbruggen, 200mm-opening open laten ===");
function wo(ls,le){return{lengthAxis:'z',heightAxis:'y',thicknessAxis:'x',lengthStart:ls,lengthEnd:le,heightStart:0,heightEnd:2870,thicknessStart:0,thicknessEnd:300,resolvedOutside:{outsideDir:-1,outsidePos:0}};}
const mk=(id,ls,le)=>({expressID:id,length:le-ls,height:2870,openings:[],wallOrigin:wo(ls,le)});
// m1: 0..3000 | VOEG 45mm | m2: 3045..6000 | GAT 200mm (echte opening) | m3: 6200..9000
const synth=[mk('s1',0,3000),mk('s2',3045,6000),mk('s3',6200,9000)];
const fdA=buildBestFitFacadePattern(synth,MAT,'halfsteens',null,null,null,0,0,0,'y');
const piecesAt=(fd,y)=>{const r=fd.rows.find(r=>Math.abs(r.y-y)<30);return r?r.pieces:[];};
const coveredAt=(fd,t)=>piecesAt(fd,1000).some(p=>p.start<=t&&p.start+p.length>=t);
const seamCov=coveredAt(fdA,3020);       // midden van de 45mm-voeg → moet BEKLEED (overbrugd)
const openOpen=!coveredAt(fdA,6100);     // midden van het 200mm-gat → moet LEEG
console.log(`  45mm-voeg (t=3020) overbrugd? ${seamCov?'JA ✅':'NEE ❌'}`);
console.log(`  200mm-opening (t=6100) blijft open? ${openOpen?'JA ✅':'NEE ❌ (foutief overbrugd)'}`);

// ── DEEL B: echte BIL-gevel ──
console.log("\n=== DEEL B — echte BIL-gevel: voeg-overbrugging + 75–200mm-controle ===");
const api=new W.IfcAPI();await api.Init();
const tc=(n)=>{try{return api.GetTypeCodeFromName(n);}catch{return undefined;}};
const val=(x)=>(x&&typeof x==='object'&&'value'in x)?x.value:x;
function getBBox(mid,eid){let mesh;try{mesh=api.GetFlatMesh(mid,eid);}catch{return null;}if(!mesh||!mesh.geometries.size())return null;let a={x:Infinity,y:Infinity,z:Infinity},b={x:-Infinity,y:-Infinity,z:-Infinity},ok=false;for(let gi=0;gi<mesh.geometries.size();gi++){const pl=mesh.geometries.get(gi);let g;try{g=api.GetGeometry(mid,pl.geometryExpressID);const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize());const m=pl.flatTransformation;const st=Math.max(6,Math.floor((v.length/6)/120)*6);for(let k=0;k<v.length;k+=st){const lx=v[k],ly=v[k+1],lz=v[k+2];const wx=m[0]*lx+m[4]*ly+m[8]*lz+m[12],wy=m[1]*lx+m[5]*ly+m[9]*lz+m[13],wz=m[2]*lx+m[6]*ly+m[10]*lz+m[14];if(wx<a.x)a.x=wx;if(wx>b.x)b.x=wx;if(wy<a.y)a.y=wy;if(wy>b.y)b.y=wy;if(wz<a.z)a.z=wz;if(wz>b.z)b.z=wz;ok=true;}}finally{g?.delete();}}return ok?{minX:a.x,maxX:b.x,minY:a.y,maxY:b.y,minZ:a.z,maxZ:b.z}:null;}
function deriveWallAxes(dx,dy,dz,heightAxis){if(heightAxis==='z_neg')heightAxis='z';if(heightAxis==='y'){const la=dx>=dz?'x':'z',ta=dx>=dz?'z':'x';return{heightAxis,lengthAxis:la,thicknessAxis:ta,length:Math.round(Math.max(dx,dz)*1000),height:Math.round(dy*1000)};}const la=dx>=dy?'x':'y',ta=dx>=dy?'y':'x';return{heightAxis:'z',lengthAxis:la,thicknessAxis:ta,length:Math.round(Math.max(dx,dy)*1000),height:Math.round(dz*1000)};}
function memberFrom(mid,eid,up,kind){const bb=getBBox(mid,eid);if(!bb)return null;const dx=bb.maxX-bb.minX,dy=bb.maxY-bb.minY,dz=bb.maxZ-bb.minZ;const ax=deriveWallAxes(dx,dy,dz,up);if(ax.length<100||ax.height<100)return null;const rng=(a)=>[Math.round(bb['min'+a.toUpperCase()]*1000),Math.round(bb['max'+a.toUpperCase()]*1000)];const[ls,le]=rng(ax.lengthAxis),[hs,he]=rng(ax.heightAxis),[ts,te]=rng(ax.thicknessAxis);return{expressID:eid,kind,length:ax.length,height:ax.height,openings:[],wallOrigin:{lengthAxis:ax.lengthAxis,heightAxis:ax.heightAxis,thicknessAxis:ax.thicknessAxis,lengthStart:ls,lengthEnd:le,heightStart:hs,heightEnd:he,thicknessStart:ts,thicknessEnd:te},_bb:bb};}
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
const sel=[...facadeWalls,...dakFront].map(m=>{if(m.wallOrigin.thicknessAxis==='x')m.wallOrigin.resolvedOutside={outsideDir:-1,outsidePos:m.wallOrigin.thicknessStart};return m;});

// gaten-spectrum tussen footprints (langs z), om de schone scheiding te tonen
function aabbWorld(wo){const Ab={};const put=(ax,a,b)=>{Ab['min'+ax.toUpperCase()]=Math.min(a,b);Ab['max'+ax.toUpperCase()]=Math.max(a,b);};put(wo.lengthAxis,wo.lengthStart,wo.lengthEnd);put(wo.heightAxis,wo.heightStart,wo.heightEnd);put(wo.thicknessAxis,wo.thicknessStart,wo.thicknessEnd);return Ab;}
const ivZ=sel.map(m=>{const a=aabbWorld(m.wallOrigin);return[a.minZ,a.maxZ];}).sort((a,b)=>a[0]-b[0]);
const gaps=[];let ce=ivZ[0][1];for(let i=1;i<ivZ.length;i++){const[a,b]=ivZ[i];if(a>ce)gaps.push(Math.round(a-ce));ce=Math.max(ce,b);}
const inRange=(lo,hi)=>gaps.filter(g=>g>lo&&g<=hi);
console.log(`  footprint-gaten langs z (mm): ${gaps.sort((a,b)=>a-b).join(', ')||'(geen)'}`);
console.log(`  ≤75mm (voegen): ${inRange(0,75).join(', ')||'-'} | 75–200mm (grijs gebied): ${inRange(75,200).join(', ')||'GEEN ✅'} | >200mm (openingen): ${inRange(200,1e9).length} stuks`);

// bouw met de productie-module en tel resterende volle-hoogte lege kolommen
const fdB=buildBestFitFacadePattern(sel,MAT,'halfsteens',null,null,null,0,0,0,'y');
const STEP=5;let empty=0,runs=[],run=0;
const W0=fdB.groupWidth;
for(let t=STEP/2;t<W0;t+=STEP){const cov=fdB.rows.some(r=>r.pieces.some(p=>p.start<=t&&p.start+p.length>=t));if(!cov){empty+=STEP;run+=STEP;}else{if(run>0)runs.push(run);run=0;}}
if(run>0)runs.push(run);
runs.sort((a,b)=>b-a);
console.log(`  ná seam-merge: resterende lege t-lengte (volle hoogte) = ${Math.round(empty)}mm; grootste runs: ${runs.slice(0,5).map(Math.round).join(', ')||'(geen)'}`);
console.log(`  → de twee ~40–45mm voegen overbrugd? ${runs.every(r=>r>200)||runs.length===0?'JA ✅ (geen run ≤200mm meer)':'check: '+runs.filter(r=>r<=200).join(',')+'mm'}`);

const aOk=seamCov&&openOpen;
const bOk=inRange(75,200).length===0 && runs.every(r=>r>200);
console.log(`\n=== OORDEEL ===`);
console.log(`  DEEL A (45mm overbrug + 200mm open): ${aOk?'GROEN ✅':'FOUT ❌'}`);
console.log(`  DEEL B (BIL voegen weg, schone 75–200 scheiding): ${bOk?'GROEN ✅':'CHECK ❌'}`);
console.log(`  stoplicht: ${aOk&&bOk?'🟢 GROEN':'🟡/🔴 zie boven'}`);
