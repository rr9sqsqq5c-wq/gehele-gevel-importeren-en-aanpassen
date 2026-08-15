// PROOF — latten-plaatsingsmodus 'paneelvoeg': lat op elke horizontale paneelvoeg + start/eind + tussenvulling.
// Vergelijkt ook: modus 'interval' MÉT vlag aan == huidig interval-pad (byte-identiek).
const FLAGS = { paneelOptimalisatie:'1', unifiedPanels:'1', unifiedLatten:'1', paneelBanden:'1', lattenPaneelvoeg:'0', onderlatOffset:'1', paneelStartLijn:'1' };
globalThis.localStorage = { getItem:(k)=>FLAGS[k]??null, setItem(){}, removeItem(){} };
const { buildFullGroupFacadePattern } = await import('../src/lib/pattern.js');
const { buildGroupPanels, buildFacadeLatten } = await import('../src/lib/panelization.js');

const mat = { steenL:221, steenH:51, lint:5.6, stoot:5.6, brickWeightM2:40, dikte:23 };
const startLijn = 62;
const panelen = { enabled:true, breedte:3000, hoogte:1200, dikte:10, gewichtM2:11.8, maxKg:50, verspringen:false };
const wall = (W,H)=>({ expressID:1, length:W, height:H, wallOrigin:{ lengthAxis:'x', heightAxis:'y', thicknessAxis:'z', lengthStart:0, lengthEnd:W, heightStart:0, heightEnd:H, thicknessStart:0, thicknessEnd:100, resolvedOutside:{outsideDir:1} }, openings:[] });

function build(modus, flagOn) {
  FLAGS.lattenPaneelvoeg = flagOn ? '1' : '0';
  const latten = { enabled:true, richting:'horizontaal', breedte:45, dikte:95, maxInterval:400, minHOH:370, maxHOH:430, plaatsingsModus: modus };
  const fd = buildFullGroupFacadePattern([wall(3000,3200)], mat, 'halfsteens', null, null, startLijn, 0, 0, null, null, false);
  const panels = buildGroupPanels({ groupWidth: fd.groupWidth, groupHeight: fd.groupHeight, groupOpenings: fd.groupOpenings, rows: fd.rows, penanten:[], baseMat:mat, stripArt:null, panelen, latten, verband:'halfsteens', sparingRects:[], startLijn, endExtensions:null }).panels;
  const lat = buildFacadeLatten({ facadeData: fd, latten, mat, panelen, panels, penanten:[], startLijn, verband:'halfsteens', backingType:'hout', sparingRects:[], endExtensions:null });
  return { fd, panels, lat: lat.filter(l=>l.richting==='horizontaal') };
}

// paneelvoegen (horizontale naden) uit de panelen
function seams(panels) {
  const bots = [...new Set(panels.map(p=>Math.round(p.y)))].sort((a,b)=>a-b);
  const tops = [...new Set(panels.map(p=>Math.round(p.y+p.height)))].sort((a,b)=>a-b);
  // interne naden = paneel-onderkanten die geen gevel-onderkant zijn
  return bots.filter(b => b > bots[0]+1).map(b => { const t = tops.filter(x=>x<=b+0.5).pop() ?? b-3; return Math.round((t+b)/2); });
}

const iv0 = build('interval', false);   // vlag uit
const iv1 = build('interval', true);    // vlag aan, modus interval → moet identiek zijn aan iv0
const pv  = build('paneelvoeg', true);  // vlag aan, modus paneelvoeg

const sig = (ls)=>ls.map(l=>`${Math.round(l.x)},${Math.round(l.y)},${Math.round(l.width)},${Math.round(l.height)}`).sort();
const s0 = sig(iv0.lat), s1 = sig(iv1.lat);
const identiek = s0.length===s1.length && s0.every((v,i)=>v===s1[i]);
console.log(`\n1) BYTE-IDENTIEK (modus 'interval' met vlag aan == vlag uit)? ${iv0.lat.length} vs ${iv1.lat.length} latten → ${identiek?'🟢 JA':'🔴 NEE'}`);

const sm = seams(pv.panels);
const gH = Math.round(pv.fd.groupHeight);
const latCenters = pv.lat.map(l=>Math.round(l.y + l.height/2));
console.log(`\n2) MODUS 'paneelvoeg' — gevel ${Math.round(pv.fd.groupWidth)}×${gH}, ${pv.panels.length} panelen, ${pv.lat.length} horizontale latten`);
console.log(`   paneelvoegen (naden) @ y = [${sm.join(', ')}]`);
const hit = (y)=>latCenters.some(c=>Math.abs(c-y) <= 25);
const allSeamsCovered = sm.every(hit);
console.log(`   lat op elke paneelvoeg? ${sm.map(y=>`${y}:${hit(y)?'✓':'✗'}`).join('  ')} → ${allSeamsCovered?'🟢 JA':'🔴 NEE'}`);
const rollen = {}; for (const l of pv.lat) rollen[l.rol ?? '—'] = (rollen[l.rol ?? '—']||0)+1;
console.log(`   rollen: ${Object.entries(rollen).map(([k,v])=>`${k}=${v}`).join(', ')}`);
const heeftStart = pv.lat.some(l=>l.rol==='start'), heeftEind = pv.lat.some(l=>l.rol==='eind'||l.rol==='dorpel');
console.log(`   start-lat aanwezig? ${heeftStart?'🟢':'🔴'} · eind/dorpel-lat aanwezig? ${heeftEind?'🟢':'🔴'}`);
console.log(`   lat-Y-centers = [${latCenters.sort((a,b)=>a-b).join(', ')}]`);

// max hart-op-hart gat tussen opeenvolgende latten (moet ≤ ~maxInterval blijven door tussenvulling)
const cs = [...latCenters].sort((a,b)=>a-b);
let maxGap=0; for (let i=1;i<cs.length;i++) maxGap=Math.max(maxGap, cs[i]-cs[i-1]);
console.log(`   grootste hart-op-hart gat = ${maxGap}mm (maxInterval=400) → ${maxGap<=430?'🟢 binnen':'🟠 groter dan maxInterval'}`);

// 3) ONDERLAT op startLijn+10? (l.y = onderkant van de lat, facade y-up). startLijn=62 → verwacht 72.
console.log(`\n3) ONDERLAT 10mm boven starthoogte (startLijn=${startLijn}, verwacht onderkant=${startLijn+10})?`);
for (const [naam, r] of [['interval', iv1], ['paneelvoeg', pv]]) {
  const onder = Math.min(...r.lat.map(l=>l.y));   // laagste lat-onderkant
  const ok = Math.abs(onder - (startLijn+10)) <= 1;
  console.log(`   ${naam}: onderste lat-onderkant y=${onder} → ${ok?'🟢 = startLijn+10':'🔴 ≠ startLijn+10 ('+onder+')'}`);
}
