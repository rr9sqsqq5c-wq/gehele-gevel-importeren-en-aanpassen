import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { useMemo, useRef, useEffect, useState } from 'react';
import * as THREE from 'three';

function ifcToThree(ifcX, ifcY, ifcZ) {
  return [ifcX / 1000, ifcZ / 1000, ifcY / 1000];
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
    pos: ifcToThree(ifc.x, ifc.y, ifc.z),
    size: ifcToThree(brickDims.x, brickDims.y, brickDims.z).map(Math.abs),
  };
}

function WallMesh({ wall, isSelected, isHovered, groupColor, pattern, material, brickD, onSelect, onHover }) {
  const box = useMemo(() => getWallBox(wall), [wall]);
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
        out.push(getBrickPos(wall, piece.start, piece.length, row.y, steenH, depth));
      }
    }
    return out;
  }, [pattern, groupColor, material, brickD, wall]);

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

function OpeningMesh({ wall, opening }) {
  const wo = wall.wallOrigin;
  if (!wo) return null;

  const thickness = Math.max(50, Math.abs((wo.thicknessEnd ?? wo.thicknessStart + 200) - wo.thicknessStart));

  const ifc = { x: 0, y: 0, z: 0 };
  ifc[wo.lengthAxis] = wo.lengthStart + (opening.x ?? 0) + (opening.breedte ?? 0) / 2;
  ifc[wo.heightAxis] = wo.heightStart + (opening.y ?? 0) + (opening.hoogte ?? 0) / 2;
  ifc[wo.thicknessAxis] = wo.thicknessStart + thickness / 2;

  const dims = { x: 0.01, y: 0.01, z: 0.01 };
  dims[wo.lengthAxis] = opening.breedte ?? 0;
  dims[wo.heightAxis] = opening.hoogte ?? 0;
  dims[wo.thicknessAxis] = thickness + 0.01;

  const pos = ifcToThree(ifc.x, ifc.y, ifc.z);
  const size = ifcToThree(dims.x, dims.y, dims.z).map(Math.abs);

  return (
    <mesh position={pos}>
      <boxGeometry args={size} />
      <meshStandardMaterial color="#bfdbfe" transparent opacity={0.5} depthWrite={false} />
    </mesh>
  );
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

function CameraInit({ walls }) {
  const { camera } = useThree();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !walls.length) return;
    done.current = true;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const wall of walls) {
      const box = getWallBox(wall);
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
    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 0.1);

    camera.position.set(cx + span * 0.6, cy + span * 0.4, cz + span * 1.4);
    camera.lookAt(cx, cy, cz);
  }, [walls, camera]);

  return null;
}

export function Viewer3D({ walls, selectedWallIds, groups, groupSettings, wallPatterns, onSelectWall }) {
  const [hoveredWallId, setHoveredWallId] = useState(null);

  const wallGroupMap = useMemo(() => {
    const map = {};
    for (const g of groups) {
      for (const id of g.wallIds) map[id] = g;
    }
    return map;
  }, [groups]);

  const center = useMemo(() => {
    if (!walls.length) return [0, 0, 0];
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const wall of walls) {
      const box = getWallBox(wall);
      if (!box) continue;
      const [px, py, pz] = box.pos;
      const [sx, sy, sz] = box.size;
      minX = Math.min(minX, px - sx / 2); maxX = Math.max(maxX, px + sx / 2);
      minY = Math.min(minY, py - sy / 2); maxY = Math.max(maxY, py + sy / 2);
      minZ = Math.min(minZ, pz - sz / 2); maxZ = Math.max(maxZ, pz + sz / 2);
    }
    return [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
  }, [walls]);

  return (
    <div style={{ width: '100%', height: '100%', background: '#0f172a' }}>
      <Canvas camera={{ fov: 45, near: 0.01, far: 2000 }}>
        <CameraInit walls={walls} />
        <SceneLights />
        <OrbitControls target={center} enableDamping dampingFactor={0.1} makeDefault />
        <gridHelper args={[50, 50, '#1e3a5f', '#1e293b']} position={[center[0], 0, center[2]]} />

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
              onSelect={onSelectWall}
              onHover={setHoveredWallId}
            />
          );
        })}

        {walls.flatMap((wall) =>
          (wall.openings ?? []).map((op) => (
            <OpeningMesh key={`${wall.expressID}-${op.id}`} wall={wall} opening={op} />
          ))
        )}
      </Canvas>
    </div>
  );
}
