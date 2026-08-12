// READ-ONLY VALIDATE (wegwerp) — controleert de tegel-generator buildTruthFacade:
// doorlopend verband (koppelstrip OVERSPANT de kaarsrechte paneelrand) tegen de grondwaarheid.
//   node spike/wildverband-koppelstrip-verify.mjs

import { buildTruthFacade, buildTruthRows, WILDVERBAND_TRUTH, stripWidth } from '../src/lib/wildverbandKoppelstrip.js';

const material = { steenL: 210, steenH: 50, lint: 10, stoot: 10 };
const j = material.stoot, LM = material.steenH + material.lint, PANELVOEG = 3;
const facadeW = 3600, facadeH = 720; // 12 rijen
const CODE = { Strek: 'S', Drieklezoor: 'D', Kop: 'K' };

const fac = buildTruthFacade(facadeW, facadeH, material, [], PANELVOEG);
const results = [];
const ok = (label, pass, extra = '') => results.push({ label, pass, extra });
const tol = 1.0;

const refRow = WILDVERBAND_TRUTH.volg[0];
const boardSum = refRow.reduce((s, c) => s + stripWidth(c, material), 0);
const expPitch = boardSum + refRow.length * j;   // 1095 + 6×10 = 1155
const expBoardWidth = expPitch - PANELVOEG;       // 1152

// per rij: alle stenen gesorteerd; en per (rij,paneel)
const rowAll = new Map();
const rowPanel = new Map();
for (const b of fac.bricks) {
  const k = Math.round(b.y);
  if (!rowAll.has(k)) rowAll.set(k, []);
  rowAll.get(k).push(b);
  const pk = k + ':' + b.panelIndex;
  if (!rowPanel.has(pk)) rowPanel.set(pk, []);
  rowPanel.get(pk).push(b);
}
for (const a of rowAll.values()) a.sort((x, y) => x.x - y.x);
for (const a of rowPanel.values()) a.sort((x, y) => x.x - y.x);

// 1-3. steek / board / 3mm
ok('Steek = Σstrips + 6× stootvoeg', Math.abs(fac.pitch - expPitch) < tol, `pitch ${fac.pitch} (verwacht ${expPitch})`);
ok('Boardbreedte = steek − 3 mm', Math.abs(fac.boardWidth - expBoardWidth) < tol, `${fac.boardWidth}`);
ok('Paneelrand 3 mm terug t.o.v. volgende strip', Math.abs(fac.pitch - fac.boardWidth - PANELVOEG) < tol);

// 4. doorlopende dekking: eerste op 0, alle naden == stootvoeg
{
  let good = true, detail = '';
  for (const [k, row] of rowAll) {
    if (Math.abs(row[0].x) > tol) { good = false; detail = `rij y=${k} begint op ${row[0].x}`; break; }
    for (let i = 1; i < row.length; i++) {
      const gap = row[i].x - (row[i - 1].x + row[i - 1].width);
      if (Math.abs(gap - j) > tol) { good = false; detail = `rij y=${k}: naad ${gap.toFixed(1)}`; break; }
    }
    if (!good) break;
  }
  ok('Doorlopende dekking, naad == stootvoeg (butt)', good, detail);
}

// 5-6. paneel 0 == start ; volle volgpanelen == volg
{
  let sOk = true, vOk = true, sd = '', vd = '';
  for (let r = 0; r < fac.rowsH; r++) {
    const tr = r % 6, y = Math.round(r * LM);
    const p0 = (rowPanel.get(y + ':0') ?? []).map((b) => CODE[b.type]);
    if (p0.length === 6 && p0.join('') !== WILDVERBAND_TRUTH.start[tr].join('')) { sOk = false; sd = `rij ${r + 1}: ${p0.join('')} ≠ ${WILDVERBAND_TRUTH.start[tr].join('')}`; }
    const p1 = (rowPanel.get(y + ':1') ?? []).map((b) => CODE[b.type]);
    if (p1.length === 6 && p1.join('') !== WILDVERBAND_TRUTH.volg[tr].join('')) { vOk = false; vd = `rij ${r + 1} p1: ${p1.join('')} ≠ ${WILDVERBAND_TRUTH.volg[tr].join('')}`; }
  }
  ok('Paneel 0 == startpaneel', sOk, sd);
  ok('Volgpanelen == volgpaneel', vOk, vd);
}

// 7. koppelstrippen: volg, rij 2/4/6, kol 0, variabel
const ks = fac.bricks.filter((b) => b.koppelstrip);
{
  const koppelTr = new Set([1, 3, 5]);
  let placement = ks.length > 0;
  for (const b of ks) {
    const tr = Math.round(b.y / LM) % 6;
    const arr = rowPanel.get(Math.round(b.y) + ':' + b.panelIndex) ?? [];
    if (b.panelIndex < 1 || !koppelTr.has(tr) || arr[0] !== b) { placement = false; break; }
  }
  ok('Koppelstrippen: volg, rij 2/4/6, kol 0', placement, `${ks.length} stuks`);
  ok('Koppelstrip variabel (S/D)', new Set(ks.map((b) => b.type)).size >= 2, `{${[...new Set(ks.map((b) => b.type))].join(', ')}}`);
}

// 8. koppelstrip OVERSPANT een kaarsrechte boardEdge
{
  let spans = ks.length > 0;
  for (const b of ks) {
    const crosses = fac.boardEdges.some((e) => e > b.x + 0.5 && e < b.x + b.width - 0.5);
    if (!crosses) { spans = false; break; }
  }
  ok('Koppelstrip overspant de paneelrand', spans);
}

// 9. boardEdges op k·pitch + boardWidth
{
  let good = fac.boardEdges.length > 0;
  for (let k = 0; k < fac.boardEdges.length; k++) if (Math.abs(fac.boardEdges[k] - (k * fac.pitch + fac.boardWidth)) > tol) { good = false; break; }
  ok('Kaarsrechte boardEdges op k·pitch + board', good, `${fac.boardEdges.length} randen`);
}

// 10. verticale herhaling elke 6 rijen
{
  const sig = (r) => (rowAll.get(Math.round(r * LM)) ?? []).map((b) => `${CODE[b.type]}${b.koppelstrip ? 'K' : ''}`).join('|');
  let rep = true, detail = '';
  for (let r = 0; r + 6 < fac.rowsH; r++) if (sig(r) !== sig(r + 6)) { rep = false; detail = `rij ${r + 1} ≠ rij ${r + 7}`; break; }
  ok('Verticale herhaling elke 6 rijen', rep, detail);
}

// 11. buildTruthRows: gedeelde rows-vorm voor 2D/3D/IFC
{
  const tr = buildTruthRows(facadeW, facadeH, material, [], PANELVOEG);
  const totalPieces = tr.rows.reduce((s, r) => s + r.pieces.length, 0);
  const kpc = tr.rows.reduce((s, r) => s + r.pieces.filter((p) => p.koppelstrip).length, 0);
  ok('buildTruthRows: rijen + pieces == bricks', tr.rows.length === fac.rowsH && totalPieces === fac.bricks.length, `${tr.rows.length} rijen, ${totalPieces} pieces`);
  ok('buildTruthRows: koppelstrippen behouden', kpc === ks.length, `${kpc}`);
}

console.log('\n=== WILDVERBAND TEGEL-GENERATOR (koppelstrip overspant rand) — spike ===\n');
let allPass = true;
for (const { label, pass, extra } of results) { if (!pass) allPass = false; console.log(`${pass ? '🟢' : '🔴'} ${label}${extra ? `  —  ${extra}` : ''}`); }
console.log(`\n${allPass ? '🟢 ALLE CHECKS GROEN' : '🔴 ER ZIJN ROODE CHECKS'}\n`);
process.exit(allPass ? 0 : 1);
