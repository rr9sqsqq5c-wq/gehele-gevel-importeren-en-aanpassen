// BEWIJS-SPIKE — valideert src/lib/groothuisWildverband2.js (vaste 6-rij mal) in isolatie (Node).
//   node spike/groothuis2-verify.mjs
import { buildGroothuis2Rows, buildGroothuis2Module, getGroothuis2Dims } from '../src/lib/groothuisWildverband2.js';

const mat = { steenL: 210, steenH: 50, stoot: 4, lint: 10 };
const results = [];
const ok = (label, pass, extra = '') => results.push({ label, pass, extra });
const TOL = 7;
const { stoot } = getGroothuis2Dims(mat);
const modW = (() => { const row = buildGroothuis2Module(mat)[0]; return row.reduce((s, c) => s + c.w, 0) + (row.length - 1) * stoot; })();

function maxTrapRows(rows, panelW) {
  const perps = rows.map((r) => r.pieces.filter((p) => p.start + p.length < panelW - 0.5).map((p) => Math.round(p.start + p.length)));
  const G = perps.length; let max = 1;
  for (let g0 = 0; g0 < G - 1; g0++) for (const p of perps[g0]) for (const q of perps[g0 + 1]) {
    const st = q - p, a = Math.abs(st); if (a < 8 || a > 170) continue; let len = 1;
    for (let g = g0 + 1; g < G; g++) { const tx = p + st * (g - g0); if (perps[g].some((v) => Math.abs(v - tx) < TOL)) len++; else break; }
    if (len > max) max = len;
  } return max;
}
function anyFullStrekStack(rows, S) {
  const full = (p) => p.label === 'Strek' && Math.abs(p.length - S) < TOL;
  for (let g = 1; g < rows.length; g++) for (const a of rows[g - 1].pieces) { if (!full(a)) continue; for (const b of rows[g].pieces) { if (!full(b)) continue; if (Math.abs(a.start - b.start) < TOL && Math.abs(a.length - b.length) < TOL) return true; } }
  return false;
}

// 1. module: 6 vaste rijen, elk exact even breed (~2511), om-en-om drieklezoor/kop start + sluit
{
  const mod = buildGroothuis2Module(mat);
  const widths = mod.map((c) => c.reduce((s, x) => s + x.w, 0) + (c.length - 1) * stoot);
  const allEqual = widths.every((w) => Math.abs(w - widths[0]) < 1);
  const dStart = [0, 2, 4].every((i) => mod[i][0].t === 'D' && mod[i][mod[i].length - 1].t === 'K');
  const kStart = [1, 3, 5].every((i) => mod[i][0].t === 'K' && mod[i][mod[i].length - 1].t === 'D');
  const max5 = mod.every((c) => { let run = 0, okk = true; for (const x of c) { if (x.t === 'S') { if (++run > 5) okk = false; } else run = 0; } return okk; });
  ok('Module: 6 rijen, exact even breed', mod.length === 6 && allEqual, `breedte ${Math.round(widths[0])} mm`);
  ok('Module: om-en-om drieklezoor-start→kop-sluit / kop-start→drieklezoor-sluit', dStart && kStart);
  ok('Module: max 5 strekken achter elkaar', max5);
}

// 2. één module-brede gevel → geldige rows, muizentrap ≤6, geen volle-strek-stapel, geen kop pal boven kop
{
  const H = 2400;
  const fd = buildGroothuis2Rows(modW, H, mat, []);
  const rows = fd.rows ?? [];
  const lagen = Math.floor(H / (mat.steenH + mat.lint));
  const labelsOk = rows.every((r) => r.pieces.every((p) => ['Strek', 'Kop', 'Drieklezoor'].includes(p.label)));
  const mt = maxTrapRows(rows, modW);
  ok('Eén module: geldige rows + labels', rows.length >= lagen - 1 && rows.length <= lagen + 1 && labelsOk, `${rows.length} rijen (~${lagen})`);
  ok('Eén module: muizentrap ≤ 6', mt <= 6, `langste trap = ${mt}`);
  ok('Eén module: geen twee volle strekken gestapeld', !anyFullStrekStack(rows, mat.steenL));
}

// 3. brede gevel → tegels naast elkaar (boardEdges), bekleding over de volle breedte
{
  const fw = Math.round(modW * 2 + 700);
  const fd = buildGroothuis2Rows(fw, 2400, mat, []);
  const be = fd.boardEdges ?? [];
  const maxRight = Math.max(...fd.rows.flatMap((r) => r.pieces.map((p) => p.start + p.length)));
  ok('Brede gevel: paneelnaad(en) op de module', be.length >= 2 && Math.abs(be[0] - modW) < 8, `boardEdges=${be.map((x) => Math.round(x))}`);
  ok('Brede gevel: bekleding tot ~gevelbreedte', Math.abs(maxRight - fw) < 30, `maxRight=${Math.round(maxRight)} van ${fw}`);
}

// 4. opening uitgespaard
{
  const op = { x: 800, y: 600, width: 1000, height: 1000 };
  const fd = buildGroothuis2Rows(modW, 2400, mat, [op]);
  let inside = 0;
  for (const r of fd.rows) for (const p of r.pieces) { const cx = p.start + p.length / 2, cy = r.y + 25; if (cx > op.x + 5 && cx < op.x + op.width - 5 && cy > op.y + 5 && cy < op.y + op.height - 5) inside++; }
  ok('Opening uitgespaard (geen steen-midden binnen opening)', inside === 0, `${inside} stenen binnen opening`);
}

console.log('\n=== GROOTHUIS WILDVERBAND 2 (vaste mal) — bewijs-spike ===\n');
let allPass = true;
for (const { label, pass, extra } of results) { if (!pass) allPass = false; console.log(`${pass ? '🟢' : '🔴'} ${label}${extra ? `  —  ${extra}` : ''}`); }
console.log(`\n${allPass ? '🟢 ALLE CHECKS GROEN' : '🔴 ER ZIJN ROODE CHECKS'}\n`);
process.exit(allPass ? 0 : 1);
