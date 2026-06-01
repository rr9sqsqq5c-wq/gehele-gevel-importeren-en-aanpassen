import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { generateSlimFortGrid, SLIMFORT_DEFAULTS, getSlimFortDepths, CONCRETE_FACE_CLADDING_DEFAULTS, computeFaceLongRanges } from './lib/slimfort.js';

function checkWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!ctx) return false;
    const ext = ctx.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
    return true;
  } catch {
    return false;
  }
}
const WEBGL_AVAILABLE = checkWebGL();

function CameraAccessor({ cameraRef }) {
  const { camera } = useThree();
  cameraRef.current = camera;
  return null;
}

function ifcToThree(ifcX, ifcY, ifcZ) {
  return [ifcX / 1000, ifcY / 1000, ifcZ / 1000];
}

/**
 * Bouw de IFC→Three.js transformatiematrix uit de projecttransformatie.
 * M = Ry(trueNorthAngle) * Rx(-90°)
 * ifcToThree() handelt de mm→m schaling al af.
 */
function buildProjectMatrix(projectTransform) {
  const [tn_x, tn_y] = projectTransform?.trueNorth ?? [0, 1];
  const trueNorthAngle = Math.atan2(tn_x, tn_y);
  const Rx = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  const Ry = new THREE.Matrix4().makeRotationY(trueNorthAngle);
  return new THREE.Matrix4().multiplyMatrices(Ry, Rx);
}

function applyMatrix(mat, x, y, z) {
  const v = new THREE.Vector3(x, y, z).applyMatrix4(mat);
  return [v.x, v.y, v.z];
}

function getWallBox(wall) {
  const wo = wall.wallOrigin;
  if (!wo) return null;

  const ifc = { x: 0, y: 0, z: 0 };
  ifc[wo.lengthAxis] = wo.lengthStart + wall.length / 2;
  ifc[wo.heightAxis] = wo.heightStart + wall.height / 2;
  const thickness = Math.max(50, Math.abs((wo.thicknessEnd ?? wo.thicknessStart + 200) - wo.thicknessStart));
  ifc[wo.thicknessAxis] = wo.thicknessStart + thickness / 2;

  const dims = { x: 0.05, y: 0.05, z: 0.05 };
  dims[wo.lengthAxis] = wall.length;
  dims[wo.heightAxis] = wall.height;
  dims[wo.thicknessAxis] = thickness;

  return {
    pos: ifcToThree(ifc.x, ifc.y, ifc.z),
    size: ifcToThree(dims.x, dims.y, dims.z).map(Math.abs),
    wo,
    thickness,
  };
}

function getBrickPos(wall, pieceStart, pieceLen, rowY, steenH, brickD) {
  const wo = wall.wallOrigin;
  const ifc = { x: 0, y: 0, z: 0 };
  const tStart = wo.thicknessStart;
  const tEnd = wo.thicknessEnd ?? wo.thicknessStart + 200;
  const outsidePos = wo.resolvedOutside?.outsidePos ?? (tEnd > tStart ? tEnd : tStart);
  const outsideDir = wo.resolvedOutside?.outsideDir ?? (tEnd > tStart ? 1 : -1);

  ifc[wo.lengthAxis] = wo.lengthStart + pieceStart + pieceLen / 2;
  ifc[wo.heightAxis] = wo.heightStart + rowY + steenH / 2;
  ifc[wo.thicknessAxis] = outsidePos + outsideDir * brickD / 2;

  const brickDims = { x: 0.01, y: 0.01, z: 0.01 };
  brickDims[wo.lengthAxis] = pieceLen;
  brickDims[wo.heightAxis] = steenH;
  brickDims[wo.thicknessAxis] = brickD;

  return {
    pos: ifcToThree(ifc.x, ifc.y, ifc.z),
    size: ifcToThree(brickDims.x, brickDims.y, brickDims.z).map(Math.abs),
  };
}

function getOutsideFaceInfo(rwo, allWalls) {
  const tStart = rwo.thicknessStart;
  const tEnd = rwo.thicknessEnd ?? rwo.thicknessStart + 200;

  if (rwo.resolvedOutside) {
    return { outsidePos: rwo.resolvedOutside.outsidePos, outsideDir: rwo.resolvedOutside.outsideDir };
  }

  const axis = rwo.thicknessAxis;

  const wallsOnAxis = (allWalls ?? []).filter((w) => w.wallOrigin?.thicknessAxis === axis);
  const buildingMin = wallsOnAxis.length
    ? Math.min(...wallsOnAxis.map((w) => w.wallOrigin.thicknessStart))
    : tStart;
  const buildingMax = wallsOnAxis.length
    ? Math.max(...wallsOnAxis.map((w) => w.wallOrigin.thicknessEnd ?? w.wallOrigin.thicknessStart + 200))
    : tEnd;
  const buildingCenter_t = (buildingMin + buildingMax) / 2;
  const wallCenter_t = (tStart + tEnd) / 2;

  if (rwo.wallLengthDir) {
    const upAxis = rwo.heightAxis ?? 'z';
    const gu = { x: upAxis === 'x' ? 1 : 0, y: upAxis === 'y' ? 1 : 0, z: upAxis === 'z' ? 1 : 0 };
    const ld = rwo.wallLengthDir;
    const cx = ld.y * gu.z - ld.z * gu.y;
    const cy = ld.z * gu.x - ld.x * gu.z;
    const cz = ld.x * gu.y - ld.y * gu.x;
    const clen = Math.sqrt(cx * cx + cy * cy + cz * cz);
    if (clen > 0.01) {
      const candidateA_t = (axis === 'x' ? cx : axis === 'y' ? cy : cz) / clen;
      const toOutside_t = wallCenter_t - buildingCenter_t;
      const outsideDir = (candidateA_t * toOutside_t >= 0)
        ? (Math.sign(candidateA_t) || 1)
        : -(Math.sign(candidateA_t) || 1);
      return { outsidePos: outsideDir < 0 ? tStart : tEnd, outsideDir };
    }
  }

  if (rwo.wallInsideThickDir && rwo.wallInsideThickDir !== 0) {
    const outsideDir = -rwo.wallInsideThickDir;
    return { outsidePos: outsideDir < 0 ? tStart : tEnd, outsideDir };
  }

  const distToMin = tStart - buildingMin;
  const distToMax = buildingMax - tEnd;
  return distToMin <= distToMax
    ? { outsidePos: tStart, outsideDir: -1 }
    : { outsidePos: tEnd, outsideDir: +1 };
}

function getPenantBoxes(penant, rwo, groupMinX, groupMinH, allWalls, latDikte, brickDepth = 20, panelDikte = 8, penantShift = 0, outsideDirFlip = false, materialStoot = 10) {
  if (!rwo) return [];
  const pX = penant.x ?? 0;
  const pB = Math.max(1, penant.breedte ?? 400);
  const pDL = Math.max(1, penant.diepteLinks  ?? penant.diepte ?? 150);
  const pDR = Math.max(1, penant.diepteRechts ?? penant.diepte ?? 150);
  const pH = Math.max(1, penant.hoogte ?? 2000);
  const ld = latDikte ?? 28;
  const penMinH = 0;

  const rawFace = getOutsideFaceInfo(rwo, allWalls);
  const outsidePos = rawFace.outsidePos;
  const outsideDir = outsideDirFlip ? -rawFace.outsideDir : rawFace.outsideDir;

  const stoot = penant.stoot ?? materialStoot;
  const panelT = panelDikte;
  const frontW  = Math.max(1, pB - 2 * brickDepth);
  const sideDL  = Math.max(1, pDL + brickDepth + stoot + panelT);
  const sideDR  = Math.max(1, pDR + brickDepth + stoot + panelT);

  const makeBox = (gxOff, depthCenter, boxW, boxThick) => {
    const ifc = { x: 0, y: 0, z: 0 };
    ifc[rwo.lengthAxis]    = groupMinX + gxOff;
    ifc[rwo.heightAxis]    = groupMinH + penMinH + pH / 2;
    ifc[rwo.thicknessAxis] = outsidePos + outsideDir * depthCenter;
    const dims = { x: 1, y: 1, z: 1 };
    dims[rwo.lengthAxis]    = boxW;
    dims[rwo.heightAxis]    = pH;
    dims[rwo.thicknessAxis] = boxThick;
    return {
      pos:  ifcToThree(ifc.x, ifc.y, ifc.z),
      size: ifcToThree(dims.x, dims.y, dims.z).map(Math.abs),
    };
  };

  const sh = penantShift;
  return [
    makeBox(pX + pB / 2,                              ld + sh - panelT / 2,          frontW, panelT),
    makeBox(pX + brickDepth + panelT / 2,             ld + sh - panelT - sideDL / 2, panelT, sideDL),
    makeBox(pX + pB - brickDepth - panelT / 2,        ld + sh - panelT - sideDR / 2, panelT, sideDR),
  ];
}

function PenantMesh3D({ penant, rwo, groupMinX, groupMinH, groupColor, allWalls, latDikte, brickDepth, panelDikte, penantShift = 0, outsideDirFlip = false, materialStoot = 10 }) {
  const boxes = useMemo(
    () => getPenantBoxes(penant, rwo, groupMinX, groupMinH, allWalls, latDikte, brickDepth, panelDikte, penantShift, outsideDirFlip, materialStoot),
    [penant, rwo, groupMinX, groupMinH, allWalls, latDikte, brickDepth, panelDikte, penantShift, outsideDirFlip, materialStoot]
  );
  const cornerBattens = useMemo(() => {
    if (!rwo) return [];
    const pX = penant.x ?? 0;
    const pB = Math.max(1, penant.breedte ?? 400);
    const pH = Math.max(1, penant.hoogte ?? 2000);
    const penMinH = 0;
    const sh = penantShift;
    const ld = latDikte;
    const panelT = panelDikte;
    const rawFace = getOutsideFaceInfo(rwo, allWalls);
    const outsidePos = rawFace.outsidePos;
    const outsideDir = outsideDirFlip ? -rawFace.outsideDir : rawFace.outsideDir;
    const depthBack  = ld + ld / 2;
    const depthFront = ld + sh - panelT - ld / 2;
    const xLeft  = pX + brickDepth + panelT + ld / 2;
    const xRight = pX + pB - brickDepth - panelT - ld / 2;
    return [
      [xLeft,  depthBack],
      [xRight, depthBack],
      [xLeft,  depthFront],
      [xRight, depthFront],
    ].map(([gxCenter, depthCenter]) => {
      const ifc = { x: 0, y: 0, z: 0 };
      ifc[rwo.lengthAxis]    = groupMinX + gxCenter;
      ifc[rwo.heightAxis]    = groupMinH + penMinH + pH / 2;
      ifc[rwo.thicknessAxis] = outsidePos + outsideDir * depthCenter;
      const dims = { x: 1, y: 1, z: 1 };
      dims[rwo.lengthAxis]    = ld;
      dims[rwo.heightAxis]    = pH;
      dims[rwo.thicknessAxis] = ld;
      return {
        pos:  ifcToThree(ifc.x, ifc.y, ifc.z),
        size: ifcToThree(dims.x, dims.y, dims.z).map(Math.abs),
      };
    });
  }, [penant, rwo, groupMinX, groupMinH, allWalls, latDikte, brickDepth, panelDikte, penantShift, outsideDirFlip]);

  if (!boxes.length) return null;
  return (
    <group>
      {boxes.map((box, i) => (
        <group key={i} position={box.pos}>
          <mesh>
            <boxGeometry args={box.size} />
            <meshStandardMaterial color="#94a3b8" transparent opacity={0.75} />
          </mesh>
          <mesh>
            <boxGeometry args={box.size} />
            <meshBasicMaterial color="#475569" wireframe />
          </mesh>
        </group>
      ))}
      {cornerBattens.map((box, i) => (
        <group key={`cb-${i}`} position={box.pos}>
          <mesh>
            <boxGeometry args={box.size} />
            <meshStandardMaterial color="#b45309" transparent opacity={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function getGroupBrickPos(rwo, groupMinX, groupMinH, pieceStart, pieceLen, rowY, steenH, brickD, allWalls, flipDir = false, depthFromFace = null) {
  const raw = getOutsideFaceInfo(rwo, allWalls);
  const outsidePos = raw.outsidePos;
  const outsideDir = flipDir ? -raw.outsideDir : raw.outsideDir;
  const ifc = { x: 0, y: 0, z: 0 };
  ifc[rwo.lengthAxis]    = groupMinX + pieceStart + pieceLen / 2;
  ifc[rwo.heightAxis]    = groupMinH + rowY + steenH / 2;
  ifc[rwo.thicknessAxis] = outsidePos + outsideDir * (depthFromFace !== null ? depthFromFace : brickD / 2);
  const dims = { x: 0.01, y: 0.01, z: 0.01 };
  dims[rwo.lengthAxis]    = pieceLen;
  dims[rwo.heightAxis]    = steenH;
  dims[rwo.thicknessAxis] = brickD;
  return {
    pos:  ifcToThree(ifc.x, ifc.y, ifc.z),
    size: ifcToThree(dims.x, dims.y, dims.z).map(Math.abs),
  };
}

function getPenantSideBrickPos(rwo, groupMinX, groupMinH, sideType, pX, pB, pieceStart, pieceLen, rowY, steenH, brickD, sideDepthOffset, allWalls, flipDir = false) {
  const raw = getOutsideFaceInfo(rwo, allWalls);
  const outsidePos = raw.outsidePos;
  const outsideDir = flipDir ? -raw.outsideDir : raw.outsideDir;
  const ifc = { x: 0, y: 0, z: 0 };
  ifc[rwo.lengthAxis]    = groupMinX + (sideType === 'left' ? pX + brickD / 2 : pX + pB - brickD / 2);
  ifc[rwo.heightAxis]    = groupMinH + rowY + steenH / 2;
  ifc[rwo.thicknessAxis] = outsidePos + outsideDir * (sideDepthOffset + pieceStart + pieceLen / 2);
  const dims = { x: 0.01, y: 0.01, z: 0.01 };
  dims[rwo.lengthAxis]    = brickD;
  dims[rwo.heightAxis]    = steenH;
  dims[rwo.thicknessAxis] = pieceLen;
  return {
    pos:  ifcToThree(ifc.x, ifc.y, ifc.z),
    size: ifcToThree(dims.x, dims.y, dims.z).map(Math.abs),
  };
}

function getSlimFortElemBoxAt(rwo, groupMinX, groupMinH, x, y, width, height, depthStart, depthLen, outsideDir, outsidePos) {
  const ifc = { x: 0, y: 0, z: 0 };
  ifc[rwo.lengthAxis]    = groupMinX + x + width / 2;
  ifc[rwo.heightAxis]    = groupMinH + y + height / 2;
  ifc[rwo.thicknessAxis] = outsidePos + outsideDir * (depthStart + depthLen / 2);
  const dims = { x: 0.01, y: 0.01, z: 0.01 };
  dims[rwo.lengthAxis]    = width;
  dims[rwo.heightAxis]    = height;
  dims[rwo.thicknessAxis] = depthLen;
  return {
    pos:  ifcToThree(ifc.x, ifc.y, ifc.z),
    size: ifcToThree(dims.x, dims.y, dims.z).map(Math.abs),
  };
}

function getSlimFortElemBox(rwo, groupMinX, groupMinH, x, y, width, height, depthStart, depthLen, allWalls, flipDir) {
  const raw = getOutsideFaceInfo(rwo, allWalls);
  const outsideDir = flipDir ? -raw.outsideDir : raw.outsideDir;
  const outsidePos = raw.outsidePos;
  const ifc = { x: 0, y: 0, z: 0 };
  ifc[rwo.lengthAxis]    = groupMinX + x + width / 2;
  ifc[rwo.heightAxis]    = groupMinH + y + height / 2;
  ifc[rwo.thicknessAxis] = outsidePos + outsideDir * (depthStart + depthLen / 2);
  const dims = { x: 0.01, y: 0.01, z: 0.01 };
  dims[rwo.lengthAxis]    = width;
  dims[rwo.heightAxis]    = height;
  dims[rwo.thicknessAxis] = depthLen;
  return {
    pos:  ifcToThree(ifc.x, ifc.y, ifc.z),
    size: ifcToThree(dims.x, dims.y, dims.z).map(Math.abs),
  };
}

function getSlimFortSideFaceElemBox(rwo, groupMinX, groupMinH, groupWidth, faceType, cornerOffset, localX, localY, localW, localH, depthStart, depthLen, allWalls, flipDir) {
  const raw = getOutsideFaceInfo(rwo, allWalls);
  const outsideDir = flipDir ? -raw.outsideDir : raw.outsideDir;
  const outsidePos = raw.outsidePos;
  const ifc = { x: 0, y: 0, z: 0 };
  const dims = { x: 0.01, y: 0.01, z: 0.01 };
  ifc[rwo.thicknessAxis] = outsidePos + outsideDir * (cornerOffset + localX + localW / 2);
  dims[rwo.thicknessAxis] = localW;
  ifc[rwo.heightAxis] = groupMinH + localY + localH / 2;
  dims[rwo.heightAxis] = localH;
  if (faceType === 'side-left') {
    ifc[rwo.lengthAxis] = groupMinX - (depthStart + depthLen / 2);
  } else if (faceType === 'side-right') {
    ifc[rwo.lengthAxis] = groupMinX + groupWidth + (depthStart + depthLen / 2);
  } else if (faceType === 'portal-left') {
    ifc[rwo.lengthAxis] = groupMinX - (depthStart + depthLen / 2);
  } else if (faceType === 'portal-right') {
    ifc[rwo.lengthAxis] = groupMinX + groupWidth + (depthStart + depthLen / 2);
  }
  dims[rwo.lengthAxis] = depthLen;
  return {
    pos:  ifcToThree(ifc.x, ifc.y, ifc.z),
    size: ifcToThree(dims.x, dims.y, dims.z).map(Math.abs),
  };
}

function getSlimFortPortalFaceElemBox(rwo, groupMinX, groupMinH, faceType, cornerOffset, openingX, openingY, openingWidth, localX, localY, localW, localH, depthStart, depthLen, allWalls, flipDir) {
  const raw = getOutsideFaceInfo(rwo, allWalls);
  const outsideDir = flipDir ? -raw.outsideDir : raw.outsideDir;
  const outsidePos = raw.outsidePos;
  const ifc = { x: 0, y: 0, z: 0 };
  const dims = { x: 0.01, y: 0.01, z: 0.01 };
  ifc[rwo.thicknessAxis] = outsidePos + outsideDir * (cornerOffset + localX + localW / 2);
  dims[rwo.thicknessAxis] = localW;
  ifc[rwo.heightAxis] = groupMinH + openingY + localY + localH / 2;
  dims[rwo.heightAxis] = localH;
  if (faceType === 'portal-left') {
    ifc[rwo.lengthAxis] = groupMinX + openingX - (depthStart + depthLen / 2);
  } else {
    ifc[rwo.lengthAxis] = groupMinX + openingX + openingWidth + (depthStart + depthLen / 2);
  }
  dims[rwo.lengthAxis] = depthLen;
  return {
    pos:  ifcToThree(ifc.x, ifc.y, ifc.z),
    size: ifcToThree(dims.x, dims.y, dims.z).map(Math.abs),
  };
}

function getReturnFaceBrickPos(rwo, groupMinX, groupMinH, groupWidth, wallType, pieceStart, pieceLen, rowY, steenH, brickD, sfDepthOffset, brickCenterDepth, allWalls, flipDir) {
  const raw = getOutsideFaceInfo(rwo, allWalls);
  const outsidePos = raw.outsidePos;
  const outsideDir = flipDir ? -raw.outsideDir : raw.outsideDir;
  const ifc = { x: 0, y: 0, z: 0 };
  const dims = { x: 0.01, y: 0.01, z: 0.01 };
  ifc[rwo.thicknessAxis] = outsidePos + outsideDir * (sfDepthOffset + pieceStart + pieceLen / 2);
  dims[rwo.thicknessAxis] = pieceLen;
  ifc[rwo.heightAxis] = groupMinH + rowY + steenH / 2;
  dims[rwo.heightAxis] = steenH;
  if (wallType === 'leftReturn') {
    ifc[rwo.lengthAxis] = groupMinX - brickCenterDepth;
  } else {
    ifc[rwo.lengthAxis] = groupMinX + groupWidth + brickCenterDepth;
  }
  dims[rwo.lengthAxis] = brickD;
  return {
    pos: ifcToThree(ifc.x, ifc.y, ifc.z),
    size: ifcToThree(dims.x, dims.y, dims.z).map(Math.abs),
  };
}

function SlimFortStitchDebug3D({ groupPattern }) {
  const lines = useMemo(() => {
    const stitching = groupPattern?.slimFortStitching;
    if (!stitching) return null;
    const { stitchTransforms = [], profileRoutes = [] } = stitching;

    const edgeVerts = [];
    for (const tr of stitchTransforms) {
      if (!tr.sharedEdge) continue;
      const { worldLPos, hStart, hEnd } = tr.sharedEdge;
      const face = stitching.faces?.find((f) => f.faceId === tr.fromFaceId);
      if (!face) continue;
      const axes = face.axes;
      if (!axes) continue;
      const outsidePos = face.outsidePos ?? 0;

      const p0 = { x: 0, y: 0, z: 0 };
      const p1 = { x: 0, y: 0, z: 0 };
      p0[axes.length] = worldLPos / 1000;
      p1[axes.length] = worldLPos / 1000;
      p0[axes.height] = hStart / 1000;
      p1[axes.height] = hEnd / 1000;
      p0[axes.thickness] = outsidePos / 1000;
      p1[axes.thickness] = outsidePos / 1000;

      const a = ifcToThree(p0.x * 1000, p0.y * 1000, p0.z * 1000);
      const b = ifcToThree(p1.x * 1000, p1.y * 1000, p1.z * 1000);
      edgeVerts.push(...a, ...b);
    }

    const routeVerts = [];
    for (const route of profileRoutes) {
      if (!route.sharedEdge) continue;
      const face = stitching.faces?.find((f) => f.faceId === route.faceIdA);
      if (!face?.axes) continue;
      const axes = face.axes;
      const outsidePos = face.outsidePos ?? 0;
      const wY = route.worldY;
      const wL = route.sharedEdge.worldLPos ?? 0;

      const p0 = { x: 0, y: 0, z: 0 };
      const p1 = { x: 0, y: 0, z: 0 };
      p0[axes.height] = wY / 1000;
      p1[axes.height] = wY / 1000;
      p0[axes.length] = (wL - 50) / 1000;
      p1[axes.length] = (wL + 50) / 1000;
      p0[axes.thickness] = outsidePos / 1000;
      p1[axes.thickness] = outsidePos / 1000;

      const a = ifcToThree(p0.x * 1000, p0.y * 1000, p0.z * 1000);
      const b = ifcToThree(p1.x * 1000, p1.y * 1000, p1.z * 1000);
      routeVerts.push(...a, ...b);
    }

    return { edgeVerts, routeVerts };
  }, [groupPattern]);

  if (!lines) return null;
  const { edgeVerts, routeVerts } = lines;

  return (
    <group>
      {edgeVerts.length > 0 && (
        <lineSegments renderOrder={10}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" array={new Float32Array(edgeVerts)} count={edgeVerts.length / 3} itemSize={3} />
          </bufferGeometry>
          <lineBasicMaterial color="#f97316" linewidth={2} depthTest={false} />
        </lineSegments>
      )}
      {routeVerts.length > 0 && (
        <lineSegments renderOrder={11}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" array={new Float32Array(routeVerts)} count={routeVerts.length / 3} itemSize={3} />
          </bufferGeometry>
          <lineBasicMaterial color="#06b6d4" linewidth={1} depthTest={false} />
        </lineSegments>
      )}
    </group>
  );
}

function WallDecompositionDebug3D({ groupPattern }) {
  const debugData = useMemo(() => {
    const wd = groupPattern?.wallDecomposition;
    if (!wd?.segments?.length) return null;

    const segColors = { front: '#22c55e', leftReturn: '#8b5cf6', rightReturn: '#ec4899' };
    const PORTAL_TYPES_3D = new Set(['portalLeft', 'portalRight']);

    function mkIfc(axes, l, h, t) {
      const p = { x: 0, y: 0, z: 0 };
      p[axes.length] = l;
      p[axes.height] = h;
      p[axes.thickness] = t;
      return p;
    }

    function ptToThree(p) {
      return ifcToThree(p.x, p.y, p.z);
    }

    const segmentLines = [];
    const labels = [];

    for (const seg of wd.segments) {
      const { axes, outsideDir, outsidePos, lengthStart, heightStart, localWidth, localHeight, wallType } = seg;
      const hEnd = heightStart + localHeight;
      const depthSign = outsideDir < 0 ? 1 : -1;
      const isPortal3D = PORTAL_TYPES_3D.has(wallType);
      const color = isPortal3D ? '#6b7280' : (segColors[wallType] ?? '#94a3b8');
      let corners = null;
      let labelPt = null;

      if (wallType === 'front') {
        const lEnd = seg.lengthEnd ?? (lengthStart + localWidth);
        corners = [
          mkIfc(axes, lengthStart, heightStart, outsidePos),
          mkIfc(axes, lEnd, heightStart, outsidePos),
          mkIfc(axes, lEnd, hEnd, outsidePos),
          mkIfc(axes, lengthStart, hEnd, outsidePos),
        ];
        labelPt = mkIfc(axes, (lengthStart + lEnd) / 2, (heightStart + hEnd) / 2, outsidePos);
        labels.push({ position: ptToThree(labelPt), text: `FRONT ${Math.round(localWidth)}×${Math.round(localHeight)}mm`, color });
      } else if (wallType === 'leftReturn') {
        const depthEnd = outsidePos + localWidth * depthSign;
        corners = [
          mkIfc(axes, lengthStart, heightStart, outsidePos),
          mkIfc(axes, lengthStart, heightStart, depthEnd),
          mkIfc(axes, lengthStart, hEnd, depthEnd),
          mkIfc(axes, lengthStart, hEnd, outsidePos),
        ];
        labelPt = mkIfc(axes, lengthStart, (heightStart + hEnd) / 2, (outsidePos + depthEnd) / 2);
        labels.push({ position: ptToThree(labelPt), text: `L-RET ${Math.round(localWidth)}mm`, color });
      } else if (wallType === 'rightReturn') {
        const lPos = seg.lengthEnd ?? (lengthStart + (seg.sourceFaceWidth ?? localWidth));
        const depthEnd = outsidePos + localWidth * depthSign;
        corners = [
          mkIfc(axes, lPos, heightStart, outsidePos),
          mkIfc(axes, lPos, heightStart, depthEnd),
          mkIfc(axes, lPos, hEnd, depthEnd),
          mkIfc(axes, lPos, hEnd, outsidePos),
        ];
        labelPt = mkIfc(axes, lPos, (heightStart + hEnd) / 2, (outsidePos + depthEnd) / 2);
        labels.push({ position: ptToThree(labelPt), text: `R-RET ${Math.round(localWidth)}mm`, color });
      } else if (wallType === 'portalLeft' || wallType === 'portalRight') {
        const isLeft = wallType === 'portalLeft';
        const opX = seg.openingX ?? 0;
        const opW = seg.openingWidth ?? 0;
        const lPos = lengthStart + (isLeft ? opX : opX + opW);
        const depthEnd = outsidePos + localWidth * depthSign;
        corners = [
          mkIfc(axes, lPos, heightStart, outsidePos),
          mkIfc(axes, lPos, heightStart, depthEnd),
          mkIfc(axes, lPos, hEnd, depthEnd),
          mkIfc(axes, lPos, hEnd, outsidePos),
        ];
        labelPt = mkIfc(axes, lPos, (heightStart + hEnd) / 2, (outsidePos + depthEnd) / 2);
        labels.push({ position: ptToThree(labelPt), text: `${isLeft ? 'PL' : 'PR'} PORTAL DEBUG ONLY`, color, isPortal: true });
      }

      if (!corners) continue;
      const [A, B, C, D] = corners.map(ptToThree);
      const verts = [...A, ...B, ...B, ...C, ...C, ...D, ...D, ...A];
      segmentLines.push({ verts, color, isPortal: isPortal3D });
    }

    const connVerts = [];
    for (const conn of (wd.connections ?? [])) {
      const segA = wd.segments.find((s) => s.wallSegId === conn.wallAId);
      const segB = wd.segments.find((s) => s.wallSegId === conn.wallBId);
      if (!segA || !segB) continue;

      function segCenter(s) {
        const { axes, outsidePos: op, lengthStart: ls, heightStart: hs, localWidth: lw, localHeight: lh } = s;
        const lMid = s.wallType === 'rightReturn'
          ? (s.lengthEnd ?? ls + (s.sourceFaceWidth ?? lw))
          : ls + lw / 2;
        const p = { x: 0, y: 0, z: 0 };
        p[axes.length] = lMid;
        p[axes.height] = hs + lh / 2;
        p[axes.thickness] = op;
        return ifcToThree(p.x, p.y, p.z);
      }

      connVerts.push(...segCenter(segA), ...segCenter(segB));
    }

    return { segmentLines, labels, connVerts };
  }, [groupPattern]);

  if (!debugData) return null;
  const { segmentLines, labels, connVerts } = debugData;

  return (
    <group>
      {segmentLines.map((sl, i) => (
        <lineSegments key={i} renderOrder={15}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" array={new Float32Array(sl.verts)} count={sl.verts.length / 3} itemSize={3} />
          </bufferGeometry>
          <lineBasicMaterial color={sl.color} linewidth={sl.isPortal ? 1 : 2} transparent={sl.isPortal} opacity={sl.isPortal ? 0.4 : 1} depthTest={false} />
        </lineSegments>
      ))}
      {connVerts.length > 0 && (
        <lineSegments renderOrder={14}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" array={new Float32Array(connVerts)} count={connVerts.length / 3} itemSize={3} />
          </bufferGeometry>
          <lineBasicMaterial color="#64748b" linewidth={1} depthTest={false} />
        </lineSegments>
      )}
      {labels.map((lbl, i) => (
        <Html key={i} position={lbl.position} distanceFactor={8} zIndexRange={[100, 0]}>
          <div style={{ color: lbl.color, fontSize: 9, background: lbl.isPortal ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.75)', padding: '1px 4px', borderRadius: 2, whiteSpace: 'nowrap', pointerEvents: 'none', border: `1px solid ${lbl.color}`, opacity: lbl.isPortal ? 0.5 : 1, fontStyle: lbl.isPortal ? 'italic' : 'normal' }}>
            {lbl.text}
          </div>
        </Html>
      ))}
    </group>
  );
}

function SlimFortFaceDebug3D({ groupPattern, settings }) {
  const labels = useMemo(() => {
    if (!groupPattern || !settings) return null;
    const sfSettings = { ...SLIMFORT_DEFAULTS, ...(settings.slimFortSettings ?? {}) };
    if (!sfSettings.debugSlimFort) return null;
    const { slimFortFaces, refWallOrigin, facadeData } = groupPattern;
    if (!slimFortFaces?.length || !refWallOrigin || !facadeData) return null;

    const cfcs = sfSettings.concreteFaceCladdingSettings?.enabled !== false && sfSettings.concreteFaceCladdingSettings != null
      ? { ...CONCRETE_FACE_CLADDING_DEFAULTS, ...sfSettings.concreteFaceCladdingSettings }
      : null;

    function mkIfc(axes, l, h, t) {
      const p = { x: 0, y: 0, z: 0 };
      p[axes.length] = l;
      p[axes.height] = h;
      p[axes.thickness] = t;
      return p;
    }

    const result = [];
    const wd = groupPattern.wallDecomposition;
    if (!wd?.segments?.length) return null;

    for (const face of slimFortFaces) {
      const seg = wd.segments.find((s) => s.wallSegId === face.faceId);
      if (!seg) continue;
      const { axes, outsidePos, lengthStart, heightStart, localWidth, localHeight, wallType } = seg;
      const depthSign = seg.outsideDir < 0 ? 1 : -1;

      let labelPt = null;
      let mappedConcreteFace = null;
      let rangeStr = null;

      if (wallType === 'front') {
        const lEnd = seg.lengthEnd ?? (lengthStart + localWidth);
        labelPt = mkIfc(axes, (lengthStart + lEnd) / 2, heightStart + localHeight / 2, outsidePos);
        if (cfcs) {
          mappedConcreteFace = cfcs.cladLeftLongFace && cfcs.cladRightLongFace
            ? 'leftLong+rightLong' : cfcs.cladLeftLongFace ? 'leftLongFace' : cfcs.cladRightLongFace ? 'rightLongFace' : '?';
          const ranges = computeFaceLongRanges(cfcs, localWidth);
          if (ranges?.length) {
            rangeStr = ranges.map(([r1, r2]) => `${Math.round(r1)}-${Math.round(r2)}`).join(', ');
          }
        }
      } else if (wallType === 'leftReturn') {
        const depthEnd = outsidePos + localWidth * depthSign;
        labelPt = mkIfc(axes, lengthStart, heightStart + localHeight / 2, (outsidePos + depthEnd) / 2);
        mappedConcreteFace = cfcs ? 'leftEndFace' : null;
      } else if (wallType === 'rightReturn') {
        const lPos = seg.lengthEnd ?? (lengthStart + (seg.sourceFaceWidth ?? localWidth));
        const depthEnd = outsidePos + localWidth * depthSign;
        labelPt = mkIfc(axes, lPos, heightStart + localHeight / 2, (outsidePos + depthEnd) / 2);
        mappedConcreteFace = cfcs ? 'rightEndFace' : null;
      }

      if (!labelPt) continue;

      const position = ifcToThree(labelPt.x, labelPt.y, labelPt.z);
      const faceColor = { front: '#3b82f6', 'side-left': '#8b5cf6', 'side-right': '#ec4899' }[face.faceType] ?? '#64748b';

      result.push({ position, faceType: face.faceType, wallType, mappedConcreteFace, localWidth, rangeStr, color: faceColor });
    }

    return result;
  }, [groupPattern, settings]);

  if (!labels?.length) return null;

  return (
    <group>
      {labels.map((lbl, i) => (
        <Html key={i} position={lbl.position} distanceFactor={8} zIndexRange={[200, 0]}>
          <div style={{ fontSize: 8, background: 'rgba(0,0,0,0.82)', padding: '2px 5px', borderRadius: 3, whiteSpace: 'nowrap', pointerEvents: 'none', border: `1px solid ${lbl.color}`, color: '#fff', lineHeight: 1.5 }}>
            <div style={{ color: lbl.color, fontWeight: 'bold' }}>{lbl.faceType}</div>
            {lbl.mappedConcreteFace && <div style={{ color: '#e879f9' }}>mapped: {lbl.mappedConcreteFace}</div>}
            <div style={{ color: '#94a3b8' }}>localW: {Math.round(lbl.localWidth)}mm</div>
            {lbl.rangeStr && <div style={{ color: '#93c5fd' }}>ranges: [{lbl.rangeStr}]</div>}
          </div>
        </Html>
      ))}
    </group>
  );
}

function SlimFort3D({ groupPattern, settings, brickD, allWalls }) {
  const { invalidate } = useThree();

  const sfData = useMemo(() => {
    if (!groupPattern || !settings) return null;
    if ((settings.backingType ?? 'hout') !== 'aluminium_slimfort') return null;
    const { refWallOrigin, groupMinX, groupMinH, facadeData, outsideDirFlip, slimFortFaces } = groupPattern;
    if (!refWallOrigin || !facadeData) return null;

    const sfSettings = { ...SLIMFORT_DEFAULTS, ...(settings.slimFortSettings ?? {}) };
    const flip = !!outsideDirFlip;
    const groupWidth = facadeData.groupWidth;

    const epsDepthStart = 0;
    const epsDepthLen = sfSettings.totalThickness;
    const profDepthStart = sfSettings.totalThickness - sfSettings.profileInsertDepth;
    const profDepthLen = sfSettings.profileDepth;
    const brDepthStart = sfSettings.totalThickness - sfSettings.bracketDepth;
    const brDepthLen = sfSettings.bracketDepth;

    const allEpsBoxes = [];
    const allProfBoxes = [];
    const allBrBoxes = [];
    const allEpsBackBoxes = [];
    const allProfBackBoxes = [];
    const allBrBackBoxes = [];
    const allEpsSideBoxes = [];
    const allProfSideBoxes = [];
    const allBrSideBoxes = [];

    const facesToRender = slimFortFaces ?? (() => {
      const { groupWidth: gW, groupHeight: gH, groupOpenings } = facadeData;
      const grid = generateSlimFortGrid(gW, gH, groupOpenings ?? [], sfSettings, settings.maxHoogte);
      return [{ faceId: 'front', faceType: 'front', width: gW, height: gH, grid, cornerOffset: 0 }];
    })();

    for (const face of facesToRender) {
      const { faceType, grid, cornerOffset } = face;
      if (!grid) continue;

      if (faceType === 'front') {
        for (const eps of grid.epsElements) {
          allEpsBoxes.push(getSlimFortElemBox(refWallOrigin, groupMinX, groupMinH, eps.x, eps.y, eps.width, eps.height, epsDepthStart, epsDepthLen, allWalls, flip));
        }
        for (const p of grid.profiles) {
          allProfBoxes.push(getSlimFortElemBox(refWallOrigin, groupMinX, groupMinH, p.x, p.y, p.width, p.height, Math.max(1, profDepthStart), profDepthLen, allWalls, flip));
        }
        for (const b of grid.brackets) {
          allBrBoxes.push(getSlimFortElemBox(refWallOrigin, groupMinX, groupMinH, b.x, b.y, b.width, b.height, brDepthStart, brDepthLen, allWalls, flip));
        }
      } else if (faceType === 'side-left' || faceType === 'side-right') {
        for (const eps of grid.epsElements) {
          allEpsSideBoxes.push(getSlimFortSideFaceElemBox(refWallOrigin, groupMinX, groupMinH, groupWidth, faceType, cornerOffset, eps.x, eps.y, eps.width, eps.height, epsDepthStart, epsDepthLen, allWalls, flip));
        }
        for (const p of grid.profiles) {
          allProfSideBoxes.push(getSlimFortSideFaceElemBox(refWallOrigin, groupMinX, groupMinH, groupWidth, faceType, cornerOffset, p.x, p.y, p.width, p.height, Math.max(1, profDepthStart), profDepthLen, allWalls, flip));
        }
        for (const b of grid.brackets) {
          allBrSideBoxes.push(getSlimFortSideFaceElemBox(refWallOrigin, groupMinX, groupMinH, groupWidth, faceType, cornerOffset, b.x, b.y, b.width, b.height, brDepthStart, brDepthLen, allWalls, flip));
        }
      } else if (faceType === 'portal-left' || faceType === 'portal-right') {
        const { openingX, openingY, openingWidth } = face;
        for (const eps of grid.epsElements) {
          allEpsSideBoxes.push(getSlimFortPortalFaceElemBox(refWallOrigin, groupMinX, groupMinH, faceType, cornerOffset, openingX, openingY, openingWidth, eps.x, eps.y, eps.width, eps.height, epsDepthStart, epsDepthLen, allWalls, flip));
        }
        for (const p of grid.profiles) {
          allProfSideBoxes.push(getSlimFortPortalFaceElemBox(refWallOrigin, groupMinX, groupMinH, faceType, cornerOffset, openingX, openingY, openingWidth, p.x, p.y, p.width, p.height, Math.max(1, profDepthStart), profDepthLen, allWalls, flip));
        }
        for (const b of grid.brackets) {
          allBrSideBoxes.push(getSlimFortPortalFaceElemBox(refWallOrigin, groupMinX, groupMinH, faceType, cornerOffset, openingX, openingY, openingWidth, b.x, b.y, b.width, b.height, brDepthStart, brDepthLen, allWalls, flip));
        }
      } else if (faceType === 'back') {
        let backOutsidePos = face.outsidePos;
        let backOutsideDir = face.outsideDir;
        if (backOutsidePos == null) {
          const raw = getOutsideFaceInfo(refWallOrigin, allWalls);
          const rawDir = flip ? -raw.outsideDir : raw.outsideDir;
          backOutsideDir = -rawDir;
          backOutsidePos = raw.outsidePos - rawDir * (face.backOffsetFromFront ?? 0);
        }
        for (const eps of grid.epsElements) {
          allEpsBackBoxes.push(getSlimFortElemBoxAt(refWallOrigin, groupMinX, groupMinH, eps.x, eps.y, eps.width, eps.height, epsDepthStart, epsDepthLen, backOutsideDir, backOutsidePos));
        }
        for (const p of grid.profiles) {
          allProfBackBoxes.push(getSlimFortElemBoxAt(refWallOrigin, groupMinX, groupMinH, p.x, p.y, p.width, p.height, Math.max(1, profDepthStart), profDepthLen, backOutsideDir, backOutsidePos));
        }
        for (const b of grid.brackets) {
          allBrBackBoxes.push(getSlimFortElemBoxAt(refWallOrigin, groupMinX, groupMinH, b.x, b.y, b.width, b.height, brDepthStart, brDepthLen, backOutsideDir, backOutsidePos));
        }
      }
    }

    return {
      epsBoxes: allEpsBoxes, profBoxes: allProfBoxes, brBoxes: allBrBoxes,
      epsBackBoxes: allEpsBackBoxes, profBackBoxes: allProfBackBoxes, brBackBoxes: allBrBackBoxes,
      epsSideBoxes: allEpsSideBoxes, profSideBoxes: allProfSideBoxes, brSideBoxes: allBrSideBoxes,
    };
  }, [groupPattern, settings, brickD, allWalls]);

  useEffect(() => { invalidate(); }, [sfData, invalidate]);

  if (!sfData) return null;
  const { epsBoxes, profBoxes, brBoxes, epsBackBoxes, profBackBoxes, brBackBoxes, epsSideBoxes, profSideBoxes, brSideBoxes } = sfData;

  return (
    <group>
      {epsBoxes.map((box, i) => (
        <mesh key={`sf-eps-${i}`} position={box.pos} renderOrder={1}>
          <boxGeometry args={box.size} />
          <meshStandardMaterial color="#7dd3fc" transparent opacity={0.55} depthWrite={false} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
        </mesh>
      ))}
      {epsBackBoxes.map((box, i) => (
        <mesh key={`sf-eps-back-${i}`} position={box.pos} renderOrder={1}>
          <boxGeometry args={box.size} />
          <meshStandardMaterial color="#fcd34d" transparent opacity={0.55} depthWrite={false} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
        </mesh>
      ))}
      {epsSideBoxes.map((box, i) => (
        <mesh key={`sf-eps-side-${i}`} position={box.pos} renderOrder={1}>
          <boxGeometry args={box.size} />
          <meshStandardMaterial color="#c4b5fd" transparent opacity={0.55} depthWrite={false} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
        </mesh>
      ))}
      {profBoxes.map((box, i) => (
        <mesh key={`sf-prof-${i}`} position={box.pos} renderOrder={2}>
          <boxGeometry args={box.size} />
          <meshStandardMaterial color="#94a3b8" transparent opacity={0.8} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
        </mesh>
      ))}
      {profBackBoxes.map((box, i) => (
        <mesh key={`sf-prof-back-${i}`} position={box.pos} renderOrder={2}>
          <boxGeometry args={box.size} />
          <meshStandardMaterial color="#78716c" transparent opacity={0.8} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
        </mesh>
      ))}
      {profSideBoxes.map((box, i) => (
        <mesh key={`sf-prof-side-${i}`} position={box.pos} renderOrder={2}>
          <boxGeometry args={box.size} />
          <meshStandardMaterial color="#a78bfa" transparent opacity={0.8} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
        </mesh>
      ))}
      {brBoxes.map((box, i) => (
        <mesh key={`sf-br-${i}`} position={box.pos} renderOrder={3}>
          <boxGeometry args={box.size} />
          <meshStandardMaterial color="#475569" transparent opacity={0.9} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        </mesh>
      ))}
      {brBackBoxes.map((box, i) => (
        <mesh key={`sf-br-back-${i}`} position={box.pos} renderOrder={3}>
          <boxGeometry args={box.size} />
          <meshStandardMaterial color="#57534e" transparent opacity={0.9} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        </mesh>
      ))}
      {brSideBoxes.map((box, i) => (
        <mesh key={`sf-br-side-${i}`} position={box.pos} renderOrder={3}>
          <boxGeometry args={box.size} />
          <meshStandardMaterial color="#6d28d9" transparent opacity={0.9} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        </mesh>
      ))}
    </group>
  );
}

function ReturnWallBricks3D({ groupPattern, settings, brickD, allWalls }) {
  const groupRef = useRef();
  const { invalidate } = useThree();

  const batches = useMemo(() => {
    if (!groupPattern) return [];
    const { refWallOrigin, groupMinX, groupMinH, facadeData, outsideDirFlip, wallDecomposition } = groupPattern;
    if (!refWallOrigin || !wallDecomposition?.returnWalls?.length) return [];

    const returnWalls = wallDecomposition.returnWalls;
    const steenH = settings?.material?.steenH ?? 50;
    const depth = brickD ?? 20;
    const groupWidth = facadeData?.groupWidth ?? 0;
    const flip = !!outsideDirFlip;
    const color = settings?.color ?? '#a64033';

    const sfSettings = { ...SLIMFORT_DEFAULTS, ...(settings?.slimFortSettings ?? {}) };
    if (!sfSettings.cladSideFaces) return [];
    const panelDikte = settings?.panelen?.dikte ?? 8;
    const sfDepths = getSlimFortDepths(sfSettings, 0, panelDikte, depth);
    const brickCenterDepth = sfDepths.brickCenter;

    const result = [];
    for (const seg of returnWalls) {
      const { wallType, heightStart, localHeight, wallThickness, sfTotalThickness } = seg;
      const sfTotal = sfTotalThickness ?? 196;
      const rawExposedDepth = Math.max(0, (wallThickness ?? 250) - sfTotal);
      const sfCornerOffset = sfSettings.cladFrontFace !== false ? sfTotal : 0;
      const exposedDepth = (sfSettings.claddingDepthInward > 0)
        ? Math.max(0, Math.min(rawExposedDepth, sfSettings.claddingDepthInward - sfCornerOffset))
        : rawExposedDepth;
      if (exposedDepth < 5) continue;

      const localHStart = heightStart - groupMinH;
      const bricks = [];
      let y = 0;
      while (y + steenH <= localHeight + 0.5) {
        bricks.push(getReturnFaceBrickPos(
          refWallOrigin, groupMinX, groupMinH, groupWidth, wallType,
          0, exposedDepth, localHStart + y, steenH, depth,
          sfTotal, brickCenterDepth, allWalls, flip
        ));
        y += steenH;
      }
      if (bricks.length > 0) result.push({ color, bricks });
    }
    return result;
  }, [groupPattern, settings, brickD, allWalls]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const dummy = new THREE.Object3D();
    const added = [];
    for (const batch of batches) {
      if (!batch.bricks.length) continue;
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshStandardMaterial({ color: batch.color });
      const im = new THREE.InstancedMesh(geo, mat, batch.bricks.length);
      batch.bricks.forEach((b, i) => {
        dummy.position.set(b.pos[0], b.pos[1], b.pos[2]);
        dummy.scale.set(
          Math.max(b.size[0] - 0.001, 0.001),
          Math.max(b.size[1] - 0.001, 0.001),
          Math.max(b.size[2] - 0.001, 0.001)
        );
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
      im.renderOrder = 1;
      group.add(im);
      added.push(im);
    }
    invalidate();
    return () => {
      for (const im of added) {
        group.remove(im);
        im.geometry.dispose();
        im.material.dispose();
      }
    };
  }, [batches, invalidate]);

  return <group ref={groupRef} />;
}

function GroupBricks3D({ groupPattern, material, brickD, allWalls, slimFort }) {
  const groupRef = useRef();
  const { invalidate } = useThree();

  const batches = useMemo(() => {
    if (!groupPattern) return [];
    const { batches: batchData, groupMinX, groupMinH, refWallOrigin, outsideDirFlip, cornerWraps } = groupPattern;
    if (!refWallOrigin || !batchData?.length) return [];
    const defaultSteenH = material?.steenH ?? 50;
    const depth = brickD ?? 20;
    const mainBatches = batchData.map((batch) => {
      const steenH = batch.brickH ?? defaultSteenH;
      if (batch.sideType) {
        const { sideType, penantX, penantB, sideDepthOffset } = batch;
        return {
          color: batch.color,
          bricks: batch.rows.flatMap((row) =>
            row.pieces.map((piece) =>
              getPenantSideBrickPos(refWallOrigin, groupMinX, groupMinH, sideType, penantX, penantB, piece.start, piece.length, row.y, steenH, depth, sideDepthOffset, allWalls, !!outsideDirFlip)
            )
          ),
        };
      }
      const dfr = batch.depthFromFace ?? null;
      return {
        color: batch.color,
        bricks: batch.rows.flatMap((row) =>
          row.pieces.map((piece) =>
            getGroupBrickPos(refWallOrigin, groupMinX, groupMinH, piece.start, piece.length, row.y, steenH, depth, allWalls, !!outsideDirFlip, dfr)
          )
        ),
      };
    }).filter((b) => b.bricks.length > 0);
    const wrapBatches = (cornerWraps ?? []).map((wrap, wi) => {
      const bricks = wrap.rows.flatMap((row) =>
        row.pieces.map((piece) =>
          getGroupBrickPos(wrap.secRwo, wrap.secGroupMinX, wrap.secGroupMinH, piece.start, piece.length, row.y, wrap.brickH, wrap.brickD, allWalls, !!wrap.secOutsideDirFlip, wrap.depthFromFace)
        )
      );
      return { color: wrap.color, bricks };
    }).filter((b) => b.bricks.length > 0);
    return [...mainBatches, ...wrapBatches];
  }, [groupPattern, material, brickD, allWalls]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const dummy = new THREE.Object3D();
    const added = [];
    for (const batch of batches) {
      if (!batch.bricks.length) continue;
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mat = slimFort
        ? new THREE.MeshStandardMaterial({ color: batch.color, transparent: true, opacity: 0.35, depthWrite: false })
        : new THREE.MeshStandardMaterial({ color: batch.color });
      const im = new THREE.InstancedMesh(geo, mat, batch.bricks.length);
      batch.bricks.forEach((b, i) => {
        dummy.position.set(b.pos[0], b.pos[1], b.pos[2]);
        dummy.scale.set(
          Math.max(b.size[0] - 0.001, 0.001),
          Math.max(b.size[1] - 0.001, 0.001),
          Math.max(b.size[2] - 0.001, 0.001)
        );
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
      im.renderOrder = slimFort ? 4 : 1;
      group.add(im);
      added.push(im);
    }
    invalidate();
    return () => {
      for (const im of added) {
        group.remove(im);
        im.geometry.dispose();
        im.material.dispose();
      }
    };
  }, [batches, slimFort, invalidate]);

  return <group ref={groupRef} />;
}

function buildPolyExtrudeGeo(wall) {
  const poly = wall.facadePoly;
  const wo = wall.wallOrigin;
  if (!poly || poly.length < 3 || !wo) return null;
  console.log('[FacadePolyDiag]', {
    wallId: wall.expressID,
    typeName: wall.typeName ?? null,
    polyPoints: poly.length,
    openingCount: wall.openings?.length ?? 0,
    firstPt: poly[0],
    lastPt: poly[poly.length - 1],
  });
  try {
    const thickness = Math.max(50, Math.abs((wo.thicknessEnd ?? wo.thicknessStart + 200) - wo.thicknessStart));
    const tStart = wo.thicknessStart;
    const tEnd = wo.thicknessStart + thickness;

    const toThree = (l, h, t) => {
      const ifc = { x: 0, y: 0, z: 0 };
      ifc[wo.lengthAxis]    = wo.lengthStart + l;
      ifc[wo.heightAxis]    = wo.heightStart + h;
      ifc[wo.thicknessAxis] = t;
      return ifcToThree(ifc.x, ifc.y, ifc.z);
    };

    const fp = poly.map(p => toThree(p.l, p.h, tStart));
    const bp = poly.map(p => toThree(p.l, p.h, tEnd));
    const n = poly.length;

    const contour2D = poly.map(p => new THREE.Vector2(p.l, p.h));
    const triIndices = THREE.ShapeUtils.triangulateShape(contour2D, []);

    const positions = [];
    const push3 = (pt) => positions.push(pt[0], pt[1], pt[2]);

    for (const [a, b, c] of triIndices) { push3(fp[a]); push3(fp[b]); push3(fp[c]); }
    for (const [a, b, c] of triIndices) { push3(bp[a]); push3(bp[c]); push3(bp[b]); }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      push3(fp[i]); push3(fp[j]); push3(bp[j]);
      push3(fp[i]); push3(bp[j]); push3(bp[i]);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
  } catch { return null; }
}

function WallMesh({ wall, isSelected, isHovered, groupColor, onSelect, onHover }) {
  const box = useMemo(() => getWallBox(wall), [wall]);

  const facadeGeo = useMemo(() => {
    const poly = wall.facadePoly;
    if (!poly || poly.length === 4) return null;
    return buildPolyExtrudeGeo(wall);
  }, [wall]);

  useEffect(() => () => { facadeGeo?.dispose(); }, [facadeGeo]);

  if (!box && !facadeGeo) return null;

  const wallColor = isSelected ? '#facc15' : isHovered ? '#93c5fd' : groupColor ?? '#94a3b8';
  const wallOpacity = isSelected ? 0.55 : isHovered ? 0.4 : groupColor ? 0.25 : 0.35;

  const handlers = {
    onClick:        (e) => { e.stopPropagation(); onSelect(wall.expressID); },
    onPointerEnter: (e) => { e.stopPropagation(); onHover(wall.expressID); document.body.style.cursor = 'pointer'; },
    onPointerLeave: (e) => { e.stopPropagation(); onHover(null); document.body.style.cursor = 'default'; },
  };

  const hoverPos = box ? [box.pos[0], box.pos[1] + (box.size[1] ?? 0) / 2 + 0.05, box.pos[2]] : [0, 0, 0];

  return (
    <group>
      {facadeGeo ? (
        <>
          <mesh geometry={facadeGeo} {...handlers}>
            <meshStandardMaterial color={wallColor} transparent opacity={wallOpacity} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          {(isSelected || isHovered) && (
            <mesh geometry={facadeGeo}>
              <meshBasicMaterial color={isSelected ? '#facc15' : '#60a5fa'} wireframe />
            </mesh>
          )}
        </>
      ) : box ? (
        <>
          <mesh position={box.pos} {...handlers}>
            <boxGeometry args={box.size} />
            <meshStandardMaterial color={wallColor} transparent opacity={wallOpacity} depthWrite={false} />
          </mesh>
          {(isSelected || isHovered) && (
            <mesh position={box.pos}>
              <boxGeometry args={box.size} />
              <meshBasicMaterial color={isSelected ? '#facc15' : '#60a5fa'} wireframe />
            </mesh>
          )}
        </>
      ) : null}

      {isHovered && (
        <Html position={hoverPos} style={{ pointerEvents: 'none' }}>
          <div style={{
            transform: 'translate(80px, calc(-100% - 40px))',
            background: 'rgba(15,23,42,0.9)',
            color: '#f1f5f9',
            padding: '3px 8px',
            borderRadius: 4,
            fontSize: 11,
            whiteSpace: 'nowrap',
            border: '1px solid #334155',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontWeight: 600 }}>{wall.name}</div>
            <div style={{ color: '#94a3b8', fontSize: 10 }}>{wall.length}×{wall.height} mm</div>
          </div>
        </Html>
      )}
    </group>
  );
}

function OpeningMesh({ wall, opening }) {
  const wo = wall.wallOrigin;
  if (!wo) return null;

  const thickness = Math.max(50, Math.abs((wo.thicknessEnd ?? wo.thicknessStart + 200) - wo.thicknessStart));
  const backFace  = wo.thicknessStart - 5;
  const frontFace = wo.thicknessStart + thickness + 5;
  const { outsidePos: _oPos, outsideDir: _oDir } = getOutsideFaceInfo(wo, null);
  const fillFace = _oPos + _oDir * 6;

  console.log('[OpeningRender]', {
    wallId: wall.expressID,
    openingId: opening.id,
    outsideDir: wo.resolvedOutside ?? null,
    lengthAxis: wo.lengthAxis,
    heightAxis: wo.heightAxis,
    thicknessAxis: wo.thicknessAxis,
    thicknessStart: wo.thicknessStart,
    thicknessEnd: wo.thicknessEnd,
    frontFace,
    backFace,
    openingX: opening.x,
    openingY: opening.y,
    openingWidth: opening.breedte,
    openingHeight: opening.hoogte,
  });

  const ox = opening.x ?? 0;
  const oy = opening.y ?? 0;
  const ow = opening.breedte ?? 0;
  const oh = opening.hoogte ?? 0;

  const polyPts = opening.polyPts ?? null;

  const meshObj = useMemo(() => {
    const isRaam = opening.type === 'raam';
    const lineColor = isRaam ? '#1d4ed8' : '#c2410c';
    const fillColor = isRaam ? '#3b82f6' : '#f97316';
    const lineMat = new THREE.LineBasicMaterial({ color: lineColor, depthTest: false });
    const fillMat = new THREE.MeshBasicMaterial({ color: fillColor, transparent: true, opacity: 0.35, depthTest: false, depthWrite: false, side: THREE.DoubleSide });

    const rectPts = [
      { l: ox, h: oy }, { l: ox + ow, h: oy },
      { l: ox + ow, h: oy + oh }, { l: ox, h: oy + oh },
    ];
    const pts2d = (polyPts && polyPts.length >= 3) ? polyPts : rectPts;

    const makePolyLine = (tVal) => {
      const pts = [...pts2d, pts2d[0]].map(({ l, h }) => {
        const ifc = { x: 0, y: 0, z: 0 };
        ifc[wo.lengthAxis]    = wo.lengthStart + l;
        ifc[wo.heightAxis]    = wo.heightStart + h;
        ifc[wo.thicknessAxis] = tVal;
        const [tx, ty, tz] = ifcToThree(ifc.x, ifc.y, ifc.z);
        return new THREE.Vector3(tx, ty, tz);
      });
      return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
    };

    const makePolyFill = (tVal) => {
      const shape = new THREE.Shape(pts2d.map(({ l, h }) => new THREE.Vector2(l, h)));
      const geo = new THREE.ShapeGeometry(shape);
      const posArr = geo.attributes.position.array;
      for (let i = 0; i < posArr.length; i += 3) {
        const ifc = { x: 0, y: 0, z: 0 };
        ifc[wo.lengthAxis]    = wo.lengthStart + posArr[i];
        ifc[wo.heightAxis]    = wo.heightStart + posArr[i + 1];
        ifc[wo.thicknessAxis] = tVal;
        const [tx, ty, tz] = ifcToThree(ifc.x, ifc.y, ifc.z);
        posArr[i] = tx; posArr[i + 1] = ty; posArr[i + 2] = tz;
      }
      geo.attributes.position.needsUpdate = true;
      geo.computeBoundingSphere();
      return new THREE.Mesh(geo, fillMat);
    };

    const group = new THREE.Group();
    const setOrder = (obj) => { obj.renderOrder = 999; return obj; };
    group.add(setOrder(makePolyLine(frontFace)));
    group.add(setOrder(makePolyLine(backFace)));
    group.add(setOrder(makePolyFill(fillFace)));
    return group;
  }, [wo, ox, oy, ow, oh, frontFace, backFace, fillFace, opening.type, polyPts]);

  return <primitive object={meshObj} />;
}

function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 15, 10]} intensity={1.2} />
      <directionalLight position={[-5, -5, 5]} intensity={0.3} />
    </>
  );
}

function CameraPresetController({ preset, center, span, onDone }) {
  const { camera, controls } = useThree();
  const target = useRef(null);
  const upTarget = useRef(new THREE.Vector3(0, 1, 0));
  const centerRef = useRef(center);
  const spanRef = useRef(span);

  useEffect(() => { centerRef.current = center; }, [center]);
  useEffect(() => { spanRef.current = span; }, [span]);

  useEffect(() => {
    if (!preset) return;
    const [cx, cy, cz] = centerRef.current;
    const sp = spanRef.current;
    const d = Math.max(sp * 1.5, 1);

    const presets = {
      N:    { pos: [cx, cy, cz + d], up: [0, 1, 0] },
      Z:    { pos: [cx, cy, cz - d], up: [0, 1, 0] },
      O:    { pos: [cx + d, cy, cz], up: [0, 1, 0] },
      W:    { pos: [cx - d, cy, cz], up: [0, 1, 0] },
      Top:  { pos: [cx, cy + d * 1.5, cz],     up: [0, 0, -1] },
      Home: { pos: [cx + sp * 0.7, cy + sp * 0.5, cz + sp * 0.7], up: [0, 1, 0] },
    };

    const p = presets[preset];
    if (!p) return;
    const fov = preset === 'Home' ? 45 : 25;
    target.current = { pos: new THREE.Vector3(...p.pos), up: new THREE.Vector3(...p.up), fov };
  }, [preset]);

  useFrame(() => {
    if (!target.current || !controls) return;
    const { pos, up, fov } = target.current;
    const [cx, cy, cz] = center;

    camera.position.lerp(pos, 0.1);
    camera.up.lerp(up, 0.1);
    if (fov !== undefined) camera.fov += (fov - camera.fov) * 0.1;
    camera.updateProjectionMatrix();

    const ct = controls.target;
    ct.lerp(new THREE.Vector3(cx, cy, cz), 0.1);
    controls.update();

    if (camera.position.distanceTo(pos) < 0.001) {
      camera.position.copy(pos);
      target.current = null;
      onDone?.();
    }
  });

  return null;
}

function FocusGroupCamera({ activeGroupId, groups, walls, groupSettings, projectMatrix }) {
  const { camera, controls } = useThree();
  const targetRef = useRef(null);

  useEffect(() => {
    if (!activeGroupId) return;
    const group = groups.find((g) => g.id === activeGroupId);
    if (!group) return;
    const groupWalls = walls.filter((w) => group.wallIds.includes(w.expressID) && w.wallOrigin);
    if (!groupWalls.length) return;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const wall of groupWalls) {
      const box = getWallBox(wall);
      if (!box) continue;
      const [px, py, pz] = box.pos;
      const [sx, sy, sz] = box.size;
      const corners = [[-1,-1,-1],[-1,-1,1],[-1,1,-1],[-1,1,1],[1,-1,-1],[1,-1,1],[1,1,-1],[1,1,1]];
      for (const [cx2, cy2, cz2] of corners) {
        const lx = px + cx2 * sx / 2;
        const ly = py + cy2 * sy / 2;
        const lz = pz + cz2 * sz / 2;
        const [wx, wy, wz] = applyMatrix(projectMatrix, lx, ly, lz);
        if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
        if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
        if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz;
      }
    }
    if (!isFinite(minX)) return;

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);

    const rwo = ([...groupWalls].sort((a, b) => (b.length ?? 0) - (a.length ?? 0))[0]).wallOrigin;
    const rawDir = getOutsideFaceInfo(rwo, walls);
    const dirFlip = !!(groupSettings?.(activeGroupId)?.outsideDirFlip);
    const outsideDir = dirFlip ? -rawDir.outsideDir : rawDir.outsideDir;
    const ifcDirVec = { x: 0, y: 0, z: 0 };
    ifcDirVec[rwo.thicknessAxis] = outsideDir * 1000;
    const [ldx, ldy, ldz] = ifcToThree(ifcDirVec.x, ifcDirVec.y, ifcDirVec.z);
    const [dx, dy, dz] = applyMatrix(projectMatrix, ldx, ldy, ldz);
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const d = span * 1.6;
    targetRef.current = {
      pos: new THREE.Vector3(cx + (dx / len) * d, cy + (dy / len) * d, cz + (dz / len) * d),
      lookAt: new THREE.Vector3(cx, cy, cz),
    };
  }, [activeGroupId, groups, walls, groupSettings, projectMatrix]);

  useFrame(() => {
    if (!targetRef.current || !controls) return;
    const { pos, lookAt } = targetRef.current;
    camera.position.lerp(pos, 0.1);
    controls.target.lerp(lookAt, 0.1);
    controls.update();
    if (camera.position.distanceTo(pos) < 0.01) {
      camera.position.copy(pos);
      controls.target.copy(lookAt);
      controls.update();
      targetRef.current = null;
    }
  });

  return null;
}

function CameraInit({ walls, projectMatrix }) {
  const { camera, controls } = useThree();
  const done = useRef(false);
  const pendingRef = useRef(null);

  useEffect(() => {
    if (done.current || !walls.length) return;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    let validBoxCount = 0;
    for (const wall of walls) {
      const box = getWallBox(wall);
      if (!box) continue;
      validBoxCount++;
      const [px, py, pz] = box.pos;
      const [sx, sy, sz] = box.size;
      const corners = [[-1,-1,-1],[-1,-1,1],[-1,1,-1],[-1,1,1],[1,-1,-1],[1,-1,1],[1,1,-1],[1,1,1]];
      for (const [cx2, cy2, cz2] of corners) {
        const lx = px + cx2 * sx / 2;
        const ly = py + cy2 * sy / 2;
        const lz = pz + cz2 * sz / 2;
        const [wx, wy, wz] = applyMatrix(projectMatrix, lx, ly, lz);
        if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
        if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
        if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz;
      }
    }

    if (validBoxCount === 0 || !isFinite(minX)) {
      pendingRef.current = { cx: 0, cy: 0, cz: 0, pos: new THREE.Vector3(10, 10, 10) };
      return;
    }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const spanX = maxX - minX;
    const spanZ = maxZ - minZ;
    const spanAll = Math.max(spanX, maxY - minY, spanZ, 0.1);

    pendingRef.current = {
      cx, cy, cz,
      pos: new THREE.Vector3(cx + spanX * 0.6, cy + spanAll * 0.5, cz + spanZ * 0.6),
    };
  }, [walls]);

  useFrame(() => {
    if (done.current || !pendingRef.current) return;
    done.current = true;
    const { cx, cy, cz, pos } = pendingRef.current;
    pendingRef.current = null;
    camera.position.copy(pos);
    camera.lookAt(cx, cy, cz);
    if (controls) {
      controls.target.set(cx, cy, cz);
      controls.update();
    }
  });

  return null;
}

const COMPASS = [
  { key: 'N',    label: 'N',   title: 'Noord',   gridPos: '2/3' },
  { key: 'O',    label: 'O',   title: 'Oost',    gridPos: '3/4' },
  { key: 'Z',    label: 'Z',   title: 'Zuid',    gridPos: '4/3' },
  { key: 'W',    label: 'W',   title: 'West',    gridPos: '3/2' },
  { key: 'Top',  label: '⊤',   title: 'Bovenaanzicht', gridPos: '3/3' },
];

export function Viewer3D({ walls, selectedWallIds, groups, groupSettings, groupPatterns, onSelectWall, onSelectMultiple, activeGroupId, hiddenGroupIds: hiddenGroupIdsProp, onHiddenGroupIdsChange, buildingEnvelopeData, projectTransform = null }) {
  const [hoveredWallId, setHoveredWallId] = useState(null);
  const [preset, setPreset] = useState(null);
  const [boxSelectMode, setBoxSelectMode] = useState(false);
  const [dragRect, setDragRect] = useState(null);
  const [hiddenGroupIdsInternal, setHiddenGroupIdsInternal] = useState(new Set());
  const [hideUngrouped, setHideUngrouped] = useState(false);
  const [groupPanelOpen, setGroupPanelOpen] = useState(false);

  const hiddenGroupIds = hiddenGroupIdsProp ?? hiddenGroupIdsInternal;
  const setHiddenGroupIds = useCallback((valOrFn) => {
    if (onHiddenGroupIdsChange) {
      const next = typeof valOrFn === 'function' ? valOrFn(hiddenGroupIds) : valOrFn;
      onHiddenGroupIdsChange(next);
    } else {
      setHiddenGroupIdsInternal(valOrFn);
    }
  }, [hiddenGroupIds, onHiddenGroupIdsChange]);

  const toggleGroupVisibility = useCallback((gid) => {
    setHiddenGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid); else next.add(gid);
      return next;
    });
  }, [setHiddenGroupIds]);
  const dragStart = useRef(null);
  const cameraRef = useRef(null);
  const containerRef = useRef(null);

  const projectMatrix = useMemo(() => buildProjectMatrix(projectTransform), [projectTransform]);

  const wallGroupMap = useMemo(() => {
    const map = {};
    for (const g of groups) {
      for (const id of g.wallIds) map[id] = g;
    }
    return map;
  }, [groups]);

  const { center, span } = useMemo(() => {
    if (!walls.length) return { center: [0, 0, 0], span: 10 };
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const wall of walls) {
      const box = getWallBox(wall);
      if (!box) continue;
      const [px, py, pz] = box.pos;
      const [sx, sy, sz] = box.size;
      const corners = [[-1,-1,-1],[-1,-1,1],[-1,1,-1],[-1,1,1],[1,-1,-1],[1,-1,1],[1,1,-1],[1,1,1]];
      for (const [cx, cy, cz] of corners) {
        const lx = px + cx * sx / 2;
        const ly = py + cy * sy / 2;
        const lz = pz + cz * sz / 2;
        const [wx, wy, wz] = applyMatrix(projectMatrix, lx, ly, lz);
        if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
        if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
        if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz;
      }
    }
    if (!isFinite(minX)) return { center: [0, 0, 0], span: 10 };
    return {
      center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
      span: Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1),
    };
  }, [walls, projectMatrix]);

  function handlePreset(key) {
    setPreset(null);
    setTimeout(() => setPreset(key), 10);
  }

  function getCanvasPos(e) {
    const rect = containerRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onMouseDown(e) {
    if (!boxSelectMode) return;
    e.preventDefault();
    const pos = getCanvasPos(e);
    dragStart.current = pos;
    setDragRect({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y });
  }

  function onMouseMove(e) {
    if (!boxSelectMode || !dragStart.current) return;
    const pos = getCanvasPos(e);
    setDragRect({ x1: dragStart.current.x, y1: dragStart.current.y, x2: pos.x, y2: pos.y });
  }

  function onMouseUp(e) {
    if (!boxSelectMode || !dragStart.current) return;
    const pos = getCanvasPos(e);
    const rect = {
      x1: Math.min(dragStart.current.x, pos.x),
      y1: Math.min(dragStart.current.y, pos.y),
      x2: Math.max(dragStart.current.x, pos.x),
      y2: Math.max(dragStart.current.y, pos.y),
    };
    dragStart.current = null;
    setDragRect(null);

    if (rect.x2 - rect.x1 < 4 || rect.y2 - rect.y1 < 4) return;

    const camera = cameraRef.current;
    if (!camera || !containerRef.current) return;
    const canvasW = containerRef.current.clientWidth;
    const canvasH = containerRef.current.clientHeight;

    const candidates = [];
    for (const wall of walls) {
      const box = getWallBox(wall);
      if (!box) continue;
      const [px, py, pz] = box.pos;
      const [wx, wy, wz] = applyMatrix(projectMatrix, px, py, pz);
      const worldPos = new THREE.Vector3(wx, wy, wz);
      const ndc = worldPos.clone().project(camera);
      if (ndc.z > 1) continue;
      const sx = (ndc.x + 1) / 2 * canvasW;
      const sy = (1 - ndc.y) / 2 * canvasH;
      if (sx >= rect.x1 && sx <= rect.x2 && sy >= rect.y1 && sy <= rect.y2) {
        candidates.push({ id: wall.expressID, ndcZ: ndc.z });
      }
    }

    if (candidates.length > 0 && onSelectMultiple) {
      const minZ = Math.min(...candidates.map((c) => c.ndcZ));
      const DEPTH_TOLERANCE = 0.05;
      const frontIds = candidates.filter((c) => c.ndcZ <= minZ + DEPTH_TOLERANCE).map((c) => c.id);
      onSelectMultiple(frontIds);
    }
  }

  if (!WEBGL_AVAILABLE) {
    return (
      <div style={{ width: '100%', height: '100%', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ maxWidth: 480, padding: 32, background: '#1e293b', borderRadius: 12, border: '1px solid #334155', color: '#f1f5f9', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>3D-weergave niet beschikbaar</div>
          <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, marginBottom: 20 }}>
            WebGL (GPU-acceleratie) is uitgeschakeld in deze browser. De 2D-weergave en alle andere functies werken wel normaal.
          </div>
          <div style={{ background: '#0f172a', borderRadius: 8, padding: 16, textAlign: 'left', fontSize: 12, color: '#cbd5e1', lineHeight: 1.8 }}>
            <strong style={{ color: '#60a5fa' }}>Oplossing in Edge/Chrome:</strong><br />
            1. Ga naar <code style={{ color: '#f472b6' }}>edge://settings/system</code> of <code style={{ color: '#f472b6' }}>chrome://settings/system</code><br />
            2. Zet <strong>Hardware-acceleratie gebruiken</strong> aan<br />
            3. Start de browser opnieuw op<br /><br />
            Of open de app in een andere browser (bijv. Chrome).
          </div>
          {walls.length > 0 && (
            <div style={{ marginTop: 16, fontSize: 12, color: '#64748b' }}>
              {walls.length} wanden geladen — gebruik de 2D-weergave om te werken
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', background: '#0f172a', position: 'relative', cursor: boxSelectMode ? 'crosshair' : 'default' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      <Canvas camera={{ fov: 45, near: 0.01, far: 2000 }}>
        <CameraAccessor cameraRef={cameraRef} />
        <CameraInit walls={walls} projectMatrix={projectMatrix} />
        <CameraPresetController preset={preset} center={center} span={span} onDone={() => setPreset(null)} />
        <FocusGroupCamera activeGroupId={activeGroupId} groups={groups} walls={walls} groupSettings={groupSettings} projectMatrix={projectMatrix} />
        <SceneLights />
        <OrbitControls target={center} enableDamping dampingFactor={0.1} makeDefault enabled={!boxSelectMode} />
        <gridHelper args={[500, 100, '#1e3a5f', '#1e293b']} position={[center[0], center[1] - span * 0.5, center[2]]} />

        <group matrix={projectMatrix} matrixAutoUpdate={false}>
        {walls.map((wall, wi) => {
          const group = wallGroupMap[wall.expressID];
          const settings = group ? groupSettings(group.id) : null;
          if (group && hiddenGroupIds.has(group.id)) return null;
          if (!group && hideUngrouped) return null;
          return (
            <WallMesh
              key={`${wi}_${wall.expressID}`}
              wall={wall}
              isSelected={selectedWallIds.has(wall.expressID)}
              isHovered={hoveredWallId === wall.expressID}
              groupColor={settings?.color ?? null}
              onSelect={boxSelectMode ? null : onSelectWall}
              onHover={setHoveredWallId}
            />
          );
        })}

        {groups.map((group) => {
          if (hiddenGroupIds.has(group.id)) return null;
          const settings = groupSettings(group.id);
          const gp = groupPatterns?.[group.id];
          if (!gp) return null;
          return (
            <GroupBricks3D
              key={`bricks-${group.id}`}
              groupPattern={gp}
              material={settings?.material}
              brickD={settings?.brickDepth ?? 20}
              allWalls={walls}
              slimFort={(settings?.backingType ?? 'hout') === 'aluminium_slimfort'}
            />
          );
        })}

        {groups.map((group) => {
          if (hiddenGroupIds.has(group.id)) return null;
          const settings = groupSettings(group.id);
          if ((settings?.backingType ?? 'hout') !== 'aluminium_slimfort') return null;
          const gp = groupPatterns?.[group.id];
          if (!gp) return null;
          return (
            <group key={`slimfort-${group.id}`}>
              <SlimFort3D
                groupPattern={gp}
                settings={settings}
                brickD={settings?.brickDepth ?? 20}
                allWalls={walls}
              />
              <ReturnWallBricks3D
                groupPattern={gp}
                settings={settings}
                brickD={settings?.brickDepth ?? 20}
                allWalls={walls}
              />
              <SlimFortStitchDebug3D groupPattern={gp} />
              <WallDecompositionDebug3D groupPattern={gp} />
              <SlimFortFaceDebug3D groupPattern={gp} settings={settings} />
            </group>
          );
        })}

        {walls.flatMap((wall) => {
          const group = wallGroupMap[wall.expressID];
          if ((wall.openings?.length ?? 0) > 0) {
            console.log('[OpeningVisibility]', {
              wallId: wall.expressID,
              openingCount: wall.openings.length,
              inGroup: !!group,
              groupHidden: group ? hiddenGroupIds.has(group.id) : false,
              hideUngrouped,
              hasWallOrigin: !!wall.wallOrigin,
            });
          }
          if (group && hiddenGroupIds.has(group.id)) return [];
          if (!group && hideUngrouped) return [];
          console.log('[OpeningData]', {
            wallId: wall.expressID,
            ifcExpressId: wall.expressID,
            idSource: 'WebIFC.GetLineIDsWithType — wallId IS the raw IFC expressId, no transform',
            wallName: wall.name,
            typeName: wall.typeName ?? null,
            openingCount: wall.openings?.length ?? 0,
            openings: wall.openings,
            groupId: group?.id ?? null,
            groupWallIds: group?.wallIds ?? null,
            planeId: wall.planeId ?? null,
            sourceMeshIds: wall.sourceMeshIds ?? null,
            wallOriginAxes: wall.wallOrigin
              ? { length: wall.wallOrigin.lengthAxis, height: wall.wallOrigin.heightAxis, thickness: wall.wallOrigin.thicknessAxis }
              : null,
          });
          return (wall.openings ?? []).map((op) => (
            <OpeningMesh key={`${wall.expressID}-${op.id}`} wall={wall} opening={op} />
          ));
        })}

        {groups.flatMap((group) => {
          if (hiddenGroupIds.has(group.id)) return [];
          const settings = groupSettings(group.id);
          const penanten = settings?.penanten ?? [];
          if (!penanten.length) return [];
          const groupWalls = walls.filter((w) => group.wallIds.includes(w.expressID) && w.wallOrigin);
          if (!groupWalls.length) return [];
          const rwo = ([...groupWalls].sort((a, b) => (b.length ?? 0) - (a.length ?? 0))[0]).wallOrigin;
          const axisWalls = groupWalls.filter((w) => w.wallOrigin.lengthAxis === rwo.lengthAxis);
          const groupMinX = Math.min(...axisWalls.map((w) => w.wallOrigin.lengthStart));
          const groupMinH = Math.min(...axisWalls.map((w) => w.wallOrigin.heightStart));
          const penLatDikte = groupPatterns?.[group.id]?.latDikteEff ?? settings?.latten?.dikte ?? 28;
          const penBrickD   = settings?.brickDepth ?? 20;
          const penPanelDikte = settings?.panelen?.dikte ?? 8;
          const materialStoot = settings?.material?.stoot ?? 10;
          const penFlip = !!(settings?.outsideDirFlip);
          return penanten.map((penant) => {
            const pDL3V = Math.max(1, penant.diepteLinks  ?? penant.diepte ?? 150);
            const pDR3V = Math.max(1, penant.diepteRechts ?? penant.diepte ?? 150);
            const penStoot = penant.stoot ?? materialStoot;
            const penantShift = penPanelDikte + penBrickD + penStoot + Math.max(pDL3V, pDR3V);
            return (
              <PenantMesh3D
                key={`penant-${group.id}-${penant.id ?? penant.x}`}
                penant={penant}
                rwo={rwo}
                groupMinX={groupMinX}
                groupMinH={groupMinH}
                groupColor={settings?.color ?? '#6366f1'}
                allWalls={walls}
                latDikte={penLatDikte}
                brickDepth={penBrickD}
                panelDikte={penPanelDikte}
                penantShift={penantShift}
                outsideDirFlip={penFlip}
                materialStoot={materialStoot}
              />
            );
          });
        })}
        </group>
      </Canvas>

      {walls.length > 0 && groups.length > 0 && (
        <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, userSelect: 'none' }}>
          <button
            onClick={() => setGroupPanelOpen((v) => !v)}
            title="Groepen verbergen/tonen"
            style={{
              background: hiddenGroupIds.size > 0 || hideUngrouped ? '#3b82f6' : 'rgba(15,23,42,0.85)',
              color: hiddenGroupIds.size > 0 || hideUngrouped ? '#fff' : '#94a3b8',
              border: '1px solid #334155',
              borderRadius: 4,
              fontSize: 11,
              padding: '3px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            👁 Zichtbaarheid {hiddenGroupIds.size > 0 ? `(${hiddenGroupIds.size} verborgen)` : ''}{groupPanelOpen ? ' ▲' : ' ▼'}
          </button>
          {groupPanelOpen && (
            <div style={{
              marginTop: 4,
              background: 'rgba(15,23,42,0.92)',
              border: '1px solid #334155',
              borderRadius: 6,
              padding: '6px 0',
              minWidth: 180,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}>
              <div style={{ display: 'flex', gap: 4, padding: '2px 8px 6px', borderBottom: '1px solid #1e293b' }}>
                <button
                  onClick={() => setHiddenGroupIds(new Set())}
                  style={{ flex: 1, fontSize: 10, background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 3, padding: '2px 0', cursor: 'pointer' }}
                >Alles tonen</button>
                <button
                  onClick={() => setHiddenGroupIds(new Set(groups.map((g) => g.id)))}
                  style={{ flex: 1, fontSize: 10, background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 3, padding: '2px 0', cursor: 'pointer' }}
                >Alles verbergen</button>
              </div>
              {groups.map((g) => {
                const s = groupSettings(g.id);
                const visible = !hiddenGroupIds.has(g.id);
                return (
                  <div
                    key={g.id}
                    onClick={() => toggleGroupVisibility(g.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
                      cursor: 'pointer', opacity: visible ? 1 : 0.45,
                    }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: 'inline-block', flexShrink: 0, border: '1px solid rgba(255,255,255,0.2)' }} />
                    <span style={{ flex: 1, fontSize: 11, color: visible ? '#e2e8f0' : '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                    <span style={{ fontSize: 12, color: visible ? '#60a5fa' : '#475569' }}>{visible ? '👁' : '🚫'}</span>
                  </div>
                );
              })}
              {walls.some((w) => !wallGroupMap[w.expressID]) && (
                <div
                  onClick={() => setHideUngrouped((v) => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
                    cursor: 'pointer', opacity: !hideUngrouped ? 1 : 0.45,
                    borderTop: '1px solid #1e293b', marginTop: 2, paddingTop: 6,
                  }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#64748b', display: 'inline-block', flexShrink: 0, border: '1px solid rgba(255,255,255,0.2)' }} />
                  <span style={{ flex: 1, fontSize: 11, color: !hideUngrouped ? '#e2e8f0' : '#64748b' }}>Ongegroepeerd</span>
                  <span style={{ fontSize: 12, color: !hideUngrouped ? '#60a5fa' : '#475569' }}>{!hideUngrouped ? '👁' : '🚫'}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {dragRect && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(dragRect.x1, dragRect.x2),
            top: Math.min(dragRect.y1, dragRect.y2),
            width: Math.abs(dragRect.x2 - dragRect.x1),
            height: Math.abs(dragRect.y2 - dragRect.y1),
            border: '1.5px dashed #3b82f6',
            background: 'rgba(59,130,246,0.08)',
            pointerEvents: 'none',
          }}
        />
      )}

      {walls.length > 0 && (
        <div style={{ position: 'absolute', bottom: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
          <button
            onClick={() => setBoxSelectMode((v) => !v)}
            title="Rechthoekige selectie — sleep een rechthoek om meerdere elementen te selecteren"
            style={{
              width: 60, height: 24,
              background: boxSelectMode ? '#3b82f6' : 'rgba(15,23,42,0.85)',
              color: boxSelectMode ? '#fff' : '#94a3b8',
              border: '1px solid #334155',
              borderRadius: 4,
              fontSize: 10,
              cursor: 'pointer',
              marginBottom: 4,
            }}
          >
            ⬚ Box
          </button>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 28px)',
            gridTemplateRows: 'repeat(5, 28px)',
            gap: 2,
          }}>
            {COMPASS.map(({ key, label, title, gridPos }) => {
              const [row, col] = gridPos.split('/').map(Number);
              return (
                <button
                  key={key}
                  onClick={() => handlePreset(key)}
                  title={title}
                  style={{
                    gridRow: row,
                    gridColumn: col,
                    width: 28, height: 28,
                    background: preset === key ? '#3b82f6' : 'rgba(15,23,42,0.85)',
                    color: preset === key ? '#fff' : '#94a3b8',
                    border: '1px solid #334155',
                    borderRadius: 4,
                    fontSize: key === 'Top' ? 14 : 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => handlePreset('Home')}
            title="Perspectief (startpositie)"
            style={{
              width: 60, height: 24,
              background: 'rgba(15,23,42,0.85)',
              color: '#64748b',
              border: '1px solid #334155',
              borderRadius: 4,
              fontSize: 10,
              cursor: 'pointer',
            }}
          >
            ⌂ Home
          </button>
        </div>
      )}
    </div>
  );
}
