# Current Import Flow

## Engine keuze (App.jsx)

Er zijn twee actieve import-engines. Selectie via `importEngine` state:

```
importEngine === 'legacy-inherited'   → runNewEngineAdapter()
importEngine === (default)            → parseIfc()
```

---

## Flow A — Legacy Engine (default)

```
Gebruiker upload .ifc
       ↓
App.jsx: confirmImport()
       ↓
parseIfc(file, filter, onProgress, { forceOrientation })
  [src/lib/ifc.js]
       ↓
  warmupWebIFC() → web-ifc WASM geladen
  IFCWALLSTANDARDCASE + IFCWALL typen geladen
  Per wand:
    - _extractWallMatrix()       → flatTransformation matrix
    - _extractWallAxisCurve()    → start/end punt in IFC-mm
    - lengthAxis / heightAxis / thicknessAxis bepaald
    - IFCRELVOIDSELEMENT gelezen → openings[]
    - opening.type: 'raam' / 'deur' / 'sparing'
    - onProgress({ current, total })
  Globale post-pass:
    - resolveOutsideDirections() → resolvedOutside per wand
       ↓
Wall[] (BrickBoard formaat)
       ↓
saveParsedWalls() → IndexedDB cache
       ↓
[ImportEngine] log:
  engine: 'legacy'
  wallCount, openingCount, inheritedOpeningCount=0
       ↓
detectAdjacenciesAsync() → adjacenties
       ↓
setAllWalls(walls)  →  Viewer3D renders
```

---

## Flow B — Legacy + Inheritance (importEngine === 'legacy-inherited')

```
Gebruiker upload .ifc
       ↓
App.jsx: confirmImport()
       ↓
runNewEngineAdapter(file, filter, onProgress, { forceOrientation })
  [src/lib/newEngineRunner.js]
       ↓
  stap 1: parseIfc(...)          (zelfde als Flow A)
       ↓
  stap 2: inheritOpeningsForWalls(walls)
       ↓
    hosts = walls.filter(w => w.openings.length > 0)
    Per wand zonder openings:
      matchingHosts = hosts.filter(h => _isCoLocated(h, wall))
        _isCoLocated checks:
          - zelfde thicknessAxis, lengthAxis, heightAxis
          - |thicknessMidDiff| ≤ 400 mm
          - lengthOverlapRatio ≥ 0.5
          - heightOverlapRatio ≥ 0.5
      bestHost = host met meeste openings
      inheritedOpenings = bestHost.openings.map(_adjustOpening)
        _adjustOpening: offset op basis van (lengthStart, heightStart) verschil
        id: `${orig.id}-inh-${layer.expressID}`
        _source: 'inherited'
    [inheritOpeningsForWalls] log: N openingen geërfd
    [InheritDiag] log: HSB_182.5 wanden die NIET gematcht zijn (top-5 diagnose)
       ↓
Wall[] met geërfde openings
       ↓
[ImportEngine] log:
  engine: 'legacy-inherited'
  inheritedOpeningCount: N
       ↓
detectAdjacenciesAsync() → adjacenties
       ↓
setAllWalls(walls) → Viewer3D renders
```

---

## Flow C — Nieuwe Engine (Phase 1 stub, NIET actief)

```
runNewEngine(file, options)
  → gooit Error: 'Phase 1: new IFC engine not yet wired'
  [src/lib/newEngineRunner.js]
```

De echte nieuwe engine staat in worktree:
```
bouw-een-robuust-ifc-importsyste-cafc/frontend/src/ifc-engine/
```
Nog niet geïntegreerd.

---

## Cache

- `loadParsedWalls(cacheKey, fileSize)` → IndexedDB, snelle herstart
- `saveParsedWalls(cacheKey, fileSize, walls)` → opslaan na parse
- Cache key: combinatie van bestandsnaam + filter

## SessionState herstel (startup)

```
loadProjectState() [regel 4254 App.jsx]
  → als state.groups aanwezig: herstel groepen + instellingen
  → als niet: clean start
```
