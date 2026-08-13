// B-VERIFICATIE — trekken de PANELEN + LATTEN mee op als de groep "Optrekken naar maxlijn" (fillToMax) aan heeft?
// facadeData.groupHeight wordt de opgetrokken hoogte; buildGroupPanels/buildFacadeLatten lezen die → moeten meevullen.
globalThis.localStorage = { getItem: (k) => (k === 'paneelOptimalisatie' || k === 'unifiedPanels' || k === 'unifiedLatten') ? '1' : null, setItem() {}, removeItem() {} };
const { buildFullGroupFacadePattern } = await import('../src/lib/pattern.js');
const { buildGroupPanels, buildFacadeLatten } = await import('../src/lib/panelization.js');

const mat = { steenL: 210, steenH: 50, lint: 12, stoot: 10, brickWeightM2: 34 };
const wall = { expressID: 1, length: 2000, height: 500,
  wallOrigin: { lengthAxis: 'x', heightAxis: 'y', thicknessAxis: 'z', lengthStart: 0, heightStart: 0, thicknessStart: 0, thicknessEnd: 100 }, openings: [] };
const panelen = { enabled: true, breedte: 3005, hoogte: 1200, dikte: 8, maxKg: 50 };
const lattenCfg = { enabled: true, richting: 'horizontaal', breedte: 45, dikte: 28, maxInterval: 400, minHOH: 370, maxHOH: 430 };

function run(fillToMax) {
  const fd = buildFullGroupFacadePattern([wall], mat, 'halfsteens', 800, null, null, 0, 0, null, null, fillToMax);
  const panels = buildGroupPanels({ groupWidth: fd.groupWidth, groupHeight: fd.groupHeight, groupOpenings: fd.groupOpenings, rows: fd.rows, penanten: [], baseMat: mat, stripArt: null, panelen, latten: lattenCfg, verband: 'halfsteens' }).panels;
  const latten = buildFacadeLatten({ facadeData: fd, latten: lattenCfg, mat, panelen, panels, penanten: [], startLijn: null, verband: 'halfsteens', backingType: 'hout', sparingRects: [] });
  const panelTop = Math.max(...panels.map((p) => p.y + p.height));
  const lattenTop = Math.max(...latten.map((l) => l.y + l.height));
  return { groupHeight: fd.groupHeight, panelTop: Math.round(panelTop), lattenTop: Math.round(lattenTop) };
}

const off = run(false), on = run(true);
console.log(`fillToMax=FALSE: groupHeight=${off.groupHeight}, hoogste paneel-top=${off.panelTop}, hoogste lat-top=${off.lattenTop}`);
console.log(`fillToMax=TRUE : groupHeight=${on.groupHeight}, hoogste paneel-top=${on.panelTop}, hoogste lat-top=${on.lattenTop}`);
const panelsFill = on.panelTop >= off.panelTop + 100;   // panelen lopen duidelijk hoger door
const lattenFill = on.lattenTop >= off.lattenTop + 100;
console.log(`\nPanelen trekken mee op: ${panelsFill ? '🟢 ja' : '🔴 NEE'} (${off.panelTop} → ${on.panelTop})`);
console.log(`Latten trekken mee op:  ${lattenFill ? '🟢 ja' : '🔴 NEE'} (${off.lattenTop} → ${on.lattenTop})`);
console.log(panelsFill && lattenFill ? '\n🟢 B WERKT: strips + panelen + latten trekken samen op naar de maxlijn.' : '\n🟠 B: niet alles trekt mee — nakijken.');
