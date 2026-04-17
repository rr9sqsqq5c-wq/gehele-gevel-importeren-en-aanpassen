import { getApi } from './ifc.js';

const TYPE_PRIORITY = {
  IFCSLAB: 1,
  IFCBEAM: 2,
  IFCCOLUMN: 3,
  IFCPLATE: 4,
  IFCROOF: 5,
};

const MIN_CLASH_SIZE_MM = 100;

function getBBoxFromMesh(api, modelID, expressID) {
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

  for (let gi = 0; gi < mesh.geometries.size(); gi++) {
    const placed = mesh.geometries.get(gi);
    let geom;
    try {
      geom = api.GetGeometry(modelID, placed.geometryExpressID);
      const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
      const m = placed.flatTransformation;

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

  if (!ok) return null;
  return {
    minX: minX * 1000, maxX: maxX * 1000,
    minY: minY * 1000, maxY: maxY * 1000,
    minZ: minZ * 1000, maxZ: maxZ * 1000,
  };
}

export async function loadClashElements(file, onProgress) {
  const { IFC, api } = await getApi();

  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);
  const modelID = api.OpenModel(data, {});

  const elements = [];

  try {
    const typeMap = {
      IFCSLAB:   IFC.IFCSLAB,
      IFCBEAM:   IFC.IFCBEAM,
      IFCCOLUMN: IFC.IFCCOLUMN,
      IFCPLATE:  IFC.IFCPLATE,
      IFCROOF:   IFC.IFCROOF,
    };

    const allIds = [];
    for (const [typeName, typeConst] of Object.entries(typeMap)) {
      if (typeConst == null) continue;
      const idsVec = api.GetLineIDsWithType(modelID, typeConst);
      for (let i = 0; i < idsVec.size(); i++) {
        allIds.push({ expressID: idsVec.get(i), typeName });
      }
    }

    onProgress?.({ phase: 'init', total: allIds.length });

    let processed = 0;
    let lastYield = Date.now();

    for (const { expressID, typeName } of allIds) {
      try {
        const bb = getBBoxFromMesh(api, modelID, expressID);
        if (!bb) { processed++; continue; }

        const dx = bb.maxX - bb.minX;
        const dy = bb.maxY - bb.minY;
        const dz = bb.maxZ - bb.minZ;

        if (Math.max(dx, dy) < MIN_CLASH_SIZE_MM && Math.max(dy, dz) < MIN_CLASH_SIZE_MM) {
          processed++;
          continue;
        }

        let name = `${typeName} #${expressID}`;
        try {
          const line = api.GetLine(modelID, expressID, false);
          if (line?.Name?.value) name = line.Name.value;
        } catch { }

        const centerPoint = {
          x: (bb.minX + bb.maxX) / 2,
          y: (bb.minY + bb.maxY) / 2,
          z: (bb.minZ + bb.maxZ) / 2,
        };

        elements.push({
          expressID,
          type: typeName,
          name,
          boundingBox: bb,
          centerPoint,
          depth: 0,
          priority: TYPE_PRIORITY[typeName] ?? 99,
        });
      } catch { }

      processed++;
      onProgress?.({ phase: 'elementen', current: processed, total: allIds.length });
      const now = Date.now();
      if (now - lastYield > 50) {
        lastYield = now;
        await new Promise(r => setTimeout(r, 0));
      }
    }
  } finally {
    try { api.CloseModel(modelID); } catch { }
  }

  elements.sort((a, b) => a.priority - b.priority);
  return elements;
}

export function detectClashesForGroup(group, walls, clashElements, pakketdikte, thicknessAxis, outerFacePos, outDir) {
  if (!walls.length || !clashElements.length) return [];

  const wallsWithOrigin = walls.filter(w => w.wallOrigin);
  if (!wallsWithOrigin.length) return [];

  const wo0 = wallsWithOrigin[0].wallOrigin;
  const lenAxis = wo0.lengthAxis;
  const hgtAxis = wo0.heightAxis;

  const groupMinLen = Math.min(...wallsWithOrigin.map(w => w.wallOrigin.lengthStart));
  const groupMinHgt = Math.min(...wallsWithOrigin.map(w => w.wallOrigin.heightStart));
  const groupMaxLen = Math.max(...wallsWithOrigin.map(w => w.wallOrigin.lengthStart + w.length));
  const groupMaxHgt = Math.max(...wallsWithOrigin.map(w => w.wallOrigin.heightStart + w.height));

  const TA = thicknessAxis.toUpperCase();
  const LA = lenAxis.toUpperCase();
  const HA = hgtAxis.toUpperCase();

  const clashes = [];

  for (const el of clashElements) {
    const bb = el.boundingBox;

    const elMinT = bb[`min${TA}`];
    const elMaxT = bb[`max${TA}`];

    let depth;
    if (outDir > 0) {
      depth = elMaxT - outerFacePos;
    } else {
      depth = outerFacePos - elMinT;
    }

    if (depth <= 0) continue;

    const elMinL = bb[`min${LA}`];
    const elMaxL = bb[`max${LA}`];
    const elMinH = bb[`min${HA}`];
    const elMaxH = bb[`max${HA}`];

    const overlapMinL = Math.max(elMinL, groupMinLen);
    const overlapMaxL = Math.min(elMaxL, groupMaxLen);
    const overlapMinH = Math.max(elMinH, groupMinHgt);
    const overlapMaxH = Math.min(elMaxH, groupMaxHgt);

    if (overlapMaxL - overlapMinL < MIN_CLASH_SIZE_MM) continue;
    if (overlapMaxH - overlapMinH < MIN_CLASH_SIZE_MM) continue;

    const zoneX = overlapMinL - groupMinLen;
    const zoneY = overlapMinH - groupMinHgt;
    const zoneWidth = overlapMaxL - overlapMinL;
    const zoneHeight = overlapMaxH - overlapMinH;

    clashes.push({
      elementId: el.expressID,
      type: el.type,
      name: el.name,
      zoneX,
      zoneY,
      zoneWidth,
      zoneHeight,
      depth,
    });
  }

  return clashes;
}

export function buildClashExclusions(clashes, zetwerk) {
  const offset = zetwerk?.offset ?? 0;

  return clashes.map(clash => ({
    x: Math.max(0, clash.zoneX - offset),
    y: Math.max(0, clash.zoneY - offset),
    width: clash.zoneWidth + 2 * offset,
    height: clash.zoneHeight + 2 * offset,
    label: clash.name,
    type: clash.type,
    elementId: clash.elementId,
    depth: clash.depth,
  }));
}

export function getGroupOuterFaceInfo(group, wallMap, allWalls) {
  const walls = group.wallIds.map(id => wallMap[id]).filter(w => w?.wallOrigin);
  if (!walls.length) return null;

  const wo0 = walls[0].wallOrigin;
  const thicknessAxis = wo0.thicknessAxis;

  const groupThickCenter = walls.reduce((s, w) => {
    const wo = w.wallOrigin;
    return s + (wo.thicknessStart + (wo.thicknessEnd ?? wo.thicknessStart)) / 2;
  }, 0) / walls.length;

  const allOnSameAxis = allWalls.filter(w => w.wallOrigin?.thicknessAxis === thicknessAxis);
  const buildingThickCenter = allOnSameAxis.length
    ? allOnSameAxis.reduce((s, w) => {
        const wo = w.wallOrigin;
        return s + (wo.thicknessStart + (wo.thicknessEnd ?? wo.thicknessStart)) / 2;
      }, 0) / allOnSameAxis.length
    : 0;

  const outDir = groupThickCenter >= buildingThickCenter ? 1 : -1;

  let outerFacePos;
  if (outDir > 0) {
    outerFacePos = Math.max(...walls.map(w => Math.max(
      w.wallOrigin.thicknessStart,
      w.wallOrigin.thicknessEnd ?? w.wallOrigin.thicknessStart
    )));
  } else {
    outerFacePos = Math.min(...walls.map(w => Math.min(
      w.wallOrigin.thicknessStart,
      w.wallOrigin.thicknessEnd ?? w.wallOrigin.thicknessStart
    )));
  }

  return { thicknessAxis, outerFacePos, outDir };
}
