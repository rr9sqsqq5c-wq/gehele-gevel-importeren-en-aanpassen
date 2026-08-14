import { useMemo, useRef, useState } from 'react';
import { buildFullGroupFacadePattern, buildFacePattern, buildMirroredFacePattern } from './lib/pattern.js';
import { buildFacadeZones, panelizeZone, computeEffectiveBasePanel, generateBattenPositions, getMoldTemplates, generateMoldSVG, generateCombinedMoldSVG, clipPanelToFacadePolys, detectKoppelstrippen, PANEL_GAP, buildWildverbandPanelGrid, computeHorizontalLatten, attachHolesToPanels, buildFacadeLatten, buildZoneBackingPanels, clipLattenToZones, mergeStackedColumns, buildGroupPanels } from './lib/panelization.js';
import { buildStripZoneRegions, getActiveStripZones, solidifyRows } from './lib/zoneRegions.js';
import { sparingRectsForFacade } from './lib/sparingElements.js';
import { polyXRangesAtY, openingXRangesAtY, brickColor } from './lib/geometry.js';
import { STEENSTRIP_CATALOG } from './lib/battens.js';
import { isWildverbandKoppelstrip, isGroothuisWildverband, isGroothuisWildverband2, isUnifiedLatten, isUnifiedPanels, isPaneelMerk, isPaneelMerkPerZone, isBlankBaseVerband, isFeatureZones } from './lib/featureFlags.js';
import { buildTruthRows } from './lib/wildverbandKoppelstrip.js';
import { buildGroothuisRows } from './lib/groothuisWildverband.js';
import { buildGroothuis2Rows } from './lib/groothuisWildverband2.js';

function generatePaneelId(entity, projectNr, level, stramienStart, stramienEnd, seqNr, panelType) {
  const e  = ((entity ?? 'P') + '').slice(0, 1).toUpperCase();
  const p  = ((projectNr ?? '00000') + '').replace(/[^0-9A-Z]/gi, '').toUpperCase().slice(0, 5).padStart(5, '0');
  const l  = String(Math.max(0, Math.floor(Number(level ?? 0)))).padStart(2, '0').slice(0, 2);
  const ss = ((stramienStart ?? '--') + '').toUpperCase().slice(0, 2).padStart(2, '-');
  const se = ((stramienEnd   ?? '--') + '').toUpperCase().slice(0, 2).padStart(2, '-');
  const n  = String(Math.max(1, Number(seqNr ?? 1))).padStart(3, '0').slice(0, 3);
  const t  = ((panelType ?? 'V') + '').slice(0, 1).toUpperCase();
  return `${e}${p}${l}${ss}${se}${n}${t}`;
}

function formatEpcDisplay(epcCode) {
  if (!epcCode || epcCode.length !== 16) return epcCode;
  return `${epcCode[0]}-${epcCode.slice(1,6)}-${epcCode.slice(6,8)}-${epcCode.slice(8,10)}-${epcCode.slice(10,12)}-${epcCode.slice(12,15)}-${epcCode[15]}`;
}

function computeZoneBounds(penanten, groupWidth) {
  const sorted = [...(penanten ?? [])].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
  if (!sorted.length) return [{ idx: 0, label: 'Zone 1', xStart: 0, xEnd: groupWidth }];
  const xBounds = [0];
  for (const p of sorted) {
    xBounds.push(p.x ?? 0);
    xBounds.push((p.x ?? 0) + (p.breedte ?? 400));
  }
  xBounds.push(groupWidth);
  const zones = [];
  for (let i = 0; i < xBounds.length - 1; i += 2) {
    const xS = xBounds[i], xE = xBounds[i + 1];
    if (xE - xS > 1) zones.push({ idx: zones.length, label: `Zone ${zones.length + 1}`, xStart: xS, xEnd: xE });
  }
  return zones;
}

function labelForLen(len, steenL, kop, driekwart) {
  if (Math.abs(len - steenL) < 1) return 'Strek';
  if (Math.abs(len - kop) < 1) return 'Kop';
  if (Math.abs(len - driekwart) < 1) return 'Drieklezoor';
  return 'Rest';
}

function fixRowEdgePieces(rowStrips, kop, stoot, steenL) {
  if (rowStrips.length < 2) return;
  const sorted = [...rowStrips].sort((a, b) => a.x - b.x);
  const driekwart = Math.round((steenL + stoot) * 0.75 - stoot);
  const first = sorted[0];
  if (first.width < kop - 0.5 && first.width > 0.5) {
    for (let i = 1; i < sorted.length; i++) {
      if (Math.abs(sorted[i].width - steenL) < 1) {
        const deficit = kop - first.width;
        const newVolLen = steenL - deficit;
        if (newVolLen >= kop) {
          first.width = kop;
          first.label = 'Kop';
          for (let j = 1; j < i; j++) sorted[j].x = sorted[j].x + deficit;
          sorted[i].x = sorted[i].x + deficit;
          sorted[i].width = newVolLen;
          sorted[i].label = labelForLen(Math.round(newVolLen), steenL, kop, driekwart);
        }
        break;
      }
    }
  }
  const last = sorted[sorted.length - 1];
  if (last.width < kop - 0.5 && last.width > 0.5) {
    for (let i = sorted.length - 2; i >= 0; i--) {
      if (Math.abs(sorted[i].width - steenL) < 1) {
        const deficit = kop - last.width;
        const newVolLen = steenL - deficit;
        if (newVolLen >= kop) {
          sorted[i].width = newVolLen;
          sorted[i].label = labelForLen(Math.round(newVolLen), steenL, kop, driekwart);
          for (let j = i + 1; j < sorted.length - 1; j++) sorted[j].x = sorted[j].x - deficit;
          last.x = last.x - deficit;
          last.width = kop;
          last.label = 'Kop';
        }
        break;
      }
    }
  }
}

function getPanelStripsAnnotated(panel, facadeRows, verband, mat, koppelstripSet = null) {
  const stripH = verband === 'staand_tegelverband' ? mat.steenL : mat.steenH;
  const steenL = mat.steenL ?? 210;
  const stoot = mat.stoot ?? 10;
  const kop = Math.round((steenL - stoot) / 2);
  const driekwart = Math.round((steenL + stoot) * 0.75 - stoot);
  const strips = [];

  if (verband === 'wildverband' && panel.rows) {
    for (const row of panel.rows) {
      const rowH = row.height ?? mat.steenH;
      for (const strip of row.strips) {
        strips.push({ x: strip.x, y: row.y - panel.y, width: strip.width, height: rowH, label: strip.label, koppelstrip: !!strip.koppelstrip });
      }
    }
  } else if (verband === 'wildverband' || verband === 'groothuis_wildverband' || verband === 'groothuis_wildverband_2') {
    // FASE 2: board-paneel zonder eigen rows → clip de gedeelde rijen (facadeRows)
    // naar dit paneel; behoud label + koppelstrip (géén halfsteens-edge-fixups).
    for (const row of facadeRows) {
      if (row.y + stripH <= panel.y + 0.5 || row.y >= panel.y + panel.height - 0.5) continue;
      for (const piece of row.pieces) {
        if (piece.start + piece.length <= panel.x + 0.5 || piece.start >= panel.x + panel.width - 0.5) continue;
        const clipX  = Math.max(piece.start, panel.x) - panel.x;
        const clipX2 = Math.min(piece.start + piece.length, panel.x + panel.width) - panel.x;
        const clipY  = Math.max(piece.yBot ?? row.y, panel.y) - panel.y;                 // STRIP_SNIJLIJN: deel-steen tot de rand
        const clipY2 = Math.min(piece.yTop ?? (row.y + stripH), panel.y + panel.height) - panel.y;
        if (clipX2 - clipX > 0.5 && clipY2 - clipY > 0.5) {
          strips.push({ x: clipX, y: clipY, width: clipX2 - clipX, height: clipY2 - clipY, label: piece.label, koppelstrip: !!piece.koppelstrip });
        }
      }
    }
  } else {
    for (const row of facadeRows) {
      if (row.y + stripH <= panel.y + 0.5 || row.y >= panel.y + panel.height - 0.5) continue;
      const rowStrips = [];
      for (const piece of row.pieces) {
        if (piece.start + piece.length <= panel.x + 0.5 || piece.start >= panel.x + panel.width - 0.5) continue;
        const clipX  = Math.max(piece.start, panel.x) - panel.x;
        const clipX2 = Math.min(piece.start + piece.length, panel.x + panel.width) - panel.x;
        const clipY  = Math.max(piece.yBot ?? row.y, panel.y) - panel.y;                 // STRIP_SNIJLIJN: deel-steen tot de rand
        const clipY2 = Math.min(piece.yTop ?? (row.y + stripH), panel.y + panel.height) - panel.y;
        if (clipX2 - clipX > 0.5 && clipY2 - clipY > 0.5) {
          const len = Math.round(clipX2 - clipX);
          const ksKey = `${Math.round(piece.start)},${Math.round(row.y)},${Math.round(piece.length)}`;
          const isKoppelstrip = koppelstripSet ? koppelstripSet.has(ksKey) : false;
          rowStrips.push({ x: clipX, y: clipY, width: clipX2 - clipX, height: clipY2 - clipY, label: labelForLen(len, steenL, kop, driekwart), koppelstrip: isKoppelstrip });
        }
      }
      if (verband !== 'staand_tegelverband') {
        fixRowEdgePieces(rowStrips, kop, stoot, steenL);
      }
      for (const s of rowStrips) strips.push(s);
    }
  }

  const counts = {};
  for (const s of strips) {
    if (s.koppelstrip) continue;
    const len = Math.round(s.width);
    const key = `${s.label}:${len}`;
    counts[key] = (counts[key] ?? { label: s.label, len, n: 0 });
    counts[key].n++;
  }
  return { strips, counts: Object.values(counts).sort((a, b) => b.n - a.n || a.len - b.len) };
}

const PAD_LEFT   = 145;
const PAD_RIGHT  = 60;
const PAD_TOP    = 60;
const PAD_BOTTOM = 70;
const DIM_GAP    = 28;
const ARROW_SIZE = 4;
const FONT_DIM   = 9;
const FONT_LBL   = 8;

function mm(v) { return Math.round(v); }
function m(v)  { return (v / 1000).toFixed(3); }

function getStripsForPanel(panel, facadeRows, verband, mat) {
  const stripH = verband === 'staand_tegelverband' ? mat.steenL : mat.steenH;
  const strips = [];
  for (const row of facadeRows) {
    if (row.y + stripH <= panel.y + 0.5 || row.y >= panel.y + panel.height - 0.5) continue;
    for (const piece of row.pieces) {
      if (piece.start + piece.length <= panel.x + 0.5 || piece.start >= panel.x + panel.width - 0.5) continue;
      const clipX  = Math.max(piece.start, panel.x) - panel.x;
      const clipX2 = Math.min(piece.start + piece.length, panel.x + panel.width) - panel.x;
      const clipY  = Math.max(piece.yBot ?? row.y, panel.y) - panel.y;                 // STRIP_SNIJLIJN: deel-steen tot de rand
      const clipY2 = Math.min(piece.yTop ?? (row.y + stripH), panel.y + panel.height) - panel.y;
      if (clipX2 - clipX > 0.5 && clipY2 - clipY > 0.5) {
        strips.push({ x: clipX, y: clipY, width: clipX2 - clipX, height: clipY2 - clipY, label: piece.label });
      }
    }
  }
  return strips;
}

function arrowHead(x1, y1, x2, y2, size = ARROW_SIZE) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;
  return `M${x2},${y2} L${x2 - ux * size + px * size * 0.4},${y2 - uy * size + py * size * 0.4} L${x2 - ux * size - px * size * 0.4},${y2 - uy * size - py * size * 0.4} Z`;
}

function DimH({ x1, x2, y, label, color = '#1e3a5f', flip = false }) {
  const mid = (x1 + x2) / 2;
  const offset = flip ? 10 : -10;
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={color} strokeWidth={0.6} />
      <path d={arrowHead(x2, y, x1, y)} fill={color} />
      <path d={arrowHead(x1, y, x2, y)} fill={color} />
      <line x1={x1} y1={y - 12} x2={x1} y2={y + 4} stroke={color} strokeWidth={0.4} strokeDasharray="2,2" />
      <line x1={x2} y1={y - 12} x2={x2} y2={y + 4} stroke={color} strokeWidth={0.4} strokeDasharray="2,2" />
      <text x={mid} y={y + offset} textAnchor="middle" fontSize={FONT_DIM} fill={color} fontFamily="Arial, sans-serif">{label}</text>
    </g>
  );
}

function DimV({ x, y1, y2, label, color = '#1e3a5f', side = 'left' }) {
  const mid = (y1 + y2) / 2;
  const textX = side === 'left' ? x - 5 : x + 5;
  const anchor = side === 'left' ? 'end' : 'start';
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={color} strokeWidth={0.6} />
      <path d={arrowHead(x, y2, x, y1)} fill={color} />
      <path d={arrowHead(x, y1, x, y2)} fill={color} />
      <line x1={x - 10} y1={y1} x2={x + 4} y2={y1} stroke={color} strokeWidth={0.4} strokeDasharray="2,2" />
      <line x1={x - 10} y1={y2} x2={x + 4} y2={y2} stroke={color} strokeWidth={0.4} strokeDasharray="2,2" />
      <text x={textX} y={mid} textAnchor={anchor} dominantBaseline="middle" fontSize={FONT_DIM} fill={color} fontFamily="Arial, sans-serif" transform={`rotate(-90,${textX},${mid})`}>{label}</text>
    </g>
  );
}

function computeLatten(facadeData, panelen, latten, mat, penanten, startLijn, verband, backingType) {
  const _bt = backingType ?? 'hout';
  if (!facadeData || !latten?.enabled || _bt === 'aluminium' || _bt === 'aluminium_slimfort') return [];
  const { groupWidth, groupHeight, groupOpenings } = facadeData;
  const richting = latten.richting ?? 'horizontaal';
  const latBreedte = Math.max(5, latten.breedte ?? 50);
  const MAX_HOC = latten.maxInterval ?? 400;

  const PENANT_PANEL_INSET = 20;
  let allPanels = [];
  if (panelen?.enabled) {
    const basePanel = computeEffectiveBasePanel(panelen, mat.brickWeightM2 ?? 40, mat);
    const battenYs = generateBattenPositions(groupHeight, mat, MAX_HOC, { minHOH: latten?.minHOH, maxHOH: latten?.maxHOH, targetPanelH: panelen?.hoogte, minPanelH: 800 });
    const openingsForZones = groupOpenings.map((op) => ({ id: `op_${op.x}_${op.y}`, x: op.x, y: op.y, width: op.width, height: op.height, polyPts: op.polyPts ?? null }));
    const penantOpenings = (penanten ?? []).map((p, i) => {
      const px = (p.x ?? 0) + PENANT_PANEL_INSET;
      const pw = Math.max(1, p.breedte ?? 400) - 2 * PENANT_PANEL_INSET;
      if (pw <= 0) return null;
      return { id: `pen_${i}`, x: px, y: 0, width: pw, height: groupHeight, polyPts: null };
    }).filter(Boolean);
    {
      const zones = buildFacadeZones(groupWidth, groupHeight, [...openingsForZones, ...penantOpenings]);
      for (const zone of zones) {
        const res = panelizeZone(zone, battenYs, basePanel, null, mat, verband ?? 'halfsteens');
        if (res.ok) allPanels.push(...res.panels);
      }
      allPanels = mergeStackedColumns(allPanels, [...openingsForZones, ...penantOpenings], basePanel);
    }
  }

  if (richting === 'horizontaal') {
    const rawLatten = computeHorizontalLatten({ facadeData, latten, mat, panelen, startLijn, backingType: _bt, verband });
    if (!rawLatten.length) return rawLatten;

    const INSET = 5;
    const result = [];
    let globalIdx = 0;
    for (const lat of rawLatten) {
      if (lat.forced) {
        result.push({ ...lat, id: `lat-h-${globalIdx++}` });
        continue;
      }
      const latTop = lat.y, latBot = lat.y + lat.height;
      const openingsAtY = groupOpenings.filter((op) => op.y < latBot && op.y + op.height > latTop);
      let zones = [];
      if (openingsAtY.length === 0) {
        zones.push({ x1: 0, x2: groupWidth });
      } else {
        const opRanges = openingsAtY.flatMap((op) => openingXRangesAtY(op, latTop, latBot)).sort((a, b) => a.x1 - b.x1);
        let cursor = 0;
        for (const op of opRanges) {
          if (op.x1 > cursor) zones.push({ x1: cursor, x2: op.x1 });
          cursor = Math.max(cursor, op.x2);
        }
        if (cursor < groupWidth) zones.push({ x1: cursor, x2: groupWidth });
      }
      for (const zone of zones) {
        let x1 = zone.x1, x2 = zone.x2;
        if (allPanels.length > 0) {
          const panelsInZone = allPanels.filter((p) => p.y < latBot && p.y + p.height > latTop && p.x + p.width > zone.x1 && p.x < zone.x2);
          if (panelsInZone.length > 0) {
            x1 = Math.min(...panelsInZone.map((p) => p.x)) + INSET;
            x2 = Math.max(...panelsInZone.map((p) => p.x + p.width)) - INSET;
          }
        }
        if (x2 <= x1) continue;
        result.push({ ...lat, id: `lat-h-${globalIdx++}`, x: x1, width: x2 - x1 });
      }
    }
    return result;
  } else {
    const xPositions = new Set([0, groupWidth]);
    for (const p of allPanels) { xPositions.add(Math.round(p.x)); xPositions.add(Math.round(p.x + p.width / 2)); xPositions.add(Math.round(p.x + p.width)); }
    return [...xPositions].sort((a, b) => a - b).map((x, idx) => {
      const lx1 = x - latBreedte / 2;
      const pen = (penanten ?? []).find((p) => {
        const px1 = p.x ?? 0;
        const px2 = px1 + Math.max(1, p.breedte ?? 400);
        return lx1 + latBreedte > px1 + 5 && lx1 < px2 - 5;
      });
      const latH = pen ? Math.max(1, pen.hoogte ?? 2000) : groupHeight;
      return { id: `lat-v-${idx}`, richting: 'verticaal', x: lx1, y: 0, width: latBreedte, height: latH, forced: false };
    });
  }
}

export function Werktekening({ walls, sharedFacadeData = null, groupSettings, groupName, panelen, latten, groupMinH, penantFaceData, zoneSettings, stripZones = [], sparingElements = [], sparingOffset = 0, epcSettings, outsideDirFlip, cornerTrimLeft = 0, cornerTrimRight = 0, cornerExtendLeft = 0, cornerExtendRight = 0, lattenTrimLeft = 0, lattenTrimRight = 0, lattenExtendLeft = 0, lattenExtendRight = 0, panelsTrimLeft = 0, panelsTrimRight = 0, panelsExtendLeft = 0, panelsExtendRight = 0 }) {
  const svgRef = useRef(null);
  const summarySvgRef = useRef(null);
  const productiePrintRef = useRef(null);
  const [drawingType, setDrawingType] = useState('achterconstructie');
  const [productieGenerated, setProductieGenerated] = useState(false);
  const [selectedZoneIdx, setSelectedZoneIdx] = useState(-1);
  const [tekenZone, setTekenZone] = useState({ enabled: false, x: 0, y: 0, width: null, height: null });

  const _rawMat = groupSettings?.material ?? { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
  // UNIFIED_PANELS: pas het steenstrip-artikel toe op de maat (net als App/2D) → strips, panelen én
  // labels (kop/strek) consistent op de artikel-steen. Vlag uit → rauwe groep-maat (byte-identiek).
  const _wtMatArt = isUnifiedPanels() ? STEENSTRIP_CATALOG.find((a) => a.id === (groupSettings?.steenstripsArtikelen ?? [])[0]) : null;
  const mat     = _wtMatArt ? { ..._rawMat, steenL: _wtMatArt.steenL, steenH: _wtMatArt.steenH } : _rawMat;
  const verband = groupSettings?.verband ?? 'halfsteens';
  const maxH    = groupSettings?.maxHoogte ?? null;

  const epcProjectNr = epcSettings?.projectNummer ?? groupSettings?.epcProjectNummer ?? '00000';
  const epcLevel     = epcSettings?.level ?? groupSettings?.epcLevel ?? 0;

  function makeEpcId(zone, seqNr, panelType) {
    const zoneStr = (zone.label ?? 'Z1').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const ss = zoneStr.slice(0, 2).padStart(2, '-');
    const se = zoneStr.slice(2, 4).padStart(2, '-');
    return generatePaneelId('P', epcProjectNr, epcLevel, ss, se, seqNr, panelType ?? 'V');
  }

  const facadeData = useMemo(() => {
    if (!walls?.length) return null;
    // UNIFIED_PANELS: normale verbanden gebruiken ÉÉN bron — de facadeData van App (2D/3D), gebouwd mét
    // het steenstrip-artikel + kozijn-offset + edge-stagger → strips zijn overal gelijk. Blanco (geen
    // verband)/groothuis/wildverband houden hun eigen pad (die verwerken de rijen apart, hieronder).
    const _isSpecialFd = isBlankBaseVerband(verband) || verband === 'wildverband' || verband === 'groothuis_wildverband' || verband === 'groothuis_wildverband_2';
    if (isUnifiedPanels() && sharedFacadeData && !_isSpecialFd) return sharedFacadeData;
    const fd = buildFullGroupFacadePattern(walls, mat, verband, maxH, null, groupSettings?.startLijn, cornerExtendLeft, cornerExtendRight, null, null, groupSettings?.maxHoogteVullen);
    // GEEN_VERBAND: basis blanco; de getekende zones leveren de strips. rows = de zone-regio-rijen
    // (union) zodat getPanelStripsAnnotated per paneel de zone-strips toont; coverageRows = solide
    // dekking (mortelvoegen dicht) voor de zone-clip. Geen actieve zones → volledig blanco.
    if (fd && isBlankBaseVerband(verband)) {
      const az = (stripZones ?? []).filter((z) => z?.enabled === true);
      const cov = solidifyRows(fd.rows, (mat.stoot ?? 10) + 2);
      const regions = az.length ? buildStripZoneRegions({ ...fd, coverageRows: cov }, az, mat, verband, groupSettings?.color ?? '#a64033', {}) : null;
      const zoneRows = regions ? regions.flatMap((r) => r.rows ?? []) : [];
      return { ...fd, coverageRows: cov, rows: zoneRows };
    }
    // FASE 2 — wildverband-strips uit het vastgelegde tegel-verband (zelfde bron als 2D/3D/IFC).
    // Vlag UIT → exact het bestaande pad (byte-identiek).
    if (fd && verband === 'wildverband' && isWildverbandKoppelstrip()) {
      const _tr = buildTruthRows(fd.groupWidth, fd.groupHeight, mat, fd.groupOpenings ?? []);
      return { ...fd, rows: _tr.rows };
    }
    if (fd && verband === 'groothuis_wildverband' && isGroothuisWildverband()) {
      const _gr = buildGroothuisRows(fd.groupWidth, fd.groupHeight, mat, fd.groupOpenings ?? []);
      return { ...fd, rows: _gr.rows };
    }
    if (fd && verband === 'groothuis_wildverband_2' && isGroothuisWildverband2()) {
      const _gr = buildGroothuis2Rows(fd.groupWidth, fd.groupHeight, mat, fd.groupOpenings ?? []);
      return { ...fd, rows: _gr.rows };
    }
    return fd;
  }, [walls, mat, verband, maxH, groupSettings?.startLijn, cornerExtendLeft, cornerExtendRight, stripZones, sharedFacadeData]);

  // SPARING-ELEMENTEN: rechthoeken in HET EIGEN facadeData-frame (geen mismatch met App/best-fit).
  const sparingRects = useMemo(
    () => sparingRectsForFacade(facadeData, sparingElements, sparingOffset),
    [facadeData, sparingElements, sparingOffset]
  );

  const allPanels = useMemo(() => {
    if (!facadeData || !panelen?.enabled) return [];
    // GEEN_VERBAND: draagpanelen volgen de getekende zones.
    if (isBlankBaseVerband(verband)) {
      return buildZoneBackingPanels({ facadeData, activeZones: (stripZones ?? []).filter((z) => z?.enabled === true), panelen, latten, mat, verband, startLijn: groupSettings?.startLijn, sparingRects });
    }
    const { rows, groupWidth, groupHeight, groupOpenings } = facadeData;
    // UNIFIED_PANELS (vlag, default AAN): non-wild verband → gedeelde motor (congruent met 2D/3D/export/meetstaat).
    const _isWildWt = verband === 'wildverband' || (verband === 'groothuis_wildverband' && isGroothuisWildverband()) || (verband === 'groothuis_wildverband_2' && isGroothuisWildverband2());
    if (isUnifiedPanels() && !_isWildWt) {
      const _wtSid = (groupSettings?.steenstripsArtikelen ?? [])[0];
      const _wtArt = _wtSid ? STEENSTRIP_CATALOG.find((a) => a.id === _wtSid) : null;
      return buildGroupPanels({ groupWidth, groupHeight, groupOpenings, rows, penanten: groupSettings?.penanten, baseMat: mat, stripArt: _wtArt, panelen, latten, verband, sparingRects, startLijn: groupSettings?.startLijn, endExtensions: groupSettings?.endExtensions }).panels;
    }
    const basePanel = computeEffectiveBasePanel(panelen, mat.brickWeightM2 ?? 40, mat);
    const maxInterval = Math.max(50, latten?.maxInterval ?? 400);
    const lintHalf = (mat.lint ?? 12) / 2;
    const clampToGroup = (y) => Math.min(groupHeight, Math.max(0, y));
    const allRowYsSorted = (rows ?? []).map((r) => r.y).sort((a, b) => a - b);
    const snapToRowY = (y) => {
      if (!allRowYsSorted.length) return y;
      const target = y + lintHalf;
      return allRowYsSorted.reduce((best, ry) => Math.abs(ry - target) < Math.abs(best - target) ? ry : best);
    };
    const baseBattenYs = generateBattenPositions(groupHeight, mat, maxInterval, { minHOH: latten?.minHOH, maxHOH: latten?.maxHOH, targetPanelH: panelen?.hoogte, minPanelH: 800 });
    const battenYs = baseBattenYs.map(snapToRowY);
    const openingsForZones = groupOpenings.map((op) => ({ id: `op_${op.x}_${op.y}`, x: op.x, y: op.y, width: op.width, height: op.height, polyPts: op.polyPts ?? null }));
    const INSET = 20;
    const penantOpenings = (groupSettings?.penanten ?? []).map((p, i) => {
      const px = (p.x ?? 0) + INSET;
      const pw = Math.max(1, p.breedte ?? 400) - 2 * INSET;
      if (pw <= 0) return null;
      return { id: `pen_${i}`, x: px, y: 0, width: pw, height: groupHeight, polyPts: null };
    }).filter(Boolean);
    let panels = [];
    if (verband === 'wildverband' && isWildverbandKoppelstrip()) {
      // FASE 2: board-panelen op de truth-steek (zonder eigen .rows) → getPanelStripsAnnotated
      // vult ze met het gedeelde truth-verband (facadeData.rows). Rand = kaarsrecht.
      const _tr = buildTruthRows(groupWidth, groupHeight, mat, groupOpenings);
      const rowsPerPanel = panelen?.rowsPerPanel ?? 12;
      const panelH = rowsPerPanel * _tr.lagenmaat;
      for (let px = 0; px < groupWidth - 0.5; px += _tr.pitch) {
        const w = Math.min(_tr.boardWidth, groupWidth - px);
        for (let py = 0; py < groupHeight - 0.5; py += panelH) {
          const h = Math.min(panelH, groupHeight - py);
          panels.push({ id: `wv_${Math.round(px)}_${Math.round(py)}`, x: px, y: py, width: w, height: h, type: px < 0.5 ? 'start' : 'volg', rowBase: Math.round(py / _tr.lagenmaat) });
        }
      }
    } else if (verband === 'groothuis_wildverband' && isGroothuisWildverband()) {
      // board-panelen op de groothuis-layout (vol met 2500 + restpaneel), zonder eigen .rows →
      // getPanelStripsAnnotated vult ze met de gedeelde groothuis-rijen (facadeData.rows).
      const _gr = buildGroothuisRows(groupWidth, groupHeight, mat, groupOpenings);
      const rowsPerPanel = Math.max(1, Math.floor(2500 / _gr.lagenmaat));
      const panelH = rowsPerPanel * _gr.lagenmaat;
      for (const gp of _gr.panels) {
        for (let py = 0; py < groupHeight - 0.5; py += panelH) {
          const h = Math.min(panelH, groupHeight - py);
          panels.push({ id: `gh_${Math.round(gp.x)}_${Math.round(py)}`, x: gp.x, y: py, width: gp.w, height: h, type: 'groothuis' });
        }
      }
    } else if (verband === 'groothuis_wildverband_2' && isGroothuisWildverband2()) {
      // board-panelen op de groothuis-2-layout (vol met 2500 + restpaneel), zonder eigen .rows →
      // getPanelStripsAnnotated vult ze met de gedeelde groothuis-2-rijen (facadeData.rows).
      const _gr = buildGroothuis2Rows(groupWidth, groupHeight, mat, groupOpenings);
      const rowsPerPanel = Math.max(1, Math.floor(2500 / _gr.lagenmaat));
      const panelH = rowsPerPanel * _gr.lagenmaat;
      for (const gp of _gr.panels) {
        for (let py = 0; py < groupHeight - 0.5; py += panelH) {
          const h = Math.min(panelH, groupHeight - py);
          panels.push({ id: `gh2_${Math.round(gp.x)}_${Math.round(py)}`, x: gp.x, y: py, width: gp.w, height: h, type: 'groothuis' });
        }
      }
    } else if (verband === 'wildverband') {
      const wRes = buildWildverbandPanelGrid(groupWidth, groupHeight, groupOpenings, mat, panelen ?? {});
      panels = wRes.panels;
    } else {
      const zones = buildFacadeZones(groupWidth, groupHeight, [...openingsForZones, ...penantOpenings]);
      for (const zone of zones) {
        const res = panelizeZone(zone, battenYs, basePanel, allRowYsSorted.length ? snapToRowY : null, mat, verband);
        if (res.ok) panels.push(...res.panels);
      }
      // PANEEL_OPTIMALISATIE: gestapelde panelen in één kolom samenvoegen (P6+P7); vlag uit → no-op.
      panels = mergeStackedColumns(panels, [...openingsForZones, ...penantOpenings], basePanel);
    }
    panels = panels.filter((panel) => panel.height >= 200 && panel.width >= 10);
    if (verband !== 'wildverband') {
      const rowH = verband === 'staand_tegelverband' ? mat.steenL : mat.steenH;
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
    }
    // SPARING-ELEMENTEN: paneel HEEL houden + het gat markeren (panel.holes) voor frees/zagerij.
    panels = attachHolesToPanels(panels, sparingRects);
    const startLijn = groupSettings?.startLijn;
    if (startLijn != null && startLijn < 0 && panels.length > 0) {
      const minY = Math.min(...panels.map((p) => p.y));
      return panels.map((p) => p.y <= minY + 0.5 ? { ...p, y: startLijn, height: p.height + p.y - startLijn } : p);
    }
    return panels;
  }, [facadeData, panelen, mat, groupSettings, latten, verband, sparingRects, stripZones]);

  const penanten = groupSettings?.penanten ?? [];
  const allLatten = useMemo(() => (
    isBlankBaseVerband(verband)                 // GEEN_VERBAND: latten volgen de zone-panelen, geklipt op de zones
      ? clipLattenToZones(buildFacadeLatten({ facadeData, latten, mat, panelen, panels: allPanels, penanten: [], startLijn: groupSettings?.startLijn ?? null, verband, backingType: groupSettings?.backingType ?? 'hout', sparingRects }), (stripZones ?? []).filter((z) => z?.enabled === true))
    : isUnifiedLatten()
      ? buildFacadeLatten({ facadeData, latten, mat, panelen, panels: allPanels, penanten, startLijn: groupSettings?.startLijn ?? null, verband, backingType: groupSettings?.backingType ?? 'hout', sparingRects, endExtensions: groupSettings?.endExtensions })
      : computeLatten(facadeData, panelen, latten, mat, penanten, groupSettings?.startLijn ?? null, verband, groupSettings?.backingType ?? 'hout')
  ), [facadeData, panelen, latten, mat, penanten, groupSettings, verband, allPanels, sparingRects, stripZones]);

  const wallGroupPolysRaw = useMemo(() => {
    if (!walls?.length) return [];
    const minL = Math.min(...walls.map(w => w.wallOrigin?.lengthStart ?? 0));
    const minH0 = Math.min(...walls.map(w => w.wallOrigin?.heightStart ?? 0));
    const perWall = walls.map(w => {
      if (!w.facadePoly || w.facadePoly.length < 3) return null;
      const offL = (w.wallOrigin?.lengthStart ?? 0) - minL;
      const offH = (w.wallOrigin?.heightStart ?? 0) - minH0;
      return w.facadePoly.map(pt => ({ l: pt.l + offL, h: pt.h + offH }));
    }).filter(Boolean);
    if (perWall.length && facadeData) {
      const { groupWidth: gw, groupHeight: gh } = facadeData;
      const sl = groupSettings?.startLijn ?? 0;
      const minH = sl < 0 ? sl : 0;
      return [[ { l: 0, h: minH }, { l: gw, h: minH }, { l: gw, h: gh }, { l: 0, h: gh } ]];
    }
    return perWall;
  }, [walls, facadeData, groupSettings]);

  const clippedPanels = useMemo(() => {
    if (!wallGroupPolysRaw.length) return null;
    return allPanels.map(p => clipPanelToFacadePolys(p, wallGroupPolysRaw)).filter(Boolean);
  }, [allPanels, wallGroupPolysRaw]);

  const koppelstrippen = useMemo(() => {
    if (!facadeData || !allPanels.length) return [];
    return detectKoppelstrippen(allPanels, facadeData.rows ?? [], mat, verband);
  }, [facadeData, allPanels, mat, verband]);

  const koppelstripSet = useMemo(() => {
    return new Set(koppelstrippen.map(k => `${Math.round(k.x)},${Math.round(k.y)},${Math.round(k.width)}`));
  }, [koppelstrippen]);

  if (!facadeData) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 13 }}>
        Geen gegevens beschikbaar voor werktekening
      </div>
    );
  }

  const { groupWidth, groupHeight, groupOpenings } = facadeData;

  const facadeZones = computeZoneBounds(penanten, groupWidth);
  const selectedZone = selectedZoneIdx >= 0 && selectedZoneIdx < facadeZones.length ? facadeZones[selectedZoneIdx] : null;

  const tzX = tekenZone.enabled ? (tekenZone.x ?? 0) : null;
  const tzW = tekenZone.enabled ? (tekenZone.width ?? groupWidth) : null;
  const tzY = tekenZone.enabled ? (tekenZone.y ?? 0) : null;
  const tzH = tekenZone.enabled ? (tekenZone.height ?? groupHeight) : null;

  const viewXStart = tzX != null ? tzX : (selectedZone ? selectedZone.xStart : 0);
  const viewXEnd   = tzX != null ? tzX + tzW : (selectedZone ? selectedZone.xEnd : groupWidth);
  const viewYStart = tzY != null ? tzY : 0;
  const viewYEnd   = tzY != null ? tzY + tzH : groupHeight;
  const viewW_mm   = Math.max(1, viewXEnd - viewXStart);
  const viewH_mm   = Math.max(1, viewYEnd - viewYStart);

  const activeZoneLabel = tekenZone.enabled ? 'Teken zone' : selectedZone?.label ?? null;

  const effectivePanels = clippedPanels ?? allPanels;
  const zonePanels = effectivePanels.filter((p) =>
    p.x + p.width > viewXStart + 1 && p.x < viewXEnd - 1 &&
    p.y + p.height > viewYStart + 1 && p.y < viewYEnd - 1
  ).sort((a, b) => (a.y - b.y) || (a.x - b.x));  // P-nummering: per rij links→rechts, dan een rij hoger

  // PANEEL_MERK: groep-breed merk-nr per UNIEK paneeltype (maat+strippatroon+gaten, dezelfde signatuur als
  // de productielijst), in montage-volgorde. ALTIJD berekend (klantkeuze: één nummering) → de tekening
  // "Panelen plaatsing" ÉN "Paneel productie" tonen HETZELFDE merk per paneel, zodat P{merk} in beide op
  // hetzelfde fysieke paneeltype wijst (het gat-paneel is uniek → uniek merk). De EPC/meetstaat-Merk-KOLOM
  // blijft achter de vlag isPaneelMerk(). Plain const (geen hook) → raakt de hook-volgorde niet.
  const paneelMerkMap = (() => {
    const sigOf = (panel) => {
      const { strips } = getPanelStripsAnnotated(panel, facadeData.rows, verband, mat, koppelstripSet);
      const stripSig = strips.map((s) => `${s.label}:${Math.round(s.width)}:${Math.round(s.x)}:${Math.round(s.y)}:${s.koppelstrip ? 'K' : ''}`).join('|');
      const holeSig = (panel.holes ?? []).map((h) => `${Math.round(h.x - panel.x)}:${Math.round(h.y - panel.y)}:${Math.round(h.width)}:${Math.round(h.height)}`).join(',');
      return `${Math.round(panel.width)}x${Math.round(panel.height)}|${panel.type ?? ''}|${stripSig}|H:${holeSig}`;
    };
    // PANEEL_MERK_PER_ZONE (vlag): bij >1 penant-zone telt de nummering NIET door — elke zone eigen P1.. + eigen
    // telling. Vlag uit of 1 zone → groep-brede doorlopende nummering (byte-identiek).
    const perZone = isPaneelMerkPerZone() && facadeZones.length > 1;
    const zoneIdxOf = (panel) => {
      const cx = panel.x + panel.width / 2;
      const z = facadeZones.find((zn) => cx >= zn.xStart - 1 && cx < zn.xEnd + 1);
      return z ? z.idx : 0;
    };
    const pk = (p) => `${Math.round(p.x)}_${Math.round(p.y)}`;
    const posToMerk = new Map(), posToZone = new Map(), merkCount = new Map();
    if (perZone) {
      const byZone = new Map();   // zoneIdx → { sigToMerk, next }
      const sorted = [...effectivePanels].sort((a, b) => (zoneIdxOf(a) - zoneIdxOf(b)) || (a.y - b.y) || (a.x - b.x));
      for (const panel of sorted) {
        const zi = zoneIdxOf(panel);
        if (!byZone.has(zi)) byZone.set(zi, { sig: new Map(), next: 1 });
        const zst = byZone.get(zi);
        const sig = sigOf(panel);
        if (!zst.sig.has(sig)) zst.sig.set(sig, zst.next++);
        const m = zst.sig.get(sig);
        posToMerk.set(pk(panel), m); posToZone.set(pk(panel), zi);
        merkCount.set(`${zi}:${m}`, (merkCount.get(`${zi}:${m}`) ?? 0) + 1);
      }
    } else {
      const sorted = [...effectivePanels].sort((a, b) => (a.y - b.y) || (a.x - b.x));
      const sigToMerk = new Map(); let next = 1;
      for (const panel of sorted) {
        const sig = sigOf(panel);
        if (!sigToMerk.has(sig)) sigToMerk.set(sig, next++);
        const m = sigToMerk.get(sig);
        posToMerk.set(pk(panel), m);
        merkCount.set(`${m}`, (merkCount.get(`${m}`) ?? 0) + 1);
      }
    }
    return {
      get: (p) => posToMerk.get(pk(p)) ?? null,
      count: (p) => { const m = posToMerk.get(pk(p)); if (m == null) return 0; return merkCount.get(perZone ? `${posToZone.get(pk(p))}:${m}` : `${m}`) ?? 0; },
    };
  })();
  const paneelMerkLabel = (p) => { const m = paneelMerkMap?.get(p); return m != null ? `P${m}` : ''; };
  const zoneLatten = allLatten.filter((l) =>
    l.x + l.width > viewXStart + 1 && l.x < viewXEnd - 1 &&
    l.y + l.height > viewYStart + 1 && l.y < viewYEnd - 1
  );
  const zoneKoppelstrippen = koppelstrippen.filter((k) =>
    k.x + k.width > viewXStart + 1 && k.x < viewXEnd - 1 &&
    k.y + k.height > viewYStart + 1 && k.y < viewYEnd - 1
  );
  const zoneOpenings = groupOpenings.filter((op) => {
    const x1 = op.polyPts?.length >= 3 ? Math.min(...op.polyPts.map((p) => p.l)) : op.x;
    const x2 = op.polyPts?.length >= 3 ? Math.max(...op.polyPts.map((p) => p.l)) : op.x + op.width;
    const y1 = op.polyPts?.length >= 3 ? Math.min(...op.polyPts.map((p) => p.h)) : op.y;
    const y2 = op.polyPts?.length >= 3 ? Math.max(...op.polyPts.map((p) => p.h)) : op.y + op.height;
    return x2 > viewXStart + 1 && x1 < viewXEnd - 1 && y2 > viewYStart + 1 && y1 < viewYEnd - 1;
  });

  const VIEW_W = 960;
  const drawW = VIEW_W - PAD_LEFT - PAD_RIGHT;
  const MAX_DRAW_H = 1400;
  const scale  = Math.min(drawW / viewW_mm, MAX_DRAW_H / viewH_mm);

  const W = viewW_mm * scale;
  const H = viewH_mm * scale;
  const VIEW_H = PAD_TOP + Math.ceil(H) + PAD_BOTTOM;
  const OX = PAD_LEFT + (drawW - W) / 2;
  const OY = PAD_TOP;

  const sx = (x, w = 0) => outsideDirFlip
    ? OX + W - (x - viewXStart + w) * scale
    : OX + (x - viewXStart) * scale;
  const sy = (y) => OY + H - (y - viewYStart) * scale;

  const dimColor    = '#1e3a5f';
  const panelColor  = '#bfdbfe';
  const latColor    = '#fde68a';
  const openColor   = '#fca5a5';

  const hasWallPolys = wallGroupPolysRaw.length > 0;

  const facadeShapePath = hasWallPolys
    ? wallGroupPolysRaw.map(poly =>
        poly.map((pt, i) => `${i === 0 ? 'M' : 'L'}${sx(pt.l)},${sy(pt.h)}`).join(' ') + ' Z'
      ).join(' ')
    : `M${OX},${OY} h${W} v${H} h${-W} Z`;

  const peilmatenBase = groupMinH ?? 0;

  const xBreaks = [...new Set([viewXStart, viewXEnd, ...zonePanels.map((p) => p.x), ...zonePanels.map((p) => p.x + p.width)])].filter((x) => x >= viewXStart - 1 && x <= viewXEnd + 1).sort((a, b) => a - b);
  const yBreaks = [...new Set([viewYStart, viewYEnd, ...zonePanels.map((p) => p.y), ...zonePanels.map((p) => p.y + p.height)])].filter((y) => y >= viewYStart - 1 && y <= viewYEnd + 1).sort((a, b) => a - b);
  const latYs   = [...new Set(zoneLatten.filter((l) => l.richting === 'horizontaal').map((l) => Math.round(l.y + l.height)))].sort((a, b) => a - b);

  const dimRowY   = OY + H + 28;
  const dimRow2Y  = dimRowY + DIM_GAP;
  const peilLineX  = OX - 110;
  const dimVSpanX  = OX - 65;
  const dimVTotalX = OX - 32;

  const lattenRichting = zoneLatten.length ? (zoneLatten[0].richting ?? 'horizontaal') : 'horizontaal';
  const lattenSummary = (() => {
    const groups = {};
    for (const l of zoneLatten) {
      const len = Math.round(lattenRichting === 'horizontaal' ? l.width : l.height);
      groups[len] = (groups[len] ?? 0) + 1;
    }
    return Object.entries(groups)
      .sort((a, b) => b[1] - a[1])
      .map(([len, cnt]) => ({ len: Number(len), cnt }));
  })();
  const summaryLines = zoneLatten.length ? lattenSummary.length + 2 : 0;
  const SUMMARY_LINE_H = 13;
  const SUMMARY_PAD = 8;
  const summaryBoxH = summaryLines > 0 ? summaryLines * SUMMARY_LINE_H + SUMMARY_PAD * 2 : 0;
  const LEGEND_H = 28;

  const svgTotal = VIEW_H + 16 + LEGEND_H;

  function exportSvg() {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const xml = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([xml], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `werktekening_${(groupName ?? 'groep').replace(/\s/g, '_')}.svg`; a.click();
    URL.revokeObjectURL(url);
  }

  function exportPrint() {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const xml = new XMLSerializer().serializeToString(svgEl);
    const summaryEl = summarySvgRef.current;
    const summaryXml = summaryEl ? new XMLSerializer().serializeToString(summaryEl) : '';
    const page2 = summaryXml ? `<div style="page-break-before:always;padding-top:16px">${summaryXml}</div>` : '';
    const w = window.open('', '_blank');
    if (!w) {
      alert('Sta pop-ups toe voor deze pagina om af te drukken.');
      return;
    }
    w.document.write(`<!DOCTYPE html><html><head><title>Werktekening ${groupName}</title><style>body{margin:0;padding:16px;background:#fff} svg{max-width:100%;height:auto} @media print{body{padding:0}}</style></head><body>${xml}${page2}<script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  }

  function exportPrintProductie() {
    const container = productiePrintRef.current;
    if (!container) return;
    const svgs = container.querySelectorAll('svg');
    if (!svgs.length) return;
    const svgXmls = Array.from(svgs).map((s) => new XMLSerializer().serializeToString(s)).join('<br style="page-break-after:always">');
    const w = window.open('', '_blank');
    if (!w) {
      alert('Sta pop-ups toe voor deze pagina om af te drukken.');
      return;
    }
    w.document.write(`<!DOCTYPE html><html><head><title>Paneeltekeningen ${groupName}</title><style>body{margin:0;padding:12px;background:#fff;display:flex;flex-wrap:wrap;gap:12px} svg{border:1px solid #ccc;border-radius:4px;page-break-inside:avoid} @media print{body{padding:4px}}</style></head><body>${svgXmls}<script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  }

  function exportZaaglijst() {
    const brickW2 = mat?.brickWeightM2 ?? 40;
    const rows = [];
    let globalSeq = 1;
    const zonesForExport = facadeZones;
    for (const zone of zonesForExport) {
      const panelsInZone = allPanels.filter((p) => p.x + p.width > zone.xStart + 1 && p.x < zone.xEnd - 1);
      for (const panel of panelsInZone) {
        const paneelId = makeEpcId(zone, globalSeq++);
        const { counts } = getPanelStripsAnnotated(panel, facadeData.rows, verband, mat, koppelstripSet);
        const areaM2 = (panel.width * panel.height) / 1e6;
        const gewichtKg = Math.round(areaM2 * brickW2 * 10) / 10;
        const countMap = {};
        for (const c of counts) countMap[c.label + '_' + c.len] = c.n;
        const volCount      = counts.filter(c => c.label === 'Strek').reduce((s, c) => s + c.n, 0);
        const kopCount      = counts.filter(c => c.label === 'Kop').reduce((s, c) => s + c.n, 0);
        const drieKwartCount = counts.filter(c => c.label === 'Drieklezoor').reduce((s, c) => s + c.n, 0);
        const halveCount    = counts.filter(c => c.label === 'Halve').reduce((s, c) => s + c.n, 0);
        const restCount     = counts.filter(c => c.label === 'Rest').reduce((s, c) => s + c.n, 0);
        const totalStrips   = counts.reduce((s, c) => s + c.n, 0);
        rows.push({
          PaneelID_EPC: paneelId,
          PaneelID_Leesbaar: formatEpcDisplay(paneelId),
          ...(isPaneelMerk() ? { Merk: paneelMerkLabel(panel) } : {}),
          Projectnummer: epcProjectNr,
          Level: String(epcLevel).padStart(2, '0'),
          Zone: zone.label,
          X_mm: Math.round(panel.x),
          Y_mm: Math.round(panel.y),
          Breedte_mm: Math.round(panel.width),
          Hoogte_mm: Math.round(panel.height),
          Oppervlak_m2: areaM2.toFixed(3),
          Gewicht_kg: gewichtKg,
          Verband: verband,
          Strips_Totaal: totalStrips,
          Strips_Strek: volCount,
          Strips_Kop: kopCount,
          Strips_Drieklezoor: drieKwartCount,
          Strips_Halve: halveCount,
          Strips_Rest: restCount,
        });
      }
    }
    if (!rows.length) { alert('Geen panelen beschikbaar voor export.'); return; }
    const headers = Object.keys(rows[0]);
    const csvLines = [headers.join(';'), ...rows.map(r => headers.map(h => String(r[h] ?? '')).join(';'))];
    if (koppelstrippen.length > 0) {
      csvLines.push('');
      csvLines.push('PaneelID_EPC;PaneelID_Leesbaar;Projectnummer;Level;Zone;X_mm;Y_mm;Breedte_mm;Hoogte_mm;Oppervlak_m2;Gewicht_kg;Verband;Strips_Totaal;Strips_Strek;Strips_Kop;Strips_Drieklezoor;Strips_Halve;Strips_Rest');
      csvLines.push(`KOPPELSTRIPS;Koppelstrippen (op locatie);${epcProjectNr};${String(epcLevel).padStart(2,'0')};-;-;-;-;-;-;-;${verband};${koppelstrippen.length};${koppelstrippen.filter(k=>k.label==='Strek').length};${koppelstrippen.filter(k=>k.label==='Kop').length};${koppelstrippen.filter(k=>k.label==='Drieklezoor').length};${koppelstrippen.filter(k=>k.label==='Halve').length};${koppelstrippen.filter(k=>k.label==='Rest').length}`);
    }
    const blob = new Blob([csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zaaglijst_${(groupName ?? 'groep').replace(/\s/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#f1f5f9' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: '#fff', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#1e3a5f', flex: 1 }}>
          Werktekening — {groupName ?? 'Groep'}
        </span>
        {drawingType === 'zaaglijst' ? (
          <button onClick={exportZaaglijst} style={{ fontSize: 11, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>⬇ Export CSV</button>
        ) : drawingType === 'productie' ? (productieGenerated && (
          <button onClick={exportPrintProductie} style={{ fontSize: 11, background: '#0f172a', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>🖨 Afdrukken panelen</button>
        )) : drawingType === 'penanten' ? (
          <button onClick={() => {
            const container = document.getElementById('penanten-print-container');
            if (!container) return;
            const svgs = container.querySelectorAll('svg');
            if (!svgs.length) return;
            const xmls = Array.from(svgs).map((s) => new XMLSerializer().serializeToString(s)).join('<div style="page-break-after:always"></div>');
            const w = window.open('', '_blank');
            if (!w) { alert('Sta pop-ups toe voor deze pagina.'); return; }
            w.document.write(`<!DOCTYPE html><html><head><title>Penanten ${groupName}</title><style>body{margin:0;padding:12px;background:#fff} svg{max-width:100%;height:auto;display:block;margin-bottom:16px} @media print{body{padding:4px}}</style></head><body>${xmls}<script>window.onload=()=>window.print()<\/script></body></html>`);
            w.document.close();
          }} style={{ fontSize: 11, background: '#0f172a', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>🖨 Afdrukken penanten</button>
        ) : <>
          <button onClick={exportSvg} style={{ fontSize: 11, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>⬇ SVG</button>
          <button onClick={exportPrint} style={{ fontSize: 11, background: '#0f172a', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>🖨 Afdrukken</button>
        </>}
      </div>

      <div style={{ display: 'flex', gap: 0, background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
        {[
          { key: 'achterconstructie', label: '1. Achterconstructie' },
          { key: 'plaatsing',         label: '2. Panelen plaatsing' },
          { key: 'productie',         label: '3. Paneel productie' },
          ...((groupSettings?.penanten ?? []).length > 0 ? [{ key: 'penanten', label: '4. Penanten' }] : []),
          { key: 'zaaglijst',         label: '5. Zaaglijst' },
          { key: 'maltekening',       label: '6. Maltekening' },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setDrawingType(key)} style={{
            padding: '6px 14px', fontSize: 11, fontWeight: drawingType === key ? 700 : 400,
            background: drawingType === key ? '#fff' : 'transparent',
            border: 'none', borderBottom: drawingType === key ? '2px solid #2563eb' : '2px solid transparent',
            color: drawingType === key ? '#2563eb' : '#64748b', cursor: 'pointer',
          }}>{label}</button>
        ))}
      </div>

      {facadeZones.length > 1 && !tekenZone.enabled && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', flexShrink: 0, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 4 }}>Zone:</span>
          <button
            onClick={() => setSelectedZoneIdx(-1)}
            style={{ padding: '2px 10px', fontSize: 10, fontWeight: selectedZoneIdx === -1 ? 700 : 400, background: selectedZoneIdx === -1 ? '#2563eb' : '#e2e8f0', color: selectedZoneIdx === -1 ? '#fff' : '#475569', border: 'none', borderRadius: 3, cursor: 'pointer' }}
          >Alle zones</button>
          {facadeZones.map((z) => (
            <button key={z.idx} onClick={() => setSelectedZoneIdx(z.idx)}
              style={{ padding: '2px 10px', fontSize: 10, fontWeight: selectedZoneIdx === z.idx ? 700 : 400, background: selectedZoneIdx === z.idx ? '#2563eb' : '#e2e8f0', color: selectedZoneIdx === z.idx ? '#fff' : '#475569', border: 'none', borderRadius: 3, cursor: 'pointer' }}
            >{z.label} ({mm(z.xEnd - z.xStart)} mm)</button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', background: tekenZone.enabled ? '#fefce8' : '#f8fafc', borderBottom: '1px solid #e2e8f0', flexShrink: 0, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: '#713f12', cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={tekenZone.enabled} onChange={(e) => setTekenZone((z) => ({ ...z, enabled: e.target.checked }))} />
          Teken zone
        </label>
        {tekenZone.enabled && (
          <>
            {[
              { label: 'X (mm)', key: 'x', fallback: 0 },
              { label: 'Y (mm)', key: 'y', fallback: 0 },
              { label: 'Breedte (mm)', key: 'width', fallback: groupWidth },
              { label: 'Hoogte (mm)', key: 'height', fallback: groupHeight },
            ].map(({ label, key, fallback }) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#713f12' }}>
                {label}:
                <input
                  type="number"
                  value={tekenZone[key] ?? fallback}
                  onChange={(e) => setTekenZone((z) => ({ ...z, [key]: Number(e.target.value) }))}
                  style={{ width: 68, fontSize: 10, padding: '1px 4px', border: '1px solid #ca8a04', borderRadius: 3 }}
                />
              </label>
            ))}
            <button
              onClick={() => setTekenZone({ enabled: true, x: 0, y: 0, width: groupWidth, height: groupHeight })}
              style={{ fontSize: 9, padding: '2px 7px', border: '1px solid #ca8a04', borderRadius: 3, cursor: 'pointer', background: 'none', color: '#713f12' }}
            >Reset</button>
          </>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: drawingType === 'productie' ? 8 : 16 }}>

        {drawingType === 'penanten' && (() => {
          const pens = groupSettings?.penanten ?? [];
          if (!pens.length) return <div style={{ color: '#64748b', fontSize: 13, padding: 20 }}>Geen penanten geconfigureerd.</div>;

          const PAD_L = 100; const PAD_R = 50; const PAD_T = 50; const PAD_B = 160;
          const MAX_UNFOLD_W = 860; const MAX_UNFOLD_H = 480;
          const color = groupSettings?.color ?? '#a64033';

          const svgs = [];

          const penGroups = new Map();
          pens.forEach((p, idx) => {
            const key = `${Math.max(1, p.breedte ?? 400)}-${Math.max(1, p.diepteLinks ?? p.diepte ?? 150)}-${Math.max(1, p.diepteRechts ?? p.diepte ?? 150)}-${Math.max(1, p.hoogte ?? 2000)}`;
            if (!penGroups.has(key)) penGroups.set(key, { firstIdx: idx, count: 0 });
            penGroups.get(key).count++;
          });

          pens.forEach((p, idx) => {
            const penKey = `${Math.max(1, p.breedte ?? 400)}-${Math.max(1, p.diepteLinks ?? p.diepte ?? 150)}-${Math.max(1, p.diepteRechts ?? p.diepte ?? 150)}-${Math.max(1, p.hoogte ?? 2000)}`;
            const penGroup = penGroups.get(penKey);
            if (penGroup.firstIdx !== idx) return;
            const penCount = penGroup.count;
            const aantalLabel = penCount > 1 ? ` · ${penCount}× te maken` : '';
            const pB = Math.max(1, p.breedte ?? 400);
            const pDL = Math.max(1, p.diepteLinks  ?? p.diepte ?? 150);
            const pDR = Math.max(1, p.diepteRechts ?? p.diepte ?? 150);
            const pH = Math.max(1, p.hoogte ?? 2000);
            const maxKg = p.maxKg ?? 50;
            const brickDepth = groupSettings?.brickDepth ?? 20;
            const selStripId = (groupSettings?.steenstripsArtikelen ?? [])[0] ?? null;
            const selStrip = selStripId ? STEENSTRIP_CATALOG.find((a) => a.id === selStripId) : null;
            const panelGewichtM2 = groupSettings?.panelen?.gewichtM2 ?? 9.4;
            const stripGewichtM2 = mat.brickWeightM2 ?? 40;
            const gewichtM2 = panelGewichtM2 + stripGewichtM2;
            const gewichtBron = selStrip
              ? `paneel ${panelGewichtM2} kg/m²  +  strip ${stripGewichtM2} kg/m² (${selStrip.naam} ${selStrip.formatCode})  =  ${gewichtM2} kg/m²`
              : `paneel ${panelGewichtM2} kg/m²  +  strip ${stripGewichtM2} kg/m² (uit materiaalinstellingen)  =  ${gewichtM2} kg/m²`;
            const stootWT = p.stoot ?? mat.stoot ?? 10;
            const panelDikteWT = groupSettings?.panelen?.dikte ?? 8;
            const sidePanelDepthL = Math.max(1, pDL - brickDepth - stootWT);
            const sidePanelDepthR = Math.max(1, pDR - brickDepth - stootWT);
            const stripOmtrekPerMM = (pB + sidePanelDepthL + sidePanelDepthR) / 1e6;
            const kgPerMM = stripOmtrekPerMM * gewichtM2;
            const maxSectieH = kgPerMM > 0 ? Math.floor(maxKg / kgPerMM) : pH;
            const aantalSecties = kgPerMM > 0 ? Math.ceil(pH / maxSectieH) : 1;
            const sectieH = aantalSecties > 0 ? Math.round(pH / aantalSecties) : pH;
            const hp = p.hoekprofiel ?? {};
            const vl = p.verticaleLat ?? {};
            const vlEnabled = vl.enabled !== false;
            const vlD = vl.dikte ?? 50;
            const vlB = vl.breedte ?? 90;
            const hpEnabled = hp.enabled !== false;
            const hpD = hp.dikte ?? 2;

            const physDepthL = pDL + brickDepth + stootWT + panelDikteWT;
            const physDepthR = pDR + brickDepth + stootWT + panelDikteWT;
            const totalUnfoldW = physDepthL + pB + physDepthR;
            const sc = Math.min((MAX_UNFOLD_W - PAD_L - PAD_R) / totalUnfoldW, (MAX_UNFOLD_H - PAD_T - PAD_B) / pH);
            const dW = Math.round(totalUnfoldW * sc);
            const dH = Math.round(pH * sc);
            const svgW = Math.max(dW + PAD_L + PAD_R, 820);
            const svgH = dH + PAD_T + PAD_B;
            const ox = PAD_L; const oy = PAD_T;

            const ux = (x) => ox + x * sc;
            const uy = (y) => oy + dH - y * sc;
            const leftX = 0; const frontX = physDepthL; const rightX = physDepthL + pB;

            const sectionYs = [];
            for (let s = 0; s <= aantalSecties; s++) sectionYs.push(Math.round(Math.min(s * sectieH, pH)));

            const faceData = (penantFaceData ?? []).find((fd) => fd.penant.id === p.id);
            const sideClipOffWT = Math.max(stootWT, panelDikteWT);
            const clipSideLeft = (rows, spd) => rows.map((row) => ({
              ...row,
              pieces: row.pieces.flatMap((pc) => {
                const clipEnd = spd - sideClipOffWT;
                if (pc.start >= clipEnd) return [];
                if (pc.start + pc.length <= clipEnd) return [pc];
                return [{ ...pc, length: Math.round((clipEnd - pc.start) * 100) / 100 }];
              }),
            })).filter((row) => row.pieces.length > 0);
            const clipSideRight = (rows) => rows.map((row) => ({
              ...row,
              pieces: row.pieces.flatMap((pc) => {
                if (pc.start + pc.length <= sideClipOffWT) return [];
                if (pc.start >= sideClipOffWT) return [pc];
                const newStart = Math.round(sideClipOffWT * 100) / 100;
                return [{ ...pc, start: newStart, length: Math.round((pc.start + pc.length - newStart) * 100) / 100 }];
              }),
            })).filter((row) => row.pieces.length > 0);
            const localLeftRows = clipSideLeft(buildFacePattern(sidePanelDepthL, pH, mat, verband), sidePanelDepthL);
            const localRightRows = clipSideRight(buildFacePattern(sidePanelDepthR, pH, mat, verband));

            (() => {
              const stoot = mat.stoot ?? 10;
              const hpD_cs = (p.hoekprofiel?.enabled !== false) ? (p.hoekprofiel?.dikte ?? 2) : 0;
              const panelDikte_cs = groupSettings?.panelen?.dikte ?? 8;
              const sideClipOffset = Math.max(stoot, panelDikte_cs);
              const stripDepthL_cs = Math.max(1, pDL + brickDepth);
              const stripDepthR_cs = Math.max(1, pDR + brickDepth);
              const panelDepthL_cs = Math.max(1, pDL + brickDepth + stoot + panelDikte_cs);
              const panelDepthR_cs = Math.max(1, pDR + brickDepth + stoot + panelDikte_cs);
              const pDmax_cs = Math.max(pDL, pDR);
              const zijPaneelMax = Math.max(panelDepthL_cs, panelDepthR_cs) + stoot;
              const frontPanelW_cs = Math.max(0, pB - 2 * brickDepth);
              const innerClearW_cs = Math.max(0, frontPanelW_cs - 2 * panelDikte_cs);

              const CSW = 720; const CSH = 310;
              const pad = { t: 62, b: 56, l: 64, r: 64 };
              const drawW = CSW - pad.l - pad.r;
              const drawH = CSH - pad.t - pad.b;

              const totalCSW = pB;
              const totalCSH = brickDepth + panelDikte_cs + zijPaneelMax + stoot + 14;
              const scH = drawH / totalCSH;
              const scW = drawW / totalCSW;
              const sc2 = Math.min(scH, scW);

              const bd2  = brickDepth * sc2;
              const sv2  = stoot * sc2;
              const pT   = panelDikte_cs * sc2;
              const pB2  = pB * sc2;
              const fpW2 = innerClearW_cs * sc2;
              const sDL2 = stripDepthL_cs * sc2;
              const sDR2 = stripDepthR_cs * sc2;
              const pDL2 = panelDepthL_cs * sc2;
              const pDR2 = panelDepthR_cs * sc2;
              const zij2 = zijPaneelMax * sc2;
              const hp2  = hpD_cs * sc2;
              const clip2 = sideClipOffset * sc2;

              const cx = CSW / 2;
              const buitenY = pad.t + bd2;
              const fpTopY  = buitenY;
              const fpBotY  = fpTopY + pT;
              const sideBot = fpBotY + zij2;
              const gevelY  = sideBot;

              const fpL = cx - fpW2 / 2;
              const fpR = cx + fpW2 / 2;

              const lPanelR = fpL;
              const lPanelL = fpL - pT;
              const lStripL = lPanelL - bd2;

              const rPanelL = fpR;
              const rPanelR = fpR + pT;
              const rStripR = rPanelR + bd2;

              const svgTop = pad.t - bd2 - 4;

              svgs.push(
                <svg key={`cs-${p.id ?? idx}`} width={CSW} height={CSH}
                  viewBox={`0 0 ${CSW} ${CSH}`}
                  style={{ background: '#fff', border: '1px solid #93c5fd', borderRadius: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', display: 'block' }}
                  xmlns="http://www.w3.org/2000/svg">

                  <text x={cx} y={16} textAnchor="middle" fontSize={9.5} fontWeight="bold" fill="#1e3a5f" fontFamily="Arial, sans-serif">
                    {`Penant ${idx + 1} — dwarsdoorsnede U-vorm (bovenaanzicht)${aantalLabel}`}
                  </text>
                  <text x={cx} y={27} textAnchor="middle" fontSize={7} fill="#64748b" fontFamily="Arial, sans-serif">
                    {`Voorzijde strips = ${mm(pB)} mm  ·  Voorzijde paneel = ${mm(frontPanelW_cs)} mm  ·  Links: ${mm(panelDepthL_cs)} mm (${mm(pDL)}+strip+sv+pd)  ·  Rechts: ${mm(panelDepthR_cs)} mm (${mm(pDR)}+strip+sv+pd)  ·  Strip: ${mm(brickDepth)} mm`}
                  </text>
                  <text x={cx} y={37} textAnchor="middle" fontSize={7} fill="#64748b" fontFamily="Arial, sans-serif">
                    {`Paneeldikte = ${mm(panelDikte_cs)} mm  ·  Clip offset = max(sv, pD) = max(${mm(stoot)}, ${mm(panelDikte_cs)}) = ${mm(sideClipOffset)} mm`}
                  </text>

                  <text x={cx} y={svgTop + 4} textAnchor="middle" fontSize={7} fill="#94a3b8" fontFamily="Arial, sans-serif">▲ BUITEN</text>
                  <text x={cx} y={gevelY + 16} textAnchor="middle" fontSize={7} fill="#94a3b8" fontFamily="Arial, sans-serif">▼ GEVEL</text>

                  {/* Linkerzijde strip - start ONDER voorzijdestrip + stootvoeg gap */}
                  <rect x={lStripL} y={fpTopY + sv2} width={bd2} height={pT + sDL2 - sv2} fill="#fef3c7" stroke="#d97706" strokeWidth={0.8} />

                  {/* Rechterzijde strip - start ONDER voorzijdestrip + stootvoeg gap */}
                  <rect x={rPanelR} y={fpTopY + sv2} width={bd2} height={pT + sDR2 - sv2} fill="#fef3c7" stroke="#d97706" strokeWidth={0.8} />

                  {/* Stootvoeg hoek L: witte gap tussen voorzijdestrip en zijstrip */}
                  <rect x={lStripL} y={fpTopY} width={bd2} height={sv2} fill="#fff" stroke="#d97706" strokeWidth={0.5} strokeDasharray="2,2" />
                  {/* Stootvoeg hoek R */}
                  <rect x={rPanelR} y={fpTopY} width={bd2} height={sv2} fill="#fff" stroke="#d97706" strokeWidth={0.5} strokeDasharray="2,2" />

                  {/* Linkerzijde paneel - begint ACHTER voorzijde paneel (fpBotY) */}
                  <rect x={lPanelL} y={fpBotY} width={pT} height={pDL2} fill="#e0f2fe" stroke="#1e3a5f" strokeWidth={1} />
                  <rect x={lPanelL} y={fpBotY + pDL2} width={pT} height={sv2} fill="#fff7ed" stroke="#f59e0b" strokeWidth={0.8} strokeDasharray="2,2" />

                  {/* Rechterzijde paneel - begint ACHTER voorzijde paneel */}
                  <rect x={rPanelL} y={fpBotY} width={pT} height={pDR2} fill="#e0f2fe" stroke="#1e3a5f" strokeWidth={1} />
                  <rect x={rPanelL} y={fpBotY + pDR2} width={pT} height={sv2} fill="#fff7ed" stroke="#f59e0b" strokeWidth={0.8} strokeDasharray="2,2" />

                  {/* L-profielen in de binnenhoeken */}
                  {hpD_cs > 0 && <>
                    <rect x={fpL - hp2} y={fpBotY} width={hp2} height={pDL2} fill="#818cf8" fillOpacity={0.7} stroke="#4338ca" strokeWidth={0.5} />
                    <rect x={fpR} y={fpBotY} width={hp2} height={pDR2} fill="#818cf8" fillOpacity={0.7} stroke="#4338ca" strokeWidth={0.5} />
                  </>}

                  {/* Voorzijde paneel - volle breedte (doorlopen, VOOR zijpanelen) */}
                  <rect x={lPanelL} y={fpTopY} width={pB2 - 2 * bd2} height={pT} fill="#dbeafe" stroke="#3b82f6" strokeWidth={1.2} />

                  {/* Voorzijde strips - als LAATSTE tekenen zodat ze voor de zijstrips liggen */}
                  <rect x={lStripL} y={fpTopY - bd2} width={rStripR - lStripL} height={bd2} fill="#fef3c7" stroke="#d97706" strokeWidth={0.8} />


                  {/* Geen-strip zone op zijpaneel (alleen als clip offset > paneeldikte) */}
                  {clip2 > pT + 0.5 && <>
                    <rect x={lPanelL} y={fpBotY} width={pT} height={clip2 - pT} fill="#fca5a5" fillOpacity={0.4} stroke="#dc2626" strokeWidth={0.4} strokeDasharray="2,2" />
                    <rect x={rPanelL} y={fpBotY} width={pT} height={clip2 - pT} fill="#fca5a5" fillOpacity={0.4} stroke="#dc2626" strokeWidth={0.4} strokeDasharray="2,2" />
                  </>}

                  <line x1={lStripL - 2} y1={fpTopY - bd2 - 1} x2={rStripR + 2} y2={fpTopY - bd2 - 1} stroke="#d97706" strokeWidth={0.5} strokeDasharray="3,3" />

                  {[
                    [lStripL, fpTopY - bd2 - 6, rStripR, fpTopY - bd2 - 6, '#d97706', `strips = ${mm(pB)} mm`],
                    [lPanelL, fpBotY + 8, rPanelR, fpBotY + 8, '#3b82f6', `voorzijde paneel = ${mm(frontPanelW_cs)} mm`],
                    [fpL, gevelY + 6, fpR, gevelY + 6, '#475569', `vrij = ${mm(innerClearW_cs)} mm`],
                  ].map(([x1, y1, x2, y2, color, label], i) => (
                    <g key={i}>
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={0.8} />
                      <line x1={x1} y1={y1 - 3} x2={x1} y2={y1 + 3} stroke={color} strokeWidth={0.8} />
                      <line x1={x2} y1={y1 - 3} x2={x2} y2={y1 + 3} stroke={color} strokeWidth={0.8} />
                      <text x={(x1 + x2) / 2} y={y1 - 3} textAnchor="middle" fontSize={7} fill={color} fontFamily="Arial, sans-serif">{label}</text>
                    </g>
                  ))}

                  {/* Maatlijn: zijpaneel diepte - rechts van het rechter zijpaneel */}
                  <line x1={rStripR + 2} y1={fpBotY} x2={rStripR + 2} y2={fpBotY + pDR2} stroke="#1e3a5f" strokeWidth={0.8} />
                  <line x1={rStripR - 2} y1={fpBotY} x2={rStripR + 6} y2={fpBotY} stroke="#1e3a5f" strokeWidth={0.8} />
                  <line x1={rStripR - 2} y1={fpBotY + pDR2} x2={rStripR + 6} y2={fpBotY + pDR2} stroke="#1e3a5f" strokeWidth={0.8} />
                  <text x={rStripR + 10} y={(fpBotY + fpBotY + pDR2) / 2} textAnchor="start" dominantBaseline="middle" fontSize={7} fill="#1e3a5f" fontFamily="Arial, sans-serif" transform={`rotate(-90,${rStripR + 10},${(fpBotY + fpBotY + pDR2) / 2})`}>{`R paneel = ${mm(panelDepthR_cs)} mm`}</text>

                  {/* Maatlijn: stootvoeg - ook rechts */}
                  <line x1={rStripR + 2} y1={fpBotY + pDR2} x2={rStripR + 2} y2={fpBotY + pDR2 + sv2} stroke="#f59e0b" strokeWidth={0.5} strokeDasharray="3,3" />
                  <text x={rStripR + 6} y={fpBotY + pDR2 + sv2 / 2} textAnchor="start" dominantBaseline="middle" fontSize={6} fill="#b45309" fontFamily="Arial, sans-serif">{`sv ${mm(stoot)}`}</text>

                  <g transform={`translate(18, ${CSH - 40})`}>
                    <rect x={0} y={0} width={10} height={7} fill="#dbeafe" stroke="#3b82f6" strokeWidth={0.8} /><text x={13} y={6} fontSize={6} fill="#334155" fontFamily="Arial, sans-serif">Voorzijde paneel</text>
                    <rect x={100} y={0} width={10} height={7} fill="#e0f2fe" stroke="#1e3a5f" strokeWidth={0.8} /><text x={113} y={6} fontSize={6} fill="#334155" fontFamily="Arial, sans-serif">Zijpaneel</text>
                    <rect x={170} y={0} width={10} height={7} fill="#fef3c7" stroke="#d97706" strokeWidth={0.8} /><text x={183} y={6} fontSize={6} fill="#334155" fontFamily="Arial, sans-serif">{`Strip (${mm(brickDepth)} mm diepte)`}</text>
                    <rect x={280} y={0} width={10} height={7} fill="#fff7ed" stroke="#f59e0b" strokeWidth={0.8} strokeDasharray="2,2" /><text x={293} y={6} fontSize={6} fill="#334155" fontFamily="Arial, sans-serif">{`Stootvoeg ext. (${mm(stoot)} mm)`}</text>
                    <rect x={420} y={0} width={10} height={7} fill="#fca5a5" fillOpacity={0.4} stroke="#dc2626" strokeWidth={0.4} strokeDasharray="2,2" /><text x={433} y={6} fontSize={6} fill="#334155" fontFamily="Arial, sans-serif">{`Geen strip zone (${mm(sideClipOffset)} mm)`}</text>
                    {hpD_cs > 0 && <><rect x={560} y={0} width={10} height={7} fill="#818cf8" fillOpacity={0.7} stroke="#4338ca" strokeWidth={0.5} /><text x={573} y={6} fontSize={6} fill="#334155" fontFamily="Arial, sans-serif">{`L-profiel (${mm(hpD_cs)} mm)`}</text></>}
                    <text x={0} y={18} fontSize={6.5} fill="#475569" fontFamily="Arial, sans-serif">{`Voorzijde strips = ${mm(pB)} mm  ·  Voorzijde paneel = ${mm(frontPanelW_cs)} mm  ·  Zijvlak diepte = uitgroep + strip(${mm(brickDepth)}) + sv(${mm(stoot)}) + pd(${mm(panelDikte_cs)})  ·  Clip offset = ${mm(sideClipOffset)} mm`}</text>
                  </g>
                </svg>
              );
            })();

            svgs.push(
              <svg key={`construct-${p.id ?? idx}`} width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}
                style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', display: 'block' }}
                xmlns="http://www.w3.org/2000/svg">

                <text x={ox} y={18} fontSize={10} fontWeight="bold" fill="#0f172a" fontFamily="Arial, sans-serif">
                  {`Penant ${idx + 1} — uitgeslagen constructie · X=${mm(p.x ?? 0)} mm${aantalLabel}`}
                </text>
                <text x={ox} y={30} fontSize={7.5} fill="#64748b" fontFamily="Arial, sans-serif">
                  Uitgeslagen breedte: {mm(totalUnfoldW)} mm · Hoogte: {mm(pH)} mm · {aantalSecties} U-sectie{aantalSecties !== 1 ? 's' : ''} · ≈{mm(sectieH)} mm/sectie
                </text>

                <rect x={ux(leftX)} y={uy(pH)} width={physDepthL * sc} height={dH} fill="#e0f2fe" stroke="#1e3a5f" strokeWidth={1} />
                {localLeftRows.length > 0 && (() => {
                  const stripH = verband === 'staand_tegelverband' ? mat.steenL : mat.steenH;
                  return localLeftRows.flatMap((row, ri) => {
                    if (row.y + stripH <= 0 || row.y >= pH) return [];
                    return row.pieces.map((pc, pi) => {
                      const clipY1 = Math.max(pc.yBot ?? row.y, 0); const clipY2 = Math.min(pc.yTop ?? (row.y + stripH), pH); // STRIP_SNIJLIJN
                      if (clipY2 - clipY1 < 0.5) return null;
                      const rh = Math.max((clipY2 - clipY1) * sc, 1.5);
                      return <rect key={`ls-${ri}-${pi}`} x={ux(leftX + pc.start)} y={uy(clipY2)} width={Math.max(pc.length * sc, 1)} height={rh} fill={brickColor(pc.label, color)} stroke="rgba(0,0,0,0.25)" strokeWidth={0.3} />;
                    }).filter(Boolean);
                  });
                })()}
                <text x={ux(leftX + physDepthL / 2)} y={uy(pH / 2)} textAnchor="middle" dominantBaseline="middle" fontSize={7} fill="#0369a1" fontFamily="Arial, sans-serif" transform={`rotate(-90,${ux(leftX + physDepthL / 2)},${uy(pH / 2)})`}>LINKERZIJDE</text>

                <rect x={ux(frontX + brickDepth)} y={uy(pH)} width={Math.max(0, pB - 2 * brickDepth) * sc} height={dH} fill="#f8fafc" stroke="#1e3a5f" strokeWidth={1.2} />
                {faceData?.front && (() => {
                  const stripH = verband === 'staand_tegelverband' ? mat.steenL : mat.steenH;
                  return faceData.front.flatMap((row, ri) => {
                    if (row.y + stripH <= 0 || row.y >= pH) return [];
                    return row.pieces.map((pc, pi) => {
                      const clipY1 = Math.max(pc.yBot ?? row.y, 0);                 // STRIP_SNIJLIJN: deel-steen tot de rand
                      const clipY2 = Math.min(pc.yTop ?? (row.y + stripH), pH);
                      if (clipY2 - clipY1 < 0.5) return null;
                      const rx = ux(frontX + pc.start);
                      const ry = uy(clipY2);
                      const rw = pc.length * sc;
                      const rh = (clipY2 - clipY1) * sc;
                      return (
                        <g key={`fs-${ri}-${pi}`}>
                          <rect x={rx} y={ry} width={rw} height={rh} fill={brickColor(pc.label, color)} stroke="rgba(0,0,0,0.2)" strokeWidth={0.3} />
                          {rw > 12 && rh > 5 && (
                            <text x={rx + rw / 2} y={ry + rh / 2} textAnchor="middle" dominantBaseline="middle"
                              fontSize={Math.min(5, rh * 0.45)} fill="#000" fontFamily="Arial, sans-serif">{pc.label}</text>
                          )}
                        </g>
                      );
                    }).filter(Boolean);
                  });
                })()}
                <text x={ux(frontX + pB / 2)} y={uy(pH) - 6} textAnchor="middle" fontSize={8} fontWeight="bold" fill="#1e3a5f" fontFamily="Arial, sans-serif">VOORZIJDE</text>

                <rect x={ux(rightX)} y={uy(pH)} width={physDepthR * sc} height={dH} fill="#e0f2fe" stroke="#1e3a5f" strokeWidth={1} />
                {localRightRows.length > 0 && (() => {
                  const stripH = verband === 'staand_tegelverband' ? mat.steenL : mat.steenH;
                  return localRightRows.flatMap((row, ri) => {
                    if (row.y + stripH <= 0 || row.y >= pH) return [];
                    return row.pieces.map((pc, pi) => {
                      const clipY1 = Math.max(pc.yBot ?? row.y, 0); const clipY2 = Math.min(pc.yTop ?? (row.y + stripH), pH); // STRIP_SNIJLIJN
                      if (clipY2 - clipY1 < 0.5) return null;
                      const rh = Math.max((clipY2 - clipY1) * sc, 1.5);
                      return <rect key={`rs-${ri}-${pi}`} x={ux(rightX + pc.start)} y={uy(clipY2)} width={Math.max(pc.length * sc, 1)} height={rh} fill={brickColor(pc.label, color)} stroke="rgba(0,0,0,0.25)" strokeWidth={0.3} />;
                    }).filter(Boolean);
                  });
                })()}
                <text x={ux(rightX + physDepthR / 2)} y={uy(pH / 2)} textAnchor="middle" dominantBaseline="middle" fontSize={7} fill="#0369a1" fontFamily="Arial, sans-serif" transform={`rotate(-90,${ux(rightX + physDepthR / 2)},${uy(pH / 2)})`}>RECHTERZIJDE</text>

                <line x1={ux(frontX)} y1={uy(pH)} x2={ux(frontX)} y2={uy(0)} stroke="#475569" strokeWidth={0.8} strokeDasharray="4,3" />
                <line x1={ux(rightX)} y1={uy(pH)} x2={ux(rightX)} y2={uy(0)} stroke="#475569" strokeWidth={0.8} strokeDasharray="4,3" />

                {sectionYs.slice(1, -1).map((sy_val, si) => (
                  <g key={si}>
                    <line x1={ux(leftX)} y1={uy(sy_val)} x2={ux(rightX + physDepthR)} y2={uy(sy_val)} stroke="#dc2626" strokeWidth={1} strokeDasharray="6,3" />
                    <text x={ux(rightX + physDepthR) + 4} y={uy(sy_val) + 3} fontSize={7} fill="#dc2626" fontFamily="Arial, sans-serif">U{si + 1}|U{si + 2}</text>
                  </g>
                ))}

                {sectionYs.slice(0, -1).map((sy_val, si) => {
                  const sMid = (sy_val + sectionYs[si + 1]) / 2;
                  return (
                    <text key={si} x={ux(frontX + pB / 2)} y={uy(sMid)} textAnchor="middle" dominantBaseline="middle"
                      fontSize={8} fontWeight="bold" fill="#334155" fontFamily="Arial, sans-serif">U{si + 1}</text>
                  );
                })}

                {vlEnabled && [{ fx: leftX, depth: physDepthL }, { fx: rightX, depth: physDepthR }].map(({ fx, depth }, fi) => (
                  <g key={fi}>
                    <rect x={fi === 0 ? ux(fx + depth - vlD) : ux(fx)} y={uy(pH)} width={vlD * sc} height={dH} fill="#92400e" fillOpacity={0.3} stroke="#92400e" strokeWidth={0.5} />
                    <text x={fi === 0 ? ux(fx + depth - vlD / 2) : ux(fx + vlD / 2)} y={uy(pH) - 4} textAnchor="middle" fontSize={6} fill="#92400e" fontFamily="Arial, sans-serif">{mm(vlD)}</text>
                  </g>
                ))}

                {hpEnabled && [
                  { fx: frontX, corner: 'tl' }, { fx: frontX + pB - hpD, corner: 'tr' },
                ].map(({ fx, corner }) => (
                  <g key={corner}>
                    <rect x={ux(fx)} y={uy(pH)} width={hpD * sc} height={dH} fill="#6366f1" fillOpacity={0.6} stroke="#4338ca" strokeWidth={0.5} />
                  </g>
                ))}

                <DimH x1={ux(frontX)} x2={ux(rightX)} y={uy(0) + 22} label={`strips ${mm(pB)} mm`} />
                <DimH x1={ux(leftX)} x2={ux(frontX)} y={uy(0) + 38} label={`${mm(physDepthL)} mm`} flip />
                <DimH x1={ux(rightX)} x2={ux(rightX + physDepthR)} y={uy(0) + 38} label={`${mm(physDepthR)} mm`} flip />
                <DimH x1={ux(leftX)} x2={ux(rightX + physDepthR)} y={uy(0) + 56} label={`${mm(totalUnfoldW)} mm`} />
                <DimV x={ox - 20} y1={uy(pH)} y2={uy(0)} label={`${mm(pH)} mm`} side="left" />

                {sectionYs.slice(1, -1).map((sy_val, si) => (
                  <DimV key={si} x={ox - 50} y1={uy(sectionYs[si])} y2={uy(sy_val)} label={`${mm(sy_val - sectionYs[si])} mm`} side="left" />
                ))}
                {aantalSecties > 0 && (
                  <DimV x={ox - 50} y1={uy(sectionYs[aantalSecties - 1])} y2={uy(pH)} label={`${mm(pH - sectionYs[aantalSecties - 1])} mm`} side="left" />
                )}

                {(() => {
                  const calcX = ox;
                  const calcY = uy(0) + 68;
                  const stripOmtrek = pB + sidePanelDepthL + sidePanelDepthR;
                  const gPerMM = kgPerMM * 1000;
                  return (
                    <g fontFamily="Arial, sans-serif" fontSize={9} fill="#334155">
                      <text x={calcX} y={calcY} fontWeight="bold" fill="#0f172a" fontSize={10}>Gewichtsberekening (U-sectie opdeling):</text>
                      <text x={calcX} y={calcY + 14}>{`Stripgewicht bron: ${gewichtBron}`}</text>
                      <text x={calcX} y={calcY + 27}>{`Voorzijde: ${mm(pB)} mm  +  links: ${mm(sidePanelDepthL)} mm  +  rechts: ${mm(sidePanelDepthR)} mm  =  strip-omtrek: ${mm(stripOmtrek)} mm`}</text>
                      <text x={calcX} y={calcY + 40}>{`Gewicht/mm hoogte: ${mm(stripOmtrek)} mm × ${gewichtM2} kg/m²  =  ${gPerMM.toFixed(2)} g/mm  →  max sectie: ⌊${maxKg} kg ÷ ${kgPerMM.toFixed(5)} kg/mm⌋ = ${maxSectieH} mm`}</text>
                      <text x={calcX} y={calcY + 54} fontWeight="bold" fill="#1e3a5f" fontSize={10}>{`Resultaat: ${aantalSecties} sectie${aantalSecties !== 1 ? 's' : ''} van ca. ${mm(sectieH)} mm  (totale hoogte: ${mm(pH)} mm)`}</text>
                    </g>
                  );
                })()}

                <g transform={`translate(${ox},${svgH - 20})`}>
                  <rect x={0} y={0} width={10} height={7} fill="#e0f2fe" stroke="#1e3a5f" strokeWidth={0.5} />
                  <text x={13} y={6.5} fontSize={6.5} fill="#334155" fontFamily="Arial, sans-serif">Zijvlak (diepte)</text>
                  <rect x={80} y={0} width={10} height={7} fill="#f8fafc" stroke="#1e3a5f" strokeWidth={0.5} />
                  <text x={93} y={6.5} fontSize={6.5} fill="#334155" fontFamily="Arial, sans-serif">Voorzijde</text>
                  {vlEnabled && <><rect x={150} y={0} width={10} height={7} fill="#92400e" fillOpacity={0.3} stroke="#92400e" strokeWidth={0.5} /><text x={163} y={6.5} fontSize={6.5} fill="#334155" fontFamily="Arial, sans-serif">Vert. lat {mm(vlB)}×{mm(vlD)}</text></>}
                  {hpEnabled && <><rect x={260} y={0} width={10} height={7} fill="#6366f1" fillOpacity={0.6} stroke="#4338ca" strokeWidth={0.5} /><text x={273} y={6.5} fontSize={6.5} fill="#334155" fontFamily="Arial, sans-serif">Alu. L {mm(hpD)}mm</text></>}
                  <line x1={350} y1={3.5} x2={370} y2={3.5} stroke="#dc2626" strokeWidth={1} strokeDasharray="4,2" />
                  <text x={373} y={6.5} fontSize={6.5} fill="#334155" fontFamily="Arial, sans-serif">U-sectie grens</text>
                </g>
              </svg>
            );

            (() => {
              const frontPanelW_panel = Math.max(0, pB - 2 * brickDepth);
              const panelTotalW = physDepthL + frontPanelW_panel + physDepthR;
              const scP = Math.min((MAX_UNFOLD_W - PAD_L - PAD_R) / panelTotalW, (MAX_UNFOLD_H - PAD_T - PAD_B) / pH);
              const pdW = Math.round(panelTotalW * scP);
              const pdH = Math.round(pH * scP);
              const psvgW = Math.max(pdW + PAD_L + PAD_R, 820);
              const psvgH = pdH + PAD_T + PAD_B;
              const pOx = PAD_L;
              const px = (x) => pOx + x * scP;
              const py = (y) => PAD_T + pdH - y * scP;
              const pLeftX = 0;
              const pFrontX = physDepthL;
              const pRightX = physDepthL + frontPanelW_panel;
              const pEndX = panelTotalW;

              svgs.push(
                <svg key={`panel-${p.id ?? idx}`} width={psvgW} height={psvgH} viewBox={`0 0 ${psvgW} ${psvgH}`}
                  style={{ background: '#fff', border: '1px solid #93c5fd', borderRadius: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', display: 'block' }}
                  xmlns="http://www.w3.org/2000/svg">

                  <text x={pOx} y={18} fontSize={10} fontWeight="bold" fill="#0f172a" fontFamily="Arial, sans-serif">
                    {`Penant ${idx + 1} — paneel afmetingen (uitgeslagen)${aantalLabel}`}
                  </text>
                  <text x={pOx} y={30} fontSize={7.5} fill="#64748b" fontFamily="Arial, sans-serif">
                    {`Links: ${mm(physDepthL)} mm  ·  Voorzijde: ${mm(frontPanelW_panel)} mm  ·  Rechts: ${mm(physDepthR)} mm  ·  Totaal: ${mm(panelTotalW)} mm  ·  Hoogte: ${mm(pH)} mm`}
                  </text>

                  <rect x={px(pLeftX)} y={py(pH)} width={physDepthL * scP} height={pdH} fill="#dbeafe" stroke="#1e3a5f" strokeWidth={1.2} />
                  <text x={px(pLeftX + physDepthL / 2)} y={py(pH / 2)} textAnchor="middle" dominantBaseline="middle" fontSize={8} fontWeight="bold" fill="#1e3a5f" fontFamily="Arial, sans-serif" transform={`rotate(-90,${px(pLeftX + physDepthL / 2)},${py(pH / 2)})`}>LINKERPANEEL</text>

                  <rect x={px(pFrontX)} y={py(pH)} width={frontPanelW_panel * scP} height={pdH} fill="#e0f2fe" stroke="#1e3a5f" strokeWidth={1.2} />
                  <text x={px(pFrontX + frontPanelW_panel / 2)} y={py(pH) - 6} textAnchor="middle" fontSize={8} fontWeight="bold" fill="#1e3a5f" fontFamily="Arial, sans-serif">VOORPANEEL</text>

                  <rect x={px(pRightX)} y={py(pH)} width={physDepthR * scP} height={pdH} fill="#dbeafe" stroke="#1e3a5f" strokeWidth={1.2} />
                  <text x={px(pRightX + physDepthR / 2)} y={py(pH / 2)} textAnchor="middle" dominantBaseline="middle" fontSize={8} fontWeight="bold" fill="#1e3a5f" fontFamily="Arial, sans-serif" transform={`rotate(-90,${px(pRightX + physDepthR / 2)},${py(pH / 2)})`}>RECHTERPANEEL</text>

                  <line x1={px(pFrontX)} y1={py(pH)} x2={px(pFrontX)} y2={py(0)} stroke="#64748b" strokeWidth={1} strokeDasharray="5,3" />
                  <line x1={px(pRightX)} y1={py(pH)} x2={px(pRightX)} y2={py(0)} stroke="#64748b" strokeWidth={1} strokeDasharray="5,3" />

                  {sectionYs.slice(1, -1).map((sy_val, si) => (
                    <g key={si}>
                      <line x1={px(pLeftX)} y1={py(sy_val)} x2={px(pEndX)} y2={py(sy_val)} stroke="#dc2626" strokeWidth={1} strokeDasharray="6,3" />
                      <text x={px(pEndX) + 4} y={py(sy_val) + 3} fontSize={7} fill="#dc2626" fontFamily="Arial, sans-serif">U{si + 1}|U{si + 2}</text>
                    </g>
                  ))}

                  {sectionYs.slice(0, -1).map((sy_val, si) => (
                    <text key={si} x={px(pFrontX + frontPanelW_panel / 2)} y={py((sy_val + sectionYs[si + 1]) / 2)} textAnchor="middle" dominantBaseline="middle"
                      fontSize={9} fontWeight="bold" fill="#334155" fontFamily="Arial, sans-serif">U{si + 1}</text>
                  ))}

                  {hpEnabled && <>
                    <rect x={px(pFrontX)} y={py(pH)} width={hpD * scP} height={pdH} fill="#818cf8" fillOpacity={0.7} stroke="#4338ca" strokeWidth={0.5} />
                    <rect x={px(pRightX - hpD)} y={py(pH)} width={hpD * scP} height={pdH} fill="#818cf8" fillOpacity={0.7} stroke="#4338ca" strokeWidth={0.5} />
                  </>}

                  <DimH x1={px(pLeftX)} x2={px(pFrontX)} y={py(0) + 22} label={`${mm(physDepthL)} mm`} />
                  <DimH x1={px(pFrontX)} x2={px(pRightX)} y={py(0) + 22} label={`${mm(frontPanelW_panel)} mm`} />
                  <DimH x1={px(pRightX)} x2={px(pEndX)} y={py(0) + 22} label={`${mm(physDepthR)} mm`} />
                  <DimH x1={px(pLeftX)} x2={px(pEndX)} y={py(0) + 40} label={`${mm(panelTotalW)} mm`} />
                  <DimV x={pOx - 20} y1={py(pH)} y2={py(0)} label={`${mm(pH)} mm`} side="left" />

                  {sectionYs.slice(1, -1).map((sy_val, si) => (
                    <DimV key={si} x={pOx - 50} y1={py(sectionYs[si])} y2={py(sy_val)} label={`${mm(sy_val - sectionYs[si])} mm`} side="left" />
                  ))}
                  {aantalSecties > 0 && (
                    <DimV x={pOx - 50} y1={py(sectionYs[aantalSecties - 1])} y2={py(pH)} label={`${mm(pH - sectionYs[aantalSecties - 1])} mm`} side="left" />
                  )}

                  <g transform={`translate(${pOx},${psvgH - 20})`}>
                    <rect x={0} y={0} width={10} height={7} fill="#dbeafe" stroke="#1e3a5f" strokeWidth={0.8} /><text x={13} y={6.5} fontSize={6.5} fill="#334155" fontFamily="Arial, sans-serif">Zijpaneel</text>
                    <rect x={65} y={0} width={10} height={7} fill="#e0f2fe" stroke="#1e3a5f" strokeWidth={0.8} /><text x={78} y={6.5} fontSize={6.5} fill="#334155" fontFamily="Arial, sans-serif">Voorpaneel</text>
                    {hpEnabled && <><rect x={150} y={0} width={10} height={7} fill="#818cf8" fillOpacity={0.7} stroke="#4338ca" strokeWidth={0.5} /><text x={163} y={6.5} fontSize={6.5} fill="#334155" fontFamily="Arial, sans-serif">{`Alu. L-profiel ${mm(hpD)} mm`}</text></>}
                    <line x1={hpEnabled ? 280 : 150} y1={3.5} x2={hpEnabled ? 300 : 170} y2={3.5} stroke="#64748b" strokeWidth={1} strokeDasharray="4,2" />
                    <text x={hpEnabled ? 303 : 173} y={6.5} fontSize={6.5} fill="#334155" fontFamily="Arial, sans-serif">Vouwlijn</text>
                    <line x1={hpEnabled ? 360 : 230} y1={3.5} x2={hpEnabled ? 380 : 250} y2={3.5} stroke="#dc2626" strokeWidth={1} strokeDasharray="4,2" />
                    <text x={hpEnabled ? 383 : 253} y={6.5} fontSize={6.5} fill="#334155" fontFamily="Arial, sans-serif">U-sectie grens</text>
                  </g>
                </svg>
              );
            })();

            if (faceData) {
              const secSvgs = [];
              sectionYs.slice(0, -1).forEach((secBottom, si) => {
                const secTop = sectionYs[si + 1];
                const secH = secTop - secBottom;
                const secSc = Math.min((MAX_UNFOLD_W - PAD_L - PAD_R) / totalUnfoldW, (MAX_UNFOLD_H - PAD_T - PAD_B) / secH);
                const sdW = Math.round(totalUnfoldW * secSc);
                const sdH = Math.round(secH * secSc);
                const ssvgW = sdW + PAD_L + PAD_R;
                const ssvgH = sdH + PAD_T + PAD_B;
                const sox = PAD_L;
                const sux = (x) => sox + x * secSc;
                const suy = (y) => PAD_T + sdH - (y - secBottom) * secSc;

                secSvgs.push(
                  <svg key={`strip-${p.id ?? idx}-${si}`} width={ssvgW} height={ssvgH} viewBox={`0 0 ${ssvgW} ${ssvgH}`}
                    style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', flexShrink: 0 }}
                    xmlns="http://www.w3.org/2000/svg">
                    <text x={sox} y={18} fontSize={10} fontWeight="bold" fill="#0f172a" fontFamily="Arial, sans-serif">
                      {`Penant ${idx + 1} — U${si + 1} · ${mm(secH)} mm hoog${aantalLabel}`}
                    </text>
                    <text x={sox} y={30} fontSize={7.5} fill="#64748b" fontFamily="Arial, sans-serif">
                      {mm(secBottom)}–{mm(secTop)} mm · {mm(totalUnfoldW)} mm breed · {verband}
                    </text>
                    <rect x={sux(leftX)} y={suy(secTop)} width={physDepthL * secSc} height={sdH} fill="#e0f2fe" stroke="#1e3a5f" strokeWidth={0.7} fillOpacity={0.3} />
                    <text x={sux(leftX + physDepthL / 2)} y={suy(secTop + secH / 2)} textAnchor="middle" dominantBaseline="middle" fontSize={6.5} fill="#0369a1" fontFamily="Arial, sans-serif" transform={`rotate(-90,${sux(leftX + physDepthL / 2)},${suy(secTop + secH / 2)})`}>LINKS</text>
                    <rect x={sux(frontX + brickDepth)} y={suy(secTop)} width={Math.max(0, pB - 2 * brickDepth) * secSc} height={sdH} fill="#f8fafc" stroke="#1e3a5f" strokeWidth={1} fillOpacity={0.4} />
                    <text x={sux(frontX + pB / 2)} y={suy(secTop) - 6} textAnchor="middle" fontSize={8} fontWeight="bold" fill="#1e3a5f" fontFamily="Arial, sans-serif">VOORZIJDE</text>
                    <rect x={sux(rightX)} y={suy(secTop)} width={physDepthR * secSc} height={sdH} fill="#e0f2fe" stroke="#1e3a5f" strokeWidth={0.7} fillOpacity={0.3} />
                    <text x={sux(rightX + physDepthR / 2)} y={suy(secTop + secH / 2)} textAnchor="middle" dominantBaseline="middle" fontSize={6.5} fill="#0369a1" fontFamily="Arial, sans-serif" transform={`rotate(-90,${sux(rightX + physDepthR / 2)},${suy(secTop + secH / 2)})`}>RECHTS</text>
                    <line x1={sux(frontX)} y1={suy(secTop)} x2={sux(frontX)} y2={suy(secBottom)} stroke="#475569" strokeWidth={0.7} strokeDasharray="3,2" />
                    <line x1={sux(rightX)} y1={suy(secTop)} x2={sux(rightX)} y2={suy(secBottom)} stroke="#475569" strokeWidth={0.7} strokeDasharray="3,2" />
                    <DimH x1={sux(leftX)} x2={sux(frontX)} y={suy(secBottom) + 28} label={`${mm(physDepthL)} mm`} />
                    <DimH x1={sux(frontX + brickDepth)} x2={sux(rightX - brickDepth)} y={suy(secBottom) + 28} label={`${mm(Math.max(0, pB - 2 * brickDepth))} mm`} />
                    <DimH x1={sux(rightX)} x2={sux(rightX + physDepthR)} y={suy(secBottom) + 28} label={`${mm(physDepthR)} mm`} />
                    <DimV x={sox - 20} y1={suy(secTop)} y2={suy(secBottom)} label={`${mm(secH)} mm`} side="left" />
                  </svg>
                );
              });
              svgs.push(
                <div key={`secs-${p.id ?? idx}`} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
                  {secSvgs}
                </div>
              );
            }
          });

          return <div id="penanten-print-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{svgs}</div>;
        })()}

        {drawingType === 'productie' && (
          <div>
            {!productieGenerated ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12 }}>
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  Genereer productiematen{selectedZone ? ` voor ${selectedZone.label}` : ' voor alle zones'} ({zonePanels.length} panelen)
                </div>
                <button
                  onClick={() => setProductieGenerated(true)}
                  style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 5, padding: '8px 20px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
                >
                  Genereer paneel tekeningen
                </button>
              </div>
            ) : (() => {
              // Unieke panelen: identieke panelen (zelfde maat + strippatroon) één keer tonen met aantal te produceren.
              const enriched = zonePanels.map((panel, idx) => {
                const { strips, counts } = getPanelStripsAnnotated(panel, facadeData.rows, verband, mat, koppelstripSet);
                const stripSig = strips.map((s) => `${s.label}:${Math.round(s.width)}:${Math.round(s.x)}:${Math.round(s.y)}:${s.koppelstrip ? 'K' : ''}`).join('|');
                // Gaten in de sig → een paneel MÉT gat is een ander uniek paneel dan zonder (frees/zagerij).
                const holeSig = (panel.holes ?? []).map((h) => `${Math.round(h.x - panel.x)}:${Math.round(h.y - panel.y)}:${Math.round(h.width)}:${Math.round(h.height)}`).join(',');
                const sig = `${Math.round(panel.width)}x${Math.round(panel.height)}|${panel.type ?? ''}|${stripSig}|H:${holeSig}`;
                return { panel, idx, strips, counts, sig };
              });
              const groups = new Map();
              enriched.forEach((e) => {
                if (!groups.has(e.sig)) groups.set(e.sig, { firstIdx: e.idx, count: 0 });
                groups.get(e.sig).count++;
              });
              const uniques = enriched.filter((e) => groups.get(e.sig).firstIdx === e.idx);
              return (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '0 4px' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#1e3a5f' }}>
                    {uniques.length} unieke {uniques.length === 1 ? 'paneel' : 'panelen'} · {zonePanels.length} totaal — {groupName ?? 'Groep'}{selectedZone ? ` · ${selectedZone.label}` : ''}
                  </span>
                  <button onClick={() => setProductieGenerated(false)} style={{ fontSize: 11, background: '#e2e8f0', border: 'none', borderRadius: 3, padding: '3px 8px', cursor: 'pointer' }}>Verberg</button>
                </div>
                <div ref={productiePrintRef} style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                  {uniques.map((e, uniqueIdx) => {
                    const { panel, strips, counts } = e;
                    // PANEEL_MERK: gebruik het GROEP-brede merk + telling (1:1 met de montage-Merk-kolom).
                    // Vlag uit → per-zone uniqueSeq + telling (byte-identiek).
                    const _merk = paneelMerkMap?.get(panel);
                    const prodCount = _merk != null ? paneelMerkMap.count(panel) : groups.get(e.sig).count;
                    const uniqueSeq = _merk != null ? _merk : uniqueIdx + 1;
                    const color = groupSettings?.color ?? '#a64033';
                    const PAD = 40;
                    const MAX_DRAW_W = 340;
                    const MAX_DRAW_H = 420;
                    const aspect = panel.height / panel.width;
                    let drawPW = Math.min(MAX_DRAW_W, panel.width * 0.4);
                    let drawPH = drawPW * aspect;
                    if (drawPH > MAX_DRAW_H) { drawPH = MAX_DRAW_H; drawPW = drawPH / aspect; }
                    const sc = drawPW / panel.width;
                    const TABLE_H = Math.min(counts.length * 12 + 28, 120);
                    const CARD_W = drawPW + PAD * 2;
                    const CARD_H = drawPH + PAD * 2 + TABLE_H + 36;
                    const ox = PAD, oy = 48;
                    const px = (x) => ox + x * sc;
                    const py = (y) => oy + (panel.height - y) * sc;
                    return (
                      <svg key={panel.id ?? e.idx} width={CARD_W} height={CARD_H}
                        viewBox={`0 0 ${CARD_W} ${CARD_H}`}
                        style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', flexShrink: 0 }}
                        xmlns="http://www.w3.org/2000/svg">
                        <rect x={CARD_W / 2 - 66} y={3} width={132} height={17} rx={8.5} fill="#1e3a5f" />
                        <text x={CARD_W / 2} y={15} textAnchor="middle" fontSize={10.5} fontWeight="bold" fill="#ffffff" fontFamily="Arial, sans-serif">
                          {prodCount}× te produceren
                        </text>
                        <text x={CARD_W / 2} y={31} textAnchor="middle" fontSize={9} fontWeight="bold" fill="#1e3a5f" fontFamily="Arial, sans-serif">
                          P{uniqueSeq}{selectedZone ? ` · ${selectedZone.label}` : ''} — {mm(panel.width)} × {mm(panel.height)} mm
                        </text>
                        <text x={CARD_W / 2} y={41} textAnchor="middle" fontSize={7} fill="#64748b" fontFamily="Arial, sans-serif">
                          {panel.type === 'start' ? 'Start element' : panel.type === 'eind' ? 'Eind element' : panel.type === 'midden' ? 'Volg element' : panel.type === 'volledig' ? 'Volledig element' : verband} · {strips.length} strips
                        </text>
                        <rect x={ox} y={oy} width={drawPW} height={drawPH} fill="#f8fafc" stroke="#1e3a5f" strokeWidth={1} />
                        {strips.map((s, si) => {
                          const rw = s.width * sc;
                          const rh = s.height * sc;
                          const rx = px(s.x);
                          const ry = py(s.y + s.height);
                          const isKS = !!s.koppelstrip;
                          return (
                            <g key={si}>
                              <rect x={rx} y={ry} width={rw} height={rh}
                                fill={isKS ? '#ffffff' : brickColor(s.label, color)}
                                stroke={isKS ? '#16a34a' : 'rgba(0,0,0,0.2)'}
                                strokeWidth={isKS ? 0.8 : 0.3}
                                strokeDasharray={isKS ? '2,1' : undefined} />
                              {rw > 18 && rh > 7 && !isKS && (
                                <text x={rx + rw / 2} y={ry + rh / 2} textAnchor="middle" dominantBaseline="middle"
                                  fontSize={Math.min(7, rh * 0.55)} fill="#000" fontFamily="Arial, sans-serif">{mm(s.width)}</text>
                              )}
                            </g>
                          );
                        })}
                        {/* SPARING: gat op het hele paneel markeren (rood gestreept + maat) voor frees/zagerij. */}
                        {(panel.holes ?? []).map((h, hi) => {
                          const rx = px(h.x - panel.x);
                          const ry = py((h.y - panel.y) + h.height);
                          const rw = h.width * sc;
                          const rh = h.height * sc;
                          return (
                            <g key={`hole-${hi}`}>
                              <rect x={rx} y={ry} width={rw} height={rh} fill="#fee2e2" stroke="#dc2626" strokeWidth={0.9} strokeDasharray="3,2" />
                              {rw > 22 && rh > 9 && (
                                <text x={rx + rw / 2} y={ry + rh / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(7, rh * 0.5)} fill="#b91c1c" fontFamily="Arial, sans-serif">{mm(h.width)}×{mm(h.height)}</text>
                              )}
                            </g>
                          );
                        })}
                        <text x={ox + drawPW / 2} y={oy - 4} textAnchor="middle" fontSize={7} fill="#334155" fontFamily="Arial, sans-serif">{mm(panel.width)} mm</text>
                        <text x={ox - 5} y={oy + drawPH / 2} textAnchor="middle" fontSize={7} fill="#334155" fontFamily="Arial, sans-serif"
                          transform={`rotate(-90,${ox - 5},${oy + drawPH / 2})`}>{mm(panel.height)} mm</text>
                        <line x1={ox} y1={oy + drawPH + 6} x2={ox + drawPW} y2={oy + drawPH + 6} stroke="#e2e8f0" strokeWidth={0.8} />
                        <text x={ox} y={oy + drawPH + 18} fontSize={7.5} fontWeight="bold" fill="#1e3a5f" fontFamily="Arial, sans-serif">Strippentelling:</text>
                        {counts.slice(0, 8).map(({ label, len, n }, ci) => (
                          <text key={ci} x={ox} y={oy + drawPH + 28 + ci * 11} fontSize={7} fill="#334155" fontFamily="Arial, sans-serif">
                            {n}× {label} {len} mm
                          </text>
                        ))}
                        {counts.length > 8 && (
                          <text x={ox} y={oy + drawPH + 28 + 8 * 11} fontSize={6.5} fill="#94a3b8" fontFamily="Arial, sans-serif">… nog {counts.length - 8} types</text>
                        )}
                      </svg>
                    );
                  })}
                </div>
              </div>
              );
            })()}
          </div>
        )}

        {drawingType === 'zaaglijst' && (() => {
          const brickW2 = mat?.brickWeightM2 ?? 40;
          let globalSeq = 1;
          const tableRows = [];
          for (const zone of facadeZones) {
            const panelsInZone = allPanels.filter((p) => p.x + p.width > zone.xStart + 1 && p.x < zone.xEnd - 1)
              .sort((a, b) => (a.y - b.y) || (a.x - b.x));  // nummering: per rij links→rechts, dan een rij hoger
            for (const panel of panelsInZone) {
              const paneelId = makeEpcId(zone, globalSeq++);
              const { counts } = getPanelStripsAnnotated(panel, facadeData.rows, verband, mat, koppelstripSet);
              const areaM2 = (panel.width * panel.height) / 1e6;
              const gewichtKg = Math.round(areaM2 * brickW2 * 10) / 10;
              const volCount  = counts.filter(c => c.label === 'Strek').reduce((s, c) => s + c.n, 0);
              const kopCount  = counts.filter(c => c.label === 'Kop').reduce((s, c) => s + c.n, 0);
              const dkCount   = counts.filter(c => c.label === 'Drieklezoor').reduce((s, c) => s + c.n, 0);
              const hvCount   = counts.filter(c => c.label === 'Halve').reduce((s, c) => s + c.n, 0);
              const restCount = counts.filter(c => c.label === 'Rest').reduce((s, c) => s + c.n, 0);
              const total     = counts.reduce((s, c) => s + c.n, 0);
              tableRows.push({ paneelId, paneelIdDisplay: formatEpcDisplay(paneelId), merk: paneelMerkLabel(panel), zone: zone.label, breedte: Math.round(panel.width), hoogte: Math.round(panel.height), opp: areaM2.toFixed(3), gewicht: gewichtKg, vol: volCount, kop: kopCount, dk: dkCount, hv: hvCount, rest: restCount, total });
            }
          }
          const ksSummary = (() => {
            const counts = {};
            for (const k of koppelstrippen) {
              const key = `${k.label}:${Math.round(k.width)}`;
              counts[key] = counts[key] ?? { label: k.label, width: Math.round(k.width), count: 0 };
              counts[key].count++;
            }
            return Object.values(counts).sort((a, b) => b.count - a.count);
          })();
          const ksTotalCount = ksSummary.reduce((s, k) => s + k.count, 0);
          const thStyle = { padding: '5px 8px', borderBottom: '2px solid #1e3a5f', fontSize: 10, fontWeight: 700, color: '#1e3a5f', whiteSpace: 'nowrap', textAlign: 'left', background: '#f0f4f8' };
          const tdStyle = { padding: '4px 8px', borderBottom: '1px solid #e2e8f0', fontSize: 10, color: '#334155', whiteSpace: 'nowrap' };
          const tdRight = { ...tdStyle, textAlign: 'right' };
          return (
            <div style={{ background: '#fff', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.10)', overflow: 'auto', maxHeight: '100%' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#1e3a5f' }}>
                Zaaglijst — {groupName ?? 'Groep'} ({tableRows.length} panelen)
                {epcProjectNr !== '00000' && <span style={{ fontSize: 10, fontWeight: 400, color: '#64748b', marginLeft: 8 }}>Project {epcProjectNr} · Level {String(epcLevel).padStart(2,'0')}</span>}
              </span>
                <button onClick={exportZaaglijst} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>⬇ Export CSV</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['PaneelID', ...(isPaneelMerk() ? ['Merk'] : []), 'Zone', 'B (mm)', 'H (mm)', 'Opp. (m²)', 'Gew. (kg)', 'Strek', 'Kop', 'Drklz', '½', 'Rest', 'Totaal'].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((r, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', letterSpacing: '0.03em', fontWeight: 600, color: '#1e40af' }} title={r.paneelId}>{r.paneelIdDisplay}</td>
                      {isPaneelMerk() && <td style={{ ...tdStyle, fontWeight: 700, color: '#0369a1' }}>{r.merk}</td>}
                      <td style={tdStyle}>{r.zone}</td>
                      <td style={tdRight}>{r.breedte}</td>
                      <td style={tdRight}>{r.hoogte}</td>
                      <td style={tdRight}>{r.opp}</td>
                      <td style={tdRight}>{r.gewicht}</td>
                      <td style={tdRight}>{r.vol || ''}</td>
                      <td style={tdRight}>{r.kop || ''}</td>
                      <td style={tdRight}>{r.dk || ''}</td>
                      <td style={tdRight}>{r.hv || ''}</td>
                      <td style={tdRight}>{r.rest || ''}</td>
                      <td style={{ ...tdRight, fontWeight: 700 }}>{r.total}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f0f4f8' }}>
                    <td colSpan={isPaneelMerk() ? 6 : 5} style={{ ...tdStyle, fontWeight: 700 }}>Totaal {tableRows.length} panelen (prefab)</td>
                    <td style={{ ...tdRight, fontWeight: 700 }}>{tableRows.reduce((s, r) => s + r.gewicht, 0).toFixed(1)}</td>
                    <td style={{ ...tdRight, fontWeight: 700 }}>{tableRows.reduce((s, r) => s + r.vol, 0)}</td>
                    <td style={{ ...tdRight, fontWeight: 700 }}>{tableRows.reduce((s, r) => s + r.kop, 0)}</td>
                    <td style={{ ...tdRight, fontWeight: 700 }}>{tableRows.reduce((s, r) => s + r.dk, 0)}</td>
                    <td style={{ ...tdRight, fontWeight: 700 }}>{tableRows.reduce((s, r) => s + r.hv, 0)}</td>
                    <td style={{ ...tdRight, fontWeight: 700 }}>{tableRows.reduce((s, r) => s + r.rest, 0)}</td>
                    <td style={{ ...tdRight, fontWeight: 700 }}>{tableRows.reduce((s, r) => s + r.total, 0)}</td>
                  </tr>
                  {ksTotalCount > 0 && (
                    <tr style={{ background: '#f0fdf4', borderTop: '2px solid #16a34a' }}>
                      <td colSpan={6} style={{ ...tdStyle, fontWeight: 700, color: '#15803d' }}>Koppelstrippen — op locatie aan te brengen ({ksTotalCount} st.)</td>
                      <td style={{ ...tdRight, fontWeight: 700, color: '#15803d' }}>{koppelstrippen.filter(k => k.label === 'Strek').length || ''}</td>
                      <td style={{ ...tdRight, fontWeight: 700, color: '#15803d' }}>{koppelstrippen.filter(k => k.label === 'Kop').length || ''}</td>
                      <td style={{ ...tdRight, fontWeight: 700, color: '#15803d' }}>{koppelstrippen.filter(k => k.label === 'Drieklezoor').length || ''}</td>
                      <td style={{ ...tdRight, fontWeight: 700, color: '#15803d' }}>{koppelstrippen.filter(k => k.label === 'Halve').length || ''}</td>
                      <td style={{ ...tdRight, fontWeight: 700, color: '#15803d' }}>{koppelstrippen.filter(k => k.label === 'Rest').length || ''}</td>
                      <td style={{ ...tdRight, fontWeight: 700, color: '#15803d' }}>{ksTotalCount}</td>
                    </tr>
                  )}
                </tfoot>
              </table>
              {ksTotalCount > 0 && (
                <div style={{ padding: '8px 14px', borderTop: '1px solid #bbf7d0', background: '#f0fdf4' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#15803d' }}>Koppelstrips (detail): </span>
                  {ksSummary.map((k, i) => (
                    <span key={i} style={{ fontSize: 9, color: '#15803d', marginRight: 10 }}>{k.count}× {k.label} {k.width} mm</span>
                  ))}
                </div>
              )}
              <div style={{ padding: '8px 14px', fontSize: 9, color: '#94a3b8', borderTop: '1px solid #e2e8f0' }}>
                EPC-16 formaat: E-PPPPP-LL-SS-EE-NNN-T · E=entiteit(P) · PPPPP=projectnummer · LL=level · SS=stramien start · EE=stramien eind · NNN=volgnummer · T=type(V) · Hover over ID voor raw EPC code
              </div>
            </div>
          );
        })()}

        {drawingType === 'maltekening' && (() => {
          const groupVerband = groupSettings?.verband ?? 'halfsteens';
          const moldDims = { hoogte: panelen?.malBreedte ?? 270, lengte: panelen?.malLengte ?? 3400, tolerantieL: panelen?.tolerantieL ?? 1, tolerantieH: panelen?.tolerantieH ?? 1, offsetX: panelen?.malOffsetX ?? 0 };
          // MALTEKENING ZONE-AFHANKELIJK: bij getekende tekenzones (stripZones) de mal per zone-verband
          // afleiden; anders het oude pad (penant-zoneSettings / facadeZones).
          const _activeStrip = isFeatureZones() ? (stripZones ?? []).filter((z) => z?.enabled === true) : [];
          const _usingStrip = _activeStrip.length > 0;
          const zonesForMal = _usingStrip
            ? _activeStrip.map((z, i) => ({ ...z, idx: i, label: z.label ?? `Zone ${String.fromCharCode(65 + i)}`, xStart: z.x ?? 0, xEnd: (z.x ?? 0) + (z.width ?? 0) }))
            : ((selectedZone && !tekenZone.enabled) ? [selectedZone] : facadeZones);
          const hasZones = _usingStrip ? true : facadeZones.length > 1;

          const resolvedZoneSettings = (zoneSettings ?? []);

          function getZoneMat(zone) {
            if (_usingStrip) return { ...mat, ...(zone.material ?? {}) };
            const zs = resolvedZoneSettings[zone.idx] ?? {};
            return { ...mat, ...(zs.material ?? {}) };
          }
          function getZoneVerband(zone) {
            if (_usingStrip) return zone.verband ?? groupVerband;
            return resolvedZoneSettings[zone.idx]?.verband ?? groupVerband;
          }

          const uniqueMolds = (() => {
            const seen = new Map();
            for (const zone of zonesForMal) {
              const zVerband = getZoneVerband(zone);
              const zMat = getZoneMat(zone);
              const key = `${zVerband}|${zMat.steenL}|${zMat.steenH}|${zMat.lint}|${zMat.stoot}`;
              if (!seen.has(key)) seen.set(key, { verband: zVerband, mat: zMat, key });
            }
            return [...seen.values()];
          })();

          function zoneInfo(zone) {
            const zVerband = getZoneVerband(zone);
            const zMat = getZoneMat(zone);
            const zoneTpl = getMoldTemplates(zVerband, zMat, moldDims);
            const panelsInZone = allPanels.filter((p) => p.x + p.width > zone.xStart + 1 && p.x < zone.xEnd - 1
              && (zone.height == null || (p.y + p.height > (zone.y ?? 0) + 1 && p.y < (zone.y ?? 0) + zone.height - 1)))
              .sort((a, b) => (a.y - b.y) || (a.x - b.x));  // nummering: per rij links→rechts, dan een rij hoger
            const panelCount = panelsInZone.length;
            const panelH = panelen?.hoogte ?? 1200;
            const rowsPerPanel = Math.max(1, Math.floor(panelH / zoneTpl.lagenmaat));
            const totalPasses = Math.ceil(rowsPerPanel / zoneTpl.rowsPerMold);
            const passesLinks  = Math.ceil(totalPasses / 2);
            const passesRechts = Math.floor(totalPasses / 2);
            const passSeq = Array.from({ length: totalPasses }, (_, i) => zoneTpl.templates[i % zoneTpl.templates.length]?.id ?? (i % 2 === 0 ? 'Links' : 'Rechts'));
            return { panelCount, rowsPerPanel, totalPasses, passesLinks, passesRechts, passSeq, zVerband, zoneTpl };
          }

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* ── Maltekening per uniek verband ── */}
              {uniqueMolds.map(({ verband: mv, mat: mm, key }) => {
                const tpl = getMoldTemplates(mv, mm, moldDims);
                const combinedSvgHtml = generateCombinedMoldSVG(mm, mv, moldDims);
                function exportSVG() {
                  const svgStr = generateCombinedMoldSVG(mm, mv, moldDims);
                  const blob = new Blob([svgStr], { type: 'image/svg+xml' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = `MAL-gecombineerd-${mv}.svg`; a.click();
                  URL.revokeObjectURL(url);
                }
                return (
                  <div key={key} style={{ background: '#fff', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.10)', padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', flex: 1 }}>
                        Maltekening — {tpl.verband}{tpl.rotated ? ' (90° gedraaid)' : ''} · {moldDims.lengte}×{moldDims.hoogte} mm · Staal 2 mm
                      </div>
                      <button onClick={exportSVG} style={{ fontSize: 10, background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        ⬇ SVG
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
                      Strip {tpl.brickW}×{tpl.brickH} mm · Lagenmaat {tpl.lagenmaat} mm · Stap {tpl.colStep} mm · {tpl.cycleLength}-rijcyclus
                      · <span style={{ color: '#166534', fontWeight: 600 }}>Zelfde outline voor MAL Links en MAL Rechts</span>
                    </div>
                    <div
                      dangerouslySetInnerHTML={{ __html: combinedSvgHtml }}
                      style={{ maxWidth: '100%', overflowX: 'auto', borderRadius: 4, border: '1px solid #e2e8f0' }}
                    />
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {tpl.templates.map((tmpl) =>
                        tmpl.rows.map((row) => (
                          <div key={`${tmpl.id}-${row.globalRow}`} style={{ fontSize: 10, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 4, padding: '2px 7px', color: '#0c4a6e' }}>
                            <strong>MAL {tmpl.id} · R{row.globalRow + 1}</strong> · {row.offset} mm
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}

              {/* ── Per zone: welke mal en hoeveel doorgangen ── */}
              <div style={{ background: '#fff', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.10)', padding: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 10 }}>
                  {hasZones ? 'Mal gebruik per zone' : 'Mal gebruik'}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr>
                      {(hasZones ? ['Zone', 'Breedte', 'Panelen'] : ['Panelen'])
                        .concat(uniqueMolds.length > 1 ? ['Verband'] : [])
                        .concat(['Rijen/paneel', 'Doorg./paneel', 'MAL Links', 'MAL Rechts', 'Volgorde per paneel'])
                        .map((h) => (
                        <th key={h} style={{ padding: '5px 8px', borderBottom: '2px solid #1e3a5f', fontWeight: 700, color: '#1e3a5f', textAlign: 'left', background: '#f0f4f8', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {zonesForMal.map((zone) => {
                      const { panelCount, rowsPerPanel, totalPasses, passesLinks, passesRechts, passSeq, zVerband } = zoneInfo(zone);
                      return (
                        <tr key={zone.idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          {hasZones && <>
                            <td style={{ padding: '5px 8px', fontWeight: 600 }}>{zone.label}</td>
                            <td style={{ padding: '5px 8px', color: '#475569' }}>{Math.round(zone.xEnd - zone.xStart)} mm</td>
                            <td style={{ padding: '5px 8px', color: '#475569' }}>{panelCount}</td>
                          </>}
                          {!hasZones && <td style={{ padding: '5px 8px', color: '#475569' }}>{panelCount}</td>}
                          {uniqueMolds.length > 1 && (
                            <td style={{ padding: '5px 8px' }}>
                              <span style={{ background: '#f0f4f8', border: '1px solid #cbd5e1', borderRadius: 3, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>{zVerband}</span>
                            </td>
                          )}
                          <td style={{ padding: '5px 8px', color: '#475569' }}>{rowsPerPanel}</td>
                          <td style={{ padding: '5px 8px', fontWeight: 600 }}>{totalPasses}×</td>
                          <td style={{ padding: '5px 8px' }}>
                            <span style={{ background: '#1e3a5f', color: '#fff', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>{passesLinks}×</span>
                          </td>
                          <td style={{ padding: '5px 8px' }}>
                            <span style={{ background: '#0f766e', color: '#fff', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>{passesRechts}×</span>
                          </td>
                          <td style={{ padding: '5px 8px' }}>
                            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                              {passSeq.map((id, i) => (
                                <span key={i} style={{ background: i % 2 === 0 ? '#1e3a5f' : '#0f766e', color: '#fff', borderRadius: 3, padding: '1px 5px', fontSize: 9, whiteSpace: 'nowrap' }}>
                                  {i + 1}·{id}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

            </div>
          );
        })()}

        {drawingType !== 'productie' && drawingType !== 'zaaglijst' && drawingType !== 'maltekening' && <svg ref={svgRef} width={VIEW_W} height={svgTotal} viewBox={`0 0 ${VIEW_W} ${svgTotal}`} style={{ background: '#fff', display: 'block', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }} xmlns="http://www.w3.org/2000/svg">

          <rect x={0} y={0} width={VIEW_W} height={svgTotal} fill="#fff" />

          <defs>
            <clipPath id="wt-openings-clip" clipPathUnits="userSpaceOnUse">
              <path fillRule="evenodd" d={[
                facadeShapePath,
                ...groupOpenings.map((op) => {
                  const poly = op.polyPts && op.polyPts.length >= 3 ? op.polyPts : [
                    { l: op.x, h: op.y }, { l: op.x + op.width, h: op.y },
                    { l: op.x + op.width, h: op.y + op.height }, { l: op.x, h: op.y + op.height },
                  ];
                  return poly.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.l)},${sy(p.h)}`).join(' ') + ' Z';
                }),
              ].join(' ')} />
            </clipPath>
            {(cornerTrimLeft > 0 || cornerTrimRight > 0) && (() => {
              const trimXL = !outsideDirFlip ? sx(viewXStart + cornerTrimLeft) : sx(viewXEnd - cornerTrimRight);
              const trimW  = Math.max(0, (groupWidth - cornerTrimLeft - cornerTrimRight) * scale);
              return (
                <clipPath id="wt-corner-clip" clipPathUnits="userSpaceOnUse">
                  <rect x={trimXL} y={OY - 10} width={trimW} height={H + 20} />
                </clipPath>
              );
            })()}
            {(lattenTrimLeft > 0 || lattenTrimRight > 0) && (() => {
              const trimXL = !outsideDirFlip ? sx(viewXStart + lattenTrimLeft) : sx(viewXEnd - lattenTrimRight);
              const trimW  = Math.max(0, (groupWidth - lattenTrimLeft - lattenTrimRight) * scale);
              return (
                <clipPath id="wt-latten-clip" clipPathUnits="userSpaceOnUse">
                  <rect x={trimXL} y={OY - 10} width={trimW} height={H + 20} />
                </clipPath>
              );
            })()}
            {(panelsTrimLeft > 0 || panelsTrimRight > 0) && (() => {
              const trimXL = !outsideDirFlip ? sx(viewXStart + panelsTrimLeft) : sx(viewXEnd - panelsTrimRight);
              const trimW  = Math.max(0, (groupWidth - panelsTrimLeft - panelsTrimRight) * scale);
              return (
                <clipPath id="wt-panels-clip" clipPathUnits="userSpaceOnUse">
                  <rect x={trimXL} y={OY - 10} width={trimW} height={H + 20} />
                </clipPath>
              );
            })()}
          </defs>

          <text x={OX} y={20} fontSize={13} fontWeight="bold" fill="#0f172a" fontFamily="Arial, sans-serif">
            {groupName ?? 'Groep'}{activeZoneLabel ? ` — ${activeZoneLabel}` : ''} — {drawingType === 'achterconstructie' ? 'Achterconstructie (houten latten)' : 'Panelen plaatsing op gevel'}
          </text>
          <text x={OX} y={33} fontSize={8} fill="#64748b" fontFamily="Arial, sans-serif">
            Schaal 1:{Math.round(1 / scale * 1000)} · Afmetingen in mm · Peilmaten in m t.o.v. IFC-nulpunt{activeZoneLabel ? ` · B: ${mm(viewW_mm)} mm (X ${mm(viewXStart)}–${mm(viewXEnd)}) · H: ${mm(viewH_mm)} mm (Y ${mm(viewYStart)}–${mm(viewYEnd)})` : ` · Totale breedte: ${mm(groupWidth)} mm`}
          </text>

          <path d={facadeShapePath} fill="#f8fafc" stroke={dimColor} strokeWidth={1} fillRule="nonzero" />

          <g clipPath={(panelsTrimLeft > 0 || panelsTrimRight > 0) ? 'url(#wt-panels-clip)' : undefined}>
          {drawingType === 'plaatsing' && zonePanels.map((p, i) => {
            const clips = p.clipPolys;
            const cx = clips
              ? clips[0].reduce((s, pt) => s + pt.l, 0) / clips[0].length
              : p.x + p.width / 2;
            const cy = clips
              ? clips[0].reduce((s, pt) => s + pt.h, 0) / clips[0].length
              : p.y + p.height / 2;
            const pxW = p.width * scale;
            const pxH = p.height * scale;
            const fitSize = Math.min(pxW * 0.9, pxH * 0.8, FONT_LBL);
            const lblFontSize = Math.max(3, fitSize);
            return (
              <g key={p.id ?? i}>
                {clips ? (
                  clips.map((cp, ci) => (
                    <polygon key={ci}
                      points={cp.map(pt => `${sx(pt.l)},${sy(pt.h)}`).join(' ')}
                      fill={panelColor} stroke={dimColor} strokeWidth={0.8} fillOpacity={0.8}
                    />
                  ))
                ) : (
                  <rect
                    x={sx(p.x, p.width)} y={sy(p.y + p.height)}
                    width={pxW} height={pxH}
                    fill={panelColor} stroke={dimColor} strokeWidth={0.8} fillOpacity={0.8}
                  />
                )}
                <text
                  x={sx(cx)} y={sy(cy)}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={lblFontSize} fill="#1e3a5f" fontFamily="Arial, sans-serif" fontWeight="bold"
                >
                  {paneelMerkLabel(p) || `P${i + 1}`}
                </text>
              </g>
            );
          })}
          </g>

          {drawingType === 'plaatsing' && zoneKoppelstrippen.map((k, i) => (
            <rect
              key={`koppel-${i}`}
              x={sx(k.x, k.width)} y={sy(k.y + k.height)}
              width={k.width * scale} height={k.height * scale}
              fill="#16a34a" stroke="#15803d" strokeWidth={0.6} fillOpacity={0.5}
              strokeDasharray="2,1"
            />
          ))}

          <g clipPath={(lattenTrimLeft > 0 || lattenTrimRight > 0) ? 'url(#wt-latten-clip)' : undefined}>
            <g clipPath="url(#wt-openings-clip)">
              {drawingType === 'achterconstructie' && zoneLatten.map((l) => (
                <rect
                  key={l.id}
                  x={sx(l.x, l.width)} y={sy(l.y + l.height)}
                  width={l.width * scale} height={l.height * scale}
                  fill={latColor} stroke="#92400e" strokeWidth={0.5} fillOpacity={0.85}
                />
              ))}
            </g>
          </g>

          {cornerTrimLeft > 0 && (
            <g>
              <line x1={sx(viewXStart + cornerTrimLeft)} y1={OY} x2={sx(viewXStart + cornerTrimLeft)} y2={OY + H} stroke="#ef4444" strokeWidth={1.2} strokeDasharray="6,3" opacity={0.8} />
              <text x={sx(viewXStart + cornerTrimLeft) + 4} y={OY + 12} fontSize={7} fill="#ef4444" fontFamily="Arial, sans-serif">hoek sv={cornerTrimLeft}mm</text>
            </g>
          )}
          {cornerTrimRight > 0 && (
            <g>
              <line x1={sx(viewXEnd - cornerTrimRight)} y1={OY} x2={sx(viewXEnd - cornerTrimRight)} y2={OY + H} stroke="#ef4444" strokeWidth={1.2} strokeDasharray="6,3" opacity={0.8} />
              <text x={sx(viewXEnd - cornerTrimRight) - 4} y={OY + 12} fontSize={7} fill="#ef4444" fontFamily="Arial, sans-serif" textAnchor="end">sv={cornerTrimRight}mm hoek</text>
            </g>
          )}

          {cornerExtendLeft > 0 && (
            <g>
              <line x1={sx(viewXStart)} y1={OY} x2={sx(viewXStart)} y2={OY + H} stroke="#2563eb" strokeWidth={1.2} strokeDasharray="4,2" opacity={0.85} />
              <text x={sx(viewXStart) + 4} y={OY + 22} fontSize={7} fill="#2563eb" fontFamily="Arial, sans-serif">← verlenging {cornerExtendLeft}mm</text>
            </g>
          )}
          {cornerExtendRight > 0 && (
            <g>
              <line x1={sx(viewXEnd)} y1={OY} x2={sx(viewXEnd)} y2={OY + H} stroke="#2563eb" strokeWidth={1.2} strokeDasharray="4,2" opacity={0.85} />
              <text x={sx(viewXEnd) - 4} y={OY + 22} fontSize={7} fill="#2563eb" fontFamily="Arial, sans-serif" textAnchor="end">verlenging {cornerExtendRight}mm →</text>
            </g>
          )}

          {zoneOpenings.map((op, i) => {
            const poly = op.polyPts;
            if (poly && poly.length >= 3) {
              const pts = poly.map((p) => `${sx(p.l)},${sy(p.h)}`).join(' ');
              return (
                <g key={i}>
                  <polygon points={pts} fill={openColor} fillOpacity={0.5} stroke="#dc2626" strokeWidth={0.8} strokeDasharray="3,2" />
                  <line x1={sx(op.x)} y1={sy(op.y)} x2={sx(op.x + op.width)} y2={sy(op.y + op.height)} stroke="#dc2626" strokeWidth={0.4} />
                  <line x1={sx(op.x + op.width)} y1={sy(op.y)} x2={sx(op.x)} y2={sy(op.y + op.height)} stroke="#dc2626" strokeWidth={0.4} />
                </g>
              );
            }
            return (
              <g key={i}>
                <rect x={sx(op.x, op.width)} y={sy(op.y + op.height)} width={op.width * scale} height={op.height * scale}
                  fill={openColor} fillOpacity={0.5} stroke="#dc2626" strokeWidth={0.8} strokeDasharray="3,2" />
                <line x1={sx(op.x)} y1={sy(op.y)} x2={sx(op.x + op.width)} y2={sy(op.y + op.height)} stroke="#dc2626" strokeWidth={0.4} />
                <line x1={sx(op.x + op.width)} y1={sy(op.y)} x2={sx(op.x)} y2={sy(op.y + op.height)} stroke="#dc2626" strokeWidth={0.4} />
              </g>
            );
          })}

          {xBreaks.map((x, i) => (
            drawingType !== 'achterconstructie' &&
            <line key={i} x1={sx(x)} y1={OY} x2={sx(x)} y2={OY + H + 8} stroke={dimColor} strokeWidth={0.3} strokeDasharray="3,3" opacity={0.5} />
          ))}

          {drawingType !== 'achterconstructie' && xBreaks.length >= 2 && xBreaks.slice(0, -1).map((x, i) => {
            const x2 = xBreaks[i + 1];
            const span = x2 - x;
            if (span < 1) return null;
            return <DimH key={i} x1={sx(x)} x2={sx(x2)} y={dimRowY} label={`${mm(span)}`} color={dimColor} />;
          })}

          {xBreaks.length >= 2 && (
            <DimH x1={sx(viewXStart)} x2={sx(viewXEnd)} y={dimRow2Y} label={activeZoneLabel ? `${activeZoneLabel}: ${mm(viewW_mm)} mm` : `TOTAAL ${mm(groupWidth)} mm`} color="#dc2626" />
          )}

          {drawingType !== 'achterconstructie' && zoneOpenings.map((op, i) => (
            op.width > 1 && (
              <DimH key={`op-h-${i}`} x1={sx(op.x)} x2={sx(op.x + op.width)} y={OY + H + 48} label={`raam ${mm(op.width)}`} color="#dc2626" />
            )
          ))}

          {drawingType === 'achterconstructie' && zoneLatten.map((l) => {
            const len = Math.round(lattenRichting === 'horizontaal' ? l.width : l.height);
            const cx = sx(l.x + l.width / 2);
            const ty = sy(l.y + l.height) - 3;
            if (l.width * scale < 14) return null;
            if (lattenTrimLeft > 0 && (l.x + l.width / 2) < viewXStart + lattenTrimLeft) return null;
            if (lattenTrimRight > 0 && (l.x + l.width / 2) > viewXEnd - lattenTrimRight) return null;
            return (
              <text key={`dim-${l.id}`}
                x={cx} y={ty}
                textAnchor="middle" fontSize={FONT_LBL} fill="#92400e"
                fontFamily="Arial, sans-serif" fontWeight="600"
              >{len}</text>
            );
          })}

          {yBreaks.map((y, i) => (
            drawingType !== 'achterconstructie' &&
            <line key={i} x1={OX - 8} y1={sy(y)} x2={OX + W} y2={sy(y)} stroke={dimColor} strokeWidth={0.3} strokeDasharray="3,3" opacity={0.5} />
          ))}

          {drawingType !== 'achterconstructie' && yBreaks.length >= 2 && yBreaks.slice(0, -1).map((y, i) => {
            const y2 = yBreaks[i + 1];
            const span = y2 - y;
            if (span < 1) return null;
            return <DimV key={i} x={dimVSpanX} y1={sy(y2)} y2={sy(y)} label={`${mm(span)}`} color={dimColor} side="left" />;
          })}

          {yBreaks.length >= 2 && (
            <DimV x={dimVTotalX} y1={sy(viewYEnd)} y2={sy(viewYStart)} label={`TOTAAL ${mm(viewH_mm)}`} color="#dc2626" side="left" />
          )}

          {latYs.map((cy, i) => (
            <line key={i} x1={OX} y1={sy(cy)} x2={OX + W + 20} y2={sy(cy)} stroke="#92400e" strokeWidth={0.6} strokeDasharray="5,3" opacity={0.7} />
          ))}

          <line x1={peilLineX} y1={OY} x2={peilLineX} y2={OY + H} stroke="#334155" strokeWidth={0.8} />
          {(() => {
            const MIN_GAP = 14;
            const allPts = [
              ...yBreaks.map(y => ({ y, kind: 'peil' })),
              ...latYs.map(y => ({ y, kind: 'lat' })),
            ].sort((a, b) => a.y - b.y);
            let lastLabelY = -Infinity;
            return allPts.map(({ y, kind }, i) => {
              const absH = (peilmatenBase + y) / 1000;
              const screenY = sy(y);
              const isLat = kind === 'lat';
              const showLabel = lastLabelY === -Infinity || Math.abs(screenY - lastLabelY) >= MIN_GAP;
              if (showLabel) lastLabelY = screenY;
              return (
                <g key={`${kind}-${i}`}>
                  <line
                    x1={peilLineX - (isLat ? 6 : 4)} y1={screenY}
                    x2={peilLineX + (isLat ? 6 : 4)} y2={screenY}
                    stroke={isLat ? '#92400e' : '#334155'} strokeWidth={0.8}
                  />
                  {showLabel && (
                    <text
                      x={peilLineX - 8} y={screenY + 3}
                      textAnchor="end" fontSize={FONT_DIM}
                      fill={isLat ? '#92400e' : '#334155'}
                      fontFamily="Arial, sans-serif"
                    >
                      {absH.toFixed(3)}
                    </text>
                  )}
                </g>
              );
            });
          })()}



          <text x={peilLineX} y={OY - 6} textAnchor="middle" fontSize={FONT_LBL} fill="#334155" fontFamily="Arial, sans-serif">PEILMATEN (m)</text>

          <g transform={`translate(${OX},${svgTotal - LEGEND_H + 4})`}>
            {drawingType === 'plaatsing' && <>
              <rect x={0} y={0} width={12} height={8} fill={panelColor} stroke={dimColor} strokeWidth={0.5} />
              <text x={15} y={7} fontSize={FONT_LBL} fill="#334155" fontFamily="Arial, sans-serif">Paneel</text>
              {zoneKoppelstrippen.length > 0 && <>
                <rect x={55} y={0} width={12} height={8} fill="#ff6b00" fillOpacity={0.5} stroke="#cc5500" strokeWidth={0.5} strokeDasharray="2,1" />
                <text x={70} y={7} fontSize={FONT_LBL} fill="#334155" fontFamily="Arial, sans-serif">Koppelstrip ({zoneKoppelstrippen.length})</text>
              </>}
            </>}
            {drawingType === 'achterconstructie' && <>
              <rect x={0} y={0} width={12} height={8} fill={latColor} stroke="#92400e" strokeWidth={0.5} />
              <text x={15} y={7} fontSize={FONT_LBL} fill="#334155" fontFamily="Arial, sans-serif">Houten lat</text>
              <line x1={60} y1={4} x2={80} y2={4} stroke="#92400e" strokeWidth={0.8} strokeDasharray="4,2" />
              <text x={83} y={7} fontSize={FONT_LBL} fill="#334155" fontFamily="Arial, sans-serif">Hart lat</text>
            </>}
            <rect x={130} y={0} width={12} height={8} fill={openColor} fillOpacity={0.5} stroke="#dc2626" strokeWidth={0.5} strokeDasharray="2,1" />
            <text x={145} y={7} fontSize={FONT_LBL} fill="#334155" fontFamily="Arial, sans-serif">Opening (raam/deur)</text>
          </g>
        </svg>}

        {drawingType !== 'productie' && drawingType !== 'zaaglijst' && drawingType !== 'maltekening' && (() => {
          const bx = PAD_LEFT;
          const bw = VIEW_W - PAD_LEFT - PAD_RIGHT;
          const summaryItems = [];

          if (drawingType === 'achterconstructie' && summaryBoxH > 0) {
            const lw = 260;
            summaryItems.push(
              <g key="latten">
                <rect x={bx} y={0} width={lw} height={summaryBoxH} fill="#fff" stroke="#000" strokeWidth={1} />
                <text x={bx + SUMMARY_PAD} y={SUMMARY_PAD + SUMMARY_LINE_H - 2}
                  fontSize={10} fontWeight="bold" fill="#000" fontFamily="Arial, sans-serif">
                  Latten samenvatting ({lattenRichting})
                </text>
                <line x1={bx} y1={SUMMARY_PAD + SUMMARY_LINE_H + 2} x2={bx + lw} y2={SUMMARY_PAD + SUMMARY_LINE_H + 2} stroke="#000" strokeWidth={0.5} />
                {lattenSummary.map(({ len, cnt }, i) => (
                  <text key={i} x={bx + SUMMARY_PAD} y={SUMMARY_PAD + (i + 2) * SUMMARY_LINE_H + 2}
                    fontSize={10} fill="#000" fontFamily="Arial, sans-serif">
                    {cnt}× {len} mm
                  </text>
                ))}
              </g>
            );
          }

          if (drawingType === 'plaatsing' && zonePanels.length > 0) {
            const sizeGroups = {};
            for (const p of zonePanels) {
              const key = `${mm(p.width)}×${mm(p.height)}`;
              sizeGroups[key] = (sizeGroups[key] ?? 0) + 1;
            }
            const lines = Object.entries(sizeGroups).sort((a, b) => b[1] - a[1]);
            const bh = (lines.length + 2) * SUMMARY_LINE_H + SUMMARY_PAD * 2;
            const pw = 320;
            summaryItems.push(
              <g key="panelen">
                <rect x={bx} y={0} width={pw} height={bh} fill="#fff" stroke="#000" strokeWidth={1} />
                <text x={bx + SUMMARY_PAD} y={SUMMARY_PAD + SUMMARY_LINE_H - 2}
                  fontSize={9} fontWeight="bold" fill="#000" fontFamily="Arial, sans-serif">
                  Panelen{selectedZone ? ` ${selectedZone.label}` : ''} — totaal {zonePanels.length} st.{zoneKoppelstrippen.length > 0 ? ` · ${zoneKoppelstrippen.length} koppelstrip${zoneKoppelstrippen.length !== 1 ? 'pen' : ''} · ${PANEL_GAP} mm paneelruimte` : ` · ${PANEL_GAP} mm paneelruimte`}
                </text>
                <line x1={bx} y1={SUMMARY_PAD + SUMMARY_LINE_H + 2} x2={bx + pw} y2={SUMMARY_PAD + SUMMARY_LINE_H + 2} stroke="#000" strokeWidth={0.5} />
                {lines.map(([key, cnt], i) => (
                  <text key={i} x={bx + SUMMARY_PAD} y={SUMMARY_PAD + (i + 2) * SUMMARY_LINE_H + 2}
                    fontSize={9} fill="#000" fontFamily="Arial, sans-serif">
                    {cnt}× {key} mm
                  </text>
                ))}
              </g>
            );
          }

          if (!summaryItems.length) return null;
          const totalSummaryH = Math.max(summaryBoxH, 120);
          return (
            <svg ref={summarySvgRef} width={VIEW_W} height={totalSummaryH + 32}
              viewBox={`0 0 ${VIEW_W} ${totalSummaryH + 32}`}
              style={{ background: '#fff', display: 'block', marginTop: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.10)', borderTop: '2px solid #e2e8f0' }}
              xmlns="http://www.w3.org/2000/svg">
              <rect x={0} y={0} width={VIEW_W} height={totalSummaryH + 32} fill="#fff" />
              <text x={bx} y={18} fontSize={9} fill="#64748b" fontFamily="Arial, sans-serif" fontStyle="italic">
                {groupName ?? 'Groep'} — Hoeveelheden (pagina 2)
              </text>
              <g transform="translate(0,24)">{summaryItems}</g>
            </svg>
          );
        })()}
      </div>
    </div>
  );
}
