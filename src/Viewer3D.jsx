import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';

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

function getPenantBoxes(penant, rwo, groupMinX, groupMinH, upAxis) {
  if (!rwo) return [];
  const pX = penant.x ?? 0;
  const pB = Math.max(1, penant.breedte ?? 400);
  const pD = Math.max(1, penant.diepte ?? 150);
  const pH = Math.max(1, penant.hoogte ?? 2000);
  const wallThickness = Math.max(50, Math.abs((rwo.thicknessEnd ?? rwo.thicknessStart + 200) - rwo.thicknessStart));

  const ifc = { x: 0, y: 0, z: 0 };
  ifc[rwo.lengthAxis]    = groupMinX + pX + pB / 2;
  ifc[rwo.heightAxis]    = groupMinH + pH / 2;
  ifc[rwo.thicknessAxis] = rwo.thicknessStart + wallThickness + pD / 2;

  const dims = { x: 10, y: 10, z: 10 };
  dims[rwo.lengthAxis]    = pB;
  dims[rwo.heightAxis]    = pH;
  dims[rwo.thicknessAxis] = pD;

  return [{
    pos:  ifcToThree(ifc.x, ifc.y, ifc.z, upAxis),
    size: ifcToThree(dims.x, dims.y, dims.z, upAxis).map(Math.abs),
  }];
}

function PenantMesh3D({ penant, rwo, groupMinX, groupMinH, groupColor, upAxis }) {
  const boxes = useMemo(
    () => getPenantBoxes(penant, rwo, groupMinX, groupMinH, upAxis),
    [penant, rwo, groupMinX, groupMinH, upAxis]
  );
  if (!boxes.length) return null;
  return (
    <group>
      {boxes.map((box, i) => (
        <group key={i} position={box.pos}>
          <mesh>
            <boxGeometry args={box.size} />
            <meshStandardMaterial color="#6366f1" transparent opacity={0.75} />
          </mesh>
          <mesh>
            <boxGeometry args={box.size} />
            <meshBasicMaterial color="#312e81" wireframe />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function WallMesh({ wall, isSelected, isHovered, groupColor, pattern, material, brickD, onSelect, onHover, upAxis }) {
  const box = useMemo(() => getWallBox(wall, upAxis), [wall, upAxis]);
  if (!box) return null;

  const wallColor = isSelected
    ? '#facc15'
    : isHovered
    ? '#93c5fd'
    : groupColor
    ? groupColor
    : '#94a3b8';

  const wallOpacity = isSelected ? 0.85
    : isHovered ? 0.75
    : groupColor ? 0.55
    : 0.7;

  const bricks = useMemo(() => {
    if (!pattern || !groupColor) return [];
    const steenH = material?.steenH ?? 50;
    const depth = brickD ?? 20;
    const out = [];
    for (const row of pattern) {
      for (const piece of row.pieces) {
        out.push(getBrickPos(wall, piece.start, piece.length, row.y, steenH, depth, upAxis));
      }
    }
    return out;
  }, [pattern, groupColor, material, brickD, wall, upAxis]);

  return (
    <group>
      <mesh
        position={box.pos}
        onClick={(e) => { e.stopPropagation(); onSelect(wall.expressID); }}
        onPointerEnter={(e) => { e.stopPropagation(); onHover(wall.expressID); document.body.style.cursor = 'pointer'; }}
        onPointerLeave={(e) => { e.stopPropagation(); onHover(null); document.body.style.cursor = 'default'; }}
      >
        <boxGeometry args={box.size} />
        <meshStandardMaterial
          color={wallColor}
          transparent
          opacity={wallOpacity}
        />
      </mesh>

      {(isSelected || isHovered) && (
        <mesh position={box.pos}>
          <boxGeometry args={box.size} />
          <meshBasicMaterial color={isSelected ? '#facc15' : '#60a5fa'} wireframe />
        </mesh>
      )}

      {isHovered && (
        <Html position={[box.pos[0], box.pos[1] + box.size[1] / 2 + 0.05, box.pos[2]]} center style={{ pointerEvents: 'none' }}>
          <div style={{
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

      {bricks.map((b, i) => (
        <mesh key={i} position={b.pos}>
          <boxGeometry args={b.size.map((v) => Math.max(v - 0.001, 0.001))} />
          <meshStandardMaterial color={groupColor} />
        </mesh>
      ))}
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

  const lineObj = useMemo(() => {
    const color = opening.type === 'raam' ? '#93c5fd' : '#fde68a';
    const mat = new THREE.LineBasicMaterial({ color, depthTest: false });

    const makePoly = (tVal, pts2d) => {
      const pts = [...pts2d, pts2d[0]].map(({ l, h }) => {
        const ifc = { x: 0, y: 0, z: 0 };
        ifc[wo.lengthAxis]    = wo.lengthStart + l;
        ifc[wo.heightAxis]    = wo.heightStart + h;
        ifc[wo.thicknessAxis] = tVal;
        const [tx, ty, tz] = ifcToThree(ifc.x, ifc.y, ifc.z, upAxis);
        return new THREE.Vector3(tx, ty, tz);
      });
      return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
    };

    const rectPts = [
      { l: ox, h: oy }, { l: ox + ow, h: oy },
      { l: ox + ow, h: oy + oh }, { l: ox, h: oy + oh },
    ];
    const pts2d = (polyPts && polyPts.length >= 3) ? polyPts : rectPts;

    const group = new THREE.Group();
    group.add(makePoly(frontFace, pts2d));
    group.add(makePoly(backFace, pts2d));
    return group;
  }, [wo, ox, oy, ow, oh, frontFace, backFace, upAxis, opening.type, polyPts]);

  return <primitive object={lineObj} />;
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

function CameraInit({ walls, upAxis }) {
  const { camera } = useThree();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !walls.length) return;
    done.current = true;

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

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const spanX = maxX - minX;
    const spanZ = maxZ - minZ;
    const spanAll = Math.max(spanX, maxY - minY, spanZ, 0.1);

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

export function Viewer3D({ walls, selectedWallIds, groups, groupSettings, wallPatterns, onSelectWall, onSelectMultiple }) {
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
        <SceneLights />
        <OrbitControls target={center} enableDamping dampingFactor={0.1} makeDefault enabled={!boxSelectMode} />
        <gridHelper args={[500, 100, '#1e3a5f', '#1e293b']} position={[center[0], center[1] - span * 0.5, center[2]]} />

        {walls.map((wall) => {
          const group = wallGroupMap[wall.expressID];
          const settings = group ? groupSettings(group.id) : null;
          const pattern = wallPatterns?.[wall.expressID];
          return (
            <WallMesh
              key={wall.expressID}
              wall={wall}
              isSelected={selectedWallIds.has(wall.expressID)}
              isHovered={hoveredWallId === wall.expressID}
              groupColor={settings?.color ?? null}
              pattern={pattern}
              material={settings?.material}
              brickD={settings?.brickDepth ?? 20}
              onSelect={boxSelectMode ? null : onSelectWall}
              onHover={setHoveredWallId}
              upAxis={upAxis}
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
          console.log('[Penant3D] group', group.id, 'penanten:', penanten.length, penanten);
          if (!penanten.length) return [];
          const groupWalls = walls.filter((w) => group.wallIds.includes(w.expressID) && w.wallOrigin);
          console.log('[Penant3D] groupWalls:', groupWalls.length);
          if (!groupWalls.length) return [];
          const groupMinX = Math.min(...groupWalls.map((w) => w.wallOrigin.lengthStart));
          const groupMinH = Math.min(...groupWalls.map((w) => w.wallOrigin.heightStart));
          const rwo = groupWalls[0].wallOrigin;
          return penanten.map((penant) => (
            <PenantMesh3D
              key={`penant-${group.id}-${penant.id ?? penant.x}`}
              penant={penant}
              rwo={rwo}
              groupMinX={groupMinX}
              groupMinH={groupMinH}
              groupColor={settings?.color ?? '#6366f1'}
              upAxis={upAxis}
            />
          ));
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
