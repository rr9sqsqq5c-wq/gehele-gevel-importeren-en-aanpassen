# Openingsafleiding (stap 2) — de naad en de module-interface

Status: **achter een feature-flag**, standaard UIT. Het oude pad blijft de standaard.

## De naad (waar de input van de gevelgroepering vandaan komt)

De gevelgroepering en alles daarná (het bevroren contract, zie
`spike/contract.md`) krijgt zijn `walls[]` op één plek:

- `confirmImport()` in `src/App.jsx:3926` roept
  `runNewEngineAdapter(file, filter, onProgress, options)` aan.
- Het resultaat (`walls[]`) gaat direct in `detectAdjacenciesAsync(walls)`
  (`App.jsx:3934`) → `buildConnectedComponents` → `sortWallsInComponent`
  (`src/lib/adjacency.js:3,100,128`) en daarna de bekleding
  (`buildFullGroupFacadePattern`, `src/lib/pattern.js:288`).

`runNewEngineAdapter` staat in `src/lib/newEngineRunner.js:287`. Dat is de enige
plek die de afleiding aanstuurt. Daar zit nu de schakelaar:

```
if (isNewOpeningDerivation()) {            // src/lib/featureFlags.js
  return await deriveWallsWithProjection(file, filter, onProgress, options);
}
// anders: bestaand pad = parseIfc + inheritOpeningsForWalls (ongewijzigd)
```

Het contract (welke velden per wand/opening) is bevestigd t.o.v. `spike/contract.md`
en ongewijzigd. De nieuwe module produceert exact diezelfde vorm.

> Niet gewijzigd: de gevelgroepering, `pattern.js`, `Viewer3D`, de opslag. De
> merge-import (`confirmMergeImport`) loopt nog via het oude pad — zie "Open punten".

## De feature-flag

`src/lib/featureFlags.js` → `isNewOpeningDerivation()`. Standaard `false`.
Aanzetten zonder rebuild: `?newOpenings=1` in de URL of
`localStorage.setItem('newOpenings','1')`. De import-cache-sleutel
(`App.jsx:3900`) krijgt een `legacy`/`newOpenings`-tag, zodat oud en nieuw elkaars
cache niet hergebruiken.

## De module: `src/lib/openingDerivation.js`

Eén nieuw, op zichzelf staand bestand. Kernfuncties krijgen `(api, IFC, modelID)`
en zijn dus ook headless te testen (zie `spike/validate/stap2-core.mjs`).

| Export | Doel |
|---|---|
| `deriveWallsWithProjection(file, filter, onProgress, options)` | **Orchestrator (browser).** Skelet via `parseIfc` (zelfde wand-geometrie/`wallOrigin`/`expressID`), daarna openingen vervangen + NL-SfB-tag. Retour: `walls[]` in contractvorm. |
| `deriveOpeningsCore(api, IFC, modelID, hostIds, up)` | **Bron (1).** Leest void/fill-relaties; terugval op IfcWindow/IfcDoor **alleen als het model geen voids heeft**. Retour: `Map<hostExpressId, opening[]>`. |
| `projectElementOntoFrame` / `projectWorldPoints` | **Bron (3).** Projecteert de eigen vorm op het wandvlak → strakke 2D-omtrek + maat (mm, wand-lokaal). |
| `buildFrame(api, modelID, hostId, up)` | Wandframe: H = echte verticaal (model-up), L = langste horizontale wand-as, T = dikte. |
| `classifyNlsfbExterior(typeName)` + `NLSFB_EXTERIOR` | **Bron (2).** NL-SfB-codetabel (21=buiten, 22=binnen, …). Onbekende code → `isExterior=null`. **IsExternal wordt niet gebruikt.** |
| `detectUp(api, modelID, wallIds)` | Model-up-as (Z of Y) uit de wandmatrices. |

### Wat de module per wand/opening levert (contract)
- Wand: ongewijzigd `parseIfc`-skelet (`expressID`, `length`, `height`,
  `wallOrigin{lengthAxis,heightAxis,thicknessAxis,lengthStart,…}`) + nieuw additief
  `wallOrigin.nlsfbCode/nlsfbExterior/nlsfbSource`.
- Opening: `{ id (=expressID), type:'raam'|'deur'|'sparing', x, y, breedte, hoogte,
  polyPts:[{l,h}], thicknessCenter }` — `x/y/poly` wand-lokaal in mm.

### Regels die de module bewust NIET doet
- **Niet samenvoegen.** Elke opening wordt aan de juiste host gekoppeld in
  wand-lokale coördinaten. Het samenvoegen van openingen die over meerdere dunne
  host-banden lopen, doet de bestaande gevelgroepering/bekleding (`pattern.js`).
- **IsExternal niet gebruiken** (bleek onbetrouwbaar in de spikes).
- Na het vervangen van de openingen draait de module `resolveOutsideDirections`
  (B's eigen functie) opnieuw, zodat de buitenzijde met de nieuwe openingen klopt.

### expressID en opgeslagen projecten
Het skelet komt 1-op-1 uit `parseIfc`, dus de set wand-`expressID`'s is identiek aan
het oude pad. Opgeslagen projecten koppelen aan `expressID`
(`groups.wallIds`, `wallDimOverrides`, `settingsMap` per groep — zie
`spike/json-schema.md`), dus die blijven geldig.

## Open punten (zie ook docs/stap2-resultaat.md)
- Merge-import (`confirmMergeImport`) loopt nog via het oude pad.
- Eindvalidatie in de echte browser (flag aan, opgeslagen project herladen,
  multi-band visueel) is nog niet uitgevoerd.
