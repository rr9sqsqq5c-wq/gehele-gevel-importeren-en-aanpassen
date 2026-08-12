// READ-ONLY MEETSPIKE — kan de BOVENrand verlengd worden (extendTop), zoals links/rechts?
// Echte productie-modules. Synthetische wand [0..3000]×[0..2870], thin=z (Y-up).
import { buildFullGroupFacadePattern } from "../../src/lib/pattern.js";
import { buildBestFitFacadePattern } from "../../src/lib/facadePlane.js";
import { buildFacadeZones, computeHorizontalLatten } from "../../src/lib/panelization.js";

const MAT = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
function wo(lA, hA, tA, ls, le, hs, he, ts, te, od = -1) {
  return { lengthAxis: lA, heightAxis: hA, thicknessAxis: tA, lengthStart: ls, lengthEnd: le, heightStart: hs, heightEnd: he, thicknessStart: ts, thicknessEnd: te, resolvedOutside: { outsideDir: od, outsidePos: od < 0 ? ts : te } };
}
const wall = { expressID: 'w1', length: 3000, height: 2870, openings: [], wallOrigin: wo('x', 'y', 'z', 0, 3000, 0, 2870, 0, 250) };
const members = [wall];
const GH = 2870, ROWH = MAT.steenH;
const stripTop = (fd) => fd && fd.rows.length ? Math.max(...fd.rows.map(r => r.y + ROWH)) : null;

console.log(`groupHeight (wand-bbox) = ${GH} mm  (steenH=${ROWH}, lagenmaat=${MAT.steenH + MAT.lint})\n`);

// ── T1/T2: verticale generatie-grens van strips ──
const full = buildFullGroupFacadePattern(members, MAT, 'halfsteens', null, null, null, 0);
console.log(`[1] buildFullGroupFacadePattern (geen maxHoogte): hoogste strip-top = ${stripTop(full)} mm  (≈ groupHeight)`);

// maxHoogte HOGER dan groupHeight → effectiveHeight = min(GH, maxHoogte) = GH → géén extra koersen
const fullHi = buildFullGroupFacadePattern(members, MAT, 'halfsteens', GH + 500, null, null, 0);
console.log(`[2] maxHoogte=${GH + 500} (>groupHeight): hoogste strip-top = ${stripTop(fullHi)} mm  ${stripTop(fullHi) <= stripTop(full) + 0.5 ? '🔴 GEEN extra koersen (cap = groupHeight; min() verlaagt alleen)' : 'extra koersen'}`);
console.log(`    → er bestaat GEEN parameter die koersen BOVEN de wandtop genereert (vgl. horizontaal effectiveWidth=groupWidth+extL+extR, pattern.js:445).`);

// ── best-fit: zelfde cap + de mask dropt boven-wand-rijen (verticale clip) ──
const bf = buildBestFitFacadePattern(members, MAT, 'halfsteens', null, null, null, 0, 0, 0, 'y');
console.log(`\n[3] buildBestFitFacadePattern: hoogste strip-top = ${stripTop(bf)} mm`);

// Repliceer de VERTICALE component van maskRowsToContours (facadePlane.js:174): rijen met
// r.u1 < y-0.5 worden gedropt. Voer een synthetische rij BOVEN de wandtop in → wordt gedropt.
function maskVerticalKeeps(rowY) {
  const u1 = GH; // wand heightEnd - groupMinH
  const u0 = 0;
  return !(u0 <= rowY + ROWH + 0.5 && u1 >= rowY - 0.5) ? false : true;
}
const above = GH + 200;
console.log(`[4] mask-verticaal: een koers op y=${above} (boven wandtop ${GH}) → ${maskVerticalKeeps(above) ? 'behouden' : '🔴 GEDROPT (facadePlane.js:174 u1-filter)'}`);
console.log(`    → óók als generatie wél boven de top zou bouwen, knipt de best-fit mask die rijen weg. Extra: verticale-clip-keep nodig.`);

// ── T3: panelen & latten verticale bovengrens ──
const zones = buildFacadeZones(3000, GH, []);
console.log(`\n[5] PANELEN buildFacadeZones(groupWidth, groupHeight): zone-top = ${zones[0].y + zones[0].height} mm (= groupHeight) 🔴 geen extendTop-param`);

const lats = computeHorizontalLatten({ facadeData: full, latten: { enabled: true, maxInterval: 400, breedte: 50 }, mat: MAT, panelen: {}, zetwerk: null, startLijn: null, backingType: 'hout' });
const latTop = lats.length ? Math.max(...lats.map(l => l.y + l.height)) : null;
console.log(`[6] LATTEN computeHorizontalLatten: hoogste lat-top = ${latTop} mm (begrensd door groupHeight, panelization.js:294,306) 🔴 geen extendTop-param`);

console.log(`\nSAMENVATTING:`);
console.log(`  • Strips: generatie hard gecapt op groupHeight (pattern.js:308,316); geen over-build (anders dan horizontaal).`);
console.log(`  • Best-fit mask dropt ook boven-wand-rijen (facadePlane.js:174).`);
console.log(`  • Panelen (groupHeight) en latten (groupHeight) delen dezelfde verticale bron.`);
console.log(`  ⇒ extendTop vereist (a) generatie-grens ophogen ÉN (b) verticale-clip-keep — méér dan Fase 1 (clip-only).`);
