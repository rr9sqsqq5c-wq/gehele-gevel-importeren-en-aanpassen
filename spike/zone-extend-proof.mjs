// ZONE_EXTEND — bewijs dat een getekende stripZone links/rechts uitloopt, APART per laag
// (strips via buildStripZoneRegions, panelen via buildZoneBackingPanels, latten via clipLattenToZones),
// elk met z'n EIGEN waarde, en dat de vlag UIT byte-identiek is.
const _ls = { zoneExtend: null };
globalThis.localStorage = { getItem: (k) => _ls[k] ?? null, setItem() {}, removeItem() {} };

const { buildStripZoneRegions, buildZoneBackingPanels, clipLattenToZones } = await import('../src/lib/panelization.js').then(async (p) => ({
  buildZoneBackingPanels: p.buildZoneBackingPanels, clipLattenToZones: p.clipLattenToZones,
  buildStripZoneRegions: (await import('../src/lib/zoneRegions.js')).buildStripZoneRegions,
}));
const { buildFacePattern } = await import('../src/lib/pattern.js');

const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10, brickWeightM2: 34 };
const rows = buildFacePattern(3000, 1000, mat, 'halfsteens');
const facadeData = { rows, groupWidth: 3000, groupHeight: 1000, groupOpenings: [] };
// zone x 1000..1500; per laag EIGEN uitloop
const zone = {
  id: 'z1', x: 1000, y: 0, width: 500, height: 1000, enabled: true, verband: 'halfsteens',
  endExtensions: { left: { strips: 100, battens: 20, panels: 50 }, right: { strips: 200, battens: 40, panels: 80 } },
};

const xrange = (items, xf = (p) => p.start, wf = (p) => p.length) => {
  let lo = Infinity, hi = -Infinity;
  for (const it of items) { lo = Math.min(lo, xf(it)); hi = Math.max(hi, xf(it) + wf(it)); }
  return [Math.round(lo), Math.round(hi)];
};

function stripsX() {
  const regs = buildStripZoneRegions(facadeData, [zone], mat, 'halfsteens', '#a00');
  const zoneReg = regs[1];  // regs[0] = complement, regs[1] = de zone
  const pieces = zoneReg.rows.flatMap((r) => r.pieces);
  return xrange(pieces);
}
function panelsX() {
  const ps = buildZoneBackingPanels({ facadeData, activeZones: [zone], panelen: { enabled: true, breedte: 3005, hoogte: 1200, dikte: 8, maxKg: 50 }, latten: { maxInterval: 400 }, mat, verband: 'halfsteens' });
  return xrange(ps, (p) => p.x, (p) => p.width);
}
function lattenX() {
  const clipped = clipLattenToZones([{ id: 'L', x: 0, y: 400, width: 3000, height: 45 }], [zone]);
  return xrange(clipped, (l) => l.x, (l) => l.width);
}

function report(label) {
  console.log(`\n=== ${label} ===`);
  const s = stripsX(), p = panelsX(), l = lattenX();
  console.log(`  strips : ${s[0]}..${s[1]}`);
  console.log(`  panelen: ${p[0]}..${p[1]}`);
  console.log(`  latten : ${l[0]}..${l[1]}`);
  return { s, p, l };
}

_ls.zoneExtend = null;
const off = report('VLAG UIT (geen uitloop → zone 1000..1500)');
_ls.zoneExtend = '1';
const on = report('VLAG AAN (elke laag eigen uitloop)');

console.log('\n--- CONTROLE ---');
const offOk = off.s[0] === 1000 && off.s[1] === 1500 && off.p[0] === 1000 && off.l[0] === 1000 && off.l[1] === 1500;
// strips: 100 links, 200 rechts → 900..1700
const stripsOk = on.s[0] === 900 && on.s[1] === 1700;
// latten: 20 links, 40 rechts → 980..1540
const lattenOk = on.l[0] === 980 && on.l[1] === 1540;
// panelen: 50 links, 80 rechts → 950..1580 (paneelrand)
const panelsOk = on.p[0] === 950 && on.p[1] === 1580;
console.log(`UIT byte-identiek (zone 1000..1500):        ${offOk ? '🟢' : '🔴'}`);
console.log(`AAN strips  900..1700 (eigen 100/200):      ${stripsOk ? '🟢' : `🔴 (${on.s[0]}..${on.s[1]})`}`);
console.log(`AAN latten  980..1540 (eigen 20/40):        ${lattenOk ? '🟢' : `🔴 (${on.l[0]}..${on.l[1]})`}`);
console.log(`AAN panelen 950..1580 (eigen 50/80):        ${panelsOk ? '🟢' : `🔴 (${on.p[0]}..${on.p[1]})`}`);
const ok = offOk && stripsOk && lattenOk && panelsOk;
console.log(ok ? '\n🟢 BEWEZEN: elke laag loopt met z\'n eigen waarde uit; vlag uit = byte-identiek.' : '\n🔴 FOUT.');
process.exit(ok ? 0 : 1);
