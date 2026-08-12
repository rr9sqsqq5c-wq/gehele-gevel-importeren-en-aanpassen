// READ-ONLY — is de per-onderdeel bbox van een "LIGGER"-kind een ENKELE ligger (dun) of een
// over-unie (bbox van de hele sub-boom)? Vergelijkt de EIGEN mesh-bbox van het kind met _bboxWithChildren.
import { IfcAPI } from 'web-ifc'; import fs from 'fs';
const wi = await import('web-ifc');
const api = new IfcAPI(); await api.Init();
const F = "public/_spar_test.ifc";
const bid = api.OpenModel(new Uint8Array(fs.readFileSync(F)));
const mm = v => Math.round(v*1000);

// aggMap
const agg = new Map();
{ const v = api.GetLineIDsWithType(bid, wi.IFCRELAGGREGATES);
  for(let i=0;i<v.size();i++){ const r=api.GetLine(bid,v.get(i),false); const ro=r?.RelatingObject?.value; const rel=r?.RelatedObjects;
    if(ro==null||!rel)continue; const kids=(Array.isArray(rel)?rel:[rel]).map(o=>o?.value).filter(x=>x!=null); agg.set(ro,(agg.get(ro)||[]).concat(kids)); } }

function ownBBox(eID){ let mesh; try{mesh=api.GetFlatMesh(bid,eID);}catch{return null;} if(!mesh||mesh.geometries.size()===0)return null;
  let b=[1/0,1/0,1/0,-1/0,-1/0,-1/0];
  for(let gi=0;gi<mesh.geometries.size();gi++){ const pl=mesh.geometries.get(gi); let g;
    try{ g=api.GetGeometry(bid,pl.geometryExpressID); const vv=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()); const m=pl.flatTransformation;
      for(let vi=0;vi<vv.length;vi+=6){const x=vv[vi],y=vv[vi+1],z=vv[vi+2];const w=[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];for(let k=0;k<3;k++){if(w[k]<b[k])b[k]=w[k];if(w[k]>b[k+3])b[k+3]=w[k];}}
    }catch{}finally{g?.delete();} }
  return b[0]===1/0?null:b; }
function withKids(rootID){ const seen=new Set(); const st=[rootID]; let acc=null;
  while(st.length){ const id=st.pop(); if(seen.has(id))continue; seen.add(id); const b=ownBBox(id);
    if(b){ acc=acc?[Math.min(acc[0],b[0]),Math.min(acc[1],b[1]),Math.min(acc[2],b[2]),Math.max(acc[3],b[3]),Math.max(acc[4],b[4]),Math.max(acc[5],b[5])]:b.slice(); }
    for(const k of (agg.get(id)||[])) if(!seen.has(k)) st.push(k); }
  return acc; }
const dim=b=>b?`${mm(b[3]-b[0])}×${mm(b[4]-b[1])}×${mm(b[5]-b[2])}`:'—';

// vind LIGGER-assemblies
const asm = api.GetLineIDsWithType(bid, wi.IFCELEMENTASSEMBLY);
let done=0;
for(let i=0;i<asm.size() && done<4;i++){ const eID=asm.get(i);
  let nm=null; try{nm=String(api.GetLine(bid,eID,false)?.Name?.value??'');}catch{}
  if(nm!=='LIGGER')continue; done++;
  console.log(`\n=== LIGGER-assembly #${eID} ===`);
  const kids = agg.get(eID)||[];
  for(const kid of kids){ let cn=null,ct=null; try{const cl=api.GetLine(bid,kid,false);cn=String(cl?.Name?.value??'');ct=cl?.type;}catch{}
    if(cn!=='LIGGER')continue;
    const own=ownBBox(kid); const uni=withKids(kid); const hasKids=(agg.get(kid)||[]).length;
    console.log(`  kind "LIGGER" #${kid} type=${ct} aggKids=${hasKids}`);
    console.log(`     EIGEN mesh-bbox      : ${dim(own)}`);
    console.log(`     _bboxWithChildren    : ${dim(uni)}   ${own&&uni&&(mm(uni[3]-uni[0])>mm(own[3]-own[0])+50||mm(uni[4]-uni[1])>mm(own[4]-own[1])+50)?'🔴 GROTER dan eigen (over-unie!)':'🟢 ~gelijk'}`);
  }
}
api.CloseModel(bid);
