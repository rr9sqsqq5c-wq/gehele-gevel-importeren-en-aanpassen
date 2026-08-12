// WEGWERP — pick&place v8 (definitief model). d/k OM-EN-OM per laag vastgehouden:
// triplet A = 3 DRIEKLEZOOR-rijen, B = 3 KOP-rijen; wand wisselt A,B,A,B (laag-niveau). Besturing
// kiest per laag welke van de 3 (backtracking), zodat: (1) door de afwisseling stapelen start/
// sluitsteen nooit gelijk; (2) geen twee VOLLE STREKKEN boven elkaar (versoepelde regel); (3)
// muizentrap <= 4. Spreidt over alle 6 rijen (minst-gebruikt voortrekken). Zoek een oplosbare set.
//   node spike/groothuis2-pickplace8.mjs

const LIMIT = Number(process.env.LIMIT || 4);
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
function stripsOf(codes) { let x = 0; const st = []; for (const c of codes) { st.push({ a: x, b: x + c.w, full: c.t === 'S' }); x += c.w + stoot; } return st; }
function perpsOfStrips(strips) { const ps = strips.map((s) => Math.round(s.b)); ps.pop(); return ps; }
const tol = 7;
function strekStack(si, sj) { for (const x of si) { if (!x.full) continue; for (const y of sj) { if (!y.full) continue; if (Math.abs(x.a - y.a) < tol && Math.abs(x.b - y.b) < tol) return true; } } return false; }
function maxTrap(perpRows) {
  const G = perpRows.length; if (G < 2) return 1;
  const marks = perpRows.map((ps) => { const m = new Uint8Array(TARGET + 1); for (const j of ps) { const lo = Math.max(0, j - tol), hi = Math.min(TARGET, j + tol); for (let x = lo; x <= hi; x++) m[x] = 1; } return m; });
  let max = 1; for (let g0 = 0; g0 < G - 1; g0++) for (const p of perpRows[g0]) for (const q of perpRows[g0 + 1]) { const st = q - p, a = Math.abs(st); if (a < 8 || a > 170) continue; let len = 1; for (let g = g0 + 1; g < G; g++) { const tx = p + st * (g - g0); if (tx < 0 || tx > TARGET || !marks[g][Math.round(tx)]) break; len++; } if (len > max) max = len; } return max;
}
// backtracking met d/k-afwisseling; differ-from-last-1 per kant; bias naar minst gebruikt
function solve(A, B, N, rng) {
  const rows = [], strips = [], seq = []; const use = { A: [0,0,0], B: [0,0,0] }; let nodes = 0;
  // differ-from-last-1 per kant + WILLEKEURIGE keuze (max variatie); backtracking borgt ≤LIMIT
  function bt(g, lastA, lastB) {
    if (g === N) return true; if (++nodes > 8_000_000) return false;
    const useA = g % 2 === 0; const trip = useA ? A : B; const last = useA ? lastA : lastB;
    const order = [0, 1, 2].filter((i) => i !== last).sort(() => rng() - 0.5);
    for (const i of order) {
      const r = trip[i]; const below = strips[strips.length - 1];
      if (below && strekStack(below, r.strips)) continue;
      rows.push(r.perps); strips.push(r.strips);
      if (maxTrap(rows.slice(-7)) <= LIMIT) {
        seq.push((useA ? 'A' : 'B') + (i + 1)); use[useA ? 'A' : 'B'][i]++;
        if (bt(g + 1, useA ? i : lastA, useA ? lastB : i)) return true;
        use[useA ? 'A' : 'B'][i]--; seq.pop();
      }
      rows.pop(); strips.pop();
    }
    return false;
  }
  return { ok: bt(0, -1, -1), seq, use };
}

const rngP = mulberry32(2024); const Dpool = new Map(), Kpool = new Map();
for (let i = 0; i < 40000; i++) for (const [pool, st] of [[Dpool, 'D'], [Kpool, 'K']]) { const r = genRow(st, rngP); if (r) { const s = sig(r); if (!pool.has(s)) { const strips = stripsOf(r); pool.set(s, { sig: s, strips, perps: perpsOfStrips(strips) }); } } }
const DP = [...Dpool.values()].map((o, i) => ({ ...o, id: 'd' + i })), KP = [...Kpool.values()].map((o, i) => ({ ...o, id: 'k' + i }));
console.log(`pool: ${DP.length} d, ${KP.length} k`);
const rng = mulberry32(7);
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// kies de set met de BESTE variatie: hoogste minimale gebruiksgraad van de 6 rijen over 60 lagen
let best = null, bestBal = -1; const t0 = Date.now(); let tried = 0, solved = 0;
while (Date.now() - t0 < 50000) {
  tried++; const A = shuffle(DP).slice(0, 3), B = shuffle(KP).slice(0, 3);
  const r = solve(A, B, 60, mulberry32(50 + tried));
  const all6 = r.ok && r.use.A.every((c) => c > 0) && r.use.B.every((c) => c > 0);
  if (all6) { solved++; const bal = Math.min(...r.use.A, ...r.use.B); if (bal > bestBal) { bestBal = bal; best = { A, B, seq: r.seq, use: r.use }; } }
  if (bestBal >= 8) break;
}
console.log(`LIMIT=${LIMIT}  geprobeerd: ${tried}, opgelost (alle 6): ${solved}; beste balans (min-gebruik): ${bestBal}/~10`);
if (!best) { console.log('GEEN set.'); process.exit(1); }
const { A, B, seq, use } = best;
let okSeeds = 0, worstAll = 1; for (let s = 0; s < 40; s++) { const r = solve(A, B, 60, mulberry32(8000 + s)); if (r.ok) { okSeeds++; const m = maxTrap(r.rows ?? []); } }
console.log(`\n=== MAL: A (drieklezoor) + B (kop), d/k OM-EN-OM, trap ≤5 ===`);
console.log('Triplet A (d):'); A.forEach((r, i) => console.log(`  A${i + 1}: ${r.sig}  (${use.A[i]}× gebruikt)`));
console.log('Triplet B (k):'); B.forEach((r, i) => console.log(`  B${i + 1}: ${r.sig}  (${use.B[i]}× gebruikt)`));
console.log('ARRAY_A:', JSON.stringify(A.map((r) => r.sig)));
console.log('ARRAY_B:', JSON.stringify(B.map((r) => r.sig)));
console.log('voorbeeld-volgorde (30 lagen):', seq.slice(0, 30).join(' '));
console.log(`oplosbaar met ${okSeeds}/40 seeds -> variatie tussen panelen`);
