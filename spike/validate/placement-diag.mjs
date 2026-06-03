// READ-ONLY: waar landt BIL-MOO in three-wereld onder OUD (up=z, Rx-90) vs NIEUW
// (up=y, identity)? Gebruikt de ECHTE buildProjectMatrix + registerIfcContext.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildProjectMatrix, registerIfcContext, reset } from "../../src/lib/projectCoordinates.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const A = resolve(__dirname, "../../../stap-1-maak-eerst-een-vast-proje-62cf");
const B = resolve(__dirname, "../..");
const reqA = createRequire(pathToFileURL(A + "/package.json"));
const reqB = createRequire(pathToFileURL(B + "/package.json"));
const W = reqA(resolve(A, "node_modules/web-ifc/web-ifc-api-node.js"));
const THREE = reqB("three");
const val = (x) => (x && typeof x === "object" && "value" in x) ? x.value : x;
const F = "C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/BIL-MOO-A-ZZ-PBP.ifc";

const api = new W.IfcAPI(); await api.Init();
const mid = api.OpenModel(new Uint8Array(readFileSync(F)), {});

// ── origin + trueNorth lezen (replica _readAndRegisterIfcContext) ──
let origin = { x: 0, y: 0, z: 0 }, trueNorth = null;
try {
  const ctxVec = api.GetLineIDsWithType(mid, api.GetTypeCodeFromName('IFCGEOMETRICREPRESENTATIONCONTEXT'));
  for (let i = 0; i < ctxVec.size(); i++) {
    const ctx = api.GetLine(mid, ctxVec.get(i), false);
    const ctxType = ctx?.ContextType?.value ?? ctx?.ContextType;
    if (typeof ctxType === 'string' && ctxType !== 'Model') continue;
    const wcsRef = val(ctx?.WorldCoordinateSystem);
    if (wcsRef != null) { const wcs = api.GetLine(mid, wcsRef, false); const oRef = val(wcs?.Location);
      if (oRef != null) { const pt = api.GetLine(mid, oRef, false); const c = pt?.Coordinates;
        if (Array.isArray(c)) origin = { x: Number(val(c[0]) ?? 0), y: Number(val(c[1]) ?? 0), z: Number(val(c[2]) ?? 0) }; } }
    const tnRef = val(ctx?.TrueNorth);
    if (tnRef != null) { const tn = api.GetLine(mid, tnRef, false); const d = tn?.DirectionRatios;
      if (Array.isArray(d) && d.length >= 2) trueNorth = [Number(val(d[0]) ?? 0), Number(val(d[1]) ?? 0)]; }
    break;
  }
} catch {}
console.log("WorldCoordinateSystem origin (mm):", origin, " → m:", { x: origin.x/1000, y: origin.y/1000, z: origin.z/1000 });
console.log("TrueNorth:", trueNorth);
const SIG = 1000; const dist = Math.hypot(origin.x, origin.y, origin.z);
console.log("origin significant (>1m van 0)?", dist > SIG, ` (afstand ${(dist/1000).toFixed(1)} m)`);

// ── wand-corners in IFC-meters (web-ifc world) ──
const wallIds = []; for (const t of [W.IFCWALLSTANDARDCASE, W.IFCWALL]) { const v = api.GetLineIDsWithType(mid, t); for (let i = 0; i < v.size(); i++) wallIds.push(v.get(i)); }
const corners = [];
const stride = Math.max(1, Math.floor(wallIds.length / 600));
let rawMin = [Infinity,Infinity,Infinity], rawMax = [-Infinity,-Infinity,-Infinity];
for (let idx = 0; idx < wallIds.length; idx += stride) {
  let mesh; try { mesh = api.GetFlatMesh(mid, wallIds[idx]); } catch { continue; }
  if (!mesh || mesh.geometries.size() === 0) continue;
  let a=[Infinity,Infinity,Infinity], b=[-Infinity,-Infinity,-Infinity], ok=false;
  for (let gi=0; gi<mesh.geometries.size(); gi++){ const pl=mesh.geometries.get(gi); let g;
    try{ g=api.GetGeometry(mid,pl.geometryExpressID); const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()); const m=pl.flatTransformation;
      for(let i=0;i<v.length;i+=6){const lx=v[i],ly=v[i+1],lz=v[i+2];const w=[m[0]*lx+m[4]*ly+m[8]*lz+m[12],m[1]*lx+m[5]*ly+m[9]*lz+m[13],m[2]*lx+m[6]*ly+m[10]*lz+m[14]];
        for(let k=0;k<3;k++){if(w[k]<a[k])a[k]=w[k];if(w[k]>b[k])b[k]=w[k];if(w[k]<rawMin[k])rawMin[k]=w[k];if(w[k]>rawMax[k])rawMax[k]=w[k];}ok=true;}}finally{g?.delete();}}
  if(!ok)continue;
  for(const [sx,sy,sz] of [[0,0,0],[1,1,1]]) corners.push([sx?b[0]:a[0], sy?b[1]:a[1], sz?b[2]:a[2]]);
  // alle 8 hoeken
  for(const cx of [a[0],b[0]])for(const cy of [a[1],b[1]])for(const cz of [a[2],b[2]])corners.push([cx,cy,cz]);
}
console.log(`\nRAW IFC-world wand-bbox (m): X[${rawMin[0].toFixed(1)}..${rawMax[0].toFixed(1)}] Y[${rawMin[1].toFixed(1)}..${rawMax[1].toFixed(1)}] Z[${rawMin[2].toFixed(1)}..${rawMax[2].toFixed(1)}]`);
console.log(`(corners gesampled: ${corners.length} van ${wallIds.length} wanden, stride ${stride})`);

function bboxAfter(upAxis) {
  reset();
  registerIfcContext({ origin, trueNorth, upAxis }, 'diag');
  const m = buildProjectMatrix();
  let mn=[Infinity,Infinity,Infinity], mx=[-Infinity,-Infinity,-Infinity];
  for (const c of corners) { const v = new THREE.Vector3(c[0], c[1], c[2]).applyMatrix4(m);
    mn[0]=Math.min(mn[0],v.x);mn[1]=Math.min(mn[1],v.y);mn[2]=Math.min(mn[2],v.z);
    mx[0]=Math.max(mx[0],v.x);mx[1]=Math.max(mx[1],v.y);mx[2]=Math.max(mx[2],v.z);}
  return { mn, mx };
}
function report(label, upAxis) {
  const { mn, mx } = bboxAfter(upAxis);
  // NIEUWE CameraInit-formule: werkelijk centrum + omvang
  const cx=(mn[0]+mx[0])/2, cy=(mn[1]+mx[1])/2, cz=(mn[2]+mx[2])/2;
  const span = Math.max(mx[0]-mn[0], mx[1]-mn[1], mx[2]-mn[2], 0.1);
  const dist = span*1.2;
  const camY = cy + span*0.5;
  console.log(`\n=== ${label} (up=${upAxis}) ===`);
  console.log(`  three-bbox (m): X[${mn[0].toFixed(1)}..${mx[0].toFixed(1)}] Y[${mn[1].toFixed(1)}..${mx[1].toFixed(1)}] Z[${mn[2].toFixed(1)}..${mx[2].toFixed(1)}]`);
  console.log(`  verticaal(Y): ${mn[1].toFixed(1)}..${mx[1].toFixed(1)} m  (rond de grond? ${mn[1] > -50 && mx[1] < 200 ? 'JA ✅' : 'NEE ❌'})`);
  console.log(`  NIEUWE camera-fit: target=centrum (${cx.toFixed(1)}, ${cy.toFixed(1)}, ${cz.toFixed(1)})  pos=(${cx.toFixed(1)}, ${camY.toFixed(1)}, ${(cz+dist).toFixed(1)})  → target==centrum dus altijd in beeld ✅`);
}
report("OUD", "z");
report("NIEUW", "y");

// ── MERGE-invariantie: de origin-translatie valt weg in relatieve plaatsing ──
console.log("\n=== MERGE-check: origin/translatie raakt relatieve plaatsing NIET ===");
reset(); registerIfcContext({ origin, trueNorth, upAxis: 'y' }, 'merge');
const M = buildProjectMatrix();
const p1 = new THREE.Vector3(10, 3, -20), p2 = new THREE.Vector3(25, 3, -5); // twee IFC-punten (m)
const t1 = p1.clone().applyMatrix4(M), t2 = p2.clone().applyMatrix4(M);
const relThree = t2.clone().sub(t1);
// alleen de lineaire (rotatie) component op (p2-p1):
const R = M.clone(); R.setPosition(0,0,0);
const relLinear = p2.clone().sub(p1).applyMatrix4(R);
const diff = relThree.clone().sub(relLinear).length();
console.log(`  M·p2 − M·p1 = (${relThree.x.toFixed(3)}, ${relThree.y.toFixed(3)}, ${relThree.z.toFixed(3)})`);
console.log(`  R·(p2−p1)   = (${relLinear.x.toFixed(3)}, ${relLinear.y.toFixed(3)}, ${relLinear.z.toFixed(3)})`);
console.log(`  verschil = ${diff.toExponential(2)} → translatie/origin valt weg ${diff < 1e-6 ? '✅ (relatieve plaatsing onafhankelijk van origin → merge ongewijzigd)' : '❌'}`);
api.CloseModel(mid);
