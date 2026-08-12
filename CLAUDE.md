# CLAUDE.md — brickboard

> Kennisbestand voor Claude. Leeswerk vóór elke taak. Locatie: `c:/dev/brickboard/CLAUDE.md`.
> Status: secties gemerkt met **TODO ⬜** moeten nog uit de echte repo worden ingevuld
> (architectuur, bestanden-kaart, testmodellen). De rest is hard.

---

## 1. Wat is brickboard

Een gevel-bekledingsengine die een IFC-model inleest en **steenstrips** over de gevel
legt, weggeknipt rond openingen.

- **Stack:** React 19 + react-three-fiber (r3f) + three + web-ifc.
- **Invoer:** IFC-bestand (geometrie + openingen).
- **Uitvoer:** steenstrips over het doorlopende geveloppervlak, met halfsteens verband,
  uitgespaard rond ramen/deuren en de open zone onder een losstaande dakrand-band.
- **Opslag:** projecten in **IndexedDB** (DB `ifc-planner`, stores `ifc-files` /
  `parsed-walls` / `project-state`, allemaal `keyPath: 'id'`, `src/lib/storage.js:1-20`).
  De **DB-sleutel is `id`** (vaste waarde `'last'`, of een `bytesKey` voor bron-IFC-bytes);
  de **IFC `expressID`** is de element-identiteit *ín* de wand-records (`wall.expressID`),
  niet de DB-sleutel. Zie §5.

---

## Werkwijze — prompts voor Claude Code (geldt voor elke chat)

De planpartner (Claude in de chat) heeft geen directe repo-toegang; werk gebeurt via kopieerbare
prompts voor Claude Code (lokaal, worktree `C:\dev\brickboard`). Elke prompt volgt deze standaard:

**Vorm**
- Altijd in een kopieerbaar code-blok.
- Kop met de modus expliciet: `READ-ONLY DIAGNOSE/MEET` óf `FIX/BUILD/VALIDATE`. Nooit mengen zonder het te benoemen.
- Anker: `Worktree C:\dev\brickboard @ <commit-hash>`.

**Standaard-preamble**
- "Vraag geen toestemming voor read-only/browser/import-stappen; ga ervan uit dat je die hebt."
- Bij read-only: "NIETS aan de code wijzigen."
- "STOP aan het eind met rapport" (niet tussentijds stoppen of om toestemming vragen).

**Vaste import-werkwijze** (zodra het bronbestand wordt geraakt)
- "IFC import" → filter "21" → de 4 WallStandardCase selecteren (níét "Alle selecteren") → importeren.
- Dakranden via "aanvullen", zonder filter.
- Handleiding-/intro-overlay bij start onderdrukken (UI-state, geen code-wijziging).

**Nieuw gedrag**
- Achter een feature-vlag, default UIT, byte-identiek uit, met noodrem `?vlag=0`. De UIT-tak is woord-voor-woord het origineel.

**Verificatie / regressie-waakhond**
- Byte-identiek-uit-argument, `git diff --stat` = alleen de verwachte bestanden, build groen.
- Bestaande vlaggen/fixes intact (upAxisInherit, cornerButt, corner85, restore-fix).
- Opgeslagen projecten (key = expressID) ongemoeid (het laad-pad her-derivt niet).

**Gate** (bij FIX + VALIDATE + COMMIT in één doorloop)
- "ALLEEN als G1…Gn groen → committen; anders STOP, niets committen."

**Commit**
- Lokaal, NIET pushen, alleen de relevante code-bestanden, met een beschrijvende message.

**Rapport**
- Jip-en-janneke, stoplicht 🟢/🟠/🔴 per punt, met file:line.

**Onderliggende principes (altijd)**
- Oorzaak, niet symptoom.
- Grenzen/risico expliciet benoemen.
- Wegwerpwerk in `spike/`.
- Citeer file:line.
- Opgeslagen projecten (key = expressID) nooit breken.

---

## 2. Lokaal draaien

```
brickboard.bat
```

Wat het script doet (`brickboard.bat`):

1. **Poorten opruimen** — `taskkill` op alles wat luistert op **5173, 5174 en 5200**
   (`brickboard.bat:16-31`), plus vensters met titel `IFC Brickstrip*` / `Vite Dev*`
   (`brickboard.bat:34-35`).
2. **Naar projectmap** — `cd /d C:\dev\brickboard` (`brickboard.bat:42`).
3. **Dev server starten** — opent een nieuw cmd-venster en draait `npm run dev`
   (`brickboard.bat:49`). `npm run dev` = `vite` (`package.json:7`).
4. **Browser openen** — wacht 5 s en opent `http://localhost:5173`
   (`brickboard.bat:53-55`).

- **Poort: 5173** (Vite-default; in `vite.config.js` staat **geen** `server.port`).
- **Geen build-stap.** Het script draait alleen de dev-server. Builden is apart:
  `npm run build` (= `vite build`, `package.json:8`) of via `runbuild.bat`.
  `vite.config.js` splitst de build in vendor-chunks (web-ifc / three / r3f / react).

---

## 3. Architectuur

Per laag het belangrijkste bestand + de publieke entry-points (citaten = `file:line`).

- **Rendering (r3f/three)** — `src/Viewer3D.jsx` (export `Viewer3D`, lazy geladen in
  `src/App.jsx:21`, gerenderd op `src/App.jsx:6173`). Bouwt de r3f `<Canvas>` +
  `OrbitControls` (`src/Viewer3D.jsx:1-2`), zet IFC-mm om naar three-meters via
  `ifcToThree` (`src/Viewer3D.jsx:30`) en oriënteert de scène met `buildProjectMatrix`
  uit `projectCoordinates.js` (`src/Viewer3D.jsx:5`). 2D-tegenhanger: `src/View2D.jsx`.
- **IFC (web-ifc)** — `src/lib/ifc.js`. Entry-points: `getApi()` (`:405`, init wasm via
  `/web-ifc*` uit `public/`), `parseIfc()` (`:1166`, hoofd-parser → geeft een `walls`-array
  terug met `.projectInfo` eraan gehangen, `:1652-1653`), `scanIfcWallTypes()` (`:1054`),
  `parseIfcGridLines()` (`:1664`), `exportGroupsToIfc()` (`:1806`), `parseIfcZoneElements()`
  (`:2593`). **Up-as** wordt robuust gestemd in `detectModelUpAxis()` (`:544`) — bbox- +
  normaal-stemming, géén blinde Z-up-aanname; `forceOrientation` kan `X_NEG90`/`X_POS90`/
  `NONE`/`AUTO` forceren (`:544-558`). Openingen: `src/lib/openingDerivation.js`
  (`applyProjectedOpenings` `:327`, `detectUpRobust` `:109`).
- **Cladding-geometrie** — `src/lib/pattern.js` (steenstrip-verband). Hoofd-entry
  `buildFullGroupFacadePattern()` (`:288`); best-fit-variant `buildBestFitFacadePattern()`
  in `src/lib/facadePlane.js:198` (achter vlag `bestFitGroups`, default AAN). Beide worden
  in `App.jsx:3280-3282` aangeroepen. Halfsteens rij-opbouw: `buildRowPiecesForWidth()`
  (`src/lib/pattern.js:18`). Wegknippen rond openingen: `src/lib/geometry.js`
  (`openingXRangesAtY` `:17`, `polyXRangesAtY` `:1`) en `src/lib/panelization.js`
  (`buildFacadeZones` `:72`, `panelizeZone` `:460`).
- **State + IndexedDB** — `src/lib/storage.js` (zie §5). React-state leeft in
  `src/App.jsx` (single root component, ~6750 regels); groepen/instellingen worden
  geserialiseerd via `saveProjectState()` (`src/lib/storage.js:168`).
- **UI** — `src/App.jsx` (entry `App`, gemount in `src/main.jsx:12-16`). Lazy sub-views:
  `View2D`, `Werktekening`, `Uittrekstaat`, `WildverbandPanel`, `SlimFortWerktekening`,
  `DetailBoek` (`src/App.jsx:21-27`). Feature-vlaggen in `src/lib/featureFlags.js`
  (`newOpenings`, `bestFitGroups`, `openingUpAxisFix`, `selfContainedProjects`,
  `upAxisInherit` — via URL-param of localStorage).

> Let op: de "nieuwe IFC-engine" (`src/lib/ifcAdapter.js` →
> `adaptWallPlanesToBrickBoard` `:148`, en `src/lib/newEngineRunner.js`) is **niet
> bedraad** in App.jsx — expliciet "Phase 1 / contract test only"
> (`src/lib/ifcAdapter.js:143`). Het actieve pad is `parseIfc`.

---

## 4. Bestanden-kaart

Kern (paden relatief aan `c:/dev/brickboard/`):

- `src/main.jsx` — React-mountpunt; rendert `<App>` en registreert de service worker
  alleen buiten localhost (`src/main.jsx:6-9`).
- `src/App.jsx` — hoofd-UI en orkestratie: import, parse, groepen, settings, opslag, export.
- `src/Viewer3D.jsx` — 3D-weergave (r3f/three) van wanden + steenstrips.
- `src/View2D.jsx` — 2D-weergave.
- `src/Werktekening.jsx` / `src/SlimFortWerktekening.jsx` / `src/Uittrekstaat.jsx` /
  `src/DetailBoek.jsx` / `src/WildverbandPanel.jsx` — afgeleide werktekening-/staat-views.
- `src/lib/ifc.js` — web-ifc-laag: model openen, wanden/openingen/grids parsen, up-as
  detecteren, IFC-export.
- `src/lib/openingDerivation.js` — openingen projecteren op het gevelvlak.
- `src/lib/facadePlane.js` — best-fit gevelvlak voor (handmatige) groepen.
- `src/lib/pattern.js` — steenstrip-verband (halfsteens), rij-opbouw, groepspatroon.
- `src/lib/panelization.js` — gevelzones, panelisatie, mal-recepten (DXF/SVG/print).
- `src/lib/geometry.js` — laag-niveau poly/openings-clipping-helpers.
- `src/lib/adjacency.js` — wanden aan elkaar koppelen (aangrenzendheid, componenten).
- `src/lib/slimfort.js` / `src/lib/envelope.js` / `src/lib/wallDecomposition.js` /
  `src/lib/stitching.js` / `src/lib/production.js` — SlimFort-systeem: vlakken, envelope,
  wand-decompositie, hoek-stitching, productiedata.
- `src/lib/projectCoordinates.js` — IFC↔three coördinaten/oriëntatie, project-matrix,
  onthouden van laatste betrouwbare up-as.
- `src/lib/storage.js` — IndexedDB (zie §5).
- `src/lib/featureFlags.js` — feature-vlaggen (URL-param / localStorage).
- `src/lib/systemDefinitions.js` / `src/lib/battens.js` / `src/lib/detailGenerator.js` /
  `src/lib/detailGeometry.js` — materiaal-/systeem-catalogi en detailtekening-opbouw.
- `public/brickboard-a.ifc` — testmodel (zie §6).
- `public/web-ifc.wasm`, `public/web-ifc-mt.wasm`, `public/web-ifc-api-iife.js` — web-ifc
  runtime, geladen door `getApi()` (`src/lib/ifc.js:409`).
- `brickboard.bat` — dev-opstart (zie §2). `vite.config.js` — Vite + chunk-splitsing.

---

## 5. Datamodel & opslag

Bron: `src/lib/storage.js`.

**Database `ifc-planner`, versie 3** (`storage.js:1-2`), drie object-stores, **allemaal
`keyPath: 'id'`** (`storage.js:12-20`):

| Store | keyPath | Recordvorm | Geschreven door |
|---|---|---|---|
| `ifc-files` | `id` | `{ id, name, size, data: ArrayBuffer, savedAt }` | `saveIfcFile` (`:27-36`, id=`'last'`) + `saveSourceIfc` (`:101-108`, id=`bytesKey`) |
| `parsed-walls` | `id` | `{ id:'last', fileName, fileSize, walls, projectInfo, savedAt }` | `saveParsedWalls` (`:64-72`) |
| `project-state` | `id` | `{ id:'last', groups, groupLinks, cornerConfigs, settingsMap, ifcFileName, wallDimOverrides, allWalls, savedAt }` | `saveProjectState` (`:168-176`) |

Daarnaast een **aparte database `ifc-handles`, versie 1**, store `file-handles`
(`keyPath: 'id'`), voor het File-System-Access-handle (`storage.js:121-162`).

- **Singleton-sleutel.** De meeste records gebruiken de **vaste sleutel `id: 'last'`** —
  er is dus telkens één "laatste" file/walls/project. De **enige** uitzondering is
  `saveSourceIfc`, dat bron-IFC-bytes onder een **door de aanroeper gekozen `bytesKey`**
  in `ifc-files` zet (`storage.js:101-108`); `deleteSavedIfcFile` raakt alleen
  `id:'last'` (`storage.js:56-58`), zodat die bron-bytes onafhankelijk blijven staan.
- **Migratie-strategie.** `onupgradeneeded` maakt **alleen ontbrekende stores aan**
  (idempotent, `if (!contains) createObjectStore`, `storage.js:12-20`); er is **geen
  data-transformatie/migratiecode**. Het schema-versienummer is **3** (`storage.js:2`).

> ⚠️ **Correctie t.o.v. eerdere scaffold: de IndexedDB-sleutel is NIET de expressID.**
> De primaire sleutel is overal `id` (waarde `'last'` of een `bytesKey`), zie tabel.
> De **IFC `expressID`** is de **identiteit van een wand-element binnen de data**
> (`wall.expressID`), gebruikt voor groeperen/selecteren/overrides in de app-state
> (bv. `src/App.jsx:526, 565, 3219, 4050`) en bewaard binnen `walls[]` / `allWalls[]`.
> De harde regel "opgeslagen projecten / key = expressID nooit breken" slaat dus op het
> **niet breken van die element-identiteit in opgeslagen records**, niet op een
> IndexedDB-primary-key. **Niet aankomen.**

---

## 6. Testmodellen

- **`public/brickboard-a.ifc`** — het enige IFC-testbestand in de repo (ook gekopieerd
  naar `dist/brickboard-a.ifc` door de build). Herkomst: `copy-ifc.js` kopieert het uit
  een **echt projectbestand** `…/Documenten/BIL-MOO-A-ZZ-PBP.ifc` (OneDrive) naar
  `public/` (`copy-ifc.js:2-5`).
- **Niet auto-geladen.** De app fetcht `brickboard-a.ifc` nergens zelf (geen referentie in
  `src/App.jsx`); het wordt **handmatig via de bestandskiezer** geladen. Het dient als
  realistisch multi-element-projectmodel om import/parse handmatig te testen.

> **TODO ⬜** — wat dit model precies moet aantonen (Y-up vs Z-up, hoeken, openingen,
> losstaande dakrand-band) is **niet uit de code/repo af te leiden**. Vul in op basis van
> domeinkennis, of voeg gerichte fixture-modellen toe per scenario. Er zijn momenteel
> géén aparte fixtures per geval en géén geautomatiseerde IFC-tests (alleen
> `src/lib/__tests__/adapterSmokeTest.js` voor de niet-bedrade nieuwe engine).

---

## 7. Werkwijze (bindend)

1. **Splits elke taak** expliciet in **READ-ONLY DIAGNOSE/MEET** óf **FIX/FEATURE**.
   Zeg vooraf welke van de twee.
2. **Grenzen/risico** benoemen bij elke taak.
3. **Validatie-sectie** met **regressie-waakhond**: wat nu werkt mag niet veranderen.
   **Vlag-uit = geen diff.**
4. **Nieuw gedrag achter een feature-vlag**, default **UIT**. Met de vlag uit is het
   gedrag **byte-identiek** aan de huidige situatie.
5. **Wegwerpwerk** komt in `spike/`.
6. **Citeer `file:line`** bij elke bevinding.
7. **Rapporteer jip-en-janneke** met een **stoplicht**: 🟢 groen / 🟠 oranje / 🔴 rood.
8. **Nooit aan symptoombestrijding doen** — altijd de **oorzaak** uitzoeken en de
   oplossing op de oorzaak richten.
9. **Opgeslagen projecten nooit breken.** De **element-identiteit `wall.expressID`** in
   de opgeslagen `walls[]` / `allWalls[]` moet **stabiel en geldig** blijven — daarop
   steunen groeperen, selecteren en overrides (bv. `src/App.jsx:526, 565, 3219, 4050`).
   De **IndexedDB-primary-key is `id`** (waarde `'last'` of een `bytesKey`,
   `src/lib/storage.js:13,32,101-108`), níet de expressID. Migraties zijn opt-in en
   achterwaarts compatibel; bestaande records blijven leesbaar.

   > **Definitie (verwar deze twee nooit):**
   > • **DB-key = `id`** — de IndexedDB-primaire sleutel, vaste waarde `'last'` (of een
   >   `bytesKey`); identificeert *welk record* (laatste file/walls/project).
   > • **Element-identiteit = `wall.expressID`** — de IFC-expressID *binnen* een record;
   >   identificeert *welk wand-element* in de opgeslagen `walls[]`.
   > De bescherming geldt voor béíde, maar het zijn verschillende dingen.

---

## 8. Harde regels — geveltechniek (bindend)

1. **Up-as:** IFC kan **Y-up of Z-up** zijn. **Nooit Z-up aannemen** — detecteer de
   up-as robuust.
2. **Hoeken:** sluiten **stomp** aan, **zonder hoekstrippen**. **Eén gevelvlak gaat
   nooit de hoek om.**
3. **Bekleden:** bekleed het **doorlopende geveloppervlak**. Vul gaten **tússen**
   elementen, maar laat **echte openingen** (ramen/deuren) én de **open zone onder een
   losstaande dakrand-band** **onbekleed**.
4. **Verband:** horizontaal **halfsteens**.

---

## 9. Open punten / backlog

In het project staan twee losse notitiebestanden. **Let op:** deze gaan over fysieke
**lat-bekleding** (latten/firebarrier/schaven), niet over de steenstrip-engine —
mogelijk horen ze bij een fysiek bouwproject en niet bij deze codebase. Hier
geparkeerd ter herkenning; verwijder als ze niet bij brickboard horen.

- `ideeen_om_nog_op_te_pakken`: hoeken; latten op overlappen naar 70 mm en tussenlatten
  naar 45; de startlat met firebarrier behandelen.
- `ideen`: latten schaven om verdiepte vlakken te maken.

---

*Secties 2–6 zijn op 2026-06-05 geverifieerd tegen de echte repo (met `file:line`-citaten).
Eén openstaand punt: §6 — wat elk testmodel-scenario moet aantonen (TODO ⬜).
Secties 1, 7 en 8 komen uit de projectinstructie; §9 is herkennings-/backlog-notitie.*
