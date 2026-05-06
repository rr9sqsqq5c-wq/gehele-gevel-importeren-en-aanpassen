import { getOpeningPoly } from './pattern.js';
let _api = null;
let _loading = null;
let _cachedModel = null;

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
  await addScript(`/web-ifc-api-iife.js`);
  if (!window.WebIFC) throw new Error("WebIFC niet beschikbaar na laden");
}

export function warmupWebIFC() {
  if (!_loading) _loading = loadWebIFC();
}

export async function getApi() {
  if (!_loading) _loading = loadWebIFC();
  await _loading;
  if (!_api) {
    _api = new window.WebIFC.IfcAPI();
    await _api.Init((path) => `/${path}`);
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
  let localXDir = null;
  let localYDir = null;

  for (let gi = 0; gi < mesh.geometries.size(); gi++) {
    const placed = mesh.geometries.get(gi);
    let geom;
    try {
      geom = api.GetGeometry(modelID, placed.geometryExpressID);
      const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
      const m = placed.flatTransformation;

      if (!localXDir) {
        localXDir = { x: m[0], y: m[1], z: m[2] };
      }
      if (!localYDir) {
        localYDir = { x: m[4], y: m[5], z: m[6] };
      }

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

  return ok ? { minX, maxX, minY, maxY, minZ, maxZ, localXDir, localYDir } : null;
}

function getFacadePolygon(api, modelID, expressID, lAxis, hAxis, wallBB) {
  let mesh;
  try { mesh = api.GetFlatMesh(modelID, expressID); } catch { return null; }
  if (!mesh || mesh.geometries.size() === 0) return null;

  const GRID = 20;
  const wallMinL = wallBB[`min${lAxis.toUpperCase()}`];
  const wallMinH = wallBB[`min${hAxis.toUpperCase()}`];
  const wallLenMM = (wallBB[`max${lAxis.toUpperCase()}`] - wallMinL) * 1000;
  const wallHgtMM = (wallBB[`max${hAxis.toUpperCase()}`] - wallMinH) * 1000;
  const MARGIN = 600;

  let minGL = Infinity, maxGL = -Infinity, minGH = Infinity, maxGH = -Infinity;
  const cellArr = [];

  for (let gi = 0; gi < mesh.geometries.size(); gi++) {
    const placed = mesh.geometries.get(gi);
    let geom;
    try {
      geom = api.GetGeometry(modelID, placed.geometryExpressID);
      const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
      const idxs  = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
      const m = placed.flatTransformation;

      const lI = lAxis === 'x' ? 0 : lAxis === 'y' ? 1 : 2;
      const hI = hAxis === 'x' ? 0 : hAxis === 'y' ? 1 : 2;
      const wallMinLv = wallBB[`min${lAxis.toUpperCase()}`];
      const wallMinHv = wallBB[`min${hAxis.toUpperCase()}`];

      const projectL = (vi) => {
        const lx = verts[vi], ly = verts[vi+1], lz = verts[vi+2];
        const wx = m[0]*lx+m[4]*ly+m[8]*lz+m[12];
        const wy = m[1]*lx+m[5]*ly+m[9]*lz+m[13];
        const wz = m[2]*lx+m[6]*ly+m[10]*lz+m[14];
        const wArr = [wx, wy, wz];
        return (wArr[lI] - wallMinLv) * 1000;
      };
      const projectH = (vi) => {
        const lx = verts[vi], ly = verts[vi+1], lz = verts[vi+2];
        const wx = m[0]*lx+m[4]*ly+m[8]*lz+m[12];
        const wy = m[1]*lx+m[5]*ly+m[9]*lz+m[13];
        const wz = m[2]*lx+m[6]*ly+m[10]*lz+m[14];
        const wArr = [wx, wy, wz];
        return (wArr[hI] - wallMinHv) * 1000;
      };

      const tmpSet = new Set();
      for (let ti = 0; ti < idxs.length; ti += 3) {
        const ai = idxs[ti] * 6, bi = idxs[ti+1] * 6, ci = idxs[ti+2] * 6;
        const al = projectL(ai), ah = projectH(ai);
        const bl = projectL(bi), bh = projectH(bi);
        const cl2 = projectL(ci), ch2 = projectH(ci);
        if (al < -MARGIN && bl < -MARGIN && cl2 < -MARGIN) continue;
        if (ah < -MARGIN && bh < -MARGIN && ch2 < -MARGIN) continue;
        if (al > wallLenMM+MARGIN && bl > wallLenMM+MARGIN && cl2 > wallLenMM+MARGIN) continue;
        if (ah > wallHgtMM+MARGIN && bh > wallHgtMM+MARGIN && ch2 > wallHgtMM+MARGIN) continue;

        const addSeg = (l1, h1, l2, h2) => {
          const steps = Math.max(1, Math.ceil(Math.max(Math.abs(l2-l1), Math.abs(h2-h1)) / GRID));
          for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const gl = Math.round((l1 + t*(l2-l1)) / GRID);
            const gh = Math.round((h1 + t*(h2-h1)) / GRID);
            tmpSet.add(gl * 65536 + gh);
          }
        };
        addSeg(al,ah,bl,bh); addSeg(bl,bh,cl2,ch2); addSeg(al,ah,cl2,ch2);
      }
      for (const k of tmpSet) {
        const gl = (k / 65536) | 0, gh = k - gl * 65536;
        if (gl < minGL) minGL = gl; if (gl > maxGL) maxGL = gl;
        if (gh < minGH) minGH = gh; if (gh > maxGH) maxGH = gh;
        cellArr.push(k);
      }
    } finally { geom?.delete(); }
  }

  if (!cellArr.length) return null;

  minGL -= 1; maxGL += 1; minGH -= 1; maxGH += 1;
  const gridArea = (maxGL - minGL + 1) * (maxGH - minGH + 1);
  if (gridArea > 300000) return null;

  const W = maxGL - minGL + 1;
  const H = maxGH - minGH + 1;
  const cellBits = new Uint8Array(W * H);
  for (const k of cellArr) {
    const gl = (k / 65536) | 0, gh = k - gl * 65536;
    cellBits[(gl - minGL) * H + (gh - minGH)] = 1;
  }

  const outsideBits = new Uint8Array(W * H);
  const queue = [];
  const startIdx = 0;
  outsideBits[startIdx] = 1;
  queue.push(startIdx);
  let qi = 0;
  while (qi < queue.length) {
    const idx = queue[qi++];
    const gx = (idx / H) | 0, gy = idx - gx * H;
    const neighbors = [
      gx > 0     ? (gx-1)*H+gy : -1,
      gx < W-1   ? (gx+1)*H+gy : -1,
      gy > 0     ? gx*H+(gy-1) : -1,
      gy < H-1   ? gx*H+(gy+1) : -1,
    ];
    for (const ni of neighbors) {
      if (ni < 0) continue;
      if (!outsideBits[ni] && !cellBits[ni]) { outsideBits[ni] = 1; queue.push(ni); }
    }
  }

  const filledBits = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) filledBits[i] = cellBits[i] || (outsideBits[i] ? 0 : 1);

  const edgeMap = new Map();
  for (let gx = 0; gx < W; gx++) {
    for (let gy = 0; gy < H; gy++) {
      if (!filledBits[gx * H + gy]) continue;
      const gl = gx + minGL, gh = gy + minGH;
      const l0 = gl * GRID, h0 = gh * GRID, l1 = l0 + GRID, h1 = h0 + GRID;
      const hasTop    = gy < H-1 && filledBits[gx*H+(gy+1)];
      const hasBottom = gy > 0   && filledBits[gx*H+(gy-1)];
      const hasRight  = gx < W-1 && filledBits[(gx+1)*H+gy];
      const hasLeft   = gx > 0   && filledBits[(gx-1)*H+gy];
      if (!hasTop)    edgeMap.set(`${l0},${h1}`, [l1, h1]);
      if (!hasBottom) edgeMap.set(`${l1},${h0}`, [l0, h0]);
      if (!hasRight)  edgeMap.set(`${l1},${h1}`, [l1, h0]);
      if (!hasLeft)   edgeMap.set(`${l0},${h0}`, [l0, h1]);
    }
  }

  const startKey = edgeMap.keys().next().value;
  if (!startKey) return null;
  const [sl, sh] = startKey.split(',').map(Number);
  const raw = [];
  let cl = sl, ch = sh;
  for (let iter = 0; iter < 100000; iter++) {
    raw.push({ l: cl, h: ch });
    const next = edgeMap.get(`${cl},${ch}`);
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

function validateWallGeometryShape(facadePoly, dims, heightAxis) {
  const issues = [];
  let suggestedClass = null;

  if (heightAxis !== 'z') {
    issues.push(`Hoogte-as is '${heightAxis.toUpperCase()}' in plaats van 'Z' — element lijkt horizontaal`);
    suggestedClass = 'IfcSlab';
  }

  if (facadePoly && facadePoly.length >= 3) {
    const n = facadePoly.length;
    if (n !== 4) {
      const hs = facadePoly.map(p => p.h);
      const maxH = Math.max(...hs), minH = Math.min(...hs);
      const topPts = facadePoly.filter(p => p.h > minH + (maxH - minH) * 0.7);
      const hasSlopedTop = topPts.length > 1 &&
        (Math.max(...topPts.map(p => p.h)) - Math.min(...topPts.map(p => p.h))) > 50;
      if (hasSlopedTop) {
        issues.push(`Hellend/puntig bovenprofiel gedetecteerd (${n} hoekpunten)`);
        suggestedClass = suggestedClass ?? 'IfcRoof';
      } else {
        issues.push(`Niet-rechthoekig profiel: ${n} hoekpunten (verwacht 4)`);
        suggestedClass = suggestedClass ?? 'IfcBuildingElementProxy';
      }
    } else {
      let maxCosAngle = 0;
      for (let i = 0; i < 4; i++) {
        const p = facadePoly[i], q = facadePoly[(i + 1) % 4], r = facadePoly[(i + 2) % 4];
        const v1l = q.l - p.l, v1h = q.h - p.h;
        const v2l = r.l - q.l, v2h = r.h - q.h;
        const dot = v1l * v2l + v1h * v2h;
        const mag = Math.sqrt((v1l ** 2 + v1h ** 2) * (v2l ** 2 + v2h ** 2));
        const cosA = mag > 0 ? Math.abs(dot / mag) : 0;
        if (cosA > maxCosAngle) maxCosAngle = cosA;
      }
      if (maxCosAngle > 0.15) {
        issues.push(`Hoeken niet loodrecht (max afwijking ≈ ${Math.round(Math.asin(Math.min(1, maxCosAngle)) * 180 / Math.PI)}°)`);
        suggestedClass = suggestedClass ?? 'IfcBuildingElementProxy';
      }
      const sortedByH = [...facadePoly].sort((a, b) => b.h - a.h);
      const topEdgeDeltaH = Math.abs(sortedByH[0].h - sortedByH[1].h);
      if (topEdgeDeltaH > 50) {
        issues.push(`Bovenkant niet horizontaal (hoogteverschil: ${Math.round(topEdgeDeltaH)} mm)`);
        suggestedClass = suggestedClass ?? 'IfcRoof';
      }
    }
  } else if (!facadePoly) {
    if (dims.thickness > dims.height * 0.5) {
      issues.push('Dikte vergelijkbaar met hoogte — geometrie onzeker, mogelijk geen wand');
      suggestedClass = suggestedClass ?? 'IfcSlab';
    }
  }

  return { issues, suggestedClass: suggestedClass ?? (issues.length > 0 ? 'IfcBuildingElementProxy' : null) };
}

export async function runGeometryValidation(file, onProgress = null) {
  const { IFC, api } = await getApi();

  let modelID, ownModel = false;
  if (_cachedModel && _cachedModel.name === file.name && _cachedModel.size === file.size) {
    modelID = _cachedModel.modelID;
  } else {
    if (_cachedModel) { try { api.CloseModel(_cachedModel.modelID); } catch {} _cachedModel = null; }
    const buffer = await file.arrayBuffer();
    modelID = api.OpenModel(new Uint8Array(buffer), {});
    ownModel = true;
  }

  const report = [];
  try {
    const allWallIDs = [];
    for (const wType of [IFC.IFCWALLSTANDARDCASE, IFC.IFCWALL]) {
      const idsVec = api.GetLineIDsWithType(modelID, wType);
      for (let i = 0; i < idsVec.size(); i++) allWallIDs.push({ id: idsVec.get(i), wType });
    }

    onProgress?.({ current: 0, total: allWallIDs.length, log: `${allWallIDs.length} IfcWall elementen valideren…` });

    let processed = 0, lastYield = Date.now();
    for (const { id: wID, wType } of allWallIDs) {
      try {
        const wallBB = getBBox(api, modelID, wID);
        if (wallBB) {
          const dx = wallBB.maxX - wallBB.minX, dy = wallBB.maxY - wallBB.minY, dz = wallBB.maxZ - wallBB.minZ;
          const sortedAxes = [{ axis: 'x', val: dx }, { axis: 'y', val: dy }, { axis: 'z', val: dz }]
            .sort((a, b) => a.val - b.val);
          const lengthAxis = sortedAxes[2].axis, heightAxis = sortedAxes[1].axis, thicknessAxis = sortedAxes[0].axis;
          const length = Math.round(sortedAxes[2].val * 1000);
          const height = Math.round(sortedAxes[1].val * 1000);
          const thickness = Math.round(sortedAxes[0].val * 1000);
          if (length >= 100 && height >= 100) {
            const wallLine = api.GetLine(modelID, wID, false);
            const name = wallLine?.Name?.value ?? `Wand #${wID}`;
            const ifcClass = wType === IFC.IFCWALLSTANDARDCASE ? 'IfcWallStandardCase' : 'IfcWall';
            const facadePoly = getFacadePolygon(api, modelID, wID, lengthAxis, heightAxis, wallBB);
            const { issues, suggestedClass } = validateWallGeometryShape(facadePoly, { length, height, thickness }, heightAxis);
            if (issues.length > 0) {
              report.push({ expressID: wID, name, ifcClass, lengthAxis, heightAxis, thicknessAxis, length, height, thickness, facadePoly, issues, suggestedClass, overrideInclude: false });
            }
          }
        }
      } catch { }
      processed++;
      onProgress?.({ current: processed, total: allWallIDs.length });
      const now = Date.now();
      if (now - lastYield > 50) { lastYield = now; await new Promise(r => setTimeout(r, 0)); }
    }
    onProgress?.({ current: allWallIDs.length, total: allWallIDs.length, log: `Validatie klaar: ${report.length} mogelijke misclassificaties gevonden` });
    return report;
  } finally {
    if (ownModel) { try { api.CloseModel(modelID); } catch {} }
  }
}

export async function scanIfcWallTypes(file) {
  if (_cachedModel && _cachedModel.name === file.name && _cachedModel.size === file.size) {
    return _cachedModel.types;
  }

  const text = await file.text();
  const flat = text.replace(/\r?\n/g, ' ');

  const typeIdToName = {};
  const wallIds = new Set();
  const wallObjectType = {};
  const relRecords = [];

  const RECORD_RE = /#(\d+)\s*=\s*IFC(WALL(?:STANDARDCASE)?|WALLTYPE|RELDEFINESBYTYPE)\s*\(/gi;
  let m;
  while ((m = RECORD_RE.exec(flat)) !== null) {
    const id = m[1];
    const ifcType = m[2].toUpperCase();
    const start = RECORD_RE.lastIndex - 1;

    let end = start + 1;
    let depth = 1;
    let inStr = false;
    while (end < flat.length && depth > 0) {
      const c = flat[end];
      if (c === "'" && !inStr) inStr = true;
      else if (c === "'" && inStr) inStr = false;
      else if (!inStr) {
        if (c === '(') depth++;
        else if (c === ')') depth--;
      }
      end++;
    }
    const inner = flat.slice(start + 1, end - 1);
    RECORD_RE.lastIndex = end;

    if (ifcType === 'WALL' || ifcType === 'WALLSTANDARDCASE') {
      wallIds.add(id);
      const parts = splitStepArgs(inner);
      const objType = unquoteStep(parts[4]);
      if (objType) wallObjectType[id] = objType;
    } else if (ifcType === 'WALLTYPE') {
      const parts = splitStepArgs(inner);
      const name = unquoteStep(parts[2]) ?? unquoteStep(parts[8]);
      if (name) typeIdToName[id] = name;
    } else if (ifcType === 'RELDEFINESBYTYPE') {
      relRecords.push(inner);
    }
  }

  const wallToType = {};
  for (const inner of relRecords) {
    const parts = splitStepArgs(inner);
    const relatedRaw = parts[4] ?? '';
    const typeRaw = (parts[5] ?? '').trim().replace(/^#/, '');
    const tName = typeIdToName[typeRaw];
    if (!tName) continue;
    const idMatches = relatedRaw.match(/#(\d+)/g);
    if (!idMatches) continue;
    for (const ref of idMatches) {
      const wid = ref.slice(1);
      if (wallIds.has(wid)) wallToType[wid] = tName;
    }
  }

  const typeCounts = {};
  for (const wid of wallIds) {
    const name = wallToType[wid] ?? wallObjectType[wid] ?? '(geen type)';
    typeCounts[name] = (typeCounts[name] ?? 0) + 1;
  }

  return Object.entries(typeCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function extractInner(rec) {
  const start = rec.indexOf('(');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < rec.length; i++) {
    if (rec[i] === '(') depth++;
    else if (rec[i] === ')') { depth--; if (depth === 0) return rec.slice(start + 1, i); }
  }
  return null;
}

function splitStepArgs(str) {
  const parts = [];
  let depth = 0, cur = '', inStr = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === "'" && !inStr) { inStr = true; cur += c; }
    else if (c === "'" && inStr) { inStr = false; cur += c; }
    else if (inStr) { cur += c; }
    else if (c === '(' || c === '[') { depth++; cur += c; }
    else if (c === ')' || c === ']') { depth--; cur += c; }
    else if (c === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function unquoteStep(s) {
  if (!s) return null;
  s = s.trim();
  if (s === '$' || s === '') return null;
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  return null;
}

export async function parseIfc(file, allowedTypes = null, onProgress = null) {
  const { IFC, api } = await getApi();

  let modelID, wallTypeMap, ownModel = false;
  if (_cachedModel && _cachedModel.name === file.name && _cachedModel.size === file.size) {
    modelID     = _cachedModel.modelID;
    wallTypeMap = _cachedModel.wallTypeMap;
  } else {
    if (_cachedModel) {
      try { api.CloseModel(_cachedModel.modelID); } catch {}
      _cachedModel = null;
    }
    const buffer = await file.arrayBuffer();
    const data   = new Uint8Array(buffer);
    modelID      = api.OpenModel(data, {});
    wallTypeMap  = {};
    ownModel     = true;
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
  }

  try {

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
    const wallTypesList2 = [IFC.IFCWALLSTANDARDCASE, IFC.IFCWALL];

    let totalWalls = 0;
    const allWallIDs = [];
    for (const wType of wallTypesList2) {
      const idsVec = api.GetLineIDsWithType(modelID, wType);
      for (let i = 0; i < idsVec.size(); i++) {
        const wID = idsVec.get(i);
        if (allowedTypes !== null) {
          const tName = wallTypeMap[wID] ?? '(geen type)';
          if (!allowedTypes.has(tName)) continue;
        }
        allWallIDs.push(wID);
        totalWalls++;
      }
    }

    onProgress?.({ phase: 'init', log: `web-ifc model geopend, ${totalWalls} wanden in selectie` });
    onProgress?.({ phase: 'wanden', current: 0, total: totalWalls });

    let processed = 0;
    let lastYield = Date.now();
    for (const wID of allWallIDs) {
        try {
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

          let wallInsideThickDir = 0;
          if (wallBB.localYDir) {
            const comp = wallBB.localYDir[thicknessAxis] ?? 0;
            if (Math.abs(comp) > 0.5) wallInsideThickDir = comp > 0 ? 1 : -1;
          }

          let wallLengthDir = null;
          if (wallBB.localXDir) {
            const { x, y, z } = wallBB.localXDir;
            const len = Math.sqrt(x * x + y * y + z * z);
            if (len > 0.01) wallLengthDir = { x: x / len, y: y / len, z: z / len };
          }

          const wallOrigin = {
            lengthStart:    Math.round(wallBB[`min${lengthAxis.toUpperCase()}`]    * 1000),
            heightStart:    Math.round(wallBB[`min${heightAxis.toUpperCase()}`]    * 1000),
            thicknessStart: Math.round(wallBB[`min${thicknessAxis.toUpperCase()}`] * 1000),
            thicknessEnd:   Math.round(wallBB[`max${thicknessAxis.toUpperCase()}`] * 1000),
            lengthAxis,
            heightAxis,
            thicknessAxis,
            wallInsideThickDir,
            wallLengthDir,
          };

          const openings = [];
          for (const oID of (wallVoids[wID] ?? [])) {
            try {
              const fillID = fillerExpressID[oID];

              let polygon = getFacadePolygon(api, modelID, oID, lengthAxis, heightAxis, wallBB);
              const polyFromOID = !!polygon;
              if (!polygon && fillID) {
                polygon = getFacadePolygon(api, modelID, fillID, lengthAxis, heightAxis, wallBB);
              }


              const oBB = getBBox(api, modelID, oID) ?? (fillID ? getBBox(api, modelID, fillID) : null);
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

              const finalX = Math.max(0, oX);
              const finalY = Math.max(0, oY);
              const finalPolyPts = polyPts ?? [
                { l: finalX,           h: finalY },
                { l: finalX + oWidth,  h: finalY },
                { l: finalX + oWidth,  h: finalY + oHeight },
                { l: finalX,           h: finalY + oHeight },
              ];
              openings.push({
                id: oID,
                type: openingType[oID] ?? "sparing",
                x: finalX,
                y: finalY,
                breedte: oWidth,
                hoogte: oHeight,
                polyPts: finalPolyPts,
              });
            } catch { }
          }

          const facadePoly = getFacadePolygon(api, modelID, wID, lengthAxis, heightAxis, wallBB);
          walls.push({
            expressID: wID,
            name,
            length,
            height,
            openings,
            wallOrigin,
            facadePoly: facadePoly ?? null,
            typeName: wallTypeMap[wID] ?? null,
          });
        } catch { }

        processed++;
        onProgress?.({ phase: 'wanden', current: processed, total: totalWalls });
        const now = Date.now();
        if (now - lastYield > 50) {
          lastYield = now;
          await new Promise(r => setTimeout(r, 0));
        }
      }

    return walls;
  } finally {
    if (ownModel) {
      api.CloseModel(modelID);
    } else {
      try { api.CloseModel(modelID); } catch {}
      _cachedModel = null;
    }
  }
}

export async function parseIfcGridLines(file) {
  if (_cachedModel && _cachedModel.name === file.name && _cachedModel.size === file.size && _cachedModel.gridLines) {
    return _cachedModel.gridLines;
  }

  const text = await file.text();
  const flat = text.replace(/\r?\n/g, ' ');

  const records = {};
  const RE = /#(\d+)\s*=\s*(IFCGRID|IFCGRIDAXIS|IFCLINE|IFCPOLYLINE|IFCCARTESIANPOINT)\s*\(/gi;
  let m;
  while ((m = RE.exec(flat)) !== null) {
    const id = m[1];
    const type = m[2].toUpperCase();
    const start = RE.lastIndex - 1;
    let end = start + 1, depth = 1, inStr = false;
    while (end < flat.length && depth > 0) {
      const c = flat[end];
      if (c === "'" && !inStr) inStr = true;
      else if (c === "'" && inStr) inStr = false;
      else if (!inStr) { if (c === '(') depth++; else if (c === ')') depth--; }
      end++;
    }
    records[id] = { type, inner: flat.slice(start + 1, end - 1) };
    RE.lastIndex = end;
  }

  function getCartesianPoint(id) {
    const rec = records[id];
    if (!rec || rec.type !== 'IFCCARTESIANPOINT') return null;
    const inner = rec.inner.replace(/^\(/, '').replace(/\)$/, '');
    const coords = inner.split(',').map((s) => parseFloat(s.trim()));
    return { x: (coords[0] ?? 0) * 1000, y: (coords[1] ?? 0) * 1000, z: (coords[2] ?? 0) * 1000 };
  }

  function getCurveFirstPoint(id) {
    const rec = records[id];
    if (!rec) return null;
    const args = splitStepArgs(rec.inner);
    if (rec.type === 'IFCLINE') {
      const ref = args[0]?.trim().replace('#', '');
      return getCartesianPoint(ref);
    }
    if (rec.type === 'IFCPOLYLINE') {
      const pts = args[0]?.match(/#(\d+)/g);
      if (pts?.length) return getCartesianPoint(pts[0].slice(1));
    }
    return null;
  }

  const result = [];
  for (const [, rec] of Object.entries(records)) {
    if (rec.type !== 'IFCGRID') continue;
    const args = splitStepArgs(rec.inner);
    const uRefs = (args[7] ?? '').match(/#(\d+)/g) ?? [];
    const vRefs = (args[8] ?? '').match(/#(\d+)/g) ?? [];
    for (const [axisType, refs] of [['U', uRefs], ['V', vRefs]]) {
      for (const ref of refs) {
        const axisRec = records[ref.slice(1)];
        if (!axisRec || axisRec.type !== 'IFCGRIDAXIS') continue;
        const aArgs = splitStepArgs(axisRec.inner);
        const tag = unquoteStep(aArgs[0]) ?? ref.slice(1);
        const curveRef = aArgs[2]?.trim().replace(/^#/, '');
        const pt = getCurveFirstPoint(curveRef);
        if (pt) result.push({ tag, axisType, x: pt.x, y: pt.y, z: pt.z });
      }
    }
  }

  if (_cachedModel) _cachedModel.gridLines = result;
  return result;
}

function r(v) {
  const s = String(Number(v));
  return s.includes('.') ? s : s + '.';
}

function calcOutsideFace(rwo, allWallOrigins) {
  if (!rwo) return { outsidePos: 0, outsideDir: 1 };
  const axis = rwo.thicknessAxis;
  const tStart = rwo.thicknessStart;
  const tEnd = rwo.thicknessEnd ?? rwo.thicknessStart + 200;

  if (rwo.wallInsideThickDir && rwo.wallInsideThickDir !== 0) {
    const outsideDir = -rwo.wallInsideThickDir;
    const outsidePos = outsideDir < 0 ? tStart : tEnd;
    return { outsidePos, outsideDir };
  }

  const wallsOnAxis = (allWallOrigins ?? []).filter((wo) => wo?.thicknessAxis === axis);
  const buildingMin = wallsOnAxis.length
    ? Math.min(...wallsOnAxis.map((wo) => wo.thicknessStart))
    : tStart;
  const buildingMax = wallsOnAxis.length
    ? Math.max(...wallsOnAxis.map((wo) => wo.thicknessEnd ?? wo.thicknessStart + 200))
    : tEnd;
  const distToMin = tStart - buildingMin;
  const distToMax = buildingMax - tEnd;
  return distToMin <= distToMax
    ? { outsidePos: tStart, outsideDir: -1 }
    : { outsidePos: tEnd, outsideDir: 1 };
}

export function exportGroupsToIfc(groups, wallSettings, fileName) {
  const allWallOrigins = groups.flatMap((g) =>
    (g.wallsWithRows ?? []).map((wd) => wd.wall?.wallOrigin).filter(Boolean)
  );
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
  const allRefWallOrigins = groups.flatMap((g) => g.refWallOrigin ? [g.refWallOrigin] : []);
  const haCount = { x: 0, y: 0, z: 0 };
  for (const rwo of allRefWallOrigins) haCount[rwo.heightAxis] = (haCount[rwo.heightAxis] ?? 0) + 1;
  const dominantHA = haCount.y >= haCount.z && haCount.y >= haCount.x ? 'y' : haCount.x >= haCount.z ? 'x' : 'z';
  const wcsAxisVec = dominantHA === 'y' ? [0,1,0] : dominantHA === 'x' ? [1,0,0] : [0,0,1];
  const wpt    = PT(0,0,0);
  const wcsAxisId = E(`IFCDIRECTION((${wcsAxisVec.join(',')}))`);
  const wax    = E(`IFCAXIS2PLACEMENT3D(#${wpt},#${wcsAxisId},$)`);
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
    const brickColor = settings.stripColor ?? settings.color ?? '#a64033';
    const brickD = settings.brickDepth ?? 20;
    const material = settings.material ?? { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
    const groupVerband = settings.verband ?? 'halfsteens';
    const groupBrickExtH = groupVerband === 'staand_tegelverband' ? material.steenL : material.steenH;
    const panelDikte = settings.panelen?.dikte ?? 8;
    const latDikte = group.latDikte ?? 28;
    const hasVertLat = (group.lattenData ?? []).some((l) => l.richting === 'verticaal');
    const effectiveLatDepth = hasVertLat ? 2 * latDikte : latDikte;
    const vis = group.layerVisibility ?? {};
    const rwo = group.refWallOrigin;
    const groupMinX = group.groupMinX ?? 0;
    const groupMinH = group.groupMinH ?? 0;

    const makeGroupAxes = () => {
      if (!rwo) return { axisStr: '$', refStr: '$' };
      const ha = rwo.heightAxis;
      const la = rwo.lengthAxis;
      const mkDir = (v) => `#${E(`IFCDIRECTION((${v.join(',')}))`)}`;
      const axisStr = ha === 'z' ? mkDir([0,0,1]) : ha === 'y' ? mkDir([0,1,0]) : mkDir([1,0,0]);
      const refStr  = la === 'x' ? mkDir([1,0,0]) : la === 'y' ? mkDir([0,1,0]) : mkDir([0,0,1]);
      return { axisStr, refStr };
    };

    const rawFace = calcOutsideFace(rwo, allWallOrigins);
    const dirFlip = !!(settings.outsideDirFlip);
    const grpOutPos = rawFace.outsidePos;
    const grpOutDir = dirFlip ? -rawFace.outsideDir : rawFace.outsideDir;

    const groupToWorld = (gx, outDepth, gz) => {
      if (!rwo) return [gx, outDepth, gz];
      const p = { x: 0, y: 0, z: 0 };
      p[rwo.lengthAxis]    = groupMinX + gx;
      p[rwo.thicknessAxis] = grpOutPos + grpOutDir * outDepth;
      p[rwo.heightAxis]    = groupMinH + gz;
      return [p.x, p.y, p.z];
    };

    if (vis.strips !== false) {
      const stripBatches = group.stripBatches ?? (group.facadeData?.rows ? [{ rows: group.facadeData.rows, material, color: brickColor }] : null);
      if (stripBatches?.length && rwo) {
        const { axisStr, refStr } = makeGroupAxes();
        for (const batch of stripBatches) {
          const batchColor = batch.color ?? brickColor;
          const batchMat = batch.material ?? material;
          const batchBrickD = brickD;
          const batchVerband = batch.verband ?? 'halfsteens';
          const brickExtH = batchVerband === 'staand_tegelverband' ? batchMat.steenL : batchMat.steenH;
          for (const row of batch.rows) {
            for (const piece of row.pieces) {
              const [wx, wy, wz] = groupToWorld(piece.start + piece.length / 2, effectiveLatDepth + panelDikte + batchBrickD / 2, row.y);
              const placePt = PT(wx, wy, wz);
              const place3D = E(`IFCAXIS2PLACEMENT3D(#${placePt},${axisStr},${refStr})`);
              const localPl = E(`IFCLOCALPLACEMENT(#${stPl},#${place3D})`);
              const profAx  = E(`IFCAXIS2PLACEMENT2D(#${pt2D},$)`);
              const prof    = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${profAx},${r(piece.length)},${r(batchBrickD)})`);
              const solid   = E(`IFCEXTRUDEDAREASOLID(#${prof},#${sAx0},#${extDir},${r(brickExtH)})`);
              const shRep   = E(`IFCSHAPEREPRESENTATION(#${gSub},'Body','SweptSolid',(#${solid}))`);
              const pds     = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shRep}))`);
              const safeName = `${group.name ?? 'Groep'} - Strip`.replace(/'/g, "\\'");
              const proxy   = E(`IFCBUILDINGELEMENTPROXY(${G()},#${owH},'${safeName}',$,'Steenstrip',#${localPl},#${pds},$,.NOTDEFINED.)`);
              E(`IFCSTYLEDITEM(#${solid},(#${getStyle(batchColor)}),$)`);
              allProxyIds.push(proxy);
            }
          }
        }
      } else {
        for (const wallData of (group.wallsWithRows ?? [])) {
          const { wall, rows } = wallData;
          const wo = wall.wallOrigin;
          const { outsidePos: wallOutPos, outsideDir: wallOutDir } = calcOutsideFace(wo, allWallOrigins);
          const toWorld = (localX, outDepth, localZ) => {
            if (!wo) return [localX, outDepth, localZ];
            const p = { x: 0, y: 0, z: 0 };
            p[wo.lengthAxis]    = wo.lengthStart + localX;
            p[wo.thicknessAxis] = wallOutPos + wallOutDir * outDepth;
            p[wo.heightAxis]    = wo.heightStart + localZ;
            return [p.x, p.y, p.z];
          };
          const _mkDir2 = (v) => `#${E(`IFCDIRECTION((${v.join(',')}))`)}`;
          const axisStr = wo.heightAxis === 'z' ? _mkDir2([0,0,1]) : wo.heightAxis === 'y' ? _mkDir2([0,1,0]) : _mkDir2([1,0,0]);
          const refStr  = wo.lengthAxis  === 'x' ? _mkDir2([1,0,0]) : wo.lengthAxis  === 'y' ? _mkDir2([0,1,0]) : _mkDir2([0,0,1]);
          for (const row of rows) {
            for (const piece of row.pieces) {
              const [wx, wy, wz] = toWorld(piece.start + piece.length / 2, effectiveLatDepth + panelDikte + brickD / 2, row.y);
              const placePt = PT(wx, wy, wz);
              const place3D = E(`IFCAXIS2PLACEMENT3D(#${placePt},${axisStr},${refStr})`);
              const localPl = E(`IFCLOCALPLACEMENT(#${stPl},#${place3D})`);
              const profAx  = E(`IFCAXIS2PLACEMENT2D(#${pt2D},$)`);
              const prof    = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${profAx},${r(piece.length)},${r(brickD)})`);
              const solid   = E(`IFCEXTRUDEDAREASOLID(#${prof},#${sAx0},#${extDir},${r(groupBrickExtH)})`);
              const shRep   = E(`IFCSHAPEREPRESENTATION(#${gSub},'Body','SweptSolid',(#${solid}))`);
              const pds     = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shRep}))`);
              const safeName = `${group.name ?? 'Groep'} - ${wall.name} - ${piece.label}`.replace(/'/g, "\\'");
              const proxy   = E(`IFCBUILDINGELEMENTPROXY(${G()},#${owH},'${safeName}',$,'Steenstrip',#${localPl},#${pds},$,.NOTDEFINED.)`);
              E(`IFCSTYLEDITEM(#${solid},(#${getStyle(brickColor)}),$)`);
              allProxyIds.push(proxy);
            }
          }
        }
      }
    }

    if (vis.panelen !== false && (group.panels ?? []).length) {
      const { axisStr, refStr } = makeGroupAxes();
      for (const panel of group.panels) {
        const cx = panel.x + panel.width / 2;
        const depth = effectiveLatDepth + panelDikte / 2;
        const [wx, wy, wz] = groupToWorld(cx, depth, panel.y);
        const placePt = PT(wx, wy, wz);
        const place3D = E(`IFCAXIS2PLACEMENT3D(#${placePt},${axisStr},${refStr})`);
        const localPl = E(`IFCLOCALPLACEMENT(#${stPl},#${place3D})`);
        const profAx  = E(`IFCAXIS2PLACEMENT2D(#${pt2D},$)`);
        const prof    = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${profAx},${r(panel.width)},${r(panelDikte)})`);
        const solid   = E(`IFCEXTRUDEDAREASOLID(#${prof},#${sAx0},#${extDir},${r(panel.height)})`);
        const shRep   = E(`IFCSHAPEREPRESENTATION(#${gSub},'Body','SweptSolid',(#${solid}))`);
        const pds     = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shRep}))`);
        const safeName = `${group.name ?? 'Groep'} - Paneel ${Math.round(panel.width)}x${Math.round(panel.height)}`.replace(/'/g, "\\'");
        const proxy   = E(`IFCBUILDINGELEMENTPROXY(${G()},#${owH},'${safeName}',$,'Basisplaat',#${localPl},#${pds},$,.NOTDEFINED.)`);
        E(`IFCSTYLEDITEM(#${solid},(#${getStyle('#94a3b8')}),$)`);
        allProxyIds.push(proxy);
      }
    }

    if (vis.latten !== false && (group.lattenData ?? []).length) {
      const { axisStr, refStr } = makeGroupAxes();
      for (const lat of group.lattenData) {
        const safeName = `${group.name ?? 'Groep'} - Lat ${lat.richting}`.replace(/'/g, "\\'");
        if (lat.v18ProfilePts && lat.richting === 'horizontaal') {
          const profPts = lat.v18ProfilePts;
          const nokH = lat.v18NokHeight ?? 18;
          const nokFW = lat.v18NokFootWidth ?? 45;
          const nokPitch = lat.v18NokPitch ?? 200;
          const nokOffset = lat.v18NokOffset ?? 100;
          const [wx, wy, wz] = groupToWorld(lat.x, 0, lat.y);
          const placePt = PT(wx, wy, wz);
          const place3D = E(`IFCAXIS2PLACEMENT3D(#${placePt},${axisStr},${refStr})`);
          const localPl = E(`IFCLOCALPLACEMENT(#${stPl},#${place3D})`);
          const v18AxisDir = E(`IFCDIRECTION((1.,0.,0.))`);
          const v18RefDir  = E(`IFCDIRECTION((0.,1.,0.))`);
          const v18Ax = E(`IFCAXIS2PLACEMENT3D(#${PT(0,0,0)},#${v18AxisDir},#${v18RefDir})`);
          const v18ExtDir = E(`IFCDIRECTION((0.,0.,1.))`);
          const ptIds = profPts.map(([d, h]) => E(`IFCCARTESIANPOINT((${r(d)},${r(h)}))`));
          const poly  = E(`IFCPOLYLINE((${ptIds.map(id => '#' + id).join(',')}))`);
          const prof  = E(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#${poly})`);
          const bodyS = E(`IFCEXTRUDEDAREASOLID(#${prof},#${v18Ax},#${v18ExtDir},${r(lat.width)})`);
          E(`IFCSTYLEDITEM(#${bodyS},(#${getStyle('#b45309')}),$)`);
          const solids = [bodyS];
          const nokAxDir = E(`IFCDIRECTION((1.,0.,0.))`);
          const nokRefDir = E(`IFCDIRECTION((0.,1.,0.))`);
          for (let ni = 0; nokOffset + ni * nokPitch < lat.width; ni++) {
            const nokCx = nokOffset + ni * nokPitch;
            const nokStart = nokCx - nokFW / 2;
            if (nokStart < 0 || nokStart + nokFW > lat.width) continue;
            const nokAx = E(`IFCAXIS2PLACEMENT3D(#${PT(nokStart, 0, 0)},#${nokAxDir},#${nokRefDir})`);
            const nokExt = E(`IFCDIRECTION((0.,0.,1.))`);
            const nokProfAx = E(`IFCAXIS2PLACEMENT2D(#${pt2D},$)`);
            const nokProf = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${nokProfAx},${r(latDikte)},${r(nokH)})`);
            const nokS = E(`IFCEXTRUDEDAREASOLID(#${nokProf},#${nokAx},#${nokExt},${r(nokFW)})`);
            E(`IFCSTYLEDITEM(#${nokS},(#${getStyle('#b45309')}),$)`);
            solids.push(nokS);
          }
          const shRep = E(`IFCSHAPEREPRESENTATION(#${gSub},'Body','SweptSolid',(${solids.map(id => '#' + id).join(',')}))`);
          const pds   = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shRep}))`);
          const proxy = E(`IFCBUILDINGELEMENTPROXY(${G()},#${owH},'${safeName}',$,'AchterconstructieLat',#${localPl},#${pds},$,.NOTDEFINED.)`);
          allProxyIds.push(proxy);
        } else {
          const cx = lat.x + lat.width / 2;
          const cy = lat.y;
          const depth = lat.richting === 'verticaal' ? latDikte + latDikte / 2 : latDikte / 2;
          const [wx, wy, wz] = groupToWorld(cx, depth, cy);
          const placePt = PT(wx, wy, wz);
          const place3D = E(`IFCAXIS2PLACEMENT3D(#${placePt},${axisStr},${refStr})`);
          const localPl = E(`IFCLOCALPLACEMENT(#${stPl},#${place3D})`);
          const profAx  = E(`IFCAXIS2PLACEMENT2D(#${pt2D},$)`);
          const prof    = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${profAx},${r(lat.width)},${r(latDikte)})`);
          const solid   = E(`IFCEXTRUDEDAREASOLID(#${prof},#${sAx0},#${extDir},${r(lat.height)})`);
          const shRep   = E(`IFCSHAPEREPRESENTATION(#${gSub},'Body','SweptSolid',(#${solid}))`);
          const pds     = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shRep}))`);
          const proxy   = E(`IFCBUILDINGELEMENTPROXY(${G()},#${owH},'${safeName}',$,'AchterconstructieLat',#${localPl},#${pds},$,.NOTDEFINED.)`);
          E(`IFCSTYLEDITEM(#${solid},(#${getStyle('#b45309')}),$)`);
          allProxyIds.push(proxy);
        }
      }
    }

    const maxHoogte = group.maxHoogte ?? null;

    if (vis.zetwerk !== false && group.zetwerk?.enabled && group.facadeData) {
      const zw = group.zetwerk;
      const zwB = Math.max(1, zw.breedte ?? 50);
      const zwH = Math.max(0, zw.offsetH ?? 0);
      const zwV = Math.max(0, zw.offsetV ?? 0);
      const { axisStr, refStr } = makeGroupAxes();
      const depth = effectiveLatDepth + panelDikte + brickD / 2;
      for (const op of (group.facadeData.groupOpenings ?? [])) {
        const opPoly = getOpeningPoly(op);
        const opLs = opPoly.map(p => p.l), opHs = opPoly.map(p => p.h);
        const opMinL = Math.min(...opLs), opMaxL = Math.max(...opLs);
        const opMinH = Math.min(...opHs), opMaxH = Math.max(...opHs);
        if (maxHoogte != null && maxHoogte > 0 && opMinH >= maxHoogte) continue;
        const ox1 = opMinL - zwH - zwB, ox2 = opMaxL + zwH + zwB;
        const oy1 = opMinH - zwV - zwB, oy2 = opMaxH + zwV + zwB;
        const totalW = ox2 - ox1;
        const innerH = (opMaxH + zwV) - (opMinH - zwV);
        const bars = [
          { lx: ox1 + totalW / 2, lz: oy2 - zwB / 2, lw: totalW, lh: zwB },
          { lx: ox1 + totalW / 2, lz: oy1 + zwB / 2, lw: totalW, lh: zwB },
          { lx: ox1 + zwB / 2,    lz: op.y - zwV + innerH / 2, lw: zwB, lh: innerH },
          { lx: ox2 - zwB / 2,    lz: op.y - zwV + innerH / 2, lw: zwB, lh: innerH },
        ];
        for (const bar of bars) {
          const barBottom = bar.lz - bar.lh / 2;
          if (maxHoogte != null && maxHoogte > 0 && barBottom >= maxHoogte) continue;
          const [wx, wy, wz] = groupToWorld(bar.lx, depth, barBottom);
          const placePt = PT(wx, wy, wz);
          const place3D = E(`IFCAXIS2PLACEMENT3D(#${placePt},${axisStr},${refStr})`);
          const localPl = E(`IFCLOCALPLACEMENT(#${stPl},#${place3D})`);
          const profAx  = E(`IFCAXIS2PLACEMENT2D(#${pt2D},$)`);
          const prof    = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${profAx},${r(bar.lw)},${r(brickD)})`);
          const solid   = E(`IFCEXTRUDEDAREASOLID(#${prof},#${sAx0},#${extDir},${r(bar.lh)})`);
          const shRep   = E(`IFCSHAPEREPRESENTATION(#${gSub},'Body','SweptSolid',(#${solid}))`);
          const pds     = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shRep}))`);
          const safeName = `${group.name ?? 'Groep'} - Zetwerk`.replace(/'/g, "\\'");
          const proxy   = E(`IFCBUILDINGELEMENTPROXY(${G()},#${owH},'${safeName}',$,'Zetwerk',#${localPl},#${pds},$,.NOTDEFINED.)`);
          E(`IFCSTYLEDITEM(#${solid},(#${getStyle('#475569')}),$)`);
          allProxyIds.push(proxy);
        }
      }
    }

    const penanten = (wallSettings[group.id] ?? {}).penanten ?? [];
    const penantFaceRows = group.penantFaceRows ?? [];
    if (penanten.length && rwo) {
      const { axisStr, refStr } = makeGroupAxes();
      for (let pi = 0; pi < penanten.length; pi++) {
        const pen = penanten[pi];
        const pX  = pen.x   ?? 0;
        const pB  = Math.max(1, pen.breedte ?? 400);
        const pDL = Math.max(1, pen.diepteLinks  ?? pen.diepte ?? 150);
        const pDR = Math.max(1, pen.diepteRechts ?? pen.diepte ?? 150);
        const pH  = Math.max(1, (maxHoogte != null && maxHoogte > 0) ? Math.min(pen.hoogte ?? 2000, maxHoogte) : (pen.hoogte ?? 2000));
        const penStoot = pen.stoot ?? material.stoot ?? 10;
        const penFrontW = Math.max(1, pB - 2 * brickD);
        const penSideDL = Math.max(1, pDL + brickD + penStoot + panelDikte);
        const penSideDR = Math.max(1, pDR + brickD + penStoot + panelDikte);
        const penPanelT = panelDikte;
        const penShift = panelDikte + brickD + penStoot + Math.max(pDL, pDR);

        const emitPenantBox = (gxCenter, depthCenter, boxW, boxThick, label) => {
          const [bwx, bwy, bwz] = groupToWorld(gxCenter, depthCenter, 0);
          const bPt   = PT(bwx, bwy, bwz);
          const bPl3D = E(`IFCAXIS2PLACEMENT3D(#${bPt},${axisStr},${refStr})`);
          const bLPl  = E(`IFCLOCALPLACEMENT(#${stPl},#${bPl3D})`);
          const bPAx  = E(`IFCAXIS2PLACEMENT2D(#${pt2D},$)`);
          const bProf = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${bPAx},${r(boxW)},${r(boxThick)})`);
          const bSol  = E(`IFCEXTRUDEDAREASOLID(#${bProf},#${sAx0},#${extDir},${r(pH)})`);
          const bSRep = E(`IFCSHAPEREPRESENTATION(#${gSub},'Body','SweptSolid',(#${bSol}))`);
          const bPds  = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${bSRep}))`);
          const bName = `${group.name ?? 'Groep'} - ${label}`.replace(/'/g, "\\'");
          const bPrx  = E(`IFCBUILDINGELEMENTPROXY(${G()},#${owH},'${bName}',$,'Penant',#${bLPl},#${bPds},$,.NOTDEFINED.)`);
          E(`IFCSTYLEDITEM(#${bSol},(#${getStyle('#94a3b8')}),$)`);
          allProxyIds.push(bPrx);
        };

        emitPenantBox(pX + pB / 2, latDikte + penShift - penPanelT / 2, penFrontW, penPanelT, 'Penant voorzijde');
        emitPenantBox(pX + brickD + penPanelT / 2, latDikte + penShift - penPanelT - penSideDL / 2, penPanelT, penSideDL, 'Penant linkerbeen');
        emitPenantBox(pX + pB - brickD - penPanelT / 2, latDikte + penShift - penPanelT - penSideDR / 2, penPanelT, penSideDR, 'Penant rechterbeen');

        const penFaceData = penantFaceRows[pi] ?? {};
        const fRows = penFaceData.frontRows ?? penFaceData ?? [];

        for (const row of (Array.isArray(fRows) ? fRows : [])) {
          for (const piece of row.pieces) {
            const gx = pX + piece.start + piece.length / 2;
            const [bwx, bwy, bwz] = groupToWorld(gx, latDikte + penShift + brickD / 2, row.y);
            const bPlacePt = PT(bwx, bwy, bwz);
            const bPlace3D = E(`IFCAXIS2PLACEMENT3D(#${bPlacePt},${axisStr},${refStr})`);
            const bLocalPl = E(`IFCLOCALPLACEMENT(#${stPl},#${bPlace3D})`);
            const bProfAx  = E(`IFCAXIS2PLACEMENT2D(#${pt2D},$)`);
            const bProf    = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${bProfAx},${r(piece.length)},${r(brickD)})`);
            const bSolid   = E(`IFCEXTRUDEDAREASOLID(#${bProf},#${sAx0},#${extDir},${r(material.steenH)})`);
            const bShRep   = E(`IFCSHAPEREPRESENTATION(#${gSub},'Body','SweptSolid',(#${bSolid}))`);
            const bPds     = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${bShRep}))`);
            const bName    = `${group.name ?? 'Groep'} - Penant Strip`.replace(/'/g, "\\'");
            const bProxy   = E(`IFCBUILDINGELEMENTPROXY(${G()},#${owH},'${bName}',$,'Steenstrip',#${bLocalPl},#${bPds},$,.NOTDEFINED.)`);
            E(`IFCSTYLEDITEM(#${bSolid},(#${getStyle(brickColor)}),$)`);
            allProxyIds.push(bProxy);
          }
        }

        const cornerBattenDepthBack  = latDikte + latDikte / 2;
        const cornerBattenDepthFront = latDikte + penShift - penPanelT - latDikte / 2;
        for (const [gxCenter, depthCenter, cLabel] of [
          [pX + brickD + penPanelT + latDikte / 2,       cornerBattenDepthBack,  'Penant Hoeklatje L-back'],
          [pX + pB - brickD - penPanelT - latDikte / 2,  cornerBattenDepthBack,  'Penant Hoeklatje R-back'],
          [pX + brickD + penPanelT + latDikte / 2,       cornerBattenDepthFront, 'Penant Hoeklatje L-front'],
          [pX + pB - brickD - penPanelT - latDikte / 2,  cornerBattenDepthFront, 'Penant Hoeklatje R-front'],
        ]) {
          const [cbwx, cbwy, cbwz] = groupToWorld(gxCenter, depthCenter, 0);
          const cbPt   = PT(cbwx, cbwy, cbwz);
          const cbPl3D = E(`IFCAXIS2PLACEMENT3D(#${cbPt},${axisStr},${refStr})`);
          const cbLPl  = E(`IFCLOCALPLACEMENT(#${stPl},#${cbPl3D})`);
          const cbPAx  = E(`IFCAXIS2PLACEMENT2D(#${pt2D},$)`);
          const cbProf = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${cbPAx},${r(latDikte)},${r(latDikte)})`);
          const cbSol  = E(`IFCEXTRUDEDAREASOLID(#${cbProf},#${sAx0},#${extDir},${r(pH)})`);
          const cbSRep = E(`IFCSHAPEREPRESENTATION(#${gSub},'Body','SweptSolid',(#${cbSol}))`);
          const cbPds  = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${cbSRep}))`);
          const cbName = `${group.name ?? 'Groep'} - ${cLabel}`.replace(/'/g, "\\'");
          const cbPrx  = E(`IFCBUILDINGELEMENTPROXY(${G()},#${owH},'${cbName}',$,'AchterconstructieLat',#${cbLPl},#${cbPds},$,.NOTDEFINED.)`);
          E(`IFCSTYLEDITEM(#${cbSol},(#${getStyle('#b45309')}),$)`);
          allProxyIds.push(cbPrx);
        }

        const thickDir = { x: 0, y: 0, z: 0 };
        thickDir[rwo.thicknessAxis] = grpOutDir;
        const leftRefId  = E(`IFCDIRECTION((${r(thickDir.x)},${r(thickDir.y)},${r(thickDir.z)}))`);
        const rightRefId = E(`IFCDIRECTION((${r(-thickDir.x)},${r(-thickDir.y)},${r(-thickDir.z)}))`);
        const _haVec = rwo.heightAxis === 'z' ? [0,0,1] : rwo.heightAxis === 'y' ? [0,1,0] : [1,0,0];
        const sideAxisId = E(`IFCDIRECTION((${_haVec.join(',')}))`);
        const sideDepthOffset = latDikte + penStoot;

        for (const row of (penFaceData.leftRows ?? [])) {
          for (const piece of row.pieces) {
            const lp = { x: 0, y: 0, z: 0 };
            lp[rwo.lengthAxis]    = groupMinX + pX + brickD / 2;
            lp[rwo.thicknessAxis] = grpOutPos + grpOutDir * (sideDepthOffset + piece.start + piece.length / 2);
            lp[rwo.heightAxis]    = groupMinH + row.y;
            const [lpx, lpy, lpz] = [lp.x, lp.y, lp.z];
            const lPlacePt = PT(lpx, lpy, lpz);
            const lPlace3D = E(`IFCAXIS2PLACEMENT3D(#${lPlacePt},#${sideAxisId},#${leftRefId})`);
            const lLocalPl = E(`IFCLOCALPLACEMENT(#${stPl},#${lPlace3D})`);
            const lProfAx  = E(`IFCAXIS2PLACEMENT2D(#${pt2D},$)`);
            const lProf    = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${lProfAx},${r(piece.length)},${r(brickD)})`);
            const lSolid   = E(`IFCEXTRUDEDAREASOLID(#${lProf},#${sAx0},#${extDir},${r(material.steenH)})`);
            const lShRep   = E(`IFCSHAPEREPRESENTATION(#${gSub},'Body','SweptSolid',(#${lSolid}))`);
            const lPds     = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${lShRep}))`);
            const lName    = `${group.name ?? 'Groep'} - Strip`.replace(/'/g, "\\'");
            const lProxy   = E(`IFCBUILDINGELEMENTPROXY(${G()},#${owH},'${lName}',$,'Steenstrip',#${lLocalPl},#${lPds},$,.NOTDEFINED.)`);
            E(`IFCSTYLEDITEM(#${lSolid},(#${getStyle(brickColor)}),$)`);
            allProxyIds.push(lProxy);
          }
        }

        for (const row of (penFaceData.rightRows ?? [])) {
          for (const piece of row.pieces) {
            const rp = { x: 0, y: 0, z: 0 };
            rp[rwo.lengthAxis]    = groupMinX + pX + pB - brickD / 2;
            rp[rwo.thicknessAxis] = grpOutPos + grpOutDir * (sideDepthOffset + piece.start + piece.length / 2);
            rp[rwo.heightAxis]    = groupMinH + row.y;
            const [rpx, rpy, rpz] = [rp.x, rp.y, rp.z];
            const rPlacePt = PT(rpx, rpy, rpz);
            const rPlace3D = E(`IFCAXIS2PLACEMENT3D(#${rPlacePt},#${sideAxisId},#${rightRefId})`);
            const rLocalPl = E(`IFCLOCALPLACEMENT(#${stPl},#${rPlace3D})`);
            const rProfAx  = E(`IFCAXIS2PLACEMENT2D(#${pt2D},$)`);
            const rProf    = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${rProfAx},${r(piece.length)},${r(brickD)})`);
            const rSolid   = E(`IFCEXTRUDEDAREASOLID(#${rProf},#${sAx0},#${extDir},${r(material.steenH)})`);
            const rShRep   = E(`IFCSHAPEREPRESENTATION(#${gSub},'Body','SweptSolid',(#${rSolid}))`);
            const rPds     = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${rShRep}))`);
            const rName    = `${group.name ?? 'Groep'} - Strip`.replace(/'/g, "\\'");
            const rProxy   = E(`IFCBUILDINGELEMENTPROXY(${G()},#${owH},'${rName}',$,'Steenstrip',#${rLocalPl},#${rPds},$,.NOTDEFINED.)`);
            E(`IFCSTYLEDITEM(#${rSolid},(#${getStyle(brickColor)}),$)`);
            allProxyIds.push(rProxy);
          }
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
  a.download = `${fileName ?? 'export'}_gevelbekleding.ifc`;
  a.click();
  URL.revokeObjectURL(url);
}

// Scans an IFC file for all common building element types (walls, slabs, proxies, coverings, etc.)
// Returns [{ifcEntityType, name, count}] sorted by count descending
export async function scanIfcElementTypes(file) {
  const text = await file.text();
  const flat = text.replace(/\r?\n/g, ' ');

  const typeIdToName = {};
  const elemIds = new Set();
  const elemEntityType = {};
  const elemObjectType = {};
  const relRecords = [];

  // Match element instances, their TYPE records, and RELDEFINESBYTYPE
  const RECORD_RE = /#(\d+)\s*=\s*IFC((?:WALL(?:STANDARDCASE)?|SLAB|BUILDINGELEMENTPROXY|COVERING|CURTAINWALL|PLATE|MEMBER|ELEMENTASSEMBLY)TYPE|WALL(?:STANDARDCASE)?|SLAB|BUILDINGELEMENTPROXY|COVERING|CURTAINWALL|PLATE|MEMBER|ELEMENTASSEMBLY|RELDEFINESBYTYPE)\s*\(/gi;

  let m;
  while ((m = RECORD_RE.exec(flat)) !== null) {
    const id = m[1];
    const ifcName = m[2].toUpperCase();
    const start = RECORD_RE.lastIndex - 1;
    let end = start + 1, depth = 1, inStr = false;
    while (end < flat.length && depth > 0) {
      const c = flat[end];
      if (c === "'" && !inStr) inStr = true;
      else if (c === "'" && inStr) inStr = false;
      else if (!inStr) { if (c === '(') depth++; else if (c === ')') depth--; }
      end++;
    }
    const inner = flat.slice(start + 1, end - 1);
    RECORD_RE.lastIndex = end;

    if (ifcName === 'RELDEFINESBYTYPE') {
      relRecords.push(inner);
    } else if (ifcName.endsWith('TYPE')) {
      const parts = splitStepArgs(inner);
      const name = unquoteStep(parts[2]) ?? unquoteStep(parts[8]);
      if (name) typeIdToName[id] = name;
    } else {
      elemIds.add(id);
      elemEntityType[id] = 'IFC' + ifcName;
      const parts = splitStepArgs(inner);
      const objType = unquoteStep(parts[4]);
      if (objType) {
        elemObjectType[id] = objType;
      } else if (ifcName === 'ELEMENTASSEMBLY') {
        const nameVal = unquoteStep(parts[2]);
        if (nameVal) elemObjectType[id] = nameVal;
      }
    }
  }

  const elemToType = {};
  for (const inner of relRecords) {
    const parts = splitStepArgs(inner);
    const relatedRaw = parts[4] ?? '';
    const typeRaw = (parts[5] ?? '').trim().replace(/^#/, '');
    const tName = typeIdToName[typeRaw];
    if (!tName) continue;
    const idMatches = relatedRaw.match(/#(\d+)/g);
    if (!idMatches) continue;
    for (const ref of idMatches) {
      const eid = ref.slice(1);
      if (elemIds.has(eid)) elemToType[eid] = tName;
    }
  }

  const counts = {};
  for (const eid of elemIds) {
    const entityType = elemEntityType[eid];
    const typeName = elemToType[eid] ?? elemObjectType[eid] ?? '(geen type)';
    const key = `${entityType}::${typeName}`;
    if (!counts[key]) counts[key] = { ifcEntityType: entityType, name: typeName, count: 0 };
    counts[key].count++;
  }

  return Object.values(counts).sort((a, b) => b.count - a.count);
}

// Parses zone elements from an IFC file — any building element type, not just walls.
// allowedTypes: Map<ifcEntityType (e.g. 'IFCWALL'), Set<typeName> | null> or null for all
// Returns elements in the same structure as parseIfc walls, with isZoneElement: true
export async function parseIfcZoneElements(file, allowedTypes = null, onProgress = null) {
  const { IFC, api } = await getApi();

  let modelID, ownModel = false;
  const wallTypeMap = {};

  if (_cachedModel && _cachedModel.name === file.name && _cachedModel.size === file.size) {
    modelID = _cachedModel.modelID;
    Object.assign(wallTypeMap, _cachedModel.wallTypeMap ?? {});
  } else {
    if (_cachedModel) {
      try { api.CloseModel(_cachedModel.modelID); } catch {}
      _cachedModel = null;
    }
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    modelID = api.OpenModel(data, {});
    ownModel = true;
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
  }

  try {
    const SUPPORTED_ENTITY_NAMES = [
      'IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCSLAB',
      'IFCBUILDINGELEMENTPROXY', 'IFCCOVERING', 'IFCCURTAINWALL',
      'IFCPLATE', 'IFCMEMBER', 'IFCELEMENTASSEMBLY',
    ];

    const entityNamesToLoad = allowedTypes ? [...allowedTypes.keys()] : SUPPORTED_ENTITY_NAMES;

    const allElemIDs = [];
    const elemEntityTypeMap = {};

    for (const entityName of entityNamesToLoad) {
      const code = IFC[entityName.toUpperCase()];
      if (code === undefined) continue;
      try {
        const idsVec = api.GetLineIDsWithType(modelID, code);
        for (let i = 0; i < idsVec.size(); i++) {
          const eID = idsVec.get(i);
          const typeName = wallTypeMap[eID] ?? '(geen type)';
          if (allowedTypes) {
            const allowed = allowedTypes.get(entityName.toUpperCase()) ?? allowedTypes.get(entityName);
            if (allowed && !allowed.has(typeName)) continue;
          }
          allElemIDs.push(eID);
          elemEntityTypeMap[eID] = entityName.toUpperCase();
        }
      } catch { }
    }

    onProgress?.({ phase: 'init', log: `${allElemIDs.length} zone-elementen gevonden` });
    onProgress?.({ phase: 'wanden', current: 0, total: allElemIDs.length });

    const elements = [];
    let processed = 0;
    let lastYield = Date.now();

    for (const eID of allElemIDs) {
      try {
        const bb = getBBox(api, modelID, eID);
        if (!bb) continue;

        const dx = bb.maxX - bb.minX;
        const dy = bb.maxY - bb.minY;
        const dz = bb.maxZ - bb.minZ;
        const sortedAxes = [
          { axis: 'x', val: dx },
          { axis: 'y', val: dy },
          { axis: 'z', val: dz },
        ].sort((a, b) => a.val - b.val);

        const lengthAxis    = sortedAxes[2].axis;
        const heightAxis    = sortedAxes[1].axis;
        const thicknessAxis = sortedAxes[0].axis;
        const length = Math.round(sortedAxes[2].val * 1000);
        const height = Math.round(sortedAxes[1].val * 1000);

        if (length < 100 || height < 100) continue;

        const line = api.GetLine(modelID, eID, false);
        const name = line?.Name?.value ?? `Element #${eID}`;

        let wallInsideThickDirEl = 0;
        if (bb.localYDir) {
          const comp = bb.localYDir[thicknessAxis] ?? 0;
          if (Math.abs(comp) > 0.5) wallInsideThickDirEl = comp > 0 ? 1 : -1;
        }

        let wallLengthDirEl = null;
        if (bb.localXDir) {
          const { x, y, z } = bb.localXDir;
          const len = Math.sqrt(x * x + y * y + z * z);
          if (len > 0.01) wallLengthDirEl = { x: x / len, y: y / len, z: z / len };
        }

        const wallOrigin = {
          lengthStart:    Math.round(bb[`min${lengthAxis.toUpperCase()}`] * 1000),
          heightStart:    Math.round(bb[`min${heightAxis.toUpperCase()}`] * 1000),
          thicknessStart: Math.round(bb[`min${thicknessAxis.toUpperCase()}`] * 1000),
          thicknessEnd:   Math.round(bb[`max${thicknessAxis.toUpperCase()}`] * 1000),
          lengthAxis,
          heightAxis,
          thicknessAxis,
          wallInsideThickDir: wallInsideThickDirEl,
          wallLengthDir: wallLengthDirEl,
        };

        const facadePoly = getFacadePolygon(api, modelID, eID, lengthAxis, heightAxis, bb);
        elements.push({
          expressID: eID,
          name,
          length,
          height,
          openings: [],
          wallOrigin,
          facadePoly: facadePoly ?? null,
          typeName: wallTypeMap[eID] ?? null,
          isZoneElement: true,
          ifcEntityType: elemEntityTypeMap[eID],
        });
      } catch { }

      processed++;
      onProgress?.({ phase: 'wanden', current: processed, total: allElemIDs.length });
      const now = Date.now();
      if (now - lastYield > 50) {
        lastYield = now;
        await new Promise(r => setTimeout(r, 0));
      }
    }

    return elements;
  } finally {
    if (ownModel) {
      api.CloseModel(modelID);
    } else {
      try { api.CloseModel(modelID); } catch {}
      _cachedModel = null;
    }
  }
}
