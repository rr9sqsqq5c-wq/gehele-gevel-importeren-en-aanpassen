import { useState, useMemo, useCallback } from 'react';

const BRICK_COLORS = {
  Strek:       '#e8c5d8',
  Kop:         '#d4a0c0',
  Drieklezoor: '#f0d0e4',
  Slot:        '#ffffff',
};
const TYPE_SHORT = { Strek: 'S', Kop: 'K', Drieklezoor: 'D', Slot: '□' };
const TYPES = ['Strek', 'Kop', 'Drieklezoor'];
const WV_MODULE_TYPES = ['Strek', 'Strek', 'Drieklezoor', 'Strek', 'Kop', 'Strek'];

function computeDims(p) {
  const S = p.steen_breedte;
  const H = p.steen_hoogte;
  const sv = p.stootvoeg_dikte ?? p.voeg_dikte;
  const lv = p.lintvoeg_dikte ?? p.voeg_dikte;
  const j = sv;
  const K = Math.round((S - sv) / 2);
  const D = Math.round((3 * S - sv) / 4);
  const lagenmaat = H + lv;
  const moduleW = 4 * S + D + K + 6 * sv;
  return { S, H, j, sv, lv, K, D, lagenmaat, moduleW };
}

function brickWidth(type, dims) {
  if (type === 'Kop') return dims.K;
  if (type === 'Drieklezoor') return dims.D;
  return dims.S;
}

function computeRowLayout(rowBricks, dims, paneel_breedte) {
  let x = 0;
  const placed = [];
  for (const b of rowBricks) {
    const w = brickWidth(b.effectiveType ?? b.type, dims);
    if (x + w > paneel_breedte + 0.5) break;
    placed.push({ type: b.type, effectiveType: b.effectiveType, isSlot: !!b.isSlot, x, width: w });
    x += w + dims.j;
  }
  const lastEnd = placed.length ? placed[placed.length - 1].x + placed[placed.length - 1].width : 0;
  const remaining = paneel_breedte - lastEnd - (placed.length > 0 ? dims.j : 0);
  return { placed, remaining: Math.max(0, remaining) };
}

function buildFacadeFromCustomPanel(p, openings, savedPanel, dims) {
  const { H, lagenmaat, S, K, D, j } = dims;
  const startRowsSaved = savedPanel.startRows ?? savedPanel.rows ?? {};
  const followRowsSaved = savedPanel.followRows ?? {};
  const { paneel_breedte } = savedPanel;
  const paneelVoeg = savedPanel.paneelVoeg ?? p.paneel_voeg ?? 2;
  const totalRowsH = Math.floor(p.gevel_hoogte / lagenmaat);
  const followOffset = paneel_breedte + paneelVoeg;
  const pairWidth = 2 * (paneel_breedte + paneelVoeg);
  const bricks = [];

  const addBrick = (bx, bx2, rowY, type, isInsitu) => {
    const w = bx2 - bx;
    if (w <= 0.5) return;
    let clipped = [{ x1: bx, x2: bx2, y1: rowY, y2: rowY + H }];
    for (const op of openings) {
      const next = [];
      for (const seg of clipped) next.push(...subtractRect(seg, op));
      clipped = next;
    }
    for (const seg of clipped) bricks.push({ x: seg.x1, y: seg.y1, width: seg.x2 - seg.x1, height: seg.y2 - seg.y1, type, isInsitu: !!isInsitu });
  };

  const computeNaadBricks = (remaining, startX) => {
    const naad = [];
    let nx = startX;
    let rem = remaining;
    if (rem >= S - 0.5) { naad.push({ x: nx, width: S, type: 'Strek' }); rem -= S + j; nx += S + j; }
    while (rem >= K - 0.5) {
      if (rem >= D - 0.5) { naad.push({ x: nx, width: D, type: 'Drieklezoor' }); rem -= D + j; nx += D + j; }
      else { naad.push({ x: nx, width: K, type: 'Kop' }); rem -= K + j; nx += K + j; }
    }
    return naad;
  };

  for (let r = 0; r < totalRowsH; r++) {
    const panelRowIdx = r % (savedPanel.rowCount ?? 6);
    const startRowData = startRowsSaved[panelRowIdx];
    const followRowData = followRowsSaved[panelRowIdx];

    const startRow = (startRowData && startRowData.length > 0) ? startRowData : autoFillRow(r, dims, paneel_breedte, true);
    const followRow = (followRowData && followRowData.length > 0) ? followRowData : autoFillRow(r, dims, paneel_breedte, true);

    const { placed: startPlaced, remaining: startRem } = computeRowLayout(startRow, dims, paneel_breedte);
    const { placed: followPlaced, remaining: followRem } = computeRowLayout(followRow, dims, paneel_breedte);

    const lastStart = startPlaced.length ? startPlaced[startPlaced.length - 1] : null;
    const naadStartX = lastStart ? lastStart.x + lastStart.width + j : 0;
    const startNaadBricks = computeNaadBricks(startRem, naadStartX);

    const lastFollow = followPlaced.length ? followPlaced[followPlaced.length - 1] : null;
    const naadFollowX = lastFollow ? lastFollow.x + lastFollow.width + j : 0;
    const followNaadBricks = computeNaadBricks(followRem, naadFollowX);

    const rowY = r * lagenmaat;
    for (let pairX = 0; pairX < p.gevel_breedte; pairX += pairWidth) {
      for (const pb of startPlaced) {
        const bx = pairX + pb.x;
        addBrick(bx, Math.min(bx + pb.width, p.gevel_breedte), rowY, pb.type, pb.isSlot);
      }
      for (const nb of startNaadBricks) {
        const bx = pairX + nb.x;
        addBrick(bx, Math.min(bx + nb.width, p.gevel_breedte), rowY, nb.type, true);
      }
      for (const pb of followPlaced) {
        const bx = pairX + followOffset + pb.x;
        addBrick(bx, Math.min(bx + pb.width, p.gevel_breedte), rowY, pb.type, pb.isSlot);
      }
      for (const nb of followNaadBricks) {
        const bx = pairX + followOffset + nb.x;
        addBrick(bx, Math.min(bx + nb.width, p.gevel_breedte), rowY, nb.type, true);
      }
    }
  }
  return bricks;
}

function autoFillRow(rowIndex, dims, paneel_breedte, applySeqOffset = false) {
  const { S, j, K, D } = dims;
  const MODULE_W = [S, S, D, S, K, S];
  const startIdx = applySeqOffset ? ((rowIndex % 6) + 6) % 6 : 0;
  let x = 0;
  let bi = startIdx;
  const bricks = [];

  while (x < paneel_breedte - 0.5) {
    const bLen = MODULE_W[bi % 6];
    const type = WV_MODULE_TYPES[bi % 6];
    if (x + bLen > paneel_breedte + 0.5) break;
    bricks.push({ type });
    x += bLen + j;
    bi++;
  }

  let rem = paneel_breedte - x;
  if (rem >= S - 0.5) {
    bricks.push({ type: 'Strek' });
    rem -= S + j;
  }
  while (rem >= K - 0.5) {
    if (rem >= D - 0.5) {
      bricks.push({ type: 'Drieklezoor' });
      rem -= D + j;
    } else {
      bricks.push({ type: 'Kop' });
      rem -= K + j;
    }
  }

  return bricks;
}

function buildBasePanelBricks(p) {
  const dims = computeDims(p);
  const { S, H, j, K, D, lagenmaat } = dims;
  const MODULE = [S, S, D, S, K, S];
  const rowsH = p.rij_aantal != null ? Math.max(1, Math.round(p.rij_aantal)) : Math.floor(p.paneel_hoogte / lagenmaat);
  const bricks = [];
  for (let r = 0; r < rowsH; r++) {
    const startIdx = ((r % 6) + 6) % 6;
    let x = 0;
    let bi = startIdx;
    const rowY = r * lagenmaat;
    while (x < p.paneel_breedte - 0.5) {
      const bLen = MODULE[bi % 6];
      const type = Math.abs(bLen - S) < 1 ? 'Strek' : Math.abs(bLen - K) < 1 ? 'Kop' : 'Drieklezoor';
      const w = Math.min(bLen, p.paneel_breedte - x);
      if (w > 0.5) bricks.push({ x, y: rowY, width: w, height: H, type, row: r, partial: w < bLen - 0.5 });
      x += bLen + j;
      bi++;
    }
  }
  return bricks;
}

function buildFacadeBricks(p, openings) {
  const dims = computeDims(p);
  const { S, H, j, K, D, lagenmaat } = dims;
  const MODULE = [S, S, D, S, K, S];
  const totalRowsH = Math.floor(p.gevel_hoogte / lagenmaat);
  const bricks = [];
  for (let r = 0; r < totalRowsH; r++) {
    const startIdx = ((r % 6) + 6) % 6;
    let x = 0;
    let bi = startIdx;
    const rowY = r * lagenmaat;
    while (x < p.gevel_breedte - 0.5) {
      const bLen = MODULE[bi % 6];
      const type = Math.abs(bLen - S) < 1 ? 'Strek' : Math.abs(bLen - K) < 1 ? 'Kop' : 'Drieklezoor';
      const w = Math.min(bLen, p.gevel_breedte - x);
      if (w > 0.5) {
        let clipped = [{ x1: x, x2: x + w, y1: rowY, y2: rowY + H }];
        for (const op of openings) {
          const next = [];
          for (const seg of clipped) next.push(...subtractRect(seg, op));
          clipped = next;
        }
        for (const seg of clipped) bricks.push({ x: seg.x1, y: seg.y1, width: seg.x2 - seg.x1, height: seg.y2 - seg.y1, type });
      }
      x += bLen + j;
      bi++;
    }
  }
  return bricks;
}

function subtractRect(brick, opening) {
  const { x1: bx1, x2: bx2, y1: by1, y2: by2 } = brick;
  const { x: ox, y: oy, width: ow, height: oh } = opening;
  const ox2 = ox + ow, oy2 = oy + oh;
  if (bx2 <= ox || bx1 >= ox2 || by2 <= oy || by1 >= oy2) return [brick];
  const parts = [];
  if (bx1 < ox)  parts.push({ x1: bx1, x2: Math.min(bx2, ox), y1: by1, y2: by2 });
  if (bx2 > ox2) parts.push({ x1: Math.max(bx1, ox2), x2: bx2, y1: by1, y2: by2 });
  if (by1 < oy)  parts.push({ x1: Math.max(bx1, ox), x2: Math.min(bx2, ox2), y1: by1, y2: Math.min(by2, oy) });
  if (by2 > oy2) parts.push({ x1: Math.max(bx1, ox), x2: Math.min(bx2, ox2), y1: Math.max(by1, oy2), y2: by2 });
  return parts.filter(r => r.x2 > r.x1 + 0.5 && r.y2 > r.y1 + 0.5);
}

function buildPanelGrid(p) {
  const lines = [];
  for (let col = 0; col <= p.aantal_panelen_x; col++) lines.push({ x1: col * p.paneel_breedte, x2: col * p.paneel_breedte, y1: 0, y2: p.aantal_panelen_y * p.paneel_hoogte });
  for (let row = 0; row <= p.aantal_panelen_y; row++) lines.push({ x1: 0, x2: p.aantal_panelen_x * p.paneel_breedte, y1: row * p.paneel_hoogte, y2: row * p.paneel_hoogte });
  return lines;
}

const DEFAULT_PARAMS = {
  steen_breedte: 210,
  steen_hoogte: 50,
  voeg_dikte: 10,
  lintvoeg_dikte: 10,
  stootvoeg_dikte: 10,
  slot_breedte: 11,
  slot_hoogte: 51,
  paneel_breedte: 1155,
  paneel_hoogte: 372,
  rij_aantal: 6,
  paneel_voeg: 2,
  aantal_panelen_x: 3,
  aantal_panelen_y: 2,
  gevel_breedte: 4000,
  gevel_hoogte: 2800,
};

function NumInput({ label, value, onChange, min, max, step = 1, unit = 'mm', tip }) {
  return (
    <div title={tip} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: 4 }}>
      <span style={{ fontSize: 11, color: '#374151', flexShrink: 0 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <input type="number" value={value} min={min} max={max} step={step} onChange={e => onChange(Number(e.target.value))}
          style={{ width: 68, fontSize: 11, padding: '2px 4px', border: '1px solid #d1d5db', borderRadius: 3, textAlign: 'right' }} />
        <span style={{ fontSize: 10, color: '#9ca3af', minWidth: 20 }}>{unit}</span>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, paddingBottom: 3, borderBottom: '1px solid #e5e7eb' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export function WildverbandPanel({ onClose }) {
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [view, setView] = useState('bouw');
  const [openings, setOpenings] = useState([]);
  const [newOp, setNewOp] = useState({ x: 500, y: 800, width: 1000, height: 1200, label: 'Raam' });
  const [showGrid, setShowGrid] = useState(true);
  const [showLabels, setShowLabels] = useState(true);

  const DEFAULT_ROW0 = Array.from({ length: 6 }, () => ({ type: 'Strek', isSlot: false }));
  const [customRows, setCustomRows] = useState({ 0: DEFAULT_ROW0 });
  const [followRows, setFollowRows] = useState({ 0: DEFAULT_ROW0 });
  const [panelWidthLocked, setPanelWidthLocked] = useState(false);
  const [selectedType, setSelectedType] = useState('Strek');
  const [lastBrickType, setLastBrickType] = useState('Strek');
  const [savedCustomPanel, setSavedCustomPanel] = useState(null);

  const set = useCallback((key, val) => setParams(prev => ({ ...prev, [key]: val })), []);
  const dims = useMemo(() => computeDims(params), [params]);
  const { S, H, j, K, D, lagenmaat, moduleW } = dims;

  const rowCount = Math.max(1, Math.round(params.rij_aantal ?? 6));
  const paneelVoeg = params.paneel_voeg ?? 2;
  const activePanelHeight = rowCount * lagenmaat - paneelVoeg;

  const basePanelBricks = useMemo(() => buildBasePanelBricks(params), [params]);
  const facadeBricks = useMemo(() => {
    if (savedCustomPanel) return buildFacadeFromCustomPanel(params, openings, savedCustomPanel, dims);
    return buildFacadeBricks(params, openings);
  }, [params, openings, savedCustomPanel, dims]);
  const panelGridLines = useMemo(() => buildPanelGrid(params), [params]);

  const getRow = useCallback(r => customRows[r] ?? [], [customRows]);
  const setRow = useCallback((r, bricks) => setCustomRows(prev => ({ ...prev, [r]: bricks })), []);
  const getFollowRow = useCallback(r => followRows[r] ?? [], [followRows]);
  const setFollowRow = useCallback((r, bricks) => setFollowRows(prev => ({ ...prev, [r]: bricks })), []);

  const panelWidthFromRow0 = useMemo(() => {
    const row0 = customRows[0] ?? [];
    if (row0.length === 0) return null;
    let total = 0;
    for (const b of row0) total += brickWidth(b.effectiveType ?? b.type, dims) + dims.j;
    return total - paneelVoeg;
  }, [customRows, dims, paneelVoeg]);

  const activePanelWidth = (!panelWidthLocked && panelWidthFromRow0 != null) ? panelWidthFromRow0 : params.paneel_breedte;

  const totalCustomCounts = useMemo(() => {
    const counts = {};
    for (let r = 0; r < rowCount; r++) {
      for (const b of getRow(r)) counts[b.type] = (counts[b.type] ?? 0) + 1;
      for (const b of (followRows[r] ?? [])) counts[b.type] = (counts[b.type] ?? 0) + 1;
    }
    return counts;
  }, [customRows, followRows, rowCount]);

  const customPanelBricks = useMemo(() => {
    const bricks = [];
    for (let r = 0; r < rowCount; r++) {
      const { placed } = computeRowLayout(getRow(r), dims, activePanelWidth);
      const rowY = r * lagenmaat;
      for (const b of placed) bricks.push({ x: b.x, y: rowY, width: b.width, height: H, type: b.type, isSlot: !!b.isSlot });
    }
    return bricks;
  }, [customRows, dims, activePanelWidth, rowCount, lagenmaat, H]);

  const followPanelBricks = useMemo(() => {
    const bricks = [];
    for (let r = 0; r < rowCount; r++) {
      const { placed } = computeRowLayout(getFollowRow(r), dims, activePanelWidth);
      const rowY = r * lagenmaat;
      for (const b of placed) bricks.push({ x: b.x, y: rowY, width: b.width, height: H, type: b.type, isSlot: !!b.isSlot });
    }
    return bricks;
  }, [followRows, dims, activePanelWidth, rowCount, lagenmaat, H]);

  const addOpening = () => setOpenings(prev => [...prev, { ...newOp, id: Date.now() }]);
  const removeOpening = id => setOpenings(prev => prev.filter(o => o.id !== id));

  const MODULE_ROW_LABELS = [
    'Rij 0: S S D S K S', 'Rij 1: S D S K S S', 'Rij 2: D S K S S S',
    'Rij 3: S K S S S D', 'Rij 4: K S S S D S', 'Rij 5: S S S D S K',
  ];

  const SIDEBAR_W = 260;

  const renderPanelSVG = (bricksToShow, pw, ph, maxW, maxH, dimsPassed, showEmptyRows) => {
    const scale = Math.min(maxW / pw, maxH / ph, 1.5);
    const bw = pw * scale;
    const bh = ph * scale;
    const PAD = 28;
    return (
      <svg width={bw + PAD * 2} height={bh + PAD * 2} xmlns="http://www.w3.org/2000/svg"
        style={{ background: '#f8f9fa', border: '1px solid #d1d5db', borderRadius: 4, display: 'block' }}>
        <rect x={PAD} y={PAD} width={bw} height={bh} fill="#fff" />
        {showEmptyRows && Array.from({ length: rowCount }, (_, r) => {
          const ry = PAD + (ph - (r * lagenmaat + H)) * scale;
          const rh = H * scale;
          return <rect key={`empty-${r}`} x={PAD} y={ry} width={bw} height={rh}
            fill="url(#hatch)" stroke="#e2e8f0" strokeWidth={0.3} />;
        })}
        <defs>
          <pattern id="hatch" patternUnits="userSpaceOnUse" width={6} height={6}>
            <path d="M0,6 l6,-6 M-1,1 l2,-2 M5,7 l2,-2" stroke="#e2e8f0" strokeWidth={0.7} />
          </pattern>
        </defs>
        {bricksToShow.map((b, i) => {
          const rx = PAD + b.x * scale;
          const ry = PAD + (ph - b.y - b.height) * scale;
          const rw = b.width * scale;
          const rh = b.height * scale;
          const isSlot = !!b.isSlot;
          return (
            <g key={i}>
              <rect x={rx} y={ry} width={rw} height={rh}
                fill={isSlot ? '#fff' : BRICK_COLORS[b.type]}
                stroke={isSlot ? '#94a3b8' : '#c084a8'}
                strokeWidth={isSlot ? 0.8 : 0.3}
                strokeDasharray={isSlot ? '2,1.5' : undefined}
                opacity={b.partial ? 0.5 : 1} />
              {!isSlot && showLabels && rw > 20 && rh > 7 && (
                <text x={rx + rw / 2} y={ry + rh / 2} textAnchor="middle" dominantBaseline="middle"
                  fontSize={Math.min(7, rh * 0.55, rw * 0.1)} fill="#5b2155" fontFamily="Arial" fontWeight="500">
                  {TYPE_SHORT[b.type]}
                </text>
              )}
              {isSlot && rw > 14 && rh > 7 && (
                <text x={rx + rw / 2} y={ry + rh / 2} textAnchor="middle" dominantBaseline="middle"
                  fontSize={Math.min(7, rh * 0.55, rw * 0.1)} fill="#9ca3af" fontFamily="Arial">
                  □
                </text>
              )}
            </g>
          );
        })}
        <rect x={PAD} y={PAD} width={bw} height={bh} fill="none" stroke="#334155" strokeWidth={1.5} />
        <text x={PAD + bw / 2} y={PAD - 6} textAnchor="middle" fontSize={8} fill="#6b7280" fontFamily="Arial">{Math.round(pw)} mm</text>
        <text x={PAD - 18} y={PAD + bh / 2} textAnchor="middle" fontSize={8} fill="#6b7280"
          fontFamily="Arial" transform={`rotate(-90,${PAD - 18},${PAD + bh / 2})`}>{Math.round(ph)} mm</text>
      </svg>
    );
  };

  const renderBouw = () => {
    const CHIP_AREA_W = 520;
    const chipScale = CHIP_AREA_W / activePanelWidth;
    const chipRowH = Math.max(26, Math.min(42, H * chipScale));
    const WIDTHS = { Strek: S, Kop: K, Drieklezoor: D };
    const isSlotTool = selectedType === 'slot';
    const isWisTool  = selectedType === 'wissen';
    const addWidth   = (!isSlotTool && !isWisTool) ? WIDTHS[selectedType] ?? S : WIDTHS[lastBrickType] ?? S;

    const selectTool = t => {
      setSelectedType(t);
      if (TYPES.includes(t)) setLastBrickType(t);
    };

    const panelLocked = !!savedCustomPanel;

    return (
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {panelLocked && (
            <div style={{ padding: '6px 12px', background: '#dcfce7', borderBottom: '2px solid #86efac', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: '#15803d', fontWeight: 700 }}>🔒 Paarpaneel vergrendeld — geen wijzigingen mogelijk tijdens gevelopbouw</span>
              <div style={{ flex: 1 }} />
              <button onClick={() => setSavedCustomPanel(null)}
                style={{ fontSize: 10, padding: '3px 10px', background: '#fff', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: 3, cursor: 'pointer', fontWeight: 600 }}>
                ✏️ Wijzigen
              </button>
              <button onClick={() => { setSavedCustomPanel(null); setCustomRows({ 0: DEFAULT_ROW0 }); setFollowRows({ 0: DEFAULT_ROW0 }); setPanelWidthLocked(false); }}
                style={{ fontSize: 10, padding: '3px 10px', background: '#fff', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 3, cursor: 'pointer', fontWeight: 600 }}>
                Paneel wissen &amp; herbeginnen
              </button>
            </div>
          )}

          <div style={{ padding: '6px 10px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', flexShrink: 0, opacity: panelLocked ? 0.4 : 1, pointerEvents: panelLocked ? 'none' : 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginRight: 2 }}>Strip:</span>
              {TYPES.map(t => (
                <button key={t} onClick={() => selectTool(t)}
                  style={{
                    padding: '3px 9px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
                    border: selectedType === t ? '2px solid #7c3aed' : '1px solid #d1d5db',
                    background: selectedType === t ? BRICK_COLORS[t] : '#fff',
                    color: '#2d1a2e', fontWeight: selectedType === t ? 700 : 400,
                  }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{TYPE_SHORT[t]}</span>
                  {' '}{t}
                  <span style={{ fontSize: 9, color: '#9ca3af', marginLeft: 3 }}>{Math.round(WIDTHS[t])}mm</span>
                </button>
              ))}
              <button onClick={() => selectTool('slot')}
                title="Markeer geselecteerde stenen als leeg slot (wit) — plaatshouder voor later in te vullen strip"
                style={{ padding: '3px 9px', fontSize: 11, borderRadius: 4, cursor: 'pointer', border: isSlotTool ? '2px solid #6366f1' : '1px solid #d1d5db', background: isSlotTool ? '#eef2ff' : '#fff', color: isSlotTool ? '#4338ca' : '#374151', fontWeight: isSlotTool ? 700 : 400 }}>
                □ Slot
              </button>
              <button onClick={() => selectTool('wissen')}
                style={{ padding: '3px 9px', fontSize: 11, borderRadius: 4, cursor: 'pointer', border: isWisTool ? '2px solid #dc2626' : '1px solid #d1d5db', background: isWisTool ? '#fee2e2' : '#fff', color: isWisTool ? '#dc2626' : '#374151', fontWeight: isWisTool ? 700 : 400 }}>
                ✕ Wissen
              </button>
              <div style={{ flex: 1 }} />
              <button onClick={() => {
                const nextS = {}, nextF = {};
                for (let r = 0; r < rowCount; r++) { nextS[r] = autoFillRow(r, dims, activePanelWidth); nextF[r] = autoFillRow(r, dims, activePanelWidth); }
                setCustomRows(nextS); setFollowRows(nextF);
              }} style={{ fontSize: 10, padding: '3px 8px', background: '#ecfdf5', color: '#059669', border: '1px solid #6ee7b7', borderRadius: 3, cursor: 'pointer' }}>
                Auto-invullen
              </button>
              {!panelWidthLocked && panelWidthFromRow0 != null ? (
                <button onClick={() => {
                  set('paneel_breedte', Math.round(panelWidthFromRow0));
                  setPanelWidthLocked(true);
                }} style={{ fontSize: 10, padding: '3px 8px', background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a', borderRadius: 3, cursor: 'pointer', fontWeight: 700 }}>
                  🔒 Vergrendel breedte ({Math.round(panelWidthFromRow0)} mm)
                </button>
              ) : panelWidthLocked ? (
                <button onClick={() => setPanelWidthLocked(false)}
                  style={{ fontSize: 10, padding: '3px 8px', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', borderRadius: 3, cursor: 'pointer', fontWeight: 700 }}>
                  🔓 Ontgrendel breedte
                </button>
              ) : null}
              <button onClick={() => { setCustomRows({ 0: DEFAULT_ROW0 }); setFollowRows({ 0: DEFAULT_ROW0 }); setPanelWidthLocked(false); }} style={{ fontSize: 10, padding: '3px 8px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 3, cursor: 'pointer' }}>
                Leegmaken
              </button>
            </div>

            {isSlotTool && (
              <div style={{ marginTop: 6, fontSize: 10, color: '#4338ca', background: '#eef2ff', borderRadius: 3, padding: '3px 8px', display: 'inline-block' }}>
                Slot-modus: klik op een geplaatste steen om hem wit te maken (= open slot). Klik op een bestaand slot om de markering te verwijderen. Klik op lege zone om een slot van type <strong>{lastBrickType}</strong> te plaatsen.
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '8px 10px', opacity: panelLocked ? 0.5 : 1, pointerEvents: panelLocked ? 'none' : 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4, paddingBottom: 3, borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ width: 46, flexShrink: 0 }} />
              <div style={{ width: CHIP_AREA_W, textAlign: 'center', fontSize: 9, fontWeight: 700, color: '#334155', flexShrink: 0 }}>Startpaneel</div>
              <div style={{ width: Math.max(6, (10 + paneelVoeg) * chipScale * 4), flexShrink: 0 }} />
              <div style={{ width: CHIP_AREA_W, textAlign: 'center', fontSize: 9, fontWeight: 700, color: '#6d28d9', flexShrink: 0 }}>Volgpaneel</div>
            </div>
            {Array.from({ length: rowCount }, (_, i) => rowCount - 1 - i).map(r => {
              const rowBricks    = getRow(r);
              const followBricks = getFollowRow(r);
              const { placed,       remaining       } = computeRowLayout(rowBricks,    dims, activePanelWidth);
              const { placed: fPlaced, remaining: fRemaining } = computeRowLayout(followBricks, dims, activePanelWidth);
              const canAdd  = !isWisTool && (remaining  >= addWidth - 0.5 || (r === 0 && !panelWidthLocked));
              const fCanAdd = !isWisTool && (fRemaining >= addWidth - 0.5);

              const makeChipArea = (plcd, rem, cAdd, srcBricks, onEdit, onAdd, borderColor) => (
                <div style={{ width: CHIP_AREA_W, flexShrink: 0, height: chipRowH, display: 'flex', border: `1px solid ${borderColor}`, borderRadius: 3, overflow: 'hidden', background: '#f8fafc' }}>
                  {plcd.map((b, bi) => {
                    const cw = Math.max(12, b.width * chipScale);
                    const isSlotBrick = !!b.isSlot;
                    return (
                      <div key={bi} onClick={() => onEdit(bi, b, isSlotBrick, srcBricks)}
                        title={isSlotBrick ? `Slot (${Math.round(b.width)}mm)` : `${b.type} (${Math.round(b.width)}mm)`}
                        style={{
                          width: cw, flexShrink: 0, height: '100%',
                          background: isSlotBrick ? '#fff' : BRICK_COLORS[b.type],
                          border: isSlotBrick ? '1.5px dashed #94a3b8' : 'none',
                          borderRight: isSlotBrick ? '1.5px dashed #94a3b8' : '1px solid rgba(120,50,100,0.2)',
                          boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', fontSize: Math.min(9, cw * 0.13), fontWeight: 700,
                          color: isSlotBrick ? '#9ca3af' : '#5b2155', userSelect: 'none',
                        }}>
                        {cw > 14 ? (isSlotBrick ? '□' : TYPE_SHORT[b.type]) : ''}
                      </div>
                    );
                  })}
                  {cAdd ? (
                    <div onClick={onAdd}
                      style={{
                        flex: 1, height: '100%',
                        background: 'repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9 4px,#e2e8f0 4px,#e2e8f0 8px)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, borderLeft: plcd.length ? '1.5px dashed #c7d2fe' : 'none',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = isSlotTool ? '#f0f0ff' : BRICK_COLORS[selectedType] + '88'}
                      onMouseLeave={e => e.currentTarget.style.background = 'repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9 4px,#e2e8f0 4px,#e2e8f0 8px)'}>
                      <span style={{ fontWeight: 700, color: isSlotTool ? '#6366f1' : '#7c3aed', fontSize: 12 }}>
                        {isSlotTool ? '+ □' : `+ ${TYPE_SHORT[selectedType]}`}
                      </span>
                      <span style={{ fontSize: 9, color: '#a78bfa', marginLeft: 4 }}>{Math.round(addWidth)}mm</span>
                    </div>
                  ) : rem > 2 ? (
                    <div style={{ flex: 1, height: '100%', background: '#fef9c3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#92400e', borderLeft: '1px solid #fde68a' }}>
                      {Math.round(rem)}mm
                    </div>
                  ) : (
                    <div style={{ flex: 1, height: '100%', background: '#f9fafb' }} />
                  )}
                </div>
              );

              return (
                <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                  <div style={{ width: 46, flexShrink: 0, textAlign: 'right' }}>
                    <div style={{ fontSize: 9, color: '#6b7280', fontWeight: 600 }}>Rij {r}</div>
                  </div>

                  {makeChipArea(placed, remaining, canAdd, rowBricks,
                    (bi, b, isSlotBrick, src) => {
                      if (isWisTool) { setRow(r, src.slice(0, bi)); }
                      else if (isSlotTool) { const n = [...src]; n[bi] = { ...src[bi], isSlot: !isSlotBrick }; setRow(r, n); }
                      else { const n = [...src]; n[bi] = { type: TYPES[(TYPES.indexOf(b.type) + 1) % TYPES.length], isSlot: isSlotBrick }; setRow(r, n); }
                    },
                    () => setRow(r, [...rowBricks, isSlotTool ? { type: lastBrickType, isSlot: true } : { type: selectedType, isSlot: false }]),
                    '#e5e7eb'
                  )}

                  <div style={{ width: Math.max(6, paneelVoeg * chipScale * 6), flexShrink: 0, height: chipRowH, background: '#ddd6fe', border: '1px solid #8b5cf6', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 6, color: '#5b21b6', writingMode: 'vertical-rl' }}>PV</span>
                  </div>

                  {makeChipArea(fPlaced, fRemaining, fCanAdd, followBricks,
                    (bi, b, isSlotBrick, src) => {
                      if (isWisTool) { setFollowRow(r, src.slice(0, bi)); }
                      else if (isSlotTool) { const n = [...src]; n[bi] = { ...src[bi], isSlot: !isSlotBrick }; setFollowRow(r, n); }
                      else { const n = [...src]; n[bi] = { type: TYPES[(TYPES.indexOf(b.type) + 1) % TYPES.length], isSlot: isSlotBrick }; setFollowRow(r, n); }
                    },
                    () => setFollowRow(r, [...followBricks, isSlotTool ? { type: lastBrickType, isSlot: true } : { type: selectedType, isSlot: false }]),
                    '#c4b5fd'
                  )}

                  <button onClick={() => { setRow(r, autoFillRow(r, dims, activePanelWidth)); setFollowRow(r, autoFillRow(r, dims, activePanelWidth)); }}
                    title="Auto-invullen beide"
                    style={{ fontSize: 9, padding: '2px 6px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 3, cursor: 'pointer', flexShrink: 0 }}>
                    Auto
                  </button>
                  <button onClick={() => { setRow(r, []); setFollowRow(r, []); }}
                    title="Rij leegmaken beide"
                    style={{ fontSize: 9, padding: '2px 5px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 3, cursor: 'pointer', flexShrink: 0 }}>
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          <div style={{ borderTop: '1px solid #e5e7eb', padding: '6px 10px', background: '#f9fafb', display: 'flex', gap: 10, fontSize: 10, flexWrap: 'wrap', flexShrink: 0, alignItems: 'center' }}>
            <span style={{ color: '#374151', fontWeight: 600 }}>Totaal:</span>
            {Object.entries(totalCustomCounts).map(([t, n]) => (
              <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ display: 'inline-block', width: 10, height: 8, background: BRICK_COLORS[t], border: '1px solid #c084a8', borderRadius: 1 }} />
                {t}: <strong>{n}</strong>
              </span>
            ))}
            {Object.keys(totalCustomCounts).length === 0 && <span style={{ color: '#9ca3af' }}>Nog geen stenen geplaatst</span>}
            <div style={{ flex: 1 }} />
            {!panelLocked && (
              <button
                onClick={() => setSavedCustomPanel({ startRows: { ...customRows }, followRows: { ...followRows }, rowCount, paneel_breedte: activePanelWidth, paneel_hoogte: activePanelHeight, paneelVoeg })}
                style={{ fontSize: 11, padding: '4px 12px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}>
                💾 Opslaan als paarpaneel
              </button>
            )}
          </div>
        </div>

        <div style={{ width: 260, flexShrink: 0, borderLeft: '1px solid #e5e7eb', padding: '10px', background: '#fafafa', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
            Paarpaneel preview
            {savedCustomPanel && <span style={{ fontSize: 9, background: '#dcfce7', color: '#16a34a', border: '1px solid #86efac', borderRadius: 10, padding: '1px 7px', fontWeight: 700 }}>✓ Opgeslagen</span>}
          </div>
          {(() => {
            const pairW = 2 * activePanelWidth + paneelVoeg;
            const maxW = 228, maxH = 300;
            const scale = Math.min(maxW / pairW, maxH / activePanelHeight, 1.5);
            const bw = pairW * scale, bh = activePanelHeight * scale;
            const sw = activePanelWidth * scale;
            const fOff = (activePanelWidth + paneelVoeg) * scale;
            const PAD = 18;
            const allBricks = [
              ...customPanelBricks,
              ...followPanelBricks.map(b => ({ ...b, x: b.x + activePanelWidth + paneelVoeg })),
            ];
            return (
              <svg width={bw + PAD * 2} height={bh + PAD * 2 + 14} xmlns="http://www.w3.org/2000/svg"
                style={{ background: '#f8f9fa', border: '1px solid #d1d5db', borderRadius: 4, display: 'block' }}>
                <defs>
                  <pattern id="hatchP" patternUnits="userSpaceOnUse" width={6} height={6}>
                    <path d="M0,6 l6,-6 M-1,1 l2,-2 M5,7 l2,-2" stroke="#e2e8f0" strokeWidth={0.7} />
                  </pattern>
                </defs>
                {Array.from({ length: rowCount }, (_, rr) => {
                  const ry = PAD + 12 + (activePanelHeight - (rr * lagenmaat + H)) * scale;
                  const rh = H * scale;
                  return <g key={rr}>
                    <rect x={PAD} y={ry} width={sw} height={rh} fill="url(#hatchP)" stroke="#e2e8f0" strokeWidth={0.3} />
                    <rect x={PAD + fOff} y={ry} width={sw} height={rh} fill="url(#hatchP)" stroke="#e2e8f0" strokeWidth={0.3} />
                  </g>;
                })}
                {allBricks.map((b, i) => {
                  const rx = PAD + b.x * scale, ry = PAD + 12 + (activePanelHeight - b.y - b.height) * scale;
                  const rw = b.width * scale, rh = b.height * scale;
                  const isSlot = !!b.isSlot;
                  return <rect key={i} x={rx} y={ry} width={rw} height={rh}
                    fill={isSlot ? '#fff' : BRICK_COLORS[b.type]}
                    stroke={isSlot ? '#94a3b8' : '#c084a8'}
                    strokeWidth={isSlot ? 0.8 : 0.3}
                    strokeDasharray={isSlot ? '2,1.5' : undefined} />;
                })}
                <rect x={PAD + activePanelWidth * scale} y={PAD + 12} width={paneelVoeg * scale} height={bh} fill="#ddd6fe" opacity={0.8} />
                <rect x={PAD} y={PAD + 12} width={sw} height={bh} fill="none" stroke="#334155" strokeWidth={1.5} />
                <rect x={PAD + fOff} y={PAD + 12} width={sw} height={bh} fill="none" stroke="#6d28d9" strokeWidth={1.5} />
                <text x={PAD + sw / 2} y={PAD + 8} textAnchor="middle" fontSize={7} fill="#334155" fontFamily="Arial" fontWeight="700">Startpaneel</text>
                <text x={PAD + fOff + sw / 2} y={PAD + 8} textAnchor="middle" fontSize={7} fill="#6d28d9" fontFamily="Arial" fontWeight="700">Volgpaneel</text>
              </svg>
            );
          })()}
          <div style={{ fontSize: 9, color: '#9ca3af', lineHeight: 1.7 }}>
            <span style={{ display: 'inline-block', width: 10, height: 8, background: '#ddd6fe', border: '1px solid #8b5cf6', marginRight: 4, verticalAlign: 'middle' }} />paarsstrip = paneelvoeg<br />
            <span style={{ display: 'inline-block', width: 10, height: 8, background: '#fff', border: '1px dashed #94a3b8', marginRight: 4, verticalAlign: 'middle' }} />witte stippelrand = slot<br />
            Klik steen = wijzig type of markeer als slot
          </div>
          <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.8 }}>
            S = <strong>{S}mm</strong> · K = <strong>{Math.round(K)}mm</strong> · D = <strong>{Math.round(D)}mm</strong><br />
            Voeg = <strong>{j}mm</strong> · Rij = <strong>{H}mm</strong>
          </div>
        </div>
      </div>
    );
  };

  const renderBasePaneel = () => {
    const pw = savedCustomPanel ? savedCustomPanel.paneel_breedte : params.paneel_breedte;
    const ph = savedCustomPanel ? savedCustomPanel.paneel_hoogte : activePanelHeight;
    const displayBricks = savedCustomPanel ? customPanelBricks : basePanelBricks;
    const MAX_W = 820, MAX_H = 500;
    const scale = Math.min(MAX_W / pw, MAX_H / ph, 1.5);
    const bw = pw * scale, bh = ph * scale;
    const PAD = 40;
    const rowsH = Math.floor(ph / lagenmaat);

    return (
      <div style={{ overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 16 }}>
        {savedCustomPanel && (
          <div style={{ marginBottom: 8, background: '#dcfce7', border: '1px solid #86efac', borderRadius: 4, padding: '4px 12px', fontSize: 11, color: '#15803d', display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong>✓ Aangepast paarpaneel actief</strong> — opgeslagen vanuit de bouwer
            <button onClick={() => setSavedCustomPanel(null)} style={{ fontSize: 10, background: 'none', border: '1px solid #86efac', borderRadius: 3, padding: '1px 6px', cursor: 'pointer', color: '#15803d' }}>Wissen</button>
          </div>
        )}
        <div style={{ marginBottom: 8, fontSize: 11, color: '#6b7280', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span><strong>Startpaneel:</strong> {Math.round(pw)} × {Math.round(ph)} mm · {rowsH} rijen · moduleW = {Math.round(moduleW)} mm</span>
          <span>K = {Math.round(K)} mm · D = {Math.round(D)} mm · S = {Math.round(S)} mm</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          {['Strek', 'Kop', 'Drieklezoor'].map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
              <div style={{ width: 14, height: 10, background: BRICK_COLORS[t], border: '1px solid #c084a8' }} />
              <span>{t}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
            <div style={{ width: 14, height: 10, background: '#fff', border: '1px dashed #94a3b8' }} />
            <span>Slot (leeg)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
            <div style={{ width: 14, height: 10, background: '#fff', border: '1px solid #d1d5db' }} />
            <span>Voeg</span>
          </div>
        </div>
        <svg width={bw + PAD * 2} height={bh + PAD * 2} xmlns="http://www.w3.org/2000/svg"
          style={{ background: '#f8f9fa', border: '1px solid #d1d5db', borderRadius: 4 }}>
          <rect x={PAD} y={PAD} width={bw} height={bh} fill="#fff" stroke="#333" strokeWidth={1.5} />
          {displayBricks.map((b, i) => {
            const rx = PAD + b.x * scale, ry = PAD + (ph - b.y - b.height) * scale;
            const rw = b.width * scale, rh = b.height * scale;
            const isSlot = !!b.isSlot;
            return (
              <g key={i}>
                <rect x={rx} y={ry} width={rw} height={rh}
                  fill={isSlot ? '#fff' : BRICK_COLORS[b.type]}
                  stroke={isSlot ? '#94a3b8' : '#c084a8'}
                  strokeWidth={isSlot ? 0.8 : 0.4}
                  strokeDasharray={isSlot ? '2,1.5' : undefined}
                  opacity={b.partial ? 0.55 : 1} />
                {!isSlot && showLabels && rw > 22 && rh > 8 && (
                  <text x={rx + rw / 2} y={ry + rh / 2} textAnchor="middle" dominantBaseline="middle"
                    fontSize={Math.min(8, rh * 0.6, rw * 0.12)} fill="#5b2155" fontFamily="Arial" fontWeight="500">
                    {TYPE_SHORT[b.type]}
                  </text>
                )}
              </g>
            );
          })}
          {Array.from({ length: rowsH }, (_, r) => (
            <text key={r} x={PAD - 4} y={PAD + (ph - (r * lagenmaat + H / 2)) * scale}
              textAnchor="end" dominantBaseline="middle" fontSize={8} fill="#9ca3af" fontFamily="Arial">
              {r % 6}
            </text>
          ))}
          <text x={PAD + bw / 2} y={PAD - 8} textAnchor="middle" fontSize={9} fill="#374151" fontFamily="Arial">{Math.round(pw)} mm</text>
          <text x={PAD - 28} y={PAD + bh / 2} textAnchor="middle" fontSize={9} fill="#374151"
            fontFamily="Arial" transform={`rotate(-90,${PAD - 28},${PAD + bh / 2})`}>{Math.round(ph)} mm</text>
          <rect x={PAD} y={PAD} width={bw} height={bh} fill="none" stroke="#333" strokeWidth={1.5} />
        </svg>
        {!savedCustomPanel && (
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, maxWidth: bw + PAD * 2, width: '100%' }}>
            {MODULE_ROW_LABELS.map((label, i) => (
              <div key={i} style={{ fontSize: 9, color: '#6b7280', background: '#f3f4f6', borderRadius: 3, padding: '2px 6px', fontFamily: 'monospace' }}>{label}</div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderGevel = () => {
    const gw = params.gevel_breedte, gh = params.gevel_hoogte;
    const scale = Math.min(820 / gw, 520 / gh, 0.8);
    const svgW = gw * scale, svgH = gh * scale;
    const PAD = 40;
    return (
      <div style={{ overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 16 }}>
        <div style={{ marginBottom: 8, fontSize: 11, color: '#6b7280', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <span><strong>Gevel:</strong> {Math.round(gw)} × {Math.round(gh)} mm</span>
          <span>{facadeBricks.length} baksteenstroken · {openings.length} opening{openings.length !== 1 ? 'en' : ''}</span>
          {savedCustomPanel && (
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ display: 'inline-block', width: 14, height: 10, background: BRICK_COLORS['Strek'], border: '1px solid #c084a8' }} />
                <span>Prefab</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ display: 'inline-block', width: 14, height: 10, background: '#fff', border: '1px dashed #64748b' }} />
                <span>In-situ</span>
              </span>
            </span>
          )}
        </div>
        <svg width={svgW + PAD * 2} height={svgH + PAD * 2} xmlns="http://www.w3.org/2000/svg"
          style={{ background: '#f0f4f8', border: '1px solid #cbd5e1', borderRadius: 4 }}>
          <rect x={PAD} y={PAD} width={svgW} height={svgH} fill="#fff" />
          {facadeBricks.map((b, i) => {
            const rx = PAD + b.x * scale, ry = PAD + (gh - b.y - b.height) * scale;
            const rw = b.width * scale, rh = b.height * scale;
            if (rw < 0.5 || rh < 0.5) return null;
            if (b.isInsitu) {
              return <rect key={i} x={rx} y={ry} width={rw} height={rh} fill="#fff" stroke="#64748b" strokeWidth={0.5} strokeDasharray="2,1.5" />;
            }
            return <rect key={i} x={rx} y={ry} width={rw} height={rh} fill={BRICK_COLORS[b.type]} stroke="#c084a8" strokeWidth={0.2} />;
          })}
          {showGrid && panelGridLines.map((l, i) => (
            <line key={i} x1={PAD + l.x1 * scale} y1={PAD + (gh - l.y1) * scale} x2={PAD + l.x2 * scale} y2={PAD + (gh - l.y2) * scale}
              stroke="#2563eb" strokeWidth={0.6} strokeDasharray="4,3" opacity={0.5} />
          ))}
          {openings.map((op, i) => (
            <g key={op.id ?? i}>
              <rect x={PAD + op.x * scale} y={PAD + (gh - op.y - op.height) * scale} width={op.width * scale} height={op.height * scale}
                fill="#1e3a5f" fillOpacity={0.12} stroke="#1e3a5f" strokeWidth={1.5} />
              <text x={PAD + (op.x + op.width / 2) * scale} y={PAD + (gh - op.y - op.height / 2) * scale}
                textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(11, op.width * scale * 0.12)} fill="#1e3a5f" fontFamily="Arial">{op.label}</text>
            </g>
          ))}
          <rect x={PAD} y={PAD} width={svgW} height={svgH} fill="none" stroke="#334155" strokeWidth={2} />
          <text x={PAD + svgW / 2} y={PAD - 10} textAnchor="middle" fontSize={9} fill="#374151" fontFamily="Arial">{Math.round(gw)} mm</text>
          <text x={PAD - 28} y={PAD + svgH / 2} textAnchor="middle" fontSize={9} fill="#374151"
            fontFamily="Arial" transform={`rotate(-90,${PAD - 28},${PAD + svgH / 2})`}>{Math.round(gh)} mm</text>
        </svg>
      </div>
    );
  };

  const renderOpenings = () => (
    <div style={{ overflow: 'auto', flex: 1, padding: 16, maxWidth: 700 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#1e3a5f', marginBottom: 8 }}>Nieuwe opening toevoegen</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, background: '#f8fafc', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}>
          {[
            { key: 'label', label: 'Label', type: 'text' },
            { key: 'x', label: 'X (mm)', type: 'number' },
            { key: 'y', label: 'Y vanaf onderkant (mm)', type: 'number' },
            { key: 'width', label: 'Breedte (mm)', type: 'number' },
            { key: 'height', label: 'Hoogte (mm)', type: 'number' },
          ].map(({ key, label, type }) => (
            <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11 }}>
              {label}
              <input type={type} value={newOp[key]}
                onChange={e => setNewOp(prev => ({ ...prev, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
                style={{ fontSize: 11, padding: '3px 6px', border: '1px solid #d1d5db', borderRadius: 3 }} />
            </label>
          ))}
        </div>
        <button onClick={addOpening} style={{ marginTop: 8, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
          + Opening toevoegen
        </button>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#1e3a5f', marginBottom: 8 }}>Openingen ({openings.length})</div>
      {openings.length === 0 && <div style={{ color: '#9ca3af', fontSize: 11 }}>Geen openingen gedefinieerd.</div>}
      {openings.map((op, i) => (
        <div key={op.id ?? i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, padding: '6px 10px', marginBottom: 6, fontSize: 11 }}>
          <span><strong>{op.label}</strong> · {op.width} × {op.height} mm · x={op.x}, y={op.y}</span>
          <button onClick={() => removeOpening(op.id)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 3, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>Verwijder</button>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: '#fff' }}>
      <div style={{ width: SIDEBAR_W, flexShrink: 0, borderRight: '1px solid #e5e7eb', overflow: 'auto', padding: 12, background: '#fafafa' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e3a5f', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
          Wildverband Parameters
          {onClose && <button onClick={onClose} style={{ fontSize: 10, background: 'none', border: '1px solid #d1d5db', borderRadius: 3, padding: '1px 6px', cursor: 'pointer', color: '#6b7280' }}>✕</button>}
        </div>

        <Section title="Steenmaten">
          <NumInput label="Steen breedte" value={params.steen_breedte} onChange={v => set('steen_breedte', v)} min={100} max={400} tip="Lengte van een strek (S)" />
          <NumInput label="Steen hoogte" value={params.steen_hoogte} onChange={v => set('steen_hoogte', v)} min={20} max={150} tip="Hoogte van een baksteen" />
          <NumInput label="Lintvoeg" value={params.lintvoeg_dikte} onChange={v => set('lintvoeg_dikte', v)} min={2} max={30} tip="Horizontale voeg (tussen lagen)" />
          <NumInput label="Stootvoeg" value={params.stootvoeg_dikte} onChange={v => set('stootvoeg_dikte', v)} min={2} max={30} tip="Verticale voeg (tussen stenen in een rij)" />
          <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 4, lineHeight: 1.6 }}>
            K = {Math.round(K)} mm · D = {Math.round(D)} mm<br />
            Modulewidth = {Math.round(moduleW)} mm · Lagenmaat = {lagenmaat} mm<br />
            lv = {dims.lv} mm · sv = {dims.sv} mm
          </div>
        </Section>

        <Section title="Slot afmetingen">
          <NumInput label="Slot breedte" value={params.slot_breedte} onChange={v => set('slot_breedte', v)} min={1} max={50} />
          <NumInput label="Slot hoogte" value={params.slot_hoogte} onChange={v => set('slot_hoogte', v)} min={20} max={150} />
        </Section>

        <Section title="Basispaneel">
          {!panelWidthLocked && panelWidthFromRow0 != null ? (
            <div style={{ fontSize: 10, background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 3, padding: '4px 8px', color: '#854d0e', marginBottom: 4, lineHeight: 1.5 }}>
              Afgeleid van rij 0 (niet vergrendeld):<br />
              <strong>{Math.round(panelWidthFromRow0)} mm</strong>
            </div>
          ) : (
            <NumInput label="Paneel breedte" value={params.paneel_breedte} onChange={v => set('paneel_breedte', v)} min={200} max={6000} step={5} />
          )}
          <NumInput label="Aantal rijen" value={params.rij_aantal} onChange={v => set('rij_aantal', Math.max(1, Math.round(v)))} min={1} max={30} unit="" />
          <NumInput label="Paneelvoeg" value={params.paneel_voeg} onChange={v => set('paneel_voeg', v)} min={0} max={20} step={0.5} />
          <div style={{ fontSize: 10, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 3, padding: '4px 8px', color: '#15803d', marginBottom: 4, lineHeight: 1.5 }}>
            Hoogte afgeleid ({rowCount}×{lagenmaat}−{paneelVoeg}):<br />
            <strong>{Math.round(activePanelHeight)} mm</strong>
          </div>
          <button onClick={() => setParams(prev => ({ ...prev, paneel_breedte: Math.round(moduleW), rij_aantal: 6 }))}
            style={{ width: '100%', marginTop: 4, background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: 3, padding: '4px 8px', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}>
            ↺ Reset naar module ({Math.round(moduleW)} × {Math.round(activePanelHeight)} mm)
          </button>
        </Section>

        <Section title="Gevelopbouw">
          <NumInput label="Aantal panelen X" value={params.aantal_panelen_x} onChange={v => set('aantal_panelen_x', Math.max(1, Math.round(v)))} min={1} max={20} unit="" />
          <NumInput label="Aantal panelen Y" value={params.aantal_panelen_y} onChange={v => set('aantal_panelen_y', Math.max(1, Math.round(v)))} min={1} max={20} unit="" />
          <NumInput label="Gevel breedte" value={params.gevel_breedte} onChange={v => set('gevel_breedte', v)} min={100} max={50000} step={50} />
          <NumInput label="Gevel hoogte" value={params.gevel_hoogte} onChange={v => set('gevel_hoogte', v)} min={100} max={30000} step={50} />
        </Section>

        <Section title="Weergave">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', marginBottom: 4 }}>
            <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} />
            Toon paneelrasters
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
            <input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} />
            Toon steenlabels
          </label>
        </Section>

        <Section title="Steentelling basispaneel">
          {(() => {
            const counts = {};
            for (const b of basePanelBricks) if (!b.partial) counts[b.type] = (counts[b.type] ?? 0) + 1;
            return Object.entries(counts).map(([type, n]) => (
              <div key={type} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 10, height: 8, background: BRICK_COLORS[type], border: '1px solid #c084a8', borderRadius: 1 }} />
                  {type}
                </span>
                <span style={{ fontWeight: 600, color: '#1e3a5f' }}>{n}</span>
              </div>
            ));
          })()}
        </Section>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', padding: '6px 12px', gap: 6, background: '#f9fafb', flexShrink: 0 }}>
          {[
            { key: 'bouw', label: savedCustomPanel ? '🧱 Bouw je paneel ✓' : '🧱 Bouw je paneel' },
            { key: 'basispaneel', label: savedCustomPanel ? 'Basispaneel (aangepast)' : 'Basispaneel (auto)' },
            { key: 'gevel', label: savedCustomPanel ? 'Gevelvlak (aangepast)' : 'Gevelvlak' },
            { key: 'openingen', label: `Openingen (${openings.length})` },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setView(key)}
              style={{
                padding: '4px 12px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
                border: view === key ? '1.5px solid #2563eb' : '1px solid #d1d5db',
                background: view === key ? '#dbeafe' : '#fff',
                color: view === key ? '#1d4ed8' : '#374151',
                fontWeight: view === key ? 600 : 400,
              }}>
              {label}
            </button>
          ))}
        </div>

        {view === 'bouw' && renderBouw()}
        {view === 'basispaneel' && renderBasePaneel()}
        {view === 'gevel' && renderGevel()}
        {view === 'openingen' && renderOpenings()}
      </div>
    </div>
  );
}
