import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { buildFullGroupFacadePattern, getOpeningPoly } from './lib/pattern.js';
import { buildFacadeZones, panelizeZone, generateBattenPositions, computeEffectiveBasePanel } from './lib/panelization.js';
import { brickColor, isTooSmall, polyXRangesAtY } from './lib/geometry.js';

function hexToRgba(hex, alpha = 1) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function pickGridStep(scale) {
  const pixelsPerMm = scale * 0.001;
  if (pixelsPerMm < 0.005) return 0;
  const targets = [10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10];
  for (const s of targets) {
    if (s * pixelsPerMm >= 40) return s;
  }
  return 0;
}

export function View2D({ walls, groupSettings, maxHoogte, startLijn, penantFaceData, groupColor, zetwerk, panelen, latten, layerVisibility, gridLines = [], showCenterLines = false, zoneSettings = [], stripZones = [], onStripZonesChange }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [redrawTick, setRedrawTick] = useState(0);

  const transform = useRef({ scale: 1, tx: 0, ty: 0 });
  const dragStart = useRef(null);
  const [drawMode, setDrawMode] = useState(false);
  const drawStartRef = useRef(null);
  const [drawingRect, setDrawingRect] = useState(null);
  const [selectedZoneId, setSelectedZoneId] = useState(null);

  const mat = groupSettings?.material ?? { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
  const verband = groupSettings?.verband ?? 'halfsteens';
  const color = groupSettings?.color ?? '#a64033';

  const facadeData = useMemo(() => {
    if (!walls?.length) return null;
    const result = buildFullGroupFacadePattern(walls, mat, verband, maxHoogte, zetwerk, null, startLijn);
    return result;
  }, [walls, mat, verband, maxHoogte, startLijn, zetwerk]);

  const PENANT_PANEL_INSET = 20;

  const allPanels = useMemo(() => {
    if (!facadeData || !panelen?.enabled) return [];
    const { rows, groupWidth, groupHeight, groupOpenings } = facadeData;
    const basePanel = computeEffectiveBasePanel(panelen, mat.brickWeightM2 ?? 40, mat);
    const maxInterval = Math.max(50, latten?.maxInterval ?? 400);
    const lintHalf = (mat.lint ?? 12) / 2;
    const zwExpV = zetwerk?.enabled ? Math.max(0, zetwerk.offsetV ?? 0) + Math.max(1, zetwerk.breedte ?? 50) : 0;
    const clampToGroup = (y) => Math.min(groupHeight, Math.max(0, y));
    const allRowYsSorted = (rows ?? []).map((r) => r.y).sort((a, b) => a - b);
    const snapToRowY = (y) => {
      if (!allRowYsSorted.length) return y;
      const target = y + lintHalf;
      return allRowYsSorted.reduce((best, ry) => Math.abs(ry - target) < Math.abs(best - target) ? ry : best);
    };
    const baseBattenYs = generateBattenPositions(groupHeight, mat, maxInterval, { minHOH: latten?.minHOH, maxHOH: latten?.maxHOH, targetPanelH: panelen?.hoogte, minPanelH: 800 });
    const battenYs = baseBattenYs.map(snapToRowY);
    const openingsForZones = groupOpenings.map((op) => ({ id: `op_${op.x}_${op.y}`, x: op.x, y: op.y, width: op.width, height: op.height, polyPts: op.polyPts ?? null }));
    const penantOpenings = (groupSettings?.penanten ?? []).map((p, i) => {
      const px = (p.x ?? 0) + PENANT_PANEL_INSET;
      const pw = Math.max(1, p.breedte ?? 400) - 2 * PENANT_PANEL_INSET;
      if (pw <= 0) return null;
      return { id: `pen_${i}`, x: px, y: 0, width: pw, height: groupHeight, polyPts: null };
    }).filter(Boolean);
    const zones = buildFacadeZones(groupWidth, groupHeight, [...openingsForZones, ...penantOpenings]);
    let panels = [];
    for (const zone of zones) {
      const result = panelizeZone(zone, battenYs, basePanel, allRowYsSorted.length ? snapToRowY : null, mat, verband);
      if (result.ok) panels.push(...result.panels);
    }
    if (groupOpenings.length > 0) {
      panels = panels.map((panel) => {
        for (const op of groupOpenings) {
          const opTop = op.y + op.height;
          if (panel.y >= opTop) {
            const latBottom = Math.round(clampToGroup(opTop));
            const firstAbove = allRowYsSorted.find((ry) => ry >= latBottom - 0.5);
            if (firstAbove != null && panel.y < firstAbove) {
              const newH = panel.y + panel.height - firstAbove;
              if (newH <= 0) return null;
              return { ...panel, y: firstAbove, height: newH };
            }
          }
        }
        return panel;
      }).filter(Boolean);
    }
    if (zetwerk?.enabled && groupOpenings.length > 0) {
      const CLEARANCE = 10;
      const sideExpand = (zetwerk.offsetH ?? 0) + (zetwerk.breedte ?? 50) + CLEARANCE;
      panels = panels.map((panel) => {
        let { x, width } = panel;
        for (const op of groupOpenings) {
          if (panel.y + panel.height <= op.y || panel.y >= op.y + op.height) continue;
          if (x < op.x && x + width > op.x - sideExpand) width = Math.max(0, op.x - sideExpand - x);
          if (x >= op.x + op.width && x < op.x + op.width + sideExpand) {
            const newX = op.x + op.width + sideExpand;
            width = Math.max(0, x + width - newX);
            x = newX;
          }
        }
        if (width <= 0) return null;
        return { ...panel, x, width };
      }).filter(Boolean);
    }
    panels = panels.filter((panel) => panel.height >= 200 && panel.width >= 10);
    const rowH = verband === 'staand_tegelverband' ? mat.steenL : mat.steenH;
    panels = panels.filter((panel) => {
      for (const row of (rows ?? [])) {
        if (!row?.pieces?.length) continue;
        if (row.y + rowH <= panel.y || row.y >= panel.y + panel.height) continue;
        for (const piece of row.pieces) {
          const s = Math.max(piece.start, panel.x);
          const e = Math.min(piece.start + piece.length, panel.x + panel.width);
          if (e - s > 1) return true;
        }
      }
      return false;
    });
    if (startLijn != null && startLijn < 0 && panels.length > 0) {
      const minY = Math.min(...panels.map((p) => p.y));
      if (minY === 0) {
        return panels.map((p) => p.y === 0 ? { ...p, y: startLijn, height: p.height - startLijn } : p);
      }
    }
    return panels;
  }, [facadeData, panelen, latten, mat, groupSettings, startLijn, zetwerk]);

  const allLatten = useMemo(() => {
    if (!facadeData || !latten?.enabled) return [];
    const { groupWidth, groupHeight, groupOpenings } = facadeData;
    const richting = latten.richting ?? 'horizontaal';
    const latBreedte = Math.max(5, latten.breedte ?? 50);

    if (richting === 'horizontaal') {
      const maxInterval = Math.max(50, latten.maxInterval ?? 400);
      const battenYs2d = generateBattenPositions(groupHeight, mat, maxInterval, { minHOH: latten?.minHOH, maxHOH: latten?.maxHOH, targetPanelH: panelen?.hoogte, minPanelH: 800 });
      const gH = Math.round(groupHeight);
      const lintHalf = Math.round((mat.lint ?? 12) / 2);
      const brickTopsSet2d = new Set();
      if (facadeData?.rows) {
        for (const row of facadeData.rows) brickTopsSet2d.add(Math.round(row.y + mat.steenH));
      }
      const minH = Math.max(0, Math.round(startLijn ?? 0));
      const startLijnN = Math.round(startLijn ?? 0);
      const zwExpV = (zetwerk?.enabled) ? Math.max(0, (zetwerk.offsetV ?? 0)) + Math.max(1, zetwerk.breedte ?? 50) : 0;
      const clampY = (y) => Math.min(gH, Math.max(0, y));
      const allRowYsSorted = (facadeData?.rows ?? []).map(r => r.y).sort((a, b) => a - b);

      const allYs = new Set([minH, gH, ...battenYs2d.map(y => clampY(Math.round(y)))]);

      const result = [];
      let idx = 0;
      for (const yr of [...allYs].filter(y => y >= minH && y <= gH).sort((a, b) => a - b)) {
        let latY;
        if (yr === minH) latY = minH;
        else if (yr === gH) latY = yr - latBreedte;
        else if (brickTopsSet2d.has(yr)) latY = Math.round(yr + lintHalf - latBreedte / 2);
        else latY = Math.round(yr - lintHalf - latBreedte / 2);
        result.push({ id: `lat-h-${idx++}`, richting: 'horizontaal', x: 0, y: latY, width: groupWidth, height: latBreedte, forced: yr === minH || yr === gH });
      }
      if (startLijnN < 0) {
        result.push({ id: `lat-h-${idx++}`, richting: 'horizontaal', x: 0, y: startLijnN, width: groupWidth, height: latBreedte, forced: true });
      }
      const getOpXW = (op, y) => {
        if (op.polyPts?.length >= 3) {
          const ranges = polyXRangesAtY(op.polyPts, y);
          if (ranges.length) return { x: ranges[0][0], width: ranges[ranges.length - 1][1] - ranges[0][0] };
        }
        return { x: op.x, width: op.width };
      };
      for (const op of groupOpenings) {
        const belowLatY = Math.round(clampY(op.y - zwExpV)) - latBreedte;
        const rawAbove = Math.round(clampY(op.y + op.height + zwExpV));
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

      if (zetwerk?.enabled && groupOpenings.length > 0) {
        const CLEARANCE = 10;
        const sideExpand = (zetwerk.offsetH ?? 0) + (zetwerk.breedte ?? 50) + CLEARANCE;
        const vertExpand = (zetwerk.offsetV ?? 0) + (zetwerk.breedte ?? 50) + (zetwerk.stripOffset ?? 5);
        const clipped = [];
        for (const lat of result) {
          const latMidY = lat.y + lat.height / 2;
          const relevant = groupOpenings.filter(
            (op) => latMidY >= op.y - vertExpand && latMidY <= op.y + op.height + vertExpand
          );
          if (relevant.length === 0 || lat.openingForced) { clipped.push(lat); continue; }
          let segments = [{ start: lat.x, end: lat.x + lat.width }];
          for (const op of relevant) {
            const exFrom = op.x - sideExpand;
            const exTo = op.x + op.width + sideExpand;
            const next = [];
            for (const seg of segments) {
              if (seg.end <= exFrom || seg.start >= exTo) { next.push(seg); continue; }
              if (seg.start < exFrom) next.push({ start: seg.start, end: exFrom });
              if (seg.end > exTo) next.push({ start: exTo, end: seg.end });
            }
            segments = next;
          }
          let si = 0;
          for (const seg of segments) {
            const w = seg.end - seg.start;
            if (w > 0.5) clipped.push({ ...lat, id: `${lat.id}-s${si++}`, x: seg.start, width: w });
          }
        }
        return clipped;
      }

      return result;
    } else {
      const xPositions = new Set();
      xPositions.add(0);
      xPositions.add(groupWidth);
      for (const panel of allPanels) {
        xPositions.add(Math.round(panel.x));
        xPositions.add(Math.round(panel.x + panel.width / 2));
        xPositions.add(Math.round(panel.x + panel.width));
      }
      return [...xPositions]
        .sort((a, b) => a - b)
        .map((x, idx) => ({
          id: `lat-v-${idx}`,
          richting: 'verticaal',
          x: x - latBreedte / 2,
          y: 0,
          width: latBreedte,
          height: groupHeight,
          forced: false,
        }));
    }
  }, [facadeData, latten, allPanels, mat, zetwerk, startLijn, panelen]);

  const zonePatterns = useMemo(() => {
    if (!walls?.length || !facadeData) return [];
    const sortedPenants = [...(groupSettings?.penanten ?? [])].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
    if (sortedPenants.length < 1) return [];
    const numZones = sortedPenants.length + 1;
    const facadeWidth = facadeData.groupWidth ?? 0;
    const result = [];
    for (let zi = 0; zi < numZones; zi++) {
      const zs = zoneSettings[zi];
      if (!zs?.enabled) { result.push(null); continue; }
      const brickD2d = groupSettings?.brickDepth ?? 20;
      const zX1Raw = zi === 0 ? 0 : (sortedPenants[zi - 1].x ?? 0) + Math.max(1, sortedPenants[zi - 1].breedte ?? 400);
      const zX2Raw = zi === numZones - 1 ? facadeWidth : (sortedPenants[zi].x ?? 0);
      const zoneX1 = zi === 0 ? zX1Raw : zX1Raw - brickD2d;
      const zoneX2 = zi === numZones - 1 ? zX2Raw : zX2Raw + brickD2d;
      if (zoneX2 <= zoneX1) { result.push(null); continue; }
      const zoneMat = zs.material ?? mat;
      const zoneVerband = zs.verband ?? verband;
      const zoneMaxHoogte = zs.maxHoogte ?? maxHoogte;
      const patternData = buildFullGroupFacadePattern(walls, zoneMat, zoneVerband, zoneMaxHoogte, zetwerk, null, startLijn);
      result.push(patternData ? { patternData, zoneX1, zoneX2, color: zs.color ?? groupColor, zoneMat, zoneVerband } : null);
    }
    return result;
  }, [walls, facadeData, groupSettings, zoneSettings, mat, verband, maxHoogte, startLijn, zetwerk, groupColor]);

  const bounds = useMemo(() => {
    if (!facadeData) return { minX: 0, maxX: 1000, minY: 0, maxY: 1000 };
    return { minX: 0, maxX: facadeData.groupWidth, minY: Math.min(0, startLijn ?? 0), maxY: facadeData.groupHeight };
  }, [facadeData, startLijn]);

  const fitToView = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.width || !canvas.height) return;
    const W = size.w;
    const H = size.h;
    const PAD = 32;
    const bw = bounds.maxX - bounds.minX || 1;
    const bh = bounds.maxY - bounds.minY || 1;
    const scale = Math.min((W - PAD * 2) / bw, (H - PAD * 2) / bh) * 1000;
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    transform.current = {
      scale,
      tx: W / 2 - cx * scale * 0.001,
      ty: H / 2 + cy * scale * 0.001,
    };
    setRedrawTick((n) => n + 1);
  }, [bounds, size]);

  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: Math.floor(width) || 800, h: Math.floor(height) || 600 });
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => { fitToView(); }, [fitToView, size]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d');
    const W = size.w;
    const H = size.h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { scale, tx, ty } = transform.current;

    const toScreen = (vX, vY) => [
      vX * scale * 0.001 + tx,
      ty - vY * scale * 0.001,
    ];

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 0.5;
    const gridStepMm = pickGridStep(scale);
    if (gridStepMm > 0) {
      const startX = Math.floor(bounds.minX / gridStepMm) * gridStepMm;
      const startY = Math.floor(bounds.minY / gridStepMm) * gridStepMm;
      for (let x = startX; x <= bounds.maxX + gridStepMm; x += gridStepMm) {
        const [sx] = toScreen(x, 0);
        if (sx < 0 || sx > W) continue;
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
      }
      for (let y = startY; y <= bounds.maxY + gridStepMm; y += gridStepMm) {
        const [, sy] = toScreen(0, y);
        if (sy < 0 || sy > H) continue;
        ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
      }
    }

    if (!facadeData) {
      ctx.fillStyle = '#64748b';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Geen groep geselecteerd', W / 2, H / 2);
      return;
    }

    const { rows, groupWidth, groupHeight, groupOpenings, zetwerkParams, patternStartH = 0 } = facadeData;
    const steenH = mat.steenH;
    const kopMM = Math.round((mat.steenL - mat.stoot) / 2);

    const [faceSx, faceSy] = toScreen(0, groupHeight);
    const faceW = groupWidth * scale * 0.001;
    const faceH = groupHeight * scale * 0.001;

    // Compute wall polygon shapes in group-local coords (group origin = bottom-left of bounding box)
    const groupMinL = walls?.length ? Math.min(...walls.map(w => w.wallOrigin?.lengthStart ?? 0)) : 0;
    const groupMinH = walls?.length ? Math.min(...walls.map(w => w.wallOrigin?.heightStart ?? 0)) : 0;
    const rawWallPolys = (walls ?? []).map(w => {
      if (!w.facadePoly || w.facadePoly.length < 3) return null;
      const offL = (w.wallOrigin?.lengthStart ?? 0) - groupMinL;
      const offH = (w.wallOrigin?.heightStart ?? 0) - groupMinH;
      return w.facadePoly.map(pt => ({ l: pt.l + offL, h: pt.h + offH }));
    }).filter(Boolean);
    const wallGroupPolys = rawWallPolys.length
      ? [[ { l: 0, h: 0 }, { l: groupWidth, h: 0 }, { l: groupWidth, h: groupHeight }, { l: 0, h: groupHeight } ]]
      : [];
    const hasWallPolys = wallGroupPolys.length > 0;

    // Helper: trace facade outline path (union of wall polygons, or full rect as fallback)
    const traceFacadePath = () => {
      if (hasWallPolys) {
        for (const poly of wallGroupPolys) {
          const pts = poly.map(pt => toScreen(pt.l, pt.h));
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
          ctx.closePath();
        }
      } else {
        ctx.rect(faceSx - 1, faceSy - 1, faceW + 2, faceH + 2);
      }
    };

    // Draw facade background using actual wall shapes
    ctx.fillStyle = hexToRgba(color, 0.15);
    ctx.fillRect(faceSx, faceSy, faceW, faceH);
    if (hasWallPolys) {
      ctx.beginPath();
      traceFacadePath();
      ctx.fill();
    }

    const applyOpeningExclusionClip = () => {
      ctx.beginPath();
      traceFacadePath();
      if (startLijn != null && startLijn < 0) {
        const [bx, byPeil] = toScreen(0, 0);
        const [, byStart] = toScreen(0, startLijn);
        ctx.rect(bx - 1, byPeil, faceW + 2, byStart - byPeil + 1);
      }
      for (const op of groupOpenings) {
        const poly = getOpeningPoly(op);
        const pts = poly.map((p) => toScreen(p.l, p.h));
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
        ctx.closePath();
      }
      ctx.clip('evenodd');
    };

    const vis = layerVisibility ?? {};

    if (allLatten.length && vis.latten !== false) {
      ctx.save();
      applyOpeningExclusionClip();
      for (const lat of allLatten) {
        const [lSx, lSy] = toScreen(lat.x, lat.y + lat.height);
        const lSw = lat.width * scale * 0.001;
        const lSh = lat.height * scale * 0.001;
        ctx.fillStyle = lat.forced ? 'rgba(180,120,50,0.55)' : 'rgba(180,120,50,0.35)';
        ctx.fillRect(lSx, lSy, lSw, Math.max(lSh, 1));
        ctx.strokeStyle = lat.forced ? '#92400e' : '#b45309';
        ctx.lineWidth = lat.forced ? 1 : 0.5;
        ctx.strokeRect(lSx, lSy, lSw, Math.max(lSh, 1));
      }
      ctx.restore();
    }

    if (allPanels.length && vis.panelen !== false) {
      ctx.save();
      applyOpeningExclusionClip();
      const panelColors = ['rgba(203,213,225,0.45)', 'rgba(186,230,253,0.45)'];
      allPanels.forEach((panel, i) => {
        const [pSx, pSy] = toScreen(panel.x, panel.y + panel.height);
        const pSw = panel.width * scale * 0.001;
        const pSh = panel.height * scale * 0.001;
        ctx.fillStyle = panelColors[i % 2];
        ctx.fillRect(pSx, pSy, pSw, pSh);
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        ctx.strokeRect(pSx, pSy, pSw, pSh);
        if (pSw > 24 && pSh > 14) {
          ctx.font = '8px system-ui, sans-serif';
          ctx.fillStyle = '#64748b';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${Math.round(panel.width)}×${Math.round(panel.height)}`, pSx + pSw / 2, pSy + pSh / 2);
        }
      });
      ctx.restore();
    }

    if (vis.strips !== false) {
      const isTegel = verband === 'staand_tegelverband';
      const stripH = isTegel ? mat.steenL : steenH;
      const hasZones = stripZones.length > 0;
      ctx.save();
      ctx.beginPath();
      ctx.rect(faceSx - 1, faceSy - 1, faceW + 2, faceH + 2);
      if (startLijn != null && startLijn < 0) {
        const [bx, byPeil] = toScreen(0, 0);
        const [, byStart] = toScreen(0, startLijn);
        ctx.rect(bx - 1, byPeil, faceW + 2, byStart - byPeil + 1);
      }
      ctx.clip();
      if (hasZones) {
        ctx.beginPath();
        for (const sz of stripZones) {
          const [szSx, szSy] = toScreen(sz.x, sz.y + sz.height);
          const szSw = sz.width * scale * 0.001;
          const szSh = sz.height * scale * 0.001;
          ctx.rect(szSx, szSy, szSw, szSh);
        }
        ctx.clip();
      }
      const tooSmallPieces = [];
      for (const row of rows) {
        const clippedTop = Math.min(row.y + stripH, groupHeight);
        const clippedBottom = Math.max(row.y, patternStartH);
        const actualH = clippedTop - clippedBottom;
        if (actualH <= 0) continue;
        const [, rowSy] = toScreen(0, clippedTop);
        const rowSh = actualH * scale * 0.001;
        for (const piece of row.pieces) {
          const [pSx] = toScreen(piece.start, 0);
          const pSw = piece.length * scale * 0.001;
          ctx.fillStyle = brickColor(piece.label, color, piece.length, kopMM);
          ctx.fillRect(pSx + 0.5, rowSy + 0.5, Math.max(pSw - 1, 1), Math.max(rowSh - 1, 1));
          if (isTooSmall(piece.label, piece.length, kopMM)) {
            tooSmallPieces.push({ pSx, rowSy, pSw, rowSh });
          }
        }
      }
      if (tooSmallPieces.length > 0) {
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const { pSx, rowSy, pSw, rowSh } of tooSmallPieces) {
          const fontSize = Math.min(rowSh * 0.75, pSw * 1.2, 10);
          if (fontSize < 3) continue;
          ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
          ctx.fillText('!', pSx + pSw / 2, rowSy + rowSh / 2);
        }
      }
      ctx.restore();

      for (const zp of zonePatterns) {
        if (!zp) continue;
        const { patternData: zPat, zoneX1, zoneX2, color: zColor, zoneMat: zMat, zoneVerband: zVerband } = zp;
        const [sx1z] = toScreen(zoneX1, 0);
        const [sx2z] = toScreen(zoneX2, 0);
        const zW = sx2z - sx1z;
        if (zW <= 0) continue;
        const isTZ = zVerband === 'staand_tegelverband';
        const zStripH = isTZ ? zMat.steenL : zMat.steenH;
        ctx.save();
        ctx.beginPath();
        ctx.rect(sx1z, faceSy, zW, faceH);
        ctx.clip();
        ctx.fillStyle = hexToRgba(zColor, 0.15);
        ctx.fillRect(sx1z, faceSy, zW, faceH);
        for (const row of zPat.rows) {
          const zClippedTop = Math.min(row.y + zStripH, groupHeight);
          const zActualH = zClippedTop - row.y;
          if (zActualH <= 0) continue;
          const [, rowSy] = toScreen(0, zClippedTop);
          const rowSh = zActualH * scale * 0.001;
          const zKop = Math.round((zMat.steenL - zMat.stoot) / 2);
          for (const piece of row.pieces) {
            const pEnd = piece.start + piece.length;
            if (pEnd <= zoneX1 || piece.start >= zoneX2) continue;
            const [pSx] = toScreen(Math.max(piece.start, zoneX1), 0);
            const [pEx] = toScreen(Math.min(pEnd, zoneX2), 0);
            const pSw = pEx - pSx;
            ctx.fillStyle = brickColor(piece.label, zColor, piece.length, zKop);
            ctx.fillRect(pSx + 0.5, rowSy + 0.5, Math.max(pSw - 1, 1), Math.max(rowSh - 1, 1));
            if (isTooSmall(piece.label, piece.length, zKop)) {
              const fontSize = Math.min(rowSh * 0.75, pSw * 1.2, 10);
              if (fontSize >= 3) { ctx.fillStyle = '#ffffff'; ctx.font = `bold ${fontSize}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', pSx + pSw / 2, rowSy + rowSh / 2); }
            }
          }
        }
        ctx.restore();
      }
    }

    for (const op of groupOpenings) {
      const [opSx, opSy] = toScreen(op.x, op.y + op.height);
      const opSw = op.width * scale * 0.001;
      const opSh = op.height * scale * 0.001;

      const poly = getOpeningPoly(op);
      const pts = poly.map((p) => toScreen(p.l, p.h));
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.clip();
      ctx.clearRect(opSx - 2, opSy - 2, opSw + 4, opSh + 4);
      ctx.fillStyle = 'rgba(147,197,253,0.18)';
      ctx.fillRect(opSx - 2, opSy - 2, opSw + 4, opSh + 4);
      ctx.restore();
      ctx.strokeStyle = '#93c5fd';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.stroke();

      if (opSw > 20) {
        const labelY = opSy - 2;
        ctx.font = '9px system-ui, sans-serif';
        ctx.fillStyle = '#7dd3fc';
        ctx.textBaseline = 'bottom';
        ctx.textAlign = 'left';
        ctx.fillText(`${Math.round(op.x)}`, opSx + 2, labelY);
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(op.x + op.width)}`, opSx + opSw - 2, labelY);
      }
    }

    if (zetwerkParams && vis.zetwerk !== false) {
      const { breedte: zwB, offsetH: zwH, offsetV: zwV } = zetwerkParams;
      for (const op of groupOpenings) {
        const zbPx = zwB * scale * 0.001;
        const zohPx = zwH * scale * 0.001;

        const expandPx = zohPx + zbPx;
        const poly = getOpeningPoly(op);
        const pts = poly.map((p) => toScreen(p.l, p.h));

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
        ctx.closePath();
        ctx.clip('evenodd');

        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(148,163,184,0.85)';
        ctx.lineWidth = expandPx * 2;
        ctx.stroke();

        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 0.5;
        ctx.stroke();
        ctx.restore();
      }
    }

    if (penantFaceData?.length) {
      for (const { penant: p, front, left: leftSideRows = [], right: rightSideRows = [], height: pH, panelDepthL: penPanelDepthL, panelDepthR: penPanelDepthR, pDL: penDL, pDR: penDR } of penantFaceData) {
        const pX = p.x ?? 0;
        const pB = Math.max(1, p.breedte ?? 400);
        const pDL = Math.max(1, penDL ?? p.diepteLinks ?? p.diepte ?? 150);
        const pDR = Math.max(1, penDR ?? p.diepteRechts ?? p.diepte ?? 150);
        const baseVY = 0;

        const [sx, baseY] = toScreen(pX, baseVY + pH);
        const [ex] = toScreen(pX + pB, 0);
        const [, bottomY] = toScreen(0, baseVY);
        const pW = ex - sx;
        const pHpx = bottomY - baseY;
        const depthPxR = Math.min(pDR * scale * 0.001, 30);
        const depthPxL = Math.min(pDL * scale * 0.001, 30);

        ctx.fillStyle = 'rgba(99,102,241,0.15)';
        ctx.fillRect(sx, baseY, pW, pHpx);

        ctx.fillStyle = 'rgba(99,102,241,0.25)';
        ctx.beginPath();
        ctx.moveTo(sx + pW, baseY);
        ctx.lineTo(sx + pW + depthPxR, baseY - depthPxR);
        ctx.lineTo(sx + pW + depthPxR, bottomY - depthPxR);
        ctx.lineTo(sx + pW, bottomY);
        ctx.closePath();
        ctx.fill();

        if (rightSideRows.length) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(sx + pW, baseY);
          ctx.lineTo(sx + pW + depthPxR, baseY - depthPxR);
          ctx.lineTo(sx + pW + depthPxR, bottomY - depthPxR);
          ctx.lineTo(sx + pW, bottomY);
          ctx.closePath();
          ctx.clip();
          const col = groupColor ?? '#a64033';
          for (const row of rightSideRows) {
            for (const piece of row.pieces) {
              const dm = piece.start;
              const l = piece.length;
              const dFracL = Math.max(0, Math.min(1, (pDR - dm - l) / pDR));
              const dFracR = Math.max(0, Math.min(1, (pDR - dm) / pDR));
              const topFrac = (pH - row.y - steenH) / pH;
              const botFrac = (pH - row.y) / pH;
              ctx.fillStyle = brickColor(piece.label, col, piece.length, kopMM);
              ctx.beginPath();
              ctx.moveTo(sx + pW + dFracL * depthPxR, baseY + topFrac * pHpx - dFracL * depthPxR);
              ctx.lineTo(sx + pW + dFracR * depthPxR, baseY + topFrac * pHpx - dFracR * depthPxR);
              ctx.lineTo(sx + pW + dFracR * depthPxR, baseY + botFrac * pHpx - dFracR * depthPxR);
              ctx.lineTo(sx + pW + dFracL * depthPxR, baseY + botFrac * pHpx - dFracL * depthPxR);
              ctx.closePath();
              ctx.fill();
            }
          }
          ctx.restore();
        }

        ctx.fillStyle = 'rgba(99,102,241,0.25)';
        ctx.beginPath();
        ctx.moveTo(sx, baseY);
        ctx.lineTo(sx - depthPxL, baseY - depthPxL);
        ctx.lineTo(sx - depthPxL, bottomY - depthPxL);
        ctx.lineTo(sx, bottomY);
        ctx.closePath();
        ctx.fill();

        if (leftSideRows.length && (penPanelDepthL ?? 0) > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(sx, baseY);
          ctx.lineTo(sx - depthPxL, baseY - depthPxL);
          ctx.lineTo(sx - depthPxL, bottomY - depthPxL);
          ctx.lineTo(sx, bottomY);
          ctx.closePath();
          ctx.clip();
          const col = groupColor ?? '#a64033';
          for (const row of leftSideRows) {
            for (const piece of row.pieces) {
              const dFracFront = Math.max(0, Math.min(1, piece.start / penPanelDepthL));
              const dFracBack  = Math.max(0, Math.min(1, (piece.start + piece.length) / penPanelDepthL));
              const topFrac = (pH - row.y - steenH) / pH;
              const botFrac = (pH - row.y) / pH;
              ctx.fillStyle = brickColor(piece.label, col, piece.length, kopMM);
              ctx.beginPath();
              ctx.moveTo(sx - dFracFront * depthPxL, baseY + topFrac * pHpx - dFracFront * depthPxL);
              ctx.lineTo(sx - dFracBack  * depthPxL, baseY + topFrac * pHpx - dFracBack  * depthPxL);
              ctx.lineTo(sx - dFracBack  * depthPxL, baseY + botFrac * pHpx - dFracBack  * depthPxL);
              ctx.lineTo(sx - dFracFront * depthPxL, baseY + botFrac * pHpx - dFracFront * depthPxL);
              ctx.closePath();
              ctx.fill();
            }
          }
          ctx.restore();
        }

        ctx.fillStyle = 'rgba(99,102,241,0.2)';
        ctx.beginPath();
        ctx.moveTo(sx, baseY);
        ctx.lineTo(sx + depthPxL, baseY - depthPxL);
        ctx.lineTo(sx + pW + depthPxR, baseY - depthPxR);
        ctx.lineTo(sx + pW, baseY);
        ctx.closePath();
        ctx.fill();

        const col = groupColor ?? '#a64033';
        for (const row of front) {
          const [, rowTop] = toScreen(0, baseVY + row.y + steenH);
          const rowH = steenH * scale * 0.001;
          for (const piece of row.pieces) {
            const [px2] = toScreen(pX + piece.start, 0);
            const pw2 = piece.length * scale * 0.001;
            ctx.fillStyle = brickColor(piece.label, col, piece.length, kopMM);
            ctx.fillRect(px2 + 0.5, rowTop + 0.5, Math.max(pw2 - 1, 1), Math.max(rowH - 1, 1));
            if (isTooSmall(piece.label, piece.length, kopMM)) {
              const fontSize = Math.min(rowH * 0.75, pw2 * 1.2, 10);
              if (fontSize >= 3) { ctx.fillStyle = '#ffffff'; ctx.font = `bold ${fontSize}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', px2 + pw2 / 2, rowTop + rowH / 2); }
            }
          }
        }

        ctx.strokeStyle = '#4338ca';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx, baseY, pW, pHpx);

        ctx.fillStyle = '#4338ca';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('P', sx + pW / 2, baseY + Math.min(pHpx / 2, 14));
      }
    }

    if (maxHoogte != null && maxHoogte > 0) {
      const [, sy] = toScreen(0, maxHoogte);
      const [sx1] = toScreen(0, 0);
      const [sx2] = toScreen(groupWidth, 0);
      ctx.save();
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.moveTo(Math.max(0, sx1 - 20), sy);
      ctx.lineTo(Math.min(W, sx2 + 20), sy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#f97316';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`▲ max ${maxHoogte} mm`, Math.max(4, sx1), sy - 2);
      ctx.restore();
    }

    if (startLijn != null) {
      const [sx1] = toScreen(0, 0);
      const [sx2] = toScreen(groupWidth, 0);
      const [, sy] = toScreen(0, startLijn);
      ctx.save();
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.moveTo(Math.max(0, sx1 - 20), sy);
      ctx.lineTo(Math.min(W, sx2 + 20), sy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#a855f7';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`▼ startlijn ${startLijn} mm`, Math.max(4, sx1), sy + 2);
      ctx.restore();
    }

    if (patternStartH > 0) {
      const [, sy] = toScreen(0, patternStartH);
      const [sx1] = toScreen(0, 0);
      const [sx2] = toScreen(groupWidth, 0);
      ctx.save();
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.moveTo(Math.max(0, sx1 - 20), sy);
      ctx.lineTo(Math.min(W, sx2 + 20), sy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#22d3ee';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`▼ vanaf ${patternStartH} mm`, Math.max(4, sx1), sy + 2);
      ctx.restore();
    }

    {
      const [, sy] = toScreen(0, 0);
      const [sx1] = toScreen(0, 0);
      const [sx2] = toScreen(groupWidth, 0);
      ctx.save();
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(Math.max(0, sx1 - 30), sy);
      ctx.lineTo(Math.min(W, sx2 + 30), sy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#facc15';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('± 0 peilmaat', Math.max(4, sx1), sy - 2);
      ctx.restore();
    }

    if (penantFaceData?.length >= 1) {
      const sorted = [...penantFaceData].sort((a, b) => (a.penant.x ?? 0) - (b.penant.x ?? 0));
      const flatZones = [];
      const p0 = sorted[0].penant;
      const leftEnd = p0.x ?? 0;
      if (leftEnd > 1) flatZones.push({ x1: 0, x2: leftEnd });
      for (let i = 0; i < sorted.length - 1; i++) {
        const p1 = sorted[i].penant;
        const p2 = sorted[i + 1].penant;
        const x1 = (p1.x ?? 0) + Math.max(1, p1.breedte ?? 400);
        const x2 = p2.x ?? 0;
        if (x2 > x1 + 1) flatZones.push({ x1, x2 });
      }
      const pLast = sorted[sorted.length - 1].penant;
      const rightStart = (pLast.x ?? 0) + Math.max(1, pLast.breedte ?? 400);
      if (groupWidth - rightStart > 1) flatZones.push({ x1: rightStart, x2: groupWidth });

      for (let i = 0; i < flatZones.length; i++) {
        const { x1: zoneX1, x2: zoneX2 } = flatZones[i];
        const [sx1z] = toScreen(zoneX1, 0);
        const [sx2z] = toScreen(zoneX2, 0);
        const zW = sx2z - sx1z;
        ctx.save();
        ctx.fillStyle = 'rgba(234,179,8,0.12)';
        ctx.fillRect(sx1z, faceSy, zW, faceH);
        ctx.strokeStyle = 'rgba(234,179,8,0.7)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(sx1z, faceSy, zW, faceH);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(234,179,8,0.9)';
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const zLabel = `Zone ${i + 1}  (${Math.round(zoneX2 - zoneX1)} mm)`;
        const zlw = ctx.measureText(zLabel).width + 8;
        ctx.fillRect(sx1z + zW / 2 - zlw / 2, faceSy + 4, zlw, 16);
        ctx.fillStyle = '#000';
        ctx.fillText(zLabel, sx1z + zW / 2, faceSy + 6);
        ctx.restore();
      }
    }

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    ctx.strokeRect(faceSx, faceSy, faceW, faceH);

    // Strip zone overlays
    for (const sz of stripZones) {
      const [szSx, szSy] = toScreen(sz.x, sz.y + sz.height);
      const szSw = sz.width * scale * 0.001;
      const szSh = sz.height * scale * 0.001;
      const isSelected = sz.id === selectedZoneId;
      ctx.save();
      ctx.strokeStyle = isSelected ? '#f59e0b' : '#22d3ee';
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(szSx, szSy, szSw, szSh);
      ctx.fillStyle = isSelected ? 'rgba(245,158,11,0.08)' : 'rgba(34,211,238,0.06)';
      ctx.fillRect(szSx, szSy, szSw, szSh);
      ctx.setLineDash([]);
      if (szSw > 40 && szSh > 14) {
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.fillStyle = isSelected ? '#f59e0b' : '#22d3ee';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`${sz.label ?? sz.id}  ${Math.round(sz.width)}×${Math.round(sz.height)} mm`, szSx + 4, szSy + 4);
      }
      ctx.restore();
    }

    // In-progress drawing rect preview
    if (drawingRect && drawingRect.width > 0 && drawingRect.height > 0) {
      const [drSx, drSy] = toScreen(drawingRect.x, drawingRect.y + drawingRect.height);
      const drSw = drawingRect.width * scale * 0.001;
      const drSh = drawingRect.height * scale * 0.001;
      ctx.save();
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(drSx, drSy, drSw, drSh);
      ctx.fillStyle = 'rgba(34,211,238,0.12)';
      ctx.fillRect(drSx, drSy, drSw, drSh);
      ctx.setLineDash([]);
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillStyle = '#22d3ee';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(drawingRect.width)} × ${Math.round(drawingRect.height)} mm`, drSx + drSw / 2, drSy + drSh / 2);
      ctx.restore();
    }

    if (showCenterLines) {
      const withOrigin = walls.filter((w) => w.wallOrigin);
      const groupMinX = withOrigin.length ? Math.min(...withOrigin.map((w) => w.wallOrigin.lengthStart)) : 0;
      const sorted = [...withOrigin].sort((a, b) => a.wallOrigin.lengthStart - b.wallOrigin.lengthStart);
      const gapCenters = [];
      for (let i = 0; i < sorted.length - 1; i++) {
        const rightEdge = (sorted[i].wallOrigin.lengthStart - groupMinX) + sorted[i].length;
        const leftEdge  = sorted[i + 1].wallOrigin.lengthStart - groupMinX;
        if (leftEdge > rightEdge + 1) {
          gapCenters.push((rightEdge + leftEdge) / 2);
        }
      }
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(6,182,212,0.75)';
      ctx.fillStyle = 'rgba(6,182,212,0.9)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      for (const relCenter of gapCenters) {
        const [sx] = toScreen(relCenter, 0);
        ctx.beginPath();
        ctx.moveTo(sx, faceSy);
        ctx.lineTo(sx, faceSy + faceH);
        ctx.stroke();
        const xLabel = `${Math.round(relCenter)}`;
        const tw = ctx.measureText(xLabel).width + 6;
        ctx.fillRect(sx - tw / 2, faceSy + faceH + 2, tw, 14);
        ctx.fillStyle = '#fff';
        ctx.textBaseline = 'top';
        ctx.fillText(xLabel, sx, faceSy + faceH + 3);
        ctx.fillStyle = 'rgba(6,182,212,0.9)';
      }
      ctx.restore();
    }

    if (gridLines.length > 0) {
      const withOrigin = walls.filter((w) => w.wallOrigin);
      if (withOrigin.length > 0) {
        const wo = withOrigin[0].wallOrigin;
        const lenAxis = wo.lengthAxis;
        const groupMinX = Math.min(...withOrigin.map((w) => w.wallOrigin.lengthStart));
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1.5;
        for (const gl of gridLines) {
          const worldMM = gl[lenAxis];
          if (worldMM == null) continue;
          const relX = worldMM - groupMinX;
          if (relX < -500 || relX > groupWidth + 500) continue;
          const [sx] = toScreen(relX, 0);
          ctx.strokeStyle = 'rgba(234,88,12,0.8)';
          ctx.beginPath();
          ctx.moveTo(sx, 0);
          ctx.lineTo(sx, H);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(234,88,12,0.9)';
          ctx.font = 'bold 11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          const label = gl.tag ?? '';
          const tw = ctx.measureText(label).width + 8;
          ctx.fillRect(sx - tw / 2, 2, tw, 16);
          ctx.fillStyle = '#fff';
          ctx.fillText(label, sx, 4);
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = 'rgba(234,88,12,0.8)';
        }
        ctx.restore();
      }
    }

    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`Schaal ~1:${Math.round(1 / (scale * 0.001))}  ·  ${Math.round(groupWidth)}×${Math.round(groupHeight)} mm`, 8, H - 6);
  }, [walls, facadeData, allPanels, allLatten, zonePatterns, groupSettings, bounds, size, redrawTick, maxHoogte, startLijn, penantFaceData, groupColor, mat, color, zetwerk, panelen, latten, layerVisibility, gridLines, showCenterLines, stripZones, drawingRect, selectedZoneId]);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const t = transform.current;
    transform.current = {
      scale: t.scale * factor,
      tx: mx + (t.tx - mx) * factor,
      ty: my + (t.ty - my) * factor,
    };
    setRedrawTick((n) => n + 1);
  }, []);

  const screenToWorld = useCallback((sx, sy) => {
    const { scale, tx, ty } = transform.current;
    return [(sx - tx) / (scale * 0.001), (ty - sy) / (scale * 0.001)];
  }, []);

  const onMouseDown = useCallback((e) => {
    if (drawMode) {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const [wX, wY] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      drawStartRef.current = { wX, wY };
      setDrawingRect({ x: wX, y: wY, width: 0, height: 0 });
      // Check if clicking an existing zone to select it
      const hit = stripZones.find((sz) => wX >= sz.x && wX <= sz.x + sz.width && wY >= sz.y && wY <= sz.y + sz.height);
      setSelectedZoneId(hit?.id ?? null);
    } else {
      dragStart.current = { x: e.clientX, y: e.clientY, tx: transform.current.tx, ty: transform.current.ty };
    }
  }, [drawMode, screenToWorld, stripZones]);

  const onMouseMove = useCallback((e) => {
    if (drawMode && drawStartRef.current) {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const [wX, wY] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const sX = drawStartRef.current.wX;
      const sY = drawStartRef.current.wY;
      setDrawingRect({ x: Math.min(sX, wX), y: Math.min(sY, wY), width: Math.abs(wX - sX), height: Math.abs(wY - sY) });
    } else if (!drawMode && dragStart.current) {
      transform.current = {
        ...transform.current,
        tx: dragStart.current.tx + (e.clientX - dragStart.current.x),
        ty: dragStart.current.ty + (e.clientY - dragStart.current.y),
      };
      setRedrawTick((n) => n + 1);
    }
  }, [drawMode, screenToWorld]);

  const onMouseUp = useCallback(() => {
    if (drawMode && drawStartRef.current && drawingRect) {
      drawStartRef.current = null;
      if (drawingRect.width > 20 && drawingRect.height > 20) {
        const newZone = {
          id: `sz_${Date.now()}`,
          x: Math.round(drawingRect.x),
          y: Math.round(drawingRect.y),
          width: Math.round(drawingRect.width),
          height: Math.round(drawingRect.height),
          label: `Zone ${String.fromCharCode(65 + stripZones.length)}`,
          depthOffset: 0,
        };
        onStripZonesChange?.([...stripZones, newZone]);
        setSelectedZoneId(newZone.id);
      }
      setDrawingRect(null);
    }
    dragStart.current = null;
  }, [drawMode, drawingRect, stripZones, onStripZonesChange]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', background: '#1e293b' }}>
      <canvas
        ref={canvasRef}
        width={Math.round(size.w * (window.devicePixelRatio || 1))}
        height={Math.round(size.h * (window.devicePixelRatio || 1))}
        style={{ display: 'block', width: size.w, height: size.h, cursor: drawMode ? 'crosshair' : 'grab' }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      />

      {/* Toolbar top-left */}
      <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
        <button
          onClick={() => { setDrawMode((m) => !m); setDrawingRect(null); drawStartRef.current = null; }}
          style={{
            background: drawMode ? '#0e7490' : 'rgba(30,41,59,0.92)',
            border: `1px solid ${drawMode ? '#22d3ee' : '#334155'}`,
            color: drawMode ? '#22d3ee' : '#94a3b8',
            padding: '4px 10px', fontSize: 11, borderRadius: 4, cursor: 'pointer', fontWeight: drawMode ? 700 : 400,
          }}
        >
          {drawMode ? '✏️ Teken zone — klik & sleep' : '▭ Teken zone'}
        </button>

        {stripZones.length > 0 && (
          <div style={{ background: 'rgba(15,23,42,0.92)', border: '1px solid #1e3a5f', borderRadius: 4, padding: '4px 6px', minWidth: 180 }}>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 3, fontWeight: 600 }}>Strip-zones ({stripZones.length})</div>
            {stripZones.map((sz) => (
              <div key={sz.id} style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0',
                background: sz.id === selectedZoneId ? 'rgba(34,211,238,0.08)' : 'transparent',
                borderRadius: 2, cursor: 'pointer',
              }}
                onClick={() => setSelectedZoneId(sz.id === selectedZoneId ? null : sz.id)}
              >
                <span style={{ width: 8, height: 8, border: '1.5px solid #22d3ee', borderRadius: 1, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: '#e2e8f0', flex: 1 }}>{sz.label} <span style={{ color: '#64748b' }}>{Math.round(sz.width)}×{Math.round(sz.height)}</span></span>
                <button
                  onClick={(ev) => { ev.stopPropagation(); onStripZonesChange?.(stripZones.filter((z) => z.id !== sz.id)); if (selectedZoneId === sz.id) setSelectedZoneId(null); }}
                  style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 12, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
                >✕</button>
              </div>
            ))}
            <button
              onClick={() => { onStripZonesChange?.([]); setSelectedZoneId(null); }}
              style={{ marginTop: 4, background: 'none', border: '1px solid #334155', color: '#64748b', fontSize: 9, borderRadius: 3, padding: '2px 6px', cursor: 'pointer', width: '100%' }}
            >Alle zones wissen</button>
          </div>
        )}
      </div>

      <button
        onClick={fitToView}
        style={{
          position: 'absolute', bottom: 12, right: 12,
          background: 'rgba(30,41,59,0.9)', border: '1px solid #334155',
          color: '#94a3b8', padding: '4px 10px', fontSize: 11,
          borderRadius: 4, cursor: 'pointer',
        }}
      >
        ⊡ Passend maken
      </button>
      <div style={{ position: 'absolute', bottom: 12, left: 12, color: '#475569', fontSize: 11, pointerEvents: 'none' }}>
        {drawMode ? '✏️ Teken een rechthoek om een strip-zone te definiëren' : 'Scrollen = zoom · Slepen = pannen'}
      </div>
    </div>
  );
}
