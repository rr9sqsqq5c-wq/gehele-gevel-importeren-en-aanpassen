import { polyXRangesAtY, openingCoversX, openingXCoordsAtY, openingXRangesAtY } from './geometry.js';
import { buildRowPiecesForWidth, buildWildverbandRow, getWildverbandModuleWidth, getWildverbandPanelBoundary } from './pattern.js';
import { buildTruthFacade, getModuleWidth } from './wildverbandKoppelstrip.js';
import { buildGroothuisModule } from './groothuisWildverband.js';
import { buildGroothuis2Module } from './groothuisWildverband2.js';
import { isWildverbandKoppelstrip, isGroothuisWildverband, isGroothuisWildverband2, isHalfsteensPanel5Strek, isPaneel14Laag, isPaneelOptimalisatie, isKeepEndExtension, isZoneExtend, isEndTrim, isEndExtSeparaat, isPaneelStartLijn, isOnderlatOffset, isPaneelBanden, isLattenPaneelvoeg, isPaneelRaster } from './featureFlags.js';

// ZONE_EXTEND: per-laag mm-uitloop van een zone-rand (links = x0-kant, rechts = x1-kant). Vlag uit → 0 (byte-identiek).
const zoneExtentFor = (z, layer) => isZoneExtend() ? { l: z.endExtensions?.left?.[layer] ?? 0, r: z.endExtensions?.right?.[layer] ?? 0 } : { l: 0, r: 0 };
// ZONE_EXTEND optrekken (maxHoogteVullen): effectieve zone-hoogte trekt op naar maxHoogte (alleen omhoog). Vlag/vullen
// uit of maxHoogte ≤ getekende hoogte → getekende hoogte (byte-identiek).
const zoneFillHeight = (z) => (isZoneExtend() && z.maxHoogteVullen && (z.maxHoogte ?? 0) > (z.height ?? 0)) ? z.maxHoogte : (z.height ?? 0);

function round2(v) {
  return Math.round(v * 100) / 100;
}

function polySignedArea(poly) {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    area += poly[i].l * poly[j].h - poly[j].l * poly[i].h;
  }
  return area / 2;
}

function clipPolygonSH(subject, clip) {
  const clipCCW = polySignedArea(clip) >= 0 ? clip : [...clip].reverse();
  let output = [...subject];
  const n = clipCCW.length;
  for (let i = 0; i < n && output.length > 0; i++) {
    const input = [...output];
    output = [];
    const e0 = clipCCW[i], e1 = clipCCW[(i + 1) % n];
    const el = e1.l - e0.l, eh = e1.h - e0.h;
    const inside = (p) => el * (p.h - e0.h) - eh * (p.l - e0.l) >= -1e-9;
    const intersect = (a, b) => {
      const dl = b.l - a.l, dh = b.h - a.h;
      const denom = dl * eh - dh * el;
      if (Math.abs(denom) < 1e-10) return null;
      const t = ((e0.l - a.l) * eh - (e0.h - a.h) * el) / denom;
      return { l: a.l + t * dl, h: a.h + t * dh };
    };
    for (let j = 0; j < input.length; j++) {
      const curr = input[j], prev = input[(j - 1 + input.length) % input.length];
      if (inside(curr)) {
        if (!inside(prev)) { const pt = intersect(prev, curr); if (pt) output.push(pt); }
        output.push(curr);
      } else if (inside(prev)) {
        const pt = intersect(prev, curr); if (pt) output.push(pt);
      }
    }
  }
  return output;
}

export function clipPanelToFacadePolys(panel, facadePolys) {
  if (!facadePolys?.length) return { ...panel, clipPolys: null };
  const rect = [
    { l: panel.x,              h: panel.y              },
    { l: panel.x + panel.width, h: panel.y              },
    { l: panel.x + panel.width, h: panel.y + panel.height },
    { l: panel.x,              h: panel.y + panel.height },
  ];
  const clips = [];
  let totalArea = 0;
  for (const facadePoly of facadePolys) {
    if (!facadePoly || facadePoly.length < 3) continue;
    const clipped = clipPolygonSH(rect, facadePoly);
    if (clipped.length < 3) continue;
    const area = Math.abs(polySignedArea(clipped));
    if (area < 1) continue;
    clips.push(clipped);
    totalArea += area;
  }
  if (!clips.length || totalArea < 500) return null;
  const panelArea = panel.width * panel.height;
  const coverRatio = totalArea / panelArea;
  return { ...panel, clipPolys: clips, clipArea: totalArea, coverRatio };
}

// VENTILATIE_ZONE — snijd de ventilatie-gaten (rechthoek) uit de panelen ZONDER ze in een dunne band
// te splitsen. Aanpak: de vent zit NIET in de zone-splitsing (openingsForZones), dus het paneel loopt
// over de volle breedte door; hier halen we per overlappend paneel het gat eruit = paneel − gat, tot 4
// rechthoeken (links/rechts over de volle paneelhoogte, boven/onder binnen de gat-breedte). Zo blijft
// de rest van het paneel heel en verdwijnt er geen volle-breedte-band op het < 200 mm-filter.
export function cutVentHolesFromPanels(panels, vents) {
  if (!vents?.length || !panels?.length) return panels;
  let out = panels;
  for (const v of vents) {
    const vx0 = v.x ?? 0, vx1 = (v.x ?? 0) + (v.width ?? 0), vy0 = v.y ?? 0, vy1 = (v.y ?? 0) + (v.height ?? 0);
    out = out.flatMap((p) => {
      const px0 = p.x, px1 = p.x + p.width, py0 = p.y, py1 = p.y + p.height;
      if (px1 <= vx0 + 0.5 || px0 >= vx1 - 0.5 || py1 <= vy0 + 0.5 || py0 >= vy1 - 0.5) return [p]; // geen overlap
      const mx0 = Math.max(px0, vx0), mx1 = Math.min(px1, vx1);
      const pieces = [];
      if (vx0 > px0 + 0.5) pieces.push({ ...p, x: px0, width: round2(vx0 - px0) });                          // links
      if (px1 > vx1 + 0.5) pieces.push({ ...p, x: round2(vx1), width: round2(px1 - vx1) });                  // rechts
      if (vy0 > py0 + 0.5) pieces.push({ ...p, x: round2(mx0), width: round2(mx1 - mx0), y: py0, height: round2(vy0 - py0) }); // onder
      if (py1 > vy1 + 0.5) pieces.push({ ...p, x: round2(mx0), width: round2(mx1 - mx0), y: round2(vy1), height: round2(py1 - vy1) }); // boven
      return pieces.filter((q) => q.width > 0.5 && q.height > 0.5);
    });
  }
  return out;
}

// SPARING-ELEMENTEN — hang de gaten (rechthoeken, groep-lokaal) op de panelen ZONDER het paneel op te
// knippen: het paneel blijft één plaat, elk gat wordt (geknipt op de paneelrand) als {x,y,width,height}
// in `panel.holes` gezet. Zo kan de werktekening/uittrekstaat het gat markeren voor de frees/zagerij.
// Coördinaten zijn hetzelfde groep-lokale frame als panel.x/y (niet paneel-lokaal). Geen rects → paneel
// ongemoeid (byte-identiek). Wordt óók in 2D/export gebruikt i.p.v. opknippen.
export function attachHolesToPanels(panels, rects) {
  if (!rects?.length || !panels?.length) return panels;
  return panels.map((p) => {
    const holes = [];
    for (const r of rects) {
      const x0 = Math.max(p.x, r.x), x1 = Math.min(p.x + p.width, (r.x ?? 0) + (r.width ?? 0));
      const y0 = Math.max(p.y, r.y), y1 = Math.min(p.y + p.height, (r.y ?? 0) + (r.height ?? 0));
      if (x1 - x0 > 0.5 && y1 - y0 > 0.5) holes.push({ x: round2(x0), y: round2(y0), width: round2(x1 - x0), height: round2(y1 - y0) });
    }
    return holes.length ? { ...p, holes: [...(p.holes ?? []), ...holes] } : p;
  });
}

export function buildFacadeZones(facadeWidth, facadeHeight, openings, splitAllOpeningsX = false) {
  if (!openings.length) {
    return [{ id: 'Z1', kind: 'algemeen', x: 0, y: 0, width: facadeWidth, height: facadeHeight }];
  }

  const yCoords = new Set([0, facadeHeight]);
  for (const o of openings) {
    const ys = o.polyPts ? o.polyPts.map(p => p.h) : [o.y, o.y + o.height];
    for (const y of ys) {
      if (y > 0.001 && y < facadeHeight - 0.001) yCoords.add(y);
    }
    if (o.y > 0.001) yCoords.add(o.y);
    if (o.y + o.height < facadeHeight - 0.001) yCoords.add(o.y + o.height);
  }
  const yArr = [...yCoords].sort((a, b) => a - b);

  const rawZones = [];

  for (let yi = 0; yi < yArr.length - 1; yi++) {
    const yBot = yArr[yi];
    const yTop = yArr[yi + 1];
    const bandH = yTop - yBot;
    if (bandH <= 0.001) continue;
    const midY = (yBot + yTop) / 2;

    const bandOpenings = openings.filter((o) => o.y <= midY && o.y + o.height >= midY);

    const xCoords = new Set([0, facadeWidth]);
    for (const o of bandOpenings) {
      for (const x of openingXCoordsAtY(o, midY)) {
        xCoords.add(Math.max(0, Math.min(facadeWidth, x)));
      }
    }
    // STRIP-SNEDE / proposal 3: splits ELKE band óók op de x-randen van ALLE openingen, zodat de massieve
    // wanddelen links/rechts van een raam verticaal kunnen samensmelten (geen horizontale paneelrand door
    // een doorlopende steen boven/onder het raam). Param uit → byte-identiek.
    if (splitAllOpeningsX) {
      for (const o of openings) {
        xCoords.add(Math.max(0, Math.min(facadeWidth, o.x ?? 0)));
        xCoords.add(Math.max(0, Math.min(facadeWidth, (o.x ?? 0) + (o.width ?? 0))));
      }
    }
    const xArr = [...xCoords].sort((a, b) => a - b);

    for (let xi = 0; xi < xArr.length - 1; xi++) {
      const xL = xArr[xi];
      const xR = xArr[xi + 1];
      if (xR - xL <= 0.001) continue;
      const midX = (xL + xR) / 2;
      const covered = bandOpenings.some((o) => openingCoversX(o, midX, midY));
      if (!covered) {
        rawZones.push({ x: xL, y: yBot, width: xR - xL, height: bandH });
      }
    }
  }

  let zones = rawZones;
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < zones.length; i++) {
      for (let j = i + 1; j < zones.length; j++) {
        const a = zones[i], b = zones[j];
        if (Math.abs(a.x - b.x) < 0.001 && Math.abs(a.width - b.width) < 0.001) {
          if (Math.abs(a.y + a.height - b.y) < 0.001 || Math.abs(b.y + b.height - a.y) < 0.001) {
            const merged = { x: a.x, y: Math.min(a.y, b.y), width: a.width, height: a.height + b.height };
            zones = [...zones.slice(0, i), merged, ...zones.slice(i + 1, j), ...zones.slice(j + 1)];
            changed = true;
            break outer;
          }
        }
      }
    }
  }

  return zones
    .filter((z) => z.width > 0.001 && z.height > 0.001)
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .map((z, i) => ({ ...z, id: `Z${i + 1}`, kind: 'zone' }));
}

function collectVerticalCandidates(zone, globalPieces) {
  const stripJoints = new Set();
  for (const p of globalPieces) {
    const x1 = round2(p.x);
    const x2 = round2(p.x + p.width);
    if (x1 > zone.x + 0.001 && x1 < zone.x + zone.width - 0.001) stripJoints.add(x1);
    if (x2 > zone.x + 0.001 && x2 < zone.x + zone.width - 0.001) stripJoints.add(x2);
  }
  const xs = new Set([round2(zone.x), round2(zone.x + zone.width), ...stripJoints]);
  return [...xs].sort((a, b) => a - b);
}

function collectHorizontalCandidates(zone, globalRows, steenH) {
  const stripJoints = new Set();
  for (const row of globalRows) {
    const y1 = round2(row.y);
    const y2 = round2(row.y + steenH);
    if (y1 > zone.y + 0.001 && y1 < zone.y + zone.height - 0.001) stripJoints.add(y1);
    if (y2 > zone.y + 0.001 && y2 < zone.y + zone.height - 0.001) stripJoints.add(y2);
  }
  const ys = new Set([round2(zone.y), round2(zone.y + zone.height), ...stripJoints]);
  return [...ys].sort((a, b) => a - b);
}

function chooseBreaks(start, end, candidates, maxSpan, targetSpan) {
  const valid = candidates.filter((c) => c >= start && c <= end).sort((a, b) => a - b);
  const breaks = [start];
  let current = start;

  while (current < end - 0.001) {
    const inRange = valid.filter((v) => v > current + 0.001 && v - current <= maxSpan + 0.001);

    const forcedBreak = current + maxSpan;
    if (!inRange.length && forcedBreak < end - 0.001) {
      breaks.push(round2(forcedBreak));
      current = round2(forcedBreak);
      continue;
    }

    const options = inRange.length > 0 ? inRange : valid.filter((v) => v > current + 0.001);

    if (!options.length) {
      if (breaks[breaks.length - 1] !== end) breaks.push(end);
      break;
    }
    let best = options[0];
    let bestScore = Math.abs(best - current - targetSpan);
    for (const opt of options) {
      const score = Math.abs(opt - current - targetSpan);
      if (score < bestScore) { best = opt; bestScore = score; }
    }
    breaks.push(best);
    current = best;
  }

  if (breaks[breaks.length - 1] !== end) breaks.push(end);
  return [...new Set(breaks)].sort((a, b) => a - b);
}

function _battenForN(groupHeight, steenH, lint, lagenmaat, N) {
  const lintHalf = lint / 2;
  const positions = [];
  let k = 0;
  while (true) {
    const jc = round2(k * N * lagenmaat + steenH + lintHalf);
    if (jc >= groupHeight) break;
    positions.push(jc);
    k++;
  }
  return positions;
}

function _scoreBattenLayout(groupHeight, battenYs, targetPanelH, minPanelH) {
  const minH = minPanelH ?? 800;
  const tH   = targetPanelH ?? 930;
  const breaks = [0, ...battenYs.filter(y => y > 0 && y < groupHeight), groupHeight].sort((a, b) => a - b);
  let segs = [];
  for (let i = 0; i < breaks.length - 1; i++) segs.push(breaks[i + 1] - breaks[i]);
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < segs.length; i++) {
      if (segs[i] < minH - 0.001 && segs.length > 1) {
        if (i === 0) { segs[1] += segs[0]; segs.splice(0, 1); }
        else if (i === segs.length - 1) { segs[i - 1] += segs[i]; segs.splice(i, 1); }
        else if (segs[i - 1] <= segs[i + 1]) { segs[i - 1] += segs[i]; segs.splice(i, 1); }
        else { segs[i] += segs[i + 1]; segs.splice(i + 1, 1); }
        changed = true;
        break;
      }
    }
  }
  const finalSegs = [];
  for (const s of segs) {
    if (s > tH + 0.001) {
      const n = Math.max(1, Math.round(s / tH));
      for (let i = 0; i < n; i++) finalSegs.push(s / n);
    } else {
      finalSegs.push(s);
    }
  }
  if (!finalSegs.length) return Infinity;
  const mean = finalSegs.reduce((a, b) => a + b, 0) / finalSegs.length;
  return finalSegs.reduce((sum, h) => sum + (h - mean) ** 2, 0) / finalSegs.length;
}

// PANEEL_14LAAG: de yBreaks voor de 14-laag-pitch (paneel = pitchV−3), met merge van een rest < 200mm in het
// paneel eronder. GEDEELD door panelizeZone (paneel-hoogtes) én computeHorizontalLatten (latten op de voegen),
// zodat latten altijd exact op de échte paneelvoegen liggen — ook na de merge (geen fantoom-voeg).
export function compute14LaagYBreaks(zoneY1, zoneY2, lagenmaat) {
  const pitchV = 14 * lagenmaat;
  let yBreaks = [zoneY1];
  for (let k = 1; k * pitchV - 3 < (zoneY2 - zoneY1) - 0.001; k++) {
    const e = round2(zoneY1 + k * pitchV - 3);
    if (e > zoneY1 + 0.5 && e < zoneY2 - 0.5) yBreaks.push(e);
  }
  yBreaks.push(zoneY2);
  yBreaks = [...new Set(yBreaks)].sort((a, b) => a - b);
  if (yBreaks.length >= 3) {
    const topPanelH = (zoneY2 - yBreaks[yBreaks.length - 2]) - PANEL_GAP;   // −gap: het niet-onderste paneel wordt 3mm ingekort
    if (topPanelH < 200) yBreaks.splice(yBreaks.length - 2, 1);
  }
  return yBreaks;
}

export function generateBattenPositions(groupHeight, mat, maxInterval, options = {}) {
  const steenH = mat.steenH ?? 50;
  const lint   = mat.lint   ?? 12;
  const lagenmaat = steenH + lint;
  if (lagenmaat <= 0) return [];
  if (!isFinite(groupHeight) || groupHeight <= 0) return [];

  const { minHOH, maxHOH, targetPanelH, minPanelH } = options;

  if (minHOH != null && maxHOH != null && minHOH > 0 && maxHOH >= minHOH) {
    const nMin = Math.max(1, Math.ceil(minHOH / lagenmaat));
    const nMax = Math.floor(maxHOH / lagenmaat);
    let bestN = nMin;
    let bestScore = Infinity;
    for (let n = nMin; n <= nMax; n++) {
      const hoh = n * lagenmaat;
      if (hoh < minHOH - 0.001 || hoh > maxHOH + 0.001) continue;
      const pos = _battenForN(groupHeight, steenH, lint, lagenmaat, n);
      const score = _scoreBattenLayout(groupHeight, pos, targetPanelH, minPanelH);
      if (score < bestScore) { bestScore = score; bestN = n; }
    }
    return _battenForN(groupHeight, steenH, lint, lagenmaat, bestN);
  }

  const N = Math.max(1, Math.floor((maxInterval ?? 400) / lagenmaat));
  return _battenForN(groupHeight, steenH, lint, lagenmaat, N);
}

export function computeHorizontalLatten({ facadeData, latten, mat, panelen, panels = [], startLijn, backingType, verband }) {
  const _bt = backingType ?? 'hout';
  if (!facadeData || !latten?.enabled || _bt === 'aluminium' || _bt === 'aluminium_slimfort') return [];
  const richting = latten.richting ?? 'horizontaal';
  if (richting !== 'horizontaal') return [];

  const { groupWidth, groupHeight, groupOpenings } = facadeData;
  const latBreedte = Math.max(5, latten.breedte ?? 50);
  const maxInterval = Math.max(50, latten.maxInterval ?? 400);
  const battenYs = generateBattenPositions(groupHeight, mat, maxInterval, {
    minHOH: latten?.minHOH,
    maxHOH: latten?.maxHOH,
    targetPanelH: panelen?.hoogte,
    minPanelH: 800,
  });

  const gH = Math.round(groupHeight);
  const lintHalf = Math.round((mat.lint ?? 12) / 2);
  const brickTopsSet = new Set();
  if (facadeData?.rows) {
    for (const row of facadeData.rows) brickTopsSet.add(Math.round(row.y + mat.steenH));
  }
  const minH = Math.max(0, Math.round(startLijn ?? 0));
  const startLijnN = Math.round(startLijn ?? 0);
  const clampY = (y) => Math.min(gH, Math.max(0, y));
  const allRowYsSorted = (facadeData?.rows ?? []).map(r => r.y).sort((a, b) => a - b);

  const allYs = new Set([minH, gH, ...battenYs.map(y => clampY(Math.round(y)))]);

  const result = [];
  let idx = 0;
  // PANEEL_14LAAG: latten PER ZONE op de ÉCHTE paneelvoegen (compute14LaagYBreaks, identiek aan de panelen),
  // + onderlat met z'n onderkant op +10, + dorpel-lat waar een raam op de bovenkant van de zone staat, +
  // ~maxInterval-vulling ertussen. Zo geen groep-brede fantoom-latten en geen overlappende latten onder/boven ramen.
  // LATTEN_PANEELVOEG (per-groep modus 'paneelvoeg', achter vlag): één lat op elke horizontale PANEELVOEG uit de
  // ECHTE panelen + een start- en eind-lat + tussenliggende latten (≤ maxInterval) die grote gaten opvullen. Per
  // zone (buildFacadeZones), zodat onder/boven ramen de dorpel/latei correct meelopen. Zet een `rol`-veld voor
  // de tekening/telling. Vlag uit of modus≠'paneelvoeg' → overgeslagen → interval-pad (byte-identiek).
  const usePaneelvoeg = isLattenPaneelvoeg() && (latten?.plaatsingsModus === 'paneelvoeg') && (panels?.length > 0);
  const use14 = !usePaneelvoeg && isPaneel14Laag() && verband === 'halfsteens';
  if (usePaneelvoeg) {
    const half = latBreedte / 2;
    const opsForZones = (groupOpenings ?? []).filter(op => op.type !== 'ventilatie')
      .map(op => ({ x: op.x, y: op.y, width: op.width, height: op.height, polyPts: op.polyPts ?? null }));
    const zones = buildFacadeZones(groupWidth, groupHeight, opsForZones);
    for (const zone of zones) {
      const zb = Math.round(zone.y), zt = Math.round(zone.y + zone.height);
      const zx1 = zone.x, zx2 = zone.x + zone.width;
      // panelen die deze zone overlappen (x én y)
      const zp = panels.filter(p => p.x < zx2 - 1 && p.x + p.width > zx1 + 1 && p.y + p.height > zb + 1 && p.y < zt - 1);
      if (!zp.length) continue;
      // rijen: groepeer op paneel-onderkant (p.y); rij-bovenkant = laagste top in die rij
      const rowMap = new Map();
      for (const p of zp) {
        const by = Math.round(p.y), ty = Math.round(p.y + p.height);
        if (!rowMap.has(by) || ty < rowMap.get(by)) rowMap.set(by, ty);
      }
      const rowBots = [...rowMap.keys()].sort((a, b) => a - b);
      // interne horizontale paneelvoegen = het midden tussen (onderste-rij-top) en (bovenste-rij-onderkant)
      const voegCenters = [];
      for (let i = 0; i < rowBots.length - 1; i++) voegCenters.push((rowMap.get(rowBots[i]) + rowBots[i + 1]) / 2);
      // sill = een raam staat op de bovenkant van deze zone → de eind-lat is een dorpel-lat
      const sill = opsForZones.some(op => Math.abs(op.y - zt) < 2 && op.x < zx2 && op.x + op.width > zx1);
      const items = [
        { c: Math.max(zb, minH) + (isOnderlatOffset() ? 10 : 0) + half, rol: 'start' },   // onderlat: onderkant op de zone-start, maar nooit onder de starthoogte (minH); +10 met onderlatOffset
        ...voegCenters.map(c => ({ c, rol: 'paneelvoeg' })),
        { c: zt - half, rol: sill ? 'dorpel' : 'eind' },                  // eind-lat: bovenkant op de zone-top/gevel-top
      ].sort((a, b) => a.c - b.c);
      // te dicht op elkaar (< ½ lat) samenvoegen; een rand-lat (start/eind/dorpel) wint van een voeg-lat
      const dd = [];
      for (const it of items) {
        const prev = dd[dd.length - 1];
        if (prev && it.c - prev.c < Math.max(2, half)) {
          if (!(prev.rol === 'start' || prev.rol === 'eind' || prev.rol === 'dorpel')) dd[dd.length - 1] = it;
          continue;
        }
        dd.push(it);
      }
      for (let i = 0; i < dd.length; i++) {
        const isRand = dd[i].rol === 'start' || dd[i].rol === 'eind' || dd[i].rol === 'dorpel';
        result.push({ id: `lat-h-${idx++}`, richting: 'horizontaal', x: zone.x, y: clampY(Math.round(dd[i].c - half)), width: zone.width, height: latBreedte, forced: isRand, rol: dd[i].rol });
        // tussenliggende latten: vul het gat tot de volgende lat op als het > maxInterval is
        const next = i < dd.length - 1 ? dd[i + 1].c : null;
        if (next != null && next > dd[i].c + 1) {
          const span = next - dd[i].c;
          const gaps = Math.max(1, Math.ceil(span / maxInterval));   // ceil → elk paneelveld ≤ maxInterval (geen te groot gat)
          for (let j = 1; j < gaps; j++) result.push({ id: `lat-h-${idx++}`, richting: 'horizontaal', x: zone.x, y: clampY(Math.round(dd[i].c + j * span / gaps - half)), width: zone.width, height: latBreedte, forced: false, rol: 'tussen' });
        }
      }
    }
  } else if (use14) {
    const lagenmaat14 = (mat.steenH ?? 50) + (mat.lint ?? 12);
    const half = latBreedte / 2;
    const opsForZones = (groupOpenings ?? []).filter(op => op.type !== 'ventilatie')
      .map(op => ({ x: op.x, y: op.y, width: op.width, height: op.height, polyPts: op.polyPts ?? null }));
    const zones = buildFacadeZones(groupWidth, groupHeight, opsForZones);
    for (const zone of zones) {
      const zb = Math.round(zone.y), zt = Math.round(zone.y + zone.height);
      const yBreaks = compute14LaagYBreaks(zb, zt, lagenmaat14);
      const voegCenters = yBreaks.slice(1, -1).map(b => b + 1.5);   // midden van de 3mm-voeg = de paneelvoeg
      const sill = opsForZones.some(op => Math.abs(op.y - zt) < 2 && op.x < zone.x + zone.width && op.x + op.width > zone.x);
      const centers = [zb + 10 + half, ...voegCenters];             // onderlat: onderkant op +10 → center = +10 + half
      if (sill) centers.push(zt - half);                            // dorpel: bovenkant op de dorpel → center = zt − half
      centers.sort((a, b) => a - b);
      // Zonder dorpel de vulling tot de zone-bovenkant laten doorlopen (steun in een hoog bovenste paneel),
      // maar GÉÉN lat op de gevelrand/roof zelf. Bij een klein bovenpaneel (gat < ~1,5·maxInterval) voegt dit niets toe.
      const fillTop = sill ? null : zt;
      for (let i = 0; i < centers.length; i++) {
        result.push({ id: `lat-h-${idx++}`, richting: 'horizontaal', x: zone.x, y: clampY(Math.round(centers[i] - half)), width: zone.width, height: latBreedte, forced: false });
        const next = i < centers.length - 1 ? centers[i + 1] : fillTop;   // ~maxInterval-vulling tot de volgende lat of de zone-top
        if (next != null && next > centers[i] + 1) {
          const span = next - centers[i];
          const gaps = Math.max(1, Math.round(span / maxInterval));
          for (let j = 1; j < gaps; j++) result.push({ id: `lat-h-${idx++}`, richting: 'horizontaal', x: zone.x, y: clampY(Math.round(centers[i] + j * span / gaps - half)), width: zone.width, height: latBreedte, forced: false });
        }
      }
    }
    // PANEEL_14LAAG: dubbelingen weg — een smallere lat die binnen ~150mm van een BREDERE lat ligt die z'n
    // x-bereik omvat, is overbodig (bv. de flank-onderlat naast een raam vs. de volle-breedte dorpel-lat
    // eronder die al doorloopt). Drop de smalle; de brede dekt die plek al.
    const _keep14 = result.filter((a, i) => !result.some((b, j) => j !== i
      && b.width > a.width + 0.5 && b.x <= a.x + 0.5 && b.x + b.width >= a.x + a.width - 0.5
      && Math.abs((a.y + a.height / 2) - (b.y + b.height / 2)) < 150));
    result.length = 0; result.push(..._keep14);
  } else {
  for (const yr of [...allYs].filter(y => y >= minH && y <= gH).sort((a, b) => a - b)) {
    let latY;
    // ONDERLAT_OFFSET: de onderste (startlijn-)lat 10 mm boven het peil i.p.v. erop (vlag uit → +0, byte-identiek).
    if (yr === minH) latY = isOnderlatOffset() ? minH + 10 : minH;
    else if (yr === gH) latY = yr - latBreedte;
    else if (brickTopsSet.has(yr)) latY = Math.round(yr + lintHalf - latBreedte / 2);
    else latY = Math.round(yr - lintHalf - latBreedte / 2);
    result.push({ id: `lat-h-${idx++}`, richting: 'horizontaal', x: 0, y: latY, width: groupWidth, height: latBreedte, forced: yr === minH || yr === gH });
  }

  if (startLijnN < 0) {
    result.push({ id: `lat-h-${idx++}`, richting: 'horizontaal', x: 0, y: startLijnN, width: groupWidth, height: latBreedte, forced: true });
  }
  }

  const getOpXW = (op, y) => {
    if (op.polyPts?.length >= 3) {
      const ranges = polyXRangesAtY(op.polyPts, y);
      if (ranges.length) return { x: ranges[0][0], width: ranges[ranges.length - 1][1] - ranges[0][0] };
    }
    return { x: op.x, width: op.width };
  };

  // Losse dorpel/latei-latten per raam — voor 14-laag én paneelvoeg NIET (de per-zone-latten hierboven dekken
  // dorpel + latei al, en deze zouden er juist overheen lopen; dat was precies de klacht "latten over elkaar onder de ramen").
  if (!use14 && !usePaneelvoeg) for (const op of groupOpenings) {
    const belowLatY = Math.round(clampY(op.y)) - latBreedte;
    const rawAbove = Math.round(clampY(op.y + op.height));
    const firstAbove = allRowYsSorted.find(ry => ry >= rawAbove - 0.5) ?? rawAbove;
    const aboveLatY = firstAbove;
    if (belowLatY >= 0) {
      const { x: bx, width: bw } = getOpXW(op, belowLatY + latBreedte / 2);
      result.push({ id: `lat-h-${idx++}`, richting: 'horizontaal', x: bx, y: belowLatY, width: bw, height: latBreedte, forced: true, openingForced: true });
    }
    if (aboveLatY + latBreedte <= gH) {
      const { x: ax, width: aw } = getOpXW(op, aboveLatY + latBreedte / 2);
      result.push({ id: `lat-h-${idx++}`, richting: 'horizontaal', x: ax, y: aboveLatY, width: aw, height: latBreedte, forced: true, openingForced: true });
    }
  }

  return result;
}

// FASE 1 — ÉÉN WAARHEID voor de latten (vlag unifiedLatten). Positionering via computeHorizontalLatten
// (generateBattenPositions + brickTop-snap), dan opening-clip + paneel-extent-clip (INSET 5), en tenslotte
// sparing-clip. Verticaal: paneel-x-posities (met penant-hoogte) + sparing-clip. De AANROEPER levert z'n
// eigen `panels` (zodat de extent-clip op dezelfde panelen klopt) én de `panelen`-settings. Zo produceren
// 2D/3D/export/werktekening/uittrekstaat identieke latten uit één bron.
export function buildFacadeLatten({ facadeData, latten, mat, panelen, panels = [], penanten = [], startLijn, verband, backingType, sparingRects = [], endExtensions = null }) {
  const _bt = backingType ?? 'hout';
  if (!facadeData || !latten?.enabled || _bt === 'aluminium' || _bt === 'aluminium_slimfort') return [];
  const { groupWidth, groupHeight, groupOpenings } = facadeData;
  const richting = latten.richting ?? 'horizontaal';
  const latBreedte = Math.max(5, latten.breedte ?? 50);
  const use14 = isPaneel14Laag() && verband === 'halfsteens';   // 14-laag: gevelrand niet insetten (t.b.v. end-extension)
  let out;
  if (richting === 'horizontaal') {
    const rawLatten = computeHorizontalLatten({ facadeData, latten, mat, panelen, panels, startLijn, backingType: _bt, verband });
    const INSET = 5;
    const result = [];
    let gi = 0;
    for (const lat of rawLatten) {
      if (lat.forced) { result.push({ ...lat, id: `lat-h-${gi++}` }); continue; }
      const latTop = lat.y, latBot = lat.y + lat.height;
      const openingsAtY = (groupOpenings ?? []).filter((op) => op.y < latBot && op.y + op.height > latTop);
      const zones = [];
      if (!openingsAtY.length) { zones.push({ x1: 0, x2: groupWidth }); }
      else {
        const opRanges = openingsAtY.flatMap((op) => openingXRangesAtY(op, latTop, latBot)).sort((a, b) => a.x1 - b.x1);
        let cursor = 0;
        for (const op of opRanges) { if (op.x1 > cursor) zones.push({ x1: cursor, x2: op.x1 }); cursor = Math.max(cursor, op.x2); }
        if (cursor < groupWidth) zones.push({ x1: cursor, x2: groupWidth });
      }
      for (const zone of zones) {
        let x1 = zone.x1, x2 = zone.x2;
        if (panels.length) {
          const inZone = panels.filter((p) => p.y < latBot && p.y + p.height > latTop && p.x + p.width > zone.x1 && p.x < zone.x2);
          if (inZone.length) {
            // END_EXT_SEPARAAT: klem op de ZONE-segmentgrens (groep/openingen), NIET de paneel-extent → de latten volgen
            // de paneel-verlenging ÉN -inkorting niet; ze verlengen/inkorten enkel met hun eigen "Latten"-waarde
            // (extendLattenAtEnds hieronder). Vlag uit → paneel-extent (byte-identiek). Basis (geen paneel-uitloop):
            // panelen vullen het segment → zone.x1/x2 ≈ pxMin/pxMax → ook met de vlag aan geen zichtbaar verschil.
            const _sep = isEndExtSeparaat() && !use14;
            const pxMin = _sep ? zone.x1 : Math.min(...inZone.map((p) => p.x));
            const pxMax = _sep ? zone.x2 : Math.max(...inZone.map((p) => p.x + p.width));
            // PANEEL_14LAAG: aan de GEVELRAND niet insetten → de rand-lat raakt x=0/groupWidth en loopt zo mee met end-extension.
            x1 = (use14 && pxMin <= 0.5) ? pxMin : pxMin + INSET;
            x2 = (use14 && pxMax >= groupWidth - 0.5) ? pxMax : pxMax - INSET;
          }
        }
        if (x2 <= x1) continue;
        result.push({ ...lat, id: `lat-h-${gi++}`, x: x1, width: x2 - x1 });
      }
    }
    out = result;
  } else {
    const xs = new Set([0, groupWidth]);
    for (const p of panels) { xs.add(Math.round(p.x)); xs.add(Math.round(p.x + p.width / 2)); xs.add(Math.round(p.x + p.width)); }
    out = [...xs].sort((a, b) => a - b).map((x, idx) => {
      const lx1 = x - latBreedte / 2;
      const pen = (penanten ?? []).find((p) => { const px1 = p.x ?? 0, px2 = px1 + Math.max(1, p.breedte ?? 400); return lx1 + latBreedte > px1 + 5 && lx1 < px2 - 5; });
      const latH = pen ? Math.max(1, pen.hoogte ?? 2000) : groupHeight;
      return { id: `lat-v-${idx}`, richting: 'verticaal', x: lx1, y: 0, width: latBreedte, height: latH, forced: false };
    });
  }
  // UNIFIED_LATTEN: hoek-extensie (buitenste horizontale lat loopt door voorbij de gevelrand) hier ÍN de
  // gedeelde helper, zodat ALLE views 'm identiek toepassen (was alleen in View2D → divergentie).
  if (richting === 'horizontaal' && isKeepEndExtension() && endExtensions) {
    const _clampL = (v) => isEndTrim() ? v : Math.max(0, v);   // END_TRIM: negatief (inkorten) toestaan; anders alleen uitbreiden
    const eL = _clampL(endExtensions.left?.battens ?? 0);
    const eR = _clampL(endExtensions.right?.battens ?? 0);
    if (eL !== 0 || eR !== 0) out = extendLattenAtEnds(out, groupWidth, eL, eR);
  }
  return (sparingRects?.length) ? cutVentHolesFromPanels(out, sparingRects) : out;
}

// GEEN_VERBAND / zone-backing: draagpanelen die de GETEKENDE ZONES volgen i.p.v. de hele gevel.
// Elke zone-rechthoek wordt gesneden met de openings-vrije gevelzones (buildFacadeZones) en per
// stuk gepanelizeerd (met de EIGEN verband van die zone), zodat elk bekledingsvak z'n eigen
// draagpanelen krijgt en openingen vrij blijven. activeZones = de stripZone-objecten (al op
// enabled gefilterd; dragen x/y/width/height + verband). Lege input → [].
export function buildZoneBackingPanels({ facadeData, activeZones, panelen, latten, mat, verband, startLijn = null, sparingRects = [] }) {
  if (!facadeData || !panelen?.enabled || !activeZones?.length) return [];
  const { groupWidth, groupHeight, groupOpenings = [] } = facadeData;
  const openings = (groupOpenings ?? []).filter((op) => op.type !== 'ventilatie')
    .map((op) => ({ id: `op_${op.x}_${op.y}`, x: op.x, y: op.y, width: op.width, height: op.height, polyPts: op.polyPts ?? null }));
  const basePanel = computeEffectiveBasePanel(panelen, mat.brickWeightM2 ?? 40, mat);
  const maxInterval = Math.max(50, latten?.maxInterval ?? 400);
  const baseBattenYs = generateBattenPositions(groupHeight, mat, maxInterval, { minHOH: latten?.minHOH, maxHOH: latten?.maxHOH, targetPanelH: panelen?.hoogte, minPanelH: 800 });
  const lint = mat.lint ?? 12, steenH = mat.steenH ?? 50, steenL = mat.steenL ?? 210, lintHalf = lint / 2;
  const fullZones = buildFacadeZones(groupWidth, groupHeight, openings, true);   // massieve delen naast een raam samensmelten (geen strip-snede)
  let panels = [];
  for (const z of activeZones) {
    const V = z.verband ?? verband ?? 'halfsteens';
    const _pex = zoneExtentFor(z, 'panels');   // ZONE_EXTEND: panelen-uitloop verbreedt de zone-rechthoek
    const zx1 = (z.x ?? 0) - _pex.l, zy1 = z.y ?? 0, zx2 = (z.x ?? 0) + (z.width ?? 0) + _pex.r, zy2 = zy1 + zoneFillHeight(z);
    // PANEELVOEGEN OP DE STEENRIJEN: bouw de course-grid van DEZE zone (eigen verband + anker) en
    // snap de paneel-hoogtebreaks daarop, zodat een paneelvoeg op een lintvoeg valt (net als de basis).
    const lagenmaat = V === 'staand_tegelverband' ? (steenL + lint) : (steenH + lint);
    const anchorY = z.bondAnchor === 'planeOrigin' ? 0 : zy1;
    const rowYs = [];
    if (lagenmaat > 0) {
      const k0 = Math.floor((zy1 - anchorY) / lagenmaat) - 1;
      for (let y = anchorY + k0 * lagenmaat; y <= zy2 + lagenmaat; y += lagenmaat) if (y >= zy1 - 1 && y <= zy2 + 1) rowYs.push(round2(y));
    }
    const snapFn = rowYs.length ? (y) => { const t = y + lintHalf; return rowYs.reduce((b, ry) => Math.abs(ry - t) < Math.abs(b - t) ? ry : b); } : null;
    const bys = snapFn ? baseBattenYs.map(snapFn) : baseBattenYs;
    for (const fz of fullZones) {
      const ix1 = Math.max(fz.x, zx1), iy1 = Math.max(fz.y, zy1);
      const ix2 = Math.min(fz.x + fz.width, zx2), iy2 = Math.min(fz.y + fz.height, zy2);
      if (ix2 - ix1 > 10 && iy2 - iy1 > 10) {
        const res = panelizeZone({ x: ix1, y: iy1, width: ix2 - ix1, height: iy2 - iy1, id: `zpz-${Math.round(ix1)}-${Math.round(iy1)}`, kind: 'zone', bondOriginX: z.bondAnchor === 'planeOrigin' ? 0 : zx1, bondOriginY: z.bondAnchor === 'planeOrigin' ? 0 : zy1 }, bys, basePanel, snapFn, mat, V);
        if (res.ok) panels.push(...res.panels);
      }
    }
  }
  panels = panels.filter((p) => p.height >= 200 && p.width >= 10);
  // PROJECT-STARTLIJN (peil): net als de basis-panelen. <0 → het onderste paneel (op de gevelonderkant,
  // y≈0) trekt door tot de startlijn; >0 → panelen onder de startlijn worden afgesneden.
  if (startLijn != null && startLijn < 0 && panels.length) {
    panels = panels.map((p) => p.y <= 0.5 ? { ...p, y: startLijn, height: round2(p.height + p.y - startLijn) } : p);
  } else if (startLijn != null && startLijn > 0 && panels.length) {
    panels = panels.map((p) => {
      if (p.y + p.height <= startLijn) return null;
      if (p.y < startLijn) return { ...p, y: startLijn, height: round2(p.y + p.height - startLijn) };
      return p;
    }).filter(Boolean);
  }
  return attachHolesToPanels(panels, sparingRects);
}

// Klip latten op de zone-rechthoeken (x én y): een lat blijft alleen waar een zone hem dekt.
// Nodig omdat buildFacadeLatten in banden zónder zone-paneel de lat over de volle breedte legt.
// Overlappende zones kunnen een lat-segment dubbel geven — verwaarloosbaar (identieke positie).
export function clipLattenToZones(latten, activeZones) {
  if (!latten?.length || !activeZones?.length) return [];
  const out = [];
  let gi = 0;
  for (const lat of latten) {
    const lx1 = lat.x, ly1 = lat.y, lx2 = lat.x + lat.width, ly2 = lat.y + lat.height;
    for (const z of activeZones) {
      const _lex = zoneExtentFor(z, 'battens');   // ZONE_EXTEND: latten-uitloop verbreedt de zone-rechthoek
      const zx1 = (z.x ?? 0) - _lex.l, zy1 = z.y ?? 0, zx2 = (z.x ?? 0) + (z.width ?? 0) + _lex.r, zy2 = zy1 + zoneFillHeight(z);
      const ix1 = Math.max(lx1, zx1), iy1 = Math.max(ly1, zy1);
      const ix2 = Math.min(lx2, zx2), iy2 = Math.min(ly2, zy2);
      if (ix2 - ix1 > 1 && iy2 - iy1 > 0.5) {
        out.push({ ...lat, id: `${lat.id ?? 'lat'}-z${gi++}`, x: ix1, y: iy1, width: ix2 - ix1, height: iy2 - iy1 });
      }
    }
  }
  return out;
}

function mergeSmallSegments(breaks, minH) {
  if (breaks.length < 2) return breaks;
  let segs = [];
  for (let i = 0; i < breaks.length - 1; i++) {
    segs.push({ y0: breaks[i], y1: breaks[i + 1] });
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < segs.length; i++) {
      const h = round2(segs[i].y1 - segs[i].y0);
      if (h < minH - 0.001 && segs.length > 1) {
        if (i === 0) {
          segs[1] = { y0: segs[0].y0, y1: segs[1].y1 };
          segs.splice(0, 1);
        } else if (i === segs.length - 1) {
          segs[i - 1] = { y0: segs[i - 1].y0, y1: segs[i].y1 };
          segs.splice(i, 1);
        } else {
          const prevH = round2(segs[i - 1].y1 - segs[i - 1].y0);
          const nextH = round2(segs[i + 1].y1 - segs[i + 1].y0);
          if (prevH <= nextH) {
            segs[i - 1] = { y0: segs[i - 1].y0, y1: segs[i].y1 };
            segs.splice(i, 1);
          } else {
            segs[i] = { y0: segs[i].y0, y1: segs[i + 1].y1 };
            segs.splice(i + 1, 1);
          }
        }
        changed = true;
        break;
      }
    }
  }
  return [segs[0].y0, ...segs.map(s => s.y1)];
}

function buildPanelsFromBreaks(zone, xBreaks, yBreaks, orientation, xBreaksOdd) {
  const panels = [];
  let id = 1;
  for (let yi = 0; yi < yBreaks.length - 1; yi++) {
    const xb = (xBreaksOdd && yi % 2 === 1) ? xBreaksOdd : xBreaks;
    for (let xi = 0; xi < xb.length - 1; xi++) {
      const w = round2(xb[xi + 1] - xb[xi]);
      const h = round2(yBreaks[yi + 1] - yBreaks[yi]);
      if (w <= 0 || h <= 0) continue;
      panels.push({
        id: `${zone.id}-P${id}`,
        zoneId: zone.id,
        row: yi + 1, col: xi + 1,
        x: xb[xi], y: yBreaks[yi],
        width: w, height: h,
        area: round2(w * h),
        orientation,
        staggered: !!(xBreaksOdd && yi % 2 === 1),
      });
      id++;
    }
  }
  return panels;
}

export const PANEL_GAP = 3;

function collectStootvoegBreaks(zoneWidth, material, verband, stoot) {
  const breaks = new Set();
  const rowCount = verband === 'halfsteens' ? 2 : 1;
  for (let r = 0; r < rowCount; r++) {
    const pieces = buildRowPiecesForWidth(zoneWidth, material, verband, r, 0);
    for (let i = 0; i < pieces.length - 1; i++) {
      const voegEnd = round2(pieces[i].start + pieces[i].length + stoot);
      if (voegEnd > 0.001 && voegEnd < zoneWidth - 0.001) {
        breaks.add(voegEnd);
      }
    }
  }
  return [...breaks].sort((a, b) => a - b);
}

// PANEEL_OPTIMALISATIE — verdeel `total` lagen over `nRow` rijen, elke rij EVEN, zo gelijk mogelijk.
// Een oneven rest (1 laag) gaat naar de bovenste rij (die wordt sowieso door de zone-top begrensd → mag oneven).
function distributeEvenCourses(total, nRow) {
  const parts = new Array(nRow).fill(0);
  let base = Math.floor(total / nRow);
  if (base % 2 === 1) base -= 1;
  base = Math.max(2, base);
  for (let i = 0; i < nRow; i++) parts[i] = base;
  let rem = total - base * nRow;
  let i = 0;
  while (rem >= 2) { parts[i % nRow] += 2; rem -= 2; i++; }
  if (rem === 1) parts[nRow - 1] += 1;
  return parts;
}

// PANEEL_OPTIMALISATIE — optimale rechthoek-verdeling. Kolommen: gelijk verdeeld, elke naad gesnapt op
// de dichtstbijzijnde stootvoeg (want daar mag gezaagd worden). Rijen: even aantal lagen (halfsteens)
// én binnen het gewicht — de breedste kolom bepaalt de maximale rijhoogte (opp × kg/m² ≤ maxKg / +10).
// Paneelvorm zelf komt uit buildPanelsFromBreaks (ongewijzigd); alleen de break-posities zijn slimmer.
function optimalPanelizeZone(zone, basePanel, material, verband, snapFn = null) {
  const W = round2(zone.width), H = round2(zone.height);
  if (W <= 0 || H <= 0) return null;
  const zoneX1 = round2(zone.x), zoneY1 = round2(zone.y);
  const steenL = material.steenL ?? 210, steenH = material.steenH ?? 50, lint = material.lint ?? 12, stoot = material.stoot ?? 10;
  const lagenmaat = verband === 'staand_tegelverband' ? (steenL + lint) : (steenH + lint);
  if (lagenmaat <= 0) return null;

  // ── kolommen: gelijk + naad op stootvoeg ──
  const targetW = basePanel.targetWidth ?? (5 * steenL + 4 * stoot);
  const plateW = basePanel.width ?? 3005;
  let nCol = Math.max(1, Math.round(W / Math.max(1, Math.min(targetW, plateW))));
  while (W / nCol > plateW + 0.5) nCol++;   // nooit breder dan de plaat
  // KOLOM-NAAD OP DE DOORLOPENDE STEEN: snap elke naad naar een HELE-STEEN-positie (k×(steenL+stoot))
  // gemeten vanaf de bond-oorsprong — doorlopend, óók over openingen heen. Zo liggen ALLE naden in
  // dezelfde stootvoeg-fase → koppelstrippen enkel OM-EN-OM (elke andere laag is volledig schoon), i.p.v.
  // de ene naad op een halve steen en de andere op een hele → elke laag raak. Vult tevens proposal 3 in.
  const pitch = steenL + stoot;
  const originX = zone.bondOriginX ?? 0;   // doorlopende steen-oorsprong (plane = 0, of de zone-x)
  const xInner = [];
  for (let i = 1; i < nCol; i++) {
    const idealAbs = zoneX1 + (i * W) / nCol;
    const snapAbs = originX + Math.round((idealAbs - originX) / pitch) * pitch;   // dichtstbijzijnde hele steen
    if (snapAbs > zoneX1 + 0.5 && snapAbs < zoneX1 + W - 0.5) xInner.push(round2(snapAbs));
  }
  const xBreaks = [...new Set([zoneX1, ...xInner, round2(zoneX1 + W)])].sort((a, b) => a - b);
  let maxColW = 1;
  for (let i = 0; i < xBreaks.length - 1; i++) maxColW = Math.max(maxColW, xBreaks[i + 1] - xBreaks[i]);

  // ── rijen: even lagen én binnen gewicht (breedste kolom bepaalt maxhoogte) ──
  const totalCourses = Math.max(1, Math.round(H / lagenmaat));
  const area50 = basePanel.maxArea50MM2 ?? Infinity;
  const area60 = basePanel.maxArea60MM2 ?? Infinity;
  const evenFloor = (n) => Math.max(2, Math.floor(n / 2) * 2);
  const maxCHard = isFinite(area60) ? Math.max(2, evenFloor((area60 / maxColW) / lagenmaat)) : totalCourses;
  const maxCPref = isFinite(area50) ? Math.max(2, evenFloor((area50 / maxColW) / lagenmaat)) : maxCHard;
  let nRow = Math.max(1, Math.ceil(totalCourses / Math.max(2, maxCPref)));
  let rowCourses;
  for (let guard = 0; guard < 100; guard++) {
    rowCourses = distributeEvenCourses(totalCourses, nRow);
    if (Math.max(...rowCourses) <= maxCHard || nRow >= totalCourses) break;
    nRow++;
  }
  // HORIZONTALE NAAD OP DE LINTVOEG: snap elke interne rij-naad naar de doorlopende laag-lijn, zodat een strip
  // nooit horizontaal wordt doorsneden (dat kan enkel in een lintvoeg).
  const courseOriginY = zone.bondOriginY ?? 0;
  const snapYcourse = (y) => courseOriginY + Math.round((y - courseOriginY) / lagenmaat) * lagenmaat;
  // PANEEL_BANDEN: snap de naad op de ECHTE steenrij (snapFn = snapToRowY, vanaf startLijn/peil) i.p.v.
  // courseOriginY=0 — zo valt de naad in de lintvoeg, óók boven een raam. Vlag uit → oude snap (byte-identiek).
  const snapY = (isPaneelBanden() && snapFn) ? snapFn : snapYcourse;
  const yBreaks = [zoneY1];
  let acc = 0;
  for (let i = 0; i < rowCourses.length - 1; i++) {
    acc += rowCourses[i];
    const yLine = round2(snapY(zoneY1 + acc * lagenmaat));   // op een lintvoeg
    if (yLine > zoneY1 + 1 && yLine < zoneY1 + H - 1) yBreaks.push(yLine);
  }
  yBreaks.push(round2(zoneY1 + H));
  const yb = [...new Set(yBreaks)].sort((a, b) => a - b);

  const bpW = basePanel.width, bpH = basePanel.maxHeight ?? basePanel.height;
  const orientation = (W <= bpW && H <= (bpH ?? H)) ? 'liggend' : 'staand';
  const panels = buildPanelsFromBreaks(zone, xBreaks, yb, orientation, null).filter((p) => p.width > 0.001 && p.height > 0.001);
  if (!panels.length) return null;
  // PANEEL_BANDEN: haal de zaagsnede (PANEL_GAP = 3mm kerf) af bij elke naad die NIET de ECHTE gevelrand/gevel-top
  // is — rechterrand −3 (stootvoeg-naad), bovenrand −3 (lintvoeg-naad). Referentie = de GROEP-gevelrand
  // (zone.gevelRight/gevelTop) i.p.v. de zone-lokale rand, zodat raamzijde-panelen én band-onder-raam-tops óók de
  // −3 krijgen; alleen x=groupWidth en y=groupHeight niet. Onder-/linkerrand nooit −3 (directioneel, 1× per naad).
  // Vlag uit → geen aftrek (byte-identiek).
  if (isPaneelBanden()) {
    const gevelR = zone.gevelRight ?? round2(xBreaks[xBreaks.length - 1]);
    const gevelT = zone.gevelTop ?? round2(yb[yb.length - 1]);
    for (const p of panels) {
      if (round2(p.x + p.width) < gevelR - 0.5) p.width = round2(p.width - PANEL_GAP);
      if (round2(p.y + p.height) < gevelT - 0.5) p.height = round2(p.height - PANEL_GAP);
      p.area = round2(p.width * p.height);
    }
  }
  return { ok: true, orientation, panelCount: panels.length, panels };
}

export function panelizeZone(zone, battenYs, basePanel, snapFn = null, material = null, verband = null) {
  const bpW = basePanel.width;
  const bpH = basePanel.height;
  const minPanelH = basePanel.minHeight ?? 800;
  const targetW = basePanel.targetWidth ?? bpW;

  const zoneX1 = round2(zone.x);
  const zoneX2 = round2(zone.x + zone.width);
  const zoneY1 = round2(zone.y);
  const zoneY2 = round2(zone.y + zone.height);

  // PANEEL_OPTIMALISATIE (vlag, default AAN): snipper-opruiming — een zone smaller dan 50 mm (bv. een
  // 20 mm muurstrook tussen twee dicht-op-elkaar-staande ramen) wordt géén paneel (op locatie met losse
  // strips gevuld) i.p.v. een onwerkbaar 20 mm-paneeltje. Noodrem uit → oude gedrag (wél een paneeltje).
  if (isPaneelOptimalisatie() && round2(zone.width) < 50) {
    return { ok: true, orientation: 'liggend', panelCount: 0, panels: [] };
  }

  // PANEEL_OPTIMALISATIE (vlag, default AAN): optimale verdeling (kolommen op de DOORLOPENDE steen →
  // koppelstenen om-en-om, rijen even lagen+gewicht → geen mini-panelen) voor de horizontale/staande
  // verbanden. Wildverband/groothuis houden hun eigen pad.
  if (isPaneelOptimalisatie() && material != null && verband != null
    && verband !== 'wildverband' && verband !== 'groothuis_wildverband' && verband !== 'groothuis_wildverband_2') {
    const opt = optimalPanelizeZone(zone, basePanel, material, verband, snapFn);
    if (opt) return opt;
  }

  // PANEEL_14LAAG (vlag): halfsteens paneelhoogte vast op 14 lagen. pitchV = 14·lagenmaat; paneel = pitchV−3
  // (= 14·steenH + 13·lint + (lint−3)), onder course-flush, 3 mm voeg naar boven. yBreaks worden hieronder
  // overschreven (i.p.v. de battenYs/gewicht-splits); de latten worden in de call-sites uit de paneelvoegen
  // afgeleid. Vlag uit → onaangeroerd (byte-identiek).
  const _lagenmaat14 = (material?.steenH ?? 50) + (material?.lint ?? 12);
  const use14Laag = isPaneel14Laag() && verband === 'halfsteens' && material != null && _lagenmaat14 > 0
    && zone.height > (14 * _lagenmaat14 - 3 + 0.5);

  const ySet = new Set([zoneY1, zoneY2]);
  for (const by of battenYs) {
    const byr = round2(by);
    if (byr > zoneY1 + 0.001 && byr < zoneY2 - 0.001) ySet.add(byr);
  }
  let yBreaks = [...ySet].sort((a, b) => a - b);

  if (bpH > 0) {
    const extraY = [];
    for (let i = 0; i < yBreaks.length - 1; i++) {
      const span = yBreaks[i + 1] - yBreaks[i];
      if (span > bpH + 0.001) {
        let nSteps = Math.max(1, Math.round(span / bpH));
        while (nSteps > 1 && span / nSteps < minPanelH) nSteps--;
        for (let s = 1; s < nSteps; s++) {
          const raw = round2(yBreaks[i] + s * (span / nSteps));
          extraY.push(snapFn ? round2(snapFn(raw)) : raw);
        }
      }
    }
    if (extraY.length) {
      const newSet = new Set([...yBreaks.map(round2), ...extraY.map(round2)]);
      yBreaks = [...newSet].sort((a, b) => a - b);
    }
  }

  const effectiveMinH = Math.min(minPanelH, zone.height);
  yBreaks = mergeSmallSegments(yBreaks, effectiveMinH);

  const maxH = basePanel.maxHeight ?? bpH;
  if (maxH > 0 && yBreaks.length > 2) {
    const totalSpan = yBreaks[yBreaks.length - 1] - yBreaks[0];
    const idealSteps = Math.max(1, Math.ceil(totalSpan / maxH));
    const currentSteps = yBreaks.length - 1;
    if (idealSteps < currentSteps) {
      const stepH = totalSpan / idealSteps;
      if (stepH >= effectiveMinH) {
        const newBreaks = [yBreaks[0]];
        for (let s = 1; s < idealSteps; s++) {
          const raw = round2(yBreaks[0] + s * stepH);
          newBreaks.push(snapFn ? round2(snapFn(raw)) : raw);
        }
        newBreaks.push(yBreaks[yBreaks.length - 1]);
        yBreaks = [...new Set(newBreaks)].sort((a, b) => a - b);
      }
    }
  }

  // PANEEL_14LAAG: overschrijf yBreaks met de 14-laag-pitch (paneel = pitchV−3; de 3mm-voeg naar boven komt
  // uit de verticale PANEL_GAP hieronder). Rest < 200mm smelt in het paneel eronder (zie compute14LaagYBreaks).
  if (use14Laag) {
    yBreaks = compute14LaagYBreaks(zoneY1, zoneY2, _lagenmaat14);
  }

  const nCols = Math.max(1, Math.round(zone.width / targetW));

  const stoot = material?.stoot ?? 10;
  const hasStripAlign = material != null && verband != null && nCols > 1;
  // HALFSTEENS_PANEL_5STREK: vaste paneelbreedte = 5 strekken + (stootvoeg − 3 mm speling), GROEP-lokaal
  // (de bond begint op groep-x=0, en zone.x is groep-lokaal). De snijposities k·pitch − 3 vallen zo in de
  // stootvoeg van de even rij → koppelsteen om-en-om + volgend paneel begint met een strek. Verspringen vervalt.
  const use5Strek = isHalfsteensPanel5Strek() && verband === 'halfsteens' && material != null
    && zone.width > (5 * (material.steenL + stoot) - 3 + 0.5);
  let xBreaks;

  if (use5Strek) {
    const pitch = 5 * (material.steenL + stoot);   // 5 strekken + 5 stootvoegen
    const boardVoeg = 3;                            // speling tbv plaatsing panelen
    xBreaks = [zoneX1];
    for (let k = Math.ceil((zoneX1 + boardVoeg) / pitch); k * pitch - boardVoeg < zoneX2 - 0.001; k++) {
      const e = round2(k * pitch - boardVoeg);
      if (e > zoneX1 + 0.5 && e < zoneX2 - 0.5) xBreaks.push(e);
    }
    xBreaks.push(zoneX2);
    xBreaks = [...new Set(xBreaks)].sort((a, b) => a - b);
  } else if (hasStripAlign) {
    const candidates = collectStootvoegBreaks(zone.width, material, verband, stoot);
    const rawBreaks = chooseBreaks(0, zone.width, candidates, targetW, targetW);
    xBreaks = rawBreaks.map(x => round2(zoneX1 + x));
    if (xBreaks[0] !== zoneX1) xBreaks.unshift(zoneX1);
    if (xBreaks[xBreaks.length - 1] !== zoneX2) xBreaks.push(zoneX2);
    xBreaks = [...new Set(xBreaks)].sort((a, b) => a - b);
  } else {
    const xSet = new Set([zoneX1, zoneX2]);
    for (let i = 1; i < nCols; i++) {
      xSet.add(round2(zoneX1 + (i * zone.width) / nCols));
    }
    xBreaks = [...xSet].sort((a, b) => a - b);
  }

  let xBreaksOdd = null;
  if (!use5Strek && basePanel.verspringen && nCols > 1) {
    if (hasStripAlign) {
      const candidates = collectStootvoegBreaks(zone.width, material, verband, stoot);
      const halfShift = targetW / 2;
      const shiftedCandidates = candidates.map(x => round2(x + halfShift)).filter(x => x > 0.001 && x < zone.width - 0.001);
      const allCandidates = [...new Set([...candidates, ...shiftedCandidates])].sort((a, b) => a - b);
      const rawBreaks = chooseBreaks(0, zone.width, allCandidates, targetW, targetW);
      xBreaksOdd = rawBreaks.map(x => round2(zoneX1 + x));
      if (xBreaksOdd[0] !== zoneX1) xBreaksOdd.unshift(zoneX1);
      if (xBreaksOdd[xBreaksOdd.length - 1] !== zoneX2) xBreaksOdd.push(zoneX2);
      xBreaksOdd = [...new Set(xBreaksOdd)].sort((a, b) => a - b);
    } else {
      const panelW = zone.width / nCols;
      const halfW = panelW / 2;
      const oddSet = new Set([zoneX1, zoneX2]);
      oddSet.add(round2(zoneX1 + halfW));
      for (let i = 1; i < nCols; i++) {
        const x = round2(zoneX1 + halfW + i * panelW);
        if (x > zoneX1 + 0.001 && x < zoneX2 - 0.001) oddSet.add(x);
      }
      xBreaksOdd = [...oddSet].sort((a, b) => a - b);
    }
  }

  const fitsLandscape = zone.width <= bpW && zone.height <= bpH;
  const orientation = fitsLandscape ? 'liggend' : 'staand';
  const panels = buildPanelsFromBreaks(zone, xBreaks, yBreaks, orientation, xBreaksOdd);

  if ((hasStripAlign || use5Strek) && panels.length > 0) {
    for (const panel of panels) {
      const xb = panel.staggered && xBreaksOdd ? xBreaksOdd : xBreaks;
      const colIdx = xb.findIndex(x => Math.abs(x - panel.x) < 0.01);
      const isFirst = colIdx <= 0;
      const isLast = colIdx >= 0 && colIdx >= xb.length - 2;
      if (!isFirst) {
        panel.x = round2(panel.x + PANEL_GAP);
        panel.width = round2(panel.width - PANEL_GAP);
      }
      if (!isLast) {
        panel.width = round2(panel.width);
      }
      panel.area = round2(panel.width * panel.height);
    }
  }

  // PANEEL_14LAAG: verticale voeg — schuif niet-onderste panelen PANEL_GAP omhoog + hoogte −PANEL_GAP
  // (spiegelbeeld van de horizontale), zodat elk paneel pitchV−3 hoog is met een 3mm voeg erboven.
  if (use14Laag && panels.length > 0) {
    for (const panel of panels) {
      if (Math.abs(panel.y - zoneY1) >= 0.01) {   // niet de onderste rij
        panel.y = round2(panel.y + PANEL_GAP);
        panel.height = round2(panel.height - PANEL_GAP);
        panel.area = round2(panel.width * panel.height);
      }
    }
  }

  const validPanels = panels.filter(p => p.width > 0.001 && p.height > 0.001);
  if (!validPanels.length) {
    const fallback = {
      id: `${zone.id}-P1`,
      zoneId: zone.id,
      row: 1, col: 1,
      x: zoneX1, y: zoneY1,
      width: round2(zone.width), height: round2(zone.height),
      area: round2(zone.width * zone.height),
      orientation: 'staand',
      staggered: false,
      isFallback: true,
    };
    return { ok: true, orientation: 'staand', panelCount: 1, panels: [fallback] };
  }
  return { ok: true, orientation, panelCount: validPanels.length, panels: validPanels };
}

export function detectKoppelstrippen(panels, facadeRows, mat, verband) {
  if (verband === 'wildverband') return [];
  const stripH = verband === 'staand_tegelverband' ? mat.steenL : mat.steenH;
  const koppel = [];
  for (const row of facadeRows) {
    for (const piece of (row.pieces ?? [])) {
      const sx = round2(piece.start);
      const ex = round2(piece.start + piece.length);
      const spanning = [];
      for (const panel of panels) {
        const px1 = round2(panel.x);
        const px2 = round2(panel.x + panel.width);
        const py1 = round2(panel.y);
        const py2 = round2(panel.y + panel.height);
        // Alleen VERTICALE doorsnijding telt als koppelstrip: de steenrij moet VOLLEDIG binnen dit paneel
        // vallen (horizontaal snijden we altijd in een lintvoeg → een strip wordt nooit horizontaal gedeeld).
        if (row.y < py1 - 0.5 || row.y + stripH > py2 + 0.5) continue;
        if (ex <= px1 + 0.5 || sx >= px2 - 0.5) continue;
        spanning.push(panel);
      }
      if (spanning.length >= 2) {
        koppel.push({
          x: sx, y: row.y, width: round2(ex - sx), height: stripH,
          label: piece.label,
          strip_type: 'koppelstrip',
          prefab_gluing: false,
          installation_phase: 'onsite assembly',
          included_in_quantities: true,
          crosses_panel_boundary: true,
          panelIds: spanning.map(p => p.id),
        });
      }
    }
  }
  return koppel;
}

// PANEEL_OPTIMALISATIE — voeg verticaal-gestapelde panelen in DEZELFDE kolom samen tot één paneel
// (bv. P6+P7): zelfde x én breedte, ze raken (gat ≤ paneelvoeg), er zit GEEN opening in het samengevoegde
// vlak, en samen blijven ze binnen de plaat-maat én het gewichtsplafond (opp ≤ maxArea60 = maxKg+10).
// Zo verdwijnen de mini-panelen die ontstonden doordat een kolom op een latten-lijn werd opgeknipt terwijl
// het gewicht één paneel toeliet. Losgekoppeld van de verbanddetectie → werkt op de al-gepanaliseerde set.
export function mergeStackedColumns(panels, openings, basePanel) {
  if (!isPaneelOptimalisatie()) return panels;   // vlag uit → byte-identiek (geen merge)
  if (!panels?.length) return panels;
  const maxArea = basePanel?.maxArea60MM2 ?? Infinity;        // gewichtsplafond (maxKg+10) als oppervlak
  const maxDim = (basePanel?.width ?? 3005) + 0.5;            // plaat-maat (langste zijde)
  const ops = openings ?? [];
  const key = (p) => `${Math.round(p.x)}_${Math.round(p.width)}`;
  const cols = new Map();
  for (const p of panels) { const k = key(p); if (!cols.has(k)) cols.set(k, []); cols.get(k).push(p); }
  const out = [];
  for (const ps of cols.values()) {
    ps.sort((a, b) => a.y - b.y);
    let cur = { ...ps[0] };
    for (let i = 1; i < ps.length; i++) {
      const nx = ps[i];
      const touch = Math.abs(nx.y - (cur.y + cur.height)) <= PANEL_GAP + 1;
      const uY2 = nx.y + nx.height;
      const uH = uY2 - cur.y;
      const uArea = uH * cur.width;
      // geen opening die het samengevoegde rechthoek raakt (nooit over een raam/deur heen mergen)
      const hitsOpening = ops.some((o) => (o.x ?? 0) < cur.x + cur.width - 1 && (o.x ?? 0) + (o.width ?? 0) > cur.x + 1
        && (o.y ?? 0) < uY2 - 1 && (o.y ?? 0) + (o.height ?? 0) > cur.y + 1);
      if (touch && !hitsOpening && uH <= maxDim && uArea <= maxArea + 1) {
        cur = { ...cur, height: round2(uH), area: round2(uArea), mergedStack: true };
      } else { out.push(cur); cur = { ...nx }; }
    }
    out.push(cur);
  }
  return out;
}

// PANEEL_RASTER — verticale paneelnaden op de 5-strek-stootvoeg (k·pitch − 3, GEMETEN VANAF DE BOND-OORSPRONG
// x=0, net als halfsteensPanel5Strek) → de naad valt in de stootvoeg → koppelstrippen om-en-om. GEEN naden op de
// raamranden: de ramen worden hierna uit de panelen GESNEDEN (raamrand = zaagsnede, geen paneel-naad) zodat er
// ook náást een raam geen koppelstrip op elke rij komt. Rand-restje < ½ pitch → in het vorige paneel opgenomen.
// Niet-halfsteens: vaste breedte vanaf de veldrand (fallback, geen bond-anker).
function rasterColumnJoints(Lx, Rx, breedte, mat, verband) {
  const unit = (mat?.steenL ?? 210) + (mat?.stoot ?? 10);
  let std = [], pitch;
  if (verband === 'halfsteens' && unit > 1) {
    const nStrek = Math.max(1, Math.round((breedte || 1130) / unit));   // 1130 → 5 strekken
    pitch = nStrek * unit;
    for (let k = 1; k * pitch - 3 < Rx - 0.5; k++) { const e = round2(k * pitch - 3); if (e > Lx + 0.5) std.push(e); }
  } else {
    pitch = breedte || 1130;
    for (let x = Lx + pitch; x < Rx - 0.5; x += pitch) std.push(round2(x));
  }
  let J = [...new Set([round2(Lx), round2(Rx), ...std])].sort((a, b) => a - b);
  // Klein paneel naast een raam wordt GEACCEPTEERD: alleen echte splinters (< RASTER_MIN_COL) én veld-restjes
  // worden in de buur opgenomen, zodat de veld-kolommen (bv. de laatste) hun volle 5-strek-maat houden.
  const mergeMin = 200;
  for (let removed = true; removed;) {
    removed = false;
    for (let i = 1; i < J.length - 1; i++) {
      if (J[i] - J[i - 1] < mergeMin || J[i + 1] - J[i] < mergeMin) { J.splice(i, 1); removed = true; break; }
    }
  }
  return J;
}

// PANEEL_RASTER — horizontale paneelnaden: target-hoogte H (default 789) MAAR gesnapt op de course-lijnen uit de
// bond (facadeRows.y = onderkant van elke steenrij) → de naad valt in een lintvoeg → geen doorgesneden steen.
// Laatste rest < ½ H → in de rij eronder opgenomen.
function rasterRowJoints(By, Ty, hoogte, facadeRows) {
  const H = hoogte > 10 ? hoogte : 789;
  const courses = (facadeRows ?? []).map((r) => r.y).filter((y) => y > By + 1 && y < Ty - 1).sort((a, b) => a - b);
  const snap = (y) => courses.length ? courses.reduce((b, c) => Math.abs(c - y) < Math.abs(b - y) ? c : b, courses[0]) : round2(y);
  const J = [round2(By)];
  for (let y = By + H; y < Ty - 1; y += H) { const s = round2(snap(y)); if (s > J[J.length - 1] + 10 && s < Ty - 1) J.push(s); }
  if (J.length >= 2 && Ty - J[J.length - 1] < H * 0.5) J.pop();   // laatste rest → rij eronder groter
  J.push(round2(Ty));
  return [...new Set(J)].sort((a, b) => a - b);
}

// PANEEL_RASTER — VAST raster met UNIFORME rijhoogte (14-laag, voor montagegemak van de achterconstructie).
// De rijen liggen course-verankerd over de HELE gevel (rasterRowJoints, niet bij ramen gesplitst → overal
// dezelfde hoogte). Per rij tegelen we de kolommen 5-strek (bond-verankerd → naad in de stootvoeg → koppel-
// strippen om-en-om). Een raam dat een rij VOLLEDIG dekt is een gat: de segmenten links/rechts stoppen op de
// raamrand (waar de strips eindigen; rest-strook < ½ maat opgenomen → geen splinter, geen naad naast het raam).
// Een raam dat een rij DEELS dekt (boven/onderrij) wordt als UITSNEDE (hoek eruit) op het paneel gezet.
function buildRasterPanels({ groupWidth, groupHeight, openings, trimL, trimR, By, Ty, breedte, hoogte, mat, verband, facadeRows }) {
  const Lx = trimL, Rx = round2(groupWidth - trimR);
  if (Rx - Lx < 10 || Ty - By < 10) return [];
  const H = hoogte > 10 ? hoogte : 789;
  const wins = (openings ?? []).map((o) => ({ x0: o.x, x1: o.x + o.width, y0: o.y, y1: o.y + o.height }))
    .filter((o) => o.x1 > o.x0 + 1 && o.y1 > o.y0 + 1);
  const Hy = rasterRowJoints(By, Ty, H, facadeRows);   // UNIFORME 14-laag rijen over de hele gevel
  const panels = []; let id = 1;
  for (let ri = 0; ri < Hy.length - 1; ri++) {
    const ry0 = Hy[ri], ry1 = Hy[ri + 1];
    const full = wins.filter((w) => w.y0 <= ry0 + 1 && w.y1 >= ry1 - 1);                                    // dekt rij volledig → gat
    const partial = wins.filter((w) => w.y1 > ry0 + 1 && w.y0 < ry1 - 1 && !(w.y0 <= ry0 + 1 && w.y1 >= ry1 - 1)); // deels → uitsnede
    let segs = [[Lx, Rx]];
    for (const w of full) segs = segs.flatMap(([a, b]) => {
      const s = Math.max(a, w.x0), e = Math.min(b, w.x1);
      if (e <= s) return [[a, b]];
      const out = []; if (s - a > 1) out.push([a, s]); if (b - e > 1) out.push([e, b]); return out;
    });
    for (const [sx0, sx1] of segs) {
      if (sx1 - sx0 < 10) continue;
      const Vx = rasterColumnJoints(sx0, sx1, breedte, mat, verband);   // 5-strek per solide segment
      for (let ci = 0; ci < Vx.length - 1; ci++) {
        const cx0 = Vx[ci], cx1 = Vx[ci + 1];
        const holes = [];
        for (const w of partial) {
          const hx0 = Math.max(cx0, w.x0), hx1 = Math.min(cx1, w.x1), hy0 = Math.max(ry0, w.y0), hy1 = Math.min(ry1, w.y1);
          if (hx1 - hx0 > 0.5 && hy1 - hy0 > 0.5) holes.push({ x: round2(hx0), y: round2(hy0), width: round2(hx1 - hx0), height: round2(hy1 - hy0) });
        }
        if (holes.length === 1 && holes[0].width >= cx1 - cx0 - 1 && holes[0].height >= ry1 - ry0 - 1) continue;  // cel geheel weg
        const w = round2(cx1 - cx0), h = round2(ry1 - ry0);
        if (w < 10 || h < 1) continue;
        const p = { id: `R${id}`, zoneId: 'raster', row: ri + 1, col: ci + 1, x: round2(cx0), y: round2(ry0), width: w, height: h, area: round2(w * h), orientation: 'liggend', staggered: false };
        if (holes.length) p.holes = holes;
        panels.push(p);
        id++;
      }
    }
  }
  // 3 mm plaatsingsspeling tussen aangrenzende panelen (net als PANEL_GAP in de banden-methode): krimp elk
  // paneel met PANEL_GAP aan de zijde waar een BUURpaneel tegenaan ligt (rechts/boven); randen tegen de gevel
  // of een raam blijven vol. Adjacentie eerst op de ONgekrompen maten bepalen, dan pas krimpen.
  const gapFlags = panels.map((P) => ({
    right: panels.some((Q) => Q !== P && Math.abs(Q.x - (P.x + P.width)) < 1 && Math.min(Q.y + Q.height, P.y + P.height) - Math.max(Q.y, P.y) > 5),
    above: panels.some((Q) => Q !== P && Math.abs(Q.y - (P.y + P.height)) < 1 && Math.min(Q.x + Q.width, P.x + P.width) - Math.max(Q.x, P.x) > 5),
  }));
  panels.forEach((P, i) => {
    if (gapFlags[i].right) P.width = round2(P.width - PANEL_GAP);
    if (gapFlags[i].above) P.height = round2(P.height - PANEL_GAP);
    P.area = round2(P.width * P.height);
  });
  return panels;
}

// UNIFIED_PANELS — ÉÉN gedeelde paneel-berekening voor alle weergaven (2D/3D/export/werktekening/
// uittrekstaat/mal). Neemt de RAUWE groep-materiaalmaat + het steenstrip-artikel en past het artikel
// ALTIJD toe (effMat) — net als de strips (facadeData.rows) → panelen liggen overal op dezelfde steek als
// de strips → koppelstrippen overal op dezelfde plek. Ventilatie-openingen worden ALTIJD uit de panel-
// zones gefilterd (net als 2D/3D/export). Reproduceert het bestaande View2D-pad (het correcte) 1-op-1:
// basePanel/battenYs/snap/zones/panelizeZone/mergeStackedColumns/height-filter/strip-overlap-filter/
// gaten/startlijn. Alleen voor de rechthoek-verbanden; wildverband/groothuis houden hun eigen pad in de views.
export function buildGroupPanels({ groupWidth, groupHeight, groupOpenings = [], rows = null, penanten = [], baseMat, stripArt = null, panelen, latten = null, verband, sparingRects = [], startLijn = null, endExtensions = null }) {
  if (!panelen?.enabled) return { panels: [], effMat: baseMat };
  const effMat = stripArt ? { ...baseMat, steenL: stripArt.steenL, steenH: stripArt.steenH } : baseMat;
  const penantOpenings = (penanten ?? []).map((p, i) => {
    const px = (p.x ?? 0) + 20, pw = Math.max(1, p.breedte ?? 400) - 40;
    return pw > 0 ? { id: `pen_${i}`, x: px, y: 0, width: pw, height: groupHeight, polyPts: null } : null;
  }).filter(Boolean);
  const basePanel = computeEffectiveBasePanel(panelen, effMat.brickWeightM2 ?? 40, effMat);
  const maxInterval = Math.max(50, latten?.maxInterval ?? 400);
  const lintHalf = (effMat.lint ?? 12) / 2;
  const rowYs = (rows ?? []).map((r) => r.y).sort((a, b) => a - b);
  const snapToRowY = rowYs.length
    ? (y) => { const t = y + lintHalf; return rowYs.reduce((best, ry) => Math.abs(ry - t) < Math.abs(best - t) ? ry : best); }
    : null;
  const battenYs = generateBattenPositions(groupHeight, effMat, maxInterval, { minHOH: latten?.minHOH, maxHOH: latten?.maxHOH, targetPanelH: panelen?.hoogte, minPanelH: 800 }).map((y) => snapToRowY ? snapToRowY(y) : y);
  // PANEEL_BANDEN: snap de verticale extent van een raam (alléén voor de ZONE-vorming, niet de strips) op de
  // coursing → band-onder-raam TOP op de course onder de dorpel (S), band-boven-raam ONDER op de course boven de
  // latei (L). buildFacadeZones maakt dan vol-brede banden op S/L (doorgetrokken over de breedte); de −3 komt uit
  // de kerf-lus in optimalPanelizeZone. Alleen rechthoekige ramen (concave polyPts ongemoeid). rowYs = course-
  // onderkanten (startLijn + k·lagenmaat). Vlag uit → ruwe raamrand (byte-identiek).
  const snapWin = (op) => {
    if (!isPaneelBanden() || !rowYs.length || (op.polyPts?.length >= 3)) return op;
    const below = rowYs.filter((c) => c <= op.y + 0.5);
    const above = rowYs.filter((c) => c >= op.y + op.height - 0.5);
    const S = below.length ? below[below.length - 1] : op.y;
    const L = above.length ? above[0] : op.y + op.height;
    return { ...op, y: S, height: round2(L - S) };
  };
  // PANEEL_BANDEN: laat een opening die de gevel-top/maxHoogte MARGINAAL doorsnijdt (zichtbare hoogte binnen de
  // gevel < 1 laag) de paneelzones NIET splitsen. Bij een op maxHoogte geklemde verdiepingsgevel poken de bovenste
  // ramen soms 1 mm door de klemlijn → buildFacadeZones maakt daar een degenererende dunne band die
  // mergeStackedColumns enkel in de smalle (getrimde) kolom opslokt → 1 top-paneel dat hoger is dan de rest van de
  // rij. Door zo'n rest-opening te negeren loopt de bovenband vol-breed door tot de gevel-top → uniforme bovenrij.
  // De STRIPS tonen de opening ongemoeid (dit raakt alleen de paneel-zonevorming). Vlag uit → alle openingen mee
  // (byte-identiek).
  const _lagenmaatPB = (effMat.steenH ?? 50) + (effMat.lint ?? 12);
  const openings = (groupOpenings ?? []).filter((op) => op.type !== 'ventilatie')
    .filter((op) => !isPaneelBanden() || (Math.min((op.y ?? 0) + (op.height ?? 0), groupHeight) - Math.max(op.y ?? 0, 0)) >= _lagenmaatPB)
    .map((op) => { const s = snapWin(op); return { id: `op_${op.x}_${op.y}`, x: s.x, y: s.y, width: s.width, height: s.height, polyPts: s.polyPts ?? null }; });
  const allOpenings = [...openings, ...(penantOpenings ?? [])];
  // END_TRIM: een negatief einduiteinde (inkorten) verkleint het PANELISATIE-DOMEIN VÓÓR de optimalisatie
  // (buitenste zone tot [trimL, groupWidth−trimR]) → panelizeZone HERVERDEELT optimaal over de kortere breedte,
  // i.p.v. een afgehakt restpaneel. Vlag uit → trimL=trimR=0 → geen clip (byte-identiek).
  const _eeT = endExtensions ?? {};
  const _trimL = isEndTrim() ? Math.max(0, -(_eeT.left?.panels ?? 0)) : 0;
  const _trimR = isEndTrim() ? Math.max(0, -(_eeT.right?.panels ?? 0)) : 0;
  // PANEEL_BANDEN: bij LINKS VERLENGEN schuift buildFullGroupFacadePattern de strip-pieces −extendLeft
  // (pattern.js:718) → de stootvoeg-fase schuift mee. De paneel-kolomnaad snapt echter op k·pitch vanaf
  // bondOriginX=0 → die zou NIET meeschuiven → naad valt niet meer in de even-rij-stootvoeg → koppelstrip op
  // ELKE rij i.p.v. om-en-om. Laat daarom de naad-oorsprong meeschuiven (−extendLeft). Rechts-verlengen laat
  // de fase ongemoeid (pieces niet verschoven) en trimmen ook niet → geen correctie. Vlag uit → 0 (byte-identiek).
  const _extendLeftStrips = Math.max(0, _eeT.left?.strips ?? 0);
  let panels = [];
  // PANEEL_RASTER (vlag paneelRaster + per-groep panelen.methode==='raster'): alternatieve paneelmethode
  // náást de banden-methode — uniform raster vanaf de startlijn, kolommen gesnapt op de raamranden. Vlag UIT
  // óf methode!=='raster' → de ELSE-tak draait = exact het origineel (byte-identiek).
  if (isPaneelRaster() && panelen?.methode === 'raster') {
    const _rW = panelen.rasterBreedte ?? 1130, _rH = panelen.rasterHoogte ?? 789;
    const _By = (startLijn != null && startLijn !== 0) ? startLijn : 0;   // raster start op de startlijn
    panels = buildRasterPanels({ groupWidth, groupHeight, openings: allOpenings, trimL: _trimL, trimR: _trimR, By: _By, Ty: groupHeight, breedte: _rW, hoogte: _rH, mat: effMat, verband, facadeRows: rows });
  } else {
    for (let zone of buildFacadeZones(groupWidth, groupHeight, allOpenings)) {
      if (_trimL > 0 || _trimR > 0) {
        const zx1 = Math.max(zone.x, _trimL), zx2 = Math.min(zone.x + zone.width, groupWidth - _trimR);
        if (zx2 - zx1 <= 1) continue;                     // zone valt volledig binnen de inkorting → weg
        zone = { ...zone, x: zx1, width: zx2 - zx1 };
      }
      // PANEEL_BANDEN: geef de zone de ECHTE groep-gevelrand mee → de kerf-lus (optimalPanelizeZone) weet welke
      // paneelrand de ware gevelrand/-top is (géén −3) en welke een interne/raam-/bandnaad (wél −3).
      zone = { ...zone, gevelRight: groupWidth, gevelTop: groupHeight };
      if (isPaneelBanden() && _extendLeftStrips > 0) zone.bondOriginX = -_extendLeftStrips;
      const res = panelizeZone(zone, battenYs, basePanel, snapToRowY, effMat, verband);
      if (res.ok) panels.push(...res.panels);
    }
    panels = mergeStackedColumns(panels, allOpenings, basePanel);
  }
  panels = panels.filter((p) => p.height >= 200 && p.width >= 10);
  if (rows && verband !== 'wildverband') {
    const rowH = verband === 'staand_tegelverband' ? effMat.steenL : effMat.steenH;
    panels = panels.filter((panel) => {
      for (const row of rows) {
        if (!row?.pieces?.length) continue;
        if (row.y + rowH <= panel.y || row.y >= panel.y + panel.height) continue;
        for (const piece of row.pieces) {
          const s = Math.max(piece.start, panel.x), e = Math.min(piece.start + piece.length, panel.x + panel.width);
          if (e - s > 1) return true;
        }
      }
      return false;
    });
  }
  // VENTILATIE + SPARING: het gat wordt uit ÉÉN plaat gesneden (paneel blijft HEEL, gat gemarkeerd in
  // panel.holes voor frees/zagerij), NIET het paneel opknippen in losse platen eromheen (klantregel vent).
  // Eén attachHolesToPanels-aanroep (die overschrijft panel.holes) → vent- én sparing-gaten samen.
  const _ventHoleRects = (groupOpenings ?? []).filter((op) => op.type === 'ventilatie');
  panels = attachHolesToPanels(panels, [..._ventHoleRects, ...(sparingRects ?? [])]);
  // Handmatige einduiteinde-extensie: buitenste paneel loopt door voorbij de gevelrand (hoek-aansluiting).
  if (isKeepEndExtension()) {
    const ee = endExtensions ?? {};
    // UITBREIDEN (positief) post-process; INKORTEN (negatief) loopt al via de zone-clip hierboven (re-optimalisatie).
    panels = extendPanelsAtEnds(panels, groupWidth, Math.max(0, ee.left?.panels ?? 0), Math.max(0, ee.right?.panels ?? 0));
  }
  if (startLijn != null && startLijn < 0 && panels.length > 0) {
    const minY = Math.min(...panels.map((p) => p.y));
    panels = panels.map((p) => p.y <= minY + 0.5 ? { ...p, y: startLijn, height: p.height + p.y - startLijn } : p);
  } else if (isPaneelStartLijn() && startLijn != null && startLijn > 0 && panels.length > 0) {
    // PANEEL_STARTLIJN: panelen onder de projectstart afsnijden → het onderste paneel begint op de startlijn (net als
    // de strips + de zone-panelen). Vlag uit → panelen starten op y=0 (byte-identiek).
    panels = panels.map((p) => {
      if (p.y + p.height <= startLijn) return null;                                             // volledig onder de startlijn → weg
      if (p.y < startLijn) return { ...p, y: startLijn, height: round2(p.y + p.height - startLijn) };   // deels → optrekken tot de startlijn
      return p;
    }).filter(Boolean);
  }
  return { panels, effMat, basePanel };
}

export function panelizeFacade(facadeWidth, facadeHeight, openings, battenYs, basePanel) {
  const zones = buildFacadeZones(facadeWidth, facadeHeight, openings);
  const result = [];
  for (const zone of zones) {
    const panelization = panelizeZone(zone, battenYs, basePanel);
    result.push({ zone, panelization });
  }
  return result;
}

export function generateMoldRecipe(panels, mat, verband, panelDikte, moldDims, groupLabel) {
  const steenH = mat.steenH ?? 50;
  const lint   = mat.lint   ?? 12;
  const steenL = mat.steenL ?? 210;
  const lagenmaat = verband === 'staand_tegelverband' ? steenL + lint : steenH + lint;
  const moldHoogte = moldDims?.hoogte ?? 270;
  const moldLengte = moldDims?.lengte ?? 3400;
  const rowsPerMold = Math.min(3, Math.max(1, Math.floor(moldHoogte / lagenmaat)));

  const rows = [];
  for (const panel of panels) {
    const totalRows = Math.max(1, Math.floor(panel.height / lagenmaat));
    const passes = Math.ceil(totalRows / rowsPerMold);
    for (let pass = 0; pass < passes; pass++) {
      const startRow = pass * rowsPerMold;
      const rowsInPass = Math.min(rowsPerMold, totalRows - startRow);
      const sledPositions = [];
      for (let r = 0; r < rowsInPass; r++) {
        sledPositions.push(Math.round(r * lagenmaat + Math.round(steenH / 2)));
      }
      rows.push([
        groupLabel ?? '',
        panel.zoneId ?? '',
        panel.id ?? '',
        Math.round(panel.width),
        Math.round(panel.height),
        panelDikte ?? 8,
        totalRows,
        rowsPerMold,
        pass + 1,
        passes,
        lagenmaat,
        sledPositions.join(' | '),
      ]);
    }
  }
  return rows;
}

export function computeWasteStats(allPanels, basePanel) {
  const bpArea = basePanel.width * basePanel.height;
  const uniqueSizes = [...new Set(allPanels.map((p) => `${p.width}×${p.height}`))];
  const fullPanels = allPanels.filter((p) => p.width === basePanel.width && p.height === basePanel.height).length;
  const totalUsedArea = allPanels.reduce((s, p) => s + p.area, 0);
  const sheetsNeeded = allPanels.length;
  const totalSheetArea = sheetsNeeded * bpArea;
  const wasteArea = totalSheetArea - totalUsedArea;
  const wastePct = totalSheetArea > 0 ? Math.round((wasteArea / totalSheetArea) * 100) : 0;
  return { totalPanels: allPanels.length, fullPanels, uniqueSizes, totalUsedArea: Math.round(totalUsedArea), wastePct };
}

export function computeEffectiveBasePanel(panelen, brickWeightM2, material) {
  const w = Math.max(100, panelen?.breedte ?? 3005);
  const h = Math.max(100, panelen?.hoogte ?? 1200);
  const maxKg = panelen?.maxKg ?? 50;
  const steenL = material?.steenL ?? 210;
  const steenH = material?.steenH ?? 50;
  const lint  = material?.lint  ?? 12;
  const stoot = material?.stoot ?? 10;
  const panelW = panelen?.gewichtM2 ?? 9.4;
  // GEWICHT PER STRIP (optioneel): staat material.stripKg (kg per strip) → leid het strip-gewicht/m²
  // daaruit af (een strip beslaat (steenL+stoot)×(steenH+lint) m²); anders de per-m²-waarde
  // brickWeightM2. Zonder stripKg is dit woord-voor-woord het oude gedrag (byte-identiek).
  const _moduleM2 = ((steenL + stoot) * (steenH + lint)) / 1e6;
  const brickW = (material?.stripKg > 0 && _moduleM2 > 0) ? (material.stripKg / _moduleM2) : (brickWeightM2 ?? 40);
  const totalW = Math.max(0.001, panelW + brickW);
  const maxAreaMM2 = (maxKg / totalW) * 1e6;
  const effectiveH = Math.min(h, Math.max(100, Math.floor(maxAreaMM2 / w)));
  const brickTargetW = 5 * steenL + 4 * stoot;
  const brickTargetH = 14 * steenH + 13 * lint;

  return {
    width: w,
    height: effectiveH,
    maxHeight: h,
    minHeight: 800,
    targetWidth:  Math.min(w, brickTargetW),
    targetHeight: Math.min(effectiveH, brickTargetH),
    verspringen: panelen?.verspringen ?? false,
    // PANEEL_OPTIMALISATIE: maximale paneel-OPPERVLAKte uit het gewicht (kg/m² × opp = kg). area50 =
    // streefgrens (maxKg), area60 = harde grens (maxKg+10, "incidenteel iets zwaarder"). Alleen gebruikt
    // door de optimale verdeling; bestaande callers negeren deze velden (byte-identiek).
    maxArea50MM2: (maxKg / totalW) * 1e6,
    maxArea60MM2: ((maxKg + 10) / totalW) * 1e6,
  };
}

function _moldGeometry(mat, verband, moldDims, moldId) {
  const steenH = mat?.steenH ?? 50;
  const lint   = mat?.lint   ?? 12;
  const steenL = mat?.steenL ?? 210;
  const stoot  = mat?.stoot  ?? 10;
  const isStaand = verband === 'staand_tegelverband';
  // For staand_tegelverband the brick is rotated 90° CW in the mold so strips can be
  // produced in horizontal rows. Long side (steenL) becomes the slot width; short side
  // (steenH) becomes the slot height. The facade lagenmaat (steenL + lint) is NOT used
  // here — only the physical mold slot dimensions matter.
  const lagenmaat = steenH + lint;           // mold row pitch (= physical slot height + joint)
  const brickW = steenL;                     // slot width in mold (long side, always horizontal)
  const brickH = steenH;                     // slot height in mold (short side, always vertical)
  const colStep = brickW + stoot;
  const moldW = moldDims?.lengte ?? 3400;
  const moldH = moldDims?.hoogte ?? 270;
  // HARDE WAARHEID mal-slots (geen instelbare tolerantie meer): de steek van slotrand tot slotrand
  // = steen + stootvoeg (colStep); de slot-LENGTE is 2 mm korter (b.w + stoot − 2) → 2 mm steg;
  // de slot-HOOGTE = steenstrip-hoogte + 3 mm. Linkerrand op nominaal (speling altijd rechts).
  const frameH    = 30;  // top + bottom margin from outer edge (min 20mm)
  const frameLeft = 40;  // left start, aligned with first notch
  const frame = frameH;  // alias kept for pin-hole logic
  const innerW = moldW - 2 * frameLeft;
  const innerH = moldH - 2 * frameH;
  const slotH = brickH + 3;   // slot-hoogte = steenstrip-hoogte + 3 mm
  const minRowGap = 10;                       // minimum gap between row slots (independent of lintvoeg)
  const rowsPerMold = Math.min(3, Math.max(1, Math.floor((innerH + minRowGap) / (slotH + minRowGap))));
  const extraOffsetX = moldDims?.offsetX ?? 0;
  // Wildverband: same module-fraction offsets as pattern.js [0, 1/3, 2/3, 1/6, 5/6, 1/2]
  const WILD_FRACS = [0, 1/3, 2/3, 1/6, 5/6, 1/2];
  const MOLD_ORDER = ['Links', 'Rechts', 'C', 'D', 'A', 'B'];
  const moldIdx = MOLD_ORDER.indexOf(moldId) >= 0 ? Math.min(MOLD_ORDER.indexOf(moldId), 3) : 0;
  // FASE 2 — truth-wildverband: 2 panelen (start+volg), echte strip-lijst per mal-rij.
  // MAL 'A' = rij 1-3, MAL 'B' = rij 4-6; koppelstrip blijft meegelegd. Vlag UIT → oud model.
  const isTruthWild = verband === 'wildverband' && isWildverbandKoppelstrip();
  const isGroothuis = verband === 'groothuis_wildverband' && isGroothuisWildverband();
  const isGroothuis2 = verband === 'groothuis_wildverband_2' && isGroothuisWildverband2();
  const isWild = isTruthWild || isGroothuis || isGroothuis2;
  let wildByRow = null;
  if (isTruthWild) {
    const pitch = getModuleWidth(mat);
    const fac = buildTruthFacade(2 * pitch, 6 * lagenmaat, mat, []);
    wildByRow = new Map();
    for (const b of fac.bricks) {
      if (b.panelIndex > 1) continue;
      const ri = Math.round(b.y / lagenmaat);
      if (!wildByRow.has(ri)) wildByRow.set(ri, []);
      wildByRow.get(ri).push({ x: b.x, w: b.width, label: b.type, koppelstrip: !!b.koppelstrip });
    }
  } else if (isGroothuis) {
    // groothuis: 1 paneel van 2500 mm per mal (2 panelen passen niet in een 3400-mal).
    const FULL = { S: 'Strek', K: 'Kop', D: 'Drieklezoor' };
    buildGroothuisModule(2500, mat).forEach((codes, ri) => {
      if (!wildByRow) wildByRow = new Map();
      let x = 0; const arr = [];
      for (const c of codes) { arr.push({ x, w: c.w, label: FULL[c.t], koppelstrip: false }); x = Math.round((x + c.w + stoot) * 10) / 10; }
      wildByRow.set(ri, arr);
    });
  } else if (isGroothuis2) {
    // groothuis 2 — VASTE 6-rij mal (rij 0 = onder). Elke rij is de handgelegde codelijst
    // (S/K/D) met nominale breedtes; MAL 'A' = rij 1-3, MAL 'B' = rij 4-6 via globalRowBase.
    const FULL = { S: 'Strek', K: 'Kop', D: 'Drieklezoor' };
    buildGroothuis2Module(mat).forEach((codes, ri) => {
      if (!wildByRow) wildByRow = new Map();
      let x = 0; const arr = [];
      for (const c of codes) { arr.push({ x, w: c.w, label: FULL[c.t], koppelstrip: false }); x = Math.round((x + c.w + stoot) * 10) / 10; }
      wildByRow.set(ri, arr);
    });
  }
  const globalRowBase = verband === 'halfsteens' ? moldIdx % 2
    : isWild ? (moldId === 'B' ? 1 : 0) * rowsPerMold
    : moldIdx * rowsPerMold;
  const kopW  = isStaand ? 0 : Math.round((steenL - stoot) / 2);
  const drieKW = isStaand ? 0 : Math.round((steenL + stoot) * 0.75 - stoot);

  function rowOffset(localRow) {
    const globalRow = globalRowBase + localRow;
    if (verband === 'halfsteens') {
      return 0;
    }
    if (verband === 'tegelverband' || isStaand) {
      // All rows within one mold share the same offset so the machine can pick
      // up each row without sideways adjustment. The pattern offset is encoded
      // in the mold-level index (Links=0 → offset 0; Rechts=1 → offset colStep/2).
      return moldIdx % 2 === 0 ? 0 : Math.round(colStep / 2);
    }
    return 0;
  }

  function bricksInRow(localRow) {
    const globalRow = globalRowBase + localRow;
    if (isWild) return (wildByRow.get(globalRow) ?? []).slice().sort((a, b) => a.x - b.x);
    if (isStaand) {
      // Staand tegelverband: de mal krijgt UITSLUITEND hele-strip-slots, van begin tot eind.
      // We starten altijd met een hele strip (x=0); de facade eindigt soms met een gezaagde strip,
      // maar die past altijd in een vol slot. Dus GEEN geclipte deel-/'Rest'-slots — alleen slots
      // die volledig binnen de malopening (innerW) passen.
      const bricks = [];
      for (let x = 0; x + brickW <= innerW + 0.5; x += colStep) bricks.push({ x, w: brickW, label: 'Strek' });
      return bricks;
    }
    const off = rowOffset(localRow);
    const bricks = [];

    const hasKop = verband === 'halfsteens' && globalRow % 2 === 1;
    let x = extraOffsetX - off;
    if (hasKop) {
      if (x + kopW > 0 && x < innerW) bricks.push({ x, w: kopW, label: 'Kop' });
      x += kopW + stoot;
    }
    while (x < innerW + 0.001) {
      if (x + brickW > 0 && x < innerW) {
        const cx = Math.max(0, x);
        const cw = Math.min(x + brickW, innerW) - cx;
        if (cw > 0.5) bricks.push({ x: cx, w: cw, label: Math.abs(cw - brickW) < 0.5 ? 'Strek' : 'Rest' });
      }
      x += colStep;
    }
    return bricks;
  }

  // Row slot layout — independent of lintvoeg; rows spaced with minRowGap between slots
  const totalSlotH = rowsPerMold * slotH;
  const gapBetween = rowsPerMold > 1 ? (innerH - totalSlotH) / (rowsPerMold - 1) : 0;
  const blockH = totalSlotH + Math.max(0, rowsPerMold - 1) * gapBetween;
  const yBlockStart = Math.round((frameH + (innerH - blockH) / 2) * 10) / 10;
  const rowPitch = slotH + gapBetween;  // distance from top of one slot to top of next

  const pinStepX = Math.round(innerW / Math.round(innerW / 350));

  const rows = [];
  for (let r = 0; r < rowsPerMold; r++) {
    const yRow = Math.round((yBlockStart + r * rowPitch) * 10) / 10;  // top of slot
    const off = rowOffset(r);
    rows.push({ localRow: r, globalRow: globalRowBase + r, yRow, off, bricks: bricksInRow(r) });
  }

  const pinYs = [yBlockStart / 2];
  for (let r = 0; r < rowsPerMold - 1; r++) {
    const slotBottom = rows[r].yRow + slotH;
    const nextSlotTop = rows[r + 1].yRow;
    pinYs.push(Math.round((slotBottom + nextSlotTop) / 2 * 10) / 10);
  }
  pinYs.push(Math.round(((rows[rowsPerMold - 1].yRow + slotH + moldH) / 2) * 10) / 10);

  // Notch X-positions: fixed at 270, 970, 1670, 2370, 3070mm; all 62mm wide
  function calcNotchXs() {
    const notchW = 62;
    const xs = [270, 970, 1670, 2370, 3070];
    return { notchXs: xs, notchWs: xs.map(() => notchW) };
  }
  const { notchXs, notchWs } = calcNotchXs();

  return { moldW, moldH, frame, frameH, frameLeft, innerW, innerH, brickW, brickH, colStep, stoot, lagenmaat, slotH, rowsPerMold, globalRowBase, rows, pinYs, pinStepX, notchXs, notchWs };
}

// Identificatie-string van een mal: mal-letter (Links→A, Rechts→B; wild/groothuis al A/B) +
// strip-lengte/hoogte + stootvoeg (S) + lintvoeg (L), bv. "Mal A 210/51/S6/L10". Eén bron voor
// zowel de tekst óp de DXF als de DXF-bestandsnaam, zodat die twee nooit uit elkaar lopen.
export function moldIdLabel(mat, moldId) {
  const letter = ({ Links: 'A', Rechts: 'B' })[moldId] ?? moldId;
  const L = mat?.steenL ?? 210, H = mat?.steenH ?? 50, S = mat?.stoot ?? 10, Li = mat?.lint ?? 12;
  return `Mal ${letter} ${L}/${H}/S${S}/L${Li}`;
}

// ── Handmatige einduiteinde-extensie (endExtensions) ────────────────────────────────────────
// Verleng het BUITENSTE paneel/de buitenste latte aan een gevelrand voorbij de wandgrens, zodat
// de bekleding aansluit op de aangrenzende gevel (stompe hoek). eL/eR in mm. Alleen het element
// dat de linker- (x≈0) resp. rechterrand (x+breedte≈groupWidth) raakt schuift mee; interne
// elementen blijven ongemoeid. Byte-identiek als eL=eR=0 (input onveranderd terug). Zelfde logica
// als _applyCornerToPanels/_applyCornerToLats in de IFC-export, nu gedeeld met de 2D-view.
export function extendPanelsAtEnds(panels, groupWidth, eL = 0, eR = 0) {
  if (eL === 0 && eR === 0) return panels;
  // eL/eR > 0 = uitbreiden (rand schuift naar buiten); < 0 = inkorten (rand schuift naar binnen). Formule `x -= eL`
  // / `right += eR` dekt beide. Kort de rand tot niets in → paneel vervalt (END_TRIM; geen cascade).
  const out = [];
  for (const p of panels) {
    let x = p.x, right = p.x + p.width;
    if (eL !== 0 && p.x <= 0.5) x -= eL;
    if (eR !== 0 && p.x + p.width >= groupWidth - 0.5) right += eR;
    const width = right - x;
    if (width <= 0.5) continue;
    out.push(width === p.width ? p : { ...p, x, width });
  }
  return out;
}

// Idem voor latten. Alleen HORIZONTALE latten lopen over de breedte en worden verlengd; verticale
// latten staan op een vaste x en blijven ongemoeid (gelijk aan _applyCornerToLats in de export).
export function extendLattenAtEnds(latten, groupWidth, eL = 0, eR = 0) {
  if (eL === 0 && eR === 0) return latten;
  // eL/eR > 0 = uitbreiden; < 0 = inkorten (END_TRIM). Verticale latten ongemoeid; horizontale lat tot niets in → vervalt.
  const out = [];
  for (const lat of latten) {
    if (lat.richting && lat.richting !== 'horizontaal') { out.push(lat); continue; }
    let x = lat.x, right = lat.x + lat.width;
    if (eL !== 0 && lat.x <= 0.5) x -= eL;
    if (eR !== 0 && lat.x + lat.width >= groupWidth - 0.5) right += eR;
    const width = right - x;
    if (width <= 0.5) continue;
    out.push(width === lat.width ? lat : { ...lat, x, width });
  }
  return out;
}

export function generateMoldDXF(mat, verband, moldDims, moldId = 'A') {
  const g = _moldGeometry(mat, verband, moldDims, moldId);
  const { moldW, moldH, frameH, frameLeft, innerW, innerH, slotH, stoot, rows, notchXs, notchWs } = g;
  const r2 = (v) => Math.round(v * 100) / 100;
  const lines = [];

  // R12-compatibele gesloten polylijn: POLYLINE (66/1 = vertices volgen, 70/1 = gesloten) met losse
  // VERTEX-entiteiten + SEQEND. LWPOLYLINE bestaat pas vanaf R14 (AC1014); onder $ACADVER=AC1009 (R12)
  // maakte dat een ongeldig bestand ("missing 'AcDbPolyline' subclass"). CIRCLE/TEXT zijn R12-geldig.
  function addPolyline(pts, layer, color) {
    lines.push('0', 'POLYLINE', '8', layer, '62', String(color), '66', '1', '70', '1');
    for (const [px, py] of pts) lines.push('0', 'VERTEX', '8', layer, '10', String(r2(px)), '20', String(r2(py)));
    lines.push('0', 'SEQEND', '8', layer);
  }
  function addPolyRect(x1, y1, w, h, layer, color) {
    addPolyline([[x1, y1], [x1 + w, y1], [x1 + w, y1 + h], [x1, y1 + h]], layer, color);
  }
  function addCircle(cx, cy, radius, layer, color) {
    lines.push('0', 'CIRCLE', '8', layer, '62', String(color),
      '10', String(r2(cx)), '20', String(r2(cy)), '40', String(r2(radius)));
  }
  function addText(x, y, h, text, layer) {
    lines.push('0', 'TEXT', '8', layer, '62', '7',
      '10', String(r2(x)), '20', String(r2(y)), '30', '0.0', '40', String(r2(h)), '1', text);
  }

  const notchDepth = 10;
  {
    const pts = [[0, 0]];
    for (let i = 0; i < notchXs.length; i++) {
      pts.push([notchXs[i], 0], [notchXs[i], notchDepth], [notchXs[i] + notchWs[i], notchDepth], [notchXs[i] + notchWs[i], 0]);
    }
    pts.push([moldW, 0], [moldW, moldH]);
    for (let i = notchXs.length - 1; i >= 0; i--) {
      pts.push([notchXs[i] + notchWs[i], moldH], [notchXs[i] + notchWs[i], moldH - notchDepth], [notchXs[i], moldH - notchDepth], [notchXs[i], moldH]);
    }
    pts.push([0, moldH]);
    addPolyline(pts, 'FRAME', 7);
  }
  // (Geen GUIDE-hulprechthoek in de DXF — dat is een referentielijn die de zetterij anders zou
  // meesnijden. Het snijbestand bevat alleen FRAME (contour) + SLOTS + HOLES. De gestippelde
  // guide blijft wél in de SVG-schermtekening als visuele hulp.)

  for (const row of rows) {
    for (const b of row.bricks) {
      // Slot-lengte = b.w + stoot − 2 (2 mm korter dan de steek b.w+stoot → 2 mm steg). Linkerrand
      // op de nominale positie (= guide-lijn frameLeft voor de startslot); speling altijd rechts.
      addPolyRect(r2(frameLeft + b.x), r2(row.yRow), r2(b.w + stoot - 2), r2(slotH), 'SLOTS', 2);
    }
  }
  // Het raster fixeergaten (pinYs × pinStepX, ~40 stuks) is bewust VERWIJDERD (klantverzoek):
  // de mal wordt met één gat vastgezet. Alleen het uitlijngat hieronder blijft.
  // Alignment hole — Ø8mm, 11mm from left edge, vertically centred
  addCircle(11, r2(moldH / 2), 4, 'HOLES', 1);

  // Identificatie die mee het staal in gesneden wordt (zelfde bron als de DXF-bestandsnaam):
  // mal-letter + strip-lengte/hoogte + stootvoeg (S) + lintvoeg (L), bv. "Mal A 210/51/S6/L10".
  // Verder niets — geen rij-labels, geen verband/afmeting/rijen-tekst.
  addText(frameH, -18, 8, moldIdLabel(mat, moldId), 'TITLE');

  const header = [
    '0', 'SECTION', '2', 'HEADER',
    '9', '$ACADVER', '1', 'AC1009',
    '9', '$EXTMIN', '10', '0.0', '20', '-30', '30', '0.0',
    '9', '$EXTMAX', '10', String(moldW), '20', String(moldH + 30), '30', '0.0',
    '9', '$LUNITS', '70', '2',
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES',
    '0', 'TABLE', '2', 'LAYER', '70', '4',
    '0', 'LAYER', '2', 'FRAME',  '70', '0', '62', '7', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'SLOTS',  '70', '0', '62', '2', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'HOLES',  '70', '0', '62', '1', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'TITLE',  '70', '0', '62', '7', '6', 'CONTINUOUS',
    '0', 'ENDTAB', '0', 'ENDSEC',
  ].join('\n');

  return header + '\n' + ['0', 'SECTION', '2', 'ENTITIES', lines.join('\n'), '0', 'ENDSEC', '0', 'EOF'].join('\n');
}

export function generateMoldSVG(mat, verband, moldDims, moldId = 'A') {
  const g = _moldGeometry(mat, verband, moldDims, moldId);
  const { moldW, moldH, frameH, frameLeft, innerW, innerH, brickH, slotH, stoot, rows, rowsPerMold, globalRowBase, notchXs, notchWs } = g;
  const extraOffsetX = moldDims?.offsetX ?? 0;
  const isStaand = verband === 'staand_tegelverband';
  // After 90° CW rotation: long side (steenL) is horizontal in mold, short side (steenH) vertical
  const displayBrickW = mat?.steenL ?? 210;
  const displayBrickH = mat?.steenH ?? 50;
  const displayNote   = isStaand ? ' ↻90°' : '';

  const r2 = (v) => Math.round(v * 100) / 100;
  const rn = (v) => Math.round(v);

  // SVG layout
  const mLeft  = 70;   // space left of mold (height dim)
  const mRight  = 40;
  const mTop    = 30;
  const dimRowH = 26;  // vertical space per dimension chain row
  const numDimRows = 4;
  const refGap  = 50;  // gap between last dim row and reference line
  const legendW = 210;
  const legendH = 120;
  const mBottom = legendH + 30;

  const svgW = mLeft + moldW + mRight;
  const svgH = mTop + moldH + numDimRows * dimRowH + refGap + mBottom;

  const ox = mLeft;  // mold left in SVG
  const oy = mTop;   // mold top in SVG

  // Notch geometry — from _moldGeometry (first notch at frameLeft=40mm)
  const notchDepth = 10;

  // Mold outline path with notches cut from both top and bottom edges
  function moldOutlinePath() {
    let d = `M ${ox},${oy}`;
    // Top edge left→right, notches cut downward
    for (let i = 0; i < notchXs.length; i++) {
      const nx = notchXs[i], nw = notchWs[i];
      d += ` L ${ox + nx},${oy}`;
      d += ` L ${ox + nx},${oy + notchDepth}`;
      d += ` L ${ox + nx + nw},${oy + notchDepth}`;
      d += ` L ${ox + nx + nw},${oy}`;
    }
    d += ` L ${ox + moldW},${oy}`;
    // Right edge
    d += ` L ${ox + moldW},${oy + moldH}`;
    // Bottom edge right→left, notches cut upward
    for (let i = notchXs.length - 1; i >= 0; i--) {
      const nx = notchXs[i], nw = notchWs[i];
      d += ` L ${ox + nx + nw},${oy + moldH}`;
      d += ` L ${ox + nx + nw},${oy + moldH - notchDepth}`;
      d += ` L ${ox + nx},${oy + moldH - notchDepth}`;
      d += ` L ${ox + nx},${oy + moldH}`;
    }
    d += ` L ${ox},${oy + moldH} Z`;
    return d;
  }

  // Dimension helper: horizontal dim line with end ticks and centred text
  function dimLine(x1, x2, yCentre, label, color, tickHalf = 5, fSize = 7) {
    const mx = r2((x1 + x2) / 2);
    return `<line x1="${r2(x1)}" y1="${r2(yCentre - tickHalf)}" x2="${r2(x1)}" y2="${r2(yCentre + tickHalf)}" stroke="${color}" stroke-width="0.8"/>` +
           `<line x1="${r2(x2)}" y1="${r2(yCentre - tickHalf)}" x2="${r2(x2)}" y2="${r2(yCentre + tickHalf)}" stroke="${color}" stroke-width="0.8"/>` +
           `<line x1="${r2(x1)}" y1="${r2(yCentre)}" x2="${r2(x2)}" y2="${r2(yCentre)}" stroke="${color}" stroke-width="0.8"/>` +
           (Math.abs(x2 - x1) > 14
             ? `<text x="${mx}" y="${r2(yCentre - tickHalf - 2)}" text-anchor="middle" font-size="${fSize}" fill="${color}">${label}</text>`
             : '');
  }

  // Cross tick (+) for centre-to-centre row
  function plusTick(cx, y, color, sz = 4) {
    return `<line x1="${r2(cx - sz)}" y1="${r2(y)}" x2="${r2(cx + sz)}" y2="${r2(y)}" stroke="${color}" stroke-width="0.8"/>` +
           `<line x1="${r2(cx)}" y1="${r2(y - sz)}" x2="${r2(cx)}" y2="${r2(y + sz)}" stroke="${color}" stroke-width="0.8"/>`;
  }

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(svgW)} ${r2(svgH)}" style="background:#ffffff;font-family:Arial,sans-serif">`);

  // ── Mold body ──
  parts.push(`<path d="${moldOutlinePath()}" fill="#dde3ed" stroke="#1e293b" stroke-width="1.5"/>`);
  // Inner guide dashed rect
  parts.push(`<rect x="${r2(ox + frameLeft)}" y="${r2(oy + frameH)}" width="${r2(innerW)}" height="${r2(innerH)}" fill="none" stroke="#94a3b8" stroke-width="0.5" stroke-dasharray="5,3"/>`);

  // ── Alignment hole — Ø8mm, 11mm from left edge, vertically centred ──
  {
    const hcx = r2(ox + 11);
    const hcy = r2(oy + moldH / 2);
    parts.push(`<circle cx="${hcx}" cy="${hcy}" r="4" fill="#ffffff" stroke="#1e293b" stroke-width="1"/>`);
    parts.push(`<line x1="${r2(ox + 11 - 6)}" y1="${hcy}" x2="${r2(ox + 11 + 6)}" y2="${hcy}" stroke="#666" stroke-width="0.5"/>`);
    parts.push(`<line x1="${hcx}" y1="${r2(oy + moldH / 2 - 6)}" x2="${hcx}" y2="${r2(oy + moldH / 2 + 6)}" stroke="#666" stroke-width="0.5"/>`);
  }

  // ── Strip slots (colour-coded by brick type, tolerance-based dimensions) ──
  const slotFill = { Strek: '#ffffff', Kop: '#fef3c7', Drieklezoor: '#dbeafe', Rest: '#fee2e2' };
  for (const row of rows) {
    // Rij 1 (laagste globalRow) ONDER in de tekening, oplopend naar boven — gelijk aan het DXF-
    // snijbestand (y-omhoog). De SVG-y loopt omlaag, dus spiegelen we binnen [0, moldH].
    const sTop = r2(oy + moldH - row.yRow - slotH);
    const sH   = r2(slotH);                   // = steenstrip-hoogte + 3 mm
    for (const b of row.bricks) {
      const sLeft = r2(ox + frameLeft + b.x); // tolerantie rechts weggewerkt: linkerrand op nominaal
      const sW    = r2(b.w + stoot - 2);
      const fill  = b.koppelstrip ? '#fb923c' : (slotFill[b.label] ?? '#ffffff');
      parts.push(`<rect x="${sLeft}" y="${sTop}" width="${sW}" height="${sH}" fill="${fill}" stroke="#334155" stroke-width="1" rx="1"/>`);
      if ((b.koppelstrip || b.label !== 'Strek') && sW > 12) {
        parts.push(`<text x="${r2(Number(sLeft) + Number(sW)/2)}" y="${r2(Number(sTop) + Number(sH)/2 + 2.5)}" text-anchor="middle" font-size="5" fill="${b.koppelstrip ? '#7c2d12' : '#475569'}">${b.label[0]}</text>`);
      }
    }
    // Row label inside mold on the left (gespiegeld mee met de slots: rij 1 onder)
    const labelY = r2(oy + moldH - row.yRow - slotH / 2 + 2.5);
    parts.push(`<text x="${r2(ox + frameLeft + 2)}" y="${labelY}" font-size="6" fill="#475569">R${row.globalRow + 1}</text>`);
  }

  // Strip size label — top-left inside mold
  parts.push(`<text x="${r2(ox + frameLeft + 30)}" y="${r2(oy + frameH + 11)}" font-size="8" fill="#1e293b" font-weight="bold">${displayBrickW}×${displayBrickH}mm${displayNote}</text>`);

  // ── Dimension area baseline (just below mold) ──
  const dimBase = oy + moldH + 6;

  // DIM ROW 0 — Notch boundary positions (black)
  const rowY0 = dimBase + dimRowH * 0.55;
  {
    const xs = [ox];
    for (let i = 0; i < notchXs.length; i++) {
      xs.push(ox + notchXs[i]);
      xs.push(ox + notchXs[i] + notchWs[i]);
    }
    xs.push(ox + moldW);
    for (let i = 0; i < xs.length - 1; i++) {
      parts.push(dimLine(xs[i], xs[i + 1], rowY0, String(rn(xs[i + 1] - xs[i])), '#111111', 5, 6));
    }
  }

  // DIM ROW 1 — Individual strip widths + joints (black, smaller)
  const rowY1 = dimBase + dimRowH * 1.6;
  const refBricks = rows[0]?.bricks ?? [];
  if (refBricks.length) {
    const absX = b => ox + frameLeft + b.x;
    // left margin
    parts.push(dimLine(ox, absX(refBricks[0]), rowY1, String(rn(frameLeft + refBricks[0].x)), '#333333', 4, 6));
    for (let i = 0; i < refBricks.length; i++) {
      const b = refBricks[i];
      parts.push(dimLine(absX(b), absX(b) + b.w, rowY1, String(rn(b.w)), '#333333', 4, 6));
      if (i < refBricks.length - 1) {
        const gap = refBricks[i + 1].x - (b.x + b.w);
        if (gap > 0.5) parts.push(dimLine(absX(b) + b.w, absX(refBricks[i + 1]), rowY1, String(rn(gap)), '#333333', 4, 6));
      }
    }
    const lastB = refBricks[refBricks.length - 1];
    const rightMargin = moldW - frameLeft - lastB.x - lastB.w;
    parts.push(dimLine(absX(lastB) + lastB.w, ox + moldW, rowY1, String(rn(rightMargin)), '#333333', 4, 6));
  }

  // DIM ROW 2 — Centre-to-centre modules (orange, with + ticks)
  const rowY2 = dimBase + dimRowH * 2.7;
  const COL_ORANGE = '#f59e0b';
  if (refBricks.length) {
    const cx = b => ox + frameLeft + b.x + b.w / 2;
    // left edge to first centre
    parts.push(dimLine(ox, cx(refBricks[0]), rowY2, String(rn(cx(refBricks[0]) - ox)), COL_ORANGE, 4, 7));
    parts.push(plusTick(cx(refBricks[0]), rowY2, COL_ORANGE));
    for (let i = 0; i < refBricks.length - 1; i++) {
      const c1 = cx(refBricks[i]), c2 = cx(refBricks[i + 1]);
      parts.push(dimLine(c1, c2, rowY2, String(rn(c2 - c1)), COL_ORANGE, 4, 7));
      parts.push(plusTick(c2, rowY2, COL_ORANGE));
    }
    // last centre to right edge
    const lastCx = cx(refBricks[refBricks.length - 1]);
    parts.push(dimLine(lastCx, ox + moldW, rowY2, String(rn(ox + moldW - lastCx)), COL_ORANGE, 4, 7));
  }

  // DIM ROW 3 — Total width (blue)
  const rowY3 = dimBase + dimRowH * 3.8;
  const COL_BLUE = '#2563eb';
  parts.push(dimLine(ox, ox + moldW, rowY3, String(moldW), COL_BLUE, 7, 9));

  // ── Left-side height dimension (blue) ──
  {
    const hx = ox - 16;
    parts.push(`<line x1="${r2(hx - 4)}" y1="${r2(oy)}" x2="${r2(hx + 4)}" y2="${r2(oy)}" stroke="${COL_BLUE}" stroke-width="0.8"/>`);
    parts.push(`<line x1="${r2(hx - 4)}" y1="${r2(oy + moldH)}" x2="${r2(hx + 4)}" y2="${r2(oy + moldH)}" stroke="${COL_BLUE}" stroke-width="0.8"/>`);
    parts.push(`<line x1="${r2(hx)}" y1="${r2(oy)}" x2="${r2(hx)}" y2="${r2(oy + moldH)}" stroke="${COL_BLUE}" stroke-width="0.8"/>`);
    const midY = r2(oy + moldH / 2);
    parts.push(`<text x="${r2(hx - 5)}" y="${midY}" text-anchor="middle" dominant-baseline="middle" font-size="8" fill="${COL_BLUE}" transform="rotate(-90,${r2(hx - 5)},${midY})">${moldH}</text>`);
  }

  // ── Reference line ──
  const refLineY = dimBase + numDimRows * dimRowH + 10;
  parts.push(`<line x1="${r2(ox - 10)}" y1="${r2(refLineY)}" x2="${r2(ox + moldW + 10)}" y2="${r2(refLineY)}" stroke="#000000" stroke-width="1.5"/>`);
  // Reference dim beneath it
  parts.push(dimLine(ox, ox + moldW, refLineY + 18, String(moldW), COL_BLUE, 5, 8));

  // ── Legend (bottom-right) ──
  const legX  = r2(ox + moldW - legendW);
  const legY  = r2(refLineY + 34);
  const legPad = 8;
  parts.push(`<rect x="${legX}" y="${legY}" width="${legendW}" height="${legendH}" fill="#ffffff" stroke="#334155" stroke-width="0.8"/>`);
  parts.push(`<text x="${r2(Number(legX) + legPad)}" y="${r2(Number(legY) + 13)}" font-size="7" fill="#1e293b" font-weight="bold">Legenda: maatvoering</text>`);
  const legItems = [
    { color: COL_BLUE,    label: 'Hoofdmaatvoering' },
    { color: COL_ORANGE,  label: 'Lagenmaat' },
    { color: '#111111',   label: 'Overige maatvoering' },
    { color: '#ffffff', stroke: '#334155', label: 'Strek' },
    { color: '#fef3c7', stroke: '#334155', label: 'Kop' },
    { color: '#dbeafe', stroke: '#334155', label: 'Drieklezoor' },
    ...(verband === 'wildverband' && isWildverbandKoppelstrip() ? [{ color: '#fb923c', stroke: '#334155', label: 'Koppelstrip (meegelegd)' }] : []),
  ];
  legItems.forEach(({ color, stroke, label }, i) => {
    const lx  = r2(Number(legX) + legPad);
    const ly  = r2(Number(legY) + 24 + i * 15);
    const sw  = stroke ? ` stroke="${stroke}" stroke-width="0.8"` : '';
    parts.push(`<rect x="${lx}" y="${r2(Number(ly) - 7)}" width="16" height="8" fill="${color}"${sw}/>`);
    parts.push(`<text x="${r2(Number(lx) + 20)}" y="${ly}" font-size="7" fill="#1e293b">${label}</text>`);
  });

  // ── Small title in mold ──
  parts.push(`<text x="${r2(ox + frameLeft + 2)}" y="${r2(oy + 9)}" font-size="6" fill="#64748b">MAL ${moldId} | ${verband} | ${moldW}×${moldH}mm | ${rowsPerMold} rijen${extraOffsetX ? ` | x-offset ${extraOffsetX}mm` : ''} | Staal 2mm</text>`);

  parts.push('</svg>');
  return parts.join('\n');
}

export function generateMoldPrintHTML(mat, verband, moldDims, moldId = 'A') {
  const svg = generateMoldSVG(mat, verband, moldDims, moldId);
  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<title>MAL ${moldId} | ${verband}</title>
<style>
  @page { size: A0 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f8fafc; }
  .mold-wrap { width: 100%; }
  svg { width: 100%; height: auto; display: block; }
  @media print { body { background: #fff; } }
</style>
</head>
<body>
<div class="mold-wrap">${svg}</div>
<script>window.onload = () => { setTimeout(() => window.print(), 300); };<\/script>
</body>
</html>`;
}

export function generateCombinedMoldPrintHTML(mat, verband, moldDims) {
  const svg = generateCombinedMoldSVG(mat, verband, moldDims);
  // PDF-bestandsnaam volgt DEZELFDE naamgeving als de DXF's: verband + mal-aanduiding. Het gecombineerde
  // vel bevat beide mallen → "Mal A+B". De browser neemt <title> als voorgestelde 'Opslaan als PDF'-naam.
  const pdfName = `${verband}_${moldIdLabel(mat, 'A+B').replace(/[/\\ ]+/g, '-')}`;
  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<title>${pdfName}</title>
<style>
  @page { size: A0 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f8fafc; }
  .mold-wrap { width: 100%; }
  svg { width: 100%; height: auto; display: block; }
  @media print { body { background: #fff; } }
</style>
</head>
<body>
<div class="mold-wrap">${svg}</div>
<script>window.onload = () => { setTimeout(() => window.print(), 300); };<\/script>
</body>
</html>`;
}

/**
 * getMoldTemplates — returns an array of mold-template descriptors for a given
 * verband + material + mold dimensions.
 *
 * Each descriptor contains:
 *   id          : 'Links' | 'Rechts' | … (label for the physical mold)
 *   globalRows  : [0,1,2] | [3,4,5] | … (0-based global row indices)
 *   rowsPerMold : number of brick rows in this mold
 *   lagenmaat   : height of one brick row incl. joint (mm)
 *   brickW      : visible brick width in mold (mm)   — steenH for staand
 *   brickH      : visible brick height in mold (mm)  — steenL for staand
 *   colStep     : brick width + stootvoeg (mm)
 *   rotated     : true for staand_tegelverband (mold is 90° rotated vs facade)
 *   rows        : [{ globalRow, offset, label }]
 *     offset = horizontal shift of the first brick from the mold left edge (mm)
 *     label  = human-readable row description
 *   molds       : total number of molds in this cycle
 */
export function getMoldTemplates(verband, mat, moldDims) {
  const steenL = mat?.steenL ?? 210;
  const steenH = mat?.steenH ?? 50;
  const lint   = mat?.lint   ?? 12;
  const stoot  = mat?.stoot  ?? 10;
  const isStaand = verband === 'staand_tegelverband';

  // lagenmaat = FACADE row pitch (used for rowsPerPanel planning)
  const lagenmaat = isStaand ? steenL + lint : steenH + lint;
  // Mold slot dimensions: for staand the brick is rotated 90° CW, so long side is horizontal
  const brickW    = steenL;   // slot width in mold (long side, always horizontal)
  const brickH    = steenH;   // slot height in mold (short side, always vertical)
  const colStep   = brickW + stoot;

  const moldW = moldDims?.lengte    ?? 3400;
  const moldH = moldDims?.hoogte    ?? 270;
  const frameH = 30;
  const innerH = moldH - 2 * frameH;
  const slotH_tmpl = brickH + 3;   // slot-hoogte = steenstrip-hoogte + 3 mm (harde waarheid)
  const minRowGap = 10;
  const rowsPerMold = Math.min(3, Math.max(1, Math.floor((innerH + minRowGap) / (slotH_tmpl + minRowGap))));

  // FASE 2 — truth-wildverband: 2 panelen per keer (start + volg), elk 6 rijen → MAL-A =
  // rij 1-3, MAL-B = rij 4-6. Per mal-rij een ECHTE strip-lijst (variabele S/D/K) uit de
  // vastgelegde waarheid; de koppelstrip blijft meegelegd (niet uitgesneden, fabrieksfout-vrij).
  // Vlag UIT → het bestaande uniforme colStep-model (byte-identiek).
  if (verband === 'wildverband' && isWildverbandKoppelstrip()) {
    const pitch = getModuleWidth(mat);
    const fac = buildTruthFacade(2 * pitch, 6 * lagenmaat, mat, []);
    const byRow = new Map();
    for (const b of fac.bricks) {
      if (b.panelIndex > 1) continue; // alleen het startpaneel (0) + één volgpaneel (1)
      const ri = Math.round(b.y / lagenmaat);
      if (!byRow.has(ri)) byRow.set(ri, []);
      byRow.get(ri).push({ x: b.x, width: b.width, type: b.type, koppelstrip: !!b.koppelstrip });
    }
    const ranges = [[0, 1, 2], [3, 4, 5]];
    const templates = ranges.map((range, mi) => ({
      id: ['A', 'B'][mi],
      rowsPerMold: range.length,
      lagenmaat, brickW, brickH, colStep, frame: frameH, innerH, rotated: false, wildverband: true,
      rows: range.map((ri, lr) => ({
        globalRow: ri, localRow: lr,
        strips: (byRow.get(ri) ?? []).slice().sort((a, b) => a.x - b.x),
        label: `Rij ${ri + 1}`,
      })),
    }));
    return {
      verband, molds: 2, rowsPerMold: 3, lagenmaat, brickW, brickH, colStep,
      cycleLength: 6, rotated: false, moldW, moldH, frame: frameH, innerH,
      wildverband: true, panelPitch: pitch, twoPanelWidth: 2 * pitch, templates,
    };
  }

  // GROOTHUIS WILDVERBAND: 1 paneel van 2500 mm per mal → MAL-A = rij 1-3, MAL-B = rij 4-6.
  if (verband === 'groothuis_wildverband' && isGroothuisWildverband()) {
    const FULL = { S: 'Strek', K: 'Kop', D: 'Drieklezoor' };
    const byRow = new Map();
    buildGroothuisModule(2500, mat).forEach((codes, ri) => {
      let x = 0; const arr = [];
      for (const c of codes) { arr.push({ x: Math.round(x * 10) / 10, width: c.w, type: FULL[c.t], koppelstrip: false }); x = Math.round((x + c.w + stoot) * 10) / 10; }
      byRow.set(ri, arr);
    });
    const ranges = [[0, 1, 2], [3, 4, 5]];
    const templates = ranges.map((range, mi) => ({
      id: ['A', 'B'][mi],
      rowsPerMold: range.length,
      lagenmaat, brickW, brickH, colStep, frame: frameH, innerH, rotated: false, wildverband: true,
      rows: range.map((ri, lr) => ({ globalRow: ri, localRow: lr, strips: byRow.get(ri) ?? [], label: `Rij ${ri + 1}` })),
    }));
    return {
      verband, molds: 2, rowsPerMold: 3, lagenmaat, brickW, brickH, colStep,
      cycleLength: 6, rotated: false, moldW, moldH, frame: frameH, innerH,
      wildverband: true, panelPitch: 2500, twoPanelWidth: 2500, templates,
    };
  }

  // GROOTHUIS WILDVERBAND 2: 1 paneel van 2500 mm per mal → MAL-A = rij 1-3 (drieklezoor-start),
  // MAL-B = rij 4-6 (kop-start). Vaste 6-rij mal (buildGroothuis2Module).
  if (verband === 'groothuis_wildverband_2' && isGroothuisWildverband2()) {
    const FULL = { S: 'Strek', K: 'Kop', D: 'Drieklezoor' };
    const byRow = new Map();
    buildGroothuis2Module(mat).forEach((codes, ri) => {
      let x = 0; const arr = [];
      for (const c of codes) { arr.push({ x: Math.round(x * 10) / 10, width: c.w, type: FULL[c.t], koppelstrip: false }); x = Math.round((x + c.w + stoot) * 10) / 10; }
      byRow.set(ri, arr);
    });
    const ranges = [[0, 1, 2], [3, 4, 5]];
    const templates = ranges.map((range, mi) => ({
      id: ['A', 'B'][mi],
      rowsPerMold: range.length,
      lagenmaat, brickW, brickH, colStep, frame: frameH, innerH, rotated: false, wildverband: true,
      rows: range.map((ri, lr) => ({ globalRow: ri, localRow: lr, strips: byRow.get(ri) ?? [], label: `Rij ${ri + 1}` })),
    }));
    return {
      verband, molds: 2, rowsPerMold: 3, lagenmaat, brickW, brickH, colStep,
      cycleLength: 6, rotated: false, moldW, moldH, frame: frameH, innerH,
      wildverband: true, panelPitch: 2500, twoPanelWidth: 2500, templates,
    };
  }

  const extraOffsetX = moldDims?.offsetX ?? 0;

  function offsetForGlobalRow(globalRow) {
    if (verband === 'halfsteens') {
      return 0;
    }
    if (verband === 'tegelverband' || isStaand) {
      // Offset is per-mold, not per-row: all rows in one mold share the same offset.
      // Mold 0 (Links) → offset 0; Mold 1 (Rechts) → offset colStep/2.
      const mIdx = Math.floor(globalRow / rowsPerMold);
      return mIdx % 2 === 0 ? 0 : Math.round(colStep / 2);
    }
    return 0;
  }

  function rowLabel(globalRow, offset) {
    if (verband === 'halfsteens') {
      return globalRow % 2 === 1 ? `Rij ${globalRow + 1} — koppenrij (offset ${offset} mm)` : `Rij ${globalRow + 1} — strekkenrij (offset 0)`;
    }
    return `Rij ${globalRow + 1} — offset ${offset} mm`;
  }

  // Always 2 molds (Links + Rechts) — even when both cycle rows fit in one mold.
  // Rechts always carries a different offset for tegelverband, or an identical layout
  // for halfsteens, but must always be available as a separate DXF/PDF.
  const numMolds = 2;
  const MOLD_IDS = ['Links', 'Rechts', 'C', 'D'];

  const templates = [];
  for (let m = 0; m < numMolds; m++) {
    const id = MOLD_IDS[m] ?? String(m + 1);
    const globalRowBase = verband === 'halfsteens' ? m % 2 : m * rowsPerMold;
    const rows = [];
    for (let r = 0; r < rowsPerMold; r++) {
      const globalRow = globalRowBase + r;
      const offset = offsetForGlobalRow(globalRow);
      rows.push({ globalRow, localRow: r, offset, label: rowLabel(globalRow, offset) });
    }
    templates.push({ id, globalRows: rows.map((r) => r.globalRow), rowsPerMold, lagenmaat, brickW, brickH, colStep, rotated: isStaand, rows });
  }

  return {
    verband,
    molds: numMolds,
    rowsPerMold,
    lagenmaat,
    brickW,
    brickH,
    colStep,
    cycleLength: numMolds * rowsPerMold,
    rotated: isStaand,
    moldW,
    moldH,
    frame: frameH,
    innerH,
    templates,
  };
}

export function generateCombinedMoldSVG(mat, verband, moldDims) {
  const tpl = getMoldTemplates(verband, mat, moldDims);
  const moldIds = tpl.templates.map((t) => t.id);

  const gA = _moldGeometry(mat, verband, moldDims, moldIds[0] ?? 'Links');
  const gB = _moldGeometry(mat, verband, moldDims, moldIds[1] ?? 'Rechts');

  const { moldW, moldH, frameH, frameLeft, innerW, innerH, slotH, stoot, notchXs, notchWs } = gA;
  const isStaand = verband === 'staand_tegelverband';
  // After 90° CW rotation: long side (steenL) is horizontal in mold, short side (steenH) vertical
  const displayBrickW = mat?.steenL ?? 210;
  const displayBrickH = mat?.steenH ?? 50;
  const displayNote   = isStaand ? ' ↻90°' : '';

  const r2 = (v) => Math.round(v * 100) / 100;
  const rn = (v) => Math.round(v);

  const mLeft   = 70;
  const mRight  = 40;
  const mTop    = 30;
  const moldGap = 60;   // gap between the two molds (for sequence arrow)
  const dimRowH = 26;
  const numDimRows = 4;
  const refGap  = 50;
  const legendW = 210;
  const legendH = 120;
  const mBottom = legendH + 40;

  const ox  = mLeft;
  const oy1 = mTop;                        // top of MAL Links
  const oy2 = mTop + moldH + moldGap;     // top of MAL Rechts

  const svgW = mLeft + moldW + mRight;
  const svgH = oy2 + moldH + numDimRows * dimRowH + refGap + mBottom;

  const notchDepth = 10;
  const slotFill = { Strek: '#ffffff', Kop: '#fef3c7', Drieklezoor: '#dbeafe', Rest: '#fee2e2' };
  const COL_BLUE   = '#2563eb';
  const COL_ORANGE = '#f59e0b';

  function moldOutlinePath(oy) {
    let d = `M ${ox},${oy}`;
    for (let i = 0; i < notchXs.length; i++) {
      const nx = notchXs[i], nw = notchWs[i];
      d += ` L ${ox + nx},${oy} L ${ox + nx},${oy + notchDepth} L ${ox + nx + nw},${oy + notchDepth} L ${ox + nx + nw},${oy}`;
    }
    d += ` L ${ox + moldW},${oy} L ${ox + moldW},${oy + moldH}`;
    for (let i = notchXs.length - 1; i >= 0; i--) {
      const nx = notchXs[i], nw = notchWs[i];
      d += ` L ${ox + nx + nw},${oy + moldH} L ${ox + nx + nw},${oy + moldH - notchDepth} L ${ox + nx},${oy + moldH - notchDepth} L ${ox + nx},${oy + moldH}`;
    }
    d += ` L ${ox},${oy + moldH} Z`;
    return d;
  }

  function renderMold(g, oy, moldId, headerColor) {
    const out = [];
    out.push(`<path d="${moldOutlinePath(oy)}" fill="#dde3ed" stroke="#1e293b" stroke-width="1.5"/>`);
    out.push(`<rect x="${r2(ox + frameLeft)}" y="${r2(oy + frameH)}" width="${r2(innerW)}" height="${r2(innerH)}" fill="none" stroke="#94a3b8" stroke-width="0.5" stroke-dasharray="5,3"/>`);
    // alignment hole
    const hcx = r2(ox + 11), hcy = r2(oy + moldH / 2);
    out.push(`<circle cx="${hcx}" cy="${hcy}" r="4" fill="#ffffff" stroke="#1e293b" stroke-width="1"/>`);
    out.push(`<line x1="${r2(ox + 11 - 6)}" y1="${hcy}" x2="${r2(ox + 11 + 6)}" y2="${hcy}" stroke="#666" stroke-width="0.5"/>`);
    out.push(`<line x1="${hcx}" y1="${r2(oy + moldH / 2 - 6)}" x2="${hcx}" y2="${r2(oy + moldH / 2 + 6)}" stroke="#666" stroke-width="0.5"/>`);
    // slots
    for (const row of g.rows) {
      // Rij 1 (laagste globalRow) ONDER, oplopend naar boven — gelijk aan het DXF-snijbestand.
      const sTop = r2(oy + moldH - row.yRow - slotH);
      const sH   = r2(slotH);
      for (const b of row.bricks) {
        const sLeft = r2(ox + frameLeft + b.x); // tolerantie rechts weggewerkt: linkerrand op nominaal
        const sW    = r2(b.w + stoot - 2);
        const fill  = b.koppelstrip ? '#fb923c' : (slotFill[b.label] ?? '#ffffff');
        out.push(`<rect x="${sLeft}" y="${sTop}" width="${sW}" height="${sH}" fill="${fill}" stroke="#334155" stroke-width="1" rx="1"/>`);
        if ((b.koppelstrip || b.label !== 'Strek') && sW > 12)
          out.push(`<text x="${r2(Number(sLeft) + Number(sW)/2)}" y="${r2(Number(sTop) + Number(sH)/2 + 2.5)}" text-anchor="middle" font-size="5" fill="${b.koppelstrip ? '#7c2d12' : '#475569'}">${b.label[0]}</text>`);
      }
      const labelY = r2(oy + moldH - row.yRow - slotH / 2 + 2.5);
      out.push(`<text x="${r2(ox + frameLeft + 2)}" y="${labelY}" font-size="6" fill="#475569">R${row.globalRow + 1}</text>`);
    }
    // header banner
    out.push(`<rect x="${r2(ox + frameLeft)}" y="${r2(oy + 1)}" width="${r2(Math.min(220, innerW))}" height="16" fill="${headerColor}" rx="2" opacity="0.85"/>`);
    out.push(`<text x="${r2(ox + frameLeft + 6)}" y="${r2(oy + 12)}" font-size="9" fill="#ffffff" font-weight="bold">MAL ${moldId} — Rijen ${g.rows.map((r) => r.globalRow + 1).join(' + ')}</text>`);
    // strip size info (top right of mold)
    out.push(`<text x="${r2(ox + frameLeft + 30)}" y="${r2(oy + frameH + 11)}" font-size="7" fill="#1e293b" font-weight="bold">${displayBrickW}×${displayBrickH}mm${displayNote}</text>`);
    return out.join('\n');
  }

  function dimLine(x1, x2, yCentre, label, color, tickHalf = 5, fSize = 7) {
    const mx = r2((x1 + x2) / 2);
    return `<line x1="${r2(x1)}" y1="${r2(yCentre - tickHalf)}" x2="${r2(x1)}" y2="${r2(yCentre + tickHalf)}" stroke="${color}" stroke-width="0.8"/>` +
           `<line x1="${r2(x2)}" y1="${r2(yCentre - tickHalf)}" x2="${r2(x2)}" y2="${r2(yCentre + tickHalf)}" stroke="${color}" stroke-width="0.8"/>` +
           `<line x1="${r2(x1)}" y1="${r2(yCentre)}" x2="${r2(x2)}" y2="${r2(yCentre)}" stroke="${color}" stroke-width="0.8"/>` +
           (Math.abs(x2 - x1) > 14
             ? `<text x="${mx}" y="${r2(yCentre - tickHalf - 2)}" text-anchor="middle" font-size="${fSize}" fill="${color}">${label}</text>`
             : '');
  }

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(svgW)} ${r2(svgH)}" style="background:#ffffff;font-family:Arial,sans-serif">`);

  // ── Drawing title ──
  parts.push(`<text x="${r2(ox)}" y="18" font-size="11" fill="#0f172a" font-weight="bold">Maltekening — MAL ${moldIds[0] ?? 'Links'} + MAL ${moldIds[1] ?? 'Rechts'} | ${verband} | ${moldW}×${moldH}mm${(moldDims?.offsetX ?? 0) ? ` | x-offset ${moldDims.offsetX}mm` : ''} | Staal 2mm</text>`);

  // ── MAL Links (A) ──
  parts.push(renderMold(gA, oy1, moldIds[0] ?? 'Links', '#1e3a5f'));

  // ── Production sequence arrow between molds ──
  {
    const arrowMidX = r2(ox + moldW / 2);
    const arrowTop  = r2(oy1 + moldH + 6);
    const arrowBot  = r2(oy2 - 6);
    const arrowMid  = r2((Number(arrowTop) + Number(arrowBot)) / 2);
    parts.push(`<line x1="${arrowMidX}" y1="${arrowTop}" x2="${arrowMidX}" y2="${arrowBot}" stroke="#0f766e" stroke-width="2" marker-end="url(#arrowhead)"/>`);
    parts.push(`<text x="${r2(Number(arrowMidX) + 10)}" y="${arrowMid}" font-size="9" fill="#0f766e" font-weight="bold">Productievolgorde</text>`);
  }

  // ── MAL Rechts (B) ──
  parts.push(renderMold(gB, oy2, moldIds[1] ?? 'Rechts', '#0f766e'));

  // ── Dimension chains (below MAL Rechts) ──
  const dimBase = oy2 + moldH + 6;

  // DIM ROW 0 — notch positions
  const rowY0 = dimBase + dimRowH * 0.55;
  {
    const xs = [ox];
    for (let i = 0; i < notchXs.length; i++) { xs.push(ox + notchXs[i]); xs.push(ox + notchXs[i] + notchWs[i]); }
    xs.push(ox + moldW);
    for (let i = 0; i < xs.length - 1; i++) parts.push(dimLine(xs[i], xs[i + 1], rowY0, String(rn(xs[i + 1] - xs[i])), '#111111', 5, 6));
  }

  // DIM ROW 1 — strip widths (from row 0 of MAL Links)
  const rowY1 = dimBase + dimRowH * 1.6;
  const refBricks = gA.rows[0]?.bricks ?? [];
  if (refBricks.length) {
    const absX = b => ox + frameLeft + b.x;
    parts.push(dimLine(ox, absX(refBricks[0]), rowY1, String(rn(frameLeft + refBricks[0].x)), '#333333', 4, 6));
    for (let i = 0; i < refBricks.length; i++) {
      const b = refBricks[i];
      parts.push(dimLine(absX(b), absX(b) + b.w, rowY1, String(rn(b.w)), '#333333', 4, 6));
      if (i < refBricks.length - 1) {
        const gap = refBricks[i + 1].x - (b.x + b.w);
        if (gap > 0.5) parts.push(dimLine(absX(b) + b.w, absX(refBricks[i + 1]), rowY1, String(rn(gap)), '#333333', 4, 6));
      }
    }
    const lastB = refBricks[refBricks.length - 1];
    parts.push(dimLine(absX(lastB) + lastB.w, ox + moldW, rowY1, String(rn(moldW - frameLeft - lastB.x - lastB.w)), '#333333', 4, 6));
  }

  // DIM ROW 2 — centre-to-centre (orange)
  const rowY2 = dimBase + dimRowH * 2.7;
  if (refBricks.length) {
    const cx = b => ox + frameLeft + b.x + b.w / 2;
    parts.push(dimLine(ox, cx(refBricks[0]), rowY2, String(rn(cx(refBricks[0]) - ox)), COL_ORANGE, 4, 7));
    for (let i = 0; i < refBricks.length - 1; i++) {
      const c1 = cx(refBricks[i]), c2 = cx(refBricks[i + 1]);
      parts.push(dimLine(c1, c2, rowY2, String(rn(c2 - c1)), COL_ORANGE, 4, 7));
    }
    parts.push(dimLine(cx(refBricks[refBricks.length - 1]), ox + moldW, rowY2, String(rn(ox + moldW - cx(refBricks[refBricks.length - 1]))), COL_ORANGE, 4, 7));
  }

  // DIM ROW 3 — total width (blue)
  const rowY3 = dimBase + dimRowH * 3.8;
  parts.push(dimLine(ox, ox + moldW, rowY3, String(moldW), COL_BLUE, 7, 9));

  // ── Left-side height dim for each mold ──
  for (const [oy, label] of [[oy1, moldIds[0] ?? 'Links'], [oy2, moldIds[1] ?? 'Rechts']]) {
    const hx = ox - 16;
    parts.push(`<line x1="${r2(hx - 4)}" y1="${r2(oy)}" x2="${r2(hx + 4)}" y2="${r2(oy)}" stroke="${COL_BLUE}" stroke-width="0.8"/>`);
    parts.push(`<line x1="${r2(hx - 4)}" y1="${r2(oy + moldH)}" x2="${r2(hx + 4)}" y2="${r2(oy + moldH)}" stroke="${COL_BLUE}" stroke-width="0.8"/>`);
    parts.push(`<line x1="${r2(hx)}" y1="${r2(oy)}" x2="${r2(hx)}" y2="${r2(oy + moldH)}" stroke="${COL_BLUE}" stroke-width="0.8"/>`);
    const midY = r2(oy + moldH / 2);
    parts.push(`<text x="${r2(hx - 5)}" y="${midY}" text-anchor="middle" dominant-baseline="middle" font-size="8" fill="${COL_BLUE}" transform="rotate(-90,${r2(hx - 5)},${midY})">${moldH}</text>`);
  }

  // ── Reference line ──
  const refLineY = dimBase + numDimRows * dimRowH + 10;
  parts.push(`<line x1="${r2(ox - 10)}" y1="${r2(refLineY)}" x2="${r2(ox + moldW + 10)}" y2="${r2(refLineY)}" stroke="#000000" stroke-width="1.5"/>`);
  parts.push(dimLine(ox, ox + moldW, refLineY + 18, String(moldW), COL_BLUE, 5, 8));

  // ── Legend ──
  const legX  = r2(ox + moldW - legendW);
  const legY  = r2(refLineY + 34);
  const legPad = 8;
  parts.push(`<rect x="${legX}" y="${legY}" width="${legendW}" height="${legendH}" fill="#ffffff" stroke="#334155" stroke-width="0.8"/>`);
  parts.push(`<text x="${r2(Number(legX) + legPad)}" y="${r2(Number(legY) + 13)}" font-size="7" fill="#1e293b" font-weight="bold">Legenda</text>`);
  const legItems = [
    { color: '#1e3a5f', label: `MAL ${moldIds[0] ?? 'Links'} (rijen ${gA.rows.map((r) => r.globalRow + 1).join('+')})` },
    { color: '#0f766e', label: `MAL ${moldIds[1] ?? 'Rechts'} (rijen ${gB.rows.map((r) => r.globalRow + 1).join('+')})` },
    { color: '#ffffff', stroke: '#334155', label: 'Strek' },
    { color: '#fef3c7', stroke: '#334155', label: 'Kop' },
    { color: '#dbeafe', stroke: '#334155', label: 'Drieklezoor' },
    ...(verband === 'wildverband' && isWildverbandKoppelstrip() ? [{ color: '#fb923c', stroke: '#334155', label: 'Koppelstrip (meegelegd)' }] : []),
    { color: COL_BLUE,   label: 'Hoofdmaatvoering' },
    { color: COL_ORANGE, label: 'Modulemaat h.o.h.' },
  ];
  legItems.forEach(({ color, stroke, label }, i) => {
    const lx = r2(Number(legX) + legPad);
    const ly = r2(Number(legY) + 24 + i * 14);
    const sw = stroke ? ` stroke="${stroke}" stroke-width="0.8"` : '';
    parts.push(`<rect x="${lx}" y="${r2(Number(ly) - 7)}" width="16" height="8" fill="${color}"${sw}/>`);
    parts.push(`<text x="${r2(Number(lx) + 20)}" y="${ly}" font-size="7" fill="#1e293b">${label}</text>`);
  });

  // arrowhead marker def
  parts.splice(1, 0, `<defs><marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#0f766e"/></marker></defs>`);

  parts.push('</svg>');
  return parts.join('\n');
}

export function buildWildverbandPanelGrid(facadeWidth, facadeHeight, openings, material, panelSettings = {}) {
  const { steenH, lint, stoot: j } = material;
  const lagenmaat = steenH + lint;
  const modWidth = getWildverbandModuleWidth(material);
  const boundary = getWildverbandPanelBoundary(material);

  const N = panelSettings.modulesPerPanel ?? 2;
  const panelW = N * boundary - (N - 1) * (modWidth - boundary);
  const rowsPerPanel = panelSettings.rowsPerPanel ?? 12;
  const panelH = rowsPerPanel * lagenmaat;

  const panels = [];
  let panelX = 0;
  let panelIndex = 0;

  while (panelX < facadeWidth - 0.5) {
    const isStart = panelIndex === 0;
    const pw = Math.min(panelW, facadeWidth - panelX);

    let panelY = 0;
    let globalRowBase = 0;
    while (panelY < facadeHeight - 0.5) {
      const ph = Math.min(panelH, facadeHeight - panelY);
      const rowsInThisPanel = Math.round(ph / lagenmaat);

      const rows = [];
      for (let r = 0; r < rowsInThisPanel; r++) {
        const globalRow = globalRowBase + r;
        const strips = buildWildverbandRow(pw, material, globalRow, isStart);
        const yBot = panelY + r * lagenmaat;
        rows.push({ y: yBot, height: steenH, strips });
      }

      panels.push({
        id: `wv_${panelIndex}_${Math.round(panelY)}`,
        x: panelX,
        y: panelY,
        width: pw,
        height: ph,
        type: isStart ? 'start' : 'volg',
        rowBase: globalRowBase,
        rowsPerPanel: rowsInThisPanel,
        rows,
      });

      panelY += panelH;
      globalRowBase += rowsInThisPanel;
    }

    panelX += panelW + PANEL_GAP;
    panelIndex++;
  }

  return { panels };
}
