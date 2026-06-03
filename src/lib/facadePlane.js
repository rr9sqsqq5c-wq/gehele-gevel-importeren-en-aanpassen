// facadePlane.js — v1: handmatige groep van losse elementen → één best-fit, uitgelijnd
// gevelvlak dat de CONTOUREN van de elementen volgt. Achter de feature-vlag
// `bestFitGroups` (zie featureFlags.js); alleen voor HANDMATIG aangemaakte groepen.
//
// Recept geport uit spike/validate/coplanar-meet.mjs + bestfit-spike.mjs:
//   1. up-as uit de SELECTIE (kleinste overall-extent), niet uit per-element zone-detectie.
//   2. best-fit vlak: dominante normaal-as + offset (mediaan van de buitenvlakken).
//   3. leden in dat vlak-frame als "virtuele wanden" → hergebruik buildFullGroupFacadePattern
//      (geen axisWalls-filter want alle virtuele wanden delen lengthAxis=tAxis).
//   4. CONTOUR-MASKER: knip de rijen tot de UNIE van element-footprints (geen omvattende
//      rechthoek); openingen al weggeknipt door buildFullGroupFacadePattern.
//   5. co-facing/residu-waarschuwing als normalen uiteenlopen of de diepte-spreiding
//      de tolerantie overschrijdt.
//
// v1-beperking: het vlak wordt op een globale as uitgelijnd (de bewezen BIL-casus is
// axis-aligned). Niet-axis-aligned (geroteerde) gevels → waarschuwing (axisAligned:false).

import { buildFullGroupFacadePattern } from './pattern.js';
import { getProjectInfo } from './projectCoordinates.js';

const UP_AX = ['x', 'y', 'z'];
const RESIDUAL_TOL_MM = 50;      // diepte-tolerantie (≤ enkele cm)
const COFACING_FRAC = 0.85;      // ≥85% van de leden moet dezelfde normaal-as delen
// Echte smalle constructievoegen (bv. dakrand-plaat ↔ HSB-wand, gemeten ~40–45 mm)
// HORIZONTAAL overbruggen zodat de strips doorlopen; echte openingen (raam/deur/entree,
// ≥ ~200 mm) blijven dankzij deze drempel altijd open. Tunable.
const SEAM_MERGE_TOL = 75;       // mm — max horizontaal gat tussen footprints dat we dichten

// Normaliseer de model-up-as (uit projectCoordinates / detectModelUpAxis) naar een
// wereld-as-letter. 'z_neg' deelt de wereld-z-as met 'z'.
function normalizeUpAxis(up) {
  if (up === 'y') return 'y';
  if (up === 'z' || up === 'z_neg') return 'z';
  if (up === 'x') return 'x';
  return null;
}

function reconstructAABB(wo) {
  const A = {};
  const put = (axis, lo, hi) => { A['min' + axis.toUpperCase()] = Math.min(lo, hi); A['max' + axis.toUpperCase()] = Math.max(lo, hi); };
  put(wo.lengthAxis, wo.lengthStart, wo.lengthEnd ?? wo.lengthStart);
  put(wo.heightAxis, wo.heightStart, wo.heightEnd ?? wo.heightStart);
  put(wo.thicknessAxis, wo.thicknessStart, wo.thicknessEnd ?? (wo.thicknessStart + 200));
  return A; // mm in wereld-assen
}
const extOf = (A, ax) => A['max' + ax.toUpperCase()] - A['min' + ax.toUpperCase()];

/**
 * Leid het best-fit gevelvlak af uit de selectie (alleen wallOrigin-data; geen mesh).
 * Robuust tegen verkeerde per-element up-as: we reconstrueren de wereld-AABB en
 * kiezen de up-/normaal-as uit de selectie zelf.
 */
export function fitFacadePlane(members, modelUpAxis = null) {
  const withO = members.filter(m => m.wallOrigin);
  if (withO.length < 1) return null;
  const aabbs = withO.map(m => ({ m, A: reconstructAABB(m.wallOrigin) }));

  const gMin = { x: Infinity, y: Infinity, z: Infinity }, gMax = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const { A } of aabbs) for (const ax of UP_AX) { gMin[ax] = Math.min(gMin[ax], A['min' + ax.toUpperCase()]); gMax[ax] = Math.max(gMax[ax], A['max' + ax.toUpperCase()]); }

  // normaal-as = per lid de DUNSTE as (gevelplaten/wanden zijn dun in de normaal);
  // dominante stem. Co-facing = één gedeelde normaal-as.
  const thinVote = { x: 0, y: 0, z: 0 };
  for (const { A } of aabbs) { const e = { x: extOf(A, 'x'), y: extOf(A, 'y'), z: extOf(A, 'z') }; thinVote[UP_AX.reduce((a, b) => e[a] <= e[b] ? a : b)]++; }
  const nAxis = UP_AX.reduce((a, b) => thinVote[a] >= thinVote[b] ? a : b);
  const coFacingFrac = thinVote[nAxis] / aabbs.length;
  const others = UP_AX.filter(a => a !== nAxis);
  const spanOf = (ax) => (gMax[ax] - gMin[ax]);

  // up-as = de ROBUUST afgeleide MODEL-up-as (uit projectcontext / detectModelUpAxis),
  // NIET geraden uit extents. De oude extent-heuristiek ("gevel breder dan hoog")
  // wisselde uAxis/tAxis om bij een hoger-dan-brede selectie → verticaal verband.
  const warnings = [];
  const upWorld = normalizeUpAxis(modelUpAxis);
  let uAxis, tAxis;
  if (upWorld && others.includes(upWorld)) {
    // normale gevel: model-up valt in het vlak → die is de up-as.
    uAxis = upWorld;
    tAxis = others[0] === uAxis ? others[1] : others[0];
  } else if (upWorld && upWorld === nAxis) {
    // Guard (i): vlak-normaal ≈ model-up-as → bijna-horizontaal vlak (dak/vloer),
    // geen verticale gevel. NIET raden: waarschuw, val gedegradeerd terug op extents.
    warnings.push(`Vlak-normaal (${nAxis}) valt samen met de model-up-as (${upWorld}): de selectie vormt een bijna-horizontaal vlak, geen verticale gevel — verband-oriëntatie is onbepaald.`);
    uAxis = spanOf(others[0]) <= spanOf(others[1]) ? others[0] : others[1];
    tAxis = others[0] === uAxis ? others[1] : others[0];
  } else {
    // Geen betrouwbare model-up-as bekend → val terug op extents + waarschuw.
    warnings.push(`Geen model-up-as beschikbaar; up-as geschat uit extents (kan misgaan bij een hoger-dan-brede selectie).`);
    uAxis = spanOf(others[0]) <= spanOf(others[1]) ? others[0] : others[1];
    tAxis = others[0] === uAxis ? others[1] : others[0];
  }

  // Guard (ii): leden uit frames met verschillende up-assen → waarschuw (consistent
  // met de co-facing/frame-guard). Per-lid frame-up komt mee als wallOrigin.frameUpAxis
  // (multi-model); afwezig → één frame, geen waarschuwing.
  const frameUps = new Set(withO.map(m => normalizeUpAxis(m.wallOrigin?.frameUpAxis)).filter(Boolean));
  if (upWorld) frameUps.forEach(f => { if (f !== upWorld) frameUps.add('__mismatch__'); });
  if (frameUps.size > 1 || frameUps.has('__mismatch__')) {
    warnings.push(`Selectie mengt leden uit frames met verschillende up-assen — best-fit vlak kan onbetrouwbaar zijn.`);
  }

  // outward-richting langs nAxis: meerderheid van resolvedOutside (indien thicknessAxis===nAxis), anders heuristiek
  let dirVote = 0;
  for (const { m } of aabbs) {
    const wo = m.wallOrigin; const ro = wo.resolvedOutside;
    if (ro && ro.outsideDir != null && wo.thicknessAxis === nAxis) dirVote += (ro.outsideDir < 0 ? -1 : 1);
  }
  // fallback: t.o.v. het midden van de selectie langs nAxis (buitenste = verste van midden)
  if (dirVote === 0) {
    const mid = (gMin[nAxis] + gMax[nAxis]) / 2;
    for (const { A } of aabbs) { const c = (A['min' + nAxis.toUpperCase()] + A['max' + nAxis.toUpperCase()]) / 2; dirVote += (c >= mid ? 1 : -1); }
  }
  const outsideDir = dirVote >= 0 ? 1 : -1;

  // best-fit offset = mediaan van de BUITENvlakken; residu = spreiding
  const faces = aabbs.map(({ A }) => outsideDir < 0 ? A['min' + nAxis.toUpperCase()] : A['max' + nAxis.toUpperCase()]).sort((a, b) => a - b);
  const offset = faces[Math.floor(faces.length / 2)];
  const residualMm = Math.round(Math.max(...faces.map(f => Math.abs(f - offset))));

  if (coFacingFrac < COFACING_FRAC) warnings.push(`Niet co-facing: slechts ${Math.round(coFacingFrac * 100)}% van de leden deelt dezelfde normaal-as (${nAxis}). Selectie bevat mogelijk meerdere gevelrichtingen.`);
  if (residualMm > RESIDUAL_TOL_MM) warnings.push(`Diepte-spreiding ${residualMm} mm > tolerantie ${RESIDUAL_TOL_MM} mm — leden liggen niet op één vlak.`);

  return { uAxis, tAxis, nAxis, outsideDir, offset, residualMm, coFacingFrac, axisAligned: true, warnings, aabbs };
}

// opening uit member-frame → wereld-as-intervallen → virtueel (tAxis,uAxis)-frame
function reprojectOpening(op, wo, plane, vLenStart, vHgtStart) {
  const lo = {}, hi = {};
  const put = (axis, a, b) => { lo[axis] = Math.min(a, b); hi[axis] = Math.max(a, b); };
  put(wo.lengthAxis, wo.lengthStart + (op.x ?? 0), wo.lengthStart + (op.x ?? 0) + (op.breedte ?? op.width ?? 0));
  put(wo.heightAxis, wo.heightStart + (op.y ?? 0), wo.heightStart + (op.y ?? 0) + (op.hoogte ?? op.height ?? 0));
  put(wo.thicknessAxis, wo.thicknessStart, wo.thicknessEnd ?? wo.thicknessStart);
  return {
    id: op.id, type: op.type ?? 'sparing',
    x: Math.round(lo[plane.tAxis] - vLenStart), y: Math.round(lo[plane.uAxis] - vHgtStart),
    breedte: Math.round(hi[plane.tAxis] - lo[plane.tAxis]), hoogte: Math.round(hi[plane.uAxis] - lo[plane.uAxis]),
    polyPts: null, thicknessCenter: op.thicknessCenter ?? null,
  };
}

function toVirtualWall(member, plane) {
  const wo = member.wallOrigin; const A = reconstructAABB(wo);
  const lengthStart = A['min' + plane.tAxis.toUpperCase()], lengthEnd = A['max' + plane.tAxis.toUpperCase()];
  const heightStart = A['min' + plane.uAxis.toUpperCase()], heightEnd = A['max' + plane.uAxis.toUpperCase()];
  const ld = { x: 0, y: 0, z: 0 }; ld[plane.tAxis] = 1; // lengte-richting = tAxis
  const vwo = {
    globalId: wo.globalId ?? null,
    lengthAxis: plane.tAxis, heightAxis: plane.uAxis, thicknessAxis: plane.nAxis,
    lengthStart, lengthEnd, heightStart, heightEnd,
    thicknessStart: plane.offset, thicknessEnd: plane.offset + plane.outsideDir * 1,
    wallLengthDir: ld, wallInsideThickDir: -plane.outsideDir,
    matLayerSense: null, matLayerSetDir: null, matOffsetMm: 0, spaceBoundaryType: null,
    resolvedOutside: { outsideDir: plane.outsideDir, outsidePos: plane.offset, source: 'bestfit', confidence: 0.9, ambiguous: false, reason: 'best-fit groepsvlak' },
  };
  const openings = (member.openings ?? []).map(op => reprojectOpening(op, wo, plane, lengthStart, heightStart));
  return {
    expressID: member.expressID, name: member.name, length: Math.round(lengthEnd - lengthStart),
    height: Math.round(heightEnd - heightStart), openings, wallOrigin: vwo,
    facadePoly: null, typeName: member.typeName ?? null, storeyID: member.storeyID ?? null,
  };
}

// CONTOUR-MASKER: knip elke rij tot de unie van element-rechthoeken (relatief t.o.v.
// groupMinX/groupMinH); zo blijft alles buiten een element ONbekleed.
function maskRowsToContours(rows, vwalls, groupMinX, groupMinH, rowH) {
  const rects = vwalls.map(w => ({
    t0: (w.wallOrigin.lengthStart) - groupMinX, t1: (w.wallOrigin.lengthEnd) - groupMinX,
    u0: (w.wallOrigin.heightStart) - groupMinH, u1: (w.wallOrigin.heightEnd) - groupMinH,
  }));
  const out = [];
  for (const row of rows) {
    const y = row.y;
    // actieve element-intervallen op deze hoogte
    const ivs = rects.filter(r => r.u0 <= y + rowH + 0.5 && r.u1 >= y - 0.5).map(r => [r.t0, r.t1]).sort((a, b) => a[0] - b[0]);
    if (!ivs.length) continue;
    // HORIZONTAAL samenvoegen: overlap én echte smalle voegen (gat ≤ SEAM_MERGE_TOL).
    // Een echte opening (≥ ~200 mm) overschrijdt de drempel en blijft dus open.
    const merged = [ivs[0].slice()];
    for (let i = 1; i < ivs.length; i++) { const last = merged[merged.length - 1]; if (ivs[i][0] <= last[1] + SEAM_MERGE_TOL) last[1] = Math.max(last[1], ivs[i][1]); else merged.push(ivs[i].slice()); }
    const pieces = [];
    for (const p of row.pieces) {
      const ps = p.start, pe = p.start + p.length;
      for (const [a, b] of merged) {
        const s = Math.max(ps, a), e = Math.min(pe, b);
        if (e - s > 0.5) pieces.push({ ...p, start: Math.round(s * 100) / 100, length: Math.round((e - s) * 100) / 100 });
      }
    }
    if (pieces.length) out.push({ y, pieces });
  }
  return out;
}

/**
 * Drop-in vervanger voor buildFullGroupFacadePattern voor HANDMATIGE groepen onder de
 * vlag. Zelfde returnvorm (rows/groupMinX/.../refWallOrigin) zodat de bestaande
 * batch-/render-pijplijn ongewijzigd werkt — plus `_bestFit` diagnostiek.
 */
export function buildBestFitFacadePattern(walls, material, verband, maxHoogte, zetwerk, _minHoogte, startLijn, extendLeft = 0, extendRight = 0, modelUpAxis = undefined) {
  const members = (walls ?? []).filter(w => w.wallOrigin);
  if (!members.length) return null;
  // Model-up-as uit de projectcontext (robuust, dezelfde lijn als detectModelUpAxis).
  // Expliciete override (headless tests) gaat voor; anders de geregistreerde context.
  const upAxis = modelUpAxis !== undefined ? modelUpAxis : (getProjectInfo()?.upAxis ?? null);
  const plane = fitFacadePlane(members, upAxis);
  if (!plane) return null;
  const vwalls = members.map(m => toVirtualWall(m, plane));
  const fd = buildFullGroupFacadePattern(vwalls, material, verband, maxHoogte, zetwerk, _minHoogte, startLijn, extendLeft, extendRight);
  if (!fd) return null;
  const rowH = verband === 'staand_tegelverband' ? (material.steenL ?? material.steenH ?? 50) : (material.steenH ?? 50);
  fd.rows = maskRowsToContours(fd.rows, vwalls, fd.groupMinX, fd.groupMinH, rowH);
  fd._bestFit = {
    uAxis: plane.uAxis, tAxis: plane.tAxis, nAxis: plane.nAxis, outsideDir: plane.outsideDir,
    offsetMm: plane.offset, residualMm: plane.residualMm, coFacingPct: Math.round(plane.coFacingFrac * 100),
    warnings: plane.warnings, memberCount: members.length,
  };
  if (plane.warnings.length) console.warn('[best-fit gevelvlak] waarschuwing:', plane.warnings.join(' '));
  return fd;
}
