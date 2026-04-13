import { useMemo } from 'react';
import { buildFullGroupFacadePattern } from './lib/pattern.js';
import { buildFacadeZones, panelizeZone } from './lib/panelization.js';

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

function computeGroupTakeoff(group, walls, getSettings, adjacencies) {
  const s = getSettings(group.id);
  const mat = s.material ?? DEFAULT_MATERIAL;
  const verband = s.verband ?? 'halfsteens';
  const name = s.name ?? group.id;
  const color = s.color ?? '#94a3b8';

  const groupWalls = group.wallIds.map((id) => walls.find((w) => w.expressID === id)).filter(Boolean);
  if (!groupWalls.length) return null;

  const facadeData = buildFullGroupFacadePattern(groupWalls, mat, verband, s.maxHoogte, s.zetwerk);
  if (!facadeData) return null;

  const { groupWidth, groupHeight, groupOpenings, rows } = facadeData;

  const facadeAreaMM2 = groupWidth * groupHeight;

  const openingsAreaMM2 = groupOpenings.reduce((sum, op) => {
    if (op.polyPts && op.polyPts.length >= 3) return sum + polyArea(op.polyPts);
    return sum + op.width * op.height;
  }, 0);

  const netFacadeAreaMM2 = facadeAreaMM2 - openingsAreaMM2;

  let stripCount = { Vol: 0, Kop: 0, Driekwart: 0, Rest: 0, Tegel: 0 };
  let stripAreaMM2 = 0;
  const steenW = mat.steenL;
  const steenH = verband === 'tegelverband' ? mat.steenH : mat.steenH;
  for (const wallRows of Object.values(rows)) {
    for (const row of wallRows) {
      for (const piece of row.pieces) {
        const lbl = piece.label ?? 'Vol';
        stripCount[lbl] = (stripCount[lbl] ?? 0) + 1;
        stripAreaMM2 += piece.length * (verband === 'tegelverband' ? mat.steenH : mat.steenH);
      }
    }
  }

  let panelList = [];
  if (s.panelen?.enabled) {
    const basePanel = { width: Math.max(100, s.panelen.breedte ?? 3005), height: Math.max(100, s.panelen.hoogte ?? 1200) };
    const globalPieces = rows.flatMap ? Object.values(rows).flatMap((wallRows) => wallRows.flatMap((row) => row.pieces.map((p) => ({ x: p.start, width: p.length })))) : [];
    const openingsForZones = groupOpenings.map((op) => ({ id: `op_${op.x}_${op.y}`, x: op.x, y: op.y, width: op.width, height: op.height, polyPts: op.polyPts ?? null }));
    const zones = buildFacadeZones(groupWidth, groupHeight, openingsForZones);
    for (const zone of zones) {
      const result = panelizeZone(zone, Object.values(rows).flat(), globalPieces, mat.steenH, basePanel);
      if (result.ok) panelList.push(...result.panels);
    }
  }

  const panelGroups = {};
  for (const p of panelList) {
    const key = `${mm2(p.width)}x${mm2(p.height)}`;
    if (!panelGroups[key]) panelGroups[key] = { width: p.width, height: p.height, count: 0, areaMM2: 0, weightKg: 0 };
    panelGroups[key].count++;
    panelGroups[key].areaMM2 += p.width * p.height;
    const pWeight = s.panelen?.gewichtM2 ?? 11;
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
      const boundaryYs = new Set([0, gH]);
      for (const p of panelList) { boundaryYs.add(Math.round(p.y)); boundaryYs.add(Math.round(p.y + p.height)); }
      for (const op of groupOpenings) { boundaryYs.add(Math.round(op.y)); boundaryYs.add(Math.round(op.y + op.height)); }
      const sorted = [...boundaryYs].sort((a, b) => a - b);
      const allYs = new Set(sorted);
      for (let i = 0; i < sorted.length - 1; i++) {
        const span = sorted[i + 1] - sorted[i];
        if (span > MAX_HOC) {
          const steps = Math.ceil(span / MAX_HOC);
          for (let s2 = 1; s2 < steps; s2++) allYs.add(Math.round(sorted[i] + (span / steps) * s2));
        }
      }
      for (const yr of [...allYs].sort((a, b) => a - b)) {
        let latY = yr === 0 ? 0 : yr === gH ? yr - latB : openingBottomYs.has(yr) ? yr - latB : openingTopYs.has(yr) ? yr : yr - latB / 2;
        const latTop = latY, latBot = latY + latB;
        const openingsAtY = groupOpenings.filter((op) => op.y < latBot && op.y + op.height > latTop);
        const zones2 = [];
        if (!openingsAtY.length) { zones2.push({ x1: 0, x2: groupWidth }); }
        else {
          const opRanges = openingsAtY.map((op) => ({ x1: op.x, x2: op.x + op.width })).sort((a, b) => a.x1 - b.x1);
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
          if (x2 <= x1) continue;
          const len = Math.round(x2 - x1);
          lattenSummary[len] = (lattenSummary[len] ?? 0) + 1;
        }
      }
    }
  }

  let zetWerkAreaMM2 = 0;
  if (s.zetwerk?.enabled) {
    const zwB = Math.max(1, s.zetwerk.breedte ?? 50);
    const zwH = Math.max(0, s.zetwerk.offsetH ?? 0);
    const zwV = Math.max(0, s.zetwerk.offsetV ?? 0);
    for (const op of groupOpenings) {
      const expandedW = op.width + 2 * (zwH + zwB);
      const expandedH = op.height + 2 * (zwV + zwB);
      const innerW = op.width + 2 * zwH;
      const innerH = op.height + 2 * zwV;
      zetWerkAreaMM2 += expandedW * expandedH - innerW * innerH;
    }
  }

  let penantAreaMM2 = 0;
  if (s.penanten?.length) {
    for (const p of s.penanten) {
      const pB = Math.max(1, p.breedte ?? 400);
      const pD = Math.max(1, p.diepte ?? 150);
      const maxH = s.maxHoogte != null && s.maxHoogte > 0 ? s.maxHoogte : groupHeight;
      const pH = Math.min(Math.max(1, p.hoogte ?? 2000), maxH);
      penantAreaMM2 += pB * pH + 2 * pD * pH;
    }
  }

  return {
    groupId: group.id, name, color,
    groupWidth, groupHeight,
    facadeAreaMM2, openingsAreaMM2, netFacadeAreaMM2, penantAreaMM2,
    stripCount, stripAreaMM2,
    panelGroups,
    lattenSummary,
    zetWerkAreaMM2,
    mat,
    openingsCount: groupOpenings.length,
  };
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

export function Uittrekstaat({ groups, walls, getSettings, adjacencies, onClose }) {
  const importTotals = useMemo(() => computeImportTotals(walls), [walls]);

  const takeoffs = useMemo(() => {
    return groups
      .map((g) => computeGroupTakeoff(g, walls, getSettings, adjacencies))
      .filter(Boolean);
  }, [groups, walls, getSettings, adjacencies]);

  const totals = useMemo(() => {
    const t = { facadeAreaMM2: 0, openingsAreaMM2: 0, netFacadeAreaMM2: 0, penantAreaMM2: 0, stripAreaMM2: 0, zetWerkAreaMM2: 0, panelCount: 0, panelAreaMM2: 0, panelWeightKg: 0, lattenCount: 0, lattenLengthMM: 0 };
    for (const to of takeoffs) {
      t.facadeAreaMM2 += to.facadeAreaMM2;
      t.openingsAreaMM2 += to.openingsAreaMM2;
      t.netFacadeAreaMM2 += to.netFacadeAreaMM2;
      t.penantAreaMM2 += to.penantAreaMM2;
      t.stripAreaMM2 += to.stripAreaMM2;
      t.zetWerkAreaMM2 += to.zetWerkAreaMM2;
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
            {totals.zetWerkAreaMM2 > 0 && <tr><TD>Zetwerk oppervlak</TD><TD right mono>{m2(totals.zetWerkAreaMM2)}</TD><TD right>m²</TD></tr>}

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
                <tr><TD>Totaal strips</TD><TD right mono bold>{totalStrips}</TD><TD right>st</TD></tr>
                {to.stripCount.Vol > 0 && <tr><TD>— Streksteen ({to.mat.steenL}×{to.mat.steenH} mm)</TD><TD right mono>{to.stripCount.Vol}</TD><TD right>st</TD></tr>}
                {to.stripCount.Kop > 0 && <tr><TD>— Kopsteen</TD><TD right mono>{to.stripCount.Kop}</TD><TD right>st</TD></tr>}
                {to.stripCount.Driekwart > 0 && <tr><TD>— Driekwart</TD><TD right mono>{to.stripCount.Driekwart}</TD><TD right>st</TD></tr>}
                {to.stripCount.Rest > 0 && <tr><TD>— Snijstrip (rest)</TD><TD right mono>{to.stripCount.Rest}</TD><TD right>st</TD></tr>}
                {to.stripCount.Tegel > 0 && <tr><TD>— Tegels</TD><TD right mono>{to.stripCount.Tegel}</TD><TD right>st</TD></tr>}

                {to.zetWerkAreaMM2 > 0 && <>
                  <SectionHeader title="Zetwerk" />
                  <tr><TD>Zetwerk oppervlak rondom sparingen</TD><TD right mono>{m2(to.zetWerkAreaMM2)}</TD><TD right>m²</TD></tr>
                </>}

                {panelEntries.length > 0 && <>
                  <SectionHeader title="Panelen" />
                  {panelEntries.map(([key, pg]) => (
                    <tr key={key}>
                      <TD>Paneel {mm2(pg.width)} × {mm2(pg.height)} mm</TD>
                      <TD right mono bold>{pg.count}</TD>
                      <TD right>st ({m2(pg.areaMM2)} m² · {pg.weightKg.toFixed(1)} kg)</TD>
                    </tr>
                  ))}
                </>}

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
              </tbody>
            </table>
          );
        })}
      </div>
    </div>
  );
}
