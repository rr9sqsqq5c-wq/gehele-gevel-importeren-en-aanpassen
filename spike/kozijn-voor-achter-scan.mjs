// WEGWERP (spike/) — steekproef: hebben IfcWindow/IfcDoor-kozijnen een voor/achter-maatverschil?
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { readFileSync } from 'fs';
const MODEL = 'public/BIL-MOO-A-ZZ-PBP.ifc';

async function getApi() { const W = require('web-ifc'); const api = new W.IfcAPI(); try { await api.Init(); } catch { api.SetWasmPath('./node_modules/web-ifc/', true); await api.Init(); } return { W, api }; }
function worldVerts(api, m, id) {
  let mesh; try { mesh = api.GetFlatMesh(m, id); } catch { return []; }
  if (!mesh || mesh.geometries.size() === 0) return [];
  const out = [];
  for (let gi = 0; gi < mesh.geometries.size(); gi++) {
    const pl = mesh.geometries.get(gi); let g; try { g = api.GetGeometry(m, pl.geometryExpressID); } catch { continue; }
    const v = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize()); const t = pl.flatTransformation;
    for (let i = 0; i < v.length; i += 6) { const x=v[i],y=v[i+1],z=v[i+2]; out.push([t[0]*x+t[4]*y+t[8]*z+t[12], t[1]*x+t[5]*y+t[9]*z+t[13], t[2]*x+t[6]*y+t[10]*z+t[14]]); }
    g?.delete?.();
  }
  return out;
}
const range = (vs, a) => { let lo=1/0,hi=-1/0; for (const v of vs){ if(v[a]<lo)lo=v[a]; if(v[a]>hi)hi=v[a]; } return hi-lo; };

function measure(api, m, id) {
  const vs = worldVerts(api, m, id); if (vs.length < 6) return null;
  const ext = [0,1,2].map(a => range(vs, a));
  const depthA = ext.indexOf(Math.min(...ext));
  const others = [0,1,2].filter(a => a !== depthA);
  let dlo=1/0,dhi=-1/0; for (const v of vs){ if(v[depthA]<dlo)dlo=v[depthA]; if(v[depthA]>dhi)dhi=v[depthA]; }
  const dext = dhi-dlo, band = dext*0.15;
  const front = vs.filter(v => v[depthA] <= dlo+band), back = vs.filter(v => v[depthA] >= dhi-band);
  const fr = others.map(a => range(front,a)*1000), bk = others.map(a => range(back,a)*1000);
  return { depthMm: dext*1000, dW: Math.abs(fr[0]-bk[0]), dH: Math.abs(fr[1]-bk[1]), frontW: fr[0], backW: bk[0], frontH: fr[1], backH: bk[1] };
}

(async () => {
  const { W, api } = await getApi();
  const m = api.OpenModel(new Uint8Array(readFileSync(MODEL)), {});
  for (const [label, type] of [['WINDOW', W.IFCWINDOW], ['DOOR', W.IFCDOOR]]) {
    const vec = api.GetLineIDsWithType(m, type); const n = vec.size();
    const step = Math.max(1, Math.floor(n / 25));
    let diff = 0, tot = 0, maxD = 0; const samples = [];
    for (let i = 0; i < n; i += step) {
      const r = measure(api, m, vec.get(i)); if (!r) continue; tot++;
      const d = Math.max(r.dW, r.dH); if (d > maxD) maxD = d;
      if (d > 5) diff++;
      if (samples.length < 6) samples.push(`Ø${r.depthMm.toFixed(0)}mm voor ${r.frontW.toFixed(0)}×${r.frontH.toFixed(0)} / achter ${r.backW.toFixed(0)}×${r.backH.toFixed(0)} (Δ${d.toFixed(1)})`);
    }
    console.log(`\n=== ${label} — ${tot} gemeten (van ${n}) ===`);
    samples.forEach(s => console.log('  ' + s));
    console.log(`  ${diff} met voor/achter-verschil >5mm · max Δ = ${maxD.toFixed(1)} mm`);
    console.log(`  ${diff === 0 ? '🟢 voorkant = achterkant (geen taps kozijn)' : '🟠 sommige kozijnen verschillen voor↔achter'}`);
  }
  api.CloseModel(m);
})();
