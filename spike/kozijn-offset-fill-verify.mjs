// WEGWERP (spike/) — VALIDATE: kozijn-offset meet vanaf het KOZIJN (fill), niet de void, óók als het
// kozijn asymmetrisch in de void staat. buildFullGroupFacadePattern is puur → direct testbaar.
import { buildFullGroupFacadePattern } from '../src/lib/pattern.js';

const material = { steenL: 210, steenH: 65, lint: 12, stoot: 10 };
// Void 1000..2000 (breed 1000). Kozijn asymmetrisch: 1100..1900 in x (dus 100 links, 100 rechts van void)
// maar in y 820..1900 (void 800..2000) → 20 onder, 100 boven vrij. Kozijn = 800x1080.
const wall = {
  expressID: 7, length: 3000, height: 2500,
  wallOrigin: { lengthAxis: 'x', heightAxis: 'y', thicknessAxis: 'z', lengthStart: 0, heightStart: 0, lengthEnd: 3000, heightEnd: 2500 },
  openings: [{
    x: 1000, y: 800, breedte: 1000, hoogte: 1200, type: 'raam', polyPts: null, hasFill: true,
    kozijnRect: { x: 1100, y: 820, breedte: 800, hoogte: 1080, polyPts: null },
  }],
};
const off = { left: 50, right: 50, top: 50, bottom: 50 };
const build = (koz) => buildFullGroupFacadePattern([wall], material, 'halfsteens', null, null, null, 0, 0, koz);

const holeOf = (fd) => { const o = fd.groupOpenings[0]; return { x1: o.x, x2: o.x + o.width, y1: o.y, y2: o.y + o.height }; };

console.log('=== G1 — vlag UIT: clip = ruwe void (byte-identiek) ===');
const base = holeOf(build(null));
console.log(`  gat: x[${base.x1}..${base.x2}] y[${base.y1}..${base.y2}]`);
console.log(`  ${base.x1 === 1000 && base.x2 === 2000 && base.y1 === 800 && base.y2 === 2000 ? '🟢' : '🔴'} = void 1000..2000 × 800..2000`);

console.log('\n=== G2 — vlag AAN: clip = KOZIJN ± offset (niet de void) ===');
const koz = holeOf(build(off));
// verwacht: kozijn 1100..1900 × 820..1900, ± offset 50 → 1050..1950 × 770..1950
const exp = { x1: 1050, x2: 1950, y1: 770, y2: 1950 };
console.log(`  gat: x[${koz.x1}..${koz.x2}] y[${koz.y1}..${koz.y2}]  (verwacht x[${exp.x1}..${exp.x2}] y[${exp.y1}..${exp.y2}])`);
const ok = koz.x1 === exp.x1 && koz.x2 === exp.x2 && koz.y1 === exp.y1 && koz.y2 === exp.y2;
console.log(`  ${ok ? '🟢' : '🔴'} referentie = kozijn (asymmetrisch), niet de void`);
console.log(`  ${koz.x1 !== 950 ? '🟢' : '🔴'} NIET void±offset (dat zou 950 zijn geweest)`);
