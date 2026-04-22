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
  const frame = 15;
  const innerW = moldW - 2 * frame;
  const innerH = moldH - 2 * frame;
  const rowsPerMold = Math.min(3, Math.max(1, Math.floor(innerH / lagenmaat)));
  // Wildverband: same module-fraction offsets as pattern.js [0, 1/3, 2/3, 1/6, 5/6, 1/2]
  const WILD_FRACS = [0, 1/3, 2/3, 1/6, 5/6, 1/2];
  const moldIdx = moldId === 'B' ? 1 : 0;
  const globalRowBase = moldIdx * rowsPerMold;
  const kopW = isStaand ? 0 : Math.round((steenL - stoot) / 2);

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
    const hasKop = verband === 'halfsteens' && globalRow % 2 === 1;
    const bricks = [];
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

  const totalRowH = (rowsPerMold - 1) * lagenmaat + brickH;
  const yStartInner = Math.round(((innerH - totalRowH) / 2) * 10) / 10;
  const pinStepX = Math.round(innerW / Math.round(innerW / 350));

  const rows = [];
  for (let r = 0; r < rowsPerMold; r++) {
    const yRow = frame + yStartInner + r * lagenmaat;
    const off = rowOffset(r);
    rows.push({ localRow: r, globalRow: globalRowBase + r, yRow, off, bricks: bricksInRow(r) });
  }

  const pinYs = [frame / 2];
  for (let r = 0; r < rowsPerMold - 1; r++) {
    const y1 = frame + yStartInner + r * lagenmaat + brickH + 1.5;
    const y2 = frame + yStartInner + (r + 1) * lagenmaat - 1.5;
    pinYs.push((y1 + y2) / 2);
  }
  pinYs.push(moldH - frame / 2);

  return { moldW, moldH, frame, innerW, innerH, brickW, brickH, colStep, lagenmaat, rowsPerMold, globalRowBase, rows, pinYs, pinStepX };
}

export function generateMoldDXF(mat, verband, moldDims, moldId = 'A') {
  const g = _moldGeometry(mat, verband, moldDims, moldId);
  const { moldW, moldH, frame, innerW, innerH, brickH, rows, pinYs, pinStepX } = g;
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

  // Mold outline with notches at bottom
  const refTotalW  = 3395;
  const refNotchXs = [272, 970, 1670, 2370, 3070];
  const refNotchWs = [60, 62, 62, 62, 62];
  const notchDepth = 20;
  const notchXs = refNotchXs.map(p => Math.round(p * moldW / refTotalW));
  const notchWs = refNotchWs.map(w => Math.max(16, Math.round(w * moldW / refTotalW)));
  {
    const pts = [[0, 0], [moldW, 0], [moldW, moldH]];
    for (let i = notchXs.length - 1; i >= 0; i--) {
      pts.push([notchXs[i] + notchWs[i], moldH], [notchXs[i] + notchWs[i], moldH - notchDepth], [notchXs[i], moldH - notchDepth], [notchXs[i], moldH]);
    }
    pts.push([0, moldH]);
    lines.push('0', 'LWPOLYLINE', '8', 'FRAME', '62', '7', '70', '1', '90', String(pts.length));
    for (const [px, py] of pts) lines.push('10', String(r2(px)), '20', String(r2(py)));
  }
  addPolyRect(frame, frame, innerW, innerH, 'GUIDE', 8);

  for (const row of rows) {
    for (const b of row.bricks) {
      addPolyRect(frame + b.x - 1.5, row.yRow - 1.5, b.w + 3, brickH + 3, 'SLOTS', 2);
    }
    addText(frame, row.yRow - 10, 6, `Rij ${row.globalRow + 1}  off=${row.off}mm`, 'LABELS');
  }
  for (const py of pinYs)
    for (let x = frame; x <= moldW - frame + 0.1; x += pinStepX)
      addCircle(r2(x), r2(py), 3, 'HOLES', 1);

  addText(frame, -18, 8,
    `MAL-${moldId} | ${verband} | ${moldW}x${moldH}mm | ${g.rowsPerMold} rijen/doorgang | Staal 2mm`, 'TITLE');

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
  const { moldW, moldH, frame, innerW, innerH, brickH, rows, rowsPerMold, globalRowBase } = g;
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
  const legendH = 90;
  const mBottom = legendH + 30;

  const svgW = mLeft + moldW + mRight;
  const svgH = mTop + moldH + numDimRows * dimRowH + refGap + mBottom;

  const ox = mLeft;  // mold left in SVG
  const oy = mTop;   // mold top in SVG

  // Notch geometry — proportional to 3395mm reference drawing
  const refTotalW  = 3395;
  const refNotchXs = [272, 970, 1670, 2370, 3070];
  const refNotchWs = [60, 62, 62, 62, 62];
  const notchDepth = 20;
  const notchXs = refNotchXs.map(p => rn(p * moldW / refTotalW));
  const notchWs = refNotchWs.map(w => Math.max(16, rn(w * moldW / refTotalW)));

  // Mold outline path with notches cut from bottom edge
  function moldOutlinePath() {
    let d = `M ${ox},${oy}`;
    d += ` L ${ox + moldW},${oy}`;
    d += ` L ${ox + moldW},${oy + moldH}`;
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
  parts.push(`<rect x="${r2(ox + frame)}" y="${r2(oy + frame)}" width="${r2(innerW)}" height="${r2(innerH)}" fill="none" stroke="#94a3b8" stroke-width="0.5" stroke-dasharray="5,3"/>`);

  // ── Alignment hole — Ø8mm, 11mm from left edge, vertically centred ──
  {
    const hcx = r2(ox + 11);
    const hcy = r2(oy + moldH / 2);
    parts.push(`<circle cx="${hcx}" cy="${hcy}" r="4" fill="#ffffff" stroke="#1e293b" stroke-width="1"/>`);
    parts.push(`<line x1="${r2(ox + 11 - 6)}" y1="${hcy}" x2="${r2(ox + 11 + 6)}" y2="${hcy}" stroke="#666" stroke-width="0.5"/>`);
    parts.push(`<line x1="${hcx}" y1="${r2(oy + moldH / 2 - 6)}" x2="${hcx}" y2="${r2(oy + moldH / 2 + 6)}" stroke="#666" stroke-width="0.5"/>`);
  }

  // ── Strip slots (white rectangles inside mold) ──
  const slotPad = 1.5;
  for (const row of rows) {
    const sTop = r2(oy + moldH - frame - row.yRow - brickH - slotPad);
    const sH   = r2(brickH + 2 * slotPad);
    for (const b of row.bricks) {
      const sLeft = r2(ox + frame + b.x - slotPad);
      const sW    = r2(b.w + 2 * slotPad);
      parts.push(`<rect x="${sLeft}" y="${sTop}" width="${sW}" height="${sH}" fill="#ffffff" stroke="#334155" stroke-width="1" rx="1"/>`);
    }
    // Row label inside mold on the left
    const labelY = r2(oy + moldH - frame - row.yRow - brickH / 2 + 3);
    parts.push(`<text x="${r2(ox + frame + 2)}" y="${labelY}" font-size="6" fill="#475569">R${row.globalRow + 1}</text>`);
  }

  // Strip size label — top-left inside mold
  parts.push(`<text x="${r2(ox + frame + 30)}" y="${r2(oy + frame + 11)}" font-size="8" fill="#1e293b" font-weight="bold">${displayBrickW}×${displayBrickH}mm</text>`);

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
    const absX = b => ox + frame + b.x;
    // left margin
    parts.push(dimLine(ox, absX(refBricks[0]), rowY1, String(rn(frame + refBricks[0].x)), '#333333', 4, 6));
    for (let i = 0; i < refBricks.length; i++) {
      const b = refBricks[i];
      parts.push(dimLine(absX(b), absX(b) + b.w, rowY1, String(rn(b.w)), '#333333', 4, 6));
      if (i < refBricks.length - 1) {
        const gap = refBricks[i + 1].x - (b.x + b.w);
        if (gap > 0.5) parts.push(dimLine(absX(b) + b.w, absX(refBricks[i + 1]), rowY1, String(rn(gap)), '#333333', 4, 6));
      }
    }
    const lastB = refBricks[refBricks.length - 1];
    const rightMargin = moldW - frame - lastB.x - lastB.w;
    parts.push(dimLine(absX(lastB) + lastB.w, ox + moldW, rowY1, String(rn(rightMargin)), '#333333', 4, 6));
  }

  // DIM ROW 2 — Centre-to-centre modules (orange, with + ticks)
  const rowY2 = dimBase + dimRowH * 2.7;
  const COL_ORANGE = '#f59e0b';
  if (refBricks.length) {
    const cx = b => ox + frame + b.x + b.w / 2;
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
    { color: '#111111',   label: 'Overige' },
    { color: '#dc2626',   label: 'Laatste steenstrips' },
  ];
  legItems.forEach(({ color, label }, i) => {
    const lx  = r2(Number(legX) + legPad);
    const ly  = r2(Number(legY) + 24 + i * 15);
    parts.push(`<rect x="${lx}" y="${r2(Number(ly) - 7)}" width="16" height="8" fill="${color}"/>`);
    parts.push(`<text x="${r2(Number(lx) + 20)}" y="${ly}" font-size="7" fill="#1e293b">${label}</text>`);
  });

  // ── Small title in mold ──
  parts.push(`<text x="${r2(ox + frame + 2)}" y="${r2(oy + 9)}" font-size="6" fill="#64748b">MAL-${moldId} | ${verband} | ${moldW}×${moldH}mm | ${rowsPerMold} rijen | Staal 2mm</text>`);

  parts.push('</svg>');
  return parts.join('\n');
}

export function generateMoldPrintHTML(mat, verband, moldDims, moldId = 'A') {
  const svg = generateMoldSVG(mat, verband, moldDims, moldId);
  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<title>MAL-${moldId} | ${verband}</title>
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
 *   id          : 'A' | 'B' | … (label for the physical mold)
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

  const moldW = moldDims?.lengte  ?? 3400;
  const moldH = moldDims?.hoogte  ?? 270;
  const frame = 15;
  const innerH = moldH - 2 * frame;
  const rowsPerMold = Math.min(3, Math.max(1, Math.floor(innerH / lagenmaat)));

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
  const MOLD_IDS = ['A', 'B', 'C', 'D'];

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
    frame,
    templates,
  };
}
