import { IfcAPI } from 'web-ifc'; import fs from 'fs';
const wi = await import('web-ifc');
const api = new IfcAPI(); await api.Init();
const bid = api.OpenModel(new Uint8Array(fs.readFileSync('public/BIL-MOO-A-ZZ-PBP.ifc')));
const mm=v=>Math.round(v*1000);
function bbox(eID){ let mesh; try{mesh=api.GetFlatMesh(bid,eID);}catch{return null;} if(!mesh||mesh.geometries.size()===0)return null;
  let b=[1/0,1/0,1/0,-1/0,-1/0,-1/0];
  for(let gi=0;gi<mesh.geometries.size();gi++){ const pl=mesh.geometries.get(gi); let g;
    try{ g=api.GetGeometry(bid,pl.geometryExpressID); const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()); const m=pl.flatTransformation;
      for(let vi=0;vi<v.length;vi+=6){const x=v[vi],y=v[vi+1],z=v[vi+2];const w=[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];for(let k=0;k<3;k++){if(w[k]<b[k])b[k]=w[k];if(w[k]>b[k+3])b[k+3]=w[k];}}
    }catch{}finally{g?.delete();} }
  return b[0]===1/0?null:b; }
const W=b=>b?mm(b[3]-b[0]):null;
// map fill -> void
const rel=api.GetLineIDsWithType(bid, wi.IFCRELFILLSELEMENT); const fill2void={};
for(let i=0;i<rel.size();i++){ const r=api.GetLine(bid,rel.get(i),false); if(r?.RelatedBuildingElement?.value) fill2void[r.RelatedBuildingElement.value]=r.RelatingOpeningElement?.value; }
for(const id of [55182,60649]){ const fb=bbox(id); const vid=fill2void[id]; const vb=vid?bbox(vid):null;
  console.log(`#${id}: FILL(frame) brX=${W(fb)}  X[${mm(fb[0])}..${mm(fb[3])}]   VOID #${vid??'-'} brX=${W(vb)}${vb?` X[${mm(vb[0])}..${mm(vb[3])}]`:''}`); }
// gecombineerd
const f1=bbox(55182), f2=bbox(60649);
const cLo=Math.min(f1[0],f2[0]), cHi=Math.max(f1[3],f2[3]);
console.log(`\nGECOMBINEERD FRAME: ${mm(cHi-cLo)} mm   X[${mm(cLo)}..${mm(cHi)}]`);
const v1=fill2void[55182]?bbox(fill2void[55182]):null, v2=fill2void[60649]?bbox(fill2void[60649]):null;
if(v1&&v2){ const vLo=Math.min(v1[0],v2[0]), vHi=Math.max(v1[3],v2[3]); console.log(`GECOMBINEERD VOID : ${mm(vHi-vLo)} mm   X[${mm(vLo)}..${mm(vHi)}]`); }
api.CloseModel(bid);
