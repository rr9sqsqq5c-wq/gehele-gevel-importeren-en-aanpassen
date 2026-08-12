// GhCladdingView — eigen full-screen weergave voor een geïmporteerde Grasshopper-gevel (vlag ghImport).
// Toont per gevel het beoordelingsaanzicht (steenstrips in kleur + paneelgrenzen + nummers), de
// uittrekstaat, en een download van de genummerde IFC. Zuiver additief; alleen zichtbaar als App het
// mount (isGhImport() && ghResult). Gebruikt de bewezen functies uit lib/ghCladding.js.
import { useState, useMemo } from 'react';
import { buildGevelSvg, buildNumberedIfc } from './lib/ghCladding.js';

const COLORS = [['#8a8f95', 'Grijs'], ['#a8514c', 'Rood'], ['#6f8a3f', 'Groen']];

export function GhCladdingView({ result, onClose }) {
  const [gi, setGi] = useState(0);
  const [color, setColor] = useState('#8a8f95');
  const gev = result.gevels[gi] || result.gevels[0];
  const svg = useMemo(() => (gev ? buildGevelSvg(gev, color) : ''), [gev, color]);
  const svgUrl = useMemo(() => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), [svg]);
  const t = result.totals;

  function downloadNumbered() {
    const txt = buildNumberedIfc(result.ifcText, result);
    const blob = new Blob([txt], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = (result.fileName || 'model').replace(/\.ifc$/i, '') + '-genummerd.ifc';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  const btn = { fontSize: 12, background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 4, padding: '5px 12px', cursor: 'pointer', whiteSpace: 'nowrap' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: '#0b1220', color: '#e2e8f0', display: 'flex', flexDirection: 'column', fontFamily: 'Segoe UI, Arial, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px', borderBottom: '1px solid #334155', flexShrink: 0, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>📐 Grasshopper-gevel</strong>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{result.fileName}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#cbd5e1' }}>
          <b>{t.panelen.count}</b> panelen ({t.panelen.m2} m²) · <b>{t.steenstrips.count}</b> strippen · <b>{t.latten.count}</b> latten ({t.latten.m} m) · {result.gevels.length} gevels
        </span>
        <button onClick={downloadNumbered} style={{ ...btn, background: '#0f766e', borderColor: '#0f766e', color: '#fff' }}>⬇ Genummerde IFC</button>
        <button onClick={onClose} style={btn}>✕ Sluiten</button>
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ width: 152, borderRight: '1px solid #334155', overflowY: 'auto', padding: 8, flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Gevels</div>
          {result.gevels.map((g, i) => (
            <button key={g.gid} onClick={() => setGi(i)}
              style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: 3, fontSize: 12, background: i === gi ? '#1d4ed8' : '#1e293b', color: '#e2e8f0', border: '1px solid ' + (i === gi ? '#3b82f6' : '#334155'), borderRadius: 4, padding: '5px 9px', cursor: 'pointer' }}>
              <span>Gevel {g.letter}</span>
              <span style={{ color: i === gi ? '#dbeafe' : '#94a3b8' }}>{g.panels.length}</span>
            </button>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 'bold' }}>Gevel {gev?.letter}</span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>{gev?.panels.length} panelen · onder→boven, links→rechts</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: '#64748b' }}>steenkleur:</span>
            {COLORS.map(([c, lbl]) => (
              <button key={c} onClick={() => setColor(c)} title={lbl} style={{ width: 20, height: 20, borderRadius: 4, background: c, cursor: 'pointer', border: color === c ? '2px solid #fff' : '1px solid #334155' }} />
            ))}
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 16, background: '#0f172a', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
            {gev ? <img src={svgUrl} alt={`Gevel ${gev.letter}`} style={{ maxWidth: '100%', background: '#fff', borderRadius: 4 }} /> : <span style={{ color: '#64748b' }}>Geen gevel</span>}
          </div>
          {result.unassigned > 0 && (
            <div style={{ fontSize: 11, color: '#f59e0b', padding: '6px 14px', borderTop: '1px solid #1e293b', flexShrink: 0 }}>
              ⚠ {result.unassigned} strippen/latten niet aan een paneel toegewezen (bij randen/openingen) — die tellen niet mee in de nummering.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
