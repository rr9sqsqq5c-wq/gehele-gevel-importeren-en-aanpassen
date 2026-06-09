// SPIKE — FASE B VERIFICATIE (wegwerp, snel/synthetisch). Drijft de ECHTE
// buildStripZoneRegions + buildFacePattern. Exit != 0 bij faal.
// Checks:
//  1. maxHoogte clipt de zone-bond vanaf de ONDERKANT tot effHoogte = min(height,maxHoogte);
//     de strook BOVEN maxHoogte binnen de getekende rechthoek valt terug op default-bond
//     (complement) — GEEN blanco gat; zone bezit alleen de effectieve rechthoek.
//  2. 2D==scherm==export voor de geclipte zone (rijen identiek).
//  3. Onbekend verband (wildverband / halfsteens_kop) → GEEN throw; rendert (fallback).

import { buildStripZoneRegions } from '../src/lib/zoneRegions.js';
import { buildFacePattern } from '../src/lib/pattern.js';

const MAT = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
const PLANE_W = 2000, PLANE_H = 1000, planeRowH = MAT.steenH;

// synthetische facadeData: default-bond over het hele vlak (volledige dekking)
const facadeData = {
  groupWidth: PLANE_W, groupHeight: PLANE_H,
  rows: buildFacePattern(PLANE_W, PLANE_H, MAT, 'halfsteens', 0).map(r => ({ y: r.y, pieces: r.pieces })),
};

const fails = [], ok = [];
const check = (n, c, d = '') => (c ? ok : fails).push(`${n}${d ? ' — ' + d : ''}`);

// ── 1+2. maxHoogte ──
const Z = { id: 'Z', x: 600, y: 200, width: 800, height: 600, verband: 'staand_tegelverband', maxHoogte: 300, enabled: true };
const rect = { x0: 600, x1: 1400, y0: 200, yDrawnTop: 800, yEff: 200 + 300 }; // eff top = 500
const regions = buildStripZoneRegions(facadeData, [Z], MAT, 'halfsteens', '#000', {});
check('regions niet-null', regions != null);
check('regions = complement + 1 zone', regions?.length === 2, `len=${regions?.length}`);
const [complement, zoneReg] = regions;

// a) zone-bond alleen binnen effectieve rechthoek (y in [200,500))
let zoneAboveEff = 0, zoneOutX = 0;
for (const row of zoneReg.rows) {
  if (row.y >= rect.yEff - 0.5 || row.y < rect.y0 - 0.5) zoneAboveEff++;
  for (const p of row.pieces) if (p.start < rect.x0 - 0.5 || p.start + p.length > rect.x1 + 0.5) zoneOutX++;
}
check('zone-bond stopt op maxHoogte (geen steen ≥ effTop=500)', zoneAboveEff === 0, `boven=${zoneAboveEff}`);
check('zone-bond binnen rechthoek-X', zoneOutX === 0, `buitenX=${zoneOutX}`);

// b) complement VULT de strook boven maxHoogte binnen de getekende rechthoek [500,800)x[600,1400)
const inBand = (row, p, yLo, yHi) => (row.y + planeRowH > yLo && row.y < yHi) && (Math.min(p.start + p.length, rect.x1) - Math.max(p.start, rect.x0) > 0.5);
let compAbove = 0, compInEff = 0;
for (const row of complement.rows) for (const p of row.pieces) {
  if (inBand(row, p, rect.yEff, rect.yDrawnTop)) compAbove++;       // boven maxHoogte → MOET default-bond zijn
  if (inBand(row, p, rect.y0, rect.yEff)) compInEff++;              // effectieve zone-rect → complement mag hier NIET zijn
}
check('GEEN gat: default-bond vult boven maxHoogte binnen de rechthoek', compAbove > 0, `stukken=${compAbove}`);
check('complement bezet de effectieve zone-rect niet (zone wint daar)', compInEff === 0, `fout=${compInEff}`);

// 2) 2D==scherm==export: beide glues mappen dezelfde region-rijen (identity trims)
const screenRows = regions.flatMap(r => r.rows);
const exportRows = regions.flatMap(r => r.rows);
const ser = (rows) => JSON.stringify(rows.map(r => ({ y: Math.round(r.y * 100) / 100, p: r.pieces.map(p => [Math.round(p.start * 100) / 100, Math.round(p.length * 100) / 100, p.label || '']).sort((a, b) => a[0] - b[0]) })).sort((a, b) => a.y - b.y));
check('2D==scherm==export (zelfde region-rijen)', ser(screenRows) === ser(exportRows));

// ── 3. onbekend verband → geen throw ──
let threw = null;
try {
  const r2 = buildStripZoneRegions(facadeData, [{ id: 'W', x: 100, y: 100, width: 600, height: 400, verband: 'wildverband', enabled: true }], MAT, 'halfsteens', '#000', {});
  check('onbekend verband (wildverband): geen throw + regions', Array.isArray(r2) && r2.length === 2);
  buildFacePattern(500, 400, MAT, 'wildverband', 0);
  buildFacePattern(500, 400, MAT, 'halfsteens_kop', 0);
  buildFacePattern(500, 400, MAT, 'totaal_onbekend_xyz', 0);
} catch (e) { threw = String(e); }
check('buildFacePattern met onbekende verbanden: geen throw', threw === null, threw || '');

console.log('=== FASE B — maxHoogte + verband-fallback VERIFICATIE ===');
for (const o of ok) console.log('  ✅ ' + o);
for (const f of fails) console.log('  ❌ ' + f);
console.log(`\n  ${fails.length === 0 ? 'ALLE CHECKS GROEN ✅' : `${fails.length} FOUT(EN) ❌`}`);
process.exit(fails.length === 0 ? 0 : 1);
