import { isStripSnijlijn } from './featureFlags.js';

// sparingElements.js — geïmporteerde NIET-wand IFC-onderdelen (leidingen/kanalen/proxies) op het
// vlak van een gevelgroep projecteren en de steenstripbekleding er rondom wegknippen (met offset).
// Pure functies (geen web-ifc / geen DOM) → los testbaar. Achter vlag `sparingElementen` (default UIT).
//
// Datavormen:
//   element.bbox = { minX,maxX, minY,maxY, minZ,maxZ }  (wereld-IFC mm, zelfde frame als wall.wallOrigin)
//   groupFrame   = { lengthAxis,heightAxis,thicknessAxis, groupMinX,groupMinH, groupWidth,groupHeight,
//                    thickMin,thickMax }
//     lengthAxis/heightAxis/thicknessAxis ∈ {'x','y','z'} (axis-aligned gevel — de bewezen casus).
//     groupMinX/groupMinH = wereld-minimum langs lengte-/hoogte-as (== nulpunt van de groep-lokale rijen).
//     thickMin/thickMax   = dikte-bereik van de groep(-wanden) langs de thicknessAxis (voor de diepte-check).

const lo = (bbox, ax) => bbox['min' + ax.toUpperCase()];
const hi = (bbox, ax) => bbox['max' + ax.toUpperCase()];

// Projecteer één element-bbox op de groep → sparing-rechthoek {x,y,width,height} in groep-lokale
// coördinaten (0 = groupMinX/H), met `offset` mm marge rondom elke zijde. Retourneert null als het
// element buiten het gevelvlak-dikte-bereik (± depthTol) valt of z'n footprint de gevel niet raakt.
export function projectElementToGroupRect(bbox, groupFrame, offset = 0, depthTol = 300) {
  const { lengthAxis, heightAxis, thicknessAxis, groupMinX, groupMinH, groupWidth, groupHeight, thickMin, thickMax } = groupFrame;
  // Diepte-check: valt het element (± tolerantie) op/vóór/achter het gevelvlak van deze groep?
  if (thickMin != null && thickMax != null) {
    const t0 = lo(bbox, thicknessAxis), t1 = hi(bbox, thicknessAxis);
    if (t1 < thickMin - depthTol || t0 > thickMax + depthTol) return null;
  }
  // Onderdeel-rechthoek (bbox geprojecteerd, ZONDER offset) in groep-lokale coördinaten.
  const ex = lo(bbox, lengthAxis) - groupMinX;
  const ey = lo(bbox, heightAxis) - groupMinH;
  const ew = hi(bbox, lengthAxis) - lo(bbox, lengthAxis);
  const eh = hi(bbox, heightAxis) - lo(bbox, heightAxis);
  // Sparing-gat = onderdeel + offset rondom.
  const x = ex - offset, y = ey - offset, width = ew + 2 * offset, height = eh + 2 * offset;
  // Footprint moet de gevel-extent [0,groupWidth]×[0,groupHeight] overlappen.
  if (x + width <= 0 || x >= groupWidth || y + height <= 0 || y >= groupHeight) return null;
  const r = (v) => Math.round(v * 10) / 10;
  return {
    x: r(x), y: r(y), width: r(width), height: r(height), offset,
    element: { x: r(ex), y: r(ey), width: r(ew), height: r(eh) },
  };
}

// Bereken voor alle elementen de sparing-rechthoeken voor één groep (filtert de niet-rakende weg).
export function sparingRectsForGroup(elements, groupFrame, offset = 0, depthTol = 300) {
  const rects = [];
  for (const el of (elements ?? [])) {
    if (!el?.bbox) continue;
    const r = projectElementToGroupRect(el.bbox, groupFrame, offset, depthTol);
    if (r) rects.push({ ...r, expressID: el.expressID });
  }
  return rects;
}

// Gemak-helper: leidt de sparing-rechthoeken af uit een facadeData (gebruikt z'n refWallOrigin +
// dimensies als groupFrame). Zo delen App (scherm/export), Werktekening én Uittrekstaat één bron —
// elk in hun EIGEN facadeData-frame, dus geen frame-mismatch. Geen elementen/refWallOrigin → [].
export function sparingRectsForFacade(facadeData, elements, offset = 0, depthTol = 300) {
  const rwo = facadeData?.refWallOrigin;
  if (!rwo || !elements?.length) return [];
  const tS = rwo.thicknessStart, tE = rwo.thicknessEnd;
  const gf = {
    lengthAxis: rwo.lengthAxis, heightAxis: rwo.heightAxis, thicknessAxis: rwo.thicknessAxis,
    groupMinX: facadeData.groupMinX, groupMinH: facadeData.groupMinH,
    groupWidth: facadeData.groupWidth, groupHeight: facadeData.groupHeight,
    thickMin: (Number.isFinite(tS) && Number.isFinite(tE)) ? Math.min(tS, tE) : null,
    thickMax: (Number.isFinite(tS) && Number.isFinite(tE)) ? Math.max(tS, tE) : null,
  };
  return sparingRectsForGroup(elements, gf, offset, depthTol);
}

// Knip de sparing-rechthoeken uit de rijen (post-processing op facadeData.rows). Elk stuk metselwerk
// dat op z'n rijhoogte binnen een sparing-rechthoek valt, wordt op de rand afgesneden (net als een
// raam/deur-opening). rowH = steenstrip-hoogte (verband-afhankelijk). Retourneert NIEUWE rows.
const _s2 = (n) => Math.round(n * 100) / 100;
// STRIP_SNIJLIJN — 2D-rechthoek-aftrek: sub-rect s minus [rx0,rx1]×[ry0,ry1] → resterende sub-rects.
// Links/rechts blijven vol hoog; onder/boven worden op de WERKELIJKE opening/sparing-rand gesneden.
function _subtractRect(s, rx0, rx1, ry0, ry1) {
  if (rx1 <= s.x0 + 0.01 || rx0 >= s.x1 - 0.01 || ry1 <= s.y0 + 0.01 || ry0 >= s.y1 - 0.01) return [s];
  const out = [];
  if (s.x0 < rx0 - 0.01) out.push({ x0: s.x0, x1: rx0, y0: s.y0, y1: s.y1 });   // links (vol hoog)
  if (s.x1 > rx1 + 0.01) out.push({ x0: rx1, x1: s.x1, y0: s.y0, y1: s.y1 });   // rechts (vol hoog)
  const mx0 = Math.max(s.x0, rx0), mx1 = Math.min(s.x1, rx1);
  if (s.y0 < ry0 - 0.01) out.push({ x0: mx0, x1: mx1, y0: s.y0, y1: ry0 });     // onder (gesneden op rand)
  if (s.y1 > ry1 + 0.01) out.push({ x0: mx0, x1: mx1, y0: ry1, y1: s.y1 });     // boven (gesneden op rand)
  return out;
}
// STRIP_SNIJLIJN: knip rond de rects met een 2D-snede → een steen die de rand kruist blijft als DEEL-steen
// staan (tot de rand), met yBot/yTop op het stuk boven/onder de rand. Rest van de rij ongemoeid.
function _clipRowsYCut(rows, rects, rowH) {
  const out = [];
  for (const row of rows) {
    const ry0 = row.y, ry1 = row.y + rowH;
    const overlap = rects.filter((r) => r.y + r.height > ry0 && r.y < ry1);
    if (!overlap.length) { out.push(row); continue; }
    const pieces = [];
    for (const p of row.pieces) {
      let subs = [{ x0: p.start, x1: p.start + p.length, y0: ry0, y1: ry1 }];
      for (const r of overlap) subs = subs.flatMap((s) => _subtractRect(s, r.x, r.x + r.width, r.y, r.y + r.height));
      for (const s of subs) {
        if (s.x1 - s.x0 <= 1 || s.y1 - s.y0 <= 0.5) continue;
        const piece = { ...p, start: _s2(s.x0), length: _s2(s.x1 - s.x0) };
        if (s.y0 > ry0 + 0.5 || s.y1 < ry1 - 0.5) { piece.yBot = _s2(s.y0); piece.yTop = _s2(s.y1); }  // deel-steen
        pieces.push(piece);
      }
    }
    if (pieces.length) out.push({ ...row, pieces });
  }
  return out;
}

export function clipRowsAroundRects(rows, rects, rowH) {
  if (!rects?.length || !rows?.length) return rows;
  if (isStripSnijlijn()) return _clipRowsYCut(rows, rects, rowH);   // deel-steen tot de werkelijke rand
  const out = [];
  for (const row of rows) {
    const ry0 = row.y, ry1 = row.y + rowH;
    const ranges = [];
    for (const r of rects) {
      if (r.y + r.height <= ry0 || r.y >= ry1) continue;   // geen verticale overlap met deze rij
      ranges.push([r.x, r.x + r.width]);
    }
    if (!ranges.length) { out.push(row); continue; }
    let pieces = row.pieces;
    for (const [a, b] of ranges) {
      pieces = pieces.flatMap((p) => {
        const ps = p.start, pe = p.start + p.length;
        if (pe <= a || ps >= b) return [p];               // geen horizontale overlap
        const res = [];
        if (ps < a - 0.01) res.push({ ...p, start: ps, length: a - ps });
        if (pe > b + 0.01) res.push({ ...p, start: b, length: pe - b });
        return res;
      });
    }
    pieces = pieces.filter((p) => p.length > 1);
    if (pieces.length) out.push({ ...row, pieces });
  }
  return out;
}
