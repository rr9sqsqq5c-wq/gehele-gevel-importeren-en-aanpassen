// Rotatie-onafhankelijke breedte van raam #75792: PCA op de horizontale (X,Z) vertices → hoofd-extent.
import { IfcAPI } from 'web-ifc'; import fs from 'fs';
const api = new IfcAPI(); await api.Init();
const bid = api.OpenModel(new Uint8Array(fs.readFileSync('public/BIL-MOO-A-ZZ-PBP.ifc')));
const mm = v => Math.round(v*1000);
const mesh = api.GetFlatMesh(bid, 75792); const P=[];
for(let gi=0;gi<mesh.geometries.size();gi++){ const pl=mesh.geometries.get(gi); let g;
  try{ g=api.GetGeometry(bid,pl.geometryExpressID); const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()); const m=pl.flatTransformation;
    for(let vi=0;vi<v.length;vi+=6){const x=v[vi],y=v[vi+1],z=v[vi+2];P.push([m[0]*x+m[4]*y+m[8]*z+m[12], m[2]*x+m[6]*y+m[10]*z+m[14]]);}
  }catch{}finally{g?.delete();} }
// PCA op (X,Z)
const n=P.length; let cx=0,cz=0; for(const p of P){cx+=p[0];cz+=p[1];} cx/=n; cz/=n;
let sxx=0,sxz=0,szz=0; for(const p of P){const dx=p[0]-cx,dz=p[1]-cz; sxx+=dx*dx; sxz+=dx*dz; szz+=dz*dz;}
sxx/=n;sxz/=n;szz/=n;
const tr=sxx+szz, det=sxx*szz-sxz*sxz; const l1=tr/2+Math.sqrt(tr*tr/4-det);
// hoofdrichting
const ang=Math.atan2(l1-sxx, sxz); const ux=Math.cos(ang), uz=Math.sin(ang);
let lo=1/0,hi=-1/0, lo2=1/0,hi2=-1/0;
for(const p of P){ const t=(p[0]-cx)*ux+(p[1]-cz)*uz; const s=-(p[0]-cx)*uz+(p[1]-cz)*ux;
  if(t<lo)lo=t; if(t>hi)hi=t; if(s<lo2)lo2=s; if(s>hi2)hi2=s; }
// axis-aligned bbox ter vergelijking
let xmn=1/0,xmx=-1/0,zmn=1/0,zmx=-1/0; for(const p of P){if(p[0]<xmn)xmn=p[0];if(p[0]>xmx)xmx=p[0];if(p[1]<zmn)zmn=p[1];if(p[1]>zmx)zmx=p[1];}
console.log('raam #75792  (Overall Width nominaal = 1800)');
console.log('  axis-aligned bbox: X='+mm(xmx-xmn)+'  Z='+mm(zmx-zmn));
console.log('  PCA hoofd-extent (= ware breedte):', mm(hi-lo), 'mm   |  loodrecht (diepte):', mm(hi2-lo2), 'mm');
console.log('  hoofdrichting hoek t.o.v. X:', (ang*180/Math.PI).toFixed(1)+'°');
api.CloseModel(bid);
