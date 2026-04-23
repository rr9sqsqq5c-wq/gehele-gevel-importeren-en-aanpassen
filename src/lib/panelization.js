import { polyXRangesAtY, openingCoversX, openingXCoordsAtY } from './geometry.js';

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

export function buildFacadeZones(facadeWidth, facadeHeight, openings) {
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

export function generateBattenPositions(groupHeight, mat, maxInterval) {
  const steenH = mat.steenH ?? 50;
  const lint   = mat.lint   ?? 12;
  const lagenmaat = steenH + lint;
  if (lagenmaat <= 0) return [];
  const N = Math.max(1, Math.floor(maxInterval / lagenmaat));
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

function buildPanelsFromBreaks(zone, xBreaks, yBreaks, orientation) {
  const panels = [];
  let id = 1;
  for (let yi = 0; yi < yBreaks.length - 1; yi++) {
    for (let xi = 0; xi < xBreaks.length - 1; xi++) {
      const w = round2(xBreaks[xi + 1] - xBreaks[xi]);
      const h = round2(yBreaks[yi + 1] - yBreaks[yi]);
      if (w <= 0 || h <= 0) continue;
      panels.push({
        id: `${zone.id}-P${id}`,
        zoneId: zone.id,
        row: yi + 1, col: xi + 1,
        x: xBreaks[xi], y: yBreaks[yi],
        width: w, height: h,
        area: round2(w * h),
        orientation,
      });
      id++;
    }
  }
  return panels;
}

export function panelizeZone(zone, battenYs, basePanel) {
  const bpW = basePanel.width;
  const bpH = basePanel.height;
  const minPanelH = basePanel.minHeight ?? 800;
  const targetW = basePanel.targetWidth ?? bpW;

  const zoneX1 = round2(zone.x);
  const zoneX2 = round2(zone.x + zone.width);
  const zoneY1 = round2(zone.y);
  const zoneY2 = round2(zone.y + zone.height);

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
        const nSteps = Math.ceil(span / bpH);
        for (let s = 1; s < nSteps; s++) extraY.push(round2(yBreaks[i] + s * (span / nSteps)));
      }
    }
    if (extraY.length) {
      const newSet = new Set([...yBreaks.map(round2), ...extraY.map(round2)]);
      yBreaks = [...newSet].sort((a, b) => a - b);
    }
  }

  const effectiveMinH = Math.min(minPanelH, zone.height);
  yBreaks = mergeSmallSegments(yBreaks, effectiveMinH);

  const xSet = new Set([zoneX1, zoneX2]);
  if (zone.width > targetW + 1) {
    let xCur = round2(zoneX1 + targetW);
    while (xCur < zoneX2 - 10) {
      xSet.add(xCur);
      xCur = round2(xCur + targetW);
    }
  }
  const xBreaks = [...xSet].sort((a, b) => a - b);

  const fitsLandscape = zone.width <= bpW && zone.height <= bpH;
  const orientation = fitsLandscape ? 'liggend' : 'staand';
  const panels = buildPanelsFromBreaks(zone, xBreaks, yBreaks, orientation);
  if (!panels.length) return { ok: false, panels: [] };
  return { ok: true, orientation, panelCount: panels.length, panels };
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
  const panelW = panelen?.gewichtM2 ?? 9.4;
  const brickW = brickWeightM2 ?? 40;
  const totalW = Math.max(0.001, panelW + brickW);
  const maxAreaMM2 = (maxKg / totalW) * 1e6;
  const effectiveH = Math.min(h, Math.max(100, Math.floor(maxAreaMM2 / w)));

  const steenL = material?.steenL ?? 210;
  const steenH = material?.steenH ?? 50;
  const lint  = material?.lint  ?? 12;
  const stoot = material?.stoot ?? 10;
  const brickTargetW = 5 * steenL + 4 * stoot;
  const brickTargetH = 14 * steenH + 13 * lint;

  return {
    width: w,
    height: effectiveH,
    minHeight: 800,
    targetWidth:  Math.min(w, brickTargetW),
    targetHeight: Math.min(effectiveH, brickTargetH),
  };
}

function _moldGeometry(mat, verband, moldDims, moldId) {
  const steenH = mat?.steenH ?? 50;
  const lint   = mat?.lint   ?? 12;
  const steenL = mat?.steenL ?? 210;
  const stoot  = mat?.stoot  ?? 10;
  const isStaand = verband === 'staand_tegelverband';
  const lagenmaat = isStaand ? steenL + lint : steenH + lint;
  const brickW = isStaand ? steenH : steenL;
  const brickH = isStaand ? steenL : steenH;
  const colStep = brickW + stoot;
  const moldW = moldDims?.lengte ?? 3400;
  const moldH = moldDims?.hoogte ?? 270;
  const tolerantieL = moldDims?.tolerantieL ?? 1;  // mm extra per zijde (horizontaal)
  const tolerantieH = moldDims?.tolerantieH ?? 1;  // mm extra per zijde (verticaal)
  const frameH    = 30;  // top + bottom margin from outer edge (min 20mm)
  const frameLeft = 40;  // left start, aligned with first notch
  const frame = frameH;  // alias kept for pin-hole logic
  const innerW = moldW - 2 * frameLeft;
  const innerH = moldH - 2 * frameH;
  const slotH = brickH + 2 * tolerantieH;   // actual slot height including tolerance
  const minRowGap = 10;                       // minimum gap between row slots (independent of lintvoeg)
  const rowsPerMold = Math.min(3, Math.max(1, Math.floor((innerH + minRowGap) / (slotH + minRowGap))));
  // Wildverband: same module-fraction offsets as pattern.js [0, 1/3, 2/3, 1/6, 5/6, 1/2]
  const WILD_FRACS = [0, 1/3, 2/3, 1/6, 5/6, 1/2];
  const MOLD_ORDER = ['Links', 'Rechts', 'C', 'D', 'A', 'B'];
  const moldIdx = MOLD_ORDER.indexOf(moldId) >= 0 ? Math.min(MOLD_ORDER.indexOf(moldId), 3) : 0;
  const globalRowBase = moldIdx * rowsPerMold;
  const kopW  = isStaand ? 0 : Math.round((steenL - stoot) / 2);
  const drieKW = isStaand ? 0 : Math.round((steenL + stoot) * 0.75 - stoot);

  function rowOffset(localRow) {
    const globalRow = globalRowBase + localRow;
    if (verband === 'wildverband') {
      return Math.round(WILD_FRACS[globalRow % 6] * colStep * 10) / 10;
    }
    if (verband === 'halfsteens') {
      return 0;
    }
    if (verband === 'tegelverband' || isStaand) {
      return globalRow % 2 === 0 ? 0 : Math.round(colStep / 2);
    }
    return 0;
  }

  function bricksInRow(localRow) {
    const globalRow = globalRowBase + localRow;
    const off = rowOffset(localRow);
    const bricks = [];

    if (verband === 'wildverband') {
      const S = brickW, K = kopW, D = drieKW;
      const SEQS = [
        [S, S, K, S, S, D],
        [S, K, S, S, D, S],
        [K, S, S, D, S, S],
        [S, S, D, S, S, K],
        [S, D, S, S, K, S],
        [D, S, S, K, S, S],
      ];
      const seq = SEQS[globalRow % 6];
      let x = -off;
      let si = 0;
      while (x < innerW + 0.001) {
        const bLen = seq[si % seq.length];
        if (x + bLen > 0 && x < innerW) {
          const cx = Math.max(0, x);
          const cw = Math.min(x + bLen, innerW) - cx;
          if (cw > 0.5) {
            const label = Math.abs(cw - brickW) < 0.5 ? 'Vol'
              : Math.abs(cw - kopW) < 1 ? 'Kop'
              : Math.abs(cw - drieKW) < 1 ? 'Driekwart'
              : 'Rest';
            bricks.push({ x: cx, w: cw, label });
          }
        }
        x = Math.round((x + bLen + stoot) * 10) / 10;
        si++;
      }
      return bricks;
    }

    const hasKop = verband === 'halfsteens' && globalRow % 2 === 1;
    let x = -off;
    if (hasKop) {
      if (x + kopW > 0 && x < innerW) bricks.push({ x, w: kopW, label: 'Kop' });
      x += kopW + stoot;
    }
    while (x < innerW + 0.001) {
      if (x + brickW > 0 && x < innerW) {
        const cx = Math.max(0, x);
        const cw = Math.min(x + brickW, innerW) - cx;
        if (cw > 0.5) bricks.push({ x: cx, w: cw, label: Math.abs(cw - brickW) < 0.5 ? 'Vol' : 'Rest' });
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

  // Notch X-positions: first notch starts at frameLeft (=40mm), last notch ends at moldW-frameLeft
  function calcNotchXs() {
    const firstW = 60, midW = 62;
    const lastStart = moldW - frameLeft - midW;
    const firstEnd = frameLeft + firstW;
    const nMiddle = 3;
    const gap = (lastStart - firstEnd) / (nMiddle + 1);
    const xs = [frameLeft];
    for (let i = 1; i <= nMiddle; i++) xs.push(Math.round(firstEnd + i * gap - midW / 2));
    xs.push(lastStart);
    return { notchXs: xs, notchWs: [firstW, midW, midW, midW, midW] };
  }
  const { notchXs, notchWs } = calcNotchXs();

  return { moldW, moldH, frame, frameH, frameLeft, innerW, innerH, brickW, brickH, colStep, lagenmaat, slotH, tolerantieL, tolerantieH, rowsPerMold, globalRowBase, rows, pinYs, pinStepX, notchXs, notchWs };
}

export function generateMoldDXF(mat, verband, moldDims, moldId = 'A') {
  const g = _moldGeometry(mat, verband, moldDims, moldId);
  const { moldW, moldH, frameH, frameLeft, innerW, innerH, slotH, tolerantieL, rows, pinYs, pinStepX, notchXs, notchWs } = g;
  const r2 = (v) => Math.round(v * 100) / 100;
  const lines = [];

  function addPolyRect(x1, y1, w, h, layer, color) {
    lines.push('0', 'LWPOLYLINE', '8', layer, '62', String(color), '70', '1', '90', '4');
    for (const [px, py] of [[x1, y1], [x1 + w, y1], [x1 + w, y1 + h], [x1, y1 + h]])
      lines.push('10', String(r2(px)), '20', String(r2(py)));
  }
  function addCircle(cx, cy, radius, layer, color) {
    lines.push('0', 'CIRCLE', '8', layer, '62', String(color),
      '10', String(r2(cx)), '20', String(r2(cy)), '40', String(r2(radius)));
  }
  function addText(x, y, h, text, layer) {
    lines.push('0', 'TEXT', '8', layer, '62', '7',
      '10', String(r2(x)), '20', String(r2(y)), '30', '0.0', '40', String(r2(h)), '1', text);
  }

  const notchDepth = 20;
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
    lines.push('0', 'LWPOLYLINE', '8', 'FRAME', '62', '7', '70', '1', '90', String(pts.length));
    for (const [px, py] of pts) lines.push('10', String(r2(px)), '20', String(r2(py)));
  }
  addPolyRect(frameLeft, frameH, innerW, innerH, 'GUIDE', 8);

  for (const row of rows) {
    for (const b of row.bricks) {
      addPolyRect(r2(frameLeft + b.x - tolerantieL), r2(row.yRow), r2(b.w + 2 * tolerantieL), r2(slotH), 'SLOTS', 2);
    }
    addText(frameLeft, row.yRow - 10, 6, `Rij ${row.globalRow + 1}  off=${row.off}mm  tol±${tolerantieL}x${g.tolerantieH}mm`, 'LABELS');
  }
  for (const py of pinYs)
    for (let x = frameLeft; x <= moldW - frameLeft + 0.1; x += pinStepX)
      addCircle(r2(x), r2(py), 3, 'HOLES', 1);

  // Alignment hole — Ø8mm, 11mm from left edge, vertically centred
  addCircle(11, r2(moldH / 2), 4, 'HOLES', 1);

  addText(frame, -18, 8,
    `MAL ${moldId} | ${verband} | ${moldW}x${moldH}mm | ${g.rowsPerMold} rijen/doorgang | Staal 2mm`, 'TITLE');

  const header = [
    '0', 'SECTION', '2', 'HEADER',
    '9', '$ACADVER', '1', 'AC1009',
    '9', '$EXTMIN', '10', '0.0', '20', '-30', '30', '0.0',
    '9', '$EXTMAX', '10', String(moldW), '20', String(moldH + 30), '30', '0.0',
    '9', '$LUNITS', '70', '4',
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES',
    '0', 'TABLE', '2', 'LAYER', '70', '6',
    '0', 'LAYER', '2', 'FRAME',  '70', '0', '62', '7', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'GUIDE',  '70', '0', '62', '8', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'SLOTS',  '70', '0', '62', '2', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'HOLES',  '70', '0', '62', '1', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'LABELS', '70', '0', '62', '3', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'TITLE',  '70', '0', '62', '7', '6', 'CONTINUOUS',
    '0', 'ENDTAB', '0', 'ENDSEC',
  ].join('\n');

  return header + '\n' + ['0', 'SECTION', '2', 'ENTITIES', lines.join('\n'), '0', 'ENDSEC', '0', 'EOF'].join('\n');
}

export function generateMoldSVG(mat, verband, moldDims, moldId = 'A') {
  const g = _moldGeometry(mat, verband, moldDims, moldId);
  const { moldW, moldH, frameH, frameLeft, innerW, innerH, brickH, slotH, tolerantieL, tolerantieH, rows, rowsPerMold, globalRowBase, notchXs, notchWs } = g;
  const isStaand = verband === 'staand_tegelverband';
  const displayBrickW = isStaand ? (mat?.steenH ?? 50) : (mat?.steenL ?? 210);
  const displayBrickH = isStaand ? (mat?.steenL ?? 210) : (mat?.steenH ?? 50);

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
  const notchDepth = 20;

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
  const slotFill = { Vol: '#ffffff', Kop: '#fef3c7', Driekwart: '#dbeafe', Rest: '#fee2e2' };
  for (const row of rows) {
    const sTop = r2(oy + row.yRow);          // row.yRow = top of slot
    const sH   = r2(slotH);                   // = brickH + 2*tolerantieH
    for (const b of row.bricks) {
      const sLeft = r2(ox + frameLeft + b.x - tolerantieL);
      const sW    = r2(b.w + 2 * tolerantieL);
      const fill  = slotFill[b.label] ?? '#ffffff';
      parts.push(`<rect x="${sLeft}" y="${sTop}" width="${sW}" height="${sH}" fill="${fill}" stroke="#334155" stroke-width="1" rx="1"/>`);
      if (b.label !== 'Vol' && sW > 12) {
        parts.push(`<text x="${r2(Number(sLeft) + Number(sW)/2)}" y="${r2(Number(sTop) + Number(sH)/2 + 2.5)}" text-anchor="middle" font-size="5" fill="#475569">${b.label[0]}</text>`);
      }
    }
    // Row label inside mold on the left
    const labelY = r2(oy + row.yRow + slotH / 2 + 2.5);
    parts.push(`<text x="${r2(ox + frameLeft + 2)}" y="${labelY}" font-size="6" fill="#475569">R${row.globalRow + 1}</text>`);
  }

  // Strip size label — top-left inside mold
  parts.push(`<text x="${r2(ox + frameLeft + 30)}" y="${r2(oy + frameH + 11)}" font-size="8" fill="#1e293b" font-weight="bold">${displayBrickW}×${displayBrickH}mm  tol L±${tolerantieL} H±${tolerantieH}mm</text>`);

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
    { color: '#ffffff', stroke: '#334155', label: 'Strek (Vol)' },
    { color: '#fef3c7', stroke: '#334155', label: 'Kop' },
    { color: '#dbeafe', stroke: '#334155', label: 'Driekwart' },
  ];
  legItems.forEach(({ color, stroke, label }, i) => {
    const lx  = r2(Number(legX) + legPad);
    const ly  = r2(Number(legY) + 24 + i * 15);
    const sw  = stroke ? ` stroke="${stroke}" stroke-width="0.8"` : '';
    parts.push(`<rect x="${lx}" y="${r2(Number(ly) - 7)}" width="16" height="8" fill="${color}"${sw}/>`);
    parts.push(`<text x="${r2(Number(lx) + 20)}" y="${ly}" font-size="7" fill="#1e293b">${label}</text>`);
  });

  // ── Small title in mold ──
  parts.push(`<text x="${r2(ox + frameLeft + 2)}" y="${r2(oy + 9)}" font-size="6" fill="#64748b">MAL ${moldId} | ${verband} | ${moldW}×${moldH}mm | ${rowsPerMold} rijen | Staal 2mm</text>`);

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

  const lagenmaat = isStaand ? steenL + lint : steenH + lint;
  const brickW    = isStaand ? steenH : steenL;
  const brickH    = isStaand ? steenL : steenH;
  const colStep   = brickW + stoot;

  const moldW = moldDims?.lengte    ?? 3400;
  const moldH = moldDims?.hoogte    ?? 270;
  const tolerantieH = moldDims?.tolerantieH ?? 1;
  const frameH = 30;
  const innerH = moldH - 2 * frameH;
  const slotH_tmpl = brickH + 2 * tolerantieH;
  const minRowGap = 10;
  const rowsPerMold = Math.min(3, Math.max(1, Math.floor((innerH + minRowGap) / (slotH_tmpl + minRowGap))));

  const WILD_FRACS = [0, 1/3, 2/3, 1/6, 5/6, 1/2];

  function offsetForGlobalRow(globalRow) {
    if (verband === 'wildverband') {
      return Math.round(WILD_FRACS[globalRow % 6] * colStep * 10) / 10;
    }
    if (verband === 'halfsteens') {
      return 0;
    }
    if (verband === 'tegelverband' || isStaand) {
      return globalRow % 2 === 0 ? 0 : Math.round(colStep / 2);
    }
    return 0;
  }

  function rowLabel(globalRow, offset) {
    if (verband === 'halfsteens') {
      return globalRow % 2 === 1 ? `Rij ${globalRow + 1} — koppenrij (offset ${offset} mm)` : `Rij ${globalRow + 1} — strekkenrij (offset 0)`;
    }
    return `Rij ${globalRow + 1} — offset ${offset} mm`;
  }

  // Determine number of molds (cycle length / rowsPerMold)
  const cycleLength = verband === 'wildverband' ? 6 : 2;
  const numMolds = Math.ceil(cycleLength / rowsPerMold);
  const MOLD_IDS = ['Links', 'Rechts', 'C', 'D'];

  const templates = [];
  for (let m = 0; m < numMolds; m++) {
    const id = MOLD_IDS[m] ?? String(m + 1);
    const globalRowBase = m * rowsPerMold;
    const rowsInThisMold = Math.min(rowsPerMold, cycleLength - globalRowBase);
    const rows = [];
    for (let r = 0; r < rowsInThisMold; r++) {
      const globalRow = globalRowBase + r;
      const offset = offsetForGlobalRow(globalRow);
      rows.push({ globalRow, localRow: r, offset, label: rowLabel(globalRow, offset) });
    }
    templates.push({ id, globalRows: rows.map((r) => r.globalRow), rowsPerMold: rowsInThisMold, lagenmaat, brickW, brickH, colStep, rotated: isStaand, rows });
  }

  return {
    verband,
    molds: numMolds,
    rowsPerMold,
    lagenmaat,
    brickW,
    brickH,
    colStep,
    cycleLength,
    rotated: isStaand,
    moldW,
    moldH,
    templates,
  };
}

export function generateCombinedMoldSVG(mat, verband, moldDims) {
  const tpl = getMoldTemplates(verband, mat, moldDims);
  const moldIds = tpl.templates.map((t) => t.id);

  const gA = _moldGeometry(mat, verband, moldDims, moldIds[0] ?? 'Links');
  const gB = _moldGeometry(mat, verband, moldDims, moldIds[1] ?? 'Rechts');

  const { moldW, moldH, frameH, frameLeft, innerW, innerH, slotH, tolerantieL, tolerantieH, notchXs, notchWs } = gA;
  const isStaand = verband === 'staand_tegelverband';
  const displayBrickW = isStaand ? (mat?.steenH ?? 50) : (mat?.steenL ?? 210);
  const displayBrickH = isStaand ? (mat?.steenL ?? 210) : (mat?.steenH ?? 50);

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

  const notchDepth = 20;
  const slotFill = { Vol: '#ffffff', Kop: '#fef3c7', Driekwart: '#dbeafe', Rest: '#fee2e2' };
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
      const sTop = r2(oy + row.yRow);
      const sH   = r2(slotH);
      for (const b of row.bricks) {
        const sLeft = r2(ox + frameLeft + b.x - tolerantieL);
        const sW    = r2(b.w + 2 * tolerantieL);
        const fill  = slotFill[b.label] ?? '#ffffff';
        out.push(`<rect x="${sLeft}" y="${sTop}" width="${sW}" height="${sH}" fill="${fill}" stroke="#334155" stroke-width="1" rx="1"/>`);
        if (b.label !== 'Vol' && sW > 12)
          out.push(`<text x="${r2(Number(sLeft) + Number(sW)/2)}" y="${r2(Number(sTop) + Number(sH)/2 + 2.5)}" text-anchor="middle" font-size="5" fill="#475569">${b.label[0]}</text>`);
      }
      const labelY = r2(oy + row.yRow + slotH / 2 + 2.5);
      out.push(`<text x="${r2(ox + frameLeft + 2)}" y="${labelY}" font-size="6" fill="#475569">R${row.globalRow + 1}</text>`);
    }
    // header banner
    out.push(`<rect x="${r2(ox + frameLeft)}" y="${r2(oy + 1)}" width="${r2(Math.min(220, innerW))}" height="16" fill="${headerColor}" rx="2" opacity="0.85"/>`);
    out.push(`<text x="${r2(ox + frameLeft + 6)}" y="${r2(oy + 12)}" font-size="9" fill="#ffffff" font-weight="bold">MAL ${moldId} — Rijen ${g.rows.map((r) => r.globalRow + 1).join(' + ')}</text>`);
    // strip size info (top right of mold)
    out.push(`<text x="${r2(ox + frameLeft + 30)}" y="${r2(oy + frameH + 11)}" font-size="7" fill="#1e293b" font-weight="bold">${displayBrickW}×${displayBrickH}mm  tol L±${tolerantieL} H±${tolerantieH}mm</text>`);
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
  parts.push(`<text x="${r2(ox)}" y="18" font-size="11" fill="#0f172a" font-weight="bold">Maltekening — MAL ${moldIds[0] ?? 'Links'} + MAL ${moldIds[1] ?? 'Rechts'} | ${verband} | ${moldW}×${moldH}mm | Staal 2mm</text>`);

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
    { color: '#ffffff', stroke: '#334155', label: 'Strek (Vol)' },
    { color: '#fef3c7', stroke: '#334155', label: 'Kop' },
    { color: '#dbeafe', stroke: '#334155', label: 'Driekwart' },
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
