// WEGWERP — concrete "zuinige" groothuis-2 wand: 1 drieklezoor + max 4 koppen per rij (minimum),
// om-en-om, sluitsteen-regel (D->K, K->D), max 4 strek achter elkaar, ≤4 muizentrap, geen volle-
// strek-stapel. Geeft SIGS + leg-volgorde voor de rendering.
//   node spike/groothuis2-zuinig.mjs
const S = 210, stoot = 4, TARGET = 2500;
const K = Math.round((S - stoot) / 2), D = Math.round((3 * S - stoot) / 4);
const W = { S, K, D };
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function genRow(startT, closerT, maxKop, rng) {
  const closerW = W[closerT];
  for (let a = 0; a < 500; a++) {
    const codes = [{ t: startT, w: W[startT] }]; let run = startT === 'S' ? 1 : 0, kop = startT === 'K' ? 1 : 0;
    while (true) {
      const used = codes.reduce((s, c) => s + c.w, 0); const pas = TARGET - used - closerW - (codes.length + 1) * stoot;
      if (pas >= 120 && pas <= 210 && run + 1 <= 4 && kop + (closerT === 'K' ? 1 : 0) <= maxKop) { codes.push({ t: 'P', w: pas }); codes.push({ t: closerT, w: closerW }); return codes; }
      if (pas < 120) break;
      const canS = run < 4, canK = kop + (closerT === 'K' ? 1 : 0) < maxKop;
      const opts = []; if (canS) opts.push('S'); if (canK) opts.push('K');
      if (!opts.length) break;
      const t = opts[Math.floor(rng() * opts.length)]; codes.push({ t, w: W[t] });
      if (t === 'S') run++; else { run = 0; kop++; }
    }
  }
  return null;
}
const sig = (c) => c.map((x) => x.t === 'P' ? 's' : x.t.toLowerCase()).join(',');
const kopN = (c) => c.filter((x) => x.t === 'K').length, drN = (c) => c.filter((x) => x.t === 'D').length;
function stripsOf(codes) { let x = 0; const st = []; for (const c of codes) { st.push({ a: x, b: x + c.w, full: c.t === 'S' }); x += c.w + stoot; } return st; }
function perpsOf(codes) { let x = 0; const ps = []; for (const c of codes) { x += c.w; ps.push(Math.round(x)); x += stoot; } ps.pop(); return ps; }
const tol = 7;
function strekStack(si, sj) { for (const x of si) { if (!x.full) continue; for (const y of sj) { if (!y.full) continue; if (Math.abs(x.a - y.a) < tol && Math.abs(x.b - y.b) < tol) return true; } } return false; }
function maxTrap(rowsP) { const G = rowsP.length; if (G < 2) return 1; const marks = rowsP.map((ps) => { const m = new Uint8Array(TARGET + 1); for (const j of ps) { const lo = Math.max(0, j - tol), hi = Math.min(TARGET, j + tol); for (let x = lo; x <= hi; x++) m[x] = 1; } return m; }); let max = 1; for (let g0 = 0; g0 < G - 1; g0++) for (const p of rowsP[g0]) for (const q of rowsP[g0 + 1]) { const st = q - p, a = Math.abs(st); if (a < 8 || a > 170) continue; let len = 1; for (let g = g0 + 1; g < G; g++) { const tx = p + st * (g - g0); if (tx < 0 || tx > TARGET || !marks[g][Math.round(tx)]) break; len++; } if (len > max) max = len; } return max; }
function pool(startT, closerT, n) { const m = new Map(); const rng = mulberry32(startT.charCodeAt(0) * 31 + closerT.charCodeAt(0)); for (let i = 0; i < n; i++) { const r = genRow(startT, closerT, 4, rng); if (r) { const s = sig(r); if (!m.has(s)) m.set(s, { sig: s, strips: stripsOf(r), perps: perpsOf(r), kop: kopN(r), dr: drN(r) }); } } return [...m.values()]; }
const Ap = pool('D', 'K', 80000), Bp = pool('K', 'D', 80000);
console.log(`pools (max 4 kop): A=${Ap.length} B=${Bp.length}`);
function buildWall(A, B, N, rng) { const rp = [], strips = [], order = []; const use = { A: [0,0,0], B: [0,0,0] };
  function bt(g, la, lb) { if (g === N) return true; const useA = g % 2 === 0; const trip = useA ? A : B; const last = useA ? la : lb; const u = useA ? use.A : use.B;
    const ord = [0,1,2].filter((i) => i !== last).sort((x,y) => (u[x]-u[y]) || (rng()-0.5));
    for (const i of ord) { const r = trip[i]; const below = strips[strips.length-1]; if (below && strekStack(below, r.strips)) continue; rp.push(r.perps); strips.push(r.strips);
      if (maxTrap(rp.slice(-6)) <= 4) { order.push((useA?'A':'B')+i); u[i]++; if (bt(g+1, useA?i:la, useA?lb:i)) return true; u[i]--; order.pop(); } rp.pop(); strips.pop(); } return false; }
  return bt(0,-1,-1) ? { order, use } : null;
}
const rng = mulberry32(7); const sh = (a) => { const c = a.slice(); for (let i = c.length-1; i>0; i--) { const j = Math.floor(rng()*(i+1)); [c[i],c[j]]=[c[j],c[i]]; } return c; };
let best = null, bestUsed = -1; const t0 = Date.now();
while (Date.now() - t0 < 40000) { const A = sh(Ap).slice(0,3), B = sh(Bp).slice(0,3); if (new Set([...A,...B].map(r=>r.sig)).size !== 6) continue;
  const w = buildWall(A, B, 40, mulberry32(1234)); if (w) { const u = w.use.A.filter(c=>c>0).length + w.use.B.filter(c=>c>0).length; if (u > bestUsed) { bestUsed = u; best = { A, B, w }; } if (u >= 6) break; } }
if (!best) { console.log('geen'); process.exit(1); }
const { A, B, w } = best;
const wallP = w.order.map(o => (o[0]==='A'?A:B)[+o[1]].perps);
console.log(`\nlangste muizentrap = ${maxTrap(wallP)}  rijen gebruikt ${bestUsed}/6`);
console.log('kop/rij:', 'A=' + A.map(r=>r.kop), 'B=' + B.map(r=>r.kop), ' drkl/rij: A=' + A.map(r=>r.dr), 'B=' + B.map(r=>r.dr));
console.log('SIGS_A=' + JSON.stringify(A.map(r=>r.sig)));
console.log('SIGS_B=' + JSON.stringify(B.map(r=>r.sig)));
console.log('ORDER=' + JSON.stringify(w.order.slice(0, 20)));
