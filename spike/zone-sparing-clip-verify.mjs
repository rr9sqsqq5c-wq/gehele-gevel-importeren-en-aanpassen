// SPIKE (wegwerp) — verifieert dat buildStripZoneRegions de sparing-rechthoeken (facadeData.sparingRects)
// óók uit de zone-regio's knipt. Synthetisch vlak + één strip-zone + één sparing BINNEN de zone.
// Check: geen enkele steen (complement én zone) valt binnen de sparing-rechthoek. Exit != 0 bij faal.

import { buildStripZoneRegions } from '../src/lib/zoneRegions.js';
import { buildFacePattern } from '../src/lib/pattern.js';

const MAT = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
const PLANE_W = 2000, PLANE_H = 1000;
const rowH = MAT.steenH;

// facadeData.rows = volle halfsteens-bond (NIET voorgeknipt) — zo testen we dat de FIX zelf knipt.
const baseRows = buildFacePattern(PLANE_W, PLANE_H, MAT, 'halfsteens', 0);

// één strip-zone (eigen verband) + één sparing-rechthoek MIDDEN in die zone
const ZONE = { id: 'zTest', enabled: true, x: 400, y: 200, width: 800, height: 400, verband: 'halfsteens', bondAnchor: 'zoneBottomLeft' };
const SPAR = { x: 600, y: 355, width: 120, height: 120 };   // 600..720 × 355..475 (binnen de zone)

const facadeData = { groupWidth: PLANE_W, groupHeight: PLANE_H, rows: baseRows, sparingRects: [SPAR] };

const regions = buildStripZoneRegions(facadeData, [ZONE], MAT, 'halfsteens', '#a64033', {});

const fails = [], ok = [];
const check = (name, cond, detail = '') => (cond ? ok : fails).push(`${name}${detail ? ' — ' + detail : ''}`);

check('regions gebouwd (complement + zone)', Array.isArray(regions) && regions.length === 2, `len=${regions?.length}`);

// tel de stenen die binnen de sparing-rechthoek vallen (verticale én horizontale overlap)
function bricksInSparing(regs) {
  let hits = 0, sample = null;
  for (const reg of regs) {
    for (const row of (reg.rows ?? [])) {
      const ry0 = row.y, ry1 = row.y + rowH;
      if (ry1 <= SPAR.y + 1e-6 || ry0 >= SPAR.y + SPAR.height - 1e-6) continue; // geen verticale overlap
      for (const p of row.pieces) {
        const s = Math.max(p.start, SPAR.x), e = Math.min(p.start + p.length, SPAR.x + SPAR.width);
        if (e - s > 0.5) { hits++; if (!sample) sample = { y: row.y, start: p.start, len: p.length }; }
      }
    }
  }
  return { hits, sample };
}

// zone-regio moet überhaupt stenen hebben (anders is de test zinloos)
const zoneRegion = regions[1];
const zoneBrickCount = (zoneRegion?.rows ?? []).reduce((n, r) => n + r.pieces.length, 0);
check('zone-regio heeft stenen', zoneBrickCount > 0, `${zoneBrickCount} stenen`);

const before = bricksInSparing([{ rows: baseRows }]);   // referentie: ongeknipt vlak zou hits hebben
const after = bricksInSparing(regions);
check('ongeknipt vlak zou stenen in de sparing hebben (referentie)', before.hits > 0, `${before.hits} stenen`);
check('NA buildStripZoneRegions: 0 stenen binnen de sparing-rechthoek', after.hits === 0,
  after.hits ? `nog ${after.hits} stenen, bv. y=${after.sample.y} start=${after.sample.start} len=${after.sample.len}` : '');

// controle: sparingRects afwezig → byte-identiek (geen extra knip)
const regionsNoSpar = buildStripZoneRegions({ ...facadeData, sparingRects: undefined }, [ZONE], MAT, 'halfsteens', '#a64033', {});
const zoneCountNoSpar = (regionsNoSpar[1]?.rows ?? []).reduce((n, r) => n + r.pieces.length, 0);
check('zonder sparingRects: zone-regio ongewijzigd (meer/gelijke stenen dan mét knip)', zoneCountNoSpar >= zoneBrickCount,
  `zonder=${zoneCountNoSpar} met=${zoneBrickCount}`);

// DEBUG-dump: zone-regio-rijen in de sparing-y-band, mét en zónder clip
const dumpBand = (regs, tag) => {
  console.log(`\n[dump ${tag}] zone-regio rijen in y=[${SPAR.y}..${SPAR.y + SPAR.height}], x-overlap met [${SPAR.x}..${SPAR.x + SPAR.width}]:`);
  const reg = regs[1];
  for (const row of (reg?.rows ?? [])) {
    if (row.y + rowH <= SPAR.y || row.y >= SPAR.y + SPAR.height) continue;
    const inRect = row.pieces.filter((p) => Math.min(p.start + p.length, SPAR.x + SPAR.width) - Math.max(p.start, SPAR.x) > 0.5);
    const near = row.pieces.filter((p) => p.start + p.length > SPAR.x - 260 && p.start < SPAR.x + SPAR.width + 260);
    console.log(`  y=${row.y}: ${near.map((p) => `[${Math.round(p.start)}..${Math.round(p.start + p.length)}]`).join(' ')} | in-rect=${inRect.length}`);
  }
};
dumpBand(regionsNoSpar, 'ZONDER clip');
dumpBand(regions, 'MET clip');

console.log('\n=== zone-sparing-clip-verify ===');
for (const o of ok) console.log('  🟢', o);
for (const f of fails) console.log('  🔴', f);
console.log(`\n${fails.length ? '🔴 FAAL' : '🟢 OK'} — ${ok.length} ok, ${fails.length} faal\n`);
process.exit(fails.length ? 1 : 0);
