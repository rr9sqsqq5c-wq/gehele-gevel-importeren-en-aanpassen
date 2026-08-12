function load(flagOn) {
  globalThis.localStorage = { getItem: (k) => (flagOn ? { paneel14Laag:'1' } : {})[k] ?? null, setItem(){} };
  return import(`../src/lib/panelization.js?p=${flagOn}`);
}
const mat = { steenH:50, lint:12, steenL:210, stoot:10 };
const lagenmaat = mat.steenH + mat.lint;
// rows = brick courses (voor brickTop-snap in de oude tak)
const rows = [];
for (let k = 0; k * lagenmaat < 3000; k++) rows.push({ y: k * lagenmaat, pieces: [{ start:0, length:2400 }] });
const facadeData = { groupWidth: 2400, groupHeight: 3000, groupOpenings: [], rows };
const latten = { enabled: true, breedte: 50, maxInterval: 400, richting: 'horizontaal' };

for (const flagOn of [false, true]) {
  const { computeHorizontalLatten } = await load(flagOn);
  const lats = computeHorizontalLatten({ facadeData, latten, mat, panelen: { hoogte: 1200 }, startLijn: 0, backingType: 'hout', verband: 'halfsteens' });
  const centers = lats.map(l => Math.round(l.y + l.height / 2));
  console.log(`vlag ${flagOn ? 'AAN (14-laag)' : 'UIT (oud)  '}: ${lats.length} latten, centra=[${centers.join(', ')}]`);
  if (flagOn) {
    console.log(`   onderste lat: y=${lats[0].y} (onderkant, moet 10 zijn) | voeg-latten-centra moeten ~866/1734/2602 zijn`);
    let prev = null; const hoh = lats.map(l => { const c = l.y + l.height/2; const d = prev!=null ? Math.round(c-prev) : null; prev = c; return d; }).filter(Boolean);
    console.log(`   h.o.h.=[${hoh.join(', ')}]`);
  }
}
