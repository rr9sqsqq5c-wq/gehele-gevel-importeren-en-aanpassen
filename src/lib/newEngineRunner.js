import { adaptWallPlanesToBrickBoard } from './ifcAdapter.js';
import { parseIfc, resolveOutsideDirections } from './ifc.js';

/**
 * Phase 1 stub. NOT wired into App.jsx.
 *
 * In a future phase this will import the compiled new IFC engine:
 *
 *   import { runIfcImport } from '<new-engine-bundle>';
 *   const wallPlanes = await runIfcImport(file, options);
 *   return adaptWallPlanesToBrickBoard(wallPlanes);
 *
 * New engine source:
 *   bouw-een-robuust-ifc-importsyste-cafc/frontend/src/ifc-engine/
 */
export async function runNewEngine(_file, _options) {
  throw new Error(
    '[newEngineRunner] Phase 1: new IFC engine not yet wired. ' +
    'Use runWithSampleData(wallPlanes) for contract testing.',
  );
}

/**
 * Contract test entry point.
 *
 * Pass in WallPlane[] (e.g. captured from a [DetectWallPlanes] console log
 * in the new engine app) and receive BrickBoard Wall[] + diagnostics.
 *
 * Usage in browser console:
 *   import('/src/lib/newEngineRunner.js').then(m => {
 *     const result = m.runWithSampleData(window.__sampleWallPlanes);
 *     console.log(result);
 *   });
 *
 * @param {object[]} wallPlanes - WallPlane[] from the new IFC engine
 * @returns {{ walls: object[], diagnostics: object }}
 */
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

/**
 * Run a full contract test and print a human-readable report.
 *
 * @param {object[]} wallPlanes - WallPlane[] from the new IFC engine
 * @param {number} [sampleCount=3] - number of sample walls to print
 * @returns {{ walls: object[], diagnostics: object }}
 */
export function reportContractTest(wallPlanes, sampleCount = 3) {
  const { walls, diagnostics } = runWithSampleData(wallPlanes);

  console.group('[Phase1 Contract Report]');
  console.log('Wall count:', diagnostics.wallCount);
  console.log('Walls with openings:', walls.filter(w => w.openings.length > 0).length);
  console.log('Total openings:', walls.reduce((s, w) => s + w.openings.length, 0));
  console.log('');
  console.log('Filled fields:', diagnostics.filled);
  console.log('');
  console.log('Defaults applied:');
  for (const d of diagnostics.defaults) {
    console.warn('  ⚠', d);
  }
  console.log('');
  console.log(`Sample walls (first ${Math.min(sampleCount, walls.length)}):`);
  for (const wall of walls.slice(0, sampleCount)) {
    const wo = wall.wallOrigin;
    console.log(`  Wall #${wall.expressID}`, {
      lengthAxis:       wo.lengthAxis,
      heightAxis:       wo.heightAxis,
      thicknessAxis:    wo.thicknessAxis,
      lengthStart:      wo.lengthStart,
      lengthEnd:        wo.lengthEnd,
      heightStart:      wo.heightStart,
      heightEnd:        wo.heightEnd,
      thicknessStart:   wo.thicknessStart,
      thicknessEnd:     wo.thicknessEnd,
      resolvedOutside:  wo.resolvedOutside,
      length:           wall.length,
      height:           wall.height,
      openingCount:     wall.openings.length,
      openings: wall.openings.map(o => ({
        id:      o.id,
        type:    o.type,
        x:       o.x,
        y:       o.y,
        breedte: o.breedte,
        hoogte:  o.hoogte,
        polyPts: o.polyPts?.length ?? 0,
        _source: o._source,
      })),
      facadePolyPoints: wall.facadePoly?.length ?? 0,
    });
  }
  console.groupEnd();

  return { walls, diagnostics };
}

// ---------------------------------------------------------------------------
// Phase 3 — inheritance layer on top of legacy parseIfc
// ---------------------------------------------------------------------------

const _INHERIT_MAX_DEPTH_DIFF_MM = 400;
const _INHERIT_MIN_OVERLAP_RATIO = 0.5;
const _INHERIT_TOUCH_TOL_MM = 100;

function _intervalOverlap(aMin, aMax, bMin, bMax) {
  return Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin));
}

function _isCoLocated(host, layer) {
  const hwo = host.wallOrigin;
  const lwo = layer.wallOrigin;
  if (!hwo || !lwo) return false;
  if (hwo.thicknessAxis !== lwo.thicknessAxis) return false;
  if (hwo.lengthAxis !== lwo.lengthAxis) return false;
  if (hwo.heightAxis !== lwo.heightAxis) return false;

  const hTMid = ((hwo.thicknessStart ?? 0) + (hwo.thicknessEnd ?? hwo.thicknessStart + 272)) / 2;
  const lTMid = ((lwo.thicknessStart ?? 0) + (lwo.thicknessEnd ?? lwo.thicknessStart + 183)) / 2;
  const midMatch = Math.abs(hTMid - lTMid) <= _INHERIT_MAX_DEPTH_DIFF_MM;
  const adjacent = Math.abs((hwo.thicknessEnd ?? hwo.thicknessStart + 272) - (lwo.thicknessStart ?? 0)) <= _INHERIT_TOUCH_TOL_MM
                || Math.abs((lwo.thicknessEnd ?? lwo.thicknessStart + 183) - (hwo.thicknessStart ?? 0)) <= _INHERIT_TOUCH_TOL_MM;
  if (!midMatch && !adjacent) return false;

  const lOverlap = _intervalOverlap(hwo.lengthStart, hwo.lengthEnd, lwo.lengthStart, lwo.lengthEnd);
  const minLen = Math.min(hwo.lengthEnd - hwo.lengthStart, lwo.lengthEnd - lwo.lengthStart);
  if (minLen <= 0 || lOverlap / minLen < _INHERIT_MIN_OVERLAP_RATIO) return false;

  const hHEnd = hwo.heightEnd ?? (hwo.heightStart + (host.height ?? 2700));
  const lHEnd = lwo.heightEnd ?? (lwo.heightStart + (layer.height ?? 2700));
  const hOverlap = _intervalOverlap(hwo.heightStart, hHEnd, lwo.heightStart, lHEnd);
  const minHgt = Math.min(hHEnd - hwo.heightStart, lHEnd - lwo.heightStart);
  if (minHgt <= 0 || hOverlap / minHgt < _INHERIT_MIN_OVERLAP_RATIO) return false;

  return true;
}

function _adjustOpening(opening, host, layer) {
  const dL = host.wallOrigin.lengthStart - layer.wallOrigin.lengthStart;
  const dH = host.wallOrigin.heightStart - layer.wallOrigin.heightStart;

  return {
    ...opening,
    id: `${opening.id}-inh-${layer.expressID}`,
    x: Math.max(0, opening.x + dL),
    y: Math.max(0, opening.y + dH),
    polyPts: null,
    thicknessCenter: null,
    _source: 'inherited',
    _inheritedFrom: host.expressID,
  };
}

/**
 * Add inherited openings to walls that have none, by matching co-located host walls.
 * Ported from inheritCoLocatedOpenings.ts (cafc worktree).
 *
 * @param {object[]} walls - Wall[] in BrickBoard format
 * @returns {object[]} - Enhanced Wall[] with inherited openings
 */
export function inheritOpeningsForWalls(walls) {
  const hosts = walls.filter((w) => (w.openings?.length ?? 0) > 0);
  const candidates = walls.filter((w) => (w.openings?.length ?? 0) === 0);
  const hsb182candidates = candidates.filter((w) => (w.typeName ?? '').includes('182.5'));
  const hsb272hosts = hosts.filter((w) => (w.typeName ?? '').includes('272.5'));
  console.log('[InheritanceStage2] inheritOpeningsForWalls CALLED', {
    totalWalls: walls.length,
    hosts: hosts.length,
    candidates: candidates.length,
    hsb182_candidates: hsb182candidates.length,
    hsb272_hosts: hsb272hosts.length,
  });
  if (hosts.length === 0) {
    console.log('[InheritanceStage2] EARLY EXIT — geen host-wanden met openings');
    return walls;
  }

  let inheritedOpeningCount = 0;
  let inheritedWallCount = 0;

  let _stage3TotalMatches = 0;
  let _stage3TotalChecks = 0;
  let _stage3SampleLogged = 0;

  const result = walls.map((wall) => {
    if ((wall.openings?.length ?? 0) > 0) return wall;

    _stage3TotalChecks++;
    const matchingHosts = hosts.filter((h) => _isCoLocated(h, wall));
    _stage3TotalMatches += matchingHosts.length;

    if (matchingHosts.length === 0 && _stage3SampleLogged < 3 && (wall.typeName ?? '').includes('182.5')) {
      const lwo = wall.wallOrigin;
      const sampleHost = hsb272hosts[0];
      const hwo = sampleHost?.wallOrigin;
      _stage3SampleLogged++;
      console.log('[InheritanceStage3] GEEN MATCH voor HSB_182.5', {
        layer_expressID: wall.expressID,
        layer_typeName: wall.typeName,
        layer_thicknessAxis: lwo?.thicknessAxis,
        layer_lengthAxis: lwo?.lengthAxis,
        layer_heightAxis: lwo?.heightAxis,
        layer_thicknessStart: lwo?.thicknessStart,
        layer_thicknessEnd: lwo?.thicknessEnd,
        layer_lengthStart: lwo?.lengthStart,
        layer_lengthEnd: lwo?.lengthEnd,
        layer_heightStart: lwo?.heightStart,
        layer_heightEnd: lwo?.heightEnd,
        sampleHost_expressID: sampleHost?.expressID,
        sampleHost_typeName: sampleHost?.typeName,
        sampleHost_thicknessAxis: hwo?.thicknessAxis,
        sampleHost_lengthAxis: hwo?.lengthAxis,
        sampleHost_heightAxis: hwo?.heightAxis,
        sampleHost_thicknessStart: hwo?.thicknessStart,
        sampleHost_thicknessEnd: hwo?.thicknessEnd,
        sampleHost_lengthStart: hwo?.lengthStart,
        sampleHost_lengthEnd: hwo?.lengthEnd,
        sampleHost_heightStart: hwo?.heightStart,
        sampleHost_heightEnd: hwo?.heightEnd,
        thicknessMidDiff: hwo && lwo
          ? Math.abs(
              ((hwo.thicknessStart ?? 0) + (hwo.thicknessEnd ?? hwo.thicknessStart + 272)) / 2 -
              ((lwo.thicknessStart ?? 0) + (lwo.thicknessEnd ?? lwo.thicknessStart + 183)) / 2
            )
          : null,
      });
    }

    if (matchingHosts.length === 0) return wall;

    const bestHost = matchingHosts.reduce((a, b) =>
      (a.openings?.length ?? 0) >= (b.openings?.length ?? 0) ? a : b,
    );

    const inheritedOpenings = (bestHost.openings ?? []).map((op) =>
      _adjustOpening(op, bestHost, wall),
    );

    inheritedOpeningCount += inheritedOpenings.length;
    inheritedWallCount++;

    return { ...wall, openings: inheritedOpenings };
  });

  console.log('[InheritanceStage3] _isCoLocated RESULTATEN', {
    candidatesChecked: _stage3TotalChecks,
    totalMatches: _stage3TotalMatches,
    wallsInherited: inheritedWallCount,
    openingsInherited: inheritedOpeningCount,
  });

  console.log('[inheritOpeningsForWalls]',
    inheritedOpeningCount, 'openingen geërfd door',
    inheritedWallCount, 'wanden van',
    hosts.length, 'hostwanden',
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
        const lTMid = lwo
          ? ((lwo.thicknessStart ?? 0) + (lwo.thicknessEnd ?? (lwo.thicknessStart + 183))) / 2
          : null;
        const lHEnd = lwo?.heightEnd ?? ((lwo?.heightStart ?? 0) + (layer.height ?? 2700));

        const scored = h272.map((host) => {
          const hwo = host.wallOrigin;
          if (!hwo || !lwo) return { host, score: -Infinity };

          const sameAxes =
            hwo.thicknessAxis === lwo.thicknessAxis &&
            hwo.lengthAxis    === lwo.lengthAxis &&
            hwo.heightAxis    === lwo.heightAxis;

          const hTMid = ((hwo.thicknessStart ?? 0) + (hwo.thicknessEnd ?? (hwo.thicknessStart + 272))) / 2;
          const thicknessMidDiff = Math.abs(hTMid - (lTMid ?? 0));
          const passesThickness = thicknessMidDiff <= _INHERIT_MAX_DEPTH_DIFF_MM;

          const lOverlap = _intervalOverlap(hwo.lengthStart, hwo.lengthEnd, lwo.lengthStart, lwo.lengthEnd);
          const hostLen  = hwo.lengthEnd - hwo.lengthStart;
          const layerLen = lwo.lengthEnd - lwo.lengthStart;
          const minLen   = Math.min(hostLen, layerLen);
          const lengthOverlapRatioMin   = minLen > 0 ? lOverlap / minLen : 0;
          const lengthOverlapRatioHost  = hostLen  > 0 ? lOverlap / hostLen  : 0;
          const lengthOverlapRatioLayer = layerLen > 0 ? lOverlap / layerLen : 0;
          const passesLength = minLen > 0 && lengthOverlapRatioMin >= _INHERIT_MIN_OVERLAP_RATIO;

          const hHEnd   = hwo.heightEnd ?? ((hwo.heightStart ?? 0) + (host.height ?? 2700));
          const hOverlap = _intervalOverlap(hwo.heightStart, hHEnd, lwo.heightStart, lHEnd);
          const hostHgt  = hHEnd - (hwo.heightStart ?? 0);
          const layerHgt = lHEnd - (lwo.heightStart ?? 0);
          const minHgt   = Math.min(hostHgt, layerHgt);
          const heightOverlapRatioMin   = minHgt > 0 ? hOverlap / minHgt : 0;
          const heightOverlapRatioHost  = hostHgt  > 0 ? hOverlap / hostHgt  : 0;
          const heightOverlapRatioLayer = layerHgt > 0 ? hOverlap / layerHgt : 0;
          const passesHeight = minHgt > 0 && heightOverlapRatioMin >= _INHERIT_MIN_OVERLAP_RATIO;

          const finalMatch = sameAxes && passesThickness && passesLength && passesHeight;
          let rejectReason = null;
          if (!finalMatch) {
            if (!sameAxes)         rejectReason = `B: axes differ (host=${hwo.thicknessAxis}/${hwo.lengthAxis}, layer=${lwo.thicknessAxis}/${lwo.lengthAxis})`;
            else if (!passesThickness) rejectReason = `C: thicknessMidDiff=${Math.round(thicknessMidDiff)}mm > 400mm`;
            else if (!passesLength)    rejectReason = `D: lengthOverlapRatioMin=${lengthOverlapRatioMin.toFixed(2)} < 0.5 (overlap=${Math.round(lOverlap)}mm, minLen=${Math.round(minLen)}mm)`;
            else if (!passesHeight)    rejectReason = `E: heightOverlapRatioMin=${heightOverlapRatioMin.toFixed(2)} < 0.5 (overlap=${Math.round(hOverlap)}mm, minHgt=${Math.round(minHgt)}mm)`;
          }

          return {
            host, score: lOverlap,
            sameAxes, thicknessMidDiff: Math.round(thicknessMidDiff),
            lengthOverlap: Math.round(lOverlap),
            lengthOverlapRatioMin: +lengthOverlapRatioMin.toFixed(3),
            lengthOverlapRatioHost: +lengthOverlapRatioHost.toFixed(3),
            lengthOverlapRatioLayer: +lengthOverlapRatioLayer.toFixed(3),
            heightOverlap: Math.round(hOverlap),
            heightOverlapRatioMin: +heightOverlapRatioMin.toFixed(3),
            heightOverlapRatioHost: +heightOverlapRatioHost.toFixed(3),
            heightOverlapRatioLayer: +heightOverlapRatioLayer.toFixed(3),
            passesThickness, passesLength, passesHeight, finalMatch, rejectReason,
          };
        });

        scored.sort((a, b) => b.score - a.score);
        const top5 = scored.slice(0, 5);
        const best = top5[0];

        let classification;
        if (h272.length === 0)          classification = 'A: geen HSB_272.5 host met openings';
        else if (best && !best.sameAxes)          classification = 'B: axes verschillen';
        else if (best && !best.passesThickness)   classification = 'C: thicknessMidDiff te groot';
        else if (best && !best.passesLength)      classification = 'D: lengthOverlapRatio te laag';
        else if (best && !best.passesHeight)      classification = 'E: heightOverlapRatio te laag';
        else                                      classification = 'F: onbekend';

        console.log('[InheritDiag] HSB_182.5 geen inheritance:', {
          expressID: layer.expressID,
          name: layer.name,
          typeName: layer.typeName,
          lengthAxis: lwo?.lengthAxis,
          heightAxis: lwo?.heightAxis,
          thicknessAxis: lwo?.thicknessAxis,
          lengthStart: lwo?.lengthStart,
          lengthEnd: lwo?.lengthEnd,
          heightStart: lwo?.heightStart,
          heightEnd: lwo?.heightEnd,
          thicknessStart: lwo?.thicknessStart,
          thicknessEnd: lwo?.thicknessEnd,
          thicknessMid: lTMid !== null ? Math.round(lTMid) : null,
          length: layer.length,
          height: layer.height,
          classification,
          top5hosts: top5.map((s) => ({
            expressID: s.host.expressID,
            name: s.host.name,
            openingsLength: s.host.openings?.length ?? 0,
            lengthAxis: s.host.wallOrigin?.lengthAxis,
            thicknessAxis: s.host.wallOrigin?.thicknessAxis,
            lengthStart: s.host.wallOrigin?.lengthStart,
            lengthEnd: s.host.wallOrigin?.lengthEnd,
            heightStart: s.host.wallOrigin?.heightStart,
            heightEnd: s.host.wallOrigin?.heightEnd,
            thicknessStart: s.host.wallOrigin?.thicknessStart,
            thicknessEnd: s.host.wallOrigin?.thicknessEnd,
            thicknessMid: s.host.wallOrigin
              ? Math.round(((s.host.wallOrigin.thicknessStart ?? 0) + (s.host.wallOrigin.thicknessEnd ?? (s.host.wallOrigin.thicknessStart + 272))) / 2)
              : null,
            sameAxes: s.sameAxes,
            thicknessMidDiff: s.thicknessMidDiff,
            lengthOverlap: s.lengthOverlap,
            lengthOverlapRatioMin: s.lengthOverlapRatioMin,
            lengthOverlapRatioHost: s.lengthOverlapRatioHost,
            lengthOverlapRatioLayer: s.lengthOverlapRatioLayer,
            heightOverlap: s.heightOverlap,
            heightOverlapRatioMin: s.heightOverlapRatioMin,
            heightOverlapRatioHost: s.heightOverlapRatioHost,
            heightOverlapRatioLayer: s.heightOverlapRatioLayer,
            passesThickness: s.passesThickness,
            passesLength: s.passesLength,
            passesHeight: s.passesHeight,
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

/**
 * Phase 3 adapter: runs legacy parseIfc then applies inheritance.
 * Drop-in replacement for parseIfc — same signature, same Wall[] output format.
 *
 * @param {File} file
 * @param {Set|null} filter
 * @param {function} onProgress
 * @param {object} options
 * @returns {Promise<object[]>} - Wall[] with inherited openings for co-located layers
 */
export async function runNewEngineAdapter(file, filter, onProgress, options) {
  console.log('[InheritanceStage1] runNewEngineAdapter STARTED');
  const walls = await parseIfc(file, filter, onProgress, options);
  const hostWalls = walls.filter((w) => (w.openings?.length ?? 0) > 0);
  const candidateWalls = walls.filter((w) => (w.openings?.length ?? 0) === 0);
  const hsb182 = walls.filter((w) => (w.typeName ?? '').includes('182.5'));
  const hsb272 = walls.filter((w) => (w.typeName ?? '').includes('272.5'));
  console.log('[InheritanceStage1] parseIfc DONE', {
    totalWalls: walls.length,
    hostWalls: hostWalls.length,
    candidateWalls: candidateWalls.length,
    hsb182_total: hsb182.length,
    hsb182_withOpenings: hsb182.filter((w) => (w.openings?.length ?? 0) > 0).length,
    hsb272_total: hsb272.length,
    hsb272_withOpenings: hsb272.filter((w) => (w.openings?.length ?? 0) > 0).length,
  });
  {
    const wallsWithOpenings = walls.filter((w) => (w.openings?.length ?? 0) > 0);
    const withOrigin = wallsWithOpenings.filter((w) => !!w.wallOrigin);
    const missing = wallsWithOpenings.filter((w) => !w.wallOrigin);
    console.log('[WallOriginStageA]', {
      totalWalls: walls.length,
      wallsWithOpenings: wallsWithOpenings.length,
      wallsWithOpeningsAndWallOrigin: withOrigin.length,
      sampleMissingWallOriginIds: missing.slice(0, 5).map((w) => w.expressID),
    });
  }
  const result = inheritOpeningsForWalls(walls);
  resolveOutsideDirections(result);
  return result;
}
