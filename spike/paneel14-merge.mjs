globalThis.localStorage = { getItem: (k) => ({ paneel14Laag:'1', halfsteensPanel5Strek:'1' })[k] ?? null, setItem(){} };
const { panelizeZone, computeEffectiveBasePanel, generateBattenPositions } = await import('../src/lib/panelization.js');
const mat = { steenL:210, steenH:50, lint:12, stoot:10, brickWeightM2:40 };
const lagenmaat = mat.steenH + mat.lint;
const snapToRowY = (y) => Math.round(y / lagenmaat) * lagenmaat;
const basePanel = computeEffectiveBasePanel({ enabled:true, breedte:3005, hoogte:1200 }, 40, mat);
for (const H of [900, 1100, 2700, 3000]) {
  const zone = { x:0, y:0, width:2400, height:H };
  const battenYs = generateBattenPositions(H, mat, 400, { targetPanelH:1200, minPanelH:800, verband:'halfsteens' }).map(snapToRowY);
  const res = panelizeZone(zone, battenYs, basePanel, snapToRowY, mat, 'halfsteens');
  const col0 = res.panels.filter(p=>Math.abs(p.x-res.panels[0].x)<1).sort((a,b)=>a.y-b.y);
  const heights = col0.map(p=>Math.round(p.height));
  const merged = heights.some(h=>h>865+3);
  console.log(`zone H=${H} -> hoogtes [${heights.join(', ')}]${merged?'  <- bovenste slokt rest op (>865)':''}${heights.some(h=>h<200)?'  !! <200 aanwezig':''}`);
}
