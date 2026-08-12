// VALIDATE (spike) — paneelOptimalisatie default AAN: (1) naden op de doorlopende steen (om-en-om),
// (2) smalle tall kolom = 1 paneel i.p.v. latten-split, (3) mergeStackedColumns voegt stapel samen,
// (4) snipper-zone < 50 mm vervalt.
let FLAG = '1';   // '1' = nieuw (default aan), '0' = oud (noodrem)
// halfsteensPanel5Strek UIT (zoals in het klant-geval: panelen zijn niet 5-strek-breed → chooseBreaks-pad)
globalThis.localStorage = { getItem: (k) => (k === 'paneelOptimalisatie' ? FLAG : (k === 'halfsteensPanel5Strek' ? '0' : null)), setItem() {}, removeItem() {} };
import { buildFacadeZones, panelizeZone, computeEffectiveBasePanel, generateBattenPositions, detectKoppelstrippen, mergeStackedColumns } from '../src/lib/panelization.js';
import { buildFacePattern } from '../src/lib/pattern.js';

// zoals de views: na panelizeZone óók mergeStackedColumns (die intern de vlag checkt)
function panelsWired(gW, gH, ops, flag) {
  FLAG = flag;
  const battenYs = generateBattenPositions(gH, mat, 400, { targetPanelH: panelen.hoogte, minPanelH: 800 });
  let out = [];
  const opsArr = ops;
  for (const z of buildFacadeZones(gW, gH, opsArr)) { const r = panelizeZone(z, battenYs, basePanel, null, mat, 'halfsteens'); if (r.ok) out.push(...r.panels); }
  out = mergeStackedColumns(out, opsArr, basePanel);
  return out.filter((p) => p.height >= 200 && p.width >= 10);
}

const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10, stripKg: 0.472, brickWeightM2: 34.6 };
const panelen = { enabled: true, breedte: 3005, hoogte: 1200, gewichtM2: 11.8, maxKg: 50, verspringen: true };
const pitch = mat.steenL + mat.stoot;   // 220
const basePanel = computeEffectiveBasePanel(panelen, mat.brickWeightM2, mat);

function panels(gW, gH, ops, flag) {
  FLAG = flag;
  const battenYs = generateBattenPositions(gH, mat, 400, { targetPanelH: panelen.hoogte, minPanelH: 800 });
  const zones = buildFacadeZones(gW, gH, ops);
  let out = [];
  for (const z of zones) { const r = panelizeZone(z, battenYs, basePanel, null, mat, 'halfsteens'); if (r.ok) out.push(...r.panels); }
  return out.filter((p) => p.height >= 200 && p.width >= 10);
}

console.log('\n=== TEST 1: naden op de doorlopende steen (proxy voor om-en-om) ===');
{
  // raam 1300..2650 laat de gevel rechts op x=2650 verder gaan → 2650 % 220 = 10 → zone-lokaal raster staat scheef
  const gW = 6000, gH = 2800, ops = [{ id: 'w', x: 1300, y: 300, width: 1350, height: 2500, polyPts: null }];
  for (const flag of ['0', '1']) {
    const ps = panels(gW, gH, ops, flag);
    const seams = [...new Set(ps.map((p) => Math.round(p.x)))].filter((x) => x > 1 && x < gW - 1);
    const offGrid = seams.filter((x) => Math.min(x % pitch, pitch - (x % pitch)) > 3);
    console.log(`  vlag ${flag === '1' ? 'NIEUW' : 'oud '}: ${ps.length} panelen, ${seams.length} naden, off-grid=${offGrid.length} ${offGrid.length ? '✗ elke-rij: ' + offGrid.map((x) => `${x}(rest ${x % pitch})`).join(',') : '✓ alle op de steen → om-en-om'}`);
  }
}

console.log('\n=== TEST 2: smalle hoge kolom zonder raam — 1 paneel i.p.v. latten-split (P6/P7) ===');
{
  // 560mm-brede volle-hoogte muurstrook (1800mm) tussen twee ramen; gewicht (47kg) staat één paneel toe,
  // maar de OUDE maxH-split (1200) hakt 'm in twee (P6/P7).
  const gW = 3120, gH = 1800, ops = [
    { id: 'l', x: 0, y: 0, width: 1280, height: 1800 },
    { id: 'r', x: 1840, y: 0, width: 1280, height: 1800 },
  ];
  for (const flag of ['0', '1']) {
    const ps = panels(gW, gH, ops, flag).filter((p) => p.x > 1280 - 1 && p.x + p.width < 1840 + 1);
    const kg = (h, w) => (h * w * (mat.brickWeightM2 + panelen.gewichtM2) / 1e6).toFixed(0);
    console.log(`  vlag ${flag === '1' ? 'NIEUW' : 'oud '}: middenstrook = ${ps.length} paneel(en)  ${ps.map((p) => `${Math.round(p.width)}×${Math.round(p.height)}=${kg(p.height, p.width)}kg`).join(', ')}`);
  }
}

console.log('\n=== TEST 3: mergeStackedColumns voegt een rakende stapel samen ===');
{
  const stack = [
    { id: 'a', x: 100, y: 0, width: 560, height: 300, area: 168000 },
    { id: 'b', x: 100, y: 300, width: 560, height: 400, area: 224000 },
    { id: 'c', x: 100, y: 700, width: 560, height: 500, area: 280000 },
  ];
  const merged = mergeStackedColumns(stack, [], basePanel);
  const kg = (h, w) => (h * w * (mat.brickWeightM2 + panelen.gewichtM2) / 1e6).toFixed(0);
  console.log(`  3 rakende panelen (300+400+500, 560 breed) → ${merged.length} paneel(en): ${merged.map((p) => `${Math.round(p.width)}×${Math.round(p.height)}=${kg(p.height, p.width)}kg`).join(', ')}  ${merged.length === 1 ? '✓' : '(gewichtsplafond?)'}`);
  // met een raam ertussen mag NIET mergen
  const merged2 = mergeStackedColumns(stack, [{ x: 0, y: 300, width: 2000, height: 400 }], basePanel);
  console.log(`  zelfde stapel MET raam op y=300..700 → ${merged2.length} paneel(en) ${merged2.length > 1 ? '✓ niet over raam gemergd' : '✗'}`);
}

console.log('\n=== TEST 4: snipper-zone < 50 mm vervalt (het 20 mm-paneel) ===');
{
  const gW = 3000, gH = 2000, ops = [
    { id: 'l', x: 200, y: 300, width: 1180, height: 1400 },   // rand op 1380
    { id: 'r', x: 1400, y: 300, width: 1140, height: 1400 },  // rand op 1400 → 20mm ertussen
  ];
  for (const flag of ['0', '1']) {
    const ps = panels(gW, gH, ops, flag);
    const sliver = ps.filter((p) => p.width < 50);
    console.log(`  vlag ${flag === '1' ? 'NIEUW' : 'oud '}: ${sliver.length} snipper-paneel(en) < 50mm ${sliver.length ? '✗ ' + sliver.map((p) => `${Math.round(p.width)}mm@${Math.round(p.x)}`).join(',') : '✓ geen'}`);
  }
}

console.log('\n=== TEST 5: einde-tot-einde — panelen + koppelstrippen oud vs nieuw (view-flow met merge) ===');
{
  const gW = 9340, gH = 2800, ops = [
    { id: 'a', x: 200, y: 300, width: 1180, height: 1600, polyPts: null },
    { id: 'b', x: 1400, y: 300, width: 1140, height: 1600, polyPts: null },
    { id: 'c', x: 3600, y: 600, width: 1820, height: 2000, polyPts: null },
    { id: 'd', x: 6600, y: 700, width: 1140, height: 1500, polyPts: null },
  ];
  const rows = buildFacePattern(gW, gH, mat, 'halfsteens');
  for (const flag of ['0', '1']) {
    const ps = panelsWired(gW, gH, ops, flag);
    const kop = detectKoppelstrippen(ps, rows, mat, 'halfsteens');
    const thin = ps.filter((p) => p.height < 400).length;
    console.log(`  vlag ${flag === '1' ? 'NIEUW' : 'oud '}: ${ps.length} panelen, ${kop.length} koppelstrippen, ${thin} panelen < 400mm hoog`);
  }
}
console.log('');
