// zoneRegions.js — FASE 2. ÉÉN gedeelde stripZone-regio-functie, aangeroepen vanuit
// zowel de scherm-glue (allPatterns) als de export-glue (handleExport). Nooit twee
// bedradingen. Achter de vlag featureZones (zie featureFlags.js); de callers gaten op
// isFeatureZones() && !hasPenants(s) && getActiveStripZones(s).length > 0.
//
// Model (oorzaak, geen special-case): regions = stripZones (tekenvolgorde) + complement.
//   complement = vlak − unie(zones)  (de default-bond facadeData.rows, zones eruit geknipt)
//   per zone   = eigen bond + EIGEN ANKER (zone-lokaal), geklipt op
//                rechthoek ∩ vlak − openingen − hogere zones (z-order = tekenvolgorde).
// Alles in het best-fit UV-frame van facadeData (zone.x/y/width/height zijn in dezelfde
// coördinaten als facadeData.rows; zo tekent de 2D-editor in datzelfde frame).
//
// "vlak − openingen" hoeven we niet apart te berekenen: facadeData.rows ZIJN al de
// contour-/openings-gemaskeerde default-bond-dekking. We snijden zones daartegen.

import { buildFacePattern } from './pattern.js';

function round2(v) { return Math.round(v * 100) / 100; }

// ── één bron voor de penant-/stripZone-predicaten ──
// Een vlak is een "penant-vlak" zodra het >=1 penant of >=1 ENABLED zoneSetting heeft.
export function hasPenants(s) {
  if (!s) return false;
  if ((s.penanten?.length ?? 0) > 0) return true;
  return (s.zoneSettings ?? []).some((z) => z?.enabled === true);
}

// Actieve stripZones = expliciet enabled. Auto-gegenereerde zones (zonder enabled-veld)
// zijn inert → tellen niet mee → 0 actieve zones ⇒ nulmeting.
export function getActiveStripZones(s) {
  return (s?.stripZones ?? []).filter((z) => z?.enabled === true);
}

function bondRowH(verband, mat) {
  return verband === 'staand_tegelverband' ? (mat.steenL ?? mat.steenH ?? 50) : (mat.steenH ?? 50);
}

// ── interval-algebra op [start,end]-paren ──
function mergeIntervals(ivs) {
  if (!ivs.length) return [];
  const s = [...ivs].sort((a, b) => a[0] - b[0]);
  const out = [s[0].slice()];
  for (let i = 1; i < s.length; i++) {
    const last = out[out.length - 1];
    if (s[i][0] <= last[1] + 1e-6) last[1] = Math.max(last[1], s[i][1]);
    else out.push(s[i].slice());
  }
  return out;
}
function subtractInterval(parts, a, b) {
  const out = [];
  for (const [s, e] of parts) {
    if (e <= a + 1e-6 || s >= b - 1e-6) { out.push([s, e]); continue; }
    if (s < a - 1e-6) out.push([s, a]);
    if (e > b + 1e-6) out.push([b, e]);
  }
  return out;
}
function intersectInterval(parts, a, b) {
  const out = [];
  for (const [s, e] of parts) {
    const cs = Math.max(s, a), ce = Math.min(e, b);
    if (ce - cs > 1e-6) out.push([cs, ce]);
  }
  return out;
}

// dekking van het vlak (vlak − openingen) over de hoogte-span [yLo,yHi]: unie van de
// x-intervallen van facadeData-rijen waarvan de laag [row.y, row.y+planeRowH] de span raakt.
function planeCoverageForSpan(facadeData, yLo, yHi, planeRowH) {
  const ivs = [];
  for (const row of (facadeData.rows ?? [])) {
    if (row.y + planeRowH <= yLo + 1e-6 || row.y >= yHi - 1e-6) continue;
    for (const p of row.pieces) ivs.push([p.start, p.start + p.length]);
  }
  return mergeIntervals(ivs);
}

/**
 * @param facadeData   best-fit/plane-frame data: { rows:[{y,pieces:[{start,length,label}]}], groupWidth, groupHeight }
 * @param stripZones   rauwe zone-array uit settings (we filteren zelf op enabled)
 * @param mat          BASIS-materiaal van de groep (NIET stripArt-aangepast; stripArt komt via opts)
 * @param defaultVerband  groep-default verband (voor het complement)
 * @param defaultColor    groep-default kleur (voor het complement)
 * @param opts         { stripArt }  optioneel steenstrip-artikel (overschrijft steenL/steenH, net als penant-zones)
 * @returns regions: [{ rows, material, color, verband }]  (complement eerst, dan zones in tekenvolgorde)
 *          of null als er geen actieve zones zijn (caller gebruikt dan facadeData.rows = nulmeting).
 */
export function buildStripZoneRegions(facadeData, stripZones, mat, defaultVerband, defaultColor, opts = {}) {
  if (!facadeData?.rows) return null;
  const active = (stripZones ?? []).filter((z) => z?.enabled === true);
  if (!active.length) return null;

  const stripArt = opts.stripArt ?? null;
  const applyArt = (m) => stripArt ? { ...m, steenL: stripArt.steenL, steenH: stripArt.steenH } : m;
  const baseMat = applyArt(mat);
  const planeRowH = bondRowH(defaultVerband, baseMat);

  const zRect = (z) => ({ x0: z.x ?? 0, y0: z.y ?? 0, x1: (z.x ?? 0) + (z.width ?? 0), y1: (z.y ?? 0) + (z.height ?? 0) });
  const rects = active.map(zRect);

  // ── complement = facadeData.rows − unie(zone-rechthoeken) ──
  const complementRows = [];
  for (const row of facadeData.rows) {
    const yLo = row.y, yHi = row.y + planeRowH;
    const outPieces = [];
    for (const p of row.pieces) {
      let parts = [[p.start, p.start + p.length]];
      for (const r of rects) {
        if (r.y1 <= yLo + 1e-6 || r.y0 >= yHi - 1e-6) continue; // zone raakt deze laag niet
        parts = subtractInterval(parts, r.x0, r.x1);
      }
      for (const [s, e] of parts) outPieces.push({ ...p, start: round2(s), length: round2(e - s) });
    }
    if (outPieces.length) complementRows.push({ y: row.y, pieces: outPieces });
  }

  const regions = [{ rows: complementRows, material: baseMat, color: defaultColor, verband: defaultVerband }];

  // ── per zone: eigen bond + eigen anker, geklipt op rechthoek ∩ vlak − openingen − hogere zones ──
  active.forEach((zone, i) => {
    const r = rects[i];
    const zoneVerband = zone.verband ?? defaultVerband;
    const zoneMatBase = { ...mat, ...(zone.material ?? {}) };
    const zoneMat = applyArt(zoneMatBase);
    const zoneColor = zone.color ?? defaultColor;
    const zRowH = bondRowH(zoneVerband, zoneMat);
    const zW = r.x1 - r.x0, zH = r.y1 - r.y0;
    if (zW <= 0 || zH <= 0) { regions.push({ rows: [], material: zoneMat, color: zoneColor, verband: zoneVerband }); return; }

    // ANKER (eigenschap-vooraf):
    //  'zoneBottomLeft' (default) → eigen anker, bond start in de linksonder-hoek van de zone.
    //  'planeOrigin'              → bond uitgelijnd op de vlak-oorsprong (0,0), zoals het default-verband.
    const anchor = zone.bondAnchor ?? 'zoneBottomLeft';
    const absRows = anchor === 'planeOrigin'
      ? buildFacePattern(r.x1, r.y1, zoneMat, zoneVerband, 0) // abs coords, op vlak-oorsprong
      : buildFacePattern(zW, zH, zoneMat, zoneVerband, 0).map((row) => ({
          y: row.y + r.y0,
          pieces: row.pieces.map((p) => ({ ...p, start: p.start + r.x0 })),
        }));
    const higherRects = rects.slice(i + 1); // latere zones = hogere z-order

    const clippedRows = [];
    for (const lr of absRows) {
      const y = round2(lr.y);
      if (y >= r.y1 - 1e-6 || y < r.y0 - 1e-6) continue; // ∩ rechthoek (Y)
      const yLo = y, yHi = y + zRowH;
      const cov = planeCoverageForSpan(facadeData, yLo, yHi, planeRowH); // vlak − openingen
      const pieces = [];
      for (const p of lr.pieces) {
        const s0 = round2(p.start), e0 = round2(s0 + p.length);
        let parts = intersectInterval([[s0, e0]], r.x0, r.x1); // ∩ rechthoek (X)
        parts = parts.flatMap(([s, e]) => intersectInterval(cov, s, e)); // ∩ vlak − openingen
        for (const hr of higherRects) {           // − hogere zones (z-order)
          if (hr.y1 <= yLo + 1e-6 || hr.y0 >= yHi - 1e-6) continue;
          parts = parts.flatMap(([s, e]) => subtractInterval([[s, e]], hr.x0, hr.x1));
        }
        for (const [s, e] of parts) if (e - s > 0.5) pieces.push({ ...p, start: round2(s), length: round2(e - s) });
      }
      if (pieces.length) clippedRows.push({ y, pieces });
    }
    regions.push({ rows: clippedRows, material: zoneMat, color: zoneColor, verband: zoneVerband });
  });

  return regions;
}
