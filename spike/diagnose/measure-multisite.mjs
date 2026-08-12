// WEGWERP (spike/) — §8.3 multi-IfcSite. Rapporteert IfcSite-count, alle representation-
// contexts (+ContextType +WCS-origin), en WELKE context de origin-lezer kiest
// (_readAndRegisterIfcContext ifc.js:497-535: eerste context met ContextType 'Model' of
// niet-string). Beoordeelt of die keuze robuust is bij meerdere sites/contexts.
//   node spike/diagnose/measure-multisite.mjs [ifc-pad]

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ARG = process.argv[2] || 'public/BIL-MOO-A-ZZ-PBP.ifc';
const MODEL = ARG.match(/^[A-Za-z]:|^[\\/]/) ? ARG : join(ROOT, ARG);

const WebIFC = require('web-ifc');
const api = new WebIFC.IfcAPI();
try { await api.Init(); } catch { api.SetWasmPath(join(ROOT, 'node_modules', 'web-ifc') + '/', true); await api.Init(); }
const buf = readFileSync(MODEL);
const modelID = api.OpenModel(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), {});

const siteVec = api.GetLineIDsWithType(modelID, api.GetTypeCodeFromName('IFCSITE'));
const ctxVec = api.GetLineIDsWithType(modelID, api.GetTypeCodeFromName('IFCGEOMETRICREPRESENTATIONCONTEXT'));

console.log(`bestand: ${MODEL.split(/[\\/]/).pop()}`);
console.log(`IfcSite-count: ${siteVec.size()}`);
console.log(`IfcGeometricRepresentationContext-count: ${ctxVec.size()}`);

const readWcs = (c) => { const w = c?.WorldCoordinateSystem?.value != null ? api.GetLine(modelID, c.WorldCoordinateSystem.value, false) : null;
  const pt = w?.Location?.value != null ? api.GetLine(modelID, w.Location.value, false) : null; const k = pt?.Coordinates;
  return Array.isArray(k) ? { x: +(k[0]?.value ?? k[0]), y: +(k[1]?.value ?? k[1]), z: +(k[2]?.value ?? k[2]) } : null; };

let pickedIdx = -1;
console.log('\ncontexts:');
for (let i = 0; i < ctxVec.size(); i++) {
  const c = api.GetLine(modelID, ctxVec.get(i), false);
  const ct = c?.ContextType?.value ?? c?.ContextType;
  const wcs = readWcs(c);
  // exacte lezer-conditie (ifc.js:504): typeof string && !== 'Model' → skip
  const skip = (typeof ct === 'string' && ct !== 'Model');
  if (!skip && pickedIdx === -1) pickedIdx = i;
  console.log(`  #${ctxVec.get(i)} ContextType=${JSON.stringify(ct)} WCS=${wcs ? `(${wcs.x.toFixed(0)}, ${wcs.y.toFixed(0)})` : 'null'} ${skip ? '(overgeslagen)' : (pickedIdx === i ? '← GEKOZEN (eerste Model)' : '')}`);
}

console.log('\n=== §8.3 OORDEEL ===');
const modelCtxs = [];
for (let i = 0; i < ctxVec.size(); i++) { const c = api.GetLine(modelID, ctxVec.get(i), false); const ct = c?.ContextType?.value ?? c?.ContextType; if (!(typeof ct === 'string' && ct !== 'Model')) modelCtxs.push(i); }
console.log(`  #IfcSite=${siteVec.size()} maar #'Model'-contexts=${modelCtxs.length}.`);
if (modelCtxs.length === 1) {
  console.log('  🟢 Eén enkele Model-context → de origin-bron is ondubbelzinnig, ONGEACHT het aantal IfcSites.');
  console.log('     De 55 sites delen dezelfde representation-context (#23). first-wins is hier veilig.');
} else {
  console.log('  🟠 Meerdere Model-contexts → first-wins kiest de EERSTE; robuustheid afhankelijk van volgorde.');
}
api.CloseModel(modelID);
process.exit(0);
