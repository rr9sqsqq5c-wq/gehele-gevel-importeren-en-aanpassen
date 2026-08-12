import { IfcAPI } from 'web-ifc'; import fs from 'fs';
const wi = await import('web-ifc');
const api = new IfcAPI(); await api.Init();
const F = "C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/Moos-Bilderdammerweg/BIL-SMS-L-ZZ-PBP.ifc";
const bid = api.OpenModel(new Uint8Array(fs.readFileSync(F)));
const mm=v=>Math.round(v*1000);
const agg=new Map();
{const v=api.GetLineIDsWithType(bid,wi.IFCRELAGGREGATES);for(let i=0;i<v.size();i++){const r=api.GetLine(bid,v.get(i),false);const ro=r?.RelatingObject?.value;const rel=r?.RelatedObjects;if(ro==null||!rel)continue;const kids=(Array.isArray(rel)?rel:[rel]).map(o=>o?.value).filter(x=>x!=null);agg.set(ro,(agg.get(ro)||[]).concat(kids));}}
function ownB(eID){let m;try{m=api.GetFlatMesh(bid,eID);}catch{return null;}if(!m||m.geometries.size()===0)return null;let b=[1/0,1/0,1/0,-1/0,-1/0,-1/0];for(let gi=0;gi<m.geometries.size();gi++){const pl=m.geometries.get(gi);let g;try{g=api.GetGeometry(bid,pl.geometryExpressID);const vv=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize());const t=pl.flatTransformation;for(let vi=0;vi<vv.length;vi+=6){const x=vv[vi],y=vv[vi+1],z=vv[vi+2];const w=[t[0]*x+t[4]*y+t[8]*z+t[12],t[1]*x+t[5]*y+t[9]*z+t[13],t[2]*x+t[6]*y+t[10]*z+t[14]];for(let k=0;k<3;k++){if(w[k]<b[k])b[k]=w[k];if(w[k]>b[k+3])b[k+3]=w[k];}}}catch{}finally{g?.delete();}}return b[0]===1/0?null:b;}
function withKids(id){const seen=new Set();const st=[id];let a=null;while(st.length){const x=st.pop();if(seen.has(x))continue;seen.add(x);const b=ownB(x);if(b)a=a?[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.min(a[2],b[2]),Math.max(a[3],b[3]),Math.max(a[4],b[4]),Math.max(a[5],b[5])]:b.slice();for(const k of(agg.get(x)||[]))if(!seen.has(k))st.push(k);}return a;}
// element by GUID
let target=null;
const asm=api.GetLineIDsWithType(bid,wi.IFCELEMENTASSEMBLY);
for(let i=0;i<asm.size();i++){const id=asm.get(i);const l=api.GetLine(bid,id,false);if(String(l?.GlobalId?.value)==='0$zSNfrhfDxPhNbPPOori0'){target=id;break;}}
console.log('expressID:', target);
const b=withKids(target);
console.log('bbox WERELD (mm): X['+mm(b[0])+'..'+mm(b[3])+'] Y['+mm(b[1])+'..'+mm(b[4])+'] Z['+mm(b[2])+'..'+mm(b[5])+']');
console.log('afmeting (mm):', mm(b[3]-b[0])+' × '+mm(b[4]-b[1])+' × '+mm(b[5]-b[2]));
console.log('onderdelen:');
for(const kid of (agg.get(target)||[])){const cl=api.GetLine(bid,kid,false);console.log('  #'+kid,'name='+(cl?.Name?.value??''),'tag='+(cl?.Tag?.value??''));}
api.CloseModel(bid);
