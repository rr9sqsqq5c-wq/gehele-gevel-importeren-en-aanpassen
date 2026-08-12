// WEGWERP — minimaal aantal drieklezoren voor een 6-rij om-en-om wildverband met trap <= 4.
// Om-en-om => 3 rijen starten met drieklezoor (D), 3 met kop (K). Elke rij sluit met een hele
// steen (sluitsteen) + pasmaat-strek ervoor. Drieklezoor-telling per rij = (start==D) + (closer==D)
// (geen drieklezoor in het midden). Totaal D = 3 (de 3 startstenen) + #drieklezoor-sluitstenen.
// We testen oplopend: kan trap<=4 met 0 d-sluitstenen (totaal 3)? zo niet 1 (totaal 4)? enz.
//   node spike/groothuis2-drieklezoor-min.mjs

const S = 210, stoot = 4, TARGET = 2500;
const K = Math.round((S - stoot) / 2), D = Math.round((3 * S - stoot) / 4);
const W = { S, K, D };
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
// rij met gegeven start en sluitsteen-type; geen drieklezoor in het midden (alleen S/K)
function genRow(startT, closerT, rng) {
  const closerW = W[closerT];
  for (let a = 0; a < 300; a++) { const codes = [{ t: startT, w: W[startT] }]; let lastT = startT, run = 1;
    while (true) { const used = codes.reduce((s, c) => s + c.w, 0); const pas = TARGET - used - closerW - (codes.length + 1) * stoot;
      if (pas <= 210 && pas >= 110) { codes.push({ t: 'P', w: pas }); codes.push({ t: closerT, w: closerW }); return codes; }
      if (pas < 110) break; const opts = ['S', 'K'].filter((t) => { if (t === lastT) { if (t === 'S' && run >= 4) return false; if (t === 'K' && run >= 2) return false; } return true; });
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

// pools per (start,closer)
function buildPool(startT, closerT, n) { const m = new Map(); const rng = mulberry32(99); for (let i = 0; i < n; i++) { const r = genRow(startT, closerT, rng); if (r) { const s = sig(r); if (!m.has(s)) m.set(s, { sig: s, strips: stripsOf(r), perps: perpsOf(r), d: dCount(r) }); } } return [...m.values()]; }
const dK = buildPool('D', 'K', 60000); // d-start, kop-sluit  -> 1 drieklezoor
const dD = buildPool('D', 'D', 60000); // d-start, drieklezoor-sluit -> 2
const kK = buildPool('K', 'K', 60000); // k-start, kop-sluit  -> 0 drieklezoor
const kD = buildPool('K', 'D', 60000); // k-start, drieklezoor-sluit -> 1
console.log(`pools: dK=${dK.length} dD=${dD.length} kK=${kK.length} kD=${kD.length}`);

// om-en-om backtracking (rij 0 = d-start, rij1 = k-start, ...), differ-from-last-1, ≤4, geen strek-stapel
function solvable(Arows, Brows, N, rng) {
  const rowsP = [], strips = [];
  function bt(g, lastA, lastB) {
    if (g === N) return true;
    const useA = g % 2 === 0; const trip = useA ? Arows : Brows; const last = useA ? lastA : lastB;
    const order = [0, 1, 2].filter((i) => i !== last).sort(() => rng() - 0.5);
    for (const i of order) { const r = trip[i]; const below = strips[strips.length - 1]; if (below && strekStack(below, r.strips)) continue; rowsP.push(r.perps); strips.push(r.strips); if (maxTrap(rowsP.slice(-6)) <= 4 && bt(g + 1, useA ? i : lastA, useA ? lastB : i)) return true; rowsP.pop(); strips.pop(); }
    return false;
  }
  return bt(0, -1, -1);
}

// test een budget: kies samenstelling van A (3 d-start) en B (3 k-start) met gegeven #d-sluitstenen
let lastTries = 0;
function testBudget(nDcloser) {
  // verdeel d-sluitstenen over de 6 rijen: kies hoeveel d-start rijen met d-sluit (rest k-sluit)
  // en hoeveel k-start rijen met d-sluit. totaal d-sluit = nDcloser.
  const rng = mulberry32(7);
  const t0 = Date.now(); lastTries = 0;
  while (Date.now() - t0 < 25000) {
    lastTries++;
    for (let dAd = 0; dAd <= Math.min(3, nDcloser); dAd++) { const dBd = nDcloser - dAd; if (dBd > 3) continue;
      // A: dAd rijen uit dD, (3-dAd) uit dK ; B: dBd rijen uit kD, (3-dBd) uit kK
      const pick = (pool, k) => { const s = []; const used = new Set(); while (s.length < k) { const r = pool[Math.floor(rng() * pool.length)]; if (!used.has(r.sig)) { used.add(r.sig); s.push(r); } } return s; };
      const A = [...pick(dD, dAd), ...pick(dK, 3 - dAd)];
      const B = [...pick(kD, dBd), ...pick(kK, 3 - dBd)];
      if (new Set([...A, ...B].map((r) => r.sig)).size !== 6) continue;
      if (solvable(A, B, 40, mulberry32(123))) {
        const total = A.reduce((s, r) => s + r.d, 0) + B.reduce((s, r) => s + r.d, 0);
        return { A, B, total };
      }
    }
  }
  return null;
}

for (let nDcloser = 0; nDcloser <= 3; nDcloser++) {
  const res = testBudget(nDcloser);
  const total = 3 + nDcloser;
  if (res) {
    console.log(`\n🟢 HAALBAAR met ${total} drieklezoren (3 starts + ${nDcloser} sluitstenen) — trap ≤4, om-en-om`);
    console.log('Rij 1 (d):', res.A[0].sig); console.log('Rij 2 (k):', res.B[0].sig); console.log('Rij 3 (d):', res.A[1].sig);
    console.log('Rij 4 (k):', res.B[1].sig); console.log('Rij 5 (d):', res.A[2].sig); console.log('Rij 6 (k):', res.B[2].sig);
    console.log(`drieklezoren per rij: A=${res.A.map((r) => r.d)} B=${res.B.map((r) => r.d)}  -> totaal ${res.total}`);
    break;
  } else {
    console.log(`🔴 ${total} drieklezoren (${nDcloser} d-sluitstenen): geen ≤4-oplossing in ${lastTries} sets`);
  }
}
