// WEGWERP (spike/) — bouwt een SYNTHETISCHE, UNIFORME boom-offset-fixture uit BIL-MOO.
// BIL-MOO heeft MEERDERE IfcSite-roots (gelinkte Revit-modellen). Eén site verschuiven
// splitst de geometrie. Daarom: ALLE root-placements (IFCLOCALPLACEMENT($,..)) onder één
// NIEUWE root hangen die de RD-offset draagt → elk element krijgt +RD exact één keer.
// Tevens context-WCS #20 → (0,0,0). Verifieert door her-inlezen (uniformiteits-check).

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync } from 'fs';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SRC = join(ROOT, 'public', 'BIL-MOO-A-ZZ-PBP.ifc');
const DST = join(__dirname, 'BOOM-MOO.ifc');
const RD = '111185325.12550394,471934574.99281204,0.';

let txt = readFileSync(SRC, 'utf8');

// 1) context-WCS punt #20 → (0,0,0)
const reWcs = /#20=IFCCARTESIANPOINT\(\([^)]*\)\);/;
if (!reWcs.test(txt)) throw new Error('#20 niet gevonden');
txt = txt.replace(reWcs, `#20=IFCCARTESIANPOINT((0.,0.,0.));`);

// 2) alle root-placements onder een nieuwe RD-root hangen.
const rootCount = (txt.match(/IFCLOCALPLACEMENT\(\$,/g) || []).length;
if (rootCount < 1) throw new Error('geen root-placements ($) gevonden');
txt = txt.replace(/IFCLOCALPLACEMENT\(\$,/g, 'IFCLOCALPLACEMENT(#9000003,');

// 3) nieuwe entiteiten toevoegen vlak na DATA;
const newEnts = [
  `#9000001=IFCCARTESIANPOINT((${RD}));`,
  `#9000002=IFCAXIS2PLACEMENT3D(#9000001,$,$);`,
  `#9000003=IFCLOCALPLACEMENT($,#9000002);`,
].join('\n');
txt = txt.replace(/DATA;\r?\n/, (m) => m + newEnts + '\n');

writeFileSync(DST, txt);
console.log(`✔ fixture geschreven: ${DST}`);
console.log(`  ${rootCount} root-placements ($) → herhangen onder #9000003 (RD-offset)`);

// ── verify door her-inlezen ──
const WebIFC = require('web-ifc');
const api = new WebIFC.IfcAPI();
try { await api.Init(); } catch { api.SetWasmPath(join(ROOT, 'node_modules', 'web-ifc') + '/', true); await api.Init(); }
const buf = readFileSync(DST);
const modelID = api.OpenModel(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), {});

// #20
const cv = api.GetLineIDsWithType(modelID, api.GetTypeCodeFromName('IFCGEOMETRICREPRESENTATIONCONTEXT'));
let wcs = null;
for (let i = 0; i < cv.size(); i++) { const c = api.GetLine(modelID, cv.get(i), false); const ct = c?.ContextType?.value ?? c?.ContextType; if (typeof ct === 'string' && ct !== 'Model') continue;
  const w = api.GetLine(modelID, c?.WorldCoordinateSystem?.value, false); const pt = api.GetLine(modelID, w?.Location?.value, false); const k = pt?.Coordinates;
  wcs = { x: +(k[0]?.value ?? k[0]), y: +(k[1]?.value ?? k[1]), z: +(k[2]?.value ?? k[2]) }; break; }

// uniformiteits-check: hoeveel wanden RD-orde (>50 km) vs lokaal (<5 km)?
function transMag(eid) { let m; try { m = api.GetFlatMesh(modelID, eid); } catch { return null; } if (!m || m.geometries.size() === 0) return null;
  const t = m.geometries.get(0).flatTransformation; return Math.hypot(t[12], t[13], t[14]); }
let rd = 0, local = 0, mid = 0, total = 0;
for (const tn of ['IFCWALLSTANDARDCASE', 'IFCWALL']) { const v = api.GetLineIDsWithType(modelID, WebIFC[tn]); for (let i = 0; i < v.size(); i++) { const mg = transMag(v.get(i)); if (mg == null) continue; total++; if (mg > 50000) rd++; else if (mg < 5000) local++; else mid++; } }

console.log('\n[verify]');
console.log('  context-WCS #20 :', wcs, wcs && Math.hypot(wcs.x, wcs.y, wcs.z) < 1 ? '🟢 ≈ 0' : '🔴');
console.log(`  wand-placements: RD-orde=${rd} | lokaal=${local} | tussen=${mid} | totaal=${total}`);
console.log(`  ${rd === total && total > 0 ? '🟢 UNIFORM op RD (geen split)' : '🔴 NIET uniform'}`);
api.CloseModel(modelID);
process.exit(0);
