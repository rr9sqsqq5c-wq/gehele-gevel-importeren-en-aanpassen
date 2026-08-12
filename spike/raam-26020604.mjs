// SPIKE (read-only) — raam tag 26020604 (type A_1800x1723) in BIL-MOO: trace raam→fill-rel→opening→
// void-rel→wand, meet frame-breedte (1800?) vs void-breedte, en boots de clip na met de patroon-bouwer.
import { IfcAPI } from 'web-ifc'; import fs from 'fs';
const wi = await import('web-ifc');
const api = new IfcAPI(); await api.Init();
const bid = api.OpenModel(new Uint8Array(fs.readFileSync('public/BIL-MOO-A-ZZ-PBP.ifc')));
const mm = v => Math.round(v*1000);
function bb(eID){ let mesh; try{mesh=api.GetFlatMesh(bid,eID);}catch{return null;} if(!mesh||mesh.geometries.size()===0)return null;
  let b=[1/0,1/0,1/0,-1/0,-1/0,-1/0];
  for(let gi=0;gi<mesh.geometries.size();gi++){ const pl=mesh.geometries.get(gi); let g;
    try{ g=api.GetGeometry(bid,pl.geometryExpressID); const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()); const m=pl.flatTransformation;
      for(let vi=0;vi<v.length;vi+=6){const x=v[vi],y=v[vi+1],z=v[vi+2];const w=[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];for(let k=0;k<3;k++){if(w[k]<b[k])b[k]=w[k];if(w[k]>b[k+3])b[k+3]=w[k];}}
    }catch{}finally{g?.delete();} }
  return b[0]===1/0?null:b; }
const dims = b => { if(!b)return null; const dx=mm(b[3]-b[0]),dy=mm(b[4]-b[1]),dz=mm(b[5]-b[2]);
  const l = dx>=dz?dx:dz; return { L:l, H:dy, dx,dy,dz, Lax: dx>=dz?'X':'Z' }; };

// 1) vind het raam op tag
let winID=null; const wv=api.GetLineIDsWithType(bid, wi.IFCWINDOW);
for(let i=0;i<wv.size();i++){ const id=wv.get(i); const l=api.GetLine(bid,id,false); if(String(l?.Tag?.value)==='26020604'){winID=id;break;} }
console.log('raam #'+winID+' (tag 26020604)');
const wb=bb(winID); const wd=dims(wb);
console.log('  FRAME (fill) bbox:', wd ? `L=${wd.L} H=${wd.H}  (verwacht 1800 x 1723)  Lax=${wd.Lax}` : 'geen geom');

// 2) fill-rel: is dit raam een RelatedBuildingElement?
const fills=api.GetLineIDsWithType(bid, wi.IFCRELFILLSELEMENT); let openingID=null;
for(let i=0;i<fills.size();i++){ const r=api.GetLine(bid,fills.get(i),false); if(r?.RelatedBuildingElement?.value===winID){ openingID=r.RelatingOpeningElement?.value; break; } }
console.log('  fill-koppeling (IfcRelFillsElement):', openingID ? `JA → opening #${openingID}` : 'NEE (geen fill-rel → fillID=null → kozijnRect leeg → VOID gebruikt!)');

// 3) void-maat + welke wand
if(openingID){ const ob=bb(openingID); const od=dims(ob);
  console.log('  VOID (opening) bbox:', od ? `L=${od.L} H=${od.H}` : 'geen geom');
  if(wd&&od) console.log(`  → verschil void−frame: L ${od.L-wd.L}mm  H ${od.H-wd.H}mm`);
  const voids=api.GetLineIDsWithType(bid, wi.IFCRELVOIDSELEMENT);
  for(let i=0;i<voids.size();i++){ const r=api.GetLine(bid,voids.get(i),false); if(r?.RelatedOpeningElement?.value===openingID){ console.log('  void-koppeling (IfcRelVoidsElement): wand #'+r.RelatingBuildingElement?.value); break; } }
}

// 4) boots de clip na met de patroon-bouwer (frame vs void als kozijnRect)
const { buildFullGroupFacadePattern } = await import('../src/lib/pattern.js');
const material = { steenL:210, steenH:50, lint:10, stoot:10 };
const frameW = wd?.L ?? 1800, frameH = wd?.H ?? 1723;
const voidW = openingID ? (dims(bb(openingID))?.L ?? frameW) : frameW;
const mk = (opW, kozW) => ({ expressID:1, length:6000, height:3000,
  wallOrigin:{lengthStart:0,heightStart:0,heightEnd:3000,lengthAxis:'x',heightAxis:'y',thicknessAxis:'z'},
  openings:[{ x:1000, y:900, width:opW, height:frameH, type:'raam', hasFill:true,
    kozijnRect: kozW ? { x:1000+(opW-kozW)/2, y:900, breedte:kozW, hoogte:frameH } : null }] });
const clip = (opW,kozW,off) => { const r=buildFullGroupFacadePattern([mk(opW,kozW)],material,'halfsteens',null,null,null,0,0,off); return Math.round(r.groupOpenings[0].width); };
console.log('\n== NABOOTSING patroon-bouwer, offset L/R=0 ==');
console.log('  kozijnRect GEVULD (frame '+frameW+') → clip:', clip(voidW, frameW, {left:0,right:0,top:0,bottom:0}), 'mm  (zou 1800 moeten zijn)');
console.log('  kozijnRect LEEG (null)          → clip:', clip(voidW, null,   {left:0,right:0,top:0,bottom:0}), 'mm  (= void '+voidW+')');
api.CloseModel(bid);
