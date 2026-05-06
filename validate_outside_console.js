// ============================================================
// VALIDATIE SCRIPT – bbox-exit outside resolver
// Plak dit in de browser-console terwijl de app geopend is
// en het project geladen is (groepen 1–7+ zichtbaar)
// ============================================================
(async () => {

// --- helpers (kopie van ifc.js) ---
function _computeGlobalBBox(allOrigins) {
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for (const wo of allOrigins) {
    if (!wo) continue;
    const axes = [
      [wo.lengthAxis, wo.lengthStart, wo.lengthEnd ?? wo.lengthStart],
      [wo.heightAxis, wo.heightStart, wo.heightEnd ?? wo.heightStart],
      [wo.thicknessAxis, wo.thicknessStart, wo.thicknessEnd ?? wo.thicknessStart+200],
    ];
    for (const [axis,lo,hi] of axes) {
      if (axis==='x'){minX=Math.min(minX,lo);maxX=Math.max(maxX,hi);}
      if (axis==='y'){minY=Math.min(minY,lo);maxY=Math.max(maxY,hi);}
      if (axis==='z'){minZ=Math.min(minZ,lo);maxZ=Math.max(maxZ,hi);}
    }
  }
  return {minX,maxX,minY,maxY,minZ,maxZ};
}
function _isOutsideBBox(pt,bbox){
  return pt.x<bbox.minX||pt.x>bbox.maxX||pt.y<bbox.minY||pt.y>bbox.maxY||pt.z<bbox.minZ||pt.z>bbox.maxZ;
}
function _resolveOne(wo, allOrigins, globalBBox) {
  if (!wo) return {outsideDir:1,outsidePos:0,source:'none',confidence:0,ambiguous:true};
  const tStart=wo.thicknessStart, tEnd=wo.thicknessEnd??wo.thicknessStart+200;
  const axis=wo.thicknessAxis, localYT=wo.wallInsideThickDir;
  const wc={x:0,y:0,z:0};
  wc[wo.lengthAxis]=((wo.lengthStart??0)+(wo.lengthEnd??wo.lengthStart??0))/2;
  wc[wo.heightAxis]=((wo.heightStart??0)+(wo.heightEnd??wo.heightStart??0))/2;
  wc[wo.thicknessAxis]=(tStart+tEnd)/2;
  let cA=null,cB=null;
  if (wo.wallLengthDir){
    const upAxis=wo.heightAxis??'y';
    const gu={x:upAxis==='x'?1:0,y:upAxis==='y'?1:0,z:upAxis==='z'?1:0};
    const ld=wo.wallLengthDir;
    const cx=ld.y*gu.z-ld.z*gu.y, cy=ld.z*gu.x-ld.x*gu.z, cz=ld.x*gu.y-ld.y*gu.x;
    const cl=Math.sqrt(cx*cx+cy*cy+cz*cz);
    if (cl>0.01){cA={x:cx/cl,y:cy/cl,z:cz/cl};cB={x:-cx/cl,y:-cy/cl,z:-cz/cl};}
  }
  const D=5000;
  let outsideDir=null,source=null,confidence=0,reason='',ambiguous=false;
  let tA=null,tB=null,aOut=false,bOut=false;
  if (cA&&globalBBox){
    tA={x:wc.x+cA.x*D,y:wc.y+cA.y*D,z:wc.z+cA.z*D};
    tB={x:wc.x+cB.x*D,y:wc.y+cB.y*D,z:wc.z+cB.z*D};
    aOut=_isOutsideBBox(tA,globalBBox); bOut=_isOutsideBBox(tB,globalBBox);
    if (aOut&&!bOut){outsideDir=Math.sign(cA[axis])||1;source='bbox_exit_cross_product';confidence=0.95;reason='testA buiten, testB binnen';}
    else if (bOut&&!aOut){outsideDir=Math.sign(cB[axis])||1;source='bbox_exit_cross_product';confidence=0.95;reason='testB buiten, testA binnen';}
    else{ambiguous=true;}
  }
  if (outsideDir==null){
    const ms=wo.matLayerSense,ma=wo.matLayerSetDir;
    if (ms&&ms!=='NOTDEFINED'&&(ma==='AXIS2'||ma==null)&&localYT&&localYT!==0){
      outsideDir=(ms==='NEGATIVE'?-1:1)*localYT;source='material_layer_set';confidence=ambiguous?0.6:0.75;reason=`DirectionSense=${ms}${ambiguous?' (bbox ambiguous)':''}`;
    }
  }
  if (outsideDir==null&&localYT&&localYT!==0){outsideDir=-localYT;source='deprecated_localY';confidence=0.35;ambiguous=true;}
  if (outsideDir==null){
    const ws=(allOrigins??[]).filter(w=>w?.thicknessAxis===axis);
    const bMin=ws.length?Math.min(...ws.map(w=>w.thicknessStart)):tStart;
    const bMax=ws.length?Math.max(...ws.map(w=>w.thicknessEnd??w.thicknessStart+200)):tEnd;
    outsideDir=wc[axis]-(bMin+bMax)/2>=0?1:-1;source='deprecated_bbox';confidence=0.2;ambiguous=true;
  }
  if (!outsideDir) outsideDir=1;
  return {outsideDir,outsidePos:outsideDir<0?tStart:tEnd,source,confidence,
    ambiguous:ambiguous||confidence<0.5,reason,
    _dbg:{wc,cA,cB,tA,tB,aOut,bOut}};
}

// --- lees state uit IndexedDB ---
const db = await new Promise((res,rej)=>{
  const r=indexedDB.open('ifc-planner',3);
  r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
});
const state = await new Promise((res,rej)=>{
  const tx=db.transaction('project-state','readonly');
  const r=tx.objectStore('project-state').get('last');
  r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
});
if (!state){console.error('Geen project-state gevonden in IndexedDB'); return;}

const groups=state.groups??[];
const settingsMap=state.settingsMap??{};
console.log(`%c== BBOX-EXIT OUTSIDE RESOLVER VALIDATIE ==`,'color:#0af;font-weight:bold;font-size:14px');
console.log(`Geladen: ${groups.length} groepen`);

const allWallOrigins=groups.flatMap(g=>(g.wallsWithRows??[]).map(wd=>wd.wall?.wallOrigin).filter(Boolean));
const globalBBox=_computeGlobalBBox(allWallOrigins);
console.log('globalBBox (mm):', globalBBox);

const r3=n=>Math.round(n*1000)/1000;
const fmt=v=>typeof v==='number'?r3(v):JSON.stringify(v);

const targetGroups=[1,5,7,4];
let gIdx=0;
for (const g of groups){
  gIdx++;
  if (!targetGroups.includes(gIdx)) continue;
  const rwo=g.refWallOrigin;
  const settings=settingsMap[g.id]??{};
  const dirFlip=!!(settings.outsideDirFlip);
  const res=rwo?_resolveOne(rwo,allWallOrigins,globalBBox):{source:'no rwo'};
  const d=res._dbg??{};
  const grpOutDir=dirFlip?-res.outsideDir:res.outsideDir;
  const correct=res.source==='bbox_exit_cross_product'&&res.confidence>=0.95&&!res.ambiguous;

  const color=correct?'#0f0':gIdx===4?'#08f':'#f44';
  const label=gIdx===4?'(controle)':'';
  console.log(`\n%cGROEP ${gIdx} "${g.name??g.id}" ${label}`,'color:'+color+';font-weight:bold;font-size:12px');
  console.table({
    groupId:       g.id,
    wallId:        rwo?.globalId??'—',
    thicknessAxis: rwo?.thicknessAxis??'—',
    sourceUsed:    res.source,
    confidence:    res.confidence,
    ambiguous:     res.ambiguous,
    reason:        res.reason,
    outsideDir:    res.outsideDir,
    outsidePos:    res.outsidePos+' mm',
    dirFlip:       dirFlip,
    grpOutDir_fin: grpOutDir,
    CORRECT:       correct?'✓ JA':'✗ NEE',
  });
  if (d.cA){
    console.log('  wallCenter:',JSON.stringify(d.wc));
    console.log('  candidateA:',JSON.stringify(d.cA),'| tA:',JSON.stringify(d.tA),'→ outside?',d.aOut);
    console.log('  candidateB:',JSON.stringify(d.cB),'| tB:',JSON.stringify(d.tB),'→ outside?',d.bOut);
  }
  if (!correct){
    if (d.aOut===d.bOut){
      if (d.aOut)  console.warn(`  !! PROBLEEM: beide BUITEN bbox → globalBBox te smal / wand buiten gebouw`);
      else         console.warn(`  !! PROBLEEM: beide BINNEN bbox → binnenwand of globalBBox te groot`);
    }
    if (!rwo?.wallLengthDir) console.warn(`  !! PROBLEEM: wallLengthDir ontbreekt → cross-product niet mogelijk`);
    if (dirFlip) console.warn(`  !! dirFlip=true: de gekozen buitenzijde wordt nog omgekeerd!`);
    if (res.source!=='bbox_exit_cross_product') console.warn(`  !! Gevallen terug op: ${res.source}`);
  }
}
console.log('\n%c== KLAAR ==','color:#0af;font-weight:bold');
})();
