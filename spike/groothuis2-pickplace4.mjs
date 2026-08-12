// WEGWERP — pick&place v4 (juiste model). Mal = triplet A (3 DRIEKLEZOOR-start rijen) +
// triplet B (3 KOP-start rijen). Wand wisselt d,k,d,k,...; per laag pakt de unit EEN van de 3
// rijen uit het juiste triplet (variatie). Aangrenzende rijen verschillen dus altijd van start
// -> start/sluitsteen nooit gelijk gestapeld. Eis: ook in het veld nooit twee GELIJKE strippen
// boven elkaar -> alle 9 A-B-paren vrij van gelijke-strip-overlap. Doel: muizentrap <= 4 (liefst 3).
//   node spike/groothuis2-pickplace4.mjs

const S = 210, stoot = 4, steenH = 50, TARGET = 2500;
const K = Math.round((S - stoot) / 2), D = Math.round((3 * S - stoot) / 4);
const W = { S, K, D };
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function genRow(startT, rng) {
  const closer = startT === 'D' ? 'K' : 'D', closerW = W[closer];
  for (let a = 0; a < 200; a++) { const codes = [{ t: startT, w: W[startT] }]; let lastT = startT, run = 1;
    while (true) { const used = codes.reduce((s, c) => s + c.w, 0); const pas = TARGET - used - closerW - (codes.length + 1) * stoot;
      if (pas <= 210 && pas >= 110) { codes.push({ t: 'P', w: pas }); codes.push({ t: closer, w: closerW }); return codes; }
      if (pas < 110) break; const opts = ['S', 'K'].filter((t) => { if (t === lastT) { if (t === 'S' && run >= 4) return false; if (t === 'K' && run >= 2) return false; } return true; });
      const t = opts[Math.floor(rng() * opts.length)]; codes.push({ t, w: W[t] }); if (t === lastT) run++; else { lastT = t; run = 1; } } }
  return null;
}
const sig = (c) => c.map((x) => x.t === 'P' ? 's' : x.t.toLowerCase()).join(',');
function stripsOf(codes) { let x = 0; const st = []; for (const c of codes) { st.push({ a: x, b: x + c.w, t: c.t === 'P' ? 'S' : c.t }); x += c.w + stoot; } return st; }
function perpsOfStrips(strips) { const ps = strips.map((s) => Math.round(s.b)); ps.pop(); return ps; }
const tol = 7;
function stackedEqual(si, sj) { for (const x of si) for (const y of sj) if (x.t === y.t && Math.abs(x.a - y.a) < tol && Math.abs(x.b - y.b) < tol) return true; return false; }
function maxTrap(perpRows, cap = 9) {
  const G = perpRows.length;
  const marks = perpRows.map((ps) => { const m = new Uint8Array(TARGET + 1); for (const j of ps) { const lo = Math.max(0, j - tol), hi = Math.min(TARGET, j + tol); for (let x = lo; x <= hi; x++) m[x] = 1; } return m; });
  let max = 0; for (let g0 = 0; g0 < G - 1 && max < cap; g0++) for (const p of perpRows[g0]) for (const q of perpRows[g0 + 1]) { const st = q - p, a = Math.abs(st); if (a < 8 || a > 170) continue; let len = 1; for (let g = g0 + 1; g < G; g++) { const tx = p + st * (g - g0); if (tx < 0 || tx > TARGET || !marks[g][Math.round(tx)]) break; len++; } if (len > max) max = len; } return max;
}
// wand: wissel d,k,d,k,...; per laag random rij uit het triplet (geen directe herhaling)
function buildWall(A, B, nRows, rng) {
  const rows = []; let lastA = -1, lastB = -1;
  for (let g = 0; g < nRows; g++) {
    const useA = g % 2 === 0; const trip = useA ? A : B; const last = useA ? lastA : lastB;
    let i = Math.floor(rng() * 3); if (i === last) i = (i + 1 + Math.floor(rng() * 2)) % 3;
    rows.push(trip[i].perps); if (useA) lastA = i; else lastB = i;
  }
  return rows;
}

const rngP = mulberry32(2024); const Dpool = new Map(), Kpool = new Map();
for (let i = 0; i < 40000; i++) for (const [pool, st] of [[Dpool, 'D'], [Kpool, 'K']]) { const r = genRow(st, rngP); if (r) { const s = sig(r); if (!pool.has(s)) { const strips = stripsOf(r); pool.set(s, { sig: s, strips, perps: perpsOfStrips(strips) }); } } }
const DP = [...Dpool.values()].map((o, i) => ({ ...o, id: 'd' + i })), KP = [...Kpool.values()].map((o, i) => ({ ...o, id: 'k' + i }));
console.log(`pool: ${DP.length} d-rijen, ${KP.length} k-rijen`);

// haalbaar: alle 9 A-B-paren vrij van gelijke-strip-overlap
function feasible(A, B) { for (const a of A) for (const b of B) if (stackedEqual(a.strips, b.strips)) return false; return true; }
const rng = mulberry32(7); const rnd = (a) => a[Math.floor(rng() * a.length)];
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function evalSet(A, B) { let worst = 0; const R = mulberry32(31); for (let w = 0; w < 200; w++) { const m = maxTrap(buildWall(A, B, 40, R)); if (m > worst) worst = m; } return worst; }

let best = null, bestWorst = Infinity; const t0 = Date.now(); let tried = 0, feas = 0;
while (Date.now() - t0 < 55000) {
  tried++; const A = shuffle(DP).slice(0, 3), B = shuffle(KP).slice(0, 3);
  if (!feasible(A, B)) continue; feas++;
  let cA = A, cB = B, cw = evalSet(A, B);
  for (let step = 0; step < 50; step++) { const useA = rng() < 0.5; const arr = (useA ? cA : cB).slice(); const i = Math.floor(rng() * 3); arr[i] = rnd(useA ? DP : KP); const nA = useA ? arr : cA, nB = useA ? cB : arr; if (new Set([...nA, ...nB].map((x) => x.id)).size !== 6 || !feasible(nA, nB)) continue; const v = evalSet(nA, nB); if (v <= cw) { cA = nA; cB = nB; cw = v; } }
  if (cw < bestWorst) { bestWorst = cw; best = { A: cA, B: cB }; }
  if (bestWorst <= 3) break;
}
console.log(`geprobeerd: ${tried}, haalbaar (9 paren schoon): ${feas}`);
if (!best) { console.log('GEEN haalbare set.'); process.exit(1); }
const { A, B } = best;
let worst = 0; const R = mulberry32(777); for (let w = 0; w < 8000; w++) { const m = maxTrap(buildWall(A, B, 30, R)); if (m > worst) worst = m; }
console.log(`\n=== BESTE MAL: triplet A (drieklezoor-start) + triplet B (kop-start) ===`);
console.log('Triplet A (d):'); A.forEach((r, i) => console.log(`  A${i + 1}: ${r.sig}`));
console.log('Triplet B (k):'); B.forEach((r, i) => console.log(`  B${i + 1}: ${r.sig}`));
console.log('ARRAY_A:', JSON.stringify(A.map((r) => r.sig)));
console.log('ARRAY_B:', JSON.stringify(B.map((r) => r.sig)));
console.log(`\n8000 muren (wisselende keuze): langste muizentrap (worst) = ${worst} banen`);
console.log('Eis voldaan: aangrenzende rijen altijd verschillende start (d/k) + 9 A-B-paren zonder gelijke strip -> nooit 2 gelijke strippen boven elkaar.');
