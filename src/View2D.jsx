import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { buildFullGroupFacadePattern, getOpeningPoly } from './lib/pattern.js';
import { buildFacadeZones, panelizeZone } from './lib/panelization.js';
import { polyXRangesAtY, openingXRangesAtY, brickColor } from './lib/geometry.js';

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

export function View2D({ walls, groupSettings, maxHoogte, penantFaceData, groupColor, zetwerk, panelen, latten, layerVisibility, gridLines = [], showCenterLines = false, zoneSettings = [] }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [redrawTick, setRedrawTick] = useState(0);

  const transform = useRef({ scale: 1, tx: 0, ty: 0 });
  const dragStart = useRef(null);

  const mat = groupSettings?.material ?? { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
  const verband = groupSettings?.verband ?? 'halfsteens';
  const color = groupSettings?.color ?? '#a64033';

  const facadeData = useMemo(() => {
    if (!walls?.length) return null;
    const result = buildFullGroupFacadePattern(walls, mat, verband, maxHoogte, zetwerk);
    return result;
  }, [walls, mat, verband, maxHoogte, zetwerk]);

  const allPanels = useMemo(() => {
    if (!facadeData || !panelen?.enabled) return [];
    const { rows, groupWidth, groupHeight, groupOpenings } = facadeData;
    const basePanel = { width: Math.max(100, panelen.breedte ?? 3005), height: Math.max(100, panelen.hoogte ?? 1200) };
    const steenH = mat.steenH;
    const globalPieces = rows.flatMap((row) => row.pieces.map((p) => ({ x: p.start, width: p.length })));
    const openingsForZones = groupOpenings.map((op) => ({ id: `op_${op.x}_${op.y}`, x: op.x, y: op.y, width: op.width, height: op.height, polyPts: op.polyPts ?? null }));
    const zones = buildFacadeZones(groupWidth, groupHeight, openingsForZones);
    const panels = [];
    for (const zone of zones) {
      const result = panelizeZone(zone, rows, globalPieces, steenH, basePanel);
      if (result.ok) panels.push(...result.panels);
    }
    return panels;
  }, [facadeData, panelen, mat]);

  const allLatten = useMemo(() => {
    if (!facadeData || !latten?.enabled) return [];
    const { groupWidth, groupHeight, groupOpenings } = facadeData;
    const richting = latten.richting ?? 'horizontaal';
    const latBreedte = Math.max(5, latten.breedte ?? 50);

    const PENANT_GAP = 10;
    const penantRanges = (groupSettings?.penanten ?? []).map((p) => ({
      x1: Math.max(0, (p.x ?? 0) - PENANT_GAP),
      x2: Math.min(groupWidth, (p.x ?? 0) + (p.breedte ?? 400) + PENANT_GAP),
    }));

    if (richting === 'horizontaal') {
      const MAX_HOC = latten.maxInterval ?? 400;
      const openingBottomYs = new Set(groupOpenings.map((op) => Math.round(op.y)));
      const openingTopYs    = new Set(groupOpenings.map((op) => Math.round(op.y + op.height)));
      const gH = Math.round(groupHeight);

      const boundaryYs = new Set([0, gH]);
      for (const panel of allPanels) {
        boundaryYs.add(Math.round(panel.y));
        boundaryYs.add(Math.round(panel.y + panel.height));
      }
      for (const op of groupOpenings) {
        boundaryYs.add(Math.round(op.y));
        boundaryYs.add(Math.round(op.y + op.height));
      }

      const sortedBoundaries = [...boundaryYs].sort((a, b) => a - b);

      const allYs = new Set(sortedBoundaries);
      for (let i = 0; i < sortedBoundaries.length - 1; i++) {
        const yA = sortedBoundaries[i];
        const yB = sortedBoundaries[i + 1];
        const span = yB - yA;
        if (span > MAX_HOC) {
          const steps = Math.ceil(span / MAX_HOC);
          for (let s = 1; s < steps; s++) {
            allYs.add(Math.round(yA + (span / steps) * s));
          }
        }
      }

      const INSET = 5;
      const result = [];
      let globalIdx = 0;

      for (const yr of [...allYs].sort((a, b) => a - b)) {
        let latY;
        if (yr === 0) {
          latY = 0;
        } else if (yr === gH) {
          latY = yr - latBreedte;
        } else if (openingBottomYs.has(yr)) {
          latY = yr - latBreedte;
        } else if (openingTopYs.has(yr)) {
          latY = yr;
        } else {
          latY = yr - latBreedte / 2;
        }

        const isForced = openingBottomYs.has(yr) || openingTopYs.has(yr) || yr === 0 || yr === gH;

        const latTop = latY;
        const latBot = latY + latBreedte;

        const openingsAtY = groupOpenings.filter(
          (op) => op.y < latBot && op.y + op.height > latTop
        );

        let zones = [];
        if (openingsAtY.length === 0) {
          zones.push({ x1: 0, x2: groupWidth });
        } else {
          const opRanges = openingsAtY
            .flatMap((op) => openingXRangesAtY(op, latTop, latBot))
            .sort((a, b) => a.x1 - b.x1);
          let cursor = 0;
          for (const op of opRanges) {
            if (op.x1 > cursor) zones.push({ x1: cursor, x2: op.x1 });
            cursor = Math.max(cursor, op.x2);
          }
          if (cursor < groupWidth) zones.push({ x1: cursor, x2: groupWidth });
        }

        if (penantRanges.length > 0) {
          const splitZones = [];
          for (const zone of zones) {
            let segments = [{ x1: zone.x1, x2: zone.x2 }];
            for (const pr of penantRanges) {
              const next = [];
              for (const seg of segments) {
                if (pr.x2 <= seg.x1 || pr.x1 >= seg.x2) {
                  next.push(seg);
                } else {
                  if (pr.x1 > seg.x1) next.push({ x1: seg.x1, x2: pr.x1 });
                  if (pr.x2 < seg.x2) next.push({ x1: pr.x2, x2: seg.x2 });
                }
              }
              segments = next;
            }
            splitZones.push(...segments);
          }
          zones = splitZones;
        }

        for (const zone of zones) {
          let x1 = zone.x1;
          let x2 = zone.x2;

          if (allPanels.length > 0) {
            const panelsInZone = allPanels.filter(
              (p) => p.y < latBot && p.y + p.height > latTop &&
                     p.x + p.width > zone.x1 && p.x < zone.x2
            );
            if (panelsInZone.length > 0) {
              x1 = Math.min(...panelsInZone.map((p) => p.x)) + INSET;
              x2 = Math.max(...panelsInZone.map((p) => p.x + p.width)) - INSET;
            }
          }

          if (x2 <= x1) continue;
          result.push({
            id: `lat-h-${globalIdx++}`,
            richting: 'horizontaal',
            x: x1,
            y: latY,
            width: x2 - x1,
            height: latBreedte,
            forced: isForced,
          });
        }
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
  }, [facadeData, latten, allPanels, mat]);

  const zonePatterns = useMemo(() => {
    if (!walls?.length || !facadeData) return [];
    const sortedPenants = [...(groupSettings?.penanten ?? [])].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
    if (sortedPenants.length < 2) return [];
    const result = [];
    for (let zi = 0; zi < sortedPenants.length - 1; zi++) {
      const zs = zoneSettings[zi];
      if (!zs?.enabled) { result.push(null); continue; }
      const zoneX1 = (sortedPenants[zi].x ?? 0) + Math.max(1, sortedPenants[zi].breedte ?? 400);
      const zoneX2 = sortedPenants[zi + 1].x ?? 0;
      if (zoneX2 <= zoneX1) { result.push(null); continue; }
      const zoneMat = zs.material ?? mat;
      const zoneVerband = zs.verband ?? verband;
      const zoneMaxHoogte = zs.maxHoogte ?? maxHoogte;
      const patternData = buildFullGroupFacadePattern(walls, zoneMat, zoneVerband, zoneMaxHoogte, zetwerk);
      result.push(patternData ? { patternData, zoneX1, zoneX2, color: zs.color ?? groupColor, zoneMat, zoneVerband } : null);
    }
    return result;
  }, [walls, facadeData, groupSettings, zoneSettings, mat, verband, maxHoogte, zetwerk, groupColor]);

  const bounds = useMemo(() => {
    if (!facadeData) return { minX: 0, maxX: 1000, minY: 0, maxY: 1000 };
    return { minX: 0, maxX: facadeData.groupWidth, minY: 0, maxY: facadeData.groupHeight };
  }, [facadeData]);

  const fitToView = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.width || !canvas.height) return;
    const W = canvas.width;
    const H = canvas.height;
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
  }, [bounds]);

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
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
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

    const { rows, groupWidth, groupHeight, groupOpenings, zetwerkParams } = facadeData;
    const steenH = mat.steenH;

    const [faceSx, faceSy] = toScreen(0, groupHeight);
    const faceW = groupWidth * scale * 0.001;
    const faceH = groupHeight * scale * 0.001;

    ctx.fillStyle = hexToRgba(color, 0.15);
    ctx.fillRect(faceSx, faceSy, faceW, faceH);

    const applyOpeningExclusionClip = () => {
      ctx.beginPath();
      ctx.rect(faceSx - 1, faceSy - 1, faceW + 2, faceH + 2);
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

    if (vis.strips !== false) {
      const isTegel = verband === 'staand_tegelverband';
      const stripH = isTegel ? mat.steenL : steenH;
      for (const row of rows) {
        const clippedTop = Math.min(row.y + stripH, groupHeight);
        const actualH = clippedTop - row.y;
        if (actualH <= 0) continue;
        const [, rowSy] = toScreen(0, clippedTop);
        const rowSh = actualH * scale * 0.001;
        for (const piece of row.pieces) {
          const [pSx] = toScreen(piece.start, 0);
          const pSw = piece.length * scale * 0.001;
          ctx.fillStyle = brickColor(piece.label, color);
          ctx.fillRect(pSx + 0.5, rowSy + 0.5, Math.max(pSw - 1, 1), Math.max(rowSh - 1, 1));
        }
      }

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
          for (const piece of row.pieces) {
            const pEnd = piece.start + piece.length;
            if (pEnd <= zoneX1 || piece.start >= zoneX2) continue;
            const [pSx] = toScreen(Math.max(piece.start, zoneX1), 0);
            const [pEx] = toScreen(Math.min(pEnd, zoneX2), 0);
            const pSw = pEx - pSx;
            ctx.fillStyle = brickColor(piece.label, zColor);
            ctx.fillRect(pSx + 0.5, rowSy + 0.5, Math.max(pSw - 1, 1), Math.max(rowSh - 1, 1));
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
        const zovPx = zwV * scale * 0.001;

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
      for (const { penant: p, front, height: pH } of penantFaceData) {
        const pX = p.x ?? 0;
        const pB = Math.max(1, p.breedte ?? 400);
        const pD = Math.max(1, p.diepte ?? 150);
        const baseVY = 0;

        const [sx, baseY] = toScreen(pX, baseVY + pH);
        const [ex] = toScreen(pX + pB, 0);
        const [, bottomY] = toScreen(0, baseVY);
        const pW = ex - sx;
        const pHpx = bottomY - baseY;
        const depthPx = Math.min(pD * scale * 0.001, 30);

        ctx.fillStyle = 'rgba(99,102,241,0.15)';
        ctx.fillRect(sx, baseY, pW, pHpx);

        ctx.fillStyle = 'rgba(99,102,241,0.25)';
        ctx.beginPath();
        ctx.moveTo(sx + pW, baseY);
        ctx.lineTo(sx + pW + depthPx, baseY - depthPx);
        ctx.lineTo(sx + pW + depthPx, bottomY - depthPx);
        ctx.lineTo(sx + pW, bottomY);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(99,102,241,0.2)';
        ctx.beginPath();
        ctx.moveTo(sx, baseY);
        ctx.lineTo(sx + depthPx, baseY - depthPx);
        ctx.lineTo(sx + pW + depthPx, baseY - depthPx);
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
            ctx.fillStyle = brickColor(piece.label, col);
            ctx.fillRect(px2 + 0.5, rowTop + 0.5, Math.max(pw2 - 1, 1), Math.max(rowH - 1, 1));
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

    if (penantFaceData?.length >= 2) {
      const sorted = [...penantFaceData].sort((a, b) => (a.penant.x ?? 0) - (b.penant.x ?? 0));
      for (let i = 0; i < sorted.length - 1; i++) {
        const p1 = sorted[i].penant;
        const p2 = sorted[i + 1].penant;
        const zoneX1 = (p1.x ?? 0) + Math.max(1, p1.breedte ?? 400);
        const zoneX2 = p2.x ?? 0;
        if (zoneX2 <= zoneX1) continue;
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
  }, [walls, facadeData, allPanels, allLatten, zonePatterns, groupSettings, bounds, size, redrawTick, maxHoogte, penantFaceData, groupColor, mat, color, zetwerk, panelen, latten, gridLines, showCenterLines]);

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

  const onMouseDown = useCallback((e) => {
    dragStart.current = { x: e.clientX, y: e.clientY, tx: transform.current.tx, ty: transform.current.ty };
  }, []);

  const onMouseMove = useCallback((e) => {
    if (!dragStart.current) return;
    transform.current = {
      ...transform.current,
      tx: dragStart.current.tx + (e.clientX - dragStart.current.x),
      ty: dragStart.current.ty + (e.clientY - dragStart.current.y),
    };
    setRedrawTick((n) => n + 1);
  }, []);

  const onMouseUp = useCallback(() => { dragStart.current = null; }, []);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', background: '#1e293b' }}>
      <canvas
        ref={canvasRef}
        width={size.w}
        height={size.h}
        style={{ display: 'block' }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      />
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
        Scrollen = zoom · Slepen = pannen
      </div>
    </div>
  );
}
