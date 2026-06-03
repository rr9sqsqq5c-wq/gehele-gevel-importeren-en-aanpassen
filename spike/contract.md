# spike/contract.md — Het datacontract dat A moet kunnen vullen

Read-only bevroren op basis van App B. Geen code gewijzigd.
Scope: alleen wat de **gevelgroepering** en de **gevelbekleding** lezen. Alles
vóór de groepering (IFC-parse, bbox-wandreconstructie, heuristische
openingdetectie) mag vervangen worden en staat dus NIET in het contract.

## A. Waar begint de gevelgroepering?

Keten (App B):

1. `detectAdjacencies(walls)` / `detectAdjacenciesAsync(walls)`
   — `src/lib/adjacency.js:3` en `:48`
2. `buildConnectedComponents(walls, adjacencies)` — `src/lib/adjacency.js:100`
3. `sortWallsInComponent(ids, walls, adjacencies)` — `src/lib/adjacency.js:128`
   Aangeroepen in `src/App.jsx:4290`, `:4296`, `:568`, `:3934`.

Daarna voedt de groep de bekleding:

4. `buildFullGroupFacadePattern(walls, material, verband, maxHoogte, zetwerk, _minHoogte, startLijn, …)`
   — `src/lib/pattern.js:288` (aangeroepen `App.jsx:3266`, `:4524`, `:4652`)
5. `buildGroupPattern(walls, adjacencies, material, verband, openingMode)`
   — `src/lib/pattern.js:237`
6. 3D-weergave/extra: `Viewer3D.jsx` (`getWallBox`, `getOutsideFaceInfo`,
   `OpeningMesh`) + `resolveOutsideDirections(walls)` — `src/lib/ifc.js:352`.

## B. Verplichte velden — PER WAND

Elk wand-object dat de groepering/bekleding in gaat (`walls[i]`):

| Veld | Type | Gelezen door (file:line) | Verplicht? |
|---|---|---|---|
| `expressID` | number | adjacency.js:29,101; pattern.js:282 (sleutel) | JA (uniek id) |
| `length` | number (mm) | adjacency.js:20-22; pattern.js:245,254,302 | JA |
| `height` | number (mm) | adjacency.js:22-23; pattern.js:255,304 | JA |
| `wallOrigin` | object | overal | JA |
| `wallOrigin.lengthAxis` | 'x'\|'y'\|'z' | adjacency.js:18; pattern.js:297,299 | JA |
| `wallOrigin.heightAxis` | 'x'\|'y'\|'z' | adjacency.js:18; pattern.js:298 | JA |
| `wallOrigin.thicknessAxis` | 'x'\|'y'\|'z' | adjacency.js:15-16 | JA |
| `wallOrigin.lengthStart` | number (mm) | adjacency.js:20-30; pattern.js:244-253,301-302,328 | JA |
| `wallOrigin.heightStart` | number (mm) | adjacency.js:22-39; pattern.js:248,256,303,329 | JA |
| `wallOrigin.thicknessStart` | number (mm) | adjacency.js:16,68 | JA |
| `wallOrigin.thicknessEnd` | number (mm) | Viewer3D.jsx:46,66,87; ifc.js outside-resolutie | JA (3D + buiten/binnen) |
| `wallOrigin.wallLengthDir` | {x,y,z} of null | ifc.js:128-161,196-208 (outside-resolutie) | aanbevolen |
| `wallOrigin.wallInsideThickDir` | -1\|0\|1 | ifc.js:123-126,250,259 | aanbevolen |
| `wallOrigin.matLayerSense` | 'POSITIVE'\|'NEGATIVE'\|null | ifc.js:250-256 | optioneel |
| `wallOrigin.matLayerSetDir` | string\|null | ifc.js:250-256 | optioneel |
| `wallOrigin.spaceBoundaryType` | 'EXTERNAL'\|'INTERNAL'\|null | ifc.js:121-126 | optioneel |
| `wallOrigin.resolvedOutside` | {outsideDir,outsidePos,…} | Viewer3D.jsx:67-68,89-90 | afgeleid (door `resolveOutsideDirections`) |
| `wallOrigin.isExterior` | bool | ifc.js:172 (interne wanden uitsluiten) | aanbevolen |
| `facadePoly` | [{l,h}] of null | Viewer3D.jsx:1030-1086 (3D silhouet) | optioneel |
| `typeName` | string\|null | App.jsx (UI/filter) | optioneel |
| `storeyID` | number\|null | ifc.js:1531 (overerving) | optioneel |
| `name` | string | UI/tooltip | optioneel |

Let op (cruciaal): alle coördinaten zijn **mm, in IFC-wereldframe**, uitgedrukt
via **as-labels** (`lengthAxis/heightAxis/thicknessAxis` = welke wereld-as is
lengte/hoogte/dikte). De viewer rekent dat naar Three om met `ifcToThree` =
`[x/1000, y/1000, z/1000]` en een aparte `projectMatrix` (true-north/up).
`heightStart/heightEnd` lopen langs de gekozen height-as (B kiest die per model
met een up-as-stem; in een Z-up model is height de Z-as).

## C. Verplichte velden — PER OPENING (`wall.openings[]`)

| Veld | Type | Gelezen door (file:line) | Verplicht? |
|---|---|---|---|
| `type` | 'raam'\|'deur'\|'sparing' | pattern.js:261,336; Viewer3D.jsx:1188 | JA (alleen raam/deur knippen bekleding, pattern.js:336-337) |
| `x` | number (mm, wand-lokaal langs lengthAxis) | pattern.js:331; Viewer3D.jsx:1180 | JA |
| `y` | number (mm, wand-lokaal langs heightAxis) | pattern.js:332; Viewer3D.jsx:1181 | JA |
| `breedte` (of `width`) | number (mm) | pattern.js:333; Viewer3D.jsx:1182 | JA |
| `hoogte` (of `height`) | number (mm) | pattern.js:334; Viewer3D.jsx:1183 | JA |
| `polyPts` | [{l,h}] wand-lokaal of null | pattern.js:338-341,421-435; Viewer3D.jsx:1185,1198 | aanbevolen (niet-rechthoekige sparing) |
| `thicknessCenter` | number (mm) of null | ifc.js:309-335 (buiten/binnen-validatie) | optioneel |
| `id` | number | Viewer3D.jsx:1164 (log/sleutel) | optioneel |

Belangrijk: `x/y` zijn **wand-lokaal**, gemeten vanaf `wallOrigin.lengthStart`
resp. `heightStart` (zie pattern.js:328-332: `wallOffsetX = lengthStart-groupMinX`,
opening absoluut = `wallOffsetX + op.x`). Minimaat: openingen <50 mm worden
genegeerd (pattern.js:335; ifc.js:1475).

## D. Slagingscriterium

A "vult het contract" als A, per wand die de groepering in gaat, kan leveren:
(1) de **verplichte** wand-velden in kolom "JA" van sectie B, en
(2) per opening de **verplichte** opening-velden in kolom "JA" van sectie C,
in hetzelfde frame (mm, IFC-wereld, as-labels) zodat `detectAdjacencies` en
`buildFullGroupFacadePattern` er zonder verdere conversie mee werken.

De "aanbevolen/optioneel" velden zijn nodig voor correcte buiten/binnen-zijde
en 3D, maar blokkeren de groepering zelf niet.
