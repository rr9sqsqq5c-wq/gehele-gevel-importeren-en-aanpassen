globalThis.localStorage = { getItem: (k) => ({ paneel14Laag:'1', halfsteensPanel5Strek:'1' })[k] ?? null, setItem(){} };
const { buildFacadeZones, panelizeZone, computeEffectiveBasePanel } = await import('../src/lib/panelization.js');
const mat = { steenL:210, steenH:50, lint:12, stoot:10, brickWeightM2:40 };  // lagenmaat=62, pitchV=868 → paneel 865; breedte 5·210+5·10−3=1097
const basePanel = computeEffectiveBasePanel({ enabled:true, breedte:3005, hoogte:1200 }, 40, mat);
const zones = buildFacadeZones(2400, 3000, []);
for (const zone of zones) {
  const res = panelizeZone(zone, [], basePanel, null, mat, 'halfsteens');
  if (!res.ok) { console.log('zone', zone.width,'x',zone.height,'→ geen panelen'); continue; }
  console.log(`zone ${Math.round(zone.width)}×${Math.round(zone.height)} → ${res.panels.length} panelen`);
  const byCol = {};
  for (const p of res.panels) { (byCol[Math.round(p.x)] ??= []).push(p); }
  const col0 = Object.values(byCol)[0].sort((a,b)=>a.y-b.y);
  for (const p of col0) console.log(`  paneel B=${Math.round(p.width)} H=${Math.round(p.height)}  y=${Math.round(p.y)}..${Math.round(p.y+p.height)}`);
  console.log(`  → verwacht: B=1097, H=865 (14·62−3), voeg 3mm: bijv. paneel0 top=865, paneel1 y=868`);
}
