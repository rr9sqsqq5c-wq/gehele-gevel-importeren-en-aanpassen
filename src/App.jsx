import { useState, useMemo, useCallback, useEffect } from 'react';
import { scanIfcWallTypes, parseIfc, exportGroupsToIfc } from './lib/ifc.js';
import { detectAdjacencies, buildConnectedComponents, sortWallsInComponent } from './lib/adjacency.js';
import { buildGroupPattern } from './lib/pattern.js';
import { Viewer3D } from './Viewer3D.jsx';
import { View2D } from './View2D.jsx';

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
  const [groupsHistory, setGroupsHistory] = useState([]);
  const [selectedWallIds, setSelectedWallIds] = useState(new Set());
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [loadStatus, setLoadStatus] = useState('idle');
  const [loadError, setLoadError] = useState(null);
  const [ifcFileName, setIfcFileName] = useState(null);
  const [showPattern, setShowPattern] = useState(true);
  const [viewMode, setViewMode] = useState('3d');
  const [pendingFile, setPendingFile] = useState(null);
  const [wallTypes, setWallTypes] = useState([]);
  const [selectedTypes, setSelectedTypes] = useState(new Set());
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
    setLoadStatus('scanning');
    setLoadError(null);
    try {
      const types = await scanIfcWallTypes(file);
      if (!types.length) throw new Error('Geen wanden gevonden in IFC-bestand');
      setPendingFile(file);
      setWallTypes(types);
      setSelectedTypes(new Set(types.map((t) => t.name)));
      setLoadStatus('selecting');
    } catch (err) {
      setLoadError(err.message);
      setLoadStatus('error');
    }
  }

  async function confirmImport() {
    if (!pendingFile) return;
    setLoadStatus('loading');
    try {
      const filter = selectedTypes.size < wallTypes.length ? selectedTypes : null;
      const walls = await parseIfc(pendingFile, filter);
      if (!walls.length) throw new Error('Geen wanden gevonden met de geselecteerde types');
      setAllWalls(walls);
      setAdjacencies(detectAdjacencies(walls));
      setGroups([]);
      setSelectedWallIds(new Set());
      setActiveGroupId(null);
      setIfcFileName(pendingFile.name.replace(/\.ifc$/i, ''));
      setLoadStatus('loaded');
      setPendingFile(null);
      setWallTypes([]);
      _colorIdx = 0;
    } catch (err) {
      setLoadError(err.message);
      setLoadStatus('error');
    }
  }

  function cancelImport() {
    setPendingFile(null);
    setWallTypes([]);
    setLoadStatus(allWalls.length ? 'loaded' : 'idle');
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
    pushHistory(groups);
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

  const totalSelected = wallTypes.filter((t) => selectedTypes.has(t.name)).reduce((s, t) => s + t.count, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {loadStatus === 'selecting' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Wandtypen selecteren</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
              {pendingFile?.name} · Selecteer welke typen je wilt importeren
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
            </div>

            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
              {wallTypes.map((t) => {
                const checked = selectedTypes.has(t.name);
                return (
                  <label key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: checked ? '#eff6ff' : '#fff' }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleType(t.name)} />
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>{t.name}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8', background: '#f1f5f9', padding: '1px 7px', borderRadius: 10 }}>{t.count} wanden</span>
                  </label>
                );
              })}
            </div>

            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: '#64748b', flex: 1 }}>
                {totalSelected} wanden geselecteerd
              </span>
              <button onClick={cancelImport} style={{ fontSize: 12, background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, padding: '6px 14px', cursor: 'pointer' }}>
                Annuleren
              </button>
              <button onClick={confirmImport} disabled={!selectedTypes.size}
                style={{ fontSize: 12, background: selectedTypes.size ? '#3b82f6' : '#94a3b8', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', cursor: selectedTypes.size ? 'pointer' : 'not-allowed', fontWeight: 600 }}>
                Importeren
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={{ background: '#1e293b', color: '#f8fafc', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>IFC Brickslip Planner</span>

        <label style={{ cursor: 'pointer' }}>
          <input type="file" accept=".ifc" onChange={handleFileChange} style={{ display: 'none' }} disabled={loadStatus === 'loading'} />
          <span style={{ background: (loadStatus === 'loading' || loadStatus === 'scanning') ? '#475569' : '#3b82f6', color: '#fff', padding: '4px 12px', borderRadius: 4, fontSize: 12, display: 'inline-block' }}>
            {loadStatus === 'scanning' ? '🔍 Scannen…' : loadStatus === 'loading' ? '⏳ Laden…' : '📂 IFC importeren'}
          </span>
        </label>

        {ifcFileName && <span style={{ fontSize: 11, color: '#94a3b8' }}>{ifcFileName}.ifc · {allWalls.length} wanden</span>}
        {loadError && <span style={{ fontSize: 11, color: '#f87171' }}>⚠ {loadError}</span>}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {groupsHistory.length > 0 && (
            <button onClick={undo} title="Ongedaan maken (Ctrl+Z)" style={{ background: '#334155', color: '#f1f5f9', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
              ↩ Undo
            </button>
          )}
          {viewMode === '3d' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#94a3b8', cursor: 'pointer' }}>
              <input type="checkbox" checked={showPattern} onChange={(e) => setShowPattern(e.target.checked)} />
              Patroon in 3D
            </label>
          )}

          {allWalls.length > 0 && (
            <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', border: '1px solid #334155' }}>
              <button
                onClick={() => setViewMode('3d')}
                style={{ background: viewMode === '3d' ? '#3b82f6' : '#1e293b', color: '#fff', border: 'none', padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}
              >
                3D
              </button>
              <button
                onClick={() => setViewMode('2d')}
                style={{ background: viewMode === '2d' ? '#3b82f6' : '#1e293b', color: viewMode === '2d' ? '#fff' : '#94a3b8', border: 'none', borderLeft: '1px solid #334155', padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}
              >
                2D Gevel
              </button>
            </div>
          )}

          {groups.length > 0 && (
            <button onClick={handleExport} style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}>
              ⬇ Exporteer IFC
            </button>
          )}
        </div>
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
          {viewMode === '3d' ? (
            <>
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
            </>
          ) : (
            <>
              <View2D
                walls={selectedWallIds.size > 0 ? allWalls.filter((w) => selectedWallIds.has(w.expressID)) : allWalls}
                patterns={allPatterns}
                groupSettings={getSettings}
                wallGroupMap={wallGroupMap}
                selectedWallIds={selectedWallIds}
              />
              <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', background: 'rgba(15,23,42,0.85)', color: '#94a3b8', fontSize: 11, padding: '4px 14px', borderRadius: 20, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                {selectedWallIds.size > 0
                  ? `${selectedWallIds.size} geselecteerde element${selectedWallIds.size !== 1 ? 'en' : ''} · 2D gevelaanzicht`
                  : `Alle ${allWalls.length} wanden · 2D gevelaanzicht`}
              </div>
            </>
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
