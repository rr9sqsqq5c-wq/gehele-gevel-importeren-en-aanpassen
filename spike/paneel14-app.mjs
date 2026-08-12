globalThis.localStorage = { getItem: (k) => ({ paneel14Laag:'1', halfsteensPanel5Strek:'1' })[k] ?? null, setItem(){} };
const P = await import('../src/lib/panelization.js');
const { panelizeZone, computeEffectiveBasePanel, generateBattenPositions } = P;
const mat = { steenL:210, steenH:50, lint:12, stoot:10, brickWeightM2:40 };
const lagenmaat = mat.steenH + mat.lint;
const snapToRowY = (y) => Math.round(y / lagenmaat) * lagenmaat;   // zoals de view: snap naar course-onderkant
const basePanel = computeEffectiveBasePanel({ enabled:true, breedte:3005, hoogte:1200 }, 40, mat);

function report(zone, verband) {
  const battenYs = generateBattenPositions(zone.height, mat, 400, { targetPanelH:1200, minPanelH:800, verband }).map(snapToRowY);
  const res = panelizeZone(zone, battenYs, basePanel, snapToRowY, mat, verband);
  const cov = res.ok ? res.panels.reduce((s,p)=>s+p.width*p.height,0) : 0;
  const gapPct = Math.round((1 - cov/(zone.width*zone.height))*100);
  console.log(`zone ${zone.width}x${zone.height} verband=${verband} -> ${res.ok?res.panels.length:0} panelen, ${gapPct}% LEEG`);
  if (res.ok) { const col0 = res.panels.filter(p=>Math.abs(p.x-res.panels[0].x)<1).sort((a,b)=>a.y-b.y);
    for (const p of col0) console.log(`   B=${Math.round(p.width)} H=${Math.round(p.height)} y=${Math.round(p.y)}..${Math.round(p.y+p.height)}`); }
}
console.log('== HOGE zone (14-laag actief) met app-params (snapToRowY!):');
report({ x:0,y:0,width:2400,height:3000 }, 'halfsteens');
console.log('');
console.log('== KORTE band 400mm (oude tak) met app-params:');
report({ x:0,y:0,width:2400,height:400 }, 'halfsteens');
