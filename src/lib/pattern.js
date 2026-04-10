function round2(v) {
  return Math.round(v * 100) / 100;
}

function buildRowPiecesForWidth(totalWidth, material, verband, rowIndex, startX) {
  const { steenL, steenH, lint, stoot } = material;
  const kop = round2((steenL - stoot) / 2);
  const driekwart = round2((steenL + stoot) * 0.75 - stoot);
  const useKop = verband === 'halfsteens' && rowIndex % 2 === 0;

  let pieces = [];

  if (useKop) {
    pieces.push({ start: 0, length: kop, label: 'Kop' });
  }

  pieces = recomputeStarts(pieces, stoot);

  let logicalX = pieces.length
    ? pieces[pieces.length - 1].start + pieces[pieces.length - 1].length + stoot
    : 0;

  while (logicalX + steenL <= totalWidth + 0.001) {
    pieces.push({ start: round2(logicalX), length: steenL, label: 'Vol' });
    logicalX += steenL;
    if (logicalX + stoot + steenL <= totalWidth + 0.001 || logicalX < totalWidth) {
      logicalX += stoot;
    }
  }

  pieces = recomputeStarts(pieces, stoot);

  let rest = getRest(pieces, totalWidth);

  if (rest > 0 && rest < kop) {
    let lastFullIndex = -1;
    for (let i = pieces.length - 1; i >= 0; i--) {
      if (pieces[i].label === 'Vol') { lastFullIndex = i; break; }
    }
    if (lastFullIndex !== -1) {
      pieces[lastFullIndex] = { ...pieces[lastFullIndex], length: driekwart, label: 'Driekwart' };
      pieces = recomputeStarts(pieces, stoot);
      rest = getRest(pieces, totalWidth);
    }
  }

  if (rest > 0.001) {
    pieces.push({
      start: round2(totalWidth - rest),
      length: round2(rest),
      label: Math.abs(rest - kop) < 0.01 ? 'Kop' : 'Rest',
    });
  }

  if (startX === 0) return pieces;

  return pieces
    .map((p) => ({ ...p, start: round2(p.start + startX) }))
    .filter((p) => p.start + p.length > startX - 0.001);
}

function recomputeStarts(pieces, stoot) {
  let x = 0;
  return pieces.map((p, i) => {
    const out = { ...p, start: round2(x) };
    x += p.length;
    if (i < pieces.length - 1) x += stoot;
    return out;
  });
}

function getRest(pieces, totalWidth) {
  if (!pieces.length) return round2(totalWidth);
  const last = pieces[pieces.length - 1];
  return round2(totalWidth - (last.start + last.length));
}

function isInOpening(x, y, openings, steenH) {
  for (const op of openings) {
    const ox = op.x ?? 0;
    const oy = op.y ?? 0;
    const ow = op.breedte ?? op.width ?? 0;
    const oh = op.hoogte ?? op.height ?? 0;
    if (x + 1 >= ox && x < ox + ow && y + 1 >= oy && y + steenH <= oy + oh + 1) {
      return true;
    }
  }
  return false;
}

function clipPieceToWall(piece, wallStart, wallEnd, openings, rowY, steenH) {
  const globalStart = piece.start;
  const globalEnd = globalStart + piece.length;

  const clipStart = Math.max(globalStart, wallStart);
  const clipEnd = Math.min(globalEnd, wallEnd);
  if (clipEnd <= clipStart + 0.001) return [];

  const localStart = round2(clipStart - wallStart);

  if (isInOpening(localStart, rowY, openings, steenH)) return [];

  return [{ ...piece, start: round2(clipStart), length: round2(clipEnd - clipStart) }];
}

export function buildGroupPattern(sortedWalls, adjacencies, material, verband) {
  const { steenL, steenH, lint } = material;
  const lagenmaat = steenH + lint;

  const hAdj = adjacencies.filter((a) => a.direction === 'right');
  const adjSet = new Set(hAdj.map((a) => `${a.wallIdA}-${a.wallIdB}`));

  const wallMap = Object.fromEntries(sortedWalls.map((w) => [w.expressID, w]));

  const chainGroups = buildHorizontalChains(sortedWalls, hAdj);

  const result = {};

  for (const chain of chainGroups) {
    const chainWalls = chain.map((id) => wallMap[id]).filter(Boolean);
    if (!chainWalls.length) continue;

    const offsets = [];
    let cumulative = 0;
    for (const w of chainWalls) {
      offsets.push(cumulative);
      cumulative += w.length;
    }

    const totalWidth = cumulative;
    const lagen = lagenmaat > 0 ? Math.floor((Math.max(...chainWalls.map((w) => w.height)) + lint) / lagenmaat) : 0;

    for (let ri = 0; ri < chainWalls.length; ri++) {
      const wall = chainWalls[ri];
      const wallStart = offsets[ri];
      const wallEnd = wallStart + wall.length;
      const wallLagen = lagenmaat > 0 ? Math.floor((wall.height + lint) / lagenmaat) : 0;
      const rows = [];

      for (let r = 0; r < wallLagen; r++) {
        const rowY = round2(r * lagenmaat);
        const fullPieces = buildRowPiecesForWidth(totalWidth, material, verband, r, 0);
        const clipped = [];

        for (const piece of fullPieces) {
          const localPieces = clipPieceToWall(piece, wallStart, wallEnd, wall.openings, rowY, steenH);
          for (const lp of localPieces) {
            clipped.push({ ...lp, start: round2(lp.start - wallStart) });
          }
        }

        if (clipped.length) {
          rows.push({ y: rowY, pieces: clipped });
        }
      }

      result[wall.expressID] = rows;
    }
  }

  return result;
}

function buildHorizontalChains(walls, hAdj) {
  const wallIds = walls.map((w) => w.expressID);
  const successorMap = {};
  hAdj.forEach(({ wallIdA, wallIdB }) => {
    if (wallIds.includes(wallIdA) && wallIds.includes(wallIdB)) {
      successorMap[wallIdA] = wallIdB;
    }
  });

  const hasIncoming = new Set(Object.values(successorMap));
  const chains = [];
  const visited = new Set();

  for (const id of wallIds) {
    if (visited.has(id) || hasIncoming.has(id)) continue;
    const chain = [];
    let cur = id;
    while (cur && !visited.has(cur)) {
      chain.push(cur);
      visited.add(cur);
      cur = successorMap[cur];
    }
    chains.push(chain);
  }

  for (const id of wallIds) {
    if (!visited.has(id)) {
      chains.push([id]);
      visited.add(id);
    }
  }

  return chains;
}

export function buildSingleWallPattern(wall, material, verband) {
  const { steenH, lint } = material;
  const lagenmaat = steenH + lint;
  const lagen = lagenmaat > 0 ? Math.floor((wall.height + lint) / lagenmaat) : 0;
  const rows = [];

  for (let r = 0; r < lagen; r++) {
    const rowY = round2(r * lagenmaat);
    const pieces = buildRowPiecesForWidth(wall.length, material, verband, r, 0);
    const filtered = pieces.filter((p) => {
      return !isInOpening(p.start, rowY, wall.openings, steenH);
    });
    if (filtered.length) rows.push({ y: rowY, pieces: filtered });
  }

  return rows;
}
