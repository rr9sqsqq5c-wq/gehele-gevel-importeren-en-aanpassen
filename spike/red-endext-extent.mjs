// READ-ONLY — welk x-bereik nemen de VERLENGDE strips + panelen echt in? (voor de werktekening-extent-fix)
const FLAGS = { paneelBanden:'1', paneelOptimalisatie:'1', gevelHandedness:'1', keepEndExtension:'1', unifiedPanels:'1', endTrim:'1', paneelStartLijn:'1' };
globalThis.localStorage = { getItem:(k)=>FLAGS[k]??null, setItem(){}, removeItem(){} };
const { buildFullGroupFacadePattern } = await import('../src/lib/pattern.js');
const { buildGroupPanels } = await import('../src/lib/panelization.js');

const mat = { steenL:221, steenH:51, lint:5.6, stoot:5.6, brickWeightM2:40, dikte:23 };
const startLijn = 62;
const panelen = { enabled:true, breedte:3000, hoogte:1200, dikte:10, gewichtM2:11.8, maxKg:50, verspringen:false };
const latten  = { enabled:true, richting:'horizontaal', breedte:45, dikte:95, maxInterval:400 };
const wall = (W,H,hs,he)=>({ expressID:1, length:W, height:H, wallOrigin:{ lengthAxis:'x', heightAxis:'y', thicknessAxis:'z', lengthStart:0, lengthEnd:W, heightStart:hs, heightEnd:he, thicknessStart:0, thicknessEnd:100, resolvedOutside:{outsideDir:1} }, openings:[] });
const walls = [wall(10825,2870,0,2870)];
// Groep 4 verlenging: links strips+panels 306, rechts strips+panels 48
const ee = { left:{ strips:306, battens:0, panels:306 }, right:{ strips:48, battens:0, panels:48 } };
const extendLeft = Math.max(0, ee.left.strips), extendRight = Math.max(0, ee.right.strips);

const fd = buildFullGroupFacadePattern(walls, mat, 'halfsteens', null, null, startLijn, extendLeft, extendRight, null, null, false);
const panels = buildGroupPanels({ groupWidth: fd.groupWidth, groupHeight: fd.groupHeight, groupOpenings: fd.groupOpenings, rows: fd.rows, penanten:[], baseMat:mat, stripArt:null, panelen, latten, verband:'halfsteens', sparingRects:[], startLijn, endExtensions: ee }).panels;

// strip-extent (pieces)
let sMin=Infinity, sMax=-Infinity;
for (const r of fd.rows) for (const p of (r.pieces??[])) { sMin=Math.min(sMin,p.start); sMax=Math.max(sMax,p.start+p.length); }
// paneel-extent
const pMin=Math.min(...panels.map(p=>p.x)), pMax=Math.max(...panels.map(p=>p.x+p.width));

console.log(`facadeData: groupWidth=${Math.round(fd.groupWidth)}  extendLeft=${fd.extendLeft}  extendRight=${fd.extendRight}`);
console.log(`verwacht verlengde totaal (strips) = ${Math.round(fd.groupWidth)} + ${extendLeft} + ${extendRight} = ${Math.round(fd.groupWidth)+extendLeft+extendRight}`);
console.log(`STRIP-extent (rows pieces):  x ${Math.round(sMin)} .. ${Math.round(sMax)}   (breedte ${Math.round(sMax-sMin)})`);
console.log(`PANEEL-extent (buildGroupPanels): x ${Math.round(pMin)} .. ${Math.round(pMax)}   (breedte ${Math.round(pMax-pMin)})`);
console.log(`→ linker buitenrand ≈ ${Math.round(Math.min(sMin,pMin))} (verwacht -${extendLeft}); rechter buitenrand ≈ ${Math.round(Math.max(sMax,pMax))} (verwacht ${Math.round(fd.groupWidth)+extendRight})`);
