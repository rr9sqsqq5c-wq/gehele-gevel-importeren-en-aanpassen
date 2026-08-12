// Verzamelt ALLE tot nu geëxtraheerde info uit de 3 IFC's in één JSON, voor het Excel-werkboek.
// Hergebruikt src/lib/ghCladding.js (parse → elementen/gevels/panelen/totalen) + spike-logica
// (steenstrip-maten, latten, best-fit zaagschema/bestelling, penant-voetafdruk-clustering).
import fs from 'node:fs';
import { parseGhCladding } from '../src/lib/ghCladding.js';
const D = 'C:/Users/MurkAnneKooistraKooi/Downloads';
const FILES = {
  RED: '28072026-BUILDING-1-RED-FACADES.ifc',
  GREEN: '28072026-BUILDING-1-2-GREEN-FACADES.ifc',
  PENNANTS: '28072026-BUILDING-1-2-PENNANTS.ifc',
};
const r1 = (v) => Math.round(v * 10) / 10;
const res = {};
for (const [k, fn] of Object.entries(FILES)) res[k] = { ...parseGhCladding(fs.readFileSync(`${D}/${fn}`, 'latin1')), key: k };

// ── steenstrip-maten + latten per bestand ───────────────────────────────────────────────────
const closest51 = (e) => (Math.abs(e.L - 51) <= Math.abs(e.B - 51) ? e.L : e.B);
const lengthOf = (e) => (Math.abs(e.L - 51) >= Math.abs(e.B - 51) ? e.L : e.B);
function stripSizes(r) {
  const m = new Map();
  for (const e of r.elements) { if (e.cat !== 'steenstrips') continue; const len = Math.round(lengthOf(e)), h = Math.round(closest51(e)), d = Math.round(e.D); const key = `${len}|${h}|${d}`; const g = m.get(key) || { lengte: len, hoogte: h, dikte: d, aantal: 0 }; g.aantal++; m.set(key, g); }
  return [...m.values()].sort((a, b) => b.aantal - a.aantal);
}
function lattenSizes(r) {
  const m = new Map();
  for (const e of r.elements) { if (e.cat !== 'latten') continue; const L = Math.round(e.L), B = Math.round(e.B), Dd = Math.round(e.D); const key = `${L}|${B}|${Dd}`; const g = m.get(key) || { lengte: L, breedte: B, dikte: Dd, aantal: 0 }; g.aantal++; m.set(key, g); }
  return [...m.values()].sort((a, b) => b.aantal - a.aantal);
}

// ── best-fit zaagschema (hele strip 221, kerf 3, standaardstrip hoogte~51/dik~23) ─────────────
const STOCK = 221, KERF = 3, BIN = STOCK + KERF;
function stripLengths(r) {
  const out = [];
  for (const e of r.elements) { if (e.cat !== 'steenstrips') continue; const h = closest51(e); if (Math.abs(h - 51) > 4 || e.D < 19 || e.D > 27) continue; out.push(lengthOf(e)); }
  return out;
}
function clusterLens(lens) { const s = [...lens].sort((a, b) => a - b); if (!s.length) return []; const cl = []; let cur = [s[0]]; for (let i = 1; i < s.length; i++) { if (s[i] - cur[cur.length - 1] <= 2) cur.push(s[i]); else { cl.push(cur); cur = []; } cur.push(s[i]); } cl.push(cur); const rep = (v) => { for (const c of cl) if (v >= c[0] - 1e-6 && v <= c[c.length - 1] + 1e-6) return Math.round(c[c.length - 1]); return Math.round(v); }; return lens.map(rep); }
function packPatterns(lens) {
  const items = lens.map((l) => Math.round(l)).sort((a, b) => b - a); const bins = []; const byRem = new Map();
  for (const len of items) { const c = len + KERF; let r = -1; for (let x = c; x <= BIN; x++) { const a = byRem.get(x); if (a && a.length) { r = x; break; } } if (r >= 0) { const idx = byRem.get(r).pop(); const bn = bins[idx]; bn.pieces.push(len); bn.rem = r - c; (byRem.get(bn.rem) || byRem.set(bn.rem, []).get(bn.rem)).push(idx); } else { const idx = bins.length; bins.push({ rem: BIN - c, pieces: [len] }); (byRem.get(BIN - c) || byRem.set(BIN - c, []).get(BIN - c)).push(idx); } }
  const pat = new Map();
  for (const b of bins) { const key = [...b.pieces].sort((a, b) => b - a).join('+'); const k = b.pieces.length, s = b.pieces.reduce((a, x) => a + x, 0), rest = STOCK - s - KERF * (k - 1); const g = pat.get(key) || { pieces: [...b.pieces].sort((a, b) => b - a), aantal: 0, rest }; g.aantal++; pat.set(key, g); }
  const whole = bins.filter((b) => b.pieces.length === 1 && b.pieces[0] >= STOCK - 1).length;
  const nuttig = items.reduce((s, l) => s + l, 0), ingekocht = bins.length * STOCK, verlies = ingekocht - nuttig;
  let sneden = 0; for (const b of bins) { const rest = STOCK - b.pieces.reduce((s, x) => s + x, 0) - KERF * (b.pieces.length - 1); sneden += (rest > 0.5 ? b.pieces.length : b.pieces.length - 1); }
  const kerf = sneden * KERF;
  return { bins: bins.length, whole, kort: items.length - whole, nuttig, ingekocht, verlies, kerf, rest: verlies - kerf, patronen: [...pat.values()].sort((a, b) => b.aantal - a.aantal) };
}
const fmtPat = (pieces) => { const h = new Map(); for (const p of pieces) h.set(p, (h.get(p) || 0) + 1); return [...h.entries()].sort((a, b) => b[0] - a[0]).map(([l, n]) => (n > 1 ? `${n}× ${l}` : `${l}`)).join(' + '); };

// Rood = RED; Groen = GREEN + PENANTEN (penanten zijn groen)
// Exacte (afgeronde) lengtes — consistent met het al geleverde zaagschema (geen 2mm-samenvoeging).
const orderRood = packPatterns(stripLengths(res.RED).map((l) => Math.round(l)));
const orderGroen = packPatterns([...stripLengths(res.GREEN), ...stripLengths(res.PENNANTS)].map((l) => Math.round(l)));

// ── penanten (voetafdruk-clustering op PENNANTS) ─────────────────────────────────────────────
function penanten(r) {
  const items = r.elements; const thr = 350;
  const parent = items.map((_, i) => i); const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }; const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  const grid = new Map(); const key = (a, b) => a + ',' + b;
  items.forEach((it, i) => { const cx = Math.floor(it.wc[0] / thr), cy = Math.floor(it.wc[1] / thr); (grid.get(key(cx, cy)) || grid.set(key(cx, cy), []).get(key(cx, cy))).push(i); });
  items.forEach((it, i) => { const cx = Math.floor(it.wc[0] / thr), cy = Math.floor(it.wc[1] / thr); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const arr = grid.get(key(cx + dx, cy + dy)); if (!arr) continue; for (const j of arr) { if (j <= i) continue; const ddx = it.wc[0] - items[j].wc[0], ddy = it.wc[1] - items[j].wc[1]; if (ddx * ddx + ddy * ddy <= thr * thr) uni(i, j); } } });
  const groups = new Map(); items.forEach((_, i) => { const rt = find(i); (groups.get(rt) || groups.set(rt, []).get(rt)).push(i); });
  const clusters = [...groups.values()].filter((c) => c.length >= 5);
  const sideKey = (n) => { const q = (v) => Math.round(v * 20) / 20; return `${q(n[0]).toFixed(2)},${q(n[1]).toFixed(2)},${q(n[2]).toFixed(2)}`; };
  const pen = clusters.map((idxs) => {
    const els = idxs.map((i) => items[i]); const xs = els.map((e) => e.wc[0]), ys = els.map((e) => e.wc[1]);
    const sides = new Map();
    for (const e of els) { if (Math.abs(e.n[2]) > 0.5 || e.cat !== 'steenstrips') continue; const kk = sideKey(e.n); const s = sides.get(kk) || { n: e.n, cnt: 0, hist: new Map() }; s.cnt++; const sk = `${e.L}x${e.B}`; s.hist.set(sk, (s.hist.get(sk) || 0) + 1); sides.set(kk, s); }
    const sarr = [...sides.values()]; const front = sarr.reduce((m, s) => (s.cnt > m.cnt ? s : m), sarr[0] || { n: [1, 0, 0], cnt: 0 });
    const cats = { strips: els.filter((e) => e.cat === 'steenstrips').length, boards: els.filter((e) => e.cat === 'panelen').length, lats: els.filter((e) => e.cat === 'latten').length };
    return { center: [r1((Math.min(...xs) + Math.max(...xs)) / 2), r1((Math.min(...ys) + Math.max(...ys)) / 2)], front: front.n, nSides: sarr.length, cats, n: els.length };
  });
  // types
  const sig = (p) => `z${p.nSides};s${p.cats.strips};b${p.cats.boards};l${p.cats.lats}`;
  const typeMap = new Map(); pen.forEach((p) => typeMap.set(sig(p), (typeMap.get(sig(p)) || 0) + 1));
  const typeOrder = [...typeMap.entries()].sort((a, b) => b[1] - a[1]).map(([s], i) => [s, `T${i + 1}`]); const typeOf = new Map(typeOrder);
  // gevel + nummer
  const dirKey = (n) => `${Math.round(n[0])},${Math.round(n[1])},${Math.round(n[2])}`;
  pen.forEach((p) => { p.gevelDir = dirKey(p.front); });
  const gevels = [...new Set(pen.map((p) => p.gevelDir))].map((k) => ({ k, n: pen.find((p) => p.gevelDir === k).front })).sort((a, b) => Math.atan2(a.n[1], a.n[0]) - Math.atan2(b.n[1], b.n[0]));
  const letter = new Map(gevels.map((g, i) => [g.k, String.fromCharCode(65 + i)]));
  const perGevel = new Map(); pen.forEach((p, i) => { const L = letter.get(p.gevelDir); (perGevel.get(L) || perGevel.set(L, []).get(L)).push(i); });
  const rows = [];
  for (const [L, idxs] of [...perGevel.entries()].sort()) { const fa = (p) => [-p.front[1], p.front[0]]; idxs.sort((ia, ib) => { const a = pen[ia], b = pen[ib]; return (a.center[0] * fa(a)[0] + a.center[1] * fa(a)[1]) - (b.center[0] * fa(b)[0] + b.center[1] * fa(b)[1]); }); idxs.forEach((pi, kk) => { const p = pen[pi]; rows.push({ nummer: `${L}-${String(kk + 1).padStart(2, '0')}`, gevel: L, type: typeOf.get(sig(p)), zijden: p.nSides, elementen: p.n, x: p.center[0], y: p.center[1] }); }); }
  const types = typeOrder.map(([s, t]) => { const ex = pen.find((p) => sig(p) === s); return { type: t, aantal: typeMap.get(s), zijden: ex.nSides, strips: ex.cats.strips, boards: ex.cats.boards, latten: ex.cats.lats }; });
  return { rows, types };
}
const pen = penanten(res.PENNANTS);

// ── JSON schrijven ──────────────────────────────────────────────────────────────────────────
const out = {
  gegenereerd: 'brickboard extractie',
  samenvatting: Object.entries(res).map(([k, r]) => ({ deel: k, panelen: r.totals.panelen.count, paneel_m2: r.totals.panelen.m2, steenstrips: r.totals.steenstrips.count, strip_m2: r.totals.steenstrips.m2, latten: r.totals.latten.count, latten_m: r.totals.latten.m, gevels: r.gevels.length })),
  // Zaagverlies in m² = verlies-lengte × striphoogte 51 mm.
  bestellen: [['Rood', orderRood], ['Groen (incl. penanten)', orderGroen]].map(([kleur, o]) => ({
    kleur, hele_strippen: o.bins,
    ingekocht_m2: r1(o.ingekocht * 51 / 1e6), gevel_m2: r1(o.nuttig * 51 / 1e6),
    verlies_m2: r1(o.verlies * 51 / 1e6), verlies_pct: r1(100 * o.verlies / o.ingekocht),
    zaagsnede_m2: r1(o.kerf * 51 / 1e6), rest_m2: r1(o.rest * 51 / 1e6),
  })),
  panelenRED: res.RED.gevels.flatMap((g) => g.panels.map((p) => ({ nummer: p.num, gevel: g.letter, breedte: Math.round(2 * p.board.uHalf), hoogte: Math.round(2 * p.board.vHalf), elementen: [...new Set(p.memberPids)].length }))),
  panelenGREEN: res.GREEN.gevels.flatMap((g) => g.panels.map((p) => ({ nummer: p.num, gevel: g.letter, breedte: Math.round(2 * p.board.uHalf), hoogte: Math.round(2 * p.board.vHalf), elementen: [...new Set(p.memberPids)].length }))),
  penanten: pen.rows, penantTypes: pen.types,
  steenstrips: Object.fromEntries(Object.entries(res).map(([k, r]) => [k, stripSizes(r)])),
  latten: Object.fromEntries(Object.entries(res).map(([k, r]) => [k, lattenSizes(r)])),
  zaagRood: orderRood.patronen.map((p) => ({ patroon: fmtPat(p.pieces), stukken: p.pieces.length, strippen: p.aantal, rest_mm: p.rest })),
  zaagGroen: orderGroen.patronen.map((p) => ({ patroon: fmtPat(p.pieces), stukken: p.pieces.length, strippen: p.aantal, rest_mm: p.rest })),
};
const OUT = process.argv[2] || '.';
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/excel-data.json`, JSON.stringify(out), 'utf8');
console.log('samenvatting:', out.samenvatting.map((s) => `${s.deel} ${s.panelen}pan/${s.paneel_m2}m² ${s.steenstrips}strip ${s.latten}lat/${s.gevels}gev`).join(' | '));
console.log('bestellen:', out.bestellen.map((b) => `${b.kleur} ${b.hele_strippen}`).join(' | '));
console.log('panelen RED', out.panelenRED.length, '| GREEN', out.panelenGREEN.length, '| penanten', out.penanten.length, `(${out.penantTypes.length} types)`);
console.log('zaagpatronen Rood', out.zaagRood.length, '| Groen', out.zaagGroen.length);
console.log('JSON:', `${OUT}/excel-data.json`);
