# Current Opening Flow

## Overzicht

Openingen (ramen, deuren, sparingen) worden in twee lagen verwerkt:
1. **Parse-fase** — IFC → opening objects via `IFCRELVOIDSELEMENT`
2. **Inheritance-fase** — openings kopiëren naar co-located wanden zonder openings

---

## Stap 1 — IFCRELVOIDSELEMENT (ifc.js)

```
IFC bestand
    ↓
api.GetLineIDsWithType(modelID, IFCRELVOIDSELEMENT)
    ↓
Per RelVoidsElement:
  RelatingBuildingElement  = wand-expressID (wallId)
  RelatedOpeningElement    = opening-expressID
    ↓
opening.type bepaald via:
  IFCWINDOW  → 'raam'
  IFCDOOR    → 'deur'
  anders     → 'sparing'
    ↓
Geometrie opgehaald:
  opening.x, opening.y     (positie in mm, relatief aan wand-lengthStart/heightStart)
  opening.breedte, hoogte  (afmetingen in mm)
  opening.polyPts[]        (optioneel, polygoon-punten)
    ↓
[OpeningData] log per wand
```

**Console log patroon:**
```
[OpeningData] {
  wallId: 53023,
  ifcExpressId: 53023,
  wallName: 'Basic Wall:21.10_WA_LB_HSB_272.5:26024971',
  ...
}
```

---

## Stap 2 — wallVoids / openings in Wall object

Na parse heeft elke `Wall` object:
```js
{
  expressID: number,
  name: string,
  typeName: string,          // bijv. '21.10_WA_LB_HSB_272.5'
  wallOrigin: {
    lengthAxis: 'x' | 'y',
    heightAxis: 'z',
    thicknessAxis: 'x' | 'y',
    lengthStart, lengthEnd,
    heightStart, heightEnd,
    thicknessStart, thicknessEnd,
    resolvedOutside: { outsideDir, outsidePos, source, confidence }
  },
  openings: [
    {
      id: string,
      type: 'raam' | 'deur' | 'sparing',
      x: number,             // mm vanaf lengthStart
      y: number,             // mm vanaf heightStart
      breedte: number,       // mm
      hoogte: number,        // mm
      polyPts: [{l,h}] | null,
      _source: 'ifc' | 'inherited',
      _inheritedFrom: number | undefined
    }
  ]
}
```

---

## Stap 3 — Inheritance (newEngineRunner.js)

Alleen actief bij `importEngine === 'legacy-inherited'`.

```
walls = parseIfc(...)          // stap 1+2 hierboven
    ↓
inheritOpeningsForWalls(walls)
    ↓
hosts = walls.filter(w => w.openings.length > 0)
    ↓
Per wand zonder openings:
  Per host wand:
    _isCoLocated(host, wall)?
      ✓ zelfde thicknessAxis / lengthAxis / heightAxis
      ✓ |thicknessMidDiff| ≤ 400 mm
      ✓ lengthOverlapRatio ≥ 0.50
      ✓ heightOverlapRatio ≥ 0.50
      → match!
    ✗ → geen match
    ↓
  bestHost = host met meeste openings
  inheritedOpenings = bestHost.openings.map(_adjustOpening)
    _adjustOpening:
      dL = host.wallOrigin.lengthStart - layer.wallOrigin.lengthStart
      dH = host.wallOrigin.heightStart - layer.wallOrigin.heightStart
      opening.x += dL
      opening.y += dH
      opening.id = `${orig.id}-inh-${layer.expressID}`
      opening._source = 'inherited'
    ↓
  wall.openings = inheritedOpenings
    ↓
[inheritOpeningsForWalls] log:
  'N openingen geërfd door M wanden van K hostwanden'
[InheritDiag] log:
  Per HSB_182.5 wand zonder match → top-5 kandidaten + rejectreden
```

**Rejectredenen:**
| Code | Reden |
|------|-------|
| A | Geen HSB_272.5 host met openings |
| B | Assen verschillen (thicknessAxis/lengthAxis mismatch) |
| C | thicknessMidDiff > 400 mm |
| D | lengthOverlapRatio < 0.50 |
| E | heightOverlapRatio < 0.50 |
| F | Onbekend |

---

## Stap 4 — OpeningMesh (Viewer3D.jsx)

```jsx
// src/Viewer3D.jsx regel 1155
function OpeningMesh({ wall, opening }) {
  const wo = wall.wallOrigin;
    ↓
  console.log('[OpeningRender]', {
    wallId, openingId, outsideDir, lengthAxis, heightAxis, thicknessAxis,
    thicknessStart, thicknessEnd, frontFace, backFace,
    openingX, openingY, openingWidth, openingHeight
  });
    ↓
  Geometrie:
    pts2d = polyPts (indien aanwezig) of rechthoek [x, y, breedte, hoogte]
    Per punt:
      ifc[wo.lengthAxis]    = wo.lengthStart + l
      ifc[wo.heightAxis]    = wo.heightStart + h
      ifc[wo.thicknessAxis] = backFace of frontFace
    ifcToThree(ifc.x, ifc.y, ifc.z)
    ↓
  Twee vlakken: backFace + frontFace
  Kleur: blauw (raam) / oranje (deur/sparing)
  Transparante fill + lijnkader
}
```

**Console log patroon:**
```
[OpeningRender] {
  wallId: 314517,
  openingId: 315547,
  outsideDir: {...},
  lengthAxis: 'y',
  heightAxis: 'z',
  ...
}
```

---

## Bekende Issue (reden voor inheritance-onderzoek)

`[ImportEngine]` log toont `inheritedOpeningCount: 0` bij `engine: 'legacy-inherited'`.

Dit betekent dat `inheritOpeningsForWalls()` wél wordt aangeroepen maar
`_isCoLocated()` **nul matches** oplevert. De `[InheritDiag]` logs bevatten de
specifieke rejectredenen per HSB_182.5 wand.

Vermoedelijke oorzaak: assen-mismatch (code B) of thickness-range overschrijding (code C).
