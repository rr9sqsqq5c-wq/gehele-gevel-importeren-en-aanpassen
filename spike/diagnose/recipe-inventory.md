# READ-ONLY DIAGNOSE — paneel/rij/strip-datamodel t.b.v. machine-recept

**Worktree** `C:\dev\brickboard` @ **9130bba** (branch `brickboard`)
**Modus** READ-ONLY DIAGNOSE/MEET — niets gewijzigd, geen commit.
**Doel** één canonieke stripdata-structuur voor 3D/2D/IFC? + ontbrekende velden voor
(a) per-paneel rij-CSV en (b) mal-vulschema (striplengtes + x-posities per rij).

---

## Q1 — VERBAND (halfsteens generatie) 🟢

Halfsteens wordt gegenereerd in **`buildRowPiecesForWidth(totalWidth, material, verband, rowIndex, startX)`**
([src/lib/pattern.js:24](src/lib/pattern.js#L24-93)). Output = array van **pieces**:
`{ start:number(mm), length:number(mm), label:'Kop'|'Strek'|'Drieklezoor'|'Rest'|'Tegel' }`
([pattern.js:33,46,56,73,84](src/lib/pattern.js#L46)). Er is **geen** laag-/course-index en **geen**
pariteitsvlag in de piece; de pariteit komt via de **argument** `rowIndex`
(`useKop = verband==='halfsteens' && rowIndex % 2 !== 0`, [pattern.js:41](src/lib/pattern.js#L41)).

**Laag-index afleidbaar?** 🟠 Alleen indirect. De rij-container die de generator opslaat is
`{ y, pieces }` ([pattern.js:285,499](src/lib/pattern.js#L499)) — **`y` in mm, geen `r`**. In
`buildFullGroupFacadePattern` is `y = round2(patternOffset + r*lagenmaat)`
([pattern.js:460](src/lib/pattern.js#L460)), dus `r = (y - patternOffset)/lagenmaat`. Maar
`lagenmaat`(=`steenH+lint`) **noch** `patternOffset` staan in het teruggegeven object
([pattern.js:502](src/lib/pattern.js#L502)) → pariteit is **niet zonder externe herberekening**
reconstrueerbaar, en bij een `startLijn`≠0 (patternOffset≠0) **lossy**. → ontbrekend veld.

## Q2 — PANELISATIE (paneel-entiteit) 🟢 (met naamcorrectie)

**`PREFER_SINGLE_PANEL` bestaat NIET** in de codebase (0 hits; alleen in geïmporteerde
web-ifc-bundle/IFC-testbestanden als toevallige substring). **Niets verzonnen — ONBEKEND/afwezig.**

Paneel-entiteit bestaat wél: gebouwd door **`panelizeZone(zone, battenYs, basePanel, snapFn, material, verband)`**
([src/lib/panelization.js:464](src/lib/panelization.js#L464-606)) → `panels[]` met velden
`{ id, zoneId, row, col, x, y, width, height, area, orientation:'liggend'|'staand', staggered:bool, isFallback? }`
([panelization.js:592-602, buildPanelsFromBreaks ~430](src/lib/panelization.js#L592)). Zones ervoor:
**`buildFacadeZones(facadeWidth, facadeHeight, openings)`** ([panelization.js:76](src/lib/panelization.js#L76)).

**Max-breedte 1250?** 🟠 De **1250** is **geen** paneel-max-breedte maar `plaatBreedte`/`maxPaneelHoogte`
in de **materiaal-/plaatcatalogus** ([src/lib/battens.js:346,349,…](src/lib/battens.js#L346)). De
werkelijke paneelbreedte komt uit **`computeEffectiveBasePanel(panelen, brickWeightM2, material)`**
([panelization.js:704](src/lib/panelization.js#L704-730)): `width = panelen.breedte ?? 3005`,
`height = min(panelen.hoogte ?? 1200, maxAreaMM2/w)` (gewichts-begrensd, `maxKg ?? 50`),
`targetWidth = min(w, 5*steenL+4*stoot)`, `minHeight = 800` (hard, [panelization.js:725](src/lib/panelization.js#L725)).
Dus paneelmaat = **UI-invoer `panelen.*`** + gewichtslimiet, **niet** één vaste 1250-constante.

## Q3 — FRAME (vlak-lokaal u,v) 🟠

Er is een vlak-lokaal frame, in **twee smaken**:
- **best-fit** (vlag `bestFitGroups`, default AAN): `fitFacadePlane` levert `{ uAxis, tAxis, nAxis,
  outsideDir, offset }` ([src/lib/facadePlane.js:67,137](src/lib/facadePlane.js#L137)); `tAxis`=breedte(u),
  `uAxis`=hoogte(v), `nAxis`=normaal. Oorsprong = `groupMinX`/`groupMinH` (min langs t/u),
  ge-remapt in `toVirtualWall` ([facadePlane.js:176](src/lib/facadePlane.js#L176)).
- **klassiek**: `refWallOrigin.{lengthAxis,heightAxis,thicknessAxis}` van de langste wand
  ([pattern.js:302-304,502](src/lib/pattern.js#L302)); oorsprong idem `groupMinX/groupMinH`.

**"Links" (x=0)** = de **kleinste wereldcoördinaat langs lengthAxis/tAxis** (`Math.min(lengthStart)`,
[pattern.js:307](src/lib/pattern.js#L307)). **outsideDir** (van buiten kijken) komt los daarvan uit
`resolvedOutside.outsideDir` ([Viewer3D.jsx:73,259](src/Viewer3D.jsx#L259); calcOutsideFace
[ifc.js:1829](src/lib/ifc.js#L1829)); de camera kijkt langs `thicknessAxis * outsideDir`
(`FocusGroupCamera` [Viewer3D.jsx:1317,1363-1366](src/Viewer3D.jsx#L1363)).

**Deterministisch paneel-lokaal frame "linksonder gezien van BUITEN"?** 🔴 **Handedness is IMPLICIET.**
`x=0` ligt op de min-lengthAxis-hoek in wereldassen; of dát van buiten links of rechts is, hangt af
van het teken van `outsideDir` t.o.v. de lengthAxis-richting — nergens expliciet vastgelegd. Het
bestaan van de **handmatige `outsideDirFlip`** ([Viewer3D.jsx:880,1363](src/Viewer3D.jsx#L1363);
[ifc.js:2020](src/lib/ifc.js#L2020)) bevestigt dat de automatische buiten-richting soms fout is en
met de hand gecorrigeerd wordt. Een van-buiten-gezien "linksonder" is dus **niet gegarandeerd** en
moet expliciet worden afgeleid (uit outsideDir × lengthAxis-oriëntatie).

## Q4 — RIJEN EN SEGMENTEN (kern) 🟠

**Per laag opvraagbaar uit bestaande data:**
- **yCenter** 🟢 — `row.y` (onderkant strip, mm) + `steenH/2`. `row.y` is de canonieke rij-y
  ([pattern.js:499](src/lib/pattern.js#L499)); center = `groupMinH + row.y + steenH/2` zoals
  Viewer3D/IFC-export dat doen ([Viewer3D.jsx:262](src/Viewer3D.jsx#L262), [ifc.js:2079](src/lib/ifc.js#L2079)).
- **geordende strip-segmenten met gaten door openingen** 🟢 — `row.pieces[]` is al rond openingen
  geknipt (`splitAroundOpenings`/`clipPiecesAgainstOpenings`, [pattern.js:429,204](src/lib/pattern.js#L429))
  en bij best-fit tot de element-contour gemaskeerd (`maskRowsToContours`, [facadePlane.js:200](src/lib/facadePlane.js#L200)).
  Segmenten hebben `start`/`length` (→ xStart=start, xEnd=start+length).
- **gaten door PANEELranden** 🔴 **breekt hier.** De pieces zijn **NIET** gesplitst op paneelgrenzen;
  panelen worden **apart** berekend (`panelizeZone`) en nergens met `row.pieces` doorsneden om
  per-paneel-segmenten te maken. De enige bestaande rij×paneel-doorsnede is
  **`detectKoppelstrippen`** ([panelization.js:608-641](src/lib/panelization.js#L608)) — die vindt
  strips die ≥2 panelen overspannen, maar levert géén per-paneel geclipte segmentlijst.
- **`isCut`** 🔴 **bestaat niet.** `label` is de verband-rol ('Strek'/'Kop'/…), niet "afgeknipt".
  Sub-pieces uit opening-/contour-clipping erven de originele `label` ongewijzigd
  ([pattern.js:451](src/lib/pattern.js#L451)); of een segment door een opening/paneelrand is
  afgesneden is nergens gevlagd. Afleidbaar (length < nominale steenL, of segment-rand valt op
  opening/paneelrand) maar **niet opgeslagen**.

**Minimale striplengte / klezoor-regel?** 🟢 Aanwezig in `buildRowPiecesForWidth`:
drieklezoor-omzetting als de rest te klein is (`rest>stoot && rest-stoot<kop → 'Drieklezoor'`,
[pattern.js:67-77](src/lib/pattern.js#L67)); rest-stukjes < 0.001/0.5 mm worden weggefilterd
([pattern.js:80,173,240](src/lib/pattern.js#L240)). Er is **geen** harde "min. 40 mm klezoor"-regel
die te kleine reststukjes naar een buurstrip herverdeelt buiten de opening-edge-fix
`fixOpeningEdgePieces` ([pattern.js:116](src/lib/pattern.js#L116)).

**Waar breekt het?** De **laag bestaat** (row.y), de **y bestaat**, de **x-ordening bestaat** — wat
ontbreekt is de **doorsnede rijen × panelen** (per-paneel segmentlijst) en een **isCut**-vlag.

## Q5 — CONSTANTEN 🟢

| grootheid | waarde | bron | type |
|---|---|---|---|
| striplengte `steenL` | 210 | `DEFAULT_MATERIAL` [App.jsx:34](src/App.jsx#L34) | UI-invoer (materiaal) |
| striphoogte `steenH` | 50 | idem | UI-invoer |
| voegbreedte (stoot) `stoot` | 10 | idem | UI-invoer |
| voeghoogte (lint) `lint` | 12 | idem | UI-invoer |
| stripdikte `brickDepth` | 20 | [App.jsx:698,43](src/App.jsx#L698); IFC-export `brickD` [ifc.js:1984](src/lib/ifc.js#L1984) | UI-invoer (of uit steenstrip-catalogus `_stripArt.dikte`) |
| laagmaat (hoh vert.) `lagenmaat` | `steenH+lint`=62 | `getLagenmaat` [pattern.js:95-98](src/lib/pattern.js#L95) | **afgeleid** (bij `staand_tegelverband`=`steenL+lint`) |
| paneeldikte `panelen.dikte` | 8 | [App.jsx:44,699](src/App.jsx#L44); [ifc.js:1998](src/lib/ifc.js#L1998) | UI-invoer |

**Lijmverbruik**: bestaat als aparte notie (`brickWeightM2` gewicht, geen lijm-mm) — **geen**
lijm-volume-berekening in strip/paneel-pad gevonden; alleen gewicht/m² UI ([App.jsx:34](src/App.jsx#L34),
zie ook memory *gevelgewicht-kg-per-m2*). Voor het recept niet relevant.

## Q6 — DUBBELE AFLEIDING (kernvraag) 🟢 — één generator, grotendeels gedeelde data

Alle strip-x-posities ontstaan op **één plek**: `buildRowPiecesForWidth` binnen
`buildFullGroupFacadePattern` / `buildBestFitFacadePattern` ([pattern.js:294](src/lib/pattern.js#L294),
[facadePlane.js:247](src/lib/facadePlane.js#L247)). Die worden **één keer** berekend in de 3D-memo en
opgeslagen als `allPatterns[groupId].facadeData` ([App.jsx:3358-3363](src/App.jsx#L3358)).

- **3D** leest `groupPatterns={allPatterns}` → `groupPattern.facadeData.rows[].pieces[]`
  ([App.jsx:6446-6451](src/App.jsx#L6446); consumptie [Viewer3D.jsx:873,982](src/Viewer3D.jsx#L982)).
- **2D** leest **exact dezelfde** `facadeData={allPatterns[activeGroup.id]?.facadeData}`
  ([App.jsx:6504-6506](src/App.jsx#L6504)).
- **IFC-export** leest `group.facadeData?.rows` (of `group.stripBatches` afgeleid daarvan)
  ([ifc.js:2068,2077-2079](src/lib/ifc.js#L2068)); de export-memo **prefereert** de 3D-`facadeData`
  (`allPatterns[group.id]?.facadeData ?? …`, [App.jsx:4958](src/App.jsx#L4958)) en valt alleen bij
  ontbreken terug op een verse `buildFullGroupFacadePattern` ([App.jsx:4959](src/App.jsx#L4959)).

→ **Geen drie onafhankelijke afleidingen.** Eén generator (`pattern.js`), één canonieke
`facadeData.rows/pieces`, gedeeld door 3D→2D→IFC. **STOP-conditie Q6 (3× divergentie) NIET van
toepassing.** 🟢

🟠 Kanttekening: de **werktekening/mal-CSV-memo** ([App.jsx:4824](src/App.jsx#L4824)) roept
`buildFullGroupFacadePattern` **opnieuw** aan (los van 3D) en berekent panelen + `generateMoldRecipe`
zelfstandig — byte-identieke generator, maar een **tweede aanroep-plek** met eigen `maskedRows`.
Consistentierisico als parameters uiteenlopen, geen correctheidsdivergentie in het patroon zelf.

## Q7 — EXPORTPAD 🟢

IFC-export: **`exportGroupsToIfc(groups, wallSettings, fileName, dirHandle)`**
([ifc.js:1893](src/lib/ifc.js#L1893)); aangeroepen op [App.jsx:5591](src/App.jsx#L5591). Levering: als
`dirHandle` (File-System-Access) → schrijf bestand in map; anders **Blob + `a.download` klik**
([ifc.js:2591-2620](src/lib/ifc.js#L2591)).

**CSV-precedenten (zelfde blob-download-patroon):** Mal-recept-CSV
([App.jsx:4886-4904](src/App.jsx#L4886), `generateMoldRecipe`) en zaaglijst-CSV
([Werktekening.jsx:706-710](src/Werktekening.jsx#L706)). **Meerdere bestanden per paneel** kan
triviaal via meerdere blob-downloads of één ZIP (geen zip-lib aanwezig → per-bestand download of
map-handle). **Minimaal-invasieve inhaakplek:** een nieuwe knop/handler naast `handleExportMalRecept`
([App.jsx ~4820-4905](src/App.jsx#L4886)) die **dezelfde** `facadeData.rows` × `panels` (beide al in
die memo aanwezig) doorsnijdt en per paneel een CSV serialiseert — geen wijziging aan de generator.

## Q8 — TESTS 🟠

**Geen testrunner geconfigureerd:** `package.json` scripts = alleen `dev`/`build`/`preview`
([package.json:6-10](package.json#L6)); geen `vitest`/`jest` in deps, geen `*.config`. Enige test:
`src/lib/__tests__/adapterSmokeTest.js`, bedoeld als **`node …adapterSmokeTest.js`** (plain node,
[adapterSmokeTest.js:4](src/lib/__tests__/adapterSmokeTest.js#L4)) — en die test de **niet-bedrade**
nieuwe engine, niet `pattern.js`.

**Golden-file CSV headless mogelijk?** 🟢 Ja. `pattern.js` importeert alleen `geometry.js` (puur) en
`featureFlags.js` (window/localStorage in `try/catch` afgevangen, [featureFlags.js:5-19](src/lib/featureFlags.js#L5)).
`panelization.js` idem pure-JS. Dus een golden-file test die `buildFullGroupFacadePattern` +
`panelizeZone` in **plain node** aanroept en de CSV-string vergelijkt, draait **zonder browser** —
alleen een runner (vitest of een `node`-script in `spike/`) moet nog toegevoegd worden.

## Q9 — VLAGGEN 🟢

Signatuur: alle vlaggen via **`readFlag(name, def)`** ([featureFlags.js:5-20](src/lib/featureFlags.js#L5)):
1) URL-param wint (`?name=…`; `'0'`/`'false'` → false, anders true — [regel 9](src/lib/featureFlags.js#L9));
2) anders `localStorage[name]` (`'1'`/`'true'`); 3) anders `def`. Elke vlag = één exportfunctie
`isXxx()` die `readFlag('xxx', default)` teruggeeft (bv. [featureFlags.js:30,183](src/lib/featureFlags.js#L183)).

**URL-noodrem (`?vlag=0`)**: param aanwezig met `'0'` → `false` ongeacht default (regel 9), dus een
default-AAN-vlag (bestFitGroups/featureZones/upAxisInherit) is met `?vlag=0` hard uit te zetten.
**Patroon "byte-identiek als UIT"**: default `false`, en met de vlag uit loopt exact de originele
codetak (de nieuwe tak staat achter `if (isXxx())`; extend/mask-params worden 0 doorgegeven zodat de
nieuwe helper een no-op is — bv. [facadePlane.js:262](src/lib/facadePlane.js#L262),
[pattern.js:347](src/lib/pattern.js#L347)).

---

## Kortste weg naar recept

De **ENE canonieke plek** die een `PanelLayout` zou moeten produceren is de **mal-/werktekening-memo
rond [App.jsx:4820-4890](src/App.jsx#L4855)** (níet een nieuwe generator): daar zijn **beide** al
aanwezig in scope — de canonieke `facadeData.rows[].pieces[]` (via `allPatterns[group.id].facadeData`,
zoals de export op [App.jsx:4958](src/App.jsx#L4958) al prefereert) én de `panels[]` uit
`panelizeZone`. Een dunne functie (in `panelization.js`, naast het bestaande
`detectKoppelstrippen`-patroon [panelization.js:608](src/lib/panelization.js#L608)) doorsnijdt per
paneel elke `row` met de paneel-x-range en emit `PanelLayout { panelId, x,y,w,h, courses:[{ course,
yCenter, parity, segments:[{ xStart, xEnd, length, label, isCut }] }] }`.

**Velden die daar NU ontbreken en toegevoegd moeten worden:**
1. **course-index + pariteit per laag** — `row` bewaart alleen `y`; `r`/pariteit is verloren zodra
   `startLijn`≠0 (patternOffset niet in `facadeData`, [pattern.js:502](src/lib/pattern.js#L502)).
   Nodig: `lagenmaat` + `patternOffset` meegeven óf `r`/`parity` per rij opslaan.
2. **rij-segmenten met paneel-x-grenzen** — pieces zijn wél rond openingen/contour geknipt, maar
   **niet** op paneelgrenzen; de doorsnede rijen×panelen bestaat nergens (alleen span-detectie in
   `detectKoppelstrippen`).
3. **`isCut`-vlag per segment** — bestaat niet; `label` = verband-rol, niet "afgesneden".
4. **striplengte per segment** — bestaat (`piece.length`), maar de **paneel-lokale** xStart/xEnd
   (paneel-frame i.p.v. groep-frame) en de **van-buiten-gezien handedness** moeten expliciet worden
   afgeleid (outsideDir × lengthAxis, zie Q3 🔴) — nu impliciet.
5. **yCenter** is triviaal afleidbaar (`groupMinH + row.y + steenH/2`) maar staat niet als veld.

Kort: de datastructuur is **canoniek en gedeeld** (geen 🔴-divergentie); het recept hoeft alleen
**rijen × panelen te snijden** en **course/pariteit + isCut** toe te voegen op één bestaande memo.
