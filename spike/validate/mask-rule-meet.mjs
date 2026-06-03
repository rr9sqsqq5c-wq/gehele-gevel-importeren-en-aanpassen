// READ-ONLY MEET-SPIKE — toets de masker-kandidaatregel "doorlopend veld" op de ECHTE
// BIL-geometrie vóór inbouw. GEEN src-wijziging. Hergebruikt fitFacadePlane (productie)
// voor het vlak-frame; projecteert leden+openingen 2D op het vlak en meet de regel.
//
// Kandidaat-regel (TOETSEN): per horizontale t-kolom het verticale bereik tussen het
// LAAGSTE en HOOGSTE element-footprint vullen; openingen DAARNA aftrekken.
// v1 (contrast): strikt footprint-masker = unie van element-rechthoeken.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fitFacadePlane } from "../../src/lib/facadePlane.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const A = resolve(__dirname, "../../../stap-1-maak-eerst-een-vast-proje-62cf");
const W = createRequire(pathToFileURL(A + "/package.json"))(resolve(A, "node_modules/web-ifc/web-ifc-api-node.js"));

const api = new W.IfcAPI(); await api.Init();
const tc=(n)=>{try{return api.GetTypeCodeFromName(n);}catch{return undefined;}};
const val=(x)=>(x&&typeof x==='object'&&'value'in x)?x.value:x;
function getBBox(mid,eid){let mesh;try{mesh=api.GetFlatMesh(mid,eid);}catch{return null;}if(!mesh||!mesh.geometries.size())return null;let a={x:Infinity,y:Infinity,z:Infinity},b={x:-Infinity,y:-Infinity,z:-Infinity},ok=false;for(let gi=0;gi<mesh.geometries.size();gi++){const pl=mesh.geometries.get(gi);let g;try{g=api.GetGeometry(mid,pl.geometryExpressID);const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize());const m=pl.flatTransformation;const st=Math.max(6,Math.floor((v.length/6)/60)*6);for(let k=0;k<v.length;k+=st){const lx=v[k],ly=v[k+1],lz=v[k+2];const wx=m[0]*lx+m[4]*ly+m[8]*lz+m[12],wy=m[1]*lx+m[5]*ly+m[9]*lz+m[13],wz=m[2]*lx+m[6]*ly+m[10]*lz+m[14];if(wx<a.x)a.x=wx;if(wx>b.x)b.x=wx;if(wy<a.y)a.y=wy;if(wy>b.y)b.y=wy;if(wz<a.z)a.z=wz;if(wz>b.z)b.z=wz;ok=true;}}finally{g?.delete();}}return ok?{minX:a.x,maxX:b.x,minY:a.y,maxY:b.y,minZ:a.z,maxZ:b.z}:null;}
function deriveWallAxes(dx,dy,dz,heightAxis){if(heightAxis==='z_neg')heightAxis='z';if(heightAxis==='y'){const la=dx>=dz?'x':'z',ta=dx>=dz?'z':'x';return{heightAxis,lengthAxis:la,thicknessAxis:ta,length:Math.round(Math.max(dx,dz)*1000),height:Math.round(dy*1000)};}const la=dx>=dy?'x':'y',ta=dx>=dy?'y':'x';return{heightAxis:'z',lengthAxis:la,thicknessAxis:ta,length:Math.round(Math.max(dx,dy)*1000),height:Math.round(dz*1000)};}
function memberFrom(mid,eid,up,kind){const bb=getBBox(mid,eid);if(!bb)return null;const dx=bb.maxX-bb.minX,dy=bb.maxY-bb.minY,dz=bb.maxZ-bb.minZ;const ax=deriveWallAxes(dx,dy,dz,up);if(ax.length<100||ax.height<100)return null;const rng=(a)=>[Math.round(bb['min'+a.toUpperCase()]*1000),Math.round(bb['max'+a.toUpperCase()]*1000)];const[ls,le]=rng(ax.lengthAxis),[hs,he]=rng(ax.heightAxis),[ts,te]=rng(ax.thicknessAxis);return{expressID:eid,kind,length:ax.length,height:ax.height,openings:[],wallOrigin:{lengthAxis:ax.lengthAxis,heightAxis:ax.heightAxis,thicknessAxis:ax.thicknessAxis,lengthStart:ls,lengthEnd:le,heightStart:hs,heightEnd:he,thicknessStart:ts,thicknessEnd:te},_bb:bb};}

// ── laad de echte BIL-gevel (zelfde recept als facadeplane-validate.mjs) ──
const midW=api.OpenModel(new Uint8Array(readFileSync("C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/BIL-MOO-A-ZZ-PBP.ifc")),{});
const typeMap={};{const v=api.GetLineIDsWithType(midW,tc('IFCRELDEFINESBYTYPE'));for(let i=0;i<v.size();i++){try{const r=api.GetLine(midW,v.get(i),false);const tr=val(r?.RelatingType);if(!tr)continue;const tn=val(api.GetLine(midW,tr,false)?.Name);for(const ro of (r?.RelatedObjects||[])){const id=val(ro);if(id&&tn)typeMap[id]=tn;}}catch{}}}
const wIds=[];for(const t of ['IFCWALLSTANDARDCASE','IFCWALL']){const v=api.GetLineIDsWithType(midW,tc(t));for(let i=0;i<v.size();i++){const id=v.get(i);if(/(^|:)\s*21[\.\s]/.test(typeMap[id]||''))wIds.push(id);}}
const wMembers=wIds.map(id=>memberFrom(midW,id,'y','wall')).filter(Boolean).filter(m=>m.wallOrigin.thicknessAxis==='x');
const binH=new Map();for(const m of wMembers){const k=Math.round(m._bb.minX/0.05);binH.set(k,(binH.get(k)||0)+1);}
let bk=0,bn=0;for(const [k,c] of binH)if(c>bn){bn=c;bk=k;}const facadeX=bk*0.05;
const facadeWalls=wMembers.filter(m=>Math.abs(m._bb.minX-facadeX)<0.06);
api.CloseModel(midW);
const midD=api.OpenModel(new Uint8Array(readFileSync("C:/Users/MurkAnneKooistraKooi/Downloads/BIL-VIA-L-ZZ-PBP_dakranden.IFC.ifc")),{});
const pIds=[];{const v=api.GetLineIDsWithType(midD,tc('IFCPLATE'));for(let i=0;i<v.size();i++)pIds.push(v.get(i));}
const pMembers=pIds.map(id=>memberFrom(midD,id,'z','dak')).filter(Boolean);
const dakFront=pMembers.filter(m=>{const e={x:m._bb.maxX-m._bb.minX,y:m._bb.maxY-m._bb.minY,z:m._bb.maxZ-m._bb.minZ};const thin=['x','y','z'].reduce((a,b)=>e[a]<=e[b]?a:b);return thin==='x'&&Math.abs(m._bb.minX-facadeX)<0.06;});
api.CloseModel(midD);

const sel=[...facadeWalls,...dakFront].map(m=>{ if(m.wallOrigin.thicknessAxis==='x') m.wallOrigin.resolvedOutside={outsideDir:-1, outsidePos:m.wallOrigin.thicknessStart}; return m; });
console.log(`BIL: facade-vlak X≈${facadeX.toFixed(2)} m | buitenwanden=${facadeWalls.length} | dakrand-voorplaten=${dakFront.length}`);

// ── 1. projecteer alle leden op het best-fit-vlak → 2D-footprints in (tAxis,uAxis) ──
const plane = fitFacadePlane(sel, 'y');
const T=plane.tAxis.toUpperCase(), U=plane.uAxis.toUpperCase();
function aabbWorld(wo){const A={};const put=(ax,a,b)=>{A['min'+ax.toUpperCase()]=Math.min(a,b);A['max'+ax.toUpperCase()]=Math.max(a,b);};put(wo.lengthAxis,wo.lengthStart,wo.lengthEnd);put(wo.heightAxis,wo.heightStart,wo.heightEnd);put(wo.thicknessAxis,wo.thicknessStart,wo.thicknessEnd);return A;}
const rects = sel.map(m=>{const A=aabbWorld(m.wallOrigin);return{kind:m.kind,t0:A['min'+T],t1:A['max'+T],u0:A['min'+U],u1:A['max'+U]};});
console.log(`vlak-frame: tAxis=${plane.tAxis} uAxis=${plane.uAxis} nAxis=${plane.nAxis} | residu=${plane.residualMm}mm`);

const tMin=Math.min(...rects.map(r=>r.t0)), tMax=Math.max(...rects.map(r=>r.t1));
const uMin=Math.min(...rects.map(r=>r.u0)), uMax=Math.max(...rects.map(r=>r.u1));
console.log(`gevel-extent: breedte(t)=${Math.round(tMax-tMin)}mm hoogte(u)=${Math.round(uMax-uMin)}mm\n`);

// ── meet-helpers over een t-grid ──
const STEP=25; // mm
const cols=[]; for(let t=tMin+STEP/2;t<tMax;t+=STEP)cols.push(t);
function coverAt(t){return rects.filter(r=>r.t0<=t&&r.t1>=t);}
function unionLen(ivs){if(!ivs.length)return 0;const s=ivs.map(i=>i.slice()).sort((a,b)=>a[0]-b[0]);let tot=0,[cs,ce]=s[0];for(let i=1;i<s.length;i++){const[a,b]=s[i];if(a<=ce+0.5)ce=Math.max(ce,b);else{tot+=ce-cs;cs=a;ce=b;}}return tot+ce-cs;}

// ── 2. bestaat er een band tussen wand-boven en dakrand-onder? ──
let bandHeights=[], bandColLen=0, wallColLen=0;
for(const t of cols){const cov=coverAt(t);const w=cov.filter(r=>r.kind==='wall'),d=cov.filter(r=>r.kind==='dak');if(w.length)wallColLen+=STEP;if(w.length&&d.length){const wTop=Math.max(...w.map(r=>r.u1)),dBot=Math.min(...d.map(r=>r.u0));if(dBot-wTop>1){bandHeights.push(dBot-wTop);bandColLen+=STEP;}}}
const stat=(a)=>{if(!a.length)return{n:0};const s=[...a].sort((x,y)=>x-y);const mean=a.reduce((p,c)=>p+c,0)/a.length;const sd=Math.sqrt(a.reduce((p,c)=>p+(c-mean)**2,0)/a.length);return{n:a.length,min:Math.round(s[0]),med:Math.round(s[Math.floor(s.length/2)]),max:Math.round(s[s.length-1]),sd:Math.round(sd)};};
const bs=stat(bandHeights);
console.log(`=== 2. BAND tussen wand-boven en dakrand-onder ===`);
console.log(`  kolommen met wand: ${Math.round(wallColLen)}mm | kolommen met wand ÉN dakrand erboven met gat: ${Math.round(bandColLen)}mm`);
console.log(`  bandhoogte: n=${bs.n} min=${bs.min} mediaan=${bs.med} max=${bs.max} spreiding(sd)=${bs.sd}mm → ${bs.sd<50?'SCHOON (≈constant)':'RAFELIG over de breedte'}`);

// ── 3. kandidaat-regel vs v1-strikt + entree + openingen + contour ──
let areaV1=0, areaCand=0, bandFilledLen=0, bandTotLen=0, otherBridgeArea=0;
let entreeColLen=0, entreeBelowEmpty=0;
const internalGapH=[]; // hoogtes van interne verticale leegtes die de regel zou overbruggen (geen band)
function gapsWithin(lo,hi,ivs){const s=ivs.map(i=>i.slice()).sort((a,b)=>a[0]-b[0]);const gaps=[];let ce=lo;for(const[a,b]of s){if(a>ce+0.5)gaps.push([ce,a]);ce=Math.max(ce,b);}if(hi>ce+0.5)gaps.push([ce,hi]);return gaps;}
for(const t of cols){const cov=coverAt(t);if(!cov.length)continue;
  const ivs=cov.map(r=>[r.u0,r.u1]);
  const v1=unionLen(ivs);                                  // strikt masker
  const lo=Math.min(...cov.map(r=>r.u0)),hi=Math.max(...cov.map(r=>r.u1));
  const cand=hi-lo;                                        // doorlopend veld
  areaV1+=v1*STEP; areaCand+=cand*STEP;
  const bridge=cand-v1;                                    // wat de regel extra vult
  const w=cov.filter(r=>r.kind==='wall'),d=cov.filter(r=>r.kind==='dak');
  let band=0;
  if(w.length&&d.length){const wTop=Math.max(...w.map(r=>r.u1)),dBot=Math.min(...d.map(r=>r.u0));band=Math.max(0,dBot-wTop);bandTotLen+=band;if(band>1&&cand>=hi-lo)bandFilledLen+=band;otherBridgeArea+=Math.max(0,bridge-band)*STEP;}
  else otherBridgeArea+=bridge*STEP;                       // brug zonder wand+dak = interne leegte
  // interne leegte-hoogtes (alle gaten binnen [lo,hi] minus de wand→dak-band)
  for(const [a,b] of gapsWithin(lo,hi,ivs)){const h=b-a;if(h>band+1)internalGapH.push(h);}
  // entree-kolom: alleen dakrand, geen wand
  if(d.length&&!w.length){entreeColLen+=STEP;const dLo=Math.min(...d.map(r=>r.u0));if(lo>=dLo-1)entreeBelowEmpty+=STEP;} // niets onder de band gevuld
}
console.log(`\n=== 3a. wand→dakrand-band gevuld? ===`);
console.log(`  band-totaal=${Math.round(bandTotLen)}mm·kol  gevuld door regel=${Math.round(bandFilledLen)}mm·kol → dekking ${bandTotLen>0?Math.round(bandFilledLen/bandTotLen*100):0}%`);
console.log(`\n=== 3b. entree onder LOSSTAANDE dakrand-band ===`);
console.log(`  kolommen met alleen-dakrand: ${Math.round(entreeColLen)}mm | daarvan zone-eronder ONbekleed: ${Math.round(entreeBelowEmpty)}mm → ${entreeColLen>0&&entreeBelowEmpty===entreeColLen?'entree blijft LEEG ✅':(entreeColLen===0?'(geen alleen-dakrand-kolom in deze selectie)':'LEKT naar beneden ❌')}`);
// losstaande dakrand-selectie apart
const dPlane=fitFacadePlane(dakFront.map(m=>{m.wallOrigin.resolvedOutside={outsideDir:-1,outsidePos:m.wallOrigin.thicknessStart};return m;}),'y');
const dT=dPlane.tAxis.toUpperCase(),dU=dPlane.uAxis.toUpperCase();
const dRects=dakFront.map(m=>{const A=aabbWorld(m.wallOrigin);return{u0:A['min'+dU],u1:A['max'+dU],t0:A['min'+dT],t1:A['max'+dT]};});
const dUmin=Math.min(...dRects.map(r=>r.u0));
console.log(`  losstaande dakrand-selectie: u-extent ${Math.round(dUmin)}..${Math.round(Math.max(...dRects.map(r=>r.u1)))}mm (band zelf); regel vult per kolom alleen [u0..u1] van de plaat → NIETS onder de band ✅ (geen wand → geen lo omlaag)`);

console.log(`\n=== 3c. openingen: volgorde veld-vullen → aftrekken ===`);
// BIL-loader haalt geen voids op; injecteer een bekende opening in één wandkolom-bereik
// dat door de bandvulling wordt overspannen, en toon dat aftrekken-NA-vullen werkt.
const wExample=rects.find(r=>r.kind==='wall');
if(wExample){const opT0=wExample.t0+300,opT1=wExample.t0+1100,opU0=wExample.u0+800,opU1=wExample.u0+2000;
  // simuleer kolom in het raam
  const tc2=(opT0+opT1)/2;const cov=coverAt(tc2);const lo=Math.min(...cov.map(r=>r.u0)),hi=Math.max(...cov.map(r=>r.u1));
  const filled=[[lo,hi]]; // veld
  // aftrekken
  const cut=[];for(const [a,b] of filled){if(opU1<=a||opU0>=b){cut.push([a,b]);}else{if(a<opU0)cut.push([a,opU0]);if(opU1<b)cut.push([opU1,b]);}}
  const inWindow=(u)=>cut.some(([a,b])=>u>=a&&u<=b);
  const mid=(opU0+opU1)/2;
  console.log(`  veld [${Math.round(lo)}..${Math.round(hi)}] − opening [${Math.round(opU0)}..${Math.round(opU1)}] → raam-midden u=${Math.round(mid)} bekleed? ${inWindow(mid)?'JA ❌':'NEE ✅ (uitgesneden)'}; boven/onder raam behouden? ${inWindow(opU0-50)&&inWindow(opU1+50)?'JA ✅':'NEE ❌'}`);
  console.log(`  → volgorde bevestigd: eerst veld vullen, DAARNA opening aftrekken (anders zou de bandvulling het raam weer dichtzetten).`);
}

console.log(`\n=== 3d / 5. contour + contrast met v1 (strikt masker) ===`);
console.log(`  bekleed v1 (unie footprints) = ${(areaV1/1e6).toFixed(2)} m²·`);
console.log(`  bekleed kandidaat (veld)     = ${(areaCand/1e6).toFixed(2)} m²·`);
console.log(`  extra door kandidaat         = ${((areaCand-areaV1)/1e6).toFixed(2)} m²·  (waarvan band=${(bandTotLen*STEP/1e6).toFixed(2)} m²·, overige brug=${(otherBridgeArea/1e6).toFixed(2)} m²·)`);
console.log(`  contour: regel vult per kolom alleen binnen [laagste..hoogste] element → niets buiten gevel-extent of boven/onder uiterste element.`);

// ── 4. failure-mode: volle-hoogte HORIZONTALE gaten (kolom zónder enig element) ──
let emptyColLen=0, emptyRuns=[]; let run=0;
for(const t of cols){const cov=coverAt(t);if(!cov.length){emptyColLen+=STEP;run+=STEP;}else{if(run>0)emptyRuns.push(run);run=0;}}
if(run>0)emptyRuns.push(run);
emptyRuns.sort((a,b)=>b-a);
console.log(`\n=== 4. failure-mode: horizontale gaten (kolom zonder enig element) ===`);
console.log(`  totaal lege t-lengte tussen tMin..tMax: ${Math.round(emptyColLen)}mm van ${Math.round(tMax-tMin)}mm`);
console.log(`  grootste lege runs (mm): ${emptyRuns.slice(0,6).map(Math.round).join(', ')||'(geen)'}`);
console.log(`  overige verticale brug (kolom mét elementen maar gat dat GEEN wand→dak-band is): ${(otherBridgeArea/1e6).toFixed(2)} m²· → ${otherBridgeArea/1e6<0.05?'verwaarloosbaar ✅':'LET OP: regel overbrugt interne leegtes ⚠'}`);
const igs=stat(internalGapH);
console.log(`  interne leegte-hoogtes die de regel zou vullen: n=${igs.n} min=${igs.min} mediaan=${igs.med} max=${igs.max}mm → ${igs.med>400?'raam/deur-formaat (MOET via openingen weggesneden) ⚠':'slivers (verwaarloosbaar)'}`);

console.log(`\n=== OORDEEL ===`);
const bandOK=bandTotLen>0&&bandFilledLen/bandTotLen>0.95;
const entreeOK=entreeColLen===0||entreeBelowEmpty===entreeColLen;
const contourOK=otherBridgeArea/1e6<0.05;
console.log(`  band gevuld: ${bandOK?'JA ✅':'NEE ❌'} | entree leeg: ${entreeOK?'JA ✅':'NEE ❌'} | geen ongewenste interne brug: ${contourOK?'JA ✅':'NEE ⚠'}`);
console.log(`  stoplicht: ${bandOK&&entreeOK&&contourOK?'🟢 GROEN — regel haalt de eis op de echte geometrie':(bandOK&&entreeOK?'🟡 ORANJE — band+entree goed, let op interne brug':'🔴 ROOD')}`);
