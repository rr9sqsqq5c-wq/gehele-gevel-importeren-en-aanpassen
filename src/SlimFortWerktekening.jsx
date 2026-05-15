import { useState, useMemo } from 'react';
import { computeProductionData } from './lib/production.js';

const VIEW_W = 1100;
const PAD_L = 80;
const PAD_R = 60;
const PAD_T = 54;
const PAD_B = 54;
const DIM_GAP = 22;
const FONT_DIM = 9;
const FONT_LBL = 8;
const ARROW_SZ = 4;

const SHEET_W_MM = 3005;
const SHEET_H_MM = 1200;

const PANEL_COLORS = {
  start: '#16a34a',
  standard: '#2563eb',
  end: '#dc2626',
  clipped: '#ea580c',
  return: '#7c3aed',
  portal: '#94a3b8',
};

const PORTAL_FTYPES = new Set(['portal-left', 'portal-right', 'portalLeft', 'portalRight', 'portal']);

const FACE_LABEL = { front: 'Voorgevel', 'side-left': 'Linker teruggevel', 'side-right': 'Rechter teruggevel' };

function arrow(x1, y1, x2, y2, sz = ARROW_SZ) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;
  return `M${x2},${y2} L${x2 - ux * sz + px * sz * 0.4},${y2 - uy * sz + py * sz * 0.4} L${x2 - ux * sz - px * sz * 0.4},${y2 - uy * sz - py * sz * 0.4} Z`;
}

function DimH({ x1, x2, y, label, color = '#1e3a5f' }) {
  const mid = (x1 + x2) / 2;
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={color} strokeWidth={0.6} />
      <path d={arrow(x2, y, x1, y)} fill={color} />
      <path d={arrow(x1, y, x2, y)} fill={color} />
      <line x1={x1} y1={y - 12} x2={x1} y2={y + 4} stroke={color} strokeWidth={0.4} strokeDasharray="2,2" />
      <line x1={x2} y1={y - 12} x2={x2} y2={y + 4} stroke={color} strokeWidth={0.4} strokeDasharray="2,2" />
      <text x={mid} y={y - 5} textAnchor="middle" fontSize={FONT_DIM} fill={color} fontFamily="Arial, sans-serif">{label}</text>
    </g>
  );
}

function DimV({ x, y1, y2, label, color = '#1e3a5f', side = 'left' }) {
  const mid = (y1 + y2) / 2;
  const tx = side === 'left' ? x - 5 : x + 5;
  const anchor = side === 'left' ? 'end' : 'start';
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={color} strokeWidth={0.6} />
      <path d={arrow(x, y2, x, y1)} fill={color} />
      <path d={arrow(x, y1, x, y2)} fill={color} />
      <line x1={x - 10} y1={y1} x2={x + 4} y2={y1} stroke={color} strokeWidth={0.4} strokeDasharray="2,2" />
      <line x1={x - 10} y1={y2} x2={x + 4} y2={y2} stroke={color} strokeWidth={0.4} strokeDasharray="2,2" />
      <text x={tx} y={mid} textAnchor={anchor} dominantBaseline="middle" fontSize={FONT_DIM} fill={color} fontFamily="Arial, sans-serif" transform={`rotate(-90,${tx},${mid})`}>{label}</text>
    </g>
  );
}

function SvgWrapper({ height, children, title, pageLabel }) {
  return (
    <svg
      width={VIEW_W}
      height={height}
      viewBox={`0 0 ${VIEW_W} ${height}`}
      style={{ background: '#fff', display: 'block', boxShadow: '0 2px 8px rgba(0,0,0,0.10)', marginBottom: 8 }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x={0} y={0} width={VIEW_W} height={height} fill="#fff" />
      {title && (
        <text x={PAD_L} y={20} fontSize={11} fontWeight="bold" fill="#1e3a5f" fontFamily="Arial, sans-serif">{title}</text>
      )}
      {pageLabel && (
        <text x={VIEW_W - PAD_R} y={20} fontSize={FONT_LBL} fill="#94a3b8" fontFamily="Arial, sans-serif" textAnchor="end">{pageLabel}</text>
      )}
      <line x1={PAD_L} y1={26} x2={VIEW_W - PAD_R} y2={26} stroke="#e2e8f0" strokeWidth={1} />
      <g transform={`translate(0,34)`}>{children}</g>
    </svg>
  );
}

function SheetOverzicht({ slimFortFaces, wallDecomposition, productionData, groupName }) {
  const primaryFaces = (slimFortFaces ?? []).filter((f) => !PORTAL_FTYPES.has(f.faceType));
  const settings = primaryFaces[0]?.grid?.settings ?? {};
  const {
    rearZoneThickness = 39,
    mainThickness = 116,
    tongueGrooveDepth = 41,
    totalThickness = 196,
    bracketDepth = 50,
    profileDepth = 63,
    bracketWidth = 128,
    bracketHeight = 60,
    profileWidth = 44,
    profileHeight = 44,
    elementLength = 1200,
    elementHeight = 600,
    orientation = 'horizontal',
  } = settings;

  const segments = (wallDecomposition?.segments ?? []).filter((s) => !PORTAL_FTYPES.has(s.wallType));
  const summary = productionData?.summary ?? {};

  const DRAW_X = PAD_L;
  const DRAW_Y = 10;

  const CSX = DRAW_X;
  const CSY = DRAW_Y;
  const CS_SCALE = 1.5;
  const WALL_W = 60;
  const CS_H = 80;

  const rearW = Math.round(rearZoneThickness * CS_SCALE);
  const mainW = Math.round(mainThickness * CS_SCALE);
  const tgW = Math.round(tongueGrooveDepth * CS_SCALE);
  const wallW = WALL_W;
  const totalW = wallW + rearW + mainW + tgW;

  const zoneY = CSY + 20;
  const zoneH = CS_H;

  const zones = [
    { x: CSX, w: wallW, fill: '#e2e8f0', label: 'Betonwand', mm: null, hatch: true },
    { x: CSX + wallW, w: rearW, fill: '#fef3c7', label: `Achterspouw\n${rearZoneThickness}mm`, mm: rearZoneThickness },
    { x: CSX + wallW + rearW, w: mainW, fill: '#dbeafe', label: `EPS kern\n${mainThickness}mm`, mm: mainThickness },
    { x: CSX + wallW + rearW + mainW, w: tgW, fill: '#ede9fe', label: `T&G\n${tongueGrooveDepth}mm`, mm: tongueGrooveDepth },
  ];

  const totalLineY = zoneY + zoneH + 28;

  const TABLE_X = CSX + totalW + 60;
  const TABLE_Y = DRAW_Y;
  const COL_WIDTHS = [110, 70, 70, 60, 60, 60];
  const COL_HEADERS = ['Segment', 'Breedte', 'Hoogte', 'Panelen', 'Profielen', 'Beugels'];
  const ROW_H = 16;
  const TABLE_W = COL_WIDTHS.reduce((a, b) => a + b, 0);

  const panelsByFace = {};
  for (const p of (productionData?.panels ?? [])) {
    if (!panelsByFace[p.faceId]) panelsByFace[p.faceId] = 0;
    panelsByFace[p.faceId]++;
  }
  const profilesByFace = {};
  for (const p of (productionData?.profileSegments ?? [])) {
    if (!profilesByFace[p.faceId]) profilesByFace[p.faceId] = 0;
    profilesByFace[p.faceId]++;
  }

  const tableRows = primaryFaces.map((f) => {
    const bracketCount = f.grid?.brackets?.length ?? 0;
    return [
      FACE_LABEL[f.faceType] ?? f.faceType,
      `${Math.round(f.width)} mm`,
      `${Math.round(f.height)} mm`,
      String(panelsByFace[f.faceId] ?? 0),
      String(profilesByFace[f.faceId] ?? 0),
      String(bracketCount),
    ];
  });

  const tableH = (tableRows.length + 1) * ROW_H + 8;
  const SUMMARY_Y = TABLE_Y + tableH + 24;
  const sumItems = [
    ['Totaal EPS-panelen', `${summary.totalPanels ?? 0} st.`],
    ['Zaagtafels nodig', `${summary.totalSheets ?? 0} st.`],
    ['Materiaalverspilling', `${(summary.wastePercent ?? 0).toFixed(1)}%`],
    ['Profielsegmenten', `${summary.profileSegmentCount ?? 0} st.`],
    ['Gesplitste panelen', `${summary.overweightSplitCount ?? 0} st.`],
  ];
  const sumColW = [160, 100];
  const sumH = sumItems.length * ROW_H + 28;

  const EPS_INFO_Y = DRAW_Y + 20;
  const EPS_INFO_X = CSX;
  const epsInfoLines = [
    `Orientatie: ${orientation}`,
    `Elementmaat: ${elementLength} × ${elementHeight} mm`,
    `Beugelafmeting: ${bracketWidth} × ${bracketHeight} mm`,
    `Profielafmeting: ${profileWidth} × ${profileHeight} mm`,
    `Profieldepth: ${profileDepth} mm`,
  ];

  const svgH = PAD_T + Math.max(zoneY + zoneH + 80 + epsInfoLines.length * 14, tableH + sumH + 80) + PAD_B;

  return (
    <SvgWrapper height={svgH} title={`SlimFort XT® — Systeemoverzicht${groupName ? ' — ' + groupName : ''}`} pageLabel="SF-OVERZICHT">
      {zones.map((z, i) => (
        <g key={i}>
          <rect x={z.x} y={zoneY} width={z.w} height={zoneH} fill={z.fill} stroke="#334155" strokeWidth={z.hatch ? 1.5 : 0.8} />
          {z.hatch && Array.from({ length: Math.ceil((z.w + zoneH) / 8) }, (_, j) => (
            <line key={j}
              x1={z.x + j * 8 - zoneH} y1={zoneY + zoneH}
              x2={z.x + j * 8} y2={zoneY}
              stroke="#94a3b8" strokeWidth={0.5} />
          ))}
          {z.mm != null && (
            <DimH x1={z.x} x2={z.x + z.w} y={zoneY - 14} label={`${z.mm}mm`} />
          )}
          <text x={z.x + z.w / 2} y={zoneY + zoneH / 2 - 4} textAnchor="middle" fontSize={FONT_LBL} fill="#1e3a5f" fontFamily="Arial, sans-serif">{z.label.split('\n')[0]}</text>
          {z.label.split('\n')[1] && (
            <text x={z.x + z.w / 2} y={zoneY + zoneH / 2 + 8} textAnchor="middle" fontSize={FONT_LBL} fill="#1e3a5f" fontFamily="Arial, sans-serif">{z.label.split('\n')[1]}</text>
          )}
        </g>
      ))}

      <line x1={CSX} y1={totalLineY} x2={CSX + totalW} y2={totalLineY} stroke="#1e3a5f" strokeWidth={0.5} strokeDasharray="4,2" />
      <DimH x1={CSX} x2={CSX + totalW} y={totalLineY + 16} label={`Totaal: ${totalThickness}mm`} color="#0f172a" />

      {epsInfoLines.map((line, i) => (
        <text key={i} x={EPS_INFO_X} y={zoneY + zoneH + 52 + i * 13} fontSize={FONT_LBL} fill="#475569" fontFamily="Arial, sans-serif">{line}</text>
      ))}

      <g transform={`translate(${TABLE_X},${TABLE_Y})`}>
        {COL_HEADERS.map((h, ci) => {
          const cx = COL_WIDTHS.slice(0, ci).reduce((a, b) => a + b, 0);
          return (
            <g key={ci}>
              <rect x={cx} y={0} width={COL_WIDTHS[ci]} height={ROW_H + 4} fill="#1e3a5f" />
              <text x={cx + 4} y={ROW_H - 1} fontSize={FONT_LBL} fill="#fff" fontFamily="Arial, sans-serif" fontWeight="bold">{h}</text>
            </g>
          );
        })}
        {tableRows.map((row, ri) => (
          <g key={ri}>
            <rect x={0} y={(ri + 1) * ROW_H + 4} width={TABLE_W} height={ROW_H} fill={ri % 2 === 0 ? '#f8fafc' : '#fff'} stroke="#e2e8f0" strokeWidth={0.4} />
            {row.map((cell, ci) => {
              const cx = COL_WIDTHS.slice(0, ci).reduce((a, b) => a + b, 0);
              return (
                <text key={ci} x={cx + 4} y={(ri + 1) * ROW_H + 4 + ROW_H - 3} fontSize={FONT_LBL} fill="#1e293b" fontFamily="Arial, sans-serif">{cell}</text>
              );
            })}
          </g>
        ))}
        <rect x={0} y={0} width={TABLE_W} height={(tableRows.length + 1) * ROW_H + 8} fill="none" stroke="#334155" strokeWidth={1} />

        <text x={0} y={(tableRows.length + 1) * ROW_H + 24} fontSize={9} fontWeight="bold" fill="#1e3a5f" fontFamily="Arial, sans-serif">Productieoverzicht</text>
        <rect x={0} y={(tableRows.length + 1) * ROW_H + 28} width={sumColW[0] + sumColW[1]} height={sumH} fill="#f8fafc" stroke="#e2e8f0" strokeWidth={0.8} />
        {sumItems.map(([label, val], i) => (
          <g key={i}>
            <text x={4} y={(tableRows.length + 1) * ROW_H + 28 + 14 + i * ROW_H} fontSize={FONT_LBL} fill="#334155" fontFamily="Arial, sans-serif">{label}</text>
            <text x={sumColW[0] + 4} y={(tableRows.length + 1) * ROW_H + 28 + 14 + i * ROW_H} fontSize={FONT_LBL} fill="#1e3a5f" fontFamily="Arial, sans-serif" fontWeight="bold">{val}</text>
          </g>
        ))}
      </g>

      <g transform={`translate(${TABLE_X + TABLE_W + 30},${TABLE_Y})`}>
        <text x={0} y={10} fontSize={9} fontWeight="bold" fill="#1e3a5f" fontFamily="Arial, sans-serif">Legenda paneltypen</text>
        {Object.entries(PANEL_COLORS).filter(([k]) => k !== 'portal').map(([type, color], i) => {
          const labels = { start: 'Start', standard: 'Standaard', end: 'Eind', clipped: 'Bijgesneden', return: 'Terugkeer' };
          return (
            <g key={type} transform={`translate(0,${16 + i * 14})`}>
              <rect x={0} y={-8} width={12} height={10} fill={color} stroke="#334155" strokeWidth={0.5} />
              <text x={16} y={0} fontSize={FONT_LBL} fill="#1e293b" fontFamily="Arial, sans-serif">{labels[type]}</text>
            </g>
          );
        })}
      </g>
    </SvgWrapper>
  );
}

function SheetEps({ slimFortFaces, productionData, activeFaceIdx, onFaceChange }) {
  const primaryFaces = (slimFortFaces ?? []).filter((f) => !PORTAL_FTYPES.has(f.faceType));
  const face = primaryFaces[activeFaceIdx] ?? primaryFaces[0];

  if (!face) {
    return <div style={{ padding: 32, color: '#94a3b8', fontSize: 13 }}>Geen EPS-vlakken beschikbaar.</div>;
  }

  const grid = face.grid ?? {};
  const epsElements = grid.epsElements ?? [];
  const faceW = face.width ?? 0;
  const faceH = face.height ?? 0;

  const DRAW_W = VIEW_W - PAD_L - PAD_R - DIM_GAP * 2;
  const DRAW_H = 460;
  const scaleX = faceW > 0 ? DRAW_W / faceW : 1;
  const scaleY = faceH > 0 ? DRAW_H / faceH : 1;
  const sc = Math.min(scaleX, scaleY);

  const drawW = faceW * sc;
  const drawH = faceH * sc;

  const ox = PAD_L + DIM_GAP;
  const oy = PAD_T + DIM_GAP;

  const panelsByEps = {};
  for (const p of (productionData?.panels ?? [])) {
    if (p.faceId === face.faceId) {
      panelsByEps[p.sourceEpsId] = p;
    }
  }

  const svgH = oy + drawH + DIM_GAP * 3 + PAD_B + 20;

  return (
    <>
      <div style={{ display: 'flex', gap: 4, padding: '8px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
        {primaryFaces.map((f, i) => (
          <button key={f.faceId} onClick={() => onFaceChange(i)}
            style={{ padding: '3px 10px', fontSize: 11, border: '1px solid #cbd5e1', borderRadius: 3, background: i === activeFaceIdx ? '#1e3a5f' : '#fff', color: i === activeFaceIdx ? '#fff' : '#334155', cursor: 'pointer' }}>
            {FACE_LABEL[f.faceType] ?? f.faceType}
          </button>
        ))}
      </div>
      <SvgWrapper height={svgH} title={`EPS-indeling — ${FACE_LABEL[face.faceType] ?? face.faceType}`} pageLabel="SF-EPS">
        <rect x={ox} y={oy} width={drawW} height={drawH} fill="#f1f5f9" stroke="#334155" strokeWidth={1} />

        {epsElements.map((eps) => {
          const panel = panelsByEps[eps.id];
          const pType = panel?.panelType ?? (eps.clipped ? 'clipped' : 'standard');
          const fill = PANEL_COLORS[pType] ?? '#3b82f6';
          const px = ox + eps.x * sc;
          const py = oy + eps.y * sc;
          const pw = eps.width * sc;
          const ph = eps.height * sc;
          return (
            <g key={eps.id}>
              <rect x={px} y={py} width={pw} height={ph} fill={fill} fillOpacity={0.35} stroke={fill} strokeWidth={0.8} />
              {pw > 22 && ph > 12 && (
                <text x={px + pw / 2} y={py + ph / 2 + 3} textAnchor="middle" fontSize={Math.min(FONT_LBL, pw / 5)} fill="#1e293b" fontFamily="Arial, sans-serif">
                  {Math.round(eps.width)}×{Math.round(eps.height)}
                </text>
              )}
              {panel && pw > 16 && ph > 10 && (
                <text x={px + 2} y={py + 8} fontSize={Math.min(6, pw / 6)} fill="#475569" fontFamily="Arial, sans-serif">
                  {panel.panelId}
                </text>
              )}
            </g>
          );
        })}

        <DimH x1={ox} x2={ox + drawW} y={oy - DIM_GAP + 8} label={`${Math.round(faceW)} mm`} />
        <DimV x={ox - DIM_GAP + 8} y1={oy} y2={oy + drawH} label={`${Math.round(faceH)} mm`} />

        {epsElements.length === 0 && (
          <text x={ox + drawW / 2} y={oy + drawH / 2} textAnchor="middle" fontSize={10} fill="#94a3b8" fontFamily="Arial, sans-serif">Geen EPS-elementen</text>
        )}
      </SvgWrapper>
    </>
  );
}

function SheetNesting({ productionData, activeSheetIdx, onSheetChange }) {
  const sheetPlan = productionData?.sheetPlan ?? {};
  const sheets = sheetPlan.sheets ?? [];
  const panels = productionData?.panels ?? [];
  const assignments = sheetPlan.assignments ?? [];

  if (!sheets.length) {
    return (
      <div style={{ padding: 32, color: '#94a3b8', fontSize: 13 }}>Geen nestinggegevens beschikbaar. Voer productieberekening uit.</div>
    );
  }

  const safeIdx = Math.min(activeSheetIdx, sheets.length - 1);
  const sheet = sheets[safeIdx];

  const sheetAssignments = assignments.filter((a) => a.sheetId === sheet?.id);
  const assignedPanels = sheetAssignments.map((a) => {
    const p = panels.find((p) => p.panelId === a.panelId);
    return p ? { ...p, sheetX: a.sheetX, sheetY: a.sheetY, rotated: a.rotated } : null;
  }).filter(Boolean);

  const DRAW_W = VIEW_W - PAD_L - PAD_R - DIM_GAP * 2;
  const sc = DRAW_W / SHEET_W_MM;
  const drawH = SHEET_H_MM * sc;
  const ox = PAD_L + DIM_GAP;
  const oy = PAD_T + DIM_GAP;

  const svgH = oy + drawH + DIM_GAP * 3 + PAD_B + 16;

  const usedArea = sheetAssignments.reduce((sum, a) => {
    const p = panels.find((p) => p.panelId === a.panelId);
    return sum + (p ? p.cutWidth * p.cutHeight : 0);
  }, 0);
  const totalArea = SHEET_W_MM * SHEET_H_MM;
  const wastePercent = totalArea > 0 ? ((1 - usedArea / totalArea) * 100).toFixed(1) : '0.0';

  return (
    <>
      <div style={{ display: 'flex', gap: 4, padding: '8px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', alignItems: 'center' }}>
        {sheets.map((s, i) => (
          <button key={s.id ?? i} onClick={() => onSheetChange(i)}
            style={{ padding: '3px 10px', fontSize: 11, border: '1px solid #cbd5e1', borderRadius: 3, background: i === safeIdx ? '#1e3a5f' : '#fff', color: i === safeIdx ? '#fff' : '#334155', cursor: 'pointer' }}>
            Plaat {i + 1}
          </button>
        ))}
        <span style={{ marginLeft: 16, fontSize: 11, color: '#64748b' }}>
          Totaal {sheets.length} plaat{sheets.length !== 1 ? 'en' : ''} — Verspilling totaal: {(sheetPlan.wastePercent ?? 0).toFixed(1)}%
        </span>
      </div>
      <SvgWrapper height={svgH} title={`EPS-nesting — Plaat ${safeIdx + 1} van ${sheets.length} (${SHEET_W_MM}×${SHEET_H_MM}mm) — verspilling: ${wastePercent}%`} pageLabel="SF-NESTING">
        <rect x={ox} y={oy} width={DRAW_W} height={drawH} fill="#f8fafc" stroke="#334155" strokeWidth={1} />

        {assignedPanels.map((p) => {
          const pw = (p.rotated ? p.cutHeight : p.cutWidth) * sc;
          const ph = (p.rotated ? p.cutWidth : p.cutHeight) * sc;
          const px = ox + (p.sheetX ?? 0) * sc;
          const py = oy + (p.sheetY ?? 0) * sc;
          const fill = PANEL_COLORS[p.panelType] ?? '#3b82f6';
          return (
            <g key={p.panelId}>
              <rect x={px} y={py} width={pw} height={ph} fill={fill} fillOpacity={0.4} stroke={fill} strokeWidth={0.6} />
              {pw > 20 && ph > 12 && (
                <text x={px + pw / 2} y={py + ph / 2 + 3} textAnchor="middle" fontSize={Math.min(7, pw / 5)} fill="#1e293b" fontFamily="Arial, sans-serif">
                  {p.panelId}
                </text>
              )}
              {pw > 30 && ph > 18 && (
                <text x={px + pw / 2} y={py + ph / 2 + 11} textAnchor="middle" fontSize={Math.min(6, pw / 6)} fill="#475569" fontFamily="Arial, sans-serif">
                  {Math.round(p.rotated ? p.cutHeight : p.cutWidth)}×{Math.round(p.rotated ? p.cutWidth : p.cutHeight)}
                </text>
              )}
            </g>
          );
        })}

        <DimH x1={ox} x2={ox + DRAW_W} y={oy - DIM_GAP + 8} label={`${SHEET_W_MM} mm`} />
        <DimV x={ox - DIM_GAP + 8} y1={oy} y2={oy + drawH} label={`${SHEET_H_MM} mm`} />
      </SvgWrapper>
    </>
  );
}

function SheetProfielen({ slimFortFaces, productionData, activeFaceIdx, onFaceChange }) {
  const primaryFaces = (slimFortFaces ?? []).filter((f) => !PORTAL_FTYPES.has(f.faceType));
  const face = primaryFaces[activeFaceIdx] ?? primaryFaces[0];

  if (!face) {
    return <div style={{ padding: 32, color: '#94a3b8', fontSize: 13 }}>Geen vlakken beschikbaar.</div>;
  }

  const grid = face.grid ?? {};
  const profiles = grid.profiles ?? [];
  const faceW = face.width ?? 0;
  const faceH = face.height ?? 0;

  const DRAW_W = VIEW_W - PAD_L - PAD_R - DIM_GAP * 2;
  const DRAW_H = 440;
  const sc = Math.min(faceW > 0 ? DRAW_W / faceW : 1, faceH > 0 ? DRAW_H / faceH : 1);
  const drawW = faceW * sc;
  const drawH = faceH * sc;
  const ox = PAD_L + DIM_GAP;
  const oy = PAD_T + DIM_GAP;

  const faceProfiles = (productionData?.profileSegments ?? []).filter((p) => p.faceId === face.faceId);
  const svgH = oy + drawH + DIM_GAP * 3 + PAD_B + 16;

  return (
    <>
      <div style={{ display: 'flex', gap: 4, padding: '8px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
        {primaryFaces.map((f, i) => (
          <button key={f.faceId} onClick={() => onFaceChange(i)}
            style={{ padding: '3px 10px', fontSize: 11, border: '1px solid #cbd5e1', borderRadius: 3, background: i === activeFaceIdx ? '#1e3a5f' : '#fff', color: i === activeFaceIdx ? '#fff' : '#334155', cursor: 'pointer' }}>
            {FACE_LABEL[f.faceType] ?? f.faceType}
          </button>
        ))}
      </div>
      <SvgWrapper height={svgH} title={`Profiel­posities — ${FACE_LABEL[face.faceType] ?? face.faceType} — ${faceProfiles.length} segment${faceProfiles.length !== 1 ? 'en' : ''}`} pageLabel="SF-PROFIELEN">
        <rect x={ox} y={oy} width={drawW} height={drawH} fill="#f8fafc" stroke="#334155" strokeWidth={1} />

        {profiles.map((prof, i) => {
          const isH = prof.richting === 'horizontaal';
          const px = ox + prof.x * sc;
          const py = oy + prof.y * sc;
          const pw = prof.width * sc;
          const ph = prof.height * sc;
          const fill = isH ? '#bfdbfe' : '#fee2e2';
          const stroke = isH ? '#2563eb' : '#dc2626';
          return (
            <g key={i}>
              <rect x={px} y={py} width={Math.max(pw, 1.5)} height={Math.max(ph, 1.5)} fill={fill} fillOpacity={0.7} stroke={stroke} strokeWidth={0.8} />
            </g>
          );
        })}

        {faceProfiles.map((seg) => {
          const isH = seg.richting === 'horizontaal';
          const px = ox + seg.x * sc;
          const py = oy + seg.y * sc;
          const pw = seg.width * sc;
          const ph = seg.height * sc;
          const midX = px + pw / 2;
          const midY = py + ph / 2;
          const labelLen = `${Math.round(seg.length)}mm`;
          return (
            <g key={seg.segmentId}>
              {isH ? (
                <text x={midX} y={midY + 3} textAnchor="middle" fontSize={6} fill="#1e40af" fontFamily="Arial, sans-serif">{seg.segmentId} {labelLen}</text>
              ) : (
                <text x={midX} y={midY} textAnchor="middle" fontSize={6} fill="#991b1b" fontFamily="Arial, sans-serif" transform={`rotate(-90,${midX},${midY})`}>{seg.segmentId} {labelLen}</text>
              )}
            </g>
          );
        })}

        <DimH x1={ox} x2={ox + drawW} y={oy - DIM_GAP + 8} label={`${Math.round(faceW)} mm`} />
        <DimV x={ox - DIM_GAP + 8} y1={oy} y2={oy + drawH} label={`${Math.round(faceH)} mm`} />

        <g transform={`translate(${ox + drawW + 20},${oy})`}>
          <text x={0} y={10} fontSize={8} fontWeight="bold" fill="#1e3a5f" fontFamily="Arial, sans-serif">Legenda</text>
          <rect x={0} y={16} width={16} height={8} fill="#bfdbfe" stroke="#2563eb" strokeWidth={0.8} />
          <text x={20} y={24} fontSize={FONT_LBL} fill="#1e293b" fontFamily="Arial, sans-serif">Horizontaal</text>
          <rect x={0} y={30} width={16} height={8} fill="#fee2e2" stroke="#dc2626" strokeWidth={0.8} />
          <text x={20} y={38} fontSize={FONT_LBL} fill="#1e293b" fontFamily="Arial, sans-serif">Verticaal</text>
        </g>
      </SvgWrapper>
    </>
  );
}

function SheetBeugels({ slimFortFaces, activeFaceIdx, onFaceChange }) {
  const primaryFaces = (slimFortFaces ?? []).filter((f) => !PORTAL_FTYPES.has(f.faceType));
  const face = primaryFaces[activeFaceIdx] ?? primaryFaces[0];

  if (!face) {
    return <div style={{ padding: 32, color: '#94a3b8', fontSize: 13 }}>Geen vlakken beschikbaar.</div>;
  }

  const grid = face.grid ?? {};
  const brackets = grid.brackets ?? [];
  const faceW = face.width ?? 0;
  const faceH = face.height ?? 0;

  const DRAW_W = VIEW_W - PAD_L - PAD_R - DIM_GAP * 2;
  const DRAW_H = 440;
  const sc = Math.min(faceW > 0 ? DRAW_W / faceW : 1, faceH > 0 ? DRAW_H / faceH : 1);
  const drawW = faceW * sc;
  const drawH = faceH * sc;
  const ox = PAD_L + DIM_GAP;
  const oy = PAD_T + DIM_GAP;

  const CROSS_SZ = 5;
  const svgH = oy + drawH + DIM_GAP * 3 + PAD_B + 16;

  return (
    <>
      <div style={{ display: 'flex', gap: 4, padding: '8px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
        {primaryFaces.map((f, i) => (
          <button key={f.faceId} onClick={() => onFaceChange(i)}
            style={{ padding: '3px 10px', fontSize: 11, border: '1px solid #cbd5e1', borderRadius: 3, background: i === activeFaceIdx ? '#1e3a5f' : '#fff', color: i === activeFaceIdx ? '#fff' : '#334155', cursor: 'pointer' }}>
            {FACE_LABEL[f.faceType] ?? f.faceType}
          </button>
        ))}
      </div>
      <SvgWrapper height={svgH} title={`Beugelposities — ${FACE_LABEL[face.faceType] ?? face.faceType} — ${brackets.length} beugel${brackets.length !== 1 ? 's' : ''}`} pageLabel="SF-BEUGELS">
        <rect x={ox} y={oy} width={drawW} height={drawH} fill="#f8fafc" stroke="#334155" strokeWidth={1} />

        {brackets.map((br, i) => {
          const bx = ox + br.cx * sc;
          const by = oy + br.cy * sc;
          return (
            <g key={i}>
              <rect x={ox + br.x * sc} y={oy + br.y * sc} width={br.width * sc} height={br.height * sc} fill="#fef9c3" stroke="#ca8a04" strokeWidth={0.6} fillOpacity={0.5} />
              <line x1={bx - CROSS_SZ} y1={by} x2={bx + CROSS_SZ} y2={by} stroke="#ca8a04" strokeWidth={1.2} />
              <line x1={bx} y1={by - CROSS_SZ} x2={bx} y2={by + CROSS_SZ} stroke="#ca8a04" strokeWidth={1.2} />
            </g>
          );
        })}

        <DimH x1={ox} x2={ox + drawW} y={oy - DIM_GAP + 8} label={`${Math.round(faceW)} mm`} />
        <DimV x={ox - DIM_GAP + 8} y1={oy} y2={oy + drawH} label={`${Math.round(faceH)} mm`} />
      </SvgWrapper>
    </>
  );
}

function SheetKokers({ slimFortFaces, productionData, activeFaceIdx, onFaceChange }) {
  const primaryFaces = (slimFortFaces ?? []).filter((f) => !PORTAL_FTYPES.has(f.faceType));
  const face = primaryFaces[activeFaceIdx] ?? primaryFaces[0];

  if (!face) {
    return <div style={{ padding: 32, color: '#94a3b8', fontSize: 13 }}>Geen vlakken beschikbaar.</div>;
  }

  const grid = face.grid ?? {};
  const profiles = grid.profiles ?? [];
  const faceW = face.width ?? 0;
  const faceH = face.height ?? 0;

  const DRAW_W = VIEW_W - PAD_L - PAD_R - DIM_GAP * 2;
  const DRAW_H = 380;
  const sc = Math.min(faceW > 0 ? DRAW_W / faceW : 1, faceH > 0 ? DRAW_H / faceH : 1);
  const drawW = faceW * sc;
  const drawH = faceH * sc;
  const ox = PAD_L + DIM_GAP;
  const oy = PAD_T + DIM_GAP;

  const faceSegments = (productionData?.profileSegments ?? []).filter((p) => p.faceId === face.faceId);
  const hSegments = faceSegments.filter((s) => s.richting === 'horizontaal');
  const vSegments = faceSegments.filter((s) => s.richting === 'verticaal');

  const profSettings = grid.settings ?? {};
  const profW = profSettings.profileWidth ?? 44;
  const profH = profSettings.profileHeight ?? 44;
  const profD = profSettings.profileDepth ?? 63;

  const ROW_H = 14;
  const TABLE_COL_W = [70, 55, 60, 60, 60, 55, 55];
  const TABLE_HDRS = ['Koker-ID', 'Richting', 'X (mm)', 'Y (mm)', 'Lengte (mm)', 'Breedte (mm)', 'Hoogte (mm)'];
  const TABLE_W = TABLE_COL_W.reduce((a, b) => a + b, 0);

  const allSegs = [...hSegments, ...vSegments];
  const tableRows = allSegs.map((seg) => [
    seg.segmentId,
    seg.richting === 'horizontaal' ? 'H' : 'V',
    Math.round(seg.x),
    Math.round(seg.y),
    Math.round(seg.length),
    profW,
    profH,
  ]);

  const tableTop = oy + drawH + DIM_GAP * 2 + 10;
  const tableH = (tableRows.length + 1) * ROW_H + 6;
  const svgH = tableTop + tableH + PAD_B + 60;

  return (
    <>
      <div style={{ display: 'flex', gap: 4, padding: '8px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
        {primaryFaces.map((f, i) => (
          <button key={f.faceId} onClick={() => onFaceChange(i)}
            style={{ padding: '3px 10px', fontSize: 11, border: '1px solid #cbd5e1', borderRadius: 3, background: i === activeFaceIdx ? '#1e3a5f' : '#fff', color: i === activeFaceIdx ? '#fff' : '#334155', cursor: 'pointer' }}>
            {FACE_LABEL[f.faceType] ?? f.faceType}
          </button>
        ))}
      </div>
      <SvgWrapper height={svgH} title={`Aluminium kokers — ${FACE_LABEL[face.faceType] ?? face.faceType} — ${faceSegments.length} segment${faceSegments.length !== 1 ? 'en' : ''}`} pageLabel="SF-KOKERS">

        <text x={ox} y={oy - 6} fontSize={FONT_LBL} fill="#64748b" fontFamily="Arial, sans-serif">
          {`Profiel: ${profW}×${profH}mm  |  Diepte: ${profD}mm  |  Horizontaal: ${hSegments.length} st.  |  Verticaal: ${vSegments.length} st.`}
        </text>

        <rect x={ox} y={oy} width={drawW} height={drawH} fill="#f8fafc" stroke="#334155" strokeWidth={1} />

        {profiles.map((prof, i) => {
          const isH = prof.richting === 'horizontaal';
          const px = ox + prof.x * sc;
          const py = oy + prof.y * sc;
          const pw = prof.width * sc;
          const ph = prof.height * sc;
          const fill = isH ? '#bfdbfe' : '#fee2e2';
          const stroke = isH ? '#1d4ed8' : '#b91c1c';
          return (
            <rect key={i} x={px} y={py} width={Math.max(pw, 1.5)} height={Math.max(ph, 1.5)} fill={fill} fillOpacity={0.8} stroke={stroke} strokeWidth={0.8} />
          );
        })}

        {faceSegments.map((seg) => {
          const isH = seg.richting === 'horizontaal';
          const px = ox + seg.x * sc;
          const py = oy + seg.y * sc;
          const pw = seg.width * sc;
          const ph = seg.height * sc;
          const midX = px + pw / 2;
          const midY = py + ph / 2;
          return (
            <g key={seg.segmentId}>
              {isH ? (
                <text x={midX} y={midY + 3} textAnchor="middle" fontSize={5.5} fill="#1e3a5f" fontFamily="Arial, sans-serif" fontWeight="bold">{seg.segmentId}</text>
              ) : (
                <text x={midX} y={midY} textAnchor="middle" fontSize={5.5} fill="#7f1d1d" fontFamily="Arial, sans-serif" fontWeight="bold" transform={`rotate(-90,${midX},${midY})`}>{seg.segmentId}</text>
              )}
            </g>
          );
        })}

        <DimH x1={ox} x2={ox + drawW} y={oy - DIM_GAP + 4} label={`${Math.round(faceW)} mm`} />
        <DimV x={ox - DIM_GAP + 8} y1={oy} y2={oy + drawH} label={`${Math.round(faceH)} mm`} />

        <g transform={`translate(${ox + drawW + 16},${oy})`}>
          <text x={0} y={10} fontSize={8} fontWeight="bold" fill="#1e3a5f" fontFamily="Arial, sans-serif">Legenda</text>
          <rect x={0} y={16} width={14} height={8} fill="#bfdbfe" stroke="#1d4ed8" strokeWidth={0.8} />
          <text x={18} y={24} fontSize={FONT_LBL} fill="#1e293b" fontFamily="Arial, sans-serif">Horizontaal {profW}×{profH}mm</text>
          <rect x={0} y={30} width={14} height={8} fill="#fee2e2" stroke="#b91c1c" strokeWidth={0.8} />
          <text x={18} y={38} fontSize={FONT_LBL} fill="#1e293b" fontFamily="Arial, sans-serif">Verticaal {profW}×{profH}mm</text>
        </g>

        <g transform={`translate(${ox},${tableTop})`}>
          <text x={0} y={-6} fontSize={9} fontWeight="bold" fill="#1e3a5f" fontFamily="Arial, sans-serif">Bestelstaat aluminium kokers</text>
          {TABLE_HDRS.map((h, ci) => {
            const cx = TABLE_COL_W.slice(0, ci).reduce((a, b) => a + b, 0);
            return (
              <g key={ci}>
                <rect x={cx} y={0} width={TABLE_COL_W[ci]} height={ROW_H} fill="#1e3a5f" />
                <text x={cx + 3} y={ROW_H - 3} fontSize={FONT_LBL - 0.5} fill="#fff" fontFamily="Arial, sans-serif" fontWeight="bold">{h}</text>
              </g>
            );
          })}
          {tableRows.map((row, ri) => (
            <g key={ri}>
              <rect x={0} y={(ri + 1) * ROW_H} width={TABLE_W} height={ROW_H} fill={ri % 2 === 0 ? '#f8fafc' : '#fff'} stroke="#e2e8f0" strokeWidth={0.4} />
              {row.map((cell, ci) => {
                const cx = TABLE_COL_W.slice(0, ci).reduce((a, b) => a + b, 0);
                const isH = allSegs[ri]?.richting === 'horizontaal';
                const fill = ci === 1 ? (isH ? '#1d4ed8' : '#b91c1c') : '#1e293b';
                return (
                  <text key={ci} x={cx + 3} y={(ri + 1) * ROW_H + ROW_H - 4} fontSize={FONT_LBL - 0.5} fill={fill} fontFamily="Arial, sans-serif">{cell}</text>
                );
              })}
            </g>
          ))}
          <rect x={0} y={0} width={TABLE_W} height={(tableRows.length + 1) * ROW_H} fill="none" stroke="#334155" strokeWidth={0.8} />

          <text x={0} y={(tableRows.length + 1) * ROW_H + 18} fontSize={FONT_LBL} fill="#475569" fontFamily="Arial, sans-serif">
            {`Totaal: ${hSegments.length} horizontale koker${hSegments.length !== 1 ? 's' : ''} + ${vSegments.length} verticale koker${vSegments.length !== 1 ? 's' : ''} = ${faceSegments.length} st.`}
          </text>
        </g>

      </SvgWrapper>
    </>
  );
}

const SHEETS = [
  { id: 'overzicht', label: 'SF-OVERZICHT' },
  { id: 'eps', label: 'SF-EPS' },
  { id: 'nesting', label: 'SF-NESTING' },
  { id: 'profielen', label: 'SF-PROFIELEN' },
  { id: 'kokers', label: 'SF-KOKERS' },
  { id: 'beugels', label: 'SF-BEUGELS' },
];

export function SlimFortWerktekening({ slimFortFaces, slimFortStitching, wallDecomposition, groupName }) {
  const [activeSheet, setActiveSheet] = useState('overzicht');
  const [activeFaceIdx, setActiveFaceIdx] = useState(0);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);

  const productionData = useMemo(() => {
    if (!slimFortStitching) return null;
    return computeProductionData(slimFortStitching);
  }, [slimFortStitching]);

  const hasFaces = (slimFortFaces ?? []).some((f) => !PORTAL_FTYPES.has(f.faceType));

  if (!hasFaces) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, background: '#f8fafc', color: '#64748b' }}>
        <span style={{ fontSize: 28 }}>🏗️</span>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Geen SlimFort XT® vlakken beschikbaar</span>
        <span style={{ fontSize: 12 }}>Selecteer een groep met betonwanden en SlimFort-instellingen.</span>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f1f5f9', minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 0, background: '#1e293b', borderBottom: '2px solid #334155', flexShrink: 0 }}>
        {SHEETS.map((s) => (
          <button key={s.id} onClick={() => setActiveSheet(s.id)}
            style={{
              padding: '6px 14px',
              fontSize: 11,
              fontWeight: activeSheet === s.id ? 700 : 400,
              border: 'none',
              borderRight: '1px solid #334155',
              background: activeSheet === s.id ? '#3b82f6' : 'transparent',
              color: activeSheet === s.id ? '#fff' : '#94a3b8',
              cursor: 'pointer',
              letterSpacing: '0.03em',
            }}>
            {s.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {activeSheet === 'overzicht' && (
          <SheetOverzicht
            slimFortFaces={slimFortFaces}
            wallDecomposition={wallDecomposition}
            productionData={productionData}
            groupName={groupName}
          />
        )}
        {activeSheet === 'eps' && (
          <SheetEps
            slimFortFaces={slimFortFaces}
            productionData={productionData}
            activeFaceIdx={activeFaceIdx}
            onFaceChange={setActiveFaceIdx}
          />
        )}
        {activeSheet === 'nesting' && (
          <SheetNesting
            productionData={productionData}
            activeSheetIdx={activeSheetIdx}
            onSheetChange={setActiveSheetIdx}
          />
        )}
        {activeSheet === 'profielen' && (
          <SheetProfielen
            slimFortFaces={slimFortFaces}
            productionData={productionData}
            activeFaceIdx={activeFaceIdx}
            onFaceChange={setActiveFaceIdx}
          />
        )}
        {activeSheet === 'kokers' && (
          <SheetKokers
            slimFortFaces={slimFortFaces}
            productionData={productionData}
            activeFaceIdx={activeFaceIdx}
            onFaceChange={setActiveFaceIdx}
          />
        )}
        {activeSheet === 'beugels' && (
          <SheetBeugels
            slimFortFaces={slimFortFaces}
            activeFaceIdx={activeFaceIdx}
            onFaceChange={setActiveFaceIdx}
          />
        )}
      </div>
    </div>
  );
}
