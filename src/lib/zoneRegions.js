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
import { buildTruthRows } from './wildverbandKoppelstrip.js';
import { isWildverbandKoppelstrip } from './featureFlags.js';

function round2(v) { return Math.round(v * 100) / 100; }

// Bond-rijen voor een zone-rechthoek (w×h, oorsprong 0). Wildverband → het vastgelegde
// truth-verband (zelfde bron als de hoofdgroep, Fase 2) i.p.v. de tegelverband-degradatie
// in buildFacePattern. Vlag UIT of ander verband → buildFacePattern (byte-identiek).
function buildZoneBondRows(w, h, mat, verband) {
  if (verband === 'wildverband' && isWildverbandKoppelstrip()) {
    return buildTruthRows(w, h, mat, []).rows;
  }
  return buildFacePattern(w, h, mat, verband, 0);
}

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

// VENTILATIE_ZONE — het LOODRECHTE verband t.o.v. een gegeven groep-verband. De enige verticale
// bond in de engine is 'staand_tegelverband'; al het andere is horizontaal. Dus: staand ↔ halfsteens.
export function perpVerband(v) {
  return v === 'staand_tegelverband' ? 'halfsteens' : 'staand_tegelverband';
}

// VENTILATIE_ZONE — genereer per gedetecteerde 'ventilatie'-opening in facadeData.groupOpenings een
// (ephemere) stripZone met het LOODRECHTE verband. De ZONE-MAAT wordt BEREKEND uit het verband (niet
// instelbaar); de zone is het gat in de bestaande strippen waarin op-lengte-gesneden loodrechte
// strippen komen. Het echte ventilatiegat (kleiner) wordt apart uit de zone geknipt (via de opening
// in facadeData.rows) en panelen/latten sparen op datzelfde gat.
//
// HORIZONTAAL groep-verband → zone VERTICAAL (staand):
//   breedte = HEEL aantal verticale strippen dat de gatbreedte dekt: n = ⌈(opW+stoot)/(steenH+stoot)⌉,
//             breedte = n×steenH + (n-1)×stoot (geen rest-sliver; de bond start op x=0 → hele tegels).
//   hoogte  = 3×steenH + 2×lint  = van de ONDERKANT van de eerste gesnapte strip tot de BOVENKANT van
//             de tweede strip DAARBOVEN (= 3 lagen, de rode lijn). Verticaal GESNAPT op de rijen rond
//             het gat (middenlaag = rij met het gat-midden).
// VERTICAAL groep-verband → zone HORIZONTAAL (gespiegeld, aanname):
//   hoogte  = m×steenH + (m-1)×lint (m = ⌈(opH+lint)/(steenH+lint)⌉);  breedte = 3×steenL + 2×stoot.
// steenH=striphoogte, steenL=striplengte, stoot/lint = geldende voegen. enabled:true; kind:'ventilation'.
export function ventilationZonesFor(facadeData, settings, groupVerband, mat) {
  if (!settings?.ventilatie?.enabled) return [];
  const vents = (facadeData?.groupOpenings ?? []).filter((o) => o?.type === 'ventilatie');
  if (!vents.length) return [];
  const steenH = mat?.steenH ?? 50, steenL = mat?.steenL ?? 210, stoot = mat?.stoot ?? 10, lint = mat?.lint ?? 12;
  const groupHorizontal = groupVerband !== 'staand_tegelverband';
  const perp = perpVerband(groupVerband);
  const courseH = steenH + lint; // laaghoogte omringend horizontaal verband
  const rows = facadeData?.rows ?? [];
  return vents.map((v, i) => {
    const opW = v.width ?? 0, opH = v.height ?? 0;
    const cx = (v.x ?? 0) + opW / 2, cy = (v.y ?? 0) + opH / 2;
    let W, H, x, y;
    if (groupHorizontal) {
      const n = Math.max(1, Math.ceil((opW + stoot) / (steenH + stoot))); // heel aantal kolommen
      W = n * steenH + (n - 1) * stoot;                                     // n hele verticale strippen
      H = 3 * steenH + 2 * lint;                                            // 3 lagen (rode lijn)
      x = cx - W / 2;
      // verticale snap: middenlaag = rij met het gat-midden → zone = die rij ± 1 laag
      const midRow = rows.filter((r) => r.y <= cy).sort((a, b) => b.y - a.y)[0];
      y = midRow ? (midRow.y - courseH) : (cy - H / 2);
    } else {
      const m = Math.max(1, Math.ceil((opH + lint) / (steenH + lint)));
      H = m * steenH + (m - 1) * lint;
      W = 3 * steenL + 2 * stoot;
      x = cx - W / 2; y = cy - H / 2;
    }
    return {
      id: `vent_${v.id ?? i}`, kind: 'ventilation', label: 'Ventilatie',
      x: round2(x), y: round2(y), width: round2(W), height: round2(H),
      verband: perp, bondAnchor: 'zoneBottomLeft', enabled: true,
      clearMargin: { x: stoot, y: lint }, // voeg rondom de zone: stoot zij, lint boven/onder
      // verticale strippen OP LENGTE gesneden = zone-hoogte (steenL = H → 1 rij die de zone vult,
      // niet 210 mm die boven de zone uitsteekt). Alleen bij horizontale groep (staande zone).
      material: groupHorizontal ? { steenL: H } : undefined,
    };
  });
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

  // EFFECTIEVE rechthoek: maxHoogte clipt de zone verticaal vanaf de ONDERKANT (y0).
  // y1 = y0 + min(height, maxHoogte). Door de effectieve rect overal te gebruiken
  // (complement-aftrek, zone-Y-clip, z-order) valt de strook BOVEN maxHoogte binnen de
  // getekende rechthoek terug op het default-verband (complement) i.p.v. een blanco gat.
  const zRect = (z) => {
    const y0 = z.y ?? 0;
    const h = z.height ?? 0;
    const eff = (z.maxHoogte != null && z.maxHoogte > 0) ? Math.min(h, z.maxHoogte) : h;
    return { x0: z.x ?? 0, y0, x1: (z.x ?? 0) + (z.width ?? 0), y1: y0 + eff };
  };
  const rects = active.map(zRect);
  // VENTILATIE_ZONE: clearRect = fill-rect + voegmarge (z.clearMargin {x:stoot, y:lint}). De omringende
  // strippen worden tot clearRect weggeknipt → een voeg RONDOM de zone; de zone zelf VULT de (kleinere)
  // fill-rect. Zonder clearMargin (handmatige zones) → clearRect == zRect → byte-identiek.
  const clearRect = (z) => { const r = zRect(z); const mx = Math.max(0, z.clearMargin?.x ?? 0), my = Math.max(0, z.clearMargin?.y ?? 0); return { x0: r.x0 - mx, y0: r.y0 - my, x1: r.x1 + mx, y1: r.y1 + my }; };
  const clears = active.map(clearRect);

  // ── complement = facadeData.rows − unie(zone-rechthoeken + voegmarge) ──
  const complementRows = [];
  for (const row of facadeData.rows) {
    const yLo = row.y, yHi = row.y + planeRowH;
    const outPieces = [];
    for (const p of row.pieces) {
      let parts = [[p.start, p.start + p.length]];
      for (const r of clears) {
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
    // Eigen steenstrip-artikel per zone (de UI heeft zone.material al op die maten gezet)
    // overschrijft de groep-stripArt; zonder eigen artikel volgt de zone de groep (applyArt).
    const zoneMat = zone.steenstripArtikelId ? zoneMatBase : applyArt(zoneMatBase);
    const zoneColor = zone.color ?? defaultColor;
    const zRowH = bondRowH(zoneVerband, zoneMat);
    const zW = r.x1 - r.x0, zH = r.y1 - r.y0;
    if (zW <= 0 || zH <= 0) { regions.push({ rows: [], material: zoneMat, color: zoneColor, verband: zoneVerband }); return; }

    // ANKER (eigenschap-vooraf):
    //  'zoneBottomLeft' (default) → eigen anker, bond start in de linksonder-hoek van de zone.
    //  'planeOrigin'              → bond uitgelijnd op de vlak-oorsprong (0,0), zoals het default-verband.
    const anchor = zone.bondAnchor ?? 'zoneBottomLeft';
    const absRows = anchor === 'planeOrigin'
      ? buildZoneBondRows(r.x1, r.y1, zoneMat, zoneVerband) // abs coords, op vlak-oorsprong
      : buildZoneBondRows(zW, zH, zoneMat, zoneVerband).map((row) => ({
          y: row.y + r.y0,
          pieces: row.pieces.map((p) => ({ ...p, start: p.start + r.x0 })),
        }));
    const higherRects = clears.slice(i + 1); // latere zones = hogere z-order (incl. hun voegmarge)

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
