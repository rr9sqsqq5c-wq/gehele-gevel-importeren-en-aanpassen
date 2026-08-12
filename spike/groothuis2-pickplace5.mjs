// WEGWERP — pick&place v5 (definitief model). Mal = triplet A (3 drieklezoor-rijen) + triplet B
// (3 kop-rijen). Wand wisselt d,k,d,k,... Besturing kiest per laag EEN van de 3 rijen uit het
// juiste triplet, met 2 regels: (1) door de 9 schone A-B-paren is elke keuze vrij van GELIJKE
// strippen boven elkaar; (2) ze kiest (random, voor variatie) uit de keuzes die GEEN muizentrap
// >4 voortzetten. Gezocht: een mal waarbij die slimme keuze ALTIJD lukt -> ≤4 gegarandeerd.
//   node spike/groothuis2-pickplace5.mjs

const S = 210, stoot = 4, TARGET = 2500;
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
function maxTrap(perpRows) {
  const G = perpRows.length; if (G < 2) return 1;
  const marks = perpRows.map((ps) => { const m = new Uint8Array(TARGET + 1); for (const j of ps) { const lo = Math.max(0, j - tol), hi = Math.min(TARGET, j + tol); for (let x = lo; x <= hi; x++) m[x] = 1; } return m; });
  let max = 1; for (let g0 = 0; g0 < G - 1; g0++) for (const p of perpRows[g0]) for (const q of perpRows[g0 + 1]) { const st = q - p, a = Math.abs(st); if (a < 8 || a > 170) continue; let len = 1; for (let g = g0 + 1; g < G; g++) { const tx = p + st * (g - g0); if (tx < 0 || tx > TARGET || !marks[g][Math.round(tx)]) break; len++; } if (len > max) max = len; } return max;
}
// slimme besturing: voegt rij toe alleen als de laatste 5 rijen (incl nieuwe) geen trap >=5 hebben
function smartWall(A, B, n, rng) {
  const rows = []; let lastA = -1, lastB = -1;
  for (let g = 0; g < n; g++) {
    const useA = g % 2 === 0; const trip = useA ? A : B; const last = useA ? lastA : lastB;
    let cand = [0, 1, 2].filter((i) => i !== last); cand = cand.sort(() => rng() - 0.5);
    let placed = -1;
    for (const i of cand) { const win = rows.slice(-4).concat([trip[i].perps]); if (maxTrap(win) <= 4) { placed = i; break; } }
    if (placed < 0) return { rows, failAt: g };
    rows.push(trip[placed].perps); if (useA) lastA = placed; else lastB = placed;
  }
  return { rows, failAt: -1 };
}

const rngP = mulberry32(2024); const Dpool = new Map(), Kpool = new Map();
for (let i = 0; i < 40000; i++) for (const [pool, st] of [[Dpool, 'D'], [Kpool, 'K']]) { const r = genRow(st, rngP); if (r) { const s = sig(r); if (!pool.has(s)) { const strips = stripsOf(r); pool.set(s, { sig: s, strips, perps: perpsOfStrips(strips) }); } } }
const DP = [...Dpool.values()].map((o, i) => ({ ...o, id: 'd' + i })), KP = [...Kpool.values()].map((o, i) => ({ ...o, id: 'k' + i }));
console.log(`pool: ${DP.length} d, ${KP.length} k`);
function feasible(A, B) { for (const a of A) for (const b of B) if (stackedEqual(a.strips, b.strips)) return false; return true; }
const rng = mulberry32(7); const rnd = (a) => a[Math.floor(rng() * a.length)];
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function evalSet(A, B, walls) { let fails = 0; const R = mulberry32(31); for (let w = 0; w < walls; w++) { if (smartWall(A, B, 30, R).failAt >= 0) fails++; } return fails; }

let best = null, bestFails = Infinity; const t0 = Date.now(); let tried = 0, feas = 0;
while (Date.now() - t0 < 55000) {
  tried++; const A = shuffle(DP).slice(0, 3), B = shuffle(KP).slice(0, 3);
  if (!feasible(A, B)) continue; feas++;
  let cA = A, cB = B, cf = evalSet(A, B, 40);
  for (let step = 0; step < 40 && cf > 0; step++) { const useA = rng() < 0.5; const arr = (useA ? cA : cB).slice(); const i = Math.floor(rng() * 3); arr[i] = rnd(useA ? DP : KP); const nA = useA ? arr : cA, nB = useA ? cB : arr; if (new Set([...nA, ...nB].map((x) => x.id)).size !== 6 || !feasible(nA, nB)) continue; const v = evalSet(nA, nB, 40); if (v <= cf) { cA = nA; cB = nB; cf = v; } }
  if (cf < bestFails) { bestFails = cf; best = { A: cA, B: cB }; }
  if (bestFails === 0) break;
}
console.log(`geprobeerd: ${tried}, haalbaar(9 paren): ${feas}, beste dead-end-rate (van 40): ${bestFails}`);
const { A, B } = best;
// grondige eindmeting: 20000 muren, dead-ends + werkelijke max trap
let fails = 0, worst = 1; const R = mulberry32(777);
for (let w = 0; w < 20000; w++) { const r = smartWall(A, B, 30, R); if (r.failAt >= 0) fails++; else { const m = maxTrap(r.rows); if (m > worst) worst = m; } }
console.log(`\n=== MAL: A (drieklezoor) + B (kop) ===`);
console.log('Triplet A (d):'); A.forEach((r, i) => console.log(`  A${i + 1}: ${r.sig}`));
console.log('Triplet B (k):'); B.forEach((r, i) => console.log(`  B${i + 1}: ${r.sig}`));
console.log('ARRAY_A:', JSON.stringify(A.map((r) => r.sig)));
console.log('ARRAY_B:', JSON.stringify(B.map((r) => r.sig)));
console.log(`\n20000 muren met slimme keuze: dead-ends=${fails}, langste muizentrap=${worst} banen`);
