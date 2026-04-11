import { useRef, useEffect, useMemo, useCallback, useState } from 'react';

function hexToRgba(hex, alpha = 1) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function lighten(hex, amount = 0.3) {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + Math.round(255 * amount));
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + Math.round(255 * amount));
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + Math.round(255 * amount));
  return `rgb(${r},${g},${b})`;
}

function brickColor(label, baseColor) {
  if (label === 'Kop') return '#b45309';
  if (label === 'Driekwart') return '#7c3aed';
  if (label === 'Rest') return '#dc2626';
  return baseColor ?? '#a64033';
}

export function View2D({ walls, patterns, groupSettings, wallGroupMap, selectedWallIds, maxHoogte, penantFaceData, groupColor }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [redrawTick, setRedrawTick] = useState(0);

  const transform = useRef({ scale: 1, tx: 0, ty: 0 });
  const dragStart = useRef(null);

  const virtualCoords = useMemo(() => {
    const withOrigin = walls.filter((w) => w.wallOrigin);
    if (!withOrigin.length) return { minH: 0, map: {} };

    const minX = Math.min(...withOrigin.map((w) => w.wallOrigin.lengthStart));
    const minH = Math.min(...withOrigin.map((w) => w.wallOrigin.heightStart));

    const map = {};
    for (const w of withOrigin) {
      map[w.expressID] = {
        vx: w.wallOrigin.lengthStart - minX,
        vy: w.wallOrigin.heightStart - minH,
      };
    }
    return { minX, minH, map };
  }, [walls]);

  const bounds = useMemo(() => {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const wall of walls) {
      if (!wall.wallOrigin) continue;
      const { vx, vy } = virtualCoords.map[wall.expressID] ?? { vx: 0, vy: 0 };
      minX = Math.min(minX, vx);
      maxX = Math.max(maxX, vx + wall.length);
      minY = Math.min(minY, vy);
      maxY = Math.max(maxY, vy + wall.height);
    }
    if (!isFinite(minX)) return { minX: 0, maxX: 1000, minY: 0, maxY: 1000 };
    return { minX, maxX, minY, maxY };
  }, [walls, virtualCoords]);

  const fitToView = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.width || !canvas.height) return;
    const W = canvas.width;
    const H = canvas.height;
    const PAD = 24;
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

  useEffect(() => {
    fitToView();
  }, [fitToView, size]);

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

    for (const wall of walls) {
      if (!wall.wallOrigin) continue;
      const { vx, vy } = virtualCoords.map[wall.expressID] ?? { vx: 0, vy: 0 };

      const gid = wallGroupMap[wall.expressID];
      const gs = gid ? groupSettings(gid) : null;
      const color = gs?.color ?? '#64748b';
      const isSel = selectedWallIds?.has(wall.expressID);

      const [sx, sy] = toScreen(vx, vy + wall.height);
      const sw = wall.length * scale * 0.001;
      const sh = wall.height * scale * 0.001;

      ctx.fillStyle = hexToRgba(color, 0.2);
      ctx.fillRect(sx, sy, sw, sh);

      const pattern = patterns?.[wall.expressID];
      if (pattern && gs) {
        const mat = gs.material ?? {};
        const steenH = mat.steenH ?? 50;

        ctx.fillStyle = hexToRgba(color, 0.85);
        for (const row of pattern) {
          const [, rowSy] = toScreen(vx, vy + row.y + steenH);
          const rowSh = steenH * scale * 0.001;
          for (const piece of row.pieces) {
            const [pSx] = toScreen(vx + piece.start, 0);
            const pSw = piece.length * scale * 0.001;
            ctx.fillRect(pSx + 0.5, rowSy + 0.5, Math.max(pSw - 1, 1), Math.max(rowSh - 1, 1));
          }
        }

        ctx.fillStyle = hexToRgba(color, 0.15);
        ctx.fillRect(sx, sy, sw, sh);
      }

      if (isSel) {
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx, sy, sw, sh);
      }

      for (const op of (wall.openings ?? [])) {
        const opLeftMm = Math.round(vx + op.x);
        const opRightMm = Math.round(vx + op.x + op.breedte);
        const [opSx, opSy] = toScreen(vx + op.x, vy + op.y + op.hoogte);
        const opSw = op.breedte * scale * 0.001;
        const opSh = op.hoogte * scale * 0.001;

        if (op.polyPts?.length >= 3) {
          const pts = op.polyPts.map((p) => toScreen(vx + p.l, vy + p.h));
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
          ctx.closePath();
          ctx.clip();
          ctx.clearRect(opSx - 1, opSy - 1, opSw + 2, opSh + 2);
          ctx.restore();
          ctx.fillStyle = 'rgba(147,197,253,0.25)';
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#93c5fd';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
          ctx.closePath();
          ctx.stroke();
        } else {
          ctx.clearRect(opSx, opSy, opSw, opSh);
          ctx.fillStyle = 'rgba(147,197,253,0.25)';
          ctx.fillRect(opSx, opSy, opSw, opSh);
          ctx.strokeStyle = '#93c5fd';
          ctx.lineWidth = 1;
          ctx.strokeRect(opSx, opSy, opSw, opSh);
        }

        if (opSw > 20) {
          const labelY = opSy - 2;
          ctx.font = '9px system-ui, sans-serif';
          ctx.fillStyle = '#7dd3fc';
          ctx.textBaseline = 'bottom';

          ctx.textAlign = 'left';
          ctx.fillText(`${opLeftMm}`, opSx + 2, labelY);

          ctx.textAlign = 'right';
          ctx.fillText(`${opRightMm}`, opSx + opSw - 2, labelY);
        }
      }

      if (sw > 30) {
        ctx.font = `${Math.max(9, Math.min(13, sw / 10))}px system-ui, sans-serif`;
        ctx.fillStyle = '#f1f5f9';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = wall.name.length > 20 ? wall.name.slice(0, 18) + '…' : wall.name;
        ctx.fillText(label, sx + sw / 2, sy + sh / 2);
      }

      if (sh > 20) {
        ctx.font = '9px system-ui, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const dim = `${wall.length}×${wall.height}`;
        ctx.fillText(dim, sx + sw / 2, sy + sh - 14);
      }
    }

    if (penantFaceData?.length) {
      const steenH = (() => {
        for (const wall of walls) {
          const gid = wallGroupMap[wall.expressID];
          const gs = gid ? groupSettings(gid) : null;
          return gs?.material?.steenH ?? 50;
        }
        return 50;
      })();

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

    if (maxHoogte !== null && maxHoogte > 0 && walls.length > 0) {
      const wallsWithOrigin = walls.filter((w) => w.wallOrigin);
      if (wallsWithOrigin.length > 0) {
        const lineVY = maxHoogte;
        let xMin = Infinity, xMax = -Infinity;
        for (const wall of wallsWithOrigin) {
          const { vx } = virtualCoords.map[wall.expressID] ?? { vx: 0 };
          const [sx] = toScreen(vx, 0);
          const ex = toScreen(vx + wall.length, 0)[0];
          if (sx < xMin) xMin = sx;
          if (ex > xMax) xMax = ex;
        }
        const [, sy] = toScreen(0, lineVY);
        ctx.save();
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 5]);
        ctx.beginPath();
        ctx.moveTo(Math.max(0, xMin - 20), sy);
        ctx.lineTo(Math.min(W, xMax + 20), sy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#f97316';
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`▲ max ${maxHoogte} mm`, Math.max(4, xMin), sy - 2);
        ctx.restore();
      }
    }

    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`Schaal ~1:${Math.round(1 / (scale * 0.001))}`, 8, H - 6);
  }, [walls, patterns, groupSettings, wallGroupMap, selectedWallIds, bounds, virtualCoords, size, redrawTick, maxHoogte, penantFaceData, groupColor]);

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

function pickGridStep(scale) {
  const pixelsPerMm = scale * 0.001;
  if (pixelsPerMm < 0.005) return 0;
  const targets = [10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10];
  for (const s of targets) {
    if (s * pixelsPerMm >= 40) return s;
  }
  return 0;
}
