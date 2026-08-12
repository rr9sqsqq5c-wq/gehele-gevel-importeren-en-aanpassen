// WEGWERP — pick&place v6: bestaat er een geldige volgorde? De mal (triplet A=drieklezoor,
// B=kop) ligt klaar; de besturing rekent de laagvolgorde VOORAF uit met backtracking, zodat de
// hele wand: (1) d,k,d,k wisselt, (2) per laag 1 van de 3 rijen (geen directe herhaling),
// (3) nooit 2 gelijke strippen boven elkaar (geborgd door 9 schone A-B-paren), (4) nooit een
// muizentrap > 4. Eerst: bestaat zo'n volgorde voor een gegeven set? Zo ja: zoek de set die het
// makkelijkst lukt + toon een voorbeeldwand.
//   node spike/groothuis2-backtrack.mjs

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
// backtracking: vul N lagen; window-check (laatste 5 incl nieuw) <=4
function solveWall(A, B, N, rng) {
  const seq = []; const rows = []; let nodes = 0;
  const use = { A: [0, 0, 0], B: [0, 0, 0] };
  const LIMIT = Number(process.env.LIMIT || 4);
  function ok() { return maxTrap(rows.slice(-6)) <= LIMIT; }
  // differ-from-last-1 + bias naar de MINST gebruikte rij -> spreidt over alle 6 (variatie),
  // backtracking borgt ≤4.
  function bt(g, lastA, lastB) {
    if (g === N) return true;
    if (++nodes > 6_000_000) return false;
    const useA = g % 2 === 0; const trip = useA ? A : B; const last = useA ? lastA : lastB; const u = useA ? use.A : use.B;
    const order = [0, 1, 2].filter((i) => i !== last).sort((x, y) => (u[x] - u[y]) || (rng() - 0.5));
    for (const i of order) {
      rows.push(trip[i].perps); seq.push((useA ? 'A' : 'B') + (i + 1)); u[i]++;
      if (ok() && bt(g + 1, useA ? i : lastA, useA ? lastB : i)) return true;
      rows.pop(); seq.pop(); u[i]--;
    }
    return false;
  }
  const okFull = bt(0, -1, -1);
  return { ok: okFull, seq, rows: rows.slice(), nodes, use };
}

const rngP = mulberry32(2024); const Dpool = new Map(), Kpool = new Map();
for (let i = 0; i < 40000; i++) for (const [pool, st] of [[Dpool, 'D'], [Kpool, 'K']]) { const r = genRow(st, rngP); if (r) { const s = sig(r); if (!pool.has(s)) { const strips = stripsOf(r); pool.set(s, { sig: s, strips, perps: perpsOfStrips(strips) }); } } }
const DP = [...Dpool.values()].map((o, i) => ({ ...o, id: 'd' + i })), KP = [...Kpool.values()].map((o, i) => ({ ...o, id: 'k' + i }));
console.log(`pool: ${DP.length} d, ${KP.length} k`);
function feasible(A, B) { for (const a of A) for (const b of B) if (stackedEqual(a.strips, b.strips)) return false; return true; }
const rng = mulberry32(7); const rnd = (a) => a[Math.floor(rng() * a.length)];
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// zoek een set die een wand van 40 lagen oplost (bestaansvraag), liefst snel
let best = null, bestNodes = Infinity; const t0 = Date.now(); let tried = 0, solved = 0;
while (Date.now() - t0 < 50000) {
  tried++; const A = shuffle(DP).slice(0, 3), B = shuffle(KP).slice(0, 3);
  if (!feasible(A, B)) continue;
  const r = solveWall(A, B, 60, mulberry32(123 + tried));
  const all6 = r.ok && r.use.A.every((c) => c > 0) && r.use.B.every((c) => c > 0);
  if (all6) { solved++; if (r.nodes < bestNodes) { bestNodes = r.nodes; best = { A, B, seq: r.seq, use: r.use }; } if (solved >= 30) break; }
}
console.log(`geprobeerd: ${tried}, opgelost (40 lagen ≤4): ${solved}`);
if (!best) { console.log('GEEN set lost 40 lagen ≤4 op binnen budget.'); process.exit(1); }
const { A, B, seq } = best;
console.log(`\n=== MAL die oplosbaar is (≤4 over 40 lagen, ${bestNodes} nodes) ===`);
console.log('Triplet A (drieklezoor):'); A.forEach((r, i) => console.log(`  A${i + 1}: ${r.sig}`));
console.log('Triplet B (kop):'); B.forEach((r, i) => console.log(`  B${i + 1}: ${r.sig}`));
console.log('ARRAY_A:', JSON.stringify(A.map((r) => r.sig)));
console.log('ARRAY_B:', JSON.stringify(B.map((r) => r.sig)));
console.log('voorbeeld-volgorde (40 lagen):', seq.join(' '));
// hoeveel verschillende oplossingen? (variatie-indicatie) — tel snelle solves met andere seeds
let variants = 0; for (let s = 0; s < 40; s++) if (solveWall(A, B, 40, mulberry32(9000 + s)).ok) variants++;
console.log(`oplosbaar met ${variants}/40 random seeds -> ruimte voor paneel-tot-paneel variatie`);
