// READ-ONLY MEETSPIKE — handmatige extensie "tot rand, nooit voorbij".
// Importeert de ECHTE productie-modules. Geen app-state, geen IFC nodig.
// Doel: numeriek bewijzen WAAR de extensie verdwijnt.
//   1) buildFullGroupFacadePattern  → bouwt strips MET extensie (effectiveWidth)
//   2) buildBestFitFacadePattern     → zelfde + maskRowsToContours (de clip-stap)
import { buildFullGroupFacadePattern } from "../../src/lib/pattern.js";
import { buildBestFitFacadePattern, fitFacadePlane } from "../../src/lib/facadePlane.js";
import { buildFacadeZones } from "../../src/lib/panelization.js";

const MAT = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
function wo(lAxis, hAxis, tAxis, ls, le, hs, he, ts, te, outDir) {
  return { lengthAxis: lAxis, heightAxis: hAxis, thicknessAxis: tAxis, lengthStart: ls, lengthEnd: le, heightStart: hs, heightEnd: he, thicknessStart: ts, thicknessEnd: te, resolvedOutside: { outsideDir: outDir, outsidePos: outDir < 0 ? ts : te } };
}
// Eén wand, footprint 0..3000 mm (groupWidth = 3000). Y-up.
const wall = { expressID: 'w1', length: 3000, height: 2870, openings: [], wallOrigin: wo('z', 'y', 'x', 0, 3000, 0, 2870, 0, 300, -1) };
const members = [wall];

function extent(fd) {
  let min = Infinity, max = -Infinity, n = 0;
  for (const r of fd.rows) for (const p of r.pieces) { min = Math.min(min, p.start); max = Math.max(max, p.start + p.length); n++; }
  return { min, max, n, rows: fd.rows.length };
}

const EXT = 200; // handmatige extensie rechts + links, hoog gezet
console.log(`groupWidth (wand-footprint) = 3000 mm; extensie L=${EXT} R=${EXT} mm\n`);

// ── 1. buildFullGroupFacadePattern: GEEN mask (auto-groep pad / niet best-fit) ──
const full0 = buildFullGroupFacadePattern(members, MAT, 'halfsteens', null, null, null, 0, 0, 0);
const full2 = buildFullGroupFacadePattern(members, MAT, 'halfsteens', null, null, null, 0, EXT, EXT);
const e_full0 = extent(full0), e_full2 = extent(full2);
console.log('[1] buildFullGroupFacadePattern  (zonder maskRowsToContours)');
console.log(`    extensie 0  : piece-X bereik [${e_full0.min} .. ${e_full0.max}]  pieces=${e_full0.n} rows=${e_full0.rows}`);
console.log(`    extensie ${EXT}: piece-X bereik [${e_full2.min} .. ${e_full2.max}]  pieces=${e_full2.n} rows=${e_full2.rows}`);
console.log(`    → strips lopen ${e_full2.max - 3000} mm voorbij rechterrand, ${0 - e_full2.min} mm voorbij linkerrand  ${(e_full2.max>3000.5||e_full2.min<-0.5)?'(VOORBIJ RAND ✅ intern langer)':'(NIET voorbij)'}\n`);

// ── 2. buildBestFitFacadePattern: MET maskRowsToContours (handmatige groep, default) ──
const plane = fitFacadePlane(members, 'y');
const bf0 = buildBestFitFacadePattern(members, MAT, 'halfsteens', null, null, null, 0, 0, 0, 'y');
const bf2 = buildBestFitFacadePattern(members, MAT, 'halfsteens', null, null, null, 0, EXT, EXT, 'y');
const e_bf0 = extent(bf0), e_bf2 = extent(bf2);
console.log('[2] buildBestFitFacadePattern    (MET maskRowsToContours — clip-stap)');
console.log(`    clip-polygon (element-rechthoek) t-bereik: [${plane ? 0 : '?'} .. ${wall.wallOrigin.lengthEnd - wall.wallOrigin.lengthStart}]  (= groupWidth, uit wand-bbox)`);
console.log(`    extensie 0  : piece-X bereik [${e_bf0.min} .. ${e_bf0.max}]  pieces=${e_bf0.n} rows=${e_bf0.rows}`);
console.log(`    extensie ${EXT}: piece-X bereik [${e_bf2.min} .. ${e_bf2.max}]  pieces=${e_bf2.n} rows=${e_bf2.rows}`);
console.log(`    → na mask: max=${e_bf2.max} (rand=3000), min=${e_bf2.min} (rand=0)  ${(e_bf2.max<=3000.5&&e_bf2.min>=-0.5)?'(TERUGGEKLEMD NAAR RAND 🔴 extensie weg)':'(voorbij)'}\n`);

// ── 3. Panelen: domein = buildFacadeZones(groupWidth, ...) — extensie komt er niet in ──
const zonesNoExt = buildFacadeZones(3000, 2870, []);
console.log('[3] buildFacadeZones (panel-domein)  — krijgt groupWidth, GEEN extensie-parameter');
console.log(`    zones bij groupWidth=3000: ${JSON.stringify(zonesNoExt.map(z => ({ x: z.x, w: z.width })))}`);
console.log(`    → paneel-domein is [0 .. ${zonesNoExt[0].width}] = wand-footprint; extensie wordt nooit toegevoegd 🔴\n`);

console.log('SAMENVATTING:');
console.log(`  • Strips worden intern WEL verlengd (pad 1: ${e_full2.min}..${e_full2.max}), maar de mask knipt terug naar 0..3000 (pad 2).`);
console.log(`  • Pieces-telling extensie 0 vs ${EXT} (full): ${e_full0.n} → ${e_full2.n} (verandert: extra randstuk). Best-fit: ${e_bf0.n} → ${e_bf2.n}.`);
console.log(`  • Panelen/latten krijgen alleen groupWidth → domein wand-begrensd, extensie bestaat daar niet.`);
