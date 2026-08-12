// READ-ONLY MEET (wegwerp) — extraheer WallStandardCase-afmetingen uit BIL-MOO headless via
// de web-ifc NODE-API (require → web-ifc-api-node.js). Geen app-pijplijn, alleen ruwe bbox.
const fs = require('fs');
const path = require('path');
const { IfcAPI, IFCWALLSTANDARDCASE } = require('web-ifc');

async function main() {
  const api = new IfcAPI();
  await api.Init();
  const buf = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'BIL-MOO-A-ZZ-PBP.ifc'));
  const modelID = api.OpenModel(new Uint8Array(buf));

  const ids = api.GetLineIDsWithType(modelID, IFCWALLSTANDARDCASE);
  const out = [];
  for (let i = 0; i < ids.size(); i++) {
    const eid = ids.get(i);
    let mesh;
    try { mesh = api.GetFlatMesh(modelID, eid); } catch { continue; }
    if (!mesh || mesh.geometries.size() === 0) continue;
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let gi = 0; gi < mesh.geometries.size(); gi++) {
      const placed = mesh.geometries.get(gi);
      const geom = api.GetGeometry(modelID, placed.geometryExpressID);
      const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
      const m = placed.flatTransformation;
      for (let v = 0; v < verts.length; v += 6) {
        const x = verts[v], y = verts[v + 1], z = verts[v + 2];
        const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
        const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
        const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
        if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
        if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
        if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz;
      }
    }
    const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ;
    out.push({ eid, dx: r(dx), dy: r(dy), dz: r(dz) });
  }
  api.CloseModel(modelID);
  console.log(JSON.stringify(out));
}
function r(v) { return Math.round(v * 10) / 10; }
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
