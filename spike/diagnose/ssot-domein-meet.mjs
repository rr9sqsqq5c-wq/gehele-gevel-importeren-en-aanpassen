// READ-ONLY SSOT-MEETSPIKE — divergentie tussen consumenten van het bekledingsdomein.
// Importeert ECHTE productie-modules. Geen app-state/IFC nodig.
// Reconstrueert de extensie-semantiek van elk pad numeriek op IDENTIEKE input:
//   A) on-screen 2D-canvas / 3D / IFC  → gedeelde best-fit facadeData (maskRowsToContours)
//   B) Werktekening.jsx                → eigen buildFullGroupFacadePattern MET extend-args (geen mask)
//   C) Uittrekstaat.jsx                → eigen build (geen extend-args) + expliciete piece-extend
import { buildFullGroupFacadePattern } from "../../src/lib/pattern.js";
import { buildBestFitFacadePattern } from "../../src/lib/facadePlane.js";
import { buildFacadeZones } from "../../src/lib/panelization.js";

const MAT = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
function wo(lAxis, hAxis, tAxis, ls, le, hs, he, ts, te, outDir) {
  return { lengthAxis: lAxis, heightAxis: hAxis, thicknessAxis: tAxis, lengthStart: ls, lengthEnd: le, heightStart: hs, heightEnd: he, thicknessStart: ts, thicknessEnd: te, resolvedOutside: { outsideDir: outDir, outsidePos: outDir < 0 ? ts : te } };
}
const wall = { expressID: 'w1', length: 3000, height: 2870, openings: [], wallOrigin: wo('z', 'y', 'x', 0, 3000, 0, 2870, 0, 300, -1) };
const members = [wall];
const GW = 3000, EXT = 200;

function extent(rows) {
  let min = Infinity, max = -Infinity, n = 0;
  for (const r of rows) for (const p of r.pieces) { min = Math.min(min, p.start); max = Math.max(max, p.start + p.length); n++; }
  return { min, max, n };
}

console.log(`groupWidth=${GW}  extend L=R=${EXT} mm  (één handmatige groep)\n`);

// A) on-screen + IFC: gedeelde best-fit instantie (maskRowsToContours strip de extensie)
const A = buildBestFitFacadePattern(members, MAT, 'halfsteens', null, null, null, 0, EXT, EXT, 'y');
const eA = extent(A.rows);
console.log(`A) 2D-canvas / 3D / IFC  (allPatterns[id].facadeData, best-fit + mask)`);
console.log(`   strip piece-X bereik = [${eA.min} .. ${eA.max}]   ${eA.max<=GW+0.5&&eA.min>=-0.5?'🔴 tot rand, extensie WEG':'voorbij'}`);

// B) Werktekening.jsx: eigen build MET extend-args, GEEN mask
const B = buildFullGroupFacadePattern(members, MAT, 'halfsteens', null, null, null, 0, EXT, EXT);
const eB = extent(B.rows);
console.log(`B) Werktekening.jsx      (eigen buildFullGroupFacadePattern, extend-args, geen mask)`);
console.log(`   strip piece-X bereik = [${eB.min} .. ${eB.max}]   ${eB.max>GW+0.5||eB.min<-0.5?'🟢 VOORBIJ rand (extensie zichtbaar)':'tot rand'}`);

// C) Uittrekstaat.jsx: eigen build ZONDER extend-args + expliciete piece-extend (regels 60-61)
const Craw = buildFullGroupFacadePattern(members, MAT, 'halfsteens', null, null, null, 0, 0, 0);
const tL = 0, tR = 0, eL = EXT, eR = EXT; // extensie-only, geen trim
const Crows = Craw.rows.map((row) => {
  const xMin = tL, xMax = GW - tR;
  let pieces = row.pieces.flatMap((p) => {
    let ps = p.start, pe = p.start + p.length;
    if (pe <= xMin || ps >= xMax) return [];
    ps = Math.max(ps, xMin); pe = Math.min(pe, xMax);
    const len = pe - ps; if (len < 1) return [];
    return [{ ...p, start: ps, length: len }];
  });
  if (eL > 0 && pieces.length > 0) { const f = pieces[0]; pieces = [{ ...f, start: f.start - eL, length: f.length + eL }, ...pieces.slice(1)]; }
  if (eR > 0 && pieces.length > 0) { const l = pieces[pieces.length - 1]; pieces = [...pieces.slice(0, -1), { ...l, length: l.length + eR }]; }
  return { ...row, pieces };
});
const eC = extent(Crows);
console.log(`C) Uittrekstaat.jsx      (eigen build + expliciete piece-extend, regels 60-61)`);
console.log(`   strip piece-X bereik = [${eC.min} .. ${eC.max}]   ${eC.max>GW+0.5||eC.min<-0.5?'🟢 VOORBIJ rand (extensie zichtbaar)':'tot rand'}`);

// Panel-domein (alle paden): buildFacadeZones(groupWidth) — extensie bestaat niet
const zEdge = buildFacadeZones(GW, 2870, []);
console.log(`\nPANEEL-domein (buildFacadeZones(groupWidth)) overal: [0 .. ${zEdge[0].width}]  🔴 extensie nooit toegevoegd`);

console.log(`\nCONCLUSIE divergentie:`);
console.log(`  A (scherm/IFC) = [${eA.min}..${eA.max}]   B (Werktekening) = [${eB.min}..${eB.max}]   C (Uittrekstaat) = [${eC.min}..${eC.max}]`);
console.log(`  → A ${eA.max===eB.max?'==':'≠'} B en A ${eA.max===eC.max?'==':'≠'} C : de extensie verschijnt WEL in B/C maar NIET in A.`);
