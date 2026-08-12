// WEGWERP (spike/) — regressie-waakhond voor Stap 1 (render-origin loskoppelen).
// Draait IDENTIEK vóór en ná de edits:
//   - PRE-edit  : leg baseline vast (flag-off matrices + schema + emitted-AABB + flag-off
//                 wereld-afstand = de bug ~485 km).  --write-baseline
//   - POST-edit : vergelijk flag-off met baseline (moet byte-identiek), en meet flag-AAN
//                 centrering (<paar honderd m).        (geen flag → compare)
//
// Importeert de ECHTE projectCoordinates.js (alleen 'three' + featureFlags als dep, beide
// node-veilig). Vlag wordt headless gezet via een localStorage-stub.
//
// Gebruik:
//   node spike/diagnose/coord-origin-regression.mjs --write-baseline
//   node spike/diagnose/coord-origin-regression.mjs            (vergelijk met baseline)

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import * as THREE from '../../node_modules/three/build/three.module.js';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT = join(__dirname, 'out');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
const BASELINE = join(OUT, 'coord-origin-baseline.json');

const MODELS = [
  join(ROOT, 'public', 'BIL-MOO-A-ZZ-PBP.ifc'),
  join(ROOT, 'public', 'BIL-VIA-L-ZZ-PBP_dakranden.IFC (1).ifc'),
];

// ── flag-stub (readFlag leest localStorage bij elke aanroep) ──
let _flagOn = false;
globalThis.localStorage = {
  getItem: (k) => (_flagOn && k === 'geometryDerivedOrigin') ? '1' : null,
  setItem() {}, removeItem() {},
};

const PC = await import('../../src/lib/projectCoordinates.js');
const hasSetter = typeof PC.setGeometryDerivedRenderOrigin === 'function';

const r = (x, n = 9) => Math.round(x * 10 ** n) / 10 ** n;
const mat = () => Array.from(PC.buildProjectMatrix().elements).map((v) => r(v));

// ── deel A: matrix-regressie (model-onafhankelijk) ──
function dumpMatrices() {
  const ORIGIN = { x: 111185325.12550394, y: 471934574.99281204, z: 0 }; // #20-achtig
  const TN = [0.61864839283756479, 0.78566797442653735];
  const out = [];
  for (const upAxis of ['z', 'y', 'z_neg']) {
    PC.reset();
    PC.registerIfcContext({ origin: ORIGIN, trueNorth: TN, upAxis }, 'regressie');
    out.push({ scenario: `flagOff_${upAxis}`, flagOn: _flagOn, elements: mat() });
  }
  return out;
}

function dumpSchema() {
  PC.reset();
  PC.registerIfcContext({ origin: { x: 111185325, y: 471934575, z: 0 }, trueNorth: [0.6, 0.8], upAxis: 'y' }, 'schema');
  return PC.getProjectInfo();
}

// ── deel B: echte modellen via web-ifc ──
async function getNodeApi() {
  const WebIFC = require('web-ifc');
  const api = new WebIFC.IfcAPI();
  try { await api.Init(); }
  catch { api.SetWasmPath(join(ROOT, 'node_modules', 'web-ifc') + '/', true); await api.Init(); }
  return { WebIFC, api };
}

function readContext(api, modelID) {
  const ctxVec = api.GetLineIDsWithType(modelID, api.GetTypeCodeFromName('IFCGEOMETRICREPRESENTATIONCONTEXT'));
  let origin = { x: 0, y: 0, z: 0 }, trueNorth = null;
  for (let i = 0; i < ctxVec.size(); i++) {
    const ctx = api.GetLine(modelID, ctxVec.get(i), false);
    const ctxType = ctx?.ContextType?.value ?? ctx?.ContextType;
    if (typeof ctxType === 'string' && ctxType !== 'Model') continue;
    const wcsRef = ctx?.WorldCoordinateSystem?.value;
    if (wcsRef != null) {
      const w = api.GetLine(modelID, wcsRef, false);
      const pt = api.GetLine(modelID, w?.Location?.value, false);
      const c = pt?.Coordinates;
      if (Array.isArray(c)) origin = { x: Number(c[0]?.value ?? c[0] ?? 0), y: Number(c[1]?.value ?? c[1] ?? 0), z: Number(c[2]?.value ?? c[2] ?? 0) };
    }
    const tnRef = ctx?.TrueNorth?.value;
    if (tnRef != null) { const tn = api.GetLine(modelID, tnRef, false); const d = tn?.DirectionRatios; if (Array.isArray(d) && d.length >= 2) trueNorth = [Number(d[0]?.value ?? d[0]), Number(d[1]?.value ?? d[1])]; }
    break;
  }
  return { origin, trueNorth };
}

function wallAABB(api, modelID, eid) {
  let mesh; try { mesh = api.GetFlatMesh(modelID, eid); } catch { return null; }
  if (!mesh || mesh.geometries.size() === 0) return null;
  let mnX=Infinity,mxX=-Infinity,mnY=Infinity,mxY=-Infinity,mnZ=Infinity,mxZ=-Infinity,ok=false;
  for (let gi=0; gi<mesh.geometries.size(); gi++) {
    const placed = mesh.geometries.get(gi); let geom;
    try {
      geom = api.GetGeometry(modelID, placed.geometryExpressID);
      const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
      const m = placed.flatTransformation;
      for (let i=0;i<verts.length;i+=6){const lx=verts[i],ly=verts[i+1],lz=verts[i+2];
        const wx=m[0]*lx+m[4]*ly+m[8]*lz+m[12],wy=m[1]*lx+m[5]*ly+m[9]*lz+m[13],wz=m[2]*lx+m[6]*ly+m[10]*lz+m[14];
        if(wx<mnX)mnX=wx;if(wx>mxX)mxX=wx;if(wy<mnY)mnY=wy;if(wy>mxY)mxY=wy;if(wz<mnZ)mnZ=wz;if(wz>mxZ)mxZ=wz;ok=true;}
    } finally { geom?.delete(); }
  }
  return ok ? { mnX,mxX,mnY,mxY,mnZ,mxZ } : null;
}

function emittedAABB(api, WebIFC, modelID) {
  const G = { mnX:Infinity,mxX:-Infinity,mnY:Infinity,mxY:-Infinity,mnZ:Infinity,mxZ:-Infinity };
  let n = 0;
  for (const tn of ['IFCWALLSTANDARDCASE','IFCWALL']) {
    const v = api.GetLineIDsWithType(modelID, WebIFC[tn]);
    for (let i=0;i<v.size();i++){const bb=wallAABB(api,modelID,v.get(i));if(!bb)continue;
      const dx=bb.mxX-bb.mnX,dy=bb.mxY-bb.mnY,dz=bb.mxZ-bb.mnZ;
      if(Math.max(dx,dy,dz)*1000<100)continue; // ~length/height filter
      G.mnX=Math.min(G.mnX,bb.mnX);G.mxX=Math.max(G.mxX,bb.mxX);
      G.mnY=Math.min(G.mnY,bb.mnY);G.mxY=Math.max(G.mxY,bb.mxY);
      G.mnZ=Math.min(G.mnZ,bb.mnZ);G.mxZ=Math.max(G.mxZ,bb.mxZ);n++;}
  }
  return n ? { ...G, n } : null;
}

// pas projectMatrix toe op de 8 hoeken van de emitted-AABB (three-units = m), geef AABB+maxdist
function worldExtent(emit) {
  const M = PC.buildProjectMatrix();
  const cs = [[emit.mnX,emit.mnY,emit.mnZ],[emit.mxX,emit.mxY,emit.mxZ],[emit.mnX,emit.mxY,emit.mnZ],[emit.mxX,emit.mnY,emit.mxZ],
    [emit.mnX,emit.mnY,emit.mxZ],[emit.mxX,emit.mxY,emit.mnZ],[emit.mnX,emit.mxY,emit.mxZ],[emit.mxX,emit.mnY,emit.mnZ]];
  let mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity],maxd=0;
  for (const c of cs){const v=new THREE.Vector3(c[0],c[1],c[2]).applyMatrix4(M);
    mn=[Math.min(mn[0],v.x),Math.min(mn[1],v.y),Math.min(mn[2],v.z)];
    mx=[Math.max(mx[0],v.x),Math.max(mx[1],v.y),Math.max(mx[2],v.z)];
    maxd=Math.max(maxd,Math.hypot(v.x,v.y,v.z));}
  return { worldAABB_m: { mn: mn.map((x)=>r(x,3)), mx: mx.map((x)=>r(x,3)) }, maxDistFromOrigin_m: r(maxd,3) };
}

async function dumpModels() {
  const { WebIFC, api } = await getNodeApi();
  const out = [];
  for (const file of MODELS) {
    if (!existsSync(file)) { out.push({ file, missing: true }); continue; }
    const buf = readFileSync(file);
    const modelID = api.OpenModel(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), {});
    const { origin, trueNorth } = readContext(api, modelID);
    const emit = emittedAABB(api, WebIFC, modelID);
    const rec = { file: file.split(/[\\/]/).pop(), contextWCS_mm: { x: r(origin.x,3), y: r(origin.y,3), z: r(origin.z,3) },
      emittedAABB_m: emit ? { mn:[r(emit.mnX,3),r(emit.mnY,3),r(emit.mnZ,3)], mx:[r(emit.mxX,3),r(emit.mxY,3),r(emit.mxZ,3)], n: emit.n } : null,
      flagOff: {}, flagOn: {} };
    if (emit) {
      const centerMm = { x: Math.round((emit.mnX+emit.mxX)/2*1000), y: Math.round((emit.mnY+emit.mxY)/2*1000), z: Math.round((emit.mnZ+emit.mxZ)/2*1000) };
      rec.renderOrigin_mm = centerMm;
      for (const upAxis of ['z','y','z_neg']) {
        // FLAG OFF
        _flagOn = false; PC.reset();
        PC.registerIfcContext({ origin, trueNorth, upAxis }, file);
        rec.flagOff[upAxis] = worldExtent(emit);
        // FLAG ON (alleen post-edit, met setter)
        if (hasSetter) {
          _flagOn = true; PC.reset();
          PC.registerIfcContext({ origin, trueNorth, upAxis }, file);
          PC.setGeometryDerivedRenderOrigin(centerMm, { contextWCS: origin, upAxis });
          rec.flagOn[upAxis] = worldExtent(emit);
          _flagOn = false;
        }
      }
    }
    api.CloseModel(modelID);
    out.push(rec);
  }
  return out;
}

// ── deel C: v2-toggle-consistentie (Stap 1-addendum) ──
// Een v2-project (renderOrigin gezet) MOET identiek renderen met de vlag aan én uit.
// Render-tijd honoreert _renderOrigin altijd; de vlag staat alleen bij het parsen.
function v2ToggleCheck() {
  const renderOrigin = { x: 18348, y: 4434, z: -18277 }; // ~AABB-center BIL-MOO (mm)
  const v2 = { hasOrigin: true, originSource: 'v2.ifc', origin: { x: 111185325, y: 471934575, z: 0 },
    trueNorthDegrees: 38.22, hasTrueNorth: true, upAxis: 'y',
    schemaVersion: 2, renderOrigin, worldAnchor: { contextWCS: { x: 111185325, y: 471934575, z: 0 }, upAxis: 'y' } };
  _flagOn = false; PC.reset(); PC.restoreProjectInfo(v2); const off = mat();
  _flagOn = true;  PC.reset(); PC.restoreProjectInfo(v2); const on = mat();
  _flagOn = false; PC.reset(); PC.restoreProjectInfo(v2);
  // center (=renderOrigin) door de matrix → moet ~0 zijn (geen 485 km), bij vlag-UIT
  const M = PC.buildProjectMatrix();
  const c = new THREE.Vector3(renderOrigin.x / 1000, renderOrigin.y / 1000, renderOrigin.z / 1000).applyMatrix4(M);
  return { identical: JSON.stringify(off) === JSON.stringify(on), centerDist_m_flagOff: r(Math.hypot(c.x, c.y, c.z), 6) };
}

// ── run ──
const dump = {
  hasSetter,
  matrices: dumpMatrices(),
  schemaFlagOff: (() => { _flagOn = false; return dumpSchema(); })(),
  schemaFlagOn: hasSetter ? (() => { _flagOn = true; const s = dumpSchema(); _flagOn = false; return s; })() : null,
  v2Toggle: hasSetter ? v2ToggleCheck() : null,
  models: await dumpModels(),
};

const writeBaseline = process.argv.includes('--write-baseline');
if (writeBaseline) {
  writeFileSync(BASELINE, JSON.stringify({ matrices: dump.matrices, schemaFlagOff: dump.schemaFlagOff, models: dump.models.map((m) => ({ file: m.file, contextWCS_mm: m.contextWCS_mm, emittedAABB_m: m.emittedAABB_m, flagOff: m.flagOff })) }, null, 2));
  console.log('✔ baseline geschreven:', BASELINE);
  console.log(JSON.stringify(dump, null, 2));
} else if (existsSync(BASELINE)) {
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const mOk = eq(base.matrices, dump.matrices);
  const sOk = eq(base.schemaFlagOff, dump.schemaFlagOff);
  const modOff = dump.models.map((m) => ({ file: m.file, contextWCS_mm: m.contextWCS_mm, emittedAABB_m: m.emittedAABB_m, flagOff: m.flagOff }));
  const modOk = eq(base.models, modOff);
  console.log('=== REGRESSIE: flag-off vs baseline ===');
  console.log(`  ${mOk?'🟢':'🔴'} matrices (alle up-assen) ${mOk?'byte-identiek':'AFWIJKING!'}`);
  console.log(`  ${sOk?'🟢':'🔴'} getProjectInfo-schema flag-off ${sOk?'byte-identiek':'AFWIJKING!'}`);
  console.log(`  ${modOk?'🟢':'🔴'} model flag-off wereld-extents ${modOk?'byte-identiek':'AFWIJKING!'}`);
  if (!mOk) console.log('  baseline.matrices vs nu:\n', JSON.stringify(base.matrices), '\n', JSON.stringify(dump.matrices));
  if (!sOk) console.log('  baseline.schema vs nu:\n', JSON.stringify(base.schemaFlagOff), '\n', JSON.stringify(dump.schemaFlagOff));
  if (dump.v2Toggle) {
    const v = dump.v2Toggle;
    console.log('\n=== v2-TOGGLE-CONSISTENTIE (Stap 1-addendum) ===');
    console.log(`  ${v.identical?'🟢':'🔴'} v2-project rendert IDENTIEK met vlag aan én uit: ${v.identical}`);
    console.log(`  ${v.centerDist_m_flagOff<1?'🟢':'🔴'} v2 + vlag-UIT: model-center op ${v.centerDist_m_flagOff} m van (0,0,0) (geen 485 km-terugval)`);
  }

  console.log('\n=== FLAG-AAN succescriterium (wereld-AABB < paar honderd m) ===');
  for (const m of dump.models) {
    if (m.missing) { console.log(`  ${m.file}: ONTBREEKT`); continue; }
    if (!m.emittedAABB_m) { console.log(`  ${m.file}: geen wanden (renderOrigin niet afleidbaar; flag-on valt terug op #20)`); continue; }
    const off = Math.max(...Object.values(m.flagOff).map((x)=>x.maxDistFromOrigin_m));
    const on = m.flagOn && Object.keys(m.flagOn).length ? Math.max(...Object.values(m.flagOn).map((x)=>x.maxDistFromOrigin_m)) : null;
    const ok = on != null && on < 500;
    console.log(`  ${m.file} (n=${m.emittedAABB_m.n} wanden):`);
    console.log(`     flag-OFF maxDist van (0,0,0): ${(off/1000).toFixed(1)} km  ← de bug`);
    console.log(`     flag-ON  maxDist van (0,0,0): ${on==null?'(setter ontbreekt — pre-edit)':on.toFixed(1)+' m  '+(ok?'🟢 <500m':'🔴')}`);
  }
} else {
  console.log('Geen baseline. Eerst: node spike/diagnose/coord-origin-regression.mjs --write-baseline');
}
process.exit(0);
