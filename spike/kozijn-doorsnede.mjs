// SPIKE (wegwerp) — inspecteer een IfcWindow uit BIL-MOO: sub-geometrieën + bbox/dikte + benoemde
// onderdelen (IfcRelAggregates) + assen. Basis voor een horizontale doorsnede / onderdelenlijst.
import { IfcAPI } from 'web-ifc';
import fs from 'fs';

const api = new IfcAPI();
await api.Init();
const buf = fs.readFileSync('public/BIL-MOO-A-ZZ-PBP.ifc');
const modelID = api.OpenModel(new Uint8Array(buf));

const T = api.GetLineIDsWithType.bind(api);
// type-codes uit web-ifc
const { IFCWINDOW, IFCRELAGGREGATES, IFCRELDEFINESBYPROPERTIES } = await import('web-ifc');

const winVec = T(modelID, IFCWINDOW);
console.log('IfcWindow count:', winVec.size());

// bouw aggregate-map (parent → kids) voor eventuele benoemde onderdelen
const aggMap = new Map();
const relVec = T(modelID, IFCRELAGGREGATES);
for (let i = 0; i < relVec.size(); i++) {
  const rel = api.GetLine(modelID, relVec.get(i), false);
  const parent = rel?.RelatingObject?.value;
  const kids = rel?.RelatedObjects;
  if (parent != null && Array.isArray(kids)) aggMap.set(parent, kids.map(k => k.value).filter(v => v != null));
}

function bboxOfFlatMesh(eID) {
  let mesh; try { mesh = api.GetFlatMesh(modelID, eID); } catch { return null; }
  if (!mesh || mesh.geometries.size() === 0) return null;
  const sub = [];
  let all = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let gi = 0; gi < mesh.geometries.size(); gi++) {
    const placed = mesh.geometries.get(gi);
    let geom; const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
    try {
      geom = api.GetGeometry(modelID, placed.geometryExpressID);
      const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
      const m = placed.flatTransformation;
      for (let vi = 0; vi < verts.length; vi += 6) {
        const lx = verts[vi], ly = verts[vi+1], lz = verts[vi+2];
        const wx = m[0]*lx+m[4]*ly+m[8]*lz+m[12];
        const wy = m[1]*lx+m[5]*ly+m[9]*lz+m[13];
        const wz = m[2]*lx+m[6]*ly+m[10]*lz+m[14];
        if (wx<b.minX)b.minX=wx; if(wx>b.maxX)b.maxX=wx;
        if (wy<b.minY)b.minY=wy; if(wy>b.maxY)b.maxY=wy;
        if (wz<b.minZ)b.minZ=wz; if(wz>b.maxZ)b.maxZ=wz;
      }
    } catch {} finally { geom?.delete(); }
    for (const k of ['minX','minY','minZ']) all[k] = Math.min(all[k], b[k]);
    for (const k of ['maxX','maxY','maxZ']) all[k] = Math.max(all[k], b[k]);
    sub.push({ geomID: placed.geometryExpressID, b });
  }
  return { all, sub };
}

const mm = (v) => Math.round(v * 1000);
// pak een paar ramen
for (let wi = 0; wi < Math.min(3, winVec.size()); wi++) {
  const wID = winVec.get(wi);
  const line = api.GetLine(modelID, wID, false);
  const name = line?.Name?.value ?? '(naamloos)';
  const tag = line?.Tag?.value ?? '';
  const res = bboxOfFlatMesh(wID);
  if (!res) { console.log(`\n#${wID} ${name} — geen mesh`); continue; }
  const d = res.all;
  const dx = mm(d.maxX-d.minX), dy = mm(d.maxY-d.minY), dz = mm(d.maxZ-d.minZ);
  const axes = [['X',dx],['Y',dy],['Z',dz]].sort((a,b)=>a[1]-b[1]);
  console.log(`\n═══ Raam #${wID} "${name}" tag=${tag} ═══`);
  console.log(`  bbox mm: X=${dx} Y=${dy} Z=${dz}  → dunste as (=dikte): ${axes[0][0]} (${axes[0][1]}mm), overige: ${axes[1][0]}/${axes[2][0]}`);
  console.log(`  sub-geometrieën: ${res.sub.length}`);
  // sorteer sub-geoms op hun center langs de dunste as (dikte) → buitenste = kliklijst-kandidaat
  const thickAxis = axes[0][0]; // 'X'|'Y'|'Z'
  const cen = (b) => (b['min'+thickAxis] + b['max'+thickAxis]) / 2;
  const subInfo = res.sub.map((s, i) => ({
    i, geomID: s.geomID,
    Tmin: mm(s.b['min'+thickAxis]), Tmax: mm(s.b['max'+thickAxis]), Tcen: mm(cen(s.b)),
    ext: `X${mm(s.b.maxX-s.b.minX)}×Y${mm(s.b.maxY-s.b.minY)}×Z${mm(s.b.maxZ-s.b.minZ)}`,
  })).sort((a,b)=>a.Tcen-b.Tcen);
  for (const s of subInfo) console.log(`    geom#${s.geomID}: dikte-center ${s.Tcen}mm (T ${s.Tmin}..${s.Tmax}) · maat ${s.ext}`);
  // benoemde onderdelen?
  const kids = aggMap.get(wID);
  if (kids?.length) {
    console.log(`  IfcRelAggregates-onderdelen (${kids.length}):`);
    for (const k of kids) { const kl = api.GetLine(modelID, k, false); console.log(`    #${k} ${kl?.constructor?.name ?? ''} Name=${kl?.Name?.value ?? ''}`); }
  } else console.log('  IfcRelAggregates-onderdelen: geen (één merged raam-mesh)');
}
api.CloseModel(modelID);
