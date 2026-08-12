// READ-ONLY SPIKE — reconcilieer de best-fit-diagnose met "breedte als hoogte".
// Wegwerpwerk. Niets in src/ gewijzigd. Verbatim kopieën van:
//   - getBBox            (src/lib/ifc.js:414-461)
//   - deriveWallAxes     (src/lib/ifc.js:692-712)
//   - detectModelUpAxis  (src/lib/ifc.js:543-690)   [confidence-consts inlined]
//   - reconstructAABB    (src/lib/facadePlane.js:38-45) + extOf + thinVote (63-65)
// Gebruik: node spike/validate/dakrand-reconcile.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// web-ifc node-build uit brickboard zelf
const BB = resolve(__dirname, '../../');
const W = createRequire(pathToFileURL(BB + '/package.json'))(resolve(BB, 'node_modules/web-ifc/web-ifc-api-node.js'));
const IFC = W;
const F = 'C:/Users/MurkAnneKooistraKooi/Downloads/BIL-VIA-L-ZZ-PBP_dakranden.IFC.ifc';

const api = new W.IfcAPI();
await api.Init();
const mid = api.OpenModel(new Uint8Array(readFileSync(F)), {});

// ───────────────────────── VERBATIM getBBox (ifc.js:414) ─────────────────────────
function getBBox(api, modelID, expressID) {
  let mesh;
  try { mesh = api.GetFlatMesh(modelID, expressID); } catch { return null; }
  if (!mesh || mesh.geometries.size() === 0) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  let ok = false, localXDir = null, localYDir = null;
  for (let gi = 0; gi < mesh.geometries.size(); gi++) {
    const placed = mesh.geometries.get(gi);
    let geom;
    try {
      geom = api.GetGeometry(modelID, placed.geometryExpressID);
      const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
      const m = placed.flatTransformation;
      if (!localXDir) localXDir = { x: m[0], y: m[1], z: m[2] };
      if (!localYDir) localYDir = { x: m[4], y: m[5], z: m[6] };
      for (let vi = 0; vi < verts.length; vi += 6) {
        const lx = verts[vi], ly = verts[vi + 1], lz = verts[vi + 2];
        const wx = m[0] * lx + m[4] * ly + m[8]  * lz + m[12];
        const wy = m[1] * lx + m[5] * ly + m[9]  * lz + m[13];
        const wz = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
        if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
        if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
        if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz;
        ok = true;
      }
    } finally { geom?.delete(); }
  }
  return ok ? { minX, maxX, minY, maxY, minZ, maxZ, localXDir, localYDir } : null;
}

// Aparte, lichte lezer voor de PLAATSING-rotatie (alleen voor de spike-dump; raakt
// getBBox niet). Geeft de eerste flatTransformation-matrix (kolom-major 4x4) terug.
function getFirstTransform(api, modelID, expressID) {
  let mesh;
  try { mesh = api.GetFlatMesh(modelID, expressID); } catch { return null; }
  if (!mesh || mesh.geometries.size() === 0) return null;
  const placed = mesh.geometries.get(0);
  return Array.from(placed.flatTransformation);
}
// Is de rotatie axis-aligned (permutatie/teken) of écht gedraaid? Inspecteer de
// 3 rotatiekolommen: elke kolom moet ~±1 op één as zijn, rest ~0.
function rotationInfo(m) {
  if (!m) return { rotated: null, note: 'geen mesh' };
  const cols = [[m[0], m[1], m[2]], [m[4], m[5], m[6]], [m[8], m[9], m[10]]];
  const EPS = 1e-3;
  let maxOff = 0;
  const mapping = [];
  for (const c of cols) {
    const abs = c.map(Math.abs);
    const k = abs[0] >= abs[1] && abs[0] >= abs[2] ? 0 : abs[1] >= abs[2] ? 1 : 2;
    const off = Math.sqrt(abs.reduce((s, v, i) => i === k ? s : s + v * v, 0));
    maxOff = Math.max(maxOff, off);
    mapping.push(('xyz'[k]) + (c[k] < 0 ? '-' : '+'));
  }
  return { rotated: maxOff > EPS, maxOffAxis: +maxOff.toFixed(4), colMap: mapping.join(','), };
}

// ─────────────────── VERBATIM deriveWallAxes (ifc.js:692) ───────────────────
function deriveWallAxes(dx, dy, dz, heightAxis) {
  if (heightAxis === 'z_neg') heightAxis = 'z';
  if (heightAxis === 'y') {
    const lengthAxis    = dx >= dz ? 'x' : 'z';
    const thicknessAxis = dx >= dz ? 'z' : 'x';
    return { heightAxis, lengthAxis, thicknessAxis,
      length: Math.round(Math.max(dx, dz) * 1000), height: Math.round(dy * 1000), thickness: Math.round(Math.min(dx, dz) * 1000) };
  }
  const lengthAxis    = dx >= dy ? 'x' : 'y';
  const thicknessAxis = dx >= dy ? 'y' : 'x';
  return { heightAxis: 'z', lengthAxis, thicknessAxis,
    length: Math.round(Math.max(dx, dy) * 1000), height: Math.round(dz * 1000), thickness: Math.round(Math.min(dx, dy) * 1000) };
}

// ─────────────── VERBATIM detectModelUpAxis (ifc.js:543) ───────────────
const _UPAXIS_CONFIDENCE_HIGH = 0.75;
const _UPAXIS_CONFIDENCE_LOW  = 0.55;
function detectModelUpAxis(api, modelID, wallTypes, { forceOrientation = 'AUTO', sampleSize = 30 } = {}) {
  if (forceOrientation === 'X_NEG90') return { axis: 'z', reason: 'forceOrientation=X_NEG90', forceOrientation };
  if (forceOrientation === 'NONE')    return { axis: 'y', reason: 'forceOrientation=NONE', forceOrientation };
  if (forceOrientation === 'X_POS90') return { axis: 'z_neg', reason: 'forceOrientation=X_POS90', forceOrientation };
  const _STORY_MIN = 1.2, _STORY_MAX = 6.5, _BUCKET = 0.05;
  const _extentOf = (eid) => {
    let mesh; try { mesh = api.GetFlatMesh(modelID, eid); } catch { return null; }
    if (!mesh || mesh.geometries.size() === 0) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity, ok = false;
    for (let gi = 0; gi < mesh.geometries.size(); gi++) {
      const placed = mesh.geometries.get(gi); let geom;
      try {
        geom = api.GetGeometry(modelID, placed.geometryExpressID);
        const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
        const m = placed.flatTransformation;
        for (let i = 0; i < verts.length; i += 6) {
          const lx = verts[i] ?? 0, ly = verts[i + 1] ?? 0, lz = verts[i + 2] ?? 0;
          const wx = m[0] * lx + m[4] * ly + m[8]  * lz + m[12];
          const wy = m[1] * lx + m[5] * ly + m[9]  * lz + m[13];
          const wz = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
          if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
          if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
          if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz; ok = true;
        }
      } finally { geom?.delete(); }
    }
    return ok ? { dx: maxX - minX, dy: maxY - minY, dz: maxZ - minZ } : null;
  };
  const allWallIds = [];
  for (const wType of wallTypes) { const v = api.GetLineIDsWithType(modelID, wType); for (let i = 0; i < v.size(); i++) allWallIds.push(v.get(i)); }
  if (allWallIds.length === 0) return { axis: 'z', source: 'geen-wanden', confidence: 0, confidenceLabel: 'LAAG', reason: 'geen wanden → fallback z', sampleCount: 0, forceOrientation };
  const _MAX_SCAN = 4000;
  const stride = Math.max(1, Math.floor(allWallIds.length / _MAX_SCAN));
  const bucketsY = new Map(), bucketsZ = new Map();
  let sumY = 0, sumZ = 0, scanned = 0;
  for (let idx = 0; idx < allWallIds.length; idx += stride) {
    const e = _extentOf(allWallIds[idx]); if (!e) continue; scanned++;
    sumY += e.dy; sumZ += e.dz;
    if (e.dy >= _STORY_MIN && e.dy <= _STORY_MAX) { const k = Math.round(e.dy / _BUCKET); bucketsY.set(k, (bucketsY.get(k) || 0) + 1); }
    if (e.dz >= _STORY_MIN && e.dz <= _STORY_MAX) { const k = Math.round(e.dz / _BUCKET); bucketsZ.set(k, (bucketsZ.get(k) || 0) + 1); }
  }
  const _modal = (mp) => { let count = 0, value = 0; for (const [k, c] of mp) if (c > count) { count = c; value = k * _BUCKET; } return { count, value: Math.round(value * 1000) }; };
  const sharedY = _modal(bucketsY), sharedZ = _modal(bucketsZ);
  let doorVote = null;
  { const vote = { x: 0, y: 0, z: 0 };
    for (const tn of ['IFCWINDOW', 'IFCDOOR']) {
      let code; try { code = api.GetTypeCodeFromName(tn); } catch { continue; }
      let vec; try { vec = api.GetLineIDsWithType(modelID, code); } catch { continue; }
      for (let i = 0; i < vec.size(); i++) { const e = _extentOf(vec.get(i)); if (!e) continue; const mx = Math.max(e.dx, e.dy, e.dz); if (mx === e.dx) vote.x++; else if (mx === e.dy) vote.y++; else vote.z++; }
    }
    if (vote.y > 0 || vote.z > 0) doorVote = vote.y >= vote.z ? 'y' : 'z';
  }
  const yC = sharedY.count, zC = sharedZ.count;
  const maxC = Math.max(yC, zC), minC = Math.min(yC, zC);
  const sharedWinner = yC >= zC ? 'y' : 'z';
  const clearShared = maxC >= 3 && (minC === 0 || maxC >= 3 * minC);
  let detectedAxis, source, confidence, reason;
  if (doorVote && !(clearShared && doorVote !== sharedWinner)) { detectedAxis = doorVote; source = 'ramen/deuren-langeas'; confidence = (clearShared && doorVote === sharedWinner) ? 0.95 : 0.8; reason = `ramen/deuren-langeas → ${doorVote}`; }
  else if (clearShared && doorVote && doorVote !== sharedWinner) { detectedAxis = sharedWinner; source = 'gedeelde-hoogte(>deur-conflict)'; confidence = 0.6; reason = `wanden ${sharedWinner} wint van deuren ${doorVote}`; }
  else if (clearShared) { detectedAxis = sharedWinner; source = 'gedeelde-verdiepingshoogte'; confidence = 0.85; reason = `modale wandhoogte langs ${sharedWinner} (${maxC} vs ${minC})`; }
  else { detectedAxis = 'z'; source = 'ambigu→default-z(IFC-conventie)'; confidence = 0.4; reason = `geen ramen/deuren en geen duidelijke modus (y=${yC}, z=${zC}); val terug op z`; }
  const confidenceLabel = confidence >= _UPAXIS_CONFIDENCE_HIGH ? 'HOOG' : confidence >= _UPAXIS_CONFIDENCE_LOW ? 'MATIG' : 'LAAG';
  return { axis: detectedAxis, source, confidence: +confidence.toFixed(3), confidenceLabel, reason, sharedY, sharedZ, doorVote, sumY: Math.round(sumY), sumZ: Math.round(sumZ), sampleCount: scanned, forceOrientation };
}

// ─────────── VERBATIM reconstructAABB + extOf + thinVote (facadePlane.js:38-65) ───────────
function reconstructAABB(wo) {
  const A = {};
  const put = (axis, lo, hi) => { A['min' + axis.toUpperCase()] = Math.min(lo, hi); A['max' + axis.toUpperCase()] = Math.max(lo, hi); };
  put(wo.lengthAxis, wo.lengthStart, wo.lengthEnd ?? wo.lengthStart);
  put(wo.heightAxis, wo.heightStart, wo.heightEnd ?? wo.heightStart);
  put(wo.thicknessAxis, wo.thicknessStart, wo.thicknessEnd ?? (wo.thicknessStart + 200));
  return A;
}
const UP_AX = ['x', 'y', 'z'];
const extOf = (A, ax) => A['max' + ax.toUpperCase()] - A['min' + ax.toUpperCase()];
// thinVote per lid = de DUNSTE wereld-as (facadePlane.js:64)
function thinAxisOf(A) { const e = { x: extOf(A, 'x'), y: extOf(A, 'y'), z: extOf(A, 'z') }; return UP_AX.reduce((a, b) => e[a] <= e[b] ? a : b); }

// ───────────────────────── DRIVER ─────────────────────────
const nameOf = (eid) => { try { return api.GetLine(mid, eid, false)?.Name?.value ?? ''; } catch { return ''; } };
const TYPE_NAMES = ['IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCPLATE', 'IFCSLAB', 'IFCMEMBER', 'IFCCOVERING', 'IFCBUILDINGELEMENTPROXY'];

// up-as zoals de APP hem zou kiezen
const upRes = detectModelUpAxis(api, mid, [IFC.IFCWALLSTANDARDCASE, IFC.IFCWALL]);
const appUp = upRes.axis === 'z_neg' ? 'z' : upRes.axis;

// verzamel alle kandidaat-elementen
const rows = [];
let gMinX = Infinity, gMaxX = -Infinity, gMinY = Infinity, gMaxY = -Infinity, gMinZ = Infinity, gMaxZ = -Infinity;
for (const tn of TYPE_NAMES) {
  let code; try { code = api.GetTypeCodeFromName(tn); } catch { continue; }
  let vec; try { vec = api.GetLineIDsWithType(mid, code); } catch { continue; }
  for (let i = 0; i < vec.size(); i++) {
    const eid = vec.get(i);
    const bb = getBBox(api, mid, eid);
    if (!bb) continue;
    const dx = bb.maxX - bb.minX, dy = bb.maxY - bb.minY, dz = bb.maxZ - bb.minZ;
    gMinX = Math.min(gMinX, bb.minX); gMaxX = Math.max(gMaxX, bb.maxX);
    gMinY = Math.min(gMinY, bb.minY); gMaxY = Math.max(gMaxY, bb.maxY);
    gMinZ = Math.min(gMinZ, bb.minZ); gMaxZ = Math.max(gMaxZ, bb.maxZ);
    const rot = rotationInfo(getFirstTransform(api, mid, eid));
    const dwa = deriveWallAxes(dx, dy, dz, appUp);
    // wallOrigin zoals de parser hem zou opslaan (wereld-min/max per afgeleide as)
    const axisMin = { x: bb.minX, y: bb.minY, z: bb.minZ }, axisMax = { x: bb.maxX, y: bb.maxY, z: bb.maxZ };
    const wo = {
      lengthAxis: dwa.lengthAxis, heightAxis: dwa.heightAxis, thicknessAxis: dwa.thicknessAxis,
      lengthStart: axisMin[dwa.lengthAxis], lengthEnd: axisMax[dwa.lengthAxis],
      heightStart: axisMin[dwa.heightAxis], heightEnd: axisMax[dwa.heightAxis],
      thicknessStart: axisMin[dwa.thicknessAxis], thicknessEnd: axisMax[dwa.thicknessAxis],
    };
    const thin = thinAxisOf(reconstructAABB(wo));
    rows.push({
      eid, type: tn, name: nameOf(eid),
      dx: Math.round(dx * 1000), dy: Math.round(dy * 1000), dz: Math.round(dz * 1000),
      rotated: rot.rotated, colMap: rot.colMap, maxOff: rot.maxOffAxis,
      lengthAxis: dwa.lengthAxis, heightAxis: dwa.heightAxis, thicknessAxis: dwa.thicknessAxis,
      length: dwa.length, height: dwa.height, thickness: dwa.thickness,
      thinVote: thin, heightIsZ: dwa.heightAxis === 'z', votesUp: thin === appUp,
    });
  }
}

// overall-extent up (contrast met detectModelUpAxis)
const spanX = gMaxX - gMinX, spanY = gMaxY - gMinY, spanZ = gMaxZ - gMinZ;
const extentUp = (spanX <= spanY && spanX <= spanZ) ? 'x' : (spanY <= spanZ ? 'y' : 'z');

// ── reconciliatie-oordeel per element ──
// (A) plat plaat-element: dz klein t.o.v. horizontale extents → stem-op-z is correct.
// (B) "breedte/diepte als hoogte": de afgeleide `height` (= dz, want appUp=z hardcode
//     in deriveWallAxes) is in werkelijkheid een HORIZONTALE maat omdat het model
//     niet z-up is (extentUp != z) of het element gedraaid staat.
// Reconcileer tegen de ECHTE verticaal (extentUp), niet tegen de (mogelijk foute) appUp.
// realHeight = extent langs de echte up-as; derivedHeight = wat deriveWallAxes 'height'
// noemt (in de z-tak ALTIJD dz). thinAxis = de as waarin het element het dunst is (= normaal).
const dByAxis = (r, ax) => ax === 'x' ? r.dx : ax === 'y' ? r.dy : r.dz;
for (const r of rows) {
  const realHeight = dByAxis(r, extentUp);          // echte verticale maat
  const derivedHeight = r.height;                    // deriveWallAxes-uitkomst (=dz bij z-up)
  const horizExtents = ['x','y','z'].filter(a => a !== extentUp).map(a => dByAxis(r, a));
  const isFlatSlab = r.thinVote === extentUp;        // dun in de ECHTE up → horizontale plaat
  const heightMisassigned = Math.abs(derivedHeight - realHeight) > 50; // >5cm verschil
  let verdict;
  if (appUp !== extentUp && heightMisassigned)
    verdict = 'B (breedte/diepte-als-hoogte: up-as fout z≠y → height mis-afgeleid)';
  else if (isFlatSlab)
    verdict = 'A (echte platte plaat: dun in de up-as)';
  else if (appUp !== extentUp)
    verdict = 'B? (up-as fout, maar height toevallig ~gelijk)';
  else
    verdict = 'A? (overig)';
  r.realHeight = Math.round(realHeight);
  r.heightMisassigned = heightMisassigned;
  r.verdict = verdict;
}

// ── DUMP ──
console.log('\n=== MODEL up-as ===');
console.log('detectModelUpAxis (app):', JSON.stringify(upRes));
console.log(`overall-extent up (mm): X=${Math.round(spanX*1000)} Y=${Math.round(spanY*1000)} Z=${Math.round(spanZ*1000)} → extentUp=${extentUp}`);
console.log(`appUp gebruikt in deriveWallAxes = '${appUp}'`);

console.log(`\n=== ${rows.length} kandidaat-elementen ===`);
const z = rows.filter(r => r.thinVote === 'z');
console.log(`thinVote-verdeling: x=${rows.filter(r=>r.thinVote==='x').length} y=${rows.filter(r=>r.thinVote==='y').length} z=${z.length}`);
console.log(`stemt-op-up-as (thinVote===appUp '${appUp}'): ${rows.filter(r=>r.votesUp).length}/${rows.length}`);

console.log('\nverdict-telling:', JSON.stringify(rows.reduce((m, r) => { m[r.verdict] = (m[r.verdict]||0)+1; return m; }, {}), null, 0));
console.log(`height MIS-afgeleid (derivedHeight≠realHeight >5cm): ${rows.filter(r=>r.heightMisassigned).length}/${rows.length}`);

const hdr = ['eid','dx','dy','dz','thin','derivH(=dz)','realH(=d'+extentUp+')','verdict'];
console.log('\n' + hdr.join('\t'));
for (const r of rows.slice(0, 40)) {
  console.log([r.eid, r.dx, r.dy, r.dz, r.thinVote, r.height, r.realHeight, r.verdict].join('\t'));
}
if (rows.length > 40) console.log(`… (${rows.length - 40} meer; zie out/dakrand-reconcile.json)`);

// JSON-dump
const out = { file: F, upRes, appUp, extentUp, spanMm: { x: Math.round(spanX*1000), y: Math.round(spanY*1000), z: Math.round(spanZ*1000) },
  count: rows.length, thinVote: { x: rows.filter(r=>r.thinVote==='x').length, y: rows.filter(r=>r.thinVote==='y').length, z: z.length },
  verdictTally: rows.reduce((m, r) => { m[r.verdict] = (m[r.verdict]||0)+1; return m; }, {}), rows };
const { writeFileSync, mkdirSync } = await import('node:fs');
mkdirSync(resolve(__dirname, 'out'), { recursive: true });
writeFileSync(resolve(__dirname, 'out/dakrand-reconcile.json'), JSON.stringify(out, null, 2));
console.log('\nJSON → spike/validate/out/dakrand-reconcile.json');
api.CloseModel(mid);
