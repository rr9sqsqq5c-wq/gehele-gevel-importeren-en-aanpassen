import { useMemo, useRef, useState } from 'react';
import { buildFullGroupFacadePattern } from './lib/pattern.js';
import { buildFacadeZones, panelizeZone } from './lib/panelization.js';
import { polyXRangesAtY, openingXRangesAtY, brickColor } from './lib/geometry.js';

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
  const stripH = verband === 'tegelverband' ? mat.steenL : mat.steenH;
  const strips = [];
  for (const row of facadeRows) {
    if (row.y + stripH <= panel.y + 0.5 || row.y >= panel.y + panel.height - 0.5) continue;
    for (const piece of row.pieces) {
      if (piece.start + piece.length <= panel.x + 0.5 || piece.start >= panel.x + panel.width - 0.5) continue;
      const clipX  = Math.max(piece.start, panel.x) - panel.x;
      const clipX2 = Math.min(piece.start + piece.length, panel.x + panel.width) - panel.x;
      const clipY  = Math.max(row.y, panel.y) - panel.y;
      const clipY2 = Math.min(row.y + stripH, panel.y + panel.height) - panel.y;
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

function computeLatten(facadeData, panelen, latten, mat) {
  if (!facadeData || !latten?.enabled) return [];
  const { rows, groupWidth, groupHeight, groupOpenings } = facadeData;
  const richting = latten.richting ?? 'horizontaal';
  const latBreedte = Math.max(5, latten.breedte ?? 50);
  const MAX_HOC = latten.maxInterval ?? 400;

  let allPanels = [];
  if (panelen?.enabled) {
    const basePanel = { width: Math.max(100, panelen.breedte ?? 3005), height: Math.max(100, panelen.hoogte ?? 1200) };
    const globalPieces = rows.flatMap((row) => row.pieces.map((p) => ({ x: p.start, width: p.length })));
    const openingsForZones = groupOpenings.map((op) => ({ id: `op_${op.x}_${op.y}`, x: op.x, y: op.y, width: op.width, height: op.height, polyPts: op.polyPts ?? null }));
    const zones = buildFacadeZones(groupWidth, groupHeight, openingsForZones);
    for (const zone of zones) {
      const res = panelizeZone(zone, rows, globalPieces, mat.steenH, basePanel);
      if (res.ok) allPanels.push(...res.panels);
    }
  }

  if (richting === 'horizontaal') {
    const openingBottomYs = new Set(groupOpenings.map((op) => Math.round(op.y)));
    const openingTopYs    = new Set(groupOpenings.map((op) => Math.round(op.y + op.height)));
    const gH = Math.round(groupHeight);

    const boundaryYs = new Set([0, gH]);
    for (const panel of allPanels) {
      boundaryYs.add(Math.round(panel.y));
      boundaryYs.add(Math.round(panel.y + panel.height));
    }
    for (const op of groupOpenings) {
      boundaryYs.add(Math.round(op.y));
      boundaryYs.add(Math.round(op.y + op.height));
    }

    const sortedBoundaries = [...boundaryYs].sort((a, b) => a - b);
    const allYs = new Set(sortedBoundaries);
    for (let i = 0; i < sortedBoundaries.length - 1; i++) {
      const yA = sortedBoundaries[i], yB = sortedBoundaries[i + 1];
      const span = yB - yA;
      if (span > MAX_HOC) {
        const steps = Math.ceil(span / MAX_HOC);
        for (let s = 1; s < steps; s++) allYs.add(Math.round(yA + (span / steps) * s));
      }
    }

    const INSET = 5;
    const result = [];
    let globalIdx = 0;
    for (const yr of [...allYs].sort((a, b) => a - b)) {
      let latY;
      if (yr === 0) latY = 0;
      else if (yr === gH) latY = yr - latBreedte;
      else if (openingBottomYs.has(yr)) latY = yr - latBreedte;
      else if (openingTopYs.has(yr)) latY = yr;
      else latY = yr - latBreedte / 2;
      const isForced = openingBottomYs.has(yr) || openingTopYs.has(yr) || yr === 0 || yr === gH;
      const latTop = latY, latBot = latY + latBreedte;
      const openingsAtY = groupOpenings.filter((op) => op.y < latBot && op.y + op.height > latTop);
      const zones = [];
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
        result.push({ id: `lat-h-${globalIdx++}`, richting: 'horizontaal', x: x1, y: latY, width: x2 - x1, height: latBreedte, forced: isForced });
      }
    }
    return result;
  } else {
    const xPositions = new Set([0, groupWidth]);
    for (const p of allPanels) { xPositions.add(Math.round(p.x)); xPositions.add(Math.round(p.x + p.width / 2)); xPositions.add(Math.round(p.x + p.width)); }
    return [...xPositions].sort((a, b) => a - b).map((x, idx) => ({
      id: `lat-v-${idx}`, richting: 'verticaal', x: x - latBreedte / 2, y: 0, width: latBreedte, height: groupHeight, forced: false,
    }));
  }
}

export function Werktekening({ walls, groupSettings, groupName, zetwerk, panelen, latten, groupMinH }) {
  const svgRef = useRef(null);
  const productiePrintRef = useRef(null);
  const [drawingType, setDrawingType] = useState('achterconstructie');
  const [productieGenerated, setProductieGenerated] = useState(false);

  const mat     = groupSettings?.material ?? { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
  const verband = groupSettings?.verband ?? 'halfsteens';
  const maxH    = groupSettings?.maxHoogte ?? null;

  const facadeData = useMemo(() => {
    if (!walls?.length) return null;
    return buildFullGroupFacadePattern(walls, mat, verband, maxH, zetwerk);
  }, [walls, mat, verband, maxH, zetwerk]);

  const allPanels = useMemo(() => {
    if (!facadeData || !panelen?.enabled) return [];
    const { rows, groupWidth, groupHeight, groupOpenings } = facadeData;
    const basePanel = { width: Math.max(100, panelen.breedte ?? 3005), height: Math.max(100, panelen.hoogte ?? 1200) };
    const globalPieces = rows.flatMap((row) => row.pieces.map((p) => ({ x: p.start, width: p.length })));
    const openingsForZones = groupOpenings.map((op) => ({ id: `op_${op.x}_${op.y}`, x: op.x, y: op.y, width: op.width, height: op.height, polyPts: op.polyPts ?? null }));
    const zones = buildFacadeZones(groupWidth, groupHeight, openingsForZones);
    const panels = [];
    for (const zone of zones) {
      const res = panelizeZone(zone, rows, globalPieces, mat.steenH, basePanel);
      if (res.ok) panels.push(...res.panels);
    }
    return panels;
  }, [facadeData, panelen, mat]);

  const allLatten = useMemo(() => computeLatten(facadeData, panelen, latten, mat), [facadeData, panelen, latten, mat]);

  if (!facadeData) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 13 }}>
        Geen gegevens beschikbaar voor werktekening
      </div>
    );
  }

  const { groupWidth, groupHeight, groupOpenings } = facadeData;

  const VIEW_W = 960;
  const VIEW_H = 700;
  const drawW = VIEW_W - PAD_LEFT - PAD_RIGHT;
  const drawH = VIEW_H - PAD_TOP - PAD_BOTTOM;
  const scaleX = drawW / groupWidth;
  const scaleY = drawH / groupHeight;
  const scale  = Math.min(scaleX, scaleY);

  const W = groupWidth * scale;
  const H = groupHeight * scale;
  const OX = PAD_LEFT + (drawW - W) / 2;
  const OY = PAD_TOP;

  const sx = (x) => OX + x * scale;
  const sy = (y) => OY + H - y * scale;

  const dimColor    = '#1e3a5f';
  const panelColor  = '#bfdbfe';
  const latColor    = '#fde68a';
  const openColor   = '#fca5a5';

  const peilmatenBase = groupMinH ?? 0;

  const xBreaks = [...new Set([0, groupWidth, ...allPanels.map((p) => p.x), ...allPanels.map((p) => p.x + p.width)])].sort((a, b) => a - b);
  const yBreaks = [...new Set([0, groupHeight, ...allPanels.map((p) => p.y), ...allPanels.map((p) => p.y + p.height)])].sort((a, b) => a - b);
  const latYs   = [...new Set(allLatten.filter((l) => l.richting === 'horizontaal').map((l) => Math.round(l.y + l.height / 2)))].sort((a, b) => a - b);

  const dimRowY   = OY + H + 28;
  const dimRow2Y  = dimRowY + DIM_GAP;
  const peilLineX  = OX - 110;
  const dimVSpanX  = OX - 65;
  const dimVTotalX = OX - 32;

  const lattenRichting = allLatten.length ? (allLatten[0].richting ?? 'horizontaal') : 'horizontaal';
  const lattenSummary = (() => {
    const groups = {};
    for (const l of allLatten) {
      const len = Math.round(lattenRichting === 'horizontaal' ? l.width : l.height);
      groups[len] = (groups[len] ?? 0) + 1;
    }
    return Object.entries(groups)
      .sort((a, b) => b[1] - a[1])
      .map(([len, cnt]) => ({ len: Number(len), cnt }));
  })();
  const summaryLines = allLatten.length ? lattenSummary.length + 2 : 0;
  const SUMMARY_LINE_H = 13;
  const SUMMARY_PAD = 8;
  const summaryBoxH = summaryLines > 0 ? summaryLines * SUMMARY_LINE_H + SUMMARY_PAD * 2 : 0;
  const LEGEND_H = 28;

  const svgTotal = VIEW_H + 16 + (summaryBoxH > 0 ? summaryBoxH + 12 : 0) + LEGEND_H;

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
    const w = window.open('', '_blank');
    if (!w) {
      alert('Sta pop-ups toe voor deze pagina om af te drukken.');
      return;
    }
    w.document.write(`<!DOCTYPE html><html><head><title>Werktekening ${groupName}</title><style>body{margin:0;padding:16px;background:#fff} svg{max-width:100%;height:auto} @media print{body{padding:0}}</style></head><body>${xml}<script>window.onload=()=>window.print()<\/script></body></html>`);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#f1f5f9' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: '#fff', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#1e3a5f', flex: 1 }}>
          Werktekening — {groupName ?? 'Groep'}
        </span>
        {drawingType !== 'productie' ? <>
          <button onClick={exportSvg} style={{ fontSize: 11, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>⬇ SVG</button>
          <button onClick={exportPrint} style={{ fontSize: 11, background: '#0f172a', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>🖨 Afdrukken</button>
        </> : productieGenerated && (
          <button onClick={exportPrintProductie} style={{ fontSize: 11, background: '#0f172a', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>🖨 Afdrukken panelen</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 0, background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
        {[
          { key: 'achterconstructie', label: '1. Achterconstructie' },
          { key: 'plaatsing',         label: '2. Panelen plaatsing' },
          { key: 'productie',         label: '3. Paneel productie' },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setDrawingType(key)} style={{
            padding: '6px 14px', fontSize: 11, fontWeight: drawingType === key ? 700 : 400,
            background: drawingType === key ? '#fff' : 'transparent',
            border: 'none', borderBottom: drawingType === key ? '2px solid #2563eb' : '2px solid transparent',
            color: drawingType === key ? '#2563eb' : '#64748b', cursor: 'pointer',
          }}>{label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: drawingType === 'productie' ? 8 : 16 }}>

        {drawingType === 'productie' && (
          <div>
            {!productieGenerated ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12 }}>
                <div style={{ fontSize: 13, color: '#64748b' }}>Genereer individuele paneel-productiematen</div>
                <button
                  onClick={() => setProductieGenerated(true)}
                  style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 5, padding: '8px 20px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
                >
                  Genereer paneel tekeningen
                </button>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '0 4px' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#1e3a5f' }}>{allPanels.length} panelen — {groupName ?? 'Groep'}</span>
                  <button onClick={() => setProductieGenerated(false)} style={{ fontSize: 11, background: '#e2e8f0', border: 'none', borderRadius: 3, padding: '3px 8px', cursor: 'pointer' }}>Verberg</button>
                </div>
                <div ref={productiePrintRef} style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  {allPanels.map((panel, idx) => {
                    const PAD = 40;
                    const CARD_W = 300;
                    const CARD_H = Math.round(CARD_W * panel.height / panel.width) + PAD * 2;
                    const sc = (CARD_W - PAD * 2) / panel.width;
                    const ox = PAD, oy = PAD;
                    const px = (x) => ox + x * sc;
                    const py = (y) => oy + (panel.height - y) * sc;
                    const strips = getStripsForPanel(panel, facadeData.rows, verband, mat);
                    const color = groupSettings?.color ?? '#a64033';
                    return (
                      <svg key={panel.id ?? idx} width={CARD_W} height={CARD_H + 30}
                        viewBox={`0 0 ${CARD_W} ${CARD_H + 30}`}
                        style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}
                        xmlns="http://www.w3.org/2000/svg">
                        <rect x={ox} y={oy} width={panel.width * sc} height={panel.height * sc} fill="#f8fafc" stroke="#1e3a5f" strokeWidth={1} />
                        {strips.map((s, si) => (
                          <rect key={si}
                            x={px(s.x)} y={py(s.y + s.height)}
                            width={s.width * sc} height={s.height * sc}
                            fill={brickColor(s.label, color)} stroke="rgba(0,0,0,0.15)" strokeWidth={0.3}
                          />
                        ))}
                        <text x={CARD_W / 2} y={CARD_H + 20} textAnchor="middle" fontSize={8} fontWeight="bold" fill="#1e3a5f" fontFamily="Arial, sans-serif">
                          P{idx + 1} · {mm(panel.width)} × {mm(panel.height)} mm
                        </text>
                        <text x={ox} y={oy - 4} fontSize={7} fill="#64748b" fontFamily="Arial, sans-serif">{mm(panel.width)} mm</text>
                        <text x={ox - 4} y={oy + panel.height * sc / 2} fontSize={7} fill="#64748b" fontFamily="Arial, sans-serif"
                          transform={`rotate(-90,${ox - 4},${oy + panel.height * sc / 2})`}>{mm(panel.height)} mm</text>
                      </svg>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {drawingType !== 'productie' && <svg ref={svgRef} width={VIEW_W} height={svgTotal} viewBox={`0 0 ${VIEW_W} ${svgTotal}`} style={{ background: '#fff', display: 'block', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }} xmlns="http://www.w3.org/2000/svg">

          <rect x={0} y={0} width={VIEW_W} height={svgTotal} fill="#fff" />

          <defs>
            <clipPath id="wt-openings-clip" clipPathUnits="userSpaceOnUse">
              <path fillRule="evenodd" d={[
                `M${OX},${OY} h${W} v${H} h${-W} Z`,
                ...groupOpenings.map((op) => {
                  const poly = op.polyPts && op.polyPts.length >= 3 ? op.polyPts : [
                    { l: op.x, h: op.y }, { l: op.x + op.width, h: op.y },
                    { l: op.x + op.width, h: op.y + op.height }, { l: op.x, h: op.y + op.height },
                  ];
                  return poly.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.l)},${sy(p.h)}`).join(' ') + ' Z';
                }),
              ].join(' ')} />
            </clipPath>
          </defs>

          <text x={OX} y={20} fontSize={13} fontWeight="bold" fill="#0f172a" fontFamily="Arial, sans-serif">
            {groupName ?? 'Groep'} — {drawingType === 'achterconstructie' ? 'Achterconstructie (houten latten)' : 'Panelen plaatsing op gevel'}
          </text>
          <text x={OX} y={33} fontSize={8} fill="#64748b" fontFamily="Arial, sans-serif">
            Schaal 1:{Math.round(1 / scale * 1000)} · Afmetingen in mm · Peilmaten in m t.o.v. IFC-nulpunt
          </text>

          <rect x={OX} y={OY} width={W} height={H} fill="#f8fafc" stroke={dimColor} strokeWidth={1} />

          {drawingType === 'plaatsing' && allPanels.map((p, i) => (
            <g key={p.id ?? i}>
              <rect
                x={sx(p.x)} y={sy(p.y + p.height)}
                width={p.width * scale} height={p.height * scale}
                fill={panelColor} stroke={dimColor} strokeWidth={0.8} fillOpacity={0.8}
              />
              {p.width * scale > 24 && p.height * scale > 14 && (
                <text
                  x={sx(p.x + p.width / 2)} y={sy(p.y + p.height / 2)}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={FONT_LBL} fill="#1e3a5f" fontFamily="Arial, sans-serif" fontWeight="bold"
                >
                  P{i + 1}
                </text>
              )}
            </g>
          ))}

          <g clipPath="url(#wt-openings-clip)">
            {drawingType === 'achterconstructie' && allLatten.map((l) => (
              <rect
                key={l.id}
                x={sx(l.x)} y={sy(l.y + l.height)}
                width={l.width * scale} height={l.height * scale}
                fill={latColor} stroke="#92400e" strokeWidth={0.5} fillOpacity={0.85}
              />
            ))}
          </g>

          {groupOpenings.map((op, i) => {
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
                <rect x={sx(op.x)} y={sy(op.y + op.height)} width={op.width * scale} height={op.height * scale}
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
            <DimH x1={sx(0)} x2={sx(groupWidth)} y={dimRow2Y} label={`TOTAAL ${mm(groupWidth)}`} color="#dc2626" />
          )}

          {groupOpenings.map((op, i) => (
            op.width > 1 && (
              <DimH key={`op-h-${i}`} x1={sx(op.x)} x2={sx(op.x + op.width)} y={OY + H + 48} label={`raam ${mm(op.width)}`} color="#dc2626" />
            )
          ))}

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
            <DimV x={dimVTotalX} y1={sy(groupHeight)} y2={sy(0)} label={`TOTAAL ${mm(groupHeight)}`} color="#dc2626" side="left" />
          )}

          {latYs.map((cy, i) => (
            <line key={i} x1={OX} y1={sy(cy)} x2={OX + W + 20} y2={sy(cy)} stroke="#92400e" strokeWidth={0.6} strokeDasharray="5,3" opacity={0.7} />
          ))}

          <line x1={peilLineX} y1={OY} x2={peilLineX} y2={OY + H} stroke="#334155" strokeWidth={0.8} />
          {(() => {
            const MIN_GAP = 11;
            let lastY = -Infinity;
            return yBreaks.map((y, i) => {
              const absH = (peilmatenBase + y) / 1000;
              const screenY = sy(y);
              const showLabel = (lastY === -Infinity) || (Math.abs(screenY - lastY) >= MIN_GAP);
              if (showLabel) lastY = screenY;
              return (
                <g key={i}>
                  <line x1={peilLineX - 4} y1={screenY} x2={peilLineX + 4} y2={screenY} stroke="#334155" strokeWidth={0.8} />
                  {showLabel && (
                    <text x={peilLineX - 6} y={screenY + 3} textAnchor="end" fontSize={FONT_DIM} fill="#334155" fontFamily="Arial, sans-serif">
                      {absH.toFixed(3)}
                    </text>
                  )}
                </g>
              );
            });
          })()}

          {latYs.map((cy, i) => {
            const absH = (peilmatenBase + cy) / 1000;
            return (
              <g key={i}>
                <line x1={peilLineX - 6} y1={sy(cy)} x2={peilLineX + 6} y2={sy(cy)} stroke="#92400e" strokeWidth={0.8} />
                <text x={peilLineX - 8} y={sy(cy) - 2} textAnchor="end" fontSize={FONT_DIM - 1} fill="#92400e" fontFamily="Arial, sans-serif">
                  {absH.toFixed(3)}
                </text>
              </g>
            );
          })}



          <text x={peilLineX} y={OY - 6} textAnchor="middle" fontSize={FONT_LBL} fill="#334155" fontFamily="Arial, sans-serif">PEILMATEN (m)</text>

          {drawingType === 'achterconstructie' && summaryBoxH > 0 && (() => {
            const bx = OX;
            const by = VIEW_H + 16;
            const bw = Math.max(260, lattenSummary.length > 0 ? 260 : 260);
            return (
              <g>
                <rect x={bx} y={by} width={bw} height={summaryBoxH} fill="#fff" stroke="#000" strokeWidth={1} />
                <text x={bx + SUMMARY_PAD} y={by + SUMMARY_PAD + SUMMARY_LINE_H - 2}
                  fontSize={10} fontWeight="bold" fill="#000" fontFamily="Arial, sans-serif">
                  Latten samenvatting ({lattenRichting})
                </text>
                <line x1={bx} y1={by + SUMMARY_PAD + SUMMARY_LINE_H + 2} x2={bx + bw} y2={by + SUMMARY_PAD + SUMMARY_LINE_H + 2} stroke="#000" strokeWidth={0.5} />
                {lattenSummary.map(({ len, cnt }, i) => (
                  <text key={i} x={bx + SUMMARY_PAD} y={by + SUMMARY_PAD + (i + 2) * SUMMARY_LINE_H + 2}
                    fontSize={10} fill="#000" fontFamily="Arial, sans-serif">
                    {cnt}× {len} mm
                  </text>
                ))}
              </g>
            );
          })()}

          {drawingType === 'plaatsing' && allPanels.length > 0 && (() => {
            const sizeGroups = {};
            for (const p of allPanels) {
              const key = `${mm(p.width)}×${mm(p.height)}`;
              sizeGroups[key] = (sizeGroups[key] ?? 0) + 1;
            }
            const lines = Object.entries(sizeGroups).sort((a, b) => b[1] - a[1]);
            const bh = (lines.length + 2) * SUMMARY_LINE_H + SUMMARY_PAD * 2;
            const bx = OX, by = VIEW_H + 16, bw = 280;
            return (
              <g>
                <rect x={bx} y={by} width={bw} height={bh} fill="#fff" stroke="#000" strokeWidth={1} />
                <text x={bx + SUMMARY_PAD} y={by + SUMMARY_PAD + SUMMARY_LINE_H - 2}
                  fontSize={9} fontWeight="bold" fill="#000" fontFamily="Arial, sans-serif">
                  Panelen samenvatting — totaal {allPanels.length} st.
                </text>
                <line x1={bx} y1={by + SUMMARY_PAD + SUMMARY_LINE_H + 2} x2={bx + bw} y2={by + SUMMARY_PAD + SUMMARY_LINE_H + 2} stroke="#000" strokeWidth={0.5} />
                {lines.map(([key, cnt], i) => (
                  <text key={i} x={bx + SUMMARY_PAD} y={by + SUMMARY_PAD + (i + 2) * SUMMARY_LINE_H + 2}
                    fontSize={9} fill="#000" fontFamily="Arial, sans-serif">
                    {cnt}× {key} mm
                  </text>
                ))}
              </g>
            );
          })()}

          <g transform={`translate(${OX},${svgTotal - LEGEND_H + 4})`}>
            {drawingType === 'plaatsing' && <>
              <rect x={0} y={0} width={12} height={8} fill={panelColor} stroke={dimColor} strokeWidth={0.5} />
              <text x={15} y={7} fontSize={FONT_LBL} fill="#334155" fontFamily="Arial, sans-serif">Paneel</text>
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
      </div>
    </div>
  );
}
