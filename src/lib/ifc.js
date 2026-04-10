const WEB_IFC_VERSION = "0.0.77";
const CDN_BASE = `https://cdn.jsdelivr.net/npm/web-ifc@${WEB_IFC_VERSION}`;

let _api = null;
let _loading = null;

function addScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Kon ${src} niet laden`));
    document.head.appendChild(s);
  });
}

async function loadWebIFC() {
  if (window.WebIFC) return;
  await addScript(`${CDN_BASE}/web-ifc-api-iife.js`);
  if (!window.WebIFC) throw new Error("WebIFC niet beschikbaar na laden");
}

export async function getApi() {
  if (!_loading) _loading = loadWebIFC();
  await _loading;
  if (!_api) {
    _api = new window.WebIFC.IfcAPI();
    await _api.Init((path) => `${CDN_BASE}/${path}`);
  }
  return { IFC: window.WebIFC, api: _api };
}

function getBBox(api, modelID, expressID) {
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

  return ok ? { minX, maxX, minY, maxY, minZ, maxZ } : null;
}

function getFacadePolygon(api, modelID, expressID, lAxis, hAxis, wallBB) {
  let mesh;
  try { mesh = api.GetFlatMesh(modelID, expressID); } catch { return null; }
  if (!mesh || mesh.geometries.size() === 0) return null;

  const GRID = 15;
  const wallMinL = wallBB[`min${lAxis.toUpperCase()}`];
  const wallMinH = wallBB[`min${hAxis.toUpperCase()}`];
  const cellSet = new Set();

  for (let gi = 0; gi < mesh.geometries.size(); gi++) {
    const placed = mesh.geometries.get(gi);
    let geom;
    try {
      geom = api.GetGeometry(modelID, placed.geometryExpressID);
      const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
      const idxs  = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
      const m = placed.flatTransformation;

      const project = (vi) => {
        const lx = verts[vi], ly = verts[vi+1], lz = verts[vi+2];
        const wx = m[0]*lx+m[4]*ly+m[8]*lz+m[12];
        const wy = m[1]*lx+m[5]*ly+m[9]*lz+m[13];
        const wz = m[2]*lx+m[6]*ly+m[10]*lz+m[14];
        const w = { x: wx, y: wy, z: wz };
        return { l: (w[lAxis] - wallMinL) * 1000, h: (w[hAxis] - wallMinH) * 1000 };
      };

      const addCell = (l, h) => cellSet.add(`${Math.round(l / GRID)},${Math.round(h / GRID)}`);
      const lerp = (a, b) => {
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b.l - a.l), Math.abs(b.h - a.h)) / GRID));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          addCell(a.l + t * (b.l - a.l), a.h + t * (b.h - a.h));
        }
      };

      for (let ti = 0; ti < idxs.length; ti += 3) {
        const a = project(idxs[ti] * 6);
        const b = project(idxs[ti+1] * 6);
        const c = project(idxs[ti+2] * 6);
        lerp(a, b); lerp(b, c); lerp(a, c);
      }
    } finally { geom?.delete(); }
  }

  if (!cellSet.size) return null;

  const parsed = [...cellSet].map(k => { const [gl, gh] = k.split(',').map(Number); return { gl, gh }; });
  const minGL = Math.min(...parsed.map(c => c.gl)) - 1;
  const maxGL = Math.max(...parsed.map(c => c.gl)) + 1;
  const minGH = Math.min(...parsed.map(c => c.gh)) - 1;
  const maxGH = Math.max(...parsed.map(c => c.gh)) + 1;
  if ((maxGL - minGL) * (maxGH - minGH) > 200000) return null;

  const outside = new Set();
  const queue = [`${minGL},${minGH}`];
  outside.add(queue[0]);
  while (queue.length) {
    const key = queue.shift();
    const [x, y] = key.split(',').map(Number);
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < minGL || nx > maxGL || ny < minGH || ny > maxGH) continue;
      const nk = `${nx},${ny}`;
      if (!outside.has(nk) && !cellSet.has(nk)) { outside.add(nk); queue.push(nk); }
    }
  }

  const filledSet = new Set(cellSet);
  for (let gl = minGL + 1; gl < maxGL; gl++) {
    for (let gh = minGH + 1; gh < maxGH; gh++) {
      if (!outside.has(`${gl},${gh}`)) filledSet.add(`${gl},${gh}`);
    }
  }

  const edgeMap = {};
  for (const k of filledSet) {
    const [gl, gh] = k.split(',').map(Number);
    const l0 = gl * GRID, h0 = gh * GRID, l1 = l0 + GRID, h1 = h0 + GRID;
    if (!filledSet.has(`${gl},${gh+1}`)) edgeMap[`${l0},${h1}`] = [l1, h1];
    if (!filledSet.has(`${gl},${gh-1}`)) edgeMap[`${l1},${h0}`] = [l0, h0];
    if (!filledSet.has(`${gl+1},${gh}`)) edgeMap[`${l1},${h1}`] = [l1, h0];
    if (!filledSet.has(`${gl-1},${gh}`)) edgeMap[`${l0},${h0}`] = [l0, h1];
  }

  const startKey = Object.keys(edgeMap)[0];
  if (!startKey) return null;
  const [sl, sh] = startKey.split(',').map(Number);
  const raw = [];
  let cl = sl, ch = sh;
  for (let iter = 0; iter < 100000; iter++) {
    raw.push({ l: cl, h: ch });
    const next = edgeMap[`${cl},${ch}`];
    if (!next) break;
    [cl, ch] = next;
    if (cl === sl && ch === sh) break;
  }

  const poly = [];
  for (let i = 0; i < raw.length; i++) {
    const prev = raw[(i - 1 + raw.length) % raw.length];
    const curr = raw[i];
    const next = raw[(i + 1) % raw.length];
    if (!((prev.l === curr.l && curr.l === next.l) || (prev.h === curr.h && curr.h === next.h))) {
      poly.push(curr);
    }
  }

  return poly.length >= 3 ? poly : null;
}

export async function scanIfcWallTypes(file) {
  const { IFC, api } = await getApi();
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);
  const modelID = api.OpenModel(data, {});

  try {
    const wallTypeMap = {};
    try {
      const relDefVec = api.GetLineIDsWithType(modelID, IFC.IFCRELDEFINESBYTYPE);
      for (let i = 0; i < relDefVec.size(); i++) {
        try {
          const rel = api.GetLine(modelID, relDefVec.get(i), false);
          const typeRef = rel?.RelatingType?.value;
          if (!typeRef) continue;
          const typeLine = api.GetLine(modelID, typeRef, false);
          const tName = typeLine?.Name?.value ?? null;
          const related = rel?.RelatedObjects;
          if (!related || !tName) continue;
          for (let j = 0; j < related.length; j++) {
            const wid = related[j]?.value;
            if (wid) wallTypeMap[wid] = tName;
          }
        } catch { }
      }
    } catch { }

    const typeCounts = {};
    const wallTypes = [IFC.IFCWALLSTANDARDCASE, IFC.IFCWALL];
    for (const wType of wallTypes) {
      const idsVec = api.GetLineIDsWithType(modelID, wType);
      for (let i = 0; i < idsVec.size(); i++) {
        const wID = idsVec.get(i);
        const tName = wallTypeMap[wID] ?? '(geen type)';
        typeCounts[tName] = (typeCounts[tName] ?? 0) + 1;
      }
    }

    return Object.entries(typeCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  } finally {
    api.CloseModel(modelID);
  }
}

export async function parseIfc(file, allowedTypes = null) {
  const { IFC, api } = await getApi();
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);
  const modelID = api.OpenModel(data, {});

  try {
    const wallTypeMap = {};
    try {
      const relDefVec = api.GetLineIDsWithType(modelID, IFC.IFCRELDEFINESBYTYPE);
      for (let i = 0; i < relDefVec.size(); i++) {
        try {
          const rel = api.GetLine(modelID, relDefVec.get(i), false);
          const typeRef = rel?.RelatingType?.value;
          if (!typeRef) continue;
          const typeLine = api.GetLine(modelID, typeRef, false);
          const tName = typeLine?.Name?.value ?? null;
          const related = rel?.RelatedObjects;
          if (!related || !tName) continue;
          for (let j = 0; j < related.length; j++) {
            const wid = related[j]?.value;
            if (wid) wallTypeMap[wid] = tName;
          }
        } catch { }
      }
    } catch { }

    const openingType = {};
    const fillerExpressID = {};
    const relFillsVec = api.GetLineIDsWithType(modelID, IFC.IFCRELFILLSELEMENT);
    for (let i = 0; i < relFillsVec.size(); i++) {
      try {
        const rel = api.GetLine(modelID, relFillsVec.get(i), false);
        const opID = rel?.RelatingOpeningElement?.value;
        const filID = rel?.RelatedBuildingElement?.value;
        if (!opID || !filID) continue;
        const raw = api.GetRawLineData(modelID, filID);
        const typeName = api.GetNameFromTypeCode(raw.type).toLowerCase();
        openingType[opID] = typeName.includes("window") ? "raam"
          : typeName.includes("door") ? "deur"
          : "sparing";
        fillerExpressID[opID] = filID;
      } catch { }
    }

    const wallVoids = {};
    const relVoidsVec = api.GetLineIDsWithType(modelID, IFC.IFCRELVOIDSELEMENT);
    for (let i = 0; i < relVoidsVec.size(); i++) {
      try {
        const rel = api.GetLine(modelID, relVoidsVec.get(i), false);
        const wID = rel?.RelatingBuildingElement?.value;
        const oID = rel?.RelatedOpeningElement?.value;
        if (!wID || !oID) continue;
        if (!wallVoids[wID]) wallVoids[wID] = [];
        wallVoids[wID].push(oID);
      } catch { }
    }

    const walls = [];
    const wallTypes = [IFC.IFCWALLSTANDARDCASE, IFC.IFCWALL];

    for (const wType of wallTypes) {
      const idsVec = api.GetLineIDsWithType(modelID, wType);
      for (let i = 0; i < idsVec.size(); i++) {
        const wID = idsVec.get(i);
        try {
          if (allowedTypes !== null) {
            const tName = wallTypeMap[wID] ?? '(geen type)';
            if (!allowedTypes.has(tName)) continue;
          }

          const wallBB = getBBox(api, modelID, wID);
          if (!wallBB) continue;

          const dx = wallBB.maxX - wallBB.minX;
          const dy = wallBB.maxY - wallBB.minY;
          const dz = wallBB.maxZ - wallBB.minZ;

          const sortedAxes = [
            { axis: "x", val: dx },
            { axis: "y", val: dy },
            { axis: "z", val: dz },
          ].sort((a, b) => a.val - b.val);

          const lengthAxis    = sortedAxes[2].axis;
          const heightAxis    = sortedAxes[1].axis;
          const thicknessAxis = sortedAxes[0].axis;

          const length = Math.round(sortedAxes[2].val * 1000);
          const height = Math.round(sortedAxes[1].val * 1000);

          if (length < 100 || height < 100) continue;

          const wallLine = api.GetLine(modelID, wID, false);
          const name = wallLine?.Name?.value ?? `Wand #${wID}`;

          const wallOrigin = {
            lengthStart:    Math.round(wallBB[`min${lengthAxis.toUpperCase()}`]    * 1000),
            heightStart:    Math.round(wallBB[`min${heightAxis.toUpperCase()}`]    * 1000),
            thicknessStart: Math.round(wallBB[`min${thicknessAxis.toUpperCase()}`] * 1000),
            thicknessEnd:   Math.round(wallBB[`max${thicknessAxis.toUpperCase()}`] * 1000),
            lengthAxis,
            heightAxis,
            thicknessAxis,
          };

          const openings = [];
          for (const oID of (wallVoids[wID] ?? [])) {
            try {
              const fillID = fillerExpressID[oID];
              const geomID = fillID ?? oID;

              const polygon = getFacadePolygon(api, modelID, geomID, lengthAxis, heightAxis, wallBB);

              const oBB = (fillID ? getBBox(api, modelID, fillID) : null) ?? getBBox(api, modelID, oID);
              if (!oBB && !polygon) continue;

              const wallMins = { x: wallBB.minX, y: wallBB.minY, z: wallBB.minZ };

              let oX, oY, oWidth, oHeight, polyPts;

              if (polygon && polygon.length >= 3) {
                const ls = polygon.map((p) => p.l);
                const hs = polygon.map((p) => p.h);
                const lMin = Math.min(...ls), lMax = Math.max(...ls);
                const hMin = Math.min(...hs), hMax = Math.max(...hs);
                oWidth  = Math.round(lMax - lMin);
                oHeight = Math.round(hMax - hMin);
                oX = Math.round(lMin);
                oY = Math.round(hMin);
                polyPts = polygon;
              } else if (oBB) {
                const odx = oBB.maxX - oBB.minX;
                const ody = oBB.maxY - oBB.minY;
                const odz = oBB.maxZ - oBB.minZ;
                const oDims = { x: odx, y: ody, z: odz };
                oWidth  = Math.round(oDims[lengthAxis] * 1000);
                oHeight = Math.round(oDims[heightAxis] * 1000);
                const oBBmins = { x: oBB.minX, y: oBB.minY, z: oBB.minZ };
                oX = Math.round((oBBmins[lengthAxis] - wallMins[lengthAxis]) * 1000);
                oY = Math.round((oBBmins[heightAxis] - wallMins[heightAxis]) * 1000);
                polyPts = null;
              } else continue;

              if (oWidth < 50 || oHeight < 50) continue;

              openings.push({
                id: oID,
                type: openingType[oID] ?? "sparing",
                x: Math.max(0, oX),
                y: Math.max(0, oY),
                breedte: oWidth,
                hoogte: oHeight,
                polyPts: polyPts ?? null,
              });
            } catch { }
          }

          walls.push({
            expressID: wID,
            name,
            length,
            height,
            openings,
            wallOrigin,
            typeName: wallTypeMap[wID] ?? null,
          });
        } catch { }
      }
    }

    return walls;
  } finally {
    api.CloseModel(modelID);
  }
}

function r(v) {
  const s = String(Number(v));
  return s.includes('.') ? s : s + '.';
}

export function exportGroupsToIfc(groups, wallSettings, fileName) {
  let eid = 1;
  const dataLines = [];
  const E  = (str) => { const id = eid++; dataLines.push(`#${id}=${str};`); return id; };
  const G  = (() => { let n = 1; return () => `'MI${String(n++).padStart(20,'0')}'`; })();
  const PT = (x,y,z) => E(`IFCCARTESIANPOINT((${r(x)},${r(y)},${r(z)}))`);

  const person = E(`IFCPERSON($,'User','','',$,$,$,$)`);
  const org    = E(`IFCORGANIZATION($,'MultiElementPlanner',$,$,$)`);
  const perOrg = E(`IFCPERSONANDORGANIZATION(#${person},#${org},$)`);
  const app    = E(`IFCAPPLICATION(#${org},'1.0','MultiElementPlanner','MEP')`);
  const owH    = E(`IFCOWNERHISTORY(#${perOrg},#${app},$,.ADDED.,$,$,$,0)`);
  const mmUnit = E(`IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)`);
  const units  = E(`IFCUNITASSIGNMENT((#${mmUnit}))`);
  const wpt    = PT(0,0,0);
  const wax    = E(`IFCAXIS2PLACEMENT3D(#${wpt},$,$)`);
  const gCtx   = E(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#${wax},$)`);
  const gSub   = E(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#${gCtx},$,.MODEL_VIEW.,$)`);
  const proj   = E(`IFCPROJECT(${G()},#${owH},'${(fileName || 'BrickslipExport').replace(/'/g,"\\'")}' ,$,$,$,$,(#${gCtx}),#${units})`);
  const sitePl = E(`IFCLOCALPLACEMENT($,#${wax})`);
  const site   = E(`IFCSITE(${G()},#${owH},'Site',$,$,#${sitePl},$,$,.ELEMENT.,$,$,$,$,$)`);
  const bldPl  = E(`IFCLOCALPLACEMENT(#${sitePl},#${wax})`);
  const bld    = E(`IFCBUILDING(${G()},#${owH},'Building',$,$,#${bldPl},$,$,.ELEMENT.,$,$,$)`);
  const stPl   = E(`IFCLOCALPLACEMENT(#${bldPl},#${wax})`);
  const storey = E(`IFCBUILDINGSTOREY(${G()},#${owH},'Storey',$,$,#${stPl},$,$,.ELEMENT.,0.)`);
  E(`IFCRELAGGREGATES(${G()},#${owH},$,$,#${proj},(#${site}))`);
  E(`IFCRELAGGREGATES(${G()},#${owH},$,$,#${site},(#${bld}))`);
  E(`IFCRELAGGREGATES(${G()},#${owH},$,$,#${bld},(#${storey}))`);

  const pt2D   = E(`IFCCARTESIANPOINT((0.,0.))`);
  const extDir = E(`IFCDIRECTION((0.,0.,1.))`);
  const sAx0   = E(`IFCAXIS2PLACEMENT3D(#${PT(0,0,0)},$,$)`);

  const colorCache = {};
  const getStyle = (hex) => {
    if (colorCache[hex]) return colorCache[hex];
    const rv = (parseInt(hex.slice(1,3),16)/255).toFixed(4);
    const gv = (parseInt(hex.slice(3,5),16)/255).toFixed(4);
    const bv = (parseInt(hex.slice(5,7),16)/255).toFixed(4);
    const rgb  = E(`IFCCOLOURRGB($,${rv},${gv},${bv})`);
    const rend = E(`IFCSURFACESTYLERENDERING(#${rgb},0.,$,$,$,$,$,$,.FLAT.)`);
    const ss   = E(`IFCSURFACESTYLE($,.BOTH.,(#${rend}))`);
    const psa  = E(`IFCPRESENTATIONSTYLEASSIGNMENT((#${ss}))`);
    colorCache[hex] = psa;
    return psa;
  };

  const allProxyIds = [];

  for (const group of groups) {
    const settings = wallSettings[group.id] ?? {};
    const brickColor = settings.color ?? '#a64033';
    const brickD = settings.brickDepth ?? 20;
    const material = settings.material ?? { steenL: 210, steenH: 50, lint: 12, stoot: 10 };

    for (const wallData of (group.wallsWithRows ?? [])) {
      const { wall, rows } = wallData;
      const wo = wall.wallOrigin;

      const toWorld = (localX, localDepth, localZ) => {
        if (!wo) return [localX / 1000, localDepth / 1000, localZ / 1000];
        const p = { x: 0, y: 0, z: 0 };
        p[wo.lengthAxis]    = (wo.lengthStart    + localX) / 1000;
        p[wo.thicknessAxis] = (wo.thicknessStart + localDepth) / 1000;
        p[wo.heightAxis]    = (wo.heightStart    + localZ) / 1000;
        return [p.x, p.y, p.z];
      };

      let axisId = null, refDirId = null;
      if (wo) {
        if (wo.lengthAxis !== 'x') { const v = wo.lengthAxis === 'y' ? '0.,1.,0.' : '0.,0.,1.'; refDirId = E(`IFCDIRECTION((${v}))`); }
        if (wo.heightAxis !== 'z') { const v = wo.heightAxis === 'y' ? '0.,1.,0.' : '1.,0.,0.'; axisId   = E(`IFCDIRECTION((${v}))`); }
      }
      const axisStr = axisId   ? `#${axisId}`   : '$';
      const refStr  = refDirId ? `#${refDirId}` : '$';

      for (const row of rows) {
        for (const piece of row.pieces) {
          const [wx, wy, wz] = toWorld(piece.start + piece.length / 2, brickD / 2, row.y);
          const placePt = PT(wx, wy, wz);
          const place3D = E(`IFCAXIS2PLACEMENT3D(#${placePt},${axisStr},${refStr})`);
          const localPl = E(`IFCLOCALPLACEMENT(#${stPl},#${place3D})`);
          const profAx  = E(`IFCAXIS2PLACEMENT2D(#${pt2D},$)`);
          const prof    = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${profAx},${r(piece.length)},${r(brickD)})`);
          const solid   = E(`IFCEXTRUDEDAREASOLID(#${prof},#${sAx0},#${extDir},${r(material.steenH)})`);
          const shRep   = E(`IFCSHAPEREPRESENTATION(#${gSub},'Body','SweptSolid',(#${solid}))`);
          const pds     = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shRep}))`);
          const safeName = `${group.name ?? 'Groep'} - ${wall.name} - ${piece.label}`.replace(/'/g, "\\'");
          const proxy   = E(`IFCBUILDINGELEMENTPROXY(${G()},#${owH},'${safeName}',$,'Steenstrip',#${localPl},#${pds},$,.NOTDEFINED.)`);
          const styleId = getStyle(brickColor);
          E(`IFCSTYLEDITEM(#${solid},(#${styleId}),$)`);
          allProxyIds.push(proxy);
        }
      }
    }
  }

  if (allProxyIds.length) {
    E(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${G()},#${owH},$,$,(${allProxyIds.map(i=>`#${i}`).join(',')}),#${storey})`);
  }

  const ts = new Date().toISOString();
  const header = [
    'ISO-10303-21;', 'HEADER;',
    `FILE_DESCRIPTION(('Multi-element brickslip export'),'2;1');`,
    `FILE_NAME('${fileName ?? 'export'}.ifc','${ts}',(''),('MultiElementPlanner'),'','','');`,
    `FILE_SCHEMA(('IFC2X3'));`, 'ENDSEC;', 'DATA;',
  ].join('\n');

  const content = header + '\n' + dataLines.join('\n') + '\nENDSEC;\nEND-ISO-10303-21;';

  const blob = new Blob([content], { type: 'application/x-step' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName ?? 'export'}_brickslips.ifc`;
  a.click();
  URL.revokeObjectURL(url);
}
