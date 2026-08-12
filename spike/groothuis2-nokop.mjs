// WEGWERP — herzoek groothuis-2 mal: GEEN kop-kolommen (koppen niet boven elkaar), muizentrap ≤6
// (versoepeld op verzoek). Overige regels blijven: om-en-om d/k, sluitsteen-regel (D->K, K->D),
// 1 drieklezoor/rij, max 4 strek, geen volle-strek-stapel. Kop-kolom = kop die (binnen KOPTOL)
// recht boven een kop in de vorige 1 OF 2 lagen staat -> verboden. Alle 6 rijen gebruiken.
//   node spike/groothuis2-nokop.mjs
const S = 210, stoot = 4, TARGET = 2500;
const K = Math.round((S - stoot) / 2), D = Math.round((3 * S - stoot) / 4);
const W = { S, K, D };
const TRAPLIM = Number(process.env.TRAPLIM || 6), KOPTOL = Number(process.env.KOPTOL || 40); // trap-limiet + kop-align-tolerantie (mm)
// KOP-REGEL: koppen mogen binnen een venster van 4 lagen hooguit 1× boven elkaar (op ~zelfde x),
// en dan met minstens 1 laag ertussen (nooit pal aangrenzend). Dus: max 2 koppen op zelfde x in
// elke 4 opeenvolgende lagen, en geen kop-align in de direct aangrenzende laag.
function kopViolate(kxHist, newKx) {
  const n = kxHist.length;
  for (const x of newKx) {
    if (n >= 1 && kxHist[n - 1].some((v) => Math.abs(v - x) < KOPTOL)) return true; // aangrenzend verboden
    let c = 0; for (let w = 1; w <= 3; w++) if (n - w >= 0 && kxHist[n - w].some((v) => Math.abs(v - x) < KOPTOL)) c++;
    if (c >= 2) return true; // zou 3e kop op x binnen 4-lagen-venster zijn
  }
  return false;
}
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const MAXKOP = Number(process.env.MAXKOP || 4);
function genRow(startT, closerT, rng) {
  const closerW = W[closerT];
  for (let a = 0; a < 600; a++) {
    const codes = [{ t: startT, w: W[startT] }];
    let sRun = startT === 'S' ? 1 : 0, kRun = startT === 'K' ? 1 : 0, kop = startT === 'K' ? 1 : 0;
    while (true) {
      const used = codes.reduce((s, c) => s + c.w, 0); const pas = TARGET - used - closerW - (codes.length + 1) * stoot;
      if (pas >= 120 && pas <= 210 && sRun + 1 <= 4 && kop + (closerT === 'K' ? 1 : 0) <= MAXKOP) { codes.push({ t: 'P', w: pas }); codes.push({ t: closerT, w: closerW }); return codes; }
      if (pas < 120) break;
      const canS = sRun < 4, canK = kRun < 2 && kop + (closerT === 'K' ? 1 : 0) < MAXKOP;
      const opts = []; if (canS) opts.push('S'); if (canK) opts.push('K');
      if (!opts.length) break;
      const t = opts[Math.floor(rng() * opts.length)]; codes.push({ t, w: W[t] });
      if (t === 'S') { sRun++; kRun = 0; } else { kRun++; sRun = 0; kop++; }
    }
  }
  return null;
}
const sig = (c) => c.map((x) => x.t === 'P' ? 's' : x.t.toLowerCase()).join(',');
function strips(codes) { let x = 0; const full = [], kopX = []; for (const c of codes) { if (c.t === 'S' && c.t !== 'P') full.push({ a: x, b: x + c.w, real: !c.pas }); if (c.t === 'K') kopX.push(x + c.w / 2); x += c.w + stoot; } return { full, kopX }; }
function perpsOf(codes) { let x = 0; const ps = []; for (const c of codes) { x += c.w; ps.push(Math.round(x)); x += stoot; } ps.pop(); return ps; }
function fullStrekStrips(codes) { let x = 0; const st = []; for (const c of codes) { st.push({ a: x, b: x + c.w, full: c.t === 'S' && !c.pas }); x += c.w + stoot; } return st; }
const kopXs = (codes) => { let x = 0; const ks = []; for (const c of codes) { if (c.t === 'K') ks.push(x + c.w / 2); x += c.w + stoot; } return ks; };
function strekStack(si, sj) { for (const x of si) { if (!x.full) continue; for (const y of sj) { if (!y.full) continue; if (Math.abs(x.a - y.a) < 7 && Math.abs(x.b - y.b) < 7) return true; } } return false; }
function kopAlign(kA, kB) { for (const a of kA) for (const b of kB) if (Math.abs(a - b) < KOPTOL) return true; return false; }
function maxTrap(rowsP) { const G = rowsP.length; if (G < 2) return 1; let max = 1; for (let g0 = 0; g0 < G - 1; g0++) for (const p of rowsP[g0]) for (const q of rowsP[g0 + 1]) { const st = q - p, a = Math.abs(st); if (a < 8 || a > 170) continue; let len = 1; for (let g = g0 + 1; g < G; g++) { const tx = p + st * (g - g0); if (rowsP[g].some((v) => Math.abs(v - tx) < 7)) len++; else break; } if (len > max) max = len; } return max; }

function genPool(startT, closerT, n) { const m = new Map(); const rng = mulberry32(startT.charCodeAt(0) * 31 + closerT.charCodeAt(0)); for (let i = 0; i < n; i++) { const r = genRow(startT, closerT, rng); if (r) { const s = sig(r); if (!m.has(s)) m.set(s, { sig: s, perps: perpsOf(r), fss: fullStrekStrips(r), kx: kopXs(r) }); } } return [...m.values()]; }
const Dp = genPool('D', 'K', 60000), Kp = genPool('K', 'D', 60000);
console.log(`pools: d=${Dp.length} k=${Kp.length}`);

// solver: om-en-om, geen full-strek-stapel, geen kop-align binnen KOPWIN lagen, trap ≤TRAPLIM, alle 6
function solve(A, B, N, rng) {
  const rowsP = [], fss = [], kx = [], order = []; const use = { A: [0,0,0], B: [0,0,0] };
  function bt(g, lastA, lastB) {
    if (g === N) return true;
    const useA = g % 2 === 0; const trip = useA ? A : B; const last = useA ? lastA : lastB; const u = useA ? use.A : use.B;
    const cand = [0, 1, 2].filter((i) => i !== last).sort((x, y) => (u[x] - u[y]) || (rng() - 0.5));
    for (const i of cand) {
      const r = trip[i];
      if (fss.length && strekStack(fss[fss.length - 1], r.fss)) continue;
      if (kopViolate(kx, r.kx)) continue;
      rowsP.push(r.perps); fss.push(r.fss); kx.push(r.kx); order.push((useA ? 'A' : 'B') + i);
      if (maxTrap(rowsP.slice(-7)) <= TRAPLIM) { u[i]++; if (bt(g + 1, useA ? i : lastA, useA ? lastB : i)) return true; u[i]--; }
      rowsP.pop(); fss.pop(); kx.pop(); order.pop();
    }
    return false;
  }
  return bt(0, -1, -1) ? { order, use } : null;
}

const rng = mulberry32(7); const sh = (a) => { const c = a.slice(); for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c; };
let best = null, bestUsed = -1; const t0 = Date.now(); let tried = 0, solved = 0;
while (Date.now() - t0 < 50000) {
  tried++; const A = sh(Dp).slice(0, 3), B = sh(Kp).slice(0, 3);
  const r = solve(A, B, 40, mulberry32(50 + tried));
  if (r) { solved++; const used = r.use.A.filter((c) => c > 0).length + r.use.B.filter((c) => c > 0).length; if (used > bestUsed) { bestUsed = used; best = { A, B, order: r.order }; } if (bestUsed >= 6) break; }
}
console.log(`config: KOPTOL=${KOPTOL} TRAPLIM=${TRAPLIM} (kop max 1×/4 lagen, laag ertussen)`);
console.log(`geprobeerd ${tried}, opgelost: ${solved}, beste #rijen: ${bestUsed}`);
if (!best) { console.log('GEEN'); process.exit(1); }
const { A, B, order } = best;
// verificatie: langste muizentrap + langste kop-kolom over 40 lagen
const wallP = order.map((o) => (o[0] === 'A' ? A : B)[+o[1]].perps);
const wallKx = order.map((o) => (o[0] === 'A' ? A : B)[+o[1]].kx);
let adj = 0, win4max = 1;
for (let g = 1; g < wallKx.length; g++) for (const x of wallKx[g]) if (wallKx[g - 1].some((v) => Math.abs(v - x) < KOPTOL)) adj++;
for (let g = 0; g < wallKx.length; g++) for (const x of wallKx[g]) { let c = 0; for (let h = g; h < Math.min(wallKx.length, g + 4); h++) if (wallKx[h].some((v) => Math.abs(v - x) < KOPTOL)) c++; if (c > win4max) win4max = c; }
console.log(`\nlangste muizentrap = ${maxTrap(wallP)}  kop-aangrenzend = ${adj}  max koppen op x per 4 lagen = ${win4max}`);
console.log('SIGS_A=' + JSON.stringify(A.map((r) => r.sig)));
console.log('SIGS_B=' + JSON.stringify(B.map((r) => r.sig)));
console.log('ORDER=' + JSON.stringify(order.slice(0, 20)));
