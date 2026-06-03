import { adaptWallPlanesToBrickBoard } from './ifcAdapter.js';
import { parseIfc } from './ifc.js';
import { isNewOpeningDerivation } from './featureFlags.js';
import { deriveWallsWithProjection } from './openingDerivation.js';

export async function runNewEngine(_file, _options) {
  throw new Error(
    '[newEngineRunner] Phase 1: new IFC engine not yet wired. ' +
    'Use runWithSampleData(wallPlanes) for contract testing.',
  );
}

export function runWithSampleData(wallPlanes) {
  if (!Array.isArray(wallPlanes)) {
    throw new TypeError('[newEngineRunner] wallPlanes must be an array of WallPlane objects');
  }
  const result = adaptWallPlanesToBrickBoard(wallPlanes);
  console.log('[newEngineRunner] Contract test complete:', {
    wallCount: result.diagnostics.wallCount,
    wallsWithOpenings: result.walls.filter(w => w.openings.length > 0).length,
    totalOpenings: result.walls.reduce((s, w) => s + w.openings.length, 0),
  });
  return result;
}

export function reportContractTest(wallPlanes, sampleCount = 3) {
  const { walls, diagnostics } = runWithSampleData(wallPlanes);
  console.group('[Phase1 Contract Report]');
  console.log('Wall count:', diagnostics.wallCount);
  console.log('Walls with openings:', walls.filter(w => w.openings.length > 0).length);
  console.log('Total openings:', walls.reduce((s, w) => s + w.openings.length, 0));
  for (const d of diagnostics.defaults) console.warn('  ⚠', d);
  for (const wall of walls.slice(0, sampleCount)) {
    const wo = wall.wallOrigin;
    console.log(`  Wall #${wall.expressID}`, {
      lengthAxis: wo.lengthAxis, heightAxis: wo.heightAxis, thicknessAxis: wo.thicknessAxis,
      openingCount: wall.openings.length,
    });
  }
  console.groupEnd();
  return { walls, diagnostics };
}

// ---------------------------------------------------------------------------
// Phase 3 — inheritance layer on top of legacy parseIfc
// ---------------------------------------------------------------------------

const _INHERIT_MAX_THICKNESS_DIFF_HARD = 1000;
const _INHERIT_MIN_OVERLAP_RATIO = 0.5;
const _OPENING_CLIP_MARGIN_MM = 20;

function _intervalOverlap(aMin, aMax, bMin, bMax) {
  return Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin));
}

/**
 * Bepaal of twee wanden co-located zijn.
 *
 * Strategie:
 * 1. STOREY-MATCH (primair): zelfde storeyID = zelfde IFC-bouwblok.
 *    Werkt correct voor gestapelde woningbouw met per-blok coördinaatstelsels.
 * 2. ABSOLUTE POSITIE (fallback): voor IFC-bestanden zonder storeyID.
 */
function _isCoLocated(host, layer) {
  const hwo = host.wallOrigin;
  const lwo = layer.wallOrigin;
  if (!hwo || !lwo) return false;

  const sameStorey = host.storeyID != null &&
                     layer.storeyID != null &&
                     host.storeyID === layer.storeyID;

  const hThick = Math.abs((hwo.thicknessEnd ?? hwo.thicknessStart + 272) - hwo.thicknessStart);
  const lThick = Math.abs((lwo.thicknessEnd ?? lwo.thicknessStart + 183) - lwo.thicknessStart);

  const axesMatchByName =
    hwo.thicknessAxis === lwo.thicknessAxis &&
    hwo.lengthAxis    === lwo.lengthAxis &&
    hwo.heightAxis    === lwo.heightAxis;

  const axesSwapped =
    hwo.thicknessAxis === lwo.lengthAxis &&
    hwo.lengthAxis    === lwo.thicknessAxis &&
    hwo.heightAxis    === lwo.heightAxis;

  if (!axesMatchByName && !axesSwapped) {
    if (!sameStorey) return false;
  }

  if (axesSwapped && !axesMatchByName) {
    const hLen = Math.abs((hwo.lengthEnd ?? hwo.lengthStart) - hwo.lengthStart);
    const lLen = Math.abs((lwo.lengthEnd ?? lwo.lengthStart) - lwo.lengthStart);
    if (hLen > 0 && lLen > 0 && Math.abs(hLen - lLen) / Math.max(hLen, lLen) > 0.3) {
      return false;
    }
  }

  const hTMid = ((hwo.thicknessStart ?? 0) + (hwo.thicknessEnd ?? hwo.thicknessStart + 272)) / 2;
  const lTMid = ((lwo.thicknessStart ?? 0) + (lwo.thicknessEnd ?? lwo.thicknessStart + 183)) / 2;
  const thicknessDiff = Math.abs(hTMid - lTMid);
  const maxThicknessDiff = sameStorey
    ? _INHERIT_MAX_THICKNESS_DIFF_HARD
    : (hThick / 2) + (lThick / 2) + 100;
  if (thicknessDiff > maxThicknessDiff) return false;

  const lOverlap = _intervalOverlap(
    hwo.lengthStart, hwo.lengthEnd ?? hwo.lengthStart,
    lwo.lengthStart, lwo.lengthEnd ?? lwo.lengthStart,
  );
  const minLen = Math.min(
    Math.abs((hwo.lengthEnd ?? hwo.lengthStart) - hwo.lengthStart),
    Math.abs((lwo.lengthEnd ?? lwo.lengthStart) - lwo.lengthStart),
  );
  if (minLen <= 0 || lOverlap / minLen < _INHERIT_MIN_OVERLAP_RATIO) return false;

  if (!sameStorey) {
    const hHEnd = hwo.heightEnd ?? (hwo.heightStart + (host.height ?? 2700));
    const lHEnd = lwo.heightEnd ?? (lwo.heightStart + (layer.height ?? 2700));
    const hOverlap = _intervalOverlap(hwo.heightStart, hHEnd, lwo.heightStart, lHEnd);
    const minHgt = Math.min(
      Math.abs(hHEnd - hwo.heightStart),
      Math.abs(lHEnd - lwo.heightStart),
    );
    if (minHgt <= 0 || hOverlap / minHgt < _INHERIT_MIN_OVERLAP_RATIO) return false;
  }

  return true;
}

function _adjustOpening(opening, host, layer, sameStorey = false) {
  const dL = sameStorey ? 0 : host.wallOrigin.lengthStart - layer.wallOrigin.lengthStart;
  const dH = sameStorey ? 0 : host.wallOrigin.heightStart - layer.wallOrigin.heightStart;
  const newX = opening.x + dL;
  const newY = opening.y + dH;

  const layerLen = (layer.wallOrigin.lengthEnd ?? layer.wallOrigin.lengthStart) - layer.wallOrigin.lengthStart;
  const layerHgt = (layer.wallOrigin.heightEnd ?? (layer.wallOrigin.heightStart + (layer.height ?? 2700))) - layer.wallOrigin.heightStart;

  const M = _OPENING_CLIP_MARGIN_MM;
  if (newX + opening.breedte < -M) return null;
  if (newY + opening.hoogte  < -M) return null;
  if (layerLen > 0 && newX > layerLen + M) return null;
  if (layerHgt > 0 && newY > layerHgt + M) return null;

  return {
    ...opening,
    id: `${opening.id}-inh-${layer.expressID}`,
    x: Math.max(-M, newX),
    y: Math.max(-M, newY),
    polyPts: opening.polyPts
      ? opening.polyPts.map((p) => ({ l: p.l + dL, h: p.h + dH }))
      : null,
    _source: 'inherited',
    _inheritedFrom: host.expressID,
  };
}

export function inheritOpeningsForWalls(walls) {
  const hosts = walls.filter((w) => (w.openings?.length ?? 0) > 0);
  if (hosts.length === 0) return walls;

  let inheritedOpeningCount = 0;
  let inheritedWallCount = 0;
  let storeyMatchCount = 0;
  let positionMatchCount = 0;

  const result = walls.map((wall) => {
    if ((wall.openings?.length ?? 0) > 0) return wall;

    const matchingHosts = hosts.filter((h) => _isCoLocated(h, wall));
    if (matchingHosts.length === 0) return wall;

    const storeyHosts = wall.storeyID
      ? matchingHosts.filter(h => h.storeyID === wall.storeyID)
      : [];
    const candidateHosts = storeyHosts.length > 0 ? storeyHosts : matchingHosts;

    const bestHost = candidateHosts.reduce((a, b) =>
      (a.openings?.length ?? 0) >= (b.openings?.length ?? 0) ? a : b,
    );

    const usedStorey = wall.storeyID && bestHost.storeyID === wall.storeyID;
    if (usedStorey) storeyMatchCount++; else positionMatchCount++;

    const inheritedOpenings = (bestHost.openings ?? [])
      .map((op) => _adjustOpening(op, bestHost, wall, usedStorey))
      .filter(Boolean);

    if (inheritedOpenings.length === 0) return wall;

    inheritedOpeningCount += inheritedOpenings.length;
    inheritedWallCount++;

    return { ...wall, openings: inheritedOpenings };
  });

  console.log('[inheritOpeningsForWalls]',
    inheritedOpeningCount, 'openingen geërfd door',
    inheritedWallCount, 'wanden',
    `(${storeyMatchCount} via storey-match, ${positionMatchCount} via positie-match)`,
  );

  {
    const failing182 = result.filter(
      (w) => (w.typeName ?? '').includes('182.5') && (w.openings?.length ?? 0) === 0,
    );
    if (failing182.length > 0) {
      const h272 = walls.filter(
        (w) => (w.typeName ?? '').includes('272.5') && (w.openings?.length ?? 0) > 0,
      );
      for (const layer of failing182.slice(0, 5)) {
        const lwo = layer.wallOrigin;
        const lThick = lwo ? Math.abs((lwo.thicknessEnd ?? lwo.thicknessStart + 183) - lwo.thicknessStart) : 183;
        const lTMid  = lwo ? ((lwo.thicknessStart ?? 0) + (lwo.thicknessEnd ?? (lwo.thicknessStart + 183))) / 2 : null;
        const lHEnd  = lwo?.heightEnd ?? ((lwo?.heightStart ?? 0) + (layer.height ?? 2700));
        const scored = h272.map((host) => {
          const hwo = host.wallOrigin;
          if (!hwo || !lwo) return { host, score: -Infinity };
          const hThick = Math.abs((hwo.thicknessEnd ?? hwo.thicknessStart + 272) - hwo.thicknessStart);
          const maxThicknessDiff = (hThick / 2) + (lThick / 2) + 200;
          const sameStorey = host.storeyID != null && layer.storeyID != null && host.storeyID === layer.storeyID;
          const axesMatchByName = hwo.thicknessAxis === lwo.thicknessAxis && hwo.lengthAxis === lwo.lengthAxis && hwo.heightAxis === lwo.heightAxis;
          const axesSwapped = hwo.thicknessAxis === lwo.lengthAxis && hwo.lengthAxis === lwo.thicknessAxis && hwo.heightAxis === lwo.heightAxis;
          const sameAxes = axesMatchByName || axesSwapped;
          const hTMid = ((hwo.thicknessStart ?? 0) + (hwo.thicknessEnd ?? (hwo.thicknessStart + 272))) / 2;
          const thicknessMidDiff = Math.abs(hTMid - (lTMid ?? 0));
          const passesThickness = thicknessMidDiff <= Math.min(maxThicknessDiff, _INHERIT_MAX_THICKNESS_DIFF_HARD);
          const lOverlap = _intervalOverlap(hwo.lengthStart, hwo.lengthEnd, lwo.lengthStart, lwo.lengthEnd);
          const minLen = Math.min(Math.abs(hwo.lengthEnd - hwo.lengthStart), Math.abs(lwo.lengthEnd - lwo.lengthStart));
          const lengthOverlapRatioMin = minLen > 0 ? lOverlap / minLen : 0;
          const passesLength = minLen > 0 && lengthOverlapRatioMin >= _INHERIT_MIN_OVERLAP_RATIO;
          const hHEnd = hwo.heightEnd ?? ((hwo.heightStart ?? 0) + (host.height ?? 2700));
          const hOverlap = _intervalOverlap(hwo.heightStart, hHEnd, lwo.heightStart, lHEnd);
          const minHgt = Math.min(Math.abs(hHEnd - (hwo.heightStart ?? 0)), Math.abs(lHEnd - (lwo.heightStart ?? 0)));
          const heightOverlapRatioMin = minHgt > 0 ? hOverlap / minHgt : 0;
          const passesHeight = sameStorey || (minHgt > 0 && heightOverlapRatioMin >= _INHERIT_MIN_OVERLAP_RATIO);
          const finalMatch = sameAxes && passesThickness && passesLength && passesHeight;
          let rejectReason = null;
          if (!finalMatch) {
            if (!sameAxes)             rejectReason = 'B: axes differ';
            else if (!passesThickness) rejectReason = `C: thicknessMidDiff=${Math.round(thicknessMidDiff)}mm > ${Math.round(maxThicknessDiff)}mm`;
            else if (!passesLength)    rejectReason = `D: lengthOverlapRatio=${lengthOverlapRatioMin.toFixed(2)} < 0.5`;
            else if (!passesHeight)    rejectReason = `E: heightOverlapRatio=${heightOverlapRatioMin.toFixed(2)} < 0.5`;
          }
          return {
            host, score: sameStorey ? lOverlap + 1e9 : lOverlap,
            sameStorey, sameAxes, thicknessMidDiff: Math.round(thicknessMidDiff),
            maxThicknessDiff: Math.round(maxThicknessDiff),
            lengthOverlapRatioMin: +lengthOverlapRatioMin.toFixed(3),
            heightOverlapRatioMin: +heightOverlapRatioMin.toFixed(3),
            passesThickness, passesLength, passesHeight, finalMatch, rejectReason,
          };
        });
        scored.sort((a, b) => b.score - a.score);
        const top5 = scored.slice(0, 5);
        const best = top5[0];
        let classification;
        if (h272.length === 0)                  classification = 'A: geen HSB_272.5 host met openings';
        else if (best && !best.sameAxes)        classification = 'B: axes verschillen';
        else if (best && !best.passesThickness) classification = `C: thicknessMidDiff te groot`;
        else if (best && !best.passesLength)    classification = 'D: lengthOverlapRatio te laag';
        else if (best && !best.passesHeight)    classification = 'E: heightOverlapRatio te laag';
        else                                    classification = 'F: onbekend';
        console.log('[InheritDiag] HSB_182.5 geen inheritance:', {
          expressID: layer.expressID,
          name: layer.name,
          storeyID: layer.storeyID,
          classification,
          top5hosts: top5.map((s) => ({
            expressID: s.host.expressID,
            storeyID: s.host.storeyID,
            sameStorey: s.sameStorey,
            thicknessMidDiff: s.thicknessMidDiff,
            lengthOverlapRatioMin: s.lengthOverlapRatioMin,
            heightOverlapRatioMin: s.heightOverlapRatioMin,
            finalMatch: s.finalMatch,
            rejectReason: s.rejectReason,
          })),
        });
      }
      console.log('[InheritDiag] Totaal HSB_182.5 zonder openings na inheritance:', failing182.length,
        'van', result.filter((w) => (w.typeName ?? '').includes('182.5')).length, 'totaal');
    }
  }

  return result;
}

export async function runNewEngineAdapter(file, filter, onProgress, options) {
  // STAP 2: nieuw pad achter feature-flag. Standaard = oud pad.
  if (isNewOpeningDerivation()) {
    const walls = await deriveWallsWithProjection(file, filter, onProgress, options);
    // GEEN inheritOpeningsForWalls: projectie koppelt elke opening al aan de juiste
    // host; samenvoegen van multi-band hosts doet de gevelgroepering (pattern.js).
    return walls; // walls.projectInfo is door parseIfc gezet
  }
  const walls = await parseIfc(file, filter, onProgress, options);
  const result = inheritOpeningsForWalls(walls);
  result.projectInfo = walls.projectInfo ?? null;
  return result;
}
