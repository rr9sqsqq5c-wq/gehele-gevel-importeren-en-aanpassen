# Entrypoints

## App.jsx — Hoofdcomponent (6726 regels)

**Locatie:** `src/App.jsx`

Centrale React-component. Bevat:
- State management voor `allWalls`, `groups`, `adjacencies`, `importEngine`
- `confirmImport()` — IFC-import-flow, kiest tussen `parseIfc` en `runNewEngineAdapter`
- `loadProjectState()` — herstel sessie bij opstarten (regel 4254)
- `[ImportEngine]` diagnostics log (regel 3936)

Lazy-loaded sub-views:
```js
const Viewer3D  = lazy(() => import('./Viewer3D.jsx'))
const View2D    = lazy(() => import('./View2D.jsx'))
const Werktekening   = lazy(() => import('./Werktekening.jsx'))
const Uittrekstaat   = lazy(() => import('./Uittrekstaat.jsx'))
const WildverbandPanel = lazy(() => import('./WildverbandPanel.jsx'))
const SlimFortWerktekening = lazy(() => import('./SlimFortWerktekening.jsx'))
const DetailBoek = lazy(() => import('./DetailBoek.jsx'))
```

## Viewer3D.jsx (1920 regels)

**Locatie:** `src/Viewer3D.jsx`

3D-visualisatie via `@react-three/fiber`. Bevat:
- `ifcToThree()` — coördinaat conversie IFC→Three.js (regel 27)
- `orientationModeToRotX()` — rotatie op basis van modus (regel 31)
- `detectUpAxis()` — detecteert up-axis uit `wallOrigin.heightAxis` (regel 42)
- `OpeningMesh` component — rendert openingen als 3D-lijnen + fill (regel 1155)
- `[OrientationVerify]` log per render (regel 1479)
- `[OpeningRender]` log per opening (regel 1163)
- Root group rotation via `rotX` (berekend via `orientationModeToRotX`)

## src/lib/ifc.js (2753 regels)

**Locatie:** `src/lib/ifc.js`

Legacy IFC parser. Bevat:
- `parseIfc(file, filter, onProgress, options)` — hoofdparser
  - Leest `IFCWALLSTANDARDCASE` / `IFCWALL`
  - Detecteert wandassen, dikte, opening via `IFCRELVOIDSELEMENT`
  - `onProgress({ phase: 'upaxis', ... })` voor up-axis debug
- `warmupWebIFC()` — prelaadt WASM
- `scanIfcWallTypes()` — scant typenamen
- `parseIfcGridLines()` — importeert stramienlijnen
- `resolveOutsideDirections()` — post-parse buitenzijde bepaling
- `runGeometryValidation()` — validatie na import

## src/lib/ifcAdapter.js (227 regels) — UNTRACKED

**Locatie:** `src/lib/ifcAdapter.js`

Adapter van nieuwe engine output (`WallPlane[]`) naar BrickBoard `Wall[]`. Bevat:
- `_deriveAxes(worldNormal)` — bepaalt lengthAxis/heightAxis/thicknessAxis
- `_bboxToCoords(bbox, axes)` — Three.js bbox → IFC-mm-coördinaten
- `_resolvedOutside(worldNormal, axes, coords)` — buiten-richting via worldNormal
- `adaptWallPlanesToBrickBoard(wallPlanes)` — hoofdfunctie

## src/lib/newEngineRunner.js (359 regels) — UNTRACKED

**Locatie:** `src/lib/newEngineRunner.js`

Drie fases:
- **Phase 1** `runNewEngine()` — stub, nog niet operationeel
- **Phase 2** `runWithSampleData(wallPlanes)` / `reportContractTest(wallPlanes)` — contract test met sample data
- **Phase 3** `inheritOpeningsForWalls(walls)` + `runNewEngineAdapter(file, filter, onProgress, options)`
  - Draait legacy `parseIfc` + post-process inheritance
  - `_isCoLocated(host, layer)` — geometrische match check
  - `_adjustOpening(opening, host, layer)` — opening-offset correctie
  - `[inheritOpeningsForWalls]` diagnostics log
  - `[InheritDiag]` debug log voor HSB_182.5 zonder openings

## src/lib/panelization.js

Panelisatie logica: zones, latten, panelen, DXF-generatie.

## src/lib/pattern.js

Steenpatronen: halfsteens, wildverband, symmetric, mirrored.

## src/lib/slimfort.js

SlimFort isolatie-elementen: grid, faces, corner trim.
