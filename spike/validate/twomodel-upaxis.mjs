// READ-ONLY SPIKE — twee-model import: up-as per model + overall-extents.
// Doel: aantonen of de hand-geselecteerde Groep 1 (BIL-MOO wanden + VIA dakranden)
// een up-as-conflict heeft: hoofdmodel z-up vs dakrand-submodel werkelijk y-up maar
// gedetecteerd als z (geen-wanden fallback). Verbatim detectModelUpAxis (ifc.js:543).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const BB = resolve(__dirname, '../../');
const W = createRequire(pathToFileURL(BB + '/package.json'))(resolve(BB, 'node_modules/web-ifc/web-ifc-api-node.js'));

const FILES = {
  'BIL-MOO (hoofdmodel)': 'C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/BIL-MOO-A-ZZ-PBP.ifc',
  'VIA dakranden':        'C:/Users/MurkAnneKooistraKooi/Downloads/BIL-VIA-L-ZZ-PBP_dakranden.IFC.ifc',
};

const _UPAXIS_CONFIDENCE_HIGH = 0.75, _UPAXIS_CONFIDENCE_LOW = 0.55;
function detectModelUpAxis(api, modelID, wallTypes, { forceOrientation = 'AUTO' } = {}) {
  const _STORY_MIN = 1.2, _STORY_MAX = 6.5, _BUCKET = 0.05;
  const _extentOf = (eid) => {
    let mesh; try { mesh = api.GetFlatMesh(modelID, eid); } catch { return null; }
    if (!mesh || mesh.geometries.size() === 0) return null;
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity,ok=false;
    for (let gi=0; gi<mesh.geometries.size(); gi++){ const placed=mesh.geometries.get(gi); let geom;
      try{ geom=api.GetGeometry(modelID,placed.geometryExpressID); const verts=api.GetVertexArray(geom.GetVertexData(),geom.GetVertexDataSize()); const m=placed.flatTransformation;
        for(let i=0;i<verts.length;i+=6){ const lx=verts[i]??0,ly=verts[i+1]??0,lz=verts[i+2]??0;
          const wx=m[0]*lx+m[4]*ly+m[8]*lz+m[12], wy=m[1]*lx+m[5]*ly+m[9]*lz+m[13], wz=m[2]*lx+m[6]*ly+m[10]*lz+m[14];
          if(wx<minX)minX=wx;if(wx>maxX)maxX=wx;if(wy<minY)minY=wy;if(wy>maxY)maxY=wy;if(wz<minZ)minZ=wz;if(wz>maxZ)maxZ=wz;ok=true; } }
      finally{ geom?.delete(); } }
    return ok?{dx:maxX-minX,dy:maxY-minY,dz:maxZ-minZ}:null;
  };
  const allWallIds=[]; for(const wType of wallTypes){ const v=api.GetLineIDsWithType(modelID,wType); for(let i=0;i<v.size();i++) allWallIds.push(v.get(i)); }
  if(allWallIds.length===0) return { axis:'z', source:'geen-wanden', confidence:0, confidenceLabel:'LAAG', reason:'geen wanden → fallback z', wallCount:0 };
  const _MAX_SCAN=4000, stride=Math.max(1,Math.floor(allWallIds.length/_MAX_SCAN));
  const bY=new Map(),bZ=new Map(); let sumY=0,sumZ=0,scanned=0;
  for(let idx=0; idx<allWallIds.length; idx+=stride){ const e=_extentOf(allWallIds[idx]); if(!e)continue; scanned++; sumY+=e.dy; sumZ+=e.dz;
    if(e.dy>=_STORY_MIN&&e.dy<=_STORY_MAX){const k=Math.round(e.dy/_BUCKET); bY.set(k,(bY.get(k)||0)+1);}
    if(e.dz>=_STORY_MIN&&e.dz<=_STORY_MAX){const k=Math.round(e.dz/_BUCKET); bZ.set(k,(bZ.get(k)||0)+1);} }
  const _modal=(mp)=>{let c=0,v=0; for(const[k,n]of mp) if(n>c){c=n;v=k*_BUCKET;} return {count:c,value:Math.round(v*1000)};};
  const sY=_modal(bY),sZ=_modal(bZ);
  let doorVote=null; { const vote={x:0,y:0,z:0};
    for(const tn of['IFCWINDOW','IFCDOOR']){ let code; try{code=api.GetTypeCodeFromName(tn);}catch{continue;} let vec; try{vec=api.GetLineIDsWithType(modelID,code);}catch{continue;}
      for(let i=0;i<vec.size();i++){ const e=_extentOf(vec.get(i)); if(!e)continue; const mx=Math.max(e.dx,e.dy,e.dz); if(mx===e.dx)vote.x++; else if(mx===e.dy)vote.y++; else vote.z++; } }
    if(vote.y>0||vote.z>0) doorVote=vote.y>=vote.z?'y':'z'; }
  const yC=sY.count,zC=sZ.count,maxC=Math.max(yC,zC),minC=Math.min(yC,zC),sharedWinner=yC>=zC?'y':'z';
  const clearShared=maxC>=3&&(minC===0||maxC>=3*minC);
  let detectedAxis,source,confidence,reason;
  if(doorVote&&!(clearShared&&doorVote!==sharedWinner)){detectedAxis=doorVote;source='ramen/deuren-langeas';confidence=(clearShared&&doorVote===sharedWinner)?0.95:0.8;reason=`deuren→${doorVote}`;}
  else if(clearShared&&doorVote&&doorVote!==sharedWinner){detectedAxis=sharedWinner;source='gedeelde-hoogte(>deur)';confidence=0.6;reason=`wanden ${sharedWinner} (${maxC} vs ${minC})`;}
  else if(clearShared){detectedAxis=sharedWinner;source='gedeelde-verdiepingshoogte';confidence=0.85;reason=`modale hoogte ${sharedWinner} (${maxC} vs ${minC})`;}
  else{detectedAxis='z';source='ambigu→default-z';confidence=0.4;reason=`geen modus (y=${yC},z=${zC})→z`;}
  const confidenceLabel=confidence>=_UPAXIS_CONFIDENCE_HIGH?'HOOG':confidence>=_UPAXIS_CONFIDENCE_LOW?'MATIG':'LAAG';
  return { axis:detectedAxis, source, confidence:+confidence.toFixed(3), confidenceLabel, reason, sharedY:sY, sharedZ:sZ, doorVote, wallCount:allWallIds.length, scanned };
}

const api = new W.IfcAPI();
await api.Init();
const ELEM_TYPES = ['IFCWALL','IFCWALLSTANDARDCASE','IFCPLATE','IFCSLAB','IFCMEMBER','IFCCOVERING','IFCBUILDINGELEMENTPROXY','IFCCURTAINWALL'];

for (const [label, F] of Object.entries(FILES)) {
  console.log(`\n================ ${label} ================`);
  console.log(F);
  const mid = api.OpenModel(new Uint8Array(readFileSync(F)), {});
  // up-as zoals de app hem zou kiezen (wanden-types)
  const up = detectModelUpAxis(api, mid, [W.IFCWALLSTANDARDCASE, W.IFCWALL]);
  // overall-AABB via gespreide steekproef over alle element-types
  let MIN={x:Infinity,y:Infinity,z:Infinity}, MAX={x:-Infinity,y:-Infinity,z:-Infinity};
  const typeCounts={};
  for (const tn of ELEM_TYPES) {
    let code; try{code=api.GetTypeCodeFromName(tn);}catch{continue;}
    let vec; try{vec=api.GetLineIDsWithType(mid,code);}catch{continue;}
    const n=vec.size(); if(n) typeCounts[tn]=n;
    const stride=Math.max(1,Math.floor(n/300));
    for(let i=0;i<n;i+=stride){ const eid=vec.get(i);
      let mesh; try{mesh=api.GetFlatMesh(mid,eid);}catch{continue;} if(!mesh||mesh.geometries.size()===0)continue;
      for(let gi=0;gi<mesh.geometries.size();gi++){ const placed=mesh.geometries.get(gi); let geom;
        try{ geom=api.GetGeometry(mid,placed.geometryExpressID); const verts=api.GetVertexArray(geom.GetVertexData(),geom.GetVertexDataSize()); const m=placed.flatTransformation;
          for(let vi=0;vi<verts.length;vi+=6){ const lx=verts[vi]??0,ly=verts[vi+1]??0,lz=verts[vi+2]??0;
            const wx=m[0]*lx+m[4]*ly+m[8]*lz+m[12], wy=m[1]*lx+m[5]*ly+m[9]*lz+m[13], wz=m[2]*lx+m[6]*ly+m[10]*lz+m[14];
            if(wx<MIN.x)MIN.x=wx; if(wx>MAX.x)MAX.x=wx; if(wy<MIN.y)MIN.y=wy; if(wy>MAX.y)MAX.y=wy; if(wz<MIN.z)MIN.z=wz; if(wz>MAX.z)MAX.z=wz; }
        } finally { geom?.delete(); } }
    }
  }
  const span={x:MAX.x-MIN.x,y:MAX.y-MIN.y,z:MAX.z-MIN.z};
  const extentUp = (span.x<=span.y&&span.x<=span.z)?'x':(span.y<=span.z?'y':'z');
  console.log('  element-types:', JSON.stringify(typeCounts));
  console.log('  detectModelUpAxis (APP):', JSON.stringify({axis:up.axis,source:up.source,conf:up.confidence,label:up.confidenceLabel,wallCount:up.wallCount}));
  console.log(`  overall-extents (m): X=${(span.x).toFixed(1)} Y=${(span.y).toFixed(1)} Z=${(span.z).toFixed(1)}  → extentUp (kleinste) = ${extentUp}`);
  console.log(`  >> APP up='${up.axis}'  vs  geometrie-up='${extentUp}'  → ${up.axis===extentUp?'CONSISTENT':'⚠ CONFLICT'}`);
  api.CloseModel(mid);
}
console.log('\nKlaar.');
