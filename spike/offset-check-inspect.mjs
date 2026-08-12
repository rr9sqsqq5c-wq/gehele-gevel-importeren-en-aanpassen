// SPIKE — inspecteer de geëxporteerde gevelbekleding + BIL-MOO: element-types, strip-namen, en bbox
// (om coördinaten-uitlijning tussen de twee modellen te checken vóór we de offset meten).
import { IfcAPI } from 'web-ifc';
import fs from 'fs';
const wi = await import('web-ifc');

const EXPORT = 'C:/Users/MurkAnneKooistraKooi/Downloads/BIL-KSA-A-ZZ-PBP_Groep_1_Groep_2_Groep_3_Groep_3-1_Groep_4_Groep_5_Groep_6_Groep_7_Groep_8_gevelbekleding (4).ifc';
const BILMOO = 'public/BIL-MOO-A-ZZ-PBP.ifc';

const api = new IfcAPI(); await api.Init();

function worldBBoxAll(mid) {
  let b={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]}, tris=0;
  api.StreamAllMeshes(mid, (mesh)=>{
    for(let gi=0;gi<mesh.geometries.size();gi++){
      const pl=mesh.geometries.get(gi); let g;
      try{ g=api.GetGeometry(mid,pl.geometryExpressID); const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()); const m=pl.flatTransformation;
        for(let vi=0;vi<v.length;vi+=6){ const x=v[vi],y=v[vi+1],z=v[vi+2]; const w=[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]]; for(let k=0;k<3;k++){if(w[k]<b.min[k])b.min[k]=w[k];if(w[k]>b.max[k])b.max[k]=w[k];} }
        tris+=v.length/6;
      }catch{} finally{ g?.delete(); }
    }
  });
  return {b,tris};
}
const mm=v=>Math.round(v*1000);

// EXPORT
const eid = api.OpenModel(new Uint8Array(fs.readFileSync(EXPORT)));
const proxies = api.GetLineIDsWithType(eid, wi.IFCBUILDINGELEMENTPROXY);
const nameCount = new Map();
for(let i=0;i<Math.min(proxies.size(),4000);i++){ const l=api.GetLine(eid,proxies.get(i),false); const oi=l?.ObjectType?.value ?? l?.Name?.value ?? '?'; nameCount.set(oi,(nameCount.get(oi)??0)+1); }
console.log('=== EXPORT ===');
console.log('IFCBUILDINGELEMENTPROXY:', proxies.size());
console.log('ObjectType/Name top:', [...nameCount.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v])=>`${k}×${v}`).join('  '));
const eb = worldBBoxAll(eid);
console.log('export wereld-bbox mm: X['+mm(eb.b.min[0])+'..'+mm(eb.b.max[0])+'] Y['+mm(eb.b.min[1])+'..'+mm(eb.b.max[1])+'] Z['+mm(eb.b.min[2])+'..'+mm(eb.b.max[2])+']  tris~'+Math.round(eb.tris));
api.CloseModel(eid);

// BIL-MOO
const bid = api.OpenModel(new Uint8Array(fs.readFileSync(BILMOO)));
const win = api.GetLineIDsWithType(bid, wi.IFCWINDOW);
console.log('\n=== BIL-MOO ===');
console.log('IfcWindow:', win.size());
const bb = worldBBoxAll(bid);
console.log('BIL-MOO wereld-bbox mm: X['+mm(bb.b.min[0])+'..'+mm(bb.b.max[0])+'] Y['+mm(bb.b.min[1])+'..'+mm(bb.b.max[1])+'] Z['+mm(bb.b.min[2])+'..'+mm(bb.b.max[2])+']');
api.CloseModel(bid);
