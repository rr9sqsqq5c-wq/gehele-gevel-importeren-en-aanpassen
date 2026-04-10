import { useState, useCallback, useRef, useEffect } from 'react';
import { parseIfc, exportGroupsToIfc } from './lib/ifc.js';
import { detectAdjacencies, buildConnectedComponents, sortWallsInComponent } from './lib/adjacency.js';
import { buildGroupPattern, buildSingleWallPattern } from './lib/pattern.js';

const DEFAULT_MATERIAL = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
const DEFAULT_VERBAND = 'halfsteens';
const PIECE_COLORS = { Vol: '#c0785e', Kop: '#b45309', Driekwart: '#7c3aed', Rest: '#dc2626' };

let groupCounter = 1;
function makeGroupId() { return `G${groupCounter++}`; }

function useGroupSettings() {
  const [settings, setSettings] = useState({});
  const get = (groupId) => settings[groupId] ?? {
    color: '#a64033',
    verband: DEFAULT_VERBAND,
    material: { ...DEFAULT_MATERIAL },
    brickDepth: 20,
    name: groupId,
  };
  const update = (groupId, patch) =>
    setSettings((prev) => ({
      ...prev,
      [groupId]: { ...get(groupId), ...prev[groupId], ...patch },
    }));
  return { get, update, settings };
}

function darkenHex(hex, factor) {
  const r = Math.round(parseInt(hex.slice(1,3),16) * (1-factor));
  const g = Math.round(parseInt(hex.slice(3,5),16) * (1-factor));
  const b = Math.round(parseInt(hex.slice(5,7),16) * (1-factor));
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

function FacadeCanvas({ walls, rows, totalWidth, totalHeight, scale = 1 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = Math.round(totalWidth * scale);
    const H = Math.round(totalHeight * scale);
    canvas.width = W;
    canvas.height = H;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, W, H);

    if (!rows || !walls) return;

    const wallMap = Object.fromEntries(walls.map((w) => [w.expressID, w]));

    for (const [wallId, wallRows] of Object.entries(rows)) {
      const wall = wallMap[wallId];
      if (!wall) continue;
      const wo = wall.wallOrigin;
      const wallX = wo ? ((wo.lengthStart - Math.min(...walls.map(w => w.wallOrigin?.lengthStart ?? 0))) * scale) : 0;
      const wallY = wo ? ((wo.heightStart - Math.min(...walls.map(w => w.wallOrigin?.heightStart ?? 0))) * scale) : 0;
      const steenH = rows[wallId]?.[0] ? null : DEFAULT_MATERIAL.steenH;

      for (const row of wallRows) {
        const ry = H - (wallY + (row.y + (row.pieces[0] ? 50 : DEFAULT_MATERIAL.steenH)) * scale);
        for (const piece of row.pieces) {
          const px = wallX + piece.start * scale;
          const pw = piece.length * scale;
          const ph = 50 * scale;
          const pry = H - (wallY + (row.y + 50) * scale);
          const baseColor = PIECE_COLORS[piece.label] ?? '#a64033';
          ctx.fillStyle = piece.label === 'Kop' ? darkenHex(baseColor, 0.15)
            : piece.label === 'Driekwart' ? darkenHex(baseColor, 0.08)
            : piece.label === 'Rest' ? darkenHex(baseColor, 0.05)
            : baseColor;
          ctx.fillRect(px + 0.5, pry + 0.5, Math.max(0.5, pw - 1), Math.max(0.5, ph - 1));
          ctx.strokeStyle = 'rgba(0,0,0,0.15)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(px + 0.5, pry + 0.5, Math.max(0.5, pw - 1), Math.max(0.5, ph - 1));
        }
      }

      for (const op of (wall.openings ?? [])) {
        const ox = wallX + (op.x ?? 0) * scale;
        const ow = (op.breedte ?? op.width ?? 0) * scale;
        const oh = (op.hoogte ?? op.height ?? 0) * scale;
        const oy = H - (wallY + ((op.y ?? 0) + (op.hoogte ?? op.height ?? 0)) * scale);
        ctx.fillStyle = 'rgba(200,230,255,0.7)';
        ctx.fillRect(ox, oy, ow, oh);
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1;
        ctx.strokeRect(ox, oy, ow, oh);
      }
    }
  }, [walls, rows, totalWidth, totalHeight, scale]);

  return <canvas ref={canvasRef} style={{ display: 'block', maxWidth: '100%', border: '1px solid #cbd5e1', borderRadius: 4 }} />;
}

function GroupConfigPanel({ groupId, settings, onUpdate }) {
  const s = settings;
  const mat = s.material ?? { ...DEFAULT_MATERIAL };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 2 }}>Naam</label>
        <input
          type="text"
          value={s.name ?? groupId}
          onChange={(e) => onUpdate({ name: e.target.value })}
          style={{ width: '100%', padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 3, fontSize: 13 }}
        />
      </div>
      <div>
        <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 2 }}>Kleur</label>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="color" value={s.color ?? '#a64033'} onChange={(e) => onUpdate({ color: e.target.value })}
            style={{ width: 36, height: 28, border: '1px solid #cbd5e1', borderRadius: 3, padding: 1, cursor: 'pointer' }} />
          <span style={{ fontSize: 12, color: '#64748b' }}>{s.color ?? '#a64033'}</span>
        </div>
      </div>
      <div>
        <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 2 }}>Metselverband</label>
        <select
          value={s.verband ?? DEFAULT_VERBAND}
          onChange={(e) => onUpdate({ verband: e.target.value })}
          style={{ width: '100%', padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 3, fontSize: 13 }}
        >
          <option value="halfsteens">Halfsteens</option>
          <option value="staand">Staand verband</option>
        </select>
      </div>
      <div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Steenstrip afmetingen</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[
            ['Lengte (mm)', 'steenL'],
            ['Hoogte (mm)', 'steenH'],
            ['Lintvoeg (mm)', 'lint'],
            ['Stootvoeg (mm)', 'stoot'],
          ].map(([label, key]) => (
            <label key={key} style={{ fontSize: 12 }}>
              <span style={{ color: '#64748b', display: 'block', marginBottom: 1 }}>{label}</span>
              <input
                type="number"
                value={mat[key] ?? DEFAULT_MATERIAL[key]}
                onChange={(e) => onUpdate({ material: { ...mat, [key]: Number(e.target.value) } })}
                style={{ width: '100%', padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: 3, fontSize: 12 }}
              />
            </label>
          ))}
        </div>
      </div>
      <div>
        <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 2 }}>Strip dikte IFC (mm)</label>
        <input
          type="number"
          value={s.brickDepth ?? 20}
          onChange={(e) => onUpdate({ brickDepth: Number(e.target.value) })}
          style={{ width: 80, padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: 3, fontSize: 12 }}
        />
      </div>
    </div>
  );
}

export default function App() {
  const [allWalls, setAllWalls] = useState([]);
  const [adjacencies, setAdjacencies] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedWallIds, setSelectedWallIds] = useState(new Set());
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [loadStatus, setLoadStatus] = useState('idle');
  const [loadError, setLoadError] = useState(null);
  const [ifcFileName, setIfcFileName] = useState(null);
  const { get: getSettings, update: updateSettings, settings: allSettings } = useGroupSettings();

  const wallMap = Object.fromEntries(allWalls.map((w) => [w.expressID, w]));

  const ungroupedWallIds = allWalls
    .map((w) => w.expressID)
    .filter((id) => !groups.some((g) => g.wallIds.includes(id)));

  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setLoadStatus('loading');
    setLoadError(null);
    try {
      const walls = await parseIfc(file);
      if (!walls.length) throw new Error('Geen wanden gevonden in IFC-bestand');
      const adj = detectAdjacencies(walls);
      setAllWalls(walls);
      setAdjacencies(adj);
      setGroups([]);
      setSelectedWallIds(new Set());
      setActiveGroupId(null);
      setIfcFileName(file.name.replace(/\.ifc$/i, ''));
      setLoadStatus('loaded');
    } catch (err) {
      setLoadError(err.message);
      setLoadStatus('error');
    }
  }

  function autoGroupByAdjacency() {
    const components = buildConnectedComponents(allWalls, adjacencies);
    const newGroups = components.map((wallIds) => {
      const gid = makeGroupId();
      const sortedIds = sortWallsInComponent(wallIds, allWalls, adjacencies);
      return { id: gid, wallIds: sortedIds };
    });
    setGroups(newGroups);
    setSelectedWallIds(new Set());
    setActiveGroupId(newGroups[0]?.id ?? null);
  }

  function createGroupFromSelected() {
    if (!selectedWallIds.size) return;
    const gid = makeGroupId();
    const wallIds = [...selectedWallIds];
    const sortedIds = sortWallsInComponent(wallIds, allWalls, adjacencies);
    setGroups((prev) => [...prev, { id: gid, wallIds: sortedIds }]);
    setSelectedWallIds(new Set());
    setActiveGroupId(gid);
  }

  function deleteGroup(gid) {
    setGroups((prev) => prev.filter((g) => g.id !== gid));
    if (activeGroupId === gid) setActiveGroupId(null);
  }

  function toggleWallSelection(expressID) {
    setSelectedWallIds((prev) => {
      const next = new Set(prev);
      if (next.has(expressID)) next.delete(expressID);
      else next.add(expressID);
      return next;
    });
  }

  function addSelectedToGroup(gid) {
    if (!selectedWallIds.size) return;
    setGroups((prev) => prev.map((g) => {
      if (g.id !== gid) return g;
      const newIds = [...new Set([...g.wallIds, ...selectedWallIds])];
      return { ...g, wallIds: sortWallsInComponent(newIds, allWalls, adjacencies) };
    }));
    setSelectedWallIds(new Set());
  }

  function removeWallFromGroup(gid, wallId) {
    setGroups((prev) => prev.map((g) => {
      if (g.id !== gid) return g;
      return { ...g, wallIds: g.wallIds.filter((id) => id !== wallId) };
    }).filter((g) => g.wallIds.length > 0));
  }

  function getGroupPattern(group) {
    const settings = getSettings(group.id);
    const material = settings.material ?? { ...DEFAULT_MATERIAL };
    const verband = settings.verband ?? DEFAULT_VERBAND;
    const walls = group.wallIds.map((id) => wallMap[id]).filter(Boolean);
    const groupAdj = adjacencies.filter(
      (a) => group.wallIds.includes(a.wallIdA) && group.wallIds.includes(a.wallIdB)
    );
    return buildGroupPattern(walls, groupAdj, material, verband);
  }

  function getGroupBounds(group) {
    const walls = group.wallIds.map((id) => wallMap[id]).filter(Boolean);
    if (!walls.length) return { totalWidth: 0, totalHeight: 0 };

    const origins = walls.map((w) => w.wallOrigin).filter(Boolean);
    if (!origins.length) {
      return {
        totalWidth: walls.reduce((sum, w) => sum + w.length, 0),
        totalHeight: Math.max(...walls.map((w) => w.height)),
      };
    }

    const minL = Math.min(...origins.map((o) => o.lengthStart));
    const maxL = Math.max(...walls.map((w) => (w.wallOrigin?.lengthStart ?? 0) + w.length));
    const minH = Math.min(...origins.map((o) => o.heightStart));
    const maxH = Math.max(...walls.map((w) => (w.wallOrigin?.heightStart ?? 0) + w.height));

    return { totalWidth: maxL - minL, totalHeight: maxH - minH, minL, minH };
  }

  function getGroupWallsForCanvas(group) {
    const walls = group.wallIds.map((id) => wallMap[id]).filter(Boolean);
    if (!walls.length) return walls;

    const origins = walls.map((w) => w.wallOrigin).filter(Boolean);
    if (!origins.length) return walls;

    const minL = Math.min(...origins.map((o) => o.lengthStart));
    const minH = Math.min(...origins.map((o) => o.heightStart));

    return walls.map((w) => ({
      ...w,
      wallOrigin: w.wallOrigin
        ? { ...w.wallOrigin, lengthStart: w.wallOrigin.lengthStart - minL, heightStart: w.wallOrigin.heightStart - minH }
        : w.wallOrigin,
    }));
  }

  function handleExport() {
    const exportGroups = groups.map((group) => {
      const settings = getSettings(group.id);
      const groupWalls = group.wallIds.map((id) => wallMap[id]).filter(Boolean);
      const groupAdj = adjacencies.filter(
        (a) => group.wallIds.includes(a.wallIdA) && group.wallIds.includes(a.wallIdB)
      );
      const rows = buildGroupPattern(groupWalls, groupAdj, settings.material ?? DEFAULT_MATERIAL, settings.verband ?? DEFAULT_VERBAND);

      const wallsWithRows = groupWalls.map((wall) => ({
        wall,
        rows: (rows[wall.expressID] ?? []),
      }));

      return {
        id: group.id,
        name: settings.name ?? group.id,
        wallsWithRows,
      };
    });

    const wallSettingsMap = Object.fromEntries(
      groups.map((g) => [g.id, getSettings(g.id)])
    );

    exportGroupsToIfc(exportGroups, wallSettingsMap, ifcFileName ?? 'export');
  }

  const activeGroup = groups.find((g) => g.id === activeGroupId);
  const activeRows = activeGroup ? getGroupPattern(activeGroup) : null;
  const activeBounds = activeGroup ? getGroupBounds(activeGroup) : null;
  const activeWallsForCanvas = activeGroup ? getGroupWallsForCanvas(activeGroup) : [];

  const scale = activeBounds ? Math.min(1, 800 / Math.max(activeBounds.totalWidth, 1)) : 1;

  const adjSet = new Set(adjacencies.flatMap(({ wallIdA, wallIdB }) => [`${wallIdA}`, `${wallIdB}`]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div style={{ background: '#1e293b', color: '#f8fafc', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Multi-element IFC Brickslip Planner</span>
        <label style={{ cursor: 'pointer' }}>
          <input type="file" accept=".ifc" onChange={handleFileChange} style={{ display: 'none' }} disabled={loadStatus === 'loading'} />
          <span style={{
            background: loadStatus === 'loading' ? '#475569' : '#3b82f6',
            color: '#fff', padding: '5px 14px', borderRadius: 4, fontSize: 13, display: 'inline-block',
          }}>
            {loadStatus === 'loading' ? '⏳ Laden…' : '📂 IFC importeren'}
          </span>
        </label>
        {ifcFileName && (
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{ifcFileName}.ifc — {allWalls.length} wanden</span>
        )}
        {loadError && <span style={{ fontSize: 12, color: '#f87171' }}>Fout: {loadError}</span>}
        {groups.length > 0 && (
          <button
            onClick={handleExport}
            style={{ marginLeft: 'auto', background: '#10b981', color: '#fff', border: 'none', padding: '5px 14px', borderRadius: 4, fontSize: 13 }}
          >
            ⬇ Exporteer IFC
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ width: 280, background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {allWalls.length > 0 && (
            <>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  onClick={autoGroupByAdjacency}
                  style={{ flex: 1, background: '#6366f1', color: '#fff', border: 'none', borderRadius: 3, padding: '5px 8px', fontSize: 12 }}
                >
                  🔗 Auto-groeperen
                </button>
                {selectedWallIds.size > 0 && (
                  <button
                    onClick={createGroupFromSelected}
                    style={{ flex: 1, background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 3, padding: '5px 8px', fontSize: 12 }}
                  >
                    + Groep ({selectedWallIds.size})
                  </button>
                )}
              </div>

              <div style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Wanden ({allWalls.length})
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {allWalls.map((wall) => {
                  const inGroup = groups.find((g) => g.wallIds.includes(wall.expressID));
                  const isAdj = adjSet.has(String(wall.expressID));
                  const isSelected = selectedWallIds.has(wall.expressID);
                  return (
                    <div
                      key={wall.expressID}
                      onClick={() => !inGroup && toggleWallSelection(wall.expressID)}
                      style={{
                        padding: '7px 12px',
                        borderBottom: '1px solid #f1f5f9',
                        cursor: inGroup ? 'default' : 'pointer',
                        background: isSelected ? '#eff6ff' : inGroup ? '#f8fafc' : '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {!inGroup && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleWallSelection(wall.expressID)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ flexShrink: 0 }}
                        />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {wall.name}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>
                          {wall.length} × {wall.height} mm
                          {isAdj && <span style={{ marginLeft: 4, color: '#6366f1' }}>⬡ aangrenzend</span>}
                        </div>
                      </div>
                      {inGroup && (
                        <span style={{ fontSize: 10, background: '#e0e7ff', color: '#4338ca', borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap' }}>
                          {getSettings(inGroup.id).name ?? inGroup.id}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {allWalls.length === 0 && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13, padding: 20, textAlign: 'center' }}>
              Importeer een IFC-bestand om wanden te laden
            </div>
          )}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {groups.length > 0 && (
            <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '8px 16px', display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0 }}>
              {groups.map((g) => {
                const s = getSettings(g.id);
                return (
                  <button
                    key={g.id}
                    onClick={() => setActiveGroupId(g.id)}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 20,
                      border: `2px solid ${activeGroupId === g.id ? '#3b82f6' : '#e2e8f0'}`,
                      background: activeGroupId === g.id ? '#eff6ff' : '#f8fafc',
                      fontSize: 12,
                      fontWeight: activeGroupId === g.id ? 600 : 400,
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color ?? '#a64033', display: 'inline-block' }} />
                    {s.name ?? g.id} ({g.wallIds.length})
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            {activeGroup && activeRows && activeBounds ? (
              <>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ marginBottom: 8, fontSize: 13, color: '#64748b' }}>
                    Patroon: {getSettings(activeGroup.id).verband ?? DEFAULT_VERBAND} — {activeBounds.totalWidth} × {activeBounds.totalHeight} mm
                  </div>
                  <FacadeCanvas
                    walls={activeWallsForCanvas}
                    rows={activeRows}
                    totalWidth={activeBounds.totalWidth}
                    totalHeight={activeBounds.totalHeight}
                    scale={scale}
                  />
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#374151' }}>Wanden in groep</div>
                    {activeGroup.wallIds.map((wid) => {
                      const w = wallMap[wid];
                      if (!w) return null;
                      const adj = adjacencies.filter(
                        (a) => (a.wallIdA === wid || a.wallIdB === wid) && activeGroup.wallIds.includes(a.wallIdA) && activeGroup.wallIds.includes(a.wallIdB)
                      );
                      return (
                        <div key={wid} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                          <span style={{ flex: 1, fontSize: 12 }}>{w.name} — {w.length} × {w.height} mm</span>
                          {adj.length > 0 && <span style={{ fontSize: 10, color: '#6366f1' }}>⬡</span>}
                          <button
                            onClick={() => removeWallFromGroup(activeGroup.id, wid)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 14, padding: '0 4px' }}
                            title="Verwijder uit groep"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                    {selectedWallIds.size > 0 && (
                      <button
                        onClick={() => addSelectedToGroup(activeGroup.id)}
                        style={{ marginTop: 6, background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 3, padding: '4px 10px', fontSize: 12 }}
                      >
                        + Voeg selectie toe aan groep
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ width: 220, flexShrink: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Groepsinstellingen</span>
                    <button
                      onClick={() => deleteGroup(activeGroup.id)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 12, cursor: 'pointer' }}
                      title="Verwijder groep"
                    >
                      🗑
                    </button>
                  </div>
                  <GroupConfigPanel
                    groupId={activeGroup.id}
                    settings={getSettings(activeGroup.id)}
                    onUpdate={(patch) => updateSettings(activeGroup.id, patch)}
                  />
                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 14, gap: 12, textAlign: 'center' }}>
                {allWalls.length > 0 ? (
                  <>
                    <div>Selecteer wanden en maak groepen aan</div>
                    <div style={{ fontSize: 12 }}>
                      Gebruik <strong>Auto-groeperen</strong> om aangrenzende wanden automatisch te groeperen,<br />
                      of selecteer wanden handmatig en klik <strong>+ Groep</strong>.
                    </div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
                      {adjacencies.length > 0 && (
                        <div style={{ background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>
                          ⬡ {adjacencies.length} aangrenzende koppeling{adjacencies.length !== 1 ? 'en' : ''} gedetecteerd
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div>Importeer een IFC-bestand om te beginnen</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {groups.length > 0 && (
        <div style={{ background: '#1e293b', color: '#94a3b8', padding: '8px 20px', fontSize: 11, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span>{groups.length} groep{groups.length !== 1 ? 'en' : ''}</span>
          <span>{groups.reduce((sum, g) => sum + g.wallIds.length, 0)} wanden geconfigureerd</span>
          <span>{ungroupedWallIds.length} wanden zonder groep</span>
          <span style={{ marginLeft: 'auto' }}>{adjacencies.length} aangrenzendheidsrelaties</span>
        </div>
      )}
    </div>
  );
}
