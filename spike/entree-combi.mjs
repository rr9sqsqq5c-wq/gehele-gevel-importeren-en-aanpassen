// SPIKE — gecombineerde frame-maat van de entree (raam #60649 + naastgelegen deur).
import { IfcAPI } from 'web-ifc';
import fs from 'fs';
const wi = await import('web-ifc');
const api = new IfcAPI(); await api.Init();
const bid = api.OpenModel(new Uint8Array(fs.readFileSync('public/BIL-MOO-A-ZZ-PBP.ifc')));
const mm = v => Math.round(v * 1000);

function bbox(eID){
  let mesh; try{mesh=api.GetFlatMesh(bid,eID);}catch{return null;} if(!mesh||mesh.geometries.size()===0)return null;
  let b=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
  for(let gi=0;gi<mesh.geometries.size();gi++){ const pl=mesh.geometries.get(gi); let g;
    try{ g=api.GetGeometry(bid,pl.geometryExpressID); const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()); const m=pl.flatTransformation;
      for(let vi=0;vi<v.length;vi+=6){const x=v[vi],y=v[vi+1],z=v[vi+2];const w=[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];for(let k=0;k<3;k++){if(w[k]<b[k])b[k]=w[k];if(w[k]>b[k+3])b[k+3]=w[k];}}
    }catch{}finally{g?.delete();}
  }
  return b[0]===Infinity?null:b;
}
// raam #60649
const win = bbox(60649);
console.log('RAAM #60649 wereld-bbox mm: X['+mm(win[0])+'..'+mm(win[3])+'] Y['+mm(win[1])+'..'+mm(win[4])+'] Z['+mm(win[2])+'..'+mm(win[5])+']  breedte X '+mm(win[3]-win[0]));
// lengte-as = X (breedste horizontaal), dikte = Z
// zoek deuren die aansluiten (Y-overlap, Z-overlap, X net rechts van het raam)
const doorVec = api.GetLineIDsWithType(bid, wi.IFCDOOR);
const cands=[];
for(let i=0;i<doorVec.size();i++){ const dID=doorVec.get(i); const b=bbox(dID); if(!b)continue;
  const yOv = b[4]>win[1] && b[1]<win[4];
  const zOv = b[5]>win[2]-300 && b[2]<win[5]+300;
  const xGap = Math.min(Math.abs(b[0]-win[3]), Math.abs(win[0]-b[3])); // afstand raam-deur langs X
  if(yOv && zOv && xGap<600){ const l=api.GetLine(bid,dID,false); cands.push({dID, name:l?.Name?.value??'', tag:l?.Tag?.value??'', b, xGap:mm(xGap)}); }
}
cands.sort((a,b)=>a.xGap-b.xGap);
console.log('\naansluitende deuren:', cands.length);
for(const c of cands.slice(0,3)){
  console.log('  DEUR #'+c.dID+' "'+c.name+'" tag='+c.tag+'  X['+mm(c.b[0])+'..'+mm(c.b[3])+'] breedte '+mm(c.b[3]-c.b[0])+'  gap '+c.xGap);
}
if(cands.length){
  const d=cands[0].b;
  const cXmin=Math.min(win[0],d[0]), cXmax=Math.max(win[3],d[3]);
  console.log('\n═══ GECOMBINEERD raam+deur ═══');
  console.log('  raam-links  X '+mm(win[0])+'   deur-rechts X '+mm(d[3]));
  console.log('  gecombineerde FRAME-breedte X: '+mm(cXmax-cXmin)+' mm   (schermmeting bovenaan 2245)');
  console.log('  gecombineerde Y (hoogte): '+mm(Math.max(win[4],d[4])-Math.min(win[1],d[1]))+' mm');
}
api.CloseModel(bid);
