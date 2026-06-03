// Validatie facadePlane.js (v1). Importeert de ECHTE productie-module.
// Deel A: synthetisch (deterministisch) — contour-masker, gat, doorlopend verband, opening.
// Deel B: echt — BIL buitengevel + dakrand-voorzijde → residu ~cm + waarschuwingen.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fitFacadePlane, buildBestFitFacadePattern } from "../../src/lib/facadePlane.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const A = resolve(__dirname, "../../../stap-1-maak-eerst-een-vast-proje-62cf");
const W = createRequire(pathToFileURL(A + "/package.json"))(resolve(A, "node_modules/web-ifc/web-ifc-api-node.js"));
const MAT = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };

// ── DEEL A: synthetisch ──
console.log("=== DEEL A — synthetische coplanaire selectie (X-dun, gat + dakrand-band) ===");
function wo(lAxis, hAxis, tAxis, ls, le, hs, he, ts, te, outDir) {
  return { lengthAxis: lAxis, heightAxis: hAxis, thicknessAxis: tAxis, lengthStart: ls, lengthEnd: le, heightStart: hs, heightEnd: he, thicknessStart: ts, thicknessEnd: te, resolvedOutside: { outsideDir: outDir, outsidePos: outDir < 0 ? ts : te } };
}
const m1 = { expressID: 'w1', length: 3000, height: 2870, openings: [{ id: 'o1', type: 'raam', x: 1000, y: 800, breedte: 800, hoogte: 1200 }], wallOrigin: wo('z', 'y', 'x', 0, 3000, 0, 2870, 0, 300, -1) };
const m2 = { expressID: 'w2', length: 3000, height: 2870, openings: [], wallOrigin: wo('z', 'y', 'x', 3000, 6000, 0, 2870, 0, 300, -1) };      // grenst aan m1
const m3 = { expressID: 'w3', length: 2000, height: 2870, openings: [], wallOrigin: wo('z', 'y', 'x', 7000, 9000, 0, 2870, 0, 300, -1) };      // GAT 6000..7000
const dak = { expressID: 'd1', length: 9000, height: 730, openings: [], wallOrigin: wo('z', 'y', 'x', 0, 9000, 2870, 3600, 0, 300, -1) };       // band boven, spant óók het gat
const members = [m1, m2, m3, dak];
const plane = fitFacadePlane(members, 'y');           // BIL is Y-up → voer de model-up-as
console.log(`  vlak: nAxis=${plane.nAxis} uAxis=${plane.uAxis} tAxis=${plane.tAxis} outsideDir=${plane.outsideDir} offset=${plane.offset} residu=${plane.residualMm}mm coFacing=${Math.round(plane.coFacingFrac*100)}%`);
const fd = buildBestFitFacadePattern(members, MAT, 'halfsteens', null, null, null, 0, 0, 0, 'y');
const piecesAt = (y) => { const r = fd.rows.find(r => Math.abs(r.y - y) < 30); return r ? r.pieces : []; };
const coveredAt = (y, t) => piecesAt(y).some(p => p.start <= t && p.start + p.length >= t);
// checks
const yWall = 1000, yDak = 3200; // wall-band en dakrand-band hoogtes
const gapMidWall = coveredAt(yWall, 6500);   // gat in wand-band → moet LEEG
const gapMidDak  = coveredAt(yDak, 6500);    // dakrand spant het gat → moet BEKLEED
const seamCovered = coveredAt(yWall, 3000);  // naad m1/m2 → doorlopend
const openingCut = !coveredAt(yWall, 1400);  // midden van het raam (z~1400, y~1000) → LEEG
const memberCovered = coveredAt(yWall, 1500-200) || coveredAt(yWall, 500); // wand-zone bekleed
console.log(`  wand-band hoogte=${yWall}: naad m1/m2 (t=3000) bekleed? ${seamCovered?'JA ✅ (doorlopend verband)':'NEE ❌'}`);
console.log(`  GAT (geen element, t=6500) in wand-band bekleed? ${gapMidWall?'JA ❌':'NEE ✅ (contour gevolgd)'}`);
console.log(`  dakrand-band hoogte=${yDak}: zelfde t=6500 (dakrand spant het gat) bekleed? ${gapMidDak?'JA ✅ (alleen waar element zit)':'NEE ❌'}`);
console.log(`  raam-midden (t=1400, wand-band) UITgesneden? ${openingCut?'JA ✅':'NEE ❌'}`);
console.log(`  totaal rijen=${fd.rows.length}, refWallOrigin op vlak: thicknessAxis=${fd.refWallOrigin?.thicknessAxis} outsidePos=${fd.refWallOrigin?.resolvedOutside?.outsidePos}`);
const aOk = seamCovered && !gapMidWall && gapMidDak && openingCut;
console.log(`  DEEL A: ${aOk?'ALLE checks groen ✅':'FOUT ❌'}`);

// ── DEEL B: echte BIL-gevel + dakrand-voorzijde ──
console.log("\n=== DEEL B — echte selectie: BIL buitengevel (één zijde) + dakrand-voorzijde ===");
const api = new W.IfcAPI(); await api.Init();
const tc=(n)=>{try{return api.GetTypeCodeFromName(n);}catch{return undefined;}};
const val=(x)=>(x&&typeof x==='object'&&'value'in x)?x.value:x;
function getBBox(mid,eid){let mesh;try{mesh=api.GetFlatMesh(mid,eid);}catch{return null;}if(!mesh||!mesh.geometries.size())return null;let a={x:Infinity,y:Infinity,z:Infinity},b={x:-Infinity,y:-Infinity,z:-Infinity},ok=false;for(let gi=0;gi<mesh.geometries.size();gi++){const pl=mesh.geometries.get(gi);let g;try{g=api.GetGeometry(mid,pl.geometryExpressID);const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize());const m=pl.flatTransformation;const st=Math.max(6,Math.floor((v.length/6)/60)*6);for(let k=0;k<v.length;k+=st){const lx=v[k],ly=v[k+1],lz=v[k+2];const wx=m[0]*lx+m[4]*ly+m[8]*lz+m[12],wy=m[1]*lx+m[5]*ly+m[9]*lz+m[13],wz=m[2]*lx+m[6]*ly+m[10]*lz+m[14];if(wx<a.x)a.x=wx;if(wx>b.x)b.x=wx;if(wy<a.y)a.y=wy;if(wy>b.y)b.y=wy;if(wz<a.z)a.z=wz;if(wz>b.z)b.z=wz;ok=true;}}finally{g?.delete();}}return ok?{minX:a.x,maxX:b.x,minY:a.y,maxY:b.y,minZ:a.z,maxZ:b.z}:null;}
function deriveWallAxes(dx,dy,dz,heightAxis){if(heightAxis==='z_neg')heightAxis='z';if(heightAxis==='y'){const la=dx>=dz?'x':'z',ta=dx>=dz?'z':'x';return{heightAxis,lengthAxis:la,thicknessAxis:ta,length:Math.round(Math.max(dx,dz)*1000),height:Math.round(dy*1000)};}const la=dx>=dy?'x':'y',ta=dx>=dy?'y':'x';return{heightAxis:'z',lengthAxis:la,thicknessAxis:ta,length:Math.round(Math.max(dx,dy)*1000),height:Math.round(dz*1000)};}
function memberFrom(mid,eid,up){const bb=getBBox(mid,eid);if(!bb)return null;const dx=bb.maxX-bb.minX,dy=bb.maxY-bb.minY,dz=bb.maxZ-bb.minZ;const ax=deriveWallAxes(dx,dy,dz,up);if(ax.length<100||ax.height<100)return null;const rng=(a)=>[Math.round(bb['min'+a.toUpperCase()]*1000),Math.round(bb['max'+a.toUpperCase()]*1000)];const[ls,le]=rng(ax.lengthAxis),[hs,he]=rng(ax.heightAxis),[ts,te]=rng(ax.thicknessAxis);return{expressID:eid,length:ax.length,height:ax.height,openings:[],wallOrigin:{lengthAxis:ax.lengthAxis,heightAxis:ax.heightAxis,thicknessAxis:ax.thicknessAxis,lengthStart:ls,lengthEnd:le,heightStart:hs,heightEnd:he,thicknessStart:ts,thicknessEnd:te},_bb:bb};}

// BIL walls (up=y), filter buitenwand NL-SfB 21, thin in X, op het min-X facade-vlak
const midW=api.OpenModel(new Uint8Array(readFileSync("C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/BIL-MOO-A-ZZ-PBP.ifc")),{});
const typeMap={};{const v=api.GetLineIDsWithType(midW,tc('IFCRELDEFINESBYTYPE'));for(let i=0;i<v.size();i++){try{const r=api.GetLine(midW,v.get(i),false);const tr=val(r?.RelatingType);if(!tr)continue;const tn=val(api.GetLine(midW,tr,false)?.Name);for(const ro of (r?.RelatedObjects||[])){const id=val(ro);if(id&&tn)typeMap[id]=tn;}}catch{}}}
const wIds=[];for(const t of ['IFCWALLSTANDARDCASE','IFCWALL']){const v=api.GetLineIDsWithType(midW,tc(t));for(let i=0;i<v.size();i++){const id=v.get(i);if(/(^|:)\s*21[\.\s]/.test(typeMap[id]||''))wIds.push(id);}}
const wMembers=wIds.map(id=>memberFrom(midW,id,'y')).filter(Boolean).filter(m=>m.wallOrigin.thicknessAxis==='x');
// densste minX-bin (50mm) = één facade-vlak (gebouw heeft vleugels → meerdere minX-niveaus)
const binH=new Map();for(const m of wMembers){const k=Math.round(m._bb.minX/0.05);binH.set(k,(binH.get(k)||0)+1);}
let bk=0,bn=0;for(const [k,c] of binH)if(c>bn){bn=c;bk=k;}const facadeX=bk*0.05;
const facadeWalls=wMembers.filter(m=>Math.abs(m._bb.minX-facadeX)<0.06);
api.CloseModel(midW);
// dakrand plates (up=z zoals app), thin in X, voorvlak nabij facadeX
const midD=api.OpenModel(new Uint8Array(readFileSync("C:/Users/MurkAnneKooistraKooi/Downloads/BIL-VIA-L-ZZ-PBP_dakranden.IFC.ifc")),{});
const pIds=[];{const v=api.GetLineIDsWithType(midD,tc('IFCPLATE'));for(let i=0;i<v.size();i++)pIds.push(v.get(i));}
const pMembers=pIds.map(id=>memberFrom(midD,id,'z')).filter(Boolean);
const dakFront=pMembers.filter(m=>{const e={x:m._bb.maxX-m._bb.minX,y:m._bb.maxY-m._bb.minY,z:m._bb.maxZ-m._bb.minZ};const thin=['x','y','z'].reduce((a,b)=>e[a]<=e[b]?a:b);return thin==='x'&&Math.abs(m._bb.minX-facadeX)<0.06;});
api.CloseModel(midD);

console.log(`  facade-vlak X≈${facadeX.toFixed(2)} m  | buitenwanden op vlak: ${facadeWalls.length}  | dakrand-voorplaten op vlak: ${dakFront.length}`);
// in de echte app hebben wanden resolvedOutside; deze gevel kijkt naar -X
const sel=[...facadeWalls,...dakFront].map(({_bb,...m})=>{ if(m.wallOrigin.thicknessAxis==='x') m.wallOrigin.resolvedOutside={outsideDir:-1, outsidePos:m.wallOrigin.thicknessStart}; return m; });
if(sel.length>=2){
  const pl=fitFacadePlane(sel, 'y');                    // BIL is Y-up
  console.log(`  best-fit: nAxis=${pl.nAxis} uAxis=${pl.uAxis} tAxis=${pl.tAxis} | residu=${pl.residualMm} mm | coFacing=${Math.round(pl.coFacingFrac*100)}% | offset=${pl.offset} mm`);
  console.log(`  waarschuwingen: ${pl.warnings.length?pl.warnings.join(' | '):'(geen)'}`);
  const fdB=buildBestFitFacadePattern(sel, MAT, 'halfsteens', null, null, null, 0, 0, 0, 'y');
  if(fdB){const tot=fdB.rows.reduce((s,r)=>s+r.pieces.length,0);console.log(`  pattern: ${fdB.rows.length} rijen, ${tot} stukken, groupWidth=${fdB.groupWidth}mm groupHeight=${fdB.groupHeight}mm op vlak (thicknessAxis=${fdB.refWallOrigin.thicknessAxis})`);
    console.log(`  → één doorlopend coplanair vlak met strippen op alle leden: ${tot>0&&pl.residualMm<=50?'JA ✅':'controleer ❌'}`);}
} else console.log('  (te weinig leden geselecteerd voor de test)');
