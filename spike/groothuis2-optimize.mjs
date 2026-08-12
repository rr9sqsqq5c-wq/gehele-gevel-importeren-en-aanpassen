// WEGWERP-SPIKE v3 — zoek 6 unieke rijen (productiemal) voor groothuis 2 met HARDE eis:
// in het oneindige, verticaal-6-periodieke veld mag GEEN stootvoeg-diagonaal > 4 banen lopen
// (5 mag niet). Dit is orientatie-onafhankelijk: de flip helpt alleen op paneelnaden, niet
// binnen een paneel. Daarom is "geen diagonaal > 4 in het periodieke veld" de echte eis.
// Aanpak: pool van geldige rijen + hill-climbing (1 rij tegelijk vervangen) met restarts.
//   node spike/groothuis2-optimize.mjs

const S = 210, stoot = 4, lint = 10, steenH = 50, TARGET = 2500, PH = 20;
const K = Math.round((S - stoot) / 2), D = Math.round((3 * S - stoot) / 4);
const W = { S, K, D };
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

function genRow(startT, rng) {
  const closer = startT === 'D' ? 'K' : 'D', closerW = W[closer];
  for (let attempt = 0; attempt < 200; attempt++) {
    const codes = [{ t: startT, w: W[startT] }]; let lastT = startT, run = 1;
    while (true) {
      const usedW = codes.reduce((a, c) => a + c.w, 0);
      const pas = TARGET - usedW - closerW - (codes.length + 1) * stoot;
      if (pas <= 210 && pas >= 110) { codes.push({ t: 'P', w: pas }); codes.push({ t: closer, w: closerW }); return codes; }
      if (pas < 110) break;
      const opts = ['S', 'K'].filter((t) => { if (t === lastT) { if (t === 'S' && run >= 4) return false; if (t === 'K' && run >= 2) return false; } return true; });
      const t = opts[Math.floor(rng() * opts.length)]; codes.push({ t, w: W[t] });
      if (t === lastT) run++; else { lastT = t; run = 1; }
    }
  }
  return null;
}
const sig = (codes) => codes.map((c) => c.t === 'P' ? 's' : c.t.toLowerCase()).join(',');
function perpsOf(codes) { let x = 0; const ps = []; for (const c of codes) { x += c.w; ps.push(Math.round(x)); x += stoot; } ps.pop(); return ps; }

// objective op het 6-periodieke veld: bouw 14 banen (rows[g%6]); start diagonalen vanaf
// fase g0=0..5 (alle distincte diagonalen), meet lengte vooruit. Tel diagonalen met len>=5.
const Hwin = 14, tol = 7;
function evalRows(rows) {
  const base = rows.map(perpsOf);
  const marks = [], joints = [];
  for (let g = 0; g < Hwin; g++) { const ps = base[g % 6]; const m = new Uint8Array(TARGET + 1); for (const j of ps) { const lo = Math.max(0, j - tol), hi = Math.min(TARGET, j + tol); for (let x = lo; x <= hi; x++) m[x] = 1; } marks.push(m); joints.push(ps); }
  let nFail = 0, max = 0, n4 = 0, n3 = 0, worst = null;
  for (let g0 = 0; g0 < 6; g0++) for (const p of joints[g0]) for (const q of joints[g0 + 1]) {
    const st = q - p, a = Math.abs(st); if (a < 8 || a > 170) continue;
    let len = 1; for (let g = g0 + 1; g < Hwin; g++) { const tx = p + st * (g - g0); if (tx < 0 || tx > TARGET || !marks[g][Math.round(tx)]) break; len++; }
    if (len > max) { max = len; worst = { g0, p, st, len }; }
    if (len >= 5) nFail++; else if (len === 4) n4++; else if (len === 3) n3++;
  }
  return { nFail, max, n4, n3, worst };
}
const score = (m) => m.nFail * 100000 + m.max * 1000 + m.n4 * 10 + m.n3;

// pools
const rngP = mulberry32(2024);
const poolD = new Map(), poolK = new Map();
for (let i = 0; i < 12000; i++) for (const [pool, st] of [[poolD, 'D'], [poolK, 'K']]) { const r = genRow(st, rngP); if (!r) continue; const s = sig(r); if (!pool.has(s)) pool.set(s, r); }
const Ds = [...poolD.values()], Ks = [...poolK.values()];
console.log(`pool: ${Ds.length} d-start, ${Ks.length} k-start rijen`);

const rng = mulberry32(42);
const rnd = (arr) => arr[Math.floor(rng() * arr.length)];
function distinct(rows) { return new Set(rows.map(sig)).size === 6; }
function randomSet() { const r = [rnd(Ds), rnd(Ks), rnd(Ds), rnd(Ks), rnd(Ds), rnd(Ks)]; return distinct(r) ? r : randomSet(); }

let globalBest = null, globalBestM = null, globalScore = Infinity;
const t0 = Date.now(), RESTARTS = 4000;
for (let r = 0; r < RESTARTS; r++) {
  let cur = randomSet(); let curM = evalRows(cur); let curS = score(curM);
  for (let step = 0; step < 400; step++) {
    const i = Math.floor(rng() * 6); const pool = i % 2 === 0 ? Ds : Ks;
    const cand = cur.slice(); cand[i] = rnd(pool); if (!distinct(cand)) continue;
    const m = evalRows(cand), s = score(m);
    if (s <= curS) { cur = cand; curM = m; curS = s; }
  }
  if (curS < globalScore) { globalScore = curS; globalBest = cur; globalBestM = curM; }
  if (globalBestM.nFail === 0 && globalBestM.max <= 4) break;
  if (Date.now() - t0 > 55000) { console.log(`(time-box na ${r} restarts)`); break; }
}

const m = globalBestM;
console.log(`\nbeste: max=${m.max} banen, #(>=5)=${m.nFail}, #4=${m.n4}, #3=${m.n3}`);
if (m.nFail === 0 && m.max <= 4) console.log(`\n=== HAALBAAR: langste muizentrap = ${m.max} banen (<=4) ===\n`);
else console.log(`\n=== beste haalbaar = ${m.max} banen, met ${m.nFail} diagonalen >=5 ===\n`);
globalBest.forEach((row, i) => console.log(`Rij ${i + 1}: ${sig(row)}   (pasmaat ${Math.round(row.find((c) => c.t === 'P').w)}mm, ${row.length} stenen)`));

// verificatie over 3 panelen met flip (naden meegerekend)
function stack3(rows) {
  const base = rows.map(perpsOf), ori = [false, true, false], marks = [], joints = [];
  for (let pi = 0; pi < 3; pi++) for (let k = 0; k < PH; k++) {
    let ps = ori[pi] ? base[(PH - 1 - k) % 6].map((p) => TARGET - p) : base[k % 6].slice(); ps = ps.sort((a, b) => a - b);
    const mm = new Uint8Array(TARGET + 1); for (const j of ps) { const lo = Math.max(0, j - tol), hi = Math.min(TARGET, j + tol); for (let x = lo; x <= hi; x++) mm[x] = 1; } marks.push(mm); joints.push(ps);
  }
  let max = 0; for (let g0 = 0; g0 < marks.length - 1; g0++) for (const p of joints[g0]) for (const q of joints[g0 + 1]) { const st = q - p, a = Math.abs(st); if (a < 8 || a > 170) continue; let len = 1; for (let g = g0 + 1; g < marks.length; g++) { const tx = p + st * (g - g0); if (tx < 0 || tx > TARGET || !marks[g][Math.round(tx)]) break; len++; } if (len > max) max = len; }
  return max;
}
console.log(`\nverificatie 3 panelen (normaal/op-de-kop/normaal): langste trap = ${stack3(globalBest)} banen`);
