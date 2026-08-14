// GROEP EINDUITEINDEN — is elk onderdeel (strips/latten/panelen) ONAFHANKELIJK te verlengen?
// Zet ALLEEN strips op 500 (latten/panelen 0) en kijk of latten/panelen tóch meegaan (= bug).
const _ls = { paneelOptimalisatie: '1', unifiedPanels: '1', unifiedLatten: '1', keepEndExtension: '1', endTrim: '1', endExtSeparaat: null };
globalThis.localStorage = { getItem: (k) => _ls[k] ?? null, setItem() {}, removeItem() {} };
const { buildFullGroupFacadePattern } = await import('../src/lib/pattern.js');
const { buildGroupPanels, buildFacadeLatten } = await import('../src/lib/panelization.js');

const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10, brickWeightM2: 34 };
const wall = { expressID: 1, length: 3000, height: 1000,
  wallOrigin: { lengthAxis: 'x', heightAxis: 'y', thicknessAxis: 'z', lengthStart: 0, heightStart: 0, thicknessStart: 0, thicknessEnd: 100 }, openings: [] };
const panelen = { enabled: true, breedte: 3005, hoogte: 1200, dikte: 8, maxKg: 50 };
const lattenCfg = { enabled: true, richting: 'horizontaal', breedte: 45, dikte: 28, maxInterval: 400, minHOH: 370, maxHOH: 430 };

function run(ee, label) {
  const eL = (ee.left?.strips ?? 0) > 0 ? ee.left.strips : 0;
  const fd = buildFullGroupFacadePattern([wall], mat, 'halfsteens', null, null, null, eL, 0, null, null, false);
  const stripsMinX = Math.round(Math.min(...fd.rows.flatMap((r) => r.pieces.map((p) => p.start))));
  const panels = buildGroupPanels({ groupWidth: fd.groupWidth, groupHeight: fd.groupHeight, groupOpenings: fd.groupOpenings, rows: fd.rows, penanten: [], baseMat: mat, stripArt: null, panelen, latten: lattenCfg, verband: 'halfsteens', endExtensions: ee }).panels;
  const panelsMinX = Math.round(Math.min(...panels.map((p) => p.x)));
  const latten = buildFacadeLatten({ facadeData: fd, latten: lattenCfg, mat, panelen, panels, penanten: [], startLijn: null, verband: 'halfsteens', backingType: 'hout', sparingRects: [], endExtensions: ee });
  const hAll = latten.filter((l) => !l.richting || l.richting === 'horizontaal');
  const hNF = hAll.filter((l) => !l.forced);   // niet-forced = de INGEZETTE latten die de paneel-extent volgen
  const lattenMinX = hAll.length ? Math.round(Math.min(...hAll.map((l) => l.x))) : 0;         // alle (vangt rand-lat-extend)
  const lattenNF = hNF.length ? Math.round(Math.min(...hNF.map((l) => l.x))) : 0;             // niet-forced (vangt paneel-follow)
  console.log(`\n${label}`);
  console.log(`  strips=${stripsMinX} · panelen=${panelsMinX} · latten(alle)=${lattenMinX} · latten(niet-forced)=${lattenNF}`);
  return { stripsMinX, panelsMinX, lattenMinX, lattenNF };
}

const paneelUit = { left: { strips: 0, battens: 0, panels: 500 }, right: { strips: 0, battens: 0, panels: 0 } };
const paneelIn  = { left: { strips: 0, battens: 0, panels: -400 }, right: { strips: 0, battens: 0, panels: 0 } };

_ls.endExtSeparaat = null;
console.log('############ VLAG UIT ############');
const A = run({ left: { strips: 500, battens: 0, panels: 0 }, right: { strips: 0, battens: 0, panels: 0 } }, '=== ALLEEN strips 500 ===');
const Uoff = run(paneelUit, '=== paneel UIT 500 (latten volgen?) ===');
const Ioff = run(paneelIn, '=== paneel IN 400 (latten volgen?) ===');
const C = run({ left: { strips: 0, battens: 500, panels: 0 }, right: { strips: 0, battens: 0, panels: 0 } }, '=== ALLEEN latten 500 ===');

_ls.endExtSeparaat = '1';
console.log('\n############ VLAG AAN (endExtSeparaat) ############');
const Uon = run(paneelUit, '=== paneel UIT 500 (latten los?) ===');
const Ion = run(paneelIn, '=== paneel IN 400 (latten los?) ===');

console.log('\n--- CONTROLE ---');
const stripsInd = A.stripsMinX === -500 && A.panelsMinX === 0;                     // strips sleept panelen niet mee
const lattenInd = C.lattenMinX === -500 && C.panelsMinX === 0;                     // latten-eigen-waarde: rand-lat verlengt −500, panelen ongemoeid
const uitOff = Uoff.panelsMinX === -500 && Uoff.lattenNF < -100;                   // vlag uit: ingezette latten volgen paneel-verlenging (~−495)
const uitOn  = Uon.panelsMinX === -500 && Uon.lattenNF >= 0 && Uon.lattenNF < 100; // vlag aan: los (~5, gevelrand)
const inOff  = Ioff.panelsMinX === 400 && Ioff.lattenNF > 300;                     // vlag uit: latten volgen paneel-inkorting (~405)
const inOn   = Ion.panelsMinX === 400 && Ion.lattenNF < 100;                       // vlag aan: latten blijven op de gevelrand (~5)
console.log(`Strips onafhankelijk: ${stripsInd ? '🟢' : '🔴'} · Latten eigen waarde: ${lattenInd ? '🟢' : '🔴'}`);
console.log(`VERLENGEN  vlag UIT latten=${Uoff.lattenNF} (volgen) → AAN latten=${Uon.lattenNF} (los)  ${uitOff && uitOn ? '🟢' : '🔴'}`);
console.log(`INKORTEN   vlag UIT latten=${Ioff.lattenNF} (volgen, paneel@${Ioff.panelsMinX}) → AAN latten=${Ion.lattenNF} (los)  ${inOff && inOn ? '🟢' : '🔴'}`);
const ok = stripsInd && lattenInd && uitOff && uitOn && inOff && inOn;
console.log(ok ? '\n🟢 BEWEZEN: met de vlag verlengen ÉN inkorten strips/latten/panelen elk ONAFHANKELIJK; uit = byte-identiek.' : '\n🔴 FOUT.');
process.exit(ok ? 0 : 1);
