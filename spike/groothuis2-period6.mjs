// WEGWERP — ECHT repeterende 6-rij-tegel (period-6). Rijen 1,3,5 = drieklezoor-start (sluit kop),
// rijen 2,4,6 = kop-start (sluit drieklezoor) → om-en-om aan begin én eind. Max 5 strekken achter
// elkaar; max 2 koppen achter elkaar. De 6-rij-tegel (oneindig herhaald) mag muizentrap ≤ 6 hebben.
// Extra kwaliteit: geen twee VOLLE strekken pal boven elkaar; koppen niet in kolommen (max 1× op
// zelfde x per 4 lagen, nooit aangrenzend). Zoek de 6 rijen + de beste onderlinge volgorde.
//   node spike/groothuis2-period6.mjs
const S = 210, stoot = 4, TARGET = 2500;
const K = Math.round((S - stoot) / 2), D = Math.round((3 * S - stoot) / 4);
const W = { S, K, D };
const TRAPLIM = 6, KOPTOL = 40, MAXKOP = Number(process.env.MAXKOP || 5);
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function genRow(startT, closerT, rng) {
  const closerW = W[closerT];
  for (let a = 0; a < 600; a++) {
    const codes = [{ t: startT, w: W[startT] }];
    let sRun = startT === 'S' ? 1 : 0, kRun = startT === 'K' ? 1 : 0, kop = startT === 'K' ? 1 : 0;
    while (true) {
      const used = codes.reduce((s, c) => s + c.w, 0); const pas = TARGET - used - closerW - (codes.length + 1) * stoot;
      if (pas >= 120 && pas <= 210 && sRun + 1 <= 5 && kop + (closerT === 'K' ? 1 : 0) <= MAXKOP) { codes.push({ t: 'P', w: pas }); codes.push({ t: closerT, w: closerW }); return codes; }
      if (pas < 120) break;
      const canS = sRun < 5, canK = kRun < 2 && kop + (closerT === 'K' ? 1 : 0) < MAXKOP;
      const opts = []; if (canS) opts.push('S'); if (canK) opts.push('K');
      if (!opts.length) break;
      const t = opts[Math.floor(rng() * opts.length)]; codes.push({ t, w: W[t] });
      if (t === 'S') { sRun++; kRun = 0; } else { kRun++; sRun = 0; kop++; }
    }
  }
  return null;
}
const sig = (c) => c.map((x) => x.t === 'P' ? 's' : x.t.toLowerCase()).join(',');
const kopN = (c) => c.filter((x) => x.t === 'K').length;
function perpsOf(codes) { let x = 0; const ps = []; for (const c of codes) { x += c.w; ps.push(Math.round(x)); x += stoot; } ps.pop(); return ps; }
function fss(codes) { let x = 0; const st = []; for (const c of codes) { st.push({ a: x, b: x + c.w, full: c.t === 'S' }); x += c.w + stoot; } return st; }
const kxs = (codes) => { let x = 0; const ks = []; for (const c of codes) { if (c.t === 'K') ks.push(x + c.w / 2); x += c.w + stoot; } return ks; };
function strekStack(si, sj) { for (const x of si) { if (!x.full) continue; for (const y of sj) { if (!y.full) continue; if (Math.abs(x.a - y.a) < 7 && Math.abs(x.b - y.b) < 7) return true; } } return false; }
function maxTrap(rowsP) { const G = rowsP.length; if (G < 2) return 1; let max = 1; for (let g0 = 0; g0 < G - 1; g0++) for (const p of rowsP[g0]) for (const q of rowsP[g0 + 1]) { const st = q - p, a = Math.abs(st); if (a < 8 || a > 170) continue; let len = 1; for (let g = g0 + 1; g < G; g++) { const tx = p + st * (g - g0); if (rowsP[g].some((v) => Math.abs(v - tx) < 7)) len++; else break; } if (len > max) max = len; } return max; }

function genPool(startT, closerT, n) { const m = new Map(); const rng = mulberry32(startT.charCodeAt(0) * 31 + closerT.charCodeAt(0)); for (let i = 0; i < n; i++) { const r = genRow(startT, closerT, rng); if (r) { const s = sig(r); if (!m.has(s)) m.set(s, { sig: s, perps: perpsOf(r), fss: fss(r), kx: kxs(r), kop: kopN(r) }); } } return [...m.values()]; }
const Dp = genPool('D', 'K', 80000), Kp = genPool('K', 'D', 80000);
console.log(`pools: d=${Dp.length} k=${Kp.length}`);

// evalueer een VASTE tegel [d0,k0,d1,k1,d2,k2] herhaald: alle regels + langste muizentrap
function evalTile(tile) {
  const REP = 6, N = tile.length * REP;
  const rowsP = [], kxHist = [];
  for (let g = 0; g < N; g++) { const r = tile[g % 6]; const below = g ? tile[(g - 1) % 6] : null;
    if (below && strekStack(below.fss, r.fss)) return { ok: false };
    // kop-regel: nooit aangrenzend + max 2 op zelfde x per 4 lagen
    for (const x of r.kx) {
      if (g >= 1 && kxHist[g - 1].some((v) => Math.abs(v - x) < KOPTOL)) return { ok: false };
      let c = 0; for (let w = 1; w <= 3; w++) if (g - w >= 0 && kxHist[g - w].some((v) => Math.abs(v - x) < KOPTOL)) c++;
      if (c >= 2) return { ok: false };
    }
    rowsP.push(r.perps); kxHist.push(r.kx);
  }
  return { ok: true, trap: maxTrap(rowsP) };
}
function perms3(a) { const r = []; const p = (arr, m) => { if (!arr.length) { r.push(m); return; } for (let i = 0; i < arr.length; i++) p(arr.slice(0, i).concat(arr.slice(i + 1)), m.concat([arr[i]])); }; p(a, []); return r; }

const rng = mulberry32(7); const sh = (a) => { const c = a.slice(); for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c; };
let best = null, bestTrap = Infinity; const t0 = Date.now(); let tried = 0, feas = 0;
while (Date.now() - t0 < 50000) {
  tried++; const dd = sh(Dp).slice(0, 3), kk = sh(Kp).slice(0, 3);
  for (const pd of perms3(dd)) for (const pk of perms3(kk)) {
    const tile = [pd[0], pk[0], pd[1], pk[1], pd[2], pk[2]];
    const e = evalTile(tile);
    if (e.ok) { feas++; if (e.trap < bestTrap) { bestTrap = e.trap; best = tile; if (bestTrap <= 5) break; } }
  }
  if (bestTrap <= 5) break;
}
console.log(`geprobeerd ${tried}, geldige tegels ${feas}, beste muizentrap ${bestTrap}`);
if (!best) { console.log('GEEN geldige 6-rij-tegel gevonden.'); process.exit(1); }
console.log('\n=== VASTE 6-RIJ-TEGEL (period-6) ===');
best.forEach((r, i) => console.log(`Rij ${i + 1} (${i % 2 === 0 ? 'd' : 'k'}): ${r.sig}   (${r.kop} koppen)`));
console.log('SIGS=' + JSON.stringify(best.map((r) => r.sig)));
