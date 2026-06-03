// SPIKE STAP 1-4 — ligt de dakrand-VOORzijde in lijn met de wand eronder?
// Co-registratie is geldig (zie coreg.mjs): beide geometrieën in dezelfde lokale
// modelruimte, beide Y-up. READ-ONLY. node coplanar-meet.mjs
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const A = resolve(__dirname, "../../../stap-1-maak-eerst-een-vast-proje-62cf");
const W = createRequire(pathToFileURL(A + "/package.json"))(resolve(A, "node_modules/web-ifc/web-ifc-api-node.js"));
const api = new W.IfcAPI(); await api.Init();
const tc=(n)=>{try{return api.GetTypeCodeFromName(n);}catch{return undefined;}};
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],scl=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=(a)=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];};
function smallestEig(C){let a=C.map(r=>r.slice());let v=[[1,0,0],[0,1,0],[0,0,1]];
  for(let it=0;it<60;it++){let p=0,q=1,mx=Math.abs(a[0][1]);if(Math.abs(a[0][2])>mx){mx=Math.abs(a[0][2]);p=0;q=2;}if(Math.abs(a[1][2])>mx){mx=Math.abs(a[1][2]);p=1;q=2;}if(mx<1e-12)break;
    const phi=0.5*Math.atan2(2*a[p][q],a[q][q]-a[p][p]),c=Math.cos(phi),s=Math.sin(phi);
    for(let k=0;k<3;k++){const kp=a[k][p],kq=a[k][q];a[k][p]=c*kp-s*kq;a[k][q]=s*kp+c*kq;}
    for(let k=0;k<3;k++){const pk=a[p][k],qk=a[q][k];a[p][k]=c*pk-s*qk;a[q][k]=s*pk+c*qk;}
    for(let k=0;k<3;k++){const vp=v[k][p],vq=v[k][q];v[k][p]=c*vp-s*vq;v[k][q]=s*vp+c*vq;}}
  const ev=[a[0][0],a[1][1],a[2][2]];let mi=0;for(let i=1;i<3;i++)if(ev[i]<ev[mi])mi=i;return [v[0][mi],v[1][mi],v[2][mi]];}
function cov(pts,c){const C=[[0,0,0],[0,0,0],[0,0,0]];for(const p of pts){const d=sub(p,c);for(let i=0;i<3;i++)for(let j=0;j<3;j++)C[i][j]+=d[i]*d[j];}const n=pts.length||1;for(let i=0;i<3;i++)for(let j=0;j<3;j++)C[i][j]/=n;return C;}
function centroid(pts){return scl(pts.reduce(add,[0,0,0]),1/pts.length);}

function collect(mid, typeNames){
  const out=[];
  for(const tn of typeNames){const code=tc(tn);if(code===undefined)continue;const v=api.GetLineIDsWithType(mid,code);
    for(let i=0;i<v.size();i++){const eid=v.get(i);let mesh;try{mesh=api.GetFlatMesh(mid,eid);}catch{continue;}if(!mesh||!mesh.geometries.size())continue;
      const verts=[];for(let gi=0;gi<mesh.geometries.size();gi++){const pl=mesh.geometries.get(gi);let g;try{g=api.GetGeometry(mid,pl.geometryExpressID);const vv=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize());const m=pl.flatTransformation;const st=Math.max(6,Math.floor((vv.length/6)/120)*6);
        for(let k=0;k<vv.length;k+=st){const lx=vv[k],ly=vv[k+1],lz=vv[k+2];verts.push([m[0]*lx+m[4]*ly+m[8]*lz+m[12],m[1]*lx+m[5]*ly+m[9]*lz+m[13],m[2]*lx+m[6]*ly+m[10]*lz+m[14]]);}}finally{g?.delete();}}
      if(verts.length<4)continue;const c=centroid(verts);out.push({eid,verts,c,n:norm(smallestEig(cov(verts,c)))});}}
  return out;
}

const up=[0,1,0];
const midW=api.OpenModel(new Uint8Array(readFileSync("C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/BIL-MOO-A-ZZ-PBP.ifc")),{});
// typeMap (NL-SfB in typenaam) → filter op buitenwanden (21.x)
const val2=(x)=>(x&&typeof x==='object'&&'value'in x)?x.value:x;
const typeMap={};{const v=api.GetLineIDsWithType(midW,tc('IFCRELDEFINESBYTYPE'));for(let i=0;i<v.size();i++){try{const r=api.GetLine(midW,v.get(i),false);const tRef=val2(r?.RelatingType);if(!tRef)continue;const t=api.GetLine(midW,tRef,false);const tn=val2(t?.Name);const rel=r?.RelatedObjects;if(!rel||!tn)continue;for(const ro of rel){const id=val2(ro);if(id)typeMap[id]=tn;}}catch{}}}
const wallsAll=collect(midW,['IFCWALLSTANDARDCASE','IFCWALL']);
for(const w of wallsAll) w.type=typeMap[w.eid]||'';
const walls=wallsAll.filter(w=>/(^|:)\s*21[\.\s]/.test(w.type)); // NL-SfB 21 = buitenwand
console.log(`buitenwanden (NL-SfB 21.x): ${walls.length} van ${wallsAll.length} wanden`);
const midD=api.OpenModel(new Uint8Array(readFileSync("C:/Users/MurkAnneKooistraKooi/Downloads/BIL-VIA-L-ZZ-PBP_dakranden.IFC.ifc")),{});
const plates=collect(midD,['IFCPLATE']);
console.log(`wanden=${walls.length}  dakrand-platen=${plates.length}`);

const bC=centroid([...walls,...plates].map(e=>e.c));
function outward(e){let n=norm([e.n[0]-up[0]*dot(e.n,up),e.n[1]-up[1]*dot(e.n,up),e.n[2]-up[2]*dot(e.n,up)]);if(dot(sub(e.c,bC),n)<0)n=scl(n,-1);return n;}
for(const e of [...walls,...plates]){e.o=outward(e);e.ang=Math.atan2(e.o[2],e.o[0])*180/Math.PI;e.vert=Math.abs(dot(e.n,up))<0.5;}

// cluster wanden op richting → kies grootste zijde
function cluster(list,tol=20){const cl=[];for(const e of list){let best=null,bd=tol;for(const c of cl){const d=Math.abs(((e.ang-c.ang+540)%360)-180);if(d<bd){bd=d;best=c;}}if(best){best.items.push(e);best.ang+=(((e.ang-best.ang+540)%360)-180)/best.items.length;}else cl.push({ang:e.ang,items:[e]});}return cl.sort((a,b)=>b.items.length-a.items.length);}
const wallVert=walls.filter(w=>w.vert);
const wClusters=cluster(wallVert);
console.log(`\nwand-zijden (richting): ${wClusters.slice(0,6).map(c=>`${c.ang.toFixed(0)}°:${c.items.length}`).join('  ')}`);
const side=wClusters[0];
// sub-cluster de zijde op OFFSET → isoleer ÉÉN facade-vlak (gebouw heeft vleugels)
const provN=norm(side.items.map(w=>w.o).reduce(add,[0,0,0]));
const offH=new Map();for(const w of side.items){const k=Math.round(dot(w.c,provN)/0.5);offH.set(k,(offH.get(k)||[]));offH.get(k).push(w);}
let bestOff=null,bestN=0;for(const [k,arr] of offH)if(arr.length>bestN){bestN=arr.length;bestOff=k;}
const facadeWalls=side.items.filter(w=>Math.abs(dot(w.c,provN)-bestOff*0.5)<1.0); // ±1m rond dominante offset
const side2={ang:side.ang, items:facadeWalls};
console.log(`  offset-niveaus in deze richting: ${offH.size} → dominante facade-vlak: ${facadeWalls.length} buitenwanden`);
const sideVerts=facadeWalls.flatMap(w=>w.verts);
let nW=norm(smallestEig(cov(sideVerts,centroid(sideVerts))));nW=norm([nW[0]-up[0]*dot(nW,up),nW[1]-up[1]*dot(nW,up),nW[2]-up[2]*dot(nW,up)]);if(dot(nW,facadeWalls[0].o)<0)nW=scl(nW,-1);
const t=norm(cross(up,nW));
const dAll=sideVerts.map(v=>dot(v,nW));
const wallOuterD=Math.max(...dAll), wallInnerD=Math.min(...dAll);
const tW=sideVerts.map(v=>dot(v,t)); const tWmin=Math.min(...tW),tWmax=Math.max(...tW);
console.log(`\n=== Gekozen gevelzijde (grootste wand-cluster, ${side.items.length} wanden, richting ${side.ang.toFixed(0)}°) ===`);
console.log(`  wand-normaal nW=[${nW.map(x=>x.toFixed(3))}]  buitenvlak op d=${(wallOuterD).toFixed(3)} m (dikte ${(Math.round((wallOuterD-wallInnerD)*1000))} mm)`);
console.log(`  gevel-lengte t∈[${tWmin.toFixed(1)}..${tWmax.toFixed(1)}] m (${Math.round((tWmax-tWmin)*1000)} mm)`);

// dakrand-platen van deze zijde: normaal ≈ nW én t-overlap met de wand
const FRONT_W=30; // mm band voor "voorzijde" verzamelen
function frontFace(e,n){const ds=e.verts.map(v=>dot(v,n));const mx=Math.max(...ds);return e.verts.filter((v,i)=>ds[i]>mx-FRONT_W/1000);}
const sideDak=plates.filter(p=>p.vert && Math.abs(((p.ang-side.ang+540)%360)-180)<20 && (()=>{const tt=dot(p.c,t);return tt>tWmin-0.5&&tt<tWmax+0.5;})());
console.log(`\n=== Dakrand-platen van deze zijde (normaal≈wand & t-overlap): ${sideDak.length} ===`);
// front-offset per plaat (max dot langs nW) → histogram om de buitenste laag te vinden
const fronts=sideDak.map(p=>({p, f:Math.max(...p.verts.map(v=>dot(v,nW)))}));
const hist=new Map();for(const x of fronts){const k=Math.round((x.f-wallOuterD)*1000/100);hist.set(k,(hist.get(k)||0)+1);}
const layers=[...hist.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,c])=>`${k*100}mm:${c}`);
console.log(`  voor-offset t.o.v. wand-buitenvlak (100mm-bins, mm:aantal): ${layers.join('  ')}`);
// buitenste laag = platen met front binnen [wandbuiten-100mm , wandbuiten+300mm]
const frontLayer=fronts.filter(x=>x.f>=wallOuterD-0.10 && x.f<=wallOuterD+0.30);
console.log(`  voorste dakrand-laag (front nabij wandvlak): ${frontLayer.length} platen`);

// STAP 3: residu van de dakrand-VOORzijde t.o.v. het wand-buitenvlak
let sr=0,mr=0,cnt=0; const tIv=[];
for(const x of frontLayer){const pts=frontFace(x.p,nW);for(const v of pts){const r=Math.abs(dot(v,nW)-wallOuterD);sr+=r;cnt++;if(r>mr)mr=r;}
  const tt=x.p.verts.map(v=>dot(v,t));tIv.push([Math.round(Math.min(...tt)*1000),Math.round(Math.max(...tt)*1000)]);}
tIv.sort((a,b)=>a[0]-b[0]);let cs=tIv[0]?.[0]??0,ce=tIv[0]?.[1]??0,cov2=0,gp=0;for(let i=1;i<tIv.length;i++){if(tIv[i][0]>ce+1){gp++;cov2+=ce-cs;cs=tIv[i][0];ce=tIv[i][1];}else ce=Math.max(ce,tIv[i][1]);}cov2+=ce-cs;
console.log(`\n=== STAP 3 — coplanariteit dakrand-VOORzijde ↔ wand-buitenvlak ===`);
console.log(`  loodrechte afstand voorzijde→wandvlak: gem=${Math.round(sr/Math.max(1,cnt)*1000)} mm, max=${Math.round(mr*1000)} mm`);
console.log(`  lengte-dekking dakrand-voorzijde: ${Math.round(cov2)} mm van ${Math.round((tWmax-tWmin)*1000)} mm wand`);
// gecombineerde best-fit (wand-buitenvlak-pts + dakrand-voor-pts)
const wallFrontPts=sideVerts.filter(v=>dot(v,nW)>wallOuterD-FRONT_W/1000);
const comboPts=[...wallFrontPts, ...frontLayer.flatMap(x=>frontFace(x.p,nW))];
const cc=centroid(comboPts);let cn=norm(smallestEig(cov(comboPts,cc)));
let csr=0,cmr=0;for(const v of comboPts){const r=Math.abs(dot(sub(v,cc),cn));csr+=r;if(r>cmr)cmr=r;}
console.log(`  gecombineerde best-fit (wand-buiten + dakrand-voor): residu gem=${Math.round(csr/comboPts.length*1000)} mm, max=${Math.round(cmr*1000)} mm`);
const meanDist = sr/Math.max(1,cnt)*1000;
const verdict = cnt===0 ? 'ONBEPAALD (geen voorste dakrand-laag bij dit wandvlak)'
  : meanDist<=30 ? 'GROEN' : meanDist<=80 ? 'ORANJE' : 'ROOD';
console.log(`  → in lijn? ${verdict}`);

// STAP 4 — losstaande dakrand: dakrand-VLAKKEN (normaal+offset) zonder buitenwand op datzelfde vlak
console.log(`\n=== STAP 4 — losstaande dakrand (eigen vlak, geen buitenwand coplanair) ===`);
let standalone=[], withWall=0;
for(const dc of cluster(plates.filter(p=>p.vert))){
  const nG=norm(dc.items.map(p=>p.o).reduce(add,[0,0,0]));            // richting van deze dakrand-cluster
  const offH2=new Map();for(const p of dc.items){const k=Math.round(dot(p.c,nG)/0.5);(offH2.get(k)||offH2.set(k,[]).get(k)).push(p);}
  for(const [k,arr] of offH2){ if(arr.length<3) continue;             // één dakrand-VLAK (richting+offset)
    const dDak=k*0.5; const tG=norm(cross(up,nG));
    const tMin=Math.min(...arr.flatMap(p=>p.verts.map(v=>dot(v,tG)))), tMax=Math.max(...arr.flatMap(p=>p.verts.map(v=>dot(v,tG))));
    // is er een buitenwand op ~zelfde richting, ~zelfde offset, met t-overlap?
    const wallHere = walls.some(w=>Math.abs(((Math.atan2(w.o[2],w.o[0])*180/Math.PI - Math.atan2(nG[2],nG[0])*180/Math.PI +540)%360)-180)<20
      && Math.abs(dot(w.c,nG)-dDak)<0.6
      && (()=>{const wt=w.verts.map(v=>dot(v,tG));return Math.max(...wt)>tMin-0.5 && Math.min(...wt)<tMax+0.5;})());
    if(wallHere) withWall++; else standalone.push({ang:Math.round(Math.atan2(nG[2],nG[0])*180/Math.PI), offset_m:+dDak.toFixed(1), plates:arr.length, len_mm:Math.round((tMax-tMin)*1000)});
  }
}
console.log(`  dakrand-vlakken MET buitenwand eronder (versmelten tot één gevel): ${withWall}`);
console.log(`  dakrand-vlakken ZONDER wand (eigen groep/vlak): ${standalone.length}`);
for(const s of standalone.slice(0,8)) console.log(`    eigen vlak: richting ${s.ang}°, offset ${s.offset_m} m, ${s.plates} platen, lengte ${s.len_mm} mm`);

writeFileSync(resolve(__dirname,'out/coplanar-meet.json'), JSON.stringify({
  coreg:'geldig (zelfde lokale modelruimte, beide Y-up)',
  side:{angle:Math.round(side.ang),walls:side.items.length,nW:nW.map(x=>+x.toFixed(3)),wallOuterD_m:+wallOuterD.toFixed(3),length_mm:Math.round((tWmax-tWmin)*1000)},
  dakrandFront:{candidates:sideDak.length, frontLayer:frontLayer.length, meanDist_mm:Math.round(sr/Math.max(1,cnt)*1000), maxDist_mm:Math.round(mr*1000), coverage_mm:Math.round(cov2)},
  combinedBestFit:{meanRes_mm:Math.round(csr/comboPts.length*1000), maxRes_mm:Math.round(cmr*1000)},
  verdict, standalone
},null,2));
console.log(`\n→ dump: spike/validate/out/coplanar-meet.json`);
api.CloseModel(midW);api.CloseModel(midD);
