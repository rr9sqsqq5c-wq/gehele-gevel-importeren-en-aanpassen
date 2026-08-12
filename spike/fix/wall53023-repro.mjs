// READ-ONLY REPRO — wall 53023 (echte app-openingen). Raam en deur mergen NIET (overlapX=20<50).
// Vraag: wordt het massieve muurdeel ONDER het raam (naast de deur) bekleed of niet? En verandert
// concaveOpeningMerge er iets aan (verwachting: NEE — er mergt niks).
const _store = {};
globalThis.localStorage = { getItem: (k)=> k in _store?_store[k]:null, setItem:(k,v)=>{_store[k]=String(v);}, removeItem:(k)=>{delete _store[k];} };
const { buildFullGroupFacadePattern } = await import('../../src/lib/pattern.js');

const material = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
const wall = {
  expressID: 53023, length: 3360, height: 2870,
  wallOrigin: { lengthStart: 0, heightStart: 0, lengthAxis: 'x', heightAxis: 'y', thicknessAxis: 'z' },
  openings: [
    { type: 'raam', x: 1940, y: 840, breedte: 1160, hoogte: 1740, polyPts: null },
    { type: 'deur', x: 820,  y: 20,  breedte: 1140, hoogte: 2560, polyPts: null },
  ],
};
// massief muurdeel ONDER het raam, RECHTS van de deur:  X[1960..3100]  Y[20..840]
const zone = { x1: 1960, x2: 3100, y1: 60, y2: 800 };
function claddedInZone(fd) {
  let hit = 0, sample = [];
  for (const row of fd.rows) {
    if (row.y < zone.y1 || row.y > zone.y2) continue;
    for (const p of row.pieces) {
      const s = p.start, e = p.start + p.length;
      if (Math.min(e, zone.x2) - Math.max(s, zone.x1) > 5) { hit++; if(sample.length<4) sample.push({y:row.y,s:Math.round(s),l:Math.round(p.length)}); }
    }
  }
  return { hit, sample };
}

for (const flag of ['0','1']) {
  _store['concaveOpeningMerge'] = flag;
  const fd = buildFullGroupFacadePattern([wall], material, 'halfsteens', null, null, 0);
  const { hit, sample } = claddedInZone(fd);
  console.log(`concaveOpeningMerge=${flag}: groupOpenings=${fd.groupOpenings.length}`,
    fd.groupOpenings.map(o=>({x:Math.round(o.x),y:Math.round(o.y),w:Math.round(o.width),h:Math.round(o.height),t:o.type,pts:o.polyPts?.length??0})),
    `\n   massief-zone X[1960..3100] Y[60..800]: ${hit} pieces`, hit===0?'🔴 ONBEKLEED':'🟢 bekleed', hit?JSON.stringify(sample):'');
}
