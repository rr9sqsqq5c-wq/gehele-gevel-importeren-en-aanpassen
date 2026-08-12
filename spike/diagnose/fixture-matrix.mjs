// WEGWERP (spike/) — READ-ONLY. Fixture-matrix: draait de ECHTE parseIfc (via Init-proxy +
// File-shim) per bronbestand en leest _upAxis / per-wand heightAxis / trueNorth / #20, plus
// rauwe web-ifc-reads voor schema (IFC4 vs 2x3) en georef-entiteit (IfcMapConversion/
// IfcProjectedCRS). Niets bedraad, niet committen.
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const WEBIFC_DIR = join(ROOT, 'node_modules', 'web-ifc');

// ── flag/localStorage shim: alle vlaggen op default (geometryDerivedOrigin=false etc.) ──
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

// ── web-ifc in Node + Init-proxy zodat getApi() in ifc.js werkt ──
const WebIFC = require('web-ifc');
const realApi = new WebIFC.IfcAPI();
try { await realApi.Init(); } catch { realApi.SetWasmPath(WEBIFC_DIR + '/', true); await realApi.Init(); }
const apiProxy = new Proxy(realApi, {
  get(t, p) { if (p === 'Init') return async () => {}; const v = t[p]; return typeof v === 'function' ? v.bind(t) : v; },
});
class ShimIfcAPI { constructor() { return apiProxy; } }
globalThis.window = { WebIFC: new Proxy(WebIFC, { get(t, p) { return p === 'IfcAPI' ? ShimIfcAPI : t[p]; } }) };

const PC = await import('../../src/lib/projectCoordinates.js');
const { parseIfc } = await import('../../src/lib/ifc.js');

const MODELS = [
  ['BIL-MOO (primair)',     join(ROOT, 'public', 'BIL-MOO-A-ZZ-PBP.ifc')],
  ['dakranden-submodel',    join(ROOT, 'public', 'BIL-VIA-L-ZZ-PBP_dakranden.IFC (1).ifc')],
  ['BOOM-MOO (synth Tekla)', join(__dirname, 'BOOM-MOO.ifc')],
];

function fileShim(path) {
  const buf = readFileSync(path);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return { name: path.split(/[\\/]/).pop(), size: buf.length, arrayBuffer: async () => ab, _buf: buf };
}

function readSchema(buf) {
  const head = buf.subarray(0, 4096).toString('latin1');
  const m = head.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i);
  return m ? m[1] : '(onbekend)';
}

function rawGeoref(buf) {
  const id = realApi.OpenModel(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), {});
  const out = { mapConv: 0, projCRS: 0, site: 0, refLatLong: false };
  const cnt = (name) => { try { const c = realApi.GetTypeCodeFromName(name); if (!c && c !== 0) return 0; const v = realApi.GetLineIDsWithType(id, c); return v ? v.size() : 0; } catch { return 0; } };
  out.mapConv = cnt('IFCMAPCONVERSION');
  out.projCRS = cnt('IFCPROJECTEDCRS');
  out.site = cnt('IFCSITE');
  try {
    const sc = realApi.GetTypeCodeFromName('IFCSITE'); const v = realApi.GetLineIDsWithType(id, sc);
    for (let i = 0; i < (v?.size() ?? 0); i++) { const s = realApi.GetLine(id, v.get(i), false); if (s?.RefLatitude && s?.RefLongitude) { out.refLatLong = true; break; } }
  } catch {}
  realApi.CloseModel(id);
  return out;
}

console.log('# FIXTURE-MATRIX\n');
const rows = [];
for (const [label, path] of MODELS) {
  console.log(`\n──────── ${label} ────────`);
  let f;
  try { f = fileShim(path); } catch (e) { console.log('  ⚠ kan bestand niet lezen:', e.message); continue; }
  const schema = readSchema(f._buf);
  const geo = rawGeoref(f._buf);

  PC.reset();
  let walls = [];
  try { walls = await parseIfc(f, null, null, { forceOrientation: 'AUTO' }); }
  catch (e) { console.log('  ⚠ parseIfc faalde:', e.message); }

  const pi = PC.getProjectInfo();
  const haCount = { x: 0, y: 0, z: 0, z_neg: 0 };
  for (const w of walls) { const ha = w?.wallOrigin?.heightAxis; if (ha in haCount) haCount[ha]++; }
  const domHA = Object.keys(haCount).filter(k => k !== 'z_neg').sort((a, b) => haCount[b] - haCount[a])[0];
  // export-logica repliceren (ifc.js:1879-1881), per-wand i.p.v. per-groep:
  const exDom = haCount.y >= haCount.z && haCount.y >= haCount.x ? 'y' : haCount.x >= haCount.z ? 'x' : 'z';
  const o = pi.origin || { x: 0, y: 0, z: 0 };
  const offsetKm = Math.hypot(o.x || 0, o.y || 0, o.z || 0) / 1e6;

  console.log(`  schema            : ${schema}`);
  console.log(`  #wanden geparset  : ${walls.length}`);
  console.log(`  globale _upAxis    : ${pi.upAxis}`);
  console.log(`  per-wand heightAxis: ${JSON.stringify(haCount)} → dominant '${domHA}'`);
  console.log(`  export-dominantHA : '${exDom}'  ${exDom === pi.upAxis ? '🟢 == _upAxis' : '🟠 != _upAxis'}`);
  console.log(`  trueNorth (deg)   : ${(pi.trueNorthDegrees ?? 0).toFixed(4)}  ${Math.abs(pi.trueNorthDegrees ?? 0) > 0.001 ? '🟠 ≠0' : '🟢 ~0'}`);
  console.log(`  #20 origin (mm)   : (${(o.x||0).toFixed(0)}, ${(o.y||0).toFixed(0)}, ${(o.z||0).toFixed(0)}) → ${offsetKm.toFixed(1)} km`);
  console.log(`  georef-entiteit   : IfcMapConversion=${geo.mapConv} IfcProjectedCRS=${geo.projCRS} IfcSite=${geo.site} RefLat/Long=${geo.refLatLong}`);
  rows.push({ label, schema, up: pi.upAxis, domHA, exDom, tn: pi.trueNorthDegrees ?? 0, offsetKm, geo, nWalls: walls.length });
}

console.log('\n\n# SAMENVATTING');
console.log('model | schema | _upAxis | domHA | exportHA | trueNorth | #20 | georef');
for (const r of rows) {
  console.log(`${r.label} | ${r.schema} | ${r.up} | ${r.domHA}(${r.nWalls}w) | ${r.exDom} | ${r.tn.toFixed(3)}° | ${r.offsetKm.toFixed(1)}km | MapConv=${r.geo.mapConv} ProjCRS=${r.geo.projCRS} RefLL=${r.geo.refLatLong}`);
}
process.exit(0);
