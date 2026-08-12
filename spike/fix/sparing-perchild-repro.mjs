// READ-ONLY — repliceert de PER-ONDERDEEL import (childFilter-tak van parseIfcSparingElements) op het
// echte bestand: kies SAMENSTELLING 'DRAADEIND' → onderdeel 'DRAADEIND' → verwacht individuele kleine
// ankers (unieke elementen), NIET één grote samenstelling. Vergelijkt met de HELE-samenstelling bbox.
import { IfcAPI } from 'web-ifc'; import fs from 'fs';
const wi = await import('web-ifc');
const api = new IfcAPI(); await api.Init();
const bid = api.OpenModel(new Uint8Array(fs.readFileSync('public/_spar_test.ifc')));
const mm = v => Math.round(v*1000);
const agg = new Map();
{ const v=api.GetLineIDsWithType(bid,wi.IFCRELAGGREGATES);
  for(let i=0;i<v.size();i++){const r=api.GetLine(bid,v.get(i),false);const ro=r?.RelatingObject?.value;const rel=r?.RelatedObjects;
    if(ro==null||!rel)continue;const kids=(Array.isArray(rel)?rel:[rel]).map(o=>o?.value).filter(x=>x!=null);agg.set(ro,(agg.get(ro)||[]).concat(kids));} }
function ownB(eID){let m;try{m=api.GetFlatMesh(bid,eID);}catch{return null;}if(!m||m.geometries.size()===0)return null;
  let b=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let gi=0;gi<m.geometries.size();gi++){const pl=m.geometries.get(gi);let g;
    try{g=api.GetGeometry(bid,pl.geometryExpressID);const vv=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize());const t=pl.flatTransformation;
      for(let vi=0;vi<vv.length;vi+=6){const x=vv[vi],y=vv[vi+1],z=vv[vi+2];const w=[t[0]*x+t[4]*y+t[8]*z+t[12],t[1]*x+t[5]*y+t[9]*z+t[13],t[2]*x+t[6]*y+t[10]*z+t[14]];for(let k=0;k<3;k++){if(w[k]<b[k])b[k]=w[k];if(w[k]>b[k+3])b[k+3]=w[k];}}}catch{}finally{g?.delete();}}
  return b[0]===1/0?null:b;}
function withKids(id){const seen=new Set();const st=[id];let a=null;while(st.length){const x=st.pop();if(seen.has(x))continue;seen.add(x);const b=ownB(x);if(b)a=a?[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.min(a[2],b[2]),Math.max(a[3],b[3]),Math.max(a[4],b[4]),Math.max(a[5],b[5])]:b.slice();for(const k of(agg.get(x)||[]))if(!seen.has(k))st.push(k);}return a;}
const dim=b=>b?`${mm(b[3]-b[0])}×${mm(b[4]-b[1])}×${mm(b[5]-b[2])}`:'—';

for (const CHILD of ['DRAADEIND','LIGGER']) {
  const asm=api.GetLineIDsWithType(bid,wi.IFCELEMENTASSEMBLY);
  const perChild=[]; let wholeSample=null;
  for(let i=0;i<asm.size();i++){const eID=asm.get(i);let nm=null;try{nm=String(api.GetLine(bid,eID,false)?.Name?.value??'');}catch{}
    if(nm!==CHILD)continue;
    if(!wholeSample){const wb=withKids(eID);wholeSample=wb;} // hele samenstelling
    for(const kid of(agg.get(eID)||[])){let cn=null;try{cn=String(api.GetLine(bid,kid,false)?.Name?.value??'');}catch{}
      if(cn!==CHILD)continue; const cb=withKids(kid); if(cb)perChild.push(cb);}}
  const sizes=perChild.map(b=>mm(b[3]-b[0])*mm(b[4]-b[1])*mm(b[5]-b[2]));
  const med=[...sizes].sort((a,b)=>a-b)[Math.floor(sizes.length/2)]||0;
  console.log(`\n=== SAMENSTELLING '${CHILD}' → onderdeel '${CHILD}' (per-onderdeel import) ===`);
  console.log(`  hele-samenstelling bbox (1 stuk, fallback): ${dim(wholeSample)}`);
  console.log(`  PER-ONDERDEEL: ${perChild.length} losse sparingen`);
  console.log(`     mediane onderdeel-grootte: ~${Math.round(Math.cbrt(med))}mm-orde;  voorbeelden: ${perChild.slice(0,3).map(dim).join('  |  ')}`);
}
api.CloseModel(bid);
