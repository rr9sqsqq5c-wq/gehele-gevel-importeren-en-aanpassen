function load(flagOn) {
  globalThis.localStorage = { getItem: (k) => (flagOn ? { paneel14Laag:'1', halfsteensPanel5Strek:'1' } : {})[k] ?? null, setItem(){} };
  return import(`../src/lib/panelization.js?o=${flagOn}`);
}
const mat = { steenH:50, lint:12, steenL:210, stoot:10 };
const lagenmaat = mat.steenH + mat.lint;
const gW = 6000, gH = 3400;
const raam = { x:2328, y:900, width:1010, height:1600 };  // raam 900..2500
const rows = [];
for (let k = 0; k * lagenmaat < gH; k++) rows.push({ y: k * lagenmaat, pieces: [{ start:0, length:gW }] });
const facadeData = { groupWidth: gW, groupHeight: gH, groupOpenings: [raam], rows };
const latten = { enabled: true, breedte: 50, maxInterval: 400, richting: 'horizontaal' };

function overlaps(a, b) {
  const xo = a.x < b.x + b.width && a.x + a.width > b.x;
  const yo = a.y < b.y + b.height && a.y + a.height > b.y;
  return xo && yo;
}
for (const flagOn of [false, true]) {
  const { computeHorizontalLatten } = await load(flagOn);
  const lats = computeHorizontalLatten({ facadeData, latten, mat, panelen: { hoogte: 1200 }, startLijn: 0, backingType: 'hout', verband: 'halfsteens' });
  let nOverlap = 0, pairs = [];
  for (let i = 0; i < lats.length; i++) for (let j = i + 1; j < lats.length; j++) {
    if (overlaps(lats[i], lats[j])) { nOverlap++; if (pairs.length < 5) pairs.push(`y${lats[i].y}(x${lats[i].x}+${lats[i].width}) ⨉ y${lats[j].y}(x${lats[j].x}+${lats[j].width})`); }
  }
  console.log(`\nvlag ${flagOn ? 'AAN (14-laag)' : 'UIT (oud)'}: ${lats.length} latten, ${nOverlap} OVERLAPPEND`);
  if (nOverlap) pairs.forEach(p => console.log('   overlap: ' + p));
  if (flagOn) {
    const byX = {};
    for (const l of lats) (byX[`${l.x}..${l.x + l.width}`] ??= []).push(l.y + l.height / 2);
    for (const [xr, cs] of Object.entries(byX)) console.log(`   zone x=${xr}: lat-centra [${cs.sort((a,b)=>a-b).map(Math.round).join(', ')}]`);
  }
}
