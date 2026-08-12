// READ-ONLY RAPPORT — meet het door de klant opgegeven 6-rij patroon (rij 1 = onder) op
// muizentrappen, doorgaande stootvoegen en kop-kolommen. Vaste period-6 tegel, herhaald.
//   node spike/groothuis2-verify-scenarios.mjs
const S = 210, stoot = 4, lint = 10, steenH = 50, lag = steenH + lint;
const K = Math.round((S - stoot) / 2), D = Math.round((3 * S - stoot) / 4);
const W = { s: S, k: K, d: D };
const TILE = [
  'd,s,k,s,k,s,k,s,s,s,s,k,s,k,k', // rij 1 (onder) — aangepast: begint nu d,s,k,s,k
  'k,s,s,k,s,k,s,s,s,s,k,s,s,d',   // rij 2
  'd,s,s,s,s,s,k,s,s,s,s,s,k',     // rij 3 — terug naar origineel
  'k,s,k,s,k,s,s,s,s,k,s,s,s,d',   // rij 4
  'd,k,s,s,s,s,k,s,s,k,s,s,s,k',   // rij 5
  'k,k,s,s,s,s,k,s,s,s,s,k,s,d',   // rij 6
].map((r) => r.split(','));

// breedte per rij + perps + kop-centers
function rowGeom(row) {
  let x = 0; const perps = [], kx = []; let width = 0;
  for (let i = 0; i < row.length; i++) { const w = W[row[i]]; if (row[i] === 'k') kx.push(x + w / 2); x += w; perps.push(Math.round(x)); x += stoot; }
  width = x - stoot; perps.pop();
  return { perps, kx, width };
}
const geom = TILE.map(rowGeom);
console.log('=== breedte per rij (steen 210×50, K=103, D=157, stoot 4) ===');
geom.forEach((g, i) => console.log(`  rij ${i + 1}: ${g.width} mm, ${TILE[i].length} stenen, ${g.kx.length} koppen`));
const wmin = Math.min(...geom.map((g) => g.width)), wmax = Math.max(...geom.map((g) => g.width));
console.log(`  spreiding: ${wmin}..${wmax} mm (${wmax - wmin === 0 ? 'exact gelijk' : 'verschil ' + (wmax - wmin) + ' mm'})`);

// stapel de tegel (rij1 onder), REP cycli
const REP = 6, Ncourses = REP * 6;
const perpsW = [], kxW = [];
for (let g = 0; g < Ncourses; g++) { perpsW.push(geom[g % 6].perps); kxW.push(geom[g % 6].kx); }

// muizentrap
const tol = 7;
function maxTrap(rowsP) { const G = rowsP.length; let max = 1, hist = {}; for (let g0 = 0; g0 < G - 1; g0++) for (const p of rowsP[g0]) for (const q of rowsP[g0 + 1]) { const st = q - p, a = Math.abs(st); if (a < 8 || a > 170) continue; let len = 1; for (let g = g0 + 1; g < G; g++) { const tx = p + st * (g - g0); if (rowsP[g].some((v) => Math.abs(v - tx) < tol)) len++; else break; } if (len > max) max = len; hist[len] = (hist[len] || 0) + 1; } return { max }; }
const mt = maxTrap(perpsW);

// doorgaande stootvoeg (zelfde perp in 2 aangrenzende lagen)
let doorlopend = 0;
for (let g = 1; g < Ncourses; g++) for (const p of perpsW[g - 1]) if (perpsW[g].some((q) => Math.abs(q - p) < tol)) doorlopend++;

// kop-kolommen: hoeveel van de 6 rijen delen een kop op ~zelfde x (bin  45mm)?
const KTOL = 45;
const binCount = new Map();
for (let i = 0; i < 6; i++) for (const x of geom[i].kx) { let placed = false; for (const key of binCount.keys()) if (Math.abs(key - x) < KTOL) { binCount.set(key, binCount.get(key).concat(i + 1)); placed = true; break; } if (!placed) binCount.set(Math.round(x), [i + 1]); }
const shared = [...binCount.entries()].filter(([, rows]) => rows.length >= 2).sort((a, b) => b[1].length - a[1].length);
// aangrenzende kop-align (kop pal boven kop) + langste kop-kolom over de stapel
let kopAdj = 0, kopColMax = 1;
for (let g = 1; g < Ncourses; g++) for (const x of kxW[g]) if (kxW[g - 1].some((v) => Math.abs(v - x) < KTOL)) kopAdj++;
for (let g = 0; g < Ncourses; g++) for (const x of kxW[g]) { let len = 1, cur = g; while (cur + 1 < Ncourses && kxW[cur + 1].some((v) => Math.abs(v - x) < KTOL)) { len++; cur++; } if (len > kopColMax) kopColMax = len; }
// dichtste kop-kolom: max koppen op zelfde x binnen 6 opeenvolgende lagen
let dens6 = 1; for (let g = 0; g < Ncourses; g++) for (const x of kxW[g]) { let c = 0; for (let h = g; h < Math.min(Ncourses, g + 6); h++) if (kxW[h].some((v) => Math.abs(v - x) < KTOL)) c++; if (c > dens6) dens6 = c; }

console.log('\n=== MUIZENTRAPPEN (doorlopende stootvoeg-diagonaal) ===');
console.log(`  langste muizentrap = ${mt.max} banen`);
console.log('\n=== DOORGAANDE STOOTVOEGEN (kruisvoeg, zelfde voeg 2 lagen) ===');
console.log(`  aantal = ${doorlopend}`);
console.log('\n=== KOP-KOLOMMEN ===');
console.log(`  kop pal boven kop (aangrenzend) = ${kopAdj}`);
console.log(`  langste aaneengesloten kop-kolom = ${kopColMax} lagen`);
console.log(`  dichtste kop-kolom = ${dens6} koppen binnen 6 lagen op dezelfde x`);
console.log('  koppen die BINNEN de 6-rij-tegel dezelfde x delen (bin 45mm):');
if (!shared.length) console.log('    (geen — elke kop-x zit in maar 1 van de 6 rijen)');
for (const [x, rows] of shared) console.log(`    x~${Math.round(x)}mm : rijen ${rows.join(',')} (${rows.length}×)`);
