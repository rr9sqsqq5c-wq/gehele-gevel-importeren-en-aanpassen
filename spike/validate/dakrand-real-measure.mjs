// MEETBEWIJS (GEEN CI-waakhond): vereist 44 MB BIL-MOO + VIA-dakranden die NIET in de
// repo zitten → niet geschikt als automatische test. De self-contained waakhond is
// dakrand-gap-mask.mjs. Dit script documenteert de meting op echte data.
// READ-ONLY meting op ECHTE modellen: BIL-MOO (gevel) + VIA dakranden (band).
// Beantwoordt: (1) bestaat een band met verticaal gat tot de gevel? (2) fascia vs kap?
// (3) zelfde autoGroupByWindrichting-bucket? (4) echte buildBestFitFacadePattern: band
// bekleed? gat-rijen leeg? "vlak-normaal≈up-as"-waarschuwing? Geen src-wijziging.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildBestFitFacadePattern } from '../../src/lib/facadePlane.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
const BB = resolve(__dirname, '../../');
const W = createRequire(pathToFileURL(BB + '/package.json'))(resolve(BB, 'node_modules/web-ifc/web-ifc-api-node.js'));
const MOO = 'C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/BIL-MOO-A-ZZ-PBP.ifc';
const DAK = 'C:/Users/MurkAnneKooistraKooi/Downloads/BIL-VIA-L-ZZ-PBP_dakranden.IFC.ifc';
const UP = 'y'; // beide modellen zijn Y-up (gemeten); expliciet meegegeven aan best-fit

function getBBox(api, mid, eid) {
  let mesh; try { mesh = api.GetFlatMesh(mid, eid); } catch { return null; }
  if (!mesh || mesh.geometries.size() === 0) return null;
  let a=Infinity,b=-Infinity,c=Infinity,d=-Infinity,e=Infinity,f=-Infinity,ok=false;
  for (let gi=0; gi<mesh.geometries.size(); gi++){ const pl=mesh.geometries.get(gi); let g;
    try{ g=api.GetGeometry(mid,pl.geometryExpressID); const vs=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()); const m=pl.flatTransformation;
      for(let i=0;i<vs.length;i+=6){ const x=vs[i]??0,y=vs[i+1]??0,z=vs[i+2]??0;
        const wx=m[0]*x+m[4]*y+m[8]*z+m[12],wy=m[1]*x+m[5]*y+m[9]*z+m[13],wz=m[2]*x+m[6]*y+m[10]*z+m[14];
        if(wx<a)a=wx;if(wx>b)b=wx;if(wy<c)c=wy;if(wy>d)d=wy;if(wz<e)e=wz;if(wz>f)f=wz;ok=true; } } finally { g?.delete(); } }
  return ok?{minX:a,maxX:b,minY:c,maxY:d,minZ:e,maxZ:f}:null;
}
// verbatim deriveWallAxes (ifc.js), up='y'-tak
function deriveWallAxes(dx,dy,dz){ const la=dx>=dz?'x':'z',ta=dx>=dz?'z':'x';
  return {heightAxis:'y',lengthAxis:la,thicknessAxis:ta,length:Math.round(Math.max(dx,dz)*1000),height:Math.round(dy*1000),thickness:Math.round(Math.min(dx,dz)*1000)};}
const M=1000;
function toElem(api, mid, eid, name){ const bb=getBBox(api,mid,eid); if(!bb)return null;
  const dx=bb.maxX-bb.minX,dy=bb.maxY-bb.minY,dz=bb.maxZ-bb.minZ; const A=deriveWallAxes(dx,dy,dz);
  const mn={x:bb.minX*M,y:bb.minY*M,z:bb.minZ*M}, mx={x:bb.maxX*M,y:bb.maxY*M,z:bb.maxZ*M};
  const wo={lengthAxis:A.lengthAxis,heightAxis:A.heightAxis,thicknessAxis:A.thicknessAxis,
    lengthStart:mn[A.lengthAxis],lengthEnd:mx[A.lengthAxis],heightStart:mn.y,heightEnd:mx.y,
    thicknessStart:mn[A.thicknessAxis],thicknessEnd:mx[A.thicknessAxis]};
  // thinnest WERELD-as (klassering fascia vs kap)
  const ext={x:dx,y:dy,z:dz}; const thin=['x','y','z'].reduce((p,q)=>ext[p]<=ext[q]?p:q);
  return {expressID:eid,name:name||'',length:A.length,height:A.height,openings:[],wallOrigin:wo,
    _thin:thin,_dimsMM:{dx:Math.round(dx*M),dy:Math.round(dy*M),dz:Math.round(dz*M)}};
}
const bucket = (wo)=>`${wo.thicknessAxis}:${Math.round((wo.thicknessStart/1000)/50)*50*1000}`; // 50mm-bucket (App.jsx:4344)

const api = new W.IfcAPI(); await api.Init();

// ── BIL-MOO gevelwanden ──
const mMoo = api.OpenModel(new Uint8Array(readFileSync(MOO)), {});
const wallTypes=['IFCWALLSTANDARDCASE','IFCWALL']; const gevels=[];
for(const tn of wallTypes){ let code;try{code=api.GetTypeCodeFromName(tn);}catch{continue;} let v;try{v=api.GetLineIDsWithType(mMoo,code);}catch{continue;}
  for(let i=0;i<v.size();i++){ const el=toElem(api,mMoo,v.get(i)); if(!el)continue;
    // gevel = (bijna-)verticaal: y-extent (hoogte) groot, dun in een horizontale as
    if(el._thin!=='y' && el.height>=1500) gevels.push(el); } }
api.CloseModel(mMoo);

// ── VIA dakrand-platen ──
const mDak = api.OpenModel(new Uint8Array(readFileSync(DAK)), {});
const bands=[];
for(const tn of ['IFCPLATE','IFCSLAB','IFCBUILDINGELEMENTPROXY','IFCCOVERING']){ let code;try{code=api.GetTypeCodeFromName(tn);}catch{continue;} let v;try{v=api.GetLineIDsWithType(mDak,code);}catch{continue;}
  for(let i=0;i<v.size();i++){ const el=toElem(api,mDak,v.get(i)); if(el) bands.push(el); } }

console.log(`BIL-MOO: ${gevels.length} (bijna-)verticale gevelwanden (height≥1500, thin≠y)`);
console.log(`VIA dakranden: ${bands.length} platen/elementen`);

// (2) fascia (thin = horizontale as) vs kap (thin = y/up)
const fascia = bands.filter(b=>b._thin!=='y'); const kap = bands.filter(b=>b._thin==='y');
console.log(`\n(2) BAND-GEOMETRIE: fascia (thin≠y, verticaal zichtvlak)=${fascia.length} | kap (thin=y, ~horizontaal)=${kap.length}`);

// kies een representatieve FASCIA-band (langste) en zoek de gevel eronder
fascia.sort((a,b)=>b.length-a.length);
let chosen=null;
for(const band of fascia.slice(0,40)){
  const bWo=band.wallOrigin, bBucket=bucket(bWo);
  // gevel met zelfde bucket + overlappende lengte + top (heightEnd) ONDER band.heightStart
  const under = gevels.filter(g=>bucket(g.wallOrigin)===bBucket
    && Math.min(g.wallOrigin.lengthEnd,bWo.lengthEnd)-Math.max(g.wallOrigin.lengthStart,bWo.lengthStart) > 500
    && g.wallOrigin.heightEnd <= bWo.heightStart + 5);
  if(under.length){ under.sort((a,b)=>b.wallOrigin.heightEnd-a.wallOrigin.heightEnd); chosen={band,gevel:under[0]}; break; }
}

if(!chosen){
  console.log('\n(1/3) GEEN fascia-band met een gevel-eronder in dezelfde bucket gevonden.');
  console.log('  → losstaande band-boven-gevel met verticaal gat is hier NIET als één-bucket-paar reproduceerbaar.');
  // toon toch bucket-overzicht voor 3
  const gB={}; for(const g of gevels){const k=bucket(g.wallOrigin);gB[k]=(gB[k]||0)+1;}
  const bB={}; for(const b of fascia){const k=bucket(b.wallOrigin);bB[k]=(bB[k]||0)+1;}
  console.log('  gevel-buckets:', JSON.stringify(gB));
  console.log('  fascia-band-buckets:', JSON.stringify(bB));
  api.CloseModel(mDak); process.exit(0);
}

const {band,gevel}=chosen;
const gap = band.wallOrigin.heightStart - gevel.wallOrigin.heightEnd;
console.log('\n(1) PAAR GEVONDEN — verticaal gat:');
console.log(`  gevel #${gevel.expressID}: u1(top)=${gevel.wallOrigin.heightEnd} mm  thin=${gevel._thin} dims=${JSON.stringify(gevel._dimsMM)}`);
console.log(`  band  #${band.expressID}: u0(onder)=${band.wallOrigin.heightStart} u1=${band.wallOrigin.heightEnd} thin=${band._thin} dims=${JSON.stringify(band._dimsMM)}`);
console.log(`  → gap = band.u0 − gevel.u1 = ${Math.round(gap)} mm`);
console.log('\n(3) GROEPERING (autoGroupByWindrichting-bucket):');
console.log(`  gevel bucket: ${bucket(gevel.wallOrigin)}`);
console.log(`  band  bucket: ${bucket(band.wallOrigin)}`);
console.log(`  → ${bucket(gevel.wallOrigin)===bucket(band.wallOrigin)?'ZELFDE bucket (samen in één windrichting-groep)':'VERSCHILLENDE bucket (apart)'}`);

// (4) echte buildBestFitFacadePattern op het paar
const mat={steenL:210,steenH:50,lint:12,stoot:10};
const warns=[]; const _warn=console.warn; console.warn=(...a)=>warns.push(a.join(' '));
const fd = buildBestFitFacadePattern([gevel,band], mat, 'halfsteens', null,null,null,null,0,0, UP);
console.warn=_warn;
const rowH=mat.steenH;
const gMinH = Math.min(gevel.wallOrigin.heightStart, band.wallOrigin.heightStart);
const ys = (fd?.rows??[]).map(r=>Math.round(r.y+gMinH)).sort((x,y)=>x-y); // terug naar wereld-y (mm)
const gapRows = ys.filter(y=> y>=gevel.wallOrigin.heightEnd && y+rowH<=band.wallOrigin.heightStart);
const bandRows = ys.filter(y=> y+rowH> band.wallOrigin.heightStart && y<=band.wallOrigin.heightEnd);
console.log('\n(4) buildBestFitFacadePattern op {gevel, band}:');
console.log(`  plane: ${JSON.stringify(fd?._bestFit&&{uAxis:fd._bestFit.uAxis,tAxis:fd._bestFit.tAxis,nAxis:fd._bestFit.nAxis})}`);
console.log(`  band krijgt strips? ${bandRows.length>0?'JA ✅ ('+bandRows.length+' rijen)':'NEE ❌'}`);
console.log(`  gat-rijen (volledig in gat) bekleed? ${gapRows.length===0?'NEE → gat ONBEKLEED ✅':'JA ❌ '+JSON.stringify(gapRows)}`);
console.log(`  "vlak-normaal≈up-as"-waarschuwing? ${warns.some(w=>/bijna-horizontaal|valt samen met de model-up/.test(w))?'JA ⚠':'nee'}`);
if(warns.length) console.log('  alle waarschuwingen:', JSON.stringify(warns));
api.CloseModel(mDak);
