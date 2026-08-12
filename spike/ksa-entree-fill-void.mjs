// SPIKE (read-only) — in het BRONMODEL van de export (BIL-KSA-A): meet voor de ENTREE
// (voordeur + entree-raam) de FILL-bbox (=wat de app als kozijnRect pakt) én de RUWE VOID
// (IfcOpeningElement). Kandidaten voor de 40mm: fill breder dan 2240, of void gebruikt.
import { IfcAPI } from 'web-ifc';
import fs from 'fs';
const wi = await import('web-ifc');
const PATH = 'C:\\Users\\MurkAnneKooistraKooi\\Downloads\\downloads tot 10-7\\BIL-KSA-A-ZZ-PBP1.ifc';
const api = new IfcAPI(); await api.Init();
const bid = api.OpenModel(new Uint8Array(fs.readFileSync(PATH)));
const mm = v => Math.round(v);

function bbox(eID){
  let mesh; try{mesh=api.GetFlatMesh(bid,eID);}catch{return null;} if(!mesh||mesh.geometries.size()===0)return null;
  let b=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
  for(let gi=0;gi<mesh.geometries.size();gi++){ const pl=mesh.geometries.get(gi); let g;
    try{ g=api.GetGeometry(bid,pl.geometryExpressID); const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()); const m=pl.flatTransformation;
      for(let vi=0;vi<v.length;vi+=6){const x=v[vi],y=v[vi+1],z=v[vi+2];const w=[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];for(let k=0;k<3;k++){if(w[k]<b[k])b[k]=w[k];if(w[k]>b[k+3])b[k+3]=w[k];}}
    }catch{}finally{g?.delete();}
  }
  return b[0]===Infinity?null:b;
}
const P = b => 'X['+mm(b[0])+'..'+mm(b[3])+'] Y['+mm(b[1])+'..'+mm(b[4])+'] Z['+mm(b[2])+'..'+mm(b[5])+']';
const horiz = b => { const dx=b[3]-b[0], dz=b[5]-b[2]; return dx>=dz?{ax:'X',lo:b[0],hi:b[3],w:dx}:{ax:'Z',lo:b[2],hi:b[5],w:dz}; };

// 1) vind voordeur + entree-raam op tag/naam
function findByTag(typeEnum, tags){
  const v=api.GetLineIDsWithType(bid, typeEnum); const out=[];
  for(let i=0;i<v.size();i++){ const id=v.get(i); const l=api.GetLine(bid,id,false); const tag=l?.Tag?.value??''; const nm=l?.Name?.value??'';
    if(tags.some(t=>String(tag).includes(t)||nm.includes(t))) out.push({id,tag,nm}); }
  return out;
}
const doors = findByTag(wi.IFCDOOR, ['26025146','voordeur']);
const wins  = findByTag(wi.IFCWINDOW, ['26025427']);
console.log('voordeuren:', doors.map(d=>`#${d.id} "${d.nm}" tag=${d.tag}`).join(' | ') || 'GEEN');
console.log('entree-ramen:', wins.map(d=>`#${d.id} "${d.nm}" tag=${d.tag}`).join(' | ') || 'GEEN');

const dEl = doors[0], wEl = wins[0];
if(dEl){ const b=bbox(dEl.id); console.log('\nDEUR-FILL   #'+dEl.id+'  '+P(b)+'  horizontaal '+horiz(b).ax+' breedte '+mm(horiz(b).w)); dEl.b=b; }
if(wEl){ const b=bbox(wEl.id); console.log('RAAM-FILL   #'+wEl.id+'  '+P(b)+'  horizontaal '+horiz(b).ax+' breedte '+mm(horiz(b).w)); wEl.b=b; }
if(dEl?.b && wEl?.b){ const hd=horiz(dEl.b), hw=horiz(wEl.b); const lo=Math.min(hd.lo,hw.lo), hi=Math.max(hd.hi,hw.hi);
  console.log('GECOMB FILL-breedte: '+mm(hi-lo)+' mm  (verwacht ~2240)'); }

// 2) de VOIDs (IfcOpeningElement) rond de entree: via IfcRelFillsElement (opening<->fill) + bbox
console.log('\n== VOIDS (IfcOpeningElement) via IfcRelFillsElement ==');
const fills = api.GetLineIDsWithType(bid, wi.IFCRELFILLSELEMENT);
const targetFills = new Set([dEl?.id, wEl?.id].filter(Boolean));
for(let i=0;i<fills.size();i++){ const rid=fills.get(i); const r=api.GetLine(bid,rid,false);
  const buildingEl = r?.RelatedBuildingElement?.value; const opening = r?.RelatingOpeningElement?.value;
  if(!targetFills.has(buildingEl)) continue;
  const vb = bbox(opening); const h = vb?horiz(vb):null;
  console.log('  fill #'+buildingEl+' ← void #'+opening+'  '+(vb?P(vb)+'  void-breedte '+mm(h.w):'(geen geom)'));
}
api.CloseModel(bid);
