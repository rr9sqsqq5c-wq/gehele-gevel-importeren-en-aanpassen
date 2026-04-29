import { useMemo, useRef, useState } from 'react';
import { buildFullGroupFacadePattern, buildFacePattern, buildMirroredFacePattern } from './lib/pattern.js';
import { buildFacadeZones, panelizeZone, computeEffectiveBasePanel, generateBattenPositions, getMoldTemplates, generateMoldSVG, generateCombinedMoldSVG, clipPanelToFacadePolys } from './lib/panelization.js';
import { polyXRangesAtY, openingXRangesAtY, brickColor } from './lib/geometry.js';

function generatePaneelId(entity, projectNr, level, stramienStart, stramienEnd, seqNr, panelType) {
  const e  = ((entity ?? 'P') + '').slice(0, 1).toUpperCase();
  const p  = ((projectNr ?? '00000') + '').replace(/[^0-9A-Z]/gi, '').toUpperCase().slice(0, 5).padStart(5, '0');
  const l  = String(Math.max(0, Math.floor(Number(level ?? 0)))).padStart(2, '0').slice(0, 2);
  const ss = ((stramienStart ?? '--') + '').toUpperCase().slice(0, 2).padStart(2, '-');
  const se = ((stramienEnd   ?? '--') + '').toUpperCase().slice(0, 2).padStart(2, '-');
  const n  = String(Math.max(1, Number(seqNr ?? 1))).padStart(3, '0').slice(0, 3);
  const t  = ((panelType ?? 'V') + '').slice(0, 1).toUpperCase();
  return `${e}${p}${l}${ss}${se}${n}${t}`;
}

function formatEpcDisplay(epcCode) {
  if (!epcCode || epcCode.length !== 16) return epcCode;
  return `${epcCode[0]}-${epcCode.slice(1,6)}-${epcCode.slice(6,8)}-${epcCode.slice(8,10)}-${epcCode.slice(10,12)}-${epcCode.slice(12,15)}-${epcCode[15]}`;
}

function computeZoneBounds(penanten, groupWidth) {
  const sorted = [...(penanten ?? [])].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
  if (!sorted.length) return [{ idx: 0, label: 'Zone 1', xStart: 0, xEnd: groupWidth }];
  const xBounds = [0];
  for (const p of sorted) {
    xBounds.push(p.x ?? 0);
    xBounds.push((p.x ?? 0) + (p.breedte ?? 400));
  }
  xBounds.push(groupWidth);
  const zones = [];
  for (let i = 0; i < xBounds.length - 1; i += 2) {
    const xS = xBounds[i], xE = xBounds[i + 1];
    if (xE - xS > 1) zones.push({ idx: zones.length, label: `Zone ${zones.length + 1}`, xStart: xS, xEnd: xE });
  }
  return zones;
}

function getPanelStripsAnnotated(panel, facadeRows, verband, mat) {
  const stripH = verband === 'staand_tegelverband' ? mat.steenL : mat.steenH;
  const strips = [];
  const counts = {};
  for (const row of facadeRows) {
    if (row.y + stripH <= panel.y + 0.5 || row.y >= panel.y + panel.height - 0.5) continue;
    for (const piece of row.pieces) {
      if (piece.start + piece.length <= panel.x + 0.5 || piece.start >= panel.x + panel.width - 0.5) continue;
      const clipX  = Math.max(piece.start, panel.x) - panel.x;
      const clipX2 = Math.min(piece.start + piece.length, panel.x + panel.width) - panel.x;
      const clipY  = Math.max(row.y, panel.y) - panel.y;
      const clipY2 = Math.min(row.y + stripH, panel.y + panel.height) - panel.y;
      if (clipX2 - clipX > 0.5 && clipY2 - clipY > 0.5) {
        const len = Math.round(clipX2 - clipX);
        const label = piece.label;
        strips.push({ x: clipX, y: clipY, width: clipX2 - clipX, height: clipY2 - clipY, label });
        const key = `${label}:${len}`;
        counts[key] = (counts[key] ?? { label, len, n: 0 });
        counts[key].n++;
      }
    }
  }
  return { strips, counts: Object.values(counts).sort((a, b) => b.n - a.n || a.len - b.len) };
}

const PAD_LEFT   = 145;
const PAD_RIGHT  = 60;
const PAD_TOP    = 60;
const PAD_BOTTOM = 70;
const DIM_GAP    = 28;
const ARROW_SIZE = 4;
const FONT_DIM   = 9;
const FONT_LBL   = 8;

function mm(v) { return Math.round(v); }
function m(v)  { return (v / 1000).toFixed(3); }

function getStripsForPanel(panel, facadeRows, verband, mat) {
  const stripH = verband === 'staand_tegelverband' ? mat.steenL : mat.steenH;
  const strips = [];
  for (const row of facadeRows) {
    if (row.y + stripH <= panel.y + 0.5 || row.y >= panel.y + panel.height - 0.5) continue;
    for (const piece of row.pieces) {
      if (piece.start + piece.length <= panel.x + 0.5 || piece.start >= panel.x + panel.width - 0.5) continue;
      const clipX  = Math.max(piece.start, panel.x) - panel.x;
      const clipX2 = Math.min(piece.start + piece.length, panel.x + panel.width) - panel.x;
      const clipY  = Math.max(row.y, panel.y) - panel.y;
      const clipY2 = Math.min(row.y + stripH, panel.y + panel.height) - panel.y;
      if (clipX2 - clipX > 0.5 && clipY2 - clipY > 0.5) {
        strips.push({ x: clipX, y: clipY, width: clipX2 - clipX, height: clipY2 - clipY, label: piece.label });
      }
    }
  }
  return strips;
}

function arrowHead(x1, y1, x2, y2, size = ARROW_SIZE) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;
  return `M${x2},${y2} L${x2 - ux * size + px * size * 0.4},${y2 - uy * size + py * size * 0.4} L${x2 - ux * size - px * size * 0.4},${y2 - uy * size - py * size * 0.4} Z`;
}

function DimH({ x1, x2, y, label, color = '#1e3a5f', flip = false }) {
  const mid = (x1 + x2) / 2;
  const offset = flip ? 10 : -10;
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={color} strokeWidth={0.6} />
      <path d={arrowHead(x2, y, x1, y)} fill={color} />
      <path d={arrowHead(x1, y, x2, y)} fill={color} />
      <line x1={x1} y1={y - 12} x2={x1} y2={y + 4} stroke={color} strokeWidth={0.4} strokeDasharray="2,2" />
      <line x1={x2} y1={y - 12} x2={x2} y2={y + 4} stroke={color} strokeWidth={0.4} strokeDasharray="2,2" />
      <text x={mid} y={y + offset} textAnchor="middle" fontSize={FONT_DIM} fill={color} fontFamily="Arial, sans-serif">{label}</text>
    </g>
  );
}

function DimV({ x, y1, y2, label, color = '#1e3a5f', side = 'left' }) {
  const mid = (y1 + y2) / 2;
  const textX = side === 'left' ? x - 5 : x + 5;
  const anchor = side === 'left' ? 'end' : 'start';
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={color} strokeWidth={0.6} />
      <path d={arrowHead(x, y2, x, y1)} fill={color} />
      <path d={arrowHead(x, y1, x, y2)} fill={color} />
      <line x1={x - 10} y1={y1} x2={x + 4} y2={y1} stroke={color} strokeWidth={0.4} strokeDasharray="2,2" />
      <line x1={x - 10} y1={y2} x2={x + 4} y2={y2} stroke={color} strokeWidth={0.4} strokeDasharray="2,2" />
      <text x={textX} y={mid} textAnchor={anchor} dominantBaseline="middle" fontSize={FONT_DIM} fill={color} fontFamily="Arial, sans-serif" transform={`rotate(-90,${textX},${mid})`}>{label}</text>
    </g>
  );
}

function computeLatten(facadeData, panelen, latten, mat, penanten) {
  if (!facadeData || !latten?.enabled) return [];
  const { rows, groupWidth, groupHeight, groupOpenings } = facadeData;
  const richting = latten.richting ?? 'horizontaal';
  const latBreedte = Math.max(5, latten.breedte ?? 50);
  const MAX_HOC = latten.maxInterval ?? 400;

  const PENANT_PANEL_INSET = 20;
  let allPanels = [];
  if (panelen?.enabled) {
    const basePanel = computeEffectiveBasePanel(panelen, mat.brickWeightM2 ?? 40, mat);
    const battenYs = generateBattenPositions(groupHeight, mat, MAX_HOC, { minHOH: latten?.minHOH, maxHOH: latten?.maxHOH, targetPanelH: panelen?.hoogte, minPanelH: 800 });
    const openingsForZones = groupOpenings.map((op) => ({ id: `op_${op.x}_${op.y}`, x: op.x, y: op.y, width: op.width, height: op.height, polyPts: op.polyPts ?? null }));
    const penantOpenings = (penanten ?? []).map((p, i) => {
      const px = (p.x ?? 0) + PENANT_PANEL_INSET;
      const pw = Math.max(1, p.breedte ?? 400) - 2 * PENANT_PANEL_INSET;
      if (pw <= 0) return null;
      return { id: `pen_${i}`, x: px, y: 0, width: pw, height: groupHeight, polyPts: null };
    }).filter(Boolean);
    const zones = buildFacadeZones(groupWidth, groupHeight, [...openingsForZones, ...penantOpenings]);
    for (const zone of zones) {
      const res = panelizeZone(zone, battenYs, basePanel);
      if (res.ok) allPanels.push(...res.panels);
    }
  }

  if (richting === 'horizontaal') {
    const openingBottomYs = new Set(groupOpenings.map((op) => Math.round(op.y)));
    const openingTopYs    = new Set(groupOpenings.map((op) => Math.round(op.y + op.height)));
    const gH = Math.round(groupHeight);

    const clampY = (y) => Math.min(gH, Math.max(0, y));
    const boundaryYs = new Set([0, gH]);
    for (const panel of allPanels) {
      boundaryYs.add(clampY(Math.round(panel.y)));
      boundaryYs.add(clampY(Math.round(panel.y + panel.height)));
    }
    for (const op of groupOpenings) {
      boundaryYs.add(clampY(Math.round(op.y)));
      boundaryYs.add(clampY(Math.round(op.y + op.height)));
    }

    const sortedBoundaries = [...boundaryYs].sort((a, b) => a - b);
    const allYs = new Set(sortedBoundaries);
    for (let i = 0; i < sortedBoundaries.length - 1; i++) {
      const yA = sortedBoundaries[i], yB = sortedBoundaries[i + 1];
      const span = yB - yA;
      if (span > MAX_HOC) {
        const steps = Math.ceil(span / MAX_HOC);
        for (let s = 1; s < steps; s++) allYs.add(Math.round(yA + (span / steps) * s));
      }
    }

    const INSET = 5;
    const result = [];
    let globalIdx = 0;
    for (const yr of [...allYs].filter(y => y >= 0 && y <= gH).sort((a, b) => a - b)) {
      let latY;
      if (yr === 0) latY = 0;
      else if (yr === gH) latY = yr - latBreedte;
      else if (openingBottomYs.has(yr)) latY = yr - latBreedte;
      else if (openingTopYs.has(yr)) latY = yr;
      else latY = yr - latBreedte / 2;
      const isForced = openingBottomYs.has(yr) || openingTopYs.has(yr) || yr === 0 || yr === gH;
      const latTop = latY, latBot = latY + latBreedte;
      const openingsAtY = groupOpenings.filter((op) => op.y < latBot && op.y + op.height > latTop);
      let zones = [];
      if (openingsAtY.length === 0) {
        zones.push({ x1: 0, x2: groupWidth });
      } else {
        const opRanges = openingsAtY.flatMap((op) => openingXRangesAtY(op, latTop, latBot)).sort((a, b) => a.x1 - b.x1);
        let cursor = 0;
        for (const op of opRanges) {
          if (op.x1 > cursor) zones.push({ x1: cursor, x2: op.x1 });
          cursor = Math.max(cursor, op.x2);
        }
        if (cursor < groupWidth) zones.push({ x1: cursor, x2: groupWidth });
      }
      for (const zone of zones) {
        let x1 = zone.x1, x2 = zone.x2;
        if (allPanels.length > 0) {
          const panelsInZone = allPanels.filter((p) => p.y < latBot && p.y + p.height > latTop && p.x + p.width > zone.x1 && p.x < zone.x2);
          if (panelsInZone.length > 0) {
            x1 = Math.min(...panelsInZone.map((p) => p.x)) + INSET;
            x2 = Math.max(...panelsInZone.map((p) => p.x + p.width)) - INSET;
          }
        }
        if (x2 <= x1) continue;
        result.push({ id: `lat-h-${globalIdx++}`, richting: 'horizontaal', x: x1, y: latY, width: x2 - x1, height: latBreedte, forced: isForced });
      }
    }
    return result;
  } else {
    const xPositions = new Set([0, groupWidth]);
    for (const p of allPanels) { xPositions.add(Math.round(p.x)); xPositions.add(Math.round(p.x + p.width / 2)); xPositions.add(Math.round(p.x + p.width)); }
    return [...xPositions].sort((a, b) => a - b).map((x, idx) => {
      const lx1 = x - latBreedte / 2;
      const pen = (penanten ?? []).find((p) => {
        const px1 = p.x ?? 0;
        const px2 = px1 + Math.max(1, p.breedte ?? 400);
        return lx1 + latBreedte > px1 + 5 && lx1 < px2 - 5;
      });
      const latH = pen ? Math.max(1, pen.hoogte ?? 2000) : groupHeight;
      return { id: `lat-v-${idx}`, richting: 'verticaal', x: lx1, y: 0, width: latBreedte, height: latH, forced: false };
    });
  }
}

export function Werktekening({ walls, groupSettings, groupName, zetwerk, panelen, latten, groupMinH, penantFaceData, zoneSettings, epcSettings }) {
  const svgRef = useRef(null);
  const summarySvgRef = useRef(null);
  const productiePrintRef = useRef(null);
  const [drawingType, setDrawingType] = useState('achterconstructie');
  const [productieGenerated, setProductieGenerated] = useState(false);
  const [selectedZoneIdx, setSelectedZoneIdx] = useState(-1);
  const [tekenZone, setTekenZone] = useState({ enabled: false, x: 0, y: 0, width: null, height: null });

  const mat     = groupSettings?.material ?? { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
  const verband = groupSettings?.verband ?? 'halfsteens';
  const maxH    = groupSettings?.maxHoogte ?? null;
  const minH    = groupSettings?.minHoogte ?? null;

  const epcProjectNr = epcSettings?.projectNummer ?? groupSettings?.epcProjectNummer ?? '00000';
  const epcLevel     = epcSettings?.level ?? groupSettings?.epcLevel ?? 0;

  function makeEpcId(zone, seqNr, panelType) {
    const zoneStr = (zone.label ?? 'Z1').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const ss = zoneStr.slice(0, 2).padStart(2, '-');
    const se = zoneStr.slice(2, 4).padStart(2, '-');
    return generatePaneelId('P', epcProjectNr, epcLevel, ss, se, seqNr, panelType ?? 'V');
  }

  const facadeData = useMemo(() => {
    if (!walls?.length) return null;
    return buildFullGroupFacadePattern(walls, mat, verband, maxH, zetwerk, minH);
  }, [walls, mat, verband, maxH, minH, zetwerk]);

  const allPanels = useMemo(() => {
    if (!facadeData || !panelen?.enabled) return [];
    const { groupWidth, groupHeight, groupOpenings } = facadeData;
    const basePanel = computeEffectiveBasePanel(panelen, mat.brickWeightM2 ?? 40, mat);
    const maxInterval = latten?.maxInterval ?? 400;
    const battenYs = generateBattenPositions(groupHeight, mat, maxInterval, { minHOH: latten?.minHOH, maxHOH: latten?.maxHOH, targetPanelH: panelen?.hoogte, minPanelH: 800 });
    const openingsForZones = groupOpenings.map((op) => ({ id: `op_${op.x}_${op.y}`, x: op.x, y: op.y, width: op.width, height: op.height, polyPts: op.polyPts ?? null }));
    const INSET = 20;
    const penantOpenings = (groupSettings?.penanten ?? []).map((p, i) => {
      const px = (p.x ?? 0) + INSET;
      const pw = Math.max(1, p.breedte ?? 400) - 2 * INSET;
      if (pw <= 0) return null;
      return { id: `pen_${i}`, x: px, y: 0, width: pw, height: groupHeight, polyPts: null };
    }).filter(Boolean);
    const zones = buildFacadeZones(groupWidth, groupHeight, [...openingsForZones, ...penantOpenings]);
    const panels = [];
    for (const zone of zones) {
      const res = panelizeZone(zone, battenYs, basePanel);
      if (res.ok) panels.push(...res.panels);
    }
    return panels;
  }, [facadeData, panelen, mat, groupSettings, latten]);

  const penanten = groupSettings?.penanten ?? [];
  const allLatten = useMemo(() => computeLatten(facadeData, panelen, latten, mat, penanten), [facadeData, panelen, latten, mat, penanten]);

  const wallGroupPolysRaw = useMemo(() => {
    if (!walls?.length) return [];
    const minL = Math.min(...walls.map(w => w.wallOrigin?.lengthStart ?? 0));
    const minH0 = Math.min(...walls.map(w => w.wallOrigin?.heightStart ?? 0));
    return walls.map(w => {
      if (!w.facadePoly || w.facadePoly.length < 3) return null;
      const offL = (w.wallOrigin?.lengthStart ?? 0) - minL;
      const offH = (w.wallOrigin?.heightStart ?? 0) - minH0;
      return w.facadePoly.map(pt => ({ l: pt.l + offL, h: pt.h + offH }));
    }).filter(Boolean);
  }, [walls]);

  const clippedPanels = useMemo(() => {
    if (!wallGroupPolysRaw.length) return null;
    return allPanels.map(p => clipPanelToFacadePolys(p, wallGroupPolysRaw)).filter(Boolean);
  }, [allPanels, wallGroupPolysRaw]);

  if (!facadeData) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 13 }}>
        Geen gegevens beschikbaar voor werktekening
      </div>
    );
  }

  const { groupWidth, groupHeight, groupOpenings } = facadeData;

  const facadeZones = computeZoneBounds(penanten, groupWidth);
  const selectedZone = selectedZoneIdx >= 0 && selectedZoneIdx < facadeZones.length ? facadeZones[selectedZoneIdx] : null;

  const tzX = tekenZone.enabled ? (tekenZone.x ?? 0) : null;
  const tzW = tekenZone.enabled ? (tekenZone.width ?? groupWidth) : null;
  const tzY = tekenZone.enabled ? (tekenZone.y ?? 0) : null;
  const tzH = tekenZone.enabled ? (tekenZone.height ?? groupHeight) : null;

  const viewXStart = tzX != null ? tzX : (selectedZone ? selectedZone.xStart : 0);
  const viewXEnd   = tzX != null ? tzX + tzW : (selectedZone ? selectedZone.xEnd : groupWidth);
  const viewYStart = tzY != null ? tzY : 0;
  const viewYEnd   = tzY != null ? tzY + tzH : groupHeight;
  const viewW_mm   = Math.max(1, viewXEnd - viewXStart);
  const viewH_mm   = Math.max(1, viewYEnd - viewYStart);

  const activeZoneLabel = tekenZone.enabled ? 'Teken zone' : selectedZone?.label ?? null;

  const effectivePanels = clippedPanels ?? allPanels;
  const zonePanels = effectivePanels.filter((p) =>
    p.x + p.width > viewXStart + 1 && p.x < viewXEnd - 1 &&
    p.y + p.height > viewYStart + 1 && p.y < viewYEnd - 1
  );
  const zoneLatten = allLatten.filter((l) =>
    l.x + l.width > viewXStart + 1 && l.x < viewXEnd - 1 &&
    l.y + l.height > viewYStart + 1 && l.y < viewYEnd - 1
  );
  const zoneOpenings = groupOpenings.filter((op) => {
    const x1 = op.polyPts?.length >= 3 ? Math.min(...op.polyPts.map((p) => p.l)) : op.x;
    const x2 = op.polyPts?.length >= 3 ? Math.max(...op.polyPts.map((p) => p.l)) : op.x + op.width;
    const y1 = op.polyPts?.length >= 3 ? Math.min(...op.polyPts.map((p) => p.h)) : op.y;
    const y2 = op.polyPts?.length >= 3 ? Math.max(...op.polyPts.map((p) => p.h)) : op.y + op.height;
    return x2 > viewXStart + 1 && x1 < viewXEnd - 1 && y2 > viewYStart + 1 && y1 < viewYEnd - 1;
  });

  const VIEW_W = 960;
  const drawW = VIEW_W - PAD_LEFT - PAD_RIGHT;
  const MAX_DRAW_H = 1400;
  const scale  = Math.min(drawW / viewW_mm, MAX_DRAW_H / viewH_mm);

  const W = viewW_mm * scale;
  const H = viewH_mm * scale;
  const VIEW_H = PAD_TOP + Math.ceil(H) + PAD_BOTTOM;
  const OX = PAD_LEFT + (drawW - W) / 2;
  const OY = PAD_TOP;

  const sx = (x) => OX + (x - viewXStart) * scale;
  const sy = (y) => OY + H - (y - viewYStart) * scale;

  const dimColor    = '#1e3a5f';
  const panelColor  = '#bfdbfe';
  const latColor    = '#fde68a';
  const openColor   = '#fca5a5';

  const hasWallPolys = wallGroupPolysRaw.length > 0;

  const facadeShapePath = hasWallPolys
    ? wallGroupPolysRaw.map(poly =>
        poly.map((pt, i) => `${i === 0 ? 'M' : 'L'}${sx(pt.l)},${sy(pt.h)}`).join(' ') + ' Z'
      ).join(' ')
    : `M${OX},${OY} h${W} v${H} h${-W} Z`;

  const peilmatenBase = groupMinH ?? 0;

  const xBreaks = [...new Set([viewXStart, viewXEnd, ...zonePanels.map((p) => p.x), ...zonePanels.map((p) => p.x + p.width)])].filter((x) => x >= viewXStart - 1 && x <= viewXEnd + 1).sort((a, b) => a - b);
  const yBreaks = [...new Set([viewYStart, viewYEnd, ...zonePanels.map((p) => p.y), ...zonePanels.map((p) => p.y + p.height)])].filter((y) => y >= viewYStart - 1 && y <= viewYEnd + 1).sort((a, b) => a - b);
  const latYs   = [...new Set(zoneLatten.filter((l) => l.richting === 'horizontaal').map((l) => Math.round(l.y + l.height)))].sort((a, b) => a - b);

  const dimRowY   = OY + H + 28;
  const dimRow2Y  = dimRowY + DIM_GAP;
  const peilLineX  = OX - 110;
  const dimVSpanX  = OX - 65;
  const dimVTotalX = OX - 32;

  const lattenRichting = zoneLatten.length ? (zoneLatten[0].richting ?? 'horizontaal') : 'horizontaal';
  const lattenSummary = (() => {
    const groups = {};
    for (const l of zoneLatten) {
      const len = Math.round(lattenRichting === 'horizontaal' ? l.width : l.height);
      groups[len] = (groups[len] ?? 0) + 1;
    }
    return Object.entries(groups)
      .sort((a, b) => b[1] - a[1])
      .map(([len, cnt]) => ({ len: Number(len), cnt }));
  })();
  const summaryLines = zoneLatten.length ? lattenSummary.length + 2 : 0;
  const SUMMARY_LINE_H = 13;
  const SUMMARY_PAD = 8;
  const summaryBoxH = summaryLines > 0 ? summaryLines * SUMMARY_LINE_H + SUMMARY_PAD * 2 : 0;
  const LEGEND_H = 28;

  const svgTotal = VIEW_H + 16 + LEGEND_H;

  function exportSvg() {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const xml = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([xml], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `werktekening_${(groupName ?? 'groep').replace(/\s/g, '_')}.svg`; a.click();
    URL.revokeObjectURL(url);
  }

  function exportPrint() {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const xml = new XMLSerializer().serializeToString(svgEl);
    const summaryEl = summarySvgRef.current;
    const summaryXml = summaryEl ? new XMLSerializer().serializeToString(summaryEl) : '';
    const page2 = summaryXml ? `<div style="page-break-before:always;padding-top:16px">${summaryXml}</div>` : '';
    const w = window.open('', '_blank');
    if (!w) {
      alert('Sta pop-ups toe voor deze pagina om af te drukken.');
      return;
    }
    w.document.write(`<!DOCTYPE html><html><head><title>Werktekening ${groupName}</title><style>body{margin:0;padding:16px;background:#fff} svg{max-width:100%;height:auto} @media print{body{padding:0}}</style></head><body>${xml}${page2}<script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  }

  function exportPrintProductie() {
    const container = productiePrintRef.current;
    if (!container) return;
    const svgs = container.querySelectorAll('svg');
    if (!svgs.length) return;
    const svgXmls = Array.from(svgs).map((s) => new XMLSerializer().serializeToString(s)).join('<br style="page-break-after:always">');
    const w = window.open('', '_blank');
    if (!w) {
      alert('Sta pop-ups toe voor deze pagina om af te drukken.');
      return;
    }
    w.document.write(`<!DOCTYPE html><html><head><title>Paneeltekeningen ${groupName}</title><style>body{margin:0;padding:12px;background:#fff;display:flex;flex-wrap:wrap;gap:12px} svg{border:1px solid #ccc;border-radius:4px;page-break-inside:avoid} @media print{body{padding:4px}}</style></head><body>${svgXmls}<script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  }

  function exportZaaglijst() {
    const brickW2 = mat?.brickWeightM2 ?? 40;
    const rows = [];
    let globalSeq = 1;
    const zonesForExport = facadeZones;
    for (const zone of zonesForExport) {
      const panelsInZone = allPanels.filter((p) => p.x + p.width > zone.xStart + 1 && p.x < zone.xEnd - 1);
      for (const panel of panelsInZone) {
        const paneelId = makeEpcId(zone, globalSeq++);
        const { counts } = getPanelStripsAnnotated(panel, facadeData.rows, verband, mat);
        const areaM2 = (panel.width * panel.height) / 1e6;
        const gewichtKg = Math.round(areaM2 * brickW2 * 10) / 10;
        const countMap = {};
        for (const c of counts) countMap[c.label + '_' + c.len] = c.n;
        const volCount      = counts.filter(c => c.label === 'Vol').reduce((s, c) => s + c.n, 0);
        const kopCount      = counts.filter(c => c.label === 'Kop').reduce((s, c) => s + c.n, 0);
        const drieKwartCount = counts.filter(c => c.label === 'Driekwart').reduce((s, c) => s + c.n, 0);
        const halveCount    = counts.filter(c => c.label === 'Halve').reduce((s, c) => s + c.n, 0);
        const restCount     = counts.filter(c => c.label === 'Rest').reduce((s, c) => s + c.n, 0);
        const totalStrips   = counts.reduce((s, c) => s + c.n, 0);
        rows.push({
          PaneelID_EPC: paneelId,
          PaneelID_Leesbaar: formatEpcDisplay(paneelId),
          Projectnummer: epcProjectNr,
          Level: String(epcLevel).padStart(2, '0'),
          Zone: zone.label,
          X_mm: Math.round(panel.x),
          Y_mm: Math.round(panel.y),
          Breedte_mm: Math.round(panel.width),
          Hoogte_mm: Math.round(panel.height),
          Oppervlak_m2: areaM2.toFixed(3),
          Gewicht_kg: gewichtKg,
          Verband: verband,
          Strips_Totaal: totalStrips,
          Strips_Vol: volCount,
          Strips_Kop: kopCount,
          Strips_Driekwart: drieKwartCount,
          Strips_Halve: halveCount,
          Strips_Rest: restCount,
        });
      }
    }
    if (!rows.length) { alert('Geen panelen beschikbaar voor export.'); return; }
    const headers = Object.keys(rows[0]);
    const csvLines = [headers.join(';'), ...rows.map(r => headers.map(h => String(r[h] ?? '')).join(';'))];
    const blob = new Blob([csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zaaglijst_${(groupName ?? 'groep').replace(/\s/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#f1f5f9' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: '#fff', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#1e3a5f', flex: 1 }}>
          Werktekening — {groupName ?? 'Groep'}
        </span>
        {drawingType === 'zaaglijst' ? (
          <button onClick={exportZaaglijst} style={{ fontSize: 11, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>⬇ Export CSV</button>
        ) : drawingType === 'productie' ? (productieGenerated && (
          <button onClick={exportPrintProductie} style={{ fontSize: 11, background: '#0f172a', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>🖨 Afdrukken panelen</button>
        )) : drawingType === 'penanten' ? (
          <button onClick={() => {
            const container = document.getElementById('penanten-print-container');
            if (!container) return;
            const svgs = container.querySelectorAll('svg');
            if (!svgs.length) return;
            const xmls = Array.from(svgs).map((s) => new XMLSerializer().serializeToString(s)).join('<div style="page-break-after:always"></div>');
            const w = window.open('', '_blank');
            if (!w) { alert('Sta pop-ups toe voor deze pagina.'); return; }
            w.document.write(`<!DOCTYPE html><html><head><title>Penanten ${groupName}</title><style>body{margin:0;padding:12px;background:#fff} svg{max-width:100%;height:auto;display:block;margin-bottom:16px} @media print{body{padding:4px}}</style></head><body>${xmls}<script>window.onload=()=>window.print()<\/script></body></html>`);
            w.document.close();
          }} style={{ fontSize: 11, background: '#0f172a', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>🖨 Afdrukken penanten</button>
        ) : <>
          <button onClick={exportSvg} style={{ fontSize: 11, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>⬇ SVG</button>
          <button onClick={exportPrint} style={{ fontSize: 11, background: '#0f172a', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>🖨 Afdrukken</button>
        </>}
      </div>

      <div style={{ display: 'flex', gap: 0, background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
        {[
          { key: 'achterconstructie', label: '1. Achterconstructie' },
          { key: 'plaatsing',         label: '2. Panelen plaatsing' },
          { key: 'productie',         label: '3. Paneel productie' },
          ...((groupSettings?.penanten ?? []).length > 0 ? [{ key: 'penanten', label: '4. Penanten' }] : []),
          { key: 'zaaglijst',         label: '5. Zaaglijst' },
          { key: 'maltekening',       label: '6. Maltekening' },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setDrawingType(key)} style={{
            padding: '6px 14px', fontSize: 11, fontWeight: drawingType === key ? 700 : 400,
            background: drawingType === key ? '#fff' : 'transparent',
            border: 'none', borderBottom: drawingType === key ? '2px solid #2563eb' : '2px solid transparent',
            color: drawingType === key ? '#2563eb' : '#64748b', cursor: 'pointer',
          }}>{label}</button>
        ))}
      </div>

      {facadeZones.length > 1 && !tekenZone.enabled && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', flexShrink: 0, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 4 }}>Zone:</span>
          <button
            onClick={() => setSelectedZoneIdx(-1)}
            style={{ padding: '2px 10px', fontSize: 10, fontWeight: selectedZoneIdx === -1 ? 700 : 400, background: selectedZoneIdx === -1 ? '#2563eb' : '#e2e8f0', color: selectedZoneIdx === -1 ? '#fff' : '#475569', border: 'none', borderRadius: 3, cursor: 'pointer' }}
          >Alle zones</button>
          {facadeZones.map((z) => (
            <button key={z.idx} onClick={() => setSelectedZoneIdx(z.idx)}
              style={{ padding: '2px 10px', fontSize: 10, fontWeight: selectedZoneIdx === z.idx ? 700 : 400, background: selectedZoneIdx === z.idx ? '#2563eb' : '#e2e8f0', color: selectedZoneIdx === z.idx ? '#fff' : '#475569', border: 'none', borderRadius: 3, cursor: 'pointer' }}
            >{z.label} ({mm(z.xEnd - z.xStart)} mm)</button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', background: tekenZone.enabled ? '#fefce8' : '#f8fafc', borderBottom: '1px solid #e2e8f0', flexShrink: 0, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: '#713f12', cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={tekenZone.enabled} onChange={(e) => setTekenZone((z) => ({ ...z, enabled: e.target.checked }))} />
          Teken zone
        </label>
        {tekenZone.enabled && (
          <>
            {[
              { label: 'X (mm)', key: 'x', fallback: 0 },
              { label: 'Y (mm)', key: 'y', fallback: 0 },
              { label: 'Breedte (mm)', key: 'width', fallback: groupWidth },
              { label: 'Hoogte (mm)', key: 'height', fallback: groupHeight },
            ].map(({ label, key, fallback }) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#713f12' }}>
                {label}:
                <input
                  type="number"
                  value={tekenZone[key] ?? fallback}
                  onChange={(e) => setTekenZone((z) => ({ ...z, [key]: Number(e.target.value) }))}
                  style={{ width: 68, fontSize: 10, padding: '1px 4px', border: '1px solid #ca8a04', borderRadius: 3 }}
                />
              </label>
            ))}
            <button
              onClick={() => setTekenZone({ enabled: true, x: 0, y: 0, width: groupWidth, height: groupHeight })}
              style={{ fontSize: 9, padding: '2px 7px', border: '1px solid #ca8a04', borderRadius: 3, cursor: 'pointer', background: 'none', color: '#713f12' }}
            >Reset</button>
          </>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: drawingType === 'productie' ? 8 : 16 }}>

        {drawingType === 'penanten' && (() => {
          const pens = groupSettings?.penanten ?? [];
          if (!pens.length) return <div style={{ color: '#64748b', fontSize: 13, padding: 20 }}>Geen penanten geconfigureerd.</div>;

          const PAD_L = 100; const PAD_R = 50; const PAD_T = 50; const PAD_B = 130;
          const MAX_UNFOLD_W = 860; const MAX_UNFOLD_H = 480;
          const color = groupSettings?.color ?? '#a64033';

          const svgs = [];

          pens.forEach((p, idx) => {
            const pB = Math.max(1, p.breedte ?? 400);
            const pD = Math.max(1, p.diepte ?? 150);
            const pH = Math.max(1, p.hoogte ?? 2000);
            const gewichtM2 = p.gewichtM2 ?? 9.4;
            const maxKg = p.maxKg ?? 50;
            const brickDepth = groupSettings?.brickDepth ?? 20;
            const stootWT = mat.stoot ?? 10;
            const panelDikteWT = groupSettings?.panelen?.dikte ?? 8;
            const sidePanelDepth = Math.max(1, pD - brickDepth - stootWT);
            const stripOmtrekPerMM = (pB + 2 * sidePanelDepth) / 1e6;
            const kgPerMM = stripOmtrekPerMM * gewichtM2;
            const maxSectieH = kgPerMM > 0 ? Math.floor(maxKg / kgPerMM) : pH;
            const aantalSecties = kgPerMM > 0 ? Math.ceil(pH / maxSectieH) : 1;
            const sectieH = aantalSecties > 0 ? Math.round(pH / aantalSecties) : pH;
            const hp = p.hoekprofiel ?? {};
            const vl = p.verticaleLat ?? {};
            const vlEnabled = vl.enabled !== false;
            const vlD = vl.dikte ?? 50;
            const vlB = vl.breedte ?? 90;
            const hpEnabled = hp.enabled !== false;
            const hpD = hp.dikte ?? 2;

            const totalUnfoldW = 2 * pD + pB;
            const sc = Math.min((MAX_UNFOLD_W - PAD_L - PAD_R) / totalUnfoldW, (MAX_UNFOLD_H - PAD_T - PAD_B) / pH);
            const dW = Math.round(totalUnfoldW * sc);
            const dH = Math.round(pH * sc);
            const svgW = dW + PAD_L + PAD_R;
            const svgH = dH + PAD_T + PAD_B;
            const ox = PAD_L; const oy = PAD_T;

            const ux = (x) => ox + x * sc;
            const uy = (y) => oy + dH - y * sc;
            const leftX = 0; const frontX = pD; const rightX = pD + pB;

            const sectionYs = [];
            for (let s = 0; s <= aantalSecties; s++) sectionYs.push(Math.round(Math.min(s * sectieH, pH)));

            const faceData = (penantFaceData ?? []).find((fd) => fd.penant.id === p.id);
            const sideClipOffWT = Math.max(stootWT, panelDikteWT);
            const clipSideLeft = (rows) => rows.map((row) => ({
              ...row,
              pieces: row.pieces.flatMap((pc) => {
                const clipEnd = sidePanelDepth - sideClipOffWT;
                if (pc.start >= clipEnd) return [];
                if (pc.start + pc.length <= clipEnd) return [pc];
                return [{ ...pc, length: Math.round((clipEnd - pc.start) * 100) / 100 }];
              }),
            })).filter((row) => row.pieces.length > 0);
            const clipSideRight = (rows) => rows.map((row) => ({
              ...row,
              pieces: row.pieces.flatMap((pc) => {
                if (pc.start + pc.length <= sideClipOffWT) return [];
                if (pc.start >= sideClipOffWT) return [pc];
                const newStart = Math.round(sideClipOffWT * 100) / 100;
                return [{ ...pc, start: newStart, length: Math.round((pc.start + pc.length - newStart) * 100) / 100 }];
              }),
            })).filter((row) => row.pieces.length > 0);
            const localLeftRows = clipSideLeft(buildFacePattern(sidePanelDepth, pH, mat, verband));
            const localRightRows = clipSideRight(buildMirroredFacePattern(sidePanelDepth, pH, mat, verband));

            (() => {
              const stoot = mat.stoot ?? 10;
              const hpD_cs = (p.hoekprofiel?.enabled !== false) ? (p.hoekprofiel?.dikte ?? 2) : 0;
              const panelDikte_cs = groupSettings?.panelen?.dikte ?? 8;
              const sideClipOffset = Math.max(stoot, panelDikte_cs);
              const panelDepth_cs = Math.max(1, pD + brickDepth);
              const zijPaneel = panelDepth_cs + stoot;
              const frontPanelW_cs = Math.max(0, pB - 2 * brickDepth);
              const innerClearW_cs = Math.max(0, frontPanelW_cs - 2 * panelDikte_cs);

              const CSW = 720; const CSH = 310;
              const pad = { t: 62, b: 56, l: 64, r: 64 };
              const drawW = CSW - pad.l - pad.r;
              const drawH = CSH - pad.t - pad.b;

              const totalCSW = pB;
              const totalCSH = pD + brickDepth + stoot + panelDikte_cs + 14;
              const scH = drawH / totalCSH;
              const scW = drawW / totalCSW;
              const sc2 = Math.min(scH, scW);

              const bd2  = brickDepth * sc2;
              const sv2  = stoot * sc2;
              const pT   = panelDikte_cs * sc2;
              const pB2  = pB * sc2;
              const fpW2 = innerClearW_cs * sc2;
              const pD2  = panelDepth_cs * sc2;
              const zij2 = zijPaneel * sc2;
              const hp2  = hpD_cs * sc2;
              const clip2 = sideClipOffset * sc2;

              const cx = CSW / 2;
              const buitenY = pad.t + bd2;
              const fpTopY  = buitenY;
              const fpBotY  = fpTopY + pT;
              const sideBot = fpBotY + zij2;
              const gevelY  = sideBot;

              const fpL = cx - fpW2 / 2;
              const fpR = cx + fpW2 / 2;

              const lPanelR = fpL;
              const lPanelL = fpL - pT;
              const lStripL = lPanelL - bd2;

              const rPanelL = fpR;
              const rPanelR = fpR + pT;
              const rStripR = rPanelR + bd2;

              const svgTop = pad.t - bd2 - 4;

              svgs.push(
                <svg key={`cs-${p.id ?? idx}`} width={CSW} height={CSH}
                  viewBox={`0 0 ${CSW} ${CSH}`}
                  style={{ background: '#fff', border: '1px solid #93c5fd', borderRadius: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', display: 'block' }}
                  xmlns="http://www.w3.org/2000/svg">

                  <text x={cx} y={16} textAnchor="middle" fontSize={9.5} fontWeight="bold" fill="#1e3a5f" fontFamily="Arial, sans-serif">
                    {`Penant ${idx + 1} — dwarsdoorsnede U-vorm (bovenaanzicht)`}
                  </text>
                  <text x={cx} y={27} textAnchor="middle" fontSize={7} fill="#64748b" fontFamily="Arial, sans-serif">
                    {`Voorzijde strips = ${mm(pB)} mm  ·  Voorzijde paneel = ${mm(frontPanelW_cs)} mm  ·  Zijpaneel diepte = ${mm(panelDepth_cs)} mm (${mm(pD)} + strip ${mm(brickDepth)})  ·  Strip diepte = ${mm(brickDepth)} mm`}
                  </text>
                  <text x={cx} y={37} textAnchor="middle" fontSize={7} fill="#64748b" fontFamily="Arial, sans-serif">
                    {`Paneeldikte = ${mm(panelDikte_cs)} mm  ·  Clip offset = max(sv, pD) = max(${mm(stoot)}, ${mm(panelDikte_cs)}) = ${mm(sideClipOffset)} mm`}
                  </text>

                  <text x={cx} y={svgTop + 4} textAnchor="middle" fontSize={7} fill="#94a3b8" fontFamily="Arial, sans-serif">▲ BUITEN</text>
                  <text x={cx} y={gevelY + 16} textAnchor="middle" fontSize={7} fill="#94a3b8" fontFamily="Arial, sans-serif">▼ GEVEL</text>

                  {/* Linkerzijde strip - start ONDER voorzijdestrip + stootvoeg gap */}
                  <rect x={lStripL} y={fpTopY + sv2} width={bd2} height={pT + pD2 - sv2} fill="#fef3c7" stroke="#d97706" strokeWidth={0.8} />

                  {/* Rechterzijde strip - start ONDER voorzijdestrip + stootvoeg gap */}
                  <rect x={rPanelR} y={fpTopY + sv2} width={bd2} height={pT + pD2 - sv2} fill="#fef3c7" stroke="#d97706" strokeWidth={0.8} />

                  {/* Stootvoeg hoek L: witte gap tussen voorzijdestrip en zijstrip */}
                  <rect x={lStripL} y={fpTopY} width={bd2} height={sv2} fill="#fff" stroke="#d97706" strokeWidth={0.5} strokeDasharray="2,2" />
                  {/* Stootvoeg hoek R */}
                  <rect x={rPanelR} y={fpTopY} width={bd2} height={sv2} fill="#fff" stroke="#d97706" strokeWidth={0.5} strokeDasharray="2,2" />

                  {/* Linkerzijde paneel - begint ACHTER voorzijde paneel (fpBotY) */}
                  <rect x={lPanelL} y={fpBotY} width={pT} height={pD2} fill="#e0f2fe" stroke="#1e3a5f" strokeWidth={1} />
                  <rect x={lPanelL} y={fpBotY + pD2} width={pT} height={sv2} fill="#fff7ed" stroke="#f59e0b" strokeWidth={0.8} strokeDasharray="2,2" />

                  {/* Rechterzijde paneel - begint ACHTER voorzijde paneel */}
                  <rect x={rPanelL} y={fpBotY} width={pT} height={pD2} fill="#e0f2fe" stroke="#1e3a5f" strokeWidth={1} />
                  <rect x={rPanelL} y={fpBotY + pD2} width={pT} height={sv2} fill="#fff7ed" stroke="#f59e0b" strokeWidth={0.8} strokeDasharray="2,2" />

                  {/* L-profielen in de binnenhoeken */}
                  {hpD_cs > 0 && <>
                    <rect x={fpL - hp2} y={fpBotY} width={hp2} height={pD2} fill="#818cf8" fillOpacity={0.7} stroke="#4338ca" strokeWidth={0.5} />
                    <rect x={fpR} y={fpBotY} width={hp2} height={pD2} fill="#818cf8" fillOpacity={0.7} stroke="#4338ca" strokeWidth={0.5} />
                  </>}

                  {/* Voorzijde paneel - volle breedte (doorlopen, VOOR zijpanelen) */}
                  <rect x={lPanelL} y={fpTopY} width={pB2 - 2 * bd2} height={pT} fill="#dbeafe" stroke="#3b82f6" strokeWidth={1.2} />

                  {/* Voorzijde strips - als LAATSTE tekenen zodat ze voor de zijstrips liggen */}
                  <rect x={lStripL} y={fpTopY - bd2} width={rStripR - lStripL} height={bd2} fill="#fef3c7" stroke="#d97706" strokeWidth={0.8} />


                  {/* Geen-strip zone op zijpaneel (alleen als clip offset > paneeldikte) */}
                  {clip2 > pT + 0.5 && <>
                    <rect x={lPanelL} y={fpBotY} width={pT} height={clip2 - pT} fill="#fca5a5" fillOpacity={0.4} stroke="#dc2626" strokeWidth={0.4} strokeDasharray="2,2" />
                    <rect x={rPanelL} y={fpBotY} width={pT} height={clip2 - pT} fill="#fca5a5" fillOpacity={0.4} stroke="#dc2626" strokeWidth={0.4} strokeDasharray="2,2" />
                  </>}

                  <line x1={lStripL - 2} y1={fpTopY - bd2 - 1} x2={rStripR + 2} y2={fpTopY - bd2 - 1} stroke="#d97706" strokeWidth={0.5} strokeDasharray="3,3" />

                  {[
                    [lStripL, fpTopY - bd2 - 6, rStripR, fpTopY - bd2 - 6, '#d97706', `strips = ${mm(pB)} mm`],
                    [lPanelL, fpBotY + 8, rPanelR, fpBotY + 8, '#3b82f6', `voorzijde paneel = ${mm(frontPanelW_cs)} mm`],
                    [fpL, gevelY + 6, fpR, gevelY + 6, '#475569', `vrij = ${mm(innerClearW_cs)} mm`],
                  ].map(([x1, y1, x2, y2, color, label], i) => (
                    <g key={i}>
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={0.8} />
                      <line x1={x1} y1={y1 - 3} x2={x1} y2={y1 + 3} stroke={color} strokeWidth={0.8} />
                      <line x1={x2} y1={y1 - 3} x2={x2} y2={y1 + 3} stroke={color} strokeWidth={0.8} />
                      <text x={(x1 + x2) / 2} y={y1 - 3} textAnchor="middle" fontSize={7} fill={color} fontFamily="Arial, sans-serif">{label}</text>
                    </g>
                  ))}

                  {/* Maatlijn: zijpaneel diepte - rechts van het rechter zijpaneel */}
                  <line x1={rStripR + 2} y1={fpBotY} x2={rStripR + 2} y2={fpBotY + pD2} stroke="#1e3a5f" strokeWidth={0.8} />
                  <line x1={rStripR - 2} y1={fpBotY} x2={rStripR + 6} y2={fpBotY} stroke="#1e3a5f" strokeWidth={0.8} />
                  <line x1={rStripR - 2} y1={fpBotY + pD2} x2={rStripR + 6} y2={fpBotY + pD2} stroke="#1e3a5f" strokeWidth={0.8} />
                  <text x={rStripR + 10} y={(fpBotY + fpBotY + pD2) / 2} textAnchor="start" dominantBaseline="middle" fontSize={7} fill="#1e3a5f" fontFamily="Arial, sans-serif" transform={`rotate(-90,${rStripR + 10},${(fpBotY + fpBotY + pD2) / 2})`}>{`paneel = ${mm(panelDepth_cs)} mm`}</text>

                  {/* Maatlijn: stootvoeg - ook rechts */}
                  <line x1={rStripR + 2} y1={fpBotY + pD2} x2={rStripR + 2} y2={fpBotY + pD2 + sv2} stroke="#f59e0b" strokeWidth={0.5} strokeDasharray="3,3" />
                  <text x={rStripR + 6} y={fpBotY + pD2 + sv2 / 2} textAnchor="start" dominantBaseline="middle" fontSize={6} fill="#b45309" fontFamily="Arial, sans-serif">{`sv ${mm(stoot)}`}</text>

                  <g transform={`translate(18, ${CSH - 40})`}>
                    <rect x={0} y={0} width={10} height={7} fill="#dbeafe" stroke="#3b82f6" strokeWidth={0.8} /><text x={13} y={6} fontSize={6} fill="#334155" fontFamily="Arial, sans-serif">Voorzijde paneel</text>
                    <rect x={100} y={0} width={10} height={7} fill="#e0f2fe" stroke="#1e3a5f" strokeWidth={0.8} /><text x={113} y={6} fontSize={6} fill="#334155" fontFamily="Arial, sans-serif">Zijpaneel</text>
                    <rect x={170} y={0} width={10} height={7} fill="#fef3c7" stroke="#d97706" strokeWidth={0.8} /><text x={183} y={6} fontSize={6} fill="#334155" fontFamily="Arial, sans-serif">{`Strip (${mm(brickDepth)} mm diepte)`}</text>
                    <rect x={280} y={0} width={10} height={7} fill="#fff7ed" stroke="#f59e0b" strokeWidth={0.8} strokeDasharray="2,2" /><text x={293} y={6} fontSize={6} fill="#334155" fontFamily="Arial, sans-serif">{`Stootvoeg ext. (${mm(stoot)} mm)`}</text>
                    <rect x={420} y={0} width={10} height={7} fill="#fca5a5" fillOpacity={0.4} stroke="#dc2626" strokeWidth={0.4} strokeDasharray="2,2" /><text x={433} y={6} fontSize={6} fill="#334155" fontFamily="Arial, sans-serif">{`Geen strip zone (${mm(sideClipOffset)} mm)`}</text>
                    {hpD_cs > 0 && <><rect x={560} y={0} width={10} height={7} fill="#818cf8" fillOpacity={0.7} stroke="#4338ca" strokeWidth={0.5} /><text x={573} y={6} fontSize={6} fill="#334155" fontFamily="Arial, sans-serif">{`L-profiel (${mm(hpD_cs)} mm)`}</text></>}
                    <text x={0} y={18} fontSize={6.5} fill="#475569" fontFamily="Arial, sans-serif">{`Voorzijde strips = ${mm(pB)} mm  ·  Voorzijde paneel = strips − 2×strip diepte = ${mm(pB)} − 2×${mm(brickDepth)} = ${mm(frontPanelW_cs)} mm  ·  Clip offset = max(sv,pd) = ${mm(sideClipOffset)} mm`}</text>
                  </g>
                </svg>
              );
            })();

            svgs.push(
              <svg key={`construct-${p.id ?? idx}`} width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}
                style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', display: 'block' }}
                xmlns="http://www.w3.org/2000/svg">

                <text x={ox} y={18} fontSize={10} fontWeight="bold" fill="#0f172a" fontFamily="Arial, sans-serif">
                  Penant {idx + 1} — uitgeslagen constructie · X={mm(p.x ?? 0)} mm
                </text>
                <text x={ox} y={30} fontSize={7.5} fill="#64748b" fontFamily="Arial, sans-serif">
                  Uitgeslagen breedte: {mm(totalUnfoldW)} mm · Hoogte: {mm(pH)} mm · {aantalSecties} U-sectie{aantalSecties !== 1 ? 's' : ''} · ≈{mm(sectieH)} mm/sectie
                </text>

                <rect x={ux(leftX)} y={uy(pH)} width={pD * sc} height={dH} fill="#e0f2fe" stroke="#1e3a5f" strokeWidth={1} />
                {localLeftRows.length > 0 && (() => {
                  const stripH = verband === 'staand_tegelverband' ? mat.steenL : mat.steenH;
                  return localLeftRows.flatMap((row, ri) => {
                    if (row.y + stripH <= 0 || row.y >= pH) return [];
                    return row.pieces.map((pc, pi) => {
                      const clipY1 = Math.max(row.y, 0); const clipY2 = Math.min(row.y + stripH, pH);
                      if (clipY2 - clipY1 < 0.5) return null;
                      const rh = Math.max((clipY2 - clipY1) * sc, 1.5);
                      return <rect key={`ls-${ri}-${pi}`} x={ux(leftX + pc.start)} y={uy(clipY2)} width={Math.max(pc.length * sc, 1)} height={rh} fill={brickColor(pc.label, color)} stroke="rgba(0,0,0,0.25)" strokeWidth={0.3} />;
                    }).filter(Boolean);
                  });
                })()}
                <text x={ux(leftX + pD / 2)} y={uy(pH / 2)} textAnchor="middle" dominantBaseline="middle" fontSize={7} fill="#0369a1" fontFamily="Arial, sans-serif" transform={`rotate(-90,${ux(leftX + pD / 2)},${uy(pH / 2)})`}>LINKERZIJDE</text>

                <rect x={ux(frontX + brickDepth)} y={uy(pH)} width={Math.max(0, pB - 2 * brickDepth) * sc} height={dH} fill="#f8fafc" stroke="#1e3a5f" strokeWidth={1.2} />
                {faceData?.front && (() => {
                  const stripH = verband === 'staand_tegelverband' ? mat.steenL : mat.steenH;
                  return faceData.front.flatMap((row, ri) => {
                    if (row.y + stripH <= 0 || row.y >= pH) return [];
                    return row.pieces.map((pc, pi) => {
                      const clipY1 = Math.max(row.y, 0);
                      const clipY2 = Math.min(row.y + stripH, pH);
                      if (clipY2 - clipY1 < 0.5) return null;
                      const rx = ux(frontX + pc.start);
                      const ry = uy(clipY2);
                      const rw = pc.length * sc;
                      const rh = (clipY2 - clipY1) * sc;
                      return (
                        <g key={`fs-${ri}-${pi}`}>
                          <rect x={rx} y={ry} width={rw} height={rh} fill={brickColor(pc.label, color)} stroke="rgba(0,0,0,0.2)" strokeWidth={0.3} />
                          {rw > 12 && rh > 5 && (
                            <text x={rx + rw / 2} y={ry + rh / 2} textAnchor="middle" dominantBaseline="middle"
                              fontSize={Math.min(5, rh * 0.45)} fill="#000" fontFamily="Arial, sans-serif">{pc.label}</text>
                          )}
                        </g>
                      );
                    }).filter(Boolean);
                  });
                })()}
                <text x={ux(frontX + pB / 2)} y={uy(pH) - 6} textAnchor="middle" fontSize={8} fontWeight="bold" fill="#1e3a5f" fontFamily="Arial, sans-serif">VOORZIJDE</text>

                <rect x={ux(rightX)} y={uy(pH)} width={pD * sc} height={dH} fill="#e0f2fe" stroke="#1e3a5f" strokeWidth={1} />
                {localRightRows.length > 0 && (() => {
                  const stripH = verband === 'staand_tegelverband' ? mat.steenL : mat.steenH;
                  return localRightRows.flatMap((row, ri) => {
                    if (row.y + stripH <= 0 || row.y >= pH) return [];
                    return row.pieces.map((pc, pi) => {
                      const clipY1 = Math.max(row.y, 0); const clipY2 = Math.min(row.y + stripH, pH);
                      if (clipY2 - clipY1 < 0.5) return null;
                      const rh = Math.max((clipY2 - clipY1) * sc, 1.5);
                      return <rect key={`rs-${ri}-${pi}`} x={ux(rightX + pc.start)} y={uy(clipY2)} width={Math.max(pc.length * sc, 1)} height={rh} fill={brickColor(pc.label, color)} stroke="rgba(0,0,0,0.25)" strokeWidth={0.3} />;
                    }).filter(Boolean);
                  });
                })()}
                <text x={ux(rightX + pD / 2)} y={uy(pH / 2)} textAnchor="middle" dominantBaseline="middle" fontSize={7} fill="#0369a1" fontFamily="Arial, sans-serif" transform={`rotate(-90,${ux(rightX + pD / 2)},${uy(pH / 2)})`}>RECHTERZIJDE</text>

                <line x1={ux(frontX)} y1={uy(pH)} x2={ux(frontX)} y2={uy(0)} stroke="#475569" strokeWidth={0.8} strokeDasharray="4,3" />
                <line x1={ux(rightX)} y1={uy(pH)} x2={ux(rightX)} y2={uy(0)} stroke="#475569" strokeWidth={0.8} strokeDasharray="4,3" />

                {sectionYs.slice(1, -1).map((sy_val, si) => (
                  <g key={si}>
                    <line x1={ux(leftX)} y1={uy(sy_val)} x2={ux(rightX + pD)} y2={uy(sy_val)} stroke="#dc2626" strokeWidth={1} strokeDasharray="6,3" />
                    <text x={ux(rightX + pD) + 4} y={uy(sy_val) + 3} fontSize={7} fill="#dc2626" fontFamily="Arial, sans-serif">U{si + 1}|U{si + 2}</text>
                  </g>
                ))}

                {sectionYs.slice(0, -1).map((sy_val, si) => {
                  const sMid = (sy_val + sectionYs[si + 1]) / 2;
                  return (
                    <text key={si} x={ux(frontX + pB / 2)} y={uy(sMid)} textAnchor="middle" dominantBaseline="middle"
                      fontSize={8} fontWeight="bold" fill="#334155" fontFamily="Arial, sans-serif">U{si + 1}</text>
                  );
                })}

                {vlEnabled && [leftX, rightX].map((fx, fi) => (
                  <g key={fi}>
                    <rect x={fi === 0 ? ux(fx + pD - vlD) : ux(fx)} y={uy(pH)} width={vlD * sc} height={dH} fill="#92400e" fillOpacity={0.3} stroke="#92400e" strokeWidth={0.5} />
                    <text x={fi === 0 ? ux(fx + pD - vlD / 2) : ux(fx + vlD / 2)} y={uy(pH) - 4} textAnchor="middle" fontSize={6} fill="#92400e" fontFamily="Arial, sans-serif">{mm(vlD)}</text>
                  </g>
                ))}

                {hpEnabled && [
                  { fx: frontX, corner: 'tl' }, { fx: frontX + pB - hpD, corner: 'tr' },
                ].map(({ fx, corner }) => (
                  <g key={corner}>
                    <rect x={ux(fx)} y={uy(pH)} width={hpD * sc} height={dH} fill="#6366f1" fillOpacity={0.6} stroke="#4338ca" strokeWidth={0.5} />
                  </g>
                ))}

                <DimH x1={ux(frontX)} x2={ux(rightX)} y={uy(0) + 22} label={`strips ${mm(pB)} mm`} />
                <DimH x1={ux(leftX)} x2={ux(frontX)} y={uy(0) + 38} label={`${mm(pD)} mm`} flip />
                <DimH x1={ux(rightX)} x2={ux(rightX + pD)} y={uy(0) + 38} label={`${mm(pD)} mm`} flip />
                <DimH x1={ux(leftX)} x2={ux(rightX + pD)} y={uy(0) + 56} label={`${mm(totalUnfoldW)} mm`} />
                <DimV x={ox - 20} y1={uy(pH)} y2={uy(0)} label={`${mm(pH)} mm`} side="left" />

                {sectionYs.slice(1, -1).map((sy_val, si) => (
                  <DimV key={si} x={ox - 50} y1={uy(sectionYs[si])} y2={uy(sy_val)} label={`${mm(sy_val - sectionYs[si])} mm`} side="left" />
                ))}
                {aantalSecties > 0 && (
                  <DimV x={ox - 50} y1={uy(sectionYs[aantalSecties - 1])} y2={uy(pH)} label={`${mm(pH - sectionYs[aantalSecties - 1])} mm`} side="left" />
                )}

                {(() => {
                  const calcX = ox;
                  const calcY = uy(0) + 68;
                  const stripOmtrek = pB + 2 * sidePanelDepth;
                  const gPerMM = kgPerMM * 1000;
                  return (
                    <g fontFamily="Arial, sans-serif" fontSize={7} fill="#334155">
                      <text x={calcX} y={calcY} fontWeight="bold" fill="#0f172a">Gewichtsberekening (U-sectie opdeling):</text>
                      <text x={calcX} y={calcY + 11}>{`Voorzijde: ${mm(pB)} mm  +  2 × zijkant: ${mm(sidePanelDepth)} mm  =  strip-omtrek: ${mm(stripOmtrek)} mm`}</text>
                      <text x={calcX} y={calcY + 22}>{`Gewicht/mm hoogte: ${mm(stripOmtrek)} mm × ${gewichtM2} kg/m²  =  ${gPerMM.toFixed(2)} g/mm  →  max sectie: ⌊${maxKg} kg ÷ ${kgPerMM.toFixed(5)} kg/mm⌋ = ${maxSectieH} mm`}</text>
                      <text x={calcX} y={calcY + 33} fontWeight="bold" fill="#1e3a5f">{`Resultaat: ${aantalSecties} sectie${aantalSecties !== 1 ? 's' : ''} van ca. ${mm(sectieH)} mm  (totale hoogte: ${mm(pH)} mm)`}</text>
                    </g>
                  );
                })()}

                <g transform={`translate(${ox},${svgH - 20})`}>
                  <rect x={0} y={0} width={10} height={7} fill="#e0f2fe" stroke="#1e3a5f" strokeWidth={0.5} />
                  <text x={13} y={6.5} fontSize={6.5} fill="#334155" fontFamily="Arial, sans-serif">Zijvlak (diepte)</text>
                  <rect x={80} y={0} width={10} height={7} fill="#f8fafc" stroke="#1e3a5f" strokeWidth={0.5} />
                  <text x={93} y={6.5} fontSize={6.5} fill="#334155" fontFamily="Arial, sans-serif">Voorzijde</text>
                  {vlEnabled && <><rect x={150} y={0} width={10} height={7} fill="#92400e" fillOpacity={0.3} stroke="#92400e" strokeWidth={0.5} /><text x={163} y={6.5} fontSize={6.5} fill="#334155" fontFamily="Arial, sans-serif">Vert. lat {mm(vlB)}×{mm(vlD)}</text></>}
                  {hpEnabled && <><rect x={260} y={0} width={10} height={7} fill="#6366f1" fillOpacity={0.6} stroke="#4338ca" strokeWidth={0.5} /><text x={273} y={6.5} fontSize={6.5} fill="#334155" fontFamily="Arial, sans-serif">Alu. L {mm(hpD)}mm</text></>}
                  <line x1={350} y1={3.5} x2={370} y2={3.5} stroke="#dc2626" strokeWidth={1} strokeDasharray="4,2" />
                  <text x={373} y={6.5} fontSize={6.5} fill="#334155" fontFamily="Arial, sans-serif">U-sectie grens</text>
                </g>
              </svg>
            );

            if (faceData) {
              const secSvgs = [];
              sectionYs.slice(0, -1).forEach((secBottom, si) => {
                const secTop = sectionYs[si + 1];
                const secH = secTop - secBottom;
                const secSc = Math.min((MAX_UNFOLD_W - PAD_L - PAD_R) / totalUnfoldW, (MAX_UNFOLD_H - PAD_T - PAD_B) / secH);
                const sdW = Math.round(totalUnfoldW * secSc);
                const sdH = Math.round(secH * secSc);
                const ssvgW = sdW + PAD_L + PAD_R;
                const ssvgH = sdH + PAD_T + PAD_B;
                const sox = PAD_L;
                const sux = (x) => sox + x * secSc;
                const suy = (y) => PAD_T + sdH - (y - secBottom) * secSc;

                secSvgs.push(
                  <svg key={`strip-${p.id ?? idx}-${si}`} width={ssvgW} height={ssvgH} viewBox={`0 0 ${ssvgW} ${ssvgH}`}
                    style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', flexShrink: 0 }}
                    xmlns="http://www.w3.org/2000/svg">
                    <text x={sox} y={18} fontSize={10} fontWeight="bold" fill="#0f172a" fontFamily="Arial, sans-serif">
                      Penant {idx + 1} — U{si + 1} · {mm(secH)} mm hoog
                    </text>
                    <text x={sox} y={30} fontSize={7.5} fill="#64748b" fontFamily="Arial, sans-serif">
                      {mm(secBottom)}–{mm(secTop)} mm · {mm(totalUnfoldW)} mm breed · {verband}
                    </text>
                    <rect x={sux(leftX)} y={suy(secTop)} width={pD * secSc} height={sdH} fill="#e0f2fe" stroke="#1e3a5f" strokeWidth={0.7} fillOpacity={0.3} />
                    <text x={sux(leftX + pD / 2)} y={suy(secTop + secH / 2)} textAnchor="middle" dominantBaseline="middle" fontSize={6.5} fill="#0369a1" fontFamily="Arial, sans-serif" transform={`rotate(-90,${sux(leftX + pD / 2)},${suy(secTop + secH / 2)})`}>LINKS</text>
                    <rect x={sux(frontX + brickDepth)} y={suy(secTop)} width={Math.max(0, pB - 2 * brickDepth) * secSc} height={sdH} fill="#f8fafc" stroke="#1e3a5f" strokeWidth={1} fillOpacity={0.4} />
                    <text x={sux(frontX + pB / 2)} y={suy(secTop) - 6} textAnchor="middle" fontSize={8} fontWeight="bold" fill="#1e3a5f" fontFamily="Arial, sans-serif">VOORZIJDE</text>
                    <rect x={sux(rightX)} y={suy(secTop)} width={pD * secSc} height={sdH} fill="#e0f2fe" stroke="#1e3a5f" strokeWidth={0.7} fillOpacity={0.3} />
                    <text x={sux(rightX + pD / 2)} y={suy(secTop + secH / 2)} textAnchor="middle" dominantBaseline="middle" fontSize={6.5} fill="#0369a1" fontFamily="Arial, sans-serif" transform={`rotate(-90,${sux(rightX + pD / 2)},${suy(secTop + secH / 2)})`}>RECHTS</text>
                    <line x1={sux(frontX)} y1={suy(secTop)} x2={sux(frontX)} y2={suy(secBottom)} stroke="#475569" strokeWidth={0.7} strokeDasharray="3,2" />
                    <line x1={sux(rightX)} y1={suy(secTop)} x2={sux(rightX)} y2={suy(secBottom)} stroke="#475569" strokeWidth={0.7} strokeDasharray="3,2" />
                    <DimH x1={sux(leftX)} x2={sux(frontX)} y={suy(secBottom) + 28} label={`${mm(pD)} mm`} />
                    <DimH x1={sux(frontX)} x2={sux(rightX)} y={suy(secBottom) + 28} label={`${mm(pB)} mm`} />
                    <DimH x1={sux(rightX)} x2={sux(rightX + pD)} y={suy(secBottom) + 28} label={`${mm(pD)} mm`} />
                    <DimV x={sox - 20} y1={suy(secTop)} y2={suy(secBottom)} label={`${mm(secH)} mm`} side="left" />
                  </svg>
                );
              });
              svgs.push(
                <div key={`secs-${p.id ?? idx}`} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
                  {secSvgs}
                </div>
              );
            }
          });

          return <div id="penanten-print-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{svgs}</div>;
        })()}

        {drawingType === 'productie' && (
          <div>
            {!productieGenerated ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12 }}>
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  Genereer productiematen{selectedZone ? ` voor ${selectedZone.label}` : ' voor alle zones'} ({zonePanels.length} panelen)
                </div>
                <button
                  onClick={() => setProductieGenerated(true)}
                  style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 5, padding: '8px 20px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
                >
                  Genereer paneel tekeningen
                </button>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '0 4px' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#1e3a5f' }}>
                    {zonePanels.length} panelen — {groupName ?? 'Groep'}{selectedZone ? ` · ${selectedZone.label}` : ''}
                  </span>
                  <button onClick={() => setProductieGenerated(false)} style={{ fontSize: 11, background: '#e2e8f0', border: 'none', borderRadius: 3, padding: '3px 8px', cursor: 'pointer' }}>Verberg</button>
                </div>
                <div ref={productiePrintRef} style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                  {zonePanels.map((panel, idx) => {
                    const { strips, counts } = getPanelStripsAnnotated(panel, facadeData.rows, verband, mat);
                    const color = groupSettings?.color ?? '#a64033';
                    const PAD = 40;
                    const MAX_DRAW_W = 340;
                    const MAX_DRAW_H = 420;
                    const aspect = panel.height / panel.width;
                    let drawPW = Math.min(MAX_DRAW_W, panel.width * 0.4);
                    let drawPH = drawPW * aspect;
                    if (drawPH > MAX_DRAW_H) { drawPH = MAX_DRAW_H; drawPW = drawPH / aspect; }
                    const sc = drawPW / panel.width;
                    const TABLE_H = Math.min(counts.length * 12 + 28, 120);
                    const CARD_W = drawPW + PAD * 2;
                    const CARD_H = drawPH + PAD * 2 + TABLE_H + 20;
                    const ox = PAD, oy = 32;
                    const px = (x) => ox + x * sc;
                    const py = (y) => oy + (panel.height - y) * sc;
                    return (
                      <svg key={panel.id ?? idx} width={CARD_W} height={CARD_H}
                        viewBox={`0 0 ${CARD_W} ${CARD_H}`}
                        style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', flexShrink: 0 }}
                        xmlns="http://www.w3.org/2000/svg">
                        <text x={CARD_W / 2} y={14} textAnchor="middle" fontSize={9} fontWeight="bold" fill="#1e3a5f" fontFamily="Arial, sans-serif">
                          P{idx + 1}{selectedZone ? ` · ${selectedZone.label}` : ''} — {mm(panel.width)} × {mm(panel.height)} mm
                        </text>
                        <text x={CARD_W / 2} y={25} textAnchor="middle" fontSize={7} fill="#64748b" fontFamily="Arial, sans-serif">
                          {verband} · {strips.length} strips
                        </text>
                        <rect x={ox} y={oy} width={drawPW} height={drawPH} fill="#f8fafc" stroke="#1e3a5f" strokeWidth={1} />
                        {strips.map((s, si) => {
                          const rw = s.width * sc;
                          const rh = s.height * sc;
                          const rx = px(s.x);
                          const ry = py(s.y + s.height);
                          return (
                            <g key={si}>
                              <rect x={rx} y={ry} width={rw} height={rh}
                                fill={brickColor(s.label, color)} stroke="rgba(0,0,0,0.2)" strokeWidth={0.3} />
                              {rw > 18 && rh > 7 && (
                                <text x={rx + rw / 2} y={ry + rh / 2} textAnchor="middle" dominantBaseline="middle"
                                  fontSize={Math.min(7, rh * 0.55)} fill="#000" fontFamily="Arial, sans-serif">{mm(s.width)}</text>
                              )}
                            </g>
                          );
                        })}
                        <text x={ox + drawPW / 2} y={oy - 4} textAnchor="middle" fontSize={7} fill="#334155" fontFamily="Arial, sans-serif">{mm(panel.width)} mm</text>
                        <text x={ox - 5} y={oy + drawPH / 2} textAnchor="middle" fontSize={7} fill="#334155" fontFamily="Arial, sans-serif"
                          transform={`rotate(-90,${ox - 5},${oy + drawPH / 2})`}>{mm(panel.height)} mm</text>
                        <line x1={ox} y1={oy + drawPH + 6} x2={ox + drawPW} y2={oy + drawPH + 6} stroke="#e2e8f0" strokeWidth={0.8} />
                        <text x={ox} y={oy + drawPH + 18} fontSize={7.5} fontWeight="bold" fill="#1e3a5f" fontFamily="Arial, sans-serif">Strippentelling:</text>
                        {counts.slice(0, 8).map(({ label, len, n }, ci) => (
                          <text key={ci} x={ox} y={oy + drawPH + 28 + ci * 11} fontSize={7} fill="#334155" fontFamily="Arial, sans-serif">
                            {n}× {label} {len} mm
                          </text>
                        ))}
                        {counts.length > 8 && (
                          <text x={ox} y={oy + drawPH + 28 + 8 * 11} fontSize={6.5} fill="#94a3b8" fontFamily="Arial, sans-serif">… nog {counts.length - 8} types</text>
                        )}
                      </svg>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {drawingType === 'zaaglijst' && (() => {
          const brickW2 = mat?.brickWeightM2 ?? 40;
          let globalSeq = 1;
          const tableRows = [];
          for (const zone of facadeZones) {
            const panelsInZone = allPanels.filter((p) => p.x + p.width > zone.xStart + 1 && p.x < zone.xEnd - 1);
            for (const panel of panelsInZone) {
              const paneelId = makeEpcId(zone, globalSeq++);
              const { counts } = getPanelStripsAnnotated(panel, facadeData.rows, verband, mat);
              const areaM2 = (panel.width * panel.height) / 1e6;
              const gewichtKg = Math.round(areaM2 * brickW2 * 10) / 10;
              const volCount  = counts.filter(c => c.label === 'Vol').reduce((s, c) => s + c.n, 0);
              const kopCount  = counts.filter(c => c.label === 'Kop').reduce((s, c) => s + c.n, 0);
              const dkCount   = counts.filter(c => c.label === 'Driekwart').reduce((s, c) => s + c.n, 0);
              const hvCount   = counts.filter(c => c.label === 'Halve').reduce((s, c) => s + c.n, 0);
              const restCount = counts.filter(c => c.label === 'Rest').reduce((s, c) => s + c.n, 0);
              const total     = counts.reduce((s, c) => s + c.n, 0);
              tableRows.push({ paneelId, paneelIdDisplay: formatEpcDisplay(paneelId), zone: zone.label, breedte: Math.round(panel.width), hoogte: Math.round(panel.height), opp: areaM2.toFixed(3), gewicht: gewichtKg, vol: volCount, kop: kopCount, dk: dkCount, hv: hvCount, rest: restCount, total });
            }
          }
          const thStyle = { padding: '5px 8px', borderBottom: '2px solid #1e3a5f', fontSize: 10, fontWeight: 700, color: '#1e3a5f', whiteSpace: 'nowrap', textAlign: 'left', background: '#f0f4f8' };
          const tdStyle = { padding: '4px 8px', borderBottom: '1px solid #e2e8f0', fontSize: 10, color: '#334155', whiteSpace: 'nowrap' };
          const tdRight = { ...tdStyle, textAlign: 'right' };
          return (
            <div style={{ background: '#fff', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.10)', overflow: 'auto', maxHeight: '100%' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#1e3a5f' }}>
                Zaaglijst — {groupName ?? 'Groep'} ({tableRows.length} panelen)
                {epcProjectNr !== '00000' && <span style={{ fontSize: 10, fontWeight: 400, color: '#64748b', marginLeft: 8 }}>Project {epcProjectNr} · Level {String(epcLevel).padStart(2,'0')}</span>}
              </span>
                <button onClick={exportZaaglijst} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>⬇ Export CSV</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['PaneelID', 'Zone', 'B (mm)', 'H (mm)', 'Opp. (m²)', 'Gew. (kg)', 'Vol', 'Kop', '¾', '½', 'Rest', 'Totaal'].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((r, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', letterSpacing: '0.03em', fontWeight: 600, color: '#1e40af' }} title={r.paneelId}>{r.paneelIdDisplay}</td>
                      <td style={tdStyle}>{r.zone}</td>
                      <td style={tdRight}>{r.breedte}</td>
                      <td style={tdRight}>{r.hoogte}</td>
                      <td style={tdRight}>{r.opp}</td>
                      <td style={tdRight}>{r.gewicht}</td>
                      <td style={tdRight}>{r.vol || ''}</td>
                      <td style={tdRight}>{r.kop || ''}</td>
                      <td style={tdRight}>{r.dk || ''}</td>
                      <td style={tdRight}>{r.hv || ''}</td>
                      <td style={tdRight}>{r.rest || ''}</td>
                      <td style={{ ...tdRight, fontWeight: 700 }}>{r.total}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f0f4f8' }}>
                    <td colSpan={5} style={{ ...tdStyle, fontWeight: 700 }}>Totaal {tableRows.length} panelen</td>
                    <td style={{ ...tdRight, fontWeight: 700 }}>{tableRows.reduce((s, r) => s + r.gewicht, 0).toFixed(1)}</td>
                    <td style={{ ...tdRight, fontWeight: 700 }}>{tableRows.reduce((s, r) => s + r.vol, 0)}</td>
                    <td style={{ ...tdRight, fontWeight: 700 }}>{tableRows.reduce((s, r) => s + r.kop, 0)}</td>
                    <td style={{ ...tdRight, fontWeight: 700 }}>{tableRows.reduce((s, r) => s + r.dk, 0)}</td>
                    <td style={{ ...tdRight, fontWeight: 700 }}>{tableRows.reduce((s, r) => s + r.hv, 0)}</td>
                    <td style={{ ...tdRight, fontWeight: 700 }}>{tableRows.reduce((s, r) => s + r.rest, 0)}</td>
                    <td style={{ ...tdRight, fontWeight: 700 }}>{tableRows.reduce((s, r) => s + r.total, 0)}</td>
                  </tr>
                </tfoot>
              </table>
              <div style={{ padding: '8px 14px', fontSize: 9, color: '#94a3b8', borderTop: '1px solid #e2e8f0' }}>
                EPC-16 formaat: E-PPPPP-LL-SS-EE-NNN-T · E=entiteit(P) · PPPPP=projectnummer · LL=level · SS=stramien start · EE=stramien eind · NNN=volgnummer · T=type(V) · Hover over ID voor raw EPC code
              </div>
            </div>
          );
        })()}

        {drawingType === 'maltekening' && (() => {
          const groupVerband = groupSettings?.verband ?? 'halfsteens';
          const moldDims = { hoogte: panelen?.malBreedte ?? 270, lengte: panelen?.malLengte ?? 3400, tolerantieL: panelen?.tolerantieL ?? 1, tolerantieH: panelen?.tolerantieH ?? 1 };
          const zonesForMal = (selectedZone && !tekenZone.enabled) ? [selectedZone] : facadeZones;
          const hasZones = facadeZones.length > 1;

          const resolvedZoneSettings = (zoneSettings ?? []);

          function getZoneMat(zone) {
            const zs = resolvedZoneSettings[zone.idx] ?? {};
            return { ...mat, ...(zs.material ?? {}) };
          }
          function getZoneVerband(zone) {
            return resolvedZoneSettings[zone.idx]?.verband ?? groupVerband;
          }

          const uniqueMolds = (() => {
            const seen = new Map();
            for (const zone of zonesForMal) {
              const zVerband = getZoneVerband(zone);
              const zMat = getZoneMat(zone);
              const key = `${zVerband}|${zMat.steenL}|${zMat.steenH}|${zMat.lint}|${zMat.stoot}`;
              if (!seen.has(key)) seen.set(key, { verband: zVerband, mat: zMat, key });
            }
            return [...seen.values()];
          })();

          function zoneInfo(zone) {
            const zVerband = getZoneVerband(zone);
            const zMat = getZoneMat(zone);
            const zoneTpl = getMoldTemplates(zVerband, zMat, moldDims);
            const panelsInZone = allPanels.filter((p) => p.x + p.width > zone.xStart + 1 && p.x < zone.xEnd - 1);
            const panelCount = panelsInZone.length;
            const panelH = panelen?.hoogte ?? 1200;
            const rowsPerPanel = Math.max(1, Math.floor(panelH / zoneTpl.lagenmaat));
            const totalPasses = Math.ceil(rowsPerPanel / zoneTpl.rowsPerMold);
            const passesLinks  = Math.ceil(totalPasses / 2);
            const passesRechts = Math.floor(totalPasses / 2);
            const passSeq = Array.from({ length: totalPasses }, (_, i) => zoneTpl.templates[i % zoneTpl.templates.length]?.id ?? (i % 2 === 0 ? 'Links' : 'Rechts'));
            return { panelCount, rowsPerPanel, totalPasses, passesLinks, passesRechts, passSeq, zVerband, zoneTpl };
          }

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* ── Maltekening per uniek verband ── */}
              {uniqueMolds.map(({ verband: mv, mat: mm, key }) => {
                const tpl = getMoldTemplates(mv, mm, moldDims);
                const combinedSvgHtml = generateCombinedMoldSVG(mm, mv, moldDims);
                function exportSVG() {
                  const svgStr = generateCombinedMoldSVG(mm, mv, moldDims);
                  const blob = new Blob([svgStr], { type: 'image/svg+xml' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = `MAL-gecombineerd-${mv}.svg`; a.click();
                  URL.revokeObjectURL(url);
                }
                return (
                  <div key={key} style={{ background: '#fff', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.10)', padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', flex: 1 }}>
                        Maltekening — {tpl.verband}{tpl.rotated ? ' (90° gedraaid)' : ''} · {moldDims.lengte}×{moldDims.hoogte} mm · Staal 2 mm
                      </div>
                      <button onClick={exportSVG} style={{ fontSize: 10, background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        ⬇ SVG
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
                      Strip {tpl.brickW}×{tpl.brickH} mm · Lagenmaat {tpl.lagenmaat} mm · Stap {tpl.colStep} mm · {tpl.cycleLength}-rijcyclus
                      · <span style={{ color: '#166534', fontWeight: 600 }}>Zelfde outline voor MAL Links en MAL Rechts</span>
                    </div>
                    <div
                      dangerouslySetInnerHTML={{ __html: combinedSvgHtml }}
                      style={{ maxWidth: '100%', overflowX: 'auto', borderRadius: 4, border: '1px solid #e2e8f0' }}
                    />
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {tpl.templates.map((tmpl) =>
                        tmpl.rows.map((row) => (
                          <div key={`${tmpl.id}-${row.globalRow}`} style={{ fontSize: 10, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 4, padding: '2px 7px', color: '#0c4a6e' }}>
                            <strong>MAL {tmpl.id} · R{row.globalRow + 1}</strong> · {row.offset} mm
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}

              {/* ── Per zone: welke mal en hoeveel doorgangen ── */}
              <div style={{ background: '#fff', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.10)', padding: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 10 }}>
                  {hasZones ? 'Mal gebruik per zone' : 'Mal gebruik'}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr>
                      {(hasZones ? ['Zone', 'Breedte', 'Panelen'] : ['Panelen'])
                        .concat(uniqueMolds.length > 1 ? ['Verband'] : [])
                        .concat(['Rijen/paneel', 'Doorg./paneel', 'MAL Links', 'MAL Rechts', 'Volgorde per paneel'])
                        .map((h) => (
                        <th key={h} style={{ padding: '5px 8px', borderBottom: '2px solid #1e3a5f', fontWeight: 700, color: '#1e3a5f', textAlign: 'left', background: '#f0f4f8', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {zonesForMal.map((zone) => {
                      const { panelCount, rowsPerPanel, totalPasses, passesLinks, passesRechts, passSeq, zVerband } = zoneInfo(zone);
                      return (
                        <tr key={zone.idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          {hasZones && <>
                            <td style={{ padding: '5px 8px', fontWeight: 600 }}>{zone.label}</td>
                            <td style={{ padding: '5px 8px', color: '#475569' }}>{Math.round(zone.xEnd - zone.xStart)} mm</td>
                            <td style={{ padding: '5px 8px', color: '#475569' }}>{panelCount}</td>
                          </>}
                          {!hasZones && <td style={{ padding: '5px 8px', color: '#475569' }}>{panelCount}</td>}
                          {uniqueMolds.length > 1 && (
                            <td style={{ padding: '5px 8px' }}>
                              <span style={{ background: '#f0f4f8', border: '1px solid #cbd5e1', borderRadius: 3, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>{zVerband}</span>
                            </td>
                          )}
                          <td style={{ padding: '5px 8px', color: '#475569' }}>{rowsPerPanel}</td>
                          <td style={{ padding: '5px 8px', fontWeight: 600 }}>{totalPasses}×</td>
                          <td style={{ padding: '5px 8px' }}>
                            <span style={{ background: '#1e3a5f', color: '#fff', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>{passesLinks}×</span>
                          </td>
                          <td style={{ padding: '5px 8px' }}>
                            <span style={{ background: '#0f766e', color: '#fff', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>{passesRechts}×</span>
                          </td>
                          <td style={{ padding: '5px 8px' }}>
                            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                              {passSeq.map((id, i) => (
                                <span key={i} style={{ background: i % 2 === 0 ? '#1e3a5f' : '#0f766e', color: '#fff', borderRadius: 3, padding: '1px 5px', fontSize: 9, whiteSpace: 'nowrap' }}>
                                  {i + 1}·{id}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

            </div>
          );
        })()}

        {drawingType !== 'productie' && drawingType !== 'zaaglijst' && drawingType !== 'maltekening' && <svg ref={svgRef} width={VIEW_W} height={svgTotal} viewBox={`0 0 ${VIEW_W} ${svgTotal}`} style={{ background: '#fff', display: 'block', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }} xmlns="http://www.w3.org/2000/svg">

          <rect x={0} y={0} width={VIEW_W} height={svgTotal} fill="#fff" />

          <defs>
            <clipPath id="wt-openings-clip" clipPathUnits="userSpaceOnUse">
              <path fillRule="evenodd" d={[
                facadeShapePath,
                ...groupOpenings.map((op) => {
                  const poly = op.polyPts && op.polyPts.length >= 3 ? op.polyPts : [
                    { l: op.x, h: op.y }, { l: op.x + op.width, h: op.y },
                    { l: op.x + op.width, h: op.y + op.height }, { l: op.x, h: op.y + op.height },
                  ];
                  return poly.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.l)},${sy(p.h)}`).join(' ') + ' Z';
                }),
              ].join(' ')} />
            </clipPath>
          </defs>

          <text x={OX} y={20} fontSize={13} fontWeight="bold" fill="#0f172a" fontFamily="Arial, sans-serif">
            {groupName ?? 'Groep'}{activeZoneLabel ? ` — ${activeZoneLabel}` : ''} — {drawingType === 'achterconstructie' ? 'Achterconstructie (houten latten)' : 'Panelen plaatsing op gevel'}
          </text>
          <text x={OX} y={33} fontSize={8} fill="#64748b" fontFamily="Arial, sans-serif">
            Schaal 1:{Math.round(1 / scale * 1000)} · Afmetingen in mm · Peilmaten in m t.o.v. IFC-nulpunt{activeZoneLabel ? ` · B: ${mm(viewW_mm)} mm (X ${mm(viewXStart)}–${mm(viewXEnd)}) · H: ${mm(viewH_mm)} mm (Y ${mm(viewYStart)}–${mm(viewYEnd)})` : ` · Totale breedte: ${mm(groupWidth)} mm`}
          </text>

          <path d={facadeShapePath} fill="#f8fafc" stroke={dimColor} strokeWidth={1} fillRule="nonzero" />

          {drawingType === 'plaatsing' && zonePanels.map((p, i) => {
            const clips = p.clipPolys;
            const cx = clips
              ? clips[0].reduce((s, pt) => s + pt.l, 0) / clips[0].length
              : p.x + p.width / 2;
            const cy = clips
              ? clips[0].reduce((s, pt) => s + pt.h, 0) / clips[0].length
              : p.y + p.height / 2;
            const labelVisible = p.width * scale > 24 && p.height * scale > 14;
            return (
              <g key={p.id ?? i}>
                {clips ? (
                  clips.map((cp, ci) => (
                    <polygon key={ci}
                      points={cp.map(pt => `${sx(pt.l)},${sy(pt.h)}`).join(' ')}
                      fill={panelColor} stroke={dimColor} strokeWidth={0.8} fillOpacity={0.8}
                    />
                  ))
                ) : (
                  <rect
                    x={sx(p.x)} y={sy(p.y + p.height)}
                    width={p.width * scale} height={p.height * scale}
                    fill={panelColor} stroke={dimColor} strokeWidth={0.8} fillOpacity={0.8}
                  />
                )}
                {labelVisible && (
                  <text
                    x={sx(cx)} y={sy(cy)}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={FONT_LBL} fill="#1e3a5f" fontFamily="Arial, sans-serif" fontWeight="bold"
                  >
                    P{i + 1}
                  </text>
                )}
              </g>
            );
          })}

          <g clipPath="url(#wt-openings-clip)">
            {drawingType === 'achterconstructie' && zoneLatten.map((l) => (
              <rect
                key={l.id}
                x={sx(l.x)} y={sy(l.y + l.height)}
                width={l.width * scale} height={l.height * scale}
                fill={latColor} stroke="#92400e" strokeWidth={0.5} fillOpacity={0.85}
              />
            ))}
          </g>

          {zoneOpenings.map((op, i) => {
            const poly = op.polyPts;
            if (poly && poly.length >= 3) {
              const pts = poly.map((p) => `${sx(p.l)},${sy(p.h)}`).join(' ');
              return (
                <g key={i}>
                  <polygon points={pts} fill={openColor} fillOpacity={0.5} stroke="#dc2626" strokeWidth={0.8} strokeDasharray="3,2" />
                  <line x1={sx(op.x)} y1={sy(op.y)} x2={sx(op.x + op.width)} y2={sy(op.y + op.height)} stroke="#dc2626" strokeWidth={0.4} />
                  <line x1={sx(op.x + op.width)} y1={sy(op.y)} x2={sx(op.x)} y2={sy(op.y + op.height)} stroke="#dc2626" strokeWidth={0.4} />
                </g>
              );
            }
            return (
              <g key={i}>
                <rect x={sx(op.x)} y={sy(op.y + op.height)} width={op.width * scale} height={op.height * scale}
                  fill={openColor} fillOpacity={0.5} stroke="#dc2626" strokeWidth={0.8} strokeDasharray="3,2" />
                <line x1={sx(op.x)} y1={sy(op.y)} x2={sx(op.x + op.width)} y2={sy(op.y + op.height)} stroke="#dc2626" strokeWidth={0.4} />
                <line x1={sx(op.x + op.width)} y1={sy(op.y)} x2={sx(op.x)} y2={sy(op.y + op.height)} stroke="#dc2626" strokeWidth={0.4} />
              </g>
            );
          })}

          {xBreaks.map((x, i) => (
            drawingType !== 'achterconstructie' &&
            <line key={i} x1={sx(x)} y1={OY} x2={sx(x)} y2={OY + H + 8} stroke={dimColor} strokeWidth={0.3} strokeDasharray="3,3" opacity={0.5} />
          ))}

          {drawingType !== 'achterconstructie' && xBreaks.length >= 2 && xBreaks.slice(0, -1).map((x, i) => {
            const x2 = xBreaks[i + 1];
            const span = x2 - x;
            if (span < 1) return null;
            return <DimH key={i} x1={sx(x)} x2={sx(x2)} y={dimRowY} label={`${mm(span)}`} color={dimColor} />;
          })}

          {xBreaks.length >= 2 && (
            <DimH x1={sx(viewXStart)} x2={sx(viewXEnd)} y={dimRow2Y} label={activeZoneLabel ? `${activeZoneLabel}: ${mm(viewW_mm)} mm` : `TOTAAL ${mm(groupWidth)} mm`} color="#dc2626" />
          )}

          {drawingType !== 'achterconstructie' && zoneOpenings.map((op, i) => (
            op.width > 1 && (
              <DimH key={`op-h-${i}`} x1={sx(op.x)} x2={sx(op.x + op.width)} y={OY + H + 48} label={`raam ${mm(op.width)}`} color="#dc2626" />
            )
          ))}

          {drawingType === 'achterconstructie' && zoneLatten.map((l) => {
            const len = Math.round(lattenRichting === 'horizontaal' ? l.width : l.height);
            const cx = sx(l.x + l.width / 2);
            const ty = sy(l.y + l.height) - 3;
            if (l.width * scale < 14) return null;
            return (
              <text key={`dim-${l.id}`}
                x={cx} y={ty}
                textAnchor="middle" fontSize={FONT_LBL} fill="#92400e"
                fontFamily="Arial, sans-serif" fontWeight="600"
              >{len}</text>
            );
          })}

          {yBreaks.map((y, i) => (
            drawingType !== 'achterconstructie' &&
            <line key={i} x1={OX - 8} y1={sy(y)} x2={OX + W} y2={sy(y)} stroke={dimColor} strokeWidth={0.3} strokeDasharray="3,3" opacity={0.5} />
          ))}

          {drawingType !== 'achterconstructie' && yBreaks.length >= 2 && yBreaks.slice(0, -1).map((y, i) => {
            const y2 = yBreaks[i + 1];
            const span = y2 - y;
            if (span < 1) return null;
            return <DimV key={i} x={dimVSpanX} y1={sy(y2)} y2={sy(y)} label={`${mm(span)}`} color={dimColor} side="left" />;
          })}

          {yBreaks.length >= 2 && (
            <DimV x={dimVTotalX} y1={sy(viewYEnd)} y2={sy(viewYStart)} label={`TOTAAL ${mm(viewH_mm)}`} color="#dc2626" side="left" />
          )}

          {latYs.map((cy, i) => (
            <line key={i} x1={OX} y1={sy(cy)} x2={OX + W + 20} y2={sy(cy)} stroke="#92400e" strokeWidth={0.6} strokeDasharray="5,3" opacity={0.7} />
          ))}

          <line x1={peilLineX} y1={OY} x2={peilLineX} y2={OY + H} stroke="#334155" strokeWidth={0.8} />
          {(() => {
            const MIN_GAP = 14;
            const allPts = [
              ...yBreaks.map(y => ({ y, kind: 'peil' })),
              ...latYs.map(y => ({ y, kind: 'lat' })),
            ].sort((a, b) => a.y - b.y);
            let lastLabelY = -Infinity;
            return allPts.map(({ y, kind }, i) => {
              const absH = (peilmatenBase + y) / 1000;
              const screenY = sy(y);
              const isLat = kind === 'lat';
              const showLabel = lastLabelY === -Infinity || Math.abs(screenY - lastLabelY) >= MIN_GAP;
              if (showLabel) lastLabelY = screenY;
              return (
                <g key={`${kind}-${i}`}>
                  <line
                    x1={peilLineX - (isLat ? 6 : 4)} y1={screenY}
                    x2={peilLineX + (isLat ? 6 : 4)} y2={screenY}
                    stroke={isLat ? '#92400e' : '#334155'} strokeWidth={0.8}
                  />
                  {showLabel && (
                    <text
                      x={peilLineX - 8} y={screenY + 3}
                      textAnchor="end" fontSize={FONT_DIM}
                      fill={isLat ? '#92400e' : '#334155'}
                      fontFamily="Arial, sans-serif"
                    >
                      {absH.toFixed(3)}
                    </text>
                  )}
                </g>
              );
            });
          })()}



          <text x={peilLineX} y={OY - 6} textAnchor="middle" fontSize={FONT_LBL} fill="#334155" fontFamily="Arial, sans-serif">PEILMATEN (m)</text>

          <g transform={`translate(${OX},${svgTotal - LEGEND_H + 4})`}>
            {drawingType === 'plaatsing' && <>
              <rect x={0} y={0} width={12} height={8} fill={panelColor} stroke={dimColor} strokeWidth={0.5} />
              <text x={15} y={7} fontSize={FONT_LBL} fill="#334155" fontFamily="Arial, sans-serif">Paneel</text>
            </>}
            {drawingType === 'achterconstructie' && <>
              <rect x={0} y={0} width={12} height={8} fill={latColor} stroke="#92400e" strokeWidth={0.5} />
              <text x={15} y={7} fontSize={FONT_LBL} fill="#334155" fontFamily="Arial, sans-serif">Houten lat</text>
              <line x1={60} y1={4} x2={80} y2={4} stroke="#92400e" strokeWidth={0.8} strokeDasharray="4,2" />
              <text x={83} y={7} fontSize={FONT_LBL} fill="#334155" fontFamily="Arial, sans-serif">Hart lat</text>
            </>}
            <rect x={130} y={0} width={12} height={8} fill={openColor} fillOpacity={0.5} stroke="#dc2626" strokeWidth={0.5} strokeDasharray="2,1" />
            <text x={145} y={7} fontSize={FONT_LBL} fill="#334155" fontFamily="Arial, sans-serif">Opening (raam/deur)</text>
          </g>
        </svg>}

        {drawingType !== 'productie' && drawingType !== 'zaaglijst' && drawingType !== 'maltekening' && (() => {
          const bx = PAD_LEFT;
          const bw = VIEW_W - PAD_LEFT - PAD_RIGHT;
          const summaryItems = [];

          if (drawingType === 'achterconstructie' && summaryBoxH > 0) {
            const lw = 260;
            summaryItems.push(
              <g key="latten">
                <rect x={bx} y={0} width={lw} height={summaryBoxH} fill="#fff" stroke="#000" strokeWidth={1} />
                <text x={bx + SUMMARY_PAD} y={SUMMARY_PAD + SUMMARY_LINE_H - 2}
                  fontSize={10} fontWeight="bold" fill="#000" fontFamily="Arial, sans-serif">
                  Latten samenvatting ({lattenRichting})
                </text>
                <line x1={bx} y1={SUMMARY_PAD + SUMMARY_LINE_H + 2} x2={bx + lw} y2={SUMMARY_PAD + SUMMARY_LINE_H + 2} stroke="#000" strokeWidth={0.5} />
                {lattenSummary.map(({ len, cnt }, i) => (
                  <text key={i} x={bx + SUMMARY_PAD} y={SUMMARY_PAD + (i + 2) * SUMMARY_LINE_H + 2}
                    fontSize={10} fill="#000" fontFamily="Arial, sans-serif">
                    {cnt}× {len} mm
                  </text>
                ))}
              </g>
            );
          }

          if (drawingType === 'plaatsing' && zonePanels.length > 0) {
            const sizeGroups = {};
            for (const p of zonePanels) {
              const key = `${mm(p.width)}×${mm(p.height)}`;
              sizeGroups[key] = (sizeGroups[key] ?? 0) + 1;
            }
            const lines = Object.entries(sizeGroups).sort((a, b) => b[1] - a[1]);
            const bh = (lines.length + 2) * SUMMARY_LINE_H + SUMMARY_PAD * 2;
            const pw = 320;
            summaryItems.push(
              <g key="panelen">
                <rect x={bx} y={0} width={pw} height={bh} fill="#fff" stroke="#000" strokeWidth={1} />
                <text x={bx + SUMMARY_PAD} y={SUMMARY_PAD + SUMMARY_LINE_H - 2}
                  fontSize={9} fontWeight="bold" fill="#000" fontFamily="Arial, sans-serif">
                  Panelen{selectedZone ? ` ${selectedZone.label}` : ''} — totaal {zonePanels.length} st.
                </text>
                <line x1={bx} y1={SUMMARY_PAD + SUMMARY_LINE_H + 2} x2={bx + pw} y2={SUMMARY_PAD + SUMMARY_LINE_H + 2} stroke="#000" strokeWidth={0.5} />
                {lines.map(([key, cnt], i) => (
                  <text key={i} x={bx + SUMMARY_PAD} y={SUMMARY_PAD + (i + 2) * SUMMARY_LINE_H + 2}
                    fontSize={9} fill="#000" fontFamily="Arial, sans-serif">
                    {cnt}× {key} mm
                  </text>
                ))}
              </g>
            );
          }

          if (!summaryItems.length) return null;
          const totalSummaryH = Math.max(summaryBoxH, 120);
          return (
            <svg ref={summarySvgRef} width={VIEW_W} height={totalSummaryH + 32}
              viewBox={`0 0 ${VIEW_W} ${totalSummaryH + 32}`}
              style={{ background: '#fff', display: 'block', marginTop: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.10)', borderTop: '2px solid #e2e8f0' }}
              xmlns="http://www.w3.org/2000/svg">
              <rect x={0} y={0} width={VIEW_W} height={totalSummaryH + 32} fill="#fff" />
              <text x={bx} y={18} fontSize={9} fill="#64748b" fontFamily="Arial, sans-serif" fontStyle="italic">
                {groupName ?? 'Groep'} — Hoeveelheden (pagina 2)
              </text>
              <g transform="translate(0,24)">{summaryItems}</g>
            </svg>
          );
        })()}
      </div>
    </div>
  );
}
