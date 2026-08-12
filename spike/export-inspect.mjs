// SPIKE (read-only) — leer de brickstripplanner-EXPORT kennen: types+aantallen, wereld-bbox,
// en een sample strip-element (naam/type/geom). Zodat de meet-stap weet hoe openingen te vinden.
import { IfcAPI } from 'web-ifc';
import fs from 'fs';
const PATH = 'C:\\Users\\MurkAnneKooistraKooi\\Downloads\\BIL-KSA-A-ZZ-PBP_Groep_1_Groep_2_Groep_3_Groep_3-1_Groep_4_Groep_5_Groep_6_Groep_7_Groep_8_gevelbekleding (5).ifc';
const api = new IfcAPI(); await api.Init();
const bid = api.OpenModel(new Uint8Array(fs.readFileSync(PATH)));
const mm = v => Math.round(v);

// types + aantallen
const types = api.GetAllTypesOfModel(bid);
console.log('== TYPES (met >0 instances) ==');
const rows=[];
for (const t of types) {
  const v = api.GetLineIDsWithType(bid, t.typeID);
  const n = v.size();
  if (n>0) rows.push({ name:t.typeName, n });
}
rows.sort((a,b)=>b.n-a.n);
for (const r of rows.slice(0,25)) console.log('  '+String(r.n).padStart(7)+'  '+r.name);

// overall bbox via StreamAllMeshes (sample-bbox per mesh, snel)
let all=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity]; let meshCount=0; let sample=null;
api.StreamAllMeshes(bid, (mesh) => {
  meshCount++;
  for (let gi=0; gi<mesh.geometries.size(); gi++){ const pl=mesh.geometries.get(gi); let g;
    try{ g=api.GetGeometry(bid, pl.geometryExpressID); const v=api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize()); const m=pl.flatTransformation;
      for(let vi=0;vi<v.length;vi+=6){const x=v[vi],y=v[vi+1],z=v[vi+2];const w=[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];for(let k=0;k<3;k++){if(w[k]<all[k])all[k]=w[k];if(w[k]>all[k+3])all[k+3]=w[k];}}
    }catch{}finally{g?.delete();}
  }
  if(!sample && mesh.geometries.size()>0){ sample={ eID:mesh.expressID, ngeom:mesh.geometries.size() }; }
});
console.log('\n== GEOMETRIE ==');
console.log('  meshes:', meshCount);
console.log('  wereld-bbox mm: X['+mm(all[0])+'..'+mm(all[3])+'] Y['+mm(all[1])+'..'+mm(all[4])+'] Z['+mm(all[2])+'..'+mm(all[5])+']');
console.log('  extent: dX='+mm(all[3]-all[0])+' dY='+mm(all[4]-all[1])+' dZ='+mm(all[5]-all[2]));
if(sample){ const l=api.GetLine(bid, sample.eID, false); console.log('  sample element #'+sample.eID+' type='+(l?.constructor?.name||'?')+' name="'+(l?.Name?.value??'')+'" ngeom='+sample.ngeom); }
api.CloseModel(bid);
