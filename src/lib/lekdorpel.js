// lekdorpel.js — LEKDORPEL-REFERENTIE (vlag lekdorpelReferentie). Koppelt de losstaande lekdorpels
// (IfcBuildingElementProxy, wereld-bbox in mm) aan de raam/deur-openingen en levert per opening de
// horizontale LEKDORPEL-extent in WAND-LOKALE coördinaten (zelfde frame als op.x), zodat de
// opening-rand (L/R) de lekdorpel volgt i.p.v. de kozijn-bbox. De hoogte blijft van het kozijn.
//
// lekdorpel = { bbox: { minX,maxX,minY,maxY,minZ,maxZ } }  (wereld mm)
// wall = { wallOrigin:{ lengthAxis,heightAxis,thicknessAxis, lengthStart,heightStart }, openings:[...] }

const AB_ABOVE = 350;   // mm — lekdorpel-midden mag tot zover BOVEN de kozijnkop liggen
const AB_BELOW = 80;    // mm — en tot zover eronder (rounding/overlap)
const OVERLAP  = 60;    // mm — horizontale overlap-tolerantie
const DEPTH_TOL = 350;  // mm — zelfde gevelvlak (diepte)

// Retourneer { x, breedte } (wand-lokaal langs lengthAxis) van de lekdorpel boven deze opening, of null.
export function lekdorpelXForOpening(op, wo, lekdorpels) {
  if (!wo || !lekdorpels?.length) return null;
  const L = (wo.lengthAxis || 'x').toUpperCase();
  const H = (wo.heightAxis || 'y').toUpperCase();
  const T = (wo.thicknessAxis || 'z').toUpperCase();
  const opLenStart = (wo.lengthStart ?? 0) + (op.x ?? 0);                 // wereld langs lengte
  const opLenEnd   = opLenStart + (op.breedte ?? op.width ?? 0);
  const opTc       = op.thicknessCenter;
  // DEUR → WATERSLAG onder de dorpel (onderkant opening); RAAM/anders → LEKDORPEL boven de kop.
  const isDeur = op.type === 'deur';
  const nameRe = isDeur ? /waterslag/i : /lekdorpel/i;
  const refY   = isDeur
    ? (wo.heightStart ?? 0) + (op.y ?? 0)                                 // onderkant opening (wereld)
    : (wo.heightStart ?? 0) + (op.y ?? 0) + (op.hoogte ?? op.height ?? 0); // bovenkant opening (wereld)
  let s = Infinity, e = -Infinity;
  for (const lk of lekdorpels) {
    if (!nameRe.test(lk?.name || '')) continue;                           // juiste soort (lekdorpel vs waterslag)
    const b = lk?.bbox; if (!b) continue;
    const ly = (b['min' + H] + b['max' + H]) / 2;
    if (isDeur) { if (ly < refY - AB_ABOVE || ly > refY + AB_BELOW) continue; }  // net ONDER de onderkant
    else        { if (ly < refY - AB_BELOW || ly > refY + AB_ABOVE) continue; }  // net BOVEN de kop
    if (b['max' + L] < opLenStart - OVERLAP || b['min' + L] > opLenEnd + OVERLAP) continue; // horizontale overlap
    if (opTc != null) { const lt = (b['min' + T] + b['max' + T]) / 2; if (Math.abs(lt - opTc) > DEPTH_TOL) continue; } // zelfde vlak
    if (b['min' + L] < s) s = b['min' + L];
    if (b['max' + L] > e) e = b['max' + L];
  }
  if (!(s < e)) return null;
  // De lekdorpel-X geldt ALLEEN daar waar de window (opening) is — niet de volle lekdorpel-bbox (die
  // kan doorlopen/uitsteken of over meerdere panelen spannen). Knip op de opening-extent (intersectie).
  const start = Math.max(s, opLenStart);
  const end   = Math.min(e, opLenEnd);
  if (!(start < end)) return null;
  return { x: Math.round(start - (wo.lengthStart ?? 0)), breedte: Math.round(end - start) };
}

// Nieuwe walls-array waar elke raam/deur-opening een `lekdorpelX` krijgt (indien gematcht). Ongemoeide
// walls/openings worden hergebruikt (geen kopie) zodat referenties stabiel blijven waar niets matcht.
export function attachLekdorpelToWalls(walls, lekdorpels) {
  if (!lekdorpels?.length || !walls?.length) return walls;
  return walls.map((w) => {
    if (!w?.wallOrigin || !w.openings?.length) return w;
    let changed = false;
    const openings = w.openings.map((op) => {
      if (op.type !== 'raam' && op.type !== 'deur') return op;
      const lek = lekdorpelXForOpening(op, w.wallOrigin, lekdorpels);
      if (!lek) return op;
      changed = true;
      // lekSource = welk profiel de rand bepaalde → voor de aparte waterslag-offset in de knip.
      return { ...op, lekdorpelX: lek, lekSource: op.type === 'deur' ? 'waterslag' : 'lekdorpel' };
    });
    return changed ? { ...w, openings } : w;
  });
}
