import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { buildFullGroupFacadePattern } from './lib/pattern.js';
import { buildFacadeZones, panelizeZone } from './lib/panelization.js';

function hexToRgba(hex, alpha = 1) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function brickColor(label, baseColor) {
  if (label === 'Kop') return '#b45309';
  if (label === 'Driekwart') return '#7c3aed';
  if (label === 'Rest') return '#dc2626';
  return baseColor ?? '#a64033';
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

export function View2D({ walls, groupSettings, maxHoogte, penantFaceData, groupColor, zetwerk, panelen }) {
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
    return buildFullGroupFacadePattern(walls, mat, verband, maxHoogte, zetwerk);
  }, [walls, mat, verband, maxHoogte, zetwerk]);

  const allPanels = useMemo(() => {
    if (!facadeData || !panelen?.enabled) return [];
    const { rows, groupWidth, groupHeight, groupOpenings } = facadeData;
    const basePanel = { width: Math.max(100, panelen.breedte ?? 3005), height: Math.max(100, panelen.hoogte ?? 1200) };
    const steenH = mat.steenH;
    const globalPieces = rows.flatMap((row) => row.pieces.map((p) => ({ x: p.start, width: p.length })));
    const openingsForZones = groupOpenings.map((op) => ({ id: `op_${op.x}_${op.y}`, x: op.x, y: op.y, width: op.width, height: op.height }));
    const zones = buildFacadeZones(groupWidth, groupHeight, openingsForZones);
    const panels = [];
    for (const zone of zones) {
      const result = panelizeZone(zone, rows, globalPieces, steenH, basePanel);
      if (result.ok) panels.push(...result.panels);
    }
    return panels;
  }, [facadeData, panelen, mat]);

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

    if (allPanels.length) {
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
    }

    for (const row of rows) {
      const [, rowSy] = toScreen(0, row.y + steenH);
      const rowSh = steenH * scale * 0.001;
      for (const piece of row.pieces) {
        const [pSx] = toScreen(piece.start, 0);
        const pSw = piece.length * scale * 0.001;
        ctx.fillStyle = brickColor(piece.label, color);
        ctx.fillRect(pSx + 0.5, rowSy + 0.5, Math.max(pSw - 1, 1), Math.max(rowSh - 1, 1));
      }
    }

    for (const op of groupOpenings) {
      const [opSx, opSy] = toScreen(op.x, op.y + op.height);
      const opSw = op.width * scale * 0.001;
      const opSh = op.height * scale * 0.001;

      ctx.clearRect(opSx - 0.5, opSy - 0.5, opSw + 1, opSh + 1);
      ctx.fillStyle = 'rgba(147,197,253,0.18)';
      ctx.fillRect(opSx, opSy, opSw, opSh);
      ctx.strokeStyle = '#93c5fd';
      ctx.lineWidth = 1;
      ctx.strokeRect(opSx, opSy, opSw, opSh);

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

    for (const wall of (walls ?? [])) {
      if (!wall.openings) continue;
      const withOrigin = (walls ?? []).filter((w) => w.wallOrigin);
      if (!withOrigin.length) continue;
      const minX = Math.min(...withOrigin.map((w) => w.wallOrigin.lengthStart));
      const minH = Math.min(...withOrigin.map((w) => w.wallOrigin.heightStart));
      const wallOffsetX = (wall.wallOrigin?.lengthStart ?? 0) - minX;
      const wallOffsetH = (wall.wallOrigin?.heightStart ?? 0) - minH;

      for (const op of wall.openings) {
        if (!op.polyPts?.length) continue;
        const pts = op.polyPts.map((p) => toScreen(wallOffsetX + p.l, wallOffsetH + p.h));
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        ctx.clip();
        const [opSx, opSy] = toScreen(wallOffsetX + (op.x ?? 0), wallOffsetH + (op.y ?? 0) + (op.hoogte ?? 0));
        ctx.clearRect(opSx - 2, opSy - 2, (op.breedte ?? 0) * scale * 0.001 + 4, (op.hoogte ?? 0) * scale * 0.001 + 4);
        ctx.restore();
        ctx.strokeStyle = '#93c5fd';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        ctx.stroke();
      }
    }

    if (zetwerkParams) {
      const { breedte: zwB, offsetH: zwH, offsetV: zwV } = zetwerkParams;
      for (const op of groupOpenings) {
        const zbPx = zwB * scale * 0.001;
        const zohPx = zwH * scale * 0.001;
        const zovPx = zwV * scale * 0.001;

        const [opL] = toScreen(op.x, 0);
        const [opR] = toScreen(op.x + op.width, 0);
        const [, opTop] = toScreen(0, op.y + op.height);
        const [, opBot] = toScreen(0, op.y);
        const opW = opR - opL;

        ctx.fillStyle = 'rgba(148,163,184,0.85)';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 0.5;

        const boven = [opL - zohPx - zbPx, opTop - zbPx - zovPx, opW + 2 * (zohPx + zbPx), zbPx];
        const onder = [opL - zohPx - zbPx, opBot + zovPx, opW + 2 * (zohPx + zbPx), zbPx];
        const links = [opL - zbPx - zohPx, opTop - zovPx, zbPx, (opBot - opTop) + 2 * zovPx];
        const rechts = [opR + zohPx, opTop - zovPx, zbPx, (opBot - opTop) + 2 * zovPx];

        for (const [rx, ry, rw, rh] of [boven, onder, links, rechts]) {
          ctx.fillRect(rx, ry, rw, rh);
          ctx.strokeRect(rx, ry, rw, rh);
        }
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

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    ctx.strokeRect(faceSx, faceSy, faceW, faceH);

    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`Schaal ~1:${Math.round(1 / (scale * 0.001))}  ·  ${Math.round(groupWidth)}×${Math.round(groupHeight)} mm`, 8, H - 6);
  }, [walls, facadeData, allPanels, groupSettings, bounds, size, redrawTick, maxHoogte, penantFaceData, groupColor, mat, color, zetwerk, panelen]);

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
