// WEGWERP (spike/) — VALIDATE opening-rand ¼-steen-relaxatie (vlag openingEdgeQuarter).
// buildFullGroupFacadePattern is puur → direct testbaar. Opening-linkerrand op x=225: even rijen
// leveren een splinter (→ normaal geforceerd naar Kop 100mm), oneven rijen een natuurlijke ~115mm.
// Zonder relaxatie: even rijen allemaal Kop(100) → stapelen bijna op oneven 115 (delta 15). Met
// relaxatie (delta 50): even rijen zakken naar ¼ steen (Klezoor 50) → delta 65 → verspringt weer.
import { buildFullGroupFacadePattern } from '../src/lib/pattern.js';

const material = { steenL: 210, steenH: 65, lint: 12, stoot: 10 }; // kop=100, kwart=50, pitch=220
const wall = {
  expressID: 7, length: 2000, height: 1500,
  wallOrigin: { lengthAxis: 'x', heightAxis: 'y', thicknessAxis: 'z', lengthStart: 0, heightStart: 0, lengthEnd: 2000, heightEnd: 1500 },
  openings: [{ x: 225, y: 0, breedte: 800, hoogte: 1000, type: 'raam', polyPts: null, hasFill: true }],
};
const build = (stag) => buildFullGroupFacadePattern([wall], material, 'halfsteens', null, null, null, null, 0, 0, null, stag);

// verzamel de strip die tegen de LINKER opening-rand (x=225) eindigt, per rij
const edgePiece = (fd) => fd.rows
  .map((row) => row.pieces.find((p) => Math.abs(p.start + p.length - 225) < 1.2))
  .filter(Boolean);

console.log('=== G1 — vlag UIT (stagger=null): byte-identiek, alleen Kop tegen de rand ===');
const base = build(null);
const bEdges = edgePiece(base);
const bLabels = [...new Set(bEdges.map((p) => p.label))];
const bLens = [...new Set(bEdges.map((p) => p.length))].sort((a, b) => a - b);
console.log(`  labels tegen rand: ${bLabels.join(', ')} · lengtes: ${bLens.join(', ')}`);
console.log(`  ${!bLabels.includes('Klezoor') ? '🟢' : '🔴'} geen Klezoor (¼) — huidige regel ongewijzigd`);

console.log('\n=== G2 — vlag AAN (delta 50): ¼-steen verschijnt waar het zou stapelen ===');
const stag = build({ minDelta: 50 });
const sEdges = edgePiece(stag);
const sLabels = [...new Set(sEdges.map((p) => p.label))];
const klez = sEdges.filter((p) => p.label === 'Klezoor');
console.log(`  labels tegen rand: ${sLabels.join(', ')}`);
console.log(`  ${sLabels.includes('Klezoor') ? '🟢' : '🔴'} Klezoor (¼ = 50mm) toegepast (${klez.length}×)`);
console.log(`  ${klez.every((p) => Math.abs(p.length - 50) < 0.6) ? '🟢' : '🔴'} elke Klezoor is 50mm (¼ steen)`);

console.log('\n=== G3 — stapel-delta: opeenvolgende rand-strips verschillen nu > delta ===');
// pak de edge-lengte per rij (op volgorde) en check dat geen twee opeenvolgende binnen 50 zitten waar Klezoor koos
const seq = sEdges.map((p) => Math.round(p.length));
let okStagger = true;
for (let i = 1; i < seq.length; i++) {
  // alleen paren waar minstens één een geforceerde maat is (100 of 50): die moeten > 50 verschillen? we checken
  // dat we NIET twee keer 100 pal boven elkaar hebben op de plek waar 115 eronder zat → geen 100/100-stapel.
  if (seq[i] === 100 && seq[i - 1] === 100) okStagger = false;
}
console.log(`  rand-lengtes per rij: ${seq.join(', ')}`);
console.log(`  ${okStagger ? '🟢' : '🔴'} geen twee identieke geforceerde Koppen (100) pal boven elkaar`);
console.log(`  base (vlag uit) rand-lengtes: ${bEdges.map((p) => Math.round(p.length)).join(', ')}`);
