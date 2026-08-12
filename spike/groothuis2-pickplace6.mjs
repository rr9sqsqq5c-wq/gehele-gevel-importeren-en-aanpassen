// WEGWERP — pick&place v6 (versoepelde strip-regel). Alleen VOLLE STREKKEN (S, ~210) mogen niet
// identiek boven elkaar; koppen/drieklezoren/pasmaatjes mogen wel stapelen. Daardoor vervalt de
// d/k-dwang -> vrije wisselvolgorde. Mal = 2 tripletten van 3; banden wisselen A,B; per band
// WILLEKEURIGE volgorde (echte variatie, alle 6 rijen). Eis: geen volle-strek-stapel (alle 15
// paren) + muizentrap <= 4. Zoek de set; meet worst over veel muren.
//   node spike/groothuis2-pickplace6.mjs

const S = 210, stoot = 4, TARGET = 2500;
const K = Math.round((S - stoot) / 2), D = Math.round((3 * S - stoot) / 4);
const W = { S, K, D };
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function genRow(rng) {
  const startT = rng() < 0.5 ? 'D' : 'K'; const closer = startT === 'D' ? 'K' : 'D', closerW = W[closer];
  for (let a = 0; a < 200; a++) { const codes = [{ t: startT, w: W[startT] }]; let lastT = startT, run = 1;
    while (true) { const used = codes.reduce((s, c) => s + c.w, 0); const pas = TARGET - used - closerW - (codes.length + 1) * stoot;
      if (pas <= 210 && pas >= 110) { codes.push({ t: 'P', w: pas }); codes.push({ t: closer, w: closerW }); return codes; }
      if (pas < 110) break; const opts = ['S', 'K'].filter((t) => { if (t === lastT) { if (t === 'S' && run >= 4) return false; if (t === 'K' && run >= 2) return false; } return true; });
      const t = opts[Math.floor(rng() * opts.length)]; codes.push({ t, w: W[t] }); if (t === lastT) run++; else { lastT = t; run = 1; } } }
  return null;
}
const sig = (c) => c.map((x) => x.t === 'P' ? 's' : x.t.toLowerCase()).join(',');
function stripsOf(codes) { let x = 0; const st = []; for (const c of codes) { st.push({ a: x, b: x + c.w, w: c.w, t: c.t === 'P' ? 'S' : c.t, full: c.t === 'S' }); x += c.w + stoot; } return st; }
function perpsOfStrips(strips) { const ps = strips.map((s) => Math.round(s.b)); ps.pop(); return ps; }
const tol = 7;
// alleen VOLLE strek (oorspronkelijk type S, niet de pasmaat) mag niet identiek stapelen
function stekStack(si, sj) { for (const x of si) { if (!x.full) continue; for (const y of sj) { if (!y.full) continue; if (Math.abs(x.a - y.a) < tol && Math.abs(x.b - y.b) < tol) return true; } } return false; }
function maxTrap(perpRows, cap = 9) {
  const G = perpRows.length; if (G < 2) return 1;
  const marks = perpRows.map((ps) => { const m = new Uint8Array(TARGET + 1); for (const j of ps) { const lo = Math.max(0, j - tol), hi = Math.min(TARGET, j + tol); for (let x = lo; x <= hi; x++) m[x] = 1; } return m; });
  let max = 1; for (let g0 = 0; g0 < G - 1 && max < cap; g0++) for (const p of perpRows[g0]) for (const q of perpRows[g0 + 1]) { const st = q - p, a = Math.abs(st); if (a < 8 || a > 170) continue; let len = 1; for (let g = g0 + 1; g < G; g++) { const tx = p + st * (g - g0); if (tx < 0 || tx > TARGET || !marks[g][Math.round(tx)]) break; len++; } if (len > max) max = len; } return max;
}
function shuffle(arr, rng) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function randomWall(A, B, nBands, rng) { const rows = []; for (let b = 0; b < nBands; b++) { const trip = b % 2 === 0 ? A : B; for (const r of shuffle(trip, rng)) rows.push(r.perps); } return rows; }
function mc(A, B, walls, nBands, rng) { let worst = 0; for (let i = 0; i < walls; i++) { const m = maxTrap(randomWall(A, B, nBands, rng)); if (m > worst) worst = m; if (worst >= 6) break; } return worst; }

const rngP = mulberry32(2024); const pool = new Map();
for (let i = 0; i < 60000; i++) { const r = genRow(rngP); if (r) { const s = sig(r); if (!pool.has(s)) { const strips = stripsOf(r); pool.set(s, { sig: s, strips, perps: perpsOfStrips(strips) }); } } }
const POOL = [...pool.values()].map((o, i) => ({ ...o, id: i }));
console.log(`pool: ${POOL.length} rijen`);
function noStrekStack(six) { for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) if (stekStack(six[i].strips, six[j].strips)) return false; return true; }

const rng = mulberry32(7); const rnd = (a) => a[Math.floor(rng() * a.length)];
let best = null, bestWorst = Infinity; const t0 = Date.now(); let tried = 0, feas = 0;
while (Date.now() - t0 < 50000) {
  tried++; const six = shuffle(POOL, rng).slice(0, 6);
  if (!noStrekStack(six)) continue; feas++;
  let A = six.slice(0, 3), B = six.slice(3); let cw = mc(A, B, 120, 20, mulberry32(31));
  for (let step = 0; step < 50; step++) { const all = [...A, ...B]; const i = Math.floor(rng() * 6); const cand = all.slice(); cand[i] = rnd(POOL); if (new Set(cand.map((x) => x.id)).size !== 6 || !noStrekStack(cand)) continue; const nA = cand.slice(0, 3), nB = cand.slice(3); const v = mc(nA, nB, 120, 20, mulberry32(31)); if (v <= cw) { A = nA; B = nB; cw = v; } }
  if (cw < bestWorst) { bestWorst = cw; best = { A, B }; }
  if (bestWorst <= 3) break;
}
console.log(`geprobeerd: ${tried}, haalbaar (geen volle-strek-stapel, 15 paren): ${feas}, beste worst: ${bestWorst}`);
if (!best) { console.log('GEEN haalbare set.'); process.exit(1); }
const { A, B } = best;
const fin = mc(A, B, 10000, 26, mulberry32(777));
console.log(`\n=== MAL (2 tripletten, vrije wisselvolgorde) ===`);
console.log('Triplet A:'); A.forEach((r, i) => console.log(`  A${i + 1}: ${r.sig}`));
console.log('Triplet B:'); B.forEach((r, i) => console.log(`  B${i + 1}: ${r.sig}`));
console.log('ARRAY_A:', JSON.stringify(A.map((r) => r.sig)));
console.log('ARRAY_B:', JSON.stringify(B.map((r) => r.sig)));
console.log(`\n10000 muren (vrije volgorde, alle 6 rijen): langste muizentrap (worst) = ${fin} banen`);
console.log('Regel: geen twee VOLLE strekken boven elkaar (koppen/drieklezoren/pasmaat mogen).');
