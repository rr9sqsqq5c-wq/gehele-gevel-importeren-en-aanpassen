// REGRESSIE — de kozijn-concave-fix mag ALLEEN concave voids raken. Rechthoekige void + kozijnOffset
// moet byte-identiek blijven (knip = kozijn-bbox). Concave void + kozijnOffset → L behouden.
const _store = {};
globalThis.localStorage = { getItem:(k)=>k in _store?_store[k]:null, setItem:(k,v)=>{_store[k]=String(v);}, removeItem:(k)=>{delete _store[k];} };
globalThis.window = undefined;
_store['reprojectOpeningPolygon'] = '1';
const { buildFullGroupFacadePattern } = await import('../../src/lib/pattern.js');
const material = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
const KOZ = { left:10, right:10, top:10, bottom:10 };
const base = { expressID:1, length:3360, height:2870,
  wallOrigin:{ lengthAxis:'x', heightAxis:'y', thicknessAxis:'z', lengthStart:0, lengthEnd:3360, heightStart:0, heightEnd:2870, thicknessStart:0, thicknessEnd:272.5 } };

let pass=0, fail=0; const ok=(n,c)=>{c?pass++:fail++;console.log(c?'🟢':'🔴',n);};
const sig=(fd)=>JSON.stringify(fd.groupOpenings.map(o=>({x:Math.round(o.x),y:Math.round(o.y),w:Math.round(o.width),h:Math.round(o.height),pts:o.polyPts?.length??0})));

// 1. RECHTHOEKIGE void (pts=4) + rechthoekige kozijn + kozijnOffset → knip = kozijn-bbox, pts=0 (ongewijzigd)
{
  const rectPoly=[{l:800,h:500},{l:2000,h:500},{l:2000,h:1900},{l:800,h:1900}];
  const w={...base, openings:[{type:'raam',x:800,y:500,breedte:1200,hoogte:1400,polyPts:rectPoly,
    kozijnRect:{x:810,y:510,breedte:1180,hoogte:1380,polyPts:null}}]};
  const fd=buildFullGroupFacadePattern([w],material,'halfsteens',null,null,0,0,0,KOZ);
  const go=fd.groupOpenings[0];
  ok('rechthoek-void: knip volgt kozijn-bbox (pts=0, x≈800)', (go.polyPts?.length??0)===0 && Math.round(go.x)===800);
}
// 2. CONCAVE void (L, pts=6) + rechthoekige kozijn + kozijnOffset → L behouden (pts=6)
{
  const L=[{l:300,h:840},{l:300,h:2580},{l:3080,h:2580},{l:3080,h:60},{l:1960,h:60},{l:1960,h:840}];
  const w={...base, openings:[{type:'raam',x:300,y:60,breedte:2780,hoogte:2520,polyPts:L,
    kozijnRect:{x:295,y:65,breedte:2770,hoogte:2495,polyPts:null}}]};
  const fd=buildFullGroupFacadePattern([w],material,'halfsteens',null,null,0,0,0,KOZ);
  const go=fd.groupOpenings[0];
  ok('concave-void: L behouden bij kozijnOffset (pts=6)', (go.polyPts?.length??0)===6);
  // notch l[360..1900] h[110..780] moet bekleed zijn
  let hit=0; for(const r of fd.rows){ if(r.y<110||r.y>780)continue; for(const p of r.pieces){const s=p.start,e=p.start+p.length; if(Math.min(e,1900)-Math.max(s,360)>5)hit++;}}
  ok('concave-void: notch bekleed (>0 pieces)', hit>0);
}
// 3. kozijnOffset UIT → concave void ongemoeid (pts=6, byte-identiek aan zonder fix want _base=op)
{
  const L=[{l:300,h:840},{l:300,h:2580},{l:3080,h:2580},{l:3080,h:60},{l:1960,h:60},{l:1960,h:840}];
  const w={...base, openings:[{type:'raam',x:300,y:60,breedte:2780,hoogte:2520,polyPts:L,
    kozijnRect:{x:295,y:65,breedte:2770,hoogte:2495,polyPts:null}}]};
  const fd=buildFullGroupFacadePattern([w],material,'halfsteens',null,null,0,0,0,null);
  ok('kozijnOffset UIT: L behouden (pts=6)', (fd.groupOpenings[0].polyPts?.length??0)===6);
}
console.log(`\n${fail===0?'🟢 ALLE':'🔴'} ${pass} groen, ${fail} rood`);
process.exit(fail?1:0);
