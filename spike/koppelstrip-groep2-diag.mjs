// READ-ONLY DIAG (spike) — Groep 2: koppelstrippen niet om-en-om + P6/P7 gesplitst + 20mm-paneel?
// Reproduceert het werktekening-pad (buildFacadeZones -> panelizeZone) voor vlag UIT en AAN.
let FLAG_ON = false;
globalThis.localStorage = { getItem: (k) => (k === 'paneelOptimalisatie' && FLAG_ON) ? '1' : null, setItem() {}, removeItem() {} };

import { buildFacadeZones, panelizeZone, computeEffectiveBasePanel, generateBattenPositions, detectKoppelstrippen } from '../src/lib/panelization.js';
import { buildFacePattern } from '../src/lib/pattern.js';

const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10, stripKg: 0.472, brickWeightM2: 34.6 };
const panelen = { enabled: true, breedte: 3005, hoogte: 1200, gewichtM2: 11.8, maxKg: 50, verspringen: true };
const latten = { enabled: true, maxInterval: 400 };
const pitch = mat.steenL + mat.stoot;          // 220 — hele-steen-stap (doorlopend verband vanaf groep-0)
const lagenmaat = mat.steenH + mat.lint;       // 62

// Representatieve Groep 2: brede gevel, halfsteens, met ramen die de gevel in zones knippen.
// Kritisch: een zone die NIET op een hele-steen begint (na een raam) => zone-lokaal raster staat scheef.
const groupWidth = 9340, groupHeight = 2800;
const openings = [
  // linker raam-paar (laat de bekleding pas op x=2550 beginnen -> 2550 % 220 = 130 => off-grid)
  { x: 200,  y: 300, width: 1180, height: 1600 },
  { x: 1400, y: 300, width: 1140, height: 1600 },
  // midden groot raam
  { x: 3600, y: 600, width: 1820, height: 2000 },
  // rechter raam (laat rechts een korte/hoge zone over)
  { x: 6600, y: 700, width: 1140, height: 1500 },
];

function facadeRows() {
  // doorlopend verband vanaf groep-0 (zoals facadeData.rows in de werktekening)
  return buildFacePattern(groupWidth, groupHeight, mat, 'halfsteens');
}

function run(flag) {
  FLAG_ON = flag;
  const basePanel = computeEffectiveBasePanel(panelen, mat.brickWeightM2, mat);
  const battenYs = generateBattenPositions(groupHeight, mat, latten.maxInterval, { targetPanelH: panelen.hoogte, minPanelH: 800 });
  const openingsForZones = openings.map((op, i) => ({ id: `op${i}`, x: op.x, y: op.y, width: op.width, height: op.height, polyPts: null }));
  const zones = buildFacadeZones(groupWidth, groupHeight, openingsForZones);
  let panels = [];
  for (const zone of zones) {
    const res = panelizeZone(zone, battenYs, basePanel, null, mat, 'halfsteens');
    if (res.ok) panels.push(...res.panels);
  }
  panels = panels.filter((p) => p.height >= 200 && p.width >= 10);
  const rows = facadeRows();
  const kop = detectKoppelstrippen(panels, rows, mat, 'halfsteens');

  // --- koppelstrip-fase per verticale naad ---
  const courses = [...new Set(rows.map((r) => Math.round(r.y)))].sort((a, b) => a - b);
  const seams = [...new Set(panels.map((p) => Math.round(p.x)))].filter((x) => x > 1 && x < groupWidth - 1).sort((a, b) => a - b);
  console.log(`\n${'='.repeat(70)}\n■ VLAG ${flag ? 'AAN (paneelOptimalisatie)' : 'UIT (default)'}: ${zones.length} zones, ${panels.length} panelen, ${kop.length} koppelstrippen`);

  // per seam: hoeveel courses hebben een koppelstrip die die x kruist? 100%=elke laag (fout), ~50%=om-en-om
  let elkeRij = 0, omEnOm = 0;
  for (const sx of seams) {
    const near = kop.filter((k) => k.x < sx - 0.5 && (k.x + k.width) > sx + 0.5);
    if (!near.length) continue;
    const rowsHit = new Set(near.map((k) => Math.round(k.y))).size;
    // courses die dit paneel-grensvlak overlappen (hoogte-bereik van de aangrenzende panelen)
    const adjPanels = panels.filter((p) => Math.abs(p.x - sx) < 1 || Math.abs(p.x + p.width - sx) < 1);
    const yLo = Math.min(...adjPanels.map((p) => p.y)), yHi = Math.max(...adjPanels.map((p) => p.y + p.height));
    const coursesHere = courses.filter((c) => c >= yLo - 0.5 && c + mat.steenH <= yHi + 0.5).length || courses.length;
    const pct = Math.round((rowsHit / coursesHere) * 100);
    const verdict = pct > 70 ? 'ELKE RIJ ✗' : 'om-en-om ✓';
    if (pct > 70) elkeRij++; else omEnOm++;
    console.log(`   naad x=${sx} (x%220=${sx % pitch}): koppelstrip in ${rowsHit}/${coursesHere} courses (${pct}%) ${verdict}`);
  }
  console.log(`   → seams om-en-om: ${omEnOm}, seams ELKE-RIJ: ${elkeRij}`);

  // --- P6/P7 : gestapelde korte panelen in dezelfde kolom (zelfde x+width, verschillende y) ---
  const byCol = new Map();
  for (const p of panels) {
    const key = `${Math.round(p.x)}_${Math.round(p.width)}`;
    if (!byCol.has(key)) byCol.set(key, []);
    byCol.get(key).push(p);
  }
  let stacks = 0;
  for (const [key, ps] of byCol) {
    if (ps.length >= 2) { stacks++; const hs = ps.map((p) => Math.round(p.height)).sort((a,b)=>a-b); console.log(`   gestapelde kolom x=${key.split('_')[0]} b=${key.split('_')[1]}: ${ps.length} panelen, hoogtes ${hs.join('+')}`); }
  }
  console.log(`   → kolommen met ≥2 gestapelde panelen: ${stacks}`);

  // --- smalle panelen (<200 breed) ~ het "20mm"-paneel ---
  const smal = panels.filter((p) => p.width < 200);
  if (smal.length) console.log(`   → SMALLE panelen (<200mm): ${smal.map((p) => `${Math.round(p.width)}mm@x${Math.round(p.x)}`).join(', ')}`);

  return { zones, panels, kop };
}

run(false);
run(true);
