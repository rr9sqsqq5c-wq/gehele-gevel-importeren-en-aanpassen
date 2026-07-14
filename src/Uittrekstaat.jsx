import React, { useMemo } from 'react';
import { buildFullGroupFacadePattern } from './lib/pattern.js';
import { buildFacadeZones, panelizeZone, computeEffectiveBasePanel, generateBattenPositions } from './lib/panelization.js';
import { openingXRangesAtY } from './lib/geometry.js';
import { BATTEN_CATALOG, BASISPLAAT_CATALOG, STEENSTRIP_CATALOG } from './lib/battens.js';
import { isWildverbandKoppelstrip, isGroothuisWildverband, isGroothuisWildverband2 } from './lib/featureFlags.js';
import { buildTruthRows } from './lib/wildverbandKoppelstrip.js';
import { buildGroothuisRows } from './lib/groothuisWildverband.js';
import { buildGroothuis2Rows } from './lib/groothuisWildverband2.js';

const DEFAULT_MATERIAL = { steenL: 210, steenH: 50, lint: 12, stoot: 10, brickWeightM2: 40 };

function mm2(v) { return Math.round(v); }
function m2(mm2v) { return (mm2v / 1e6).toFixed(3); }
function m2num(mm2v) { return mm2v / 1e6; }

function polyArea(pts) {
  if (!pts || pts.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].l * pts[j].h - pts[j].l * pts[i].h;
  }
  return Math.abs(a) / 2;
}

function computeGroupTakeoff(group, walls, getSettings, adjacencies, cornerTrims = null) {
  const s = getSettings(group.id);
  const mat = s.material ?? DEFAULT_MATERIAL;
  const verband = s.verband ?? 'halfsteens';
  const name = s.name ?? group.id;
  const color = s.color ?? '#94a3b8';

  const groupWalls = group.wallIds.map((id) => walls.find((w) => w.expressID === id)).filter(Boolean);
  if (!groupWalls.length) return null;

  let facadeData = buildFullGroupFacadePattern(groupWalls, mat, verband, s.maxHoogte, null);
  if (!facadeData) return null;
  // FASE 2 — wildverband: de zaaglijst telt het vastgelegde truth-verband (zelfde bron als
  // 2D/3D/IFC/werktekening) i.p.v. de tegelverband-degradatie uit pattern.js. Vlag UIT →
  // ongewijzigd (byte-identiek).
  if (verband === 'wildverband' && isWildverbandKoppelstrip()) {
    const _tr = buildTruthRows(facadeData.groupWidth, facadeData.groupHeight, mat, facadeData.groupOpenings ?? []);
    facadeData = { ...facadeData, rows: _tr.rows };
  }
  if (verband === 'groothuis_wildverband' && isGroothuisWildverband()) {
    const _gr = buildGroothuisRows(facadeData.groupWidth, facadeData.groupHeight, mat, facadeData.groupOpenings ?? []);
    facadeData = { ...facadeData, rows: _gr.rows };
  }
  if (verband === 'groothuis_wildverband_2' && isGroothuisWildverband2()) {
    const _gr = buildGroothuis2Rows(facadeData.groupWidth, facadeData.groupHeight, mat, facadeData.groupOpenings ?? []);
    facadeData = { ...facadeData, rows: _gr.rows };
  }

  const { groupWidth, groupHeight, groupOpenings, rows } = facadeData;

  const tL = cornerTrims?.trimLeft ?? 0;
  const tR = cornerTrims?.trimRight ?? 0;
  const eL = cornerTrims?.extendLeft ?? 0;
  const eR = cornerTrims?.extendRight ?? 0;
  const effectiveWidth = groupWidth - tL - tR + eL + eR;
  const latTL = cornerTrims?.lattenTrimLeft ?? 0;
  const latTR = cornerTrims?.lattenTrimRight ?? 0;
  const latEL = cornerTrims?.lattenExtendLeft ?? 0;
  const latER = cornerTrims?.lattenExtendRight ?? 0;

  const _applyCornerToRows = (rws) => {
    if (!tL && !tR && !eL && !eR) return rws;
    const xMin = tL, xMax = groupWidth - tR;
    return rws.map((row) => {
      let pieces = row.pieces.flatMap((p) => {
        let ps = p.start, pe = p.start + p.length;
        if (pe <= xMin || ps >= xMax) return [];
        ps = Math.max(ps, xMin); pe = Math.min(pe, xMax);
        const len = pe - ps;
        if (len < 1) return [];
        return [{ ...p, start: ps, length: len }];
      }).filter((p) => p.length > 1);
      if (eL > 0 && pieces.length > 0) { const f = pieces[0]; pieces = [{ ...f, start: f.start - eL, length: f.length + eL }, ...pieces.slice(1)]; }
      if (eR > 0 && pieces.length > 0) { const l = pieces[pieces.length - 1]; pieces = [...pieces.slice(0, -1), { ...l, length: l.length + eR }]; }
      return { ...row, pieces };
    }).filter((row) => row.pieces.length > 0);
  };
  const effectiveRows = _applyCornerToRows(rows);

  const facadeAreaMM2 = effectiveWidth * groupHeight;

  const openingsAreaMM2 = groupOpenings.reduce((sum, op) => {
    if (op.polyPts && op.polyPts.length >= 3) return sum + polyArea(op.polyPts);
    return sum + op.width * op.height;
  }, 0);

  const netFacadeAreaMM2 = facadeAreaMM2 - openingsAreaMM2;

  let stripCount = { Strek: 0, Kop: 0, Drieklezoor: 0, Rest: 0, Tegel: 0 };
  let stripAreaMM2 = 0;
  for (const row of effectiveRows) {
    for (const piece of row.pieces) {
      const lbl = piece.label ?? 'Strek';
      stripCount[lbl] = (stripCount[lbl] ?? 0) + 1;
      stripAreaMM2 += piece.length * mat.steenH;
    }
  }

  let panelList = [];
  let noPanelZonesAreaMM2 = 0;
  let noPanelZonesCount = 0;
  if (s.panelen?.enabled) {
    const basePanel = computeEffectiveBasePanel(s.panelen, (s.material ?? {}).brickWeightM2 ?? 40, mat);
    const maxInterval = s.latten?.maxInterval ?? 400;
    const battenYs = generateBattenPositions(groupHeight, mat, maxInterval, { minHOH: s.latten?.minHOH, maxHOH: s.latten?.maxHOH, targetPanelH: s.panelen?.hoogte, minPanelH: 800 });
    const openingsForZones = groupOpenings.map((op) => ({ id: `op_${op.x}_${op.y}`, x: op.x, y: op.y, width: op.width, height: op.height, polyPts: op.polyPts ?? null }));
    const PENANT_INSET = 20;
    const penantOpenings = (s.penanten ?? []).map((pen, pi) => {
      const px = (pen.x ?? 0) + PENANT_INSET;
      const pw = Math.max(1, pen.breedte ?? 400) - 2 * PENANT_INSET;
      if (pw <= 0) return null;
      return { id: `pen_${pi}`, x: px, y: 0, width: pw, height: groupHeight, polyPts: null };
    }).filter(Boolean);
    const zones = buildFacadeZones(groupWidth, groupHeight, [...openingsForZones, ...penantOpenings]);
    for (const zone of zones) {
      const result = panelizeZone(zone, battenYs, basePanel, null, mat, verband);
      if (result.ok) {
        panelList.push(...result.panels);
      } else {
        noPanelZonesAreaMM2 += zone.width * zone.height;
        noPanelZonesCount++;
      }
    }
  }

  const panelGroups = {};
  for (const p of panelList) {
    const key = `${mm2(p.width)}x${mm2(p.height)}`;
    if (!panelGroups[key]) panelGroups[key] = { width: p.width, height: p.height, count: 0, areaMM2: 0, weightKg: 0 };
    panelGroups[key].count++;
    panelGroups[key].areaMM2 += p.width * p.height;
    const pWeight = s.panelen?.gewichtM2 ?? 9.4;
    panelGroups[key].weightKg += (p.width * p.height / 1e6) * pWeight;
  }

  let lattenSummary = {};
  if (s.latten?.enabled) {
    const latB = Math.max(5, s.latten.breedte ?? 50);
    const richting = s.latten.richting ?? 'horizontaal';
    const MAX_HOC = s.latten.maxInterval ?? 400;

    if (richting === 'horizontaal') {
      const openingBottomYs = new Set(groupOpenings.map((op) => Math.round(op.y)));
      const openingTopYs = new Set(groupOpenings.map((op) => Math.round(op.y + op.height)));
      const gH = Math.round(groupHeight);
      const clampY = (y) => Math.min(gH, Math.max(0, y));
      const boundaryYs = new Set([0, gH]);
      for (const p of panelList) { boundaryYs.add(clampY(Math.round(p.y))); boundaryYs.add(clampY(Math.round(p.y + p.height))); }
      for (const op of groupOpenings) { boundaryYs.add(clampY(Math.round(op.y))); boundaryYs.add(clampY(Math.round(op.y + op.height))); }
      const sorted = [...boundaryYs].sort((a, b) => a - b);
      const allYs = new Set(sorted);
      for (let i = 0; i < sorted.length - 1; i++) {
        const span = sorted[i + 1] - sorted[i];
        if (span > MAX_HOC) {
          const steps = Math.ceil(span / MAX_HOC);
          for (let s2 = 1; s2 < steps; s2++) allYs.add(Math.round(sorted[i] + (span / steps) * s2));
        }
      }
      for (const yr of [...allYs].filter(y => y >= 0 && y <= gH).sort((a, b) => a - b)) {
        let latY = yr === 0 ? 0 : yr === gH ? yr - latB : openingBottomYs.has(yr) ? yr - latB : openingTopYs.has(yr) ? yr : yr - latB / 2;
        const latTop = latY, latBot = latY + latB;
        const openingsAtY = groupOpenings.filter((op) => op.y < latBot && op.y + op.height > latTop);
        const zones2 = [];
        if (!openingsAtY.length) { zones2.push({ x1: 0, x2: groupWidth }); }
        else {
          const opRanges = openingsAtY.flatMap((op) => openingXRangesAtY(op, latTop, latBot)).sort((a, b) => a.x1 - b.x1);
          let cursor = 0;
          for (const op of opRanges) { if (op.x1 > cursor) zones2.push({ x1: cursor, x2: op.x1 }); cursor = Math.max(cursor, op.x2); }
          if (cursor < groupWidth) zones2.push({ x1: cursor, x2: groupWidth });
        }
        for (const zone of zones2) {
          let x1 = zone.x1, x2 = zone.x2;
          const INSET = 5;
          if (panelList.length > 0) {
            const inZone = panelList.filter((p) => p.y < latBot && p.y + p.height > latTop && p.x + p.width > zone.x1 && p.x < zone.x2);
            if (inZone.length > 0) { x1 = Math.min(...inZone.map((p) => p.x)) + INSET; x2 = Math.max(...inZone.map((p) => p.x + p.width)) - INSET; }
          }
          if (zone.x1 <= 0) {
            if (latTL > 0) x1 = Math.max(x1, latTL);
            else if (latEL > 0) x1 = x1 - latEL;
          }
          if (zone.x2 >= groupWidth) {
            if (latTR > 0) x2 = Math.min(x2, groupWidth - latTR);
            else if (latER > 0) x2 = x2 + latER;
          }
          if (x2 <= x1) continue;
          const len = Math.round(x2 - x1);
          lattenSummary[len] = (lattenSummary[len] ?? 0) + 1;
        }
      }
    }
  }

  let penantAreaMM2 = 0;
  let hoekprofielLengthMM = 0;
  let uSectiesCount = 0;
  let vertikaleLattenLengthMM = 0;
  if (s.penanten?.length) {
    for (const p of s.penanten) {
      const pB = Math.max(1, p.breedte ?? 400);
      const pDLU = Math.max(1, p.diepteLinks  ?? p.diepte ?? 150);
      const pDRU = Math.max(1, p.diepteRechts ?? p.diepte ?? 150);
      const maxH = s.maxHoogte != null && s.maxHoogte > 0 ? s.maxHoogte : groupHeight;
      const pH = Math.min(Math.max(1, p.hoogte ?? 2000), maxH);
      penantAreaMM2 += pB * pH + pDLU * pH + pDRU * pH;
      const hp = p.hoekprofiel;
      if (hp?.enabled !== false) hoekprofielLengthMM += 2 * pH;
      const panelGewichtM2U = s.panelen?.gewichtM2 ?? 9.4;
      const stripGewichtM2U = s.material?.brickWeightM2 ?? 40;
      const gewichtM2 = panelGewichtM2U + stripGewichtM2U;
      const maxKg = p.maxKg ?? 50;
      const brickDepthU = s.brickDepth ?? 20;
      const stootU = p.stoot ?? s.material?.stoot ?? 10;
      const sidePanelDepthUL = Math.max(1, pDLU - brickDepthU - stootU);
      const sidePanelDepthUR = Math.max(1, pDRU - brickDepthU - stootU);
      const omtrekM2perMM = (pB + sidePanelDepthUL + sidePanelDepthUR) / 1e6;
      const kgPerMM = omtrekM2perMM * gewichtM2;
      const maxSectieH = kgPerMM > 0 ? Math.floor(maxKg / kgPerMM) : pH;
      uSectiesCount += kgPerMM > 0 ? Math.ceil(pH / maxSectieH) : 1;
      const vl = p.verticaleLat;
      if (vl?.enabled !== false) vertikaleLattenLengthMM += 2 * pH;
    }
  }

  const totalLattenLengthMM = Object.entries(lattenSummary).reduce((sum, [len, cnt]) => sum + Number(len) * cnt, 0);

  return {
    groupId: group.id, name, color,
    groupWidth, groupHeight,
    facadeAreaMM2, openingsAreaMM2, netFacadeAreaMM2, penantAreaMM2, hoekprofielLengthMM, uSectiesCount, vertikaleLattenLengthMM,
    stripCount, stripAreaMM2,
    panelGroups,
    panelAreaMM2: Object.values(panelGroups).reduce((sum, pg) => sum + pg.areaMM2, 0),
    noPanelZonesAreaMM2, noPanelZonesCount,
    lattenSummary,
    totalLattenLengthMM,
    lattenArtikelen: s.lattenArtikelen ?? [],
    steenstripsArtikelen: s.steenstripsArtikelen ?? [],
    basisplaatId: s.panelen?.basisplaatId ?? null,
    mat,
    openingsCount: groupOpenings.length,
    groupOpenings,
  };
}

const TOL = 60;
const CLUSTER_TOL = 300;

function openingSizeKey(op) {
  return `${Math.round(op.width / TOL) * TOL}x${Math.round(op.height / TOL) * TOL}`;
}

function clusterEntries(entries) {
  const used = new Array(entries.length).fill(false);
  const clusters = [];
  for (let i = 0; i < entries.length; i++) {
    if (used[i]) continue;
    const cluster = [entries[i]];
    used[i] = true;
    for (let j = i + 1; j < entries.length; j++) {
      if (used[j]) continue;
      const a = entries[i].rep, b = entries[j].rep;
      if (Math.abs(a.width - b.width) <= CLUSTER_TOL && Math.abs(a.height - b.height) <= CLUSTER_TOL) {
        cluster.push(entries[j]);
        used[j] = true;
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

function OpeningSvg({ op, sc, svgW, svgH, pad = 6 }) {
  const w = op.width * sc, h = op.height * sc;
  const ox = (svgW - w) / 2, oy = (svgH - h) / 2;

  if (op.polyPts && op.polyPts.length >= 3) {
    const minL = Math.min(...op.polyPts.map((p) => p.l));
    const minH = Math.min(...op.polyPts.map((p) => p.h));
    const pts = op.polyPts.map((p) => `${ox + (p.l - minL) * sc},${oy + h - (p.h - minH) * sc}`).join(' ');
    return (
      <svg width={svgW} height={svgH} style={{ display: 'block' }}>
        <polygon points={pts} fill="#bfdbfe" stroke="#2563eb" strokeWidth={1.5} />
      </svg>
    );
  }
  return (
    <svg width={svgW} height={svgH} style={{ display: 'block' }}>
      <rect x={ox} y={oy} width={w} height={h} fill="#bfdbfe" stroke="#2563eb" strokeWidth={1.5} />
    </svg>
  );
}

function ClusterCard({ cluster }) {
  const pad = 8;
  const svgH = 110;
  const svgW = 80;
  const maxW = Math.max(...cluster.map((e) => e.rep.width));
  const maxH = Math.max(...cluster.map((e) => e.rep.height));
  const sc = Math.min((svgW - pad * 2) / maxW, (svgH - pad * 2) / maxH);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 10, gap: 6 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        {cluster.map(({ rep, count }, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <OpeningSvg op={rep} sc={sc} svgW={svgW} svgH={svgH} pad={pad} />
            <span style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{count}×</span>
            <span style={{ fontSize: 10, color: '#64748b', textAlign: 'center', whiteSpace: 'nowrap' }}>
              {mm2(rep.width)} × {mm2(rep.height)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const TH = ({ children, right }) => (
  <th style={{ padding: '5px 10px', borderBottom: '2px solid #e2e8f0', fontWeight: 700, fontSize: 11, textAlign: right ? 'right' : 'left', color: '#334155', whiteSpace: 'nowrap' }}>{children}</th>
);
const TD = ({ children, right, mono, bold, color: c, span }) => (
  <td colSpan={span} style={{ padding: '4px 10px', borderBottom: '1px solid #f1f5f9', fontSize: 11, textAlign: right ? 'right' : 'left', fontFamily: mono ? 'monospace' : undefined, fontWeight: bold ? 700 : undefined, color: c ?? '#1e293b' }}>{children}</td>
);

function SectionHeader({ title }) {
  return (
    <tr style={{ background: '#f8fafc' }}>
      <td colSpan={99} style={{ padding: '6px 10px', fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>{title}</td>
    </tr>
  );
}

function computeImportTotals(walls) {
  let brutoMM2 = 0;
  let openingsMM2 = 0;
  let wallCount = walls.length;
  let openingCount = 0;

  for (const wall of walls) {
    brutoMM2 += wall.length * wall.height;
    for (const op of (wall.openings ?? [])) {
      openingCount++;
      if (op.polyPts && op.polyPts.length >= 3) {
        openingsMM2 += polyArea(op.polyPts);
      } else {
        openingsMM2 += (op.breedte ?? 0) * (op.hoogte ?? 0);
      }
    }
  }

  return { brutoMM2, openingsMM2, nettoMM2: brutoMM2 - openingsMM2, wallCount, openingCount };
}

export function Uittrekstaat({ groups, walls, getSettings, adjacencies, onClose, cornerTrimsMap = {} }) {
  const importTotals = useMemo(() => computeImportTotals(walls), [walls]);

  const takeoffs = useMemo(() => {
    return groups
      .map((g) => computeGroupTakeoff(g, walls, getSettings, adjacencies, cornerTrimsMap[g.id] ?? null))
      .filter(Boolean);
  }, [groups, walls, getSettings, adjacencies, cornerTrimsMap]);

  const totals = useMemo(() => {
    const t = { facadeAreaMM2: 0, openingsAreaMM2: 0, netFacadeAreaMM2: 0, penantAreaMM2: 0, hoekprofielLengthMM: 0, uSectiesCount: 0, vertikaleLattenLengthMM: 0, stripAreaMM2: 0, panelCount: 0, panelAreaMM2: 0, panelWeightKg: 0, lattenCount: 0, lattenLengthMM: 0 };
    for (const to of takeoffs) {
      t.facadeAreaMM2 += to.facadeAreaMM2;
      t.openingsAreaMM2 += to.openingsAreaMM2;
      t.netFacadeAreaMM2 += to.netFacadeAreaMM2;
      t.penantAreaMM2 += to.penantAreaMM2;
      t.hoekprofielLengthMM += (to.hoekprofielLengthMM ?? 0);
      t.uSectiesCount += (to.uSectiesCount ?? 0);
      t.vertikaleLattenLengthMM += (to.vertikaleLattenLengthMM ?? 0);
      t.stripAreaMM2 += to.stripAreaMM2;
      for (const pg of Object.values(to.panelGroups)) {
        t.panelCount += pg.count;
        t.panelAreaMM2 += pg.areaMM2;
        t.panelWeightKg += pg.weightKg;
      }
      for (const [len, cnt] of Object.entries(to.lattenSummary)) {
        t.lattenCount += cnt;
        t.lattenLengthMM += Number(len) * cnt;
      }
    }
    return t;
  }, [takeoffs]);

  const bestellijst = useMemo(() => {
    const strips = {};
    const basisplaten = {};
    const latten = {};

    for (const to of takeoffs) {
      const netM2 = to.netFacadeAreaMM2 / 1e6;

      for (const artId of to.steenstripsArtikelen ?? []) {
        if (!strips[artId]) strips[artId] = { netM2: 0, stuks: 0, groepen: [] };
        strips[artId].netM2 += netM2;
        strips[artId].groepen.push(to.name);
      }

      if (to.basisplaatId && to.panelAreaMM2 > 0) {
        if (!basisplaten[to.basisplaatId]) basisplaten[to.basisplaatId] = { panelAreaM2: 0, groepen: [] };
        basisplaten[to.basisplaatId].panelAreaM2 += to.panelAreaMM2 / 1e6;
        basisplaten[to.basisplaatId].groepen.push(to.name);
      }

      if (to.totalLattenLengthMM > 0) {
        for (const artId of to.lattenArtikelen ?? []) {
          if (!latten[artId]) latten[artId] = { lengthMM: 0, groepen: [] };
          latten[artId].lengthMM += to.totalLattenLengthMM;
          latten[artId].groepen.push(to.name);
        }
        if ((to.lattenArtikelen ?? []).length === 0) {
          const artId = '__onbekend__';
          if (!latten[artId]) latten[artId] = { lengthMM: 0, groepen: [] };
          latten[artId].lengthMM += to.totalLattenLengthMM;
          latten[artId].groepen.push(to.name);
        }
      }
    }

    for (const artId of Object.keys(strips)) {
      const art = STEENSTRIP_CATALOG.find((a) => a.id === artId);
      const netM2 = strips[artId].netM2;
      const stuks = art ? Math.ceil(netM2 * (art.stuksPerM2 ?? 80)) : null;
      const pallets = art?.aantalPerPallet && stuks ? Math.ceil(stuks / art.aantalPerPallet) : null;
      const stuksOpPallet = pallets && art?.aantalPerPallet ? pallets * art.aantalPerPallet : stuks;
      strips[artId] = { ...strips[artId], art, netM2, stuks, pallets, stuksOpPallet };
    }

    for (const id of Object.keys(basisplaten)) {
      const plaat = BASISPLAAT_CATALOG.find((p) => p.id === id);
      if (plaat) {
        const standaardLengte = plaat.plaatLengtes?.[0] ?? 3000;
        const plaatOppM2 = (plaat.plaatBreedte * standaardLengte) / 1e6;
        const aantalPlaten = plaatOppM2 > 0 ? Math.ceil(basisplaten[id].panelAreaM2 / plaatOppM2) : null;
        basisplaten[id] = { ...basisplaten[id], plaat, plaatOppM2, aantalPlaten };
      }
    }

    for (const artId of Object.keys(latten)) {
      if (artId === '__onbekend__') { latten[artId] = { ...latten[artId], art: null }; continue; }
      const art = BATTEN_CATALOG.find((a) => a.id === artId);
      latten[artId] = { ...latten[artId], art };
    }

    return { strips, basisplaten, latten };
  }, [takeoffs]);

  function printPage() {
    window.print();
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f8fafc', overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', background: '#1e293b', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>Uittrekstaat materialen</span>
        <span style={{ fontSize: 11, color: '#94a3b8', flex: 1 }}>{importTotals.wallCount} wanden geïmporteerd · {takeoffs.length} groep{takeoffs.length !== 1 ? 'en' : ''}</span>
        <button onClick={printPage} style={{ fontSize: 11, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontWeight: 600 }}>Afdrukken</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        <style>{`@media print { .no-print { display: none !important; } body { font-size: 10pt; } }`}</style>

        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderRadius: 6, overflow: 'hidden', marginBottom: 24 }}>
          <thead>
            <tr style={{ background: '#0f172a' }}>
              <th colSpan={99} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>GEÏMPORTEERDE WANDEN</th>
            </tr>
            <tr style={{ background: '#f1f5f9' }}>
              <TH>Omschrijving</TH>
              <TH right>Waarde</TH>
              <TH right>Eenheid</TH>
            </tr>
          </thead>
          <tbody>
            <tr><TD>Aantal geïmporteerde wanden</TD><TD right mono bold>{importTotals.wallCount}</TD><TD right>st</TD></tr>
            <tr><TD>Aantal sparingen (ramen/deuren)</TD><TD right mono>{importTotals.openingCount}</TD><TD right>st</TD></tr>
            <tr><TD>Bruto wandoppervlak</TD><TD right mono>{m2(importTotals.brutoMM2)}</TD><TD right>m²</TD></tr>
            <tr><TD>Sparingenoppervlak</TD><TD right mono>{m2(importTotals.openingsMM2)}</TD><TD right>m²</TD></tr>
            <tr style={{ background: '#f0fdf4' }}><TD bold>Netto wandoppervlak</TD><TD right mono bold>{m2(importTotals.nettoMM2)}</TD><TD right>m²</TD></tr>
          </tbody>
        </table>

        {!takeoffs.length && (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: '24px 0', fontSize: 12 }}>
            Maak groepen aan in de 3D-weergave voor materiaaldetails per groep
          </div>
        )}

        {!!takeoffs.length && <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderRadius: 6, overflow: 'hidden', marginBottom: 24 }}>
          <thead>
            <tr style={{ background: '#1e293b' }}>
              <th colSpan={99} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>TOTAALOVERZICHT GROEPEN</th>
            </tr>
            <tr style={{ background: '#f1f5f9' }}>
              <TH>Omschrijving</TH>
              <TH right>Waarde</TH>
              <TH right>Eenheid</TH>
            </tr>
          </thead>
          <tbody>
            <SectionHeader title="Oppervlakten" />
            <tr><TD>Bruto geveloppervlak</TD><TD right mono>{m2(totals.facadeAreaMM2)}</TD><TD right>m²</TD></tr>
            <tr><TD>Sparingen (ramen/deuren)</TD><TD right mono>{m2(totals.openingsAreaMM2)}</TD><TD right>m²</TD></tr>
            <tr><TD>Netto geveloppervlak</TD><TD right mono bold>{m2(totals.netFacadeAreaMM2)}</TD><TD right>m²</TD></tr>
            {totals.penantAreaMM2 > 0 && <tr><TD>Penant oppervlak (voor + zijkanten)</TD><TD right mono>{m2(totals.penantAreaMM2)}</TD><TD right>m²</TD></tr>}
            {totals.hoekprofielLengthMM > 0 && <tr><TD>Alu. hoekprofiel (L) penanten</TD><TD right mono>{(totals.hoekprofielLengthMM / 1000).toFixed(2)}</TD><TD right>m¹</TD></tr>}
            {totals.uSectiesCount > 0 && <tr><TD>Penant U-secties (totaal)</TD><TD right mono>{totals.uSectiesCount}</TD><TD right>st.</TD></tr>}
            {totals.vertikaleLattenLengthMM > 0 && <tr><TD>Vert. bevestigingslatten penanten (90×50)</TD><TD right mono>{(totals.vertikaleLattenLengthMM / 1000).toFixed(2)}</TD><TD right>m¹</TD></tr>}

            <SectionHeader title="Panelen" />
            {totals.panelCount > 0 ? <>
              <tr><TD>Aantal panelen totaal</TD><TD right mono bold>{totals.panelCount}</TD><TD right>st</TD></tr>
              <tr><TD>Totaal paneeloppervlak</TD><TD right mono>{m2(totals.panelAreaMM2)}</TD><TD right>m²</TD></tr>
              <tr><TD>Totaal panelen gewicht (incl. strips)</TD><TD right mono>{totals.panelWeightKg.toFixed(1)}</TD><TD right>kg</TD></tr>
            </> : <tr><TD span={3} color="#94a3b8">Geen panelen geconfigureerd</TD></tr>}

            <SectionHeader title="Houten latten" />
            {totals.lattenCount > 0 ? <>
              <tr><TD>Aantal latten totaal</TD><TD right mono bold>{totals.lattenCount}</TD><TD right>st</TD></tr>
              <tr><TD>Totale latlengte</TD><TD right mono>{(totals.lattenLengthMM / 1000).toFixed(1)}</TD><TD right>m</TD></tr>
            </> : <tr><TD span={3} color="#94a3b8">Geen latten geconfigureerd</TD></tr>}

            <SectionHeader title="Materialen per groep" />
            {takeoffs.map((to) => {
              const totalStripsTo = Object.values(to.stripCount).reduce((s, n) => s + n, 0);
              const panelCountTo = Object.values(to.panelGroups).reduce((s, pg) => s + pg.count, 0);
              const lattenCountTo = Object.values(to.lattenSummary).reduce((s, n) => s + n, 0);
              return (
                <React.Fragment key={to.groupId}>
                  <tr style={{ background: '#f8fafc' }}>
                    <td colSpan={99} style={{ padding: '5px 10px', fontSize: 11, fontWeight: 700, color: '#1e293b', borderBottom: '1px solid #e2e8f0' }}>
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: to.color, marginRight: 6, verticalAlign: 'middle' }} />{to.name}
                    </td>
                  </tr>
                  <tr>
                    <TD style={{ paddingLeft: 24 }}>&nbsp;&nbsp;— Steenstrips</TD>
                    <TD right mono>{m2(to.netFacadeAreaMM2)}</TD>
                    <TD right>m² &nbsp;·&nbsp; {totalStripsTo.toLocaleString('nl-NL')} st</TD>
                  </tr>
                  {panelCountTo > 0 && (() => {
                    const diff = to.panelAreaMM2 - to.netFacadeAreaMM2;
                    const pct = to.netFacadeAreaMM2 > 0 ? Math.abs(diff) / to.netFacadeAreaMM2 * 100 : 0;
                    const ok = pct < 2;
                    return <>
                      <tr>
                        <TD>&nbsp;&nbsp;— Panelen</TD>
                        <TD right mono>{m2(to.panelAreaMM2)}</TD>
                        <TD right>m² &nbsp;·&nbsp; {panelCountTo} st</TD>
                      </tr>
                      <tr style={{ background: ok ? '#f0fdf4' : '#fff7ed' }}>
                        <TD style={{ paddingLeft: 20, fontSize: 10, color: ok ? '#166534' : '#9a3412' }}>&nbsp;&nbsp;&nbsp;&nbsp;{ok ? '✓' : '⚠'} paneel vs. strips</TD>
                        <TD right mono style={{ fontSize: 10, color: ok ? '#166534' : '#9a3412' }}>{diff >= 0 ? '+' : ''}{m2(diff)}</TD>
                        <TD right style={{ fontSize: 10, color: ok ? '#166534' : '#9a3412' }}>{ok ? `m² akkoord (${pct.toFixed(1)}%)` : `m² afwijking ${pct.toFixed(1)}%`}</TD>
                      </tr>
                      {to.noPanelZonesCount > 0 && (
                        <tr style={{ background: ok ? '#f0fdf4' : '#fff7ed' }}>
                          <TD style={{ paddingLeft: 20, fontSize: 10, color: '#64748b' }}>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↳ {to.noPanelZonesCount} zone{to.noPanelZonesCount > 1 ? 's' : ''} te smal/laag</TD>
                          <TD right mono style={{ fontSize: 10, color: '#64748b' }}>{m2(to.noPanelZonesAreaMM2)}</TD>
                          <TD right style={{ fontSize: 10, color: '#64748b' }}>m²</TD>
                        </tr>
                      )}
                    </>;
                  })()}
                  {lattenCountTo > 0 && (
                    <tr>
                      <TD>&nbsp;&nbsp;— Houten latten</TD>
                      <TD right mono>{(to.totalLattenLengthMM / 1000).toFixed(1)}</TD>
                      <TD right>m¹ &nbsp;·&nbsp; {lattenCountTo} st</TD>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {takeoffs.length > 1 && (() => {
              const grandTotalStrips = takeoffs.reduce((s, to) => s + Object.values(to.stripCount).reduce((a, n) => a + n, 0), 0);
              return (
                <tr style={{ background: '#f0fdf4' }}>
                  <TD bold>Totaal steenstrips</TD>
                  <TD right mono bold>{m2(totals.netFacadeAreaMM2)}</TD>
                  <TD right>m² &nbsp;·&nbsp; {grandTotalStrips.toLocaleString('nl-NL')} st</TD>
                </tr>
              );
            })()}
          </tbody>
        </table>

        }

        {takeoffs.map((to) => {
          const panelEntries = Object.entries(to.panelGroups).sort((a, b) => b[1].count - a[1].count);
          const lattenEntries = Object.entries(to.lattenSummary).sort((a, b) => b[1] - a[1]);
          const totalStrips = Object.values(to.stripCount).reduce((s, n) => s + n, 0);

          return (
            <table key={to.groupId} style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderRadius: 6, overflow: 'hidden', marginBottom: 24 }}>
              <thead>
                <tr style={{ background: to.color }}>
                  <th colSpan={99} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#fff' }}>
                    {to.name} — {mm2(to.groupWidth)} × {mm2(to.groupHeight)} mm — netto {m2(to.netFacadeAreaMM2)} m²
                  </th>
                </tr>
                <tr style={{ background: '#f1f5f9' }}>
                  <TH>Omschrijving</TH>
                  <TH right>Waarde</TH>
                  <TH right>Eenheid</TH>
                </tr>
              </thead>
              <tbody>
                <SectionHeader title="Oppervlakten" />
                <tr><TD>Bruto geveloppervlak</TD><TD right mono>{m2(to.facadeAreaMM2)}</TD><TD right>m²</TD></tr>
                <tr><TD>Sparingen ({to.openingsCount}×)</TD><TD right mono>{m2(to.openingsAreaMM2)}</TD><TD right>m²</TD></tr>
                <tr><TD>Netto geveloppervlak</TD><TD right mono bold>{m2(to.netFacadeAreaMM2)}</TD><TD right>m²</TD></tr>
                {to.penantAreaMM2 > 0 && <tr><TD>Penant oppervlak</TD><TD right mono>{m2(to.penantAreaMM2)}</TD><TD right>m²</TD></tr>}

                <SectionHeader title="Steenstrips" />
                <tr><TD>Netto geveloppervlak</TD><TD right mono>{m2(to.netFacadeAreaMM2)}</TD><TD right>m²</TD></tr>
                <tr><TD>Totaal strips</TD><TD right mono bold>{totalStrips}</TD><TD right>st</TD></tr>
                {to.stripCount.Strek > 0 && <tr><TD>— Streksteen ({to.mat.steenL}×{to.mat.steenH} mm)</TD><TD right mono>{to.stripCount.Strek}</TD><TD right>st</TD></tr>}
                {to.stripCount.Kop > 0 && <tr><TD>— Kopsteen</TD><TD right mono>{to.stripCount.Kop}</TD><TD right>st</TD></tr>}
                {to.stripCount.Drieklezoor > 0 && <tr><TD>— Drieklezoor</TD><TD right mono>{to.stripCount.Drieklezoor}</TD><TD right>st</TD></tr>}
                {to.stripCount.Rest > 0 && <tr><TD>— Snijstrip (rest)</TD><TD right mono>{to.stripCount.Rest}</TD><TD right>st</TD></tr>}
                {to.stripCount.Tegel > 0 && <tr><TD>— Tegels</TD><TD right mono>{to.stripCount.Tegel}</TD><TD right>st</TD></tr>}

                {panelEntries.length > 0 && (() => {
                  const diff = to.panelAreaMM2 - to.netFacadeAreaMM2;
                  const pct = to.netFacadeAreaMM2 > 0 ? Math.abs(diff) / to.netFacadeAreaMM2 * 100 : 0;
                  const ok = pct < 2;
                  const gapRest = Math.abs(diff) - to.noPanelZonesAreaMM2;
                  return <>
                    <SectionHeader title="Panelen" />
                    {panelEntries.map(([key, pg]) => (
                      <tr key={key}>
                        <TD>Paneel {mm2(pg.width)} × {mm2(pg.height)} mm</TD>
                        <TD right mono bold>{pg.count}</TD>
                        <TD right>st ({m2(pg.areaMM2)} m² · {pg.weightKg.toFixed(1)} kg)</TD>
                      </tr>
                    ))}
                    <tr style={{ background: ok ? '#f0fdf4' : '#fff7ed' }}>
                      <TD><span style={{ marginRight: 4 }}>{ok ? '✓' : '⚠'}</span>Controle paneeloppervlak vs. steenstrips</TD>
                      <TD right mono style={{ color: ok ? '#166534' : '#9a3412' }}>{diff >= 0 ? '+' : ''}{m2(diff)}</TD>
                      <TD right style={{ color: ok ? '#166534' : '#9a3412' }}>{ok ? `m² — akkoord (${pct.toFixed(1)}%)` : `m² — afwijking ${pct.toFixed(1)}%`}</TD>
                    </tr>
                    {to.noPanelZonesCount > 0 && (
                      <tr style={{ background: ok ? '#f0fdf4' : '#fff7ed' }}>
                        <TD style={{ color: '#64748b', fontSize: 10 }}>&nbsp;&nbsp;&nbsp;↳ {to.noPanelZonesCount} zone{to.noPanelZonesCount > 1 ? 's' : ''} zonder panelen (te smal/laag)</TD>
                        <TD right mono style={{ color: '#64748b', fontSize: 10 }}>{m2(to.noPanelZonesAreaMM2)}</TD>
                        <TD right style={{ color: '#64748b', fontSize: 10 }}>m²{gapRest > 1 ? ` · overige gap/afr.: ${m2(gapRest)} m²` : ''}</TD>
                      </tr>
                    )}
                  </>;
                })()}

                {lattenEntries.length > 0 && <>
                  <SectionHeader title="Houten latten" />
                  {lattenEntries.map(([len, cnt]) => (
                    <tr key={len}>
                      <TD>Lat {(Number(len) / 1000).toFixed(3)} m</TD>
                      <TD right mono bold>{cnt}</TD>
                      <TD right>st</TD>
                    </tr>
                  ))}
                </>}

                {to.steenstripsArtikelen?.length > 0 && <>
                  <SectionHeader title="Steenstrips — materiaalkosten" />
                  {to.steenstripsArtikelen.map((artId) => {
                    const art = STEENSTRIP_CATALOG.find((a) => a.id === artId);
                    if (!art) return null;
                    const fColors = { WF: '#92400e', DF: '#065f46', NF: '#1e3a8a', Klinker: '#4c1d95', LF: '#9a3412' };
                    const fColor = fColors[art.formatCode] ?? '#64748b';
                    const netM2 = to.netFacadeAreaMM2 / 1e6;
                    const berekendStuks = Math.ceil(netM2 * (art.stuksPerM2 ?? 80));
                    const totaalExBtw = art.prijsPerStuk != null ? berekendStuks * art.prijsPerStuk : null;
                    const totaalInclBtw = totaalExBtw != null ? totaalExBtw * 1.21 : null;
                    return (
                      <React.Fragment key={artId}>
                        <tr>
                          <TD span={3}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, fontSize: 11 }}>{art.naam}</span>
                              <span style={{ background: fColor, color: '#fff', borderRadius: 3, padding: '1px 5px', fontSize: 9, fontWeight: 600 }}>{art.formatCode}</span>
                              {art.kleur && <span style={{ fontSize: 10, color: '#475569' }}>Kleur: {art.kleur}</span>}
                              {art.behandeling && <span style={{ fontSize: 10, color: '#475569' }}>{art.behandeling}</span>}
                            </div>
                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                              {art.fabrikant}{art.serie ? ` — ${art.serie}` : ''}
                              {art.artikelnummer && <span style={{ color: '#94a3b8', marginLeft: 4 }}>#{art.artikelnummer}</span>}
                            </div>
                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
                              {art.steenL}×{art.steenH}×{art.dikte} mm · voeg {art.lint}/{art.stoot} mm · {art.brickWeightM2} kg/m²
                              {art.kleurOmschrijving && <span> · {art.kleurOmschrijving}</span>}
                            </div>
                            {art.prijsEenheid && <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 1, fontStyle: 'italic' }}>{art.prijsEenheid}{art.prijslijstDatum ? ` (prijslijst ${art.prijslijstDatum})` : ''}</div>}
                          </TD>
                        </tr>
                        <tr>
                          <TD>Netto geveloppervlak</TD>
                          <TD right mono>{netM2.toFixed(2)}</TD>
                          <TD right>m²</TD>
                        </tr>
                        <tr>
                          <TD>Stuks per m²</TD>
                          <TD right mono>{art.stuksPerM2 ?? '—'}</TD>
                          <TD right>st/m²</TD>
                        </tr>
                        <tr>
                          <TD>Berekend aantal strips</TD>
                          <TD right mono bold>{berekendStuks.toLocaleString('nl-NL')}</TD>
                          <TD right>stuks</TD>
                        </tr>
                        {art.aantalPerPallet && (() => {
                          const vollePallets = Math.ceil(berekendStuks / art.aantalPerPallet);
                          const stuksOpPallet = vollePallets * art.aantalPerPallet;
                          const palletM2 = art.palletM2 ?? (art.aantalPerPallet / (art.stuksPerM2 ?? 76));
                          const totaalPalletM2 = vollePallets * palletM2;
                          return (
                            <>
                              <tr>
                                <TD>Stuks per pallet</TD>
                                <TD right mono>{art.aantalPerPallet.toLocaleString('nl-NL')}</TD>
                                <TD right>st/pallet</TD>
                              </tr>
                              <tr>
                                <TD>Benodigd pallets (afgerond omhoog)</TD>
                                <TD right mono bold>{vollePallets}</TD>
                                <TD right>pallets</TD>
                              </tr>
                              <tr>
                                <TD>Totaal bestellen (volle pallets)</TD>
                                <TD right mono>{stuksOpPallet.toLocaleString('nl-NL')}</TD>
                                <TD right>stuks</TD>
                              </tr>
                              {palletM2 > 0 && (
                                <tr>
                                  <TD>Totaal oppervlak (volle pallets)</TD>
                                  <TD right mono>{totaalPalletM2.toFixed(1)}</TD>
                                  <TD right>m²</TD>
                                </tr>
                              )}
                            </>
                          );
                        })()}
                        {art.prijsPerStuk != null && (() => {
                          const vollePallets = art.aantalPerPallet ? Math.ceil(berekendStuks / art.aantalPerPallet) : null;
                          const stuksOpPallet = vollePallets ? vollePallets * art.aantalPerPallet : berekendStuks;
                          const totaalBestelling = stuksOpPallet * art.prijsPerStuk;
                          const totaalBestellingInclBtw = totaalBestelling * 1.21;
                          return (
                            <>
                              <tr>
                                <TD>Prijs per stuk</TD>
                                <TD right mono>€ {art.prijsPerStuk.toFixed(3)}</TD>
                                <TD right>per st</TD>
                              </tr>
                              <tr>
                                <TD>Eenheidsprijs per m²</TD>
                                <TD right mono>€ {art.prijsM2.toFixed(2)}</TD>
                                <TD right>per m²</TD>
                              </tr>
                              {vollePallets && art.prijsPerDuizend && (
                                <tr>
                                  <TD>Prijs per 1.000 stuks incl. pallet</TD>
                                  <TD right mono>€ {art.prijsPerDuizend.toFixed(2)}</TD>
                                  <TD right>per 1000 st</TD>
                                </tr>
                              )}
                              <tr style={{ background: '#f8fafc' }}>
                                <TD><span style={{ fontWeight: 600 }}>Totaal bestelling ({vollePallets ? `${vollePallets} pallet${vollePallets > 1 ? 's' : ''}` : `${stuksOpPallet} st`}) ex. BTW</span></TD>
                                <TD right mono bold>€ {totaalBestelling.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TD>
                                <TD right>excl. BTW</TD>
                              </tr>
                              <tr style={{ background: '#eff6ff' }}>
                                <TD><span style={{ fontWeight: 700, color: '#1e3a5f' }}>Totaal bestelling incl. BTW (21%)</span></TD>
                                <TD right mono bold style={{ color: '#1e3a5f' }}>€ {totaalBestellingInclBtw.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TD>
                                <TD right style={{ color: '#1e3a5f' }}>incl. BTW</TD>
                              </tr>
                              {art.pallettoeslag && (
                                <tr>
                                  <TD span={3} color="#92400e"><span style={{ fontSize: 9 }}>⚠ Levering per volle pallet ({art.palletM2 ?? 25} m²). Deelpallet toeslag: € {art.pallettoeslag}. Prijzen {art.prijsEenheid ?? 'excl. BTW'}.</span></TD>
                                </tr>
                              )}
                            </>
                          );
                        })()}
                        {art.prijsPerStuk == null && (
                          <tr>
                            <TD span={3} color="#94a3b8">Prijs voor dit artikel is nader te bepalen — voer prijs in via artikelkeuze.</TD>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </>}

                {to.lattenArtikelen?.length > 0 && <>
                  <SectionHeader title="Latten artikelkeuze (Mulder's Houtimport)" />
                  {to.lattenArtikelen.map((artId) => {
                    const art = BATTEN_CATALOG.find((a) => a.id === artId);
                    if (!art) return null;
                    const bColor = art.brandklasse === 'B-s1,d0' ? '#dc2626' : '#2563eb';
                    return (
                      <tr key={artId}>
                        <TD>
                          <span style={{ fontWeight: 600 }}>{art.naam}</span>
                          <span style={{ color: '#64748b', fontSize: 10, marginLeft: 6 }}>{art.afmetingen}</span>
                          <span style={{ background: bColor, color: '#fff', borderRadius: 3, padding: '1px 5px', fontSize: 9, fontWeight: 600, marginLeft: 6 }}>{art.brandklasse}</span>
                        </TD>
                        <TD right mono>€ {art.prijsM1.toFixed(3)}</TD>
                        <TD right>per m¹</TD>
                      </tr>
                    );
                  })}
                </>}
              </tbody>
            </table>
          );
        })}

        {(() => {
          const hasAny = Object.keys(bestellijst.strips).length > 0 || Object.keys(bestellijst.basisplaten).length > 0 || Object.keys(bestellijst.latten).length > 0;
          if (!hasAny) return null;
          const fColors = { WF: '#92400e', DF: '#065f46', NF: '#1e3a8a', Klinker: '#4c1d95', LF: '#9a3412' };
          return (
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderRadius: 6, overflow: 'hidden', marginBottom: 24 }}>
              <thead>
                <tr style={{ background: '#064e3b' }}>
                  <th colSpan={99} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 13, fontWeight: 700, color: '#f0fdf4' }}>BESTELLIJST TOTAAL — alle groepen</th>
                </tr>
                <tr style={{ background: '#f1f5f9' }}>
                  <TH>Omschrijving</TH>
                  <TH right>Waarde</TH>
                  <TH right>Eenheid</TH>
                </tr>
              </thead>
              <tbody>

                {Object.keys(bestellijst.strips).length > 0 && <>
                  <SectionHeader title="Steenstrips" />
                  {Object.entries(bestellijst.strips).map(([artId, entry]) => {
                    const { art, netM2, stuks, pallets, stuksOpPallet } = entry;
                    if (!art) return null;
                    const fColor = fColors[art.formatCode] ?? '#64748b';
                    const prijsExBtw = art.prijsPerStuk != null && stuksOpPallet != null ? stuksOpPallet * art.prijsPerStuk : null;
                    const prijsInclBtw = prijsExBtw != null ? prijsExBtw * 1.21 : null;
                    return (
                      <React.Fragment key={artId}>
                        <tr>
                          <TD span={3}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, fontSize: 11 }}>{art.naam}</span>
                              <span style={{ background: fColor, color: '#fff', borderRadius: 3, padding: '1px 5px', fontSize: 9, fontWeight: 600 }}>{art.formatCode}</span>
                              {art.kleur && <span style={{ fontSize: 10, color: '#475569' }}>Kleur: {art.kleur}</span>}
                              {art.behandeling && <span style={{ fontSize: 10, color: '#475569' }}>{art.behandeling}</span>}
                            </div>
                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
                              {art.fabrikant}{art.serie ? ` — ${art.serie}` : ''}
                              {art.artikelnummer && <span style={{ color: '#94a3b8', marginLeft: 4 }}>#{art.artikelnummer}</span>}
                              <span style={{ color: '#94a3b8', marginLeft: 8 }}>Groepen: {entry.groepen.join(', ')}</span>
                            </div>
                          </TD>
                        </tr>
                        <tr><TD>Totaal netto geveloppervlak</TD><TD right mono>{netM2.toFixed(2)}</TD><TD right>m²</TD></tr>
                        <tr><TD>Berekend aantal strips (incl. uitval)</TD><TD right mono bold>{stuks?.toLocaleString('nl-NL') ?? '—'}</TD><TD right>stuks</TD></tr>
                        {pallets != null && <>
                          <tr><TD>Benodigd pallets ({art.aantalPerPallet?.toLocaleString('nl-NL')} st/pallet)</TD><TD right mono bold>{pallets}</TD><TD right>pallets</TD></tr>
                          <tr><TD>Totaal bestellen (volle pallets)</TD><TD right mono>{stuksOpPallet?.toLocaleString('nl-NL')}</TD><TD right>stuks</TD></tr>
                        </>}
                        {prijsExBtw != null && <>
                          <tr style={{ background: '#f8fafc' }}><TD><span style={{ fontWeight: 600 }}>Totaal ex. BTW</span></TD><TD right mono bold>€ {prijsExBtw.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TD><TD right>excl. BTW</TD></tr>
                          <tr style={{ background: '#f0fdf4' }}><TD><span style={{ fontWeight: 700, color: '#064e3b' }}>Totaal incl. BTW (21%)</span></TD><TD right mono bold style={{ color: '#064e3b' }}>€ {prijsInclBtw.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TD><TD right style={{ color: '#064e3b' }}>incl. BTW</TD></tr>
                        </>}
                        {art.prijsPerStuk == null && <tr><TD span={3} color="#94a3b8">Prijs nader te bepalen.</TD></tr>}
                      </React.Fragment>
                    );
                  })}
                </>}

                {Object.keys(bestellijst.basisplaten).length > 0 && <>
                  <SectionHeader title="Basisplaten" />
                  {Object.entries(bestellijst.basisplaten).map(([id, entry]) => {
                    const { plaat, panelAreaM2, plaatOppM2, aantalPlaten } = entry;
                    if (!plaat) return null;
                    return (
                      <React.Fragment key={id}>
                        <tr>
                          <TD span={3}>
                            <div style={{ fontWeight: 700, fontSize: 11 }}>{plaat.naam}</div>
                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
                              {plaat.fabrikant} · {plaat.dikteMM} mm · {plaat.gewichtM2} kg/m²
                              <span style={{ color: '#94a3b8', marginLeft: 8 }}>Groepen: {entry.groepen.join(', ')}</span>
                            </div>
                          </TD>
                        </tr>
                        <tr><TD>Totaal paneeloppervlak</TD><TD right mono>{panelAreaM2.toFixed(2)}</TD><TD right>m²</TD></tr>
                        <tr><TD>Standaardplaat {plaat.plaatBreedte}×{plaat.plaatLengtes?.[0] ?? '?'} mm</TD><TD right mono>{plaatOppM2.toFixed(2)}</TD><TD right>m²/plaat</TD></tr>
                        {aantalPlaten != null && <tr><TD><span style={{ fontWeight: 600 }}>Benodigd aantal platen (afgerond omhoog)</span></TD><TD right mono bold>{aantalPlaten}</TD><TD right>stuks</TD></tr>}
                      </React.Fragment>
                    );
                  })}
                </>}

                {Object.keys(bestellijst.latten).length > 0 && <>
                  <SectionHeader title="Houten latten" />
                  {Object.entries(bestellijst.latten).map(([artId, entry]) => {
                    const { art, lengthMM } = entry;
                    const lengthM = lengthMM / 1000;
                    const prijsExBtw = art?.prijsM1 != null ? lengthM * art.prijsM1 : null;
                    const prijsInclBtw = prijsExBtw != null ? prijsExBtw * 1.21 : null;
                    return (
                      <React.Fragment key={artId}>
                        <tr>
                          <TD span={3}>
                            {art ? <>
                              <div style={{ fontWeight: 700, fontSize: 11 }}>{art.naam}</div>
                              <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
                                {art.afmetingen} · brandklasse {art.brandklasse}
                                <span style={{ color: '#94a3b8', marginLeft: 8 }}>Groepen: {entry.groepen.join(', ')}</span>
                              </div>
                            </> : <div style={{ fontWeight: 600, fontSize: 11, color: '#475569' }}>Latten — artikel niet geselecteerd</div>}
                          </TD>
                        </tr>
                        <tr><TD>Totale latlengte</TD><TD right mono bold>{lengthM.toFixed(1)}</TD><TD right>m¹</TD></tr>
                        {prijsExBtw != null && <>
                          <tr style={{ background: '#f8fafc' }}><TD><span style={{ fontWeight: 600 }}>Totaal ex. BTW</span></TD><TD right mono bold>€ {prijsExBtw.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TD><TD right>excl. BTW</TD></tr>
                          <tr style={{ background: '#f0fdf4' }}><TD><span style={{ fontWeight: 700, color: '#064e3b' }}>Totaal incl. BTW (21%)</span></TD><TD right mono bold style={{ color: '#064e3b' }}>€ {prijsInclBtw.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TD><TD right style={{ color: '#064e3b' }}>incl. BTW</TD></tr>
                        </>}
                        {art && art.prijsM1 == null && <tr><TD span={3} color="#94a3b8">Prijs nader te bepalen.</TD></tr>}
                      </React.Fragment>
                    );
                  })}
                </>}

              </tbody>
            </table>
          );
        })()}

        {(() => {
          const allOpenings = takeoffs.flatMap((to) => to.groupOpenings ?? []);
          if (!allOpenings.length) return null;
          const byKey = {};
          for (const op of allOpenings) {
            const key = openingSizeKey(op);
            if (!byKey[key]) byKey[key] = { rep: op, count: 0 };
            byKey[key].count++;
          }
          const entries = Object.values(byKey).sort((a, b) => b.count - a.count);
          const clusters = clusterEntries(entries);
          return (
            <div style={{ background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderRadius: 6, overflow: 'hidden', marginBottom: 24 }}>
              <div style={{ padding: '10px 14px', background: '#0f172a', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>SPARINGTYPES</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: 16 }}>
                {clusters.map((cluster, i) => (
                  <ClusterCard key={i} cluster={cluster} />
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
