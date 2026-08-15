// READ-ONLY DIAGNOSE — Bug B: in Groep 2/2.1 is 1 paneel in de BOVENSTE rij hoger dan de rest van die rij.
// Reproduceert G2 uit de ECHTE opgeslagen data (3 gestapelde wanden, 2 raamkolommen × 3 verdiepingen, klem 7131).
// Draait de app-pipeline: buildFullGroupFacadePattern → buildGroupPanels, met exact de browser-vlaggen.
const FLAGS = { paneelBanden:'1', paneelOptimalisatie:'1', gevelHandedness:'1', endTrim:'1', paneelStartLijn:'1', paneel14Laag:'1',
  keepEndExtension:'1', unifiedPanels:'1', bestFitGroups:'1', kozijnOffset:'1', stripSnijlijn:'1', zoneExtend:'1', concaveOpeningMerge:'1',
  ventilatieZone:'1', openingEdgeQuarter:'1', kopTolerantie:'1', onderlatOffset:'1', lattenPlat:'1', endExtSeparaat:'1', penantHoekStoot:'1' };
globalThis.localStorage = { getItem:(k)=>FLAGS[k]??null, setItem(){}, removeItem(){} };
const { buildFullGroupFacadePattern } = await import('../src/lib/pattern.js');
const { buildGroupPanels } = await import('../src/lib/panelization.js');

const mat = { steenL:221, steenH:51, lint:5.6, stoot:5.6, brickWeightM2:40, dikte:23 };
const koz = { left:10, right:10, top:20, bottom:50 };
const edgeStagger = { minDelta:50 };
const startLijn = 62;
const panelen = { enabled:true, breedte:3000, hoogte:1200, dikte:10, gewichtM2:11.8, maxKg:50, verspringen:false };
const latten  = { enabled:true, richting:'horizontaal', breedte:45, dikte:95, maxInterval:400, minHOH:370, maxHOH:430 };
const ee = { left:{strips:-246,battens:0,panels:-246}, right:{strips:-476,battens:476,panels:-476} };
const WO = (hs, he) => ({ lengthAxis:'z', heightAxis:'y', thicknessAxis:'x', lengthStart:-10663, lengthEnd:163, heightStart:hs, heightEnd:he, thicknessStart:38265, thicknessEnd:38523, resolvedOutside:{ outsideDir:1 } });
// ECHTE ramen zijn 4-punts polygonen (polyPts) — snapWin slaat die over. Repro moet dat matchen.
const poly = (x,y,w,h) => [{l:x,h:y},{l:x,h:y+h},{l:x+w,h:y+h},{l:x+w,h:y}];
const raam = (x,y,w,h) => ({ x, y, width:w, height:h, type:'raam', polyPts: poly(x,y,w,h) });
const walls = [
  { expressID:61389,  length:10825, height:2870, wallOrigin:WO(-65,2805),  openings:[raam(7500,840,1000,1740),raam(2340,840,1000,1740)] },
  { expressID:130389, length:10825, height:3170, wallOrigin:WO(2805,5975), openings:[raam(7500,1140,1000,1740),raam(2340,1140,1000,1740)] },
  { expressID:441310, length:10825, height:3170, wallOrigin:WO(5975,9145), openings:[raam(7500,1140,1000,1740),raam(2340,1140,1000,1740)] },
];

function run(banden) {
  FLAGS.paneelBanden = banden ? '1' : '0';
  const fd = buildFullGroupFacadePattern(walls, mat, 'halfsteens', 7131, null, startLijn, 0, 0, koz, edgeStagger, false);
  const panels = buildGroupPanels({ groupWidth: fd.groupWidth, groupHeight: fd.groupHeight, groupOpenings: fd.groupOpenings, rows: fd.rows, penanten: [], baseMat: mat, stripArt: null, panelen, latten, verband:'halfsteens', sparingRects: fd.sparingRects ?? [], startLijn, endExtensions: ee }).panels;
  return { fd, panels };
}

for (const banden of [true, false]) {
  const { fd, panels } = run(banden);
  const gTop = Math.round(fd.groupHeight);
  // bovenste rij = panelen met de hoogste bovenkant (cluster tol 30mm)
  const maxTop = Math.max(...panels.map(p=>p.y+p.height));
  const topRow = panels.filter(p=>Math.abs((p.y+p.height)-maxTop)<=30).sort((a,b)=>a.x-b.x);
  const tops = [...new Set(topRow.map(p=>Math.round(p.y+p.height)))].sort((a,b)=>a-b);
  const hs   = [...new Set(topRow.map(p=>Math.round(p.height)))].sort((a,b)=>a-b);
  const reachesTop = Math.round(maxTop) >= gTop-1;
  const uniform = tops.length===1 && hs.length===1;
  console.log(`\n════════ paneelBanden ${banden?'AAN':'UIT'} — groupHeight=${gTop} — ${panels.length} panelen ════════`);
  console.log(`  bovenste rij: ${topRow.length} panelen, bovenkanten={${tops.join(',')}}, hoogtes={${hs.join(',')}}, reikt tot gevel-top(${gTop})=${reachesTop}`);
  console.log(`  → ${uniform ? '🟢 UNIFORME bovenrij' : '🔴 NIET uniform ('+tops.length+' bovenkanten, '+hs.length+' hoogtes)'}`);
}
