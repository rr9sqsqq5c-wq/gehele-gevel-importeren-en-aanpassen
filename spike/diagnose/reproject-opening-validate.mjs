// WEGWERP (spike/) — VALIDATE REPROJECT_OPENING_POLYGON.
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WEBIFC_DIR = join(ROOT, 'node_modules', 'web-ifc');
let FLAG = '0';
globalThis.localStorage = { getItem: (k) => (k === 'reprojectOpeningPolygon' ? FLAG : null), setItem(){}, removeItem(){} };
const WebIFC = require('web-ifc');
const realApi = new WebIFC.IfcAPI();
try { await realApi.Init(); } catch { realApi.SetWasmPath(WEBIFC_DIR + '/', true); await realApi.Init(); }
const apiProxy = new Proxy(realApi, { get(t,p){ if(p==='Init') return async()=>{}; const v=t[p]; return typeof v==='function'?v.bind(t):v; } });
class ShimIfcAPI { constructor(){ return apiProxy; } }
globalThis.window = { WebIFC: new Proxy(WebIFC, { get(t,p){ return p==='IfcAPI'?ShimIfcAPI:t[p]; } }) };
const { parseIfc } = await import('../../src/lib/ifc.js');
const { buildBestFitFacadePattern } = await import('../../src/lib/facadePlane.js');
const { buildFullGroupFacadePattern } = await import('../../src/lib/pattern.js');

const buf = readFileSync(join(ROOT, 'public', 'BIL-MOO-A-ZZ-PBP.ifc'));
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const o0 = console.log; console.log = () => {};
const walls = await parseIfc({ name: 'BIL.ifc', size: buf.length, arrayBuffer: async () => ab }, null, null, { forceOrientation: 'AUTO' });
console.log = o0;
const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
const byId = (id) => walls.find((w) => w.expressID === id);

function rowsBestfit(wall, flag) { FLAG = flag; const o = console.log; console.log = () => {}; const fd = buildBestFitFacadePattern([wall], mat, 'halfsteens', null, null, null, null); console.log = o; return fd?.rows ?? []; }
function rowsDirect(wall) { const o = console.log; console.log = () => {}; const fd = buildFullGroupFacadePattern([wall], mat, 'halfsteens', null, null, null, null); console.log = o; return fd?.rows ?? []; }
function bandCover(rows, yLo, yHi, testX) {
  for (const r of rows) { if (r.y < yLo || r.y > yHi) continue;
    const ivs = r.pieces.map((p) => [p.start, p.start + p.length]).sort((a, b) => a[0] - b[0]);
    return { y: Math.round(r.y), covered: ivs.some(([s, e]) => testX >= s - 1 && testX <= e + 1), ivs: ivs.map(([s, e]) => `${Math.round(s)}..${Math.round(e)}`) };
  }
  return null;
}

console.log('# REPROJECT_OPENING_POLYGON — VALIDATE\n');

// (1) L-opening wanden: groene band x~280..1940, onderband y~100..800, test x=1000
console.log('(1) L-opening — onderband-dekking bij x=1000 (groene massieve zone):');
for (const id of [60148, 86484, 127375]) {
  const w = byId(id); if (!w) { console.log(`   #${id} niet gevonden`); continue; }
  const off = bandCover(rowsBestfit(w, '0'), 100, 800, 1000);
  const on  = bandCover(rowsBestfit(w, '1'), 100, 800, 1000);
  const dir = bandCover(rowsDirect(w),       100, 800, 1000);
  console.log(`   #${id}: UIT covered=${off?.covered} ${JSON.stringify(off?.ivs)}`);
  console.log(`          AAN covered=${on?.covered}  ${JSON.stringify(on?.ivs)}`);
  console.log(`          DIRECT covered=${dir?.covered} ${JSON.stringify(dir?.ivs)}`);
  console.log(`          ${off?.covered===false && on?.covered===true && on?.covered===dir?.covered ? '🟢 UIT knipt groen weg; AAN bekleedt het, = direct pad' : '🔴'}`);
}

// (2) byte-identiek UIT: best-fit UIT == baseline (triviaal: zelfde tak). Rechthoek-opening AAN == UIT.
console.log('\n(2) Rechthoekige opening — rows identiek UIT vs AAN (byte-identiek):');
const rectWall = walls.find((w) => (w.openings ?? []).length >= 1 && (w.openings ?? []).every((op) => !op.polyPts || op.polyPts.length === 4) && (w.openings ?? []).some((op) => (op.breedte ?? op.width ?? 0) > 100));
if (rectWall) {
  const a = JSON.stringify(rowsBestfit(rectWall, '0'));
  const b = JSON.stringify(rowsBestfit(rectWall, '1'));
  console.log(`   wand #${rectWall.expressID} (${rectWall.openings.length} rechthoek-opening(en)): ${a === b ? '🟢 identiek UIT==AAN' : '🔴 verschilt'} (len ${a.length})`);
} else { console.log('   (geen pure-rechthoek-opening-wand gevonden)'); }

// (3) degeneraat-guard: 10891 (99964-punts). Met vlag AAN mag de polygoon NIET de clipper in.
console.log('\n(3) Degeneraat-guard (expressID 10891, 99964-punts sparing):');
const wd = byId(10891);
if (wd) {
  const nPts = Math.max(0, ...(wd.openings ?? []).map((op) => op.polyPts?.length ?? 0));
  const t0 = Date.now(); const o = console.warn; let warned = false; console.warn = (...m) => { if (String(m).includes('bbox-fallback')) warned = true; };
  rowsBestfit(wd, '1'); const dt = Date.now() - t0; console.warn = o;
  console.log(`   raw max polyPts=${nPts}; build-tijd vlag-AAN ${dt} ms; guard-log=${warned}  ${nPts > 64 && warned && dt < 4000 ? '🟢 guard grijpt, geen perf-ramp' : (nPts <= 64 ? '🟠 geen mega-polygoon op deze wand' : '🔴')}`);
} else { console.log('   #10891 niet gevonden'); }
process.exit(0);
