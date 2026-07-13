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

// Handmatige einduiteinde-extensie (endExtensions) laat de bekleding doorlopen VOORBIJ de
// gevelrand, zodat ze aansluit op de aangrenzende gevel (stompe hoek — één vlak gaat niet de
// hoek om). Dekt nu alle drie de lagen:
//   • strips  — maskRowsToContours rekt de globale buitenrand op (a_outer −= extendLeft,
//               b_outer += extendRight); interne voegen/opening-contouren blijven ongemoeid;
//   • latten  — de buitenste horizontale latte aan elke rand schuift mee (View2D + IFC-export);
//   • panelen — het buitenste paneel aan elke rand schuift mee (View2D + IFC-export).
// DEFAULT = true (klantverzoek): byte-identiek zolang geen extensie is ingevuld (extend=0 →
// geen verandering). NOODREM: ?keepEndExtension=0 (of localStorage 'keepEndExtension'='0')
// zet de strip-/latten-/panelen-extensie in de views UIT → oud gedrag.
export function isKeepEndExtension() {
  return readFlag('keepEndExtension', true);
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

// GROOTHUIS WILDVERBAND 2 — VASTE 6-rij mal (productiemal, src/lib/groothuisWildverband2.js), NÁÁST
// groothuis 1. Selecteerbaar als verband 'groothuis_wildverband_2'. Klant heeft de 6 rijen handmatig
// vastgelegd (rij 1 onder): om-en-om drieklezoor/kop begin+eind, max 5 strek, geen twee koppen pal
// boven elkaar, muizentrap 6; elke rij 2511 mm → rechthoekige tegel, verticaal period-6 herhaald.
// DEFAULT = true (gepromoveerd 2026-07-01 op klantverzoek): de optie staat standaard in het verband-
// menu. Alle groothuis-2-code zit achter deze vlag; verband 'groothuis_wildverband_2' wordt alleen
// aangeboden/gebruikt als 'ie AAN is. NOODREM: ?groothuisWildverband2=0 (of localStorage '0'/'false')
// verbergt de optie weer en herstelt het gedrag van vóór (bestaande projecten kiezen dit verband niet).
export function isGroothuisWildverband2() {
  return readFlag('groothuisWildverband2', true);
}

// SYNTHETISCHE CALC-WAND — UI-control om een wand op te voeren door lengte × hoogte (mm) +
// vaste dikte in te tikken, zonder IFC. De wand vervult het wand-contract en is als één-wand-
// groep bekleedbaar (3D + 2D + uittrekstaat). SESSIE-ONLY (synthetic:true → uitgesloten van
// persist), GEEN IFC-export, GEEN georef. DEFAULT = true (gepromoveerd 2026-07-08 op verzoek):
// de calc-wand-control staat standaard in het import-paneel. Omdat alles sessie-only is, blijven
// opgeslagen projecten en de IFC-export ongemoeid. NOODREM: ?syntheticWall=0 (of localStorage
// 'syntheticWall'='0'/'false') verbergt de control weer en maakt de synthetische logica inert.
export function isSyntheticWall() {
  return readFlag('syntheticWall', true);
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

// MAL_RECEPT — noodrem/defect-containment op de "⬇ Mal recept CSV"-export. De export telt
// rijen als max(1, floor(H/lagenmaat)) i.p.v. de canonieke facadeData.rows[] (zie
// spike/diagnose/formule-audit.md): bij 1972×434 levert dat 3 mal-sleuven waar er 4 horen, en
// de uitvoer schrijft paneel-Y's waar de machine mal-lokale Y's verwacht. De output is dus
// onbruikbaar én misleidend → knop DEFAULT UIT tot MOLD_FROM_CANONICAL klaar is.
// LET OP: dit is GEEN byte-identieke UIT-tak — de knop verdwijnt bewust (defect-containment).
// Terugzetten: ?malRecept=1 (of localStorage 'malRecept'='1').
export function isMalRecept() {
  return readFlag('malRecept', false);
}

// PLAN_BRIDGE — postMessage-brug voor inbedding als iframe in de externe planningstool
// (Brickboard-planner). Alleen actief achter deze vlag. DEFAULT = false → er wordt GEEN
// message-listener geregistreerd en GEEN 'ready'-ping verstuurd; het gedrag is byte-identiek
// aan zonder de vlag (puur additief, geen enkele bestaande codepad wordt geraakt).
// Aanzetten (door de planner bij het inbedden): ?planBridge=1 in de iframe-URL, of
// localStorage 'planBridge'='1'. De parent-origin wordt bepaald uit ?bridgeOrigin=<origin>
// of document.referrer; inkomende berichten worden op event.origin gecontroleerd. Zie
// src/lib/planBridge.js.
export function isPlanBridge() {
  return readFlag('planBridge', false);
}

// SPARING_ELEMENTEN — importeer NIET-wand IFC-onderdelen (leidingen, kanalen, proxies, sparing-
// objecten — geen raam/deur), toon ze in 3D, en knip de steenstripgevel er rondom weg volgens een
// globale offset (marge). DEFAULT = false → geen import-knop, geen sparing-state, geen extra knip;
// het gedrag is byte-identiek aan zonder de vlag (puur additief). Aanzetten: ?sparingElementen=1
// (of localStorage 'sparingElementen'='1'). Zie src/lib/sparingElements.js.
export function isSparingElementen() {
  return readFlag('sparingElementen', false);
}

// OPENING_FROM_KOZIJN — de opening-rechthoek die uit de bekleding wordt geknipt volgt het RAAM/DEUR
// (IfcWindow/IfcDoor = het kozijn) i.p.v. de ruwe structurele opening (IfcOpeningElement/void). Zo
// wordt "gerekend vanaf rand kozijn" i.p.v. rand opening. Werkt alleen als er een fill-relatie
// (IfcRelFillsElement) tussen opening en raam/deur bestaat; anders valt het terug op de void.
// DEFAULT = false → void eerst (byte-identiek). Aanzetten: ?openingFromKozijn=1.
export function isOpeningFromKozijn() {
  return readFlag('openingFromKozijn', false);
}

// KOZIJN_OFFSET — globale (hele-gebouw) per-zijde marge (links/rechts/boven/onder, mm) tussen de
// KOZIJNRAND en de steenstripgevel (strips + panelen + latten volgen dezelfde groupOpenings, dus
// één inflate raakt alle drie). Positief = bekleding wijkt terug (groter gat rond het kozijn).
// Bevat óók de melding "opening zonder kozijn": een raam/deur-formaat void zonder fill wordt niet uit
// de gevel geknipt → ⚠️. DEFAULT = false → geen UI, offsets = 0, geen melding (byte-identiek).
// Aanzetten: ?kozijnOffset=1 (of localStorage 'kozijnOffset'='1'). Noodrem: ?kozijnOffset=0.
export function isKozijnOffset() {
  return readFlag('kozijnOffset', false);
}

// OPENING_EDGE_QUARTER — aanvullende metselregel bij een opening-rand. Nu: een splinter tegen de
// opening wordt geforceerd naar een hele Kop (½ steen). Met de vlag: de minimummaat mag zakken naar
// ¼ steen wanneer het forceren naar een Kop twee strips BOVEN ELKAAR (voor/na de opening) bijna even
// groot maakt (delta ≤ instelbare drempel minStackDelta, default 50 mm) — dan pakt die rij een ¼-steen
// zodat de rijen weer verspringen. DEFAULT = false → exact de huidige Kop-regel (byte-identiek).
// Aanzetten: ?openingEdgeQuarter=1. Noodrem: ?openingEdgeQuarter=0.
export function isOpeningEdgeQuarter() {
  return readFlag('openingEdgeQuarter', false);
}

// SHOW_KOZIJNEN — toont raam/deur-openingen ook als 3D-doos (kozijn) in de viewer, ter visuele
// controle van de openingen t.o.v. de bekleding. De doos volgt de opening-rechthoek (die met
// openingFromKozijn=1 de kozijn-rand volgt). DEFAULT = false → geen extra 3D-geometrie (byte-
// identiek). Aanzetten: ?showKozijnen=1.
export function isShowKozijnen() {
  return readFlag('showKozijnen', false);
}

// OUTSIDE_DIR_SYNC — één waarheid voor de buitenzijde-richting over 3D, 2D én IFC-export. Dicht
// twee gaten waardoor die drie konden divergeren:
//   (A) 2D volgde alléén "Buitenzijde omdraaien" (outsideDirFlip); "Buitenzijde selecteren"
//       (manualOutsideDir → resolvedOutside.outsideDir) bereikte de 2D-spiegel nooit. Met de vlag
//       spiegelt 2D op de EFFECTIEVE richting die 3D/export gebruiken, met de AUTO-detectie als
//       ijkpunt: mirror2D = (effDir * autoOutsideDir < 0), effDir = flip ? -R : R. Voor flip-only
//       (geen manual → R == autoOutsideDir) is dat exact gelijk aan outsideDirFlip → byte-identiek.
//   (B) De per-wand IFC-export-fallback (ifc.js, tak zonder facadeData.rows) paste outsideDirFlip
//       NIET toe (de normale groep-tak wél) → strip aan de verkeerde kant in dat randgeval.
// Om (A) mogelijk te maken bewaart resolveOutsideDirections de auto-richting apart als
// resolvedOutside.autoOutsideDir (manual overschrijft outsideDir wél, autoOutsideDir NIET).
// DEFAULT = true (gepromoveerd 2026-07-13 op verzoek): 2D én IFC-export volgen dezelfde buitenzijde
// als 3D (ook "Buitenzijde selecteren"). NOODREM: ?outsideDirSync=0 (of localStorage
// 'outsideDirSync'='0'/'false') → 2D leest weer alleen outsideDirFlip, de export-fallback dropt de
// flip en er wordt geen autoOutsideDir opgeslagen (exact het gedrag van vóór, byte-identiek).
export function isOutsideDirSync() {
  return readFlag('outsideDirSync', true);
}

// BEST_FIT_FLUSH_SIDE — corrigeert de kant van het best-fit gevelvlak wanneer de auto-buiten-
// richting uit een LAGE-confidence heuristiek komt en aantoonbaar fout is. Oorzaak van "strips
// achterstevoren + Diepte-spreiding X mm"-melding: wanden die midden in de gebouw-bbox liggen
// (beide bbox-testpunten binnen) krijgen hun outsideDir uit deprecated bbox-afstand / material-
// layer (conf 0.2–0.75) — die kan de VERKEERDE kant kiezen. Wanden van verschillende dikte die
// flush liggen op de beklede kant geven op de fout-gekozen kant een grote diepte-spreiding.
// Met de vlag: als de winnende stem conf < 0.9 heeft ÉN de gekozen kant niet vlak ligt (residu >
// tolerantie) terwijl de andere kant WÉL vlak ligt (residu ≤ tolerantie), flip naar de flush-kant
// (= de beklede kant; groep-wanden zijn co-planair op de gevel). Confidente stem (≥0.9: bbox-exit
// cross-product / IfcRelSpaceBoundary) blijft ongemoeid; gelijke dikte (beide kanten vlak) → geen
// flip. DEFAULT = true (gepromoveerd 2026-07-13 op verzoek, end-to-end node-geverifieerd op BIL-MOO:
// wanden 26024971/26037507+26037284 → outsideDir -1, residu 1mm, 0 waarschuwingen). NOODREM:
// ?bestFitFlushSide=0 (of localStorage '0'/'false') → exact de best-fit van vóór (byte-identiek).
export function isBestFitFlushSide() {
  return readFlag('bestFitFlushSide', true);
}

// GROUP_START_WIDEST — schone rechthoekige omtrek op de breedste wand voor een best-fit-groep. Staan
// er wanden bóven elkaar met verschillende breedte (bv. een smallere hoofdwand + een bredere band),
// dan trapt de bekleding-rand nu per wand: maskRowsToContours (facadePlane.js) knipt elke rij tot de
// wand-footprint op díe hoogte, dus een 20 mm terugliggende wand geeft een 20 mm inspringende rand.
// Met de vlag worden BEIDE buitenranden van elke rij doorgetrokken tot de randen van de BREEDSTE wand
// (groep-lokaal gT0 = min lengthStart, gT1 = max lengthEnd) → één rechte linker- én rechterrand;
// terugliggende smallere wanden worden tot die rand bekleed (kleine strook zonder wand erachter).
// Beide randen (kijkrichting-onafhankelijk: de gevel rendert van buiten gespiegeld, dus één groep-
// lokale kant zou de verkeerde visuele zijde raken). DEFAULT = true (gepromoveerd 2026-07-13 op
// verzoek, node-geverifieerd: links=0 rechts=3400 op wanden 26024963+26024971). NOODREM:
// ?groupStartWidest=0 (of localStorage '0'/'false') → masker knipt weer strak op de wand-footprint
// per hoogte (byte-identiek aan vóór).
export function isGroupStartWidest() {
  return readFlag('groupStartWidest', true);
}

// VENTILATIE_ZONE — ventilatieopening (klein ongevuld gat bóven een raam/kozijn, type 'sparing')
// krijgt: (1) het gat wordt OPEN geknipt (retag naar type 'ventilatie', isNamedOpening cut het),
// en (2) een rechthoekige ZONE eromheen (gecentreerd op het gat) met het LOODRECHTE verband
// t.o.v. de groep (halfsteens ↔ staand_tegelverband). Instelbare hoogte×breedte via
// settings.ventilatie {enabled,breedte,hoogte}. Hergebruikt het bestaande stripZones/zoneRegions-
// systeem, dus 2D/3D/IFC-export lopen mee. Detectie: kleine 'sparing' (≤ VENT_MAX) met x-overlap
// bóven een raam in dezelfde wand. DEFAULT = false → geen retag, geen zone (byte-identiek; de
// 'sparing' blijft dichtgemetseld zoals nu). Aanzetten: ?ventilatieZone=1. Noodrem: ?ventilatieZone=0.
// LET OP: retag gebeurt bij parse → cacheKey bevat de vlag + CACHE_SCHEMA_V is gebumpt (re-import).
export function isVentilatieZone() {
  return readFlag('ventilatieZone', false);
}

// ── Vlaggen-schakelaars (UI) ────────────────────────────────────────────────────────────────
// Registry van alle DEFAULT-UIT vlaggen, zodat ze via een UI-paneel aan/uit gezet kunnen worden
// (i.p.v. handmatige ?param=1 in de URL). `reimport` = werkt pas na opnieuw importeren (parse-tijd);
// `advanced` = experimenteel/intern (kan bestaand gedrag veranderen).
export const FLAG_REGISTRY = [
  { key: 'sparingElementen',     label: 'Sparing-onderdelen',        note: 'Niet-wand IFC-onderdelen importeren + de bekleding er rondom sparen.' },
  { key: 'openingFromKozijn',    label: 'Openingen op kozijn-rand',  note: 'Knip vanaf raam/deur (kozijn) i.p.v. de ruwe structurele opening.', reimport: true },
  { key: 'kozijnOffset',         label: 'Kozijn-offset (L/R/B/O)',   note: 'Globale marge per zijde tussen kozijnrand en bekleding (strips+panelen+latten) + melding bij opening zonder kozijn.' },
  { key: 'openingEdgeQuarter',   label: 'Opening-rand ¼-steen',      note: 'Sta ¼ steen toe tegen een opening i.p.v. altijd ½ (kop) wanneer twee strips boven elkaar bijna even groot worden. Delta instelbaar.' },
  { key: 'showKozijnen',         label: 'Kozijnen tonen in 3D',      note: 'Raam/deur als 3D-doos ter visuele controle.', reimport: true },
  { key: 'ventilatieZone',       label: 'Ventilatiezone (gedraaid verband)', note: 'Klein gat boven een raam wordt open geknipt + een zone met loodrecht verband eromheen (instelbaar per groep).', reimport: true },
  { key: 'cornerButt',           label: 'Stompe hoek',               note: 'Geen omslag-steenstrips op het loodrechte vlak.' },
  { key: 'corner85',             label: 'Hoek-detail 85°',           note: '' },
  { key: 'groothuisWildverband', label: 'Groothuis wildverband 1',   note: 'Het oudere groothuis-verband (versie 2 staat standaard aan).' },
  { key: 'malRecept',            label: 'Mal recept CSV',            note: 'CSV-export per paneel — bekende telbug (defect-containment).', advanced: true },
  { key: 'newOpenings',          label: 'Nieuwe opening-afleiding',  note: 'Experimenteel alternatief parse-pad; kan bestaande resultaten veranderen.', reimport: true, advanced: true },
  { key: 'openingUpAxisFix',     label: 'Opening up-as fix',         note: 'Experimenteel.', reimport: true, advanced: true },
  { key: 'selfContainedProjects',label: 'Self-contained projecten',  note: 'Experimenteel.', advanced: true },
  { key: 'planBridge',           label: 'Planner-brug (iframe)',     note: 'Intern; alleen voor inbedding in de planningstool.', advanced: true },
];

// Huidige effectieve waarde van een vlag (URL > localStorage > default-false).
export function getFlag(key) { return readFlag(key, false); }
// Zet een vlag in localStorage (voor de UI-schakelaars).
export function setStoredFlag(key, on) { try { localStorage.setItem(key, on ? '1' : '0'); } catch {} }
