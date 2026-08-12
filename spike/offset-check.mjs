// SPIKE — meet de offset van de gevelbekleding t.o.v. de kliklijst. Per raam: kliklijst-rand (BIL-MOO)
// vs. de strip-knip-rand (export). Verwachting L/R = 10 mm, boven/onder = 25 mm.
import { IfcAPI } from 'web-ifc';
import fs from 'fs';
const wi = await import('web-ifc');
const EXPORT = 'C:/Users/MurkAnneKooistraKooi/Downloads/BIL-KSA-A-ZZ-PBP_Groep_1_Groep_2_Groep_3_Groep_3-1_Groep_4_Groep_5_Groep_6_Groep_7_Groep_8_gevelbekleding (4).ifc';
const api = new IfcAPI(); await api.Init();
const mm = v => Math.round(v * 1000);

// ── 1. EXPORT: alle Steenstrip-bboxes (mm) ──
const eid = api.OpenModel(new Uint8Array(fs.readFileSync(EXPORT)));
const S = { x0:[], x1:[], y0:[], y1:[], z0:[], z1:[] };
api.StreamAllMeshes(eid, (mesh) => {
  let bx0=Infinity,bx1=-Infinity,by0=Infinity,by1=-Infinity,bz0=Infinity,bz1=-Infinity;
  for (let gi=0; gi<mesh.geometries.size(); gi++){
    const pl=mesh.geometries.get(gi); let g;
    try{ g=api.GetGeometry(eid,pl.geometryExpressID); const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()); const m=pl.flatTransformation;
      for(let vi=0;vi<v.length;vi+=6){ const x=v[vi],y=v[vi+1],z=v[vi+2];
        const wx=m[0]*x+m[4]*y+m[8]*z+m[12], wy=m[1]*x+m[5]*y+m[9]*z+m[13], wz=m[2]*x+m[6]*y+m[10]*z+m[14];
        if(wx<bx0)bx0=wx;if(wx>bx1)bx1=wx;if(wy<by0)by0=wy;if(wy>by1)by1=wy;if(wz<bz0)bz0=wz;if(wz>bz1)bz1=wz; }
    }catch{} finally{ g?.delete(); }
  }
  if(bx0!==Infinity){ S.x0.push(mm(bx0));S.x1.push(mm(bx1));S.y0.push(mm(by0));S.y1.push(mm(by1));S.z0.push(mm(bz0));S.z1.push(mm(bz1)); }
});
const NST = S.x0.length;
console.log('strips geladen:', NST);

// ── 2. BIL-MOO: kliklijst-wereldrand per raam ──
const bid = api.OpenModel(new Uint8Array(fs.readFileSync('public/BIL-MOO-A-ZZ-PBP.ifc')));
const winVec = api.GetLineIDsWithType(bid, wi.IFCWINDOW);
function klikWorld(eID) {
  let mesh; try{ mesh=api.GetFlatMesh(bid,eID);}catch{return null;} if(!mesh||mesh.geometries.size()===0)return null;
  const subs=[]; let all=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
  for(let gi=0;gi<mesh.geometries.size();gi++){ const pl=mesh.geometries.get(gi); let g; const b=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
    try{ g=api.GetGeometry(bid,pl.geometryExpressID); const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()); const m=pl.flatTransformation;
      for(let vi=0;vi<v.length;vi+=6){ const x=v[vi],y=v[vi+1],z=v[vi+2]; const w=[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];
        for(let k=0;k<3;k++){if(w[k]<b[k])b[k]=w[k];if(w[k]>b[k+3])b[k+3]=w[k];} }
    }catch{} finally{ g?.delete(); }
    if(b[0]===Infinity)continue; subs.push(b); for(let k=0;k<3;k++){all[k]=Math.min(all[k],b[k]);all[k+3]=Math.max(all[k+3],b[k+3]);}
  }
  if(subs.length<2)return null;
  const ext=[all[3]-all[0],all[4]-all[1],all[5]-all[2]];
  const hAx=1; // Y-up
  const tAx = ext[0]<ext[2]?0:2;              // dunste horizontale = dikte
  const lAx = tAx===0?2:0;
  const depth=ext[tAx]; if(depth<=0)return null;
  const span=b=>b[tAx+3]-b[tAx];
  const thin=subs.reduce((a,b)=>span(b)<span(a)?b:a); if(span(thin)>=depth*0.6)return null;
  const faceMax=(all[tAx+3]-thin[tAx+3])<=(thin[tAx]-all[tAx]); const TOL=Math.max(depth*0.15,0.003);
  const klik=subs.filter(b=>span(b)<depth*0.6 && (faceMax?(all[tAx+3]-b[tAx+3])<=TOL:(b[tAx]-all[tAx])<=TOL));
  if(!klik.length)return null;
  return {
    Lmin:mm(Math.min(...klik.map(b=>b[lAx]))), Lmax:mm(Math.max(...klik.map(b=>b[lAx]))),
    Hmin:mm(Math.min(...klik.map(b=>b[1]))),   Hmax:mm(Math.max(...klik.map(b=>b[1]))),
    envLmin:mm(all[lAx]), envLmax:mm(all[lAx+3]), envHmin:mm(all[1]), envHmax:mm(all[4]), // hele-kozijn envelope
    tCen:mm((all[tAx]+all[tAx+3])/2), lAx, tAx,
  };
}

// ── 3. meet per raam ──
const results=[];
for(let wi2=0; wi2<winVec.size(); wi2++){
  const wID=winVec.get(wi2); const k=klikWorld(wID); if(!k)continue;
  const Lc=(k.Lmin+k.Lmax)/2, Hc=(k.Hmin+k.Hmax)/2;
  // strip-arrays voor de lengte-as
  const L0 = k.lAx===0?S.x0:S.z0, L1=k.lAx===0?S.x1:S.z1;
  const T0 = k.tAx===0?S.x0:S.z0, T1=k.tAx===0?S.x1:S.z1;
  // strips op ditzelfde gevelvlak (dikte-positie dicht bij de kliklijst) + in de buurt (L/H)
  const near=[];
  for(let i=0;i<NST;i++){
    const tc=(T0[i]+T1[i])/2; if(Math.abs(tc-k.tCen)>400)continue;   // zelfde gevelvlak (ruimer voor lat+paneel-diepte)
    if(L1[i]<k.Lmin-400||L0[i]>k.Lmax+400)continue;                  // dicht bij de opening (geen buur-opening)
    if(S.y1[i]<k.Hmin-400||S.y0[i]>k.Hmax+400)continue;
    near.push(i);
  }
  if(near.length<8)continue; // te weinig strips rond dit raam (niet-beklede gevel/groep)
  // knip-randen: dichtstbijzijnde strip-rand aan elke kant; band-lidmaatschap via strip-CENTRUM.
  let cl=-Infinity,cr=Infinity,cb=-Infinity,ct=Infinity;
  for(const i of near){
    const lc=(L0[i]+L1[i])/2, yc=(S.y0[i]+S.y1[i])/2;
    const yIn = yc>k.Hmin && yc<k.Hmax;   // strip-centrum binnen de raamhoogte
    const xIn = lc>k.Lmin && lc<k.Lmax;   // strip-centrum binnen de raambreedte
    if(yIn){ if(L1[i]<=Lc && L1[i]>cl)cl=L1[i]; if(L0[i]>=Lc && L0[i]<cr)cr=L0[i]; }
    if(xIn){ if(S.y1[i]<=Hc && S.y1[i]>cb)cb=S.y1[i]; if(S.y0[i]>=Hc && S.y0[i]<ct)ct=S.y0[i]; }
  }
  // offset t.o.v. kliklijst én t.o.v. envelope (hele kozijn)
  const oL = cl>-Infinity? k.Lmin-cl : null,  eL = cl>-Infinity? k.envLmin-cl : null;
  const oR = cr<Infinity? cr-k.Lmax : null,   eR = cr<Infinity? cr-k.envLmax : null;
  const oB = cb>-Infinity? k.Hmin-cb : null,  eB = cb>-Infinity? k.envHmin-cb : null;
  const oT = ct<Infinity? ct-k.Hmax : null,   eT = ct<Infinity? ct-k.envHmax : null;
  results.push({wID, oL,oR,oB,oT, eL,eR,eB,eT});
}
console.log('\ngemeten ramen met bekleding rondom:', results.length);
const fmt=v=>v==null?'  -':String(v).padStart(4);
console.log('  raam  |  t.o.v. KLIKLIJST L/R/O/B  |  t.o.v. ENVELOPE L/R/O/B   (verwacht L/R=10, O/B=25)');
for(const r of results.slice(0,18)) console.log('  #'+String(r.wID).padEnd(7)+' '+fmt(r.oL)+fmt(r.oR)+fmt(r.oT)+fmt(r.oB)+'   |  '+fmt(r.eL)+fmt(r.eR)+fmt(r.eT)+fmt(r.eB));
const med=(a)=>{const s=a.filter(v=>v!=null&&isFinite(v)).sort((x,y)=>x-y); return s.length?s[Math.floor(s.length/2)]:null;};
const kLR=[...results.map(r=>r.oL),...results.map(r=>r.oR)], kOB=[...results.map(r=>r.oT),...results.map(r=>r.oB)];
const eLR=[...results.map(r=>r.eL),...results.map(r=>r.eR)], eOB=[...results.map(r=>r.eT),...results.map(r=>r.eB)];
console.log('\nMEDIAAN t.o.v. KLIKLIJST : L/R='+med(kLR)+'  O/B='+med(kOB));
console.log('MEDIAAN t.o.v. ENVELOPE : L/R='+med(eLR)+'  O/B='+med(eOB)+'   ← als dit ~10/~25 is, gebruikte de export de ENVELOPE');
api.CloseModel(eid); api.CloseModel(bid);
