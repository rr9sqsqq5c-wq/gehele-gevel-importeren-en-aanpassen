// Smoketest: draait het browser-lib src/lib/ghCladding.js op de 3 echte bestanden en
// vergelijkt met de bekende spike-uitkomsten (RED 549 panelen/13 gevels, GREEN 928/7).
import fs from 'node:fs';
import { parseGhCladding, buildGevelSvg, buildNumberedIfc } from '../src/lib/ghCladding.js';
const D = 'C:/Users/MurkAnneKooistraKooi/Downloads';
const files = [
  ['28072026-BUILDING-1-RED-FACADES.ifc', 'RED', { panelen: 549, gevels: 13 }],
  ['28072026-BUILDING-1-2-GREEN-FACADES.ifc', 'GREEN', { panelen: 928, gevels: 7 }],
  ['28072026-BUILDING-1-2-PENNANTS.ifc', 'PENANTS', null],
];
let allOk = true;
for (const [fn, label, exp] of files) {
  const text = fs.readFileSync(`${D}/${fn}`, 'latin1');
  const t0 = Date.now();
  const res = parseGhCladding(text);
  const ms = Date.now() - t0;
  if (!res.ok) { console.log(`${label}: NIET herkend (${res.reason})`); allOk = false; continue; }
  console.log(`\n===== ${label} (${ms} ms) =====`);
  console.log(`  ok=${res.ok} isGh=${res.isGh} | elementen ${res.elements.length}`);
  console.log(`  totalen: panelen ${res.totals.panelen.count} (${res.totals.panelen.m2} m²) · steenstrips ${res.totals.steenstrips.count} · latten ${res.totals.latten.count} (${res.totals.latten.m} m)`);
  console.log(`  gevels ${res.gevels.length} | panelen(in gevels) ${res.totalPanels} | niet-toegewezen strippen/latten ${res.unassigned}`);
  console.log(`  gevels: ${res.gevels.map((g) => `${g.letter}:${g.panels.length}`).join(' ')}`);
  // SVG + numbered IFC
  const svg = buildGevelSvg(res.gevels[0], '#6f8a3f');
  const num = buildNumberedIfc(text, res);
  console.log(`  buildGevelSvg(gevel ${res.gevels[0].letter}): ${svg.length} chars, rects=${(svg.match(/<rect/g) || []).length}`);
  console.log(`  buildNumberedIfc: +${num.length - text.length} chars, eindigt op END-ISO=${/END-ISO-10303-21;\s*$/.test(num.trim())}`);
  if (exp) {
    const okP = res.totalPanels === exp.panelen, okG = res.gevels.length === exp.gevels;
    console.log(`  CHECK panelen ${res.totalPanels}==${exp.panelen} ${okP ? '🟢' : '🔴'} | gevels ${res.gevels.length}==${exp.gevels} ${okG ? '🟢' : '🔴'}`);
    if (!okP || !okG) allOk = false;
  }
}
console.log(`\n${allOk ? '🟢 ALLE CHECKS GROEN' : '🔴  er zijn afwijkingen'}`);
