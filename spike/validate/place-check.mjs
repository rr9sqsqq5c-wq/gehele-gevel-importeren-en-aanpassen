// Kubistisch placement + Z-up regressie (geen verschuiving). Echte buildProjectMatrix.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildProjectMatrix, registerIfcContext, reset } from "../../src/lib/projectCoordinates.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const A = resolve(__dirname, "../../../stap-1-maak-eerst-een-vast-proje-62cf");
const B = resolve(__dirname, "../..");
const W = createRequire(pathToFileURL(A + "/package.json"))(resolve(A, "node_modules/web-ifc/web-ifc-api-node.js"));
const THREE = createRequire(pathToFileURL(B + "/package.json"))("three");
const val = (x) => (x && typeof x === "object" && "value" in x) ? x.value : x;
const api = new W.IfcAPI(); await api.Init();

function readOrigin(mid) {
  let origin = { x: 0, y: 0, z: 0 }, trueNorth = null;
  try { const ctxVec = api.GetLineIDsWithType(mid, api.GetTypeCodeFromName('IFCGEOMETRICREPRESENTATIONCONTEXT'));
    for (let i = 0; i < ctxVec.size(); i++) { const ctx = api.GetLine(mid, ctxVec.get(i), false);
      const ct = ctx?.ContextType?.value ?? ctx?.ContextType; if (typeof ct === 'string' && ct !== 'Model') continue;
      const wcsRef = val(ctx?.WorldCoordinateSystem); if (wcsRef != null) { const wcs = api.GetLine(mid, wcsRef, false); const oRef = val(wcs?.Location);
        if (oRef != null) { const pt = api.GetLine(mid, oRef, false); const c = pt?.Coordinates; if (Array.isArray(c)) origin = { x: +(val(c[0])??0), y: +(val(c[1])??0), z: +(val(c[2])??0) }; } }
      const tnRef = val(ctx?.TrueNorth); if (tnRef != null) { const tn = api.GetLine(mid, tnRef, false); const d = tn?.DirectionRatios; if (Array.isArray(d)&&d.length>=2) trueNorth = [+(val(d[0])??0), +(val(d[1])??0)]; }
      break; } } catch {}
  return { origin, trueNorth };
}
function wallYrange(mid, upAxis, origin, trueNorth) {
  reset(); registerIfcContext({ origin, trueNorth, upAxis }, 't'); const m = buildProjectMatrix();
  const ids=[]; for(const t of [W.IFCWALLSTANDARDCASE,W.IFCWALL]){const v=api.GetLineIDsWithType(mid,t);for(let i=0;i<v.size();i++)ids.push(v.get(i));}
  let minY=Infinity,maxY=-Infinity,minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity; const stride=Math.max(1,Math.floor(ids.length/400));
  for(let k=0;k<ids.length;k+=stride){let mesh;try{mesh=api.GetFlatMesh(mid,ids[k]);}catch{continue;}if(!mesh||!mesh.geometries.size())continue;
    for(let gi=0;gi<mesh.geometries.size();gi++){const pl=mesh.geometries.get(gi);let g;try{g=api.GetGeometry(mid,pl.geometryExpressID);const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize());const mm=pl.flatTransformation;
      for(let i=0;i<v.length;i+=18){const lx=v[i],ly=v[i+1],lz=v[i+2];const wx=mm[0]*lx+mm[4]*ly+mm[8]*lz+mm[12],wy=mm[1]*lx+mm[5]*ly+mm[9]*lz+mm[13],wz=mm[2]*lx+mm[6]*ly+mm[10]*lz+mm[14];
        const p=new THREE.Vector3(wx,wy,wz).applyMatrix4(m); if(p.y<minY)minY=p.y;if(p.y>maxY)maxY=p.y;if(p.x<minX)minX=p.x;if(p.x>maxX)maxX=p.x;if(p.z<minZ)minZ=p.z;if(p.z>maxZ)maxZ=p.z;}}finally{g?.delete();}}}
  return {minY,maxY,minX,maxX,minZ,maxZ};
}

// Kubistisch (Y-up)
const KUB = "C:/Users/MurkAnneKooistraKooi/AppData/Local/Microsoft/Windows/INetCache/Content.Outlook/2I1IYVNL/Kubistische woning export IFC.ifc";
let mid = api.OpenModel(new Uint8Array(readFileSync(KUB)), {});
let { origin, trueNorth } = readOrigin(mid);
console.log("Kubistisch origin (mm):", origin, "trueNorth:", trueNorth);
const ky = wallYrange(mid, 'y', origin, trueNorth);
console.log(`Kubistisch (up=y na fix): verticaal Y[${ky.minY.toFixed(1)}..${ky.maxY.toFixed(1)}] m → rond grond? ${ky.minY>-50&&ky.maxY<200?'JA ✅':'NEE ❌'}`);
api.CloseModel(mid);

// Z-up regressie: synthetische Z-up origin (oz = elevatie ≠ 0), check dat 'z' de
// verticaal uit oz haalt (ongewijzigd gedrag). We nemen BIL-geometrie maar doen alsof
// het Z-up is met een origin die OOK in Z een elevatie heeft.
console.log("\n=== Z-up regressie: 'z'-pad ongewijzigd ===");
reset(); registerIfcContext({ origin: { x: 100000000, y: 200000000, z: 5000 }, trueNorth: null, upAxis: 'z' }, 'zup');
const mz = buildProjectMatrix();
// een Z-up punt op elevatie 5 m (z=5000mm) hoort three-Y ≈ 0 te geven (5 - oz/1000=5-5=0)
const pUp = new THREE.Vector3(100000, 200000, 5).applyMatrix4(mz); // geom op origin-XY, elevatie 5m
console.log(`  Z-up punt op elevatie 5m (oz=5m) → three-Y = ${pUp.y.toFixed(3)} (verwacht ≈0: elevatie - oz) ${Math.abs(pUp.y)<0.01?'✅':'❌'}`);
console.log("  ('z'-translatie = (-ox,-oy,-oz), identiek aan vóór de fix → geen verschuiving voor Z-up)");
