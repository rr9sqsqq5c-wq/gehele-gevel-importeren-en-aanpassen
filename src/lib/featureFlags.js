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

// GROOTHUIS WILDVERBAND — nieuw GENERATIEF verband (src/lib/groothuisWildverband.js), NÁÁST
// het bestaande wildverband. Selecteerbaar als verband 'groothuis_wildverband'. Per
// groep-materiaal rolt een 6-rij module uit de regels (om-en-om D/K-start + strek, midden vrij,
// max 4 strek / max 2 kop / max 1× 2-koppen, wild, sluit-drieklezoor); panelen vol met 2500 +
// 1 restpaneel. DEFAULT = false → de optie/het pad bestaan alleen met de vlag aan.
// Aanzetten: ?groothuisWildverband=1 of localStorage 'groothuisWildverband'='1'.
export function isGroothuisWildverband() {
  return readFlag('groothuisWildverband', false);
}

// GROOTHUIS WILDVERBAND 2 — VAST 6-rij mal (productiemal, src/lib/groothuisWildverband2.js), NÁÁST
// groothuis 1. Selecteerbaar als verband 'groothuis_wildverband_2'. Twee tripletten (3 drieklezoor-
// start + 3 kop-start); om-en-om d/k, sluitsteen-regel, max 4 strek, geen volle-strek-stapel,
// muizentrap ≤4; besturing (backtracking) kiest per laag welke rij. Panelen vol met 2500 + rest.
// DEFAULT = false → de optie/het pad bestaan alleen met de vlag aan (vlag-uit byte-identiek).
// Aanzetten: ?groothuisWildverband2=1 of localStorage 'groothuisWildverband2'='1'. Noodrem =0.
export function isGroothuisWildverband2() {
  return readFlag('groothuisWildverband2', false);
}

// SYNTHETISCHE CALC-WAND — UI-control om een wand op te voeren door lengte × hoogte (mm) +
// vaste dikte in te tikken, zonder IFC. De wand vervult het wand-contract en is als één-wand-
// groep bekleedbaar (3D + 2D + uittrekstaat). SESSIE-ONLY (synthetic:true → uitgesloten van
// persist), GEEN IFC-export, GEEN georef. DEFAULT = false → de control + alle synthetische
// logica zijn inert en de app is byte-identiek. Aanzetten: ?syntheticWall=1. Noodrem =0.
export function isSyntheticWall() {
  return readFlag('syntheticWall', false);
}

// FASE 2 — maatgevoerde rechthoek-stripZones met eigen verband per gevelvlak (in 2D te
// tekenen). DEFAULT = true (gepromoveerd 2026-06-22). Eén gedeelde regio-functie
// buildStripZoneRegions (zoneRegions.js) voedt scherm/3D (App.jsx:3556) én export
// (App.jsx:5300); wildverband-in-zone via de truth-rows (zoneRegions buildZoneBondRows).
// Blast-radius: uitsluitend niet-penant-vlakken met >=1 ENABLED stripZone; penant-vlakken
// en 0-zone-vlakken lopen het ongewijzigde pad. NOODREM: ?featureZones=0 (de regio-functie
// wordt dan nooit aangeroepen → byte-identiek aan vóór, ook op projecten met getekende zones).
export function isFeatureZones() {
  return readFlag('featureZones', true);
}

// REPROJECT_OPENING_POLYGON — in het best-fit-pad (handmatige groepen) behoudt
// reprojectOpening (facadePlane.js) de OPENING-POLYGOON i.p.v. 'm tot z'n bounding box te
// reduceren (polyPts:null). Lost op dat een concave/L-vormige opening (bv. wand 60148,
// opening 64264, 6-punts L) het massieve stuk binnen de bbox-maar-buiten-de-polygoon
// foutief wegknipt; daarna lopen 2D/3D/export gelijk met werktekening/uittrekstaat (die de
// polygoon al behouden). DEGENERAAT-GUARD: > MAX_OPENING_POLY_PTS punten → bbox-fallback,
// zodat een ontspoorde polygoon (expressID 10891, 99964 punten) de clipper niet plat legt.
// DEFAULT = true (gepromoveerd 2026-06-23): de massieve hoek binnen-de-bbox-buiten-de-L
// wordt nu correct bekleed in best-fit-groepen; 2D/3D/export lopen gelijk met werktekening/
// uittrekstaat. Rechthoekige openingen blijven bbox (axis-aligned-rect-guard) → onveranderd;
// degeneraat (> MAX_OPENING_POLY_PTS) → bbox-fallback. NOODREM: ?reprojectOpeningPolygon=0
// (→ reprojectOpening polyPts:null, exact het oude gedrag).
export function isReprojectOpeningPolygon() {
  return readFlag('reprojectOpeningPolygon', true);
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

// DROP_OVERSIZED_OPENINGS (bron-guard) — een opening die HOGER is dan z'n eigen wand
// (op.y + hoogte > wandhoogte + tolerantie) wordt geweigerd in buildFullGroupFacadePattern
// (de plek waar openingen de bekledings-pijplijn in komen). Lost de stale/corrupte opgeslagen
// data op waarin een volledige venster-L (2520 mm) op een 300 mm hoge vloerband is blijven
// plakken: zo'n opening valt, naar groep-coördinaten omgezet, samen met de vensteropening van
// de verdieping erboven → shouldMerge merget → mergeTwo slaat die L plat tot een RECHTHOEK →
// de massieve hoek wordt over-geknipt (bgg overleeft want heeft geen band eronder, daarboven
// niet). Weigeren = exact wat een VERSE parse al doet (band krijgt geen opening). Vangt zowel
// het direct- als het best-fit-pad (best-fit voert virtuele wanden door dezelfde functie), dus
// 2D/3D/staat/werktekening/groothuis/wildverband ineens. Openingen die in hun wand passen
// blijven ONGEMOEID → byte-identiek. DEFAULT = true (terugdraaibaar).
// NOODREM: ?dropOversizedOpenings=0 (of localStorage 'dropOversizedOpenings'='0'/'false') →
// check uit, exact het oude gedrag (de te-hoge opening blijft staan en merget weer).
export function isDropOversizedOpenings() {
  return readFlag('dropOversizedOpenings', true);
}

// STABLE_GROUP_CAMERA — robuuste groep-camera, los van laad-/herbereken-timing:
//  (1) FocusGroupCamera lerpt camera.up naar wereld-up → de focus staat altijd recht/horizontaal
//      (geen kanteling die overbleef van eerder orbiten).
//  (2) projectMatrix (Viewer3D) herberekent óók wanneer de model-up-as wijzigt (niet alleen bij
//      een walls-wissel) → de camera-richting kan niet op een stale matrix blijven hangen na restore.
//  (3) klikken op een 3D-element licht 'm op in de lijst ZONDER de camera te verplaatsen (de
//      b976e70-sprong eruit); klikken op een groep in de lijst focust de camera wél nog.
// Verklaart waarom 'groothuisWildverband aan' de camera 'goed' leek: dat forceerde een extra
// recompute waardoor projectMatrix toevallig op het juiste moment opnieuw werd opgebouwd.
// DEFAULT = true (terugdraaibaar). Vlag UIT → byte-identiek: (1) geen up-reset, (2) dep == [walls],
// (3) 3D-klik zet weer activeGroupId → camera springt zoals voorheen.
// NOODREM: ?stableGroupCamera=0 (of localStorage 'stableGroupCamera'='0'/'false').
export function isStableGroupCamera() {
  return readFlag('stableGroupCamera', true);
}
