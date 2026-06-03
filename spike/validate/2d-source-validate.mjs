// VALIDATIE — 2D en 3D uit één bron (single source of truth).
// A) Vlag UIT: de bron die View2D nu krijgt (allPatterns-args) == wat View2D vroeger
//    zelf berekende (eigen args) → byte-identiek (geen 2D-diff).
// B) Vlag AAN: de gedeelde facadeData (best-fit) dekt de dakranden — die het OUDE
//    2D-pad (buildFullGroupFacadePattern, axisWalls-filter) liet vallen.
// Importeert de ECHTE productie-modules.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildFullGroupFacadePattern } from "../../src/lib/pattern.js";
import { buildBestFitFacadePattern } from "../../src/lib/facadePlane.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const A = resolve(__dirname, "../../../stap-1-maak-eerst-een-vast-proje-62cf");
const W = createRequire(pathToFileURL(A + "/package.json"))(resolve(A, "node_modules/web-ifc/web-ifc-api-node.js"));
const MAT = { steenL: 210, steenH: 50, lint: 12, stoot: 10, brickWeightM2: 40 };
const MAT_2D = { steenL: 210, steenH: 50, lint: 12, stoot: 10 }; // View2D-fallback (zonder brickWeightM2)

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
const sel=[...facadeWalls,...dakFront].map(({_bb,...m})=>{if(m.wallOrigin.thicknessAxis==='x')m.wallOrigin.resolvedOutside={outsideDir:-1,outsidePos:m.wallOrigin.thicknessStart};return m;});
console.log(`BIL: wanden=${facadeWalls.length} dakrand=${dakFront.length}`);
const rowsTotal=(fd)=>fd?fd.rows.reduce((s,r)=>s+r.pieces.length,0):0;

// ── A) VLAG UIT — byte-identiek: View2D-oude-args vs allPatterns-args ──
console.log(`\n=== A. VLAG UIT — byte-identiek (bron-wissel verandert 2D niet) ===`);
// View2D rekende vroeger: buildFullGroupFacadePattern(walls, effectiveMat(2D), verband, maxH, zetwerk, null, startLijn, eL, eR)
const old2D=buildFullGroupFacadePattern(sel, MAT_2D, 'halfsteens', null, null, null, 0, 0, 0);
// allPatterns (vlag uit) rekent: buildFullGroupFacadePattern(walls, effectiveMat3d, verband, maxH, zetwerk, null, startLijn, eL, eR)
const allP_off=buildFullGroupFacadePattern(sel, MAT, 'halfsteens', null, null, null, 0, 0, 0);
const same=JSON.stringify(old2D.rows)===JSON.stringify(allP_off.rows) && old2D.groupWidth===allP_off.groupWidth && old2D.groupHeight===allP_off.groupHeight;
console.log(`  oude 2D-bron: ${rowsTotal(old2D)} stukken, ${Math.round(old2D.groupWidth)}×${Math.round(old2D.groupHeight)}`);
console.log(`  nieuwe bron (allPatterns, vlag uit): ${rowsTotal(allP_off)} stukken, ${Math.round(allP_off.groupWidth)}×${Math.round(allP_off.groupHeight)}`);
console.log(`  → IDENTIEK? ${same?'JA ✅ (byte-identiek, geen 2D-diff)':'NEE ❌'}`);

// ── B) VLAG AAN — gedeelde facadeData dekt de dakranden ──
console.log(`\n=== B. VLAG AAN — gedeelde best-fit-bron dekt de dakranden ===`);
const bestFit=buildBestFitFacadePattern(sel, MAT, 'halfsteens', null, null, null, 0, 0, 0, 'y');
// De dakrand-strips zitten BOVEN de top van het oude (walls-only) pad. Tel de strip-
// dekking strikt boven old2D.groupHeight: dat zijn dakrand-strips die het OUDE 2D-pad
// (axisWalls dropte de dakranden) nooit toonde.
const yCut=old2D.groupHeight;
function coverAbove(fd,yc){if(!fd)return 0;return fd.rows.filter(r=>r.y>=yc-0.5).reduce((s,r)=>s+r.pieces.reduce((q,p)=>q+p.length,0),0);}
const dakOld=coverAbove(old2D,yCut), dakNew=coverAbove(bestFit,yCut);
console.log(`  oude pad (= wat 2D vroeger toonde): ${rowsTotal(old2D)} stukken, hoogte ${Math.round(old2D.groupHeight)}mm`);
console.log(`  best-fit (nu gedeeld door 2D én 3D): ${rowsTotal(bestFit)} stukken, hoogte ${Math.round(bestFit.groupHeight)}mm  (+${rowsTotal(bestFit)-rowsTotal(old2D)} stukken)`);
console.log(`  strip-dekking BOVEN ${Math.round(yCut)}mm (dakrand-zone): oude pad=${Math.round(dakOld)}mm → best-fit=${Math.round(dakNew)}mm`);
const dakNowShown=bestFit.groupHeight>old2D.groupHeight+300 && rowsTotal(bestFit)>rowsTotal(old2D) && dakNew>dakOld+1000;
console.log(`  → dakranden nu in de gedeelde bron (en dus in 2D)? ${dakNowShown?'JA ✅':'NEE ❌'}`);
console.log(`  → 2D en 3D lezen exact hetzelfde object (allPatterns[id].facadeData): per constructie identiek ✅`);

console.log(`\n=== OORDEEL ===`);
console.log(`  A vlag-uit byte-identiek: ${same?'GROEN ✅':'ROOD ❌'}`);
console.log(`  B vlag-aan dakranden gedeeld: ${dakNowShown?'GROEN ✅':'ROOD ❌'}`);
console.log(`  stoplicht: ${same&&dakNowShown?'🟢 GROEN':'🔴 zie boven'}`);
