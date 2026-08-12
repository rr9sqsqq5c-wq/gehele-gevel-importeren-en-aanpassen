// WEGWERP (spike/) — VALIDATE: overschrijft een eigen zone-steenstrip de groep-stripArt?
globalThis.localStorage = { getItem: () => null, setItem(){}, removeItem(){} };
const { buildStripZoneRegions } = await import('../../src/lib/zoneRegions.js');

const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
const groupStripArt = { steenL: 300, steenH: 80 }; // groep-keuze (opts.stripArt)
const lagen = 50 + 12;
const facadeData = {
  groupWidth: 4000, groupHeight: 620, groupOpenings: [],
  rows: Array.from({ length: 10 }, (_, i) => ({ y: i * lagen, pieces: [{ start: 0, length: 4000, label: 'Strek' }] })),
};
const zones = [
  { id: 'A', enabled: true, x: 0,    y: 0, width: 1500, height: 620, verband: 'halfsteens' },                                  // geen eigen artikel → volgt groep
  { id: 'B', enabled: true, x: 2000, y: 0, width: 1500, height: 620, verband: 'halfsteens', steenstripArtikelId: 'x', material: { steenL: 180, steenH: 40 } }, // eigen artikel
];

const regions = buildStripZoneRegions(facadeData, zones, mat, 'halfsteens', '#abc', { stripArt: groupStripArt });
// regions[0]=complement, [1]=zone A, [2]=zone B
const zA = regions[1].material, zB = regions[2].material;

console.log('# ZONE-STRIPTYPE VALIDATE (groep-stripArt 300x80)\n');
console.log(`  zone A (geen eigen artikel): steenL=${zA.steenL} steenH=${zA.steenH}  ${zA.steenL === 300 && zA.steenH === 80 ? '🟢 volgt groep (300x80)' : '🔴'}`);
console.log(`  zone B (eigen 180x40)      : steenL=${zB.steenL} steenH=${zB.steenH}  ${zB.steenL === 180 && zB.steenH === 40 ? '🟢 eigen artikel (overschrijft groep)' : '🔴'}`);
const ok = zA.steenL === 300 && zA.steenH === 80 && zB.steenL === 180 && zB.steenH === 40;
console.log(`\n=== VERDICT: ${ok ? '🟢 per-zone strip-artikel werkt; zonder eigen artikel volgt de zone de groep' : '🔴'} ===`);
process.exit(0);
