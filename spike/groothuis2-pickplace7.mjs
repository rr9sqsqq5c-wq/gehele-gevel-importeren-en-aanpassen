// WEGWERP — pick&place v7. Versoepelde regel (alleen VOLLE strek mag niet stapelen) + besturing
// KIEST de volgorde. Mal = 2 tripletten van 3; elke band = alle 3 rijen van een triplet in een
// door de besturing gekozen volgorde (backtracking); banden wisselen A,B. Eis per aansluiting:
// geen volle-strek-stapel + muizentrap <= 4. Alle 6 rijen worden elke 6 lagen gebruikt (variatie
// via verschillende permutaties per band). Zoek een set die een hoge wand oplost.
//   node spike/groothuis2-pickplace7.mjs

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
function stripsOf(codes) { let x = 0; const st = []; for (const c of codes) { st.push({ a: x, b: x + c.w, full: c.t === 'S' }); x += c.w + stoot; } return st; }
function perpsOfStrips(strips) { const ps = strips.map((s) => Math.round(s.b)); ps.pop(); return ps; }
const tol = 7;
function strekStack(si, sj) { for (const x of si) { if (!x.full) continue; for (const y of sj) { if (!y.full) continue; if (Math.abs(x.a - y.a) < tol && Math.abs(x.b - y.b) < tol) return true; } } return false; }
function maxTrap(perpRows) {
  const G = perpRows.length; if (G < 2) return 1;
  const marks = perpRows.map((ps) => { const m = new Uint8Array(TARGET + 1); for (const j of ps) { const lo = Math.max(0, j - tol), hi = Math.min(TARGET, j + tol); for (let x = lo; x <= hi; x++) m[x] = 1; } return m; });
  let max = 1; for (let g0 = 0; g0 < G - 1; g0++) for (const p of perpRows[g0]) for (const q of perpRows[g0 + 1]) { const st = q - p, a = Math.abs(st); if (a < 8 || a > 170) continue; let len = 1; for (let g = g0 + 1; g < G; g++) { const tx = p + st * (g - g0); if (tx < 0 || tx > TARGET || !marks[g][Math.round(tx)]) break; len++; } if (len > max) max = len; } return max;
}
function perms3(rng) { const base = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]; for (let i = base.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [base[i], base[j]] = [base[j], base[i]]; } return base; }

// backtracking over banden: elke band = permutatie van het triplet (alle 3); check per nieuwe rij
function solve(A, B, nBands, rng) {
  const rows = []; const strips = []; const seq = []; let nodes = 0;
  function tryRow(r) { const below = strips[strips.length - 1]; if (below && strekStack(below, r.strips)) return false; rows.push(r.perps); strips.push(r.strips); if (maxTrap(rows.slice(-6)) > 4) { rows.pop(); strips.pop(); return false; } return true; }
  function bt(b) {
    if (b === nBands) return true;
    if (++nodes > 5_000_000) return false;
    const trip = b % 2 === 0 ? A : B;
    for (const p of perms3(rng)) {
      let placed = 0; for (const idx of p) { if (tryRow(trip[idx])) { placed++; seq.push((b % 2 === 0 ? 'A' : 'B') + (idx + 1)); } else break; }
      if (placed === 3 && bt(b + 1)) return true;
      for (let k = 0; k < placed; k++) { rows.pop(); strips.pop(); seq.pop(); }
    }
    return false;
  }
  return { ok: bt(0), seq };
}

const rngP = mulberry32(2024); const pool = new Map();
for (let i = 0; i < 60000; i++) { const r = genRow(rngP); if (r) { const s = sig(r); if (!pool.has(s)) { const strips = stripsOf(r); pool.set(s, { sig: s, strips, perps: perpsOfStrips(strips) }); } } }
const POOL = [...pool.values()].map((o, i) => ({ ...o, id: i }));
console.log(`pool: ${POOL.length} rijen`);
const rng = mulberry32(7);
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

let best = null; const t0 = Date.now(); let tried = 0, solved = 0;
while (Date.now() - t0 < 50000) {
  tried++; const six = shuffle(POOL).slice(0, 6); const A = six.slice(0, 3), B = six.slice(3);
  const r = solve(A, B, 20, mulberry32(50 + tried));
  if (r.ok) { solved++; best = { A, B, seq: r.seq }; break; }
}
console.log(`geprobeerd: ${tried}, opgelost (20 banden=60 lagen, ≤4): ${solved}`);
if (!best) { console.log('GEEN set opgelost binnen budget.'); process.exit(1); }
const { A, B, seq } = best;
// robuustheid + variatie
let okSeeds = 0; for (let s = 0; s < 40; s++) if (solve(A, B, 20, mulberry32(8000 + s)).ok) okSeeds++;
console.log(`\n=== MAL (2 tripletten, besturing kiest bandvolgorde) ===`);
console.log('Triplet A:'); A.forEach((r, i) => console.log(`  A${i + 1}: ${r.sig}`));
console.log('Triplet B:'); B.forEach((r, i) => console.log(`  B${i + 1}: ${r.sig}`));
console.log('ARRAY_A:', JSON.stringify(A.map((r) => r.sig)));
console.log('ARRAY_B:', JSON.stringify(B.map((r) => r.sig)));
console.log('voorbeeld-volgorde:', seq.slice(0, 24).join(' '), '...');
console.log(`oplosbaar met ${okSeeds}/40 seeds -> variatie tussen panelen mogelijk`);
console.log('Eis: geen twee VOLLE strekken boven elkaar + muizentrap ≤4, alle 6 rijen elke 6 lagen.');
