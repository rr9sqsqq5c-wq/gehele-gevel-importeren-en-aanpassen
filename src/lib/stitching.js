import { computeProductionData } from './production.js';

const STITCH_TOL = 30;

function segOverlap(a0, a1, b0, b1, tol = STITCH_TOL) {
  return a0 < b1 + tol && a1 > b0 - tol;
}

function segOverlapLen(a0, a1, b0, b1) {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

function faceHEnd(face) {
  return face.heightStart + face.height;
}

function faceLEnd(face) {
  return face.lengthEnd ?? face.lengthStart + face.width;
}

function edgeKey(idA, idB) {
  return [idA, idB].sort().join('::');
}

export function buildFaceAdjacencyGraph(faces) {
  const byWall = {};
  for (const face of faces) {
    if (!byWall[face.wallId]) byWall[face.wallId] = [];
    byWall[face.wallId].push(face);
  }

  const nodeMap = new Map(faces.map((f) => [f.faceId, { face: f, neighbors: [] }]));

  function link(fA, fB, edgeType, sharedEdge) {
    const nA = nodeMap.get(fA.faceId);
    const nB = nodeMap.get(fB.faceId);
    if (!nA || !nB) return;
    if (!nA.neighbors.some((n) => n.faceId === fB.faceId)) {
      nA.neighbors.push({ faceId: fB.faceId, edgeType, sharedEdge });
    }
    if (!nB.neighbors.some((n) => n.faceId === fA.faceId)) {
      nB.neighbors.push({ faceId: fA.faceId, edgeType: edgeType + '-rev', sharedEdge });
    }
  }

  for (const [, wallFaces] of Object.entries(byWall)) {
    const front = wallFaces.find((f) => f.faceType === 'front');
    if (!front) continue;

    const sideL = wallFaces.find((f) => f.faceType === 'side-left');
    const sideR = wallFaces.find((f) => f.faceType === 'side-right');

    const fHEnd = faceHEnd(front);
    const fLEnd = faceLEnd(front);

    if (sideL) {
      const sHEnd = faceHEnd(sideL);
      const overlapH = segOverlapLen(front.heightStart, fHEnd, sideL.heightStart, sHEnd);
      if (overlapH > STITCH_TOL) {
        link(front, sideL, 'left-corner', {
          axis: 'vertical',
          worldLPos: front.lengthStart,
          hStart: Math.max(front.heightStart, sideL.heightStart),
          hEnd: Math.min(fHEnd, sHEnd),
          angle: 90,
        });
      }
    }

    if (sideR) {
      const sHEnd = faceHEnd(sideR);
      const overlapH = segOverlapLen(front.heightStart, fHEnd, sideR.heightStart, sHEnd);
      if (overlapH > STITCH_TOL) {
        link(front, sideR, 'right-corner', {
          axis: 'vertical',
          worldLPos: fLEnd,
          hStart: Math.max(front.heightStart, sideR.heightStart),
          hEnd: Math.min(fHEnd, sHEnd),
          angle: 90,
        });
      }
    }

    const portals = wallFaces.filter((f) => f.faceType === 'portal-left' || f.faceType === 'portal-right');
    for (const p of portals) {
      const pHStart = p.heightStart + (p.openingY ?? 0);
      const pHEnd = pHStart + p.height;
      const opEdgeL = p.faceType === 'portal-left'
        ? front.lengthStart + (p.openingX ?? 0)
        : front.lengthStart + (p.openingX ?? 0) + (p.openingWidth ?? 0);
      link(front, p, p.faceType === 'portal-left' ? 'portal-left-corner' : 'portal-right-corner', {
        axis: 'vertical',
        worldLPos: opEdgeL,
        hStart: pHStart,
        hEnd: pHEnd,
        angle: 90,
      });
    }
  }

  const fronts = faces.filter((f) => f.faceType === 'front');
  const sides = faces.filter((f) => f.faceType === 'side-left' || f.faceType === 'side-right');

  for (const side of sides) {
    const sAxes = side.axes;
    const sEdge = side.faceType === 'side-left' ? side.lengthStart : faceLEnd(side);

    for (const front of fronts) {
      if (front.wallId === side.wallId) continue;
      const fAxes = front.axes;
      if (fAxes.thickness !== sAxes.length) continue;
      if (fAxes.length !== sAxes.thickness) continue;
      if (fAxes.height !== sAxes.height) continue;

      const fLStart = front.lengthStart;
      const fLEndV = faceLEnd(front);
      const atStart = Math.abs(sEdge - fLStart) <= STITCH_TOL;
      const atEnd = Math.abs(sEdge - fLEndV) <= STITCH_TOL;
      if (!atStart && !atEnd) continue;

      const overlapH = segOverlapLen(side.heightStart, faceHEnd(side), front.heightStart, faceHEnd(front));
      if (overlapH < STITCH_TOL) continue;

      link(side, front, atStart ? 'cross-wall-left' : 'cross-wall-right', {
        axis: 'cross-wall',
        worldLPos: sEdge,
        hStart: Math.max(side.heightStart, front.heightStart),
        hEnd: Math.min(faceHEnd(side), faceHEnd(front)),
        angle: 90,
      });
    }
  }

  return faces.map((f) => {
    const node = nodeMap.get(f.faceId);
    return { ...f, neighbors: node ? node.neighbors : [] };
  });
}

const FACE_PRIORITY = { front: 3, 'side-left': 2, 'side-right': 2, 'portal-left': 1, 'portal-right': 1 };

export function buildCornerOwnershipMap(stitchedFaces) {
  const faceMap = Object.fromEntries(stitchedFaces.map((f) => [f.faceId, f]));
  const corners = {};

  for (const face of stitchedFaces) {
    for (const nb of face.neighbors ?? []) {
      const key = edgeKey(face.faceId, nb.faceId);
      if (corners[key]) continue;
      const nbFace = faceMap[nb.faceId];
      const pA = FACE_PRIORITY[face.faceType] ?? 0;
      const pB = FACE_PRIORITY[nbFace?.faceType] ?? 0;
      corners[key] = {
        ownerFaceId: pA >= pB ? face.faceId : nb.faceId,
        secondaryFaceId: pA >= pB ? nb.faceId : face.faceId,
        edgeType: nb.edgeType,
        sharedEdge: nb.sharedEdge,
      };
    }
  }

  return corners;
}

export function routeContinuousProfiles(stitchedFaces) {
  const faceMap = Object.fromEntries(stitchedFaces.map((f) => [f.faceId, f]));
  const routes = [];
  const seen = new Set();

  for (const face of stitchedFaces) {
    if (!face.grid) continue;
    const fps = (face.grid.profiles ?? []).filter((p) => p.richting === 'horizontaal');

    for (const nb of face.neighbors ?? []) {
      const key = edgeKey(face.faceId, nb.faceId);
      if (seen.has(key)) continue;
      seen.add(key);

      const nbFace = faceMap[nb.faceId];
      if (!nbFace?.grid) continue;
      const nbps = (nbFace.grid.profiles ?? []).filter((p) => p.richting === 'horizontaal');

      for (const pA of fps) {
        const worldY_A = face.heightStart + (pA.y ?? 0) + (pA.height ?? 0) / 2;
        for (const pB of nbps) {
          const worldY_B = nbFace.heightStart + (pB.y ?? 0) + (pB.height ?? 0) / 2;
          if (Math.abs(worldY_A - worldY_B) < 30) {
            routes.push({
              routeId: `r-${face.faceId}-${nb.faceId}-y${Math.round(worldY_A)}`,
              worldY: worldY_A,
              faceIdA: face.faceId,
              faceIdB: nb.faceId,
              profileA: pA,
              profileB: pB,
              sharedEdge: nb.sharedEdge,
            });
          }
        }
      }
    }
  }

  return routes;
}

export function buildPortalShellGroups(stitchedFaces) {
  const byWall = {};
  for (const f of stitchedFaces) {
    if (!byWall[f.wallId]) byWall[f.wallId] = [];
    byWall[f.wallId].push(f);
  }

  const groups = [];

  for (const [wallId, wFaces] of Object.entries(byWall)) {
    const front = wFaces.find((f) => f.faceType === 'front');
    const portals = wFaces.filter((f) => f.faceType === 'portal-left' || f.faceType === 'portal-right');
    if (!portals.length) continue;

    const byOpening = {};
    for (const p of portals) {
      const k = `${Math.round(p.openingX ?? 0)}-${Math.round(p.openingY ?? 0)}-${Math.round(p.openingWidth ?? 0)}`;
      if (!byOpening[k]) byOpening[k] = [];
      byOpening[k].push(p);
    }

    for (const [k, ps] of Object.entries(byOpening)) {
      const pL = ps.find((p) => p.faceType === 'portal-left');
      const pR = ps.find((p) => p.faceType === 'portal-right');
      const ref = pL ?? pR;
      groups.push({
        groupId: `pshell-${wallId}-${k}`,
        wallId,
        frontFaceId: front?.faceId ?? null,
        portalLeftFaceId: pL?.faceId ?? null,
        portalRightFaceId: pR?.faceId ?? null,
        openingX: ref?.openingX ?? 0,
        openingY: ref?.openingY ?? 0,
        openingWidth: ref?.openingWidth ?? 0,
        openingHeight: ref?.openingHeight ?? 0,
      });
    }
  }

  return groups;
}

export function computeFaceStitchTransforms(stitchedFaces) {
  const transforms = [];

  for (const face of stitchedFaces) {
    for (const nb of face.neighbors ?? []) {
      const key = edgeKey(face.faceId, nb.faceId);
      const { edgeType, sharedEdge } = nb;
      if (!sharedEdge) continue;

      const isCorner90 = edgeType.includes('corner') || edgeType.includes('cross-wall');
      if (!isCorner90) continue;

      transforms.push({
        edgeKey: key,
        fromFaceId: face.faceId,
        toFaceId: nb.faceId,
        edgeType,
        sharedEdge,
        rotation: 90,
        worldEdgeStart: { h: sharedEdge.hStart, l: sharedEdge.worldLPos },
        worldEdgeEnd: { h: sharedEdge.hEnd, l: sharedEdge.worldLPos },
      });
    }
  }

  const seen = new Set();
  return transforms.filter((t) => {
    if (seen.has(t.edgeKey)) return false;
    seen.add(t.edgeKey);
    return true;
  });
}

export function buildSlimFortShells(stitchedFaces, cornerOwnershipMap, profileRoutes, portalGroups) {
  const faceMap = Object.fromEntries(stitchedFaces.map((f) => [f.faceId, f]));
  const visited = new Set();
  const shells = [];

  for (const face of stitchedFaces) {
    if (visited.has(face.faceId)) continue;

    const shellFaces = [];
    const queue = [face];
    while (queue.length) {
      const cur = queue.shift();
      if (visited.has(cur.faceId)) continue;
      visited.add(cur.faceId);
      shellFaces.push(cur);
      for (const nb of cur.neighbors ?? []) {
        if (!visited.has(nb.faceId) && faceMap[nb.faceId]) {
          queue.push(faceMap[nb.faceId]);
        }
      }
    }

    const shellFaceIds = new Set(shellFaces.map((f) => f.faceId));

    const stitchedEdges = Object.entries(cornerOwnershipMap)
      .filter(([, c]) => shellFaceIds.has(c.ownerFaceId) || shellFaceIds.has(c.secondaryFaceId))
      .map(([k, c]) => ({ ...c, edgeKey: k }));

    const shellRoutes = profileRoutes.filter(
      (r) => shellFaceIds.has(r.faceIdA) || shellFaceIds.has(r.faceIdB)
    );

    const shellPortals = portalGroups.filter(
      (pg) => pg.frontFaceId && shellFaceIds.has(pg.frontFaceId)
    );

    shells.push({
      shellId: `shell-${shellFaces[0]?.faceId ?? shells.length}`,
      faces: shellFaces,
      stitchedEdges,
      profileRoutes: shellRoutes,
      portalGroups: shellPortals,
    });
  }

  return shells;
}

export function computeGroupStitching(slimFortFaces, productionSettings = {}) {
  if (!slimFortFaces || slimFortFaces.length === 0) return null;

  const withNeighbors = buildFaceAdjacencyGraph(slimFortFaces);
  const cornerOwnership = buildCornerOwnershipMap(withNeighbors);
  const profileRoutes = routeContinuousProfiles(withNeighbors);
  const portalGroups = buildPortalShellGroups(withNeighbors);
  const stitchTransforms = computeFaceStitchTransforms(withNeighbors);
  const shells = buildSlimFortShells(withNeighbors, cornerOwnership, profileRoutes, portalGroups);

  const stitchingResult = {
    faces: withNeighbors,
    cornerOwnership,
    profileRoutes,
    portalGroups,
    stitchTransforms,
    shells,
  };

  const production = computeProductionData(stitchingResult, productionSettings);

  return { ...stitchingResult, production };
}
