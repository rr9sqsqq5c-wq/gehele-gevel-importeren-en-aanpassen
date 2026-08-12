// WEGWERP-DIAGNOSE (spike/) — waarom geeft het toevoegen van HSB_182.5 (26037284) aan de grote
// HSB_272.5-wanden (26024971, 26037507) de "Diepte-spreiding 90 mm > tolerantie 50 mm"-melding,
// en waarom staan de strips achterstevoren? READ-ONLY, niets bedraden.
//
// Reconstrueert wandbronnen getrouw aan parseIfc (verbatim uit spike/measure-axes.mjs), draait de
// ECHTE resolveOutsideDirections (ifc.js), en simuleert fitFacadePlane (facadePlane.js:67-137)
// voor 2 groep-hypotheses: {272.5-paar} en {272.5-paar + 182.5}. Bepaalt buiten- vs binnen-vlak.

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const MODEL = join(ROOT, 'public', 'BIL-MOO-A-ZZ-PBP.ifc');
const TARGETS = ['26024971', '26037507', '26037284', '26024963', '26025533', '26103087'];
const UP_AX = ['x', 'y', 'z'];

async function getNodeApi() {
  const WebIFC = require('web-ifc');
  const api = new WebIFC.IfcAPI();
  try { await api.Init(); }
  catch { api.SetWasmPath(join(ROOT, 'node_modules', 'web-ifc') + '/', true); await api.Init(); }
  return { WebIFC, api };
}
function worldAABB(api, modelID, eid) {
  let mesh; try { mesh = api.GetFlatMesh(modelID, eid); } catch { return null; }
  if (!mesh || mesh.geometries.size() === 0) return null;
  let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity, mnZ = Infinity, mxZ = -Infinity, ok = false;
  const m0 = mesh.geometries.get(0).flatTransformation;
  const c0 = { x: m0[0], y: m0[1], z: m0[2] }, c1 = { x: m0[4], y: m0[5], z: m0[6] };
  for (let gi = 0; gi < mesh.geometries.size(); gi++) {
    const placed = mesh.geometries.get(gi); let geom;
    try {
      geom = api.GetGeometry(modelID, placed.geometryExpressID);
      const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
      const m = placed.flatTransformation;
      for (let i = 0; i < verts.length; i += 6) {
        const lx = verts[i], ly = verts[i + 1], lz = verts[i + 2];
        const wx = m[0]*lx+m[4]*ly+m[8]*lz+m[12], wy = m[1]*lx+m[5]*ly+m[9]*lz+m[13], wz = m[2]*lx+m[6]*ly+m[10]*lz+m[14];
        if (wx<mnX)mnX=wx; if (wx>mxX)mxX=wx; if (wy<mnY)mnY=wy; if (wy>mxY)mxY=wy; if (wz<mnZ)mnZ=wz; if (wz>mxZ)mxZ=wz; ok=true;
      }
    } finally { geom?.delete(); }
  }
  return ok ? { mnX, mxX, mnY, mxY, mnZ, mxZ, c0, c1 } : null;
}
function deriveWallAxes(dx, dy, dz, heightAxis) {
  if (heightAxis === 'z_neg') heightAxis = 'z';
  if (heightAxis === 'y') {
    const lengthAxis = dx >= dz ? 'x' : 'z', thicknessAxis = dx >= dz ? 'z' : 'x';
    return { heightAxis, lengthAxis, thicknessAxis };
  }
  const lengthAxis = dx >= dy ? 'x' : 'y', thicknessAxis = dx >= dy ? 'y' : 'x';
  return { heightAxis: 'z', lengthAxis, thicknessAxis };
}
function detectUpAxis(api, WebIFC, modelID) {
  const vote = { x: 0, y: 0, z: 0 };
  for (const tn of ['IFCWINDOW', 'IFCDOOR']) {
    const code = WebIFC[tn]; if (code == null) continue;
    let vec; try { vec = api.GetLineIDsWithType(modelID, code); } catch { continue; }
    for (let i = 0; i < vec.size(); i++) {
      const bb = worldAABB(api, modelID, vec.get(i)); if (!bb) continue;
      const dx = bb.mxX-bb.mnX, dy = bb.mxY-bb.mnY, dz = bb.mxZ-bb.mnZ, mx = Math.max(dx, dy, dz);
      if (mx === dx) vote.x++; else if (mx === dy) vote.y++; else vote.z++;
    }
  }
  return (vote.y > 0 || vote.z > 0) ? (vote.y >= vote.z ? 'y' : 'z') : 'z';
}
const AXc = (ax, p) => ax === 'x' ? p.x : ax === 'y' ? p.y : p.z;
const lo = (A, ax) => A['min' + ax.toUpperCase()], hi = (A, ax) => A['max' + ax.toUpperCase()];

// fitFacadePlane-kern, verbatim naar facadePlane.js:67-137 (alleen wat we nodig hebben)
function reconstructAABB(wo) {
  const A = {}, put = (ax, a, b) => { A['min'+ax.toUpperCase()]=Math.min(a,b); A['max'+ax.toUpperCase()]=Math.max(a,b); };
  put(wo.lengthAxis, wo.lengthStart, wo.lengthEnd); put(wo.heightAxis, wo.heightStart, wo.heightEnd);
  put(wo.thicknessAxis, wo.thicknessStart, wo.thicknessEnd);
  return A;
}
const extOf = (A, ax) => hi(A, ax) - lo(A, ax);
function simFitPlane(members) {
  const aabbs = members.map(m => ({ m, A: reconstructAABB(m.wallOrigin) }));
  const gMin = { x: Infinity, y: Infinity, z: Infinity }, gMax = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const { A } of aabbs) for (const ax of UP_AX) { gMin[ax] = Math.min(gMin[ax], lo(A, ax)); gMax[ax] = Math.max(gMax[ax], hi(A, ax)); }
  const thinVote = { x: 0, y: 0, z: 0 };
  for (const { A } of aabbs) { const e = { x: extOf(A,'x'), y: extOf(A,'y'), z: extOf(A,'z') }; thinVote[UP_AX.reduce((a,b)=>e[a]<=e[b]?a:b)]++; }
  const nAxis = UP_AX.reduce((a, b) => thinVote[a] >= thinVote[b] ? a : b);
  // outward-vote (facadePlane.js:117-127)
  let dirVote = 0, roVotes = 0, maxVoteConf = 0;
  for (const { m } of aabbs) { const wo = m.wallOrigin, ro = wo.resolvedOutside; if (ro && ro.outsideDir != null && wo.thicknessAxis === nAxis) { dirVote += (ro.outsideDir < 0 ? -1 : 1); roVotes++; maxVoteConf = Math.max(maxVoteConf, ro.confidence ?? 0); } }
  let usedFallback = false;
  if (dirVote === 0) { usedFallback = true; const mid = (gMin[nAxis]+gMax[nAxis])/2; for (const { A } of aabbs) { const c = (lo(A,nAxis)+hi(A,nAxis))/2; dirVote += (c >= mid ? 1 : -1); } }
  const outsideDir = dirVote >= 0 ? 1 : -1;
  const faces = aabbs.map(({ A }) => outsideDir < 0 ? lo(A, nAxis) : hi(A, nAxis)).sort((a, b) => a - b);
  const offset = faces[Math.floor(faces.length / 2)];
  const residualMm = Math.round(Math.max(...faces.map(f => Math.abs(f - offset))));
  // spiegelbeeld: residu als we de ANDERE kant als buiten namen
  const facesOpp = aabbs.map(({ A }) => outsideDir < 0 ? hi(A, nAxis) : lo(A, nAxis)).sort((a, b) => a - b);
  const offsetOpp = facesOpp[Math.floor(facesOpp.length / 2)];
  const residualOpp = Math.round(Math.max(...facesOpp.map(f => Math.abs(f - offsetOpp))));
  // NIEUW (BEST_FIT_FLUSH_SIDE): mimic van de fix — bij roVotes==0 kies de flush-kant
  const residOf = (dir) => { const fs = aabbs.map(({ A }) => dir < 0 ? lo(A, nAxis) : hi(A, nAxis)).sort((a, b) => a - b); return Math.round(Math.max(...fs.map(f => Math.abs(f - fs[Math.floor(fs.length / 2)])))); };
  const rNeg = residOf(-1), rPos = residOf(1);
  // NIEUWE FIX-logica (residu-tegenspraak i.p.v. roVotes): lage-confidence stem + gekozen kant
  // niet vlak + andere kant wél vlak → flip naar flush-kant.
  const chosenResid = outsideDir < 0 ? rNeg : rPos, oppResid = outsideDir < 0 ? rPos : rNeg;
  const flushFlip = (maxVoteConf < 0.9 && chosenResid > 50 && oppResid <= 50);
  const newOutsideDir = flushFlip ? -outsideDir : outsideDir;
  const newFaces = aabbs.map(({ A }) => newOutsideDir < 0 ? lo(A, nAxis) : hi(A, nAxis)).sort((a, b) => a - b);
  const newOffset = newFaces[Math.floor(newFaces.length / 2)];
  const newResidual = Math.round(Math.max(...newFaces.map(f => Math.abs(f - newOffset))));
  return { nAxis, dirVote, roVotes, maxVoteConf, usedFallback, outsideDir, offset, residualMm, residualOpp, gMin, gMax, rNeg, rPos, flushFlip, newOutsideDir, newOffset, newResidual };
}

// ── getrouwe inputs (verbatim uit spike/measure-axes.mjs) ──
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
  try {
    const vv = api.GetLineIDsWithType(modelID, WebIFC.IFCRELVOIDSELEMENT);
    for (let i = 0; i < vv.size(); i++) {
      try {
        const rel = api.GetLine(modelID, vv.get(i), false);
        const wID = rel?.RelatingBuildingElement?.value, oID = rel?.RelatedOpeningElement?.value;
        if (!wID || !oID) continue;
        (wallVoids[wID] ??= []).push(oID);
      } catch {}
    }
  } catch {}
  const openingsByWall = {};
  for (const [wID, ops] of Object.entries(wallVoids)) {
    const arr = [];
    for (const oID of ops) arr.push({ id: oID, type: openingType[oID] ?? 'sparing', breedte: 1000 });
    openingsByWall[String(wID)] = arr;
  }
  return openingsByWall;
}

async function run() {
  const { WebIFC, api } = await getNodeApi();
  const buf = readFileSync(MODEL);
  const modelID = api.OpenModel(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
  const up = detectUpAxis(api, WebIFC, modelID);
  console.log(`[up-as] heightAxis='${up}'`);
  const spaceB = extractSpaceBoundary(api, WebIFC, modelID);
  const matL = extractMatLayer(api, WebIFC, modelID);

  const wallIDs = [];
  for (const tn of ['IFCWALL', 'IFCWALLSTANDARDCASE']) { const v = api.GetLineIDsWithType(modelID, WebIFC[tn]); for (let i=0;i<v.size();i++) wallIDs.push(v.get(i)); }
  console.log(`[wanden] ${wallIDs.length} IFCWALL(STANDARDCASE); reconstrueren…`);

  const walls = []; const byID = {}; const targetHit = {}; const wallOriginByID = {};
  for (const wID of wallIDs) {
    let name = null, tag = null;
    try { const ln = api.GetLine(modelID, wID, false); name = ln?.Name?.value ?? null; tag = ln?.Tag?.value ?? null; } catch {}
    const matched = TARGETS.filter(t => String(wID) === t || String(tag) === t || (name && name.includes(t)));
    const bb = worldAABB(api, modelID, wID); if (!bb) continue;
    const dx = bb.mxX-bb.mnX, dy = bb.mxY-bb.mnY, dz = bb.mxZ-bb.mnZ;
    const { heightAxis, lengthAxis, thicknessAxis } = deriveWallAxes(dx, dy, dz, up);
    const mm = { minX:Math.round(bb.mnX*1000),maxX:Math.round(bb.mxX*1000),minY:Math.round(bb.mnY*1000),maxY:Math.round(bb.mxY*1000),minZ:Math.round(bb.mnZ*1000),maxZ:Math.round(bb.mxZ*1000) };
    const len = hi(mm, lengthAxis) - lo(mm, lengthAxis), hgt = hi(mm, heightAxis) - lo(mm, heightAxis);
    if (len < 100 || hgt < 100) continue;
    const l0 = Math.hypot(bb.c0.x,bb.c0.y,bb.c0.z)||1; const wallLengthDir = { x:bb.c0.x/l0,y:bb.c0.y/l0,z:bb.c0.z/l0 };
    const cyComp = AXc(thicknessAxis, bb.c1); const wallInsideThickDir = Math.abs(cyComp)>0.5 ? (cyComp>0?1:-1) : 0;
    const wo = {
      lengthStart: lo(mm,lengthAxis), lengthEnd: hi(mm,lengthAxis), heightStart: lo(mm,heightAxis), heightEnd: hi(mm,heightAxis),
      thicknessStart: lo(mm,thicknessAxis), thicknessEnd: hi(mm,thicknessAxis),
      lengthAxis, heightAxis, thicknessAxis, wallInsideThickDir, wallLengthDir,
      matLayerSense: matL[wID]?.directSense ?? null, matLayerSetDir: matL[wID]?.layerSetDir ?? null, spaceBoundaryType: spaceB[wID] ?? null,
    };
    const w = { expressID: String(wID), wallOrigin: wo, openings: [], mm, name, tag };
    walls.push(w); byID[String(wID)] = w; wallOriginByID[String(wID)] = wo;
    for (const t of matched) targetHit[t] = w;   // Revit-ElementId → wand
  }
  // getrouwe openingen terugvoeren (voor _classifyWallExterior raam-hint + window-bias)
  const openingsByWall = extractOpenings(api, WebIFC, modelID, wallOriginByID);
  for (const w of walls) w.openings = openingsByWall[w.expressID] ?? [];
  console.log(`[reconstructie] ${walls.length} wanden >=100mm; ${Object.keys(openingsByWall).length} wanden met openingen`);
  console.log(`[match] doel-ElementId's gevonden: ${Object.keys(targetHit).join(', ') || 'GEEN'}`);
  for (const [t, w] of Object.entries(targetHit)) console.log(`   ${t} → expressID ${w.expressID}  ramen=${(w.openings??[]).filter(o=>o.type==='raam').length} matSense=${w.wallOrigin.matLayerSense} spaceB=${w.wallOrigin.spaceBoundaryType}`);

  // echte resolveOutsideDirections (globale context)
  let resolveOutsideDirections;
  try { ({ resolveOutsideDirections } = await import('../../src/lib/ifc.js')); }
  catch (e) { console.log('🔴 import resolveOutsideDirections faalde:', e.message); }
  if (resolveOutsideDirections) resolveOutsideDirections(walls);

  console.log('\n=== DOELWANDEN ===');
  for (const id of TARGETS) {
    const w = targetHit[id]; if (!w) { console.log(`  ${id}: NIET gevonden`); continue; }
    const wo = w.wallOrigin, ro = wo.resolvedOutside ?? {};
    const thick = wo.thicknessEnd - wo.thicknessStart;
    console.log(`  ${id} (exprID ${w.expressID})  dikte=${thick}mm  thicknessAxis=${wo.thicknessAxis}  [start=${wo.thicknessStart}, end=${wo.thicknessEnd}]`);
    console.log(`         lengthAxis=${wo.lengthAxis} [${wo.lengthStart}..${wo.lengthEnd}] breedte=${wo.lengthEnd - wo.lengthStart}   heightAxis=${wo.heightAxis} [${wo.heightStart}..${wo.heightEnd}] hoogte=${wo.heightEnd - wo.heightStart}`);
    console.log(`         resolvedOutside: outsideDir=${ro.outsideDir} outsidePos=${ro.outsidePos} source=${ro.source} conf=${ro.confidence} isExterior=${wo.isExterior} reason=${(ro.reason??'').slice(0,90)}`);
  }

  const present = TARGETS.filter(id => targetHit[id]);
  const t272 = present.filter(id => (targetHit[id].wallOrigin.thicknessEnd - targetHit[id].wallOrigin.thicknessStart) > 220);
  const t182 = present.filter(id => (targetHit[id].wallOrigin.thicknessEnd - targetHit[id].wallOrigin.thicknessStart) <= 220);
  console.log(`\n  272.5-groep: ${t272.join(', ')} | 182.5: ${t182.join(', ')}`);

  const membersOf = ids => ids.map(id => targetHit[id]);
  const report = (label, ids) => {
    const p = simFitPlane(membersOf(ids));
    console.log(`\n=== fitFacadePlane(${label}) ===`);
    console.log(`  nAxis=${p.nAxis}  outsideDir=${p.outsideDir}  (dirVote=${p.dirVote}, resolvedOutside-stemmen=${p.roVotes}, maxConf=${p.maxVoteConf}, fallback=${p.usedFallback})`);
    console.log(`  offset=${p.offset}mm  residualMm=${p.residualMm}mm  (spiegel-kant residu=${p.residualOpp}mm)`);
    console.log(`  ${p.residualMm > 50 ? '🔴 HUIDIG: WAARSCHUWING' : '🟢 HUIDIG: ok'}: diepte-spreiding ${p.residualMm} > tol 50? ${p.residualMm>50}`);
    console.log(`  ▶ FIX (bestFitFlushSide): rNeg=${p.rNeg} rPos=${p.rPos} maxConf=${p.maxVoteConf} → flushFlip=${p.flushFlip} → outsideDir=${p.newOutsideDir} offset=${p.newOffset} residu=${p.newResidual} ${p.newResidual>50?'🔴':'🟢'}`);
    // per lid: welke kant ligt "vlak"?
    for (const id of ids) {
      const A = reconstructAABB(targetHit[id].wallOrigin);
      console.log(`     ${id} langs ${p.nAxis}: min=${lo(A,p.nAxis)}  max=${hi(A,p.nAxis)}  (gekozen buitenvlak=${p.outsideDir<0?lo(A,p.nAxis):hi(A,p.nAxis)})`);
    }
    return p;
  };
  if (t272.length >= 1) report('alleen 272.5', t272);
  report('272.5 + 182.5', present);

  // building-bbox oracle: welke kant is FYSIEK buiten (verste van gebouwmidden langs nAxis)?
  const p = simFitPlane(membersOf(present));
  const G = { min: Infinity, max: -Infinity };
  for (const w of walls) { G.min = Math.min(G.min, lo(w.mm, p.nAxis)); G.max = Math.max(G.max, hi(w.mm, p.nAxis)); }
  const gMid = (G.min + G.max) / 2;
  console.log(`\n=== ORACLE (gebouw-bbox langs ${p.nAxis}) ===`);
  console.log(`  gebouw ${p.nAxis}: [${G.min}, ${G.max}]  midden=${Math.round(gMid)}`);
  for (const id of present) {
    const A = reconstructAABB(targetHit[id].wallOrigin), c = (lo(A,p.nAxis)+hi(A,p.nAxis))/2;
    const physOutMax = c >= gMid; // wand-midden voorbij gebouwmidden → buiten = +nAxis (max-kant)
    console.log(`     ${id} midden=${Math.round(c)} → fysiek buiten = ${physOutMax ? 'MAX(+)' : 'MIN(-)'}-kant`);
  }

  // ── END-TO-END: de ECHTE fitFacadePlane (facadePlane.js) met de vlag gestubd aan/uit ──
  try {
    const { fitFacadePlane } = await import('../../src/lib/facadePlane.js');
    const members = present.map(id => targetHit[id]);
    globalThis.window = { location: { search: '?bestFitFlushSide=0' } };  // NOODREM
    const off = fitFacadePlane(members, up);
    globalThis.window.location.search = '';  // DEFAULT (geen param → readFlag default TRUE)
    const on = fitFacadePlane(members, up);
    console.log('\n=== ECHTE fitFacadePlane (facadePlane.js) op 272+182 (na promotie default=true) ===');
    console.log(`  noodrem ?bestFitFlushSide=0 : outsideDir=${off.outsideDir} offset=${off.offset} residualMm=${off.residualMm} warnings=${off.warnings.length} ${off.residualMm>50?'🔴 (oud gedrag)':'🟢'}`);
    console.log(`  default (geen param)        : outsideDir=${on.outsideDir} offset=${on.offset} residualMm=${on.residualMm} warnings=${on.warnings.length} ${on.residualMm>50?'🔴':'🟢 (gefixt)'}`);
  } catch (e) { console.log('🔴 fitFacadePlane end-to-end faalde:', e.message); }

  // ── GROUP_START_WIDEST: echte buildBestFitFacadePattern op de twee wanden, vlag gestubd ──
  try {
    const { buildBestFitFacadePattern } = await import('../../src/lib/facadePlane.js');
    const two = ['26024963', '26024971'].map(id => targetHit[id]).filter(Boolean);
    const MAT = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
    const edges = (fd) => {
      if (!fd?.rows?.length) return null;
      const minY = Math.min(...fd.rows.map(r => r.y));
      const lowRows = fd.rows.filter(r => r.y <= minY + 200); // onderste rijen = hoofdwand-regio
      const starts = lowRows.flatMap(r => r.pieces.map(p => p.start));
      const ends = lowRows.flatMap(r => r.pieces.map(p => p.start + p.length));
      return { L: Math.round(Math.min(...starts)), R: Math.round(Math.max(...ends)) };
    };
    globalThis.window = { location: { search: '?groupStartWidest=0' } };  // NOODREM
    const off = buildBestFitFacadePattern(two, MAT, 'halfsteens', null, null, null, null, 0, 0, up);
    globalThis.window.location.search = '';  // DEFAULT (geen param → readFlag default TRUE)
    const on = buildBestFitFacadePattern(two, MAT, 'halfsteens', null, null, null, null, 0, 0, up);
    const eo = edges(off), en = edges(on), gW = Math.round(off?.groupWidth);
    console.log('\n=== ECHTE buildBestFitFacadePattern op 26024963+26024971 (na promotie default=true) ===');
    console.log(`  groupMinX=${off?.groupMinX} groupWidth=${gW} (breedste wand: links=0, rechts=${gW})`);
    console.log(`  noodrem ?groupStartWidest=0 : hoofdwand-rijen links=${eo.L} rechts=${eo.R}  ${eo.L>1||eo.R<gW-1?'🔴 (oud gedrag: trapt in)':'🟢'}`);
    console.log(`  default (geen param)        : hoofdwand-rijen links=${en.L} rechts=${en.R}  ${en.L<=1&&en.R>=gW-1?'🟢 (gefixt: rechthoek)':'🔴'}`);
  } catch (e) { console.log('🔴 buildBestFitFacadePattern test faalde:', e.message); }

  // ── VENTILATIE-METING: alle openingen van 26037507 (744779) met echte geometrie ──
  const ventWall = targetHit['26037507'];
  if (ventWall) {
    const wid = +ventWall.expressID, wo = ventWall.wallOrigin;
    const voids = [];
    const vv = api.GetLineIDsWithType(modelID, WebIFC.IFCRELVOIDSELEMENT);
    for (let i = 0; i < vv.size(); i++) { const rel = api.GetLine(modelID, vv.get(i), false); if (rel?.RelatingBuildingElement?.value === wid) voids.push(rel.RelatedOpeningElement?.value); }
    const fillOf = {}, fillType = {};
    const fv = api.GetLineIDsWithType(modelID, WebIFC.IFCRELFILLSELEMENT);
    for (let i = 0; i < fv.size(); i++) { const rel = api.GetLine(modelID, fv.get(i), false); const op = rel?.RelatingOpeningElement?.value, fil = rel?.RelatedBuildingElement?.value; if (op && fil) { fillOf[op] = fil; try { const raw = api.GetRawLineData(modelID, fil); fillType[op] = api.GetNameFromTypeCode(raw.type).toLowerCase(); } catch {} } }
    console.log(`\n=== OPENINGEN van 26037507 (exprID ${wid}); wand lengte-x[${wo.lengthStart}..${wo.lengthEnd}] hoogte-y[${wo.heightStart}..${wo.heightEnd}] ===`);
    const rows = [];
    for (const oID of voids) {
      const bb = worldAABB(api, modelID, oID); if (!bb) { console.log(`  void ${oID}: geen geometrie`); continue; }
      const x0 = Math.round(bb.mnX*1000 - wo.lengthStart), y0 = Math.round(bb.mnY*1000 - wo.heightStart);
      const w = Math.round((bb.mxX-bb.mnX)*1000), h = Math.round((bb.mxY-bb.mnY)*1000);
      const t = fillOf[oID] ? (fillType[oID].includes('window') ? 'raam' : fillType[oID].includes('door') ? 'deur' : 'fill:' + fillType[oID]) : 'GEEN FILL (sparing/ventilatie?)';
      rows.push({ oID, x0, y0, w, h, t });
    }
    rows.sort((a, b) => a.y0 - b.y0);
    for (const r of rows) console.log(`  void ${r.oID}: wand-lokaal x=${r.x0} y=${r.y0}  breedte=${r.w} hoogte=${r.h}  type=${r.t}`);
  }

  // ── VENTILATIE_ZONE: retag → cut → zone-generatie → gedraaide-verband-regio ──
  try {
    const { buildBestFitFacadePattern } = await import('../../src/lib/facadePlane.js');
    const { ventilationZonesFor, buildStripZoneRegions } = await import('../../src/lib/zoneRegions.js');
    const wall = targetHit['26037507'];
    // gemeten openingen (raam + vent als 'sparing')
    const raam = { id: 754791, type: 'raam', x: 285, y: 844, breedte: 1800, hoogte: 1723, polyPts: null };
    const vent = { id: 744807, type: 'sparing', x: 1542, y: 2735, breedte: 275, hoogte: 93, polyPts: null };
    const ops = [raam, vent];
    // retag-detectie repliceren (ifc.js)
    const VENT_MAX_W = 900, VENT_MAX_H = 350, VENT_ABOVE_GAP = 1200;
    for (const op of ops) {
      if (op.type !== 'sparing' || op.breedte > VENT_MAX_W || op.hoogte > VENT_MAX_H) continue;
      const ab = ops.some((r) => r.type === 'raam' && (Math.min(r.x + r.breedte, op.x + op.breedte) - Math.max(r.x, op.x)) > 0 && (r.y + r.hoogte) <= (op.y + 1) && (op.y - (r.y + r.hoogte)) <= VENT_ABOVE_GAP);
      if (ab) op.type = 'ventilatie';
    }
    console.log('\n=== VENTILATIE_ZONE validatie ===');
    console.log(`  1) retag: vent type = '${vent.type}'  ${vent.type === 'ventilatie' ? '🟢' : '🔴 (verwacht ventilatie)'}`);
    globalThis.window = { location: { search: '?ventilatieZone=1' } };
    const MAT = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
    const fd = buildBestFitFacadePattern([{ ...wall, openings: ops }], MAT, 'halfsteens', null, null, null, null, 0, 0, up);
    const goVent = (fd?.groupOpenings ?? []).filter((o) => o.type === 'ventilatie');
    console.log(`  2) groupOpenings ventilatie: ${goVent.length} ${goVent[0] ? `(x=${goVent[0].x} y=${goVent[0].y} ${goVent[0].width}x${goVent[0].height}) 🟢` : '🔴'}`);
    const zones = ventilationZonesFor(fd, { ventilatie: { enabled: true } }, 'halfsteens', MAT);
    const z0 = zones[0];
    const gvv = goVent[0];
    const nS = Math.ceil((gvv.width + 10) / 60);
    const expW = nS * 50 + (nS - 1) * 10, expH = 3 * 50 + 2 * 12; // 290, 174
    console.log(`  3) zone: ${z0?.width}x${z0?.height} (formule ${expW}x${expH} = ${nS} strippen × 3 lagen) verband=${z0?.verband} ${z0?.width === expW && z0?.height === expH && z0?.verband === 'staand_tegelverband' ? '🟢' : '🔴'}`);
    const regions = buildStripZoneRegions(fd, zones, MAT, 'halfsteens', '#a64033', { stripArt: { steenL: 210, steenH: 50 } });
    const zr = regions?.find((r) => r.verband === 'staand_tegelverband');
    const compl = regions?.[0]; // complement (omringende horizontale strippen)
    // 4) zone GEVULD met hele verticale strippen (niet geknipt op het gat)
    const allPieces = (zr?.rows ?? []).flatMap((r) => r.pieces);
    const slivers = allPieces.filter((p) => p.length < 50 - 0.5);
    const stripH = zr?.material?.steenL; // verticale strip-hoogte (staand: steenL)
    console.log(`  4) zone gevuld: ${zr?.rows?.length} rij(en), ${allPieces.length} strippen; slivers=${slivers.length}; strip-hoogte(steenL)=${stripH} (=zone ${expH}) ${allPieces.length >= 5 && slivers.length === 0 && stripH === expH ? '🟢 hele strippen op lengte' : '🔴'}`);
    // 5) voeg RONDOM de zone: complement laat ≥stoot vrij naast de zone
    const zx0 = z0.x, zx1 = z0.x + z0.width, marge = 10;
    const inZoneRows = (compl?.rows ?? []).filter((r) => r.y + 50 > z0.y && r.y < z0.y + z0.height);
    const raaktZone = inZoneRows.some((r) => r.pieces.some((p) => p.start < zx1 + marge - 0.5 && p.start + p.length > zx0 - marge + 0.5));
    console.log(`  5) voeg (stoot) rondom zone: ${raaktZone ? '🔴 complement raakt de zone' : '🟢 voeg vrij'}`);
    // 6) panelen sparen op de vent-opening (buildFacadeZones maakt een gat rond de opening)
    const { buildFacadeZones, cutVentHolesFromPanels } = await import('../../src/lib/panelization.js');
    const gv = goVent[0];
    const raamP = { id: 'raam', x: 285, y: 844, width: 1800, height: 1723, polyPts: null };
    // NIEUW: vent NIET in de zone-splitsing → geen dunne band op vent-hoogte
    const zonesNoVent = buildFacadeZones(fd.groupWidth, fd.groupHeight, [raamP]);
    const dunNoVent = zonesNoVent.filter((z) => z.y < gv.y + gv.height && z.y + z.height > gv.y && z.height < 200);
    // cut het gat uit een vol-breed paneel dat de vent overlapt
    const fullPanel = { x: 0, y: gv.y - 500, width: fd.groupWidth, height: 1000 };
    const cut = cutVentHolesFromPanels([fullPanel], [{ x: gv.x, y: gv.y, width: gv.width, height: gv.height }]);
    const gatVrij = !cut.some((p) => p.x < gv.x + gv.width - 0.5 && p.x + p.width > gv.x + 0.5 && p.y < gv.y + gv.height - 0.5 && p.y + p.height > gv.y + 0.5);
    console.log(`  6) vent uit zone-splitsing: dunne banden < 200mm = ${dunNoVent.length} ${dunNoVent.length === 0 ? '🟢 (paneel volle breedte)' : '🔴'}; cut vol paneel → ${cut.length} stukken, gat vrij=${gatVrij} ${gatVrij ? '🟢' : '🔴'}`);
  } catch (e) { console.log('🔴 ventilatie-validatie faalde:', e.message, '|', e.stack?.split('\n')[1]?.trim()); }

  // ── FILL_TO_MAX: trekt de bekleding op tot de maxlijn boven de wand? ──
  try {
    const { buildBestFitFacadePattern } = await import('../../src/lib/facadePlane.js');
    const wall = targetHit['26024971']; // wand ~2870 mm hoog
    const MAT = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
    const MAXH = 3500; // boven de wandtop
    globalThis.window = { location: { search: '' } };
    const topRow = (fd) => fd?.rows?.length ? Math.max(...fd.rows.map(r => r.y)) : null;
    const off = buildBestFitFacadePattern([wall], MAT, 'halfsteens', MAXH, null, null, 0, 0, up, null, null, false);
    const on  = buildBestFitFacadePattern([wall], MAT, 'halfsteens', MAXH, null, null, 0, 0, up, null, null, true);
    console.log('\n=== FILL_TO_MAX (wand ~2870mm, maxHoogte 3500) ===');
    console.log(`  fillToMax=false: groupHeight=${off?.groupHeight} topRow.y=${topRow(off)} rijen=${off?.rows?.length}`);
    console.log(`  fillToMax=true : groupHeight=${on?.groupHeight}  topRow.y=${topRow(on)} rijen=${on?.rows?.length}  ${on?.groupHeight >= MAXH - 1 && topRow(on) > 2900 ? '🟢 opgetrokken tot maxlijn' : '🔴'}`);
  } catch (e) { console.log('🔴 fill-to-max validatie faalde:', e.message, '|', e.stack?.split('\n')[1]?.trim()); }

  // ── KOPSE GEVEL handedness-meting (gevelHandedness) ──
  try {
    const { fitFacadePlane, buildBestFitFacadePattern } = await import('../../src/lib/facadePlane.js');
    const { facadeNeedsMirror } = await import('../../src/lib/pattern.js');
    const kops = ['26025533', '26103087'].map((id) => targetHit[id]).filter(Boolean);
    console.log('\n=== KOPSE GEVEL 257.5 (26025533 + 26103087) — handedness ===');
    if (!kops.length) { console.log('  🔴 geen van de kopse-gevel-wanden gevonden'); }
    else {
      for (const w of kops) { const ro = w.wallOrigin.resolvedOutside ?? {}; console.log(`   ${w.expressID} (${w.name}) len=${w.wallOrigin.lengthAxis} up=${w.wallOrigin.heightAxis} n=${w.wallOrigin.thicknessAxis} outsideDir=${ro.outsideDir} conf=${ro.confidence} source=${ro.source}`); }
      globalThis.window = { location: { search: '' } };
      const plane = fitFacadePlane(kops, up);
      const mir = plane ? facadeNeedsMirror(plane.uAxis, plane.nAxis, plane.tAxis, plane.outsideDir) : null;
      console.log(`  fitFacadePlane: up=${plane?.uAxis} lengte=${plane?.tAxis} normaal=${plane?.nAxis} outsideDir=${plane?.outsideDir} residu=${plane?.residualMm} warnings=${plane?.warnings?.length}`);
      if (plane?.warnings?.length) plane.warnings.forEach((w) => console.log(`     ⚠️ ${w}`));
      console.log(`  ▶ facadeNeedsMirror(up=${plane?.uAxis}, n=${plane?.nAxis}, t=${plane?.tAxis}, out=${plane?.outsideDir}) = ${mir}`);
      // bond eerste rij UIT vs AAN
      const MAT = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
      const firstRow = (fd) => { if (!fd?.rows?.length) return '(geen rows)'; const minY = Math.min(...fd.rows.map((r) => r.y)); const r = fd.rows.find((row) => row.y === minY); const ps = [...r.pieces].sort((a, b) => a.start - b.start); return `${ps.map((p) => `${p.label[0]}${Math.round(p.length)}@${Math.round(p.start)}`).join(' ')}  (W=${Math.round(fd.groupWidth)})`; };
      globalThis.window.location.search = '';
      const off = buildBestFitFacadePattern(kops, MAT, 'halfsteens', null, null, null, null, 0, 0, up);
      globalThis.window.location.search = '?gevelHandedness=1';
      const on = buildBestFitFacadePattern(kops, MAT, 'halfsteens', null, null, null, null, 0, 0, up);
      console.log(`  bond UIT : ${firstRow(off)}`);
      console.log(`  bond AAN : ${firstRow(on)}`);
      console.log(`  → ${mir ? (JSON.stringify(firstRow(off)) !== JSON.stringify(firstRow(on)) ? '🟢 vlag kantelt de bond' : '🔴 vlag AAN maar bond ongewijzigd') : '🟠 mir=false → vlag doet (terecht?) niets; als dit vlak tóch spiegelt, klopt de meting/uitgangspunt niet'}`);
    }
  } catch (e) { console.log('🔴 kopse-gevel-meting faalde:', e.message, '|', e.stack?.split('\n')[1]?.trim()); }

  api.CloseModel(modelID);
  process.exit(0);
}
run().catch(e => { console.error('FATAL', e); process.exit(1); });
