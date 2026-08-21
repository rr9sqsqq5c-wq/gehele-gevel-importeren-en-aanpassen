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

// END_TRIM — een NEGATIEF einduiteinde (inkorten) kort ook de PANEEL-/LATTEN-DATA in, niet alleen visueel.
// Nu wordt inkorten enkel als rode "sv"-lijn getekend + visueel geclipt in de werktekening; het buitenste paneel/lat
// houdt z'n oude maat (buildGroupPanels/buildFacadeLatten kappen de waarde af met Math.max(0,…) en extendPanelsAtEnds/
// extendLattenAtEnds negeren negatief). Met de vlag schuift de buitenste paneel-/lattenrand écht mee → maat-label +
// productielijst kloppen in ÁLLE weergaven (§8b). Buitenste element ≤ 0 na inkorten → vervalt (geen cascade). Strips
// (de bond) blijven ongemoeid. DEFAULT = false → Math.max(0,…) blijft → byte-identiek. Aanzetten: ?endTrim=1.
export function isEndTrim() {
  return readFlag('endTrim', false);
}

// END_EXT_SEPARAAT — elk einduiteinde-onderdeel (strips/latten/panelen) verlengt/inkort ONAFHANKELIJK. Nu volgen de
// LATTEN de PANEEL-verlenging (ze worden op de — verlengde — paneel-extent geknipt, buildFacadeLatten), dus een
// paneel-uitloop sleept de latten mee ook al staat "Latten" op 0. Met de vlag wordt de latten-clip op [0, groupWidth]
// geklemd → de latten volgen de paneel-uitloop NIET; ze verlengen enkel met hun eigen "Latten"-waarde (extendLattenAtEnds).
// Strips/panelen waren al onafhankelijk. DEFAULT = false → latten volgen paneel (byte-identiek). Aanzetten: ?endExtSeparaat=1.
export function isEndExtSeparaat() {
  return readFlag('endExtSeparaat', false);
}

// PANEEL_STARTLIJN — de GROEP-brede panelen starten op de projectstart/startlijn (peil), net als de strips
// (effectiveMinH, pattern.js) en de zone-panelen (buildZoneBackingPanels): panelen onder de startlijn worden
// afgesneden zodat het onderste paneel op de startlijn begint. Nu doet buildGroupPanels dat alleen bij startLijn<0;
// bij een POSITIEVE projectstart starten de groep-panelen op y=0 (mismatch met de strips). DEFAULT = false →
// panelen starten op y=0 (byte-identiek). Aanzetten: ?paneelStartLijn=1.
export function isPaneelStartLijn() {
  return readFlag('paneelStartLijn', false);
}

// EXPORT_END_EXT_FIX — de IFC-export verlengt panelen/latten NIET meer dubbel. Sinds unifiedPanels/unifiedLatten
// bakken buildGroupPanels/buildFacadeLatten de (positieve) verlenging zelf (net als 3D), maar de export-glue
// _applyCornerToPanels/_applyCornerToLats verlengt ze daarná NOG een keer → export = 2×, 3D = 1×. Met de vlag worden
// die twee glue-functies trim-only (net als _applyCornerToRows voor de strips) → export volgt 3D exact (1×). Inkorten
// loopt dan via endTrim in de gedeelde motor. DEFAULT = false → dubbele verlenging blijft (byte-identiek). Aanzetten:
// ?exportEndExtFix=1. Alleen relevant bij een groep-einduiteinde ≠ 0.
export function isExportEndExtFix() {
  return readFlag('exportEndExtFix', false);
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

// GEEN_VERBAND — extra metselverband-keuze "geen": het BASISVLAK (buiten de tekenzones) krijgt
// GEEN bekleding — geen steenstrips, geen panelen, geen latten — zodat je een blanco gevel houdt
// om zelf tekenzones op te leggen. De zones brengen hun eigen verband/inhoud. DEFAULT = false →
// de optie bestaat niet → settings.verband kan nooit 'geen' zijn → byte-identiek aan vóór.
// NOODREM: ?geenVerband=0 → isBlankBaseVerband() valt terug op false → een 'geen'-project rendert
// weer het doorlopende fallback-verband (buildRowPiecesForWidth zonder kop-offset) i.p.v. blanco.
export function isGeenVerband() {
  return readFlag('geenVerband', false);
}

// Eén bron voor de "blanco basisvlak"-conditie: alleen waar wanneer de vlag AAN staat én de groep
// (of zone) expliciet verband 'geen' heeft. Alle consumenten (2D/3D/export/werktekening/uittrekstaat)
// gaten hierop; met de vlag UIT is dit overal false → geen enkele gedragswijziging.
export function isBlankBaseVerband(verband) {
  return verband === 'geen' && isGeenVerband();
}

// PANEEL_OPTIMALISATIE — verdeel elke paneel-rechthoek optimaal: kolommen met de naad op de
// DOORLOPENDE steen (k×(steenL+stoot) vanaf groep-0) → ALLE naden liggen in dezelfde stootvoeg-fase
// → koppelstenen enkel OM-EN-OM (niet op elke rij, ook in smalle zones waar de 5-strek-regel niet
// grijpt); rijen een EVEN aantal lagen (halfsteens) én binnen het gewicht (≤ maxKg, hard ≤ maxKg+10,
// i.p.v. vaste latten-splits → geen mini-panelen). Plus: gestapelde panelen in één kolom worden
// samengevoegd (mergeStackedColumns) en snipper-zones < 50 mm vervallen.
// DEFAULT = true (gepromoveerd 2026-08-12 op klantverzoek "standaard aan"): het is de normale
// paneelverdeling in alle weergaven (2D/3D/export/werktekening/uittrekstaat). DERIVE-ONLY (panelen
// worden nergens opgeslagen → opgeslagen projecten ongemoeid). NOODREM: ?paneelOptimalisatie=0 (of
// localStorage 'paneelOptimalisatie'='0'/'false') → exact de oude greedy breedte-verdeling + latten-
// splits (byte-identiek aan vóór).
export function isPaneelOptimalisatie() {
  return readFlag('paneelOptimalisatie', true);
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

// CONCAVE_OPENING_MERGE — twee overlappende openings op één wand (bv. een DEUR (vol) naast een RAAM
// (hoog)) worden nu tot hun echte, niet-convexe (L/U-vormige) RECTILINEAIRE UNIE samengevoegd i.p.v.
// tot hun bounding box. Lost op dat het massieve muurdeel ONDER het raam (naast de deur) binnen de
// bbox valt en foutief als void wordt weggeknipt → onbekleed. shouldMerge (overlapX>50 && overlapY>50)
// en de rest van de pijplijn blijven gelijk; alleen mergeTwo levert een unie-polygoon (splitAround-
// Openings/polyXRangesAtY + fixOpeningEdgePieces werken al op polyPts). Lukt de unie niet (disjunct/
// pinch) → bbox-fallback. DEFAULT = false → altijd bbox (byte-identiek). Aanzetten: ?concaveOpeningMerge=1.
export function isConcaveOpeningMerge() {
  return readFlag('concaveOpeningMerge', false);
}

// ZONE_START_STOP — per tekenzone een numerieke Start-X en Stop-X (mm) intypen i.p.v. alleen tekenen,
// plus een "hele steen"-snap voor optimalisatie. De velden bewerken de BESTAANDE zone-rechthoek
// (z.x = Start-X, z.x+z.width = Stop-X); geen nieuw dataveld → opgeslagen projecten ongemoeid, en de
// zone-motor (buildStripZoneRegions.zRect) leest z.x/z.width al → 3D/2D/IFC volgen automatisch. LET OP:
// bereikt UITSLUITEND 3D/2D/IFC — de meetstaat en mallen lezen de zone-motor niet (increment B2 apart).
// DEFAULT = false → geen velden, tekenen-only (byte-identiek). Aanzetten: ?zoneStartStop=1.
export function isZoneStartStop() {
  return readFlag('zoneStartStop', false);
}

// ZONE_EXTEND — per getekende stripZone een links/rechts UITLOOP (mm) per laag (strips/latten/panelen), net als de
// groep-einduiteinden (endExtensions). Positief = de laag loopt door voorbij de zone-rand (links=x0-kant, rechts=x1-kant),
// negatief = inkorten. Ingreep in de GEDEELDE zone-functies: zRect (strips, zoneRegions.js), buildZoneBackingPanels
// (panelen) en clipLattenToZones (latten) → 3D/2D/IFC-export liften automatisch mee. DEFAULT = false → geen velden,
// endExtensions genegeerd, geen effect (byte-identiek). Aanzetten: ?zoneExtend=1. Noodrem: ?zoneExtend=0.
// LET OP: bereikt 3D/2D/IFC (zelfde grens als ZONE_START_STOP); meetstaat/mal voor zones nog niet.
export function isZoneExtend() {
  return readFlag('zoneExtend', false);
}

// ZONE_VOEG_SNAP — een NIEUW getekende stripZone snapt op het steenraster: de linker-/rechterrand op een
// steen-linker-/rechterhoek (k·pitch resp. k·pitch+steenL) en de onder-/bovenrand op een steen-onder/-boven
// (course·lagenmaat resp. +steenH). Zo staan er links/rechts van de zone hele strekken/koppen in het bestaande
// vlak. Tegelijk krijgt de zone een clearMargin {x:stoot, y:lint} → een VOEG rondom (stootvoeg verticaal,
// lintvoeg horizontaal) tussen de zone en de omringende strips. Snap + margin worden bij het TEKENEN in de
// zone opgeslagen (View2D onMouseUp); de zone-motor (buildStripZoneRegions) rendert de voeg via clearRect.
// DEFAULT = false → vrij tekenen, geen margin (byte-identiek). Aanzetten: ?zoneVoegSnap=1.
export function isZoneVoegSnap() {
  return readFlag('zoneVoegSnap', false);
}

// ZONE_BOND_PLANE_PARITY — fix: de verticale strek/kop-PARITEIT van een tekenzone-bond (anker 'zoneBottomLeft')
// wordt VLAK-verankerd i.p.v. zone-lokaal. Zonder deze vlag telt de pariteit vanaf de zone-onderkant, dus een
// andere Start-Y (oneven aantal lagen) flipt de pariteit → de stenen schuiven een halve steen HORIZONTAAL
// ("Start-Y veranderen verandert de X"). Met de vlag krijgt zone-rij 0 de pariteit van de ABSOLUTE course op y0
// (rowOffset = round(y0/lagenmaat)) → Start-Y wijzigen laat de horizontale steek staan. De x blijft op de
// zone-linkerrand starten. Default uit → oud gedrag (byte-identiek). Aanzetten: ?zoneBondPlaneParity=1.
export function isZoneBondPlaneParity() {
  return readFlag('zoneBondPlaneParity', false);
}

// ZONE_PASTEGEL — een staande tekenzone (staand_tegelverband) vult exact tot de zone-boven/-rand met een
// PASTEGEL (deel-tegel) i.p.v. het restje weg te laten. Verticaal: hele tegels van onder, de rest bovenaan wordt
// een pastegel; is die < ½ tegel → tel 'm op bij 1 hele tegel en deel door 2 → twee gelijke pastegels onder én
// boven (klant-regel). Zo komt de zone precies op de opgegeven Stop-Y uit. Default uit → restje weg (byte-identiek).
export function isZonePastegel() {
  return readFlag('zonePastegel', false);
}

// ZONE_PANELEN — een getekende tekenzone wordt óók uit de GROEP-panelen geknipt en met EIGEN panelen gevuld
// (buildZoneBackingPanels), i.p.v. dat de groep-panelen door de zone heen lopen. Zo is de zone een compleet
// bekledingsvak (strips + panelen + latten). In de gedeelde buildGroupPanels → alle 6 views + export erven mee.
// Default uit → groep-panelen door de hele gevel (byte-identiek). Aanzetten: ?zonePanelen=1.
export function isZonePanelen() {
  return readFlag('zonePanelen', false);
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

// PROJECT_DEFAULTS — project-brede standaard voor STARTLIJN (t.o.v. peil) en STEENSTRIP + VOEGEN
// (lint/stoot). Elke groep 'volgt project' (default), tenzij je in die groep een eigen startlijn of
// steenstrip/voeg kiest (override). Wijzig je de projectwaarde → alle volgt-project-groepen bewegen mee.
// DEFAULT = false → geen project-paneel, groepen gebruiken de bestaande hardcoded defaults (byte-identiek).
// Aanzetten: ?projectDefaults=1 (of localStorage 'projectDefaults'='1'). Noodrem: ?projectDefaults=0.
export function isProjectDefaults() {
  return readFlag('projectDefaults', false);
}

// LEKDORPEL_REFERENTIE — de LINKER/RECHTER opening-rand volgt de LEKDORPEL (los IFC, IfcBuildingElement-
// Proxy met 'lekdorpel' in de naam) i.p.v. de kozijn-bbox. Alleen de X-randen (start/einde) worden vervangen;
// de hoogte (Y) blijft van het kozijn/void. Bij een meervoudig kozijn geeft de lekdorpel één doorlopende
// opening over de volle breedte. De kozijn-offset L/R meet dan vanaf de lekdorpelrand.
// DEFAULT = false → geen loader, geen X-override (byte-identiek). Aanzetten: ?lekdorpelReferentie=1.
export function isLekdorpelReferentie() {
  return readFlag('lekdorpelReferentie', false);
}

// HALFSTEENS_PANEL_5STREK — vaste paneelbreedte bij een HALFSTEENS verband: knip altijd na 5 strekken
// (volle stenen) + (stootvoeg − 3 mm speling), gemeten vanaf het groep-nulpunt waar de bond begint. Zo
// valt elke paneelvoeg in de stootvoeg van de even rij → de KOPPELSTEEN (strip die de voeg overspant)
// zit gegarandeerd OM EN OM (nooit twee in opeenvolgende rijen), en het naastliggende paneel begint weer
// met een strek. Vervangt de target-breedte/chooseBreaks-verdeling voor halfsteens; verspringen uit.
// DEFAULT = true (op klantverzoek: "altijd"). NOODREM: ?halfsteensPanel5Strek=0 (of localStorage
// '0'/'false') → terug naar de oude stootvoeg-target-verdeling (byte-identiek aan vóór).
export function isHalfsteensPanel5Strek() {
  return readFlag('halfsteensPanel5Strek', true);
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

// KOP_TOLERANTIE — reststeen-regel met marge. Een EIND-rest die binnen ±KOP_TOL mm (pattern.js, =2) van
// een hele kop ligt wordt als KOP toegepast: de laatste hele strek wordt NIET naar een drieklezoor
// getrokken, en de rest heet 'Kop' i.p.v. 'Rest'. Lost op dat een op hele mm afgeronde wandlengte (bv.
// 6792,4 → 6792, zie ifc.js:1111/1122 + syntheticWall.js:15 + facadePlane.js:223) net ONDER de kop-grens
// valt en zo op de verspringende (oneven) rijen een drieklezoor forceert. Werkt op ALLE halfsteens-paden
// (3D/2D/zones/penant/werktekening) omdat ze dezelfde buildRowPiecesForWidth delen.
// DEFAULT = false → drempels exact (< kop / < 0,01) = byte-identiek. Aanzetten: ?kopTolerantie=1 (of
// localStorage 'kopTolerantie'='1'). Noodrem: ?kopTolerantie=0.
export function isKopTolerantie() {
  return readFlag('kopTolerantie', false);
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

// UNIFIED_LATTEN (FASE 1 — één waarheid) — ÉÉN gedeelde latten-berekening (buildFacadeLatten,
// panelization.js) voor 2D/3D/export/werktekening/uittrekstaat: computeHorizontalLatten-positionering
// + opening-clip + paneel-extent-clip (INSET 5) + sparing-clip. Vervangt de twee uiteenlopende
// algoritmes (de paneelgrens-loop in export/uittrekstaat) en de ontbrekende clips (2D/3D lopen nu
// vol-breedte). DEFAULT = false → elke view houdt z'n huidige latten-pad (byte-identiek). Als de vlag
// AAN staat produceren álle weergaven identieke latten. Aanzetten: ?unifiedLatten=1. Noodrem: =0.
// DEFAULT = true (gepromoveerd 2026-08-12, klantverzoek "latten ook gelijktrekken"): nu de panelen +
// strips + mat één bron zijn (unifiedPanels), levert de gedeelde buildFacadeLatten in álle views dezelfde
// latten (incl. hoek-extensie, die er ook in verhuisde). NOODREM: ?unifiedLatten=0 (of localStorage '0').
export function isUnifiedLatten() {
  return readFlag('unifiedLatten', true);
}

// STRIP_SNIJLIJN — steenstrips worden op de WERKELIJKE snijlijn van een opening/sparing gesneden
// (deel-steen tot de rand), i.p.v. de hele steen (rij) weg te knippen zodra die de boven/onderrand kruist.
// Klantregel: sparingen ALTIJD (alle verbanden); ramen/deuren ALLEEN bij staand verband (halfsteens raam/
// deur blijft op de laagrand, zoals nu). Raakt de twee clip-paden (clipRowsAroundRects = sparing;
// splitAroundOpenings = raam/deur) + de tekenaars (de deel-steen krijgt yBot/yTop). DEFAULT = false →
// exact het huidige gedrag (byte-identiek). Aanzetten: ?stripSnijlijn=1. Noodrem: ?stripSnijlijn=0.
export function isStripSnijlijn() {
  return readFlag('stripSnijlijn', false);
}

// UNIFIED_PANELS — ÉÉN gedeelde paneel-berekening (buildGroupPanels, panelization.js) voor
// 2D/3D/export/werktekening/uittrekstaat/mal, zodat de weergaven niet meer uiteen kunnen lopen. Dicht
// twee lekken waardoor 2D ≠ werktekening: (A) het steenstrip-ARTIKEL werd alleen in 2D op de panelen
// toegepast (effectiveMat) terwijl de STRIPS (facadeData.rows) overal mét het artikel gebouwd worden →
// panelen lagen in de andere views op een andere steek dan de strips → koppelstrippen op andere plek;
// (B) ventilatie-openingen splitsten alleen in werktekening/uittrekstaat de panelen (2D/3D/export
// filteren ze). De helper past ALTIJD het artikel toe (effMat) én filtert ventilatie → alle views gelijk.
// DEFAULT = true (klantverzoek "structureel, congruent"): alle weergaven tonen dezelfde panelen +
// koppelstrippen. DERIVE-ONLY (panelen worden nergens opgeslagen). NOODREM: ?unifiedPanels=0 (of
// localStorage 'unifiedPanels'='0'/'false') → elke view rekent weer z'n eigen pad (byte-identiek aan vóór).
export function isUnifiedPanels() {
  return readFlag('unifiedPanels', true);
}

// KLIKLIJST_REFERENTIE — de kozijn-offset-referentie (kozijnRect) volgt de BUITENRAND van de KLIKLIJST
// rondom het frame (het dunne profiel aan het buitenste dikte-vlak) i.p.v. de platgeslagen envelope
// (meest-links/rechts-punt over alle diepten). Lost de inconsistente offset op: verschillende kozijn-
// onderdelen liggen op verschillende diepte, en alleen de kliklijst-rand is de juiste referentie.
// Bijvangst: de kliklijst-positie (welk dikte-vlak) is een onafhankelijk buiten/binnen-signaal.
// PARSE-TIJD: kozijnRect wordt anders berekend → de vlag zit in de cache-key (re-import bij toggle).
// DEFAULT = false → envelope (byte-identiek). Geen dun buitenprofiel → fallback envelope + ⚠️.
// Aanzetten: ?kliklijstReferentie=1. Zie geheugen 'kliklijst-offset-en-buitenzijde'.
export function isKliklijstReferentie() {
  return readFlag('kliklijstReferentie', false);
}

// PENANT_TWEE_RIJEN — voorvlak-verband van een penant (buildCenteredFacePattern, alléén halfsteens):
// de VERSPRINGENDE rij (oneven) wordt "hele strek tegen beide randen + symmetrisch middenstuk" i.p.v.
// de huidige halve-steen-verschuiving. De GECENTREERDE rij (even, strek-hart-op-midden) blijft gelijk.
// Voorbeeld 563 / strek 221 / voeg 6: even = 165·221·165, oneven = 221·109·221.
// DEFAULT = false → exact het huidige gedrag (byte-identiek). Aanzetten: ?penantTweeRijen=1.
export function isPenantTweeRijen() {
  return readFlag('penantTweeRijen', false);
}

// GEVEL_HANDEDNESS — één waarheid voor de HORIZONTALE richting (links↔rechts) van een gevelvlak.
// De lengte-as (tAxis) is altijd de +wereld-as; of die van BUITEN gezien links→rechts of rechts→links
// loopt hangt af van outsideDir en de as-oriëntatie: mirror nodig als outsideDir·ε(up,normaal,lengte) > 0.
// Vlag AAN → (1) de steenstrip-bond wordt rechts-verankerd (hele-steen-start aan de buiten-linkerkant),
// zodat 3D + IFC-export van buiten links→rechts lezen; (2) 2D/werktekening spiegelen mee. Kozijnen/
// panelen blijven op hun echte positie. DEFAULT = false → byte-identiek. Aanzetten: ?gevelHandedness=1.
export function isGevelHandedness() {
  return readFlag('gevelHandedness', false);
}

// UITTREKSTAAT_SNAP — de uittrekstaat + mal-recept panelizeren met dezelfde snapFn (paneel-splitslijnen op
// steenrijen) als tekening/3D/2D/export, i.p.v. ongesnapt. Lost op dat de materiaalstaat bij VERTICAAL
// gesplitste zones andere paneelmaten telt dan getekend/geëxporteerd. DEFAULT = false → byte-identiek
// (ongesnapt). Aanzetten: ?uittrekstaatSnap=1. Zones die niet splitsen zijn sowieso identiek.
export function isUittrekstaatSnap() {
  return readFlag('uittrekstaatSnap', false);
}

// PANEEL_MERK — koppelt het productie-merk (P-nummer per uniek paneeltype, "N× te produceren") aan de
// montage-EPC: elk paneel krijgt een GEDEELD merk-nummer (op maat+strippatroon+gaten, in montage-volgorde),
// getoond als kolom in de EPC-tabel/CSV + op de tekening, en hergebruikt in de productielijst → koppeling
// productie↔montage. DEFAULT = false → geen merk-kolom (byte-identiek). Aanzetten: ?paneelMerk=1.
// LET OP: leunt op uittrekstaatSnap (merk moet op de gesnapte, autoritatieve panelen berekend worden).
export function isPaneelMerk() {
  return readFlag('paneelMerk', false);
}

// PANEEL_MERK_PER_ZONE — de paneelnummering (P-nr per uniek type) telt NIET door over penant-zones heen: elke
// zone begint weer bij P1 met een eigen nummering + eigen telling. Alleen actief bij >1 zone. DEFAULT = false →
// groep-brede doorlopende nummering (byte-identiek). Aanzetten: ?paneelMerkPerZone=1.
export function isPaneelMerkPerZone() {
  return readFlag('paneelMerkPerZone', false);
}

// PANEEL_14LAAG — halfsteens paneel-afmeting verband-gedreven i.p.v. gewicht/panelen.hoogte. Breedte =
// 5 strekken + 4 stootvoegen + (stoot−3) [= de bestaande 5-strek]. Hoogte = MAX 14 lagen: paneelhoogte =
// 14·lagenmaat − 3 = 14·steenH + 13·lint + (lint−3); onder course-flush, top groeit (lint−3), 3 mm
// horizontale voeg tussen gestapelde panelen. De LATTEN worden hieruit AFGELEID (dataflow omgekeerd): één
// lat gecentreerd op elke paneelvoeg; de álleronderste lat van de gevel én boven elke opening op paneel-
// onder + 10 mm; en per gat ceil(span/400)−1 tussenlatten (gelijk verdeeld, h.o.h. net onder 400).
// Vervangt de gewicht/interval-logica. DEFAULT = false → byte-identiek. Aanzetten: ?paneel14Laag=1.
export function isPaneel14Laag() {
  return readFlag('paneel14Laag', false);
}

// PENANT-HOEK-STOOTVOEG (3D): tussen de voorvlak-strip en de zijvlak-strip van een penant hoort een
// stootvoeg, maar de zijstrip-lengte (pD + stoot + brickDepth) laat 'm juist tot de voorstrip doorlopen
// ("sluit op"). Deze vlag haalt de `stoot` uit de zijstrip-LENGTE (voorstrip blijft op maxArmDepth) → er
// valt een stoot-breed gat tussen voor- en zijstrip. Alleen het 3D-pad. DEFAULT = false → byte-identiek.
export function isPenantHoekStoot() {
  return readFlag('penantHoekStoot', false);
}

// GEEN-STRIP-GEEN-PANEEL (3D): 3D mist de strip-overlap-filter die View2D/Werktekening/export wél hebben
// (een paneel blijft alleen als het érgens een steenstrip-stuk raakt). Deze vlag geeft 3D diezelfde filter →
// paneel (en de erop volgende latten) verdwijnt waar geen strip is, bv. in smalle strip-loze zones tussen
// openingen. DEFAULT = false → byte-identiek. Aanzetten: ?strip3dFilter=1. Noodrem: ?strip3dFilter=0.
export function isStrip3dFilter() {
  return readFlag('strip3dFilter', false);
}

// UNIT_DETECTIE — herken REPETERENDE gevel-units (verdiepingshoge BUITENwand-panelen met dezelfde
// maat + raam/deur-layout, positie-onafhankelijk) en zet elk voorkomen als een gevelgroep weg;
// identieke voorkomens delen een linkId → hun settings lopen synchroon (1× een unit-type instellen →
// alle kopieën volgen, ook cross-project want de signature is stabiel). Puur ADDITIEF: bestaande
// groepen en al-gegroepeerde wanden blijven ongemoeid; alleen een extra knop + één-regel-melding.
// Eén-wand-per-unit (het HSB-paneel dat de openingen draagt); de finish-laag (baksteen) is een los
// hulpmiddel en wordt hier niet vereist. DEFAULT = false → geen knop, geen state, byte-identiek.
// Aanzetten: ?unitDetectie=1 (of localStorage 'unitDetectie'='1'). Noodrem: ?unitDetectie=0.
export function isUnitDetectie() {
  return readFlag('unitDetectie', false);
}

// GH_IMPORT — importeer een Grasshopper/Geometry-Gym IFC waarin de bekleding AL gemodelleerd staat
// (IfcBuildingElementPart 'Board'/'Bricks' + IfcMember 'Slats'), i.p.v. wanden. Het pad leest de
// elementen zelf, leidt de gevelvlakken af (platen-vlak, 3 mm-paneelvoeg), nummert de panelen per
// gevel (1 plaat = 1 paneel, onder→boven/links→rechts) en toont per gevel een beoordelingsaanzicht +
// uittrekstaat + zaaglijst, met terugschrijven van het paneelnummer naar de IFC. PUUR ADDITIEF: geen
// enkele bestaande codepad (wand-import/parse/opslag) wordt geraakt. DEFAULT = false → geen knop, geen
// state, byte-identiek. Aanzetten: ?ghImport=1 (of localStorage 'ghImport'='1'). Zie src/lib/ghCladding.js.
export function isGhImport() {
  return readFlag('ghImport', false);
}

// LATTEN_PLAT — de lat ligt PLAT tegen de wand: de LANGE zijde in het gevelvlak (aanzicht), de KORTE als
// diepte. Nu wordt breedteMM als aanzicht en dikteMM als diepte gebruikt; een artikel met omgekeerde maten
// (bv. Mclad V18 45×95: breedteMM 45, dikteMM 95) steekt daardoor 95 mm uit met een 45 mm zichtzijde = op z'n
// kant. Met de vlag wordt per lat de GROOTSTE van (breedte,dikte) het aanzicht (latBreedte) en de KLEINSTE de
// diepte (latDikte) — dus altijd de lange zijde tegen de wand. Robuust tegen een stale opgeslagen latten.breedte
// (max/min herstelt 95/45 ook uit een oude 45/95-config). Raakt 3D + 2D + werktekening + IFC-export + mal via de
// gedeelde bronnen (groupLattenDims/effLatten). DEFAULT = false → breedte=aanzicht, dikte=diepte (byte-identiek).
// Aanzetten: ?lattenPlat=1. Noodrem: ?lattenPlat=0.
export function isLattenPlat() {
  return readFlag('lattenPlat', false);
}

// ONDERLAT_OFFSET — de ONDERSTE horizontale lat (gevelbreed, op de projectstart/startlijn) ligt 10 mm HOGER
// dan de starthoogte i.p.v. er precies op. Nu staat de onderlat-onderkant op minH = max(0, startLijn) (+0);
// met de vlag op minH + 10 → de eerste lat begint altijd 10 mm boven het peil (ruimte voor start/lekprofiel).
// Eén bron (computeHorizontalLatten) → 3D/2D/werktekening/IFC-export erven mee; consistent met het 14-laag-
// pad dat de onderlat al op zone-onder + 10 legt. DEFAULT = false → onderlat op de starthoogte (byte-identiek).
// Aanzetten: ?onderlatOffset=1. Noodrem: ?onderlatOffset=0.
export function isOnderlatOffset() {
  return readFlag('onderlatOffset', false);
}

// LATTEN_PANEELVOEG — een nieuwe horizontale-latten-plaatsingsmodus, per groep kiesbaar via
// `s.latten.plaatsingsModus`: 'interval' (huidig gedrag, default) of 'paneelvoeg'. In 'paneelvoeg'-modus legt
// de motor een lat op ELKE horizontale PANEELVOEG (paneelnaad, uit de ECHTE panelen) + een start- en eind-lat +
// TUSSENLIGGENDE latten die te grote gaten opvullen (≤ maxInterval). Zo landt elke paneelrand op een lat
// (schroefbaar). Generaliseert het bestaande 14-laag-pad (compute14LaagYBreaks) naar de werkelijke panelen en
// zet een `rol`-veld ('start'|'paneelvoeg'|'tussen'|'dorpel'|'eind') op elke lat. Zit in de gedeelde
// computeHorizontalLatten → alle 6 views erven mee. DEFAULT = false → de UI-keuze verschijnt niet en de modus
// wordt genegeerd (altijd interval-pad → byte-identiek). Aanzetten: ?lattenPaneelvoeg=1. Noodrem: ?lattenPaneelvoeg=0.
export function isLattenPaneelvoeg() {
  return readFlag('lattenPaneelvoeg', false);
}

// PANEEL_BANDEN — de paneelindeling volgt de productiemethode: (1) de horizontale paneelnaad snapt op de ECHTE
// steenrij (lintvoeg) vanaf de startlijn/peil; (2) elke paneel-RECHTERrand = de eerstvolgende hele-steen-stootvoeg
// − 3 mm zaagsnede, elke paneel-BOVENrand = de eerstvolgende lintvoeg − 3 mm (behalve de ECHTE gevelrand/gevel-top);
// (3) onder een raam eindigt het paneel op de course onder de dorpel (−3), boven een raam start het op de strip-
// onderkant boven de latei — die twee lijnen worden vol-breed doorgetrokken → horizontale banden, daarbinnen
// optimaliseren. Vervangt de losse paneelvoegLint/paneelZaagsnede/paneelHeleLagen. De 3 mm is de zaagsnede (kerf),
// directioneel (rechts/boven, één keer per naad) → koppelstrippen blijven heel (lint 5,6 > 3). Zit volledig in de
// gedeelde motor (buildGroupPanels/optimalPanelizeZone) → alle 6 views congruent. DEFAULT = false → oude snap,
// geen kerf, ruwe raamrand (byte-identiek). Aanzetten: ?paneelBanden=1. Noodrem: ?paneelBanden=0.
export function isPaneelBanden() {
  return readFlag('paneelBanden', false);
}

// PANEEL_RASTER — ALTERNATIEVE paneelmethode náást de bestaande banden-methode, per groep kiesbaar via
// settings.panelen.methode ('banden' = bestaand, default | 'raster' = nieuw). De raster-methode legt een
// UNIFORM raster vanaf de startlijn: rijen strikt panelen.rasterHoogte (default 789) hoog, kolommen
// panelen.rasterBreedte (default 1130) breed MAAR gesnapt op de raamzijkanten (restje < ½ paneel → vorig
// paneel groter). Een raam vult zo exact één kolombreedte → het snijdt een schone horizontale band (geen
// L-inkeping). Zit volledig in de gedeelde buildGroupPanels → alle 6 views (2D/3D/werktekening/meetstaat/
// export/mal) erven mee. DEFAULT = false → de raster-tak is onbereikbaar EN de per-groep keuze verschijnt
// niet → byte-identiek. Ook met de vlag AAN maar methode='banden' (default) blijft alles byte-identiek.
// Aanzetten: ?paneelRaster=1 (of localStorage 'paneelRaster'='1'). Noodrem: ?paneelRaster=0.
export function isPaneelRaster() {
  return readFlag('paneelRaster', false);
}

// BANDEN_OPTIMALISATIE — geoptimaliseerde variant van de bestaande banden-methode (niet de raster-methode).
// Stap 1: kolombreedte = het max hele aantal strekken dat in het 2500-basispaneel past (floor(2500/(steenL+stoot))
// × pitch, −3 kerf) → bij waalformaat 11 strekken = 2489,6 mm; naad in de stootvoeg (koppelstrippen om-en-om).
// Stap 2: de bestaande band-indeling (buildFacadeZones) blijft ongewijzigd. Stap 3: paneelHOOGTE in LAGEN i.p.v.
// mm — doel panelen.hoogteLagen (default 14), max 15 lagen. Stap 4: band ≤15 lagen → 1 paneel; anders het minste
// aantal ~gelijke panelen (elk ≤15). Zit in de gedeelde buildGroupPanels → alle 6 views erven mee. DEFAULT =
// false → de ELSE-tak (origineel) draait = byte-identiek. Aanzetten: ?bandenOptimalisatie=1. Noodrem: =0.
export function isBandenOptimalisatie() {
  return readFlag('bandenOptimalisatie', false);
}

// STIJLEN_IMPORT — laad een stijlen-JSON (uit spike/extract-stijlen.mjs op het Tekla modules-model): de
// verticale-lat SCHROEFLIJNEN per gevelvlak per verdieping (op de module-stijlen). De app koppelt die per
// gevelgroep (src/lib/stijlen.js → studLattenForGroup) en tekent ze op de werktekening bij een 2-lats
// achterconstructie. PUUR ADDITIEF: eigen knop/state, geen bestaand codepad. DEFAULT = false → geen knop,
// byte-identiek. Aanzetten: ?stijlenImport=1 (of localStorage 'stijlenImport'='1').
export function isStijlenImport() {
  return readFlag('stijlenImport', false);
}

// PRODUCTIE_SORTEER_AANTAL — de "Paneel productie"-tab toont de unieke panelen gesorteerd op AANTAL te
// produceren (per merk), hoogste aantal eerst, i.p.v. de ruimtelijke volgorde. Puur weergave-volgorde;
// merk-labels + telling blijven gelijk. DEFAULT = false → huidige volgorde (byte-identiek).
export function isProductieSorteerAantal() {
  return readFlag('productieSorteerAantal', false);
}

// ZONE_OPENING_SNIJLIJN — een raam/deur/sparing wordt óók uit de ZONE-tegels op de WERKELIJKE boven/onderrand
// gesneden (deel-tegel), niet alleen via de grove horizontale dekking. Die dekking (planeCoverageForSpan) unieert
// per zone-rij over de VOLLE tegelhoogte (bondRowH); bij een STAANDE zone (tegel ~221 mm) "geneest" dat over de
// raam-boven/onderrand → de tegel die de rand kruist blijft staan = een band boven én onder het raam (de kern is
// wél weg). De fix knipt elke zone-regio waarvan de tegel HOGER is dan de vlak-rij (planeRowH) — dus staand;
// halfsteens-zones genezen niet en blijven ongemoeid — tegen de opening-rechthoeken (facadeData.groupOpenings, al
// offset-opgeblazen) via clipRowsAroundRects → deel-tegel tot de rand (met stripSnijlijn aan; anders grof). Zit in
// de gedeelde buildStripZoneRegions → alle 6 views + export erven mee. DEFAULT = false → geen extra knip
// (byte-identiek). Aanzetten: ?zoneOpeningSnijlijn=1. Noodrem: ?zoneOpeningSnijlijn=0.
export function isZoneOpeningSnijlijn() {
  return readFlag('zoneOpeningSnijlijn', false);
}

// TEKENZONE_PLAATSING — GEBUNDELDE vlag voor de schone tekenzone-plaatsing (deelgedragingen samen aan/uit):
//  (1) MERK per tekenzone als "letter-nr" (letter = het 2D-zonelabel, bv. C-1) i.p.v. "Z P{merk}"; bestaande gevel
//      houdt "P{merk}" blauwgrijs; meetstaat-Merk = "P{letter}-{nr}" (EPC-code ongemoeid); zone enkel amber.
//  (2) RASTER per tekenzone (rest via de banden-motor), raam op HELE rijen (uniform, minder merken), binnen gewicht.
//  (3) ZONERAND-SNAP op de stootvoeg → bestaande gevel ernaast hele-steen.
//  (4) bestaande gevel naast een raam alleen HORIZONTAAL delen (smalle band = één kolom).
// Zit in de gedeelde motor (buildGroupPanels/buildZoneBackingPanels + Werktekening) → alle views + export erven mee.
// (2)–(4) raken ALLEEN paneelgrenzen; de strips/het verband blijven byte-identiek. DEFAULT = false → byte-identiek.
// Aanzetten: ?tekenzonePlaatsing=1. Noodrem: ?tekenzonePlaatsing=0.
export function isTekenzonePlaatsing() {
  return readFlag('tekenzonePlaatsing', false);
}

// ZAAG_OPTIMALISATIE — verdeel de tekenzone-panelen zó dat ze met minimaal zaagverlies uit een basisplaat
// (2500×1200) te zagen zijn. Kiest de paneel-MODULE (breedte = hele koppen, hoogte = hele lagen, binnen maxKg)
// die de plaat het beste tegelt en legt die als UNIFORM raster over de zone (i.p.v. de gelijk-verdeling). Vereist
// staand verband + tekenzonePlaatsing. DEFAULT = false → de bestaande (gelijk-verdeelde) indeling.
export function isZaagOptimalisatie() {
  return readFlag('zaagOptimalisatie', false);
}

// HOOGTE_VOORZET — vult bij bandenoptimalisatie de OPTIMALE paneelhoogte (lagen) automatisch in: de hoogte die de
// zone/vak-hoogtes zo gelijk mogelijk deelt (veel panelen dezelfde hoogte) én de basisplaat het best tegelt binnen
// het gewichtsplafond. Gemeenschappelijk over alle zones (per-zone berekend). Handmatig te overschrijven.
// DEFAULT = false → geen voorzet, huidige paneelhoogte-instelling blijft.
export function isHoogteVoorzet() {
  return readFlag('hoogteVoorzet', false);
}

// PANEEL_VOEG_SNAP — paneelnaden vallen in de VOEG i.p.v. midden door een steen. Twee bronnen worden bij de
// generatie gesnapt (gedeelde buildGroupPanels/buildZoneBackingPanels → alle 6 views + export erven mee):
//  (A) BASIS-panelen (banden): de horizontale naden die door carve/merge/gewichts-split (splitHeavyBandPanels)
//      naast een course zijn beland, worden op de dichtstbijzijnde LINTVOEG (facadeRows.y) geremapt — overlap-
//      veilig (gedeelde naad-Y schuift samen mee; de gevelrand + de zonegrenzen blijven staan; alleen kleine snaps).
//  (B) ZONE-panelen (raster): een tekenzone met een AFWIJKEND verband (bv. staand-tegel in een halfsteens groep)
//      liet z'n rijen op de VELD-courses snappen (facadeData.rows, 56,6) i.p.v. z'n EIGEN staand-courses (226,6)
//      → de horizontale paneelnaad sneed door de staande tegel. Nu krijgt zo'n zone z'n eigen course-grid mee (net
//      als z'n strips). GESCOPED op V !== groep-verband → een zone die het groep-verband al volgt blijft byte-identiek.
// DEFAULT = true (gepromoveerd op klantverzoek: een staand-zone hoort altijd staand-panelen te krijgen — correctie,
// geen smaak). NOODREM: ?paneelVoegSnap=0 (of localStorage '0'/'false') → beide snaps uit = exact het oude gedrag.
export function isPaneelVoegSnap() {
  return readFlag('paneelVoegSnap', true);
}

// PANEEL_ZONE_VERBAND — de PANEEL-/PRODUCTIETEKENING tekent de strips ín een zone-paneel met het ZONE-eigen
// verband (bv. staand-tegel) i.p.v. het groep-verband (halfsteens). Nu gebruikt getPanelStripsAnnotated
// (Werktekening) overal facadeData.rows (veld, halfsteens) + de groep-verband, dus een paneel in een staande
// zone kreeg halfsteens strips ("halfsteens · N strips") terwijl 2D/3D/IFC de zone wél staand tonen. Met de vlag
// worden de zone-panelen (panel.zoneVerband ≠ groep) getekend uit de ZONE-strip-rows (buildStripZoneRegions, de
// gedeelde bron van 2D/3D/IFC) + het zone-verband → productie congruent. GESCOPED op zones met afwijkend verband
// → een groep zonder zulke zones is byte-identiek. DEFAULT = true (correctie). NOODREM: ?paneelZoneVerband=0.
export function isPaneelZoneVerband() {
  return readFlag('paneelZoneVerband', true);
}

// PANEEL_ZONE_STRIP — laat een bestaande-gevel-paneel dat aan een tekenzone grenst de STRIPS volgen: (a) de
// paneel-knip snapt op de hele-strek-zonerand (zelfde rand als buildStripZoneRegions), zodat het paneel niet 88 mm
// de zone in loopt; (b) getPanelStripsAnnotated (paneeltekening/merk) knipt de strips óók uit de zone-regio's, zodat
// de paneelgenerator 1-op-1 met de IFC-export klopt. Strip-POSITIE verandert niet. DEFAULT = false → byte-identiek.
export function isPaneelZoneStrip() {
  return readFlag('paneelZoneStrip', false);
}

// PANEEL_SELECTOR — dropdown in de "Paneel productie"-tab om snel één specifiek paneel (merk) te tonen i.p.v.
// door alle kaarten te scrollen. Puur UI-navigatie: filtert welke kaart getoond wordt, verandert geen maat/
// strip/export. DEFAULT = false → geen selector, alle kaarten (byte-identiek).
export function isPaneelSelector() {
  return readFlag('paneelSelector', false);
}

// ZONE_VOEG_OVERRIDE — een tekenzone op "Groep-standaard" mag eigen LINTVOEG/STOOTVOEG hebben terwijl de
// STEENMAAT de groep blijft volgen. UI: Lintvoeg/Stootvoeg worden invulbaar (zonder een eigen steenstrip-
// artikel te hoeven kiezen) en geschreven naar zone.voeg = {lint, stoot}. Geometrie: buildStripZoneRegions
// merget die voegen over de groep-mat (alleen steenmaat volgt de groep). DEFAULT = false → velden op slot,
// zone volgt volledig de groep-voeg (byte-identiek). Noodrem: ?zoneVoegOverride=0.
export function isZoneVoegOverride() {
  return readFlag('zoneVoegOverride', false);
}

// ZONE_RAND_VOLLE_STEEN — de BESTAANDE GEVEL (complement) rechts (en links) naast een tekenzone begint/eindigt
// altijd met een HELE strek (even rij) of kop (oneven rij) i.p.v. een partje: de complement-knip wordt op het
// groep-steenraster gesnapt i.p.v. op de zone-rand-plus-voegmarge (die van het raster af kan liggen). DEFAULT =
// false → knip op clearRect (byte-identiek). Noodrem: ?zoneRandVolleSteen=0.
export function isZoneRandVolleSteen() {
  return readFlag('zoneRandVolleSteen', false);
}

// ── Vlaggen-schakelaars (UI) ────────────────────────────────────────────────────────────────
// Registry van alle DEFAULT-UIT vlaggen, zodat ze via een UI-paneel aan/uit gezet kunnen worden
// (i.p.v. handmatige ?param=1 in de URL). `reimport` = werkt pas na opnieuw importeren (parse-tijd);
// `advanced` = experimenteel/intern (kan bestaand gedrag veranderen).
export const FLAG_REGISTRY = [
  { key: 'sparingElementen',     label: 'Sparing-onderdelen',        note: 'Niet-wand IFC-onderdelen importeren + de bekleding er rondom sparen.' },
  { key: 'openingFromKozijn',    label: 'Openingen op kozijn-rand',  note: 'Knip vanaf raam/deur (kozijn) i.p.v. de ruwe structurele opening.', reimport: true },
  { key: 'kozijnOffset',         label: 'Kozijn-offset (L/R/B/O)',   note: 'Globale marge per zijde tussen kozijnrand en bekleding (strips+panelen+latten) + melding bij opening zonder kozijn.' },
  { key: 'projectDefaults',      label: 'Project-defaults (startlijn + steenstrip)', note: 'Project-brede startlijn (t.o.v. peil) en steenstrip/voegen; elke groep volgt project tenzij je er een eigen kiest.' },
  { key: 'lekdorpelReferentie',  label: 'Lekdorpel als opening-rand',  note: 'Laad de lekdorpel-IFC; de L/R opening-rand volgt de lekdorpel i.p.v. de kozijn-bbox (hoogte blijft van het kozijn).' },
  { key: 'openingEdgeQuarter',   label: 'Opening-rand ¼-steen',      note: 'Sta ¼ steen toe tegen een opening i.p.v. altijd ½ (kop) wanneer twee strips boven elkaar bijna even groot worden. Delta instelbaar.' },
  { key: 'kopTolerantie',        label: 'Kop-tolerantie ±2 mm (i.p.v. drieklezoor)', note: 'Een eind-rest binnen ±2 mm van een hele kop wordt als kop toegepast i.p.v. de laatste strek naar een drieklezoor te trekken. Lost op dat een op hele mm afgeronde wandlengte (bv. 6792,4→6792) net onder de kop-grens valt en zo een drieklezoor forceert op de verspringende rijen.' },
  { key: 'concaveOpeningMerge',  label: 'Concave opening-unie (raam+deur)', note: 'Twee overlappende openings (deur naast raam) worden tot hun echte L/U-vorm samengevoegd i.p.v. bbox, zodat het massieve muurdeel onder het raam bekleed blijft.' },
  { key: 'stripSnijlijn',        label: 'Strips snijden op de snijlijn', note: 'Steenstrips worden op de WERKELIJKE rand van een sparing/opening gesneden (deel-steen tot de rand) i.p.v. de hele steen weg te knippen. Sparingen: altijd (elk verband). Ramen/deuren: alleen bij staand verband — halfsteens raam/deur blijft op de laagrand zoals nu. Werkt in 2D/3D/werktekening/export.' },
  { key: 'zoneStartStop',        label: 'Zone Start-X / Stop-X (numeriek)', note: 'Per tekenzone de linker- en rechterrand exact in mm intypen (i.p.v. tekenen) + "hele steen"-snap, om te optimaliseren. Werkt in 3D/2D/IFC; meetstaat/mallen nog niet.' },
  { key: 'zoneExtend',           label: 'Tekenzone links/rechts uitbreiden', note: 'Per getekende tekenzone een uitloop (mm) links/rechts, apart per laag (strips/latten/panelen), net als de groep-einduiteinden. Werkt in 3D/2D/IFC-export; meetstaat/mal voor zones nog niet.' },
  { key: 'zoneVoegSnap',         label: 'Tekenzone: raster-snap + voeg rondom', note: 'Een NIEUW getekende tekenzone snapt op het steenraster (linker-/rechterrand op een steen-hoek, onder-/bovenrand op een course) zodat er links/rechts hele strekken/koppen in het bestaande vlak staan, én krijgt een voeg rondom: stootvoeg verticaal (links/rechts), lintvoeg horizontaal (onder/boven). Alleen bij het tekenen; bestaande zones ongemoeid. Default uit = vrij tekenen.' },
  { key: 'zoneBondPlaneParity',  label: 'Tekenzone: Start-Y verschuift de X niet', note: 'Fix: de strek/kop-pariteit van een tekenzone wordt vlak-verankerd i.p.v. vanaf de zone-onderkant. Zonder deze vlag flipt een andere Start-Y (oneven aantal lagen) de pariteit → de stenen schuiven een halve steen horizontaal. Met de vlag laat Start-Y wijzigen de horizontale steek staan; de x start nog steeds op de zone-linkerrand.' },
  { key: 'zonePastegel',         label: 'Tekenzone: pastegel tot de zone-rand', note: 'Een staande tekenzone (staand-tegelverband) vult exact tot de opgegeven Stop-Y met een pastegel (deel-tegel) i.p.v. het restje bovenaan weg te laten. Blijft er < ½ tegel over, dan wordt die bij een hele tegel opgeteld en door 2 gedeeld → twee gelijke pastegels onder én boven. Zo klopt de maatvoering met je invoer. Default uit = restje weg (huidig gedrag).' },
  { key: 'zonePanelen',          label: 'Tekenzone: eigen panelen (uit groep geknipt)', note: 'De getekende tekenzone wordt ook uit de groep-panelen geknipt en met eigen panelen gevuld, zodat de zone een compleet bekledingsvak is (strips + panelen + latten). Zonder deze vlag lopen de groep-panelen door de zone heen (alleen de strips zijn zone-eigen). Werkt in alle views + IFC-export.' },
  { key: 'zoneOpeningSnijlijn',  label: 'Tekenzone: raam/deur op de snijlijn (deel-tegel)', note: 'Een raam/deur/sparing wordt ook uit de STAANDE zone-tegels op de werkelijke boven- én onderrand gesneden (deel-tegel), i.p.v. dat de tegel die de raamrand kruist blijft staan als een band boven/onder het raam (het midden was al weg). De grove dekking geneest anders over de raamrand omdat een staande tegel (221 mm) veel hoger is dan een gevelrij. Werkt het schoonst met "Strips snijden op de snijlijn" aan. Werkt in alle views + IFC-export.' },
  { key: 'tekenzonePlaatsing',   label: 'Tekenzone-plaatsing (schoon)', note: 'Bundel voor de schone tekenzone-plaatsing: (1) merk per tekenzone als "letter-nr" uit het 2D-zonelabel (bv. C-1), bestaande gevel houdt "P{merk}" blauwgrijs, meetstaat-Merk = "P{letter}-{nr}" (EPC-code ongemoeid), binnen een zone geen groene koppelstrippen (enkel amber); (2) uniform paneelraster per tekenzone (raam op hele rijen → minder merken), rest via de banden-motor; (3) zonegrens op het steenraster gesnapt; (4) een smalle bestaande-gevel band naast een raam wordt alleen horizontaal gedeeld. (2)–(4) raken alleen paneelgrenzen; de strips lopen door. Werkt in alle views + IFC-export.' },
  { key: 'paneelZoneStrip',      label: 'Bestaande-gevel-paneel volgt de strips bij een zone', note: 'Een bestaande-gevel-paneel dat aan een tekenzone grenst wordt op DEZELFDE zonerand afgeknipt als de strips (buildStripZoneRegions) i.p.v. de rauwe/afgeronde zone-rand — het paneel loopt niet meer de zone in. Bovendien knipt de paneeltekening (getPanelStripsAnnotated) de strips óók uit de zone, zodat de paneelgenerator 1-op-1 met de IFC-export klopt. De strip-POSITIE verandert niet. Default uit = huidig.' },
  { key: 'paneelSelector',       label: 'Paneel-selector in de productietab', note: 'Voegt in "Paneel productie" een dropdown toe waarmee je snel één specifiek paneel (merk) toont i.p.v. door alle kaarten te scrollen. Puur UI-navigatie — filtert alleen welke kaart zichtbaar is, verandert geen maat/strip/export. Default uit = alle kaarten.' },
  { key: 'paneelZoneVerband',    label: 'Paneeltekening: zone-strips in zone-verband (standaard aan)', note: 'STANDAARD AAN. De paneel-/productietekening tekent de strips ín een zone-paneel met het ZONE-eigen verband (bv. staand-tegel) i.p.v. het groep-verband (halfsteens). Zonder dit kreeg een paneel in een staande zone halfsteens strips ("halfsteens · N strips") terwijl 2D/3D/IFC de zone wél staand tonen. De zone-strips komen uit de gedeelde buildStripZoneRegions → productie congruent. Alleen zones met een afwijkend verband veranderen; een groep zonder zulke zones is byte-identiek. Uitzetten = ?paneelZoneVerband=0.' },
  { key: 'zoneVoegOverride',     label: 'Tekenzone: eigen lint-/stootvoeg (steen volgt de groep)', note: 'Op "Groep-standaard" worden Lintvoeg en Stootvoeg per tekenzone invulbaar zonder dat je een eigen steenstrip-artikel hoeft te kiezen — de steenmaat blijft de groep volgen, alleen de voegen wijken af. Werkt door in de zone-strips van alle views + IFC-export (buildStripZoneRegions). Default uit = voegen op slot, zone volgt de groep-voeg.' },
  { key: 'zoneRandVolleSteen',   label: 'Tekenzone: bestaande gevel start op hele steen', note: 'De bestaande gevel naast een tekenzone begint/eindigt altijd met een hele strek (even rij) of kop (oneven rij) i.p.v. een partje: de complement-knip wordt op het steenraster van de groep gesnapt i.p.v. op de zone-rand plus voegmarge. Werkt in alle views + IFC-export. Default uit = knip precies op de zone-voegmarge.' },
  { key: 'hoogteVoorzet',        label: 'Banden: optimale paneelhoogte automatisch invullen', note: 'Vult bij bandenoptimalisatie de OPTIMALE paneelhoogte (lagen) automatisch in: de hoogte die de zone/vak-hoogtes zo gelijk mogelijk deelt (veel panelen dezelfde hoogte = productie/montagegemak) én de basisplaat het best tegelt binnen het gewichtsplafond. Gemeenschappelijk over alle zones (per zone berekend). Handmatig te overschrijven. Default uit = huidige paneelhoogte-instelling.' },
  { key: 'zaagOptimalisatie',    label: 'Tekenzone: zaag-optimalisatie (2500×1200)', note: 'Verdeelt de tekenzone-panelen zó dat ze met minimaal zaagverlies uit een basisplaat van 2500×1200 mm te zagen zijn: kiest de paneel-module (breedte = hele koppen, hoogte = hele lagen, binnen maxKg) die de plaat het beste tegelt en legt die als UNIFORM raster over de zone, i.p.v. de gelijk-verdeelde indeling. Vereist staand verband + "Tekenzone-plaatsing". Default uit = gelijk-verdeling.' },
  { key: 'endTrim',              label: 'Einduiteinde inkorten = paneel/lat echt smaller', note: 'Een negatief einduiteinde (inkorten) maakt het buitenste paneel/lat ook in de DATA smaller — maat-label + productielijst kloppen in alle weergaven, i.p.v. alleen een rode sv-lijn + visuele clip. Buitenste element ≤ 0 → vervalt.' },
  { key: 'endExtSeparaat',       label: 'Einduiteinden per onderdeel los', note: 'Strips/latten/panelen verlengen elk ONAFHANKELIJK met hun eigen mm. Nu volgen de latten de paneel-verlenging mee (ook als "Latten" 0 is); met de vlag verlengen de latten alleen met hun eigen waarde.' },
  { key: 'paneelStartLijn',      label: 'Panelen starten op de projectstart', note: 'De groep-brede panelen beginnen op de projectstart/startlijn (peil) — panelen onder de startlijn worden afgesneden, net als de strips en de zone-panelen. Nu starten de groep-panelen op y=0 bij een positieve startlijn.' },
  { key: 'exportEndExtFix',      label: 'IFC-export: verlenging niet dubbel', note: 'De IFC-export verlengt panelen/latten nu dubbel (gedeelde motor + oude export-glue) → export ≠ 3D. Met de vlag wordt de export-glue trim-only, zodat de verlenging exact 3D volgt (1×). Alleen relevant bij een groep-einduiteinde.' },
  { key: 'geenVerband',          label: 'Metselverband "geen" (blanco basisvlak)', note: 'Extra keuze in de verband-dropdown: het basisvlak buiten de tekenzones krijgt geen strips/panelen/latten → blanco gevel om zelf tekenzones op te leggen. De zones brengen hun eigen verband.' },
  { key: 'paneelOptimalisatie',  label: 'Optimale paneelverdeling (standaard aan)', note: 'STANDAARD AAN. Naden op de doorlopende steen → koppelstenen overal om-en-om (ook in smalle zones); rijen even lagen binnen het gewicht (geen mini-panelen); gestapelde panelen in één kolom samengevoegd; snipper-zones < 50 mm vervallen. Uitzetten = ?paneelOptimalisatie=0.' },
  { key: 'showKozijnen',         label: 'Kozijnen tonen (2D + 3D)',  note: 'Raam/deur als 3D-doos én als amber kader in 2D (met L/R-marge tot de strips) ter controle van de uitlijning.', reimport: true },
  { key: 'ventilatieZone',       label: 'Ventilatiezone (gedraaid verband)', note: 'Klein gat boven een raam wordt open geknipt + een zone met loodrecht verband eromheen (instelbaar per groep).', reimport: true },
  { key: 'cornerButt',           label: 'Stompe hoek',               note: 'Geen omslag-steenstrips op het loodrechte vlak.' },
  { key: 'corner85',             label: 'Hoek-detail 85°',           note: '' },
  { key: 'groothuisWildverband', label: 'Groothuis wildverband 1',   note: 'Het oudere groothuis-verband (versie 2 staat standaard aan).' },
  { key: 'malRecept',            label: 'Mal recept CSV',            note: 'CSV-export per paneel — bekende telbug (defect-containment).', advanced: true },
  { key: 'unifiedLatten',        label: 'Latten — één berekening (standaard aan)', note: 'STANDAARD AAN. Eén gedeelde latten-berekening (buildFacadeLatten) voor 2D/3D/export/werktekening/uittrekstaat/mal, incl. hoek-extensie, zodat de latten overal gelijk zijn (net als panelen/strips). Uitzetten = ?unifiedLatten=0.' },
  { key: 'unifiedPanels',        label: 'Panelen — één berekening (standaard aan)', note: 'STANDAARD AAN. Eén gedeelde paneel-berekening voor 2D/3D/export/werktekening/uittrekstaat/mal zodat ze congruent zijn: het steenstrip-artikel wordt overal op de panelen toegepast (net als op de strips) en ventilatie-openingen overal gelijk behandeld. Uitzetten = ?unifiedPanels=0.' },
  { key: 'kliklijstReferentie',  label: 'Kliklijst als offset-rand', note: 'Kozijn-offset meet vanaf de buitenrand van de kliklijst (dun buitenprofiel) rondom het frame, i.p.v. de envelope.', reimport: true },
  { key: 'penantTweeRijen',      label: 'Penant — strek aan de randen (oneven rij)', note: 'Voorvlak van een penant (halfsteens): de verspringende rij begint/eindigt met een hele strek + symmetrisch middenstuk, i.p.v. de halve-steen-verschuiving. Bv. 563 → 221·109·221.' },
  { key: 'gevelHandedness',      label: 'Gevel-handedness (links↔rechts)', note: 'Spiegelt de steenstrip-bond én 2D/werktekening zó dat elk gevelvlak van buiten gezien links→rechts leest (3D/2D/export één waarheid). Kozijnen blijven op hun plek.' },
  { key: 'uittrekstaatSnap',     label: 'Uittrekstaat — panelen op steenrijen', note: 'Uittrekstaat + mal-recept panelizeren met dezelfde snap (paneel-splits op steenrijen) als tekening/3D/export, zodat de materiaalstaat dezelfde paneelmaten telt.' },
  { key: 'paneelMerk',           label: 'Paneel-merk (productie↔montage)', note: 'Elk paneel krijgt een gedeeld merk (P-nr per uniek type) als kolom in de EPC-tabel/CSV + op de tekening, hergebruikt in de productielijst. Vereist "Uittrekstaat — panelen op steenrijen".', advanced: true },
  { key: 'paneelMerkPerZone',    label: 'Paneelnummering per zone', note: 'De P-nummering telt niet door over penant-zones heen: elke zone begint weer bij P1 met eigen nummering + telling. Alleen bij >1 zone.' },
  { key: 'paneel14Laag',         label: 'Panelen — 14-laag + latten uit paneelvoegen', note: 'Halfsteens: paneelhoogte vast op 14 lagen (14·steenH+13·lint+(lint−3)) i.p.v. gewicht/hoogte-instelling; latten afgeleid uit de paneelvoegen (voeg-lat + onderlat +10mm + ~400 h.o.h. opvulling).', advanced: true },
  { key: 'paneelRaster',         label: 'Panelen — raster-methode (kiesbaar per groep)', note: 'Alternatieve paneelmethode náást de banden-methode, per groep te kiezen (Panelen → Methode): uniform raster vanaf de startlijn, rijen strikt 789 hoog, kolommen 1130 breed gesnapt op de raamranden (restje < ½ paneel → vorig paneel groter). Ramen snijden een schone band. Default-methode blijft "banden" (byte-identiek).' },
  { key: 'bandenOptimalisatie',  label: 'Panelen — banden-methode geoptimaliseerd', note: 'Optimaliseert de bestaande banden-methode: (1) kolombreedte = max heel aantal strekken uit het 2500-basispaneel (11 strekken = 2489,6 mm bij waalformaat; naad in de stootvoeg → koppelstrippen om-en-om); (2) de band-indeling blijft; (3) paneelhoogte in LAGEN i.p.v. mm (veld "Paneelhoogte (lagen)", default 14, max 15); (4) een band ≤15 lagen wordt 1 paneel, anders het minste aantal gelijke panelen (elk ≤15 lagen). Default uit → byte-identiek.' },
  { key: 'strip3dFilter',        label: '3D — geen paneel/lat zonder strip', note: '3D krijgt dezelfde strip-overlap-filter als 2D/werktekening/export: een paneel (en de erop volgende latten) verdwijnt als het nergens een steenstrip raakt. Dicht het gat waardoor 3D een paneel zonder strip kon tonen (bv. smalle zone tussen openingen).', advanced: true },
  { key: 'lattenPlat',           label: 'Latten plat (lange zijde tegen de wand)', note: 'De lat ligt plat: de langste maat in het gevelvlak (aanzicht), de kortste als diepte. Corrigeert een artikel met omgekeerde maten (bv. Mclad V18 45×95) dat anders op z\'n kant 95 mm uitsteekt. Werkt in 3D/2D/werktekening/IFC-export/mal.' },
  { key: 'onderlatOffset',       label: 'Onderlat 10 mm boven de starthoogte', note: 'De onderste gevelbrede lat ligt 10 mm hoger dan de projectstart/startlijn (peil) i.p.v. er precies op — ruimte voor het start-/lekprofiel. Werkt in 3D/2D/werktekening/IFC-export.' },
  { key: 'lattenPaneelvoeg',     label: 'Latten op paneelvoeg (keuze in achterconstructie)', note: 'Zet in de groep-config (Achterconstructie hout → horizontaal) een keuze aan: latten op elke paneelvoeg + een start/eind-lat + tussenliggende latten die grote gaten opvullen, i.p.v. puur op interval. Zo landt elke paneelrand op een lat (schroefbaar). Per groep kiesbaar via de radio "Plaatsing"; werkt in alle views + export/mal.' },
  { key: 'paneelVoegSnap',       label: 'Paneelnaden in de voeg (standaard aan)', note: 'STANDAARD AAN. Snapt de horizontale paneelnaden op de lintvoeg zodat ze niet midden door een steen lopen: (A) basis-banden die door een gewichts-split naast een course belandden worden op de dichtstbijzijnde lintvoeg geremapt (overlap-veilig; gevelrand + zonegrenzen blijven staan); (B) een tekenzone met een AFWIJKEND verband (bv. staand-tegel in een halfsteens groep) krijgt zijn eigen course-grid (226,6) i.p.v. de veld-courses (56,6) → de zone-naad valt op de zone-lintvoeg, net als de zone-strips. Een zone die het groep-verband al volgt blijft byte-identiek. Werkt in alle views + export. Uitzetten = ?paneelVoegSnap=0.' },
  { key: 'paneelBanden',         label: 'Paneelbanden (voeg-geleid + zaagsnede −3)', note: 'Paneelindeling volgt de productiemethode: rechterrand = eerstvolgende hele-steen-stootvoeg − 3 mm (zaagsnede), bovenrand = eerstvolgende lintvoeg − 3 mm; onder een raam eindigt het paneel op de course onder de dorpel, boven een raam start het op de strip-onderkant boven de latei, beide vol-breed doorgetrokken → horizontale banden. Alleen de echte gevelrand/gevel-top krijgt geen −3. Vervangt lintvoeg/zaagsnede/hele-lagen.' },
  { key: 'penantHoekStoot',      label: 'Penant — stootvoeg voor↔zij (3D)', note: 'Zet een stootvoeg tussen de voorvlak-strip en de zijvlak-strip van een penant (3D): de zijstrip stopt een stootvoeg vóór de voorstrip i.p.v. er tegenaan (haalt de stoot uit de zijstrip-lengte).', advanced: true },
  { key: 'unitDetectie',         label: 'Detecteer repeterende units', note: 'Herkent verdiepingshoge buitenwand-panelen met dezelfde maat + raam/deur-layout en zet elk voorkomen als een gekoppelde gevelgroep weg (1× een unit-type instellen → alle kopieën volgen). Puur additief.' },
  { key: 'ghImport',             label: 'Grasshopper-gevel importeren', note: 'Laad een Grasshopper/Geometry-Gym IFC waarin panelen/strippen/latten al gemodelleerd zijn (geen wanden): leidt de gevels af, nummert de panelen per gevel en toont per gevel een beoordelingsaanzicht + uittrekstaat + zaaglijst.', reimport: true },
  { key: 'stijlenImport',        label: 'Module-stijlen laden (verticale latten)', note: 'Laad een stijlen-JSON (uit het Tekla modules-model) met de verticale-lat schroeflijnen per verdieping op de module-stijlen. De app koppelt ze per gevelgroep en tekent ze op de werktekening bij een 2-lats achterconstructie (per verdieping, op de stijlen, geen lat over een opening).' },
  { key: 'productieSorteerAantal', label: 'Productie-tab: sorteer op aantal per merk', note: 'De "Paneel productie"-tab toont de unieke panelen gesorteerd op het aantal te produceren per merk — hoogste aantal eerst — i.p.v. de ruimtelijke volgorde. Alleen de weergave-volgorde verandert; merk-labels en aantallen blijven gelijk.' },
  { key: 'newOpenings',          label: 'Nieuwe opening-afleiding',  note: 'Experimenteel alternatief parse-pad; kan bestaande resultaten veranderen.', reimport: true, advanced: true },
  { key: 'openingUpAxisFix',     label: 'Opening up-as fix',         note: 'Experimenteel.', reimport: true, advanced: true },
  { key: 'selfContainedProjects',label: 'Self-contained projecten',  note: 'Experimenteel.', advanced: true },
  { key: 'planBridge',           label: 'Planner-brug (iframe)',     note: 'Intern; alleen voor inbedding in de planningstool.', advanced: true },
];

// Vlaggen die DEFAULT AAN staan maar tóch in de registry/UI zichtbaar zijn (zodat de UI-schakelaar
// hun echte begintoestand toont i.p.v. vals "uit"). NOODREM blijft ?key=0.
const FLAG_DEFAULTS_ON = { paneelOptimalisatie: true, unifiedPanels: true, unifiedLatten: true, paneelVoegSnap: true, paneelZoneVerband: true };
// Huidige effectieve waarde van een vlag (URL > localStorage > default).
export function getFlag(key) { return readFlag(key, FLAG_DEFAULTS_ON[key] ?? false); }
// Zet een vlag in localStorage (voor de UI-schakelaars).
export function setStoredFlag(key, on) { try { localStorage.setItem(key, on ? '1' : '0'); } catch {} }
