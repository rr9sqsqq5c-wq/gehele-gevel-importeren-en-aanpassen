import { polyXRangesAtY } from './geometry.js';
import { isDropOversizedOpenings, isVentilatieZone } from './featureFlags.js';

// Een opening mag z'n eigen wand niet (ver) boven uitsteken. Tolerantie vangt rounding/
// kleine modelafwijkingen; een echte opening past binnen z'n wand, een corrupte (venster-L
// op een 300 mm band) overschrijdt dit ruim. Zie isDropOversizedOpenings (featureFlags.js).
const OVERSIZED_OPENING_TOL = 100;

function round2(v) {
  return Math.round(v * 100) / 100;
}

export function getOpeningPoly(op) {
  if (op.polyPts && op.polyPts.length >= 3) return op.polyPts;
  const { x, y, width, height } = op;
  return [
    { l: x,         h: y },
    { l: x + width, h: y },
    { l: x + width, h: y + height },
    { l: x,         h: y + height },
  ];
}

export function buildRowPiecesForWidth(totalWidth, material, verband, rowIndex, startX) {
  const { steenL, steenH, lint, stoot } = material;

  if (verband === 'staand_tegelverband') {
    const stepW = steenH + stoot;
    const pieces = [];
    let x = 0;
    while (x + 0.001 < totalWidth) {
      const len = round2(Math.min(steenH, totalWidth - x));
      if (len > 0.001) pieces.push({ start: round2(x + startX), length: len, label: len < steenH - 0.001 ? 'Rest' : 'Tegel' });
      x = round2(x + stepW);
    }
    return pieces;
  }

  const kop = round2((steenL - stoot) / 2);
  const driekwart = round2((steenL + stoot) * 0.75 - stoot);
  const useKop = verband === 'halfsteens' && rowIndex % 2 !== 0;

  let pieces = [];

  if (useKop) {
    pieces.push({ start: 0, length: kop, label: 'Kop' });
  }

  pieces = recomputeStarts(pieces, stoot);

  let logicalX = pieces.length
    ? pieces[pieces.length - 1].start + pieces[pieces.length - 1].length + stoot
    : 0;

  while (logicalX + steenL <= totalWidth + 0.001) {
    pieces.push({ start: round2(logicalX), length: steenL, label: 'Strek' });
    logicalX += steenL;
    if (logicalX + stoot + steenL <= totalWidth + 0.001 || logicalX < totalWidth) {
      logicalX += stoot;
    }
  }

  pieces = recomputeStarts(pieces, stoot);

  let rest = getRest(pieces, totalWidth);

  if (rest > stoot && rest - stoot < kop) {
    let lastFullIndex = -1;
    for (let i = pieces.length - 1; i >= 0; i--) {
      if (pieces[i].label === 'Strek') { lastFullIndex = i; break; }
    }
    if (lastFullIndex !== -1) {
      pieces[lastFullIndex] = { ...pieces[lastFullIndex], length: driekwart, label: 'Drieklezoor' };
      pieces = recomputeStarts(pieces, stoot);
      rest = getRest(pieces, totalWidth);
    }
  }

  const restLen = round2(rest - stoot);
  if (restLen > 0.001) {
    pieces.push({
      start: round2(totalWidth - restLen),
      length: restLen,
      label: Math.abs(restLen - kop) < 0.01 ? 'Kop' : 'Rest',
    });
  }

  if (startX === 0) return pieces;

  return pieces
    .map((p) => ({ ...p, start: round2(p.start + startX) }))
    .filter((p) => p.start + p.length > startX - 0.001);
}

function getLagenmaat(material, verband) {
  if (verband === 'staand_tegelverband') return material.steenL + material.lint;
  return material.steenH + material.lint;
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

function fixOpeningEdgePieces(pieces, leftEdges, rightEdges, kop, driekwart, stoot, steenL) {
  if (!leftEdges.length && !rightEdges.length) return pieces;
  let result = [...pieces];

  for (const edgeX of leftEdges) {
    const idx = result.findIndex((p) => Math.abs(p.start + p.length - edgeX) < 1.5);
    if (idx < 0) continue;
    if (result[idx].length >= kop - 0.5) continue;

    let volIdx = -1;
    for (let i = idx - 1; i >= 0; i--) {
      if (result[i].label !== 'Strek') continue;
      let gapFound = false;
      for (let j = i; j < idx - 1; j++) {
        if (Math.abs(result[j + 1].start - (result[j].start + result[j].length + stoot)) > 2) { gapFound = true; break; }
      }
      if (!gapFound) { volIdx = i; break; }
    }
    if (volIdx < 0) continue;

    const S = result[idx].length;
    const cutLen = round2(S + steenL - kop);
    const shift = round2(kop - S);
    result[volIdx] = { ...result[volIdx], length: cutLen, label: 'Rest' };
    for (let i = volIdx + 1; i < idx; i++) {
      result[i] = { ...result[i], start: round2(result[i].start - shift) };
    }
    result[idx] = { ...result[idx], start: round2(edgeX - kop), length: kop, label: 'Kop' };
  }

  for (const edgeX of rightEdges) {
    const idx = result.findIndex((p) => Math.abs(p.start - edgeX) < 1.5);
    if (idx < 0) continue;
    if (result[idx].length >= kop - 0.5) continue;

    let volIdx = -1;
    for (let i = idx + 1; i < result.length; i++) {
      if (result[i].label !== 'Strek') continue;
      let gapFound = false;
      for (let j = idx; j < i - 1; j++) {
        if (Math.abs(result[j + 1].start - (result[j].start + result[j].length + stoot)) > 2) { gapFound = true; break; }
      }
      if (!gapFound) { volIdx = i; break; }
    }
    if (volIdx < 0) continue;

    const S = result[idx].length;
    const cutLen = round2(S + steenL - kop);
    const shift = round2(kop - S);
    const volEnd = round2(result[volIdx].start + result[volIdx].length);
    result[idx] = { ...result[idx], start: round2(edgeX), length: kop, label: 'Kop' };
    for (let i = idx + 1; i < volIdx; i++) {
      result[i] = { ...result[i], start: round2(result[i].start + shift) };
    }
    result[volIdx] = { ...result[volIdx], start: round2(volEnd - cutLen), length: cutLen, label: 'Rest' };
  }

  return result.filter((p) => p.length > 0.5);
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

function clipPiecesAgainstOpenings(pieces, openings, rowY, steenH) {
  if (!openings.length) return pieces;
  let result = pieces;
  for (const op of openings) {
    const ox = op.x ?? 0;
    const oy = op.y ?? 0;
    const ow = op.breedte ?? op.width ?? 0;
    const oh = op.hoogte ?? op.height ?? 0;
    if (rowY + steenH <= oy + 1 || rowY >= oy + oh - 1) continue;

    let xRanges;
    if (op.polyPts && op.polyPts.length >= 3) {
      const midY = rowY + steenH * 0.5;
      xRanges = polyXRangesAtY(op.polyPts, midY);
      if (!xRanges.length) {
        const r2 = polyXRangesAtY(op.polyPts, rowY + steenH * 0.25);
        const r3 = polyXRangesAtY(op.polyPts, rowY + steenH * 0.75);
        xRanges = [...r2, ...r3];
      }
      if (!xRanges.length) continue;
    } else {
      xRanges = [[ox, ox + ow]];
    }

    for (const [opStart, opEnd] of xRanges) {
      result = result.flatMap((piece) => {
        const ps = piece.start;
        const pe = piece.start + piece.length;
        if (pe <= opStart + 0.001 || ps >= opEnd - 0.001) return [piece];
        const out = [];
        if (ps < opStart - 0.001) out.push({ ...piece, length: round2(opStart - ps) });
        if (pe > opEnd + 0.001) out.push({ ...piece, start: round2(opEnd), length: round2(pe - opEnd) });
        return out;
      });
    }
  }
  return result.filter((p) => p.length > 0.001);
}

export function buildGroupPattern(walls, adjacencies, material, verband, openingMode = null) {
  const { steenH, lint } = material;
  const lagenmaat = getLagenmaat(material, verband);
  const rowH = verband === 'staand_tegelverband' ? material.steenL : steenH;

  if (!walls.length || lagenmaat <= 0) return {};

  const groupMinX = Math.min(...walls.map((w) => w.wallOrigin?.lengthStart ?? 0));
  const groupMaxX = Math.max(...walls.map((w) => (w.wallOrigin?.lengthStart ?? 0) - groupMinX + w.length));
  const groupWidth = round2(groupMaxX);

  const groupMinH = Math.min(...walls.map((w) => w.wallOrigin?.heightStart ?? 0));

  const result = {};

  for (const wall of walls) {
    const wallStart = round2((wall.wallOrigin?.lengthStart ?? 0) - groupMinX);
    const wallEnd = round2(wallStart + wall.length);
    const wallLagen = Math.floor((wall.height + lint) / lagenmaat);
    const verticalOffset = Math.floor(((wall.wallOrigin?.heightStart ?? 0) - groupMinH) / lagenmaat);
    const rows = [];

    const wallOpenings = openingMode
      ? (wall.openings ?? []).filter((op) =>
          openingMode === 'all' || op.type === 'raam' || op.type === 'deur'
        )
      : [];

    for (let r = 0; r < wallLagen; r++) {
      const rowY = round2(r * lagenmaat);
      const bondRow = r + verticalOffset;
      const fullPieces = buildRowPiecesForWidth(groupWidth, material, verband, bondRow, 0);
      const clipped = [];

      for (const piece of fullPieces) {
        const localPieces = clipPieceToWall(piece, wallStart, wallEnd, [], rowY, rowH);
        for (const lp of localPieces) {
          clipped.push({ ...lp, start: round2(lp.start - wallStart) });
        }
      }

      const finalPieces = openingMode ? clipPiecesAgainstOpenings(clipped, wallOpenings, rowY, rowH) : clipped;
      if (finalPieces.length) rows.push({ y: rowY, pieces: finalPieces });
    }

    result[wall.expressID] = rows;
  }

  return result;
}

export function buildFullGroupFacadePattern(walls, material, verband, maxHoogte, zetwerk, _minHoogte, startLijn, extendLeft = 0, extendRight = 0) {
  const { steenL, steenH, lint, stoot } = material;
  const lagenmaat = getLagenmaat(material, verband);
  const rowH = verband === 'staand_tegelverband' ? material.steenL : steenH;

  const withOrigin = walls.filter((w) => w.wallOrigin);
  if (!withOrigin.length || lagenmaat <= 0) return null;

  const refWall = [...withOrigin].sort((a, b) => (b.length ?? 0) - (a.length ?? 0))[0];
  const refLengthAxis = refWall.wallOrigin.lengthAxis;
  const refHeightAxis = refWall.wallOrigin.heightAxis;
  const axisWalls = withOrigin.filter((w) => w.wallOrigin.lengthAxis === refLengthAxis);

  const groupMinX = Math.min(...axisWalls.map((w) => w.wallOrigin.lengthStart ?? 0));
  const groupMaxX = Math.max(...axisWalls.map((w) => (w.wallOrigin.lengthStart ?? 0) + (w.length ?? 0)));
  const groupMinH = Math.min(...axisWalls.map((w) => w.wallOrigin.heightStart ?? 0));
  const groupMaxH = Math.max(...axisWalls.map((w) => (w.wallOrigin.heightStart ?? 0) + (w.height ?? 0)));

  const groupWidth = round2(groupMaxX - groupMinX);
  const groupHeight = round2(groupMaxH - groupMinH);
  const effectiveHeight = maxHoogte != null && maxHoogte > 0 ? Math.min(groupHeight, maxHoogte) : groupHeight;
  const effectiveMinH = startLijn ?? 0;
  const patternOffset = startLijn != null
    ? ((startLijn % lagenmaat) + lagenmaat) % lagenmaat
    : 0;
  const rStart = startLijn != null
    ? Math.floor((startLijn - patternOffset) / lagenmaat)
    : 0;
  const rEnd = Math.ceil((effectiveHeight - patternOffset) / lagenmaat);

  const zwEnabled = zetwerk?.enabled;
  const zwB = zwEnabled ? Math.max(1, zetwerk.breedte ?? 50) : 0;
  const zwH = zwEnabled ? Math.max(0, zetwerk.offsetH ?? 0) : 0;
  const zwV = zwEnabled ? Math.max(0, zetwerk.offsetV ?? 0) : 0;
  const zwS = zwEnabled ? Math.max(0, zetwerk.stripOffset ?? 5) : 0;
  const zwExpandX = zwEnabled ? (zwH + zwB + zwS) : 0;
  const zwExpandY = zwEnabled ? (zwV + zwB) : 0;

  const rawOpenings = [];
  for (const w of withOrigin) {
    const wallOffsetX = round2((w.wallOrigin.lengthStart ?? 0) - groupMinX);
    const wallOffsetH = round2((w.wallOrigin.heightStart ?? 0) - groupMinH);
    for (const op of (w.openings ?? [])) {
      const ox = round2(wallOffsetX + (op.x ?? 0));
      const oy = round2(wallOffsetH + (op.y ?? 0));
      const ow = op.breedte ?? op.width ?? 0;
      const oh = op.hoogte ?? op.height ?? 0;
      if (ow < 50 || oh < 50) continue;
      // BRON-GUARD: weiger een opening die boven z'n eigen wand uitsteekt (bv. een 2520 mm
      // venster-L die op een 300 mm vloerband is blijven plakken in oude/corrupte opgeslagen
      // data) — anders merget die na omzetting met de vensteropening erboven en mergeTwo slaat
      // de L plat tot een rechthoek → massieve hoek over-geknipt. Vlag UIT → byte-identiek.
      const wallH = w.height ?? ((w.wallOrigin.heightEnd ?? 0) - (w.wallOrigin.heightStart ?? 0));
      if (isDropOversizedOpenings() && wallH > 0 && ((op.y ?? 0) + oh) > wallH + OVERSIZED_OPENING_TOL) continue;
      // VENTILATIE_ZONE (vlag): een 'ventilatie'-opening wordt óók geknipt (gat open) en komt zo in
      // groupOpenings terecht — waar de zone-generator 'm op detecteert. Vlag UIT → alleen raam/deur.
      const isNamedOpening = op.type === 'raam' || op.type === 'deur' || (op.type === 'ventilatie' && isVentilatieZone());
      if (!isNamedOpening) continue;
      const groupPolyPts = op.polyPts
        ? op.polyPts.map((p) => ({ l: round2(p.l + wallOffsetX), h: round2(p.h + wallOffsetH) }))
        : null;
      rawOpenings.push({ x: ox, y: oy, width: ow, height: oh, polyPts: groupPolyPts, type: op.type });
    }
  }

  const mergeTwo = (a, b) => {
    const x  = Math.min(a.x, b.x);
    const y  = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.width,  b.x + b.width);
    const y2 = Math.max(a.y + a.height, b.y + b.height);
    const mergedPolyPts = [
      { l: x,  h: y },
      { l: x2, h: y },
      { l: x2, h: y2 },
      { l: x,  h: y2 },
    ];
    const type = (a.type === 'raam' || b.type === 'raam') ? 'raam'
      : (a.type === 'deur' || b.type === 'deur') ? 'deur' : (a.type ?? b.type);
    return { x, y, width: x2 - x, height: y2 - y, polyPts: mergedPolyPts, type };
  };

  const shouldMerge = (a, b) => {
    const ax1 = a.x, ax2 = a.x + a.width;
    const bx1 = b.x, bx2 = b.x + b.width;
    const ay1 = a.y, ay2 = a.y + a.height;
    const by1 = b.y, by2 = b.y + b.height;
    const overlapX = Math.min(ax2, bx2) - Math.max(ax1, bx1);
    const overlapY = Math.min(ay2, by2) - Math.max(ay1, by1);
    return overlapX > 50 && overlapY > 50;
  };

  let merged = [...rawOpenings];
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        if (shouldMerge(merged[i], merged[j])) {
          merged = [...merged.slice(0, i), mergeTwo(merged[i], merged[j]), ...merged.slice(i + 1, j), ...merged.slice(j + 1)];
          changed = true;
          break outer;
        }
      }
    }
  }

  const groupOpenings = merged;

  function expandPolygon(pts, dx, dy) {
    if (!pts || pts.length < 3) return pts;
    const cx = pts.reduce((s, p) => s + p.l, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.h, 0) / pts.length;
    return pts.map((p) => ({
      l: p.l + (p.l >= cx ? dx : -dx),
      h: p.h + (p.h >= cy ? dy : -dy),
    }));
  }

  const maskOpenings = groupOpenings.map((op) => ({
    x: Math.max(0, op.x - zwExpandX),
    y: Math.max(0, op.y - zwExpandY),
    width: op.width + 2 * zwExpandX,
    height: op.height + 2 * zwExpandY,
    polyPts: op.polyPts ? (zwEnabled ? expandPolygon(op.polyPts, zwExpandX, zwExpandY) : op.polyPts) : null,
  }));

  function cutSegments(segments, ox1, ox2) {
    const result = [];
    for (const seg of segments) {
      if (seg.end <= ox1 + 0.001 || seg.start >= ox2 - 0.001) {
        result.push(seg);
      } else {
        if (seg.start < ox1 - 0.001) result.push({ start: seg.start, end: ox1 });
        if (seg.end > ox2 + 0.001) result.push({ start: ox2, end: seg.end });
      }
    }
    return result;
  }

  function splitAroundOpenings(piece, rowY) {
    let segments = [{ start: piece.start, end: piece.start + piece.length }];
    for (const op of maskOpenings) {
      if (rowY + rowH < op.y + 1 || rowY > op.y + op.height + 1) continue;
      if (op.polyPts && op.polyPts.length >= 3) {
        const midY = rowY + rowH * 0.5;
        const ranges = polyXRangesAtY(op.polyPts, midY);
        if (!ranges.length) {
          const y2 = rowY + rowH * 0.25;
          const y3 = rowY + rowH * 0.75;
          const r2 = polyXRangesAtY(op.polyPts, y2);
          const r3 = polyXRangesAtY(op.polyPts, y3);
          for (const [ox1, ox2] of [...r2, ...r3]) segments = cutSegments(segments, ox1, ox2);
        } else {
          for (const [ox1, ox2] of ranges) segments = cutSegments(segments, ox1, ox2);
        }
      } else {
        segments = cutSegments(segments, op.x, op.x + op.width);
      }
    }
    return segments
      .filter((s) => s.end - s.start > 0.5)
      .map((s) => ({ ...piece, start: round2(s.start), length: round2(s.end - s.start) }));
  }

  const kop = round2((steenL - stoot) / 2);
  const driekwart = round2((steenL + stoot) * 0.75 - stoot);

  const effectiveWidth = round2(groupWidth + extendLeft + extendRight);
  const rows = [];
  for (let r = rStart; r < rEnd; r++) {
    const rowY = round2(patternOffset + r * lagenmaat);
    const builtPieces = buildRowPiecesForWidth(effectiveWidth, material, verband, r, 0);
    const rawPieces = extendLeft > 0
      ? builtPieces.map((p) => ({ ...p, start: round2(p.start - extendLeft) }))
      : builtPieces;
    const clipped = [];
    for (const piece of rawPieces) {
      const parts = splitAroundOpenings(piece, rowY);
      for (const p of parts) clipped.push(p);
    }

    if (verband !== 'staand_tegelverband' && maskOpenings.length) {
      const leftEdges = [];
      const rightEdges = [];
      for (const op of maskOpenings) {
        const opY = op.y ?? 0;
        const opH = op.height ?? 0;
        if (rowY + 1 >= opY && rowY < opY + opH - 1) {
          if (op.polyPts && op.polyPts.length >= 3) {
            const midY = rowY + rowH * 0.5;
            const ranges = polyXRangesAtY(op.polyPts, midY);
            for (const [ox1, ox2] of ranges) { leftEdges.push(ox1); rightEdges.push(ox2); }
          } else {
            leftEdges.push(op.x);
            rightEdges.push(op.x + op.width);
          }
        }
      }
      if (leftEdges.length) {
        const fixed = fixOpeningEdgePieces(clipped, leftEdges, rightEdges, kop, driekwart, stoot, steenL);
        clipped.length = 0;
        for (const p of fixed) clipped.push(p);
      }
    }

    if (effectiveMinH > 0 && rowY < effectiveMinH) {
      clipped.length = 0;
    }

    if (clipped.length) rows.push({ y: rowY, pieces: clipped });
  }

  return { rows, groupMinX, groupMinH, groupWidth, groupHeight: effectiveHeight, extendLeft, extendRight, patternStartH: effectiveMinH, groupOpenings, zetwerkParams: zwEnabled ? { breedte: zwB, offsetH: zwH, offsetV: zwV } : null, refWallOrigin: refWall.wallOrigin };
}

export function getGroupPatternLogic(walls, material, verband) {
  const { steenL, steenH, lint, stoot } = material;
  const lagenmaat = getLagenmaat(material, verband);
  if (!walls.length || lagenmaat <= 0) return [];

  const wallsWithOrigin = walls.filter((w) => w.wallOrigin);
  const groupMinX = wallsWithOrigin.length ? Math.min(...wallsWithOrigin.map((w) => w.wallOrigin.lengthStart)) : 0;
  const groupMaxX = wallsWithOrigin.length ? Math.max(...wallsWithOrigin.map((w) => w.wallOrigin.lengthStart + w.length)) : 0;
  const groupWidth = Math.round(groupMaxX - groupMinX);
  const groupMinH = wallsWithOrigin.length ? Math.min(...wallsWithOrigin.map((w) => w.wallOrigin.heightStart)) : 0;
  const groupMaxH = wallsWithOrigin.length ? Math.max(...wallsWithOrigin.map((w) => w.wallOrigin.heightStart + w.height)) : 0;
  const groupHeight = Math.round(groupMaxH - groupMinH);

  const kop = Math.round((steenL - stoot) / 2);
  const totallagen = Math.floor((groupHeight + lint) / lagenmaat);

  const lines = [];
  const verbandLabel = verband === 'halfsteens' ? 'Halfsteens' : verband === 'staand_tegelverband' ? 'Staand tegelverband' : 'Tegelverband';
  lines.push({ label: 'Verband', value: verbandLabel });
  lines.push({ label: 'Gevelbreedte', value: `${groupWidth} mm  (${wallsWithOrigin.length} wand${wallsWithOrigin.length !== 1 ? 'en' : ''})` });
  lines.push({ label: 'Gevelhoogte', value: `${groupHeight} mm` });
  lines.push({ label: 'Referentie X', value: 'Linker zijkant groep  (x = 0)' });
  lines.push({ label: 'Referentie Y', value: 'Onderkant laagste wand  (y = 0)' });
  lines.push({ label: 'Steenstrip', value: `${steenL} × ${steenH} mm` });
  lines.push({ label: 'Voegen', value: `lintvoeg ${lint} mm · stootvoeg ${stoot} mm` });

  if (verband === 'staand_tegelverband') {
    lines.push({ label: 'Oriëntatie', value: 'Strips verticaal — steenL is hoogte, steenH is breedte per kolom' });
    lines.push({ label: 'Kolombreedte', value: `${steenH} mm + stootvoeg ${stoot} mm = ${steenH + stoot} mm hart-op-hart` });
    lines.push({ label: 'Lagenmaat', value: `${lagenmaat} mm  (steenL + lintvoeg)` });
    lines.push({ label: 'Lagen (totaal)', value: `${totallagen} rijen verticale strips` });
    lines.push({ label: 'Verspinging', value: 'Geen — alle rijen beginnen op dezelfde X-positie' });
  } else {
    lines.push({ label: 'Lagenmaat', value: `${lagenmaat} mm  (steenH + lintvoeg)` });
    lines.push({ label: 'Lagen (totaal)', value: `${totallagen} lagen` });
    if (verband === 'halfsteens') {
      lines.push({ label: 'Rij 1 (even)', value: `kop (${kop} mm) → hele stenen (${steenL} mm) → afsluitkop` });
      lines.push({ label: 'Rij 2 (oneven)', value: `hele stenen (${steenL} mm) → reststeen` });
      lines.push({ label: 'Horizontale verspinging', value: `${Math.round(steenL / 2 + stoot / 2)} mm  (halve steen + halve stootvoeg)` });
    } else {
      lines.push({ label: 'Rij 1', value: `hele stenen (${steenL} mm)` });
      lines.push({ label: 'Rij 2', value: `hele stenen (${steenL} mm) · geen verspinging` });
    }
  }

  lines.push({ label: 'Verticale bond', value: 'Rijindex gebaseerd op hoogte in groep — doorlopend over gestapelde wanden' });

  const hasDiffHeights = wallsWithOrigin.some((w) => Math.abs((w.wallOrigin.heightStart - groupMinH)) > 5);
  if (hasDiffHeights) {
    lines.push({ label: 'Hoogte offset', value: 'Wanden op verschillende hoogtes — rijindex gecorrigeerd per wand' });
  }

  return lines;
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
  const { steenH, steenL, lint } = material;
  const lagenmaat = getLagenmaat(material, verband);
  const lagen = lagenmaat > 0 ? Math.floor((wall.height + lint) / lagenmaat) : 0;
  const brickRowH = verband === 'staand_tegelverband' ? steenL : steenH;
  const rows = [];

  for (let r = 0; r < lagen; r++) {
    const rowY = round2(r * lagenmaat);
    const pieces = buildRowPiecesForWidth(wall.length, material, verband, r, 0);
    const filtered = pieces.filter((p) => {
      return !isInOpening(p.start, rowY, (wall.openings ?? []).filter((o) => o.type === 'raam' || o.type === 'deur'), brickRowH);
    });
    if (filtered.length) rows.push({ y: rowY, pieces: filtered });
  }

  return rows;
}

export function buildFacePattern(width, height, material, verband, rowOffset = 0) {
  const lagenmaat = getLagenmaat(material, verband);
  const lagen = lagenmaat > 0 ? Math.ceil(height / lagenmaat) : 0;
  const rows = [];
  for (let r = 0; r < lagen; r++) {
    const rowY = round2(r * lagenmaat);
    const pieces = buildRowPiecesForWidth(width, material, verband, r + rowOffset, 0);
    if (pieces.length) rows.push({ y: rowY, pieces });
  }
  return rows;
}

function mirrorPieces(pieces, totalWidth) {
  return pieces
    .map((p) => ({ ...p, start: round2(totalWidth - p.start - p.length) }))
    .sort((a, b) => a.start - b.start);
}

export function buildCenteredFacePattern(width, height, material, verband, rowOffset = 0) {
  const { steenL, steenH, lint, stoot } = material;

  if (verband === 'staand_tegelverband') {
    const tileW = steenH + stoot;
    const lagenmaat = steenL + lint;
    const lagen = lagenmaat > 0 ? Math.ceil(height / lagenmaat) : 0;
    const center = width / 2;
    const kop = round2((steenL - stoot) / 2);
    const rows = [];
    for (let r = 0; r < lagen; r++) {
      const rowY = round2(r * lagenmaat);
      const refStart = round2(center - steenH / 2);
      const pieces = [];
      let x = refStart;
      while (x - tileW >= -tileW + 0.001) x = round2(x - tileW);
      while (x < width - 0.001) {
        const realStart = Math.max(0, round2(x));
        const realEnd = Math.min(width, round2(x + steenH));
        const len = round2(realEnd - realStart);
        if (len > 0.001) pieces.push({ start: realStart, length: len, label: len < steenH - 0.001 ? 'Rest' : 'Tegel' });
        x = round2(x + tileW);
      }
      if (pieces.length) rows.push({ y: rowY, pieces });
    }
    return rows;
  }

  const unit = steenL + stoot;
  const kop = round2((steenL - stoot) / 2);
  const lagenmaat = steenH + lint;
  const lagen = lagenmaat > 0 ? Math.ceil(height / lagenmaat) : 0;
  const center = width / 2;
  const rows = [];

  for (let r = 0; r < lagen; r++) {
    const rowY = round2(r * lagenmaat);
    const isOdd = (r + rowOffset) % 2 !== 0;
    const shift = verband === 'halfsteens' && isOdd ? unit / 2 : 0;
    const refStart = round2(center - steenL / 2 + shift);

    let x = refStart;
    while (x - unit >= -unit + 0.001) x = round2(x - unit);

    const pieces = [];
    while (x < width - 0.001) {
      const realStart = Math.max(0, round2(x));
      const realEnd = Math.min(width, round2(x + steenL));
      const len = round2(realEnd - realStart);
      if (len > 0.001) {
        let label = 'Strek';
        if (len < steenL - 0.001) {
          label = Math.abs(len - kop) < 1 ? 'Kop' : 'Rest';
        }
        pieces.push({ start: realStart, length: len, label });
      }
      x = round2(x + unit);
    }
    if (pieces.length) rows.push({ y: rowY, pieces });
  }
  return rows;
}

export function buildSymmetricFacePattern(width, height, material, verband, rowOffset = 0) {
  const { steenH, lint } = material;
  const lagenmaat = steenH + lint;
  const lagen = lagenmaat > 0 ? Math.ceil(height / lagenmaat) : 0;
  const half = width / 2;
  const rows = [];
  for (let r = 0; r < lagen; r++) {
    const rowY = round2(r * lagenmaat);
    const rightPieces = buildRowPiecesForWidth(half, material, verband, r + rowOffset, 0)
      .map((p) => ({ ...p, start: round2(p.start + half) }));
    const leftPieces = mirrorPieces(
      rightPieces.map((p) => ({ ...p, start: round2(p.start - half) })),
      half
    );
    const all = [...leftPieces, ...rightPieces].sort((a, b) => a.start - b.start);
    if (all.length) rows.push({ y: rowY, pieces: all });
  }
  return rows;
}

export const WILDVERBAND_MODULE = [0, 1, 2, 3, 4, 5];

export function getWildverbandModuleWidth(material) {
  const { steenL: S, stoot: j } = material;
  const D = Math.round((3 * S - j) / 4);
  const K = Math.round((S - j) / 2);
  return 4 * S + D + K + 6 * j;
}

export function getWildverbandPanelBoundary(material) {
  const { steenL: S, stoot: j } = material;
  const D = Math.round((3 * S - j) / 4);
  const K = Math.round((S - j) / 2);
  return 4 * S + D + K + 5 * j + Math.round(j / 2);
}

export function buildWildverbandRow(panelWidth, material, globalRowIndex, isStartPanel = false) {
  const { steenL: S, stoot: j } = material;
  const K = Math.round((S - j) / 2);
  const D = Math.round((3 * S - j) / 4);
  const MODULE = [S, S, D, S, K, S];
  const startIdx = ((globalRowIndex % 6) + 6) % 6;

  const strips = [];
  let x = 0;
  let bi = startIdx;

  while (x < panelWidth - 0.5) {
    const bLen = MODULE[bi % 6];
    const label = Math.abs(bLen - S) < 1 ? 'Strek' : Math.abs(bLen - K) < 1 ? 'Kop' : 'Drieklezoor';
    const clipped = Math.min(bLen, panelWidth - x);
    if (clipped > 0.5) {
      strips.push({ x: Math.round(x * 10) / 10, width: clipped, label });
    }
    x = Math.round((x + bLen + j) * 10) / 10;
    bi++;
  }

  const boundary = getWildverbandPanelBoundary(material);
  const modWidth = getWildverbandModuleWidth(material);

  for (let k = 0; k < strips.length; k++) {
    const s = strips[k];
    let isKoppelstrip = false;
    for (let m = 1; m * modWidth - j / 2 <= panelWidth + 0.5; m++) {
      const boundaryX = m * boundary - (m - 1) * (modWidth - boundary);
      if (Math.abs(s.x - boundaryX) < 1) {
        isKoppelstrip = true;
        break;
      }
    }
    if (isKoppelstrip) strips[k] = { ...s, koppelstrip: true };
  }

  if (!isStartPanel && strips.length > 0) {
    strips[0] = { ...strips[0], koppelstrip: true };
  }

  return strips;
}

export function buildMirroredFacePattern(width, height, material, verband, rowOffset = 0) {
  const rows = buildFacePattern(width, height, material, verband, rowOffset);
  return rows.map((row) => ({
    ...row,
    pieces: mirrorPieces(row.pieces, width),
  }));
}
