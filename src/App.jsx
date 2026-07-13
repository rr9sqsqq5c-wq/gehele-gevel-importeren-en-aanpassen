import { useState, useMemo, useCallback, useEffect, useRef, lazy, Suspense, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { scanIfcWallTypes, parseIfc, exportGroupsToIfc, warmupWebIFC, parseIfcGridLines, scanIfcElementTypes, parseIfcZoneElements, parseIfcSparingElements, scanIfcSparingTypes, runGeometryValidation, resolveOutsideDirections } from './lib/ifc.js';
import { sparingRectsForGroup, clipRowsAroundRects } from './lib/sparingElements.js';
import { runNewEngineAdapter } from './lib/newEngineRunner.js';
import { isNewOpeningDerivation, isBestFitGroups, isSelfContainedProjects, isCornerButtMode, isCorner85, isRestoreUpAxis, isWildverbandKoppelstrip, isFeatureZones, isGroothuisWildverband, isGroothuisWildverband2, isStableGroupCamera, isDropOversizedOpenings, isSyntheticWall, isMalRecept, isPlanBridge, isSparingElementen, isShowKozijnen, isOpeningFromKozijn, isOutsideDirSync, FLAG_REGISTRY, getFlag, setStoredFlag } from './lib/featureFlags.js';
import { createPlanBridge } from './lib/planBridge.js';
import { buildStripZoneRegions, hasPenants, getActiveStripZones } from './lib/zoneRegions.js';
import { applyProjectedOpenings } from './lib/openingDerivation.js';
import { buildBestFitFacadePattern } from './lib/facadePlane.js';
import { reset as resetCoordinates, restoreProjectInfo, registerIfcContext } from './lib/projectCoordinates.js';
import handleidingMd from '../HANDLEIDING.md?raw';
warmupWebIFC();
import { saveIfcFile, loadSavedIfcFile, deleteSavedIfcFile, saveParsedWalls, loadParsedWalls, clearParsedWalls, saveFileHandle, loadFileHandle, deleteFileHandle, supportsFileSystemAccess, saveProjectState, loadProjectState, clearProjectState, saveSourceIfc, loadSourceIfc } from './lib/storage.js';
import { detectAdjacencies, detectAdjacenciesAsync, buildConnectedComponents, sortWallsInComponent } from './lib/adjacency.js';
import { buildGroupPattern, buildFacePattern, buildSymmetricFacePattern, buildCenteredFacePattern, buildMirroredFacePattern, getGroupPatternLogic, buildFullGroupFacadePattern } from './lib/pattern.js';
import { BATTEN_CATALOG, BASISPLAAT_CATALOG, STEENSTRIP_CATALOG } from './lib/battens.js';
import { buildFacadeZones, panelizeZone, generateBattenPositions, computeEffectiveBasePanel, generateMoldRecipe, generateMoldDXF, generateCombinedMoldPrintHTML, getMoldTemplates, buildWildverbandPanelGrid, moldIdLabel } from './lib/panelization.js';
import { buildTruthRows } from './lib/wildverbandKoppelstrip.js';
import { buildGroothuisRows } from './lib/groothuisWildverband.js';
import { buildGroothuis2Rows } from './lib/groothuisWildverband2.js';
import { makeSyntheticWall } from './lib/syntheticWall.js';
import { openingXRangesAtY, polyXRangesAtY } from './lib/geometry.js';
import { SLIMFORT_DEFAULTS, CONCRETE_FACE_CLADDING_DEFAULTS, generateSlimFortGrid, generateSlimFortFaces, applyCornerTrimToSlimFort, computeFaceLongRanges, applyRangesToGrid, getSlimFortDepths } from './lib/slimfort.js';
import { detectBuildingEnvelope, extractVisibleConcreteFaces, buildAutoSlimFortSettings } from './lib/envelope.js';
import { computeGroupStitching } from './lib/stitching.js';
import { decomposeAndConnect, wallSegmentToSlimFortFaceDescriptor, getPrimaryWallSegments } from './lib/wallDecomposition.js';
const Viewer3D = lazy(() => import('./Viewer3D.jsx').then((m) => ({ default: m.Viewer3D })));
const View2D = lazy(() => import('./View2D.jsx').then((m) => ({ default: m.View2D })));
const Werktekening = lazy(() => import('./Werktekening.jsx').then((m) => ({ default: m.Werktekening })));
const Uittrekstaat = lazy(() => import('./Uittrekstaat.jsx').then((m) => ({ default: m.Uittrekstaat })));
const WildverbandPanelView = lazy(() => import('./WildverbandPanel.jsx').then((m) => ({ default: m.WildverbandPanel })));
const SlimFortWerktekening = lazy(() => import('./SlimFortWerktekening.jsx').then((m) => ({ default: m.SlimFortWerktekening })));
const DetailBoek = lazy(() => import('./DetailBoek.jsx').then((m) => ({ default: m.DetailBoek })));

const DEFAULT_MATERIAL = { steenL: 210, steenH: 50, lint: 12, stoot: 10, brickWeightM2: 40 };
// FASE 2b stompe-butt (achter vlag corner85): aansluitende strip/paneel 8 mm vóór de
// aanzicht-strip-achterkant; aansluitende lat 5 mm vrij van de aanzicht-wand.
const CORNER85_STRIP_GAP = 8; // mm — = voegW in HoekAansluitDetail (App.jsx:699)
const CORNER85_LAT_GAP = 5;   // mm

function computeCornerOffsets(mainSettings, secondarySettings) {
  const secMat = secondarySettings.material ?? DEFAULT_MATERIAL;
  const sv_sec = secMat.stoot ?? 10;
  const stripDikte_sec = secondarySettings.brickDepth ?? 20;
  const paneelDikte_sec = secondarySettings.panelen?.enabled ? (secondarySettings.panelen?.dikte ?? 8) : 0;
  const latDikte_sec = secondarySettings.latten?.enabled ? (secondarySettings.latten?.dikte ?? 28) : 0;
  const d_sec = latDikte_sec + paneelDikte_sec + stripDikte_sec;
  return {
    main: {
      stripsExtend: d_sec,
      panelsExtend: latDikte_sec,
      lattenExtend: latDikte_sec,
    },
    secondary: {
      stripsTrim: sv_sec,
      panelsTrim: sv_sec,
      lattenTrim: 10,
    },
  };
}

function cornerConfigKey(gA, gB) {
  return [gA, gB].sort().join('__X__');
}

function detectSecondaryCornerEnd(secWalls, mainWalls, TOL = 150) {
  for (const mW of mainWalls) {
    const woM = mW.wallOrigin;
    if (!woM) continue;
    const mLenEnd = woM.lengthStart + (mW.length ?? 0);
    const mThkEnd = woM.thicknessEnd ?? (woM.thicknessStart + (mW.thickness ?? 300));
    for (const sW of secWalls) {
      const woS = sW.wallOrigin;
      if (!woS) continue;
      if (woS.lengthAxis === woM.lengthAxis) continue;
      if (woS.lengthAxis !== woM.thicknessAxis) continue;
      const sThkEnd = woS.thicknessEnd ?? (woS.thicknessStart + (sW.thickness ?? 300));
      const sLenEnd = woS.lengthStart + (sW.length ?? 0);
      const ovLen = Math.min(sThkEnd, mLenEnd) - Math.max(woS.thicknessStart, woM.lengthStart);
      if (ovLen <= -TOL) continue;
      const ovDep = Math.min(sLenEnd, mThkEnd) - Math.max(woS.lengthStart, woM.thicknessStart);
      if (ovDep <= -TOL) continue;
      const secCenterOnMainLen = (woS.thicknessStart + sThkEnd) / 2;
      const mainLenCenter = (woM.lengthStart + mLenEnd) / 2;
      return secCenterOnMainLen < mainLenCenter ? 'left' : 'right';
    }
  }
  return null;
}

function detectMainInFront(secWalls, mainWalls, TOL = 50) {
  for (const mW of mainWalls) {
    const woM = mW.wallOrigin;
    if (!woM) continue;
    const mThkEnd = woM.thicknessEnd ?? (woM.thicknessStart + (mW.thickness ?? 300));
    const mainThkMin = Math.min(woM.thicknessStart, mThkEnd);
    const mainThkMax = Math.max(woM.thicknessStart, mThkEnd);
    for (const sW of secWalls) {
      const woS = sW.wallOrigin;
      if (!woS) continue;
      if (woS.lengthAxis === woM.lengthAxis) continue;
      if (woS.lengthAxis !== woM.thicknessAxis) continue;
      const sLenEnd = woS.lengthStart + (sW.length ?? 0);
      const secLenMin = Math.min(woS.lengthStart, sLenEnd);
      const secLenMax = Math.max(woS.lengthStart, sLenEnd);
      const secSpansMainThk = secLenMin <= mainThkMin + TOL && secLenMax >= mainThkMax - TOL;
      return !secSpansMainThk;
    }
  }
  return true;
}

function computePenantCornerInfo(myGroup, adjGroup, wallMap, penantBreedte, side) {
  if (!myGroup || !adjGroup) return null;
  const myWalls = (myGroup.wallIds ?? []).map((id) => wallMap[id]).filter((w) => w && w.wallOrigin);
  const adjWalls = (adjGroup.wallIds ?? []).map((id) => wallMap[id]).filter((w) => w && w.wallOrigin);
  if (!myWalls.length || !adjWalls.length) return null;
  let refMy = null, refAdj = null;
  for (const wa of myWalls) {
    for (const wb of adjWalls) {
      const woA = wa.wallOrigin, woB = wb.wallOrigin;
      if (woA.lengthAxis === woB.lengthAxis) continue;
      if (woA.lengthAxis !== woB.thicknessAxis) continue;
      if (woA.heightAxis !== woB.heightAxis) continue;
      refMy = wa; refAdj = wb;
      break;
    }
    if (refMy) break;
  }
  if (!refMy || !refAdj) return null;
  const woA = refMy.wallOrigin;
  const woB = refAdj.wallOrigin;
  const sameAxisMy = myWalls.filter((w) => w.wallOrigin.lengthAxis === woA.lengthAxis);
  const myLenStart = Math.min(...sameAxisMy.map((w) => w.wallOrigin.lengthStart));
  const myLenEnd = Math.max(...sameAxisMy.map((w) => w.wallOrigin.lengthStart + (w.length ?? 0)));
  const groupWidth = myLenEnd - myLenStart;
  const bThk0 = woB.thicknessStart;
  const bThk1 = woB.thicknessEnd ?? (bThk0 + (refAdj.thickness ?? 300));
  const bThkOuter = woB.resolvedOutside?.outsidePos;
  let cornerX_model;
  if (bThkOuter != null) {
    cornerX_model = bThkOuter;
  } else if (side === 'left') {
    cornerX_model = Math.abs(Math.min(bThk0, bThk1) - myLenStart) <= Math.abs(Math.max(bThk0, bThk1) - myLenStart)
      ? Math.min(bThk0, bThk1) : Math.max(bThk0, bThk1);
  } else {
    cornerX_model = Math.abs(Math.max(bThk0, bThk1) - myLenEnd) <= Math.abs(Math.min(bThk0, bThk1) - myLenEnd)
      ? Math.max(bThk0, bThk1) : Math.min(bThk0, bThk1);
  }
  const cornerX_local = cornerX_model - myLenStart;
  const penantBreedteM = Math.max(1, penantBreedte || 400);
  const penant_x = side === 'left'
    ? Math.max(0, Math.round(cornerX_local))
    : Math.max(0, Math.round(cornerX_local - penantBreedteM));
  const myOutsidePos = woA.resolvedOutside?.outsidePos ?? woA.thicknessStart;
  const bLenStart = woB.lengthStart;
  const bLenEnd = woB.lengthEnd ?? (bLenStart + (refAdj.length ?? 0));
  const adjCornerEnd = Math.abs(bLenStart - myOutsidePos) <= Math.abs(bLenEnd - myOutsidePos) ? 'left' : 'right';
  return { cornerX_model, cornerX_local, penant_x, groupWidth, myLenStart, adjCornerEnd };
}

function detectCornerAdjacentGroups(myGroupId, groups, wallMap, TOL = 150) {
  const myGroup = groups.find((g) => g.id === myGroupId);
  if (!myGroup) return new Set();
  const myWalls = myGroup.wallIds.map((id) => wallMap[id]).filter(Boolean);
  if (!myWalls.length || !myWalls[0]?.wallOrigin) return null;
  const result = new Set();
  for (const other of groups) {
    if (other.id === myGroupId) continue;
    const otherWalls = other.wallIds.map((id) => wallMap[id]).filter(Boolean);
    if (!otherWalls.length || !otherWalls[0]?.wallOrigin) continue;
    let found = false;
    outer: for (const wa of myWalls) {
      const woA = wa.wallOrigin;
      if (!woA) continue;
      const aLenEnd = woA.lengthEnd ?? (woA.lengthStart + (wa.length ?? 0));
      const aThkEnd = woA.thicknessEnd ?? (woA.thicknessStart + 500);
      for (const wb of otherWalls) {
        const woB = wb.wallOrigin;
        if (!woB) continue;
        if (woA.lengthAxis === woB.lengthAxis) continue;
        if (woA.heightAxis !== woB.heightAxis) continue;
        if (woA.lengthAxis !== woB.thicknessAxis) continue;
        if (woA.thicknessAxis !== woB.lengthAxis) continue;
        const bLenEnd = woB.lengthEnd ?? (woB.lengthStart + (wb.length ?? 0));
        const bThkEnd = woB.thicknessEnd ?? (woB.thicknessStart + 500);
        const aStartInBThk = woA.lengthStart >= woB.thicknessStart - TOL && woA.lengthStart <= bThkEnd + TOL;
        const aEndInBThk   = aLenEnd        >= woB.thicknessStart - TOL && aLenEnd        <= bThkEnd + TOL;
        if (!aStartInBThk && !aEndInBThk) continue;
        const overlapLen = Math.min(aThkEnd, bLenEnd) - Math.max(woA.thicknessStart, woB.lengthStart);
        if (overlapLen > -TOL) {
          found = true;
          break outer;
        }
      }
    }
    if (found) result.add(other.id);
  }
  return result;
}
const DEFAULT_VERBAND = 'halfsteens';

function computeGroupCornerTrims(groupId, cornerConfigs, groups, wallMap, settingsMap, TOL = 150) {
  let trimLeft = 0, trimRight = 0, extendLeft = 0, extendRight = 0;
  let lattenTrimLeft = 0, lattenTrimRight = 0, lattenExtendLeft = 0, lattenExtendRight = 0;
  let panelsTrimLeft = 0, panelsTrimRight = 0, panelsExtendLeft = 0, panelsExtendRight = 0;
  const myGroup = groups.find((g) => g.id === groupId);
  if (!myGroup) return { trimLeft, trimRight, extendLeft, extendRight, lattenTrimLeft, lattenTrimRight, lattenExtendLeft, lattenExtendRight, panelsTrimLeft, panelsTrimRight, panelsExtendLeft, panelsExtendRight };
  const myWalls = myGroup.wallIds.map((id) => wallMap[id]).filter(Boolean).filter((w) => !!w.wallOrigin);
  if (!myWalls.length) return { trimLeft, trimRight, extendLeft, extendRight, lattenTrimLeft, lattenTrimRight, lattenExtendLeft, lattenExtendRight, panelsTrimLeft, panelsTrimRight, panelsExtendLeft, panelsExtendRight };

  const numConfigs = Object.keys(cornerConfigs).length;
  const _dbg = (msg, ...args) => console.log('[cornerTrims]', groupId, msg, ...args);
  if (numConfigs === 0) { _dbg('no cornerConfigs'); return { trimLeft, trimRight, extendLeft, extendRight, lattenTrimLeft, lattenTrimRight, lattenExtendLeft, lattenExtendRight, panelsTrimLeft, panelsTrimRight, panelsExtendLeft, panelsExtendRight }; }

  const applySecondary = (side, offsets) => {
    if (side === 'left') {
      trimLeft      = Math.max(trimLeft,      offsets.secondary.stripsTrim);
      lattenTrimLeft  = Math.max(lattenTrimLeft,  offsets.secondary.lattenTrim);
      panelsTrimLeft  = Math.max(panelsTrimLeft,  offsets.secondary.panelsTrim);
    } else {
      trimRight     = Math.max(trimRight,     offsets.secondary.stripsTrim);
      lattenTrimRight = Math.max(lattenTrimRight, offsets.secondary.lattenTrim);
      panelsTrimRight = Math.max(panelsTrimRight, offsets.secondary.panelsTrim);
    }
  };
  const applyMain = (side, offsets) => {
    if (side === 'left') {
      extendLeft      = Math.max(extendLeft,      offsets.main.stripsExtend);
      lattenExtendLeft  = Math.max(lattenExtendLeft,  offsets.main.lattenExtend);
      panelsExtendLeft  = Math.max(panelsExtendLeft,  offsets.main.panelsExtend);
    } else {
      extendRight     = Math.max(extendRight,     offsets.main.stripsExtend);
      lattenExtendRight = Math.max(lattenExtendRight, offsets.main.lattenExtend);
      panelsExtendRight = Math.max(panelsExtendRight, offsets.main.panelsExtend);
    }
  };

  for (const [cfgKey, cfg] of Object.entries(cornerConfigs)) {
    const isMain = cfg.mainGroupId === groupId;
    const isSecondary = cfg.secondaryGroupId === groupId;
    if (!isMain && !isSecondary) continue;

    const otherId = isMain ? cfg.secondaryGroupId : cfg.mainGroupId;
    const otherGroup = groups.find((g) => g.id === otherId);
    if (!otherGroup) { _dbg('cfg', cfgKey, 'otherGroup not found:', otherId); continue; }
    const otherWalls = otherGroup.wallIds.map((id) => wallMap[id]).filter(Boolean).filter((w) => !!w.wallOrigin);
    if (!otherWalls.length) { _dbg('cfg', cfgKey, 'no otherWalls with wallOrigin'); continue; }

    const mainSettings = settingsMap[cfg.mainGroupId] ?? {};
    const secSettings  = settingsMap[cfg.secondaryGroupId] ?? {};
    const offsets = computeCornerOffsets(mainSettings, secSettings);
    _dbg('cfg', cfgKey, 'isMain:', isMain, 'offsets:', offsets);

    const snapTL = trimLeft, snapTR = trimRight, snapEL = extendLeft, snapER = extendRight;

    for (const wa of myWalls) {
      const woA = wa.wallOrigin;
      const aLenEnd = woA.lengthEnd ?? (woA.lengthStart + (wa.length ?? 0));
      const aThkEnd = woA.thicknessEnd ?? (woA.thicknessStart + 500);

      for (const wb of otherWalls) {
        const woB = wb.wallOrigin;
        if (woA.lengthAxis === woB.lengthAxis) { _dbg('skip same lengthAxis', woA.lengthAxis); continue; }
        if (woA.lengthAxis !== woB.thicknessAxis) { _dbg('skip: A.lengthAxis', woA.lengthAxis, '!= B.thicknessAxis', woB.thicknessAxis); continue; }

        const bThkEnd = woB.thicknessEnd ?? (woB.thicknessStart + 500);
        const bLenEnd = woB.lengthEnd ?? (woB.lengthStart + (wb.length ?? 0));
        const aStartInBThk = woA.lengthStart >= woB.thicknessStart - TOL && woA.lengthStart <= bThkEnd + TOL;
        const aEndInBThk   = aLenEnd        >= woB.thicknessStart - TOL && aLenEnd        <= bThkEnd + TOL;
        const overlapLen = Math.min(aThkEnd, bLenEnd) - Math.max(woA.thicknessStart, woB.lengthStart);
        _dbg('wall pair: aStartInBThk', aStartInBThk, 'aEndInBThk', aEndInBThk, 'overlapLen', overlapLen,
          'woA:', { la: woA.lengthAxis, ls: woA.lengthStart, le: aLenEnd, ts: woA.thicknessStart, te: aThkEnd },
          'woB:', { la: woB.lengthAxis, ta: woB.thicknessAxis, ts: woB.thicknessStart, te: bThkEnd, ls: woB.lengthStart, le: bLenEnd });
        if (overlapLen <= -TOL) { _dbg('skip: overlapLen too small'); continue; }

        if (isSecondary) {
          if (aStartInBThk) applySecondary('left',  offsets);
          if (aEndInBThk)   applySecondary('right', offsets);
        } else {
          if (aStartInBThk) applyMain('left',  offsets);
          if (aEndInBThk)   applyMain('right', offsets);
          if (!aStartInBThk && !aEndInBThk) {
            const bLenStartInAThk = woB.lengthStart >= woA.thicknessStart - TOL && woB.lengthStart <= aThkEnd + TOL;
            const bLenEndInAThk   = bLenEnd         >= woA.thicknessStart - TOL && bLenEnd         <= aThkEnd + TOL;
            if (bLenStartInAThk || bLenEndInAThk) {
              const bThkCenter = (woB.thicknessStart + bThkEnd) / 2;
              const aLenCenter = (woA.lengthStart + aLenEnd) / 2;
              _dbg('reverse check hit: bThkCenter', bThkCenter, 'aLenCenter', aLenCenter);
              if (bThkCenter <= aLenCenter) applyMain('left',  offsets);
              else                          applyMain('right', offsets);
            }
          }
        }
      }
    }

    if (trimLeft === snapTL && trimRight === snapTR && extendLeft === snapEL && extendRight === snapER) {
      _dbg('cfg', cfgKey, 'geen muurparen gevonden — probeer bounding-box fallback');
      const refWall = myWalls.reduce((best, w) => (w.length ?? 0) > (best.length ?? 0) ? w : best);
      const refWo = refWall.wallOrigin;
      const refLenAxis = refWo.lengthAxis;
      const refLen0 = refWo.lengthStart;
      const refLen1 = refWo.lengthEnd ?? (refWo.lengthStart + (refWall.length ?? 0));
      const perpBWalls = otherWalls.filter((wb) => wb.wallOrigin.lengthAxis !== refLenAxis && wb.wallOrigin.thicknessAxis === refLenAxis);
      if (perpBWalls.length > 0) {
        const bAvgCenter = perpBWalls.reduce((sum, wb) => {
          const woB = wb.wallOrigin;
          return sum + (woB.thicknessStart + (woB.thicknessEnd ?? woB.thicknessStart + 500)) / 2;
        }, 0) / perpBWalls.length;
        const distToStart = Math.abs(bAvgCenter - refLen0);
        const distToEnd = Math.abs(bAvgCenter - refLen1);
        _dbg('fallback bAvgCenter', bAvgCenter, 'refLen0', refLen0, 'refLen1', refLen1, 'distToStart', distToStart, 'distToEnd', distToEnd);
        if (isSecondary) {
          if (distToStart <= distToEnd) applySecondary('left',  offsets);
          else                          applySecondary('right', offsets);
        } else {
          if (distToStart <= distToEnd) applyMain('left',  offsets);
          else                          applyMain('right', offsets);
        }
      } else {
        console.warn('[cornerTrims]', groupId, 'cfg', cfgKey, 'GEEN loodrechte muren gevonden — hoekdetectie mislukt (controleer asoriëntaties in IFC)');
      }
    }
  }
  _dbg('result:', { trimLeft, trimRight, extendLeft, extendRight, lattenTrimLeft, lattenTrimRight, lattenExtendLeft, lattenExtendRight });
  return { trimLeft, trimRight, extendLeft, extendRight, lattenTrimLeft, lattenTrimRight, lattenExtendLeft, lattenExtendRight, panelsTrimLeft, panelsTrimRight, panelsExtendLeft, panelsExtendRight };
}

function endExtensionsToTrims(ee) {
  const l = ee?.left  ?? {};
  const r = ee?.right ?? {};
  return {
    trimLeft:          (l.strips  ?? 0) < 0 ? -(l.strips)  : 0,
    trimRight:         (r.strips  ?? 0) < 0 ? -(r.strips)  : 0,
    extendLeft:        (l.strips  ?? 0) > 0 ?  (l.strips)  : 0,
    extendRight:       (r.strips  ?? 0) > 0 ?  (r.strips)  : 0,
    lattenTrimLeft:    (l.battens ?? 0) < 0 ? -(l.battens) : 0,
    lattenTrimRight:   (r.battens ?? 0) < 0 ? -(r.battens) : 0,
    lattenExtendLeft:  (l.battens ?? 0) > 0 ?  (l.battens) : 0,
    lattenExtendRight: (r.battens ?? 0) > 0 ?  (r.battens) : 0,
    panelsTrimLeft:    (l.panels  ?? 0) < 0 ? -(l.panels)  : 0,
    panelsTrimRight:   (r.panels  ?? 0) < 0 ? -(r.panels)  : 0,
    panelsExtendLeft:  (l.panels  ?? 0) > 0 ?  (l.panels)  : 0,
    panelsExtendRight: (r.panels  ?? 0) > 0 ?  (r.panels)  : 0,
  };
}

const APP_VERSION = '1.12';
const CHANGELOG = [
  {
    version: '1.12',
    date: '2026-04-21',
    changes: [
      'MAL-A en MAL-B PDF export toegevoegd: opent printbaar SVG-venster (A0 liggend), automatisch printdialoog',
      'SVG-maltekening bevat: kleurgecodeerde sleuven (geel=vol, oranje=kop, rood=rest), Ø6mm gaten, maatvoering, legenda en titelblok',
      'Code gerefactored: gedeelde _moldGeometry() helper voor DXF en SVG/PDF generatoren',
    ],
  },
  {
    version: '1.11',
    date: '2026-04-21',
    changes: [
      'MAL-A en MAL-B DXF export toegevoegd: fabricage-tekening voor metaalzetterij (staalplaat 2mm)',
      'DXF bevat: buitencontour (FRAME), steensleuven (SLOTS, +1.5mm speling rondom), bevestigingsgaten (HOLES, r=3mm), rijlabels en titelbalk',
      'Sleuvenposities gebaseerd op metselverband: halfsteens-kop, vol en reststrippen correct gepositioneerd',
      'MAL-A = rijen 1-3 (globalRowBase 0), MAL-B = rijen 4-6 (globalRowBase 3); wildverband offsets per mal afzonderlijk',
      'DXF-lagen: FRAME (wit), GUIDE (grijs), SLOTS (geel), HOLES (rood), LABELS (groen), TITLE (wit)',
    ],
  },
  {
    version: '1.10',
    date: '2026-04-21',
    changes: [
      'Mal recept CSV export toegevoegd: per paneel rijen totaal, rijen per maldoorgang en slede-posities',
      'Mal-afmetingen instelbaar per groep (mal lengte en mal hoogte) onder Panelen instellingen',
      'Mal hoogte default 270mm, mal lengte default 3400mm; rijen per mal = vloer(malHoogte / lagenmaat)',
    ],
  },
  {
    version: '1.9',
    date: '2026-04-20',
    changes: [
      'Wildverband toegevoegd als metselverband: 6-rij herhalend patroon (2 mallen × 3 rijen)',
      'Latten en panelen: nieuwe module-gebaseerde logica — latten exact in lintvoegmidden, lopen over volledige gevelbreedte (niet geclipped door sparingen)',
      'Panelen: X-grenzen = constructieve grenzen (sparingen, penanten) + targetbreedte raster — niet meer alle stootvoegen',
    ],
  },
  {
    version: '1.8',
    date: '2026-04-20',
    changes: [
      'Paneeloptimalisatie: nieuw scoringsmodel — prioriteit: min. panelen → ~1m² per paneel → min. zaagverlies basisplaat → min. unieke maten',
      'Doelmaat paneel op basis van baksteen-grid: 5 strekken + 4 stootvoegen breed, 14 lagen + 13 lintvoegen hoog (per groep materiaal)',
      'Paneellogica vastgelegd onder "Logica-regels" modal (nieuw tabblad Panelen — Optimalisatielogica)',
      'Gelijke groepen zoeken: knop in groepenpaneel — vindt clusters van identieke groepen op basis van afmetingen en sparingen, optie om te koppelen',
    ],
  },
  {
    version: '1.7',
    date: '2026-04-20',
    changes: [
      '3D viewer gemigreerd naar THREE.InstancedMesh (imperatief via useEffect) — elimineert React reconciliation problemen, vermindert draw calls',
      'Zone brickH bug opgelost: zones met staand_tegelverband gebruiken nu steenL als rijhoogte in 3D viewer',
    ],
  },
  {
    version: '1.6',
    date: '2026-04-20',
    changes: [
      'Penant zij-strip clipping gecorrigeerd: linker- en rechterzijde gebruiken nu dezelfde logica (beide 10mm clip aan de achterkant/binnenkant, naturlijke voeg aan de voorzijde)',
    ],
  },
  {
    version: '1.5',
    date: '2026-04-20',
    changes: [
      '3D viewer toont nu zone-kleuren per zone (i.p.v. 1 kleur per groep)',
      '2D viewer zone-grenzen uitgebreid met brickDepth voor correcte inkijk-preventie kleur',
      'IFC export, 2D viewer en 3D viewer tonen nu dezelfde zone-indeling (consistent)',
    ],
  },
  {
    version: '1.4',
    date: '2026-04-20',
    changes: [
      'Zone-grenzen uitgebreid met brickDepth de penant in (inkijk-preventie zone kleur/patroon correct)',
      'Strips in vlakke gevel achter de penant (pX → pX+brickD) krijgen nu correct de kleur/patroon van de aangrenzende zone i.p.v. de algemene groepkleur',
    ],
  },
  {
    version: '1.3',
    date: '2026-04-20',
    changes: [
      'Logica-regels modal toegevoegd (knop "? Regels" in toolbar)',
      'Versienummer en wijzigingenlog toegevoegd aan de app',
      'Strip-masking inkijk-preventie: strips lopen tot pX + brickDepth achter de penant zij-strip (hersteld in 3D viewer én IFC export)',
    ],
  },
  {
    version: '1.2',
    date: '2026-04-19',
    changes: [
      'Zone-specifieke strip export (stripBatches) compleet in ifc.js',
      'Staand tegelverband: correcte extrusiehoogte (steenL) en stapelverband (geen offset)',
      'Penant zij-strips hersteld als vlakke gevel strips in IFC export',
      'Flat facade masking aangepast naar [pX, pX+pB] (volledige penant-breedte)',
      'Paneel kleur penant gelijkgesteld aan paneel kleur vlakke gevel',
      'Penant hoogte begrensd tot max hoogte',
    ],
  },
  {
    version: '1.1',
    date: '2026-04-18',
    changes: [
      'Horizontale latten niet geclipped bij penant (verticale latten worden erop gemonteerd)',
      'penShift formule gecorrigeerd: 10mm gap achter, 6mm voeg voor',
      'penSideD correct: diepte zij-arm penant',
      'Panelen boven penant geclipped (penant-breedte × max hoogte)',
      'Verticale latten voor horizontale latten geplaatst (effectiveLatDepth)',
      'Zone-instellingen per zone kopieerbaar naar andere zones',
    ],
  },
  {
    version: '1.0',
    date: '2026-04-15',
    changes: [
      'IFC import en parsing van wandelementen',
      '3D viewer (react-three-fiber) en 2D gevelaanzicht',
      'Groepen aanmaken en bewerken per gevel',
      'Metselverbanden: halfsteens, halfsteens kop, staand tegelverband',
      'Zetwerk, panelen, latten (horizontaal/verticaal)',
      'Penant configuratie met zij-strips en voorzijde-strips',
      'Zone-indeling per penant (links→rechts numering)',
      'IFC export met gevelbekleding',
      'Project opslaan/laden (JSON)',
      'Lattenartikelencatalogus met radio-selectie per groep',
      'HiDPI 2D canvas, camera auto-navigatie naar gevel, penant X-expressie',
      'Polygon-gebaseerde openings-detectie (geen strips/latten in sparingen)',
      'Snelkoppeling start-app.bat',
    ],
  },
];

const DIM_TOL = 50;
const OP_TOL = 50;
const POS_TOL = 150;

function wallCenter(wall) {
  const wo = wall.wallOrigin;
  if (!wo) return { x: 0, y: 0, z: 0 };
  const c = { x: 0, y: 0, z: 0 };
  c[wo.lengthAxis] = wo.lengthStart + wall.length / 2;
  c[wo.heightAxis] = wo.heightStart + wall.height / 2;
  const thickness = Math.abs((wo.thicknessEnd ?? wo.thicknessStart + 200) - wo.thicknessStart);
  c[wo.thicknessAxis] = wo.thicknessStart + thickness / 2;
  return c;
}

function wallSortKey(wall) {
  const c = wallCenter(wall);
  return c.x * 1e9 + c.z * 1e6 + c.y;
}

function openingsMatch(refOps, candOps) {
  if (refOps.length !== candOps.length) return false;
  if (refOps.length === 0) return true;
  const sr = [...refOps].sort((a, b) => a.x - b.x);
  const sc = [...candOps].sort((a, b) => a.x - b.x);
  for (let i = 0; i < sr.length; i++) {
    const r = sr[i]; const c = sc[i];
    if (Math.abs(r.x - c.x) > OP_TOL) return false;
    if (Math.abs(r.y - c.y) > OP_TOL) return false;
    if (Math.abs(r.breedte - c.breedte) > OP_TOL) return false;
    if (Math.abs(r.hoogte - c.hoogte) > OP_TOL) return false;
  }
  return true;
}

function buildGroupSignature(walls) {
  const sorted = [...walls].sort((a, b) => wallSortKey(a) - wallSortKey(b));
  const base = wallCenter(sorted[0]);
  return sorted.map((w) => {
    const c = wallCenter(w);
    return {
      dx: c.x - base.x, dy: c.y - base.y, dz: c.z - base.z,
      length: w.length, height: w.height,
      openings: (w.openings ?? []).slice().sort((a, b) => a.x - b.x),
    };
  });
}

function findSimilarGroups(referenceWalls, allWalls, existingGroups, adjacencies) {
  if (!referenceWalls.length) return [];
  const groupedIds = new Set(existingGroups.flatMap((g) => g.wallIds));
  const ungrouped = allWalls.filter((w) => !groupedIds.has(w.expressID));
  if (!ungrouped.length) return [];

  const N = referenceWalls.length;
  const refSig = buildGroupSignature(referenceWalls);

  const anchors = ungrouped.filter((w) =>
    Math.abs(w.length - refSig[0].length) <= DIM_TOL &&
    Math.abs(w.height - refSig[0].height) <= DIM_TOL &&
    openingsMatch(w.openings ?? [], refSig[0].openings)
  );

  const results = [];
  const seen = new Set();

  for (const anchor of anchors) {
    const ac = wallCenter(anchor);
    const matched = [anchor];
    let valid = true;

    for (let i = 1; i < N; i++) {
      const sig = refSig[i];
      const tx = ac.x + sig.dx, ty = ac.y + sig.dy, tz = ac.z + sig.dz;
      const match = ungrouped.find((w) => {
        if (matched.includes(w)) return false;
        if (Math.abs(w.length - sig.length) > DIM_TOL) return false;
        if (Math.abs(w.height - sig.height) > DIM_TOL) return false;
        const wc = wallCenter(w);
        if (Math.abs(wc.x - tx) > POS_TOL) return false;
        if (Math.abs(wc.y - ty) > POS_TOL) return false;
        if (Math.abs(wc.z - tz) > POS_TOL) return false;
        return openingsMatch(w.openings ?? [], sig.openings);
      });
      if (!match) { valid = false; break; }
      matched.push(match);
    }

    if (!valid) continue;
    if (!matched.every((w) => !groupedIds.has(w.expressID))) continue;
    const key = matched.map((w) => w.expressID).sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(matched.map((w) => w.expressID));
  }

  return results.map((ids) => sortWallsInComponent(ids, allWalls, adjacencies));
}
function findDuplicateGroupClusters(groups, allWalls) {
  if (groups.length < 2) return [];
  const sigged = groups.map((g) => {
    const walls = g.wallIds.map((id) => allWalls.find((w) => w.expressID === id)).filter(Boolean);
    if (!walls.length) return null;
    const sig = buildGroupSignature(walls);
    const key = sig.map((s) => [
      Math.round(s.dx / DIM_TOL),
      Math.round(s.dy / DIM_TOL),
      Math.round(s.dz / DIM_TOL),
      Math.round(s.length / DIM_TOL),
      Math.round(s.height / DIM_TOL),
      s.openings.length,
    ].join(',') + (s.openings.length ? '|' + s.openings.map((op) => [Math.round(op.x / OP_TOL), Math.round(op.y / OP_TOL), Math.round(op.breedte / OP_TOL), Math.round(op.hoogte / OP_TOL)].join(',')).join(';') : '')).join('/');
    return { g, key };
  }).filter(Boolean);
  const buckets = new Map();
  for (const { g, key } of sigged) {
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(g);
  }
  return [...buckets.values()].filter((c) => c.length > 1);
}

const GROUP_COLORS = [
  '#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#e67e22',
  '#16a085', '#d35400', '#2471a3', '#1e8449', '#6c3483',
];

function applyManualOutsideOverrides(wallsArr, groupsArr, sm) {
  for (const group of groupsArr) {
    const dir = sm?.[group.id]?.manualOutsideDir;
    if (dir !== 1 && dir !== -1) continue;
    for (const wallId of group.wallIds) {
      const wall = wallsArr.find(w => w.expressID === wallId);
      if (!wall?.wallOrigin) continue;
      const wo = wall.wallOrigin;
      if (!wo.resolvedOutside) wo.resolvedOutside = {};
      wo.resolvedOutside.outsideDir = dir;
      wo.resolvedOutside.outsidePos = dir < 0 ? wo.thicknessStart : (wo.thicknessEnd ?? wo.thicknessStart + 200);
      wo.resolvedOutside.source = 'manual';
      wo.resolvedOutside.reason = 'handmatig ingesteld';
      wo.resolvedOutside.confidence = 1.0;
      wo.resolvedOutside.ambiguous = false;
    }
  }
}

const SUBSTRATE_KEYWORDS = {
  beton: [
    'beton', 'concrete', 'prefab', 'in-situ', 'insitu', 'gewapend', 'rc-wand', 'rc_wand',
    'reinforced', 'rc-wall', 'betonwand', 'betonnen', 'vloerplaat', 'kolom', 'ligger',
    'sandwichpaneel', 'sandwich', 'kanaalplaat', 'kanaalvloer', 'sokkel',
  ],
  hsb: [
    'houtskelet', 'hsb', 'clt', 'glulam', 'timber', 'houtbouw', 'houtframe',
  ],
  staal: [
    'staal', 'steel', 'metaal', 'metal', 'staalframe', 'stalen',
  ],
  metselwerk: [
    'metsel', 'baksteen', 'masonry', 'klinker', 'gevelsteen', 'steens',
  ],
};

function detectSubstrateType(wallObjs) {
  const texts = wallObjs.flatMap((w) => [w.name ?? '', w.typeName ?? '']).join(' ').toLowerCase();
  for (const [type, keywords] of Object.entries(SUBSTRATE_KEYWORDS)) {
    if (keywords.some((kw) => texts.includes(kw))) return type;
  }
  return 'unknown';
}

function useGroupSettings() {
  const [map, setMap] = useState({});
  const defaults = (id) => ({ name: id, color: '#a64033', stripColor: null, verband: DEFAULT_VERBAND, material: { ...DEFAULT_MATERIAL }, brickDepth: 20, outsideDirFlip: false, maxHoogte: null, startLijn: null, penanten: [], zoneSettings: [], zetwerk: { enabled: false, breedte: 50, dikte: 2, offsetH: 0, offsetV: 0, stripOffset: 5 }, panelen: { enabled: false, breedte: 3005, hoogte: 1200, dikte: 8, gewichtM2: 9.4, maxKg: 50, verspringen: false }, latten: { enabled: false, richting: 'horizontaal', breedte: 50, dikte: 28, maxInterval: 400, minHOH: 370, maxHOH: 430 }, lattenArtikelen: [], steenstripsArtikelen: [], layerVisibility: { strips: true, zetwerk: true, panelen: true, latten: true, penanten: true }, ifcLayerVisibility: { strips: true, zetwerk: true, panelen: true, latten: true }, endExtensions: { left: { strips: 0, battens: 0, panels: 0 }, right: { strips: 0, battens: 0, panels: 0 } }, overgangsvoeg: 10, backingType: 'hout', wallSubstrateType: 'unknown', concreteCladdingSettings: { claddingDepthInward: 0, isEntrancePortalWall: false, cladSideFaces: true, cladFrontFace: true, cladPortalInnerFaces: false, insulationThickness: 140, uProfileWidth: 60, uProfileDepth: 30, uProfileSpacing: 600, mountingOffset: 10, panelVentilationGap: 20 }, slimFortSettings: { ...SLIMFORT_DEFAULTS } });
  const get = useCallback((id) => ({ ...defaults(id), ...map[id] }), [map]);
  const update = useCallback((id, patch) => setMap((prev) => ({ ...prev, [id]: { ...defaults(id), ...prev[id], ...patch } })), []);
  const initColor = useCallback((id, color, name) => setMap((prev) => prev[id] ? prev : { ...prev, [id]: { ...defaults(id), color, ...(name ? { name } : {}) } }), []);
  const forceInit = useCallback((id, color, name) => setMap((prev) => ({ ...prev, [id]: { ...defaults(id), color, ...(name ? { name } : {}) } })), []);
  return { get, update, initColor, forceInit, map, setMap };
}

function CollapsibleSection({ title, tip, children, isOpen, onToggle, badge, extra }) {
  return (
    <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 4, paddingTop: 6 }}>
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', userSelect: 'none', marginBottom: isOpen ? 6 : 0 }}>
        <span style={{ fontSize: 9, color: '#94a3b8', width: 10, flexShrink: 0 }}>{isOpen ? '▼' : '▶'}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#475569', flex: 1, display: 'flex', alignItems: 'center', gap: 3 }}>
          {title}{tip && <InfoIcon tip={tip} />}
        </span>
        {badge != null && <span style={{ fontSize: 10, color: '#64748b', background: '#f1f5f9', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>{badge}</span>}
        {extra && <span onClick={(e) => e.stopPropagation()}>{extra}</span>}
      </div>
      {isOpen && <div>{children}</div>}
    </div>
  );
}

function evalPenantX(expr, gapCenters) {
  if (expr === undefined || expr === null || String(expr).trim() === '') return 0;
  let s = String(expr).trim();
  (gapCenters ?? []).forEach((val, idx) => {
    s = s.replace(new RegExp(`\\bhl${idx + 1}\\b`, 'g'), String(Math.round(val)));
  });
  try {
    if (!/^[\d\s+\-*/.()]+$/.test(s)) return NaN;
    // eslint-disable-next-line no-new-func
    const result = new Function(`return (${s})`)();
    return typeof result === 'number' && isFinite(result) ? Math.round(result) : NaN;
  } catch {
    return NaN;
  }
}

function HoekAansluitDetail({ mainS, secS }) {
  const Sm   = mainS.brickDepth ?? 20;
  const Pm   = mainS.panelen?.enabled ? (mainS.panelen?.dikte ?? 8) : 0;
  const Lm   = mainS.latten?.enabled  ? (mainS.latten?.dikte  ?? 28) : 0;
  const Wm   = 60;
  const Ssec = secS.brickDepth ?? 20;
  const Psec = secS.panelen?.enabled ? (secS.panelen?.dikte ?? 8) : 0;
  const Lsec = secS.latten?.enabled  ? (secS.latten?.dikte  ?? 28) : 0;
  const Wsec = 150;
  const sv   = (secS.material ?? DEFAULT_MATERIAL).stoot ?? 10;
  const d_sec = Lsec + Psec + Ssec;
  const voegW = 8;
  const sc = 1.0;
  const PAD = 36;
  const mainLeft = 220;
  const secAbove = 220;
  const cx = PAD + mainLeft * sc;
  const cy = PAD + secAbove * sc;
  const W  = Math.round(cx + (d_sec + 50) * sc);
  const H  = Math.round(cy + (Sm + Pm + Lm + Wm + 40) * sc);
  const s  = v => Math.round(v * sc);
  const C_S = '#fbbf24'; const C_P = '#cbd5e1'; const C_L = '#a16207'; const C_W = '#94a3b8';
  const hatch = (id, col) => (
    <pattern key={id} id={id} patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
      <rect width={6} height={6} fill={col} />
      <line x1={0} y1={0} x2={0} y2={6} stroke="rgba(0,0,0,0.2)" strokeWidth={1.5} />
    </pattern>
  );
  const DIM_OFF = 10;
  const hdim = (x1, x2, y, lbl) => (
    <g key={`hd${lbl}`}>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke="#1d4ed8" strokeWidth={0.8} markerStart="url(#arr)" markerEnd="url(#arr)" />
      <line x1={x1} y1={y-4} x2={x1} y2={y+4} stroke="#1d4ed8" strokeWidth={0.8} />
      <line x1={x2} y1={y-4} x2={x2} y2={y+4} stroke="#1d4ed8" strokeWidth={0.8} />
      <text x={(x1+x2)/2} y={y-4} textAnchor="middle" dominantBaseline="auto" fontSize={8} fill="#1d4ed8" fontFamily="Arial">{lbl}</text>
    </g>
  );
  const vdim = (y1, y2, x, lbl) => (
    <g key={`vd${lbl}`}>
      <line x1={x} y1={y1} x2={x} y2={y2} stroke="#1d4ed8" strokeWidth={0.8} />
      <line x1={x-4} y1={y1} x2={x+4} y2={y1} stroke="#1d4ed8" strokeWidth={0.8} />
      <line x1={x-4} y1={y2} x2={x+4} y2={y2} stroke="#1d4ed8" strokeWidth={0.8} />
      <text x={x+5} y={(y1+y2)/2} textAnchor="start" dominantBaseline="middle" fontSize={8} fill="#1d4ed8" fontFamily="Arial">{lbl}</text>
    </g>
  );
  const lbl = (x, y, txt, anchor = 'middle', col = '#374151') => (
    <text key={txt+x} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" fontSize={8} fill={col} fontFamily="Arial">{txt}</text>
  );
  return (
    <svg width={W} height={H} style={{ display: 'block', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, marginTop: 8 }}>
      <defs>
        {hatch('hw', C_W)}
        {hatch('hl', C_L)}
      </defs>
      <rect width={W} height={H} fill="#f8fafc" />
      {/* BUITEN zone: top-right (exterior space next to secondary facade) */}
      <rect x={cx} y={0} width={W - cx} height={cy} fill="#dbeafe" opacity={0.4} />
      <text x={cx + s(d_sec / 2)} y={14} textAnchor="middle" fontSize={9} fill="#3b82f6" fontFamily="Arial" fontStyle="italic">BUITEN</text>

      {/* ── SECONDARY FACADE (above cy = main wall face, right of cx) ── */}
      {/* secondary wall overlaps main wall at corner */}
      <rect x={cx - s(Wsec)} y={PAD} width={s(Wsec)} height={s(secAbove + Wm + Lm + Pm + Sm)} fill="url(#hw)" stroke="#475569" strokeWidth={0.8} />
      {/* lat runs to 10mm (corner85: 5mm) before main wall exterior face */}
      {Lsec > 0 && <rect x={cx} y={PAD} width={s(Lsec)} height={s(secAbove + Wm - (isCorner85() ? CORNER85_LAT_GAP : 10))} fill="url(#hl)" stroke="#78350f" strokeWidth={0.8} />}
      {/* panel and strip end 8mm before main Strip top face (= voegW gap) */}
      {Psec > 0 && <rect x={cx + s(Lsec)} y={PAD} width={s(Psec)} height={s(secAbove + Wm + Lm + Pm - voegW)} fill={C_P} stroke="#64748b" strokeWidth={0.8} />}
      {Ssec > 0 && <rect x={cx + s(Lsec + Psec)} y={PAD} width={s(Ssec)} height={s(secAbove + Wm + Lm + Pm - voegW)} fill={C_S} stroke="#92400e" strokeWidth={0.8} />}
      {/* 8mm voeg gap at bottom of secondary panel/strip before main Strip */}
      {Psec > 0 && <rect x={cx + s(Lsec)} y={cy + s(Wm + Lm + Pm - voegW)} width={s(Psec)} height={s(voegW)} fill="white" stroke="#94a3b8" strokeWidth={0.6} strokeDasharray="2,2" />}
      <rect x={cx + s(Lsec + Psec)} y={cy + s(Wm + Lm + Pm - voegW)} width={s(Ssec)} height={s(voegW)} fill="white" stroke="#94a3b8" strokeWidth={0.6} strokeDasharray="2,2" />

      {/* ── MAIN FACADE (below cy = main wall face) — inside → outside (top → bottom) ── */}
      <rect x={PAD} y={cy} width={s(mainLeft)} height={s(Wm)} fill="url(#hw)" stroke="#475569" strokeWidth={0.8} />
      {Lm > 0 && <rect x={PAD} y={cy + s(Wm)} width={s(mainLeft + Lsec)} height={s(Lm)} fill="url(#hl)" stroke="#78350f" strokeWidth={0.8} />}
      {Pm > 0 && <rect x={PAD} y={cy + s(Wm + Lm)} width={s(mainLeft + Lsec)} height={s(Pm)} fill={C_P} stroke="#64748b" strokeWidth={0.8} />}
      <rect x={PAD} y={cy + s(Wm + Lm + Pm)} width={s(mainLeft + d_sec)} height={s(Sm)} fill={C_S} stroke="#92400e" strokeWidth={0.8} />

      {/* ── REFERENCE LINES ── */}
      <line x1={PAD} y1={cy} x2={W} y2={cy} stroke="#ef4444" strokeWidth={0.6} strokeDasharray="5,3" opacity={0.5} />
      <line x1={cx} y1={0} x2={cx} y2={H} stroke="#ef4444" strokeWidth={0.6} strokeDasharray="5,3" opacity={0.5} />
      <circle cx={cx} cy={cy} r={3} fill="#ef4444" />

      {/* ── LAYER LABELS (secondary) ── */}
      {lbl(cx - s(Wsec / 2), cy - s(secAbove / 2), 'Wand', 'middle', '#475569')}
      {Lsec > 0 && lbl(cx + s(Lsec / 2), cy - s(secAbove / 2), 'Lat', 'middle', '#78350f')}
      {Psec > 0 && lbl(cx + s(Lsec + Psec / 2), cy - s(secAbove / 2 + 10), 'Pan', 'middle', '#475569')}
      {Ssec > 0 && lbl(cx + s(Lsec + Psec + Ssec / 2), cy - s(secAbove / 2 + 10), 'Strip', 'middle', '#78350f')}

      {/* ── LAYER LABELS (main) — inside (top) → outside (bottom) ── */}
      {lbl(PAD + s(mainLeft / 2), cy + s(Wm / 2), 'Wand', 'middle', '#475569')}
      {Lm > 0 && lbl(PAD + s(mainLeft / 2), cy + s(Wm + Lm / 2), 'Lat', 'middle', '#78350f')}
      {Pm > 0 && lbl(PAD + s(mainLeft / 2), cy + s(Wm + Lm + Pm / 2), 'Paneel', 'middle', '#475569')}
      {lbl(PAD + s(mainLeft / 2), cy + s(Wm + Lm + Pm + Sm / 2), 'Strip', 'middle', '#78350f')}

      {/* ── FACADE LABELS ── */}
      <text x={PAD + s(mainLeft / 2)} y={cy - 6} textAnchor="middle" fontSize={8} fill="#1d4ed8" fontWeight="bold" fontFamily="Arial">← Aanzichtsgevel</text>
      <text x={cx + s(d_sec / 2)} y={cy + s(Wm + Lm + Pm + Sm) + 14} textAnchor="middle" fontSize={8} fill="#1d4ed8" fontStyle="italic" fontFamily="Arial">↓ buiten</text>
      <text x={cx - 6} y={PAD + s(secAbove / 2)} textAnchor="end" fontSize={8} fill="#92400e" fontWeight="bold" fontFamily="Arial" transform={`rotate(-90, ${cx - 6}, ${PAD + s(secAbove / 2)})`}>↑ Aansluitende gevel</text>

      {/* ── DIMENSION: d_sec (strips extend along main outside face) ── */}
      {hdim(cx, cx + s(d_sec), cy + s(Wm + Lm + Pm + Sm) + DIM_OFF + 6, `${d_sec}mm`)}
      {/* ── DIMENSION: voeg 8mm (bottom of secondary strip before main Strip) ── */}
      {vdim(cy + s(Wm + Lm + Pm - voegW), cy + s(Wm + Lm + Pm), cx + s(d_sec) + 8, `${voegW}mm`)}
      {/* ── DIMENSION: Sm (main strip depth) ── */}
      {vdim(cy + s(Wm + Lm + Pm), cy + s(Wm + Lm + Pm + Sm), cx + s(d_sec) + 8 + 22, `${Sm}mm`)}
      {/* ── DIMENSION: Lsec (lat thickness of secondary, shown in secondary zone) ── */}
      {Lsec > 0 && hdim(cx, cx + s(Lsec), cy - DIM_OFF - 8, `${Lsec}mm`)}

      {/* ── NOTE: voeg aansluitende gevel ── */}
      <text x={cx + s(Lsec + Psec / 2 + (Psec > 0 ? 0 : Ssec / 2))} y={cy + s(Wm + Lm + Pm - voegW / 2)} textAnchor="middle" dominantBaseline="middle" fontSize={6} fill="#64748b" fontFamily="Arial">voeg {voegW}mm</text>
    </svg>
  );
}

function DraggableFloatingPanel({ title, onDock, children, initialX = 320, initialY = 80, width = 340 }) {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const dragging = useRef(false);
  const origin = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return;
      setPos({ x: origin.current.px + e.clientX - origin.current.mx, y: origin.current.py + e.clientY - origin.current.my });
    };
    const onUp = () => { dragging.current = false; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, []);

  const onHeaderDown = (e) => {
    dragging.current = true;
    origin.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
  };

  return createPortal(
    <div style={{ position: 'fixed', left: pos.x, top: pos.y, width, zIndex: 9999, background: '#fff', border: '1px solid #64748b', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.22)', display: 'flex', flexDirection: 'column', maxHeight: '82vh' }}>
      <div
        onMouseDown={onHeaderDown}
        style={{ padding: '7px 10px', background: '#1e293b', color: '#fff', borderRadius: '8px 8px 0 0', cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none', flexShrink: 0 }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>⠿</span> {title}
        </span>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onDock}
          style={{ background: 'none', border: '1px solid #475569', color: '#cbd5e1', borderRadius: 3, padding: '2px 7px', cursor: 'pointer', fontSize: 10, whiteSpace: 'nowrap' }}
        >
          ↙ Dock
        </button>
      </div>
      <div style={{ overflowY: 'auto', flex: 1, padding: '10px 12px' }}>
        {children}
      </div>
    </div>,
    document.body
  );
}

function computePerpendicularHints(groupId, allGroups, wallMap) {
  const myGroup = allGroups.find((g) => g.id === groupId);
  if (!myGroup?.wallIds?.length) return { left: null, right: null };
  const myWalls = myGroup.wallIds.map((id) => wallMap[id]).filter((w) => w?.wallOrigin);
  if (!myWalls.length) return { left: null, right: null };
  const refWo = myWalls[0].wallOrigin;
  const lAxis = refWo.lengthAxis;
  const tAxis = refWo.thicknessAxis;
  let myLStart = Infinity, myLEnd = -Infinity;
  for (const w of myWalls) {
    const s = w.wallOrigin.lengthStart;
    const e = s + (w.length ?? 0);
    if (s < myLStart) myLStart = s;
    if (e > myLEnd) myLEnd = e;
  }
  const myTMin = Math.min(refWo.thicknessStart, refWo.thicknessEnd ?? refWo.thicknessStart);
  const myTMax = Math.max(refWo.thicknessStart, refWo.thicknessEnd ?? refWo.thicknessStart);
  const TOL = 50;
  let leftHint = null, rightHint = null;
  for (const w of Object.values(wallMap)) {
    if (!w?.wallOrigin) continue;
    if (myGroup.wallIds.includes(w.expressID)) continue;
    const wo2 = w.wallOrigin;
    if (wo2.lengthAxis !== tAxis || wo2.thicknessAxis !== lAxis) continue;
    const w2LStart = wo2.lengthStart;
    const w2LEnd = wo2.lengthStart + (w.length ?? 0);
    const overlapT = Math.min(myTMax, w2LEnd) - Math.max(myTMin, w2LStart);
    if (overlapT < TOL) continue;
    const w2TMin = Math.min(wo2.thicknessStart, wo2.thicknessEnd ?? wo2.thicknessStart);
    const w2TMax = Math.max(wo2.thicknessStart, wo2.thicknessEnd ?? wo2.thicknessStart);
    if (Math.abs(w2TMax - myLStart) < TOL) {
      const dist = w2TMax - w2TMin;
      if (leftHint === null || dist < leftHint) leftHint = dist;
    }
    if (Math.abs(w2TMin - myLEnd) < TOL) {
      const dist = w2TMax - w2TMin;
      if (rightHint === null || dist < rightHint) rightHint = dist;
    }
  }
  return {
    left: leftHint !== null ? Math.round(Math.abs(leftHint)) : null,
    right: rightHint !== null ? Math.round(Math.abs(rightHint)) : null,
  };
}

function GroupConfigPanel({ groupId, settings, onUpdate, onDelete, linkedCount, onSyncToLinked, gapCenters, groupWidth, doorBottomYs = [], resolvedOutsideInfo = null, onManualOutsideDir, cornerConfigs = {}, allGroups = [], getSettings, onAddCorner, onUpdateCorner, onRemoveCorner, adjacentGroupIds = null, adjacentHints = [], wallMap = {}, onUpdateGroupSettings = null }) {
  const mat = settings.material ?? { ...DEFAULT_MATERIAL };
  const DEFAULT_OPEN = { stripzones: true };
  const [openSections, setOpenSections] = useState({});
  const toggle = (k) => setOpenSections((p) => ({ ...p, [k]: !(p[k] ?? (DEFAULT_OPEN[k] ?? false)) }));
  const isOpen = (k) => openSections[k] ?? (DEFAULT_OPEN[k] ?? false);
  const perpHints = computePerpendicularHints(groupId, allGroups, wallMap);
  const [stripFabrikant, setStripFabrikant] = useState('');
  const [stripFormat, setStripFormat] = useState('');
  const [stripZoek, setStripZoek] = useState('');
  const [newCornerGroupId, setNewCornerGroupId] = useState('');
  const [cornerFloat, setCornerFloat] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Groep configuratie</span>
        <button onClick={onDelete} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13 }} title="Groep verwijderen">🗑</button>
      </div>

      {linkedCount > 0 && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 5, padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#1d4ed8', flex: 1 }}>🔗 {linkedCount} gekoppelde groep{linkedCount !== 1 ? 'en' : ''}</span>
          <button
            onClick={onSyncToLinked}
            style={{ fontSize: 11, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 3, padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Sync instellingen →
          </button>
        </div>
      )}

      <Field label="Naam" tip="Naam van de groep, zichtbaar in de lijst en bij de IFC-export.">
        <input type="text" value={settings.name} onChange={(e) => onUpdate({ name: e.target.value })}
          style={inp} />
      </Field>

      {!(settings.zones?.length > 0) && (
        <Field label="Kleur" tip="Kleur van de groep in de 3D viewer en het 2D gevelaanzicht.">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="color" value={settings.color} onChange={(e) => onUpdate({ color: e.target.value })}
              style={{ width: 36, height: 28, border: '1px solid #cbd5e1', borderRadius: 3, padding: 1, cursor: 'pointer' }} />
            <span style={{ fontSize: 11, color: '#64748b' }}>{settings.color}</span>
          </div>
        </Field>
      )}

      {!(settings.zones?.length > 0) && (
        <Field label="Metselverband" tip={"Halfsteens: stenen verspringen een halve steenlengte per laag — meest gebruikelijk.\nTegelverband: stenen lopen horizontaal door zonder verspinging.\nStaand tegelverband: steenstrips staan verticaal (lange kant omhoog), kolommen naast elkaar zonder verspinging."}>
          <select value={settings.verband} onChange={(e) => onUpdate({ verband: e.target.value })} style={inp}>
            <option value="halfsteens">Halfsteens</option>
            <option value="tegelverband">Tegelverband</option>
            <option value="staand_tegelverband">Staand tegelverband</option>
            <option value="wildverband">Wildverband</option>
            {isGroothuisWildverband() && <option value="groothuis_wildverband">Groothuis wildverband</option>}
            {isGroothuisWildverband2() && <option value="groothuis_wildverband_2">Groothuis wildverband 2</option>}
          </select>
        </Field>
      )}

      <CollapsibleSection title="Steenstrip afmetingen" tip={"Afmetingen van de brickslip (steenstrip):\n· Lengte = zichtbare lengte van de strip\n· Hoogte = zichtbare hoogte van de strip\n· Lintvoeg = horizontale voeg tussen lagen\n· Stootvoeg = verticale voeg tussen stenen"} isOpen={isOpen('strips')} onToggle={() => toggle('strips')}>
        {(() => {
          const selId = (settings.steenstripsArtikelen ?? [])[0] ?? null;
          const selArt = selId ? STEENSTRIP_CATALOG.find((a) => a.id === selId) : null;
          if (!selArt) return null;
          const fColors = { WF: '#92400e', DF: '#065f46', NF: '#1e3a8a', Klinker: '#4c1d95', LF: '#9a3412' };
          return (
            <div style={{ background: '#fdf4ff', border: '1px solid #d8b4fe', borderRadius: 4, padding: '5px 7px', marginBottom: 6, fontSize: 9.5 }}>
              <div style={{ fontSize: 9, color: '#7c3aed', marginBottom: 2 }}>Afmetingen uit geselecteerd artikel:</div>
              <div style={{ fontWeight: 700, fontSize: 10.5, color: '#1e293b' }}>{selArt.naam}</div>
              <div style={{ fontSize: 9, color: '#475569', fontStyle: 'italic', marginTop: 1 }}>{selArt.fabrikant}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ background: fColors[selArt.formatCode] ?? '#64748b', color: '#fff', borderRadius: 3, padding: '1px 5px', fontSize: 9, fontWeight: 600 }}>{selArt.formatCode}</span>
                <span style={{ color: '#64748b', fontSize: 9 }}>{selArt.steenL}×{selArt.steenH}×{selArt.dikte} mm</span>
                <span style={{ color: '#64748b', fontSize: 9 }}>voeg {selArt.lint}/{selArt.stoot} mm</span>
                <span style={{ color: '#64748b', fontSize: 9 }}>{selArt.stuksPerM2} st/m²</span>
                {selArt.prijsPerStuk != null && <span style={{ color: '#7c3aed', fontWeight: 600, fontSize: 9 }}>€ {selArt.prijsPerStuk.toFixed(3)}/st · € {selArt.prijsM2.toFixed(2)}/m²</span>}
              </div>
              <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 3 }}>Selecteer een ander artikel in 'Steenstrips artikelkeuze' om te wijzigen.</div>
            </div>
          );
        })()}
        <Field label="Stripkleur" tip="Kleur van de steenstrips in de IFC-export en het 3D-model. Stel in per artikel voor een nauwkeurige materiaalweergave.">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="color" value={settings.stripColor ?? settings.color ?? '#a64033'}
              onChange={(e) => onUpdate({ stripColor: e.target.value })}
              style={{ width: 36, height: 28, border: '1px solid #cbd5e1', borderRadius: 3, padding: 1, cursor: 'pointer' }} />
            <span style={{ fontSize: 11, color: '#64748b' }}>{settings.stripColor ?? '(zelfde als groepskleur)'}</span>
            {settings.stripColor && (
              <button onClick={() => onUpdate({ stripColor: null })}
                style={{ fontSize: 10, background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0 2px' }} title="Terugzetten naar groepskleur">✕</button>
            )}
          </div>
        </Field>
        {(() => {
          const _mSelId = (settings.steenstripsArtikelen ?? [])[0];
          const _mSelArt = _mSelId ? STEENSTRIP_CATALOG.find((a) => a.id === _mSelId) : null;
          const matVal = (key, defVal) => _mSelArt ? (_mSelArt[key] ?? defVal) : (mat[key] ?? defVal);
          return (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                {[
                  ['Lengte', 'steenL', true, 'Zichtbare lengte van de brickslip (mm).'],
                  ['Hoogte', 'steenH', true, 'Zichtbare hoogte van de brickslip (mm).'],
                  ['Lintvoeg', 'lint', false, 'Breedte van de horizontale voeg tussen lagen (mm).'],
                  ['Stootvoeg', 'stoot', false, 'Breedte van de verticale voeg tussen stenen (mm).'],
                ].map(([label, key, fromArt, tip]) => {
                  const locked = !!_mSelArt && fromArt;
                  const val = locked ? (_mSelArt[key] ?? DEFAULT_MATERIAL[key]) : (mat[key] ?? DEFAULT_MATERIAL[key]);
                  return (
                    <Field key={key} label={`${label} mm`} tip={tip}>
                      <input type="number" value={val}
                        disabled={locked}
                        onChange={(e) => onUpdate({ material: { ...mat, [key]: Number(e.target.value) } })}
                        style={{ ...inp, width: '100%', opacity: locked ? 0.6 : 1 }} />
                    </Field>
                  );
                })}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 4 }}>
                <Field label="Dikte IFC (mm)" tip="Dikte van de brickslip zoals geëxporteerd naar IFC. Dit is de uitsteek van de strip op de wand (mm).">
                  <input type="number" min={1} step={1} value={_mSelArt ? _mSelArt.dikte : (settings.brickDepth ?? 20)}
                    disabled={!!_mSelArt}
                    onChange={(e) => onUpdate({ brickDepth: Number(e.target.value) })}
                    style={{ ...inp, width: '100%', opacity: _mSelArt ? 0.6 : 1 }} />
                </Field>
                <Field label="Gewicht (kg/m²)" tip="Gewicht van de steenstrips per vierkante meter (kg/m²). Wordt gebruikt voor de berekening van het maximale paneelgewicht.">
                  <input type="number" min={0} step={1} value={matVal('brickWeightM2', 40)}
                    disabled={!!_mSelArt}
                    onChange={(e) => onUpdate({ material: { ...mat, brickWeightM2: Number(e.target.value) } })}
                    style={{ ...inp, width: '100%', opacity: _mSelArt ? 0.6 : 1 }} />
                </Field>
              </div>
            </>
          );
        })()}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, background: settings.outsideDirFlip ? '#fef3c7' : '#f8fafc', border: `1px solid ${settings.outsideDirFlip ? '#fbbf24' : '#e2e8f0'}`, borderRadius: 4, padding: '4px 6px' }}>
          <input type="checkbox" id="outside-flip"
            checked={!!settings.outsideDirFlip}
            onChange={(e) => onUpdate({ outsideDirFlip: e.target.checked })} />
          <label htmlFor="outside-flip" style={{ fontSize: 11, color: settings.outsideDirFlip ? '#92400e' : '#475569', cursor: 'pointer' }}>
            Buitenzijde omdraaien (richting corrigeren)
          </label>
        </div>
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>Buitenzijde selecteren</span>
            {resolvedOutsideInfo && settings.manualOutsideDir == null && (
              <span style={{ color: '#94a3b8', fontSize: 9 }}>
                (auto: {Math.round((resolvedOutsideInfo.confidence ?? 0) * 100)}%{resolvedOutsideInfo.ambiguous ? ' – onzeker' : ''})
              </span>
            )}
            {settings.manualOutsideDir != null && (
              <span style={{ color: '#2563eb', fontSize: 9, fontWeight: 600 }}>handmatig</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 3 }}>
            {[{ label: '← Positie 1', value: -1 }, { label: 'Automatisch', value: null }, { label: 'Positie 2 →', value: 1 }].map(({ label, value }) => {
              const isActive = value === null ? (settings.manualOutsideDir == null) : (settings.manualOutsideDir === value);
              return (
                <button key={String(value)}
                  onClick={() => { onUpdate({ manualOutsideDir: value }); onManualOutsideDir?.(value); }}
                  style={{ flex: 1, fontSize: 10, padding: '3px 4px', cursor: 'pointer', background: isActive ? '#3b82f6' : '#f1f5f9', color: isActive ? '#fff' : '#475569', border: `1px solid ${isActive ? '#2563eb' : '#e2e8f0'}`, borderRadius: 3 }}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Maximale strip hoogte" tip={"Begrenst het steenstrippatroon tot een bepaalde hoogte boven de onderkant van de groep.\nHandig voor een waterslag of als strips niet tot de bovenkant hoeven."} isOpen={isOpen('maxhoogte')} onToggle={() => toggle('maxhoogte')} badge={settings.maxHoogte !== null ? `${settings.maxHoogte} mm` : null}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <input type="checkbox" id="mh-enable"
            checked={settings.maxHoogte !== null}
            onChange={(e) => onUpdate({ maxHoogte: e.target.checked ? 1000 : null })} />
          <label htmlFor="mh-enable" style={{ fontSize: 11, color: '#475569', cursor: 'pointer' }}>
            Inschakelen
          </label>
        </div>
        {settings.maxHoogte !== null && (
          <Field label="Hoogte (mm)">
            <input type="number" min={0} step={10} value={settings.maxHoogte}
              onChange={(e) => onUpdate({ maxHoogte: Number(e.target.value) })}
              style={{ ...inp, width: 80 }} />
          </Field>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Startlijn t.o.v. peil = 0" tip={"Bepaalt de laagste referentielijn vanaf waar steenstrips starten.\nStrips buiten de X-breedte van openingen worden niet getoond onder deze lijn.\nVlakken onder openingen (bijv. onder een raam) behouden hun eigen startlogica en tonen strips tot de wand-onderkant.\nNegatieve waarden: startlijn ligt onder peil = 0 (strips starten volledig onderaan)."} isOpen={isOpen('startlijn')} onToggle={() => toggle('startlijn')} badge={settings.startLijn !== null ? `${settings.startLijn} mm` : null}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <input type="checkbox" id="startlijn-enable"
            checked={settings.startLijn !== null}
            onChange={(e) => onUpdate({ startLijn: e.target.checked ? 0 : null })} />
          <label htmlFor="startlijn-enable" style={{ fontSize: 11, color: '#475569', cursor: 'pointer' }}>
            Inschakelen
          </label>
        </div>
        {settings.startLijn !== null && (
          <Field label="Hoogte t.o.v. peil (mm)">
            <input type="number" step={10} value={settings.startLijn}
              onChange={(e) => onUpdate({ startLijn: Number(e.target.value) })}
              style={{ ...inp, width: 80 }} />
          </Field>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Penanten" tip={"Een penant is een uitstekende verticale lijst in de gevel.\nGeef de X-positie, breedte, diepte en hoogte op in mm.\n· X positie = afstand van de linker groepsrand\n· Breedte = breedte van het penant\n· Diepte = uitsteek t.o.v. het gevelvlak\n· Hoogte = hoogte van het penant\n· Steenstrips starten symmetrisch vanuit het midden van de voorzijde"} isOpen={isOpen('penanten')} onToggle={() => toggle('penanten')} badge={(settings.penanten ?? []).length > 0 ? `${(settings.penanten ?? []).length}` : null} extra={(() => { const _szBlocked = (settings.stripZones ?? []).some((z) => z?.enabled === true); return <button disabled={_szBlocked} title={_szBlocked ? 'Dit vlak heeft actieve strip-zones — penanten zijn hier uitgesloten (wederzijds). Zet de zones uit om penanten te gebruiken.' : undefined} onClick={() => { if (_szBlocked) return; onUpdate({ penanten: [...(settings.penanten ?? []), { id: Date.now(), x: 500, breedte: 400, diepte: 150, hoogte: 2000, hoekprofiel: { enabled: true, dikte: 2, breedteZijkant: 40, breedteVoorkant: 40 } }] }); }} style={{ fontSize: 11, background: '#e2e8f0', border: 'none', borderRadius: 3, padding: '2px 8px', cursor: _szBlocked ? 'not-allowed' : 'pointer', opacity: _szBlocked ? 0.5 : 1 }}>+ Toevoegen</button>; })()}>
        <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, paddingBottom: 6, borderBottom: '1px solid #e2e8f0' }}>
          <input type="checkbox" id="penant-startlijn-enable"
            checked={settings.startLijn !== null}
            onChange={(e) => onUpdate({ startLijn: e.target.checked ? 0 : null })} />
          <label htmlFor="penant-startlijn-enable" title="Schakelt de startlijn (t.o.v. peil = 0) voor deze groep in/uit — dezelfde instelling als in de sectie 'Startlijn t.o.v. peil = 0'." style={{ fontSize: 11, color: '#475569', cursor: 'pointer' }}>
            Startlijn inschakelen voor deze groep
          </label>
        </div>
        {(settings.penanten ?? []).length === 0 && (
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Geen penanten</div>
        )}
        {(settings.penanten ?? []).map((p, idx) => (
          <div key={p.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, padding: 6, marginBottom: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>Penant {idx + 1}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  title="Kopieer penant"
                  onClick={() => onUpdate({ penanten: [...(settings.penanten ?? []), { ...p, id: Date.now(), x: (p.x ?? 0) + (p.breedte ?? 400) + 200 }] })}
                  style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: 12 }}>⧉</button>
                <button onClick={() => onUpdate({ penanten: (settings.penanten ?? []).filter((q) => q.id !== p.id) })}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>✕</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
              <Field label="X positie mm" tip={gapCenters?.length ? `Vul een getal in of een uitdrukking.\nBeschikbare variabelen: ${gapCenters.map((v, i) => `hl${i + 1}=${Math.round(v)}`).join(', ')}.\nVoorbeelden: hl1 - 50   of   3390 + 100` : 'X-positie van het penant vanaf de linkerkant van de groep (mm).'}>
                {(() => {
                  const xExpr = p.xExpr ?? String(p.x ?? 0);
                  const evaluated = evalPenantX(xExpr, gapCenters);
                  const isInvalid = isNaN(evaluated);
                  return (
                    <div>
                      <input
                        type="text"
                        value={xExpr}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const num = evalPenantX(raw, gapCenters);
                          onUpdate({ penanten: (settings.penanten ?? []).map((q) => q.id === p.id ? { ...q, xExpr: raw, x: isNaN(num) ? (q.x ?? 0) : num } : q) });
                        }}
                        style={{ ...inp, width: '100%', borderColor: isInvalid ? '#ef4444' : undefined, background: isInvalid ? '#fef2f2' : undefined }}
                      />
                      {(gapCenters?.length > 0 || p.xExpr) && !isInvalid && p.xExpr && p.xExpr !== String(p.x ?? 0) && (
                        <div style={{ fontSize: 9, color: '#16a34a', marginTop: 1 }}>= {evaluated} mm</div>
                      )}
                      {isInvalid && <div style={{ fontSize: 9, color: '#ef4444', marginTop: 1 }}>Ongeldige uitdrukking</div>}
                    </div>
                  );
                })()}
              </Field>
              {[['Breedte', 'breedte'], ['Hoogte', 'hoogte']].map(([lbl, key]) => (
                <Field key={key} label={`${lbl} mm`}>
                  <input type="number" min={0} step={10} value={p[key] ?? 0}
                    onChange={(e) => onUpdate({ penanten: (settings.penanten ?? []).map((q) => q.id === p.id ? { ...q, [key]: Number(e.target.value) } : q) })}
                    style={{ ...inp, width: '100%' }} />
                </Field>
              ))}
              <Field label="Diepte links mm" tip="Diepte van de linkerzijde van het penant (mm). Bepaalt hoe ver de linker arm uitsteekt.">
                <input type="number" min={0} step={10} value={p.diepteLinks ?? p.diepte ?? 150}
                  onChange={(e) => onUpdate({ penanten: (settings.penanten ?? []).map((q) => q.id === p.id ? { ...q, diepteLinks: Number(e.target.value) } : q) })}
                  style={{ ...inp, width: '100%' }} />
              </Field>
              <Field label="Diepte rechts mm" tip="Diepte van de rechterzijde van het penant (mm). Bepaalt hoe ver de rechter arm uitsteekt.">
                <input type="number" min={0} step={10} value={p.diepteRechts ?? p.diepte ?? 150}
                  onChange={(e) => onUpdate({ penanten: (settings.penanten ?? []).map((q) => q.id === p.id ? { ...q, diepteRechts: Number(e.target.value) } : q) })}
                  style={{ ...inp, width: '100%' }} />
              </Field>
              <Field label="Stootvoeg mm" tip={`Stootvoegbreedte voor dit penant (mm). Bepaalt de vrije ruimte tussen de strip en het zijpaneel. Standaard: materiaal stootvoeg (${settings.material?.stoot ?? 10} mm).`}>
                <input type="number" min={0} step={1} value={p.stoot ?? (settings.material?.stoot ?? 10)}
                  onChange={(e) => onUpdate({ penanten: (settings.penanten ?? []).map((q) => q.id === p.id ? { ...q, stoot: Number(e.target.value) } : q) })}
                  style={{ ...inp, width: '100%' }} />
              </Field>
            </div>

            {(() => {
              const hp = p.hoekprofiel ?? { enabled: false, dikte: 2, breedteZijkant: 40, breedteVoorkant: 40 };
              const updHp = (patch) => onUpdate({ penanten: (settings.penanten ?? []).map((q) => q.id === p.id ? { ...q, hoekprofiel: { ...hp, ...patch } } : q) });
              return (
                <div style={{ marginTop: 6, borderTop: '1px dashed #e2e8f0', paddingTop: 5 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', marginBottom: 4 }}>
                    <input type="checkbox" checked={hp.enabled !== false} onChange={(e) => updHp({ enabled: e.target.checked })} />
                    <span title="Aluminium L-profiel in de binnenhoek aan weerszijden van het penant, vlak tegen de achterkant van het paneel. Verbindt de zijkant met de voorkant.">Aluminium hoekprofiel (L)</span>
                  </label>
                  {hp.enabled !== false && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3 }}>
                      {[
                        ['Dikte', 'dikte', 'Materiaaldikte van het L-profiel (mm).'],
                        ['Br. zijkant', 'breedteZijkant', 'Breedte van de zijkantflens van het L-profiel (mm) — loopt langs de zijkant van het penant.'],
                        ['Br. voorkant', 'breedteVoorkant', 'Breedte van de voorkantflens van het L-profiel (mm) — loopt langs de voorkant van het penant.'],
                      ].map(([lbl, key, tip]) => (
                        <Field key={key} label={`${lbl} mm`} tip={tip}>
                          <input type="number" min={1} step={1} value={hp[key] ?? 0}
                            onChange={(e) => updHp({ [key]: Number(e.target.value) })}
                            style={{ ...inp, width: '100%' }} />
                        </Field>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            {(() => {
              const updP = (patch) => onUpdate({ penanten: (settings.penanten ?? []).map((q) => q.id === p.id ? { ...q, ...patch } : q) });
              const maxKg = p.maxKg ?? 50;
              const pB = Math.max(1, p.breedte ?? 400);
              const pDL = Math.max(1, p.diepteLinks ?? p.diepte ?? 150);
              const pDR = Math.max(1, p.diepteRechts ?? p.diepte ?? 150);
              const pH = Math.max(1, p.hoogte ?? 2000);
              const selStripIdP = (settings.steenstripsArtikelen ?? [])[0] ?? null;
              const selStripP = selStripIdP ? STEENSTRIP_CATALOG.find((a) => a.id === selStripIdP) : null;
              const panelGewichtM2P = settings.panelen?.gewichtM2 ?? 9.4;
              const stripGewichtM2P = mat.brickWeightM2 ?? 40;
              const gewichtM2 = panelGewichtM2P + stripGewichtM2P;
              const brickDepthP = settings.brickDepth ?? 20;
              const stootP = p.stoot ?? settings.material?.stoot ?? 10;
              const sidePanelDepthL = Math.max(1, pDL - brickDepthP - stootP);
              const sidePanelDepthR = Math.max(1, pDR - brickDepthP - stootP);
              const omtrekM2perMM = (pB + sidePanelDepthL + sidePanelDepthR) / 1e6;
              const kgPerMM = omtrekM2perMM * gewichtM2;
              const maxSectieH = kgPerMM > 0 ? Math.floor(maxKg / kgPerMM) : pH;
              const aantalSecties = kgPerMM > 0 ? Math.ceil(pH / maxSectieH) : 1;
              const sectieH = aantalSecties > 0 ? Math.round(pH / aantalSecties) : pH;
              return (
                <div style={{ marginTop: 6, borderTop: '1px dashed #e2e8f0', paddingTop: 5 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>U-secties</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                    <Field label="Gewicht m² kg" tip={`Gecombineerd gewicht: paneel ${panelGewichtM2P} kg/m² + strip ${stripGewichtM2P} kg/m² = ${gewichtM2} kg/m². Stripgewicht komt uit materiaalinstellingen (brickWeightM2).`}>
                      <div style={{ ...inp, width: '100%', background: '#f0fdf4', color: '#166534', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {gewichtM2} kg/m² <span style={{ fontSize: 8, color: '#16a34a' }}>{panelGewichtM2P}+{stripGewichtM2P}</span>
                      </div>
                    </Field>
                    <Field label="Max gewicht kg" tip="Maximaal gewicht per U-sectie (kg). Het penant wordt verticaal opgedeeld in secties die elk dit gewicht niet overschrijden.">
                      <input type="number" min={1} step={5} value={maxKg}
                        onChange={(e) => updP({ maxKg: Number(e.target.value) })}
                        style={{ ...inp, width: '100%' }} />
                    </Field>
                  </div>
                  <div style={{ marginTop: 4, padding: '4px 6px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 3, fontSize: 10, color: '#166534' }}>
                    {aantalSecties} U-sectie{aantalSecties !== 1 ? 's' : ''} · ≈ {sectieH} mm/sectie · ≈ {Math.round(sectieH * kgPerMM)} kg/sectie
                  </div>
                  {(() => {
                    const vl = p.verticaleLat ?? { enabled: true, breedte: 90, dikte: 50 };
                    const updVL = (patch) => updP({ verticaleLat: { ...vl, ...patch } });
                    const latLengthMM = pH;
                    return (
                      <div style={{ marginTop: 6 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', marginBottom: 4 }}>
                          <input type="checkbox" checked={vl.enabled !== false} onChange={(e) => updVL({ enabled: e.target.checked })} />
                          <span title="Verticale houten lat aan weerszijden van de U-sectie, aan de binnenkant van het penant. Loopt over de volledige hoogte van het penant en wordt gebruikt om de U-sectie aan de achterconstructie te bevestigen. Standaard 90×50 mm verduurzaamd zwart.">Verticale bevestigingslat (2×)</span>
                        </label>
                        {vl.enabled !== false && (
                          <>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                              <Field label="Breedte mm" tip="Breedte van de verticale houten lat (mm) — de zijde die langs de binnenwand van het penant loopt.">
                                <input type="number" min={1} step={5} value={vl.breedte ?? 90}
                                  onChange={(e) => updVL({ breedte: Number(e.target.value) })}
                                  style={{ ...inp, width: '100%' }} />
                              </Field>
                              <Field label="Dikte mm" tip="Dikte van de verticale houten lat (mm) — de zijde die haaks op de wand staat.">
                                <input type="number" min={1} step={5} value={vl.dikte ?? 50}
                                  onChange={(e) => updVL({ dikte: Number(e.target.value) })}
                                  style={{ ...inp, width: '100%' }} />
                              </Field>
                            </div>
                            <div style={{ marginTop: 3, padding: '3px 6px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: 3, fontSize: 10, color: '#713f12' }}>
                              2 latten × {latLengthMM} mm = {Math.round(2 * latLengthMM / 1000 * 100) / 100} m¹ per penant
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
            {(() => {
              const hk = p.hoekKoppeling ?? { enabled: false, adjacentGroupId: null, side: 'left', autoPosition: true, extensionMode: 'toPenantFront' };
              const myGroupObj = allGroups.find((g) => g.id === groupId);
              const otherGroups = (allGroups ?? []).filter((g) => g.id !== groupId);
              const computeFor = (nextHk, nextBreedte) => {
                if (!nextHk.enabled || !nextHk.adjacentGroupId) return null;
                const adjG = allGroups.find((g) => g.id === nextHk.adjacentGroupId);
                if (!adjG) return null;
                return computePenantCornerInfo(myGroupObj, adjG, wallMap, nextBreedte ?? 400, nextHk.side ?? 'left');
              };
              const updHk = (patch) => {
                const merged = { ...hk, ...patch };
                const ci = computeFor(merged, p.breedte ?? 400);
                onUpdate({
                  penanten: (settings.penanten ?? []).map((q) => {
                    if (q.id !== p.id) return q;
                    const nx = { ...q, hoekKoppeling: merged };
                    if (ci) { nx.x = ci.penant_x; nx.xExpr = String(ci.penant_x); }
                    return nx;
                  }),
                });
              };
              const adjGroupObj = hk.adjacentGroupId ? allGroups.find((g) => g.id === hk.adjacentGroupId) : null;
              const cornerInfo = hk.enabled && adjGroupObj
                ? computePenantCornerInfo(myGroupObj, adjGroupObj, wallMap, p.breedte ?? 400, hk.side ?? 'left')
                : null;
              const sideDepth = (hk.side === 'right') ? (p.diepteRechts ?? p.diepte ?? 150) : (p.diepteLinks ?? p.diepte ?? 150);
              const brickDLocal = settings.brickDepth ?? 20;
              const penantFrontDepth = Math.max(0, Math.round(sideDepth + brickDLocal));
              const applyToAdjacent = () => {
                if (!cornerInfo || !adjGroupObj || !onUpdateGroupSettings) return;
                const adjSettings = getSettings ? getSettings(adjGroupObj.id) : {};
                const ee = adjSettings.endExtensions ?? { left: { strips: 0, battens: 0, panels: 0 }, right: { strips: 0, battens: 0, panels: 0 } };
                const cur = ee[cornerInfo.adjCornerEnd] ?? { strips: 0, battens: 0, panels: 0 };
                const patch = { endExtensions: { ...ee, [cornerInfo.adjCornerEnd]: { ...cur, strips: penantFrontDepth, battens: penantFrontDepth, panels: penantFrontDepth } } };
                onUpdateGroupSettings(adjGroupObj.id, patch);
              };
              return (
                <div style={{ marginTop: 6, borderTop: '1px dashed #e2e8f0', paddingTop: 5 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', marginBottom: 4 }}>
                    <input type="checkbox" checked={hk.enabled === true} onChange={(e) => updHk({ enabled: e.target.checked })} />
                    <span title="Plaats dit penant exact op de hoek waar de aangrenzende gevel aansluit. De aangrenzende gevel loopt door tot de voorzijde van het penant.">Hoekaansluiting</span>
                  </label>
                  {hk.enabled && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <Field label="Aansluitende gevel" tip="Kies de aangrenzende (haakse) gevelgroep die op deze hoek aansluit.">
                        <select value={hk.adjacentGroupId ?? ''} onChange={(e) => updHk({ adjacentGroupId: e.target.value || null })} style={{ ...inp, width: '100%' }}>
                          <option value="">— kies groep —</option>
                          {otherGroups.map((g) => {
                            const gName = (getSettings ? getSettings(g.id)?.name : null) ?? g.id;
                            return <option key={g.id} value={g.id}>{gName}</option>;
                          })}
                        </select>
                      </Field>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {['left', 'right'].map((s) => (
                          <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, cursor: 'pointer', color: '#334155' }}>
                            <input type="radio" name={`hk-side-${p.id}`} value={s} checked={(hk.side ?? 'left') === s} onChange={() => updHk({ side: s })} />
                            {s === 'left' ? 'Linker hoek' : 'Rechter hoek'}
                          </label>
                        ))}
                      </div>
                      <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 4, padding: '5px 7px', fontSize: 10, color: '#0c4a6e' }}>
                        {cornerInfo ? (
                          <>
                            <div>Berekende penantpositie: <strong>x = {cornerInfo.penant_x} mm</strong></div>
                            <div style={{ fontSize: 9, color: '#0369a1' }}>Hoekpunt model: {Math.round(cornerInfo.cornerX_model)} · groep-X-start: {Math.round(cornerInfo.myLenStart)}</div>
                            <div style={{ fontSize: 9, color: '#0369a1' }}>Aansluitende gevel: uiteinde <strong>{cornerInfo.adjCornerEnd}</strong> · endExtension = {penantFrontDepth} mm</div>
                          </>
                        ) : (
                          <span style={{ color: '#9f1239' }}>Kan hoekpunt niet bepalen (controleer aslogica van geselecteerde groep).</span>
                        )}
                      </div>
                      <button
                        disabled={!cornerInfo}
                        onClick={applyToAdjacent}
                        style={{ fontSize: 10, background: cornerInfo ? '#0f766e' : '#e2e8f0', color: cornerInfo ? '#fff' : '#94a3b8', border: 'none', borderRadius: 3, padding: '4px 8px', cursor: cornerInfo ? 'pointer' : 'default', fontWeight: 600 }}
                      >
                        ✓ Toepassen op aansluitende gevel
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ))}
        </div>
      </CollapsibleSection>

      {(settings.penanten ?? []).length >= 1 && (() => {
        const sortedPenants = [...(settings.penanten ?? [])].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
        const numZones = sortedPenants.length + 1;
        const facadeWidth = groupWidth ?? 0;
        const zoneSettings = settings.zoneSettings ?? [];
        const DEFAULT_ZONE_MAT = { ...DEFAULT_MATERIAL };
        const selZoneStripId = (settings.steenstripsArtikelen ?? [])[0] ?? null;
        const selZoneStripArt = selZoneStripId ? STEENSTRIP_CATALOG.find((a) => a.id === selZoneStripId) : null;
        const resolveZone = (zi) => ({ enabled: false, color: settings.color, verband: settings.verband, material: { ...DEFAULT_ZONE_MAT }, maxHoogte: null, ...(zoneSettings[zi] ?? {}) });
        const updZone = (zi, patch) => {
          const cur = [...zoneSettings];
          cur[zi] = { ...resolveZone(zi), ...patch };
          onUpdate({ zoneSettings: cur });
        };
        const copyZoneTo = (srcZi, targets) => {
          const src = resolveZone(srcZi);
          const cur = Array.from({ length: numZones }, (_, i) => resolveZone(i));
          for (const ti of targets) cur[ti] = { ...src };
          onUpdate({ zoneSettings: cur });
        };
        return (
          <CollapsibleSection title={`Zones (${numZones})`} tip={"Zones zijn de vakken links en rechts van elk penant, plus de randzone aan elke zijde van de gevel.\nPer zone kun je een eigen kleur, verband en steenstrip-afmetingen instellen.\n\nAantal zones = aantal penanten + 1"} isOpen={isOpen('zones')} onToggle={() => toggle('zones')}>
            {Array.from({ length: numZones }, (_, zi) => {
              const zoneX1 = zi === 0 ? 0 : (sortedPenants[zi - 1].x ?? 0) + Math.max(1, sortedPenants[zi - 1].breedte ?? 400);
              const zoneX2 = zi === numZones - 1 ? facadeWidth : (sortedPenants[zi].x ?? 0);
              const zs = resolveZone(zi);
              const zm = zs.material ?? DEFAULT_ZONE_MAT;
              const otherZones = Array.from({ length: numZones }, (_, i) => i).filter((i) => i !== zi);
              return (
                <div key={zi} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, padding: 6, marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: zs.enabled ? 6 : 0 }}>
                    <input type="checkbox" id={`zone-en-${zi}`} checked={zs.enabled} onChange={(e) => updZone(zi, { enabled: e.target.checked })} />
                    <label htmlFor={`zone-en-${zi}`} style={{ fontSize: 11, fontWeight: 600, color: '#334155', cursor: 'pointer', flex: 1 }}>
                      Zone {zi + 1}
                      <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 4 }}>
                        ({Math.round(zoneX1)}–{Math.round(zoneX2)} mm, breedte {Math.max(0, Math.round(zoneX2 - zoneX1))} mm)
                      </span>
                    </label>
                    {zs.enabled && (
                      <input type="color" value={zs.color} onChange={(e) => updZone(zi, { color: e.target.value })}
                        style={{ width: 28, height: 22, border: '1px solid #cbd5e1', borderRadius: 3, padding: 1, cursor: 'pointer' }} />
                    )}
                    {numZones > 1 && (
                      <select
                        value=""
                        title="Kopieer instellingen van deze zone naar een andere zone"
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'all') copyZoneTo(zi, otherZones);
                          else if (val !== '') copyZoneTo(zi, [Number(val)]);
                        }}
                        style={{ ...inp, fontSize: 10, paddingRight: 4, color: '#475569', maxWidth: 72 }}
                      >
                        <option value="" disabled>→ kopieer</option>
                        {otherZones.map((ti) => (
                          <option key={ti} value={ti}>→ Zone {ti + 1}</option>
                        ))}
                        <option value="all">→ Alle zones</option>
                      </select>
                    )}
                  </div>
                  {zs.enabled && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <Field label="Metselverband" tip="Verband voor deze zone.">
                        <select value={zs.verband} onChange={(e) => updZone(zi, { verband: e.target.value })} style={inp}>
                          <option value="halfsteens">Halfsteens</option>
                          <option value="tegelverband">Tegelverband</option>
                          <option value="staand_tegelverband">Staand tegelverband</option>
                          <option value="wildverband">Wildverband</option>
                          {isGroothuisWildverband() && <option value="groothuis_wildverband">Groothuis wildverband</option>}
                          {isGroothuisWildverband2() && <option value="groothuis_wildverband_2">Groothuis wildverband 2</option>}
                        </select>
                      </Field>
                      {selZoneStripArt && (
                        <div style={{ background: '#fdf4ff', border: '1px solid #d8b4fe', borderRadius: 4, padding: '4px 6px', fontSize: 9.5, marginBottom: 2 }}>
                          <div style={{ fontSize: 9, color: '#7c3aed' }}>Uit artikelkeuze: <strong>{selZoneStripArt.naam}</strong></div>
                          <div style={{ color: '#64748b', fontSize: 9 }}>{selZoneStripArt.steenL}×{selZoneStripArt.steenH}×{selZoneStripArt.dikte} mm · voeg {selZoneStripArt.lint}/{selZoneStripArt.stoot} mm</div>
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                        {[['Lengte mm', 'steenL', true], ['Hoogte mm', 'steenH', true], ['Lintvoeg mm', 'lint', false], ['Stootvoeg mm', 'stoot', false]].map(([lbl, key, fromArt]) => {
                          const locked = !!selZoneStripArt && fromArt;
                          const val = locked ? (selZoneStripArt[key] ?? DEFAULT_MATERIAL[key]) : (zm[key] ?? DEFAULT_MATERIAL[key]);
                          return (
                            <Field key={key} label={lbl}>
                              <input type="number" min={1} step={1} value={val}
                                disabled={locked}
                                onChange={(e) => updZone(zi, { material: { ...zm, [key]: Number(e.target.value) } })}
                                style={{ ...inp, width: '100%', opacity: locked ? 0.6 : 1 }} />
                            </Field>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="checkbox" id={`zone-mh-${zi}`} checked={zs.maxHoogte !== null}
                          onChange={(e) => updZone(zi, { maxHoogte: e.target.checked ? 1000 : null })} />
                        <label htmlFor={`zone-mh-${zi}`} style={{ fontSize: 11, color: '#475569', cursor: 'pointer' }}>Max strip hoogte</label>
                        {zs.maxHoogte !== null && (
                          <input type="number" min={0} step={10} value={zs.maxHoogte}
                            onChange={(e) => updZone(zi, { maxHoogte: Number(e.target.value) })}
                            style={{ ...inp, width: 60 }} />
                        )}
                        {zs.maxHoogte !== null && <span style={{ fontSize: 10, color: '#94a3b8' }}>mm</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </CollapsibleSection>
        );
      })()}

      {isFeatureZones() && (settings.stripZones ?? []).length > 0 && (() => {
        const szArr = settings.stripZones ?? [];
        const DEFAULT_ZONE_MAT = { ...DEFAULT_MATERIAL };
        const groupBacking = settings.backingType ?? 'hout';
        const backingShort = (b) => b === 'hout' ? 'Hout' : b === 'aluminium' ? 'Aluminium U' : b === 'aluminium_slimfort' ? 'SlimFort' : b;
        const resolveZone = (sz) => ({ enabled: false, color: settings.color, verband: settings.verband, material: { ...DEFAULT_ZONE_MAT }, maxHoogte: null, zoneBackingType: null, zonePanelenEnabled: null, ...sz });
        const updZone = (id, patch) => {
          onUpdate({ stripZones: szArr.map((z) => z.id === id ? { ...resolveZone(z), ...patch } : z) });
        };
        const copyZoneTo = (srcId, targetIds) => {
          const src = resolveZone(szArr.find((z) => z.id === srcId));
          onUpdate({ stripZones: szArr.map((z) => targetIds.includes(z.id) ? { ...z, ...src, id: z.id, x: z.x, y: z.y, width: z.width, height: z.height, label: z.label } : z) });
        };
        return (
          <CollapsibleSection
            title={`Tekenzones (${szArr.length})`}
            tip={"Tekenzones zijn rechthoekige vlakken die je in de 2D-view tekent.\nPer zone kun je eigen instellingen opgeven voor verband, steenstrip, achterconstructie en panelisatie.\n\nTeken een zone via de knop '▭ Teken zone' in het 2D-aanzicht.\nKlik op een zone om deze te selecteren."}
            isOpen={isOpen('stripzones')}
            onToggle={() => toggle('stripzones')}
            badge={szArr.some((z) => z.enabled) ? 'Actief' : null}
          >
            {szArr.map((sz) => {
              const zs = resolveZone(sz);
              const zm = zs.material ?? DEFAULT_ZONE_MAT;
              const zoneStripArt = sz.steenstripArtikelId ? STEENSTRIP_CATALOG.find((a) => a.id === sz.steenstripArtikelId) : null;
              const otherIds = szArr.filter((z) => z.id !== sz.id).map((z) => z.id);
              return (
                <div key={sz.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, padding: 6, marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: zs.enabled ? 6 : 0 }}>
                    <input type="checkbox" id={`sz-en-${sz.id}`} checked={zs.enabled} onChange={(e) => updZone(sz.id, { enabled: e.target.checked })} />
                    <label htmlFor={`sz-en-${sz.id}`} style={{ fontSize: 11, fontWeight: 600, color: '#334155', cursor: 'pointer', flex: 1 }}>
                      {sz.label ?? sz.id}
                      <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 4 }}>
                        ({Math.round(sz.width)}×{Math.round(sz.height)} mm)
                      </span>
                    </label>
                    {zs.enabled && (
                      <input type="color" value={zs.color} onChange={(e) => updZone(sz.id, { color: e.target.value })}
                        style={{ width: 28, height: 22, border: '1px solid #cbd5e1', borderRadius: 3, padding: 1, cursor: 'pointer' }} />
                    )}
                    {szArr.length > 1 && (
                      <select
                        value=""
                        title="Kopieer instellingen van deze zone naar een andere zone"
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'all') copyZoneTo(sz.id, otherIds);
                          else if (val !== '') copyZoneTo(sz.id, [val]);
                        }}
                        style={{ ...inp, fontSize: 10, paddingRight: 4, color: '#475569', maxWidth: 72 }}
                      >
                        <option value="" disabled>→ kopieer</option>
                        {szArr.filter((z) => z.id !== sz.id).map((z) => (
                          <option key={z.id} value={z.id}>→ {z.label ?? z.id}</option>
                        ))}
                        <option value="all">→ Alle zones</option>
                      </select>
                    )}
                    <button
                      onClick={() => onUpdate({ stripZones: szArr.filter((z) => z.id !== sz.id) })}
                      style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 13, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
                      title="Zone verwijderen"
                    >✕</button>
                  </div>
                  {zs.enabled && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <Field label="Label" tip="Naam van deze tekenzone.">
                        <input type="text" value={sz.label ?? ''} onChange={(e) => updZone(sz.id, { label: e.target.value })} style={{ ...inp, width: '100%' }} />
                      </Field>
                      <Field label="Metselverband" tip="Verband voor deze zone (alleen volledig ondersteunde bonds).">
                        <select value={zs.verband === 'staand_tegelverband' ? 'staand_tegelverband' : 'halfsteens'} onChange={(e) => updZone(sz.id, { verband: e.target.value })} style={inp}>
                          <option value="halfsteens">Halfsteens</option>
                          <option value="staand_tegelverband">Staand tegelverband</option>
                        </select>
                      </Field>
                      <Field label="Anker" tip="Uitlijning van het verband: vanuit de linksonderhoek van de zone (eigen anker), of doorlopend op de vlak-oorsprong.">
                        <select value={zs.bondAnchor === 'planeOrigin' ? 'planeOrigin' : 'zoneBottomLeft'} onChange={(e) => updZone(sz.id, { bondAnchor: e.target.value })} style={inp}>
                          <option value="zoneBottomLeft">Zone (linksonder)</option>
                          <option value="planeOrigin">Vlak-oorsprong</option>
                        </select>
                      </Field>
                      <Field label="Steenstrip-artikel" tip="Eigen steenstrip voor deze zone (mag afwijken van de groep). 'Groep-standaard' = volgt de groepskeuze.">
                        <select value={sz.steenstripArtikelId ?? ''}
                          onChange={(e) => {
                            const id = e.target.value || null;
                            const art = id ? STEENSTRIP_CATALOG.find((a) => a.id === id) : null;
                            updZone(sz.id, { steenstripArtikelId: id, material: art ? { ...zm, steenL: art.steenL, steenH: art.steenH } : zm });
                          }}
                          style={inp}>
                          <option value="">Groep-standaard</option>
                          {STEENSTRIP_CATALOG.map((a) => (
                            <option key={a.id} value={a.id}>{a.naam}</option>
                          ))}
                        </select>
                      </Field>
                      {zoneStripArt && (
                        <div style={{ background: '#fdf4ff', border: '1px solid #d8b4fe', borderRadius: 4, padding: '4px 6px', fontSize: 9.5, marginBottom: 2 }}>
                          <div style={{ color: '#64748b', fontSize: 9 }}>{zoneStripArt.steenL}×{zoneStripArt.steenH}×{zoneStripArt.dikte} mm · voeg {zoneStripArt.lint}/{zoneStripArt.stoot} mm</div>
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                        {[['Lengte mm', 'steenL', true], ['Hoogte mm', 'steenH', true], ['Lintvoeg mm', 'lint', false], ['Stootvoeg mm', 'stoot', false]].map(([lbl, key, fromArt]) => {
                          const locked = !!zoneStripArt && fromArt;
                          const val = locked ? (zoneStripArt[key] ?? DEFAULT_MATERIAL[key]) : (zm[key] ?? DEFAULT_MATERIAL[key]);
                          return (
                            <Field key={key} label={lbl}>
                              <input type="number" min={1} step={1} value={val}
                                disabled={locked}
                                onChange={(e) => updZone(sz.id, { material: { ...zm, [key]: Number(e.target.value) } })}
                                style={{ ...inp, width: '100%', opacity: locked ? 0.6 : 1 }} />
                            </Field>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="checkbox" id={`sz-mh-${sz.id}`} checked={zs.maxHoogte !== null}
                          onChange={(e) => updZone(sz.id, { maxHoogte: e.target.checked ? 1000 : null })} />
                        <label htmlFor={`sz-mh-${sz.id}`} style={{ fontSize: 11, color: '#475569', cursor: 'pointer' }}>Max strip hoogte</label>
                        {zs.maxHoogte !== null && (
                          <input type="number" min={0} step={10} value={zs.maxHoogte}
                            onChange={(e) => updZone(sz.id, { maxHoogte: Number(e.target.value) })}
                            style={{ ...inp, width: 60 }} />
                        )}
                        {zs.maxHoogte !== null && <span style={{ fontSize: 10, color: '#94a3b8' }}>mm</span>}
                      </div>

                      {/* ── Achterconstructie per zone ── */}
                      <Field label="Achterconstructie" tip="Eigen achterconstructie voor deze zone. 'Groep-standaard' volgt de groepskeuze.">
                        <select value={zs.zoneBackingType ?? ''} onChange={(e) => updZone(sz.id, { zoneBackingType: e.target.value || null })} style={inp}>
                          <option value="">Groep-standaard ({backingShort(groupBacking)})</option>
                          <option value="hout">Houten achterconstructie</option>
                          <option value="aluminium">Aluminium U-profiel</option>
                          <option value="aluminium_slimfort">SlimFort XT® 4.7</option>
                        </select>
                      </Field>
                      {(zs.zoneBackingType || groupBacking) === 'hout' && (() => {
                        const zLatArt = zs.zoneLattenArtikelId ? BATTEN_CATALOG.find((a) => a.id === zs.zoneLattenArtikelId) : null;
                        const zPlaat = zs.zoneBasisplaatId ? BASISPLAAT_CATALOG.find((p) => p.id === zs.zoneBasisplaatId) : null;
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 4, padding: '5px 6px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#334155', cursor: 'pointer' }}>
                              <input type="checkbox" checked={zs.zoneLattenEnabled ?? false} onChange={(e) => updZone(sz.id, { zoneLattenEnabled: e.target.checked })} />
                              Latten
                            </label>
                            {zs.zoneLattenEnabled && (
                              <Field label="Latten-artikel" tip="Latten-artikel voor deze zone (Mulder's Houtimport).">
                                <select value={zs.zoneLattenArtikelId ?? ''} onChange={(e) => updZone(sz.id, { zoneLattenArtikelId: e.target.value || null })} style={inp}>
                                  <option value="">— kies artikel —</option>
                                  {BATTEN_CATALOG.map((a) => (
                                    <option key={a.id} value={a.id}>{a.naam}</option>
                                  ))}
                                </select>
                              </Field>
                            )}
                            {zLatArt && <div style={{ fontSize: 9, color: '#64748b' }}>{zLatArt.afmetingen} · {zLatArt.brandklasse} · € {zLatArt.prijsM1.toFixed(3)}/m¹</div>}
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#334155', cursor: 'pointer' }}>
                              <input type="checkbox" checked={zs.zonePanelenEnabled ?? false} onChange={(e) => updZone(sz.id, { zonePanelenEnabled: e.target.checked })} />
                              Panelen (basisplaat)
                            </label>
                            {zs.zonePanelenEnabled && (
                              <Field label="Basisplaat" tip="Basisplaat-artikel voor deze zone.">
                                <select value={zs.zoneBasisplaatId ?? ''} onChange={(e) => updZone(sz.id, { zoneBasisplaatId: e.target.value || null })} style={inp}>
                                  <option value="">— kies basisplaat —</option>
                                  {BASISPLAAT_CATALOG.map((p) => (
                                    <option key={p.id} value={p.id}>{p.naam ?? p.id}</option>
                                  ))}
                                </select>
                              </Field>
                            )}
                            {zPlaat && <div style={{ fontSize: 9, color: '#64748b' }}>{zPlaat.dikteMM} mm · {zPlaat.gewichtM2} kg/m²</div>}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </CollapsibleSection>
        );
      })()}

      {(() => {
        const zw = settings.zetwerk ?? {};
        const upd = (patch) => onUpdate({ zetwerk: { ...(settings.zetwerk ?? {}), ...patch } });
        return (
          <CollapsibleSection title="Zetwerk rondom openingen" tip={"Aluminium of stalen randprofiel rondom ramen en deuren.\nWordt in 2D als grijs frame getekend rondom elke sparing.\nDe steenstrips worden automatisch op afstand gehouden.\n\n· Breedte = breedte van het profiel\n· Offset H = ruimte tussen opening en profiel (horizontaal)\n· Offset V = ruimte boven/onder de opening\n· Strip gap = extra vrije ruimte tussen profiel en strips"} isOpen={isOpen('zetwerk')} onToggle={() => toggle('zetwerk')} badge={zw.enabled ? 'Aan' : 'Uit'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <input type="checkbox" id="zw-enable" checked={zw.enabled ?? false}
                onChange={(e) => upd({ enabled: e.target.checked })} />
              <label htmlFor="zw-enable" style={{ fontSize: 11, color: '#475569', cursor: 'pointer' }}>Inschakelen</label>
            </div>
            {zw.enabled && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                {[
                  ['Breedte', 'breedte', 50, 'Breedte van het zetwerk profiel (mm).'],
                  ['Dikte', 'dikte', 2, 'Materiaaldikte van het zetwerk profiel (mm).'],
                  ['Offset H', 'offsetH', 0, 'Horizontale ruimte tussen de kozijnrand en het profiel (mm).'],
                  ['Offset V', 'offsetV', 0, 'Verticale ruimte boven en onder de kozijnrand (mm).'],
                  ['Strip gap', 'stripOffset', 5, 'Extra ruimte die de steenstrips vrijhouden van het profiel (mm).'],
                ].map(([lbl, key, def, tip]) => (
                  <Field key={key} label={`${lbl} mm`} tip={tip}>
                    <input type="number" min={0} step={1} value={zw[key] ?? def}
                      onChange={(e) => upd({ [key]: Number(e.target.value) })}
                      style={{ ...inp, width: '100%' }} />
                  </Field>
                ))}
              </div>
            )}
          </CollapsibleSection>
        );
      })()}

      {(() => {
        const pan = settings.panelen ?? {};
        const upd = (patch) => onUpdate({ panelen: { ...(settings.panelen ?? {}), ...patch } });
        return (
          <CollapsibleSection title="Panelen (basisplaat)" tip={"Verdeelt de geveloppervlakte in draagsysteem-panelen.\nDe panelen vormen de achterste laag waarop de brickslips worden gemonteerd.\nDe indeling volgt de steenstripvoegen voor optimaal snijverlies.\n\n· Breedte = maximale breedte van een basispaneel\n· Hoogte = maximale hoogte van een basispaneel"} isOpen={isOpen('panelen')} onToggle={() => toggle('panelen')} badge={pan.enabled ? 'Aan' : 'Uit'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <input type="checkbox" id="pan-enable" checked={pan.enabled ?? false}
                onChange={(e) => upd({ enabled: e.target.checked })} />
              <label htmlFor="pan-enable" style={{ fontSize: 11, color: '#475569', cursor: 'pointer' }}>Inschakelen</label>
            </div>
            {pan.enabled && (() => {
              const mat = settings.material ?? DEFAULT_MATERIAL;
              const brickW = (mat).brickWeightM2 ?? 40;
              const panW = pan.gewichtM2 ?? 9.4;
              const maxKg = pan.maxKg ?? 50;
              const totalW = Math.max(0.001, brickW + panW);
              const maxM2 = Math.round(maxKg / totalW * 100) / 100;
              const effPanel = computeEffectiveBasePanel(pan, brickW, mat);
              const effectiveH = effPanel.height;
              const inputH = Math.max(100, pan.hoogte ?? 1200);
              const hLimited = effectiveH < inputH;

              const verband = settings.verband ?? DEFAULT_VERBAND;
              const steenH = mat.steenH ?? 50;
              const steenL = mat.steenL ?? 210;
              const lint = mat.lint ?? 12;
              const lagenmaat = verband === 'staand_tegelverband' ? steenL + lint : steenH + lint;
              const malLengte = pan.malLengte ?? 3400;
              const malBreedte = pan.malBreedte ?? 270;
              const FRAME_H = 30;
              const FRAME_LEFT = 40;
              const malInnerW = malLengte - 2 * FRAME_LEFT;
              const malInnerH = malBreedte - 2 * FRAME_H;
              const brickH_local = verband === 'staand_tegelverband' ? steenL : steenH;
              const slotH_local = brickH_local + 3;   // slot-hoogte = steenstrip-hoogte + 3 mm
              const minRowGap = 10;
              const rowsPerMold = Math.min(3, Math.max(1, Math.floor((malInnerH + minRowGap) / (slotH_local + minRowGap))));
              const panelBreedte = pan.breedte ?? 3005;
              const effectiveHFinal = effectiveH;
              const widthFits = panelBreedte <= malInnerW;
              const rowsInEffH = Math.floor(effectiveHFinal / lagenmaat);
              const rawMaxRows = Math.floor(effectiveHFinal / lagenmaat);
              const maxRowsPerPanel = rawMaxRows;
              const moldsPerPanel = maxRowsPerPanel > 0 ? Math.ceil(maxRowsPerPanel / rowsPerMold) : 1;
              const isWild = verband === 'wildverband';

              const VERBANDLABELS = {
                halfsteens: 'Halfsteens',
                tegelverband: 'Tegelverband',
                staand_tegelverband: 'Staand tegelverband',
                wildverband: 'Wildverband',
              };

              return (
                <>
                  {/* ── Basisplaat productfiche keuze ── */}
                  <div style={{ marginBottom: 8 }}>
                    {BASISPLAAT_CATALOG.map((plaat) => {
                      const checked = pan.basisplaatId === plaat.id;
                      return (
                        <label key={plaat.id} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 10,
                          cursor: 'pointer',
                          background: checked ? '#f0fdf4' : '#f8fafc',
                          border: `1px solid ${checked ? '#86efac' : '#e2e8f0'}`,
                          borderRadius: 4, padding: '6px 8px',
                        }}>
                          <input type="radio" name={`basisplaat-${groupId}`} checked={checked}
                            onChange={() => upd({
                              basisplaatId: checked ? null : plaat.id,
                              ...(checked ? {} : {
                                dikte: plaat.dikteMM,
                                gewichtM2: plaat.gewichtM2,
                                breedte: plaat.maxPaneelBreedte,
                              }),
                            })}
                            style={{ marginTop: 2, flexShrink: 0, accentColor: '#16a34a' }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 11, color: '#1e293b' }}>{plaat.naam}</div>
                            <div style={{ fontSize: 9.5, color: '#64748b', marginTop: 1 }}>{plaat.fabrikant}</div>
                            <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 1, lineHeight: 1.3 }}>{plaat.omschrijving}</div>
                            <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 9, color: '#475569' }}><strong>Dikte:</strong> {plaat.dikteMM} mm</span>
                              <span style={{ fontSize: 9, color: '#475569' }}><strong>Gewicht:</strong> {plaat.gewichtM2} kg/m²</span>
                              <span style={{ fontSize: 9, color: '#475569' }}><strong>Plaat:</strong> {plaat.plaatBreedte}×{plaat.plaatLengtes.join('/')} mm</span>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                    <Field label="Breedte mm" tip="Maximale breedte van het basispaneel (mm). Standaard 3005 mm.">
                      <input type="number" min={100} step={50} value={pan.breedte ?? 3005}
                        onChange={(e) => upd({ breedte: Number(e.target.value) })}
                        style={{ ...inp, width: '100%', borderColor: widthFits ? '' : '#dc2626' }} />
                    </Field>
                    <Field label="Hoogte mm" tip="Maximale hoogte van het basispaneel (mm). Standaard 1200 mm.">
                      <input type="number" min={100} step={50} value={pan.hoogte ?? 1200}
                        onChange={(e) => upd({ hoogte: Number(e.target.value) })}
                        style={{ ...inp, width: '100%' }} />
                    </Field>
                    <Field label="Dikte mm" tip="Dikte van het basispaneel (mm). Standaard 18 mm.">
                      <input type="number" min={1} step={1} value={pan.dikte ?? 8}
                        onChange={(e) => upd({ dikte: Number(e.target.value) })}
                        style={{ ...inp, width: '100%' }} />
                    </Field>
                    <Field label="Gewicht (kg/m²)" tip="Gewicht van het basispaneel per vierkante meter (kg/m²). Standaard 11 kg/m².">
                      <input type="number" min={0} step={0.1} value={pan.gewichtM2 ?? 9.4}
                        onChange={(e) => upd({ gewichtM2: Number(e.target.value) })}
                        style={{ ...inp, width: '100%' }} />
                    </Field>
                    <Field label="Max gewicht (kg)" tip="Maximaal gewicht per paneel inclusief brickslips (kg). Bepaalt de maximale paneeloppervlakte en paneel hoogte.">
                      <input type="number" min={1} step={5} value={pan.maxKg ?? 50}
                        onChange={(e) => upd({ maxKg: Number(e.target.value) })}
                        style={{ ...inp, width: '100%' }} />
                    </Field>
                    <Field label="Mal lengte mm" tip="Lengte van de productiemal in mm (horizontale richting = paneelbreedte). Standaard 3400 mm.">
                      <input type="number" min={100} step={50} value={pan.malLengte ?? 3400}
                        onChange={(e) => upd({ malLengte: Number(e.target.value) })}
                        style={{ ...inp, width: '100%' }} />
                    </Field>
                    <Field label="Mal hoogte mm" tip="Hoogte van de productiemal in mm (verticale richting = rijen). Bepaalt hoeveel rijen per maldoorgang. Standaard 270 mm.">
                      <input type="number" min={50} step={10} value={pan.malBreedte ?? 270}
                        onChange={(e) => upd({ malBreedte: Number(e.target.value) })}
                        style={{ ...inp, width: '100%' }} />
                    </Field>
                    <Field label="Mal offset X mm" tip="Horizontale startoffset van het steenstrippatroon binnen de mal (mm). Verschuift het patroon naar rechts binnen de malopening. Gebruik dit om de malindeling af te stemmen op de gevelindeling.">
                      <input type="number" min={0} step={1} value={pan.malOffsetX ?? 0}
                        onChange={(e) => upd({ malOffsetX: Number(e.target.value) })}
                        style={{ ...inp, width: '100%' }} />
                    </Field>
                  </div>
                  <div style={{ fontSize: 11, color: (hLimited || effectiveHFinal < effectiveH) ? '#dc2626' : '#64748b', marginTop: 4 }}>
                    → max {maxM2} m²/paneel · eff. hoogte {effectiveHFinal} mm{(hLimited || effectiveHFinal < effectiveH) ? ' (gewicht begrensd)' : ''}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#475569', cursor: 'pointer', userSelect: 'none' }}>
                      <input type="checkbox" checked={pan.verspringen ?? false}
                        onChange={(e) => upd({ verspringen: e.target.checked })} />
                      Paneelvoegen verspringen (halfsteens)
                    </label>
                  </div>
                  <div style={{ marginTop: 6, padding: '6px 8px', background: widthFits ? '#f0fdf4' : '#fef2f2', border: `1px solid ${widthFits ? '#86efac' : '#fca5a5'}`, borderRadius: 4, fontSize: 10 }}>
                    <div style={{ fontWeight: 700, color: '#1e3a5f', marginBottom: 3 }}>Mal geschiktheid — {VERBANDLABELS[verband] ?? verband}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px', color: '#475569' }}>
                      <span>Lagenmaat:</span><span style={{ fontWeight: 600 }}>{lagenmaat} mm</span>
                      <span>Mal binnenwerk:</span><span style={{ fontWeight: 600 }}>{malInnerW} × {malInnerH} mm</span>
                      <span>Rijen per mal:</span><span style={{ fontWeight: 600 }}>{rowsPerMold}</span>
                      <span>Max rijen/paneel:</span><span style={{ fontWeight: 600 }}>{maxRowsPerPanel} rijen = {maxRowsPerPanel * lagenmaat} mm{isWild && effectiveHFinal < effectiveH ? ' ⚖' : ''}</span>
                      <span>Maldoorgangen/paneel:</span><span style={{ fontWeight: 600 }}>{moldsPerPanel}×</span>
                      <span>Paneelbreedte past:</span>
                      <span style={{ fontWeight: 700, color: widthFits ? '#16a34a' : '#dc2626' }}>
                        {widthFits ? `✓ ${panelBreedte} ≤ ${malInnerW} mm` : `✗ ${panelBreedte} > ${malInnerW} mm!`}
                      </span>
                    </div>
                    {!widthFits && (
                      <div style={{ marginTop: 4, color: '#dc2626', fontWeight: 600 }}>
                        ⚠ Verklein paneelbreedte naar max {malInnerW} mm
                      </div>
                    )}
                    {verband === 'staand_tegelverband' && rowsPerMold === 1 && (
                      <div style={{ marginTop: 4, color: '#92400e', background: '#fef3c7', padding: '3px 6px', borderRadius: 3 }}>
                        ℹ Staand tegelverband: slechts 1 rij per maldoorgang ({lagenmaat} mm hoog)
                      </div>
                    )}

                  </div>

                  {/* Mold template preview per verband */}
                  {(() => {
                    const moldDimsLocal = { hoogte: pan.malBreedte ?? 270, lengte: pan.malLengte ?? 3400, offsetX: pan.malOffsetX ?? 0 };
                    const tpl = getMoldTemplates(verband, mat, moldDimsLocal);
                    const previewW = 240;
                    const scale = previewW / moldDimsLocal.lengte;
                    const previewH = Math.round(moldDimsLocal.hoogte * scale);
                    const COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f87171'];
                    return (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ fontWeight: 700, fontSize: 10, color: '#1e3a5f', marginBottom: 4 }}>
                          Mal-template — {tpl.molds} mal{tpl.molds > 1 ? 'len' : ''}{tpl.rotated ? ' (90° gedraaid)' : ''}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {tpl.templates.map((tmpl, mi) => {
                            const color = COLORS[mi % COLORS.length];
                            const bW = Math.max(1, Math.round(tmpl.brickW * scale));
                            const bH = Math.max(1, Math.round(tmpl.brickH * scale));
                            const lm = Math.max(1, Math.round(tmpl.lagenmaat * scale));
                            const fr = Math.round(tpl.frame * scale);
                            return (
                              <div key={tmpl.id} style={{ flex: '0 0 auto' }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color, marginBottom: 2 }}>MAL-{tmpl.id}</div>
                                <svg width={previewW} height={previewH} style={{ border: '1px solid #cbd5e1', borderRadius: 3, background: '#1e293b', display: 'block' }}>
                                  <rect x={0} y={0} width={previewW} height={previewH} fill="#334155" />
                                  <rect x={fr} y={fr} width={previewW - 2*fr} height={previewH - 2*fr} fill="#1e293b" />
                                  {tmpl.rows.map((row) => {
                                    const yRow = fr + Math.round((tpl.innerH ?? (moldDimsLocal.hoogte - 2*tpl.frame)) * scale / 2 - ((tmpl.rowsPerMold - 1) * lm) / 2) + row.localRow * lm;
                                    if (row.strips) {
                                      return row.strips.map((s, si) => {
                                        const cx = fr + Math.round(s.x * scale);
                                        const cw = Math.max(1, Math.round(s.width * scale));
                                        return <rect key={si} x={cx} y={yRow} width={cw} height={bH} fill={s.koppelstrip ? '#fb923c' : color} fillOpacity={s.koppelstrip ? 0.95 : 0.85} stroke="#1e293b" strokeWidth={0.5} />;
                                      });
                                    }
                                    const off = Math.round(row.offset * scale);
                                    const cs = Math.round(tmpl.colStep * scale);
                                    const bricks = [];
                                    let bx = fr - off;
                                    const innerPW = previewW - 2*fr;
                                    while (bx < fr + innerPW) {
                                      const cx = Math.max(fr, bx);
                                      const cw = Math.min(bx + bW, fr + innerPW) - cx;
                                      if (cw > 0.5) bricks.push({ cx, cw });
                                      bx += cs;
                                    }
                                    return bricks.map(({ cx, cw }, bi) => (
                                      <rect key={bi} x={cx} y={yRow} width={cw} height={bH} fill={color} fillOpacity={0.85} stroke="#1e293b" strokeWidth={0.5} />
                                    ));
                                  })}
                                  <rect x={0} y={0} width={previewW} height={previewH} fill="none" stroke={color} strokeWidth={1.5} />
                                  <text x={fr+2} y={previewH - fr - 2} fontSize={7} fill="#e2e8f0" fontFamily="monospace">
                                    {tmpl.rows.map((r) => r.strips ? `R${r.globalRow+1}` : `R${r.globalRow+1}: ${r.offset}mm`).join(' · ')}
                                  </text>
                                </svg>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </>
              );
            })()}
          </CollapsibleSection>
        );
      })()}

      {(() => {
        const bt = settings.backingType ?? 'hout';
        const substrate = settings.wallSubstrateType ?? 'unknown';
        const substrateColors = { beton: { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8' }, metselwerk: { bg: '#fff7ed', border: '#fdba74', text: '#c2410c' }, hsb: { bg: '#f0fdf4', border: '#86efac', text: '#15803d' }, staal: { bg: '#f8fafc', border: '#94a3b8', text: '#334155' }, unknown: { bg: '#f8fafc', border: '#e2e8f0', text: '#94a3b8' } };
        return (
          <CollapsibleSection
            title="Constructietype"
            tip={"Kies de dragerstructuur achter de steenstrips.\n\n· Wandsubstraat: het materiaal van de dragende wand (auto-gedetecteerd uit IFC naam/type).\n· Houten achterconstructie: horizontale/verticale houten latten (bestaand systeem)\n· Aluminium U-profiel systeem: generieke aluminium U-profielen (legacy)\n· SlimFort XT® 4.7: Isobouw EPS-elementen + stalen brackets + aluminium kokers"}
            isOpen={isOpen('constructietype')}
            onToggle={() => toggle('constructietype')}
            badge={bt === 'aluminium_slimfort' ? 'SlimFort' : bt === 'aluminium' ? 'Aluminium' : 'Hout'}
          >
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#475569', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Wandsubstraat</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {[
                  ['unknown', 'Onbekend'],
                  ['beton', 'Beton'],
                  ['metselwerk', 'Metselwerk'],
                  ['hsb', 'HSB / Hout'],
                  ['staal', 'Staal'],
                ].map(([val, label]) => {
                  const isSel = substrate === val;
                  const c = substrateColors[val] ?? substrateColors.unknown;
                  return (
                    <label key={val} style={{
                      display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, cursor: 'pointer',
                      background: isSel ? c.bg : 'transparent',
                      border: `1px solid ${isSel ? c.border : '#e2e8f0'}`,
                      borderRadius: 4, padding: '3px 7px',
                      color: isSel ? c.text : '#64748b',
                      fontWeight: isSel ? 600 : 400,
                    }}>
                      <input type="radio" name={`substrate-${groupId}`} value={val}
                        checked={isSel}
                        onChange={() => onUpdate({ wallSubstrateType: val })}
                        style={{ margin: 0, accentColor: c.text }} />
                      {label}
                    </label>
                  );
                })}
              </div>
              {substrate === 'beton' && bt === 'hout' && (
                <div style={{ marginTop: 6, background: '#fefce8', border: '1px solid #fde047', borderRadius: 5, padding: '5px 8px', fontSize: 10, color: '#713f12' }}>
                  <strong>Suggestie:</strong> Betonwanden zijn ongeschikt voor houten achterconstructie. Overweeg <em>SlimFort XT® 4.7</em> hieronder.
                  <button
                    onClick={() => onUpdate({ backingType: 'aluminium_slimfort' })}
                    style={{ display: 'block', marginTop: 4, fontSize: 10, padding: '2px 8px', background: '#ca8a04', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', fontWeight: 600 }}>
                    → Overschakelen naar SlimFort
                  </button>
                </div>
              )}
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#475569', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Achterconstructie</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                ['hout', 'Houten achterconstructie', 'Horizontale/verticale houten latten als dragerstructuur', substrate === 'beton'],
                ['aluminium', 'Aluminium U-profiel (generiek)', 'Generieke aluminium U-profielen (legacy modus)', false],
                ['aluminium_slimfort', 'SlimFort XT® 4.7', 'Isobouw EPS-elementen + stalen brackets + aluminium kokers, geen hout', false],
              ].map(([val, label, desc, warn]) => (
                <label key={val} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 11, cursor: 'pointer',
                  background: bt === val ? (val === 'aluminium_slimfort' ? '#fefce8' : val === 'aluminium' ? '#f0f9ff' : '#f0fdf4') : 'transparent',
                  border: `1px solid ${bt === val ? (val === 'aluminium_slimfort' ? '#fde047' : val === 'aluminium' ? '#7dd3fc' : (warn ? '#fca5a5' : '#86efac')) : (warn ? '#fecaca' : '#e2e8f0')}`,
                  borderRadius: 5, padding: '5px 8px',
                  opacity: warn && bt !== val ? 0.7 : 1,
                }}>
                  <input type="radio" name={`backing-${groupId}`} value={val}
                    checked={bt === val}
                    onChange={() => onUpdate({ backingType: val })}
                    style={{ marginTop: 2, flexShrink: 0, accentColor: val === 'aluminium_slimfort' ? '#ca8a04' : val === 'aluminium' ? '#0ea5e9' : '#16a34a' }} />
                  <div>
                    <div style={{ fontWeight: 600, color: '#1e293b', lineHeight: 1.3 }}>{label}{warn && <span style={{ marginLeft: 4, fontSize: 9, color: '#ef4444', fontWeight: 400 }}>niet aanbevolen voor beton</span>}</div>
                    <div style={{ fontSize: 9.5, color: '#64748b', marginTop: 1 }}>{desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </CollapsibleSection>
        );
      })()}

      {(settings.backingType ?? 'hout') !== 'aluminium' && (() => {
        const lat = settings.latten ?? {};
        const upd = (patch) => onUpdate({ latten: { ...(settings.latten ?? {}), ...patch } });
        const selectedArtikelId = (settings.lattenArtikelen ?? [])[0] ?? null;
        const selectedArtikel = selectedArtikelId ? BATTEN_CATALOG.find((a) => a.id === selectedArtikelId) : null;
        const breedte = selectedArtikel ? selectedArtikel.breedteMM : (lat.breedte ?? 50);
        const dikte = selectedArtikel ? selectedArtikel.dikteMM : (lat.dikte ?? 28);
        const brandColors = { 'B-s1,d0': '#dc2626', 'D-s2,d0': '#2563eb' };
        return (
          <CollapsibleSection title="Achterconstructie hout" tip={"Houten latten als dragerstructuur achter de basisplaat.\nHorizontale latten: maximaal interval in hoogte, altijd boven en onder ramen/deuren.\nVerticale latten: op paneelgrenzen (links, midden, rechts).\n\nWanneer een artikel is geselecteerd in 'Latten artikelkeuze' worden breedte en dikte automatisch overgenomen.\n\n· Breedte = breedte van de lat (zichtbaar in gevelaanzicht)\n· Dikte = diepte van de lat (loodrecht op gevel)\n· Max interval = max. hartafstand tussen horizontale latten"} isOpen={isOpen('latten')} onToggle={() => toggle('latten')} badge={lat.enabled ? 'Aan' : 'Uit'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <input type="checkbox" id="lat-enable" checked={lat.enabled ?? false}
                onChange={(e) => upd({ enabled: e.target.checked })} />
              <label htmlFor="lat-enable" style={{ fontSize: 11, color: '#475569', cursor: 'pointer' }}>Inschakelen</label>
            </div>
            {lat.enabled && (
              <>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  {['horizontaal', 'verticaal'].map((r) => (
                    <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', color: '#334155' }}>
                      <input type="radio" name={`lat-richting-${groupId}`} value={r}
                        checked={(lat.richting ?? 'horizontaal') === r}
                        onChange={() => upd({ richting: r })} />
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </label>
                  ))}
                </div>

                {/* Latten-artikelkeuze INLINE (net als de basisplaat onder Panelen) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
                  <div style={{ fontSize: 9.5, color: '#475569', fontWeight: 600 }}>Latten artikelkeuze</div>
                  {BATTEN_CATALOG.map((art) => {
                    const aChecked = art.id === selectedArtikelId;
                    const bColor = brandColors[art.brandklasse] ?? '#64748b';
                    return (
                      <label key={art.id} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 10,
                        cursor: 'pointer', color: aChecked ? '#0f172a' : '#475569',
                        background: aChecked ? '#f0fdf4' : 'transparent',
                        border: `1px solid ${aChecked ? '#86efac' : '#e2e8f0'}`,
                        borderRadius: 4, padding: '4px 6px',
                      }}>
                        <input type="radio" name={`lat-artikel-${groupId}`} checked={aChecked}
                          onChange={() => onUpdate({ lattenArtikelen: aChecked ? [] : [art.id] })}
                          style={{ marginTop: 2, flexShrink: 0, accentColor: '#16a34a' }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 10.5, color: '#1e293b', lineHeight: 1.3 }}>{art.naam}</div>
                          <div style={{ color: '#64748b', fontSize: 9.5, marginTop: 1 }}>{art.afmetingen}</div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ background: bColor, color: '#fff', borderRadius: 3, padding: '1px 5px', fontSize: 9, fontWeight: 600 }}>{art.brandklasse}</span>
                            <span style={{ marginLeft: 'auto', color: '#0f172a', fontWeight: 600, fontSize: 9.5 }}>€ {art.prijsM1.toFixed(3)}/m¹</span>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {selectedArtikel ? (
                  <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 5, padding: '6px 8px', marginBottom: 4 }}>
                    <div style={{ fontSize: 9.5, color: '#64748b', marginBottom: 3 }}>Afmetingen uit geselecteerd artikel:</div>
                    <div style={{ fontWeight: 700, fontSize: 10.5, color: '#1e293b' }}>{selectedArtikel.naam}</div>
                    <div style={{ fontSize: 9.5, color: '#475569', marginTop: 1 }}>{selectedArtikel.afmetingen}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ background: brandColors[selectedArtikel.brandklasse] ?? '#64748b', color: '#fff', borderRadius: 3, padding: '1px 5px', fontSize: 9, fontWeight: 600 }}>{selectedArtikel.brandklasse}</span>
                      <span style={{ fontSize: 10, color: '#334155' }}>Breedte <strong>{breedte} mm</strong></span>
                      <span style={{ fontSize: 10, color: '#334155' }}>Dikte <strong>{dikte} mm</strong></span>
                      <span style={{ fontSize: 9.5, color: '#0f172a', fontWeight: 600, marginLeft: 'auto' }}>€ {selectedArtikel.prijsM1.toFixed(3)}/m¹</span>
                    </div>
                    <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 3 }}>Selecteer een ander artikel in 'Latten artikelkeuze' om te wijzigen.</div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                    <Field label="Breedte mm" tip="Breedte van de houten lat (mm). Dit is de zichtbare maat in het gevelaanzicht.">
                      <input type="number" min={10} step={5} value={lat.breedte ?? 50}
                        onChange={(e) => upd({ breedte: Number(e.target.value) })}
                        style={{ ...inp, width: '100%' }} />
                    </Field>
                    <Field label="Dikte mm" tip="Dikte van de houten lat loodrecht op de gevel (mm).">
                      <input type="number" min={5} step={5} value={lat.dikte ?? 28}
                        onChange={(e) => upd({ dikte: Number(e.target.value) })}
                        style={{ ...inp, width: '100%' }} />
                    </Field>
                  </div>
                )}

                {(lat.richting ?? 'horizontaal') === 'horizontaal' && (
                  <div style={{ marginTop: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <Field label="HOH min mm" tip="Minimale hart-op-hart afstand (mm) voor automatische optimalisatie. Standaard 370 mm.">
                      <input type="number" min={50} max={lat.maxHOH ?? 430} step={1} value={lat.minHOH ?? 370}
                        onChange={(e) => upd({ minHOH: Number(e.target.value) })}
                        style={{ ...inp, width: '100%' }} />
                    </Field>
                    <Field label="HOH max mm" tip="Maximale hart-op-hart afstand (mm) voor automatische optimalisatie. Standaard 430 mm.">
                      <input type="number" min={lat.minHOH ?? 370} max={600} step={1} value={lat.maxHOH ?? 430}
                        onChange={(e) => upd({ maxHOH: Number(e.target.value) })}
                        style={{ ...inp, width: '100%' }} />
                    </Field>
                  </div>
                )}
              </>
            )}
          </CollapsibleSection>
        );
      })()}


      {(settings.backingType ?? 'hout') === 'aluminium' && (() => {
        const ccs = settings.concreteCladdingSettings ?? {};
        const upd = (patch) => onUpdate({ concreteCladdingSettings: { ...(settings.concreteCladdingSettings ?? {}), ...patch } });
        return (
          <CollapsibleSection
            title="Betonwand bekledingsvlakken"
            tip="Bepaal welke vlakken van de betonwand worden bekleed. Per langszijde kunt u het bereik instellen gemeten vanaf de kopse kant."
            isOpen={isOpen('bekledingszone')}
            onToggle={() => toggle('bekledingszone')}
          >
            {(() => {
              const cfcs = { ...CONCRETE_FACE_CLADDING_DEFAULTS, ...(ccs.concreteFaceCladdingSettings ?? {}) };
              const updCfcs = (patch) => upd({ concreteFaceCladdingSettings: { ...cfcs, ...patch } });
              const updRange = (side, patch) => {
                const key = side === 'left' ? 'leftLongFaceRange' : 'rightLongFaceRange';
                updCfcs({ [key]: { ...(cfcs[key] ?? {}), ...patch } });
              };
              const wl = groupWidth ?? 0;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', marginBottom: 1 }}>A. Kopse kanten</div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    {[['cladLeftEndFace', 'Linker kopse kant'], ['cladRightEndFace', 'Rechter kopse kant']].map(([key, label]) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer', color: '#334155' }}>
                        <input type="checkbox" checked={!!cfcs[key]} onChange={(e) => updCfcs({ [key]: e.target.checked })} />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', marginBottom: 1 }}>B. Langszijden</div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    {[['cladLeftLongFace', 'Linker langszijde'], ['cladRightLongFace', 'Rechter langszijde']].map(([key, label]) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer', color: '#334155' }}>
                        <input type="checkbox" checked={!!cfcs[key]} onChange={(e) => updCfcs({ [key]: e.target.checked })} />
                        {label}
                      </label>
                    ))}
                  </div>
                  {(cfcs.cladLeftLongFace || cfcs.cladRightLongFace) && (
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', marginBottom: 1 }}>C. Isolatiebereik per langszijde</div>
                  )}
                  {cfcs.cladLeftLongFace && (() => {
                    const r = cfcs.leftLongFaceRange ?? {};
                    const hint = perpHints.left;
                    const rangeEnd = r.lengthMm != null ? (r.startOffsetMm ?? 0) + r.lengthMm : null;
                    return (
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 5, padding: '6px 8px' }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#334155', marginBottom: 3 }}>Linker langszijde — vanaf linker kopse kant</div>
                        {hint != null ? (
                          <div style={{ fontSize: 9.5, color: '#64748b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>Afstand tot buitenzijde haaks aansluitend vlak: <strong>{hint} mm</strong></span>
                            <button onClick={() => updRange('left', { lengthMm: hint })}
                              style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, border: '1px solid #94a3b8', background: '#f1f5f9', cursor: 'pointer', color: '#475569' }}>
                              Gebruik als lengte
                            </button>
                          </div>
                        ) : (
                          <div style={{ fontSize: 9.5, color: '#94a3b8', marginBottom: 4 }}>Geen haaks aansluitend vlak gevonden</div>
                        )}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                          <Field label="Start (mm)" tip="Begin bekleding op X mm vanaf linker kopse kant.">
                            <input type="number" min={0} step={10} value={r.startOffsetMm ?? 0}
                              onChange={(e) => updRange('left', { startOffsetMm: Math.max(0, Number(e.target.value)) })}
                              style={{ ...inp, width: 65 }} />
                          </Field>
                          <Field label="Lengte (mm)" tip="Lengte bekleding. Leeg = tot einde wand.">
                            <input type="number" min={0} step={50} value={r.lengthMm ?? ''}
                              onChange={(e) => updRange('left', { lengthMm: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
                              placeholder="Volledig" style={{ ...inp, width: 75 }} />
                          </Field>
                        </div>
                        {wl > 0 && rangeEnd != null && (
                          <div style={{ fontSize: 9, color: '#0369a1', marginTop: 3 }}>Bereik: {r.startOffsetMm ?? 0}–{rangeEnd} mm van {wl} mm</div>
                        )}
                      </div>
                    );
                  })()}
                  {cfcs.cladRightLongFace && (() => {
                    const r = cfcs.rightLongFaceRange ?? {};
                    const hint = perpHints.right;
                    const rangeEnd = r.lengthMm != null ? (r.startOffsetMm ?? 0) + r.lengthMm : null;
                    return (
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 5, padding: '6px 8px' }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#334155', marginBottom: 3 }}>Rechter langszijde — vanaf linker kopse kant</div>
                        {hint != null ? (
                          <div style={{ fontSize: 9.5, color: '#64748b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>Afstand tot buitenzijde haaks aansluitend vlak: <strong>{hint} mm</strong></span>
                            <button onClick={() => updRange('right', { lengthMm: hint })}
                              style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, border: '1px solid #94a3b8', background: '#f1f5f9', cursor: 'pointer', color: '#475569' }}>
                              Gebruik als lengte
                            </button>
                          </div>
                        ) : (
                          <div style={{ fontSize: 9.5, color: '#94a3b8', marginBottom: 4 }}>Geen haaks aansluitend vlak gevonden</div>
                        )}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                          <Field label="Start (mm)" tip="Begin bekleding op X mm vanaf linker kopse kant.">
                            <input type="number" min={0} step={10} value={r.startOffsetMm ?? 0}
                              onChange={(e) => updRange('right', { startOffsetMm: Math.max(0, Number(e.target.value)) })}
                              style={{ ...inp, width: 65 }} />
                          </Field>
                          <Field label="Lengte (mm)" tip="Lengte bekleding. Leeg = tot einde wand.">
                            <input type="number" min={0} step={50} value={r.lengthMm ?? ''}
                              onChange={(e) => updRange('right', { lengthMm: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
                              placeholder="Volledig" style={{ ...inp, width: 75 }} />
                          </Field>
                        </div>
                        {wl > 0 && rangeEnd != null && (
                          <div style={{ fontSize: 9, color: '#0369a1', marginTop: 3 }}>Bereik: {r.startOffsetMm ?? 0}–{rangeEnd} mm van {wl} mm</div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </CollapsibleSection>
        );
      })()}

      {(settings.backingType ?? 'hout') === 'aluminium' && (() => {
        const ccs = settings.concreteCladdingSettings ?? {};
        const upd = (patch) => onUpdate({ concreteCladdingSettings: { ...(settings.concreteCladdingSettings ?? {}), ...patch } });
        return (
          <CollapsibleSection
            title="Aluminium U-profiel systeem"
            tip={"Parameters voor het Isobouw SlimFort aluminium draagprofiel systeem.\n\nOpbouw van binnen naar buiten:\n1. Bestaande betonwand\n2. Isolatiepakket (EPS/PUR)\n3. Geïntegreerde bevestigers in isolatie\n4. Verticale aluminium U-profielen\n5. Prefab steenstrip-panelen\n6. Koppelstrippen\n\n· Isolatiedikte: dikte van het isolatiepakket\n· Profiel breedte/diepte: afmetingen van het Al U-profiel\n· Profiel h.o.h.: hartafstand tussen profielen (stemt overeen met paneelgrenzen)\n· Montage-offset: tussenruimte van bevestiger tot betononppervlak\n· Ventilatiespouw: luchtspouw tussen profiel en paneel"}
            isOpen={isOpen('aluminiumprofiel')}
            onToggle={() => toggle('aluminiumprofiel')}
            badge={`h.o.h. ${ccs.uProfileSpacing ?? 600} mm`}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              <Field label="Isolatiedikte (mm)" tip="Dikte van het EPS/PUR isolatiepakket direct tegen het beton.">
                <input type="number" min={0} step={10} value={ccs.insulationThickness ?? 140}
                  onChange={(e) => upd({ insulationThickness: Math.max(0, Number(e.target.value)) })}
                  style={{ ...inp, width: '100%' }} />
              </Field>
              <Field label="Profiel breedte (mm)" tip="Breedte van het aluminium U-profiel (zichtbaar in gevelaanzicht).">
                <input type="number" min={20} step={5} value={ccs.uProfileWidth ?? 60}
                  onChange={(e) => upd({ uProfileWidth: Math.max(20, Number(e.target.value)) })}
                  style={{ ...inp, width: '100%' }} />
              </Field>
              <Field label="Profiel diepte (mm)" tip="Diepte van het aluminium U-profiel (loodrecht op gevel).">
                <input type="number" min={10} step={5} value={ccs.uProfileDepth ?? 30}
                  onChange={(e) => upd({ uProfileDepth: Math.max(10, Number(e.target.value)) })}
                  style={{ ...inp, width: '100%' }} />
              </Field>
              <Field label="Profiel h.o.h. (mm)" tip="Hart-op-hart afstand tussen de verticale aluminium U-profielen. Stemt overeen met paneelbreedte-grenzen.">
                <input type="number" min={100} step={50} value={ccs.uProfileSpacing ?? 600}
                  onChange={(e) => upd({ uProfileSpacing: Math.max(100, Number(e.target.value)) })}
                  style={{ ...inp, width: '100%' }} />
              </Field>
              <Field label="Montage-offset (mm)" tip="Tussenruimte van bevestiger tot betonoppervlak (mm).">
                <input type="number" min={0} step={5} value={ccs.mountingOffset ?? 10}
                  onChange={(e) => upd({ mountingOffset: Math.max(0, Number(e.target.value)) })}
                  style={{ ...inp, width: '100%' }} />
              </Field>
              <Field label="Ventilatiespouw (mm)" tip="Luchtspouw tussen het aluminium profiel en de achterkant van het prefab paneel.">
                <input type="number" min={0} step={5} value={ccs.panelVentilationGap ?? 20}
                  onChange={(e) => upd({ panelVentilationGap: Math.max(0, Number(e.target.value)) })}
                  style={{ ...inp, width: '100%' }} />
              </Field>
            </div>
            <div style={{ marginTop: 8, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 5, padding: '6px 9px' }}>
              <div style={{ fontSize: 9.5, color: '#0369a1', fontWeight: 600, marginBottom: 2 }}>Totale opbouwdikte</div>
              <div style={{ fontSize: 10, color: '#0c4a6e' }}>
                {(ccs.insulationThickness ?? 140) + (ccs.mountingOffset ?? 10) + (ccs.uProfileDepth ?? 30) + (ccs.panelVentilationGap ?? 20)} mm
                <span style={{ color: '#7dd3fc', marginLeft: 8, fontSize: 9 }}>
                  ({ccs.insulationThickness ?? 140} iso + {ccs.mountingOffset ?? 10} offset + {ccs.uProfileDepth ?? 30} profiel + {ccs.panelVentilationGap ?? 20} spouw)
                </span>
              </div>
            </div>
          </CollapsibleSection>
        );
      })()}

      {(settings.backingType ?? 'hout') === 'aluminium_slimfort' && (() => {
        const sf = { ...SLIMFORT_DEFAULTS, ...(settings.slimFortSettings ?? {}) };
        const upd = (patch) => onUpdate({ slimFortSettings: { ...sf, ...patch } });
        return (
          <CollapsibleSection
            title="SlimFort XT® 4.7"
            tip={"Isobouw SlimFort EPS-element systeem.\n\nOpbouw van buiten naar binnen:\n1. Prefab steenstrip-panelen\n2. Aluminium kokers (profiel 44×44)\n3. Stalen brackets (128×60×50 mm)\n4. SlimFort EPS-elementen (1200×600×196 mm)\n5. Bestaande betonwand\n\nEPS-element opbouw (Z-as, buiten→binnen):\n0–116 mm: EPS hoofdlichaam\n116–157 mm: tong/groef-zone\n157–196 mm: achterste EPS-zone\n\nTong: boven + rechts | Groef: onder + links"}
            isOpen={isOpen('slimfort')}
            onToggle={() => toggle('slimfort')}
            badge={`${sf.orientation === 'horizontal' ? 'H' : 'V'} · ${sf.elementLength}×${sf.elementHeight}`}
          >
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Oriëntatie EPS-elementen</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['horizontal', 'Horizontaal (1200 mm breed)'], ['vertical', 'Verticaal (1200 mm hoog)']].map(([val, label]) => (
                  <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', color: '#334155',
                    background: sf.orientation === val ? '#fefce8' : 'transparent', border: `1px solid ${sf.orientation === val ? '#fde047' : '#e2e8f0'}`, borderRadius: 4, padding: '3px 7px' }}>
                    <input type="radio" name={`sf-orient-${groupId}`} value={val} checked={sf.orientation === val}
                      onChange={() => upd({ orientation: val })} style={{ accentColor: '#ca8a04' }} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#475569', marginBottom: 3 }}>EPS-elementen</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, marginBottom: 6 }}>
              <Field label="Elementlengte (mm)" tip="Lengte van het SlimFort EPS-element. Standaard 1200 mm.">
                <input type="number" min={300} step={50} value={sf.elementLength}
                  onChange={(e) => upd({ elementLength: Math.max(300, Number(e.target.value)) })}
                  style={{ ...inp, width: '100%' }} />
              </Field>
              <Field label="Elementhoogte (mm)" tip="Hoogte van het SlimFort EPS-element. Standaard 600 mm.">
                <input type="number" min={200} step={50} value={sf.elementHeight}
                  onChange={(e) => upd({ elementHeight: Math.max(200, Number(e.target.value)) })}
                  style={{ ...inp, width: '100%' }} />
              </Field>
              <Field label="Hoofddikte (mm)" tip="Dikte van het EPS hoofdlichaam (0–116 mm). Standaard 116 mm.">
                <input type="number" min={50} step={1} value={sf.mainThickness}
                  onChange={(e) => { const v = Math.max(50, Number(e.target.value)); upd({ mainThickness: v, totalThickness: v + sf.tongueGrooveDepth + sf.rearZoneThickness }); }}
                  style={{ ...inp, width: '100%' }} />
              </Field>
              <Field label="Tong/groef diepte (mm)" tip="Dikte van de tong/groef-zone. Standaard 41 mm.">
                <input type="number" min={10} step={1} value={sf.tongueGrooveDepth}
                  onChange={(e) => { const v = Math.max(10, Number(e.target.value)); upd({ tongueGrooveDepth: v, totalThickness: sf.mainThickness + v + sf.rearZoneThickness }); }}
                  style={{ ...inp, width: '100%' }} />
              </Field>
              <Field label="Achterste zone (mm)" tip="Dikte van de achterste EPS-zone. Standaard 39 mm.">
                <input type="number" min={10} step={1} value={sf.rearZoneThickness}
                  onChange={(e) => { const v = Math.max(10, Number(e.target.value)); upd({ rearZoneThickness: v, totalThickness: sf.mainThickness + sf.tongueGrooveDepth + v }); }}
                  style={{ ...inp, width: '100%' }} />
              </Field>
              <Field label="Tongbreedte (mm)" tip="Breedte van de tong/groef. Standaard 25 mm.">
                <input type="number" min={5} step={1} value={sf.tongueWidth}
                  onChange={(e) => upd({ tongueWidth: Math.max(5, Number(e.target.value)) })}
                  style={{ ...inp, width: '100%' }} />
              </Field>
            </div>
            <div style={{ background: '#fefce8', border: '1px solid #fde047', borderRadius: 5, padding: '4px 8px', marginBottom: 6, fontSize: 10, color: '#713f12' }}>
              Totale elementdikte: <strong>{sf.mainThickness + sf.tongueGrooveDepth + sf.rearZoneThickness} mm</strong>
              <span style={{ fontSize: 9, color: '#92400e', marginLeft: 8 }}>({sf.mainThickness} + {sf.tongueGrooveDepth} + {sf.rearZoneThickness})</span>
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#475569', marginBottom: 3 }}>Stalen brackets</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3, marginBottom: 6 }}>
              <Field label="Breedte (mm)">
                <input type="number" min={20} step={2} value={sf.bracketWidth}
                  onChange={(e) => upd({ bracketWidth: Math.max(20, Number(e.target.value)) })}
                  style={{ ...inp, width: '100%' }} />
              </Field>
              <Field label="Hoogte (mm)">
                <input type="number" min={20} step={2} value={sf.bracketHeight}
                  onChange={(e) => upd({ bracketHeight: Math.max(20, Number(e.target.value)) })}
                  style={{ ...inp, width: '100%' }} />
              </Field>
              <Field label="Diepte (mm)">
                <input type="number" min={10} step={2} value={sf.bracketDepth}
                  onChange={(e) => upd({ bracketDepth: Math.max(10, Number(e.target.value)) })}
                  style={{ ...inp, width: '100%' }} />
              </Field>
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#475569', marginBottom: 3 }}>Aluminium kokers</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, marginBottom: 6 }}>
              <Field label="Profielbreedte (mm)">
                <input type="number" min={20} step={2} value={sf.profileWidth}
                  onChange={(e) => upd({ profileWidth: Math.max(20, Number(e.target.value)) })}
                  style={{ ...inp, width: '100%' }} />
              </Field>
              <Field label="Profielhoogte (mm)">
                <input type="number" min={20} step={2} value={sf.profileHeight}
                  onChange={(e) => upd({ profileHeight: Math.max(20, Number(e.target.value)) })}
                  style={{ ...inp, width: '100%' }} />
              </Field>
              <Field label="Profieldiepte (mm)">
                <input type="number" min={20} step={2} value={sf.profileDepth}
                  onChange={(e) => upd({ profileDepth: Math.max(20, Number(e.target.value)) })}
                  style={{ ...inp, width: '100%' }} />
              </Field>
              <Field label="Insteekdiepte (mm)" tip="Diepte waarmee het profiel in de EPS-tong/groef steekt.">
                <input type="number" min={5} step={1} value={sf.profileInsertDepth}
                  onChange={(e) => upd({ profileInsertDepth: Math.max(5, Number(e.target.value)) })}
                  style={{ ...inp, width: '100%' }} />
              </Field>
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#475569', marginBottom: 3 }}>Betonwand bekledingsvlakken</div>
            {(() => {
              const cfcs = { ...CONCRETE_FACE_CLADDING_DEFAULTS, ...(sf.concreteFaceCladdingSettings ?? {}) };
              const updCfcs = (patch) => upd({ concreteFaceCladdingSettings: { ...cfcs, ...patch } });
              const updRange = (side, patch) => {
                const key = side === 'left' ? 'leftLongFaceRange' : 'rightLongFaceRange';
                updCfcs({ [key]: { ...(cfcs[key] ?? {}), ...patch } });
              };
              const wl = groupWidth ?? 0;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', marginBottom: 1 }}>A. Kopse kanten</div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    {[['cladLeftEndFace', 'Linker kopse kant'], ['cladRightEndFace', 'Rechter kopse kant']].map(([key, label]) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer', color: '#334155' }}>
                        <input type="checkbox" checked={!!cfcs[key]} onChange={(e) => updCfcs({ [key]: e.target.checked })} />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', marginBottom: 1 }}>B. Langszijden</div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    {[['cladLeftLongFace', 'Linker langszijde'], ['cladRightLongFace', 'Rechter langszijde']].map(([key, label]) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer', color: '#334155' }}>
                        <input type="checkbox" checked={!!cfcs[key]} onChange={(e) => updCfcs({ [key]: e.target.checked })} />
                        {label}
                      </label>
                    ))}
                  </div>
                  {(cfcs.cladLeftLongFace || cfcs.cladRightLongFace) && (
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', marginBottom: 1 }}>C. Isolatiebereik per langszijde</div>
                  )}
                  {cfcs.cladLeftLongFace && (() => {
                    const r = cfcs.leftLongFaceRange ?? {};
                    const hint = perpHints.left;
                    const rangeEnd = r.lengthMm != null ? (r.startOffsetMm ?? 0) + r.lengthMm : null;
                    return (
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 5, padding: '6px 8px' }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#334155', marginBottom: 3 }}>Linker langszijde — vanaf linker kopse kant</div>
                        {hint != null ? (
                          <div style={{ fontSize: 9.5, color: '#64748b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>📐 Afstand tot buitenzijde haaks aansluitend vlak: <strong>{Math.round(hint)} mm</strong></span>
                            <button onClick={() => updRange('left', { lengthMm: Math.round(hint) })}
                              style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, border: '1px solid #94a3b8', background: '#f1f5f9', cursor: 'pointer', color: '#475569' }}>
                              Gebruik als lengte
                            </button>
                          </div>
                        ) : (
                          <div style={{ fontSize: 9.5, color: '#94a3b8', marginBottom: 4 }}>Geen haaks aansluitend vlak gevonden</div>
                        )}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                          <Field label="Start (mm)" tip="Begin bekleding op X mm vanaf linker kopse kant.">
                            <input type="number" min={0} step={10} value={r.startOffsetMm ?? 0}
                              onChange={(e) => updRange('left', { startOffsetMm: Math.max(0, Number(e.target.value)) })}
                              style={{ ...inp, width: 65 }} />
                          </Field>
                          <Field label="Lengte (mm)" tip="Lengte bekleding. Leeg = tot einde wand.">
                            <input type="number" min={0} step={50} value={r.lengthMm ?? ''}
                              onChange={(e) => updRange('left', { lengthMm: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
                              placeholder="Volledig" style={{ ...inp, width: 75 }} />
                          </Field>
                        </div>
                        {wl > 0 && rangeEnd != null && (
                          <div style={{ fontSize: 9, color: '#0369a1', marginTop: 3 }}>Bereik: {r.startOffsetMm ?? 0}–{rangeEnd} mm van {wl} mm</div>
                        )}
                      </div>
                    );
                  })()}
                  {cfcs.cladRightLongFace && (() => {
                    const r = cfcs.rightLongFaceRange ?? {};
                    const hint = perpHints.right;
                    const rangeEnd = r.lengthMm != null ? (r.startOffsetMm ?? 0) + r.lengthMm : null;
                    return (
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 5, padding: '6px 8px' }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#334155', marginBottom: 3 }}>Rechter langszijde — vanaf linker kopse kant</div>
                        {hint != null ? (
                          <div style={{ fontSize: 9.5, color: '#64748b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>📐 Afstand tot buitenzijde haaks aansluitend vlak: <strong>{Math.round(hint)} mm</strong></span>
                            <button onClick={() => updRange('right', { lengthMm: Math.round(hint) })}
                              style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, border: '1px solid #94a3b8', background: '#f1f5f9', cursor: 'pointer', color: '#475569' }}>
                              Gebruik als lengte
                            </button>
                          </div>
                        ) : (
                          <div style={{ fontSize: 9.5, color: '#94a3b8', marginBottom: 4 }}>Geen haaks aansluitend vlak gevonden</div>
                        )}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                          <Field label="Start (mm)" tip="Begin bekleding op X mm vanaf linker kopse kant.">
                            <input type="number" min={0} step={10} value={r.startOffsetMm ?? 0}
                              onChange={(e) => updRange('right', { startOffsetMm: Math.max(0, Number(e.target.value)) })}
                              style={{ ...inp, width: 65 }} />
                          </Field>
                          <Field label="Lengte (mm)" tip="Lengte bekleding. Leeg = tot einde wand.">
                            <input type="number" min={0} step={50} value={r.lengthMm ?? ''}
                              onChange={(e) => updRange('right', { lengthMm: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
                              placeholder="Volledig" style={{ ...inp, width: 75 }} />
                          </Field>
                        </div>
                        {wl > 0 && rangeEnd != null && (
                          <div style={{ fontSize: 9, color: '#0369a1', marginTop: 3 }}>Bereik: {r.startOffsetMm ?? 0}–{rangeEnd} mm van {wl} mm</div>
                        )}
                      </div>
                    );
                  })()}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', color: '#64748b' }}>
                    <input type="checkbox" checked={!!sf.debugSlimFort}
                      onChange={(e) => upd({ debugSlimFort: e.target.checked })} />
                    Debug-modus
                  </label>
                </div>
              );
            })()}
          </CollapsibleSection>
        );
      })()}

      {(() => {
        const selectedStripId = (settings.steenstripsArtikelen ?? [])[0] ?? null;
        const selectStrip = (id) => {
          if (id === selectedStripId) {
            onUpdate({ steenstripsArtikelen: [] });
          } else {
            const art = STEENSTRIP_CATALOG.find((a) => a.id === id);
            if (art) {
              onUpdate({
                steenstripsArtikelen: [id],
                brickDepth: art.dikte,
                material: {
                  ...(settings.material ?? {}),
                  steenL: art.steenL,
                  steenH: art.steenH,
                  brickWeightM2: art.brickWeightM2,
                },
              });
            }
          }
        };
        const formatColors = { WF: '#92400e', DF: '#065f46', NF: '#1e3a8a', Klinker: '#4c1d95', LF: '#9a3412' };
        return (
          <CollapsibleSection
            title="Steenstrips artikelkeuze"
            tip={"Selecteer één steenstriptype uit de catalogus.\nHet gekozen artikel vult automatisch de afmetingen in bij 'Steenstrip afmetingen':\nLengte, hoogte, dikte en gewicht per m².\nLintvoeg en stootvoeg blijven vrij invulbaar.\nKlik nogmaals op een artikel om de selectie op te heffen.\n\nTip: voeg eigen prijzen toe via de prijslijst-upload (CSV)."}
            isOpen={isOpen('steenstripsArtikelen')}
            onToggle={() => toggle('steenstripsArtikelen')}
            badge={selectedStripId ? '1 gekozen' : null}
          >
            {(() => {
              const allFabrikanten = [...new Set(STEENSTRIP_CATALOG.map((a) => a.fabrikant).filter(Boolean))];
              const allFormaten = [...new Set(STEENSTRIP_CATALOG.map((a) => a.formatCode).filter(Boolean))];
              const zoekLower = stripZoek.toLowerCase();
              const filtered = STEENSTRIP_CATALOG.filter((a) => {
                if (stripFabrikant && a.fabrikant !== stripFabrikant) return false;
                if (stripFormat && a.formatCode !== stripFormat) return false;
                if (zoekLower) {
                  const haystack = [a.naam, a.kleur, a.kleurOmschrijving, a.behandeling, a.artikelnummer, a.fabrikant].filter(Boolean).join(' ').toLowerCase();
                  if (!haystack.includes(zoekLower)) return false;
                }
                return true;
              });
              const btnBase = { fontSize: 9, padding: '2px 6px', borderRadius: 3, cursor: 'pointer', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#475569', whiteSpace: 'nowrap' };
              const btnActive = { ...btnBase, background: '#7c3aed', color: '#fff', border: '1px solid #7c3aed', fontWeight: 600 };
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 4, borderBottom: '1px solid #e2e8f0' }}>
                    <input
                      type="text"
                      placeholder="Zoek op naam, kleur, artikel#…"
                      value={stripZoek}
                      onChange={(e) => setStripZoek(e.target.value)}
                      style={{ fontSize: 10, padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: 3, outline: 'none', color: '#1e293b' }}
                    />
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 9, color: '#94a3b8', alignSelf: 'center', marginRight: 2 }}>Leverancier:</span>
                      <button style={stripFabrikant === '' ? btnActive : btnBase} onClick={() => setStripFabrikant('')}>Alle</button>
                      {allFabrikanten.map((f) => {
                        const label = f.includes('Wienerberger') ? 'Wienerberger' : f.includes('FRONT') ? 'FRONT' : f.includes('Eigen') ? 'Generiek' : f;
                        return <button key={f} style={stripFabrikant === f ? btnActive : btnBase} onClick={() => setStripFabrikant(f === stripFabrikant ? '' : f)}>{label}</button>;
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 9, color: '#94a3b8', alignSelf: 'center', marginRight: 2 }}>Formaat:</span>
                      <button style={stripFormat === '' ? btnActive : btnBase} onClick={() => setStripFormat('')}>Alle</button>
                      {allFormaten.map((f) => (
                        <button key={f} style={stripFormat === f ? btnActive : btnBase} onClick={() => setStripFormat(f === stripFormat ? '' : f)}>{f}</button>
                      ))}
                    </div>
                    {(stripFabrikant || stripFormat || stripZoek) && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 9, color: '#64748b' }}>{filtered.length} van {STEENSTRIP_CATALOG.length} artikelen</span>
                        <button style={{ ...btnBase, color: '#ef4444', borderColor: '#fca5a5' }} onClick={() => { setStripFabrikant(''); setStripFormat(''); setStripZoek(''); }}>✕ Wis filter</button>
                      </div>
                    )}
                  </div>
                  {filtered.length === 0 && (
                    <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', padding: '8px 0' }}>Geen artikelen gevonden</div>
                  )}
                  {filtered.map((art) => {
                    const checked = art.id === selectedStripId;
                    const fColor = formatColors[art.formatCode] ?? '#64748b';
                    return (
                      <label key={art.id} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 10,
                        cursor: 'pointer', color: checked ? '#0f172a' : '#475569',
                        background: checked ? '#fdf4ff' : 'transparent',
                        border: `1px solid ${checked ? '#d8b4fe' : '#e2e8f0'}`,
                        borderRadius: 4, padding: '4px 6px',
                      }}>
                        <input type="radio" name={`strip-artikel-${groupId}`} checked={checked}
                          onChange={() => selectStrip(art.id)}
                          style={{ marginTop: 2, flexShrink: 0, accentColor: '#7c3aed' }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 10.5, color: '#1e293b', lineHeight: 1.3 }}>{art.naam}</div>
                          <div style={{ color: '#475569', fontSize: 9, marginTop: 1, fontStyle: 'italic' }}>{art.fabrikant}{art.serie ? ` — ${art.serie}` : ''}</div>
                          <div style={{ color: '#64748b', fontSize: 9, marginTop: 1 }}>
                            {[art.behandeling, art.kleurOmschrijving ?? art.kleur].filter(Boolean).join(' · ')}
                            {art.artikelnummer && <span style={{ color: '#94a3b8', marginLeft: 4 }}>#{art.artikelnummer}</span>}
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ background: fColor, color: '#fff', borderRadius: 3, padding: '1px 5px', fontSize: 9, fontWeight: 600 }}>{art.formatCode}</span>
                            <span style={{ color: '#64748b', fontSize: 9 }}>{art.steenL}×{art.steenH}×{art.dikte} mm</span>
                            <span style={{ color: '#64748b', fontSize: 9 }}>voeg {art.lint}/{art.stoot} mm</span>
                            <span style={{ color: '#64748b', fontSize: 9 }}>{art.stuksPerM2} st/m²</span>
                            <span style={{ color: '#64748b', fontSize: 9 }}>{art.brickWeightM2} kg/m²</span>
                            {art.prijsPerStuk != null
                              ? <span style={{ marginLeft: 'auto', color: '#0f172a', fontWeight: 600, fontSize: 9.5 }}>€ {art.prijsPerStuk.toFixed(3)}/st · € {art.prijsM2.toFixed(2)}/m²</span>
                              : <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: 9 }}>prijs n.t.b.</span>
                            }
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              );
            })()}
          </CollapsibleSection>
        );
      })()}

      {(() => {
        const vis = settings.layerVisibility ?? {};
        const updVis = (patch) => onUpdate({ layerVisibility: { ...(settings.layerVisibility ?? {}), ...patch } });
        return (
          <CollapsibleSection title="Laagzichtbaarheid 2D" tip={"Schakel lagen aan of uit in het 2D gevelaanzicht.\nEen laag uitzetten verbergt deze in de 2D visualisatie maar beïnvloedt de instellingen niet.\n\n· Steenstrips = de brickslip-stenen op de gevel\n· Zetwerk = het randprofiel rondom sparingen\n· Panelen = de draagpanelen achter de strips\n· Latten = de houten achterconstructie-latten"} isOpen={isOpen('lagen')} onToggle={() => toggle('lagen')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[
                ['strips', 'Steenstrips', 'De brickslip-steenstrips op de gevel zichtbaar tonen.'],
                ['zetwerk', 'Zetwerk', 'Het aluminium of stalen randprofiel rondom sparingen tonen.'],
                ['panelen', 'Panelen', 'De draagpanelen achter de brickslips tonen.'],
                ['latten', 'Latten', 'De houten achterconstructie-latten tonen.'],
                ['penanten', 'Penanten', 'De penanten (kolommen) op de gevel zichtbaar tonen.'],
              ].map(([key, label, tip]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', color: '#334155' }}>
                  <input type="checkbox"
                    checked={vis[key] !== false}
                    onChange={(e) => updVis({ [key]: e.target.checked })} />
                  {label}
                  <InfoIcon tip={tip} />
                </label>
              ))}
            </div>
          </CollapsibleSection>
        );
      })()}
      {(() => {
        const ifcVis = settings.ifcLayerVisibility ?? {};
        const updIfcVis = (patch) => onUpdate({ ifcLayerVisibility: { ...(settings.ifcLayerVisibility ?? {}), ...patch } });
        return (
          <CollapsibleSection title="Laagzichtbaarheid IFC-export" tip={"Schakel lagen aan of uit voor de IFC-export.\nDeze instelling bepaalt welke lagen in het geëxporteerde IFC-bestand worden opgenomen.\nDe berekeningen en het 2D-aanzicht worden hierdoor niet beïnvloed.\n\n· Steenstrips = de brickslip-stenen op de gevel\n· Zetwerk = het randprofiel rondom sparingen\n· Panelen = de draagpanelen achter de strips\n· Latten = de houten achterconstructie-latten"} isOpen={isOpen('ifclagen')} onToggle={() => toggle('ifclagen')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[
                ['strips', 'Steenstrips', 'De brickslip-steenstrips in de IFC-export opnemen.'],
                ['zetwerk', 'Zetwerk', 'Het zetwerk in de IFC-export opnemen. Uitzetten laat het zetwerk weg uit de IFC, maar de regels rondom sparingen blijven intact.'],
                ['panelen', 'Panelen', 'De draagpanelen in de IFC-export opnemen.'],
                ['latten', 'Latten', 'De achterconstructie-latten in de IFC-export opnemen.'],
              ].map(([key, label, tip]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', color: '#334155' }}>
                  <input type="checkbox"
                    checked={ifcVis[key] !== false}
                    onChange={(e) => updIfcVis({ [key]: e.target.checked })} />
                  {label}
                  <InfoIcon tip={tip} />
                </label>
              ))}
            </div>
          </CollapsibleSection>
        );
      })()}
      <CollapsibleSection title="EPC / Zaaglijst" tip={"Instellingen voor de paneel-identificatie (EPC-16 code).\n\n· Projectnummer = 5-cijferig projectnummer (bijv. 22023)\n· Level = verdiepingsnummer (0 = begane grond)\n\nDe EPC code volgt het formaat:\nP-PPPPP-LL-SS-EE-NNN-T\n(Entiteit - Project - Level - Stramien start - Stramien eind - Volgnummer - Type)"} isOpen={isOpen('epc')} onToggle={() => toggle('epc')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, color: '#475569' }}>
            Projectnummer (max 5 tekens)
            <input type="text" maxLength={5}
              value={settings.epcProjectNummer ?? ''}
              onChange={(e) => onUpdate({ epcProjectNummer: e.target.value.replace(/[^0-9A-Z]/gi, '').toUpperCase().slice(0,5) })}
              placeholder="22023"
              style={{ display: 'block', width: '100%', marginTop: 3, padding: '3px 6px', fontSize: 11, border: '1px solid #cbd5e1', borderRadius: 4, fontFamily: 'monospace', letterSpacing: '0.05em' }} />
          </label>
          <label style={{ fontSize: 11, color: '#475569' }}>
            Level (verdiepingsnummer)
            <input type="number" min={0} max={99}
              value={settings.epcLevel ?? 0}
              onChange={(e) => onUpdate({ epcLevel: Math.max(0, Math.min(99, parseInt(e.target.value) || 0)) })}
              style={{ display: 'block', width: '100%', marginTop: 3, padding: '3px 6px', fontSize: 11, border: '1px solid #cbd5e1', borderRadius: 4 }} />
          </label>
          {(settings.epcProjectNummer) && (
            <div style={{ fontSize: 9, color: '#94a3b8', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 3, padding: '4px 6px', fontFamily: 'monospace' }}>
              Voorbeeld: P-{(settings.epcProjectNummer ?? '00000').padStart(5,'0')}-{String(settings.epcLevel ?? 0).padStart(2,'0')}-Z1-Z1-001-V
            </div>
          )}
        </div>
      </CollapsibleSection>

      {(() => {
        const myCorners = Object.entries(cornerConfigs).filter(([, cfg]) =>
          cfg.mainGroupId === groupId || cfg.secondaryGroupId === groupId
        );
        const availableGroups = allGroups.filter((g) => {
          if (g.id === groupId) return false;
          const key = cornerConfigKey(groupId, g.id);
          if (cornerConfigs[key]) return false;
          if (adjacentGroupIds !== null && !adjacentGroupIds.has(g.id)) return false;
          return true;
        });
        const hoekContent = (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {myCorners.length === 0 && (
                <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Geen hoekoplossingen ingesteld.</div>
              )}
              {myCorners.map(([cornerId, cfg]) => {
                const isMain = cfg.mainGroupId === groupId;
                const otherGroupId = isMain ? cfg.secondaryGroupId : cfg.mainGroupId;
                const otherGroup = allGroups.find((g) => g.id === otherGroupId);
                const otherSettings = getSettings ? getSettings(otherGroupId) : {};
                const mainS = isMain ? settings : otherSettings;
                const secS = isMain ? otherSettings : settings;
                const offsets = computeCornerOffsets(mainS, secS);
                const myOffsets = isMain ? offsets.main : offsets.secondary;
                const otherName = (getSettings ? getSettings(otherGroupId)?.name : null) ?? otherGroupId;
                return (
                  <div key={cornerId} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 5, padding: '8px 10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, background: '#dbeafe', color: '#1d4ed8', borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap' }}>Aanzichtsgevel</span>
                          <span style={{ fontSize: 11, color: '#0f172a', fontWeight: isMain ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {isMain ? (settings.name ?? groupId) : otherName}
                            {isMain && <span style={{ fontSize: 9, color: '#64748b', fontWeight: 400, marginLeft: 4 }}>(deze groep)</span>}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, background: '#fef3c7', color: '#92400e', borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap' }}>Aansluitende gevel</span>
                          <span style={{ fontSize: 11, color: '#0f172a', fontWeight: !isMain ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {!isMain ? (settings.name ?? groupId) : otherName}
                            {!isMain && <span style={{ fontSize: 9, color: '#64748b', fontWeight: 400, marginLeft: 4 }}>(deze groep)</span>}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 6 }}>
                        <button
                          title="Rol omwisselen"
                          onClick={() => onUpdateCorner(cornerId, { mainGroupId: cfg.secondaryGroupId, secondaryGroupId: cfg.mainGroupId })}
                          style={{ fontSize: 10, background: '#e2e8f0', border: 'none', borderRadius: 3, padding: '2px 6px', cursor: 'pointer', color: '#475569', whiteSpace: 'nowrap' }}
                        >
                          ⇄ Wissel
                        </button>
                        <button
                          title="Hoekoplossing verwijderen"
                          onClick={() => onRemoveCorner(cornerId)}
                          style={{ fontSize: 10, background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px 4px' }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>
                      Type: <strong>Stompe aansluiting</strong>
                    </div>
                    {(() => {
                      const mainGroupObj = allGroups.find((g) => g.id === cfg.mainGroupId);
                      const secGroupObj  = allGroups.find((g) => g.id === cfg.secondaryGroupId);
                      const mainS = getSettings ? getSettings(cfg.mainGroupId) : {};
                      const secS  = getSettings ? getSettings(cfg.secondaryGroupId) : {};
                      const mainWalls = mainGroupObj ? mainGroupObj.wallIds.map((id) => wallMap[id]).filter((w) => w && w.wallOrigin) : [];
                      const secWalls  = secGroupObj  ? secGroupObj.wallIds.map((id) => wallMap[id]).filter((w) => w && w.wallOrigin) : [];
                      const wallThk = (walls) => walls.length ? Math.round(Math.max(...walls.map((w) => Math.abs((w.wallOrigin.thicknessEnd ?? (w.wallOrigin.thicknessStart + (w.thickness ?? 0))) - w.wallOrigin.thicknessStart)))) : 0;
                      const mainWT = wallThk(mainWalls);
                      const secWT  = wallThk(secWalls);
                      const pkgOf = (s) => {
                        const artId = (s.lattenArtikelen ?? [])[0] ?? null;
                        const art = artId ? BATTEN_CATALOG.find((a) => a.id === artId) : null;
                        const lat = s.latten?.enabled !== false ? (art ? art.dikteMM : (s.latten?.dikte ?? 28)) : 0;
                        const pan = s.panelen?.enabled !== false ? (s.panelen?.dikte ?? 8) : 0;
                        const str = s.brickDepth ?? 20;
                        return { lat, pan, str, total: lat + pan + str };
                      };
                      const mainPkg = pkgOf(mainS);
                      const secPkg  = pkgOf(secS);
                      const overgangsvoeg = cfg.overgangsvoeg ?? 10;
                      const mainIntEnd = detectSecondaryCornerEnd(secWalls, mainWalls);
                      const secIntEnd  = detectSecondaryCornerEnd(mainWalls, secWalls);
                      const mainInFront = detectMainInFront(secWalls, mainWalls);
                      const visualEnd = (intEnd, s) => intEnd ? (s.outsideDirFlip ? (intEnd === 'left' ? 'right' : 'left') : intEnd) : null;
                      const mainVisEnd = visualEnd(mainIntEnd, mainS);
                      const secVisEnd  = visualEnd(secIntEnd, secS);
                      const endLbl = (ve) => ve === 'left' ? 'links' : ve === 'right' ? 'rechts' : '?';
                      const mSugStrips  = mainInFront ? secPkg.total                         : secWT + secPkg.total;
                      const mSugLatten  = mainInFront ? secPkg.lat                          : secWT + secPkg.lat;
                      const mSugPanelen = mainInFront ? secPkg.lat                          : secWT + secPkg.lat;
                      // corner85 fixt ALLEEN de TRUE-oriëntatie (main vóór; schematiek = waarheidsbron).
                      // FALSE-oriëntatie (main achter) = onvoorwaardelijk het origineel — de juiste
                      // FALSE-offset volgt niet uit de schematiek en is niet zonder runtime-meting vast te leggen.
                      const sSugStrips  = mainInFront
                        ? (isCorner85() ? mainPkg.lat + mainPkg.pan - CORNER85_STRIP_GAP : mainPkg.lat + overgangsvoeg)
                        : mainPkg.total - secPkg.str - overgangsvoeg;
                      const sSugLatten  = mainInFront
                        ? (isCorner85() ? mainWT - CORNER85_LAT_GAP : mainWT - overgangsvoeg)
                        : -overgangsvoeg;
                      const sSugPanelen = mainInFront
                        ? (isCorner85() ? mainPkg.lat + mainPkg.pan - CORNER85_STRIP_GAP : mainPkg.lat + overgangsvoeg)
                        : mainPkg.total - secPkg.str - overgangsvoeg;
                      const applyGroup = (gid, intEnd, s, sugStrips, sugLatten, sugPanelen) => {
                        if (!intEnd) return;
                        const ee = s.endExtensions ?? {};
                        const cur = ee[intEnd] ?? {};
                        const patch = { endExtensions: { ...ee, [intEnd]: { ...cur, strips: sugStrips, battens: sugLatten, panels: sugPanelen } } };
                        if (gid === groupId) onUpdate(patch);
                        else onUpdateGroupSettings?.(gid, patch);
                      };
                      const applyAll = () => {
                        applyGroup(cfg.mainGroupId, mainIntEnd, mainS, mSugStrips, mSugLatten, mSugPanelen);
                        applyGroup(cfg.secondaryGroupId, secIntEnd, secS, sSugStrips, sSugLatten, sSugPanelen);
                      };
                      const canApply = !!(mainIntEnd && secIntEnd);
                      const row = (lbl, val, hint) => (
                        <Fragment key={lbl}>
                          <span>{lbl}</span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>+{val} mm <span style={{ color: '#6b7280', fontWeight: 400 }}>({hint})</span></span>
                        </Fragment>
                      );
                      return (
                        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                            <span style={{ color: '#475569', whiteSpace: 'nowrap' }}>Overgangsvoeg</span>
                            <input
                              type="number"
                              step={1}
                              value={cfg.overgangsvoeg ?? 10}
                              onChange={(e) => {
                                const newOG = Number(e.target.value);
                                onUpdateCorner(cornerId, { overgangsvoeg: newOG });
                              }}
                              style={{ ...inp, width: 60 }}
                            />
                            <span style={{ color: '#94a3b8' }}>mm</span>
                          </div>
                          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 4, padding: '6px 8px', fontSize: 10 }}>
                            <div style={{ fontWeight: 600, color: '#1d4ed8', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span>Aanzichtsgevel ({mainS.name ?? cfg.mainGroupId}) — {endLbl(mainVisEnd)} uiteinde</span>
                              {cfg.mainGroupId === groupId && <span style={{ fontWeight: 400, color: '#6b7280' }}>(deze groep)</span>}
                              <span style={{ fontSize: 9, background: mainInFront ? '#dcfce7' : '#fef9c3', color: mainInFront ? '#166534' : '#854d0e', borderRadius: 2, padding: '1px 4px', fontWeight: 700 }}>
                                {mainInFront ? 'loopt voor' : 'loopt achter'}
                              </span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 8px', color: '#374151' }}>
                              {row('Strips',  mSugStrips,  mainInFront ? `${secPkg.lat}+${secPkg.pan}` : `${secWT}+${secPkg.lat}+${secPkg.pan}`)}
                              {row('Latten',  mSugLatten,  mainInFront ? `${secPkg.lat}` : `${secWT}+${secPkg.lat}`)}
                              {row('Panelen', mSugPanelen, mainInFront ? `${secPkg.lat}+${secPkg.pan}` : `${secWT}+${secPkg.lat}+${secPkg.pan}`)}
                            </div>
                          </div>
                          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '6px 8px', fontSize: 10 }}>
                            <div style={{ fontWeight: 600, color: '#92400e', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span>Aansluitende gevel ({secS.name ?? cfg.secondaryGroupId}) — {endLbl(secVisEnd)} uiteinde</span>
                              {cfg.secondaryGroupId === groupId && <span style={{ fontWeight: 400, color: '#6b7280' }}>(deze groep)</span>}
                              <span style={{ fontSize: 9, background: mainInFront ? '#fef9c3' : '#dcfce7', color: mainInFront ? '#854d0e' : '#166534', borderRadius: 2, padding: '1px 4px', fontWeight: 700 }}>
                                {mainInFront ? 'loopt achter' : 'loopt voor'}
                              </span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 8px', color: '#374151' }}>
                              {row('Strips',  sSugStrips,  `${mainPkg.lat}+${overgangsvoeg}`)}
                              {row('Latten',  sSugLatten,  mainInFront ? `${mainWT}-10` : `-10`)}
                              {row('Panelen', sSugPanelen, `${mainPkg.lat}+${overgangsvoeg}`)}
                            </div>
                          </div>
                          <button
                            disabled={!canApply}
                            onClick={applyAll}
                            style={{ fontSize: 10, background: canApply ? '#0f766e' : '#e2e8f0', color: canApply ? '#fff' : '#94a3b8', border: 'none', borderRadius: 3, padding: '4px 10px', cursor: canApply ? 'pointer' : 'default', width: '100%', fontWeight: 600 }}
                          >
                            {canApply ? '✓ Alle voorstellen toepassen' : '— Uiteinden niet automatisch bepaald'}
                          </button>
                        </div>
                      );
                    })()}
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 9, color: '#64748b', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Horizontaal aansluitdetail (plattegrond)</div>
                      <div style={{ overflowX: 'auto' }}>
                        <HoekAansluitDetail mainS={isMain ? settings : otherSettings} secS={isMain ? otherSettings : settings} />
                      </div>
                    </div>
                  </div>
                );
              })}
              {availableGroups.length > 0 && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                  <select
                    value={newCornerGroupId}
                    onChange={(e) => setNewCornerGroupId(e.target.value)}
                    style={{ flex: 1, fontSize: 11, border: '1px solid #cbd5e1', borderRadius: 4, padding: '3px 6px' }}
                  >
                    <option value="">— kies aansluitende groep —</option>
                    {availableGroups.map((g) => {
                      const gName = (getSettings ? getSettings(g.id)?.name : null) ?? g.id;
                      return <option key={g.id} value={g.id}>{gName}</option>;
                    })}
                  </select>
                  <button
                    disabled={!newCornerGroupId}
                    onClick={() => {
                      if (!newCornerGroupId) return;
                      onAddCorner(newCornerGroupId);
                      setNewCornerGroupId('');
                    }}
                    style={{ fontSize: 11, background: newCornerGroupId ? '#1d4ed8' : '#e2e8f0', color: newCornerGroupId ? '#fff' : '#94a3b8', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: newCornerGroupId ? 'pointer' : 'default', whiteSpace: 'nowrap' }}
                  >
                    + Toevoegen
                  </button>
                </div>
              )}
              {availableGroups.length === 0 && allGroups.length > 1 && (
                <div style={{ fontSize: 10, color: '#94a3b8' }}>
                  {myCorners.length > 0
                    ? 'Alle aangrenzende gevels zijn al gekoppeld.'
                    : adjacentGroupIds !== null && adjacentGroupIds.size === 0
                      ? 'Geen aangrenzende gevels gedetecteerd (geen loodrechte wanden).'
                      : null}
                </div>
              )}
            </div>
        );
        return cornerFloat ? (
          <DraggableFloatingPanel
            title={`Hoekoplossingen — ${settings.name ?? groupId}${myCorners.length > 0 ? ` (${myCorners.length})` : ''}`}
            onDock={() => setCornerFloat(false)}
          >
            {hoekContent}
          </DraggableFloatingPanel>
        ) : (
          <CollapsibleSection
            title="Hoekoplossingen"
            tip={"Definieer hoekoplossingen met aangrenzende gevels.\n\n· Stompe aansluiting: aanzichtsgevel loopt door tot buitenzijde aansluitende gevel. Aansluitende gevel stopt op stootvoegafstand.\n\nOffsets worden automatisch berekend op basis van stripdikte, paneeldikte en latdikte."}
            isOpen={isOpen('hoek')}
            onToggle={() => toggle('hoek')}
            badge={myCorners.length > 0 ? String(myCorners.length) : null}
            extra={<button onClick={() => { setCornerFloat(true); }} title="Zet als zwevend venster" style={{ fontSize: 11, background: 'none', border: '1px solid #cbd5e1', borderRadius: 3, padding: '1px 5px', cursor: 'pointer', color: '#475569', lineHeight: 1 }}>⎋</button>}
          >
            {hoekContent}
          </CollapsibleSection>
        );
      })()}
      <CollapsibleSection
        title="Einduiteinden (handmatig)"
        tip={"Handmatige extensie of inkorten per gevel-uiteinde.\n\nPositief (+) = uitbreiden: de laag loopt door voorbij de gevelrand.\nNegatief (−) = inkorten: de laag stopt voor de gevelrand.\n\n· Strips = steenstrips\n· Latten = achterconstructie latten\n· Panelen = basisplaten\n\nDeze waarden vervangen de automatische hoekberekening."}
        isOpen={isOpen('einduiteinden')}
        onToggle={() => toggle('einduiteinden')}
        badge={(() => {
          const ee = settings.endExtensions ?? {};
          const vals = [ee.left?.strips, ee.left?.battens, ee.left?.panels, ee.right?.strips, ee.right?.battens, ee.right?.panels].filter((v) => v != null && v !== 0);
          return vals.length > 0 ? String(vals.length) : null;
        })()}
      >
        {(settings.outsideDirFlip ? [['right', 'Links'], ['left', 'Rechts']] : [['left', 'Links'], ['right', 'Rechts']]).map(([side, sideLabel]) => {
          const ee = settings.endExtensions ?? {};
          const sideEE = ee[side] ?? { strips: 0, battens: 0, panels: 0 };
          return (
            <div key={side} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#475569', marginBottom: 4, borderBottom: '1px solid #e2e8f0', paddingBottom: 3 }}>{sideLabel} uiteinde</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 8px', alignItems: 'center' }}>
                {[['strips', 'Strips'], ['battens', 'Latten'], ['panels', 'Panelen']].map(([key, lbl]) => (
                  <Fragment key={key}>
                    <span style={{ fontSize: 11, color: '#475569', whiteSpace: 'nowrap' }}>{lbl} mm</span>
                    <input
                      type="number"
                      step={1}
                      value={sideEE[key] ?? 0}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        const newEE = { ...ee, [side]: { ...sideEE, [key]: val } };
                        onUpdate({ endExtensions: newEE });
                      }}
                      style={{ ...inp, width: '100%' }}
                    />
                  </Fragment>
                ))}
              </div>
            </div>
          );
        })}
        {adjacentHints.length > 0 && (
          <div style={{ marginTop: 8, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 5, padding: '6px 8px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#0369a1', marginBottom: 5 }}>Aangrenzende gevels — referentiewaarden</div>
            {adjacentHints.map((h) => (
              <div key={h.groupId} style={{ marginBottom: 5 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#0c4a6e', marginBottom: 2 }}>{h.name}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px', fontSize: 10, color: '#334155' }}>
                  {h.wallThickness != null && h.wallThickness > 0 && (
                    <>
                      <span style={{ color: '#64748b' }}>Wanddikte</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{h.wallThickness} mm</span>
                    </>
                  )}
                  <span style={{ color: '#64748b' }}>Strips dikte</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{h.stripDikte} mm</span>
                  <span style={{ color: '#64748b' }}>Latten dikte</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{h.lattenDikte} mm</span>
                  <span style={{ color: '#64748b' }}>Panelen dikte</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{h.paneelDikte} mm</span>
                  <span style={{ color: '#0369a1', fontWeight: 600 }}>Pakketdikte totaal</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0369a1' }}>{h.pakketDikte} mm</span>
                </div>
              </div>
            ))}
            <div style={{ fontSize: 9, color: '#64748b', marginTop: 4, fontStyle: 'italic' }}>
              Aanbevolen strips-verlenging = pakketdikte aangrenzende gevel
            </div>
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}

function Tooltip({ text, children, block }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const Tag = block ? 'div' : 'span';
  return (
    <Tag
      style={{ position: 'relative', display: block ? 'block' : 'inline-flex', alignItems: 'center' }}
      onMouseEnter={(e) => { setVisible(true); setPos({ x: e.clientX, y: e.clientY }); }}
      onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div style={{
          position: 'fixed',
          left: pos.x + 12,
          top: pos.y + 4,
          zIndex: 9999,
          background: '#0f172a',
          color: '#e2e8f0',
          fontSize: 11,
          lineHeight: 1.5,
          padding: '6px 10px',
          borderRadius: 5,
          maxWidth: 260,
          pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          whiteSpace: 'pre-wrap',
        }}>
          {text}
        </div>
      )}
    </Tag>
  );
}

function InfoIcon({ tip }) {
  return (
    <Tooltip text={tip}>
      <span style={{ marginLeft: 4, fontSize: 10, color: '#94a3b8', cursor: 'default', fontWeight: 700, border: '1px solid #cbd5e1', borderRadius: '50%', width: 13, height: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>i</span>
    </Tooltip>
  );
}

function SectionLabel({ children, tip }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: '#475569' }}>
      {children}
      {tip && <InfoIcon tip={tip} />}
    </div>
  );
}

function Field({ label, tip, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12 }}>
      <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: 3 }}>
        {label}
        {tip && <InfoIcon tip={tip} />}
      </span>
      {children}
    </label>
  );
}

const inp = { padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: 3, fontSize: 12, width: '100%', fontFamily: 'inherit' };

const btn = (color) => ({
  background: color,
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  padding: '6px 10px',
  fontSize: 12,
  cursor: 'pointer',
  width: '100%',
  textAlign: 'left',
});

function inlineFmt(text) {
  const parts = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) parts.push(<strong key={m.index}>{m[1]}</strong>);
    else if (m[2]) parts.push(<code key={m.index} style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: 2, fontFamily: 'monospace', fontSize: 11 }}>{m[2]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 0 ? text : parts;
}

function SimpleMarkdown({ text }) {
  const lines = text.split('\n');
  const elements = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      let code = '';
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { code += lines[i] + '\n'; i++; }
      elements.push(<pre key={`pre${i}`} style={{ background: '#f1f5f9', padding: '10px 14px', borderRadius: 4, fontSize: 11, overflowX: 'auto', color: '#334155', margin: '8px 0' }}>{code}</pre>);
      i++; continue;
    }
    if (line.startsWith('|')) {
      const tableLines = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        if (!lines[i].match(/^\|[\s\-:|]+\|/)) tableLines.push(lines[i]);
        i++;
      }
      elements.push(
        <table key={`tbl${i}`} style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 10 }}>
          <tbody>
            {tableLines.map((tl, ri) => {
              const cells = tl.split('|').slice(1, -1).map(c => c.trim());
              const isH = ri === 0;
              return (
                <tr key={ri} style={{ borderBottom: '1px solid #e2e8f0', background: isH ? '#f8fafc' : '#fff' }}>
                  {cells.map((cell, ci) => isH
                    ? <th key={ci} style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 700, color: '#1e293b', verticalAlign: 'top' }}>{inlineFmt(cell)}</th>
                    : <td key={ci} style={{ padding: '5px 8px', color: '#475569', verticalAlign: 'top' }}>{inlineFmt(cell)}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      );
      continue;
    }
    if (line.match(/^[\-\*] /)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^[\-\*] /)) { items.push(lines[i].slice(2)); i++; }
      elements.push(<ul key={`ul${i}`} style={{ margin: '4px 0 10px 0', padding: '0 0 0 18px' }}>{items.map((it, ii) => <li key={ii} style={{ fontSize: 12, color: '#334155', padding: '2px 0', lineHeight: 1.5 }}>{inlineFmt(it)}</li>)}</ul>);
      continue;
    }
    if (line.match(/^\d+\. /)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) { items.push(lines[i].replace(/^\d+\. /, '')); i++; }
      elements.push(<ol key={`ol${i}`} style={{ margin: '4px 0 10px 0', padding: '0 0 0 18px' }}>{items.map((it, ii) => <li key={ii} style={{ fontSize: 12, color: '#334155', padding: '2px 0', lineHeight: 1.5 }}>{inlineFmt(it)}</li>)}</ol>);
      continue;
    }
    if (line.startsWith('# ')) { elements.push(<h1 key={`h1${i}`} style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: '0 0 14px 0', paddingBottom: 8, borderBottom: '2px solid #3b82f6' }}>{line.slice(2)}</h1>); i++; continue; }
    if (line.startsWith('## ')) { elements.push(<h2 key={`h2${i}`} style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '18px 0 6px 0', paddingBottom: 4, borderBottom: '1px solid #e2e8f0' }}>{line.slice(3)}</h2>); i++; continue; }
    if (line.startsWith('### ')) { elements.push(<h3 key={`h3${i}`} style={{ fontSize: 13, fontWeight: 600, color: '#334155', margin: '12px 0 4px 0' }}>{line.slice(4)}</h3>); i++; continue; }
    if (line.startsWith('#### ')) { elements.push(<h4 key={`h4${i}`} style={{ fontSize: 12, fontWeight: 600, color: '#475569', margin: '8px 0 3px 0' }}>{line.slice(5)}</h4>); i++; continue; }
    if (line.trim() === '---') { elements.push(<hr key={`hr${i}`} style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '10px 0' }} />); i++; continue; }
    if (line.startsWith('> ')) { elements.push(<blockquote key={`bq${i}`} style={{ margin: '6px 0', padding: '8px 14px', background: '#eff6ff', borderLeft: '3px solid #3b82f6', fontSize: 12, color: '#334155', borderRadius: '0 4px 4px 0' }}>{inlineFmt(line.slice(2))}</blockquote>); i++; continue; }
    if (line.trim() === '') { i++; continue; }
    elements.push(<p key={`p${i}`} style={{ fontSize: 12, color: '#475569', margin: '0 0 6px 0', lineHeight: 1.6 }}>{inlineFmt(line)}</p>);
    i++;
  }
  return <>{elements}</>;
}

export default function App() {
  const [allWalls, setAllWalls] = useState([]);
  const [wallDimOverrides, setWallDimOverrides] = useState({});
  const [adjacencies, setAdjacencies] = useState([]);
  const [groups, setGroups] = useState([]);
  const [synWallInput, setSynWallInput] = useState({ L: 4000, H: 2870, dikte: 272.5 }); // synthetische calc-wand (vlag syntheticWall)
  const [groupsHistory, setGroupsHistory] = useState([]);
  const [selectedWallIds, setSelectedWallIds] = useState(new Set());
  const [activeGroupId, setActiveGroupId] = useState(null);
  // STABLE_GROUP_CAMERA #3: gevlagd door een 3D-element-klik zodat FocusGroupCamera die ene
  // activeGroupId-wijziging NIET als camera-focus uitvoert (lijst-highlight zonder camera-sprong).
  const skipGroupCameraFocusRef = useRef(false);
  const [loadStatus, setLoadStatus] = useState('idle');
  const [loadProgress, setLoadProgress] = useState({ current: 0, total: 0 });
  const [loadLogs, setLoadLogs] = useState([]);
  const loadLogsRef = useRef([]);
  const [loadError, setLoadError] = useState(null);
  const [savedFileInfo, setSavedFileInfo] = useState(null);
  const [savedHandle, setSavedHandle] = useState(null);
  const [ifcFileName, setIfcFileName] = useState(null);
  const [exportFileName, setExportFileName] = useState('');
  const [exportDirHandle, setExportDirHandle] = useState(null);
  const [showPattern, setShowPattern] = useState(true);
  const [viewMode, setViewMode] = useState('3d');
  const [pendingFile, setPendingFile] = useState(null);
  const [wallTypes, setWallTypes] = useState([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedTypes, setSelectedTypes] = useState(new Set());
  const [zoneImportMode, setZoneImportMode] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [similarSuggestions, setSimilarSuggestions] = useState(null);
  const [duplicateGroupsModal, setDuplicateGroupsModal] = useState(null);
  const [groupLinks, setGroupLinks] = useState({});
  const [cornerConfigs, setCornerConfigs] = useState({});
  const [gridLines, setGridLines] = useState([]);
  const [showGridLines, setShowGridLines] = useState(true);
  const [showCenterLines, setShowCenterLines] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [rulesTab, setRulesTab] = useState('regels');
  const [showHandleiding, setShowHandleiding] = useState(true);
  const [validationReport, setValidationReport] = useState(null);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationRunning, setValidationRunning] = useState(false);
  const [validationProgress, setValidationProgress] = useState({ current: 0, total: 0 });
  const [validationLogs, setValidationLogs] = useState([]);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [hiddenGroupIds, setHiddenGroupIds] = useState(new Set());
  // SPARING-ELEMENTEN (vlag sparingElementen) — geïmporteerde niet-wand IFC-onderdelen + globale offset.
  const [sparingElements, setSparingElements] = useState([]);
  const [sparingOffset, setSparingOffset] = useState(10);
  const [sparingScan, setSparingScan] = useState(null); // { file, types:[{ifcEntityType,count}], selected:Set, busy }
  const [kozijnen, setKozijnen] = useState([]); // raam/deur-bboxen (uit parseIfc via projectInfo) voor 3D-weergave
  const [flagsOpen, setFlagsOpen] = useState(false); // vlaggen-schakelaar-paneel
  const [flagState, setFlagState] = useState(() => Object.fromEntries(FLAG_REGISTRY.map((f) => [f.key, getFlag(f.key)])));
  const [flagsDirty, setFlagsDirty] = useState(false);
  const forceOrientation = 'AUTO';
  // projectInfo React state vervalt — module-state in projectCoordinates.js is de enige bron
  const { get: getSettings, update: updateSettings, initColor, forceInit, map: settingsMap, setMap: setSettingsMap } = useGroupSettings();

  const _gidRef = useRef(1);
  // Zelf-bevattende projecten: bron-IFC's van deze sessie [{prefix, file}] — alleen
  // gevuld onder de vlag, gebruikt bij opslaan om bytes te persisteren.
  const _sourceIfcsRef = useRef([]);
  const _colorIdxRef = useRef(0);
  const _hydratedRef = useRef(false);
  const _saveTimerRef = useRef(null);
  const _mergeCounterRef = useRef(0);
  const _synCounterRef = useRef(0);
  const newGid = useCallback(() => `G${_gidRef.current++}`, []);
  const syncGidRef = useCallback((loadedGroups, loadedSettingsMap) => {
    let maxN = _gidRef.current - 1;
    for (const g of loadedGroups) {
      const n = parseInt(String(g.id).replace(/^G/, ''), 10);
      if (!isNaN(n) && n > maxN) maxN = n;
    }
    _gidRef.current = maxN + 1;
    if (loadedSettingsMap) {
      const usedColors = new Set(Object.values(loadedSettingsMap).map((s) => s?.color).filter(Boolean));
      let idx = 0;
      while (idx < GROUP_COLORS.length * 2 && usedColors.has(GROUP_COLORS[idx % GROUP_COLORS.length])) idx++;
      _colorIdxRef.current = idx;
    } else {
      _colorIdxRef.current = loadedGroups.length;
    }
  }, []);
  const nextColor = useCallback(() => GROUP_COLORS[_colorIdxRef.current++ % GROUP_COLORS.length], []);

  const effectiveWalls = useMemo(() => allWalls.map((w) => {
    const ov = wallDimOverrides[w.expressID];
    return ov ? { ...w, ...ov } : w;
  }), [allWalls, wallDimOverrides]);
  const wallMap = useMemo(() => Object.fromEntries(effectiveWalls.map((w) => [w.expressID, w])), [effectiveWalls]);
  // Actieve synthetische calc-wand (voor de live maat-editor). Bewerken muteert allWalls →
  // effectiveWalls → wallMap → allPatterns → 3D/2D/uittrekstaat/IFC-export volgen vanzelf.
  const activeSynWall = useMemo(() => {
    const g = groups.find((gg) => gg.id === activeGroupId);
    if (!g || !g.synthetic) return null;
    return (g.wallIds ?? []).map((id) => wallMap[id]).find((w) => w && w.synthetic) ?? null;
  }, [groups, activeGroupId, wallMap]);

  const wallGroupMap = useMemo(() => {
    const m = {};
    for (const g of groups) for (const id of g.wallIds) m[id] = g.id;
    return m;
  }, [groups]);

  const buildingEnvelopeData = useMemo(() => {
    if (!effectiveWalls.length) return null;
    return detectBuildingEnvelope(effectiveWalls);
  }, [effectiveWalls]);

  const groupEnvelopeVisibility = useMemo(() => {
    if (!buildingEnvelopeData) return {};
    const result = {};
    for (const group of groups) {
      const walls = group.wallIds.map((id) => wallMap[id]).filter(Boolean);
      const concreteWalls = walls.filter((w) => w.wallOrigin);
      if (!concreteWalls.length) { result[group.id] = []; continue; }
      result[group.id] = extractVisibleConcreteFaces(concreteWalls, effectiveWalls, buildingEnvelopeData);
    }
    return result;
  }, [buildingEnvelopeData, groups, wallMap, effectiveWalls]);

  const allPatterns = useMemo(() => {
    // "Patroon 3D" verbergt alleen de 3D-overlay (knop staat enkel in 3D-modus). De
    // 2D-gevel leest dezelfde bron (single source of truth), dus in 2D-modus altijd
    // berekenen — anders zou 2D leeglopen wanneer de 3D-toggle uit staat.
    if (!showPattern && viewMode !== '2d') return {};
    const result = {};
    for (const group of groups) {
      const s = getSettings(group.id);
      const walls = group.wallIds.map((id) => wallMap[id]).filter(Boolean);
      const withOrigin = walls.filter((w) => w.wallOrigin);
      if (!withOrigin.length) continue;
      const mat = s.material ?? DEFAULT_MATERIAL;
      const _artId3d = (s.lattenArtikelen ?? [])[0] ?? null;
      const _art3d = _artId3d ? BATTEN_CATALOG.find((a) => a.id === _artId3d) : null;
      const latDikte3d = _art3d ? _art3d.dikteMM : (s.latten?.dikte ?? 28);
      const hasVertLat3d = s.latten?.richting === 'verticaal';
      const effectiveLatDepth3d = hasVertLat3d ? 2 * latDikte3d : latDikte3d;
      const panelDikte3d = s.panelen?.dikte ?? 8;
      const _3dStripArtId = (s.steenstripsArtikelen ?? [])[0];
      const _3dStripArt = _3dStripArtId ? STEENSTRIP_CATALOG.find((a) => a.id === _3dStripArtId) : null;
      const brickD3dEarly = _3dStripArt ? _3dStripArt.dikte : (s.brickDepth ?? 20);
      const effectiveMat3d = _3dStripArt ? { ...mat, steenL: _3dStripArt.steenL, steenH: _3dStripArt.steenH } : mat;
      const isSlimFort3d = (s.backingType ?? 'hout') === 'aluminium_slimfort';
      const sfSettings3d = isSlimFort3d ? { ...SLIMFORT_DEFAULTS, ...(s.slimFortSettings ?? {}) } : null;
      const panelVentGap3d = isSlimFort3d ? (s.concreteCladdingSettings?.panelVentilationGap ?? 0) : 0;
      const sfDepths3d = isSlimFort3d ? getSlimFortDepths(sfSettings3d, panelVentGap3d, panelDikte3d, brickD3dEarly) : null;
      const depthFromFaceGeneral = isSlimFort3d
        ? sfDepths3d.brickCenter
        : effectiveLatDepth3d + panelDikte3d + brickD3dEarly / 2;
      const ctrimsFull = endExtensionsToTrims(s.endExtensions);
      const _envVis3d = groupEnvelopeVisibility[group.id] ?? null;
      // STAP: best-fit gevelvlak voor HANDMATIGE groepen achter de vlag. Vlag UIT of
      // auto-groep → exact het bestaande pad (byte-identiek). Faalt de best-fit →
      // val terug op het oude pad i.p.v. niets te tonen.
      const useBestFit = isBestFitGroups() && group.manual === true;
      let facadeData = (useBestFit
        ? buildBestFitFacadePattern(walls, effectiveMat3d, s.verband ?? DEFAULT_VERBAND, s.maxHoogte, s.zetwerk, null, s.startLijn, ctrimsFull.extendLeft, ctrimsFull.extendRight)
        : null)
        ?? buildFullGroupFacadePattern(walls, effectiveMat3d, s.verband ?? DEFAULT_VERBAND, s.maxHoogte, s.zetwerk, null, s.startLijn, ctrimsFull.extendLeft, ctrimsFull.extendRight);
      // FASE 2 — wildverband: vervang de strip-rijen door het vastgelegde tegel-verband
      // (buildTruthRows). Achter de vlag, default UIT → exact het bestaande pad. Voedt 3D
      // (batches uit facadeData.rows) én 2D (dezelfde facadeData) uit één bron.
      if (facadeData && (s.verband ?? DEFAULT_VERBAND) === 'wildverband' && isWildverbandKoppelstrip()) {
        const _tr = buildTruthRows(facadeData.groupWidth, facadeData.groupHeight, effectiveMat3d, facadeData.groupOpenings ?? []);
        facadeData = { ...facadeData, rows: _tr.rows, wildverbandBoardEdges: _tr.boardEdges };
      }
      // GROOTHUIS WILDVERBAND — generatief verband, eigen rows-bron (panelen vol met 2500 + rest).
      if (facadeData && (s.verband ?? DEFAULT_VERBAND) === 'groothuis_wildverband' && isGroothuisWildverband()) {
        const _gr = buildGroothuisRows(facadeData.groupWidth, facadeData.groupHeight, effectiveMat3d, facadeData.groupOpenings ?? []);
        facadeData = { ...facadeData, rows: _gr.rows, groothuisBoardEdges: _gr.boardEdges };
      }
      // GROOTHUIS WILDVERBAND 2 — vaste 6-rij mal, eigen rows-bron (panelen vol met 2500 + rest).
      if (facadeData && (s.verband ?? DEFAULT_VERBAND) === 'groothuis_wildverband_2' && isGroothuisWildverband2()) {
        const _gr = buildGroothuis2Rows(facadeData.groupWidth, facadeData.groupHeight, effectiveMat3d, facadeData.groupOpenings ?? []);
        facadeData = { ...facadeData, rows: _gr.rows, groothuisBoardEdges: _gr.boardEdges };
      }
      // SPARING-ELEMENTEN (vlag) — knip de bekleding rondom geïmporteerde niet-wand onderdelen (offset).
      if (facadeData && isSparingElementen() && sparingElements.length && facadeData.refWallOrigin) {
        const _rwo = facadeData.refWallOrigin;
        const _rowHsp = (s.verband ?? DEFAULT_VERBAND) === 'staand_tegelverband' ? effectiveMat3d.steenL : effectiveMat3d.steenH;
        const _tS = _rwo.thicknessStart, _tE = _rwo.thicknessEnd;
        const _gf = {
          lengthAxis: _rwo.lengthAxis, heightAxis: _rwo.heightAxis, thicknessAxis: _rwo.thicknessAxis,
          groupMinX: facadeData.groupMinX, groupMinH: facadeData.groupMinH,
          groupWidth: facadeData.groupWidth, groupHeight: facadeData.groupHeight,
          thickMin: (Number.isFinite(_tS) && Number.isFinite(_tE)) ? Math.min(_tS, _tE) : null,
          thickMax: (Number.isFinite(_tS) && Number.isFinite(_tE)) ? Math.max(_tS, _tE) : null,
        };
        const _sr = sparingRectsForGroup(sparingElements, _gf, sparingOffset);
        if (_sr.length) facadeData = { ...facadeData, rows: clipRowsAroundRects(facadeData.rows, _sr, _rowHsp), sparingRects: _sr };
      }
      if (!facadeData) {
        const refWall = [...withOrigin].sort((a, b) => (b.length ?? 0) - (a.length ?? 0))[0];
        if (!refWall) continue;
        const rwo = refWall.wallOrigin;
        const axisW = withOrigin.filter((w) => w.wallOrigin.lengthAxis === rwo.lengthAxis);
        const gMinX = Math.min(...axisW.map((w) => w.wallOrigin.lengthStart));
        const gMinH = Math.min(...axisW.map((w) => w.wallOrigin.heightStart));
        const gAdj = adjacencies.filter((a) => group.wallIds.includes(a.wallIdA) && group.wallIds.includes(a.wallIdB));
        const wallRowMap = buildGroupPattern(walls, gAdj, effectiveMat3d, s.verband ?? DEFAULT_VERBAND, 'all');
        const brickH3d = (s.verband ?? DEFAULT_VERBAND) === 'staand_tegelverband' ? effectiveMat3d.steenL : effectiveMat3d.steenH;
        const allRows = [];
        for (const w of axisW) {
          const wo = w.wallOrigin;
          const offsetX = wo.lengthStart - gMinX;
          const offsetH = wo.heightStart - gMinH;
          for (const row of (wallRowMap[w.expressID] ?? [])) {
            allRows.push({ y: row.y + offsetH, pieces: row.pieces.map((p) => ({ ...p, start: p.start + offsetX })) });
          }
        }
        if (!allRows.length) continue;
        const simpleGW = Math.max(...axisW.map((w) => w.wallOrigin.lengthStart + (w.length ?? 0))) - gMinX;
        const ctrimsSimple = endExtensionsToTrims(s.endExtensions);
        const clipSimple = (rows) => {
          const tL = ctrimsSimple.trimLeft, tR = ctrimsSimple.trimRight;
          const eL = ctrimsSimple.extendLeft, eR = ctrimsSimple.extendRight;
          if (!tL && !tR && !eL && !eR) return rows;
          const xMin = tL, xMax = simpleGW - tR;
          return rows.map((row) => {
            let pieces = row.pieces.flatMap((p) => {
              let ps = p.start, pe = p.start + p.length;
              if (pe <= xMin || ps >= xMax) return [];
              ps = Math.max(ps, xMin);
              pe = Math.min(pe, xMax);
              const len = pe - ps;
              if (len < 1) return [];
              return [{ ...p, start: ps, length: len }];
            }).filter((p) => p.length > 1);
            if (eL > 0 && pieces.length > 0) { const f = pieces[0]; pieces = [{ ...f, start: f.start - eL, length: f.length + eL }, ...pieces.slice(1)]; }
            if (eR > 0 && pieces.length > 0) { const l = pieces[pieces.length - 1]; pieces = [...pieces.slice(0, -1), { ...l, length: l.length + eR }]; }
            return { ...row, pieces };
          }).filter((row) => row.pieces.length > 0);
        };
        const simpleCornerWraps = [];
        // CORNER_BUTT_MODE: stompe hoek → geen omslag-steenstrips op het loodrechte vlak.
        if (!isCornerButtMode()) for (const [cfgKey, cfg] of Object.entries(cornerConfigs)) {
          if (cfg.mainGroupId !== group.id) continue;
          const secGroup = groups.find((g) => g.id === cfg.secondaryGroupId);
          if (!secGroup) continue;
          const secS = getSettings(secGroup.id);
          const secWalls = secGroup.wallIds.map((id) => wallMap[id]).filter(Boolean).filter((w) => !!w.wallOrigin);
          if (!secWalls.length) continue;
          const secRefWall = [...secWalls].sort((a, b) => (b.length ?? 0) - (a.length ?? 0))[0];
          const secRwo = secRefWall.wallOrigin;
          const secAxisW = secWalls.filter((w) => w.wallOrigin.lengthAxis === secRwo.lengthAxis);
          const secGroupMinX = Math.min(...secAxisW.map((w) => w.wallOrigin.lengthStart));
          const secGroupMinH = Math.min(...secAxisW.map((w) => w.wallOrigin.heightStart));
          const secGW = Math.max(...secAxisW.map((w) => w.wallOrigin.lengthStart + (w.length ?? 0))) - secGroupMinX;
          const secArtId = (secS.lattenArtikelen ?? [])[0] ?? null;
          const secArt = secArtId ? BATTEN_CATALOG.find((a) => a.id === secArtId) : null;
          const secLatDikte = secArt ? secArt.dikteMM : (secS.latten?.dikte ?? 28);
          const secHasVertLat = secS.latten?.richting === 'verticaal';
          const secEffLat = secHasVertLat ? 2 * secLatDikte : secLatDikte;
          const secPanelD = secS.panelen?.dikte ?? 8;
          const mainEE = s.endExtensions ?? {};
          const secEE  = secS.endExtensions ?? {};
          const mainExtendL = Math.max(0, mainEE.left?.strips  ?? 0);
          const mainExtendR = Math.max(0, mainEE.right?.strips ?? 0);
          const stripsExtend = Math.max(mainExtendL, mainExtendR);
          if (stripsExtend <= 0) continue;
          const secTrimL = (secEE.left?.strips  ?? 0) < 0;
          const secTrimR = (secEE.right?.strips ?? 0) < 0;
          let wrapPieceStart = null;
          if (secTrimL) wrapPieceStart = 0;
          else if (secTrimR) wrapPieceStart = secGW - stripsExtend;
          if (wrapPieceStart === null) continue;
          const secIsSlimFort3d_sw = (secS.backingType ?? 'hout') === 'aluminium_slimfort';
          const secSfSettings3d_sw = secIsSlimFort3d_sw ? { ...SLIMFORT_DEFAULTS, ...(secS.slimFortSettings ?? {}) } : null;
          const secVentGap3d_sw = secIsSlimFort3d_sw ? (secS.concreteCladdingSettings?.panelVentilationGap ?? 0) : 0;
          const secSfDepths3d_sw = secIsSlimFort3d_sw ? getSlimFortDepths(secSfSettings3d_sw, secVentGap3d_sw, secPanelD, brickD3dEarly) : null;
          const wrapDepthFromFace = secIsSlimFort3d_sw
            ? secSfDepths3d_sw.brickCenter
            : secEffLat + secPanelD + brickD3dEarly / 2;
          const wrapRows = allRows.map((row) => ({ y: row.y, pieces: [{ start: wrapPieceStart, length: stripsExtend }] }));
          if (!wrapRows.length) continue;
          simpleCornerWraps.push({
            secRwo, secGroupMinX, secGroupMinH,
            secOutsideDirFlip: !!(secS.outsideDirFlip),
            depthFromFace: wrapDepthFromFace,
            brickD: brickD3dEarly,
            rows: wrapRows,
            color: s.color ?? '#a64033',
            brickH: brickH3d,
          });
        }
        let _sfFaces3d_fb = null;
        let _wallDecomp3d_fb = null;
        let _sfStitching3d_fb = null;
        let _syntheticFacadeData = null;
        try {
          const simpleGH = axisW.length > 0
            ? Math.max(...axisW.map((w) => w.wallOrigin.heightStart + (w.height ?? (w.wallOrigin.heightEnd - w.wallOrigin.heightStart)))) - gMinH
            : 0;
          if (isSlimFort3d && sfSettings3d && rwo) {
            if (_envVis3d && _envVis3d.length > 0) {
              const _sfTotal3d = sfSettings3d.totalThickness ?? 196;
              _wallDecomp3d_fb = decomposeAndConnect(group.id, _envVis3d, _sfTotal3d);
              const _cfcs3d_fb = sfSettings3d.concreteFaceCladdingSettings?.enabled !== false && sfSettings3d.concreteFaceCladdingSettings != null
                ? { ...CONCRETE_FACE_CLADDING_DEFAULTS, ...sfSettings3d.concreteFaceCladdingSettings }
                : null;
              _sfFaces3d_fb = getPrimaryWallSegments(_wallDecomp3d_fb)
                .flatMap((seg) => {
                  const descriptor = wallSegmentToSlimFortFaceDescriptor(seg);
                  const grid = generateSlimFortGrid(
                    seg.localWidth,
                    seg.localHeight,
                    seg.wallType === 'front' ? seg.openings : [],
                    sfSettings3d,
                    seg.wallType === 'front' ? s.maxHoogte : null,
                    seg.faceType,
                  );
                  if (_cfcs3d_fb) {
                    if (seg.wallType === 'front') {
                      const faces = [];
                      if (_cfcs3d_fb.cladLeftLongFace && grid) {
                        const lr = computeFaceLongRanges({ ..._cfcs3d_fb, cladRightLongFace: false }, seg.localWidth);
                        const g = lr ? applyRangesToGrid(grid, lr) : grid;
                        if (g) faces.push({ ...descriptor, grid: g });
                      }
                      if (_cfcs3d_fb.cladRightLongFace && grid && seg.wallThickness) {
                        const rr = computeFaceLongRanges({ ..._cfcs3d_fb, cladLeftLongFace: false }, seg.localWidth);
                        const g = rr ? applyRangesToGrid(grid, rr) : grid;
                        if (g) faces.push({ ...descriptor, faceId: descriptor.faceId + '-back', faceType: 'back', outsideDir: -(seg.outsideDir ?? 1), outsidePos: (seg.outsidePos ?? 0) - (seg.outsideDir ?? 1) * seg.wallThickness, grid: g });
                      }
                      return faces;
                    }
                    if (seg.wallType === 'leftReturn' && _cfcs3d_fb.cladLeftEndFace) return [{ ...descriptor, grid }];
                    if (seg.wallType === 'rightReturn' && _cfcs3d_fb.cladRightEndFace) return [{ ...descriptor, grid }];
                    return [];
                  }
                  if (seg.wallType === 'front' && sfSettings3d.cladFrontFace === false) return [];
                  if ((seg.wallType === 'leftReturn' || seg.wallType === 'rightReturn') && !sfSettings3d.cladSideFaces) return [];
                  if ((seg.wallType === 'portalLeft' || seg.wallType === 'portalRight') && !sfSettings3d.cladPortalInnerFaces) return [];
                  return [{ ...descriptor, grid }];
                }).filter((f) => f.grid != null);
            } else {
              const _wt3d_fb = Math.abs((rwo.thicknessEnd ?? rwo.thicknessStart + 200) - rwo.thicknessStart);
              _sfFaces3d_fb = generateSlimFortFaces({
                groupWidth: simpleGW,
                groupHeight: simpleGH,
                wallThickness: _wt3d_fb,
                openings: [],
                settings: sfSettings3d,
                maxH: s.maxHoogte,
              });
            }
            _sfStitching3d_fb = _sfFaces3d_fb ? computeGroupStitching(_sfFaces3d_fb) : null;
            _syntheticFacadeData = { groupWidth: simpleGW, groupHeight: simpleGH, groupOpenings: [], groupMinX: gMinX, groupMinH: gMinH, refWallOrigin: rwo };
          }
        } catch (e) {
          console.warn('[allPatterns fallback] SlimFort berekening mislukt:', e);
        }
        result[group.id] = {
          batches: [{ rows: clipSimple(allRows), color: s.color ?? '#a64033', brickH: brickH3d, depthFromFace: depthFromFaceGeneral }],
          cornerWraps: simpleCornerWraps,
          groupMinX: gMinX,
          groupMinH: gMinH,
          refWallOrigin: rwo,
          outsideDirFlip: !!(s.outsideDirFlip),
          latDikteEff: latDikte3d,
          facadeData: _syntheticFacadeData,
          slimFortFaces: _sfFaces3d_fb,
          slimFortStitching: _sfStitching3d_fb,
          wallDecomposition: _wallDecomp3d_fb,
          envelopeVisibility: _envVis3d,
        };
        continue;
      }
      const brickD3d = brickD3dEarly;
      const gW = facadeData.groupWidth;

      let maskedRows = facadeData.rows;
      if (s.penanten?.length) {
        maskedRows = maskedRows.map((row) => ({
          ...row,
          pieces: row.pieces.flatMap((piece) => {
            let ps = [piece];
            for (const p of s.penanten) {
              const pX = p.x ?? 0;
              const pB = Math.max(1, p.breedte ?? 400);
              const maskStart = pX + brickD3d;
              const maskEnd = pX + pB - brickD3d;
              if (maskEnd <= maskStart) continue;
              ps = ps.flatMap((q) => {
                const qs = q.start, qe = q.start + q.length;
                if (qe <= maskStart || qs >= maskEnd) return [q];
                const out = [];
                if (qs < maskStart) out.push({ ...q, length: maskStart - qs });
                if (qe > maskEnd) out.push({ ...q, start: maskEnd, length: qe - maskEnd });
                return out;
              });
            }
            return ps;
          }),
        }));
      }

      const sortedPens = [...(s.penanten ?? [])].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
      const numZ = sortedPens.length + 1;
      const zoneSettingsArr = s.zoneSettings ?? [];
      const enabledZones = [];
      for (let zi = 0; zi < numZ; zi++) {
        const zs = zoneSettingsArr[zi];
        if (!zs?.enabled) continue;
        const zX1Raw = zi === 0 ? 0 : (sortedPens[zi - 1].x ?? 0) + Math.max(1, sortedPens[zi - 1].breedte ?? 400);
        const zX2Raw = zi === numZ - 1 ? gW : (sortedPens[zi].x ?? 0);
        const zX1 = zi === 0 ? zX1Raw : zX1Raw - brickD3d;
        const zX2 = zi === numZ - 1 ? zX2Raw : zX2Raw + brickD3d;
        if (zX2 <= zX1) continue;
        const zoneMatBase = { ...mat, ...(zs.material ?? {}) };
        const zoneMat = _3dStripArt ? { ...zoneMatBase, steenL: _3dStripArt.steenL, steenH: _3dStripArt.steenH } : zoneMatBase;
        const zoneVerband3d = zs.verband ?? (s.verband ?? DEFAULT_VERBAND);
        const zoneFull = buildFullGroupFacadePattern(walls, zoneMat, zoneVerband3d, zs.maxHoogte ?? s.maxHoogte, s.zetwerk, null, s.startLijn);
        if (!zoneFull) continue;
        const clipRows = zoneFull.rows.map((row) => ({
          ...row,
          pieces: row.pieces.flatMap((piece) => {
            const ps = piece.start, pe = piece.start + piece.length;
            if (pe <= zX1 || ps >= zX2) return [];
            return [{ ...piece, start: Math.max(ps, zX1), length: Math.min(pe, zX2) - Math.max(ps, zX1) }];
          }).filter((p) => p.length > 1),
        })).filter((row) => row.pieces.length > 0);
        const zoneBrickH3d = zoneVerband3d === 'staand_tegelverband' ? zoneMat.steenL : zoneMat.steenH;
        enabledZones.push({ zX1, zX2, rows: clipRows, color: zs.color ?? s.color ?? '#a64033', brickH: zoneBrickH3d });
      }

      const generalRows = maskedRows.map((row) => ({
        ...row,
        pieces: row.pieces.flatMap((piece) => {
          let ps = [piece];
          for (const ez of enabledZones) {
            ps = ps.flatMap((q) => {
              const qs = q.start, qe = q.start + q.length;
              if (qe <= ez.zX1 || qs >= ez.zX2) return [q];
              const out = [];
              if (qs < ez.zX1) out.push({ ...q, length: ez.zX1 - qs });
              if (qe > ez.zX2) out.push({ ...q, start: ez.zX2, length: qe - ez.zX2 });
              return out;
            });
          }
          return ps;
        }).filter((p) => p.length > 1),
      })).filter((row) => row.pieces.length > 0);

      const groupVerband3d = s.verband ?? DEFAULT_VERBAND;
      const groupBrickH3d = groupVerband3d === 'staand_tegelverband' ? effectiveMat3d.steenL : effectiveMat3d.steenH;
      let batches = [
        { rows: generalRows, color: s.color ?? '#a64033', brickH: groupBrickH3d, depthFromFace: depthFromFaceGeneral },
        ...enabledZones.map((ez) => ({ rows: ez.rows, color: ez.color, brickH: ez.brickH, depthFromFace: depthFromFaceGeneral })),
      ];
      // FASE 2 — stripZone-regio-tak achter featureZones (default UIT). Alleen op
      // NIET-penant-vlakken; penant-vlakken houden de tak hierboven byte-identiek.
      // Eén bedrading: de gedeelde buildStripZoneRegions (ook door de export-glue gebruikt).
      if (isFeatureZones() && !hasPenants(s) && getActiveStripZones(s).length > 0) {
        const _regions = buildStripZoneRegions(facadeData, s.stripZones, mat, groupVerband3d, s.color ?? '#a64033', { stripArt: _3dStripArt });
        if (_regions) {
          batches = _regions.map((r) => ({
            rows: r.rows,
            color: r.color,
            brickH: r.verband === 'staand_tegelverband' ? r.material.steenL : r.material.steenH,
            depthFromFace: depthFromFaceGeneral,
          }));
        }
      }

      for (const pen of (s.penanten ?? [])) {
        const pX  = pen.x   ?? 0;
        const pB  = Math.max(1, pen.breedte ?? 400);
        const pDL3 = Math.max(1, pen.diepteLinks  ?? pen.diepte ?? 150);
        const pDR3 = Math.max(1, pen.diepteRechts ?? pen.diepte ?? 150);
        const pDmax3 = Math.max(pDL3, pDR3);
        const maxH = s.maxHoogte ?? 0;
        const pH  = Math.max(1, (maxH != null && maxH > 0) ? Math.min(pen.hoogte ?? 2000, maxH) : (pen.hoogte ?? 2000));
        const panelDikte = panelDikte3d;
        const latD = isSlimFort3d ? sfDepths3d.facadeBaseDepth : latDikte3d;
        const penStoot = pen.stoot ?? mat.stoot ?? 10;
        const penShift = panelDikte + brickD3d + penStoot + pDmax3;
        const depthFromFace = latD + penShift + brickD3d / 2;
        const penSL3 = Math.max(0, s.startLijn ?? 0);   // penant-strips volgen de groep-startlijn
        const penEffPH3 = pH - penSL3;                   // zichtbare penant-hoogte boven de startlijn (top blijft op pH)
        const shiftPenY3 = (rows) => penSL3 > 0 ? rows.map((row) => ({ ...row, y: Math.round((row.y + penSL3) * 100) / 100 })) : rows;
        const faceRows = shiftPenY3(buildCenteredFacePattern(pB, penEffPH3, effectiveMat3d, groupVerband3d));
        if (!faceRows.length) continue;
        const offsetRows = faceRows.map((row) => ({
          ...row,
          pieces: row.pieces.map((piece) => ({ ...piece, start: pX + piece.start })),
        }));
        batches.push({ rows: offsetRows, color: s.color ?? '#a64033', brickH: groupBrickH3d, depthFromFace });

        const sideClipOff = Math.max(penStoot, panelDikte);
        const sideDepthOffsetBase = latD + panelDikte + brickD3d + sideClipOff + 6;
        const sideDepthOffsetLeft = sideDepthOffsetBase + (pDmax3 - pDL3);
        const sideDepthOffsetRight = sideDepthOffsetBase + (pDmax3 - pDR3);
        const clipSideFront = (rawRows, armDepth) => {
          const clipEnd = armDepth - sideClipOff;
          return rawRows.map((row) => ({
            ...row,
            pieces: row.pieces.flatMap((pc) => {
              if (pc.start >= clipEnd) return [];
              if (pc.start + pc.length <= clipEnd) return [pc];
              return [{ ...pc, length: Math.round((clipEnd - pc.start) * 100) / 100 }];
            }),
          })).filter((row) => row.pieces.length > 0);
        };
        const leftArmDepth = Math.max(1, pDL3 - 6);
        const rightArmDepth = Math.max(1, pDR3 - 6);
        const leftRows = clipSideFront(shiftPenY3(buildFacePattern(leftArmDepth, penEffPH3, effectiveMat3d, groupVerband3d)), leftArmDepth);
        const rightRows = clipSideFront(shiftPenY3(buildFacePattern(rightArmDepth, penEffPH3, effectiveMat3d, groupVerband3d)), rightArmDepth);
        if (leftRows.length) batches.push({ rows: leftRows, color: s.color ?? '#a64033', brickH: groupBrickH3d, sideType: 'left', penantX: pX, penantB: pB, sideDepthOffset: sideDepthOffsetLeft });
        if (rightRows.length) batches.push({ rows: rightRows, color: s.color ?? '#a64033', brickH: groupBrickH3d, sideType: 'right', penantX: pX, penantB: pB, sideDepthOffset: sideDepthOffsetRight });
      }

      const clipFull = (rows) => {
        const tL = ctrimsFull.trimLeft, tR = ctrimsFull.trimRight;
        const eL = ctrimsFull.extendLeft, eR = ctrimsFull.extendRight;
        if (!tL && !tR) return rows;
        const xMin = tL - eL, xMax = gW + eR - tR;
        return rows.map((row) => {
          let pieces = row.pieces.flatMap((p) => {
            let ps = p.start, pe = p.start + p.length;
            if (pe <= xMin || ps >= xMax) return [];
            ps = Math.max(ps, xMin);
            pe = Math.min(pe, xMax);
            const len = pe - ps;
            if (len < 1) return [];
            return [{ ...p, start: ps, length: len }];
          }).filter((p) => p.length > 1);
          return { ...row, pieces };
        }).filter((row) => row.pieces.length > 0);
      };
      const clippedBatches = batches.map((b) => b.sideType ? b : { ...b, rows: clipFull(b.rows) }).filter((b) => b.rows.length > 0 || b.sideType);

      const cornerWraps = [];
      // CORNER_BUTT_MODE: stompe hoek → geen omslag-steenstrips op het loodrechte vlak.
      if (!isCornerButtMode()) for (const [cfgKey, cfg] of Object.entries(cornerConfigs)) {
        if (cfg.mainGroupId !== group.id) continue;
        const secGroup = groups.find((g) => g.id === cfg.secondaryGroupId);
        if (!secGroup) continue;
        const secS = getSettings(secGroup.id);
        const secWalls = secGroup.wallIds.map((id) => wallMap[id]).filter(Boolean).filter((w) => !!w.wallOrigin);
        if (!secWalls.length) continue;
        const secRefWall = [...secWalls].sort((a, b) => (b.length ?? 0) - (a.length ?? 0))[0];
        const secRwo = secRefWall.wallOrigin;
        const secAxisW = secWalls.filter((w) => w.wallOrigin.lengthAxis === secRwo.lengthAxis);
        const secGroupMinX = Math.min(...secAxisW.map((w) => w.wallOrigin.lengthStart));
        const secGroupMinH = Math.min(...secAxisW.map((w) => w.wallOrigin.heightStart));
        const secGW = Math.max(...secAxisW.map((w) => w.wallOrigin.lengthStart + (w.length ?? 0))) - secGroupMinX;
        const secArtId = (secS.lattenArtikelen ?? [])[0] ?? null;
        const secArt = secArtId ? BATTEN_CATALOG.find((a) => a.id === secArtId) : null;
        const secLatDikte = secArt ? secArt.dikteMM : (secS.latten?.dikte ?? 28);
        const secHasVertLat = secS.latten?.richting === 'verticaal';
        const secEffLat = secHasVertLat ? 2 * secLatDikte : secLatDikte;
        const secPanelD = secS.panelen?.dikte ?? 8;
        const mainEE = s.endExtensions ?? {};
        const secEE  = secS.endExtensions ?? {};
        const mainExtendL = Math.max(0, mainEE.left?.strips  ?? 0);
        const mainExtendR = Math.max(0, mainEE.right?.strips ?? 0);
        const stripsExtend = Math.max(mainExtendL, mainExtendR);
        if (stripsExtend <= 0) continue;
        const secTrimL = (secEE.left?.strips  ?? 0) < 0;
        const secTrimR = (secEE.right?.strips ?? 0) < 0;
        let wrapPieceStart = null;
        if (secTrimL) wrapPieceStart = 0;
        else if (secTrimR) wrapPieceStart = secGW - stripsExtend;
        if (wrapPieceStart === null) continue;
        const secIsSlimFort3d_fw = (secS.backingType ?? 'hout') === 'aluminium_slimfort';
        const secSfSettings3d_fw = secIsSlimFort3d_fw ? { ...SLIMFORT_DEFAULTS, ...(secS.slimFortSettings ?? {}) } : null;
        const secVentGap3d_fw = secIsSlimFort3d_fw ? (secS.concreteCladdingSettings?.panelVentilationGap ?? 0) : 0;
        const secSfDepths3d_fw = secIsSlimFort3d_fw ? getSlimFortDepths(secSfSettings3d_fw, secVentGap3d_fw, secPanelD, brickD3dEarly) : null;
        const wrapDepthFromFace = secIsSlimFort3d_fw
          ? secSfDepths3d_fw.brickCenter
          : secEffLat + secPanelD + brickD3dEarly / 2;
        const wrapRows = generalRows.map((row) => ({ y: row.y, pieces: [{ start: wrapPieceStart, length: stripsExtend }] }));
        if (!wrapRows.length) continue;
        cornerWraps.push({
          secRwo,
          secGroupMinX,
          secGroupMinH,
          secOutsideDirFlip: !!(secS.outsideDirFlip),
          depthFromFace: wrapDepthFromFace,
          brickD: brickD3dEarly,
          rows: wrapRows,
          color: s.color ?? '#a64033',
          brickH: groupBrickH3d,
        });
      }

      const _rwo3d = facadeData.refWallOrigin ?? withOrigin[0].wallOrigin;
      let _sfFaces3d = null;
      let _wallDecomp3d = null;
      if (isSlimFort3d && sfSettings3d && _rwo3d) {
        if (_envVis3d && _envVis3d.length > 0) {
          const _sfTotal3d = sfSettings3d.totalThickness ?? 196;
          _wallDecomp3d = decomposeAndConnect(group.id, _envVis3d, _sfTotal3d);
          const _cfcs3d = sfSettings3d.concreteFaceCladdingSettings?.enabled !== false && sfSettings3d.concreteFaceCladdingSettings != null
            ? { ...CONCRETE_FACE_CLADDING_DEFAULTS, ...sfSettings3d.concreteFaceCladdingSettings }
            : null;
          _sfFaces3d = getPrimaryWallSegments(_wallDecomp3d)
            .flatMap((seg) => {
              const descriptor = wallSegmentToSlimFortFaceDescriptor(seg);
              const grid = generateSlimFortGrid(
                seg.localWidth,
                seg.localHeight,
                seg.wallType === 'front' ? seg.openings : [],
                sfSettings3d,
                seg.wallType === 'front' ? s.maxHoogte : null,
                seg.faceType,
              );
              if (_cfcs3d) {
                if (seg.wallType === 'front') {
                  const faces = [];
                  if (_cfcs3d.cladLeftLongFace && grid) {
                    const lr = computeFaceLongRanges({ ..._cfcs3d, cladRightLongFace: false }, seg.localWidth);
                    const g = lr ? applyRangesToGrid(grid, lr) : grid;
                    if (g) faces.push({ ...descriptor, grid: g });
                  }
                  if (_cfcs3d.cladRightLongFace && grid && seg.wallThickness) {
                    const rr = computeFaceLongRanges({ ..._cfcs3d, cladLeftLongFace: false }, seg.localWidth);
                    const g = rr ? applyRangesToGrid(grid, rr) : grid;
                    if (g) faces.push({ ...descriptor, faceId: descriptor.faceId + '-back', faceType: 'back', outsideDir: -(seg.outsideDir ?? 1), outsidePos: (seg.outsidePos ?? 0) - (seg.outsideDir ?? 1) * seg.wallThickness, grid: g });
                  }
                  return faces;
                }
                if (seg.wallType === 'leftReturn' && _cfcs3d.cladLeftEndFace) return [{ ...descriptor, grid }];
                if (seg.wallType === 'rightReturn' && _cfcs3d.cladRightEndFace) return [{ ...descriptor, grid }];
                return [];
              }
              if (seg.wallType === 'front' && sfSettings3d.cladFrontFace === false) return [];
              if ((seg.wallType === 'leftReturn' || seg.wallType === 'rightReturn') && !sfSettings3d.cladSideFaces) return [];
              if ((seg.wallType === 'portalLeft' || seg.wallType === 'portalRight') && !sfSettings3d.cladPortalInnerFaces) return [];
              return [{ ...descriptor, grid }];
            }).filter((f) => f.grid != null);
        } else {
          const _wt3d = Math.abs((_rwo3d.thicknessEnd ?? _rwo3d.thicknessStart + 200) - _rwo3d.thicknessStart);
          _sfFaces3d = generateSlimFortFaces({
            groupWidth: facadeData.groupWidth,
            groupHeight: facadeData.groupHeight,
            wallThickness: _wt3d,
            openings: facadeData.groupOpenings ?? [],
            settings: sfSettings3d,
            maxH: s.maxHoogte,
          });
        }
      }

      const _sfStitching3d = _sfFaces3d ? computeGroupStitching(_sfFaces3d) : null;

      result[group.id] = {
        batches: clippedBatches,
        cornerWraps,
        groupMinX: facadeData.groupMinX,
        groupMinH: facadeData.groupMinH,
        refWallOrigin: _rwo3d,
        outsideDirFlip: !!(s.outsideDirFlip),
        latDikteEff: latDikte3d,
        facadeData,
        slimFortFaces: _sfFaces3d,
        slimFortStitching: _sfStitching3d,
        wallDecomposition: _wallDecomp3d,
        envelopeVisibility: _envVis3d,
      };
    }
    return result;
  }, [groups, getSettings, wallMap, showPattern, viewMode, adjacencies, cornerConfigs, settingsMap, groupEnvelopeVisibility, sparingElements, sparingOffset]);

  // SPARING-ELEMENTEN debug/voortgangs-controle — per groep hoeveel sparing-rechthoeken daadwerkelijk
  // uit de bekleding zijn geknipt (uit allPatterns). 0 → coördinaten sluiten niet aan of diepte-check faalt.
  const sparingDebug = useMemo(() => {
    if (!isSparingElementen() || !sparingElements.length) return null;
    const perGroup = groups.map((g) => {
      const fd = allPatterns[g.id]?.facadeData;
      const rwo = fd?.refWallOrigin;
      return {
        name: getSettings(g.id).name ?? g.id,
        rects: fd?.sparingRects?.length ?? 0,
        gw: Math.round(fd?.groupWidth ?? 0), gh: Math.round(fd?.groupHeight ?? 0),
        assen: rwo ? `${rwo.lengthAxis}/${rwo.heightAxis}/${rwo.thicknessAxis}` : '—',
        minXH: rwo ? `${Math.round(fd.groupMinX)},${Math.round(fd.groupMinH)}` : '—',
      };
    });
    return { total: sparingElements.length, totalRects: perGroup.reduce((s, g) => s + g.rects, 0), groupsHit: perGroup.filter((g) => g.rects > 0).length, perGroup };
  }, [sparingElements, allPatterns, groups, getSettings]);

  useEffect(() => {
    if (!sparingDebug) return;
    console.log(`%c[sparingen] geknipt in ${sparingDebug.groupsHit}/${sparingDebug.perGroup.length} groepen · ${sparingDebug.totalRects} rechthoeken totaal (offset ${sparingOffset}mm)`, 'color:#f97316;font-weight:bold');
    if (sparingDebug.totalRects === 0) console.warn('[sparingen] 0 sparingen geknipt — controleer: (1) onderdelen-IFC zelfde projectnulpunt als de wanden (zie wereld-bbox in het import-rapport vs. de gevel-min hieronder), (2) onderdelen vallen binnen het dikte-bereik van een gevelvlak (± ~300mm), (3) de vlag staat aan.');
    console.table(sparingDebug.perGroup.map((g) => ({ groep: g.name, 'gevel BxH': `${g.gw}×${g.gh}`, sparingen: g.rects, 'assen L/H/D': g.assen, 'gevel-min X,H': g.minXH })));
  }, [sparingDebug, sparingOffset]);

  async function startScan(file, handle, isMerge = false) {
    setMergeMode(isMerge);
    setLoadStatus('scanning');
    setLoadError(null);
    loadLogsRef.current = [];
    setLoadLogs([]);
    const addLog = (msg) => {
      const entry = `[${new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] ${msg}`;
      loadLogsRef.current = [...loadLogsRef.current.slice(-49), entry];
      setLoadLogs([...loadLogsRef.current]);
    };
    addLog(`Bestand: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
    addLog('web-ifc engine laden…');
    try {
      const types = await scanIfcElementTypes(file);
      addLog(`✓ ${types.length} elementtype(n) gevonden`);
      if (!types.length) throw new Error('Geen elementen gevonden in IFC-bestand');
      setPendingFile(file);
      setWallTypes(types);
      setSelectedTypes(new Set());
      setZoneImportMode(false);
      setLoadStatus('selecting');
      if (handle) {
        saveFileHandle(handle).then(() => setSavedHandle({ handle, savedAt: Date.now(), name: file.name })).catch(() => {});
      } else {
        saveIfcFile(file).then(() => setSavedFileInfo({ name: file.name, size: file.size, savedAt: Date.now(), file })).catch(() => {});
      }
    } catch (err) {
      addLog(`✗ Fout: ${err.message}`);
      setLoadError(err.message);
      setLoadStatus('error');
    }
  }

  async function handlePickFile() {
    if (supportsFileSystemAccess()) {
      try {
        const [handle] = await window.showOpenFilePicker({ types: [{ description: 'IFC bestanden', accept: { 'application/x-step': ['.ifc'] } }], multiple: false });
        const file = await handle.getFile();
        await startScan(file, handle);
      } catch (err) {
        if (err.name !== 'AbortError') { setLoadError(err.message); setLoadStatus('error'); }
      }
    } else {
      document.getElementById('ifc-file-input').click();
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    await startScan(file, null);
  }

  async function loadFromStorage() {
    if (savedHandle?.handle) {
      try {
        const perm = await savedHandle.handle.queryPermission({ mode: 'read' });
        let file;
        if (perm === 'granted') {
          file = await savedHandle.handle.getFile();
        } else {
          const req = await savedHandle.handle.requestPermission({ mode: 'read' });
          if (req !== 'granted') return;
          file = await savedHandle.handle.getFile();
        }
        await startScan(file, savedHandle.handle);
      } catch { setLoadError('Geen toegang tot bestand'); setLoadStatus('error'); }
    } else if (savedFileInfo?.file) {
      await startScan(savedFileInfo.file, null);
    }
  }

  function forgetSavedFile() {
    deleteSavedIfcFile().catch(() => {});
    deleteFileHandle().catch(() => {});
    clearProjectState().catch(() => {});
    setSavedFileInfo(null);
    setSavedHandle(null);
  }

  function handleNewProject() {
    if (allWalls.length > 0 && !window.confirm('Huidig project wissen en opnieuw beginnen?')) return;
    resetCoordinates();
    deleteSavedIfcFile().catch(() => {});
    deleteFileHandle().catch(() => {});
    clearProjectState().catch(() => {});
    clearParsedWalls().catch(() => {});
    setAllWalls([]);
    setKozijnen([]);
    setWallDimOverrides({});
    setAdjacencies([]);
    setGroups([]);
    setGroupsHistory([]);
    setSelectedWallIds(new Set());
    setActiveGroupId(null);
    setLoadStatus('idle');
    setLoadProgress({ current: 0, total: 0 });
    setLoadLogs([]);
    loadLogsRef.current = [];
    setLoadError(null);
    setSavedFileInfo(null);
    setSavedHandle(null);
    setIfcFileName(null);
    setPendingFile(null);
    setWallTypes([]);
    setTypeFilter('');
    setSelectedTypes(new Set());
    setZoneImportMode(false);
    setMergeMode(false);
    setSimilarSuggestions(null);
    setDuplicateGroupsModal(null);
    setGroupLinks({});
    setGridLines([]);
    setHiddenGroupIds(new Set());
    setSettingsMap({});
    _gidRef.current = 1;
    _colorIdxRef.current = 0;
    _mergeCounterRef.current = 0;
  }

  async function handleValidateGeometry() {
    const activeFile = pendingFile ?? savedFileInfo?.file;
    if (!activeFile && !savedHandle?.handle) return;
    let targetFile = activeFile;
    if (!targetFile && savedHandle?.handle) {
      try { targetFile = await savedHandle.handle.getFile(); } catch { return; }
    }
    if (!targetFile) return;
    setValidationRunning(true);
    setValidationLogs([]);
    setValidationProgress({ current: 0, total: 0 });
    setShowValidationModal(true);
    try {
      const report = await runGeometryValidation(targetFile, (p) => {
        setValidationProgress({ current: p.current, total: p.total });
        if (p.log) setValidationLogs(prev => [...prev.slice(-29), p.log]);
      });
      setValidationReport(report);
    } catch (e) {
      setValidationLogs(prev => [...prev, `❌ Fout: ${e.message}`]);
    } finally {
      setValidationRunning(false);
    }
  }

  function exportValidationReport() {
    if (!validationReport?.length) return;
    const rows = [
      ['ExpressID', 'Naam', 'IFC Klasse', 'Lengte (mm)', 'Hoogte (mm)', 'Dikte (mm)', 'Hoogte-as', 'Problemen', 'Aanbeveling'],
      ...validationReport.map(r => [
        r.expressID, r.name, r.ifcClass, r.length, r.height, r.thickness, r.heightAxis,
        r.issues.join(' | '), r.suggestedClass ?? '',
      ]),
    ];
    const csv = rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'geometrie_validatie.csv' });
    a.click(); URL.revokeObjectURL(a.href);
  }

  // RESTORE-UP-AS (vlag restoreUpAxis, default UIT): bij project-restore persisteert
  // project-state geen upAxis (storage.js:168), en loadProjectState/loadProject roepen
  // registerIfcContext/restoreProjectInfo NIET aan → _upAxis blijft de module-default 'z'
  // (projectCoordinates.js:28) terwijl de herstelde wanden Y-up zijn. We leiden de up-as af
  // uit de meerderheids-heightAxis van de wanden en zetten 'm via registerIfcContext (alleen
  // upAxis; origin/trueNorth blijven ongemoeid door de bestaande guards). Vlag UIT → no-op
  // (byte-identiek). Geen bruikbare wanden → laat de huidige default staan (geen verslechtering).
  function restoreUpAxisFromWalls(walls) {
    if (!isRestoreUpAxis()) return;
    const vote = {};
    for (const w of (walls ?? [])) {
      const ha = w?.wallOrigin?.heightAxis;
      if (ha === 'y' || ha === 'z' || ha === 'z_neg') vote[ha] = (vote[ha] ?? 0) + 1;
    }
    const axis = Object.keys(vote).sort((a, b) => vote[b] - vote[a])[0];
    if (!axis) return;
    registerIfcContext({ upAxis: axis }, 'project-restore (up-as afgeleid uit wanden)');
  }

  async function confirmImport() {
    if (!pendingFile) return;
    // Reset coördinaten bij een nieuw (niet-merge) import
    if (!mergeMode && allWalls.length === 0) resetCoordinates();
    setLoadStatus('loading');
    setLoadProgress({ current: 0, total: 0 });
    loadLogsRef.current = [];
    setLoadLogs([]);
    const addLog = (msg) => {
      const entry = `[${new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] ${msg}`;
      loadLogsRef.current = [...loadLogsRef.current.slice(-49), entry];
      setLoadLogs([...loadLogsRef.current]);
    };
    addLog(`Bestand: ${pendingFile.name} (${(pendingFile.size / 1024 / 1024).toFixed(1)} MB)`);
    try {
      const filter = selectedTypes.size < wallTypes.length ? selectedTypes : null;
      const CACHE_SCHEMA_V = 15; // v15: kozijnen (raam/deur-bboxen) meegeparsed op projectInfo
      const pathTag = isNewOpeningDerivation() ? 'newOpenings' : 'legacy';
      const cacheKey = `${pendingFile.name}|${pendingFile.size}|${filter ? [...filter].sort().join(',') : 'all'}|v${CACHE_SCHEMA_V}|${pathTag}|koz${isShowKozijnen() ? 1 : 0}|okoz${isOpeningFromKozijn() ? 1 : 0}`;

      addLog(filter ? `Filter: ${[...filter].join(', ')}` : 'Alle wandtypen worden geladen');
      addLog('Cache controleren…');

      let walls = null;
      let cachedProjectInfo = null;
      try {
        const cached = await loadParsedWalls(cacheKey, pendingFile.size);
        if (cached) {
          addLog(`✓ Cache gevonden! ${cached.walls.length} wanden direct geladen`);
          walls = cached.walls;
          cachedProjectInfo = cached.projectInfo;
          if (cachedProjectInfo) restoreProjectInfo(cachedProjectInfo);
          setLoadProgress({ current: walls.length, total: walls.length });
        }
      } catch { }

      if (!walls) {
        addLog('Geen cache — IFC parsen gestart…');
        const progressCb = (p) => {
          if (p.log) { addLog(p.log); return; }
          setLoadProgress({ current: p.current, total: p.total });
          if (p.total > 0 && p.current === 1) addLog(`${p.total} wanden gevonden, verwerken gestart…`);
          if (p.total > 0 && p.current === p.total) addLog(`Alle ${p.total} wanden verwerkt`);
        };
        walls = await runNewEngineAdapter(pendingFile, filter, progressCb, { forceOrientation });
        addLog(`Resultaat opslaan in cache…`);
        saveParsedWalls(cacheKey, pendingFile.size, walls, walls.projectInfo ?? null).catch(() => {});
      }

      // projectInfo React state vervalt — module-state is al gezet via registerIfcContext/restoreProjectInfo
      if (!walls.length) throw new Error('Geen wanden gevonden met de geselecteerde types');
      addLog(`✓ ${walls.length} wanden geladen, aangrenzendheid detecteren…`);
      const adj = await detectAdjacenciesAsync(walls, (i, total) => {
        addLog(`Aangrenzendheid: ${i}/${total} wanden verwerkt…`);
      });
      addLog(`✓ Klaar — ${walls.length} wanden, ${adj.length} adjacenties`);
      setAllWalls(walls);
      setKozijnen((walls.projectInfo ?? cachedProjectInfo)?.kozijnen ?? []);
      setAdjacencies(adj);
      setGroups([]);
      setSelectedWallIds(new Set());
      setActiveGroupId(null);
      setIfcFileName(pendingFile.name.replace(/\.ifc$/i, ''));
      try {
        const gl = await parseIfcGridLines(pendingFile);
        setGridLines(gl);
        if (gl.length) addLog(`✓ ${gl.length} stramienlijnen geïmporteerd`);
      } catch { setGridLines([]); }
      setLoadStatus('loaded');
      // Zelf-bevattend project: onthoud de PRIMAIRE bron-IFC (prefix '' = native ids).
      // Een primaire (niet-merge) import reset de bronnenlijst.
      if (isSelfContainedProjects()) _sourceIfcsRef.current = [{ prefix: '', file: pendingFile }];
      setPendingFile(null);
      setWallTypes([]);
      _colorIdxRef.current = 0;
    } catch (err) {
      addLog(`✗ Fout: ${err.message}`);
      setLoadError(err.message);
      setLoadStatus('error');
    }
  }

  function cancelImport() {
    setPendingFile(null);
    setWallTypes([]);
    setTypeFilter('');
    setMergeMode(false);
    setLoadStatus(allWalls.length ? 'loaded' : 'idle');
  }

  async function handlePickMergeFile() {
    if (supportsFileSystemAccess()) {
      try {
        const [handle] = await window.showOpenFilePicker({ types: [{ description: 'IFC bestanden', accept: { 'application/x-step': ['.ifc'] } }], multiple: false });
        const file = await handle.getFile();
        await startScan(file, null, true);
      } catch (err) {
        if (err.name !== 'AbortError') { setLoadError(err.message); setLoadStatus('error'); }
      }
    } else {
      document.getElementById('ifc-merge-file-input').click();
    }
  }

  async function handleMergeFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    await startScan(file, null, true);
  }

  async function confirmMergeImport() {
    if (!pendingFile) return;
    setLoadStatus('loading');
    setLoadProgress({ current: 0, total: 0 });
    loadLogsRef.current = [];
    setLoadLogs([]);
    const addLog = (msg) => {
      const entry = `[${new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] ${msg}`;
      loadLogsRef.current = [...loadLogsRef.current.slice(-49), entry];
      setLoadLogs([...loadLogsRef.current]);
    };
    addLog(`Aanvullen: ${pendingFile.name}`);
    try {
      const allowedTypes = new Map();
      for (const t of wallTypes) {
        if (!selectedTypes.has(t.name)) continue;
        const key = (t.ifcEntityType ?? 'IFCWALL').toUpperCase();
        if (!allowedTypes.has(key)) allowedTypes.set(key, new Set());
        allowedTypes.get(key).add(t.name);
      }

      const elements = await parseIfcZoneElements(pendingFile, allowedTypes.size ? allowedTypes : null, (p) => {
        if (p.phase === 'upaxis') return; // up-as-debug-state bestaat niet (meer); negeer dit event
        if (p.log) { addLog(p.log); return; }
        setLoadProgress({ current: p.current, total: p.total });
        if (p.total > 0 && p.current === p.total) addLog(`${p.total} elementen verwerkt`);
      }, { forceOrientation });

      if (!elements.length) throw new Error('Geen elementen gevonden met de geselecteerde types');

      // STAP 2: onder de feature-flag loopt ook de merge-import via de nieuwe
      // openingsafleiding, zodat enkel- en merge-import consistent zijn. expressID's
      // blijven numeriek tot ná deze stap (de prefix komt hieronder pas).
      if (isNewOpeningDerivation()) {
        addLog('Nieuwe openingsafleiding (merge-import)…');
        await applyProjectedOpenings(pendingFile, elements, (p) => { if (p.log) addLog(p.log); });
      }

      const prefix = `m${++_mergeCounterRef.current}_`;
      const prefixed = elements.map((el) => ({
        ...el,
        expressID: `${prefix}${el.expressID}`,
        openings: (el.openings ?? []).map((op) => ({ ...op, id: `${prefix}${op.id}` })),
        mergedFrom: pendingFile.name,
      }));

      addLog(`✓ ${prefixed.length} elementen toegevoegd aan bestaande wanden`);
      setAllWalls((prev) => [...prev, ...prefixed]);
      setLoadStatus('loaded');
      // Zelf-bevattend project: onthoud deze SECUNDAIRE bron-IFC met zijn prefix, zodat
      // bij laden de synthetische ids (prefix+native) reproduceerbaar zijn.
      if (isSelfContainedProjects()) _sourceIfcsRef.current = [...(_sourceIfcsRef.current ?? []), { prefix, file: pendingFile }];
      setPendingFile(null);
      setWallTypes([]);
      setMergeMode(false);
    } catch (err) {
      addLog(`✗ Fout: ${err.message}`);
      setLoadError(err.message);
      setLoadStatus('error');
    }
  }

  async function confirmZoneImport() {
    if (!pendingFile) return;
    setLoadStatus('loading');
    setLoadProgress({ current: 0, total: 0 });
    loadLogsRef.current = [];
    setLoadLogs([]);
    const addLog = (msg) => {
      const entry = `[${new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] ${msg}`;
      loadLogsRef.current = [...loadLogsRef.current.slice(-49), entry];
      setLoadLogs([...loadLogsRef.current]);
    };
    addLog(`Zone-import: ${pendingFile.name}`);
    try {
      const allowedTypes = new Map();
      for (const t of wallTypes) {
        if (!selectedTypes.has(t.name)) continue;
        const key = (t.ifcEntityType ?? 'IFCWALL').toUpperCase();
        if (!allowedTypes.has(key)) allowedTypes.set(key, new Set());
        allowedTypes.get(key).add(t.name);
      }

      const elements = await parseIfcZoneElements(pendingFile, allowedTypes.size ? allowedTypes : null, (p) => {
        if (p.phase === 'upaxis') return; // up-as-debug-state bestaat niet (meer); negeer dit event
        if (p.log) { addLog(p.log); return; }
        setLoadProgress({ current: p.current, total: p.total });
        if (p.total > 0 && p.current === p.total) addLog(`${p.total} zone-elementen verwerkt`);
      }, { forceOrientation });

      if (!elements.length) throw new Error('Geen zone-elementen gevonden met de geselecteerde types');
      addLog(`✓ ${elements.length} zone-elementen geladen, achterliggende wanden laden voor openingen…`);

      // Parse structural walls to extract openings and apply them to zone elements
      try {
        const structWalls = await parseIfc(pendingFile, null, (p) => {
          if (p.phase === 'wanden') setLoadProgress({ current: p.current, total: p.total });
        });
        addLog(`✓ ${structWalls.length} constructieve wanden geanalyseerd voor openingen`);
        let openingsCopied = 0;
        for (const zEl of elements) {
          const wo = zEl.wallOrigin;
          if (!wo) continue;
          const zThickMid = (wo.thicknessStart + wo.thicknessEnd) / 2;
          const zL0 = wo.lengthStart, zL1 = zL0 + zEl.length;
          const zH0 = wo.heightStart, zH1 = zH0 + zEl.height;
          for (const sw of structWalls) {
            const swo = sw.wallOrigin;
            if (!swo || swo.thicknessAxis !== wo.thicknessAxis) continue;
            const sThickMid = (swo.thicknessStart + swo.thicknessEnd) / 2;
            if (Math.abs(sThickMid - zThickMid) > 300) continue;
            const sL0 = swo.lengthStart, sL1 = sL0 + sw.length;
            const sH0 = swo.heightStart, sH1 = sH0 + sw.height;
            const overlapL = Math.min(zL1, sL1) - Math.max(zL0, sL0);
            const overlapH = Math.min(zH1, sH1) - Math.max(zH0, sH0);
            if (overlapL < 100 || overlapH < 100) continue;
            const dL = swo.lengthStart - wo.lengthStart;
            const dH = swo.heightStart - wo.heightStart;
            for (const op of (sw.openings ?? [])) {
              const _newY = (op.y ?? 0) + dH;
              const _newH = op.hoogte ?? op.height ?? 0;
              // BRON-GUARD (dropOversizedOpenings): kopieer geen opening die boven het zone-element
              // uitsteekt (bv. een 2520 mm venster-void op een 300 mm vloerband). Vlag UIT → byte-identiek.
              if (isDropOversizedOpenings() && (zEl.height ?? 0) > 0 && (_newY + _newH) > (zEl.height ?? 0) + 100) continue;
              zEl.openings.push({
                ...op,
                id: `${op.id}_z${zEl.expressID}`,
                x: op.x + dL,
                y: _newY,
                polyPts: op.polyPts?.map(pt => ({ l: pt.l + dL, h: pt.h + dH })) ?? null,
              });
              openingsCopied++;
            }
          }
        }
        if (openingsCopied) addLog(`✓ ${openingsCopied} openingen overgenomen van constructieve wanden`);
      } catch (e) {
        addLog(`⚠ Openingen laden mislukt: ${e.message}`);
      }

      addLog(`Groeperen op gevel…`);

      const TOLERANCE = 50;
      const clusterMap = new Map();
      for (const el of elements) {
        const wo = el.wallOrigin;
        if (!wo) continue;
        const tPos = Math.round(wo.thicknessStart / TOLERANCE) * TOLERANCE;
        const key = `${wo.thicknessAxis}:${tPos}`;
        if (!clusterMap.has(key)) clusterMap.set(key, { axis: wo.thicknessAxis, pos: tPos, elements: [] });
        clusterMap.get(key).elements.push(el);
      }

      const xF = [...clusterMap.values()].filter(c => c.axis === 'x').sort((a, b) => a.pos - b.pos);
      const yF = [...clusterMap.values()].filter(c => c.axis === 'y').sort((a, b) => a.pos - b.pos);
      const zF = [...clusterMap.values()].filter(c => c.axis === 'z').sort((a, b) => a.pos - b.pos);

      const getZoneLabel = (sorted, idx, ax) => {
        if (ax === 'x') { if (sorted.length === 1) return 'Zone O/W'; if (idx === 0) return 'Zone W'; if (idx === sorted.length - 1) return 'Zone O'; return `Zone O/W-${idx + 1}`; }
        if (ax === 'y') { if (sorted.length === 1) return 'Zone N/Z'; if (idx === 0) return 'Zone Z'; if (idx === sorted.length - 1) return 'Zone N'; return `Zone N/Z-${idx + 1}`; }
        return `Zone G${idx + 1}`;
      };

      _colorIdxRef.current = 0;
      const newGroups = [];
      const newWalls = [];
      const newSettingsUpdates = {};

      for (const { clusters, ax } of [{ clusters: yF, ax: 'y' }, { clusters: xF, ax: 'x' }, { clusters: zF, ax: 'z' }]) {
        clusters.forEach((cluster, clusterIdx) => {
          const elems = cluster.elements;
          if (!elems.length) return;

          const minL = Math.min(...elems.map(e => e.wallOrigin.lengthStart));
          const maxL = Math.max(...elems.map(e => e.wallOrigin.lengthStart + e.length));
          const minH = Math.min(...elems.map(e => e.wallOrigin.heightStart));

          const stripZones = elems.map((e, idx) => ({
            id: `sz_${e.expressID}`,
            x: e.wallOrigin.lengthStart - minL,
            y: e.wallOrigin.heightStart - minH,
            width: e.length,
            height: e.height,
            label: e.name || `Zone ${String.fromCharCode(65 + idx)}`,
            depthOffset: 0,
          }));

          const gid = newGid();
          const color = nextColor();
          const label = getZoneLabel(clusters, clusterIdx, ax);
          const substrate = detectSubstrateType(elems);
          initColor(gid, color, label);
          // FASE 2c — maak GEEN sz_-zones op penant-vlakken (één bron: hasPenants).
          // Verse auto-groepen hebben nooit penanten, dus dit verandert het huidige
          // gedrag niet; de guard borgt de invariant als penanten ooit voor-gezaaid zijn.
          const _baseUpd = {
            ...(substrate !== 'unknown' ? { wallSubstrateType: substrate } : {}),
            ...(substrate === 'beton' ? { backingType: 'aluminium_slimfort' } : {}),
          };
          newSettingsUpdates[gid] = hasPenants(_baseUpd) ? _baseUpd : { ..._baseUpd, stripZones };
          newGroups.push({ id: gid, wallIds: elems.map(e => e.expressID) });
          newWalls.push(...elems);
        });
      }

      addLog(`✓ ${newGroups.length} gevelgroepen aangemaakt met zone-elementen als stripzones`);
      setAllWalls(newWalls);
      setAdjacencies(await detectAdjacenciesAsync(newWalls));
      setGroups(newGroups);
      setSelectedWallIds(new Set());
      setActiveGroupId(newGroups[0]?.id ?? null);
      setIfcFileName(pendingFile.name.replace(/\.ifc$/i, ''));
      setSettingsMap(prev => {
        const next = { ...prev };
        for (const [gid, updates] of Object.entries(newSettingsUpdates)) {
          next[gid] = { ...(next[gid] ?? {}), ...updates };
        }
        return next;
      });
      try {
        const gl = await parseIfcGridLines(pendingFile);
        setGridLines(gl);
        if (gl.length) addLog(`✓ ${gl.length} stramienlijnen geïmporteerd`);
      } catch { setGridLines([]); }
      setLoadStatus('loaded');
      setPendingFile(null);
      setWallTypes([]);
      setZoneImportMode(false);
    } catch (err) {
      addLog(`✗ Fout: ${err.message}`);
      setLoadError(err.message);
      setLoadStatus('error');
    }
  }

  function toggleType(name) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (supportsFileSystemAccess()) {
      loadFileHandle().then((rec) => {
        if (rec?.handle) setSavedHandle(rec);
      }).catch(() => {});
    } else {
      loadSavedIfcFile().then((rec) => {
        if (rec) setSavedFileInfo({ name: rec.file.name, size: rec.file.size, savedAt: rec.savedAt, file: rec.file });
      }).catch(() => {});
    }
    loadProjectState().then(async (state) => {
      console.log('[startup] loadProjectState resultaat:', state ? { groupsLength: state.groups?.length, hasSettingsMap: !!state.settingsMap, savedAt: state.savedAt } : null);
      if (state && Array.isArray(state.groups) && state.groups.length > 0) {
        const sm = state.groupSettings ?? state.settingsMap ?? {};
        setGroups(state.groups);
        setGroupLinks(state.groupLinks ?? {});
        if (state.cornerConfigs && typeof state.cornerConfigs === 'object') setCornerConfigs(state.cornerConfigs);
        setSettingsMap(sm);
        if (state.wallDimOverrides && typeof state.wallDimOverrides === 'object') setWallDimOverrides(state.wallDimOverrides);
        if (Array.isArray(state.allWalls) && state.allWalls.length > 0) {
          restoreUpAxisFromWalls(state.allWalls);
          resolveOutsideDirections(state.allWalls);
          applyManualOutsideOverrides(state.allWalls, state.groups, sm);
          setAllWalls(state.allWalls);
          setAdjacencies(await detectAdjacenciesAsync(state.allWalls));
          if (state.ifcFileName) setIfcFileName(state.ifcFileName);
          setLoadStatus('loaded');
        }
        syncGidRef(state.groups, sm);
      }
      _hydratedRef.current = true;
    }).catch((err) => {
      console.error('[startup] loadProjectState mislukt:', err);
      _hydratedRef.current = true;
    });
  }, []);

  useEffect(() => {
    if (!_hydratedRef.current) return;
    if (_saveTimerRef.current) clearTimeout(_saveTimerRef.current);
    _saveTimerRef.current = setTimeout(() => {
      // SESSIE-ONLY: synthetische calc-wanden (synthetic:true) + hun groepen/settings worden
      // NIET gepersisteerd. Zonder synthetische wanden zijn de refs ongewijzigd → byte-identiek.
      const _hasSyn = allWalls.some((w) => w.synthetic) || groups.some((g) => g.synthetic);
      const _pWalls = _hasSyn ? allWalls.filter((w) => !w.synthetic) : allWalls;
      const _pGroups = _hasSyn ? groups.filter((g) => !g.synthetic) : groups;
      const _synGids = _hasSyn ? new Set(groups.filter((g) => g.synthetic).map((g) => g.id)) : null;
      const _pSettings = _hasSyn ? Object.fromEntries(Object.entries(settingsMap).filter(([gid]) => !_synGids.has(gid))) : settingsMap;
      saveProjectState({ groups: _pGroups, groupLinks, cornerConfigs, settingsMap: _pSettings, ifcFileName, wallDimOverrides, allWalls: _pWalls }).catch(() => {});
    }, 1500);
    return () => clearTimeout(_saveTimerRef.current);
  }, [groups, groupLinks, cornerConfigs, settingsMap, ifcFileName, wallDimOverrides, allWalls]);

  // --- PLAN_BRIDGE (achter isPlanBridge(), default UIT) — engineering-samenvatting voor de planner ---
  // Volledig ADDITIEF: met de vlag uit registreert de useEffect hieronder niets en wordt
  // buildEngineeringPayload nooit aangeroepen → byte-identiek gedrag. De payload leest dezelfde
  // gevelvlak-bron als het scherm (buildFullGroupFacadePattern) en raakt geen bestaand codepad.
  // NB (fast-follow): paneelaantallen + fijne strip/latten-uitsplitsing komen uit de panelisatie in
  // handleExport/Uittrekstaat en volgen in een aparte, byte-identiek geverifieerde stap.
  const _engPayloadRef = useRef(null);
  const _planContextRef = useRef(null);
  const buildEngineeringPayload = () => {
    const visGroups = groups.filter((g) => !hiddenGroupIds.has(g.id));
    const outGroups = visGroups.map((group) => {
      const s = getSettings(group.id);
      const walls = (group.wallIds || []).map((id) => wallMap[id]).filter(Boolean);
      const mat = s.material ?? DEFAULT_MATERIAL;
      const ctrims = endExtensionsToTrims(s.endExtensions);
      let facadeData = null;
      try {
        facadeData = buildFullGroupFacadePattern(walls, mat, s.verband ?? DEFAULT_VERBAND, s.maxHoogte, s.zetwerk, null, s.startLijn, ctrims.extendLeft, ctrims.extendRight);
      } catch { facadeData = null; }
      const gw = facadeData?.groupWidth ?? 0;
      const gh = facadeData?.groupHeight ?? 0;
      const openings = facadeData?.groupOpenings ?? [];
      const openingAreaMM2 = openings.reduce((a, op) => a + Math.max(0, op.width ?? 0) * Math.max(0, op.height ?? 0), 0);
      const grossMM2 = Math.max(0, gw * gh);
      const netMM2 = Math.max(0, grossMM2 - openingAreaMM2);
      const cornerAssemblies = Object.values(cornerConfigs).filter((cfg) => cfg && cfg.mainGroupId === group.id).length;
      const stripArtId = (s.steenstripsArtikelen ?? [])[0] ?? null;
      const stripArt = stripArtId ? STEENSTRIP_CATALOG.find((a) => a.id === stripArtId) : null;
      const r2 = (mm2) => Math.round(mm2 / 1e6 * 100) / 100;
      return {
        id: group.id,
        name: s.name ?? group.name ?? group.id,
        wallCount: walls.length,
        facadeAreaM2: r2(netMM2),
        facadeGrossM2: r2(grossMM2),
        openingCount: openings.length,
        openingAreaM2: r2(openingAreaMM2),
        cornerAssemblies,
        verband: s.verband ?? DEFAULT_VERBAND,
        backingType: s.backingType ?? 'hout',
        stripArticle: stripArt ? (stripArt.naam ?? stripArt.name ?? stripArt.id) : (stripArtId || null),
        stripDims: (mat && (mat.steenL || mat.steenH)) ? { steenL: mat.steenL ?? null, steenH: mat.steenH ?? null } : null,
      };
    });
    const sum = (sel) => outGroups.reduce((a, g) => a + (sel(g) || 0), 0);
    return {
      source: 'brickboard', version: 1,
      generatedAt: new Date().toISOString(),
      projectName: ifcFileName ?? null,
      context: _planContextRef.current ?? null,
      groups: outGroups,
      summary: {
        groupCount: outGroups.length,
        totalFacadeAreaM2: Math.round(sum((g) => g.facadeAreaM2) * 100) / 100,
        totalCornerAssemblies: sum((g) => g.cornerAssemblies),
        totalWallCount: sum((g) => g.wallCount),
      },
      note: 'Paneelaantallen + fijne strip/latten-uitsplitsing volgen in een latere versie van de brug.',
    };
  };
  _engPayloadRef.current = buildEngineeringPayload;
  useEffect(() => {
    if (!isPlanBridge()) return; // vlag UIT → geen listener/handshake, byte-identiek
    const bridge = createPlanBridge({
      getEngineering: () => (_engPayloadRef.current ? _engPayloadRef.current() : null),
      onContext: (ctx) => { _planContextRef.current = ctx; },
    });
    return () => bridge.destroy();
  }, []);

  function pushHistory(currentGroups) {
    setGroupsHistory((h) => [...h.slice(-19), currentGroups]);
  }

  function undo() {
    setGroupsHistory((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setGroups(prev);
      return h.slice(0, -1);
    });
  }

  function autoGroup() {
    pushHistory(groups);
    const comps = buildConnectedComponents(allWalls, adjacencies);
    _colorIdxRef.current = 0;
    const newGroups = comps.map((ids, idx) => {
      const gid = newGid();
      const color = nextColor();
      initColor(gid, color, `Groep ${idx + 1}`);
      return { id: gid, wallIds: sortWallsInComponent(ids, allWalls, adjacencies) };
    });
    setGroups(newGroups);
    setSelectedWallIds(new Set());
    setActiveGroupId(newGroups[0]?.id ?? null);
  }

  function autoGroupByWindrichting() {
    pushHistory(groups);
    if (!allWalls.length) return;
    const TOLERANCE = 50;
    const faceMap = new Map();
    for (const w of allWalls) {
      const wo = w.wallOrigin;
      if (!wo) continue;
      const tPos = Math.round(wo.thicknessStart / TOLERANCE) * TOLERANCE;
      const key = `${wo.thicknessAxis}:${tPos}`;
      if (!faceMap.has(key)) faceMap.set(key, { axis: wo.thicknessAxis, pos: tPos, wallObjs: [] });
      faceMap.get(key).wallObjs.push(w);
    }
    if (!faceMap.size) return;
    const allFacades = [...faceMap.values()];
    const xF = allFacades.filter(f => f.axis === 'x').sort((a, b) => a.pos - b.pos);
    const yF = allFacades.filter(f => f.axis === 'y').sort((a, b) => a.pos - b.pos);
    const zF = allFacades.filter(f => f.axis === 'z').sort((a, b) => a.pos - b.pos);
    const getLabel = (sorted, idx, ax) => {
      if (ax === 'x') { if (sorted.length === 1) return 'O/W'; if (idx === 0) return 'W'; if (idx === sorted.length - 1) return 'O'; return `O/W-${idx + 1}`; }
      if (ax === 'y') { if (sorted.length === 1) return 'N/Z'; if (idx === 0) return 'Z'; if (idx === sorted.length - 1) return 'N'; return `N/Z-${idx + 1}`; }
      return `G${idx + 1}`;
    };
    _colorIdxRef.current = 0;
    const newGroups = [];
    for (const { facades, ax } of [{ facades: yF, ax: 'y' }, { facades: xF, ax: 'x' }, { facades: zF, ax: 'z' }]) {
      facades.forEach((f, facadeIdx) => {
        if (!f.wallObjs.length) return;
        const baseLabel = getLabel(facades, facadeIdx, ax);
        const comps = buildConnectedComponents(f.wallObjs, adjacencies);
        comps.forEach((compIds, compIdx) => {
          if (!compIds.length) return;
          const label = comps.length === 1 ? `Gevel ${baseLabel}` : `Gevel ${baseLabel}-${compIdx + 1}`;
          const gid = newGid();
          const color = nextColor();
          const wallObjs = compIds.map((id) => allWalls.find((w) => w.expressID === id)).filter(Boolean);
          const substrate = detectSubstrateType(wallObjs);
          initColor(gid, color, label);
          if (substrate !== 'unknown') {
            updateSettings(gid, { wallSubstrateType: substrate, ...(substrate === 'beton' ? { backingType: 'aluminium_slimfort' } : {}) });
          }
          newGroups.push({ id: gid, wallIds: sortWallsInComponent(compIds, allWalls, adjacencies) });
        });
      });
    }
    setGroups(newGroups);
    setSelectedWallIds(new Set());
    setActiveGroupId(newGroups[0]?.id ?? null);
  }

  // SYNTHETISCHE CALC-WAND (vlag syntheticWall): voeg een wand toe uit L×H×dikte en maak er
  // een één-wand-groep (manual:false → direct buildFullGroupFacadePattern). synthetic:true →
  // sessie-only (uitgesloten van saveProjectState). Spiegelt createGroup().
  function addSyntheticWall() {
    const L = Number(synWallInput.L), H = Number(synWallInput.H), dikte = Number(synWallInput.dikte);
    if (!(L > 0) || !(H > 0) || !(dikte > 0)) return; // valideer >0, geen NaN
    pushHistory(groups);
    const n = ++_synCounterRef.current;
    const wall = makeSyntheticWall(L, H, dikte, n);
    setAllWalls((prev) => [...prev, wall]);
    const gid = newGid();
    const color = nextColor();
    forceInit(gid, color, `Calc-wand ${n}`);
    setGroups((prev) => [...prev, { id: gid, wallIds: [wall.expressID], manual: false, synthetic: true }]);
    setActiveGroupId(gid);
  }

  // Pas de maten van een synthetische calc-wand aan (length/height + dikte in wallOrigin).
  // Ongeldige (≤0/NaN) waarden laten de betreffende maat ongemoeid. De mutatie van allWalls
  // laat de bekleding in 3D/2D/uittrekstaat/IFC-export meebewegen.
  function updateSyntheticWall(expressID, L, H, dikte) {
    setAllWalls((prev) => prev.map((w) => {
      if (w.expressID !== expressID || !w.synthetic) return w;
      const length = L > 0 ? Math.round(L) : w.length;
      const height = H > 0 ? Math.round(H) : w.height;
      const wo = w.wallOrigin;
      const thickness = dikte > 0 ? Math.round(dikte) : Math.abs((wo.thicknessEnd ?? 0) - (wo.thicknessStart ?? 0));
      return { ...w, length, height, wallOrigin: { ...wo, lengthEnd: wo.lengthStart + length, heightEnd: wo.heightStart + height, thicknessEnd: wo.thicknessStart + thickness } };
    }));
  }

  function createGroup() {
    pushHistory(groups);
    const ids = [...selectedWallIds].filter((id) => !wallGroupMap[id]);
    if (!ids.length) return;
    const gid = newGid();
    const color = nextColor();
    // Label-nummer = hoogste bestaande "Groep N" + 1 (geen telling van set-grootte:
    // die zakt na een deleteGroup-gat of dubbele naam en gaf dan een dubbel label).
    // Een gat in de nummering is prima; een dubbel label niet.
    const usedNums = groups
      .map((g) => /^Groep (\d+)$/.exec(getSettings(g.id).name))
      .filter(Boolean)
      .map((m) => parseInt(m[1], 10));
    const groupName = `Groep ${usedNums.length ? Math.max(...usedNums) + 1 : 1}`;
    forceInit(gid, color, groupName);
    const newGroup = { id: gid, wallIds: sortWallsInComponent(ids, allWalls, adjacencies), manual: true };
    const updatedGroups = [...groups, newGroup];
    setGroups(updatedGroups);
    setSelectedWallIds(new Set());
    setActiveGroupId(gid);

    const refWalls = ids.map((id) => allWalls.find((w) => w.expressID === id)).filter(Boolean);
    const substrate = detectSubstrateType(refWalls);
    if (substrate !== 'unknown') {
      updateSettings(gid, { wallSubstrateType: substrate, ...(substrate === 'beton' ? { backingType: 'aluminium_slimfort' } : {}) });
    }
    const suggestions = findSimilarGroups(refWalls, allWalls, updatedGroups, adjacencies);
    if (suggestions.length > 0) {
      const linkId = `L${gid}`;
      setSimilarSuggestions({ sourceGroupId: gid, sourceColor: color, linkId, groups: suggestions });
    }
  }

  function syncToLinked(sourceGroupId) {
    const linkId = groupLinks[sourceGroupId];
    if (!linkId) return;
    const srcSettings = getSettings(sourceGroupId);
    const linkedIds = groups.filter((g) => groupLinks[g.id] === linkId && g.id !== sourceGroupId).map((g) => g.id);
    for (const id of linkedIds) {
      updateSettings(id, { name: srcSettings.name, verband: srcSettings.verband, material: { ...srcSettings.material }, brickDepth: srcSettings.brickDepth, maxHoogte: srcSettings.maxHoogte, penanten: srcSettings.penanten ? [...srcSettings.penanten] : [], zetwerk: srcSettings.zetwerk ? { ...srcSettings.zetwerk } : undefined, panelen: srcSettings.panelen ? { ...srcSettings.panelen } : undefined, latten: srcSettings.latten ? { ...srcSettings.latten } : undefined, lattenArtikelen: srcSettings.lattenArtikelen ? [...srcSettings.lattenArtikelen] : [], steenstripsArtikelen: srcSettings.steenstripsArtikelen ? [...srcSettings.steenstripsArtikelen] : [] });
    }
  }

  function addToGroup(gid) {
    pushHistory(groups);
    const ids = [...selectedWallIds].filter((id) => !wallGroupMap[id]);
    if (!ids.length) return;
    setGroups((prev) => prev.map((g) => g.id !== gid ? g : {
      ...g, wallIds: sortWallsInComponent([...new Set([...g.wallIds, ...ids])], allWalls, adjacencies),
    }));
    setSelectedWallIds(new Set());
  }

  function removeFromGroup(gid, wallId) {
    pushHistory(groups);
    setGroups((prev) => prev.map((g) => g.id !== gid ? g : { ...g, wallIds: g.wallIds.filter((id) => id !== wallId) }).filter((g) => g.wallIds.length > 0));
    if (activeGroupId === gid && groups.find((g) => g.id === gid)?.wallIds.length <= 1) setActiveGroupId(null);
  }

  function deleteGroup(gid) {
    pushHistory(groups);
    setGroups((prev) => prev.filter((g) => g.id !== gid));
    if (activeGroupId === gid) setActiveGroupId(null);
  }

  function toggleSelect(id) {
    setSelectedWallIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAllUngrouped() {
    const ids = allWalls.filter((w) => !wallGroupMap[w.expressID]).map((w) => w.expressID);
    setSelectedWallIds(new Set(ids));
  }

  function clearSelection() {
    setSelectedWallIds(new Set());
  }

  // Zelf-bevattend project: leid de walls VERS af uit de gepersisteerde bron-IFC-bytes.
  // Reproduceert de import: primair (prefix '') via runNewEngineAdapter (native ids),
  // secundair (prefix 'm#_') via parseIfcZoneElements + (optioneel) applyProjectedOpenings
  // met dezelfde prefix → identieke synthetische ids. Dangling-guard: elke group-wallId
  // moet resolven, anders return null (= caller valt terug op opgeslagen walls[]).
  async function rederiveSelfContainedWalls(data, loadedGroups) {
    const sources = data.sourceIfcs ?? [];
    const rebuilt = [];
    const repopulate = [];
    for (const s of sources) {
      const rec = await loadSourceIfc(s.bytesKey);
      if (!rec) { console.warn(`[selfContained] bron ontbreekt in IndexedDB: ${s.filename} (${s.bytesKey})`); return null; }
      const file = new File([rec.data], s.filename ?? rec.name ?? 'bron.ifc', { type: 'application/x-step' });
      const prefix = s.prefix ?? '';
      if (!prefix) {
        const walls = await runNewEngineAdapter(file, null, () => {}, { forceOrientation });
        for (const w of (walls ?? [])) rebuilt.push(w); // native ids
      } else {
        const elements = await parseIfcZoneElements(file, null, () => {}, { forceOrientation });
        if (isNewOpeningDerivation()) { try { await applyProjectedOpenings(file, elements, () => {}); } catch {} }
        for (const el of (elements ?? [])) rebuilt.push({
          ...el,
          expressID: `${prefix}${el.expressID}`,
          openings: (el.openings ?? []).map((op) => ({ ...op, id: `${prefix}${op.id}` })),
          mergedFrom: s.filename,
        });
      }
      repopulate.push({ prefix, file });
    }
    // DANGLING-GUARD
    const idSet = new Set(rebuilt.map((w) => String(w.expressID)));
    const need = new Set((loadedGroups ?? []).flatMap((g) => (g.wallIds ?? []).map(String)));
    const missing = [...need].filter((id) => !idSet.has(id));
    if (missing.length) {
      console.warn(`[selfContained] ${missing.length} group-wallId(s) dangling na her-parse → fallback walls[]`, missing.slice(0, 8));
      return null;
    }
    _sourceIfcsRef.current = repopulate; // latere re-save blijft zelf-bevattend
    return rebuilt;
  }

  async function handleSaveProject() {
    const projectData = {
      _version: 2,
      _savedAt: new Date().toISOString(),
      ifcFileName: ifcFileName ?? null,
      groups,
      groupLinks,
      cornerConfigs,
      groupSettings: settingsMap,
      wallDimOverrides,
      walls: allWalls,
    };
    // Zelf-bevattend project (achter de vlag): persisteer de bron-IFC-bytes in
    // IndexedDB en voeg een {prefix→bestand}-map toe, zodat de walls bij laden VERS
    // her-afgeleid kunnen worden. walls[] blijft ALTIJD geschreven → een save met
    // vlag-UIT geladen valt gewoon terug op walls[]. Fout hierin = stille fallback
    // naar de bestaande _version:2-save (persistentie blijft heilig).
    if (isSelfContainedProjects()) {
      try {
        const sources = _sourceIfcsRef.current ?? [];
        const sourceIfcs = [];
        for (const s of sources) {
          if (!s?.file) continue;
          const buf = await s.file.arrayBuffer();
          const bytesKey = `src:${s.file.name}|${s.file.size}`;
          await saveSourceIfc(bytesKey, s.file.name, buf);
          sourceIfcs.push({ prefix: s.prefix ?? '', filename: s.file.name, bytesKey });
        }
        if (sourceIfcs.length) {
          projectData._version = 3;
          projectData._selfContained = true;
          projectData.sourceIfcs = sourceIfcs;
        } else {
          console.warn('[selfContained] geen bron-IFC’s onthouden in deze sessie → gewone _version:2-save');
        }
      } catch (e) {
        console.warn('[selfContained] opslaan bron-IFC’s mislukt → gewone _version:2-save:', e);
        delete projectData._version; projectData._version = 2;
        delete projectData._selfContained; delete projectData.sourceIfcs;
      }
    }
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = ifcFileName ? ifcFileName.replace(/\.ifc$/i, '') : 'project';
    a.download = `${baseName}_gevelbekleding.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleLoadProject(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const raw = ev.target.result;
        console.log('[loadProject] Bestand gelezen, grootte:', raw?.length);
        let data;
        try {
          data = JSON.parse(raw);
        } catch (parseErr) {
          console.error('[loadProject] JSON parse mislukt:', parseErr);
          alert(`Fout bij laden: bestand is geen geldige JSON.\n${parseErr.message}`);
          return;
        }
        console.log('[loadProject] Geparsed:', { _version: data._version, groupsLength: data.groups?.length, hasGroupSettings: !!data.groupSettings, hasGroupLinks: !!data.groupLinks });
        if (!data._version || !Array.isArray(data.groups)) {
          console.warn('[loadProject] Validatie mislukt:', { _version: data._version, groups: data.groups });
          alert('Ongeldig projectbestand (versie of groepen ontbreken).');
          return;
        }
        const loadedGroups = (data.groups ?? []).map((g) => ({
          ...g,
          wallIds: Array.isArray(g.wallIds) ? g.wallIds : [],
        }));
        const loadedSm = typeof data.groupSettings === 'object' && data.groupSettings !== null ? data.groupSettings : {};
        setGroups(loadedGroups);
        setGroupLinks(typeof data.groupLinks === 'object' && data.groupLinks !== null ? data.groupLinks : {});
        setCornerConfigs(typeof data.cornerConfigs === 'object' && data.cornerConfigs !== null ? data.cornerConfigs : {});
        setSettingsMap(loadedSm);
        setWallDimOverrides(typeof data.wallDimOverrides === 'object' && data.wallDimOverrides !== null ? data.wallDimOverrides : {});
        setGroupsHistory([]);
        setActiveGroupId(loadedGroups[0]?.id ?? null);
        setSimilarSuggestions(null);
        syncGidRef(loadedGroups, loadedSm);
        let loadedWalls = Array.isArray(data.walls) ? data.walls : [];
        // Zelf-bevattend project (achter de vlag): leid de walls VERS af uit de
        // gepersisteerde bron-IFC-bytes i.p.v. de bevroren walls[]. Bij ELKE fout of
        // dangling group-wallId → val terug op de opgeslagen walls[] (veilig, geen
        // dataverlies). Oude saves (geen _selfContained) of vlag-uit → onaangeroerd.
        if (isSelfContainedProjects() && data._selfContained && Array.isArray(data.sourceIfcs) && data.sourceIfcs.length) {
          try {
            const rebuilt = await rederiveSelfContainedWalls(data, loadedGroups);
            if (rebuilt && rebuilt.length) {
              loadedWalls = rebuilt;
              console.log('[selfContained] walls VERS her-afgeleid uit bron-IFC’s:', rebuilt.length);
            } else {
              console.warn('[selfContained] her-afleiding afgebroken → fallback op opgeslagen walls[]');
            }
          } catch (e) {
            console.warn('[selfContained] her-afleiding fout → fallback op opgeslagen walls[]:', e);
          }
        }
        if (loadedWalls.length > 0) {
          restoreUpAxisFromWalls(loadedWalls);
          resolveOutsideDirections(loadedWalls);
          applyManualOutsideOverrides(loadedWalls, loadedGroups, loadedSm);
          setAllWalls(loadedWalls);
          setAdjacencies(await detectAdjacenciesAsync(loadedWalls));
          setLoadStatus('loaded');
        }
        if (data.ifcFileName) setIfcFileName(data.ifcFileName);
        console.log('[loadProject] Geladen:', loadedGroups.length, 'groepen,', loadedWalls.length, 'wanden');
        if (loadedWalls.length > 0) {
          alert(`Project geladen: ${loadedGroups.length} groepen, ${loadedWalls.length} wanden.`);
        } else if (data.ifcFileName && data.ifcFileName !== ifcFileName) {
          alert(`Project geladen (${loadedGroups.length} groepen).\n\nDit project hoort bij IFC-bestand: "${data.ifcFileName}".\nZorg dat dit bestand is geladen om de elementen correct te zien.`);
        } else {
          alert(`Project geladen: ${loadedGroups.length} groepen.`);
        }
      } catch (err) {
        console.error('[loadProject] Onverwachte fout:', err);
        alert(`Fout bij laden van projectbestand:\n${err?.message ?? err}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // WIP: rijtelling wijkt af van facadeData.rows (zie spike/diagnose/formule-audit.md);
  // formaat komt niet overeen met het machine-CSV. Achter ?malRecept=1 tot MOLD_FROM_CANONICAL.
  function handleExportMalRecept() {
    const CSV_HEADER = ['Groep', 'Zone', 'Paneel', 'Breedte mm', 'Hoogte mm', 'Dikte mm', 'Rijen totaal', 'Rijen per mal', 'Mal-doorgang', 'Doorgangen totaal', 'Lagenmaat mm', 'Slede posities in mal (mm)'];
    const allRows = [CSV_HEADER];

    for (const group of groups) {
      const s = getSettings(group.id);
      if (!s.panelen?.enabled) continue;

      const walls = group.wallIds.map((id) => wallMap[id]).filter(Boolean);
      const mat = s.material ?? DEFAULT_MATERIAL;
      const verband = s.verband ?? DEFAULT_VERBAND;
      const facadeDataRaw = buildFullGroupFacadePattern(walls, mat, verband, s.maxHoogte, s.zetwerk, null, s.startLijn);
      if (!facadeDataRaw) continue;

      let facadeData = facadeDataRaw;
      if (s.penanten?.length) {
        const brickD = s.brickDepth ?? 20;
        const maskedRows = facadeDataRaw.rows.map((row) => ({
          ...row,
          pieces: row.pieces.flatMap((piece) => {
            let ps = [piece];
            for (const p of s.penanten) {
              const pX = p.x ?? 0;
              const pB = Math.max(1, p.breedte ?? 400);
              const maskStart = pX + brickD;
              const maskEnd = pX + pB - brickD;
              if (maskEnd <= maskStart) continue;
              ps = ps.flatMap((q) => {
                const qs = q.start, qe = q.start + q.length;
                if (qe <= maskStart || qs >= maskEnd) return [q];
                const out = [];
                if (qs < maskStart) out.push({ ...q, length: maskStart - qs });
                if (qe > maskEnd) out.push({ ...q, start: maskEnd, length: qe - maskEnd });
                return out;
              });
            }
            return ps;
          }),
        }));
        facadeData = { ...facadeDataRaw, rows: maskedRows };
      }

      const { groupWidth, groupHeight, groupOpenings } = facadeData;
      const battenYs = generateBattenPositions(groupHeight, mat, Math.max(50, s.latten?.maxInterval ?? 400), { minHOH: s.latten?.minHOH, maxHOH: s.latten?.maxHOH, targetPanelH: s.panelen?.hoogte, minPanelH: 800 });
      const basePanel = computeEffectiveBasePanel(s.panelen, (s.material ?? {}).brickWeightM2 ?? 40, s.material ?? mat);

      const openingsForZones = groupOpenings.map((op) => ({ id: `op_${op.x}_${op.y}`, x: op.x, y: op.y, width: op.width, height: op.height, polyPts: op.polyPts ?? null }));
      const PENANT_PANEL_INSET = 20;
      const penantOpenings = (s.penanten ?? []).map((pen, pi) => {
        const px = (pen.x ?? 0) + PENANT_PANEL_INSET;
        const pw = Math.max(1, (pen.breedte ?? 400) - 2 * PENANT_PANEL_INSET);
        if (pw <= 0) return null;
        return { id: `pen_${pi}`, x: px, y: 0, width: pw, height: groupHeight, polyPts: null };
      }).filter(Boolean);
      let panels = [];
      if (verband === 'wildverband') {
        const wRes = buildWildverbandPanelGrid(groupWidth, groupHeight, groupOpenings, mat, s.panelen ?? {});
        panels = wRes.panels;
      } else {
        const zones = buildFacadeZones(groupWidth, groupHeight, [...openingsForZones, ...penantOpenings]);
        for (const zone of zones) {
          const res = panelizeZone(zone, battenYs, basePanel, null, mat, verband);
          if (res.ok) panels.push(...res.panels);
        }
      }
      if (s.maxHoogte != null && s.maxHoogte > 0) {
        panels = panels.map((panel) => {
          if (panel.y >= s.maxHoogte) return null;
          if (panel.y + panel.height > s.maxHoogte) return { ...panel, height: s.maxHoogte - panel.y };
          return panel;
        }).filter(Boolean);
      }

      const moldDims = { hoogte: s.panelen.malBreedte ?? 270, lengte: s.panelen.malLengte ?? 3400, offsetX: s.panelen.malOffsetX ?? 0 };
      const groupLabel = group.name ?? group.id;
      const recipeRows = generateMoldRecipe(panels, mat, verband, s.panelen.dikte ?? 8, moldDims, groupLabel);
      allRows.push(...recipeRows);
    }

    if (allRows.length <= 1) {
      alert('Geen panelen gevonden. Schakel panelen in voor ten minste één groep.');
      return;
    }

    const csv = allRows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mal-recept.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // SPARING-ELEMENTEN — laad een IFC, scan de niet-wand kandidaat-types, importeer de gekozen types.
  async function handleSparingFile(file) {
    if (!file) return;
    console.log('[sparingen] scan gestart:', file.name, `(${(file.size / 1048576).toFixed(1)} MB)`);
    setSparingScan({ file, types: [], selected: new Set(), busy: true, progress: 'Bestand scannen…' });
    try {
      const types = await scanIfcSparingTypes(file);
      console.log('[sparingen] scan klaar — types met geometrie:', types.map((t) => `${t.ifcEntityType.replace(/^IFC/, '')}×${t.count}`).join(', ') || '(geen)');
      if (!types.length) { alert('Geen fysieke onderdelen (met geometrie) in dit bestand gevonden.'); setSparingScan(null); return; }
      setSparingScan({ file, types, selected: new Set(), busy: false });
    } catch (e) { console.error('[sparingen] scan mislukt:', e); alert('Scannen mislukt: ' + (e?.message ?? e)); setSparingScan(null); }
  }
  async function handleSparingImport() {
    if (!sparingScan?.file) return;
    const sel = [...(sparingScan.selected ?? [])];
    if (!sel.length) { alert('Selecteer minstens één type.'); return; }
    setSparingScan((s) => (s ? { ...s, busy: true, progress: 'Importeren…' } : s));
    try {
      const els = await parseIfcSparingElements(sparingScan.file, sel, (p) => {
        if (p?.log) console.log('[sparingen]', p.log);
        setSparingScan((s) => (s ? { ...s, busy: true, progress: p?.log ?? s.progress } : s));
      });
      // DEBUG-RAPPORT na afloop: aantal + wereld-bbox + eerste onderdelen (zie ook de per-groep-knip-log).
      console.group('%c[sparingen] import-rapport', 'color:#f97316;font-weight:bold');
      console.log(`${els.length} onderdelen geïmporteerd — types: ${sel.join(', ')}`);
      if (els.length) {
        const r = Math.round;
        const E = els.reduce((a, e) => ({
          minX: Math.min(a.minX, e.bbox.minX), maxX: Math.max(a.maxX, e.bbox.maxX),
          minY: Math.min(a.minY, e.bbox.minY), maxY: Math.max(a.maxY, e.bbox.maxY),
          minZ: Math.min(a.minZ, e.bbox.minZ), maxZ: Math.max(a.maxZ, e.bbox.maxZ),
        }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity });
        console.log(`wereld-bbox (mm): X[${r(E.minX)}..${r(E.maxX)}]  Y[${r(E.minY)}..${r(E.maxY)}]  Z[${r(E.minZ)}..${r(E.maxZ)}]`);
        console.table(els.slice(0, 30).map((e) => ({ type: e.ifcEntityType.replace(/^IFC/, ''), name: e.name, minX: r(e.bbox.minX), maxX: r(e.bbox.maxX), minY: r(e.bbox.minY), maxY: r(e.bbox.maxY), minZ: r(e.bbox.minZ), maxZ: r(e.bbox.maxZ) })));
        if (els.length > 30) console.log(`… en nog ${els.length - 30} meer (zie sparingElements-state)`);
      }
      console.groupEnd();
      setSparingElements(els);
      setSparingScan(null);
      if (!els.length) alert('Geen geometrie gevonden voor de gekozen types.');
    } catch (e) { console.error('[sparingen] import mislukt:', e); alert('Import mislukt: ' + (e?.message ?? e)); setSparingScan((s) => (s ? { ...s, busy: false } : null)); }
  }

  function handleExportMallen() {
    // Exporteer de mal van de groep die je IN BEELD hebt in de panelisatie (activeGroup), niet zomaar
    // de eerste panelen-groep — anders krijg je bv. een halfsteens-mal terwijl je een staand verband
    // bekijkt. Val alleen terug op de eerste panelen-groep als er geen (geschikte) actieve groep is.
    const active = groups.find((g) => g.id === activeGroupId);
    const useGroup = (active && getSettings(active.id).panelen?.enabled)
      ? active
      : groups.find((g) => getSettings(g.id).panelen?.enabled);
    if (!useGroup) { alert('Schakel panelen in voor ten minste één groep.'); return; }
    const s = getSettings(useGroup.id);
    const mat = s.material ?? DEFAULT_MATERIAL;
    const verband = s.verband ?? DEFAULT_VERBAND;
    const moldDims = { hoogte: s.panelen.malBreedte ?? 270, lengte: s.panelen.malLengte ?? 3400, offsetX: s.panelen.malOffsetX ?? 0 };
    const tpl = getMoldTemplates(verband, mat, moldDims);
    // Downloads SERIEEL (met tussenpoos) — meerdere <a download>-klikken vlak na elkaar worden door de
    // browser geblokkeerd na de eerste, waardoor eerder alleen MAL-A landde. Spreiden lost dat op.
    tpl.templates.forEach((tmpl, i) => {
      setTimeout(() => {
        const dxf = generateMoldDXF(mat, verband, moldDims, tmpl.id);
        const blob = new Blob([dxf], { type: 'application/dxf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        // Bestandsnaam = metselverband + de mal-aanduiding (dezelfde die óp de DXF gesneden wordt).
        // De aanduiding bevat spaties en '/' → bestandsnaam-veilig maken (→ '-').
        const ident = moldIdLabel(mat, tmpl.id).replace(/[/\\ ]+/g, '-');
        a.download = `${verband}_${ident}.dxf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, i * 400);
    });
    const html = generateCombinedMoldPrintHTML(mat, verband, moldDims);
    const win = window.open('', 'MAL-Links-Rechts');
    if (win) { win.document.write(html); win.document.close(); }
    else alert('Pop-up geblokkeerd. Sta pop-ups toe voor deze pagina.');
  }

  function handleExport() {
    try {
    const settingsMap = Object.fromEntries(groups.map((g) => [g.id, getSettings(g.id)]));
    const exportGroups = groups.filter((group) => !hiddenGroupIds.has(group.id)).map((group) => {
      const s = getSettings(group.id);
      const walls = group.wallIds.map((id) => wallMap[id]).filter(Boolean);
      const gAdj = adjacencies.filter((a) => group.wallIds.includes(a.wallIdA) && group.wallIds.includes(a.wallIdB));
      const rows = buildGroupPattern(walls, gAdj, s.material ?? DEFAULT_MATERIAL, s.verband ?? DEFAULT_VERBAND, 'all');

      const mat = s.material ?? DEFAULT_MATERIAL;
      const vis = Object.fromEntries(
        ['strips', 'zetwerk', 'panelen', 'latten'].map(k => [
          k,
          (s.layerVisibility?.[k] ?? true) && (s.ifcLayerVisibility?.[k] ?? true)
        ])
      );
      const withOrigin = walls.filter((w) => w.wallOrigin);

      const ctrimsExport = endExtensionsToTrims(s.endExtensions);
      // SINGLE-SOURCE (achter ?bestFitGroups=1): handmatige best-fit-groepen exporteren
      // EXACT de bekleding die scherm/2D tonen — dezelfde allPatterns[group.id].facadeData
      // (= buildBestFitFacadePattern-uitkomst). Zo wijkt de export niet af van het scherm.
      // Vlag UIT of niet-handmatig → het bestaande oude pad (byte-identiek). Ontbreekt de
      // best-fit-data onverhoopt → terugval op buildFullGroupFacadePattern.
      const useBestFitExport = isBestFitGroups() && group.manual === true;
      const facadeDataRaw = (useBestFitExport ? (allPatterns[group.id]?.facadeData ?? null) : null)
        ?? buildFullGroupFacadePattern(walls, mat, s.verband ?? DEFAULT_VERBAND, s.maxHoogte, s.zetwerk, null, s.startLijn, ctrimsExport.extendLeft, ctrimsExport.extendRight);
      const _refWall = facadeDataRaw ? null : ([...withOrigin].sort((a, b) => (b.length ?? 0) - (a.length ?? 0))[0] ?? null);
      const refWallOrigin = facadeDataRaw?.refWallOrigin ?? _refWall?.wallOrigin ?? null;
      const _axisW = refWallOrigin ? withOrigin.filter((w) => w.wallOrigin.lengthAxis === refWallOrigin.lengthAxis) : withOrigin;
      const _axisH = refWallOrigin ? withOrigin.filter((w) => w.wallOrigin.heightAxis === refWallOrigin.heightAxis) : withOrigin;
      const groupMinX = facadeDataRaw?.groupMinX ?? (_axisW.length ? Math.min(..._axisW.map((w) => w.wallOrigin.lengthStart)) : 0);
      const groupMinH = facadeDataRaw?.groupMinH ?? (_axisH.length ? Math.min(..._axisH.map((w) => w.wallOrigin.heightStart)) : 0);
      let facadeData = facadeDataRaw;
      if (!facadeDataRaw && (s.backingType ?? 'hout') === 'aluminium_slimfort' && refWallOrigin) {
        const simpleGW = _axisW.length ? Math.max(..._axisW.map((w) => w.wallOrigin.lengthEnd)) - groupMinX : 0;
        const simpleGH = _axisH.length ? Math.max(..._axisH.map((w) => w.wallOrigin.heightEnd)) - groupMinH : 0;
        if (simpleGW > 0 && simpleGH > 0) {
          facadeData = { groupWidth: simpleGW, groupHeight: simpleGH, groupOpenings: [], groupMinX, groupMinH, refWallOrigin, rows: [] };
        }
      }
      if (facadeDataRaw && s.penanten?.length) {
        const brickD = s.brickDepth ?? 20;
        const maskedRows = facadeDataRaw.rows.map((row) => ({
          ...row,
          pieces: row.pieces.flatMap((piece) => {
            let ps = [piece];
            for (const p of s.penanten) {
              const pX = p.x ?? 0;
              const pB = Math.max(1, p.breedte ?? 400);
              const maskStart = pX + brickD;
              const maskEnd = pX + pB - brickD;
              if (maskEnd <= maskStart) continue;
              ps = ps.flatMap((q) => {
                const qs = q.start, qe = q.start + q.length;
                if (qe <= maskStart || qs >= maskEnd) return [q];
                const out = [];
                if (qs < maskStart) out.push({ ...q, length: maskStart - qs });
                if (qe > maskEnd) out.push({ ...q, start: maskEnd, length: qe - maskEnd });
                return out;
              });
            }
            return ps;
          }),
        }));
        facadeData = { ...facadeDataRaw, rows: maskedRows };
      }

      // FASE 2 — wildverband-strips voor de IFC-export uit het vastgelegde tegel-verband
      // (zelfde bron als scherm/2D/3D). Achter de vlag, default UIT → bestaande export.
      if (facadeData && (s.verband ?? DEFAULT_VERBAND) === 'wildverband' && isWildverbandKoppelstrip()) {
        const _tr = buildTruthRows(facadeData.groupWidth, facadeData.groupHeight, mat, facadeData.groupOpenings ?? []);
        facadeData = { ...facadeData, rows: _tr.rows };
      }
      if (facadeData && (s.verband ?? DEFAULT_VERBAND) === 'groothuis_wildverband' && isGroothuisWildverband()) {
        const _gr = buildGroothuisRows(facadeData.groupWidth, facadeData.groupHeight, mat, facadeData.groupOpenings ?? []);
        facadeData = { ...facadeData, rows: _gr.rows };
      }
      if (facadeData && (s.verband ?? DEFAULT_VERBAND) === 'groothuis_wildverband_2' && isGroothuisWildverband2()) {
        const _gr = buildGroothuis2Rows(facadeData.groupWidth, facadeData.groupHeight, mat, facadeData.groupOpenings ?? []);
        facadeData = { ...facadeData, rows: _gr.rows };
      }

      let panels = [];
      let lattenData = [];
      let uProfileData = [];
      let slimFortData = null;
      let slimFortFaces = null;

      const isSlimFort = (s.backingType ?? 'hout') === 'aluminium_slimfort';
      const isAluminium = (s.backingType ?? 'hout') === 'aluminium';
      const _artId = (s.lattenArtikelen ?? [])[0] ?? null;
      const _art = _artId ? BATTEN_CATALOG.find((a) => a.id === _artId) : null;
      const latDikteEff = _art ? _art.dikteMM : (s.latten?.dikte ?? 28);
      const latV18ProfilePts = _art?.v18ProfilePts ?? null;
      const latV18NokHeight = _art?.v18NokHeight ?? null;
      const latV18NokFootWidth = _art?.v18NokFootWidth ?? null;
      const latV18NokPitch = _art?.v18NokPitch ?? null;
      const latV18NokOffset = _art?.v18NokOffset ?? null;
      const latV18Data = latV18ProfilePts ? { v18ProfilePts: latV18ProfilePts, v18NokHeight: latV18NokHeight, v18NokFootWidth: latV18NokFootWidth, v18NokPitch: latV18NokPitch, v18NokOffset: latV18NokOffset } : {};

      if (facadeData) {
        const { rows: facRows, groupWidth, groupHeight, groupOpenings } = facadeData;

        const battenMaxInterval = Math.max(50, s.latten?.maxInterval ?? 400);
        const lintHalfExport = (mat.lint ?? 12) / 2;
        const zwExpVExport = s.zetwerk?.enabled ? Math.max(0, s.zetwerk.offsetV ?? 0) + Math.max(1, s.zetwerk.breedte ?? 50) : 0;
        const clampToGroupH = (y) => Math.min(groupHeight, Math.max(0, y));
        const allRowYsExport = (facRows ?? []).map((r) => r.y).sort((a, b) => a - b);
        const snapToRowYExport = (y) => {
          if (!allRowYsExport.length) return y;
          const target = y + lintHalfExport;
          return allRowYsExport.reduce((best, ry) => Math.abs(ry - target) < Math.abs(best - target) ? ry : best);
        };
        const baseBattenYs = (s.latten?.enabled || s.panelen?.enabled)
          ? generateBattenPositions(groupHeight, mat, battenMaxInterval, { minHOH: s.latten?.minHOH, maxHOH: s.latten?.maxHOH, targetPanelH: s.panelen?.hoogte, minPanelH: 800 })
          : [];
        const battenYs = baseBattenYs.map(snapToRowYExport);

        if (s.panelen?.enabled && vis.panelen !== false) {
          const basePanel = computeEffectiveBasePanel(s.panelen, (s.material ?? {}).brickWeightM2 ?? 40, s.material ?? mat);
          const openingsForZones = groupOpenings.map((op) => ({ id: `op_${op.x}_${op.y}`, x: op.x, y: op.y, width: op.width, height: op.height, polyPts: op.polyPts ?? null }));
          const PENANT_PANEL_INSET_EX = 20;
          const penantOpenings = (s.penanten ?? []).map((pen, pi) => {
            const px = (pen.x ?? 0) + PENANT_PANEL_INSET_EX;
            const pw = Math.max(1, (pen.breedte ?? 400) - 2 * PENANT_PANEL_INSET_EX);
            if (pw <= 0) return null;
            return { id: `pen_${pi}`, x: px, y: 0, width: pw, height: groupHeight, polyPts: null };
          }).filter(Boolean);
          if ((s.verband ?? DEFAULT_VERBAND) === 'wildverband') {
            const wRes = buildWildverbandPanelGrid(groupWidth, groupHeight, groupOpenings, mat, s.panelen ?? {});
            panels.push(...wRes.panels);
          } else {
            const zones = buildFacadeZones(groupWidth, groupHeight, [...openingsForZones, ...penantOpenings]);
            for (const zone of zones) {
              const res = panelizeZone(zone, battenYs, basePanel, allRowYsExport.length ? snapToRowYExport : null, mat, s.verband ?? DEFAULT_VERBAND);
              if (res.ok) panels.push(...res.panels);
            }
          }
          
          if (s.maxHoogte != null && s.maxHoogte > 0) {
            panels = panels.map((panel) => {
              if (panel.y >= s.maxHoogte) return null;
              if (panel.y + panel.height > s.maxHoogte) return { ...panel, height: s.maxHoogte - panel.y };
              return panel;
            }).filter(Boolean);
          }
          if (s.startLijn != null && s.startLijn > 0) {
            panels = panels.map((panel) => {
              if (panel.y + panel.height <= s.startLijn) return null;
              if (panel.y < s.startLijn) return { ...panel, y: s.startLijn, height: panel.y + panel.height - s.startLijn };
              return panel;
            }).filter(Boolean);
          }
          if (s.startLijn != null && s.startLijn < 0 && panels.length > 0) {
            const minY = Math.min(...panels.map((p) => p.y));
            panels = panels.map((p) => p.y <= minY + 0.5 ? { ...p, y: s.startLijn, height: p.height + p.y - s.startLijn } : p);
          }
          if (s.zetwerk?.enabled && groupOpenings.length > 0) {
            const CLEARANCE = 10;
            const sideExpand = (s.zetwerk.offsetH ?? 0) + (s.zetwerk.breedte ?? 50) + CLEARANCE;
            panels = panels.map((panel) => {
              let { x, width } = panel;
              for (const op of groupOpenings) {
                if (panel.y + panel.height <= op.y || panel.y >= op.y + op.height) continue;
                if (x < op.x && x + width > op.x - sideExpand) width = Math.max(0, op.x - sideExpand - x);
                if (x >= op.x + op.width && x < op.x + op.width + sideExpand) {
                  const newX = op.x + op.width + sideExpand;
                  width = Math.max(0, x + width - newX);
                  x = newX;
                }
              }
              if (width <= 0) return null;
              return { ...panel, x, width };
            }).filter(Boolean);
          }
          panels = panels.filter((panel) => panel.height >= 200 && panel.width >= 10);
          const facRowH = (s.verband ?? 'halfsteens') === 'staand_tegelverband' ? mat.steenL : mat.steenH;
          panels = panels.filter((panel) => {
            for (const row of (facRows ?? [])) {
              if (!row?.pieces?.length) continue;
              if (row.y + facRowH <= panel.y || row.y >= panel.y + panel.height) continue;
              for (const piece of row.pieces) {
                const px2 = Math.max(piece.start, panel.x);
                const px3 = Math.min(piece.start + piece.length, panel.x + panel.width);
                if (px3 - px2 > 1) return true;
              }
            }
            return false;
          });
        }

        if (isAluminium && facadeData) {
          const ccs = s.concreteCladdingSettings ?? {};
          const spacing = Math.max(100, ccs.uProfileSpacing ?? 600);
          const profW = Math.max(10, ccs.uProfileWidth ?? 60);
          const gW = facadeData.groupWidth;
          const gH = facadeData.groupHeight;
          const maxH = s.maxHoogte != null && s.maxHoogte > 0 ? Math.min(gH, s.maxHoogte) : gH;
          for (let x = 0; x <= gW + spacing / 2; x += spacing) {
            const cx = Math.round(Math.min(x, gW));
            uProfileData.push({ richting: 'verticaal', x: Math.round(cx - profW / 2), y: 0, width: profW, height: maxH });
          }
        }

        if (isSlimFort && facadeData) {
          const sfSettings = { ...SLIMFORT_DEFAULTS, ...(s.slimFortSettings ?? {}) };
          const _envVisExport = buildingEnvelopeData
            ? extractVisibleConcreteFaces(walls.filter((w) => w.wallOrigin), effectiveWalls, buildingEnvelopeData)
            : null;
          let _sfFaces;
          if (_envVisExport && _envVisExport.length > 0) {
            const _sfTotalExport = sfSettings.totalThickness ?? 196;
            const _wallDecompExport = decomposeAndConnect(group.id, _envVisExport, _sfTotalExport);
            const _cfcsExport = sfSettings.concreteFaceCladdingSettings?.enabled !== false && sfSettings.concreteFaceCladdingSettings != null
              ? { ...CONCRETE_FACE_CLADDING_DEFAULTS, ...sfSettings.concreteFaceCladdingSettings }
              : null;
            _sfFaces = getPrimaryWallSegments(_wallDecompExport)
              .flatMap((seg) => {
                const descriptor = wallSegmentToSlimFortFaceDescriptor(seg);
                const grid = generateSlimFortGrid(
                  seg.localWidth,
                  seg.localHeight,
                  seg.wallType === 'front' ? seg.openings : [],
                  sfSettings,
                  seg.wallType === 'front' ? s.maxHoogte : null,
                  seg.faceType,
                );
                if (_cfcsExport) {
                  if (seg.wallType === 'front') {
                    const faces = [];
                    if (_cfcsExport.cladLeftLongFace && grid) {
                      const lr = computeFaceLongRanges({ ..._cfcsExport, cladRightLongFace: false }, seg.localWidth);
                      const g = lr ? applyRangesToGrid(grid, lr) : grid;
                      if (g) faces.push({ ...descriptor, grid: g });
                    }
                    if (_cfcsExport.cladRightLongFace && grid && seg.wallThickness) {
                      const rr = computeFaceLongRanges({ ..._cfcsExport, cladLeftLongFace: false }, seg.localWidth);
                      const g = rr ? applyRangesToGrid(grid, rr) : grid;
                      if (g) faces.push({ ...descriptor, faceId: descriptor.faceId + '-back', faceType: 'back', outsideDir: -(seg.outsideDir ?? 1), outsidePos: (seg.outsidePos ?? 0) - (seg.outsideDir ?? 1) * seg.wallThickness, grid: g });
                    }
                    return faces;
                  }
                  if (seg.wallType === 'leftReturn' && _cfcsExport.cladLeftEndFace) return [{ ...descriptor, grid }];
                  if (seg.wallType === 'rightReturn' && _cfcsExport.cladRightEndFace) return [{ ...descriptor, grid }];
                  return [];
                }
                if (seg.wallType === 'front' && sfSettings.cladFrontFace === false) return [];
                if ((seg.wallType === 'leftReturn' || seg.wallType === 'rightReturn') && !sfSettings.cladSideFaces) return [];
                if ((seg.wallType === 'portalLeft' || seg.wallType === 'portalRight') && !sfSettings.cladPortalInnerFaces) return [];
                return [{ ...descriptor, grid }];
              }).filter((f) => f.grid != null);
          } else {
            const _wallThickness = refWallOrigin
              ? Math.abs((refWallOrigin.thicknessEnd ?? refWallOrigin.thicknessStart + 200) - refWallOrigin.thicknessStart)
              : 250;
            _sfFaces = generateSlimFortFaces({
              groupWidth: facadeData.groupWidth,
              groupHeight: facadeData.groupHeight,
              wallThickness: _wallThickness,
              openings: facadeData.groupOpenings ?? [],
              settings: sfSettings,
              maxH: s.maxHoogte,
            });
          }
          const _sfTrimL = ctrimsExport.trimLeft ?? 0;
          const _sfTrimR = ctrimsExport.trimRight ?? 0;
          if (_sfTrimL > 0 || _sfTrimR > 0) {
            _sfFaces = _sfFaces.map((face) => {
              if (face.faceType !== 'front') return face;
              const clipped = applyCornerTrimToSlimFort(face.grid, _sfTrimL, facadeData.groupWidth - _sfTrimR);
              return { ...face, grid: clipped };
            });
          }
          slimFortFaces = _sfFaces;
          const _frontFace = _sfFaces.find((f) => f.faceType === 'front');
          slimFortData = _frontFace?.grid ?? null;
          uProfileData = slimFortData?.profiles ?? [];
        }

        if (!isAluminium && !isSlimFort && s.latten?.enabled && vis.latten !== false) {
          const latBreedte = Math.max(5, _art ? _art.breedteMM : (s.latten.breedte ?? 50));
          const richting = s.latten.richting ?? 'horizontaal';

          if (richting === 'horizontaal') {
            const gH = Math.round(groupHeight);
            const minH = Math.max(0, Math.round(s.startLijn ?? 0));
            const zwExpV = (s.zetwerk?.enabled) ? Math.max(0, (s.zetwerk.offsetV ?? 0)) + Math.max(1, s.zetwerk.breedte ?? 50) : 0;
            const clampY = (y) => Math.min(gH, Math.max(0, y));

            const boundaryYs = new Set([minH, gH]);
            for (const panel of panels) { boundaryYs.add(clampY(Math.round(panel.y))); boundaryYs.add(clampY(Math.round(panel.y + panel.height))); }

            const sortedBoundaries = [...boundaryYs].sort((a, b) => a - b);
            const allYs = new Set(sortedBoundaries);
            for (let i = 0; i < sortedBoundaries.length - 1; i++) {
              const span = sortedBoundaries[i + 1] - sortedBoundaries[i];
              if (span > s.latten.maxInterval) {
                const steps = Math.ceil(span / s.latten.maxInterval);
                for (let st = 1; st < steps; st++) allYs.add(Math.round(sortedBoundaries[i] + (span / steps) * st));
              }
            }

            for (const yr of [...allYs].filter(y => y >= minH && y <= gH).sort((a, b) => a - b)) {
              let latY;
              if (yr === minH) latY = minH;
              else if (yr === gH) latY = yr - latBreedte;
              else latY = yr - latBreedte / 2;
              const latTop = latY, latBot = latY + latBreedte;
              const openingsAtY = groupOpenings.filter((op) => op.y < latBot && op.y + op.height > latTop);
              if (openingsAtY.length === 0) {
                lattenData.push({ richting: 'horizontaal', x: 0, y: latY, width: groupWidth, height: latBreedte, ...latV18Data });
              } else {
                const opRanges = openingsAtY.flatMap((op) => openingXRangesAtY(op, latTop, latBot)).sort((a, b) => a.x1 - b.x1);
                let cursor = 0;
                for (const op of opRanges) {
                  if (op.x1 > cursor) lattenData.push({ richting: 'horizontaal', x: cursor, y: latY, width: op.x1 - cursor, height: latBreedte, ...latV18Data });
                  cursor = Math.max(cursor, op.x2);
                }
                if (cursor < groupWidth) lattenData.push({ richting: 'horizontaal', x: cursor, y: latY, width: groupWidth - cursor, height: latBreedte, ...latV18Data });
              }
            }
            const getOpXWExp = (op, y) => {
              if (op.polyPts?.length >= 3) {
                const ranges = polyXRangesAtY(op.polyPts, y);
                if (ranges.length) return { x: ranges[0][0], width: ranges[ranges.length - 1][1] - ranges[0][0] };
              }
              return { x: op.x, width: op.width };
            };
            for (const op of groupOpenings) {
              const belowLatY = Math.round(clampY(op.y - zwExpV)) - latBreedte;
              const rawAboveExp = Math.round(clampY(op.y + op.height + zwExpV));
              const firstAboveExp = allRowYsExport.find(ry => ry >= rawAboveExp - 0.5) ?? rawAboveExp;
              const aboveLatY = firstAboveExp;
              if (belowLatY >= 0) {
                const { x: bx, width: bw } = getOpXWExp(op, belowLatY + latBreedte / 2);
                lattenData.push({ richting: 'horizontaal', x: bx, y: belowLatY, width: bw, height: latBreedte, ...latV18Data });
              }
              if (aboveLatY + latBreedte <= gH) {
                const { x: ax, width: aw } = getOpXWExp(op, aboveLatY + latBreedte / 2);
                lattenData.push({ richting: 'horizontaal', x: ax, y: aboveLatY, width: aw, height: latBreedte, ...latV18Data });
              }
            }
          } else {
            const xPositions = new Set([0, groupWidth]);
            for (const panel of panels) { xPositions.add(Math.round(panel.x)); xPositions.add(Math.round(panel.x + panel.width / 2)); xPositions.add(Math.round(panel.x + panel.width)); }
            lattenData = [...xPositions].sort((a, b) => a - b).map((x) => {
              const lx1 = Math.round(x) - latBreedte / 2;
              const pen = (s.penanten ?? []).find((p) => { const px1 = p.x ?? 0; const px2 = px1 + Math.max(1, p.breedte ?? 400); return lx1 + latBreedte > px1 + 5 && lx1 < px2 - 5; });
              const latH = pen ? Math.max(1, pen.hoogte ?? 2000) : groupHeight;
              return { richting: 'verticaal', x: lx1, y: 0, width: latBreedte, height: latH };
            });
          }
        }
      }

      if (s.maxHoogte != null && s.maxHoogte > 0) {
        lattenData = lattenData.map((lat) => {
          if (lat.y >= s.maxHoogte) return null;
          if (lat.y + lat.height > s.maxHoogte) return { ...lat, height: s.maxHoogte - lat.y };
          return lat;
        }).filter(Boolean);
      }

      const _zwOpenings = facadeData?.groupOpenings ?? [];
      if (s.zetwerk?.enabled && _zwOpenings.length > 0) {
        const CLEARANCE = 10;
        const sideExpand = (s.zetwerk.offsetH ?? 0) + (s.zetwerk.breedte ?? 50) + CLEARANCE;
        const vertExpand = (s.zetwerk.offsetV ?? 0) + (s.zetwerk.breedte ?? 50) + (s.zetwerk.stripOffset ?? 5);
        const clippedLats = [];
        for (const lat of lattenData) {
          if (lat.richting !== 'horizontaal' || lat.openingForced) { clippedLats.push(lat); continue; }
          const latMidY = lat.y + lat.height / 2;
          const relevant = _zwOpenings.filter((op) => latMidY >= op.y - vertExpand && latMidY <= op.y + op.height + vertExpand);
          if (relevant.length === 0) { clippedLats.push(lat); continue; }
          let segments = [{ start: lat.x, end: lat.x + lat.width }];
          for (const op of relevant) {
            const exFrom = op.x - sideExpand;
            const exTo = op.x + op.width + sideExpand;
            const next = [];
            for (const seg of segments) {
              if (seg.end <= exFrom || seg.start >= exTo) { next.push(seg); continue; }
              if (seg.start < exFrom) next.push({ start: seg.start, end: exFrom });
              if (seg.end > exTo) next.push({ start: exTo, end: seg.end });
            }
            segments = next;
          }
          for (const seg of segments) {
            const w = seg.end - seg.start;
            if (w > 0.5) clippedLats.push({ ...lat, x: seg.start, width: w });
          }
        }
        lattenData = clippedLats;
      }

      const penantFaceRows = (s.penanten ?? []).map((p) => {
        const pB = Math.max(1, p.breedte ?? 400);
        const pDL2 = Math.max(1, p.diepteLinks  ?? p.diepte ?? 150);
        const pDR2 = Math.max(1, p.diepteRechts ?? p.diepte ?? 150);
        const pH = Math.max(1, p.hoogte ?? 2000);
        const brickDepth = s.brickDepth ?? 20;
        const panelDikteP = s.panelen?.dikte ?? 8;
        const stoot = p.stoot ?? mat.stoot ?? 10;
        const sideDepthL = Math.max(1, pDL2 - 6);
        const sideDepthR = Math.max(1, pDR2 - 6);
        const clipOff = Math.max(stoot, panelDikteP);
        const penSL2 = Math.max(0, s.startLijn ?? 0);   // penant-strips volgen de groep-startlijn
        const penEffPH2 = pH - penSL2;
        const shiftPenY2 = (rows) => penSL2 > 0 ? rows.map((row) => ({ ...row, y: Math.round((row.y + penSL2) * 100) / 100 })) : rows;
        const frontRows = shiftPenY2(buildCenteredFacePattern(pB, penEffPH2, mat, s.verband ?? DEFAULT_VERBAND));
        const rawLeft = shiftPenY2(buildFacePattern(sideDepthL, penEffPH2, mat, s.verband ?? DEFAULT_VERBAND));
        const rawRight = shiftPenY2(buildFacePattern(sideDepthR, penEffPH2, mat, s.verband ?? DEFAULT_VERBAND));
        const clipSideFront = (rawRows, armDepth) => {
          const clipEnd = armDepth - clipOff;
          return rawRows.map((row) => ({
            ...row,
            pieces: row.pieces.flatMap((pc) => {
              if (pc.start >= clipEnd) return [];
              if (pc.start + pc.length <= clipEnd) return [pc];
              return [{ ...pc, length: Math.round((clipEnd - pc.start) * 100) / 100 }];
            }),
          })).filter((row) => row.pieces.length > 0);
        };
        const leftRows = clipSideFront(rawLeft, sideDepthL);
        const rightRows = clipSideFront(rawRight, sideDepthR);
        return { frontRows, leftRows, rightRows, sideDepthL, sideDepthR, pDL: pDL2, pDR: pDR2 };
      });

      const _stripBatchArtId = (s.steenstripsArtikelen ?? [])[0];
      const _stripBatchArt = _stripBatchArtId ? STEENSTRIP_CATALOG.find((a) => a.id === _stripBatchArtId) : null;
      const stripBatches = (() => {
        if (!facadeData) return null;
        const { rows: baseRows, groupWidth: gW } = facadeData;
        const zoneSettingsArr = s.zoneSettings ?? [];
        const sortedPens = [...(s.penanten ?? [])].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
        const numZ = sortedPens.length + 1;
        const enabledZones = [];
        const zoneBrickD = s.brickDepth ?? 20;
        for (let zi = 0; zi < numZ; zi++) {
          const zs = zoneSettingsArr[zi];
          if (!zs?.enabled) continue;
          const zX1Raw = zi === 0 ? 0 : (sortedPens[zi - 1].x ?? 0) + Math.max(1, sortedPens[zi - 1].breedte ?? 400);
          const zX2Raw = zi === numZ - 1 ? gW : (sortedPens[zi].x ?? 0);
          const zX1 = zi === 0 ? zX1Raw : zX1Raw - zoneBrickD;
          const zX2 = zi === numZ - 1 ? zX2Raw : zX2Raw + zoneBrickD;
          if (zX2 <= zX1) continue;
          const zoneMatBase = { ...mat, ...(zs.material ?? {}) };
          const zoneMat = _stripBatchArt ? { ...zoneMatBase, steenL: _stripBatchArt.steenL, steenH: _stripBatchArt.steenH } : zoneMatBase;
          const zoneVerband = zs.verband ?? (s.verband ?? DEFAULT_VERBAND);
          const zoneMaxH = zs.maxHoogte ?? (s.maxHoogte ?? null);
          const zFull = buildFullGroupFacadePattern(walls, zoneMat, zoneVerband, zoneMaxH, s.zetwerk, null, s.startLijn);
          if (!zFull) continue;
          const clipRows = zFull.rows.map((row) => ({
            ...row,
            pieces: row.pieces.flatMap((piece) => {
              const ps = piece.start, pe = piece.start + piece.length;
              if (pe <= zX1 || ps >= zX2) return [];
              const cs = Math.max(ps, zX1), ce = Math.min(pe, zX2);
              return [{ ...piece, start: cs, length: ce - cs }];
            }).filter((p) => p.length > 1),
          })).filter((row) => row.pieces.length > 0);
          enabledZones.push({ zX1, zX2, rows: clipRows, material: zoneMat, color: zs.color ?? s.color, verband: zoneVerband });
        }
        if (!enabledZones.length) return null;
        const generalRows = baseRows.map((row) => ({
          ...row,
          pieces: row.pieces.flatMap((piece) => {
            let ps = [piece];
            for (const ez of enabledZones) {
              ps = ps.flatMap((q) => {
                const qs = q.start, qe = q.start + q.length;
                if (qe <= ez.zX1 || qs >= ez.zX2) return [q];
                const out = [];
                if (qs < ez.zX1) out.push({ ...q, length: ez.zX1 - qs });
                if (qe > ez.zX2) out.push({ ...q, start: ez.zX2, length: qe - ez.zX2 });
                return out;
              });
            }
            return ps;
          }).filter((p) => p.length > 1),
        })).filter((row) => row.pieces.length > 0);
        return [
          { rows: generalRows, material: mat, color: s.color ?? '#a64033', verband: s.verband ?? DEFAULT_VERBAND },
          ...enabledZones,
        ];
      })();

      const ifcGW = facadeData?.groupWidth ?? 0;
      const _applyCornerToRows = (rws, gW) => {
        const tL = ctrimsExport.trimLeft, tR = ctrimsExport.trimRight;
        const eL = ctrimsExport.extendLeft, eR = ctrimsExport.extendRight;
        if (!tL && !tR) return rws;
        const xMin = tL - eL, xMax = gW + eR - tR;
        return rws.map((row) => {
          let pieces = row.pieces.flatMap((p) => {
            let ps = p.start, pe = p.start + p.length;
            if (pe <= xMin || ps >= xMax) return [];
            ps = Math.max(ps, xMin); pe = Math.min(pe, xMax);
            const len = pe - ps;
            if (len < 1) return [];
            return [{ ...p, start: ps, length: len }];
          }).filter((p) => p.length > 1);
          return { ...row, pieces };
        }).filter((row) => row.pieces.length > 0);
      };
      let baseStripBatches = stripBatches ?? (facadeData?.rows ? [{ rows: facadeData.rows, material: mat, color: s.color ?? '#a64033', verband: s.verband ?? DEFAULT_VERBAND }] : null);
      // FASE 2 — stripZone-regio-tak (zelfde gedeelde functie als de scherm-glue, identieke
      // argumenten ⇒ identieke regions ⇒ scherm-hash == export-hash). Alleen niet-penant-
      // vlakken; penant-vlakken houden stripBatches hierboven byte-identiek.
      if (facadeData && isFeatureZones() && !hasPenants(s) && getActiveStripZones(s).length > 0) {
        const _regions = buildStripZoneRegions(facadeData, s.stripZones, mat, s.verband ?? DEFAULT_VERBAND, s.color ?? '#a64033', { stripArt: _stripBatchArt });
        if (_regions) baseStripBatches = _regions.map((r) => ({ rows: r.rows, material: r.material, color: r.color, verband: r.verband }));
      }
      const finalStripBatches = baseStripBatches && ifcGW > 0
        ? baseStripBatches.map((b) => ({ ...b, rows: _applyCornerToRows(b.rows, ifcGW) })).filter((b) => b.rows.length > 0)
        : baseStripBatches;
      const _applyCornerToLats = (lats, gW) => {
        const tL = ctrimsExport.lattenTrimLeft, tR = ctrimsExport.lattenTrimRight;
        const eL = ctrimsExport.lattenExtendLeft, eR = ctrimsExport.lattenExtendRight;
        if (!tL && !tR && !eL && !eR) return lats;
        return lats.flatMap((lat) => {
          if (lat.richting !== 'horizontaal') return [lat];
          let lx = lat.x, lw = lat.x + lat.width;
          if (tL > 0 && lw <= tL) return [];
          if (tR > 0 && lx >= gW - tR) return [];
          if (tL > 0) lx = Math.max(lx, tL);
          if (tR > 0) lw = Math.min(lw, gW - tR);
          if (eL > 0 && lat.x <= 0) lx -= eL;
          if (eR > 0 && lat.x + lat.width >= gW) lw += eR;
          const newW = lw - lx;
          if (newW <= 0) return [];
          return [{ ...lat, x: lx, width: newW }];
        });
      };
      const finalLattenData = ifcGW > 0 ? _applyCornerToLats(lattenData, ifcGW) : lattenData;
      const _applyCornerToPanels = (pnls, gW) => {
        const tL = ctrimsExport.panelsTrimLeft, tR = ctrimsExport.panelsTrimRight;
        const eL = ctrimsExport.panelsExtendLeft, eR = ctrimsExport.panelsExtendRight;
        if (!tL && !tR && !eL && !eR) return pnls;
        const xMin = tL, xMax = gW - tR;
        return pnls.flatMap((p) => {
          let px = p.x, pw = p.x + p.width;
          if (tL > 0 && pw <= xMin) return [];
          if (tR > 0 && px >= xMax) return [];
          if (tL > 0) px = Math.max(px, xMin);
          if (tR > 0) pw = Math.min(pw, xMax);
          if (eL > 0 && p.x <= 0) px -= eL;
          if (eR > 0 && p.x + p.width >= gW) pw += eR;
          const newW = pw - px;
          if (newW <= 0) return [];
          return [{ ...p, x: px, width: newW }];
        });
      };
      const finalPanels = ifcGW > 0 ? _applyCornerToPanels(panels, ifcGW) : panels;

      const _ifcStripArtId = (s.steenstripsArtikelen ?? [])[0];
      const _ifcStripArt = _ifcStripArtId ? STEENSTRIP_CATALOG.find((a) => a.id === _ifcStripArtId) : null;
      const ifcBrickD = _ifcStripArt ? _ifcStripArt.dikte : (s.brickDepth ?? 20);
      const exportCornerWraps = [];
      // CORNER_BUTT_MODE: stompe hoek → geen omslag-steenstrips op het loodrechte vlak.
      if (!isCornerButtMode()) for (const [cfgKey, cfg] of Object.entries(cornerConfigs)) {
        if (cfg.mainGroupId !== group.id) continue;
        const secGroup = groups.find((g) => g.id === cfg.secondaryGroupId);
        if (!secGroup) continue;
        const secS = settingsMap[secGroup.id] ?? {};
        const secWalls = secGroup.wallIds.map((id) => wallMap[id]).filter(Boolean).filter((w) => !!w.wallOrigin);
        if (!secWalls.length) continue;
        const secRefWall = [...secWalls].sort((a, b) => (b.length ?? 0) - (a.length ?? 0))[0];
        const secRwo = secRefWall.wallOrigin;
        const secAxisW = secWalls.filter((w) => w.wallOrigin.lengthAxis === secRwo.lengthAxis);
        const secGroupMinX = Math.min(...secAxisW.map((w) => w.wallOrigin.lengthStart));
        const secGroupMinH = Math.min(...secAxisW.map((w) => w.wallOrigin.heightStart));
        const secGW = Math.max(...secAxisW.map((w) => w.wallOrigin.lengthStart + (w.length ?? 0))) - secGroupMinX;
        const secIsSlimFort = (secS.backingType ?? 'hout') === 'aluminium_slimfort';
        const secArtId = (secS.lattenArtikelen ?? [])[0] ?? null;
        const secArt = secArtId ? BATTEN_CATALOG.find((a) => a.id === secArtId) : null;
        const secLatDikte = secArt ? secArt.dikteMM : (secS.latten?.dikte ?? 28);
        const secHasVertLat = secS.latten?.richting === 'verticaal';
        const secEffLat = secHasVertLat ? 2 * secLatDikte : secLatDikte;
        const secPanelD = secS.panelen?.dikte ?? 8;
        const mainEE = s.endExtensions ?? {};
        const secEE  = secS.endExtensions ?? {};
        const mainExtendL = Math.max(0, mainEE.left?.strips  ?? 0);
        const mainExtendR = Math.max(0, mainEE.right?.strips ?? 0);
        const stripsExtend = Math.max(mainExtendL, mainExtendR);
        if (stripsExtend <= 0) continue;
        const secTrimL = (secEE.left?.strips  ?? 0) < 0;
        const secTrimR = (secEE.right?.strips ?? 0) < 0;
        let wrapPieceStart = null;
        if (secTrimL) wrapPieceStart = 0;
        else if (secTrimR) wrapPieceStart = secGW - stripsExtend;
        if (wrapPieceStart === null) continue;
        let wrapDepthFromFace;
        if (secIsSlimFort) {
          const secSfSettings = { ...SLIMFORT_DEFAULTS, ...(secS.slimFortSettings ?? {}) };
          const secPanelVentGap = secS.concreteCladdingSettings?.panelVentilationGap ?? 0;
          const secSfDepths = getSlimFortDepths(secSfSettings, secPanelVentGap, secPanelD, ifcBrickD);
          wrapDepthFromFace = secSfDepths.brickCenter;
        } else {
          wrapDepthFromFace = secEffLat + secPanelD + ifcBrickD / 2;
        }
        const sourceRows = facadeData?.rows ?? [];
        const wrapRows = sourceRows.map((row) => ({ y: row.y, pieces: [{ start: wrapPieceStart, length: stripsExtend }] }));
        if (!wrapRows.length) continue;
        const mainVerband = s.verband ?? DEFAULT_VERBAND;
        const mainMat = s.material ?? DEFAULT_MATERIAL;
        const wrapBrickH = mainVerband === 'staand_tegelverband' ? mainMat.steenL : mainMat.steenH;
        exportCornerWraps.push({
          secRwo,
          secGroupMinX,
          secGroupMinH,
          secOutsideDirFlip: !!(secS.outsideDirFlip),
          depthFromFace: wrapDepthFromFace,
          brickD: ifcBrickD,
          rows: wrapRows,
          color: s.color ?? '#a64033',
          brickH: wrapBrickH,
        });
      }

      return {
        id: group.id,
        name: s.name,
        wallsWithRows: walls.map((wall) => {
          const wallHeightOffset = (wall.wallOrigin?.heightStart ?? 0) - groupMinH;
          let wallRows = rows[wall.expressID] ?? [];
          if (s.maxHoogte != null && s.maxHoogte > 0) {
            wallRows = wallRows.filter((row) => wallHeightOffset + row.y < s.maxHoogte);
          }
          return { wall, rows: wallRows };
        }),
        panels: finalPanels,
        lattenData: finalLattenData,
        latDikte: latDikteEff ?? (s.latten?.dikte ?? 28),
        zetwerk: s.zetwerk,
        facadeData,
        stripBatches: finalStripBatches,
        cornerWraps: exportCornerWraps,
        groupMinX,
        groupMinH,
        refWallOrigin,
        layerVisibility: vis,
        maxHoogte: s.maxHoogte ?? null,
        penantFaceRows,
        backingType: s.backingType ?? 'hout',
        concreteCladdingSettings: s.concreteCladdingSettings ?? null,
        slimFortSettings: s.slimFortSettings ?? null,
        uProfileData,
        slimFortData,
        slimFortFaces,
      };
    });
    const defaultName = (ifcFileName ?? 'export').replace(/-moo/gi, '-KSA');
    const groupSuffix = groups
      .filter((g) => !hiddenGroupIds.has(g.id))
      .map((g) => (getSettings(g.id).name ?? g.id).replace(/[^a-zA-Z0-9\-]/g, '_'))
      .join('_');
    const autoName = groupSuffix ? `${defaultName}_${groupSuffix}` : defaultName;
    exportGroupsToIfc(exportGroups, settingsMap, exportFileName.trim() || autoName, exportDirHandle);
    } catch (err) {
      alert('IFC export mislukt:\n' + (err?.message ?? String(err)));
      console.error('IFC export error:', err);
    }
  }

  const ungrouped = effectiveWalls.filter((w) => !wallGroupMap[w.expressID]);
  const activeGroup = groups.find((g) => g.id === activeGroupId);
  const selectionHasUngrouped = [...selectedWallIds].some((id) => !wallGroupMap[id]);
  const ungroupedSelCount = [...selectedWallIds].filter((id) => !wallGroupMap[id]).length;

  const penantFaceData = useMemo(() => {
    if (!activeGroup) return [];
    const s = getSettings(activeGroup.id);
    if (!s.penanten?.length) return [];
    const mat = s.material ?? DEFAULT_MATERIAL;
    const verband = s.verband ?? DEFAULT_VERBAND;
    const walls = activeGroup.wallIds.map((id) => wallMap[id]).filter(Boolean);
    const groupMinH = walls.length ? Math.min(...walls.map((w) => w.wallOrigin?.heightStart ?? 0)) : 0;

    return s.penanten.map((p) => {
      const pX = p.x ?? 0;
      const pB = Math.max(1, p.breedte ?? 400);
      const pDL = Math.max(1, p.diepteLinks  ?? p.diepte ?? 150);
      const pDR = Math.max(1, p.diepteRechts ?? p.diepte ?? 150);
      const pH = Math.max(1, p.hoogte ?? 2000);
      const penSL = Math.max(0, s.startLijn ?? 0);   // penant-strips volgen de groep-startlijn
      const penEffPH = pH - penSL;
      const shiftPenY = (rows) => penSL > 0 ? rows.map((row) => ({ ...row, y: Math.round((row.y + penSL) * 100) / 100 })) : rows;
      const frontRows = shiftPenY(buildCenteredFacePattern(pB, penEffPH, mat, verband));

      const brickDepth = s.brickDepth ?? 20;
      const panelDikte = s.panelen?.dikte ?? 8;
      const stoot = p.stoot ?? mat.stoot ?? 10;
      const panelDepthL = Math.max(1, pDL - brickDepth - stoot);
      const panelDepthR = Math.max(1, pDR - brickDepth - stoot);
      const sideClipOffset = Math.max(stoot, panelDikte);
      const clipLeft = (rows, pd) => rows.map((row) => ({
        ...row,
        pieces: row.pieces.flatMap((pc) => {
          const clipEnd = pd - sideClipOffset;
          if (pc.start >= clipEnd) return [];
          if (pc.start + pc.length <= clipEnd) return [pc];
          return [{ ...pc, length: Math.round((clipEnd - pc.start) * 100) / 100 }];
        }),
      })).filter((row) => row.pieces.length > 0);
      const clipRight = (rows) => rows.map((row) => ({
        ...row,
        pieces: row.pieces.flatMap((pc) => {
          if (pc.start + pc.length <= sideClipOffset) return [];
          if (pc.start >= sideClipOffset) return [pc];
          const newStart = Math.round(sideClipOffset * 100) / 100;
          return [{ ...pc, start: newStart, length: Math.round((pc.start + pc.length - newStart) * 100) / 100 }];
        }),
      })).filter((row) => row.pieces.length > 0);
      const leftRows = clipLeft(shiftPenY(buildFacePattern(panelDepthL, penEffPH, mat, verband)), panelDepthL);
      const rightRows = clipRight(shiftPenY(buildFacePattern(panelDepthR, penEffPH, mat, verband)));
      return { penant: p, front: frontRows, left: leftRows, right: rightRows, height: pH, groupMinH, sideClipOffset, panelDepthL, panelDepthR, pDL, pDR };
    });
  }, [activeGroup, getSettings, wallMap, adjacencies]);
  const adjWallIds = useMemo(() => new Set(adjacencies.flatMap((a) => [a.wallIdA, a.wallIdB])), [adjacencies]);

  const totalSelected = wallTypes.filter((t) => selectedTypes.has(t.name)).reduce((s, t) => s + t.count, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {loadStatus === 'selecting' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: 520, maxHeight: '82vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{mergeMode ? 'Aanvullen uit IFC' : 'Elementtypen selecteren'}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
              {pendingFile?.name} · {mergeMode ? 'Selecteer welke typen je wilt toevoegen aan het huidige project' : 'Selecteer welke typen je wilt importeren'}
            </div>

            {/* Zone import mode toggle — hidden in merge mode */}
            {!mergeMode && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: zoneImportMode ? '#eff6ff' : '#f8fafc', border: `1px solid ${zoneImportMode ? '#3b82f6' : '#e2e8f0'}`, borderRadius: 6 }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={zoneImportMode} onChange={(e) => setZoneImportMode(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: zoneImportMode ? '#1d4ed8' : '#374151' }}>
                      Zone-import modus
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      Gebruik de geselecteerde elementen als steenstrip-oppervlakken (de achterzijde = start van het systeem). Elk coplanair cluster wordt een gevelgroep; elk element wordt een strip-zone.
                    </div>
                  </div>
                </label>
              </div>
            )}
            {mergeMode && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fefce8', border: '1px solid #ca8a04', borderRadius: 6, fontSize: 11, color: '#92400e' }}>
                De geselecteerde elementen worden <strong>toegevoegd</strong> aan de huidige wanden. Bestaande groepen blijven behouden.
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <input
                type="text"
                placeholder="🔍 Zoeken op naam of type…"
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                style={{ flex: 1, fontSize: 12, padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 4, outline: 'none' }}
                autoFocus
              />
              {typeFilter && (
                <button onClick={() => setTypeFilter('')}
                  style={{ fontSize: 11, background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 7px', cursor: 'pointer' }}>
                  ✕
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button onClick={() => setSelectedTypes(new Set(wallTypes.map((t) => t.name)))}
                style={{ fontSize: 11, background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>
                Alle selecteren
              </button>
              <button onClick={() => setSelectedTypes(new Set())}
                style={{ fontSize: 11, background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>
                Geen selecteren
              </button>
              {!zoneImportMode && (
                <button onClick={() => setSelectedTypes(new Set(wallTypes.filter(t => t.ifcEntityType === 'IFCWALL' || t.ifcEntityType === 'IFCWALLSTANDARDCASE').map(t => t.name)))}
                  style={{ fontSize: 11, background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>
                  Alleen wanden
                </button>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
              {wallTypes.filter(t => {
                if (!typeFilter) return true;
                const q = typeFilter.toLowerCase();
                return t.name.toLowerCase().includes(q) || (t.ifcEntityType ?? '').toLowerCase().includes(q);
              }).map((t) => {
                const checked = selectedTypes.has(t.name);
                const entityColor = t.ifcEntityType === 'IFCWALL' || t.ifcEntityType === 'IFCWALLSTANDARDCASE' ? '#3b82f6'
                  : t.ifcEntityType === 'IFCSLAB' ? '#8b5cf6'
                  : t.ifcEntityType === 'IFCBUILDINGELEMENTPROXY' ? '#f59e0b'
                  : t.ifcEntityType === 'IFCCOVERING' ? '#10b981'
                  : '#64748b';
                return (
                  <label key={`${t.ifcEntityType}::${t.name}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: checked ? '#eff6ff' : '#fff' }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleType(t.name)} />
                    <span style={{ fontSize: 9, color: '#fff', background: entityColor, padding: '1px 5px', borderRadius: 3, fontWeight: 600, flexShrink: 0, letterSpacing: 0.3 }}>
                      {(t.ifcEntityType ?? 'IFC').replace('IFC', '')}
                    </span>
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>{t.name}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8', background: '#f1f5f9', padding: '1px 7px', borderRadius: 10 }}>{t.count}</span>
                  </label>
                );
              })}
              {wallTypes.filter(t => {
                if (!typeFilter) return false;
                const q = typeFilter.toLowerCase();
                return t.name.toLowerCase().includes(q) || (t.ifcEntityType ?? '').toLowerCase().includes(q);
              }).length === 0 && typeFilter && (
                <div style={{ padding: '14px 12px', fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>Geen resultaten voor "{typeFilter}"</div>
              )}
            </div>


            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: '#64748b', flex: 1 }}>
                {totalSelected} element{totalSelected !== 1 ? 'en' : ''} geselecteerd
                {!mergeMode && zoneImportMode && <span style={{ color: '#3b82f6', fontWeight: 600 }}> · Zone-modus</span>}
                {mergeMode && <span style={{ color: '#b45309', fontWeight: 600 }}> · Aanvullen</span>}
              </span>
              <button onClick={cancelImport} style={{ fontSize: 12, background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, padding: '6px 14px', cursor: 'pointer' }}>
                Annuleren
              </button>
              <button onClick={mergeMode ? confirmMergeImport : zoneImportMode ? confirmZoneImport : confirmImport} disabled={!selectedTypes.size}
                style={{ fontSize: 12, background: selectedTypes.size ? (mergeMode ? '#b45309' : zoneImportMode ? '#059669' : '#3b82f6') : '#94a3b8', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', cursor: selectedTypes.size ? 'pointer' : 'not-allowed', fontWeight: 600 }}>
                {mergeMode ? '➕ Toevoegen' : zoneImportMode ? '🗺 Als zones importeren' : 'Importeren'}
              </button>
            </div>
          </div>
        </div>
      )}
      {(loadStatus === 'loading' || loadStatus === 'scanning') && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.75)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#1e293b', borderRadius: 12, padding: '32px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.5)', minWidth: 320 }}>
            <div style={{ width: 48, height: 48, border: '4px solid #334155', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'wt-spin 0.8s linear infinite' }} />
            <style>{`@keyframes wt-spin { to { transform: rotate(360deg); } }`}</style>
            <div style={{ color: '#f1f5f9', fontSize: 15, fontWeight: 600 }}>
              {loadStatus === 'scanning' ? 'IFC bestand scannen…' : 'IFC wanden importeren…'}
            </div>
            {loadStatus === 'loading' && loadProgress.total > 0 && (() => {
              const pct = Math.round((loadProgress.current / loadProgress.total) * 100);
              return (
                <div style={{ width: '100%' }}>
                  <div style={{ background: '#334155', borderRadius: 4, height: 8, overflow: 'hidden', width: '100%' }}>
                    <div style={{ background: '#3b82f6', height: '100%', width: `${pct}%`, transition: 'width 0.1s ease', borderRadius: 4 }} />
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 11, textAlign: 'center', marginTop: 6 }}>
                    {loadProgress.current} / {loadProgress.total} wanden ({pct}%)
                  </div>
                </div>
              );
            })()}
            {loadStatus === 'loading' && loadProgress.total === 0 && (
              <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', maxWidth: 280 }}>
                Bestand inladen en openingen detecteren…
              </div>
            )}
            {loadStatus === 'scanning' && (
              <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', maxWidth: 280 }}>
                Wandtypen worden gedetecteerd. Even geduld.
              </div>
            )}
            {loadLogs.length > 0 && (
              <div style={{ width: '100%', background: '#0f172a', borderRadius: 6, padding: '8px 10px', maxHeight: 140, overflowY: 'auto', fontFamily: 'monospace', fontSize: 10, color: '#94a3b8', lineHeight: 1.6 }}>
                {loadLogs.map((l, i) => (
                  <div key={i} style={{ color: l.includes('✓') ? '#4ade80' : l.includes('✗') ? '#f87171' : '#94a3b8' }}>{l}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}


      {similarSuggestions && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Vergelijkbare groeperingen gevonden</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
              Er zijn <strong>{similarSuggestions.groups.length}</strong> groeperingen gevonden met dezelfde samenstelling en onderlinge posities.
              Geselecteerde groepen worden gekoppeld — instellingen zijn later in één keer te synchroniseren.
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {similarSuggestions.groups.map((wallIds, idx) => {
                const walls = wallIds.map((id) => allWalls.find((w) => w.expressID === id)).filter(Boolean);
                return (
                  <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', background: '#f8fafc' }}>
                    <input type="checkbox" defaultChecked style={{ width: 16, height: 16 }} id={`sim-${idx}`} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{wallIds.length} element{wallIds.length !== 1 ? 'en' : ''}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        {walls.map((w) => `${w.length}×${w.height}mm`).join(' + ')}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: '#6366f1', background: '#ede9fe', padding: '2px 8px', borderRadius: 10 }}>
                      🔗 gekoppeld
                    </span>
                  </label>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSimilarSuggestions(null)}
                style={{ fontSize: 12, background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, padding: '6px 14px', cursor: 'pointer' }}>
                Overslaan
              </button>
              <button
                onClick={() => {
                  const { linkId, sourceGroupId } = similarSuggestions;
                  const sourceName = getSettings(sourceGroupId).name;
                  const checkboxes = similarSuggestions.groups.map((_, idx) => document.getElementById(`sim-${idx}`)?.checked ?? true);
                  pushHistory(groups);
                  const existingNames = new Set(groups.map((g) => getSettings(g.id).name));
                  let newGroupCounter = 0;
                  const newGroupEntries = similarSuggestions.groups
                    .map((wallIds, idx) => ({ wallIds, checked: checkboxes[idx] }))
                    .filter(({ checked }) => checked)
                    .map(({ wallIds }) => {
                      const gid = newGid();
                      const color = nextColor();
                      let candidateName;
                      do {
                        newGroupCounter++;
                        candidateName = `${sourceName}-${newGroupCounter}`;
                      } while (existingNames.has(candidateName));
                      existingNames.add(candidateName);
                      initColor(gid, color, candidateName);
                      return { group: { id: gid, wallIds: sortWallsInComponent(wallIds, allWalls, adjacencies) }, gid };
                    });
                  setGroups((prev) => [...prev, ...newGroupEntries.map((e) => e.group)]);
                  setGroupLinks((prev) => {
                    const next = { ...prev };
                    next[sourceGroupId] = linkId;
                    for (const { gid } of newGroupEntries) next[gid] = linkId;
                    return next;
                  });
                  setSimilarSuggestions(null);
                }}
                style={{ fontSize: 12, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', cursor: 'pointer', fontWeight: 600 }}>
                Groepen aanmaken &amp; koppelen
              </button>
            </div>
          </div>
        </div>
      )}

      {duplicateGroupsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Gelijke groepen zoeken</div>
            {duplicateGroupsModal.empty ? (
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>Geen gelijke groepen gevonden. Alle groepen hebben een unieke samenstelling.</div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
                  Er zijn <strong>{duplicateGroupsModal.clusters.length}</strong> set{duplicateGroupsModal.clusters.length !== 1 ? 's' : ''} van gelijke groepen gevonden.
                  Groepen in dezelfde set kunnen worden gekoppeld zodat instellingen gesynchroniseerd worden.
                </div>
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                  {duplicateGroupsModal.clusters.map((cluster, ci) => {
                    const firstWalls = cluster[0].wallIds.map((id) => allWalls.find((w) => w.expressID === id)).filter(Boolean);
                    const dims = firstWalls.map((w) => `${w.length}×${w.height}`).join(' + ');
                    const totalOps = firstWalls.reduce((s, w) => s + (w.openings?.filter((o) => o.type === 'raam' || o.type === 'deur').length ?? 0), 0);
                    return (
                      <div key={ci} style={{ border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
                        <div style={{ padding: '8px 12px', background: '#f1f5f9', fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: '#6366f1' }}>Set {ci + 1}</span>
                          <span style={{ color: '#64748b', fontWeight: 400 }}>— {cluster[0].wallIds.length} element{cluster[0].wallIds.length !== 1 ? 'en' : ''}, {dims} mm{totalOps > 0 ? `, ${totalOps} opening${totalOps !== 1 ? 'en' : ''}` : ''}</span>
                          <span style={{ marginLeft: 'auto', fontSize: 11, background: '#dbeafe', color: '#1d4ed8', padding: '1px 7px', borderRadius: 10 }}>{cluster.length} groepen</span>
                        </div>
                        <div style={{ padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {cluster.map((g) => {
                            const s = getSettings(g.id);
                            return (
                              <span key={g.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 8px', fontSize: 11 }}>
                                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block', flexShrink: 0 }} />
                                {s.name}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDuplicateGroupsModal(null)}
                style={{ fontSize: 12, background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, padding: '6px 14px', cursor: 'pointer' }}>
                Sluiten
              </button>
              {!duplicateGroupsModal.empty && (
                <button
                  onClick={() => {
                    pushHistory(groups);
                    setGroupLinks((prev) => {
                      const next = { ...prev };
                      for (const cluster of duplicateGroupsModal.clusters) {
                        const existingLinks = cluster.map((g) => next[g.id]).filter(Boolean);
                        const linkId = existingLinks[0] ?? `L${cluster[0].id}`;
                        for (const g of cluster) next[g.id] = linkId;
                      }
                      return next;
                    });
                    setDuplicateGroupsModal(null);
                  }}
                  style={{ fontSize: 12, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', cursor: 'pointer', fontWeight: 600 }}>
                  Alle sets koppelen
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ background: '#1e293b', color: '#f8fafc', flexShrink: 0 }}>
        <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #334155', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#f1f5f9', whiteSpace: 'nowrap' }}>IFC Brickslip Planner</span>
          <div style={{ width: 1, height: 20, background: '#334155', flexShrink: 0 }} />

          <Tooltip text={"Kies een IFC-bestand. De browser onthoudt de locatie zodat je het volgende keer direct kunt laden.\nAlleen Basic Wall elementen worden weergegeven."}>
            <button
              onClick={handlePickFile}
              disabled={loadStatus === 'loading' || loadStatus === 'scanning'}
              style={{ background: (loadStatus === 'loading' || loadStatus === 'scanning') ? '#475569' : '#3b82f6', color: '#fff', padding: '4px 10px', borderRadius: 4, fontSize: 11, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              {loadStatus === 'scanning' ? '🔍 Scannen…' : loadStatus === 'loading' ? '⏳ Laden…' : '📂 IFC kiezen'}
            </button>
          </Tooltip>
          <input id="ifc-file-input" type="file" accept=".ifc" onChange={handleFileChange} style={{ display: 'none' }} />
          <input id="ifc-merge-file-input" type="file" accept=".ifc" onChange={handleMergeFileChange} style={{ display: 'none' }} />
          {allWalls.length > 0 && (
            <Tooltip text={"Voeg elementen uit een tweede IFC-bestand toe aan het huidige project. Bestaande groepen blijven behouden."}>
              <button
                onClick={handlePickMergeFile}
                disabled={loadStatus === 'loading' || loadStatus === 'scanning'}
                style={{ background: (loadStatus === 'loading' || loadStatus === 'scanning') ? '#475569' : '#92400e', color: '#fff', padding: '4px 10px', borderRadius: 4, fontSize: 11, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                ➕ Aanvullen…
              </button>
            </Tooltip>
          )}
          {ifcFileName && <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{ifcFileName}.ifc · {allWalls.length} wanden</span>}
          {loadError && <span style={{ fontSize: 11, color: '#f87171' }}>⚠ {loadError}</span>}

          {(savedHandle || savedFileInfo) && !allWalls.length && loadStatus === 'idle' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1e3a5f', border: '1px solid #2563eb', borderRadius: 5, padding: '2px 8px' }}>
              <span style={{ fontSize: 11, color: '#93c5fd' }}>
                {savedHandle ? '📁' : '💾'} {savedHandle?.name ?? savedFileInfo?.name}
                {' — '}{new Date((savedHandle?.savedAt ?? savedFileInfo?.savedAt)).toLocaleDateString('nl-NL')}
              </span>
              <button onClick={loadFromStorage} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 3, padding: '2px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Laden</button>
              <button onClick={forgetSavedFile} style={{ background: 'none', color: '#64748b', border: 'none', fontSize: 13, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>×</button>
            </div>
          )}

          <div style={{ width: 1, height: 20, background: '#334155', flexShrink: 0 }} />
          <Tooltip text={"Maakt de laatste groepering-actie ongedaan.\nSneltoets: Ctrl+Z"}>
            <button onClick={undo} disabled={groupsHistory.length === 0} style={{ background: '#334155', color: groupsHistory.length === 0 ? '#64748b' : '#f1f5f9', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: groupsHistory.length === 0 ? 'default' : 'pointer', opacity: groupsHistory.length === 0 ? 0.5 : 1 }}>
              ↩ Undo
            </button>
          </Tooltip>
          <Tooltip text={"Sla het huidige project op als een JSON-bestand."}>
            <button onClick={handleSaveProject} style={{ background: '#0f766e', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              💾 Opslaan
            </button>
          </Tooltip>
          <Tooltip text={"Laad een eerder opgeslagen projectbestand (.json)."}>
            <label style={{ background: '#1e40af', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              📂 Laden
              <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleLoadProject} />
            </label>
          </Tooltip>
          <Tooltip text={"Wis het huidige project en begin opnieuw. Alle wanden, groepen en instellingen worden verwijderd."}>
            <button onClick={handleNewProject} style={{ background: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              🗑 Nieuw project
            </button>
          </Tooltip>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {viewMode === '3d' && (
              <Tooltip text={"Toont het berekende steenstrippatroon als gekleurde vlakken op de wanden in de 3D-viewer."}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#94a3b8', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={showPattern} onChange={(e) => setShowPattern(e.target.checked)} />
                  Patroon 3D
                </label>
              </Tooltip>
            )}
            {viewMode === '2d' && gridLines.length > 0 && (
              <Tooltip text={"Toont de IFC-stramienlijnen als verticale stippellijnen in het 2D gevelaanzicht."}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#94a3b8', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={showGridLines} onChange={(e) => setShowGridLines(e.target.checked)} />
                  Stramienlijnen
                </label>
              </Tooltip>
            )}
            {viewMode === '2d' && (
              <Tooltip text={"Toont hartlijnen van tussenruimten in het 2D gevelaanzicht."}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#94a3b8', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={showCenterLines} onChange={(e) => setShowCenterLines(e.target.checked)} />
                  Hartlijnen
                </label>
              </Tooltip>
            )}
            {allWalls.length > 0 && (
              <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', border: '1px solid #334155' }}>
                <Tooltip text={"Toont alle wanden in een interactieve 3D-viewer."}>
                  <button onClick={() => setViewMode('3d')} style={{ background: viewMode === '3d' ? '#3b82f6' : '#1e293b', color: '#fff', border: 'none', padding: '4px 10px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>3D</button>
                </Tooltip>
                <Tooltip text={"Toont het 2D gevelaanzicht van de actieve groep."}>
                  <button onClick={() => setViewMode('2d')} style={{ background: viewMode === '2d' ? '#3b82f6' : '#1e293b', color: viewMode === '2d' ? '#fff' : '#94a3b8', border: 'none', borderLeft: '1px solid #334155', padding: '4px 10px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>2D Gevel</button>
                </Tooltip>
                <Tooltip text={"Technische werktekening met maatvoering voor montage."}>
                  <button onClick={() => setViewMode('tekening')} style={{ background: viewMode === 'tekening' ? '#3b82f6' : '#1e293b', color: viewMode === 'tekening' ? '#fff' : '#94a3b8', border: 'none', borderLeft: '1px solid #334155', padding: '4px 10px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>📐 Tekening</button>
                </Tooltip>
                <Tooltip text={"Uittrekstaat met totaaloverzicht van alle materialen."}>
                  <button onClick={() => setViewMode('uittrekstaat')} style={{ background: viewMode === 'uittrekstaat' ? '#3b82f6' : '#1e293b', color: viewMode === 'uittrekstaat' ? '#fff' : '#94a3b8', border: 'none', borderLeft: '1px solid #334155', padding: '4px 10px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>📋 Staat</button>
                </Tooltip>
                <Tooltip text={"Parametrische wildverband paneelplanner met gevelvisualisatie en openingsbeheer."}>
                  <button onClick={() => setViewMode('wildverband_planner')} style={{ background: viewMode === 'wildverband_planner' ? '#3b82f6' : '#1e293b', color: viewMode === 'wildverband_planner' ? '#fff' : '#94a3b8', border: 'none', borderLeft: '1px solid #334155', padding: '4px 10px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>🧱 Wildverband</button>
                </Tooltip>
                {activeGroup && (allPatterns[activeGroup.id]?.slimFortFaces?.length > 0) && (
                  <Tooltip text={"SlimFort XT® werktekeningen: EPS-indeling, nesting, profielen en beugels."}>
                    <button onClick={() => setViewMode('slimfort_tekening')} style={{ background: viewMode === 'slimfort_tekening' ? '#0369a1' : '#1e293b', color: viewMode === 'slimfort_tekening' ? '#fff' : '#38bdf8', border: 'none', borderLeft: '1px solid #334155', padding: '4px 10px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>🏗️ SlimFort</button>
                  </Tooltip>
                )}
                {allWalls.length > 0 && (
                  <Tooltip text={"Parametrisch detailboek met systeemdoorsneden, openingsdetails, hoeken en SlimFort details."}>
                    <button onClick={() => setViewMode('detailboek')} style={{ background: viewMode === 'detailboek' ? '#166534' : '#1e293b', color: viewMode === 'detailboek' ? '#fff' : '#86efac', border: 'none', borderLeft: '1px solid #334155', padding: '4px 10px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>📋 Detailboek</button>
                  </Tooltip>
                )}
              </div>
            )}
            {(pendingFile ?? savedFileInfo?.file ?? savedHandle?.handle) && (
              <Tooltip text="Controleer of IfcWall-elementen een geldige wand-geometrie hebben (rechthoekig profiel, verticale oriëntatie)">
                <button onClick={handleValidateGeometry} style={{ background: validationReport?.length ? '#b45309' : '#1d4ed8', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>
                  🔍 Geometrie valideren{validationReport ? ` (${validationReport.length})` : ''}
                </button>
              </Tooltip>
            )}
            <Tooltip text="Open de handleiding — chronologische uitleg van alle stappen">
              <button onClick={() => setShowHandleiding(true)} style={{ background: '#0f766e', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>📖 Handleiding</button>
            </Tooltip>
            <Tooltip text="Bekijk de logica-regels per onderdeel en de wijzigingshistorie">
              <button onClick={() => setShowRulesModal(true)} style={{ background: '#475569', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>? Regels</button>
            </Tooltip>
            <Tooltip text="Zet optionele functies (feature-vlaggen) aan/uit met schakelaars i.p.v. URL-parameters">
              <button onClick={() => setFlagsOpen(true)} style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>⚙ Vlaggen</button>
            </Tooltip>
            <span style={{ fontSize: 10, color: '#475569', userSelect: 'none' }}>v{APP_VERSION}</span>
          </div>
        </div>

        {(groups.length > 0 || groups.some((g) => getSettings(g.id).panelen?.enabled)) && (
          <div style={{ padding: '4px 14px', display: 'flex', alignItems: 'center', gap: 6, background: '#172033', borderBottom: '1px solid #263148', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>Export</span>
            <button
              onClick={async () => {
                try {
                  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
                  setExportDirHandle(handle);
                } catch {}
              }}
              style={{ fontSize: 10, padding: '2px 7px', border: `1px solid ${exportDirHandle ? '#10b981' : '#334155'}`, borderRadius: 4, background: exportDirHandle ? '#064e3b' : '#0f172a', color: exportDirHandle ? '#6ee7b7' : '#94a3b8', cursor: 'pointer', whiteSpace: 'nowrap' }}
              title="Kies de map waar IFC-exports automatisch worden opgeslagen"
            >
              📁 {exportDirHandle ? exportDirHandle.name : 'Exportmap kiezen'}
            </button>
            {exportDirHandle && (
              <button onClick={() => setExportDirHandle(null)} style={{ fontSize: 10, background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: '0 2px' }} title="Exportmap vergeten">✕</button>
            )}
            {groups.length > 0 && (
              <>
                <input
                  type="text"
                  value={exportFileName}
                  onChange={(e) => setExportFileName(e.target.value)}
                  placeholder={`${(ifcFileName ?? 'export').replace(/-moo/gi, '-KSA')}_gevelbekleding`}
                  style={{ fontSize: 11, padding: '2px 6px', border: '1px solid #334155', borderRadius: 4, background: '#0f172a', color: '#e2e8f0', width: 180, outline: 'none' }}
                  title="Bestandsnaam voor de IFC-export (zonder .ifc extensie)"
                />
                <Tooltip text={"Exporteert zichtbare groepen als een nieuw IFC-bestand.\nVerborgen groepen (👁 Zichtbaarheid in de 3D-viewer) worden overgeslagen.\nDit bestand bevat ALLEEN de gevelbekleding — GEEN originele wandelementen.\nImporteer dit bestand naast het originele IFC in je BIM-software.\nWelke lagen worden geëxporteerd is per groep te regelen via 'Laagzichtbaarheid 2D'."}>
                  <button onClick={handleExport} style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    ⬇ Gevelbekleding IFC{groups.some((g) => hiddenGroupIds.has(g.id)) ? ` (${groups.filter((g) => !hiddenGroupIds.has(g.id)).length}/${groups.length})` : ''}
                  </button>
                </Tooltip>
                {(() => {
                  const exportedGroups = groups.filter((g) => !hiddenGroupIds.has(g.id));
                  const names = exportedGroups.map((g) => getSettings(g.id).name ?? g.id);
                  const shown = names.slice(0, 4).join(', ');
                  const overflow = names.length > 4 ? ` +${names.length - 4}` : '';
                  return (
                    <span style={{ fontSize: 10, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }} title={names.join(', ')}>
                      {shown}{overflow}
                    </span>
                  );
                })()}
              </>
            )}
            {groups.some((g) => getSettings(g.id).panelen?.enabled) && (
              <>
                {isMalRecept() && (
                  <>
                    <div style={{ width: 1, height: 16, background: '#334155' }} />
                    <Tooltip text={"Exporteert een productie-recept CSV per paneel.\nBevat: paneel-afmetingen, rijen per maldoorgang, slede-posities.\nOpenen in Excel met puntkomma als scheidingsteken."}>
                      <button onClick={handleExportMalRecept} style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        ⬇ Mal recept CSV
                      </button>
                    </Tooltip>
                  </>
                )}
                <div style={{ width: 1, height: 16, background: '#334155' }} />
                <Tooltip text={"Downloadt DXF voor MAL Links + MAL Rechts naar de downloadmap.\nOpent tegelijk één gecombineerde printtekening (A0) met beide mallen."}>
                  <button onClick={handleExportMallen} style={{ background: '#0f766e', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    ⬇ Mallen DXF + PDF
                  </button>
                </Tooltip>
              </>
            )}
            {isSparingElementen() && (
              <>
                <div style={{ width: 1, height: 16, background: '#334155' }} />
                <Tooltip text={"Laad een IFC met NIET-wand onderdelen (leidingen/kanalen/proxies).\nWaar ze in de gevel liggen wordt de bekleding er rondom weggespaard volgens de offset.\nDe onderdelen worden in 3D oranje getoond."}>
                  <label style={{ background: '#c2410c', color: '#fff', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    📎 Sparingen laden
                    <input type="file" accept=".ifc,.IFC" style={{ display: 'none' }}
                      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; handleSparingFile(f); }} />
                  </label>
                </Tooltip>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>offset</span>
                <input type="number" min={0} step={1} value={sparingOffset}
                  onChange={(e) => setSparingOffset(Math.max(0, Number(e.target.value) || 0))}
                  title="Marge (mm) rondom elk onderdeel waar de bekleding wordt weggespaard"
                  style={{ width: 52, fontSize: 11, padding: '2px 4px', border: '1px solid #334155', borderRadius: 4, background: '#0f172a', color: '#e2e8f0', outline: 'none' }} />
                <span style={{ fontSize: 10, color: '#94a3b8' }}>mm</span>
                {sparingElements.length > 0 && (
                  <span style={{ fontSize: 10, color: '#f97316', whiteSpace: 'nowrap' }}
                    title="Aantal geïmporteerde onderdelen · hoeveel er uit de bekleding zijn geknipt (in hoeveel groepen). Details in de browser-console (F12).">
                    {sparingElements.length} onderdeel{sparingElements.length !== 1 ? 'en' : ''}
                    {sparingDebug ? ` · ${sparingDebug.totalRects} geknipt (${sparingDebug.groupsHit} groep${sparingDebug.groupsHit !== 1 ? 'en' : ''})` : ''}
                    <button onClick={() => setSparingElements([])} title="Sparingen wissen"
                      style={{ marginLeft: 4, background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 11 }}>✕</button>
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {isSparingElementen() && sparingScan && (
        <div style={{ position: 'fixed', top: 84, right: 20, zIndex: 1000, background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: 12, width: 300, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', marginBottom: 8 }}>Sparing-onderdelen importeren</div>
          {sparingScan.busy && <div style={{ fontSize: 11, color: '#38bdf8' }}>⏳ {sparingScan.progress ?? 'Bezig…'}</div>}
          {!sparingScan.busy && (sparingScan.types ?? []).map((t) => (
            <label key={t.ifcEntityType} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#cbd5e1', padding: '2px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={sparingScan.selected.has(t.ifcEntityType)}
                onChange={(e) => setSparingScan((s) => { const sel = new Set(s.selected); if (e.target.checked) sel.add(t.ifcEntityType); else sel.delete(t.ifcEntityType); return { ...s, selected: sel }; })} />
              {t.ifcEntityType.replace(/^IFC/, '')} <span style={{ color: '#64748b' }}>({t.count})</span>
            </label>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button onClick={handleSparingImport} disabled={sparingScan.busy}
              style={{ flex: 1, background: '#c2410c', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>Importeren</button>
            <button onClick={() => setSparingScan(null)}
              style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>Annuleren</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ width: leftCollapsed ? 28 : 280, background: '#f8fafc', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0, transition: 'width 0.18s ease', position: 'relative' }}>
          <button
            onClick={() => setLeftCollapsed((v) => !v)}
            title={leftCollapsed ? 'Zijpaneel uitklappen' : 'Zijpaneel inklappen'}
            style={{ position: 'absolute', top: 6, right: leftCollapsed ? 4 : 6, zIndex: 10, background: '#e2e8f0', border: 'none', borderRadius: 3, width: 18, height: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#475569', padding: 0, flexShrink: 0 }}
          >
            {leftCollapsed ? '›' : '‹'}
          </button>
          {!leftCollapsed && allWalls.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12, padding: 16, textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
                <div>Importeer een IFC-bestand om te beginnen</div>
                {isSyntheticWall() && (
                  <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>…of maak een calc-wand (zonder IFC):</div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {[['L', 'L'], ['H', 'H'], ['dikte', 'dikte']].map(([key, lbl]) => (
                        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 11, color: '#475569' }}>
                          {lbl}
                          <input type="number" min={1} step={key === 'dikte' ? 0.5 : 10} value={synWallInput[key]}
                            onChange={(e) => setSynWallInput((p) => ({ ...p, [key]: e.target.value }))}
                            style={{ width: 60, fontSize: 11, padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: 3 }} />
                        </label>
                      ))}
                      <span style={{ fontSize: 10, color: '#94a3b8' }}>mm</span>
                      <button onClick={addSyntheticWall} style={btn('#7c3aed')}>+ Wand (L×H)</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : !leftCollapsed ? (
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingTop: 26 }}>
              {adjacencies.length > 0 && (
                <Tooltip block text={"Aangrenzende elementen delen een gemeenschappelijke rand.\nDit betekent dat het brickslip-patroon doorlopend kan worden over meerdere wanden.\nGebruik 'Auto-groeperen' om ze automatisch in groepen te verdelen."}>
                  <div style={{ padding: '5px 10px', background: '#ede9fe', borderBottom: '1px solid #c4b5fd', fontSize: 11, color: '#6d28d9', flexShrink: 0, cursor: 'default' }}>
                    ⬡ {adjacencies.length} aangrenzende relatie{adjacencies.length !== 1 ? 's' : ''} gevonden
                  </div>
                </Tooltip>
              )}

              <div style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', background: '#fff', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Tooltip block text={"Detecteert automatisch welke wanden aan elkaar grenzen en maakt voor elke verbonden groep een aparte groep.\nHandig als een heel gebouw in één keer gegroepeerd moet worden."}>
                  <button onClick={autoGroup} style={btn('#6366f1')}>
                    🔗 Auto-groeperen op aangrenzendheid
                  </button>
                </Tooltip>
                <Tooltip block text={"Groepeert alle wanden automatisch per windrichting (N / O / Z / W) op basis van de richting van de muurvlakken.\nHandig om een heel gebouw in één klik per gevel in te delen."}>
                  <button onClick={autoGroupByWindrichting} style={btn('#0891b2')}>
                    🧭 Auto-groeperen per windrichting (N/O/Z/W)
                  </button>
                </Tooltip>
                {isSyntheticWall() && (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', padding: '4px 0' }} title="Maak een synthetische calc-wand (geen IFC) uit lengte × hoogte × dikte (mm). Wordt een bekleedbare één-wand-groep. Sessie-only.">
                    {[['L', 'L'], ['H', 'H'], ['dikte', 'dikte']].map(([key, lbl]) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 11, color: '#475569' }}>
                        {lbl}
                        <input type="number" min={1} step={key === 'dikte' ? 0.5 : 10} value={synWallInput[key]}
                          onChange={(e) => setSynWallInput((p) => ({ ...p, [key]: e.target.value }))}
                          style={{ width: 64, fontSize: 11, padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: 3 }} />
                      </label>
                    ))}
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>mm</span>
                    <button onClick={addSyntheticWall} style={btn('#7c3aed')}>+ Wand (L×H)</button>
                  </div>
                )}
                {isSyntheticWall() && activeSynWall && (() => {
                  const wo = activeSynWall.wallOrigin;
                  const curDikte = Math.abs((wo.thicknessEnd ?? 0) - (wo.thicknessStart ?? 0));
                  const fields = [
                    ['L', activeSynWall.length, (v) => updateSyntheticWall(activeSynWall.expressID, v, activeSynWall.height, curDikte)],
                    ['H', activeSynWall.height, (v) => updateSyntheticWall(activeSynWall.expressID, activeSynWall.length, v, curDikte)],
                    ['dikte', curDikte, (v) => updateSyntheticWall(activeSynWall.expressID, activeSynWall.length, activeSynWall.height, v)],
                  ];
                  return (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', padding: '4px 8px', background: '#faf5ff', borderBottom: '1px solid #e9d5ff' }} title="Pas de maten van de geselecteerde calc-wand aan; 3D / 2D / uittrekstaat / IFC-export volgen direct.">
                      <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>✏️ {activeSynWall.name}:</span>
                      {fields.map(([lbl, cur, apply]) => (
                        <label key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 11, color: '#475569' }}>
                          {lbl}
                          <input type="number" min={1} step={lbl === 'dikte' ? 0.5 : 10} defaultValue={cur} key={activeSynWall.expressID + lbl}
                            onChange={(e) => apply(Number(e.target.value))}
                            style={{ width: 60, fontSize: 11, padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: 3 }} />
                        </label>
                      ))}
                      <span style={{ fontSize: 10, color: '#94a3b8' }}>mm</span>
                    </div>
                  );
                })()}
                {selectionHasUngrouped && (
                  <Tooltip block text={"Maakt een nieuwe groep van de geselecteerde elementen die nog niet in een groep zitten.\nSelecteer eerst elementen in de 3D-viewer door erop te klikken."}>
                    <button onClick={createGroup} style={btn('#0ea5e9')}>
                      + Nieuwe groep van selectie ({ungroupedSelCount})
                    </button>
                  </Tooltip>
                )}
                {selectionHasUngrouped && groups.map((g) => {
                  const s = getSettings(g.id);
                  return (
                    <Tooltip key={g.id} block text={`Voegt de geselecteerde ongegroepeende elementen toe aan bestaande groep "${s.name}".`}>
                      <button onClick={() => addToGroup(g.id)}
                        style={{ ...btn(s.color), display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, border: '1px solid rgba(255,255,255,0.4)', display: 'inline-block', flexShrink: 0 }} />
                        <span>Voeg toe aan {s.name}</span>
                      </button>
                    </Tooltip>
                  );
                })}
                {selectedWallIds.size > 0 && (
                  <Tooltip block text={"Heft de selectie van alle elementen op. Geselecteerde elementen worden blauw getoond in de 3D-viewer."}>
                    <button onClick={clearSelection} style={{ ...btn('#64748b') }}>
                      ✕ Deselecteer alles ({selectedWallIds.size})
                    </button>
                  </Tooltip>
                )}
              </div>

              {groups.length > 0 && (
                <div style={{ flexShrink: 0 }}>
                  <div style={{ padding: '5px 10px', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Groepen ({groups.length})</span>
                    {groups.length > 1 && (
                      <button
                        onClick={() => {
                          const clusters = findDuplicateGroupClusters(groups, allWalls);
                          setDuplicateGroupsModal(clusters.length > 0 ? { clusters } : { clusters: [], empty: true });
                        }}
                        style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: 10, padding: 0 }}
                        title="Zoek groepen met dezelfde samenstelling en sparingen"
                      >
                        Zoek gelijke groepen
                      </button>
                    )}
                  </div>
                  {groups.map((g) => {
                    const s = getSettings(g.id);
                    const isActive = activeGroupId === g.id;
                    // Best-fit-waarschuwingen (alleen aanwezig onder ?bestFitGroups=1 voor
                    // handmatige groepen). Puur afgeleid uit de bestaande facadeData; geen
                    // badge als de array leeg/afwezig is → UI byte-identiek zonder vlag.
                    const _bestFitWarnings = allPatterns[g.id]?.facadeData?._bestFit?.warnings ?? [];
                    return (
                      <div key={g.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <div
                          onClick={() => setActiveGroupId(isActive ? null : g.id)}
                          style={{ padding: '6px 10px', cursor: 'pointer', background: isActive ? '#eff6ff' : '#fff', display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: 'inline-block', flexShrink: 0 }} />
                          <span
                            style={{ flex: 1, fontSize: 12, fontWeight: isActive ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}
                            title="Dubbelklik om naam te wijzigen"
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              const span = e.currentTarget;
                              const input = document.createElement('input');
                              input.value = s.name;
                              input.style.cssText = 'font-size:12px;font-weight:' + (isActive ? '600' : '400') + ';border:1px solid #6366f1;border-radius:3px;padding:0 3px;width:100%;outline:none;background:#fff;';
                              span.replaceWith(input);
                              input.focus();
                              input.select();
                              const commit = () => {
                                const newName = input.value.trim() || s.name;
                                updateSettings(g.id, { name: newName });
                              };
                              input.addEventListener('blur', commit);
                              input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { commit(); input.blur(); } if (ev.key === 'Escape') { input.value = s.name; input.blur(); } });
                            }}
                          >{s.name}</span>
                          {_bestFitWarnings.length > 0 && (
                            <span
                              title={_bestFitWarnings.join('\n')}
                              onClick={(e) => { e.stopPropagation(); alert('Best-fit gevelvlak — waarschuwing(en):\n\n• ' + _bestFitWarnings.join('\n\n• ')); }}
                              style={{ fontSize: 11, flexShrink: 0, cursor: 'help' }}
                              aria-label="best-fit waarschuwing"
                            >⚠️</span>
                          )}
                          <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>{g.wallIds.length} wand{g.wallIds.length !== 1 ? 'en' : ''}</span>
                          <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>{isActive ? '▲' : '▼'}</span>
                        </div>
                        {isActive && (
                          <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                            {g.wallIds.map((wid) => {
                              const w = wallMap[wid];
                              if (!w) return null;
                              const wIsSel = selectedWallIds.has(wid);
                              return (
                                <div key={wid}
                                  ref={(el) => { if (el && wIsSel) el.scrollIntoView({ block: 'nearest' }); }}
                                  style={{ padding: '4px 10px 4px 24px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap', background: wIsSel ? '#dbeafe' : 'transparent' }}>
                                  <span
                                    style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#334155', cursor: 'pointer' }}
                                    title={`Klik om de elementnaam te kopiëren (voor console-filter):\n${w.name}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const name = w.name ?? '';
                                      try { navigator.clipboard?.writeText(name); } catch {}
                                      const el = e.currentTarget; const orig = el.textContent;
                                      el.textContent = '✓ gekopieerd'; el.style.color = '#16a34a';
                                      setTimeout(() => { el.textContent = orig; el.style.color = '#334155'; }, 900);
                                    }}
                                  >{w.name}</span>
                                  <input
                                    type="number" min={1} step={10}
                                    title="Breedte overschrijven (mm) — openingen blijven op hun positie"
                                    value={w.length}
                                    onChange={(e) => setWallDimOverrides((prev) => ({ ...prev, [wid]: { ...(prev[wid] ?? {}), length: Math.max(1, Number(e.target.value)) } }))}
                                    style={{ width: 54, fontSize: 10, border: '1px solid #e2e8f0', borderRadius: 3, padding: '1px 3px', color: wallDimOverrides[wid]?.length != null ? '#6366f1' : '#94a3b8', background: wallDimOverrides[wid]?.length != null ? '#eff0fe' : '#fff', flexShrink: 0 }}
                                  />
                                  <span style={{ fontSize: 9, color: '#cbd5e1', flexShrink: 0 }}>×</span>
                                  <input
                                    type="number" min={1} step={10}
                                    title="Hoogte overschrijven (mm) — openingen blijven op hun positie"
                                    value={w.height}
                                    onChange={(e) => setWallDimOverrides((prev) => ({ ...prev, [wid]: { ...(prev[wid] ?? {}), height: Math.max(1, Number(e.target.value)) } }))}
                                    style={{ width: 54, fontSize: 10, border: '1px solid #e2e8f0', borderRadius: 3, padding: '1px 3px', color: wallDimOverrides[wid]?.height != null ? '#6366f1' : '#94a3b8', background: wallDimOverrides[wid]?.height != null ? '#eff0fe' : '#fff', flexShrink: 0 }}
                                  />
                                  {(wallDimOverrides[wid]?.length != null || wallDimOverrides[wid]?.height != null) && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setWallDimOverrides((prev) => { const n = { ...prev }; delete n[wid]; return n; }); }}
                                      style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: 10, padding: '0 1px', flexShrink: 0 }}
                                      title="Herstel originele afmetingen"
                                    >↺</button>
                                  )}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); removeFromGroup(g.id, wid); }}
                                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 11, padding: '0 2px', flexShrink: 0 }}
                                    title="Verwijder uit groep"
                                  >✕</button>
                                </div>
                              );
                            })}
                            <div style={{ padding: '5px 10px', display: 'flex', gap: 6 }}>
                              <button onClick={() => deleteGroup(g.id)} style={{ fontSize: 10, background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 3, padding: '2px 6px', cursor: 'pointer' }}>
                                Groep verwijderen
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {ungrouped.length > 0 && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '5px 10px', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Zonder groep ({ungrouped.length})</span>
                    {ungrouped.length > 0 && (
                      <Tooltip text={"Selecteert alle elementen die nog niet in een groep zitten.\nDaarna kun je er een nieuwe groep van maken."}>
                        <button onClick={selectAllUngrouped} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: 10, padding: 0 }}>
                          Selecteer alle
                        </button>
                      </Tooltip>
                    )}
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    {ungrouped.map((w) => {
                      const isSel = selectedWallIds.has(w.expressID);
                      return (
                        <div key={w.expressID} onClick={() => toggleSelect(w.expressID)}
                          style={{ padding: '5px 10px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: isSel ? '#dbeafe' : '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input type="checkbox" checked={isSel} onChange={() => toggleSelect(w.expressID)} onClick={(e) => e.stopPropagation()} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</div>
                            <div style={{ fontSize: 10, color: '#94a3b8' }}>
                              {w.length}×{w.height} mm
                              {adjWallIds.has(w.expressID) && <span style={{ color: '#8b5cf6', marginLeft: 4 }}>⬡ aangrenzend</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div style={{ flex: 1, position: 'relative', overflow: viewMode === 'uittrekstaat' ? 'auto' : 'hidden', display: 'flex', flexDirection: 'column' }}>
          {viewMode === '3d' ? (
            <>
              <Suspense fallback={<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>Laden…</div>}>
              <Viewer3D
                walls={allWalls}
                selectedWallIds={selectedWallIds}
                groups={groups}
                groupSettings={getSettings}
                groupPatterns={allPatterns}
                onSelectWall={(id) => {
                  toggleSelect(id);
                  // zit het element in een groep? klap die groep uit zodat de oplichtende rij zichtbaar is.
                  const gid = wallGroupMap[id];
                  if (gid) {
                    // STABLE_GROUP_CAMERA #3: wel uitklappen/oplichten, géén camera-sprong.
                    if (isStableGroupCamera()) skipGroupCameraFocusRef.current = true;
                    setActiveGroupId(gid);
                  }
                }}
                onSelectMultiple={(ids) => setSelectedWallIds((prev) => {
                  const next = new Set(prev);
                  for (const id of ids) next.add(id);
                  return next;
                })}
                activeGroupId={activeGroup?.id ?? null}
                hiddenGroupIds={hiddenGroupIds}
                onHiddenGroupIdsChange={setHiddenGroupIds}
                buildingEnvelopeData={buildingEnvelopeData}
                focusSuppressRef={skipGroupCameraFocusRef}
                sparingElements={isSparingElementen() ? sparingElements : []}
                kozijnen={kozijnen}
              />

              {allWalls.length === 0 && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <div style={{ textAlign: 'center', color: '#475569' }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>🏗</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>3D Viewer</div>
                    <div style={{ fontSize: 12, marginTop: 4, color: '#94a3b8' }}>Importeer een IFC-bestand om wanden te tonen</div>
                  </div>
                </div>
              )}

              {allWalls.length > 0 && (
                <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.6)', color: '#f1f5f9', fontSize: 11, padding: '4px 14px', borderRadius: 20, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                  Klik om te selecteren · Slepen = rondkijken
                </div>
              )}


              {selectedWallIds.size > 0 && (
                <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', background: '#1d4ed8', color: '#fff', fontSize: 12, padding: '5px 14px', borderRadius: 6, pointerEvents: 'none', fontWeight: 500 }}>
                  {selectedWallIds.size} element{selectedWallIds.size !== 1 ? 'en' : ''} geselecteerd
                  {ungroupedSelCount > 0 && ` · ${ungroupedSelCount} zonder groep`}
                </div>
              )}
              </Suspense>
            </>
          ) : viewMode === '2d' ? (
            <>
              {activeGroup ? (
                <>
                  <Suspense fallback={<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>Laden…</div>}>
                  <View2D
                    walls={activeGroup.wallIds.map((id) => wallMap[id]).filter(Boolean)}
                    facadeData={allPatterns[activeGroup.id]?.facadeData ?? null}
                    groupSettings={getSettings(activeGroup.id)}
                    maxHoogte={getSettings(activeGroup.id).maxHoogte}
                    startLijn={getSettings(activeGroup.id).startLijn}
                    penantFaceData={penantFaceData}
                    groupColor={getSettings(activeGroup.id).color}
                    zetwerk={getSettings(activeGroup.id).zetwerk}
                    panelen={getSettings(activeGroup.id).panelen}
                    latten={getSettings(activeGroup.id).latten}
                    layerVisibility={getSettings(activeGroup.id).layerVisibility}
                    gridLines={showGridLines ? gridLines : []}
                    showCenterLines={showCenterLines}
                    zoneSettings={getSettings(activeGroup.id).zoneSettings ?? []}
                    stripZones={getSettings(activeGroup.id).stripZones ?? []}
                    onStripZonesChange={(zones) => updateSettings(activeGroup.id, { stripZones: zones })}
                    regionBatches={(() => { const _s = getSettings(activeGroup.id); return isFeatureZones() && !hasPenants(_s) && getActiveStripZones(_s).length > 0 ? (allPatterns[activeGroup.id]?.batches ?? null) : null; })()}
                    outsideDirFlip={(() => {
                      const _rawFlip = !!getSettings(activeGroup.id).outsideDirFlip;
                      if (!isOutsideDirSync()) return _rawFlip;
                      // OUTSIDE_DIR_SYNC (gat A): spiegel 2D op de EFFECTIEVE buitenzijde die 3D/export
                      // gebruiken (resolvedOutside.outsideDir = incl. "Buitenzijde selecteren"), met de
                      // auto-detectie als ijkpunt. Flip-only (R == autoOutsideDir) → identiek aan _rawFlip;
                      // manual bereikt nu ook 2D. Geen resolvedOutside/autoOutsideDir → val terug op _rawFlip.
                      const _ro = allPatterns[activeGroup.id]?.facadeData?.refWallOrigin?.resolvedOutside;
                      const _R = _ro?.outsideDir, _A = _ro?.autoOutsideDir ?? _R;
                      if (_R == null || _A == null) return _rawFlip;
                      const _eff = _rawFlip ? -_R : _R;
                      return _eff * _A < 0;
                    })()}
                    endExtensions={getSettings(activeGroup.id).endExtensions}
                    buildingEnvelopeData={buildingEnvelopeData}
                    envelopeVisibility={groupEnvelopeVisibility[activeGroup.id] ?? null}
                    slimFortStitching={allPatterns[activeGroup.id]?.slimFortStitching ?? null}
                    wallDecomposition={allPatterns[activeGroup.id]?.wallDecomposition ?? null}
                  />
                  <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', background: 'rgba(15,23,42,0.85)', color: '#94a3b8', fontSize: 11, padding: '4px 14px', borderRadius: 20, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                    {getSettings(activeGroup.id).name} · {activeGroup.wallIds.length} wand{activeGroup.wallIds.length !== 1 ? 'en' : ''} · 2D gevelaanzicht
                  </div>
                  </Suspense>
                </>
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#1e293b', color: '#64748b', gap: 12 }}>
                  <span style={{ fontSize: 32 }}>⬛</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#94a3b8' }}>Selecteer een groep</span>
                  <span style={{ fontSize: 12 }}>Klik op een groep in de lijst links om deze in 2D te bekijken</span>
                </div>
              )}
            </>
          ) : viewMode === 'tekening' ? (
            <>
              {activeGroup ? (() => {
                const s = getSettings(activeGroup.id);
                if ((s.backingType ?? 'hout') === 'aluminium_slimfort') {
                  return (
                    <Suspense fallback={<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>Laden…</div>}>
                      <SlimFortWerktekening
                        key={activeGroup.id}
                        slimFortFaces={allPatterns[activeGroup.id]?.slimFortFaces ?? null}
                        slimFortStitching={allPatterns[activeGroup.id]?.slimFortStitching ?? null}
                        wallDecomposition={allPatterns[activeGroup.id]?.wallDecomposition ?? null}
                        groupName={s?.name ?? activeGroup.id}
                      />
                    </Suspense>
                  );
                }
                const groupWalls = activeGroup.wallIds.map((id) => wallMap[id]).filter(Boolean);
                const withOrigin = groupWalls.filter((w) => w.wallOrigin);
                const gMinH = withOrigin.length ? Math.min(...withOrigin.map((w) => w.wallOrigin.heightStart ?? 0)) : 0;
                const ctrimsW = endExtensionsToTrims(s.endExtensions);
                return (
                  <Suspense fallback={<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>Laden…</div>}>
                  <Werktekening
                    key={activeGroup.id}
                    walls={groupWalls}
                    groupSettings={s}
                    groupName={s.name}
                    zetwerk={s.zetwerk}
                    panelen={s.panelen}
                    latten={s.latten}
                    groupMinH={gMinH}
                    penantFaceData={penantFaceData}
                    zoneSettings={s.zoneSettings ?? []}
                    epcSettings={{ projectNummer: s.epcProjectNummer ?? '00000', level: s.epcLevel ?? 0 }}
                    outsideDirFlip={!!s.outsideDirFlip}
                    cornerTrimLeft={ctrimsW.trimLeft}
                    cornerTrimRight={ctrimsW.trimRight}
                    cornerExtendLeft={ctrimsW.extendLeft}
                    cornerExtendRight={ctrimsW.extendRight}
                    lattenTrimLeft={ctrimsW.lattenTrimLeft}
                    lattenTrimRight={ctrimsW.lattenTrimRight}
                    lattenExtendLeft={ctrimsW.lattenExtendLeft}
                    lattenExtendRight={ctrimsW.lattenExtendRight}
                    panelsTrimLeft={ctrimsW.panelsTrimLeft}
                    panelsTrimRight={ctrimsW.panelsTrimRight}
                    panelsExtendLeft={ctrimsW.panelsExtendLeft}
                    panelsExtendRight={ctrimsW.panelsExtendRight}
                  />
                  </Suspense>
                );
              })() : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', color: '#64748b', gap: 12 }}>
                  <span style={{ fontSize: 32 }}>📐</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#94a3b8' }}>Selecteer een groep</span>
                  <span style={{ fontSize: 12 }}>Klik op een groep in de lijst links voor de werktekening</span>
                </div>
              )}
            </>
          ) : viewMode === 'uittrekstaat' ? (
            <Suspense fallback={<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>Laden…</div>}>
            <Uittrekstaat
              groups={groups}
              walls={allWalls}
              getSettings={getSettings}
              adjacencies={adjacencies}
              cornerTrimsMap={Object.fromEntries(groups.map((g) => [g.id, endExtensionsToTrims(getSettings(g.id).endExtensions)]))}
            />
            </Suspense>
          ) : viewMode === 'wildverband_planner' ? (
            <Suspense fallback={<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>Laden…</div>}>
              <WildverbandPanelView />
            </Suspense>
          ) : viewMode === 'slimfort_tekening' ? (
            <Suspense fallback={<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>Laden…</div>}>
              {activeGroup ? (
                <SlimFortWerktekening
                  key={activeGroup.id}
                  slimFortFaces={allPatterns[activeGroup.id]?.slimFortFaces ?? null}
                  slimFortStitching={allPatterns[activeGroup.id]?.slimFortStitching ?? null}
                  wallDecomposition={allPatterns[activeGroup.id]?.wallDecomposition ?? null}
                  groupName={getSettings(activeGroup.id)?.name ?? activeGroup.id}
                />
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', color: '#64748b', gap: 12 }}>
                  <span style={{ fontSize: 32 }}>🏗️</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#94a3b8' }}>Selecteer een groep</span>
                  <span style={{ fontSize: 12 }}>Klik op een groep in de lijst links voor de SlimFort werktekening</span>
                </div>
              )}
            </Suspense>
          ) : viewMode === 'detailboek' ? (
            <Suspense fallback={<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>Laden…</div>}>
              <DetailBoek
                groups={groups}
                walls={allWalls}
                getSettings={getSettings}
                allPatterns={allPatterns}
              />
            </Suspense>
          ) : null}
        </div>

        {activeGroup && (
          <div style={{ width: rightCollapsed ? 28 : 280, background: '#fff', borderLeft: '1px solid #e2e8f0', overflowY: rightCollapsed ? 'hidden' : 'auto', flexShrink: 0, transition: 'width 0.18s ease', position: 'relative' }}>
            <button
              onClick={() => setRightCollapsed((v) => !v)}
              title={rightCollapsed ? 'Instellingen uitklappen' : 'Instellingen inklappen'}
              style={{ position: 'absolute', top: 6, left: rightCollapsed ? 4 : 6, zIndex: 10, background: '#e2e8f0', border: 'none', borderRadius: 3, width: 18, height: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#475569', padding: 0, flexShrink: 0 }}
            >
              {rightCollapsed ? '‹' : '›'}
            </button>
            {!rightCollapsed && <>
            <div style={{ padding: 12, paddingTop: 30 }}>
              <GroupConfigPanel
                groupId={activeGroup.id}
                settings={getSettings(activeGroup.id)}
                onUpdate={(patch) => updateSettings(activeGroup.id, patch)}
                onDelete={() => deleteGroup(activeGroup.id)}
                linkedCount={(() => {
                  const linkId = groupLinks[activeGroup.id];
                  if (!linkId) return 0;
                  return groups.filter((g) => groupLinks[g.id] === linkId && g.id !== activeGroup.id).length;
                })()}
                onSyncToLinked={() => syncToLinked(activeGroup.id)}
                gapCenters={(() => {
                  const walls = activeGroup.wallIds.map((id) => wallMap[id]).filter(Boolean);
                  const withOrigin = walls.filter((w) => w.wallOrigin);
                  if (!withOrigin.length) return [];
                  const groupMinX = Math.min(...withOrigin.map((w) => w.wallOrigin.lengthStart));
                  const sorted = [...withOrigin].sort((a, b) => a.wallOrigin.lengthStart - b.wallOrigin.lengthStart);
                  const centers = [];
                  for (let i = 0; i < sorted.length - 1; i++) {
                    const rightEdge = (sorted[i].wallOrigin.lengthStart - groupMinX) + sorted[i].length;
                    const leftEdge  = sorted[i + 1].wallOrigin.lengthStart - groupMinX;
                    if (leftEdge > rightEdge + 1) centers.push((rightEdge + leftEdge) / 2);
                  }
                  return centers;
                })()}
                groupWidth={(() => {
                  const walls = activeGroup.wallIds.map((id) => wallMap[id]).filter(Boolean);
                  const withOrigin = walls.filter((w) => w.wallOrigin);
                  if (!withOrigin.length) return 0;
                  const groupMinX = Math.min(...withOrigin.map((w) => w.wallOrigin.lengthStart));
                  return Math.max(...withOrigin.map((w) => (w.wallOrigin.lengthStart - groupMinX) + w.length));
                })()}
                doorBottomYs={(() => {
                  const walls = activeGroup.wallIds.map((id) => wallMap[id]).filter(Boolean);
                  const withOrigin = walls.filter((w) => w.wallOrigin);
                  if (!withOrigin.length) return [];
                  const gMinH = Math.min(...withOrigin.map((w) => w.wallOrigin.heightStart));
                  const ys = new Set();
                  for (const w of withOrigin) {
                    const offH = w.wallOrigin.heightStart - gMinH;
                    for (const op of (w.openings ?? [])) {
                      ys.add(Math.round(offH + (op.y ?? 0)));
                    }
                  }
                  return [...ys].sort((a, b) => a - b);
                })()}
                resolvedOutsideInfo={activeGroup.wallIds.map(id => wallMap[id]).find(w => w?.wallOrigin?.resolvedOutside)?.wallOrigin?.resolvedOutside ?? null}
                onManualOutsideDir={(dir) => {
                  updateSettings(activeGroup.id, { manualOutsideDir: dir });
                  if (dir === null) {
                    resolveOutsideDirections(allWalls);
                    const newSm = { ...settingsMap, [activeGroup.id]: { ...settingsMap[activeGroup.id], manualOutsideDir: null } };
                    applyManualOutsideOverrides(allWalls, groups, newSm);
                  } else {
                    const groupWallSet = new Set(activeGroup.wallIds);
                    for (const wall of allWalls) {
                      if (!groupWallSet.has(wall.expressID) || !wall.wallOrigin) continue;
                      const wo = wall.wallOrigin;
                      if (!wo.resolvedOutside) wo.resolvedOutside = {};
                      wo.resolvedOutside.outsideDir = dir;
                      wo.resolvedOutside.outsidePos = dir < 0 ? wo.thicknessStart : (wo.thicknessEnd ?? wo.thicknessStart + 200);
                      wo.resolvedOutside.source = 'manual';
                      wo.resolvedOutside.reason = 'handmatig ingesteld';
                      wo.resolvedOutside.confidence = 1.0;
                      wo.resolvedOutside.ambiguous = false;
                    }
                  }
                  setAllWalls([...allWalls]);
                }}
                cornerConfigs={cornerConfigs}
                allGroups={groups}
                getSettings={getSettings}
                adjacentGroupIds={detectCornerAdjacentGroups(activeGroup.id, groups, wallMap)}
                adjacentHints={(() => {
                  const adjIds = detectCornerAdjacentGroups(activeGroup.id, groups, wallMap);
                  if (!adjIds) return [];
                  return [...adjIds].map((adjId) => {
                    const adjGroup = groups.find((g) => g.id === adjId);
                    if (!adjGroup) return null;
                    const adjS = getSettings(adjId);
                    const adjWalls = adjGroup.wallIds.map((id) => wallMap[id]).filter((w) => w && w.wallOrigin);
                    const wallThickness = adjWalls.length
                      ? Math.round(Math.max(...adjWalls.map((w) => Math.abs((w.wallOrigin.thicknessEnd ?? (w.wallOrigin.thicknessStart + (w.thickness ?? 0))) - w.wallOrigin.thicknessStart))))
                      : null;
                    const artId = (adjS.lattenArtikelen ?? [])[0] ?? null;
                    const art = artId ? BATTEN_CATALOG.find((a) => a.id === artId) : null;
                    const lattenDikte = adjS.latten?.enabled !== false ? (art ? art.dikteMM : (adjS.latten?.dikte ?? 28)) : 0;
                    const paneelDikte = adjS.panelen?.enabled !== false ? (adjS.panelen?.dikte ?? 8) : 0;
                    const stripDikte = adjS.brickDepth ?? 20;
                    const pakketDikte = lattenDikte + paneelDikte + stripDikte;
                    return { groupId: adjId, name: adjS.name ?? adjId, wallThickness, lattenDikte, paneelDikte, stripDikte, pakketDikte };
                  }).filter(Boolean);
                })()}
                onAddCorner={(otherGroupId) => {
                  const key = cornerConfigKey(activeGroup.id, otherGroupId);
                  setCornerConfigs((prev) => ({ ...prev, [key]: { type: 'stomp', mainGroupId: activeGroup.id, secondaryGroupId: otherGroupId } }));
                }}
                onUpdateCorner={(cornerId, patch) => {
                  setCornerConfigs((prev) => ({ ...prev, [cornerId]: { ...prev[cornerId], ...patch } }));
                }}
                onRemoveCorner={(cornerId) => {
                  setCornerConfigs((prev) => { const next = { ...prev }; delete next[cornerId]; return next; });
                }}
                wallMap={wallMap}
                onUpdateGroupSettings={(targetId, patch) => updateSettings(targetId, patch)}
              />
            </div>
            {viewMode === '2d' && (() => {
              const s = getSettings(activeGroup.id);
              const walls = activeGroup.wallIds.map((id) => wallMap[id]).filter(Boolean);
              const logic = getGroupPatternLogic(walls, s.material ?? DEFAULT_MATERIAL, s.verband ?? DEFAULT_VERBAND);
              return (
                <div style={{ borderTop: '2px solid #e2e8f0', padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', marginBottom: 8, letterSpacing: 0.3, textTransform: 'uppercase' }}>
                    Patroonlogica
                  </div>
                  {logic.map(({ label, value }) => (
                    <div key={label} style={{ marginBottom: 5 }}>
                      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
                      <div style={{ fontSize: 11, color: '#334155', wordBreak: 'break-word' }}>{value}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
            </>}
          </div>
        )}
      </div>

      {flagsOpen && (
        <div onClick={() => setFlagsOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '50px 20px', overflowY: 'auto' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, width: 470, maxWidth: '92vw', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #334155' }}>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>⚙ Optionele functies (vlaggen)</span>
              <button onClick={() => setFlagsOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: '6px 14px', maxHeight: '60vh', overflowY: 'auto' }}>
              {['Functies', 'Geavanceerd'].map((grp) => {
                const items = FLAG_REGISTRY.filter((f) => ((grp === 'Geavanceerd') === !!f.advanced));
                if (!items.length) return null;
                return (
                  <div key={grp} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, margin: '8px 0 2px', borderBottom: '1px solid #1e293b', paddingBottom: 3 }}>{grp}</div>
                    {items.map((f) => (
                      <label key={f.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 0', cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!flagState[f.key]} style={{ marginTop: 2 }}
                          onChange={(e) => { const v = e.target.checked; setStoredFlag(f.key, v); setFlagState((s) => ({ ...s, [f.key]: v })); setFlagsDirty(true); }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, color: '#e2e8f0' }}>
                            {f.label}
                            {f.reimport && <span style={{ marginLeft: 6, fontSize: 9, color: '#fbbf24', border: '1px solid #b45309', borderRadius: 3, padding: '0 4px' }}>her-import</span>}
                            {f.advanced && <span style={{ marginLeft: 6, fontSize: 9, color: '#f87171', border: '1px solid #b91c1c', borderRadius: 3, padding: '0 4px' }}>experimenteel</span>}
                          </div>
                          {f.note && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{f.note}</div>}
                        </div>
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderTop: '1px solid #334155' }}>
              <button onClick={() => { window.location.href = window.location.pathname; }}
                style={{ background: flagsDirty ? '#16a34a' : '#334155', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                Toepassen (herladen)
              </button>
              <span style={{ fontSize: 10, color: '#94a3b8' }}>
                {flagsDirty ? 'Herladen om door te voeren.' : 'Vink aan/uit, klik Toepassen.'} Vlaggen met “her-import” vragen daarna opnieuw importeren.
              </span>
            </div>
          </div>
        </div>
      )}

      {showHandleiding && (
        <div onClick={() => setShowHandleiding(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9998, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 8, width: '100%', maxWidth: 860, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#0f766e', borderRadius: '8px 8px 0 0' }}>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>📖 Handleiding — IFC Brickslip Planner</span>
              <button onClick={() => setShowHandleiding(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 'calc(100vh - 160px)' }}>
              <SimpleMarkdown text={handleidingMd} />
            </div>
          </div>
        </div>
      )}

      {showRulesModal && (
        <div onClick={() => setShowRulesModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 8, width: '100%', maxWidth: 820, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#1e293b', borderRadius: '8px 8px 0 0' }}>
              <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 15 }}>📋 Logica-regels &amp; Wijzigingen — <span style={{ color: '#94a3b8', fontWeight: 400 }}>v{APP_VERSION}</span></span>
              <button onClick={() => setShowRulesModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
              {[['regels', '📋 Logica-regels'], ['changelog', '🕒 Wijzigingen']].map(([id, label]) => (
                <button key={id} onClick={() => setRulesTab(id)} style={{ padding: '8px 18px', fontSize: 12, fontWeight: rulesTab === id ? 700 : 400, color: rulesTab === id ? '#1e293b' : '#64748b', background: rulesTab === id ? '#fff' : 'transparent', border: 'none', borderBottom: rulesTab === id ? '2px solid #3b82f6' : '2px solid transparent', cursor: 'pointer' }}>{label}</button>
              ))}
            </div>
            <div style={{ padding: '0 20px 20px', overflowY: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
            {rulesTab === 'changelog' && (
              <div>
                {CHANGELOG.map((entry) => (
                  <div key={entry.version} style={{ marginTop: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, borderBottom: '2px solid #3b82f6', paddingBottom: 4, marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#1e40af' }}>v{entry.version}</span>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{entry.date}</span>
                    </div>
                    <ul style={{ margin: '4px 0 0 0', padding: '0 0 0 18px' }}>
                      {entry.changes.map((c, i) => (
                        <li key={i} style={{ fontSize: 12, color: '#334155', padding: '3px 0', lineHeight: 1.5 }}>{c}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {rulesTab === 'regels' && <div>
              {[
                {
                  title: '🧱 Steenstrippen — Vlakke Gevel', color: '#a64033', rows: [
                    ['Sparing (polygon/bbox)', 'Strips worden exact geclipped door de opening — geen strips in ramen/deuren'],
                    ['Penant zij-strip', 'Strips lopen door tot pX + brickDepth achter de buitenrand van de zij-strip → inkijk-preventie'],
                    ['Penant binnenruimte', 'Strips volledig verwijderd tussen pX + brickD en pX + breedte − brickD'],
                    ['Max hoogte', 'Geen strips boven de ingestelde max hoogte'],
                    ['Min hoogte', 'Geen strips onder de ingestelde min hoogte'],
                    ['Zones', 'Per zone eigen kleur / verband / materiaal — begrensd door penant-posities'],
                  ]
                },
                {
                  title: '🧱 Steenstrippen — Penant Voorzijde', color: '#7c3aed', rows: [
                    ['Breedte', 'Penant-breedte − 2 × brickDepth (zij-strips gaan eraf)'],
                    ['Hoogte', 'Begrensd door max hoogte van de groep'],
                    ['Verband', 'Gecentreerd / symmetrisch t.o.v. het penant'],
                    ['Kleur', 'Zelfde als het paneelkleur van de vlakke gevel'],
                  ]
                },
                {
                  title: '🧱 Steenstrippen — Penant Zijkanten', color: '#0369a1', rows: [
                    ['Diepte', 'Penant-diepte − 6mm (6mm voeg aan voorzijde)'],
                    ['Clip aan einde', 'Laatste max(stootvoeg, paneel-dikte) mm wordt verwijderd voor hoek/paneel aansluiting'],
                    ['Kleur', 'Zelfde als de vlakke gevel strips'],
                    ['Positie', 'Rechter zijkant is gespiegeld t.o.v. links'],
                  ]
                },
                {
                  title: '🪵 Horizontale Latten', color: '#92400e', rows: [
                    ['Breedte', 'Lopen over de volledige groepsbreedte (hoek tot hoek)'],
                    ['Max interval', 'Maximale tussenafstand 400mm (configureerbaar via artikel)'],
                    ['Sparingen', 'Worden geclipped bij ramen/deuren — niet doorlopen door opening'],
                    ['Penant', '⚠ Worden NIET geclipped bij penant — lopen er doorheen. Reden: verticale latten worden hierop gemonteerd'],
                    ['Max hoogte', 'Geen latten boven max hoogte'],
                  ]
                },
                {
                  title: '🪵 Verticale Latten', color: '#78350f', rows: [
                    ['Positie diepte', 'Staan op de buitenkant (voorzijde) van de horizontale latten'],
                    ['Penant', 'Worden NIET geplaatst in de zone pX → pX + breedte van een penant'],
                    ['Sparingen', 'Geen verticale latten in sparingen'],
                    ['Max hoogte', 'Geen verticale latten boven max hoogte'],
                  ]
                },
                {
                  title: '🟦 Panelen — Plaatsingsregels', color: '#1d4ed8', rows: [
                    ['Sparingen', 'Worden geclipped door polygon of bounding box van opening'],
                    ['Penant', 'Volledig uitgesloten van de zone pX → pX + breedte'],
                    ['Boven penant', 'Van penant-hoogte tot max hoogte ook geen panelen/strips in penant-breedte'],
                    ['Max hoogte', 'Panelen worden geclipped tot max hoogte'],
                    ['Gewicht', 'Paneel wordt kleiner als het ingestelde max gewicht (kg) wordt overschreden'],
                  ]
                },
                {
                  title: '🟦 Panelen — Optimalisatielogica', color: '#1e40af', rows: [
                    ['Doel', 'Optimale paneelindeling per zone op basis van productie-efficiëntie, gewicht en zaagverlies'],
                    ['Harde grens breedte', 'Paneel ≤ ingestelde max breedte basisplaat (bijv. 3005mm)'],
                    ['Harde grens hoogte', 'Paneel ≤ ingestelde max hoogte basisplaat (bijv. 1200mm)'],
                    ['Harde grens gewicht', 'Effectieve hoogte = min(maxH, maxKg / (paneel kg/m² + steen kg/m²) × 1m / breedte) — Arbo: max tilgewicht 2 personen'],
                    ['Prioriteit 1 — min. panelen', 'Zo min mogelijk panelen per zone (score × 1.000.000) — minste montagetijd'],
                    ['Prioriteit 2 — ~1 m² per paneel', 'Gemiddelde paneeloppervlakte zo dicht mogelijk bij 1.000.000 mm² (score / 1000) — optimale fabricagecapaciteit'],
                    ['Prioriteit 3 — min. zaagverlies', 'Per paneel: bereken hoeveel stuks uit 1 basisplaat passen → restmateriaal / stuks = zaagverlies per paneel (score × 10.000)'],
                    ['Prioriteit 4 — min. unieke maten', 'Zo weinig mogelijk verschillende maten (score × 100) — minder instellingen per zaagsnede'],
                    ['Doelmaat breedte', '5 strekken + 4 stootvoegen = 5×steenL + 4×stoot (bijv. 5×210 + 4×10 = 1090mm)'],
                    ['Doelmaat hoogte', '14 lagen + 13 lintvoegen = 14×steenH + 13×lint (bijv. 14×50 + 13×12 = 856mm)'],
                    ['Oriëntatie', 'Beide orientaties (liggend / staand) worden berekend — laagste score wint'],
                    ['Voeglijnen', 'Breekpunten liggen altijd op steen- of voeggrens — nooit dwars door een strip'],
                  ]
                },
                {
                  title: '📐 Penant — Geometrie', color: '#065f46', rows: [
                    ['Voeg voor', '6mm voeg tussen voorzijde penant en vlakke gevel'],
                    ['Gap zij', '10mm ruimte tussen vlakke gevel structuur en zij-paneel/latten van penant'],
                    ['X-positie', 'Ondersteunt rekenkundige expressies, bijv. 3500 − 200'],
                    ['Hoogte', 'Automatisch begrensd door max hoogte van de groep'],
                    ['Strips vlakke gevel', 'Eindigen op pX + brickD (achter buitenrand zij-strip = inkijk-preventie)'],
                    ['Horizontale latten', 'Lopen door het penant heen (niet geclipped)'],
                    ['Verticale latten', 'Worden NIET geplaatst in de penant-zone'],
                  ]
                },
                {
                  title: '🗂 Zones', color: '#4338ca', rows: [
                    ['Numering', 'Zone 1 = linkerhoek → penant 1. Zone 2 = na penant 1 → penant 2. etc.'],
                    ['Aantal', 'Altijd = aantal penanten + 1'],
                    ['Grenzen', 'Zone-grenzen worden altijd bepaald door penant-posities — overlappen nooit'],
                    ['Per zone', 'Eigen kleur, verband, materiaal en max hoogte mogelijk'],
                    ['Kopiëren', 'Zone-instellingen kopieerbaar naar andere zones binnen dezelfde groep'],
                  ]
                },
              ].map(({ title, color, rows }) => (
                <div key={title} style={{ marginTop: 18 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color, borderBottom: `2px solid ${color}`, paddingBottom: 4, marginBottom: 8 }}>{title}</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <tbody>
                      {rows.map(([rule, desc]) => (
                        <tr key={rule} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '5px 8px', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap', width: '35%', verticalAlign: 'top' }}>{rule}</td>
                          <td style={{ padding: '5px 8px', color: '#475569', verticalAlign: 'top' }}>{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              <div style={{ marginTop: 20, padding: '12px 14px', background: '#fef3c7', borderRadius: 6, fontSize: 11, color: '#92400e', borderLeft: '4px solid #f59e0b' }}>
                <strong>Prioriteitsvolgorde bij conflicten:</strong> Max hoogte → Penant-zone → Sparing → Inkijk-preventie (brickDepth overlap)
              </div>
            </div>}
            </div>
          </div>
        </div>
      )}

      {showValidationModal && (
        <div onClick={() => { if (!validationRunning) setShowValidationModal(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 8, width: '100%', maxWidth: 860, display: 'flex', flexDirection: 'column', maxHeight: '85vh', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ background: '#1d4ed8', color: '#fff', padding: '12px 18px', borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>🔍 Geometrie Validatie — IFC Wand Classificatiecheck</span>
              {!validationRunning && <button onClick={() => setShowValidationModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 13 }}>✕</button>}
            </div>

            {validationRunning && (
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
                <div style={{ fontSize: 12, color: '#334155', marginBottom: 6 }}>
                  Analyse bezig… {validationProgress.total > 0 ? `${validationProgress.current} / ${validationProgress.total} elementen` : ''}
                </div>
                {validationProgress.total > 0 && (
                  <div style={{ background: '#e2e8f0', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.round(100 * validationProgress.current / validationProgress.total)}%`, height: '100%', background: '#3b82f6', transition: 'width 0.1s' }} />
                  </div>
                )}
                {validationLogs.slice(-3).map((l, i) => (
                  <div key={i} style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>{l}</div>
                ))}
              </div>
            )}

            {!validationRunning && validationReport !== null && (
              <div style={{ padding: '10px 18px', borderBottom: '1px solid #e2e8f0', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                {validationReport.length === 0 ? (
                  <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>✓ Geen misclassificaties gevonden — alle wanden hebben een rechthoekig verticaal profiel.</span>
                ) : (
                  <>
                    <span style={{ fontSize: 12, color: '#b45309', fontWeight: 600 }}>⚠ {validationReport.length} mogelijke misclassificatie{validationReport.length !== 1 ? 's' : ''} gevonden</span>
                    <span style={{ fontSize: 11, color: '#64748b', flex: 1 }}>Controleer en pas de IFC-classificatie indien nodig aan.</span>
                    <button onClick={exportValidationReport} style={{ fontSize: 11, background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, padding: '4px 12px', cursor: 'pointer' }}>⬇ CSV exporteren</button>
                  </>
                )}
              </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', padding: validationReport?.length ? 0 : '18px' }}>
              {validationReport?.length > 0 && validationReport.map((item, idx) => {
                const issueColor = item.suggestedClass === 'IfcRoof' ? '#7c3aed'
                  : item.suggestedClass === 'IfcSlab' ? '#0369a1'
                  : '#b45309';
                return (
                  <div key={item.expressID} style={{ borderBottom: '1px solid #f1f5f9', padding: '10px 18px', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#1e293b' }}>{item.name}</span>
                          <span style={{ fontSize: 9, background: '#dbeafe', color: '#1d4ed8', padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>{item.ifcClass}</span>
                          <span style={{ fontSize: 9, color: '#64748b' }}>#{item.expressID}</span>
                          <span style={{ fontSize: 9, color: '#64748b' }}>L={item.length} × H={item.height} × D={item.thickness} mm</span>
                        </div>
                        {item.issues.map((iss, ii) => (
                          <div key={ii} style={{ fontSize: 11, color: '#92400e', background: '#fef3c7', borderRadius: 3, padding: '2px 8px', marginBottom: 3, display: 'inline-block', marginRight: 6 }}>
                            ⚠ {iss}
                          </div>
                        ))}
                        {item.suggestedClass && (
                          <div style={{ marginTop: 4, fontSize: 11, color: issueColor }}>
                            → Aanbeveling: herclassificeer naar <strong>{item.suggestedClass}</strong>
                          </div>
                        )}
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748b', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={item.overrideInclude}
                          onChange={() => setValidationReport(prev => prev.map((r, i) => i === idx ? { ...r, overrideInclude: !r.overrideInclude } : r))} />
                        Negeer / accepteer
                      </label>
                    </div>
                  </div>
                );
              })}
              {!validationRunning && !validationReport?.length && validationLogs.length > 0 && (
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {validationLogs.map((l, i) => <div key={i}>{l}</div>)}
                </div>
              )}
            </div>

            {!validationRunning && (
              <div style={{ padding: '10px 18px', borderTop: '1px solid #e2e8f0', flexShrink: 0, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => setShowValidationModal(false)} style={{ fontSize: 12, background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, padding: '6px 16px', cursor: 'pointer' }}>Sluiten</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
