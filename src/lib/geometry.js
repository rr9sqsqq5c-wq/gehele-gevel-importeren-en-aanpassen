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
  if (label === 'Vol') return '#1d4ed8';
  if (label === 'Rest' || label === 'Tegel' || label === 'Driekwart') {
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
