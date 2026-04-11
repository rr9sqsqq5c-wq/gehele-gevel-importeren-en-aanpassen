function round2(v) {
  return Math.round(v * 100) / 100;
}

export function buildFacadeZones(facadeWidth, facadeHeight, openings) {
  if (!openings.length) {
    return [{ id: 'Z1', kind: 'algemeen', x: 0, y: 0, width: facadeWidth, height: facadeHeight }];
  }

  const sorted = [...openings].sort((a, b) => a.y - b.y || a.x - b.x);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const zones = [];

  if (first.y > 1) {
    zones.push({ id: `Z${zones.length + 1}`, kind: 'onder', x: 0, y: 0, width: facadeWidth, height: first.y });
  }

  sorted.forEach((o) => {
    if (o.x > 1) {
      zones.push({ id: `Z${zones.length + 1}`, kind: 'links', openingId: o.id, x: 0, y: o.y, width: o.x, height: o.height });
    }
    if (o.x + o.width < facadeWidth - 1) {
      zones.push({ id: `Z${zones.length + 1}`, kind: 'rechts', openingId: o.id, x: o.x + o.width, y: o.y, width: facadeWidth - (o.x + o.width), height: o.height });
    }
  });

  const topStart = last.y + last.height;
  if (topStart < facadeHeight - 1) {
    zones.push({ id: `Z${zones.length + 1}`, kind: 'boven', x: 0, y: topStart, width: facadeWidth, height: facadeHeight - topStart });
  }

  return zones.filter((z) => z.width > 0 && z.height > 0);
}

function collectVerticalCandidates(zone, globalPieces) {
  const xs = new Set([round2(zone.x), round2(zone.x + zone.width)]);
  for (const p of globalPieces) {
    const x1 = round2(p.x);
    const x2 = round2(p.x + p.width);
    if (x1 >= zone.x && x1 <= zone.x + zone.width) xs.add(x1);
    if (x2 >= zone.x && x2 <= zone.x + zone.width) xs.add(x2);
  }
  return [...xs].sort((a, b) => a - b);
}

function collectHorizontalCandidates(zone, globalRows, steenH) {
  const ys = new Set([round2(zone.y), round2(zone.y + zone.height)]);
  for (const row of globalRows) {
    const y1 = round2(row.y);
    const y2 = round2(row.y + steenH);
    if (y1 >= zone.y && y1 <= zone.y + zone.height) ys.add(y1);
    if (y2 >= zone.y && y2 <= zone.y + zone.height) ys.add(y2);
  }
  return [...ys].sort((a, b) => a - b);
}

function chooseBreaks(start, end, candidates, maxSpan, targetSpan) {
  const valid = candidates.filter((c) => c >= start && c <= end).sort((a, b) => a - b);
  const breaks = [start];
  let current = start;

  while (current < end - 0.001) {
    const options = valid.filter((v) => v > current && v - current <= maxSpan + 0.001);
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

export function panelizeZone(zone, globalRows, globalPieces, steenH, basePanel) {
  const bpW = basePanel.width;
  const bpH = basePanel.height;
  const targetLong = Math.round(bpW / 3);
  const targetShort = bpH;

  const xCandidates = collectVerticalCandidates(zone, globalPieces);
  const yCandidates = collectHorizontalCandidates(zone, globalRows, steenH);

  const fitsLandscape = zone.width <= bpW && zone.height <= bpH;
  const fitsPortrait = zone.width <= bpH && zone.height <= bpW;

  if (fitsLandscape || fitsPortrait) {
    const orientation = fitsLandscape ? 'liggend' : 'staand';
    const single = { id: `${zone.id}-P1`, zoneId: zone.id, row: 1, col: 1, x: zone.x, y: zone.y, width: zone.width, height: zone.height, area: round2(zone.width * zone.height), orientation };
    return { ok: true, orientation, panelCount: 1, panels: [single] };
  }

  const variants = [
    {
      orientation: 'liggend',
      xBreaks: chooseBreaks(zone.x, zone.x + zone.width, xCandidates, bpW, targetLong),
      yBreaks: chooseBreaks(zone.y, zone.y + zone.height, yCandidates, bpH, targetShort),
    },
    {
      orientation: 'staand',
      xBreaks: chooseBreaks(zone.x, zone.x + zone.width, xCandidates, bpH, targetShort),
      yBreaks: chooseBreaks(zone.y, zone.y + zone.height, yCandidates, bpW, targetLong),
    },
  ];

  let best = null;
  for (const variant of variants) {
    const panels = buildPanelsFromBreaks(zone, variant.xBreaks, variant.yBreaks, variant.orientation);
    if (!panels.length) continue;
    const uniqueCount = new Set(panels.map((p) => `${p.width}x${p.height}`)).size;
    const avgArea = panels.reduce((s, p) => s + p.area, 0) / panels.length;
    const score = panels.length * 100000 + uniqueCount * 10000 + Math.abs(avgArea - bpW * bpH);
    if (!best || score < best.score) best = { ...variant, panels, score };
  }

  if (!best) return { ok: false, panels: [] };
  return { ok: true, orientation: best.orientation, panelCount: best.panels.length, panels: best.panels };
}

export function panelizeFacade(facadeWidth, facadeHeight, openings, globalRows, globalPieces, steenH, basePanel) {
  const zones = buildFacadeZones(facadeWidth, facadeHeight, openings);
  const result = [];
  for (const zone of zones) {
    const panelization = panelizeZone(zone, globalRows, globalPieces, steenH, basePanel);
    result.push({ zone, panelization });
  }
  return result;
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
