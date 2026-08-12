// WEGWERP-HARNESS (spike/) — MEET-taak, niet bedraden, niets in build.
// UITBREIDING: output-correctheid van de buiten/binnen-classificatie op BIL-MOO.
//
//   STAP 0  — exporteerbaarheid (zie ook grep): resolveOutsideDirections IS geexporteerd
//             (ifc.js:353); _classifyWallExterior/_resolveOneWallOutside/_isOutsideBBox/
//             _computeGlobalBBox NIET. => Meting B (echte gecombineerde classifier)
//             headless draaibaar op gereconstrueerde wanden.
//   STAP 0b — bevestig dat de echte parseIfc browser-gebonden is (window).
//   METING A — A1 = getrouwe reimpl van het bbox-exit-predicaat (_classifyWallExterior
//              bbox_exit / _resolveOneWallOutside bbox_exit_cross_product, ifc.js:113-117,
//              201-246). A2 = sterkere AABB-ray-occlusie-oracle. A3 = verschil.
//   METING B — echte resolveOutsideDirections (ifc.js:353) op gereconstrueerde wanden,
//              gevoed met spaceBoundaryType + matLayerSense + openings. Vergelijk met A2.
//   METING C — dekking IfcRelVoidsElement/FillsElement -> openingType (ifc.js:1232-1261):
//              ratio ongetypeerd (sparing) dat isNamedOpening (pattern.js:336) niet knipt.
//
// EERLIJKHEID: A1/A2 zijn AABB-benaderingen (geen mesh). B = echte engine maar gevoed met
// een GETROUWE reconstructie van parseIfc-inputs (deriveWallAxes is niet exporteerbaar en
// hier verbatim gereimpl; expliciet gelabeld). Onmeetbaar => 🟠/🔴, niet faken.

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MODEL = join(ROOT, 'public', 'BIL-MOO-A-ZZ-PBP.ifc');

// ───────── STAP 0b: echte parseIfc headless? ─────────
async function step0_realParse() {
  console.log('=== STAP 0b — echte parseIfc headless proberen ===');
  try {
    const ifc = await import('../src/lib/ifc.js');
    const buf = readFileSync(MODEL);
    await ifc.parseIfc({ name: 'BIL-MOO.ifc', size: buf.length, arrayBuffer: async () => buf.buffer });
    console.log('  🟢 parseIfc liep headless (onverwacht).');
  } catch (e) {
    console.log('  🟠 parseIfc faalt headless. Exacte fout:', e?.message ?? String(e));
  }
}

async function getNodeApi() {
  const WebIFC = require('web-ifc');
  const api = new WebIFC.IfcAPI();
  try { await api.Init(); }
  catch (e1) { api.SetWasmPath(join(ROOT, 'node_modules', 'web-ifc') + '/', true); await api.Init(); }
  return { WebIFC, api };
}

// wereld-AABB + col0 (lengte-as = matrix-kolom0, ifc.js:439-440) in METERS
function worldAABB(api, modelID, eid) {
  let mesh; try { mesh = api.GetFlatMesh(modelID, eid); } catch { return null; }
  if (!mesh || mesh.geometries.size() === 0) return null;
  let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity, mnZ = Infinity, mxZ = -Infinity, ok = false;
  const m0 = mesh.geometries.get(0).flatTransformation;
  const c0 = { x: m0[0], y: m0[1], z: m0[2] };       // localXDir (ifc.js:440)
  const c1 = { x: m0[4], y: m0[5], z: m0[6] };       // localYDir (ifc.js:443)
  for (let gi = 0; gi < mesh.geometries.size(); gi++) {
    const placed = mesh.geometries.get(gi); let geom;
    try {
      geom = api.GetGeometry(modelID, placed.geometryExpressID);
      const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
      const m = placed.flatTransformation;
      for (let i = 0; i < verts.length; i += 6) {
        const lx = verts[i], ly = verts[i + 1], lz = verts[i + 2];
        const wx = m[0]*lx+m[4]*ly+m[8]*lz+m[12];
        const wy = m[1]*lx+m[5]*ly+m[9]*lz+m[13];
        const wz = m[2]*lx+m[6]*ly+m[10]*lz+m[14];
        if (wx<mnX)mnX=wx; if (wx>mxX)mxX=wx; if (wy<mnY)mnY=wy; if (wy>mxY)mxY=wy; if (wz<mnZ)mnZ=wz; if (wz>mxZ)mxZ=wz; ok=true;
      }
    } finally { geom?.delete(); }
  }
  return ok ? { mnX, mxX, mnY, mxY, mnZ, mxZ, c0, c1 } : null;
}

// deriveWallAxes — VERBATIM reimpl van ifc.js:757-781 (niet exporteerbaar)
function deriveWallAxes(dx, dy, dz, heightAxis) {
  if (heightAxis === 'z_neg') heightAxis = 'z';
  if (heightAxis === 'y') {
    const lengthAxis = dx >= dz ? 'x' : 'z';
    const thicknessAxis = dx >= dz ? 'z' : 'x';
    return { heightAxis, lengthAxis, thicknessAxis, length: Math.round(Math.max(dx, dz)*1000), height: Math.round(dy*1000), thickness: Math.round(Math.min(dx, dz)*1000) };
  }
  const lengthAxis = dx >= dy ? 'x' : 'y';
  const thicknessAxis = dx >= dy ? 'y' : 'x';
  return { heightAxis: 'z', lengthAxis, thicknessAxis, length: Math.round(Math.max(dx, dy)*1000), height: Math.round(dz*1000), thickness: Math.round(Math.min(dx, dy)*1000) };
}

// up-as via raam/deur-langeas-stem (signaal 2 van detectModelUpAxis, ifc.js:677-691)
function detectUpAxis(api, WebIFC, modelID) {
  const vote = { x: 0, y: 0, z: 0 };
  for (const tn of ['IFCWINDOW', 'IFCDOOR']) {
    const code = WebIFC[tn] ?? null; if (code == null) continue;
    let vec; try { vec = api.GetLineIDsWithType(modelID, code); } catch { continue; }
    for (let i = 0; i < vec.size(); i++) {
      const bb = worldAABB(api, modelID, vec.get(i)); if (!bb) continue;
      const dx = bb.mxX-bb.mnX, dy = bb.mxY-bb.mnY, dz = bb.mxZ-bb.mnZ;
      const mx = Math.max(dx, dy, dz);
      if (mx === dx) vote.x++; else if (mx === dy) vote.y++; else vote.z++;
    }
  }
  const up = (vote.y > 0 || vote.z > 0) ? (vote.y >= vote.z ? 'y' : 'z') : 'z';
  return { up, vote };
}

// IfcRelSpaceBoundary -> EXTERNAL/INTERNAL per element (ifc.js:1320-1336)
function extractSpaceBoundary(api, WebIFC, modelID) {
  const map = {};
  try {
    const vec = api.GetLineIDsWithType(modelID, WebIFC.IFCRELSPACEBOUNDARY);
    for (let i = 0; i < vec.size(); i++) {
      try {
        const rel = api.GetLine(modelID, vec.get(i), false);
        const elemID = rel?.RelatedBuildingElement?.value; if (!elemID) continue;
        const sense = rel?.InternalOrExternalBoundary?.value ?? null; if (!sense) continue;
        const isExt = sense !== 'INTERNAL' && sense !== 'NOTDEFINED' && sense !== 'UNDEFINED';
        if (!map[elemID] || isExt) map[elemID] = isExt ? 'EXTERNAL' : 'INTERNAL';
      } catch {}
    }
  } catch {}
  return map;
}

// IfcRelAssociatesMaterial -> IfcMaterialLayerSetUsage sense/dir per element (ifc.js:1294-1318)
function extractMatLayer(api, WebIFC, modelID) {
  const map = {};
  try {
    const vec = api.GetLineIDsWithType(modelID, WebIFC.IFCRELASSOCIATESMATERIAL);
    for (let i = 0; i < vec.size(); i++) {
      try {
        const rel = api.GetLine(modelID, vec.get(i), false);
        const matRef = rel?.RelatingMaterial?.value; if (!matRef) continue;
        const raw = api.GetRawLineData ? api.GetRawLineData(modelID, matRef) : null;
        const tName = raw ? api.GetNameFromTypeCode(raw.type).toUpperCase() : '';
        if (!tName.includes('MATERIALLAYERSETUSAGE')) continue;
        const usage = api.GetLine(modelID, matRef, false);
        const directSense = usage?.DirectionSense?.value ?? null;
        const layerSetDir = usage?.LayerSetDirection?.value ?? null;
        const relObj = rel?.RelatedObjects; if (!relObj) continue;
        for (const r of relObj) { const wid = r?.value; if (wid != null) map[wid] = { directSense, layerSetDir }; }
      } catch {}
    }
  } catch {}
  return map;
}

// IfcRelVoidsElement + IfcRelFillsElement -> per wand openings (type + thicknessCenter)
// (ifc.js:1232-1261, 1508-1520). thicknessCenter alleen indien overlap met wanddikte.
function extractOpenings(api, WebIFC, modelID, wallOriginByID) {
  const openingType = {}, fillerID = {};
  try {
    const fv = api.GetLineIDsWithType(modelID, WebIFC.IFCRELFILLSELEMENT);
    for (let i = 0; i < fv.size(); i++) {
      try {
        const rel = api.GetLine(modelID, fv.get(i), false);
        const opID = rel?.RelatingOpeningElement?.value, filID = rel?.RelatedBuildingElement?.value;
        if (!opID || !filID) continue;
        const raw = api.GetRawLineData(modelID, filID);
        const tn = api.GetNameFromTypeCode(raw.type).toLowerCase();
        openingType[opID] = tn.includes('window') ? 'raam' : tn.includes('door') ? 'deur' : 'sparing';
        fillerID[opID] = filID;
      } catch {}
    }
  } catch {}
  const wallVoids = {};
  let totalVoids = 0;
  try {
    const vv = api.GetLineIDsWithType(modelID, WebIFC.IFCRELVOIDSELEMENT);
    for (let i = 0; i < vv.size(); i++) {
      try {
        const rel = api.GetLine(modelID, vv.get(i), false);
        const wID = rel?.RelatingBuildingElement?.value, oID = rel?.RelatedOpeningElement?.value;
        if (!wID || !oID) continue;
        (wallVoids[wID] ??= []).push(oID); totalVoids++;
      } catch {}
    }
  } catch {}
  // bouw openings-array per wand met thicknessCenter
  const openingsByWall = {};
  const typeCount = { raam: 0, deur: 0, sparing: 0, nofill: 0 };
  for (const [wID, ops] of Object.entries(wallVoids)) {
    const wo = wallOriginByID[wID]; const arr = [];
    for (const oID of ops) {
      const t = openingType[oID];
      if (t === 'raam') typeCount.raam++; else if (t === 'deur') typeCount.deur++; else if (t === 'sparing') typeCount.sparing++; else typeCount.nofill++;
      let thicknessCenter = null;
      if (wo) {
        const bbSrc = fillerID[oID] ? worldAABB(api, modelID, fillerID[oID]) : null;
        const bb = bbSrc ?? worldAABB(api, modelID, +oID);
        if (bb) {
          const ax = wo.thicknessAxis;
          const oTMin = (ax==='x'?bb.mnX:ax==='y'?bb.mnY:bb.mnZ)*1000;
          const oTMax = (ax==='x'?bb.mxX:ax==='y'?bb.mxY:bb.mxZ)*1000;
          if (oTMax >= wo.thicknessStart && oTMin <= wo.thicknessEnd) thicknessCenter = Math.round((oTMin+oTMax)/2);
        }
      }
      arr.push({ id: oID, type: t ?? 'sparing', breedte: 1000, thicknessCenter }); // breedte dummy>200 zodat window-bias kan scoren
    }
    openingsByWall[wID] = arr;
  }
  return { openingsByWall, totalVoids, typeCount, fillsCount: Object.keys(fillerID).length };
}

// ───────── geometrie-helpers voor A1/A2 (mm) ─────────
const AXc = (ax, p) => ax === 'x' ? p.x : ax === 'y' ? p.y : p.z;
function crossNormal(ld, heightAxis) { // cross(wallLengthDir, globalUp) (ifc.js:201-208)
  const gu = { x: heightAxis==='x'?1:0, y: heightAxis==='y'?1:0, z: heightAxis==='z'?1:0 };
  const cx = ld.y*gu.z - ld.z*gu.y, cy = ld.z*gu.x - ld.x*gu.z, cz = ld.x*gu.y - ld.y*gu.x;
  const l = Math.hypot(cx, cy, cz); if (l < 0.01) return null;
  return { x: cx/l, y: cy/l, z: cz/l };
}
function isOutsideBBox(pt, bb) { // ifc.js:113-117
  return pt.x<bb.minX||pt.x>bb.maxX||pt.y<bb.minY||pt.y>bb.maxY||pt.z<bb.minZ||pt.z>bb.maxZ;
}
// ray-AABB slab; geef [tEnter,tExit] of null
function raySlab(o, d, bb) {
  let tmin = -Infinity, tmax = Infinity;
  for (const ax of ['x','y','z']) {
    const lo = bb['min'+ax.toUpperCase()], hi = bb['max'+ax.toUpperCase()];
    const oo = o[ax], dd = d[ax];
    if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) return null; }
    else { let t1=(lo-oo)/dd, t2=(hi-oo)/dd; if (t1>t2){const t=t1;t1=t2;t2=t;} tmin=Math.max(tmin,t1); tmax=Math.min(tmax,t2); if (tmin>tmax) return null; }
  }
  return [tmin, tmax];
}

async function run() {
  await step0_realParse();
  const { WebIFC, api } = await getNodeApi();
  console.log('\n[web-ifc node] versie', api.GetVersion ? api.GetVersion() : '');
  const buf = readFileSync(MODEL);
  const modelID = api.OpenModel(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));

  const { up, vote } = detectUpAxis(api, WebIFC, modelID);
  console.log(`\n[up-as] raam/deur-langeas-stem ${JSON.stringify(vote)} => heightAxis='${up}' (deriveWallAxes-tak, ifc.js:759/771)`);

  // verzamel wandIDs
  const wallIDs = [];
  for (const tn of ['IFCWALL','IFCWALLSTANDARDCASE']) {
    const v = api.GetLineIDsWithType(modelID, WebIFC[tn]); for (let i=0;i<v.size();i++) wallIDs.push(v.get(i));
  }
  console.log(`[wanden] ${wallIDs.length} IFCWALL(STANDARDCASE)`);

  // bouw wallOrigin (mm) + mm-AABB + centroid, getrouw aan parseIfc (ifc.js:1387-1431)
  const spaceB = extractSpaceBoundary(api, WebIFC, modelID);
  const matL = extractMatLayer(api, WebIFC, modelID);
  const walls = []; const wallOriginByID = {};
  let skipped = 0, t0 = Date.now();
  for (let k = 0; k < wallIDs.length; k++) {
    const wID = wallIDs[k];
    const bb = worldAABB(api, modelID, wID); if (!bb) { skipped++; continue; }
    const dx = bb.mxX-bb.mnX, dy = bb.mxY-bb.mnY, dz = bb.mxZ-bb.mnZ;
    const { heightAxis, lengthAxis, thicknessAxis, length, height } = deriveWallAxes(dx, dy, dz, up);
    if (length < 100 || height < 100) { skipped++; continue; } // ifc.js:1393
    const mmAABB = { minX:Math.round(bb.mnX*1000),maxX:Math.round(bb.mxX*1000),minY:Math.round(bb.mnY*1000),maxY:Math.round(bb.mxY*1000),minZ:Math.round(bb.mnZ*1000),maxZ:Math.round(bb.mxZ*1000) };
    // wallLengthDir uit col0 (ifc.js:1405-1410), wallInsideThickDir uit col1 (ifc.js:1399-1403)
    const l0 = Math.hypot(bb.c0.x,bb.c0.y,bb.c0.z)||1; const wallLengthDir = { x:bb.c0.x/l0,y:bb.c0.y/l0,z:bb.c0.z/l0 };
    const cyComp = AXc(thicknessAxis, bb.c1); const wallInsideThickDir = Math.abs(cyComp)>0.5 ? (cyComp>0?1:-1) : 0;
    const md = matL[wID] ?? {};
    const wo = {
      lengthStart: mmAABB['min'+lengthAxis.toUpperCase()], lengthEnd: mmAABB['max'+lengthAxis.toUpperCase()],
      heightStart: mmAABB['min'+heightAxis.toUpperCase()], heightEnd: mmAABB['max'+heightAxis.toUpperCase()],
      thicknessStart: mmAABB['min'+thicknessAxis.toUpperCase()], thicknessEnd: mmAABB['max'+thicknessAxis.toUpperCase()],
      lengthAxis, heightAxis, thicknessAxis, wallInsideThickDir, wallLengthDir,
      matLayerSense: md.directSense ?? null, matLayerSetDir: md.layerSetDir ?? null,
      spaceBoundaryType: spaceB[wID] ?? null,
    };
    wallOriginByID[wID] = wo;
    walls.push({ expressID: wID, wallOrigin: wo, mmAABB, openings: [] });
  }
  console.log(`[reconstructie] ${walls.length} wanden >=100mm (overgeslagen ${skipped}) in ${((Date.now()-t0)/1000).toFixed(1)}s`);

  // openings (Meting C input) + voed ze terug op walls voor Meting B window-bias
  const op = extractOpenings(api, WebIFC, modelID, wallOriginByID);
  for (const w of walls) w.openings = op.openingsByWall[w.expressID] ?? [];

  // global bbox (mm) — equivalent _computeGlobalBBox (ifc.js:93-111)
  const G = { minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity };
  for (const w of walls) for (const ax of ['X','Y','Z']) { G['min'+ax]=Math.min(G['min'+ax],w.mmAABB['min'+ax]); G['max'+ax]=Math.max(G['max'+ax],w.mmAABB['max'+ax]); }

  // ───────── METING A ─────────
  const A = []; const D = 5000;
  for (const w of walls) {
    const wo = w.wallOrigin; const ld = wo.wallLengthDir; const n = crossNormal(ld, wo.heightAxis);
    const c = { x:(w.mmAABB.minX+w.mmAABB.maxX)/2, y:(w.mmAABB.minY+w.mmAABB.maxY)/2, z:(w.mmAABB.minZ+w.mmAABB.maxZ)/2 };
    let rec = { id:w.expressID, n, c, a1:null, a2:null };
    if (n) {
      // A1: bbox-exit predicaat (ifc.js:144-161, 219-246)
      const tA = { x:c.x+n.x*D, y:c.y+n.y*D, z:c.z+n.z*D };
      const tB = { x:c.x-n.x*D, y:c.y-n.y*D, z:c.z-n.z*D };
      const aOut = isOutsideBBox(tA, G), bOut = isOutsideBBox(tB, G);
      rec.a1 = { aOut, bOut, exterior: aOut!==bOut || (aOut&&bOut), outsideDir: aOut? AXc(wo.thicknessAxis,n)>=0?1:-1 : bOut? AXc(wo.thicknessAxis,{x:-n.x,y:-n.y,z:-n.z})>=0?1:-1 : null, enclosed: !aOut&&!bOut };
      // A2: AABB-ray-occlusie
      const tExitP = raySlab(c, n, G)?.[1] ?? 0;
      const tExitM = raySlab(c, {x:-n.x,y:-n.y,z:-n.z}, G)?.[1] ?? 0;
      let crossP=0, crossM=0;
      for (const o of walls) {
        if (o.expressID === w.expressID) continue;
        const hp = raySlab(c, n, o.mmAABB); if (hp && hp[1]>=Math.max(hp[0],1) && hp[0] <= tExitP) crossP++;
        const hm = raySlab(c, {x:-n.x,y:-n.y,z:-n.z}, o.mmAABB); if (hm && hm[1]>=Math.max(hm[0],1) && hm[0] <= tExitM) crossM++;
      }
      const extP = crossP===0, extM = crossM===0;
      rec.a2 = { crossP, crossM, exterior: extP||extM, bothOpen: extP&&extM, enclosed: !extP&&!extM,
        outsideDir: (extP&&!extM)? (AXc(wo.thicknessAxis,n)>=0?1:-1) : (extM&&!extP)? (AXc(wo.thicknessAxis,{x:-n.x,y:-n.y,z:-n.z})>=0?1:-1) : (crossP<=crossM? (AXc(wo.thicknessAxis,n)>=0?1:-1):(AXc(wo.thicknessAxis,{x:-n.x,y:-n.y,z:-n.z})>=0?1:-1)) };
    }
    A.push(rec);
  }
  const withN = A.filter(r=>r.n);
  const noN = A.length - withN.length;
  // A3
  let overClad=0, missClad=0, agree=0, a1Enc=0, a2Enc=0, dirMismatch=0;
  for (const r of withN) {
    if (r.a1.enclosed) a1Enc++; if (r.a2.enclosed) a2Enc++;
    const a1Ext = r.a1.exterior && !r.a1.enclosed; const a2Ext = r.a2.exterior;
    if (a1Ext && !a2Ext) overClad++;        // A1=buiten, A2=binnen => over-bekleding
    else if (!a1Ext && a2Ext) missClad++;    // A1=binnen, A2=buiten => ontbrekend
    else { agree++; if (a1Ext && a2Ext && r.a1.outsideDir!=null && r.a2.outsideDir!=null && r.a1.outsideDir!==r.a2.outsideDir) dirMismatch++; }
  }
  const pct = (x)=>((x/withN.length)*100).toFixed(1)+'%';
  console.log('\n=== METING A (A1 bbox-exit vs A2 AABB-ray-occlusie) ===');
  console.log(`  wanden met normaal: ${withN.length} (geen normaal: ${noN})`);
  console.log(`  A1 'beide-binnen/enclosed': ${a1Enc} (${pct(a1Enc)}) | A2 enclosed: ${a2Enc} (${pct(a2Enc)})`);
  console.log(`  A3 verschil:`);
  console.log(`    over-bekleding (A1=buiten, A2=binnen): ${overClad} (${pct(overClad)})`);
  console.log(`    ontbrekend     (A1=binnen, A2=buiten): ${missClad} (${pct(missClad)})`);
  console.log(`    eens: ${agree} (${pct(agree)}); waarvan outsideDir-mismatch: ${dirMismatch}`);

  // ───────── METING B: echte resolveOutsideDirections ─────────
  console.log('\n=== METING B (echte resolveOutsideDirections, ifc.js:353) ===');
  let bByID = {};
  let resolveOutsideDirections;
  try { ({ resolveOutsideDirections } = await import('../src/lib/ifc.js')); }
  catch (e) { console.log('  🔴 import faalde:', e.message); }
  if (resolveOutsideDirections) {
    const clone = walls.map(w => ({ expressID:w.expressID, openings:w.openings, wallOrigin:{ ...w.wallOrigin } }));
    resolveOutsideDirections(clone);
    const srcCount = {}; let ext=0, intr=0, amb=0, dirNull=0;
    const byID = bByID;
    for (const w of clone) {
      const ro = w.wallOrigin.resolvedOutside; const src = ro?.source ?? 'none';
      srcCount[src] = (srcCount[src]??0)+1;
      if (w.wallOrigin.isExterior) ext++; else intr++;
      if (ro?.ambiguous) amb++; if (ro?.outsideDir == null) dirNull++;
      byID[w.expressID] = { isExterior: w.wallOrigin.isExterior, outsideDir: ro?.outsideDir ?? null, confidence: ro?.confidence ?? 0, source: src };
    }
    console.log(`  isExterior: buiten=${ext} binnen=${intr} | ambiguous=${amb} | outsideDir=null(interieur)=${dirNull}`);
    console.log('  resolvedOutside.source-verdeling:', JSON.stringify(srcCount));
    console.log(`  spaceBoundary-dekking: ${Object.values(spaceB).length} elementen met EXTERNAL/INTERNAL; matLayerSense-dekking: ${Object.keys(matL).length}`);
    // vergelijk B.isExterior vs A2.exterior
    let bExtA2Int=0, bIntA2Ext=0, bothExt=0, bothInt=0, dirDiff=0, cmp=0;
    for (const r of withN) {
      const b = byID[r.id]; if (!b) continue; cmp++;
      const a2Ext = r.a2.exterior;
      if (b.isExterior && !a2Ext) bExtA2Int++;
      else if (!b.isExterior && a2Ext) bIntA2Ext++;
      else if (b.isExterior && a2Ext) { bothExt++; if (b.outsideDir!=null && r.a2.outsideDir!=null && b.outsideDir!==r.a2.outsideDir) dirDiff++; }
      else bothInt++;
    }
    console.log(`  B vs A2 (n=${cmp}): beide-buiten=${bothExt} (dir-mismatch ${dirDiff}) | beide-binnen=${bothInt} | B=buiten,A2=binnen=${bExtA2Int} | B=binnen,A2=buiten=${bIntA2Ext}`);
  }

  // ───────── METING C: openingen-typering ─────────
  console.log('\n=== METING C (openingen-typering, ifc.js:1232-1261) ===');
  const tc = op.typeCount; const tot = op.totalVoids;
  const named = tc.raam + tc.deur; const untyped = tc.sparing + tc.nofill;
  console.log(`  IfcRelVoidsElement (voids op wanden): ${tot} | IfcRelFillsElement: ${op.fillsCount}`);
  console.log(`  raam=${tc.raam} deur=${tc.deur} sparing(fill,geen win/deur)=${tc.sparing} geen-fill(=>sparing)=${tc.nofill}`);
  console.log(`  isNamedOpening (geknipt, pattern.js:336): ${named} (${tot?((named/tot)*100).toFixed(1):'0'}%)`);
  console.log(`  ONGETYPEERD/sparing (NIET geknipt): ${untyped} (${tot?((untyped/tot)*100).toFixed(1):'0'}%)`);
  // verfijning: voids op de KEPT-wanden (>=100mm), gesplitst naar engine-exterior vs interior
  let exTot=0, exNamed=0, exUntyped=0, inTot=0, inNamed=0, inUntyped=0, noHost=0;
  const szBucket = { '<300':0, '300-600':0, '600-1200':0, '>1200':0, 'onmeetbaar':0 };
  let winSized=0; // sparing op buiten-wand met beide grootste extents >=600mm
  for (const w of walls) {
    const b = bByID[w.expressID]; const isExt = b ? b.isExterior : null;
    for (const o of (w.openings ?? [])) {
      const isNamed = o.type === 'raam' || o.type === 'deur';
      if (isExt === true) {
        exTot++;
        if (isNamed) exNamed++;
        else {
          exUntyped++;
          // meet sparing-void grootte (2 grootste AABB-extents, mm)
          const bb = worldAABB(api, modelID, +o.id);
          if (!bb) { szBucket['onmeetbaar']++; continue; }
          const dims = [ (bb.mxX-bb.mnX)*1000, (bb.mxY-bb.mnY)*1000, (bb.mxZ-bb.mnZ)*1000 ].sort((a,b)=>b-a);
          const second = dims[1]; // tweede-grootste = kleinste "vlak"-maat van het gat
          if (dims[0] >= 600 && dims[1] >= 600) winSized++;
          if (second < 300) szBucket['<300']++; else if (second < 600) szBucket['300-600']++; else if (second < 1200) szBucket['600-1200']++; else szBucket['>1200']++;
        }
      }
      else if (isExt === false) { inTot++; isNamed?inNamed++:inUntyped++; }
      else noHost++;
    }
  }
  console.log('  -- verfijning: voids op KEPT-wanden, naar engine-classificatie --');
  console.log(`     op BUITEN-wanden: ${exTot} | raam/deur(geknipt)=${exNamed} | sparing(NIET geknipt)=${exUntyped} (${exTot?((exUntyped/exTot)*100).toFixed(1):'0'}%)`);
  console.log(`     op BINNEN-wanden: ${inTot} | raam/deur=${inNamed} | sparing=${inUntyped} (niet bekleed → niet relevant)`);
  console.log(`     RISICO = sparing-voids op buiten-wanden: ${exUntyped} (zouden onbekleed moeten blijven maar isNamedOpening=false → wél bekleed)`);
  console.log(`     grootte sparing-voids (2e-grootste extent, mm): ${JSON.stringify(szBucket)}`);
  console.log(`     window-sized (beide grootste extents >=600mm) = ${winSized}  ← deze lijken écht raam/deur maar zijn ongetypeerd`);

  api.CloseModel(modelID);
  console.log(`\n(klaar in ${((Date.now()-t0)/1000).toFixed(1)}s)`);
  process.exit(0);
}
run().catch(e => { console.error('FATAL', e); process.exit(1); });
