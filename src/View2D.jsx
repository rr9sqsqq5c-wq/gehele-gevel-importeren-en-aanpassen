import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { buildFullGroupFacadePattern, getOpeningPoly, facadeNeedsMirror } from './lib/pattern.js';
import { buildFacadeZones, panelizeZone, generateBattenPositions, computeEffectiveBasePanel, buildWildverbandPanelGrid, computeHorizontalLatten, extendPanelsAtEnds, extendLattenAtEnds, cutVentHolesFromPanels, attachHolesToPanels, buildFacadeLatten, buildZoneBackingPanels, clipLattenToZones, mergeStackedColumns, buildGroupPanels, detectKoppelstrippen } from './lib/panelization.js';
import { clipRowsAroundRects } from './lib/sparingElements.js';
import { brickColor, isTooSmall, polyXRangesAtY } from './lib/geometry.js';
import { hasPenants, snapZoneRectToBond } from './lib/zoneRegions.js';
import { isFeatureZones, isZoneVoegSnap } from './lib/featureFlags.js';
import { STEENSTRIP_CATALOG } from './lib/battens.js';
import { isWildverbandKoppelstrip, isGroothuisWildverband, isGroothuisWildverband2, isKeepEndExtension, isShowKozijnen, isUnifiedLatten, isUnifiedPanels, isGevelHandedness, isBlankBaseVerband } from './lib/featureFlags.js';
import { generateSlimFortGrid, generateSlimFortFaces, SLIMFORT_DEFAULTS, CONCRETE_FACE_CLADDING_DEFAULTS, computeFaceLongRanges } from './lib/slimfort.js';

function hexToRgba(hex, alpha = 1) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function pickGridStep(scale) {
  const pixelsPerMm = scale * 0.001;
  if (pixelsPerMm < 0.005) return 0;
  const targets = [10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10];
  for (const s of targets) {
    if (s * pixelsPerMm >= 40) return s;
  }
  return 0;
}

export function View2D({ walls, facadeData = null, groupSettings, maxHoogte, startLijn, penantFaceData, groupColor, panelen, latten, layerVisibility, gridLines = [], showCenterLines = false, zoneSettings = [], stripZones = [], onStripZonesChange, regionBatches = null, outsideDirFlip = false, endExtensions, buildingEnvelopeData = null, envelopeVisibility = null, slimFortStitching = null, wallDecomposition = null }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [redrawTick, setRedrawTick] = useState(0);

  const transform = useRef({ scale: 1, tx: 0, ty: 0 });
  const fitScaleRef = useRef(1);   // fit-to-view schaal (basis voor de zoom-ratio bij annotatie-grootte)
  const dragStart = useRef(null);
  const [drawMode, setDrawMode] = useState(false);
  const drawModeRef = useRef(false);
  const drawStartRef = useRef(null);
  const didZoomOutRef = useRef(false);   // ZONE_VOEG_SNAP: één keer per teken-actie uitzoomen bij de eerste beweging
  const [drawingRect, setDrawingRect] = useState(null);
  const drawingRectRef = useRef(null);
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  // FASE 3 — eigenschappen-vooraf voor een nieuw te tekenen zone (verband + anker).
  const [pendingVerband, setPendingVerband] = useState('staand_tegelverband');
  const [pendingAnchor, setPendingAnchor] = useState('zoneBottomLeft');
  const pendingRef = useRef({ verband: 'staand_tegelverband', anchor: 'zoneBottomLeft' });
  pendingRef.current = { verband: pendingVerband, anchor: pendingAnchor };
  const stripZonesRef = useRef([]);
  const onStripZonesChangeRef = useRef(null);

  drawModeRef.current = drawMode;
  stripZonesRef.current = stripZones;
  onStripZonesChangeRef.current = onStripZonesChange;

  // FASE 2c — penant-vlak: strip-zones zijn wederzijds uitsluitend met penanten.
  // Tekenen blokkeren; getekende zones blijven inert (penanten winnen) + waarschuwing.
  // BUGFIX (TDZ): penantFace MOET vóór de useEffect staan die 'm in body én deps-array
  // leest — de deps-array `[penantFace]` wordt synchroon tijdens render geëvalueerd, dus
  // een declaratie eronder gaf "Cannot access 'penantFace' before initialization"
  // (View2D.jsx:61) zodra View2D met een groep rendert. Pure reorder, gedrag identiek.
  const penantFace = hasPenants(groupSettings);

  // FASE 2c — op een penant-vlak kan niet getekend worden: forceer tekenmodus uit
  // (dekt het wisselen naar een penant-groep terwijl drawMode nog aan stond).
  useEffect(() => {
    if (penantFace && drawModeRef.current) {
      drawModeRef.current = false; setDrawMode(false);
      drawStartRef.current = null; drawingRectRef.current = null; setDrawingRect(null);
    }
  }, [penantFace]);

  const mat = groupSettings?.material ?? { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
  const verband = groupSettings?.verband ?? 'halfsteens';
  const activeZoneCount = (stripZones ?? []).filter((z) => z?.enabled === true).length;
  // FASE B — de hele stripZone-UI (teken-knop + zonelijst + anker-UI) staat achter de vlag.
  // Vlag UIT → geen toolbar; View2D exact terug naar de pre-feature staat.
  const zonesEnabled = isFeatureZones();
  const color = groupSettings?.color ?? '#a64033';
  const _stripArtId = (groupSettings?.steenstripsArtikelen ?? [])[0];
  const _stripArt = _stripArtId ? STEENSTRIP_CATALOG.find((a) => a.id === _stripArtId) : null;
  const effectiveMat = _stripArt ? { ...mat, steenL: _stripArt.steenL, steenH: _stripArt.steenH } : mat;

  // SINGLE SOURCE OF TRUTH: de strip-bekleding komt uit de gedeelde facadeData die ook
  // de 3D-render gebruikt (App.jsx allPatterns → buildBestFitFacadePattern of het oude
  // buildFullGroupFacadePattern). View2D leidt de strippen NIET meer zelf af, zodat 2D
  // en 3D nooit divergeren (incl. best-fit-dakranden, horizontaal verband, voegen).

  const PENANT_PANEL_INSET = 20;

  const allPanels = useMemo(() => {
    if (!facadeData) return [];
    // GEEN_VERBAND: draagpanelen volgen de getekende tekenzones (elk vak z'n eigen achterconstructie).
    if (isBlankBaseVerband(verband)) {
      return buildZoneBackingPanels({ facadeData, activeZones: (stripZones ?? []).filter((z) => z?.enabled === true), panelen, latten, mat: effectiveMat, verband, startLijn, sparingRects: facadeData.sparingRects });
    }
    const { rows, groupWidth, groupHeight, groupOpenings } = facadeData;
    // GROOTHUIS WILDVERBAND: komt uit facadeData.rows (generatief, panelen vol met 2500 + rest)
    // → geen panel-grid; de rows-tak rendert het.
    if (verband === 'groothuis_wildverband' && isGroothuisWildverband()) return [];
    if (verband === 'groothuis_wildverband_2' && isGroothuisWildverband2()) return [];
    if (verband === 'wildverband') {
      // FASE 2: met de vlag aan komt het wildverband uit facadeData.rows (gedeelde bron,
      // koppelstrip-tegelverband) → geen aparte panel-grid; de rows-tak hieronder rendert het.
      if (isWildverbandKoppelstrip()) return [];
      const wRes = buildWildverbandPanelGrid(groupWidth, groupHeight, groupOpenings, effectiveMat, panelen ?? {});
      return wRes.panels;
    }
    if (!panelen?.enabled) return [];
    // UNIFIED_PANELS (vlag, default AAN): één gedeelde motor → congruent met 3D/werktekening/meetstaat/export.
    if (isUnifiedPanels()) {
      return buildGroupPanels({ groupWidth, groupHeight, groupOpenings, rows, penanten: groupSettings?.penanten, baseMat: mat, stripArt: _stripArt, panelen, latten, verband, sparingRects: facadeData.sparingRects, startLijn, endExtensions, activeZones: stripZones ?? [] }).panels;
    }
    const basePanel = computeEffectiveBasePanel(panelen, effectiveMat.brickWeightM2 ?? 40, effectiveMat);
    const maxInterval = Math.max(50, latten?.maxInterval ?? 400);
    const lintHalf = (effectiveMat.lint ?? 12) / 2;
    const clampToGroup = (y) => Math.min(groupHeight, Math.max(0, y));
    const allRowYsSorted = (rows ?? []).map((r) => r.y).sort((a, b) => a - b);
    const snapToRowY = (y) => {
      if (!allRowYsSorted.length) return y;
      const target = y + lintHalf;
      return allRowYsSorted.reduce((best, ry) => Math.abs(ry - target) < Math.abs(best - target) ? ry : best);
    };
    const baseBattenYs = generateBattenPositions(groupHeight, effectiveMat, maxInterval, { minHOH: latten?.minHOH, maxHOH: latten?.maxHOH, targetPanelH: panelen?.hoogte, minPanelH: 800 });
    const battenYs = baseBattenYs.map(snapToRowY);
    const openingsForZones = groupOpenings.filter((op) => op.type !== 'ventilatie').map((op) => ({ id: `op_${op.x}_${op.y}`, x: op.x, y: op.y, width: op.width, height: op.height, polyPts: op.polyPts ?? null }));
    const penantOpenings = (groupSettings?.penanten ?? []).map((p, i) => {
      const px = (p.x ?? 0) + PENANT_PANEL_INSET;
      const pw = Math.max(1, p.breedte ?? 400) - 2 * PENANT_PANEL_INSET;
      if (pw <= 0) return null;
      return { id: `pen_${i}`, x: px, y: 0, width: pw, height: groupHeight, polyPts: null };
    }).filter(Boolean);
    let panels = [];
    const zones = buildFacadeZones(groupWidth, groupHeight, [...openingsForZones, ...penantOpenings]);
    for (const zone of zones) {
      const result = panelizeZone(zone, battenYs, basePanel, allRowYsSorted.length ? snapToRowY : null, effectiveMat, verband);
      if (result.ok) panels.push(...result.panels);
    }
    // PANEEL_OPTIMALISATIE: gestapelde panelen in één kolom samenvoegen (P6+P7); vlag uit → no-op.
    panels = mergeStackedColumns(panels, [...openingsForZones, ...penantOpenings], basePanel);
    panels = panels.filter((panel) => panel.height >= 200 && panel.width >= 10);
    const rowH = verband === 'staand_tegelverband' ? effectiveMat.steenL : effectiveMat.steenH;
    panels = panels.filter((panel) => {
      for (const row of (rows ?? [])) {
        if (!row?.pieces?.length) continue;
        if (row.y + rowH <= panel.y || row.y >= panel.y + panel.height) continue;
        for (const piece of row.pieces) {
          const s = Math.max(piece.start, panel.x);
          const e = Math.min(piece.start + piece.length, panel.x + panel.width);
          if (e - s > 1) return true;
        }
      }
      return false;
    });
    // VENTILATIE + SPARING: gat uit ÉÉN plaat (paneel blijft HEEL, gat gemarkeerd), niet opknippen (klantregel).
    panels = attachHolesToPanels(panels, [...groupOpenings.filter((op) => op.type === 'ventilatie'), ...(facadeData.sparingRects ?? [])]);
    // Handmatige einduiteinde-extensie: buitenste paneel loopt door voorbij de gevelrand (hoek-aansluiting).
    if (isKeepEndExtension()) {
      const _eeP = endExtensions ?? {};
      panels = extendPanelsAtEnds(panels, groupWidth, Math.max(0, _eeP.left?.panels ?? 0), Math.max(0, _eeP.right?.panels ?? 0));
    }
    if (startLijn != null && startLijn < 0 && panels.length > 0) {
      const minY = Math.min(...panels.map((p) => p.y));
      return panels.map((p) => p.y <= minY + 0.5 ? { ...p, y: startLijn, height: p.height + p.y - startLijn } : p);
    }
    return panels;
  }, [facadeData, panelen, latten, effectiveMat, groupSettings, startLijn, verband, endExtensions, stripZones]);

  const allLatten = useMemo(() => {
    const _bt = groupSettings?.backingType ?? 'hout';
    if (!facadeData || !latten?.enabled || _bt === 'aluminium' || _bt === 'aluminium_slimfort') return [];
    // GEEN_VERBAND: latten volgen de zone-panelen en worden op de zone-rechthoeken geklipt.
    if (isBlankBaseVerband(verband)) {
      const az = (stripZones ?? []).filter((z) => z?.enabled === true);
      if (!az.length) return [];
      const base = buildFacadeLatten({ facadeData, latten, mat: effectiveMat, panelen, panels: allPanels, penanten: [], startLijn, verband, backingType: _bt, sparingRects: facadeData.sparingRects });
      return clipLattenToZones(base, az);
    }
    const { groupWidth, groupHeight } = facadeData;
    const richting = latten.richting ?? 'horizontaal';
    const latBreedte = Math.max(5, latten.breedte ?? 50);

    // FASE 1 — één gedeelde latten-berekening (vlag). Post-processing (endExtensions) blijft view-eigen.
    if (isUnifiedLatten()) {
      // hoek-extensie (endExtensions) zit nu ÍN buildFacadeLatten → identiek in alle views.
      return buildFacadeLatten({ facadeData, latten, mat: effectiveMat, panelen, panels: allPanels, penanten: groupSettings?.penanten ?? [], startLijn, verband, backingType: _bt, sparingRects: facadeData.sparingRects, endExtensions });
    }

    let out;
    if (richting === 'horizontaal') {
      const _hl = computeHorizontalLatten({ facadeData, latten, mat: effectiveMat, panelen, startLijn, backingType: _bt, verband });
      // Handmatige einduiteinde-extensie: buitenste horizontale latte loopt door voorbij de gevelrand.
      if (isKeepEndExtension()) {
        const _eeL = endExtensions ?? {};
        out = extendLattenAtEnds(_hl, groupWidth, Math.max(0, _eeL.left?.battens ?? 0), Math.max(0, _eeL.right?.battens ?? 0));
      } else {
        out = _hl;
      }
    } else {
      const xPositions = new Set();
      xPositions.add(0);
      xPositions.add(groupWidth);
      for (const panel of allPanels) {
        xPositions.add(Math.round(panel.x));
        xPositions.add(Math.round(panel.x + panel.width / 2));
        xPositions.add(Math.round(panel.x + panel.width));
      }
      out = [...xPositions]
        .sort((a, b) => a - b)
        .map((x, idx) => ({
          id: `lat-v-${idx}`,
          richting: 'verticaal',
          x: x - latBreedte / 2,
          y: 0,
          width: latBreedte,
          height: groupHeight,
          forced: false,
        }));
    }
    // SPARING-ELEMENTEN: de onderdelen ook uit de latten knippen (contour-volgend, dezelfde rects als de strips).
    return cutVentHolesFromPanels(out, facadeData.sparingRects);
  }, [facadeData, latten, allPanels, effectiveMat, startLijn, panelen, groupSettings, endExtensions, verband, stripZones]);

  const allUProfiles = useMemo(() => {
    if ((groupSettings?.backingType ?? 'hout') !== 'aluminium') return [];
    if (!facadeData) return [];
    const ccs = groupSettings?.concreteCladdingSettings ?? {};
    const spacing = Math.max(100, ccs.uProfileSpacing ?? 600);
    const profW = Math.max(10, ccs.uProfileWidth ?? 60);
    const { groupWidth, groupHeight } = facadeData;
    const maxH = (groupSettings?.maxHoogte != null && groupSettings.maxHoogte > 0) ? Math.min(groupHeight, groupSettings.maxHoogte) : groupHeight;
    const result = [];
    let idx = 0;
    for (let x = 0; x <= groupWidth + spacing / 2; x += spacing) {
      const cx = Math.round(Math.min(x, groupWidth));
      result.push({ id: `uprof-${idx++}`, x: Math.round(cx - profW / 2), y: 0, width: profW, height: maxH });
    }
    return result;
  }, [facadeData, groupSettings]);

  const allSlimFortData = useMemo(() => {
    if ((groupSettings?.backingType ?? 'hout') !== 'aluminium_slimfort') return null;
    if (!facadeData) return null;
    const { groupWidth, groupHeight, groupOpenings } = facadeData;
    const sfSettings = { ...SLIMFORT_DEFAULTS, ...(groupSettings?.slimFortSettings ?? {}) };
    return generateSlimFortGrid(groupWidth, groupHeight, groupOpenings ?? [], sfSettings, groupSettings?.maxHoogte);
  }, [facadeData, groupSettings]);

  const allSlimFortFaces = useMemo(() => {
    if ((groupSettings?.backingType ?? 'hout') !== 'aluminium_slimfort') return null;
    if (!facadeData) return null;
    const sfSettings = { ...SLIMFORT_DEFAULTS, ...(groupSettings?.slimFortSettings ?? {}) };
    const withOrigin = (walls ?? []).filter((w) => w.wallOrigin);
    const rwo = withOrigin.length ? withOrigin[0].wallOrigin : null;
    const wallThickness = rwo
      ? Math.abs((rwo.thicknessEnd ?? rwo.thicknessStart + 200) - rwo.thicknessStart)
      : 250;
    return generateSlimFortFaces({
      groupWidth: facadeData.groupWidth,
      groupHeight: facadeData.groupHeight,
      wallThickness,
      openings: facadeData.groupOpenings ?? [],
      settings: sfSettings,
      maxH: groupSettings?.maxHoogte,
    });
  }, [facadeData, groupSettings, walls]);

  const sfFaceLayout = useMemo(() => {
    if (!allSlimFortFaces) return null;
    const nonFront = allSlimFortFaces.filter((f) => f.faceType !== 'front');
    if (!nonFront.length) return null;
    const gW = facadeData?.groupWidth ?? 0;
    const spacing = 300;
    let curX = gW + spacing;
    const panels = [];
    for (const face of nonFront) {
      panels.push({ face, offsetX: curX });
      curX += face.width + spacing;
    }
    return { panels, totalWidth: curX - spacing };
  }, [allSlimFortFaces, facadeData]);

  const zonePatterns = useMemo(() => {
    if (!walls?.length || !facadeData) return [];
    const sortedPenants = [...(groupSettings?.penanten ?? [])].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
    if (sortedPenants.length < 1) return [];
    const numZones = sortedPenants.length + 1;
    const facadeWidth = facadeData.groupWidth ?? 0;
    const result = [];
    for (let zi = 0; zi < numZones; zi++) {
      const zs = zoneSettings[zi];
      if (!zs?.enabled) { result.push(null); continue; }
      const brickD2d = groupSettings?.brickDepth ?? 20;
      const zX1Raw = zi === 0 ? 0 : (sortedPenants[zi - 1].x ?? 0) + Math.max(1, sortedPenants[zi - 1].breedte ?? 400);
      const zX2Raw = zi === numZones - 1 ? facadeWidth : (sortedPenants[zi].x ?? 0);
      const zoneX1 = zi === 0 ? zX1Raw : zX1Raw - brickD2d;
      const zoneX2 = zi === numZones - 1 ? zX2Raw : zX2Raw + brickD2d;
      if (zoneX2 <= zoneX1) { result.push(null); continue; }
      const zoneMat = { ...effectiveMat, ...(zs.material ?? {}) };
      const zoneVerband = zs.verband ?? verband;
      const zoneMaxHoogte = zs.maxHoogte ?? maxHoogte;
      let patternData = buildFullGroupFacadePattern(walls, zoneMat, zoneVerband, zoneMaxHoogte, null, startLijn);
      // SPARING-ELEMENTEN: ook de penant-zone-strips rond de onderdelen knippen (2D == 3D == export).
      if (patternData && facadeData.sparingRects?.length) {
        const zRowH = zoneVerband === 'staand_tegelverband' ? (zoneMat.steenL ?? zoneMat.steenH ?? 50) : (zoneMat.steenH ?? 50);
        patternData = { ...patternData, rows: clipRowsAroundRects(patternData.rows, facadeData.sparingRects, zRowH) };
      }
      result.push(patternData ? { patternData, zoneX1, zoneX2, color: zs.color ?? groupColor, zoneMat, zoneVerband } : null);
    }
    return result;
  }, [walls, facadeData, groupSettings, zoneSettings, effectiveMat, verband, maxHoogte, startLijn, groupColor]);

  const bounds = useMemo(() => {
    if (!facadeData) return { minX: 0, maxX: 1000, minY: 0, maxY: 1000 };
    const maxX = sfFaceLayout ? sfFaceLayout.totalWidth : facadeData.groupWidth;
    // Verlengde bekleding (endExtensions) valt buiten [0, groupWidth]; verbreed de viewBox zodat
    // strips/latten/panelen die voorbij de rand doorlopen ook in beeld komen.
    const _ee = endExtensions ?? {};
    const _ex = isKeepEndExtension();
    const exL = _ex ? Math.max(0, _ee.left?.strips ?? 0, _ee.left?.battens ?? 0, _ee.left?.panels ?? 0) : 0;
    const exR = _ex ? Math.max(0, _ee.right?.strips ?? 0, _ee.right?.battens ?? 0, _ee.right?.panels ?? 0) : 0;
    return { minX: -exL, maxX: maxX + exR, minY: Math.min(0, startLijn ?? 0), maxY: facadeData.groupHeight };
  }, [facadeData, startLijn, sfFaceLayout, endExtensions]);

  const fitToView = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.width || !canvas.height) return;
    const W = size.w;
    const H = size.h;
    const PAD = 32;
    const bw = bounds.maxX - bounds.minX || 1;
    const bh = bounds.maxY - bounds.minY || 1;
    const scale = Math.min((W - PAD * 2) / bw, (H - PAD * 2) / bh) * 1000;
    fitScaleRef.current = scale;   // onthoud de fit-schaal → zoom-ratio voor annotatie-grootte
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    transform.current = {
      scale,
      tx: W / 2 - cx * scale * 0.001,
      ty: H / 2 + cy * scale * 0.001,
    };
    setRedrawTick((n) => n + 1);
  }, [bounds, size]);

  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: Math.floor(width) || 800, h: Math.floor(height) || 600 });
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => { fitToView(); }, [fitToView, size]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d');
    const W = size.w;
    const H = size.h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { scale, tx, ty } = transform.current;

    const toScreen = (vX, vY) => [
      vX * scale * 0.001 + tx,
      ty - vY * scale * 0.001,
    ];
    // Bij inzoomen groeit de annotatie mee voor leesbaarheid: de max-cap schaalt met de zoom-ratio
    // (scale t.o.v. de fit-schaal), gedempt tot 2,5×. Op fit-niveau (ratio 1) is dit ongewijzigd.
    const _annotZoomK = Math.min(2.5, Math.max(1, scale / (fitScaleRef.current || scale)));
    const annotSz = (physMM, min = 7, max = 28) => Math.max(min, Math.min(max * _annotZoomK, physMM * scale * 0.001));

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 0.5;
    const gridStepMm = pickGridStep(scale);
    if (gridStepMm > 0) {
      const startX = Math.floor(bounds.minX / gridStepMm) * gridStepMm;
      const startY = Math.floor(bounds.minY / gridStepMm) * gridStepMm;
      for (let x = startX; x <= bounds.maxX + gridStepMm; x += gridStepMm) {
        const [sx] = toScreen(x, 0);
        if (sx < 0 || sx > W) continue;
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
      }
      for (let y = startY; y <= bounds.maxY + gridStepMm; y += gridStepMm) {
        const [, sy] = toScreen(0, y);
        if (sy < 0 || sy > H) continue;
        ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
      }
    }

    if (!facadeData) {
      ctx.fillStyle = '#64748b';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Geen groep geselecteerd', W / 2, H / 2);
      return;
    }

    const { rows, groupWidth, groupHeight, groupOpenings, patternStartH = 0 } = facadeData;
    const mx = outsideDirFlip ? (x, w = 0) => groupWidth - x - w : (x) => x;
    const steenH = effectiveMat.steenH;
    const kopMM = Math.round((effectiveMat.steenL - effectiveMat.stoot) / 2);

    const [faceSx, faceSy] = toScreen(0, groupHeight);
    const faceW = groupWidth * scale * 0.001;
    const faceH = groupHeight * scale * 0.001;
    // Clip-extent voor strips/latten/panelen volgt de (verbrede) bounds, zodat handmatig verlengde
    // bekleding voorbij de gevelrand niet wordt weggeknipt. Zonder extensie == faceSx/faceW.
    const [clipSx] = toScreen(bounds.minX, 0);
    const clipW = (bounds.maxX - bounds.minX) * scale * 0.001;

    // Compute wall polygon shapes in group-local coords (group origin = bottom-left of bounding box)
    const groupMinL = walls?.length ? Math.min(...walls.map(w => w.wallOrigin?.lengthStart ?? 0)) : 0;
    const groupMinH = walls?.length ? Math.min(...walls.map(w => w.wallOrigin?.heightStart ?? 0)) : 0;
    const rawWallPolys = (walls ?? []).map(w => {
      if (!w.facadePoly || w.facadePoly.length < 3) return null;
      const offL = (w.wallOrigin?.lengthStart ?? 0) - groupMinL;
      const offH = (w.wallOrigin?.heightStart ?? 0) - groupMinH;
      return w.facadePoly.map(pt => ({ l: pt.l + offL, h: pt.h + offH }));
    }).filter(Boolean);
    const wallGroupPolys = rawWallPolys.length
      ? [[ { l: bounds.minX, h: 0 }, { l: bounds.maxX, h: 0 }, { l: bounds.maxX, h: groupHeight }, { l: bounds.minX, h: groupHeight } ]]
      : [];
    const hasWallPolys = wallGroupPolys.length > 0;

    // Helper: trace facade outline path (union of wall polygons, or full rect as fallback)
    const traceFacadePath = () => {
      if (hasWallPolys) {
        for (const poly of wallGroupPolys) {
          const pts = poly.map(pt => toScreen(pt.l, pt.h));
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
          ctx.closePath();
        }
      } else {
        ctx.rect(clipSx - 1, faceSy - 1, clipW + 2, faceH + 2);
      }
    };

    // Draw facade background using actual wall shapes
    ctx.fillStyle = hexToRgba(color, 0.15);
    ctx.fillRect(faceSx, faceSy, faceW, faceH);
    if (hasWallPolys) {
      ctx.beginPath();
      traceFacadePath();
      ctx.fill();
    }

    // End-extension aanwezig? (zelfde bron als de bounds-verbreding, regel ~309-310)
    const _eeClip = endExtensions ?? {};
    const _hasEndExt = isKeepEndExtension() && (
      Math.max(0, _eeClip.left?.strips ?? 0, _eeClip.left?.battens ?? 0, _eeClip.left?.panels ?? 0) > 0 ||
      Math.max(0, _eeClip.right?.strips ?? 0, _eeClip.right?.battens ?? 0, _eeClip.right?.panels ?? 0) > 0
    );
    const applyOpeningExclusionClip = () => {
      ctx.beginPath();
      // Met end-extension (handmatig): de verbrede rand als clip nemen (net als de strips, ~regel 1296),
      // anders knipt de wand-vorm de verlengde panelen/latten juist weg. Zonder extensie ongewijzigd (wand-vorm).
      if (_hasEndExt) ctx.rect(clipSx - 1, faceSy - 1, clipW + 2, faceH + 2);
      else traceFacadePath();
      if (startLijn != null && startLijn < 0) {
        const [, byPeil] = toScreen(0, 0);
        const [, byStart] = toScreen(0, startLijn);
        ctx.rect(clipSx - 1, byPeil, clipW + 2, byStart - byPeil + 1);
      }
      for (const op of groupOpenings) {
        const poly = getOpeningPoly(op);
        const pts = poly.map((p) => toScreen(mx(p.l), p.h));
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
        ctx.closePath();
      }
      ctx.clip('evenodd');
    };

    const vis = layerVisibility ?? {};

    if (allLatten.length && vis.latten !== false) {
      ctx.save();
      applyOpeningExclusionClip();
      for (const lat of allLatten) {
        const [lSx, lSy] = toScreen(mx(lat.x, lat.width), lat.y + lat.height);
        const lSw = lat.width * scale * 0.001;
        const lSh = lat.height * scale * 0.001;
        ctx.fillStyle = lat.forced ? 'rgba(180,120,50,0.55)' : 'rgba(180,120,50,0.35)';
        ctx.fillRect(lSx, lSy, lSw, Math.max(lSh, 1));
        ctx.strokeStyle = lat.forced ? '#92400e' : '#b45309';
        ctx.lineWidth = lat.forced ? 1 : 0.5;
        ctx.strokeRect(lSx, lSy, lSw, Math.max(lSh, 1));
      }
      ctx.restore();
    }

    if (allUProfiles.length && vis.latten !== false) {
      ctx.save();
      applyOpeningExclusionClip();
      for (const prof of allUProfiles) {
        const [pSx, pSy] = toScreen(mx(prof.x, prof.width), prof.y + prof.height);
        const pSw = prof.width * scale * 0.001;
        const pSh = prof.height * scale * 0.001;
        ctx.fillStyle = 'rgba(148,163,184,0.55)';
        ctx.fillRect(pSx, pSy, pSw, Math.max(pSh, 1));
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1;
        ctx.strokeRect(pSx, pSy, pSw, Math.max(pSh, 1));
      }
      ctx.restore();
    }

    const sfDebug = allSlimFortData?.settings?.debugSlimFort ?? false;
    const _sfDbgSs = { ...SLIMFORT_DEFAULTS, ...(groupSettings?.slimFortSettings ?? {}) };
    const _sfDbgCfcs = _sfDbgSs.concreteFaceCladdingSettings?.enabled !== false && _sfDbgSs.concreteFaceCladdingSettings != null
      ? { ...CONCRETE_FACE_CLADDING_DEFAULTS, ..._sfDbgSs.concreteFaceCladdingSettings }
      : null;
    const _sfDbgRanges = _sfDbgCfcs && facadeData ? computeFaceLongRanges(_sfDbgCfcs, facadeData.groupWidth) : null;

    if (allSlimFortData && vis.latten !== false) {
      const { epsElements, brackets, profiles, debug, settings: sfS } = allSlimFortData;

      ctx.save();

      for (const eps of epsElements) {
        const [eSx, eSy] = toScreen(mx(eps.x, eps.width), eps.y + eps.height);
        const eSw = eps.width * scale * 0.001;
        const eSh = eps.height * scale * 0.001;
        ctx.fillStyle = eps.clipped ? 'rgba(199,210,254,0.45)' : 'rgba(226,232,240,0.35)';
        ctx.fillRect(eSx, eSy, eSw, eSh);
        ctx.strokeStyle = eps.clipped ? '#818cf8' : '#94a3b8';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(eSx, eSy, eSw, eSh);
        ctx.setLineDash([]);
        if (eSw > 30 && eSh > 12) {
          const labelSz = annotSz(60, 6, 11);
          ctx.font = `${labelSz}px system-ui, sans-serif`;
          ctx.fillStyle = 'rgba(100,116,139,0.8)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${Math.round(eps.width)}×${Math.round(eps.height)}`, eSx + eSw / 2, eSy + eSh / 2);
        }
      }

      for (const prof of profiles) {
        const [rSx, rSy] = toScreen(mx(prof.x, prof.width), prof.y + prof.height);
        const rSw = prof.width * scale * 0.001;
        const rSh = prof.height * scale * 0.001;
        ctx.fillStyle = prof.split ? 'rgba(129,140,248,0.75)' : 'rgba(148,163,184,0.7)';
        ctx.fillRect(rSx, rSy, Math.max(rSw, 1), Math.max(rSh, 1));
        ctx.strokeStyle = prof.split ? '#4f46e5' : '#475569';
        ctx.lineWidth = 1;
        ctx.strokeRect(rSx, rSy, Math.max(rSw, 1), Math.max(rSh, 1));
      }

      for (const br of brackets) {
        const [bSx, bSy] = toScreen(mx(br.x, br.width), br.y + br.height);
        const bSw = br.width * scale * 0.001;
        const bSh = br.height * scale * 0.001;
        ctx.fillStyle = 'rgba(71,85,105,0.8)';
        ctx.fillRect(bSx, bSy, Math.max(bSw, 2), Math.max(bSh, 2));
      }

      if (sfDebug && debug) {
        const dbgLabelSz = annotSz(50, 5, 9);

        for (const op of (debug.openings ?? [])) {
          const [opSx, opSy] = toScreen(mx(op.x, op.width), op.y + op.height);
          const opSw = op.width * scale * 0.001;
          const opSh = op.height * scale * 0.001;
          ctx.strokeStyle = '#22c55e';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 3]);
          ctx.strokeRect(opSx, opSy, opSw, opSh);
          ctx.setLineDash([]);
          if (opSw > 20 && opSh > 10) {
            ctx.font = `bold ${dbgLabelSz}px system-ui, sans-serif`;
            ctx.fillStyle = '#16a34a';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${Math.round(op.width)}×${Math.round(op.height)}`, opSx + opSw / 2, opSy + opSh / 2);
          }
        }

        for (const br of (brackets ?? [])) {
          const [bSx, bSy] = toScreen(mx(br.cx, 0), br.cy);
          const sz = Math.max(2, 3 * scale * 0.001);
          ctx.fillStyle = 'rgba(30,64,175,0.7)';
          ctx.beginPath();
          ctx.arc(bSx, bSy, sz, 0, Math.PI * 2);
          ctx.fill();
        }

        for (const eps of (epsElements ?? [])) {
          if (!eps.clipped) continue;
          const [eSx, eSy] = toScreen(mx(eps.x, eps.width), eps.y + eps.height);
          const eSw = eps.width * scale * 0.001;
          const eSh = eps.height * scale * 0.001;
          if (eSw > 15 && eSh > 8) {
            ctx.font = `${dbgLabelSz}px system-ui, sans-serif`;
            ctx.fillStyle = '#4338ca';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(eps.id, eSx + 2, eSy + 2);
          }
        }

        for (let pi = 0; pi < profiles.length; pi++) {
          const p = profiles[pi];
          const [pSx, pSy] = toScreen(mx(p.x, p.width), p.y + p.height);
          const pSw = p.width * scale * 0.001;
          const pSh = p.height * scale * 0.001;
          const pCx = pSx + Math.max(pSw, 1) / 2;
          const pCy = pSy + Math.max(pSh, 1) / 2;
          ctx.font = `${dbgLabelSz}px system-ui, sans-serif`;
          ctx.fillStyle = p.split ? '#3730a3' : '#334155';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`P${pi}`, pCx, pCy);
        }

        for (const eps of (debug.removedEps ?? [])) {
          const [eSx, eSy] = toScreen(mx(eps.x, eps.width), eps.y + eps.height);
          const eSw = eps.width * scale * 0.001;
          const eSh = eps.height * scale * 0.001;
          ctx.fillStyle = eps.partial ? 'rgba(252,165,165,0.2)' : 'rgba(239,68,68,0.2)';
          ctx.fillRect(eSx, eSy, eSw, eSh);
          ctx.strokeStyle = eps.partial ? '#f87171' : '#dc2626';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(eSx, eSy, eSw, eSh);
          ctx.setLineDash([]);
        }

        for (const br of (debug.removedBrackets ?? [])) {
          const [bSx, bSy] = toScreen(mx(br.cx, 0), br.cy);
          const sz = Math.max(4, 6 * scale * 0.001);
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(bSx - sz, bSy - sz);
          ctx.lineTo(bSx + sz, bSy + sz);
          ctx.moveTo(bSx + sz, bSy - sz);
          ctx.lineTo(bSx - sz, bSy + sz);
          ctx.stroke();
        }

        const cb = debug.clippingBoundary;
        if (cb && cb.width < (facadeData?.groupWidth ?? cb.width)) {
          const [cbSx, cbSy] = toScreen(mx(cb.x, cb.width), cb.y + cb.height);
          const cbSw = cb.width * scale * 0.001;
          const cbSh = cb.height * scale * 0.001;
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 4]);
          ctx.strokeRect(cbSx, cbSy, cbSw, cbSh);
          ctx.setLineDash([]);
        }
      }

      ctx.restore();

      if (sfFaceLayout && vis.latten !== false) {
        const faceColors = { 'side-left': '#8b5cf6', 'side-right': '#ec4899', 'portal-left': '#f97316', 'portal-right': '#14b8a6' };
        const faceLabels = { 'side-left': 'ZIJKANT L', 'side-right': 'ZIJKANT R', 'portal-left': 'PORTAAL L', 'portal-right': 'PORTAAL R' };

        for (const { face, offsetX } of sfFaceLayout.panels) {
          const { grid, width, height, faceType } = face;
          if (!grid) continue;
          const { epsElements, brackets, profiles } = grid;
          const fCol = faceColors[faceType] ?? '#64748b';
          const fLabel = faceLabels[faceType] ?? faceType;

          const [fSx, fSy] = toScreen(offsetX, height);
          const fSw = width * scale * 0.001;
          const fSh = height * scale * 0.001;

          ctx.save();
          ctx.fillStyle = 'rgba(15,23,42,0.6)';
          ctx.fillRect(fSx, fSy, fSw, fSh);

          for (const eps of epsElements) {
            const [eSx, eSy] = toScreen(offsetX + eps.x, eps.y + eps.height);
            const eSw = eps.width * scale * 0.001;
            const eSh = eps.height * scale * 0.001;
            ctx.fillStyle = eps.clipped ? 'rgba(199,210,254,0.45)' : 'rgba(226,232,240,0.35)';
            ctx.fillRect(eSx, eSy, eSw, eSh);
            ctx.strokeStyle = eps.clipped ? '#818cf8' : '#94a3b8';
            ctx.lineWidth = 0.5;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(eSx, eSy, eSw, eSh);
            ctx.setLineDash([]);
            if (eSw > 30 && eSh > 12) {
              const lSz = annotSz(60, 6, 11);
              ctx.font = `${lSz}px system-ui, sans-serif`;
              ctx.fillStyle = 'rgba(100,116,139,0.8)';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(`${Math.round(eps.width)}×${Math.round(eps.height)}`, eSx + eSw / 2, eSy + eSh / 2);
            }
          }

          for (const prof of profiles) {
            const [rSx, rSy] = toScreen(offsetX + prof.x, prof.y + prof.height);
            const rSw = prof.width * scale * 0.001;
            const rSh = prof.height * scale * 0.001;
            ctx.fillStyle = prof.split ? 'rgba(129,140,248,0.75)' : 'rgba(148,163,184,0.7)';
            ctx.fillRect(rSx, rSy, Math.max(rSw, 1), Math.max(rSh, 1));
            ctx.strokeStyle = prof.split ? '#4f46e5' : '#475569';
            ctx.lineWidth = 1;
            ctx.strokeRect(rSx, rSy, Math.max(rSw, 1), Math.max(rSh, 1));
          }

          for (const br of brackets) {
            const [bSx, bSy] = toScreen(offsetX + br.x, br.y + br.height);
            const bSw = br.width * scale * 0.001;
            const bSh = br.height * scale * 0.001;
            ctx.fillStyle = 'rgba(71,85,105,0.8)';
            ctx.fillRect(bSx, bSy, Math.max(bSw, 2), Math.max(bSh, 2));
          }

          ctx.strokeStyle = fCol;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 3]);
          ctx.strokeRect(fSx, fSy, fSw, fSh);
          ctx.setLineDash([]);

          const labelSzF = annotSz(60, 7, 13);
          ctx.font = `bold ${labelSzF}px system-ui, sans-serif`;
          ctx.fillStyle = fCol;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(fLabel, fSx + 4, fSy + 4);
          if (sfDebug) {
            const _pDbgMapped = faceType === 'side-left' ? 'leftEndFace' : faceType === 'side-right' ? 'rightEndFace' : faceType;
            const _pDbgSz = annotSz(50, 5, 9);
            ctx.font = `${_pDbgSz}px system-ui, sans-serif`;
            ctx.fillStyle = '#e879f9';
            ctx.fillText(`mapped: ${_sfDbgCfcs ? _pDbgMapped : '(no cfcs)'}`, fSx + 4, fSy + 4 + labelSzF * 1.4);
            ctx.fillText(`localW: ${Math.round(width)}mm`, fSx + 4, fSy + 4 + labelSzF * 1.4 + _pDbgSz * 1.4);
          }

          const dimLabelSz = annotSz(50, 6, 11);
          ctx.font = `${dimLabelSz}px system-ui, sans-serif`;
          ctx.fillStyle = '#94a3b8';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(`${Math.round(width)}×${Math.round(height)}mm`, fSx + fSw / 2, fSy + fSh + 4);

          ctx.restore();
        }
      }

      if (sfDebug && allSlimFortFaces) {
        ctx.save();
        const faceColors = { 'front': '#3b82f6', 'side-left': '#8b5cf6', 'side-right': '#ec4899', 'portal-left': '#f97316', 'portal-right': '#14b8a6' };
        const faceLabelSz = annotSz(50, 5, 9);
        const gW = facadeData?.groupWidth ?? 0;
        const gH = facadeData?.groupHeight ?? 0;
        for (const face of allSlimFortFaces) {
          const col = faceColors[face.faceType] ?? '#64748b';
          if (face.faceType === 'front') {
            const [fSx, fSy] = toScreen(mx(0, gW), gH);
            const fSw = gW * scale * 0.001;
            const fSh = gH * scale * 0.001;
            ctx.strokeStyle = col;
            ctx.lineWidth = 2;
            ctx.setLineDash([10, 5]);
            ctx.strokeRect(fSx, fSy, fSw, fSh);
            ctx.setLineDash([]);
            ctx.font = `bold ${faceLabelSz}px system-ui, sans-serif`;
            ctx.fillStyle = col;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText('FRONT', fSx + 3, fSy + 3);
            if (_sfDbgCfcs) {
              const _fMapped = _sfDbgCfcs.cladLeftLongFace && _sfDbgCfcs.cladRightLongFace
                ? 'leftLong+rightLong' : _sfDbgCfcs.cladLeftLongFace ? 'leftLongFace' : _sfDbgCfcs.cladRightLongFace ? 'rightLongFace' : '?';
              const _fLineH = faceLabelSz * 1.4;
              ctx.font = `${faceLabelSz * 0.85}px system-ui, sans-serif`;
              ctx.fillStyle = '#e879f9';
              ctx.fillText(`mapped: ${_fMapped}`, fSx + 3, fSy + 3 + _fLineH);
              ctx.fillText(`localW: ${Math.round(gW)}mm`, fSx + 3, fSy + 3 + _fLineH * 2);
              if (_sfDbgRanges?.length) {
                const _rStr = _sfDbgRanges.map(([r1, r2]) => `${Math.round(r1)}-${Math.round(r2)}`).join(', ');
                ctx.fillText(`ranges: [${_rStr}]`, fSx + 3, fSy + 3 + _fLineH * 3);
              }
            }
          } else if (face.faceType === 'side-left') {
            const [lSx, lSy] = toScreen(mx(0, 0), gH);
            const lSh = gH * scale * 0.001;
            ctx.strokeStyle = col;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(lSx, lSy);
            ctx.lineTo(lSx, lSy + lSh);
            ctx.stroke();
            ctx.font = `bold ${faceLabelSz}px system-ui, sans-serif`;
            ctx.fillStyle = col;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.save();
            ctx.translate(lSx - 2, lSy + lSh / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(`L-ZIJDE ${Math.round(face.width)}mm`, 0, 0);
            ctx.restore();
            if (_sfDbgCfcs) {
              ctx.save();
              ctx.font = `${faceLabelSz * 0.85}px system-ui, sans-serif`;
              ctx.fillStyle = '#e879f9';
              ctx.textAlign = 'left';
              ctx.textBaseline = 'top';
              ctx.fillText('map: leftEndFace', lSx + 4, lSy + 4);
              ctx.fillText(`localW: ${Math.round(face.width)}mm`, lSx + 4, lSy + 4 + faceLabelSz * 1.3);
              ctx.restore();
            }
          } else if (face.faceType === 'side-right') {
            const [rSx, rSy] = toScreen(mx(gW, 0), gH);
            const rSh = gH * scale * 0.001;
            ctx.strokeStyle = col;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(rSx, rSy);
            ctx.lineTo(rSx, rSy + rSh);
            ctx.stroke();
            ctx.font = `bold ${faceLabelSz}px system-ui, sans-serif`;
            ctx.fillStyle = col;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.save();
            ctx.translate(rSx + 2, rSy + rSh / 2);
            ctx.rotate(Math.PI / 2);
            ctx.fillText(`R-ZIJDE ${Math.round(face.width)}mm`, 0, 0);
            ctx.restore();
            if (_sfDbgCfcs) {
              ctx.save();
              ctx.font = `${faceLabelSz * 0.85}px system-ui, sans-serif`;
              ctx.fillStyle = '#e879f9';
              ctx.textAlign = 'right';
              ctx.textBaseline = 'top';
              ctx.fillText('map: rightEndFace', rSx - 4, rSy + 4);
              ctx.fillText(`localW: ${Math.round(face.width)}mm`, rSx - 4, rSy + 4 + faceLabelSz * 1.3);
              ctx.restore();
            }
          } else if (face.faceType === 'portal-left' || face.faceType === 'portal-right') {
            const opX = face.openingX ?? 0;
            const opY = face.openingY ?? 0;
            const opW = face.openingWidth ?? 0;
            const opH = face.openingHeight ?? 0;
            const edgeX = face.faceType === 'portal-left' ? opX : opX + opW;
            const [pLx, pLy] = toScreen(mx(edgeX, 0), opY + opH);
            const pLh = opH * scale * 0.001;
            ctx.strokeStyle = col;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 3]);
            ctx.beginPath();
            ctx.moveTo(pLx, pLy);
            ctx.lineTo(pLx, pLy + pLh);
            ctx.stroke();
            ctx.setLineDash([]);
            const tag = face.faceType === 'portal-left' ? 'PL' : 'PR';
            ctx.font = `${faceLabelSz}px system-ui, sans-serif`;
            ctx.fillStyle = col;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(`${tag}${face.openingIndex}`, pLx, pLy + 2);
          }
        }
        ctx.restore();
      }
    }

    if (sfDebug && _sfDbgCfcs && _sfDbgRanges?.length > 0 && facadeData) {
      ctx.save();
      const _dbgGH = facadeData.groupHeight;
      const _dbgLabelSz = annotSz(50, 6, 10);
      for (const [r1, r2] of _sfDbgRanges) {
        const [rSx, rSy] = toScreen(mx(r1, r2 - r1), _dbgGH);
        const rSw = (r2 - r1) * scale * 0.001;
        const rSh = _dbgGH * scale * 0.001;
        ctx.fillStyle = 'rgba(59,130,246,0.18)';
        ctx.fillRect(rSx, rSy, rSw, rSh);
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.strokeRect(rSx, rSy, rSw, rSh);
        ctx.setLineDash([]);
        ctx.fillStyle = '#1d4ed8';
        ctx.font = `bold ${_dbgLabelSz}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`${Math.round(r1)}–${Math.round(r2)} mm`, rSx + rSw / 2, rSy + 4);
      }
      ctx.restore();
    }

    if (sfDebug && envelopeVisibility && envelopeVisibility.length > 0) {
      ctx.save();
      const visColors = { OUTSIDE: '#22c55e', HIDDEN: '#ef4444', RETURN_FACE: '#f59e0b', INSIDE: '#94a3b8' };
      const labelSz = annotSz(50, 5, 9);
      const gW = facadeData?.groupWidth ?? 0;
      const gH = facadeData?.groupHeight ?? 0;
      const wallsWithOrigin = (walls ?? []).filter((w) => w.wallOrigin);

      for (const vf of envelopeVisibility) {
        const col = visColors[vf.visibility] ?? '#64748b';
        const wall = wallsWithOrigin.find((w) => w.expressID === vf.wallId);
        if (!wall) continue;
        const wo = wall.wallOrigin;
        const lMin = Math.min(...wallsWithOrigin.map((w) => w.wallOrigin.lengthStart));
        const hMin = Math.min(...wallsWithOrigin.map((w) => w.wallOrigin.heightStart));
        const wallLocalX = wo.lengthStart - lMin;
        const wallLocalY = wo.heightStart - hMin;
        const wallW = wall.length ?? gW;
        const wallH = wall.height ?? gH;

        if (vf.faceType === 'front') {
          const [sx, sy] = toScreen(mx(wallLocalX, wallW), wallLocalY + wallH);
          const sw = wallW * scale * 0.001;
          const sh = wallH * scale * 0.001;
          ctx.strokeStyle = col;
          ctx.lineWidth = 2.5;
          ctx.setLineDash([8, 4]);
          ctx.strokeRect(sx + 2, sy + 2, sw - 4, sh - 4);
          ctx.setLineDash([]);
          ctx.font = `bold ${labelSz}px system-ui, sans-serif`;
          ctx.fillStyle = col;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(`F:${vf.visibility}`, sx + 4, sy + 4);
        } else if (vf.faceType === 'side-left') {
          const [sx, sy] = toScreen(mx(wallLocalX, 0), wallLocalY + wallH);
          const sh = wallH * scale * 0.001;
          ctx.strokeStyle = col;
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 3]);
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy + sh); ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = `${labelSz}px system-ui, sans-serif`;
          ctx.fillStyle = col;
          ctx.save(); ctx.translate(sx - 2, sy + sh / 2); ctx.rotate(-Math.PI / 2);
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText(`L:${vf.visibility}`, 0, 0);
          ctx.restore();
        } else if (vf.faceType === 'side-right') {
          const [sx, sy] = toScreen(mx(wallLocalX + wallW, 0), wallLocalY + wallH);
          const sh = wallH * scale * 0.001;
          ctx.strokeStyle = col;
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 3]);
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy + sh); ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = `${labelSz}px system-ui, sans-serif`;
          ctx.fillStyle = col;
          ctx.save(); ctx.translate(sx + 2, sy + sh / 2); ctx.rotate(Math.PI / 2);
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText(`R:${vf.visibility}`, 0, 0);
          ctx.restore();
        } else if (vf.faceType === 'portal-left' || vf.faceType === 'portal-right') {
          const opX = (vf.openingX ?? 0) + wallLocalX;
          const opY = vf.openingY ?? 0;
          const opW = vf.openingWidth ?? 0;
          const opH = vf.openingHeight ?? 0;
          const edgeX = vf.faceType === 'portal-left' ? opX : opX + opW;
          const [px, py] = toScreen(mx(edgeX, 0), opY + opH);
          const ph = opH * scale * 0.001;
          ctx.strokeStyle = col;
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 2]);
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + ph); ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = `${labelSz}px system-ui, sans-serif`;
          ctx.fillStyle = col;
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.fillText(vf.faceType === 'portal-left' ? 'PL' : 'PR', px, py + 2);
        }
      }

      if (buildingEnvelopeData) {
        const refWall = wallsWithOrigin[0];
        if (refWall) {
          const lMin2 = Math.min(...wallsWithOrigin.map((w) => w.wallOrigin.lengthStart));
          const hMin2 = Math.min(...wallsWithOrigin.map((w) => w.wallOrigin.heightStart));
          const lMax2 = Math.max(...wallsWithOrigin.map((w) => w.wallOrigin.lengthStart + (w.length ?? 0)));
          const hMax2 = Math.max(...wallsWithOrigin.map((w) => w.wallOrigin.heightStart + (w.height ?? 0)));
          const envW = lMax2 - lMin2;
          const envH = hMax2 - hMin2;
          const [eSx, eSy] = toScreen(mx(0, envW), envH);
          const eSw = envW * scale * 0.001;
          const eSh = envH * scale * 0.001;
          ctx.strokeStyle = '#8b5cf6';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([12, 6]);
          ctx.strokeRect(eSx - 6, eSy - 6, eSw + 12, eSh + 12);
          ctx.setLineDash([]);
          ctx.font = `bold ${labelSz}px system-ui, sans-serif`;
          ctx.fillStyle = '#8b5cf6';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'top';
          ctx.fillText('ENVELOPE', eSx + eSw - 2, eSy + 2);
        }
      }

      ctx.restore();
    }

    if (sfDebug && slimFortStitching) {
      ctx.save();
      const lSz = annotSz(40, 4, 8);
      const wallsWithOrigin2 = (walls ?? []).filter((w) => w.wallOrigin);
      const lMin3 = wallsWithOrigin2.length ? Math.min(...wallsWithOrigin2.map((w) => w.wallOrigin.lengthStart)) : 0;
      const hMin3 = wallsWithOrigin2.length ? Math.min(...wallsWithOrigin2.map((w) => w.wallOrigin.heightStart)) : 0;

      const { faces: stitchedFaces = [], stitchTransforms = [], profileRoutes = [], portalGroups: pgGroups = [], shells = [] } = slimFortStitching;

      const facadeGroupWidth = facadeData?.groupWidth ?? 0;

      function faceLocalCenter(face) {
        const lc = (face.lengthStart - lMin3) + (face.width ?? 0) / 2;
        const hc = (face.heightStart - hMin3) + (face.height ?? 0) / 2;
        return toScreen(mx(lc, 0), hc);
      }

      for (const face of stitchedFaces) {
        if (!face.neighbors || face.neighbors.length === 0) continue;
        const [cxA, cyA] = faceLocalCenter(face);

        for (const nb of face.neighbors) {
          if (nb.faceId < face.faceId) continue;
          const nbFace = stitchedFaces.find((f) => f.faceId === nb.faceId);
          if (!nbFace) continue;
          const [cxB, cyB] = faceLocalCenter(nbFace);
          ctx.strokeStyle = 'rgba(99,102,241,0.7)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.moveTo(cxA, cyA); ctx.lineTo(cxB, cyB); ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      for (const tr of stitchTransforms) {
        if (!tr.sharedEdge) continue;
        const { worldLPos, hStart, hEnd } = tr.sharedEdge;
        const localL = worldLPos - lMin3;
        const [ex, ey0] = toScreen(mx(localL, 0), hStart - hMin3);
        const [, ey1] = toScreen(mx(localL, 0), hEnd - hMin3);
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(ex, ey0); ctx.lineTo(ex, ey1); ctx.stroke();
        ctx.font = `bold ${lSz}px system-ui, sans-serif`;
        ctx.fillStyle = '#f97316';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('⊢', ex, (ey0 + ey1) / 2);
      }

      for (const route of profileRoutes) {
        if (!route.sharedEdge) continue;
        const { worldLPos } = route.sharedEdge;
        const localL = worldLPos - lMin3;
        const worldY = route.worldY - hMin3;
        const [rx, ry] = toScreen(mx(localL, 0), worldY);
        ctx.fillStyle = '#06b6d4';
        ctx.beginPath(); ctx.arc(rx, ry, 4, 0, Math.PI * 2); ctx.fill();
      }

      for (const pg of pgGroups) {
        const refFace = stitchedFaces.find((f) => f.faceId === pg.frontFaceId);
        if (!refFace) continue;
        const opLx = (refFace.lengthStart - lMin3) + (pg.openingX ?? 0);
        const opLy = (refFace.heightStart - hMin3) + (pg.openingY ?? 0);
        const [pgsx, pgsy] = toScreen(mx(opLx, pg.openingWidth ?? 0), opLy + (pg.openingHeight ?? 0));
        const pgsw = (pg.openingWidth ?? 0) * scale * 0.001;
        const pgsh = (pg.openingHeight ?? 0) * scale * 0.001;
        ctx.strokeStyle = 'rgba(168,85,247,0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 2]);
        ctx.strokeRect(pgsx, pgsy, pgsw, pgsh);
        ctx.setLineDash([]);
        if (pgsw > 16) {
          ctx.font = `${lSz}px system-ui, sans-serif`;
          ctx.fillStyle = 'rgba(168,85,247,0.9)';
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.fillText('PS', pgsx + pgsw / 2, pgsy + 1);
        }
      }

      const shellColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
      shells.forEach((shell, si) => {
        const col = shellColors[si % shellColors.length];
        for (const face of shell.faces) {
          const lc = (face.lengthStart - lMin3);
          const hc = (face.heightStart - hMin3);
          const fw = face.width ?? 0;
          const fh = face.height ?? 0;
          const [fsx, fsy] = toScreen(mx(lc, fw), hc + fh);
          const fsw = fw * scale * 0.001;
          const fsh = fh * scale * 0.001;
          if (fsw < 3 || fsh < 3) continue;
          ctx.strokeStyle = col;
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 4]);
          ctx.strokeRect(fsx + 4, fsy + 4, Math.max(1, fsw - 8), Math.max(1, fsh - 8));
          ctx.setLineDash([]);
        }
      });

      ctx.restore();
    }

    if (sfDebug && wallDecomposition?.segments?.length > 0) {
      ctx.save();
      const wallsWO4 = (walls ?? []).filter((w) => w.wallOrigin);
      const lMin4 = wallsWO4.length ? Math.min(...wallsWO4.map((w) => w.wallOrigin.lengthStart)) : 0;
      const hMin4 = wallsWO4.length ? Math.min(...wallsWO4.map((w) => w.wallOrigin.heightStart)) : 0;
      const segColors4 = { front: '#22c55e', leftReturn: '#8b5cf6', rightReturn: '#ec4899', portalLeft: '#f97316', portalRight: '#14b8a6' };
      const dSz = annotSz(40, 4, 8);

      const PORTAL_WALL_TYPES4 = new Set(['portalLeft', 'portalRight']);

      for (const seg of wallDecomposition.segments) {
        const isPortal4 = PORTAL_WALL_TYPES4.has(seg.wallType);
        const col = isPortal4 ? 'rgba(156,163,175,0.5)' : (segColors4[seg.wallType] ?? '#64748b');
        const localX = seg.lengthStart - lMin4;
        const localY = seg.heightStart - hMin4;
        ctx.strokeStyle = col;
        ctx.fillStyle = col;

        if (isPortal4) {
          const opX = (seg.openingX ?? 0) + localX;
          const opY = seg.openingY ?? 0;
          const opH = seg.openingHeight ?? 0;
          const isLeft4 = seg.wallType === 'portalLeft';
          const edgeX4 = isLeft4 ? opX : opX + (seg.openingWidth ?? 0);
          const [px4, py04] = toScreen(mx(edgeX4, 0), opY + opH);
          const [, py14] = toScreen(mx(edgeX4, 0), opY);
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(px4, py04); ctx.lineTo(px4, py14); ctx.stroke();
          ctx.setLineDash([]);
          if (Math.abs(py14 - py04) > 14) {
            ctx.font = `${Math.max(7, dSz - 2)}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = 'rgba(156,163,175,0.7)';
            ctx.fillText('PORTAL DEBUG ONLY', px4, Math.min(py04, py14) + 2);
          }
          continue;
        }

        if (seg.wallType === 'front') {
          const lW = seg.localWidth;
          const lH = seg.localHeight;
          const [sx, sy] = toScreen(mx(localX, lW), localY + lH);
          const sw = lW * scale * 0.001;
          const sh = lH * scale * 0.001;
          ctx.lineWidth = 2.5;
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(sx + 5, sy + 5, sw - 10, sh - 10);
          ctx.setLineDash([]);
          if (sw > 30) {
            ctx.font = `bold ${dSz}px system-ui, sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(`WD-FRONT ${Math.round(lW)}×${Math.round(lH)}mm`, sx + 7, sy + 7);
          }
        } else if (seg.wallType === 'leftReturn') {
          const lH = seg.localHeight;
          const [sx, sy0] = toScreen(mx(localX, 0), localY + lH);
          const [, sy1] = toScreen(mx(localX, 0), localY);
          ctx.lineWidth = 5;
          ctx.setLineDash([]);
          ctx.beginPath(); ctx.moveTo(sx, sy0); ctx.lineTo(sx, sy1); ctx.stroke();
          if (Math.abs(sy1 - sy0) > 20) {
            ctx.font = `bold ${dSz}px system-ui, sans-serif`;
            ctx.save();
            ctx.translate(sx - 3, (sy0 + sy1) / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(`L-RET ${Math.round(seg.localWidth)}mm`, 0, 0);
            ctx.restore();
          }
        } else if (seg.wallType === 'rightReturn') {
          const lEnd4 = seg.lengthEnd ?? (seg.lengthStart + (seg.sourceFaceWidth ?? seg.localWidth));
          const localXEnd = lEnd4 - lMin4;
          const lH = seg.localHeight;
          const [sx, sy0] = toScreen(mx(localXEnd, 0), localY + lH);
          const [, sy1] = toScreen(mx(localXEnd, 0), localY);
          ctx.lineWidth = 5;
          ctx.setLineDash([]);
          ctx.beginPath(); ctx.moveTo(sx, sy0); ctx.lineTo(sx, sy1); ctx.stroke();
          if (Math.abs(sy1 - sy0) > 20) {
            ctx.font = `bold ${dSz}px system-ui, sans-serif`;
            ctx.save();
            ctx.translate(sx + 3, (sy0 + sy1) / 2);
            ctx.rotate(Math.PI / 2);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(`R-RET ${Math.round(seg.localWidth)}mm`, 0, 0);
            ctx.restore();
          }
        } else if (seg.wallType === 'portalLeft' || seg.wallType === 'portalRight') {
          const opX = (seg.openingX ?? 0) + localX;
          const opY = seg.openingY ?? 0;
          const opH = seg.openingHeight ?? 0;
          const isLeft = seg.wallType === 'portalLeft';
          const edgeX = isLeft ? opX : opX + (seg.openingWidth ?? 0);
          const [px, py0] = toScreen(mx(edgeX, 0), opY + opH);
          const [, py1] = toScreen(mx(edgeX, 0), opY);
          ctx.lineWidth = 4;
          ctx.setLineDash([4, 2]);
          ctx.beginPath(); ctx.moveTo(px, py0); ctx.lineTo(px, py1); ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = `${dSz}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(`${isLeft ? 'PL' : 'PR'}-RET ${Math.round(seg.localWidth)}mm`, px, Math.min(py0, py1) + 2);
        }
      }

      for (const conn of (wallDecomposition.connections ?? [])) {
        const segA = wallDecomposition.segments.find((s) => s.wallSegId === conn.wallAId);
        const segB = wallDecomposition.segments.find((s) => s.wallSegId === conn.wallBId);
        if (!segA || !segB) continue;

        const centerX4 = (seg) => {
          if (seg.wallType === 'rightReturn') return (seg.lengthEnd ?? seg.lengthStart + (seg.sourceFaceWidth ?? 0)) - lMin4;
          return (seg.lengthStart - lMin4) + (seg.wallType === 'front' ? seg.localWidth / 2 : 0);
        };
        const centerY4 = (seg) => (seg.heightStart - hMin4) + seg.localHeight / 2;
        const [axc, ayc] = toScreen(mx(centerX4(segA), 0), centerY4(segA));
        const [bxc, byc] = toScreen(mx(centerX4(segB), 0), centerY4(segB));
        ctx.strokeStyle = 'rgba(100,116,139,0.6)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(axc, ayc); ctx.lineTo(bxc, byc); ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();
    }

    if (allPanels.length && vis.panelen !== false) {
      ctx.save();
      applyOpeningExclusionClip();
      const panelColors = ['rgba(203,213,225,0.45)', 'rgba(186,230,253,0.45)'];
      allPanels.forEach((panel, i) => {
        const [pSx, pSy] = toScreen(mx(panel.x, panel.width), panel.y + panel.height);
        const pSw = panel.width * scale * 0.001;
        const pSh = panel.height * scale * 0.001;
        ctx.fillStyle = panelColors[i % 2];
        ctx.fillRect(pSx, pSy, pSw, pSh);
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        ctx.strokeRect(pSx, pSy, pSw, pSh);
        if (pSw > 24 && pSh > 14) {
          const pLabelSz = annotSz(80, 6, 14);
          ctx.font = `${pLabelSz}px system-ui, sans-serif`;
          ctx.fillStyle = '#64748b';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${Math.round(panel.width)}×${Math.round(panel.height)}`, pSx + pSw / 2, pSy + pSh / 2);
        }
        // SPARING-ELEMENTEN: markeer het gat op het HELE paneel (frees/zagerij) — rood gestreept + maat.
        if (panel.holes?.length) {
          for (const h of panel.holes) {
            const [hSx, hSy] = toScreen(mx(h.x, h.width), h.y + h.height);
            const hSw = h.width * scale * 0.001;
            const hSh = h.height * scale * 0.001;
            ctx.fillStyle = 'rgba(220,38,38,0.18)';
            ctx.fillRect(hSx, hSy, hSw, hSh);
            ctx.strokeStyle = '#dc2626';
            ctx.lineWidth = 1.2;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(hSx, hSy, hSw, hSh);
            ctx.setLineDash([]);
            if (hSw > 20 && hSh > 12) {
              const hSz = annotSz(60, 6, 12);
              ctx.font = `${hSz}px system-ui, sans-serif`;
              ctx.fillStyle = '#b91c1c';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(`${Math.round(h.width)}×${Math.round(h.height)}`, hSx + hSw / 2, hSy + hSh / 2);
            }
          }
        }
      });
      const [, faceSyTop] = toScreen(0, groupHeight);
      const [, faceSyBot] = toScreen(0, 0);
      const panelBoundaryXs = [...new Set(allPanels.map((p) => Math.round(p.x + p.width)))].filter((x) => x < groupWidth - 1);
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      for (const bx of panelBoundaryXs) {
        const [lineX] = toScreen(mx(bx, 0), 0);
        ctx.beginPath();
        ctx.moveTo(lineX, faceSyTop);
        ctx.lineTo(lineX, faceSyBot);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (vis.strips !== false) {
      const isTegel = verband === 'staand_tegelverband';
      const stripH = isTegel ? effectiveMat.steenL : steenH;
      const hasZones = stripZones.length > 0;
      ctx.save();
      ctx.beginPath();
      ctx.rect(clipSx - 1, faceSy - 1, clipW + 2, faceH + 2);
      if (startLijn != null && startLijn < 0) {
        const [, byPeil] = toScreen(0, 0);
        const [, byStart] = toScreen(0, startLijn);
        ctx.rect(clipSx - 1, byPeil + 1, clipW + 2, byStart - byPeil);
      }
      if (penantFaceData?.length) {
        const STRIP_LAT_GAP = 5;
        const baseVY = (startLijn != null && startLijn < 0) ? startLijn : 0;
        for (const { penant: p, height: pH } of penantFaceData) {
          const pB = Math.max(1, p.breedte ?? 400);
          const pX = p.x ?? 0;   // penant.x is u; de outsideDirFlip-mirror (manuele flip) plaatst 'm
          const clipX = pX + STRIP_LAT_GAP;
          const clipW = Math.max(0, pB - 2 * STRIP_LAT_GAP);
          if (clipW <= 0) continue;
          const [penSx] = toScreen(outsideDirFlip ? groupWidth - clipX - clipW : clipX, 0);
          const penSw = clipW * scale * 0.001;
          const [, penSy] = toScreen(0, baseVY + pH);
          const penSh = pH * scale * 0.001;
          ctx.rect(penSx, penSy, penSw, penSh);
        }
      }
      ctx.clip('evenodd');
      // FASE 3: bij actieve stripZone-regio's tekenen we de DOORGEGEVEN samengestelde
      // batches (zelfde output als 3D/export) — niet de oude per-zone-clip. Flag UIT of
      // 0 actieve zones → regionBatches is null → exact het bestaande pad (byte-identiek).
      if (hasZones && !regionBatches) {
        ctx.beginPath();
        for (const sz of stripZones) {
          const [szSx, szSy] = toScreen(mx(sz.x, sz.width), sz.y + sz.height);
          const szSw = sz.width * scale * 0.001;
          const szSh = sz.height * scale * 0.001;
          ctx.rect(szSx, szSy, szSw, szSh);
        }
        ctx.clip();
      }
      const panelRightEdges = allPanels.length
        ? [...new Set(allPanels.map((p) => Math.round(p.x + p.width)))].filter((x) => x < groupWidth - 1)
        : [];
      // UNIFIED_PANELS: koppelstrippen met DEZELFDE detectie als de werktekening (detectKoppelstrippen —
      // strip valt VOLLEDIG binnen ≥2 panelen) i.p.v. de grovere "paneelrand ligt in de strip"-test (die
      // een vals-positief geeft aan raamranden waar boven/onder het raam geen echte paneelnaad zit). Vlag
      // uit → oude test (byte-identiek).
      const _kopSetV2 = (isUnifiedPanels() && allPanels.length && (rows?.length ?? 0))
        ? new Set(detectKoppelstrippen(allPanels, rows, effectiveMat, verband).map((k) => `${Math.round(k.x)},${Math.round(k.y)},${Math.round(k.width)}`))
        : null;
      const isKoppelstrip = (sx, ex) => panelRightEdges.some((bx) => bx > sx + 0.5 && bx < ex - 0.5);
      // koppelstrip-kleur per strip: unified → set-lidmaatschap (zelfde als werktekening, geen Strek-guard);
      // vlag uit → oude Strek+paneelrand-test (byte-identiek).
      const stripIsKoppel = (piece, ry) => _kopSetV2
        ? _kopSetV2.has(`${Math.round(piece.start)},${Math.round(ry)},${Math.round(piece.length)}`)
        : (piece.label === 'Strek' && isKoppelstrip(piece.start, piece.start + piece.length));
      const tooSmallPieces = [];
      if (regionBatches) {
        // 2D == 3D == export: teken stenen uit de doorgegeven samengestelde regio-batches.
        // Elke batch heeft eigen kleur + brickH (eigen verband). Geometrie is al geklipt
        // (rechthoek ∩ vlak − openingen − hogere zones) door buildStripZoneRegions.
        for (const batch of regionBatches) {
          const bStripH = batch.brickH ?? stripH;
          const bColor = batch.color ?? color;
          for (const row of (batch.rows ?? [])) {
            const clippedTop = Math.min(row.y + bStripH, groupHeight);
            const clippedBottom = Math.max(row.y, patternStartH);
            if (clippedTop - clippedBottom <= 0) continue;
            for (const piece of row.pieces) {
              const [pSx] = toScreen(mx(piece.start, piece.length), 0);
              const pSw = piece.length * scale * 0.001;
              // STRIP_SNIJLIJN: deel-steen (yBot/yTop) op eigen hoogte; anders de batch-rij-hoogte.
              const pTop = Math.min(piece.yTop != null ? piece.yTop : row.y + bStripH, groupHeight);
              const pBot = Math.max(piece.yBot != null ? piece.yBot : row.y, patternStartH);
              if (pTop - pBot <= 0) continue;
              const [, pSy] = toScreen(0, pTop);
              const pSh = (pTop - pBot) * scale * 0.001;
              ctx.fillStyle = brickColor(piece.label, bColor, piece.length, kopMM);
              ctx.fillRect(pSx + 0.5, pSy + 0.5, Math.max(pSw - 1, 1), Math.max(pSh - 1, 1));
              if (isTooSmall(piece.label, piece.length, kopMM)) tooSmallPieces.push({ pSx, rowSy: pSy, pSw, rowSh: pSh });
            }
          }
        }
      } else if (verband === 'wildverband' && allPanels.length > 0) {
        for (const panel of allPanels) {
          if (!panel.rows) continue;
          for (const row of panel.rows) {
            const rowYTop = row.y + row.height;
            const clippedTop = Math.min(rowYTop, groupHeight);
            const clippedBottom = Math.max(row.y, patternStartH);
            if (clippedTop - clippedBottom <= 0) continue;
            const [, rowSy] = toScreen(0, clippedTop);
            const rowSh = (clippedTop - clippedBottom) * scale * 0.001;
            for (const strip of row.strips) {
              const absX = panel.x + strip.x;
              const [pSx] = toScreen(mx(absX, strip.width), 0);
              const pSw = strip.width * scale * 0.001;
              if (strip.koppelstrip) {
                ctx.fillStyle = 'rgba(22,163,74,0.85)';
              } else {
                ctx.fillStyle = brickColor(strip.label, color, strip.width, kopMM);
              }
              ctx.fillRect(pSx + 0.5, rowSy + 0.5, Math.max(pSw - 1, 1), Math.max(rowSh - 1, 1));
            }
          }
        }
      } else {
        for (const row of rows) {
          const clippedTop = Math.min(row.y + stripH, groupHeight);
          const clippedBottom = Math.max(row.y, patternStartH);
          if (clippedTop - clippedBottom <= 0) continue;
          for (const piece of row.pieces) {
            const [pSx] = toScreen(mx(piece.start, piece.length), 0);
            const pSw = piece.length * scale * 0.001;
            // STRIP_SNIJLIJN: een deel-steen (yBot/yTop) tekent op z'n eigen hoogte; anders de rij-hoogte.
            const pTop = Math.min(piece.yTop != null ? piece.yTop : row.y + stripH, groupHeight);
            const pBot = Math.max(piece.yBot != null ? piece.yBot : row.y, patternStartH);
            if (pTop - pBot <= 0) continue;
            const [, pSy] = toScreen(0, pTop);
            const pSh = (pTop - pBot) * scale * 0.001;
            ctx.fillStyle = (piece.koppelstrip || stripIsKoppel(piece, row.y))
              ? 'rgba(22,163,74,0.85)'
              : brickColor(piece.label, color, piece.length, kopMM);
            ctx.fillRect(pSx + 0.5, pSy + 0.5, Math.max(pSw - 1, 1), Math.max(pSh - 1, 1));
            if (isTooSmall(piece.label, piece.length, kopMM)) {
              tooSmallPieces.push({ pSx, rowSy: pSy, pSw, rowSh: pSh });
            }
          }
        }
      }
      if (tooSmallPieces.length > 0) {
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const { pSx, rowSy, pSw, rowSh } of tooSmallPieces) {
          const fontSize = Math.min(rowSh * 0.75, pSw * 1.2, 10);
          if (fontSize < 3) continue;
          ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
          ctx.fillText('!', pSx + pSw / 2, rowSy + rowSh / 2);
        }
      }
      ctx.restore();

      for (const zp of zonePatterns) {
        if (!zp) continue;
        const { patternData: zPat, zoneX1, zoneX2, color: zColor, zoneMat: zMat, zoneVerband: zVerband } = zp;
        const [sx1z] = toScreen(outsideDirFlip ? groupWidth - zoneX2 : zoneX1, 0);
        const zW = (zoneX2 - zoneX1) * scale * 0.001;
        if (zW <= 0) continue;
        const isTZ = zVerband === 'staand_tegelverband';
        const zStripH = isTZ ? zMat.steenL : zMat.steenH;
        ctx.save();
        ctx.beginPath();
        ctx.rect(sx1z, faceSy, zW, faceH);
        ctx.clip();
        ctx.fillStyle = hexToRgba(zColor, 0.15);
        ctx.fillRect(sx1z, faceSy, zW, faceH);
        for (const row of zPat.rows) {
          const zClippedTop = Math.min(row.y + zStripH, groupHeight);
          const zActualH = zClippedTop - row.y;
          if (zActualH <= 0) continue;
          const [, rowSy] = toScreen(0, zClippedTop);
          const rowSh = zActualH * scale * 0.001;
          const zKop = Math.round((zMat.steenL - zMat.stoot) / 2);
          for (const piece of row.pieces) {
            const pEnd = piece.start + piece.length;
            if (pEnd <= zoneX1 || piece.start >= zoneX2) continue;
            const clipL = Math.max(piece.start, zoneX1);
            const clipR = Math.min(pEnd, zoneX2);
            const [pSx] = toScreen(mx(clipL, clipR - clipL), 0);
            const pSw = (clipR - clipL) * scale * 0.001;
            ctx.fillStyle = brickColor(piece.label, zColor, piece.length, zKop);
            ctx.fillRect(pSx + 0.5, rowSy + 0.5, Math.max(pSw - 1, 1), Math.max(rowSh - 1, 1));
            if (isTooSmall(piece.label, piece.length, zKop)) {
              const fontSize = Math.min(rowSh * 0.75, pSw * 1.2, 10);
              if (fontSize >= 3) { ctx.fillStyle = '#ffffff'; ctx.font = `bold ${fontSize}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', pSx + pSw / 2, rowSy + rowSh / 2); }
            }
          }
        }
        ctx.restore();
      }
    }

    for (const op of groupOpenings) {
      // VENTILATIE_ZONE: de verticale zone-strippen lopen ÓVER het ventilatiegat → niet als opening
      // tekenen/clearen (paneel/latten sparen wél op het gat, dat is een aparte laag).
      if (op.type === 'ventilatie') continue;
      const [opSx, opSy] = toScreen(mx(op.x, op.width), op.y + op.height);
      const opSw = op.width * scale * 0.001;
      const opSh = op.height * scale * 0.001;

      const poly = getOpeningPoly(op);
      const pts = poly.map((p) => toScreen(mx(p.l), p.h));
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.clip();
      ctx.clearRect(opSx - 2, opSy - 2, opSw + 4, opSh + 4);
      ctx.fillStyle = 'rgba(147,197,253,0.18)';
      ctx.fillRect(opSx - 2, opSy - 2, opSw + 4, opSh + 4);
      ctx.restore();
      ctx.strokeStyle = '#93c5fd';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.stroke();

      if (opSw > 20) {
        const labelY = opSy - 2;
        ctx.font = `${annotSz(80, 7, 14)}px system-ui, sans-serif`;
        ctx.fillStyle = '#7dd3fc';
        ctx.textBaseline = 'bottom';
        ctx.textAlign = 'left';
        ctx.fillText(`${Math.round(op.x)}`, opSx + 2, labelY);
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(op.x + op.width)}`, opSx + opSw - 2, labelY);
      }

      // KOZIJN-weergave (vlag showKozijnen): teken het echte kozijn-vlak (rauw, vóór offset) als amber
      // stippelkader binnen de knipgrens, met de marge kozijn→kniprand links/rechts (= de offset) ter
      // controle van de uitlijning. Bij vlag kozijnOffset uit is dit de reveal kozijn↔void.
      if (isShowKozijnen() && op.kozijnRaw) {
        const k = op.kozijnRaw;
        const [kSx, kSy] = toScreen(mx(k.x, k.width), k.y + k.height);
        const kSw = k.width * scale * 0.001;
        const kSh = k.height * scale * 0.001;
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(kSx, kSy, kSw, kSh);
        ctx.setLineDash([]);
        const gapL = Math.round(k.x - op.x);                       // marge links kozijn → kniprand (offset L)
        const gapR = Math.round((op.x + op.width) - (k.x + k.width)); // marge rechts (offset R)
        if (kSw > 30 && kSh > 16) {
          ctx.font = `${annotSz(80, 7, 13)}px system-ui, sans-serif`;
          ctx.fillStyle = '#fbbf24';
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'center';
          ctx.fillText(`L ${gapL} · R ${gapR}`, kSx + kSw / 2, kSy + kSh / 2);
        }
      }
    }


    if (penantFaceData?.length && vis.penanten !== false) {
      for (const { penant: p, front, left: leftSideRows = [], right: rightSideRows = [], height: pH, panelDepthL: penPanelDepthL, panelDepthR: penPanelDepthR, pDL: penDL, pDR: penDR, skipLeft: penSkipL = false, skipRight: penSkipR = false } of penantFaceData) {
        const pB = Math.max(1, p.breedte ?? 400);
        const pX = p.x ?? 0;   // penant.x is u; de outsideDirFlip-mirror (manuele flip) plaatst 'm
        const pDL = Math.max(1, penDL ?? p.diepteLinks ?? p.diepte ?? 150);
        const pDR = Math.max(1, penDR ?? p.diepteRechts ?? p.diepte ?? 150);
        const baseVY = (startLijn != null && startLijn < 0) ? startLijn : 0;

        const [sx, baseY] = toScreen(outsideDirFlip ? groupWidth - pX - pB : pX, baseVY + pH);
        const [ex] = toScreen(outsideDirFlip ? groupWidth - pX : pX + pB, 0);
        const [, bottomY] = toScreen(0, baseVY);
        const pW = ex - sx;
        const pHpx = bottomY - baseY;
        const depthPxR = penSkipR ? 0 : Math.min(pDR * scale * 0.001, 30);   // zijde op 0 → geen zij-wig
        const depthPxL = penSkipL ? 0 : Math.min(pDL * scale * 0.001, 30);

        ctx.fillStyle = 'rgba(99,102,241,0.15)';
        ctx.fillRect(sx, baseY, pW, pHpx);

        if (!penSkipR) {
          ctx.fillStyle = 'rgba(99,102,241,0.25)';
          ctx.beginPath();
          ctx.moveTo(sx + pW, baseY);
          ctx.lineTo(sx + pW + depthPxR, baseY - depthPxR);
          ctx.lineTo(sx + pW + depthPxR, bottomY - depthPxR);
          ctx.lineTo(sx + pW, bottomY);
          ctx.closePath();
          ctx.fill();
        }

        if (rightSideRows.length) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(sx + pW, baseY);
          ctx.lineTo(sx + pW + depthPxR, baseY - depthPxR);
          ctx.lineTo(sx + pW + depthPxR, bottomY - depthPxR);
          ctx.lineTo(sx + pW, bottomY);
          ctx.closePath();
          ctx.clip();
          const col = groupColor ?? '#a64033';
          for (const row of rightSideRows) {
            for (const piece of row.pieces) {
              const dm = piece.start;
              const l = piece.length;
              const dFracL = Math.max(0, Math.min(1, (pDR - dm - l) / pDR));
              const dFracR = Math.max(0, Math.min(1, (pDR - dm) / pDR));
              const topFrac = (pH - row.y - steenH) / pH;
              const botFrac = (pH - row.y) / pH;
              ctx.fillStyle = brickColor(piece.label, col, piece.length, kopMM);
              ctx.beginPath();
              ctx.moveTo(sx + pW + dFracL * depthPxR, baseY + topFrac * pHpx - dFracL * depthPxR);
              ctx.lineTo(sx + pW + dFracR * depthPxR, baseY + topFrac * pHpx - dFracR * depthPxR);
              ctx.lineTo(sx + pW + dFracR * depthPxR, baseY + botFrac * pHpx - dFracR * depthPxR);
              ctx.lineTo(sx + pW + dFracL * depthPxR, baseY + botFrac * pHpx - dFracL * depthPxR);
              ctx.closePath();
              ctx.fill();
            }
          }
          ctx.restore();
        }

        ctx.fillStyle = 'rgba(99,102,241,0.25)';
        ctx.beginPath();
        ctx.moveTo(sx, baseY);
        ctx.lineTo(sx - depthPxL, baseY - depthPxL);
        ctx.lineTo(sx - depthPxL, bottomY - depthPxL);
        ctx.lineTo(sx, bottomY);
        ctx.closePath();
        ctx.fill();

        if (leftSideRows.length && (penPanelDepthL ?? 0) > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(sx, baseY);
          ctx.lineTo(sx - depthPxL, baseY - depthPxL);
          ctx.lineTo(sx - depthPxL, bottomY - depthPxL);
          ctx.lineTo(sx, bottomY);
          ctx.closePath();
          ctx.clip();
          const col = groupColor ?? '#a64033';
          for (const row of leftSideRows) {
            for (const piece of row.pieces) {
              const dFracFront = Math.max(0, Math.min(1, piece.start / penPanelDepthL));
              const dFracBack  = Math.max(0, Math.min(1, (piece.start + piece.length) / penPanelDepthL));
              const topFrac = (pH - row.y - steenH) / pH;
              const botFrac = (pH - row.y) / pH;
              ctx.fillStyle = brickColor(piece.label, col, piece.length, kopMM);
              ctx.beginPath();
              ctx.moveTo(sx - dFracFront * depthPxL, baseY + topFrac * pHpx - dFracFront * depthPxL);
              ctx.lineTo(sx - dFracBack  * depthPxL, baseY + topFrac * pHpx - dFracBack  * depthPxL);
              ctx.lineTo(sx - dFracBack  * depthPxL, baseY + botFrac * pHpx - dFracBack  * depthPxL);
              ctx.lineTo(sx - dFracFront * depthPxL, baseY + botFrac * pHpx - dFracFront * depthPxL);
              ctx.closePath();
              ctx.fill();
            }
          }
          ctx.restore();
        }

        ctx.fillStyle = 'rgba(99,102,241,0.2)';
        ctx.beginPath();
        ctx.moveTo(sx, baseY);
        ctx.lineTo(sx + depthPxL, baseY - depthPxL);
        ctx.lineTo(sx + pW + depthPxR, baseY - depthPxR);
        ctx.lineTo(sx + pW, baseY);
        ctx.closePath();
        ctx.fill();

        const col = groupColor ?? '#a64033';
        for (const row of front) {
          const [, rowTop] = toScreen(0, baseVY + row.y + steenH);
          const rowH = steenH * scale * 0.001;
          for (const piece of row.pieces) {
            const [px2] = toScreen(mx(pX + piece.start, piece.length), 0);
            const pw2 = piece.length * scale * 0.001;
            ctx.fillStyle = brickColor(piece.label, col, piece.length, kopMM);
            ctx.fillRect(px2 + 0.5, rowTop + 0.5, Math.max(pw2 - 1, 1), Math.max(rowH - 1, 1));
            if (isTooSmall(piece.label, piece.length, kopMM)) {
              const fontSize = Math.min(rowH * 0.75, pw2 * 1.2, 10);
              if (fontSize >= 3) { ctx.fillStyle = '#ffffff'; ctx.font = `bold ${fontSize}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', px2 + pw2 / 2, rowTop + rowH / 2); }
            }
          }
        }

        ctx.strokeStyle = '#4338ca';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx, baseY, pW, pHpx);

        ctx.fillStyle = '#4338ca';
        ctx.font = `bold ${annotSz(100, 8, 18)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('P', sx + pW / 2, baseY + Math.min(pHpx / 2, annotSz(100, 8, 18)));
      }
    }

    if (maxHoogte != null && maxHoogte > 0) {
      const [, sy] = toScreen(0, maxHoogte);
      const [sx1] = toScreen(0, 0);
      const [sx2] = toScreen(groupWidth, 0);
      ctx.save();
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.moveTo(Math.max(0, sx1 - 20), sy);
      ctx.lineTo(Math.min(W, sx2 + 20), sy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#f97316';
      ctx.font = `${annotSz(90, 8, 16)}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`▲ max ${maxHoogte} mm`, Math.max(4, sx1), sy - 2);
      ctx.restore();
    }

    if (startLijn != null) {
      const [sx1] = toScreen(0, 0);
      const [sx2] = toScreen(groupWidth, 0);
      const [, sy] = toScreen(0, startLijn);
      ctx.save();
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.moveTo(Math.max(0, sx1 - 20), sy);
      ctx.lineTo(Math.min(W, sx2 + 20), sy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#a855f7';
      ctx.font = `${annotSz(90, 8, 16)}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`▼ startlijn ${startLijn} mm`, Math.max(4, sx1), sy + 2);
      ctx.restore();
    }

    if (patternStartH > 0) {
      const [, sy] = toScreen(0, patternStartH);
      const [sx1] = toScreen(0, 0);
      const [sx2] = toScreen(groupWidth, 0);
      ctx.save();
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.moveTo(Math.max(0, sx1 - 20), sy);
      ctx.lineTo(Math.min(W, sx2 + 20), sy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#22d3ee';
      ctx.font = `${annotSz(90, 8, 16)}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`▼ vanaf ${patternStartH} mm`, Math.max(4, sx1), sy + 2);
      ctx.restore();
    }

    {
      const [, sy] = toScreen(0, 0);
      const [sx1] = toScreen(0, 0);
      const [sx2] = toScreen(groupWidth, 0);
      ctx.save();
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(Math.max(0, sx1 - 30), sy);
      ctx.lineTo(Math.min(W, sx2 + 30), sy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#facc15';
      ctx.font = `${annotSz(90, 8, 16)}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('± 0 peilmaat', Math.max(4, sx1), sy - 2);
      ctx.restore();
    }

    if (penantFaceData?.length >= 1 && vis.penanten !== false) {
      const sorted = [...penantFaceData].sort((a, b) => (a.penant.x ?? 0) - (b.penant.x ?? 0));
      const flatZones = [];
      const p0 = sorted[0].penant;
      const leftEnd = p0.x ?? 0;
      if (leftEnd > 1) flatZones.push({ x1: 0, x2: leftEnd });
      for (let i = 0; i < sorted.length - 1; i++) {
        const p1 = sorted[i].penant;
        const p2 = sorted[i + 1].penant;
        const x1 = (p1.x ?? 0) + Math.max(1, p1.breedte ?? 400);
        const x2 = p2.x ?? 0;
        if (x2 > x1 + 1) flatZones.push({ x1, x2 });
      }
      const pLast = sorted[sorted.length - 1].penant;
      const rightStart = (pLast.x ?? 0) + Math.max(1, pLast.breedte ?? 400);
      if (groupWidth - rightStart > 1) flatZones.push({ x1: rightStart, x2: groupWidth });

      for (let i = 0; i < flatZones.length; i++) {
        const { x1: zoneX1, x2: zoneX2 } = flatZones[i];
        const [sx1z] = toScreen(outsideDirFlip ? groupWidth - zoneX2 : zoneX1, 0);
        const zW = (zoneX2 - zoneX1) * scale * 0.001;
        ctx.save();
        ctx.fillStyle = 'rgba(234,179,8,0.12)';
        ctx.fillRect(sx1z, faceSy, zW, faceH);
        ctx.strokeStyle = 'rgba(234,179,8,0.7)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(sx1z, faceSy, zW, faceH);
        ctx.setLineDash([]);
        const zLabelSz = annotSz(100, 8, 18);
        ctx.fillStyle = 'rgba(234,179,8,0.9)';
        ctx.font = `bold ${zLabelSz}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const zLabel = `Zone ${i + 1}  (${Math.round(zoneX2 - zoneX1)} mm)`;
        const zlw = ctx.measureText(zLabel).width + 8;
        ctx.fillRect(sx1z + zW / 2 - zlw / 2, faceSy + 4, zlw, zLabelSz + 4);
        ctx.fillStyle = '#000';
        ctx.fillText(zLabel, sx1z + zW / 2, faceSy + 6);
        ctx.restore();
      }
    }

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    ctx.strokeRect(faceSx, faceSy, faceW, faceH);

    // Strip zone overlays
    for (const sz of stripZones) {
      const [szSx, szSy] = toScreen(mx(sz.x, sz.width), sz.y + sz.height);
      const szSw = sz.width * scale * 0.001;
      const szSh = sz.height * scale * 0.001;
      const isSelected = sz.id === selectedZoneId;
      ctx.save();
      ctx.strokeStyle = isSelected ? '#f59e0b' : '#22d3ee';
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(szSx, szSy, szSw, szSh);
      ctx.fillStyle = isSelected ? 'rgba(245,158,11,0.08)' : 'rgba(34,211,238,0.06)';
      ctx.fillRect(szSx, szSy, szSw, szSh);
      ctx.setLineDash([]);
      if (szSw > 40 && szSh > 14) {
        ctx.font = `bold ${annotSz(90, 7, 16)}px system-ui, sans-serif`;
        ctx.fillStyle = isSelected ? '#f59e0b' : '#22d3ee';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`${sz.label ?? sz.id}  ${Math.round(sz.width)}×${Math.round(sz.height)} mm`, szSx + 4, szSy + 4);
      }
      ctx.restore();
    }

    // In-progress drawing rect preview
    if (drawingRect && drawingRect.width > 0 && drawingRect.height > 0) {
      const [drSx, drSy] = toScreen(mx(drawingRect.x, drawingRect.width), drawingRect.y + drawingRect.height);
      const drSw = drawingRect.width * scale * 0.001;
      const drSh = drawingRect.height * scale * 0.001;
      ctx.save();
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(drSx, drSy, drSw, drSh);
      ctx.fillStyle = 'rgba(34,211,238,0.12)';
      ctx.fillRect(drSx, drSy, drSw, drSh);
      ctx.setLineDash([]);
      ctx.font = `${annotSz(80, 7, 14)}px system-ui, sans-serif`;
      ctx.fillStyle = '#22d3ee';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(drawingRect.width)} × ${Math.round(drawingRect.height)} mm`, drSx + drSw / 2, drSy + drSh / 2);
      ctx.restore();
    }

    if (showCenterLines) {
      const withOrigin = walls.filter((w) => w.wallOrigin);
      const groupMinX = withOrigin.length ? Math.min(...withOrigin.map((w) => w.wallOrigin.lengthStart)) : 0;
      const sorted = [...withOrigin].sort((a, b) => a.wallOrigin.lengthStart - b.wallOrigin.lengthStart);
      const gapCenters = [];
      for (let i = 0; i < sorted.length - 1; i++) {
        const rightEdge = (sorted[i].wallOrigin.lengthStart - groupMinX) + sorted[i].length;
        const leftEdge  = sorted[i + 1].wallOrigin.lengthStart - groupMinX;
        if (leftEdge > rightEdge + 1) {
          gapCenters.push((rightEdge + leftEdge) / 2);
        }
      }
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      const gapLabelSz = annotSz(80, 7, 14);
      ctx.strokeStyle = 'rgba(6,182,212,0.75)';
      ctx.fillStyle = 'rgba(6,182,212,0.9)';
      ctx.font = `${gapLabelSz}px monospace`;
      ctx.textAlign = 'center';
      for (const relCenter of gapCenters) {
        const [sx] = toScreen(mx(relCenter), 0);
        ctx.beginPath();
        ctx.moveTo(sx, faceSy);
        ctx.lineTo(sx, faceSy + faceH);
        ctx.stroke();
        const xLabel = `${Math.round(relCenter)}`;
        const tw = ctx.measureText(xLabel).width + 6;
        ctx.fillRect(sx - tw / 2, faceSy + faceH + 2, tw, gapLabelSz + 2);
        ctx.fillStyle = '#fff';
        ctx.textBaseline = 'top';
        ctx.fillText(xLabel, sx, faceSy + faceH + 3);
        ctx.fillStyle = 'rgba(6,182,212,0.9)';
      }
      ctx.restore();
    }

    if (gridLines.length > 0) {
      const withOrigin = walls.filter((w) => w.wallOrigin);
      if (withOrigin.length > 0) {
        const wo = withOrigin[0].wallOrigin;
        const lenAxis = wo.lengthAxis;
        const groupMinX = Math.min(...withOrigin.map((w) => w.wallOrigin.lengthStart));
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1.5;
        for (const gl of gridLines) {
          const worldMM = gl[lenAxis];
          if (worldMM == null) continue;
          const relX = worldMM - groupMinX;
          if (relX < -500 || relX > groupWidth + 500) continue;
          const [sx] = toScreen(mx(relX), 0);
          ctx.strokeStyle = 'rgba(234,88,12,0.8)';
          ctx.beginPath();
          ctx.moveTo(sx, 0);
          ctx.lineTo(sx, H);
          ctx.stroke();
          ctx.setLineDash([]);
          const glLabelSz = annotSz(100, 8, 18);
          ctx.fillStyle = 'rgba(234,88,12,0.9)';
          ctx.font = `bold ${glLabelSz}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          const label = gl.tag ?? '';
          const tw = ctx.measureText(label).width + 8;
          ctx.fillRect(sx - tw / 2, 2, tw, glLabelSz + 4);
          ctx.fillStyle = '#fff';
          ctx.fillText(label, sx, 4);
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = 'rgba(234,88,12,0.8)';
        }
        ctx.restore();
      }
    }

    // SPARING-ELEMENTEN maatvoering — per gespaard onderdeel: het gat (onderdeel + offset, gestippeld),
    // het onderdeel zelf, de onderdeel-maat (B×H) en de offset-afstand aan alle vier de zijden.
    if (facadeData.sparingRects?.length) {
      ctx.save();
      const rectToScreen = (rx, ry, rw, rh) => {
        const [ax, ay] = toScreen(mx(rx), ry + rh);
        const [bx, by] = toScreen(mx(rx + rw), ry);
        return { sx: Math.min(ax, bx), sy: Math.min(ay, by), sw: Math.abs(bx - ax), sh: Math.abs(by - ay) };
      };
      const spSz = annotSz(120, 8, 15);
      ctx.font = `${spSz}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const sr of facadeData.sparingRects) {
        const elr = sr.element ?? sr;
        const hole = rectToScreen(sr.x, sr.y, sr.width, sr.height);
        const el = rectToScreen(elr.x, elr.y, elr.width, elr.height);
        // gat (gestippeld) + onderdeel (vol)
        ctx.setLineDash([5, 3]); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(249,115,22,0.85)';
        ctx.strokeRect(hole.sx, hole.sy, hole.sw, hole.sh);
        ctx.setLineDash([]); ctx.lineWidth = 1.25; ctx.strokeStyle = 'rgba(249,115,22,0.95)';
        ctx.strokeRect(el.sx, el.sy, el.sw, el.sh);
        // onderdeel-maat (B×H) gecentreerd, op een donkere achtergrond
        const dimLabel = `${Math.round(elr.width)}×${Math.round(elr.height)}`;
        const tw = ctx.measureText(dimLabel).width + 6;
        ctx.fillStyle = 'rgba(15,23,42,0.82)';
        ctx.fillRect(el.sx + el.sw / 2 - tw / 2, el.sy + el.sh / 2 - spSz / 2 - 1, tw, spSz + 2);
        ctx.fillStyle = '#fdba74';
        ctx.fillText(dimLabel, el.sx + el.sw / 2, el.sy + el.sh / 2);
        // offset-afstand aan de 4 zijden (onderdeel → geknipte strip)
        if (sr.offset > 0) {
          const o = `${Math.round(sr.offset)}`;
          ctx.fillStyle = 'rgba(251,146,60,0.95)';
          ctx.fillText(o, el.sx + el.sw / 2, (hole.sy + el.sy) / 2);                                   // boven
          ctx.fillText(o, el.sx + el.sw / 2, (hole.sy + hole.sh + el.sy + el.sh) / 2);                 // onder
          ctx.fillText(o, (hole.sx + el.sx) / 2, el.sy + el.sh / 2);                                   // links
          ctx.fillText(o, (hole.sx + hole.sw + el.sx + el.sw) / 2, el.sy + el.sh / 2);                 // rechts
        }
      }
      ctx.restore();
    }

    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    // GEVEL_VERLENGING: toon de VERLENGDE breedte (bounds bevat de endExtensions-verbreding), niet de rauwe
    // groupWidth — zo klopt het label met de getekende bekleding én met de werktekening-TOTAAL. Geen verlenging → gelijk.
    ctx.fillText(`Schaal ~1:${Math.round(1 / (scale * 0.001))}  ·  ${Math.round(bounds.maxX - bounds.minX)}×${Math.round(groupHeight)} mm`, 8, H - 6);
  }, [walls, facadeData, allPanels, allLatten, zonePatterns, groupSettings, bounds, size, redrawTick, maxHoogte, startLijn, penantFaceData, groupColor, effectiveMat, color, panelen, latten, layerVisibility, gridLines, showCenterLines, stripZones, regionBatches, drawingRect, selectedZoneId, outsideDirFlip, buildingEnvelopeData, envelopeVisibility, slimFortStitching, wallDecomposition, sfFaceLayout, allSlimFortFaces]);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const t = transform.current;
    transform.current = {
      scale: t.scale * factor,
      tx: mx + (t.tx - mx) * factor,
      ty: my + (t.ty - my) * factor,
    };
    setRedrawTick((n) => n + 1);
  }, []);

  const screenToWorld = useCallback((sx, sy) => {
    const { scale, tx, ty } = transform.current;
    return [(sx - tx) / (scale * 0.001), (ty - sy) / (scale * 0.001)];
  }, []);

  const snapToFacadeEdge = useCallback((wX, wY) => {
    const SNAP_MM = 100;
    const gW = facadeData?.groupWidth ?? 0;
    const gH = facadeData?.groupHeight ?? 0;
    const snX = Math.abs(wX) < SNAP_MM ? 0 : Math.abs(wX - gW) < SNAP_MM ? gW : wX;
    const snY = Math.abs(wY) < SNAP_MM ? 0 : Math.abs(wY - gH) < SNAP_MM ? gH : wY;
    return [snX, snY];
  }, [facadeData]);

  const onMouseDown = useCallback((e) => {
    if (drawModeRef.current) {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const [rawX, rawY] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const [wX, wY] = snapToFacadeEdge(rawX, rawY);
      drawStartRef.current = { wX, wY };
      didZoomOutRef.current = false;   // reset; de eerste beweging (onMouseMove) zoomt uit
      drawingRectRef.current = { x: wX, y: wY, width: 0, height: 0 };
      setDrawingRect({ x: wX, y: wY, width: 0, height: 0 });
      const curZones = stripZonesRef.current;
      const hit = curZones.find((sz) => rawX >= sz.x && rawX <= sz.x + sz.width && rawY >= sz.y && rawY <= sz.y + sz.height);
      setSelectedZoneId(hit?.id ?? null);
    } else {
      dragStart.current = { x: e.clientX, y: e.clientY, tx: transform.current.tx, ty: transform.current.ty };
    }
  }, [screenToWorld, snapToFacadeEdge]);

  const onMouseMove = useCallback((e) => {
    if (drawModeRef.current && drawStartRef.current) {
      // ZONE_VOEG_SNAP: bij de EERSTE beweging van een nieuwe zone uitzoomen naar de hele gevel (je zoomde in om
      // het startpunt te raken; zo kun je de zone doortrekken tot het eindpunt). Startpunt blijft in wereld-coörd.
      if (isZoneVoegSnap() && !didZoomOutRef.current) { didZoomOutRef.current = true; fitToView(); return; }
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const [rawX, rawY] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const [wX, wY] = snapToFacadeEdge(rawX, rawY);
      const sX = drawStartRef.current.wX;
      const sY = drawStartRef.current.wY;
      const newRect = { x: Math.min(sX, wX), y: Math.min(sY, wY), width: Math.abs(wX - sX), height: Math.abs(wY - sY) };
      drawingRectRef.current = newRect;
      setDrawingRect(newRect);
    } else if (!drawModeRef.current && dragStart.current) {
      transform.current = {
        ...transform.current,
        tx: dragStart.current.tx + (e.clientX - dragStart.current.x),
        ty: dragStart.current.ty + (e.clientY - dragStart.current.y),
      };
      setRedrawTick((n) => n + 1);
    }
  }, [screenToWorld, snapToFacadeEdge, fitToView]);

  const onMouseUp = useCallback(() => {
    const dr = drawingRectRef.current;
    if (drawModeRef.current && drawStartRef.current && dr) {
      drawStartRef.current = null;
      if (dr.width > 20 && dr.height > 20) {
        const curZones = stripZonesRef.current;
        let base = { x: Math.round(dr.x), y: Math.round(dr.y), width: Math.round(dr.width), height: Math.round(dr.height) };
        let clearMargin = null;
        // ZONE_VOEG_SNAP: snap de nieuwe zone op het steenraster (hele strekken/koppen links/rechts in het bestaande
        // vlak) + een voeg rondom (stoot verticaal, lint horizontaal) via clearMargin. Vlag uit → vrij tekenen.
        if (isZoneVoegSnap() && facadeData?.rows?.length) {
          base = snapZoneRectToBond(base, facadeData, effectiveMat);
          clearMargin = { x: Math.max(0, effectiveMat?.stoot ?? effectiveMat?.lint ?? 0), y: Math.max(0, effectiveMat?.lint ?? 0) };
        }
        const newZone = {
          id: `sz_${Date.now()}`,
          ...base,
          label: `Zone ${String.fromCharCode(65 + curZones.length)}`,
          // eigenschappen-vooraf: de zone volgt verband + anker live, en is direct actief.
          verband: pendingRef.current.verband,
          bondAnchor: pendingRef.current.anchor,
          enabled: true,
          depthOffset: 0,
          ...(clearMargin ? { clearMargin } : {}),
        };
        onStripZonesChangeRef.current?.([...curZones, newZone]);
        setSelectedZoneId(newZone.id);
      }
      drawingRectRef.current = null;
      setDrawingRect(null);
    }
    dragStart.current = null;
  }, [facadeData, effectiveMat]);

  useEffect(() => {
    const handler = () => onMouseUp();
    window.addEventListener('mouseup', handler);
    return () => window.removeEventListener('mouseup', handler);
  }, [onMouseUp]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', background: '#1e293b' }}>
      <canvas
        ref={canvasRef}
        width={Math.round(size.w * (window.devicePixelRatio || 1))}
        height={Math.round(size.h * (window.devicePixelRatio || 1))}
        style={{ display: 'block', width: size.w, height: size.h, cursor: drawMode ? 'crosshair' : 'grab' }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
      />

      {/* Toolbar top-left — alleen achter featureZones (pre-feature: geen toolbar) */}
      {zonesEnabled && (
      <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
        <button
          disabled={penantFace}
          title={penantFace ? 'Dit vlak heeft penanten — strip-zones zijn hier uitgesloten (penanten winnen).' : undefined}
          onClick={() => { if (penantFace) return; setDrawMode((m) => { drawModeRef.current = !m; return !m; }); drawingRectRef.current = null; setDrawingRect(null); drawStartRef.current = null; }}
          style={{
            background: penantFace ? 'rgba(30,41,59,0.6)' : drawMode ? '#0e7490' : 'rgba(30,41,59,0.92)',
            border: `1px solid ${penantFace ? '#334155' : drawMode ? '#22d3ee' : '#334155'}`,
            color: penantFace ? '#475569' : drawMode ? '#22d3ee' : '#94a3b8',
            padding: '4px 10px', fontSize: 11, borderRadius: 4, cursor: penantFace ? 'not-allowed' : 'pointer', fontWeight: drawMode ? 700 : 400,
          }}
        >
          {penantFace ? '▭ Teken zone (uit: penanten)' : drawMode ? '✏️ Teken zone — klik & sleep' : '▭ Teken zone'}
        </button>

        {drawMode && !penantFace && (
          <div style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid #0e7490', borderRadius: 4, padding: '5px 7px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 170 }}>
            <div style={{ fontSize: 9, color: '#67e8f9', fontWeight: 600 }}>Eigenschappen nieuwe zone</div>
            <label style={{ fontSize: 9, color: '#94a3b8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
              Verband
              <select value={pendingVerband} onChange={(e) => setPendingVerband(e.target.value)}
                style={{ fontSize: 10, background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 3, padding: '1px 3px' }}>
                <option value="staand_tegelverband">Staand (verticaal)</option>
                <option value="halfsteens">Halfsteens</option>
              </select>
            </label>
            <label style={{ fontSize: 9, color: '#94a3b8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
              Anker
              <select value={pendingAnchor} onChange={(e) => setPendingAnchor(e.target.value)}
                style={{ fontSize: 10, background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 3, padding: '1px 3px' }}>
                <option value="zoneBottomLeft">Zone (linksonder)</option>
                <option value="planeOrigin">Vlak-oorsprong</option>
              </select>
            </label>
          </div>
        )}

        {penantFace && activeZoneCount > 0 && (
          <div style={{ background: 'rgba(120,53,15,0.92)', border: '1px solid #f59e0b', borderRadius: 4, padding: '4px 8px', maxWidth: 220 }}>
            <div style={{ fontSize: 10, color: '#fcd34d', fontWeight: 600 }}>⚠ Penanten actief</div>
            <div style={{ fontSize: 9, color: '#fde68a', marginTop: 2 }}>{activeZoneCount} strip-zone(s) staan UIT — penanten winnen op dit vlak. Data blijft bewaard.</div>
          </div>
        )}

        {stripZones.length > 0 && (
          <div style={{ background: 'rgba(15,23,42,0.92)', border: '1px solid #1e3a5f', borderRadius: 4, padding: '4px 6px', minWidth: 180 }}>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 3, fontWeight: 600 }}>Strip-zones ({stripZones.length})</div>
            {stripZones.map((sz) => (
              <div key={sz.id} style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0',
                background: sz.id === selectedZoneId ? 'rgba(34,211,238,0.08)' : 'transparent',
                borderRadius: 2, cursor: 'pointer',
              }}
                onClick={() => setSelectedZoneId(sz.id === selectedZoneId ? null : sz.id)}
              >
                <span style={{ width: 8, height: 8, border: '1.5px solid #22d3ee', borderRadius: 1, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: '#e2e8f0', flex: 1 }}>{sz.label} <span style={{ color: '#64748b' }}>{Math.round(sz.width)}×{Math.round(sz.height)}</span></span>
                <button
                  onClick={(ev) => { ev.stopPropagation(); onStripZonesChange?.(stripZones.filter((z) => z.id !== sz.id)); if (selectedZoneId === sz.id) setSelectedZoneId(null); }}
                  style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 12, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
                >✕</button>
              </div>
            ))}
            <button
              onClick={() => { onStripZonesChange?.([]); setSelectedZoneId(null); }}
              style={{ marginTop: 4, background: 'none', border: '1px solid #334155', color: '#64748b', fontSize: 9, borderRadius: 3, padding: '2px 6px', cursor: 'pointer', width: '100%' }}
            >Alle zones wissen</button>
          </div>
        )}

        {selectedZoneId && (() => {
          const sz = stripZones.find((z) => z.id === selectedZoneId);
          if (!sz) return null;
          return (
            <div style={{ background: 'rgba(15,23,42,0.92)', border: '1px solid #f59e0b', borderRadius: 4, padding: '5px 8px', minWidth: 180 }}>
              <div style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700 }}>◆ {sz.label}</div>
              <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>Instellingen → zijbalk</div>
            </div>
          );
        })()}
      </div>
      )}

      <button
        onClick={fitToView}
        style={{
          position: 'absolute', bottom: 12, right: 12,
          background: 'rgba(30,41,59,0.9)', border: '1px solid #334155',
          color: '#94a3b8', padding: '4px 10px', fontSize: 11,
          borderRadius: 4, cursor: 'pointer',
        }}
      >
        ⊡ Passend maken
      </button>
      <div style={{ position: 'absolute', bottom: 12, left: 12, color: '#475569', fontSize: 11, pointerEvents: 'none' }}>
        {drawMode ? '✏️ Teken een rechthoek om een strip-zone te definiëren' : 'Scrollen = zoom · Slepen = pannen'}
      </div>
    </div>
  );
}
