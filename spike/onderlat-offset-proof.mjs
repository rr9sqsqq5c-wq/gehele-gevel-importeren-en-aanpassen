// ONDERLAT_OFFSET — ligt de onderste lat met de vlag 10mm boven de starthoogte, en zonder = erop (byte-identiek)?
const _ls = { paneelOptimalisatie: '1', unifiedLatten: '1', onderlatOffset: null };
globalThis.localStorage = { getItem: (k) => _ls[k] ?? null, setItem() {}, removeItem() {} };
const { buildFullGroupFacadePattern } = await import('../src/lib/pattern.js');
const { buildFacadeLatten } = await import('../src/lib/panelization.js');

const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10, brickWeightM2: 34 };
const wall = { expressID: 1, length: 3000, height: 1200,
  wallOrigin: { lengthAxis: 'x', heightAxis: 'y', thicknessAxis: 'z', lengthStart: 0, heightStart: 0, thicknessStart: 0, thicknessEnd: 100 }, openings: [] };
const panelen = { enabled: true, breedte: 3005, hoogte: 1200, dikte: 8, maxKg: 50 };
const lattenCfg = { enabled: true, richting: 'horizontaal', breedte: 45, dikte: 28, maxInterval: 400, minHOH: 370, maxHOH: 430 };

function bottomLat(startLijn) {
  const fd = buildFullGroupFacadePattern([wall], mat, 'halfsteens', null, null, startLijn, 0, 0, null, null, false);
  const latten = buildFacadeLatten({ facadeData: fd, latten: lattenCfg, mat, panelen, panels: [], penanten: [], startLijn, verband: 'halfsteens', backingType: 'hout', sparingRects: [] });
  const h = latten.filter((l) => !l.richting || l.richting === 'horizontaal').sort((a, b) => a.y - b.y);
  return h.length ? Math.round(h[0].y) : null;   // onderkant van de onderste lat
}

const cases = [0, 62, 150];
let ok = true;
for (const sl of cases) {
  _ls.onderlatOffset = null;
  const off = bottomLat(sl);
  _ls.onderlatOffset = '1';
  const on = bottomLat(sl);
  const good = off === sl && on === sl + 10;
  ok = ok && good;
  console.log(`startLijn=${sl}:  UIT onderlat-onderkant=${off} (verwacht ${sl})  →  AAN=${on} (verwacht ${sl + 10})  ${good ? '🟢' : '🔴'}`);
}
console.log(ok ? '\n🟢 BEWEZEN: met de vlag ligt de onderste lat 10 mm boven de starthoogte; uit = op de starthoogte (byte-identiek).' : '\n🔴 FOUT.');
process.exit(ok ? 0 : 1);
