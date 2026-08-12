// Reproduceer de View2D-pijplijn (buildFacadeZones + panelizeZone + regel 134-filter) voor vlag AAN vs UIT.
function run(flagOn) {
  globalThis.localStorage = { getItem: (k) => (flagOn ? { paneel14Laag:'1', halfsteensPanel5Strek:'1' } : { halfsteensPanel5Strek:'1' })[k] ?? null, setItem(){} };
  return import(`../src/lib/panelization.js?f=${flagOn}`);
}
const mat = { steenL:210, steenH:50, lint:12, stoot:10, brickWeightM2:40 };
const lagenmaat = mat.steenH + mat.lint;
const snapToRowY = (y) => Math.round(y / lagenmaat) * lagenmaat;
// gevel met openingen die HOGE zones maken (kolommen naast smalle ramen), zoals de screenshot
const gW = 6000, gH = 3400;
const ramen = [ { id:'r1', x:2328, y:900, width:1010, height:1600, polyPts:null } ];

for (const flagOn of [false, true]) {
  const P = await run(flagOn);
  const { buildFacadeZones, panelizeZone, computeEffectiveBasePanel, generateBattenPositions } = P;
  const basePanel = computeEffectiveBasePanel({ enabled:true, breedte:3005, hoogte:1200 }, 40, mat);
  const zones = buildFacadeZones(gW, gH, ramen);
  let facadeArea = 0, coveredRaw = 0, coveredKept = 0, filteredArea = 0, nFiltered = 0;
  for (const zone of zones) {
    const battenYs = generateBattenPositions(zone.height, mat, 400, { targetPanelH:1200, minPanelH:800, verband:'halfsteens' }).map(snapToRowY);
    const res = panelizeZone(zone, battenYs, basePanel, snapToRowY, mat, 'halfsteens');
    facadeArea += zone.width * zone.height;
    if (!res.ok) continue;
    for (const p of res.panels) {
      coveredRaw += p.width * p.height;
      if (p.height >= 200 && p.width >= 10) coveredKept += p.width * p.height;
      else { filteredArea += p.width * p.height; nFiltered++; }
    }
  }
  const m2 = (a) => Math.round(a / 1e6 * 100) / 100;
  console.log(`vlag ${flagOn ? 'AAN (14-laag)' : 'UIT (oud)  '}: bruin(onbedekt na 200-filter)=${m2(facadeArea - coveredKept)} m²  | ${nFiltered} panelen <200mm weggegooid (=${m2(filteredArea)} m²)`);
}
