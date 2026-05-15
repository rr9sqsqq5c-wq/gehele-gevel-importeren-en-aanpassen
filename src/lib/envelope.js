const ENV_TOL = 80;
const SIDE_TOL = 60;

export function detectBuildingEnvelope(allWalls) {
  const byAxis = {};
  const overall = {
    x: { min: Infinity, max: -Infinity },
    y: { min: Infinity, max: -Infinity },
    z: { min: Infinity, max: -Infinity },
  };

  for (const w of allWalls) {
    const wo = w.wallOrigin;
    if (!wo) continue;

    const ta = wo.thicknessAxis;
    const la = wo.lengthAxis;
    const ha = wo.heightAxis;
    const tStart = wo.thicknessStart;
    const tEnd = wo.thicknessEnd ?? tStart + (w.thickness ?? 300);
    const lStart = wo.lengthStart;
    const lEnd = lStart + (w.length ?? 0);
    const hStart = wo.heightStart;
    const hEnd = hStart + (w.height ?? 0);

    if (!byAxis[ta]) byAxis[ta] = { min: Infinity, max: -Infinity };
    byAxis[ta].min = Math.min(byAxis[ta].min, tStart);
    byAxis[ta].max = Math.max(byAxis[ta].max, tEnd);

    overall[ta].min = Math.min(overall[ta].min, tStart);
    overall[ta].max = Math.max(overall[ta].max, tEnd);
    overall[la].min = Math.min(overall[la].min, lStart);
    overall[la].max = Math.max(overall[la].max, lEnd);
    overall[ha].min = Math.min(overall[ha].min, hStart);
    overall[ha].max = Math.max(overall[ha].max, hEnd);
  }

  const planes = [];
  for (const [axis, bounds] of Object.entries(byAxis)) {
    if (isFinite(bounds.min)) planes.push({ axis, pos: bounds.min, dir: -1, label: `env-${axis}-min` });
    if (isFinite(bounds.max)) planes.push({ axis, pos: bounds.max, dir: +1, label: `env-${axis}-max` });
  }

  const normals = planes.map((p) => {
    const n = { x: 0, y: 0, z: 0 };
    n[p.axis] = p.dir;
    return { ...p, normal: n };
  });

  return { byAxis, overall, planes, normals };
}

function wallBBox(wall) {
  const wo = wall.wallOrigin;
  if (!wo) return null;
  const tEnd = wo.thicknessEnd ?? wo.thicknessStart + (wall.thickness ?? 300);
  return {
    [wo.lengthAxis + 'Min']: wo.lengthStart,
    [wo.lengthAxis + 'Max']: wo.lengthStart + (wall.length ?? 0),
    [wo.heightAxis + 'Min']: wo.heightStart,
    [wo.heightAxis + 'Max']: wo.heightStart + (wall.height ?? 0),
    [wo.thicknessAxis + 'Min']: Math.min(wo.thicknessStart, tEnd),
    [wo.thicknessAxis + 'Max']: Math.max(wo.thicknessStart, tEnd),
    la: wo.lengthAxis,
    ha: wo.heightAxis,
    ta: wo.thicknessAxis,
    lengthStart: wo.lengthStart,
    lengthEnd: wo.lengthStart + (wall.length ?? 0),
    heightStart: wo.heightStart,
    heightEnd: wo.heightStart + (wall.height ?? 0),
    thicknessStart: wo.thicknessStart,
    thicknessEnd: tEnd,
  };
}

function rangesOverlap(a0, a1, b0, b1, tol) {
  return a0 < b1 + tol && a1 > b0 - tol;
}

function getFaceStatus(wall, face, allWalls, envelopeData) {
  const wo = wall.wallOrigin;
  if (!wo) return 'HIDDEN';

  const ta = wo.thicknessAxis;
  const la = wo.lengthAxis;
  const ha = wo.heightAxis;
  const env = envelopeData.byAxis[ta] ?? { min: -Infinity, max: Infinity };

  const tStart = wo.thicknessStart;
  const tEnd = wo.thicknessEnd ?? tStart + (wall.thickness ?? 300);
  const lStart = wo.lengthStart;
  const lEnd = lStart + (wall.length ?? 0);
  const hStart = wo.heightStart;
  const hEnd = hStart + (wall.height ?? 0);

  let outsideDir, outsidePos;
  if (wo.resolvedOutside) {
    outsideDir = wo.resolvedOutside.outsideDir;
    outsidePos = wo.resolvedOutside.outsidePos;
  } else {
    const distMin = Math.abs(tStart - env.min);
    const distMax = Math.abs(tEnd - env.max);
    if (distMin <= distMax) {
      outsideDir = -1;
      outsidePos = tStart;
    } else {
      outsideDir = +1;
      outsidePos = tEnd;
    }
  }

  if (face === 'front') {
    const atEnv = Math.abs(outsidePos - (outsideDir < 0 ? env.min : env.max)) <= ENV_TOL;
    if (atEnv) return 'OUTSIDE';
    const otherSameAxis = allWalls.filter((w) => {
      if (w.expressID === wall.expressID) return false;
      const woo = w.wallOrigin;
      if (!woo || woo.thicknessAxis !== ta) return false;
      return true;
    });
    const covered = otherSameAxis.some((w) => {
      const woo = w.wallOrigin;
      const wTEnd = woo.thicknessEnd ?? woo.thicknessStart + (w.thickness ?? 300);
      const wLEnd = woo.lengthStart + (w.length ?? 0);
      const wHEnd = woo.heightStart + (w.height ?? 0);
      const tOverlap = Math.min(Math.max(woo.thicknessStart, tStart), Math.max(woo.thicknessStart, tEnd)) !== Math.max(woo.thicknessStart, tStart);
      const lOvlp = rangesOverlap(woo.lengthStart, wLEnd, lStart, lEnd, SIDE_TOL);
      const hOvlp = rangesOverlap(woo.heightStart, wHEnd, hStart, hEnd, SIDE_TOL);
      const thkOvlp = rangesOverlap(woo.thicknessStart, wTEnd, Math.min(tStart, tEnd), Math.max(tStart, tEnd), SIDE_TOL);
      return lOvlp && hOvlp && thkOvlp && !tOverlap;
    });
    return covered ? 'HIDDEN' : 'OUTSIDE';
  }

  if (face === 'side-left') {
    const exposed = !allWalls.some((w) => {
      if (w.expressID === wall.expressID) return false;
      const woo = w.wallOrigin;
      if (!woo || woo.lengthAxis !== la || woo.thicknessAxis !== ta) return false;
      const wLEnd = woo.lengthStart + (w.length ?? 0);
      if (Math.abs(wLEnd - lStart) > SIDE_TOL) return false;
      const wTEnd = woo.thicknessEnd ?? woo.thicknessStart + (w.thickness ?? 300);
      if (!rangesOverlap(Math.min(woo.thicknessStart, wTEnd), Math.max(woo.thicknessStart, wTEnd), Math.min(tStart, tEnd), Math.max(tStart, tEnd), SIDE_TOL)) return false;
      const wHEnd = woo.heightStart + (w.height ?? 0);
      return rangesOverlap(woo.heightStart, wHEnd, hStart, hEnd, SIDE_TOL);
    });
    return exposed ? 'RETURN_FACE' : 'HIDDEN';
  }

  if (face === 'side-right') {
    const exposed = !allWalls.some((w) => {
      if (w.expressID === wall.expressID) return false;
      const woo = w.wallOrigin;
      if (!woo || woo.lengthAxis !== la || woo.thicknessAxis !== ta) return false;
      if (Math.abs(woo.lengthStart - lEnd) > SIDE_TOL) return false;
      const wTEnd = woo.thicknessEnd ?? woo.thicknessStart + (w.thickness ?? 300);
      if (!rangesOverlap(Math.min(woo.thicknessStart, wTEnd), Math.max(woo.thicknessStart, wTEnd), Math.min(tStart, tEnd), Math.max(tStart, tEnd), SIDE_TOL)) return false;
      const wHEnd = woo.heightStart + (w.height ?? 0);
      return rangesOverlap(woo.heightStart, wHEnd, hStart, hEnd, SIDE_TOL);
    });
    return exposed ? 'RETURN_FACE' : 'HIDDEN';
  }

  if (face === 'portal-left' || face === 'portal-right') {
    return 'RETURN_FACE';
  }

  return 'HIDDEN';
}

export function extractVisibleConcreteFaces(groupWalls, allWalls, envelopeData) {
  const withOrigin = groupWalls.filter((w) => w.wallOrigin);
  if (!withOrigin.length) return [];

  const result = [];

  for (const wall of withOrigin) {
    const wo = wall.wallOrigin;
    const ta = wo.thicknessAxis;
    const la = wo.lengthAxis;
    const ha = wo.heightAxis;
    const tStart = wo.thicknessStart;
    const tEnd = wo.thicknessEnd ?? tStart + (wall.thickness ?? 300);
    const lStart = wo.lengthStart;
    const lEnd = lStart + (wall.length ?? 0);
    const hStart = wo.heightStart;
    const hEnd = hStart + (wall.height ?? 0);
    const wallThick = Math.abs(tEnd - tStart);

    let outsideDir, outsidePos;
    if (wo.resolvedOutside) {
      outsideDir = wo.resolvedOutside.outsideDir;
      outsidePos = wo.resolvedOutside.outsidePos;
    } else {
      const env = envelopeData.byAxis[ta] ?? { min: tStart, max: tEnd };
      outsideDir = Math.abs(tStart - env.min) <= Math.abs(tEnd - env.max) ? -1 : +1;
      outsidePos = outsideDir < 0 ? tStart : tEnd;
    }

    const localAxes = {
      xAxis: (() => { const v = { x: 0, y: 0, z: 0 }; v[la] = 1; return v; })(),
      yAxis: (() => { const v = { x: 0, y: 0, z: 0 }; v[ha] = 1; return v; })(),
      zAxis: (() => { const v = { x: 0, y: 0, z: 0 }; v[ta] = outsideDir; return v; })(),
    };

    const frontStatus = getFaceStatus(wall, 'front', allWalls, envelopeData);
    result.push({
      wallId: wall.expressID,
      faceType: 'front',
      visibility: frontStatus,
      outsideDir,
      outsidePos,
      wallThickness: wallThick,
      lengthStart: lStart,
      lengthEnd: lEnd,
      heightStart: hStart,
      heightEnd: hEnd,
      thicknessStart: tStart,
      thicknessEnd: tEnd,
      axes: { thickness: ta, length: la, height: ha },
      localAxes,
      openings: (wall.openings ?? []).map((op) => ({
        x: op.x ?? 0,
        y: op.y ?? 0,
        width: op.breedte ?? op.width ?? 0,
        height: op.hoogte ?? op.height ?? 0,
      })).filter((op) => op.width > 0 && op.height > 0),
    });

    const leftStatus = getFaceStatus(wall, 'side-left', allWalls, envelopeData);
    result.push({
      wallId: wall.expressID,
      faceType: 'side-left',
      visibility: leftStatus,
      outsideDir,
      outsidePos,
      wallThickness: wallThick,
      lengthStart: lStart,
      lengthEnd: lEnd,
      heightStart: hStart,
      heightEnd: hEnd,
      thicknessStart: tStart,
      thicknessEnd: tEnd,
      axes: { thickness: ta, length: la, height: ha },
      localAxes,
      openings: [],
    });

    const rightStatus = getFaceStatus(wall, 'side-right', allWalls, envelopeData);
    result.push({
      wallId: wall.expressID,
      faceType: 'side-right',
      visibility: rightStatus,
      outsideDir,
      outsidePos,
      wallThickness: wallThick,
      lengthStart: lStart,
      lengthEnd: lEnd,
      heightStart: hStart,
      heightEnd: hEnd,
      thicknessStart: tStart,
      thicknessEnd: tEnd,
      axes: { thickness: ta, length: la, height: ha },
      localAxes,
      openings: [],
    });

    for (const op of (wall.openings ?? [])) {
      const opX = op.x ?? 0;
      const opY = op.y ?? 0;
      const opW = op.breedte ?? op.width ?? 0;
      const opH = op.hoogte ?? op.height ?? 0;
      if (opW <= 0 || opH <= 0) continue;

      for (const portalSide of ['portal-left', 'portal-right']) {
        result.push({
          wallId: wall.expressID,
          faceType: portalSide,
          visibility: 'RETURN_FACE',
          outsideDir,
          outsidePos,
          wallThickness: wallThick,
          lengthStart: lStart,
          lengthEnd: lEnd,
          heightStart: hStart,
          heightEnd: hEnd,
          thicknessStart: tStart,
          thicknessEnd: tEnd,
          axes: { thickness: ta, length: la, height: ha },
          localAxes,
          openingX: opX,
          openingY: opY,
          openingWidth: opW,
          openingHeight: opH,
          openings: [],
        });
      }
    }
  }

  return result;
}

export function buildAutoSlimFortSettings(visibleFaces, existingSettings) {
  const hasFront = visibleFaces.some((f) => f.faceType === 'front' && (f.visibility === 'OUTSIDE'));
  const hasSide = visibleFaces.some((f) => (f.faceType === 'side-left' || f.faceType === 'side-right') && f.visibility === 'RETURN_FACE');
  const hasPortal = visibleFaces.some((f) => (f.faceType === 'portal-left' || f.faceType === 'portal-right') && f.visibility === 'RETURN_FACE');

  return {
    ...existingSettings,
    cladFrontFace: hasFront,
    cladSideFaces: hasSide,
    cladPortalInnerFaces: hasPortal,
  };
}
