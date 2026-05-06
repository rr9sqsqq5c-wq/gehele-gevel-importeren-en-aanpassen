// ============================================================
// ANALYSE SCRIPT – exterior-classification rapport
// Plak dit in de browser-console terwijl de app geopend is
// en het project geladen is (groepen 1–7+ zichtbaar)
//
// Produceert:
//  1. Globale stats: spaceBoundary / bbox_exit / exterior / interior / ambiguous
//  2. Bucket-analyse: imported / ambiguous / silently-ignored
//  3. Detail per wand voor groepen 1, 5 en 7
//  4. Storey-volume-analyse: zou per-storey bbox de classificatie veranderen?
// ============================================================
(async () => {
'use strict';

// ── helpers (kopie van ifc.js) ────────────────────────────────────────────────
const _OPENING_MIN_WIDTH = 200;

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

function _isOutsideBBox(pt, bbox) {
  return pt.x<bbox.minX||pt.x>bbox.maxX||pt.y<bbox.minY||pt.y>bbox.maxY||pt.z<bbox.minZ||pt.z>bbox.maxZ;
}

function _computeBBoxTestPoints(wo, globalBBox) {
  if (!wo?.wallLengthDir || !globalBBox) return null;
  const upAxis = wo.heightAxis ?? 'y';
  const gu = { x:upAxis==='x'?1:0, y:upAxis==='y'?1:0, z:upAxis==='z'?1:0 };
  const ld = wo.wallLengthDir;
  const cx=ld.y*gu.z-ld.z*gu.y, cy=ld.z*gu.x-ld.x*gu.z, cz=ld.x*gu.y-ld.y*gu.x;
  const cl=Math.sqrt(cx*cx+cy*cy+cz*cz);
  if (cl<=0.01) return null;
  const cA={x:cx/cl,y:cy/cl,z:cz/cl}, cB={x:-cx/cl,y:-cy/cl,z:-cz/cl};
  const wc={x:0,y:0,z:0};
  wc[wo.lengthAxis]=((wo.lengthStart??0)+(wo.lengthEnd??wo.lengthStart??0))/2;
  wc[wo.heightAxis]=((wo.heightStart??0)+(wo.heightEnd??wo.heightStart??0))/2;
  wc[wo.thicknessAxis]=(wo.thicknessStart+(wo.thicknessEnd??wo.thicknessStart+200))/2;
  const D=5000;
  const tA={x:wc.x+cA.x*D,y:wc.y+cA.y*D,z:wc.z+cA.z*D};
  const tB={x:wc.x+cB.x*D,y:wc.y+cB.y*D,z:wc.z+cB.z*D};
  return { wc, cA, cB, tA, tB, aOut:_isOutsideBBox(tA,globalBBox), bOut:_isOutsideBBox(tB,globalBBox) };
}

function _classifyWallExterior(wo, globalBBox, openings) {
  if (!wo) return { isExterior:true, confidence:0.40, reason:'geen wallOrigin → assume exterior' };
  if (wo.spaceBoundaryType==='EXTERNAL') return { isExterior:true,  confidence:0.98, reason:'IfcRelSpaceBoundary=EXTERNAL' };
  if (wo.spaceBoundaryType==='INTERNAL') return { isExterior:false, confidence:0.95, reason:'IfcRelSpaceBoundary=INTERNAL' };

  const pts = _computeBBoxTestPoints(wo, globalBBox);
  if (pts) {
    const { aOut, bOut } = pts;
    if (aOut !== bOut) {
      const hasWin = (openings??[]).some(op=>op.type==='raam'&&(op.breedte??0)>=_OPENING_MIN_WIDTH);
      return { isExterior:true, confidence:hasWin?0.97:0.90, reason:`bbox_exit: aOut=${aOut} bOut=${bOut}${hasWin?' +raam':''}` };
    }
    if (!aOut && !bOut) {
      const winCnt = (openings??[]).filter(op=>op.type==='raam'&&(op.breedte??0)>=_OPENING_MIN_WIDTH).length;
      if (winCnt>=1) return { isExterior:true, confidence:0.70, reason:`bbox_exit_enclosed: beide zijden binnen, maar ${winCnt} raam/ramen` };
      return { isExterior:false, confidence:0.75, reason:'bbox_exit: beide testpunten binnen globalBBox → interior/enclosed' };
    }
    return { isExterior:true, confidence:0.55, reason:'bbox_exit: beide zijden buiten (geïsoleerde wand?)' };
  }

  const hasWin = (openings??[]).some(op=>op.type==='raam'&&(op.breedte??0)>=_OPENING_MIN_WIDTH);
  if (hasWin) return { isExterior:true, confidence:0.65, reason:'opening_hint: raam gevonden, geen bbox data' };
  return { isExterior:true, confidence:0.40, reason:'unknown: geen geometrie of boundary data → assume exterior' };
}

function _shouldImport(cls) {
  return cls.isExterior === true && cls.confidence >= 0.70;
}

function _bucket(cls) {
  if (!cls.isExterior && cls.confidence >= 0.65) return 'INTERIOR';
  if (_shouldImport(cls)) return 'IMPORTED';
  if (cls.confidence >= 0.40) return 'AMBIGUOUS';
  return 'INTERIOR';
}

// ── lees state uit IndexedDB ──────────────────────────────────────────────────
const db = await new Promise((res,rej) => {
  const r = indexedDB.open('ifc-planner', 3);
  r.onsuccess = () => res(r.result);
  r.onerror   = () => rej(r.error);
});
const state = await new Promise((res,rej) => {
  const tx = db.transaction('project-state','readonly');
  const r  = tx.objectStore('project-state').get('last');
  r.onsuccess = () => res(r.result);
  r.onerror   = () => rej(r.error);
});
if (!state) { console.error('Geen project-state gevonden in IndexedDB'); return; }

const groups = state.groups ?? [];
const settingsMap = state.settingsMap ?? {};

// ── verzamel ALLE wanden over alle groepen ────────────────────────────────────
const allWalls = []; // { wall, wallOrigin, openings, groupIdx, groupName, isRefWall }
let gIdx = 0;
for (const g of groups) {
  gIdx++;
  for (const wd of (g.wallsWithRows ?? [])) {
    if (!wd.wall?.wallOrigin) continue;
    allWalls.push({
      wall: wd.wall,
      wallOrigin: wd.wall.wallOrigin,
      openings: wd.wall.openings ?? [],
      groupIdx: gIdx,
      groupName: g.name ?? g.id,
      isRefWall: wd.wall.wallOrigin === g.refWallOrigin,
    });
  }
  if (g.refWallOrigin && !allWalls.find(w=>w.wallOrigin===g.refWallOrigin)) {
    allWalls.push({
      wall: null,
      wallOrigin: g.refWallOrigin,
      openings: [],
      groupIdx: gIdx,
      groupName: g.name ?? g.id,
      isRefWall: true,
    });
  }
}

const allOrigins = allWalls.map(w=>w.wallOrigin);
const globalBBox  = _computeGlobalBBox(allOrigins);

console.log('%c══ EXTERIOR CLASSIFICATION RAPPORT ══','color:#0af;font-weight:bold;font-size:15px');
console.log(`Geladen: ${groups.length} groepen | ${allWalls.length} wanden`);
console.log('globalBBox (mm):', JSON.stringify(globalBBox));

// ── bepaal classificatie per wand (gebruik ifc.js-velden indien aanwezig) ────
const analyzed = allWalls.map(w => {
  const wo = w.wallOrigin;
  // Als de nieuwe code al gelopen heeft (na herimport) zijn de velden aanwezig
  const alreadyClassified = wo.isExterior !== undefined;
  const cls = alreadyClassified
    ? { isExterior: wo.isExterior, confidence: wo.exteriorConfidence, reason: wo.exteriorReason }
    : _classifyWallExterior(wo, globalBBox, w.openings);
  const pts = _computeBBoxTestPoints(wo, globalBBox);
  const resolvedSource = wo.resolvedOutside?.source ?? null;
  const resolvedConf   = wo.resolvedOutside?.confidence ?? null;
  return {
    ...w,
    cls,
    bucket: _bucket(cls),
    pts,
    resolvedSource,
    resolvedConf,
    alreadyClassified,
    spaceBoundaryType: wo.spaceBoundaryType ?? null,
    wallLengthDirOK: !!wo.wallLengthDir,
  };
});

// ── sectie 1: globale statistieken ────────────────────────────────────────────
console.log('\n%c── 1. GLOBALE STATISTIEKEN ──','color:#fa0;font-weight:bold;font-size:13px');

const hasSpaceBoundary   = analyzed.filter(a=>a.spaceBoundaryType !== null);
const bboxExitClassified = analyzed.filter(a=>a.pts && a.pts.aOut !== a.pts.bOut);
const allExterior  = analyzed.filter(a=>a.cls.isExterior === true);
const allInterior  = analyzed.filter(a=>a.cls.isExterior === false);
const ambiguous    = analyzed.filter(a=>a.bucket === 'AMBIGUOUS');
const imported     = analyzed.filter(a=>a.bucket === 'IMPORTED');
const noLengthDir  = analyzed.filter(a=>!a.wallLengthDirOK);
const alreadyClassifiedCount = analyzed.filter(a=>a.alreadyClassified).length;

console.table({
  'Totaal wanden':                          analyzed.length,
  'Al geclassificeerd via ifc.js (herimport)': alreadyClassifiedCount,
  'Met IfcRelSpaceBoundary data':           hasSpaceBoundary.length,
  '  → EXTERNAL':                           hasSpaceBoundary.filter(a=>a.spaceBoundaryType==='EXTERNAL').length,
  '  → INTERNAL':                           hasSpaceBoundary.filter(a=>a.spaceBoundaryType==='INTERNAL').length,
  'Via bbox_exit (aOut XOR bOut)':          bboxExitClassified.length,
  'Zonder wallLengthDir (geen bbox_exit)':  noLengthDir.length,
  'isExterior = true':                      allExterior.length,
  'isExterior = false (interior)':          allInterior.length,
});

// ── sectie 2: bucket-analyse ──────────────────────────────────────────────────
console.log('\n%c── 2. BUCKET-ANALYSE (threshold confidence >= 0.70) ──','color:#fa0;font-weight:bold;font-size:13px');
console.table({
  'IMPORTED  (exterior && conf >= 0.70)':   imported.length,
  'AMBIGUOUS (exterior && 0.40 <= conf < 0.70)': ambiguous.length,
  'INTERIOR  (isExterior === false)':       allInterior.length,
});

if (ambiguous.length > 0) {
  console.warn(`%c⚠ AMBIGUOUS wanden (${ambiguous.length}x) – worden NIET geïmporteerd maar ook NIET gerapporteerd als interior:`,
    'color:#f80;font-weight:bold');
  console.table(ambiguous.map(a=>({
    groep:      a.groupName,
    globalId:   a.wallOrigin.globalId ?? '—',
    confidence: a.cls.confidence,
    reason:     a.cls.reason,
    spaceBoundaryType: a.spaceBoundaryType,
    wallLengthDir: a.wallLengthDirOK,
    aOut: a.pts?.aOut ?? '—',
    bOut: a.pts?.bOut ?? '—',
  })));
}

if (noLengthDir.length > 0) {
  console.warn(`%c⚠ SILENT DISAPPEAR kandidaten – geen wallLengthDir, geen spaceBoundary (${noLengthDir.length}x):`,
    'color:#f44;font-weight:bold');
  console.table(noLengthDir.filter(a=>a.bucket!=='IMPORTED').map(a=>({
    groep:      a.groupName,
    globalId:   a.wallOrigin.globalId ?? '—',
    bucket:     a.bucket,
    confidence: a.cls.confidence,
    reason:     a.cls.reason,
  })));
}

// ── sectie 3: detail groepen 1, 5, 7 ─────────────────────────────────────────
console.log('\n%c── 3. DETAIL GROEPEN 1, 5 EN 7 (ref-wand) ──','color:#fa0;font-weight:bold;font-size:13px');
const targetGroups = [1, 5, 7];
gIdx = 0;
for (const g of groups) {
  gIdx++;
  if (!targetGroups.includes(gIdx)) continue;
  const rwo = g.refWallOrigin;
  if (!rwo) { console.warn(`Groep ${gIdx}: geen refWallOrigin`); continue; }
  const a = analyzed.find(x=>x.wallOrigin===rwo) ?? { cls:_classifyWallExterior(rwo,globalBBox,[]), pts:_computeBBoxTestPoints(rwo,globalBBox) };
  const settings = settingsMap[g.id] ?? {};
  const color = a.bucket==='IMPORTED' ? '#0f0' : a.bucket==='AMBIGUOUS' ? '#f80' : '#f44';

  console.log(`\n%cGROEP ${gIdx} "${g.name ?? g.id}" → ${a.bucket}`, 'color:'+color+';font-weight:bold;font-size:12px');
  console.table({
    globalId:            rwo.globalId ?? '—',
    thicknessAxis:       rwo.thicknessAxis,
    wallLengthDir:       a.wallLengthDirOK ? JSON.stringify(rwo.wallLengthDir) : '✗ ONTBREEKT',
    spaceBoundaryType:   a.spaceBoundaryType ?? 'null (geen IFC-data)',
    isExterior:          a.cls.isExterior,
    exteriorConfidence:  a.cls.confidence,
    exteriorReason:      a.cls.reason,
    bucket:              a.bucket,
    shouldImport:        _shouldImport(a.cls),
    resolvedSource:      a.resolvedSource ?? '(herimport nodig)',
    resolvedConfidence:  a.resolvedConf ?? '—',
    dirFlip:             !!(settings.outsideDirFlip),
  });
  if (a.pts) {
    console.log('  wallCenter:', JSON.stringify(a.pts.wc));
    console.log('  candidateA:', JSON.stringify(a.pts.cA), '| testA:', JSON.stringify(a.pts.tA), '→ outside bbox:', a.pts.aOut);
    console.log('  candidateB:', JSON.stringify(a.pts.cB), '| testB:', JSON.stringify(a.pts.tB), '→ outside bbox:', a.pts.bOut);
  } else {
    console.warn('  Geen bbox-testpunten (wallLengthDir ontbreekt of geen globalBBox)');
  }

  const allWandsInGroup = analyzed.filter(x=>x.groupIdx===gIdx);
  if (allWandsInGroup.length > 1) {
    console.log(`  Alle wanden in groep ${gIdx}:`);
    console.table(allWandsInGroup.map(x=>({
      globalId:   x.wallOrigin.globalId ?? '—',
      isRef:      x.isRefWall,
      isExterior: x.cls.isExterior,
      confidence: x.cls.confidence,
      bucket:     x.bucket,
      aOut:       x.pts?.aOut ?? '—',
      bOut:       x.pts?.bOut ?? '—',
      reason:     x.cls.reason,
    })));
  }
}

// ── sectie 4: storey / volume clustering analyse ──────────────────────────────
console.log('\n%c── 4. STOREY/VOLUME ANALYSE ──','color:#fa0;font-weight:bold;font-size:13px');

// Bekijk de spreiding van wallCenter-coördinaten op de twee assen anders dan hoogte
// om te bepalen of er meerdere clusters zijn
const axes = ['x','y','z'];
for (const ax of axes) {
  const centers = analyzed
    .map(a => {
      const wo = a.wallOrigin;
      if (wo.thicknessAxis === ax) return (wo.thicknessStart + (wo.thicknessEnd ?? wo.thicknessStart+200)) / 2;
      if (wo.lengthAxis === ax)    return ((wo.lengthStart ?? 0) + (wo.lengthEnd ?? wo.lengthStart ?? 0)) / 2;
      return ((wo.heightStart ?? 0) + (wo.heightEnd ?? wo.heightStart ?? 0)) / 2;
    })
    .filter(v=>isFinite(v));
  if (!centers.length) continue;
  const mn = Math.min(...centers), mx = Math.max(...centers);
  console.log(`  Spreiding wall-centers langs ${ax.toUpperCase()}-as: ${Math.round(mn)} mm → ${Math.round(mx)} mm  (bereik: ${Math.round(mx-mn)} mm)`);
}

// Groepeer op thicknessAxis-waarden om potentiële gebouwdelen te detecteren
const thicknessGroups = {};
for (const a of analyzed) {
  const wo = a.wallOrigin;
  const key = wo.thicknessAxis;
  if (!thicknessGroups[key]) thicknessGroups[key] = [];
  thicknessGroups[key].push(wo.thicknessStart);
}
for (const [ax, vals] of Object.entries(thicknessGroups)) {
  const sorted = [...new Set(vals)].sort((a,b)=>a-b);
  const gaps = [];
  for (let i=1;i<sorted.length;i++) {
    const gap = sorted[i]-sorted[i-1];
    if (gap > 2000) gaps.push({ from: sorted[i-1], to: sorted[i], gap: Math.round(gap) });
  }
  if (gaps.length > 0) {
    console.warn(`  %c⚠ MOGELIJKE MEERDERE GEBOUWVOLUMES op ${ax.toUpperCase()}-as: ${gaps.length} kloof(kloven) > 2m gevonden:`, 'color:#f80;font-weight:bold');
    gaps.forEach(g => console.log(`    kloof: ${g.from}mm → ${g.to}mm (${g.gap}mm)`));
    console.warn('  → Per-storey bbox-clustering zou de classificatie hier kunnen verbeteren');
  } else {
    console.log(`  ${ax.toUpperCase()}-as: geen significante volumebreuk gevonden (max kloof < 2m)`);
  }
}

// Zou per-storey bbox de classificatie veranderen?
// Simuleer door apart bbox te berekenen voor eerste/tweede helft wanden op elke as
for (const [ax, vals] of Object.entries(thicknessGroups)) {
  const sorted = [...new Set(vals)].sort((a,b)=>a-b);
  const mid = sorted[Math.floor(sorted.length/2)];
  const half1Origins = analyzed.filter(a=>a.wallOrigin.thicknessStart <= mid).map(a=>a.wallOrigin);
  const half2Origins = analyzed.filter(a=>a.wallOrigin.thicknessStart >  mid).map(a=>a.wallOrigin);
  if (half1Origins.length < 3 || half2Origins.length < 3) continue;
  const bbox1 = _computeGlobalBBox(half1Origins);
  const bbox2 = _computeGlobalBBox(half2Origins);
  let changedCount = 0;
  for (const a of analyzed) {
  const pts1 = _computeBBoxTestPoints(a.wallOrigin, bbox1);
  const pts2 = _computeBBoxTestPoints(a.wallOrigin, bbox2);
  const globalBucket = a.bucket;
  const splitBucket1 = pts1 ? _bucket({ isExterior: pts1.aOut!==pts1.bOut, confidence: 0.90, reason:'' }) : globalBucket;
  const splitBucket2 = pts2 ? _bucket({ isExterior: pts2.aOut!==pts2.bOut, confidence: 0.90, reason:'' }) : globalBucket;
    if (splitBucket1 !== globalBucket || splitBucket2 !== globalBucket) changedCount++;
  }
  if (changedCount > 0) {
    console.warn(`  %c⚠ Per-storey split op ${ax.toUpperCase()}: ${changedCount} wanden zouden anders geclassificeerd worden`, 'color:#f80;font-weight:bold');
  } else {
    console.log(`  Per-storey split op ${ax.toUpperCase()}: classificatie verandert NIET (storey-clustering niet nodig voor deze as)`);
  }
}

// ── conclusie ────────────────────────────────────────────────────────────────
console.log('\n%c── 5. AANBEVELINGEN ──','color:#0af;font-weight:bold;font-size:13px');
const herimportNodig = alreadyClassifiedCount === 0;
if (herimportNodig) {
  console.warn('%c⚠ wallOrigin.isExterior niet gevuld → wanden zijn geïmporteerd vóór de nieuwe code. HERIMPORTEER het IFC-bestand om de echte classificatie te zien. Dit script simuleert de classificatie.', 'color:#f44;font-weight:bold');
} else {
  console.log('%c✓ Classificatie komt uit ifc.js (herimport reeds gedaan).','color:#0f0');
}
if (hasSpaceBoundary.length === 0) {
  console.warn('%c⚠ Geen IfcRelSpaceBoundary data in dit bestand. Geometrische bbox_exit is de primaire methode.','color:#f80;font-weight:bold');
}
if (ambiguous.length > 0) {
  console.warn(`%c⚠ ${ambiguous.length} wanden zijn AMBIGUOUS – worden stil weggelaten bij import (confidence < 0.70 maar isExterior = true). Overweeg UI-toggle "Toon genegeerde wanden".`,'color:#f80;font-weight:bold');
}
if (noLengthDir.length > 0 && noLengthDir.filter(a=>a.bucket!=='IMPORTED').length > 0) {
  console.warn(`%c⚠ ${noLengthDir.filter(a=>a.bucket!=='IMPORTED').length} wanden zonder wallLengthDir kunnen NIET via bbox_exit geclassificeerd worden en verdwijnen stilletjes.`,'color:#f44;font-weight:bold');
}

console.log('\n%c══ KLAAR ══','color:#0af;font-weight:bold;font-size:15px');
})();
