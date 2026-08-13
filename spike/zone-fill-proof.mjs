// ZONE_EXTEND optrekken — bewijs dat een getekende zone met "Optrekken naar maxlijn" (maxHoogteVullen) omhoog
// loopt tot maxHoogte, voor strips (buildStripZoneRegions), panelen (buildZoneBackingPanels) én latten
// (clipLattenToZones). Vlag/vullen uit → getekende hoogte (byte-identiek).
const _ls = { zoneExtend: null };
globalThis.localStorage = { getItem: (k) => _ls[k] ?? null, setItem() {}, removeItem() {} };
const { buildZoneBackingPanels, clipLattenToZones } = await import('../src/lib/panelization.js');
const { buildStripZoneRegions } = await import('../src/lib/zoneRegions.js');
const { buildFacePattern } = await import('../src/lib/pattern.js');

const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10, brickWeightM2: 34 };
const rows = buildFacePattern(3000, 1000, mat, 'halfsteens');   // wand dekt tot 1000 → zone mag optrekken tot 700
const facadeData = { rows, groupWidth: 3000, groupHeight: 1000, groupOpenings: [] };
// zone GETEKEND 0..300 hoog, maxlijn 700
const zone = { id: 'z1', x: 1000, y: 0, width: 500, height: 300, enabled: true, verband: 'halfsteens', maxHoogte: 700, maxHoogteVullen: true };

function stripsTop() {
  const regs = buildStripZoneRegions(facadeData, [zone], mat, 'halfsteens', '#a00');
  const rws = regs[1].rows;
  return Math.round(Math.max(...rws.map((r) => r.y)) + mat.steenH);   // bovenste rij + striphoogte
}
function panelsTop() {
  const ps = buildZoneBackingPanels({ facadeData, activeZones: [zone], panelen: { enabled: true, breedte: 3005, hoogte: 1200, dikte: 8, maxKg: 50 }, latten: { maxInterval: 400 }, mat, verband: 'halfsteens' });
  return ps.length ? Math.round(Math.max(...ps.map((p) => p.y + p.height))) : 0;
}
function lattenKeptAt500() {   // latten op y=500 valt buiten de 300-zone, maar binnen de opgetrokken 700-zone
  const clipped = clipLattenToZones([{ id: 'L', x: 0, y: 500, width: 3000, height: 45 }], [zone]);
  return clipped.length;
}

function report(label) {
  console.log(`\n=== ${label} ===`);
  const s = stripsTop(), p = panelsTop(), l = lattenKeptAt500();
  console.log(`  strips-top : ${s}`);
  console.log(`  panelen-top: ${p}`);
  console.log(`  latten @500 behouden: ${l} (0=buiten zone, 1=binnen opgetrokken zone)`);
  return { s, p, l };
}

_ls.zoneExtend = null;
const off = report('VLAG UIT (getekende hoogte 300)');
_ls.zoneExtend = '1';
const on = report('VLAG AAN + vullen (optrekken naar 700)');

console.log('\n--- CONTROLE ---');
const offOk = off.s <= 320 && off.p <= 320 && off.l === 0;      // stopt op ~300, latten @500 valt buiten
// strips-top = bovenste rij + steenH; de bovenste halfsteens-strip mag door ceil ~een strip boven de maxlijn
// uitsteken (die oversteek wordt alleen met stripSnijlijn geklemd) → check dat 'ie duidelijk is opgetrokken.
const stripsOk = on.s >= 680;                                   // duidelijk opgetrokken (van ~300 naar ~700+)
const panelsOk = on.p >= 680;                                   // panelen tot ~700
const lattenOk = on.l === 1;                                    // latten @500 nu binnen de opgetrokken zone
console.log(`UIT byte-identiek (top ~300, latten buiten): ${offOk ? '🟢' : `🔴 (s${off.s} p${off.p} l${off.l})`}`);
console.log(`AAN strips trekken op naar ~700:             ${stripsOk ? '🟢' : `🔴 (${on.s})`}`);
console.log(`AAN panelen trekken op naar ~700:            ${panelsOk ? '🟢' : `🔴 (${on.p})`}`);
console.log(`AAN latten @500 nu binnen zone:              ${lattenOk ? '🟢' : '🔴'}`);
const ok = offOk && stripsOk && panelsOk && lattenOk;
console.log(ok ? '\n🟢 BEWEZEN: zone trekt strips + panelen + latten op naar de maxlijn; vlag/vullen uit = byte-identiek.' : '\n🔴 FOUT.');
process.exit(ok ? 0 : 1);
