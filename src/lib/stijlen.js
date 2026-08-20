// stijlen.js — koppelt de geëxtraheerde module-stijlen (uit BIL-MOO_stijlen.json, gemaakt door
// spike/extract-stijlen.mjs) aan een gevelgroep, en levert de verticale-lat SCHROEFLIJNEN per
// verdieping in het facade-frame van die groep. Puur additief; wordt alleen aangeroepen als de
// gebruiker een stijlen-JSON heeft geladen (achter de vlag stijlenImport). Geen bestaande codepad.
//
// Datamodel JSON (mm, zelfde wereld-frame als het Revit-gevelmodel):
//   gevelvlakken[]: { constAxis:'x'|'z', constCoord, alongAxis:'x'|'z',
//                     verdiepingen[]: { verdieping, y0, y1, hoh, latten[]: { pos, type:'enkel'|'dubbel', y0, y1, stijlen[] } } }
//   lat.pos = wereld-coord (langs alongAxis) van het CENTRUM van één echte stijl (de schroeflijn).

function num(v, d = 0) { return Number.isFinite(v) ? v : d; }

// Valideer/normaliseer geladen JSON-tekst → object of null.
export function parseStijlenData(text) {
  try {
    const j = typeof text === 'string' ? JSON.parse(text) : text;
    if (!j || !Array.isArray(j.gevelvlakken)) return null;
    return j;
  } catch { return null; }
}

// Koppel de stijlen aan één groep en geef de schroeflijnen in FACADE-coördinaten (x langs de groep-lengte,
// y vanaf de groep-onderkant), per verdieping, met de kozijn-binnenstijlen (mullions) al weggefilterd op de
// groep-openingen. Retour: { verdiepingen:[{verdieping, latten:[{x,y0,y1,type}]}], plane } of null als er geen
// matchend gevelvlak is. facadeData = allPatterns[group].facadeData (refWallOrigin/groupMinX/groupMinH/
// groupWidth/groupOpenings).
export function studLattenForGroup(stijlenData, facadeData, opts = {}) {
  if (!stijlenData?.gevelvlakken?.length || !facadeData) return null;
  const rwo = facadeData.refWallOrigin;
  if (!rwo) return null;
  const lengthAxis = rwo.lengthAxis;                                  // 'z' voor BIL-MOO-gevels
  const thickCenter = (num(rwo.thicknessStart) + num(rwo.thicknessEnd, num(rwo.thicknessStart))) / 2;
  const groupMinX = num(facadeData.groupMinX);
  const groupMinH = num(facadeData.groupMinH);
  const gw = num(facadeData.groupWidth);
  const planeTol = opts.planeTol ?? 400;                              // afstand tot het gevelvlak (mm)
  const edge = opts.jambMargin ?? 120;                               // marge zodat jamb-stijlen op de rand blijven
  // BEGRENZING: de verticale lat loopt niet ONDER het peil (startLijn) en niet BOVEN de max striphoogte (maxHoogte).
  // Beide liggen in hetzelfde facade-y-frame als de stijl-y (mm vanaf groep-onderkant, zie y0/y1 hieronder). Een lat
  // die deels buiten valt wordt ingekort; volledig buiten → vervalt. De verdiepingsnaad blijft meetellen (doorlopende
  // lat; slabGap in buildStudLatLines versmelt die), ook al kun je daar niet schroeven.
  const clampLo = num(opts.startLijn, 0);
  const clampHi = (Number.isFinite(opts.maxHoogte) && opts.maxHoogte > 0) ? opts.maxHoogte : Infinity;

  // TIJDELIJKE DEBUG (aan met ?stijlenDebug=1 of localStorage 'stijlenDebug'='1'): logt naar de console welke
  // gevelvlakken matchten + de stijl-pijplijn (raw → buiten-bereik → mullion-weg → geklemd → kept) + per kozijn
  // de dichtstbijzijnde gehouden stijl en de eventueel weggefilterde stijlen bij de dagkanten. Geen gedrag-wijziging.
  const DEBUG = (() => { try { const q = (typeof location !== 'undefined' && new URLSearchParams(location.search).get('stijlenDebug')) || (typeof localStorage !== 'undefined' && localStorage.getItem('stijlenDebug')); return q === '1'; } catch { return false; } })();

  // Kies de best matchende gevelvlakken: zelfde lengte-as, vlak-positie dichtbij de wand-dikte-hart.
  const cand = stijlenData.gevelvlakken.filter(f =>
    f.alongAxis === lengthAxis && Math.abs(num(f.constCoord) - thickCenter) <= planeTol);
  if (!cand.length) return null;

  // wereld-along → facade-x. Sanity: als de meeste x buiten [0,gw] vallen, spiegel (facade-x = groupMaxX − pos).
  const groupMaxX = groupMinX + gw;
  const toFx = (pos, mir) => mir ? Math.round(groupMaxX - pos) : Math.round(pos - groupMinX);
  const inRange = (arr, mir) => arr.filter(p => { const x = toFx(p, mir); return x > -50 && x < gw + 50; }).length;
  const allPos = cand.flatMap(f => f.verdiepingen.flatMap(v => v.latten.map(l => num(l.pos))));
  const mir = inRange(allPos, false) < inRange(allPos, true);

  const openings = facadeData.groupOpenings ?? [];
  const insideOpening = (x, ly0, ly1) => openings.some(o => {
    const ox = num(o.x), ow = num(o.width ?? o.breedte), oy = num(o.y), oh = num(o.height ?? o.hoogte);
    if (!(ow > 0)) return false;
    return x > ox + edge && x < ox + ow - edge && ly1 > oy + 1 && ly0 < oy + oh - 1;   // strikt binnen (mullion)
  });

  // verdiepingen samenvoegen over de matchende vlakken, per verdieping-index
  const perVerd = new Map();
  let _dbgRaw = 0, _dbgOut = 0, _dbgMull = 0, _dbgClamp = 0; const _dbgMullX = [], _dbgClampX = [];   // DEBUG-tellers
  for (const f of cand) for (const v of (f.verdiepingen ?? [])) {
    const key = v.verdieping ?? 0;
    if (!perVerd.has(key)) perVerd.set(key, []);
    for (const l of (v.latten ?? [])) {
      _dbgRaw++;
      const x = toFx(num(l.pos), mir);
      const y0r = Math.round(num(l.y0) - groupMinH), y1r = Math.round(num(l.y1) - groupMinH);
      if (x <= -50 || x >= gw + 50) { _dbgOut++; continue; }
      if (insideOpening(x, y0r, y1r)) { _dbgMull++; if (DEBUG) _dbgMullX.push(x); continue; }  // kozijn-binnenstijl → geen bekledingslat (rauwe stijl-hoogte)
      const y0 = Math.max(y0r, clampLo), y1 = Math.min(y1r, clampHi);  // klem op [peil, max striphoogte]
      if (y1 - y0 < 1) { _dbgClamp++; if (DEBUG) _dbgClampX.push({ x, y0: y0r, y1: y1r }); continue; }   // volledig onder peil of boven max striphoogte → weg
      perVerd.get(key).push({ x, y0, y1, type: l.type ?? 'enkel' });
    }
  }
  const verdiepingen = [...perVerd.entries()].sort((a, b) => a[0] - b[0]).map(([verdieping, latten]) => {
    // dedup (zelfde x binnen 15mm) + sorteren
    latten.sort((a, b) => a.x - b.x);
    const out = [];
    for (const l of latten) { const p = out[out.length - 1]; if (p && Math.abs(l.x - p.x) < 15) { if (l.type === 'dubbel') p.type = 'dubbel'; } else out.push(l); }
    return { verdieping, latten: out };
  }).filter(v => v.latten.length);

  if (!verdiepingen.length) return null;
  const totaal = verdiepingen.reduce((a, v) => a + v.latten.length, 0);

  if (DEBUG) {
    const kept = [...new Set(verdiepingen.flatMap((v) => v.latten.map((l) => l.x)))].sort((a, b) => a - b);
    const opens = openings.map((o) => ({ L: Math.round(num(o.x)), R: Math.round(num(o.x) + num(o.width ?? o.breedte)), w: Math.round(num(o.width ?? o.breedte)) })).filter((o) => o.w > 0).sort((a, b) => a.L - b.L);
    const near = (arr, v) => arr.reduce((b, x) => Math.abs(x - v) < Math.abs(b - v) ? x : b, Infinity);
    console.log('[stijlen-debug] vlak:', { lengthAxis, thickCenter: Math.round(thickCenter), groupMinX, gw, groupMinH, planeTol, edge, clampLo, clampHi, mir });
    console.log('[stijlen-debug] gematchte gevelvlakken (' + cand.length + '):', cand.map((f) => ({ constCoord: Math.round(num(f.constCoord)), studs: f.verdiepingen.reduce((a, v) => a + (v.latten?.length ?? 0), 0) })));
    console.log('[stijlen-debug] stijl-pijplijn: raw=' + _dbgRaw + ' buiten-bereik=' + _dbgOut + ' mullion-weg=' + _dbgMull + ' geklemd-weg=' + _dbgClamp + ' → kept-uniek-x=' + kept.length);
    console.log('[stijlen-debug] per kozijn (dichtstbij gehouden stijl-x; MULLION-weg = door ons filter verwijderd bij de dagkant):');
    for (const o of opens) {
      const nl = near(kept, o.L), nr = near(kept, o.R);
      const mL = _dbgMullX.filter((x) => Math.abs(x - o.L) < 200).sort((a, b) => a - b);
      const mR = _dbgMullX.filter((x) => Math.abs(x - o.R) < 200).sort((a, b) => a - b);
      const cL = _dbgClampX.filter((s) => Math.abs(s.x - o.L) < 200).map((s) => `${s.x}@${s.y0}-${s.y1}`);
      const cR = _dbgClampX.filter((s) => Math.abs(s.x - o.R) < 200).map((s) => `${s.x}@${s.y0}-${s.y1}`);
      console.log(`  kozijn ${o.L}..${o.R} (${o.w}mm): kept-L Δ${Math.abs(nl - o.L)}  kept-R Δ${Math.abs(nr - o.R)}`
        + ((mL.length || mR.length) ? `  | MULLION-weg L=[${mL}] R=[${mR}]` : '')
        + ((cL.length || cR.length) ? `  | KLEM-weg L=[${cL}] R=[${cR}]` : ''));
    }
  }

  return { verdiepingen, plane: { constAxis: cand[0].constAxis, constCoord: cand[0].constCoord, mirrored: mir }, totaal };
}

// Zet de schroeflijnen (per verdieping) om naar VERTICALE-LAT-LIJNEN voor de aparte werktekening:
// groepeer schroeflijnen die op ~dezelfde x boven elkaar liggen tot één lat (doorlopend over die verdiepingen);
// per lat: xLeft (linkerzijde = maatreferentie), screwX (schroeflijn = stijl-hart), en de losse schroef-segmenten
// per verdieping (daar waar wél een stijl zit → daar kun je schroeven). latW = lat-breedte (voor de linkerzijde-offset).
export function buildStudLatLines(stijlLatten, latW = 45, opts = {}) {
  if (!stijlLatten?.verdiepingen?.length) return null;
  const tol = opts.xTol ?? 40, slabGap = opts.slabGap ?? 600;
  const all = [];
  for (const v of stijlLatten.verdiepingen) for (const l of (v.latten ?? [])) all.push({ x: num(l.x), y0: num(l.y0), y1: num(l.y1), type: l.type });
  all.sort((a, b) => a.x - b.x);
  // groepeer op x (stijlen recht boven elkaar = één doorlopende lat)
  const groups = [];
  for (const s of all) { const g = groups[groups.length - 1]; if (g && s.x - g.xMax <= tol) { g.items.push(s); g.xMax = Math.max(g.xMax, s.x); } else groups.push({ items: [s], xMax: s.x }); }
  const half = latW / 2;
  const latLines = groups.map((g) => {
    const screwX = Math.round(g.items.reduce((a, i) => a + i.x, 0) / g.items.length);
    const dubbel = g.items.some((i) => i.type === 'dubbel');
    // schroef-segmenten (per verdieping) — waar een stijl zit; naburige binnen slabGap → doorlopend samengevoegd
    const segs = g.items.map((i) => ({ y0: i.y0, y1: i.y1 })).sort((a, b) => a.y0 - b.y0);
    const merged = []; for (const s of segs) { const p = merged[merged.length - 1]; if (p && s.y0 - p.y1 <= slabGap) p.y1 = Math.max(p.y1, s.y1); else merged.push({ ...s }); }
    return { screwX, xLeft: Math.round(screwX - half), y0: Math.round(Math.min(...segs.map((s) => s.y0))), y1: Math.round(Math.max(...segs.map((s) => s.y1))),
      type: dubbel ? 'dubbel' : 'enkel', screws: g.items.map((i) => ({ y0: Math.round(i.y0), y1: Math.round(i.y1) })).sort((a, b) => a.y0 - b.y0),
      edges: merged.map((s) => ({ y0: Math.round(s.y0), y1: Math.round(s.y1) })) };
  }).sort((a, b) => a.xLeft - b.xLeft);
  // verdieping-banden (voor referentie-lijnen + per-verdieping maatketen)
  const floors = stijlLatten.verdiepingen.map((v) => ({ verdieping: v.verdieping,
    y0: Math.round(Math.min(...v.latten.map((l) => num(l.y0)))), y1: Math.round(Math.max(...v.latten.map((l) => num(l.y1)))) })).sort((a, b) => a.y0 - b.y0);
  return { latLines, floors, latW };
}
