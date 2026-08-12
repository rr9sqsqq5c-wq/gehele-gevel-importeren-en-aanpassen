// READ-ONLY DIAGNOSE — bevestig dat raam+deur op één wand mergen tot een BBOX en dat het massieve
// muurdeel ONDER het raam (naast de deur) daardoor als void wordt geknipt.
// Draait de ECHTE code: buildFullGroupFacadePattern (src/lib/pattern.js). Geen vlag → huidig gedrag.
import { buildFullGroupFacadePattern } from '../../src/lib/pattern.js';

const material = { steenL: 210, steenH: 50, lint: 12, stoot: 12 };
const verband = 'halfsteens';

// Synthetische groep die de klacht reproduceert: één vlakke wand, deur (vol) links, raam (hoog) rechts.
// Deur  x[200..1200]  y[0..2300]
// Raam  x[1100..2300] y[1000..2000]
// overlapX = 1200-1100 = 100 (>50), overlapY = 2000-1000 = 1000 (>50) → shouldMerge = TRUE.
// Bbox-merge → x[200..2300] y[0..2300]. MASSIEF muurdeel = x[1200..2300] y[0..1000] (onder raam, naast
// deur) valt binnen die bbox → wordt geknipt → onbekleed. Dat is de bug.
const wall = {
  expressID: 1,
  length: 4000,
  height: 3000,
  wallOrigin: { lengthStart: 0, heightStart: 0, lengthAxis: 'x', heightAxis: 'y', thicknessAxis: 'z' },
  openings: [
    { x: 200,  y: 0,    breedte: 1000, hoogte: 2300, type: 'deur' },
    { x: 1100, y: 1000, breedte: 1200, hoogte: 1000, type: 'raam' },
  ],
};

const fd = buildFullGroupFacadePattern([wall], material, verband, null, null, 0);

// Probe: heeft de bekleding pieces in het massieve venster (x[1200..2300], y[0..1000])?
const massMinX = 1200, massMaxX = 2300, massMinY = 50, massMaxY = 950;
let hit = 0, sample = [];
for (const row of fd.rows) {
  if (row.y < massMinY || row.y > massMaxY) continue;
  for (const p of row.pieces) {
    const s = p.start, e = p.start + p.length;
    // overlapt het stuk het massieve venster in x?
    const ov = Math.min(e, massMaxX) - Math.max(s, massMinX);
    if (ov > 5) { hit++; if (sample.length < 6) sample.push({ y: row.y, start: Math.round(s), len: Math.round(p.length), label: p.label }); }
  }
}

console.log('=== DIAGNOSE concave-void raam+deur (huidige code, geen vlag) ===');
console.log('groupWidth', fd.groupWidth, 'rows', fd.rows.length);
console.log('groupOpenings (na merge):');
for (const op of fd.groupOpenings) {
  console.log('  x', op.x, 'y', op.y, 'w', op.width, 'h', op.height, 'type', op.type,
    'polyPts', op.polyPts ? op.polyPts.map((p) => `(${Math.round(p.l)},${Math.round(p.h)})`).join(' ') : 'null');
}
console.log('\nMASSIEF-VENSTER  x[' + massMinX + '..' + massMaxX + '] y[' + massMinY + '..' + massMaxY + ']');
console.log('  bekledings-pieces in dat venster:', hit, hit === 0 ? '→ 🔴 ONBEKLEED (bug bevestigd)' : '→ bekleed');
if (sample.length) console.log('  voorbeelden:', JSON.stringify(sample));
