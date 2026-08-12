// SPIKE — samengesteld kozijn: dump elke sub-geometrie met z'n L-randen (lengte-as), diepte-span en
// diepte-band, zodat we de links/rechts-asymmetrie in de kliklijst-breedte-meting kunnen zien.
import { IfcAPI } from 'web-ifc';
import fs from 'fs';
const wi = await import('web-ifc');
const api = new IfcAPI(); await api.Init();
const bid = api.OpenModel(new Uint8Array(fs.readFileSync('public/BIL-MOO-A-ZZ-PBP.ifc')));
const mm = v => Math.round(v * 1000);

// zoek de breedste ramen (samengesteld = veel sub-geoms / breed) en dump #60470 (2-ruits) + een paar brede
const winVec = api.GetLineIDsWithType(bid, wi.IFCWINDOW);
function subs(eID){
  const mesh=api.GetFlatMesh(bid,eID); const out=[]; let all=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
  for(let gi=0;gi<mesh.geometries.size();gi++){ const pl=mesh.geometries.get(gi); let g; const b=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
    try{ g=api.GetGeometry(bid,pl.geometryExpressID); const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()); const m=pl.flatTransformation;
      for(let vi=0;vi<v.length;vi+=6){const x=v[vi],y=v[vi+1],z=v[vi+2];const w=[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];for(let k=0;k<3;k++){if(w[k]<b[k])b[k]=w[k];if(w[k]>b[k+3])b[k+3]=w[k];}}
    }catch{}finally{g?.delete();}
    if(b[0]===Infinity)continue; out.push({id:pl.geometryExpressID,b}); for(let k=0;k<3;k++){all[k]=Math.min(all[k],b[k]);all[k+3]=Math.max(all[k+3],b[k+3]);}
  }
  return {out,all};
}

for (const wID of [60649]) {
  const {out,all}=subs(wID);
  const ext=[all[3]-all[0],all[4]-all[1],all[5]-all[2]];
  const tAx = ext[0]<ext[2]?0:2, lAx = tAx===0?2:0;
  const depth=ext[tAx]; const span=b=>b[tAx+3]-b[tAx];
  const AXN='XYZ';
  console.log(`\n═══ Raam #${wID} — lengte-as=${AXN[lAx]}, dikte-as=${AXN[tAx]}, diepte=${mm(depth)}mm ═══`);
  console.log(`  envelope L: ${mm(all[lAx])} .. ${mm(all[lAx+3])}  (breedte ${mm(all[lAx+3]-all[lAx])})`);
  // sorteer op L-min
  const rows = out.map(o=>({id:o.id, Lmin:mm(o.b[lAx]), Lmax:mm(o.b[lAx+3]), span:mm(span(o.b)), Tmin:mm(o.b[tAx]), Tmax:mm(o.b[tAx+3])})).sort((a,b)=>a.Lmin-b.Lmin);
  const allTmax=mm(all[tAx+3]), allTmin=mm(all[tAx]);
  console.log('  sub-geoms (op L-min gesorteerd):');
  for(const r of rows){ const buiten = (allTmax-r.Tmax)<=Math.max(mm(depth)*0.15,3) || (r.Tmin-allTmin)<=Math.max(mm(depth)*0.15,3); const dun=r.span<mm(depth)*0.6;
    console.log(`    geom#${r.id}: L[${String(r.Lmin).padStart(6)}..${String(r.Lmax).padStart(6)}] br${String(r.Lmax-r.Lmin).padStart(5)}  dikte[${r.Tmin}..${r.Tmax}] span${r.span}${dun&&buiten?'  ← KLIKLIJST':(dun?'  (dun, niet buiten)':'')}`);
  }
  // huidige kliklijst-detectie: dunne aan buitenvlak
  const thin=rows.reduce((a,b)=>b.span<a.span?b:a);
  const faceMax=(allTmax-thin.Tmax)<=(thin.Tmin-allTmin); const TOL=Math.max(mm(depth)*0.15,3);
  const klik=rows.filter(r=>r.span<mm(depth)*0.6 && (faceMax?(allTmax-r.Tmax)<=TOL:(r.Tmin-allTmin)<=TOL));
  const kLmin=Math.min(...klik.map(r=>r.Lmin)), kLmax=Math.max(...klik.map(r=>r.Lmax));
  console.log(`  → KLIKLIJST-rect L[${kLmin}..${kLmax}]  breedte ${kLmax-kLmin}  (#beads ${klik.length}, buitenvlak=${faceMax?'max':'min'})`);
  console.log(`     LINKS: kliklijst-Lmin ${kLmin} vs envelope-Lmin ${mm(all[lAx])}  → verschil ${kLmin-mm(all[lAx])}`);
  console.log(`     RECHTS: kliklijst-Lmax ${kLmax} vs envelope-Lmax ${mm(all[lAx+3])}  → verschil ${mm(all[lAx+3])-kLmax}`);
}
api.CloseModel(bid);
