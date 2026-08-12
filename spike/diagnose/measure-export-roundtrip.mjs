// WEGWERP (spike/) — Stap 2 export-round-trip. Roept de ECHTE exportGroupsToIfc aan met een
// synthetische groep (één wand uit het model, één strip), her-importeert de geschreven IFC met
// web-ifc en meet (a) co-locatie strip↔wand in emittedLocal, (b) de her-bedde context-WCS,
// (c) de georef-fout = exported_WCS − origineel #20. Vergelijkt worldAnchor AAN vs AFWEZIG.
//   node spike/diagnose/measure-export-roundtrip.mjs [--write-baseline]

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT = join(__dirname, 'out'); if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
const BASE = join(OUT, 'export-noanchor-baseline.ifc');

const MODELS = {
  'BIL-MOO (Revit-shared)': join(ROOT, 'public', 'BIL-MOO-A-ZZ-PBP.ifc'),
  'BOOM-MOO (boom/Tekla)': join(__dirname, 'BOOM-MOO.ifc'),
};

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const PC = await import('../../src/lib/projectCoordinates.js');
const { exportGroupsToIfc } = await import('../../src/lib/ifc.js');

async function getApi() { const W = require('web-ifc'); const a = new W.IfcAPI(); try { await a.Init(); } catch { a.SetWasmPath(join(ROOT, 'node_modules', 'web-ifc') + '/', true); await a.Init(); } return { W, a }; }
const { W, a: api } = await getApi();

function wallAABBmm(a, id, eid) { let m; try { m = a.GetFlatMesh(id, eid); } catch { return null; } if (!m || m.geometries.size() === 0) return null;
  let M = { mnX: 1/0, mxX: -1/0, mnY: 1/0, mxY: -1/0, mnZ: 1/0, mxZ: -1/0 }, ok = false;
  for (let g = 0; g < m.geometries.size(); g++) { const p = m.geometries.get(g); let geo; try { geo = a.GetGeometry(id, p.geometryExpressID); const v = a.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize()); const t = p.flatTransformation;
    for (let i = 0; i < v.length; i += 6) { const x = v[i], y = v[i+1], z = v[i+2]; const wx = t[0]*x+t[4]*y+t[8]*z+t[12], wy = t[1]*x+t[5]*y+t[9]*z+t[13], wz = t[2]*x+t[6]*y+t[10]*z+t[14];
      if (wx<M.mnX)M.mnX=wx; if (wx>M.mxX)M.mxX=wx; if (wy<M.mnY)M.mnY=wy; if (wy>M.mxY)M.mxY=wy; if (wz<M.mnZ)M.mnZ=wz; if (wz>M.mxZ)M.mxZ=wz; ok = true; } } finally { geo?.delete(); } }
  if (!ok) return null;
  const s = 1000; return { minX: M.mnX*s, maxX: M.mxX*s, minY: M.mnY*s, maxY: M.mxY*s, minZ: M.mnZ*s, maxZ: M.mxZ*s };
}
function readWCS(a, id) { const cv = a.GetLineIDsWithType(id, a.GetTypeCodeFromName('IFCGEOMETRICREPRESENTATIONCONTEXT'));
  for (let i = 0; i < cv.size(); i++) { const c = a.GetLine(id, cv.get(i), false); const ct = c?.ContextType?.value ?? c?.ContextType; if (typeof ct === 'string' && ct !== 'Model') continue;
    const w = a.GetLine(id, c?.WorldCoordinateSystem?.value, false); const pt = a.GetLine(id, w?.Location?.value, false); const k = pt?.Coordinates;
    if (Array.isArray(k)) return { x: +(k[0]?.value ?? k[0]), y: +(k[1]?.value ?? k[1]), z: +(k[2]?.value ?? k[2]) }; }
  return { x: 0, y: 0, z: 0 };
}

// minimal wallOrigin (mm) uit één echte wand
function buildWall(model) {
  const buf = readFileSync(model); const id = api.OpenModel(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), {});
  const wcs = readWCS(api, id);
  let bb = null; for (const tn of ['IFCWALLSTANDARDCASE','IFCWALL']) { const v = api.GetLineIDsWithType(id, W[tn]); for (let i = 0; i < v.size() && !bb; i++) { const b = wallAABBmm(api, id, v.get(i)); if (b && (b.maxX-b.minX)>100 && (b.maxZ-b.minZ)>100) bb = b; } if (bb) break; }
  api.CloseModel(id);
  if (!bb) return null;
  const dx = bb.maxX-bb.minX, dz = bb.maxZ-bb.minZ;
  const heightAxis = 'y'; const lengthAxis = dx >= dz ? 'x' : 'z'; const thicknessAxis = dx >= dz ? 'z' : 'x';
  const S = (ax, lo) => ({x: lo?bb.minX:bb.maxX, y: lo?bb.minY:bb.maxY, z: lo?bb.minZ:bb.maxZ}[ax]);
  const wo = { lengthAxis, heightAxis, thicknessAxis,
    lengthStart: S(lengthAxis,1), lengthEnd: S(lengthAxis,0),
    heightStart: S(heightAxis,1), heightEnd: S(heightAxis,0),
    thicknessStart: S(thicknessAxis,1), thicknessEnd: S(thicknessAxis,0),
    resolvedOutside: { outsidePos: S(thicknessAxis,0), outsideDir: 1, source: 'rt', confidence: 1 } };
  return { wo, wcs };
}

function makeGroup(wo) { return { id: 'g', name: 'RT', wallsWithRows: [{ wall: { name: 'W', wallOrigin: wo }, rows: [{ y: 500, pieces: [{ start: 0, length: 200, label: 's' }] }] }] }; }
// dezelfde toWorld als ifc.js:2041 (depth = latDikte28 + panel8 + brickD20/2 = 46; outsidePos+1*46)
function intendedStrip(wo) { const depth = 28 + 8 + 20/2; const p = {x:0,y:0,z:0};
  p[wo.lengthAxis] = wo.lengthStart + 100; p[wo.thicknessAxis] = wo.resolvedOutside.outsidePos + depth; p[wo.heightAxis] = wo.heightStart + 500; return p; }

function reimportStrip(content) { const u8 = new TextEncoder().encode(content); const id = api.OpenModel(u8, {});
  const wcs = readWCS(api, id);
  let trans = null; const v = api.GetLineIDsWithType(id, W.IFCBUILDINGELEMENTPROXY);
  for (let i = 0; i < v.size() && !trans; i++) { let m; try { m = api.GetFlatMesh(id, v.get(i)); } catch { continue; } if (!m || m.geometries.size() === 0) continue; const t = m.geometries.get(0).flatTransformation; trans = { x: t[12]*1000, y: t[13]*1000, z: t[14]*1000 }; }
  api.CloseModel(id); return { wcs, trans };
}
const stripTs = (s) => s.replace(/FILE_NAME\([^\n]*\);/, 'FILE_NAME(<stripped>);');
const dist = (a, b) => Math.hypot((a.x-b.x), (a.y-b.y), (a.z-b.z));

const writeBaseline = process.argv.includes('--write-baseline');
let baselineContent = null;

for (const [label, model] of Object.entries(MODELS)) {
  if (!existsSync(model)) { console.log(`\n### ${label}: ONTBREEKT (${model})`); continue; }
  const built = buildWall(model); if (!built) { console.log(`\n### ${label}: geen wand`); continue; }
  const { wo, wcs } = built; const group = makeGroup(wo); const intended = intendedStrip(wo);

  // OLD: worldAnchor AFWEZIG
  PC.reset();
  const contentOld = exportGroupsToIfc([group], { g: {} }, 'rt', null);
  // NEW: worldAnchor AANWEZIG (contextWCS = #20 zoals gelezen)
  PC.reset(); PC.setGeometryDerivedRenderOrigin({ x: 0, y: 0, z: 0 }, { contextWCS: wcs, upAxis: wo.heightAxis });
  const contentNew = exportGroupsToIfc([group], { g: {} }, 'rt', null);

  if (label.startsWith('BIL-MOO')) baselineContent = contentOld;

  const ro = reimportStrip(contentOld), rn = reimportStrip(contentNew);
  console.log(`\n### ${label}`);
  console.log(`  origineel #20 (mm): (${wcs.x.toFixed(0)}, ${wcs.y.toFixed(0)}, ${wcs.z.toFixed(0)})`);
  console.log(`  strip co-locatie (re-import flatTrans vs intended emittedLocal): OLD ${dist(ro.trans, intended).toFixed(3)} mm | NEW ${dist(rn.trans, intended).toFixed(3)} mm`);
  const errOld = dist(ro.wcs, wcs), errNew = dist(rn.wcs, wcs);
  console.log(`  context-WCS geschreven: OLD (${ro.wcs.x.toFixed(0)},${ro.wcs.y.toFixed(0)}) | NEW (${rn.wcs.x.toFixed(0)},${rn.wcs.y.toFixed(0)})`);
  console.log(`  GEOREF-FOUT (exported_WCS − #20): OLD ${(errOld/1000).toFixed(1)} km ${errOld>1e5?'🔴 (de bug)':'🟢'} | NEW ${errNew.toFixed(3)} mm ${errNew<1?'🟢':'🔴'}`);
}

if (writeBaseline && baselineContent != null) { writeFileSync(BASE, stripTs(baselineContent)); console.log(`\n✔ no-anchor baseline geschreven: ${BASE}`); }
else if (existsSync(BASE) && baselineContent != null) {
  const same = stripTs(baselineContent) === readFileSync(BASE, 'utf8');
  console.log(`\n=== BYTE-IDENTIEK (worldAnchor AFWEZIG vs pre-WCS-edit baseline, FILE_NAME-ts uitgesloten) ===`);
  console.log(`  ${same ? '🟢' : '🔴'} no-anchor export ${same ? 'byte-identiek' : 'AFWIJKING!'}`);
}
process.exit(0);
