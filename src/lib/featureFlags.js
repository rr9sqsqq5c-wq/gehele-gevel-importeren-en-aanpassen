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

// FASE 1 — strips behouden hun handmatige einduiteinde-extensie (endExtensions) voorbij
// de gevelrand. maskRowsToContours rekt dan ALLEEN de globale buitenrand van de groep op
// (a_outer −= extendLeft, b_outer += extendRight); interne element-voegen en opening-
// contouren blijven ongemoeid. Voor de stompe hoek (één vlak gaat niet de hoek om).
// DEFAULT = false → de mask knipt strips exact op de footprint zoals nu (vlag-uit
// byte-identiek). NOODREM: ?keepEndExtension=0 (of localStorage 'keepEndExtension'='0').
// SCOPE: alleen strips (best-fit/handmatige groepen); panelen/latten volgen in Fase 2.
export function isKeepEndExtension() {
  return readFlag('keepEndExtension', false);
}

// GEOMETRY_DERIVED_ORIGIN (Stap 1) — de RENDER-origin wordt afgeleid uit de geometrie
// (AABB-center van wat web-ifc default uitspuugt: boom toegepast, context-WCS #20 NIET),
// i.p.v. de context-WCS #20 (georef-bron) blind af te trekken. Lost op dat een Revit-
// shared-export ~485 km verschuift (we trekken een offset af die nooit in de geometrie
// zat). De #20/refLatLong/trueNorth/upAxis verhuizen naar worldAnchor (metadata, ALLEEN
// voor export — Stap 2 — in Stap 1 alleen gevuld/gepersisteerd, NIET toegepast).
// SCOPE: alleen het parse-/import-pad + buildProjectMatrix-translatiebron + opslag-schema.
// Het laad-/restore-pad wordt nergens geraakt: ontbreekt renderOrigin (oud project) →
// buildProjectMatrix valt terug op het ongewijzigde #20-pad (byte-identiek).
// DEFAULT = true (gepromoveerd 2026-06-22, FIX A): nieuwe imports leiden de render-origin uit
// de geometrie af en leggen #20+refLatLong+trueNorth+upAxis als worldAnchor vast → export
// georefereert weer correct (BIL-MOO 485 km → 0 mm). Render/export lezen UITSLUITEND module-
// state (renderOrigin/worldAnchor), nooit de vlag → opgeslagen projecten ongemoeid: een vlag-
// UIT-geparset project heeft geen renderOrigin → buildProjectMatrix valt terug op het #20-pad.
// NOODREM: ?geometryDerivedOrigin=0 (of localStorage 'geometryDerivedOrigin'='0'/'false')
// herstelt het oude parse-gedrag exact.
export function isGeometryDerivedOrigin() {
  return readFlag('geometryDerivedOrigin', true);
}

// RESTORE-UP-AS — bij het herstellen van een opgeslagen project (loadProjectState /
// loadProject) wordt de up-as afgeleid uit de meerderheids-heightAxis van de herstelde
// wanden, i.p.v. de module-default 'z' te laten staan (projectCoordinates.js:28). Lost de
// "bijna-horizontaal / normaal ∥ up-as"-melding op die bij een heropende Y-up-sessie vuurt.
// DERIVE-ONLY: niets gepersisteerd, geen storage-schema-wijziging.
// DEFAULT = true (gepromoveerd 2026-06-22): een heropende Y-up-sessie hield anders de
// module-default 'z' aan → best-fit zag elke gevel als bijna-horizontaal vlak en gaf de
// "vlak-normaal ∥ model-up-as"-melding bij het maken van een groep. DERIVE-ONLY (majority
// heightAxis van de herstelde wanden); niets gepersisteerd. NOODREM: ?restoreUpAxis=0.
export function isRestoreUpAxis() {
  return readFlag('restoreUpAxis', true);
}

// WILDVERBAND KOPPELSTRIP (Fase 1 — alleen de 🧱-planner). Het wildverband wordt als
// ÉÉN doorlopend verband (fase = rij % 6) over de gevel gelegd en bij de paneelranden
// opgeknipt: de doorgesneden strip wordt een variabele-lengte KOPPELSTRIP (in-situ) die
// de naad + paneelvoeg overbrugt. Startpaneel ligt links dicht, volgpanelen links open.
// Vervangt het losse-module-per-paneel-pad (autoFillRow/buildFacadeFromCustomPanel).
// DEFAULT = true (gepromoveerd 2026-06-22): zonder dit degradeerde verband='wildverband' in
// het standaard-patroonpad (pattern.js kent geen wildverband) stilletjes naar TEGELVERBAND.
// Met de vlag aan voeden de truth-rows (buildTruthRows) álle output-paden uit één bron:
// 2D (App.jsx:3290/View2D), 3D (Viewer3D), IFC-export (App.jsx:4872), werktekening
// (Werktekening.jsx:340) én uittrekstaat (Uittrekstaat.jsx). buildBestFitFacadePattern levert
// de groepsmaat; de rows worden vervangen.
// NOODREM: ?wildverbandKoppelstrip=0 (of localStorage '0'/'false') → oude (tegelverband-)pad.
export function isWildverbandKoppelstrip() {
  return readFlag('wildverbandKoppelstrip', true);
}

// FASE 2 — maatgevoerde rechthoek-stripZones met eigen verband per gevelvlak.
// Met de vlag UIT wordt de stripZone-regio-functie NOOIT aangeroepen: de generator leest
// stripZones niet en de output is byte-identiek aan de nulmeting (scherm én export), ook
// op een project dat al getekende zones bevat. DEFAULT = false.
// Aanzetten: ?featureZones=1 of localStorage 'featureZones'='1'.
// Blast-radius: uitsluitend niet-penant-vlakken met >=1 ENABLED stripZone; penant-vlakken
// en 0-zone-vlakken lopen het ongewijzigde (byte-identieke) pad.
export function isFeatureZones() {
  return readFlag('featureZones', false);
}

// TRUENORTH_METADATA_ONLY (FIX C) — project-noord overal. GEEN pad past trueNorth toe op de
// GETOONDE geometrie: vlag AAN → de Ry(trueNorth)-rotatie verlaat buildProjectMatrix
// (projectCoordinates.js) zodat 3D = 2D = export allemaal in het project-noord-frame staan;
// trueNorth leeft uitsluitend als export-metadata (IfcGeometricRepresentationContext.TrueNorth
// uit worldAnchor, geschreven in exportGroupsToIfc). Per-element-geometrie/coursing (horizontaal
// halfsteens) zit al in dat frame en blijft ongemoeid. Reële-noord-3D kan later als view-toggle.
// DEFAULT = true (gepromoveerd 2026-06-22, FIX C): 3D = 2D = export staan allemaal in project-
// noord; geen 38°-scheefstand tussen 3D en de werktekeningen meer. trueNorth blijft als export-
// metadata behouden (IfcGeometricRepresentationContext.TrueNorth). Node-gevalideerd; A-precedent.
// NOODREM: ?trueNorthMetadataOnly=0 (of localStorage 'trueNorthMetadataOnly'='0'/'false') →
// herstelt het oude gedrag exact (3D past Ry(trueNorth) toe, export schrijft geen trueNorth).
export function isTrueNorthMetadataOnly() {
  return readFlag('trueNorthMetadataOnly', true);
}
