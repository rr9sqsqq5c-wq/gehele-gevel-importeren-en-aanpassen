// READ-ONLY: draait een VERBATIM kopie van detectModelUpAxis + deriveWallAxes uit
// src/lib/ifc.js op BIL-MOO, en classificeert alle HSB_272.5-wanden. Geen wijziging.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const A = resolve(__dirname, "../../../stap-1-maak-eerst-een-vast-proje-62cf");
const require = createRequire(pathToFileURL(A + "/package.json"));
const W = require(resolve(A, "node_modules/web-ifc/web-ifc-api-node.js"));
const F = "C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/BIL-MOO-A-ZZ-PBP.ifc";
const api = new W.IfcAPI(); await api.Init();
const modelID = api.OpenModel(new Uint8Array(readFileSync(F)), {});
const val = (x) => (x && typeof x === "object" && "value" in x) ? x.value : x;

const _UPAXIS_CONFIDENCE_HIGH = 0.75, _UPAXIS_CONFIDENCE_LOW = 0.55, _UPAXIS_NORMAL_SAMPLE_MAX = 400;

// ===== VERBATIM kopie detectModelUpAxis (ifc.js:542) — alleen console.debug gedempt =====
const dbg = () => {};
function detectModelUpAxis(api, modelID, wallTypes, { forceOrientation = 'AUTO', sampleSize = 30 } = {}) {
  const sampleIDs = [];
  for (const wType of wallTypes) { const idsVec = api.GetLineIDsWithType(modelID, wType);
    for (let i = 0; i < idsVec.size() && sampleIDs.length < sampleSize; i++) sampleIDs.push(idsVec.get(i)); }
  if (sampleIDs.length === 0) return 'z';
  let totalYExtent=0,totalZExtent=0,totalNormAbsY=0,totalNormAbsZ=0,normCount=0,yUpVotes=0,zUpVotes=0;
  const _STORY_H_MIN=1.2,_STORY_H_MAX=6.5;
  for (const id of sampleIDs) { let mesh; try{mesh=api.GetFlatMesh(modelID,id);}catch{continue;} if(!mesh||mesh.geometries.size()===0)continue;
    for (let gi=0;gi<mesh.geometries.size();gi++){const placed=mesh.geometries.get(gi);let geom;
      try{geom=api.GetGeometry(modelID,placed.geometryExpressID);const verts=api.GetVertexArray(geom.GetVertexData(),geom.GetVertexDataSize());const m=placed.flatTransformation;
        let minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;const vertCount=Math.floor(verts.length/6);const step=Math.max(1,Math.floor(vertCount/_UPAXIS_NORMAL_SAMPLE_MAX));
        for(let i=0;i<vertCount;i++){const base=i*6;const lx=verts[base]??0,ly=verts[base+1]??0,lz=verts[base+2]??0;
          const wy=m[1]*lx+m[5]*ly+m[9]*lz+m[13],wz=m[2]*lx+m[6]*ly+m[10]*lz+m[14];
          if(wy<minY)minY=wy;if(wy>maxY)maxY=wy;if(wz<minZ)minZ=wz;if(wz>maxZ)maxZ=wz;
          if(i%step===0){const nx=verts[base+3]??0,ny=verts[base+4]??0,nz=verts[base+5]??0;
            const wny=m[1]*nx+m[5]*ny+m[9]*nz,wnz=m[2]*nx+m[6]*ny+m[10]*nz;totalNormAbsY+=Math.abs(wny);totalNormAbsZ+=Math.abs(wnz);normCount++;}}
        const yExt=maxY>minY?maxY-minY:0,zExt=maxZ>minZ?maxZ-minZ:0;if(yExt>0)totalYExtent+=yExt;if(zExt>0)totalZExtent+=zExt;
        if(yExt>=_STORY_H_MIN&&yExt<=_STORY_H_MAX&&yExt<zExt*0.8)yUpVotes++;else if(zExt>=_STORY_H_MIN&&zExt<=_STORY_H_MAX&&zExt<yExt*0.8)zUpVotes++;
      }finally{geom?.delete();}}}
  const totalVotes=yUpVotes+zUpVotes;const bboxYVoteFrac=totalVotes>0?yUpVotes/totalVotes:0,bboxZVoteFrac=totalVotes>0?zUpVotes/totalVotes:0;
  let bboxVote='UNKNOWN',bboxScore=0;
  if(totalVotes>=3){if(bboxYVoteFrac>=0.6){bboxVote='y';bboxScore=bboxYVoteFrac;}else if(bboxZVoteFrac>=0.6){bboxVote='z';bboxScore=bboxZVoteFrac;}}
  else{const t=totalYExtent+totalZExtent;const zs=t>1e-6?totalZExtent/t:0,ys=t>1e-6?totalYExtent/t:0;if(zs>0.6){bboxVote='z';bboxScore=zs;}else if(ys>0.6){bboxVote='y';bboxScore=ys;}}
  const normTotal=totalNormAbsY+totalNormAbsZ;const normYFrac=normTotal>1e-6?totalNormAbsY/normTotal:0,normZFrac=normTotal>1e-6?totalNormAbsZ/normTotal:0;
  let normalVote='UNKNOWN',normalScore=0;if(normYFrac>0.6){normalVote='z';normalScore=normYFrac;}else if(normZFrac>0.6){normalVote='y';normalScore=normZFrac;}
  let detectedAxis,confidence,reason;
  if(bboxVote!=='UNKNOWN'&&normalVote!=='UNKNOWN'){if(bboxVote===normalVote){detectedAxis=bboxVote;confidence=(bboxScore+normalScore)/2;reason=`Beide votes overeen: bbox=${bboxVote} normals=${normalVote}`;}else{detectedAxis='UNKNOWN';confidence=0.5;reason=`Votes conflicteren: bbox=${bboxVote}(${bboxScore.toFixed(2)}) vs normals=${normalVote}(${normalScore.toFixed(2)})`;}}
  else if(bboxVote!=='UNKNOWN'){detectedAxis=bboxVote;confidence=bboxScore*0.7;reason=`Alleen bbox: ${bboxVote}`;}
  else if(normalVote!=='UNKNOWN'){detectedAxis=normalVote;confidence=normalScore*0.7;reason=`Alleen normals: ${normalVote}`;}
  else{detectedAxis='UNKNOWN';confidence=0;reason='Beide votes onbepaald';}
  if(detectedAxis==='UNKNOWN'||confidence<_UPAXIS_CONFIDENCE_LOW){if(bboxVote!=='UNKNOWN'){detectedAxis=bboxVote;reason+=` → low conf, bboxVote ${bboxVote}`;}else{detectedAxis='z';reason+=' → fallback z';}}
  return { axis:detectedAxis, bboxVote, bboxScore:+bboxScore.toFixed(3), normalVote, normalScore:+normalScore.toFixed(3), normYFrac:+normYFrac.toFixed(3), normZFrac:+normZFrac.toFixed(3), confidence:+confidence.toFixed(3), reason, yUpVotes, zUpVotes, totalYExtent:Math.round(totalYExtent), totalZExtent:Math.round(totalZExtent) };
}
// ===== VERBATIM deriveWallAxes (ifc.js:734) =====
function deriveWallAxes(dx,dy,dz,heightAxis){ if(heightAxis==='z_neg')heightAxis='z';
  if(heightAxis==='y'){const lengthAxis=dx>=dz?'x':'z',thicknessAxis=dx>=dz?'z':'x';return{heightAxis,lengthAxis,thicknessAxis,length:Math.round(Math.max(dx,dz)*1000),height:Math.round(dy*1000),thickness:Math.round(Math.min(dx,dz)*1000)};}
  const lengthAxis=dx>=dy?'x':'y',thicknessAxis=dx>=dy?'y':'x';return{heightAxis:'z',lengthAxis,thicknessAxis,length:Math.round(Math.max(dx,dy)*1000),height:Math.round(dz*1000),thickness:Math.round(Math.min(dx,dy)*1000)};}

function getBBox(eid){let mesh;try{mesh=api.GetFlatMesh(modelID,eid);}catch{return null;}if(!mesh||mesh.geometries.size()===0)return null;
  let a=[Infinity,Infinity,Infinity],b=[-Infinity,-Infinity,-Infinity],ok=false;
  for(let gi=0;gi<mesh.geometries.size();gi++){const pl=mesh.geometries.get(gi);let g;try{g=api.GetGeometry(modelID,pl.geometryExpressID);const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize());const m=pl.flatTransformation;
    for(let i=0;i<v.length;i+=6){const lx=v[i],ly=v[i+1],lz=v[i+2];const w=[m[0]*lx+m[4]*ly+m[8]*lz+m[12],m[1]*lx+m[5]*ly+m[9]*lz+m[13],m[2]*lx+m[6]*ly+m[10]*lz+m[14]];for(let k=0;k<3;k++){if(w[k]<a[k])a[k]=w[k];if(w[k]>b[k])b[k]=w[k];}ok=true;}}finally{g?.delete();}}
  return ok?{dx:b[0]-a[0],dy:b[1]-a[1],dz:b[2]-a[2]}:null;}

const up = detectModelUpAxis(api, modelID, [W.IFCWALLSTANDARDCASE, W.IFCWALL], { forceOrientation:'AUTO' });
console.log("detectModelUpAxis (AUTO) →", JSON.stringify(up, null, 0));
console.log(`\n==> code gebruikt heightAxis = '${up.axis}'\n`);

// typeMap
const typeMap={};{const v=api.GetLineIDsWithType(modelID,W.IFCRELDEFINESBYTYPE);for(let i=0;i<v.size();i++){try{const r=api.GetLine(modelID,v.get(i),false);const tRef=val(r?.RelatingType);if(!tRef)continue;const t=api.GetLine(modelID,tRef,false);const tn=val(t?.Name);const rel=r?.RelatedObjects;if(!rel||!tn)continue;for(const ro of rel){const id=val(ro);if(id)typeMap[id]=tn;}}catch{}}}

const wallIds=[];for(const t of [W.IFCWALLSTANDARDCASE,W.IFCWALL]){const v=api.GetLineIDsWithType(modelID,t);for(let i=0;i<v.size();i++)wallIds.push(v.get(i));}
let hsbTotal=0, broken=0, ok=0; const samples=[];
for(const id of wallIds){ const tn=typeMap[id]||''; if(!/272\.5/.test(tn))continue; const bb=getBBox(id);if(!bb)continue; hsbTotal++;
  const ax=deriveWallAxes(bb.dx,bb.dy,bb.dz,up.axis);
  const isBand = ax.height < 1000; // hoogte < 1 m ⇒ als horizontale plaat behandeld
  if(isBand){broken++; if(samples.length<6)samples.push({id,bb,ax});} else ok++;
}
console.log(`HSB_272.5 wanden: ${hsbTotal} | als horizontale plaat behandeld (height<1000mm) = ${broken} | normaal = ${ok}`);
console.log(`\nVoorbeelden van de 'omgeslagen' wanden:`);
for(const s of samples){
  console.log(`#${s.id}: extents dx=${Math.round(s.bb.dx*1000)} dy=${Math.round(s.bb.dy*1000)} dz=${Math.round(s.bb.dz*1000)} mm`);
  console.log(`   deriveWallAxes('${up.axis}') → length=${s.ax.length} height=${s.ax.height} thickness=${s.ax.thickness} | lengthAxis=${s.ax.lengthAxis} heightAxis=${s.ax.heightAxis} thicknessAxis=${s.ax.thicknessAxis}`);
  console.log(`   → height(${s.ax.height}) ≈ echte dikte; thickness(${s.ax.thickness}) ≈ echte hoogte  ⇒ wand als platte slab, bekleding op het horizontale vlak`);
}
api.CloseModel(modelID);
