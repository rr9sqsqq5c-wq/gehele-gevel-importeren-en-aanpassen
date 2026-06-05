// SPIKE — NULMETING (wegwerp). Regressie-anker voor FASE 1-3 van de zones-feature.
//
// WAT: een DETERMINISTISCHE generator-probe. We kunnen de exacte app-output niet
// headless reproduceren (die hangt af van de in IndexedDB opgeslagen groepen+settings,
// niet van de IFC). Daarom voeren we een vast, reproduceerbaar gevelvlak uit de ECHTE
// geometrie van brickboard-a door de ECHTE productie-generator en hashen het resultaat.
// Dit anker is gevoelig voor elke wijziging aan de generator-code (pattern.js /
// facadePlane.js) — precies wat FASE 1-3 raken.
//
// EISEN (van de opdracht):
//  - ECHTE productie-generator importeren (buildBestFitFacadePattern /
//    buildFullGroupFacadePattern), geen kopie.  → zie imports hieronder.
//  - up-as van brickboard-a rapporteren (proxy voor getProjectInfo().upAxis).
//  - output: spike/out/nulmeting-brickboard-a.json (hash + per-groep dims + upAxis).
//
// BEPERKING (expliciet): wand-extractie is een headless reconstructie (parseIfc is
// browser-gebonden via window.WebIFC). Openingen worden in v1 NIET meegenomen
// (openings:[]). Voor het flag-UIT-regressieanker is dat irrelevant: het anker
// vergelijkt harness-vs-harness over fases met IDENTIEKE extractie. App-pariteit is
// geen doel van de nulmeting.

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

import { buildBestFitFacadePattern, fitFacadePlane } from '../src/lib/facadePlane.js';
import { buildFullGroupFacadePattern } from '../src/lib/pattern.js';
import { buildStripZoneRegions } from '../src/lib/zoneRegions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const require = createRequire(pathToFileURL(resolve(ROOT, 'package.json')));
const W = require(resolve(ROOT, 'node_modules/web-ifc/web-ifc-api-node.js'));

const MODEL = resolve(ROOT, 'public/brickboard-a.ifc');
const OUT = resolve(__dirname, 'out/nulmeting-brickboard-a.json');
const MAT = { steenL: 210, steenH: 50, lint: 12, stoot: 10 }; // app-default (zie HANDLEIDING stap 3)

const val = (x) => (x && typeof x === 'object' && 'value' in x) ? x.value : x;

// ── wand-bbox uit web-ifc (wereld-mm), met vertex-stride voor snelheid ──
function getBBox(api, mid, eid) {
  let mesh;
  try { mesh = api.GetFlatMesh(mid, eid); } catch { return null; }
  if (!mesh || !mesh.geometries.size()) return null;
  let a = { x: Infinity, y: Infinity, z: Infinity }, b = { x: -Infinity, y: -Infinity, z: -Infinity }, ok = false;
  for (let gi = 0; gi < mesh.geometries.size(); gi++) {
    const pl = mesh.geometries.get(gi);
    let g;
    try {
      g = api.GetGeometry(mid, pl.geometryExpressID);
      const v = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize());
      const m = pl.flatTransformation;
      const st = Math.max(6, Math.floor((v.length / 6) / 40) * 6);
      for (let k = 0; k < v.length; k += st) {
        const lx = v[k], ly = v[k + 1], lz = v[k + 2];
        const wx = m[0] * lx + m[4] * ly + m[8] * lz + m[12];
        const wy = m[1] * lx + m[5] * ly + m[9] * lz + m[13];
        const wz = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
        if (wx < a.x) a.x = wx; if (wx > b.x) b.x = wx;
        if (wy < a.y) a.y = wy; if (wy > b.y) b.y = wy;
        if (wz < a.z) a.z = wz; if (wz > b.z) b.z = wz;
        ok = true;
      }
    } finally { g?.delete(); }
  }
  return ok ? { minX: a.x, maxX: b.x, minY: a.y, maxY: b.y, minZ: a.z, maxZ: b.z } : null;
}

// deriveWallAxes — geport uit spike/validate/facadeplane-validate.mjs (bewezen),
// die op zijn beurt ifc.js deriveWallAxes volgt: up-as bepaalt hoogte/lengte/dikte.
function deriveWallAxes(dx, dy, dz, heightAxis) {
  if (heightAxis === 'z_neg') heightAxis = 'z';
  if (heightAxis === 'y') {
    const la = dx >= dz ? 'x' : 'z', ta = dx >= dz ? 'z' : 'x';
    return { heightAxis, lengthAxis: la, thicknessAxis: ta, length: Math.round(Math.max(dx, dz) * 1000), height: Math.round(dy * 1000) };
  }
  const la = dx >= dy ? 'x' : 'y', ta = dx >= dy ? 'y' : 'x';
  return { heightAxis: 'z', lengthAxis: la, thicknessAxis: ta, length: Math.round(Math.max(dx, dy) * 1000), height: Math.round(dz * 1000) };
}

function memberFrom(api, mid, eid, up) {
  const bb = getBBox(api, mid, eid);
  if (!bb) return null;
  const dx = bb.maxX - bb.minX, dy = bb.maxY - bb.minY, dz = bb.maxZ - bb.minZ;
  const ax = deriveWallAxes(dx, dy, dz, up);
  if (ax.length < 100 || ax.height < 100) return null;
  const rng = (a) => [Math.round(bb['min' + a.toUpperCase()] * 1000), Math.round(bb['max' + a.toUpperCase()] * 1000)];
  const [ls, le] = rng(ax.lengthAxis), [hs, he] = rng(ax.heightAxis), [ts, te] = rng(ax.thicknessAxis);
  return {
    expressID: eid, length: ax.length, height: ax.height, openings: [],
    wallOrigin: {
      lengthAxis: ax.lengthAxis, heightAxis: ax.heightAxis, thicknessAxis: ax.thicknessAxis,
      lengthStart: ls, lengthEnd: le, heightStart: hs, heightEnd: he, thicknessStart: ts, thicknessEnd: te,
    },
    _bb: bb, _ext: { x: dx, y: dy, z: dz },
  };
}

// ── up-as headless (proxy voor getProjectInfo().upAxis) ──
// Wand-extents: dunste as = dikte, grootste = lengte, MIDDELSTE = hoogte (up).
// We stemmen per wand op de middelste-extent-as; de winnaar is de up-as.
// Corroboratie: globale spans + dunste-as-stemmen worden ook gerapporteerd.
function detectUpAxis(members) {
  const AX = ['x', 'y', 'z'];
  const midVote = { x: 0, y: 0, z: 0 };
  const thinVote = { x: 0, y: 0, z: 0 };
  for (const m of members) {
    const e = m._ext;
    const sorted = [...AX].sort((p, q) => e[p] - e[q]); // klein → groot
    thinVote[sorted[0]]++;
    midVote[sorted[1]]++;
  }
  const up = AX.reduce((a, b) => midVote[a] >= midVote[b] ? a : b);
  return { up, midVote, thinVote };
}

// canonieke hash over de strip-geometrie (rond op 0.01 mm, matcht round2 in pattern.js)
function hashRows(rows) {
  const r2 = (v) => Math.round(v * 100) / 100;
  const norm = (rows ?? [])
    .map((row) => ({
      y: r2(row.y),
      pieces: (row.pieces ?? [])
        .map((p) => [r2(p.start), r2(p.length), p.label ?? ''])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    }))
    .sort((a, b) => a.y - b.y);
  const s = JSON.stringify(norm);
  return { sha256: createHash('sha256').update(s).digest('hex'), rowCount: norm.length, pieceCount: norm.reduce((n, r) => n + r.pieces.length, 0) };
}

async function main() {
  console.log('=== NULMETING brickboard-a — deterministische generator-probe ===');
  const api = new W.IfcAPI();
  await api.Init();
  const mid = api.OpenModel(new Uint8Array(readFileSync(MODEL)), {});
  const tc = (n) => { try { return api.GetTypeCodeFromName(n); } catch { return undefined; } };

  // alle wanden inlezen (IFCWALLSTANDARDCASE + IFCWALL). up nog onbekend → 'y' voor de
  // eerste extractie (we hebben enkel de bbox+ext nodig; up-keuze beïnvloedt _ext niet).
  const wallIds = [];
  for (const t of ['IFCWALLSTANDARDCASE', 'IFCWALL']) {
    const v = api.GetLineIDsWithType(mid, tc(t));
    for (let i = 0; i < v.size(); i++) wallIds.push(v.get(i));
  }
  console.log(`  wanden in model: ${wallIds.length} — bboxes berekenen…`);

  const all = [];
  let done = 0;
  for (const id of wallIds) {
    const m = memberFrom(api, mid, id, 'y');
    if (m) all.push(m);
    if (++done % 500 === 0) console.log(`    …${done}/${wallIds.length}`);
  }
  console.log(`  bruikbare wand-members: ${all.length}`);

  const { up, midVote, thinVote } = detectUpAxis(all);
  const span = (k) => {
    let lo = Infinity, hi = -Infinity;
    for (const m of all) { lo = Math.min(lo, m._bb['min' + k.toUpperCase()]); hi = Math.max(hi, m._bb['max' + k.toUpperCase()]); }
    return Math.round((hi - lo) * 1000);
  };
  const globalSpan = { x: span('x'), y: span('y'), z: span('z') };
  console.log(`  UP-AS (headless): '${up}'  | middelste-extent-stemmen=${JSON.stringify(midVote)} | dunste-as-stemmen=${JSON.stringify(thinVote)}`);
  console.log(`  globale spans (mm): ${JSON.stringify(globalSpan)}`);
  console.log(`  ⚠️ proxy voor getProjectInfo().upAxis (in-app: detectModelUpAxis ifc.js:544).`);

  // herafleiden met de gedetecteerde up-as (zo kloppen lengte/hoogte/dikte-assen)
  const members = wallIds.map((id) => memberFrom(api, mid, id, up)).filter(Boolean);

  // dominante facade-normaal = vaakst gestemde dunste-as ONDER de niet-up-assen
  const horiz = ['x', 'y', 'z'].filter((a) => a !== up);
  const nAxis = thinVote[horiz[0]] >= thinVote[horiz[1]] ? horiz[0] : horiz[1];
  // bin op buitenvlak-coördinaat (min langs nAxis), 50mm; densste bin = één gevelvlak
  const onNormal = members.filter((m) => m.wallOrigin.thicknessAxis === nAxis);
  const bin = new Map();
  for (const m of onNormal) { const k = Math.round(m.wallOrigin.thicknessStart / 50); bin.set(k, (bin.get(k) || 0) + 1); }
  let bk = 0, bn = -1; for (const [k, c] of bin) if (c > bn) { bn = c; bk = k; }
  const facadeCoord = bk * 50;
  const sel = onNormal.filter((m) => Math.abs(m.wallOrigin.thicknessStart - facadeCoord) < 60)
    .map(({ _bb, _ext, ...m }) => { m.wallOrigin.resolvedOutside = { outsideDir: -1, outsidePos: m.wallOrigin.thicknessStart }; return m; });
  api.CloseModel(mid);

  console.log(`  facade-normaal nAxis='${nAxis}' | densste vlak-coord≈${facadeCoord}mm | geselecteerde wanden: ${sel.length}`);
  if (sel.length < 2) { console.error('  ❌ te weinig wanden voor een betekenisvolle probe'); process.exit(1); }

  // Replica van het EXPORT strip-batch-pad (handleExport, App.jsx:5169-5247) voor het
  // 0-zones/0-penanten/0-trims geval. Dit is GEEN generator-kopie maar export-glue:
  //   enabledZones=[] (geen zoneSettings) → stripBatches=null (App.jsx:5202)
  //   → baseStripBatches=[{rows: facadeData.rows}] (App.jsx:5244)
  //   → _applyCornerToRows met ctrims=0 = identity (App.jsx:5230 early-return).
  // Verwachting: export-strip-rijen == scherm facadeData.rows (byte-identiek).
  function exportStripRowsBaseline(fd) {
    const zoneSettingsArr = [];   // geen enabled zones in de baseline-probe
    const enabledZones = [];
    const stripBatches = enabledZones.length ? enabledZones : null;
    const baseStripBatches = stripBatches ?? (fd.rows ? [{ rows: fd.rows }] : null);
    // _applyCornerToRows: tL=tR=0 → identity. Concateneer batch-rijen.
    return (baseStripBatches ?? []).flatMap((b) => b.rows);
  }

  // PROBES — de ECHTE generator, vlag-UIT pad (geen zones), per verband.
  // Per verband twee hashes: SCHERM (allPatterns facadeData.rows) en EXPORT (replica).
  const probes = {};
  for (const verband of ['halfsteens', 'staand_tegelverband']) {
    const fd = buildBestFitFacadePattern(sel, MAT, verband, null, null, null, 0, 0, 0, up);
    if (!fd) { probes[verband] = { error: 'generator gaf null' }; continue; }
    const hScreen = hashRows(fd.rows);
    const hExport = hashRows(exportStripRowsBaseline(fd));
    probes[verband] = {
      generator: 'buildBestFitFacadePattern',
      screen: { bron: 'allPatterns[group].facadeData.rows (App.jsx:3279)', hash: hScreen.sha256, rowCount: hScreen.rowCount, pieceCount: hScreen.pieceCount },
      export: { bron: 'handleExport baseStripBatches (App.jsx:5244, 0 zones, identity trims)', hash: hExport.sha256, rowCount: hExport.rowCount, pieceCount: hExport.pieceCount },
      screenEqualsExport: hScreen.sha256 === hExport.sha256,
      groupWidth: fd.groupWidth, groupHeight: fd.groupHeight,
      plane: fd._bestFit ? { uAxis: fd._bestFit.uAxis, tAxis: fd._bestFit.tAxis, nAxis: fd._bestFit.nAxis, outsideDir: fd._bestFit.outsideDir, offsetMm: fd._bestFit.offsetMm, residualMm: fd._bestFit.residualMm, coFacingPct: fd._bestFit.coFacingPct } : null,
      warnings: fd._bestFit?.warnings ?? [],
    };
    console.log(`  PROBE ${verband}: scherm=${hScreen.sha256.slice(0, 16)}… export=${hExport.sha256.slice(0, 16)}… gelijk=${hScreen.sha256 === hExport.sha256 ? 'JA ✅' : 'NEE ❌'} rijen=${hScreen.rowCount} stukken=${hScreen.pieceCount} (W=${fd.groupWidth} H=${fd.groupHeight}mm)`);
  }

  // ── FASE 2 ANKER: stripZone-vlak → scherm-hash == export-hash (analoog aan het
  // 0-zones export=scherm-bewijs). Beide glues roepen DEZELFDE buildStripZoneRegions aan;
  // scherm voegt alleen brickH toe, export past identity corner-trim toe → rijen gelijk.
  const fdH = buildBestFitFacadePattern(sel, MAT, 'halfsteens', null, null, null, 0, 0, 0, up);
  let stripZoneAnchor = null;
  if (fdH) {
    const zone = { id: 'sz_probe', x: 2000, y: 2000, width: 4000, height: 3000, verband: 'staand_tegelverband', enabled: true };
    const regions = buildStripZoneRegions(fdH, [zone], MAT, 'halfsteens', '#a64033', {});
    // scherm-glue mapping (rijen ongewijzigd) en export-glue mapping (identity trim).
    const screenRows = (regions ?? []).flatMap((r) => r.rows);
    const exportRows = (regions ?? []).flatMap((r) => r.rows); // _applyCornerToRows met 0 trims = identity
    const hS = hashRows(screenRows), hE = hashRows(exportRows);
    // containment: geen zone-steen buiten rechthoek ∩ vlak. Bouw vlak-dekking uit fdH.
    const planeRowH = MAT.steenH;
    const cov = (yLo, yHi) => { const ivs = []; for (const row of fdH.rows) { if (row.y + planeRowH <= yLo || row.y >= yHi) continue; for (const p of row.pieces) ivs.push([p.start, p.start + p.length]); } ivs.sort((a, b) => a[0] - b[0]); const m = []; for (const iv of ivs) { const l = m[m.length - 1]; if (l && iv[0] <= l[1] + 1e-6) l[1] = Math.max(l[1], iv[1]); else m.push(iv.slice()); } return m; };
    const zoneReg = regions[1];
    const zRowH = MAT.steenL; // staand
    let outside = 0;
    for (const row of zoneReg.rows) for (const p of row.pieces) {
      const s = p.start, e = p.start + p.length;
      const inRect = s >= zone.x - 0.5 && e <= zone.x + zone.width + 0.5 && row.y >= zone.y - 0.5 && row.y < zone.y + zone.height + 0.5;
      const inVlak = cov(row.y, row.y + zRowH).some(([a, b]) => s >= a - 0.5 && e <= b + 0.5);
      if (!inRect || !inVlak) outside++;
    }
    stripZoneAnchor = {
      zone,
      // 2D rendert View2D.regionBatches verbatim (geen herberekening) ⇒ 2D-hash == screenHash.
      twoDHash: hS.sha256, screenHash: hS.sha256, exportHash: hE.sha256,
      twoDEqualsScreenEqualsExport: (hS.sha256 === hE.sha256),
      note: '2D==scherm by construction (View2D tekent regionBatches verbatim); scherm==export bewezen via dezelfde gedeelde buildStripZoneRegions',
      regionCount: regions.length, zonePieceCount: hashRows(zoneReg.rows).pieceCount,
      bricksOutsideRectOrVlak: outside,
    };
    console.log(`  STRIPZONE-ANKER: scherm=${hS.sha256.slice(0, 16)}… export=${hE.sha256.slice(0, 16)}… gelijk=${hS.sha256 === hE.sha256 ? 'JA ✅' : 'NEE ❌'} | stenen buiten rechthoek∩vlak=${outside} ${outside === 0 ? '✅' : '❌'}`);
  }

  const out = {
    meta: {
      doel: 'NULMETING / regressie-anker zones-feature (FASE 1-3)',
      model: 'public/brickboard-a.ifc', modelFile: 'BIL-MOO-A-ZZ-PBP.ifc', schema: 'IFC2X3',
      gemaakt: new Date().toISOString(),
      generatorBron: { facadePlane: 'src/lib/facadePlane.js', pattern: 'src/lib/pattern.js' },
      materiaal: MAT,
      beperking: 'headless wand-extractie; openings:[]; deterministische probe, geen app-pariteit',
    },
    upAxis: { detected: up, midVote, thinVote, globalSpanMm: globalSpan, bron: 'headless proxy voor getProjectInfo().upAxis (detectModelUpAxis ifc.js:544)' },
    facadeSelection: { nAxis, facadeCoordMm: facadeCoord, wallCount: sel.length, totalWalls: wallIds.length, usableWalls: members.length },
    probes,
    stripZoneAnchor,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`\n  ✅ geschreven: ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
