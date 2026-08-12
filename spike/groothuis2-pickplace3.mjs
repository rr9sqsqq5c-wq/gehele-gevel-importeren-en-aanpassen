// WEGWERP — pick&place v3: eis "nooit twee GELIJKE strippen pal boven elkaar".
// Realistisch model: binnen een triplet mag de unit ELKE volgorde pakken -> daarom moeten de
// 3 paren BINNEN elk triplet vrij van gelijke-strip-overlap zijn (any order veilig). Op de
// band-naad kiest de besturing een geldige aansluiting (elke A-rij heeft >=1 passende B-rij en
// omgekeerd), dus daar nooit een gelijke strip. Doel: langste muizentrap <= 4 (liefst <=3).
//   node spike/groothuis2-pickplace3.mjs

const S = 210, stoot = 4, steenH = 50, TARGET = 2500;
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
function stripsOf(codes) { let x = 0; const st = []; for (const c of codes) { st.push({ a: x, b: x + c.w, t: c.t === 'P' ? 'S' : c.t }); x += c.w + stoot; } return st; }
function perpsOfStrips(strips) { const ps = strips.map((s) => Math.round(s.b)); ps.pop(); return ps; }
const tol = 7;
function stackedEqual(si, sj) { for (const x of si) for (const y of sj) if (x.t === y.t && Math.abs(x.a - y.a) < tol && Math.abs(x.b - y.b) < tol) return true; return false; }
function maxTrap(perpRows, cap = 9) {
  const G = perpRows.length;
  const marks = perpRows.map((ps) => { const m = new Uint8Array(TARGET + 1); for (const j of ps) { const lo = Math.max(0, j - tol), hi = Math.min(TARGET, j + tol); for (let x = lo; x <= hi; x++) m[x] = 1; } return m; });
  let max = 0; for (let g0 = 0; g0 < G - 1 && max < cap; g0++) for (const p of perpRows[g0]) for (const q of perpRows[g0 + 1]) { const st = q - p, a = Math.abs(st); if (a < 8 || a > 170) continue; let len = 1; for (let g = g0 + 1; g < G; g++) { const tx = p + st * (g - g0); if (tx < 0 || tx > TARGET || !marks[g][Math.round(tx)]) break; len++; } if (len > max) max = len; } return max;
}
function shuffle(arr, rng) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// besturing: leg banden A,B,A,..; binnen band willekeurige volgorde; zorg dat eerste rij van de
// band niet gelijk-stapelt met de vorige rij (kies passende start). Geeft null bij dead-end.
function buildWall(A, B, EQ, nBands, rng) {
  const rows = []; let prev = -1;
  for (let b = 0; b < nBands; b++) {
    const trip = b % 2 === 0 ? A : B;
    let order = shuffle(trip, rng);
    if (prev >= 0 && EQ[order[0].idx][prev]) { // herschik zodat start past
      const ok = order.find((r) => !EQ[r.idx][prev]); if (!ok) return null; order = [ok, ...order.filter((r) => r !== ok)];
    }
    for (const r of order) { rows.push(r.perps); prev = r.idx; }
  }
  return rows;
}

const rngP = mulberry32(2024); const pool = new Map();
for (let i = 0; i < 60000; i++) { const r = genRow(rngP); if (r) { const s = sig(r); if (!pool.has(s)) { const strips = stripsOf(r); pool.set(s, { sig: s, strips, perps: perpsOfStrips(strips) }); } } }
const POOL = [...pool.values()].map((o, i) => ({ ...o, id: i }));
console.log(`pool: ${POOL.length} rijen`);

// hard: binnen elk triplet alle 3 paren vrij van gelijke-strip-overlap; cross: elke A>=1 B en omgekeerd
function feasible(A, B) {
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) { if (stackedEqual(A[i].strips, A[j].strips)) return false; if (stackedEqual(B[i].strips, B[j].strips)) return false; }
  for (const a of A) { if (!B.some((b) => !stackedEqual(a.strips, b.strips))) return false; }
  for (const b of B) { if (!A.some((a) => !stackedEqual(a.strips, b.strips))) return false; }
  return true;
}
function EQmatrix(six) { const E = six.map(() => []); for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) E[i][j] = i !== j && stackedEqual(six[i].strips, six[j].strips); return E; }

const rng = mulberry32(7); const rnd = (a) => a[Math.floor(rng() * a.length)];
function evalSet(A, B) {
  const six = [...A, ...B]; six.forEach((r, i) => r.idx = i); const E = EQmatrix(six);
  let worst = 0, fails = 0; const R = mulberry32(31);
  for (let w = 0; w < 150; w++) { const wall = buildWall(A, B, E, 20, R); if (!wall) { fails++; continue; } const m = maxTrap(wall); if (m > worst) worst = m; }
  return { worst, fails };
}

let best = null, bestScore = Infinity, bestM = null; const t0 = Date.now(); let tried = 0, feas = 0;
while (Date.now() - t0 < 55000) {
  tried++; const six = shuffle(POOL, rng).slice(0, 6); const A = six.slice(0, 3), B = six.slice(3);
  if (!feasible(A, B)) continue; feas++;
  let curA = A, curB = B, cur = evalSet(A, B); let curScore = cur.fails * 1000 + cur.worst;
  for (let step = 0; step < 40; step++) { const all = [...curA, ...curB]; const i = Math.floor(rng() * 6); const cand = all.slice(); cand[i] = rnd(POOL); if (new Set(cand.map((x) => x.id)).size !== 6) continue; const nA = cand.slice(0, 3), nB = cand.slice(3); if (!feasible(nA, nB)) continue; const v = evalSet(nA, nB); const vs = v.fails * 1000 + v.worst; if (vs <= curScore) { curA = nA; curB = nB; cur = v; curScore = vs; } }
  if (curScore < bestScore) { bestScore = curScore; best = { A: curA, B: curB }; bestM = cur; }
  if (bestM.fails === 0 && bestM.worst <= 3) break;
}
console.log(`geprobeerd: ${tried}, haalbaar (no-equal binnen triplet + cross): ${feas}`);
if (!best) { console.log('GEEN haalbare set gevonden.'); process.exit(1); }

const { A, B } = best; const six = [...A, ...B]; six.forEach((r, i) => r.idx = i); const E = EQmatrix(six);
let worst = 0, fails = 0; const R = mulberry32(777);
for (let w = 0; w < 6000; w++) { const wall = buildWall(A, B, E, 26, R); if (!wall) { fails++; continue; } const m = maxTrap(wall); if (m > worst) worst = m; }
console.log(`\n=== BESTE 6-RIJ-SET (geen gelijke strip boven elkaar) ===`);
console.log('Triplet A:'); A.forEach((r, i) => console.log(`  A${i + 1}: ${r.sig}`));
console.log('Triplet B:'); B.forEach((r, i) => console.log(`  B${i + 1}: ${r.sig}`));
console.log('ARRAY_A:', JSON.stringify(A.map((r) => r.sig)));
console.log('ARRAY_B:', JSON.stringify(B.map((r) => r.sig)));
console.log(`\n6000 muren: dead-ends=${fails}, langste muizentrap (worst) = ${worst} banen`);
console.log('binnen elk triplet: élke volgorde veilig (geen gelijke strip). Naad: besturing kiest passende aansluiting.');
