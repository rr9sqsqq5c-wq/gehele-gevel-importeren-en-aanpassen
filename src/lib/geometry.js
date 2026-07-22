export function polyXRangesAtY(poly, y) {
  const xs = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ay = a.h, by = b.h, ax = a.l, bx = b.l;
    if ((ay < y && by >= y) || (by < y && ay >= y)) {
      const t = (y - ay) / (by - ay);
      xs.push(ax + t * (bx - ax));
    }
  }
  xs.sort((p, q) => p - q);
  const ranges = [];
  for (let i = 0; i + 1 < xs.length; i += 2) ranges.push([xs[i], xs[i + 1]]);
  return ranges;
}

// Trek een opening af van een strip-baksteen (rr = {x1,x2,y1,y2}), POLY-BEWUST. Concave opening
// (polyPts, >4 punten) → knip de x-range op de baksteenhoogte via de polygoon (zoals de standaard
// halfsteens-clip, polyXRangesAtY), zodat het massieve muurdeel (notch) onder bv. een L-raam bekleed
// blijft. Rechthoekige opening (≤4 punten of geen polyPts) → exact de klassieke 2D-rechthoek-
// subtractie (byte-identiek). Gedeeld door de wildverband/groothuis-verbanden (hun subtractRect).
export function subtractOpeningFromBrick(brick, opening) {
  const { x1: bx1, x2: bx2, y1: by1, y2: by2 } = brick;
  const { x: ox, y: oy, width: ow, height: oh } = opening;
  const ox2 = ox + ow, oy2 = oy + oh;
  if (bx2 <= ox || bx1 >= ox2 || by2 <= oy || by1 >= oy2) return [brick];
  if (opening.polyPts && opening.polyPts.length > 4) {
    const midY = (by1 + by2) / 2;
    let ranges = polyXRangesAtY(opening.polyPts, midY);
    if (!ranges.length) ranges = [...polyXRangesAtY(opening.polyPts, by1 + (by2 - by1) * 0.25), ...polyXRangesAtY(opening.polyPts, by1 + (by2 - by1) * 0.75)];
    if (!ranges.length) return [brick];
    let segs = [[bx1, bx2]];
    for (const [rx1, rx2] of ranges) {
      const nx = [];
      for (const [sx1, sx2] of segs) {
        if (sx2 <= rx1 || sx1 >= rx2) { nx.push([sx1, sx2]); continue; }
        if (sx1 < rx1) nx.push([sx1, rx1]);
        if (sx2 > rx2) nx.push([rx2, sx2]);
      }
      segs = nx;
    }
    return segs.filter(([a, b]) => b > a + 0.5).map(([a, b]) => ({ x1: a, x2: b, y1: by1, y2: by2 }));
  }
  const parts = [];
  if (bx1 < ox)  parts.push({ x1: bx1, x2: Math.min(bx2, ox), y1: by1, y2: by2 });
  if (bx2 > ox2) parts.push({ x1: Math.max(bx1, ox2), x2: bx2, y1: by1, y2: by2 });
  if (by1 < oy)  parts.push({ x1: Math.max(bx1, ox), x2: Math.min(bx2, ox2), y1: by1, y2: Math.min(by2, oy) });
  if (by2 > oy2) parts.push({ x1: Math.max(bx1, ox), x2: Math.min(bx2, ox2), y1: Math.max(by1, oy2), y2: by2 });
  return parts.filter((rr) => rr.x2 > rr.x1 + 0.5 && rr.y2 > rr.y1 + 0.5);
}

export function openingXRangesAtY(op, latTop, latBot) {
  if (op.polyPts && op.polyPts.length >= 3) {
    const midY = (latTop + latBot) / 2;
    let ranges = polyXRangesAtY(op.polyPts, midY);
    if (!ranges.length) {
      const r1 = polyXRangesAtY(op.polyPts, latTop + 1);
      const r2 = polyXRangesAtY(op.polyPts, latBot - 1);
      ranges = [...r1, ...r2];
    }
    if (ranges.length) return ranges.map(([x1, x2]) => ({ x1, x2 }));
  }
  return [{ x1: op.x, x2: op.x + op.width }];
}

export function openingCoversX(op, midX, midY) {
  if (op.polyPts && op.polyPts.length >= 3) {
    const ranges = polyXRangesAtY(op.polyPts, midY);
    return ranges.some(([x1, x2]) => midX >= x1 && midX <= x2);
  }
  return midX >= op.x && midX <= op.x + op.width;
}

export function openingXCoordsAtY(op, midY) {
  if (op.polyPts && op.polyPts.length >= 3) {
    const ranges = polyXRangesAtY(op.polyPts, midY);
    const xs = [];
    for (const [x1, x2] of ranges) { xs.push(x1); xs.push(x2); }
    return xs;
  }
  return [op.x, op.x + op.width];
}

export function brickColor(label, baseColor, length, kop) {
  if (label === 'Kop') return '#78350f';
  if (label === 'Strek') return '#1d4ed8';
  if (label === 'Rest' || label === 'Tegel' || label === 'Drieklezoor') {
    if (length != null && kop != null) {
      return length < kop ? '#f97316' : '#dc2626';
    }
    return '#dc2626';
  }
  return '#1d4ed8';
}

export function isTooSmall(label, length, kop) {
  return (label === 'Rest' || label === 'Tegel') && length != null && kop != null && length < kop;
}
