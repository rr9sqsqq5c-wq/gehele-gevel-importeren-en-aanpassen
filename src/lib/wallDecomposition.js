const MIN_RETURN_WIDTH_MM = 50;
const MIN_WALL_HEIGHT_MM = 50;

const WALL_TYPE_PRIORITY = { front: 4, leftReturn: 3, rightReturn: 3, portalLeft: 2, portalRight: 2 };

function wallSegId(groupId, faceType, wallId) {
  return `${groupId}__${faceType}__${wallId}`;
}

function visibleFaceToWallType(faceType) {
  switch (faceType) {
    case 'front': return 'front';
    case 'side-left': return 'leftReturn';
    case 'side-right': return 'rightReturn';
    case 'portal-left': return 'portalLeft';
    case 'portal-right': return 'portalRight';
    default: return null;
  }
}

export function createSyntheticWallOrigin(wallSegment) {
  const { wallType, axes, outsideDir, outsidePos, lengthStart, lengthEnd, heightStart, localWidth, localHeight, wallThickness, sfTotalThickness } = wallSegment;
  const sfTotal = sfTotalThickness ?? 196;

  if (wallType === 'front') {
    return {
      lengthAxis: axes.length,
      heightAxis: axes.height,
      thicknessAxis: axes.thickness,
      lengthStart,
      lengthEnd: lengthEnd ?? (lengthStart + localWidth),
      heightStart,
      heightEnd: heightStart + localHeight,
      thicknessStart: outsidePos,
      thicknessEnd: outsidePos + sfTotal * (outsideDir < 0 ? 1 : -1),
      resolvedOutside: { outsideDir, outsidePos },
    };
  }

  if (wallType === 'leftReturn') {
    const retW = localWidth;
    const retStart = outsidePos;
    const retEnd = outsidePos + retW * (outsideDir < 0 ? 1 : -1);
    const cornerPos = lengthStart;
    const thickStart = cornerPos + sfTotal * (outsideDir < 0 ? 0 : -1);

    return {
      lengthAxis: axes.thickness,
      heightAxis: axes.height,
      thicknessAxis: axes.length,
      lengthStart: Math.min(retStart, retEnd),
      lengthEnd: Math.max(retStart, retEnd),
      heightStart,
      heightEnd: heightStart + localHeight,
      thicknessStart: thickStart,
      thicknessEnd: cornerPos,
      resolvedOutside: {
        outsideDir: outsideDir < 0 ? 1 : -1,
        outsidePos: Math.min(retStart, retEnd),
      },
    };
  }

  if (wallType === 'rightReturn') {
    const retW = localWidth;
    const retStart = outsidePos;
    const retEnd = outsidePos + retW * (outsideDir < 0 ? 1 : -1);
    const cornerPos = lengthEnd ?? (lengthStart + wallSegment.sourceFaceWidth ?? 0);
    const thickStart = cornerPos - sfTotal * (outsideDir < 0 ? 0 : -1);

    return {
      lengthAxis: axes.thickness,
      heightAxis: axes.height,
      thicknessAxis: axes.length,
      lengthStart: Math.min(retStart, retEnd),
      lengthEnd: Math.max(retStart, retEnd),
      heightStart,
      heightEnd: heightStart + localHeight,
      thicknessStart: cornerPos,
      thicknessEnd: thickStart,
      resolvedOutside: {
        outsideDir: outsideDir < 0 ? -1 : 1,
        outsidePos: Math.max(retStart, retEnd),
      },
    };
  }

  if (wallType === 'portalLeft' || wallType === 'portalRight') {
    const retW = localWidth;
    const retStart = outsidePos;
    const retEnd = outsidePos + retW * (outsideDir < 0 ? 1 : -1);
    const isLeft = wallType === 'portalLeft';
    const opX = wallSegment.openingX ?? 0;
    const opW = wallSegment.openingWidth ?? 0;
    const portalEdgeL = lengthStart + (isLeft ? opX : opX + opW);

    return {
      lengthAxis: axes.thickness,
      heightAxis: axes.height,
      thicknessAxis: axes.length,
      lengthStart: Math.min(retStart, retEnd),
      lengthEnd: Math.max(retStart, retEnd),
      heightStart: heightStart + (wallSegment.openingY ?? 0),
      heightEnd: heightStart + (wallSegment.openingY ?? 0) + localHeight,
      thicknessStart: portalEdgeL + sfTotal * (isLeft ? -1 : 1),
      thicknessEnd: portalEdgeL,
      resolvedOutside: {
        outsideDir: isLeft ? 1 : -1,
        outsidePos: Math.min(retStart, retEnd),
      },
    };
  }

  return null;
}

export function decomposeConcreteProjectionWalls(groupId, visibleFaces, sfTotalThickness = 196) {
  const segments = [];

  for (const vf of visibleFaces) {
    if (vf.visibility === 'HIDDEN') continue;
    if (vf.faceType === 'front' && vf.visibility !== 'OUTSIDE') continue;
    if ((vf.faceType === 'side-left' || vf.faceType === 'side-right') && vf.visibility !== 'RETURN_FACE') continue;
    if ((vf.faceType === 'portal-left' || vf.faceType === 'portal-right') && vf.visibility !== 'RETURN_FACE') continue;

    const wallType = visibleFaceToWallType(vf.faceType);
    if (!wallType) continue;

    const wallThick = vf.wallThickness ?? 250;
    const lengthTotal = Math.abs((vf.lengthEnd ?? vf.lengthStart) - vf.lengthStart);
    const heightTotal = Math.abs(vf.heightEnd - vf.heightStart);

    let localWidth, localHeight;

    if (wallType === 'front') {
      localWidth = lengthTotal;
      localHeight = heightTotal;
    } else if (wallType === 'leftReturn' || wallType === 'rightReturn') {
      localWidth = Math.max(0, wallThick - sfTotalThickness);
      localHeight = heightTotal;
    } else {
      localWidth = Math.max(0, wallThick - sfTotalThickness);
      localHeight = vf.openingHeight ?? 0;
    }

    if (localWidth < MIN_RETURN_WIDTH_MM || localHeight < MIN_WALL_HEIGHT_MM) continue;

    const segId = wallSegId(groupId, vf.faceType, vf.wallId);

    const segment = {
      wallSegId: segId,
      parentGroupId: groupId,
      sourceWallId: vf.wallId,
      faceType: vf.faceType,
      wallType,
      localWidth,
      localHeight,
      wallThickness: wallThick,
      sfTotalThickness,
      sourceFaceWidth: lengthTotal,
      axes: vf.axes,
      localAxes: vf.localAxes,
      outsideDir: vf.outsideDir,
      outsidePos: vf.outsidePos,
      lengthStart: vf.lengthStart,
      lengthEnd: vf.lengthEnd ?? (vf.lengthStart + lengthTotal),
      heightStart: vf.heightStart,
      heightEnd: vf.heightEnd ?? (vf.heightStart + heightTotal),
      openings: vf.openings ?? [],
      openingX: vf.openingX ?? null,
      openingY: vf.openingY ?? null,
      openingWidth: vf.openingWidth ?? null,
      openingHeight: vf.openingHeight ?? null,
    };

    segment.syntheticWallOrigin = createSyntheticWallOrigin(segment);

    segments.push(segment);
  }

  return segments;
}

export function buildWallConnectionGraph(segments) {
  const connections = [];
  const seen = new Set();

  const byWall = {};
  for (const seg of segments) {
    if (!byWall[seg.sourceWallId]) byWall[seg.sourceWallId] = [];
    byWall[seg.sourceWallId].push(seg);
  }

  for (const wallSegs of Object.values(byWall)) {
    const front = wallSegs.find((s) => s.wallType === 'front');
    const returns = wallSegs.filter((s) => s.wallType !== 'front');

    for (const ret of returns) {
      const key = [front?.wallSegId ?? '', ret.wallSegId].sort().join('::');
      if (seen.has(key)) continue;
      seen.add(key);

      const prioA = WALL_TYPE_PRIORITY[front?.wallType ?? 'front'] ?? 0;
      const prioB = WALL_TYPE_PRIORITY[ret.wallType] ?? 0;
      const cornerOwner = prioA >= prioB ? (front?.wallSegId ?? ret.wallSegId) : ret.wallSegId;

      let connectionType = 'RETURN';
      if (ret.wallType === 'portalLeft' || ret.wallType === 'portalRight') connectionType = 'PORTAL';

      const hStart = Math.max(front?.heightStart ?? 0, ret.heightStart);
      const hEnd = Math.min(
        front ? (front.heightStart + front.localHeight) : Infinity,
        ret.heightStart + ret.localHeight
      );

      connections.push({
        wallAId: front?.wallSegId ?? null,
        wallBId: ret.wallSegId,
        connectionType,
        cornerOwner,
        wallAType: front?.wallType ?? null,
        wallBType: ret.wallType,
        sharedEdge: {
          hStart,
          hEnd,
          side: ret.wallType,
        },
      });
    }
  }

  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const sA = segments[i];
      const sB = segments[j];
      if (sA.sourceWallId === sB.sourceWallId) continue;
      if (sA.axes.height !== sB.axes.height) continue;

      const hOverlap = Math.min(sA.heightStart + sA.localHeight, sB.heightStart + sB.localHeight)
        - Math.max(sA.heightStart, sB.heightStart);
      if (hOverlap < 50) continue;

      const key = [sA.wallSegId, sB.wallSegId].sort().join('::');
      if (seen.has(key)) continue;

      const axA = sA.faceType === 'front' ? sA.axes.length : sA.axes.thickness;
      const axB = sB.faceType === 'front' ? sB.axes.length : sB.axes.thickness;
      if (axA !== sB.axes.thickness && axA !== sB.axes.length) continue;

      seen.add(key);

      const prioA = WALL_TYPE_PRIORITY[sA.wallType] ?? 0;
      const prioB = WALL_TYPE_PRIORITY[sB.wallType] ?? 0;

      connections.push({
        wallAId: sA.wallSegId,
        wallBId: sB.wallSegId,
        connectionType: 'OUTSIDE_CORNER',
        cornerOwner: prioA >= prioB ? sA.wallSegId : sB.wallSegId,
        wallAType: sA.wallType,
        wallBType: sB.wallType,
        sharedEdge: {
          hStart: Math.max(sA.heightStart, sB.heightStart),
          hEnd: Math.min(sA.heightStart + sA.localHeight, sB.heightStart + sB.localHeight),
        },
      });
    }
  }

  return connections;
}

export function decomposeAndConnect(groupId, visibleFaces, sfTotalThickness = 196) {
  const segments = decomposeConcreteProjectionWalls(groupId, visibleFaces, sfTotalThickness);
  const connections = buildWallConnectionGraph(segments);

  const frontSeg = segments.find((s) => s.wallType === 'front');
  const returnSegs = segments.filter((s) => s.wallType === 'leftReturn' || s.wallType === 'rightReturn');
  const portalSegs = segments.filter((s) => s.wallType === 'portalLeft' || s.wallType === 'portalRight');

  return {
    segments,
    connections,
    frontWall: frontSeg ?? null,
    returnWalls: returnSegs,
    portalWalls: portalSegs,
    hasFront: !!frontSeg,
    hasReturns: returnSegs.length > 0,
    hasPortals: portalSegs.length > 0,
  };
}

const PRIMARY_WALL_TYPES = new Set(['front', 'leftReturn', 'rightReturn', 'portalLeft', 'portalRight']);

export function getPrimaryWallSegments(wallDecomposition) {
  if (!wallDecomposition?.segments) return [];
  return wallDecomposition.segments.filter((s) => PRIMARY_WALL_TYPES.has(s.wallType));
}

export function wallSegmentToSlimFortFaceDescriptor(seg) {
  return {
    faceId: seg.wallSegId,
    faceType: seg.faceType,
    wallId: seg.sourceWallId,
    width: seg.localWidth,
    height: seg.localHeight,
    cornerOffset: seg.wallType === 'front' ? 0 : seg.sfTotalThickness,
    axes: seg.axes,
    localAxes: seg.localAxes,
    outsideDir: seg.outsideDir,
    outsidePos: seg.outsidePos,
    lengthStart: seg.lengthStart,
    lengthEnd: seg.lengthEnd,
    heightStart: seg.heightStart,
    openings: seg.openings,
    openingX: seg.openingX,
    openingY: seg.openingY,
    openingWidth: seg.openingWidth,
    openingHeight: seg.openingHeight,
    syntheticWallOrigin: seg.syntheticWallOrigin,
  };
}
