// ZONE_EXTEND lege ruimte — bewijs dat een zone LINKS kan uitbreiden in een WAND-LOZE regio (lege ruimte,
// om op de aangrenzende gevel aan te sluiten). Vóór de fix werd de uitloop door de wand-dekking weggeknipt.
const _ls = { zoneExtend: null };
globalThis.localStorage = { getItem: (k) => _ls[k] ?? null, setItem() {}, removeItem() {} };
const { buildStripZoneRegions } = await import('../src/lib/zoneRegions.js');
const { buildFacePattern } = await import('../src/lib/pattern.js');

const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10, brickWeightM2: 34 };
// wand-dekking ALLEEN [1000,3000]; [0,1000] is LEGE RUIMTE (geen wandelement)
const rows = buildFacePattern(2000, 1000, mat, 'halfsteens').map((r) => ({ ...r, pieces: r.pieces.map((p) => ({ ...p, start: p.start + 1000 })) }));
const facadeData = { groupWidth: 3000, groupHeight: 1000, groupOpenings: [], rows };
// zone getekend op [1000,1500] (op de wandrand), uitloop LINKS 300 → in de lege ruimte [700,1000]
const zone = { id: 'z1', x: 1000, y: 0, width: 500, height: 1000, enabled: true, verband: 'halfsteens', endExtensions: { left: { strips: 300, battens: 0, panels: 0 }, right: { strips: 0, battens: 0, panels: 0 } } };

function zoneMinX() {
  const regs = buildStripZoneRegions(facadeData, [zone], mat, 'halfsteens', '#a00');
  const pieces = regs[1].rows.flatMap((r) => r.pieces);
  return Math.round(Math.min(...pieces.map((p) => p.start)));
}

_ls.zoneExtend = null;
const off = zoneMinX();
_ls.zoneExtend = '1';
const on = zoneMinX();

console.log(`VLAG UIT (geen uitloop):        zone-strips beginnen op x=${off}  (verwacht 1000 = wandrand)`);
console.log(`VLAG AAN (uitloop links 300):   zone-strips beginnen op x=${on}  (verwacht 700 = 300 in de lege ruimte)`);
const ok = off === 1000 && on === 700;
console.log(ok ? '\n🟢 BEWEZEN: de zone breidt links uit in de lege ruimte (voorbij de wand); vlag uit = byte-identiek.' : `\n🔴 FOUT (uit=${off}, aan=${on}).`);
process.exit(ok ? 0 : 1);
