# Auto

## Configuration
- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`

### [x] Step: Analyse — Cross-module consistentie rapport
- Alle modules gelezen: View2D, Viewer3D, Werktekening, WildverbandPanel, ifc.js, panelization.js, pattern.js, geometry.js, wallDecomposition.js, envelope.js, production.js
- 14 bevindingen (4 kritisch, 3 hoog, 4 middel, 3 laag) gedocumenteerd in `rapport.md`
- Akkoord van gebruiker ontvangen om K-1 t/m K-4 te fixen

### [x] Step: Fix kritische bugs K-1 t/m K-4

**K-1** — `pattern.js` `buildSingleWallPattern`: lagenmaat gebruikt nu `getLagenmaat(material, verband)` i.p.v. hardcoded `steenH + lint`. `isInOpening` call gebruikt nu `brickRowH` (steenL bij staand_tegelverband).

**K-2** — `pattern.js` `buildCenteredFacePattern`: `steenW` (niet-bestaand veld) verwijderd uit destructuring. Lagenmaat bij `staand_tegelverband` is nu `steenL + lint` i.p.v. `(steenW ?? steenH) + lint`.

**K-3** — `ifc.js` penant strips: alle drie de extrusie-aanroepen gebruiken nu `groupBrickExtH` (reeds correct berekend op regel 1361) i.p.v. hardcoded `material.steenH`.

**K-4** — `wallDecomposition.js`: `MIN_RETURN_WIDTH_MM` was al gedefinieerd op regel 1 in de huidige codebase. Geen aanpassing nodig.

### [x] Step: Fix hoge inconsistenties H-1, H-2, H-3

**H-1/H-2/H-3** — Gedeelde `computeHorizontalLatten` functie toegevoegd aan `panelization.js`:
- H-3: Guard op `aluminium` / `aluminium_slimfort` backing (was afwezig in Werktekening)
- H-1: Brick-top snapping (brickTopsSet + lintHalf offset) nu gedeeld voor beide views
- H-2: Zetwerk-clipping van latten nu gedeeld voor beide views

`View2D.jsx`: horizontale branch vervangen door aanroep naar `computeHorizontalLatten`. `groupSettings` toegevoegd aan dependency array van `allLatten` useMemo.

`Werktekening.jsx`: `computeLatten` krijgt `backingType` parameter, horizontale branch delegeert naar `computeHorizontalLatten` + post-processing (opening X-clipping via `openingXRangesAtY` + panel X-inset met `INSET=5`). Aanroep bijgewerkt met `groupSettings?.backingType ?? 'hout'`.

### [x] Step: SlimFort Detailboek professionalisering (Fase 1–7)

**Fase 1 — Export artifacts** (DetailBoek.jsx):
- Alle SVG `background: '#f8fafc'` → `background: '#fff'` (12 SVG-elementen)
- `DetailCard` `overflow: 'hidden'` verwijderd

**Fase 3 — Materiaalkleurenpalet** (systemDefinitions.js + DetailBoek.jsx):
- `MATERIAL_COLORS` volledig herschreven naar gedempte CAD-kleuren
- SlimFort EPS `#fef9c3`/`#fde68a`/`#fcd34d` → `#ece8d8`/`#ddd8c4`/`#c89438`
- `MaterialPatternDefs`: professionele arcering voor alle materiaaltypes
- `SlimFortOverlay` tong-kleur naar `#c89438`

**Fase 4 — Typografie/labels**:
- `LayerLabel` `rotate(-40)` verwijderd → horizontale tekst
- Substrate label `rotate(-40)` verwijderd → boven ConcreteSubstrate geplaatst

**Fase 6 — Keyplan** (DetailBoek.jsx):
- Nieuw: `SYS_BADGE` lookup (hout/aluminium/slimfort met kleur/bg/border)
- Nieuw: `KeyplanLegend` component met proportionele materiaalbalk + legendarij
- `TabKeyplan` volledig herschreven: architecturale kaarten met gekleurde topborder, metadata-rij, `KeyplanLegend`

**Fase 7 — Export stabiliteit**:
- `PRINT_STYLES` uitgebreid: `overflow: visible`, `svg { overflow: visible }`, `@media print { * { overflow: visible !important } }`
