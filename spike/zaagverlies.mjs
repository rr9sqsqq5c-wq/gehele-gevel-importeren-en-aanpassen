// Zaagverlies per kleur = ingekocht (hele strippen × 221) − nuttig (op de gevel). Splitsing in
// zaagsnede (3mm kerf) en reststukken. Zelfde best-fit als het geleverde zaagschema (exacte lengtes).
import fs from 'node:fs';
import { parseGhCladding } from '../src/lib/ghCladding.js';
const D = 'C:/Users/MurkAnneKooistraKooi/Downloads';
const F = { RED: '28072026-BUILDING-1-RED-FACADES.ifc', GREEN: '28072026-BUILDING-1-2-GREEN-FACADES.ifc', PENNANTS: '28072026-BUILDING-1-2-PENNANTS.ifc' };
const res = Object.fromEntries(Object.entries(F).map(([k, fn]) => [k, parseGhCladding(fs.readFileSync(`${D}/${fn}`, 'latin1'))]));
const closest51 = (e) => (Math.abs(e.L - 51) <= Math.abs(e.B - 51) ? e.L : e.B);
const lengthOf = (e) => (Math.abs(e.L - 51) >= Math.abs(e.B - 51) ? e.L : e.B);
function stripLengths(r) { const out = []; for (const e of r.elements) { if (e.cat !== 'steenstrips') continue; const h = closest51(e); if (Math.abs(h - 51) > 4 || e.D < 19 || e.D > 27) continue; out.push(Math.round(lengthOf(e))); } return out; }
const STOCK = 221, KERF = 3, BIN = STOCK + KERF;
function pack(lens) {
  const items = [...lens].sort((a, b) => b - a); const bins = []; const byRem = new Map();
  for (const len of items) { const c = len + KERF; let r = -1; for (let x = c; x <= BIN; x++) { const a = byRem.get(x); if (a && a.length) { r = x; break; } } if (r >= 0) { const idx = byRem.get(r).pop(); const bn = bins[idx]; bn.pieces.push(len); bn.rem = r - c; (byRem.get(bn.rem) || byRem.set(bn.rem, []).get(bn.rem)).push(idx); } else { const idx = bins.length; bins.push({ rem: BIN - c, pieces: [len] }); (byRem.get(BIN - c) || byRem.set(BIN - c, []).get(BIN - c)).push(idx); } }
  return bins;
}
function verlies(label, lens) {
  const bins = pack(lens);
  const stukken = lens.length;
  const nuttig = lens.reduce((s, l) => s + l, 0);           // mm op de gevel
  const ingekocht = bins.length * STOCK;                     // mm ingekocht
  const totaal = ingekocht - nuttig;                         // totaal zaagverlies mm
  // splitsing: zaagsnede = 3mm × aantal sneden; snede = per strip (pieces) − (0 als rest≈0 anders +eind-snede)
  let sneden = 0;
  for (const b of bins) { const rest = STOCK - b.pieces.reduce((s, x) => s + x, 0) - KERF * (b.pieces.length - 1); sneden += (rest > 0.5 ? b.pieces.length : b.pieces.length - 1); }
  const kerf = sneden * KERF;
  const rest = totaal - kerf;
  console.log(`\n=== ${label} ===`);
  console.log(`  strippen ingekocht : ${bins.length}  (= ${(ingekocht / 1000).toFixed(1)} m)`);
  console.log(`  op de gevel (nuttig): ${(nuttig / 1000).toFixed(1)} m  (${stukken} stukken)`);
  const HM = 51, m2 = (mm) => (mm * HM) / 1e6;   // strip-oppervlak = lengte × hoogte 51 mm
  console.log(`  --- in m² (striphoogte ${HM} mm) ---`);
  console.log(`  strip-oppervlak ingekocht : ${m2(ingekocht).toFixed(1)} m²`);
  console.log(`  op de gevel (nuttig)      : ${m2(nuttig).toFixed(1)} m²`);
  console.log(`  ZAAGVERLIES               : ${m2(totaal).toFixed(1)} m²  = ${(100 * totaal / ingekocht).toFixed(1)}%`);
  console.log(`     • zaagsnedes (3mm)     : ${m2(kerf).toFixed(2)} m²`);
  console.log(`     • reststukken          : ${m2(rest).toFixed(2)} m²`);
  return { bins: bins.length, totaal, ingekocht, m2v: m2(totaal), m2i: m2(ingekocht) };
}
const rood = verlies('ROOD', stripLengths(res.RED));
const groen = verlies('GROEN (incl. penanten)', [...stripLengths(res.GREEN), ...stripLengths(res.PENNANTS)]);
console.log(`\n=== SAMEN ===`);
console.log(`  totaal ingekocht: ${rood.bins + groen.bins} strippen`);
console.log(`  totaal zaagverlies: ${(rood.m2v + groen.m2v).toFixed(1)} m² = ${(100 * (rood.totaal + groen.totaal) / (rood.ingekocht + groen.ingekocht)).toFixed(1)}%`);
