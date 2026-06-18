// SPIKE — FASE 2 VERIFICATIE (wegwerp, herhaalbaar, snel/synthetisch).
// Drijft de ECHTE buildStripZoneRegions (src/lib/zoneRegions.js) op een gecontroleerd
// synthetisch vlak met een "opening"-gat en twee overlappende zones. Bewijst de
// FASE 2-invarianten zonder IFC-parse. Exit != 0 bij faal.
//
// Checks:
//  1. 0 actieve zones -> null (caller gebruikt facadeData.rows = nulmeting).
//  2. Containment: geen zone-steen buiten rechthoek ∩ vlak − openingen.
//  3. z-order: lagere zone heeft GEEN steen waar een hogere (later getekende) zone overlapt.
//  4. complement: GEEN steen binnen een zone-rechthoek.
//  5. union(alle regions) ⊆ vlak − openingen (geen steen buiten het vlak/gat).

import { buildStripZoneRegions, hasPenants, getActiveStripZones } from '../src/lib/zoneRegions.js';
import { buildFacePattern } from '../src/lib/pattern.js';

const MAT = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
const PLANE_W = 2000, PLANE_H = 1000;
const WIN = { x0: 800, x1: 1200, y0: 300, y1: 600 }; // "opening" in het vlak
const planeRowH = MAT.steenH;

// synthetische facadeData: default-bond over het hele vlak, met het WIN-gat eruit
// gesneden (zoals facadeData.rows na contour/openings-maskering).
const baseRows = buildFacePattern(PLANE_W, PLANE_H, MAT, 'halfsteens', 0);
const facadeData = {
  groupWidth: PLANE_W, groupHeight: PLANE_H,
  rows: baseRows.map((row) => {
    const inWin = row.y + planeRowH > WIN.y0 && row.y < WIN.y1;
    const pieces = row.pieces.flatMap((p) => {
      if (!inWin) return [p];
      const s = p.start, e = p.start + p.length;
      if (e <= WIN.x0 || s >= WIN.x1) return [p];
      const out = [];
      if (s < WIN.x0) out.push({ ...p, length: WIN.x0 - s });
      if (e > WIN.x1) out.push({ ...p, start: WIN.x1, length: e - WIN.x1 });
      return out;
    });
    return { y: row.y, pieces };
  }),
};

// coverage (vlak − openingen) over [yLo,yHi]
function coverage(yLo, yHi) {
  const ivs = [];
  for (const row of facadeData.rows) {
    if (row.y + planeRowH <= yLo + 1e-6 || row.y >= yHi - 1e-6) continue;
    for (const p of row.pieces) ivs.push([p.start, p.start + p.length]);
  }
  ivs.sort((a, b) => a[0] - b[0]);
  const m = [];
  for (const iv of ivs) { const l = m[m.length - 1]; if (l && iv[0] <= l[1] + 1e-6) l[1] = Math.max(l[1], iv[1]); else m.push(iv.slice()); }
  return m;
}
const inCoverage = (s, e, yLo, yHi) => { const cov = coverage(yLo, yHi); return cov.some(([a, b]) => s >= a - 0.5 && e <= b + 0.5); };

const fails = [], ok = [];
const check = (name, cond, detail = '') => (cond ? ok : fails).push(`${name}${detail ? ' — ' + detail : ''}`);

// ── 1. 0 actieve zones → null ──
check('predicaat hasPenants(geen) === false', hasPenants({}) === false);
check('predicaat hasPenants(penant) === true', hasPenants({ penanten: [{ x: 0 }] }) === true);
check('predicaat hasPenants(enabled zoneSetting) === true', hasPenants({ zoneSettings: [{ enabled: true }] }) === true);
check('0 actieve stripZones → buildStripZoneRegions === null',
  buildStripZoneRegions(facadeData, [{ id: 'z', x: 0, y: 0, width: 100, height: 100 /* geen enabled */ }], MAT, 'halfsteens', '#000', {}) === null);
check('getActiveStripZones filtert op enabled', getActiveStripZones({ stripZones: [{ enabled: true }, { enabled: false }, {}] }).length === 1);

// ── zones: A (staand), B overlapt A en is LATER getekend (hogere z-order) ──
const zoneA = { id: 'A', x: 600, y: 200, width: 800, height: 600, verband: 'staand_tegelverband', enabled: true };
const zoneB = { id: 'B', x: 1000, y: 200, width: 600, height: 400, verband: 'halfsteens', enabled: true };
const regions = buildStripZoneRegions(facadeData, [zoneA, zoneB], MAT, 'halfsteens', '#000', {});
check('regions niet-null met 2 actieve zones', regions != null);
check('regions = complement + 2 zones', regions?.length === 3, `len=${regions?.length}`);

const rectA = { x0: 600, x1: 1400, y0: 200, y1: 800 };
const rectB = { x0: 1000, x1: 1600, y0: 200, y1: 600 };
const inRect = (s, e, y, r) => s >= r.x0 - 0.5 && e <= r.x1 + 0.5 && y >= r.y0 - 0.5 && y < r.y1 + 0.5;
const overlapsX = (s, e, x0, x1) => Math.min(e, x1) - Math.max(s, x0) > 0.5;

const [complement, regA, regB] = regions;

// ── 2. containment zone A: binnen rechthoek ∩ vlak − openingen ──
let aOutsideRect = 0, aInWindow = 0, aInB = 0;
for (const row of regA.rows) for (const p of row.pieces) {
  const s = p.start, e = p.start + p.length;
  if (!inRect(s, e, row.y, rectA)) aOutsideRect++;
  if (!inCoverage(s, e, row.y, row.y + MAT.steenL)) aInWindow++; // staand → rowH=steenL
  if (row.y + MAT.steenL > rectB.y0 && row.y < rectB.y1 && overlapsX(s, e, rectB.x0, rectB.x1)) aInB++;
}
check('zone A: geen steen buiten rechthoek', aOutsideRect === 0, `buiten=${aOutsideRect}`);
check('zone A: geen steen in opening/buiten vlak', aInWindow === 0, `fout=${aInWindow}`);
// ── 3. z-order: A heeft niets waar B (hoger) overlapt ──
check('zone A: geen steen onder hogere zone B (z-order)', aInB === 0, `overlap=${aInB}`);

// zone B containment
let bOutsideRect = 0, bInWindow = 0;
for (const row of regB.rows) for (const p of row.pieces) {
  const s = p.start, e = p.start + p.length;
  if (!inRect(s, e, row.y, rectB)) bOutsideRect++;
  if (!inCoverage(s, e, row.y, row.y + MAT.steenH)) bInWindow++;
}
check('zone B: geen steen buiten rechthoek', bOutsideRect === 0, `buiten=${bOutsideRect}`);
check('zone B: geen steen in opening/buiten vlak', bInWindow === 0, `fout=${bInWindow}`);

// ── 4. complement: geen steen binnen een zone-rechthoek ──
let compInZone = 0;
for (const row of complement.rows) for (const p of row.pieces) {
  const s = p.start, e = p.start + p.length;
  for (const r of [rectA, rectB]) {
    if (row.y + planeRowH > r.y0 && row.y < r.y1 && overlapsX(s, e, r.x0, r.x1)) compInZone++;
  }
}
check('complement: geen steen binnen zone-rechthoek', compInZone === 0, `binnen=${compInZone}`);

// ── 5. union(alle regions) ⊆ vlak − openingen ──
let anyOutsideVlak = 0;
for (const reg of regions) {
  const rowH = reg.verband === 'staand_tegelverband' ? reg.material.steenL : reg.material.steenH;
  for (const row of reg.rows) for (const p of row.pieces) {
    if (!inCoverage(p.start, p.start + p.length, row.y, row.y + rowH)) anyOutsideVlak++;
  }
}
check('alle regions ⊆ vlak − openingen (geen steen buiten vlak)', anyOutsideVlak === 0, `buiten=${anyOutsideVlak}`);

console.log('=== FASE 2 — STRIPZONE-REGIO VERIFICATIE (synthetisch) ===');
for (const o of ok) console.log('  ✅ ' + o);
for (const f of fails) console.log('  ❌ ' + f);
console.log(`\n  ${fails.length === 0 ? 'ALLE CHECKS GROEN ✅' : `${fails.length} FOUT(EN) ❌`}`);
process.exit(fails.length === 0 ? 0 : 1);
