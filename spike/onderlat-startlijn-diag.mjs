// READ-ONLY DIAGNOSE — waar staat de ONDERSTE horizontale lat t.o.v. de projectstart (startLijn)?
// Verwachting uit de code: onderste lat-onderkant op minH = max(0, startLijn) → luistert, maar +0 (niet +10).
const _ls = { paneelOptimalisatie: '1', unifiedLatten: '1' };
globalThis.localStorage = { getItem: (k) => _ls[k] ?? null, setItem() {}, removeItem() {} };
const { buildFullGroupFacadePattern } = await import('../src/lib/pattern.js');
const { buildFacadeLatten } = await import('../src/lib/panelization.js');

const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10, brickWeightM2: 34 };
const wall = { expressID: 1, length: 3000, height: 1200,
  wallOrigin: { lengthAxis: 'x', heightAxis: 'y', thicknessAxis: 'z', lengthStart: 0, heightStart: 0, thicknessStart: 0, thicknessEnd: 100 }, openings: [] };
const panelen = { enabled: true, breedte: 3005, hoogte: 1200, dikte: 8, maxKg: 50 };
const lattenCfg = { enabled: true, richting: 'horizontaal', breedte: 45, dikte: 28, maxInterval: 400, minHOH: 370, maxHOH: 430 };

function bottomLatten(startLijn) {
  const fd = buildFullGroupFacadePattern([wall], mat, 'halfsteens', null, null, startLijn, 0, 0, null, null, false);
  const latten = buildFacadeLatten({ facadeData: fd, latten: lattenCfg, mat, panelen, panels: [], penanten: [], startLijn, verband: 'halfsteens', backingType: 'hout', sparingRects: [] });
  const h = latten.filter((l) => !l.richting || l.richting === 'horizontaal').sort((a, b) => a.y - b.y);
  return h.slice(0, 3).map((l) => ({ y: Math.round(l.y), onderkant: Math.round(l.y), bovenkant: Math.round(l.y + l.height) }));
}

for (const sl of [0, 62, 150]) {
  const b = bottomLatten(sl);
  console.log(`\nstartLijn=${sl}: onderste 3 latten (y = onderkant):`);
  for (const l of b) console.log(`   onderkant y=${l.onderkant}  (=startLijn${l.onderkant - sl >= 0 ? '+' + (l.onderkant - sl) : (l.onderkant - sl)})`);
}
console.log('\n→ Luistert de onderlat naar startLijn?  (onderkant == startLijn → JA maar +0;  == startLijn+10 → al goed;  == 0 → NEE)');
