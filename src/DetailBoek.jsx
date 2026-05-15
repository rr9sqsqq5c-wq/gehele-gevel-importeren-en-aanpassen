import { useState, useRef, useMemo } from 'react';
import { generateProjectDetailBook, DETAIL_TYPES, buildSystemLayers, buildCanonicalFacadeLayerStack, getSystemInfo, isSlimFortActive } from './lib/detailGenerator.js';
import { buildSectionOrientation, buildLeaderAnchors } from './lib/sectionOrientation.js';
import { getSystemDefinition, MAT_PATTERN, MATERIAL_COLORS as SYS_COLORS } from './lib/systemDefinitions.js';
import { buildExtendedLayerStack, buildSystemDetailGeometry } from './lib/detailGeometry.js';

const _debuggedDetailTypes = new Set();
function debugLogDetail(type, variant, layers, totalDepth) {
  const key = `${type}:${variant}`;
  if (_debuggedDetailTypes.has(key)) return;
  _debuggedDetailTypes.add(key);
  console.debug('[DetailBoek]', key, 'layers:', layers.map(l => `${l.id}(${l.thickness}mm)`).join(' → '), `total=${totalDepth}mm`);
}

const LAYER_PATTERN_ID = {
  brick:        'mat-brick',
  ceramic:      'mat-brick',
  eps:          'mat-eps',
  insulation:   'mat-eps',
  profile_ext:  'mat-aluminium',
  alu_rail:     'mat-alu-rail',
  ventilation:  'mat-ventilation',
  cavity:       'mat-ventilation',
  air:          'mat-ventilation',
  panel:        'mat-fc',
  fc_plate:     'mat-fc',
  lat:          'mat-wood',
  wood:         'mat-wood',
  adhesive:     'mat-adhesive',
  membrane:     'mat-membrane',
  thermal_break:'mat-thermal-break',
  concrete:     'mat-concrete',
  substrate:    'mat-concrete',
};

function layerFill(layerId, svgId, fallbackColor) {
  const pat = LAYER_PATTERN_ID[layerId];
  return pat ? `url(#${pat}-${svgId})` : (fallbackColor ?? '#c8d0d8');
}

function MaterialPatternDefs({ svgId }) {
  const p = (t) => `${LAYER_PATTERN_ID[t] ?? t}-${svgId}`;
  return (
    <defs>
      <pattern id={p('brick')} patternUnits="userSpaceOnUse" width="24" height="12">
        <rect width="24" height="12" fill="#b05c38" />
        <line x1="0" y1="6" x2="24" y2="6" stroke="#844030" strokeWidth="0.8" />
        <line x1="12" y1="0" x2="12" y2="6" stroke="#844030" strokeWidth="0.5" />
        <line x1="0" y1="6" x2="0" y2="12" stroke="#844030" strokeWidth="0.5" />
        <line x1="24" y1="6" x2="24" y2="12" stroke="#844030" strokeWidth="0.5" />
      </pattern>
      <pattern id={p('eps')} patternUnits="userSpaceOnUse" width="16" height="10">
        <rect width="16" height="10" fill="#ece8d8" />
        <polyline points="0,5 4,3 8,7 12,3 16,5" stroke="#b0a880" strokeWidth="0.6" fill="none" />
      </pattern>
      <pattern id={p('profile_ext')} patternUnits="userSpaceOnUse" width="6" height="6">
        <rect width="6" height="6" fill="#7a8a96" />
        <line x1="0" y1="0" x2="6" y2="6" stroke="#50606e" strokeWidth="0.6" />
        <line x1="-3" y1="3" x2="3" y2="9" stroke="#50606e" strokeWidth="0.6" />
        <line x1="3" y1="-3" x2="9" y2="3" stroke="#50606e" strokeWidth="0.6" />
      </pattern>
      <pattern id={p('panel')} patternUnits="userSpaceOnUse" width="8" height="8">
        <rect width="8" height="8" fill="#7b9bae" />
        <line x1="0" y1="4" x2="8" y2="4" stroke="#5a7988" strokeWidth="0.4" />
        <line x1="4" y1="0" x2="4" y2="8" stroke="#5a7988" strokeWidth="0.4" />
      </pattern>
      <pattern id={p('lat')} patternUnits="userSpaceOnUse" width="12" height="6">
        <rect width="12" height="6" fill="#a87840" />
        <path d="M0,2 Q3,1.5 6,2 Q9,2.5 12,2" stroke="#785028" strokeWidth="0.4" fill="none" />
        <path d="M0,4 Q3,3.3 6,4 Q9,4.7 12,4" stroke="#785028" strokeWidth="0.3" fill="none" />
      </pattern>
      <pattern id={p('alu_rail')} patternUnits="userSpaceOnUse" width="8" height="8">
        <rect width="8" height="8" fill="#7a8a96" />
        <line x1="0" y1="0" x2="8" y2="8" stroke="#50606e" strokeWidth="0.6" />
        <line x1="8" y1="0" x2="0" y2="8" stroke="#50606e" strokeWidth="0.6" />
      </pattern>
      <pattern id={p('ventilation')} patternUnits="userSpaceOnUse" width="10" height="6">
        <rect width="10" height="6" fill="#d0e8f4" />
        <line x1="0" y1="3" x2="10" y2="3" stroke="#9abcd0" strokeWidth="0.4" strokeDasharray="4,3" />
      </pattern>
      <pattern id={p('concrete')} patternUnits="userSpaceOnUse" width="10" height="10">
        <rect width="10" height="10" fill="#8fa6b2" />
        <path d="M-1,1 l2,-2 M0,10 l10,-10 M9,11 l2,-2" stroke="#6a8494" strokeWidth="0.6" />
      </pattern>
      <pattern id={p('wood')} patternUnits="userSpaceOnUse" width="12" height="6">
        <rect width="12" height="6" fill="#a87840" />
        <path d="M0,2 Q3,1.5 6,2 Q9,2.5 12,2" stroke="#785028" strokeWidth="0.4" fill="none" />
        <path d="M0,4 Q3,3.3 6,4 Q9,4.7 12,4" stroke="#785028" strokeWidth="0.3" fill="none" />
      </pattern>
      <pattern id={p('fc')} patternUnits="userSpaceOnUse" width="8" height="8">
        <rect width="8" height="8" fill="#7b9bae" />
        <line x1="0" y1="4" x2="8" y2="4" stroke="#5a7988" strokeWidth="0.4" />
        <line x1="4" y1="0" x2="4" y2="8" stroke="#5a7988" strokeWidth="0.4" />
      </pattern>
      <pattern id={p('adhesive')} patternUnits="userSpaceOnUse" width="8" height="4">
        <rect width="8" height="4" fill="#c89438" />
        <line x1="0" y1="2" x2="8" y2="2" stroke="#9a6c20" strokeWidth="0.5" strokeDasharray="3,2" />
      </pattern>
      <pattern id={p('membrane')} patternUnits="userSpaceOnUse" width="8" height="4">
        <rect width="8" height="4" fill="#78b0be" />
        <line x1="0" y1="2" x2="8" y2="2" stroke="#4a8898" strokeWidth="0.4" />
      </pattern>
      <pattern id={p('thermal-break')} patternUnits="userSpaceOnUse" width="6" height="6">
        <rect width="6" height="6" fill="#88a888" />
        <line x1="0" y1="2" x2="6" y2="2" stroke="#5a7a5a" strokeWidth="0.5" />
        <line x1="0" y1="4" x2="6" y2="4" stroke="#5a7a5a" strokeWidth="0.5" />
      </pattern>
    </defs>
  );
}

const SHOW_ORIENTATION_DEBUG = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('detailDebug');

function SectionOrientationDebug({ orientation }) {
  if (!orientation) return null;
  const { debug } = orientation;
  return (
    <div style={{ margin: '6px 0 0', padding: '6px 10px', background: '#fefce8', border: '1px solid #fde047', borderRadius: 4, fontSize: 10, color: '#713f12', fontFamily: 'monospace', lineHeight: 1.6 }}>
      <strong>[OrientationDebug]</strong>
      {' '}type={debug.detailType}
      {' '}section={debug.sectionType}
      {' '}cladding={debug.claddingSide}
      {' '}substrate={debug.substrateSide}
      {' '}mirror={String(debug.shouldMirrorGeometry)}
      {debug.layerOrder && <div>layers: {debug.layerOrder.join(' → ')}</div>}
    </div>
  );
}

const TABS = [
  { id: 'index', label: 'Index' },
  { id: 'keyplan', label: 'Keyplan' },
  { id: 'systemen', label: 'Systemen' },
  { id: 'openingen', label: 'Openingen' },
  { id: 'hoeken', label: 'Hoeken' },
  { id: 'maaiveld', label: 'Maaiveld' },
  { id: 'bovenzijde', label: 'Bovenzijde' },
  { id: 'panelen', label: 'Panelen' },
  { id: 'slimfort', label: 'SlimFort' },
];

const FONT = 'Arial, sans-serif';
const DIM_COLOR = '#1e3a5f';
const CONC_COLOR = '#94a3b8';

function arrowPath(x1, y1, x2, y2, sz = 4) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const px = -uy * sz * 0.4, py = ux * sz * 0.4;
  return `M${x2},${y2} L${x2 - ux * sz + px},${y2 - uy * sz + py} L${x2 - ux * sz - px},${y2 - uy * sz - py} Z`;
}

function DimH({ x1, x2, y, label }) {
  const mid = (x1 + x2) / 2;
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={DIM_COLOR} strokeWidth={0.6} />
      <path d={arrowPath(x2, y, x1, y)} fill={DIM_COLOR} />
      <path d={arrowPath(x1, y, x2, y)} fill={DIM_COLOR} />
      <line x1={x1} y1={y - 10} x2={x1} y2={y + 4} stroke={DIM_COLOR} strokeWidth={0.4} strokeDasharray="2,2" />
      <line x1={x2} y1={y - 10} x2={x2} y2={y + 4} stroke={DIM_COLOR} strokeWidth={0.4} strokeDasharray="2,2" />
      <text x={mid} y={y - 4} textAnchor="middle" fontSize={8} fill={DIM_COLOR} fontFamily={FONT}>{label}</text>
    </g>
  );
}

function DimV({ x, y1, y2, label, side = 'left' }) {
  const mid = (y1 + y2) / 2;
  const tx = side === 'left' ? x - 5 : x + 5;
  const anchor = side === 'left' ? 'end' : 'start';
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={DIM_COLOR} strokeWidth={0.6} />
      <path d={arrowPath(x, y2, x, y1)} fill={DIM_COLOR} />
      <path d={arrowPath(x, y1, x, y2)} fill={DIM_COLOR} />
      <line x1={x - 8} y1={y1} x2={x + 3} y2={y1} stroke={DIM_COLOR} strokeWidth={0.4} strokeDasharray="2,2" />
      <line x1={x - 8} y1={y2} x2={x + 3} y2={y2} stroke={DIM_COLOR} strokeWidth={0.4} strokeDasharray="2,2" />
      <text x={tx} y={mid} textAnchor={anchor} dominantBaseline="middle" fontSize={8} fill={DIM_COLOR} fontFamily={FONT} transform={`rotate(-90,${tx},${mid})`}>{label}</text>
    </g>
  );
}

function DimChain({ boundaries, y, labels }) {
  return (
    <g>
      {boundaries.map((x, i) => (
        <line key={`ext-${i}`} x1={x} y1={y - 10} x2={x} y2={y + 4} stroke={DIM_COLOR} strokeWidth={0.4} strokeDasharray="2,2" />
      ))}
      {labels.map((label, i) => {
        const x1 = boundaries[i], x2 = boundaries[i + 1];
        const mid = (x1 + x2) / 2;
        return (
          <g key={`seg-${i}`}>
            <line x1={x1} y1={y} x2={x2} y2={y} stroke={DIM_COLOR} strokeWidth={0.6} />
            <path d={arrowPath(x2, y, x1, y)} fill={DIM_COLOR} />
            <path d={arrowPath(x1, y, x2, y)} fill={DIM_COLOR} />
            <text x={mid} y={y - 4} textAnchor="middle" fontSize={8} fill={DIM_COLOR} fontFamily={FONT}>{label}</text>
          </g>
        );
      })}
    </g>
  );
}

function HatchRect({ id, x, y, w, h, bg = '#e2e8f0' }) {
  const pid = `hatch-${id}`;
  return (
    <g>
      <defs>
        <pattern id={pid} patternUnits="userSpaceOnUse" width="8" height="8">
          <rect width="8" height="8" fill={bg} />
          <path d="M-1,1 l2,-2 M0,8 l8,-8 M7,9 l2,-2" stroke="#94a3b8" strokeWidth={0.8} />
        </pattern>
      </defs>
      <rect x={x} y={y} width={w} height={h} fill={`url(#${pid})`} stroke="#64748b" strokeWidth={1} />
    </g>
  );
}

function LayerLabel({ x, y, text }) {
  return (
    <text x={x} y={y} textAnchor="middle" fontSize={7} fill="#475569" fontFamily={FONT}>{text}</text>
  );
}

function ConcreteSubstrate({ x, y, w, h, svgId }) {
  const pid = `conc-${svgId}`;
  return (
    <g>
      <defs>
        <pattern id={pid} patternUnits="userSpaceOnUse" width="10" height="10">
          <rect width="10" height="10" fill="#b0bec5" />
          <path d="M-1,1 l2,-2 M0,10 l10,-10 M9,11 l2,-2" stroke="#78909c" strokeWidth="0.7" />
        </pattern>
      </defs>
      <rect x={x} y={y} width={w} height={h} fill={`url(#${pid})`} stroke="#546e7a" strokeWidth={1} />
      <text x={x + w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={7} fill="#37474f" fontFamily={FONT}>Beton</text>
    </g>
  );
}

function ScrewSymbol({ x, y, r = 2.5 }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#374151" stroke="#1f2937" strokeWidth={0.4} />
      <line x1={x - r * 0.7} y1={y} x2={x + r * 0.7} y2={y} stroke="#9ca3af" strokeWidth={0.5} />
      <line x1={x} y1={y - r * 0.7} x2={x} y2={y + r * 0.7} stroke="#9ca3af" strokeWidth={0.5} />
    </g>
  );
}

function AnchorSymbol({ x, y }) {
  return (
    <g>
      <line x1={x} y1={y - 5} x2={x} y2={y + 5} stroke="#0369a1" strokeWidth={1} />
      <line x1={x - 3} y1={y - 3} x2={x + 3} y2={y - 3} stroke="#0369a1" strokeWidth={0.8} />
      <circle cx={x} cy={y} r={1.5} fill="#0369a1" />
    </g>
  );
}

function WoodBattenOverlay({ rects, layerY, layerH, isHorizontal }) {
  const latR = rects.find((r) => r.id === 'lat');
  if (!latR) return null;
  const spacingPx = Math.max(24, layerH / 5);
  const battenH   = Math.min(18, spacingPx * 0.55);
  const count     = Math.floor(layerH / spacingPx);
  const items     = [];
  for (let i = 0; i <= count; i++) {
    const y = layerY + i * spacingPx + 2;
    if (y + battenH > layerY + layerH) break;
    items.push(
      <rect key={`b${i}`} x={latR.x} y={y} width={latR.w} height={battenH}
        fill="#c8a96a" stroke="#92400e" strokeWidth={0.5} />,
    );
    items.push(
      <line key={`g${i}`} x1={latR.x + 1} y1={y + battenH * 0.4} x2={latR.x + latR.w - 1} y2={y + battenH * 0.4}
        stroke="#92400e" strokeWidth={0.3} />,
    );
    items.push(
      <ScrewSymbol key={`s${i}`} x={latR.x + latR.w / 2} y={y + battenH / 2} r={1.8} />,
    );
  }
  return <g opacity={0.95}>{items}</g>;
}

function AluminiumRailOverlay({ rects, layerY, layerH, isHorizontal }) {
  const railR = rects.find((r) => r.id === 'alu_rail');
  if (!railR) return null;
  const spacingPx = Math.max(24, layerH / 5);
  const count     = Math.floor(layerH / spacingPx);
  const items     = [];
  const rW = Math.max(railR.w, 3);
  const flangeH = 4;
  const webH    = 14;
  for (let i = 0; i <= count; i++) {
    const y = layerY + i * spacingPx + 2;
    if (y + flangeH + webH > layerY + layerH) break;
    items.push(<rect key={`tf${i}`} x={railR.x} y={y} width={rW} height={flangeH} fill="#9ca3af" stroke="#475569" strokeWidth={0.4} />);
    items.push(<rect key={`lw${i}`} x={railR.x} y={y + flangeH} width={Math.max(rW * 0.15, 2)} height={webH} fill="#9ca3af" stroke="#475569" strokeWidth={0.4} />);
    items.push(<rect key={`rw${i}`} x={railR.x + rW - Math.max(rW * 0.15, 2)} y={y + flangeH} width={Math.max(rW * 0.15, 2)} height={webH} fill="#9ca3af" stroke="#475569" strokeWidth={0.4} />);
    items.push(<rect key={`bf${i}`} x={railR.x} y={y + flangeH + webH} width={rW} height={flangeH} fill="#9ca3af" stroke="#475569" strokeWidth={0.4} />);
    items.push(<AnchorSymbol key={`an${i}`} x={railR.x + rW / 2} y={y + flangeH + webH / 2} />);
  }
  const tbX = railR.x + rW - 3;
  items.push(<line key="tb" x1={tbX} y1={layerY} x2={tbX} y2={layerY + layerH} stroke="#059669" strokeWidth={1.5} strokeDasharray="3,2" />);
  return <g opacity={0.92}>{items}</g>;
}

function SlimFortOverlay({ rects, layerY, layerH, settings }) {
  const epsR   = rects.find((r) => r.id === 'eps');
  const prfR   = rects.find((r) => r.id === 'profile_ext');
  if (!epsR) return null;
  const sf           = settings?.slimFortSettings ?? {};
  const bracketPx    = Math.max(24, layerH / 5);
  const count        = Math.floor(layerH / bracketPx);
  const insertFrac   = (sf.profileInsertDepth ?? 33) / (sf.totalThickness ?? 196);
  const bracketW     = Math.max(epsR.w * 0.18, 4);
  const items        = [];
  for (let i = 0; i <= count; i++) {
    const y = layerY + i * bracketPx + 2;
    if (y + 10 > layerY + layerH) break;
    const bx = epsR.x + epsR.w * (1 - insertFrac) - bracketW / 2;
    items.push(<rect key={`bk${i}`} x={bx} y={y} width={bracketW} height={10} fill="#6b7280" stroke="#374151" strokeWidth={0.4} />);
    const kokerW = Math.max(epsR.w * insertFrac * 0.6, 3);
    items.push(<rect key={`kk${i}`} x={bx + bracketW / 2 - kokerW / 2} y={y + 1} width={kokerW} height={8} fill="#374151" />);
  }
  const tongueH = Math.min(20, layerH * 0.15);
  const tongY   = layerY + layerH * 0.35;
  items.push(<rect key="tng" x={epsR.x + epsR.w - Math.max(epsR.w * 0.15, 4)} y={tongY} width={Math.max(epsR.w * 0.15, 4)} height={tongueH} fill="#c89438" stroke="#9a6c20" strokeWidth={0.5} />);
  items.push(<text key="tl" x={epsR.x + epsR.w * 0.5} y={layerY + 10} textAnchor="middle" fontSize={6} fill="#92400e" fontFamily={FONT}>EPS tong/groef</text>);
  return <g opacity={0.92}>{items}</g>;
}

function SystemStructuralOverlay({ systemType, rects, layerY, layerH, isHorizontal, settings }) {
  if (systemType === 'hout')      return <WoodBattenOverlay rects={rects} layerY={layerY} layerH={layerH} isHorizontal={isHorizontal} />;
  if (systemType === 'aluminium') return <AluminiumRailOverlay rects={rects} layerY={layerY} layerH={layerH} isHorizontal={isHorizontal} />;
  if (systemType === 'slimfort')  return <SlimFortOverlay rects={rects} layerY={layerY} layerH={layerH} settings={settings} />;
  return null;
}

function SystemNotes({ sysDef, x, y, maxW }) {
  if (!sysDef?.constructionNotes?.length) return null;
  return (
    <g>
      {sysDef.constructionNotes.map((note, i) => (
        <text key={i} x={x} y={y + i * 11} fontSize={6.5} fill="#475569" fontFamily={FONT}>• {note}</text>
      ))}
    </g>
  );
}

function SystemSectionSVG({ detail, orientation = 'v' }) {
  const { settings, id } = detail;
  const extStack = buildExtendedLayerStack(settings);
  const sysInfo  = getSystemInfo(settings);
  const sysDef   = getSystemDefinition(settings);
  const orient   = buildSectionOrientation({ detailType: detail.type, layerStack: extStack });
  const layers   = extStack.layers;
  const totalDepth = extStack.totalDepth;
  debugLogDetail(detail.type, orientation === 'v' ? 'vertical' : 'horizontal', layers, totalDepth);

  const W = 660, H = 380;
  const PAD_L = 70, PAD_R = 36;
  const CONC_W = 70;
  const AVAIL = W - PAD_L - PAD_R - CONC_W;
  const scale = Math.min(4, AVAIL / Math.max(totalDepth, 30));
  const LAYER_Y = 55, LAYER_H = 140;
  const DIM_Y = LAYER_Y + LAYER_H + 22;
  const TOTAL_DIM_Y = DIM_Y + 20;
  const LABEL_Y = TOTAL_DIM_Y + 24;
  const NOTES_Y = LABEL_Y + 28;
  const wallThickness = 250;

  let xCur = PAD_L;
  const rects = layers.map((l) => {
    const x = xCur;
    xCur += l.thickness * scale;
    return { ...l, x, w: l.thickness * scale };
  });
  const concX = PAD_L + totalDepth * scale;

  const ceramicLayer = rects.find((r) => r.id === 'ceramic' || r.id === 'brick');
  const leaderAnchors = buildLeaderAnchors(rects, { minLabelWidth: 40 });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ background: '#fff', display: 'block', width: '100%', height: 'auto' }}>
      <MaterialPatternDefs svgId={id} />
      <text x={PAD_L} y={18} fontSize={9} fill="#475569" fontFamily={FONT} fontWeight="600">
        {orientation === 'v' ? 'Verticale doorsnede — systeem' : 'Horizontale doorsnede — systeem'}
      </text>
      <text x={PAD_L} y={30} fontSize={8} fill="#94a3b8" fontFamily={FONT}>
        {sysInfo.shortLabel} / {settings.wallSubstrateType ?? 'beton'}
        {orientation === 'v' ? '  —  coupe richting: →' : '  —  coupe richting: ↓'}
      </text>

      <text x={PAD_L - 4} y={LAYER_Y + LAYER_H / 2} textAnchor="end" dominantBaseline="middle" fontSize={8} fontWeight="bold" fill="#1e293b" fontFamily={FONT}>BUITEN</text>
      <text x={concX + CONC_W + 4} y={LAYER_Y + LAYER_H / 2} textAnchor="start" dominantBaseline="middle" fontSize={8} fontWeight="bold" fill="#1e293b" fontFamily={FONT}>BINNEN</text>

      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={LAYER_Y} width={Math.max(r.w, 1)} height={LAYER_H} fill={layerFill(r.id, id, r.color)} stroke="#334155" strokeWidth={0.5} />
      ))}
      <ConcreteSubstrate x={concX} y={LAYER_Y} w={CONC_W} h={LAYER_H} svgId={`${id}-sys`} />

      <SystemStructuralOverlay
        systemType={sysInfo.systemType}
        rects={rects}
        layerY={LAYER_Y}
        layerH={LAYER_H}
        isHorizontal={orientation === 'h'}
        settings={settings}
      />

      {ceramicLayer && orientation === 'v' && (
        <>
          <line x1={ceramicLayer.x} y1={LAYER_Y + 22} x2={ceramicLayer.x + ceramicLayer.w} y2={LAYER_Y + 22} stroke="#a3432a" strokeWidth={0.4} strokeDasharray="2,3" />
          <line x1={ceramicLayer.x} y1={LAYER_Y + 34} x2={ceramicLayer.x + ceramicLayer.w} y2={LAYER_Y + 34} stroke="#a3432a" strokeWidth={0.4} strokeDasharray="2,3" />
          <line x1={ceramicLayer.x} y1={LAYER_Y + 58} x2={ceramicLayer.x + ceramicLayer.w} y2={LAYER_Y + 58} stroke="#a3432a" strokeWidth={0.4} strokeDasharray="2,3" />
          <line x1={ceramicLayer.x} y1={LAYER_Y + 70} x2={ceramicLayer.x + ceramicLayer.w} y2={LAYER_Y + 70} stroke="#a3432a" strokeWidth={0.4} strokeDasharray="2,3" />
          <line x1={ceramicLayer.x} y1={LAYER_Y + 94} x2={ceramicLayer.x + ceramicLayer.w} y2={LAYER_Y + 94} stroke="#a3432a" strokeWidth={0.4} strokeDasharray="2,3" />
          <line x1={ceramicLayer.x} y1={LAYER_Y + 106} x2={ceramicLayer.x + ceramicLayer.w} y2={LAYER_Y + 106} stroke="#a3432a" strokeWidth={0.4} strokeDasharray="2,3" />
        </>
      )}
      {ceramicLayer && orientation === 'h' && (
        <>
          <line x1={ceramicLayer.x + ceramicLayer.w * 0.1} y1={LAYER_Y} x2={ceramicLayer.x + ceramicLayer.w * 0.1} y2={LAYER_Y + LAYER_H} stroke="#a3432a" strokeWidth={0.3} strokeDasharray="2,4" />
          <line x1={ceramicLayer.x + ceramicLayer.w * 0.6} y1={LAYER_Y} x2={ceramicLayer.x + ceramicLayer.w * 0.6} y2={LAYER_Y + LAYER_H} stroke="#a3432a" strokeWidth={0.3} strokeDasharray="2,4" />
        </>
      )}

      <DimChain boundaries={[PAD_L, ...rects.map((r) => r.x + r.w), concX + CONC_W]} y={DIM_Y} labels={[...rects.map((r) => `${r.thickness}`), `${wallThickness}`]} />
      <DimH x1={PAD_L} x2={concX} y={TOTAL_DIM_Y} label={`Totaal bekleding: ${totalDepth}mm`} />

      {leaderAnchors.map((anchor, i) => {
        const r = rects[anchor.rectIndex];
        if (anchor.inline) return <LayerLabel key={i} x={anchor.labelX} y={LABEL_Y} text={r.label} />;
        return (
          <g key={i}>
            <line x1={anchor.cx} y1={DIM_Y + 6} x2={anchor.labelX} y2={LABEL_Y - 4} stroke="#94a3b8" strokeWidth={0.5} />
            <text x={anchor.labelX} y={LABEL_Y} textAnchor={anchor.dir < 0 ? 'end' : 'start'} fontSize={7} fill="#475569" fontFamily={FONT}>{r.label}</text>
          </g>
        );
      })}
      <text x={concX + CONC_W / 2} y={LAYER_Y - 6} textAnchor="middle" fontSize={6.5} fill="#64748b" fontFamily={FONT}>{settings.wallSubstrateType ?? 'beton'}</text>

      <SystemNotes sysDef={sysDef} x={PAD_L} y={NOTES_Y} />
    </svg>
  );
}

function OpeningDetailSVG({ detail, variant = 'header' }) {
  const { settings, id } = detail;
  const extStack  = buildExtendedLayerStack(settings);
  const sysInfo   = getSystemInfo(settings);
  const sysDef    = getSystemDefinition(settings);
  const layers    = extStack.layers;
  const totalDepth = extStack.totalDepth;
  debugLogDetail(detail.type, variant, layers, totalDepth);

  const W = 660, H = 340;
  const PAD_L = 70, PAD_R = 36;
  const CONC_W = 60;
  const AVAIL = W - PAD_L - PAD_R - CONC_W;
  const scale = Math.min(4, AVAIL / Math.max(totalDepth, 30));
  const WALL_Y = 50, WALL_H = 120;
  const GAP_Y = WALL_Y + WALL_H;
  const GAP_H = 60;
  const DIM_Y = GAP_Y + GAP_H + 22;
  const concX = PAD_L + totalDepth * scale;

  let xCur = PAD_L;
  const rects = layers.map((l) => {
    const x = xCur;
    xCur += l.thickness * scale;
    return { ...l, x, w: l.thickness * scale };
  });

  const isHeader = variant === 'header';
  const isSill   = variant === 'sill';
  const isJamb   = variant === 'jamb';
  const leaderAnchors = buildLeaderAnchors(rects, { minLabelWidth: 40 });
  const openNote = isHeader ? sysDef.openingDetails?.header : isSill ? sysDef.openingDetails?.sill : sysDef.openingDetails?.jamb;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ background: '#fff', display: 'block', width: '100%', height: 'auto' }}>
      <MaterialPatternDefs svgId={id} />
      <text x={PAD_L} y={18} fontSize={9} fill="#475569" fontFamily={FONT} fontWeight="600">
        {isHeader ? 'Verticale coupe — bovenzijde opening (lintelbalk)' : isSill ? 'Verticale coupe — onderzijde opening (dorpel)' : 'Horizontale coupe — dagkant opening'}
      </text>
      <text x={PAD_L} y={30} fontSize={8} fill="#94a3b8" fontFamily={FONT}>{sysInfo.shortLabel}</text>

      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={WALL_Y} width={Math.max(r.w, 1)} height={WALL_H} fill={layerFill(r.id, id, r.color)} stroke="#334155" strokeWidth={0.5} />
      ))}
      <ConcreteSubstrate x={concX} y={WALL_Y} w={CONC_W} h={WALL_H} svgId={`${id}-ope`} />
      <SystemStructuralOverlay systemType={sysInfo.systemType} rects={rects} layerY={WALL_Y} layerH={WALL_H} isHorizontal={isJamb} settings={settings} />

      {(isHeader || isSill) && (
        <>
          <rect x={PAD_L} y={GAP_Y} width={totalDepth * scale} height={GAP_H} fill="#f0f9ff" stroke="#94a3b8" strokeWidth={0.6} strokeDasharray="3,3" />
          <text x={PAD_L + (totalDepth * scale) / 2} y={GAP_Y + GAP_H / 2} textAnchor="middle" dominantBaseline="middle" fontSize={8} fill="#94a3b8" fontFamily={FONT}>OPENING</text>
          <line x1={PAD_L} y1={GAP_Y} x2={concX + CONC_W} y2={GAP_Y} stroke="#f59e0b" strokeWidth={1.5} />
          <text x={concX + CONC_W + 4} y={GAP_Y + 6} fontSize={7} fill="#b45309" fontFamily={FONT}>✦ {openNote ?? (isHeader ? 'Lintelbalkprofiel' : 'Dorpelprofiel')}</text>
          {sysInfo.systemType === 'hout' && (
            <text x={concX + CONC_W + 4} y={GAP_Y + 18} fontSize={6.5} fill="#475569" fontFamily={FONT}>Compriband + druipneus</text>
          )}
          {sysInfo.systemType === 'aluminium' && (
            <text x={concX + CONC_W + 4} y={GAP_Y + 18} fontSize={6.5} fill="#475569" fontFamily={FONT}>Thermische onderbreking rail</text>
          )}
          {sysInfo.systemType === 'slimfort' && (
            <text x={concX + CONC_W + 4} y={GAP_Y + 18} fontSize={6.5} fill="#475569" fontFamily={FONT}>EPS-retour 100mm</text>
          )}
        </>
      )}

      {isJamb && (
        <>
          <rect x={0} y={WALL_Y} width={PAD_L - 4} height={WALL_H} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={0.6} />
          <text x={PAD_L / 2} y={WALL_Y + WALL_H / 2} textAnchor="middle" dominantBaseline="middle" fontSize={8} fill="#64748b" fontFamily={FONT} transform={`rotate(-90,${PAD_L / 2},${WALL_Y + WALL_H / 2})`}>DAGKANT</text>
          <line x1={PAD_L - 4} y1={WALL_Y} x2={PAD_L - 4} y2={WALL_Y + WALL_H} stroke="#f59e0b" strokeWidth={1.5} />
          <text x={concX + CONC_W + 4} y={WALL_Y + 18} fontSize={7} fill="#b45309" fontFamily={FONT}>✦ {openNote ?? 'Dagkant afdichting'}</text>
        </>
      )}

      {leaderAnchors.map((anchor, i) => {
        const r = rects[anchor.rectIndex];
        return <DimH key={i} x1={r.x} x2={r.x + r.w} y={DIM_Y} label={`${r.thickness}`} />;
      })}
    </svg>
  );
}

function CornerDetailSVG({ detail, variant = 'outside' }) {
  const { settings, id } = detail;
  const extStack   = buildExtendedLayerStack(settings);
  const sysInfo    = getSystemInfo(settings);
  const sysDef     = getSystemDefinition(settings);
  const layers     = extStack.claddingOnlyInsideToOutside;
  const totalDepth = extStack.totalDepth;
  debugLogDetail(detail.type, variant, layers, totalDepth);

  const W = 660, H = 360;
  const CX = W / 2, CY = H / 2 - 10;
  const CONC_T = 60;
  const scale = Math.min(2.5, 150 / Math.max(totalDepth, 30));
  const layerT = totalDepth * scale;
  const isOutside = variant === 'outside';
  const cornerNote = isOutside ? sysDef.cornerDetails?.outside : sysDef.cornerDetails?.return;

  const concPid = `cpid-${id}`;

  if (isOutside) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ background: '#fff', display: 'block', width: '100%', height: 'auto' }}>
        <MaterialPatternDefs svgId={id} />
        <defs>
          <pattern id={concPid} patternUnits="userSpaceOnUse" width="10" height="10">
            <rect width="10" height="10" fill="#b0bec5" />
            <path d="M-1,1 l2,-2 M0,10 l10,-10 M9,11 l2,-2" stroke="#78909c" strokeWidth="0.7" />
          </pattern>
        </defs>
        <text x={20} y={20} fontSize={9} fill="#475569" fontFamily={FONT} fontWeight="600">Horizontale coupe — buitenhoek (bovenaanzicht)</text>
        <text x={20} y={32} fontSize={8} fill="#94a3b8" fontFamily={FONT}>{sysInfo.shortLabel} — beide wanden bekleed, hoek wikkelt om</text>

        <text x={CX} y={CY - CONC_T - layerT - 14} textAnchor="middle" fontSize={8} fontWeight="bold" fill="#1e293b" fontFamily={FONT}>BUITEN</text>
        <text x={CX - CONC_T - layerT - 14} y={CY} textAnchor="end" dominantBaseline="middle" fontSize={8} fontWeight="bold" fill="#1e293b" fontFamily={FONT}>BUITEN</text>

        <rect x={CX - CONC_T} y={CY - CONC_T} width={CONC_T} height={CONC_T + 110} fill={`url(#${concPid})`} stroke="#546e7a" strokeWidth={0.8} />
        <rect x={CX - CONC_T} y={CY - CONC_T} width={CONC_T + 110} height={CONC_T} fill={`url(#${concPid})`} stroke="#546e7a" strokeWidth={0.8} />

        {layers.map((l, i) => {
          const offset = layers.slice(0, i).reduce((s, ll) => s + ll.thickness * scale, 0);
          const thick = l.thickness * scale;
          return (
            <g key={i}>
              <rect x={CX - CONC_T - offset - thick} y={CY - CONC_T} width={thick} height={CONC_T + 110} fill={layerFill(l.id, id, l.color)} stroke="#334155" strokeWidth={0.4} />
              <rect x={CX - CONC_T} y={CY - CONC_T - offset - thick} width={CONC_T + 110} height={thick} fill={layerFill(l.id, id, l.color)} stroke="#334155" strokeWidth={0.4} />
            </g>
          );
        })}

        {sysInfo.systemType === 'hout' && (
          <>
            <line x1={CX - CONC_T - layerT} y1={CY - CONC_T} x2={CX - CONC_T - layerT} y2={CY + 60} stroke="#92400e" strokeWidth={1} strokeDasharray="3,2" />
            <line x1={CX - CONC_T} y1={CY - CONC_T - layerT} x2={CX + 60} y2={CY - CONC_T - layerT} stroke="#92400e" strokeWidth={1} strokeDasharray="3,2" />
            <text x={CX - CONC_T - layerT + 4} y={CY + 72} fontSize={6.5} fill="#92400e" fontFamily={FONT}>Regelcontinuïteit hoek</text>
          </>
        )}
        {sysInfo.systemType === 'aluminium' && (
          <>
            <rect x={CX - CONC_T - layerT - 2} y={CY - CONC_T - 2} width={4} height={CONC_T + 112} fill="#9ca3af" stroke="#475569" strokeWidth={0.5} />
            <rect x={CX - CONC_T - 2} y={CY - CONC_T - layerT - 2} width={CONC_T + 112} height={4} fill="#9ca3af" stroke="#475569" strokeWidth={0.5} />
            <text x={CX - CONC_T - layerT - 10} y={CY + 74} fontSize={6.5} fill="#0369a1" fontFamily={FONT}>L-hoekprofiel alu</text>
          </>
        )}
        {sysInfo.systemType === 'slimfort' && (
          <>
            <text x={CX + 8} y={CY + 68} fontSize={6.5} fill="#92400e" fontFamily={FONT}>EPS-wikkeling + hoekstrip</text>
          </>
        )}

        {cornerNote && <text x={20} y={H - 16} fontSize={7} fill="#475569" fontFamily={FONT}>✦ {cornerNote}</text>}

        <DimH x1={CX - CONC_T - layerT} x2={CX - CONC_T} y={CY + 90} label={`${totalDepth}mm`} />
        <DimV x={CX + 90} y1={CY - CONC_T - layerT} y2={CY - CONC_T} label={`${totalDepth}mm`} side="right" />
      </svg>
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ background: '#fff', display: 'block', width: '100%', height: 'auto' }}>
      <MaterialPatternDefs svgId={id} />
      <defs>
        <pattern id={concPid} patternUnits="userSpaceOnUse" width="10" height="10">
          <rect width="10" height="10" fill="#b0bec5" />
          <path d="M-1,1 l2,-2 M0,10 l10,-10 M9,11 l2,-2" stroke="#78909c" strokeWidth="0.7" />
        </pattern>
      </defs>
      <text x={20} y={20} fontSize={9} fill="#475569" fontFamily={FONT} fontWeight="600">Horizontale coupe — teruggevel (bovenaanzicht)</text>
      <text x={20} y={32} fontSize={8} fill="#94a3b8" fontFamily={FONT}>{sysInfo.shortLabel} — hoofdgevel bekleed, zijgevel teruggeplaatst</text>

      <text x={CX - CONC_T - layerT / 2} y={CY - CONC_T - 14} textAnchor="middle" fontSize={8} fontWeight="bold" fill="#1e293b" fontFamily={FONT}>BUITEN</text>
      <text x={CX + CONC_T + 80} y={CY - CONC_T / 2} textAnchor="start" dominantBaseline="middle" fontSize={8} fill="#94a3b8" fontFamily={FONT}>BINNEN →</text>

      <rect x={CX - CONC_T} y={CY - CONC_T} width={CONC_T} height={CONC_T + 110} fill={`url(#${concPid})`} stroke="#546e7a" strokeWidth={0.8} />
      <rect x={CX} y={CY - CONC_T} width={CONC_T + 110} height={CONC_T} fill={`url(#${concPid})`} stroke="#546e7a" strokeWidth={0.8} />

      {layers.map((l, i) => {
        const offset = layers.slice(0, i).reduce((s, ll) => s + ll.thickness * scale, 0);
        const thick = l.thickness * scale;
        return (
          <rect key={i} x={CX - CONC_T - offset - thick} y={CY - CONC_T} width={thick} height={CONC_T + 110} fill={layerFill(l.id, id, l.color)} stroke="#334155" strokeWidth={0.4} />
        );
      })}

      <line x1={CX - CONC_T - layerT} y1={CY - CONC_T} x2={CX - CONC_T - layerT} y2={CY + 70} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4,3" />
      <text x={CX - CONC_T - layerT} y={CY + 82} textAnchor="middle" fontSize={7} fill="#b45309" fontFamily={FONT}>✦ Kantprofiel / retour</text>
      {cornerNote && <text x={20} y={H - 16} fontSize={7} fill="#475569" fontFamily={FONT}>✦ {cornerNote}</text>}

      <DimH x1={CX - CONC_T - layerT} x2={CX - CONC_T} y={CY + 96} label={`${totalDepth}mm`} />
    </svg>
  );
}

function TerminationDetailSVG({ detail, variant = 'ground' }) {
  const { settings, id } = detail;
  const extStack = buildExtendedLayerStack(settings);
  const sysInfo  = getSystemInfo(settings);
  const sysDef   = getSystemDefinition(settings);
  const orient   = buildSectionOrientation({ detailType: detail.type, layerStack: extStack });
  const layers   = orient.layerRenderOrder ?? extStack.claddingOnlyOutsideToInside;
  const totalDepth = extStack.totalDepth;
  debugLogDetail(detail.type, variant, layers, totalDepth);
  const W = 660, H = 340;
  const PAD_L = 70, PAD_R = 36;
  const CONC_W = 60;
  const AVAIL = W - PAD_L - PAD_R - CONC_W;
  const scale = Math.min(4, AVAIL / Math.max(totalDepth, 30));
  const concX = PAD_L + totalDepth * scale;

  const isGround = variant === 'ground';
  const WALL_Y = isGround ? 40 : 120;
  const WALL_H = 130;
  const NOTES_Y = WALL_Y + WALL_H + 60;

  let xCur = PAD_L;
  const rects = layers.map((l) => {
    const x = xCur;
    xCur += l.thickness * scale;
    return { ...l, x, w: l.thickness * scale };
  });

  const termY = isGround ? WALL_Y + WALL_H : WALL_Y;
  const leaderAnchors = buildLeaderAnchors(rects, { minLabelWidth: 40 });

  const termNote = isGround
    ? (sysDef?.openingDetails?.sill ?? 'Startprofiel + aansluiting onderzijde')
    : (sysInfo.systemType === 'hout' ? 'Afwerkprofiel + ventilatie-opening bovenzijde'
      : sysInfo.systemType === 'aluminium' ? 'Afwerkkap + dilatatievoeg dakrand'
      : 'EPS-afdekplaat / afwerkdop bovenzijde');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ background: '#fff', display: 'block', width: '100%', height: 'auto' }}>
      <MaterialPatternDefs svgId={id} />
      <text x={PAD_L} y={20} fontSize={9} fill="#475569" fontFamily={FONT} fontWeight="600">
        {isGround ? 'Verticale coupe — maaiveld (onderkant systeem)' : 'Verticale coupe — bovenzijde / dakrand'}
      </text>
      <text x={PAD_L} y={32} fontSize={8} fill="#94a3b8" fontFamily={FONT}>{sysInfo.shortLabel}</text>

      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={WALL_Y} width={Math.max(r.w, 1)} height={WALL_H} fill={layerFill(r.id, id, r.color)} stroke="#334155" strokeWidth={0.5} />
      ))}
      <ConcreteSubstrate x={concX} y={WALL_Y} w={CONC_W} h={WALL_H} svgId={`${id}-term`} />

      <SystemStructuralOverlay
        systemType={sysInfo.systemType}
        rects={rects}
        layerY={WALL_Y}
        layerH={WALL_H}
        isHorizontal={false}
        settings={settings}
      />

      {isGround && (
        <>
          <rect x={0} y={termY} width={W} height={30} fill="#78716c" />
          <text x={W / 2} y={termY + 20} textAnchor="middle" fontSize={8} fill="#fff" fontFamily={FONT}>MAAIVELD / VLOERPEIL</text>
          <line x1={PAD_L} y1={termY} x2={concX + CONC_W} y2={termY} stroke="#f59e0b" strokeWidth={1.5} />
          <text x={concX + CONC_W + 4} y={termY - 4} fontSize={7} fill="#b45309" fontFamily={FONT}>✦ Startprofiel</text>
        </>
      )}

      {!isGround && (
        <>
          <line x1={PAD_L} y1={termY} x2={concX + CONC_W} y2={termY} stroke="#f59e0b" strokeWidth={1.5} />
          <text x={concX + CONC_W + 4} y={termY - 4} fontSize={7} fill="#b45309" fontFamily={FONT}>✦ Afwerkprofiel / dop</text>
          <rect x={PAD_L - 6} y={termY - 20} width={totalDepth * scale + 12} height={20} fill="#94a3b8" opacity={0.3} stroke="#64748b" strokeWidth={0.6} />
          <text x={PAD_L + totalDepth * scale / 2} y={termY - 8} textAnchor="middle" fontSize={7} fill="#475569" fontFamily={FONT}>Afwerkkap</text>
        </>
      )}

      {leaderAnchors.map((anchor, i) => {
        const r = rects[anchor.rectIndex];
        return <DimH key={i} x1={r.x} x2={r.x + r.w} y={WALL_Y + WALL_H + 28} label={`${r.thickness}`} />;
      })}

      <text x={PAD_L} y={NOTES_Y} fontSize={7} fill="#64748b" fontFamily={FONT}>✦ {termNote}</text>
      <SystemNotes sysDef={sysDef} x={PAD_L} y={NOTES_Y + 14} maxW={W - PAD_L - PAD_R} />
    </svg>
  );
}

function PanelJointSVG({ detail, variant = 'v' }) {
  const { settings, id } = detail;
  const extStack = buildExtendedLayerStack(settings);
  const sysInfo  = getSystemInfo(settings);
  const sysDef   = getSystemDefinition(settings);
  const orient   = buildSectionOrientation({ detailType: detail.type, layerStack: extStack });
  const layers   = orient.layerRenderOrder ?? extStack.claddingOnlyOutsideToInside;
  const totalDepth = extStack.totalDepth;
  debugLogDetail(detail.type, variant === 'v' ? 'vertical' : 'horizontal', layers, totalDepth);
  const W = 660, H = 340;
  const PAD_L = 70, PAD_R = 36;
  const CONC_W = 60;
  const AVAIL = W - PAD_L - PAD_R - CONC_W;
  const scale = Math.min(4, AVAIL / Math.max(totalDepth, 30));
  const concX = PAD_L + totalDepth * scale;
  const isVertical = variant === 'v';

  const WALL_Y = 60, WALL_H = 140;
  const NOTES_Y = WALL_Y + WALL_H + 56;
  let xCur = PAD_L;
  const rects = layers.map((l) => {
    const x = xCur;
    xCur += l.thickness * scale;
    return { ...l, x, w: l.thickness * scale };
  });

  const ceramicLayer = rects.find((r) => r.id === 'ceramic' || r.id === 'brick');
  const leaderAnchors = buildLeaderAnchors(rects, { minLabelWidth: 40 });

  const jointNote = isVertical
    ? (sysInfo.systemType === 'hout'      ? `Verticale voeg ${sysDef?.movementJointMm ?? 6000}mm rastermatig`
      : sysInfo.systemType === 'aluminium' ? `Dilatatievoeg ≤ ${sysDef?.movementJointMm ?? 4500}mm h.o.h.`
      : 'Verticale voeg per EPS-element')
    : (sysInfo.systemType === 'hout'      ? 'Horizontale voeg + druipneus'
      : sysInfo.systemType === 'aluminium' ? 'Horizontale voeg + railovergang'
      : 'Horizontale tong/groef-voeg EPS');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ background: '#fff', display: 'block', width: '100%', height: 'auto' }}>
      <MaterialPatternDefs svgId={id} />
      <text x={PAD_L} y={20} fontSize={9} fill="#475569" fontFamily={FONT} fontWeight="600">
        {isVertical ? 'Coupe — verticale paneelvoeg' : 'Coupe — horizontale paneelvoeg'}
      </text>
      <text x={PAD_L} y={32} fontSize={8} fill="#94a3b8" fontFamily={FONT}>{sysInfo.shortLabel}</text>

      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={WALL_Y} width={Math.max(r.w, 1)} height={WALL_H} fill={layerFill(r.id, id, r.color)} stroke="#334155" strokeWidth={0.5} />
      ))}
      <ConcreteSubstrate x={concX} y={WALL_Y} w={CONC_W} h={WALL_H} svgId={`${id}-pj`} />

      <SystemStructuralOverlay
        systemType={sysInfo.systemType}
        rects={rects}
        layerY={WALL_Y}
        layerH={WALL_H}
        isHorizontal={!isVertical}
        settings={settings}
      />

      {ceramicLayer && isVertical && (
        <>
          <line x1={ceramicLayer.x} y1={WALL_Y} x2={ceramicLayer.x} y2={WALL_Y + WALL_H} stroke="#1e293b" strokeWidth={1} />
          <line x1={ceramicLayer.x + ceramicLayer.w} y1={WALL_Y} x2={ceramicLayer.x + ceramicLayer.w} y2={WALL_Y + WALL_H} stroke="#1e293b" strokeWidth={1} />
          <line x1={ceramicLayer.x + ceramicLayer.w / 2} y1={WALL_Y} x2={ceramicLayer.x + ceramicLayer.w / 2} y2={WALL_Y + WALL_H} stroke="#64748b" strokeWidth={0.6} strokeDasharray="3,3" />
          <text x={ceramicLayer.x + ceramicLayer.w / 2} y={WALL_Y - 8} textAnchor="middle" fontSize={7} fill="#64748b" fontFamily={FONT}>Voeg</text>
        </>
      )}

      {ceramicLayer && !isVertical && (
        <>
          <line x1={ceramicLayer.x} y1={WALL_Y + WALL_H / 2} x2={ceramicLayer.x + ceramicLayer.w} y2={WALL_Y + WALL_H / 2} stroke="#64748b" strokeWidth={0.6} strokeDasharray="3,3" />
          <text x={ceramicLayer.x - 4} y={WALL_Y + WALL_H / 2} textAnchor="end" dominantBaseline="middle" fontSize={7} fill="#64748b" fontFamily={FONT}>Voeg</text>
        </>
      )}

      {leaderAnchors.map((anchor, i) => {
        const r = rects[anchor.rectIndex];
        return <DimH key={i} x1={r.x} x2={r.x + r.w} y={WALL_Y + WALL_H + 24} label={`${r.thickness}`} />;
      })}

      <text x={PAD_L} y={NOTES_Y} fontSize={7} fill="#64748b" fontFamily={FONT}>✦ {jointNote}</text>
      <SystemNotes sysDef={sysDef} x={PAD_L} y={NOTES_Y + 14} maxW={W - PAD_L - PAD_R} />
    </svg>
  );
}

function SlimFortEpsSVG({ detail }) {
  const { settings, id } = detail;
  const sf = settings.slimFortSettings ?? {};
  const W = 660, H = 310;
  const elemL = sf.elementLength ?? 1200;
  const elemH = sf.elementHeight ?? 600;
  const totalT = sf.totalThickness ?? 196;
  const tongueD = sf.tongueGrooveDepth ?? 41;
  const tongueW = sf.tongueWidth ?? 25;
  const rearZone = sf.rearZoneThickness ?? 39;
  const scale = Math.min(0.28, 500 / Math.max(elemL, 600));

  const PAD = 60;
  const epsX = PAD, epsY = 60;
  const epsW = elemL * scale, epsH = totalT * scale;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ background: '#fff', display: 'block' }}>
      <text x={PAD} y={20} fontSize={9} fill="#475569" fontFamily={FONT}>SlimFort XT® — EPS element doorsnede (bovenaanzicht)</text>

      <rect x={epsX} y={epsY} width={epsW} height={epsH} fill="#ece8d8" stroke="#b0a880" strokeWidth={1} />

      <rect x={epsX} y={epsY} width={epsW} height={rearZone * scale} fill="#ddd8c4" stroke="#b0a880" strokeWidth={0.5} />
      <text x={epsX + epsW / 2} y={epsY + rearZone * scale / 2} textAnchor="middle" dominantBaseline="middle" fontSize={7} fill="#5a4f30" fontFamily={FONT}>Achterzone {rearZone}mm</text>

      <rect x={epsX + epsW - tongueD * scale} y={epsY + (totalT - tongueW) / 2 * scale} width={tongueD * scale} height={tongueW * scale} fill="#c89438" stroke="#9a6c20" strokeWidth={0.5} />
      <text x={epsX + epsW - tongueD * scale / 2} y={epsY + totalT * scale / 2} textAnchor="middle" dominantBaseline="middle" fontSize={6} fill="#5a3800" fontFamily={FONT}>Tong</text>

      <DimH x1={epsX} x2={epsX + epsW} y={epsY + epsH + 24} label={`${elemL}mm`} />
      <DimV x={epsX - 20} y1={epsY} y2={epsY + epsH} label={`${totalT}mm`} />
      <DimV x={epsX - 36} y1={epsY} y2={epsY + rearZone * scale} label={`${rearZone}`} />
    </svg>
  );
}

function SlimFortBracketSVG({ detail }) {
  const { settings, id } = detail;
  const sf = settings.slimFortSettings ?? {};
  const W = 660, H = 300;
  const brkW = sf.bracketWidth ?? 128;
  const brkH = sf.bracketHeight ?? 60;
  const brkT = sf.bracketThickness ?? 2;
  const brkD = sf.bracketDepth ?? 50;
  const totalT = sf.totalThickness ?? 196;
  const scale = Math.min(2, 300 / Math.max(totalT, 100));

  const PAD = 80;
  const CX = W / 2, baseY = 220;
  const epsY = baseY - totalT * scale;
  const brkX = CX - brkW * scale / 2;
  const brkY = baseY - brkD * scale;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ background: '#fff', display: 'block' }}>
      <text x={PAD} y={20} fontSize={9} fill="#475569" fontFamily={FONT}>SlimFort XT® — Bevestigingsbeugel (vooraanzicht)</text>

      <rect x={CX - totalT * scale / 2 - 30} y={epsY} width={totalT * scale + 60} height={totalT * scale} fill="#ece8d8" stroke="#b0a880" strokeWidth={0.8} opacity={0.8} />
      <text x={CX} y={epsY + 12} textAnchor="middle" fontSize={7} fill="#5a4f30" fontFamily={FONT}>EPS {totalT}mm</text>

      <rect x={brkX} y={brkY} width={brkW * scale} height={brkT * scale + 2} fill="#6b7280" stroke="#374151" strokeWidth={0.8} />
      <rect x={CX - brkT * scale / 2} y={brkY} width={brkT * scale + 2} height={brkD * scale} fill="#6b7280" stroke="#374151" strokeWidth={0.8} />

      <line x1={CX - brkT * scale / 2} y1={brkY + brkD * scale} x2={CX - brkT * scale / 2} y2={baseY} stroke="#374151" strokeWidth={0.6} strokeDasharray="3,3" />
      <text x={CX + 8} y={baseY + 10} fontSize={7} fill="#475569" fontFamily={FONT}>Anker in substrate</text>

      <DimH x1={brkX} x2={brkX + brkW * scale} y={brkY - 16} label={`${brkW}mm`} />
      <DimV x={CX + brkW * scale / 2 + 24} y1={brkY} y2={brkY + brkD * scale} label={`${brkD}mm`} side="right" />
    </svg>
  );
}

function SlimFortProfileSVG({ detail }) {
  const { settings, id } = detail;
  const sf = settings.slimFortSettings ?? {};
  const W = 660, H = 300;
  const prfW = sf.profileWidth ?? 44;
  const prfH = sf.profileHeight ?? 44;
  const prfT = sf.profileThickness ?? 2;
  const prfD = sf.profileDepth ?? 63;
  const prfInsD = sf.profileInsertDepth ?? 33;
  const totalT = sf.totalThickness ?? 196;
  const scale = Math.min(3, 200 / Math.max(totalT, 50));

  const CX = W / 2, baseY = 200;
  const epsY = baseY - totalT * scale;
  const prfY = baseY - prfD * scale;
  const prfX = CX - prfW * scale / 2;
  const PAD = 40;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ background: '#fff', display: 'block' }}>
      <text x={PAD} y={20} fontSize={9} fill="#475569" fontFamily={FONT}>SlimFort XT® — Verbindingsprofiel (doorsnede)</text>

      <rect x={CX - 80} y={epsY} width={160} height={totalT * scale} fill="#ece8d8" stroke="#b0a880" strokeWidth={0.8} opacity={0.75} />
      <text x={CX} y={epsY + 12} textAnchor="middle" fontSize={7} fill="#5a4f30" fontFamily={FONT}>EPS</text>

      <rect x={prfX} y={prfY} width={prfW * scale} height={prfT * scale + 2} fill="#374151" stroke="#1f2937" strokeWidth={0.8} />
      <rect x={prfX} y={prfY + prfT * scale + 2} width={prfT * scale + 2} height={(prfH - prfT) * scale} fill="#374151" stroke="#1f2937" strokeWidth={0.8} />
      <rect x={prfX + prfW * scale - prfT * scale - 2} y={prfY + prfT * scale + 2} width={prfT * scale + 2} height={(prfH - prfT) * scale} fill="#374151" stroke="#1f2937" strokeWidth={0.8} />

      <line x1={CX} y1={prfY} x2={CX} y2={epsY} stroke="#374151" strokeWidth={0.6} strokeDasharray="3,3" />
      <text x={CX + 8} y={epsY + 8} fontSize={6} fill="#374151" fontFamily={FONT}>Insteekdiepte {prfInsD}mm</text>

      <DimH x1={prfX} x2={prfX + prfW * scale} y={prfY - 16} label={`${prfW}mm`} />
      <DimV x={prfX + prfW * scale + 24} y1={prfY} y2={prfY + prfD * scale} label={`${prfD}mm`} side="right" />
    </svg>
  );
}

function DetailSVG({ detail }) {
  switch (detail.type) {
    case DETAIL_TYPES.SYSTEM_VERTICAL: return <SystemSectionSVG detail={detail} orientation="v" />;
    case DETAIL_TYPES.SYSTEM_HORIZONTAL: return <SystemSectionSVG detail={detail} orientation="h" />;
    case DETAIL_TYPES.OPENING_HEADER: return <OpeningDetailSVG detail={detail} variant="header" />;
    case DETAIL_TYPES.OPENING_SILL: return <OpeningDetailSVG detail={detail} variant="sill" />;
    case DETAIL_TYPES.OPENING_JAMB: return <OpeningDetailSVG detail={detail} variant="jamb" />;
    case DETAIL_TYPES.CORNER_OUTSIDE: return <CornerDetailSVG detail={detail} variant="outside" />;
    case DETAIL_TYPES.CORNER_RETURN: return <CornerDetailSVG detail={detail} variant="return" />;
    case DETAIL_TYPES.GROUND_BASE: return <TerminationDetailSVG detail={detail} variant="ground" />;
    case DETAIL_TYPES.TOP_PARAPET: return <TerminationDetailSVG detail={detail} variant="top" />;
    case DETAIL_TYPES.PANEL_JOINT_V: return <PanelJointSVG detail={detail} variant="v" />;
    case DETAIL_TYPES.PANEL_JOINT_H: return <PanelJointSVG detail={detail} variant="h" />;
    case DETAIL_TYPES.SLIMFORT_EPS: return <SlimFortEpsSVG detail={detail} />;
    case DETAIL_TYPES.SLIMFORT_BRACKET: return <SlimFortBracketSVG detail={detail} />;
    case DETAIL_TYPES.SLIMFORT_PROFILE: return <SlimFortProfileSVG detail={detail} />;
    default: return null;
  }
}

function ReferencesPanel({ refs }) {
  const [open, setOpen] = useState(false);
  if (!refs || refs.length === 0) return null;
  return (
    <div style={{ marginTop: 10, borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
      <button
        onClick={() => setOpen((s) => !s)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#475569', fontFamily: 'monospace', padding: '2px 0', display: 'flex', alignItems: 'center', gap: 4 }}
      >
        <span style={{ fontSize: 9 }}>{open ? '▲' : '▼'}</span>
        IFC Referenties ({refs.length})
      </button>
      {open && (
        <div style={{ overflowX: 'auto', marginTop: 6 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ textAlign: 'left', padding: '3px 8px', color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>expressID</th>
                <th style={{ textAlign: 'left', padding: '3px 8px', color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>IFC GlobalId</th>
                <th style={{ textAlign: 'left', padding: '3px 8px', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Wand</th>
                <th style={{ textAlign: 'left', padding: '3px 8px', color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Sparing ID</th>
                <th style={{ textAlign: 'left', padding: '3px 8px', color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Positie (mm)</th>
                <th style={{ textAlign: 'left', padding: '3px 8px', color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Lokaal (x,y mm)</th>
                <th style={{ textAlign: 'left', padding: '3px 8px', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Ondergrond</th>
              </tr>
            </thead>
            <tbody>
              {refs.map((r, i) => {
                const pos = r.worldPosition;
                const posStr = pos ? Object.entries(pos).map(([k, v]) => `${k}:${v}`).join(' ') : '—';
                const locStr = r.localPosition ? `${r.localPosition.x}, ${r.localPosition.y}` : '—';
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '3px 8px', fontFamily: 'monospace', color: '#0369a1' }}>{r.expressID ?? '—'}</td>
                    <td style={{ padding: '3px 8px', fontFamily: 'monospace', color: '#475569', fontSize: 9, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.ifcGlobalId ?? '—'}</td>
                    <td style={{ padding: '3px 8px', color: '#1e293b', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.wallName ?? '—'}</td>
                    <td style={{ padding: '3px 8px', fontFamily: 'monospace', color: '#475569' }}>{r.openingId != null ? r.openingId : '—'}</td>
                    <td style={{ padding: '3px 8px', color: '#475569', fontSize: 9 }}>{posStr}</td>
                    <td style={{ padding: '3px 8px', fontFamily: 'monospace', color: '#475569' }}>{locStr}</td>
                    <td style={{ padding: '3px 8px', color: '#475569' }}>{r.wallSubstrateType ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DetailCard({ detail }) {
  const stack = buildCanonicalFacadeLayerStack(detail.settings ?? {});
  const orient = buildSectionOrientation({ detailType: detail.type, layerStack: stack });
  const substrateLabel = !detail.settings?.wallSubstrateType || detail.settings?.wallSubstrateType === 'unknown'
    ? 'Substraat onbekend'
    : detail.settings.wallSubstrateType;
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', minWidth: 64, fontFamily: 'monospace' }}>{detail.id}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{detail.title}</span>
        <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>{detail.subtitle}</span>
        {detail.settings?.wallSubstrateType === 'unknown' && (
          <span style={{ fontSize: 10, color: '#b45309', background: '#fef3c7', borderRadius: 3, padding: '1px 6px' }}>⚠ Substraat onbekend</span>
        )}
      </div>
      <div style={{ borderRadius: 4 }}>
        <DetailSVG detail={detail} />
      </div>
      {SHOW_ORIENTATION_DEBUG && <SectionOrientationDebug orientation={orient} />}
      <ReferencesPanel refs={detail.references} />
    </div>
  );
}

function TabIndex({ details, groupIndex, keyToId }) {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 16 }}>Inhoudsopgave</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            <th style={{ textAlign: 'left', padding: '6px 12px', color: '#475569', fontWeight: 600, border: '1px solid #e2e8f0' }}>Nr.</th>
            <th style={{ textAlign: 'left', padding: '6px 12px', color: '#475569', fontWeight: 600, border: '1px solid #e2e8f0' }}>Omschrijving</th>
            <th style={{ textAlign: 'left', padding: '6px 12px', color: '#475569', fontWeight: 600, border: '1px solid #e2e8f0' }}>Tabblad</th>
            <th style={{ textAlign: 'left', padding: '6px 12px', color: '#475569', fontWeight: 600, border: '1px solid #e2e8f0' }}>Groepen</th>
          </tr>
        </thead>
        <tbody>
          {details.map((d) => (
            <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '5px 12px', fontFamily: 'monospace', color: '#0369a1', fontWeight: 700, border: '1px solid #e2e8f0' }}>{d.id}</td>
              <td style={{ padding: '5px 12px', color: '#1e293b', border: '1px solid #e2e8f0' }}>{d.title}</td>
              <td style={{ padding: '5px 12px', color: '#475569', border: '1px solid #e2e8f0', textTransform: 'capitalize' }}>{d.tab}</td>
              <td style={{ padding: '5px 12px', color: '#64748b', fontSize: 11, border: '1px solid #e2e8f0' }}>{(d.groupIds ?? []).length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SYS_BADGE = {
  hout:      { label: 'Hout', color: '#78350f', bg: '#fef3c7', border: '#d97706' },
  aluminium: { label: 'Aluminium', color: '#0c4a6e', bg: '#e0f2fe', border: '#0284c7' },
  slimfort:  { label: 'SlimFort XT®', color: '#3b0764', bg: '#f3e8ff', border: '#7c3aed' },
};

function KeyplanLegend({ layers }) {
  if (!layers || layers.length === 0) return null;
  const totalT = layers.reduce((s, l) => s + l.thickness, 0) || 1;
  const BAR_W = 180;
  return (
    <div style={{ marginTop: 10, marginBottom: 10 }}>
      <div style={{ display: 'flex', height: 20, width: BAR_W, borderRadius: 3, overflow: 'hidden', border: '1px solid #cbd5e1' }}>
        {layers.map((l) => (
          <div
            key={l.id}
            title={`${l.label} (${l.thickness}mm)`}
            style={{ flex: l.thickness / totalT, background: l.color, minWidth: 2, borderRight: '1px solid rgba(255,255,255,0.25)' }}
          />
        ))}
      </div>
      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {layers.map((l) => (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, background: l.color, border: '1px solid rgba(0,0,0,0.15)', borderRadius: 1, flexShrink: 0 }} />
            <span style={{ fontSize: 9.5, color: '#475569', fontFamily: 'Arial, sans-serif' }}>{l.label}</span>
            <span style={{ fontSize: 9, color: '#94a3b8', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{l.thickness}mm</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabKeyplan({ groups, getSettings, allPatterns }) {
  return (
    <div style={{ padding: 24, background: '#f8fafc', minHeight: '100%' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 4, letterSpacing: '0.02em' }}>Keyplan — Projectoverzicht</div>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 20 }}>Overzicht van alle gevelgroepen met materiaalsysteem en laagopbouw</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
        {(groups ?? []).map((g, idx) => {
          const s = getSettings(g.id) ?? {};
          const layers = buildSystemLayers(s);
          const sysInfo = getSystemInfo(s);
          const bt = s.backingType ?? 'hout';
          const badge = SYS_BADGE[bt === 'aluminium_slimfort' ? 'slimfort' : bt] ?? SYS_BADGE.hout;
          const totalD = layers.reduce((sum, l) => sum + l.thickness, 0);
          const wallCount = g.wallIds?.length ?? 0;
          const substrate = s.wallSubstrateType ?? 'beton';
          return (
            <div key={g.id} style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderTop: `3px solid ${badge.border}`,
              borderRadius: 6,
              padding: '14px 16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>Groep {idx + 1}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{s?.name ?? g.id}</div>
                </div>
                <div style={{
                  fontSize: 9, fontWeight: 700,
                  color: badge.color, background: badge.bg,
                  border: `1px solid ${badge.border}`,
                  borderRadius: 3, padding: '2px 7px',
                  letterSpacing: '0.04em', whiteSpace: 'nowrap',
                  alignSelf: 'flex-start',
                }}>{badge.label}</div>
              </div>

              <div style={{ display: 'flex', gap: 16, fontSize: 10, color: '#64748b', marginBottom: 10 }}>
                <span>Ondergrond: <strong style={{ color: '#1e293b' }}>{substrate}</strong></span>
                <span>{wallCount} wand{wallCount !== 1 ? 'en' : ''}</span>
                <span>Ø {totalD}mm</span>
              </div>

              <KeyplanLegend layers={layers} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TabContent({ tabId, details, groups, getSettings, allPatterns, groupIndex, keyToId }) {
  if (tabId === 'index') return <TabIndex details={details} groupIndex={groupIndex} keyToId={keyToId} />;
  if (tabId === 'keyplan') return <TabKeyplan groups={groups} getSettings={getSettings} allPatterns={allPatterns} />;
  const tabDetails = details.filter((d) => d.tab === tabId);
  if (tabDetails.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
        Geen details beschikbaar voor dit tabblad.
      </div>
    );
  }
  return (
    <div style={{ padding: 24 }}>
      {tabDetails.map((d) => <DetailCard key={d.id} detail={d} />)}
    </div>
  );
}

const PRINT_STYLES = `
* { box-sizing: border-box; }
body { font-family: Arial, sans-serif; margin: 0; padding: 16px; background: #fff; overflow: visible; }
svg { display: block; max-width: 100%; height: auto; overflow: visible; }
img { max-width: 100%; }
.detail-card { page-break-inside: avoid; margin-bottom: 20px; }
@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; padding: 8mm; }
  .page-section { page-break-after: always; }
  svg { overflow: visible; }
  * { overflow: visible !important; }
}
`;

function openPrintWindow(html, title) {
  const win = window.open('', '_blank', 'width=1100,height=800');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>${PRINT_STYLES}</style></head><body>${html}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 500);
}

export function DetailBoek({ groups, walls, getSettings, allPatterns }) {
  const [activeTab, setActiveTab] = useState('index');
  const printRef = useRef(null);
  const printAllRef = useRef(null);

  const { details, groupIndex, keyToId } = useMemo(
    () => generateProjectDetailBook({ groups, walls, getSettings, allPatterns }),
    [groups, walls, getSettings, allPatterns],
  );

  const tabCounts = useMemo(() => {
    const c = {};
    for (const d of details) c[d.tab] = (c[d.tab] ?? 0) + 1;
    return c;
  }, [details]);

  const hasAnySlimFort = useMemo(
    () => (groups ?? []).some((g) => isSlimFortActive(getSettings(g.id) ?? {})),
    [groups, getSettings],
  );

  function handlePrintActive() {
    openPrintWindow(printRef.current?.innerHTML ?? '', 'Detailboek — Huidig tabblad');
  }

  function handlePrintAll() {
    openPrintWindow(printAllRef.current?.innerHTML ?? '', 'Detailboek — Volledig');
  }

  const tabContentProps = { details, groups, getSettings, allPatterns, groupIndex, keyToId };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: '#f1f5f9' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 0, flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', padding: '10px 16px 10px 0', borderRight: '1px solid #e2e8f0', marginRight: 8, whiteSpace: 'nowrap' }}>📋 Detailboek</div>
        <div style={{ display: 'flex', flex: 1, overflowX: 'auto' }}>
          {TABS.filter((t) => {
            if (t.id === 'index' || t.id === 'keyplan') return true;
            if (t.id === 'slimfort') return hasAnySlimFort && (tabCounts[t.id] ?? 0) > 0;
            return (tabCounts[t.id] ?? 0) > 0;
          }).map((t) => {
            const count = t.id === 'index' || t.id === 'keyplan' ? null : (tabCounts[t.id] ?? 0);
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  background: 'none', border: 'none', borderBottom: isActive ? '2px solid #0369a1' : '2px solid transparent',
                  padding: '10px 12px', fontSize: 12, cursor: 'pointer', color: isActive ? '#0369a1' : '#64748b',
                  fontWeight: isActive ? 700 : 400, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                {t.label}
                {count !== null && count > 0 && (
                  <span style={{ fontSize: 10, background: isActive ? '#0369a1' : '#e2e8f0', color: isActive ? '#fff' : '#64748b', borderRadius: 8, padding: '1px 5px', fontWeight: 600 }}>{count}</span>
                )}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 12, flexShrink: 0 }}>
          <button
            onClick={handlePrintActive}
            style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
          >
            🖨 Huidig tabblad
          </button>
          <button
            onClick={handlePrintAll}
            style={{ background: '#0f172a', color: '#e2e8f0', border: 'none', borderRadius: 4, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
          >
            🖨 Volledig boek
          </button>
        </div>
      </div>
      <div ref={printRef} style={{ flex: 1, overflowY: 'auto' }}>
        <TabContent tabId={activeTab} {...tabContentProps} />
      </div>
      <div
        ref={printAllRef}
        style={{ position: 'absolute', left: -9999, top: 0, width: 1100, visibility: 'hidden', pointerEvents: 'none', background: '#fff' }}
        aria-hidden="true"
      >
        {TABS.map((t) => (
          <div key={t.id} className="page-section">
            <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 14, fontWeight: 700, padding: '12px 24px', background: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>{t.label}</div>
            <TabContent tabId={t.id} {...tabContentProps} />
          </div>
        ))}
      </div>
    </div>
  );
}
