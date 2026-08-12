// WEGWERP (spike/) — READ-ONLY. V-A (trueNorth-richting round-trip) + V-B2 (site->building containment).
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WebIFC = require('web-ifc');
const api = new WebIFC.IfcAPI();
try { await api.Init(); } catch { api.SetWasmPath(join(ROOT,'node_modules','web-ifc')+'/', true); await api.Init(); }
const buf = readFileSync(join(ROOT, 'public', 'BIL-MOO-A-ZZ-PBP.ifc'));
const id = api.OpenModel(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), {});

// ── Concern A — bron-TrueNorth-richting ──
console.log('# CONCERN A — TrueNorth round-trip');
const ctxV = api.GetLineIDsWithType(id, api.GetTypeCodeFromName('IFCGEOMETRICREPRESENTATIONCONTEXT'));
let srcDir = null;
for (let i = 0; i < ctxV.size(); i++) {
  const ctx = api.GetLine(id, ctxV.get(i), false);
  const ct = ctx?.ContextType?.value ?? ctx?.ContextType;
  if (typeof ct === 'string' && ct !== 'Model') continue;
  const tnRef = ctx?.TrueNorth?.value;
  if (tnRef != null) {
    const tn = api.GetLine(id, tnRef, false);
    const dr = tn?.DirectionRatios;
    if (Array.isArray(dr)) { srcDir = dr.map(x => Number(x?.value ?? x)); }
  }
  console.log(`  context #${ctxV.get(i)} ContextType=${ct} TrueNorthRef=${tnRef ?? '$'}`);
  break;
}
if (srcDir) {
  const len = Math.hypot(srcDir[0], srcDir[1]);
  const norm = [srcDir[0]/len, srcDir[1]/len];
  const angle = Math.atan2(norm[0], norm[1]) * 180 / Math.PI; // registerIfcContext-conventie: atan2(x,y)
  const written = [Math.sin(angle*Math.PI/180), Math.cos(angle*Math.PI/180)]; // wat C wegschrijft
  console.log(`  bron TrueNorth DirectionRatios : [${srcDir.join(', ')}]`);
  console.log(`  genormaliseerd                 : [${norm.map(v=>v.toFixed(6)).join(', ')}]`);
  console.log(`  afgeleide hoek (atan2(x,y))     : ${angle.toFixed(4)}°`);
  console.log(`  C schrijft [sin,cos]            : [${written.map(v=>v.toFixed(6)).join(', ')}]`);
  const eq = Math.abs(written[0]-norm[0]) < 1e-6 && Math.abs(written[1]-norm[1]) < 1e-6;
  console.log(`  geschreven == bron-richting     : ${eq ? '🟢 JA (round-trip klopt)' : '🔴 NEE (teken/asvolgorde fout)'}`);
} else {
  console.log('  (geen TrueNorth in bron-context)');
}

// ── Concern B — site->building containment ──
console.log('\n# CONCERN B — site->building containment');
const ll = (v) => { const a = Array.isArray(v) ? v : (Array.isArray(v?.value) ? v.value : null); return a ? a.map(x=>Number(x?.value??x)) : null; };
const fmt = (a) => a ? `[${a.join(',')}]` : 'null';
const siteCode = api.GetTypeCodeFromName('IFCSITE');
const bldCode = api.GetTypeCodeFromName('IFCBUILDING');
const bldIds = new Set(); { const v = api.GetLineIDsWithType(id, bldCode); for (let i=0;i<v.size();i++) bldIds.add(v.get(i)); }
const siteLL = new Map(); { const v = api.GetLineIDsWithType(id, siteCode); for (let i=0;i<v.size();i++){ const s=api.GetLine(id,v.get(i),false); const la=ll(s?.RefLatitude),lo=ll(s?.RefLongitude); if(la&&lo) siteLL.set(v.get(i),{la,lo}); } }
console.log(`  IfcBuilding-count: ${bldIds.size} | sites met RefLatLong: ${siteLL.size}`);
const aggV = api.GetLineIDsWithType(id, api.GetTypeCodeFromName('IFCRELAGGREGATES'));
const authSites = new Map(); // site -> count of buildings it decomposes to
for (let i = 0; i < aggV.size(); i++) {
  const rel = api.GetLine(id, aggV.get(i), false);
  const ro = rel?.RelatingObject?.value;
  if (!siteLL.has(ro)) continue;
  const related = rel?.RelatedObjects ?? [];
  const nB = related.filter(r => bldIds.has(r?.value)).length;
  if (nB) authSites.set(ro, (authSites.get(ro) ?? 0) + nB);
}
console.log(`  sites die naar IfcBuilding decomponeren: ${authSites.size}`);
for (const [sid, n] of authSites) console.log(`   site #${sid} -> ${n} building(s)  RefLatLong=${fmt(siteLL.get(sid)?.la)}/${fmt(siteLL.get(sid)?.lo)}`);
// meerderheid over alle sites
const counts = new Map();
for (const {la,lo} of siteLL.values()) { const k = fmt(la)+'/'+fmt(lo); counts.set(k,(counts.get(k)??0)+1); }
console.log('  meerderheid over alle sites:');
for (const [k,n] of [...counts].sort((a,b)=>b[1]-a[1])) console.log(`   ${n}x ${k}`);
api.CloseModel(id);
process.exit(0);
