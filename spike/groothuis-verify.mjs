// READ-ONLY VALIDATE (wegwerp) — controleert de PRODUCTIE-lib groothuisWildverband.js.
//   node spike/groothuis-verify.mjs

import { getGroothuisDims, buildGroothuisModule, buildGroothuisFacade, buildGroothuisRows } from '../src/lib/groothuisWildverband.js';

const material = { steenL: 210, steenH: 50, stoot: 4, lint: 10 };
const dims = getGroothuisDims(material);
const { stoot } = dims;
const facadeW = 5500, facadeH = 1200, MAXP = 2500;

const results = [];
const ok = (label, pass, extra = '') => results.push({ label, pass, extra });
const tol = 1.0;
const widthOf = (cs) => cs.reduce((s, c) => s + c.w, 0) + (cs.length - 1) * stoot;
const codes = (cs) => cs.map((c) => c.pasmaat ? 'd*' : c.t.toLowerCase()).join(' ');
function maxRun(cs, t) { let m = 0, run = 0; for (const c of cs) { if (c.t === t) { run++; m = Math.max(m, run); } else run = 0; } return m; }
function kkPairs(cs) { let c = 0, run = 0; for (const s of cs) { if (s.t === 'K') { run++; if (run === 2) c++; } else run = 0; } return c; }
function perp(cs) { const ps = []; let x = 0; for (const c of cs) { x += c.w; ps.push(Math.round(x)); x += stoot; } return ps; }

// 1. paneelverdeling: vol met 2500 + 1 restpaneel
const fac = buildGroothuisFacade(facadeW, facadeH, material, [], MAXP);
{
  const ws = fac.panels.map((p) => p.w);
  const fulls = ws.filter((w) => Math.abs(w - MAXP) < tol).length;
  const rest = ws[ws.length - 1];
  ok('Paneelverdeling: vol met 2500 + 1 rest', fulls === ws.length - 1 && rest < MAXP, `breedtes [${ws.join(', ')}]`);
}

// 2-6. per uniek paneel: module-regels
const uniqueW = [...new Set(fac.panels.map((p) => Math.round(p.w)))];
let startOk = true, kaarsOk = true, midOk = true, runOk = true, pairOk = true, wildOk = true, det = [];
for (const pw of uniqueW) {
  const mod = buildGroothuisModule(pw, material);
  if (mod.length !== 6) { startOk = false; det.push(`pw ${pw}: geen 6 rijen`); }
  mod.forEach((cs, r) => {
    if (cs[0].t !== (r % 2 === 0 ? 'D' : 'K') || cs[1].t !== 'S') { startOk = false; det.push(`pw${pw} r${r + 1}: start ${codes(cs)}`); }
    if (cs[cs.length - 1].t !== 'D') { startOk = false; det.push(`pw${pw} r${r + 1}: geen sluit-D`); }
    if (cs.slice(2, -1).some((c) => c.t === 'D')) { midOk = false; det.push(`pw${pw} r${r + 1}: D in midden`); }
    if (Math.abs(widthOf(cs) - pw) > tol) { kaarsOk = false; det.push(`pw${pw} r${r + 1}: breedte ${widthOf(cs)}≠${pw}`); }
    if (maxRun(cs, 'S') > 4) { runOk = false; det.push(`pw${pw} r${r + 1}: >4 strek`); }
    if (maxRun(cs, 'K') > 2) { runOk = false; det.push(`pw${pw} r${r + 1}: >2 kop`); }
    if (kkPairs(cs) > 1) { pairOk = false; det.push(`pw${pw} r${r + 1}: ${kkPairs(cs)}× 2-koppen`); }
  });
  for (let r = 0; r < 6; r++) {
    const a = perp(mod[r]).slice(0, -1), b = perp(mod[(r + 1) % 6]).slice(0, -1);
    if (a.some((p) => b.some((q) => Math.abs(p - q) < 6))) { wildOk = false; det.push(`pw${pw} r${r + 1}↔${(r + 1) % 6 + 1}: uitlijning`); }
  }
}
ok('Rijstart om en om D/K + strek, sluit-D', startOk);
ok('Midden vrij (geen D in het midden)', midOk);
ok('Kaarsrechte panelranden (rij = paneelbreedte)', kaarsOk);
ok('Max 4 strek / max 2 kop naast elkaar', runOk);
ok('Max 1× 2-koppen per rij', pairOk);
ok('Wild: geen doorlopende stootvoeg', wildOk);

// 7. reshape rows
{
  const rr = buildGroothuisRows(facadeW, facadeH, material, [], MAXP);
  const totalPieces = rr.rows.reduce((s, r) => s + r.pieces.length, 0);
  ok('buildGroothuisRows: rijen + pieces', rr.rows.length === fac.rowsH && totalPieces === fac.bricks.length, `${rr.rows.length} rijen, ${totalPieces} pieces, ${rr.boardEdges.length} randen`);
}

console.log('\n=== GROOTHUIS WILDVERBAND — productie-lib spike ===');
console.log(`S=${dims.S} K=${dims.K} D=${dims.D} · stoot=${dims.stoot} lint=${dims.lint} · gevel ${facadeW}×${facadeH} · panelen [${fac.panels.map((p) => p.w).join(', ')}]\n`);
let allPass = true;
for (const { label, pass, extra } of results) { if (!pass) allPass = false; console.log(`${pass ? '🟢' : '🔴'} ${label}${extra ? `  —  ${extra}` : ''}`); }
if (det.length) console.log('   ' + det.slice(0, 10).join('\n   '));
console.log(`\n${allPass ? '🟢 ALLE CHECKS GROEN' : '🔴 ER ZIJN ROODE CHECKS'}\n`);
process.exit(allPass ? 0 : 1);
