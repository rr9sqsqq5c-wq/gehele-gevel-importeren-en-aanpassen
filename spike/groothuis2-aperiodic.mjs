// WEGWERP — APERIODISCH kolomvrij groothuis 2. 6-rij mal (3 drieklezoor-start + 3 kop-start),
// om-en-om d/k begin én eind (sluitsteen-regel). Pick-and-place wisselt de volgorde (NIET strikt
// repeterend) zo dat MIDDENkoppen nooit binnen 4 lagen op dezelfde x terugkomen -> geen doorlopende
// kop-kolommen. De randkoppen (kop-rij links, drieklezoor-rij rechts) blijven (gedwongen door de
// om-en-om-begin/eind-regel). Max 5 strek achter elkaar, 3 koppen/rij, muizentrap ≤6.
//   node spike/groothuis2-aperiodic.mjs
const S = 210, stoot = 4, TARGET = 2500;
const K = Math.round((S - stoot) / 2), D = Math.round((3 * S - stoot) / 4);
const W = { S, K, D };
const TRAPLIM = 6, KOPTOL = 50, MAXKOP = Number(process.env.MAXKOP || 4), NPER = Number(process.env.NPER || 5);
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
// VERDEELDE generator: strek-groepen met tussen elke groep 1 kop. De EERSTE groep mag 0 zijn →
// een kop mag direct na de start-drieklezoor/-kop komen. nMid midden-koppen + 1 rand-kop.
function genRow(startT, closerT, rng) {
  const closerW = W[closerT];
  const nMid = MAXKOP - 1; // 1 rand-kop (start-K bij kop-rij, sluit-K bij drieklezoor-rij)
  for (let a = 0; a < 600; a++) {
    const groups = [];
    for (let i = 0; i <= nMid; i++) groups.push(i === 0 ? Math.floor(rng() * 4) : Math.floor(rng() * 6)); // g0:0..3, rest:0..5 (groter/diverser)
    const types = [startT];
    for (let i = 0; i <= nMid; i++) { for (let j = 0; j < groups[i]; j++) types.push('S'); if (i < nMid) types.push('K'); }
    if (types[types.length - 1] !== 'S') types.push('S'); // pasmaat = laatste strek
    const pasIdx = types.length - 1;
    let fixed = closerW; for (let i = 0; i < types.length; i++) if (i !== pasIdx) fixed += W[types[i]];
    const pas = TARGET - fixed - types.length * stoot; // types.length+1 stenen -> types.length voegen
    if (pas < 90 || pas > 210) continue;
    const codes = types.map((t, i) => ({ t, w: i === pasIdx ? pas : W[t], pas: i === pasIdx }));
    codes.push({ t: closerT, w: closerW });
    let run = 0, ok = true; for (const c of codes) { if (c.t === 'S') { if (++run > 5) { ok = false; break; } } else run = 0; }
    if (ok) return codes;
  }
  return null;
}
const sig = (c) => c.map((x) => x.t === 'P' ? 's' : x.t.toLowerCase()).join(',');
const kopN = (c) => c.filter((x) => x.t === 'K').length;
function perpsOf(codes) { let x = 0; const ps = []; for (const c of codes) { x += c.w; ps.push(Math.round(x)); x += stoot; } ps.pop(); return ps; }
function fss(codes) { let x = 0; const st = []; for (const c of codes) { st.push({ a: x, b: x + c.w, full: c.t === 'S' && !c.pas }); x += c.w + stoot; } return st; }
// MIDDEN-koppen: alle koppen behalve de rand-kop (start-K bij kop-rij, sluit-K bij drieklezoor-rij)
function midKopX(codes, startT, closerT) {
  let x = 0; const ks = [];
  for (let i = 0; i < codes.length; i++) { const c = codes[i];
    const isEdge = (startT === 'K' && i === 0) || (closerT === 'K' && i === codes.length - 1);
    if (c.t === 'K' && !isEdge) ks.push(x + c.w / 2);
    x += c.w + stoot;
  }
  return ks;
}
function strekStack(si, sj) { for (const x of si) { if (!x.full) continue; for (const y of sj) { if (!y.full) continue; if (Math.abs(x.a - y.a) < 7 && Math.abs(x.b - y.b) < 7) return true; } } return false; }
function maxTrap(rowsP) { const G = rowsP.length; if (G < 2) return 1; let max = 1; for (let g0 = 0; g0 < G - 1; g0++) for (const p of rowsP[g0]) for (const q of rowsP[g0 + 1]) { const st = q - p, a = Math.abs(st); if (a < 8 || a > 170) continue; let len = 1; for (let g = g0 + 1; g < G; g++) { const tx = p + st * (g - g0); if (rowsP[g].some((v) => Math.abs(v - tx) < 7)) len++; else break; } if (len > max) max = len; } return max; }

function genPool(startT, closerT, n) { const m = new Map(); const rng = mulberry32(startT.charCodeAt(0) * 31 + closerT.charCodeAt(0)); for (let i = 0; i < n; i++) { const r = genRow(startT, closerT, rng); if (r) { const s = sig(r); if (!m.has(s)) m.set(s, { sig: s, perps: perpsOf(r), fss: fss(r), mkx: midKopX(r, startT, closerT), kop: kopN(r) }); } } return [...m.values()]; }
const Dp = genPool('D', 'K', 80000), Kp = genPool('K', 'D', 80000);
console.log(`pools: d=${Dp.length} k=${Kp.length}`);

// aperiodische solver: om-en-om, geen full-strek-stapel, midden-kop max 1×/4 lagen op zelfde x,
// muizentrap ≤6, willekeurige keuze (aperiodisch), alle 6 rijen.
// VOORWAARTSE willekeurige wandeling (geen backtracking die periodiek invult). Dood spoor -> null.
// kolom-regel: midden-kop niet aangrenzend + geen zelfde x binnen de laatste WIN lagen.
const WIN = Number(process.env.WIN || 4);
function solve(A, B, N, rng) {
  const rowsP = [], fssH = [], mkxH = [], order = []; const use = { A: Array(NPER).fill(0), B: Array(NPER).fill(0) };
  function kopViolate(newMkx) { const n = mkxH.length; for (const x of newMkx) for (let w = 1; w <= WIN; w++) if (n - w >= 0 && mkxH[n - w].some((v) => Math.abs(v - x) < KOPTOL)) return true; return false; }
  let lastA = -1, lastB = -1;
  for (let g = 0; g < N; g++) {
    const useA = g % 2 === 0; const trip = useA ? A : B; const last = useA ? lastA : lastB;
    const cand = Array.from({ length: NPER }, (_, i) => i).filter((i) => i !== last).sort(() => rng() - 0.5);
    let placed = -1;
    for (const i of cand) {
      const r = trip[i];
      if (fssH.length && strekStack(fssH[fssH.length - 1], r.fss)) continue;
      if (kopViolate(r.mkx)) continue;
      if (rowsP.length && maxTrap(rowsP.slice(-7).concat([r.perps])) > TRAPLIM) continue;
      placed = i; rowsP.push(r.perps); fssH.push(r.fss); mkxH.push(r.mkx); order.push((useA ? 'A' : 'B') + i); use[useA ? 'A' : 'B'][i]++;
      break;
    }
    if (placed < 0) return null; // dood spoor
    if (useA) lastA = placed; else lastB = placed;
  }
  return { order, use };
}
const rng = mulberry32(7); const sh = (a) => { const c = a.slice(); for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c; };
// de 3 rijen van een triplet moeten hun MIDDEN-koppen op verschillende x hebben (geen enkele x
// gedeeld door 2 rijen) -> geen kolom mogelijk. Ook: niet alle 3 dezelfde 2e steen (verdeel).
// 2e steen niet in alle rijen gelijk (verdeel de koppen ook vlak na de start)
function tripletDiverse(rows) { const second = rows.map((r) => r.sig.split(',')[1]); return !second.every((x) => x === second[0]); }
let best = null; const t0 = Date.now(); let tried = 0, solved = 0;
outer: while (Date.now() - t0 < 50000) {
  tried++; const A = sh(Dp).slice(0, NPER), B = sh(Kp).slice(0, NPER);
  if (A.length < NPER || B.length < NPER || !tripletDiverse(A) || !tripletDiverse(B)) continue;
  for (let s = 0; s < 300; s++) { // meerdere willekeurige wandelingen per triplet
    const r = solve(A, B, 30, mulberry32(9000 + tried * 300 + s));
    const usedA = r ? r.use.A.filter((c) => c > 0).length : 0, usedB = r ? r.use.B.filter((c) => c > 0).length : 0;
    if (r && usedA >= NPER - 1 && usedB >= NPER - 1) { solved++; best = { A, B, order: r.order }; break outer; }
  }
}
console.log(`config MAXKOP=${MAXKOP} KOPTOL=${KOPTOL}  geprobeerd ${tried}, opgelost (aperiodisch, kolomvrij): ${solved}`);
if (!best) { console.log('GEEN'); process.exit(1); }
const { A, B, order } = best;
const wallP = order.map((o) => (o[0] === 'A' ? A : B)[+o[1]].perps);
const wallMkx = order.map((o) => (o[0] === 'A' ? A : B)[+o[1]].mkx);
let win4 = 0; for (let g = 0; g < wallMkx.length; g++) for (const x of wallMkx[g]) { let c = 0; for (let h = g; h < Math.min(wallMkx.length, g + 4); h++) if (wallMkx[h].some((v) => Math.abs(v - x) < KOPTOL)) c++; if (c > win4) win4 = c; }
console.log(`\nmuizentrap = ${maxTrap(wallP)}   midden-koppen op x per 4 lagen (max) = ${win4}  (=1 => kolomvrij)`);
console.log('SIGS_A=' + JSON.stringify(A.map((r) => r.sig)) + '  kop/rij ' + A.map((r) => r.kop));
console.log('SIGS_B=' + JSON.stringify(B.map((r) => r.sig)) + '  kop/rij ' + B.map((r) => r.kop));
console.log('ORDER=' + JSON.stringify(order));
