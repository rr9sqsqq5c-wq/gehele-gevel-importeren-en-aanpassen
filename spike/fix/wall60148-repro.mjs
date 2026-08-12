// READ-ONLY REPRO — wall 60148: ÉÉN raam met een 6-punts L-polygoon. De L-notch (massief muurdeel
// onder de linkerhelft van het raam) = l[300..1960] h[60..840]. Wordt die bekleed (L behouden) of
// geknipt (platgeslagen tot bbox)? Test DIRECT + BEST-FIT pad, met reprojectOpeningPolygon aan/uit.
const _store = {};
globalThis.localStorage = { getItem:(k)=>k in _store?_store[k]:null, setItem:(k,v)=>{_store[k]=String(v);}, removeItem:(k)=>{delete _store[k];} };
globalThis.window = undefined;
const { buildFullGroupFacadePattern } = await import('../../src/lib/pattern.js');
const { buildBestFitFacadePattern } = await import('../../src/lib/facadePlane.js');

const material = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
const polyPts = [ {l:300,h:840},{l:300,h:2580},{l:3080,h:2580},{l:3080,h:60},{l:1960,h:60},{l:1960,h:840} ];
const mkWall = () => ({
  expressID: 60148, name:'HSB_272', length: 3360, height: 2870,
  wallOrigin: { lengthAxis:'x', heightAxis:'y', thicknessAxis:'z',
    lengthStart:0, lengthEnd:3360, heightStart:0, heightEnd:2870, thicknessStart:0, thicknessEnd:272.5,
    resolvedOutside:{ outsideDir:1, confidence:0.9, source:'test' } },
  // kozijnRect = RECHTHOEK (polyPts null), zoals in de echte app (2770×2495) → platslaan van de L
  openings: [ { id:64264, type:'raam', x:300, y:60, breedte:2780, hoogte:2520, polyPts: polyPts.map(p=>({...p})), hasFill:true,
    kozijnRect:{ x:295, y:65, breedte:2770, hoogte:2495, polyPts:null } } ],
});
const KOZ = { left:10, right:10, top:10, bottom:10 };   // kozijnOffset AAN (zoals de gebruiker: offset 10)
// L-notch (moet BEKLEED zijn): l[300..1960] h[60..840]. Sample-venster iets binnen de randen.
const notch = { x1:360, x2:1900, y1:110, y2:780 };
function claddedInNotch(fd) {
  if(!fd) return {hit:-1};
  let hit=0, sample=[];
  for (const row of fd.rows) { if(row.y<notch.y1||row.y>notch.y2) continue;
    for (const p of row.pieces){ const s=p.start,e=p.start+p.length;
      if(Math.min(e,notch.x2)-Math.max(s,notch.x1)>5){hit++; if(sample.length<3)sample.push({y:row.y,s:Math.round(s),l:Math.round(p.length)});} } }
  return { hit, sample };
}

_store['reprojectOpeningPolygon'] = '1';   // default AAN, zoals de gebruiker
for (const koz of [null, KOZ]) {
  console.log(`\n########## kozijnOffset=${koz?'AAN (offset 10, kozijnRect=rechthoek)':'UIT'} · reprojectOpeningPolygon=AAN ##########`);
  for (const [naam, fn] of [['DIRECT', ()=>buildFullGroupFacadePattern([mkWall()],material,'halfsteens',null,null,0,0,0,koz)],
                            ['BEST-FIT', ()=>buildBestFitFacadePattern([mkWall()],material,'halfsteens',null,null,0,0,0,'y',koz)]]) {
    const fd = fn();
    const go = fd?.groupOpenings?.map(o=>({x:Math.round(o.x),y:Math.round(o.y),w:Math.round(o.width),h:Math.round(o.height),pts:o.polyPts?.length??0}));
    const { hit, sample } = claddedInNotch(fd);
    console.log(`  ${naam}: groupOpenings`, JSON.stringify(go), `| notch pieces=${hit}`, hit===0?'🔴 ONBEKLEED (bbox platgeslagen)':hit>0?'🟢 bekleed (L behouden)':'— geen fd', hit>0?JSON.stringify(sample):'');
  }
}
