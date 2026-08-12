// WEGWERP (spike/) — VALIDATE kozijn-offset (per-zijde inflate) + kozijnloze-melding.
// buildFullGroupFacadePattern is puur (geen web-ifc/DOM) → direct in Node testbaar.
import { buildFullGroupFacadePattern } from '../src/lib/pattern.js';

const material = { steenL: 210, steenH: 65, lint: 12, stoot: 10 };
const wall = {
  expressID: 42, length: 3000, height: 2500,
  wallOrigin: { lengthAxis: 'x', heightAxis: 'y', thicknessAxis: 'z', lengthStart: 0, heightStart: 0, lengthEnd: 3000, heightEnd: 2500 },
  openings: [
    { x: 1000, y: 800, breedte: 600, hoogte: 1200, type: 'raam',    polyPts: null, hasFill: true  }, // kozijn OK
    { x: 2000, y: 800, breedte: 500, hoogte: 500,  type: 'sparing', polyPts: null, hasFill: false }, // GEEN kozijn (≥300)
    { x: 2700, y: 100, breedte: 150, hoogte: 150,  type: 'sparing', polyPts: null, hasFill: false }, // klein (<300) → geen melding
  ],
};
const off = { left: 50, right: 40, top: 100, bottom: 20 };
const build = (koz) => buildFullGroupFacadePattern([wall], material, 'halfsteens', null, null, null, null, 0, 0, koz);

console.log('=== G1 — vlag UIT (koz=null): byte-identiek, geen melding ===');
const base = build(null);
const bRaam = base.groupOpenings[0];
console.log(`  groupOpenings: ${base.groupOpenings.length} · raam x=${bRaam.x} w=${bRaam.width} y=${bRaam.y} h=${bRaam.height}`);
console.log(`  ${bRaam.x === 1000 && bRaam.width === 600 && bRaam.y === 800 && bRaam.height === 1200 ? '🟢' : '🔴'} raam ongewijzigd`);
console.log(`  ${(base.openingWarnings?.length ?? 0) === 0 ? '🟢' : '🔴'} geen meldingen (${base.openingWarnings?.length ?? 0})`);

console.log('\n=== G2 — vlag AAN: per-zijde inflate op de raam-opening ===');
const koz = build(off);
const r = koz.groupOpenings.find((o) => o.type === 'raam');
const exp = { x: 1000 - off.left, width: 600 + off.left + off.right, y: 800 - off.bottom, height: 1200 + off.bottom + off.top };
console.log(`  raam na inflate: x=${r.x} w=${r.width} y=${r.y} h=${r.height}  (verwacht x=${exp.x} w=${exp.width} y=${exp.y} h=${exp.height})`);
const okInf = r.x === exp.x && r.width === exp.width && r.y === exp.y && r.height === exp.height;
console.log(`  ${okInf ? '🟢' : '🔴'} inflate klopt (links/rechts langs x, onder/boven langs y)`);

console.log('\n=== G3 — melding: kozijnloze raam/deur-formaat void ===');
const w = koz.openingWarnings ?? [];
const hasBig = w.some((o) => o.width === 500 && o.height === 500);
const hasSmall = w.some((o) => o.width === 150);
console.log(`  meldingen: ${w.length} → ${JSON.stringify(w.map((o) => `${o.width}×${o.height}@${o.x},${o.y}`))}`);
console.log(`  ${hasBig ? '🟢' : '🔴'} 500×500 kozijnloze void gemeld`);
console.log(`  ${!hasSmall ? '🟢' : '🔴'} 150×150 (te klein) NIET gemeld`);
console.log(`  ${w.length === 1 ? '🟢' : '🔴'} precies 1 melding`);

console.log('\n=== G4 — de raam-opening (hasFill) genereert GEEN melding ===');
console.log(`  ${!w.some((o) => o.width === 600) ? '🟢' : '🔴'} raam (600 breed, hasFill) niet gemeld`);
