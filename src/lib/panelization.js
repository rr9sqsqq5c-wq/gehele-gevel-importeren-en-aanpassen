import { polyXRangesAtY, openingCoversX, openingXCoordsAtY } from './geometry.js';

function round2(v) {
  return Math.round(v * 100) / 100;
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
  const yBreaks = [...ySet].sort((a, b) => a - b);

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
  const rowsPerMold = Math.max(1, Math.floor(moldHoogte / lagenmaat));

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
    targetWidth:  Math.min(w, brickTargetW),
    targetHeight: Math.min(effectiveH, brickTargetH),
  };
}

export function generateMoldDXF(mat, verband, moldDims, moldId = 'A') {
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
  const frame = 15;
  const innerW = moldW - 2 * frame;
  const innerH = moldH - 2 * frame;
  const rowsPerMold = Math.max(1, Math.floor(innerH / lagenmaat));

  const WILD_12 = [[0, 6, 3], [9, 2, 8]];
  const moldIdx = moldId === 'B' ? 1 : 0;
  const globalRowBase = moldIdx * rowsPerMold;

  function rowOffset(localRow) {
    const globalRow = globalRowBase + localRow;
    if (verband === 'wildverband') {
      const t = WILD_12[moldIdx][localRow % 3];
      return Math.round((t / 12) * colStep * 10) / 10;
    }
    if (verband === 'halfsteens' || verband === 'tegelverband' || isStaand) {
      return globalRow % 2 === 0 ? 0 : Math.round(colStep / 2);
    }
    return 0;
  }

  function halfsteensHasKop(globalRow) {
    return verband === 'halfsteens' && globalRow % 2 === 0;
  }

  const kopW = isStaand ? 0 : Math.round((steenL - stoot) / 2);

  function bricksInRow(localRow) {
    const globalRow = globalRowBase + localRow;
    const off = rowOffset(localRow);
    const bricks = [];
    const hasKop = halfsteensHasKop(globalRow);

    let x = -off;
    if (hasKop) {
      const kx = x;
      if (kx + kopW > 0 && kx < innerW) {
        bricks.push({ x: kx, w: kopW, label: 'Kop' });
      }
      x += kopW + stoot;
    }

    while (x < innerW + 0.001) {
      const bx = x;
      const bw = brickW;
      if (bx + bw > 0 && bx < innerW) {
        const clippedX = Math.max(0, bx);
        const clippedW = Math.min(bx + bw, innerW) - clippedX;
        if (clippedW > 0.5) {
          bricks.push({ x: clippedX, w: clippedW, label: Math.abs(clippedW - brickW) < 0.5 ? 'Vol' : 'Rest' });
        }
      }
      x += colStep;
    }
    return bricks;
  }

  const totalRowH = (rowsPerMold - 1) * lagenmaat + brickH;
  const yStartInner = Math.round(((innerH - totalRowH) / 2) * 10) / 10;

  const r2 = (v) => Math.round(v * 100) / 100;

  const lines = [];

  function addPolyRect(x1, y1, w, h, layer, color) {
    const x2 = x1 + w, y2 = y1 + h;
    lines.push('0', 'LWPOLYLINE', '8', layer, '62', String(color), '70', '1', '90', '4');
    for (const [px, py] of [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]) {
      lines.push('10', String(r2(px)), '20', String(r2(py)));
    }
  }

  function addCircle(cx, cy, radius, layer, color) {
    lines.push('0', 'CIRCLE', '8', layer, '62', String(color),
      '10', String(r2(cx)), '20', String(r2(cy)), '40', String(r2(radius)));
  }

  function addText(x, y, h, text, layer) {
    lines.push('0', 'TEXT', '8', layer, '62', '7',
      '10', String(r2(x)), '20', String(r2(y)), '30', '0.0',
      '40', String(r2(h)), '1', text);
  }

  addPolyRect(0, 0, moldW, moldH, 'FRAME', 7);
  addPolyRect(frame, frame, innerW, innerH, 'GUIDE', 8);

  for (let r = 0; r < rowsPerMold; r++) {
    const yRow = frame + yStartInner + r * lagenmaat;
    const bricks = bricksInRow(r);
    for (const b of bricks) {
      const slotX = frame + b.x - 1.5;
      const slotW = b.w + 3;
      const slotY = yRow - 1.5;
      const slotH = brickH + 3;
      addPolyRect(slotX, slotY, slotW, slotH, 'SLOTS', 2);
    }
    addText(frame, frame + yStartInner + r * lagenmaat - 10, 6,
      `Rij ${globalRowBase + r + 1}  off=${rowOffset(r)}mm`, 'LABELS');
  }

  const pinStepX = Math.round(innerW / Math.round(innerW / 350));
  const pinYs = [frame / 2];
  for (let r = 0; r < rowsPerMold - 1; r++) {
    const y1 = frame + yStartInner + r * lagenmaat + brickH + 1.5;
    const y2 = frame + yStartInner + (r + 1) * lagenmaat - 1.5;
    pinYs.push((y1 + y2) / 2);
  }
  pinYs.push(moldH - frame / 2);

  for (const py of pinYs) {
    for (let x = frame; x <= moldW - frame + 0.1; x += pinStepX) {
      addCircle(r2(x), r2(py), 3, 'HOLES', 1);
    }
  }

  addText(frame, -18, 8,
    `MAL-${moldId} | ${verband} | ${moldW}x${moldH}mm | ${rowsPerMold} rijen/doorgang | Staal 2mm`, 'TITLE');

  const header = [
    '0', 'SECTION', '2', 'HEADER',
    '9', '$ACADVER', '1', 'AC1009',
    '9', '$EXTMIN', '10', '0.0', '20', String(-30), '30', '0.0',
    '9', '$EXTMAX', '10', String(moldW), '20', String(moldH + 30), '30', '0.0',
    '9', '$LUNITS', '70', '4',
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES',
    '0', 'TABLE', '2', 'LAYER', '70', '6',
    '0', 'LAYER', '2', 'FRAME',   '70', '0', '62', '7', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'GUIDE',   '70', '0', '62', '8', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'SLOTS',   '70', '0', '62', '2', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'HOLES',   '70', '0', '62', '1', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'LABELS',  '70', '0', '62', '3', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'TITLE',   '70', '0', '62', '7', '6', 'CONTINUOUS',
    '0', 'ENDTAB',
    '0', 'ENDSEC',
  ].join('\n');

  const body = [
    '0', 'SECTION', '2', 'ENTITIES',
    lines.join('\n'),
    '0', 'ENDSEC',
    '0', 'EOF',
  ].join('\n');

  return header + '\n' + body;
}
