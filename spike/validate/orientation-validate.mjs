// Validatie globale scène-oriëntatie: de verticaal van het model (heightAxis) moet
// na buildProjectMatrix op three +Y uitkomen — voor zowel Y-up als Z-up modellen.
// Importeert de ECHTE projectCoordinates.js (zelfde code als de app).
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildProjectMatrix, registerIfcContext, reset, getProjectInfo, restoreProjectInfo } from "../../src/lib/projectCoordinates.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const B = resolve(__dirname, "../..");
const require = createRequire(pathToFileURL(B + "/package.json"));
const THREE = require("three");

const up = { z: [0, 0, 1], y: [0, 1, 0], z_neg: [0, 0, 1] };
const fmt = (v) => `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;

function dirAfterMatrix(vec3) {
  const m = buildProjectMatrix();
  return new THREE.Vector3(vec3[0], vec3[1], vec3[2]).transformDirection(m); // negeert translatie
}
function check(label, axis, upVec, expectY = 1) {
  reset();
  if (axis !== 'z') registerIfcContext({ upAxis: axis }, 'test'); // 'z' = default
  else registerIfcContext({ upAxis: 'z' }, 'test');
  const r = dirAfterMatrix(upVec);
  const ok = r.y > 0.95 && Math.abs(r.x) < 0.05 && Math.abs(r.z) < 0.05;
  console.log(`${label.padEnd(42)} up-as=${axis.padEnd(5)} model-verticaal ${fmt(new THREE.Vector3(...upVec))} → three ${fmt(r)}  ${ok ? '✅ staat rechtop' : '❌ ligt op zijn kant'}`);
  return ok;
}

console.log("=== De verticaal van het model moet op three +Y uitkomen ===");
let allOk = true;
// Z-up model (IFC-conventie): heightAxis='z', verticaal = IFC +Z
allOk &= check("Z-up model (IFC-conventie, ongewijzigd)", 'z', up.z);
// Y-up model (BIL-MOO, Kubistisch na fix): heightAxis='y', verticaal = IFC +Y
allOk &= check("Y-up model (BIL/Kubistisch na up-as-fix)", 'y', up.y);
// z_neg (omgekeerd Z-up): de echte verticaal is IFC -Z
allOk &= check("Z-neg model (verticaal = IFC -Z)", 'z_neg', [0, 0, -1]);

console.log("\n=== Regressie-bewijs: wat het OUDE (vaste Rx-90) deed met een Y-up model ===");
// simuleer oud gedrag: behandel Y-up model alsof up='z' (vaste rotatie)
reset(); registerIfcContext({ upAxis: 'z' }, 'oud');
const bad = dirAfterMatrix(up.y); // Y-up verticaal door de Z-up-matrix
console.log(`Y-up verticaal (0,1,0) door vaste Rx(-90°) → three ${fmt(bad)}  ${Math.abs(bad.z) > 0.95 ? '❌ (dit was de bug: gebouw op zijn kant)' : ''}`);

console.log("\n=== Cache-doorgifte (getProjectInfo → restoreProjectInfo) ===");
reset(); registerIfcContext({ upAxis: 'y' }, 'bil');
const snap = getProjectInfo();
console.log("getProjectInfo().upAxis =", snap.upAxis, snap.upAxis === 'y' ? '✅' : '❌');
reset();
console.log("na reset, upAxis in matrix =", (() => { const r = dirAfterMatrix(up.y); return r.y > 0.95 ? 'y(geen rotatie)' : 'z(Rx-90)'; })(), "(verwacht z na reset)");
restoreProjectInfo(snap);
const r2 = dirAfterMatrix(up.y);
console.log("na restoreProjectInfo(snap) → Y-up verticaal →", fmt(r2), r2.y > 0.95 ? '✅ rechtop (upAxis hersteld uit cache)' : '❌');

console.log("\n" + (allOk ? "ALLE oriëntatie-checks groen ✅" : "ER ZIJN FOUTEN ❌"));
