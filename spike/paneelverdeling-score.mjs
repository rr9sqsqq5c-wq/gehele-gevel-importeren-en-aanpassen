// READ-ONLY MEET-TOOL (spike, raakt de motor niet) — geeft een RAPPORTCIJFER aan de HUIDIGE
// paneelverdeling, zodat we later verbetervoorstellen er eerlijk tegen kunnen afzetten.
// Criteria uit de klant-randvoorwaarden:
//   • breedte: naad mag alleen in een stootvoeg → gemeten als # koppelstrippen (stenen die over een
//     paneelnaad lopen = door de strip gezaagd i.p.v. in de voeg). Minder = beter.
//   • breedte-gelijkheid per rij: spreiding + snippers (<300mm) / klein (300–500mm).
//   • gewicht: ≤50 kg ok, 50–60 kg getolereerd, >60 kg fout.
//   • hoogte: halfsteens → EVEN aantal lagen, behalve panelen tegen de zone-boven/onderrand of een opening.
import { buildZoneBackingPanels, detectKoppelstrippen } from '../src/lib/panelization.js';
import { buildFacePattern } from '../src/lib/pattern.js';

// spike-schakelaar: forceer de vlag paneelOptimalisatie aan/uit (readFlag leest localStorage bij elke call).
let FLAG_ON = false;
globalThis.localStorage = { getItem: (k) => (k === 'paneelOptimalisatie' && FLAG_ON) ? '1' : null, setItem() {}, removeItem() {} };

const STRIP_KG = 0.472;   // gewicht PER steenstrip (klantopgave)
const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10, stripKg: STRIP_KG };   // stripKg → motor leidt kg/m² af
const moduleM2 = ((mat.steenL + mat.stoot) * (mat.steenH + mat.lint)) / 1e6;   // vlak per strip incl. voegen (m²)
mat.brickWeightM2 = STRIP_KG / moduleM2;   // strip-gewicht per m² (≈ 0,472 / 0,01364 = 34,6) — voor de score-kg
const panelen = { enabled: true, breedte: 3005, hoogte: 1200, gewichtM2: 11.8, maxKg: 50 }; // basisplaat 11,8 kg/m²
const latten = { enabled: true, maxInterval: 400 };
const lagenmaat = mat.steenH + mat.lint;                 // 62
const gewichtM2 = mat.brickWeightM2 + panelen.gewichtM2; // ≈ 34,6 + 11,8 = 46,4 kg/m²

// afkap-grenzen (instelbaar; bepalen alleen het cijfer, niet de motor)
const SLIVER = 300, KLEIN = 500, KG_OK = 50, KG_MAX = 60;
const STRAF = { sliver: 2, klein: 0.5, kg_over: 3, kg_grens: 0.5, oneven: 1, spread: 1, fase: 8 };

function zoneStripRows(zone) {
  const rows = buildFacePattern(zone.width, zone.height, mat, zone.verband ?? 'halfsteens');
  return rows.map((r) => ({ y: r.y + zone.y, pieces: r.pieces.map((p) => ({ ...p, start: p.start + zone.x })) }));
}
const kg = (p) => (p.width * p.height / 1e6) * gewichtM2;

function score(naam, zone, openings = []) {
  const facadeData = { groupWidth: zone.x + zone.width + 300, groupHeight: zone.y + zone.height + 300, groupOpenings: openings };
  const panels = buildZoneBackingPanels({ facadeData, activeZones: [zone], panelen, latten, mat, verband: 'geen' });
  const zTop = zone.y + zone.height, zBot = zone.y;
  const opYs = openings.flatMap((o) => [o.y, o.y + o.height]);
  const raaktGrens = (p) => Math.abs(p.y - zBot) < 1 || Math.abs(p.y + p.height - zTop) < 1 || opYs.some((y) => Math.abs(p.y - y) < 1 || Math.abs(p.y + p.height - y) < 1);

  // per rij (zelfde y) groeperen
  const rijen = {}; for (const p of panels) { const k = Math.round(p.y); (rijen[k] ??= []).push(p); }
  let slivers = 0, klein = 0, spreadStraf = 0;
  for (const k of Object.keys(rijen)) {
    const ws = rijen[k].map((p) => Math.round(p.width));
    for (const w of ws) { if (w < SLIVER) slivers++; else if (w < KLEIN) klein++; }
    const spread = Math.max(...ws) - Math.min(...ws);
    if (ws.length > 1) spreadStraf += Math.min(1, spread / 1090);   // 0..1 per rij
  }
  const overKg = panels.filter((p) => kg(p) > KG_MAX).length;
  const grensKg = panels.filter((p) => kg(p) > KG_OK && kg(p) <= KG_MAX).length;
  const zwaarste = panels.length ? Math.max(...panels.map(kg)) : 0;
  // hoogte: oneven aantal lagen bij een NIET-begrensd paneel = fout (halfsteens)
  const oneven = panels.filter((p) => { const n = Math.round(p.height / lagenmaat); return (n % 2 === 1) && !raaktGrens(p); }).length;
  // ZAAGBAARHEID = FASE: koppelstrippen horen enkel OM-EN-OM te zitten (elke andere laag schoon).
  // Meet het % lagen dat een koppelstrip heeft: 50% = ideaal (om-en-om); richting 100% = fase gebroken
  // (naden in verschillende stootvoeg-fase) → straf. De rauwe telling zelf is inherent (rechte naad).
  const _stripRows = zoneStripRows(zone);
  const kopList = detectKoppelstrippen(panels, _stripRows, mat, zone.verband ?? 'halfsteens');
  const _courses = new Set(_stripRows.map((r) => Math.round(r.y))).size || 1;
  const gevelPct = new Set(kopList.map((k) => Math.round(k.y))).size / _courses;
  const koppel = kopList.length;
  const faseStraf = Math.max(0, gevelPct - 0.5) * STRAF.fase;

  const straf = slivers * STRAF.sliver + klein * STRAF.klein + overKg * STRAF.kg_over + grensKg * STRAF.kg_grens
    + oneven * STRAF.oneven + spreadStraf * STRAF.spread + faseStraf;
  const cijfer = Math.max(0, Math.min(10, 10 - straf));

  console.log(`\n■ ${naam}  (${panels.length} panelen)`);
  const perRij = Object.keys(rijen).sort((a, b) => a - b).map((k) => rijen[k].sort((a, b) => a.x - b.x).map((p) => Math.round(p.width)).join('·'));
  console.log(`  breedtes per rij : ${perRij.join('   |   ')}`);
  console.log(`  snippers <300 : ${slivers}   klein 300–500 : ${klein}   spreiding-straf : ${spreadStraf.toFixed(2)}`);
  console.log(`  gewicht : >60kg ${overKg}   50–60kg ${grensKg}   zwaarste ${zwaarste.toFixed(1)} kg`);
  console.log(`  hoogte  : oneven-lagen (niet-begrensd) ${oneven}`);
  console.log(`  zaagbaarheid : ${koppel} koppelstrippen · gevel-breed ${Math.round(gevelPct * 100)}% v.d. lagen → ${gevelPct <= 0.55 ? 'om-en-om ✓' : 'fase gebroken ✗'}`);
  console.log(`  ➜ RAPPORTCIJFER: ${cijfer.toFixed(1)} / 10   (strafpunten ${straf.toFixed(2)})`);
  return cijfer;
}

const ZONES = [
  ['zone 2400×1000 (snipper-geval)', { id: 'a', x: 0, y: 0, width: 2400, height: 1000, verband: 'halfsteens', enabled: true }, []],
  ['zone 2860×1600', { id: 'b', x: 0, y: 0, width: 2860, height: 1600, verband: 'halfsteens', enabled: true }, []],
  ['zone 4000×2600', { id: 'c', x: 0, y: 0, width: 4000, height: 2600, verband: 'halfsteens', enabled: true }, []],
  ['zone 5000×2800 met raam 1600–2400 × 600–1800', { id: 'd', x: 0, y: 0, width: 5000, height: 2800, verband: 'halfsteens', enabled: true },
    [{ x: 1600, y: 600, width: 800, height: 1200, type: 'raam' }]],
];

function runSet(label, flagOn) {
  FLAG_ON = flagOn;
  console.log(`\n########## ${label} ##########`);
  const c = ZONES.map(([naam, z, ops]) => score(naam, z, ops));
  const avg = c.reduce((a, b) => a + b, 0) / c.length;
  console.log(`\n=== GEMIDDELD ${label}: ${avg.toFixed(1)} / 10 ===`);
  return avg;
}

const base = runSet('HUIDIG (vlag uit)', false);
const opt = runSet('OPTIMALISATIE (vlag aan)', true);
console.log(`\n============================================`);
console.log(`  HUIDIG          : ${base.toFixed(1)} / 10`);
console.log(`  GEOPTIMALISEERD : ${opt.toFixed(1)} / 10   (${opt >= base ? '+' : ''}${(opt - base).toFixed(1)})`);
console.log(`============================================`);
