// WEGWERP SPIKE (read-only diagnose) — waarom levert de parse geen wallLengthDir/wallInsideThickDir?
// Repliceert getBBox (ifc.js:415-461) + dir-derivatie (ifc.js:1399-1410) OFFLINE met web-ifc (node),
// dumpt de ruwe flatTransformation + IfcAxis2Placement3D per wand-categorie.
// Run:  node spike/diagnose/wall-dirs.mjs   (vanuit c:/dev/brickboard)
import { IfcAPI, IFCWALLSTANDARDCASE } from 'web-ifc';
import { readFileSync } from 'node:fs';

const IFC_PATH = new URL('../../public/BIL-MOO-A-ZZ-PBP.ifc', import.meta.url);

// ---- verbatim uit ifc.js:757 (deriveWallAxes) ----
function deriveWallAxes(dx, dy, dz, heightAxis) {
  if (heightAxis === 'z_neg') heightAxis = 'z';
  if (heightAxis === 'y') {
    const lengthAxis = dx >= dz ? 'x' : 'z'; const thicknessAxis = dx >= dz ? 'z' : 'x';
    return { heightAxis, lengthAxis, thicknessAxis, length: Math.round(Math.max(dx, dz) * 1000), height: Math.round(dy * 1000), thickness: Math.round(Math.min(dx, dz) * 1000) };
  }
  const lengthAxis = dx >= dy ? 'x' : 'y'; const thicknessAxis = dx >= dy ? 'y' : 'x';
  return { heightAxis: 'z', lengthAxis, thicknessAxis, length: Math.round(Math.max(dx, dy) * 1000), height: Math.round(dz * 1000), thickness: Math.round(Math.min(dx, dy) * 1000) };
}

// ---- verbatim uit ifc.js:415-461 (getBBox) — incl. localXDir/localYDir ----
function getBBox(api, modelID, expressID) {
  let mesh;
  try { mesh = api.GetFlatMesh(modelID, expressID); } catch { return null; }
  if (!mesh || mesh.geometries.size() === 0) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  let ok = false, localXDir = null, localYDir = null;
  let firstM = null, nGeom = mesh.geometries.size();
  for (let gi = 0; gi < nGeom; gi++) {
    const placed = mesh.geometries.get(gi);
    let geom;
    try {
      geom = api.GetGeometry(modelID, placed.geometryExpressID);
      const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
      const m = placed.flatTransformation;
      if (!localXDir) { localXDir = { x: m[0], y: m[1], z: m[2] }; firstM = Array.from(m); }
      if (!localYDir) { localYDir = { x: m[4], y: m[5], z: m[6] }; }
      for (let vi = 0; vi < verts.length; vi += 6) {
        const lx = verts[vi], ly = verts[vi + 1], lz = verts[vi + 2];
        const wx = m[0] * lx + m[4] * ly + m[8] * lz + m[12];
        const wy = m[1] * lx + m[5] * ly + m[9] * lz + m[13];
        const wz = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
        if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
        if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
        if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz;
        ok = true;
      }
    } finally { geom?.delete?.(); }
  }
  return ok ? { minX, maxX, minY, maxY, minZ, maxZ, localXDir, localYDir, firstM, nGeom } : null;
}

// ---- IfcAxis2Placement3D lezen (Axis = z-dir, RefDirection = x-dir) ----
function readPlacement(api, modelID, wallLine) {
  try {
    const opId = wallLine?.ObjectPlacement?.value;
    if (opId == null) return { note: 'geen ObjectPlacement' };
    const lp = api.GetLine(modelID, opId, false);          // IfcLocalPlacement
    const relId = lp?.RelativePlacement?.value;
    if (relId == null) return { note: 'geen RelativePlacement' };
    const a2p = api.GetLine(modelID, relId, false);        // IfcAxis2Placement3D
    const dir = (ref) => {
      if (ref?.value == null) return null;
      const d = api.GetLine(modelID, ref.value, false);
      return d?.DirectionRatios?.map?.(r => r.value ?? r) ?? null;
    };
    return {
      a2pType: a2p?.constructor?.name ?? a2p?.type ?? '?',
      Axis: dir(a2p?.Axis),
      RefDirection: dir(a2p?.RefDirection),
      hasRelativeTo: lp?.PlacementRelTo?.value != null,
    };
  } catch (e) { return { note: 'placement-lees-fout: ' + e.message }; }
}

function vlen(v) { return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); }

const api = new IfcAPI();
try { await api.Init(); } catch (e) {
  api.SetWasmPath(new URL('../../node_modules/web-ifc/', import.meta.url).pathname.replace(/^\//, ''), true);
  await api.Init();
}
const bytes = new Uint8Array(readFileSync(IFC_PATH));
const modelID = api.OpenModel(bytes);

const ids = api.GetLineIDsWithType(modelID, IFCWALLSTANDARDCASE);
const wallIds = [];
for (let i = 0; i < ids.size(); i++) wallIds.push(ids.get(i));

// filter op de 4 types (zoals de werkwijze) via Name
const NAME_RE = /21\.10_WA_LB_HSB_(272\.5|182\.5)|kopsegevel_257\.5|21\.10_WA_multiplex/;

const rows = [];
for (const wID of wallIds) {
  const line = api.GetLine(modelID, wID, false);
  const name = line?.Name?.value ?? '';
  if (!NAME_RE.test(name)) continue;
  const bb = getBBox(api, modelID, wID);
  if (!bb) continue;
  const dx = bb.maxX - bb.minX, dy = bb.maxY - bb.minY, dz = bb.maxZ - bb.minZ;
  const { thicknessAxis, lengthAxis, heightAxis, length, height } = deriveWallAxes(dx, dy, dz, 'y'); // _upAxis='y' (app: inherit)
  if (length < 100 || height < 100) continue;

  // dir-derivatie verbatim (ifc.js:1399-1410)
  let wallInsideThickDir = 0;
  if (bb.localYDir) { const comp = bb.localYDir[thicknessAxis] ?? 0; if (Math.abs(comp) > 0.5) wallInsideThickDir = comp > 0 ? 1 : -1; }
  let wallLengthDir = null;
  if (bb.localXDir) { const { x, y, z } = bb.localXDir; const L = Math.sqrt(x * x + y * y + z * z); if (L > 0.01) wallLengthDir = { x: x / L, y: y / L, z: z / L }; }

  const zc = Math.round((bb.minZ + bb.maxZ) / 2 * 1000);
  const xc = Math.round((bb.minX + bb.maxX) / 2 * 1000);
  rows.push({ wID, name, zc, xc, thicknessAxis,
    lenXdir: bb.localXDir, lenXlen: +vlen(bb.localXDir).toFixed(4),
    Ydir: bb.localYDir, YthickComp: +(bb.localYDir?.[thicknessAxis] ?? 0).toFixed(4),
    wallLengthDir, wallInsideThickDir, firstM: bb.firstM, nGeom: bb.nGeom });
}

// statistiek
const tot = rows.length;
const lenNull = rows.filter(r => r.wallLengthDir == null).length;
const insZero = rows.filter(r => r.wallInsideThickDir === 0).length;
console.log(`\n=== TOTAAL ${tot} gefilterde WallStandardCase ===`);
console.log(`wallLengthDir == null : ${lenNull}/${tot}`);
console.log(`wallInsideThickDir==0 : ${insZero}/${tot}`);

// per categorie samples (z-center mm)
function sample(label, pred, n = 2) {
  const m = rows.filter(pred);
  console.log(`\n--- ${label} (${m.length} wanden) ---`);
  for (const r of m.slice(0, n)) {
    console.log(`wID=${r.wID} z=${r.zc} x=${r.xc} thAxis=${r.thicknessAxis} nGeom=${r.nGeom}`);
    console.log(`  localXDir=${JSON.stringify(r.lenXdir)} |len|=${r.lenXlen}  -> wallLengthDir=${JSON.stringify(r.wallLengthDir)}`);
    console.log(`  localYDir=${JSON.stringify(r.Ydir)} comp[${r.thicknessAxis}]=${r.YthickComp} -> wallInsideThickDir=${r.wallInsideThickDir}`);
    console.log(`  flatTransformation(col-major) = [${r.firstM?.map(v => +v.toFixed(4)).join(', ')}]`);
    const wl = api.GetLine(modelID, r.wID, false);
    console.log(`  IfcAxis2Placement3D: ${JSON.stringify(readPlacement(api, modelID, wl))}`);
  }
}
sample('UITERSTE zuid-gevel z≈-38149 (correcte dir in app)', r => r.zc < -36000);
sample('kleine-vleugel NOORD-eind z≈-10731', r => r.zc > -12000 && r.zc < -9500 && r.thicknessAxis === 'z');
sample('kleine-vleugel kleine NOORD-wandjes z≈-8850', r => r.zc > -9200 && r.zc < -8500 && r.thicknessAxis === 'z');

api.CloseModel(modelID);
