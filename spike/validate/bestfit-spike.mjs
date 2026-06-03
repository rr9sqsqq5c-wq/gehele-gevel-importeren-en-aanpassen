// SPIKE (read-only/wegwerp) — bewijs: best-fit gevelvlak + projectie voor losse
// elementen. Testset: de dakrand-platen (het geval dat nu faalt: axisWalls dropt ~224/400).
// Geen src-wijziging. node bestfit-spike.mjs
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const A = resolve(__dirname, "../../../stap-1-maak-eerst-een-vast-proje-62cf");
const W = createRequire(pathToFileURL(A + "/package.json"))(resolve(A, "node_modules/web-ifc/web-ifc-api-node.js"));
const F = "C:/Users/MurkAnneKooistraKooi/Downloads/BIL-VIA-L-ZZ-PBP_dakranden.IFC.ifc";
const api = new W.IfcAPI(); await api.Init();
const mid = api.OpenModel(new Uint8Array(readFileSync(F)), {});

// ── vec helpers ──
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]], add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2], scl=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=(a)=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];};

// ── Jacobi eigen voor symmetrische 3x3 → eigenvector bij kleinste eigenwaarde ──
function smallestEigenvector(C){
  let a=[[C[0][0],C[0][1],C[0][2]],[C[1][0],C[1][1],C[1][2]],[C[2][0],C[2][1],C[2][2]]];
  let v=[[1,0,0],[0,1,0],[0,0,1]];
  for(let it=0;it<50;it++){
    // grootste off-diagonaal
    let p=0,q=1,mx=Math.abs(a[0][1]);
    if(Math.abs(a[0][2])>mx){mx=Math.abs(a[0][2]);p=0;q=2;}
    if(Math.abs(a[1][2])>mx){mx=Math.abs(a[1][2]);p=1;q=2;}
    if(mx<1e-12)break;
    const app=a[p][p],aqq=a[q][q],apq=a[p][q];
    const phi=0.5*Math.atan2(2*apq,aqq-app),c=Math.cos(phi),s=Math.sin(phi);
    for(let k=0;k<3;k++){const akp=a[k][p],akq=a[k][q];a[k][p]=c*akp-s*akq;a[k][q]=s*akp+c*akq;}
    for(let k=0;k<3;k++){const apk=a[p][k],aqk=a[q][k];a[p][k]=c*apk-s*aqk;a[q][k]=s*apk+c*aqk;}
    for(let k=0;k<3;k++){const vkp=v[k][p],vkq=v[k][q];v[k][p]=c*vkp-s*vkq;v[k][q]=s*vkp+c*vkq;}
  }
  const ev=[a[0][0],a[1][1],a[2][2]]; let mi=0; for(let i=1;i<3;i++)if(ev[i]<ev[mi])mi=i;
  return {n:[v[0][mi],v[1][mi],v[2][mi]], eigs:ev.slice().sort((x,y)=>x-y)};
}
function covariance(pts, c){ const C=[[0,0,0],[0,0,0],[0,0,0]];
  for(const p of pts){const d=sub(p,c);for(let i=0;i<3;i++)for(let j=0;j<3;j++)C[i][j]+=d[i]*d[j];}
  const n=pts.length||1;for(let i=0;i<3;i++)for(let j=0;j<3;j++)C[i][j]/=n;return C; }

// ── element-geometrie: world-verts + world-normalen ──
function elemGeom(eid){
  let mesh;try{mesh=api.GetFlatMesh(mid,eid);}catch{return null;}
  if(!mesh||!mesh.geometries.size())return null;
  const verts=[],nrmAbs=[0,0,0];
  for(let gi=0;gi<mesh.geometries.size();gi++){const pl=mesh.geometries.get(gi);let g;
    try{g=api.GetGeometry(mid,pl.geometryExpressID);const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize());const m=pl.flatTransformation;
      const step=Math.max(1,Math.floor((v.length/6)/300))*6; // ~300 verts/elem
      for(let i=0;i<v.length;i+=step){const lx=v[i],ly=v[i+1],lz=v[i+2],nx=v[i+3],ny=v[i+4],nz=v[i+5];
        verts.push([m[0]*lx+m[4]*ly+m[8]*lz+m[12],m[1]*lx+m[5]*ly+m[9]*lz+m[13],m[2]*lx+m[6]*ly+m[10]*lz+m[14]]);
        const wnx=m[0]*nx+m[4]*ny+m[8]*nz,wny=m[1]*nx+m[5]*ny+m[9]*nz,wnz=m[2]*nx+m[6]*ny+m[10]*nz;
        nrmAbs[0]+=Math.abs(wnx);nrmAbs[1]+=Math.abs(wny);nrmAbs[2]+=Math.abs(wnz);}
    }finally{g?.delete();}}
  if(verts.length<3)return null;
  const c=scl(verts.reduce(add,[0,0,0]),1/verts.length);
  const {n,eigs}=smallestEigenvector(covariance(verts,c));
  return {verts,centroid:c,normal:norm(n),eigs,nrmAbs};
}

// ── verzamel platen ──
const ids=[];{const v=api.GetLineIDsWithType(mid,api.GetTypeCodeFromName('IFCPLATE'));for(let i=0;i<v.size();i++)ids.push(v.get(i));}
const els=[]; let out_ransac=null, out_plane=null;
for(const id of ids){const g=elemGeom(id);if(g)els.push({id,...g});}
console.log(`platen met geometrie: ${els.length} / ${ids.length}`);

// ── up-as: robuust. (web-ifc vertex-normalen blijken ~0 → niet bruikbaar.)
//   Signaal A: PCA-normaal-som per as (kleinste = ⟂ op de meeste gevelvlakken).
//   Signaal B: overall extent per as (dakrand-band = klein in de verticaal).
const pcaAbs=[0,0,0]; for(const e of els)for(let k=0;k<3;k++)pcaAbs[k]+=Math.abs(e.normal[k]);
let gMn=[Infinity,Infinity,Infinity],gMx=[-Infinity,-Infinity,-Infinity];
for(const e of els)for(const v of e.verts)for(let k=0;k<3;k++){if(v[k]<gMn[k])gMn[k]=v[k];if(v[k]>gMx[k])gMx[k]=v[k];}
const ext=[gMx[0]-gMn[0],gMx[1]-gMn[1],gMx[2]-gMn[2]];
const upIdx=ext.indexOf(Math.min(...ext));     // kleinste overall extent = verticaal voor een dak-band
const up=[0,0,0];up[upIdx]=1;
const vAbs=[0,0,0]; for(const e of els)for(let k=0;k<3;k++)vAbs[k]+=e.nrmAbs[k];
console.log(`vertex-normaal-som (web-ifc; blijkt ~0 → onbruikbaar): X=${vAbs[0].toFixed(1)} Y=${vAbs[1].toFixed(1)} Z=${vAbs[2].toFixed(1)}`);
console.log(`PCA-normaal-som per as: X=${pcaAbs[0].toFixed(0)} Y=${pcaAbs[1].toFixed(0)} Z=${pcaAbs[2].toFixed(0)} (kleinste ≈ up als gevels overheersen)`);
console.log(`overall extent (m): X=${ext[0].toFixed(1)} Y=${ext[1].toFixed(1)} Z=${ext[2].toFixed(1)} → up-as='${['x','y','z'][upIdx]}' (kleinste extent = verticaal van de dakrand-band)`);

// ── outward normaal (horizontaal, weg van gebouw-centroid); splits verticaal/plat ──
const bC=scl(els.reduce((s,e)=>add(s,e.centroid),[0,0,0]),1/els.length);
const hIdx = upIdx===1 ? 2 : 1; // tweede horizontale as (naast x) voor de hoek
for(const e of els){
  e.vertCos = Math.abs(dot(e.normal, up));                 // ~1 = platte cap, ~0 = verticale gevelplaat
  let n=norm([e.normal[0]-up[0]*dot(e.normal,up), e.normal[1]-up[1]*dot(e.normal,up), e.normal[2]-up[2]*dot(e.normal,up)]);
  if(dot(sub(e.centroid,bC),n)<0) n=scl(n,-1);
  e.outward=n; e.ang=Math.atan2(n[hIdx], n[0])*180/Math.PI;
}
const facadeEls = els.filter(e=>e.vertCos < 0.5);          // alleen gevel-FACING platen
const capEls    = els.filter(e=>e.vertCos >= 0.5);
console.log(`\nverticale (gevel-facing) platen: ${facadeEls.length} ; horizontale cap-platen: ${capEls.length}`);

// ── cluster op outward-hoek (tol 20°) — gefixte hoek-afstand ──
function clusterByAngle(list,tol=20){
  const cl=[];
  for(const e of list){let best=null,bd=tol;
    for(const c of cl){const d=Math.abs(((e.ang-c.ang+540)%360)-180); if(d<bd){bd=d;best=c;}}
    if(best){best.items.push(e); best.ang=best.ang+((((e.ang-best.ang+540)%360)-180)/best.items.length);}
    else cl.push({ang:e.ang,items:[e]});}
  return cl.sort((a,b)=>b.items.length-a.items.length);
}
const clusters=clusterByAngle(facadeEls);
console.log(`\nnormaal-clusters (co-facing zijden, alleen gevel-facing): ${clusters.length}`);
for(const c of clusters.slice(0,8))console.log(`  hoek≈${c.ang.toFixed(0)}°  → ${c.items.length} platen`);

// ── globale normaal-spreiding ──
let maxAngAll=0;for(let i=0;i<els.length;i++)for(let j=i+1;j<Math.min(els.length,i+50);j++){const d=Math.acos(Math.max(-1,Math.min(1,dot(els[i].outward,els[j].outward))))*180/Math.PI;if(d>maxAngAll)maxAngAll=d;}
console.log(`\nglobale outward-normaal spreiding (sample): max ≈ ${maxAngAll.toFixed(0)}° → ${maxAngAll>45?'WAAIER (meerdere zijden)':'één vlak'}`);

// ── kies grootste cluster, best-fit vlak + projectie ──
const big=clusters[0];
const allV=big.items.flatMap(e=>e.verts);
const pc=scl(allV.reduce(add,[0,0,0]),1/allV.length);
const {n:pcaN,eigs}=smallestEigenvector(covariance(allV,pc));
let n=norm(pcaN); if(dot(n,big.items[0].outward)<0)n=scl(n,-1);
const u=norm(up); const t=norm(cross(u,n)); // gevel-horizontaal
console.log(`\n=== BEST-FIT VLAK voor grootste cluster (${big.items.length} platen, hoek≈${big.ang.toFixed(0)}°) ===`);
console.log(`  vlakpunt (centroid, m): [${pc.map(x=>x.toFixed(2))}]`);
console.log(`  normaal n=[${n.map(x=>x.toFixed(3))}]  up u=[${u.map(x=>x.toFixed(0))}]  horizontaal t=[${t.map(x=>x.toFixed(3))}]`);
console.log(`  PCA eigenwaarden (m²): klein=${eigs[0].toExponential(2)} mid=${eigs[1].toExponential(2)} groot=${eigs[2].toExponential(2)}  (klein≪mid ⇒ plat vlak)`);

// per-lid residu + footprint
let tMin=Infinity,tMax=-Infinity,uMin=Infinity,uMax=-Infinity,maxResAll=0,sumRes=0,cntRes=0;
const perEl=[];
for(const e of big.items){
  let mr=0,sr=0; let etMin=Infinity,etMax=-Infinity,euMin=Infinity,euMax=-Infinity;
  for(const v of e.verts){const d=sub(v,pc);const res=Math.abs(dot(d,n)),tt=dot(d,t),uu=dot(d,u);
    sr+=res;if(res>mr)mr=res;maxResAll=Math.max(maxResAll,res);sumRes+=res;cntRes++;
    if(tt<etMin)etMin=tt;if(tt>etMax)etMax=tt;if(uu<euMin)euMin=uu;if(uu>euMax)euMax=uu;}
  tMin=Math.min(tMin,etMin);tMax=Math.max(tMax,etMax);uMin=Math.min(uMin,euMin);uMax=Math.max(uMax,euMax);
  perEl.push({id:e.id, meanRes_mm:Math.round(sr/e.verts.length*1000), maxRes_mm:Math.round(mr*1000),
    t0_mm:Math.round(etMin*1000), t1_mm:Math.round(etMax*1000), u0_mm:Math.round(euMin*1000), u1_mm:Math.round(euMax*1000)});
}
console.log(`  residu loodrecht op vlak: gemiddeld=${Math.round(sumRes/cntRes*1000)} mm, max=${Math.round(maxResAll*1000)} mm`);
console.log(`  footprint-unie: gevel-lengte t = ${Math.round((tMax-tMin))} m? nee mm:  t∈[${Math.round(tMin*1000)}..${Math.round(tMax*1000)}] mm  (${Math.round((tMax-tMin)*1000)} mm breed), u∈[${Math.round(uMin*1000)}..${Math.round(uMax*1000)}] mm (${Math.round((uMax-uMin)*1000)} mm hoog)`);

// dekking: gaten in t-unie
const ivs=perEl.map(e=>[e.t0_mm,e.t1_mm]).sort((a,b)=>a[0]-b[0]);
let covered=0,cursor=ivs[0][0],gaps=[];let cs=ivs[0][0],ce=ivs[0][1];
for(let i=1;i<ivs.length;i++){if(ivs[i][0]>ce+1){gaps.push([ce,ivs[i][0]]);covered+=ce-cs;cs=ivs[i][0];ce=ivs[i][1];}else ce=Math.max(ce,ivs[i][1]);}
covered+=ce-cs;
console.log(`  dekking langs gevel: ${Math.round(covered)} mm gedekt van ${Math.round(tMax*1000-tMin*1000)} mm ; gaten: ${gaps.length}${gaps.length?' bv. '+gaps.slice(0,3).map(g=>`[${Math.round(g[0])}..${Math.round(g[1])}]`).join(','):''}`);

// ── RANSAC-lite: houd alleen écht coplanaire platen (mean-residu < 150 mm), herfit ──
const TOLP=150;
let keep=big.items.filter((e,i)=>perEl[i].meanRes_mm<TOLP);
let refined={n,pc};
if(keep.length>=3){
  const kv=keep.flatMap(e=>e.verts); const kc=scl(kv.reduce(add,[0,0,0]),1/kv.length);
  let {n:kn}=smallestEigenvector(covariance(kv,kc)); kn=norm(kn); if(dot(kn,n)<0)kn=scl(kn,-1);
  refined={n:kn,pc:kc};
}
{ const {n:rn,pc:rp}=refined; let mr=0,sr=0,cr=0,kt=norm(cross(u,rn)); let ktMin=Infinity,ktMax=-Infinity;
  const ivs2=[];
  for(const e of keep){let etMin=Infinity,etMax=-Infinity,em=0,es=0;
    for(const v of e.verts){const d=sub(v,rp);const res=Math.abs(dot(d,rn));es+=res;if(res>em)em=res;sr+=res;cr++;if(res>mr)mr=res;const tt=dot(d,kt);if(tt<etMin)etMin=tt;if(tt>etMax)etMax=tt;}
    ivs2.push([Math.round(etMin*1000),Math.round(etMax*1000)]); ktMin=Math.min(ktMin,etMin);ktMax=Math.max(ktMax,etMax);}
  ivs2.sort((a,b)=>a[0]-b[0]); let cs2=ivs2[0]?.[0]??0,ce2=ivs2[0]?.[1]??0,cov2=0,gp2=0;
  for(let i=1;i<ivs2.length;i++){if(ivs2[i][0]>ce2+1){gp2++;cov2+=ce2-cs2;cs2=ivs2[i][0];ce2=ivs2[i][1];}else ce2=Math.max(ce2,ivs2[i][1]);}
  cov2+=ce2-cs2;
  console.log(`\n=== RANSAC-lite: coplanaire subset (mean-residu < ${TOLP} mm) ===`);
  console.log(`  coplanaire platen: ${keep.length} van ${big.items.length} in de cluster (${Math.round(keep.length/big.items.length*100)}%)`);
  console.log(`  na herfit: gem. residu=${Math.round(sr/Math.max(1,cr)*1000)} mm, max=${Math.round(mr*1000)} mm`);
  console.log(`  dekking langs gevel: ${Math.round(cov2)} mm van ${Math.round((ktMax-ktMin)*1000)} mm ; gaten: ${gp2}`);
  out_ransac={kept:keep.length, ofCluster:big.items.length, meanRes_mm:Math.round(sr/Math.max(1,cr)*1000), maxRes_mm:Math.round(mr*1000), coverage_mm:Math.round(cov2), span_mm:Math.round((ktMax-ktMin)*1000), gaps:gp2};
}

// ── betere aanpak: sub-cluster op VLAK = normaalrichting ÉN offset d (depth) ──
// (normaal-only clustering voegt parallelle, in diepte verschoven gevels samen.)
{
  const dvals = big.items.map(e=>({e, d: dot(sub(e.centroid,pc), n)}));
  const BIN=300; const hist=new Map();
  for(const x of dvals){const k=Math.round(x.d*1000/BIN); hist.set(k,(hist.get(k)||0)+1);}
  let bestK=0,bestC=0; for(const [k,c] of hist) if(c>bestC){bestC=c;bestK=k;}
  const center=bestK*BIN/1000;
  const plane = dvals.filter(x=>Math.abs(x.d-center)<0.4).map(x=>x.e); // ±400mm rond dominante offset
  const pv=plane.flatMap(e=>e.verts); const ppc=scl(pv.reduce(add,[0,0,0]),1/pv.length);
  let {n:pn}=smallestEigenvector(covariance(pv,ppc)); pn=norm(pn); if(dot(pn,n)<0)pn=scl(pn,-1);
  const pt=norm(cross(u,pn));
  let mr=0,sr=0,cr=0,tmn=Infinity,tmx=-Infinity; const ivs3=[];
  for(const e of plane){let etMin=Infinity,etMax=-Infinity;
    for(const v of e.verts){const dd=sub(v,ppc);const res=Math.abs(dot(dd,pn));sr+=res;cr++;if(res>mr)mr=res;const tt=dot(dd,pt);if(tt<etMin)etMin=tt;if(tt>etMax)etMax=tt;}
    ivs3.push([Math.round(etMin*1000),Math.round(etMax*1000)]);tmn=Math.min(tmn,etMin);tmx=Math.max(tmx,etMax);}
  ivs3.sort((a,b)=>a[0]-b[0]); let cs=ivs3[0]?.[0]??0,ce=ivs3[0]?.[1]??0,cov=0,gp=0;
  for(let i=1;i<ivs3.length;i++){if(ivs3[i][0]>ce+1){gp++;cov+=ce-cs;cs=ivs3[i][0];ce=ivs3[i][1];}else ce=Math.max(ce,ivs3[i][1]);}
  cov+=ce-cs;
  console.log(`\n=== VLAK-CLUSTER (normaal + offset): dominante coplanaire gevel binnen de cluster ===`);
  console.log(`  offset-histogram (300mm-bins): ${hist.size} verschillende diepte-niveaus binnen één normaalrichting`);
  console.log(`  dominante vlak: ${plane.length} van ${big.items.length} platen (offset ±400mm rond ${Math.round(center*1000)}mm)`);
  console.log(`  na fit: gem. residu=${Math.round(sr/Math.max(1,cr)*1000)} mm, max=${Math.round(mr*1000)} mm`);
  console.log(`  dekking langs gevel: ${Math.round(cov)} mm van ${Math.round((tmx-tmn)*1000)} mm ; gaten: ${gp}`);
  out_plane={offsetLevels:hist.size, dominantPlates:plane.length, ofCluster:big.items.length, meanRes_mm:Math.round(sr/Math.max(1,cr)*1000), maxRes_mm:Math.round(mr*1000), coverage_mm:Math.round(cov), span_mm:Math.round((tmx-tmn)*1000), gaps:gp};
}

// ── contrast: axisWalls (lengte-as = langste horizontale globale as) ──
function lengthAxisOf(e){ // bbox langs x/y/z
  let mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];
  for(const v of e.verts)for(let k=0;k<3;k++){if(v[k]<mn[k])mn[k]=v[k];if(v[k]>mx[k])mx[k]=v[k];}
  const d=[mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2]]; d[upIdx]=-1; // horizontaal only
  return d[0]>=d[1]&&d[0]>=d[2]?'x':d[1]>=d[2]?'y':'z';
}
const laAll={}; for(const e of els){const la=lengthAxisOf(e);laAll[la]=(laAll[la]||0)+1;}
const refLa = Object.entries(laAll).sort((a,b)=>b[1]-a[1])[0][0];
const axisKept = els.filter(e=>lengthAxisOf(e)===refLa).length;
const laBig={}; for(const e of big.items){const la=lengthAxisOf(e);laBig[la]=(laBig[la]||0)+1;}
console.log(`\n=== CONTRAST ===`);
console.log(`  axisWalls (huidige engine): lengte-as-verdeling ${JSON.stringify(laAll)}; referentie='${refLa}' → houdt ${axisKept}/${els.length}, dropt ${els.length-axisKept}`);
console.log(`  binnen de grootste co-facing cluster zelf is de lengte-as nog gemengd: ${JSON.stringify(laBig)} → axisWalls zou OOK binnen één gevel splitsen`);
console.log(`  best-fit+projectie: houdt alle ${big.items.length} platen van de cluster vast (ongeacht lengte-as)`);

// dump
const out = {
  model:'BIL-VIA-L-ZZ-PBP_dakranden', plates:els.length, upAxis:['x','y','z'][upIdx],
  pcaNormalSumPerAxis:pcaAbs.map(x=>Math.round(x)), overallExtent_m:ext.map(x=>+x.toFixed(1)), normalSpreadMaxDeg:Math.round(maxAngAll),
  clusters: clusters.map(c=>({angle:Math.round(c.ang),count:c.items.length})),
  bestfit:{ clusterCount:big.items.length, planePoint_m:pc.map(x=>+x.toFixed(3)), normal:n.map(x=>+x.toFixed(3)),
    pcaEigen:eigs.map(x=>+x.toExponential(2)), meanResidual_mm:Math.round(sumRes/cntRes*1000), maxResidual_mm:Math.round(maxResAll*1000),
    footprint_mm:{tWidth:Math.round((tMax-tMin)*1000), uHeight:Math.round((uMax-uMin)*1000)}, coverageGaps:gaps.length },
  contrast:{ axisWalls_lengthAxisDist:laAll, axisWalls_refAxis:refLa, axisWalls_kept:axisKept, axisWalls_dropped:els.length-axisKept,
    cluster_lengthAxisDist:laBig, projection_kept:big.items.length },
  ransacCoplanarSubset: out_ransac,
  planeCluster_normalPlusOffset: out_plane,
  perElement: perEl.slice(0,40),
};
writeFileSync(resolve(__dirname,'out/bestfit-spike.json'), JSON.stringify(out,null,2));
console.log(`\n→ dump: spike/validate/out/bestfit-spike.json`);
api.CloseModel(mid);
