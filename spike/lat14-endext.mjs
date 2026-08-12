globalThis.localStorage = { getItem: (k) => ({ paneel14Laag:'1', halfsteensPanel5Strek:'1' })[k] ?? null, setItem(){} };
const P = await import('../src/lib/panelization.js');
const { buildFacadeZones, panelizeZone, computeEffectiveBasePanel, buildFacadeLatten, extendPanelsAtEnds, extendLattenAtEnds } = P;
const mat = { steenH:50, lint:12, steenL:210, stoot:10, brickWeightM2:40 };
const gW = 3000, gH = 3000;
const facadeData = { groupWidth: gW, groupHeight: gH, groupOpenings: [], rows: [], sparingRects: [] };
const latten = { enabled:true, breedte:50, maxInterval:400, richting:'horizontaal' };
const basePanel = computeEffectiveBasePanel({ enabled:true, breedte:3005, hoogte:1200 }, 40, mat);

// panelen
let panels = [];
for (const z of buildFacadeZones(gW, gH, [])) { const r = panelizeZone(z, [], basePanel, null, mat, 'halfsteens'); if (r.ok) panels.push(...r.panels); }
const pL0 = Math.min(...panels.map(p=>p.x)), pR0 = Math.max(...panels.map(p=>p.x+p.width));
const pExt = extendPanelsAtEnds(panels, gW, 100, 100);
const pL1 = Math.min(...pExt.map(p=>p.x)), pR1 = Math.max(...pExt.map(p=>p.x+p.width));
console.log(`PANELEN  vóór: x ${Math.round(pL0)}..${Math.round(pR0)}  |  ná extend(100,100): x ${Math.round(pL1)}..${Math.round(pR1)}  ${pL1<pL0-1&&pR1>pR0+1?'✓ verlengt':'✗ NIET verlengd'}`);

// latten via buildFacadeLatten
const lat0 = buildFacadeLatten({ facadeData, latten, mat, panelen:{hoogte:1200}, panels, penanten:[], startLijn:0, verband:'halfsteens', backingType:'hout', sparingRects:[] });
const hor0 = lat0.filter(l=>l.richting==='horizontaal');
const lL0 = Math.min(...hor0.map(l=>l.x)), lR0 = Math.max(...hor0.map(l=>l.x+l.width));
const lat1 = extendLattenAtEnds(lat0, gW, 100, 100);
const hor1 = lat1.filter(l=>l.richting==='horizontaal');
const lL1 = Math.min(...hor1.map(l=>l.x)), lR1 = Math.max(...hor1.map(l=>l.x+l.width));
console.log(`LATTEN   vóór: x ${Math.round(lL0)}..${Math.round(lR0)}  |  ná extend(100,100): x ${Math.round(lL1)}..${Math.round(lR1)}  ${lL1<lL0-1&&lR1>lR0+1?'✓ verlengt':'✗ NIET verlengd'}`);
console.log(`   (gevelrand = 0..${gW}; lat-x vóór = ${Math.round(lL0)} → als dat 5 is, klipt buildFacadeLatten 'm van de rand af)`);
