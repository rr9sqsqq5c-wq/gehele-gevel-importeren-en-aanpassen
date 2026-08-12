// READ-ONLY MEET — bepaal de BUITENRICHTING per gevelvlak uit de KLIKLIJST (harde waarheid):
// de dunste kozijn-sub-geometrie ligt aan het buitenste dikte-vlak → faceMax(true=+as,false=-as).
// Vergelijk met resolveOutsideDirections. Doel: welke outsideDir hoort écht bij 272.5-langsgevel vs
// kopse-gevel, en klopt de handedness-regel (facadeNeedsMirror) daarmee?
import { IfcAPI } from 'web-ifc';
import fs from 'fs';
const api = new IfcAPI(); await api.Init();
const wi = await import('web-ifc');
const bid = api.OpenModel(new Uint8Array(fs.readFileSync('public/BIL-MOO-A-ZZ-PBP.ifc')));
const mm = v => Math.round(v * 1000);
const AXN = ['x', 'y', 'z'];

function analyse(eID) {
  const mesh = api.GetFlatMesh(bid, eID); const subs = [];
  let all = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let gi = 0; gi < mesh.geometries.size(); gi++) {
    const pl = mesh.geometries.get(gi); let g; const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    try {
      g = api.GetGeometry(bid, pl.geometryExpressID); const v = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize()); const m = pl.flatTransformation;
      for (let vi = 0; vi < v.length; vi += 6) { const x = v[vi], y = v[vi + 1], z = v[vi + 2]; const w = [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; for (let k = 0; k < 3; k++) { if (w[k] < b[k]) b[k] = w[k]; if (w[k] > b[k + 3]) b[k + 3] = w[k]; } }
    } catch { } finally { g?.delete(); }
    if (b[0] === Infinity) continue; subs.push({ b }); for (let k = 0; k < 3; k++) { all[k] = Math.min(all[k], b[k]); all[k + 3] = Math.max(all[k + 3], b[k + 3]); }
  }
  if (!subs.length) return null;
  const ext = [all[3] - all[0], all[4] - all[1], all[5] - all[2]];
  // dikte-as = dunste extent
  const tAx = ext.indexOf(Math.min(...ext));
  const span = b => b[tAx + 3] - b[tAx];
  const thin = subs.reduce((a, b) => span(b.b) < span(a.b) ? b : a);
  const faceMax = (all[tAx + 3] - thin.b[tAx + 3]) <= (thin.b[tAx] - all[tAx]);
  return { tAx, faceMax, depth: mm(ext[tAx]), thinSpan: mm(span(thin.b)), tMin: mm(all[tAx]), tMax: mm(all[tAx + 3]), nSub: subs.length };
}

// wand → voids → window-fillers
const wallVoids = {};
{ const vv = api.GetLineIDsWithType(bid, wi.IFCRELVOIDSELEMENT); for (let i = 0; i < vv.size(); i++) { const r = api.GetLine(bid, vv.get(i), false); const w = r?.RelatingBuildingElement?.value, o = r?.RelatedOpeningElement?.value; if (w && o) (wallVoids[w] ??= []).push(o); } }
const fillOf = {}, fillType = {};
{ const fv = api.GetLineIDsWithType(bid, wi.IFCRELFILLSELEMENT); for (let i = 0; i < fv.size(); i++) { const r = api.GetLine(bid, fv.get(i), false); const o = r?.RelatingOpeningElement?.value, f = r?.RelatedBuildingElement?.value; if (o && f) { fillOf[o] = f; try { const raw = api.GetRawLineData(bid, f); fillType[o] = api.GetNameFromTypeCode(raw.type).toLowerCase(); } catch { } } } }

// doel-wanden via naam-match op ElementId
const TARGETS = { '26024971': '272.5 langsgevel (normaal=z)', '26025533': 'kopse gevel 257.5 (normaal=x)', '26103087': 'kopse gevel 257.5 (normaal=x)' };
const wallIDs = [];
for (const tn of ['IFCWALL', 'IFCWALLSTANDARDCASE']) { const v = api.GetLineIDsWithType(bid, wi[tn]); for (let i = 0; i < v.size(); i++) wallIDs.push(v.get(i)); }
for (const wID of wallIDs) {
  let name = null; try { name = api.GetLine(bid, wID, false)?.Name?.value ?? null; } catch { }
  const hit = Object.keys(TARGETS).find(t => name && name.includes(t));
  if (!hit) continue;
  const voids = wallVoids[wID] ?? [];
  const wins = voids.filter(o => (fillType[o] || '').includes('window')).map(o => fillOf[o]);
  console.log(`\n=== wand ${hit} — ${TARGETS[hit]} (exprID ${wID}); ${wins.length} raam-filler(s) ===`);
  for (const w of wins) {
    const a = analyse(w);
    if (!a) { console.log(`   window ${w}: geen geometrie`); continue; }
    const outSign = a.faceMax ? '+' : '-';
    console.log(`   window ${w}: dikte-as=${AXN[a.tAx]} [${a.tMin}..${a.tMax}] diepte=${a.depth}mm, dunste sub=${a.thinSpan}mm aan ${a.faceMax ? 'MAX' : 'MIN'}-kant → KLIKLIJST-BUITEN = ${outSign}${AXN[a.tAx]} (outsideDir langs normaal ${AXN[a.tAx]} = ${outSign}1)`);
  }
}
api.CloseModel(bid);
