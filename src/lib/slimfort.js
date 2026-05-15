export const SLIMFORT_DEFAULTS = {
  enabled: true,
  elementLength: 1200,
  elementHeight: 600,
  mainThickness: 116,
  tongueGrooveDepth: 41,
  rearZoneThickness: 39,
  tongueWidth: 25,
  totalThickness: 196,
  bracketWidth: 128,
  bracketHeight: 60,
  bracketThickness: 2,
  bracketDepth: 50,
  profileWidth: 44,
  profileHeight: 44,
  profileThickness: 2,
  profileDepth: 63,
  profileInsertDepth: 33,
  orientation: 'horizontal',
  claddingDepthInward: 0,
  cladFrontFace: true,
  cladSideFaces: false,
  cladPortalInnerFaces: false,
  isEntrancePortalWall: false,
  debugSlimFort: false,
  concreteFaceCladdingSettings: null,
};

export const CONCRETE_FACE_CLADDING_DEFAULTS = {
  enabled: true,
  cladLeftEndFace: true,
  cladRightEndFace: true,
  cladLeftLongFace: false,
  cladRightLongFace: false,
  leftLongFaceRange: { referenceEnd: 'leftEnd', startOffsetMm: 0, endOffsetMm: null, lengthMm: null },
  rightLongFaceRange: { referenceEnd: 'rightEnd', startOffsetMm: 0, endOffsetMm: null, lengthMm: null },
  leftPerpendicularHintMm: null,
  rightPerpendicularHintMm: null,
  clampToWallLength: true,
  debug: false,
};

const MIN_PROFILE_LENGTH = 120;
const MIN_EPS_PIECE_SIZE = 50;

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function subtractRectFromRect(rx, ry, rw, rh, sx, sy, sw, sh) {
  const ox1 = Math.max(rx, sx);
  const ox2 = Math.min(rx + rw, sx + sw);
  const oy1 = Math.max(ry, sy);
  const oy2 = Math.min(ry + rh, sy + sh);
  if (ox2 <= ox1 || oy2 <= oy1) return [{ x: rx, y: ry, w: rw, h: rh }];
  const pieces = [];
  if (ox1 > rx) pieces.push({ x: rx, y: ry, w: ox1 - rx, h: rh });
  if (ox2 < rx + rw) pieces.push({ x: ox2, y: ry, w: (rx + rw) - ox2, h: rh });
  if (oy1 > ry) pieces.push({ x: ox1, y: ry, w: ox2 - ox1, h: oy1 - ry });
  if (oy2 < ry + rh) pieces.push({ x: ox1, y: oy2, w: ox2 - ox1, h: (ry + rh) - oy2 });
  return pieces;
}

function subtractOpeningsFromRect(rx, ry, rw, rh, openings) {
  let pieces = [{ x: rx, y: ry, w: rw, h: rh }];
  for (const op of openings) {
    const next = [];
    for (const p of pieces) {
      next.push(...subtractRectFromRect(p.x, p.y, p.w, p.h, op.x, op.y, op.width, op.height));
    }
    pieces = next;
  }
  return pieces.filter((p) => p.w >= MIN_EPS_PIECE_SIZE && p.h >= MIN_EPS_PIECE_SIZE);
}

function mergeRanges(ranges) {
  if (!ranges.length) return [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged = [sorted[0].slice()];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i][0] <= last[1]) {
      last[1] = Math.max(last[1], sorted[i][1]);
    } else {
      merged.push(sorted[i].slice());
    }
  }
  return merged;
}

function splitSegmentByExcludedRanges(segStart, segEnd, excludedRanges, minLen) {
  const merged = mergeRanges(excludedRanges);
  const segments = [];
  let cur = segStart;
  for (const [ex1, ex2] of merged) {
    const clEx1 = Math.max(cur, ex1);
    const clEx2 = Math.min(segEnd, ex2);
    if (clEx1 <= cur) {
      cur = Math.max(cur, clEx2);
      continue;
    }
    if (clEx1 < segEnd) {
      const len = clEx1 - cur;
      if (len >= minLen) segments.push([cur, clEx1]);
      cur = clEx2;
    }
  }
  if (cur < segEnd && segEnd - cur >= minLen) {
    segments.push([cur, segEnd]);
  }
  return segments;
}

export function applyCornerTrimToSlimFort(sfData, xMin, xMax) {
  if (!sfData) return sfData;
  if (xMin <= 0 && (xMax === undefined || xMax === null)) return sfData;

  const clipEps = (el) => {
    const elX2 = el.x + el.width;
    if (el.x >= xMax || elX2 <= xMin) return null;
    const newX = Math.max(el.x, xMin);
    const newX2 = Math.min(elX2, xMax);
    if (newX2 - newX < MIN_EPS_PIECE_SIZE) return null;
    return { ...el, x: newX, width: newX2 - newX, clipped: el.clipped || newX !== el.x || newX2 !== elX2 };
  };

  const clipProfile = (p) => {
    if (p.richting === 'verticaal') {
      if (p.x + p.width <= xMin || p.x >= xMax) return null;
      return p;
    }
    const p2 = p.x + p.width;
    if (p2 <= xMin || p.x >= xMax) return null;
    const newX = Math.max(p.x, xMin);
    const newX2 = Math.min(p2, xMax);
    if (newX2 - newX < MIN_PROFILE_LENGTH) return null;
    return { ...p, x: newX, width: newX2 - newX, split: p.split || newX !== p.x || newX2 !== p2 };
  };

  return {
    ...sfData,
    epsElements: sfData.epsElements.map(clipEps).filter(Boolean),
    brackets: sfData.brackets.filter((b) => b.cx >= xMin && b.cx < xMax),
    profiles: sfData.profiles.map(clipProfile).filter(Boolean),
    debug: sfData.debug ? {
      ...sfData.debug,
      removedEps: sfData.debug.removedEps ?? [],
      removedBrackets: sfData.debug.removedBrackets ?? [],
    } : sfData.debug,
  };
}

export function computeFaceLongRanges(cfcs, wallLength) {
  const c = { ...CONCRETE_FACE_CLADDING_DEFAULTS, ...cfcs };
  const ranges = [];
  if (c.cladLeftLongFace) {
    const r = c.leftLongFaceRange ?? {};
    const start = r.startOffsetMm ?? 0;
    const end = r.lengthMm != null ? start + r.lengthMm : (r.endOffsetMm ?? wallLength);
    const clamped = c.clampToWallLength !== false ? Math.min(end, wallLength) : end;
    if (clamped > start) ranges.push([Math.max(0, start), clamped]);
  }
  if (c.cladRightLongFace) {
    const r = c.rightLongFaceRange ?? {};
    const startFromRight = r.startOffsetMm ?? 0;
    const len = r.lengthMm ?? (wallLength - startFromRight);
    const x2 = wallLength - startFromRight;
    const x1 = x2 - len;
    const clampedX1 = c.clampToWallLength !== false ? Math.max(x1, 0) : x1;
    const clampedX2 = c.clampToWallLength !== false ? Math.min(x2, wallLength) : x2;
    if (clampedX2 > clampedX1) ranges.push([clampedX1, clampedX2]);
  }
  if (ranges.length === 0) {
    if (!c.cladLeftLongFace && !c.cladRightLongFace) return null;
    return [[0, wallLength]];
  }
  return mergeRanges(ranges);
}

export function applyRangesToGrid(grid, ranges) {
  if (!grid) return null;
  if (!ranges || ranges.length === 0) return null;
  const merged = mergeRanges(ranges);

  const inRanges = (x, w) => merged.some(([r1, r2]) => x < r2 && x + w > r1);

  const newEps = [];
  for (const eps of grid.epsElements) {
    for (const [r1, r2] of merged) {
      const cx1 = Math.max(eps.x, r1);
      const cx2 = Math.min(eps.x + eps.width, r2);
      if (cx2 - cx1 >= MIN_EPS_PIECE_SIZE) {
        newEps.push({ ...eps, x: cx1, width: cx2 - cx1, clipped: cx1 !== eps.x || cx2 !== eps.x + eps.width });
      }
    }
  }

  const newProfiles = grid.profiles.map((p) => {
    if (!inRanges(p.x, p.width)) return null;
    let best = null;
    for (const [r1, r2] of merged) {
      const cx1 = Math.max(p.x, r1);
      const cx2 = Math.min(p.x + p.width, r2);
      if (cx2 > cx1 && (best === null || cx2 - cx1 > best.width)) best = { cx1, cx2 };
    }
    if (!best || best.cx2 - best.cx1 < MIN_PROFILE_LENGTH) return null;
    return { ...p, x: best.cx1, width: best.cx2 - best.cx1, split: best.cx1 !== p.x || best.cx2 !== p.x + p.width };
  }).filter(Boolean);

  const newBrackets = grid.brackets.filter((b) => merged.some(([r1, r2]) => b.cx >= r1 && b.cx < r2));

  return { ...grid, epsElements: newEps, profiles: newProfiles, brackets: newBrackets };
}

export function generateSlimFortFaces({ groupWidth, groupHeight, wallThickness, openings, settings, maxH }) {
  const s = { ...SLIMFORT_DEFAULTS, ...settings };
  const { cladFrontFace, cladSideFaces, cladPortalInnerFaces, totalThickness: sfTotal } = s;
  const cfcs = s.concreteFaceCladdingSettings?.enabled !== false && s.concreteFaceCladdingSettings != null
    ? { ...CONCRETE_FACE_CLADDING_DEFAULTS, ...s.concreteFaceCladdingSettings }
    : null;
  const faces = [];

  const normalizedOpenings = (openings ?? []).map((op) => ({
    x: op.x ?? 0, y: op.y ?? 0, width: op.width ?? 0, height: op.height ?? 0,
  })).filter((op) => op.width > 0 && op.height > 0);

  const frontEnabled = cfcs ? (cfcs.cladLeftLongFace || cfcs.cladRightLongFace) : (cladFrontFace !== false);
  if (frontEnabled) {
    const grid = generateSlimFortGrid(groupWidth, groupHeight, normalizedOpenings, s, maxH, 'front');
    if (cfcs && grid != null) {
      if (cfcs.cladLeftLongFace) {
        const lr = computeFaceLongRanges({ ...cfcs, cladRightLongFace: false }, groupWidth);
        const g = lr ? applyRangesToGrid(grid, lr) : grid;
        if (g) faces.push({ faceId: 'front', faceType: 'front', width: groupWidth, height: groupHeight, grid: g, cornerOffset: 0 });
      }
      if (cfcs.cladRightLongFace) {
        const rr = computeFaceLongRanges({ ...cfcs, cladLeftLongFace: false }, groupWidth);
        const g = rr ? applyRangesToGrid(grid, rr) : grid;
        if (g) faces.push({ faceId: 'back', faceType: 'back', width: groupWidth, height: groupHeight, grid: g, cornerOffset: 0, backOffsetFromFront: wallThickness ?? 0 });
      }
    } else if (grid != null) {
      faces.push({ faceId: 'front', faceType: 'front', width: groupWidth, height: groupHeight, grid, cornerOffset: 0 });
    }
  }

  const leftSideEnabled = cfcs ? !!cfcs.cladLeftEndFace : !!cladSideFaces;
  const rightSideEnabled = cfcs ? !!cfcs.cladRightEndFace : !!cladSideFaces;
  if (leftSideEnabled || rightSideEnabled) {
    const cornerOffset = frontEnabled ? sfTotal : 0;
    const sideRawWidth = Math.max(0, (wallThickness ?? 0) - cornerOffset);
    if (sideRawWidth >= MIN_EPS_PIECE_SIZE) {
      if (leftSideEnabled) {
        const leftGrid = generateSlimFortGrid(sideRawWidth, groupHeight, [], s, maxH, 'side-left');
        faces.push({ faceId: 'side-left', faceType: 'side-left', width: sideRawWidth, height: groupHeight, grid: leftGrid, cornerOffset });
      }
      if (rightSideEnabled) {
        const rightGrid = generateSlimFortGrid(sideRawWidth, groupHeight, [], s, maxH, 'side-right');
        faces.push({ faceId: 'side-right', faceType: 'side-right', width: sideRawWidth, height: groupHeight, grid: rightGrid, cornerOffset });
      }
    }
  }

  const portalEnabled = cfcs ? false : !!(cladPortalInnerFaces && normalizedOpenings.length > 0);
  if (portalEnabled) {
    const cornerOffset = frontEnabled ? sfTotal : 0;
    const revealDepth = Math.max(0, (wallThickness ?? 0) - cornerOffset);
    if (revealDepth >= MIN_EPS_PIECE_SIZE) {
      normalizedOpenings.forEach((op, i) => {
        const leftGrid = generateSlimFortGrid(revealDepth, op.height, [], s, null, 'portal-left');
        faces.push({
          faceId: `portal-left-${i}`, faceType: 'portal-left',
          width: revealDepth, height: op.height, grid: leftGrid, cornerOffset,
          openingIndex: i, openingX: op.x, openingY: op.y, openingWidth: op.width, openingHeight: op.height,
        });
        const rightGrid = generateSlimFortGrid(revealDepth, op.height, [], s, null, 'portal-right');
        faces.push({
          faceId: `portal-right-${i}`, faceType: 'portal-right',
          width: revealDepth, height: op.height, grid: rightGrid, cornerOffset,
          openingIndex: i, openingX: op.x, openingY: op.y, openingWidth: op.width, openingHeight: op.height,
        });
      });
    }
  }

  return faces;
}

export function generateSlimFortGrid(groupWidth, groupHeight, openings, settings, maxH, faceType = null) {
  const s = { ...SLIMFORT_DEFAULTS, ...settings };
  const {
    elementLength, elementHeight, orientation,
    bracketWidth, bracketHeight, bracketDepth,
    profileWidth, profileHeight, profileDepth,
    cladFrontFace, totalThickness,
    claddingDepthInward,
    debugSlimFort,
  } = s;

  const effectiveMaxH = (maxH != null && maxH > 0) ? Math.min(groupHeight, maxH) : groupHeight;
  const cornerOffset = (cladFrontFace !== false) ? (totalThickness ?? 196) : 0;
  const effectiveMaxW = (faceType !== 'front' && claddingDepthInward != null && claddingDepthInward > 0)
    ? Math.max(0, Math.min(groupWidth, claddingDepthInward - cornerOffset))
    : groupWidth;

  const cellW = orientation === 'horizontal' ? elementLength : elementHeight;
  const cellH = orientation === 'horizontal' ? elementHeight : elementLength;

  const numCols = Math.ceil(effectiveMaxW / cellW);
  const numRows = Math.ceil(effectiveMaxH / cellH);

  const normalizedOpenings = (openings ?? []).map((op) => ({
    x: op.x ?? 0,
    y: op.y ?? 0,
    width: op.width ?? 0,
    height: op.height ?? 0,
  })).filter((op) => op.width > 0 && op.height > 0);

  const rawEpsElements = [];
  const rawBrackets = [];

  for (let row = 0; row < numRows; row++) {
    for (let col = 0; col < numCols; col++) {
      const x = col * cellW;
      const y = row * cellH;
      const w = Math.min(cellW, effectiveMaxW - x);
      const h = Math.min(cellH, effectiveMaxH - y);
      if (w <= 0 || h <= 0) continue;

      rawEpsElements.push({ id: `eps-${row}-${col}`, x, y, width: w, height: h, col, row, orientation });

      const localBrackets = [[150, 162], [750, 162], [150, 462], [750, 462]];
      for (const [lx, ly] of localBrackets) {
        let bx, by;
        if (orientation === 'horizontal') {
          bx = x + lx;
          by = y + ly;
        } else {
          bx = (col + 1) * cellW - ly;
          by = y + lx;
        }
        if (bx <= 0 || bx >= effectiveMaxW || by <= 0 || by >= effectiveMaxH) continue;
        rawBrackets.push({
          x: bx - bracketWidth / 2,
          y: by - bracketHeight / 2,
          width: bracketWidth,
          height: bracketHeight,
          depth: bracketDepth,
          cx: bx,
          cy: by,
        });
      }
    }
  }

  const _bracketKeySet = new Set();
  const dedupedRawBrackets = rawBrackets.filter((b) => {
    const key = `${Math.round(b.cx)}-${Math.round(b.cy)}`;
    if (_bracketKeySet.has(key)) return false;
    _bracketKeySet.add(key);
    return true;
  });

  const epsElements = [];
  const removedEps = [];

  for (const eps of rawEpsElements) {
    const overlapping = normalizedOpenings.filter((op) =>
      rectsOverlap(eps.x, eps.y, eps.width, eps.height, op.x, op.y, op.width, op.height)
    );
    if (!overlapping.length) {
      epsElements.push(eps);
      continue;
    }
    const pieces = subtractOpeningsFromRect(eps.x, eps.y, eps.width, eps.height, overlapping);
    if (!pieces.length) {
      removedEps.push(eps);
    } else {
      pieces.forEach((p, pi) => {
        epsElements.push({ ...eps, id: `${eps.id}-p${pi}`, x: p.x, y: p.y, width: p.w, height: p.h, clipped: true });
      });
      if (debugSlimFort) removedEps.push({ ...eps, partial: true });
    }
  }

  const brackets = [];
  const removedBrackets = [];

  for (const br of dedupedRawBrackets) {
    const inOpening = normalizedOpenings.some((op) =>
      br.cx >= op.x && br.cx <= op.x + op.width &&
      br.cy >= op.y && br.cy <= op.y + op.height
    );
    if (inOpening) {
      removedBrackets.push(br);
    } else {
      brackets.push(br);
    }
  }

  const profiles = [];
  const splitProfileDebug = [];

  if (orientation === 'horizontal') {
    const rowYs = [...new Set(brackets.map((b) => Math.round(b.cy)))].sort((a, b) => a - b);
    for (const yc of rowYs) {
      const profY = Math.round(yc - profileHeight / 2);
      const profH = profileHeight;
      const overlapping = normalizedOpenings.filter((op) =>
        rectsOverlap(0, profY, effectiveMaxW, profH, op.x, op.y, op.width, op.height)
      );
      if (!overlapping.length) {
        profiles.push({ richting: 'horizontaal', x: 0, y: profY, width: effectiveMaxW, height: profH, depth: profileDepth });
      } else {
        const excludedX = overlapping.map((op) => [op.x, op.x + op.width]);
        const segments = splitSegmentByExcludedRanges(0, effectiveMaxW, excludedX, MIN_PROFILE_LENGTH);
        for (const [x1, x2] of segments) {
          profiles.push({ richting: 'horizontaal', x: x1, y: profY, width: x2 - x1, height: profH, depth: profileDepth, split: true });
        }
        if (debugSlimFort) splitProfileDebug.push({ axis: 'x', yc, excludedX, segments });
      }
    }
  } else {
    const colXs = [...new Set(brackets.map((b) => Math.round(b.cx)))].sort((a, b) => a - b);
    for (const xc of colXs) {
      const profX = Math.round(xc - profileWidth / 2);
      const profW = profileWidth;
      const overlapping = normalizedOpenings.filter((op) =>
        rectsOverlap(profX, 0, profW, effectiveMaxH, op.x, op.y, op.width, op.height)
      );
      if (!overlapping.length) {
        profiles.push({ richting: 'verticaal', x: profX, y: 0, width: profW, height: effectiveMaxH, depth: profileDepth });
      } else {
        const excludedY = overlapping.map((op) => [op.y, op.y + op.height]);
        const segments = splitSegmentByExcludedRanges(0, effectiveMaxH, excludedY, MIN_PROFILE_LENGTH);
        for (const [y1, y2] of segments) {
          profiles.push({ richting: 'verticaal', x: profX, y: y1, width: profW, height: y2 - y1, depth: profileDepth, split: true });
        }
        if (debugSlimFort) splitProfileDebug.push({ axis: 'y', xc, segments });
      }
    }
  }

  if (debugSlimFort) {
    console.log('[SlimFort] grid', {
      numCols, numRows, cellW, cellH,
      effectiveMaxH, effectiveMaxW,
      rawEps: rawEpsElements.length,
      clippedEps: epsElements.length,
      removedEps: removedEps.length,
      rawBrackets: rawBrackets.length,
      dedupedBrackets: dedupedRawBrackets.length,
      filteredBrackets: brackets.length,
      removedBrackets: removedBrackets.length,
      profiles: profiles.length,
      openings: normalizedOpenings.length,
      splitProfileDebug,
      claddingDepthInward,
      orientation,
    });
  }

  return {
    epsElements,
    brackets,
    profiles,
    effectiveMaxH,
    effectiveMaxW,
    numCols,
    numRows,
    settings: s,
    debug: {
      removedEps,
      removedBrackets,
      splitProfileDebug,
      clippingBoundary: { x: 0, y: 0, width: effectiveMaxW, height: effectiveMaxH },
      openings: normalizedOpenings,
    },
  };
}

export function generateSlimFortFacesAuto({ groupWalls, visibleFaces, settings, maxH, sfTotalThickness }) {
  const s = { ...SLIMFORT_DEFAULTS, ...settings };
  const sfTotal = sfTotalThickness ?? s.totalThickness;
  const faces = [];

  for (const vf of (visibleFaces ?? [])) {
    if (vf.visibility === 'HIDDEN') continue;
    if (vf.faceType === 'front' && vf.visibility !== 'OUTSIDE') continue;
    if ((vf.faceType === 'side-left' || vf.faceType === 'side-right') && vf.visibility !== 'RETURN_FACE') continue;
    if ((vf.faceType === 'portal-left' || vf.faceType === 'portal-right') && vf.visibility !== 'RETURN_FACE') continue;

    const wallThick = vf.wallThickness ?? 250;
    const wallHeight = Math.abs(vf.heightEnd - vf.heightStart);
    const wallLength = Math.abs(vf.lengthEnd - vf.lengthStart);

    if (vf.faceType === 'front') {
      const openings = vf.openings ?? [];
      const grid = generateSlimFortGrid(wallLength, wallHeight, openings, s, maxH, 'front');
      faces.push({
        faceId: `front-${vf.wallId}`,
        faceType: 'front',
        width: wallLength,
        height: wallHeight,
        grid,
        cornerOffset: 0,
        localAxes: vf.localAxes,
        axes: vf.axes,
        outsideDir: vf.outsideDir,
        outsidePos: vf.outsidePos,
        lengthStart: vf.lengthStart,
        heightStart: vf.heightStart,
        wallId: vf.wallId,
      });
    } else if (vf.faceType === 'side-left' || vf.faceType === 'side-right') {
      const cornerOffset = sfTotal;
      const sideWidth = Math.max(0, wallThick - cornerOffset);
      if (sideWidth < 50) continue;
      const grid = generateSlimFortGrid(sideWidth, wallHeight, [], s, maxH, vf.faceType);
      faces.push({
        faceId: `${vf.faceType}-${vf.wallId}`,
        faceType: vf.faceType,
        width: sideWidth,
        height: wallHeight,
        grid,
        cornerOffset,
        localAxes: vf.localAxes,
        axes: vf.axes,
        outsideDir: vf.outsideDir,
        outsidePos: vf.outsidePos,
        lengthStart: vf.lengthStart,
        lengthEnd: vf.lengthEnd,
        heightStart: vf.heightStart,
        wallId: vf.wallId,
      });
    } else if (vf.faceType === 'portal-left' || vf.faceType === 'portal-right') {
      const cornerOffset = sfTotal;
      const revealDepth = Math.max(0, wallThick - cornerOffset);
      if (revealDepth < 50) continue;
      const opH = vf.openingHeight ?? 0;
      if (opH <= 0) continue;
      const grid = generateSlimFortGrid(revealDepth, opH, [], s, null, vf.faceType);
      faces.push({
        faceId: `${vf.faceType}-${vf.wallId}-${vf.openingX ?? 0}`,
        faceType: vf.faceType,
        width: revealDepth,
        height: opH,
        grid,
        cornerOffset,
        localAxes: vf.localAxes,
        axes: vf.axes,
        outsideDir: vf.outsideDir,
        outsidePos: vf.outsidePos,
        openingX: vf.openingX,
        openingY: vf.openingY,
        openingWidth: vf.openingWidth,
        openingHeight: vf.openingHeight,
        lengthStart: vf.lengthStart,
        lengthEnd: vf.lengthEnd,
        heightStart: vf.heightStart,
        wallId: vf.wallId,
      });
    }
  }

  return faces;
}

export function getSlimFortDepths(sfSettings, panelVentGap = 0, panelDikte = 8, brickD = 20) {
  const totalThickness     = sfSettings.totalThickness     ?? 196;
  const bracketDepth       = sfSettings.bracketDepth       ?? 50;
  const profileDepth       = sfSettings.profileDepth       ?? 63;
  const profileInsertDepth = sfSettings.profileInsertDepth ?? 33;

  const epsStart        = 0;
  const epsEnd          = totalThickness;
  const bracketStart    = totalThickness - bracketDepth;
  const bracketEnd      = totalThickness;
  const profileStart    = totalThickness - profileInsertDepth;
  const profileEnd      = totalThickness - profileInsertDepth + profileDepth;
  const panelBack       = profileEnd + panelVentGap;
  const panelCenter     = profileEnd + panelVentGap + panelDikte / 2;
  const brickCenter     = profileEnd + panelVentGap + panelDikte + brickD / 2;
  const facadeBaseDepth = profileEnd + panelVentGap;

  return {
    epsStart, epsEnd,
    bracketStart, bracketEnd,
    profileStart, profileEnd,
    panelBack, panelCenter,
    brickCenter,
    facadeBaseDepth,
  };
}
