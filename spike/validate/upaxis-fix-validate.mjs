// Validatie up-as-fix: OLD vs NEW detectModelUpAxis op alle modellen + #53023-check
// + synthetische Z-up getuige. OLD/NEW = verbatim kopieën uit src/lib/ifc.js.
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const A = resolve(__dirname, "../../../stap-1-maak-eerst-een-vast-proje-62cf");
const require = createRequire(pathToFileURL(A + "/package.json"));
const W = require(resolve(A, "node_modules/web-ifc/web-ifc-api-node.js"));
const _UPAXIS_CONFIDENCE_HIGH = 0.75, _UPAXIS_CONFIDENCE_LOW = 0.55, _UPAXIS_NORMAL_SAMPLE_MAX = 400;

const MODELS = {
  "BIL-MOO": "C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/BIL-MOO-A-ZZ-PBP.ifc",
  "Helmond": "C:/Users/MurkAnneKooistraKooi/.zenflow/worktrees/je-bent-een-senior-software-arch-72bb/backend/uploads/7d0f61bd-a89a-4912-8304-7d872a2caa11/M2502_Helmond Toren Gevel studie.ifc",
  "Kubistisch": "C:/Users/MurkAnneKooistraKooi/AppData/Local/Microsoft/Windows/INetCache/Content.Outlook/2I1IYVNL/Kubistische woning export IFC.ifc",
  "GFRC": "C:/Users/MurkAnneKooistraKooi/.zenflow/worktrees/je-bent-een-senior-software-arch-72bb/backend/uploads/c316820b-943c-40e1-85a4-2d85ea64420f/250361_GFRC-elementen-Dunea-SPS.ifc",
  "KGT": "C:/Users/MurkAnneKooistraKooi/.zenflow/worktrees/prompt-d3b5/uploads/44fbf233-2dd7-4ec1-bec4-2ca217f80728/KGT Tegels - V5.ifc",
  "Demo": "C:/Users/MurkAnneKooistraKooi/.zenflow/worktrees/prompt-d3b5/output_demo/Demo_Gevel_substructure.ifc",
  "MSHF": "C:/Users/MurkAnneKooistraKooi/AppData/Local/Microsoft/Olk/Attachments/ooa-5b0a484f-97bb-42a1-8562-737dd2aa8c42/722a19249fb4a15994fd8d65b6de5ed11e64f8763747654c373eacd62270fe40/MSHF_DM.ifc",
};
const api = new W.IfcAPI(); await api.Init();
const WT = [W.IFCWALLSTANDARDCASE, W.IFCWALL];

// ===== OLD (verbatim, AUTO-pad) =====
function OLD(api, modelID, wallTypes, { sampleSize = 30 } = {}) {
  const sampleIDs = []; for (const wType of wallTypes){const v=api.GetLineIDsWithType(modelID,wType);for(let i=0;i<v.size()&&sampleIDs.length<sampleSize;i++)sampleIDs.push(v.get(i));}
  if(sampleIDs.length===0)return {axis:'z'};
  let totalYExtent=0,totalZExtent=0,totalNormAbsY=0,totalNormAbsZ=0,normCount=0,yUpVotes=0,zUpVotes=0;const _STORY_H_MIN=1.2,_STORY_H_MAX=6.5;
  for(const id of sampleIDs){let mesh;try{mesh=api.GetFlatMesh(modelID,id);}catch{continue;}if(!mesh||mesh.geometries.size()===0)continue;
    for(let gi=0;gi<mesh.geometries.size();gi++){const placed=mesh.geometries.get(gi);let geom;try{geom=api.GetGeometry(modelID,placed.geometryExpressID);const verts=api.GetVertexArray(geom.GetVertexData(),geom.GetVertexDataSize());const m=placed.flatTransformation;
      let minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;const vertCount=Math.floor(verts.length/6);const step=Math.max(1,Math.floor(vertCount/_UPAXIS_NORMAL_SAMPLE_MAX));
      for(let i=0;i<vertCount;i++){const base=i*6;const lx=verts[base]??0,ly=verts[base+1]??0,lz=verts[base+2]??0;const wy=m[1]*lx+m[5]*ly+m[9]*lz+m[13],wz=m[2]*lx+m[6]*ly+m[10]*lz+m[14];if(wy<minY)minY=wy;if(wy>maxY)maxY=wy;if(wz<minZ)minZ=wz;if(wz>maxZ)maxZ=wz;
        if(i%step===0){const nx=verts[base+3]??0,ny=verts[base+4]??0,nz=verts[base+5]??0;totalNormAbsY+=Math.abs(m[1]*nx+m[5]*ny+m[9]*nz);totalNormAbsZ+=Math.abs(m[2]*nx+m[6]*ny+m[10]*nz);normCount++;}}
      const yExt=maxY>minY?maxY-minY:0,zExt=maxZ>minZ?maxZ-minZ:0;if(yExt>0)totalYExtent+=yExt;if(zExt>0)totalZExtent+=zExt;
      if(yExt>=_STORY_H_MIN&&yExt<=_STORY_H_MAX&&yExt<zExt*0.8)yUpVotes++;else if(zExt>=_STORY_H_MIN&&zExt<=_STORY_H_MAX&&zExt<yExt*0.8)zUpVotes++;
    }finally{geom?.delete();}}}
  const totalVotes=yUpVotes+zUpVotes;let bboxVote='UNKNOWN',bboxScore=0;
  if(totalVotes>=3){const yf=yUpVotes/totalVotes,zf=zUpVotes/totalVotes;if(yf>=0.6){bboxVote='y';bboxScore=yf;}else if(zf>=0.6){bboxVote='z';bboxScore=zf;}}
  else{const t=totalYExtent+totalZExtent;const zs=t>1e-6?totalZExtent/t:0,ys=t>1e-6?totalYExtent/t:0;if(zs>0.6){bboxVote='z';bboxScore=zs;}else if(ys>0.6){bboxVote='y';bboxScore=ys;}}
  const nt=totalNormAbsY+totalNormAbsZ;const nyf=nt>1e-6?totalNormAbsY/nt:0,nzf=nt>1e-6?totalNormAbsZ/nt:0;let normalVote='UNKNOWN';if(nyf>0.6)normalVote='z';else if(nzf>0.6)normalVote='y';
  let det,conf;if(bboxVote!=='UNKNOWN'&&normalVote!=='UNKNOWN'){if(bboxVote===normalVote){det=bboxVote;conf=0.8;}else{det='UNKNOWN';conf=0.5;}}else if(bboxVote!=='UNKNOWN'){det=bboxVote;conf=bboxScore*0.7;}else if(normalVote!=='UNKNOWN'){det=normalVote;conf=0.6;}else{det='UNKNOWN';conf=0;}
  if(det==='UNKNOWN'||conf<_UPAXIS_CONFIDENCE_LOW){det=bboxVote!=='UNKNOWN'?bboxVote:'z';}
  return {axis:det,confidence:+conf.toFixed(2)};
}

// ===== NEW (verbatim AUTO-pad uit ifc.js, met test-shim __SWAP__ in _extentOf) =====
function NEW(api, modelID, wallTypes) {
  const _STORY_MIN=1.2,_STORY_MAX=6.5,_BUCKET=0.05;
  const _extentOf=(eid)=>{let mesh;try{mesh=api.GetFlatMesh(modelID,eid);}catch{return null;}if(!mesh||mesh.geometries.size()===0)return null;
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity,ok=false;
    for(let gi=0;gi<mesh.geometries.size();gi++){const placed=mesh.geometries.get(gi);let geom;try{geom=api.GetGeometry(modelID,placed.geometryExpressID);const verts=api.GetVertexArray(geom.GetVertexData(),geom.GetVertexDataSize());const m=placed.flatTransformation;
      for(let i=0;i<verts.length;i+=6){const lx=verts[i]??0,ly=verts[i+1]??0,lz=verts[i+2]??0;const wx=m[0]*lx+m[4]*ly+m[8]*lz+m[12],wy=m[1]*lx+m[5]*ly+m[9]*lz+m[13],wz=m[2]*lx+m[6]*ly+m[10]*lz+m[14];
        if(wx<minX)minX=wx;if(wx>maxX)maxX=wx;if(wy<minY)minY=wy;if(wy>maxY)maxY=wy;if(wz<minZ)minZ=wz;if(wz>maxZ)maxZ=wz;ok=true;}}finally{geom?.delete();}}
    if(!ok)return null; let r={dx:maxX-minX,dy:maxY-minY,dz:maxZ-minZ};
    if(globalThis.__SWAP__){const t=r.dy;r.dy=r.dz;r.dz=t;} // synthetische Z-up getuige
    return r;};
  const allWallIds=[];for(const wType of wallTypes){const v=api.GetLineIDsWithType(modelID,wType);for(let i=0;i<v.size();i++)allWallIds.push(v.get(i));}
  if(allWallIds.length===0)return {axis:'z',source:'geen-wanden',confidence:0,reason:'geen wanden'};
  const _MAX_SCAN=4000;const stride=Math.max(1,Math.floor(allWallIds.length/_MAX_SCAN));
  const bucketsY=new Map(),bucketsZ=new Map();let sumY=0,sumZ=0,scanned=0;
  for(let idx=0;idx<allWallIds.length;idx+=stride){const e=_extentOf(allWallIds[idx]);if(!e)continue;scanned++;sumY+=e.dy;sumZ+=e.dz;
    if(e.dy>=_STORY_MIN&&e.dy<=_STORY_MAX){const k=Math.round(e.dy/_BUCKET);bucketsY.set(k,(bucketsY.get(k)||0)+1);}
    if(e.dz>=_STORY_MIN&&e.dz<=_STORY_MAX){const k=Math.round(e.dz/_BUCKET);bucketsZ.set(k,(bucketsZ.get(k)||0)+1);}}
  const _modal=(mp)=>{let count=0,value=0;for(const [k,c] of mp)if(c>count){count=c;value=k*_BUCKET;}return {count,value:Math.round(value*1000)};};
  const sharedY=_modal(bucketsY),sharedZ=_modal(bucketsZ);
  let doorVote=null;{const vote={x:0,y:0,z:0};for(const tn of ['IFCWINDOW','IFCDOOR']){let code;try{code=api.GetTypeCodeFromName(tn);}catch{continue;}let vec;try{vec=api.GetLineIDsWithType(modelID,code);}catch{continue;}
    for(let i=0;i<vec.size();i++){const e=_extentOf(vec.get(i));if(!e)continue;const mx=Math.max(e.dx,e.dy,e.dz);if(mx===e.dx)vote.x++;else if(mx===e.dy)vote.y++;else vote.z++;}}
    if(vote.y>0||vote.z>0)doorVote=vote.y>=vote.z?'y':'z';}
  const yC=sharedY.count,zC=sharedZ.count;const maxC=Math.max(yC,zC),minC=Math.min(yC,zC);const sharedWinner=yC>=zC?'y':'z';
  const clearShared=maxC>=3&&(minC===0||maxC>=3*minC);let detectedAxis,source,confidence,reason;
  if(doorVote&&!(clearShared&&doorVote!==sharedWinner)){detectedAxis=doorVote;source='ramen/deuren-langeas';confidence=(clearShared&&doorVote===sharedWinner)?0.95:0.8;reason=`deur/raam → ${doorVote}`+(clearShared?` +gedeeld(${sharedWinner} ${maxC}vs${minC})`:'');}
  else if(clearShared&&doorVote&&doorVote!==sharedWinner){detectedAxis=sharedWinner;source='gedeelde(>deur-conflict)';confidence=0.6;reason=`gedeeld ${sharedWinner}(${maxC}vs${minC}) wint van deur/raam ${doorVote}`;}
  else if(clearShared){detectedAxis=sharedWinner;source='gedeelde-verdiepingshoogte';confidence=0.85;reason=`duidelijke modus ${sharedWinner} (${maxC}@${sharedWinner==='y'?sharedY.value:sharedZ.value}mm vs ${minC})`;}
  else{detectedAxis='z';source='ambigu→default-z';confidence=0.4;reason=`geen deur/raam en geen duidelijke modus (y=${yC} z=${zC}) → IFC-conventie z`;}
  return {axis:detectedAxis,source,confidence:+confidence.toFixed(2),reason,sharedY,sharedZ,doorVote,scanned};
}

function deriveWallAxes(dx,dy,dz,heightAxis){if(heightAxis==='z_neg')heightAxis='z';
  if(heightAxis==='y'){const lengthAxis=dx>=dz?'x':'z',thicknessAxis=dx>=dz?'z':'x';return{heightAxis,lengthAxis,thicknessAxis,length:Math.round(Math.max(dx,dz)*1000),height:Math.round(dy*1000),thickness:Math.round(Math.min(dx,dz)*1000)};}
  const lengthAxis=dx>=dy?'x':'y',thicknessAxis=dx>=dy?'y':'x';return{heightAxis:'z',lengthAxis,thicknessAxis,length:Math.round(Math.max(dx,dy)*1000),height:Math.round(dz*1000),thickness:Math.round(Math.min(dx,dy)*1000)};}

console.log("MODEL           | OLD | NEW | NEW-bron / reden");
console.log("----------------|-----|-----|------------------");
const results = {};
for (const [name, f] of Object.entries(MODELS)) {
  if (!existsSync(f)) { console.log(`${name.padEnd(15)}| (ontbreekt)`); continue; }
  const mid = api.OpenModel(new Uint8Array(readFileSync(f)), {});
  const t0 = Date.now(); const o = OLD(api, mid, WT); const nw = NEW(api, mid, WT); const ms = Date.now() - t0;
  results[name] = { old: o.axis, new: nw.axis, mid, f };
  console.log(`${name.padEnd(15)}| ${String(o.axis).padEnd(4)}| ${String(nw.axis).padEnd(4)}| ${nw.source} — ${nw.reason} [${ms}ms]`);
  if (name !== "BIL-MOO") api.CloseModel(mid);
}

// #53023 (BIL) check + HSB broken-count OLD vs NEW
console.log("\n=== BIL-MOO #53023 + HSB_272.5 herstel ===");
const bilMid = results["BIL-MOO"].mid;
function getBBox(mid,eid){let mesh;try{mesh=api.GetFlatMesh(mid,eid);}catch{return null;}if(!mesh||mesh.geometries.size()===0)return null;let a=[Infinity,Infinity,Infinity],b=[-Infinity,-Infinity,-Infinity],ok=false;for(let gi=0;gi<mesh.geometries.size();gi++){const pl=mesh.geometries.get(gi);let g;try{g=api.GetGeometry(mid,pl.geometryExpressID);const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize());const m=pl.flatTransformation;for(let i=0;i<v.length;i+=6){const lx=v[i],ly=v[i+1],lz=v[i+2];const w=[m[0]*lx+m[4]*ly+m[8]*lz+m[12],m[1]*lx+m[5]*ly+m[9]*lz+m[13],m[2]*lx+m[6]*ly+m[10]*lz+m[14]];for(let k=0;k<3;k++){if(w[k]<a[k])a[k]=w[k];if(w[k]>b[k])b[k]=w[k];}ok=true;}}finally{g?.delete();}}return ok?{dx:b[0]-a[0],dy:b[1]-a[1],dz:b[2]-a[2]}:null;}
const bb = getBBox(bilMid, 53023);
for (const ax of [results["BIL-MOO"].old, results["BIL-MOO"].new]) {
  const d = deriveWallAxes(bb.dx, bb.dy, bb.dz, ax);
  console.log(`  up='${ax}': #53023 → length×height = ${d.length}×${d.height}  thicknessAxis=${d.thicknessAxis} (horizontaal=${d.thicknessAxis!=='y'?'JA→gevel verticaal':'NEE→bovenvlak'})`);
}
// broken-count
const val=(x)=>(x&&typeof x==='object'&&'value'in x)?x.value:x;
const typeMap={};{const v=api.GetLineIDsWithType(bilMid,W.IFCRELDEFINESBYTYPE);for(let i=0;i<v.size();i++){try{const r=api.GetLine(bilMid,v.get(i),false);const tRef=val(r?.RelatingType);if(!tRef)continue;const t=api.GetLine(bilMid,tRef,false);const tn=val(t?.Name);const rel=r?.RelatedObjects;if(!rel||!tn)continue;for(const ro of rel){const id=val(ro);if(id)typeMap[id]=tn;}}catch{}}}
const hsb=[];for(const wt of WT){const v=api.GetLineIDsWithType(bilMid,wt);for(let i=0;i<v.size();i++){const id=v.get(i);if(/272\.5/.test(typeMap[id]||''))hsb.push(id);}}
for (const ax of [results["BIL-MOO"].old, results["BIL-MOO"].new]) {
  let broken=0;for(const id of hsb){const d=getBBox(bilMid,id);if(!d)continue;const w=deriveWallAxes(d.dx,d.dy,d.dz,ax);if(w.height<1000)broken++;}
  console.log(`  up='${ax}': HSB_272.5 als platte slab (height<1000mm) = ${broken} / ${hsb.length}`);
}

// synthetische Z-up getuige (BIL met Y/Z geswapt) → NEW moet 'z' geven
globalThis.__SWAP__ = true;
const zsyn = NEW(api, bilMid, WT);
globalThis.__SWAP__ = false;
console.log(`\n=== synthetische Z-up getuige (BIL met Y↔Z geswapt) ===`);
console.log(`  NEW → ${zsyn.axis} (verwacht 'z')  [${zsyn.source}: ${zsyn.reason}]`);
api.CloseModel(bilMid);
