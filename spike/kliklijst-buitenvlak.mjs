// SPIKE — vergelijk kliklijst-breedte via VOLLE bead-bbox vs. via het BUITENSTE diepte-vlak (zichtbare
// klik-lijn, zonder de klik-voet in de sponning). Doel: de links/rechts-asymmetrie wegnemen.
import { IfcAPI } from 'web-ifc';
import fs from 'fs';
const wi = await import('web-ifc');
const api = new IfcAPI(); await api.Init();
const bid = api.OpenModel(new Uint8Array(fs.readFileSync('public/BIL-MOO-A-ZZ-PBP.ifc')));
const mm = v => Math.round(v * 1000);

function analyse(eID, DELTA_MM = 3) {
  const mesh = api.GetFlatMesh(bid, eID); const subs = [];
  let all=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
  for (let gi=0; gi<mesh.geometries.size(); gi++){ const pl=mesh.geometries.get(gi); let g; const V=[]; const b=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
    try{ g=api.GetGeometry(bid,pl.geometryExpressID); const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()); const m=pl.flatTransformation;
      for(let vi=0;vi<v.length;vi+=6){const x=v[vi],y=v[vi+1],z=v[vi+2];const w=[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];V.push(w);for(let k=0;k<3;k++){if(w[k]<b[k])b[k]=w[k];if(w[k]>b[k+3])b[k+3]=w[k];}}
    }catch{}finally{g?.delete();}
    if(b[0]===Infinity)continue; subs.push({V,b}); for(let k=0;k<3;k++){all[k]=Math.min(all[k],b[k]);all[k+3]=Math.max(all[k+3],b[k+3]);}
  }
  const ext=[all[3]-all[0],all[4]-all[1],all[5]-all[2]];
  const tAx=ext[0]<ext[2]?0:2, lAx=tAx===0?2:0, depth=ext[tAx];
  const span=b=>b[tAx+3]-b[tAx];
  const thin=subs.reduce((a,b)=>span(b.b)<span(a.b)?b:a);
  const faceMax=(all[tAx+3]-thin.b[tAx+3])<=(thin.b[tAx]-all[tAx]); const TOL=Math.max(depth*0.15,0.003);
  const klik=subs.filter(s=>span(s.b)<depth*0.6 && (faceMax?(all[tAx+3]-s.b[tAx+3])<=TOL:(s.b[tAx]-all[tAx])<=TOL));
  // (a) volle bbox
  const fullLmin=Math.min(...klik.map(s=>s.b[lAx])), fullLmax=Math.max(...klik.map(s=>s.b[lAx+3]));
  // (b) buitenste diepte-vlak: alleen vertices op het buitenvlak (± DELTA)
  const face = faceMax ? all[tAx+3] : all[tAx]; const d = DELTA_MM/1000;
  let faceLmin=Infinity, faceLmax=-Infinity;
  for(const s of klik) for(const w of s.V){ const near = faceMax ? (face - w[tAx] <= d) : (w[tAx] - face <= d); if(near){ if(w[lAx]<faceLmin)faceLmin=w[lAx]; if(w[lAx]>faceLmax)faceLmax=w[lAx]; } }
  return { lAx, tAx, envLmin:mm(all[lAx]), envLmax:mm(all[lAx+3]),
    full:{Lmin:mm(fullLmin),Lmax:mm(fullLmax)}, face:{Lmin:mm(faceLmin),Lmax:mm(faceLmax)}, faceMax };
}

for (const wID of [60470, 63430, 60649]) {
  const r = analyse(wID);
  const li_full=r.full.Lmin-r.envLmin, ri_full=r.envLmax-r.full.Lmax;
  const li_face=r.face.Lmin-r.envLmin, ri_face=r.envLmax-r.face.Lmax;
  console.log(`\n#${wID}  (buitenvlak=${r.faceMax?'max':'min'})`);
  console.log(`  VOLLE bbox : L[${r.full.Lmin}..${r.full.Lmax}]  inzet links ${li_full}  rechts ${ri_full}  (asym ${Math.abs(li_full-ri_full)})`);
  console.log(`  BUITENVLAK : L[${r.face.Lmin}..${r.face.Lmax}]  inzet links ${li_face}  rechts ${ri_face}  (asym ${Math.abs(li_face-ri_face)})`);
}
api.CloseModel(bid);
