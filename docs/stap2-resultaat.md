# Stap 2 — resultaat (in gewone taal)

Wat is gedaan: het nieuwe pad om openingen te vinden is in App B gebouwd, **achter
een schakelaar**. De schakelaar staat **uit**; het oude pad blijft gewoon werken.
Zo kan er niets stuk en kunnen we oud en nieuw naast elkaar leggen.

## Wat er veranderd is (klein gehouden)
- Nieuw bestand `src/lib/openingDerivation.js` — de nieuwe afleiding.
- Nieuw bestand `src/lib/featureFlags.js` — de schakelaar (standaard uit).
- `src/lib/newEngineRunner.js` — één `if` die naar het nieuwe pad gaat als de
  schakelaar aan staat.
- `src/App.jsx` — de import-cache krijgt een label zodat oud en nieuw niet door
  elkaar lopen.
- Niets anders aangeraakt. De app **bouwt** zonder fouten (`npm run build` ✓).

De schakelaar aanzetten kan zonder opnieuw bouwen: `?newOpenings=1` achter de URL.

## Hoe getest
De kern van de nieuwe module (dezelfde code die de app gebruikt) is los gedraaid op
de echte modellen, plus een synthetische gedraaide wand. Zie
`spike/validate/stap2-core.mjs`. De drie bronnen zijn:
(1) welke openingen = void/fill-relaties, met terugval op ramen/deuren;
(2) buiten/binnen = NL-SfB-code (niet IsExternal);
(3) maat/plek = de echte vorm op het wandvlak projecteren.

## Resultaten per testgeval

| Testgeval | Verwacht | Gevonden | Oordeel |
|---|---|---|---|
| **BIL-MOO** (echte voids) | ~2677 wand-gaten, 123 ramen | 2192 openingen (123 raam, 151 deur, 1918 sparing); 485 piepkleine (<50 mm) bewust overgeslagen; **0 dubbeltellingen** | 🟢 |
| **Helmond** (echte voids) | 490 wand-gaten | 490 openingen (10 raam, 76 deur, 404 sparing); 0 dubbeltellingen | 🟢 |
| **Kubistische woning** (0 voids, 18 ramen + 11 deuren) | terugval vindt de ramen/deuren | **28 gevonden** (18 raam + 10 deur) via de IfcWindow/IfcDoor-terugval | 🟠 (1 deur niet gekoppeld) |
| **Synthetische 45°-wand** | strakke omtrek i.p.v. opgeblazen doosje | projectie geeft **1000 × 2000 mm** (klopt); het oude doosje geeft **707 mm** breed (29% te smal) | 🟢 |
| **NL-SfB-tabel** | 21=buiten, 22=binnen, onbekend=null | 21→buiten, 22→binnen, 28→binnen, 42/17→"weet niet" (null) | 🟢 |
| **Vloer-gaten apart** | apart tellen | BIL 279, Helmond 66 — apart geteld en **niet** als wand-opening meegenomen | 🟢 |

Belangrijk: op de modellen mét voids voegt de terugval **niets** toe (0), dus geen
dubbeltelling. Op het model zónder voids doet alleen de terugval het werk. Precies
de bedoeling.

## Nieuw vs. oud (kort)
- **Aantal openingen**: op de void-modellen vergelijkbaar (beide lezen dezelfde
  void-relaties). Het oude pad kopieert openingen nog naar buurwanden
  (`inheritOpeningsForWalls`); dat is bij het nieuwe pad niet nodig omdat elke
  opening al aan de juiste host hangt.
- **Maat/plek**: gelijk bij rechte wanden; **strakker** bij gedraaide/ronde gaten
  (synthetische wand: 1000 mm correct vs. 707 mm fout bij het doosje).
- **Void-loze modellen**: het oude pad vindt daar **0** openingen; het nieuwe pad
  vindt ze via ramen/deuren (Kubistische woning: 28). Dit is pure winst.

## Wat nog NIET is gedaan (eerlijk)
- **Echte browsertest niet uitgevoerd.** De schakelaar is niet in de draaiende app
  aangezet, en een **bestaand opgeslagen project is niet herladen** in de browser.
  Dat het blijft werken is *door het ontwerp* zo (de wand-`expressID`'s komen
  1-op-1 uit `parseIfc`, dus `groups.wallIds`/instellingen/overrides blijven
  kloppen — zie `spike/json-schema.md` en `docs/openingsafleiding.md`), maar het is
  nog niet met een echte muisklik bevestigd.
- **Multi-band samenvoegen** (één kozijn over meerdere dunne banden) gebeurt in de
  bestaande gevelgroepering/bekleding; dat is niet apart visueel nagelopen.
- **1 deur** in de Kubistische woning werd niet aan een wand gekoppeld (10 van 11).
  Klein, maar uitzoeken waard.
- **Merge-import** (een tweede IFC toevoegen) loopt nog via het oude pad.

## Eindoordeel: 🟠 ORANJE

De nieuwe afleiding **klopt op alle geteste modellen** in de losse test, is veilig
ingebouwd (schakelaar uit, build groen, oude pad onaangeroerd, `expressID`
behouden), en doet aantoonbaar iets dat het oude pad niet kan (void-loze modellen +
strakke omtrek bij rotatie).

Nog niet groen omdat de **laatste, echte browser-acceptatie** ontbreekt:
1. schakelaar aan in de draaiende app op BIL/Helmond/Kubistisch en visueel checken;
2. een **bestaand opgeslagen project herladen** en bevestigen dat het correct
   hergroepeert;
3. de 1 ontbrekende deur (Kubistisch) en de merge-import nalopen.

Zodra die drie punten groen zijn, mag de schakelaar standaard aan. De code staat
klaar; alleen de browser-bevestiging resteert.

---

## Afronding stap 2 (twee losse punten)

> De handmatige browsercheck doet de gebruiker zelf. De flag blijft opt-in
> (standaard uit). Gevelgroepering en oud pad ongewijzigd.

### 1. Merge-import loopt nu ook via de nieuwe afleiding (achter dezelfde flag)
De merge-flow (tweede IFC toevoegen) liep nog op het oude pad: `confirmMergeImport`
haalt elementen via `parseIfcZoneElements` (`src/App.jsx:4013`). Nu: staat de flag
aan, dan worden de openingen van die elementen vervangen door de nieuwe afleiding,
**vóór** de `m{n}_`-prefix wordt gezet (zodat de expressID's nog numeriek zijn en
matchen met web-ifc):

- `src/App.jsx:4025-4027` — onder `isNewOpeningDerivation()` roept de merge nu
  `applyProjectedOpenings(pendingFile, elements, …)` aan.
- Daarvoor is in de module een gedeelde functie afgesplitst:
  `applyProjectedOpenings(file, walls, onProgress)` in
  `src/lib/openingDerivation.js:271`. Zowel enkel-import
  (`deriveWallsWithProjection`, `:307`) als merge-import gebruiken nu exact
  dezelfde opening-afleiding. Geen nieuwe logica — alleen gedeeld gemaakt.
- Build groen (`npm run build` ✓). expressID's blijven behouden (de prefix gebeurt
  ná de afleiding, net als voorheen).

Gevolg: onder de flag geven enkel- en merge-import nu consistente openingen.

### 2. De ene ontbrekende Kubistisch-deur — verklaard, geen fix nodig
De terugval vond 28 van de 29 (18 raam + 10 deur). De niet-gekoppelde is
**deur expressID 43274**:

- Maten: `OverallWidth = 800 mm`, `OverallHeight = 600 mm`; geometrie-AABB
  **0,80 × 0,018 × 0,60 m** — een plat paneel van 18 mm dik en maar 60 cm hoog.
- Ter vergelijking: de echte deuren in dit model zijn ~0,98 × 2,39 m.
- Hij ligt bovendien **0,76 m van het dichtstbijzijnde wandvlak** (een dunne wand
  van 114 mm) — veel verder dan een deur-in-wand ooit zou liggen.

Conclusie: dit is **geen gevelopening** maar een klein, los plat element dat als
`IfcDoor` is geclassificeerd (een luik/paneel, 800×600 mm, 60 cm hoog, niet in een
wandvlak). De terugval wijst hem **terecht af**. Het is dus geen misser — 28/28
echte openingen zijn gevonden, en het 29e element hoort niet mee te tellen.
Geen codewijziging.

Onderbouwing/diagnose: `spike/validate/door-check.mjs` (welke deur + waarom) en
`spike/validate/door43274.mjs` (de maten).

### Stoplicht na afronding: 🟠 ORANJE (ongewijzigd)
De twee punten zijn afgehandeld (merge gerouteerd, deur verklaard). Het oordeel
blijft oranje om één reden: de **handmatige browser-acceptatie** (flag aan in de
draaiende app + bestaand opgeslagen project herladen) staat nog open — die doet de
gebruiker zelf. Daarna mag de flag standaard aan.

---

## Bugfix — zwevende fallback-openingen (Kubistische woning)

### Symptoom
In het void-loze terugvalpad (Kubistische woning: 0 voids → window/door-terugval)
zweefden enkele openingen los van de wanden, buiten het gebouw. Het void-pad
(BIL/Helmond) was niet betrokken.

### Oorzaak (twee samenhangende fouten, alleen in het fallback-pad)
1. **Verkeerde up-as.** De Kubistische woning is **Y-up**, maar `detectUp`
   (`src/lib/openingDerivation.js:78`) leverde **Z** op. Die kolom-heuristiek faalt
   bij een (bijna) kubisch gebouw: de wand-extents in X/Y/Z liggen dicht bij elkaar
   (gemeten: X=80,7 Y=89,0 Z=75,5 m). Met de verkeerde verticaal stond het hele
   wandframe scheef → maten verwisseld (deuren kwamen er als 2394×984 i.p.v.
   984×2394 uit) en afstanden klopten niet.
2. **Te ruime host-drempel.** De host-koppeling accepteerde een wand zolang het
   raam/deur-centrum binnen de **wanddikte** van het vlak lag (`dt > thick + 0.5`).
   Bij vlakke, diepe elementen — vloeren/daken die óók in de IfcWall-set zitten
   (dikte tot 2744 mm) — was die drempel meters. Daardoor koppelde een raam/deur aan
   een horizontale plaat 1,1–1,5 m verderop → het zwevende beeld.

Diagnose-cijfers (oud pad, Kubistisch): 5 van de 28 openingen lagen >150 mm
(tot 1504 mm) van hun "host"; die hosts hadden een verticale extent van maar
~100–316 mm (= vloeren), geen wanden. Zie `spike/validate/fallback-diag.mjs`,
`up-probe.mjs`, `fallback-fix-test.mjs`.

### Fix (uitsluitend in het void-loze fallback-pad)
Het terugvalpad draait **alleen** als een model 0 voids heeft, dus BIL/Helmond
komen er nooit in — daarom raakt deze fix het void-pad gegarandeerd niet.

1. **Robuuste up-as voor de fallback** uit de window/door-elementen zelf (hun
   langste wereld-as = verticaal): `detectUpRobust`
   (`src/lib/openingDerivation.js:91`), aangeroepen in de fallback-tak
   (`:240`). De fallback bouwt z'n eigen frames met die up-as
   (`:243-244`); `detectUp` en de void-pad-frames blijven ongemoeid.
2. **Strakkere host-poort** in `assignHost`
   (`src/lib/openingDerivation.js:291,297`):
   - host moet een **verticale wand** zijn (verticale extent ≥ `FALLBACK_MIN_WALL_HEIGHT`
     = 1,0 m, `:265`) → vloeren/daken vallen af;
   - het raam/deur-centrum moet **dicht bij het wandvlak** liggen (absolute drempel
     `FALLBACK_MAX_OFFPLANE` = 0,5 m, `:266`) i.p.v. de wanddikte.

### Verificatie (headless, `spike/validate/stap2-core.mjs`)
- **Kubistisch:** 28 openingen gekoppeld, **0 zwevend** (alle offsets ≤ 99 mm), de
  fallback gebruikt nu `fbUp=Y`. Maten kloppen (deuren 984×2394). Het 29e element
  (luik 43274) valt nog steeds terecht af.
- **BIL-MOO en Helmond: ongewijzigd** — 2192 resp. 490 openingen, allemaal via het
  void-pad, `viaFallback=0`, `fbUp=-` (fallback draait daar niet). Void-pad dus
  aantoonbaar onaangeroerd.
- Build groen (`npm run build` ✓). Flag nog steeds opt-in (geen flip).
