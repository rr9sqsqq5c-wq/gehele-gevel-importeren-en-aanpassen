import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const A = resolve(__dirname, "../../../stap-1-maak-eerst-een-vast-proje-62cf");
const require = createRequire(pathToFileURL(A + "/package.json"));
const W = require(resolve(A, "node_modules/web-ifc/web-ifc-api-node.js"));
const F = "C:/Users/MurkAnneKooistraKooi/AppData/Local/Microsoft/Windows/INetCache/Content.Outlook/2I1IYVNL/Kubistische woning export IFC.ifc";
const api = new W.IfcAPI(); await api.Init();
const mid = api.OpenModel(new Uint8Array(readFileSync(F)), {});
const val = (x) => (x && typeof x === "object" && "value" in x) ? x.value : x;
function aabb(eid){ let mesh; try{mesh=api.GetFlatMesh(mid,eid);}catch{return null;} if(!mesh||mesh.geometries.size()===0)return null;
  let a=[Infinity,Infinity,Infinity],b=[-Infinity,-Infinity,-Infinity];
  for(let gi=0;gi<mesh.geometries.size();gi++){const pl=mesh.geometries.get(gi);let g;
    try{g=api.GetGeometry(mid,pl.geometryExpressID);const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize());const m=pl.flatTransformation;
      for(let i=0;i<v.length;i+=6){const lx=v[i],ly=v[i+1],lz=v[i+2];const w=[m[0]*lx+m[4]*ly+m[8]*lz+m[12],m[1]*lx+m[5]*ly+m[9]*lz+m[13],m[2]*lx+m[6]*ly+m[10]*lz+m[14]];
        for(let k=0;k<3;k++){if(w[k]<a[k])a[k]=w[k];if(w[k]>b[k])b[k]=w[k];}}}finally{g?.delete();}}
  return {min:a,max:b,dx:b[0]-a[0],dy:b[1]-a[1],dz:b[2]-a[2]};
}
const L=api.GetLine(mid,43274,false);
console.log("Name:", JSON.stringify(val(L?.Name)), "ObjectType:", JSON.stringify(val(L?.ObjectType)), "PredefinedType:", JSON.stringify(val(L?.PredefinedType)));
console.log("OverallWidth:", val(L?.OverallWidth), "OverallHeight:", val(L?.OverallHeight));
const bb=aabb(43274);
console.log("AABB dims (m):", bb? `${bb.dx.toFixed(3)} x ${bb.dy.toFixed(3)} x ${bb.dz.toFixed(3)}` : "geen geom", "min:", bb?.min.map(v=>v.toFixed(2)));
// vergelijk andere deuren (wel gekoppeld) qua footprint-vorm
console.log("\nTer vergelijking — eerste 4 deuren AABB:");
const v=api.GetLineIDsWithType(mid,W.IFCDOOR);
for(let i=0;i<Math.min(4,v.size());i++){const id=v.get(i);const d=aabb(id);console.log(`  deur ${id}: ${d?`${d.dx.toFixed(3)} x ${d.dy.toFixed(3)} x ${d.dz.toFixed(3)}`:"-"}`);}
api.CloseModel(mid);
