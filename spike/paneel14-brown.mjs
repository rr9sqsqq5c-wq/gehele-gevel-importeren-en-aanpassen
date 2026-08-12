globalThis.localStorage = { getItem: (k) => ({ paneel14Laag:'1', halfsteensPanel5Strek:'1' })[k] ?? null, setItem(){} };
const { buildFacadeZones, panelizeZone, computeEffectiveBasePanel } = await import('../src/lib/panelization.js');
const mat = { steenL:210, steenH:50, lint:12, stoot:10, brickWeightM2:40 };
const basePanel = computeEffectiveBasePanel({ enabled:true, breedte:3005, hoogte:1200 }, 40, mat);
// gevel ~ 2×3 raster van openingen (zoals screenshot): 2 kolommen ramen, 3 rijen
const gW = 11000, gH = 3400;
const ramen = [];
for (const rx of [[2328,3338],[7488,8490]]) for (const ry of [[300,1100],[1500,2300],[2700,3400]]) ramen.push({ id:`op_${rx[0]}_${ry[0]}`, x:rx[0], y:ry[0], width:rx[1]-rx[0], height:ry[1]-ry[0], polyPts:null });
const zones = buildFacadeZones(gW, gH, ramen);
console.log(`${zones.length} zones:`);
let brownArea = 0;
for (const z of zones) {
  const res = panelizeZone(z, [], basePanel, null, mat, 'halfsteens');
  const nP = res.ok ? res.panels.length : 0;
  const covered = res.ok ? res.panels.reduce((s,p)=>s+p.width*p.height,0) : 0;
  const zoneArea = z.width*z.height;
  const gapPct = Math.round((1 - covered/zoneArea)*100);
  const flag = (!res.ok || gapPct > 5) ? '  ← WEINIG/GEEN PANEEL (bruin?)' : '';
  if (!res.ok || gapPct>5) brownArea += zoneArea - covered;
  console.log(`  zone x${Math.round(z.x)} y${Math.round(z.y)} ${Math.round(z.width)}×${Math.round(z.height)} → ${nP} panelen, ${gapPct}% leeg${flag}`);
}
console.log(`\nTotaal 'bruin' oppervlak (zones met >5% leeg): ${Math.round(brownArea/1e6*100)/100} m²`);
