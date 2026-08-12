// VALIDATE (spike) — buildGroupPanels maakt alle views congruent.
// Toont: OUD 2D (artikel + vent gefilterd) ≠ OUD werktekening (rauwe mat + vent inbegrepen);
// NIEUW buildGroupPanels(baseMat, stripArt) == OUD 2D voor BEIDE (dus congruent).
globalThis.localStorage = { getItem: (k) => (k === 'paneelOptimalisatie' ? '1' : null), setItem() {}, removeItem() {} };
import { buildFacadeZones, panelizeZone, computeEffectiveBasePanel, generateBattenPositions, mergeStackedColumns, buildGroupPanels, cutVentHolesFromPanels } from '../src/lib/panelization.js';

const baseMat = { steenL: 221, steenH: 51, lint: 5.6, stoot: 5.6, brickWeightM2: 34.6 };  // groep-materiaal
const stripArt = { steenL: 210, steenH: 50 };                                              // gekozen artikel
const panelen = { enabled: true, breedte: 3005, hoogte: 1200, gewichtM2: 11.8, maxKg: 50, verspringen: false };
const latten = { maxInterval: 400 };
const gW = 4000, gH = 2870;
const raam = { id: 'w', x: 1500, y: 600, width: 1000, height: 1141, type: 'raam', polyPts: null };
const vent = { id: 'v', x: 1700, y: 1850, width: 300, height: 150, type: 'ventilatie', polyPts: null };
const groupOpenings = [raam, vent];
const verband = 'halfsteens';
const edges = (ps) => [...new Set(ps.filter((p) => p.height >= 200 && p.width >= 10).map((p) => Math.round(p.x + p.width)))].filter((x) => x < gW - 1).sort((a, b) => a - b);

// OUD 2D-pad: effectiveMat (artikel) + ventilatie GEFILTERD
function old2D() {
  const mat = { ...baseMat, steenL: stripArt.steenL, steenH: stripArt.steenH };
  const bp = computeEffectiveBasePanel(panelen, mat.brickWeightM2, mat);
  const by = generateBattenPositions(gH, mat, 400, { targetPanelH: 1200, minPanelH: 800 });
  const ops = groupOpenings.filter((o) => o.type !== 'ventilatie');
  let ps = []; for (const z of buildFacadeZones(gW, gH, ops)) { const r = panelizeZone(z, by, bp, null, mat, verband); if (r.ok) ps.push(...r.panels); }
  ps = mergeStackedColumns(ps, ops, bp).filter((p) => p.height >= 200 && p.width >= 10);
  ps = cutVentHolesFromPanels(ps, groupOpenings.filter((o) => o.type === 'ventilatie'));  // net als View2D:152
  return edges(ps);
}
// OUD werktekening-pad: RAUWE mat (geen artikel) + ventilatie INBEGREPEN
function oldWerk() {
  const mat = baseMat;
  const bp = computeEffectiveBasePanel(panelen, mat.brickWeightM2, mat);
  const by = generateBattenPositions(gH, mat, 400, { targetPanelH: 1200, minPanelH: 800 });
  let ps = []; for (const z of buildFacadeZones(gW, gH, groupOpenings)) { const r = panelizeZone(z, by, bp, null, mat, verband); if (r.ok) ps.push(...r.panels); }
  return edges(mergeStackedColumns(ps, groupOpenings, bp));
}
// NIEUW: buildGroupPanels — zelfde aanroep vanuit ELKE view (baseMat + stripArt)
function unified() { return edges(buildGroupPanels({ groupWidth: gW, groupHeight: gH, groupOpenings, baseMat, stripArt, panelen, latten, verband }).panels); }

const a = old2D(), b = oldWerk(), u = unified();
const eq = (x, y) => x.length === y.length && x.every((v, i) => Math.abs(v - y[i]) < 2);
console.log('\nOUD 2D (artikel, vent gefilterd):   ', a.join(', '));
console.log('OUD werktekening (rauw, vent in):   ', b.join(', '));
console.log('NIEUW buildGroupPanels:             ', u.join(', '));
console.log('');
console.log(`OUD: 2D vs werktekening → ${eq(a, b) ? 'gelijk' : 'VERSCHILLEND ✗ (dit is de bug)'}`);
console.log(`NIEUW == OUD 2D (correcte ref)?  → ${eq(u, a) ? '✓ ja' : '✗ nee'}`);
console.log(`→ met unifiedPanels roept ELKE view dit aan → ${eq(u, a) ? 'ALLE VIEWS CONGRUENT ✓' : 'nog niet ✗'}`);
console.log('');
