// WEGWERP (spike/) — MEET: verschilt de kozijn-maatvoering tussen VOORKANT en ACHTERKANT?
// Voor een IfcWindow (tag 26020604) meten we, per diepte-schijf (voor vs achter langs de dunste as),
// de breedte- en hoogte-extent. Zo zien we of mijn kozijnRect (bbox/vlak-projectie = de UNIE over de
// volle diepte) de voorkant weergeeft of een gemengde/grootste maat.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { readFileSync } from 'fs';

const MODEL = 'public/BIL-MOO-A-ZZ-PBP.ifc';
const TAG = '26020604';

async function getApi() {
  const WebIFC = require('web-ifc'); const api = new WebIFC.IfcAPI();
  try { await api.Init(); } catch { api.SetWasmPath('./node_modules/web-ifc/', true); await api.Init(); }
  return { IFC: WebIFC, api };
}

function worldVerts(api, m, id) {
  let mesh; try { mesh = api.GetFlatMesh(m, id); } catch { return []; }
  if (!mesh || mesh.geometries.size() === 0) return [];
  const out = [];
  for (let gi = 0; gi < mesh.geometries.size(); gi++) {
    const pl = mesh.geometries.get(gi); let g; try { g = api.GetGeometry(m, pl.geometryExpressID); } catch { continue; }
    const verts = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize()); const t = pl.flatTransformation;
    for (let i = 0; i < verts.length; i += 6) {
      const x = verts[i], y = verts[i+1], z = verts[i+2];
      out.push([t[0]*x+t[4]*y+t[8]*z+t[12], t[1]*x+t[5]*y+t[9]*z+t[13], t[2]*x+t[6]*y+t[10]*z+t[14]]);
    }
    g?.delete?.();
  }
  return out;
}
const range = (vs, a) => { let lo=1/0, hi=-1/0; for (const v of vs) { if (v[a]<lo) lo=v[a]; if (v[a]>hi) hi=v[a]; } return [lo, hi, hi-lo]; };

(async () => {
  const { IFC, api } = await getApi();
  const m = api.OpenModel(new Uint8Array(readFileSync(MODEL)), {});
  const vec = api.GetLineIDsWithType(m, IFC.IFCWINDOW);
  let targetId = null;
  for (let i = 0; i < vec.size(); i++) { const id = vec.get(i); try { if (String(api.GetLine(m, id, false)?.Tag?.value) === TAG) { targetId = id; break; } } catch {} }
  if (targetId == null) { console.log('🔴 window tag', TAG, 'niet gevonden'); return; }

  const vs = worldVerts(api, m, targetId);
  console.log(`window #${targetId} tag ${TAG} — ${vs.length} vertices`);
  const rx = range(vs, 0), ry = range(vs, 1), rz = range(vs, 2);
  console.log(`  extent  X=${rx[2].toFixed(1)}  Y=${ry[2].toFixed(1)}  Z=${rz[2].toFixed(1)} (m×1000 later)`);
  // diepte-as = kleinste extent; de andere twee = breedte/hoogte
  const rr = [rx, ry, rz]; const depthA = [0,1,2].reduce((b,a)=> rr[a][2] < rr[b][2] ? a : b, 0);
  const others = [0,1,2].filter(a => a !== depthA);
  const [dlo, dhi, dext] = rr[depthA];
  const band = dext * 0.15;
  const front = vs.filter(v => v[depthA] <= dlo + band);
  const back  = vs.filter(v => v[depthA] >= dhi - band);
  const axisName = ['X','Y','Z'];
  console.log(`  diepte-as = ${axisName[depthA]} (extent ${(dext*1000).toFixed(1)} mm); breedte/hoogte-as = ${others.map(a=>axisName[a]).join('/')}`);
  const fmt = (vs2) => others.map(a => (range(vs2, a)[2]*1000).toFixed(1)).join(' × ');
  console.log(`  VOORKANT (diepte ${(dlo*1000).toFixed(0)}..${((dlo+band)*1000).toFixed(0)}): ${fmt(front)} mm  (${front.length} pts)`);
  console.log(`  ACHTERKANT(diepte ${((dhi-band)*1000).toFixed(0)}..${(dhi*1000).toFixed(0)}): ${fmt(back)} mm  (${back.length} pts)`);
  const fr = others.map(a => range(front, a)[2]*1000), bk = others.map(a => range(back, a)[2]*1000);
  const d0 = Math.abs(fr[0]-bk[0]), d1 = Math.abs(fr[1]-bk[1]);
  console.log(`  Δ voor↔achter: ${d0.toFixed(1)} × ${d1.toFixed(1)} mm`);
  console.log(`  ${(d0 > 5 || d1 > 5) ? '🟠 verschil > 5 mm — voor/achter NIET gelijk' : '🟢 voor≈achter (≤5 mm)'}`);
  console.log(`  volle bbox (mijn kozijnRect-bron): ${fmt(vs)} mm`);
  api.CloseModel(m);
})();
