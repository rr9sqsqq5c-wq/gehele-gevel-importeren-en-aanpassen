// WEGWERP (spike/) — READ-ONLY MEET. Niets in build, niets bedraad.
// Doel: bepaal WAAR web-ifc geometrie landt t.o.v. de WorldCoordinateSystem-origin (#20)
// en wat GetCoordinationMatrix teruggeeft, met EXACT dezelfde instellingen als parseIfc
// (OpenModel(data, {}) → default settings, COORDINATE_TO_ORIGIN=false).
//
// Beantwoordt:
//   Q1  flatTransformation = placement-boom; bevat die de context-WCS (#20) of niet?
//   Q2  Zonder COORDINATE_TO_ORIGIN: hoe groot zijn de wereld-coords die wij opslaan/renderen?
//   Q3  GetCoordinationMatrix → identity of #20-gebaseerd?

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
// Model-pad als CLI-arg (absoluut of relatief aan de repo-root); default BIL-MOO.
const ARG = process.argv[2];
const MODEL = ARG
  ? (ARG.match(/^[A-Za-z]:|^[\\/]/) ? ARG : join(ROOT, ARG))
  : join(ROOT, 'public', 'BIL-MOO-A-ZZ-PBP.ifc');

async function getNodeApi() {
  const WebIFC = require('web-ifc');
  const api = new WebIFC.IfcAPI();
  try { await api.Init(); }
  catch { api.SetWasmPath(join(ROOT, 'node_modules', 'web-ifc') + '/', true); await api.Init(); }
  return { WebIFC, api };
}

function flatTransOf(api, modelID, eid) {
  let mesh; try { mesh = api.GetFlatMesh(modelID, eid); } catch { return null; }
  if (!mesh || mesh.geometries.size() === 0) return null;
  return Array.from(mesh.geometries.get(0).flatTransformation);
}

function worldAABB(api, modelID, eid) {
  let mesh; try { mesh = api.GetFlatMesh(modelID, eid); } catch { return null; }
  if (!mesh || mesh.geometries.size() === 0) return null;
  let mnX=Infinity,mxX=-Infinity,mnY=Infinity,mxY=-Infinity,mnZ=Infinity,mxZ=-Infinity,ok=false;
  for (let gi=0; gi<mesh.geometries.size(); gi++) {
    const placed = mesh.geometries.get(gi); let geom;
    try {
      geom = api.GetGeometry(modelID, placed.geometryExpressID);
      const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
      const m = placed.flatTransformation;
      for (let i=0;i<verts.length;i+=6) {
        const lx=verts[i],ly=verts[i+1],lz=verts[i+2];
        const wx=m[0]*lx+m[4]*ly+m[8]*lz+m[12];
        const wy=m[1]*lx+m[5]*ly+m[9]*lz+m[13];
        const wz=m[2]*lx+m[6]*ly+m[10]*lz+m[14];
        if(wx<mnX)mnX=wx;if(wx>mxX)mxX=wx;if(wy<mnY)mnY=wy;if(wy>mxY)mxY=wy;if(wz<mnZ)mnZ=wz;if(wz>mxZ)mxZ=wz;ok=true;
      }
    } finally { geom?.delete(); }
  }
  return ok ? { mnX,mxX,mnY,mxY,mnZ,mxZ } : null;
}

async function run() {
  const { WebIFC, api } = await getNodeApi();
  console.log('[web-ifc node] versie', api.GetVersion ? api.GetVersion() : '(onbekend)');
  const buf = readFileSync(MODEL);
  // EXACT zoals parseIfc (ifc.js:1180): OpenModel(data, {}) → default settings.
  const modelID = api.OpenModel(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), {});

  // Context-WCS (#20) zoals _readAndRegisterIfcContext leest (ifc.js:497-522)
  const ctxVec = api.GetLineIDsWithType(modelID, api.GetTypeCodeFromName('IFCGEOMETRICREPRESENTATIONCONTEXT'));
  let wcs = null;
  for (let i=0;i<ctxVec.size();i++) {
    const ctx = api.GetLine(modelID, ctxVec.get(i), false);
    const ctxType = ctx?.ContextType?.value ?? ctx?.ContextType;
    if (typeof ctxType === 'string' && ctxType !== 'Model') continue;
    const wcsRef = ctx?.WorldCoordinateSystem?.value;
    if (wcsRef != null) {
      const w = api.GetLine(modelID, wcsRef, false);
      const pt = api.GetLine(modelID, w?.Location?.value, false);
      const c = pt?.Coordinates;
      wcs = { x:Number(c[0]?.value??c[0]), y:Number(c[1]?.value??c[1]), z:Number(c[2]?.value??c[2]) };
    }
    break;
  }
  console.log('\n[Q-context] WorldCoordinateSystem.Location (#20), in mm:', wcs);

  // GetCoordinationMatrix met default settings
  let coord = null; try { coord = Array.from(api.GetCoordinationMatrix(modelID)); } catch(e){ coord = 'fout: '+e.message; }
  console.log('[Q3] GetCoordinationMatrix (default settings):', coord);
  if (Array.isArray(coord)) console.log('     → translatie m12-14:', coord.slice(12,15));

  // Eerste paar wanden: flatTransformation-translatie + wereld-AABB (in METERS, web-ifc intern)
  const wallIDs = [];
  for (const tn of ['IFCWALLSTANDARDCASE','IFCWALL']) {
    const v = api.GetLineIDsWithType(modelID, WebIFC[tn]); for (let i=0;i<v.size();i++) wallIDs.push(v.get(i));
  }
  console.log(`\n[wanden] ${wallIDs.length} IFCWALL(STANDARDCASE) totaal; eerste 5 met geldige mesh:`);
  let shown=0;
  for (const wID of wallIDs) {
    const m = flatTransOf(api, modelID, wID);
    const bb = worldAABB(api, modelID, wID);
    if (!m || !bb) continue;
    console.log(`  wID=${wID}`);
    console.log(`    flatTransformation translatie m12-14 (m): [${m[12].toFixed(3)}, ${m[13].toFixed(3)}, ${m[14].toFixed(3)}]`);
    console.log(`    wereld-AABB (m): X ${bb.mnX.toFixed(2)}..${bb.mxX.toFixed(2)} | Y ${bb.mnY.toFixed(2)}..${bb.mxY.toFixed(2)} | Z ${bb.mnZ.toFixed(2)}..${bb.mxZ.toFixed(2)}`);
    if (++shown >= 5) break;
  }

  // Samenvattende vergelijking: orde van de wereld-coords vs WCS-origin
  console.log('\n=== INTERPRETATIE ===');
  if (wcs) {
    console.log(`  WCS-origin (#20):  X≈${(wcs.x/1000).toFixed(0)} m  Y≈${(wcs.y/1000).toFixed(0)} m  (mm: ${wcs.x.toFixed(0)}, ${wcs.y.toFixed(0)})`);
  }
  const sample = worldAABB(api, modelID, wallIDs.find(id => worldAABB(api, modelID, id)));
  let geomMag = null;
  if (sample) {
    geomMag = Math.max(Math.abs(sample.mnX),Math.abs(sample.mxX),Math.abs(sample.mnY),Math.abs(sample.mxY));
    console.log(`  geometrie ligt op orde: ~${geomMag.toFixed(0)} m van (0,0,0)`);
  }
  const wcsMag = wcs ? Math.hypot(wcs.x, wcs.y, wcs.z) / 1000 : 0; // mm→m

  // ── VERDICT (invariant §2 — symmetrie) ──
  console.log('\n=== VERDICT ===');
  console.log(`  bestand: ${MODEL.split(/[\\/]/).pop()}`);
  console.log(`  #20 (context-WCS) magnitude: ~${wcsMag.toFixed(0)} m | geometrie (emittedLocal) magnitude: ~${(geomMag??0).toFixed(0)} m`);
  if (geomMag != null && geomMag > 50000) {
    console.log('  VERDICT: OFFSET IN PLAATSINGS-BOOM  (emittedLocal = RD-orde, #20 ≈ 0)');
  } else if (wcsMag > 50000 && geomMag != null && geomMag < 5000) {
    console.log('  VERDICT: OFFSET IN CONTEXT-WCS (#20)  (emittedLocal ≈ 0, #20 = RD-orde)');
  } else {
    console.log('  VERDICT: GEEN SIGNIFICANTE OFFSET  (emittedLocal ≈ 0 én #20 ≈ 0)');
  }

  api.CloseModel(modelID);
  process.exit(0);
}
run().catch(e => { console.error('FATAL', e); process.exit(1); });
