// WEGWERP — pick&place-model: de mal heeft 2 tripletten (A={r1,r2,r3}, B={r4,r5,r6}).
// De wand wordt in 3-rij-banden gelegd; per band kiest de unit een WILLEKEURIGE volgorde van
// het triplet. Banden wisselen A,B,A,B,... Vraag: helpt die wisselende volgorde tegen
// muizentrappen? Vergelijk vaste volgorde vs random, + zoek een goede 6-rij-set.
//   node spike/groothuis2-pickplace.mjs

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
const perpsOf = (c) => { let x = 0; const ps = []; for (const cc of c) { x += cc.w; ps.push(Math.round(x)); x += stoot; } ps.pop(); return ps; };
const tol = 7;
function maxTrap(perpRows, cap = 9) {
  const G = perpRows.length;
  const marks = perpRows.map((ps) => { const m = new Uint8Array(TARGET + 1); for (const j of ps) { const lo = Math.max(0, j - tol), hi = Math.min(TARGET, j + tol); for (let x = lo; x <= hi; x++) m[x] = 1; } return m; });
  let max = 0; for (let g0 = 0; g0 < G - 1 && max < cap; g0++) for (const p of perpRows[g0]) for (const q of perpRows[g0 + 1]) { const st = q - p, a = Math.abs(st); if (a < 8 || a > 170) continue; let len = 1; for (let g = g0 + 1; g < G; g++) { const tx = p + st * (g - g0); if (tx < 0 || tx > TARGET || !marks[g][Math.round(tx)]) break; len++; } if (len > max) max = len; } return max;
}
function shuffle(arr, rng) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// wand: nBands banden van 3, wisselend triplet A/B, per band random volgorde
function randomWall(A, B, nBands, rng) { const rows = []; for (let b = 0; b < nBands; b++) { const trip = b % 2 === 0 ? A : B; for (const r of shuffle(trip, rng)) rows.push(r.perps); } return rows; }
function fixedWall(A, B, nBands) { const rows = []; for (let b = 0; b < nBands; b++) { const trip = b % 2 === 0 ? A : B; for (const r of trip) rows.push(r.perps); } return rows; }

function mc(A, B, walls, nBands, rng) {
  const res = []; for (let i = 0; i < walls; i++) res.push(maxTrap(randomWall(A, B, nBands, rng)));
  res.sort((a, b) => a - b);
  const pct = (p) => res[Math.min(res.length - 1, Math.floor(p * res.length))];
  const hist = {}; for (const v of res) hist[v] = (hist[v] || 0) + 1;
  return { p50: pct(0.5), p95: pct(0.95), worst: res[res.length - 1], hist };
}

const rngP = mulberry32(2024); const pool = new Map();
for (let i = 0; i < 30000; i++) { const r = genRow(rngP); if (r) { const s = sig(r); if (!pool.has(s)) pool.set(s, perpsOf(r)); } }
const POOL = [...pool.entries()].map(([s, perps], i) => ({ id: i, sig: s, perps }));
console.log(`pool: ${POOL.length} rijen`);

// zoek 6 rijen (2 tripletten) die de random-volgorde-muur schoon houden (min p95, dan worst)
const rng = mulberry32(7); const rnd = (a) => a[Math.floor(rng() * a.length)];
function score(A, B) { const m = mc(A, B, 120, 20, mulberry32(31)); return { s: m.p95 * 100 + m.worst * 10 + m.p50, m }; }
let best = null, bestScore = Infinity, bestM = null; const t0 = Date.now();
for (let r = 0; r < 4000; r++) {
  let six = shuffle(POOL, rng).slice(0, 6); let A = six.slice(0, 3), B = six.slice(3);
  let cur = score(A, B);
  for (let step = 0; step < 60; step++) { const all = [...A, ...B]; const i = Math.floor(rng() * 6); const cand = all.slice(); cand[i] = rnd(POOL); if (new Set(cand.map((x) => x.id)).size !== 6) continue; const nA = cand.slice(0, 3), nB = cand.slice(3); const v = score(nA, nB); if (v.s <= cur.s) { A = nA; B = nB; cur = v; } }
  if (cur.s < bestScore) { bestScore = cur.s; best = { A, B }; bestM = cur.m; }
  if (bestM.worst <= 4) break;
  if (Date.now() - t0 > 45000) { console.log(`(time-box na ${r})`); break; }
}

const { A, B } = best;
// grondige eindmeting
const fin = mc(A, B, 4000, 26, mulberry32(777));
const fixedMax = maxTrap(fixedWall(A, B, 26));
console.log(`\n=== BESTE 6-RIJ-SET (2 tripletten) ===`);
console.log('Triplet A:'); A.forEach((r, i) => console.log(`  A${i + 1}: ${r.sig}`));
console.log('Triplet B:'); B.forEach((r, i) => console.log(`  B${i + 1}: ${r.sig}`));
console.log('ARRAY_A:', JSON.stringify(A.map((r) => r.sig)));
console.log('ARRAY_B:', JSON.stringify(B.map((r) => r.sig)));
console.log(`\nVASTE volgorde (geen variatie): langste trap = ${fixedMax} banen`);
console.log(`WISSELENDE volgorde (4000 muren, 26 banden): p50=${fin.p50}  p95=${fin.p95}  WORST=${fin.worst} banen`);
console.log('histogram langste-trap per muur:', JSON.stringify(fin.hist));
