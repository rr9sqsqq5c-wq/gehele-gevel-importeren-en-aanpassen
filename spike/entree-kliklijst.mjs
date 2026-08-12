// SPIKE — gecombineerde BUITEN-kliklijst van de entree: deur #55182 (links) + raam #60649 (rechts).
import { IfcAPI } from 'web-ifc';
import fs from 'fs';
const api = new IfcAPI(); await api.Init();
const bid = api.OpenModel(new Uint8Array(fs.readFileSync('public/BIL-MOO-A-ZZ-PBP.ifc')));
const mm = v => Math.round(v * 1000);

function analyse(eID){
  const mesh=api.GetFlatMesh(bid,eID); const subs=[]; let all=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
  for(let gi=0;gi<mesh.geometries.size();gi++){ const pl=mesh.geometries.get(gi); let g; const b=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
    try{ g=api.GetGeometry(bid,pl.geometryExpressID); const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()); const m=pl.flatTransformation;
      for(let vi=0;vi<v.length;vi+=6){const x=v[vi],y=v[vi+1],z=v[vi+2];const w=[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];for(let k=0;k<3;k++){if(w[k]<b[k])b[k]=w[k];if(w[k]>b[k+3])b[k+3]=w[k];}}
    }catch{}finally{g?.delete();}
    if(b[0]===Infinity)continue; subs.push(b); for(let k=0;k<3;k++){all[k]=Math.min(all[k],b[k]);all[k+3]=Math.max(all[k+3],b[k+3]);}
  }
  const ext=[all[3]-all[0],all[4]-all[1],all[5]-all[2]];
  const tAx=ext[0]<ext[2]?0:2, lAx=tAx===0?2:0, depth=ext[tAx];
  const span=b=>b[tAx+3]-b[tAx];
  if(subs.length<2||depth<=0) return {envLmin:mm(all[0]),envLmax:mm(all[3]),klikLmin:null,klikLmax:null,lAx};
  const thin=subs.reduce((a,b)=>span(b)<span(a)?b:a);
  if(span(thin)>=depth*0.6) return {envLmin:mm(all[lAx]),envLmax:mm(all[lAx+3]),klikLmin:null,klikLmax:null,lAx};
  const faceMax=(all[tAx+3]-thin[tAx+3])<=(thin[tAx]-all[tAx]); const TOL=Math.max(depth*0.15,0.003);
  const klik=subs.filter(b=>span(b)<depth*0.6 && (faceMax?(all[tAx+3]-b[tAx+3])<=TOL:(b[tAx]-all[tAx])<=TOL));
  return { envLmin:mm(all[lAx]), envLmax:mm(all[lAx+3]),
    klikLmin:mm(Math.min(...klik.map(b=>b[lAx]))), klikLmax:mm(Math.max(...klik.map(b=>b[lAx]?b[lAx+3]:b[lAx+3]))), lAx };
}
const D = analyse(55182);   // deur (links)
const W = analyse(60649);   // raam (rechts)
console.log('DEUR #55182 : frame L['+D.envLmin+'..'+D.envLmax+']  kliklijst L['+D.klikLmin+'..'+D.klikLmax+']');
console.log('RAAM #60649 : frame L['+W.envLmin+'..'+W.envLmax+']  kliklijst L['+W.klikLmin+'..'+W.klikLmax+']');
const frameL=Math.min(D.envLmin,W.envLmin), frameR=Math.max(D.envLmax,W.envLmax);
const klL = D.klikLmin!=null?D.klikLmin:D.envLmin, klR = W.klikLmax!=null?W.klikLmax:W.envLmax;
console.log('\n═══ GECOMBINEERDE ENTREE ═══');
console.log('  buiten-FRAME    : '+(frameR-frameL)+' mm   ['+frameL+'..'+frameR+']');
console.log('  buiten-KLIKLIJST: '+(klR-klL)+' mm   [deur-links '+klL+' .. raam-rechts '+klR+']');
console.log('  → gevelopening bij 10mm offset vanaf KLIKLIJST: '+((klR-klL)+20)+' mm');
console.log('  → gevelopening bij 10mm offset vanaf FRAME    : '+((frameR-frameL)+20)+' mm   (jouw model: 2300)');
api.CloseModel(bid);
