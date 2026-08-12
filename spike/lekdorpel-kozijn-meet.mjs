// WEGWERP (spike/) — MEET: verschil in mm tussen kozijn (IfcWindow, BIL-MOO) en lekdorpel
// (IfcBuildingElementProxy 'lekdorpel_boven kozijn', BIL-MJN). Delen ze een frame? En zo ja, hoe
// groot is het L/R-verschil tussen de kozijnrand en de lekdorpelrand?
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { readFileSync } from 'fs';
const DIR = 'C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/Moos-Bilderdammerweg/';
const MOO = DIR + 'BIL-MOO-A-ZZ-PBP.ifc';
const MJN = DIR + 'BIL-MJN-L-ZZ-PBP.ifc';

async function getApi() { const W = require('web-ifc'); const api = new W.IfcAPI(); try { await api.Init(); } catch { api.SetWasmPath('./node_modules/web-ifc/', true); await api.Init(); } return { W, api }; }
function bbox(api, m, id) {
  let mesh; try { mesh = api.GetFlatMesh(m, id); } catch { return null; }
  if (!mesh || mesh.geometries.size() === 0) return null;
  let lo=[1/0,1/0,1/0], hi=[-1/0,-1/0,-1/0], ok=false;
  for (let gi=0; gi<mesh.geometries.size(); gi++) { const pl=mesh.geometries.get(gi); let g; try{g=api.GetGeometry(m,pl.geometryExpressID);}catch{continue;}
    const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()), t=pl.flatTransformation;
    for (let i=0;i<v.length;i+=6){const x=v[i],y=v[i+1],z=v[i+2];
      const w=[t[0]*x+t[4]*y+t[8]*z+t[12], t[1]*x+t[5]*y+t[9]*z+t[13], t[2]*x+t[6]*y+t[10]*z+t[14]];
      for(let a=0;a<3;a++){if(w[a]<lo[a])lo[a]=w[a];if(w[a]>hi[a])hi[a]=w[a];} ok=true;} g?.delete?.(); }
  return ok ? { lo, hi } : null;
}
function collect(api, m, type, nameFilter, max) {
  const vec = api.GetLineIDsWithType(m, type); const out = [];
  const n = vec.size();
  for (let i=0; i<n && out.length<max; i++) { const id=vec.get(i);
    let nm=''; try{nm=String(api.GetLine(m,id,false)?.Name?.value ?? '');}catch{}
    if (nameFilter && !nameFilter.test(nm)) continue;
    const b=bbox(api,m,id); if(b) out.push({ id, nm, ...b, w: (b.hi[1]-b.lo[1])*1000, hgt:(b.hi[2]-b.lo[2])*1000 });
  }
  return out;
}
const rng = (arr, a) => arr.length ? `${(Math.min(...arr.map(o=>o.lo[a]))).toFixed(1)}..${(Math.max(...arr.map(o=>o.hi[a]))).toFixed(1)}` : '-';

(async () => {
  const { W, api } = await getApi();
  console.log('=== KOZIJNEN (BIL-MOO, IfcWindow) — steekproef ===');
  const m1 = api.OpenModel(new Uint8Array(readFileSync(MOO)), {});
  const wins = collect(api, m1, W.IFCWINDOW, null, 12);
  api.CloseModel(m1);
  console.log(`  ${wins.length} kozijnen · wereld X ${rng(wins,0)} · Y ${rng(wins,1)} · Z ${rng(wins,2)}`);
  wins.slice(0,4).forEach(o=>console.log(`   win#${o.id} bxh ${(o.w).toFixed(0)}×${(o.hgt).toFixed(0)} @Y[${(o.lo[1]*1000).toFixed(0)}..${(o.hi[1]*1000).toFixed(0)}] Z[${(o.lo[2]*1000).toFixed(0)}..${(o.hi[2]*1000).toFixed(0)}]`));

  console.log('\n=== LEKDORPELS (BIL-MJN, proxy "lekdorpel") — steekproef ===');
  const m2 = api.OpenModel(new Uint8Array(readFileSync(MJN)), {});
  const leks = collect(api, m2, W.IFCBUILDINGELEMENTPROXY, /lekdorpel/i, 12);
  api.CloseModel(m2);
  console.log(`  ${leks.length} lekdorpels · wereld X ${rng(leks,0)} · Y ${rng(leks,1)} · Z ${rng(leks,2)}`);
  leks.slice(0,4).forEach(o=>console.log(`   lek#${o.id} '${o.nm.slice(0,28)}' bxh ${(o.w).toFixed(0)}×${(o.hgt).toFixed(0)} @Y[${(o.lo[1]*1000).toFixed(0)}..${(o.hi[1]*1000).toFixed(0)}] Z[${(o.lo[2]*1000).toFixed(0)}..${(o.hi[2]*1000).toFixed(0)}]`));

  // frame-overlap?
  const overlap = (a,b,ax) => Math.min(Math.max(...a.map(o=>o.hi[ax])), Math.max(...b.map(o=>o.hi[ax]))) - Math.max(Math.min(...a.map(o=>o.lo[ax])), Math.min(...b.map(o=>o.lo[ax])));
  console.log('\n=== FRAME-CHECK ===');
  if (wins.length && leks.length) {
    const ox=overlap(wins,leks,0), oy=overlap(wins,leks,1), oz=overlap(wins,leks,2);
    console.log(`  overlap X ${ox.toFixed(1)}m · Y ${oy.toFixed(1)}m · Z ${oz.toFixed(1)}m`);
    console.log(`  ${ox>-1 && oy>-1 && oz>-1 ? '🟢 frames overlappen → cross-file matching mogelijk' : '🔴 frames overlappen NIET → geen gedeelde georeferentie (matching kan niet direct)'}`);
  }
})();
