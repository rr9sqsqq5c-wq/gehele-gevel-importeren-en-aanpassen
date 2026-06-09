import { getOpeningPoly } from './pattern.js';
import { STEENSTRIP_CATALOG } from './battens.js';
import { SLIMFORT_DEFAULTS, getSlimFortDepths } from './slimfort.js';
import { registerIfcContext, getProjectInfo, getLastConfidentUpAxis, setLastConfidentUpAxis, setGeometryDerivedRenderOrigin } from './projectCoordinates.js';
import { isUpAxisInheritFallback, isGeometryDerivedOrigin } from './featureFlags.js';
let _api = null;
let _loading = null;
let _cachedModel = null;

function _extractWallMatrix(api, modelID, expressID) {
  try {
    const mesh = api.GetFlatMesh(modelID, expressID);
    if (!mesh || mesh.geometries.size() === 0) return null;
    return mesh.geometries.get(0).flatTransformation;
  } catch {
    return null;
  }
}

function _extractWallAxisCurve(api, modelID, expressID, m) {
  const transformPt = (lx, ly) => ({
    x: Math.round((m[0] * lx + m[4] * ly + m[12]) * 1000),
    y: Math.round((m[1] * lx + m[5] * ly + m[13]) * 1000),
    z: Math.round((m[2] * lx + m[6] * ly + m[14]) * 1000),
  });
  try {
    const wallLine = api.GetLine(modelID, expressID, false);
    const repRef = wallLine?.Representation?.value;
    if (!repRef) return null;
    const repShape = api.GetLine(modelID, repRef, false);
    const repsList = repShape?.Representations;
    if (!repsList) return null;
    for (const rRef of repsList) {
      const rep = api.GetLine(modelID, rRef.value, false);
      if (rep?.RepresentationIdentifier?.value !== 'Axis') continue;
      const items = rep?.Items;
      if (!items?.length) continue;
      const item = api.GetLine(modelID, items[0].value, false);
      const pts = item?.Points;
      if (!pts || pts.length < 2) continue;
      const p0 = api.GetLine(modelID, pts[0].value, false);
      const pN = api.GetLine(modelID, pts[pts.length - 1].value, false);
      const coord = (pt, i) => {
        const c = pt?.Coordinates?.[i];
        return typeof c === 'number' ? c : (c?.value ?? 0);
      };
      const lx0 = coord(p0, 0), ly0 = coord(p0, 1);
      const lx1 = coord(pN, 0), ly1 = coord(pN, 1);
      return { start: transformPt(lx0, ly0), end: transformPt(lx1, ly1) };
    }
  } catch { }
  return null;
}

function _computeOldOutsideDir(wo, allWallOrigins) {
  if (!wo) return 1;
  const axis = wo.thicknessAxis;
  const tStart = wo.thicknessStart;
  const tEnd = wo.thicknessEnd ?? wo.thicknessStart + 200;
  if (wo.wallInsideThickDir && wo.wallInsideThickDir !== 0) {
    return -wo.wallInsideThickDir;
  }
  const wallsOnAxis = (allWallOrigins ?? []).filter(w => w?.thicknessAxis === axis);
  const buildingMin = wallsOnAxis.length ? Math.min(...wallsOnAxis.map(w => w.thicknessStart)) : tStart;
  const buildingMax = wallsOnAxis.length ? Math.max(...wallsOnAxis.map(w => w.thicknessEnd ?? w.thicknessStart + 200)) : tEnd;
  return (tStart - buildingMin) <= (buildingMax - tEnd) ? -1 : 1;
}

function _computeNewOutsideDir(wo, allWallOrigins) {
  if (!wo) return 1;
  const axis = wo.thicknessAxis;
  const tStart = wo.thicknessStart;
  const tEnd = wo.thicknessEnd ?? wo.thicknessStart + 200;
  const wallsOnAxis = (allWallOrigins ?? []).filter(w => w?.thicknessAxis === axis);
  const buildingMin = wallsOnAxis.length ? Math.min(...wallsOnAxis.map(w => w.thicknessStart)) : tStart;
  const buildingMax = wallsOnAxis.length ? Math.max(...wallsOnAxis.map(w => w.thicknessEnd ?? w.thicknessStart + 200)) : tEnd;
  const buildingCenter_t = (buildingMin + buildingMax) / 2;
  const wallCenter_t = (tStart + tEnd) / 2;
  const toOutside_t = wallCenter_t - buildingCenter_t;
  if (!wo.wallLengthDir) return _computeOldOutsideDir(wo, allWallOrigins);
  const upAxis = wo.heightAxis ?? 'z';
  const gu = { x: upAxis === 'x' ? 1 : 0, y: upAxis === 'y' ? 1 : 0, z: upAxis === 'z' ? 1 : 0 };
  const ld = wo.wallLengthDir;
  const cx = ld.y * gu.z - ld.z * gu.y;
  const cy = ld.z * gu.x - ld.x * gu.z;
  const cz = ld.x * gu.y - ld.y * gu.x;
  const clen = Math.sqrt(cx * cx + cy * cy + cz * cz);
  if (clen < 0.01) return _computeOldOutsideDir(wo, allWallOrigins);
  const candidateA_t = (axis === 'x' ? cx : axis === 'y' ? cy : cz) / clen;
  return (candidateA_t * toOutside_t >= 0) ? (Math.sign(candidateA_t) || 1) : -(Math.sign(candidateA_t) || 1);
}

function _computeGlobalBBox(allOrigins) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const wo of allOrigins) {
    if (!wo) continue;
    const axes = [
      [wo.lengthAxis,    wo.lengthStart,    wo.lengthEnd    ?? wo.lengthStart],
      [wo.heightAxis,    wo.heightStart,    wo.heightEnd    ?? wo.heightStart],
      [wo.thicknessAxis, wo.thicknessStart, wo.thicknessEnd ?? wo.thicknessStart + 200],
    ];
    for (const [axis, lo, hi] of axes) {
      if (axis === 'x') { minX = Math.min(minX, lo); maxX = Math.max(maxX, hi); }
      if (axis === 'y') { minY = Math.min(minY, lo); maxY = Math.max(maxY, hi); }
      if (axis === 'z') { minZ = Math.min(minZ, lo); maxZ = Math.max(maxZ, hi); }
    }
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

function _isOutsideBBox(pt, bbox) {
  return pt.x < bbox.minX || pt.x > bbox.maxX ||
         pt.y < bbox.minY || pt.y > bbox.maxY ||
         pt.z < bbox.minZ || pt.z > bbox.maxZ;
}

function _classifyWallExterior(wo, globalBBox, openings) {
  if (!wo) return { isExterior: true, confidence: 0.40, reason: 'geen wallOrigin → assume exterior' };

  if (wo.spaceBoundaryType === 'EXTERNAL') {
    return { isExterior: true, confidence: 0.98, reason: 'IfcRelSpaceBoundary=EXTERNAL' };
  }
  if (wo.spaceBoundaryType === 'INTERNAL') {
    return { isExterior: false, confidence: 0.95, reason: 'IfcRelSpaceBoundary=INTERNAL' };
  }

  if (wo.wallLengthDir && globalBBox) {
    const upAxis = wo.heightAxis ?? 'z';
    const gu = { x: upAxis === 'x' ? 1 : 0, y: upAxis === 'y' ? 1 : 0, z: upAxis === 'z' ? 1 : 0 };
    const ld = wo.wallLengthDir;
    const cx = ld.y * gu.z - ld.z * gu.y;
    const cy = ld.z * gu.x - ld.x * gu.z;
    const cz = ld.x * gu.y - ld.y * gu.x;
    const clen = Math.sqrt(cx * cx + cy * cy + cz * cz);
    if (clen > 0.01) {
      const cA = { x: cx / clen, y: cy / clen, z: cz / clen };
      const cB = { x: -cx / clen, y: -cy / clen, z: -cz / clen };
      const wc = { x: 0, y: 0, z: 0 };
      wc[wo.lengthAxis]    = ((wo.lengthStart ?? 0) + (wo.lengthEnd ?? wo.lengthStart ?? 0)) / 2;
      wc[wo.heightAxis]    = ((wo.heightStart ?? 0) + (wo.heightEnd ?? wo.heightStart ?? 0)) / 2;
      wc[wo.thicknessAxis] = (wo.thicknessStart + (wo.thicknessEnd ?? wo.thicknessStart + 200)) / 2;
      const D = 5000;
      const tA = { x: wc.x + cA.x * D, y: wc.y + cA.y * D, z: wc.z + cA.z * D };
      const tB = { x: wc.x + cB.x * D, y: wc.y + cB.y * D, z: wc.z + cB.z * D };
      const aOut = _isOutsideBBox(tA, globalBBox);
      const bOut = _isOutsideBBox(tB, globalBBox);

      if (aOut !== bOut) {
        const hasWindow = (openings ?? []).some(op => op.type === 'raam' && (op.breedte ?? 0) >= _OPENING_MIN_WIDTH);
        return { isExterior: true, confidence: hasWindow ? 0.97 : 0.90, reason: `bbox_exit: aOut=${aOut} bOut=${bOut}${hasWindow ? ' +raam' : ''}` };
      }
      if (!aOut && !bOut) {
        const windowCount = (openings ?? []).filter(op => op.type === 'raam' && (op.breedte ?? 0) >= _OPENING_MIN_WIDTH).length;
        if (windowCount >= 1) {
          return { isExterior: true, confidence: 0.70, reason: `bbox_exit_enclosed: beide zijden binnen, maar ${windowCount} raam/ramen → treat as exterior` };
        }
        return { isExterior: false, confidence: 0.75, reason: 'bbox_exit: beide testpunten binnen globalBBox → interior/enclosed' };
      }
      return { isExterior: true, confidence: 0.55, reason: 'bbox_exit: beide zijden buiten (geïsoleerde wand?)' };
    }
  }

  const hasWindow = (openings ?? []).some(op => op.type === 'raam' && (op.breedte ?? 0) >= _OPENING_MIN_WIDTH);
  if (hasWindow) return { isExterior: true, confidence: 0.65, reason: 'opening_hint: raam gevonden, geen bbox data' };
  return { isExterior: true, confidence: 0.40, reason: 'unknown: geen geometrie of boundary data → assume exterior' };
}

function _resolveOneWallOutside(wo, allOrigins, globalBBox) {
  if (!wo) return { outsideDir: 1, outsidePos: 0, source: 'none', confidence: 0, ambiguous: true, reason: 'no wallOrigin' };

  if (wo.isExterior === false && (wo.exteriorConfidence ?? 0) >= 0.65) {
    return {
      outsideDir: null,
      outsidePos: null,
      source: 'INTERIOR_WALL',
      confidence: wo.exteriorConfidence,
      ambiguous: false,
      reason: wo.exteriorReason ?? 'classified as interior wall',
      _debug: null,
    };
  }

  const tStart = wo.thicknessStart;
  const tEnd = wo.thicknessEnd ?? wo.thicknessStart + 200;
  const axis = wo.thicknessAxis;
  const localYT = wo.wallInsideThickDir;

  const wallCenter = { x: 0, y: 0, z: 0 };
  wallCenter[wo.lengthAxis]    = ((wo.lengthStart ?? 0) + (wo.lengthEnd ?? wo.lengthStart ?? 0)) / 2;
  wallCenter[wo.heightAxis]    = ((wo.heightStart ?? 0) + (wo.heightEnd ?? wo.heightStart ?? 0)) / 2;
  wallCenter[wo.thicknessAxis] = (tStart + tEnd) / 2;

  let candidateA = null;
  let candidateB = null;
  if (wo.wallLengthDir) {
    const upAxis = wo.heightAxis ?? 'z';
    const gu = { x: upAxis === 'x' ? 1 : 0, y: upAxis === 'y' ? 1 : 0, z: upAxis === 'z' ? 1 : 0 };
    const ld = wo.wallLengthDir;
    const cx = ld.y * gu.z - ld.z * gu.y;
    const cy = ld.z * gu.x - ld.x * gu.z;
    const cz = ld.x * gu.y - ld.y * gu.x;
    const clen = Math.sqrt(cx * cx + cy * cy + cz * cz);
    if (clen > 0.01) {
      candidateA = { x: cx / clen, y: cy / clen, z: cz / clen };
      candidateB = { x: -cx / clen, y: -cy / clen, z: -cz / clen };
    }
  }

  const TEST_DIST = 5000;
  let outsideDir = null;
  let source = null;
  let confidence = 0;
  let reason = '';
  let ambiguous = false;
  let testA = null, testB = null, aOut = false, bOut = false;

  if (candidateA && globalBBox) {
    testA = {
      x: wallCenter.x + candidateA.x * TEST_DIST,
      y: wallCenter.y + candidateA.y * TEST_DIST,
      z: wallCenter.z + candidateA.z * TEST_DIST,
    };
    testB = {
      x: wallCenter.x + candidateB.x * TEST_DIST,
      y: wallCenter.y + candidateB.y * TEST_DIST,
      z: wallCenter.z + candidateB.z * TEST_DIST,
    };
    aOut = _isOutsideBBox(testA, globalBBox);
    bOut = _isOutsideBBox(testB, globalBBox);

    if (aOut && !bOut) {
      outsideDir = Math.sign(candidateA[axis]) || 1;
      source = 'bbox_exit_cross_product';
      confidence = 0.95;
      reason = 'cross(wallLengthDir,globalUp): testA exits globalBBox, testB inside';
    } else if (bOut && !aOut) {
      outsideDir = Math.sign(candidateB[axis]) || 1;
      source = 'bbox_exit_cross_product';
      confidence = 0.95;
      reason = 'cross(wallLengthDir,globalUp): testB exits globalBBox, testA inside';
    } else {
      ambiguous = true;
    }
  }

  if (outsideDir == null) {
    const matSense = wo.matLayerSense;
    const matAxis = wo.matLayerSetDir;
    if (matSense && matSense !== 'NOTDEFINED' && (matAxis === 'AXIS2' || matAxis == null) && localYT && localYT !== 0) {
      const senseSign = matSense === 'NEGATIVE' ? -1 : 1;
      outsideDir = senseSign * localYT;
      source = 'material_layer_set';
      confidence = ambiguous ? 0.6 : 0.75;
      reason = `DirectionSense=${matSense}${ambiguous ? ' (bbox-test ambiguous)' : ''}`;
    }
  }

  if (outsideDir == null && localYT && localYT !== 0) {
    outsideDir = -localYT;
    source = 'deprecated_localY_heuristic';
    confidence = 0.35;
    reason = 'deprecated: -wallInsideThickDir (geen matLayerSense, geen wallLengthDir)';
    ambiguous = true;
  }

  if (outsideDir == null) {
    const wallsOnAxis = (allOrigins ?? []).filter(w => w?.thicknessAxis === axis);
    const bMin = wallsOnAxis.length ? Math.min(...wallsOnAxis.map(w => w.thicknessStart)) : tStart;
    const bMax = wallsOnAxis.length ? Math.max(...wallsOnAxis.map(w => w.thicknessEnd ?? w.thicknessStart + 200)) : tEnd;
    const buildingCenter_t = (bMin + bMax) / 2;
    outsideDir = wallCenter[axis] - buildingCenter_t >= 0 ? 1 : -1;
    source = 'deprecated_bbox_heuristic';
    confidence = 0.2;
    reason = 'deprecated: bbox-afstand heuristic (geen geometrie beschikbaar)';
    ambiguous = true;
  }

  if (!outsideDir) outsideDir = 1;
  const outsidePos = outsideDir < 0 ? tStart : tEnd;

  return {
    outsideDir,
    outsidePos,
    source,
    confidence: Math.round(confidence * 100) / 100,
    ambiguous: ambiguous || confidence < 0.5,
    reason,
    _debug: { wallCenter, candidateA, candidateB, globalBBox, testA, testB, aOut, bOut },
  };
}

const _OPENING_MIN_WIDTH  = 200;
const _OPENING_WEIGHT_RAAM   = 2.0;
const _OPENING_WEIGHT_DEUR   = 1.5;
const _OPENING_BIAS_THRESHOLD = 0.70;

function _validateOutsideWithOpenings(wo, openings) {
  if (!wo || !Array.isArray(openings) || openings.length === 0) {
    return { openingsCount: 0, scoredCount: 0, sideAScore: 0, sideBScore: 0, biasedSide: null, matches: null, inconsistent: false, confidenceBoost: 0, note: 'geen openingen' };
  }

  const wallMid = (wo.thicknessStart + (wo.thicknessEnd ?? wo.thicknessStart + 200)) / 2;
  let sideAScore = 0, sideBScore = 0, scored = 0;
  const typeCounts = { raam: 0, deur: 0 };

  for (const op of openings) {
    if ((op.breedte ?? 0) < _OPENING_MIN_WIDTH) continue;
    if (op.thicknessCenter == null) continue;
    if (op.type === 'sparing') continue;

    const weight = op.type === 'raam' ? _OPENING_WEIGHT_RAAM : op.type === 'deur' ? _OPENING_WEIGHT_DEUR : 0;
    if (weight === 0) continue;

    if (op.thicknessCenter < wallMid) {
      sideAScore += weight;
    } else if (op.thicknessCenter > wallMid) {
      sideBScore += weight;
    }
    typeCounts[op.type] = (typeCounts[op.type] ?? 0) + 1;
    scored++;
  }

  if (scored === 0) {
    return { openingsCount: openings.length, scoredCount: 0, sideAScore: 0, sideBScore: 0, biasedSide: null, matches: null, inconsistent: false, confidenceBoost: 0, note: 'geen scoreerbare openingen (alles sparing of te klein)' };
  }

  const total = sideAScore + sideBScore;
  const biasedSide = total === 0 ? null
    : sideAScore / total >= _OPENING_BIAS_THRESHOLD ? 'A'
    : sideBScore / total >= _OPENING_BIAS_THRESHOLD ? 'B'
    : null;

  const resolvedOutsideDir = wo.resolvedOutside?.outsideDir ?? null;
  const expectedSide = resolvedOutsideDir == null ? null : resolvedOutsideDir < 0 ? 'A' : 'B';

  let matches = null, inconsistent = false, confidenceBoost = 0;
  if (biasedSide !== null && expectedSide !== null) {
    matches = biasedSide === expectedSide;
    inconsistent = !matches;
    confidenceBoost = matches ? 0.04 : 0;
  }

  const typeStr = Object.entries(typeCounts).filter(([,v])=>v>0).map(([k,v])=>`${k}:${v}`).join(' ');
  const biasStr = biasedSide ? `sideBias=${biasedSide}(${(biasedSide==='A'?sideAScore:sideBScore).toFixed(1)}/${total.toFixed(1)})` : 'geen duidelijke bias';
  const matchStr = matches == null ? '' : matches ? `→ CONSISTENT met outsideDir=${resolvedOutsideDir} ✓` : `→ INCONSISTENT met outsideDir=${resolvedOutsideDir} ⚠`;
  const note = `${typeStr} | ${biasStr} ${matchStr}`.trim();

  return { openingsCount: openings.length, scoredCount: scored, sideAScore: Math.round(sideAScore * 10) / 10, sideBScore: Math.round(sideBScore * 10) / 10, biasedSide, matches, inconsistent, confidenceBoost, note };
}

export function resolveOutsideDirections(walls) {
  const allOrigins = walls.map(w => w.wallOrigin).filter(Boolean);
  const globalBBox = _computeGlobalBBox(allOrigins);
  let overrideCount = 0, noThicknessCount = 0;
  for (const wall of walls) {
    if (!wall.wallOrigin) continue;
    const cls = _classifyWallExterior(wall.wallOrigin, globalBBox, wall.openings ?? []);
    wall.wallOrigin.isExterior = cls.isExterior;
    wall.wallOrigin.exteriorConfidence = cls.confidence;
    wall.wallOrigin.exteriorReason = cls.reason;
    const resolved = _resolveOneWallOutside(wall.wallOrigin, allOrigins, globalBBox);
    wall.wallOrigin.resolvedOutside = resolved;
    const openingCheck = _validateOutsideWithOpenings(wall.wallOrigin, wall.openings ?? []);
    if (openingCheck.inconsistent && openingCheck.biasedSide !== null && resolved.confidence < 0.90) {
      const wo = wall.wallOrigin;
      resolved.outsideDir = -resolved.outsideDir;
      resolved.outsidePos = resolved.outsideDir < 0 ? wo.thicknessStart : (wo.thicknessEnd ?? wo.thicknessStart + 200);
      resolved.source += '+window_bias_override';
      resolved.reason += ` [window-bias override: outsideDir geflipped naar ${resolved.outsideDir}]`;
      resolved.confidence = 0.58;
      resolved.ambiguous = false;
      overrideCount++;
    } else if (openingCheck.matches === true && resolved.confidence < 0.99) {
      resolved.confidence = Math.min(0.99, Math.round((resolved.confidence + openingCheck.confidenceBoost) * 100) / 100);
    } else if (openingCheck.inconsistent && openingCheck.biasedSide === null) {
      noThicknessCount++;
    }
    resolved.openingCheck = openingCheck;
  }
  console.log(`[resolveOutsideDirections] ${walls.length} wanden verwerkt: ${overrideCount} window-bias overrides toegepast, ${noThicknessCount} wanden zonder thicknessCenter (override kon niet vuren)`);
}

function addScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Kon ${src} niet laden`));
    document.head.appendChild(s);
  });
}

async function loadWebIFC() {
  if (window.WebIFC) return;
  await addScript(`/web-ifc-api-iife.js`);
  if (!window.WebIFC) throw new Error("WebIFC niet beschikbaar na laden");
}

export function warmupWebIFC() {
  if (!_loading) _loading = loadWebIFC();
}

export async function getApi() {
  if (!_loading) _loading = loadWebIFC();
  await _loading;
  if (!_api) {
    _api = new window.WebIFC.IfcAPI();
    await _api.Init((path) => `/${path}`);
  }
  return { IFC: window.WebIFC, api: _api };
}

function getBBox(api, modelID, expressID) {
  let mesh;
  try {
    mesh = api.GetFlatMesh(modelID, expressID);
  } catch {
    return null;
  }
  if (!mesh || mesh.geometries.size() === 0) return null;

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  let ok = false;
  let localXDir = null;
  let localYDir = null;

  for (let gi = 0; gi < mesh.geometries.size(); gi++) {
    const placed = mesh.geometries.get(gi);
    let geom;
    try {
      geom = api.GetGeometry(modelID, placed.geometryExpressID);
      const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
      const m = placed.flatTransformation;

      if (!localXDir) {
        localXDir = { x: m[0], y: m[1], z: m[2] };
      }
      if (!localYDir) {
        localYDir = { x: m[4], y: m[5], z: m[6] };
      }

      for (let vi = 0; vi < verts.length; vi += 6) {
        const lx = verts[vi], ly = verts[vi + 1], lz = verts[vi + 2];
        const wx = m[0] * lx + m[4] * ly + m[8]  * lz + m[12];
        const wy = m[1] * lx + m[5] * ly + m[9]  * lz + m[13];
        const wz = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
        if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
        if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
        if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz;
        ok = true;
      }
    } finally {
      geom?.delete();
    }
  }

  return ok ? { minX, maxX, minY, maxY, minZ, maxZ, localXDir, localYDir } : null;
}

const _UPAXIS_CONFIDENCE_HIGH = 0.75;
const _UPAXIS_CONFIDENCE_LOW  = 0.55;
const _UPAXIS_NORMAL_SAMPLE_MAX = 400;

/**
 * Leest IFCGEOMETRICREPRESENTATIONCONTEXT en roept registerIfcContext() aan.
 * Werkt de centrale projectCoordinates module-state bij.
 */
function _readAndRegisterIfcContext(api, modelID, filename, upAxis = 'z') {
  const ctx_result = {
    origin: { x: 0, y: 0, z: 0 },
    trueNorth: null,
    unitScale: 0.001,
    upAxis, // gedetecteerde verticaal → globale scène-oriëntatie (projectCoordinates)
  };

  try {
    // ── Eenheidsschaal ──────────────────────────────────────────────────────
    try {
      const siCode = api.GetTypeCodeFromName('IFCSIUNIT');
      const siVec = api.GetLineIDsWithType(modelID, siCode);
      for (let i = 0; i < siVec.size(); i++) {
        try {
          const u = api.GetLine(modelID, siVec.get(i), false);
          const uType = String(u?.UnitType?.value ?? u?.UnitType ?? '');
          if (!uType.includes('LENGTH')) continue;
          const prefix = String(u?.Prefix?.value ?? u?.Prefix ?? '');
          ctx_result.unitScale = prefix.includes('MILLI') ? 0.001 : 1.0;
          break;
        } catch { }
      }
    } catch { }

    // ── IFCGEOMETRICREPRESENTATIONCONTEXT ───────────────────────────────────
    const ctxCode = api.GetTypeCodeFromName('IFCGEOMETRICREPRESENTATIONCONTEXT');
    const ctxVec = api.GetLineIDsWithType(modelID, ctxCode);
    for (let i = 0; i < ctxVec.size(); i++) {
      try {
        const ctx = api.GetLine(modelID, ctxVec.get(i), false);
        const ctxType = ctx?.ContextType?.value ?? ctx?.ContextType;
        if (typeof ctxType === 'string' && ctxType !== 'Model') continue;

        // WCS-origin
        const wcsRef = ctx?.WorldCoordinateSystem?.value;
        if (wcsRef != null) {
          const wcs = api.GetLine(modelID, wcsRef, false);
          const originRef = wcs?.Location?.value;
          if (originRef != null) {
            const pt = api.GetLine(modelID, originRef, false);
            const coords = pt?.Coordinates;
            if (Array.isArray(coords)) {
              ctx_result.origin = {
                x: Number(coords[0]?.value ?? coords[0] ?? 0),
                y: Number(coords[1]?.value ?? coords[1] ?? 0),
                z: Number(coords[2]?.value ?? coords[2] ?? 0),
              };
            }
          }
        }

        // TrueNorth
        const tnRef = ctx?.TrueNorth?.value;
        if (tnRef != null) {
          const tn = api.GetLine(modelID, tnRef, false);
          const dir = tn?.DirectionRatios;
          if (Array.isArray(dir) && dir.length >= 2) {
            const tx = Number(dir[0]?.value ?? dir[0] ?? 0);
            const ty = Number(dir[1]?.value ?? dir[1] ?? 0);
            ctx_result.trueNorth = [tx, ty];
          }
        }
        break;
      } catch { }
    }
  } catch { }

  // Registreer in centrale module
  registerIfcContext(ctx_result, filename ?? 'onbekend bestand');
}

// GEOMETRY_DERIVED_ORIGIN (Stap 1): leest IfcSite RefLatitude/RefLongitude (compound plane
// angle = [deg,min,sec,millionths]) als georef-metadata voor worldAnchor. ALLEEN gevuld,
// niet toegepast. Geeft de eerste site met beide velden, anders null. Faalt nooit hard.
function _readSiteRefLatLong(api, modelID) {
  try {
    const siteCode = api.GetTypeCodeFromName('IFCSITE');
    const vec = api.GetLineIDsWithType(modelID, siteCode);
    const toArr = (v) => (Array.isArray(v) ? v.map((x) => Number(x?.value ?? x)) : null);
    for (let i = 0; i < vec.size(); i++) {
      try {
        const s = api.GetLine(modelID, vec.get(i), false);
        const la = toArr(s?.RefLatitude);
        const lo = toArr(s?.RefLongitude);
        if (la && lo) return { lat: la, long: lo };
      } catch { }
    }
  } catch { }
  return null;
}

function detectModelUpAxis(api, modelID, wallTypes, { forceOrientation = 'AUTO', sampleSize = 30 } = {}) {
  if (forceOrientation === 'X_NEG90') {
    setLastConfidentUpAxis('z');
    console.debug('[UpAxis] forceOrientation=X_NEG90 → heightAxis=z (Z-up IFC model, rotatie -90°)');
    return { axis: 'z', bboxVote: 'n.v.t.', bboxScore: 1, normalVote: 'n.v.t.', normalScore: 1, confidence: 1, confidenceLabel: 'HOOG', reason: 'forceOrientation=X_NEG90', sampleCount: 0, normCount: 0, forceOrientation };
  }
  if (forceOrientation === 'NONE') {
    setLastConfidentUpAxis('y');
    console.debug('[UpAxis] forceOrientation=NONE → heightAxis=y (geen rotatie)');
    return { axis: 'y', bboxVote: 'n.v.t.', bboxScore: 1, normalVote: 'n.v.t.', normalScore: 1, confidence: 1, confidenceLabel: 'HOOG', reason: 'forceOrientation=NONE', sampleCount: 0, normCount: 0, forceOrientation };
  }
  if (forceOrientation === 'X_POS90') {
    setLastConfidentUpAxis('z_neg');
    console.debug('[UpAxis] forceOrientation=X_POS90 → heightAxis=z_neg (omgekeerd Z-up model, rotatie +90°)');
    return { axis: 'z_neg', bboxVote: 'n.v.t.', bboxScore: 1, normalVote: 'n.v.t.', normalScore: 1, confidence: 1, confidenceLabel: 'HOOG', reason: 'forceOrientation=X_POS90', sampleCount: 0, normCount: 0, forceOrientation };
  }

  // ── AUTO: robuuste detectie van de verticaal van de OPGELOSTE (wereld) geometrie ──
  // Waarom dit nodig is: BIL-MOO (en meer Revit/IFC-exports met een project-/site-
  // coördinatenstelsel) komen uit web-ifc met de verticaal langs WERELD-Y i.p.v. Z.
  // De oude bbox-ratio over een steekproef van 30 wanden koos dan ten onrechte 'z',
  // waardoor deriveWallAxes hoogte en dikte verwisselde en gevels op het bovenvlak
  // landden (zie docs/diagnose-hsb-gevelvlak.md). We volgen daarom de werkelijke
  // verticaal van de OPGELOSTE geometrie via sterke, corroborerende signalen i.p.v.
  // een aanname. Let op: deze functie bepaalt ALLEEN de up-as; deriveWallAxes is
  // correct zodra de up-as klopt.
  const _STORY_MIN = 1.2, _STORY_MAX = 6.5, _BUCKET = 0.05; // 50 mm

  // wereld-AABB (X/Y/Z extent) van één element
  const _extentOf = (eid) => {
    let mesh; try { mesh = api.GetFlatMesh(modelID, eid); } catch { return null; }
    if (!mesh || mesh.geometries.size() === 0) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity, ok = false;
    for (let gi = 0; gi < mesh.geometries.size(); gi++) {
      const placed = mesh.geometries.get(gi); let geom;
      try {
        geom = api.GetGeometry(modelID, placed.geometryExpressID);
        const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
        const m = placed.flatTransformation;
        for (let i = 0; i < verts.length; i += 6) {
          const lx = verts[i] ?? 0, ly = verts[i + 1] ?? 0, lz = verts[i + 2] ?? 0;
          const wx = m[0] * lx + m[4] * ly + m[8]  * lz + m[12];
          const wy = m[1] * lx + m[5] * ly + m[9]  * lz + m[13];
          const wz = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
          if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
          if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
          if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz; ok = true;
        }
      } finally { geom?.delete(); }
    }
    return ok ? { dx: maxX - minX, dy: maxY - minY, dz: maxZ - minZ } : null;
  };

  // alle wand-ids (gespreide steekproef bij heel grote modellen, niet de eerste-N)
  const allWallIds = [];
  for (const wType of wallTypes) { const v = api.GetLineIDsWithType(modelID, wType); for (let i = 0; i < v.size(); i++) allWallIds.push(v.get(i)); }
  if (allWallIds.length === 0) {
    // Wand-loos (sub)model. ALLEEN bij vlag AAN: erf de up-as van een eerder confident
    // model (B) → anders extent-heuristiek met vlakke-footprint-sanity (A) → anders 'z'.
    // Bij vlag UIT: exact 'z' als voorheen (byte-identiek).
    if (isUpAxisInheritFallback()) {
      // (b) ERVEN van een eerder CONFIDENT model (load-order-onafhankelijk).
      const inherited = getLastConfidentUpAxis();
      if (inherited) {
        console.log(`[UpAxis] geen-wanden model → geërfde up-as '${inherited}' (van eerder confident model)`);
        return { axis: inherited, source: 'geërfd-confident-model', confidence: 0.5, confidenceLabel: 'MATIG', reason: `geen wanden → geërfd '${inherited}'`, sampleCount: 0, forceOrientation };
      }
      // (c) EXTENT-HEURISTIEK: kleinste overall-extent = up, mits vlakke footprint
      //     (beide niet-up-extents duidelijk groter); anders door naar 'z'.
      const ext = (() => {
        const types = ['IFCPLATE', 'IFCSLAB', 'IFCMEMBER', 'IFCCOVERING', 'IFCBUILDINGELEMENTPROXY', 'IFCCURTAINWALL'];
        let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity, mnZ = Infinity, mxZ = -Infinity, scanned = 0;
        for (const tn of types) {
          let code; try { code = api.GetTypeCodeFromName(tn); } catch { continue; }
          let vec; try { vec = api.GetLineIDsWithType(modelID, code); } catch { continue; }
          const n = vec.size(); if (!n) continue;
          const st = Math.max(1, Math.floor(n / 400));
          for (let i = 0; i < n; i += st) {
            let mesh; try { mesh = api.GetFlatMesh(modelID, vec.get(i)); } catch { continue; }
            if (!mesh || mesh.geometries.size() === 0) continue;
            for (let gi = 0; gi < mesh.geometries.size(); gi++) {
              const placed = mesh.geometries.get(gi); let geom;
              try {
                geom = api.GetGeometry(modelID, placed.geometryExpressID);
                const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
                const m = placed.flatTransformation;
                for (let v = 0; v < verts.length; v += 6) {
                  const lx = verts[v] ?? 0, ly = verts[v + 1] ?? 0, lz = verts[v + 2] ?? 0;
                  const wx = m[0] * lx + m[4] * ly + m[8]  * lz + m[12];
                  const wy = m[1] * lx + m[5] * ly + m[9]  * lz + m[13];
                  const wz = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
                  if (wx < mnX) mnX = wx; if (wx > mxX) mxX = wx;
                  if (wy < mnY) mnY = wy; if (wy > mxY) mxY = wy;
                  if (wz < mnZ) mnZ = wz; if (wz > mxZ) mxZ = wz;
                }
                scanned++;
              } finally { geom?.delete(); }
            }
          }
        }
        if (!scanned) return null;
        const span = { x: mxX - mnX, y: mxY - mnY, z: mxZ - mnZ };
        const up = ['x', 'y', 'z'].reduce((a, b) => span[a] <= span[b] ? a : b);
        const others = ['x', 'y', 'z'].filter((a) => a !== up);
        const flat = span[up] > 1e-6 && others.every((a) => span[a] >= 1.3 * span[up]);
        return flat ? { axis: up, span } : null;
      })();
      if (ext) {
        console.log(`[UpAxis] geen-wanden model → extent-heuristiek up-as '${ext.axis}' (spans m: X=${ext.span.x.toFixed(1)} Y=${ext.span.y.toFixed(1)} Z=${ext.span.z.toFixed(1)})`);
        return { axis: ext.axis, source: 'extent-heuristiek(geen-wanden)', confidence: 0.45, confidenceLabel: 'LAAG', reason: `geen wanden → extent '${ext.axis}'`, sampleCount: 0, forceOrientation };
      }
      console.log('[UpAxis] geen-wanden model → fallback z (geen confidente erf-bron, extent ambigu)');
    }
    return { axis: 'z', source: 'geen-wanden', confidence: 0, confidenceLabel: 'LAAG', reason: 'geen wanden → fallback z', sampleCount: 0, forceOrientation };
  }
  const _MAX_SCAN = 4000;
  const stride = Math.max(1, Math.floor(allWallIds.length / _MAX_SCAN));

  // SIGNAAL 1 (primair): meest voorkomende GEDEELDE wandhoogte = verdiepingshoogte.
  // Per as een histogram (50mm-buckets) van extents binnen storey-bereik over (een
  // gespreide doorsnede van) ALLE wanden. De verticaal heeft een scherpe modus
  // (elke wand op een verdieping deelt dezelfde hoogte); horizontale assen niet.
  const bucketsY = new Map(), bucketsZ = new Map();
  let sumY = 0, sumZ = 0, scanned = 0;
  for (let idx = 0; idx < allWallIds.length; idx += stride) {
    const e = _extentOf(allWallIds[idx]); if (!e) continue; scanned++;
    sumY += e.dy; sumZ += e.dz;
    if (e.dy >= _STORY_MIN && e.dy <= _STORY_MAX) { const k = Math.round(e.dy / _BUCKET); bucketsY.set(k, (bucketsY.get(k) || 0) + 1); }
    if (e.dz >= _STORY_MIN && e.dz <= _STORY_MAX) { const k = Math.round(e.dz / _BUCKET); bucketsZ.set(k, (bucketsZ.get(k) || 0) + 1); }
  }
  const _modal = (mp) => { let count = 0, value = 0; for (const [k, c] of mp) if (c > count) { count = c; value = k * _BUCKET; } return { count, value: Math.round(value * 1000) }; };
  const sharedY = _modal(bucketsY), sharedZ = _modal(bucketsZ);

  // SIGNAAL 2 (corroboratie / tie-break): de lange-as (= hoogte) van ramen/deuren.
  let doorVote = null;
  {
    const vote = { x: 0, y: 0, z: 0 };
    for (const tn of ['IFCWINDOW', 'IFCDOOR']) {
      let code; try { code = api.GetTypeCodeFromName(tn); } catch { continue; }
      let vec; try { vec = api.GetLineIDsWithType(modelID, code); } catch { continue; }
      for (let i = 0; i < vec.size(); i++) {
        const e = _extentOf(vec.get(i)); if (!e) continue;
        const mx = Math.max(e.dx, e.dy, e.dz);
        if (mx === e.dx) vote.x++; else if (mx === e.dy) vote.y++; else vote.z++;
      }
    }
    if (vote.y > 0 || vote.z > 0) doorVote = vote.y >= vote.z ? 'y' : 'z'; // x telt niet als verticaal
  }

  // ── Beslissing ──
  // Prioriteit (veilig: liever NIET flippen dan een Z-up model kantelen):
  //   1) ramen/deuren-langeas (sterkste echte signaal; aanwezig in gebouwmodellen).
  //   2) gedeelde verdiepingshoogte, maar ALLEEN bij een DUIDELIJKE winnaar
  //      (winnaar >= 3× verliezer, of verliezer ~0). Dit voorkomt dat geclusterde
  //      paneel-BREEDtes (bijv. GFRC: veel panelen 1700mm breed) als hoogte gelezen
  //      worden.
  //   3) ambigu (geen ramen/deuren én geen duidelijke modus) → 'z' = IFC-conventie
  //      (Z-up). Zo blijven Z-up modellen zonder corroboratie ongemoeid.
  // ΣY/ΣZ (extent-som) wordt bewust NIET als beslisser gebruikt: die is bevooroordeeld
  // naar de breedste as, niet naar de verticaal.
  const yC = sharedY.count, zC = sharedZ.count;
  const maxC = Math.max(yC, zC), minC = Math.min(yC, zC);
  const sharedWinner = yC >= zC ? 'y' : 'z';
  const clearShared = maxC >= 3 && (minC === 0 || maxC >= 3 * minC);
  let detectedAxis, source, confidence, reason;
  if (doorVote && !(clearShared && doorVote !== sharedWinner)) {
    detectedAxis = doorVote; source = 'ramen/deuren-langeas';
    confidence = (clearShared && doorVote === sharedWinner) ? 0.95 : 0.8;
    reason = `ramen/deuren-langeas → ${doorVote}` + (clearShared ? ` ; bevestigd door gedeelde hoogte (${sharedWinner}, ${maxC} vs ${minC})` : '');
  } else if (clearShared && doorVote && doorVote !== sharedWinner) {
    // conflict: meer bewijs in de wanden dan in de openingen → volg de wanden
    detectedAxis = sharedWinner; source = 'gedeelde-hoogte(>deur-conflict)'; confidence = 0.6;
    reason = `duidelijke gedeelde hoogte ${sharedWinner} (${maxC} vs ${minC}) wint van afwijkende ramen/deuren (${doorVote})`;
  } else if (clearShared) {
    detectedAxis = sharedWinner; source = 'gedeelde-verdiepingshoogte'; confidence = 0.85;
    const winVal = sharedWinner === 'y' ? sharedY.value : sharedZ.value;
    reason = `duidelijke modale wandhoogte langs ${sharedWinner} (${maxC} wanden @ ${winVal}mm vs ${minC})`;
  } else {
    detectedAxis = 'z'; source = 'ambigu→default-z(IFC-conventie)'; confidence = 0.4;
    reason = `geen ramen/deuren en geen duidelijke modus (y=${yC}, z=${zC}); val terug op IFC-conventie z`;
  }
  const confidenceLabel = confidence >= _UPAXIS_CONFIDENCE_HIGH ? 'HOOG' : confidence >= _UPAXIS_CONFIDENCE_LOW ? 'MATIG' : 'LAAG';

  // Onthoud de up-as als erf-bron voor latere wand-loze submodellen — UITSLUITEND bij
  // een confidente detectie (>= HOOG-drempel). Inert tenzij isUpAxisInheritFallback aan
  // staat (alleen de geen-wanden-tak leest deze waarde) → vlag-uit byte-identiek.
  if (confidence >= _UPAXIS_CONFIDENCE_HIGH) setLastConfidentUpAxis(detectedAxis);

  const _derivedViewerMode = detectedAxis === 'z_neg' ? 'X_POS90' : detectedAxis === 'z' ? 'X_NEG90' : 'NONE';
  console.log('[OrientationDecision]', {
    forceOrientation, detectedHeightAxis: detectedAxis, source, confidence: +confidence.toFixed(3),
    sharedY, sharedZ, doorVote, sumY: Math.round(sumY), sumZ: Math.round(sumZ),
    scanned, selectedViewerMode: _derivedViewerMode, reason,
  });

  return {
    axis: detectedAxis,
    source,
    confidence: +confidence.toFixed(3),
    confidenceLabel,
    reason,
    sharedY, sharedZ, doorVote,
    sumY: Math.round(sumY), sumZ: Math.round(sumZ),
    sampleCount: scanned,
    forceOrientation,
    // legacy-velden (debug-weergave verwacht deze namen):
    bboxVote: source.startsWith('gedeelde') ? detectedAxis : (source.startsWith('bbox') ? detectedAxis : '-'),
    bboxScore: +confidence.toFixed(3),
    normalVote: doorVote ?? '-',
    normalScore: doorVote ? 1 : 0,
  };
}

function deriveWallAxes(dx, dy, dz, heightAxis) {
  if (heightAxis === 'z_neg') heightAxis = 'z';
  if (heightAxis === 'y') {
    const lengthAxis    = dx >= dz ? 'x' : 'z';
    const thicknessAxis = dx >= dz ? 'z' : 'x';
    return {
      heightAxis,
      lengthAxis,
      thicknessAxis,
      length:    Math.round(Math.max(dx, dz) * 1000),
      height:    Math.round(dy * 1000),
      thickness: Math.round(Math.min(dx, dz) * 1000),
    };
  }
  const lengthAxis    = dx >= dy ? 'x' : 'y';
  const thicknessAxis = dx >= dy ? 'y' : 'x';
  return {
    heightAxis:    'z',
    lengthAxis,
    thicknessAxis,
    length:    Math.round(Math.max(dx, dy) * 1000),
    height:    Math.round(dz * 1000),
    thickness: Math.round(Math.min(dx, dy) * 1000),
  };
}

function getFacadePolygon(api, modelID, expressID, lAxis, hAxis, wallBB) {
  let mesh;
  try { mesh = api.GetFlatMesh(modelID, expressID); } catch { return null; }
  if (!mesh || mesh.geometries.size() === 0) return null;

  const GRID = 20;
  const wallMinL = wallBB[`min${lAxis.toUpperCase()}`];
  const wallMinH = wallBB[`min${hAxis.toUpperCase()}`];
  const wallLenMM = (wallBB[`max${lAxis.toUpperCase()}`] - wallMinL) * 1000;
  const wallHgtMM = (wallBB[`max${hAxis.toUpperCase()}`] - wallMinH) * 1000;
  const MARGIN = 600;

  let minGL = Infinity, maxGL = -Infinity, minGH = Infinity, maxGH = -Infinity;
  const cellArr = [];

  for (let gi = 0; gi < mesh.geometries.size(); gi++) {
    const placed = mesh.geometries.get(gi);
    let geom;
    try {
      geom = api.GetGeometry(modelID, placed.geometryExpressID);
      const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
      const idxs  = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
      const m = placed.flatTransformation;

      const lI = lAxis === 'x' ? 0 : lAxis === 'y' ? 1 : 2;
      const hI = hAxis === 'x' ? 0 : hAxis === 'y' ? 1 : 2;
      const wallMinLv = wallBB[`min${lAxis.toUpperCase()}`];
      const wallMinHv = wallBB[`min${hAxis.toUpperCase()}`];

      const projectL = (vi) => {
        const lx = verts[vi], ly = verts[vi+1], lz = verts[vi+2];
        const wx = m[0]*lx+m[4]*ly+m[8]*lz+m[12];
        const wy = m[1]*lx+m[5]*ly+m[9]*lz+m[13];
        const wz = m[2]*lx+m[6]*ly+m[10]*lz+m[14];
        const wArr = [wx, wy, wz];
        return (wArr[lI] - wallMinLv) * 1000;
      };
      const projectH = (vi) => {
        const lx = verts[vi], ly = verts[vi+1], lz = verts[vi+2];
        const wx = m[0]*lx+m[4]*ly+m[8]*lz+m[12];
        const wy = m[1]*lx+m[5]*ly+m[9]*lz+m[13];
        const wz = m[2]*lx+m[6]*ly+m[10]*lz+m[14];
        const wArr = [wx, wy, wz];
        return (wArr[hI] - wallMinHv) * 1000;
      };

      const tmpSet = new Set();
      for (let ti = 0; ti < idxs.length; ti += 3) {
        const ai = idxs[ti] * 6, bi = idxs[ti+1] * 6, ci = idxs[ti+2] * 6;
        const al = projectL(ai), ah = projectH(ai);
        const bl = projectL(bi), bh = projectH(bi);
        const cl2 = projectL(ci), ch2 = projectH(ci);
        if (al < -MARGIN && bl < -MARGIN && cl2 < -MARGIN) continue;
        if (ah < -MARGIN && bh < -MARGIN && ch2 < -MARGIN) continue;
        if (al > wallLenMM+MARGIN && bl > wallLenMM+MARGIN && cl2 > wallLenMM+MARGIN) continue;
        if (ah > wallHgtMM+MARGIN && bh > wallHgtMM+MARGIN && ch2 > wallHgtMM+MARGIN) continue;

        const addSeg = (l1, h1, l2, h2) => {
          const steps = Math.max(1, Math.ceil(Math.max(Math.abs(l2-l1), Math.abs(h2-h1)) / GRID));
          for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const gl = Math.round((l1 + t*(l2-l1)) / GRID);
            const gh = Math.round((h1 + t*(h2-h1)) / GRID);
            tmpSet.add(gl * 65536 + gh);
          }
        };
        addSeg(al,ah,bl,bh); addSeg(bl,bh,cl2,ch2); addSeg(al,ah,cl2,ch2);
      }
      for (const k of tmpSet) {
        const gl = (k / 65536) | 0, gh = k - gl * 65536;
        if (gl < minGL) minGL = gl; if (gl > maxGL) maxGL = gl;
        if (gh < minGH) minGH = gh; if (gh > maxGH) maxGH = gh;
        cellArr.push(k);
      }
    } finally { geom?.delete(); }
  }

  if (!cellArr.length) return null;

  minGL -= 1; maxGL += 1; minGH -= 1; maxGH += 1;
  const gridArea = (maxGL - minGL + 1) * (maxGH - minGH + 1);
  if (gridArea > 300000) return null;

  const W = maxGL - minGL + 1;
  const H = maxGH - minGH + 1;
  const cellBits = new Uint8Array(W * H);
  for (const k of cellArr) {
    const gl = (k / 65536) | 0, gh = k - gl * 65536;
    cellBits[(gl - minGL) * H + (gh - minGH)] = 1;
  }

  const outsideBits = new Uint8Array(W * H);
  const queue = [];
  const startIdx = 0;
  outsideBits[startIdx] = 1;
  queue.push(startIdx);
  let qi = 0;
  while (qi < queue.length) {
    const idx = queue[qi++];
    const gx = (idx / H) | 0, gy = idx - gx * H;
    const neighbors = [
      gx > 0     ? (gx-1)*H+gy : -1,
      gx < W-1   ? (gx+1)*H+gy : -1,
      gy > 0     ? gx*H+(gy-1) : -1,
      gy < H-1   ? gx*H+(gy+1) : -1,
    ];
    for (const ni of neighbors) {
      if (ni < 0) continue;
      if (!outsideBits[ni] && !cellBits[ni]) { outsideBits[ni] = 1; queue.push(ni); }
    }
  }

  const filledBits = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) filledBits[i] = cellBits[i] || (outsideBits[i] ? 0 : 1);

  const edgeMap = new Map();
  for (let gx = 0; gx < W; gx++) {
    for (let gy = 0; gy < H; gy++) {
      if (!filledBits[gx * H + gy]) continue;
      const gl = gx + minGL, gh = gy + minGH;
      const l0 = gl * GRID, h0 = gh * GRID, l1 = l0 + GRID, h1 = h0 + GRID;
      const hasTop    = gy < H-1 && filledBits[gx*H+(gy+1)];
      const hasBottom = gy > 0   && filledBits[gx*H+(gy-1)];
      const hasRight  = gx < W-1 && filledBits[(gx+1)*H+gy];
      const hasLeft   = gx > 0   && filledBits[(gx-1)*H+gy];
      if (!hasTop)    edgeMap.set(`${l0},${h1}`, [l1, h1]);
      if (!hasBottom) edgeMap.set(`${l1},${h0}`, [l0, h0]);
      if (!hasRight)  edgeMap.set(`${l1},${h1}`, [l1, h0]);
      if (!hasLeft)   edgeMap.set(`${l0},${h0}`, [l0, h1]);
    }
  }

  const startKey = edgeMap.keys().next().value;
  if (!startKey) return null;
  const [sl, sh] = startKey.split(',').map(Number);
  const raw = [];
  let cl = sl, ch = sh;
  for (let iter = 0; iter < 100000; iter++) {
    raw.push({ l: cl, h: ch });
    const next = edgeMap.get(`${cl},${ch}`);
    if (!next) break;
    [cl, ch] = next;
    if (cl === sl && ch === sh) break;
  }

  const poly = [];
  for (let i = 0; i < raw.length; i++) {
    const prev = raw[(i - 1 + raw.length) % raw.length];
    const curr = raw[i];
    const next = raw[(i + 1) % raw.length];
    if (!((prev.l === curr.l && curr.l === next.l) || (prev.h === curr.h && curr.h === next.h))) {
      poly.push(curr);
    }
  }

  return poly.length >= 3 ? poly : null;
}

function validateWallGeometryShape(facadePoly, dims, heightAxis) {
  const issues = [];
  let suggestedClass = null;

  if (heightAxis !== 'z') {
    issues.push(`Hoogte-as is '${heightAxis.toUpperCase()}' in plaats van 'Z' — element lijkt horizontaal`);
    suggestedClass = 'IfcSlab';
  }

  if (facadePoly && facadePoly.length >= 3) {
    const n = facadePoly.length;
    if (n !== 4) {
      const hs = facadePoly.map(p => p.h);
      const maxH = Math.max(...hs), minH = Math.min(...hs);
      const topPts = facadePoly.filter(p => p.h > minH + (maxH - minH) * 0.7);
      const hasSlopedTop = topPts.length > 1 &&
        (Math.max(...topPts.map(p => p.h)) - Math.min(...topPts.map(p => p.h))) > 50;
      if (hasSlopedTop) {
        issues.push(`Hellend/puntig bovenprofiel gedetecteerd (${n} hoekpunten)`);
        suggestedClass = suggestedClass ?? 'IfcRoof';
      } else {
        issues.push(`Niet-rechthoekig profiel: ${n} hoekpunten (verwacht 4)`);
        suggestedClass = suggestedClass ?? 'IfcBuildingElementProxy';
      }
    } else {
      let maxCosAngle = 0;
      for (let i = 0; i < 4; i++) {
        const p = facadePoly[i], q = facadePoly[(i + 1) % 4], r = facadePoly[(i + 2) % 4];
        const v1l = q.l - p.l, v1h = q.h - p.h;
        const v2l = r.l - q.l, v2h = r.h - q.h;
        const dot = v1l * v2l + v1h * v2h;
        const mag = Math.sqrt((v1l ** 2 + v1h ** 2) * (v2l ** 2 + v2h ** 2));
        const cosA = mag > 0 ? Math.abs(dot / mag) : 0;
        if (cosA > maxCosAngle) maxCosAngle = cosA;
      }
      if (maxCosAngle > 0.15) {
        issues.push(`Hoeken niet loodrecht (max afwijking ≈ ${Math.round(Math.asin(Math.min(1, maxCosAngle)) * 180 / Math.PI)}°)`);
        suggestedClass = suggestedClass ?? 'IfcBuildingElementProxy';
      }
      const sortedByH = [...facadePoly].sort((a, b) => b.h - a.h);
      const topEdgeDeltaH = Math.abs(sortedByH[0].h - sortedByH[1].h);
      if (topEdgeDeltaH > 50) {
        issues.push(`Bovenkant niet horizontaal (hoogteverschil: ${Math.round(topEdgeDeltaH)} mm)`);
        suggestedClass = suggestedClass ?? 'IfcRoof';
      }
    }
  } else if (!facadePoly) {
    if (dims.thickness > dims.height * 0.5) {
      issues.push('Dikte vergelijkbaar met hoogte — geometrie onzeker, mogelijk geen wand');
      suggestedClass = suggestedClass ?? 'IfcSlab';
    }
  }

  return { issues, suggestedClass: suggestedClass ?? (issues.length > 0 ? 'IfcBuildingElementProxy' : null) };
}

export async function runGeometryValidation(file, onProgress = null) {
  const { IFC, api } = await getApi();

  let modelID, ownModel = false;
  if (_cachedModel && _cachedModel.name === file.name && _cachedModel.size === file.size) {
    modelID = _cachedModel.modelID;
  } else {
    if (_cachedModel) { try { api.CloseModel(_cachedModel.modelID); } catch {} _cachedModel = null; }
    const buffer = await file.arrayBuffer();
    modelID = api.OpenModel(new Uint8Array(buffer), {});
    ownModel = true;
  }

  const report = [];
  try {
    const allWallIDs = [];
    for (const wType of [IFC.IFCWALLSTANDARDCASE, IFC.IFCWALL]) {
      const idsVec = api.GetLineIDsWithType(modelID, wType);
      for (let i = 0; i < idsVec.size(); i++) allWallIDs.push({ id: idsVec.get(i), wType });
    }

    const _upAxisResult = detectModelUpAxis(api, modelID, [IFC.IFCWALLSTANDARDCASE, IFC.IFCWALL]);
    const _upAxis = _upAxisResult.axis;

    onProgress?.({ current: 0, total: allWallIDs.length, log: `${allWallIDs.length} IfcWall elementen valideren…` });

    let processed = 0, lastYield = Date.now();
    for (const { id: wID, wType } of allWallIDs) {
      try {
        const wallBB = getBBox(api, modelID, wID);
        if (wallBB) {
          const dx = wallBB.maxX - wallBB.minX, dy = wallBB.maxY - wallBB.minY, dz = wallBB.maxZ - wallBB.minZ;
          const { heightAxis, lengthAxis, thicknessAxis, length, height, thickness } = deriveWallAxes(dx, dy, dz, _upAxis);
          if (length >= 100 && height >= 100) {
            const wallLine = api.GetLine(modelID, wID, false);
            const name = wallLine?.Name?.value ?? `Wand #${wID}`;
            const ifcClass = wType === IFC.IFCWALLSTANDARDCASE ? 'IfcWallStandardCase' : 'IfcWall';
            const facadePoly = getFacadePolygon(api, modelID, wID, lengthAxis, heightAxis, wallBB);
            const { issues, suggestedClass } = validateWallGeometryShape(facadePoly, { length, height, thickness }, heightAxis);
            if (issues.length > 0) {
              report.push({ expressID: wID, name, ifcClass, lengthAxis, heightAxis, thicknessAxis, length, height, thickness, facadePoly, issues, suggestedClass, overrideInclude: false });
            }
          }
        }
      } catch { }
      processed++;
      onProgress?.({ current: processed, total: allWallIDs.length });
      const now = Date.now();
      if (now - lastYield > 50) { lastYield = now; await new Promise(r => setTimeout(r, 0)); }
    }
    onProgress?.({ current: allWallIDs.length, total: allWallIDs.length, log: `Validatie klaar: ${report.length} mogelijke misclassificaties gevonden` });
    return report;
  } finally {
    if (ownModel) { try { api.CloseModel(modelID); } catch {} }
  }
}

export async function scanIfcWallTypes(file) {
  if (_cachedModel && _cachedModel.name === file.name && _cachedModel.size === file.size) {
    return _cachedModel.types;
  }

  const text = await file.text();
  const flat = text.replace(/\r?\n/g, ' ');

  const typeIdToName = {};
  const wallIds = new Set();
  const wallObjectType = {};
  const relRecords = [];

  const RECORD_RE = /#(\d+)\s*=\s*IFC(WALL(?:STANDARDCASE)?|WALLTYPE|RELDEFINESBYTYPE)\s*\(/gi;
  let m;
  while ((m = RECORD_RE.exec(flat)) !== null) {
    const id = m[1];
    const ifcType = m[2].toUpperCase();
    const start = RECORD_RE.lastIndex - 1;

    let end = start + 1;
    let depth = 1;
    let inStr = false;
    while (end < flat.length && depth > 0) {
      const c = flat[end];
      if (c === "'" && !inStr) inStr = true;
      else if (c === "'" && inStr) inStr = false;
      else if (!inStr) {
        if (c === '(') depth++;
        else if (c === ')') depth--;
      }
      end++;
    }
    const inner = flat.slice(start + 1, end - 1);
    RECORD_RE.lastIndex = end;

    if (ifcType === 'WALL' || ifcType === 'WALLSTANDARDCASE') {
      wallIds.add(id);
      const parts = splitStepArgs(inner);
      const objType = unquoteStep(parts[4]);
      if (objType) wallObjectType[id] = objType;
    } else if (ifcType === 'WALLTYPE') {
      const parts = splitStepArgs(inner);
      const name = unquoteStep(parts[2]) ?? unquoteStep(parts[8]);
      if (name) typeIdToName[id] = name;
    } else if (ifcType === 'RELDEFINESBYTYPE') {
      relRecords.push(inner);
    }
  }

  const wallToType = {};
  for (const inner of relRecords) {
    const parts = splitStepArgs(inner);
    const relatedRaw = parts[4] ?? '';
    const typeRaw = (parts[5] ?? '').trim().replace(/^#/, '');
    const tName = typeIdToName[typeRaw];
    if (!tName) continue;
    const idMatches = relatedRaw.match(/#(\d+)/g);
    if (!idMatches) continue;
    for (const ref of idMatches) {
      const wid = ref.slice(1);
      if (wallIds.has(wid)) wallToType[wid] = tName;
    }
  }

  const typeCounts = {};
  for (const wid of wallIds) {
    const name = wallToType[wid] ?? wallObjectType[wid] ?? '(geen type)';
    typeCounts[name] = (typeCounts[name] ?? 0) + 1;
  }

  return Object.entries(typeCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function extractInner(rec) {
  const start = rec.indexOf('(');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < rec.length; i++) {
    if (rec[i] === '(') depth++;
    else if (rec[i] === ')') { depth--; if (depth === 0) return rec.slice(start + 1, i); }
  }
  return null;
}

function splitStepArgs(str) {
  const parts = [];
  let depth = 0, cur = '', inStr = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === "'" && !inStr) { inStr = true; cur += c; }
    else if (c === "'" && inStr) { inStr = false; cur += c; }
    else if (inStr) { cur += c; }
    else if (c === '(' || c === '[') { depth++; cur += c; }
    else if (c === ')' || c === ']') { depth--; cur += c; }
    else if (c === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function unquoteStep(s) {
  if (!s) return null;
  s = s.trim();
  if (s === '$' || s === '') return null;
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  return null;
}

export async function parseIfc(file, allowedTypes = null, onProgress = null, { forceOrientation = 'AUTO' } = {}) {
  const { IFC, api } = await getApi();

  let modelID, wallTypeMap, ownModel = false;
  if (_cachedModel && _cachedModel.name === file.name && _cachedModel.size === file.size) {
    modelID     = _cachedModel.modelID;
    wallTypeMap = _cachedModel.wallTypeMap;
  } else {
    if (_cachedModel) {
      try { api.CloseModel(_cachedModel.modelID); } catch {}
      _cachedModel = null;
    }
    const buffer = await file.arrayBuffer();
    const data   = new Uint8Array(buffer);
    modelID      = api.OpenModel(data, {});
    wallTypeMap  = {};
    ownModel     = true;
    try {
      const relDefVec = api.GetLineIDsWithType(modelID, IFC.IFCRELDEFINESBYTYPE);
      for (let i = 0; i < relDefVec.size(); i++) {
        try {
          const rel = api.GetLine(modelID, relDefVec.get(i), false);
          const typeRef = rel?.RelatingType?.value;
          if (!typeRef) continue;
          const typeLine = api.GetLine(modelID, typeRef, false);
          const tName = typeLine?.Name?.value ?? null;
          const related = rel?.RelatedObjects;
          if (!related || !tName) continue;
          for (let j = 0; j < related.length; j++) {
            const wid = related[j]?.value;
            if (wid) wallTypeMap[wid] = tName;
          }
        } catch { }
      }
    } catch { }
  }

  try {

    // --- Storey-koppeling: wandID → storeyExpressID ---
    // Wordt gebruikt door inheritOpeningsForWalls() om wanden uit dezelfde
    // bouwlaag te matchen, ook als hun absolute z-coördinaten sterk verschillen
    // (bijv. in gestapelde woningbouw met per-blok coördinaatstelsels).
    const wallStoreyMap = {};
    try {
      const contVec = api.GetLineIDsWithType(modelID, IFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
      for (let i = 0; i < contVec.size(); i++) {
        try {
          const rel = api.GetLine(modelID, contVec.get(i), false);
          const structRef = rel?.RelatingStructure?.value;
          if (!structRef) continue;
          const structLine = api.GetRawLineData(modelID, structRef);
          if (!structLine) continue;
          const typeName = api.GetNameFromTypeCode(structLine.type).toUpperCase();
          if (!typeName.includes('BUILDINGSTOREY') && !typeName.includes('STOREY')) continue;
          const related = rel?.RelatedElements;
          if (!Array.isArray(related)) continue;
          for (const r of related) {
            const wid = r?.value;
            if (wid != null) wallStoreyMap[wid] = structRef;
          }
        } catch { }
      }
      console.log('[StoreyMap] Wanden gekoppeld aan bouwlaag:', Object.keys(wallStoreyMap).length);
    } catch { }

    const openingType = {};
    const fillerExpressID = {};
    const relFillsVec = api.GetLineIDsWithType(modelID, IFC.IFCRELFILLSELEMENT);
    for (let i = 0; i < relFillsVec.size(); i++) {
      try {
        const rel = api.GetLine(modelID, relFillsVec.get(i), false);
        const opID = rel?.RelatingOpeningElement?.value;
        const filID = rel?.RelatedBuildingElement?.value;
        if (!opID || !filID) continue;
        const raw = api.GetRawLineData(modelID, filID);
        const typeName = api.GetNameFromTypeCode(raw.type).toLowerCase();
        openingType[opID] = typeName.includes("window") ? "raam"
          : typeName.includes("door") ? "deur"
          : "sparing";
        fillerExpressID[opID] = filID;
      } catch { }
    }

    const wallVoids = {};
    const relVoidsVec = api.GetLineIDsWithType(modelID, IFC.IFCRELVOIDSELEMENT);
    for (let i = 0; i < relVoidsVec.size(); i++) {
      try {
        const rel = api.GetLine(modelID, relVoidsVec.get(i), false);
        const wID = rel?.RelatingBuildingElement?.value;
        const oID = rel?.RelatedOpeningElement?.value;
        if (!wID || !oID) continue;
        if (!wallVoids[wID]) wallVoids[wID] = [];
        wallVoids[wID].push(oID);
      } catch { }
    }
    {
      const voidTypeCounts = {};
      for (const wid of Object.keys(wallVoids)) {
        const tName = wallTypeMap[+wid] ?? '(geen type)';
        voidTypeCounts[tName] = (voidTypeCounts[tName] ?? 0) + wallVoids[+wid].length;
      }
      console.log('[VoidDiag] IFCRELVOIDSELEMENT per wandtype:', voidTypeCounts);
      console.log('[VoidDiag] Totaal relaties:', relVoidsVec.size(), '| Wandtypen met voids:', Object.keys(voidTypeCounts).length);
    }

    {
      let _openingElemCount = 0;
      let _windowCount = 0;
      let _doorCount = 0;
      try { _openingElemCount = api.GetLineIDsWithType(modelID, IFC.IFCOPENINGELEMENT).size(); } catch {}
      try { _windowCount      = api.GetLineIDsWithType(modelID, IFC.IFCWINDOW).size();         } catch {}
      try { _doorCount        = api.GetLineIDsWithType(modelID, IFC.IFCDOOR).size();            } catch {}
      const _totalVoids = Object.values(wallVoids).reduce((s, v) => s + v.length, 0);
      console.log('[IfcSemanticDiag]', {
        IFCRELVOIDSELEMENT:  relVoidsVec.size(),
        IFCRELFILLSELEMENT:  relFillsVec.size(),
        IFCOPENINGELEMENT:   _openingElemCount,
        IFCWINDOW:           _windowCount,
        IFCDOOR:             _doorCount,
        wallsWithVoids:      Object.keys(wallVoids).length,
        totalVoids:          _totalVoids,
        fillersMapped:       Object.keys(fillerExpressID).length,
        openingTypesMapped:  Object.keys(openingType).length,
        openingTypeDistrib:  Object.values(openingType).reduce((m, t) => { m[t] = (m[t] ?? 0) + 1; return m; }, {}),
      });
    }

    const matLayerByWall = {};
    try {
      const relMatVec = api.GetLineIDsWithType(modelID, IFC.IFCRELASSOCIATESMATERIAL);
      for (let i = 0; i < relMatVec.size(); i++) {
        try {
          const rel = api.GetLine(modelID, relMatVec.get(i), false);
          const matRef = rel?.RelatingMaterial?.value;
          if (!matRef) continue;
          const rawMat = api.GetRawLineData(modelID, matRef);
          const typeName = api.GetNameFromTypeCode(rawMat.type).toUpperCase();
          if (!typeName.includes('MATERIALLAYERSETUSAGE')) continue;
          const matUsage = api.GetLine(modelID, matRef, false);
          const directSense = matUsage?.DirectionSense?.value ?? null;
          const layerSetDir = matUsage?.LayerSetDirection?.value ?? null;
          const offsetRaw = matUsage?.OffsetFromReferenceLine;
          const offset_mm = typeof offsetRaw === 'number' ? Math.round(offsetRaw * 1000) : (typeof offsetRaw?.value === 'number' ? Math.round(offsetRaw.value * 1000) : 0);
          const relObj = rel?.RelatedObjects;
          if (!relObj) continue;
          for (const r of relObj) {
            const wid = r?.value;
            if (wid != null) matLayerByWall[wid] = { directSense, layerSetDir, offset_mm };
          }
        } catch { }
      }
    } catch { }

    const spaceBoundaryTypeByWall = {};
    try {
      const sbVec = api.GetLineIDsWithType(modelID, IFC.IFCRELSPACEBOUNDARY);
      for (let i = 0; i < sbVec.size(); i++) {
        try {
          const rel = api.GetLine(modelID, sbVec.get(i), false);
          const elemID = rel?.RelatedBuildingElement?.value;
          if (!elemID) continue;
          const sense = rel?.InternalOrExternalBoundary?.value ?? null;
          if (!sense) continue;
          const isExt = sense !== 'INTERNAL' && sense !== 'NOTDEFINED' && sense !== 'UNDEFINED';
          if (!spaceBoundaryTypeByWall[elemID] || isExt) {
            spaceBoundaryTypeByWall[elemID] = isExt ? 'EXTERNAL' : 'INTERNAL';
          }
        } catch { }
      }
    } catch { }

    const walls = [];
    const wallTypesList2 = [IFC.IFCWALLSTANDARDCASE, IFC.IFCWALL];

    let totalWalls = 0;
    const allWallIDs = [];
    for (const wType of wallTypesList2) {
      const idsVec = api.GetLineIDsWithType(modelID, wType);
      for (let i = 0; i < idsVec.size(); i++) {
        const wID = idsVec.get(i);
        if (allowedTypes !== null) {
          const tName = wallTypeMap[wID] ?? '(geen type)';
          if (!allowedTypes.has(tName)) continue;
        }
        allWallIDs.push(wID);
        totalWalls++;
      }
    }

    const _upAxisResult = detectModelUpAxis(api, modelID, wallTypesList2, { forceOrientation });
    const _upAxis = _upAxisResult.axis;
    onProgress?.({ phase: 'upaxis', ..._upAxisResult });

    onProgress?.({ phase: 'init', log: `web-ifc model geopend, ${totalWalls} wanden in selectie` });
    onProgress?.({ phase: 'wanden', current: 0, total: totalWalls });

    // GEOMETRY_DERIVED_ORIGIN (Stap 1): globale emitted-local AABB (meters) over de BEHOUDEN
    // wanden — bron voor de render-origin (AABB-center). Alleen accumuleren; de toepassing
    // (buildProjectMatrix) en het zetten van module-state gebeuren achter de vlag.
    let _eMinX = Infinity, _eMaxX = -Infinity;
    let _eMinY = Infinity, _eMaxY = -Infinity;
    let _eMinZ = Infinity, _eMaxZ = -Infinity;

    let processed = 0;
    let lastYield = Date.now();
    for (const wID of allWallIDs) {
        try {
          const wallBB = getBBox(api, modelID, wID);
          if (!wallBB) continue;

          // TIJDELIJK DEBUG — verwijder na gebruik
          const _DEBUG_IDS = [94805, 94833, 104739];
          const _DEBUG_WORKING = 378791;
          const _wallLine2 = api.GetLine(modelID, wID, false);
          const _globalId2 = _wallLine2?.GlobalId?.value ?? '';
          const _isDebugWall = wID === 94805 || wID === _DEBUG_WORKING || _globalId2.includes('26037507') || _globalId2.includes('25624793');
          if (_isDebugWall) {
            const _m = _extractWallMatrix(api, modelID, wID);
            const _mArr = _m ? Array.from(_m) : new Array(16).fill(null);
            console.log(`[WallBB-DEBUG] wID=${wID} globalId=${_globalId2} BB minX=${wallBB.minX.toFixed(4)} maxX=${wallBB.maxX.toFixed(4)} minY=${wallBB.minY.toFixed(4)} maxY=${wallBB.maxY.toFixed(4)} minZ=${wallBB.minZ.toFixed(4)} maxZ=${wallBB.maxZ.toFixed(4)}`);
            console.log(`[WallBB-DEBUG] wID=${wID} flatTransformation m0-3:  ${_mArr.slice(0,4).map(v=>v?.toFixed(5)).join(', ')}`);
            console.log(`[WallBB-DEBUG] wID=${wID} flatTransformation m4-7:  ${_mArr.slice(4,8).map(v=>v?.toFixed(5)).join(', ')}`);
            console.log(`[WallBB-DEBUG] wID=${wID} flatTransformation m8-11: ${_mArr.slice(8,12).map(v=>v?.toFixed(5)).join(', ')}`);
            console.log(`[WallBB-DEBUG] wID=${wID} flatTransformation m12-15:${_mArr.slice(12,16).map(v=>v?.toFixed(3)).join(', ')}`); // translatie
          }
          // EINDE TIJDELIJK DEBUG

          const dx = wallBB.maxX - wallBB.minX;
          const dy = wallBB.maxY - wallBB.minY;
          const dz = wallBB.maxZ - wallBB.minZ;

          const { heightAxis, lengthAxis, thicknessAxis, length, height } = deriveWallAxes(dx, dy, dz, _upAxis);

          if (length < 100 || height < 100) continue;

          // GEOMETRY_DERIVED_ORIGIN: behouden wand → draagt bij aan de emitted-local AABB
          // (zelfde wallBB-basis als wallOrigin; meters). Goedkoop, ongeacht de vlag.
          if (wallBB.minX < _eMinX) _eMinX = wallBB.minX; if (wallBB.maxX > _eMaxX) _eMaxX = wallBB.maxX;
          if (wallBB.minY < _eMinY) _eMinY = wallBB.minY; if (wallBB.maxY > _eMaxY) _eMaxY = wallBB.maxY;
          if (wallBB.minZ < _eMinZ) _eMinZ = wallBB.minZ; if (wallBB.maxZ > _eMaxZ) _eMaxZ = wallBB.maxZ;

          const wallLine = api.GetLine(modelID, wID, false);
          const name = wallLine?.Name?.value ?? `Wand #${wID}`;
          const globalId = wallLine?.GlobalId?.value ?? null;

          let wallInsideThickDir = 0;
          if (wallBB.localYDir) {
            const comp = wallBB.localYDir[thicknessAxis] ?? 0;
            if (Math.abs(comp) > 0.5) wallInsideThickDir = comp > 0 ? 1 : -1;
          }

          let wallLengthDir = null;
          if (wallBB.localXDir) {
            const { x, y, z } = wallBB.localXDir;
            const len = Math.sqrt(x * x + y * y + z * z);
            if (len > 0.01) wallLengthDir = { x: x / len, y: y / len, z: z / len };
          }

          const matData = matLayerByWall[wID];

          const wallOrigin = {
            globalId,
            lengthStart:    Math.round(wallBB[`min${lengthAxis.toUpperCase()}`]    * 1000),
            lengthEnd:      Math.round(wallBB[`max${lengthAxis.toUpperCase()}`]    * 1000),
            heightStart:    Math.round(wallBB[`min${heightAxis.toUpperCase()}`]    * 1000),
            heightEnd:      Math.round(wallBB[`max${heightAxis.toUpperCase()}`]    * 1000),
            thicknessStart: Math.round(wallBB[`min${thicknessAxis.toUpperCase()}`] * 1000),
            thicknessEnd:   Math.round(wallBB[`max${thicknessAxis.toUpperCase()}`] * 1000),
            lengthAxis,
            heightAxis,
            thicknessAxis,
            wallInsideThickDir,
            wallLengthDir,
            matLayerSense: matData?.directSense ?? null,
            matLayerSetDir: matData?.layerSetDir ?? null,
            matOffsetMm: matData?.offset_mm ?? 0,
            spaceBoundaryType: spaceBoundaryTypeByWall[wID] ?? null,
          };

          const openings = [];
          for (const oID of (wallVoids[wID] ?? [])) {
            try {
              const fillID = fillerExpressID[oID];

              let polygon = getFacadePolygon(api, modelID, oID, lengthAxis, heightAxis, wallBB);
              const polyFromOID = !!polygon;
              if (!polygon && fillID) {
                polygon = getFacadePolygon(api, modelID, fillID, lengthAxis, heightAxis, wallBB);
              }


              const oBB = getBBox(api, modelID, oID) ?? (fillID ? getBBox(api, modelID, fillID) : null);

              // TIJDELIJK DEBUG — verwijder na gebruik
              if (_isDebugWall) {
                const oBB_raw  = getBBox(api, modelID, oID);
                const oBB_fill = fillID ? getBBox(api, modelID, fillID) : null;
                const oMat     = _extractWallMatrix(api, modelID, oID);
                const oMatArr  = oMat ? Array.from(oMat) : null;
                const source   = oBB_raw ? 'oID' : (oBB_fill ? 'fillID' : 'none');
                const fmt = (b) => b ? `minX=${b.minX.toFixed(4)} maxX=${b.maxX.toFixed(4)} minY=${b.minY.toFixed(4)} maxY=${b.maxY.toFixed(4)} minZ=${b.minZ.toFixed(4)} maxZ=${b.maxZ.toFixed(4)}` : 'null';
                console.log(`[OpeningBB-DEBUG] wID=${wID} oID=${oID} fillID=${fillID} oBB_source=${source}`);
                console.log(`[OpeningBB-DEBUG]   oBB(oID):   ${fmt(oBB_raw)}`);
                console.log(`[OpeningBB-DEBUG]   oBB(fill):  ${fmt(oBB_fill)}`);
                console.log(`[OpeningBB-DEBUG]   oBB(used):  ${fmt(oBB)}`);
                console.log(`[OpeningBB-DEBUG]   wallBB.${thicknessAxis}: ${wallBB[`min${thicknessAxis.toUpperCase()}`].toFixed(4)}..${wallBB[`max${thicknessAxis.toUpperCase()}`].toFixed(4)}`);
                if (oMatArr) {
                  console.log(`[OpeningBB-DEBUG]   oMat m0-3:   ${oMatArr.slice(0,4).map(v=>v.toFixed(5)).join(', ')}`);
                  console.log(`[OpeningBB-DEBUG]   oMat m4-7:   ${oMatArr.slice(4,8).map(v=>v.toFixed(5)).join(', ')}`);
                  console.log(`[OpeningBB-DEBUG]   oMat m8-11:  ${oMatArr.slice(8,12).map(v=>v.toFixed(5)).join(', ')}`);
                  console.log(`[OpeningBB-DEBUG]   oMat m12-15: ${oMatArr.slice(12,16).map(v=>v.toFixed(3)).join(', ')}`);
                }
              }
              // EINDE TIJDELIJK DEBUG

              if (!oBB && !polygon) continue;

              const wallMins = { x: wallBB.minX, y: wallBB.minY, z: wallBB.minZ };

              let oX, oY, oWidth, oHeight, polyPts;

              if (polygon && polygon.length >= 3) {
                const ls = polygon.map((p) => p.l);
                const hs = polygon.map((p) => p.h);
                const lMin = Math.min(...ls), lMax = Math.max(...ls);
                const hMin = Math.min(...hs), hMax = Math.max(...hs);
                oWidth  = Math.round(lMax - lMin);
                oHeight = Math.round(hMax - hMin);
                oX = Math.round(lMin);
                oY = Math.round(hMin);
                polyPts = polygon;
              } else if (oBB) {
                const odx = oBB.maxX - oBB.minX;
                const ody = oBB.maxY - oBB.minY;
                const odz = oBB.maxZ - oBB.minZ;
                const oDims = { x: odx, y: ody, z: odz };
                oWidth  = Math.round(oDims[lengthAxis] * 1000);
                oHeight = Math.round(oDims[heightAxis] * 1000);
                const oBBmins = { x: oBB.minX, y: oBB.minY, z: oBB.minZ };
                oX = Math.round((oBBmins[lengthAxis] - wallMins[lengthAxis]) * 1000);
                oY = Math.round((oBBmins[heightAxis] - wallMins[heightAxis]) * 1000);
                polyPts = null;
              } else continue;

              if (oWidth < 50 || oHeight < 50) continue;

              const finalX = Math.max(0, oX);
              const finalY = Math.max(0, oY);
              const finalPolyPts = polyPts ?? [
                { l: finalX,           h: finalY },
                { l: finalX + oWidth,  h: finalY },
                { l: finalX + oWidth,  h: finalY + oHeight },
                { l: finalX,           h: finalY + oHeight },
              ];
              let oThicknessCenter = null;
              // Voor thicknessCenter: filler (raam/deur) prefereren boven opening-element,
              // want IfcOpeningElement omvat altijd de volledige wanddikte en geeft geen zijde-info.
              const oBB_forThickness = (fillID ? getBBox(api, modelID, fillID) : null) ?? oBB;
              if (oBB_forThickness) {
                const oTMin = oBB_forThickness[`min${thicknessAxis.toUpperCase()}`] * 1000;
                const oTMax = oBB_forThickness[`max${thicknessAxis.toUpperCase()}`] * 1000;
                const wTMin = wallBB[`min${thicknessAxis.toUpperCase()}`] * 1000;
                const wTMax = wallBB[`max${thicknessAxis.toUpperCase()}`] * 1000;
                if (oTMax >= wTMin && oTMin <= wTMax) {
                  oThicknessCenter = Math.round((oTMin + oTMax) / 2);
                }
              }
              // TIJDELIJK DEBUG thicknessCenter
              if (_isDebugWall) {
                const _oTMin = oBB ? oBB[`min${thicknessAxis.toUpperCase()}`] * 1000 : null;
                const _oTMax = oBB ? oBB[`max${thicknessAxis.toUpperCase()}`] * 1000 : null;
                const _wTMin = wallBB[`min${thicknessAxis.toUpperCase()}`] * 1000;
                const _wTMax = wallBB[`max${thicknessAxis.toUpperCase()}`] * 1000;
                console.log(`[ThicknessCenter-DEBUG] wID=${wID} oID=${oID} fillID=${fillID} thicknessAxis=${thicknessAxis} oTMin=${_oTMin?.toFixed(1)} oTMax=${_oTMax?.toFixed(1)} wTMin=${_wTMin.toFixed(1)} wTMax=${_wTMax.toFixed(1)} overlap=${_oTMax !== null && _oTMax >= _wTMin && _oTMin <= _wTMax} thicknessCenter=${oThicknessCenter}`);
              }
              // EINDE TIJDELIJK DEBUG

              openings.push({
                id: oID,
                type: openingType[oID] ?? "sparing",
                x: finalX,
                y: finalY,
                breedte: oWidth,
                hoogte: oHeight,
                polyPts: finalPolyPts,
                thicknessCenter: oThicknessCenter,
              });
            } catch { }
          }

          const facadePoly = getFacadePolygon(api, modelID, wID, lengthAxis, heightAxis, wallBB);
          walls.push({
            expressID: wID,
            name,
            length,
            height,
            openings,
            wallOrigin,
            facadePoly: facadePoly ?? null,
            typeName: wallTypeMap[wID] ?? null,
            storeyID: wallStoreyMap[wID] ?? null,
          });
        } catch { }

        processed++;
        onProgress?.({ phase: 'wanden', current: processed, total: totalWalls });
        const now = Date.now();
        if (now - lastYield > 50) {
          lastYield = now;
          await new Promise(r => setTimeout(r, 0));
        }
      }

    resolveOutsideDirections(walls);

    {
      const noVoidWalls   = walls.filter(w => w.openings.length === 0);
      const hostWalls     = walls.filter(w => w.openings.length > 0);

      const missing182  = noVoidWalls.filter(w => (w.typeName ?? '').includes('182.5')).slice(0, 3);
      const missing272  = noVoidWalls.filter(w => (w.typeName ?? '').includes('272.5')).slice(0, 3);
      const missingKop  = noVoidWalls.filter(w => (w.typeName ?? '').includes('kopsegevel')).slice(0, 3);

      console.log('[VoidDiag2] Wanden zonder openings per type:', {
        'HSB_182.5 (0 openings)': noVoidWalls.filter(w => (w.typeName ?? '').includes('182.5')).length,
        'HSB_272.5 (0 openings)': noVoidWalls.filter(w => (w.typeName ?? '').includes('272.5')).length,
        'kopsegevel (0 openings)': noVoidWalls.filter(w => (w.typeName ?? '').includes('kopsegevel')).length,
        'HSB_272.5 (met openings)': hostWalls.filter(w => (w.typeName ?? '').includes('272.5')).length,
      });

      for (const cand of missing182) {
        const wo = cand.wallOrigin;
        if (!wo) continue;
        const axis = wo.thicknessAxis;
        const lAxis = wo.lengthAxis;
        const tMid = ((wo.thicknessStart ?? 0) + (wo.thicknessEnd ?? wo.thicknessStart + 200)) / 2;

        const overlapping = hostWalls.filter(h => {
          const hwo = h.wallOrigin;
          if (!hwo || hwo.thicknessAxis !== axis || hwo.lengthAxis !== lAxis) return false;
          const hTMid = ((hwo.thicknessStart ?? 0) + (hwo.thicknessEnd ?? hwo.thicknessStart + 200)) / 2;
          if (Math.abs(hTMid - tMid) > 400) return false;
          const overlapL = Math.min(wo.lengthEnd, hwo.lengthEnd) - Math.max(wo.lengthStart, hwo.lengthStart);
          return overlapL > 100;
        });

        console.log('[VoidDiag2] HSB_182.5 wand zonder openings:', {
          wallId:        cand.expressID,
          wallName:      cand.name,
          typeName:      cand.typeName,
          thicknessAxis: axis,
          lengthAxis:    lAxis,
          lengthStart:   wo.lengthStart,
          lengthEnd:     wo.lengthEnd,
          thicknessStart: wo.thicknessStart,
          thicknessEnd:   wo.thicknessEnd,
          directVoids:   (wallVoids[cand.expressID] ?? []).length,
          overlappingHostsFound: overlapping.length,
          overlappingHosts: overlapping.slice(0, 2).map(h => ({
            wallId:        h.expressID,
            wallName:      h.name,
            typeName:      h.typeName,
            openingCount:  h.openings.length,
            thicknessStart: h.wallOrigin?.thicknessStart,
            thicknessEnd:   h.wallOrigin?.thicknessEnd,
            lengthStart:    h.wallOrigin?.lengthStart,
            lengthEnd:      h.wallOrigin?.lengthEnd,
          })),
        });
      }

      if (missing182.length === 0) {
        console.log('[VoidDiag2] Geen HSB_182.5 wanden zonder openings gevonden (of type niet aanwezig in selectie).');
      }
    }

    {
      const _typeGroups = {};
      for (const w of walls) {
        const t = w.typeName ?? '(geen type)';
        if (!_typeGroups[t]) _typeGroups[t] = { total: 0, withOpenings: 0, complexFacade: 0, sampleWallIds: [] };
        _typeGroups[t].total++;
        if ((w.openings?.length ?? 0) > 0) _typeGroups[t].withOpenings++;
        if ((w.facadePoly?.length ?? 0) > 4) _typeGroups[t].complexFacade++;
        if (_typeGroups[t].sampleWallIds.length < 3 && (w.openings?.length ?? 0) > 0) {
          _typeGroups[t].sampleWallIds.push({ wallId: w.expressID, openings: w.openings?.length ?? 0, facadePolyLen: w.facadePoly?.length ?? 0 });
        }
      }
      console.log('[WallSummaryDiag]', {
        totalWalls: walls.length,
        totalWithOpenings: walls.filter(w => (w.openings?.length ?? 0) > 0).length,
        totalWithComplexFacade: walls.filter(w => (w.facadePoly?.length ?? 0) > 4).length,
        byType: _typeGroups,
      });
    }

    // Registreer IFC-context in projectCoordinates module en geef snapshot mee
    _readAndRegisterIfcContext(api, modelID, file?.name ?? 'onbekend', _upAxis);

    // GEOMETRY_DERIVED_ORIGIN (Stap 1, vlag-gated): render-origin = AABB-center van de
    // emitted-local geometrie (mm); world-anchor = de georef-bron (#20 + refLatLong +
    // trueNorth + upAxis) als METADATA voor export (Stap 2 — hier alleen gevuld/
    // gepersisteerd, NIET toegepast). Vlag UIT → niets gezet → #20-render-pad ongewijzigd.
    if (isGeometryDerivedOrigin() && isFinite(_eMinX)) {
      const renderOrigin = {
        x: Math.round(((_eMinX + _eMaxX) / 2) * 1000),
        y: Math.round(((_eMinY + _eMaxY) / 2) * 1000),
        z: Math.round(((_eMinZ + _eMaxZ) / 2) * 1000),
      };
      const _pi = getProjectInfo(); // #20 + trueNorth zoals zojuist geregistreerd
      const worldAnchor = {
        contextWCS: _pi.origin,           // #20 (mm) — georef-bron, NIET de render-origin
        refLatLong: _readSiteRefLatLong(api, modelID),
        trueNorthDegrees: _pi.trueNorthDegrees,
        upAxis: _upAxis,
      };
      setGeometryDerivedRenderOrigin(renderOrigin, worldAnchor);
    }

    walls.projectInfo = getProjectInfo();
    return walls;
  } finally {
    if (ownModel) {
      api.CloseModel(modelID);
    } else {
      try { api.CloseModel(modelID); } catch {}
      _cachedModel = null;
    }
  }
}

export async function parseIfcGridLines(file) {
  if (_cachedModel && _cachedModel.name === file.name && _cachedModel.size === file.size && _cachedModel.gridLines) {
    return _cachedModel.gridLines;
  }

  const text = await file.text();
  const flat = text.replace(/\r?\n/g, ' ');

  const records = {};
  const RE = /#(\d+)\s*=\s*(IFCGRID|IFCGRIDAXIS|IFCLINE|IFCPOLYLINE|IFCCARTESIANPOINT)\s*\(/gi;
  let m;
  while ((m = RE.exec(flat)) !== null) {
    const id = m[1];
    const type = m[2].toUpperCase();
    const start = RE.lastIndex - 1;
    let end = start + 1, depth = 1, inStr = false;
    while (end < flat.length && depth > 0) {
      const c = flat[end];
      if (c === "'" && !inStr) inStr = true;
      else if (c === "'" && inStr) inStr = false;
      else if (!inStr) { if (c === '(') depth++; else if (c === ')') depth--; }
      end++;
    }
    records[id] = { type, inner: flat.slice(start + 1, end - 1) };
    RE.lastIndex = end;
  }

  function getCartesianPoint(id) {
    const rec = records[id];
    if (!rec || rec.type !== 'IFCCARTESIANPOINT') return null;
    const inner = rec.inner.replace(/^\(/, '').replace(/\)$/, '');
    const coords = inner.split(',').map((s) => parseFloat(s.trim()));
    return { x: (coords[0] ?? 0) * 1000, y: (coords[1] ?? 0) * 1000, z: (coords[2] ?? 0) * 1000 };
  }

  function getCurveFirstPoint(id) {
    const rec = records[id];
    if (!rec) return null;
    const args = splitStepArgs(rec.inner);
    if (rec.type === 'IFCLINE') {
      const ref = args[0]?.trim().replace('#', '');
      return getCartesianPoint(ref);
    }
    if (rec.type === 'IFCPOLYLINE') {
      const pts = args[0]?.match(/#(\d+)/g);
      if (pts?.length) return getCartesianPoint(pts[0].slice(1));
    }
    return null;
  }

  const result = [];
  for (const [, rec] of Object.entries(records)) {
    if (rec.type !== 'IFCGRID') continue;
    const args = splitStepArgs(rec.inner);
    const uRefs = (args[7] ?? '').match(/#(\d+)/g) ?? [];
    const vRefs = (args[8] ?? '').match(/#(\d+)/g) ?? [];
    for (const [axisType, refs] of [['U', uRefs], ['V', vRefs]]) {
      for (const ref of refs) {
        const axisRec = records[ref.slice(1)];
        if (!axisRec || axisRec.type !== 'IFCGRIDAXIS') continue;
        const aArgs = splitStepArgs(axisRec.inner);
        const tag = unquoteStep(aArgs[0]) ?? ref.slice(1);
        const curveRef = aArgs[2]?.trim().replace(/^#/, '');
        const pt = getCurveFirstPoint(curveRef);
        if (pt) result.push({ tag, axisType, x: pt.x, y: pt.y, z: pt.z });
      }
    }
  }

  if (_cachedModel) _cachedModel.gridLines = result;
  return result;
}

function r(v) {
  const s = String(Number(v));
  return s.includes('.') ? s : s + '.';
}

function calcOutsideFace(rwo, allWallOrigins) {
  if (!rwo) return { outsidePos: 0, outsideDir: 1 };

  if (rwo.resolvedOutside) {
    return {
      outsidePos: rwo.resolvedOutside.outsidePos,
      outsideDir: rwo.resolvedOutside.outsideDir,
      _debug: rwo.resolvedOutside._debug
        ? { ...rwo.resolvedOutside._debug, source: rwo.resolvedOutside.source, confidence: rwo.resolvedOutside.confidence, reason: rwo.resolvedOutside.reason }
        : { source: rwo.resolvedOutside.source, confidence: rwo.resolvedOutside.confidence, reason: rwo.resolvedOutside.reason },
    };
  }

  const axis = rwo.thicknessAxis;
  const tStart = rwo.thicknessStart;
  const tEnd = rwo.thicknessEnd ?? rwo.thicknessStart + 200;

  const wallsOnAxis = (allWallOrigins ?? []).filter((wo) => wo?.thicknessAxis === axis);
  const buildingMin = wallsOnAxis.length
    ? Math.min(...wallsOnAxis.map((wo) => wo.thicknessStart))
    : tStart;
  const buildingMax = wallsOnAxis.length
    ? Math.max(...wallsOnAxis.map((wo) => wo.thicknessEnd ?? wo.thicknessStart + 200))
    : tEnd;
  const buildingCenter_t = (buildingMin + buildingMax) / 2;
  const wallCenter_t = (tStart + tEnd) / 2;

  let outsideDir = null;
  let debugInfo = null;

  if (rwo.wallLengthDir) {
    const upAxis = rwo.heightAxis ?? 'y';
    const gu = { x: upAxis === 'x' ? 1 : 0, y: upAxis === 'y' ? 1 : 0, z: upAxis === 'z' ? 1 : 0 };
    const ld = rwo.wallLengthDir;
    const cx = ld.y * gu.z - ld.z * gu.y;
    const cy = ld.z * gu.x - ld.x * gu.z;
    const cz = ld.x * gu.y - ld.y * gu.x;
    const clen = Math.sqrt(cx * cx + cy * cy + cz * cz);
    if (clen > 0.01) {
      const candidateA = { x: cx / clen, y: cy / clen, z: cz / clen };
      const candidateB = { x: -cx / clen, y: -cy / clen, z: -cz / clen };
      const toOutside_t = wallCenter_t - buildingCenter_t;
      const candidateA_t = candidateA[axis] ?? 0;
      const sign = candidateA_t * toOutside_t >= 0 ? (Math.sign(candidateA_t) || 1) : -(Math.sign(candidateA_t) || 1);
      outsideDir = sign;
      debugInfo = { candidateA, candidateB, buildingCenter_t, wallCenter_t, toOutside_t, candidateA_t };
    }
  }

  let oldOutsideDir;
  if (rwo.wallInsideThickDir && rwo.wallInsideThickDir !== 0) {
    oldOutsideDir = -rwo.wallInsideThickDir;
  } else {
    const distToMin = tStart - buildingMin;
    const distToMax = buildingMax - tEnd;
    oldOutsideDir = distToMin <= distToMax ? -1 : 1;
  }

  if (outsideDir == null) outsideDir = oldOutsideDir;

  const outsidePos = outsideDir < 0 ? tStart : tEnd;
  return { outsidePos, outsideDir, _debug: debugInfo ? { ...debugInfo, oldOutsideDir } : null };
}

export function exportGroupsToIfc(groups, wallSettings, fileName, dirHandle) {
  const allWallOrigins = groups.flatMap((g) =>
    (g.wallsWithRows ?? []).map((wd) => wd.wall?.wallOrigin).filter(Boolean)
  );
  let eid = 1;
  const dataLines = [];
  const E  = (str) => { const id = eid++; dataLines.push(`#${id}=${str};`); return id; };
  const G  = (() => { let n = 1; return () => `'MI${String(n++).padStart(20,'0')}'`; })();
  const PT = (x,y,z) => E(`IFCCARTESIANPOINT((${r(x)},${r(y)},${r(z)}))`);

  const person = E(`IFCPERSON($,'User','','',$,$,$,$)`);
  const org    = E(`IFCORGANIZATION($,'MultiElementPlanner',$,$,$)`);
  const perOrg = E(`IFCPERSONANDORGANIZATION(#${person},#${org},$)`);
  const app    = E(`IFCAPPLICATION(#${org},'1.0','MultiElementPlanner','MEP')`);
  const owH    = E(`IFCOWNERHISTORY(#${perOrg},#${app},$,.ADDED.,$,$,$,0)`);
  const mmUnit = E(`IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)`);
  const units  = E(`IFCUNITASSIGNMENT((#${mmUnit}))`);
  const allRefWallOrigins = groups.flatMap((g) => g.refWallOrigin ? [g.refWallOrigin] : []);
  const haCount = { x: 0, y: 0, z: 0 };
  for (const rwo of allRefWallOrigins) haCount[rwo.heightAxis] = (haCount[rwo.heightAxis] ?? 0) + 1;
  const dominantHA = haCount.y >= haCount.z && haCount.y >= haCount.x ? 'y' : haCount.x >= haCount.z ? 'x' : 'z';
  const wcsAxisVec = dominantHA === 'y' ? [0,1,0] : dominantHA === 'x' ? [1,0,0] : [0,0,1];
  const wpt    = PT(0,0,0);
  const wcsAxisId = E(`IFCDIRECTION((${wcsAxisVec.join(',')}))`);
  const wax    = E(`IFCAXIS2PLACEMENT3D(#${wpt},#${wcsAxisId},$)`);
  const gCtx   = E(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#${wax},$)`);
  const gSub   = E(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#${gCtx},$,.MODEL_VIEW.,$)`);
  const proj   = E(`IFCPROJECT(${G()},#${owH},'${(fileName || 'BrickslipExport').replace(/'/g,"\\'")}' ,$,$,$,$,(#${gCtx}),#${units})`);
  const sitePl = E(`IFCLOCALPLACEMENT($,#${wax})`);
  const site   = E(`IFCSITE(${G()},#${owH},'Site',$,$,#${sitePl},$,$,.ELEMENT.,$,$,$,$,$)`);
  const bldPl  = E(`IFCLOCALPLACEMENT(#${sitePl},#${wax})`);
  const bld    = E(`IFCBUILDING(${G()},#${owH},'Building',$,$,#${bldPl},$,$,.ELEMENT.,$,$,$)`);
  const stPl   = E(`IFCLOCALPLACEMENT(#${bldPl},#${wax})`);
  const storey = E(`IFCBUILDINGSTOREY(${G()},#${owH},'Storey',$,$,#${stPl},$,$,.ELEMENT.,0.)`);
  E(`IFCRELAGGREGATES(${G()},#${owH},$,$,#${proj},(#${site}))`);
  E(`IFCRELAGGREGATES(${G()},#${owH},$,$,#${site},(#${bld}))`);
  E(`IFCRELAGGREGATES(${G()},#${owH},$,$,#${bld},(#${storey}))`);

  const pt2D   = E(`IFCCARTESIANPOINT((0.,0.))`);
  const extDir = E(`IFCDIRECTION((0.,0.,1.))`);
  const sAx0   = E(`IFCAXIS2PLACEMENT3D(#${PT(0,0,0)},$,$)`);

  const colorCache = {};
  const getStyle = (hex) => {
    if (colorCache[hex]) return colorCache[hex];
    const rv = (parseInt(hex.slice(1,3),16)/255).toFixed(4);
    const gv = (parseInt(hex.slice(3,5),16)/255).toFixed(4);
    const bv = (parseInt(hex.slice(5,7),16)/255).toFixed(4);
    const rgb  = E(`IFCCOLOURRGB($,${rv},${gv},${bv})`);
    const rend = E(`IFCSURFACESTYLERENDERING(#${rgb},0.,$,$,$,$,$,$,.FLAT.)`);
    const ss   = E(`IFCSURFACESTYLE($,.BOTH.,(#${rend}))`);
    const psa  = E(`IFCPRESENTATIONSTYLEASSIGNMENT((#${ss}))`);
    colorCache[hex] = psa;
    return psa;
  };

  const allProxyIds = [];

  let _groupIdx = 0;
  for (const group of groups) {
    _groupIdx++;
    const settings = wallSettings[group.id] ?? {};
    const brickColor = settings.stripColor ?? settings.color ?? '#a64033';
    const _stripArtId = (settings.steenstripsArtikelen ?? [])[0];
    const _stripArt = _stripArtId ? STEENSTRIP_CATALOG.find((a) => a.id === _stripArtId) : null;
    const brickD = _stripArt ? _stripArt.dikte : (settings.brickDepth ?? 20);
    const material = settings.material ?? { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
    const groupVerband = settings.verband ?? 'halfsteens';
    const groupBrickExtH = groupVerband === 'staand_tegelverband' ? material.steenL : material.steenH;
    const isSlimFort = (group.backingType ?? 'hout') === 'aluminium_slimfort';
    const _sfS = isSlimFort ? { ...SLIMFORT_DEFAULTS, ...(group.slimFortSettings ?? {}) } : {};
    const sfTotalThick = _sfS.totalThickness ?? 196;
    const sfBracketDepth = _sfS.bracketDepth ?? 50;
    const sfProfileDepth = _sfS.profileDepth ?? 63;
    const sfProfileInsertDepth = _sfS.profileInsertDepth ?? 33;
    const sfProfileWidth = _sfS.profileWidth ?? 44;
    const sfProfileHeight = _sfS.profileHeight ?? 44;
    const sfBracketWidth = _sfS.bracketWidth ?? 128;
    const sfBracketHeight = _sfS.bracketHeight ?? 60;
    const panelDikte = settings.panelen?.dikte ?? 8;
    const panelVentGap = isSlimFort ? (group.concreteCladdingSettings?.panelVentilationGap ?? 0) : 0;
    const sfDepths = isSlimFort ? getSlimFortDepths(_sfS, panelVentGap, panelDikte, brickD) : null;
    const latDikte = group.latDikte ?? 28;
    const hasVertLat = (group.lattenData ?? []).some((l) => l.richting === 'verticaal');
    const effectiveLatDepth = isSlimFort ? sfDepths.facadeBaseDepth : (hasVertLat ? 2 * latDikte : latDikte);
    const vis = group.layerVisibility ?? {};
    const rwo = group.refWallOrigin;
    const groupMinX = group.groupMinX ?? 0;
    const groupMinH = group.groupMinH ?? 0;

    const makeGroupAxes = () => {
      if (!rwo) return { axisStr: '$', refStr: '$' };
      const ha = rwo.heightAxis;
      const la = rwo.lengthAxis;
      const mkDir = (v) => `#${E(`IFCDIRECTION((${v.join(',')}))`)}`;
      const axisStr = ha === 'z' ? mkDir([0,0,1]) : ha === 'y' ? mkDir([0,1,0]) : mkDir([1,0,0]);
      const refStr  = la === 'x' ? mkDir([1,0,0]) : la === 'y' ? mkDir([0,1,0]) : mkDir([0,0,1]);
      return { axisStr, refStr };
    };

    const rawFace = calcOutsideFace(rwo, allWallOrigins);
    const dirFlip = !!(settings.outsideDirFlip);
    const grpOutPos = rawFace.outsidePos;
    const grpOutDir = dirFlip ? -rawFace.outsideDir : rawFace.outsideDir;

    if ([1, 5, 7].includes(_groupIdx)) {
      if (rawFace.outsideDir == null) {
        console.warn(
          `[exportGroupsToIfc] INTERIOR_WALL_NO_OUTSIDE_APPLIED groep ${_groupIdx} (${group.name ?? group.id})`,
          '\n  isExterior:', rwo?.isExterior,
          '\n  exteriorConfidence:', rwo?.exteriorConfidence,
          '\n  exteriorReason:', rwo?.exteriorReason,
          '\n  source:', rawFace._debug?.source ?? 'INTERIOR_WALL',
          '\n  → groep overgeslagen',
        );
      } else if (rawFace._debug) {
        const d = rawFace._debug;
        console.log(
          `[calcOutsideFace] groep ${_groupIdx} (${group.name ?? group.id})`,
          '\n  isExterior:', rwo?.isExterior, '| exteriorConfidence:', rwo?.exteriorConfidence, '| exteriorReason:', rwo?.exteriorReason,
          '\n  source:', d.source, '| confidence:', d.confidence, '| reason:', d.reason,
          '\n  wallLengthDir:', JSON.stringify(rwo?.wallLengthDir),
          '\n  thicknessAxis:', rwo?.thicknessAxis,
          '\n  wallCenter:', JSON.stringify(d.wallCenter),
          '\n  candidateA:', JSON.stringify(d.candidateA),
          '\n  candidateB:', JSON.stringify(d.candidateB),
          '\n  testA:', JSON.stringify(d.testA), '→ outside bbox:', d.aOut,
          '\n  testB:', JSON.stringify(d.testB), '→ outside bbox:', d.bOut,
          '\n  globalBBox:', JSON.stringify(d.globalBBox),
          '\n  chosenOutsideDir:', rawFace.outsideDir,
          '\n  outsidePos:', grpOutPos, 'mm',
          '\n  dirFlip:', dirFlip,
          '\n  grpOutDir (final):', grpOutDir,
        );
      }
    }

    if (grpOutDir == null) continue;

    const groupToWorld = (gx, outDepth, gz) => {
      if (!rwo) return [gx, outDepth, gz];
      const p = { x: 0, y: 0, z: 0 };
      p[rwo.lengthAxis]    = groupMinX + gx;
      p[rwo.thicknessAxis] = grpOutPos + grpOutDir * outDepth;
      p[rwo.heightAxis]    = groupMinH + gz;
      return [p.x, p.y, p.z];
    };

    if (vis.strips !== false) {
      const stripBatches = group.stripBatches ?? (group.facadeData?.rows ? [{ rows: group.facadeData.rows, material, color: brickColor }] : null);
      if (stripBatches?.length && rwo) {
        const { axisStr, refStr } = makeGroupAxes();
        for (const batch of stripBatches) {
          const batchColor = batch.color ?? brickColor;
          const batchMat = batch.material ?? material;
          const batchBrickD = brickD;
          const batchVerband = batch.verband ?? 'halfsteens';
          const brickExtH = batchVerband === 'staand_tegelverband' ? batchMat.steenL : batchMat.steenH;
          for (const row of batch.rows) {
            for (const piece of row.pieces) {
              const [wx, wy, wz] = groupToWorld(piece.start + piece.length / 2, effectiveLatDepth + panelDikte + batchBrickD / 2, row.y);
              const placePt = PT(wx, wy, wz);
              const place3D = E(`IFCAXIS2PLACEMENT3D(#${placePt},${axisStr},${refStr})`);
              const localPl = E(`IFCLOCALPLACEMENT(#${stPl},#${place3D})`);
              const profAx  = E(`IFCAXIS2PLACEMENT2D(#${pt2D},$)`);
              const prof    = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${profAx},${r(piece.length)},${r(batchBrickD)})`);
              const solid   = E(`IFCEXTRUDEDAREASOLID(#${prof},#${sAx0},#${extDir},${r(brickExtH)})`);
              const shRep   = E(`IFCSHAPEREPRESENTATION(#${gSub},'Body','SweptSolid',(#${solid}))`);
              const pds     = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shRep}))`);
              const safeName = `${group.name ?? 'Groep'} - Strip`.replace(/'/g, "\\'");
              const proxy   = E(`IFCBUILDINGELEMENTPROXY(${G()},#${owH},'${safeName}',$,'Steenstrip',#${localPl},#${pds},$,.NOTDEFINED.)`);
              E(`IFCSTYLEDITEM(#${solid},(#${getStyle(batchColor)}),$)`);
              allProxyIds.push(proxy);
            }
          }
        }
      } else {
        for (const wallData of (group.wallsWithRows ?? [])) {
          const { wall, rows } = wallData;
          const wo = wall.wallOrigin;
          const { outsidePos: wallOutPos, outsideDir: wallOutDir } = calcOutsideFace(wo, allWallOrigins);
          const toWorld = (localX, outDepth, localZ) => {
            if (!wo) return [localX, outDepth, localZ];
            const p = { x: 0, y: 0, z: 0 };
            p[wo.lengthAxis]    = wo.lengthStart + localX;
            p[wo.thicknessAxis] = wallOutPos + wallOutDir * outDepth;
            p[wo.heightAxis]    = wo.heightStart + localZ;
            return [p.x, p.y, p.z];
          };
          const _mkDir2 = (v) => `#${E(`IFCDIRECTION((${v.join(',')}))`)}`;
          const axisStr = wo.heightAxis === 'z' ? _mkDir2([0,0,1]) : wo.heightAxis === 'y' ? _mkDir2([0,1,0]) : _mkDir2([1,0,0]);
          const refStr  = wo.lengthAxis  === 'x' ? _mkDir2([1,0,0]) : wo.lengthAxis  === 'y' ? _mkDir2([0,1,0]) : _mkDir2([0,0,1]);
          for (const row of rows) {
            for (const piece of row.pieces) {
              const [wx, wy, wz] = toWorld(piece.start + piece.length / 2, effectiveLatDepth + panelDikte + brickD / 2, row.y);
              const placePt = PT(wx, wy, wz);
              const place3D = E(`IFCAXIS2PLACEMENT3D(#${placePt},${axisStr},${refStr})`);
              const localPl = E(`IFCLOCALPLACEMENT(#${stPl},#${place3D})`);
              const profAx  = E(`IFCAXIS2PLACEMENT2D(#${pt2D},$)`);
              const prof    = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${profAx},${r(piece.length)},${r(brickD)})`);
              const solid   = E(`IFCEXTRUDEDAREASOLID(#${prof},#${sAx0},#${extDir},${r(groupBrickExtH)})`);
              const shRep   = E(`IFCSHAPEREPRESENTATION(#${gSub},'Body','SweptSolid',(#${solid}))`);
              const pds     = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shRep}))`);
              const safeName = `${group.name ?? 'Groep'} - ${wall.name} - ${piece.label}`.replace(/'/g, "\\'");
              const proxy   = E(`IFCBUILDINGELEMENTPROXY(${G()},#${owH},'${safeName}',$,'Steenstrip',#${localPl},#${pds},$,.NOTDEFINED.)`);
              E(`IFCSTYLEDITEM(#${solid},(#${getStyle(brickColor)}),$)`);
              allProxyIds.push(proxy);
            }
          }
        }
      }
    }

    if (vis.strips !== false && (group.cornerWraps ?? []).length) {
      for (const wrap of group.cornerWraps) {
        const wRwo = wrap.secRwo;
        if (!wRwo) continue;
        const wRawFace = calcOutsideFace(wRwo, allWallOrigins);
        if (wRawFace.outsideDir == null) continue;
        const wOutPos = wRawFace.outsidePos;
        const wOutDir = wrap.secOutsideDirFlip ? -wRawFace.outsideDir : wRawFace.outsideDir;
        const wGroupToWorld = (gx, outDepth, gz) => {
          const p = { x: 0, y: 0, z: 0 };
          p[wRwo.lengthAxis]    = wrap.secGroupMinX + gx;
          p[wRwo.thicknessAxis] = wOutPos + wOutDir * outDepth;
          p[wRwo.heightAxis]    = wrap.secGroupMinH + gz;
          return [p.x, p.y, p.z];
        };
        const mkDirW = (v) => `#${E(`IFCDIRECTION((${v.join(',')}))`)}`;
        const wAxisStr = wRwo.heightAxis === 'z' ? mkDirW([0,0,1]) : wRwo.heightAxis === 'y' ? mkDirW([0,1,0]) : mkDirW([1,0,0]);
        const wRefStr  = wRwo.lengthAxis  === 'x' ? mkDirW([1,0,0]) : wRwo.lengthAxis  === 'y' ? mkDirW([0,1,0]) : mkDirW([0,0,1]);
        const wBrickH  = wrap.brickH ?? material.steenH ?? 50;
        const wBrickD  = wrap.brickD ?? brickD;
        const wColor   = wrap.color ?? brickColor;
        for (const row of wrap.rows) {
          for (const piece of row.pieces) {
            const [wx, wy, wz] = wGroupToWorld(piece.start + piece.length / 2, wrap.depthFromFace, row.y);
            const placePt = PT(wx, wy, wz);
            const place3D = E(`IFCAXIS2PLACEMENT3D(#${placePt},${wAxisStr},${wRefStr})`);
            const localPl = E(`IFCLOCALPLACEMENT(#${stPl},#${place3D})`);
            const profAx  = E(`IFCAXIS2PLACEMENT2D(#${pt2D},$)`);
            const prof    = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${profAx},${r(piece.length)},${r(wBrickD)})`);
            const solid   = E(`IFCEXTRUDEDAREASOLID(#${prof},#${sAx0},#${extDir},${r(wBrickH)})`);
            const shRep   = E(`IFCSHAPEREPRESENTATION(#${gSub},'Body','SweptSolid',(#${solid}))`);
            const pds     = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shRep}))`);
            const safeName = `${group.name ?? 'Groep'} - Hoekwrap`.replace(/'/g, "\\'");
            const proxy   = E(`IFCBUILDINGELEMENTPROXY(${G()},#${owH},'${safeName}',$,'Steenstrip',#${localPl},#${pds},$,.NOTDEFINED.)`);
            E(`IFCSTYLEDITEM(#${solid},(#${getStyle(wColor)}),$)`);
            allProxyIds.push(proxy);
          }
        }
      }
    }

    if (!isSlimFort && vis.panelen !== false && (group.panels ?? []).length) {
      const { axisStr, refStr } = makeGroupAxes();
      for (const panel of group.panels) {
        const cx = panel.x + panel.width / 2;
        const depth = effectiveLatDepth + panelDikte / 2;
        const [wx, wy, wz] = groupToWorld(cx, depth, panel.y);
        const placePt = PT(wx, wy, wz);
        const place3D = E(`IFCAXIS2PLACEMENT3D(#${placePt},${axisStr},${refStr})`);
        const localPl = E(`IFCLOCALPLACEMENT(#${stPl},#${place3D})`);
        const profAx  = E(`IFCAXIS2PLACEMENT2D(#${pt2D},$)`);
        const prof    = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${profAx},${r(panel.width)},${r(panelDikte)})`);
        const solid   = E(`IFCEXTRUDEDAREASOLID(#${prof},#${sAx0},#${extDir},${r(panel.height)})`);
        const shRep   = E(`IFCSHAPEREPRESENTATION(#${gSub},'Body','SweptSolid',(#${solid}))`);
        const pds     = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shRep}))`);
        const safeName = `${group.name ?? 'Groep'} - Paneel ${Math.round(panel.width)}x${Math.round(panel.height)}`.replace(/'/g, "\\'");
        const proxy   = E(`IFCBUILDINGELEMENTPROXY(${G()},#${owH},'${safeName}',$,'Basisplaat',#${localPl},#${pds},$,.NOTDEFINED.)`);
        E(`IFCSTYLEDITEM(#${solid},(#${getStyle('#94a3b8')}),$)`);
        allProxyIds.push(proxy);
      }
    }

    if (!isSlimFort && vis.latten !== false && (group.lattenData ?? []).length) {
      const { axisStr, refStr } = makeGroupAxes();
      for (const lat of group.lattenData) {
        const safeName = `${group.name ?? 'Groep'} - Lat ${lat.richting}`.replace(/'/g, "\\'");
        if (lat.v18ProfilePts && lat.richting === 'horizontaal') {
          const profPts = lat.v18ProfilePts;
          const nokH = lat.v18NokHeight ?? 18;
          const nokFW = lat.v18NokFootWidth ?? 45;
          const nokPitch = lat.v18NokPitch ?? 200;
          const nokOffset = lat.v18NokOffset ?? 100;
          const [wx, wy, wz] = groupToWorld(lat.x, 0, lat.y);
          const placePt = PT(wx, wy, wz);
          const place3D = E(`IFCAXIS2PLACEMENT3D(#${placePt},${axisStr},${refStr})`);
          const localPl = E(`IFCLOCALPLACEMENT(#${stPl},#${place3D})`);
          const v18AxisDir = E(`IFCDIRECTION((1.,0.,0.))`);
          const v18RefDir  = E(`IFCDIRECTION((0.,1.,0.))`);
          const v18Ax = E(`IFCAXIS2PLACEMENT3D(#${PT(0,0,0)},#${v18AxisDir},#${v18RefDir})`);
          const v18ExtDir = E(`IFCDIRECTION((0.,0.,1.))`);
          const ptIds = profPts.map(([d, h]) => E(`IFCCARTESIANPOINT((${r(d)},${r(h)}))`));
          const poly  = E(`IFCPOLYLINE((${ptIds.map(id => '#' + id).join(',')}))`);
          const prof  = E(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#${poly})`);
          const bodyS = E(`IFCEXTRUDEDAREASOLID(#${prof},#${v18Ax},#${v18ExtDir},${r(lat.width)})`);
          E(`IFCSTYLEDITEM(#${bodyS},(#${getStyle('#b45309')}),$)`);
          const solids = [bodyS];
          const nokAxDir = E(`IFCDIRECTION((1.,0.,0.))`);
          const nokRefDir = E(`IFCDIRECTION((0.,1.,0.))`);
          for (let ni = 0; nokOffset + ni * nokPitch < lat.width; ni++) {
            const nokCx = nokOffset + ni * nokPitch;
            const nokStart = nokCx - nokFW / 2;
            if (nokStart < 0 || nokStart + nokFW > lat.width) continue;
            const nokAx = E(`IFCAXIS2PLACEMENT3D(#${PT(nokStart, 0, 0)},#${nokAxDir},#${nokRefDir})`);
            const nokExt = E(`IFCDIRECTION((0.,0.,1.))`);
            const nokProfAx = E(`IFCAXIS2PLACEMENT2D(#${pt2D},$)`);
            const nokProf = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${nokProfAx},${r(latDikte)},${r(nokH)})`);
            const nokS = E(`IFCEXTRUDEDAREASOLID(#${nokProf},#${nokAx},#${nokExt},${r(nokFW)})`);
            E(`IFCSTYLEDITEM(#${nokS},(#${getStyle('#b45309')}),$)`);
            solids.push(nokS);
          }
          const shRep = E(`IFCSHAPEREPRESENTATION(#${gSub},'Body','SweptSolid',(${solids.map(id => '#' + id).join(',')}))`);
          const pds   = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shRep}))`);
          const proxy = E(`IFCBUILDINGELEMENTPROXY(${G()},#${owH},'${safeName}',$,'AchterconstructieLat',#${localPl},#${pds},$,.NOTDEFINED.)`);
          allProxyIds.push(proxy);
        } else {
          const cx = lat.x + lat.width / 2;
          const cy = lat.y;
          const depth = lat.richting === 'verticaal' ? latDikte + latDikte / 2 : latDikte / 2;
          const [wx, wy, wz] = groupToWorld(cx, depth, cy);
          const placePt = PT(wx, wy, wz);
          const place3D = E(`IFCAXIS2PLACEMENT3D(#${placePt},${axisStr},${refStr})`);
          const localPl = E(`IFCLOCALPLACEMENT(#${stPl},#${place3D})`);
          const profAx  = E(`IFCAXIS2PLACEMENT2D(#${pt2D},$)`);
          const prof    = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${profAx},${r(lat.width)},${r(latDikte)})`);
          const solid   = E(`IFCEXTRUDEDAREASOLID(#${prof},#${sAx0},#${extDir},${r(lat.height)})`);
          const shRep   = E(`IFCSHAPEREPRESENTATION(#${gSub},'Body','SweptSolid',(#${solid}))`);
          const pds     = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shRep}))`);
          const proxy   = E(`IFCBUILDINGELEMENTPROXY(${G()},#${owH},'${safeName}',$,'AchterconstructieLat',#${localPl},#${pds},$,.NOTDEFINED.)`);
          E(`IFCSTYLEDITEM(#${solid},(#${getStyle('#b45309')}),$)`);
          allProxyIds.push(proxy);
        }
      }
    }

    if (isSlimFort && rwo) {
      const sfFaces = group.slimFortFaces ?? (group.slimFortData ? [{ faceId: 'front', faceType: 'front', width: group.facadeData?.groupWidth ?? 0, height: group.facadeData?.groupHeight ?? 0, grid: group.slimFortData, cornerOffset: 0 }] : []);
      const sfProfDepthCenter = sfTotalThick - sfProfileInsertDepth + sfProfileDepth / 2;
      const sfBrDepthCenter = sfTotalThick - sfBracketDepth / 2;

      const mkDir = (v) => `#${E(`IFCDIRECTION((${v.join(',')}))`)}`;
      const ha = rwo.heightAxis;
      const la = rwo.lengthAxis;
      const ta = rwo.thicknessAxis;
      const axisStrFront = ha === 'z' ? mkDir([0,0,1]) : ha === 'y' ? mkDir([0,1,0]) : mkDir([1,0,0]);
      const refStrFront  = la === 'x' ? mkDir([1,0,0]) : la === 'y' ? mkDir([0,1,0]) : mkDir([0,0,1]);
      const refStrSide   = ta === 'x' ? mkDir([1,0,0]) : ta === 'y' ? mkDir([0,1,0]) : mkDir([0,0,1]);

      const groupToWorldFront = (gx, outDepth, gz) => groupToWorld(gx, outDepth, gz);

      const groupToWorldSide = (faceType, cornerOffset, localX, outDepth, localZ, openingX, openingY, openingWidth) => {
        const p = { x: 0, y: 0, z: 0 };
        p[ta] = grpOutPos + grpOutDir * (cornerOffset + localX);
        p[ha] = groupMinH + (openingY ?? 0) + localZ;
        const groupWidth = group.facadeData?.groupWidth ?? 0;
        if (faceType === 'side-left') {
          p[la] = groupMinX - outDepth;
        } else if (faceType === 'side-right') {
          p[la] = groupMinX + groupWidth + outDepth;
        } else if (faceType === 'portal-left') {
          p[la] = groupMinX + (openingX ?? 0) - outDepth;
        } else if (faceType === 'portal-right') {
          p[la] = groupMinX + (openingX ?? 0) + (openingWidth ?? 0) + outDepth;
        }
        return [p.x, p.y, p.z];
      };

      for (const face of sfFaces) {
        const { faceType, grid, cornerOffset = 0 } = face;
        if (!grid) continue;
        const isFront = faceType === 'front';
        const axisStr = axisStrFront;
        const refStr = isFront ? refStrFront : refStrSide;
        const openingX = face.openingX ?? 0;
        const openingY = face.openingY ?? 0;
        const openingWidth = face.openingWidth ?? 0;

        const faceAxes = face.axes;
        const faceOutsidePos = face.outsidePos;
        const faceOutsideDir = face.outsideDir;
        const faceLengthStart = face.lengthStart;
        const faceHeightStart = face.heightStart;
        const faceLengthEnd = face.lengthEnd;

        const groupToWorldAuto = (faceTyp, localX, outDepth, localZ) => {
          const p = { x: 0, y: 0, z: 0 };
          const fta = faceAxes.thickness;
          const fla = faceAxes.length;
          const fha = faceAxes.height;
          p[fta] = faceOutsidePos + faceOutsideDir * outDepth;
          p[fha] = faceHeightStart + (face.openingY ?? 0) + localZ;
          if (faceTyp === 'front') {
            p[fla] = faceLengthStart + localX;
          } else if (faceTyp === 'side-left') {
            p[fla] = faceLengthStart - outDepth;
            p[fta] = faceOutsidePos + faceOutsideDir * (cornerOffset + localX);
          } else if (faceTyp === 'side-right') {
            p[fla] = faceLengthEnd + outDepth;
            p[fta] = faceOutsidePos + faceOutsideDir * (cornerOffset + localX);
          } else if (faceTyp === 'portal-left') {
            p[fla] = faceLengthStart + (face.openingX ?? 0) - outDepth;
            p[fta] = faceOutsidePos + faceOutsideDir * (cornerOffset + localX);
          } else if (faceTyp === 'portal-right') {
            p[fla] = faceLengthStart + (face.openingX ?? 0) + (face.openingWidth ?? 0) + outDepth;
            p[fta] = faceOutsidePos + faceOutsideDir * (cornerOffset + localX);
          }
          return [p.x, p.y, p.z];
        };

        const toWorld = faceAxes
          ? (lx, depth, lz) => groupToWorldAuto(faceType, lx, depth, lz)
          : isFront
            ? (lx, depth, lz) => groupToWorldFront(lx, depth, lz)
            : (lx, depth, lz) => groupToWorldSide(faceType, cornerOffset, lx, depth, lz, openingX, openingY, openingWidth);

        for (const eps of (grid.epsElements ?? [])) {
          const centerX = eps.x + eps.width / 2;
          const [wx, wy, wz] = toWorld(centerX, sfTotalThick / 2, eps.y);
          const placePt = PT(wx, wy, wz);
          const place3D = E(`IFCAXIS2PLACEMENT3D(#${placePt},${axisStr},${refStr})`);
          const localPl = E(`IFCLOCALPLACEMENT(#${stPl},#${place3D})`);
          const profAx  = E(`IFCAXIS2PLACEMENT2D(#${pt2D},$)`);
          const prof    = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${profAx},${r(eps.width)},${r(sfTotalThick)})`);
          const solid   = E(`IFCEXTRUDEDAREASOLID(#${prof},#${sAx0},#${extDir},${r(eps.height)})`);
          const shRep   = E(`IFCSHAPEREPRESENTATION(#${gSub},'Body','SweptSolid',(#${solid}))`);
          const pds     = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shRep}))`);
          const safeName = `${group.name ?? 'Groep'} - EPS-element [${faceType}]`.replace(/'/g, "\\'");
          const proxy   = E(`IFCBUILDINGELEMENTPROXY(${G()},#${owH},'${safeName}',$,'EPS-element',#${localPl},#${pds},$,.NOTDEFINED.)`);
          E(`IFCSTYLEDITEM(#${solid},(#${getStyle('#e2e8f0')}),$)`);
          allProxyIds.push(proxy);
        }

        for (const br of (grid.brackets ?? [])) {
          const [wx, wy, wz] = toWorld(br.cx, sfBrDepthCenter, br.cy - sfBracketHeight / 2);
          const placePt = PT(wx, wy, wz);
          const place3D = E(`IFCAXIS2PLACEMENT3D(#${placePt},${axisStr},${refStr})`);
          const localPl = E(`IFCLOCALPLACEMENT(#${stPl},#${place3D})`);
          const profAx  = E(`IFCAXIS2PLACEMENT2D(#${pt2D},$)`);
          const prof    = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${profAx},${r(sfBracketWidth)},${r(sfBracketDepth)})`);
          const solid   = E(`IFCEXTRUDEDAREASOLID(#${prof},#${sAx0},#${extDir},${r(sfBracketHeight)})`);
          const shRep   = E(`IFCSHAPEREPRESENTATION(#${gSub},'Body','SweptSolid',(#${solid}))`);
          const pds     = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shRep}))`);
          const safeName = `${group.name ?? 'Groep'} - Montagebeugel [${faceType}]`.replace(/'/g, "\\'");
          const proxy   = E(`IFCBUILDINGELEMENTPROXY(${G()},#${owH},'${safeName}',$,'Montagebeugel',#${localPl},#${pds},$,.NOTDEFINED.)`);
          E(`IFCSTYLEDITEM(#${solid},(#${getStyle('#475569')}),$)`);
          allProxyIds.push(proxy);
        }

        for (const p of (grid.profiles ?? [])) {
          const profW = p.richting === 'verticaal' ? sfProfileWidth : p.width;
          const extrudeH = p.richting === 'verticaal' ? p.height : sfProfileHeight;
          const centerX = p.richting === 'verticaal' ? (p.x + sfProfileWidth / 2) : (p.x + p.width / 2);
          const [wx, wy, wz] = toWorld(centerX, sfProfDepthCenter, p.y);
          const placePt = PT(wx, wy, wz);
          const place3D = E(`IFCAXIS2PLACEMENT3D(#${placePt},${axisStr},${refStr})`);
          const localPl = E(`IFCLOCALPLACEMENT(#${stPl},#${place3D})`);
          const profAx  = E(`IFCAXIS2PLACEMENT2D(#${pt2D},$)`);
          const prof    = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${profAx},${r(profW)},${r(sfProfileDepth)})`);
          const solid   = E(`IFCEXTRUDEDAREASOLID(#${prof},#${sAx0},#${extDir},${r(extrudeH)})`);
          const shRep   = E(`IFCSHAPEREPRESENTATION(#${gSub},'Body','SweptSolid',(#${solid}))`);
          const pds     = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shRep}))`);
          const safeName = `${group.name ?? 'Groep'} - Aluminium koker ${p.richting} [${faceType}]`.replace(/'/g, "\\'");
          const proxy   = E(`IFCBUILDINGELEMENTPROXY(${G()},#${owH},'${safeName}',$,'Aluminium koker',#${localPl},#${pds},$,.NOTDEFINED.)`);
          E(`IFCSTYLEDITEM(#${solid},(#${getStyle('#94a3b8')}),$)`);
          allProxyIds.push(proxy);
        }
      }
    }

    const maxHoogte = group.maxHoogte ?? null;

    if (vis.zetwerk !== false && group.zetwerk?.enabled && group.facadeData) {
      const zw = group.zetwerk;
      const zwB = Math.max(1, zw.breedte ?? 50);
      const zwH = Math.max(0, zw.offsetH ?? 0);
      const zwV = Math.max(0, zw.offsetV ?? 0);
      const { axisStr, refStr } = makeGroupAxes();
      const depth = effectiveLatDepth + panelDikte + brickD / 2;
      for (const op of (group.facadeData.groupOpenings ?? [])) {
        const opPoly = getOpeningPoly(op);
        const opLs = opPoly.map(p => p.l), opHs = opPoly.map(p => p.h);
        const opMinL = Math.min(...opLs), opMaxL = Math.max(...opLs);
        const opMinH = Math.min(...opHs), opMaxH = Math.max(...opHs);
        if (maxHoogte != null && maxHoogte > 0 && opMinH >= maxHoogte) continue;
        const ox1 = opMinL - zwH - zwB, ox2 = opMaxL + zwH + zwB;
        const oy1 = opMinH - zwV - zwB, oy2 = opMaxH + zwV + zwB;
        const totalW = ox2 - ox1;
        const innerH = (opMaxH + zwV) - (opMinH - zwV);
        const bars = [
          { lx: ox1 + totalW / 2, lz: oy2 - zwB / 2, lw: totalW, lh: zwB },
          { lx: ox1 + totalW / 2, lz: oy1 + zwB / 2, lw: totalW, lh: zwB },
          { lx: ox1 + zwB / 2,    lz: op.y - zwV + innerH / 2, lw: zwB, lh: innerH },
          { lx: ox2 - zwB / 2,    lz: op.y - zwV + innerH / 2, lw: zwB, lh: innerH },
        ];
        for (const bar of bars) {
          const barBottom = bar.lz - bar.lh / 2;
          if (maxHoogte != null && maxHoogte > 0 && barBottom >= maxHoogte) continue;
          const [wx, wy, wz] = groupToWorld(bar.lx, depth, barBottom);
          const placePt = PT(wx, wy, wz);
          const place3D = E(`IFCAXIS2PLACEMENT3D(#${placePt},${axisStr},${refStr})`);
          const localPl = E(`IFCLOCALPLACEMENT(#${stPl},#${place3D})`);
          const profAx  = E(`IFCAXIS2PLACEMENT2D(#${pt2D},$)`);
          const prof    = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${profAx},${r(bar.lw)},${r(brickD)})`);
          const solid   = E(`IFCEXTRUDEDAREASOLID(#${prof},#${sAx0},#${extDir},${r(bar.lh)})`);
          const shRep   = E(`IFCSHAPEREPRESENTATION(#${gSub},'Body','SweptSolid',(#${solid}))`);
          const pds     = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shRep}))`);
          const safeName = `${group.name ?? 'Groep'} - Zetwerk`.replace(/'/g, "\\'");
          const proxy   = E(`IFCBUILDINGELEMENTPROXY(${G()},#${owH},'${safeName}',$,'Zetwerk',#${localPl},#${pds},$,.NOTDEFINED.)`);
          E(`IFCSTYLEDITEM(#${solid},(#${getStyle('#475569')}),$)`);
          allProxyIds.push(proxy);
        }
      }
    }

    const penanten = (wallSettings[group.id] ?? {}).penanten ?? [];
    const penantFaceRows = group.penantFaceRows ?? [];
    if (penanten.length && rwo) {
      const { axisStr, refStr } = makeGroupAxes();
      for (let pi = 0; pi < penanten.length; pi++) {
        const pen = penanten[pi];
        const pX  = pen.x   ?? 0;
        const pB  = Math.max(1, pen.breedte ?? 400);
        const pDL = Math.max(1, pen.diepteLinks  ?? pen.diepte ?? 150);
        const pDR = Math.max(1, pen.diepteRechts ?? pen.diepte ?? 150);
        const pH  = Math.max(1, (maxHoogte != null && maxHoogte > 0) ? Math.min(pen.hoogte ?? 2000, maxHoogte) : (pen.hoogte ?? 2000));
        const penStoot = pen.stoot ?? material.stoot ?? 10;
        const penFrontW = Math.max(1, pB - 2 * brickD);
        const penSideDL = Math.max(1, pDL + brickD + penStoot + panelDikte);
        const penSideDR = Math.max(1, pDR + brickD + penStoot + panelDikte);
        const penPanelT = panelDikte;
        const penShift = panelDikte + brickD + penStoot + Math.max(pDL, pDR);

        const emitPenantBox = (gxCenter, depthCenter, boxW, boxThick, label) => {
          const [bwx, bwy, bwz] = groupToWorld(gxCenter, depthCenter, 0);
          const bPt   = PT(bwx, bwy, bwz);
          const bPl3D = E(`IFCAXIS2PLACEMENT3D(#${bPt},${axisStr},${refStr})`);
          const bLPl  = E(`IFCLOCALPLACEMENT(#${stPl},#${bPl3D})`);
          const bPAx  = E(`IFCAXIS2PLACEMENT2D(#${pt2D},$)`);
          const bProf = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${bPAx},${r(boxW)},${r(boxThick)})`);
          const bSol  = E(`IFCEXTRUDEDAREASOLID(#${bProf},#${sAx0},#${extDir},${r(pH)})`);
          const bSRep = E(`IFCSHAPEREPRESENTATION(#${gSub},'Body','SweptSolid',(#${bSol}))`);
          const bPds  = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${bSRep}))`);
          const bName = `${group.name ?? 'Groep'} - ${label}`.replace(/'/g, "\\'");
          const bPrx  = E(`IFCBUILDINGELEMENTPROXY(${G()},#${owH},'${bName}',$,'Penant',#${bLPl},#${bPds},$,.NOTDEFINED.)`);
          E(`IFCSTYLEDITEM(#${bSol},(#${getStyle('#94a3b8')}),$)`);
          allProxyIds.push(bPrx);
        };

        const _penBase = isSlimFort ? sfDepths.facadeBaseDepth : latDikte;
        emitPenantBox(pX + pB / 2, _penBase + penShift - penPanelT / 2, penFrontW, penPanelT, 'Penant voorzijde');
        emitPenantBox(pX + brickD + penPanelT / 2, _penBase + penShift - penPanelT - penSideDL / 2, penPanelT, penSideDL, 'Penant linkerbeen');
        emitPenantBox(pX + pB - brickD - penPanelT / 2, _penBase + penShift - penPanelT - penSideDR / 2, penPanelT, penSideDR, 'Penant rechterbeen');

        const penFaceData = penantFaceRows[pi] ?? {};
        const fRows = penFaceData.frontRows ?? penFaceData ?? [];

        for (const row of (Array.isArray(fRows) ? fRows : [])) {
          for (const piece of row.pieces) {
            const gx = pX + piece.start + piece.length / 2;
            const [bwx, bwy, bwz] = groupToWorld(gx, _penBase + penShift + brickD / 2, row.y);
            const bPlacePt = PT(bwx, bwy, bwz);
            const bPlace3D = E(`IFCAXIS2PLACEMENT3D(#${bPlacePt},${axisStr},${refStr})`);
            const bLocalPl = E(`IFCLOCALPLACEMENT(#${stPl},#${bPlace3D})`);
            const bProfAx  = E(`IFCAXIS2PLACEMENT2D(#${pt2D},$)`);
            const bProf    = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${bProfAx},${r(piece.length)},${r(brickD)})`);
            const bSolid   = E(`IFCEXTRUDEDAREASOLID(#${bProf},#${sAx0},#${extDir},${r(groupBrickExtH)})`);
            const bShRep   = E(`IFCSHAPEREPRESENTATION(#${gSub},'Body','SweptSolid',(#${bSolid}))`);
            const bPds     = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${bShRep}))`);
            const bName    = `${group.name ?? 'Groep'} - Penant Strip`.replace(/'/g, "\\'");
            const bProxy   = E(`IFCBUILDINGELEMENTPROXY(${G()},#${owH},'${bName}',$,'Steenstrip',#${bLocalPl},#${bPds},$,.NOTDEFINED.)`);
            E(`IFCSTYLEDITEM(#${bSolid},(#${getStyle(brickColor)}),$)`);
            allProxyIds.push(bProxy);
          }
        }

        const cornerBattenDepthBack  = _penBase + latDikte / 2;
        const cornerBattenDepthFront = _penBase + penShift - penPanelT - latDikte / 2;
        if (!isSlimFort) for (const [gxCenter, depthCenter, cLabel] of [
          [pX + brickD + penPanelT + latDikte / 2,       cornerBattenDepthBack,  'Penant Hoeklatje L-back'],
          [pX + pB - brickD - penPanelT - latDikte / 2,  cornerBattenDepthBack,  'Penant Hoeklatje R-back'],
          [pX + brickD + penPanelT + latDikte / 2,       cornerBattenDepthFront, 'Penant Hoeklatje L-front'],
          [pX + pB - brickD - penPanelT - latDikte / 2,  cornerBattenDepthFront, 'Penant Hoeklatje R-front'],
        ]) {
          const [cbwx, cbwy, cbwz] = groupToWorld(gxCenter, depthCenter, 0);
          const cbPt   = PT(cbwx, cbwy, cbwz);
          const cbPl3D = E(`IFCAXIS2PLACEMENT3D(#${cbPt},${axisStr},${refStr})`);
          const cbLPl  = E(`IFCLOCALPLACEMENT(#${stPl},#${cbPl3D})`);
          const cbPAx  = E(`IFCAXIS2PLACEMENT2D(#${pt2D},$)`);
          const cbProf = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${cbPAx},${r(latDikte)},${r(latDikte)})`);
          const cbSol  = E(`IFCEXTRUDEDAREASOLID(#${cbProf},#${sAx0},#${extDir},${r(pH)})`);
          const cbSRep = E(`IFCSHAPEREPRESENTATION(#${gSub},'Body','SweptSolid',(#${cbSol}))`);
          const cbPds  = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${cbSRep}))`);
          const cbName = `${group.name ?? 'Groep'} - ${cLabel}`.replace(/'/g, "\\'");
          const cbPrx  = E(`IFCBUILDINGELEMENTPROXY(${G()},#${owH},'${cbName}',$,'AchterconstructieLat',#${cbLPl},#${cbPds},$,.NOTDEFINED.)`);
          E(`IFCSTYLEDITEM(#${cbSol},(#${getStyle('#b45309')}),$)`);
          allProxyIds.push(cbPrx);
        }

        const thickDir = { x: 0, y: 0, z: 0 };
        thickDir[rwo.thicknessAxis] = grpOutDir;
        const leftRefId  = E(`IFCDIRECTION((${r(thickDir.x)},${r(thickDir.y)},${r(thickDir.z)}))`);
        const rightRefId = E(`IFCDIRECTION((${r(-thickDir.x)},${r(-thickDir.y)},${r(-thickDir.z)}))`);
        const _haVec = rwo.heightAxis === 'z' ? [0,0,1] : rwo.heightAxis === 'y' ? [0,1,0] : [1,0,0];
        const sideAxisId = E(`IFCDIRECTION((${_haVec.join(',')}))`);
        const pDmax = Math.max(pDL, pDR);
        const sideClipOffPen = Math.max(penStoot, panelDikte);
        const sideDepthOffsetLeft  = _penBase + panelDikte + brickD + sideClipOffPen + 6 + (pDmax - pDL);
        const sideDepthOffsetRight = _penBase + panelDikte + brickD + sideClipOffPen + 6 + (pDmax - pDR);

        for (const row of (penFaceData.leftRows ?? [])) {
          for (const piece of row.pieces) {
            const lp = { x: 0, y: 0, z: 0 };
            lp[rwo.lengthAxis]    = groupMinX + pX + brickD / 2;
            lp[rwo.thicknessAxis] = grpOutPos + grpOutDir * (sideDepthOffsetLeft + piece.start + piece.length / 2);
            lp[rwo.heightAxis]    = groupMinH + row.y;
            const [lpx, lpy, lpz] = [lp.x, lp.y, lp.z];
            const lPlacePt = PT(lpx, lpy, lpz);
            const lPlace3D = E(`IFCAXIS2PLACEMENT3D(#${lPlacePt},#${sideAxisId},#${leftRefId})`);
            const lLocalPl = E(`IFCLOCALPLACEMENT(#${stPl},#${lPlace3D})`);
            const lProfAx  = E(`IFCAXIS2PLACEMENT2D(#${pt2D},$)`);
            const lProf    = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${lProfAx},${r(piece.length)},${r(brickD)})`);
            const lSolid   = E(`IFCEXTRUDEDAREASOLID(#${lProf},#${sAx0},#${extDir},${r(groupBrickExtH)})`);
            const lShRep   = E(`IFCSHAPEREPRESENTATION(#${gSub},'Body','SweptSolid',(#${lSolid}))`);
            const lPds     = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${lShRep}))`);
            const lName    = `${group.name ?? 'Groep'} - Strip`.replace(/'/g, "\\'");
            const lProxy   = E(`IFCBUILDINGELEMENTPROXY(${G()},#${owH},'${lName}',$,'Steenstrip',#${lLocalPl},#${lPds},$,.NOTDEFINED.)`);
            E(`IFCSTYLEDITEM(#${lSolid},(#${getStyle(brickColor)}),$)`);
            allProxyIds.push(lProxy);
          }
        }

        for (const row of (penFaceData.rightRows ?? [])) {
          for (const piece of row.pieces) {
            const rp = { x: 0, y: 0, z: 0 };
            rp[rwo.lengthAxis]    = groupMinX + pX + pB - brickD / 2;
            rp[rwo.thicknessAxis] = grpOutPos + grpOutDir * (sideDepthOffsetRight + piece.start + piece.length / 2);
            rp[rwo.heightAxis]    = groupMinH + row.y;
            const [rpx, rpy, rpz] = [rp.x, rp.y, rp.z];
            const rPlacePt = PT(rpx, rpy, rpz);
            const rPlace3D = E(`IFCAXIS2PLACEMENT3D(#${rPlacePt},#${sideAxisId},#${rightRefId})`);
            const rLocalPl = E(`IFCLOCALPLACEMENT(#${stPl},#${rPlace3D})`);
            const rProfAx  = E(`IFCAXIS2PLACEMENT2D(#${pt2D},$)`);
            const rProf    = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${rProfAx},${r(piece.length)},${r(brickD)})`);
            const rSolid   = E(`IFCEXTRUDEDAREASOLID(#${rProf},#${sAx0},#${extDir},${r(groupBrickExtH)})`);
            const rShRep   = E(`IFCSHAPEREPRESENTATION(#${gSub},'Body','SweptSolid',(#${rSolid}))`);
            const rPds     = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${rShRep}))`);
            const rName    = `${group.name ?? 'Groep'} - Strip`.replace(/'/g, "\\'");
            const rProxy   = E(`IFCBUILDINGELEMENTPROXY(${G()},#${owH},'${rName}',$,'Steenstrip',#${rLocalPl},#${rPds},$,.NOTDEFINED.)`);
            E(`IFCSTYLEDITEM(#${rSolid},(#${getStyle(brickColor)}),$)`);
            allProxyIds.push(rProxy);
          }
        }

      }
    }
  }

  if (allProxyIds.length) {
    E(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${G()},#${owH},$,$,(${allProxyIds.map(i=>`#${i}`).join(',')}),#${storey})`);
  }

  const ts = new Date().toISOString();
  const header = [
    'ISO-10303-21;', 'HEADER;',
    `FILE_DESCRIPTION(('Multi-element brickslip export'),'2;1');`,
    `FILE_NAME('${fileName ?? 'export'}.ifc','${ts}',(''),('MultiElementPlanner'),'','','');`,
    `FILE_SCHEMA(('IFC2X3'));`, 'ENDSEC;', 'DATA;',
  ].join('\n');

  const content = header + '\n' + dataLines.join('\n') + '\nENDSEC;\nEND-ISO-10303-21;';
  const downloadName = `${fileName ?? 'export'}_gevelbekleding.ifc`;

  if (dirHandle) {
    (async () => {
      try {
        const perm = await dirHandle.requestPermission({ mode: 'readwrite' });
        if (perm !== 'granted') throw new Error('Geen schrijftoegang tot de map.');
        const fileHandle = await dirHandle.getFileHandle(downloadName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        console.log(`[export] Opgeslagen in map: ${dirHandle.name}/${downloadName}`);
      } catch (err) {
        console.error('[export] Opslaan naar map mislukt, terugvallen op download:', err);
        const blob = new Blob([content], { type: 'application/x-step' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadName;
        a.click();
        URL.revokeObjectURL(url);
      }
    })();
  } else {
    const blob = new Blob([content], { type: 'application/x-step' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// Scans an IFC file for all common building element types (walls, slabs, proxies, coverings, etc.)
// Returns [{ifcEntityType, name, count}] sorted by count descending
export async function scanIfcElementTypes(file) {
  const text = await file.text();
  const flat = text.replace(/\r?\n/g, ' ');

  const typeIdToName = {};
  const elemIds = new Set();
  const elemEntityType = {};
  const elemObjectType = {};
  const relRecords = [];

  // Match element instances, their TYPE records, and RELDEFINESBYTYPE
  const RECORD_RE = /#(\d+)\s*=\s*IFC((?:WALL(?:STANDARDCASE)?|SLAB|BUILDINGELEMENTPROXY|COVERING|CURTAINWALL|PLATE|MEMBER|ELEMENTASSEMBLY)TYPE|WALL(?:STANDARDCASE)?|SLAB|BUILDINGELEMENTPROXY|COVERING|CURTAINWALL|PLATE|MEMBER|ELEMENTASSEMBLY|RELDEFINESBYTYPE)\s*\(/gi;

  let m;
  while ((m = RECORD_RE.exec(flat)) !== null) {
    const id = m[1];
    const ifcName = m[2].toUpperCase();
    const start = RECORD_RE.lastIndex - 1;
    let end = start + 1, depth = 1, inStr = false;
    while (end < flat.length && depth > 0) {
      const c = flat[end];
      if (c === "'" && !inStr) inStr = true;
      else if (c === "'" && inStr) inStr = false;
      else if (!inStr) { if (c === '(') depth++; else if (c === ')') depth--; }
      end++;
    }
    const inner = flat.slice(start + 1, end - 1);
    RECORD_RE.lastIndex = end;

    if (ifcName === 'RELDEFINESBYTYPE') {
      relRecords.push(inner);
    } else if (ifcName.endsWith('TYPE')) {
      const parts = splitStepArgs(inner);
      const name = unquoteStep(parts[2]) ?? unquoteStep(parts[8]);
      if (name) typeIdToName[id] = name;
    } else {
      elemIds.add(id);
      elemEntityType[id] = 'IFC' + ifcName;
      const parts = splitStepArgs(inner);
      const objType = unquoteStep(parts[4]);
      if (objType) {
        elemObjectType[id] = objType;
      } else if (ifcName === 'ELEMENTASSEMBLY') {
        const nameVal = unquoteStep(parts[2]);
        if (nameVal) elemObjectType[id] = nameVal;
      }
    }
  }

  const elemToType = {};
  for (const inner of relRecords) {
    const parts = splitStepArgs(inner);
    const relatedRaw = parts[4] ?? '';
    const typeRaw = (parts[5] ?? '').trim().replace(/^#/, '');
    const tName = typeIdToName[typeRaw];
    if (!tName) continue;
    const idMatches = relatedRaw.match(/#(\d+)/g);
    if (!idMatches) continue;
    for (const ref of idMatches) {
      const eid = ref.slice(1);
      if (elemIds.has(eid)) elemToType[eid] = tName;
    }
  }

  const counts = {};
  for (const eid of elemIds) {
    const entityType = elemEntityType[eid];
    const typeName = elemToType[eid] ?? elemObjectType[eid] ?? '(geen type)';
    const key = `${entityType}::${typeName}`;
    if (!counts[key]) counts[key] = { ifcEntityType: entityType, name: typeName, count: 0 };
    counts[key].count++;
  }

  return Object.values(counts).sort((a, b) => b.count - a.count);
}

// Parses zone elements from an IFC file — any building element type, not just walls.
// allowedTypes: Map<ifcEntityType (e.g. 'IFCWALL'), Set<typeName> | null> or null for all
// Returns elements in the same structure as parseIfc walls, with isZoneElement: true
export async function parseIfcZoneElements(file, allowedTypes = null, onProgress = null, { forceOrientation = 'AUTO' } = {}) {
  const { IFC, api } = await getApi();

  let modelID, ownModel = false;
  const wallTypeMap = {};

  if (_cachedModel && _cachedModel.name === file.name && _cachedModel.size === file.size) {
    modelID = _cachedModel.modelID;
    Object.assign(wallTypeMap, _cachedModel.wallTypeMap ?? {});
  } else {
    if (_cachedModel) {
      try { api.CloseModel(_cachedModel.modelID); } catch {}
      _cachedModel = null;
    }
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    modelID = api.OpenModel(data, {});
    ownModel = true;
    try {
      const relDefVec = api.GetLineIDsWithType(modelID, IFC.IFCRELDEFINESBYTYPE);
      for (let i = 0; i < relDefVec.size(); i++) {
        try {
          const rel = api.GetLine(modelID, relDefVec.get(i), false);
          const typeRef = rel?.RelatingType?.value;
          if (!typeRef) continue;
          const typeLine = api.GetLine(modelID, typeRef, false);
          const tName = typeLine?.Name?.value ?? null;
          const related = rel?.RelatedObjects;
          if (!related || !tName) continue;
          for (let j = 0; j < related.length; j++) {
            const wid = related[j]?.value;
            if (wid) wallTypeMap[wid] = tName;
          }
        } catch { }
      }
    } catch { }
  }

  try {
    const SUPPORTED_ENTITY_NAMES = [
      'IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCSLAB',
      'IFCBUILDINGELEMENTPROXY', 'IFCCOVERING', 'IFCCURTAINWALL',
      'IFCPLATE', 'IFCMEMBER', 'IFCELEMENTASSEMBLY',
    ];

    const entityNamesToLoad = allowedTypes ? [...allowedTypes.keys()] : SUPPORTED_ENTITY_NAMES;

    const allElemIDs = [];
    const elemEntityTypeMap = {};

    for (const entityName of entityNamesToLoad) {
      const code = IFC[entityName.toUpperCase()];
      if (code === undefined) continue;
      try {
        const idsVec = api.GetLineIDsWithType(modelID, code);
        for (let i = 0; i < idsVec.size(); i++) {
          const eID = idsVec.get(i);
          const typeName = wallTypeMap[eID] ?? '(geen type)';
          if (allowedTypes) {
            const allowed = allowedTypes.get(entityName.toUpperCase()) ?? allowedTypes.get(entityName);
            if (allowed && !allowed.has(typeName)) continue;
          }
          allElemIDs.push(eID);
          elemEntityTypeMap[eID] = entityName.toUpperCase();
        }
      } catch { }
    }

    const _upAxisResult = detectModelUpAxis(api, modelID, [IFC.IFCWALLSTANDARDCASE, IFC.IFCWALL], { forceOrientation });
    const _upAxis = _upAxisResult.axis;
    onProgress?.({ phase: 'upaxis', ..._upAxisResult });

    onProgress?.({ phase: 'init', log: `${allElemIDs.length} zone-elementen gevonden` });
    onProgress?.({ phase: 'wanden', current: 0, total: allElemIDs.length });

    const matLayerByWallZone = {};
    try {
      const relMatVec = api.GetLineIDsWithType(modelID, IFC.IFCRELASSOCIATESMATERIAL);
      for (let i = 0; i < relMatVec.size(); i++) {
        try {
          const rel = api.GetLine(modelID, relMatVec.get(i), false);
          const matRef = rel?.RelatingMaterial?.value;
          if (!matRef) continue;
          const rawMat = api.GetRawLineData(modelID, matRef);
          const typeName = api.GetNameFromTypeCode(rawMat.type).toUpperCase();
          if (!typeName.includes('MATERIALLAYERSETUSAGE')) continue;
          const matUsage = api.GetLine(modelID, matRef, false);
          const directSense = matUsage?.DirectionSense?.value ?? null;
          const layerSetDir = matUsage?.LayerSetDirection?.value ?? null;
          const offsetRaw = matUsage?.OffsetFromReferenceLine;
          const offset_mm = typeof offsetRaw === 'number' ? Math.round(offsetRaw * 1000) : (typeof offsetRaw?.value === 'number' ? Math.round(offsetRaw.value * 1000) : 0);
          const relObj = rel?.RelatedObjects;
          if (!relObj) continue;
          for (const r of relObj) {
            const wid = r?.value;
            if (wid != null) matLayerByWallZone[wid] = { directSense, layerSetDir, offset_mm };
          }
        } catch { }
      }
    } catch { }

    const spaceBoundaryTypeByElem = {};
    try {
      const sbVecZ = api.GetLineIDsWithType(modelID, IFC.IFCRELSPACEBOUNDARY);
      for (let i = 0; i < sbVecZ.size(); i++) {
        try {
          const rel = api.GetLine(modelID, sbVecZ.get(i), false);
          const elemID = rel?.RelatedBuildingElement?.value;
          if (!elemID) continue;
          const sense = rel?.InternalOrExternalBoundary?.value ?? null;
          if (!sense) continue;
          const isExt = sense !== 'INTERNAL' && sense !== 'NOTDEFINED' && sense !== 'UNDEFINED';
          if (!spaceBoundaryTypeByElem[elemID] || isExt) {
            spaceBoundaryTypeByElem[elemID] = isExt ? 'EXTERNAL' : 'INTERNAL';
          }
        } catch { }
      }
    } catch { }

    const elements = [];
    let processed = 0;
    let lastYield = Date.now();

    for (const eID of allElemIDs) {
      try {
        const bb = getBBox(api, modelID, eID);
        if (!bb) continue;

        const dx = bb.maxX - bb.minX;
        const dy = bb.maxY - bb.minY;
        const dz = bb.maxZ - bb.minZ;
        const { heightAxis, lengthAxis, thicknessAxis, length, height } = deriveWallAxes(dx, dy, dz, _upAxis);

        if (length < 100 || height < 100) continue;

        const line = api.GetLine(modelID, eID, false);
        const name = line?.Name?.value ?? `Element #${eID}`;
        const globalIdEl = line?.GlobalId?.value ?? null;

        let wallInsideThickDirEl = 0;
        if (bb.localYDir) {
          const comp = bb.localYDir[thicknessAxis] ?? 0;
          if (Math.abs(comp) > 0.5) wallInsideThickDirEl = comp > 0 ? 1 : -1;
        }

        let wallLengthDirEl = null;
        if (bb.localXDir) {
          const { x, y, z } = bb.localXDir;
          const len = Math.sqrt(x * x + y * y + z * z);
          if (len > 0.01) wallLengthDirEl = { x: x / len, y: y / len, z: z / len };
        }

        const matDataEl = matLayerByWallZone[eID];

        const wallOrigin = {
          globalId: globalIdEl,
          lengthStart:    Math.round(bb[`min${lengthAxis.toUpperCase()}`] * 1000),
          lengthEnd:      Math.round(bb[`max${lengthAxis.toUpperCase()}`] * 1000),
          heightStart:    Math.round(bb[`min${heightAxis.toUpperCase()}`] * 1000),
          heightEnd:      Math.round(bb[`max${heightAxis.toUpperCase()}`] * 1000),
          thicknessStart: Math.round(bb[`min${thicknessAxis.toUpperCase()}`] * 1000),
          thicknessEnd:   Math.round(bb[`max${thicknessAxis.toUpperCase()}`] * 1000),
          lengthAxis,
          heightAxis,
          thicknessAxis,
          wallInsideThickDir: wallInsideThickDirEl,
          wallLengthDir: wallLengthDirEl,
          matLayerSense: matDataEl?.directSense ?? null,
          matLayerSetDir: matDataEl?.layerSetDir ?? null,
          matOffsetMm: matDataEl?.offset_mm ?? 0,
          spaceBoundaryType: spaceBoundaryTypeByElem[eID] ?? null,
        };

        const facadePoly = getFacadePolygon(api, modelID, eID, lengthAxis, heightAxis, bb);
        elements.push({
          expressID: eID,
          name,
          length,
          height,
          openings: [],
          wallOrigin,
          facadePoly: facadePoly ?? null,
          typeName: wallTypeMap[eID] ?? null,
          isZoneElement: true,
          ifcEntityType: elemEntityTypeMap[eID],
        });
      } catch { }

      processed++;
      onProgress?.({ phase: 'wanden', current: processed, total: allElemIDs.length });
      const now = Date.now();
      if (now - lastYield > 50) {
        lastYield = now;
        await new Promise(r => setTimeout(r, 0));
      }
    }

    resolveOutsideDirections(elements);
    return elements;
  } finally {
    if (ownModel) {
      api.CloseModel(modelID);
    } else {
      try { api.CloseModel(modelID); } catch {}
      _cachedModel = null;
    }
  }
}

export function generateOutsideResolutionReport(walls) {
  return walls.map((wall) => {
    const wo = wall.wallOrigin;
    const ro = wo?.resolvedOutside;
    return {
      expressID: wall.expressID,
      globalId: wo?.globalId ?? null,
      name: wall.name ?? null,
      sourceUsed: ro?.source ?? 'unresolved',
      confidence: ro?.confidence ?? 0,
      outsideDir: ro?.outsideDir ?? null,
      insideDir: ro?.outsideDir != null ? -ro.outsideDir : null,
      ambiguous: ro?.ambiguous ?? true,
      reason: ro?.reason ?? 'resolvedOutside niet gevuld — her-importeer het IFC-bestand',
      isExterior: wo?.isExterior ?? null,
      exteriorConfidence: wo?.exteriorConfidence ?? null,
      exteriorReason: wo?.exteriorReason ?? null,
      spaceBoundaryType: wo?.spaceBoundaryType ?? null,
      matLayerSense: wo?.matLayerSense ?? null,
      matLayerSetDir: wo?.matLayerSetDir ?? null,
      thicknessAxis: wo?.thicknessAxis ?? null,
      thicknessStart: wo?.thicknessStart ?? null,
      thicknessEnd: wo?.thicknessEnd ?? null,
    };
  });
}

export async function validateWallAlignment(file, parsedWalls, onProgress = null) {
  const { IFC, api } = await getApi();

  let modelID, ownModel = false;
  if (_cachedModel && _cachedModel.name === file.name && _cachedModel.size === file.size) {
    modelID = _cachedModel.modelID;
  } else {
    if (_cachedModel) { try { api.CloseModel(_cachedModel.modelID); } catch {} _cachedModel = null; }
    const buffer = await file.arrayBuffer();
    modelID = api.OpenModel(new Uint8Array(buffer), {});
    ownModel = true;
  }

  try {
    const matUsageByWall = {};
    try {
      const relMatVec = api.GetLineIDsWithType(modelID, IFC.IFCRELASSOCIATESMATERIAL);
      for (let i = 0; i < relMatVec.size(); i++) {
        try {
          const rel = api.GetLine(modelID, relMatVec.get(i), false);
          const matRef = rel?.RelatingMaterial?.value;
          if (!matRef) continue;
          const raw = api.GetRawLineData(modelID, matRef);
          const typeName = api.GetNameFromTypeCode(raw.type).toUpperCase();
          if (!typeName.includes('MATERIALLAYERSETUSAGE')) continue;
          const matUsage = api.GetLine(modelID, matRef, false);
          const directSense = matUsage?.DirectionSense?.value ?? null;
          const offsetRaw = matUsage?.OffsetFromReferenceLine;
          const offset = typeof offsetRaw === 'number' ? offsetRaw : (offsetRaw?.value ?? 0);
          const relObj = rel?.RelatedObjects;
          if (!relObj) continue;
          for (const r of relObj) {
            const wid = r?.value;
            if (wid != null) matUsageByWall[wid] = { directSense, offset_mm: Math.round(offset * 1000) };
          }
        } catch { }
      }
    } catch { }

    const allWallOrigins = parsedWalls.map(w => w.wallOrigin).filter(Boolean);
    const results = [];
    const total = parsedWalls.length;
    let processed = 0, lastYield = Date.now();

    for (const wall of parsedWalls) {
      const eID = wall.expressID;
      const wo = wall.wallOrigin;
      const record = {
        expressID: eID,
        name: wall.name,
        globalId: null,
        lengthAxis: wo?.lengthAxis,
        heightAxis: wo?.heightAxis,
        thicknessAxis: wo?.thicknessAxis,
        checks: {},
        issues: [],
        verdict: 'ok',
      };

      try {
        const wallLine = api.GetLine(modelID, eID, false);
        record.globalId = wallLine?.GlobalId?.value ?? null;

        const m = _extractWallMatrix(api, modelID, eID);

        if (m && wo) {
          const norm = (v) => {
            const l = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
            return l > 0.001 ? { x: v.x / l, y: v.y / l, z: v.z / l } : null;
          };
          const dot3 = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
          const round3 = (v) => ({ x: Math.round(v.x * 1000) / 1000, y: Math.round(v.y * 1000) / 1000, z: Math.round(v.z * 1000) / 1000 });

          const ifcLocalX = norm({ x: m[0], y: m[1], z: m[2] });
          const ifcLocalY = norm({ x: m[4], y: m[5], z: m[6] });
          const ifcOrigin_mm = { x: Math.round(m[12] * 1000), y: Math.round(m[13] * 1000), z: Math.round(m[14] * 1000) };

          if (ifcLocalX && wo.wallLengthDir) {
            const d = dot3(ifcLocalX, wo.wallLengthDir);
            const flipped = d < -0.5;
            const ok = Math.abs(d) > 0.999;
            record.checks.lengthDir = {
              ifcLocalX: round3(ifcLocalX),
              parsedWallLengthDir: round3(wo.wallLengthDir),
              dot: Math.round(d * 1000) / 1000,
              flipped,
              ok,
            };
            if (flipped) { record.issues.push('wallLengthDir REVERSED vs IFC localX'); record.verdict = 'error'; }
            else if (!ok) { record.issues.push('wallLengthDir not aligned with IFC localX'); record.verdict = 'warning'; }
          } else if (!wo.wallLengthDir) {
            record.checks.lengthDir = { note: 'wallLengthDir not set — fallback used' };
            record.issues.push('wallLengthDir missing: outside calc falls back to heuristic');
            if (record.verdict === 'ok') record.verdict = 'warning';
          }

          if (ifcLocalY) {
            const localY_t = ifcLocalY[wo.thicknessAxis] ?? 0;
            const impliedInsideDir = Math.sign(localY_t) || 0;
            const impliedOutsideFromY = -impliedInsideDir;
            const oldDir = _computeOldOutsideDir(wo, allWallOrigins);
            const newDir = _computeNewOutsideDir(wo, allWallOrigins);
            const oldPos = oldDir < 0 ? wo.thicknessStart : (wo.thicknessEnd ?? wo.thicknessStart + 200);
            const newPos = newDir < 0 ? wo.thicknessStart : (wo.thicknessEnd ?? wo.thicknessStart + 200);
            record.checks.outsideDir = {
              ifcLocalY: round3(ifcLocalY),
              localY_t_component: Math.round(localY_t * 1000) / 1000,
              impliedInsideDir_fromY: impliedInsideDir,
              impliedOutsideDir_fromY: impliedOutsideFromY,
              oldOutsideDir: oldDir,
              oldOutsidePos_mm: oldPos,
              newOutsideDir: newDir,
              newOutsidePos_mm: newPos,
              outsideDirChanged: oldDir !== newDir,
              delta_mm: newPos - oldPos,
            };
            if (oldDir !== newDir) {
              record.issues.push(`outsideDir changed old=${oldDir} → new=${newDir} (delta ${newPos - oldPos} mm)`);
              if (record.verdict === 'ok') record.verdict = 'info';
            }
            if (impliedOutsideFromY !== 0 && impliedOutsideFromY !== newDir) {
              record.issues.push(`new outsideDir ${newDir} differs from IFC localY-implied ${impliedOutsideFromY}`);
              if (record.verdict === 'ok') record.verdict = 'warning';
            }
          }

          const matUsage = matUsageByWall[eID];
          if (matUsage) {
            record.checks.materialLayerSetUsage = {
              directSense: matUsage.directSense,
              offsetFromReferenceLine_mm: matUsage.offset_mm,
              note: 'POSITIVE=layers in local+Y from ref-line; NEGATIVE=layers in local-Y',
            };
          }

          record.checks.placement = {
            ifcOrigin_mm,
            thicknessStart_mm: wo.thicknessStart,
            thicknessEnd_mm: wo.thicknessEnd,
            ifcOrigin_t: ifcOrigin_mm[wo.thicknessAxis],
            distToThicknessStart_mm: Math.abs(ifcOrigin_mm[wo.thicknessAxis] - wo.thicknessStart),
            distToThicknessEnd_mm: Math.abs(ifcOrigin_mm[wo.thicknessAxis] - (wo.thicknessEnd ?? wo.thicknessStart + 200)),
          };

          const axisCurve = _extractWallAxisCurve(api, modelID, eID, m);
          if (axisCurve) {
            const dx = axisCurve.end.x - axisCurve.start.x;
            const dy = axisCurve.end.y - axisCurve.start.y;
            const dz = axisCurve.end.z - axisCurve.start.z;
            const axisLen = Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));
            const axisNorm = axisLen > 0 ? { x: dx / axisLen, y: dy / axisLen, z: dz / axisLen } : null;
            const dotWithParsed = (axisNorm && wo.wallLengthDir) ? dot3(axisNorm, wo.wallLengthDir) : null;
            const lengthDelta = axisLen - wall.length;
            record.checks.axisCurve = {
              ifcAxisStart_mm: axisCurve.start,
              ifcAxisEnd_mm: axisCurve.end,
              ifcAxisLength_mm: axisLen,
              parsedLength_mm: wall.length,
              lengthDelta_mm: lengthDelta,
              axisDir: axisNorm ? { x: Math.round(axisNorm.x * 1000) / 1000, y: Math.round(axisNorm.y * 1000) / 1000, z: Math.round(axisNorm.z * 1000) / 1000 } : null,
              dotAxisDirWithWallLengthDir: dotWithParsed !== null ? Math.round(dotWithParsed * 1000) / 1000 : null,
              axisReversedVsWallLengthDir: dotWithParsed !== null ? dotWithParsed < -0.5 : null,
              unitAssumption: 'axis pts read from GetLine; coords assumed WebIFC-normalized (meters); *1000=mm via transform',
            };
            if (dotWithParsed !== null && dotWithParsed < -0.5) {
              record.issues.push('IFC axis direction REVERSED vs wallLengthDir');
              record.verdict = 'error';
            }
            if (Math.abs(lengthDelta) > 50) {
              record.issues.push(`axis length mismatch: IFC=${axisLen}mm parsed=${wall.length}mm delta=${lengthDelta}mm (may indicate unit issue in axis extraction)`);
              if (record.verdict === 'ok') record.verdict = 'warning';
            }
          } else {
            record.checks.axisCurve = { note: 'no Axis representation found' };
          }
        }
      } catch (err) {
        record.issues.push(`extraction error: ${err?.message ?? err}`);
        record.verdict = 'error';
      }

      results.push(record);
      processed++;
      onProgress?.({ current: processed, total });
      const now = Date.now();
      if (now - lastYield > 50) { lastYield = now; await new Promise(r => setTimeout(r, 0)); }
    }

    return results;
  } finally {
    if (ownModel) { try { api.CloseModel(modelID); } catch {} }
  }
}
