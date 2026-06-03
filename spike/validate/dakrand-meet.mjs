// READ-ONLY meting op het echte dakrand-IFC. Verbatim kopieën van getBBox,
// deriveWallAxes, getFacadePolygon (src/lib/ifc.js) + de nieuwe up-as-logica.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const A = resolve(__dirname, "../../../stap-1-maak-eerst-een-vast-proje-62cf");
const W = createRequire(pathToFileURL(A + "/package.json"))(resolve(A, "node_modules/web-ifc/web-ifc-api-node.js"));
const val = (x) => (x && typeof x === "object" && "value" in x) ? x.value : x;
const F = "C:/Users/MurkAnneKooistraKooi/Downloads/BIL-VIA-L-ZZ-PBP_dakranden.IFC.ifc";
const api = new W.IfcAPI(); await api.Init();
const mid = api.OpenModel(new Uint8Array(readFileSync(F)), {});

// ── verbatim getBBox (ifc.js:414) ──
function getBBox(modelID, expressID) {
  let mesh; try { mesh = api.GetFlatMesh(modelID, expressID); } catch { return null; }
  if (!mesh || mesh.geometries.size() === 0) return null;
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity,ok=false,localXDir=null,localYDir=null;
  for (let gi=0; gi<mesh.geometries.size(); gi++){ const placed=mesh.geometries.get(gi); let geom;
    try{ geom=api.GetGeometry(modelID,placed.geometryExpressID); const verts=api.GetVertexArray(geom.GetVertexData(),geom.GetVertexDataSize()); const m=placed.flatTransformation;
      if(!localXDir) localXDir={x:m[0],y:m[1],z:m[2]}; if(!localYDir) localYDir={x:m[4],y:m[5],z:m[6]};
      for(let vi=0; vi<verts.length; vi+=6){ const lx=verts[vi],ly=verts[vi+1],lz=verts[vi+2];
        const wx=m[0]*lx+m[4]*ly+m[8]*lz+m[12], wy=m[1]*lx+m[5]*ly+m[9]*lz+m[13], wz=m[2]*lx+m[6]*ly+m[10]*lz+m[14];
        if(wx<minX)minX=wx;if(wx>maxX)maxX=wx;if(wy<minY)minY=wy;if(wy>maxY)maxY=wy;if(wz<minZ)minZ=wz;if(wz>maxZ)maxZ=wz;ok=true; } }
    finally { geom?.delete(); } }
  return ok ? { minX,maxX,minY,maxY,minZ,maxZ,localXDir,localYDir } : null;
}
// ── verbatim deriveWallAxes (ifc.js:692) ──
function deriveWallAxes(dx, dy, dz, heightAxis) {
  if (heightAxis === 'z_neg') heightAxis = 'z';
  if (heightAxis === 'y') { const lengthAxis=dx>=dz?'x':'z',thicknessAxis=dx>=dz?'z':'x';
    return { heightAxis, lengthAxis, thicknessAxis, length:Math.round(Math.max(dx,dz)*1000), height:Math.round(dy*1000), thickness:Math.round(Math.min(dx,dz)*1000) }; }
  const lengthAxis=dx>=dy?'x':'y',thicknessAxis=dx>=dy?'y':'x';
  return { heightAxis:'z', lengthAxis, thicknessAxis, length:Math.round(Math.max(dx,dy)*1000), height:Math.round(dz*1000), thickness:Math.round(Math.min(dx,dy)*1000) };
}
// ── getFacadePolygon: compacte echte variant (zelfde projectie/flood-fill/contour) ──
function getFacadePolygon(modelID, expressID, lAxis, hAxis, wallBB) {
  let mesh; try { mesh = api.GetFlatMesh(modelID, expressID); } catch { return null; }
  if (!mesh || mesh.geometries.size() === 0) return null;
  const GRID=20, MARGIN=600;
  const wallMinLv=wallBB[`min${lAxis.toUpperCase()}`], wallMinHv=wallBB[`min${hAxis.toUpperCase()}`];
  const wallLenMM=(wallBB[`max${lAxis.toUpperCase()}`]-wallMinLv)*1000, wallHgtMM=(wallBB[`max${hAxis.toUpperCase()}`]-wallMinHv)*1000;
  const lI=lAxis==='x'?0:lAxis==='y'?1:2, hI=hAxis==='x'?0:hAxis==='y'?1:2;
  let minGL=Infinity,maxGL=-Infinity,minGH=Infinity,maxGH=-Infinity; const cellArr=[];
  for(let gi=0;gi<mesh.geometries.size();gi++){const placed=mesh.geometries.get(gi);let geom;
    try{geom=api.GetGeometry(modelID,placed.geometryExpressID);const verts=api.GetVertexArray(geom.GetVertexData(),geom.GetVertexDataSize());const idxs=api.GetIndexArray(geom.GetIndexData(),geom.GetIndexDataSize());const m=placed.flatTransformation;
      const pr=(vi,I,mn)=>{const lx=verts[vi],ly=verts[vi+1],lz=verts[vi+2];const w=[m[0]*lx+m[4]*ly+m[8]*lz+m[12],m[1]*lx+m[5]*ly+m[9]*lz+m[13],m[2]*lx+m[6]*ly+m[10]*lz+m[14]];return (w[I]-mn)*1000;};
      const tmp=new Set();
      for(let ti=0;ti<idxs.length;ti+=3){const ai=idxs[ti]*6,bi=idxs[ti+1]*6,ci=idxs[ti+2]*6;
        const al=pr(ai,lI,wallMinLv),ah=pr(ai,hI,wallMinHv),bl=pr(bi,lI,wallMinLv),bh=pr(bi,hI,wallMinHv),cl2=pr(ci,lI,wallMinLv),ch2=pr(ci,hI,wallMinHv);
        if(al<-MARGIN&&bl<-MARGIN&&cl2<-MARGIN)continue; if(ah<-MARGIN&&bh<-MARGIN&&ch2<-MARGIN)continue;
        if(al>wallLenMM+MARGIN&&bl>wallLenMM+MARGIN&&cl2>wallLenMM+MARGIN)continue; if(ah>wallHgtMM+MARGIN&&bh>wallHgtMM+MARGIN&&ch2>wallHgtMM+MARGIN)continue;
        const addSeg=(l1,h1,l2,h2)=>{const steps=Math.max(1,Math.ceil(Math.max(Math.abs(l2-l1),Math.abs(h2-h1))/GRID));for(let s=0;s<=steps;s++){const t=s/steps;tmp.add(Math.round((l1+t*(l2-l1))/GRID)*65536+Math.round((h1+t*(h2-h1))/GRID));}};
        addSeg(al,ah,bl,bh);addSeg(bl,bh,cl2,ch2);addSeg(al,ah,cl2,ch2);}
      for(const k of tmp){const gl=(k/65536)|0,gh=k-gl*65536;if(gl<minGL)minGL=gl;if(gl>maxGL)maxGL=gl;if(gh<minGH)minGH=gh;if(gh>maxGH)maxGH=gh;cellArr.push(k);}
    }finally{geom?.delete();}}
  if(!cellArr.length)return null; minGL-=1;maxGL+=1;minGH-=1;maxGH+=1; if((maxGL-minGL+1)*(maxGH-minGH+1)>300000)return null;
  const Wd=maxGL-minGL+1,Hd=maxGH-minGH+1;const cell=new Uint8Array(Wd*Hd);for(const k of cellArr){const gl=(k/65536)|0,gh=k-gl*65536;cell[(gl-minGL)*Hd+(gh-minGH)]=1;}
  const out=new Uint8Array(Wd*Hd);const q=[0];out[0]=1;let qi=0;while(qi<q.length){const idx=q[qi++];const gx=(idx/Hd)|0,gy=idx-gx*Hd;for(const ni of [gx>0?(gx-1)*Hd+gy:-1,gx<Wd-1?(gx+1)*Hd+gy:-1,gy>0?gx*Hd+gy-1:-1,gy<Hd-1?gx*Hd+gy+1:-1]){if(ni<0)continue;if(!out[ni]&&!cell[ni]){out[ni]=1;q.push(ni);}}}
  const fill=new Uint8Array(Wd*Hd);for(let i=0;i<Wd*Hd;i++)fill[i]=cell[i]||(out[i]?0:1);
  const edge=new Map();for(let gx=0;gx<Wd;gx++)for(let gy=0;gy<Hd;gy++){if(!fill[gx*Hd+gy])continue;const gl=gx+minGL,gh=gy+minGH;const l0=gl*GRID,h0=gh*GRID,l1=l0+GRID,h1=h0+GRID;
    if(!(gy<Hd-1&&fill[gx*Hd+gy+1]))edge.set(`${l0},${h1}`,[l1,h1]); if(!(gy>0&&fill[gx*Hd+gy-1]))edge.set(`${l1},${h0}`,[l0,h0]); if(!(gx<Wd-1&&fill[(gx+1)*Hd+gy]))edge.set(`${l1},${h1}`,[l1,h0]); if(!(gx>0&&fill[(gx-1)*Hd+gy]))edge.set(`${l0},${h0}`,[l0,h1]);}
  const sk=edge.keys().next().value; if(!sk)return null; const [sl,sh]=sk.split(',').map(Number);const raw=[];let cl=sl,ch=sh;
  for(let it=0;it<100000;it++){raw.push({l:cl,h:ch});const nx=edge.get(`${cl},${ch}`);if(!nx)break;[cl,ch]=nx;if(cl===sl&&ch===sh)break;}
  const poly=[];for(let i=0;i<raw.length;i++){const p=raw[(i-1+raw.length)%raw.length],c=raw[i],n=raw[(i+1)%raw.length];if(!((p.l===c.l&&c.l===n.l)||(p.h===c.h&&c.h===n.h)))poly.push(c);}
  return poly.length>=3?poly:null;
}
// ── nieuwe detectModelUpAxis (compact, gelijk aan ifc.js) ──
function detectUp() {
  const _SMIN=1.2,_SMAX=6.5,_BK=0.05;
  const ext=(eid)=>{const bb=getBBox(mid,eid);return bb?{dx:bb.maxX-bb.minX,dy:bb.maxY-bb.minY,dz:bb.maxZ-bb.minZ}:null;};
  const ids=[];for(const t of [W.IFCWALLSTANDARDCASE,W.IFCWALL]){const v=api.GetLineIDsWithType(mid,t);for(let i=0;i<v.size();i++)ids.push(v.get(i));}
  if(!ids.length) return {axis:'z',source:'geen-wanden'};
  const bY=new Map(),bZ=new Map();const stride=Math.max(1,Math.floor(ids.length/4000));
  for(let i=0;i<ids.length;i+=stride){const e=ext(ids[i]);if(!e)continue;if(e.dy>=_SMIN&&e.dy<=_SMAX){const k=Math.round(e.dy/_BK);bY.set(k,(bY.get(k)||0)+1);}if(e.dz>=_SMIN&&e.dz<=_SMAX){const k=Math.round(e.dz/_BK);bZ.set(k,(bZ.get(k)||0)+1);}}
  const modal=(m)=>{let c=0;for(const[,v]of m)if(v>c)c=v;return c;};
  const yC=modal(bY),zC=modal(bZ);const mx=Math.max(yC,zC),mn=Math.min(yC,zC);const win=yC>=zC?'y':'z';const clear=mx>=3&&(mn===0||mx>=3*mn);
  // deur/raam vote
  let dv=null;{const vote={x:0,y:0,z:0};for(const tn of['IFCWINDOW','IFCDOOR']){let c;try{c=api.GetTypeCodeFromName(tn);}catch{continue;}let v;try{v=api.GetLineIDsWithType(mid,c);}catch{continue;}for(let i=0;i<v.size();i++){const e=ext(v.get(i));if(!e)continue;const m=Math.max(e.dx,e.dy,e.dz);if(m===e.dx)vote.x++;else if(m===e.dy)vote.y++;else vote.z++;}}if(vote.y||vote.z)dv=vote.y>=vote.z?'y':'z';}
  if(dv&&!(clear&&dv!==win))return{axis:dv,source:'ramen/deuren'};
  if(clear)return{axis:win,source:'gedeelde-hoogte'};
  return{axis:'z',source:'ambigu→default-z'};
}

// ── entity-types + typenamen ──
const typeMap={};{const v=api.GetLineIDsWithType(mid,W.IFCRELDEFINESBYTYPE);for(let i=0;i<v.size();i++){try{const r=api.GetLine(mid,v.get(i),false);const tRef=val(r?.RelatingType);if(!tRef)continue;const t=api.GetLine(mid,tRef,false);const tn=val(t?.Name);const rel=r?.RelatedObjects;if(!rel||!tn)continue;for(const ro of rel){const id=val(ro);if(id)typeMap[id]=tn;}}catch{}}}
const SUP=['IFCWALL','IFCWALLSTANDARDCASE','IFCSLAB','IFCBUILDINGELEMENTPROXY','IFCCOVERING','IFCCURTAINWALL','IFCPLATE','IFCMEMBER','IFCELEMENTASSEMBLY','IFCROOF','IFCWINDOW','IFCDOOR'];
console.log("=== Entity-types in dakrand-IFC ===");
const byType={};
for(const tn of SUP){let c;try{c=api.GetTypeCodeFromName(tn);}catch{continue;}let v;try{v=api.GetLineIDsWithType(mid,c);}catch{continue;}if(v.size()>0){byType[tn]=v.size();console.log(`  ${tn}: ${v.size()}`);}}

const up=detectUp();
console.log(`\nup-as die de code zou gebruiken (detectModelUpAxis): '${up.axis}' (${up.source})`);

function measure(label, eid){
  const bb=getBBox(mid,eid); if(!bb){console.log(`${label} #${eid}: GEEN bbox`);return null;}
  const dx=bb.maxX-bb.minX,dy=bb.maxY-bb.minY,dz=bb.maxZ-bb.minZ;
  const ax=deriveWallAxes(dx,dy,dz,up.axis);
  const fp=getFacadePolygon(mid,eid,ax.lengthAxis,ax.heightAxis,bb);
  const line=api.GetLine(mid,eid,false); const nm=val(line?.Name)??'';
  console.log(`\n${label} #${eid} "${String(nm).slice(0,40)}"  type=${typeMap[eid]??'(geen)'}`);
  console.log(`   bbox mm: dx=${Math.round(dx*1000)} dy=${Math.round(dy*1000)} dz=${Math.round(dz*1000)}`);
  console.log(`   deriveWallAxes('${up.axis}'): height=${ax.height} length=${ax.length} thickness=${ax.thickness} | lengthAxis=${ax.lengthAxis} heightAxis=${ax.heightAxis} thicknessAxis=${ax.thicknessAxis}`);
  console.log(`   facadePoly: ${fp?fp.length+' hoekpunten':'NULL'} ; parse-guard length<100||height<100? ${ax.length<100||ax.height<100?'SKIP':'ok'}`);
  return {eid, ax, dx,dy,dz, bb};
}

// kies dominante dakrand-type (grootste niet-wand groep) + sample
const nonWall = Object.keys(byType).filter(t=>!['IFCWALL','IFCWALLSTANDARDCASE','IFCWINDOW','IFCDOOR'].includes(t));
const dominant = nonWall.sort((a,b)=>byType[b]-byType[a])[0];
console.log(`\n=== Dakrand-type (dominant niet-wand): ${dominant} (${byType[dominant]}) ===`);
const dvec = api.GetLineIDsWithType(mid, api.GetTypeCodeFromName(dominant));
const dsamples=[]; for(let i=0;i<Math.min(dvec.size(),400);i++){const m=measure(i<3?'DAKRAND':'(dak)', dvec.get(i)); if(m)dsamples.push(m); if(i>=2 && i<dvec.size()-1) { /* meet stil verder voor groep-sim */ } }
// wand-contrast
let wsample=null; for(const t of ['IFCWALLSTANDARDCASE','IFCWALL']){if(!byType[t])continue;const v=api.GetLineIDsWithType(mid,api.GetTypeCodeFromName(t));if(v.size()){wsample=measure('WAND', v.get(0));break;}}
if(!wsample) console.log("\n(geen IfcWall in dit IFC → geen wand-contrast; up-as kwam dus uit "+up.source+")");

// ── buildFullGroupFacadePattern-simulatie op alle dakrand-elementen ──
console.log(`\n=== buildFullGroupFacadePattern-simulatie (alle ${dsamples.length} dakrand-elementen als één groep) ===`);
const wo = dsamples.map(s=>({len:s.ax.length, lengthAxis:s.ax.lengthAxis, heightAxis:s.ax.heightAxis,
  lengthStart:Math.round(s.bb[`min${s.ax.lengthAxis.toUpperCase()}`]*1000), heightStart:Math.round(s.bb[`min${s.ax.heightAxis.toUpperCase()}`]*1000),
  height:s.ax.height}));
// refWall = langste
const ref = [...wo].sort((a,b)=>b.len-a.len)[0];
const axisWalls = wo.filter(w=>w.lengthAxis===ref.lengthAxis);
const laDist={}; for(const w of wo) laDist[w.lengthAxis]=(laDist[w.lengthAxis]||0)+1;
console.log(`  lengte-as-verdeling: ${JSON.stringify(laDist)} ; referentie lengthAxis='${ref.lengthAxis}'`);
console.log(`  axisWalls (zelfde lengte-as als ref): ${axisWalls.length} van ${wo.length}  → ${wo.length-axisWalls.length} dakrand-elementen vallen uit axisWalls`);
const gMinH=Math.min(...axisWalls.map(w=>w.heightStart)), gMaxH=Math.max(...axisWalls.map(w=>w.heightStart+w.height));
const groupHeight=gMaxH-gMinH;
const lagenmaat=60; // ~steenH(50)+lint(10)
console.log(`  groupHeight=${groupHeight} mm ; lagenmaat≈${lagenmaat} → rijen ≈ ceil(groupHeight/lagenmaat)=${Math.ceil(groupHeight/lagenmaat)} ${groupHeight<=0?'❌ GEEN rijen':'(rijen mogelijk)'}`);
api.CloseModel(mid);
