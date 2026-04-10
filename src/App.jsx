import { useState, useMemo, useCallback } from 'react';
import { parseIfc, exportGroupsToIfc } from './lib/ifc.js';
import { detectAdjacencies, buildConnectedComponents, sortWallsInComponent } from './lib/adjacency.js';
import { buildGroupPattern } from './lib/pattern.js';
import { Viewer3D } from './Viewer3D.jsx';

const DEFAULT_MATERIAL = { steenL: 210, steenH: 50, lint: 12, stoot: 10 };
const DEFAULT_VERBAND = 'halfsteens';
let _gid = 1;
const newGid = () => `G${_gid++}`;

const GROUP_COLORS = [
  '#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#e67e22',
  '#16a085', '#d35400', '#2471a3', '#1e8449', '#6c3483',
];
let _colorIdx = 0;
const nextColor = () => GROUP_COLORS[_colorIdx++ % GROUP_COLORS.length];

function useGroupSettings() {
  const [map, setMap] = useState({});
  const defaults = (id) => ({ name: id, color: '#a64033', verband: DEFAULT_VERBAND, material: { ...DEFAULT_MATERIAL }, brickDepth: 20 });
  const get = useCallback((id) => ({ ...defaults(id), ...map[id] }), [map]);
  const update = useCallback((id, patch) => setMap((prev) => ({ ...prev, [id]: { ...defaults(id), ...prev[id], ...patch } })), []);
  const initColor = useCallback((id, color) => setMap((prev) => prev[id] ? prev : { ...prev, [id]: { ...defaults(id), color } }), []);
  return { get, update, initColor };
}

function GroupConfigPanel({ groupId, settings, onUpdate, onDelete }) {
  const mat = settings.material ?? { ...DEFAULT_MATERIAL };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Groep configuratie</span>
        <button onClick={onDelete} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13 }} title="Groep verwijderen">🗑</button>
      </div>

      <Field label="Naam">
        <input type="text" value={settings.name} onChange={(e) => onUpdate({ name: e.target.value })}
          style={inp} />
      </Field>

      <Field label="Kleur">
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="color" value={settings.color} onChange={(e) => onUpdate({ color: e.target.value })}
            style={{ width: 36, height: 28, border: '1px solid #cbd5e1', borderRadius: 3, padding: 1, cursor: 'pointer' }} />
          <span style={{ fontSize: 11, color: '#64748b' }}>{settings.color}</span>
        </div>
      </Field>

      <Field label="Metselverband">
        <select value={settings.verband} onChange={(e) => onUpdate({ verband: e.target.value })} style={inp}>
          <option value="halfsteens">Halfsteens</option>
          <option value="staand">Staand</option>
        </select>
      </Field>

      <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginTop: 2 }}>Steenstrip afmetingen</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        {[['Lengte', 'steenL'], ['Hoogte', 'steenH'], ['Lintvoeg', 'lint'], ['Stootvoeg', 'stoot']].map(([label, key]) => (
          <Field key={key} label={`${label} mm`}>
            <input type="number" value={mat[key] ?? DEFAULT_MATERIAL[key]}
              onChange={(e) => onUpdate({ material: { ...mat, [key]: Number(e.target.value) } })}
              style={{ ...inp, width: '100%' }} />
          </Field>
        ))}
      </div>

      <Field label="Strip dikte IFC (mm)">
        <input type="number" value={settings.brickDepth} onChange={(e) => onUpdate({ brickDepth: Number(e.target.value) })}
          style={{ ...inp, width: 70 }} />
      </Field>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12 }}>
      <span style={{ color: '#64748b' }}>{label}</span>
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

export default function App() {
  const [allWalls, setAllWalls] = useState([]);
  const [adjacencies, setAdjacencies] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedWallIds, setSelectedWallIds] = useState(new Set());
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [loadStatus, setLoadStatus] = useState('idle');
  const [loadError, setLoadError] = useState(null);
  const [ifcFileName, setIfcFileName] = useState(null);
  const [showPattern, setShowPattern] = useState(true);
  const { get: getSettings, update: updateSettings, initColor } = useGroupSettings();

  const wallMap = useMemo(() => Object.fromEntries(allWalls.map((w) => [w.expressID, w])), [allWalls]);

  const wallGroupMap = useMemo(() => {
    const m = {};
    for (const g of groups) for (const id of g.wallIds) m[id] = g.id;
    return m;
  }, [groups]);

  const allPatterns = useMemo(() => {
    if (!showPattern) return {};
    const result = {};
    for (const group of groups) {
      const s = getSettings(group.id);
      const walls = group.wallIds.map((id) => wallMap[id]).filter(Boolean);
      const gAdj = adjacencies.filter((a) => group.wallIds.includes(a.wallIdA) && group.wallIds.includes(a.wallIdB));
      const rows = buildGroupPattern(walls, gAdj, s.material ?? DEFAULT_MATERIAL, s.verband ?? DEFAULT_VERBAND);
      Object.assign(result, rows);
    }
    return result;
  }, [groups, getSettings, wallMap, adjacencies, showPattern]);

  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setLoadStatus('loading');
    setLoadError(null);
    try {
      const walls = await parseIfc(file);
      if (!walls.length) throw new Error('Geen wanden gevonden in IFC-bestand');
      setAllWalls(walls);
      setAdjacencies(detectAdjacencies(walls));
      setGroups([]);
      setSelectedWallIds(new Set());
      setActiveGroupId(null);
      setIfcFileName(file.name.replace(/\.ifc$/i, ''));
      setLoadStatus('loaded');
      _colorIdx = 0;
    } catch (err) {
      setLoadError(err.message);
      setLoadStatus('error');
    }
  }

  function autoGroup() {
    const comps = buildConnectedComponents(allWalls, adjacencies);
    _colorIdx = 0;
    const newGroups = comps.map((ids) => {
      const gid = newGid();
      const color = nextColor();
      initColor(gid, color);
      return { id: gid, wallIds: sortWallsInComponent(ids, allWalls, adjacencies) };
    });
    setGroups(newGroups);
    setSelectedWallIds(new Set());
    setActiveGroupId(newGroups[0]?.id ?? null);
  }

  function createGroup() {
    const ids = [...selectedWallIds].filter((id) => !wallGroupMap[id]);
    if (!ids.length) return;
    const gid = newGid();
    const color = nextColor();
    initColor(gid, color);
    setGroups((prev) => [...prev, { id: gid, wallIds: sortWallsInComponent(ids, allWalls, adjacencies) }]);
    setSelectedWallIds(new Set());
    setActiveGroupId(gid);
  }

  function addToGroup(gid) {
    const ids = [...selectedWallIds].filter((id) => !wallGroupMap[id]);
    if (!ids.length) return;
    setGroups((prev) => prev.map((g) => g.id !== gid ? g : {
      ...g, wallIds: sortWallsInComponent([...new Set([...g.wallIds, ...ids])], allWalls, adjacencies),
    }));
    setSelectedWallIds(new Set());
  }

  function removeFromGroup(gid, wallId) {
    setGroups((prev) => prev.map((g) => g.id !== gid ? g : { ...g, wallIds: g.wallIds.filter((id) => id !== wallId) }).filter((g) => g.wallIds.length > 0));
    if (activeGroupId === gid && groups.find((g) => g.id === gid)?.wallIds.length <= 1) setActiveGroupId(null);
  }

  function deleteGroup(gid) {
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

  function handleExport() {
    const exportGroups = groups.map((group) => {
      const s = getSettings(group.id);
      const walls = group.wallIds.map((id) => wallMap[id]).filter(Boolean);
      const gAdj = adjacencies.filter((a) => group.wallIds.includes(a.wallIdA) && group.wallIds.includes(a.wallIdB));
      const rows = buildGroupPattern(walls, gAdj, s.material ?? DEFAULT_MATERIAL, s.verband ?? DEFAULT_VERBAND);
      return { id: group.id, name: s.name, wallsWithRows: walls.map((wall) => ({ wall, rows: rows[wall.expressID] ?? [] })) };
    });
    const settingsMap = Object.fromEntries(groups.map((g) => [g.id, getSettings(g.id)]));
    exportGroupsToIfc(exportGroups, settingsMap, ifcFileName ?? 'export');
  }

  const ungrouped = allWalls.filter((w) => !wallGroupMap[w.expressID]);
  const activeGroup = groups.find((g) => g.id === activeGroupId);
  const selectionHasUngrouped = [...selectedWallIds].some((id) => !wallGroupMap[id]);
  const ungroupedSelCount = [...selectedWallIds].filter((id) => !wallGroupMap[id]).length;
  const adjWallIds = useMemo(() => new Set(adjacencies.flatMap((a) => [a.wallIdA, a.wallIdB])), [adjacencies]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ background: '#1e293b', color: '#f8fafc', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>IFC Brickslip Planner</span>

        <label style={{ cursor: 'pointer' }}>
          <input type="file" accept=".ifc" onChange={handleFileChange} style={{ display: 'none' }} disabled={loadStatus === 'loading'} />
          <span style={{ background: loadStatus === 'loading' ? '#475569' : '#3b82f6', color: '#fff', padding: '4px 12px', borderRadius: 4, fontSize: 12, display: 'inline-block' }}>
            {loadStatus === 'loading' ? '⏳ Laden…' : '📂 IFC importeren'}
          </span>
        </label>

        {ifcFileName && <span style={{ fontSize: 11, color: '#94a3b8' }}>{ifcFileName}.ifc · {allWalls.length} wanden</span>}
        {loadError && <span style={{ fontSize: 11, color: '#f87171' }}>⚠ {loadError}</span>}

        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#94a3b8', cursor: 'pointer', marginLeft: 'auto' }}>
          <input type="checkbox" checked={showPattern} onChange={(e) => setShowPattern(e.target.checked)} />
          Patroon in 3D
        </label>

        {groups.length > 0 && (
          <button onClick={handleExport} style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}>
            ⬇ Exporteer IFC
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ width: 260, background: '#f8fafc', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
          {allWalls.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12, padding: 16, textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
                <div>Importeer een IFC-bestand om te beginnen</div>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              {adjacencies.length > 0 && (
                <div style={{ padding: '5px 10px', background: '#ede9fe', borderBottom: '1px solid #c4b5fd', fontSize: 11, color: '#6d28d9', flexShrink: 0 }}>
                  ⬡ {adjacencies.length} aangrenzende relatie{adjacencies.length !== 1 ? 's' : ''} gevonden
                </div>
              )}

              <div style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', background: '#fff', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button onClick={autoGroup} style={btn('#6366f1')}>
                  🔗 Auto-groeperen op aangrenzendheid
                </button>
                {selectionHasUngrouped && (
                  <button onClick={createGroup} style={btn('#0ea5e9')}>
                    + Nieuwe groep van selectie ({ungroupedSelCount})
                  </button>
                )}
                {selectionHasUngrouped && groups.map((g) => {
                  const s = getSettings(g.id);
                  return (
                    <button key={g.id} onClick={() => addToGroup(g.id)}
                      style={{ ...btn(s.color), display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, border: '1px solid rgba(255,255,255,0.4)', display: 'inline-block', flexShrink: 0 }} />
                      <span>Voeg toe aan {s.name}</span>
                    </button>
                  );
                })}
                {selectedWallIds.size > 0 && (
                  <button onClick={clearSelection} style={{ ...btn('#64748b') }}>
                    ✕ Deselecteer alles ({selectedWallIds.size})
                  </button>
                )}
              </div>

              {groups.length > 0 && (
                <div style={{ flexShrink: 0 }}>
                  <div style={{ padding: '5px 10px', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                    Groepen ({groups.length})
                  </div>
                  {groups.map((g) => {
                    const s = getSettings(g.id);
                    const isActive = activeGroupId === g.id;
                    return (
                      <div key={g.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <div
                          onClick={() => setActiveGroupId(isActive ? null : g.id)}
                          style={{ padding: '6px 10px', cursor: 'pointer', background: isActive ? '#eff6ff' : '#fff', display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: 'inline-block', flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: 12, fontWeight: isActive ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                          <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>{g.wallIds.length} wand{g.wallIds.length !== 1 ? 'en' : ''}</span>
                          <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>{isActive ? '▲' : '▼'}</span>
                        </div>
                        {isActive && (
                          <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                            {g.wallIds.map((wid) => {
                              const w = wallMap[wid];
                              if (!w) return null;
                              return (
                                <div key={wid} style={{ padding: '4px 10px 4px 24px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, borderBottom: '1px solid #f1f5f9' }}>
                                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#334155' }}>{w.name}</span>
                                  <span style={{ color: '#94a3b8', flexShrink: 0, fontSize: 10 }}>{w.length}mm</span>
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
                      <button onClick={selectAllUngrouped} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: 10, padding: 0 }}>
                        Selecteer alle
                      </button>
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
          )}
        </div>

        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <Viewer3D
            walls={allWalls}
            selectedWallIds={selectedWallIds}
            groups={groups}
            groupSettings={getSettings}
            wallPatterns={allPatterns}
            onSelectWall={toggleSelect}
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
        </div>

        {activeGroup && (
          <div style={{ width: 230, background: '#fff', borderLeft: '1px solid #e2e8f0', overflowY: 'auto', flexShrink: 0 }}>
            <div style={{ padding: 12 }}>
              <GroupConfigPanel
                groupId={activeGroup.id}
                settings={getSettings(activeGroup.id)}
                onUpdate={(patch) => updateSettings(activeGroup.id, patch)}
                onDelete={() => deleteGroup(activeGroup.id)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
