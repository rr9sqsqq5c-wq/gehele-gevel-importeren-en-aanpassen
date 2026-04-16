# IFC Multi-Element Loader — Plan

## Aanpak
Breid `src/lib/ifc.js` uit met een nieuwe `loadWalls(file, onProgress?)` export.
De bestaande code (WebIFC initialisatie, BBox-berekening, parseIfc, export) blijft intact.

### [x] Step: Implementeer loadWalls in src/lib/ifc.js
- Kopieer bestaande `src/lib/ifc.js` van de referentiebranch als basis
- Voeg twee hulpfuncties toe: `getWallRotationFromMesh` en `getWallOriginFromMesh`
- Voeg `loadWalls(file, onProgress?)` toe die:
  - IFC-model opent via de bestaande `getApi()` + `api.OpenModel()`
  - Storey-map opbouwt via `IFCRELCONTAINEDINSPATIALSTRUCTURE` → `IFCBUILDINGSTOREY`
  - WallType-map opbouwt via `IFCRELDEFINESBYTYPE`
  - Alle `IfcWall` en `IfcWallStandardCase` elementen ophaalt
  - Per wand: BBox → afmetingen (lengte, hoogte, dikte in mm)
  - Per wand: GUID via `GlobalId`, naam via `Name`
  - Per wand: positie (x/y/z in mm) en rotatie (radialen) uit flat transformation matrix
  - Per wand: storey en typeName uit de opgebouwde maps
  - Retourneert array van genormaliseerde wandobjecten
