import { polyXRangesAtY } from './geometry.js';

// ─────────────────────────────────────────────────────────────────
// Interne hulpfuncties
// ─────────────────────────────────────────────────────────────────

function round2(v) {
  return Math.round(v * 100) / 100;
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

/**
 * Bouw de steenposities voor één rij over de opgegeven breedte.
 * startX verschuift het patroon zodat een rij halverwege de groep kan beginnen
 * (verbandkoppeling bij aangrenzende wanden).
 *
 * @param {number} totalWidth   - totale breedte van het ontvouwen vlak
 * @param {object} material     - { steenL, steenH, lint, stoot }
 * @param {string} verband      - 'halfsteens' | 'tegelverband' | 'staand_tegelverband' | 'wild'
 * @param {number} rowIndex     - rij-index (bepaalt verspinging)
 * @param {number} startX       - globale X-offset (voor verbandkoppeling)
 * @returns {Array<{start,length,label}>}
 */
function buildRowPiecesForWidth(totalWidth, material, verband, rowIndex, startX) {
  const { steenL, steenH, lint, stoot } = material;

  if (verband === 'staand_tegelverband') {
    const stepW = steenH + stoot;
    const pieces = [];
    let x = 0;
    while (x + 0.001 < totalWidth) {
      const len = round2(Math.min(steenH, totalWidth - x));
      if (len > 0.001) pieces.push({ start: round2(x + startX), length: len, label: len < steenH - 0.001 ? 'Rest' : 'Tegel' });
      x += stepW;
    }
    return pieces;
  }

  if (verband === 'wild') {
    const wildShifts = [0, 0.5, 0.25, 0.75, 0.33, 0.67, 0.1, 0.6];
    const shiftFrac = wildShifts[((rowIndex % wildShifts.length) + wildShifts.length) % wildShifts.length];
    const shift = round2(shiftFrac * (steenL + stoot));
    const unit = steenL + stoot;
    const pieces = [];
    let x = shift - unit;
    while (x + steenL <= 0) x = round2(x + unit);
    while (x < totalWidth - 0.001) {
      const realStart = Math.max(0, round2(x));
      const realEnd = Math.min(totalWidth, round2(x + steenL));
      const len = round2(realEnd - realStart);
      if (len > 0.001) pieces.push({ start: realStart, length: len, label: len < steenL - 0.001 ? 'Rest' : 'Vol' });
      x = round2(x + unit);
    }
    if (startX === 0) return pieces;
    return pieces
      .map(p => ({ ...p, start: round2(p.start + startX) }))
      .filter(p => p.start + p.length > startX - 0.001);
  }

  const kop = round2((steenL - stoot) / 2);
  const driekwart = round2((steenL + stoot) * 0.75 - stoot);

  const useKop = verband === 'halfsteens' && rowIndex % 2 === 0;
  const halfsteensShift = verband === 'halfsteens' && rowIndex % 2 !== 0
    ? round2((steenL + stoot) / 2)
    : 0;

  let pieces = [];

  if (useKop) {
    pieces.push({ start: 0, length: kop, label: 'Kop' });
  }

  pieces = recomputeStarts(pieces, stoot);

  let logicalX = pieces.length
    ? pieces[pieces.length - 1].start + pieces[pieces.length - 1].length + stoot
    : halfsteensShift;

  while (logicalX + steenL <= totalWidth + 0.001) {
    pieces.push({ start: round2(logicalX), length: steenL, label: 'Vol' });
    logicalX += steenL;
    if (logicalX + stoot + steenL <= totalWidth + 0.001 || logicalX < totalWidth) {
      logicalX += stoot;
    }
  }

  pieces = recomputeStarts(pieces.length && pieces[0].label === 'Kop'
    ? [pieces[0], ...pieces.slice(1)]
    : pieces, stoot);

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

// ─────────────────────────────────────────────────────────────────
// Wandketens opbouwen (verbandkoppeling over hoeken)
// ─────────────────────────────────────────────────────────────────

const POINT_TOL = 50;

function wallId(wall) {
  return wall.id ?? String(wall.expressID);
}

/**
 * Sorteer wanden in aaneengesloten ketens op basis van startPoint/endPoint.
 * Wanden waarvan het eindpunt aansluit op het startpunt van de volgende wand
 * worden in volgorde geketend → patroon loopt door over de hoek.
 *
 * @param {object[]} walls
 * @returns {object[][]} - array van ketens (elke keten = array van wanden in volgorde)
 */
function buildWallChains(walls) {
  if (!walls.length) return [];

  const hasPoints = walls.some(w => w.startPoint || w.endPoint);

  if (!hasPoints) {
    const sorted = [...walls].sort((a, b) =>
      (a.wallOrigin?.lengthStart ?? 0) - (b.wallOrigin?.lengthStart ?? 0)
    );
    return [sorted];
  }

  const ids = walls.map(wallId);
  const wallMap = new Map(walls.map(w => [wallId(w), w]));

  function ptClose(a, b) {
    if (!a || !b) return false;
    return Math.abs(a.x - b.x) <= POINT_TOL && Math.abs(a.y - b.y) <= POINT_TOL;
  }

  const successorMap = new Map();
  const predecessorSet = new Set();

  for (const a of walls) {
    const idA = wallId(a);
    for (const b of walls) {
      if (a === b) continue;
      const idB = wallId(b);
      if (ptClose(a.endPoint, b.startPoint)) {
        if (!successorMap.has(idA)) {
          successorMap.set(idA, idB);
          predecessorSet.add(idB);
        }
      }
    }
  }

  const visited = new Set();
  const chains = [];

  for (const id of ids) {
    if (visited.has(id) || predecessorSet.has(id)) continue;
    const chain = [];
    let cur = id;
    while (cur && !visited.has(cur)) {
      chain.push(wallMap.get(cur));
      visited.add(cur);
      cur = successorMap.get(cur);
    }
    if (chain.length) chains.push(chain);
  }

  for (const id of ids) {
    if (!visited.has(id)) {
      chains.push([wallMap.get(id)]);
      visited.add(id);
    }
  }

  return chains;
}

// ─────────────────────────────────────────────────────────────────
// Patroon voor één groep (interne helper)
// ─────────────────────────────────────────────────────────────────

function buildGroupPatternForWalls(walls, material, verband, kleur, groupId) {
  const { steenH, lint } = material;
  const lagenmaat = getLagenmaat(material, verband);
  const rowH = verband === 'staand_tegelverband' ? material.steenL : steenH;

  if (lagenmaat <= 0) return {};

  const groupMinH = Math.min(...walls.map(w => w.wallOrigin?.heightStart ?? 0));

  const chains = buildWallChains(walls);
  const result = {};

  for (const chain of chains) {
    let unfoldedX = 0;
    const wallOffsets = [];

    for (const wall of chain) {
      wallOffsets.push(unfoldedX);
      unfoldedX = round2(unfoldedX + (wall.length ?? 0));
    }

    const chainWidth = unfoldedX;
    if (chainWidth <= 0) continue;

    for (let i = 0; i < chain.length; i++) {
      const wall = chain[i];
      const wallStart = wallOffsets[i];
      const wallEnd = round2(wallStart + (wall.length ?? 0));

      const wallH = wall.wallOrigin?.heightStart ?? 0;
      const verticalOffset = Math.round((wallH - groupMinH) / lagenmaat);
      const wallLagen = Math.floor(((wall.height ?? 0) + lint) / lagenmaat);

      const rows = [];

      for (let r = 0; r < wallLagen; r++) {
        const rowY = round2(r * lagenmaat);
        const bondRow = r + verticalOffset;

        const fullPieces = buildRowPiecesForWidth(chainWidth, material, verband, bondRow, 0);
        const clipped = [];

        for (const piece of fullPieces) {
          const ps = piece.start;
          const pe = ps + piece.length;
          const cs = Math.max(ps, wallStart);
          const ce = Math.min(pe, wallEnd);
          if (ce <= cs + 0.001) continue;

          const localStart = round2(cs - wallStart);

          if (isInOpening(localStart, rowY, wall.openings ?? [], rowH)) continue;

          clipped.push({
            start: localStart,
            length: round2(ce - cs),
            label: piece.label,
            kleur,
          });
        }

        if (clipped.length) rows.push({ y: rowY, pieces: clipped });
      }

      result[wallId(wall)] = {
        rows,
        groupId,
        settings: { material, verband, kleur },
      };
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────
// Publieke API — nieuw (Agent 3)
// ─────────────────────────────────────────────────────────────────

/**
 * Standaard steenmaat (mm).
 */
export const DEFAULT_MATERIAL = {
  steenL: 212,
  steenH: 50,
  lint: 12,
  stoot: 10,
};

/**
 * Bereken het brickslip patroon voor alle groepen.
 *
 * Per groep wordt het patroon als één doorlopend vlak berekend:
 * - Aangrenzende wanden krijgen verbandkoppeling (patroon loopt door over de hoek).
 * - Losstaande wanden beginnen het patroon opnieuw.
 * - Openingen (ramen/deuren) worden per wand uitgesloten.
 * - Elk groep is afzonderlijk instelbaar (steenmaat, voegmaat, verband, kleur).
 *
 * @param {Array<{id:string, wallIds:string[], label:string}>} groups
 *   Groepen zoals geproduceerd door Agent 2 (`buildGroups`).
 *
 * @param {Array<object>} walls
 *   Wandobjecten met geometrie (Agent 1 of gecombineerd). Verwachte velden:
 *   - `id` of `expressID`   — unieke wandidentificatie
 *   - `length`              — wandbreedte in mm
 *   - `height`              — wandhoogte in mm
 *   - `openings`            — optioneel: array van openingen ({ x, y, width/breedte, height/hoogte })
 *   - `wallOrigin`          — optioneel: { lengthStart, heightStart } voor positie in groep
 *   - `startPoint`/`endPoint` — optioneel: { x, y } voor hoekdetectie (verbandkoppeling)
 *
 * @param {Object.<string, {material?:object, verband?:string, kleur?:string}>} [groupSettings={}]
 *   Per-groep instellingen, gekeyed op group.id.
 *
 * @param {{material?:object, verband?:string, kleur?:string}} [defaultSettings={}]
 *   Fallback instellingen voor groepen zonder eigen instelling.
 *
 * @returns {Object.<string, {rows:Array, groupId:string, settings:object}>}
 *   Per wand-id: `rows` = array van rijen met steenposities, plus groep-metadata.
 *   Elke rij: `{ y: number, pieces: Array<{start, length, label, kleur}> }`.
 */
export function buildAllGroupsPattern(groups, walls, groupSettings = {}, defaultSettings = {}) {
  const wallMap = new Map(walls.map(w => [wallId(w), w]));
  const result = {};

  for (const group of groups) {
    const groupWalls = group.wallIds
      .map(id => wallMap.get(id))
      .filter(Boolean);

    if (!groupWalls.length) continue;

    const settings = { ...defaultSettings, ...(groupSettings[group.id] ?? {}) };
    const material = settings.material ?? DEFAULT_MATERIAL;
    const verband = settings.verband ?? 'halfsteens';
    const kleur = settings.kleur ?? '#a64033';

    const groupResult = buildGroupPatternForWalls(groupWalls, material, verband, kleur, group.id);

    for (const [id, data] of Object.entries(groupResult)) {
      result[id] = data;
    }
  }

  return result;
}

/**
 * Retourneer de ketenvolgorde van wanden binnen een groep (hulpfunctie voor UI).
 * Nuttig voor het tonen van de ontvouwen volgorde of debuggen.
 *
 * @param {object[]} walls
 * @returns {object[][]} - ketens van wanden in volgorde
 */
export function getWallChains(walls) {
  return buildWallChains(walls);
}

// ─────────────────────────────────────────────────────────────────
// Publieke API — bestaand (Agent 1 / multi-element branch)
// ─────────────────────────────────────────────────────────────────

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

/**
 * Bereken het patroon voor een groep wanden als één doorlopend vlak.
 * Gebruikt `wallOrigin.lengthStart` voor positionering (coplanaire wanden).
 *
 * @param {object[]} walls       - wanden met wallOrigin, length, height, openings
 * @param {object}   adjacencies - niet meer gebruikt (legacy parameter)
 * @param {object}   material    - { steenL, steenH, lint, stoot }
 * @param {string}   verband     - verbandtype
 * @returns {Object.<string, Array>} - per expressID een array van rijen
 */
export function buildGroupPattern(walls, adjacencies, material, verband) {
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

    for (let r = 0; r < wallLagen; r++) {
      const rowY = round2(r * lagenmaat);
      const bondRow = r + verticalOffset;
      const fullPieces = buildRowPiecesForWidth(groupWidth, material, verband, bondRow, 0);
      const clipped = [];

      for (const piece of fullPieces) {
        const localPieces = clipPieceToWall(piece, wallStart, wallEnd, wall.openings, rowY, rowH);
        for (const lp of localPieces) {
          clipped.push({ ...lp, start: round2(lp.start - wallStart) });
        }
      }

      if (clipped.length) rows.push({ y: rowY, pieces: clipped });
    }

    result[wall.expressID] = rows;
  }

  return result;
}

/**
 * Bereken het volledige gevelpatroon voor een groep als één aaneengesloten vlak.
 * Ondersteunt openingen, zetwerk-uitsparing en hoogte-limieten.
 *
 * @param {object[]} walls
 * @param {object}   material
 * @param {string}   verband
 * @param {number|null} maxHoogte
 * @param {object|null} zetwerk
 * @param {number|null} minHoogte
 * @returns {object|null}
 */
export function buildFullGroupFacadePattern(walls, material, verband, maxHoogte, zetwerk, minHoogte) {
  const { steenH, lint } = material;
  const lagenmaat = getLagenmaat(material, verband);
  const rowH = verband === 'staand_tegelverband' ? material.steenL : steenH;

  const withOrigin = walls.filter((w) => w.wallOrigin);
  if (!withOrigin.length || lagenmaat <= 0) return null;

  const groupMinX = Math.min(...withOrigin.map((w) => w.wallOrigin.lengthStart));
  const groupMaxX = Math.max(...withOrigin.map((w) => w.wallOrigin.lengthStart + w.length));
  const groupMinH = Math.min(...withOrigin.map((w) => w.wallOrigin.heightStart));
  const groupMaxH = Math.max(...withOrigin.map((w) => w.wallOrigin.heightStart + w.height));

  const groupWidth = round2(groupMaxX - groupMinX);
  const groupHeight = round2(groupMaxH - groupMinH);
  const effectiveHeight = maxHoogte != null && maxHoogte > 0 ? Math.min(groupHeight, maxHoogte) : groupHeight;
  const totalLagen = Math.ceil(effectiveHeight / lagenmaat);
  const effectiveMinH = (minHoogte != null && minHoogte > 0 && minHoogte < effectiveHeight) ? minHoogte : 0;
  const startLaag = effectiveMinH > 0 ? Math.floor(effectiveMinH / lagenmaat) : 0;

  const zwEnabled = zetwerk?.enabled;
  const zwB = zwEnabled ? Math.max(1, zetwerk.breedte ?? 50) : 0;
  const zwH = zwEnabled ? Math.max(0, zetwerk.offsetH ?? 0) : 0;
  const zwV = zwEnabled ? Math.max(0, zetwerk.offsetV ?? 0) : 0;
  const zwExpandX = zwEnabled ? (zwH + zwB) : 0;
  const zwExpandY = zwEnabled ? (zwV + zwB) : 0;

  const rawOpenings = [];
  for (const w of withOrigin) {
    const wallOffsetX = round2(w.wallOrigin.lengthStart - groupMinX);
    const wallOffsetH = round2(w.wallOrigin.heightStart - groupMinH);
    for (const op of (w.openings ?? [])) {
      const ox = round2(wallOffsetX + (op.x ?? 0));
      const oy = round2(wallOffsetH + (op.y ?? 0));
      const ow = op.breedte ?? op.width ?? 0;
      const oh = op.hoogte ?? op.height ?? 0;
      if (ow < 50 || oh < 50) continue;
      const isNamedOpening = op.type === 'raam' || op.type === 'deur';
      const isLarge = ow >= 400 && oh >= 400;
      if (!isNamedOpening && !isLarge) continue;
      const groupPolyPts = op.polyPts
        ? op.polyPts.map((p) => ({ l: round2(p.l + wallOffsetX), h: round2(p.h + wallOffsetH) }))
        : null;
      rawOpenings.push({ x: ox, y: oy, width: ow, height: oh, polyPts: groupPolyPts });
    }
  }

  const mergeTwo = (a, b) => {
    const x  = Math.min(a.x, b.x);
    const y  = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.width,  b.x + b.width);
    const y2 = Math.max(a.y + a.height, b.y + b.height);
    return { x, y, width: x2 - x, height: y2 - y,
      polyPts: [{ l: x, h: y }, { l: x2, h: y }, { l: x2, h: y2 }, { l: x, h: y2 }] };
  };

  const shouldMerge = (a, b) => {
    const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
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

  const maskOpenings = groupOpenings.map((op) => ({
    x: Math.max(0, op.x - zwExpandX),
    y: Math.max(0, op.y - zwExpandY),
    width: op.width + 2 * zwExpandX,
    height: op.height + 2 * zwExpandY,
    polyPts: op.polyPts ?? null,
  }));

  function cutSegments(segments, ox1, ox2) {
    const out = [];
    for (const seg of segments) {
      if (seg.end <= ox1 + 0.001 || seg.start >= ox2 - 0.001) {
        out.push(seg);
      } else {
        if (seg.start < ox1 - 0.001) out.push({ start: seg.start, end: ox1 });
        if (seg.end > ox2 + 0.001) out.push({ start: ox2, end: seg.end });
      }
    }
    return out;
  }

  function splitAroundOpenings(piece, rowY) {
    let segments = [{ start: piece.start, end: piece.start + piece.length }];
    for (const op of maskOpenings) {
      if (rowY + 1 < op.y || rowY + rowH > op.y + op.height + 1) continue;
      if (op.polyPts && op.polyPts.length >= 3) {
        const midY = rowY + rowH * 0.5;
        const ranges = polyXRangesAtY(op.polyPts, midY);
        if (!ranges.length) {
          const r2 = polyXRangesAtY(op.polyPts, rowY + rowH * 0.25);
          const r3 = polyXRangesAtY(op.polyPts, rowY + rowH * 0.75);
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

  const rows = [];
  for (let r = startLaag; r < totalLagen; r++) {
    const rowY = round2(r * lagenmaat);
    const rawPieces = buildRowPiecesForWidth(groupWidth, material, verband, r, 0);
    const clipped = [];
    for (const piece of rawPieces) {
      const parts = splitAroundOpenings(piece, rowY);
      for (const p of parts) clipped.push(p);
    }
    if (clipped.length) rows.push({ y: rowY, pieces: clipped });
  }

  return {
    rows,
    groupMinX,
    groupMinH,
    groupWidth,
    groupHeight: effectiveHeight,
    patternStartH: effectiveMinH,
    groupOpenings,
    zetwerkParams: zwEnabled ? { breedte: zwB, offsetH: zwH, offsetV: zwV } : null,
  };
}

/**
 * Geeft leesbare uitleg over de patroonlogica voor een groep wanden.
 *
 * @param {object[]} walls
 * @param {object}   material
 * @param {string}   verband
 * @returns {Array<{label:string, value:string}>}
 */
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
  const verbandLabel = {
    halfsteens: 'Halfsteens',
    staand_tegelverband: 'Staand tegelverband',
    wild: 'Wild verband',
  }[verband] ?? 'Tegelverband';

  lines.push({ label: 'Verband', value: verbandLabel });
  lines.push({ label: 'Gevelbreedte', value: `${groupWidth} mm  (${wallsWithOrigin.length} wand${wallsWithOrigin.length !== 1 ? 'en' : ''})` });
  lines.push({ label: 'Gevelhoogte', value: `${groupHeight} mm` });
  lines.push({ label: 'Referentie X', value: 'Linker zijkant groep  (x = 0)' });
  lines.push({ label: 'Referentie Y', value: 'Onderkant laagste wand  (y = 0)' });
  lines.push({ label: 'Steenstrip', value: `${steenL} × ${steenH} mm` });
  lines.push({ label: 'Voegen', value: `lintvoeg ${lint} mm · stootvoeg ${stoot} mm` });

  if (verband === 'staand_tegelverband') {
    lines.push({ label: 'Lagenmaat', value: `${lagenmaat} mm  (steenL + lintvoeg)` });
    lines.push({ label: 'Lagen (totaal)', value: `${totallagen} rijen verticale strips` });
    lines.push({ label: 'Verspinging', value: 'Geen — alle rijen beginnen op dezelfde X-positie' });
  } else if (verband === 'wild') {
    lines.push({ label: 'Lagenmaat', value: `${lagenmaat} mm  (steenH + lintvoeg)` });
    lines.push({ label: 'Lagen (totaal)', value: `${totallagen} lagen` });
    lines.push({ label: 'Verspinging', value: 'Wisselend per rij — deterministische pseudo-willekeurige offset' });
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

  const hasDiffHeights = wallsWithOrigin.some((w) => Math.abs(w.wallOrigin.heightStart - groupMinH) > 5);
  if (hasDiffHeights) {
    lines.push({ label: 'Hoogte offset', value: 'Wanden op verschillende hoogtes — rijindex gecorrigeerd per wand' });
  }

  return lines;
}

/**
 * Bereken het patroon voor één losse wand (geen groepskoppeling).
 *
 * @param {object} wall     - { length, height, openings }
 * @param {object} material
 * @param {string} verband
 * @returns {Array<{y:number, pieces:Array}>}
 */
export function buildSingleWallPattern(wall, material, verband) {
  const { steenH, lint } = material;
  const lagenmaat = getLagenmaat(material, verband);
  const rowH = verband === 'staand_tegelverband' ? material.steenL : steenH;
  const lagen = lagenmaat > 0 ? Math.floor((wall.height + lint) / lagenmaat) : 0;
  const rows = [];

  for (let r = 0; r < lagen; r++) {
    const rowY = round2(r * lagenmaat);
    const pieces = buildRowPiecesForWidth(wall.length, material, verband, r, 0);
    const filtered = pieces.filter((p) => !isInOpening(p.start, rowY, wall.openings ?? [], rowH));
    if (filtered.length) rows.push({ y: rowY, pieces: filtered });
  }

  return rows;
}

/**
 * Bereken een vlak patroon over opgegeven breedte × hoogte.
 */
export function buildFacePattern(width, height, material, verband, rowOffset = 0) {
  const { steenH, lint } = material;
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

/**
 * Vlak patroon gecentreerd op de middenas.
 */
export function buildCenteredFacePattern(width, height, material, verband, rowOffset = 0) {
  const { steenL, steenH, steenW, lint, stoot } = material;

  if (verband === 'staand_tegelverband') {
    const tileW = steenH + stoot;
    const lagenmaat = (steenW ?? steenH) + lint;
    const lagen = lagenmaat > 0 ? Math.ceil(height / lagenmaat) : 0;
    const center = width / 2;
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
        let label = 'Vol';
        if (len < steenL - 0.001) label = Math.abs(len - kop) < 1 ? 'Kop' : 'Rest';
        pieces.push({ start: realStart, length: len, label });
      }
      x = round2(x + unit);
    }
    if (pieces.length) rows.push({ y: rowY, pieces });
  }
  return rows;
}

/**
 * Symmetrisch patroon (gespiegeld op de middenas).
 */
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

/**
 * Gespiegeld patroon (horizontaal omgekeerd).
 */
export function buildMirroredFacePattern(width, height, material, verband, rowOffset = 0) {
  const rows = buildFacePattern(width, height, material, verband, rowOffset);
  return rows.map((row) => ({
    ...row,
    pieces: mirrorPieces(row.pieces, width),
  }));
}
