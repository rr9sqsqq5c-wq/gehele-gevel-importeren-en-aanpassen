// SPIKE validate TASK B — projecteer elke IfcOpeningElement op het wandvlak van
// zijn host → strakke 2D-omtrek + maat (wand-lokaal). Vergelijk met naïeve
// wereld-AABB (= wat B nu doet). Geen A/B-code. Alles meters→mm.
// node projection.mjs <model.ifc> <out.json>
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const A_ROOT = resolve(__dirname, "../../../stap-1-maak-eerst-een-vast-proje-62cf");
const require = createRequire(pathToFileURL(A_ROOT + "/package.json"));
const WebIFC = require(resolve(A_ROOT, "node_modules/web-ifc/web-ifc-api-node.js"));

const [model, out] = process.argv.slice(2);
if (!model || !out) { console.error("usage: node projection.mjs <model.ifc> <out.json>"); process.exit(1); }

const api = new WebIFC.IfcAPI();
await api.Init();
const buf = readFileSync(model);
const mid = api.OpenModel(new Uint8Array(buf), {});
const val = (x) => (x && typeof x === "object" && "value" in x) ? x.value : x;
const typeName = (eid)=>{ try{ const raw=api.GetRawLineData(mid,eid); return api.GetNameFromTypeCode(raw.type);}catch{return "?";} };

// ── geometrie helpers ──────────────────────────────────────────────────────────
function firstMatrix(eid){
  let mesh; try{ mesh=api.GetFlatMesh(mid,eid);}catch{return null;}
  if(!mesh||mesh.geometries.size()===0)return null;
  return mesh.geometries.get(0).flatTransformation;
}
function worldVerts(eid){ // alle wereld-vertices van een element (meters)
  let mesh; try{ mesh=api.GetFlatMesh(mid,eid);}catch{return null;}
  if(!mesh||mesh.geometries.size()===0)return null;
  const pts=[];
  for(let gi=0;gi<mesh.geometries.size();gi++){
    const pl=mesh.geometries.get(gi); let g;
    try{ g=api.GetGeometry(mid,pl.geometryExpressID);
      const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize());
      const m=pl.flatTransformation;
      for(let i=0;i<v.length;i+=6){const lx=v[i],ly=v[i+1],lz=v[i+2];
        pts.push([m[0]*lx+m[4]*ly+m[8]*lz+m[12], m[1]*lx+m[5]*ly+m[9]*lz+m[13], m[2]*lx+m[6]*ly+m[10]*lz+m[14]]);}
    } finally { g?.delete(); }
  }
  return pts.length?pts:null;
}
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm=(a)=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];};
const col=(m,c)=>[m[c*4],m[c*4+1],m[c*4+2]];

// model up-as: meerderheid van wand-matrix kolommen die het meest verticaal is
function detectUp(wallIds){
  let sz=0,sy=0,n=0;
  for(const id of wallIds.slice(0,200)){ const m=firstMatrix(id); if(!m)continue;
    for(const c of [0,1,2]){const v=norm(col(m,c)); sz+=Math.abs(v[2]); sy+=Math.abs(v[1]);} n++; }
  return (sz>=sy)?[0,0,1]:[0,1,0];
}

// ── relaties ───────────────────────────────────────────────────────────────────
const fillType={};
{ const rels=api.GetLineIDsWithType(mid,WebIFC.IFCRELFILLSELEMENT);
  for(let i=0;i<rels.size();i++){try{const r=api.GetLine(mid,rels.get(i),false);
    const op=val(r?.RelatingOpeningElement), fil=val(r?.RelatedBuildingElement); if(!op||!fil)continue;
    const tn=typeName(fil).toLowerCase(); fillType[op]= tn.includes("window")?"raam":tn.includes("door")?"deur":"sparing";
  }catch{}} }
const voidPairs=[];
{ const rels=api.GetLineIDsWithType(mid,WebIFC.IFCRELVOIDSELEMENT);
  for(let i=0;i<rels.size();i++){try{const r=api.GetLine(mid,rels.get(i),false);
    const host=val(r?.RelatingBuildingElement), op=val(r?.RelatedOpeningElement); if(!host||!op)continue;
    voidPairs.push({host,op});
  }catch{}} }

// wand-ids voor up-detectie
const wallIds=[]; for(const t of [WebIFC.IFCWALLSTANDARDCASE,WebIFC.IFCWALL]){const v=api.GetLineIDsWithType(mid,t);for(let i=0;i<v.size();i++)wallIds.push(v.get(i));}
const UP=detectUp(wallIds);

// host-frame cache: per host expressID een {O,L,H,T, wallMinL,wallMinH,wallW,wallH,rotDeg}
const frameCache=new Map();
function hostFrame(host){
  if(frameCache.has(host))return frameCache.get(host);
  const m=firstMatrix(host); const wv=worldVerts(host);
  let fr=null;
  if(m&&wv){
    // ROBUUSTE frame-keuze:
    //  H = altijd echte verticaal (model up) — niet een lokale wand-as raden.
    //  L = de horizontale lokale wand-as met de GROOTSTE extent (volgt rotatie in plattegrond).
    //  T = de andere horizontale lokale as (dikte).
    const axes=[norm(col(m,0)),norm(col(m,1)),norm(col(m,2))];
    const O=[m[12],m[13],m[14]];
    const H=norm(UP);
    // de twee lokale assen die het MINST verticaal zijn = horizontaal
    const vert=axes.map(a=>Math.abs(dot(a,H)));
    const order=[0,1,2].sort((a,b)=>vert[a]-vert[b]); // oplopend verticaal
    const h0=order[0], h1=order[1]; // twee meest-horizontale assen
    const ext=(ax)=>{let mn=Infinity,mx=-Infinity;for(const p of wv){const d=dot(sub(p,O),ax);if(d<mn)mn=d;if(d>mx)mx=d;}return mx-mn;};
    const e0=ext(axes[h0]), e1=ext(axes[h1]);
    let L = e0>=e1?axes[h0]:axes[h1];
    let T = e0>=e1?axes[h1]:axes[h0];
    // maak L exact horizontaal (verwijder up-component) en T loodrecht erop
    L=norm([L[0]-H[0]*dot(L,H), L[1]-H[1]*dot(L,H), L[2]-H[2]*dot(L,H)]);
    T=[H[1]*L[2]-H[2]*L[1], H[2]*L[0]-H[0]*L[2], H[0]*L[1]-H[1]*L[0]]; // T = H × L
    // wand-bounds langs L,H
    let lmn=Infinity,lmx=-Infinity,hmn=Infinity,hmx=-Infinity;
    for(const p of wv){const dl=dot(sub(p,O),L),dh=dot(sub(p,O),H); if(dl<lmn)lmn=dl;if(dl>lmx)lmx=dl;if(dh<hmn)hmn=dh;if(dh>hmx)hmx=dh;}
    // in-plan rotatie van L t.o.v. wereld-X (0..90 graden) — hoe schuin de wand in plattegrond staat
    const upZ=UP[2]===1;
    const ang = upZ ? Math.atan2(L[1], L[0]) : Math.atan2(L[2], L[0]);
    let rotDeg = Math.abs(Math.round(ang*180/Math.PI)) % 90; if(rotDeg>45) rotDeg=90-rotDeg;
    fr={O,L,H,T, wallMinL:lmn, wallMinH:hmn, wallW:(lmx-lmn), wallH:(hmx-hmn), rotDeg};
  }
  frameCache.set(host,fr); return fr;
}

// convex hull (monotone chain) op 2D punten [u,v]
function hull(pts){
  const P=[...pts].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  if(P.length<3)return P;
  const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  const lo=[]; for(const p of P){while(lo.length>=2&&cross(lo[lo.length-2],lo[lo.length-1],p)<=0)lo.pop();lo.push(p);}
  const up=[]; for(let i=P.length-1;i>=0;i--){const p=P[i];while(up.length>=2&&cross(up[up.length-2],up[up.length-1],p)<=0)up.pop();up.push(p);}
  lo.pop();up.pop(); return lo.concat(up);
}
function polyArea(poly){let a=0;for(let i=0;i<poly.length;i++){const j=(i+1)%poly.length;a+=poly[i][0]*poly[j][1]-poly[j][0]*poly[i][1];}return Math.abs(a)/2;}

const openings=[];
let slabVoids=0, wallVoids=0, noGeom=0, noFrame=0;
const M=1000; // m → mm
for(const {host,op} of voidPairs){
  const ht=typeName(host);
  const isSlab=/IFCSLAB/i.test(ht);
  if(isSlab)slabVoids++; else if(/IFCWALL/i.test(ht))wallVoids++;
  const fr=hostFrame(host); if(!fr){noFrame++; continue;}
  const ov=worldVerts(op); if(!ov){noGeom++; continue;}
  // projectie op (L,H)
  const uv=ov.map(p=>[dot(sub(p,fr.O),fr.L), dot(sub(p,fr.O),fr.H)]);
  let umn=Infinity,umx=-Infinity,vmn=Infinity,vmx=-Infinity, tmn=Infinity,tmx=-Infinity;
  for(let k=0;k<ov.length;k++){const u=uv[k][0],v=uv[k][1]; if(u<umn)umn=u;if(u>umx)umx=u;if(v<vmn)vmn=v;if(v>vmx)vmx=v;
    const t=dot(sub(ov[k],fr.O),fr.T); if(t<tmn)tmn=t;if(t>tmx)tmx=t;}
  const projW=Math.round((umx-umn)*M), projH=Math.round((vmx-vmn)*M), projThk=Math.round((tmx-tmn)*M);
  const x=Math.round((umn-fr.wallMinL)*M), y=Math.round((vmn-fr.wallMinH)*M);
  // omtrek (wand-lokaal mm)
  const poly=hull(uv).map(([u,v])=>[Math.round((u-fr.wallMinL)*M),Math.round((v-fr.wallMinH)*M)]);
  const projFootprintM2 = polyArea(uv); // m² in vlak

  // naïeve wereld-AABB (zoals B): dims langs wereld-assen
  let Xmn=Infinity,Xmx=-Infinity,Ymn=Infinity,Ymx=-Infinity,Zmn=Infinity,Zmx=-Infinity;
  for(const p of ov){if(p[0]<Xmn)Xmn=p[0];if(p[0]>Xmx)Xmx=p[0];if(p[1]<Ymn)Ymn=p[1];if(p[1]>Ymx)Ymx=p[1];if(p[2]<Zmn)Zmn=p[2];if(p[2]>Zmx)Zmx=p[2];}
  const dx=(Xmx-Xmn),dy=(Ymx-Ymn),dz=(Zmx-Zmn);
  const upZ=UP[2]===1;
  const aabbH=Math.round((upZ?dz:dy)*M);
  const horiz=upZ?[dx,dy]:[dx,dz];
  const aabbW=Math.round(Math.max(...horiz)*M);
  const aabbFootprintM2 = (upZ?Math.max(dx,dy):Math.max(dx,dz)) * /*plan breedte*/ (upZ?Math.min(dx,dy):Math.min(dx,dz)); // grondvlak in plan
  // appels-met-appels: vlak-footprint van AABB = breedte×hoogte in wereld vs projectie breedte×hoogte
  const aabbPlaneArea=(aabbW/1000)*(aabbH/1000);
  const projPlaneArea=(projW/1000)*(projH/1000);

  openings.push({op, host, hostType:ht, isSlab, type:fillType[op]??"sparing",
    proj:{ x, y, wMm:projW, hMm:projH, thkMm:projThk, poly, footprintM2:+projFootprintM2.toFixed(3) },
    aabb:{ wMm:aabbW, hMm:aabbH },
    wallRotDeg:fr.rotDeg, wallWmm:Math.round(fr.wallW*M), wallHmm:Math.round(fr.wallH*M),
    oversizeW: aabbW>0?+(aabbW/Math.max(1,projW)).toFixed(3):null,
    oversizeArea: projPlaneArea>0?+(aabbPlaneArea/projPlaneArea).toFixed(3):null,
    fitsInWall: (projW<=fr.wallW*M*1.15+5)&&(projH<=fr.wallH*M*1.15+5),
  });
}

// stats
const wallOps=openings.filter(o=>!o.isSlab);
const clean=wallOps.filter(o=>o.proj.wMm>50&&o.proj.hMm>50&&o.fitsInWall);
const oversizeRatios=wallOps.filter(o=>o.oversizeArea!=null).map(o=>o.oversizeArea).sort((a,b)=>a-b);
const rotated=wallOps.filter(o=>o.wallRotDeg>=5&&o.wallRotDeg<=85);
const rotatedOversize = rotated.filter(o=>o.oversizeArea!=null).map(o=>o.oversizeArea).sort((a,b)=>a-b);
const med=a=>a.length?a[Math.floor(a.length/2)]:null;
const summary={ model:basename(model), upAxis:UP[2]===1?"Z":"Y",
  voidPairs:voidPairs.length, wallVoids, slabVoids, noGeom, noFrame,
  wallOpenings:wallOps.length, cleanProjection:clean.length, cleanPct: wallOps.length?Math.round(clean.length/wallOps.length*100):null,
  aabbOversizeAreaMedian: med(oversizeRatios), aabbOversizeAreaMax: oversizeRatios[oversizeRatios.length-1]??null,
  rotatedWalls_openings: rotated.length, rotatedWalls_oversizeMedian: med(rotatedOversize),
};
writeFileSync(out, JSON.stringify({...summary, openings}, null, 2));
api.CloseModel(mid);
console.log(`[projection] ${summary.model} up=${summary.upAxis} pairs=${voidPairs.length} wall=${wallVoids} slab=${slabVoids} | clean=${clean.length}/${wallOps.length} (${summary.cleanPct}%) | AABB oversize area med=${summary.aabbOversizeAreaMedian} max=${summary.aabbOversizeAreaMax} | rotated openings=${rotated.length} rotOversizeMed=${summary.rotatedWalls_oversizeMedian} | noGeom=${noGeom}`);
