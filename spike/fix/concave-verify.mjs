// FIX-VERIFY — concaveOpeningMerge. Draait de ECHTE code. Vlag wordt via localStorage-shim gezet
// VÓÓR de import van pattern.js (readFlag leest localStorage).
import assert from 'node:assert';

// ── vlag-shim: readFlag() in featureFlags.js leest localStorage → hier nabootsen ────────────────
const _store = {};
globalThis.localStorage = {
  getItem: (k) => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
};

const { rectilinearUnion } = await import('../../src/lib/pattern.js');

const material = { steenL: 210, steenH: 50, lint: 12, stoot: 12 };
const verband = 'halfsteens';
const mkWall = () => ({
  expressID: 1, length: 4000, height: 3000,
  wallOrigin: { lengthStart: 0, heightStart: 0, lengthAxis: 'x', heightAxis: 'y', thicknessAxis: 'z' },
  openings: [
    { x: 200,  y: 0,    breedte: 1000, hoogte: 2300, type: 'deur' },
    { x: 1100, y: 1000, breedte: 1200, hoogte: 1000, type: 'raam' },
  ],
});

const massMinX = 1200, massMaxX = 2300, massMinY = 50, massMaxY = 950;
function claddedInMass(fd) {
  let hit = 0;
  for (const row of fd.rows) {
    if (row.y < massMinY || row.y > massMaxY) continue;
    for (const p of row.pieces) {
      const s = p.start, e = p.start + p.length;
      if (Math.min(e, massMaxX) - Math.max(s, massMinX) > 5) hit++;
    }
  }
  return hit;
}
function rowsSig(fd) {
  return JSON.stringify(fd.rows.map((r) => [r.y, r.pieces.map((p) => [p.start, p.length, p.label])]));
}

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('🟢', name); } else { fail++; console.log('🔴', name); } };

// ── 1. UNIT: rectilinearUnion op deur+raam ──────────────────────────────────────────────────────
{
  const deur = [{ l: 200, h: 0 }, { l: 1200, h: 0 }, { l: 1200, h: 2300 }, { l: 200, h: 2300 }];
  const raam = [{ l: 1100, h: 1000 }, { l: 2300, h: 1000 }, { l: 2300, h: 2000 }, { l: 1100, h: 2000 }];
  const uni = rectilinearUnion(deur, raam);
  ok('unie levert een lus', Array.isArray(uni) && uni.length >= 4);
  // punt in massief venster (1700,500) mag NIET in de unie liggen; punt in deur (700,500) WEL; punt in raam (1700,1500) WEL
  const { polyXRangesAtY } = await import('../../src/lib/geometry.js');
  const inside = (poly, x, y) => polyXRangesAtY(poly, y).some(([a, b]) => x >= a && x <= b);
  ok('massief (1700,500) NIET in unie', !inside(uni, 1700, 500));
  ok('deur (700,500) WEL in unie', inside(uni, 700, 500));
  ok('raam (1700,1500) WEL in unie', inside(uni, 1700, 1500));
  ok('overlap (1150,1500) WEL in unie', inside(uni, 1150, 1500));
}

// ── 2. UNIT: nested (kleine binnen grote) → gewoon de grote ─────────────────────────────────────
{
  const big = [{ l: 0, h: 0 }, { l: 1000, h: 0 }, { l: 1000, h: 1000 }, { l: 0, h: 1000 }];
  const small = [{ l: 200, h: 200 }, { l: 400, h: 200 }, { l: 400, h: 400 }, { l: 200, h: 400 }];
  const uni = rectilinearUnion(big, small);
  const { polyXRangesAtY } = await import('../../src/lib/geometry.js');
  const inside = (poly, x, y) => polyXRangesAtY(poly, y).some(([a, b]) => x >= a && x <= b);
  ok('nested: hele grote gedekt', uni && inside(uni, 500, 500) && inside(uni, 50, 50) && inside(uni, 950, 950));
}

// ── 3. UNIT: kruis (plus-vorm) — verticale balk + horizontale balk ──────────────────────────────
{
  const vert = [{ l: 400, h: 0 }, { l: 600, h: 0 }, { l: 600, h: 1000 }, { l: 400, h: 1000 }];
  const horz = [{ l: 0, h: 400 }, { l: 1000, h: 400 }, { l: 1000, h: 600 }, { l: 0, h: 600 }];
  const uni = rectilinearUnion(vert, horz);
  const { polyXRangesAtY } = await import('../../src/lib/geometry.js');
  const inside = (poly, x, y) => polyXRangesAtY(poly, y).some(([a, b]) => x >= a && x <= b);
  ok('kruis: hoek (50,50) NIET gedekt', uni && !inside(uni, 50, 50));
  ok('kruis: arm (50,500) WEL gedekt', uni && inside(uni, 50, 500));
  ok('kruis: centrum (500,500) WEL gedekt', uni && inside(uni, 500, 500));
  ok('kruis: arm (500,50) WEL gedekt', uni && inside(uni, 500, 50));
}

// ── 4. INTEGRATIE: vlag AAN → massief bekleed ──────────────────────────────────────────────────
const { buildFullGroupFacadePattern } = await import('../../src/lib/pattern.js');
_store['concaveOpeningMerge'] = '1';
// featureFlags heeft de vlag al bij import gelezen? Nee — isConcaveOpeningMerge() wordt PER CALL gelezen
// (readFlag draait bij elke aanroep). Dus toggelen tussen calls werkt.
const fdOn = buildFullGroupFacadePattern([mkWall()], material, verband, null, null, 0);
ok('vlag AAN: massief venster bekleed (>0 pieces)', claddedInMass(fdOn) > 0);

// ── 5. BYTE-IDENTIEK: vlag UIT vs een verse baseline ────────────────────────────────────────────
_store['concaveOpeningMerge'] = '0';
const fdOff = buildFullGroupFacadePattern([mkWall()], material, verband, null, null, 0);
ok('vlag UIT: massief venster ONbekleed (0 pieces, = oud gedrag)', claddedInMass(fdOff) === 0);

// baseline zonder de vlag ooit gezet (default false) moet identiek zijn aan vlag='0'
delete _store['concaveOpeningMerge'];
const fdDefault = buildFullGroupFacadePattern([mkWall()], material, verband, null, null, 0);
ok('vlag UIT byte-identiek aan default (geen vlag)', rowsSig(fdOff) === rowsSig(fdDefault));

// ── 6. REGRESSIE: één opening (geen merge) — vlag AAN mag niets veranderen ───────────────────────
{
  const oneOpening = () => ({
    expressID: 2, length: 4000, height: 3000,
    wallOrigin: { lengthStart: 0, heightStart: 0, lengthAxis: 'x', heightAxis: 'y', thicknessAxis: 'z' },
    openings: [{ x: 800, y: 500, breedte: 1200, hoogte: 1400, type: 'raam' }],
  });
  const off = buildFullGroupFacadePattern([oneOpening()], material, verband, null, null, 0);
  _store['concaveOpeningMerge'] = '1';
  const on = buildFullGroupFacadePattern([oneOpening()], material, verband, null, null, 0);
  delete _store['concaveOpeningMerge'];
  ok('één opening: vlag AAN == vlag UIT (geen merge → geen verschil)', rowsSig(off) === rowsSig(on));
}

console.log(`\n${fail === 0 ? '🟢 ALLE' : '🔴'} ${pass} groen, ${fail} rood`);
process.exit(fail === 0 ? 0 : 1);
