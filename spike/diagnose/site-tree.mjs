// WEGWERP (spike/) — READ-ONLY (Concern 2 richting). Welke IfcSite hangt in de spatiale boom
// (IfcProject -> IfcRelAggregates -> IfcSite), en wat is diens RefLatLong vs de losse template-sites?
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

const ll = (v) => Array.isArray(v?.value) ? v.value : (Array.isArray(v) ? v : null);
const fmt = (a) => a ? `[${a.join(',')}]` : 'null';

// 1) alle sites met RefLatLong
const sc = api.GetTypeCodeFromName('IFCSITE');
const sv = api.GetLineIDsWithType(id, sc);
const sitesWithLL = [];
for (let i = 0; i < sv.size(); i++) {
  const s = api.GetLine(id, sv.get(i), false);
  const la = ll(s?.RefLatitude), lo = ll(s?.RefLongitude);
  if (la && lo) sitesWithLL.push({ eid: sv.get(i), la, lo });
}
console.log(`# IfcSite-totaal: ${sv.size()} | met RefLatLong: ${sitesWithLL.length}`);
const uniq = [...new Set(sitesWithLL.map(s => fmt(s.la) + ' / ' + fmt(s.lo)))];
console.log('  unieke RefLatLong-waarden:'); uniq.forEach(u => console.log('   ', u));

// 2) sites die in de spatiale boom hangen (IfcProject -> aggregates -> site)
const projV = api.GetLineIDsWithType(id, api.GetTypeCodeFromName('IFCPROJECT'));
const aggCode = api.GetTypeCodeFromName('IFCRELAGGREGATES');
const aggV = api.GetLineIDsWithType(id, aggCode);
const projIds = new Set(); for (let i=0;i<projV.size();i++) projIds.add(projV.get(i));
const treeSites = new Set();
for (let i = 0; i < aggV.size(); i++) {
  const rel = api.GetLine(id, aggV.get(i), false);
  const ro = rel?.RelatingObject?.value;
  if (!projIds.has(ro)) continue;
  const related = rel?.RelatedObjects ?? [];
  for (const r of related) {
    const rid = r?.value; if (rid == null) continue;
    const line = api.GetLine(id, rid, false);
    if (line?.type === sc || /SITE/i.test(line?.constructor?.name ?? '')) treeSites.add(rid);
  }
}
console.log(`\n# Sites in de boom (IfcProject -> aggregates): ${[...treeSites].join(', ') || '(geen)'}`);
for (const sid of treeSites) {
  const s = api.GetLine(id, sid, false);
  console.log(`  IfcSite #${sid}: RefLat=${fmt(ll(s?.RefLatitude))} RefLong=${fmt(ll(s?.RefLongitude))}  Name=${s?.Name?.value ?? s?.Name}`);
}

// 3) wat geeft "eerste site met beide" (huidige _readSiteRefLatLong-volgorde)?
const first = sitesWithLL[0];
console.log(`\n# "eerste site met beide" (huidige logica) = #${first?.eid}: ${fmt(first?.la)} / ${fmt(first?.lo)}`);
console.log('  → 52,x/4,x = Amsterdam (echt) ; 42,x/-71,x = Boston (Revit-template)');
api.CloseModel(id);
process.exit(0);
