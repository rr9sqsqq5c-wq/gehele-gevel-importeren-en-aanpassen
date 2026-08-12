// WEGWERP-HARNESS (spike/) — VALIDATE-taak voor de draadeind-fix (naam-filter + assembly-geometrie).
// getApi() in ifc.js is browser-gebonden, dus een GETROUWE her-impl van scanIfcSparingTypes (naam-tally,
// assembly meegenomen), _buildAggregatesMap/_bboxWithChildren en het naam-filter in parseIfcSparingElements,
// tegen het ECHTE SMS-model. Bewijst: (1) IfcElementAssembly 'DRAADEIND' verschijnt in de scan, (2) een
// naam-filter {IFCELEMENTASSEMBLY:['DRAADEIND']} isoleert de draadeinden, (3) elke draadeind krijgt een
// NIET-lege bbox uit z'n onderdelen (mesh-loze assembly → unie via IfcRelAggregates).
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { readFileSync } from 'fs';

const MODEL = 'C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/Moos-Bilderdammerweg/BIL-SMS-L-ZZ-PBP.ifc';

async function getApi() {
  const WebIFC = require('web-ifc');
  const api = new WebIFC.IfcAPI();
  try { await api.Init(); } catch { api.SetWasmPath('./node_modules/web-ifc/', true); await api.Init(); }
  return { IFC: WebIFC, api };
}
function getBBox(api, m, id) {
  let mesh; try { mesh = api.GetFlatMesh(m, id); } catch { return null; }
  if (!mesh || mesh.geometries.size() === 0) return null;
  let minX=1/0,maxX=-1/0,minY=1/0,maxY=-1/0,minZ=1/0,maxZ=-1/0,ok=false;
  for (let gi=0; gi<mesh.geometries.size(); gi++) {
    const pl = mesh.geometries.get(gi); let g; try { g = api.GetGeometry(m, pl.geometryExpressID); } catch { continue; }
    const vptr = g.GetVertexData(), vlen = g.GetVertexDataSize();
    const verts = api.GetVertexArray(vptr, vlen); const mt = pl.flatTransformation;
    for (let i=0;i<verts.length;i+=6){const x=verts[i],y=verts[i+1],z=verts[i+2];
      const wx=mt[0]*x+mt[4]*y+mt[8]*z+mt[12], wy=mt[1]*x+mt[5]*y+mt[9]*z+mt[13], wz=mt[2]*x+mt[6]*y+mt[10]*z+mt[14];
      if(wx<minX)minX=wx;if(wx>maxX)maxX=wx;if(wy<minY)minY=wy;if(wy>maxY)maxY=wy;if(wz<minZ)minZ=wz;if(wz>maxZ)maxZ=wz;ok=true;}
    g?.delete?.();
  }
  return ok ? {minX,maxX,minY,maxY,minZ,maxZ} : null;
}
function buildAgg(IFC, api, m) {
  const map = new Map(); let vec; try { vec = api.GetLineIDsWithType(m, IFC.IFCRELAGGREGATES); } catch { return map; }
  for (let i=0;i<vec.size();i++){ let rel; try { rel = api.GetLine(m, vec.get(i), false); } catch { continue; }
    const p = rel?.RelatingObject?.value, kids = rel?.RelatedObjects; if (p==null||!Array.isArray(kids)) continue;
    const arr = map.get(p) ?? []; for (const k of kids){const id=k?.value; if(id!=null)arr.push(id);} map.set(p, arr); }
  return map;
}
function bboxWithChildren(api, m, agg, root) {
  const seen = new Set(); const stack = [root]; let acc = null;
  while (stack.length) { const id = stack.pop(); if (seen.has(id)) continue; seen.add(id);
    const b = getBBox(api, m, id);
    if (b) acc = acc ? {minX:Math.min(acc.minX,b.minX),maxX:Math.max(acc.maxX,b.maxX),minY:Math.min(acc.minY,b.minY),maxY:Math.max(acc.maxY,b.maxY),minZ:Math.min(acc.minZ,b.minZ),maxZ:Math.max(acc.maxZ,b.maxZ)} : {...b};
    const kids = agg.get(id); if (kids) for (const k of kids) if (!seen.has(k)) stack.push(k); }
  return acc;
}

(async () => {
  const { IFC, api } = await getApi();
  const buf = readFileSync(MODEL);
  const modelID = api.OpenModel(new Uint8Array(buf), {});

  console.log('=== G1 — scan: IfcElementAssembly meegenomen, gegroepeerd op Name ===');
  const vec = api.GetLineIDsWithType(modelID, IFC.IFCELEMENTASSEMBLY);
  const nameMap = new Map();
  for (let i=0;i<vec.size();i++){ let nm=null; try{const v=api.GetLine(modelID,vec.get(i),false)?.Name?.value; if(v!=null&&v!=='')nm=String(v);}catch{} nameMap.set(nm,(nameMap.get(nm)??0)+1); }
  const draad = nameMap.get('DRAADEIND') ?? 0;
  console.log(`  IFCELEMENTASSEMBLY ×${vec.size()} · namen: ${[...nameMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([n,c])=>`${n}×${c}`).join(', ')}`);
  console.log(`  ${draad>0?'🟢':'🔴'} 'DRAADEIND' aanwezig als assembly-naam ×${draad}`);

  console.log("\n=== G2 — naam-filter {IFCELEMENTASSEMBLY:['DRAADEIND']} + assembly-bbox uit onderdelen ===");
  const agg = buildAgg(IFC, api, modelID);
  const allow = new Set(['DRAADEIND']);
  let imported=0, filtered=0, noGeom=0, exBox=null;
  for (let i=0;i<vec.size();i++){ const eID=vec.get(i);
    let nm=null; try{const v=api.GetLine(modelID,eID,false)?.Name?.value; if(v!=null&&v!=='')nm=String(v);}catch{}
    if(!allow.has(nm)){filtered++;continue;}
    const b = bboxWithChildren(api, modelID, agg, eID);
    if(!b){noGeom++;continue;}
    imported++; if(!exBox) exBox = b;
  }
  console.log(`  ${imported} draadeinden geïmporteerd · ${filtered} andere namen weggefilterd · ${noGeom} zonder geometrie`);
  console.log(`  ${imported===draad && noGeom===0 ? '🟢' : '🟠'} alle ${draad} DRAADEIND-assemblies kregen een bbox uit hun onderdelen`);
  if(exBox){const d=(a,b)=>Math.round((b-a)*1000); console.log(`  voorbeeld-bbox (mm): ${d(exBox.minX,exBox.maxX)} × ${d(exBox.minY,exBox.maxY)} × ${d(exBox.minZ,exBox.maxZ)}`);
    console.log(`  ${d(exBox.minX,exBox.maxX)>0 && d(exBox.minZ,exBox.maxZ)>0 ? '🟢' : '🔴'} bbox is niet-leeg (geometrie uit onderdelen gevonden)`);}

  api.CloseModel(modelID);
})();
