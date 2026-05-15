# Analyse-rapport: Cross-Module Inconsistenties — MultiElementPlanner

**Datum**: 15 mei 2026  
**Scope**: Alle modules in `src/` en `src/lib/`  
**Bevindingen**: 4 kritieke bugs, 3 hoge inconsistenties, 4 middelhoge bevindingen, 3 lage bevindingen

---

## Samenvatting overzicht

| # | Prioriteit | Module(s) | Beschrijving |
|---|-----------|-----------|-------------|
| K-1 | 🔴 Kritisch | `pattern.js` | `buildSingleWallPattern` verkeerde lagenmaat bij staand_tegelverband |
| K-2 | 🔴 Kritisch | `pattern.js` | `buildCenteredFacePattern` gebruikt `steenW` dat niet bestaat |
| K-3 | 🔴 Kritisch | `ifc.js` | Penant strips IFC export altijd `steenH`, ook bij staand_tegelverband |
| K-4 | 🔴 Kritisch | `wallDecomposition.js` | `MIN_RETURN_WIDTH_MM` undefined → breedte-check nooit actief |
| H-1 | 🟠 Hoog | `View2D` vs `Werktekening` | Twee afwijkende latten Y-positioneringsimplementaties |
| H-2 | 🟠 Hoog | `Werktekening` | Zetwerk-clipping van latten ontbreekt |
| H-3 | 🟠 Hoog | `Werktekening` | SlimFort backing-check ontbreekt in `computeLatten` |
| M-1 | 🟡 Middel | `Viewer3D`, `Werktekening`, `ifc.js` | Penant hoogte-beperking door `maxHoogte` inconsistent |
| M-2 | 🟡 Middel | `panelization.js` vs `production.js` | Max paneelgewicht 50 kg vs 46 kg |
| M-3 | 🟡 Middel | `WildverbandPanel.jsx` | Eigen parameternamen, dubbele logica t.o.v. `pattern.js` |
| M-4 | 🟡 Middel | `View2D` vs `Werktekening` | `startLijn < 0` paneel-correctie alleen in View2D |
| L-1 | 🟢 Laag | `ifc.js`, `pattern.js`, `envelope.js` | Inconsistente opening veldnamen (`breedte` vs `width`) |
| L-2 | 🟢 Laag | `pattern.js` | `buildGroupPattern` verouderd maar nog aanwezig |
| L-3 | 🟢 Laag | `pattern.js` | `groupHeight` in return is eigenlijk de effectieve/geclipte hoogte |

---

## 🔴 Kritisch — Bugs die productieproblemen veroorzaken

---

### K-1. `buildSingleWallPattern` — verkeerde lagenmaat bij `staand_tegelverband`

**Locatie**: `src/lib/pattern.js:585`

```js
export function buildSingleWallPattern(wall, material, verband) {
  const { steenH, lint } = material;
  const lagenmaat = steenH + lint;   // ← BUG: altijd steenH + lint
```

Bij `staand_tegelverband` staat het steen rechtop; de lagenmaat is `steenL + lint`, niet `steenH + lint`. De functie `getLagenmaat()` verderop in hetzelfde bestand doet het **wel** correct:

```js
function getLagenmaat(material, verband) {
  if (verband === 'staand_tegelverband') return material.steenL + material.lint;
  return material.steenH + material.lint;
}
```

`buildSingleWallPattern` negeert `verband` volledig voor de lagenmaat. Gevolg: bij `staand_tegelverband` worden te veel rijen berekend (elke rij is maar 50+12=62 mm in plaats van 210+12=222 mm).

**Fix**: Vervang `const lagenmaat = steenH + lint;` door gebruik van `getLagenmaat(material, verband)`.

---

### K-2. `buildCenteredFacePattern` — niet-bestaand property `steenW`

**Locatie**: `src/lib/pattern.js:625`

```js
export function buildCenteredFacePattern(width, height, material, verband, rowOffset = 0) {
  const { steenL, steenH, steenW, lint, stoot } = material;
  if (verband === 'staand_tegelverband') {
    const lagenmaat = (steenW ?? steenH) + lint;   // ← BUG: steenW bestaat niet
```

Het standaard materiaalmodel heeft de velden `steenL`, `steenH`, `lint`, `stoot`. **`steenW` is nooit gedefinieerd** in het materiaalmodel, dus `steenW ?? steenH` evalueert altijd naar `steenH`. Dit geeft dezelfde fout als K-1: de lagenmaat wordt `steenH + lint` in plaats van `steenL + lint` bij staand_tegelverband.

**Fix**: Vervang `steenW ?? steenH` door `steenL` (staand = steen op zijn kant, hoogte = steenL).

---

### K-3. IFC export — penant strips altijd `steenH` extrusie

**Locatie**: `src/lib/ifc.js:1860`, `:1916`, `:1938`

```js
// regel 1860 — penant front strips
const bSolid = E(`IFCEXTRUDEDAREASOLID(#${bProf},#${sAx0},#${extDir},${r(material.steenH)})`);

// regel 1916 — penant linkerzijde strips
const lSolid = E(`IFCEXTRUDEDAREASOLID(#${lProf},#${sAx0},#${extDir},${r(material.steenH)})`);

// regel 1938 — penant rechterzijde strips
const rSolid = E(`IFCEXTRUDEDAREASOLID(#${rProf},#${sAx0},#${extDir},${r(material.steenH)})`);
```

De **gewone strip export** berekent de extrusie hoogte correct:

```js
const brickExtH = batchVerband === 'staand_tegelverband' ? batchMat.steenL : batchMat.steenH;
```

Maar penant strips (voor-, linker- en rechterzijde) gebruiken altijd `material.steenH`. Bij `staand_tegelverband` staat het steen rechtop en is de fysieke hoogte `steenL`.

**Fix**: Voeg een variabele `const penantBrickH = verband === 'staand_tegelverband' ? material.steenL : material.steenH;` toe en gebruik die op alle drie de locaties.

---

### K-4. `MIN_RETURN_WIDTH_MM` niet gedefinieerd in `wallDecomposition.js`

**Locatie**: `src/lib/wallDecomposition.js:2`, `:146`

```js
// Bovenaan het bestand — slechts één constante gedefinieerd:
const MIN_WALL_HEIGHT_MM = 50;

// Regel 146:
if (localWidth < MIN_RETURN_WIDTH_MM || localHeight < MIN_WALL_HEIGHT_MM) continue;
```

`MIN_RETURN_WIDTH_MM` is **nergens gedefinieerd** (geen import, geen const). In JavaScript is dit `undefined`. De vergelijking `localWidth < undefined` evalueert naar `false` (NaN-vergelijking), dus de minimale breedtecheck voor return walls heeft **nooit enig effect**.

**Fix**: Voeg `const MIN_RETURN_WIDTH_MM = 50;` toe bovenaan het bestand (of een andere zinvolle waarde).

---

## 🟠 Hoog — Functionele afwijkingen tussen modules

---

### H-1. Latten Y-positionering: twee afwijkende implementaties

**Locaties**: `src/View2D.jsx:128–241` vs `src/Werktekening.jsx:209–317`

Er zijn twee onafhankelijke implementaties voor dezelfde berekening. Ze genereren **verschillende lat-posities**:

| Aspect | View2D `allLatten` | Werktekening `computeLatten` |
|--------|-------------------|------------------------------|
| Y-snap | Snaps naar brick-rij-Y's via `brickTopsSet2d` | Geen snap, altijd `yr - latBreedte / 2` |
| Boven-lat | `latY = yr + lintHalf - latBreedte / 2` (boven lintvoeg) | `latY = yr - latBreedte / 2` (altijd) |
| Onder-lat | `latY = yr - lintHalf - latBreedte / 2` (onder lintvoeg) | `latY = yr - latBreedte / 2` (altijd) |

**Fix**: Extraheer de lat-berekening naar een gedeelde functie in `src/lib/` en gebruik die in beide componenten.

---

### H-2. Zetwerk-clipping van latten: aanwezig in View2D, afwezig in Werktekening

**Locatie**: `src/View2D.jsx:187–217` (aanwezig), `src/Werktekening.jsx:209–317` (afwezig)

In `View2D.jsx` worden horizontale latten bij zetwerk-openingen gesplitst. De `computeLatten` functie in `Werktekening.jsx` heeft **geen equivalente sectie**. Latten in de werktekening lopen door over het zetwerk heen.

**Fix**: Porteer de zetwerk-clipping logica naar `computeLatten` in `Werktekening.jsx`.

---

### H-3. SlimFort/aluminium backing: latten uitgesloten in View2D maar niet in Werktekening

**Locatie**: `src/View2D.jsx:130`, `src/Werktekening.jsx:210`

```js
// View2D.jsx — correct
if (!facadeData || !latten?.enabled || _bt === 'aluminium' || _bt === 'aluminium_slimfort') return [];

// Werktekening.jsx — ontbreekt de backing-check
if (!facadeData || !latten?.enabled) return [];
```

**Fix**: Voeg de `_bt === 'aluminium' || _bt === 'aluminium_slimfort'` check toe aan `computeLatten` in `Werktekening.jsx`.

---

## 🟡 Middel — Inconsistenties die productie of begrijpelijkheid beïnvloeden

---

### M-1. Penant hoogte en `maxHoogte`: inconsistente beperking

| Module | maxHoogte-beperking |
|--------|-------------------|
| `src/lib/ifc.js` (export) | ✅ `Math.min(pen.hoogte ?? 2000, maxHoogte)` |
| `src/Viewer3D.jsx:142` (`getPenantBoxes`) | ❌ `Math.max(1, penant.hoogte ?? 2000)` — geen beperking |
| `src/Werktekening.jsx:313` (`computeLatten`) | ❌ `Math.max(1, pen.hoogte ?? 2000)` — geen beperking |

**Fix**: Pas `maxHoogte`-beperking toe in Viewer3D en Werktekening.

---

### M-2. Maximaal paneelgewicht: 50 kg vs 46 kg

```js
// panelization.js
const maxKg = panelen?.maxKg ?? 50;  // standaard 50 kg

// production.js
const MAX_PANEL_WEIGHT_KG = 46;      // standaard 46 kg
```

**Fix**: Kies één waarde (46 of 50 kg) en exporteer als gedeelde constante.

---

### M-3. `WildverbandPanel.jsx` — geïsoleerde module met eigen parameternamen

Gebruikt `steen_breedte`, `steen_hoogte`, `stootvoeg_dikte`, `lintvoeg_dikte` in plaats van de standaard `steenL`, `steenH`, `stoot`, `lint`. Dubbele logica t.o.v. `pattern.js`.

**Fix**: Hergebruik functies uit `pattern.js` of voeg een adapter-laag toe.

---

### M-4. `startLijn < 0` paneel-correctie: alleen in View2D

**Locatie**: `src/View2D.jsx:121–124` (aanwezig), `src/Werktekening.jsx` (afwezig)

Bij negatieve `startLijn` (gevels die onder het nulpunt beginnen) toont de werktekening het onderste paneel met de verkeerde hoogte.

**Fix**: Porteer de `startLijn < 0` correctie naar `Werktekening.jsx`.

---

## 🟢 Laag — Codekwaliteit en latente risico's

---

### L-1. Opening veldnamen: `breedte`/`hoogte` vs `width`/`height`

IFC-parse output slaat openingen op als `breedte`/`hoogte`. De rest van de applicatie gebruikt `width`/`height` met fallback. Inconsistente API, latent risico bij nieuwe consumers.

### L-2. `buildGroupPattern` — verouderde functie nog aanwezig

`src/lib/pattern.js:237` exporteert `buildGroupPattern()`, een oudere patroon-bouwfunctie die `maxHoogte`, `startLijn`, `zetwerk` en `extendLeft`/`extendRight` negeert.

### L-3. `buildFullGroupFacadePattern` returnt `groupHeight: effectiveHeight`

De returnwaarde heet `groupHeight` maar bevat de **geclipte** hoogte na `maxHoogte`. De werkelijke architecturale hoogte is niet beschikbaar in het resultaat.
