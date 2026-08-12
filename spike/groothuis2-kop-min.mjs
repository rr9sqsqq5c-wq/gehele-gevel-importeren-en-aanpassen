// WEGWERP — minimum aantal KOPPEN per rij (en in het verband) bij max 4 strekken achter elkaar.
// Rij = start(D of K) + midden(S/K) + pasmaat-strek + sluitsteen(K of D, vaste regel: D->K, K->D).
// Elke rij 2500mm. Strek-run (incl. pasmaat) <= 4. Deel 1: geometrisch min koppen per rij-type.
// Deel 2: bestaat er een 6-rij om-en-om ≤4-wildverband met dat (lage) kop-aantal?
//   node spike/groothuis2-kop-min.mjs

const S = 210, stoot = 4, TARGET = 2500;
const K = Math.round((S - stoot) / 2), D = Math.round((3 * S - stoot) / 4);
const W = { S, K, D };

// Deel 1: DFS die het aantal koppen per rij MINIMALISEERT (max 4 strek achter elkaar).
// body = stenen tussen start en sluit; laatste body-steen = pasmaat-strek (variabele breedte 120..210).
function minKoppenRow(startT, closerT) {
  const startW = W[startT], closerW = W[closerT];
  let bestK = Infinity, bestSeq = null;
  // DFS: bouw midden-stenen (S/K). Op elk punt kunnen we afsluiten met pasmaat+sluit als de pasmaat
  // (= rest) in [120,210] valt en de strek-run-regel klopt.
  function dfs(seq, width, run, koppen) {
    if (koppen >= bestK) return; // prune
    // probeer af te sluiten: pasmaat = rest; pasmaat is een strek (telt mee in run)
    const nStones = 1 + seq.length + 1 + 1; // start + midden + pasmaat + sluit
    const pas = TARGET - startW - width - closerW - (nStones - 1) * stoot;
    if (pas >= 120 && pas <= 210) {
      // strek-run met pasmaat erbij: laatste run +1 (pasmaat=strek). sluit breekt de run.
      const runWithPas = run + 1;
      if (runWithPas <= 4) { if (koppen < bestK) { bestK = koppen; bestSeq = [startT, ...seq, 'P', closerT]; } }
    }
    if (seq.length > 20) return;
    // verder bouwen: strek (run+1<=4) of kop (reset run)
    if (run < 4) dfs([...seq, 'S'], width + S, run + 1, koppen);       // strek
    dfs([...seq, 'K'], width + K, 0, koppen + 1);                       // kop
  }
  // start D/K: D breekt run (run=0). K is geen strek, run=0 ook. (alleen strekken tellen in run)
  dfs([], 0, 0, 0);
  // koppen totaal = midden-koppen + (start==K) + (sluit==K)
  const edgeKop = (startT === 'K' ? 1 : 0) + (closerT === 'K' ? 1 : 0);
  return { koppen: bestK + edgeKop, midKoppen: bestK, seq: bestSeq };
}

const dRow = minKoppenRow('D', 'K'); // drieklezoor-start, kop-sluit
const kRow = minKoppenRow('K', 'D'); // kop-start, drieklezoor-sluit
console.log('=== Deel 1: geometrisch min koppen per rij (max 4 strek achter elkaar) ===');
console.log(`d-start rij (sluit kop):  min ${dRow.koppen} koppen  (${dRow.midKoppen} in midden + 1 sluit)  bv ${dRow.seq && dRow.seq.join(',')}`);
console.log(`k-start rij (sluit drkl): min ${kRow.koppen} koppen  (${kRow.midKoppen} in midden + 1 start)  bv ${kRow.seq && kRow.seq.join(',')}`);
console.log(`-> per 6-rij-herhaling (3 d + 3 k): min ${3 * dRow.koppen + 3 * kRow.koppen} koppen puur geometrisch\n`);

// Deel 2: levert dat lage kop-aantal ook een ≤4-muizentrap-wildverband op?
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function genRowMaxKop(startT, closerT, maxKop, rng) {
  const closerW = W[closerT];
  for (let a = 0; a < 400; a++) {
    const codes = [{ t: startT, w: W[startT] }]; let lastT = startT, run = startT === 'S' ? 1 : 0, kop = (startT === 'K' ? 1 : 0);
    let okk = true;
    while (true) {
      const used = codes.reduce((s, c) => s + c.w, 0); const pas = TARGET - used - closerW - (codes.length + 1) * stoot;
      if (pas >= 120 && pas <= 210 && run + 1 <= 4) { const totKop = kop + (closerT === 'K' ? 1 : 0); if (totKop <= maxKop) { codes.push({ t: 'P', w: pas }); codes.push({ t: closerT, w: closerW }); return codes; } okk = false; break; }
      if (pas < 120) { okk = false; break; }
      // kies steen: strek mag als run<4; kop mag als kop-budget over (reserve 1 voor sluit indien K)
      const canS = run < 4; const canK = kop + (closerT === 'K' ? 1 : 0) < maxKop;
      const opts = []; if (canS) opts.push('S'); if (canK) opts.push('K');
      if (!opts.length) { okk = false; break; }
      const t = opts[Math.floor(rng() * opts.length)]; codes.push({ t, w: W[t] });
      if (t === 'S') run++; else { run = 0; kop++; }
    }
  }
  return null;
}
const sig = (c) => c.map((x) => x.t === 'P' ? 's' : x.t.toLowerCase()).join(',');
function stripsOf(codes) { let x = 0; const st = []; for (const c of codes) { st.push({ a: x, b: x + c.w, full: c.t === 'S' }); x += c.w + stoot; } return st; }
function perpsOf(codes) { let x = 0; const ps = []; for (const c of codes) { x += c.w; ps.push(Math.round(x)); x += stoot; } ps.pop(); return ps; }
const kopCount = (c) => c.filter((x) => x.t === 'K').length;
const tol = 7;
function strekStack(si, sj) { for (const x of si) { if (!x.full) continue; for (const y of sj) { if (!y.full) continue; if (Math.abs(x.a - y.a) < tol && Math.abs(x.b - y.b) < tol) return true; } } return false; }
function maxTrap(rowsP) { const G = rowsP.length; if (G < 2) return 1; const marks = rowsP.map((ps) => { const m = new Uint8Array(TARGET + 1); for (const j of ps) { const lo = Math.max(0, j - tol), hi = Math.min(TARGET, j + tol); for (let x = lo; x <= hi; x++) m[x] = 1; } return m; }); let max = 1; for (let g0 = 0; g0 < G - 1; g0++) for (const p of rowsP[g0]) for (const q of rowsP[g0 + 1]) { const st = q - p, a = Math.abs(st); if (a < 8 || a > 170) continue; let len = 1; for (let g = g0 + 1; g < G; g++) { const tx = p + st * (g - g0); if (tx < 0 || tx > TARGET || !marks[g][Math.round(tx)]) break; len++; } if (len > max) max = len; } return max; }
function buildPool(startT, closerT, maxKop, n) { const m = new Map(); const rng = mulberry32(startT.charCodeAt(0) * 131 + closerT.charCodeAt(0) * 7 + maxKop); for (let i = 0; i < n; i++) { const r = genRowMaxKop(startT, closerT, maxKop, rng); if (r) { const s = sig(r); if (!m.has(s)) m.set(s, { sig: s, strips: stripsOf(r), perps: perpsOf(r), kop: kopCount(r) }); } } return [...m.values()]; }
function solvable(A, B, N, rng) { const rowsP = [], strips = []; function bt(g, la, lb) { if (g === N) return true; const useA = g % 2 === 0; const trip = useA ? A : B; const last = useA ? la : lb; const ord = [0, 1, 2].filter((i) => i !== last).sort(() => rng() - 0.5); for (const i of ord) { const r = trip[i]; const below = strips[strips.length - 1]; if (below && strekStack(below, r.strips)) continue; rowsP.push(r.perps); strips.push(r.strips); if (maxTrap(rowsP.slice(-6)) <= 4 && bt(g + 1, useA ? i : la, useA ? lb : i)) return true; rowsP.pop(); strips.pop(); } return false; } return bt(0, -1, -1); }

console.log('=== Deel 2: laagste kop-aantal/rij dat nog een ≤4 om-en-om-wildverband geeft ===');
for (let maxKop = Math.max(dRow.koppen, kRow.koppen); maxKop <= 7; maxKop++) {
  const Ap = buildPool('D', 'K', maxKop, 40000), Bp = buildPool('K', 'D', maxKop, 40000);
  if (Ap.length < 3 || Bp.length < 3) { console.log(`max ${maxKop} koppen/rij: te weinig rijen in pool (A=${Ap.length},B=${Bp.length})`); continue; }
  const rng = mulberry32(7); let found = null; const t0 = Date.now();
  while (Date.now() - t0 < 15000 && !found) {
    const sh = (a) => { const c = a.slice(); for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c; };
    const A = sh(Ap).slice(0, 3), B = sh(Bp).slice(0, 3);
    if (new Set([...A, ...B].map((r) => r.sig)).size !== 6) continue;
    if (solvable(A, B, 40, mulberry32(123))) found = { A, B };
  }
  if (found) {
    const tot = [...found.A, ...found.B].reduce((s, r) => s + r.kop, 0);
    console.log(`🟢 max ${maxKop} koppen/rij HAALBAAR (≤4) — totaal ${tot} koppen/6 rijen. Voorbeeld kop/rij: A=${found.A.map(r=>r.kop)} B=${found.B.map(r=>r.kop)}`);
    found.A.forEach((r,i)=>console.log(`   A${i}: ${r.sig}`)); found.B.forEach((r,i)=>console.log(`   B${i}: ${r.sig}`));
    break;
  } else console.log(`🔴 max ${maxKop} koppen/rij: geen ≤4-oplossing in 15s`);
}
