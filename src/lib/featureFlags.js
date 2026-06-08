// Feature-flags. Stap 2: het nieuwe openingsafleidingspad staat hier achter een
// schakelaar. DEFAULT = false → het bestaande (oude) pad blijft de standaard.
// Aanzetten zonder build: ?newOpenings=1 in de URL, of localStorage 'newOpenings'='1'.

function readFlag(name, def) {
  try {
    if (typeof window !== 'undefined' && window.location) {
      const p = new URLSearchParams(window.location.search);
      if (p.has(name)) { const v = p.get(name); return v !== '0' && v !== 'false'; }
    }
  } catch {}
  try {
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(name);
      if (v != null) return v === '1' || v === 'true';
    }
  } catch {}
  return def;
}

export function isNewOpeningDerivation() {
  return readFlag('newOpenings', false);
}

// Best-fit gevelvlak voor HANDMATIG aangemaakte groepen. DEFAULT = TRUE (aan).
// NOODREM: ?bestFitGroups=0 (of localStorage 'bestFitGroups'='0'/'false') schakelt het
// expliciet UIT en valt terug op het oude pad (buildFullGroupFacadePattern). De
// expliciete-uit-override werkt via readFlag (regel 9: param aanwezig met '0' → false).
export function isBestFitGroups() {
  return readFlag('bestFitGroups', true);
}

// Openingsafleiding gebruikt dezelfde model-up-as als het wand-skelet (één bron van
// waarheid) i.p.v. de kolom-heuristiek (detectUp) opnieuw te gokken in het void-pad.
// DEFAULT = false → exact het huidige (byte-identieke) gedrag.
// Aanzetten: ?openingUpAxisFix=1 of localStorage 'openingUpAxisFix'='1'.
export function isOpeningUpAxisFix() {
  return readFlag('openingUpAxisFix', false);
}

// Zelf-bevattende projecten: bron-IFC-bytes worden in IndexedDB bewaard en de walls
// worden bij laden VERS her-afgeleid (i.p.v. de bevroren opgeslagen walls[]). DEFAULT
// = false → exact het bestaande save/load-gedrag (vlag-uit byte-identiek).
// Aanzetten: ?selfContainedProjects=1 of localStorage 'selfContainedProjects'='1'.
export function isSelfContainedProjects() {
  return readFlag('selfContainedProjects', false);
}

// Up-as voor wand-loze (sub)modellen: bij 0 wanden niet blind 'z', maar de up-as
// ERVEN van een eerder geladen model met een CONFIDENT up-signaal (lastConfidentUpAxis),
// anders een extent-heuristiek (kleinste extent = up, met vlakke-footprint-sanity),
// anders 'z'. Lost het "breedte-als-hoogte" / best-fit-horizontaal-conflict op bij
// een gemengde import (bv. hoofdmodel met wanden + los dakrand-submodel zonder wanden).
// DEFAULT = true (gevalideerd; OFF was byte-identiek, worst-case valt terug op 'z').
// NOODREM: ?upAxisInherit=0 (of localStorage 'upAxisInherit'='0'/'false') zet het
// expliciet UIT en herstelt het oude geen-wanden→'z'-gedrag.
// Blast-radius: uitsluitend modellen met 0 wanden; modellen met ≥1 wand ongewijzigd.
export function isUpAxisInheritFallback() {
  return readFlag('upAxisInherit', true);
}

// Stompe hoekterminatie: de aanzichtgevel (cfg.main) loopt door in zijn EIGEN vlak,
// maar er worden GEEN omslag-steenstrips meer op het loodrechte (aansluitende) vlak
// geplaatst. De aansluitende gevel butt ertegenaan via de bestaande endExtensions-trim.
// DEFAULT = false → de wrap-keten blijft exact zoals nu (vlag-uit byte-identiek).
// Aanzetten: ?cornerButt=1 of localStorage 'cornerButt'='1'.
// Werkt ALLEEN op geconfigureerde hoeken (cfg); zonder cfg gebeurt er niets.
export function isCornerButtMode() {
  return readFlag('cornerButt', false);
}

// FASE 2b — stompe-butt offset-fix. De aansluitende strip/paneel eindigen 8 mm vóór de
// ACHTERKANT van de aanzicht-strip (anker = main lat+paneel, niet main lat+voeg), en de
// aansluitende lat 5 mm vrij van de aanzicht-wand (i.p.v. 10). Corrigeert het anker van de
// suggestie-formules + de hoek-schematiek (HoekAansluitDetail) consistent.
// DEFAULT = false → exact de huidige overgangsvoeg-formules (vlag-uit byte-identiek).
// Aanzetten: ?corner85=1 of localStorage 'corner85'='1'. Noodrem: ?corner85=0.
export function isCorner85() {
  return readFlag('corner85', false);
}
