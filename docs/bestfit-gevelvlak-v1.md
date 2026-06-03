# Feature v1 — handmatige groep → één best-fit, uitgelijnd gevelvlak (contour-volgend)

> **v1.1 (root-cause fix, up-as):** de up-as wordt niet langer uit de extents geraden
> (dat wisselde uAxis/tAxis om bij een hoger-dan-brede selectie → verticaal verband),
> maar komt nu uit de **robuuste model-up-as** (projectcontext / `detectModelUpAxis`).
> Zie het blok "v1.1 — up-as robuust" onderaan.


Achter feature-vlag `bestFitGroups` (default UIT). Geïsoleerd; vlag UIT = byte-identiek
gedrag. Geport uit de spikes (`spike/validate/coplanar-meet.mjs` + `bestfit-spike.mjs`).

## In gewone taal
Als je elementen **handmatig** groepeert en de vlag staat aan, worden ze als **één
recht, uitgelijnd gevelvlak** bekleed met een **doorlopend verband** — ongeacht type,
lengte-as of klein diepteverschil. De strippen liggen **alleen waar een element zit**
(de contour wordt gevolgd, geen omvattende rechthoek): gaten zoals de entree-zone
onder een dakrand-band blijven onbekleed. Liggen de gekozen elementen niet op één
vlak → je krijgt een **waarschuwing** (niets wordt stilletjes weggelaten).

## Footprint (welke bestanden/functies)
- **`src/lib/facadePlane.js`** (nieuw) — het recept:
  - `fitFacadePlane(members)` (`:39`): up-as uit de selectie (kleinste overall-extent
    van de twee niet-normaal-assen), normaal-as = dominante dunste as, best-fit offset
    = mediaan van de buitenvlakken, residu + co-facing-fractie + waarschuwingen.
  - `toVirtualWall` (`:103`) + `reprojectOpening` (`:89`): elk lid in het
    gemeenschappelijke vlak-frame (lengthAxis=t, heightAxis=up, thicknessAxis=normaal,
    offset = het vlak); openingen meegeprojecteerd.
  - `maskRowsToContours` (`:127`): **CONTOUR-MASKER** — knipt elke rij tot de unie van
    element-footprints; buiten een element → onbekleed.
  - `buildBestFitFacadePattern(...)` (`:158`): drop-in vervanger voor
    `buildFullGroupFacadePattern` met dezelfde returnvorm; bouwt het doorlopende
    verband (hergebruikt `buildFullGroupFacadePattern` → `buildRowPiecesForWidth`,
    `pattern.js:449`, dus geen `axisWalls`-filter `pattern.js:299`), past dan het
    contour-masker toe en zet `refWallOrigin` op het **gemeenschappelijke vlak**.
- **`src/lib/featureFlags.js`** — `isBestFitGroups()` (`:27`), default false
  (`?bestFitGroups=1` of localStorage).
- **`src/App.jsx`**:
  - `createGroup` markeert nieuwe handmatige groepen met `manual: true` (`:4381`).
  - `allPatterns` (`:3272-3275`): `useBestFit = isBestFitGroups() && group.manual` →
    dan `buildBestFitFacadePattern`, anders/of bij falen `buildFullGroupFacadePattern`
    (terugval). De rest van de pijplijn (batches → `GroupBricks3D`) is ongewijzigd; de
    strippen landen op het vlak via de `refWallOrigin` van het vlak.

## Hoe het werkt (gedrag)
1. **Best-fit vlak uit de selectie** — niet via de per-element zone-detectie (die viel
   voor de dakrand terug op 'z'); de up-as komt uit de selectie zelf.
2. **Projectie + contour-masker** — alle leden geprojecteerd; bekleedbaar masker =
   unie van element-footprints (geen omvattende rechthoek); openingen weggeknipt.
3. **Doorlopend, uitgelijnd verband** over het hele vlak; aangrenzende leden lopen in
   lijn door (één raster).
4. **Tolerantie** 50 mm; leden binnen tolerantie plat op het vlak.
5. **Waarschuwing** bij normalen >~15% afwijkend (co-facing) of residu > 50 mm.
6. **Losstaande dakrand**: best-fit op de selectie = eigen vlak; het masker bekleedt
   alleen de band.

## Validatie (`spike/validate/facadeplane-validate.mjs`, importeert de ECHTE module)
**Deel A — synthetisch (deterministisch), ALLE checks groen:**
- naad tussen aangrenzende leden bekleed → **doorlopend verband ✅**
- gat zonder element (wand-band) **onbekleed ✅** (contour gevolgd)
- dakrand-band spant het gat → daar wél bekleed ✅ (alleen waar element zit)
- raam-midden **uitgesneden ✅**
- `refWallOrigin` op het vlak (thicknessAxis=x, outsidePos=offset) ✅

**Deel B — echte BIL-buitengevel (één zijde, NL-SfB 21) + dakrand-voorzijde:**
- best-fit: nAxis=x, **uAxis=y**, tAxis=z; **residu 13 mm** (orde spike: 11 mm);
  coFacing 100%; geen waarschuwingen.
- pattern: 162 rijen, 20.965 stukken, 27,7 m × 10 m, op het gemeenschappelijke vlak.
- → **één doorlopend coplanair vlak met strippen op alle 74 leden ✅.**
- (Losse/te-brede selectie → residu 170 mm → **waarschuwing vuurt correct**, niets
  stil weggelaten.)

**Regressie-waakhond:**
- Vlag UIT: `useBestFit` is altijd false → exact `buildFullGroupFacadePattern` (oud
  pad). `manual:true` is dan een ongebruikt veld.
- Opgeslagen projecten: geladen groepen hebben geen `manual` → `manual===true` is
  false → oud pad. Keying op `expressID` ongemoeid. Auto-groepering
  (`detectAdjacencies`) onaangeroerd.
- `npm run build` **groen**.

## Stoplicht: 🟢 GROEN (v1)
De bewezen kopcasus werkt: handmatige groep van dakrand-voorzijde + wand → één
doorlopend coplanair gevelvlak (residu ~cm), contour gevolgd (gaten onbekleed),
losstaande dakrand = eigen vlak, en duidelijke waarschuwing bij niet-coplanaire
selecties. Vlag UIT = geen regressie.

## v1-beperkingen (bewust buiten scope)
- Het vlak wordt op een **globale as** uitgelijnd (de bewezen BIL-casus is
  axis-aligned). Een **geroteerde** gevel (normaal niet langs x/y/z) wordt benaderd;
  de co-facing/residu-waarschuwing dekt grove gevallen. Echte arbitraire-rotatie-
  rendering = later.
- ~~**Up-as** = kleinste overall-extent → faalt bij een hoge, smalle gevel~~
  **OPGELOST in v1.1** (model-up-as i.p.v. extents — zie onder).
- **Contour** = rechthoek per box-element (de meeste leden); geen echte veelhoek-
  contour (v2, "buitenhuid-voorstel" valt sowieso buiten v1).
- **IFC-export** (`buildFullGroupFacadePattern` op `App.jsx:4524/4652`) loopt nog op
  het oude pad; alleen de 3D-bekleding gebruikt het best-fit-pad. Onder de vlag kan de
  export dus afwijken van het scherm — bewust uitgesteld.
- **UI-waarschuwing**: de waarschuwing zit in `facadeData._bestFit.warnings` en gaat
  naar de console; een zichtbare badge in de UI is een kleine vervolgstap.

Validatie-artefact: `spike/validate/facadeplane-validate.mjs`.

---

# v1.1 — up-as robuust (root-cause fix verband-oriëntatie)

## In gewone taal
Het verband stond soms 90° gedraaid (verticaal). Oorzaak: de up-as werd geraden uit
de afmetingen ("een gevel is breder dan hoog"). Bij een selectie die hoger is dan
breed klopte dat niet en kantelde het verband. Nu pakken we de **echte up-as van het
model** (dezelfde die de scène rechtzet), dus het verband loopt altijd horizontaal —
ongeacht de vorm van de selectie.

## Oorzaak (bewezen, read-only diagnose)
`fitFacadePlane` koos up = niet-normaal-as met de **kleinste overall-extent**. Bij een
hoger-dan-brede selectie wisselde dat uAxis/tAxis om → rij-as langs de verticaal →
verticaal verband. `toVirtualWall` en de render waren correct; zij erfden de fout.

## Footprint (wijziging)
- **`src/lib/facadePlane.js`**:
  - `normalizeUpAxis()` (`:27`): model-up → wereld-as-letter (`z_neg`→`z`).
  - `fitFacadePlane(members, modelUpAxis)` (`:49`): **extent-heuristiek verwijderd**;
    `uAxis = model-up-as` (in het vlak), `tAxis` = de andere in-vlak-as (`:70-87`).
    - Guard (i) (`:77`): vlak-normaal == model-up-as → **bijna-horizontaal vlak** (dak/
      vloer) → **waarschuwing**, geen stille gok (gedegradeerde extent-fallback).
    - Guard (ii) (`:89-96`): leden met verschillende `wallOrigin.frameUpAxis` →
      **waarschuwing** (multi-frame; vuurt niet op één frame).
    - Geen model-up bekend → extent-fallback **mét waarschuwing**.
  - `buildBestFitFacadePattern(..., modelUpAxis)` (`:192`): nieuwe trailing-param;
    default leest `getProjectInfo().upAxis` uit de projectcontext (expliciete override
    voor headless). Forwardt naar `fitFacadePlane`.
- **`src/App.jsx`**: **onveranderd** — de call (`:3274`) geeft geen `modelUpAxis`, dus
  de default pakt automatisch `getProjectInfo().upAxis`. (Geen regressie-risico in
  App.jsx; vlag-uit blijft byte-identiek.)
- `toVirtualWall`, het contour-masker en de render: **niet aangeraakt** (bewezen
  correct; erven alleen uAxis/tAxis).

## Validatie (`spike/validate/facadeplane-validate.mjs` + diagnose-reproductie)
**Drie-vormen-tabel (model-up = y gevoed):**

| Selectie | extent v×h | resolved | rij-as | bond |
|---|---|---|---|---|
| BREED (y=10000, z=27700) | breed | uAxis=y, tAxis=z | z | **HORIZONTAAL ✅** (bleef goed) |
| HOOG/SMAL (y=10000, z=3000) | hoog | uAxis=y, tAxis=z | z | **HORIZONTAAL ✅** (was verticaal = de bug) |
| wand+dakrand smal (y=3610, z=4000) | ~vierkant | uAxis=y, tAxis=z | z | **HORIZONTAAL ✅** |

Alle drie → rij-as langs de horizontale in-vlak-as, ongeacht breedte/hoogte.

**Echt — BIL buitengevel + dakrand-voorzijde (Deel B):** nAxis=x, **uAxis=y**, tAxis=z;
**residu 13 mm onveranderd**; coFacing 100%; geen waarschuwing; horizontaal halfsteens
(groupWidth=27677 langs z, groupHeight=10000 langs y). Deel A: alle checks groen.

**Guards:** bijna-horizontaal vlak (model-up == normaal) → **waarschuwing vuurt**, geen
stille gok; mix `frameUpAxis` y+z → **waarschuwing vuurt** en uAxis blijft correct y;
geen model-up bekend → extent-fallback **met waarschuwing**.

**Regressie:** `npm run build` **groen** (746 ms). Vlag UIT → `buildBestFitFacadePattern`
wordt niet aangeroepen → byte-identiek. App.jsx ongewijzigd. Opgeslagen/auto-groepen
(geen `manual`) → oud pad.

---

# v1.2 — smalle constructievoegen overbruggen (contour-masker)

## In gewone taal
Op het gevelvlak zaten echte, smalle voegen (~40–45 mm) waar twee losse elementen
(dakrand-plaat ↔ HSB-wand) net niet tegen elkaar sluiten. Het strikte contour-masker
liet die als dunne onbeklede stroken staan. Nu laten we de strips **doorlopen over een
voeg ≤ 75 mm**, zodat het als één gevelvlak leest — **zonder ooit een echte opening
(raam/deur/entree, ≥ ~200 mm) te overbruggen**.

## Footprint (alleen het masker)
- **`src/lib/facadePlane.js`**:
  - `SEAM_MERGE_TOL = 75` (`:27`) — tunable; max horizontaal gat tussen footprints dat
    we dichten.
  - `maskRowsToContours` (`:165`): de horizontale interval-merge (`:179`) gebruikt nu
    `+ SEAM_MERGE_TOL` i.p.v. de oude touch-tolerantie (0,5 mm). Alleen **horizontale**
    samenvoeging langs de gevellengte; de verticale veld-vulling blijft buiten scope.
  - Volgorde ongewijzigd: footprints → **merge ≤75 mm** → openingen al uit de pieces.
- `fitFacadePlane`, `toVirtualWall`, `buildBestFitFacadePattern`, render: **onaangeroerd**.

## Validatie (`spike/validate/seam-merge-validate.mjs`, echte module)
- **Synthetisch:** 45 mm-voeg **overbrugd ✅**; 200 mm-opening **blijft open ✅**.
- **Echt BIL:** footprint-gaten langs z = **42, 43 mm** (beide ≤75); **75–200 mm grijs
  gebied: GEEN ✅** (schone scheiding voeg/opening); ná seam-merge **0 mm** lege
  volle-hoogte kolommen → beide ~40–45 mm voegen weg.
- **Regressie:** bestaande `facadeplane-validate.mjs` Deel A (1000 mm-gat) blijft
  **open ✅** (drempel overbrugt geen openingen); Deel B residu **13 mm** onveranderd.
  Vlag UIT → `maskRowsToContours` wordt niet aangeroepen → byte-identiek. App.jsx
  ongewijzigd; opgeslagen/auto-groepen → oud pad. `npm run build` **groen** (660 ms).

## Stoplicht v1.2: 🟢 GROEN
Echte smalle voegen (≤75 mm) lopen door als één vlak; openingen (≥200 mm) blijven open;
op BIL is de scheiding schoon (voegen ≤45 mm, geen 75–200 mm-gaten). Geen regressie.

---

# v1.3 — 2D en 3D uit één bron (single source of truth)

## In gewone taal
De 2D-gevel berekende de bekleding zélf (oud pad) en kreeg het best-fit-resultaat
nooit, dus de dakranden ontbraken in 2D terwijl 3D ze wél toonde. Nu leest 2D exact
dezelfde `facadeData` als 3D. Eén bron → 2D en 3D kunnen niet meer uiteenlopen.

## Oorzaak (bewezen)
`View2D` herberekende zelf via `buildFullGroupFacadePattern` (oud pad, `View2D.jsx:53-59`)
en kreeg nooit `allPatterns`. Daardoor miste 2D het best-fit-pad en filterde
`axisWalls` (`pattern.js:299`) de dakranden eruit.

## Footprint
- **`src/App.jsx`**:
  - `allPatterns` rekent nu ook in 2D-modus, zodat 2D niet leegloopt als de 3D-only
    "Patroon 3D"-toggle uit staat: `if (!showPattern && viewMode !== '2d') return {};`
    (`:3245`); `viewMode` toegevoegd aan de deps.
  - `View2D` krijgt de gedeelde bron mee:
    `facadeData={allPatterns[activeGroup.id]?.facadeData ?? null}` (`:6102`).
- **`src/View2D.jsx`**:
  - `facadeData` is nu een **prop** (`:25`); de eigen afleiding (useMemo +
    `buildFullGroupFacadePattern`) is **verwijderd** (`:53`). De strips/openingen/clip
    tekenen al in het facadeData-frame (0..groupWidth × 0..groupHeight, `:335`), dus
    best-fit-groepen renderen automatisch in het best-fit-vlak-frame.
  - `walls` blijft een prop voor wandcontour/outline-fallback; de `import` van
    `buildFullGroupFacadePattern` blijft (nog gebruikt door het zone-pad, `View2D.jsx:243`,
    consistent met `allPatterns`' zone-herberekening).

## Validatie (`spike/validate/2d-source-validate.mjs`, echte modules, BIL-gevel)
- **A. Vlag UIT — byte-identiek:** View2D-oude-args vs allPatterns-args →
  **18.550 stukken, 27200×9210, JSON-identiek ✅** (bron-wissel verandert 2D niet).
- **B. Vlag AAN — dakranden gedeeld:** best-fit = 20.195 stukken (**+1645**), hoogte
  **10000 mm** vs oud 9210 mm; strip-dekking **boven 9210 mm**: oud **0 mm** →
  best-fit **343.481 mm**. Dakranden zitten nu in de gedeelde bron en dus in 2D ✅.
- **Per constructie:** 2D en 3D lezen exact hetzelfde object
  `allPatterns[id].facadeData` → kunnen niet divergeren (incl. horizontaal verband en
  overbrugde voegen, die in dat object zitten).
- **Regressie:** geen tweede afleiding in 2D toegevoegd; opgeslagen projecten/
  auto-groepen ongemoeid (oud pad via vlag-uit); `npm run build` **groen** (723 ms).

## Stoplicht v1.3: 🟢 GROEN
2D leest dezelfde bron als 3D. Vlag UIT → byte-identiek; vlag AAN → dakranden
verschijnen in 2D op dezelfde positie/oriëntatie/omvang als 3D. Geen regressie.

---

## Stoplicht v1.1: 🟢 GROEN
De 90°-draai is bij de wortel weg: de up-as komt uit de robuuste model-context, niet
uit een extent-gok. Bond loopt horizontaal voor elke selectievorm; residu ~cm
onveranderd; duidelijke waarschuwingen i.p.v. stille gok bij rand-gevallen.
