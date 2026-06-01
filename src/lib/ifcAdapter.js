const _OPENING_TYPE_MAP = { window: 'raam', door: 'deur', unknown: 'sparing' };

/**
 * Determine BrickBoard axis names from WallPlane.worldNormal (Three.js world space).
 *
 * Coordinate mapping (X_NEG90 model orientation):
 *   IFC X = Three.js X
 *   IFC Y = -Three.js Z
 *   IFC Z = Three.js Y  (height)
 *
 * heightAxis is always 'z' (IFC Z = up = Three.js Y).
 * thicknessAxis = the axis worldNormal dominates.
 */
function _deriveAxes(worldNormal) {
  const absX = Math.abs(worldNormal.x);
  const absZ = Math.abs(worldNormal.z);
  return absX >= absZ
    ? { lengthAxis: 'y', heightAxis: 'z', thicknessAxis: 'x' }
    : { lengthAxis: 'x', heightAxis: 'z', thicknessAxis: 'y' };
}

/**
 * Convert WallPlane.bbox (Three.js world space, meters) to BrickBoard
 * wallOrigin coordinate fields (IFC space, mm).
 *
 * X_NEG90 inverse:
 *   IFC.x =  Three.js.x
 *   IFC.y = -Three.js.z
 *   IFC.z =  Three.js.y
 */
function _bboxToCoords(bbox, axes) {
  if (axes.thicknessAxis === 'x') {
    return {
      lengthStart:    Math.round(-bbox.max.z * 1000),
      lengthEnd:      Math.round(-bbox.min.z * 1000),
      heightStart:    Math.round( bbox.min.y * 1000),
      heightEnd:      Math.round( bbox.max.y * 1000),
      thicknessStart: Math.round( bbox.min.x * 1000),
      thicknessEnd:   Math.round( bbox.max.x * 1000),
    };
  } else {
    return {
      lengthStart:    Math.round( bbox.min.x * 1000),
      lengthEnd:      Math.round( bbox.max.x * 1000),
      heightStart:    Math.round( bbox.min.y * 1000),
      heightEnd:      Math.round( bbox.max.y * 1000),
      thicknessStart: Math.round(-bbox.max.z * 1000),
      thicknessEnd:   Math.round(-bbox.min.z * 1000),
    };
  }
}

/**
 * Derive resolvedOutside directly from worldNormal.
 * Supersedes matLayerSense / wallLengthDir heuristics — worldNormal is more reliable.
 */
function _resolvedOutside(worldNormal, axes, coords) {
  let dir;
  if (axes.thicknessAxis === 'x') {
    dir = worldNormal.x >= 0 ? 1 : -1;
  } else {
    dir = worldNormal.z <= 0 ? 1 : -1;
  }
  const pos = dir > 0 ? coords.thicknessEnd : coords.thicknessStart;
  return {
    outsideDir: dir,
    outsidePos: pos,
    source: 'worldNormal',
    confidence: 0.95,
    ambiguous: false,
    reason: 'derived from WallPlane.worldNormal (new IFC engine)',
  };
}

/**
 * Compute sign of uAxis component along IFC length direction.
 * Determines STANDARD vs MIRROR formula for opening / polygon x-coordinates.
 *
 * uAxis in Three.js world space.
 * IFC length 'y' maps to -Three.js Z, IFC length 'x' maps to Three.js X.
 */
function _uAxisSign(uAxis, lengthAxis) {
  return lengthAxis === 'y' ? -uAxis.z : uAxis.x;
}

function _ringBounds(ring) {
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const p of ring.points) {
    if (p.u < minU) minU = p.u;
    if (p.u > maxU) maxU = p.u;
    if (p.v < minV) minV = p.v;
    if (p.v > maxV) maxV = p.v;
  }
  return { minU, maxU, minV, maxV };
}

/**
 * Convert one OpeningContour → BrickBoard opening.
 * sign >= 0 = STANDARD (u increases with IFC length direction)
 * sign <  0 = MIRROR  (u decreases with IFC length direction)
 */
function _convertOpening(oc, outerBounds, sign) {
  const std = sign >= 0;
  const x = std
    ? Math.round((oc.bbox2D.minU - outerBounds.minU) * 1000)
    : Math.round((outerBounds.maxU - oc.bbox2D.maxU) * 1000);
  const y = Math.round((oc.bbox2D.minV - outerBounds.minV) * 1000);

  const polyPts = oc.boundary2D.points.map(p => ({
    l: std
      ? Math.round((p.u - outerBounds.minU) * 1000)
      : Math.round((outerBounds.maxU - p.u) * 1000),
    h: Math.round((p.v - outerBounds.minV) * 1000),
  }));

  return {
    id: oc.openingId,
    type: _OPENING_TYPE_MAP[oc.type] ?? 'sparing',
    x: Math.max(0, x),
    y: Math.max(0, y),
    breedte: Math.round(oc.bbox2D.widthU * 1000),
    hoogte:  Math.round(oc.bbox2D.heightV * 1000),
    polyPts,
    thicknessCenter: null,
    _source: oc.source,
  };
}

function _facadePoly(outerBoundary, outerBounds, sign) {
  if (!outerBoundary || outerBoundary.points.length < 3) return null;
  const std = sign >= 0;
  return outerBoundary.points.map(p => ({
    l: std
      ? Math.round((p.u - outerBounds.minU) * 1000)
      : Math.round((outerBounds.maxU - p.u) * 1000),
    h: Math.round((p.v - outerBounds.minV) * 1000),
  }));
}

/**
 * Convert WallPlane[] (new IFC engine) → Wall[] (BrickBoard format).
 *
 * NOT wired into App.jsx — Phase 1 (contract test only).
 *
 * @param {object[]} planes - WallPlane[] from the new IFC engine
 * @returns {{ walls: object[], diagnostics: object }}
 */
export function adaptWallPlanesToBrickBoard(planes) {
  if (!Array.isArray(planes) || planes.length === 0) {
    return { walls: [], diagnostics: { wallCount: 0, filled: {}, defaults: [] } };
  }

  const walls = [];

  for (const plane of planes) {
    const axes        = _deriveAxes(plane.worldNormal);
    const coords      = _bboxToCoords(plane.bbox, axes);
    const resolvedOut = _resolvedOutside(plane.worldNormal, axes, coords);
    const sign        = _uAxisSign(plane.localFrame.uAxis, axes.lengthAxis);
    const outerBounds = _ringBounds(plane.outerBoundary);

    const openings   = plane.openings.map(oc => _convertOpening(oc, outerBounds, sign));
    const facadePoly = _facadePoly(plane.outerBoundary, outerBounds, sign);
    const expressID  = plane.sourceMeshIds[0] ?? 0;

    walls.push({
      expressID,
      name:     `Wand #${expressID}`,
      length:   Math.round(plane.widthM  * 1000),
      height:   Math.round(plane.heightM * 1000),
      openings,
      wallOrigin: {
        globalId:           null,
        ...axes,
        ...coords,
        wallInsideThickDir: 0,
        wallLengthDir:      null,
        matLayerSense:      null,
        matLayerSetDir:     null,
        matOffsetMm:        0,
        spaceBoundaryType:  plane.isExterior ? 'EXTERNAL' : null,
        resolvedOutside:    resolvedOut,
      },
      facadePoly,
      typeName:       null,
      _fromNewEngine: true,
    });
  }

  const diagnostics = {
    wallCount: walls.length,
    filled: {
      expressID:        'WallPlane.sourceMeshIds[0]',
      lengthAxis:       'worldNormal dominant horizontal axis',
      heightAxis:       'always "z" (IFC Z = Three.js Y, X_NEG90)',
      thicknessAxis:    'worldNormal dominant horizontal axis',
      lengthStart:      'bbox → IFC mm (X_NEG90 inverse)',
      lengthEnd:        'bbox → IFC mm (X_NEG90 inverse)',
      heightStart:      'bbox.min.y × 1000',
      heightEnd:        'bbox.max.y × 1000',
      thicknessStart:   'bbox → IFC mm (X_NEG90 inverse)',
      thicknessEnd:     'bbox → IFC mm (X_NEG90 inverse)',
      resolvedOutside:  'worldNormal → outsideDir + outsidePos (confidence 0.95)',
      spaceBoundaryType:'WallPlane.isExterior → "EXTERNAL" | null',
      openings_x:       'bbox2D + uAxisSign correction (STANDARD/MIRROR)',
      openings_y:       '(bbox2D.minV - outerBounds.minV) × 1000',
      openings_breedte: 'bbox2D.widthU × 1000',
      openings_hoogte:  'bbox2D.heightV × 1000',
      openings_polyPts: 'boundary2D.points with uAxisSign correction',
      facadePoly:       'outerBoundary with uAxisSign correction',
    },
    defaults: [
      'globalId = null (not in WallPlane)',
      'wallLengthDir = null (resolvedOutside derived from worldNormal covers this)',
      'matLayerSense = null (not in WallPlane)',
      'matLayerSetDir = null (not in WallPlane)',
      'matOffsetMm = 0 [MEDIUM RISK: SlimFort accuracy for layered walls]',
      'typeName = null [MEDIUM RISK: type-filter diagnostics less specific]',
      'name = "Wand #expressID" (no WallPlane.name)',
      'opening.id = OpeningContour.openingId (synthetic, not IFC expressId)',
      'opening.thicknessCenter = null (not in OpeningContour)',
    ],
  };

  return { walls, diagnostics };
}
