// WEGWERP (spike/) — MEET het L/R-verschil (mm) tussen de KOZIJNRAND (IfcWindow, BIL-MOO) en de
// LEKDORPEL-boven (proxy-stukjes, BIL-MJN), per kozijn. Up-as = Y. Horizontale as per kozijn = de
// grootste van X/Z; diepte = de andere. Lekdorpel-stukjes net boven de kozijnkop worden geaggregeerd.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { readFileSync } from 'fs';
const DIR = 'C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/Moos-Bilderdammerweg/';

async function getApi(){const W=require('web-ifc');const api=new W.IfcAPI();try{await api.Init();}catch{api.SetWasmPath('./node_modules/web-ifc/',true);await api.Init();}return {W,api};}
function bbox(api,m,id){let mesh;try{mesh=api.GetFlatMesh(m,id);}catch{return null;}if(!mesh||mesh.geometries.size()===0)return null;
  let lo=[1/0,1/0,1/0],hi=[-1/0,-1/0,-1/0],ok=false;
  for(let gi=0;gi<mesh.geometries.size();gi++){const pl=mesh.geometries.get(gi);let g;try{g=api.GetGeometry(m,pl.geometryExpressID);}catch{continue;}
    const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()),t=pl.flatTransformation;
    for(let i=0;i<v.length;i+=6){const x=v[i],y=v[i+1],z=v[i+2];const w=[t[0]*x+t[4]*y+t[8]*z+t[12],t[1]*x+t[5]*y+t[9]*z+t[13],t[2]*x+t[6]*y+t[10]*z+t[14]];
      for(let a=0;a<3;a++){if(w[a]<lo[a])lo[a]=w[a];if(w[a]>hi[a])hi[a]=w[a];}ok=true;}g?.delete?.();}
  return ok?{lo,hi}:null;}
const mm=v=>v*1000;

(async()=>{
  const {W,api}=await getApi();
  // 1) kozijnen
  const m1=api.OpenModel(new Uint8Array(readFileSync(DIR+'BIL-MOO-A-ZZ-PBP.ifc')),{});
  const wv=api.GetLineIDsWithType(m1,W.IFCWINDOW);const wins=[];
  for(let i=0;i<wv.size()&&wins.length<40;i++){const b=bbox(api,m1,wv.get(i));if(!b)continue;
    const ext=[b.hi[0]-b.lo[0],b.hi[1]-b.lo[1],b.hi[2]-b.lo[2]];
    // up=Y(1). horizontale as = grootste van X(0)/Z(2). diepte = kleinste van X/Z.
    const hAx=ext[0]>=ext[2]?0:2, dAx=hAx===0?2:0;
    if(ext[hAx]<0.6)continue; // te smal → geen echt raam
    wins.push({id:wv.get(i),lo:b.lo,hi:b.hi,hAx,dAx,topY:b.hi[1]});}
  api.CloseModel(m1);
  // 2) lekdorpel-stukjes
  const m2=api.OpenModel(new Uint8Array(readFileSync(DIR+'BIL-MJN-L-ZZ-PBP.ifc')),{});
  const pv=api.GetLineIDsWithType(m2,W.IFCBUILDINGELEMENTPROXY);const leks=[];
  for(let i=0;i<pv.size();i++){const id=pv.get(i);let nm='';try{nm=String(api.GetLine(m2,id,false)?.Name?.value??'');}catch{}
    if(!/lekdorpel/i.test(nm))continue;const b=bbox(api,m2,id);if(b)leks.push({lo:b.lo,hi:b.hi,cx:(b.lo[0]+b.hi[0])/2,cy:(b.lo[1]+b.hi[1])/2,cz:(b.lo[2]+b.hi[2])/2});}
  api.CloseModel(m2);
  console.log(`kozijnen ${wins.length} · lekdorpel-stukjes ${leks.length}\n`);

  // 3) per kozijn: lekdorpel-stukjes net BOVEN de kop (Y in [topY-20, topY+200]) + overlappend op de
  //    horizontale as + dicht op de diepte-as → aggregeer horizontale min/max.
  let reported=0; const deltas=[];
  for(const w of wins){
    const hLo=w.lo[w.hAx],hHi=w.hi[w.hAx],dC=(w.lo[w.dAx]+w.hi[w.dAx])/2;
    const near=leks.filter(l=>{
      const ly=l.cy; if(ly<w.topY-0.05||ly>w.topY+0.30)return false;              // net boven de kop
      const lhLo=l.lo[w.hAx],lhHi=l.hi[w.hAx]; if(lhHi<hLo-0.05||lhLo>hHi+0.05)return false; // horizontale overlap
      const ld=(l.lo[w.dAx]+l.hi[w.dAx])/2; if(Math.abs(ld-dC)>0.30)return false;  // zelfde vlak (diepte)
      return true;});
    if(near.length<1)continue;
    const lekLo=Math.min(...near.map(l=>l.lo[w.hAx])),lekHi=Math.max(...near.map(l=>l.hi[w.hAx]));
    const dL=mm(hLo-lekLo), dR=mm(lekHi-hHi);   // + = kozijn ligt binnen de lekdorpel (lekdorpel steekt uit)
    deltas.push({dL,dR});
    if(reported<8){console.log(`win#${w.id} as=${['X','Y','Z'][w.hAx]} kozijnB=${mm(hHi-hLo).toFixed(0)} lekB=${mm(lekHi-lekLo).toFixed(0)} · ΔL=${dL.toFixed(0)} ΔR=${dR.toFixed(0)} (stukjes ${near.length})`);reported++;}
  }
  console.log(`\n=== samenvatting (${deltas.length} kozijnen met lekdorpel) ===`);
  if(deltas.length){
    const avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
    const aL=avg(deltas.map(d=>d.dL)),aR=avg(deltas.map(d=>d.dR));
    const asym=deltas.map(d=>Math.abs(d.dL-d.dR));
    console.log(`  gem. ΔL=${aL.toFixed(1)}mm · gem. ΔR=${aR.toFixed(1)}mm`);
    console.log(`  gem. |ΔL-ΔR| (a-symmetrie kozijn↔lekdorpel) = ${avg(asym).toFixed(1)}mm · max ${Math.max(...asym).toFixed(0)}mm`);
    console.log(`  ${avg(asym)>3?'🟠 kozijn ligt NIET symmetrisch t.o.v. de lekdorpel':'🟢 kozijn ≈ symmetrisch t.o.v. lekdorpel'}`);
  } else console.log('  geen matches — matching-criteria bijstellen.');
})();
