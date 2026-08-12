// READ-ONLY DIAG (spike) — waarom is 2D Gevel ≠ Werktekening (Groep 3)?
// Reproduceert het verschil: 2D/3D/export FILTEREN ventilatie-openingen uit de panel-zones;
// Werktekening/Uittrekstaat NIET. Bij Ventilatiezone Aan → andere panelen → incongruent.
globalThis.localStorage = { getItem: (k) => (k === 'paneelOptimalisatie' ? '1' : null), setItem() {}, removeItem() {} };
import { buildFacadeZones, panelizeZone, computeEffectiveBasePanel, generateBattenPositions } from '../src/lib/panelization.js';

const mat = { steenL: 221, steenH: 51, lint: 5.6, stoot: 5.6, brickWeightM2: 34.6 };   // Groep 3-toolbar
const panelen = { enabled: true, breedte: 3005, hoogte: 1200, gewichtM2: 11.8, maxKg: 50, verspringen: false };
const gW = 4000, gH = 2870;
const raam = { id: 'w', x: 1500, y: 600, width: 1000, height: 1141, type: 'raam', polyPts: null };
const vent = { id: 'v', x: 1700, y: 1850, width: 300, height: 150, type: 'ventilatie', polyPts: null };
const basePanel = computeEffectiveBasePanel(panelen, mat.brickWeightM2, mat);
const battenYs = generateBattenPositions(gH, mat, 400, { targetPanelH: panelen.hoogte, minPanelH: 800 });

function seams(openings) {
  let panels = [];
  for (const z of buildFacadeZones(gW, gH, openings)) {
    const r = panelizeZone(z, battenYs, basePanel, null, mat, 'halfsteens');
    if (r.ok) panels.push(...r.panels);
  }
  panels = panels.filter((p) => p.height >= 200 && p.width >= 10);
  const rightEdges = [...new Set(panels.map((p) => Math.round(p.x + p.width)))].filter((x) => x < gW - 1).sort((a, b) => a - b);
  const widths = [...new Set(panels.map((p) => Math.round(p.width)))].sort((a, b) => a - b);
  return { n: panels.length, rightEdges, slivers: panels.filter((p) => p.width < 60).map((p) => `${Math.round(p.width)}@${Math.round(p.x)}`), widths };
}

// 2D/3D/export: ventilatie GEFILTERD
const A = seams([raam]);
// Werktekening/Uittrekstaat: ventilatie INBEGREPEN
const B = seams([raam, vent]);

console.log('\n── 2D/3D/export (ventilatie gefilterd) ──');
console.log(`  ${A.n} panelen; naad-x: ${A.rightEdges.join(', ')}`);
console.log(`  snippers <60mm: ${A.slivers.length ? A.slivers.join(', ') : 'geen'}`);
console.log('\n── Werktekening/Uittrekstaat (ventilatie inbegrepen) ──');
console.log(`  ${B.n} panelen; naad-x: ${B.rightEdges.join(', ')}`);
console.log(`  snippers <60mm: ${B.slivers.length ? B.slivers.join(', ') : 'geen'}`);

const onlyA = A.rightEdges.filter((x) => !B.rightEdges.some((y) => Math.abs(x - y) < 2));
const onlyB = B.rightEdges.filter((x) => !A.rightEdges.some((y) => Math.abs(x - y) < 2));
console.log('\n── VERSCHIL (ventilatie-filter) ──');
console.log(`  naden alleen in 2D:          ${onlyA.length ? onlyA.join(', ') : '—'}`);
console.log(`  naden alleen in werktekening: ${onlyB.length ? onlyB.join(', ') : '—'}`);
console.log(`  → naden ${onlyA.length || onlyB.length ? 'VERSCHILLEN ✗' : 'gelijk ✓'} (wel ander aantal panelen: ${A.n} vs ${B.n})`);

// ── TEST 2: steenstrip-artikel (effectiveMat) — View2D past artikel-steen toe, Werktekening niet ──
function seamsMat(matX) {
  const bp = computeEffectiveBasePanel(panelen, matX.brickWeightM2 ?? 34.6, matX);
  const by = generateBattenPositions(gH, matX, 400, { targetPanelH: panelen.hoogte, minPanelH: 800 });
  let panels = [];
  for (const z of buildFacadeZones(gW, gH, [raam])) { const r = panelizeZone(z, by, bp, null, matX, 'halfsteens'); if (r.ok) panels.push(...r.panels); }
  panels = panels.filter((p) => p.height >= 200 && p.width >= 10);
  return [...new Set(panels.map((p) => Math.round(p.x + p.width)))].filter((x) => x < gW - 1).sort((a, b) => a - b);
}
const seams221 = seamsMat({ ...mat, steenL: 221, steenH: 51 });   // Werktekening (rauwe groep-materiaal)
const seams210 = seamsMat({ ...mat, steenL: 210, steenH: 50 });   // View2D mét artikel 210×50
console.log('\n── VERSCHIL (steenstrip-artikel 210×50 vs groep-materiaal 221×51) ──');
console.log(`  Werktekening (mat 221):  naad-x ${seams221.join(', ')}`);
console.log(`  View2D (artikel 210):    naad-x ${seams210.join(', ')}`);
const diff = seams221.length !== seams210.length || seams221.some((x, i) => Math.abs(x - (seams210[i] ?? -999)) > 2);
console.log(`  → ${diff ? 'INCONGRUENT ✗ (andere steek → andere naden)' : 'gelijk ✓'}`);
console.log('');
