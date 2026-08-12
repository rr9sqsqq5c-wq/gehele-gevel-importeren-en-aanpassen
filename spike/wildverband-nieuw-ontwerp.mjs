// WEGWERP — ontwerp-generator NIEUW wildverband (ter beoordeling, niet bedraad).
//   node spike/wildverband-nieuw-ontwerp.mjs
//
// Regels:
//  • 6-rij repeterend. Rijstart OM EN OM: even rij → drieklezoor (D), oneven → kop (K),
//    telkens gevolgd door een strek (S). Midden vrij met S/K (geen D).
//  • RECHT eindigen op breedte 2500: de rechterrand is kaarsrecht; de sluit-strip is een
//    DRIEKLEZOOR-pasmaat (op maat) zodat elke rij exact op 2500 sluit.
//  • Voegen: stoot 4 mm, lint 10 mm. Paneel breedte 2500 (≤). Wild: geen doorlopende stootvoeg.

const S = 210, steenH = 50, stoot = 4, lint = 10;
const K = Math.round((S - stoot) / 2);      // 103
const D = Math.round((3 * S - stoot) / 4);  // 157
const W = { S, K, D };
const lagenmaat = steenH + lint;            // 60
const PANEL_W = 2500, PANEL_H = 2500;
const rows = Math.floor(PANEL_H / lagenmaat); // 41

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const widthOf = (cs) => cs.reduce((s, c) => s + c.w, 0) + (cs.length - 1) * stoot;
function perpends(cs) { const ps = []; let x = 0; for (let i = 0; i < cs.length; i++) { x += cs[i].w; ps.push(Math.round(x)); x += stoot; } return ps; }

const MAX_S = 4; // max strekken naast elkaar
const MAX_K = 2; // max koppen naast elkaar (3 koppen → 1 strek + 1 kop, breedte-neutraal)
function trailingRun(codes) { const last = codes[codes.length - 1].t; let n = 0; for (let i = codes.length - 1; i >= 0; i--) { if (codes[i].t === last) n++; else break; } return { t: last, n }; }
function countKKpairs(cs) { let c = 0, run = 0; for (let i = 0; i < cs.length; i++) { if (cs[i].t === 'K') { run++; if (run === 2) c++; } else run = 0; } return c; }
const MAX_KK_PER_ROW = 1; // max 1× "2 koppen naast elkaar" per rij

const CLOSER_MIN = 104, CLOSER_MAX = 213; // drieklezoor-pasmaat venster (vast op 199/146)
function buildRow(rowIndex, prevPerps) {
  const rng = mulberry32(0x9E3779B9 ^ (rowIndex * 2654435761));
  const startT = rowIndex % 2 === 0 ? 'D' : 'K';
  const base = [{ t: startT, w: W[startT] }, { t: 'S', w: S }];
  const remOf = (cs) => PANEL_W - widthOf(cs) - stoot;
  // backtracking: vul midden met S/K (max 4 strek / max 3 kop, wild waar mogelijk) tot de
  // sluit-strip in het drieklezoor-venster valt; sluit dan kaarsrecht op 2500.
  function dfs(cs, depth) {
    const r = remOf(cs);
    if (r >= CLOSER_MIN && r <= CLOSER_MAX) return cs;
    if (r < CLOSER_MIN || depth > 40) return null;
    const tr = trailingRun(cs);
    let opts = ['S', 'K'].filter((t) => {
      if (t === 'S') return !(tr.t === 'S' && tr.n >= MAX_S);
      if (tr.t === 'K' && tr.n >= MAX_K) return false;                                   // max 2 koppen
      if (tr.t === 'K' && tr.n === 1 && countKKpairs(cs) >= MAX_KK_PER_ROW) return false; // max 1× 2-koppen per rij
      return true;
    });
    if (rng() < 0.5) opts.reverse();
    opts.sort((a, b) => {                            // voorkeur: perpend niet uitlijnen met rij eronder
      const pa = widthOf(cs) + stoot + W[a], pb = widthOf(cs) + stoot + W[b];
      return (prevPerps.some((p) => Math.abs(p - pa) < 8) ? 1 : 0) - (prevPerps.some((p) => Math.abs(p - pb) < 8) ? 1 : 0);
    });
    for (const t of opts) { const res = dfs([...cs, { t, w: W[t] }], depth + 1); if (res) return res; }
    return null;
  }
  const codes = dfs(base, 0) ?? base;
  const closerW = PANEL_W - widthOf(codes) - stoot;  // pasmaat → exact op 2500
  codes.push({ t: 'D', w: closerW, pasmaat: Math.abs(closerW - D) > 2 });
  return codes;
}

const module6 = [];
let prev = [];
for (let r = 0; r < 6; r++) { const row = buildRow(r, prev); module6.push(row); prev = perpends(row); }

console.log(`\n=== NIEUW WILDVERBAND — breedte ${PANEL_W} (recht, sluit-drieklezoor pasmaat) ===`);
console.log(`S=${S} K=${K} D=${D} · stoot=${stoot} lint=${lint} · lagenmaat=${lagenmaat} · ${rows} rijen hoog\n`);
module6.forEach((cs, r) => {
  const w = widthOf(cs);
  const last = cs[cs.length - 1];
  const txt = cs.map((c) => c.pasmaat ? `D*${c.w}` : c.t).join(' ');
  console.log(`rij ${r + 1} (${r % 2 === 0 ? 'D' : 'K'}-start): ${txt.padEnd(40)} | ${cs.length} strips | ${w} mm | sluit-D ${last.w}mm${last.pasmaat ? ' (pasmaat)' : ''}`);
});

// validaties
let straight = true, wildOk = true, ruleOk = true, det = [];
module6.forEach((cs, r) => {
  if (Math.abs(widthOf(cs) - PANEL_W) > 1) { straight = false; det.push(`rij ${r + 1} niet op ${PANEL_W} (${widthOf(cs)})`); }
  const okStart = cs[0].t === (r % 2 === 0 ? 'D' : 'K') && cs[1].t === 'S';
  const okEnd = cs[cs.length - 1].t === 'D';
  const midD = cs.slice(2, -1).filter((c) => c.t === 'D').length;
  if (!okStart || !okEnd || midD) { ruleOk = false; det.push(`rij ${r + 1} regel`); }
});
for (let r = 0; r < 6; r++) {
  const a = perpends(module6[r]).slice(0, -1);
  const b = perpends(module6[(r + 1) % 6]).slice(0, -1);
  const al = a.filter((p) => b.some((q) => Math.abs(p - q) < 6));
  if (al.length) { wildOk = false; det.push(`rij ${r + 1}↔${(r + 1) % 6 + 1} uitlijning @${al.join(',')}`); }
}
let runOk = true;
module6.forEach((cs, r) => { let run = 1; for (let i = 1; i < cs.length; i++) { const same = cs[i].t === cs[i - 1].t && (cs[i].t === 'S' || cs[i].t === 'K'); run = same ? run + 1 : 1; if (cs[i].t === 'S' && run > MAX_S) { runOk = false; det.push(`rij ${r + 1}: >${MAX_S} strekken`); } if (cs[i].t === 'K' && run > MAX_K) { runOk = false; det.push(`rij ${r + 1}: >${MAX_K} koppen`); } } });
const pasmaten = module6.map((cs) => cs[cs.length - 1].w);
console.log(`\nSluit-drieklezoor breedtes: ${pasmaten.join(', ')} mm (echte D = ${D})`);
console.log(`${straight ? '🟢' : '🔴'} rechterrand kaarsrecht op ${PANEL_W} mm`);
console.log(`${ruleOk ? '🟢' : '🔴'} regel: start D/K+S · midden S/K · eind D`);
console.log(`${wildOk ? '🟢' : '🔴'} wild: geen doorlopende stootvoeg`);
console.log(`${runOk ? '🟢' : '🔴'} max ${MAX_S} strekken / max ${MAX_K} koppen naast elkaar`);
let pairOk = true;
module6.forEach((cs, r) => { const n = countKKpairs(cs); if (n > MAX_KK_PER_ROW) { pairOk = false; det.push(`rij ${r + 1}: ${n}× 2-koppen`); } });
console.log(`${pairOk ? '🟢' : '🔴'} max ${MAX_KK_PER_ROW}× 2-koppen per rij  —  per rij: [${module6.map((cs) => countKKpairs(cs)).join(', ')}]`);
if (det.length) console.log('   ' + det.join('\n   '));
console.log('\nMODULE_JSON=' + JSON.stringify(module6.map((cs) => cs.map((c) => [c.t, c.w, c.pasmaat ? 1 : 0]))));
