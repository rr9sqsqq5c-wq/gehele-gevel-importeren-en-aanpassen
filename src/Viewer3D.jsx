import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';

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

function ifcToThree(ifcX, ifcY, ifcZ, upAxis = 'z') {
  if (upAxis === 'y') return [ifcX / 1000, ifcY / 1000, ifcZ / 1000];
  return [ifcX / 1000, ifcZ / 1000, ifcY / 1000];
}

function detectUpAxis(walls) {
  let yCount = 0, zCount = 0;
  for (const w of walls) {
    const h = w.wallOrigin?.heightAxis;
    if (h === 'y') yCount++;
    else if (h === 'z') zCount++;
  }
  return yCount > zCount ? 'y' : 'z';
}

function getWallBox(wall, upAxis = 'z') {
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
    pos: ifcToThree(ifc.x, ifc.y, ifc.z, upAxis),
    size: ifcToThree(dims.x, dims.y, dims.z, upAxis).map(Math.abs),
    wo,
    thickness,
  };
}

function getBrickPos(wall, pieceStart, pieceLen, rowY, steenH, brickD, upAxis = 'z') {
  const wo = wall.wallOrigin;
  const ifc = { x: 0, y: 0, z: 0 };
  const thickness = Math.max(50, Math.abs((wo.thicknessEnd ?? wo.thicknessStart + 200) - wo.thicknessStart));
  const frontFace = wo.thicknessStart + thickness;

  ifc[wo.lengthAxis] = wo.lengthStart + pieceStart + pieceLen / 2;
  ifc[wo.heightAxis] = wo.heightStart + rowY + steenH / 2;
  ifc[wo.thicknessAxis] = frontFace + brickD / 2;

  const brickDims = { x: 0.01, y: 0.01, z: 0.01 };
  brickDims[wo.lengthAxis] = pieceLen;
  brickDims[wo.heightAxis] = steenH;
  brickDims[wo.thicknessAxis] = brickD;

  return {
    pos: ifcToThree(ifc.x, ifc.y, ifc.z, upAxis),
    size: ifcToThree(brickDims.x, brickDims.y, brickDims.z, upAxis).map(Math.abs),
  };
}

function getOutsideFaceInfo(rwo, allWalls) {
  const axis = rwo.thicknessAxis;
  const tStart = rwo.thicknessStart;
  const tEnd = rwo.thicknessEnd ?? rwo.thicknessStart + 200;
  const wallsOnAxis = (allWalls ?? []).filter((w) => w.wallOrigin?.thicknessAxis === axis);
  const buildingMin = wallsOnAxis.length
    ? Math.min(...wallsOnAxis.map((w) => w.wallOrigin.thicknessStart))
    : tStart;
  const buildingMax = wallsOnAxis.length
    ? Math.max(...wallsOnAxis.map((w) => w.wallOrigin.thicknessEnd ?? w.wallOrigin.thicknessStart + 200))
    : tEnd;
  const distToMin = tStart - buildingMin;
  const distToMax = buildingMax - tEnd;
  if (distToMin <= distToMax) {
    return { outsidePos: tStart, outsideDir: -1 };
  }
  return { outsidePos: tEnd, outsideDir: +1 };
}

function getPenantBoxes(penant, rwo, groupMinX, groupMinH, upAxis, allWalls, latDikte, brickDepth = 20, panelDikte = 8, penantShift = 0, minHoogte = 0, minHoogteOokPenanten = false, outsideDirFlip = false) {
  if (!rwo) return [];
  const pX = penant.x ?? 0;
  const pB = Math.max(1, penant.breedte ?? 400);
  const pD = Math.max(1, penant.diepte ?? 150);
  const pH = Math.max(1, penant.hoogte ?? 2000);
  const ld = latDikte ?? 28;
  const penMinH = (minHoogteOokPenanten && minHoogte > 0) ? minHoogte : 0;

  const rawFace = getOutsideFaceInfo(rwo, allWalls);
  const outsidePos = rawFace.outsidePos;
  const outsideDir = outsideDirFlip ? -rawFace.outsideDir : rawFace.outsideDir;

  const stoot = 10;
  const panelT = panelDikte;
  const frontW  = Math.max(1, pB - 2 * brickDepth);
  const sideD   = Math.max(1, pD + brickDepth);

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
      pos:  ifcToThree(ifc.x, ifc.y, ifc.z, upAxis),
      size: ifcToThree(dims.x, dims.y, dims.z, upAxis).map(Math.abs),
    };
  };

  const sh = penantShift;
  return [
    makeBox(pX + pB / 2,                              ld + sh - panelT / 2,         frontW, panelT),
    makeBox(pX + brickDepth + panelT / 2,             ld + sh - panelT - sideD / 2, panelT, sideD),
    makeBox(pX + pB - brickDepth - panelT / 2,        ld + sh - panelT - sideD / 2, panelT, sideD),
  ];
}

function PenantMesh3D({ penant, rwo, groupMinX, groupMinH, groupColor, upAxis, allWalls, latDikte, brickDepth, panelDikte, penantShift = 0, minHoogte = 0, minHoogteOokPenanten = false, outsideDirFlip = false }) {
  const boxes = useMemo(
    () => getPenantBoxes(penant, rwo, groupMinX, groupMinH, upAxis, allWalls, latDikte, brickDepth, panelDikte, penantShift, minHoogte, minHoogteOokPenanten, outsideDirFlip),
    [penant, rwo, groupMinX, groupMinH, upAxis, allWalls, latDikte, brickDepth, panelDikte, penantShift, minHoogte, minHoogteOokPenanten, outsideDirFlip]
  );
  const cornerBattens = useMemo(() => {
    if (!rwo) return [];
    const pX = penant.x ?? 0;
    const pB = Math.max(1, penant.breedte ?? 400);
    const pH = Math.max(1, penant.hoogte ?? 2000);
    const penMinH = (minHoogteOokPenanten && minHoogte > 0) ? minHoogte : 0;
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
        pos:  ifcToThree(ifc.x, ifc.y, ifc.z, upAxis),
        size: ifcToThree(dims.x, dims.y, dims.z, upAxis).map(Math.abs),
      };
    });
  }, [penant, rwo, groupMinX, groupMinH, upAxis, allWalls, latDikte, brickDepth, panelDikte, penantShift, minHoogte, minHoogteOokPenanten, outsideDirFlip]);

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

function getGroupBrickPos(rwo, groupMinX, groupMinH, pieceStart, pieceLen, rowY, steenH, brickD, upAxis, allWalls, flipDir = false) {
  const raw = getOutsideFaceInfo(rwo, allWalls);
  const outsidePos = raw.outsidePos;
  const outsideDir = flipDir ? -raw.outsideDir : raw.outsideDir;
  const ifc = { x: 0, y: 0, z: 0 };
  ifc[rwo.lengthAxis]    = groupMinX + pieceStart + pieceLen / 2;
  ifc[rwo.heightAxis]    = groupMinH + rowY + steenH / 2;
  ifc[rwo.thicknessAxis] = outsidePos + outsideDir * brickD / 2;
  const dims = { x: 0.01, y: 0.01, z: 0.01 };
  dims[rwo.lengthAxis]    = pieceLen;
  dims[rwo.heightAxis]    = steenH;
  dims[rwo.thicknessAxis] = brickD;
  return {
    pos:  ifcToThree(ifc.x, ifc.y, ifc.z, upAxis),
    size: ifcToThree(dims.x, dims.y, dims.z, upAxis).map(Math.abs),
  };
}

function GroupBricks3D({ groupPattern, material, brickD, upAxis, allWalls }) {
  const groupRef = useRef();
  const { invalidate } = useThree();

  const batches = useMemo(() => {
    if (!groupPattern) return [];
    const { batches: batchData, groupMinX, groupMinH, refWallOrigin, outsideDirFlip } = groupPattern;
    if (!refWallOrigin || !batchData?.length) return [];
    const defaultSteenH = material?.steenH ?? 50;
    const depth = brickD ?? 20;
    return batchData.map((batch) => {
      const steenH = batch.brickH ?? defaultSteenH;
      return {
        color: batch.color,
        bricks: batch.rows.flatMap((row) =>
          row.pieces.map((piece) =>
            getGroupBrickPos(refWallOrigin, groupMinX, groupMinH, piece.start, piece.length, row.y, steenH, depth, upAxis, allWalls, !!outsideDirFlip)
          )
        ),
      };
    }).filter((b) => b.bricks.length > 0);
  }, [groupPattern, material, brickD, upAxis, allWalls]);

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

function buildPolyExtrudeGeo(wall, upAxis) {
  const poly = wall.facadePoly;
  const wo = wall.wallOrigin;
  if (!poly || poly.length < 3 || !wo) return null;
  try {
    const thickness = Math.max(50, Math.abs((wo.thicknessEnd ?? wo.thicknessStart + 200) - wo.thicknessStart));
    const tStart = wo.thicknessStart;
    const tEnd = wo.thicknessStart + thickness;

    const toThree = (l, h, t) => {
      const ifc = { x: 0, y: 0, z: 0 };
      ifc[wo.lengthAxis]    = wo.lengthStart + l;
      ifc[wo.heightAxis]    = wo.heightStart + h;
      ifc[wo.thicknessAxis] = t;
      return ifcToThree(ifc.x, ifc.y, ifc.z, upAxis);
    };

    const fp = poly.map(p => toThree(p.l, p.h, tStart));
    const bp = poly.map(p => toThree(p.l, p.h, tEnd));
    const n = poly.length;

    const positions = [];
    const push3 = (pt) => positions.push(pt[0], pt[1], pt[2]);

    for (let i = 1; i < n - 1; i++) { push3(fp[0]); push3(fp[i]); push3(fp[i + 1]); }
    for (let i = 1; i < n - 1; i++) { push3(bp[0]); push3(bp[i + 1]); push3(bp[i]); }
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

function WallMesh({ wall, isSelected, isHovered, groupColor, onSelect, onHover, upAxis }) {
  const box = useMemo(() => getWallBox(wall, upAxis), [wall, upAxis]);

  const facadeGeo = useMemo(() => {
    const poly = wall.facadePoly;
    if (!poly || poly.length === 4) return null;
    return buildPolyExtrudeGeo(wall, upAxis);
  }, [wall, upAxis]);

  useEffect(() => () => { facadeGeo?.dispose(); }, [facadeGeo]);

  if (!box && !facadeGeo) return null;

  const wallColor = isSelected ? '#facc15' : isHovered ? '#93c5fd' : groupColor ?? '#94a3b8';
  const wallOpacity = isSelected ? 0.85 : isHovered ? 0.75 : groupColor ? 0.55 : 0.7;

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
            <meshStandardMaterial color={wallColor} transparent opacity={wallOpacity} side={THREE.DoubleSide} />
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
            <meshStandardMaterial color={wallColor} transparent opacity={wallOpacity} />
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
            transform: 'translate(18px, calc(-100% - 10px))',
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

function OpeningMesh({ wall, opening, upAxis }) {
  const wo = wall.wallOrigin;
  if (!wo) return null;

  const thickness = Math.max(50, Math.abs((wo.thicknessEnd ?? wo.thicknessStart + 200) - wo.thicknessStart));
  const backFace  = wo.thicknessStart - 5;
  const frontFace = wo.thicknessStart + thickness + 5;

  const ox = opening.x ?? 0;
  const oy = opening.y ?? 0;
  const ow = opening.breedte ?? 0;
  const oh = opening.hoogte ?? 0;

  const polyPts = opening.polyPts ?? null;

  const meshObj = useMemo(() => {
    const isRaam = opening.type === 'raam';
    const color = isRaam ? '#93c5fd' : '#fde68a';
    const lineMat = new THREE.LineBasicMaterial({ color, depthTest: false });
    const fillMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthTest: false, side: THREE.DoubleSide });

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
        const [tx, ty, tz] = ifcToThree(ifc.x, ifc.y, ifc.z, upAxis);
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
        const [tx, ty, tz] = ifcToThree(ifc.x, ifc.y, ifc.z, upAxis);
        posArr[i] = tx; posArr[i + 1] = ty; posArr[i + 2] = tz;
      }
      geo.attributes.position.needsUpdate = true;
      geo.computeBoundingSphere();
      return new THREE.Mesh(geo, fillMat);
    };

    const group = new THREE.Group();
    group.add(makePolyLine(frontFace));
    group.add(makePolyLine(backFace));
    group.add(makePolyFill(frontFace + 1));
    return group;
  }, [wo, ox, oy, ow, oh, frontFace, backFace, upAxis, opening.type, polyPts]);

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

function FocusGroupCamera({ activeGroupId, groups, walls, upAxis }) {
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
      const box = getWallBox(wall, upAxis);
      if (!box) continue;
      const [px, py, pz] = box.pos;
      const [sx, sy, sz] = box.size;
      minX = Math.min(minX, px - sx / 2); maxX = Math.max(maxX, px + sx / 2);
      minY = Math.min(minY, py - sy / 2); maxY = Math.max(maxY, py + sy / 2);
      minZ = Math.min(minZ, pz - sz / 2); maxZ = Math.max(maxZ, pz + sz / 2);
    }
    if (!isFinite(minX)) return;

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);

    const rwo = ([...groupWalls].sort((a, b) => (b.length ?? 0) - (a.length ?? 0))[0]).wallOrigin;
    const { outsideDir } = getOutsideFaceInfo(rwo, walls);
    const ifcDirVec = { x: 0, y: 0, z: 0 };
    ifcDirVec[rwo.thicknessAxis] = outsideDir * 1000;
    const [dx, dy, dz] = ifcToThree(ifcDirVec.x, ifcDirVec.y, ifcDirVec.z, upAxis);
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const d = span * 1.6;
    targetRef.current = {
      pos: new THREE.Vector3(cx + (dx / len) * d, cy + (dy / len) * d, cz + (dz / len) * d),
      lookAt: new THREE.Vector3(cx, cy, cz),
    };
  }, [activeGroupId, groups, walls, upAxis]);

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

function CameraInit({ walls, upAxis }) {
  const { camera } = useThree();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !walls.length) return;
    done.current = true;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    let validBoxCount = 0;
    for (const wall of walls) {
      const box = getWallBox(wall, upAxis);
      if (!box) continue;
      validBoxCount++;
      const [px, py, pz] = box.pos;
      const [sx, sy, sz] = box.size;
      minX = Math.min(minX, px - sx / 2); maxX = Math.max(maxX, px + sx / 2);
      minY = Math.min(minY, py - sy / 2); maxY = Math.max(maxY, py + sy / 2);
      minZ = Math.min(minZ, pz - sz / 2); maxZ = Math.max(maxZ, pz + sz / 2);
    }

    console.log('[Viewer3D CameraInit] walls:', walls.length, 'validBoxes:', validBoxCount, 'upAxis:', upAxis);

    if (validBoxCount === 0 || !isFinite(minX)) {
      console.warn('[Viewer3D CameraInit] geen geldige muurboxen — camera op standaardpositie');
      camera.position.set(10, 10, 10);
      camera.lookAt(0, 0, 0);
      return;
    }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const spanX = maxX - minX;
    const spanZ = maxZ - minZ;
    const spanAll = Math.max(spanX, maxY - minY, spanZ, 0.1);

    console.log('[Viewer3D CameraInit] center:', cx, cy, cz, 'span:', spanAll);

    camera.position.set(
      cx + spanX * 0.6,
      cy + spanAll * 0.5,
      cz + spanZ * 0.6,
    );
    camera.lookAt(cx, cy, cz);
  }, [walls, upAxis, camera]);

  return null;
}

const COMPASS = [
  { key: 'N',    label: 'N',   title: 'Noord',   gridPos: '2/3' },
  { key: 'O',    label: 'O',   title: 'Oost',    gridPos: '3/4' },
  { key: 'Z',    label: 'Z',   title: 'Zuid',    gridPos: '4/3' },
  { key: 'W',    label: 'W',   title: 'West',    gridPos: '3/2' },
  { key: 'Top',  label: '⊤',   title: 'Bovenaanzicht', gridPos: '3/3' },
];

export function Viewer3D({ walls, selectedWallIds, groups, groupSettings, groupPatterns, onSelectWall, onSelectMultiple, activeGroupId }) {
  const [hoveredWallId, setHoveredWallId] = useState(null);
  const [preset, setPreset] = useState(null);
  const [boxSelectMode, setBoxSelectMode] = useState(false);
  const [dragRect, setDragRect] = useState(null);
  const dragStart = useRef(null);
  const cameraRef = useRef(null);
  const containerRef = useRef(null);

  const upAxis = useMemo(() => detectUpAxis(walls), [walls]);

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
      const box = getWallBox(wall, upAxis);
      if (!box) continue;
      const [px, py, pz] = box.pos;
      const [sx, sy, sz] = box.size;
      minX = Math.min(minX, px - sx / 2); maxX = Math.max(maxX, px + sx / 2);
      minY = Math.min(minY, py - sy / 2); maxY = Math.max(maxY, py + sy / 2);
      minZ = Math.min(minZ, pz - sz / 2); maxZ = Math.max(maxZ, pz + sz / 2);
    }
    if (!isFinite(minX)) return { center: [0, 0, 0], span: 10 };
    return {
      center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
      span: Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1),
    };
  }, [walls, upAxis]);

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
      const box = getWallBox(wall, upAxis);
      if (!box) continue;
      const [px, py, pz] = box.pos;
      const worldPos = new THREE.Vector3(px, py, pz);
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
        <CameraInit walls={walls} upAxis={upAxis} />
        <CameraPresetController preset={preset} center={center} span={span} onDone={() => setPreset(null)} />
        <FocusGroupCamera activeGroupId={activeGroupId} groups={groups} walls={walls} upAxis={upAxis} />
        <SceneLights />
        <OrbitControls target={center} enableDamping dampingFactor={0.1} makeDefault enabled={!boxSelectMode} />
        <gridHelper args={[500, 100, '#1e3a5f', '#1e293b']} position={[center[0], center[1] - span * 0.5, center[2]]} />

        {walls.map((wall) => {
          const group = wallGroupMap[wall.expressID];
          const settings = group ? groupSettings(group.id) : null;
          return (
            <WallMesh
              key={wall.expressID}
              wall={wall}
              isSelected={selectedWallIds.has(wall.expressID)}
              isHovered={hoveredWallId === wall.expressID}
              groupColor={settings?.color ?? null}
              onSelect={boxSelectMode ? null : onSelectWall}
              onHover={setHoveredWallId}
              upAxis={upAxis}
            />
          );
        })}

        {groups.map((group) => {
          const settings = groupSettings(group.id);
          const gp = groupPatterns?.[group.id];
          if (!gp) return null;
          return (
            <GroupBricks3D
              key={`bricks-${group.id}`}
              groupPattern={gp}
              material={settings?.material}
              brickD={settings?.brickDepth ?? 20}
              upAxis={upAxis}
              allWalls={walls}
            />
          );
        })}

        {walls.flatMap((wall) =>
          (wall.openings ?? []).map((op) => (
            <OpeningMesh key={`${wall.expressID}-${op.id}`} wall={wall} opening={op} upAxis={upAxis} />
          ))
        )}

        {groups.flatMap((group) => {
          const settings = groupSettings(group.id);
          const penanten = settings?.penanten ?? [];
          if (!penanten.length) return [];
          const groupWalls = walls.filter((w) => group.wallIds.includes(w.expressID) && w.wallOrigin);
          if (!groupWalls.length) return [];
          const rwo = ([...groupWalls].sort((a, b) => (b.length ?? 0) - (a.length ?? 0))[0]).wallOrigin;
          const axisWalls = groupWalls.filter((w) => w.wallOrigin.lengthAxis === rwo.lengthAxis);
          const groupMinX = Math.min(...axisWalls.map((w) => w.wallOrigin.lengthStart));
          const groupMinH = Math.min(...axisWalls.map((w) => w.wallOrigin.heightStart));
          const penLatDikte = settings?.latten?.dikte ?? 28;
          const penBrickD   = settings?.brickDepth ?? 20;
          const penPanelDikte = settings?.panelen?.dikte ?? 8;
          const penStoot = settings?.material?.stoot ?? 10;
          const penMinHoogte = settings?.minHoogte ?? 0;
          const penMinHoogteOok = !!(settings?.minHoogteOokPenanten);
          const penFlip = !!(settings?.outsideDirFlip);
          return penanten.map((penant) => {
            const pD = Math.max(1, penant.diepte ?? 150);
            const penantShift = penPanelDikte + penBrickD + penStoot + pD;
            return (
              <PenantMesh3D
                key={`penant-${group.id}-${penant.id ?? penant.x}`}
                penant={penant}
                rwo={rwo}
                groupMinX={groupMinX}
                groupMinH={groupMinH}
                groupColor={settings?.color ?? '#6366f1'}
                upAxis={upAxis}
                allWalls={walls}
                latDikte={penLatDikte}
                brickDepth={penBrickD}
                panelDikte={penPanelDikte}
                penantShift={penantShift}
                minHoogte={penMinHoogte}
                minHoogteOokPenanten={penMinHoogteOok}
                outsideDirFlip={penFlip}
              />
            );
          });
        })}
      </Canvas>

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
