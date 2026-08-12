// WEGWERP v5 — zoek 6 unieke rijen (+ hun volgorde) zo dat een ECHTE stapel van volle
// 20-baan-panelen (1200x2500, GEEN flip) nergens een muizentrap > 4 banen heeft. 20 banen is
// geen veelvoud van 6 -> paneelnaad met fase-sprong wordt meegerekend (3 panelen = 60 banen).
//   node spike/groothuis2-volpaneel.mjs

const S = 210, stoot = 4, lint = 10, steenH = 50, TARGET = 2500, PH = 20;
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
const perpsOf = (c) => { let x = 0; const ps = []; for (const cc of c) { x += cc.w; ps.push(Math.round(x)); x += stoot; } ps.pop(); return ps; };

const tol = 7;
function maxTrap(perpRows) {
  const G = perpRows.length;
  const marks = perpRows.map((ps) => { const m = new Uint8Array(TARGET + 1); for (const j of ps) { const lo = Math.max(0, j - tol), hi = Math.min(TARGET, j + tol); for (let x = lo; x <= hi; x++) m[x] = 1; } return m; });
  let max = 0; for (let g0 = 0; g0 < G - 1 && max < 9; g0++) for (const p of perpRows[g0]) for (const q of perpRows[g0 + 1]) { const st = q - p, a = Math.abs(st); if (a < 8 || a > 170) continue; let len = 1; for (let g = g0 + 1; g < G; g++) { const tx = p + st * (g - g0); if (tx < 0 || tx > TARGET || !marks[g][Math.round(tx)]) break; len++; } if (len > max) max = len; }
  return max;
}
function panelStack(base, oris) { const r = []; for (const flip of oris) for (let k = 0; k < PH; k++) r.push(flip ? base[(PH - 1 - k) % 6].map((p) => TARGET - p).sort((a, b) => a - b) : base[k % 6]); return r; }
const evalNoFlip = (base) => maxTrap(panelStack(base, [false, false, false]));
const evalFlip = (base) => maxTrap(panelStack(base, [false, true, false]));

const rngP = mulberry32(2024); const PD = new Map(), PK = new Map();
for (let i = 0; i < 14000; i++) for (const [pool, st] of [[PD, 'D'], [PK, 'K']]) { const r = genRow(st, rngP); if (r) { const s = sig(r); if (!pool.has(s)) pool.set(s, { sig: s, perps: perpsOf(r) }); } }
const Ds = [...PD.values()], Ks = [...PK.values()];
console.log(`pool: ${Ds.length} d, ${Ks.length} k`);

const rng = mulberry32(7); const rnd = (a) => a[Math.floor(rng() * a.length)];
function build(d, k) { return [d[0].perps, k[0].perps, d[1].perps, k[1].perps, d[2].perps, k[2].perps]; }
let best = Infinity, bestD = null, bestK = null; const t0 = Date.now();
for (let r = 0; r < 8000; r++) {
  let d = [rnd(Ds), rnd(Ds), rnd(Ds)], k = [rnd(Ks), rnd(Ks), rnd(Ks)];
  if (new Set([...d, ...k].map((x) => x.sig)).size !== 6) continue;
  let cs = evalNoFlip(build(d, k));
  for (let step = 0; step < 250; step++) {
    const which = rng() < 0.5;
    const arr = which ? d.slice() : k.slice(); const i = Math.floor(rng() * 3); arr[i] = rnd(which ? Ds : Ks);
    const nd = which ? arr : d, nk = which ? k : arr;
    if (new Set([...nd, ...nk].map((x) => x.sig)).size !== 6) continue;
    const v = evalNoFlip(build(nd, nk));
    if (v <= cs) { d = nd; k = nk; cs = v; }
  }
  if (cs < best) { best = cs; bestD = d; bestK = k; }
  if (best <= 4) break;
  if (Date.now() - t0 > 50000) { console.log(`(time-box na ${r})`); break; }
}

// optimale rij-VOLGORDE binnen de gevonden set (permuteer d over rij1/3/5, k over rij2/4/6)
function perms3(a){const r=[];const p=(arr,m)=>{if(!arr.length)r.push(m);for(let i=0;i<arr.length;i++)p(arr.slice(0,i).concat(arr.slice(i+1)),m.concat([arr[i]]));};p(a,[]);return r;}
let ordBest = Infinity, ordD = bestD, ordK = bestK, ordFlip = Infinity;
for (const pd of perms3(bestD)) for (const pk of perms3(bestK)) {
  const base = [pd[0].perps, pk[0].perps, pd[1].perps, pk[1].perps, pd[2].perps, pk[2].perps];
  const m = evalNoFlip(base);
  if (m < ordBest) { ordBest = m; ordD = pd; ordK = pk; ordFlip = evalFlip(base); }
}
const finalRows = [ordD[0], ordK[0], ordD[1], ordK[1], ordD[2], ordK[2]];
console.log(`\nbeste no-flip volle-paneel-stapel: max ${ordBest} banen   (zelfde set mét flip: ${ordFlip})`);
console.log(`\n=== 6 RIJEN (in deze volgorde) ===`);
finalRows.forEach((r, i) => console.log(`Rij ${i + 1}: ${r.sig}`));

// volledige uitdraai-rijen als JS-array voor de generator
console.log('\nARRAY:'); console.log(JSON.stringify(finalRows.map((r) => r.sig)));
