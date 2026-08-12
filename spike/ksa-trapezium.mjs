// SPIKE (read-only) — vind de entree in BIL-KSA (brede deur tot maaiveld + buurraam) en meet of de
// RUWE opening/kozijn in het MODEL al trapezium is (onder breder) of dat de scheefstand pas in de app
// (best-fit) ontstaat. Meet breedte in een boven-band vs. onder-band van de vertices.
import { IfcAPI } from 'web-ifc'; import fs from 'fs';
const wi = await import('web-ifc');
const PATH = 'C:\\Users\\MurkAnneKooistraKooi\\Downloads\\downloads tot 10-7\\BIL-KSA-A-ZZ-PBP1.ifc';
const api = new IfcAPI(); await api.Init();
const bid = api.OpenModel(new Uint8Array(fs.readFileSync(PATH)));
const mm = v => Math.round(v*1000);

function verts(eID){ let mesh; try{mesh=api.GetFlatMesh(bid,eID);}catch{return null;} if(!mesh||mesh.geometries.size()===0)return null;
  const V=[]; let b=[1/0,1/0,1/0,-1/0,-1/0,-1/0];
  for(let gi=0;gi<mesh.geometries.size();gi++){ const pl=mesh.geometries.get(gi); let g;
    try{ g=api.GetGeometry(bid,pl.geometryExpressID); const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()); const m=pl.flatTransformation;
      for(let vi=0;vi<v.length;vi+=6){const x=v[vi],y=v[vi+1],z=v[vi+2];const w=[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];V.push(w);for(let k=0;k<3;k++){if(w[k]<b[k])b[k]=w[k];if(w[k]>b[k+3])b[k+3]=w[k];}}
    }catch{}finally{g?.delete();} }
  return b[0]===1/0?null:{V,b}; }

// lengte-as = grootste horizontale spreiding; hoogte-as = Y (model is Y-up? check) — pak as met grootste vert. spreiding als hoogte
function analyseShape(eID, label){
  const r=verts(eID); if(!r)return console.log(label+': geen geom');
  const {V,b}=r; const ext=[b[3]-b[0],b[4]-b[1],b[5]-b[2]];
  // hoogte = as met 2e-grootste? Neem Y als hoogte (BIL Y-up). lengte = max(X,Z).
  const hAx=1; const lAx = ext[0]>=ext[2]?0:2;
  const hMin=b[hAx], hMax=b[hAx+3], H=hMax-hMin;
  const band=(lo,hi)=>{ let mn=1/0,mx=-1/0; for(const w of V){ const t=(w[hAx]-hMin)/H; if(t>=lo&&t<=hi){ if(w[lAx]<mn)mn=w[lAx]; if(w[lAx]>mx)mx=w[lAx]; } } return mx>mn?mm(mx-mn):null; };
  console.log(`${label} #${eID}: lAx=${'XYZ'[lAx]} H=${mm(H)}  breedte ONDER(0-15%)=${band(0,0.15)}  MIDDEN(40-60%)=${band(0.4,0.6)}  BOVEN(85-100%)=${band(0.85,1)}  bbox-breedte=${mm(b[lAx+3]-b[lAx])}`);
}

// vind entree: IfcDoor met laagste Y-min (tot maaiveld) en breedte 800..1400
const dv=api.GetLineIDsWithType(bid, wi.IFCDOOR); let best=null;
for(let i=0;i<dv.size();i++){ const id=dv.get(i); const r=verts(id); if(!r)continue; const {b}=r; const w=Math.max(b[3]-b[0],b[5]-b[2]);
  if(mm(w)>=800&&mm(w)<=1500){ if(!best||b[1]<best.ymin){ best={id,ymin:b[1],b}; } } }
if(!best){ console.log('geen entree-deur gevonden'); api.CloseModel(bid); process.exit(0); }
console.log('ENTREE-DEUR #'+best.id+' Y-min='+mm(best.ymin)+' (laagste = maaiveld)');
analyseShape(best.id,'DEUR');
// buurraam: IfcWindow met bbox-overlap in de loodrechte richting, dichtbij
const d=best.b; const wv=api.GetLineIDsWithType(bid, wi.IFCWINDOW); let win=null;
for(let i=0;i<wv.size();i++){ const id=wv.get(i); const r=verts(id); if(!r)continue; const {b}=r;
  const near = Math.abs(b[0]-d[3])<800||Math.abs(d[0]-b[3])<800||Math.abs(b[2]-d[5])<800||Math.abs(d[2]-b[5])<800;
  const yov = b[4]>d[1]&&b[1]<d[4];
  if(near&&yov){ if(!win){win={id,b};} } }
if(win){ analyseShape(win.id,'BUURRAAM'); }
// voids gekoppeld aan deur+raam
console.log('\n-- VOIDS (IfcRelFillsElement) --');
const rel=api.GetLineIDsWithType(bid, wi.IFCRELFILLSELEMENT); const want=new Set([best.id, win?.id].filter(Boolean));
for(let i=0;i<rel.size();i++){ const rr=api.GetLine(bid,rel.get(i),false); if(want.has(rr?.RelatedBuildingElement?.value)) analyseShape(rr.RelatingOpeningElement.value, 'VOID(fill#'+rr.RelatedBuildingElement.value+')'); }
api.CloseModel(bid);
