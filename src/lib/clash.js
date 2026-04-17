import { getApi } from './ifc.js';

const CLASH_TYPES = [
  { key: 'IFCSLAB',   label: 'Vloerplaat/Balkon' },
  { key: 'IFCBEAM',   label: 'Balk' },
  { key: 'IFCCOLUMN', label: 'Kolom' },
  { key: 'IFCPLATE',  label: 'Plaat' },
  { key: 'IFCROOF',   label: 'Dak' },
  { key: 'IFCMEMBER', label: 'Constructielid' },
  { key: 'IFCFOOTING',label: 'Fundering' },
];

function getBBoxMM(api, modelID, expressID) {
  let mesh;
  try { mesh = api.GetFlatMesh(modelID, expressID); } catch { return null; }
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
        const lx = verts[vi], ly = verts[vi+1], lz = verts[vi+2];
        const wx = (m[0]*lx + m[4]*ly + m[8]*lz  + m[12]) * 1000;
        const wy = (m[1]*lx + m[5]*ly + m[9]*lz  + m[13]) * 1000;
        const wz = (m[2]*lx + m[6]*ly + m[10]*lz + m[14]) * 1000;
        if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
        if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
        if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz;
        ok = true;
      }
    } finally { geom?.delete(); }
  }

  return ok ? { minX, maxX, minY, maxY, minZ, maxZ } : null;
}

export async function loadClashElements(file, onProgress = null) {
  const { IFC, api } = await getApi();

  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);
  const modelID = api.OpenModel(data, {});

  const elements = [];

  try {
    for (const { key, label } of CLASH_TYPES) {
      const ifcType = IFC[key];
      if (!ifcType) continue;
      let ids;
      try { ids = api.GetLineIDsWithType(modelID, ifcType); } catch { continue; }

      const total = ids.size();
      for (let i = 0; i < total; i++) {
        const eid = ids.get(i);
        try {
          const line = api.GetLine(modelID, eid, false);
          const name = line?.Name?.value ?? line?.Tag?.value ?? `${label} #${eid}`;
          const bbox = getBBoxMM(api, modelID, eid);
          if (!bbox) continue;

          const sizeX = bbox.maxX - bbox.minX;
          const sizeY = bbox.maxY - bbox.minY;
          const sizeZ = bbox.maxZ - bbox.minZ;
          if (sizeX < 100 && sizeY < 100 && sizeZ < 100) continue;

          elements.push({
            expressID: eid,
            type: key,
            label,
            name,
            bbox,
            center: {
              x: (bbox.minX + bbox.maxX) / 2,
              y: (bbox.minY + bbox.maxY) / 2,
              z: (bbox.minZ + bbox.maxZ) / 2,
            },
          });
        } catch { }

        if (onProgress && i % 20 === 0) onProgress({ type: key, current: i, total });
      }
    }
  } finally {
    try { api.CloseModel(modelID); } catch { }
  }

  return elements;
}

export function detectClashesForGroup(group, walls, clashElements, pakketdikte, buildingCorners) {
  const withOrigin = walls.filter(w => w?.wallOrigin);
  if (!withOrigin.length || !clashElements.length) return [];

  const wo0 = withOrigin[0].wallOrigin;
  const thickAxis = wo0.thicknessAxis;
  const lenAxis   = wo0.lengthAxis;
  const heightAxis = wo0.heightAxis;

  const thickIdx  = thickAxis  === 'x' ? 'X' : thickAxis  === 'y' ? 'Y' : 'Z';
  const lenIdx    = lenAxis    === 'x' ? 'X' : lenAxis    === 'y' ? 'Y' : 'Z';
  const heightIdx = heightAxis === 'x' ? 'X' : heightAxis === 'y' ? 'Y' : 'Z';

  const gc = buildingCorners?.[group.id];
  const thickPos = withOrigin.reduce((s, w) => {
    const wo = w.wallOrigin;
    return s + (wo.thicknessStart + (wo.thicknessEnd ?? wo.thicknessStart)) / 2;
  }, 0) / withOrigin.length;

  const groupMinL = Math.min(...withOrigin.map(w => w.wallOrigin.lengthStart));
  const groupMaxL = Math.max(...withOrigin.map(w => w.wallOrigin.lengthStart + w.length));
  const groupMinH = Math.min(...withOrigin.map(w => w.wallOrigin.heightStart));
  const groupMaxH = Math.max(...withOrigin.map(w => w.wallOrigin.heightStart + w.height));

  const leftExt  = gc?.leftCorner  ? pakketdikte : 0;
  const rightExt = gc?.rightCorner ? pakketdikte : 0;
  const zoneMinL = groupMinL - leftExt;
  const zoneMaxL = groupMaxL + rightExt;

  const thickMin = Math.min(
    ...withOrigin.map(w => w.wallOrigin.thicknessStart)
  ) - pakketdikte - 50;
  const thickMax = Math.max(
    ...withOrigin.map(w => w.wallOrigin.thicknessEnd ?? w.wallOrigin.thicknessStart)
  ) + pakketdikte + 50;

  const clashes = [];

  for (const el of clashElements) {
    const bb = el.bbox;

    const elThickMin = bb[`min${thickIdx}`];
    const elThickMax = bb[`max${thickIdx}`];
    const elLenMin   = bb[`min${lenIdx}`];
    const elLenMax   = bb[`max${lenIdx}`];
    const elHMin     = bb[`min${heightIdx}`];
    const elHMax     = bb[`max${heightIdx}`];

    if (elThickMax < thickMin || elThickMin > thickMax) continue;

    const overlapL = Math.min(elLenMax, zoneMaxL) - Math.max(elLenMin, zoneMinL);
    if (overlapL < 50) continue;

    const overlapH = Math.min(elHMax, groupMaxH + 500) - Math.max(elHMin, groupMinH - 500);
    if (overlapH < 50) continue;

    const zoneX = Math.round(Math.max(elLenMin, zoneMinL) - zoneMinL);
    const zoneW = Math.round(Math.min(elLenMax, zoneMaxL) - Math.max(elLenMin, zoneMinL));
    const zoneY = Math.round(Math.max(elHMin, groupMinH) - groupMinH);
    const zoneH = Math.round(Math.min(elHMax, groupMaxH) - Math.max(elHMin, groupMinH));

    if (zoneW < 50 || zoneH < 50) continue;

    const thickOverhang = Math.round(
      Math.max(0,
        (thickPos > 0 ? elThickMin - thickMax + pakketdikte : thickMin - elThickMax + pakketdikte)
      )
    );

    clashes.push({
      elementId: el.expressID,
      type: el.type,
      label: el.label,
      name: el.name,
      zoneX,
      zoneY,
      zoneWidth: zoneW,
      zoneHeight: zoneH,
      thickOverhang,
      accepted: null,
    });
  }

  return clashes;
}

export function buildClashExclusions(clashes, zetwerk = null) {
  const zwEnabled = zetwerk?.enabled;
  const zwH = zwEnabled ? Math.max(0, zetwerk.offsetH ?? 0) : 0;
  const zwV = zwEnabled ? Math.max(0, zetwerk.offsetV ?? 0) : 0;
  const zwB = zwEnabled ? Math.max(1, zetwerk.breedte ?? 50) : 0;
  const zwS = zwEnabled ? Math.max(0, zetwerk.stripOffset ?? 5) : 0;
  const expandX = zwEnabled ? zwH + zwB + zwS : 0;
  const expandY = zwEnabled ? zwV + zwB + zwS : 0;

  return clashes
    .filter(c => c.accepted !== false)
    .map(c => ({
      x: Math.max(0, c.zoneX - expandX),
      y: Math.max(0, c.zoneY - expandY),
      width:  c.zoneWidth  + 2 * expandX,
      height: c.zoneHeight + 2 * expandY,
      label: c.name,
      type: c.type,
      isClash: true,
    }));
}
