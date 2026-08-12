// Reproduceer getFacadePolygon's 20mm-raster voor raam #75792 op host-wand #68695: exact vs raster.
import { IfcAPI } from 'web-ifc'; import fs from 'fs';
const api = new IfcAPI(); await api.Init();
const bid = api.OpenModel(new Uint8Array(fs.readFileSync('public/BIL-MOO-A-ZZ-PBP.ifc')));
const mm = v => Math.round(v*1000);
function worldVerts(eID){ const mesh=api.GetFlatMesh(bid,eID); const V=[];
  for(let gi=0;gi<mesh.geometries.size();gi++){ const pl=mesh.geometries.get(gi); let g;
    try{ g=api.GetGeometry(bid,pl.geometryExpressID); const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()); const m=pl.flatTransformation;
      for(let vi=0;vi<v.length;vi+=6){const x=v[vi],y=v[vi+1],z=v[vi+2];V.push([m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]]);}
    }catch{}finally{g?.delete();} } return V; }
// wand #68695 bbox → minZ (lAxis = Z, want raam ligt langs Z)
const wv = worldVerts(68695); let wminZ=1/0; for(const p of wv) if(p[2]<wminZ)wminZ=p[2];
// raam vertices → L = (Z - wminZ)*1000
const rv = worldVerts(75792);
let lmin=1/0,lmax=-1/0; for(const p of rv){ const L=(p[2]-wminZ)*1000; if(L<lmin)lmin=L; if(L>lmax)lmax=L; }
const GRID=20;
const glmin=Math.round(lmin/GRID), glmax=Math.round(lmax/GRID);
console.log('raam #75792 op wand #68695:');
console.log('  EXACT projectie L: '+Math.round(lmin)+' .. '+Math.round(lmax)+'  → breedte '+Math.round(lmax-lmin)+' mm');
console.log('  RASTER-20 (getFacadePolygon): '+(glmin*GRID)+' .. '+(glmax*GRID)+'  → breedte '+((glmax-glmin)*GRID)+' mm');
console.log('  inflatie door raster: '+(((glmax-glmin)*GRID) - Math.round(lmax-lmin))+' mm');
api.CloseModel(bid);
