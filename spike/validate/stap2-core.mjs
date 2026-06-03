// SPIKE stap-2 validatie — draait de ECHTE nieuwe-module-functies headless.
// Importeert src/lib/openingDerivation.js (zelfde code als de app) en voedt die
// met een node-web-ifc api. node stap2-core.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  deriveOpeningsCore, classifyNlsfbExterior, projectWorldPoints, NLSFB_EXTERIOR,
} from "../../src/lib/openingDerivation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const A = resolve(__dirname, "../../../stap-1-maak-eerst-een-vast-proje-62cf");
const require = createRequire(pathToFileURL(A + "/package.json"));
const WebIFC = require(resolve(A, "node_modules/web-ifc/web-ifc-api-node.js"));

const MODELS = {
  "BIL-MOO": "C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/BIL-MOO-A-ZZ-PBP.ifc",
  "Helmond": "C:/Users/MurkAnneKooistraKooi/.zenflow/worktrees/je-bent-een-senior-software-arch-72bb/backend/uploads/7d0f61bd-a89a-4912-8304-7d872a2caa11/M2502_Helmond Toren Gevel studie.ifc",
  "Kubistisch": "C:/Users/MurkAnneKooistraKooi/AppData/Local/Microsoft/Windows/INetCache/Content.Outlook/2I1IYVNL/Kubistische woning export IFC.ifc",
};

const api = new WebIFC.IfcAPI();
await api.Init();

function wallIdsOf(mid) {
  const ids = [];
  for (const t of [WebIFC.IFCWALLSTANDARDCASE, WebIFC.IFCWALL]) {
    const v = api.GetLineIDsWithType(mid, t);
    for (let i = 0; i < v.size(); i++) ids.push(v.get(i));
  }
  return ids;
}
function detectUpLocal(mid, ids) {
  // zelfde idee als module.detectUp (module-versie verwacht api met GetFlatMesh = ok)
  let sz = 0, sy = 0;
  for (const id of ids.slice(0, 200)) {
    let mesh; try { mesh = api.GetFlatMesh(mid, id); } catch { continue; }
    if (!mesh || mesh.geometries.size() === 0) continue;
    const m = mesh.geometries.get(0).flatTransformation;
    for (const c of [0, 1, 2]) { const x = m[c*4], y = m[c*4+1], z = m[c*4+2]; const l = Math.hypot(x,y,z)||1; sz += Math.abs(z/l); sy += Math.abs(y/l); }
  }
  return sz >= sy ? [0,0,1] : [0,1,0];
}

console.log("=== TEST 1: NL-SfB tabel (unit) ===");
for (const tn of ["Basic Wall:21.10_WA_LB_HSB_272.5", "Basic Wall:22.10_WA_LB_isolatie", "28.20_WA_LB_CLT_15", "42.10_WA_LB_fermac", "GFRC 17.xx onbekend", null]) {
  const r = classifyNlsfbExterior(tn);
  console.log(`  ${JSON.stringify(tn)} → two=${r.two} isExterior=${r.isExterior} (${r.source})`);
}

console.log("\n=== TEST 2: synthetische GEDRAAIDE wand (unit, echte projectWorldPoints) ===");
{
  // wand 45° gedraaid in plattegrond. Frame: L = (cos45,sin45,0), H=up=z, T=L×H.
  const c = Math.SQRT1_2;
  const L = [c, c, 0], H = [0, 0, 1], T = [H[1]*L[2]-H[2]*L[1], H[2]*L[0]-H[0]*L[2], H[0]*L[1]-H[1]*L[0]];
  const O = [0, 0, 0];
  const fr = { O, L, H, T, lMin: 0, lMax: 5, hMin: 0, hMax: 3, tMin: 0, tMax: 0.3 };
  // opening-VLAK 1.0m breed × 2.0m hoog op het buitenvlak, beginnend op l=1.0, h=0.5
  const pts = [];
  for (const ll of [1.0, 2.0]) for (const hh of [0.5, 2.5]) {
    pts.push([O[0] + L[0]*ll + H[0]*hh, O[1] + L[1]*ll + H[1]*hh, O[2] + L[2]*ll + H[2]*hh]);
  }
  const proj = projectWorldPoints(pts, fr);
  // naïef wereld-doosje (zoals B): breedte = grootste horizontale wereld-extent
  let Xmn=Infinity,Xmx=-Infinity,Ymn=Infinity,Ymx=-Infinity;
  for (const p of pts){if(p[0]<Xmn)Xmn=p[0];if(p[0]>Xmx)Xmx=p[0];if(p[1]<Ymn)Ymn=p[1];if(p[1]>Ymx)Ymx=p[1];}
  const aabbW = Math.round(Math.max(Xmx-Xmn, Ymx-Ymn)*1000);
  console.log(`  projectie: ${proj.breedte}×${proj.hoogte}mm  (verwacht 1000×2000)`);
  console.log(`  wereld-doosje breedte: ${aabbW}mm  (B zou dit als breedte nemen → FOUT)`);
  console.log(`  → projectie ${proj.breedte===1000&&proj.hoogte===2000?"KLOPT":"AFWIJKING"}; doosje geeft ${aabbW}mm i.p.v. 1000mm (${Math.round((1-aabbW/1000)*100)}% te smal door 45°-rotatie)`);
}

console.log("\n=== TEST 3: echte modellen via deriveOpeningsCore ===");
for (const [name, f] of Object.entries(MODELS)) {
  let mid; try { mid = api.OpenModel(new Uint8Array(readFileSync(f)), {}); } catch (e) { console.log(`  ${name}: OPEN FOUT ${e.message}`); continue; }
  const ids = wallIdsOf(mid);
  const up = detectUpLocal(mid, ids);
  const { byHost, stats } = await deriveOpeningsCore(api, WebIFC, mid, ids, up);
  let total = 0, oversize = 0, hostsWith = 0;
  const byType = {};
  for (const [, ops] of byHost) { if (ops.length) hostsWith++; for (const o of ops) { total++; byType[o.type] = (byType[o.type]||0)+1;
    // strakheid: breedte/hoogte uit polyPts moet ~ gelijk zijn aan breedte/hoogte velden
  } }
  console.log(`  ${name}: up=${up[2]===1?'Z':'Y'} fbUp=${stats.fbUpAxis ?? '-'} | hosts=${stats.hosts} hostsMetOpening=${hostsWith} | openingen=${total} ${JSON.stringify(byType)} | viaVoid=${stats.viaVoid} viaFallback=${stats.viaFallback} slabVoids=${stats.slabVoids} noGeom=${stats.noGeom}`);
  api.CloseModel(mid);
}
console.log("\nNLSFB_EXTERIOR tabel:", JSON.stringify(NLSFB_EXTERIOR));
