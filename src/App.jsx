import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { scanIfcWallTypes, parseIfc, exportGroupsToIfc, warmupWebIFC, parseIfcGridLines } from './lib/ifc.js';
warmupWebIFC();
import { saveIfcFile, loadSavedIfcFile, deleteSavedIfcFile, saveParsedWalls, loadParsedWalls, saveFileHandle, loadFileHandle, deleteFileHandle, supportsFileSystemAccess } from './lib/storage.js';
import { detectAdjacencies, buildConnectedComponents, sortWallsInComponent } from './lib/adjacency.js';
import { buildGroupPattern, buildFacePattern, buildSymmetricFacePattern, buildCenteredFacePattern, buildMirroredFacePattern, getGroupPatternLogic, buildFullGroupFacadePattern } from './lib/pattern.js';
import { BATTEN_CATALOG } from './lib/battens.js';
import { buildFacadeZones, panelizeZone, computeEffectiveBasePanel } from './lib/panelization.js';
import { Viewer3D } from './Viewer3D.jsx';
import { View2D } from './View2D.jsx';
import { Werktekening } from './Werktekening.jsx';
import { Uittrekstaat } from './Uittrekstaat.jsx';

const DEFAULT_MATERIAL = { steenL: 210, steenH: 50, lint: 12, stoot: 10, brickWeightM2: 40 };
const DEFAULT_VERBAND = 'halfsteens';

const DIM_TOL = 50;
const OP_TOL = 50;
const POS_TOL = 150;

function wallCenter(wall) {
  const wo = wall.wallOrigin;
  if (!wo) return { x: 0, y: 0, z: 0 };
  const c = { x: 0, y: 0, z: 0 };
  c[wo.lengthAxis] = wo.lengthStart + wall.length / 2;
  c[wo.heightAxis] = wo.heightStart + wall.height / 2;
  const thickness = Math.abs((wo.thicknessEnd ?? wo.thicknessStart + 200) - wo.thicknessStart);
  c[wo.thicknessAxis] = wo.thicknessStart + thickness / 2;
  return c;
}

function wallSortKey(wall) {
  const c = wallCenter(wall);
  return c.x * 1e9 + c.z * 1e6 + c.y;
}

function openingsMatch(refOps, candOps) {
  if (refOps.length !== candOps.length) return false;
  if (refOps.length === 0) return true;
  const sr = [...refOps].sort((a, b) => a.x - b.x);
  const sc = [...candOps].sort((a, b) => a.x - b.x);
  for (let i = 0; i < sr.length; i++) {
    const r = sr[i]; const c = sc[i];
    if (Math.abs(r.x - c.x) > OP_TOL) return false;
    if (Math.abs(r.y - c.y) > OP_TOL) return false;
    if (Math.abs(r.breedte - c.breedte) > OP_TOL) return false;
    if (Math.abs(r.hoogte - c.hoogte) > OP_TOL) return false;
  }
  return true;
}

function buildGroupSignature(walls) {
  const sorted = [...walls].sort((a, b) => wallSortKey(a) - wallSortKey(b));
  const base = wallCenter(sorted[0]);
  return sorted.map((w) => {
    const c = wallCenter(w);
    return {
      dx: c.x - base.x, dy: c.y - base.y, dz: c.z - base.z,
      length: w.length, height: w.height,
      openings: (w.openings ?? []).slice().sort((a, b) => a.x - b.x),
    };
  });
}

function findSimilarGroups(referenceWalls, allWalls, existingGroups, adjacencies) {
  if (!referenceWalls.length) return [];
  const groupedIds = new Set(existingGroups.flatMap((g) => g.wallIds));
  const ungrouped = allWalls.filter((w) => !groupedIds.has(w.expressID));
  if (!ungrouped.length) return [];

  const N = referenceWalls.length;
  const refSig = buildGroupSignature(referenceWalls);

  const anchors = ungrouped.filter((w) =>
    Math.abs(w.length - refSig[0].length) <= DIM_TOL &&
    Math.abs(w.height - refSig[0].height) <= DIM_TOL &&
    openingsMatch(w.openings ?? [], refSig[0].openings)
  );

  const results = [];
  const seen = new Set();

  for (const anchor of anchors) {
    const ac = wallCenter(anchor);
    const matched = [anchor];
    let valid = true;

    for (let i = 1; i < N; i++) {
      const sig = refSig[i];
      const tx = ac.x + sig.dx, ty = ac.y + sig.dy, tz = ac.z + sig.dz;
      const match = ungrouped.find((w) => {
        if (matched.includes(w)) return false;
        if (Math.abs(w.length - sig.length) > DIM_TOL) return false;
        if (Math.abs(w.height - sig.height) > DIM_TOL) return false;
        const wc = wallCenter(w);
        if (Math.abs(wc.x - tx) > POS_TOL) return false;
        if (Math.abs(wc.y - ty) > POS_TOL) return false;
        if (Math.abs(wc.z - tz) > POS_TOL) return false;
        return openingsMatch(w.openings ?? [], sig.openings);
      });
      if (!match) { valid = false; break; }
      matched.push(match);
    }

    if (!valid) continue;
    if (!matched.every((w) => !groupedIds.has(w.expressID))) continue;
    const key = matched.map((w) => w.expressID).sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(matched.map((w) => w.expressID));
  }

  return results.map((ids) => sortWallsInComponent(ids, allWalls, adjacencies));
}
const GROUP_COLORS = [
  '#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#e67e22',
  '#16a085', '#d35400', '#2471a3', '#1e8449', '#6c3483',
];

function useGroupSettings() {
  const [map, setMap] = useState({});
  const defaults = (id) => ({ name: id, color: '#a64033', verband: DEFAULT_VERBAND, material: { ...DEFAULT_MATERIAL }, brickDepth: 20, maxHoogte: null, minHoogte: null, penanten: [], zoneSettings: [], zetwerk: { enabled: false, breedte: 50, dikte: 2, offsetH: 0, offsetV: 0, stripOffset: 5 }, panelen: { enabled: false, breedte: 3005, hoogte: 1200, dikte: 8, gewichtM2: 9.4, maxKg: 50 }, latten: { enabled: false, richting: 'horizontaal', breedte: 50, dikte: 28, maxInterval: 400 }, layerVisibility: { strips: true, zetwerk: true, panelen: true, latten: true } });
  const get = useCallback((id) => ({ ...defaults(id), ...map[id] }), [map]);
  const update = useCallback((id, patch) => setMap((prev) => ({ ...prev, [id]: { ...defaults(id), ...prev[id], ...patch } })), []);
  const initColor = useCallback((id, color, name) => setMap((prev) => prev[id] ? prev : { ...prev, [id]: { ...defaults(id), color, ...(name ? { name } : {}) } }), []);
  return { get, update, initColor, map, setMap };
}

function CollapsibleSection({ title, tip, children, isOpen, onToggle, badge, extra }) {
  return (
    <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 4, paddingTop: 6 }}>
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', userSelect: 'none', marginBottom: isOpen ? 6 : 0 }}>
        <span style={{ fontSize: 9, color: '#94a3b8', width: 10, flexShrink: 0 }}>{isOpen ? '▼' : '▶'}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#475569', flex: 1, display: 'flex', alignItems: 'center', gap: 3 }}>
          {title}{tip && <InfoIcon tip={tip} />}
        </span>
        {badge != null && <span style={{ fontSize: 10, color: '#64748b', background: '#f1f5f9', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>{badge}</span>}
        {extra && <span onClick={(e) => e.stopPropagation()}>{extra}</span>}
      </div>
      {isOpen && <div>{children}</div>}
    </div>
  );
}

function evalPenantX(expr, gapCenters) {
  if (expr === undefined || expr === null || String(expr).trim() === '') return 0;
  let s = String(expr).trim();
  (gapCenters ?? []).forEach((val, idx) => {
    s = s.replace(new RegExp(`\\bhl${idx + 1}\\b`, 'g'), String(Math.round(val)));
  });
  try {
    if (!/^[\d\s+\-*/.()]+$/.test(s)) return NaN;
    // eslint-disable-next-line no-new-func
    const result = new Function(`return (${s})`)();
    return typeof result === 'number' && isFinite(result) ? Math.round(result) : NaN;
  } catch {
    return NaN;
  }
}

function GroupConfigPanel({ groupId, settings, onUpdate, onDelete, linkedCount, onSyncToLinked, gapCenters, groupWidth }) {
  const mat = settings.material ?? { ...DEFAULT_MATERIAL };
  const [openSections, setOpenSections] = useState({});
  const toggle = (k) => setOpenSections((p) => ({ ...p, [k]: !(p[k] ?? false) }));
  const isOpen = (k) => openSections[k] ?? false;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Groep configuratie</span>
        <button onClick={onDelete} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13 }} title="Groep verwijderen">🗑</button>
      </div>

      {linkedCount > 0 && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 5, padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#1d4ed8', flex: 1 }}>🔗 {linkedCount} gekoppelde groep{linkedCount !== 1 ? 'en' : ''}</span>
          <button
            onClick={onSyncToLinked}
            style={{ fontSize: 11, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 3, padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Sync instellingen →
          </button>
        </div>
      )}

      <Field label="Naam" tip="Naam van de groep, zichtbaar in de lijst en bij de IFC-export.">
        <input type="text" value={settings.name} onChange={(e) => onUpdate({ name: e.target.value })}
          style={inp} />
      </Field>

      <Field label="Kleur" tip="Kleur van de groep in de 3D viewer en het 2D gevelaanzicht.">
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="color" value={settings.color} onChange={(e) => onUpdate({ color: e.target.value })}
            style={{ width: 36, height: 28, border: '1px solid #cbd5e1', borderRadius: 3, padding: 1, cursor: 'pointer' }} />
          <span style={{ fontSize: 11, color: '#64748b' }}>{settings.color}</span>
        </div>
      </Field>

      <Field label="Metselverband" tip={"Halfsteens: stenen verspringen een halve steenlengte per laag — meest gebruikelijk.\nTegelverband: stenen lopen horizontaal door zonder verspinging.\nStaand tegelverband: steenstrips staan verticaal (lange kant omhoog), kolommen naast elkaar zonder verspinging."}>
        <select value={settings.verband} onChange={(e) => onUpdate({ verband: e.target.value })} style={inp}>
          <option value="halfsteens">Halfsteens</option>
          <option value="tegelverband">Tegelverband</option>
          <option value="staand_tegelverband">Staand tegelverband</option>
        </select>
      </Field>

      <CollapsibleSection title="Steenstrip afmetingen" tip={"Afmetingen van de brickslip (steenstrip):\n· Lengte = zichtbare lengte van de strip\n· Hoogte = zichtbare hoogte van de strip\n· Lintvoeg = horizontale voeg tussen lagen\n· Stootvoeg = verticale voeg tussen stenen"} isOpen={isOpen('strips')} onToggle={() => toggle('strips')}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {[
            ['Lengte', 'steenL', 'Zichtbare lengte van de brickslip (mm).'],
            ['Hoogte', 'steenH', 'Zichtbare hoogte van de brickslip (mm).'],
            ['Lintvoeg', 'lint', 'Breedte van de horizontale voeg tussen lagen (mm).'],
            ['Stootvoeg', 'stoot', 'Breedte van de verticale voeg tussen stenen (mm).'],
          ].map(([label, key, tip]) => (
            <Field key={key} label={`${label} mm`} tip={tip}>
              <input type="number" value={mat[key] ?? DEFAULT_MATERIAL[key]}
                onChange={(e) => onUpdate({ material: { ...mat, [key]: Number(e.target.value) } })}
                style={{ ...inp, width: '100%' }} />
            </Field>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 4 }}>
          <Field label="Dikte IFC (mm)" tip="Dikte van de brickslip zoals geëxporteerd naar IFC. Dit is de uitsteek van de strip op de wand (mm).">
            <input type="number" min={1} step={1} value={settings.brickDepth ?? 20} onChange={(e) => onUpdate({ brickDepth: Number(e.target.value) })}
              style={{ ...inp, width: '100%' }} />
          </Field>
          <Field label="Gewicht (kg/m²)" tip="Gewicht van de steenstrips per vierkante meter (kg/m²). Wordt gebruikt voor de berekening van het maximale paneelgewicht.">
            <input type="number" min={0} step={1} value={mat.brickWeightM2 ?? 40} onChange={(e) => onUpdate({ material: { ...mat, brickWeightM2: Number(e.target.value) } })}
              style={{ ...inp, width: '100%' }} />
          </Field>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Maximale strip hoogte" tip={"Begrenst het steenstrippatroon tot een bepaalde hoogte boven de onderkant van de groep.\nHandig voor een waterslag of als strips niet tot de bovenkant hoeven."} isOpen={isOpen('maxhoogte')} onToggle={() => toggle('maxhoogte')} badge={settings.maxHoogte !== null ? `${settings.maxHoogte} mm` : null}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <input type="checkbox" id="mh-enable"
            checked={settings.maxHoogte !== null}
            onChange={(e) => onUpdate({ maxHoogte: e.target.checked ? 1000 : null })} />
          <label htmlFor="mh-enable" style={{ fontSize: 11, color: '#475569', cursor: 'pointer' }}>
            Inschakelen
          </label>
        </div>
        {settings.maxHoogte !== null && (
          <Field label="Hoogte (mm)">
            <input type="number" min={0} step={10} value={settings.maxHoogte}
              onChange={(e) => onUpdate({ maxHoogte: Number(e.target.value) })}
              style={{ ...inp, width: 80 }} />
          </Field>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Minimale strip hoogte (vanaf lijn)" tip={"Begrenst het steenstrippatroon aan de onderkant.\nStrips onder deze hoogte worden niet getoond.\nHandig als de onderkant van de gevel een ander materiaal heeft of een drempel."} isOpen={isOpen('minhoogte')} onToggle={() => toggle('minhoogte')} badge={settings.minHoogte !== null ? `${settings.minHoogte} mm` : null}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <input type="checkbox" id="minh-enable"
            checked={settings.minHoogte !== null}
            onChange={(e) => onUpdate({ minHoogte: e.target.checked ? 200 : null })} />
          <label htmlFor="minh-enable" style={{ fontSize: 11, color: '#475569', cursor: 'pointer' }}>
            Inschakelen
          </label>
        </div>
        {settings.minHoogte !== null && (
          <Field label="Hoogte (mm)">
            <input type="number" min={0} step={10} value={settings.minHoogte}
              onChange={(e) => onUpdate({ minHoogte: Number(e.target.value) })}
              style={{ ...inp, width: 80 }} />
          </Field>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Penanten" tip={"Een penant is een uitstekende verticale lijst in de gevel.\nGeef de X-positie, breedte, diepte en hoogte op in mm.\n· X positie = afstand van de linker groepsrand\n· Breedte = breedte van het penant\n· Diepte = uitsteek t.o.v. het gevelvlak\n· Hoogte = hoogte van het penant\n· Steenstrips starten symmetrisch vanuit het midden van de voorzijde"} isOpen={isOpen('penanten')} onToggle={() => toggle('penanten')} badge={(settings.penanten ?? []).length > 0 ? `${(settings.penanten ?? []).length}` : null} extra={<button onClick={() => onUpdate({ penanten: [...(settings.penanten ?? []), { id: Date.now(), x: 500, breedte: 400, diepte: 150, hoogte: 2000, hoekprofiel: { enabled: true, dikte: 2, breedteZijkant: 40, breedteVoorkant: 40 } }] })} style={{ fontSize: 11, background: '#e2e8f0', border: 'none', borderRadius: 3, padding: '2px 8px', cursor: 'pointer' }}>+ Toevoegen</button>}>
        <div>
        {(settings.penanten ?? []).length === 0 && (
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Geen penanten</div>
        )}
        {(settings.penanten ?? []).map((p, idx) => (
          <div key={p.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, padding: 6, marginBottom: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>Penant {idx + 1}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  title="Kopieer penant"
                  onClick={() => onUpdate({ penanten: [...(settings.penanten ?? []), { ...p, id: Date.now(), x: (p.x ?? 0) + (p.breedte ?? 400) + 200 }] })}
                  style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: 12 }}>⧉</button>
                <button onClick={() => onUpdate({ penanten: (settings.penanten ?? []).filter((q) => q.id !== p.id) })}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>✕</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
              <Field label="X positie mm" tip={gapCenters?.length ? `Vul een getal in of een uitdrukking.\nBeschikbare variabelen: ${gapCenters.map((v, i) => `hl${i + 1}=${Math.round(v)}`).join(', ')}.\nVoorbeelden: hl1 - 50   of   3390 + 100` : 'X-positie van het penant vanaf de linkerkant van de groep (mm).'}>
                {(() => {
                  const xExpr = p.xExpr ?? String(p.x ?? 0);
                  const evaluated = evalPenantX(xExpr, gapCenters);
                  const isInvalid = isNaN(evaluated);
                  return (
                    <div>
                      <input
                        type="text"
                        value={xExpr}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const num = evalPenantX(raw, gapCenters);
                          onUpdate({ penanten: (settings.penanten ?? []).map((q) => q.id === p.id ? { ...q, xExpr: raw, x: isNaN(num) ? (q.x ?? 0) : num } : q) });
                        }}
                        style={{ ...inp, width: '100%', borderColor: isInvalid ? '#ef4444' : undefined, background: isInvalid ? '#fef2f2' : undefined }}
                      />
                      {(gapCenters?.length > 0 || p.xExpr) && !isInvalid && p.xExpr && p.xExpr !== String(p.x ?? 0) && (
                        <div style={{ fontSize: 9, color: '#16a34a', marginTop: 1 }}>= {evaluated} mm</div>
                      )}
                      {isInvalid && <div style={{ fontSize: 9, color: '#ef4444', marginTop: 1 }}>Ongeldige uitdrukking</div>}
                    </div>
                  );
                })()}
              </Field>
              {[['Breedte', 'breedte'], ['Diepte', 'diepte'], ['Hoogte', 'hoogte']].map(([lbl, key]) => (
                <Field key={key} label={`${lbl} mm`}>
                  <input type="number" min={0} step={10} value={p[key] ?? 0}
                    onChange={(e) => onUpdate({ penanten: (settings.penanten ?? []).map((q) => q.id === p.id ? { ...q, [key]: Number(e.target.value) } : q) })}
                    style={{ ...inp, width: '100%' }} />
                </Field>
              ))}
            </div>

            {(() => {
              const hp = p.hoekprofiel ?? { enabled: false, dikte: 2, breedteZijkant: 40, breedteVoorkant: 40 };
              const updHp = (patch) => onUpdate({ penanten: (settings.penanten ?? []).map((q) => q.id === p.id ? { ...q, hoekprofiel: { ...hp, ...patch } } : q) });
              return (
                <div style={{ marginTop: 6, borderTop: '1px dashed #e2e8f0', paddingTop: 5 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', marginBottom: 4 }}>
                    <input type="checkbox" checked={hp.enabled !== false} onChange={(e) => updHp({ enabled: e.target.checked })} />
                    <span title="Aluminium L-profiel in de binnenhoek aan weerszijden van het penant, vlak tegen de achterkant van het paneel. Verbindt de zijkant met de voorkant.">Aluminium hoekprofiel (L)</span>
                  </label>
                  {hp.enabled !== false && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3 }}>
                      {[
                        ['Dikte', 'dikte', 'Materiaaldikte van het L-profiel (mm).'],
                        ['Br. zijkant', 'breedteZijkant', 'Breedte van de zijkantflens van het L-profiel (mm) — loopt langs de zijkant van het penant.'],
                        ['Br. voorkant', 'breedteVoorkant', 'Breedte van de voorkantflens van het L-profiel (mm) — loopt langs de voorkant van het penant.'],
                      ].map(([lbl, key, tip]) => (
                        <Field key={key} label={`${lbl} mm`} tip={tip}>
                          <input type="number" min={1} step={1} value={hp[key] ?? 0}
                            onChange={(e) => updHp({ [key]: Number(e.target.value) })}
                            style={{ ...inp, width: '100%' }} />
                        </Field>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            {(() => {
              const updP = (patch) => onUpdate({ penanten: (settings.penanten ?? []).map((q) => q.id === p.id ? { ...q, ...patch } : q) });
              const gewichtM2 = p.gewichtM2 ?? 9.4;
              const maxKg = p.maxKg ?? 50;
              const pB = Math.max(1, p.breedte ?? 400);
              const pD = Math.max(1, p.diepte ?? 150);
              const pH = Math.max(1, p.hoogte ?? 2000);
              const omtrekM2perMM = (pB + 2 * pD) / 1e6;
              const kgPerMM = omtrekM2perMM * gewichtM2;
              const maxSectieH = kgPerMM > 0 ? Math.floor(maxKg / kgPerMM) : pH;
              const aantalSecties = kgPerMM > 0 ? Math.ceil(pH / maxSectieH) : 1;
              const sectieH = aantalSecties > 0 ? Math.round(pH / aantalSecties) : pH;
              return (
                <div style={{ marginTop: 6, borderTop: '1px dashed #e2e8f0', paddingTop: 5 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>U-secties</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                    <Field label="Gewicht m² kg" tip="Gewicht van de strips/panelen op het penant per m² oppervlak (kg/m²).">
                      <input type="number" min={1} step={1} value={gewichtM2}
                        onChange={(e) => updP({ gewichtM2: Number(e.target.value) })}
                        style={{ ...inp, width: '100%' }} />
                    </Field>
                    <Field label="Max gewicht kg" tip="Maximaal gewicht per U-sectie (kg). Het penant wordt verticaal opgedeeld in secties die elk dit gewicht niet overschrijden.">
                      <input type="number" min={1} step={5} value={maxKg}
                        onChange={(e) => updP({ maxKg: Number(e.target.value) })}
                        style={{ ...inp, width: '100%' }} />
                    </Field>
                  </div>
                  <div style={{ marginTop: 4, padding: '4px 6px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 3, fontSize: 10, color: '#166534' }}>
                    {aantalSecties} U-sectie{aantalSecties !== 1 ? 's' : ''} · ≈ {sectieH} mm/sectie · ≈ {Math.round(sectieH * kgPerMM)} kg/sectie
                  </div>
                  {(() => {
                    const vl = p.verticaleLat ?? { enabled: true, breedte: 90, dikte: 50 };
                    const updVL = (patch) => updP({ verticaleLat: { ...vl, ...patch } });
                    const latLengthMM = pH;
                    return (
                      <div style={{ marginTop: 6 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', marginBottom: 4 }}>
                          <input type="checkbox" checked={vl.enabled !== false} onChange={(e) => updVL({ enabled: e.target.checked })} />
                          <span title="Verticale houten lat aan weerszijden van de U-sectie, aan de binnenkant van het penant. Loopt over de volledige hoogte van het penant en wordt gebruikt om de U-sectie aan de achterconstructie te bevestigen. Standaard 90×50 mm verduurzaamd zwart.">Verticale bevestigingslat (2×)</span>
                        </label>
                        {vl.enabled !== false && (
                          <>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                              <Field label="Breedte mm" tip="Breedte van de verticale houten lat (mm) — de zijde die langs de binnenwand van het penant loopt.">
                                <input type="number" min={1} step={5} value={vl.breedte ?? 90}
                                  onChange={(e) => updVL({ breedte: Number(e.target.value) })}
                                  style={{ ...inp, width: '100%' }} />
                              </Field>
                              <Field label="Dikte mm" tip="Dikte van de verticale houten lat (mm) — de zijde die haaks op de wand staat.">
                                <input type="number" min={1} step={5} value={vl.dikte ?? 50}
                                  onChange={(e) => updVL({ dikte: Number(e.target.value) })}
                                  style={{ ...inp, width: '100%' }} />
                              </Field>
                            </div>
                            <div style={{ marginTop: 3, padding: '3px 6px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: 3, fontSize: 10, color: '#713f12' }}>
                              2 latten × {latLengthMM} mm = {Math.round(2 * latLengthMM / 1000 * 100) / 100} m¹ per penant
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </div>
        ))}
        </div>
      </CollapsibleSection>

      {(settings.penanten ?? []).length >= 1 && (() => {
        const sortedPenants = [...(settings.penanten ?? [])].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
        const numZones = sortedPenants.length + 1;
        const facadeWidth = groupWidth ?? 0;
        const zoneSettings = settings.zoneSettings ?? [];
        const DEFAULT_ZONE_MAT = { ...DEFAULT_MATERIAL };
        const resolveZone = (zi) => ({ enabled: false, color: settings.color, verband: settings.verband, material: { ...DEFAULT_ZONE_MAT }, maxHoogte: null, ...(zoneSettings[zi] ?? {}) });
        const updZone = (zi, patch) => {
          const cur = [...zoneSettings];
          cur[zi] = { ...resolveZone(zi), ...patch };
          onUpdate({ zoneSettings: cur });
        };
        const copyZoneTo = (srcZi, targets) => {
          const src = resolveZone(srcZi);
          const cur = Array.from({ length: numZones }, (_, i) => resolveZone(i));
          for (const ti of targets) cur[ti] = { ...src };
          onUpdate({ zoneSettings: cur });
        };
        return (
          <CollapsibleSection title={`Zones (${numZones})`} tip={"Zones zijn de vakken links en rechts van elk penant, plus de randzone aan elke zijde van de gevel.\nPer zone kun je een eigen kleur, verband en steenstrip-afmetingen instellen.\n\nAantal zones = aantal penanten + 1"} isOpen={isOpen('zones')} onToggle={() => toggle('zones')}>
            {Array.from({ length: numZones }, (_, zi) => {
              const zoneX1 = zi === 0 ? 0 : (sortedPenants[zi - 1].x ?? 0) + Math.max(1, sortedPenants[zi - 1].breedte ?? 400);
              const zoneX2 = zi === numZones - 1 ? facadeWidth : (sortedPenants[zi].x ?? 0);
              const zs = resolveZone(zi);
              const zm = zs.material ?? DEFAULT_ZONE_MAT;
              const otherZones = Array.from({ length: numZones }, (_, i) => i).filter((i) => i !== zi);
              return (
                <div key={zi} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, padding: 6, marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: zs.enabled ? 6 : 0 }}>
                    <input type="checkbox" id={`zone-en-${zi}`} checked={zs.enabled} onChange={(e) => updZone(zi, { enabled: e.target.checked })} />
                    <label htmlFor={`zone-en-${zi}`} style={{ fontSize: 11, fontWeight: 600, color: '#334155', cursor: 'pointer', flex: 1 }}>
                      Zone {zi + 1}
                      <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 4 }}>
                        ({Math.round(zoneX1)}–{Math.round(zoneX2)} mm, breedte {Math.max(0, Math.round(zoneX2 - zoneX1))} mm)
                      </span>
                    </label>
                    {zs.enabled && (
                      <input type="color" value={zs.color} onChange={(e) => updZone(zi, { color: e.target.value })}
                        style={{ width: 28, height: 22, border: '1px solid #cbd5e1', borderRadius: 3, padding: 1, cursor: 'pointer' }} />
                    )}
                    {numZones > 1 && (
                      <select
                        value=""
                        title="Kopieer instellingen van deze zone naar een andere zone"
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'all') copyZoneTo(zi, otherZones);
                          else if (val !== '') copyZoneTo(zi, [Number(val)]);
                        }}
                        style={{ ...inp, fontSize: 10, paddingRight: 4, color: '#475569', maxWidth: 72 }}
                      >
                        <option value="" disabled>→ kopieer</option>
                        {otherZones.map((ti) => (
                          <option key={ti} value={ti}>→ Zone {ti + 1}</option>
                        ))}
                        <option value="all">→ Alle zones</option>
                      </select>
                    )}
                  </div>
                  {zs.enabled && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <Field label="Metselverband" tip="Verband voor deze zone.">
                        <select value={zs.verband} onChange={(e) => updZone(zi, { verband: e.target.value })} style={inp}>
                          <option value="halfsteens">Halfsteens</option>
                          <option value="tegelverband">Tegelverband</option>
                          <option value="staand_tegelverband">Staand tegelverband</option>
                        </select>
                      </Field>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                        {[['Lengte mm', 'steenL'], ['Hoogte mm', 'steenH'], ['Lintvoeg mm', 'lint'], ['Stootvoeg mm', 'stoot']].map(([lbl, key]) => (
                          <Field key={key} label={lbl}>
                            <input type="number" min={1} step={1} value={zm[key] ?? DEFAULT_MATERIAL[key]}
                              onChange={(e) => updZone(zi, { material: { ...zm, [key]: Number(e.target.value) } })}
                              style={{ ...inp, width: '100%' }} />
                          </Field>
                        ))}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="checkbox" id={`zone-mh-${zi}`} checked={zs.maxHoogte !== null}
                          onChange={(e) => updZone(zi, { maxHoogte: e.target.checked ? 1000 : null })} />
                        <label htmlFor={`zone-mh-${zi}`} style={{ fontSize: 11, color: '#475569', cursor: 'pointer' }}>Max strip hoogte</label>
                        {zs.maxHoogte !== null && (
                          <input type="number" min={0} step={10} value={zs.maxHoogte}
                            onChange={(e) => updZone(zi, { maxHoogte: Number(e.target.value) })}
                            style={{ ...inp, width: 60 }} />
                        )}
                        {zs.maxHoogte !== null && <span style={{ fontSize: 10, color: '#94a3b8' }}>mm</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </CollapsibleSection>
        );
      })()}

      {(() => {
        const zw = settings.zetwerk ?? {};
        const upd = (patch) => onUpdate({ zetwerk: { ...(settings.zetwerk ?? {}), ...patch } });
        return (
          <CollapsibleSection title="Zetwerk rondom openingen" tip={"Aluminium of stalen randprofiel rondom ramen en deuren.\nWordt in 2D als grijs frame getekend rondom elke sparing.\nDe steenstrips worden automatisch op afstand gehouden.\n\n· Breedte = breedte van het profiel\n· Offset H = ruimte tussen opening en profiel (horizontaal)\n· Offset V = ruimte boven/onder de opening\n· Strip gap = extra vrije ruimte tussen profiel en strips"} isOpen={isOpen('zetwerk')} onToggle={() => toggle('zetwerk')} badge={zw.enabled ? 'Aan' : 'Uit'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <input type="checkbox" id="zw-enable" checked={zw.enabled ?? false}
                onChange={(e) => upd({ enabled: e.target.checked })} />
              <label htmlFor="zw-enable" style={{ fontSize: 11, color: '#475569', cursor: 'pointer' }}>Inschakelen</label>
            </div>
            {zw.enabled && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                {[
                  ['Breedte', 'breedte', 50, 'Breedte van het zetwerk profiel (mm).'],
                  ['Dikte', 'dikte', 2, 'Materiaaldikte van het zetwerk profiel (mm).'],
                  ['Offset H', 'offsetH', 0, 'Horizontale ruimte tussen de kozijnrand en het profiel (mm).'],
                  ['Offset V', 'offsetV', 0, 'Verticale ruimte boven en onder de kozijnrand (mm).'],
                  ['Strip gap', 'stripOffset', 5, 'Extra ruimte die de steenstrips vrijhouden van het profiel (mm).'],
                ].map(([lbl, key, def, tip]) => (
                  <Field key={key} label={`${lbl} mm`} tip={tip}>
                    <input type="number" min={0} step={1} value={zw[key] ?? def}
                      onChange={(e) => upd({ [key]: Number(e.target.value) })}
                      style={{ ...inp, width: '100%' }} />
                  </Field>
                ))}
              </div>
            )}
          </CollapsibleSection>
        );
      })()}

      {(() => {
        const pan = settings.panelen ?? {};
        const upd = (patch) => onUpdate({ panelen: { ...(settings.panelen ?? {}), ...patch } });
        return (
          <CollapsibleSection title="Panelen (basisplaat)" tip={"Verdeelt de geveloppervlakte in draagsysteem-panelen.\nDe panelen vormen de achterste laag waarop de brickslips worden gemonteerd.\nDe indeling volgt de steenstripvoegen voor optimaal snijverlies.\n\n· Breedte = maximale breedte van een basispaneel\n· Hoogte = maximale hoogte van een basispaneel"} isOpen={isOpen('panelen')} onToggle={() => toggle('panelen')} badge={pan.enabled ? 'Aan' : 'Uit'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <input type="checkbox" id="pan-enable" checked={pan.enabled ?? false}
                onChange={(e) => upd({ enabled: e.target.checked })} />
              <label htmlFor="pan-enable" style={{ fontSize: 11, color: '#475569', cursor: 'pointer' }}>Inschakelen</label>
            </div>
            {pan.enabled && (() => {
              const brickW = (settings.material ?? DEFAULT_MATERIAL).brickWeightM2 ?? 40;
              const panW = pan.gewichtM2 ?? 9.4;
              const maxKg = pan.maxKg ?? 50;
              const totalW = Math.max(0.001, brickW + panW);
              const maxM2 = Math.round(maxKg / totalW * 100) / 100;
              const effPanel = computeEffectiveBasePanel(pan, brickW);
              const effectiveH = effPanel.height;
              const inputH = Math.max(100, pan.hoogte ?? 1200);
              const hLimited = effectiveH < inputH;
              return (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                    <Field label="Breedte mm" tip="Maximale breedte van het basispaneel (mm). Standaard 3005 mm.">
                      <input type="number" min={100} step={50} value={pan.breedte ?? 3005}
                        onChange={(e) => upd({ breedte: Number(e.target.value) })}
                        style={{ ...inp, width: '100%' }} />
                    </Field>
                    <Field label="Hoogte mm" tip="Maximale hoogte van het basispaneel (mm). Standaard 1200 mm.">
                      <input type="number" min={100} step={50} value={pan.hoogte ?? 1200}
                        onChange={(e) => upd({ hoogte: Number(e.target.value) })}
                        style={{ ...inp, width: '100%' }} />
                    </Field>
                    <Field label="Dikte mm" tip="Dikte van het basispaneel (mm). Standaard 18 mm.">
                      <input type="number" min={1} step={1} value={pan.dikte ?? 8}
                        onChange={(e) => upd({ dikte: Number(e.target.value) })}
                        style={{ ...inp, width: '100%' }} />
                    </Field>
                    <Field label="Gewicht (kg/m²)" tip="Gewicht van het basispaneel per vierkante meter (kg/m²). Standaard 11 kg/m².">
                      <input type="number" min={0} step={0.1} value={pan.gewichtM2 ?? 9.4}
                        onChange={(e) => upd({ gewichtM2: Number(e.target.value) })}
                        style={{ ...inp, width: '100%' }} />
                    </Field>
                    <Field label="Max gewicht (kg)" tip="Maximaal gewicht per paneel inclusief brickslips (kg). Bepaalt de maximale paneeloppervlakte en paneel hoogte.">
                      <input type="number" min={1} step={5} value={pan.maxKg ?? 50}
                        onChange={(e) => upd({ maxKg: Number(e.target.value) })}
                        style={{ ...inp, width: '100%' }} />
                    </Field>
                  </div>
                  <div style={{ fontSize: 11, color: hLimited ? '#dc2626' : '#64748b', marginTop: 4 }}>
                    → max {maxM2} m²/paneel · eff. hoogte {effectiveH} mm{hLimited ? ' (gewicht begrensd)' : ''}
                  </div>
                </>
              );
            })()}
          </CollapsibleSection>
        );
      })()}

      {(() => {
        const lat = settings.latten ?? {};
        const upd = (patch) => onUpdate({ latten: { ...(settings.latten ?? {}), ...patch } });
        const selectedArtikelId = (settings.lattenArtikelen ?? [])[0] ?? null;
        const selectedArtikel = selectedArtikelId ? BATTEN_CATALOG.find((a) => a.id === selectedArtikelId) : null;
        const breedte = selectedArtikel ? selectedArtikel.breedteMM : (lat.breedte ?? 50);
        const dikte = selectedArtikel ? selectedArtikel.dikteMM : (lat.dikte ?? 28);
        const brandColors = { 'B-s1,d0': '#dc2626', 'D-s2,d0': '#2563eb' };
        return (
          <CollapsibleSection title="Achterconstructie hout" tip={"Houten latten als dragerstructuur achter de basisplaat.\nHorizontale latten: maximaal interval in hoogte, altijd boven en onder ramen/deuren.\nVerticale latten: op paneelgrenzen (links, midden, rechts).\n\nWanneer een artikel is geselecteerd in 'Latten artikelkeuze' worden breedte en dikte automatisch overgenomen.\n\n· Breedte = breedte van de lat (zichtbaar in gevelaanzicht)\n· Dikte = diepte van de lat (loodrecht op gevel)\n· Max interval = max. hartafstand tussen horizontale latten"} isOpen={isOpen('latten')} onToggle={() => toggle('latten')} badge={lat.enabled ? 'Aan' : 'Uit'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <input type="checkbox" id="lat-enable" checked={lat.enabled ?? false}
                onChange={(e) => upd({ enabled: e.target.checked })} />
              <label htmlFor="lat-enable" style={{ fontSize: 11, color: '#475569', cursor: 'pointer' }}>Inschakelen</label>
            </div>
            {lat.enabled && (
              <>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  {['horizontaal', 'verticaal'].map((r) => (
                    <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', color: '#334155' }}>
                      <input type="radio" name={`lat-richting-${groupId}`} value={r}
                        checked={(lat.richting ?? 'horizontaal') === r}
                        onChange={() => upd({ richting: r })} />
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </label>
                  ))}
                </div>

                {selectedArtikel ? (
                  <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 5, padding: '6px 8px', marginBottom: 4 }}>
                    <div style={{ fontSize: 9.5, color: '#64748b', marginBottom: 3 }}>Afmetingen uit geselecteerd artikel:</div>
                    <div style={{ fontWeight: 700, fontSize: 10.5, color: '#1e293b' }}>{selectedArtikel.naam}</div>
                    <div style={{ fontSize: 9.5, color: '#475569', marginTop: 1 }}>{selectedArtikel.afmetingen}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ background: brandColors[selectedArtikel.brandklasse] ?? '#64748b', color: '#fff', borderRadius: 3, padding: '1px 5px', fontSize: 9, fontWeight: 600 }}>{selectedArtikel.brandklasse}</span>
                      <span style={{ fontSize: 10, color: '#334155' }}>Breedte <strong>{breedte} mm</strong></span>
                      <span style={{ fontSize: 10, color: '#334155' }}>Dikte <strong>{dikte} mm</strong></span>
                      <span style={{ fontSize: 9.5, color: '#0f172a', fontWeight: 600, marginLeft: 'auto' }}>€ {selectedArtikel.prijsM1.toFixed(3)}/m¹</span>
                    </div>
                    <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 3 }}>Selecteer een ander artikel in 'Latten artikelkeuze' om te wijzigen.</div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                    <Field label="Breedte mm" tip="Breedte van de houten lat (mm). Dit is de zichtbare maat in het gevelaanzicht.">
                      <input type="number" min={10} step={5} value={lat.breedte ?? 50}
                        onChange={(e) => upd({ breedte: Number(e.target.value) })}
                        style={{ ...inp, width: '100%' }} />
                    </Field>
                    <Field label="Dikte mm" tip="Dikte van de houten lat loodrecht op de gevel (mm).">
                      <input type="number" min={5} step={5} value={lat.dikte ?? 28}
                        onChange={(e) => upd({ dikte: Number(e.target.value) })}
                        style={{ ...inp, width: '100%' }} />
                    </Field>
                  </div>
                )}

                {(lat.richting ?? 'horizontaal') === 'horizontaal' && (
                  <div style={{ marginTop: 3 }}>
                    <Field label="Max interval mm" tip="Maximale hartafstand tussen horizontale latten (mm). Standaard 400 mm.">
                      <input type="number" min={50} step={50} value={lat.maxInterval ?? 400}
                        onChange={(e) => upd({ maxInterval: Number(e.target.value) })}
                        style={{ ...inp, width: '100%' }} />
                    </Field>
                  </div>
                )}
              </>
            )}
          </CollapsibleSection>
        );
      })()}

      {(() => {
        const selectedId = (settings.lattenArtikelen ?? [])[0] ?? null;
        const select = (id) => onUpdate({ lattenArtikelen: id === selectedId ? [] : [id] });
        const brandColors = { 'B-s1,d0': '#dc2626', 'D-s2,d0': '#2563eb' };
        return (
          <CollapsibleSection
            title="Latten artikelkeuze"
            tip={"Selecteer één artikel uit de Mulder's Houtimport prijslijst (15-04-2026).\nHet gekozen artikel bepaalt automatisch de breedte en dikte in 'Achterconstructie hout'.\nKlik nogmaals om de selectie op te heffen.\n\n· Rood label = Brandklasse B-s1,d0 (hogere bescherming)\n· Blauw label = Brandklasse D-s2,d0"}
            isOpen={isOpen('lattenArtikelen')}
            onToggle={() => toggle('lattenArtikelen')}
            badge={selectedId ? '1 gekozen' : null}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {BATTEN_CATALOG.map((art) => {
                const checked = art.id === selectedId;
                const bColor = brandColors[art.brandklasse] ?? '#64748b';
                return (
                  <label key={art.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 10,
                    cursor: 'pointer', color: checked ? '#0f172a' : '#475569',
                    background: checked ? '#f0fdf4' : 'transparent',
                    border: `1px solid ${checked ? '#86efac' : '#e2e8f0'}`,
                    borderRadius: 4, padding: '4px 6px',
                  }}>
                    <input type="radio" name={`lat-artikel-${groupId}`} checked={checked}
                      onChange={() => select(art.id)}
                      style={{ marginTop: 2, flexShrink: 0, accentColor: '#16a34a' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 10.5, color: '#1e293b', lineHeight: 1.3 }}>{art.naam}</div>
                      <div style={{ color: '#64748b', fontSize: 9.5, marginTop: 1 }}>{art.afmetingen}</div>
                      <div style={{ color: '#64748b', fontSize: 9, marginTop: 1 }}>{art.behandeling}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                        <span style={{ background: bColor, color: '#fff', borderRadius: 3, padding: '1px 5px', fontSize: 9, fontWeight: 600 }}>{art.brandklasse}</span>
                        <span style={{ color: '#94a3b8', fontSize: 9 }}>{art.toepassing}</span>
                        <span style={{ marginLeft: 'auto', color: '#0f172a', fontWeight: 600, fontSize: 9.5 }}>€ {art.prijsM1.toFixed(3)}/m¹</span>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </CollapsibleSection>
        );
      })()}

      {(() => {
        const vis = settings.layerVisibility ?? {};
        const updVis = (patch) => onUpdate({ layerVisibility: { ...(settings.layerVisibility ?? {}), ...patch } });
        return (
          <CollapsibleSection title="Laagzichtbaarheid 2D" tip={"Schakel lagen aan of uit in het 2D gevelaanzicht.\nEen laag uitzetten verbergt deze in de 2D visualisatie maar beïnvloedt de instellingen niet.\n\n· Steenstrips = de brickslip-stenen op de gevel\n· Zetwerk = het randprofiel rondom sparingen\n· Panelen = de draagpanelen achter de strips\n· Latten = de houten achterconstructie-latten"} isOpen={isOpen('lagen')} onToggle={() => toggle('lagen')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[
                ['strips', 'Steenstrips', 'De brickslip-steenstrips op de gevel zichtbaar tonen.'],
                ['zetwerk', 'Zetwerk', 'Het aluminium of stalen randprofiel rondom sparingen tonen.'],
                ['panelen', 'Panelen', 'De draagpanelen achter de brickslips tonen.'],
                ['latten', 'Latten', 'De houten achterconstructie-latten tonen.'],
              ].map(([key, label, tip]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', color: '#334155' }}>
                  <input type="checkbox"
                    checked={vis[key] !== false}
                    onChange={(e) => updVis({ [key]: e.target.checked })} />
                  {label}
                  <InfoIcon tip={tip} />
                </label>
              ))}
            </div>
          </CollapsibleSection>
        );
      })()}
    </div>
  );
}

function Tooltip({ text, children, block }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const Tag = block ? 'div' : 'span';
  return (
    <Tag
      style={{ position: 'relative', display: block ? 'block' : 'inline-flex', alignItems: 'center' }}
      onMouseEnter={(e) => { setVisible(true); setPos({ x: e.clientX, y: e.clientY }); }}
      onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div style={{
          position: 'fixed',
          left: pos.x + 12,
          top: pos.y + 4,
          zIndex: 9999,
          background: '#0f172a',
          color: '#e2e8f0',
          fontSize: 11,
          lineHeight: 1.5,
          padding: '6px 10px',
          borderRadius: 5,
          maxWidth: 260,
          pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          whiteSpace: 'pre-wrap',
        }}>
          {text}
        </div>
      )}
    </Tag>
  );
}

function InfoIcon({ tip }) {
  return (
    <Tooltip text={tip}>
      <span style={{ marginLeft: 4, fontSize: 10, color: '#94a3b8', cursor: 'default', fontWeight: 700, border: '1px solid #cbd5e1', borderRadius: '50%', width: 13, height: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>i</span>
    </Tooltip>
  );
}

function SectionLabel({ children, tip }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: '#475569' }}>
      {children}
      {tip && <InfoIcon tip={tip} />}
    </div>
  );
}

function Field({ label, tip, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12 }}>
      <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: 3 }}>
        {label}
        {tip && <InfoIcon tip={tip} />}
      </span>
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
  const [loadProgress, setLoadProgress] = useState({ current: 0, total: 0 });
  const [loadLogs, setLoadLogs] = useState([]);
  const loadLogsRef = useRef([]);
  const [loadError, setLoadError] = useState(null);
  const [savedFileInfo, setSavedFileInfo] = useState(null);
  const [savedHandle, setSavedHandle] = useState(null);
  const [ifcFileName, setIfcFileName] = useState(null);
  const [showPattern, setShowPattern] = useState(true);
  const [viewMode, setViewMode] = useState('3d');
  const [pendingFile, setPendingFile] = useState(null);
  const [wallTypes, setWallTypes] = useState([]);
  const [selectedTypes, setSelectedTypes] = useState(new Set());
  const [similarSuggestions, setSimilarSuggestions] = useState(null);
  const [groupLinks, setGroupLinks] = useState({});
  const [gridLines, setGridLines] = useState([]);
  const [showGridLines, setShowGridLines] = useState(true);
  const [showCenterLines, setShowCenterLines] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const { get: getSettings, update: updateSettings, initColor, map: settingsMap, setMap: setSettingsMap } = useGroupSettings();

  const _gidRef = useRef(1);
  const _colorIdxRef = useRef(0);
  const newGid = useCallback(() => `G${_gidRef.current++}`, []);
  const nextColor = useCallback(() => GROUP_COLORS[_colorIdxRef.current++ % GROUP_COLORS.length], []);

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
      const withOrigin = walls.filter((w) => w.wallOrigin);
      if (!withOrigin.length) continue;
      const facadeData = buildFullGroupFacadePattern(walls, s.material ?? DEFAULT_MATERIAL, s.verband ?? DEFAULT_VERBAND, s.maxHoogte, s.zetwerk, s.minHoogte);
      if (!facadeData) continue;
      let { rows } = facadeData;
      if (s.penanten?.length) {
        const brickD3d = s.brickDepth ?? 20;
        rows = rows.map((row) => ({
          ...row,
          pieces: row.pieces.flatMap((piece) => {
            let ps = [piece];
            for (const p of s.penanten) {
              const pX = p.x ?? 0;
              const pB = Math.max(1, p.breedte ?? 400);
              const maskStart = pX + brickD3d;
              const maskEnd = pX + pB - brickD3d;
              if (maskEnd <= maskStart) continue;
              ps = ps.flatMap((q) => {
                const qs = q.start, qe = q.start + q.length;
                if (qe <= maskStart || qs >= maskEnd) return [q];
                const out = [];
                if (qs < maskStart) out.push({ ...q, length: maskStart - qs });
                if (qe > maskEnd) out.push({ ...q, start: maskEnd, length: qe - maskEnd });
                return out;
              });
            }
            return ps;
          }),
        }));
      }
      result[group.id] = {
        rows,
        groupMinX: facadeData.groupMinX,
        groupMinH: facadeData.groupMinH,
        refWallOrigin: withOrigin[0].wallOrigin,
      };
    }
    return result;
  }, [groups, getSettings, wallMap, showPattern]);

  async function startScan(file, handle) {
    setLoadStatus('scanning');
    setLoadError(null);
    loadLogsRef.current = [];
    setLoadLogs([]);
    const addLog = (msg) => {
      const entry = `[${new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] ${msg}`;
      loadLogsRef.current = [...loadLogsRef.current.slice(-49), entry];
      setLoadLogs([...loadLogsRef.current]);
    };
    addLog(`Bestand: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
    addLog('web-ifc engine laden…');
    try {
      const types = await scanIfcWallTypes(file);
      addLog(`✓ ${types.length} wandtype(n) gevonden`);
      if (!types.length) throw new Error('Geen wanden gevonden in IFC-bestand');
      setPendingFile(file);
      setWallTypes(types);
      setSelectedTypes(new Set());
      setLoadStatus('selecting');
      if (handle) {
        saveFileHandle(handle).then(() => setSavedHandle({ handle, savedAt: Date.now(), name: file.name })).catch(() => {});
      } else {
        saveIfcFile(file).then(() => setSavedFileInfo({ name: file.name, size: file.size, savedAt: Date.now(), file })).catch(() => {});
      }
    } catch (err) {
      addLog(`✗ Fout: ${err.message}`);
      setLoadError(err.message);
      setLoadStatus('error');
    }
  }

  async function handlePickFile() {
    if (supportsFileSystemAccess()) {
      try {
        const [handle] = await window.showOpenFilePicker({ types: [{ description: 'IFC bestanden', accept: { 'application/x-step': ['.ifc'] } }], multiple: false });
        const file = await handle.getFile();
        await startScan(file, handle);
      } catch (err) {
        if (err.name !== 'AbortError') { setLoadError(err.message); setLoadStatus('error'); }
      }
    } else {
      document.getElementById('ifc-file-input').click();
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    await startScan(file, null);
  }

  async function loadFromStorage() {
    if (savedHandle?.handle) {
      try {
        const perm = await savedHandle.handle.queryPermission({ mode: 'read' });
        let file;
        if (perm === 'granted') {
          file = await savedHandle.handle.getFile();
        } else {
          const req = await savedHandle.handle.requestPermission({ mode: 'read' });
          if (req !== 'granted') return;
          file = await savedHandle.handle.getFile();
        }
        await startScan(file, savedHandle.handle);
      } catch { setLoadError('Geen toegang tot bestand'); setLoadStatus('error'); }
    } else if (savedFileInfo?.file) {
      await startScan(savedFileInfo.file, null);
    }
  }

  function forgetSavedFile() {
    deleteSavedIfcFile().catch(() => {});
    deleteFileHandle().catch(() => {});
    setSavedFileInfo(null);
    setSavedHandle(null);
  }

  async function confirmImport() {
    if (!pendingFile) return;
    setLoadStatus('loading');
    setLoadProgress({ current: 0, total: 0 });
    loadLogsRef.current = [];
    setLoadLogs([]);
    const addLog = (msg) => {
      const entry = `[${new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] ${msg}`;
      loadLogsRef.current = [...loadLogsRef.current.slice(-49), entry];
      setLoadLogs([...loadLogsRef.current]);
    };
    addLog(`Bestand: ${pendingFile.name} (${(pendingFile.size / 1024 / 1024).toFixed(1)} MB)`);
    try {
      const filter = selectedTypes.size < wallTypes.length ? selectedTypes : null;
      const cacheKey = `${pendingFile.name}|${pendingFile.size}|${filter ? [...filter].sort().join(',') : 'all'}`;

      addLog(filter ? `Filter: ${[...filter].join(', ')}` : 'Alle wandtypen worden geladen');
      addLog('Cache controleren…');

      let walls = null;
      try {
        const cached = await loadParsedWalls(cacheKey, pendingFile.size);
        if (cached) {
          addLog(`✓ Cache gevonden! ${cached.length} wanden direct geladen`);
          walls = cached;
          setLoadProgress({ current: cached.length, total: cached.length });
        }
      } catch { }

      if (!walls) {
        addLog('Geen cache — IFC parsen gestart…');
        walls = await parseIfc(pendingFile, filter, (p) => {
          if (p.log) { addLog(p.log); return; }
          setLoadProgress({ current: p.current, total: p.total });
          if (p.total > 0 && p.current === 1) addLog(`${p.total} wanden gevonden, verwerken gestart…`);
          if (p.total > 0 && p.current === p.total) addLog(`Alle ${p.total} wanden verwerkt`);
        });
        addLog(`Resultaat opslaan in cache…`);
        saveParsedWalls(cacheKey, pendingFile.size, walls).catch(() => {});
      }

      if (!walls.length) throw new Error('Geen wanden gevonden met de geselecteerde types');
      addLog(`✓ ${walls.length} wanden geladen, aangrenzendheid detecteren…`);
      const adj = detectAdjacencies(walls);
      addLog(`✓ Klaar — ${walls.length} wanden, ${Object.keys(adj).length} adjacenties`);
      setAllWalls(walls);
      setAdjacencies(adj);
      setGroups([]);
      setSelectedWallIds(new Set());
      setActiveGroupId(null);
      setIfcFileName(pendingFile.name.replace(/\.ifc$/i, ''));
      try {
        const gl = await parseIfcGridLines(pendingFile);
        setGridLines(gl);
        if (gl.length) addLog(`✓ ${gl.length} stramienlijnen geïmporteerd`);
      } catch { setGridLines([]); }
      setLoadStatus('loaded');
      setPendingFile(null);
      setWallTypes([]);
      _colorIdxRef.current = 0;
    } catch (err) {
      addLog(`✗ Fout: ${err.message}`);
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

  useEffect(() => {
    if (supportsFileSystemAccess()) {
      loadFileHandle().then((rec) => {
        if (rec?.handle) setSavedHandle(rec);
      }).catch(() => {});
    } else {
      loadSavedIfcFile().then((rec) => {
        if (rec) setSavedFileInfo({ name: rec.file.name, size: rec.file.size, savedAt: rec.savedAt, file: rec.file });
      }).catch(() => {});
    }
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
    _colorIdxRef.current = 0;
    const newGroups = comps.map((ids, idx) => {
      const gid = newGid();
      const color = nextColor();
      initColor(gid, color, `Groep ${idx + 1}`);
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
    const uniqueNames = new Set(groups.map((g) => getSettings(g.id).name));
    const groupName = `Groep ${uniqueNames.size + 1}`;
    initColor(gid, color, groupName);
    const newGroup = { id: gid, wallIds: sortWallsInComponent(ids, allWalls, adjacencies) };
    const updatedGroups = [...groups, newGroup];
    setGroups(updatedGroups);
    setSelectedWallIds(new Set());
    setActiveGroupId(gid);

    const refWalls = ids.map((id) => allWalls.find((w) => w.expressID === id)).filter(Boolean);
    const suggestions = findSimilarGroups(refWalls, allWalls, updatedGroups, adjacencies);
    if (suggestions.length > 0) {
      const linkId = `L${gid}`;
      setGroupLinks((prev) => ({ ...prev, [gid]: linkId }));
      setSimilarSuggestions({ sourceGroupId: gid, sourceColor: color, linkId, groups: suggestions });
    }
  }

  function syncToLinked(sourceGroupId) {
    const linkId = groupLinks[sourceGroupId];
    if (!linkId) return;
    const srcSettings = getSettings(sourceGroupId);
    const linkedIds = groups.filter((g) => groupLinks[g.id] === linkId && g.id !== sourceGroupId).map((g) => g.id);
    for (const id of linkedIds) {
      updateSettings(id, { name: srcSettings.name, verband: srcSettings.verband, material: { ...srcSettings.material }, brickDepth: srcSettings.brickDepth, maxHoogte: srcSettings.maxHoogte, penanten: srcSettings.penanten ? [...srcSettings.penanten] : [], zetwerk: srcSettings.zetwerk ? { ...srcSettings.zetwerk } : undefined, panelen: srcSettings.panelen ? { ...srcSettings.panelen } : undefined, latten: srcSettings.latten ? { ...srcSettings.latten } : undefined, lattenArtikelen: srcSettings.lattenArtikelen ? [...srcSettings.lattenArtikelen] : [] });
    }
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

  function handleSaveProject() {
    const projectData = {
      _version: 1,
      _savedAt: new Date().toISOString(),
      ifcFileName: ifcFileName ?? null,
      groups,
      groupLinks,
      groupSettings: settingsMap,
    };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = ifcFileName ? ifcFileName.replace(/\.ifc$/i, '') : 'project';
    a.download = `${baseName}_gevelbekleding.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleLoadProject(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data._version || !Array.isArray(data.groups)) {
          alert('Ongeldig projectbestand.');
          return;
        }
        setGroups(data.groups ?? []);
        setGroupLinks(data.groupLinks ?? {});
        setSettingsMap(data.groupSettings ?? {});
        setGroupsHistory([]);
        setActiveGroupId(null);
        setSimilarSuggestions(null);
        if (data.ifcFileName && data.ifcFileName !== ifcFileName) {
          alert(`Project geladen.\n\nDit project hoort bij IFC-bestand: "${data.ifcFileName}".\nZorg dat dit bestand is geladen om de elementen correct te zien.`);
        }
      } catch {
        alert('Fout bij laden van projectbestand.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function handleExport() {
    const exportGroups = groups.map((group) => {
      const s = getSettings(group.id);
      const walls = group.wallIds.map((id) => wallMap[id]).filter(Boolean);
      const gAdj = adjacencies.filter((a) => group.wallIds.includes(a.wallIdA) && group.wallIds.includes(a.wallIdB));
      const rows = buildGroupPattern(walls, gAdj, s.material ?? DEFAULT_MATERIAL, s.verband ?? DEFAULT_VERBAND, 'all');

      const mat = s.material ?? DEFAULT_MATERIAL;
      const vis = s.layerVisibility ?? {};
      const withOrigin = walls.filter((w) => w.wallOrigin);
      const groupMinX = withOrigin.length ? Math.min(...withOrigin.map((w) => w.wallOrigin.lengthStart)) : 0;
      const groupMinH = withOrigin.length ? Math.min(...withOrigin.map((w) => w.wallOrigin.heightStart)) : 0;
      const refWallOrigin = withOrigin[0]?.wallOrigin ?? null;

      const facadeDataRaw = buildFullGroupFacadePattern(walls, mat, s.verband ?? DEFAULT_VERBAND, s.maxHoogte, s.zetwerk, s.minHoogte);
      let facadeData = facadeDataRaw;
      if (facadeDataRaw && s.penanten?.length) {
        const brickD = s.brickDepth ?? 20;
        const maskedRows = facadeDataRaw.rows.map((row) => ({
          ...row,
          pieces: row.pieces.flatMap((piece) => {
            let ps = [piece];
            for (const p of s.penanten) {
              const pX = p.x ?? 0;
              const pB = Math.max(1, p.breedte ?? 400);
              const maskStart = pX + brickD;
              const maskEnd = pX + pB - brickD;
              if (maskEnd <= maskStart) continue;
              ps = ps.flatMap((q) => {
                const qs = q.start, qe = q.start + q.length;
                if (qe <= maskStart || qs >= maskEnd) return [q];
                const out = [];
                if (qs < maskStart) out.push({ ...q, length: maskStart - qs });
                if (qe > maskEnd) out.push({ ...q, start: maskEnd, length: qe - maskEnd });
                return out;
              });
            }
            return ps;
          }),
        }));
        facadeData = { ...facadeDataRaw, rows: maskedRows };
      }

      let panels = [];
      let lattenData = [];

      const _artId = (s.lattenArtikelen ?? [])[0] ?? null;
      const _art = _artId ? BATTEN_CATALOG.find((a) => a.id === _artId) : null;
      const latDikteEff = _art ? _art.dikteMM : (s.latten?.dikte ?? 28);

      if (facadeData) {
        const { rows: facRows, groupWidth, groupHeight, groupOpenings } = facadeData;

        if (s.panelen?.enabled && vis.panelen !== false) {
          const basePanel = computeEffectiveBasePanel(s.panelen, (s.material ?? {}).brickWeightM2 ?? 40);
          const globalPieces = facRows.flatMap((row) => row.pieces.map((p) => ({ x: p.start, width: p.length })));
          const openingsForZones = groupOpenings.map((op) => ({ id: `op_${op.x}_${op.y}`, x: op.x, y: op.y, width: op.width, height: op.height, polyPts: op.polyPts ?? null }));
          const penBrickD = s.brickDepth ?? 20;
          const penantOpenings = (s.penanten ?? []).map((pen, pi) => {
            const px = pen.x ?? 0;
            const pw = Math.max(1, pen.breedte ?? 400);
            return { id: `pen_${pi}`, x: px, y: 0, width: pw, height: groupHeight, polyPts: null };
          });
          const zones = buildFacadeZones(groupWidth, groupHeight, [...openingsForZones, ...penantOpenings]);
          for (const zone of zones) {
            const res = panelizeZone(zone, facRows, globalPieces, mat.steenH, basePanel);
            if (res.ok) panels.push(...res.panels);
          }
          if (s.maxHoogte != null && s.maxHoogte > 0) {
            panels = panels.map((panel) => {
              if (panel.y >= s.maxHoogte) return null;
              if (panel.y + panel.height > s.maxHoogte) return { ...panel, height: s.maxHoogte - panel.y };
              return panel;
            }).filter(Boolean);
          }
        }

        if (s.latten?.enabled && vis.latten !== false) {
          const latBreedte = Math.max(5, _art ? _art.breedteMM : (s.latten.breedte ?? 50));
          const maxInterval = Math.max(50, s.latten.maxInterval ?? 400);
          const richting = s.latten.richting ?? 'horizontaal';

          if (richting === 'horizontaal') {
            const rowTops = new Set([0, Math.round(groupHeight)]);
            for (const row of facRows) { rowTops.add(Math.round(row.y)); rowTops.add(Math.round(row.y + mat.steenH)); }
            const forced = new Set([0, Math.round(groupHeight)]);
            for (const op of groupOpenings) { forced.add(Math.round(op.y)); forced.add(Math.round(op.y + op.height)); }
            const snapToRow = (y) => [...rowTops].sort((a, b) => Math.abs(a - y) - Math.abs(b - y))[0] ?? y;
            const positions = new Set([...forced]);
            const sortedF = [...positions].sort((a, b) => a - b);
            for (let i = 0; i < sortedF.length - 1; i++) {
              let cur = sortedF[i];
              const next = sortedF[i + 1];
              while (next - cur > maxInterval + 1) {
                const mid = cur + maxInterval;
                const snapped = snapToRow(mid);
                positions.add(snapped);
                cur = snapped > cur ? snapped : mid;
              }
            }
            const openingBottomYs = new Set(groupOpenings.map((op) => Math.round(op.y)));
            const openingTopYs    = new Set(groupOpenings.map((op) => Math.round(op.y + op.height)));
            const gH = Math.round(groupHeight);
            const clipLatSegs = (latY, latH) => {
              let segs = [{ x: 0, width: groupWidth }];
              for (const op of groupOpenings) {
                if (op.y + op.height <= latY || op.y >= latY + latH) continue;
                segs = segs.flatMap((seg) => {
                  const sx1 = seg.x, sx2 = seg.x + seg.width;
                  const ox1 = op.x, ox2 = op.x + op.width;
                  if (ox2 <= sx1 || ox1 >= sx2) return [seg];
                  const parts = [];
                  if (ox1 > sx1 + 5) parts.push({ x: sx1, width: ox1 - sx1 });
                  if (ox2 < sx2 - 5) parts.push({ x: ox2, width: sx2 - ox2 });
                  return parts;
                });
              }
              return segs.filter((s) => s.width > 10);
            };
            lattenData = [...positions].sort((a, b) => a - b).flatMap((y) => {
              const yr = Math.round(y);
              let latY;
              if (yr === 0) latY = 0;
              else if (yr === gH) latY = yr - latBreedte;
              else if (openingBottomYs.has(yr)) latY = yr - latBreedte;
              else if (openingTopYs.has(yr)) latY = yr;
              else latY = yr - latBreedte / 2;
              return clipLatSegs(latY, latBreedte).map((seg) => ({ richting: 'horizontaal', x: seg.x, y: latY, width: seg.width, height: latBreedte }));
            });
          } else {
            const xPositions = new Set([0, groupWidth]);
            for (const panel of panels) { xPositions.add(Math.round(panel.x)); xPositions.add(Math.round(panel.x + panel.width / 2)); xPositions.add(Math.round(panel.x + panel.width)); }
            const penantRanges = (s.penanten ?? []).map((pen) => ({ x1: pen.x ?? 0, x2: (pen.x ?? 0) + Math.max(1, pen.breedte ?? 400) }));
            lattenData = [...xPositions].sort((a, b) => a - b).flatMap((x) => {
              const lx1 = Math.round(x) - latBreedte / 2;
              const lx2 = lx1 + latBreedte;
              if (penantRanges.some((r) => lx2 > r.x1 + 5 && lx1 < r.x2 - 5)) return [];
              return [{ richting: 'verticaal', x: lx1, y: 0, width: latBreedte, height: groupHeight }];
            });
          }
        }
      }

      if (s.maxHoogte != null && s.maxHoogte > 0) {
        lattenData = lattenData.map((lat) => {
          if (lat.y >= s.maxHoogte) return null;
          if (lat.y + lat.height > s.maxHoogte) return { ...lat, height: s.maxHoogte - lat.y };
          return lat;
        }).filter(Boolean);
      }

      const penantFaceRows = (s.penanten ?? []).map((p) => {
        const pB = Math.max(1, p.breedte ?? 400);
        const pD = Math.max(1, p.diepte ?? 150);
        const pH = Math.max(1, p.hoogte ?? 2000);
        const brickDepth = s.brickDepth ?? 20;
        const panelDikteP = s.panelen?.dikte ?? 8;
        const stoot = mat.stoot ?? 10;
        const sideDepth = Math.max(1, pD - 6);
        const clipOff = Math.max(stoot, panelDikteP);
        const frontRows = buildCenteredFacePattern(pB, pH, mat, s.verband ?? DEFAULT_VERBAND);
        const rawLeft = buildFacePattern(sideDepth, pH, mat, s.verband ?? DEFAULT_VERBAND);
        const rawRight = buildMirroredFacePattern(sideDepth, pH, mat, s.verband ?? DEFAULT_VERBAND);
        const clipEnd = sideDepth - clipOff;
        const leftRows = rawLeft.map((row) => ({
          ...row,
          pieces: row.pieces.flatMap((pc) => {
            if (pc.start >= clipEnd) return [];
            if (pc.start + pc.length <= clipEnd) return [pc];
            return [{ ...pc, length: Math.round((clipEnd - pc.start) * 100) / 100 }];
          }),
        })).filter((row) => row.pieces.length > 0);
        const rightRows = rawRight.map((row) => ({
          ...row,
          pieces: row.pieces.flatMap((pc) => {
            if (pc.start + pc.length <= clipOff) return [];
            if (pc.start >= clipOff) return [pc];
            const ns = Math.round(clipOff * 100) / 100;
            return [{ ...pc, start: ns, length: Math.round((pc.start + pc.length - ns) * 100) / 100 }];
          }),
        })).filter((row) => row.pieces.length > 0);
        return { frontRows, leftRows, rightRows, sideDepth, pD };
      });

      const stripBatches = (() => {
        if (!facadeData) return null;
        const { rows: baseRows, groupWidth: gW } = facadeData;
        const zoneSettingsArr = s.zoneSettings ?? [];
        const sortedPens = [...(s.penanten ?? [])].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
        const numZ = sortedPens.length + 1;
        const enabledZones = [];
        for (let zi = 0; zi < numZ; zi++) {
          const zs = zoneSettingsArr[zi];
          if (!zs?.enabled) continue;
          const zX1 = zi === 0 ? 0 : (sortedPens[zi - 1].x ?? 0) + Math.max(1, sortedPens[zi - 1].breedte ?? 400);
          const zX2 = zi === numZ - 1 ? gW : (sortedPens[zi].x ?? 0);
          if (zX2 <= zX1) continue;
          const zoneMat = zs.material ?? mat;
          const zoneVerband = zs.verband ?? (s.verband ?? DEFAULT_VERBAND);
          const zoneMaxH = zs.maxHoogte ?? (s.maxHoogte ?? null);
          const zFull = buildFullGroupFacadePattern(walls, zoneMat, zoneVerband, zoneMaxH, s.zetwerk, s.minHoogte);
          if (!zFull) continue;
          const clipRows = zFull.rows.map((row) => ({
            ...row,
            pieces: row.pieces.flatMap((piece) => {
              const ps = piece.start, pe = piece.start + piece.length;
              if (pe <= zX1 || ps >= zX2) return [];
              const cs = Math.max(ps, zX1), ce = Math.min(pe, zX2);
              return [{ ...piece, start: cs, length: ce - cs }];
            }).filter((p) => p.length > 1),
          })).filter((row) => row.pieces.length > 0);
          enabledZones.push({ zX1, zX2, rows: clipRows, material: zoneMat, color: zs.color ?? s.color, verband: zoneVerband });
        }
        if (!enabledZones.length) return null;
        const generalRows = baseRows.map((row) => ({
          ...row,
          pieces: row.pieces.flatMap((piece) => {
            let ps = [piece];
            for (const ez of enabledZones) {
              ps = ps.flatMap((q) => {
                const qs = q.start, qe = q.start + q.length;
                if (qe <= ez.zX1 || qs >= ez.zX2) return [q];
                const out = [];
                if (qs < ez.zX1) out.push({ ...q, length: ez.zX1 - qs });
                if (qe > ez.zX2) out.push({ ...q, start: ez.zX2, length: qe - ez.zX2 });
                return out;
              });
            }
            return ps;
          }).filter((p) => p.length > 1),
        })).filter((row) => row.pieces.length > 0);
        return [
          { rows: generalRows, material: mat, color: s.color ?? '#a64033', verband: s.verband ?? DEFAULT_VERBAND },
          ...enabledZones,
        ];
      })();

      return {
        id: group.id,
        name: s.name,
        wallsWithRows: walls.map((wall) => {
          const wallHeightOffset = (wall.wallOrigin?.heightStart ?? 0) - groupMinH;
          let wallRows = rows[wall.expressID] ?? [];
          if (s.maxHoogte != null && s.maxHoogte > 0) {
            wallRows = wallRows.filter((row) => wallHeightOffset + row.y < s.maxHoogte);
          }
          if (s.minHoogte != null && s.minHoogte > 0) {
            wallRows = wallRows.filter((row) => wallHeightOffset + row.y + mat.steenH > s.minHoogte);
          }
          return { wall, rows: wallRows };
        }),
        panels,
        lattenData,
        latDikte: latDikteEff ?? (s.latten?.dikte ?? 28),
        zetwerk: s.zetwerk,
        facadeData,
        stripBatches,
        groupMinX,
        groupMinH,
        refWallOrigin,
        layerVisibility: vis,
        maxHoogte: s.maxHoogte ?? null,
        penantFaceRows,
      };
    });
    const settingsMap = Object.fromEntries(groups.map((g) => [g.id, getSettings(g.id)]));
    exportGroupsToIfc(exportGroups, settingsMap, ifcFileName ?? 'export');
  }

  const ungrouped = allWalls.filter((w) => !wallGroupMap[w.expressID]);
  const activeGroup = groups.find((g) => g.id === activeGroupId);
  const selectionHasUngrouped = [...selectedWallIds].some((id) => !wallGroupMap[id]);
  const ungroupedSelCount = [...selectedWallIds].filter((id) => !wallGroupMap[id]).length;

  const penantFaceData = useMemo(() => {
    if (!activeGroup) return [];
    const s = getSettings(activeGroup.id);
    if (!s.penanten?.length) return [];
    const mat = s.material ?? DEFAULT_MATERIAL;
    const verband = s.verband ?? DEFAULT_VERBAND;
    const walls = activeGroup.wallIds.map((id) => wallMap[id]).filter(Boolean);
    const groupMinH = walls.length ? Math.min(...walls.map((w) => w.wallOrigin?.heightStart ?? 0)) : 0;

    return s.penanten.map((p) => {
      const pX = p.x ?? 0;
      const pB = Math.max(1, p.breedte ?? 400);
      const pD = Math.max(1, p.diepte ?? 150);
      const pH = Math.max(1, p.hoogte ?? 2000);
      const frontRows = buildCenteredFacePattern(pB, pH, mat, verband);

      const brickDepth = s.brickDepth ?? 20;
      const panelDikte = s.panelen?.dikte ?? 8;
      const stoot = mat.stoot ?? 10;
      const panelDepth = Math.max(1, pD - brickDepth - stoot);
      const sideClipOffset = Math.max(stoot, panelDikte);
      const clipLeft = (rows) => rows.map((row) => ({
        ...row,
        pieces: row.pieces.flatMap((pc) => {
          const clipEnd = panelDepth - sideClipOffset;
          if (pc.start >= clipEnd) return [];
          if (pc.start + pc.length <= clipEnd) return [pc];
          return [{ ...pc, length: Math.round((clipEnd - pc.start) * 100) / 100 }];
        }),
      })).filter((row) => row.pieces.length > 0);
      const clipRight = (rows) => rows.map((row) => ({
        ...row,
        pieces: row.pieces.flatMap((pc) => {
          if (pc.start + pc.length <= sideClipOffset) return [];
          if (pc.start >= sideClipOffset) return [pc];
          const newStart = Math.round(sideClipOffset * 100) / 100;
          return [{ ...pc, start: newStart, length: Math.round((pc.start + pc.length - newStart) * 100) / 100 }];
        }),
      })).filter((row) => row.pieces.length > 0);
      const leftRows = clipLeft(buildFacePattern(panelDepth, pH, mat, verband));
      const rightRows = clipRight(buildMirroredFacePattern(panelDepth, pH, mat, verband));
      return { penant: p, front: frontRows, left: leftRows, right: rightRows, height: pH, groupMinH, sideClipOffset };
    });
  }, [activeGroup, getSettings, wallMap, adjacencies]);
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
      {(loadStatus === 'loading' || loadStatus === 'scanning') && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.75)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#1e293b', borderRadius: 12, padding: '32px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.5)', minWidth: 320 }}>
            <div style={{ width: 48, height: 48, border: '4px solid #334155', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'wt-spin 0.8s linear infinite' }} />
            <style>{`@keyframes wt-spin { to { transform: rotate(360deg); } }`}</style>
            <div style={{ color: '#f1f5f9', fontSize: 15, fontWeight: 600 }}>
              {loadStatus === 'scanning' ? 'IFC bestand scannen…' : 'IFC wanden importeren…'}
            </div>
            {loadStatus === 'loading' && loadProgress.total > 0 && (() => {
              const pct = Math.round((loadProgress.current / loadProgress.total) * 100);
              return (
                <div style={{ width: '100%' }}>
                  <div style={{ background: '#334155', borderRadius: 4, height: 8, overflow: 'hidden', width: '100%' }}>
                    <div style={{ background: '#3b82f6', height: '100%', width: `${pct}%`, transition: 'width 0.1s ease', borderRadius: 4 }} />
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 11, textAlign: 'center', marginTop: 6 }}>
                    {loadProgress.current} / {loadProgress.total} wanden ({pct}%)
                  </div>
                </div>
              );
            })()}
            {loadStatus === 'loading' && loadProgress.total === 0 && (
              <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', maxWidth: 280 }}>
                Bestand inladen en openingen detecteren…
              </div>
            )}
            {loadStatus === 'scanning' && (
              <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', maxWidth: 280 }}>
                Wandtypen worden gedetecteerd. Even geduld.
              </div>
            )}
            {loadLogs.length > 0 && (
              <div style={{ width: '100%', background: '#0f172a', borderRadius: 6, padding: '8px 10px', maxHeight: 140, overflowY: 'auto', fontFamily: 'monospace', fontSize: 10, color: '#94a3b8', lineHeight: 1.6 }}>
                {loadLogs.map((l, i) => (
                  <div key={i} style={{ color: l.includes('✓') ? '#4ade80' : l.includes('✗') ? '#f87171' : '#94a3b8' }}>{l}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {similarSuggestions && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Vergelijkbare groeperingen gevonden</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
              Er zijn <strong>{similarSuggestions.groups.length}</strong> groeperingen gevonden met dezelfde samenstelling en onderlinge posities.
              Geselecteerde groepen worden gekoppeld — instellingen zijn later in één keer te synchroniseren.
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {similarSuggestions.groups.map((wallIds, idx) => {
                const walls = wallIds.map((id) => allWalls.find((w) => w.expressID === id)).filter(Boolean);
                return (
                  <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', background: '#f8fafc' }}>
                    <input type="checkbox" defaultChecked style={{ width: 16, height: 16 }} id={`sim-${idx}`} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{wallIds.length} element{wallIds.length !== 1 ? 'en' : ''}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        {walls.map((w) => `${w.length}×${w.height}mm`).join(' + ')}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: '#6366f1', background: '#ede9fe', padding: '2px 8px', borderRadius: 10 }}>
                      🔗 gekoppeld
                    </span>
                  </label>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSimilarSuggestions(null)}
                style={{ fontSize: 12, background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, padding: '6px 14px', cursor: 'pointer' }}>
                Overslaan
              </button>
              <button
                onClick={() => {
                  const { linkId, sourceGroupId } = similarSuggestions;
                  const sourceName = getSettings(sourceGroupId).name;
                  const checkboxes = similarSuggestions.groups.map((_, idx) => document.getElementById(`sim-${idx}`)?.checked ?? true);
                  pushHistory(groups);
                  const newGroupEntries = similarSuggestions.groups
                    .map((wallIds, idx) => ({ wallIds, checked: checkboxes[idx] }))
                    .filter(({ checked }) => checked)
                    .map(({ wallIds }) => {
                      const gid = newGid();
                      const color = nextColor();
                      initColor(gid, color, sourceName);
                      return { group: { id: gid, wallIds: sortWallsInComponent(wallIds, allWalls, adjacencies) }, gid };
                    });
                  setGroups((prev) => [...prev, ...newGroupEntries.map((e) => e.group)]);
                  setGroupLinks((prev) => {
                    const next = { ...prev };
                    for (const { gid } of newGroupEntries) next[gid] = linkId;
                    return next;
                  });
                  setSimilarSuggestions(null);
                }}
                style={{ fontSize: 12, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', cursor: 'pointer', fontWeight: 600 }}>
                Groepen aanmaken &amp; koppelen
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ background: '#1e293b', color: '#f8fafc', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>IFC Brickslip Planner</span>

        <Tooltip text={"Kies een IFC-bestand. De browser onthoudt de locatie zodat je het volgende keer direct kunt laden.\nAlleen Basic Wall elementen worden weergegeven."}>
          <button
            onClick={handlePickFile}
            disabled={loadStatus === 'loading' || loadStatus === 'scanning'}
            style={{ background: (loadStatus === 'loading' || loadStatus === 'scanning') ? '#475569' : '#3b82f6', color: '#fff', padding: '4px 12px', borderRadius: 4, fontSize: 12, border: 'none', cursor: 'pointer' }}
          >
            {loadStatus === 'scanning' ? '🔍 Scannen…' : loadStatus === 'loading' ? '⏳ Laden…' : '📂 IFC kiezen'}
          </button>
        </Tooltip>
        <input id="ifc-file-input" type="file" accept=".ifc" onChange={handleFileChange} style={{ display: 'none' }} />

        {ifcFileName && <span style={{ fontSize: 11, color: '#94a3b8' }}>{ifcFileName}.ifc · {allWalls.length} wanden</span>}
        {loadError && <span style={{ fontSize: 11, color: '#f87171' }}>⚠ {loadError}</span>}

        {(savedHandle || savedFileInfo) && !allWalls.length && loadStatus === 'idle' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1e3a5f', border: '1px solid #2563eb', borderRadius: 5, padding: '3px 8px' }}>
            <span style={{ fontSize: 11, color: '#93c5fd' }}>
              {savedHandle ? '📁' : '💾'} {savedHandle?.name ?? savedFileInfo?.name}
              {savedFileInfo && ` (${(savedFileInfo.size / 1024 / 1024).toFixed(1)} MB)`}
              {' — '}{new Date((savedHandle?.savedAt ?? savedFileInfo?.savedAt)).toLocaleDateString('nl-NL')}
            </span>
            <button onClick={loadFromStorage} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 3, padding: '2px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
              Laden
            </button>
            <button onClick={forgetSavedFile} style={{ background: 'none', color: '#64748b', border: 'none', fontSize: 13, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }} title="Vergeet opgeslagen bestand">
              ×
            </button>
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tooltip text={"Maakt de laatste groepering-actie ongedaan.\nSneltoets: Ctrl+Z"}>
            <button onClick={undo} disabled={groupsHistory.length === 0} style={{ background: '#334155', color: groupsHistory.length === 0 ? '#64748b' : '#f1f5f9', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: groupsHistory.length === 0 ? 'default' : 'pointer', opacity: groupsHistory.length === 0 ? 0.5 : 1 }}>
              ↩ Undo
            </button>
          </Tooltip>
          <Tooltip text={"Sla het huidige project op als een JSON-bestand.\nHierin worden alle groepen, instellingen en koppelingen bewaard.\nLaad het later opnieuw om verder te werken — het IFC-bestand moet wel opnieuw worden geladen."}>
            <button onClick={handleSaveProject} style={{ background: '#0f766e', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
              💾 Project opslaan
            </button>
          </Tooltip>
          <Tooltip text={"Laad een eerder opgeslagen projectbestand (.json).\nZorg dat het bijbehorende IFC-bestand al is geladen voordat je het project laadt."}>
            <label style={{ background: '#1e40af', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
              📂 Project laden
              <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleLoadProject} />
            </label>
          </Tooltip>
          {viewMode === '3d' && (
            <Tooltip text={"Toont het berekende steenstrippatroon als gekleurde vlakken op de wanden in de 3D-viewer.\nUitzetten kan handig zijn voor een beter overzicht van de geometrie."}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#94a3b8', cursor: 'pointer' }}>
                <input type="checkbox" checked={showPattern} onChange={(e) => setShowPattern(e.target.checked)} />
                Patroon in 3D
              </label>
            </Tooltip>
          )}
          {viewMode === '2d' && gridLines.length > 0 && (
            <Tooltip text={"Toont de IFC-stramienlijnen als verticale stippellijnen in het 2D gevelaanzicht.\nElke stramienlijn is voorzien van het bijbehorende label (bijv. A, B, 1, 2)."}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#94a3b8', cursor: 'pointer' }}>
                <input type="checkbox" checked={showGridLines} onChange={(e) => setShowGridLines(e.target.checked)} />
                Stramienlijnen
              </label>
            </Tooltip>
          )}
          {viewMode === '2d' && (
            <Tooltip text={"Toont het midden van de tussenruimte tussen wandelementen als verticale stippellijn met X-coördinaat in mm.\nAlleen zichtbaar als er een werkelijke ruimte (gap) tussen elementen bestaat.\nHandig voor het controleren van de onderlinge posities van elementen."}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#94a3b8', cursor: 'pointer' }}>
                <input type="checkbox" checked={showCenterLines} onChange={(e) => setShowCenterLines(e.target.checked)} />
                Hartlijnen
              </label>
            </Tooltip>
          )}

          {allWalls.length > 0 && (
            <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', border: '1px solid #334155' }}>
              <Tooltip text={"Toont alle wanden in een interactieve 3D-viewer.\nKlik op een element om het te selecteren. Slepen = rondkijken."}>
                <button
                  onClick={() => setViewMode('3d')}
                  style={{ background: viewMode === '3d' ? '#3b82f6' : '#1e293b', color: '#fff', border: 'none', padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}
                >
                  3D
                </button>
              </Tooltip>
              <Tooltip text={"Toont het 2D gevelaanzicht van de actieve groep.\nHet steenstrippatroon, zetwerk, panelen en latten worden hier getekend.\nSelecteer eerst een groep links in de lijst."}>
                <button
                  onClick={() => setViewMode('2d')}
                  style={{ background: viewMode === '2d' ? '#3b82f6' : '#1e293b', color: viewMode === '2d' ? '#fff' : '#94a3b8', border: 'none', borderLeft: '1px solid #334155', padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}
                >
                  2D Gevel
                </button>
              </Tooltip>
              <Tooltip text={"Technische werktekening met maatvoering voor montage van latten en panelen.\nToont peilmaten (absolute hoogte t.o.v. IFC-nulpunt), dimensies per paneel en latpositie.\nExporteerbaar als SVG of afdrukbaar."}>
                <button
                  onClick={() => setViewMode('tekening')}
                  style={{ background: viewMode === 'tekening' ? '#3b82f6' : '#1e293b', color: viewMode === 'tekening' ? '#fff' : '#94a3b8', border: 'none', borderLeft: '1px solid #334155', padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}
                >
                  📐 Werktekening
                </button>
              </Tooltip>
              <Tooltip text={"Uittrekstaat met totaaloverzicht van alle materialen:\noppervlakten, steenstrips, panelen, latten en zetwerk per groep en totaal.\nAfdrukbaar als overzicht voor inkoop en montage."}>
                <button
                  onClick={() => setViewMode('uittrekstaat')}
                  style={{ background: viewMode === 'uittrekstaat' ? '#3b82f6' : '#1e293b', color: viewMode === 'uittrekstaat' ? '#fff' : '#94a3b8', border: 'none', borderLeft: '1px solid #334155', padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}
                >
                  📋 Uittrekstaat
                </button>
              </Tooltip>
            </div>
          )}

          {groups.length > 0 && (
            <Tooltip text={"Exporteert alle aangevinkte lagen als een nieuw IFC-bestand.\nDit bestand bevat ALLEEN de gevelbekleding (strips, zetwerk, panelen, latten) — GEEN originele wandelementen.\nImporteer dit bestand naast het originele IFC in je BIM-software om de gevelbekleding toe te voegen.\nWelke lagen worden geëxporteerd is per groep te regelen via 'Laagzichtbaarheid 2D'."}>
              <button onClick={handleExport} style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}>
                ⬇ Exporteer gevelbekleding IFC
              </button>
            </Tooltip>
          )}
          <Tooltip text="Bekijk de logica-regels per onderdeel (strippen, latten, panelen, penanten, zones)">
            <button onClick={() => setShowRulesModal(true)} style={{ background: '#475569', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
              ? Regels
            </button>
          </Tooltip>
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
                <Tooltip block text={"Aangrenzende elementen delen een gemeenschappelijke rand.\nDit betekent dat het brickslip-patroon doorlopend kan worden over meerdere wanden.\nGebruik 'Auto-groeperen' om ze automatisch in groepen te verdelen."}>
                  <div style={{ padding: '5px 10px', background: '#ede9fe', borderBottom: '1px solid #c4b5fd', fontSize: 11, color: '#6d28d9', flexShrink: 0, cursor: 'default' }}>
                    ⬡ {adjacencies.length} aangrenzende relatie{adjacencies.length !== 1 ? 's' : ''} gevonden
                  </div>
                </Tooltip>
              )}

              <div style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', background: '#fff', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Tooltip block text={"Detecteert automatisch welke wanden aan elkaar grenzen en maakt voor elke verbonden groep een aparte groep.\nHandig als een heel gebouw in één keer gegroepeerd moet worden."}>
                  <button onClick={autoGroup} style={btn('#6366f1')}>
                    🔗 Auto-groeperen op aangrenzendheid
                  </button>
                </Tooltip>
                {selectionHasUngrouped && (
                  <Tooltip block text={"Maakt een nieuwe groep van de geselecteerde elementen die nog niet in een groep zitten.\nSelecteer eerst elementen in de 3D-viewer door erop te klikken."}>
                    <button onClick={createGroup} style={btn('#0ea5e9')}>
                      + Nieuwe groep van selectie ({ungroupedSelCount})
                    </button>
                  </Tooltip>
                )}
                {selectionHasUngrouped && groups.map((g) => {
                  const s = getSettings(g.id);
                  return (
                    <Tooltip key={g.id} block text={`Voegt de geselecteerde ongegroepeende elementen toe aan bestaande groep "${s.name}".`}>
                      <button onClick={() => addToGroup(g.id)}
                        style={{ ...btn(s.color), display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, border: '1px solid rgba(255,255,255,0.4)', display: 'inline-block', flexShrink: 0 }} />
                        <span>Voeg toe aan {s.name}</span>
                      </button>
                    </Tooltip>
                  );
                })}
                {selectedWallIds.size > 0 && (
                  <Tooltip block text={"Heft de selectie van alle elementen op. Geselecteerde elementen worden blauw getoond in de 3D-viewer."}>
                    <button onClick={clearSelection} style={{ ...btn('#64748b') }}>
                      ✕ Deselecteer alles ({selectedWallIds.size})
                    </button>
                  </Tooltip>
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
                      <Tooltip text={"Selecteert alle elementen die nog niet in een groep zitten.\nDaarna kun je er een nieuwe groep van maken."}>
                        <button onClick={selectAllUngrouped} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: 10, padding: 0 }}>
                          Selecteer alle
                        </button>
                      </Tooltip>
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

        <div style={{ flex: 1, position: 'relative', overflow: viewMode === 'uittrekstaat' ? 'auto' : 'hidden', display: 'flex', flexDirection: 'column' }}>
          {viewMode === '3d' ? (
            <>
              <Viewer3D
                walls={allWalls}
                selectedWallIds={selectedWallIds}
                groups={groups}
                groupSettings={getSettings}
                groupPatterns={allPatterns}
                onSelectWall={toggleSelect}
                onSelectMultiple={(ids) => setSelectedWallIds((prev) => {
                  const next = new Set(prev);
                  for (const id of ids) next.add(id);
                  return next;
                })}
                activeGroupId={activeGroup?.id ?? null}
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
          ) : viewMode === '2d' ? (
            <>
              {activeGroup ? (
                <>
                  <View2D
                    walls={activeGroup.wallIds.map((id) => wallMap[id]).filter(Boolean)}
                    groupSettings={getSettings(activeGroup.id)}
                    maxHoogte={getSettings(activeGroup.id).maxHoogte}
                    minHoogte={getSettings(activeGroup.id).minHoogte}
                    penantFaceData={penantFaceData}
                    groupColor={getSettings(activeGroup.id).color}
                    zetwerk={getSettings(activeGroup.id).zetwerk}
                    panelen={getSettings(activeGroup.id).panelen}
                    latten={getSettings(activeGroup.id).latten}
                    layerVisibility={getSettings(activeGroup.id).layerVisibility}
                    gridLines={showGridLines ? gridLines : []}
                    showCenterLines={showCenterLines}
                    zoneSettings={getSettings(activeGroup.id).zoneSettings ?? []}
                  />
                  <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', background: 'rgba(15,23,42,0.85)', color: '#94a3b8', fontSize: 11, padding: '4px 14px', borderRadius: 20, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                    {getSettings(activeGroup.id).name} · {activeGroup.wallIds.length} wand{activeGroup.wallIds.length !== 1 ? 'en' : ''} · 2D gevelaanzicht
                  </div>
                </>
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#1e293b', color: '#64748b', gap: 12 }}>
                  <span style={{ fontSize: 32 }}>⬛</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#94a3b8' }}>Selecteer een groep</span>
                  <span style={{ fontSize: 12 }}>Klik op een groep in de lijst links om deze in 2D te bekijken</span>
                </div>
              )}
            </>
          ) : viewMode === 'tekening' ? (
            <>
              {activeGroup ? (() => {
                const s = getSettings(activeGroup.id);
                const groupWalls = activeGroup.wallIds.map((id) => wallMap[id]).filter(Boolean);
                const withOrigin = groupWalls.filter((w) => w.wallOrigin);
                const gMinH = withOrigin.length ? Math.min(...withOrigin.map((w) => w.wallOrigin.heightStart ?? 0)) : 0;
                return (
                  <Werktekening
                    walls={groupWalls}
                    groupSettings={s}
                    groupName={s.name}
                    zetwerk={s.zetwerk}
                    panelen={s.panelen}
                    latten={s.latten}
                    groupMinH={gMinH}
                    penantFaceData={penantFaceData}
                  />
                );
              })() : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', color: '#64748b', gap: 12 }}>
                  <span style={{ fontSize: 32 }}>📐</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#94a3b8' }}>Selecteer een groep</span>
                  <span style={{ fontSize: 12 }}>Klik op een groep in de lijst links voor de werktekening</span>
                </div>
              )}
            </>
          ) : viewMode === 'uittrekstaat' ? (
            <Uittrekstaat
              groups={groups}
              walls={allWalls}
              getSettings={getSettings}
              adjacencies={adjacencies}
            />
          ) : null}
        </div>

        {activeGroup && (
          <div style={{ width: 230, background: '#fff', borderLeft: '1px solid #e2e8f0', overflowY: 'auto', flexShrink: 0 }}>
            <div style={{ padding: 12 }}>
              <GroupConfigPanel
                groupId={activeGroup.id}
                settings={getSettings(activeGroup.id)}
                onUpdate={(patch) => updateSettings(activeGroup.id, patch)}
                onDelete={() => deleteGroup(activeGroup.id)}
                linkedCount={(() => {
                  const linkId = groupLinks[activeGroup.id];
                  if (!linkId) return 0;
                  return groups.filter((g) => groupLinks[g.id] === linkId && g.id !== activeGroup.id).length;
                })()}
                onSyncToLinked={() => syncToLinked(activeGroup.id)}
                gapCenters={(() => {
                  const walls = activeGroup.wallIds.map((id) => wallMap[id]).filter(Boolean);
                  const withOrigin = walls.filter((w) => w.wallOrigin);
                  if (!withOrigin.length) return [];
                  const groupMinX = Math.min(...withOrigin.map((w) => w.wallOrigin.lengthStart));
                  const sorted = [...withOrigin].sort((a, b) => a.wallOrigin.lengthStart - b.wallOrigin.lengthStart);
                  const centers = [];
                  for (let i = 0; i < sorted.length - 1; i++) {
                    const rightEdge = (sorted[i].wallOrigin.lengthStart - groupMinX) + sorted[i].length;
                    const leftEdge  = sorted[i + 1].wallOrigin.lengthStart - groupMinX;
                    if (leftEdge > rightEdge + 1) centers.push((rightEdge + leftEdge) / 2);
                  }
                  return centers;
                })()}
                groupWidth={(() => {
                  const walls = activeGroup.wallIds.map((id) => wallMap[id]).filter(Boolean);
                  const withOrigin = walls.filter((w) => w.wallOrigin);
                  if (!withOrigin.length) return 0;
                  const groupMinX = Math.min(...withOrigin.map((w) => w.wallOrigin.lengthStart));
                  return Math.max(...withOrigin.map((w) => (w.wallOrigin.lengthStart - groupMinX) + w.length));
                })()}
              />
            </div>
            {viewMode === '2d' && (() => {
              const s = getSettings(activeGroup.id);
              const walls = activeGroup.wallIds.map((id) => wallMap[id]).filter(Boolean);
              const logic = getGroupPatternLogic(walls, s.material ?? DEFAULT_MATERIAL, s.verband ?? DEFAULT_VERBAND);
              return (
                <div style={{ borderTop: '2px solid #e2e8f0', padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', marginBottom: 8, letterSpacing: 0.3, textTransform: 'uppercase' }}>
                    Patroonlogica
                  </div>
                  {logic.map(({ label, value }) => (
                    <div key={label} style={{ marginBottom: 5 }}>
                      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
                      <div style={{ fontSize: 11, color: '#334155', wordBreak: 'break-word' }}>{value}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {showRulesModal && (
        <div onClick={() => setShowRulesModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 8, width: '100%', maxWidth: 820, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#1e293b', borderRadius: '8px 8px 0 0' }}>
              <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 15 }}>📋 Logica-regels per onderdeel</span>
              <button onClick={() => setShowRulesModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: '0 20px 20px', overflowY: 'auto', maxHeight: 'calc(100vh - 160px)' }}>
              {[
                {
                  title: '🧱 Steenstrippen — Vlakke Gevel', color: '#a64033', rows: [
                    ['Sparing (polygon/bbox)', 'Strips worden exact geclipped door de opening — geen strips in ramen/deuren'],
                    ['Penant zij-strip', 'Strips lopen door tot pX + brickDepth achter de buitenrand van de zij-strip → inkijk-preventie'],
                    ['Penant binnenruimte', 'Strips volledig verwijderd tussen pX + brickD en pX + breedte − brickD'],
                    ['Max hoogte', 'Geen strips boven de ingestelde max hoogte'],
                    ['Min hoogte', 'Geen strips onder de ingestelde min hoogte'],
                    ['Zones', 'Per zone eigen kleur / verband / materiaal — begrensd door penant-posities'],
                  ]
                },
                {
                  title: '🧱 Steenstrippen — Penant Voorzijde', color: '#7c3aed', rows: [
                    ['Breedte', 'Penant-breedte − 2 × brickDepth (zij-strips gaan eraf)'],
                    ['Hoogte', 'Begrensd door max hoogte van de groep'],
                    ['Verband', 'Gecentreerd / symmetrisch t.o.v. het penant'],
                    ['Kleur', 'Zelfde als het paneelkleur van de vlakke gevel'],
                  ]
                },
                {
                  title: '🧱 Steenstrippen — Penant Zijkanten', color: '#0369a1', rows: [
                    ['Diepte', 'Penant-diepte − 6mm (6mm voeg aan voorzijde)'],
                    ['Clip aan einde', 'Laatste max(stootvoeg, paneel-dikte) mm wordt verwijderd voor hoek/paneel aansluiting'],
                    ['Kleur', 'Zelfde als de vlakke gevel strips'],
                    ['Positie', 'Rechter zijkant is gespiegeld t.o.v. links'],
                  ]
                },
                {
                  title: '🪵 Horizontale Latten', color: '#92400e', rows: [
                    ['Breedte', 'Lopen over de volledige groepsbreedte (hoek tot hoek)'],
                    ['Max interval', 'Maximale tussenafstand 400mm (configureerbaar via artikel)'],
                    ['Sparingen', 'Worden geclipped bij ramen/deuren — niet doorlopen door opening'],
                    ['Penant', '⚠ Worden NIET geclipped bij penant — lopen er doorheen. Reden: verticale latten worden hierop gemonteerd'],
                    ['Max hoogte', 'Geen latten boven max hoogte'],
                  ]
                },
                {
                  title: '🪵 Verticale Latten', color: '#78350f', rows: [
                    ['Positie diepte', 'Staan op de buitenkant (voorzijde) van de horizontale latten'],
                    ['Penant', 'Worden NIET geplaatst in de zone pX → pX + breedte van een penant'],
                    ['Sparingen', 'Geen verticale latten in sparingen'],
                    ['Max hoogte', 'Geen verticale latten boven max hoogte'],
                  ]
                },
                {
                  title: '🟦 Panelen', color: '#1d4ed8', rows: [
                    ['Sparingen', 'Worden geclipped door polygon of bounding box van opening'],
                    ['Penant', 'Volledig uitgesloten van de zone pX → pX + breedte'],
                    ['Boven penant', 'Van penant-hoogte tot max hoogte ook geen panelen/strips in penant-breedte'],
                    ['Max hoogte', 'Panelen worden geclipped tot max hoogte'],
                    ['Gewicht', 'Paneel wordt kleiner als het ingestelde max gewicht (kg) wordt overschreden'],
                  ]
                },
                {
                  title: '📐 Penant — Geometrie', color: '#065f46', rows: [
                    ['Voeg voor', '6mm voeg tussen voorzijde penant en vlakke gevel'],
                    ['Gap zij', '10mm ruimte tussen vlakke gevel structuur en zij-paneel/latten van penant'],
                    ['X-positie', 'Ondersteunt rekenkundige expressies, bijv. 3500 − 200'],
                    ['Hoogte', 'Automatisch begrensd door max hoogte van de groep'],
                    ['Strips vlakke gevel', 'Eindigen op pX + brickD (achter buitenrand zij-strip = inkijk-preventie)'],
                    ['Horizontale latten', 'Lopen door het penant heen (niet geclipped)'],
                    ['Verticale latten', 'Worden NIET geplaatst in de penant-zone'],
                  ]
                },
                {
                  title: '🗂 Zones', color: '#4338ca', rows: [
                    ['Numering', 'Zone 1 = linkerhoek → penant 1. Zone 2 = na penant 1 → penant 2. etc.'],
                    ['Aantal', 'Altijd = aantal penanten + 1'],
                    ['Grenzen', 'Zone-grenzen worden altijd bepaald door penant-posities — overlappen nooit'],
                    ['Per zone', 'Eigen kleur, verband, materiaal en max hoogte mogelijk'],
                    ['Kopiëren', 'Zone-instellingen kopieerbaar naar andere zones binnen dezelfde groep'],
                  ]
                },
              ].map(({ title, color, rows }) => (
                <div key={title} style={{ marginTop: 18 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color, borderBottom: `2px solid ${color}`, paddingBottom: 4, marginBottom: 8 }}>{title}</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <tbody>
                      {rows.map(([rule, desc]) => (
                        <tr key={rule} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '5px 8px', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap', width: '35%', verticalAlign: 'top' }}>{rule}</td>
                          <td style={{ padding: '5px 8px', color: '#475569', verticalAlign: 'top' }}>{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              <div style={{ marginTop: 20, padding: '12px 14px', background: '#fef3c7', borderRadius: 6, fontSize: 11, color: '#92400e', borderLeft: '4px solid #f59e0b' }}>
                <strong>Prioriteitsvolgorde bij conflicten:</strong> Max hoogte → Penant-zone → Sparing → Inkijk-preventie (brickDepth overlap)
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
