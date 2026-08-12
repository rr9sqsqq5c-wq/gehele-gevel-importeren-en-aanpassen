// READ-ONLY VERIFY — "geen verband" + halfsteens-zone.
// BUG-REPRO + FIX-CHECK: de behouden dekking (coverageRows) is voor 'geen' een DOORLOPEND
// verband met verticaal UITGELIJNDE stootvoeg-gaten. Knip je een halfsteens-zone daartegen,
// dan ontstaat op elk uitgelijnd voeg-gat een notch → notches boven elkaar = VERTICALE LIJNEN.
// De fix: de dekking "dichtmaken" (mortelvoegen vullen) zodat het de WANDOPPERVLAK is (minus
// openingen), geen bond. Dan worden zone-stenen niet op de voegen genotcht.
import { buildStripZoneRegions, solidifyRows } from '../src/lib/zoneRegions.js';
import { buildFacePattern } from '../src/lib/pattern.js';

const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };

// ECHTE 'geen'-dekking: het doorlopende fallback-verband (buildRowPiecesForWidth zonder kop-offset).
// Vol-breedte 0..2000, dus stootvoeg-gaten op 210-220, 430-440, 650-660, ... (UITGELIJND).
const geenRows = buildFacePattern(2000, 1240, mat, 'geen');

const zones = [{ id: 'z1', x: 500, y: 0, width: 800, height: 500, verband: 'halfsteens', bondAnchor: 'zoneBottomLeft', enabled: true }];

// Detecteer VERTICALE notch-lijnen: x-posities waar in ≥3 zone-rijen een piece-rand ligt die
// NIET de zonerand (500/1300) is. Uitgelijnde binnenranden = de ongewenste verticale lijnen.
// Een DOORLOPENDE verticale lijn = een binnenrand die in (bijna) ELKE zone-rij op dezelfde x ligt.
// De natuurlijke halfsteens-perpend verspringt (ligt in ~de helft van de rijen) en telt NIET mee.
function verticalNotchLines(zoneRows) {
  const edgeCount = new Map();
  for (const r of zoneRows) {
    const xs = new Set();
    for (const p of r.pieces) { xs.add(Math.round(p.start)); xs.add(Math.round(p.start + p.length)); }
    for (const x of xs) if (x > 501 && x < 1299) edgeCount.set(x, (edgeCount.get(x) ?? 0) + 1);
  }
  const need = Math.max(3, zoneRows.length - 1);   // bijna elke rij → doorlopende lijn
  return [...edgeCount.entries()].filter(([, n]) => n >= need).map(([x]) => x).sort((a, b) => a - b);
}

function run(label, coverageRows) {
  const facadeData = { groupWidth: 2000, groupHeight: 1240, groupOpenings: [], rows: [], coverageRows };
  const regions = buildStripZoneRegions(facadeData, zones, mat, 'geen', '#a64033', {});
  const zoneRows = regions?.[1]?.rows ?? [];
  const notches = verticalNotchLines(zoneRows);
  const pieces = zoneRows.reduce((n, r) => n + r.pieces.length, 0);
  console.log(`${label}: ${zoneRows.length} rijen, ${pieces} stukken, uitgelijnde binnenranden:`, notches);
  return notches;
}

console.log('--- ZONDER fix: rauwe (gappy) dekking ---');
const before = run('  gappy', geenRows);

console.log('--- MET fix: dichtgemaakte dekking (solidifyRows) ---');
const after = run('  solid', solidifyRows(geenRows, mat.stoot + 2));

// Verwacht: gappy → meerdere uitgelijnde binnenranden (de verticale lijnen); solid → geen (0/1).
const ok = before.length >= 2 && after.length === 0;
console.log(ok
  ? `\n✅ Oorzaak bevestigd én gefixt: gappy had ${before.length} verticale lijnen, solid heeft er ${after.length}.`
  : `\n❌ Onverwacht: before=${before.length}, after=${after.length}`);
process.exit(ok ? 0 : 1);
