// REGRESSIE-WAAKHOND (self-contained, CI-geschikt): synthetisch, GEEN externe IFC's.
// Roept de ECHTE buildBestFitFacadePattern (facadePlane.js) aan op een "losstaande
// dakrand-band boven gevel met een VERTICAAL gat" en ASSERT: band bekleed + groot
// verticaal gat onbekleed. Exit-code ≠ 0 bij regressie. Leest engine, wijzigt niets.
// (Het echte-data-meetbewijs staat in dakrand-real-measure.mjs — dat is GEEN waakhond.)
import { buildBestFitFacadePattern } from '../../src/lib/facadePlane.js';

const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
const mkWall = (id, name, hs, he, ls = 0, le = 5000) => ({
  expressID: id, name, length: le - ls, height: he - hs, openings: [],
  wallOrigin: {
    lengthAxis: 'x', heightAxis: 'y', thicknessAxis: 'z',
    lengthStart: ls, lengthEnd: le, heightStart: hs, heightEnd: he,
    thicknessStart: 0, thicknessEnd: 100,
  },
});

// Gevel 0..3000 mm, band 3300..3550 mm → VERTICAAL gat 3000..3300 (300 mm).
const gevel = mkWall(1, 'Gevel', 0, 3000);
const band  = mkWall(2, 'Dakrand-band', 3300, 3550);

const fd = buildBestFitFacadePattern([gevel, band], mat, 'halfsteens', null, null, null, null, 0, 0, 'y');
const ys = fd.rows.map(r => Math.round(r.y)).sort((a, b) => a - b);
const rowH = mat.steenH; // 50
const inGap = ys.filter(y => y + rowH > 3000 + 0.5 && y < 3300 - 0.5);
const strictGap = ys.filter(y => y >= 3000 && y + rowH <= 3300);   // VOLLEDIG binnen het gat
console.log('y-rijen rond het gat (2900..3360):', JSON.stringify(ys.filter(y => y >= 2900 && y <= 3360)));
console.log(`rijen VOLLEDIG in gat (3000..3300): ${strictGap.length} → ${strictGap.length === 0 ? 'gat ONBEKLEED ✅' : 'bekleed ❌ ' + JSON.stringify(strictGap)}`);
const onGevel = ys.filter(y => y < 3000);
const onBand  = ys.filter(y => y >= 3300 - rowH);

console.log('=== VERTICAAL gat (band 3300..3550 boven gevel 0..3000, gat 300mm) ===');
console.log('plane:', JSON.stringify(fd._bestFit && { uAxis: fd._bestFit.uAxis, tAxis: fd._bestFit.tAxis, nAxis: fd._bestFit.nAxis }));
console.log(`rijen totaal: ${ys.length} | y-bereik: ${ys[0]}..${ys[ys.length-1]}`);
console.log(`rijen op gevel (<3000):     ${onGevel.length}  → bekleed`);
console.log(`rijen IN gat (3000..3300):  ${inGap.length}    → ${inGap.length === 0 ? 'GEEN (gat ONBEKLEED) ✅' : 'WEL bekleed ❌ ' + JSON.stringify(inGap)}`);
console.log(`rijen op band (>=3300):     ${onBand.length}   → ${onBand.length > 0 ? 'band BEKLEED ✅' : 'band NIET bekleed ❌'}`);

// Horizontale-naad-controle (SEAM_MERGE_TOL): twee segmenten naast elkaar met 60mm gat.
const segA = mkWall(3, 'segA', 0, 3000, 0, 2000);
const segB = mkWall(4, 'segB', 0, 3000, 2060, 5000); // 60 mm horizontaal gat (≤75)
const fd2 = buildBestFitFacadePattern([segA, segB], mat, 'halfsteens', null, null, null, null, 0, 0, 'y');
const row0 = fd2.rows[0];
const covered = row0 ? row0.pieces.some(p => p.start < 2000 && p.start + p.length > 2060) : false;
console.log('\n=== HORIZONTAAL gat 60mm (≤ SEAM_MERGE_TOL=75) tussen twee segmenten ===');
console.log(`naad overbrugd (strip loopt door over 2000..2060)?: ${covered ? 'JA (horizontaal samengevoegd)' : 'NEE'}`);

// ── ASSERTS (waakhond) ──────────────────────────────────────────────────────────
const fails = [];
if (!(onBand.length > 0))      fails.push(`band NIET bekleed (onBand=${onBand.length})`);
if (!(strictGap.length === 0)) fails.push(`verticaal gat WEL bekleed (strictGap=${JSON.stringify(strictGap)})`);
if (!covered)                  fails.push('horizontale naad ≤75mm NIET overbrugd (SEAM_MERGE_TOL-gedrag veranderd)');
console.log('\n──────── WAAKHOND ────────');
if (fails.length) { console.error('🔴 REGRESSIE:\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('🟢 OK — band bekleed, groot verticaal gat onbekleed, horizontale naad overbrugd.');
