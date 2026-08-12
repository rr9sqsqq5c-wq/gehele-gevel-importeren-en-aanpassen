// WEGWERP (spike/) — VALIDATE: krijgt een wildverband-stripZone via buildStripZoneRegions
// het verspringende truth-verband (vlag aan) i.p.v. tegelverband (vlag uit)?
let FLAG = '1';
globalThis.localStorage = { getItem: (k) => (k === 'wildverbandKoppelstrip' ? FLAG : null), setItem(){}, removeItem(){} };
const { buildStripZoneRegions } = await import('../../src/lib/zoneRegions.js');

const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
const lagen = 50 + 12;
// minimaal vlak: 3000 breed, ~10 rijen vol-breed (dekking voor de zone-clip)
const facadeData = {
  groupWidth: 3000, groupHeight: 620, groupOpenings: [],
  rows: Array.from({ length: 10 }, (_, i) => ({ y: i * lagen, pieces: [{ start: 0, length: 3000, label: 'Strek' }] })),
};
const zone = { id: 'z1', enabled: true, x: 0, y: 0, width: 1500, height: 620, verband: 'wildverband', bondAnchor: 'zoneBottomLeft' };

function run(flag) {
  FLAG = flag;
  const regions = buildStripZoneRegions(facadeData, [zone], mat, 'halfsteens', '#abc', {});
  const zr = regions?.[1]; // [0]=complement, [1]=de zone
  // verspringing: 1e-steen-lengte per rij; uniek>1 = wildverband, =1 = tegelverband/uitgelijnd
  const firstLens = (zr?.rows ?? []).map((r) => Math.round(r.pieces[0]?.length ?? 0));
  const labels = new Set(); for (const r of (zr?.rows ?? [])) for (const p of r.pieces) labels.add(p.label);
  return { verband: zr?.verband, nRows: zr?.rows?.length ?? 0, uniqFirstLen: [...new Set(firstLens)].length, labels: [...labels] };
}

console.log('# ZONE-WILDVERBAND VALIDATE (stripZone verband=wildverband)\n');
const on = run('1');
const off = run('0');
console.log('  VLAG AAN:', JSON.stringify(on), on.uniqFirstLen > 1 && on.labels.length >= 2 ? '🟢 verspringend (S/D/K) = echte wildverband' : '🔴');
console.log('  VLAG UIT:', JSON.stringify(off), off.uniqFirstLen <= 1 ? '🟢 uitgelijnd (oud gedrag, byte-identiek)' : '🟠');
console.log(`\n=== VERDICT: ${on.uniqFirstLen > 1 && on.labels.length >= 2 && off.uniqFirstLen <= 1 ? '🟢 zone krijgt echte wildverband met de vlag aan; vlag-uit ongewijzigd' : '🔴'} ===`);
process.exit(0);
