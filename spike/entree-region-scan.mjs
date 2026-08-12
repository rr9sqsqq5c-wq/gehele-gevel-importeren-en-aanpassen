// SPIKE (read-only) — scan de ENTREE-regio in BIL-MOO: elk relevant element (deur/raam/paneel/
// member/proxy) + elke VOID (IfcOpeningElement) die er overlapt. Doel: zien welke rechthoek 2300
// breed is (fill-assembly of ruwe void), want offset stond UIT dus de +60mm zit in de kozijn-keuze.
import { IfcAPI } from 'web-ifc';
import fs from 'fs';
const wi = await import('web-ifc');
const api = new IfcAPI(); await api.Init();
const bid = api.OpenModel(new Uint8Array(fs.readFileSync('public/BIL-MOO-A-ZZ-PBP.ifc')));
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
// entree-regio (uit eerdere meting): X 35600..38100, Y 700..3400, Z ~ -10700..-10500
const RX=[35600,38100], RY=[700,3400], RZ=[-10800,-10450];
const inRegion = b => b && b[3]>RX[0]&&b[0]<RX[1] && b[4]>RY[0]&&b[1]<RY[1] && b[5]>RZ[0]&&b[2]<RZ[1];
const P = b => 'X['+String(mm(b[0])).padStart(6)+'..'+String(mm(b[3])).padStart(6)+'] brX '+String(mm(b[3]-b[0])).padStart(5)+'  Y['+mm(b[1])+'..'+mm(b[4])+'] brY '+mm(b[4]-b[1]);

const TYPES = [['DOOR',wi.IFCDOOR],['WINDOW',wi.IFCWINDOW],['PLATE',wi.IFCPLATE],['MEMBER',wi.IFCMEMBER],
  ['CURTAINWALL',wi.IFCCURTAINWALL],['PROXY',wi.IFCBUILDINGELEMENTPROXY],['OPENING',wi.IFCOPENINGELEMENT]];
console.log('== ELEMENTEN in entree-regio (X 35600..38100) ==');
for (const [label,enumT] of TYPES){
  const v=api.GetLineIDsWithType(bid, enumT); let hits=[];
  for(let i=0;i<v.size();i++){ const id=v.get(i); const b=bbox(id); if(!inRegion(b))continue;
    const l=api.GetLine(bid,id,false); hits.push({id,nm:l?.Name?.value??'',tag:l?.Tag?.value??'',b}); }
  if(!hits.length) continue;
  hits.sort((a,b)=>a.b[0]-b.b[0]);
  console.log('\n-- '+label+' ('+hits.length+') --');
  for(const h of hits) console.log('  #'+String(h.id).padStart(6)+'  '+P(h.b)+'  "'+h.nm.slice(0,42)+'" tag='+h.tag);
}

// gecombineerde horizontale spanwijdte van DOOR+WINDOW fills in de regio
console.log('\n== VOIDS gekoppeld aan fills in de regio (IfcRelFillsElement) ==');
const fills = api.GetLineIDsWithType(bid, wi.IFCRELFILLSELEMENT);
for(let i=0;i<fills.size();i++){ const r=api.GetLine(bid,fills.get(i),false);
  const be=r?.RelatedBuildingElement?.value, op=r?.RelatingOpeningElement?.value; if(!be)continue;
  const bb=bbox(be); if(!inRegion(bb))continue; const vb=bbox(op);
  console.log('  fill #'+be+' (brX '+mm(bb[3]-bb[0])+') ← void #'+op+' '+(vb?'(brX '+mm(vb[3]-vb[0])+', X['+mm(vb[0])+'..'+mm(vb[3])+'])':'(geen geom)'));
}
api.CloseModel(bid);
