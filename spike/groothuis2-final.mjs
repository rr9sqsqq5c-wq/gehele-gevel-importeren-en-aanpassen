// WEGWERP — genereer een CONCRETE groothuis-2 wand die alle regels haalt en geef de leg-volgorde
// + de 6 malrijen terug (voor de rendering). Regels: om-en-om d/k start, trap <=4, geen twee VOLLE
// strekken pal boven elkaar, max 2 drieklezoren/rij (auto: alleen start/sluit), elke rij 2500mm.
//   node spike/groothuis2-final.mjs

const S = 210, stoot = 4, steenH = 50, lint = 10, lag = steenH + lint, TARGET = 2500;
const K = Math.round((S - stoot) / 2), D = Math.round((3 * S - stoot) / 4);
const W = { S, K, D };
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function genRow(startT, closerT, rng) {
  const closerW = W[closerT];
  for (let a = 0; a < 300; a++) { const codes = [{ t: startT, w: W[startT] }]; let lastT = startT, run = 1;
    while (true) { const used = codes.reduce((s, c) => s + c.w, 0); const pas = TARGET - used - closerW - (codes.length + 1) * stoot;
      if (pas <= 210 && pas >= 120) { codes.push({ t: 'P', w: pas }); codes.push({ t: closerT, w: closerW }); return codes; }
      if (pas < 120) break; const opts = ['S', 'K'].filter((t) => { if (t === lastT) { if (t === 'S' && run >= 4) return false; if (t === 'K' && run >= 2) return false; } return true; });
      const t = opts[Math.floor(rng() * opts.length)]; codes.push({ t, w: W[t] }); if (t === lastT) run++; else { lastT = t; run = 1; } } }
  return null;
}
const sig = (c) => c.map((x) => x.t === 'P' ? 's' : x.t.toLowerCase()).join(',');
const dCount = (c) => c.filter((x) => x.t === 'D').length;
function stripsOf(codes) { let x = 0; const st = []; for (const c of codes) { st.push({ a: x, b: x + c.w, full: c.t === 'S' }); x += c.w + stoot; } return st; }
function perpsOf(codes) { let x = 0; const ps = []; for (const c of codes) { x += c.w; ps.push(Math.round(x)); x += stoot; } ps.pop(); return ps; }
const tol = 7;
function strekStack(si, sj) { for (const x of si) { if (!x.full) continue; for (const y of sj) { if (!y.full) continue; if (Math.abs(x.a - y.a) < tol && Math.abs(x.b - y.b) < tol) return true; } } return false; }
function maxTrap(rowsP) { const G = rowsP.length; if (G < 2) return 1; const marks = rowsP.map((ps) => { const m = new Uint8Array(TARGET + 1); for (const j of ps) { const lo = Math.max(0, j - tol), hi = Math.min(TARGET, j + tol); for (let x = lo; x <= hi; x++) m[x] = 1; } return m; }); let max = 1; for (let g0 = 0; g0 < G - 1; g0++) for (const p of rowsP[g0]) for (const q of rowsP[g0 + 1]) { const st = q - p, a = Math.abs(st); if (a < 8 || a > 170) continue; let len = 1; for (let g = g0 + 1; g < G; g++) { const tx = p + st * (g - g0); if (tx < 0 || tx > TARGET || !marks[g][Math.round(tx)]) break; len++; } if (len > max) max = len; } return max; }

function pool(startT, closerT, n) { const m = new Map(); const rng = mulberry32(startT.charCodeAt(0) * 7 + closerT.charCodeAt(0)); for (let i = 0; i < n; i++) { const r = genRow(startT, closerT, rng); if (r) { const s = sig(r); if (!m.has(s)) m.set(s, { sig: s, codes: r, strips: stripsOf(r), perps: perpsOf(r), d: dCount(r) }); } } return [...m.values()]; }
// VASTE sluitsteen-regel: start drieklezoor -> sluit kop; start kop -> sluit drieklezoor.
// d-rijen: start D, sluit K (drieklezoor links). k-rijen: start K, sluit D (drieklezoor rechts).
// Elke rij precies 1 drieklezoor.
const Apool = pool('D', 'K', 80000);
const Bpool = pool('K', 'D', 80000);
console.log(`pools: A(d-start)=${Apool.length}  B(k-start)=${Bpool.length}`);

// backtracking om-en-om (rij0 = d-start), differ-from-last-1, ≤4, geen volle-strek-stapel, bias naar minst gebruikt
function buildWall(A, B, N, rng) {
  const rowsP = [], strips = [], order = []; const use = { A: [0,0,0], B: [0,0,0] };
  function bt(g, lastA, lastB) {
    if (g === N) return true;
    const useA = g % 2 === 0; const trip = useA ? A : B; const last = useA ? lastA : lastB; const u = useA ? use.A : use.B;
    const cand = [0, 1, 2].filter((i) => i !== last).sort((x, y) => (u[x] - u[y]) || (rng() - 0.5));
    for (const i of cand) { const r = trip[i]; const below = strips[strips.length - 1]; if (below && strekStack(below, r.strips)) continue;
      rowsP.push(r.perps); strips.push(r.strips);
      if (maxTrap(rowsP.slice(-6)) <= 4) { order.push((useA ? 'A' : 'B') + i); u[i]++; if (bt(g + 1, useA ? i : lastA, useA ? lastB : i)) return true; u[i]--; order.pop(); }
      rowsP.pop(); strips.pop();
    }
    return false;
  }
  return bt(0, -1, -1) ? { order, use } : null;
}

const rng = mulberry32(7); const rnd = (a) => a[Math.floor(rng() * a.length)];
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
let best = null, bestUsed = -1; const t0 = Date.now();
while (Date.now() - t0 < 40000) {
  const A = shuffle(Apool).slice(0, 3), B = shuffle(Bpool).slice(0, 3);
  if (new Set([...A, ...B].map((r) => r.sig)).size !== 6) continue;
  const w = buildWall(A, B, 40, mulberry32(1234));
  if (w) { const used = w.use.A.filter((c) => c > 0).length + w.use.B.filter((c) => c > 0).length; if (used > bestUsed) { bestUsed = used; best = { A, B, w }; } if (used >= 6) break; }
}
if (!best) { console.log('GEEN wand gevonden.'); process.exit(1); }
const { A, B, w } = best;
// verificatie van de hele wand
const wallP = w.order.map((o) => (o[0] === 'A' ? A : B)[+o[1]].perps);
const mt = maxTrap(wallP);
let strekOK = true; for (let g = 1; g < wallP.length; g++) { const r0 = (w.order[g-1][0]==='A'?A:B)[+w.order[g-1][1]]; const r1 = (w.order[g][0]==='A'?A:B)[+w.order[g][1]]; if (strekStack(r0.strips, r1.strips)) strekOK = false; }
console.log(`\n=== GROOTHUIS 2 — concrete wand (40 lagen) ===`);
console.log(`langste muizentrap = ${mt} banen   geen volle-strek-stapel: ${strekOK}   rijen gebruikt: ${bestUsed}/6`);
console.log('Triplet A (drieklezoor-start):'); A.forEach((r, i) => console.log(`  A${i}: ${r.sig}   (${r.d} drieklezoor)`));
console.log('Triplet B (kop-start):'); B.forEach((r, i) => console.log(`  B${i}: ${r.sig}   (${r.d} drieklezoor)`));
console.log('SIGS_A=' + JSON.stringify(A.map((r) => r.sig)));
console.log('SIGS_B=' + JSON.stringify(B.map((r) => r.sig)));
console.log('ORDER=' + JSON.stringify(w.order));
