// spike/diagnose/measure-coords-pipeline.mjs
// WEGWERP — Stap 0 uit docs/coord-pipeline-plan.md. READ-ONLY meting, niets bedraad.
//
// Doel: per IFC-bestand vaststellen WAAR de offset zit:
//   - in de context-WCS (#20)  -> Revit "shared coordinates" patroon
//   - in de placement-boom      -> Tekla / lokaal patroon
// Daarmee bevestigen we de symmetrie van de invariant uit het plan (open punt §8.1)
// en de multi-IFCSITE-vraag (§8.3).
//
// LET OP:
//   * Niet getest in deze sandbox (geen netwerk / geen IFC). Mirror desnoods de import-
//     en wasm-setup van je bestaande werkende spike (validate_transform.js).
//   * Roept OpenModel(data, {}) aan — EXACT de engine-call (default settings), zodat de
//     meting overeenkomt met productie.
//   * De browser-raycast/pick-meting (§8.2) zit hier NIET in — dat is een losse handmatige
//     check in de live three.js-scène; node kan dat niet meten.
//
// Gebruik:  node spike/diagnose/measure-coords-pipeline.mjs public/BIL-MOO-A-ZZ-PBP.ifc
//           node spike/diagnose/measure-coords-pipeline.mjs <pad-naar-tekla-bestand.ifc>

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import * as WebIFC from 'web-ifc';

const require = createRequire(import.meta.url);

const ifcPath = process.argv[2];
if (!ifcPath) {
  console.error('Geef een IFC-pad mee. Bijv.: node measure-coords-pipeline.mjs public/model.ifc');
  process.exit(1);
}

// --- helpers ---------------------------------------------------------------
const num = (x) => (x && typeof x === 'object' && 'value' in x ? x.value : x);
const mm2m = (v) => v / 1000;

// IfcCompoundPlaneAngleMeasure [deg, min, sec, (millionth-sec)] -> decimale graden
function compoundToDeg(arr) {
  if (!Array.isArray(arr)) return null;
  const [d = 0, m = 0, s = 0, u = 0] = arr.map(num);
  const sign = d < 0 ? -1 : 1;
  return sign * (Math.abs(d) + Math.abs(m) / 60 + Math.abs(s) / 3600 + Math.abs(u) / 1e6 / 3600);
}

function dist3(t) {
  return Math.hypot(t[0], t[1], t[2]);
}

// --- web-ifc init ----------------------------------------------------------
const api = new WebIFC.IfcAPI();
// Wasm naast het node-pakket; pas dit pad aan als je spike het anders doet.
try {
  const wasmDir = dirname(require.resolve('web-ifc/web-ifc-api-node.js'));
  api.SetWasmPath(wasmDir + '/', true);
} catch {
  api.SetWasmPath(resolve('node_modules/web-ifc') + '/', true);
}
await api.Init();

const data = new Uint8Array(readFileSync(ifcPath));
const modelID = api.OpenModel(data, {}); // <-- exact als de engine

// --- 1. Context-WCS (#20) --------------------------------------------------
let contextWcsMm = null;
const ctxIds = api.GetLineIDsWithType(modelID, WebIFC.IFCGEOMETRICREPRESENTATIONCONTEXT);
for (let i = 0; i < ctxIds.size(); i++) {
  const ctx = api.GetLine(modelID, ctxIds.get(i), true);
  const coords = ctx?.WorldCoordinateSystem?.Location?.Coordinates;
  if (Array.isArray(coords)) {
    const [x, y, z] = coords.map(num);
    // Pak de eerste niet-triviale WCS-origin (de 'Model'-context heeft die meestal).
    if (!contextWcsMm || Math.hypot(x, y, z) > dist3(contextWcsMm) * 1000) {
      contextWcsMm = [x, y, z ?? 0];
    }
  }
}

// --- 2. Coördinatiematrix (verwacht identiteit bij default settings) -------
const coordMat = api.GetCoordinationMatrix(modelID); // 16-array, kolom-major
const coordTransM = [mm2m(coordMat[12]), mm2m(coordMat[13]), mm2m(coordMat[14])];

// --- 3. Plaatsings-extent uit de geometrie (emittedLocal) ------------------
const meshes = api.LoadAllGeometry(modelID);
let n = 0;
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < meshes.size(); i++) {
  const mesh = meshes.get(i);
  const geos = mesh.geometries;
  for (let g = 0; g < geos.size(); g++) {
    const t = geos.get(g).flatTransformation; // 16-array; translatie = [12..14] in m
    const p = [t[12], t[13], t[14]];
    for (let a = 0; a < 3; a++) {
      if (p[a] < min[a]) min[a] = p[a];
      if (p[a] > max[a]) max[a] = p[a];
    }
    n++;
  }
}
const center = n ? [0, 1, 2].map((a) => (min[a] + max[a]) / 2) : [0, 0, 0];

// --- 4. IfcSite (multi-site + georef via RefLat/Long) ----------------------
const siteIds = api.GetLineIDsWithType(modelID, WebIFC.IFCSITE);
let firstSite = null;
if (siteIds.size() > 0) {
  const s = api.GetLine(modelID, siteIds.get(0), true);
  firstSite = {
    lat: compoundToDeg(s?.RefLatitude),
    lon: compoundToDeg(s?.RefLongitude),
  };
}

// --- 5. MapConversion / ProjectedCRS aanwezig? -----------------------------
const hasMapConv = api.GetLineIDsWithType(modelID, WebIFC.IFCMAPCONVERSION).size() > 0;
const hasProjCrs = api.GetLineIDsWithType(modelID, WebIFC.IFCPROJECTEDCRS).size() > 0;

api.CloseModel(modelID);

// --- Verdict ---------------------------------------------------------------
const wcsDistM = contextWcsMm ? mm2m(dist3(contextWcsMm)) : 0;
const geomDistM = dist3(center);
const BIG = 1000; // > 1 km = "ver weg"

let verdict;
if (wcsDistM > BIG && geomDistM < BIG) {
  verdict = 'OFFSET IN CONTEXT-WCS (#20). Revit-shared patroon — huidige #20-aftrek FABRICEERT de verschuiving.';
} else if (wcsDistM < BIG && geomDistM > BIG) {
  verdict = 'OFFSET IN PLAATSINGS-BOOM. Tekla/lokaal patroon — huidige pijplijn laat RD-coords STAAN.';
} else if (wcsDistM < BIG && geomDistM < BIG) {
  verdict = 'MODEL LOKAAL (near-origin). Geen offset-probleem — bruikbaar als byte-identiek-referentie.';
} else {
  verdict = 'BEIDE dragen een grote offset — ongebruikelijk, handmatig onderzoeken.';
}

console.log('============================================================');
console.log('Bestand:', ifcPath);
console.log('Geometrieën gemeten:', n, '| IfcSite-count:', siteIds.size());
console.log('------------------------------------------------------------');
console.log('Context-WCS #20 (m):      ', contextWcsMm ? contextWcsMm.map(mm2m).map((v) => v.toFixed(1)) : 'geen', `| |#20| = ${wcsDistM.toFixed(1)} m`);
console.log('CoordinationMatrix transl:', coordTransM.map((v) => v.toFixed(3)), '(verwacht ~0 bij default settings)');
console.log('Plaatsings-AABB min (m):  ', min.map((v) => v.toFixed(1)));
console.log('Plaatsings-AABB max (m):  ', max.map((v) => v.toFixed(1)));
console.log('Plaatsings-center (m):    ', center.map((v) => v.toFixed(1)), `| afstand tot (0,0,0) = ${geomDistM.toFixed(1)} m`);
console.log('IfcSite RefLat/Long:      ', firstSite ? `${firstSite.lat?.toFixed(5)}, ${firstSite.lon?.toFixed(5)}` : 'geen');
console.log('IfcMapConversion:         ', hasMapConv, '| IfcProjectedCRS:', hasProjCrs);
console.log('------------------------------------------------------------');
console.log('VERDICT:', verdict);
console.log('============================================================');
